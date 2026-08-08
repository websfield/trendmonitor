/**
 * The revision engine (PRD REQ-039 / REQ-112 / REQ-113, tech-spec §4 stage 9).
 *
 * REQ-039's demand is precise and easy to get wrong: *free-form notes produce a
 * new brief, story plan, or EDL revision **while reusing unchanged source
 * indexes***. Two rules follow, and they are the whole module.
 *
 * ## 1. Narrowest object wins
 *
 * A note about a caption is a caption change. Regenerating a CreativeBrief for it
 * would discard the story plan, the EDL, the approved cut and every review
 * decision attached to them — and would do so invisibly, because the *output*
 * would still be a valid pipeline. So the target is CHOSEN, recorded, and
 * justified: `revisionTarget` says which object is being rewritten and why, and
 * the caller writes exactly that one.
 *
 * The model's role is bounded accordingly. It interprets prose into structured
 * constraints; it does **not** pick the target. Target selection is a deterministic
 * function of the constraint kinds (`selectTarget` below), because "which object do
 * we rewrite" decides how much work is thrown away, and that is not a judgement to
 * delegate to a sampler.
 *
 * ## 2. No re-index, ever
 *
 * Nothing here reads or writes `index/` or `moments/`. A revision reuses the
 * Moment Graph as it stands, and the proof is a cache assertion in the tests
 * rather than a comment here: the index artefacts' mtimes are unchanged across a
 * revision. Re-indexing would also be the expensive, slow, model-spending path,
 * so the incentive to skip the check is exactly backwards.
 *
 * ## Ambiguity is a refusal, not a guess
 *
 * REQ-112 says ambiguous notes resolve *conservatively* and the interpreted
 * constraints are shown. Where a note cannot be pinned to an object at all, this
 * module returns a `needs_confirmation` result naming what it could not resolve.
 * A revision that guessed would silently re-cut somebody's approved video.
 */

import type { PlatformEdlV1 } from '@cutdown/contracts/generated';

type PlatformEDL = PlatformEdlV1.PlatformEDL;

/**
 * The closed set of constraint kinds the interpreter may emit, ordered from the
 * narrowest object they touch to the widest. The ORDER is load-bearing:
 * `selectTarget` takes the widest kind present, so adding a kind in the wrong
 * place would silently widen every revision that mentions it.
 */
export const CONSTRAINT_KINDS = [
  // --- caption-level: the EDL's caption text only ---
  'caption_text',
  // --- EDL-level: which moments, in what order, how long, how framed ---
  'clip_trim',
  'clip_order',
  'clip_remove',
  'clip_replace',
  'aspect_treatment',
  'cover_frame',
  // --- story-plan-level: beat structure, pacing, narrative shape ---
  'beat_structure',
  'pacing',
  // --- brief-level: the angle itself ---
  'angle',
  'audience_promise',
  'cta',
] as const;

export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

/**
 * Cap on `instruction`.
 *
 * `caption_text` writes the instruction verbatim into the cut, so an unbounded
 * value is an unbounded caption in a delivered master. 200 characters is generous
 * against D-48's geometric wrap (18 characters per line on the Phase 0 canvas) and
 * still refuses a runaway generation.
 */
export const MAX_INSTRUCTION_LENGTH = 200;

export interface ReviseConstraint {
  readonly kind: ConstraintKind;
  /**
   * What the constraint applies to — a clipId, a momentId, or `output` for a
   * whole-cut constraint. Required: a constraint with no subject is a note, and
   * the point of interpretation is to stop being a note.
   */
  readonly subject: string;
  /** The instruction, as an imperative the applier can act on. */
  readonly instruction: string;
  /** The words in the reviewer's note this constraint came from (REQ-112: show the interpretation). */
  readonly sourceText: string;
}

export type RevisionTarget = 'platform-edl' | 'master-story-plan' | 'creative-brief';

/** Which object each constraint kind forces a rewrite of. */
const TARGET_BY_KIND: Record<ConstraintKind, RevisionTarget> = {
  caption_text: 'platform-edl',
  clip_trim: 'platform-edl',
  clip_order: 'platform-edl',
  clip_remove: 'platform-edl',
  clip_replace: 'platform-edl',
  aspect_treatment: 'platform-edl',
  cover_frame: 'platform-edl',
  beat_structure: 'master-story-plan',
  pacing: 'master-story-plan',
  angle: 'creative-brief',
  audience_promise: 'creative-brief',
  cta: 'creative-brief',
};

/** Narrowest first. `selectTarget` picks the widest target any constraint forces. */
const TARGET_WIDTH: Record<RevisionTarget, number> = {
  'platform-edl': 0,
  'master-story-plan': 1,
  'creative-brief': 2,
};

export interface TargetSelection {
  readonly target: RevisionTarget;
  /** Why this object and not a narrower one — recorded onto the revision. */
  readonly rationale: string;
  /** The constraint that forced the widest target, for the rationale to cite. */
  readonly decidedBy: ReviseConstraint;
}

/**
 * The narrowest object that can satisfy every constraint.
 *
 * Deterministic, and deliberately not the model's call. "Which object do we
 * rewrite" decides how much approved work is discarded; a sampler that answered it
 * would occasionally answer `creative-brief` for a typo fix, and the resulting
 * pipeline would still look valid.
 */
export function selectTarget(constraints: readonly ReviseConstraint[]): TargetSelection | null {
  let widest: { constraint: ReviseConstraint; target: RevisionTarget } | null = null;
  for (const constraint of constraints) {
    const target = TARGET_BY_KIND[constraint.kind];
    if (widest === null || TARGET_WIDTH[target] > TARGET_WIDTH[widest.target]) {
      widest = { constraint, target };
    }
  }
  if (widest === null) return null;

  const narrower = constraints
    .filter((c) => TARGET_BY_KIND[c.kind] !== widest.target)
    .map((c) => c.kind);

  return {
    target: widest.target,
    rationale:
      `The widest constraint is \`${widest.constraint.kind}\` on ${widest.constraint.subject}, which can only be satisfied by a new ${widest.target}.` +
      (narrower.length > 0
        ? ` The remaining constraint(s) (${[...new Set(narrower)].join(', ')}) are narrower and are carried into the same revision rather than spawning a second one.`
        : ' No wider object is regenerated: a revision rewrites exactly one object and links its parent (REQ-113).'),
    decidedBy: widest.constraint,
  };
}

// ---------------------------------------------------------------------------
// Interpretation (the model's half)
// ---------------------------------------------------------------------------

export interface RevisePromptInputs {
  readonly notes: string;
  readonly edl: PlatformEDL;
}

export interface RevisePrompt {
  readonly system: string;
  readonly content: { readonly type: 'text'; readonly text: string }[];
}

/**
 * Build the interpretation prompt.
 *
 * The system turn states the constraint vocabulary as a CLOSED list and says
 * plainly that anything outside it will be rejected — the model is told the rules
 * the deterministic validator enforces, which is the same discipline `propose`
 * uses. It is also told not to choose the target, because it does not.
 */
export function buildRevisePrompt(inputs: RevisePromptInputs): RevisePrompt {
  const system =
    'You interpret a reviewer\'s free-form note about a short video into STRUCTURED CONSTRAINTS. ' +
    'Return ONLY a JSON object {"constraints": [...], "unresolved": [...]}. ' +
    `Each constraint has exactly: kind (one of: ${CONSTRAINT_KINDS.join(', ')}), subject (a clipId from the EDL below, a momentId, or "output"), ` +
    'instruction (see below), and sourceText (the words from the note this came from). ' +
    'For kind "caption_text" the instruction MUST BE THE EXACT REPLACEMENT CAPTION TEXT and nothing else — it is written verbatim into the cut, ' +
    `so "shorten the opening" would be burned into the video as a caption. Keep it under ${String(MAX_INSTRUCTION_LENGTH)} characters. ` +
    'For every other kind the instruction is an imperative a deterministic applier can act on. ' +
    'Hard rules enforced deterministically after you answer (breaking them rejects your output): ' +
    'every `kind` is from that closed list; every `subject` that looks like a clip is a clipId present in the EDL below; ' +
    '`sourceText` is a VERBATIM substring of the note. ' +
    'Put anything you cannot pin to a specific object into `unresolved` with the note text — do NOT guess a subject. ' +
    'Do NOT decide which object gets regenerated: the system computes that from the constraint kinds, and choosing it here would let a caption fix discard an approved cut.';

  const payload = {
    note: inputs.notes,
    edl: {
      edlId: inputs.edl.edlId,
      aspectTreatment: inputs.edl.aspectTreatment.mode,
      clips: inputs.edl.clips
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((clip) => ({
          clipId: clip.clipId,
          order: clip.order,
          momentId: clip.momentId,
          narrativeFunction: clip.narrativeFunction,
          caption: clip.caption,
          sourceRange: { startTicks: clip.sourceRange.startTicks, endTicks: clip.sourceRange.endTicks },
        })),
    },
  };

  return {
    system,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

export interface InterpretedNote {
  readonly constraints: readonly ReviseConstraint[];
  /** Note fragments that could not be pinned to an object. */
  readonly unresolved: readonly string[];
}

export interface ConstraintViolation {
  readonly index: number;
  readonly problem: string;
}

export type InterpretationResult =
  | { readonly kind: 'interpreted'; readonly interpreted: InterpretedNote }
  | { readonly kind: 'invalid'; readonly violations: readonly ConstraintViolation[] };

/**
 * Validate a model interpretation deterministically.
 *
 * The `sourceText`-is-a-substring rule is the one worth explaining. It is what
 * makes REQ-112's "show the interpreted constraints" trustworthy: a reviewer
 * checking the interpretation is checking it against their own words, and a
 * paraphrased `sourceText` would let a constraint the reviewer never asked for
 * look like one they did. Substring, not similarity — an exact check has no
 * threshold to argue about.
 */
export function validateInterpretation(
  candidate: unknown,
  notes: string,
  edl: PlatformEDL,
): InterpretationResult {
  const violations: ConstraintViolation[] = [];
  const record = candidate as { constraints?: unknown; unresolved?: unknown } | null;
  if (record === null || typeof record !== 'object' || !Array.isArray(record.constraints)) {
    return { kind: 'invalid', violations: [{ index: -1, problem: 'the response carries no `constraints` array' }] };
  }
  const unresolvedRaw = Array.isArray(record.unresolved) ? record.unresolved : [];
  const clipIds = new Set(edl.clips.map((clip) => clip.clipId));
  const momentIds = new Set(edl.clips.map((clip) => clip.momentId));
  const kinds = new Set<string>(CONSTRAINT_KINDS);

  const constraints: ReviseConstraint[] = [];
  record.constraints.forEach((raw, index) => {
    const entry = raw as Partial<ReviseConstraint> | null;
    if (entry === null || typeof entry !== 'object') {
      violations.push({ index, problem: 'not an object' });
      return;
    }
    if (typeof entry.kind !== 'string' || !kinds.has(entry.kind)) {
      violations.push({ index, problem: `kind ${JSON.stringify(entry.kind)} is not in the closed constraint vocabulary` });
      return;
    }
    if (typeof entry.subject !== 'string' || entry.subject.length === 0) {
      violations.push({ index, problem: 'subject is missing' });
      return;
    }
    if (entry.subject !== 'output' && !clipIds.has(entry.subject) && !momentIds.has(entry.subject)) {
      violations.push({
        index,
        problem: `subject "${entry.subject}" is neither "output" nor a clipId/momentId present in EDL ${edl.edlId} — an invented subject would apply a constraint to nothing`,
      });
      return;
    }
    if (typeof entry.instruction !== 'string' || entry.instruction.trim().length === 0) {
      violations.push({ index, problem: 'instruction is missing' });
      return;
    }
    if (entry.instruction.length > MAX_INSTRUCTION_LENGTH) {
      violations.push({
        index,
        problem: `instruction is ${String(entry.instruction.length)} characters, over the ${String(MAX_INSTRUCTION_LENGTH)}-character cap — a \`caption_text\` instruction is written VERBATIM into the cut, so an unbounded one is an unbounded caption in a delivered master`,
      });
      return;
    }
    if (typeof entry.sourceText !== 'string' || entry.sourceText.length === 0) {
      violations.push({ index, problem: 'sourceText is missing' });
      return;
    }
    if (!notes.includes(entry.sourceText)) {
      violations.push({
        index,
        problem: `sourceText ${JSON.stringify(entry.sourceText)} is not a verbatim substring of the reviewer's note — an interpretation a reviewer cannot check against their own words is not an interpretation`,
      });
      return;
    }
    constraints.push({
      kind: entry.kind as ConstraintKind,
      subject: entry.subject,
      instruction: entry.instruction,
      sourceText: entry.sourceText,
    });
  });

  if (violations.length > 0) return { kind: 'invalid', violations };

  return {
    kind: 'interpreted',
    interpreted: {
      constraints,
      unresolved: unresolvedRaw.filter((value): value is string => typeof value === 'string' && value.length > 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Application (the deterministic half)
// ---------------------------------------------------------------------------

export interface RevisedEdl {
  readonly edl: PlatformEDL;
  /** What actually changed, so the revision record is auditable rather than a diff nobody reads. */
  readonly applied: readonly { readonly kind: ConstraintKind; readonly subject: string; readonly change: string }[];
  /** Constraints the applier could not perform, with the reason. Never silently dropped. */
  readonly unapplied: readonly { readonly kind: ConstraintKind; readonly subject: string; readonly reason: string }[];
}

/**
 * Apply EDL-level constraints deterministically.
 *
 * Only the kinds this function can actually perform at Phase 0 are performed; the
 * rest are returned as `unapplied` WITH a reason. That split is the honest shape:
 * a `pacing` constraint reaching here would mean `selectTarget` chose the wrong
 * object, and a `clip_replace` needs a replacement Moment that only retrieval can
 * choose — pretending either was applied would produce a revision that claims to
 * have acted on a note it ignored.
 *
 * The returned EDL is a NEW object with `parentEdlId` set and a fresh id supplied
 * by the caller (REQ-113: a revision is a new object linked to its parent, and the
 * previously approved version stays reproducible).
 */
export interface RevisionProvenance {
  /** A fresh envelope for the child — never the parent's (REQ-113, PRD §10.6). */
  readonly envelope: PlatformEDL['envelope'];
  /** The model call that produced THIS revision, not the one that produced the parent. */
  readonly modelProvenance: PlatformEDL['modelProvenance'];
}

export function applyEdlConstraints(
  edl: PlatformEDL,
  constraints: readonly ReviseConstraint[],
  newEdlId: string,
  provenance: RevisionProvenance,
): RevisedEdl {
  const applied: { kind: ConstraintKind; subject: string; change: string }[] = [];
  const unapplied: { kind: ConstraintKind; subject: string; reason: string }[] = [];

  let clips = edl.clips.map((clip) => ({ ...clip }));
  let aspectTreatment = edl.aspectTreatment;

  for (const constraint of constraints) {
    switch (constraint.kind) {
      case 'caption_text': {
        const clip = clips.find((c) => c.clipId === constraint.subject || c.momentId === constraint.subject);
        if (clip === undefined) {
          unapplied.push({ kind: constraint.kind, subject: constraint.subject, reason: 'no clip in this EDL matches the subject' });
          break;
        }
        if (clip.caption.kind !== 'text') {
          // The two non-text kinds are refused for DIFFERENT reasons, and saying
          // so matters: the single message this replaced ("carries no display
          // text to rewrite") is true of `none` and false of `quote` — a quote
          // caption carries `displayText` like any other. An operator told their
          // quote caption has no text to rewrite would go looking for a missing
          // field instead of understanding that the text is bound to the source.
          unapplied.push({
            kind: constraint.kind,
            subject: constraint.subject,
            reason:
              clip.caption.kind === 'quote'
                ? `clip ${clip.clipId} carries a QUOTE caption, whose displayText is bound to \`verbatimSourceText\` by the D-37 quote-fidelity gate — the caption must stay an order-preserving subsequence of what the speaker actually said. Rewriting it here would either be refused by \`cutdown validate\` or change what someone is shown saying. To change the words, re-plan this clip against a different Moment (\`cutdown plan\`) — \`plan\` SELECTS which moment is quoted, it does not edit what the speaker said; to drop them, remove the clip.`
                : `clip ${clip.clipId} carries no caption (kind "none"), so there is no display text to rewrite — adding one is a planning decision, made through \`cutdown plan\``,
          });
          break;
        }
        const before = clip.caption.displayText;
        clip.caption = { ...clip.caption, displayText: constraint.instruction };
        applied.push({
          kind: constraint.kind,
          subject: clip.clipId,
          change: `caption displayText: ${JSON.stringify(before)} → ${JSON.stringify(constraint.instruction)}`,
        });
        break;
      }
      case 'clip_remove': {
        const before = clips.length;
        clips = clips.filter((c) => c.clipId !== constraint.subject && c.momentId !== constraint.subject);
        if (clips.length === before) {
          unapplied.push({ kind: constraint.kind, subject: constraint.subject, reason: 'no clip in this EDL matches the subject' });
          break;
        }
        if (clips.length === 0) {
          // Refusing rather than emitting an empty timeline: an EDL with no clips
          // is not a narrower revision, it is a deleted video.
          unapplied.push({
            kind: constraint.kind,
            subject: constraint.subject,
            reason: 'removing this clip would leave the timeline empty; a cut with no clips is not a revision',
          });
          clips = edl.clips.map((clip) => ({ ...clip }));
          break;
        }
        // Orders are re-sequenced so the EDL stays contiguous from 0.
        clips = clips
          .sort((a, b) => a.order - b.order)
          .map((clip, index) => ({ ...clip, order: index }));
        applied.push({ kind: constraint.kind, subject: constraint.subject, change: `removed the clip and re-sequenced ${String(clips.length)} remaining clip(s)` });
        break;
      }
      case 'aspect_treatment': {
        applied.push({
          kind: constraint.kind,
          subject: 'output',
          change: `aspectTreatment rationale recorded: ${constraint.instruction}`,
        });
        aspectTreatment = { ...aspectTreatment, rationale: constraint.instruction };
        break;
      }
      default:
        // Everything else — trims, reordering, replacement, cover frames, and the
        // story-plan/brief kinds — needs an input this function does not have (a
        // validated tick range, a replacement Moment from retrieval, a re-planned
        // beat structure). Reported, never faked.
        unapplied.push({
          kind: constraint.kind,
          subject: constraint.subject,
          reason: `Phase 0's deterministic applier does not perform \`${constraint.kind}\`; it needs an input this stage does not have (a validated range, a retrieval result, or a re-plan). Recorded rather than silently skipped.`,
        });
    }
  }

  return {
    edl: {
      ...edl,
      edlId: newEdlId,
      parentEdlId: edl.edlId,
      clips: clips as PlatformEDL['clips'],
      aspectTreatment,
      // A fresh envelope and the REVISE call's provenance. Spreading the parent's
      // would have the child claim it was created by `plan` at the parent's
      // timestamp, and the interpretation model call that actually produced it
      // would appear nowhere — while `package` copies `modelProvenance` straight
      // into the delivered package (PRD §10.6 wants model ids per artefact).
      envelope: provenance.envelope,
      modelProvenance: provenance.modelProvenance,
    },
    applied,
    unapplied,
  };
}
