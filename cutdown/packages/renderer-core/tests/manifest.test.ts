import { ok, strictEqual, throws } from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { FfmpegError } from '../src/ffmpeg.js';
import {
  assertFinalMatchesApprovedDraft,
  buildRenderManifest,
  libassFontsDir,
  loadFontRegistry,
  resolveFonts,
  type BuildManifestInput,
  type ResolvedFont,
} from '../src/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const CUTDOWN_ROOT = join(here, '..', '..', '..', '..');
const FONTS_DIR = join(CUTDOWN_ROOT, 'data', 'fonts');

const FONT: ResolvedFont = {
  reference: {
    family: 'Inter',
    role: 'caption',
    hash: { algorithm: 'sha256', value: '78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3' },
    licenceNote: 'OFL 1.1 (Inter v4.1)',
  },
  path: join(FONTS_DIR, 'ttf', 'Inter-SemiBold.ttf'),
  libassFamily: 'Inter SemiBold',
};

const EDL_OBJECT = { edlId: '01J9ED2B3C4D5E6F7G8H9K0M6T', clips: [{ clipId: 'clip-1' }] };

function input(overrides: Partial<BuildManifestInput> = {}): BuildManifestInput {
  return {
    jobId: 'job-1',
    edl: { edlId: '01J9ED2B3C4D5E6F7G8H9K0M6T', canvas: { width: 720, height: 1280 } },
    edlObject: EDL_OBJECT,
    tier: 'draft',
    frameRate: { num: 1, den: 30 },
    fonts: [FONT],
    hasAudio: true,
    platformOverlayVersion: '2026-07',
    captionPaths: { assPath: 'renders/draft/x/captions.ass', srtPath: 'renders/draft/x/captions.srt', vttPath: 'renders/draft/x/captions.vtt' },
    captionPlanHash: { algorithm: 'sha256', value: 'a'.repeat(64) },
    createdAt: '2026-07-29T00:00:00Z',
    ...overrides,
  };
}

describe('the font registry refuses, never substitutes', () => {
  it('resolves the vendored caption font against its recorded hash', async () => {
    const registry = await loadFontRegistry(FONTS_DIR);
    const [font] = await resolveFonts(FONTS_DIR, registry, ['caption']);
    ok(font !== undefined);
    strictEqual(font.reference.family, 'Inter');
    strictEqual(font.reference.licenceNote, 'OFL 1.1 (Inter v4.1)');
    strictEqual(
      font.libassFamily,
      'Inter SemiBold',
      "the SemiBold file declares its OWN family name; 'Inter' would resolve to Regular",
    );
  });

  it('points libass at a fonts-ONLY directory', async () => {
    const registry = await loadFontRegistry(FONTS_DIR);
    strictEqual(libassFontsDir(FONTS_DIR, registry), join(FONTS_DIR, 'ttf'));
  });

  it('REFUSES a font whose bytes do not match the recorded hash', async () => {
    // A real font file under a registry that records the wrong digest — the
    // shape of a swapped or corrupted font, which would change both the pixels
    // and the licence basis without appearing anywhere in the output.
    const temp = mkdtempSync(join(tmpdir(), 'cutdown-fonts-'));
    mkdirSync(join(temp, 'ttf'), { recursive: true });
    copyFileSync(join(FONTS_DIR, 'ttf', 'Inter-Regular.ttf'), join(temp, 'ttf', 'Inter-SemiBold.ttf'));
    writeFileSync(
      join(temp, 'fonts.json'),
      JSON.stringify({
        registryVersion: '1.0.0',
        libassFontsDir: 'ttf',
        fonts: [
          {
            family: 'Inter',
            role: 'caption',
            file: 'ttf/Inter-SemiBold.ttf',
            hash: { algorithm: 'sha256', value: '78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3' },
            licenceNote: 'OFL',
          },
        ],
      }),
    );
    const registry = await loadFontRegistry(temp);
    await throwsAsync(
      () => resolveFonts(temp, registry, ['caption']),
      'FONT_HASH_MISMATCH',
    );
  });

  it('refuses a role the registry does not carry', async () => {
    const registry = await loadFontRegistry(FONTS_DIR);
    const withoutHeading = {
      ...registry,
      fonts: registry.fonts.filter((font) => font.role !== 'heading'),
    };
    await throwsAsync(() => resolveFonts(FONTS_DIR, withoutHeading, ['heading']), 'FONT_ROLE_MISSING');
  });
});

describe('D-34 tier ordering is enforced where the manifest is BORN', () => {
  it('refuses a final manifest that names no approved draft', () => {
    throws(() => buildRenderManifest(input({ tier: 'final' })), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'FINAL_WITHOUT_APPROVED_DRAFT');
      return true;
    });
  });

  it('refuses a draft manifest that claims an approval', () => {
    throws(
      () => buildRenderManifest(input({ approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A' })),
      (error: unknown) => {
        ok(error instanceof FfmpegError);
        strictEqual(error.code, 'DRAFT_WITH_APPROVED_DRAFT_LINK');
        return true;
      },
    );
  });

  it('refuses a manifest with no fonts — burned-in text needs a recorded licence', () => {
    throws(() => buildRenderManifest(input({ fonts: [] })), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'NO_FONTS_RESOLVED');
      return true;
    });
  });

  it('NEVER lets the renderer mark its own output editorially approved', () => {
    const draft = buildRenderManifest(input());
    strictEqual(draft.releaseState, 'draft');
    const final = buildRenderManifest(
      input({ tier: 'final', approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A' }),
    );
    strictEqual(final.releaseState, 'draft', 'only the Phase 5 approval flow may set editorially_approved');
  });

  it('selects proxy media for a draft and originals for a final (D-25/D-34)', () => {
    strictEqual(buildRenderManifest(input()).media.source, 'proxy');
    strictEqual(
      buildRenderManifest(input({ tier: 'final', approvedDraftManifestId: '01J9RM2B3C4D5E6F7G8H9K0N1A' })).media.source,
      'source_original',
    );
  });

  it('gives both tiers the SAME editorialPlanHash — they realise one plan', () => {
    const draft = buildRenderManifest(input());
    const final = buildRenderManifest(
      input({ tier: 'final', approvedDraftManifestId: draft.renderManifestId }),
    );
    strictEqual(final.editorialPlanHash.value, draft.editorialPlanHash.value);
  });

  it('pins every tier-1 determinism knob on the manifest itself', () => {
    const manifest = buildRenderManifest(input());
    strictEqual(manifest.encoderSettings.threads, 1);
    strictEqual(manifest.encoderSettings.bitexact, true);
    strictEqual(manifest.encoderSettings.stripCreationTime, true);
  });
});

describe('a final render must realise the plan that was approved', () => {
  const draft = buildRenderManifest(input());
  const finalOf = (overrides: Partial<BuildManifestInput> = {}) =>
    buildRenderManifest(input({ tier: 'final', approvedDraftManifestId: draft.renderManifestId, ...overrides }));

  it('accepts a final differing only in tier, media and encode', () => {
    const comparison = assertFinalMatchesApprovedDraft(draft, finalOf());
    strictEqual(comparison.changedFields.join(', '), '');
    strictEqual(comparison.ok, true);
  });

  it('catches a STRIPPED draft manifest instead of comparing nothing (round-4 BLOCK)', () => {
    // The whole check used to be silently reducible to nothing. It iterated
    // `Object.keys(draft)` only, so a draft manifest reduced to the two hashes it
    // compares explicitly skipped EVERY remaining field and returned `ok: true` —
    // `output` geometry, `fonts`, `platformOverlayVersion`, the renderer and ffmpeg
    // versions and `audioMix` all unchecked, which are exactly the fields
    // `assertFinalMatchesApprovedDraft`'s own docstring promises it catches. A final
    // master nobody had signed off then passed the tech-spec §11 gate.
    //
    // Two defences now, and this asserts the second: `render` reads the draft manifest
    // through `readContractJson`, so a stripped file is refused before it gets here —
    // and if it ever does get here, a key present on one side and absent on the other
    // is itself a change.
    const stripped = {
      editorialPlanHash: draft.editorialPlanHash,
      captions: { captionPlanHash: draft.captions.captionPlanHash },
    } as unknown as typeof draft;

    const comparison = assertFinalMatchesApprovedDraft(stripped, finalOf());
    strictEqual(comparison.ok, false, 'a draft that carries almost no fields matches nothing, and must not read as equal');
    ok(
      comparison.changedFields.includes('output'),
      `the absent fields are reported as changed, got: ${comparison.changedFields.join(', ')}`,
    );
    ok(comparison.changedFields.includes('fonts'));
  });

  it('catches an EDIT after sign-off via the editorial plan hash', () => {
    const edited = finalOf({ edlObject: { ...EDL_OBJECT, clips: [{ clipId: 'clip-1' }, { clipId: 'clip-2' }] } });
    const comparison = assertFinalMatchesApprovedDraft(draft, edited);
    strictEqual(comparison.ok, false);
    ok(comparison.changedFields.includes('editorialPlanHash'));
  });

  it('catches a caption CONTENT change even though caption paths legitimately differ', () => {
    const reworded = finalOf({ captionPlanHash: { algorithm: 'sha256', value: 'b'.repeat(64) } });
    const comparison = assertFinalMatchesApprovedDraft(draft, reworded);
    strictEqual(comparison.ok, false);
    ok(comparison.changedFields.includes('captions.captionPlanHash'));
  });

  it('catches a geometry change between approval and delivery', () => {
    const resized = finalOf({ edl: { edlId: EDL_OBJECT.edlId, canvas: { width: 1080, height: 1920 } } });
    const comparison = assertFinalMatchesApprovedDraft(draft, resized);
    strictEqual(comparison.ok, false);
    ok(comparison.changedFields.includes('output'));
  });

  it('catches a font swap between approval and delivery', () => {
    const otherFont: ResolvedFont = {
      ...FONT,
      reference: { ...FONT.reference, family: 'Helvetica', licenceNote: 'unrecorded' },
    };
    const comparison = assertFinalMatchesApprovedDraft(draft, finalOf({ fonts: [otherFont] }));
    strictEqual(comparison.ok, false);
    ok(comparison.changedFields.includes('fonts'));
  });

  it('does NOT complain about the encode settings a final is meant to change', () => {
    const final = finalOf();
    ok(final.encoderSettings.crf !== draft.encoderSettings.crf, 'a final encodes at a better CRF');
    strictEqual(assertFinalMatchesApprovedDraft(draft, final).ok, true);
  });
});

async function throwsAsync(
  fn: () => Promise<unknown>,
  expectedCode?: string,
  requireFfmpegError = true,
): Promise<void> {
  let threw: unknown;
  try {
    await fn();
  } catch (error) {
    threw = error;
  }
  ok(threw !== undefined, 'expected the call to reject');
  if (requireFfmpegError) ok(threw instanceof FfmpegError);
  if (expectedCode !== undefined) strictEqual((threw as FfmpegError).code, expectedCode);
}

describe('D-52 fades and the plan-hash chain — the true property, asserted', () => {
  // The contract wording: a fade changes the EDL and its hashes like any other
  // edit decision; what stays invariant is the DRAFT→FINAL chain, because both
  // tiers hash the same EDL object. Both directions asserted here so neither
  // reading can drift into folklore.
  it('adding a transition CHANGES editorialPlanHash; draft and final of the same EDL share it', async () => {
    const { hashContent } = await import('@cutdown/contracts');
    const base = { edlId: '01J9QW2B3C4D5E6F7G8H9K0PA1', clips: [{ clipId: 'clip-1', order: 0 }] };
    const faded = { ...base, clips: [{ ...base.clips[0], transition: { fadeInMs: 400 } }] };
    const h = (o: unknown) => (hashContent(o) as { value: string }).value;
    ok(h(base) !== h(faded), 'a fade is an edit decision and must move the hash');
    // An independently constructed equal object, not the same reference — a
    // reference-equality hash check is a tautology any hash function passes.
    const fadedClone = JSON.parse(JSON.stringify(faded)) as unknown;
    ok(h(faded) === h(fadedClone), 'structurally equal faded EDLs hash identically, which is what lets draft and final share a plan identity');
  });
});
