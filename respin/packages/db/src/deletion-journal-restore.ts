// Phase 10b-1 Task 5.3 — the restore-side verifier for the external journal.
//
// A restore of the database restores the database's OWN account of what was
// deleted. That account is exactly the thing a deletion request must survive,
// so before any traffic is served the restored state is checked against the
// journal, which lives outside the backup and cannot be rolled back with it.
//
// Everything here FAILS CLOSED. There is no "probably fine" outcome: a
// duplicate logical key, a delete marker, a gap, a digest conflict, a wrong
// retention, an unreadable object or a database state ahead of the journal all
// refuse serving. That is the point — a restore that serves on a journal it
// could not verify has silently un-deleted someone.
import { createHash } from "node:crypto";

import {
  journalOperationPrefix,
  journalObjectKey,
  parseJournalObjectKey,
  JOURNAL_KEY_INFIX,
  type DeletionJournalConfig,
  type JournalListedVersion,
  type JournalVerifierTransport,
} from "./deletion-journal";
import {
  DELETION_GENESIS_STATE,
  DELETION_JOURNAL_RETAIN_MS,
  isLegalDeletionTransition,
} from "./deletion-lifecycle";
import {
  canonicalJournalPayload,
  journalReceiptDigest,
  type JournalTransitionRequest,
} from "./deletion-ports";
import {
  deletionOperationState,
  deletionScope,
  type DeletionOperationState,
  type DeletionScope,
} from "./lifecycle-schema";

/** Every refusal this verifier can render. Closed set; each one blocks serving. */
export const JOURNAL_CONFLICT_CODES = [
  "foreign_object",
  "duplicate_object_version",
  "delete_marker",
  "version_gap",
  "unreadable_object",
  "unparsable_payload",
  "checksum_mismatch",
  "encryption_missing",
  "lock_mode_mismatch",
  "retention_mismatch",
  "prior_digest_mismatch",
  "operation_id_mismatch",
  "database_ahead_of_journal",
  // Round-1 tenancy BLOCK 1. The digest chain proves the versions were written
  // in order by someone holding the writer credential. It does NOT prove they
  // describe a legal sequence of states, and the journal is the authority for
  // exactly that. Without these two, a `cancelled` appended after `erasing`
  // verified clean and planned `restore_access` — un-deleting a creator whose
  // irreversible erasure had already run.
  "state_discontinuity",
  "cancellation_after_erasure",
  // Round-2 tenancy BLOCK. The two checks above guard the INSTANCE the round-1
  // probe used; they cannot see a chain that BEGINS mid-lifecycle, because at
  // version 1 there is no previous state and no seen state. A single object
  // declaring `erasing -> cancelled` therefore verified clean and planned
  // `restore_access` — easier to forge than the case that was fixed, since a
  // fresh operation id needs no prior receipt digest at all.
  "illegal_transition",
  "invalid_chain_genesis",
] as const;

export type JournalConflictCode = (typeof JOURNAL_CONFLICT_CODES)[number];

export type JournalConflict = Readonly<{
  code: JournalConflictCode;
  key: string;
  versionId: string | null;
  detail: string;
}>;

export type VerifiedJournalRecord = Readonly<{
  operationId: string;
  version: number;
  record: JournalTransitionRequest;
  objectKey: string;
  objectVersionId: string;
  checksumSha256: string;
  receiptDigest: string;
}>;

export type JournalOperationChain =
  | Readonly<{
      outcome: "verified";
      operationId: string;
      records: readonly VerifiedJournalRecord[];
      latest: VerifiedJournalRecord;
    }>
  | Readonly<{
      outcome: "conflict";
      operationId: string;
      conflicts: readonly JournalConflict[];
    }>;

// The state and scope populations come from the schema enums themselves, not
// from a hand-maintained list here: a state added to the enum without a home in
// the replay plan must break the build, not slip through as "unknown".
const VALID_STATES = new Set<string>(deletionOperationState.enumValues);
const VALID_SCOPES = new Set<string>(deletionScope.enumValues);

/**
 * Once an operation has entered any of these, irreversible work has begun and
 * a cancellation can never be legitimate (plan C2: cancellation is available
 * during grace, and `erasing` is the point of no return).
 *
 * This is an explicit enumeration, not a scan of "states that look irreversible"
 * — CLAUDE.md non-negotiable 7. A state added to the enum that is also a point
 * of no return is a LIST EDIT here, and the exhaustiveness test over
 * `deletionOperationState.enumValues` is what surfaces the new member.
 */
export const IRREVERSIBLE_STATES: readonly DeletionOperationState[] = [
  "erasing",
  "verifying",
  "complete",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject any spelling that is not the exact ISO string we serialise, so a
  // payload cannot smuggle a different instant past a lenient Date parser.
  return parsed.toISOString() === value ? parsed : null;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

/**
 * Parse a stored object back into a request, then prove the parse by
 * re-serialising it and comparing bytes. The round trip is the whole check: it
 * catches a missing field, an extra field, a reordered field and a retyped
 * field in one comparison, which a field-by-field validator does not.
 */
export function parseJournalRecord(body: string): JournalTransitionRequest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !isRecord(raw.target)) return null;

  const requestedAt = asIsoDate(raw.requestedAt);
  const effectiveAt = asIsoDate(raw.effectiveAt);
  const retainUntil = asIsoDate(raw.retainUntil);
  const userId = asNullableString(raw.target.userId);
  const workspaceId = asNullableString(raw.target.workspaceId);
  const profileId = asNullableString(raw.target.profileId);
  const priorReceiptDigest = asNullableString(raw.priorReceiptDigest);

  if (
    raw.schemaVersion !== 1 ||
    typeof raw.operationId !== "string" ||
    typeof raw.scope !== "string" ||
    !VALID_SCOPES.has(raw.scope) ||
    typeof raw.requesterDigest !== "string" ||
    typeof raw.version !== "number" ||
    !Number.isInteger(raw.version) ||
    raw.version < 1 ||
    typeof raw.fromState !== "string" ||
    !VALID_STATES.has(raw.fromState) ||
    typeof raw.toState !== "string" ||
    !VALID_STATES.has(raw.toState) ||
    typeof raw.payloadHash !== "string" ||
    priorReceiptDigest === undefined ||
    userId === undefined ||
    workspaceId === undefined ||
    profileId === undefined ||
    requestedAt === null ||
    effectiveAt === null ||
    retainUntil === null
  ) {
    return null;
  }

  const request: JournalTransitionRequest = {
    schemaVersion: 1,
    operationId: raw.operationId,
    scope: raw.scope as DeletionScope,
    target: { userId, workspaceId, profileId },
    requesterDigest: raw.requesterDigest,
    version: raw.version,
    fromState: raw.fromState as DeletionOperationState,
    toState: raw.toState as DeletionOperationState,
    payloadHash: raw.payloadHash,
    priorReceiptDigest,
    requestedAt,
    effectiveAt,
    retainUntil,
  };

  return canonicalJournalPayload(request) === body ? request : null;
}

/**
 * Verify one operation's chain from its listed versions and their bodies.
 *
 * Pure: the caller supplies what the store returned, so this is testable
 * against planted damage without a store at all.
 */
export function verifyJournalChain(input: {
  config: DeletionJournalConfig;
  operationId: string;
  listed: readonly JournalListedVersion[];
  read: ReadonlyMap<string, { body: string; checksumSha256: string | null; serverSideEncryption: string | null; objectLockMode: string | null; objectLockRetainUntil: Date | null } | { unreadable: string }>;
}): JournalOperationChain {
  const { config, operationId } = input;
  const conflicts: JournalConflict[] = [];
  const push = (code: JournalConflictCode, key: string, versionId: string | null, detail: string) =>
    conflicts.push({ code, key, versionId, detail });

  // 1. Exactly one object version per logical key, and no delete markers.
  const byKey = new Map<string, JournalListedVersion[]>();
  for (const entry of input.listed) {
    const parsed = parseJournalObjectKey(config, entry.key);
    if (parsed === null) {
      push("foreign_object", entry.key, entry.versionId, "key is not a journal object of this environment");
      continue;
    }
    if (parsed.operationId !== operationId) {
      push("operation_id_mismatch", entry.key, entry.versionId, `key belongs to operation ${parsed.operationId}`);
      continue;
    }
    if (entry.isDeleteMarker) {
      push("delete_marker", entry.key, entry.versionId, "a delete marker hides a journal version");
      continue;
    }
    const bucket = byKey.get(entry.key);
    if (bucket) bucket.push(entry);
    else byKey.set(entry.key, [entry]);
  }

  for (const [key, entries] of byKey) {
    if (entries.length > 1) {
      push(
        "duplicate_object_version",
        key,
        entries.map((e) => e.versionId).join(","),
        `${entries.length} object versions share one logical key — split authority`
      );
    }
  }

  // 2. Contiguous versions 1..N, no gaps.
  const versionNumbers = [...byKey.keys()]
    .map((key) => parseJournalObjectKey(config, key)?.version)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);

  for (let expected = 1; expected <= versionNumbers.length; expected += 1) {
    if (versionNumbers[expected - 1] !== expected) {
      push(
        "version_gap",
        journalObjectKey(config, operationId, expected),
        null,
        `version ${expected} is absent; the chain jumps to ${versionNumbers[expected - 1] ?? "nothing"}`
      );
      break;
    }
  }

  // 3. Each object reads, checksums, is encrypted, is locked, and chains.
  const records: VerifiedJournalRecord[] = [];
  let priorDigest: string | null = null;
  let previousToState: DeletionOperationState | null = null;
  const seenStates: DeletionOperationState[] = [];

  for (const version of versionNumbers) {
    const key = journalObjectKey(config, operationId, version);
    const listed = byKey.get(key)?.[0];
    if (!listed) continue; // already reported as a gap
    const object = input.read.get(`${key}#${listed.versionId}`);

    if (!object) {
      push("unreadable_object", key, listed.versionId, "no body was supplied for this version");
      continue;
    }
    if ("unreadable" in object) {
      push("unreadable_object", key, listed.versionId, object.unreadable);
      continue;
    }

    // Two encodings of one digest: S3 stores and echoes base64; the domain
    // receipt (`journalRequestChecksum`, `journalReceiptDigest`) is hex.
    const bodyDigest = createHash("sha256").update(object.body, "utf8");
    const actualBase64 = bodyDigest.copy().digest("base64");
    const actualHex = bodyDigest.digest("hex");
    if (object.checksumSha256 !== actualBase64) {
      push(
        "checksum_mismatch",
        key,
        listed.versionId,
        `stored checksum ${object.checksumSha256 ?? "(none)"} does not cover the stored bytes`
      );
      continue;
    }
    if (object.serverSideEncryption !== "AES256") {
      push("encryption_missing", key, listed.versionId, `server-side encryption is ${object.serverSideEncryption ?? "(none)"}`);
    }
    if (object.objectLockMode !== "COMPLIANCE") {
      push("lock_mode_mismatch", key, listed.versionId, `object lock mode is ${object.objectLockMode ?? "(none)"}`);
    }

    const record = parseJournalRecord(object.body);
    if (record === null) {
      push("unparsable_payload", key, listed.versionId, "the stored bytes are not a canonical journal record");
      continue;
    }
    if (record.operationId !== operationId || record.version !== version) {
      push(
        "operation_id_mismatch",
        key,
        listed.versionId,
        `payload names operation ${record.operationId} version ${record.version}`
      );
      continue;
    }

    const expectedRetain = record.requestedAt.getTime() + DELETION_JOURNAL_RETAIN_MS;
    if (record.retainUntil.getTime() !== expectedRetain) {
      push("retention_mismatch", key, listed.versionId, "payload retain-until is not the request's day-28 timestamp");
    }
    if (
      object.objectLockRetainUntil === null ||
      object.objectLockRetainUntil.getTime() !== record.retainUntil.getTime()
    ) {
      push(
        "retention_mismatch",
        key,
        listed.versionId,
        `object lock retains until ${object.objectLockRetainUntil?.toISOString() ?? "(none)"}, payload says ${record.retainUntil.toISOString()}`
      );
    }

    // The transition itself must be one the lifecycle would ever perform. This
    // is the SAME `TRANSITIONS` table the write path asserts against
    // (`assertDeletionTransition`), reached through a predicate so the verifier
    // can collect conflicts instead of throwing — one authority, not a second
    // hand-rolled subset.
    if (!isLegalDeletionTransition(record.fromState, record.toState)) {
      push(
        "illegal_transition",
        key,
        listed.versionId,
        `version ${version} claims "${record.fromState}" -> "${record.toState}", which the deletion state machine never performs`
      );
    }
    // Genesis. An honest version 1 always starts at `requested`, because the
    // version is `operation.journalVersion + 1` and a new operation row
    // defaults to `requested`. Anything else is a chain invented mid-history.
    if (version === 1 && record.fromState !== DELETION_GENESIS_STATE) {
      push(
        "invalid_chain_genesis",
        key,
        listed.versionId,
        `version 1 starts at "${record.fromState}"; an operation's first journalled transition always leaves "${DELETION_GENESIS_STATE}"`
      );
    }
    // Continuity: version N must start where version N-1 ended. A chain that
    // jumps states is describing two different histories.
    if (previousToState !== null && record.fromState !== previousToState) {
      push(
        "state_discontinuity",
        key,
        listed.versionId,
        `version ${version} starts at "${record.fromState}" but version ${version - 1} ended at "${previousToState}"`
      );
    }
    // A cancellation can never follow irreversible work. This is the finding
    // that would otherwise hand access back on a completed erasure.
    if (
      record.toState === "cancelled" &&
      seenStates.some((state) => IRREVERSIBLE_STATES.includes(state))
    ) {
      push(
        "cancellation_after_erasure",
        key,
        listed.versionId,
        `version ${version} cancels an operation whose chain already reached ${seenStates.filter((state) => IRREVERSIBLE_STATES.includes(state)).join(", ")} — irreversible work had already begun`
      );
    }

    if (record.priorReceiptDigest !== priorDigest) {
      push(
        "prior_digest_mismatch",
        key,
        listed.versionId,
        `version ${version} chains to ${record.priorReceiptDigest ?? "(none)"}, but version ${version - 1} receipt is ${priorDigest ?? "(none)"}`
      );
    }

    const receiptDigest = journalReceiptDigest(record, {
      objectKey: key,
      objectVersionId: listed.versionId,
      checksumSha256: actualHex,
    });
    records.push({
      operationId,
      version,
      record,
      objectKey: key,
      objectVersionId: listed.versionId,
      checksumSha256: actualHex,
      receiptDigest,
    });
    priorDigest = receiptDigest;
    previousToState = record.toState;
    seenStates.push(record.toState);
  }

  if (conflicts.length > 0 || records.length === 0) {
    return {
      outcome: "conflict",
      operationId,
      conflicts:
        conflicts.length > 0
          ? conflicts
          : [
              {
                code: "version_gap",
                key: journalOperationPrefix(config, operationId),
                versionId: null,
                detail: "the operation has no verifiable journal version",
              },
            ],
    };
  }

  return {
    outcome: "verified",
    operationId,
    records,
    latest: records[records.length - 1] as VerifiedJournalRecord,
  };
}

/** Read one operation's chain out of a real (or fake) verifier transport. */
export async function loadJournalChain(
  transport: JournalVerifierTransport,
  config: DeletionJournalConfig,
  operationId: string
): Promise<JournalOperationChain> {
  const listed = await transport.listVersions(
    config.bucket,
    journalOperationPrefix(config, operationId)
  );
  const read = new Map<
    string,
    | { body: string; checksumSha256: string | null; serverSideEncryption: string | null; objectLockMode: string | null; objectLockRetainUntil: Date | null }
    | { unreadable: string }
  >();
  for (const entry of listed) {
    if (entry.isDeleteMarker) continue;
    const result = await transport.getObjectVersion(config.bucket, entry.key, entry.versionId);
    read.set(
      `${entry.key}#${entry.versionId}`,
      result.outcome === "read"
        ? {
            body: result.body,
            checksumSha256: result.checksumSha256,
            serverSideEncryption: result.serverSideEncryption,
            objectLockMode: result.objectLockMode,
            objectLockRetainUntil: result.objectLockRetainUntil,
          }
        : { unreadable: result.code }
    );
  }
  return verifyJournalChain({ config, operationId, listed, read });
}

/** Enumerate every operation the journal holds for this environment. */
export async function listJournalOperationIds(
  transport: JournalVerifierTransport,
  config: DeletionJournalConfig
): Promise<readonly string[]> {
  // Round-1 (all three gates): this listed `${environment}/`, which the IAM
  // templates' `StringLike s3:prefix = "<ENVIRONMENT>/deletion-journal/*"`
  // condition does not match — so the FIRST call of both operator scripts would
  // have died on AccessDenied, after the bucket, lock and policy digest were
  // already committed. Narrowing here is the better half of the fix: it matches
  // the granted prefix and stops the enumerator scanning unrelated keys.
  const listed = await transport.listVersions(
    config.bucket,
    `${config.environment}/${JOURNAL_KEY_INFIX}/`
  );
  const ids = new Set<string>();
  for (const entry of listed) {
    const parsed = parseJournalObjectKey(config, entry.key);
    if (parsed) ids.add(parsed.operationId);
  }
  return [...ids].sort();
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export const JOURNAL_REPLAY_ACTIONS = [
  "reapply_tombstone",
  "replay_erasure",
  "restore_access",
  "operator_required",
] as const;

export type JournalReplayAction = (typeof JOURNAL_REPLAY_ACTIONS)[number];

/**
 * What the restore must do about one operation, derived from its latest
 * VERIFIED journal state — never from the restored database, which is the
 * record the journal exists to overrule.
 *
 * The mapping is exhaustive over the state enum on purpose: adding a state
 * without deciding its restore behaviour is a compile error, not a silent
 * `restore_access`.
 */
export function journalReplayAction(state: DeletionOperationState): JournalReplayAction {
  switch (state) {
    // A request exists and the journal proves it. Fence first, ask later.
    case "requested":
    case "journal_pending":
    case "tombstoned":
    case "external_actions_pending":
    case "grace":
      return "reapply_tombstone";
    // Irreversible work had started or finished. Replay it idempotently; the
    // residue verifier then proves the content is actually gone.
    case "erasing":
    case "verifying":
    case "complete":
      return "replay_erasure";
    // The ONLY state that may hand access back, and only once verified.
    case "cancelled":
      return "restore_access";
    // Blocked stays fenced and needs a person: something was already wrong.
    case "blocked":
      return "operator_required";
  }
}

export type JournalReplayStep = Readonly<{
  operationId: string;
  scope: DeletionScope;
  state: DeletionOperationState;
  action: JournalReplayAction;
  latestVersion: number;
  target: JournalTransitionRequest["target"];
}>;

export type JournalRestorePlan =
  | Readonly<{ outcome: "ready"; steps: readonly JournalReplayStep[] }>
  | Readonly<{ outcome: "blocked"; conflicts: readonly JournalConflict[]; steps: readonly JournalReplayStep[] }>;

/**
 * Turn verified chains into the ordered replay the restore runs BEFORE any
 * worker or traffic is enabled. One conflict anywhere blocks the whole restore:
 * partial confidence in a deletion journal is not confidence.
 */
export function planJournalRestore(chains: readonly JournalOperationChain[]): JournalRestorePlan {
  const conflicts: JournalConflict[] = [];
  const steps: JournalReplayStep[] = [];

  for (const chain of chains) {
    if (chain.outcome === "conflict") {
      conflicts.push(...chain.conflicts);
      continue;
    }
    const latest = chain.latest.record;
    steps.push({
      operationId: chain.operationId,
      scope: latest.scope,
      state: latest.toState,
      action: journalReplayAction(latest.toState),
      latestVersion: chain.latest.version,
      target: latest.target,
    });
  }

  steps.sort((a, b) => a.operationId.localeCompare(b.operationId));
  return conflicts.length > 0 ? { outcome: "blocked", conflicts, steps } : { outcome: "ready", steps };
}

/**
 * The database-ahead check. A restored database claiming a state the journal
 * does not carry means the backup was taken after a journal write that is now
 * missing — the journal is the authority, so serving is refused.
 */
export function compareRestoredState(input: {
  operationId: string;
  databaseState: DeletionOperationState;
  databaseVersion: number;
  chain: JournalOperationChain;
}): JournalConflict | null {
  if (input.chain.outcome === "conflict") {
    return input.chain.conflicts[0] ?? null;
  }
  if (input.databaseVersion > input.chain.latest.version) {
    return {
      code: "database_ahead_of_journal",
      key: input.chain.latest.objectKey,
      versionId: input.chain.latest.objectVersionId,
      detail: `restored database is at journal version ${input.databaseVersion}; the journal holds ${input.chain.latest.version}`,
    };
  }
  // Round-1 CHANGE: `databaseState` used to be accepted and never read, while
  // this function's own docstring promised it caught "a state the journal does
  // not carry". At the SAME version the two must agree; a disagreement means
  // the restored row and the journal describe different histories, and the
  // journal wins.
  const atSameVersion = input.chain.records.find(
    (record) => record.version === input.databaseVersion
  );
  if (atSameVersion && atSameVersion.record.toState !== input.databaseState) {
    return {
      code: "database_ahead_of_journal",
      key: atSameVersion.objectKey,
      versionId: atSameVersion.objectVersionId,
      detail: `restored database claims state "${input.databaseState}" at journal version ${input.databaseVersion}, but that version records "${atSameVersion.record.toState}"`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Purge (R-119 day 28)
// ---------------------------------------------------------------------------

export type JournalPurgeCandidate = Readonly<{
  key: string;
  versionId: string;
  retainUntil: Date;
}>;

/**
 * Which versions are past their Object Lock and therefore purgeable. Compliance
 * mode refuses anything else at the store, so this is a courtesy filter — but
 * it also means a purge run that tries nothing is the normal case, not a bug.
 */
export function journalPurgeCandidates(
  records: readonly VerifiedJournalRecord[],
  now: Date
): readonly JournalPurgeCandidate[] {
  return records
    .filter((record) => record.record.retainUntil.getTime() <= now.getTime())
    .map((record) => ({
      key: record.objectKey,
      versionId: record.objectVersionId,
      retainUntil: record.record.retainUntil,
    }));
}
