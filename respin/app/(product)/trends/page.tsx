// /trends — gate, bootstrap-safe scope, selected profile, scoped projection.
// No raw table, transcript, URL, caller-selected feed filter, or price crosses
// into the page reader; the tracking action validates its niche through the
// scoped DB writer and the DB facade is the only reader.
//
// THE ONE WRITE THIS PAGE MAKES (slice 8c, R12; R-98): before it reads the
// owner's pasted references it calls `respinCredits.settleParkedAutopsies`,
// which appends ONE compensating `autopsy_refund` credit per parked claim that
// has not been refunded yet, idempotently, under the creator's own scope. The
// page is the caller because the refund exists so a creator is not left paying
// for an autopsy that could not complete, and the page is where they look.
// Nothing else here writes.
import { requireUser } from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { PASTED_REFERENCE_TITLE_MAX, POST_CONTENT_MAX, respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
import { pasteReferenceAction, spinAction, trackNicheAction, untrackNicheAction } from "./actions";
import type { PasteQuote } from "./paste-panel";
import { referenceTitle, type PastedReferenceItem, type PastedReferenceState } from "./pasted-references";
import { TrackNichePanel } from "./track-niche-panel";
import {
  TrendsView,
  type AnalysedTrendItem,
  type OutlierEvidence,
  type SaturationPresentation,
  type TrendAutopsy,
} from "./trends-view";

export const dynamic = "force-dynamic";

type ScopedTrendItem = Awaited<ReturnType<typeof respinDb.trendFeed>>[number];
type ScopedPastedReference = Awaited<ReturnType<typeof respinDb.pastedReferences>>[number];
type Settlement = Awaited<ReturnType<typeof respinCredits.settleParkedAutopsies>>;

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function iso(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function saturationFor(item: ScopedTrendItem): SaturationPresentation | null {
  const source = asRecord(item.saturationMeasurement);
  if (item.saturation === "unmeasured") {
    return source?.reason === "incomplete_provenance"
      ? { status: "unmeasured", reason: "incomplete_provenance" }
      : null;
  }
  if (!source) return null;
  const matchingItems = safeInteger(source.matchingItems);
  const populationSize = safeInteger(source.populationSize);
  const prevalence = finiteNumber(source.prevalence);
  const window = asRecord(source.window);
  const startsAt = window ? iso(window.startsAt) : null;
  const endsAt = window ? iso(window.endsAt) : null;
  const methodVersion = source.methodVersion;
  if (
    matchingItems === null || matchingItems < 0 ||
    populationSize === null || populationSize <= 0 ||
    matchingItems > populationSize || prevalence === null || prevalence < 0 || prevalence > 1 ||
    startsAt === null || endsAt === null || startsAt >= endsAt ||
    typeof methodVersion !== "string" || methodVersion.trim().length === 0
  ) return null;
  return { status: "measured", matchingItems, populationSize, prevalence, window: { startsAt, endsAt }, methodVersion };
}

function outlierFor(item: ScopedTrendItem): OutlierEvidence | null {
  const ratio = finiteNumber(item.outlierRatio);
  const baseline = finiteNumber(item.channelMedianRecentViews);
  const startsAt = iso(item.baselineWindowStartsAt);
  const endsAt = iso(item.baselineWindowEndsAt);
  if (
    ratio === null || ratio < 0 || baseline === null || baseline <= 0 ||
    !Number.isSafeInteger(item.baselineSampleSize) || item.baselineSampleSize <= 0 ||
    startsAt === null || endsAt === null || startsAt >= endsAt
  ) return null;
  return {
    ratio, baseline, baselineSampleSize: item.baselineSampleSize,
    // The facade intentionally withholds a display name. Do not echo an id.
    channel: "the source channel",
    window: { startsAt, endsAt },
  };
}

/**
 * The FOUR display fields of an autopsy, and only those: `hook`,
 * `subjectTerms` and `structure` are the similarity gate's inputs and never
 * render (R-97). Shared by the ranked feed and the pasted section so the two
 * cannot project the same analysis differently.
 */
function autopsyProjection(source: ScopedTrendItem["autopsy"] | undefined): TrendAutopsy | null {
  if (!source) return null;
  const { hookMechanic, beats, ending, followTrigger } = source;
  if (
    typeof hookMechanic !== "string" || hookMechanic.trim().length === 0 ||
    !Array.isArray(beats) || beats.length === 0 ||
    !beats.every((beat) => typeof beat === "string" && beat.trim().length > 0) ||
    typeof ending !== "string" || ending.trim().length === 0 ||
    typeof followTrigger !== "string" || followTrigger.trim().length === 0
  ) return null;
  return { hookMechanic, beats, ending, followTrigger };
}

function itemFor(item: ScopedTrendItem, profileId: string): AnalysedTrendItem | null {
  const autopsy = autopsyProjection(item.autopsy);
  if (autopsy === null) return null;
  const source = item.sourceKind === "youtube" ? "YouTube" : "Submitted";
  return {
    kind: "analysed", id: item.id, title: item.title, source, stale: false,
    outlier: outlierFor(item), saturation: saturationFor(item), autopsy,
    spin: {
      kind: "action",
      autopsyId: item.autopsy.autopsyId,
      originalReference: { source, title: item.title, mechanismSummary: autopsy.hookMechanic },
      action: spinAction.bind(null, profileId),
    },
  };
}

/**
 * The credits this load returned for ONE claim, or `null`.
 *
 * `settleParkedAutopsies` reports the claim ids it refunded and the TOTAL it
 * returned. That total is attributable to a single claim only when exactly
 * one claim was refunded on this load; with two or more, each refund was the
 * `creditCosts.autopsy` of its own debit, which may differ across config
 * versions, and dividing the total would be a number nobody recorded. The
 * section then says "credits returned" without one.
 */
function creditsReturnedFor(claimId: string, settlement: Settlement): number | null {
  const ids = settlement.refundedClaimIds;
  return ids.length === 1 && ids[0] === claimId ? settlement.creditsReturned : null;
}

/**
 * Which designed state a pasted reference is in. Precedence, and why:
 * a completed autopsy this build can display is what the paste paid for, so
 * it wins; a parked claim has a refund to report; a missing transcript makes
 * every remaining in-flight state moot; then retrying, then queued. A claim
 * this build cannot classify (none at all, or completed but unparseable) is
 * said to be unavailable rather than shown as any of the others.
 */
function pastedStateFor(
  ref: ScopedPastedReference,
  profileId: string,
  settlement: Settlement
): PastedReferenceState {
  const claim = ref.claim;
  const autopsy = autopsyProjection(ref.autopsy);
  const autopsyId = ref.autopsy?.autopsyId ?? claim?.autopsyId ?? null;
  if (claim?.status === "completed" && autopsy !== null && autopsyId !== null) {
    const title = referenceTitle(ref);
    return {
      kind: "ready",
      item: {
        kind: "analysed", id: ref.itemId, title, source: "Submitted", stale: false,
        // R-96: no channel baseline exists for a pasted reference, and none is
        // shown or invented. READ FROM THE RECORD, NOT TYPED BY THIS PAGE
        // (code review round 1, C10): the "No channel baseline" line was
        // stamped `"unavailable"` unconditionally, so an item the reader
        // returned as `measured` would have rendered that sentence beside its
        // own ratio in the feed below. The reader now selects only
        // `unavailable` items and carries the column; this projects it, so the
        // day either changes the screen follows instead of asserting.
        outlier: null,
        ...(ref.baselineState === "unavailable" ? { baselineState: "unavailable" as const } : {}),
        saturation: null, autopsy,
        spin: {
          kind: "action",
          autopsyId,
          originalReference: { source: "Submitted", title, mechanismSummary: autopsy.hookMechanic },
          action: spinAction.bind(null, profileId),
        },
      },
    };
  }
  if (claim?.status === "parked") {
    // THE SETTLEMENT'S OWN ANSWERS, in its own precedence (C2/C2b), AND EVERY
    // ONE OF THEM POSITIVE (round 2, billing CHANGE 1 / learning CHANGE 1).
    //
    // `deferred` means it read nothing, so it outranks the rest: with a pause
    // open `neverChargedClaimIds` is empty because nothing was looked at, not
    // because every claim carried a debit.
    //
    // THE MONEY SENTENCE IS NO LONGER THE FALLTHROUGH. `parked_returned` used
    // to be reached by elimination, so it also covered a claim the settlement
    // NEVER SAW: the settlement commits before the `Promise.all` below, the
    // pasted references are read in a later transaction, and a claim the worker
    // parks in that window is in none of the settlement's lists. The screen
    // then said "credits returned", past tense, over a ledger holding the debit
    // and no refund — driven and printed by both round-2 reviewers. Every
    // parked branch below now requires an id the settlement OBSERVED, and a
    // parked claim it did not observe gets `parked_unsettled`, which claims
    // nothing about the money.
    if (settlement.deferred) return { kind: "parked_deferred" };
    if (settlement.neverChargedClaimIds.includes(claim.claimId)) {
      return { kind: "parked_never_charged" };
    }
    if (
      settlement.refundedClaimIds.includes(claim.claimId) ||
      settlement.alreadyRefundedClaimIds.includes(claim.claimId)
    ) {
      return { kind: "parked_returned", creditsReturned: creditsReturnedFor(claim.claimId, settlement) };
    }
    return { kind: "parked_unsettled" };
  }
  if (ref.transcriptState === "transcript_unavailable") return { kind: "transcript_unavailable" };
  if (claim?.status === "retrying") {
    return { kind: "retrying", attempt: claim.attemptCount, ceiling: claim.attemptCeiling };
  }
  if (claim?.status === "pending") return { kind: "queued" };
  return {
    kind: "unavailable",
    reason: claim === null
      ? "No autopsy was opened for this reference, so there is nothing to show for it."
      : "The completed autopsy's display details are unavailable from the scoped reader, so it is not shown.",
  };
}

function pastedItemFor(
  ref: ScopedPastedReference,
  profileId: string,
  settlement: Settlement
): PastedReferenceItem | null {
  const createdAt = iso(ref.createdAt);
  if (createdAt === null) return null;
  return {
    itemId: ref.itemId,
    title: ref.title,
    sourceUrl: ref.sourceUrl,
    createdAt,
    niche: ref.niche,
    state: pastedStateFor(ref, profileId, settlement),
  };
}

function quoteFor(quote: Awaited<ReturnType<typeof respinCredits.pastedReferenceQuote>>): PasteQuote {
  // Only the three things the panel states cross: price, balance, and whether
  // a paste may run. The resolved tier stays here.
  return {
    creditCost: quote.creditCost,
    balance: quote.balance,
    allowed: quote.allowed.ok ? { ok: true } : { ok: false, reason: quote.allowed.reason },
  };
}

export default async function TrendsPage() {
  // Above the try: unauthenticated redirects remain Next control flow.
  const user = await requireUser();

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[trends] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>>;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[trends] selected profile unavailable", err, { workspaceId: scope.workspaceId });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  if (!profile) {
    return <TrendsView state={{ kind: "empty", reason: "Select or create a creator profile before viewing its scoped trend feed." }} />;
  }

  // R12 / R-98: the settlement runs BEFORE the pasted read, so the section
  // reports a refund on the same load that made it. Its failure is contained
  // like every other refusal on this page: shown, logged by code, never
  // swallowed into a page that silently owes a creator credits.
  let settlement: Settlement;
  try {
    settlement = await respinCredits.settleParkedAutopsies(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[trends] parked-autopsy settlement refused", err, { workspaceId: scope.workspaceId, profileId: profile.id });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let feed: ScopedTrendItem[];
  let tracked: Awaited<ReturnType<typeof respinDb.trackedNiches>>;
  let pasted: ScopedPastedReference[];
  let quote: Awaited<ReturnType<typeof respinCredits.pastedReferenceQuote>>;
  try {
    // The reader derives entitled niches from this selected scoped profile.
    [feed, tracked, pasted, quote] = await Promise.all([
      respinDb.trendFeed(scope, profile.id),
      respinDb.trackedNiches(scope, profile.id),
      respinDb.pastedReferences(scope, profile.id),
      respinCredits.pastedReferenceQuote(scope.workspaceId, new Date()),
    ]);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[trends] scoped feed unavailable", err, { workspaceId: scope.workspaceId, profileId: profile.id });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  const items = feed.map((item) => itemFor(item, profile.id)).filter(
    (item): item is AnalysedTrendItem => item !== null
  );
  // NO MONEY FACT IS RE-DERIVED HERE (code review round 1, C2). This read a
  // refund-deferred flag off `quote.allowed`, with a comment claiming the
  // quote's pause answer was the same `hasOpenPause` the settlement consulted. It was
  // two reads, at two moments, under two precedence orders: the quote tests
  // TIER BEFORE PAUSE, so a paused non-paid workspace answered `"tier"` and
  // the screen printed "credits returned" over an empty ledger; and a pause
  // ending between the settlement above and the quote in the same `Promise.all`
  // flips it the same wrong way on any tier. The settlement reports what it
  // did, and the page projects that.
  const pastedReferences = pasted
    .map((ref) => pastedItemFor(ref, profile.id, settlement))
    .filter((ref): ref is PastedReferenceItem => ref !== null);
  const paste = {
    quote: quoteFor(quote),
    // Both ceilings are the package's own constants, never a literal here
    // (R10/R13). The title ceiling is allowlisted for app/** beside them.
    transcriptLimit: POST_CONTENT_MAX,
    titleLimit: PASTED_REFERENCE_TITLE_MAX,
    niches: tracked,
    action: pasteReferenceAction.bind(null, profile.id),
  };
  const tracker = (
    <TrackNichePanel
      tracked={tracked}
      action={trackNicheAction.bind(null, profile.id)}
      untrackAction={untrackNicheAction.bind(null, profile.id)}
    />
  );
  if (items.length === 0) {
    if (feed.length > 0) {
      return <>{tracker}<TrendsView paste={paste} pastedReferences={pastedReferences} state={{ kind: "unavailable", reason: "Completed autopsy display details are unavailable from the scoped feed, so no item is shown." }} /></>;
    }
    return <>{tracker}<TrendsView paste={paste} pastedReferences={pastedReferences} state={{ kind: "empty", reason: "No eligible autopsied trend items are available for this profile yet." }} /></>;
  }
  return <>{tracker}<TrendsView paste={paste} pastedReferences={pastedReferences} state={{ kind: "ready", autopsiedItems: [items[0], ...items.slice(1)], discoveryItems: [] }} /></>;
}
