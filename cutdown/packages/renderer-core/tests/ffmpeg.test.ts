import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSafeInputPath,
  assertSafeArgv,
  inputArgs,
  escapeFiltergraphText,
  escapeFilterPath,
  runFfmpeg,
  runFfprobe,
  ffmpegVersion,
  probeCapabilities,
  assertLibass,
  FfmpegError,
  EXIT_INPUT_VALIDATION,
  PROTOCOL_WHITELIST,
} from '../src/index.js';

const absolute = (name: string): string =>
  process.platform === 'win32' ? `C:\\media\\${name}` : `/media/${name}`;

/**
 * The injection corpus. Each entry is a real technique, not a synthetic string:
 * every one of these either executes or exfiltrates if it reaches ffmpeg's
 * parser unmodified.
 */
describe('input path rejection (tech-spec §11)', () => {
  const rejected: ReadonlyArray<readonly [string, string, string]> = [
    ['option-shaped, short', '-i', 'OPTION_SHAPED_INPUT_PATH'],
    ['option-shaped, filter injection', '-vf', 'OPTION_SHAPED_INPUT_PATH'],
    ['option-shaped, long', '--help', 'OPTION_SHAPED_INPUT_PATH'],
    ['concat protocol', 'concat:/etc/passwd|/etc/shadow', 'PROTOCOL_SHAPED_INPUT_PATH'],
    ['http protocol (SSRF)', 'http://169.254.169.254/latest/meta-data/', 'PROTOCOL_SHAPED_INPUT_PATH'],
    ['https protocol', 'https://evil.example/x.mp4', 'PROTOCOL_SHAPED_INPUT_PATH'],
    ['subfile protocol', 'subfile:,start,0,end,512,,:/etc/passwd', 'PROTOCOL_SHAPED_INPUT_PATH'],
    ['data protocol', 'data:text/plain;base64,QUJD', 'PROTOCOL_SHAPED_INPUT_PATH'],
    ['relative path', 'clips/clean.mp4', 'RELATIVE_INPUT_PATH'],
    ['relative traversal', '../../secrets/id_rsa', 'RELATIVE_INPUT_PATH'],
    ['bare filename', 'clean.mp4', 'RELATIVE_INPUT_PATH'],
    ['empty', '', 'EMPTY_INPUT_PATH'],
  ];

  for (const [label, path, expectedCode] of rejected) {
    test(`rejects ${label}`, () => {
      assert.throws(
        () => assertSafeInputPath(path),
        (error: unknown) => {
          assert.ok(error instanceof FfmpegError);
          assert.equal(error.code, expectedCode);
          // Exit-code semantics, tech-spec §6.2: 2 = input validation.
          assert.equal(error.exitCode, EXIT_INPUT_VALIDATION);
          return true;
        },
        `${path} should have been rejected`,
      );
    });
  }

  test('accepts an ordinary absolute path, including a Windows drive letter', () => {
    assert.equal(assertSafeInputPath(absolute('clean.mp4')), absolute('clean.mp4'));
    // A single-letter "scheme" is a drive letter, not a protocol.
    if (process.platform === 'win32') {
      assert.doesNotThrow(() => {
        assertSafeInputPath('C:\\Users\\x\\café shot.mp4');
      });
    }
  });

  test('structured error payload matches the §6.2 shape', () => {
    try {
      assertSafeInputPath('-i');
      assert.fail('should have thrown');
    } catch (error) {
      assert.ok(error instanceof FfmpegError);
      const payload = error.toPayload();
      assert.deepEqual(Object.keys(payload).sort(), [
        'code',
        'details',
        'message',
        'skill',
        'skillVersion',
      ]);
      assert.equal(payload.skill, 'renderer-core');
      assert.match(payload.skillVersion, /^\d+\.\d+\.\d+$/);
    }
  });
});

describe('protocol whitelist enforcement', () => {
  test('inputArgs always emits the whitelist immediately before -i', () => {
    const args = inputArgs(absolute('clean.mp4'));
    assert.deepEqual(
      [...args],
      ['-protocol_whitelist', PROTOCOL_WHITELIST, '-i', absolute('clean.mp4')],
    );
  });

  test('assertSafeArgv rejects a hand-built argv missing the whitelist', () => {
    assert.throws(
      () => {
        assertSafeArgv(['-i', absolute('clean.mp4'), '-f', 'null', '-']);
      },
      (error: unknown) =>
        error instanceof FfmpegError && error.code === 'MISSING_PROTOCOL_WHITELIST',
    );
  });

  test('assertSafeArgv rejects an option-shaped input smuggled into a hand-built argv', () => {
    assert.throws(
      () => {
        assertSafeArgv(['-protocol_whitelist', PROTOCOL_WHITELIST, '-i', '-vf']);
      },
      (error: unknown) =>
        error instanceof FfmpegError && error.code === 'OPTION_SHAPED_INPUT_PATH',
    );
  });

  test('assertSafeArgv rejects a dangling -i', () => {
    assert.throws(
      () => {
        assertSafeArgv(['-y', '-i']);
      },
      (error: unknown) => error instanceof FfmpegError && error.code === 'DANGLING_INPUT_FLAG',
    );
  });

  test('assertSafeArgv accepts a well-formed argv and the pipe sink', () => {
    assert.doesNotThrow(() => {
      assertSafeArgv([...inputArgs(absolute('a.mp4')), '-f', 'null', '-']);
    });
  });

  test('the whitelist is re-emitted per input, since it is a per-input option', () => {
    const args = [...inputArgs(absolute('a.mp4')), ...inputArgs(absolute('b.mp4'))];
    assert.equal(args.filter((a) => a === '-protocol_whitelist').length, 2);
    assert.doesNotThrow(() => {
      assertSafeArgv(args);
    });
  });
});

describe('filtergraph escaping (tech-spec §11)', () => {
  test('escapes the shell-looking payload as filtergraph text, not shell text', () => {
    const escaped = escapeFiltergraphText("'; rm -rf /");
    // The quote is neutralised. The shell metacharacters are untouched because
    // there is no shell — `shell: false`, always.
    assert.ok(!/(^|[^\\])'/.test(escaped), `unescaped quote in ${escaped}`);
    assert.ok(escaped.includes('rm -rf /'));
  });

  for (const [label, char] of [
    ['colon', ':'],
    ['single quote', "'"],
    ['backslash', '\\'],
    ['open bracket', '['],
    ['close bracket', ']'],
    ['comma', ','],
    ['semicolon', ';'],
    ['equals', '='],
  ] as const) {
    test(`escapes ${label}`, () => {
      const escaped = escapeFiltergraphText(`a${char}b`);
      assert.notEqual(escaped, `a${char}b`, `${label} passed through unescaped`);
      assert.ok(escaped.startsWith('a'), escaped);
      assert.ok(escaped.endsWith('b'), escaped);
    });
  }

  test('a filter-breakout attempt cannot close its option and append a filter', () => {
    // Unescaped, this would end drawtext's text option, close the filter, and
    // start a `crop` — inside a caption.
    const escaped = escapeFiltergraphText("hi:x=0,crop=1:1:0:0[out];[out]null");
    for (const metacharacter of [',', ';', '[', ']', '=']) {
      const bare = new RegExp(`(^|[^\\\\])\\${metacharacter}`);
      assert.ok(!bare.test(escaped), `bare ${metacharacter} survived: ${escaped}`);
    }
  });

  test('a newline is preserved — multi-line captions are legitimate', () => {
    assert.ok(escapeFiltergraphText('line one\nline two').includes('\n'));
  });

  test('a carriage return and other control characters are rejected, not silently stripped', () => {
    for (const control of ['\r', '\u0000', '\u001B']) {
      assert.throws(
        () => escapeFiltergraphText(`a${control}b`),
        (error: unknown) =>
          error instanceof FfmpegError && error.code === 'CONTROL_CHAR_IN_FILTER_TEXT',
        `control ${JSON.stringify(control)} should be rejected`,
      );
    }
  });

  test('escaping is idempotent in the sense that it never loses the payload', () => {
    const text = "Café — 50% off: today only! [limited] {x}";
    const escaped = escapeFiltergraphText(text);
    // Every non-metacharacter survives verbatim.
    assert.ok(escaped.includes('Café — 50% off'));
    assert.ok(escaped.includes('today only!'));
  });
});

describe('escapeFilterPath — the Windows drive-colon case', () => {
  test('normalises backslashes and escapes the drive colon', () => {
    if (process.platform !== 'win32') return;
    const escaped = escapeFilterPath('C:\\fonts\\Inter-Regular.ttf');
    // Backslashes become forward slashes (FFmpeg accepts them on Windows),
    // which removes the backslash ambiguity entirely...
    assert.ok(!escaped.includes('\\\\f'), escaped);
    assert.ok(escaped.includes('/fonts/Inter-Regular.ttf'), escaped);
    // ...leaving only the drive colon, two-level escaped.
    assert.ok(escaped.startsWith('C\\\\:'), `expected C\\\\: prefix, got ${escaped}`);
  });

  test('POSIX font paths need no colon escaping but still get level-2 treatment', () => {
    const escaped = escapeFilterPath('/usr/share/fonts/Inter.ttf');
    assert.equal(escaped, '/usr/share/fonts/Inter.ttf');
  });

  test('a filter path is validated like an input path', () => {
    assert.throws(
      () => escapeFilterPath('-vf'),
      (error: unknown) =>
        error instanceof FfmpegError && error.code === 'OPTION_SHAPED_INPUT_PATH',
    );
    assert.throws(
      () => escapeFilterPath('http://evil.example/font.ttf'),
      (error: unknown) =>
        error instanceof FfmpegError && error.code === 'PROTOCOL_SHAPED_INPUT_PATH',
    );
  });

  /**
   * The escaping is only correct if FFmpeg agrees. This renders a real frame
   * with `drawtext` using an escaped font path AND escaped adversarial caption
   * text; if either escape were wrong, ffmpeg would fail to parse the graph and
   * `runFfmpeg` would throw.
   */
  test('FFmpeg itself accepts the escaped font path and adversarial caption text', async (t) => {
    const fontCandidates =
      process.platform === 'win32'
        ? ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
        : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
    const { existsSync } = await import('node:fs');
    const font = fontCandidates.find((candidate) => existsSync(candidate));
    if (font === undefined) {
      t.skip('no system font available');
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'cutdown-esc-'));
    try {
      const out = join(dir, 'frame.png');
      const caption = "Drop 50%: '; rm -rf / [now],x=0;y=0";
      await runFfmpeg([
        '-nostdin',
        '-y',
        '-protocol_whitelist',
        PROTOCOL_WHITELIST,
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:d=1',
        '-frames:v',
        '1',
        '-vf',
        `drawtext=fontfile=${escapeFilterPath(font)}:text=${escapeFiltergraphText(caption)}:fontcolor=white:fontsize=14:x=4:y=4`,
        out,
      ]);
      // A frame came out, so the graph parsed and the caption stayed data.
      const probed = await runFfprobe([
        '-v',
        'error',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        ...inputArgs(out),
      ]);
      assert.match(probed.stdout.trim(), /^320,180$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('spawning', () => {
  test('records the FFmpeg version string for the D-33 determinism proof', async () => {
    const version = await ffmpegVersion();
    assert.match(version, /^ffmpeg version /);
  });

  test('libass capability probe returns true on this machine', async () => {
    const capabilities = await probeCapabilities();
    assert.equal(capabilities.hasSubtitlesFilter, true, 'subtitles filter missing');
    assert.equal(capabilities.hasAssFilter, true, 'ass filter missing');
    assert.equal(capabilities.hasLibass, true);
    // assertLibass resolves rather than throwing on a libass-carrying build.
    const asserted = await assertLibass();
    assert.equal(asserted.hasLibass, true);
  });

  test('a timeout is reported distinctly from a non-zero exit', async () => {
    await assert.rejects(
      runFfmpeg(
        [
          '-nostdin',
          '-y',
          '-protocol_whitelist',
          PROTOCOL_WHITELIST,
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1920x1080:rate=60:duration=600',
          '-c:v',
          'libx264',
          '-preset',
          'veryslow',
          '-f',
          'null',
          '-',
        ],
        { timeoutMs: 400 },
      ),
      (error: unknown) => {
        assert.ok(error instanceof FfmpegError);
        assert.equal(error.code, 'TIMEOUT');
        assert.notEqual(error.code, 'FFMPEG_FAILED');
        return true;
      },
    );
  });

  test('a non-zero exit is a structured runtime failure, not a timeout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutdown-fail-'));
    try {
      const notMedia = join(dir, 'not-media.mp4');
      await writeFile(notMedia, 'this is not a video file');
      await assert.rejects(
        runFfprobe(['-v', 'error', '-show_streams', ...inputArgs(notMedia)]),
        (error: unknown) => {
          assert.ok(error instanceof FfmpegError);
          assert.equal(error.code, 'FFPROBE_FAILED');
          // Exit-code semantics, §6.2: 3 = runtime failure.
          assert.equal(error.exitCode, 3);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
