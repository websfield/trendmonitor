// THE CREATIVE PIECE, FROM THE CREATOR'S SIDE (launch L2, R-151).
//
// Choose a stored concept — or state your own idea — at ZERO cost, see the
// script's configured price and the operation id the confirmation displays,
// start a "New generation", or back out. Nothing here spends: no ledger row,
// no provider call, no claim. The commission itself is `generate` with
// `pieceId` — the one door to the vendor.
//
// WHY HERE AND NOT IN `@respin/db`. The AUTHORITATIVE check that position N is
// a concept is a PARSE of the stored, versioned output, and the parser is
// `@respin/modes`' — `generate.ts`' `storedConceptOf`, the same function the
// commission resolves the concept with, so selection and commission cannot
// disagree about what the creator chose. The price, the tier and the plan map
// are this package's too. `@respin/db`'s capability re-checks the index
// structurally and writes the row.
import {
  mintProfileScope,
  writeCapabilities,
  type CreativePiece,
  type CreativePieceRead,
  type DbLike,
  type Generation,
  type WorkspaceScope,
} from "@respin/db";
import { getActiveConfig, configVersionContents } from "@respin/config";
import { CreativePieceError } from "@respin/db";

import {
  conceptContextSufficient,
  generationOp,
  storedConceptOf,
} from "./generate";
import { ProfileArchivedError, priceOf } from "./inference";
import { planIncludesMode, type EntitlementTier } from "./mode-access";
import { getWorkspaceBillingState } from "./state";

/** What the confirmation renders. Plain values; no row, no document. */
export type CreativePieceView = {
  pieceId: string;
  /** The monotonic version token every move of this piece must name. */
  version: number;
  state: CreativePiece["state"];
  /** The operation id the confirmation displays — server-minted. */
  operationAttemptId: string;
  origin:
    | {
        kind: "concept";
        /** The source output's attempt id (what the Studio lineage carries). */
        sourceAttemptId: string;
        ideaIndex: number;
        hook: string;
        thesis: string;
        framework: string;
        /** The concept's resolved form id (v2), or null for a legacy concept. */
        formId: string | null;
        premise: { whatHappens: string; interest: string; payoff: string } | null;
      }
    | { kind: "own_idea"; idea: string };
  quote: {
    /** The configured price of an ORIGINAL `ideaToScript`, under the quote's version. */
    credits: number | null;
    configVersion: number;
    tier: EntitlementTier;
    /** False on a plan without `ideaToScript` — the named plan block shows. */
    planIncludesScript: boolean;
  };
  /** The settled script this piece selected, once one exists. */
  selected: { generationId: string; attemptId: string } | null;
};

const SCRIPT_MODE = "ideaToScript" as const;

async function profileCaps(db: DbLike, workspaceScope: WorkspaceScope, profileId: string) {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const [profile] = await scope.accessors.profile();
  if (!profile || profile.state !== "active") throw new ProfileArchivedError();
  return { scope, caps: writeCapabilities(scope) };
}

/** The active config version a new quote is shown under. */
async function quoteVersion(db: DbLike): Promise<number> {
  return (await getActiveConfig(db)).version;
}

/** Choose concept `ideaIndex` of the ideation output `sourceAttemptId` produced. */
export async function selectConcept(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  params: { sourceAttemptId: string; ideaIndex: number },
  at: Date
): Promise<CreativePieceView> {
  const { caps } = await profileCaps(db, workspaceScope, profileId);
  // READ ONCE INTO LOCALS (C-40); the index is wire input until checked.
  const sourceAttemptId = params.sourceAttemptId;
  const ideaIndex = params.ideaIndex;
  if (typeof sourceAttemptId !== "string" || sourceAttemptId.trim() === "") {
    throw new CreativePieceError("not_found");
  }
  const source = await db.transaction((tx) =>
    caps.readGenerationForAttempt(sourceAttemptId, tx)
  );
  if (!source) throw new CreativePieceError("not_found");
  // THE AUTHORITATIVE CHECK: the stored output parses under its own version
  // and position `ideaIndex` is one of its concepts. Throws `source_unusable`.
  storedConceptOf(source, ideaIndex);
  const quoteConfigVersion = await quoteVersion(db);
  const piece = await db.transaction((tx) =>
    caps.createCreativePiece(
      { source: { generationId: source.id, ideaIndex }, quoteConfigVersion },
      tx
    )
  );
  return viewOf(db, workspaceScope, { piece, source, selected: null }, at);
}

/** Develop an idea the creator already has: their words, stored verbatim. */
export async function startOwnIdea(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  params: { idea: string },
  at: Date
): Promise<CreativePieceView> {
  const { caps } = await profileCaps(db, workspaceScope, profileId);
  const quoteConfigVersion = await quoteVersion(db);
  const piece = await db.transaction((tx) =>
    caps.createCreativePiece({ ownIdea: params.idea, quoteConfigVersion }, tx)
  );
  return viewOf(db, workspaceScope, { piece, source: null, selected: null }, at);
}

/** "New generation": another operation id for this piece, re-quoted. */
export async function renewCreativeOperation(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  params: { pieceId: string; expectedVersion: number },
  at: Date
): Promise<CreativePieceView> {
  const { caps } = await profileCaps(db, workspaceScope, profileId);
  const quoteConfigVersion = await quoteVersion(db);
  await db.transaction((tx) =>
    caps.renewCreativePieceOperation(
      { pieceId: params.pieceId, expectedVersion: params.expectedVersion, quoteConfigVersion },
      tx
    )
  );
  return creativePieceView(db, workspaceScope, profileId, params.pieceId, at);
}

/** Back out of a piece with no script yet. Zero cost. */
export async function cancelCreativeWork(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  params: { pieceId: string; expectedVersion: number },
  at: Date
): Promise<CreativePieceView> {
  const { caps } = await profileCaps(db, workspaceScope, profileId);
  await db.transaction((tx) =>
    caps.cancelCreativePiece(
      { pieceId: params.pieceId, expectedVersion: params.expectedVersion },
      tx
    )
  );
  return creativePieceView(db, workspaceScope, profileId, params.pieceId, at);
}

/** The confirmation's read: a scoped piece, its concept and its quote. */
export async function creativePieceView(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  pieceId: string,
  at: Date
): Promise<CreativePieceView> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const caps = writeCapabilities(scope);
  const read = await db.transaction((tx) => caps.readCreativePiece(pieceId, tx));
  if (!read) throw new CreativePieceError("not_found");
  return viewOf(db, workspaceScope, read, at);
}

async function viewOf(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  read: CreativePieceRead,
  at: Date
): Promise<CreativePieceView> {
  const { piece, source, selected } = read;
  const origin = originView(piece, source);
  const billing = await getWorkspaceBillingState(db, workspaceScope.workspaceId, at);
  // THE CONFIGURED PRICE UNDER THE QUOTE'S OWN VERSION — the number the
  // commission is held to. `null` (and the screen says so) if it cannot be
  // read; never a guessed number.
  let credits: number | null = null;
  try {
    const content = (await configVersionContents(db, [piece.quoteConfigVersion])).get(
      piece.quoteConfigVersion
    );
    if (content) credits = priceOf(content, generationOp(SCRIPT_MODE, false));
  } catch {
    credits = null;
  }
  // NO BALANCE READ HERE, deliberately: `deriveBalance` takes the workspace
  // money lock, and a page render must not queue behind a settlement for a
  // number this confirmation does not state. `/studio`'s other L2 read that
  // could have taken it — the reference entrance — reads `pastedReferenceInPlan`
  // (no lock; `pasted-reference-availability.test.ts`), so the page's one
  // lock-taking read stays its pre-L2 balance read, which audit P8-R1 leaves
  // with L5.
  return {
    pieceId: piece.id,
    version: piece.version,
    state: piece.state,
    operationAttemptId: piece.operationAttemptId,
    origin,
    quote: {
      credits,
      configVersion: piece.quoteConfigVersion,
      tier: billing.tier,
      planIncludesScript: planIncludesMode(billing.tier, SCRIPT_MODE),
    },
    selected:
      selected === null ? null : { generationId: selected.id, attemptId: selected.attemptId },
  };
}

/**
 * Does the activated brain carry enough APPROVED context for "find my next
 * concept" with no hint? The same deterministic rule `generate` enforces
 * (`conceptContextSufficient`) over the same documents the activation snapshot
 * names — a courtesy that decides whether the screen asks its one question
 * up front. No model call.
 */
export async function conceptContextReady(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string
): Promise<boolean> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const [activation] = await scope.accessors.latestBrainActivation();
  if (!activation) return false;
  const docs = await scope.accessors.brainDocsByIds(
    [activation.strategyDocId].filter((id): id is string => typeof id === "string")
  );
  const strategy = docs.find((d) => d.kind === "strategy");
  return conceptContextSufficient(strategy?.content ?? null, "");
}

function originView(
  piece: CreativePiece,
  source: Generation | null
): CreativePieceView["origin"] {
  if (piece.sourceGenerationId === null) {
    return { kind: "own_idea", idea: piece.ownIdea as string };
  }
  if (source === null) throw new CreativePieceError("not_found");
  const concept = storedConceptOf(source, piece.sourceIdeaIndex as number);
  return {
    kind: "concept",
    sourceAttemptId: source.attemptId,
    ideaIndex: piece.sourceIdeaIndex as number,
    hook: concept.hook,
    thesis: concept.thesis,
    framework: concept.framework,
    formId: concept.formLabelId,
    premise: concept.premise,
  };
}
