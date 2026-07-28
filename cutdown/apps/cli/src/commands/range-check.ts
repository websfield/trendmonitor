import { readFileSync } from 'node:fs';

import { checkSourceRanges } from '@cutdown/contracts';
import type { AssetBounds, SourceRange } from '@cutdown/contracts';

/**
 * `cutdown range-check --input <file>` — the source-bounds gate as a command.
 *
 * This exists so there is exactly ONE implementation of the rule behind the
 * Phase 0 exit criterion "zero invalid source ranges in final renders"
 * (tech-spec §12, PRD REQ-019). The Python indexer does not reimplement it; its
 * test suite drives this command against the committed corpus at
 * `packages/contracts/fixtures/range-check/cases.json`.
 *
 * A second implementation in a second language would mean two sets of rounding
 * rules, and the exit criterion would end up measuring whichever validator
 * happened to run. One implementation, two callers.
 *
 * Output is a single JSON document on stdout so a caller never parses prose.
 * The exit code is the verdict: 0 clean, 1 violations found. A malformed request
 * is a usage error, distinct from a clean run — "nothing to check" must never be
 * reportable as "nothing wrong".
 */

interface RangeCheckRequest {
  bounds: AssetBounds;
  ranges: SourceRange[];
}

export function rangeCheckCommand(inputPath: string): number {
  let request: RangeCheckRequest;
  try {
    request = JSON.parse(readFileSync(inputPath, 'utf8')) as RangeCheckRequest;
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({
        code: 'RANGE_CHECK_INPUT_UNREADABLE',
        message: `Could not read a range-check request from ${inputPath}: ${(err as Error).message}`,
        skill: 'range-check',
        skillVersion: '1.0.0',
      })}\n`,
    );
    return 2;
  }

  if (!request?.bounds || !Array.isArray(request.ranges)) {
    process.stderr.write(
      `${JSON.stringify({
        code: 'RANGE_CHECK_INPUT_INVALID',
        message:
          'A range-check request needs `bounds` (the asset id and its preflighted duration) and a `ranges` array. ' +
          'Refusing to report a verdict over an input that names nothing to check.',
        skill: 'range-check',
        skillVersion: '1.0.0',
      })}\n`,
    );
    return 2;
  }

  const result = checkSourceRanges(request.ranges, request.bounds);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  // An empty range list is NOT a clean run. Exit 0 here would report "nothing to
  // check" as "nothing wrong" — and since both callers read the exit code first,
  // a job that produced zero Moments would sail through the exit-criterion gate.
  // `checked` rides along in the payload for the same reason: zero violations
  // means something quite different over 40 ranges than over none.
  if (result.checked === 0) {
    process.stderr.write(
      `${JSON.stringify({
        code: 'RANGE_CHECK_NOTHING_TO_CHECK',
        message:
          'No ranges were supplied, so no bounds verdict was reached. Refusing to report a clean run over an empty set.',
        skill: 'range-check',
        skillVersion: '1.0.0',
      })}\n`,
    );
    return 2;
  }

  return result.ok ? 0 : 1;
}
