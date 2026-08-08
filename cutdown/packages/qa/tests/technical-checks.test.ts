import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALL_CHECK_IDS, D35_NON_WAIVABLE, parseQaRuleset, QaConfigError, type QaCheckId, type RenderMeasurements } from '../src/technical/model.js';
import { evaluateChecks, type QaContext } from '../src/technical/checks.js';
import { buildDetectionFilters } from '../src/technical/measure.js';
import { cleanContext, cleanMeasurements, SHIPPED_RULESET } from './technical-fixtures.js';

/**
 * The REQ-100/084/104 coverage matrix.
 *
 * The Phase 4 acceptance criterion is that **every promised check has a positive
 * and a negative fixture**. `CASES` below is that matrix, and the last test in
 * this file asserts it covers the whole contract enum — so adding a check to
 * `qa-check-id.json` without a fixture pair fails the suite rather than quietly
 * shipping an untested detector.
 *
 * Each case perturbs exactly one field of the clean baseline. The baseline
 * itself is asserted to produce zero findings first, which is what stops a case
 * from "passing" because the fixture was dirty all along.
 */

interface Case {
  /** How to break the clean baseline so this check fires. */
  readonly breakIt: (m: RenderMeasurements, c: QaContext) => { m: RenderMeasurements; c: QaContext };
  /** Expected severity when it fires. */
  readonly severity: 'blocker' | 'warning' | 'info';
  /** Checks that are expected to report `skipped` on the CLEAN baseline. */
  readonly skippedWhenClean?: true;
}

const withM = (m: RenderMeasurements, patch: Partial<RenderMeasurements>, c: QaContext) => ({
  m: { ...m, ...patch },
  c,
});
const withC = (m: RenderMeasurements, c: QaContext, patch: Partial<QaContext>) => ({
  m,
  c: { ...c, ...patch },
});

const CASES: Record<QaCheckId, Case> = {
  missing_media: {
    breakIt: (m, c) => withM(m, { filePresent: false, sizeBytes: 0 }, c),
    severity: 'blocker',
  },
  container_corruption: {
    breakIt: (m, c) => withM(m, { corruption: 'corrupt' }, c),
    severity: 'blocker',
  },
  source_range_validity: {
    breakIt: (m, c) =>
      withC(m, c, {
        sourceRangeViolations: [
          { clipId: 'clip-2', code: 'EXCEEDS_SOURCE_DURATION', message: 'ends at 6.0 s of a 5.0 s asset' },
        ],
      }),
    severity: 'blocker',
  },
  output_dimensions: {
    breakIt: (m, c) => withM(m, { width: 640, height: 360 }, c),
    severity: 'blocker',
  },
  output_duration: {
    breakIt: (m, c) => withM(m, { durationMs: 7000 }, c),
    severity: 'warning',
  },
  codec_profile: {
    breakIt: (m, c) => withM(m, { videoCodec: 'hevc' }, c),
    severity: 'blocker',
  },
  black_frames: {
    breakIt: (m, c) => withM(m, { blackRuns: [{ startMs: 500, endMs: 1800 }] }, c),
    severity: 'warning',
  },
  frozen_frames: {
    breakIt: (m, c) => withM(m, { frozenRuns: [{ startMs: 1000, endMs: 2400 }] }, c),
    severity: 'warning',
  },
  duplicate_frames: {
    breakIt: (m, c) => withM(m, { duplicateFrameCount: 90, frameCount: 120 }, c),
    severity: 'warning',
  },
  crop_failure: {
    breakIt: (m, c) => withM(m, { contentRect: { width: 720, height: 405 } }, c),
    severity: 'warning',
  },
  unexpected_silence: {
    breakIt: (m, c) => withM(m, { silenceRuns: [{ startMs: 0, endMs: 3000 }] }, c),
    severity: 'warning',
  },
  audio_clipping: {
    breakIt: (m, c) => withM(m, { peakDbfs: 0 }, c),
    severity: 'warning',
  },
  loudness_target: {
    breakIt: (m, c) =>
      withM(m, { loudness: { kind: 'measured', integratedLufs: -22.5, truePeakDbtp: -3, loudnessRangeLu: 4 } }, c),
    severity: 'warning',
  },
  true_peak: {
    breakIt: (m, c) =>
      withM(m, { loudness: { kind: 'measured', integratedLufs: -14, truePeakDbtp: 0.4, loudnessRangeLu: 4 } }, c),
    severity: 'warning',
  },
  av_sync_drift: {
    breakIt: (m, c) => withM(m, { avStartOffsetMs: 120 }, c),
    severity: 'warning',
  },
  caption_file_present: {
    breakIt: (m, c) => withM(m, { captionFiles: { ass: true, srt: false, vtt: true } }, c),
    severity: 'blocker',
  },
  caption_overflow: {
    breakIt: (m, c) =>
      withC(m, c, {
        captions: [
          {
            index: 1,
            startMs: 0,
            endMs: 4000,
            displayText: 'one two three',
            lines: ['line one', 'line two', 'line three'],
          },
        ],
      }),
    severity: 'warning',
  },
  caption_readability: {
    breakIt: (m, c) =>
      withC(m, c, {
        captions: [
          {
            index: 1,
            startMs: 0,
            endMs: 1200,
            displayText: 'far too many characters to read inside one and a bit seconds honestly',
            lines: ['far too many characters to read'],
          },
        ],
      }),
    severity: 'warning',
  },
  caption_timing: {
    breakIt: (m, c) =>
      withC(m, c, {
        captions: [{ index: 1, startMs: 0, endMs: 400, displayText: 'blink', lines: ['blink'] }],
      }),
    severity: 'warning',
  },
  caption_safe_zone: {
    // Margins of zero put the caption box hard against the canvas edges, well
    // outside the TikTok caption safe area.
    breakIt: (m, c) =>
      withC(m, c, {
        captionStyle: { fontSizePx: 48, marginVerticalPx: 0, marginHorizontalPx: 0 },
        captions: [
          {
            index: 1,
            startMs: 0,
            endMs: 4000,
            displayText: 'x'.repeat(42),
            lines: ['x'.repeat(42)],
          },
        ],
      }),
    severity: 'warning',
  },
  caption_spelling: {
    // No dictionary is vendored at Phase 0, so this check reports `skipped` in
    // BOTH directions. Its "positive" fixture asserts that it still declines
    // rather than silently reporting clean — which is the behaviour under test.
    breakIt: (m, c) => ({ m, c }),
    severity: 'warning',
    skippedWhenClean: true,
  },
  caption_name_flag: {
    breakIt: (m, c) =>
      withC(m, c, {
        captionReviewFlags: [{ cueIndex: 1, kind: 'proper_noun', detail: 'Check the spelling of "Kaia".' }],
      }),
    severity: 'warning',
  },
  non_speech_cue_review: {
    breakIt: (m, c) =>
      withC(m, c, {
        // An event in a window no cue covers.
        captions: [{ index: 1, startMs: 0, endMs: 1000, displayText: 'hi', lines: ['hi'] }],
        nonSpeechEvents: [{ kind: 'door_slam', startMs: 2500, endMs: 3000 }],
      }),
    severity: 'info',
  },
};

describe('technical QA — the clean control', () => {
  it('produces ZERO findings on a clean render', () => {
    const evaluation = evaluateChecks(cleanMeasurements(), cleanContext());
    deepStrictEqual(
      evaluation.findings.map((f) => `${f.checkId}: ${f.message}`),
      [],
      'the clean baseline must fire nothing — otherwise every per-check case below could pass for the wrong reason',
    );
  });

  it('records an entry for EVERY check, including the ones that did not run', () => {
    const evaluation = evaluateChecks(cleanMeasurements(), cleanContext());
    deepStrictEqual(
      evaluation.checksRun.map((c) => c.checkId),
      [...ALL_CHECK_IDS],
    );
  });

  it('never records a `skipped` or `errored` check without a reason', () => {
    const evaluation = evaluateChecks(cleanMeasurements(), cleanContext());
    for (const record of evaluation.checksRun) {
      if (record.status === 'ran') {
        strictEqual(record.reason, null, `${record.checkId} ran, so it must carry no reason`);
      } else {
        ok(
          record.reason !== null && record.reason.length > 0,
          `${record.checkId} is "${record.status}" and MUST say why — an unexplained absence reads as clean`,
        );
      }
    }
  });
});

describe('technical QA — positive and negative fixture per check', () => {
  for (const checkId of ALL_CHECK_IDS) {
    const testCase = CASES[checkId];

    it(`${checkId}: does not fire on the clean control`, () => {
      const evaluation = evaluateChecks(cleanMeasurements(), cleanContext());
      strictEqual(evaluation.findings.filter((f) => f.checkId === checkId).length, 0);
      const record = evaluation.checksRun.find((c) => c.checkId === checkId);
      ok(record !== undefined);
      if (testCase.skippedWhenClean === true) {
        strictEqual(record.status, 'skipped');
      }
    });

    it(`${checkId}: fires with the right severity when broken`, () => {
      const broken = testCase.breakIt(cleanMeasurements(), cleanContext());
      const evaluation = evaluateChecks(broken.m, broken.c);
      const hits = evaluation.findings.filter((f) => f.checkId === checkId);

      if (testCase.skippedWhenClean === true) {
        const record = evaluation.checksRun.find((c) => c.checkId === checkId);
        ok(record !== undefined);
        strictEqual(
          record.status,
          'skipped',
          `${checkId} has no implementation at Phase 0 and must keep saying so rather than reporting clean`,
        );
        return;
      }

      ok(hits.length > 0, `${checkId} did not fire on its own negative fixture`);
      for (const hit of hits) {
        strictEqual(hit.severity, testCase.severity, `${checkId} severity`);
        strictEqual(hit.waivable, testCase.severity !== 'blocker', `${checkId} waivable must agree with severity`);
        ok(hit.fix.length > 0, `${checkId} must carry an actionable fix (REQ-106)`);
        ok(hit.message.length > 0, `${checkId} must carry a message`);
        ok(hit.findingId.startsWith(`${checkId}:`), `${checkId} finding id must be derived from the check`);
      }
    });
  }

  it('the fixture matrix covers the whole contract enum', () => {
    deepStrictEqual(Object.keys(CASES).sort(), [...ALL_CHECK_IDS].sort());
  });
});

describe('technical QA — finding identity is stable', () => {
  it('gives the same finding the same id across runs, so a waiver keeps meaning', () => {
    const broken = CASES.black_frames.breakIt(cleanMeasurements(), cleanContext());
    const first = evaluateChecks(broken.m, broken.c).findings.map((f) => f.findingId);
    const second = evaluateChecks(broken.m, broken.c).findings.map((f) => f.findingId);
    deepStrictEqual(first, second);
    ok(first.length > 0);
  });
});

describe('technical QA — thresholds are DATA, not code', () => {
  /**
   * The acceptance criterion, executed: the same measurements are judged
   * differently by two rulesets that differ only in a number, with no code path
   * varying between them.
   */
  it('changing a threshold changes the verdict with no code change', () => {
    const measurements: RenderMeasurements = {
      ...cleanMeasurements(),
      loudness: { kind: 'measured', integratedLufs: -14, truePeakDbtp: -0.5, loudnessRangeLu: 4 },
    };

    const shipped = evaluateChecks(measurements, cleanContext());
    ok(
      shipped.findings.some((f) => f.checkId === 'true_peak'),
      '-0.5 dBTP breaches the shipped -1 dBTP ceiling',
    );

    const relaxed = {
      ...SHIPPED_RULESET,
      audio: { ...SHIPPED_RULESET.audio, maxTruePeakDbtp: -0.1 },
    };
    const after = evaluateChecks(measurements, { ...cleanContext(), ruleset: relaxed });
    strictEqual(
      after.findings.filter((f) => f.checkId === 'true_peak').length,
      0,
      'the identical render passes once the ruleset permits -0.1 dBTP — the number, not the code, decided',
    );
  });

  it('re-classifying a NON-D-35 check in the ruleset changes its severity', () => {
    // `output_duration` is a warning by policy, not by D-35, so the ruleset is
    // free to promote it. (An earlier version of this test used
    // `output_dimensions` — a D-35 blocker — and thereby asserted as DESIRED the
    // very demotion D-35 forbids. A test can lock in the wrong behaviour just as
    // firmly as the right one.)
    const promoted = {
      ...SHIPPED_RULESET,
      severities: {
        blocker: [...SHIPPED_RULESET.severities.blocker, 'output_duration' as const],
        warning: SHIPPED_RULESET.severities.warning.filter((id) => id !== 'output_duration'),
        info: SHIPPED_RULESET.severities.info,
      },
    };
    const broken = CASES.output_duration.breakIt(cleanMeasurements(), {
      ...cleanContext(),
      ruleset: promoted,
    });
    const evaluation = evaluateChecks(broken.m, { ...broken.c, ruleset: promoted });
    const hit = evaluation.findings.find((f) => f.checkId === 'output_duration');
    ok(hit !== undefined);
    strictEqual(hit.severity, 'blocker');
    strictEqual(hit.waivable, false);
  });

  it('every field the ruleset declares is actually READ by a check', () => {
    /**
     * A dead setting is worse than a missing one: it sits in the file looking
     * like a control, and an operator who edits it sees no behaviour change and
     * concludes the gate is broken. This test perturbs each numeric threshold in
     * turn and asserts SOMETHING downstream notices.
     *
     * `maxDuplicateFrameRun` was exactly this — required by the loader, shipped
     * in the yaml, and read by nothing.
     */
    const fingerprint = (ruleset: typeof SHIPPED_RULESET): string => {
      const perturbedCases = ALL_CHECK_IDS.map((id) => {
        const broken = CASES[id].breakIt(cleanMeasurements(), { ...cleanContext(), ruleset });
        const evaluation = evaluateChecks(broken.m, { ...broken.c, ruleset });
        return `${id}:${String(evaluation.findings.filter((f) => f.checkId === id).length)}`;
      });
      const cleanRun = evaluateChecks(cleanMeasurements(), { ...cleanContext(), ruleset });
      // A probe with a small POSITIVE inter-cue gap. The clean fixture's cues
      // butt exactly (gap = 0), and the flicker rule only fires on `gap > 0`, so
      // without this scenario `minInterCueGapSeconds` would be unreachable and
      // the test would call a live setting dead.
      const gapped = evaluateChecks(cleanMeasurements(), {
        ...cleanContext(),
        ruleset,
        captions: [
          // A 100 ms gap: comfortably ABOVE the shipped 40 ms flicker floor (so
          // the baseline is clean) and below any raised value (so a perturbation
          // is visible). A 20 ms gap would fire under both and prove nothing.
          { index: 1, startMs: 0, endMs: 1900, displayText: 'first', lines: ['first'] },
          { index: 2, startMs: 2000, endMs: 4000, displayText: 'second', lines: ['second'] },
        ],
      });
      // `output.minWidth`/`minHeight` are the FALLBACK bounds, used only when no
      // platform capability supplies a `minResolution`. Every other scenario here
      // supplies one, so without this probe the fallback is unreachable and the
      // test would call a live setting dead.
      const noPlatformMinimum = evaluateChecks(cleanMeasurements(), {
        ...cleanContext(),
        ruleset,
        minResolution: null,
      });
      return [
        ...perturbedCases,
        `clean:${String(cleanRun.findings.length)}`,
        `gapped:${String(gapped.findings.length)}`,
        `noPlatformMin:${String(noPlatformMinimum.findings.length)}`,
      ].join('|');
    };

    const baseline = fingerprint(SHIPPED_RULESET);
    const perturbations: [string, typeof SHIPPED_RULESET][] = [
      ['audio.maxTruePeakDbtp', { ...SHIPPED_RULESET, audio: { ...SHIPPED_RULESET.audio, maxTruePeakDbtp: 12 } }],
      ['audio.loudnessToleranceLu', { ...SHIPPED_RULESET, audio: { ...SHIPPED_RULESET.audio, loudnessToleranceLu: 50 } }],
      ['audio.clippingSampleThresholdDbfs', { ...SHIPPED_RULESET, audio: { ...SHIPPED_RULESET.audio, clippingSampleThresholdDbfs: 30 } }],
      ['audio.maxUnexpectedSilenceSeconds', { ...SHIPPED_RULESET, audio: { ...SHIPPED_RULESET.audio, maxUnexpectedSilenceSeconds: 999 } }],
      ['video.maxBlackFrameRun', { ...SHIPPED_RULESET, video: { ...SHIPPED_RULESET.video, maxBlackFrameRun: 9999 } }],
      ['video.maxFrozenFrameRun', { ...SHIPPED_RULESET, video: { ...SHIPPED_RULESET.video, maxFrozenFrameRun: 9999 } }],
      ['video.maxDuplicateFrameRatio', { ...SHIPPED_RULESET, video: { ...SHIPPED_RULESET.video, maxDuplicateFrameRatio: 1 } }],
      ['video.minCanvasCoverage', { ...SHIPPED_RULESET, video: { ...SHIPPED_RULESET.video, minCanvasCoverage: 0 } }],
      ['sync.maxDriftMilliseconds', { ...SHIPPED_RULESET, sync: { maxDriftMilliseconds: 9999 } }],
      ['captions.maxLines', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, maxLines: 99 } }],
      ['captions.maxCharsPerLine', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, maxCharsPerLine: 1 } }],
      ['captions.minCueDurationSeconds', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, minCueDurationSeconds: 0 } }],
      ['captions.maxCharactersPerSecond', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, maxCharactersPerSecond: 9999 } }],
      ['captions.minInterCueGapSeconds', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, minInterCueGapSeconds: 5 } }],
      ['captions.averageGlyphAdvanceEm', { ...SHIPPED_RULESET, captions: { ...SHIPPED_RULESET.captions, averageGlyphAdvanceEm: 4 } }],
      ['output.durationToleranceMilliseconds', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, durationToleranceMilliseconds: 999_999 } }],
      ['output.minWidth', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, minWidth: 99_999 } }],
      ['output.minHeight', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, minHeight: 99_999 } }],
      ['output.acceptedVideoCodecs', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, acceptedVideoCodecs: ['av1'] } }],
      ['output.acceptedContainers', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, acceptedContainers: ['mkv'] } }],
      ['output.acceptedAudioCodecs', { ...SHIPPED_RULESET, output: { ...SHIPPED_RULESET.output, acceptedAudioCodecs: ['opus'] } }],
    ];

    for (const [name, perturbed] of perturbations) {
      ok(
        fingerprint(perturbed) !== baseline,
        `${name} is declared in the ruleset but changing it altered no check's verdict — it is a dead setting`,
      );
    }

    /**
     * The half that makes the list above unable to lie by omission.
     *
     * The list was hand-written, and a hand-written list of 18 of 26 settings is
     * exactly how `audio.targetLoudnessLufs` stayed dead through the whole of
     * Phase 4 (D-54): the test asserted every field it had been TOLD about, and
     * the field it had not been told about was the dead one. So the leaves are
     * now derived from the shipped ruleset itself, and every one must be
     * accounted for by name — perturbed above, proven live in the measurement
     * filtergraph, or explicitly declared as not-a-threshold with its reason.
     *
     * A new setting added to the yaml therefore fails this test until someone
     * says which kind it is. That is the point.
     */
    const leaves = (value: unknown, prefix = ''): string[] => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        leaves(child, prefix === '' ? key : `${prefix}.${key}`),
      );
    };

    // Settings FFmpeg consumes, not the checks: they define what counts as
    // black, frozen or silent before any judgement happens, so no checks-level
    // perturbation can reach them. Proven live against the real filtergraph.
    // Each is checked against the filtergraph it BELONGS to, not against both
    // concatenated: a video threshold that leaked into the audio graph (or a
    // `pic_th`/`pix_th` swap) would satisfy a combined search while being wired
    // to the wrong parameter.
    const measurementOnly: [string, 'video' | 'audio'][] = [
      ['video.blackPixelRatio', 'video'],
      ['video.blackLumaThreshold', 'video'],
      ['video.freezeNoiseDb', 'video'],
      ['audio.silenceThresholdDbfs', 'audio'],
    ];
    for (const [field, graph] of measurementOnly) {
      const [section, key] = field.split('.') as ['video' | 'audio', string];
      const sentinel = 0.4242;
      const perturbed = {
        ...SHIPPED_RULESET,
        [section]: { ...SHIPPED_RULESET[section], [key]: sentinel },
      } as typeof SHIPPED_RULESET;
      const filters = buildDetectionFilters(perturbed);
      ok(
        filters[graph].includes(String(sentinel)),
        `${field} is declared in the ruleset but never reaches the ${graph} measurement filtergraph — it is a dead setting`,
      );
      const otherGraph = graph === 'video' ? 'audio' : 'video';
      ok(
        !filters[otherGraph].includes(String(sentinel)),
        `${field} reached the ${otherGraph} filtergraph, where it does not belong`,
      );
    }

    // Not thresholds. Each is carried or enforced elsewhere, with the test that
    // proves it named, so "not perturbed" never means "not covered".
    const notThresholds: Record<string, string> = {
      rulesetVersion: 'stamped onto every report — technical-gate.test.ts "the report names the ruleset that judged it"',
      effectiveFrom: 'provenance for the version above; never read by a check',
      'severities.blocker': 'proven by the D35_NON_WAIVABLE and severity-promotion tests in this file',
      'severities.warning': 'proven by the D35_NON_WAIVABLE and severity-promotion tests in this file',
      'severities.info': 'proven by the D35_NON_WAIVABLE and severity-promotion tests in this file',
    };

    const accountedFor = new Set([
      ...perturbations.map(([name]) => name),
      ...measurementOnly.map(([field]) => field),
      ...Object.keys(notThresholds),
    ]);
    const unaccounted = leaves(SHIPPED_RULESET).filter((leaf) => !accountedFor.has(leaf));
    deepStrictEqual(
      unaccounted,
      [],
      `every ruleset setting must be perturbed, proven in the filtergraph, or declared not-a-threshold; unaccounted: ${unaccounted.join(', ')}`,
    );
  });
});

describe('technical QA — the ruleset fails closed', () => {
  it('refuses unparseable YAML rather than falling back to defaults', () => {
    let threw: unknown;
    try {
      parseQaRuleset('audio: [unclosed', 'test');
    } catch (error) {
      threw = error;
    }
    ok(threw instanceof QaConfigError);
    strictEqual((threw as QaConfigError).code, 'QA_RULESET_UNPARSEABLE');
  });

  it('refuses a ruleset missing a setting rather than completing it silently', () => {
    let threw: unknown;
    try {
      parseQaRuleset('rulesetVersion: "1.0.0"\neffectiveFrom: "2026-07-29"\n', 'test');
    } catch (error) {
      threw = error;
    }
    ok(threw instanceof QaConfigError);
    strictEqual((threw as QaConfigError).code, 'QA_RULESET_INCOMPLETE');
  });

  it('REFUSES a ruleset that demotes a D-35 non-waivable check', () => {
    for (const nonWaivable of D35_NON_WAIVABLE) {
      const demoted = JSON.stringify({
        ...SHIPPED_RULESET,
        severities: {
          blocker: SHIPPED_RULESET.severities.blocker.filter((id) => id !== nonWaivable),
          warning: [...SHIPPED_RULESET.severities.warning, nonWaivable],
          info: SHIPPED_RULESET.severities.info,
        },
      });
      let threw: unknown;
      try {
        parseQaRuleset(demoted, 'test');
      } catch (error) {
        threw = error;
      }
      ok(
        threw instanceof QaConfigError,
        `demoting ${nonWaivable} to warning must be rejected — D-35 fixes it as non-waivable`,
      );
      strictEqual((threw as QaConfigError).code, 'QA_RULESET_DEMOTES_NON_WAIVABLE_CHECK');
    }
  });

  it('still permits the ruleset to TIGHTEN — adding a blocker is fine', () => {
    const tightened = JSON.stringify({
      ...SHIPPED_RULESET,
      severities: {
        blocker: [...SHIPPED_RULESET.severities.blocker, 'true_peak'],
        warning: SHIPPED_RULESET.severities.warning.filter((id) => id !== 'true_peak'),
        info: SHIPPED_RULESET.severities.info,
      },
    });
    strictEqual(parseQaRuleset(tightened, 'test').severities.blocker.includes('true_peak'), true);
  });

  it('the shipped ruleset satisfies the D-35 floor', () => {
    for (const nonWaivable of D35_NON_WAIVABLE) {
      ok(SHIPPED_RULESET.severities.blocker.includes(nonWaivable), `${nonWaivable} must ship as a blocker`);
    }
  });

  it('refuses a ruleset that leaves a check unclassified', () => {
    const text = JSON.stringify({
      ...SHIPPED_RULESET,
      severities: {
        blocker: SHIPPED_RULESET.severities.blocker,
        warning: SHIPPED_RULESET.severities.warning.filter((id) => id !== 'true_peak'),
        info: SHIPPED_RULESET.severities.info,
      },
    });
    let threw: unknown;
    try {
      // JSON is valid YAML, so this exercises the semantic check, not the parser.
      parseQaRuleset(text, 'test');
    } catch (error) {
      threw = error;
    }
    ok(threw instanceof QaConfigError);
    strictEqual((threw as QaConfigError).code, 'QA_RULESET_UNCLASSIFIED_CHECK');
  });
});

describe('technical QA — a broken detector never reads as clean', () => {
  it('records `errored` with the thrown message instead of silently passing', () => {
    const context = cleanContext();
    const hostile = {
      ...context,
      get captions(): never {
        throw new Error('caption source exploded');
      },
    } as unknown as QaContext;
    const evaluation = evaluateChecks(cleanMeasurements(), hostile);
    const errored = evaluation.checksRun.filter((c) => c.status === 'errored');
    ok(errored.length > 0, 'a throwing check must be recorded, not swallowed');
    for (const record of errored) {
      ok(record.reason !== null && record.reason.includes('caption source exploded'));
    }
  });
});
