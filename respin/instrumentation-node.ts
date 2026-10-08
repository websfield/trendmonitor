// The Node-only half of `instrumentation.ts` (Phase 10a plan C5, G-15). Loaded
// by `register()` through a dynamic import behind the NEXT_RUNTIME check, the
// documented Next.js shape, so the edge bundle never sees the Postgres driver
// that `@respin/db` carries.
import { runStartupPreflight } from "@respin/db";
import { telemetry } from "./lib/telemetry";

export function preflight(): void {
  // Launch L2 (E-30): the server refuses to START when the e2e transport fake
  // is selected in a production build or against a non-test database. The
  // environment is passed in; the rule itself reads none.
  //
  // Audit P1-A2: and a production server refuses to start without an absolute
  // `https:` BETTER_AUTH_URL — unset, Better Auth derives the base URL of the
  // links it mails from the request's Host header.
  runStartupPreflight({
    llmTransport: {
      selector: process.env.RESPIN_LLM_TRANSPORT,
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL,
    },
    authBaseUrl: {
      nodeEnv: process.env.NODE_ENV,
      betterAuthUrl: process.env.BETTER_AUTH_URL,
    },
  });
}

export async function captureRequestError(err: unknown, route: string | undefined): Promise<void> {
  await telemetry().captureError(err, { route });
}
