// Launch L2 (E-30): the e2e LLM transport fake is selectable ONLY by its exact
// name, outside a production build, against a database whose name carries the
// test marker — and the server refuses to START otherwise. Every refused shape
// is PLANTED here and must go red; the one sanctioned shape must pass.
import { describe, expect, it } from "vitest";

import {
  LLM_TRANSPORT_FAKE_GLOBAL,
  LLM_TRANSPORT_FAKE_SELECTOR,
  LlmTransportSelectionError,
  TEST_DATABASE_NAME_RE,
  databaseNameOf,
  resolveLlmTransportSelection,
  selectedLlmUnderlyingFetch,
  type LlmTransportEnvironment,
} from "../src/llm-transport-selection";
import { PreflightRefusedError, runStartupPreflight } from "../src/preflight";

const TEST_DB = "postgres://respin:x@localhost:5435/respin_e2e_l2";
const DEV_DB = "postgres://respin:x@localhost:5435/respin";

function refusalOf(env: LlmTransportEnvironment): string {
  try {
    resolveLlmTransportSelection(env);
    return "accepted";
  } catch (e) {
    return e instanceof LlmTransportSelectionError ? e.reason : `other:${String(e)}`;
  }
}

describe("the LLM transport-selection rule", () => {
  it("no selector is the REAL transport, in every environment", () => {
    for (const nodeEnv of ["production", "development", "test", undefined]) {
      for (const databaseUrl of [DEV_DB, TEST_DB, undefined]) {
        expect(resolveLlmTransportSelection({ selector: undefined, nodeEnv, databaseUrl })).toBe("real");
        expect(resolveLlmTransportSelection({ selector: "", nodeEnv, databaseUrl })).toBe("real");
      }
    }
  });

  it.each([
    ["a misspelt selector", { selector: "e2e-transport-fak", nodeEnv: "development", databaseUrl: TEST_DB }, "unknown_selector"],
    ["a selector with different case", { selector: "E2E-TRANSPORT-FAKE", nodeEnv: "development", databaseUrl: TEST_DB }, "unknown_selector"],
    ["a selector with whitespace", { selector: ` ${LLM_TRANSPORT_FAKE_SELECTOR}`, nodeEnv: "development", databaseUrl: TEST_DB }, "unknown_selector"],
    ["the fake in a PRODUCTION build, even on a test database", { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "production", databaseUrl: TEST_DB }, "production_build"],
    ["the fake against the DEV database", { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: DEV_DB }, "non_test_database"],
    ["the fake against a name that only CONTAINS the marker", { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: "postgres://u:p@h/prod_respin_e2e_x" }, "non_test_database"],
    ["the fake with no database URL", { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "test", databaseUrl: undefined }, "non_test_database"],
    ["the fake with an unparseable URL", { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "test", databaseUrl: "not a url" }, "non_test_database"],
  ] as const)("PLANTED: %s is refused", (_label, env, reason) => {
    expect(refusalOf(env)).toBe(reason);
  });

  it("the ONE sanctioned shape selects the fake (and the Docker suites' names carry the marker)", () => {
    expect(
      resolveLlmTransportSelection({ selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: TEST_DB })
    ).toBe("fake");
    expect(TEST_DATABASE_NAME_RE.test("respin_test_genrace")).toBe(true);
    expect(TEST_DATABASE_NAME_RE.test("respin")).toBe(false);
    expect(databaseNameOf(TEST_DB)).toBe("respin_e2e_l2");
  });

  it("selected but NOT preloaded refuses rather than falling through to the real transport", () => {
    const env = { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "test", databaseUrl: TEST_DB };
    let reason = "accepted";
    try {
      selectedLlmUnderlyingFetch(env, {});
    } catch (e) {
      reason = (e as LlmTransportSelectionError).reason;
    }
    expect(reason).toBe("fake_not_installed");
    const installed = (async () => new Response("{}")) as unknown as typeof fetch;
    expect(selectedLlmUnderlyingFetch(env, { [LLM_TRANSPORT_FAKE_GLOBAL]: installed })).toBe(installed);
    // ...and with no selector, an installed fake is IGNORED: the real transport.
    expect(
      selectedLlmUnderlyingFetch({ ...env, selector: undefined }, { [LLM_TRANSPORT_FAKE_GLOBAL]: installed })
    ).toBeUndefined();
  });

  it("the server's STARTUP preflight refuses each planted shape with a stable code", () => {
    for (const env of [
      { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "production", databaseUrl: TEST_DB },
      { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: DEV_DB },
      { selector: "e2e-transport-fak", nodeEnv: "development", databaseUrl: TEST_DB },
    ]) {
      let caught: unknown;
      try {
        runStartupPreflight({ llmTransport: env });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(PreflightRefusedError);
      expect((caught as PreflightRefusedError).code).toBe("preflight_refused:llm_transport_selector");
    }
    // NON-VACUITY: the sanctioned and the absent shapes start.
    expect(runStartupPreflight({ llmTransport: { selector: LLM_TRANSPORT_FAKE_SELECTOR, nodeEnv: "development", databaseUrl: TEST_DB } }).ok).toBe(true);
    expect(runStartupPreflight({ llmTransport: { selector: undefined, nodeEnv: "production", databaseUrl: DEV_DB } }).ok).toBe(true);
  });
});
