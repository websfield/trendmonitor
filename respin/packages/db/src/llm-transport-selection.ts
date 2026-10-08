// WHICH LLM TRANSPORT A SERVER MAY USE (launch L2, E-30; R-151).
//
// Actual-app journeys run against a TRANSPORT-SEAM FAKE (`respin/e2e/support/
// llm-transport-fake.ts`, outside every production root) injected through the
// Anthropic adapter's `underlyingFetch`, below `pinnedFetch` — so metering,
// cost and the REQ-E01 origin pin still run on every faked call. This module is
// the ONE rule deciding whether that fake may be selected, and it is enforced
// in two places: at server startup (`runStartupPreflight`, called from
// `instrumentation-node.ts` with the process environment passed IN — this
// module reads no environment itself) and wherever the provider is built
// (`@respin/credits/app-server`).
//
// THE RULE, every refusal loud:
//   - no selector (absent or "")            -> the real transport;
//   - a selector that is not exactly the fake's name -> REFUSED (a misspelt
//     selector must never fall through to a real, paid provider while a
//     journey reports green);
//   - the fake's name in a PRODUCTION BUILD (`NODE_ENV === "production"`)
//     -> REFUSED;
//   - the fake's name against a database that does not carry the test marker
//     -> REFUSED.
//
// THE TEST-DATABASE MARKER: the database NAME in the connection URL must start
// with `respin_e2e_` or `respin_test_` — the names the e2e harness and the
// Docker suites create (`createDockerTestDb(..., "respin_test_*")`). The dev
// database (`respin`) and any production name fail it. A marker in the NAME is
// readable without a connection, so the rule can run before the pool exists.
//
// The other half of the witness is the fake's own: it answers with a sentinel
// `servedModel` every journey asserts, so a selector that was IGNORED (real
// transport used) fails the journey instead of spending money and passing.

export const LLM_TRANSPORT_SELECTOR_ENV = "RESPIN_LLM_TRANSPORT";
export const LLM_TRANSPORT_FAKE_SELECTOR = "e2e-transport-fake";
/** Where the preloaded fake installs its `fetch`. */
export const LLM_TRANSPORT_FAKE_GLOBAL = Symbol.for("respin.e2e.llmTransportFake");
/** The `servedModel` the fake answers with; journeys assert it. */
export const LLM_TRANSPORT_FAKE_SERVED_MODEL = "respin-e2e-transport-fake";
export const TEST_DATABASE_NAME_RE = /^respin_(e2e|test)_[a-z0-9_]+$/;

export type LlmTransportEnvironment = Readonly<{
  selector: string | undefined;
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
}>;

export type LlmTransportSelection = "real" | "fake";

export type LlmTransportRefusal =
  | "unknown_selector"
  | "production_build"
  | "non_test_database"
  | "fake_not_installed";

export class LlmTransportSelectionError extends Error {
  constructor(readonly reason: LlmTransportRefusal) {
    super(`llm_transport_refused:${reason}`);
    this.name = "LlmTransportSelectionError";
  }
}

/** The database NAME of a postgres URL, or `null` when it cannot be read. */
export function databaseNameOf(url: string | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/** The rule. Pure: every input is a parameter. */
export function resolveLlmTransportSelection(
  env: LlmTransportEnvironment
): LlmTransportSelection {
  const selector = env.selector;
  if (selector === undefined || selector === "") return "real";
  if (selector !== LLM_TRANSPORT_FAKE_SELECTOR) {
    throw new LlmTransportSelectionError("unknown_selector");
  }
  if (env.nodeEnv === "production") {
    throw new LlmTransportSelectionError("production_build");
  }
  const name = databaseNameOf(env.databaseUrl);
  if (name === null || !TEST_DATABASE_NAME_RE.test(name)) {
    throw new LlmTransportSelectionError("non_test_database");
  }
  return "fake";
}

/**
 * The fake's `fetch`, when — and only when — the rule selects it and the
 * harness preloaded it. `undefined` means the real transport (global fetch).
 */
export function selectedLlmUnderlyingFetch(
  env: LlmTransportEnvironment,
  globals: Record<symbol, unknown> = globalThis as unknown as Record<symbol, unknown>
): typeof fetch | undefined {
  if (resolveLlmTransportSelection(env) === "real") return undefined;
  const installed = globals[LLM_TRANSPORT_FAKE_GLOBAL];
  if (typeof installed !== "function") {
    throw new LlmTransportSelectionError("fake_not_installed");
  }
  return installed as typeof fetch;
}

/**
 * The preflight's STATIC self-test, for the no-environment run (`pnpm
 * preflight` in CI): the rule must refuse each planted shape and accept the
 * one sanctioned shape. A rule that had stopped refusing fails CI here.
 */
export function assertLlmTransportRuleRefuses(): void {
  const testDb = "postgres://u:p@localhost:5435/respin_e2e_preflight";
  const devDb = "postgres://u:p@localhost:5435/respin";
  const refused: [LlmTransportEnvironment, LlmTransportRefusal][] = [
    [{ selector: "e2e-transport-fak", nodeEnv: "development", databaseUrl: testDb }, "unknown_selector"],
    [{ selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "production", databaseUrl: testDb }, "production_build"],
    [{ selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: devDb }, "non_test_database"],
    [{ selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: undefined }, "non_test_database"],
  ];
  for (const [env, reason] of refused) {
    let got: unknown = null;
    try {
      resolveLlmTransportSelection(env);
    } catch (e) {
      got = e;
    }
    if (!(got instanceof LlmTransportSelectionError) || got.reason !== reason) {
      throw new Error(`the LLM transport rule accepted a refused shape (${reason})`);
    }
  }
  if (
    resolveLlmTransportSelection({ selector: undefined, nodeEnv: "production", databaseUrl: devDb }) !== "real" ||
    resolveLlmTransportSelection({ selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: testDb }) !== "fake"
  ) {
    throw new Error("the LLM transport rule refused a sanctioned shape");
  }
}
