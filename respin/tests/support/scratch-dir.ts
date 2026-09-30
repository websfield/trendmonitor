import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/**
 * A throwaway directory that removes itself when the calling test finishes.
 *
 * Every source-scan test that plants a fake tree used `mkdtempSync` directly
 * and never removed it; under a runner whose `tmpdir()` resolves inside the
 * workspace (measured 2026-09-21: `respin/.tmp` held 589 leaked trees, 1,543
 * `.ts` files) the leak bloated every find/grep and forced `source-files.ts`
 * to special-case dot-directories. Call this instead of `mkdtempSync` from
 * inside a test body (or a helper a test body calls) — `onTestFinished` binds
 * the removal to the running test.
 */
export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
