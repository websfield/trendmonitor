import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Containment for paths read out of STORED ARTEFACTS — the pure half, here in
 * `contracts` rather than in `skill-runtime`.
 *
 * These live here because "this field is job-relative" is a **contract** statement,
 * not a skill-runtime concern. `render-v2` (Stage 0B-3, D-62) now carries a
 * job-relative pattern on `outputPath` and `captions.*Path`; `render-v1` records
 * on disk, `render-manifest-v1.captions.*Path` and `source-asset-v1.storedPath`
 * remain constrained only by `minLength: 1` (the two deferred families are D-62b,
 * receiving home: the Stage 5 bump re-plan). The guard stays for ALL of them —
 * v2's pattern cannot express Windows device names or post-symlink containment —
 * and it has to be reachable from every package that reads such a field.
 *
 * That last part is why this module exists at all. The guards started in
 * `skill-runtime`, which `renderer-ffmpeg` does not depend on — so the FFmpeg adapter
 * joined `manifest.captions.{ass,srt,vtt}Path` with a bare `join`, unguarded, and the
 * `render` skill did the same for the three caption files it measures. That is the
 * FOURTH recurrence of one defect in this phase, and the first three were all "the
 * named field was guarded, the sibling was not". The fix is structural: one
 * implementation both packages can import, plus the lint in
 * `packages/skill-runtime/tests/artefact-path-discipline.test.ts` that fails when a
 * new call site forgets it. (That lint is what found these six.)
 *
 * `skill-runtime` re-exports these wrapped as `SkillError`s so a skill still exits 2
 * on a caller error; nothing here knows about exit codes.
 */

/** Thrown by every guard below. `code` matches the `SkillError` code skills report. */
export class ArtefactPathError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ArtefactPathError';
    this.code = code;
    this.details = details;
  }
}

const bad = (code: string, message: string, details?: unknown): ArtefactPathError =>
  new ArtefactPathError(code, message, details);

/**
 * Assert a path read out of a stored artefact is job-relative before it is joined.
 *
 * `split('/')` does not save a caller: a backslash value stays one component and
 * `path.win32.join` normalises it anyway (verified against the real filesystem).
 */
export function assertJobRelativePath(value: string, what: string): void {
  if (value.length === 0) throw bad('UNSAFE_ARTEFACT_PATH', `${what} is empty.`);
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || value.startsWith('//')) {
    throw bad(
      'UNSAFE_ARTEFACT_PATH',
      `${what} is ${JSON.stringify(value)}, which is absolute or a UNC path. Stored paths are job-relative by contract.`,
      { value, what },
    );
  }
  if (value.split(/[/\\]/).includes('..')) {
    throw bad(
      'UNSAFE_ARTEFACT_PATH',
      `${what} is ${JSON.stringify(value)}, which traverses out of the job directory. Stored paths are job-relative by contract, and a traversing one would copy a file from outside the job into a delivered package.`,
      { value, what },
    );
  }
  if (value.includes('\0')) throw bad('UNSAFE_ARTEFACT_PATH', `${what} contains a NUL byte.`);
  // Windows reserved DEVICE names, per SEGMENT — the sibling of the same rule in
  // the three id guards (`assertSafeId` and friends). It belongs here too because
  // THIS is the class boundary for strings-that-become-paths read out of stored
  // artefacts: `renders/nul.mp4` stays inside the job root, so containment passes
  // it, and it reaches `copyFileSync`/FFmpeg as the null device. No current
  // producer can emit one (`storedPath` is `source/<hash><ext>`), so this is the
  // hand-edited-artefact case rather than a live hole — but "guard the class, not
  // the field" is exactly the rule that stops a guard being added six times.
  const reservedSegment = value
    .split(/[/\\]/)
    .find((segment) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(segment));
  if (reservedSegment !== undefined) {
    throw bad(
      'UNSAFE_ARTEFACT_PATH',
      `${what} is ${JSON.stringify(value)}, whose segment ${JSON.stringify(reservedSegment)} names a device in the Windows reserved namespace. On Windows that path does not address a file, so a read returns nothing and a write goes nowhere.`,
      { value, what, segment: reservedSegment },
    );
  }
  if (value.includes(':')) {
    // A colon in a non-leading segment names an NTFS alternate data stream
    // (`renders/a.mp4:hidden`). It stays inside the job root, so the impact is
    // cosmetic rather than an escape — but no legitimate artefact path contains one.
    throw bad(
      'UNSAFE_ARTEFACT_PATH',
      `${what} is ${JSON.stringify(value)}, which contains a colon. No job-relative artefact path does; on NTFS this names an alternate data stream.`,
      { value, what },
    );
  }
}

/**
 * Assert `candidate` resolves inside `root`, LEXICALLY.
 *
 * Compared with a trailing separator so `.../jobs-evil` cannot pass as a child of
 * `.../jobs`. Lexical only: `resolve()` normalises `..` but does not follow symlinks.
 */
export function assertContainedLexical(root: string, candidate: string, what: string): void {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(prefix)) {
    throw bad(
      'PATH_ESCAPES_ROOT',
      `${what} resolves to ${resolvedCandidate}, which is outside ${resolvedRoot}.`,
      { what },
    );
  }
}

/**
 * Assert `candidate` resolves inside `root` AFTER resolving symlinks.
 *
 * When the candidate does not exist yet (a write target), the nearest existing
 * ANCESTOR is resolved instead of falling back to the lexical check: `<job>/link/x`
 * where `link` points out of the job made `realpathSync` throw on the missing leaf,
 * and returning there let the write land outside the job.
 */
export function assertContainedPhysicalPath(root: string, candidate: string, what: string): void {
  assertContainedLexical(root, candidate, what);
  if (!existsSync(root)) return; // no root yet, so no link to follow through
  const realRoot = realpathSync(root);
  let real: string;
  let probe = candidate;
  for (;;) {
    try {
      real = realpathSync(probe);
      break;
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return; // walked past the filesystem root
      probe = parent;
    }
  }
  const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (real !== realRoot && !real.startsWith(prefix)) {
    throw bad(
      'PATH_ESCAPES_ROOT',
      probe === candidate
        ? `${what} resolves through a link to ${real}, which is outside ${realRoot}.`
        : `${what} does not exist yet, but its nearest existing ancestor ${probe} resolves to ${real}, which is outside ${realRoot} — writing there would land outside the job.`,
      { what },
    );
  }
}

/**
 * Resolve a stored job-relative path against a job root, guarded both ways.
 *
 * The one call every artefact-derived path goes through, so the check cannot be
 * forgotten at a call site.
 */
export function resolveArtefactPath(jobRoot: string, value: string, what: string): string {
  assertJobRelativePath(value, what);
  const full = join(jobRoot, ...value.split('/'));
  assertContainedPhysicalPath(jobRoot, full, what);
  return full;
}
