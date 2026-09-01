// The decisions `/onboarding` makes, as PURE functions.
//
// The rule this file exists to obey is the one the round-2 CHANGE 6 finding
// wrote for the usage page: "decisions live in pure functions, not in page
// bodies". An inline ternary in a server component is a decision nothing can
// assert — the page itself needs a session and a database, and no test in this
// repo executes one — so every branch worth being right about is here, where a
// unit test drives it with a fixture.

/** Which step `/onboarding` is on. */
export type OnboardingStep = "create-profile" | "paste-posts";

/**
 * A profile exists → paste. None → create one.
 *
 * `profileCount` rather than a boolean, so the caller cannot accidentally pass
 * "there is a workspace" (which is always true on this page) in place of "there
 * is a profile" — the two are different questions and the M2b-1 register has an
 * entry for each time they were conflated.
 */
export function onboardingStep(profileCount: number): OnboardingStep {
  return profileCount > 0 ? "paste-posts" : "create-profile";
}

/**
 * How many characters a pasted post holds, as a person would count them.
 *
 * CODE POINTS, not `String.length`. `"héllo 👋".length` is 8 UTF-16 units for 7
 * characters a reader sees, and the gap widens with every emoji — a count shown
 * beside text the creator can see has to agree with the text. Stated honestly:
 * this still over-counts a ZWJ sequence (a family emoji is several code points
 * and one glyph), which is the direction that over-reports rather than
 * under-reports, and closing it means an `Intl.Segmenter` in the render path for
 * a number that is informational.
 *
 * It counts the STORED content, so it is a count of what the product kept — the
 * write normalises CRLF→LF, so a Windows paste is not counted twice per line.
 */
export function characterCount(content: string): number {
  return [...content].length;
}

/**
 * What the paste step says about the cap, in words, with no number invented.
 *
 * Both numbers are read server-side from the active config document and the
 * scoped count; neither is a constant here. If they were, a config change would
 * move the enforced cap and leave the sentence claiming the old one — which is
 * the "a comment claiming a property is not the property" failure applied to
 * copy a paying customer reads.
 */
export function capSentence(
  tier: string,
  cap: number,
  used: number
): string {
  const plural = cap === 1 ? "profile" : "profiles";
  return `Your ${tier} plan includes ${cap} creator ${plural}. You are using ${used}.`;
}

/**
 * Whether the create-profile form should be offered at all.
 *
 * Refusing at the SERVER before the form renders, as well as inside
 * `createProfile`, is deliberate belt-and-braces: the form being absent is not
 * the enforcement (a server action is a POST endpoint reachable without the
 * page ever rendering, which is why it carries its own gate), it is the
 * courtesy. The enforcement is `ProfileCapError`, and `capReached` must never
 * become the only check.
 */
export function capReached(used: number, cap: number): boolean {
  return used >= cap;
}

/**
 * What the reference panel says about its own count (slice 4, R3).
 *
 * Both numbers read from the server's own count and ceiling — never a
 * constant here — for the same reason `capSentence` states: a comment
 * claiming a number is not the number, and a cap that only lives in prose
 * drifts from the cap `appendReferencePost` actually enforces.
 */
export function referenceCountSentence(used: number, max: number): string {
  const plural = max === 1 ? "post" : "posts";
  return `You have added ${used} of up to ${max} reference ${plural}.`;
}

// ------------------------------------------------- the refusals THIS screen
//
// THE COMPLIANCE GATE'S FINDING (2026-08-27), and it is the one that matters
// most on this file. The page fed `billingErrorFromCode`, which maps ANY of the
// 33 shared codes to copy — so `/onboarding?e=<anything>` rendered whatever
// that code says. A paused workspace pressing "Create profile" genuinely lands
// on `?e=workspace_paused`, whose shared copy talks about "building or updating
// a creator brain" and about credits: a brain and a credit spend claimed on the
// one screen R12 governs, by a slice that does neither. A mechanical scan of
// all 33 found forbidden words in 23 of them.
//
// Two fixes, and both are needed:
//   1. a CLOSED set of codes this screen's own actions can emit, so an
//      arbitrary `?e=` cannot render arbitrary product copy here;
//   2. onboarding-specific copy for the codes whose shared wording is true
//      elsewhere and over-promising here.
//
// The shared copy is NOT edited: on `/usage` and `/settings/billing` — screens
// that do have credits and will have brains — it is accurate. This is a
// per-surface override, which is why it lives beside the surface.

import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../billing-errors";

/**
 * Every code the two onboarding actions can actually produce.
 *
 * Derived by reading their call graph: `createProfile` can raise
 * ScopeForgeryError, ProfileRoleError, WorkspacePausedError, ClockSkewError,
 * ConfigUnavailableError, ProfileCapError and ProfileNameError;
 * `appendOwnPost` can raise PostContentError, ProfileAccessError and
 * ScopeForgeryError; both go through `withWorkspace`, which raises
 * WorkspaceAccessError. `unknown` is the fallback for anything else.
 *
 * A code outside this set renders NOTHING rather than product copy from
 * another surface.
 */
export const ONBOARDING_ERROR_CODES = [
  "profile_cap",
  "profile_role",
  "profile_name",
  "post_content",
  // Capability-wide immutable-storage bounds. Paste/reference and interview
  // submission can reach the input limit; inference and interview submission
  // can reach the Brain document/version limits through the sole writer.
  "onboarding_input_limit",
  "brain_document_limit",
  "brain_version_limit",
  // Slice 3's R8 attestation refusal. `appendOwnPost` now raises it, so it is
  // in this screen's call graph and belongs in this list — omitted, it would
  // degrade to `unknown` and tell a creator who forgot one tick that the
  // product had malfunctioned.
  "post_attestation",
  // SLICE 3's SPEND PATH, and the browser walk is what found these missing.
  // `inferVoice` composes `assembleVoicePrompt` (NotEnoughPostsError) and
  // `parseVoiceReply` (AssemblyError) around `runInference`, so both are
  // refusals THIS screen renders — and a real unparseable model reply rendered
  // "Something went wrong" to a creator whose posts had just been sent to a
  // vendor. `brain_pointer_divergence` joins them from the same call graph.
  "not_enough_posts",
  "inference_unusable",
  "llm_truncated",
  "uncharged_attempt_cap",
  "brain_pointer_divergence",
  "workspace_paused",
  "config_unavailable",
  "profile_access",
  "scope_forgery",
  "workspace_access",
  "clock_skew",
  // SLICE 2a — the metered run. Derived the same way: `runInference` gates in
  // order (scope -> role -> archived -> pause -> config -> price -> balance ->
  // provider -> debit), and each gate has a typed class the facade re-exports.
  // A code missing here does not vanish — it degrades to `unknown` — but it
  // degrades to neutral copy on the one screen that now spends money, so the
  // list is derived from the call graph rather than from the happy path.
  "inference_role",
  "profile_archived",
  "topup_in_flight",
  "insufficient_credits",
  "config_not_migrated",
  "llm_unavailable",
  // SLICE 6 WIDENED `runInference` WITHOUT TOUCHING THIS SCREEN, and the
  // derived scan below is what caught it rather than a browser walk this time.
  // `priceOf` and `requiredConfigPaths` were generalised from the hard-coded
  // onboarding pair to a per-purpose switch (R13), and the `default:` branch of
  // both throws `UnpricedOperationError` — a class this screen's own spend path
  // can now raise, on the file (`inference.ts`) that has been in
  // `SPEND_PATH_SOURCES` since slice 2a. Omitted, an operator misconfiguration
  // would render "Something went wrong" to a creator on the screen that spends
  // a credit. This is the population lesson working in the direction it was
  // written for: the list did not have to be re-derived by hand, the scan
  // demanded the entry.
  "unpriced_operation",
  // Both halves of the two paths the shared copy used to get wrong: a vendor
  // failure the vendor still billed us for, and a debit refused after the
  // model had already answered. Omitting either would degrade the honest
  // copy back to the neutral fallback on the screen that spends the credit.
  "llm_attempt_recorded",
  "debit_refused_after_call",
  // THE CONCURRENCY BOUND'S TWO REFUSALS (tech-spec S6 / R-39). They were
  // added to `billing-errors.ts` and NOT here, and the compliance gate proved
  // the consequence by rendering it: `page.tsx` builds `refusalCopy` from THIS
  // list, so `run-outcome.tsx` fell through to `unknown` and told a creator who
  // hit their plan's limit that the product had malfunctioned, pointing them at
  // a server log they cannot read. 194 UI tests stayed green.
  //
  // The comment above this block predicted exactly that and the list still fell
  // behind the call graph, so the prediction is no longer the control: see
  // "the screen's code set is DERIVED from what runInference throws" in
  // `tests/onboarding-ui.test.tsx`.
  "run_slot_busy",
  "server_at_capacity",
  "ledger_integrity",
  // SLICE 4. `inferVoice` composes `writeBrainDoc`, which has always run
  // `echo.ts`'s bar over the inferred voice content against this profile's
  // reference-post corpus on EVERY write — the inference path's own write
  // included — and now, on this slice, that bar can actually refuse (it was
  // dormant until a `reference` input could exist at all). Derived from the
  // widened `SPEND_PATH_SOURCES` scan in `tests/onboarding-ui.test.tsx`
  // (`packages/db/src/echo.ts`), not guessed: `reference_echo` is the new
  // refusal this slice adds, and `provenance` / `brain_content_walk` /
  // `segmenter_unavailable` are that same file's other constructions the scan
  // surfaced — latent since slice 3, unreachable on today's happy path, but
  // real refusals `writeBrainDoc` has always been able to raise from here.
  "reference_echo",
  "provenance",
  "brain_content_walk",
  "segmenter_unavailable",
  "unknown",
] as const satisfies readonly BillingErrorCode[];

/**
 * Copy for the codes whose SHARED wording is honest elsewhere and a promise
 * here. Each says what this screen actually does.
 */
const ONBOARDING_OVERRIDES: Partial<Record<BillingErrorCode, BillingErrorCopy>> = {
  workspace_paused: {
    title: "This workspace's subscription is paused",
    detail:
      "While a workspace is paused, nothing new can be added to it. Nothing you have already saved was changed or removed. Resume the subscription on the billing page and try again.",
  },
  profile_archived: {
    title: "This creator profile is archived",
    detail:
      "Nothing runs for an archived profile. Everything you have saved against it is untouched — archiving only takes the profile out of your plan's allowance. Nothing was spent. Reactivate the profile first if you want to run this.",
  },
  config_unavailable: {
    title: "This server's settings could not be read",
    detail:
      "Your creator profile allowance is set in the server's stored settings, and that document could not be read, so the action stopped rather than guessing. Nothing was created. An operator needs to seed or repair it; nothing you have saved is affected.",
  },
};

/**
 * The copy `/onboarding` renders for a `?e=` code — closed set, overrides
 * applied. Returns `null` for anything this screen's actions cannot emit.
 */
export function onboardingErrorFor(
  raw: string | undefined
): BillingErrorCopy | null {
  if (!raw) return null;
  // AN UNRECOGNISED CODE FALLS BACK TO `unknown`, it does not vanish.
  //
  // Returning `null` made the failure mode SILENT: a code the actions emit but
  // this hand-derived list omits would render no alert at all, and the creator
  // would get the form back with no explanation of why their work did not save
  // (compliance gate, 2026-08-27). `unknown`'s copy is surface-neutral, so the
  // `?e=` channel stays closed against another surface's product copy while a
  // list that falls behind the call graph degrades to "something went wrong"
  // rather than to nothing at all.
  const known = (ONBOARDING_ERROR_CODES as readonly string[]).includes(raw);
  const code = (known ? raw : "unknown") as BillingErrorCode;
  return ONBOARDING_OVERRIDES[code] ?? BILLING_ERROR_COPY[code];
}
