import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ulid } from 'ulid';

import {
  assertSafeId,
  contractValidator,
  contractSchemaId,
  fail,
  readContractJson,
  readVersionedContractJson,
  formatAjvErrors,
  jobDir,
  resolveJobRelative,
  runSkillMain,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';
import {
  currentContractSet,
  resolveApprovalForManifest,
  type ReviewDecision,
} from '@cutdown/contracts';
import { extractStillFrame } from '@cutdown/renderer-core';
import { qaAllowsAdvance, type QaWaiver, type TechnicalQaReport } from '@cutdown/qa';
import type {
  ContentPackageV1,
  JobBriefV1,
  MasterStoryPlanV1,
  PlatformEdlV1,
  RenderManifestV1,
  RenderV1,
  RenderV2,
  SourceAssetV1,
} from '@cutdown/contracts/generated';

/**
 * `package` — the last gate on the Phase 0 exit path (tech-spec §15 step 8).
 *
 * Two of the four exit criteria are computed from ContentPackages and nothing
 * else, so this skill's job is less "assemble a bundle" than "refuse to assemble
 * one that would be counted without deserving it". Every check below maps to a
 * way a package could otherwise assert something it cannot show.
 *
 * Ordering is deliberate and worth keeping: **every refusal happens before any
 * file is written.** The bundle is then staged in a sibling directory and renamed
 * into place, so `packages/` never contains a half-package — a partial bundle
 * would be counted by `status --phase0` as a delivered output.
 */

type ContentPackage = ContentPackageV1.ContentPackage;
type JobBrief = JobBriefV1.JobBrief;
type MasterStoryPlan = MasterStoryPlanV1.MasterStoryPlan;
type PlatformEDL = PlatformEdlV1.PlatformEDL;
type RenderManifest = RenderManifestV1.RenderManifest;
// Both majors flow through this reader (Stage 0B-3, D-62): v1 records on disk
// and v2 records from the constant-stamped producer. The two generated types are
// structurally identical (v2 only adds patterns, which types cannot carry), but
// the union states what is actually read.
type Render = RenderV1.Render | RenderV2.Render;
type SourceAsset = SourceAssetV1.SourceAsset;

const SKILL = 'package';
const VERSION = '1.0.0';
const PACKAGE_SCHEMA_ID = 'https://cutdown.local/contracts/schemas/content-package-v1.json';

/** Rights states that can never be packaged (REQ-003/REQ-103, non-waivable per D-35). */
const REFUSED_RIGHTS_STATES = ['unknown', 'restricted', 'expired'] as const;

interface PackageRequest {
  jobId: string;
  finalRenderId: string;
}

interface PackageResult {
  kind: 'packaged';
  jobId: string;
  contentPackageId: string;
  packagePath: string;
  releaseState: 'editorially_approved' | 'rights_approved';
  sourceClassification: 'real' | 'fixture';
  reviewDecisionId: string;
  finalRenderId: string;
  qaGateStatus: 'pass' | 'pass_with_waivers';
  warningWaiverCount: number;
  rightsWeakestState: 'cleared';
  rightsAllEvidenced: boolean;
  rangeCount: number;
  contractSetSize: number;
  files: string[];
}

const readJson = <T>(path: string, code: string, what: string): T => {
  if (!existsSync(path)) throw fail(code, `${what} not found at ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw fail(code, `${what} at ${path} is not valid JSON: ${(error as Error).message}`);
  }
};

/**
 * `readContract` is now `readContractJson` from `@cutdown/skill-runtime`.
 *
 * This skill carried its own copy — same name, same four parameters, copy-pasted
 * message text, and a private Ajv beside it. Two implementations of one boundary
 * check is how they drift: the local one still echoed `JSON.parse`'s message, which
 * quotes the file's first bytes, long after that shape was suppressed elsewhere.
 * `readContractJson` also owns the one-Ajv-per-process caching this file used to do
 * by hand.
 */
const readContract = readContractJson;

/**
 * One Ajv for the whole invocation, for the two checks that need RAW access.
 *
 * `readContractJson` covers every read-and-refuse site. These two cannot use it:
 * `loadAppliedWaivers` must treat an invalid waiver as ABSENT and collect its errors
 * rather than throw, and the final package check reports "a defect in the skill, not
 * in the request". Both need the validator itself, not a helper that throws.
 */
let sharedAjv: ReturnType<typeof contractValidator> | null = null;
const ajv = (): ReturnType<typeof contractValidator> => (sharedAjv ??= contractValidator());

// Render records span two majors since the Stage 0B-3 `render-v2` bump (D-62), so
// they are read through `readVersionedContractJson`, which dispatches on the
// envelope's DECLARED major — there is deliberately no pinned render `$id` constant
// here for a future repoint to miss.
const RENDER_CONTRACTS = ['render-v1', 'render-v2'];
const MANIFEST_SCHEMA = contractSchemaId('render-manifest-v1');
const QA_REPORT_SCHEMA = contractSchemaId('technical-qa-report-v1');
const EDL_SCHEMA = contractSchemaId('platform-edl-v1');

interface LocatedRender {
  readonly render: Render;
  readonly tier: 'draft' | 'final';
  readonly renderRel: string;
}

/**
 * Find a render by id across BOTH tiers.
 *
 * Searching the draft tier too is what lets the skill say "that is a draft" rather
 * than "no such render" — the same reasoning as in `approve`. An operator who
 * passed the wrong id needs to know which mistake they made.
 */
function locateRender(root: string, renderId: string): LocatedRender | null {
  for (const tier of ['final', 'draft'] as const) {
    const tierRoot = join(root, 'renders', tier);
    if (!existsSync(tierRoot)) continue;
    for (const manifestDir of readdirSync(tierRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const renderPath = join(tierRoot, manifestDir, 'render.json');
      if (!existsSync(renderPath)) continue;
      const parsed = readVersionedContractJson<Render>(renderPath, RENDER_CONTRACTS, 'RENDER_ARTEFACT_UNREADABLE', `The render record at renders/${tier}/${manifestDir}`);
      if (parsed.renderId === renderId) {
        return { render: parsed, tier, renderRel: `renders/${tier}/${manifestDir}` };
      }
    }
  }
  return null;
}

/** The newest committed artefact in a directory, by ULID-sorted name. */
function loadLatest<T>(dir: string, code: string, what: string): T {
  if (!existsSync(dir)) throw fail(code, `${what}: no directory at ${dir}.`);
  const latest = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1);
  if (latest === undefined) throw fail(code, `${what}: ${dir} holds no committed artefact.`);
  return JSON.parse(readFileSync(join(dir, latest), 'utf8')) as T;
}

/** Every SourceAsset in the job, by assetId. */
function loadAssets(root: string): Map<string, SourceAsset> {
  const assetsDir = join(root, 'assets');
  if (!existsSync(assetsDir)) {
    throw fail('ASSETS_NOT_FOUND', `No assets directory at ${assetsDir}; the job has not been ingested, so no rights manifest can be assembled.`);
  }
  const map = new Map<string, SourceAsset>();
  for (const file of readdirSync(assetsDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const asset = JSON.parse(readFileSync(join(assetsDir, file), 'utf8')) as SourceAsset;
    map.set(asset.assetId, asset);
  }
  return map;
}

/**
 * The QA waivers on disk that this report actually applied, in full.
 *
 * Each candidate is VALIDATED against `qa-waiver-v1` before it is indexed, not
 * parsed and cast. A cast would admit a file carrying only `waiverId` and then read
 * `approvedBy`/`reason`/`waivedAt` off it as `undefined` — which the package's own
 * contract validation would eventually reject, but with an error pointing at the
 * package rather than at the waiver file that caused it. A waiver that fails its own
 * schema is treated as ABSENT, so the `missing` refusal below names it by id.
 */
function loadAppliedWaivers(root: string, report: TechnicalQaReport): ContentPackage['qa']['waivers'] {
  if (report.waiverIds.length === 0) return [];

  const validateWaiver = ajv().getSchema(contractSchemaId('qa-waiver-v1'));
  if (validateWaiver === undefined) {
    throw fail('WAIVER_SCHEMA_MISSING', 'qa-waiver-v1 is not registered; the applied waivers cannot be validated.');
  }

  const waiversDir = join(root, 'waivers');
  const byId = new Map<string, QaWaiver>();
  const invalid = new Map<string, string>();
  if (existsSync(waiversDir)) {
    for (const file of readdirSync(waiversDir).sort()) {
      if (!file.endsWith('.json')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(waiversDir, file), 'utf8'));
      } catch {
        // A malformed unrelated file must not decide the outcome: the report already
        // records which waiver ids it applied, and an id with no valid record behind
        // it becomes the named refusal below.
        continue;
      }
      if (!validateWaiver(parsed)) {
        const id = (parsed as { waiverId?: unknown }).waiverId;
        if (typeof id === 'string') invalid.set(id, formatAjvErrors(validateWaiver.errors));
        continue;
      }
      const waiver = parsed as QaWaiver;
      byId.set(waiver.waiverId, waiver);
    }
  }

  const resolved: ContentPackage['qa']['waivers'] = [];
  const missing: string[] = [];
  for (const waiverId of report.waiverIds) {
    const waiver = byId.get(waiverId);
    if (waiver === undefined) {
      const why = invalid.get(waiverId);
      missing.push(why === undefined ? waiverId : `${waiverId} (on disk but schema-invalid: ${why.trim()})`);
      continue;
    }
    resolved.push({
      waiverId: waiver.waiverId,
      approvedBy: waiver.approvedBy,
      reason: waiver.reason,
      waivedAt: waiver.waivedAt,
      findingIds: nonEmpty(waiver.findingIds, `Waiver ${waiver.waiverId}'s finding list`),
    });
  }
  if (missing.length > 0) {
    // A package must carry its waivers IN FULL: `status --phase0` reports waived
    // packages separately, and a waiver recorded only as an id cannot show who
    // accepted what or why. An unresolvable id is missing evidence, not a detail.
    throw fail(
      'WAIVER_EVIDENCE_MISSING',
      `The final QA report applied waiver(s) ${missing.join(', ')} that are not committed under waivers/. ` +
        `A delivered package carries its waivers in full — who accepted which findings and why — so an id with no record behind it is missing evidence (D-35).`,
      { missingWaiverIds: missing },
    );
  }
  return resolved;
}

/** The approval in force for the draft this final render descends from. */
function requireApproval(root: string, finalManifest: RenderManifest): ReviewDecision {
  const approvedDraftManifestId = finalManifest.approvedDraftManifestId;
  if (approvedDraftManifestId === null || approvedDraftManifestId === undefined) {
    throw fail(
      'FINAL_RENDER_NOT_APPROVED',
      `The final manifest ${finalManifest.renderManifestId} names no approved draft manifest, so nothing authorises packaging it (D-34, tech-spec §15 step 8).`,
    );
  }
  const resolution = resolveApprovalForManifest(join(root, 'reviews'), approvedDraftManifestId);
  if (resolution.kind === 'rejected') {
    const rejected = resolution.decision.decision as { outcome: 'rejected'; reason: string };
    throw fail(
      'PACKAGE_APPROVAL_REJECTED',
      `The review decision in force for draft manifest ${approvedDraftManifestId} is a REJECTION by ${resolution.decision.decidedBy}: "${rejected.reason}". ` +
        `Run \`cutdown revise\` — a rejection never becomes a delivered package.`,
      { approvedDraftManifestId, reviewDecisionId: resolution.decision.reviewDecisionId },
    );
  }
  if (resolution.kind === 'indeterminate') {
    throw fail(
      'REVIEW_DECISIONS_INDETERMINATE',
      `This render cannot be packaged: ${String(resolution.rejectedFiles.length)} file(s) under reviews/ could not be read as decisions, so the decision set is incomplete and no approval can be trusted. ` +
        `Fix or remove: ${resolution.rejectedFiles.map((f) => `${f.file} (${f.reason})`).join('; ')}`,
      { approvedDraftManifestId, rejectedFiles: resolution.rejectedFiles },
    );
  }

  if (resolution.kind === 'none') {
    throw fail(
      'FINAL_RENDER_NOT_APPROVED',
      `No review decision in force names draft manifest ${approvedDraftManifestId}, which the final render claims to descend from. ` +
        `Packaging before approval fails (tech-spec §15 step 8); there is no flag that waives it.`,
      { approvedDraftManifestId },
    );
  }
  return resolution.decision;
}

async function run(request: PackageRequest, ctx: SkillContext): Promise<PackageResult> {
  const root = jobDir(ctx.workspaceRoot, request.jobId);

  // ---- 1. The render, and its tier ----
  const located = locateRender(root, request.finalRenderId);
  if (located === null) {
    throw fail(
      'RENDER_NOT_FOUND',
      `No render with id ${request.finalRenderId} exists in job ${request.jobId}.`,
      { finalRenderId: request.finalRenderId },
    );
  }
  if (located.tier !== 'final') {
    throw fail(
      'NOT_A_FINAL_RENDER',
      `Render ${request.finalRenderId} is a ${located.tier}-tier render. A draft is not a master (D-34): its media is a proxy and it carries a burned-in version identifier. ` +
        `Approve the draft, render \`--tier final\`, then package that.`,
      { tier: located.tier },
    );
  }
  const { render, renderRel } = located;

  // ---- 2. The manifests, and the approval that authorises this one ----
  const finalManifest = readContract<RenderManifest>(
    join(root, ...renderRel.split('/'), 'manifest.json'),
    MANIFEST_SCHEMA,
    'FINAL_MANIFEST_MISSING',
    'The final render manifest',
  );
  const approval = requireApproval(root, finalManifest);
  const approvedDraftManifestId = finalManifest.approvedDraftManifestId as string;

  if (approval.subjectRenderManifestId !== approvedDraftManifestId) {
    // Unreachable through `resolveApprovalForManifest`, which filters by subject —
    // asserted anyway because this is the one equality the whole ordering rests on,
    // and an unreachable check that would catch a future refactor costs nothing.
    throw fail(
      'APPROVAL_SUBJECT_MISMATCH',
      `The approval resolved for manifest ${approvedDraftManifestId} records subject ${approval.subjectRenderManifestId}.`,
    );
  }
  if (approval.subjectEdlId !== render.edlId) {
    throw fail(
      'APPROVAL_SUBJECT_MISMATCH',
      `The approval was given for EDL ${approval.subjectEdlId}, but this final render realises EDL ${render.edlId}. ` +
        `An approval of one cut never authorises another (REQ-113: a revision is a new object, linked to its parent).`,
      { approvedEdlId: approval.subjectEdlId, finalEdlId: render.edlId },
    );
  }

  // `approvedDraftManifestId` came off a schema-validated manifest, so it is a ULID
  // and cannot traverse — asserted anyway, because this is the one place an id from
  // an artefact becomes a directory name.
  assertSafeId(approvedDraftManifestId, 'The approved draft manifest id');
  const draftManifest = readContract<RenderManifest>(
    join(root, 'renders', 'draft', approvedDraftManifestId, 'manifest.json'),
    MANIFEST_SCHEMA,
    'APPROVED_DRAFT_MANIFEST_MISSING',
    'The approved draft manifest',
  );

  // The `subjectPlanHash` check `review-decision-v1` promises.
  //
  // The reviewer caught that the field was written and never read, so the schema
  // documented a check that did not exist — and contract docs are law here. It is
  // compared against the DRAFT's QA report, not the final's: a final render's plan
  // hash necessarily differs (tier, media and encode settings differ by design), so
  // comparing against the final would be a check that could only ever fail.
  //
  // What it catches that `editorialPlanHash` does not: the plan hash covers the
  // resolved manifest, clip ranges AND caption files, so a draft re-rendered with a
  // different caption layout or encode setting between approval and packaging moves
  // it while `editorialPlanHash` (computed from the EDL alone) stays put. The
  // approval names the plan a human actually watched.
  const draftReportPath = join(root, 'renders', 'draft', approvedDraftManifestId, 'qa-report.json');
  if (!existsSync(draftReportPath)) {
    // REFUSED, not skipped. An `existsSync` with no else meant deleting one file
    // inside a job disabled the strongest "the plan was re-rendered after approval"
    // check, silently — and this project treats the same absence as blocking in the
    // transition gate and in `approve` ("a malformed report fails closed — never
    // treated as absent"). The draft MANIFEST is required to exist two lines above,
    // so its report going missing is a broken job, not a legitimate state.
    throw fail(
      'APPROVED_DRAFT_QA_REPORT_MISSING',
      `The approved draft manifest ${approvedDraftManifestId} has no qa-report.json beside it, so the approval's recorded plan hash cannot be checked against the draft it approved. ` +
        `A render never exists without a report (tech-spec §15 step 7), so this job is inconsistent; re-render and re-approve the draft.`,
      { approvedDraftManifestId },
    );
  }
  {
    const draftReport = readContract<TechnicalQaReport>(
      draftReportPath,
      QA_REPORT_SCHEMA,
      'APPROVED_DRAFT_QA_REPORT_UNREADABLE',
      'The approved draft QA report',
    );
    if (approval.subjectPlanHash.value !== draftReport.planHash.value) {
      throw fail(
        'APPROVED_PLAN_SUPERSEDED',
        `The approval records plan hash ${approval.subjectPlanHash.value.slice(0, 12)} for draft manifest ${approvedDraftManifestId}, ` +
          `but that draft's QA report now records ${draftReport.planHash.value.slice(0, 12)}. The draft was re-rendered against a different plan after it was approved, ` +
          `so the approval no longer describes the cut on disk. Re-approve the current draft, then render final.`,
        {
          approvedPlanHash: approval.subjectPlanHash.value,
          draftPlanHash: draftReport.planHash.value,
          reviewDecisionId: approval.reviewDecisionId,
        },
      );
    }
  }

  // THE editorial-divergence check. `editorialPlanHash` is computed from the EDL,
  // so any editorial change at all moves it — a re-cut range, a reworded caption,
  // a different clip order. This equality is what "the delivered cut is the cut
  // that was approved" reduces to.
  if (finalManifest.editorialPlanHash.value !== draftManifest.editorialPlanHash.value) {
    throw fail(
      'EDITORIAL_DIVERGENCE',
      `The final render's editorial plan hash (${finalManifest.editorialPlanHash.value.slice(0, 12)}) differs from the approved draft's (${draftManifest.editorialPlanHash.value.slice(0, 12)}). ` +
        `The cut changed after sign-off. Re-render the draft, have it re-approved, then render final — the approval belongs to a cut, not to a job.`,
      {
        finalEditorialPlanHash: finalManifest.editorialPlanHash.value,
        approvedEditorialPlanHash: draftManifest.editorialPlanHash.value,
        approvedDraftManifestId,
      },
    );
  }

  // ---- 3. Final QA ----
  const report = readContract<TechnicalQaReport>(
    join(root, ...renderRel.split('/'), 'qa-report.json'),
    QA_REPORT_SCHEMA,
    'QA_REPORT_MISSING',
    'The final render QA report',
  );
  if (report.tier !== 'final') {
    throw fail(
      'QA_REPORT_WRONG_TIER',
      `The report beside the final render describes a ${report.tier} render. A draft's QA never authorises a delivery.`,
    );
  }
  // The report was trusted because of WHERE it sits. Now it also has to say it
  // describes THIS render: every other cross-reference in this file is checked, and
  // a report copied into the wrong directory would otherwise deliver one render's
  // verdict with another render's bytes.
  if (report.renderId !== render.renderId || report.renderManifestId !== finalManifest.renderManifestId) {
    throw fail(
      'QA_REPORT_SUBJECT_MISMATCH',
      `The QA report beside this render describes render ${report.renderId} / manifest ${report.renderManifestId}, ` +
        `but the render is ${render.renderId} / manifest ${finalManifest.renderManifestId}. A report's location is not evidence of its subject.`,
      { reportRenderId: report.renderId, renderId: render.renderId },
    );
  }
  // Re-derived from `findings`, not read off `gateStatus` — a report is a file on
  // disk, and a hand-edited `"gateStatus": "pass"` beside a blocker must not
  // deliver. `qaAllowsAdvance` is the single implementation the runner gate uses.
  const qaVerdict = qaAllowsAdvance(report);
  if (!qaVerdict.allowed) {
    throw fail(
      'FINAL_QA_NOT_PASSED',
      `The final render cannot be packaged: ${qaVerdict.reason} Packaging accepts \`pass\` or \`pass_with_waivers\` only (D-35).`,
      { qaGateStatus: report.gateStatus, qaReportId: report.qaReportId },
    );
  }
  if (report.gateStatus !== 'pass' && report.gateStatus !== 'pass_with_waivers') {
    throw fail('FINAL_QA_NOT_PASSED', `The final QA report records gateStatus "${report.gateStatus}".`);
  }
  const waivers = loadAppliedWaivers(root, report);

  // The range-validation evidence (exit criterion 2). A skipped or errored check
  // is not evidence — and `content-package-v1` fixes `status` at `ran`, so this
  // refusal is what stops the skill trying to write an unrepresentable package.
  const rangeCheck = report.checksRun.find((entry) => entry.checkId === 'source_range_validity');
  if (rangeCheck === undefined || rangeCheck.status !== 'ran') {
    throw fail(
      'RANGE_VALIDATION_MISSING',
      `The final QA report's \`source_range_validity\` check is ${rangeCheck === undefined ? 'absent' : `"${rangeCheck.status}"${rangeCheck.reason === null ? '' : ` (${rangeCheck.reason})`}`}. ` +
        `Exit criterion 2 is "zero invalid source ranges in FINAL renders", and a check that did not run is not evidence of zero.`,
      { status: rangeCheck?.status ?? 'absent' },
    );
  }
  const rangeViolations = report.findings.filter((f) => f.checkId === 'source_range_validity');
  if (rangeViolations.length > 0) {
    throw fail(
      'INVALID_SOURCE_RANGES',
      `The final render carries ${String(rangeViolations.length)} source-range finding(s): ${rangeViolations.map((f) => f.object).join(', ')}. Exit criterion 2 admits zero.`,
    );
  }

  // ---- 4. Lineage: EDL → story plan → creative brief, and the JobBrief ----
  assertSafeId(render.edlId, 'The EDL id on the render record');
  const edl = readContract<PlatformEDL>(join(root, 'edl', `${render.edlId}.json`), EDL_SCHEMA, 'EDL_NOT_FOUND', 'The PlatformEDL');
  assertSafeId(edl.storyPlanId, 'The story plan id on the EDL');
  const storyPlan = readJson<MasterStoryPlan>(
    join(root, 'story-plans', `${edl.storyPlanId}.json`),
    'STORY_PLAN_NOT_FOUND',
    `The MasterStoryPlan ${edl.storyPlanId} the EDL names`,
  );
  const jobBrief = loadLatest<JobBrief>(join(root, 'brief'), 'JOB_BRIEF_NOT_FOUND', 'The JobBrief');

  // ---- 5. Rights, per asset actually used by the cut ----
  const assets = loadAssets(root);
  const usedAssetIds = [...new Set(edl.clips.map((clip) => clip.assetId))].sort();
  // A plain array, narrowed to the contract's non-empty tuple by `nonEmpty` at the
  // point of use — the emptiness guard is a REFUSAL below, not a type assertion here.
  const rightsEntries: ContentPackage['rightsManifest']['assets'][number][] = [];
  const refused: { assetId: string; state: string }[] = [];
  const unknownAssets: string[] = [];

  for (const assetId of usedAssetIds) {
    const asset = assets.get(assetId);
    if (asset === undefined) {
      // An asset the cut references and the job does not hold is missing evidence,
      // not an `unknown` rights state — there is nothing to have a state about.
      unknownAssets.push(assetId);
      continue;
    }
    if ((REFUSED_RIGHTS_STATES as readonly string[]).includes(asset.rights.state)) {
      refused.push({ assetId, state: asset.rights.state });
      continue;
    }
    rightsEntries.push({
      assetId: asset.assetId,
      relativePath: asset.relativePath,
      sourceClassification: asset.sourceClassification,
      contentHash: asset.contentHash,
      rights: asset.rights,
    });
  }

  if (unknownAssets.length > 0) {
    throw fail(
      'RIGHTS_EVIDENCE_MISSING',
      `The EDL references asset(s) ${unknownAssets.join(', ')} that are not in this job's inventory, so no rights record exists for them. ` +
        `A package must carry a rights record for every asset it uses (REQ-088/REQ-103).`,
      { assetIds: unknownAssets },
    );
  }
  if (refused.length > 0) {
    throw fail(
      'RIGHTS_NOT_CLEARED',
      `Rights refuse packaging for: ${refused.map((r) => `${r.assetId} (${r.state})`).join(', ')}. ` +
        `\`unknown\`, \`restricted\` and \`expired\` are all NON-WAIVABLE packaging blockers (REQ-003, decisions.md D-35) — and \`unknown\` refuses on the same footing as \`expired\`, because an absent record is the worst case, never the benign one.`,
      { refused },
    );
  }
  if (rightsEntries.length === 0) {
    throw fail('RIGHTS_EVIDENCE_MISSING', 'The cut resolved no source assets at all; a package with no rights manifest is not a package.');
  }

  const allEvidenced = rightsEntries.every((entry) => typeof entry.rights.evidenceUri === 'string' && entry.rights.evidenceUri.length > 0);

  // D-36: `real` only when EVERY asset is real. One fixture makes the whole
  // package a fixture — otherwise a mixed job would contribute to Phase 0 exit
  // evidence on the strength of its real half.
  const sourceClassification: 'real' | 'fixture' = rightsEntries.every((e) => e.sourceClassification === 'real')
    ? 'real'
    : 'fixture';

  // REQ-105, computed. `rights_approved` needs cleared AND evidenced; the skill
  // never emits `publish_ready` (REQ-088's post copy/hashtags/alt text are product
  // Phase 1, REQ-054) or `published` (Stage B+), because it cannot substantiate them.
  const releaseState: 'editorially_approved' | 'rights_approved' = allEvidenced ? 'rights_approved' : 'editorially_approved';

  // ---- 6. Everything is proven. Stage the bundle, then rename it into place. ----
  const contentPackageId = ulid();
  const packageRel = `packages/${contentPackageId}`;
  const target = join(root, 'packages', contentPackageId);
  const staging = join(root, 'packages', `.staging-${contentPackageId}`);

  // `outputPath` carries no pattern in `render-v1` (only `minLength`); `render-v2`
  // adds one (D-62), but the code guard stays for both majors — the pattern cannot
  // express device names or post-symlink containment, and a traversing value here
  // would copy a file from outside the job into a bundle whose whole purpose is to
  // be handed to a client.
  const masterSource = resolveJobRelative(root, render.outputPath, "The render's outputPath");
  if (!existsSync(masterSource)) {
    throw fail(
      'MASTER_MEDIA_MISSING',
      `The render record points at ${render.outputPath}, which does not exist. The master cannot be delivered.`,
    );
  }

  try {
    mkdirSync(staging, { recursive: true });

    copyFileSync(masterSource, join(staging, 'master.mp4'));
    const masterInfo = statSync(join(staging, 'master.mp4'));

    // The package RECORDS `render.contentHash` as the master's hash, so it has to be
    // the master's hash. This turns "the delivered file is the render that was gated"
    // from a claim into a check — a truncated or altered master would otherwise ship
    // with a hash that does not describe it, and the hash is exactly what a recipient
    // would verify.
    //
    // STREAMED, not `readFileSync`. Reading a final master whole would hard-fail
    // above Node's ~2 GiB buffer limit (`ERR_FS_FILE_TOO_LARGE`), which would mean a
    // large deliverable could never be packaged at all — a check that breaks the
    // thing it verifies is worse than no check.
    const stagedHash = await hashFileStreaming(join(staging, 'master.mp4'));
    if (stagedHash.value !== render.contentHash.value) {
      throw fail(
        'MASTER_HASH_MISMATCH',
        `The staged master hashes to ${stagedHash.value.slice(0, 12)} but the render record says ${render.contentHash.value.slice(0, 12)}. ` +
          `The file on disk is not the render that was gated, so the package would deliver a hash that does not describe its own master.`,
        { staged: stagedHash.value, recorded: render.contentHash.value },
      );
    }

    // REQ-104: a caption FILE exists even when captions are burned in.
    const srtSource = resolveJobRelative(root, render.captions.srtPath, "The render's SRT caption path");
    const vttSource = resolveJobRelative(root, render.captions.vttPath, "The render's WebVTT caption path");
    for (const [source, label] of [[srtSource, 'SRT'], [vttSource, 'WebVTT']] as const) {
      if (!existsSync(source)) {
        throw fail(
          'CAPTION_SIDECAR_MISSING',
          `The ${label} caption sidecar is not on disk at ${source}. REQ-104 requires a caption file even for a burned-in master, so this is missing evidence rather than an optional extra.`,
        );
      }
    }
    copyFileSync(srtSource, join(staging, 'captions.srt'));
    copyFileSync(vttSource, join(staging, 'captions.vtt'));
    const cueCount = countSrtCues(readFileSync(srtSource, 'utf8'));

    // Cover + first frame (REQ-088, REQ-055). The cover's SOURCE is recorded so a
    // defaulted cover can never present as a chosen one.
    const stagedMaster = join(staging, 'master.mp4');
    await extractStillFrame(stagedMaster, 0, join(staging, 'first-frame.png'));
    const cover = resolveCoverInstant(edl);
    await extractStillFrame(stagedMaster, cover.atOutputMs, join(staging, 'cover.png'));

    copyFileSync(join(root, 'edl', `${render.edlId}.json`), join(staging, 'edl.json'));
    copyFileSync(join(root, ...renderRel.split('/'), 'qa-report.json'), join(staging, 'qa-report.json'));

    const contentPackage: ContentPackage = {
      contentPackageId,
      envelope: {
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        createdBy: { kind: 'skill', skill: SKILL, skillVersion: VERSION },
      },
      jobId: request.jobId,
      accountId: jobBrief.accountId,
      releaseState,
      sourceClassification,
      approval: {
        reviewDecisionId: approval.reviewDecisionId,
        decidedBy: approval.decidedBy,
        decidedAt: approval.decidedAt,
        subjectDraftRenderId: approval.subjectDraftRenderId,
        subjectRenderManifestId: approval.subjectRenderManifestId,
      },
      lineage: {
        briefId: jobBrief.briefId,
        creativeBriefId: storyPlan.creativeBriefId,
        storyPlanId: edl.storyPlanId,
        edlId: edl.edlId,
        finalRenderId: render.renderId,
        finalRenderManifestId: finalManifest.renderManifestId,
        approvedDraftManifestId,
        editorialPlanHash: finalManifest.editorialPlanHash,
        planHash: report.planHash,
      },
      master: {
        path: 'master.mp4',
        contentHash: render.contentHash,
        byteSize: masterInfo.size,
        container: finalManifest.output.container,
        durationMs: mediaTimeToMs(render.duration),
        dimensions: { width: render.dimensions.width, height: render.dimensions.height },
        burnedInCaptions: true,
      },
      captions: { srtPath: 'captions.srt', vttPath: 'captions.vtt', cueCount },
      cover: {
        coverImagePath: 'cover.png',
        firstFramePath: 'first-frame.png',
        coverSource: cover.source,
      },
      rightsManifest: {
        rightsManifestId: ulid(),
        assets: nonEmpty(rightsEntries, "The package's rights manifest"),
        // Always `cleared` — by refusal above, not by construction here.
        weakestState: 'cleared',
        allEvidenced,
      },
      disclosures: {
        paidPartnership: edl.disclosures.paidPartnership,
        aiGeneratedOrAltered: edl.disclosures.aiGeneratedOrAltered,
        ownedBusinessPromotion: edl.disclosures.ownedBusinessPromotion,
        // REQ-163 categories the JobBrief does not model at Phase 0. Written as
        // explicit `false`/`null` with `capturedAtIntake: false` beside them —
        // omitting them would read as "not applicable" when the truth is "never
        // asked", and those are different facts to a compliance reviewer.
        thirdPartyPromotion: false,
        affiliateRelationship: false,
        regulatedCategory: null,
      },
      aiAlterationRecord: buildAiAlterationRecord(edl, finalManifest),
      qa: {
        qaReportId: report.qaReportId,
        gateStatus: report.gateStatus,
        rulesetVersion: report.rulesetVersion,
        blockerCount: 0,
        warningCount: report.findings.filter((f) => f.severity === 'warning').length,
        waivers,
      },
      rangeValidation: {
        qaReportId: report.qaReportId,
        checkId: 'source_range_validity',
        status: 'ran',
        // One source range per clip — that is what `plan()` validated.
        rangeCount: edl.clips.length,
        violationCount: 0,
      },
      contractSet: nonEmpty(currentContractSet(), 'The contract set'),
      provenance: {
        renderer: { name: render.renderer.name, version: render.renderer.rendererVersion },
        ffmpegVersion: finalManifest.renderer.ffmpegVersion,
        determinismTier: 1,
        qaRulesetVersion: report.rulesetVersion,
        modelProvenance: edl.modelProvenance,
        styleProfile: { kind: 'none', reason: 'Phase 0 records no StyleProfile id on the render manifest; a profile applied to captions is not yet traceable from the delivered package.' },
        platformCapability: {
          platform: edl.platform,
          surface: 'organic-video',
          overlayVersion: finalManifest.platformOverlayVersion,
        },
        fonts: nonEmpty(
          finalManifest.fonts.map((font) => ({
            family: font.family,
            role: font.role,
            // `hash` on the manifest, `contentHash` in the package: the package's
            // field name matches every other content address in that object, and
            // renaming it here rather than in the manifest avoids a schema bump
            // for a naming preference.
            contentHash: font.hash,
            licenceNote: font.licenceNote,
          })),
          "The render manifest's font list",
        ),
      },
    };

    // Validated against the CONTRACT before the bundle is renamed into place. A
    // malformed package would be counted by `status --phase0` as a delivered
    // output, so this is the last thing that can stop it — and it runs while the
    // bundle is still in staging.
    const validate = ajv().getSchema(PACKAGE_SCHEMA_ID);
    if (validate === undefined) {
      throw fail('PACKAGE_SCHEMA_MISSING', `${PACKAGE_SCHEMA_ID} is not registered; the package cannot be validated.`);
    }
    if (!validate(contentPackage)) {
      throw fail(
        'PACKAGE_SCHEMA_INVALID',
        `The ContentPackage this skill built does not satisfy content-package-v1: ${formatAjvErrors(validate.errors)}. This is a defect in the skill, not in the request.`,
      );
    }
    writeJsonAtomic(join(staging, 'package.json'), contentPackage);

    // The atomic step. A directory rename is atomic on NTFS and POSIX alike, so
    // `packages/` transitions from "no package" to "a complete package" with no
    // observable state in between — which matters because a half-package would be
    // counted as a delivered output.
    if (existsSync(target)) {
      throw fail('PACKAGE_ALREADY_EXISTS', `${packageRel} already exists. Packages are immutable; a re-package mints a new id.`);
    }
    renameSync(staging, target);

    const files = readdirSync(target).sort();
    return {
      kind: 'packaged',
      jobId: request.jobId,
      contentPackageId,
      packagePath: packageRel,
      releaseState,
      sourceClassification,
      reviewDecisionId: approval.reviewDecisionId,
      finalRenderId: render.renderId,
      qaGateStatus: report.gateStatus,
      warningWaiverCount: waivers.length,
      rightsWeakestState: 'cleared',
      rightsAllEvidenced: allEvidenced,
      rangeCount: edl.clips.length,
      contractSetSize: contentPackage.contractSet.length,
      files,
    };
  } catch (error) {
    // Staging is removed on ANY failure, so a crash mid-assembly leaves only
    // removable staging data (the same rule ingest follows) and never a partial
    // bundle under `packages/`. Cleanup failure must not mask the real error.
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* the original error is the one that matters */
    }
    throw error;
  }
}

/**
 * Narrow a list the contract declares `minItems: 1` into the non-empty tuple type
 * the generator emits for it.
 *
 * The throw is unreachable in every call site below — each is guarded by an
 * earlier refusal — and it is here rather than a cast because a cast would make a
 * future refactor that removed the guard compile silently. `minItems: 1` is a
 * contract claim; this is where it is honoured in code.
 */
function nonEmpty<T>(items: readonly T[], what: string): [T, ...T[]] {
  const [first, ...rest] = items;
  if (first === undefined) {
    throw fail('EMPTY_REQUIRED_LIST', `${what} resolved empty, and the contract requires at least one entry.`);
  }
  return [first, ...rest];
}

/**
 * sha256 of a file, streamed.
 *
 * Matches `hashBytes` in `@cutdown/contracts` (same algorithm, same hex encoding) but
 * never holds the file in memory, because a final-tier master is exactly the kind of
 * file that exceeds Node's maximum buffer length.
 */
async function hashFileStreaming(path: string): Promise<{ algorithm: 'sha256'; value: string }> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return { algorithm: 'sha256', value: hash.digest('hex') };
}

/** Milliseconds from a rational MediaTime, exactly (never float seconds). */
function mediaTimeToMs(time: { ticks: number; timebase: { num: number; den: number } }): number {
  return Math.round((time.ticks * time.timebase.num * 1000) / time.timebase.den);
}

/**
 * Where the cover frame comes from, and whether that was a choice.
 *
 * REQ-055 is about a *validated, deliberate* first frame. A cover silently
 * defaulted to frame 0 looks identical on disk to a chosen one, so the difference
 * is recorded as a tagged union rather than inferred.
 *
 * The declared instant is a SOURCE tick, and mapping it onto the output timeline
 * needs the clip that contains it. Phase 0 does that mapping only for a cover
 * declared on the first clip; anything else defaults with the reason stated rather
 * than guessing an offset.
 */
function resolveCoverInstant(edl: PlatformEDL): {
  atOutputMs: number;
  source: ContentPackage['cover']['coverSource'];
} {
  const cover = edl.coverFrame;
  if (cover.kind !== 'moment_frame') {
    return {
      atOutputMs: 0,
      source: {
        kind: 'defaulted_to_first_frame',
        reason: 'The EDL declares no cover frame (coverFrame.kind is "none"), so the first frame is used and recorded as a default rather than a choice.',
      },
    };
  }
  const clips = edl.clips.slice().sort((a, b) => a.order - b.order);
  const first = clips[0];
  if (first === undefined || first.momentId !== cover.momentId) {
    return {
      atOutputMs: 0,
      source: {
        kind: 'defaulted_to_first_frame',
        reason: `The EDL declares a cover in Moment ${cover.momentId}, which is not the first clip. Mapping a mid-timeline source instant onto the output timeline is Phase 1 work, so the first frame is used and this is recorded as a default.`,
      },
    };
  }
  // The cover instant is inside the first clip: its output position is its offset
  // from the clip's source start, in the clip's own timebase.
  //
  // Bounded at BOTH ends. Bounding only below was a real defect: a tick past the
  // clip's `endTicks` yields a positive offset that lands in a LATER clip, and the
  // package would then record `coverSource: {kind:"declared", momentId: <the FIRST
  // clip's moment>}` — a fabricated provenance for the one field whose tagged union
  // exists so that a defaulted cover can never present as a chosen one.
  const clipLengthTicks = first.sourceRange.endTicks - first.sourceRange.startTicks;
  const offsetTicks = cover.atTick.ticks - first.sourceRange.startTicks;
  const sameTimebase =
    cover.atTick.timebase.den === first.sourceRange.timebase.den &&
    cover.atTick.timebase.num === first.sourceRange.timebase.num;
  if (!sameTimebase) {
    return {
      atOutputMs: 0,
      source: {
        kind: 'defaulted_to_first_frame',
        reason: `The declared cover instant is counted in ${String(cover.atTick.timebase.num)}/${String(cover.atTick.timebase.den)} but the first clip's range is in ${String(first.sourceRange.timebase.num)}/${String(first.sourceRange.timebase.den)}, so it cannot be placed on the output timeline without re-basing. Defaulted rather than approximated.`,
      },
    };
  }
  if (offsetTicks < 0 || offsetTicks >= clipLengthTicks) {
    return {
      atOutputMs: 0,
      source: {
        kind: 'defaulted_to_first_frame',
        reason: `The declared cover instant (tick ${String(cover.atTick.ticks)}) is outside the first clip's range [${String(first.sourceRange.startTicks)}, ${String(first.sourceRange.endTicks)}), so it does not identify a frame of Moment ${cover.momentId} in the delivered cut. Defaulted rather than attributed to the wrong moment.`,
      },
    };
  }
  const atOutputMs = Math.round((offsetTicks * cover.atTick.timebase.num * 1000) / cover.atTick.timebase.den);
  return { atOutputMs, source: { kind: 'declared', momentId: cover.momentId, atOutputMs } };
}

/**
 * REQ-164's record of what the pipeline did to the material.
 *
 * Computed from the manifest, not declared. REQ-164's own distinction is the point:
 * selection, reframing, captioning and colour correction are NOT realistic
 * synthetic alteration, and Phase 0 performs only that first kind — so
 * `materialAlteration` is derived from the operation list and cannot drift from
 * what actually happened.
 */
function buildAiAlterationRecord(
  edl: PlatformEDL,
  manifest: RenderManifest,
): ContentPackage['aiAlterationRecord'] {
  const operations: string[] = ['selection', 'captioning'];
  // The aspect treatment lives on the EDL, not the manifest — a letterbox adds
  // bars without altering the frame's content, so it is NOT reframing; the other
  // two Phase 0 treatments composite a background and are.
  if (edl.aspectTreatment.mode !== 'letterbox') operations.push('reframing');
  if (manifest.audioMix.normalize) operations.push('loudness_normalisation');

  const SYNTHETIC = ['synthetic_generation', 'voice_translation'] as const;
  return {
    operations: nonEmpty(operations, 'The alteration operation list') as ContentPackage['aiAlterationRecord']['operations'],
    materialAlteration: operations.some((op) => (SYNTHETIC as readonly string[]).includes(op)),
    // The REQ-163 disclosure categories the JobBrief has no field for were never
    // asked of the supplier. Saying so is the fact a compliance reviewer needs.
    capturedAtIntake: false,
  };
}

/** Cues in an SRT file: blocks separated by a blank line, each with a numeric index. */
function countSrtCues(srt: string): number {
  return srt
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && /^\d+\r?\n/.test(`${block}\n`)).length;
}

await runSkillMain<PackageRequest, PackageResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
