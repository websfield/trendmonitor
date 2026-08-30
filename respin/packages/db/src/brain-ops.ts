// The three app-reachable brain operations (slice 3): read a creator's voice
// versions for the confirm screen, record their per-field confirmation, and
// activate.
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY — the same reason
// `onboarding-ops.ts` gives: all three compose `ProfileScope.mint` with a
// capability, and all three need a `db` handle a test can supply. Written
// inline in `app-server.ts` they would be reachable only through
// `getServerDb()`, so every assertion about them would have to run in a Docker
// suite.
//
// WHY THEY LIVE IN `packages/db` AND NOT `packages/credits` (R-30 constraint
// 2): none of the three reads config and none needs a resolved tier. Confirming
// a rule about yourself is not an entitlement — it spends nothing, it is not
// capped, and there is no second tier authority to create. Contrast
// `inferVoice`, which prices a run and therefore cannot live here.
//
// THE ROLE GATE IS NOT HERE, deliberately. `assertMayDecide` runs inside
// `confirmBrainDocFields` / `activateBrainDoc` (with-workspace.ts), which is
// where it has to be: a gate in this file would be one a caller reaching the
// capability directly could walk past, and `packages/credits` reaches those
// capabilities too.
import type { DbLike } from "./db-like";
import type { BrainDoc, BrainDocStatus, BrainKind } from "./brain-schema";
import type { InputClass, OnboardingInput } from "./onboarding-schema";
import {
  ProfileScope,
  STALE_BRAIN_EDIT_DETAIL,
  authoritativeEditableBrainDoc,
  writeCapabilities,
  type ActivateBrainDocCoherentResult,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "./with-workspace";
import { CHECK, enumerateClaimFields, readPointer } from "./brain-content";
import {
  BrainEditBusyError,
  BrainEditEmptyError,
  BrainEditLimitError,
  ProfileAccessError,
  ProvenanceError,
} from "./errors";
import type { RunSlots } from "./run-slot";

export const BRAIN_EDIT_MAX_FIELDS = 100;
export const BRAIN_EDIT_POINTER_MAX = 256;
export const BRAIN_EDIT_VALUE_MAX = 2_000;
export const BRAIN_EDIT_TOTAL_MAX = 20_000;
export const BRAIN_EDIT_LIST_MAX = 50;

/** Fail-fast outer request slot; the DB writer still owns correctness locking. */
export async function withBrainEditSlot<T>(
  runSlots: RunSlots,
  scope: WorkspaceScope,
  operation: () => Promise<T>
): Promise<T> {
  // The verified workspace id stays the tenancy anchor. `control` is a closed
  // advisory-key namespace, so this request guard cannot consume generation
  // slots even though both use the same Postgres advisory-lock facility.
  const outcome = await runSlots.acquire(scope.workspaceId, 1, "brain-edit");
  if (!outcome.granted) throw new BrainEditBusyError();
  try {
    return await operation();
  } finally {
    await outcome.lease.release();
  }
}

/**
 * One claim position, with everything the confirm screen needs to render it
 * HONESTLY — and nothing it does not.
 *
 * `quote` and `source` are nullable TOGETHER — but that pairing was never the
 * one that mattered, and the header used to claim it was (compliance gate,
 * 2026-08-29). The shape that actually fails open is a STATED claim with no
 * quote: the named absence is gated on `isPlaceholder` and the quote block on
 * `quote !== null`, so `{isPlaceholder: false, quote: null}` renders a rule
 * about a person with nothing behind it and a checkbox saying "this is right".
 *
 * `claimsFor` now REFUSES that shape rather than constructing it, so the
 * invariant this type carries is the real one: a stated claim always has its
 * quote, and only a `[check]` may have none.
 */
/**
 * One claim position, with everything the confirm screen needs to render it
 * HONESTLY — and nothing it does not.
 *
 * NAMED `Brain*View`, NOT `Voice*View` (slice 3b, Stage B2) — slice 3 built
 * this shape for `voice` alone, and every field below reads exactly the same
 * for `strategy` and `killtest`: a claim position, the value or the
 * placeholder, and — for `strategy`/`killtest` — a `creator_authored` interview
 * answer standing where `voice`'s `own_post` quote does, rather than a second,
 * parallel view type per kind. `readVoiceBrain`/`readStrategyBrain`/
 * `readKillTestBrain` share ONE implementation (`readBrainKindDocs` below) for
 * the same reason: three copies of "resolve the cited inputs, refuse a
 * disagreement" is three places the fix from 2026-08-29 (the 50-row page that
 * made `readVoiceBrain` refuse permanently past a creator's fiftieth post)
 * could be half-applied.
 */
export type BrainClaimView = {
  /** RFC-6901 pointer, e.g. `/register` or `/signatureMoves/0`. */
  pointer: string;
  /** The inferred or creator-declared rule as stored, or `[check]`. */
  value: string;
  /** True when `value` is the placeholder — i.e. we could not ground it. */
  isPlaceholder: boolean;
  /**
   * The creator's own words that this claim rests on, RE-SLICED FROM THE INPUT
   * ROW at render time rather than read out of the evidence column.
   *
   * `validateSourceEvidence` proved `quote === input.content.slice(start, end)`
   * at write time, so the two agree — and re-slicing is what keeps the screen's
   * sentence ("this is from your post" / "this is your own answer") true BY
   * CONSTRUCTION rather than by a property proved somewhere else on a value
   * that has been sitting in a mutable-by-hand column since. A disagreement is
   * refused, not rendered; see `EvidenceUnreadableError`.
   */
  quote: string | null;
  /**
   * Which input row the quote came from, so the claim can be attributed —
   * AND, for the two kinds this slice adds, which KIND of row it is, so the
   * screen can say "from a post you saved" for `own_post` and "your own
   * answer" for `creator_authored` rather than one sentence pretending to fit
   * both (R4/R10).
   */
  source: { inputId: string; postedAt: Date; inputClass: InputClass } | null;
  /** Whether this exact position is already recorded confirmed on this version. */
  confirmed: boolean;
  /** History/export annotation; strict confirmation reads always return null. */
  evidenceAnnotation: string | null;
};

export type BrainVersionView = {
  brainDocId: string;
  version: number;
  status: BrainDocStatus;
  /** The server-rendered sentence for the stored reason CODE, never raw text. */
  reason: string;
  claims: BrainClaimView[];
  confirmedAt: Date | null;
  activatedAt: Date | null;
  supersededAt: Date | null;
  /** Exact version activated in the same transition that superseded this one. */
  replacedByVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export const EVIDENCE_UNVERIFIED_ANNOTATION =
  "this quote could not be verified against the stored post";

/**
 * One brain KIND as the product can show it: the version awaiting the
 * creator's decision, and the one currently in force.
 *
 * BOTH, and both nullable, because the four combinations are four different
 * screens and collapsing any pair would make one of them lie. Nothing proposed
 * and nothing active is "you have not built one yet"; proposed with an active
 * one behind it is "you are about to replace what is in force".
 */
export type BrainDocsView = {
  proposed: BrainVersionView | null;
  active: BrainVersionView | null;
};

/**
 * A stored evidence entry does not read back from the post it names.
 *
 * REACHABLE ONLY BY DATA CORRUPTION — and that claim is now true, which it was
 * not when this class was written. The original comment said "unreachable on
 * the sanctioned path"; the sanctioned path reached it for every creator with
 * more than fifty posts, because `readVoiceBrain` resolved cited posts out of a
 * 50-row page (tenancy + compliance gates, 2026-08-29). The read is keyed on
 * the cited ids now, so a miss really does mean the row is gone.
 *
 * `onboarding_inputs` has no update path and no delete path, and
 * `validateSourceEvidence` proved the slice verbatim at write time — so
 * reaching this means a hand-run UPDATE during an incident, or a bug in one of
 * those two. Both are cases where the screen would otherwise attribute words to
 * a creator's post that are not in it, on the one screen whose entire job is
 * provenance.
 *
 * IT REFUSES THE PAGE, NOT THE FIELD, and that is the deliberate half. Dropping
 * the quote and rendering the claim anyway is the fail-open reading: the
 * creator would confirm a rule believing the product had grounded it. The
 * precedent is `activateBrainDoc`'s partial-corpus refusal — "the check cannot
 * be repeated as it was performed" — which refuses rather than checking against
 * part of the corpus.
 */
export class EvidenceUnreadableError extends ProvenanceError {
  constructor(
    readonly pointer: string,
    detail: string
  ) {
    super(
      `the quote recorded for '${pointer}' could not be read back from the post it names (${detail}). Nothing is shown rather than showing a quote we cannot prove came from you`
    );
    this.name = "EvidenceUnreadableError";
  }
}

/**
 * Read one profile's brain documents of ONE KIND for the confirm screen.
 *
 * SHARED BY ALL THREE READS (slice 3b, Stage B2) — `readVoiceBrain`,
 * `readStrategyBrain` and `readKillTestBrain` are thin wrappers around this,
 * not three copies. `readVoiceBrain`'s own history is why: the 50-row-page
 * refusal (tenancy + compliance gates, 2026-08-29) was a bug in ONE
 * implementation, and a second/third hand-copy of the fixed version is exactly
 * how such a fix regresses in one of the copies later.
 *
 * ONE READ OF EACH TABLE, then assembled in memory: the versions, and the
 * input rows the evidence points into. Not a join, because the evidence is
 * `jsonb` and the `input_id` inside it is a foreign id the composite FK cannot
 * see — the same fact `writeBrainDoc` validates around.
 */
async function readBrainKindDocs(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  kind: BrainKind
): Promise<BrainDocsView> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const ofKind = await profileScope.accessors.brainDocsByKind(kind);
  // NEWEST VERSION FIRST. `version` is server-derived as max+1 per (profile,
  // kind), so it is a total order over this creator's history of this kind —
  // unlike `created_at`, which is transaction-start time and can tie.
  const byVersionDesc = ofKind;
  const proposed = byVersionDesc.find((d) => d.status === "proposed") ?? null;
  const active = byVersionDesc.find((d) => d.status === "active") ?? null;
  if (!proposed && !active) return { proposed: null, active: null };

  // THE POSTS THE EVIDENCE ACTUALLY CITES, resolved BY ID.
  //
  // THIS WAS A PERMANENT OUTAGE AND THE COMMENT HERE ARGUED IT WAS SAFE
  // (tenancy + compliance gates, 2026-08-29). It read
  // `accessors.onboardingInputs()` — whose default page is the 50 NEWEST rows —
  // and called that "the write-side ceiling's neighbourhood". The write-side
  // ceiling is `POST_COUNT_MAX = 2_000`. Off by fortyfold, and the sentence is
  // what made the fail-the-whole-page choice below look reasonable.
  //
  // The consequence: once a cited post aged out of the newest 50, the lookup
  // missed, `claimsFor` threw `EvidenceUnreadableError`, and the PAGE refused —
  // proposed and active alike. `onboarding_inputs` has no delete path and there
  // is no un-activate, so nothing the creator could do would clear it, and a
  // paid rebuild would not help while an active version cited a fallen-out
  // post. "Fail closed, but never without a way forward" (CLAUDE.md,
  // 2026-07-30) is the lesson this broke.
  //
  // Bounded by the DOCUMENT rather than by a page: one evidence entry per claim
  // position, and no registered kind declares more than a handful. The refusal
  // below now means what it says — the input row genuinely is not there.
  const cited = new Set<string>();
  for (const doc of [proposed, active]) {
    if (!doc) continue;
    for (const e of (doc.sourceEvidence ?? []) as SourceEvidenceEntry[]) {
      if (typeof e?.inputId === "string") cited.add(e.inputId);
    }
  }
  const inputs = await profileScope.accessors.onboardingInputsByIds([...cited]);
  const byId = new Map<string, OnboardingInput>(inputs.map((i) => [i.id, i]));

  return {
    proposed: proposed ? claimsFor(proposed, byId) : null,
    active: active ? claimsFor(active, byId) : null,
  };
}

/**
 * Read this profile's `voice` brain for the confirm screen (slice 3).
 */
export async function readVoiceBrain(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<BrainDocsView> {
  return readBrainKindDocs(db, scope, profileId, "voice");
}

/**
 * Read this profile's `strategy` brain for the confirm screen (slice 3b, R6).
 *
 * Its claims cite `creator_authored` interview answers (R4) rather than
 * `own_post` quotes — `claimsFor` is the same function either way; only the
 * cited input rows' `inputClass` differs, and `BrainClaimView.source` carries
 * it so the screen can say which.
 */
export async function readStrategyBrain(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<BrainDocsView> {
  return readBrainKindDocs(db, scope, profileId, "strategy");
}

/**
 * Read this profile's `killtest` brain for the confirm screen (slice 3b, R6).
 * Same note as `readStrategyBrain` on evidence provenance.
 */
export async function readKillTestBrain(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<BrainDocsView> {
  return readBrainKindDocs(db, scope, profileId, "killtest");
}

/**
 * Assemble one version's claim views.
 *
 * Exported for its own tests: this is where "what the creator is shown" is
 * decided, and a function that only runs behind two table reads is a function
 * whose absence-and-placeholder cases have to be set up in a database.
 */
export function claimsFor(
  doc: BrainDoc,
  posts: Map<string, OnboardingInput>
): BrainVersionView {
  // THE ENUMERATOR IS THE SET, NOT THE EVIDENCE LIST AND NOT THE CONTENT KEYS.
  //
  // R9: activation refuses while any enumerated position is unconfirmed, so a
  // screen that renders a DIFFERENT set produces a document that can never
  // activate — a dead end rather than a leak, and a silent one. Deriving the
  // rendered set from the same function the activation gate calls is what makes
  // that unrepresentable instead of merely tested.
  const positions = enumerateClaimFields(doc.kind, doc.content);
  const evidence = new Map<string, SourceEvidenceEntry>();
  for (const e of (doc.sourceEvidence ?? []) as SourceEvidenceEntry[]) {
    evidence.set(e.field, e);
  }
  const confirmed = new Set(
    (Array.isArray(doc.confirmedFields) ? doc.confirmedFields : [])
      .map((f) => (f as { pointer?: unknown }).pointer)
      .filter((x): x is string => typeof x === "string")
  );

  const claims: BrainClaimView[] = positions.map((pointer) => {
    const raw = readPointer(doc.content, pointer);
    // Every registered claim leaf, in every registered kind, is a string.
    // Stated as a refusal rather than a cast: a non-string here means the
    // schema grew a shape this screen cannot render, and rendering
    // `[object Object]` beside a quote is worse than saying so.
    if (typeof raw !== "string") {
      throw new EvidenceUnreadableError(
        pointer,
        `it holds ${raw === null ? "null" : typeof raw}, and this screen renders text`
      );
    }
    const isPlaceholder = raw === CHECK;
    const entry = evidence.get(pointer);
    if (!entry) {
      // A PLACEHOLDER LEGITIMATELY HAS NO EVIDENCE. A STATED CLAIM MUST NOT.
      //
      // The compliance gate PROVED this one by rendering it (2026-08-29): the
      // shape `{isPlaceholder: false, quote: null}` used to be constructed
      // here, and the view then showed the rule text, no quote, no named
      // absence, and a checkbox reading "Yes — this is right". A claim about a
      // person with nothing behind it and an invitation to confirm it — the
      // exact fail-open R10 exists to prevent, while the two WEAKER provenance
      // failures below were both refused.
      //
      // `writeBrainDoc`'s C-28 check makes it unreachable today, two layers
      // away. That is a reason it has not happened, not a reason this function
      // may construct it.
      if (!isPlaceholder) {
        throw new EvidenceUnreadableError(
          pointer,
          "it states a rule with no quote recorded for it"
        );
      }
      return {
        pointer,
        value: raw,
        isPlaceholder,
        quote: null,
        source: null,
        confirmed: confirmed.has(pointer),
        evidenceAnnotation: null,
      };
    }
    const post = posts.get(entry.inputId);
    if (!post) {
      throw new EvidenceUnreadableError(
        pointer,
        "the post it names is not among this creator's stored posts"
      );
    }
    // RE-SLICED, then compared. Offsets are UTF-16 code units into the
    // NORMALISED stored content, which is what `validateSourceEvidence` indexed
    // them against — so this uses `.slice`, whose units are the same.
    const sliced = post.content.slice(entry.startUtf16, entry.endUtf16);
    if (sliced !== entry.quote) {
      throw new EvidenceUnreadableError(
        pointer,
        "the recorded span of that post no longer holds the recorded quote"
      );
    }
    return {
      pointer,
      value: raw,
      isPlaceholder,
      quote: sliced,
      source: {
        inputId: post.id,
        postedAt: post.createdAt,
        inputClass: post.inputClass,
      },
      confirmed: confirmed.has(pointer),
      evidenceAnnotation: null,
    };
  });

  return {
    brainDocId: doc.id,
    version: doc.version,
    status: doc.status,
    // PASSED THROUGH, and it is safe to render because of where it came from:
    // `writeBrainDoc` is the only writer of this column and it stores
    // `renderBrainReason(code, facts)` — a sentence the SERVER composed from a
    // closed code set plus numbers it counted itself. There is no string
    // parameter anywhere in that function, which is the property that makes "no
    // caller prose reaches this column" checkable by reading a signature (C-42,
    // REQ-I03). Re-rendering here would need the code, which is not stored.
    reason: doc.reason,
    claims,
    confirmedAt: doc.confirmedAt,
    activatedAt: doc.activatedAt,
    supersededAt: doc.supersededAt,
    replacedByVersion: null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Record the creator's per-field confirmation (REQ-B02).
 *
 * A WHOLE-SUBMISSION CALL rather than one POST per field, and the reason is
 * that `confirmBrainDocFields` REPLACES `confirmed_fields`: incremental writes
 * would be read-modify-write on a column two tabs can race, and the losing tab
 * would silently un-confirm fields the creator had already decided. The
 * per-field act is the tick; this is the submit that records the set of ticks.
 *
 * `asPlaceholder` TRAVELS FROM THE SCREEN and is not derived here. That is R12:
 * the value the creator was SHOWN is what gets recorded, and the capability
 * refuses it when it disagrees with what is stored — so a document that changed
 * under the reader is a named refusal rather than a confirmation of something
 * they never saw.
 */
export async function confirmVoiceFields(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string,
  confirmedFields: { pointer: string; asPlaceholder: boolean }[]
): Promise<BrainDoc> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction(async (tx) =>
    caps.confirmBrainDocFields({ brainDocId, confirmedFields }, tx)
  );
}

/**
 * Activate a confirmed version — the separate, explicit second act (R13).
 *
 * SEPARATE FROM CONFIRMATION BY DESIGN, not by accident of routing. A single
 * press that confirmed and activated would be the silent brain update R-8
 * forbids: activation is what makes the product ACT on a claim about a person,
 * and REQ-B02 puts a human decision in front of it. Every gate that makes that
 * true — the all-positions check, the confirmation sha over the pair, the echo
 * bar re-run over the recorded corpus — lives in `activateBrainDoc`.
 */
export async function activateVoice(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string
): Promise<BrainDoc> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction(async (tx) => caps.activateBrainDoc({ brainDocId }, tx));
}

/**
 * Record the creator's per-field confirmation on a `strategy` document
 * (slice 3b, R6) — SAME SHAPE as `confirmVoiceFields`, deliberately: the
 * capability underneath is already kind-agnostic (it reads `doc.kind` off the
 * row it loads), so there is nothing "strategy-specific" in this body. A
 * separate, byte-similar wrapper per kind is what keeps the AC-13
 * completeness scan's pinned surface (`tests/profile-cage.test.ts`) naming
 * each kind's confirm act explicitly, rather than one generic entry that
 * could quietly grow a fourth caller nobody reviewed.
 */
export async function confirmStrategyFields(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string,
  confirmedFields: { pointer: string; asPlaceholder: boolean }[]
): Promise<BrainDoc> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction(async (tx) =>
    caps.confirmBrainDocFields({ brainDocId, confirmedFields }, tx)
  );
}

/** Record the creator's per-field confirmation on a `killtest` document. Same note as `confirmStrategyFields`. */
export async function confirmKillTestFields(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string,
  confirmedFields: { pointer: string; asPlaceholder: boolean }[]
): Promise<BrainDoc> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction(async (tx) =>
    caps.confirmBrainDocFields({ brainDocId, confirmedFields }, tx)
  );
}

/**
 * Activate a confirmed version AS PART OF ONE COHERENT BRAIN (slice 3b, R8) —
 * the `/brain` screen's ONLY activation path, for all three kinds.
 *
 * `activateBrainDoc` (above, `activateVoice`'s capability) activates ONE
 * document and stops there; `activateBrainDocCoherent` runs the identical
 * gates and then, in the SAME transaction and under the SAME per-profile
 * lock, records a `brain_activation_snapshots` row naming every kind's
 * current active version id — the one just activated, and every OTHER kind's
 * active id carried forward unchanged. Calling `activateBrainDoc` directly
 * from a screen that lets a creator activate Voice, Strategy or Kill Test
 * would activate that one document with no record of which OTHER versions
 * were active alongside it at that moment — exactly the fact R9 needs a later
 * generation to be able to name.
 *
 * ONE FUNCTION FOR ALL THREE KINDS, unlike the confirm trio above: activation
 * is inherently a whole-brain act (that is the entire point of R8), so there
 * is no per-kind variant to keep separate — `brainDocId` alone determines
 * which document is being activated; `activateBrainDocCoherent` reads its
 * `kind` off the row.
 */
export async function activateBrainCoherent(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string
): Promise<ActivateBrainDocCoherentResult> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction(async (tx) =>
    caps.activateBrainDocCoherent({ brainDocId }, tx)
  );
}

/** History is the one surface where an unreadable old quote annotates instead of taking the page down. */
export function claimsForHistory(
  doc: BrainDoc,
  posts: Map<string, OnboardingInput>
): BrainVersionView {
  const positions = enumerateClaimFields(doc.kind, doc.content);
  const evidence = new Map<string, SourceEvidenceEntry>();
  for (const raw of Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : []) {
    if (typeof (raw as { field?: unknown })?.field === "string") {
      evidence.set((raw as SourceEvidenceEntry).field, raw as SourceEvidenceEntry);
    }
  }
  const confirmed = new Set(
    (Array.isArray(doc.confirmedFields) ? doc.confirmedFields : [])
      .map((field) => (field as { pointer?: unknown }).pointer)
      .filter((pointer): pointer is string => typeof pointer === "string")
  );
  const claims = positions.map((pointer): BrainClaimView => {
    const raw = readPointer(doc.content, pointer);
    const value = typeof raw === "string" ? raw : CHECK;
    const isPlaceholder = value === CHECK;
    const entry = evidence.get(pointer);
    if (!entry) {
      return {
        pointer,
        value,
        isPlaceholder,
        quote: null,
        source: null,
        confirmed: confirmed.has(pointer),
        evidenceAnnotation: isPlaceholder ? null : EVIDENCE_UNVERIFIED_ANNOTATION,
      };
    }
    const post =
      typeof entry.inputId === "string" ? posts.get(entry.inputId) : undefined;
    // Match the exporter's annotate-mode honesty exactly. JavaScript slice
    // coerces strings/fractions and clamps out-of-bounds values; validating
    // before slicing stops malformed history being presented as verified.
    const verified =
      post !== undefined &&
      typeof entry.quote === "string" &&
      typeof entry.startUtf16 === "number" &&
      Number.isInteger(entry.startUtf16) &&
      typeof entry.endUtf16 === "number" &&
      Number.isInteger(entry.endUtf16) &&
      entry.startUtf16 >= 0 &&
      entry.endUtf16 >= entry.startUtf16 &&
      entry.endUtf16 <= post.content.length &&
      post.content.slice(entry.startUtf16, entry.endUtf16) === entry.quote;
    const quote = verified
      ? post.content.slice(entry.startUtf16, entry.endUtf16)
      : null;
    return {
      pointer,
      value,
      isPlaceholder,
      quote: verified ? quote : null,
      source: verified
        ? { inputId: post.id, postedAt: post.createdAt, inputClass: post.inputClass }
        : null,
      confirmed: confirmed.has(pointer),
      evidenceAnnotation: verified ? null : EVIDENCE_UNVERIFIED_ANNOTATION,
    };
  });
  return {
    brainDocId: doc.id,
    version: doc.version,
    status: doc.status,
    reason: doc.reason,
    claims,
    confirmedAt: doc.confirmedAt,
    activatedAt: doc.activatedAt,
    supersededAt: doc.supersededAt,
    replacedByVersion: null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Both sanctioned replacement transitions carry an exact timestamp identity:
 * proposal replacement uses the new version's `createdAt`; active replacement
 * uses its `activatedAt`. Either names the actual replacement without assuming
 * that the nearest higher version caused the transition.
 */
export function replacementVersionFor(
  doc: BrainDoc,
  versions: readonly BrainDoc[]
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

/** All versions and statuses of one kind, newest version first. */
export async function readBrainHistory(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  kind: BrainKind
): Promise<BrainVersionView[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const docs = await profileScope.accessors.brainDocsByKind(kind);
  const cited = new Set<string>();
  for (const doc of docs) {
    for (const raw of Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : []) {
      const inputId = (raw as { inputId?: unknown })?.inputId;
      if (typeof inputId === "string") cited.add(inputId);
    }
  }
  const inputs = await profileScope.accessors.onboardingInputsByIds([...cited]);
  const byId = new Map(inputs.map((input) => [input.id, input]));
  return docs.map((doc) => ({
    ...claimsForHistory(doc, byId),
    replacedByVersion: replacementVersionFor(doc, docs),
  }));
}

export type BrainClaimEdit = { pointer: string; value: string };

function normaliseEditedValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new BrainEditLimitError("every changed value must be text");
  }
  return value.normalize("NFC").replace(/\r\n/g, "\n");
}

function normaliseEditedPointer(pointer: unknown): string {
  if (typeof pointer !== "string") {
    throw new BrainEditLimitError("every changed field must have a text pointer");
  }
  return pointer.normalize("NFC");
}

function codePointLength(value: string): number {
  return [...value].length;
}

function writePointer(root: unknown, pointer: string, value: string): void {
  if (!pointer.startsWith("/") || pointer === "/") {
    throw new ProvenanceError(`'${pointer}' is not a claim position`);
  }
  const parts = pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
    throw new ProvenanceError(`'${pointer}' is not a writable claim position`);
  }
  let node = root as Record<string, unknown> | unknown[];
  for (const part of parts.slice(0, -1)) {
    const next = Array.isArray(node) ? node[Number(part)] : node[part];
    if (typeof next !== "object" || next === null) {
      throw new ProvenanceError(`'${pointer}' is not a claim position in this version`);
    }
    node = next as Record<string, unknown> | unknown[];
  }
  const leaf = parts.at(-1)!;
  if (Array.isArray(node)) {
    const index = Number(leaf);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > node.length ||
      (index === node.length && node.length >= BRAIN_EDIT_LIST_MAX)
    ) {
      throw new ProvenanceError(`'${pointer}' is not a claim position in this version`);
    }
    node[index] = value;
  } else {
    if (!Object.hasOwn(node, leaf)) {
      throw new ProvenanceError(`'${pointer}' is not a claim position in this version`);
    }
    node[leaf] = value;
  }
}

function creatorEditInput(edits: readonly BrainClaimEdit[]) {
  let content = "";
  const spans = new Map<
    string,
    { quote: string; startUtf16: number; endUtf16: number }
  >();
  for (const edit of edits) {
    if (content.length > 0) content += "\n\n";
    content += `${edit.pointer}\n`;
    const startUtf16 = content.length;
    const quote = normaliseEditedValue(edit.value);
    content += quote;
    spans.set(edit.pointer, { quote, startUtf16, endUtf16: content.length });
  }
  return { content, spans };
}

/** One creator-authored input and one new proposed version, in one transaction. */
export async function editBrainDocument(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string,
  submittedEdits: readonly BrainClaimEdit[]
): Promise<BrainDoc> {
  if (!Array.isArray(submittedEdits) || submittedEdits.length === 0) {
    throw new ProvenanceError("an edit submission must change at least one claim position");
  }
  if (submittedEdits.length > BRAIN_EDIT_MAX_FIELDS) {
    throw new BrainEditLimitError(
      `it changes ${submittedEdits.length} fields and the per-submission limit is ${BRAIN_EDIT_MAX_FIELDS}`
    );
  }
  const submitted = submittedEdits.map((edit) => ({
    pointer: normaliseEditedPointer(edit?.pointer),
    value: normaliseEditedValue(edit?.value),
  }));
  let aggregate = 0;
  for (const edit of submitted) {
    const pointerLength = codePointLength(edit.pointer);
    const valueLength = codePointLength(edit.value);
    if (pointerLength > BRAIN_EDIT_POINTER_MAX) {
      throw new BrainEditLimitError(
        `a field pointer is ${pointerLength} characters and the limit is ${BRAIN_EDIT_POINTER_MAX}`
      );
    }
    if (valueLength > BRAIN_EDIT_VALUE_MAX) {
      throw new BrainEditLimitError(
        `'${edit.pointer}' is ${valueLength} characters and the per-field limit is ${BRAIN_EDIT_VALUE_MAX}`
      );
    }
    aggregate += pointerLength + 1 + valueLength + (aggregate === 0 ? 0 : 2);
  }
  if (aggregate > BRAIN_EDIT_TOTAL_MAX) {
    throw new BrainEditLimitError(
      `the normalized submission is ${aggregate} characters and the total limit is ${BRAIN_EDIT_TOTAL_MAX}`
    );
  }
  const pointers = new Set<string>();
  for (const edit of submitted) {
    if (pointers.has(edit.pointer)) {
      throw new ProvenanceError(`'${edit.pointer}' is edited twice in one submission`);
    }
    pointers.add(edit.pointer);
  }

  return db.transaction(async (tx) => {
    const txScope = await ProfileScope.mint(tx, scope, profileId);
    const base = (await txScope.accessors.brainDocs()).find((doc) => doc.id === brainDocId);
    if (!base) throw new ProfileAccessError();
    const versions = await txScope.accessors.brainDocsByKind(base.kind);
    const editable = authoritativeEditableBrainDoc(versions);
    if (editable?.id !== base.id) {
      throw new ProvenanceError(STALE_BRAIN_EDIT_DETAIL);
    }
    const edits = submitted.filter(
      (edit) => readPointer(base.content, edit.pointer) !== edit.value
    );
    if (edits.length === 0) {
      throw new ProvenanceError("the submitted edit does not change this brain version");
    }
    const changedPointers = new Set(edits.map((edit) => edit.pointer));
    const content = structuredClone(base.content);
    // `metric.key` is a required serverOwned input position. The write funnel
    // strips it before storage, so a stored Strategy version cannot be fed
    // straight back through that funnel without reintroducing a disposable
    // server value. No consumer reads this value; see interview-ops.ts's
    // `slugifyForKey` docblock. Rehydrate it here because creator edits are the
    // first write path whose base is already-stripped stored content.
    if (base.kind === "strategy") {
      const metric = (content as { metric?: unknown }).metric;
      if (typeof metric === "object" && metric !== null && !("key" in metric)) {
        (metric as Record<string, unknown>).key = "unset";
      }
    }
    for (const edit of edits) writePointer(content, edit.pointer, edit.value);
    const positions = new Set(enumerateClaimFields(base.kind, content));
    for (const edit of edits) {
      if (!positions.has(edit.pointer)) {
        throw new ProvenanceError(`'${edit.pointer}' is not a claim position in this document`);
      }
    }

    const caps = writeCapabilities(txScope);
    const authored = creatorEditInput(edits);
    const input = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: authored.content,
      fieldKey: "creator_edit",
    }, tx);
    const evidence = (Array.isArray(base.sourceEvidence) ? base.sourceEvidence : [])
      .filter((raw) => {
        const field = (raw as { field?: unknown }).field;
        return typeof field === "string" && !changedPointers.has(field) && positions.has(field);
      }) as SourceEvidenceEntry[];
    for (const edit of edits) {
      if (edit.value === CHECK) continue;
      evidence.push({ field: edit.pointer, inputId: input.id, ...authored.spans.get(edit.pointer)! });
    }
    // This is the one edit refusal whose cause the browser can explain without
    // guessing. `writeBrainDoc` still owns the general provenance constraint;
    // the edit composer names this creator-actionable special case before it
    // reaches that broader `ProvenanceError`. The surrounding transaction
    // rolls the creator_authored input back with the refused version.
    if (evidence.length === 0) throw new BrainEditEmptyError();
    return caps.writeBrainDoc(
      { kind: base.kind, content, sourceEvidence: evidence, reason: { code: "creator_edit" } },
      tx,
      base.id
    );
  });
}

export type DeclaredMetricEdit = {
  label: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
  /** undefined leaves the stored value alone; null explicitly clears it to the named [check] absence. */
  platform?: string | null;
  /** undefined leaves the stored value alone; null explicitly clears it to the named [check] absence. */
  window?: string | null;
};

/** The declared metric remains structured Strategy content; it is not free-form metadata. */
export async function editDeclaredMetric(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  brainDocId: string,
  metric: DeclaredMetricEdit
): Promise<BrainDoc> {
  return editBrainDocument(db, scope, profileId, brainDocId, [
    { pointer: "/metric/label", value: metric.label },
    { pointer: "/metric/unit", value: metric.unit },
    { pointer: "/metric/direction", value: metric.direction },
    ...(metric.platform === undefined
      ? []
      : [{ pointer: "/metric/platform", value: metric.platform ?? CHECK }]),
    ...(metric.window === undefined
      ? []
      : [{ pointer: "/metric/window", value: metric.window ?? CHECK }]),
  ]);
}
