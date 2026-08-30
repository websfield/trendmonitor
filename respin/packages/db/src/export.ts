import type { DbLike, TxLike } from "./db-like";
import { sql } from "drizzle-orm";
import type { BrainDoc } from "./brain-schema";
import type { OnboardingInput } from "./onboarding-schema";
import {
  CREATOR_DATA_REGISTRY,
  type CreatorDataEntry,
} from "./creator-data-registry";
import { CHECK } from "./brain-content";
import { ExportBusyError } from "./errors";
import {
  EVIDENCE_UNVERIFIED_ANNOTATION,
  claimsForHistory,
  replacementVersionFor,
} from "./brain-ops";
import {
  ProfileScope,
  type ProfileExportTable,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "./with-workspace";
import type { RunSlots } from "./run-slot";

export const EXPORT_EVIDENCE_UNVERIFIED = EVIDENCE_UNVERIFIED_ANNOTATION;
export const NO_RULES_RECORDED = "no rules recorded";
export const PLACEHOLDER_ABSENCE =
  "We could not point to a quote from your posts for this one, so we are not stating it. Confirm it as still unknown.";
/** Total lifetime of an app-facing export, including a client that never pulls. */
export const EXPORT_STREAM_DEADLINE_MS = 120_000;
/** A blocked database statement gets its own tighter ceiling inside that lifetime. */
export const EXPORT_DB_STATEMENT_TIMEOUT_MS = 15_000;

const EXPORT_READER_TABLES = new Set([
  "creator_profiles",
  "brain_docs",
  "onboarding_inputs",
  "onboarding_interview_drafts",
  "brain_activation_snapshots",
  "frameworks",
]);

export class ExportClassificationError extends Error {
  constructor(table: string) {
    super(`creator-data table '${table}' is export-included but has no scoped export reader`);
    this.name = "ExportClassificationError";
  }
}

/** Non-vacuity seam: the canonical exporter calls this before reading any row. */
export function assertExportRegistryReadable(
  registry: readonly CreatorDataEntry[] = CREATOR_DATA_REGISTRY
): void {
  for (const entry of registry) {
    if (entry.export.included && !EXPORT_READER_TABLES.has(entry.table)) {
      throw new ExportClassificationError(entry.table);
    }
  }
}

export type BrainExportAnnotation = {
  brainDocId: string;
  pointer: string;
  message: typeof EXPORT_EVIDENCE_UNVERIFIED;
};

export type BrainExportData = {
  schemaVersion: "respin.creator-export.v1";
  generatedAt: string;
  profileId: string;
  registry: { table: string; included: boolean; reason: string }[];
  tables: Record<string, unknown[]>;
  annotations: BrainExportAnnotation[];
};

export type BrainExportBundle = {
  data: BrainExportData;
  json: string;
  markdown: string;
};

type ReplacementMetadata = Pick<
  BrainDoc,
  "kind" | "version" | "createdAt" | "activatedAt"
>;

function evidenceAnnotations(
  docs: readonly BrainDoc[],
  inputs: readonly OnboardingInput[]
): BrainExportAnnotation[] {
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  const annotations: BrainExportAnnotation[] = [];
  for (const doc of docs) {
    const entries = Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : [];
    for (const raw of entries) {
      const entry =
        typeof raw === "object" && raw !== null
          ? (raw as Partial<SourceEvidenceEntry>)
          : {};
      const pointer = typeof entry.field === "string" ? entry.field : "(unknown claim)";
      const input = typeof entry.inputId === "string" ? inputById.get(entry.inputId) : undefined;
      const valid =
        input !== undefined &&
        typeof entry.quote === "string" &&
        typeof entry.startUtf16 === "number" &&
        Number.isInteger(entry.startUtf16) &&
        typeof entry.endUtf16 === "number" &&
        Number.isInteger(entry.endUtf16) &&
        entry.startUtf16 >= 0 &&
        entry.endUtf16 >= entry.startUtf16 &&
        entry.endUtf16 <= input.content.length &&
        input.content.slice(entry.startUtf16, entry.endUtf16) === entry.quote;
      if (!valid) {
        annotations.push({
          brainDocId: doc.id,
          pointer,
          message: EXPORT_EVIDENCE_UNVERIFIED,
        });
      }
    }
  }
  return annotations;
}

function emptyArrayPointers(value: unknown, pointer = ""): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [pointer || "/"];
    return value.flatMap((item, index) => emptyArrayPointers(item, `${pointer}/${index}`));
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    emptyArrayPointers(
      child,
      `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`
    )
  );
}

function markdownFor(
  data: BrainExportData,
  docs: readonly BrainDoc[],
  inputs: readonly OnboardingInput[]
): string {
  const lines = [
    "# Creator Brain export",
    "",
    "> This markdown file is a human-readable projection. The accompanying JSON is the complete registry-driven export and is the machine-readable record.",
    "",
    `Generated: ${data.generatedAt}`,
    "",
  ];
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  for (const doc of docs) {
    lines.push(`## ${doc.kind} — version ${doc.version} (${doc.status})`, "");
    lines.push(`Created: ${doc.createdAt.toISOString()}`);
    if (doc.supersededAt) {
      const replacement = replacementVersionFor(doc, docs);
      lines.push(
        replacement === null
          ? `Replaced: ${doc.supersededAt.toISOString()} (replacement version unavailable)`
          : `Replaced: ${doc.supersededAt.toISOString()} by version ${replacement}`
      );
    }
    lines.push("");
    let view;
    try {
      view = claimsForHistory(doc, inputById);
    } catch {
      lines.push(`- ${EXPORT_EVIDENCE_UNVERIFIED}`, "");
      continue;
    }
    for (const claim of view.claims) {
      lines.push(`### ${claim.pointer}`, "");
      if (claim.value === CHECK) {
        lines.push(PLACEHOLDER_ABSENCE, "");
      } else {
        lines.push(claim.value, "");
        if (claim.quote) lines.push(`> ${claim.quote}`, "");
        if (claim.evidenceAnnotation) lines.push(`> ${claim.evidenceAnnotation}`, "");
      }
    }
    for (const pointer of emptyArrayPointers(doc.content)) {
      lines.push(`### ${pointer}`, "", NO_RULES_RECORDED, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Registry-driven REQ-A04 export. It has no pause check: reading a creator's
 * own data remains available while writes are paused.
 */
export async function exportBrain(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  generatedAt = new Date()
): Promise<BrainExportBundle> {
  return withPreparedExport(db, scope, profileId, generatedAt, (data, docs, inputs) => ({
    data,
    json: JSON.stringify(data, null, 2),
    markdown: markdownFor(data, docs, inputs),
  }));
}

export type BrainExportFormat = "json" | "markdown";

/**
 * Complete bounded-memory export stream. App delivery consumes this iterable
 * directly; cancelling iteration cancels the producer transaction, releasing
 * both the workspace transaction lock and the optional global session slot.
 */
export async function openBrainExport(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  format: BrainExportFormat,
  runSlots?: RunSlots,
  generatedAt = new Date(),
  deadlineMs = EXPORT_STREAM_DEADLINE_MS
): Promise<AsyncIterable<string>> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
    throw new Error("Creator export deadline must be a positive integer.");
  }
  assertExportRegistryReadable();
  // Preflight the profile before the caller commits HTTP 200 headers. A
  // foreign profile must remain a typed 404-capable refusal, never a
  // successful response whose body aborts on first pull.
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  if (!runSlots) {
    return lazyExportIterable(
      () => createPagedExportStream(
        db,
        profileScope,
        profileId,
        format,
        generatedAt,
        deadlineMs
      ),
      undefined,
      deadlineMs
    );
  }
  const outcome = await runSlots.acquire(scope.workspaceId, 1, "export");
  if (!outcome.granted) throw new ExportBusyError();
  return lazyExportIterable(
    () =>
      createPagedExportStream(
        db,
        profileScope,
        profileId,
        format,
        generatedAt,
        deadlineMs
      ),
    () => outcome.lease.release(),
    deadlineMs
  );
}

/**
 * Format-selective delivery path: complete data, one representation. The
 * route should call this rather than materialising JSON and markdown together.
 */
export async function exportBrainFile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  format: BrainExportFormat,
  generatedAt = new Date()
): Promise<string> {
  return withPreparedExport(db, scope, profileId, generatedAt, (data, docs, inputs) =>
    format === "json" ? JSON.stringify(data, null, 2) : markdownFor(data, docs, inputs)
  );
}

async function withPreparedExport<T>(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  generatedAt: Date,
  render: (
    data: BrainExportData,
    docs: readonly BrainDoc[],
    inputs: readonly OnboardingInput[]
  ) => T
): Promise<T> {
  return db.transaction(async (tx) => {
    const profileScope = await ProfileScope.mint(tx, scope, profileId);
    await acquireWorkspaceExportLock(tx, scope);
    assertExportRegistryReadable();
    const readers: Record<string, () => Promise<unknown[]>> = {
      creator_profiles: profileScope.accessors.profile,
      brain_docs: profileScope.accessors.brainDocs,
      onboarding_inputs: profileScope.accessors.onboardingInputsForExport,
      onboarding_interview_drafts: profileScope.accessors.interviewDrafts,
      brain_activation_snapshots: profileScope.accessors.activationSnapshots,
      frameworks: profileScope.accessors.frameworks,
    };
    const tables: Record<string, unknown[]> = {};
    for (const entry of CREATOR_DATA_REGISTRY) {
      if (!entry.export.included) continue;
      const reader = readers[entry.table];
      if (!reader) throw new ExportClassificationError(entry.table);
      tables[entry.table] = await reader();
    }
    const docs = tables.brain_docs as BrainDoc[];
    const inputs = tables.onboarding_inputs as OnboardingInput[];
    const data: BrainExportData = {
      schemaVersion: "respin.creator-export.v1",
      generatedAt: generatedAt.toISOString(),
      profileId,
      registry: CREATOR_DATA_REGISTRY.map((entry) => ({
        table: entry.table,
        included: entry.export.included,
        reason: entry.export.reason,
      })),
      tables,
      annotations: evidenceAnnotations(docs, inputs),
    };
    return render(data, docs, inputs);
  });
}

async function acquireWorkspaceExportLock(
  tx: TxLike,
  scope: WorkspaceScope
): Promise<void> {
  const lockResult = await tx.execute(
    sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`export-workspace:${scope.workspaceId}`}, 0)) AS acquired`
  );
  const acquired = (
    lockResult as { rows: Array<{ acquired?: boolean }> }
  ).rows[0]?.acquired;
  if (acquired !== true) throw new ExportBusyError();
}

function createPagedExportStream(
  db: DbLike,
  profileScope: ProfileScope,
  profileId: string,
  format: BrainExportFormat,
  generatedAt: Date,
  deadlineMs: number
): AsyncIterable<string> {
  const channel = new TransformStream<string, string>(
    undefined,
    { highWaterMark: 1 },
    { highWaterMark: 1 }
  );
  const writer = channel.writable.getWriter();
  const producer = db.transaction(async (tx) => {
    // The JS deadline cancels backpressure. These server-side settings close
    // the other two ways a transaction can otherwise outlive it: a blocked
    // statement and an idle transaction whose client disappeared mid-stream.
    const statementTimeoutMs = Math.min(
      deadlineMs,
      EXPORT_DB_STATEMENT_TIMEOUT_MS
    );
    await tx.execute(sql`SELECT
      set_config('statement_timeout', ${String(statementTimeoutMs)}, true),
      set_config('idle_in_transaction_session_timeout', ${String(deadlineMs)}, true)`);
    const emit = (chunk: string) => writer.write(chunk);
    if (format === "json") {
      await streamJsonExport(tx, profileScope, profileId, generatedAt, emit);
    } else {
      await streamMarkdownExport(tx, profileScope, generatedAt, emit);
    }
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  void producer.then(
    () => writer.close(),
    (error) => writer.abort(error)
  ).catch(() => undefined);
  return readableExportIterable(channel.readable, producer);
}

function readableExportIterable(
  readable: ReadableStream<string>,
  producer: Promise<unknown>
): AsyncIterable<string> {
  let claimed = false;
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (claimed) throw new Error("A creator export stream can be consumed only once.");
      claimed = true;
      const reader = readable.getReader();
      let released = false;
      const releaseReader = () => {
        if (released) return;
        released = true;
        reader.releaseLock();
      };
      return {
        async next() {
          const result = await reader.read();
          if (result.done) releaseReader();
          return result;
        },
        async return() {
          try {
            await reader.cancel();
            return { done: true, value: undefined };
          } finally {
            releaseReader();
            // `reader.cancel()` only signals the TransformStream. The export
            // slot must remain held until Drizzle has observed the rejected
            // writer, rolled back the repeatable-read transaction, and
            // returned its query-pool connection.
            await producer.catch(() => undefined);
          }
        },
      };
    },
  };
}

/**
 * Single-consumer iterable whose producer is created only on first pull.
 * Calling `return()` before the first pull still releases the pre-acquired
 * session lease, which an async-generator `finally` cannot guarantee before
 * its body has started.
 */
function lazyExportIterable(
  createSource: () => AsyncIterable<string>,
  release: () => Promise<void> = async () => undefined,
  deadlineMs = EXPORT_STREAM_DEADLINE_MS
): AsyncIterable<string> {
  let source: AsyncIterator<string> | undefined;
  let claimed = false;
  let releasePromise: Promise<void> | undefined;
  let deadlineError: Error | undefined;
  let deadlineCleanup: Promise<void> | undefined;
  const timer = setTimeout(() => {
    deadlineError = new Error(
      "Creator export stream exceeded its bounded lifetime and was cancelled."
    );
    deadlineCleanup = closeSourceAndRelease();
    void deadlineCleanup.catch(() => undefined);
  }, deadlineMs);
  const releaseOnce = (): Promise<void> => {
    if (releasePromise) return releasePromise;
    if (timer !== undefined) clearTimeout(timer);
    // Assign before invoking the release callback so every concurrent path
    // (next/done, explicit return, and deadline cleanup) awaits the SAME
    // advisory-unlock operation instead of observing a boolean and returning
    // while the unlock is still in flight.
    releasePromise = Promise.resolve().then(release);
    return releasePromise;
  };
  const closeSourceAndRelease = async () => {
    try {
      await source?.return?.();
    } catch {
      // The body has already been abandoned. Cleanup still owns the producer
      // settlement and lease release; the fixed deadline error is what a
      // pending `next()` observes, never a driver/message-shaped exception.
    } finally {
      await releaseOnce();
    }
  };
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (claimed) throw new Error("A creator export stream can be consumed only once.");
      claimed = true;
      return {
        async next() {
          if (deadlineError) {
            await deadlineCleanup;
            throw deadlineError;
          }
          try {
            source ??= createSource()[Symbol.asyncIterator]();
            const result = await source.next();
            if (deadlineError) {
              await deadlineCleanup;
              throw deadlineError;
            }
            if (result.done) await releaseOnce();
            return result;
          } catch (error) {
            await releaseOnce();
            throw error;
          }
        },
        async return() {
          try {
            return source?.return
              ? await source.return()
              : { done: true, value: undefined };
          } finally {
            await releaseOnce();
          }
        },
      };
    },
  };
}

async function forEachExportPage(
  profileScope: ProfileScope,
  table: ProfileExportTable,
  tx: TxLike,
  visit: (rows: unknown[]) => Promise<void>
): Promise<void> {
  let offset = 0;
  for (;;) {
    const rows = await profileScope.accessors.exportPage(table, offset, tx);
    if (rows.length === 0) return;
    await visit(rows);
    offset += rows.length;
  }
}

function citedInputIds(docs: readonly BrainDoc[]): string[] {
  const ids = new Set<string>();
  for (const doc of docs) {
    const entries = Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : [];
    for (const raw of entries) {
      if (typeof raw !== "object" || raw === null) continue;
      const inputId = (raw as { inputId?: unknown }).inputId;
      if (typeof inputId === "string") ids.add(inputId);
    }
  }
  return [...ids];
}

async function inputsForDocs(
  profileScope: ProfileScope,
  docs: readonly BrainDoc[],
  tx: TxLike
): Promise<OnboardingInput[]> {
  return profileScope.accessors.onboardingInputsByIds(citedInputIds(docs), tx);
}

async function streamJsonExport(
  tx: TxLike,
  profileScope: ProfileScope,
  profileId: string,
  generatedAt: Date,
  emit: (chunk: string) => Promise<void>
): Promise<void> {
  const registry = CREATOR_DATA_REGISTRY.map((entry) => ({
    table: entry.table,
    included: entry.export.included,
    reason: entry.export.reason,
  }));
  await emit(
    `{"schemaVersion":"respin.creator-export.v1","generatedAt":${JSON.stringify(generatedAt.toISOString())},"profileId":${JSON.stringify(profileId)},"registry":${JSON.stringify(registry)},"tables":{`
  );
  let firstTable = true;
  for (const entry of CREATOR_DATA_REGISTRY) {
    if (!entry.export.included) continue;
    const table = entry.table as ProfileExportTable;
    await emit(`${firstTable ? "" : ","}${JSON.stringify(table)}:[`);
    firstTable = false;
    let firstRow = true;
    await forEachExportPage(profileScope, table, tx, async (rows) => {
      for (const row of rows) {
        await emit(`${firstRow ? "" : ","}${JSON.stringify(row)}`);
        firstRow = false;
      }
    });
    await emit("]");
  }
  await emit('},"annotations":[');
  let firstAnnotation = true;
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    const docs = rows as BrainDoc[];
    const inputs = await inputsForDocs(profileScope, docs, tx);
    for (const annotation of evidenceAnnotations(docs, inputs)) {
      await emit(`${firstAnnotation ? "" : ","}${JSON.stringify(annotation)}`);
      firstAnnotation = false;
    }
  });
  await emit("]}");
}

function replacementFromMetadata(
  doc: BrainDoc,
  versions: readonly ReplacementMetadata[]
): number | null {
  if (!doc.supersededAt) return null;
  const transition = doc.supersededAt.getTime();
  return (
    versions.find(
      (candidate) =>
        candidate.kind === doc.kind &&
        candidate.version > doc.version &&
        (candidate.createdAt.getTime() === transition ||
          candidate.activatedAt?.getTime() === transition)
    )?.version ?? null
  );
}

async function streamMarkdownExport(
  tx: TxLike,
  profileScope: ProfileScope,
  generatedAt: Date,
  emit: (chunk: string) => Promise<void>
): Promise<void> {
  await emit(
    `# Creator Brain export\n\n> This markdown file is a human-readable projection. JSON is the complete registry-driven machine-readable export.\n\nGenerated: ${generatedAt.toISOString()}\n\n`
  );
  const metadata: ReplacementMetadata[] = [];
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    for (const doc of rows as BrainDoc[]) {
      metadata.push({
        kind: doc.kind,
        version: doc.version,
        createdAt: doc.createdAt,
        activatedAt: doc.activatedAt,
      });
    }
  });
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    const docs = rows as BrainDoc[];
    const inputs = await inputsForDocs(profileScope, docs, tx);
    const inputById = new Map(inputs.map((input) => [input.id, input]));
    for (const doc of docs) {
      const lines = [`## ${doc.kind} — version ${doc.version} (${doc.status})`, ""];
      lines.push(`Created: ${doc.createdAt.toISOString()}`);
      if (doc.supersededAt) {
        const replacement = replacementFromMetadata(doc, metadata);
        lines.push(
          replacement === null
            ? `Replaced: ${doc.supersededAt.toISOString()} (replacement version unavailable)`
            : `Replaced: ${doc.supersededAt.toISOString()} by version ${replacement}`
        );
      }
      lines.push("");
      try {
        const view = claimsForHistory(doc, inputById);
        for (const claim of view.claims) {
          lines.push(`### ${claim.pointer}`, "");
          if (claim.value === CHECK) lines.push(PLACEHOLDER_ABSENCE, "");
          else {
            lines.push(claim.value, "");
            if (claim.quote) lines.push(`> ${claim.quote}`, "");
            if (claim.evidenceAnnotation) lines.push(`> ${claim.evidenceAnnotation}`, "");
          }
        }
      } catch {
        lines.push(`- ${EXPORT_EVIDENCE_UNVERIFIED}`, "");
      }
      for (const pointer of emptyArrayPointers(doc.content)) {
        lines.push(`### ${pointer}`, "", NO_RULES_RECORDED, "");
      }
      await emit(`${lines.join("\n").trimEnd()}\n\n`);
    }
  });
}
