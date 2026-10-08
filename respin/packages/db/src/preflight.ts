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
import {
  assertLlmTransportRuleRefuses,
  resolveLlmTransportSelection,
  type LlmTransportEnvironment,
} from "./llm-transport-selection";

// `llm_transport_selector` (launch L2, E-30): with no environment passed (the
// CI step) it self-tests the rule against every planted refused shape; with
// the environment passed (the Next.js server's `register()`) it refuses to
// start a server that selects the e2e transport fake in a production build or
// against a database without the test marker.
//
// `auth_base_url` (audit P1-A2, register 2026-10-05 item 10): the same two
// modes. With the environment passed, a PRODUCTION server refuses to start
// unless `BETTER_AUTH_URL` is an absolute `https:` URL — when it is unset,
// Better Auth falls back to the request's Host header for the links it mails
// (password reset, email verification), so a misconfigured edge would mint
// reset links to whatever host the request named.
export const PREFLIGHT_CHECKS = [
  "brain_content_registry",
  "llm_transport_selector",
  "auth_base_url",
] as const;
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

/** The auth base URL's environment, passed IN — this module reads none itself. */
export type AuthBaseUrlEnvironment = Readonly<{
  nodeEnv: string | undefined;
  betterAuthUrl: string | undefined;
}>;

/**
 * Refuse a production server whose auth base URL is not an absolute `https:`
 * URL. Outside production nothing is required: local development and the e2e
 * journeys run on `http://localhost` by design (`e2e/journeys/README.md`).
 *
 * FAIL CLOSED WITH A WAY FORWARD (CLAUDE.md 2026-07-30): the refusal names the
 * variable and the shape that satisfies it.
 */
export function assertAuthBaseUrl(env: AuthBaseUrlEnvironment): void {
  if (env.nodeEnv !== "production") return;
  const raw = (env.betterAuthUrl ?? "").trim();
  let url: URL | null = null;
  try {
    url = raw === "" ? null : new URL(raw);
  } catch {
    url = null;
  }
  if (url === null || url.protocol !== "https:") {
    throw new Error(
      raw === ""
        ? "BETTER_AUTH_URL is unset in production; set it to this deployment's absolute https:// address (e.g. https://app.example.com)"
        : "BETTER_AUTH_URL is not an absolute https:// URL in production; set it to this deployment's https:// address"
    );
  }
  // GATE L6: an ADDRESS, nothing else. Every mailed link is built on this
  // base, so credentials in it (`https://user:pass@…`) would be mailed to
  // every recipient, and a query or fragment would be carried into every link
  // and confuse the path the library appends. The raw text is checked too:
  // `new URL` drops an empty `?` or `#`, which would otherwise pass.
  if (url.username !== "" || url.password !== "" || raw.includes("@")) {
    throw new Error("BETTER_AUTH_URL carries credentials (user:pass@); set it to the bare https:// address");
  }
  if (url.search !== "" || url.hash !== "" || raw.includes("?") || raw.includes("#")) {
    throw new Error("BETTER_AUTH_URL carries a query or a fragment; set it to the bare https:// address");
  }
}

/**
 * The rule's self-test for the CI step, which passes no environment: every
 * planted refused shape is refused and the accepted shapes pass. A rule that
 * stopped refusing would otherwise be found only by a production start.
 */
function assertAuthBaseUrlRuleRefuses(): void {
  const refused: AuthBaseUrlEnvironment[] = [
    { nodeEnv: "production", betterAuthUrl: undefined },
    { nodeEnv: "production", betterAuthUrl: "" },
    { nodeEnv: "production", betterAuthUrl: "http://app.example.com" },
    { nodeEnv: "production", betterAuthUrl: "app.example.com" },
    { nodeEnv: "production", betterAuthUrl: "/relative" },
    { nodeEnv: "production", betterAuthUrl: "https://user:pass@app.example.com" },
    { nodeEnv: "production", betterAuthUrl: "https://app.example.com/?next=x" },
    { nodeEnv: "production", betterAuthUrl: "https://app.example.com/#x" },
  ];
  for (const env of refused) {
    let threw = false;
    try {
      assertAuthBaseUrl(env);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`auth base URL rule accepted a refused shape: ${String(env.betterAuthUrl)}`);
  }
  assertAuthBaseUrl({ nodeEnv: "production", betterAuthUrl: "https://app.example.com" });
  assertAuthBaseUrl({ nodeEnv: "development", betterAuthUrl: undefined });
}

/**
 * Run every startup check. `registry` is injectable so a test can plant a
 * bad kind and watch the refusal; production passes nothing and gets the
 * shipped registry.
 */
export function runStartupPreflight(
  options: Readonly<{
    brainRegistry?: Record<string, unknown>;
    /** The server's environment, passed IN — this module reads none itself. */
    llmTransport?: LlmTransportEnvironment;
    /** The server's auth base URL and NODE_ENV, passed IN (P1-A2). */
    authBaseUrl?: AuthBaseUrlEnvironment;
  }> = {},
): PreflightReport {
  try {
    assertRegistryClosed(options.brainRegistry ?? BRAIN_CONTENT_SCHEMAS);
  } catch (cause) {
    throw new PreflightRefusedError("brain_content_registry", cause);
  }
  try {
    assertLlmTransportRuleRefuses();
    if (options.llmTransport !== undefined) {
      resolveLlmTransportSelection(options.llmTransport);
    }
  } catch (cause) {
    throw new PreflightRefusedError("llm_transport_selector", cause);
  }
  try {
    assertAuthBaseUrlRuleRefuses();
    if (options.authBaseUrl !== undefined) {
      assertAuthBaseUrl(options.authBaseUrl);
    }
  } catch (cause) {
    throw new PreflightRefusedError("auth_base_url", cause);
  }
  return { checks: PREFLIGHT_CHECKS, ok: true };
}
