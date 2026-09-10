// `pnpm preflight` — the CI/startup preflight (Phase 10a closes G-15).
// Runs every startup check `@respin/db` exports and exits non-zero with the
// stable refusal code. No database, no network, no environment: a registry
// defect is a fact about the code and is caught here before a deploy.
import { PreflightRefusedError, runStartupPreflight } from "@respin/db";

export function main(): number {
  try {
    const report = runStartupPreflight();
    console.log(`preflight ok: ${report.checks.join(", ")}`);
    return 0;
  } catch (error) {
    if (error instanceof PreflightRefusedError) {
      console.error(error.code);
      return 1;
    }
    console.error(`preflight_failed:${error instanceof Error ? error.name : "unknown"}`);
    return 1;
  }
}

if (process.argv[1] && /preflight\.ts$/.test(process.argv[1])) {
  process.exitCode = main();
}
