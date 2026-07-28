/**
 * Deterministic editorial QA checks (Cutdown Phase 3, Task 7; decisions.md D-35/D-37).
 *
 * Each function here is a PURE deterministic check over a PlatformEDL, the Moments
 * it references, the JobBrief, and (optionally) a StyleProfile / CreativeBrief.
 * These own EVERY blocking decision — the LLM critic in the `validate` skill is
 * advisory evidence only and can NEVER produce a finding this module emits (D-37).
 * Blockers are NON-WAIVABLE (D-35).
 *
 * A finding is `block` or `advisory`:
 *  - `block`    — a non-waivable deterministic blocker; any one fails the gate.
 *  - `advisory` — a deterministic observation that never changes gate status
 *    (e.g. an unverified/uncorrected speaker identity per moment-v1). This is a
 *    DETERMINISTIC advisory, distinct from the LLM critic's advisories, and is
 *    tagged `source: 'deterministic'` so the two can never be confused.
 *
 * Every finding cites the offending object (clip id, field path, moment id) and,
 * where relevant, the matched string, so a reviewer sees exactly what tripped it.
 */

import { checkCapability, resolveEdl } from '@cutdown/editorial';
import type { PlatformCapability, CapabilityViolation, EdlViolation } from '@cutdown/editorial';
import type { AssetBounds } from '@cutdown/contracts';
import type {
  PlatformEdlV1,
  MomentV1,
  JobBriefV1,
  StyleProfileV1,
  CreativeBriefV1,
} from '@cutdown/contracts/generated';

type PlatformEDL = PlatformEdlV1.PlatformEDL;
type EdlClip = PlatformEdlV1.EdlClip;
type Moment = MomentV1.Moment;
type JobBrief = JobBriefV1.JobBrief;
type StyleProfile = StyleProfileV1.StyleProfile;
type CreativeBrief = CreativeBriefV1.CreativeBrief;

/** Stable rule ids — one per deterministic gate, cited in every finding. */
export type EditorialRuleId =
  | 'edl-resolution'
  | 'capability'
  | 'quote-fidelity'
  | 'prohibited-claims'
  | 'required-evidence'
  | 'context-dependency'
  | 'rights'
  | 'audio-rights'
  | 'disclosures';

export type FindingSeverity = 'block' | 'advisory';

/** Where a finding is cited — only the applicable keys are populated. */
export interface FindingCitation {
  clipId?: string;
  field?: string;
  momentId?: string;
  matched?: string;
}

/**
 * A deterministic editorial finding. `source` is always `'deterministic'` here —
 * the LLM critic's advisories carry `'critic'` and are assembled separately in
 * `editorial-gates.ts`, so a caller can never reclassify one as the other (D-37).
 */
export interface EditorialFinding {
  rule: EditorialRuleId;
  severity: FindingSeverity;
  source: 'deterministic';
  code: string;
  message: string;
  cite: FindingCitation;
}

function block(rule: EditorialRuleId, code: string, message: string, cite: FindingCitation = {}): EditorialFinding {
  return { rule, severity: 'block', source: 'deterministic', code, message, cite };
}

function advisory(rule: EditorialRuleId, code: string, message: string, cite: FindingCitation = {}): EditorialFinding {
  return { rule, severity: 'advisory', source: 'deterministic', code, message, cite };
}

// --- tokeniser --------------------------------------------------------------

/**
 * The quote/claim tokeniser (documented, single implementation).
 *
 * Lowercase, then take maximal runs of ASCII letters/digits — every other
 * character (whitespace, punctuation, apostrophes) is a separator. So
 * `"We've cut the price — in HALF!"` → `["we","ve","cut","the","price","in","half"]`.
 * Dropping punctuation on BOTH sides of a comparison keeps it stable; the
 * subsequence check that follows cares only about token order, not punctuation.
 */
export function tokenise(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  return matches ?? [];
}

/**
 * Is `needle` an in-order subsequence of `haystack`? A greedy two-pointer walk:
 * every needle token must be found later in the haystack than the previous one.
 * A shortening that preserves order passes; a reorder or an interpolated token
 * that is not in the haystack fails.
 */
export function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let i = 0;
  for (const token of haystack) {
    if (i >= needle.length) break;
    if (token === needle[i]) i += 1;
  }
  return i === needle.length;
}

/** Normalised, case-insensitive substring test for the Phase-0 prohibited-claim matcher. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// --- quote fidelity (REQ-037, D-37) -----------------------------------------

/**
 * Quote-fidelity check over every `caption.kind === "quote"` clip (REQ-037).
 *
 * For each quoted caption:
 *  (a) `displayText` tokens must be an in-order SUBSEQUENCE of `verbatimSourceText`
 *      tokens — a shortening that preserves order is allowed; a reorder or an
 *      interpolated word is a BLOCK (a shortened caption cannot launder a misquote).
 *  (b) `verbatimSourceText` tokens must be a subsequence of the referenced Moment's
 *      `transcript.verbatimText` — the caption cannot quote words the Moment never
 *      contained (BLOCK).
 *  (c) `speakerLabel` must equal one of the Moment's `speakers[].label`; a label
 *      naming no speaker of that Moment is misattribution (BLOCK). A matched
 *      speaker whose `isCorrected === false` is an ADVISORY (unverified identity).
 *
 * A quoted caption whose Moment is absent from the provided set fails closed (BLOCK):
 * a quote that cannot be verified against its source is not a passing quote.
 */
export function checkQuoteFidelity(edl: PlatformEDL, momentById: ReadonlyMap<string, Moment>): EditorialFinding[] {
  const findings: EditorialFinding[] = [];

  for (const clip of edl.clips) {
    const caption = clip.caption;
    if (caption.kind !== 'quote') continue;

    const moment = momentById.get(clip.momentId);
    if (moment === undefined) {
      findings.push(
        block(
          'quote-fidelity',
          'QUOTE_MOMENT_UNKNOWN',
          `Clip ${clip.clipId} carries a quote caption but its Moment ${clip.momentId} is not in the provided Moment set; the quote cannot be verified against its source. Failing closed (D-37).`,
          { clipId: clip.clipId, momentId: clip.momentId },
        ),
      );
      continue;
    }

    const displayTokens = tokenise(caption.displayText);
    const verbatimTokens = tokenise(caption.verbatimSourceText);
    const momentTokens = tokenise(moment.transcript.verbatimText);

    // (b) verbatimSourceText must actually be in the Moment transcript.
    if (!isSubsequence(verbatimTokens, momentTokens)) {
      findings.push(
        block(
          'quote-fidelity',
          'QUOTE_VERBATIM_NOT_IN_MOMENT',
          `Clip ${clip.clipId}'s quoted verbatimSourceText is not an in-order subsequence of Moment ${clip.momentId}'s transcript; the caption quotes words the Moment never contained (REQ-037).`,
          { clipId: clip.clipId, momentId: clip.momentId, field: 'caption.verbatimSourceText' },
        ),
      );
    }

    // (a) displayText must be an in-order subsequence of verbatimSourceText.
    if (!isSubsequence(displayTokens, verbatimTokens)) {
      findings.push(
        block(
          'quote-fidelity',
          'QUOTE_NOT_SUBSEQUENCE_OF_VERBATIM',
          `Clip ${clip.clipId}'s caption displayText is not an in-order subsequence of its verbatimSourceText; a shortened quote must preserve word order and add nothing (REQ-037).`,
          { clipId: clip.clipId, field: 'caption.displayText' },
        ),
      );
    }

    // (c) speakerLabel must name a real speaker of the Moment.
    const speaker = moment.speakers.find((s) => s.label === caption.speakerLabel);
    if (speaker === undefined) {
      findings.push(
        block(
          'quote-fidelity',
          'QUOTE_SPEAKER_MISATTRIBUTED',
          `Clip ${clip.clipId} attributes the quote to speaker ${JSON.stringify(caption.speakerLabel)}, who is not a speaker of Moment ${clip.momentId} [${moment.speakers.map((s) => s.label).join(', ')}] — misattribution (REQ-037).`,
          { clipId: clip.clipId, momentId: clip.momentId, field: 'caption.speakerLabel', matched: caption.speakerLabel },
        ),
      );
    } else if (!speaker.isCorrected) {
      findings.push(
        advisory(
          'quote-fidelity',
          'QUOTE_SPEAKER_UNVERIFIED',
          `Clip ${clip.clipId} quotes speaker ${JSON.stringify(caption.speakerLabel)} whose identity is uncorrected (isCorrected=false) on Moment ${clip.momentId}; an unverified identity per moment-v1 — surfaced, never blocking.`,
          { clipId: clip.clipId, momentId: clip.momentId, field: 'caption.speakerLabel', matched: caption.speakerLabel },
        ),
      );
    }
  }

  return findings;
}

// --- prohibited claims (D-35/D-37, NON-WAIVABLE) ----------------------------

/** A viewer-visible text field of the EDL, with its citation path. */
function viewerVisibleTexts(edl: PlatformEDL): Array<{ text: string; cite: FindingCitation }> {
  const texts: Array<{ text: string; cite: FindingCitation }> = [];
  for (const clip of edl.clips) {
    const caption = clip.caption;
    if (caption.kind === 'text' || caption.kind === 'quote') {
      texts.push({ text: caption.displayText, cite: { clipId: clip.clipId, field: 'caption.displayText' } });
    }
  }
  texts.push({ text: edl.metadata.title, cite: { field: 'metadata.title' } });
  if (edl.metadata.description !== null) {
    texts.push({ text: edl.metadata.description, cite: { field: 'metadata.description' } });
  }
  return texts;
}

/**
 * Prohibited-claim check (D-35/D-37, NON-WAIVABLE).
 *
 * Every text field an EDL shows a viewer (`caption.displayText` for text+quote
 * captions, `metadata.title`, `metadata.description`) is checked against the UNION
 * of `JobBrief.prohibitedClaims` and (when supplied) `StyleProfile.prohibitedClaims`.
 *
 * Phase-0 rule: a case-insensitive, whitespace-normalised SUBSTRING match is a
 * BLOCK, citing the field and the matched claim. This is deliberately blunt —
 * a smarter matcher (paraphrase, negation-aware) is a later promotion per D-37,
 * expressible only once it has a measured false-positive rate.
 */
export function checkProhibitedClaims(
  edl: PlatformEDL,
  jobBrief: JobBrief,
  styleProfile?: StyleProfile,
): EditorialFinding[] {
  const claims = [...(jobBrief.prohibitedClaims ?? []), ...(styleProfile?.prohibitedClaims ?? [])];
  if (claims.length === 0) return [];

  const findings: EditorialFinding[] = [];
  for (const { text, cite } of viewerVisibleTexts(edl)) {
    const haystack = normalise(text);
    for (const claim of claims) {
      const needle = normalise(claim);
      if (needle.length > 0 && haystack.includes(needle)) {
        findings.push(
          block(
            'prohibited-claims',
            'PROHIBITED_CLAIM_PRESENT',
            `Prohibited claim ${JSON.stringify(claim)} appears in ${cite.field ?? 'a viewer-visible field'}${cite.clipId ? ` of clip ${cite.clipId}` : ''}. A prohibited claim in an EDL is a NON-WAIVABLE block (D-35/D-37).`,
            { ...cite, matched: claim },
          ),
        );
      }
    }
  }
  return findings;
}

// --- required evidence / context (REQ-034, D-37) ----------------------------

/**
 * Required-evidence and context-loss checks (REQ-034, D-37).
 *
 * Proof requirements (`JobBrief.proofRequirements`): the Phase-0 linkage is that a
 * requirement is evidenced when the EDL carries at least one clip. When the
 * CreativeBrief is supplied, the stronger teeth apply: every `proofPoint`'s
 * `evidenceMomentIds` must resolve to a clip actually in the EDL — a claimed piece
 * of evidence that did not make the cut is a BLOCK.
 *
 * Context loss (`Moment.sourceDependencies`): a clip whose Moment has a
 * `requires_setup` dependency on a Moment NOT present in the EDL is a BLOCK — a
 * payoff cut loose from the setup that makes it true.
 */
export function checkRequiredEvidence(
  edl: PlatformEDL,
  jobBrief: JobBrief,
  momentById: ReadonlyMap<string, Moment>,
  creativeBrief?: CreativeBrief,
): EditorialFinding[] {
  const findings: EditorialFinding[] = [];
  const edlMomentIds = new Set(edl.clips.map((c) => c.momentId));

  const proofRequirements = jobBrief.proofRequirements ?? [];
  if (proofRequirements.length > 0 && edl.clips.length === 0) {
    for (const req of proofRequirements) {
      findings.push(
        block(
          'required-evidence',
          'PROOF_REQUIREMENT_UNMET',
          `Proof requirement ${JSON.stringify(req)} has no supporting clip; the EDL evidences nothing (REQ-034).`,
          { matched: req },
        ),
      );
    }
  }

  if (creativeBrief !== undefined) {
    creativeBrief.proofPoints.forEach((pp, index) => {
      for (const evidenceId of pp.evidenceMomentIds) {
        if (!edlMomentIds.has(evidenceId)) {
          findings.push(
            block(
              'required-evidence',
              'PROOF_EVIDENCE_NOT_IN_EDL',
              `CreativeBrief proofPoint[${index}] (${JSON.stringify(pp.claim)}) cites evidence Moment ${evidenceId}, which no clip in the EDL realises; the claim's evidence did not make the cut (REQ-034).`,
              { momentId: evidenceId, field: `proofPoints[${index}]`, matched: pp.claim },
            ),
          );
        }
      }
    });
  }

  // Context loss: a requires_setup dependency on a Moment absent from the EDL.
  for (const clip of edl.clips) {
    const moment = momentById.get(clip.momentId);
    if (moment === undefined) continue; // MOMENT_UNKNOWN is reported by edl-resolution.
    for (const dep of moment.sourceDependencies) {
      if (dep.relation === 'requires_setup' && !edlMomentIds.has(dep.momentId)) {
        findings.push(
          block(
            'context-dependency',
            'CONTEXT_DEPENDENCY_MISSING',
            `Clip ${clip.clipId}'s Moment ${clip.momentId} requires_setup from Moment ${dep.momentId}, which no clip in the EDL includes; the payoff is cut loose from its setup (REQ-034/D-37).`,
            { clipId: clip.clipId, momentId: dep.momentId },
          ),
        );
      }
    }
  }

  return findings;
}

// --- rights (REQ-003/056) ---------------------------------------------------

export interface RightsCheckOptions {
  /**
   * Phase-0: a PlatformEDL carries no per-track audio-rights evidence field, so a
   * `cross_platform_cleared`/`byo_licensed` mode cannot yet prove its rights and
   * fails closed. A caller with recorded evidence sets this true to admit it.
   */
  audioRightsEvidencePresent?: boolean;
}

/**
 * Rights check (REQ-003/056).
 *
 * Video rights: any clip whose Moment `rights.state` is not `cleared` — i.e.
 * `unknown`, `restricted`, or `expired` (all non-waivable per rights-state-v1 /
 * D-35), or a Moment absent from the set — is a BLOCK. REQ-003: unknown material
 * is flagged, never assumed cleared.
 *
 * Audio rights: an `audioMode` of `cross_platform_cleared`/`byo_licensed` with no
 * recorded evidence is a BLOCK (Phase-0: no evidence field exists, so it blocks
 * unless the caller asserts evidence). `native_audio_plan` needs no track evidence.
 */
export function checkRights(
  edl: PlatformEDL,
  momentById: ReadonlyMap<string, Moment>,
  opts: RightsCheckOptions = {},
): EditorialFinding[] {
  const findings: EditorialFinding[] = [];

  for (const clip of edl.clips) {
    const moment = momentById.get(clip.momentId);
    if (moment === undefined) {
      findings.push(
        block(
          'rights',
          'RIGHTS_MOMENT_UNKNOWN',
          `Clip ${clip.clipId} references Moment ${clip.momentId}, which is not in the provided Moment set; rights cannot be proven. Failing closed (REQ-003).`,
          { clipId: clip.clipId, momentId: clip.momentId },
        ),
      );
      continue;
    }
    if (moment.rights.state !== 'cleared') {
      findings.push(
        block(
          'rights',
          'RIGHTS_STATE_NOT_CLEARED',
          `Clip ${clip.clipId}'s Moment ${clip.momentId} has rights.state ${JSON.stringify(moment.rights.state)}; only 'cleared' may ship — unknown/restricted/expired are non-waivable blocks (REQ-003/D-35).`,
          { clipId: clip.clipId, momentId: clip.momentId, matched: moment.rights.state },
        ),
      );
    }
  }

  if (edl.audioMode !== 'native_audio_plan' && opts.audioRightsEvidencePresent !== true) {
    findings.push(
      block(
        'audio-rights',
        'AUDIO_RIGHTS_EVIDENCE_MISSING',
        `audioMode ${JSON.stringify(edl.audioMode)} requires recorded rights evidence, and none is present; at Phase 0 the EDL carries no audio-evidence field, so a cleared/BYO track fails closed (REQ-056). native_audio_plan needs no evidence.`,
        { field: 'audioMode', matched: edl.audioMode },
      ),
    );
  }

  return findings;
}

// --- disclosures (REQ-058, D-35) --------------------------------------------

export interface DisclosureCheckOptions {
  /**
   * Whether the pipeline marked this output as materially altered media. Phase-0
   * default false: with no alteration signal, the AI-media disclosure is advisory,
   * never a block (kept simple and documented per the task).
   */
  materialAlteration?: boolean;
}

/**
 * Disclosure check (REQ-058, D-35).
 *
 * `distributionMode === "paid"` requires `disclosures.paidPartnership === true`
 * (BLOCK if false) — a missing required disclosure is non-waivable (D-35).
 *
 * AI-media rule (Phase-0, documented): a missing `aiGeneratedOrAltered` disclosure
 * is a BLOCK only when the pipeline marks material alteration; otherwise it is at
 * most an ADVISORY, because Phase-3 has no deterministic alteration signal.
 */
export function checkDisclosures(edl: PlatformEDL, opts: DisclosureCheckOptions = {}): EditorialFinding[] {
  const findings: EditorialFinding[] = [];

  if (edl.distributionMode === 'paid' && edl.disclosures.paidPartnership !== true) {
    findings.push(
      block(
        'disclosures',
        'PAID_PARTNERSHIP_DISCLOSURE_MISSING',
        `distributionMode is 'paid' but disclosures.paidPartnership is false; a paid-partnership disclosure is required and non-waivable (REQ-058/D-35).`,
        { field: 'disclosures.paidPartnership' },
      ),
    );
  }

  if (opts.materialAlteration === true && edl.disclosures.aiGeneratedOrAltered !== true) {
    findings.push(
      block(
        'disclosures',
        'AI_MEDIA_DISCLOSURE_MISSING',
        `The pipeline marked this output as materially altered media, but disclosures.aiGeneratedOrAltered is false; the AI-media disclosure is required (REQ-058).`,
        { field: 'disclosures.aiGeneratedOrAltered' },
      ),
    );
  } else if (edl.disclosures.aiGeneratedOrAltered !== true) {
    findings.push(
      advisory(
        'disclosures',
        'AI_MEDIA_DISCLOSURE_UNASSERTED',
        `disclosures.aiGeneratedOrAltered is false and no material-alteration signal is available; at Phase 0 this is advisory only, surfaced for human review, never a block.`,
        { field: 'disclosures.aiGeneratedOrAltered' },
      ),
    );
  }

  return findings;
}

// --- capability & range (delegate to @cutdown/editorial) --------------------

/** Map an editorial `CapabilityViolation` to a blocking finding. */
function fromCapabilityViolation(v: CapabilityViolation): EditorialFinding {
  return block('capability', v.code, v.message, { field: 'capability' });
}

/** Map an editorial `EdlViolation` (range/order/asset) to a blocking finding. */
function fromEdlViolation(v: EdlViolation): EditorialFinding {
  const cite: FindingCitation = {};
  if (v.clipId !== undefined) cite.clipId = v.clipId;
  return block('edl-resolution', v.code, v.message, cite);
}

/**
 * Capability + range/order/asset checks, composed from `@cutdown/editorial`
 * (`checkCapability`, `resolveEdl`) rather than reimplemented — one bounds
 * validator, not two. Every violation they report is a BLOCK.
 *
 * Returns `{ schemaBlocked, findings }`: when the EDL is schema-invalid,
 * `resolveEdl` reports schema errors and skips the structural pass, so we surface
 * those as blocks and signal the caller to skip the content checks (which assume a
 * well-formed EDL) — failing closed rather than throwing on malformed data.
 */
export function checkCapabilityAndRanges(
  edl: PlatformEDL,
  capability: PlatformCapability,
  boundsByAsset: ReadonlyMap<string, AssetBounds>,
  momentAssetById: ReadonlyMap<string, string>,
): { schemaBlocked: boolean; findings: EditorialFinding[] } {
  const findings: EditorialFinding[] = [];

  const resolution = resolveEdl(edl, boundsByAsset, { momentAssetById });
  if (resolution.schemaErrors.length > 0) {
    for (const err of resolution.schemaErrors) {
      findings.push(block('edl-resolution', 'EDL_SCHEMA_INVALID', `PlatformEDL failed schema validation: ${err}`, {}));
    }
    return { schemaBlocked: true, findings };
  }
  for (const v of resolution.violations) findings.push(fromEdlViolation(v));

  const capabilityViolations = checkCapability(
    {
      platform: edl.platform,
      targetDurationRange: edl.targetDurationRange,
      canvas: { aspectRatio: edl.canvas.aspectRatio },
      aspectTreatment: { mode: edl.aspectTreatment.mode },
    },
    capability,
  );
  for (const v of capabilityViolations) findings.push(fromCapabilityViolation(v));

  return { schemaBlocked: false, findings };
}

export type { EdlClip };
