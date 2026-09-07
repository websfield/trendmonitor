// The two app-reachable onboarding operations (slice 1).
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY: both compose
// `ProfileScope.mint` with a write capability, and both need a `db` handle a
// test can supply. Written inline in `app-server.ts` they would be reachable
// only through `getServerDb()`, i.e. only against a real `DATABASE_URL` — so
// every assertion about them would have to run in a Docker suite, and the
// cross-profile isolation case in particular would have had no cheap home.
// `app-server.ts` binds them to the server handle; this file is what the
// package's own suites drive.
//
// WHY THEY LIVE IN `packages/db` AT ALL, when `createProfile` may not (R-30
// constraint 2): neither reads config and neither needs a resolved tier.
// Pasting one's own post is not an entitlement — it stores text the creator
// typed — so there is no cap to consult and no second tier authority to create.
import type { DbLike } from "./db-like";
import type { InputClass, OnboardingInput } from "./onboarding-schema";
import {
  ProfileScope,
  loadReferenceSafetyContext,
  writeCapabilities,
  type LedgerPage,
  type WorkspaceScope,
} from "./with-workspace";
import { PostAttestationError, PostContentError } from "./errors";
import {
  evaluateReferenceSafety,
  type ReferenceSafetyRefusal,
} from "./echo";
import { POST_CONTENT_MAX, POST_COUNT_MAX } from "./storage-limits";

export { POST_CONTENT_MAX, POST_COUNT_MAX } from "./storage-limits";

/**
 * The most one pasted post may hold, in code points.
 *
 * A CEILING RATHER THAN NO CEILING, because `onboarding_inputs.content` is
 * `text` with no length constraint and this slice is the first path on which a
 * browser reaches it. The number is sized off what the sources actually permit
 * — an Instagram caption caps at 2,200 characters and a YouTube description at
 * 5,000 — so 20,000 refuses no real post while keeping one paste from being a
 * megabyte. It is a product limit, not a safety property: it lives here beside
 * its refusal rather than in versioned config, because moving it is a code
 * change with a test, not an operator dial (the `ECHO_MIN_SEGMENTS` precedent).
 */

/**
 * The most REFERENCE posts one profile may hold (R3, slice 4).
 *
 * ITS OWN CEILING, narrower than `POST_COUNT_MAX` and checked in ADDITION to
 * it, for the corpus-starvation reason `ownPostsNewest`'s docblock in
 * `with-workspace.ts` already names: once `reference` inputs exist, an
 * unbounded reference corpus would push a creator's `own_post` rows out of
 * the voice corpus's read window (`ONBOARDING_PAGE_MAX` / 50) even though the
 * class-filtered read is bounded correctly — the starvation is at the WRITE
 * side, not the read side, and a read-side fix cannot undo it. REQ-B01 asks
 * for 2-3 reference posts per creator; 50 is generous headroom above real use
 * and far short of crowding out the write-side ceiling that matters more.
 *
 * A CODE CONSTANT, like `POST_CONTENT_MAX` and `POST_COUNT_MAX` beside it —
 * not versioned config, for the same reason: moving it is a code change with
 * a test, not a deploy-free operator dial on a compliance-adjacent bound.
 */
export const REFERENCE_COUNT_MAX = 50;

/**
 * The most onboarding inputs one profile may hold.
 *
 * THE WRITE HALF OF THE INTAKE BOUND (production gate, 2026-08-27). Round 1
 * flagged that nothing bounded this path in any dimension; round 1's fix
 * clamped the READ and left the write untouched, which is half a fix. A free
 * signup gets one profile (`profileCaps.free = 1`) and could then append
 * unlimited 20 KB rows into a table that is immutable, has no delete path and
 * has no dedupe — against the same self-hosted Postgres that holds the credit
 * ledger. Disk exhaustion there takes the money path down for every tenant and
 * the only remedy is hand-written SQL.
 *
 * 2,000 is chosen to be far above any real back catalogue (a prolific creator
 * posting daily for five years has ~1,800) and far below a denial-of-service.
 * It is a product limit with a typed refusal, not a safety property dressed as
 * one — and it is deliberately NOT in versioned config, for the reason
 * `POST_CONTENT_MAX` is not: moving it is a code change with a test.
 */

/**
 * Validate a pasted post, measuring the value that will actually be STORED.
 *
 * THE CEILING IS MEASURED ON THE NFC FORM, and the previous version of this
 * function was not — it measured the raw string under a comment asserting
 * "normalisation only ever shortens (CRLF→LF), so a raw string inside the
 * ceiling is inside it after the write too". That is false, and the compliance
 * gate ran the counterexample: `"ཱི"` is one code point that NFC expands to
 * TWO, so `"ཱི".repeat(20000)` passes a 20,000 ceiling and stores 40,000.
 * `characterCount` on the list then reads the stored value and displays a
 * number the refusal copy says is impossible. A comment claiming a property is
 * not the property (CLAUDE.md 2026-07-30), and this one was mine.
 *
 * NORMALISING HERE IS NOT A SECOND DEFINITION of the stored bytes. `normalize`
 * is idempotent and pure; the value that lands in the column still comes from
 * the one place that produces it (`appendOnboardingInput`, A-8). What this
 * computes is a length, and it is thrown away.
 *
 * `trim()` for emptiness, because a textarea submitted with a stray newline is
 * empty to a person and one character to `length`.
 */
function assertPostContent(raw: string): void {
  if (raw.trim().length === 0) {
    throw new PostContentError("it is blank");
  }
  // Code points, not `.length`: a single emoji is several UTF-16 units, so a
  // UTF-16 ceiling spends a creator's budget several times over on one
  // character they typed once.
  const points = [...raw.normalize("NFC")].length;
  if (points > POST_CONTENT_MAX) {
    throw new PostContentError(
      `it is ${points} characters and the limit is ${POST_CONTENT_MAX}`
    );
  }
}

/**
 * Store one of the creator's OWN posts.
 *
 * `input_class` IS NOT A PARAMETER, and its absence is the requirement (R11).
 * The enum has three values and two rules rest on it — `validateSourceEvidence`
 * refuses a `reference` input as the provenance of a `voice` document, and
 * R-30's corpus-wide substring bar is owed on the same column — so a caller who
 * can name the class can label somebody else's post `own_post` and switch both
 * off. Slice 4 is where references arrive, with G-12 (an `own_post` label
 * switches both R-3 controls off) closing beside them; until then the only
 * value this path can produce is the one it hard-codes.
 *
 * `attested` IS REQUIRED AND HAS NO DEFAULT (R8, slice 3 — G-12's creator
 * half). It is the creator's explicit "I wrote this", and the reason it is a
 * parameter here rather than a check in the server action is in
 * `PostAttestationError`'s docblock: the label this function hard-codes is what
 * switches both R-3 controls off, so the assertion behind it belongs at every
 * call site rather than at the one route that happens to exist today. No
 * default value, deliberately — a defaulted `true` means a caller who never
 * thought about authorship asserts it anyway, which is the sentence-not-an-act
 * state this parameter exists to leave.
 */
export async function appendOwnPost(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  content: string,
  attested: boolean
): Promise<OnboardingInput> {
  // BEFORE the content check, so a creator who filled the textarea and forgot
  // the tick is told about the tick rather than about their text.
  if (attested !== true) throw new PostAttestationError();
  assertPostContent(content);
  // `mint` verifies the profile belongs to THIS scope's workspace and refuses
  // foreign, nonexistent and malformed ids with one message. It is also where
  // `assertScoped(scope)` runs — this function forwards its own scope and
  // asserts nothing itself, which is the shape `tests/profile-cage.test.ts`
  // checks by argument identity rather than by name.
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  // Fast precheck for the browser-facing PostContentError copy. The hard
  // capability below repeats the scoped count while holding the profile's
  // advisory transaction lock, so concurrent appends cannot exceed the exact
  // POST_COUNT_MAX ceiling and a direct capability caller cannot bypass it.
  const existing = await profileScope.accessors.countOnboardingInputs();
  if (existing >= POST_COUNT_MAX) {
    throw new PostContentError(
      `this creator profile already holds ${existing} posts and the limit is ${POST_COUNT_MAX}`
    );
  }
  return writeCapabilities(profileScope).appendOnboardingInput({
    inputClass: "own_post",
    content,
  });
}

/**
 * Store one post the creator admires but did not write themselves (slice 4,
 * R1).
 *
 * A SIBLING OF `appendOwnPost`, NOT A WIDENING OF IT — same shape this file's
 * own header gives for why `input_class` is not a parameter on either
 * function: a caller who can NAME the class can mislabel somebody else's post
 * `own_post` and switch off both of R-3's controls (G-12). This function
 * hard-codes `reference` the same way its sibling hard-codes `own_post`.
 *
 * NO `attested` PARAMETER (R2). `PostAttestationError`'s message is hard-coded
 * to authorship ("confirming that you wrote it"), and a reference post is BY
 * DEFINITION somebody else's — reusing that control here would ask a creator
 * to tick a box asserting something false about their own submission. The
 * intake's own copy says what the label means instead of asking for an
 * attestation that would not fit it.
 *
 * `sourceUrl` IS OPTIONAL (question 2, phase-4 card). It gives a `reference`
 * row a provenance trail an `own_post` does not need — a later audit can ask
 * "where did this come from" of exactly the class where the question matters
 * — and it is never required, because plenty of legitimate reference material
 * (a screenshot, a transcript typed from memory) has no URL.
 */
export async function appendReferencePost(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  content: string,
  sourceUrl?: string
): Promise<OnboardingInput> {
  assertPostContent(content);
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  // TWO CEILINGS, NOT ONE (R3). The all-inputs cap below is shared with
  // `appendOwnPost`; the reference-specific cap is checked FIRST because it is
  // the tighter bound and the one whose refusal names the actually-relevant
  // number — a creator at 50 references and 10 own posts should be told about
  // the 50, not about `POST_COUNT_MAX`'s 2,000.
  const existingReferences = await profileScope.accessors.countReferencePosts();
  if (existingReferences >= REFERENCE_COUNT_MAX) {
    throw new PostContentError(
      `this creator profile already holds ${existingReferences} reference posts and the limit is ${REFERENCE_COUNT_MAX}`
    );
  }
  const existing = await profileScope.accessors.countOnboardingInputs();
  if (existing >= POST_COUNT_MAX) {
    throw new PostContentError(
      `this creator profile already holds ${existing} posts and the limit is ${POST_COUNT_MAX}`
    );
  }
  return writeCapabilities(profileScope).appendOnboardingInput({
    inputClass: "reference",
    content,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  });
}

export type CandidateReferenceSafetyResult =
  | {
      decision: "accept";
      checkedReferenceCount: number;
      /** Pasted free text carries no SourceEvidenceEntry citation spans. */
      candidateReferenceSpanCount: 0;
    }
  | {
      decision: "refuse";
      reason: ReferenceSafetyRefusal["reason"];
      message: string;
      match: ReferenceSafetyRefusal["match"];
      checkedReferenceCount: number;
      /** Pasted free text carries no SourceEvidenceEntry citation spans. */
      candidateReferenceSpanCount: 0;
    };

/**
 * Read-only candidate check beside reference intake (R14/R14a).
 *
 * Scope, current reference corpus and retained citation spans are all derived
 * server-side. The candidate and decision are never inserted or updated, no
 * model is called, and no credit path is reachable from this module.
 *
 * Free text has no SourceEvidenceEntry spans. It therefore passes an explicit
 * empty new-span population to the exact combined decision used by hard
 * writes. The hard write remains authoritative: it reloads the corpus and
 * supplies its real spans rather than accepting any preview state or token.
 */
export async function checkCandidateReferenceSafety(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  candidate: string
): Promise<CandidateReferenceSafetyResult> {
  assertPostContent(candidate);
  return db.transaction(async (tx) => {
    const profileScope = await ProfileScope.mint(tx, scope, profileId);
    const context = await loadReferenceSafetyContext(profileScope, tx);
    const decision = evaluateReferenceSafety({
      content: candidate,
      references: context.references,
      newSpans: [],
      retainedSpans: context.retainedSpans,
    });
    const common = {
      checkedReferenceCount: context.references.length,
      candidateReferenceSpanCount: 0 as const,
    };
    return decision.decision === "accept"
      ? { decision: "accept", ...common }
      : {
          decision: "refuse",
          reason: decision.reason,
          message: decision.detail,
          match: decision.match,
          ...common,
        };
  });
}

/**
 * The creator's stored onboarding inputs, newest first.
 *
 * Ordering belongs to the accessor rather than to this function or to the page
 * — one display order, one place — see `ProfileAccessors.onboardingInputs`.
 *
 * `inputClass` IS OPTIONAL AND PASSES STRAIGHT THROUGH TO THE QUERY PREDICATE
 * (tenancy gate CHANGE, slice 4 round 2, 2026-08-29): `/onboarding` reads TWO
 * class-filtered lists ("Your posts" and the reference-post list) through
 * this one function, and each must filter IN THE QUERY — a class filter
 * applied to an already-paged result silently shows the wrong page the
 * moment a creator has more of the OTHER class than the page size.
 */
export async function listOnboardingInputs(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  page?: LedgerPage,
  inputClass?: InputClass
): Promise<OnboardingInput[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.onboardingInputs(page, inputClass);
}

/**
 * Mint a `ProfileScope` for a caller in ANOTHER PACKAGE.
 *
 * `ProfileScope` is exported from this package as a TYPE ONLY — deliberately,
 * and `tests/profile-cage.test.ts` pins it (compile-red 8+9): a value export
 * would hand every caller `.mint`'s sibling constructor to reach for. That is
 * the right default, and it leaves `@respin/credits` — which owns the operations
 * that need the resolved tier and cannot move into this package — with no way to
 * obtain one at all.
 *
 * This is that way, and it is a VERIFYING mint, not a trust mint: it is a thin
 * pass-through to `ProfileScope.mint`, which runs `assertScoped` on the
 * workspace scope and refuses a profile id that does not belong to it, with a
 * message byte-identical to the one for a profile that does not exist. There
 * is no argument here that skips a check — the only thing this adds is a
 * function-shaped door where the class is type-only.
 */
export async function mintProfileScope(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<ProfileScope> {
  return ProfileScope.mint(db, scope, profileId);
}
