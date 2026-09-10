// The Node-only half of `instrumentation.ts` (Phase 10a plan C5, G-15). Loaded
// by `register()` through a dynamic import behind the NEXT_RUNTIME check, the
// documented Next.js shape, so the edge bundle never sees the Postgres driver
// that `@respin/db` carries.
import { runStartupPreflight } from "@respin/db";
import { telemetry } from "./lib/telemetry";

export function preflight(): void {
  runStartupPreflight();
}

export async function captureRequestError(err: unknown, route: string | undefined): Promise<void> {
  await telemetry().captureError(err, { route });
}
