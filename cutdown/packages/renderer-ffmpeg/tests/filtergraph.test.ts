import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FfmpegError, escapeFilterPath, escapeFiltergraphText } from '@cutdown/renderer-core';
import { audioChain, buildFilterGraph, toFfmpegColour, videoChain, type GraphInput } from '../src/filtergraph.js';
import { durationToFrames, exactSecondsString, ticksToSecondsString, type PlannedClip } from '../src/timeline.js';

const CANVAS = { width: 720, height: 1280, frameRate: { num: 1, den: 30 } };

const clip = (mediaPath: string): PlannedClip => ({
  clipId: 'clip-1',
  assetId: '01KY2C5WZM38M23VRGB7H7WFV3',
  order: 0,
  mediaPath,
  sourceStartTicks: 0,
  sourceEndTicks: 30720,
  sourceTimebase: { num: 1, den: 15360 },
  sourceStartSeconds: '0.000000000',
  sourceEndSeconds: '2.000000000',
  outputStartFrame: 0,
  outputEndFrame: 60,
});

const graphInput = (mediaPath = 'C:/media/clean.mp4'): GraphInput => ({
  clip: clip(mediaPath),
  treatment: { mode: 'letterbox' },
  durationSeconds: '2.000000000',
});

describe('aspect treatments Phase 0 cannot honestly perform are REFUSED', () => {
  it('refuses subject_reframe rather than falling back to a centre crop', () => {
    throws(() => videoChain(0, CANVAS, { mode: 'subject_reframe' }), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'ASPECT_TREATMENT_UNSUPPORTED');
      ok(
        error.message.includes('REQ-052'),
        'the refusal must name the requirement that forbids the fallback',
      );
      ok(error.message.includes('REQ-016'), 'and the requirement that would enable it');
      return true;
    });
  });

  it('refuses split_screen', () => {
    throws(() => videoChain(0, CANVAS, { mode: 'split_screen' }), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'ASPECT_TREATMENT_UNSUPPORTED');
      return true;
    });
  });

  it('performs the three treatments it can', () => {
    for (const mode of ['letterbox', 'blurred_background', 'branded_background'] as const) {
      const chain = videoChain(0, CANVAS, { mode, backgroundColourHex: '#E23B2E' });
      ok(chain.includes('[v0]'), `${mode} must end at the concat label`);
      ok(chain.includes('format=yuv420p'), `${mode} must pin the pixel format`);
      ok(chain.includes('setsar=1'), `${mode} must normalise the pixel aspect ratio`);
    }
  });
});

describe('injection fixtures — filter values are escaped, paths are policed', () => {
  it("escapes a caption's colon so it cannot end the filter option", () => {
    const escaped = escapeFiltergraphText('time: 5');
    ok(escaped.includes('\\\\:'), 'a literal colon needs BOTH levels of escaping');
  });

  it('escapes quotes and backslashes', () => {
    ok(escapeFiltergraphText("it's").includes("\\\\'"));
  });

  it('escapes filtergraph structural characters', () => {
    for (const character of ['[', ']', ',', ';', '=']) {
      ok(escapeFiltergraphText(`a${character}b`).includes(`\\${character}`), `${character} must be escaped`);
    }
  });

  it('escapes a Windows drive colon in a filter path', () => {
    strictEqual(escapeFilterPath('C:\\fonts\\Inter.ttf'), 'C\\\\:/fonts/Inter.ttf');
  });

  it('rejects an option-shaped path', () => {
    throws(() => escapeFilterPath('-vf'), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'OPTION_SHAPED_INPUT_PATH');
      return true;
    });
  });

  it('rejects a concat: protocol path', () => {
    throws(() => escapeFilterPath('concat:a.mp4|b.mp4'), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'PROTOCOL_SHAPED_INPUT_PATH');
      return true;
    });
  });

  it('rejects an http: path', () => {
    throws(() => escapeFilterPath('http://evil.example/x.mp4'), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'PROTOCOL_SHAPED_INPUT_PATH');
      return true;
    });
  });

  it('rejects a relative path, whose meaning depends on the caller cwd', () => {
    throws(() => escapeFilterPath('media/clean.mp4'), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'RELATIVE_INPUT_PATH');
      return true;
    });
  });

  it('rejects a colour that is not #RRGGBB rather than passing it through', () => {
    throws(() => toFfmpegColour('red; drawtext=text=pwned'), (error: unknown) => {
      ok(error instanceof FfmpegError);
      strictEqual(error.code, 'INVALID_COLOUR');
      return true;
    });
  });

  it("a malicious caption's text reaches the graph fully escaped", () => {
    const graph = buildFilterGraph({
      canvas: CANVAS,
      inputs: [graphInput()],
      withAudio: true,
      burnIn: { assPath: 'C:/job/captions.ass', fontsDir: 'C:/fonts/ttf' },
      badge: { text: "'; drawtext=text=pwned, [x]", fontFile: 'C:/fonts/ttf/Inter-SemiBold.ttf', fontSizePx: 36 },
      loudness: null,
    });
    ok(
      !graph.filterComplex.includes('text=pwned,'),
      'an unescaped comma would let the caption append a filter of its own',
    );
    ok(graph.filterComplex.includes('drawtext=fontfile='));
  });
});

describe('the assembled graph', () => {
  it('concats video and audio when the render has audio', () => {
    const graph = buildFilterGraph({
      canvas: CANVAS,
      inputs: [graphInput(), graphInput('C:/media/b.mp4')],
      withAudio: true,
      burnIn: { assPath: 'C:/job/captions.ass', fontsDir: 'C:/fonts/ttf' },
      badge: null,
      loudness: { targetLufs: -14, maxTruePeakDbtp: -1 },
    });
    ok(graph.filterComplex.includes('concat=n=2:v=1:a=1[vcat][acat]'));
    ok(graph.filterComplex.includes('loudnorm=I=-14:TP=-1'));
    strictEqual(graph.audioLabel, '[aout]');
  });

  it('concats video only when there is no audio, and never fabricates a track', () => {
    const graph = buildFilterGraph({
      canvas: CANVAS,
      inputs: [graphInput()],
      withAudio: false,
      burnIn: { assPath: 'C:/job/captions.ass', fontsDir: 'C:/fonts/ttf' },
      badge: null,
      loudness: null,
    });
    ok(graph.filterComplex.includes('concat=n=1:v=1:a=0[vcat]'));
    strictEqual(graph.audioLabel, null);
    ok(!graph.filterComplex.includes('anullsrc'));
  });

  it('burns captions AFTER the concat, on the output timeline the cues are timed to', () => {
    const graph = buildFilterGraph({
      canvas: CANVAS,
      inputs: [graphInput(), graphInput('C:/media/b.mp4')],
      withAudio: false,
      burnIn: { assPath: 'C:/job/captions.ass', fontsDir: 'C:/fonts/ttf' },
      badge: null,
      loudness: null,
    });
    const concatAt = graph.filterComplex.indexOf('concat=');
    const subtitlesAt = graph.filterComplex.indexOf('subtitles=');
    ok(concatAt < subtitlesAt, 'burning per clip would require re-basing every cue time');
  });

  it('refuses an empty timeline', () => {
    throws(
      () =>
        buildFilterGraph({
          canvas: CANVAS,
          inputs: [],
          withAudio: false,
          burnIn: { assPath: 'C:/job/captions.ass', fontsDir: 'C:/fonts/ttf' },
          badge: null,
          loudness: null,
        }),
      (error: unknown) => {
        ok(error instanceof FfmpegError);
        strictEqual(error.code, 'EMPTY_TIMELINE');
        return true;
      },
    );
  });

  it('fades every clip boundary so a cut cannot click', () => {
    ok(audioChain(0, '2.000000000').includes('afade=t=in'));
    ok(audioChain(0, '2.000000000').includes('afade=t=out'));
  });
});

describe('exact timeline arithmetic — never floats', () => {
  it('renders an exact rational to fixed decimal seconds', () => {
    strictEqual(exactSecondsString(1001n, 30000n), '0.033366666');
  });

  it('keeps an exactly-representable boundary exact', () => {
    strictEqual(ticksToSecondsString(30720, { num: 1, den: 15360 }), '2.000000000');
  });

  it('truncates rather than rounding, so a cut can never move past a frame', () => {
    // 1/15360 s = 0.000065104166... — the 10th decimal onward is discarded.
    strictEqual(ticksToSecondsString(1, { num: 1, den: 15360 }), '0.000065104');
  });

  it('counts output frames exactly at a fractional frame rate', () => {
    // 2 s at 30000/1001 fps = 59.94 frames -> 60 after half-up rounding.
    strictEqual(durationToFrames(0, 30720, { num: 1, den: 15360 }, { num: 1001, den: 30000 }), 60);
  });

  it('never returns a zero-frame clip', () => {
    strictEqual(durationToFrames(0, 1, { num: 1, den: 15360 }, { num: 1, den: 30 }), 1);
  });

  it('refuses an inverted range instead of producing a negative duration', () => {
    throws(() => durationToFrames(100, 100, { num: 1, den: 15360 }, { num: 1, den: 30 }));
  });
});

describe('editorial fades (D-52) — duration-preserving, exact strings', () => {
  const fade = { inSeconds: '0.400000000', outStartSeconds: '1.750000000', outSeconds: '0.250000000' };

  it('a faded video chain carries fade-in and fade-out at exact offsets, after normalisation', () => {
    const chain = videoChain(0, CANVAS, { mode: 'letterbox' }, fade);
    ok(chain.includes('format=yuv420p,fade=t=in:st=0:d=0.400000000,fade=t=out:st=1.750000000:d=0.250000000[v0]'),
      `fades must follow the normalisation triple: ${chain}`);
  });

  it('a chain without a fade contains no video fade filter at all', () => {
    const chain = videoChain(0, CANVAS, { mode: 'letterbox' });
    ok(!chain.includes('fade='), `no editorial fade requested, none may appear: ${chain}`);
  });

  it('the blurred-background composite fades AFTER the overlay, covering background and subject alike', () => {
    const chain = videoChain(2, CANVAS, { mode: 'blurred_background' }, fade);
    ok(chain.includes('overlay=(W-w)/2:(H-h)/2,'), chain);
    ok(chain.indexOf('fade=t=in') > chain.indexOf('overlay='), 'fade must apply to the composited frame');
  });

  it('an editorial audio fade REPLACES the boundary micro-fade on its side', () => {
    const chain = audioChain(0, '2.000000000', fade);
    ok(chain.includes('afade=t=in:st=0:d=0.400000000,'), chain);
    ok(chain.includes('afade=t=out:st=1.750000000:d=0.250000000,'), chain);
    ok(!chain.includes('d=0.02'), 'the 20 ms click-killer must not layer beneath an editorial fade');
  });

  it('without an editorial fade the 20 ms boundary micro-fades remain exactly as before', () => {
    const chain = audioChain(0, '2.000000000');
    ok(chain.includes('afade=t=in:st=0:d=0.02,'), chain);
    ok(chain.includes('afade=t=out:st=1.980000:d=0.02,'), chain);
  });

  it('a one-sided fade emits only its side', () => {
    const inOnly = videoChain(0, CANVAS, { mode: 'letterbox' }, { inSeconds: '0.300000000', outStartSeconds: null, outSeconds: null });
    ok(inOnly.includes('fade=t=in:st=0:d=0.300000000[v0]'), inOnly);
    ok(!inOnly.includes('t=out'), inOnly);
  });

  it('buildFilterGraph threads each input fade into its own chain only', () => {
    const graph = buildFilterGraph({
      canvas: CANVAS,
      inputs: [{ ...graphInput(), fade }, graphInput()],
      withAudio: true,
      burnIn: { assPath: 'C:/j/captions.ass', fontsDir: 'C:/fonts' },
      badge: null,
      loudness: null,
    });
    const chains = graph.filterComplex.split(';');
    ok(chains.some((c) => c.endsWith('[v0]') && c.includes('fade=t=in')), 'clip 0 must fade');
    ok(chains.some((c) => c.endsWith('[v1]') && !c.includes('fade=')), 'clip 1 must not');
  });
});

describe('exact fade arithmetic helpers', () => {
  it('msToSecondsString is exact to nine places', async () => {
    const { msToSecondsString } = await import('../src/timeline.js');
    strictEqual(msToSecondsString(400), '0.400000000');
    strictEqual(msToSecondsString(40), '0.040000000');
    strictEqual(msToSecondsString(2000), '2.000000000');
    throws(() => msToSecondsString(2.5));
    throws(() => msToSecondsString(-1));
  });

  it('secondsStringMinusMs subtracts as scaled integers, never floats', async () => {
    const { secondsStringMinusMs } = await import('../src/timeline.js');
    strictEqual(secondsStringMinusMs('3.300000000', 250), '3.050000000');
    strictEqual(secondsStringMinusMs('3.857161458', 600), '3.257161458');
    throws(() => secondsStringMinusMs('0.100000000', 250), /negative/);
    throws(() => secondsStringMinusMs('3.3', 100), /seconds string/);
  });
});

describe('one-sided fades on the audio side (round-2 gap)', () => {
  it('an in-only fade keeps the 20 ms micro-fade on the OUT side', () => {
    const chain = audioChain(0, '2.000000000', { inSeconds: '0.300000000', outStartSeconds: null, outSeconds: null });
    ok(chain.includes('afade=t=in:st=0:d=0.300000000,'), chain);
    ok(chain.includes('afade=t=out:st=1.980000:d=0.02,'), 'the click-killer must survive on the unfaded side: ' + chain);
  });

  it('an out-only fade keeps the 20 ms micro-fade on the IN side', () => {
    const chain = audioChain(0, '2.000000000', { inSeconds: null, outStartSeconds: '1.750000000', outSeconds: '0.250000000' });
    ok(chain.includes('afade=t=in:st=0:d=0.02,'), chain);
    ok(chain.includes('afade=t=out:st=1.750000000:d=0.250000000,'), chain);
  });
});
