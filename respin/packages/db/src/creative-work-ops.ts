// THE CREATIVE PIECE'S PHYSICAL WRITERS (launch L2, R-151).
//
// WHY A MODULE AND NOT INLINE IN `with-workspace.ts` — the `promotion-ops.ts`
// arrangement: the CAPABILITIES (role gate, pause gate, lifecycle fence, the
// scope cage) live on `writeCapabilities`, and each one delegates the SQL to a
// `*InScope` function here, which receives the already-asserted `ProfileScope`
// and the caller's transaction. Nothing here is reachable except through those
// capabilities: `app/**` cannot import this file (default-deny lint), and
// `packages/**` reaches the piece only through `writeCapabilities(scope)`.
//
// EVERY COLUMN IS BUILT HERE FROM THE SCOPE, THE DATABASE OR A VALIDATED LOCAL
// — never spread from a caller's object. `profile_id` / `workspace_id` come off
// the scope; `operation_attempt_id`, `state`, `version` and both timestamps are
// database defaults or literal SET expressions; the source pair, the own idea
// and the quote version are read ONCE into locals (C-40) and checked before the
// INSERT. `creative-work.test.ts` smuggles each server-derived column in
// through `as unknown as` and asserts it never lands.
//
// WHAT THIS FILE CANNOT DO, AND WHO DOES IT. It cannot parse a stored output —
// the parser is `@respin/modes`', which this package does not import — so the
// AUTHORITATIVE index check ("is position N a concept in the versioned, parsed
// output?") is `selectConcept` in `packages/credits/src/creative-work.ts`. The
// check here is the second, structural line a raw caller meets: the source must
// be this profile's usable `ideation` generation and the index must be inside
// its stored `ideas` array.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { TxLike } from "./db-like";
import { CreativePieceError } from "./errors";
import {
  creativePieces,
  generations,
  type CreativePiece,
  type Generation,
} from "./generation-schema";
import { configVersions } from "./billing-schema";
import { brainDocs } from "./brain-schema";
import { brainActivationSnapshots } from "./onboarding-schema";
import type { ProfileScope } from "./with-workspace";

/** The longest own idea a piece stores — the table CHECK's bound, in code. */
export const OWN_IDEA_MAX = 4000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A new piece's caller-suppliable fields: ONE origin, plus the config version
 * whose price the confirmation will display. Nothing else is a parameter.
 */
export type CreateCreativePieceParams =
  | {
      source: { generationId: string; ideaIndex: number };
      quoteConfigVersion: number;
    }
  | { ownIdea: string; quoteConfigVersion: number };

/** A move of an existing piece, guarded by the version token the page showed. */
export type CreativePieceMoveParams = {
  pieceId: string;
  expectedVersion: number;
};

export type RenewCreativePieceOperationParams = CreativePieceMoveParams & {
  quoteConfigVersion: number;
};

function scopeIds(scope: ProfileScope): { profileId: string; workspaceId: string } {
  return {
    profileId: scope.profileId as string,
    workspaceId: scope.workspaceId as string,
  };
}

function pieceInScope(scope: ProfileScope, pieceId: string) {
  const ids = scopeIds(scope);
  return and(
    eq(creativePieces.id, pieceId),
    eq(creativePieces.profileId, ids.profileId),
    eq(creativePieces.workspaceId, ids.workspaceId)
  );
}

/** A positive integer that names a stored config version, or a refusal. */
async function requireConfigVersion(tx: TxLike, version: unknown): Promise<number> {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new CreativePieceError("stale");
  }
  const [row] = await tx
    .select({ version: configVersions.version })
    .from(configVersions)
    .where(eq(configVersions.version, version))
    .limit(1);
  if (!row) throw new CreativePieceError("stale");
  return version;
}

function requireVersionToken(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new CreativePieceError("stale");
  }
  return value;
}

/** Create one piece — from a stored concept, or from the creator's own idea. */
export async function createCreativePieceInScope(
  scope: ProfileScope,
  params: CreateCreativePieceParams,
  tx: TxLike
): Promise<CreativePiece> {
  const ids = scopeIds(scope);
  // READ ONCE INTO LOCALS (C-40).
  const source = "source" in params ? params.source : undefined;
  const ownIdeaRaw = "ownIdea" in params ? params.ownIdea : undefined;
  const quoteConfigVersion = await requireConfigVersion(tx, params.quoteConfigVersion);

  if (source !== undefined) {
    const generationId = source.generationId;
    const ideaIndex = source.ideaIndex;
    if (typeof generationId !== "string" || !UUID_RE.test(generationId)) {
      throw new CreativePieceError("not_found");
    }
    if (typeof ideaIndex !== "number" || !Number.isInteger(ideaIndex) || ideaIndex < 0) {
      throw new CreativePieceError("source_unusable");
    }
    const [row] = await tx
      .select({
        mode: generations.mode,
        outcome: generations.outcome,
        ideaCount: sql<number | null>`CASE WHEN jsonb_typeof(${generations.output} -> 'ideas') = 'array'
          THEN jsonb_array_length(${generations.output} -> 'ideas') END`,
      })
      .from(generations)
      .where(
        and(
          eq(generations.id, generationId),
          eq(generations.profileId, ids.profileId),
          eq(generations.workspaceId, ids.workspaceId)
        )
      )
      .limit(1);
    if (!row) throw new CreativePieceError("not_found");
    const count = row.ideaCount === null ? 0 : Number(row.ideaCount);
    if (row.mode !== "ideation" || row.outcome !== "usable" || ideaIndex >= count) {
      throw new CreativePieceError("source_unusable");
    }
    const [inserted] = await tx
      .insert(creativePieces)
      .values({
        profileId: ids.profileId,
        workspaceId: ids.workspaceId,
        sourceGenerationId: generationId,
        sourceIdeaIndex: ideaIndex,
        ownIdea: null,
        quoteConfigVersion,
      })
      .returning();
    return inserted;
  }

  if (typeof ownIdeaRaw !== "string" || !/\S/.test(ownIdeaRaw)) {
    throw new CreativePieceError("not_commissionable");
  }
  if ([...ownIdeaRaw].length > OWN_IDEA_MAX) {
    throw new CreativePieceError("not_commissionable");
  }
  const [inserted] = await tx
    .insert(creativePieces)
    .values({
      profileId: ids.profileId,
      workspaceId: ids.workspaceId,
      sourceGenerationId: null,
      sourceIdeaIndex: null,
      // STORED AS TYPED — the commissioned request preserves the creator's
      // premise verbatim (launch L2); whitespace is the creator's.
      ownIdea: ownIdeaRaw,
      quoteConfigVersion,
    })
    .returning();
  return inserted;
}

/**
 * One piece WITH the generations it names, every read carrying both scope
 * columns — so a caller never needs a second, by-id generation reader (there is
 * none in this package, by design: generations are reached by attempt id or
 * through a scoped owner like this one). `source` is null for an own idea;
 * `selected` is null until a script settles.
 */
export type CreativePieceRead = {
  piece: CreativePiece;
  source: Generation | null;
  selected: Generation | null;
};

async function generationInScope(
  scope: ProfileScope,
  generationId: string | null,
  tx: TxLike
): Promise<Generation | null> {
  if (generationId === null) return null;
  const ids = scopeIds(scope);
  const [row] = await tx
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.id, generationId),
        eq(generations.profileId, ids.profileId),
        eq(generations.workspaceId, ids.workspaceId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** One piece, scoped; `undefined` for foreign, missing, deleted or malformed. */
export async function readCreativePieceInScope(
  scope: ProfileScope,
  pieceId: string,
  tx: TxLike
): Promise<CreativePieceRead | undefined> {
  const piece = await readPieceRow(scope, pieceId, tx);
  if (!piece) return undefined;
  return {
    piece,
    source: await generationInScope(scope, piece.sourceGenerationId, tx),
    selected: await generationInScope(scope, piece.selectedGenerationId, tx),
  };
}

async function readPieceRow(
  scope: ProfileScope,
  pieceId: string,
  tx: TxLike
): Promise<CreativePiece | undefined> {
  if (typeof pieceId !== "string" || !UUID_RE.test(pieceId)) return undefined;
  const [row] = await tx
    .select()
    .from(creativePieces)
    .where(pieceInScope(scope, pieceId))
    .limit(1);
  return row;
}

/**
 * Why a guarded move matched no row — read AFTER the UPDATE, so the answer is
 * about the state that refused it, never a pre-read that could be stale.
 */
async function diagnose(
  scope: ProfileScope,
  pieceId: string,
  expectedVersion: number,
  tx: TxLike
): Promise<never> {
  const row = await readPieceRow(scope, pieceId, tx);
  if (!row) throw new CreativePieceError("not_found");
  if (row.version !== expectedVersion) throw new CreativePieceError("stale");
  throw new CreativePieceError("not_commissionable");
}

/**
 * "NEW GENERATION": mint ANOTHER operation id for this piece, even for an
 * identical request, and re-quote it. The id is the database's
 * (`gen_random_uuid()`), never a parameter. Legal while the piece is not
 * cancelled — a second script of a scripted piece is a deliberate new
 * commission, and that is exactly what this action is.
 */
export async function renewCreativePieceOperationInScope(
  scope: ProfileScope,
  params: RenewCreativePieceOperationParams,
  tx: TxLike
): Promise<CreativePiece> {
  const pieceId = params.pieceId;
  const expectedVersion = requireVersionToken(params.expectedVersion);
  const quoteConfigVersion = await requireConfigVersion(tx, params.quoteConfigVersion);
  if (typeof pieceId !== "string" || !UUID_RE.test(pieceId)) {
    throw new CreativePieceError("not_found");
  }
  const [row] = await tx
    .update(creativePieces)
    .set({
      operationAttemptId: sql`gen_random_uuid()::text`,
      quoteConfigVersion,
      version: sql`${creativePieces.version} + 1`,
    })
    .where(
      and(
        pieceInScope(scope, pieceId),
        eq(creativePieces.version, expectedVersion),
        sql`${creativePieces.state} <> 'cancelled'`
      )
    )
    .returning();
  if (!row) return diagnose(scope, pieceId, expectedVersion, tx);
  return row;
}

/** Back out of a piece that has no script yet. Costs nothing. */
export async function cancelCreativePieceInScope(
  scope: ProfileScope,
  params: CreativePieceMoveParams,
  tx: TxLike
): Promise<CreativePiece> {
  const pieceId = params.pieceId;
  const expectedVersion = requireVersionToken(params.expectedVersion);
  if (typeof pieceId !== "string" || !UUID_RE.test(pieceId)) {
    throw new CreativePieceError("not_found");
  }
  const [row] = await tx
    .update(creativePieces)
    .set({ state: "cancelled", version: sql`${creativePieces.version} + 1` })
    .where(
      and(
        pieceInScope(scope, pieceId),
        eq(creativePieces.version, expectedVersion),
        eq(creativePieces.state, "selected")
      )
    )
    .returning();
  if (!row) return diagnose(scope, pieceId, expectedVersion, tx);
  return row;
}

// ------------------------------------------------------------------------
// LAUNCH L4 (R-153): THE SAVED RECORDING PACK — WHICH VERSIONS A PIECE HAS,
// AND WHICH ONE IS SELECTED.
//
// A piece's VERSIONS are its commissioned scripts (each settled generation
// whose stored `request.origin` names this piece — "New generation" can make
// more than one) and every same-mode revision descending from them through
// `generations.parent_id`. A revision's own origin is `null` (`generate`
// refuses a piece with a revision target), so the piece a version belongs to
// is found by walking UP the parent chain to the first generation that names
// one. Every read below carries both scope columns; the parent FK is composite
// and same-tenant, so the chain cannot leave this profile either way.

/**
 * The most generations one parent walk reads — a bound on work, not a rule:
 * the starting generation and at most 63 ancestors above it, 64 reads in all
 * (`depth < SAVED_LINEAGE_DEPTH_MAX`).
 */
export const SAVED_LINEAGE_DEPTH_MAX = 64;
/** The most versions of one piece one read returns (oldest first). */
export const PIECE_VERSIONS_MAX = 50;
/** The most direct revisions of one generation one read returns (newest first). */
export const SAVED_REVISIONS_MAX = 10;
/** The longest stored source text the saved page carries, in UTF-16 units. */
export const SAVED_SOURCE_TEXT_MAX = 2000;

/** One version of a piece, as the saved page lists it. Columns only, no output. */
export type PieceVersionRow = {
  generationId: string;
  attemptId: string;
  parentId: string | null;
  outcome: Generation["outcome"];
  createdAt: Date;
};

/** One direct revision of a stored generation. Columns only, no output. */
export type SavedRevisionRow = {
  attemptId: string;
  outcome: Generation["outcome"];
  createdAt: Date;
};

/** What the saved page needs around one stored generation, all scoped. */
export type SavedGenerationContext = {
  /** The generation this one revised, or null for an original. */
  parent: { attemptId: string; mode: string } | null;
  /**
   * THIS generation's own direct revisions (`parent_id` = this, same mode),
   * newest first, at most `SAVED_REVISIONS_MAX` — so a creator whose press
   * settled but whose response was lost sees, on reopening, that the revision
   * exists (R-153 amendment, billing M2).
   */
  revisions: SavedRevisionRow[];
  /** True when there are more than `SAVED_REVISIONS_MAX` direct revisions. */
  revisionsTruncated: boolean;
  /**
   * The stored content of the kill-test brain document this generation ran
   * under (its activation snapshot's `killtest_doc_id`), or null when the
   * snapshot names none. The CREATOR's rules: the saved page names a rule by
   * this text, never by the scoring model's note (R-153 amendment, A1).
   */
  killtestContent: unknown;
  /**
   * The ROOT of this generation's parent chain (itself for an original): its
   * mode, its stored input (the creator's own words — for `sourceToReel` the
   * source material they pasted, cut to `SAVED_SOURCE_TEXT_MAX`) and its stored
   * Spin reference id. Null when no root is reached within
   * `SAVED_LINEAGE_DEPTH_MAX` reads.
   */
  root: {
    attemptId: string;
    mode: string;
    input: string | null;
    inputTruncated: boolean;
    spinAutopsyId: string | null;
  } | null;
  /** The piece this generation is a version of, or null when it is none's. */
  piece: CreativePiece | null;
  /** The concept the piece was chosen from, or null (own idea / no piece). */
  source: { attemptId: string; ideaIndex: number } | null;
  /** The piece's versions, oldest first; empty when there is no piece. */
  versions: PieceVersionRow[];
  /** True when the piece has more than `PIECE_VERSIONS_MAX` versions. */
  versionsTruncated: boolean;
};

/** The stored request's piece id, read in SQL so no output document is loaded. */
const originPieceId = sql<string | null>`CASE WHEN ${generations.request} -> 'origin' ->> 'kind' = 'piece' THEN ${generations.request} -> 'origin' ->> 'pieceId' END`;

const lineageColumns = {
  id: generations.id,
  attemptId: generations.attemptId,
  parentId: generations.parentId,
  mode: generations.mode,
  outcome: generations.outcome,
  createdAt: generations.createdAt,
  originPieceId,
};

function generationScope(scope: ProfileScope) {
  const ids = scopeIds(scope);
  return and(
    eq(generations.profileId, ids.profileId),
    eq(generations.workspaceId, ids.workspaceId)
  );
}

async function lineageRow(scope: ProfileScope, generationId: string, tx: TxLike) {
  if (typeof generationId !== "string" || !UUID_RE.test(generationId)) return undefined;
  const [row] = await tx
    .select(lineageColumns)
    .from(generations)
    .where(and(eq(generations.id, generationId), generationScope(scope)))
    .limit(1);
  return row;
}

/**
 * The piece a stored generation is a version of: the first generation up its
 * parent chain (itself included) whose stored origin names a piece, or null.
 */
export async function pieceIdOfGenerationInScope(
  scope: ProfileScope,
  generationId: string,
  tx: TxLike
): Promise<string | null> {
  let id: string | null = generationId;
  for (let depth = 0; id !== null && depth < SAVED_LINEAGE_DEPTH_MAX; depth += 1) {
    const row = await lineageRow(scope, id, tx);
    if (!row) return null;
    if (row.originPieceId !== null) return row.originPieceId;
    id = row.parentId;
  }
  return null;
}

/**
 * The root of a stored generation's parent chain (the first generation with
 * no parent, itself included), with its stored input and Spin reference id
 * read in SQL — the output document is never loaded. Scoped on every step;
 * null when no root is reached within `SAVED_LINEAGE_DEPTH_MAX` reads.
 */
async function rootOfGenerationInScope(
  scope: ProfileScope,
  generationId: string,
  tx: TxLike
): Promise<SavedGenerationContext["root"]> {
  let id: string | null = generationId;
  for (let depth = 0; id !== null && depth < SAVED_LINEAGE_DEPTH_MAX; depth += 1) {
    const row = await lineageRow(scope, id, tx);
    if (!row) return null;
    if (row.parentId === null) {
      const [root] = await tx
        .select({
          input: sql<string | null>`${generations.request} ->> 'input'`,
          spinAutopsyId: sql<string | null>`${generations.request} ->> 'spinAutopsyId'`,
        })
        .from(generations)
        .where(and(eq(generations.id, row.id), generationScope(scope)))
        .limit(1);
      if (!root) return null;
      const input = typeof root.input === "string" ? root.input : null;
      return {
        attemptId: row.attemptId,
        mode: row.mode,
        input: input === null ? null : input.slice(0, SAVED_SOURCE_TEXT_MAX),
        inputTruncated: input !== null && input.length > SAVED_SOURCE_TEXT_MAX,
        spinAutopsyId: typeof root.spinAutopsyId === "string" ? root.spinAutopsyId : null,
      };
    }
    id = row.parentId;
  }
  return null;
}

/** This generation's own direct revisions, newest first, same mode, bounded. */
async function directRevisionsInScope(
  scope: ProfileScope,
  row: { id: string; mode: string },
  tx: TxLike
): Promise<{ rows: SavedRevisionRow[]; truncated: boolean }> {
  const children = await tx
    .select({
      attemptId: generations.attemptId,
      outcome: generations.outcome,
      createdAt: generations.createdAt,
    })
    .from(generations)
    .where(
      and(
        generationScope(scope),
        eq(generations.parentId, row.id),
        eq(generations.mode, row.mode)
      )
    )
    .orderBy(desc(generations.createdAt), desc(generations.id))
    .limit(SAVED_REVISIONS_MAX + 1);
  return {
    rows: children.slice(0, SAVED_REVISIONS_MAX),
    truncated: children.length > SAVED_REVISIONS_MAX,
  };
}

/**
 * The content of the kill-test document this generation ran under, through
 * its activation snapshot — every table on BOTH scope columns. Null when the
 * snapshot names no kill-test document.
 */
async function killtestContentInScope(
  scope: ProfileScope,
  generationId: string,
  tx: TxLike
): Promise<unknown> {
  const ids = scopeIds(scope);
  const [found] = await tx
    .select({ content: brainDocs.content })
    .from(generations)
    .innerJoin(
      brainActivationSnapshots,
      and(
        eq(brainActivationSnapshots.id, generations.brainActivationId),
        eq(brainActivationSnapshots.profileId, ids.profileId),
        eq(brainActivationSnapshots.workspaceId, ids.workspaceId)
      )
    )
    .innerJoin(
      brainDocs,
      and(
        eq(brainDocs.id, brainActivationSnapshots.killtestDocId),
        eq(brainDocs.profileId, ids.profileId),
        eq(brainDocs.workspaceId, ids.workspaceId)
      )
    )
    .where(and(eq(generations.id, generationId), generationScope(scope)))
    .limit(1);
  return found?.content ?? null;
}

/**
 * The one mode a piece's versions are written in: `selectCreativePieceVersionInScope`
 * accepts nothing else, so roots and descendants are both held to it.
 */
const PIECE_VERSION_MODE = "ideaToScript";

/** A piece's versions, oldest first, bounded by `PIECE_VERSIONS_MAX`. */
async function pieceVersionsInScope(
  scope: ProfileScope,
  pieceId: string,
  tx: TxLike
): Promise<{ rows: PieceVersionRow[]; truncated: boolean }> {
  const toVersion = (r: Awaited<ReturnType<typeof lineageRow>> & object): PieceVersionRow => ({
    generationId: r.id,
    attemptId: r.attemptId,
    parentId: r.parentId,
    outcome: r.outcome,
    createdAt: r.createdAt,
  });
  const roots = await tx
    .select(lineageColumns)
    .from(generations)
    .where(
      and(
        generationScope(scope),
        eq(generations.mode, PIECE_VERSION_MODE),
        sql`${originPieceId} = ${pieceId}`
      )
    )
    .orderBy(asc(generations.createdAt), asc(generations.id))
    .limit(PIECE_VERSIONS_MAX + 1);
  const all = roots.map(toVersion);
  let frontier = roots.map((r) => r.id);
  while (frontier.length > 0 && all.length <= PIECE_VERSIONS_MAX) {
    const children = await tx
      .select(lineageColumns)
      .from(generations)
      .where(
        and(
          generationScope(scope),
          eq(generations.mode, PIECE_VERSION_MODE),
          inArray(generations.parentId, frontier)
        )
      )
      .orderBy(asc(generations.createdAt), asc(generations.id))
      .limit(PIECE_VERSIONS_MAX + 1 - all.length);
    all.push(...children.map(toVersion));
    frontier = children.map((r) => r.id);
  }
  all.sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.generationId < b.generationId ? -1 : a.generationId > b.generationId ? 1 : 0)
  );
  return {
    rows: all.slice(0, PIECE_VERSIONS_MAX),
    truncated: all.length > PIECE_VERSIONS_MAX,
  };
}

/**
 * Everything around one stored generation the saved page shows: its parent,
 * the piece it is a version of, that piece's source concept and its versions.
 * `undefined` for a foreign, missing or malformed id.
 */
export async function readSavedGenerationContextInScope(
  scope: ProfileScope,
  generationId: string,
  tx: TxLike
): Promise<SavedGenerationContext | undefined> {
  const row = await lineageRow(scope, generationId, tx);
  if (!row) return undefined;
  const parentRow = row.parentId === null ? undefined : await lineageRow(scope, row.parentId, tx);
  const revisions = await directRevisionsInScope(scope, row, tx);
  const around = {
    revisions: revisions.rows,
    revisionsTruncated: revisions.truncated,
    killtestContent: await killtestContentInScope(scope, row.id, tx),
    root: await rootOfGenerationInScope(scope, row.id, tx),
  };
  const pieceId = await pieceIdOfGenerationInScope(scope, row.id, tx);
  const piece = pieceId === null ? undefined : await readPieceRow(scope, pieceId, tx);
  if (!piece) {
    return {
      parent: parentRow ? { attemptId: parentRow.attemptId, mode: parentRow.mode } : null,
      ...around,
      piece: null,
      source: null,
      versions: [],
      versionsTruncated: false,
    };
  }
  const source = await generationInScope(scope, piece.sourceGenerationId, tx);
  const versions = await pieceVersionsInScope(scope, piece.id, tx);
  return {
    parent: parentRow ? { attemptId: parentRow.attemptId, mode: parentRow.mode } : null,
    ...around,
    piece,
    source:
      source === null || piece.sourceIdeaIndex === null
        ? null
        : { attemptId: source.attemptId, ideaIndex: piece.sourceIdeaIndex },
    versions: versions.rows,
    versionsTruncated: versions.truncated,
  };
}

export type SelectCreativePieceVersionParams = CreativePieceMoveParams & {
  generationId: string;
};

/**
 * "USE THIS VERSION" — point the piece's selection at another of its usable
 * versions. ZERO COST, version-guarded by the token the page showed, and
 * refused unless the generation is this profile's usable script AND a version
 * of THIS piece (walked up its own parent chain, never taken from the caller).
 * A foreign, missing, unusable or other-piece generation is `not_found` — one
 * answer, so the refusal is no oracle. Re-selecting the version that is
 * already selected answers with the piece unchanged, even on a stale token:
 * the creator's intent already holds.
 */
export async function selectCreativePieceVersionInScope(
  scope: ProfileScope,
  params: SelectCreativePieceVersionParams,
  tx: TxLike
): Promise<CreativePiece> {
  // READ ONCE INTO LOCALS (C-40).
  const pieceId = params.pieceId;
  const generationId = params.generationId;
  const expectedVersion = requireVersionToken(params.expectedVersion);
  if (typeof pieceId !== "string" || !UUID_RE.test(pieceId)) {
    throw new CreativePieceError("not_found");
  }
  const row = await lineageRow(scope, generationId, tx);
  if (!row || row.mode !== "ideaToScript" || row.outcome !== "usable") {
    throw new CreativePieceError("not_found");
  }
  if ((await pieceIdOfGenerationInScope(scope, row.id, tx)) !== pieceId) {
    throw new CreativePieceError("not_found");
  }
  const [updated] = await tx
    .update(creativePieces)
    .set({
      // THE ROW'S OWN ID, read above through the scope — never the parameter.
      selectedGenerationId: row.id,
      version: sql`${creativePieces.version} + 1`,
    })
    .where(
      and(
        pieceInScope(scope, pieceId),
        eq(creativePieces.version, expectedVersion),
        eq(creativePieces.state, "scripted")
      )
    )
    .returning();
  if (updated) return updated;
  const current = await readPieceRow(scope, pieceId, tx);
  if (current && current.state === "scripted" && current.selectedGenerationId === row.id) {
    return current;
  }
  return diagnose(scope, pieceId, expectedVersion, tx);
}

/**
 * THE SETTLEMENT'S PIECE LINK — called by `settleGeneration` inside the money
 * transaction, so a settled script and its piece's selection commit together
 * or not at all. It never refuses: the creator has paid for this script, and a
 * piece that has since been cancelled still gets the script it paid for (the
 * state moves to `scripted`). A piece that no longer exists (its profile is
 * being erased) is simply not updated — the same-tenant FK on the selection
 * makes a cross-tenant link unrepresentable either way.
 */
export async function linkCreativePieceScriptInScope(
  scope: ProfileScope,
  params: { pieceId: string; generationId: string },
  tx: TxLike
): Promise<CreativePiece | undefined> {
  const pieceId = params.pieceId;
  const generationId = params.generationId;
  if (typeof pieceId !== "string" || !UUID_RE.test(pieceId)) return undefined;
  const [row] = await tx
    .update(creativePieces)
    .set({
      selectedGenerationId: generationId,
      state: "scripted",
      version: sql`${creativePieces.version} + 1`,
    })
    .where(pieceInScope(scope, pieceId))
    .returning();
  return row;
}
