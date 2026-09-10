// Phase 10a closes G-15: the brain-content registry guard used to run at
// MODULE LOAD in `brain-content.ts`, and `@respin/db`'s index pulls that
// module into every process — including the Stripe webhook route. A bad
// schema edit therefore made `@respin/db` unimportable and every Stripe
// delivery a 500, with no escape.
//
// The guard now runs HERE, explicitly, at three startup points and nowhere
// else: the CI step (`pnpm preflight`), the Next.js server's `register()` in
// `instrumentation.ts`, and the worker's `main`. A failure is a STABLE
// REFUSAL that names its code and stops the process from starting, which is
// where a registry defect belongs — before traffic, not under it. There is no
// environment variable that skips it.
import { BRAIN_CONTENT_SCHEMAS, assertRegistryClosed } from "./brain-content";

export const PREFLIGHT_CHECKS = ["brain_content_registry"] as const;
export type PreflightCheck = (typeof PREFLIGHT_CHECKS)[number];

export class PreflightRefusedError extends Error {
  readonly check: PreflightCheck;
  readonly code: `preflight_refused:${PreflightCheck}`;
  constructor(check: PreflightCheck, cause: unknown) {
    super(`preflight_refused:${check}`, { cause });
    this.name = "PreflightRefusedError";
    this.check = check;
    this.code = `preflight_refused:${check}`;
  }
}

export type PreflightReport = Readonly<{ checks: readonly PreflightCheck[]; ok: true }>;

/**
 * Run every startup check. `registry` is injectable so a test can plant a
 * bad kind and watch the refusal; production passes nothing and gets the
 * shipped registry.
 */
export function runStartupPreflight(
  options: Readonly<{ brainRegistry?: Record<string, unknown> }> = {},
): PreflightReport {
  try {
    assertRegistryClosed(options.brainRegistry ?? BRAIN_CONTENT_SCHEMAS);
  } catch (cause) {
    throw new PreflightRefusedError("brain_content_registry", cause);
  }
  return { checks: PREFLIGHT_CHECKS, ok: true };
}
