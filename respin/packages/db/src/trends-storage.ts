// Scoped storage boundary for Slice 8. `@respin/trends` must use these
// operations rather than table objects so private transcript/cache access is
// always tied to a minted ProfileScope.
//
// WHAT THIS FILE IS THE AUTHORITY FOR, by citation (tenancy gate NOTE,
// 2026-09-03 — the two storage files cited no requirement id):
//   REQ-A03  nothing crosses profiles or workspaces — every private read and
//            write here carries the (profile_id, workspace_id) pair from a
//            minted `ProfileScope`, and shared rows are the ONLY rows a
//            sibling may see (`or(shared, and(private, pair))`).
//   REQ-D04  library contributions are mechanism-level only — nothing in this
//            file writes `frameworks`; the curation path is `frameworks.ts`
//            (`resolveAutopsyFramework`) and R-94 governs it.
//   R-88     a submitted third-party transcript is reference-class creator
//            data: `profile_private` by default, URL and provenance retained
//            with the scoped record, raw text never crossing profiles.
//   R-89     scheduled autopsies spend the non-tenant system budget; the
//            `claim*ForSystem` writers hand the worker an OPAQUE claim id and
//            never a scope.
//   REQ-A02  a viewer seat is read-only: both `tracked_niches` writers and the
//            paste intake refuse `role === "viewer"` as their first act after
//            the mint (tenancy BLOCK, 2026-09-03 — a viewer could write and
//            delete a profile's feed choices on the live `/trends` route).
//   R-96     (slice 8c) a creator-pasted reference is reference-class creator
//            data END TO END: one transaction writes the `reference`
//            onboarding input, the submitted source, a private item with NO
//            channel baseline (`baseline_state = 'unavailable'` — none is
//            invented), the transcript bound to that input, and a pending
//            private cache claim; pasted items are read through their own
//            reader and never enter the ranked feed.
//   R-97     the spin reference carries the autopsy's MECHANISM projection
//            (hook mechanic, beats, ending, follow trigger) beside the gate
//            fields; the prompt side of that rule lives in `packages/modes`.
import { boundedReadOrJoin } from "./render-transaction";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DbLike, TxLike } from "./db-like";
import {
  assertFreshProfileScopeInTx,
  assertScoped,
  normaliseContent,
  ProfileScope,
  type WorkspaceScope,
} from "./with-workspace";
import { ProfileRoleError, WorkspacePausedError } from "./errors";
import { hasOpenPause } from "./pause";
import {
  autopsies,
  autopsyCacheClaims,
  trackedNiches,
  trendItems,
  trendSources,
  trendTranscripts,
  type TrendSourceKind,
} from "./trends-schema";
import { onboardingInputs } from "./onboarding-schema";
import { appendReferencePost } from "./onboarding-ops";
import { AUTOPSY_ATTEMPT_CODE_CEILING } from "./autopsy-policy";
import { POST_CONTENT_MAX } from "./storage-limits";
import { users } from "./schema";

export type TrackedNicheEntitlement = { maxTrackedNiches: number };
export const SYSTEM_REFRESH_NICHE_BATCH_CODE_CEILING = 100;

/**
 * R18's "recency decay", as ONE named number: the feed score is
 * `outlier_ratio × exp(-ageDays / FEED_RECENCY_DECAY_DAYS)`, so an item loses
 * a factor of e every this-many days since its source was published.
 *
 * AN UNMEASURED LAUNCH CHOICE (learning gate CHANGE 7, 2026-09-03). Neither
 * tech-spec §4 nor R18 names a span — they say only "recency decay" — and no
 * live trend item exists yet (T-15) to measure one against. Seven days is the
 * weekly digest cadence (REQ-E05), chosen so an item older than one digest
 * cycle has decayed by e; it is ordering-only and never shown to a creator.
 * Revisit trigger: the first T-15 refresh with real items, or the first
 * creator report that the feed order feels stale — whichever comes first.
 */
export const FEED_RECENCY_DECAY_DAYS = 7;

/**
 * Role gate on durable profile settings/content writes (R-118, owner-only).
 *
 * `ProfileRoleError`, REUSED rather than a new class, exactly as
 * `frameworks.ts`'s `assertMayCurate` and `interview-ops.ts`'s
 * `assertMayAnswer` reuse it: its message already says the write "is drawn
 * from the workspace's paid per-tier allowance", which is precisely what a
 * tracked niche is (REQ-E05 / PRD §4G, per-tier slots), and
 * `app/(product)/billing-errors.ts` already maps the class to `profile_role`.
 * Editors and viewers may still read; neither may mutate these profile inputs.
 */
function assertMayTrack(role: string, act: string): void {
  if (role !== "owner") throw new ProfileRoleError(act, role, "owner");
}

/**
 * Cross-tenant scheduler input reduced to distinct canonical niche labels.
 * No workspace/profile id or row id crosses the system worker boundary.
 */
export async function systemRefreshNiches(
  db: DbLike,
  limit = SYSTEM_REFRESH_NICHE_BATCH_CODE_CEILING,
): Promise<string[]> {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("system refresh niche batch size must be a positive safe integer");
  }
  const effectiveLimit = Math.min(limit, SYSTEM_REFRESH_NICHE_BATCH_CODE_CEILING);
  const rows = await db
    .selectDistinct({ niche: trackedNiches.niche })
    .from(trackedNiches)
    .orderBy(asc(trackedNiches.niche))
    .limit(effectiveLimit + 1);
  if (rows.length > effectiveLimit) {
    throw new Error("system refresh niche batch exceeds the admitted ceiling");
  }
  return rows.map((row) => row.niche);
}

export type ScopedSpinReference = {
  autopsyId: string;
  analysisVersion: string;
  subjectTerms: readonly string[];
  hook: string;
  structure: { beatCount: number; turnBeat: number | null };
  /**
   * The MECHANISM projection (slice 8c, R-97 / R6): the four canonical
   * analysis fields the trends screen already shows, for the spin prompt to
   * render as another creator's mechanism to adapt and never quote. `hook`,
   * `subjectTerms` and `structure` above are the GATE fields and are
   * unchanged; `packages/modes` decides which of the two sets the prompt sees.
   */
  mechanism: { hookMechanic: string; beats: readonly string[]; ending: string; followTrigger: string };
};

/**
 * WHAT A SAVED SPIN SAYS ABOUT ITS REFERENCE (launch L4, R-153 amendment A2):
 * the three display fields `/trends` puts beside a Spin — where the reference
 * came from, its title, and its hook mechanic. Never the gate fields (`hook`,
 * `subjectTerms`, `structure`) and never the transcript.
 */
export type SpinReferenceSummary = {
  // The enum's own type (P2-R11), never a second hand-typed union.
  sourceKind: TrendSourceKind;
  title: string;
  hookMechanic: string;
};

/** DB mirror of @respin/trends' bounded canonical AutopsyAnalysis contract. */
export type CanonicalAutopsyAnalysis = {
  hookMechanic: string; beats: readonly string[]; ending: string; followTrigger: string;
  subjectTerms: readonly string[]; hook: string; structure: { beatCount: number; turnBeat: number | null };
};

/**
 * THE FIFTH COPY OF THE AUTOPSY'S BOUNDS, and it is a copy because it must be:
 * `packages/db` has no dependency on `@respin/trends` and should not gain one
 * for five numbers. The literals below (4000 / 50 / 20 / 120 / 800) are
 * `@respin/trends`' `AUTOPSY_MAX_*`, and `respin/tests/spin-reference-bounds.test.ts`
 * compares them to the producer's exported constants field by field.
 *
 * WHY THAT WITNESS MATTERS HERE MORE THAN ANYWHERE (compliance gate, round 2,
 * which found this file after two rounds of the same defect class). This
 * function gates three paths, and each fails differently: the trend feed drops
 * the WHOLE ITEM when it returns null, `spinReferenceForProfile` refuses the
 * spin, and the worker's autopsy completion throws AFTER the vendor has been
 * paid. A bound that drifts narrow here is a paid call thrown away; one that
 * drifts wide hands the R-3 gate a reference it was never designed to compare.
 */
export function parseCanonicalAutopsyAnalysis(value: unknown): CanonicalAutopsyAnalysis | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string, max = 4000) => typeof raw[key] === "string" && raw[key].trim().length > 0 && raw[key].length <= max ? raw[key] : null;
  const beats = Array.isArray(raw.beats) && raw.beats.length > 0 && raw.beats.length <= 50 && raw.beats.every((beat) => typeof beat === "string" && beat.trim().length > 0 && beat.length <= 4000) ? raw.beats : null;
  const subjectTerms = Array.isArray(raw.subjectTerms) && raw.subjectTerms.length > 0 && raw.subjectTerms.length <= 20 && raw.subjectTerms.every((term) => typeof term === "string" && term.trim().length > 0 && term.length <= 120) ? raw.subjectTerms : null;
  const structure = typeof raw.structure === "object" && raw.structure !== null && !Array.isArray(raw.structure) ? raw.structure as Record<string, unknown> : null;
  const beatCount = structure?.beatCount; const turnBeat = structure?.turnBeat;
  if (!text("hookMechanic") || !beats || !text("ending") || !text("followTrigger") || !subjectTerms || !text("hook", 800) || typeof beatCount !== "number" || !Number.isSafeInteger(beatCount) || beatCount !== beats.length || !(turnBeat === null || (typeof turnBeat === "number" && Number.isSafeInteger(turnBeat) && turnBeat >= 0 && turnBeat < beatCount)) || Object.keys(structure ?? {}).some((key) => key !== "beatCount" && key !== "turnBeat")) return null;
  if (Object.keys(raw).some((key) => !["hookMechanic", "beats", "ending", "followTrigger", "subjectTerms", "hook", "structure"].includes(key))) return null;
  return { hookMechanic: raw.hookMechanic as string, beats: [...beats], ending: raw.ending as string, followTrigger: raw.followTrigger as string, subjectTerms: [...subjectTerms], hook: raw.hook as string, structure: { beatCount, turnBeat: turnBeat as number | null } };
}

export type SharedTrendItemInput = {
  sourceId: string; externalVideoId: string; niche: string; title: string; channelId: string;
  videoViews: bigint; channelMedianRecentViews: string; baselineSampleSize: number;
  baselineObservationIds: readonly string[]; baselineWindowStartsAt: Date; baselineWindowEndsAt: Date; sourcePublishedAt: Date;
  // Metadata observation cannot assert transcript rights. Only the scoped
  // transcript writers below may transition an item to transcript_available.
  transcriptState: "transcript_required" | "transcript_unavailable";
  saturation: "measured" | "unmeasured";
  saturationMatchingItems?: number | null; saturationPopulationSize?: number | null;
  saturationPrevalence?: string | null; saturationWindowStartsAt?: Date | null; saturationWindowEndsAt?: Date | null;
  saturationMethodVersion?: string | null; saturationUnmeasuredReason?: "incomplete_provenance" | null;
  staleAt?: Date | null;
};

/**
 * A private item with NO channel baseline (slice 8c, R-96 / R3). No views, no
 * channel, no window, no ratio — the eight baseline columns are stored NULL
 * under `baseline_state = 'unavailable'` and the CHECK refuses anything else.
 * Saturation is not a parameter: an item with no channel baseline has no
 * population to measure prevalence against, so the writer stamps `unmeasured`
 * with the reason that names THAT cause — `no_population`, not
 * `incomplete_provenance` (fix round 1; the CHECK ties the two, migration
 * 0028).
 */
export type UnavailableBaselineTrendItemInput = {
  sourceId: string; externalVideoId: string; niche: string; title: string;
  baseline: { state: "unavailable" };
  /** For a paste: the moment it was pasted — see `trendItems.sourcePublishedAt`. */
  sourcePublishedAt: Date;
  transcriptState: "transcript_required" | "transcript_unavailable";
  staleAt?: Date | null;
};
export type PrivateTrendItemInput = SharedTrendItemInput | UnavailableBaselineTrendItemInput;

function isUnavailableBaselineInput(input: PrivateTrendItemInput): input is UnavailableBaselineTrendItemInput {
  return "baseline" in input && typeof input.baseline === "object" && input.baseline !== null && input.baseline.state === "unavailable";
}

export async function createTrendSource(
  db: DbLike,
  // Narrowed FROM the enum (P2-R11): renaming the member is a compile error here.
  input: { kind: Extract<TrendSourceKind, "youtube">; externalId: string; sourceUrl: string }
) {
  const [row] = await db.insert(trendSources).values(input).onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db.select().from(trendSources)
    .where(and(eq(trendSources.kind, input.kind), eq(trendSources.externalId, input.externalId))).limit(1);
  if (!existing) throw new Error("trend source conflict without a readable row");
  return existing;
}

/** Submitted-source URL/provenance is structurally scoped before persistence. */
export async function createPrivateSubmittedTrendSource(
  db: DbLike, scope: WorkspaceScope, profileId: string,
  input: { externalId: string; sourceUrl: string }
) {
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "add a submitted source to this creator profile"
    );
    const [row] = await tx.insert(trendSources).values({
      ...input, kind: "submitted", profileId: profile.profileId, workspaceId: profile.workspaceId,
    }).onConflictDoNothing().returning();
    if (row) return row;
    const [existing] = await tx.select().from(trendSources).where(and(
      eq(trendSources.kind, "submitted"), eq(trendSources.externalId, input.externalId),
      eq(trendSources.profileId, profile.profileId), eq(trendSources.workspaceId, profile.workspaceId)
    )).limit(1);
    if (!existing) throw new Error("submitted trend source conflict without a scoped row");
    return existing;
  });
}

function derivedOutlierRatio(videoViews: bigint, median: string): string {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(median);
  if (!match) throw new Error("channel median must be a positive decimal with at most 8 places");
  const places = match[2]?.length ?? 0;
  const denominator = BigInt(`${match[1]}${match[2] ?? ""}`);
  if (denominator <= 0n) throw new Error("channel median must be positive");
  // ROUND(video_views / median, 8), matching the database constraint without
  // losing a large view count through JavaScript Number.
  const scaled = videoViews * 10n ** BigInt(places + 8);
  const rounded = (scaled + denominator / 2n) / denominator;
  const digits = rounded.toString().padStart(9, "0");
  return `${digits.slice(0, -8)}.${digits.slice(-8)}`;
}

function assertTrendItemInput(input: SharedTrendItemInput): void {
  if (!["transcript_required", "transcript_unavailable"].includes(input.transcriptState)) {
    throw new Error("trend item metadata cannot assert transcript availability");
  }
  if (input.videoViews < 0n || !Number.isSafeInteger(input.baselineSampleSize) || input.baselineSampleSize < 1) throw new Error("trend baseline inputs are invalid");
  if (input.baselineObservationIds.length !== input.baselineSampleSize || new Set(input.baselineObservationIds).size !== input.baselineSampleSize || input.baselineObservationIds.some((id) => !/\S/.test(id) || id === input.externalVideoId)) throw new Error("trend baseline observation provenance is invalid");
  if (!(input.baselineWindowStartsAt < input.baselineWindowEndsAt) || input.sourcePublishedAt > input.baselineWindowEndsAt) throw new Error("trend baseline window is invalid");
  derivedOutlierRatio(input.videoViews, input.channelMedianRecentViews);
  const measured = input.saturation === "measured";
  const measuredValues = [input.saturationMatchingItems, input.saturationPopulationSize, input.saturationPrevalence, input.saturationWindowStartsAt, input.saturationWindowEndsAt, input.saturationMethodVersion];
  if ((!measured && (input.saturationUnmeasuredReason !== "incomplete_provenance" || measuredValues.some((value) => value != null))) || (measured && (input.saturationUnmeasuredReason != null || measuredValues.some((value) => value == null)))) throw new Error("trend saturation measurement shape is invalid");
}

export async function recordSharedTrendItem(db: DbLike, input: SharedTrendItemInput) {
  // AT THE WRITER, NOT ONLY THE CHECK (R3; CLAUDE.md 2026-08-21 — a field the
  // type forbids can still be CAST in). A shared row ranks in every
  // workspace's feed by its ratio; a shared row with no ratio is an item the
  // feed cannot honestly place, and the constraint below refuses it too.
  if (isUnavailableBaselineInput(input as PrivateTrendItemInput)) {
    throw new Error("shared trend items require a measured channel baseline; an unavailable baseline is profile-private only (R-96)");
  }
  assertTrendItemInput(input);
  const [source] = await db.select({ id: trendSources.id }).from(trendSources).where(and(
    eq(trendSources.id, input.sourceId),
    eq(trendSources.kind, "youtube"),
    isNull(trendSources.profileId),
    isNull(trendSources.workspaceId),
  )).limit(1);
  if (!source) throw new Error("shared trend items require a non-private YouTube source");
  const observation = {
    ...input,
    outlierRatio: derivedOutlierRatio(input.videoViews, input.channelMedianRecentViews),
  };
  const inserted = await db.insert(trendItems).values({
    ...observation,
    rightsScope: "shared_analysis",
  }).onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0];
  const [existing] = await db.select().from(trendItems).where(and(
    eq(trendItems.sourceId, input.sourceId),
    eq(trendItems.externalVideoId, input.externalVideoId),
    eq(trendItems.rightsScope, "shared_analysis"),
    isNull(trendItems.profileId),
    isNull(trendItems.workspaceId),
  )).limit(1);
  if (!existing) throw new Error("shared trend item conflict without a readable row");
  const [updated] = await db.update(trendItems).set({
    ...observation,
    // A later metadata refresh cannot erase a transcript already stored under
    // the exact rights/digest boundary.
    transcriptState: existing.transcriptState === "transcript_available"
      ? "transcript_available"
      : input.transcriptState,
  }).where(eq(trendItems.id, existing.id)).returning();
  if (!updated) throw new Error("shared trend item refresh did not update its row");
  return updated;
}

/**
 * Record one PROFILE-PRIVATE item under a source this profile owns.
 *
 * TWO INPUT SHAPES (R3): the measured `SharedTrendItemInput` (identical to the
 * shared writer's, plus ownership), or `UnavailableBaselineTrendItemInput` for
 * a creator paste, which stores the eight baseline columns NULL under
 * `baseline_state = 'unavailable'`. A refresh may lift an `unavailable` row to
 * `measured` (metadata arrived later); it may NOT erase a measured baseline
 * back to `unavailable`, for the same reason a refresh may not regress
 * `transcript_available`: data the product observed is not un-observed by a
 * later, emptier write.
 */
export async function recordPrivateTrendItem(
  db: DbLike, scope: WorkspaceScope, profileId: string, input: PrivateTrendItemInput
) {
  const unavailable = isUnavailableBaselineInput(input);
  if (unavailable) assertUnavailableBaselineInput(input);
  else assertTrendItemInput(input);
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "add a trend item to this creator profile"
    );
    const [source] = await tx.select().from(trendSources).where(and(
      eq(trendSources.id, input.sourceId), eq(trendSources.kind, "submitted"),
      eq(trendSources.profileId, profile.profileId), eq(trendSources.workspaceId, profile.workspaceId)
    )).limit(1);
    if (!source) throw new Error("private trend item requires a source owned by this profile");
    const observation = unavailable
    ? {
        sourceId: input.sourceId, externalVideoId: input.externalVideoId, niche: input.niche, title: input.title,
        sourcePublishedAt: input.sourcePublishedAt, transcriptState: input.transcriptState, staleAt: input.staleAt ?? null,
        baselineState: "unavailable" as const,
        channelId: null, videoViews: null, channelMedianRecentViews: null, baselineSampleSize: null,
        baselineObservationIds: null, baselineWindowStartsAt: null, baselineWindowEndsAt: null, outlierRatio: null,
        // R-96 + fix round 1 (C11): the reason names the CAUSE. This item's
        // provenance is complete — the creator gave the URL and the text; what
        // it has is no channel and therefore no population to measure
        // prevalence against. `trend_items_saturation_measurement_nonempty`
        // (migration 0028) refuses any other reason on an `unavailable` row.
        saturation: "unmeasured" as const, saturationUnmeasuredReason: "no_population" as const,
        saturationMatchingItems: null, saturationPopulationSize: null, saturationPrevalence: null,
        saturationWindowStartsAt: null, saturationWindowEndsAt: null, saturationMethodVersion: null,
      }
    : {
        ...input,
        baselineState: "measured" as const,
        outlierRatio: derivedOutlierRatio(input.videoViews, input.channelMedianRecentViews),
      };
    const inserted = await tx.insert(trendItems).values({
    ...observation,
    rightsScope: "profile_private",
    profileId: profile.profileId,
    workspaceId: profile.workspaceId,
  }).onConflictDoNothing().returning();
    if (inserted[0]) return inserted[0];
    const [existing] = await tx.select().from(trendItems).where(and(
    eq(trendItems.sourceId, input.sourceId),
    eq(trendItems.externalVideoId, input.externalVideoId),
    eq(trendItems.rightsScope, "profile_private"),
    eq(trendItems.profileId, profile.profileId),
    eq(trendItems.workspaceId, profile.workspaceId),
  )).limit(1);
    if (!existing) throw new Error("private trend item conflict without a scoped row");
    if (unavailable && existing.baselineState === "measured") {
      throw new Error("private trend item refresh cannot erase a measured channel baseline");
    }
    const [updated] = await tx.update(trendItems).set({
    ...observation,
    transcriptState: existing.transcriptState === "transcript_available"
      ? "transcript_available"
      : input.transcriptState,
  }).where(eq(trendItems.id, existing.id)).returning();
    if (!updated) throw new Error("private trend item refresh did not update its row");
    return updated;
  });
}

function assertUnavailableBaselineInput(input: UnavailableBaselineTrendItemInput): void {
  if (!["transcript_required", "transcript_unavailable"].includes(input.transcriptState)) {
    throw new Error("trend item metadata cannot assert transcript availability");
  }
  if (typeof input.title !== "string" || typeof input.niche !== "string" || !/\S/.test(input.externalVideoId)) {
    throw new Error("trend item title, niche and external id are required");
  }
  if (!(input.sourcePublishedAt instanceof Date) || Number.isNaN(input.sourcePublishedAt.getTime())) {
    throw new Error("trend item observation time is invalid");
  }
  // The cast lesson, applied to the eight: a measured field smuggled in beside
  // `baseline: { state: "unavailable" }` is refused here, before the CHECK.
  const smuggled = ["channelId", "videoViews", "channelMedianRecentViews", "baselineSampleSize", "baselineObservationIds", "baselineWindowStartsAt", "baselineWindowEndsAt", "outlierRatio", "saturation"]
    .filter((key) => (input as Record<string, unknown>)[key] !== undefined);
  if (smuggled.length > 0) {
    throw new Error(`an unavailable baseline cannot carry ${smuggled.join(", ")}`);
  }
}

export type PrivateTrendTranscriptInput = {
  trendItemId: string;
  content: string;
  /** The `reference`-class onboarding input this transcript IS (R2) — same profile, same workspace. */
  referenceInputId: string;
  /** The normalised URL the creator pasted; stamped into provenance, never trusted as rights. */
  sourceUrl: string;
};

/** The one provenance shape a private transcript may carry (R3). */
export type CreatorPasteProvenance = { kind: "creator_paste"; sourceUrl: string; referenceInputId: string };

/**
 * Store a creator-pasted third-party transcript under this profile (R-88,
 * R-96 / R3). THE PROVENANCE IS STAMPED, NOT TAKEN: every private transcript
 * is `{ kind: "creator_paste", sourceUrl, referenceInputId }`, because a
 * caller who can name the provenance can name a rights basis it does not
 * have. The reference input is re-read under the SAME profile/workspace pair
 * and must be `reference`-class — a sibling's onboarding input id, a
 * nonexistent id and an `own_post` id all fail the one predicate with one
 * message, so the FK's "exists somewhere" is never the whole check.
 *
 * This is the ONLY writer that may mark a private item `transcript_available`
 * (`tests/system-spend.test.ts` pins the shared twin the same way).
 */
export async function recordPrivateTrendTranscript(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  input: PrivateTrendTranscriptInput
) {
  if (typeof input.referenceInputId !== "string" || !/\S/.test(input.referenceInputId)) {
    throw new Error("private transcript requires the reference onboarding input it was stored as");
  }
  if (typeof input.sourceUrl !== "string" || !/\S/.test(input.sourceUrl)) {
    throw new Error("private transcript requires the pasted source URL");
  }
  const provenance: CreatorPasteProvenance = {
    kind: "creator_paste", sourceUrl: input.sourceUrl, referenceInputId: input.referenceInputId,
  };
  assertTranscriptInput({ content: input.content, provenance });
  const contentDigest = digestTranscriptContent(input.content);
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "store a transcript for this creator profile"
    );
    const [item] = await tx.select({ id: trendItems.id }).from(trendItems).where(and(
      eq(trendItems.id, input.trendItemId), eq(trendItems.profileId, profile.profileId),
      eq(trendItems.workspaceId, profile.workspaceId), eq(trendItems.rightsScope, "profile_private")
    )).limit(1);
    if (!item) throw new Error("trend item is not accessible to this profile");
    const [reference] = await tx.select({ id: onboardingInputs.id }).from(onboardingInputs).where(and(
      eq(onboardingInputs.id, input.referenceInputId),
      eq(onboardingInputs.profileId, profile.profileId),
      eq(onboardingInputs.workspaceId, profile.workspaceId),
      eq(onboardingInputs.inputClass, "reference"),
    )).limit(1);
    if (!reference) throw new Error("reference input is not accessible to this profile");
    const inserted = await tx.insert(trendTranscripts).values({
      trendItemId: input.trendItemId,
      content: input.content,
      contentDigest,
      provenance,
      referenceInputId: reference.id,
      rightsScope: "profile_private",
      rightsBasis: "profile_private",
      profileId: profile.profileId,
      workspaceId: profile.workspaceId,
    }).onConflictDoNothing().returning();
    const row = inserted[0] ?? (await tx.select().from(trendTranscripts).where(and(
      eq(trendTranscripts.trendItemId, input.trendItemId),
      eq(trendTranscripts.contentDigest, contentDigest),
      eq(trendTranscripts.rightsScope, "profile_private"),
      eq(trendTranscripts.profileId, profile.profileId),
      eq(trendTranscripts.workspaceId, profile.workspaceId),
    )).limit(1))[0];
    if (!row) throw new Error("private transcript conflict without a scoped row");
    // ONE INPUT, ONE TRANSCRIPT, in both directions. The unique index refuses
    // two transcripts for one input; this refuses one transcript claiming two
    // inputs, which the index cannot see because the earlier row simply wins
    // the conflict. `intakePastedReference` looks the digest up before it
    // appends an input, so this is reachable only by a caller that skipped it.
    if (row.referenceInputId !== reference.id) {
      throw new Error("this transcript is already stored under another reference input");
    }
    await tx.update(trendItems).set({ transcriptState: "transcript_available" }).where(eq(trendItems.id, item.id));
    return row;
  });
}

function assertTranscriptInput(input: {
  content: string;
  provenance: object;
}): void {
  // CODE POINTS, the unit `appendReferencePost` measures the same text in
  // (slice 8c): the intake stores one transcript twice — as the onboarding
  // input and as this row — and the two ceilings must agree, or an emoji-heavy
  // paste the reference intake accepted is refused here after its input row
  // was written (rolled back with it, but refused for a number the screen
  // never showed).
  if (typeof input.content !== "string" || !/\S/.test(input.content) || [...input.content].length > POST_CONTENT_MAX) {
    throw new Error(`trend transcript must contain 1-${POST_CONTENT_MAX} characters`);
  }
  if (!input.provenance || typeof input.provenance !== "object" || Array.isArray(input.provenance)) {
    throw new Error("trend transcript provenance must be an object");
  }
}

/** The storage authority derives cache identity from the exact stored bytes. */
export function digestTranscriptContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export type SharedTrendTranscriptInput = {
  trendItemId: string;
  content: string;
  /** Domain users.id whose consent is the revocable rights authority. */
  rightsSubjectUserId: string;
  provenance: {
    provider: "youtube_creator_owned_oauth";
    sourceReference: string;
    sharedAnalysisRightsBasis: "creator_owned_caption_consent";
    consentEvidenceId: string;
  };
};

/**
 * Shared raw text needs an affirmative rights basis. A public URL, metadata,
 * or API key never supplies this value implicitly.
 */
export async function recordSharedTrendTranscript(
  db: DbLike,
  input: SharedTrendTranscriptInput,
) {
  assertTranscriptInput(input);
  // A CREATOR PASTE IS NEVER SHARED (R3 / R-88): refused by name here, before
  // the key-shape check below would refuse it as merely "unknown", so the
  // message says what was attempted. Typed out by `SharedTrendTranscriptInput`,
  // checked at runtime for the cast reason (CLAUDE.md 2026-08-21).
  const raw = input.provenance as Record<string, unknown>;
  if ("kind" in raw || "referenceInputId" in raw || raw.provider === "creator_paste") {
    throw new Error("a creator-pasted transcript is profile-private reference-class data and cannot be stored as shared analysis (R-88, R-96)");
  }
  const contentDigest = digestTranscriptContent(input.content);
  const provenanceKeys = Object.keys(input.provenance).sort();
  const expectedProvenanceKeys = [
    "consentEvidenceId",
    "provider",
    "sharedAnalysisRightsBasis",
    "sourceReference",
  ];
  if (provenanceKeys.length !== expectedProvenanceKeys.length
    || provenanceKeys.some((key, index) => key !== expectedProvenanceKeys[index])) {
    throw new Error("shared transcript provenance contains an unknown field");
  }
  for (const [field, value] of Object.entries(input.provenance)) {
    if (typeof value !== "string" || !/\S/.test(value)) {
      throw new Error(`shared transcript provenance ${field} is required`);
    }
  }
  if (input.provenance.provider !== "youtube_creator_owned_oauth"
    || input.provenance.sharedAnalysisRightsBasis !== "creator_owned_caption_consent") {
    throw new Error("shared transcript provenance does not establish creator-owned caption consent");
  }
  const sourceReference = new URL(input.provenance.sourceReference);
  if (sourceReference.protocol !== "https:"
    || !["www.youtube.com", "youtube.com", "youtu.be"].includes(sourceReference.hostname)) {
    throw new Error("shared transcript source reference must be an HTTPS YouTube URL");
  }
  const referencedVideoId = sourceReference.hostname === "youtu.be"
    ? sourceReference.pathname.split("/").filter(Boolean)[0]
    : sourceReference.pathname === "/watch"
      ? sourceReference.searchParams.get("v")
      : null;
  if (!referencedVideoId) {
    throw new Error("shared transcript source reference must identify one YouTube video");
  }
  return db.transaction(async (tx) => {
    const [rightsSubject] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.rightsSubjectUserId))
      .limit(1);
    if (!rightsSubject) {
      throw new Error("shared transcript consent subject is not a domain user");
    }
    const [item] = await tx.select({
      id: trendItems.id,
      externalVideoId: trendItems.externalVideoId,
    }).from(trendItems).where(and(
      eq(trendItems.id, input.trendItemId),
      eq(trendItems.rightsScope, "shared_analysis"),
    )).limit(1);
    if (!item) throw new Error("shared transcript requires a shared-analysis trend item");
    if (item.externalVideoId !== referencedVideoId) {
      throw new Error("shared transcript rights evidence identifies another video");
    }
    const inserted = await tx.insert(trendTranscripts).values({
      trendItemId: input.trendItemId,
      content: input.content,
      contentDigest,
      provenance: input.provenance,
      rightsScope: "shared_analysis",
      rightsBasis: "creator_consent",
      rightsSubjectUserId: rightsSubject.id,
      rightsEvidenceId: input.provenance.consentEvidenceId,
    }).onConflictDoNothing().returning();
    const row = inserted[0] ?? (await tx.select().from(trendTranscripts).where(and(
      eq(trendTranscripts.trendItemId, input.trendItemId),
      eq(trendTranscripts.contentDigest, contentDigest),
      eq(trendTranscripts.rightsScope, "shared_analysis"),
    )).limit(1))[0];
    if (!row) throw new Error("shared transcript conflict without a shared row");
    if (
      row.rightsBasis !== "creator_consent"
      || row.rightsSubjectUserId !== rightsSubject.id
      || row.rightsEvidenceId !== input.provenance.consentEvidenceId
    ) {
      throw new Error("shared transcript cache identity is bound to different rights authority");
    }
    await tx.update(trendItems).set({ transcriptState: "transcript_available" }).where(eq(trendItems.id, item.id));
    return row;
  });
}

export type SystemAutopsyClaimResult = {
  cacheClaimId: string;
  trendItemId: string;
  status: "pending" | "completed" | "failed" | "parked";
  autopsyId: string | null;
};
export type SharedSystemAutopsyClaimResult = SystemAutopsyClaimResult;
export type PrivateSystemAutopsyClaimResult = SystemAutopsyClaimResult;

/** Prepare shared, transcript-ready work without making or authorizing a call. */
export async function claimSharedAutopsyForSystem(
  db: DbLike,
  input: { trendItemId: string; contentDigest: string; analysisVersion: string },
): Promise<SharedSystemAutopsyClaimResult> {
  if (!/\S/.test(input.contentDigest) || !/\S/.test(input.analysisVersion)) {
    throw new Error("system autopsy digest and analysis version are required");
  }
  return db.transaction(async (tx) => {
    const [item] = await tx.select({ id: trendItems.id }).from(trendItems).where(and(
      eq(trendItems.id, input.trendItemId),
      eq(trendItems.rightsScope, "shared_analysis"),
      eq(trendItems.transcriptState, "transcript_available"),
    )).limit(1);
    if (!item) throw new Error("system autopsy requires a shared transcript-ready item");
    const [transcript] = await tx.select({
      id: trendTranscripts.id,
      rightsBasis: trendTranscripts.rightsBasis,
      rightsSubjectUserId: trendTranscripts.rightsSubjectUserId,
      rightsEvidenceId: trendTranscripts.rightsEvidenceId,
    }).from(trendTranscripts).where(and(
      eq(trendTranscripts.trendItemId, item.id),
      eq(trendTranscripts.rightsScope, "shared_analysis"),
      eq(trendTranscripts.contentDigest, input.contentDigest),
    )).limit(1);
    if (!transcript) throw new Error("system autopsy digest has no shared rights-backed transcript");
    const inserted = await tx.insert(autopsyCacheClaims).values({
      trendItemId: item.id,
      contentDigest: input.contentDigest,
      analysisVersion: input.analysisVersion,
      rightsScope: "shared_analysis",
      rightsBasis: transcript.rightsBasis,
      rightsSubjectUserId: transcript.rightsSubjectUserId,
      rightsEvidenceId: transcript.rightsEvidenceId,
      cacheScopeKey: "shared",
      status: "pending",
    }).onConflictDoNothing().returning();
    const claim = inserted[0] ?? (await tx.select().from(autopsyCacheClaims).where(and(
      eq(autopsyCacheClaims.contentDigest, input.contentDigest),
      eq(autopsyCacheClaims.analysisVersion, input.analysisVersion),
      eq(autopsyCacheClaims.rightsScope, "shared_analysis"),
      eq(autopsyCacheClaims.cacheScopeKey, "shared"),
    )).limit(1))[0];
    if (!claim) throw new Error("system autopsy cache conflict without a durable claim");
    if (claim.trendItemId !== item.id) {
      throw new Error("shared autopsy cache identity is already bound to another trend item");
    }
    if (
      claim.rightsBasis !== transcript.rightsBasis
      || claim.rightsSubjectUserId !== transcript.rightsSubjectUserId
      || claim.rightsEvidenceId !== transcript.rightsEvidenceId
    ) {
      throw new Error("shared autopsy cache identity is bound to different rights authority");
    }
    return {
      cacheClaimId: claim.id,
      trendItemId: claim.trendItemId,
      status: claim.status,
      autopsyId: claim.autopsyId,
    };
  });
}

/**
 * Prepare creator-pasted transcript work while the caller still has a minted
 * profile scope. The later system job receives only the opaque cache claim id;
 * it never receives or mints this tenant scope.
 */
export async function claimPrivateAutopsyForSystem(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  input: { trendItemId: string; contentDigest: string; analysisVersion: string },
): Promise<PrivateSystemAutopsyClaimResult> {
  if (!/\S/.test(input.contentDigest) || !/\S/.test(input.analysisVersion)) {
    throw new Error("system autopsy digest and analysis version are required");
  }
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "request a private autopsy for this creator profile"
    );
    if (await hasOpenPause(tx, profile.workspaceId)) throw new WorkspacePausedError();
    const [item] = await tx.select({ id: trendItems.id }).from(trendItems).where(and(
      eq(trendItems.id, input.trendItemId),
      eq(trendItems.rightsScope, "profile_private"),
      eq(trendItems.profileId, profile.profileId),
      eq(trendItems.workspaceId, profile.workspaceId),
      eq(trendItems.transcriptState, "transcript_available"),
    )).limit(1);
    if (!item) throw new Error("system autopsy requires this profile's private transcript-ready item");
    const [transcript] = await tx.select({ id: trendTranscripts.id }).from(trendTranscripts).where(and(
      eq(trendTranscripts.trendItemId, item.id),
      eq(trendTranscripts.rightsScope, "profile_private"),
      eq(trendTranscripts.profileId, profile.profileId),
      eq(trendTranscripts.workspaceId, profile.workspaceId),
      eq(trendTranscripts.contentDigest, input.contentDigest),
    )).limit(1);
    if (!transcript) throw new Error("system autopsy digest has no profile-private transcript");
    const inserted = await tx.insert(autopsyCacheClaims).values({
      trendItemId: item.id,
      contentDigest: input.contentDigest,
      analysisVersion: input.analysisVersion,
      rightsScope: "profile_private",
      rightsBasis: "profile_private",
      profileId: profile.profileId,
      workspaceId: profile.workspaceId,
      cacheScopeKey: profile.profileId,
      status: "pending",
    }).onConflictDoNothing().returning();
    const claim = inserted[0] ?? (await tx.select().from(autopsyCacheClaims).where(and(
      eq(autopsyCacheClaims.contentDigest, input.contentDigest),
      eq(autopsyCacheClaims.analysisVersion, input.analysisVersion),
      eq(autopsyCacheClaims.rightsScope, "profile_private"),
      eq(autopsyCacheClaims.cacheScopeKey, profile.profileId),
      eq(autopsyCacheClaims.profileId, profile.profileId),
      eq(autopsyCacheClaims.workspaceId, profile.workspaceId),
    )).limit(1))[0];
    if (!claim) throw new Error("private system autopsy conflict without a scoped claim");
    if (claim.trendItemId !== item.id) {
      throw new Error("private autopsy cache identity is already bound to another trend item");
    }
    return {
      cacheClaimId: claim.id,
      trendItemId: claim.trendItemId,
      status: claim.status,
      autopsyId: claim.autopsyId,
    };
  });
}

/** Record one entitled feed niche under a minted profile scope. */
export async function trackNicheForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string, niche: string,
  entitlement: TrackedNicheEntitlement
) {
  if (!Number.isSafeInteger(entitlement.maxTrackedNiches) || entitlement.maxTrackedNiches < 0) {
    throw new Error("tracked niche entitlement is invalid");
  }
  const normalizedNiche = niche.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
  if (!normalizedNiche) throw new Error("tracked niche must be nonblank");
  if ([...normalizedNiche].length > 80) throw new Error("tracked niche must be at most 80 characters");
  const profile = await ProfileScope.mint(db, scope, profileId);
  // FIRST ACT AFTER THE MINT: the owner role comes from the membership row.
  assertMayTrack(profile.role, "track a niche for this creator profile");
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "track a niche for this creator profile"
    );
    if (await hasOpenPause(tx, profile.workspaceId)) throw new WorkspacePausedError();
    // A transaction-scoped per-profile lock serialises count+insert without a
    // global lock. It is released on every success/error/rollback path.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${profile.profileId}))`);
    const existing = await tx.select({ id: trackedNiches.id }).from(trackedNiches).where(and(
      eq(trackedNiches.profileId, profile.profileId), eq(trackedNiches.workspaceId, profile.workspaceId), eq(trackedNiches.niche, normalizedNiche)
    )).limit(1);
    if (existing.length) return existing[0];
    const rows = await tx.select({ id: trackedNiches.id }).from(trackedNiches).where(and(
      eq(trackedNiches.profileId, profile.profileId), eq(trackedNiches.workspaceId, profile.workspaceId)
    ));
    if (rows.length >= entitlement.maxTrackedNiches) throw new Error("tracked niche entitlement exhausted");
    const [row] = await tx.insert(trackedNiches).values({
      profileId: profile.profileId,
      workspaceId: profile.workspaceId,
      niche: normalizedNiche,
    }).returning();
    return row;
  });
}

/** Read this profile's current choices; reads remain available while paused. */
export async function trackedNichesForProfile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
) {
  const profile = await ProfileScope.mint(db, scope, profileId);
  return boundedReadOrJoin(db, async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    return tx.select({ id: trackedNiches.id, niche: trackedNiches.niche })
      .from(trackedNiches)
      .where(and(
        eq(trackedNiches.profileId, profile.profileId),
        eq(trackedNiches.workspaceId, profile.workspaceId),
      ))
      .orderBy(asc(trackedNiches.createdAt), asc(trackedNiches.id));
  });
}

/** Remove one exact scoped choice so a finite tier slot can be reused. */
export async function untrackNicheForProfile(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  trackedNicheId: string,
) {
  if (!/\S/.test(trackedNicheId)) throw new Error("tracked niche id is required");
  const profile = await ProfileScope.mint(db, scope, profileId);
  // Same owner-only gate and position for removal.
  assertMayTrack(profile.role, "remove a tracked niche from this creator profile");
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "remove a tracked niche from this creator profile"
    );
    if (await hasOpenPause(tx, profile.workspaceId)) throw new WorkspacePausedError();
    const [removed] = await tx.delete(trackedNiches).where(and(
      eq(trackedNiches.id, trackedNicheId),
      eq(trackedNiches.profileId, profile.profileId),
      eq(trackedNiches.workspaceId, profile.workspaceId),
    )).returning({ id: trackedNiches.id });
    if (!removed) throw new Error("tracked niche is not accessible to this profile");
    return removed;
  });
}

/**
 * Profile feed derives niches from entitled stored choices. Items are ordered
 * deterministically by the required ratio-times-recency score, then creation
 * time/id; callers cannot widen it with arbitrary niche text.
 */
export async function feedItemsForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string, now = new Date()
) {
  const profile = await ProfileScope.mint(db, scope, profileId);
  return boundedReadOrJoin(db, async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const niches = await tx.select({ niche: trackedNiches.niche }).from(trackedNiches).where(and(
      eq(trackedNiches.profileId, profile.profileId), eq(trackedNiches.workspaceId, profile.workspaceId)
    ));
    if (niches.length === 0) return [];
    const items = await tx.select().from(trendItems).where(and(
      inArray(trendItems.niche, niches.map((row) => row.niche)), isNull(trendItems.staleAt),
      eq(trendItems.transcriptState, "transcript_available"),
    // MEASURED BASELINES ONLY (R-96): this feed ranks by outlier ratio, and a
    // pasted reference has none. Pasted items are read by
    // `pastedReferencesForProfile` and shown in their own section; dropping
    // this predicate would rank them at score 0 and is mutation M7.
    eq(trendItems.baselineState, "measured"),
    or(
      eq(trendItems.rightsScope, "shared_analysis"),
      and(eq(trendItems.rightsScope, "profile_private"), eq(trendItems.profileId, profile.profileId), eq(trendItems.workspaceId, profile.workspaceId))
    )
    ));
    const score = (row: typeof items[number]) => {
      const ageDays = Math.max(0, now.getTime() - row.sourcePublishedAt.getTime()) / 86_400_000;
      return Number(row.outlierRatio) * Math.exp(-ageDays / FEED_RECENCY_DECAY_DAYS);
    };
    const autopsied = await Promise.all(items.map(async (item) => {
      const [autopsy] = await tx.select({ id: autopsies.id }).from(autopsies).where(and(
        eq(autopsies.trendItemId, item.id), eq(autopsies.status, "completed"), eq(autopsies.rightsScope, item.rightsScope),
        item.rightsScope === "profile_private"
          ? and(eq(autopsies.profileId, profile.profileId), eq(autopsies.workspaceId, profile.workspaceId))
          : isNull(autopsies.profileId)
      )).limit(1);
      return autopsy ? item : null;
    }));
    return autopsied.filter((item): item is typeof items[number] => item !== null)
      .sort((a, b) => score(b) - score(a) || b.sourcePublishedAt.getTime() - a.sourcePublishedAt.getTime() || a.id.localeCompare(b.id));
  });
}

/** App-safe feed projection: no transcript body/provenance is selected. */
export type TrendFeedItem = {
  id: string; title: string; niche: string; channelId: string; sourcePublishedAt: Date;
  videoViews: bigint; channelMedianRecentViews: string; baselineSampleSize: number;
  baselineObservationIds: unknown; baselineWindowStartsAt: Date; baselineWindowEndsAt: Date;
  outlierRatio: string; saturation: "measured" | "unmeasured";
  saturationMeasurement: unknown; transcriptState: "transcript_required" | "transcript_available" | "transcript_unavailable";
  sourceKind: TrendSourceKind;
  autopsy: CanonicalAutopsyAnalysis & { autopsyId: string; analysisVersion: string };
};

export async function trendFeedProjection(
  db: DbLike, scope: WorkspaceScope, profileId: string, now?: Date
): Promise<TrendFeedItem[]> {
  const rows = await feedItemsForProfile(db, scope, profileId, now);
  const profile = await ProfileScope.mint(db, scope, profileId);
  return boundedReadOrJoin(db, async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const projections = await Promise.all(rows.map(async (row) => {
      const [source] = await tx.select({ kind: trendSources.kind }).from(trendSources).where(eq(trendSources.id, row.sourceId)).limit(1);
      const [autopsy] = await tx.select().from(autopsies).where(and(
        eq(autopsies.trendItemId, row.id), eq(autopsies.status, "completed"), eq(autopsies.rightsScope, row.rightsScope),
        row.rightsScope === "profile_private" ? and(eq(autopsies.profileId, row.profileId!), eq(autopsies.workspaceId, row.workspaceId!)) : isNull(autopsies.profileId)
      )).limit(1);
      if (!source || !autopsy) return null;
      const analysis = parseCanonicalAutopsyAnalysis(autopsy.analysis);
      if (!analysis) return null;
      return {
        id: row.id, title: row.title, niche: row.niche, channelId: row.channelId, sourcePublishedAt: row.sourcePublishedAt,
        videoViews: row.videoViews, channelMedianRecentViews: row.channelMedianRecentViews,
        baselineSampleSize: row.baselineSampleSize, baselineObservationIds: row.baselineObservationIds,
        baselineWindowStartsAt: row.baselineWindowStartsAt, baselineWindowEndsAt: row.baselineWindowEndsAt,
        outlierRatio: row.outlierRatio, saturation: row.saturation,
        saturationMeasurement: row.saturation === "measured" ? {
          matchingItems: row.saturationMatchingItems, populationSize: row.saturationPopulationSize,
          prevalence: row.saturationPrevalence, window: { startsAt: row.saturationWindowStartsAt, endsAt: row.saturationWindowEndsAt }, methodVersion: row.saturationMethodVersion,
        } : { reason: row.saturationUnmeasuredReason },
        transcriptState: row.transcriptState,
        sourceKind: source.kind,
        autopsy: { ...analysis, autopsyId: autopsy.id, analysisVersion: autopsy.analysisVersion },
      } as TrendFeedItem;
    }));
    return projections.filter((row): row is TrendFeedItem => row !== null);
  });
}

/** A private cache is visible only to the profile that owns it; shared is global. */
export async function reusableAutopsyForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string,
  input: { contentDigest: string; analysisVersion: string }
) {
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    return tx.select().from(autopsies).where(and(
      eq(autopsies.contentDigest, input.contentDigest), eq(autopsies.analysisVersion, input.analysisVersion),
      eq(autopsies.status, "completed"),
      or(
        eq(autopsies.rightsScope, "shared_analysis"),
        and(eq(autopsies.rightsScope, "profile_private"), eq(autopsies.profileId, profile.profileId), eq(autopsies.workspaceId, profile.workspaceId))
      )
    ));
  });
}

/**
 * Bounded similarity input. The opaque autopsy id is checked against both
 * scope and transcript availability before any analysis field is returned.
 *
 * `assertScoped(profile)` IS THE FIRST STATEMENT, and the reason is the class
 * this function belongs to rather than this one instance (tenancy gate CHANGE,
 * 2026-09-03; CLAUDE.md 2026-08-21 — a field that cannot be TYPED can still
 * be CAST). This file's database-touching exports fall into three classes:
 * the profile-facing ones take a `WorkspaceScope` and call `ProfileScope.mint`,
 * which asserts it (`trendFeedProjection` does so through
 * `feedItemsForProfile`, which it composes); five shared/system ones
 * (`systemRefreshNiches`, `createTrendSource`,
 * `recordSharedTrendItem`, `recordSharedTrendTranscript`,
 * `claimSharedAutopsyForSystem`) take NO scope by design, because they read or
 * write rows that belong to no profile; and this is the ONE that receives an
 * already-minted `ProfileScope` from another package
 * (`credits/src/generate.ts`), so it is the one where `{profileId, workspaceId}
 * as unknown as ProfileScope` would otherwise reach the rights predicate with
 * a forged pair. The property `trends-storage.test.ts` pins is therefore
 * exactly this: every exported function whose parameter is typed
 * `ProfileScope` asserts it before its first query, and the set of such
 * functions is a LIST the scan is held equal to — matching
 * `with-workspace.ts`'s `monthlySpend` and `burnByMode`.
 */
export async function spinReferenceForProfile(
  db: DbLike, profile: ProfileScope, autopsyId: string
): Promise<ScopedSpinReference> {
  assertScoped(profile);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const [autopsy] = await tx.select().from(autopsies).where(and(
      eq(autopsies.id, autopsyId), eq(autopsies.status, "completed"),
      or(
        eq(autopsies.rightsScope, "shared_analysis"),
        and(eq(autopsies.rightsScope, "profile_private"), eq(autopsies.profileId, profile.profileId), eq(autopsies.workspaceId, profile.workspaceId))
      )
    )).limit(1);
    if (!autopsy) throw new Error("spin reference is inaccessible or unready");
    const [item] = await tx.select().from(trendItems).where(and(
      eq(trendItems.id, autopsy.trendItemId), eq(trendItems.transcriptState, "transcript_available"),
      eq(trendItems.rightsScope, autopsy.rightsScope),
      autopsy.rightsScope === "profile_private"
        ? and(eq(trendItems.profileId, profile.profileId), eq(trendItems.workspaceId, profile.workspaceId))
        : isNull(trendItems.profileId)
    )).limit(1);
    if (!item) throw new Error("spin reference transcript is inaccessible");
    const [transcript] = await tx.select({ id: trendTranscripts.id }).from(trendTranscripts).where(and(
      eq(trendTranscripts.trendItemId, item.id), eq(trendTranscripts.rightsScope, autopsy.rightsScope), eq(trendTranscripts.contentDigest, autopsy.contentDigest),
      autopsy.rightsScope === "profile_private"
        ? and(eq(trendTranscripts.profileId, profile.profileId), eq(trendTranscripts.workspaceId, profile.workspaceId))
        : isNull(trendTranscripts.profileId)
    )).limit(1);
    if (!transcript) throw new Error("spin reference transcript is inaccessible");
    const analysis = parseCanonicalAutopsyAnalysis(autopsy.analysis);
    if (!analysis) {
      throw new Error("spin reference analysis is not a bounded completed autopsy");
    }
    return {
      autopsyId: autopsy.id, analysisVersion: autopsy.analysisVersion, subjectTerms: analysis.subjectTerms, hook: analysis.hook,
      structure: analysis.structure,
      mechanism: {
        hookMechanic: analysis.hookMechanic, beats: analysis.beats, ending: analysis.ending, followTrigger: analysis.followTrigger,
      },
    };
  });
}

/** The opaque autopsy id shape; anything else is never sent to a uuid column. */
const SPIN_AUTOPSY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE REFERENCE A STORED SPIN WAS MADE FROM, as a display summary (launch L4,
 * R-153 amendment A2). The SAME rights predicate as `spinReferenceForProfile`
 * — a shared analysis, or this profile's own private one, its trend item under
 * the same rights scope — but no transcript is required: this shows what the
 * creator already saw on `/trends`, it feeds no gate. `null`, never a throw,
 * for an id that is not readable here (erased, foreign, unfinished,
 * unparseable): the saved page then says the reference is not available.
 */
export async function spinReferenceSummaryForProfile(
  db: DbLike, profile: ProfileScope, autopsyId: string
): Promise<SpinReferenceSummary | null> {
  assertScoped(profile);
  if (typeof autopsyId !== "string" || !SPIN_AUTOPSY_ID_RE.test(autopsyId)) return null;
  return boundedReadOrJoin(db, async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const [autopsy] = await tx.select().from(autopsies).where(and(
      eq(autopsies.id, autopsyId), eq(autopsies.status, "completed"),
      or(
        eq(autopsies.rightsScope, "shared_analysis"),
        and(eq(autopsies.rightsScope, "profile_private"), eq(autopsies.profileId, profile.profileId), eq(autopsies.workspaceId, profile.workspaceId))
      )
    )).limit(1);
    if (!autopsy) return null;
    const [item] = await tx.select({ title: trendItems.title, sourceKind: trendSources.kind }).from(trendItems)
      .innerJoin(trendSources, eq(trendSources.id, trendItems.sourceId))
      .where(and(
        eq(trendItems.id, autopsy.trendItemId),
        eq(trendItems.rightsScope, autopsy.rightsScope),
        autopsy.rightsScope === "profile_private"
          ? and(eq(trendItems.profileId, profile.profileId), eq(trendItems.workspaceId, profile.workspaceId))
          : isNull(trendItems.profileId)
      )).limit(1);
    if (!item) return null;
    const analysis = parseCanonicalAutopsyAnalysis(autopsy.analysis);
    if (!analysis) return null;
    return {
      // The column is typed by the enum, so it is passed through rather than
      // re-derived by a ternary that would map any third kind to "submitted".
      sourceKind: item.sourceKind,
      title: item.title,
      hookMechanic: analysis.hookMechanic,
    };
  });
}

// ---------------------------------------------------------------------------
// Slice 8c (R-96): the creator paste-transcript intake and its owner-only
// reader. This is the first production producer of `trend_sources`,
// `trend_items`, `trend_transcripts` and `autopsy_cache_claims`.
// ---------------------------------------------------------------------------

/**
 * The analysis version a pasted reference's cache claim is opened under.
 *
 * THE CLAIM DECIDES THE VERSION, NOT THE WORKER: `createSystemAutopsyAttemptStore`
 * stamps the completed autopsy with `cacheClaim.analysisVersion`
 * (`system-spend.ts`), so whatever opens the claim names the contract the
 * result will be read under. `v1` is the fixed four-stage R8 pipeline
 * (`AUTOPSY_STAGES`) whose bounded output `parseCanonicalAutopsyAnalysis`
 * accepts. Bump it when that contract changes; a new version is a cache miss
 * by construction (the identity index includes it), never a rewrite.
 */
export const AUTOPSY_ANALYSIS_VERSION = "v1";

/** The most a pasted reference's optional title may hold, in code points (R4). */
export const PASTED_REFERENCE_TITLE_MAX = 120;

/**
 * Query keys stripped from a pasted URL before it becomes a source identity.
 * The stated rule (card, "left to the developer"): `utm_*`, `si`, `feature`.
 * Nothing else is stripped — an unlisted key may be what identifies the video.
 */
const TRACKING_QUERY_KEYS = new Set(["si", "feature"]);

/**
 * THE URL NORMALISATION RULE for a pasted reference (R4), stated once:
 *   1. absolute `http:` or `https:` only, with a host — anything else refused;
 *   2. scheme and host lowercased (the WHATWG parser does this), userinfo
 *      dropped (credentials are never stored);
 *   3. path kept exactly as pasted;
 *   4. query: `utm_*` (any case), `si` and `feature` removed, the remaining
 *      pairs kept and sorted by key so two spellings of one video agree;
 *   5. fragment dropped.
 * The result is BOTH the `trend_sources.external_id` the idempotency index
 * keys on and the `source_url` that is stored — the tracking tokens never
 * reach a row. A `youtu.be/x` and a `youtube.com/watch?v=x` remain two
 * sources: collapsing host aliases is a per-platform rule this slice does not
 * claim to know.
 */
export function normalisePastedReferenceUrl(raw: string): string {
  if (typeof raw !== "string" || !/\S/.test(raw)) {
    throw new Error("pasted reference URL is required");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("pasted reference URL must be an absolute http(s) URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error("pasted reference URL must be an absolute http(s) URL");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !/^utm_/i.test(key) && !TRACKING_QUERY_KEYS.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);
  return url.toString();
}

export type PastedReferenceIntakeInput = {
  sourceUrl: string;
  transcript: string;
  /** Optional, at most `PASTED_REFERENCE_TITLE_MAX` code points. */
  title?: string;
  /** Optional; must be one of the profile's TRACKED niches, else refused by name. */
  niche?: string;
};

export type PastedReferenceIntakeResult = {
  referenceInputId: string;
  itemId: string;
  claimId: string;
  claimStatus: "pending" | "completed" | "failed" | "parked";
  autopsyId: string | null;
};

function normalisePastedTitle(raw: string | undefined): string {
  if (raw === undefined) return "";
  if (typeof raw !== "string") throw new Error("pasted reference title must be text");
  const title = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  if ([...title].length > PASTED_REFERENCE_TITLE_MAX) {
    throw new Error(`pasted reference title must be at most ${PASTED_REFERENCE_TITLE_MAX} characters`);
  }
  return title;
}

/** The same canonical form `trackNicheForProfile` stores, so the lookup is exact. */
function canonicalNiche(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

type OwnerPair = { profileId: string; workspaceId: string };

/**
 * Paste a third-party video's URL and transcript into this profile (R-96 /
 * R4). ONE TRANSACTION, in this order and no other:
 *
 *   1. role — a viewer is refused before any read (REQ-A02);
 *   2. open pause — refused before any row (REQ-G08);
 *   3. per-profile advisory lock, so two identical pastes serialise;
 *   4. niche, if given, must be one of the profile's tracked niches;
 *   5. IDEMPOTENCY LOOKUP by (normalised URL, transcript digest): an existing
 *      source → item → transcript under this pair returns the existing rows
 *      and (re)claims the cache identity, inserting NOTHING new;
 *   6. `appendReferencePost` — slice 4's intake, so `POST_CONTENT_MAX`,
 *      `REFERENCE_COUNT_MAX`, the blank/ceiling refusals and the write-role
 *      gate inside `appendOnboardingInput` all apply, and the text lands in
 *      the reference echo corpus (R-3 controls);
 *   7. `createPrivateSubmittedTrendSource` keyed on the normalised URL;
 *   8. a private item with `baseline: { state: "unavailable" }` and
 *      `transcript_required` — the item's `external_video_id` is the
 *      TRANSCRIPT DIGEST, so a different transcript for the same URL is a
 *      second item under the same source and the same text is the same item;
 *   9. the transcript row bound to the onboarding input (the only writer that
 *      flips the item to `transcript_available`);
 *  10. `claimPrivateAutopsyForSystem` — a pending private cache claim the
 *      sessionless worker picks up with an opaque id (R-89).
 *
 * The transcript stored on `trend_transcripts` is the onboarding input's
 * NORMALISED content (NFC, CRLF→LF), so its digest equals the input's
 * `content_sha256` — asserted, because the idempotency lookup at step 5
 * computes that digest before step 6 has stored anything.
 *
 * MONEY IS NOT HERE. R-98's debit rides in the SAME transaction as this
 * function, composed by `@respin/credits` (`submitPastedReference`), which
 * passes its transaction handle as `db`. Nested `db.transaction` calls in the
 * writers below become savepoints on that handle.
 */
export async function intakePastedReference(
  db: DbLike, scope: WorkspaceScope, profileId: string, input: PastedReferenceIntakeInput
): Promise<PastedReferenceIntakeResult> {
  const sourceUrl = normalisePastedReferenceUrl(input.sourceUrl);
  const title = normalisePastedTitle(input.title);
  if (typeof input.transcript !== "string") throw new Error("pasted transcript must be text");
  const profile = await ProfileScope.mint(db, scope, profileId);
  assertMayTrack(profile.role, "paste a reference for this creator profile");
  const pair: OwnerPair = { profileId: profile.profileId, workspaceId: profile.workspaceId };
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(
      tx,
      profile,
      ["owner"],
      "paste a reference for this creator profile"
    );
    if (await hasOpenPause(tx, profile.workspaceId)) throw new WorkspacePausedError();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${profile.profileId}))`);
    const niche = input.niche === undefined ? "" : await trackedNicheOrRefuse(tx, pair, input.niche);
    const content = normaliseContent(input.transcript);
    const contentDigest = digestTranscriptContent(content);

    const existing = await existingPastedReference(tx, pair, sourceUrl, contentDigest);
    if (existing) {
      const claim = await claimPrivateAutopsyForSystem(tx, scope, profileId, {
        trendItemId: existing.itemId, contentDigest, analysisVersion: AUTOPSY_ANALYSIS_VERSION,
      });
      return {
        referenceInputId: existing.referenceInputId, itemId: existing.itemId,
        claimId: claim.cacheClaimId, claimStatus: claim.status, autopsyId: claim.autopsyId,
      };
    }

    const reference = await appendReferencePost(tx, scope, profileId, input.transcript, sourceUrl);
    if (reference.contentSha256 !== contentDigest) {
      throw new Error("pasted transcript digest disagrees with its stored onboarding input");
    }
    const source = await createPrivateSubmittedTrendSource(tx, scope, profileId, { externalId: sourceUrl, sourceUrl });
    const item = await recordPrivateTrendItem(tx, scope, profileId, {
      sourceId: source.id, externalVideoId: contentDigest, niche, title,
      baseline: { state: "unavailable" }, sourcePublishedAt: new Date(), transcriptState: "transcript_required",
    });
    const transcript = await recordPrivateTrendTranscript(tx, scope, profileId, {
      trendItemId: item.id, content: reference.content, referenceInputId: reference.id, sourceUrl,
    });
    const claim = await claimPrivateAutopsyForSystem(tx, scope, profileId, {
      trendItemId: item.id, contentDigest: transcript.contentDigest, analysisVersion: AUTOPSY_ANALYSIS_VERSION,
    });
    return {
      referenceInputId: reference.id, itemId: item.id,
      claimId: claim.cacheClaimId, claimStatus: claim.status, autopsyId: claim.autopsyId,
    };
  });
}

async function trackedNicheOrRefuse(tx: TxLike, pair: OwnerPair, raw: string): Promise<string> {
  if (typeof raw !== "string") throw new Error("pasted reference niche must be text");
  const niche = canonicalNiche(raw);
  const [tracked] = await tx.select({ niche: trackedNiches.niche }).from(trackedNiches).where(and(
    eq(trackedNiches.profileId, pair.profileId), eq(trackedNiches.workspaceId, pair.workspaceId),
    eq(trackedNiches.niche, niche),
  )).limit(1);
  if (!tracked) throw new Error(`niche "${niche}" is not one of this profile's tracked niches`);
  return tracked.niche;
}

/** Step 5 of `intakePastedReference`: source → item → transcript, all under the pair. */
async function existingPastedReference(
  tx: TxLike, pair: OwnerPair, sourceUrl: string, contentDigest: string
): Promise<{ referenceInputId: string; itemId: string } | null> {
  const [source] = await tx.select({ id: trendSources.id }).from(trendSources).where(and(
    eq(trendSources.kind, "submitted"), eq(trendSources.externalId, sourceUrl),
    eq(trendSources.profileId, pair.profileId), eq(trendSources.workspaceId, pair.workspaceId),
  )).limit(1);
  if (!source) return null;
  const [item] = await tx.select({ id: trendItems.id }).from(trendItems).where(and(
    eq(trendItems.sourceId, source.id), eq(trendItems.externalVideoId, contentDigest),
    eq(trendItems.rightsScope, "profile_private"),
    eq(trendItems.profileId, pair.profileId), eq(trendItems.workspaceId, pair.workspaceId),
  )).limit(1);
  if (!item) return null;
  const [transcript] = await tx.select({ referenceInputId: trendTranscripts.referenceInputId }).from(trendTranscripts).where(and(
    eq(trendTranscripts.trendItemId, item.id), eq(trendTranscripts.contentDigest, contentDigest),
    eq(trendTranscripts.rightsScope, "profile_private"),
    eq(trendTranscripts.profileId, pair.profileId), eq(trendTranscripts.workspaceId, pair.workspaceId),
  )).limit(1);
  // No transcript row (its onboarding input was deleted, cascading it away)
  // is NOT an existing paste: the caller falls through and stores the text
  // again under a fresh input, which re-flips the item to available.
  if (!transcript?.referenceInputId) return null;
  return { referenceInputId: transcript.referenceInputId, itemId: item.id };
}

export type PastedReferenceClaimStatus = "pending" | "retrying" | "completed" | "parked";

export type PastedReferenceClaim = {
  status: PastedReferenceClaimStatus;
  attemptCount: number;
  /** `AUTOPSY_ATTEMPT_CODE_CEILING` (R-93) — the "of 5" the screen shows; never a literal there. */
  attemptCeiling: number;
  claimId: string;
  autopsyId: string | null;
};

/**
 * One pasted reference as the owner sees it (R5). NO transcript body, NO
 * provenance: the third-party text stays in the row it was stored in.
 */
export type PastedReference = {
  itemId: string;
  /** `null` when the creator gave none — the URL is not promoted to a title. */
  title: string | null;
  sourceUrl: string;
  /** `null` when the creator chose none. */
  niche: string | null;
  /** When it was pasted — the one date this product observed for it. */
  createdAt: Date;
  /**
   * THE ITEM'S OWN COLUMN, so the screen's "No channel baseline — pasted
   * reference" line is DERIVED rather than typed (learning gate CHANGE 2, fix
   * round 1). The reader below also predicates on `unavailable`, so today
   * every row of the list carries that value; the per-claim reader does not,
   * and either way the honesty claim is now read off the record instead of
   * asserted by the page — a `measured` row would say so rather than have a
   * "no baseline" sentence printed over its own ratio.
   */
  baselineState: "measured" | "unavailable";
  /**
   * DERIVED FROM THE TRANSCRIPT ROW'S PRESENCE, not from the item's column:
   * deleting the onboarding input cascades the transcript away and nothing
   * flips the item (no trigger, by design — R7), so the column alone would
   * keep saying "available" about text that is gone.
   */
  transcriptState: "transcript_available" | "transcript_unavailable";
  /** `null` only for an item no claim was ever opened on — never produced by the intake. */
  claim: PastedReferenceClaim | null;
  /** The same app-safe projection `trendFeedProjection` builds; present only when completed and parseable. */
  autopsy?: TrendFeedItem["autopsy"];
};

/**
 * The status a claim row DISPLAYS as. `pending` is the first attempt waiting
 * or running; anything past the first attempt that is not terminal is
 * `retrying`, including a `failed` row the dispatcher has not yet re-leased
 * and a `failed` row at the ceiling the next `startAttempt` will park.
 */
function displayClaimStatus(row: { status: "pending" | "completed" | "failed" | "parked"; attemptCount: number }): PastedReferenceClaimStatus {
  switch (row.status) {
    case "completed": return "completed";
    case "parked": return "parked";
    case "failed": return "retrying";
    case "pending": return row.attemptCount > 1 ? "retrying" : "pending";
  }
}

/**
 * The owner's pasted references, newest first (R5). PRIVATE `submitted` items
 * WITH NO CHANNEL BASELINE under this profile's pair, each with its newest
 * private claim and — when that claim completed and its analysis parses — the
 * same projection the feed returns. Cross-profile: a sibling's pastes never
 * match the pair predicate (witnessed in `pasted-reference.test.ts`; dropping
 * the pair is mutation M8).
 *
 * `baseline_state = 'unavailable'` IS PART OF THE POPULATION, not decoration
 * (learning gate CHANGE 2, fix round 1). This reader feeds a section whose
 * every row is presented as having no channel baseline, and `feedItemsForProfile`
 * selects the exact complement (`= 'measured'`, M7). Without this predicate a
 * private `submitted` item that DID have a baseline — a shape the writers and
 * the fixtures both build — would appear in both surfaces at once, ranked by
 * its outlier ratio in one and captioned "no channel baseline" in the other.
 * The two readers now partition the profile's private items rather than
 * overlapping, and `PastedReference.baselineState` carries the value so the
 * caption is read rather than assumed.
 *
 * UNBOUNDED BY DESIGN, and the bound is structural rather than a LIMIT: every
 * pasted item costs one `reference` onboarding input, capped at
 * `REFERENCE_COUNT_MAX` (50) per profile by `appendReferencePost`, and
 * `onboarding_inputs` has no delete path. A LIMIT here would truncate a list
 * that cannot exceed that number and would do so silently.
 */
export async function pastedReferencesForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string
): Promise<PastedReference[]> {
  const profile = await ProfileScope.mint(db, scope, profileId);
  const pair: OwnerPair = { profileId: profile.profileId, workspaceId: profile.workspaceId };
  return boundedReadOrJoin(db, async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const rows = await tx.select({ item: trendItems, sourceUrl: trendSources.sourceUrl })
      .from(trendItems)
      .innerJoin(trendSources, eq(trendSources.id, trendItems.sourceId))
      .where(and(
        eq(trendSources.kind, "submitted"),
        eq(trendSources.profileId, pair.profileId), eq(trendSources.workspaceId, pair.workspaceId),
        eq(trendItems.rightsScope, "profile_private"),
        eq(trendItems.baselineState, "unavailable"),
        eq(trendItems.profileId, pair.profileId), eq(trendItems.workspaceId, pair.workspaceId),
      ))
      .orderBy(desc(trendItems.createdAt), desc(trendItems.id));
    return Promise.all(rows.map((row) => projectPastedReference(tx, pair, row.item, row.sourceUrl)));
  });
}

/**
 * One pasted reference by its CLAIM id (R5's "sibling's claim id refused").
 * The claim is read under the pair first; a foreign, nonexistent or shared
 * claim id fails that one predicate with one message.
 */
export async function pastedReferenceForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string, claimId: string
): Promise<PastedReference> {
  if (typeof claimId !== "string" || !/\S/.test(claimId)) throw new Error("pasted reference claim id is required");
  const profile = await ProfileScope.mint(db, scope, profileId);
  const pair: OwnerPair = { profileId: profile.profileId, workspaceId: profile.workspaceId };
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    const [row] = await tx.select({ item: trendItems, sourceUrl: trendSources.sourceUrl })
      .from(autopsyCacheClaims)
      .innerJoin(trendItems, eq(trendItems.id, autopsyCacheClaims.trendItemId))
      .innerJoin(trendSources, eq(trendSources.id, trendItems.sourceId))
      .where(and(
        eq(autopsyCacheClaims.id, claimId),
        eq(autopsyCacheClaims.rightsScope, "profile_private"),
        eq(autopsyCacheClaims.profileId, pair.profileId), eq(autopsyCacheClaims.workspaceId, pair.workspaceId),
        eq(trendSources.kind, "submitted"),
        eq(trendSources.profileId, pair.profileId), eq(trendSources.workspaceId, pair.workspaceId),
        eq(trendItems.rightsScope, "profile_private"),
        eq(trendItems.profileId, pair.profileId), eq(trendItems.workspaceId, pair.workspaceId),
      ))
      .limit(1);
    if (!row) throw new Error("pasted reference claim is not accessible to this profile");
    return projectPastedReference(tx, pair, row.item, row.sourceUrl);
  });
}

/**
 * EVERY parked private claim this profile owns, oldest first (R-98's real
 * population, fix round 1).
 *
 * WHY THIS EXISTS RATHER THAN A FILTER OVER `pastedReferencesForProfile`.
 * That reader's projection reads the NEWEST claim per item
 * (`projectPastedReference`'s `orderBy … limit 1`), because a screen shows one
 * status per pasted reference. Settling a refund over it makes the money's
 * population "parked AND newest-per-item", strictly narrower than the R9
 * sentence `settleParkedAutopsies` states — and the day a second claim exists
 * on one item (an `AUTOPSY_ANALYSIS_VERSION` bump, which this module's own
 * docblocks plan for), the older parked-and-debited claim becomes permanently
 * unrefundable while the item still renders as queued. CLAUDE.md 2026-08-29: a
 * population written as one path narrows silently the day a second path
 * appears. So the money reads claims, not the display.
 *
 * THE CLAIM IS SCOPED BY THE SAME TRIPLE `projectPastedReference`'s claim read
 * uses — the same `ProfileScope.mint` and the same
 * `(rights_scope='profile_private', profile_id, workspace_id)` predicate, so a
 * sibling profile's or another workspace's parked claim can no more be settled
 * than it can be displayed. `status = 'parked'` is the only added predicate,
 * and the ordering is `(created_at, id)` ascending so a settlement's order is
 * the order the claims were opened in rather than whatever the planner returns.
 *
 * THE ITEM IS NOT SCOPED HERE, BECAUSE THE ITEM IS NOT RETURNED (tenancy round
 * 2, CHANGE A). This function used to select `autopsy_cache_claims.trend_item_id`
 * out beside the claim id, under a docblock claiming its scoping was IDENTICAL
 * to the display reader's. It was not: the display reader DERIVES the claim
 * from a row already proven pair-owned, while this one starts at the claim and
 * handed out a column with no predicate on the row it names — and nothing in
 * the schema ties a claim's pair to its item's pair (`autopsy_cache_claims` has
 * an FK to `trend_items(id)` and a separate composite FK to
 * `creator_profiles(id, workspace_id)`, unrelated to each other). The reviewer
 * forged that row on real Postgres and this predicate returned it. No writer
 * builds the shape — `claimPrivateAutopsyForSystem` pair-checks the item first
 * — and `startAttempt` re-checks the pairing before spending, so it was a
 * bypass nothing walked; it crossed the package boundary all the same.
 *
 * THE FIX IS THE DROP, NOT AN ITEM JOIN, and that direction is the whole point:
 * an `innerJoin(trendItems, ...pair)` would re-narrow the money's population to
 * "parked AND item still readable under this pair", reintroducing round 1's
 * CHANGE 1 in a new dress — an item lifted from `unavailable` to `measured`
 * leaves this reader's sibling display population while its parked, DEBITED
 * claim must still be refundable. A witness in
 * `packages/db/tests/pasted-reference.test.ts` parks a claim whose
 * `trend_item_id` belongs to ANOTHER profile and asserts it is still returned,
 * so tidying the join back in is red rather than plausible.
 *
 * Returns claim ids and nothing else: no item, no transcript, no provenance,
 * no analysis — the caller is the ledger, and it needs none of them.
 */
export async function parkedAutopsyClaimsForProfile(
  db: DbLike, scope: WorkspaceScope, profileId: string
): Promise<readonly { claimId: string }[]> {
  const profile = await ProfileScope.mint(db, scope, profileId);
  return db.transaction(async (tx) => {
    await assertFreshProfileScopeInTx(tx, profile);
    return tx.select({ claimId: autopsyCacheClaims.id })
      .from(autopsyCacheClaims)
      .where(and(
        eq(autopsyCacheClaims.rightsScope, "profile_private"),
        eq(autopsyCacheClaims.profileId, profile.profileId),
        eq(autopsyCacheClaims.workspaceId, profile.workspaceId),
        eq(autopsyCacheClaims.status, "parked"),
      ))
      .orderBy(asc(autopsyCacheClaims.createdAt), asc(autopsyCacheClaims.id));
  });
}

async function projectPastedReference(
  db: DbLike | TxLike, pair: OwnerPair, item: typeof trendItems.$inferSelect, sourceUrl: string
): Promise<PastedReference> {
  const [transcript] = await db.select({ id: trendTranscripts.id }).from(trendTranscripts).where(and(
    eq(trendTranscripts.trendItemId, item.id), eq(trendTranscripts.rightsScope, "profile_private"),
    eq(trendTranscripts.profileId, pair.profileId), eq(trendTranscripts.workspaceId, pair.workspaceId),
  )).limit(1);
  const [claimRow] = await db.select().from(autopsyCacheClaims).where(and(
    eq(autopsyCacheClaims.trendItemId, item.id), eq(autopsyCacheClaims.rightsScope, "profile_private"),
    eq(autopsyCacheClaims.profileId, pair.profileId), eq(autopsyCacheClaims.workspaceId, pair.workspaceId),
  )).orderBy(desc(autopsyCacheClaims.createdAt), desc(autopsyCacheClaims.id)).limit(1);
  const claim: PastedReferenceClaim | null = claimRow
    ? {
        status: displayClaimStatus(claimRow), attemptCount: claimRow.attemptCount,
        attemptCeiling: AUTOPSY_ATTEMPT_CODE_CEILING, claimId: claimRow.id, autopsyId: claimRow.autopsyId,
      }
    : null;
  let autopsy: PastedReference["autopsy"];
  if (claimRow?.status === "completed" && claimRow.autopsyId) {
    const [row] = await db.select().from(autopsies).where(and(
      eq(autopsies.id, claimRow.autopsyId), eq(autopsies.trendItemId, item.id), eq(autopsies.status, "completed"),
      eq(autopsies.rightsScope, "profile_private"),
      eq(autopsies.profileId, pair.profileId), eq(autopsies.workspaceId, pair.workspaceId),
    )).limit(1);
    const analysis = row ? parseCanonicalAutopsyAnalysis(row.analysis) : null;
    if (row && analysis) autopsy = { ...analysis, autopsyId: row.id, analysisVersion: row.analysisVersion };
  }
  return {
    itemId: item.id,
    title: item.title === "" ? null : item.title,
    sourceUrl,
    niche: item.niche === "" ? null : item.niche,
    createdAt: item.createdAt,
    baselineState: item.baselineState,
    transcriptState: transcript ? "transcript_available" : "transcript_unavailable",
    claim,
    ...(autopsy ? { autopsy } : {}),
  };
}
