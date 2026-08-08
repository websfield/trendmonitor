import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { hashContent } from '@cutdown/contracts';
import type { RenderManifestV1 } from '@cutdown/contracts/generated';
import { ffmpegVersion, FfmpegError, EXIT_INPUT_VALIDATION } from './ffmpeg.js';

/**
 * The RenderManifest builder (Phase 4 task 1; PRD §10.6, tech-spec §11).
 *
 * A manifest is the *plan*, and it is built here — once, from the editorial
 * artefacts — rather than assembled incidentally inside the renderer. That split
 * is what lets the draft/final relationship be a checkable property instead of a
 * convention: both tiers are built from the same EDL, so both carry the same
 * `editorialPlanHash` by construction, and `assertFinalMatchesApprovedDraft()`
 * can then verify that the final changed nothing an approval was not given for.
 *
 * ## Fonts are resolved by hash, and a mismatch refuses
 *
 * `data/fonts/fonts.json` is the registry; the manifest records the sha256 of
 * each font file it will use. `resolveFonts()` hashes the file on disk and
 * compares. A mismatch is a refusal, never a substitution — a substituted font
 * changes the render's pixels (breaking the tier-1 determinism claim) and its
 * licence basis (breaking the rights record) at the same time, and does so
 * invisibly.
 */

export type RenderManifest = RenderManifestV1.RenderManifest;
export type FontReference = RenderManifestV1.FontReference;

const RENDERER_NAME = 'renderer-ffmpeg';

/** Bump on any change to how a manifest is built or how a render is composed. */
export const RENDERER_VERSION = '1.0.0';

/** tech-spec §12.1 defaults; the render targets these, QA measures against them. */
export const DEFAULT_TARGET_LOUDNESS_LUFS = -14;
export const DEFAULT_MAX_TRUE_PEAK_DBTP = -1;

/** Draft is cheaper on purpose; final is delivery quality. */
export const DRAFT_CRF = 26;
export const FINAL_CRF = 20;

export interface FontRegistryEntry {
  readonly family: string;
  readonly role: 'heading' | 'body' | 'caption';
  readonly file: string;
  readonly libassFamily?: string;
  readonly hash: { readonly algorithm: 'sha256'; readonly value: string };
  readonly licenceNote: string;
}

export interface FontRegistry {
  readonly registryVersion: string;
  /**
   * Subdirectory of `data/fonts` holding font FILES only, which is what libass
   * must be pointed at — it loads every entry in its `fontsdir` and errors on
   * anything that is not a font, so the registry JSON and the licence text sit
   * outside it.
   */
  readonly libassFontsDir?: string;
  readonly fonts: readonly FontRegistryEntry[];
}

/** The directory to hand libass as `fontsdir`. */
export function libassFontsDir(fontsDir: string, registry: FontRegistry): string {
  return registry.libassFontsDir === undefined ? fontsDir : join(fontsDir, registry.libassFontsDir);
}

const inputError = (code: string, message: string, details?: Record<string, unknown>): FfmpegError =>
  new FfmpegError(
    details === undefined
      ? { code, message, exitCode: EXIT_INPUT_VALIDATION }
      : { code, message, exitCode: EXIT_INPUT_VALIDATION, details },
  );

export async function loadFontRegistry(fontsDir: string): Promise<FontRegistry> {
  const raw = await readFile(join(fontsDir, 'fonts.json'), 'utf8');
  const parsed = JSON.parse(raw) as FontRegistry;
  if (!Array.isArray(parsed.fonts) || parsed.fonts.length === 0) {
    throw inputError('EMPTY_FONT_REGISTRY', `${fontsDir}/fonts.json declares no fonts.`);
  }
  return parsed;
}

const sha256File = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex');

export interface ResolvedFont {
  readonly reference: FontReference;
  /** Absolute path on disk, verified against `reference.hash`. */
  readonly path: string;
  /** The family name libass matches on, which is NOT always `family`. */
  readonly libassFamily: string;
}

/**
 * Verify each registry font against its recorded hash and return manifest
 * references for the roles requested.
 *
 * `libassFamily` exists because a static font's family name and its *human*
 * family name diverge: Inter-SemiBold.ttf declares family "Inter SemiBold" in
 * name ID 1, while Inter-Bold.ttf declares "Inter" with a Bold subfamily. An ASS
 * `Fontname: Inter` therefore resolves to Regular no matter which file is on the
 * font path — so the value libass needs is recorded per font rather than
 * reconstructed from the family and role at render time.
 */
export async function resolveFonts(
  fontsDir: string,
  registry: FontRegistry,
  roles: readonly ('heading' | 'body' | 'caption')[],
): Promise<readonly ResolvedFont[]> {
  const resolved: ResolvedFont[] = [];
  for (const role of roles) {
    const entry = registry.fonts.find((f) => f.role === role);
    if (entry === undefined) {
      throw inputError('FONT_ROLE_MISSING', `The font registry has no entry for role "${role}".`, {
        role,
        available: registry.fonts.map((f) => f.role),
      });
    }
    const path = join(fontsDir, entry.file);
    const actual = await sha256File(path);
    if (actual !== entry.hash.value) {
      throw inputError(
        'FONT_HASH_MISMATCH',
        `Font ${entry.file} hashes to ${actual} but the registry records ${entry.hash.value}. ` +
          `The render is refused rather than substituting a font: a different font changes both the rendered pixels and the licence basis, and neither would be visible in the output.`,
        { file: entry.file, expected: entry.hash.value, actual },
      );
    }
    resolved.push({
      reference: {
        family: entry.family,
        role: entry.role,
        hash: { algorithm: 'sha256', value: entry.hash.value },
        licenceNote: entry.licenceNote,
      },
      path,
      libassFamily: entry.libassFamily ?? entry.family,
    });
  }
  return resolved;
}

export interface BuildManifestInput {
  readonly jobId: string;
  readonly edl: {
    readonly edlId: string;
    readonly canvas: { readonly width: number; readonly height: number };
  };
  /** The whole EDL object, hashed to produce `editorialPlanHash`. */
  readonly edlObject: unknown;
  readonly tier: 'draft' | 'final';
  readonly frameRate: { readonly num: number; readonly den: number };
  readonly fonts: readonly ResolvedFont[];
  readonly hasAudio: boolean;
  /**
   * The media the render will actually read.
   *
   * Explicit because it is NOT always derivable from the tier: a draft with no proxy
   * renders from the source original, and the manifest must say so.
   */
  readonly mediaSource?: 'proxy' | 'source_original';
  readonly platformOverlayVersion: string;
  /** The caption files this manifest will produce, job-relative. */
  readonly captionPaths: { readonly assPath: string; readonly srtPath: string; readonly vttPath: string };
  readonly captionPlanHash: { readonly algorithm: 'sha256'; readonly value: string };
  /** Required for `final`, forbidden for `draft` (D-34). */
  readonly approvedDraftManifestId?: string | null;
  readonly parentManifestId?: string | null;
  readonly renderManifestId?: string;
  readonly createdAt?: string;
}

export function buildRenderManifest(input: BuildManifestInput): RenderManifest {
  const isFinal = input.tier === 'final';
  const approvedDraftManifestId = input.approvedDraftManifestId ?? null;

  // D-34's ordering rule, enforced where the manifest is born rather than where
  // it is executed: a `final` that names no approved draft is exactly the
  // "packaging before approval" path tech-spec §15 step 8 forbids, and catching
  // it here means it can never reach a renderer, a QA report, or a package.
  if (isFinal && approvedDraftManifestId === null) {
    throw inputError(
      'FINAL_WITHOUT_APPROVED_DRAFT',
      'A final-tier manifest must name the approved draft manifest that authorises it (D-34, REQ-152). Rendering final from an unapproved plan is the exact ordering violation the approval flow exists to prevent.',
      { jobId: input.jobId, edlId: input.edl.edlId },
    );
  }
  if (!isFinal && approvedDraftManifestId !== null) {
    throw inputError(
      'DRAFT_WITH_APPROVED_DRAFT_LINK',
      'A draft-tier manifest cannot link an approved draft; only a final render is authorised by an approval.',
      { jobId: input.jobId },
    );
  }

  // `fonts` is `minItems: 1` in the schema, so its generated type is a
  // non-empty tuple. Proving the emptiness check here — rather than casting —
  // is what keeps a fontless manifest from being constructed at all: a render
  // with no declared font has no recorded licence basis for the text it burns in.
  const [firstFont, ...restFonts] = input.fonts.map((f) => f.reference);
  if (firstFont === undefined) {
    throw inputError(
      'NO_FONTS_RESOLVED',
      'A RenderManifest must declare at least one font; captions cannot be burned in without a font whose licence and hash are recorded.',
      { jobId: input.jobId },
    );
  }

  const renderManifestId = input.renderManifestId ?? ulid();
  return {
    renderManifestId,
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: input.createdAt ?? new Date().toISOString(),
      createdBy: { kind: 'skill', skill: 'render', skillVersion: RENDERER_VERSION },
    },
    jobId: input.jobId,
    edlId: input.edl.edlId,
    parentManifestId: input.parentManifestId ?? null,
    tier: input.tier,
    editorialPlanHash: hashContent(input.edlObject),
    approvedDraftManifestId,
    // The renderer never sets `editorially_approved`; only the Phase 5 approval
    // flow does. A renderer able to mark its own output approved would make the
    // release state a description of what the renderer did rather than of what a
    // human decided.
    releaseState: 'draft',
    renderer: {
      name: RENDERER_NAME,
      rendererVersion: RENDERER_VERSION,
      // Filled by `withFfmpegVersion` — kept out of the pure builder so this
      // function stays synchronous and testable without FFmpeg installed.
      ffmpegVersion: 'unresolved',
    },
    // The media ACTUALLY used, not the media the tier implies. A draft falls back to
    // the source original when an asset has no proxy (the render skill warns on
    // stderr), and a manifest that recorded `proxy` regardless would be a false
    // provenance claim in the artefact — the stderr note is transient, the manifest is
    // the record. Defaults to the tier's normal media when the caller does not say,
    // so existing callers keep their behaviour.
    media: { source: input.mediaSource ?? (isFinal ? 'source_original' : 'proxy') },
    fonts: [firstFont, ...restFonts],
    output: {
      container: 'mp4',
      width: input.edl.canvas.width,
      height: input.edl.canvas.height,
      frameRate: input.frameRate,
    },
    encoderSettings: {
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      crf: isFinal ? FINAL_CRF : DRAFT_CRF,
      threads: 1,
      bitexact: true,
      stripCreationTime: true,
      audioCodec: 'aac',
      audioBitrateKbps: isFinal ? 192 : 128,
    },
    audioMix: {
      normalize: input.hasAudio,
      targetLoudnessLufs: DEFAULT_TARGET_LOUDNESS_LUFS,
      maxTruePeakDbtp: DEFAULT_MAX_TRUE_PEAK_DBTP,
      hasAudio: input.hasAudio,
    },
    captions: {
      assPath: input.captionPaths.assPath,
      srtPath: input.captionPaths.srtPath,
      vttPath: input.captionPaths.vttPath,
      captionPlanHash: input.captionPlanHash,
    },
    platformOverlayVersion: input.platformOverlayVersion,
  };
}

/** Stamp the live FFmpeg build string onto a manifest (tech-spec §12 tier 1). */
export async function withFfmpegVersion(manifest: RenderManifest): Promise<RenderManifest> {
  return {
    ...manifest,
    renderer: { ...manifest.renderer, ffmpegVersion: await ffmpegVersion() },
  };
}

/**
 * The fields a `final` manifest is permitted to differ from its approved draft
 * in (tech-spec §11: "may differ only in declared tier/media/encode fields").
 *
 * `captions` is here only because the three PATHS embed the manifest id and so
 * necessarily differ; `captions.captionPlanHash` is compared separately, since
 * the caption *content* is editorial and changing it after approval is precisely
 * what this function exists to catch.
 *
 * `renderer` is deliberately NOT here. A renderer or FFmpeg upgrade between the
 * approved draft and the final render changes the pixels a human signed off on,
 * so it is reported rather than absorbed. Note what the only caller actually
 * does with that report: the `render` skill hard-fails on ANY changed field,
 * including this one. That is fail-closed and correct, but it means an FFmpeg
 * patch bump between approval and delivery blocks the final render until the
 * draft is re-approved — which is the honest consequence, not an oversight.
 */
const TIER_VARIABLE_FIELDS = new Set([
  'renderManifestId',
  'envelope',
  'parentManifestId',
  'tier',
  'approvedDraftManifestId',
  'releaseState',
  'media',
  'encoderSettings',
  'captions',
]);

export interface ManifestComparison {
  readonly ok: boolean;
  readonly changedFields: readonly string[];
}

/**
 * Check that a final manifest realises the *approved* plan.
 *
 * The check that actually carries the guarantee is `editorialPlanHash`: it is
 * computed from the EDL, so any editorial change at all — a re-cut range, a
 * reworded caption, a different clip order — changes it. The field-level scan
 * below catches the second class of drift, where the EDL is untouched but the
 * output geometry, the fonts, or the overlay version moved between approval and
 * delivery. Both matter: the first is someone editing after sign-off, the
 * second is someone changing what sign-off meant.
 */
export function assertFinalMatchesApprovedDraft(
  draft: RenderManifest,
  final: RenderManifest,
): ManifestComparison {
  const changed: string[] = [];
  if (final.editorialPlanHash.value !== draft.editorialPlanHash.value) {
    changed.push('editorialPlanHash');
  }
  if (final.captions.captionPlanHash.value !== draft.captions.captionPlanHash.value) {
    changed.push('captions.captionPlanHash');
  }
  const draftRecord = draft as unknown as Record<string, unknown>;
  const finalRecord = final as unknown as Record<string, unknown>;
  // The UNION of both key sets, not the draft's alone.
  //
  // Iterating only `Object.keys(draftRecord)` made this check silently reducible to
  // nothing: a draft manifest carrying just `editorialPlanHash` and
  // `captions.captionPlanHash` skipped every remaining comparison and returned
  // `ok: true`, so `output` geometry, `fonts`, `platformOverlayVersion`, the renderer
  // and ffmpeg versions and `audioMix` went unchecked — exactly the fields the
  // docstring above promises this scan catches. A key PRESENT on one side and ABSENT
  // on the other is now itself a change, which is the only reading under which "the
  // delivered cut is the cut that was approved" is a fact rather than a hope.
  for (const key of new Set([...Object.keys(draftRecord), ...Object.keys(finalRecord)])) {
    if (TIER_VARIABLE_FIELDS.has(key) || key === 'editorialPlanHash') continue;
    if (JSON.stringify(draftRecord[key]) !== JSON.stringify(finalRecord[key])) {
      changed.push(key);
    }
  }
  return { ok: changed.length === 0, changedFields: changed };
}
