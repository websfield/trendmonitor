/**
 * The review payload — REQ-110's data without the UI (Phase 5, task 6).
 *
 * REQ-110 asks for side-by-side variant review: each video shown with its angle,
 * audience promise, hook hypothesis, source moments, target metric, rights status
 * and a concise decision rationale. The UI is `review-web`, which is Phase 1 and
 * explicitly out of scope here (decisions.md D-9: **no UI** at Phase 0). What is
 * NOT out of scope is the data, because two things depend on it now:
 *
 *   - a reviewer running `cutdown approve` has to have seen something, and
 *     "watch the mp4 and remember the brief" is not a reviewable presentation;
 *   - when the UI does land, it must not need new plumbing. If the payload is
 *     assembled here, `review-web` is a renderer over a file.
 *
 * So this module writes one JSON document per draft render into
 * `reviews/pending/<renderId>.json`. It is a *derived* artefact — every field is
 * copied from a committed contract object, nothing is invented — which is why it
 * has no schema of its own: it would be a second, redundant source of truth for
 * fields that already have one.
 *
 * ## The rule this module obeys most carefully
 *
 * **It never fabricates.** Where a source object does not carry a field, the
 * payload records `null` *with a reason* rather than a plausible-looking value or
 * a silent omission. A reviewer deciding on rights, in particular, must be able
 * to tell "no rights record exists" from "rights are fine" — REQ-003's whole
 * point is that unknown material is flagged rather than assumed cleared, and a
 * review screen that quietly showed nothing for an unknown asset would undo that
 * at the exact moment a human was making the call.
 */

import type {
  CreativeBriefV1,
  JobBriefV1,
  MomentV1,
  PlatformEdlV1,
  RenderV1,
  TechnicalQaReportV1,
} from '@cutdown/contracts/generated';

type CreativeBrief = CreativeBriefV1.CreativeBrief;
type JobBrief = JobBriefV1.JobBrief;
type Moment = MomentV1.Moment;
type PlatformEDL = PlatformEdlV1.PlatformEDL;
type Render = RenderV1.Render;
type TechnicalQaReport = TechnicalQaReportV1.TechnicalQaReport;

/** A value that may legitimately be absent, always with the reason it is absent. */
export type Absent<T> = { readonly value: T } | { readonly value: null; readonly reason: string };

const present = <T>(value: T): Absent<T> => ({ value });
const absent = <T>(reason: string): Absent<T> => ({ value: null, reason });

/** One source moment, as a reviewer needs to see it. */
export interface ReviewMomentSummary {
  readonly momentId: string;
  readonly assetId: string;
  readonly clipId: string;
  readonly narrativeFunction: string;
  /** Why the planner chose this moment for this slot — copied, never generated. */
  readonly rationale: string;
  readonly sourceRange: { readonly startTicks: number; readonly endTicks: number; readonly timebase: { readonly num: number; readonly den: number } };
  /** Verbatim transcript of the moment, when the Moment carries one. */
  readonly verbatim: Absent<string>;
  /** The moment's own resolved rights state (REQ-003), per its source asset. */
  readonly rightsState: Absent<string>;
}

export interface ReviewRightsSummary {
  /**
   * The WEAKEST rights state across every asset the cut uses.
   *
   * The weakest rather than a list-and-let-the-reader-judge, because a reviewer
   * scanning three variants will read the summary line and not the detail, and
   * the summary must not be able to look better than the material it describes.
   * The per-moment detail is still present above.
   */
  readonly weakestState: Absent<string>;
  readonly assetStates: readonly { readonly assetId: string; readonly state: string }[];
  /** Assets whose rights record is absent or unknown — named, not counted. */
  readonly unknownAssetIds: readonly string[];
  readonly disclosures: PlatformEDL['disclosures'];
}

export interface ReviewPayload {
  /** Not a contract object: a derived view, versioned so a reader can tell. */
  readonly payloadVersion: '1.0.0';
  readonly assembledAt: string;
  readonly jobId: string;
  readonly accountId: string;
  readonly draftRenderId: string;
  readonly renderManifestId: string;
  readonly edlId: string;
  readonly creativeBriefId: string;
  /** Job-relative path to the file a reviewer actually watches. */
  readonly outputPath: string;
  readonly captions: Render['captions'];

  // ---- REQ-110's named fields ----
  readonly angle: string;
  readonly audiencePromise: string;
  readonly hookHypothesis: { readonly hookFamily: string; readonly narrativeArchetype: string };
  readonly moments: readonly ReviewMomentSummary[];
  readonly targetMetric: Absent<string>;
  readonly rights: ReviewRightsSummary;
  readonly decisionRationale: readonly string[];

  /** The QA verdict the reviewer is deciding against, never re-derived here. */
  readonly qa: Absent<{
    readonly gateStatus: TechnicalQaReport['gateStatus'];
    readonly blockerCount: number;
    readonly warningCount: number;
    readonly waivedFindingIds: readonly string[];
  }>;
}

export interface AssembleReviewPayloadInput {
  readonly jobBrief: JobBrief;
  readonly creativeBrief: CreativeBrief;
  readonly edl: PlatformEDL;
  readonly render: Render;
  /** Every Moment the EDL's clips reference, by momentId. Missing entries are reported, not filled. */
  readonly momentsById: ReadonlyMap<string, Moment>;
  /** The resolved rights state per asset, from each SourceAsset's `rights.state`. */
  readonly rightsByAssetId: ReadonlyMap<string, string>;
  readonly qaReport: TechnicalQaReport | null;
  readonly assembledAt: string;
}

/**
 * Rights states from weakest to strongest.
 *
 * `unknown` sits at the WEAKEST end deliberately, below `restricted` and
 * `expired`: those two are known refusals a reviewer can reason about, whereas
 * `unknown` is the absence of a record, and REQ-003 forbids treating an absence
 * as anything better than the worst case.
 */
const RIGHTS_WEAKEST_FIRST = ['unknown', 'expired', 'restricted', 'cleared'] as const;

function weakestRightsState(states: readonly string[]): Absent<string> {
  if (states.length === 0) return absent('the cut references no assets with a resolved rights record');
  for (const candidate of RIGHTS_WEAKEST_FIRST) {
    if (states.includes(candidate)) return present<string>(candidate);
  }
  // An unrecognised state is not silently ranked. A rights vocabulary that grew
  // without this function noticing must not resolve to "probably fine".
  return absent(`the cut carries rights state(s) this summary does not rank: ${[...new Set(states)].join(', ')}`);
}

export function assembleReviewPayload(input: AssembleReviewPayloadInput): ReviewPayload {
  const { creativeBrief, edl, render, jobBrief } = input;

  const moments: ReviewMomentSummary[] = edl.clips
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((clip) => {
      const moment = input.momentsById.get(clip.momentId);
      const rights = input.rightsByAssetId.get(clip.assetId);
      return {
        momentId: clip.momentId,
        assetId: clip.assetId,
        clipId: clip.clipId,
        narrativeFunction: clip.narrativeFunction,
        rationale: clip.rationale,
        sourceRange: {
          startTicks: clip.sourceRange.startTicks,
          endTicks: clip.sourceRange.endTicks,
          timebase: clip.sourceRange.timebase,
        },
        verbatim:
          moment === undefined
            ? absent<string>(`Moment ${clip.momentId} is not in this job's Moment Graph, so its transcript cannot be shown`)
            : moment.transcript.verbatimText.length > 0
              ? present(moment.transcript.verbatimText)
              : absent<string>('this Moment carries no transcribed speech'),
        rightsState:
          rights === undefined
            ? absent<string>(`no SourceAsset rights record was found for asset ${clip.assetId}`)
            : present(rights),
      };
    });

  const assetStates = [...new Set(edl.clips.map((clip) => clip.assetId))]
    .sort()
    .flatMap((assetId) => {
      const state = input.rightsByAssetId.get(assetId);
      return state === undefined ? [] : [{ assetId, state }];
    });
  const missingRights = [...new Set(edl.clips.map((clip) => clip.assetId))]
    .sort()
    .filter((assetId) => input.rightsByAssetId.get(assetId) === undefined);

  // An asset with NO record counts as `unknown` for the summary line. Leaving it
  // out would let a cut whose rights are entirely unrecorded present a `cleared`
  // summary from the one asset that happened to have a record.
  const statesForSummary = [...assetStates.map((entry) => entry.state), ...missingRights.map(() => 'unknown')];

  const qa: ReviewPayload['qa'] =
    input.qaReport === null
      ? absent('no technical QA report exists beside this render')
      : present({
          gateStatus: input.qaReport.gateStatus,
          blockerCount: input.qaReport.findings.filter((f) => f.severity === 'blocker').length,
          warningCount: input.qaReport.findings.filter((f) => f.severity === 'warning').length,
          waivedFindingIds: input.qaReport.waivedFindingIds,
        });

  return {
    payloadVersion: '1.0.0',
    assembledAt: input.assembledAt,
    jobId: render.jobId,
    accountId: jobBrief.accountId,
    draftRenderId: render.renderId,
    renderManifestId: render.renderManifestId,
    edlId: edl.edlId,
    creativeBriefId: creativeBrief.creativeBriefId,
    outputPath: render.outputPath,
    captions: render.captions,

    angle: creativeBrief.creativeThesis,
    audiencePromise: creativeBrief.audiencePromise,
    hookHypothesis: {
      hookFamily: creativeBrief.hookFamily,
      narrativeArchetype: creativeBrief.narrativeArchetype,
    },
    moments,
    // REQ-110's "target metric". The JobBrief carries an `objective`, which is
    // what the job is FOR; a numeric target is a Phase 1 concern (REQ-120's
    // analytics import is what would make one measurable). Recorded as the
    // objective with that stated, rather than as a fabricated number or a bare
    // null that reads as an oversight.
    targetMetric: present(
      `${jobBrief.objective} (objective; Phase 0 records no numeric target — REQ-120 analytics import is Phase 1)`,
    ),
    rights: {
      weakestState: weakestRightsState(statesForSummary),
      assetStates,
      unknownAssetIds: missingRights,
      disclosures: edl.disclosures,
    },
    // REQ-110's "concise decision rationale", assembled from what the pipeline
    // ALREADY recorded: the angle's own limitations and its measured distinctness
    // from its siblings. Nothing here is generated for the review screen — a
    // rationale written at review time would be a rationale nobody can audit
    // against the decision that produced the cut.
    decisionRationale: [
      `Distinctness: shares ${String(creativeBrief.distinctness.sharedMomentFraction)} of its moments with sibling variants (${creativeBrief.distinctness.semanticAngleLabel}).`,
      ...creativeBrief.knownLimitations.map((limitation) => `Known limitation: ${limitation}`),
      ...creativeBrief.proofPoints.map(
        (proof) => `Proof: ${proof.claim} — evidenced by moment(s) ${proof.evidenceMomentIds.join(', ')} (${proof.basis}).`,
      ),
    ],
    qa,
  };
}
