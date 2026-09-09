// Phase 10b-1 rollout: deletion REQUEST creation is a per-scope deployment
// flag, separate from the worker's erasure flag, and cancellation is never
// gated. The app facade (`respinDb.request*Deletion`) asserts it; the source
// witness for those three call sites lives in tests/import-boundary.test.ts.
import { describe, expect, it } from "vitest";

import {
  assertDeletionRequestsEnabled,
  DELETION_REQUEST_SCOPES_ENV,
  DELETION_SCOPES,
  parseDeletionScopeList,
  REQUESTS_DISABLED_CODE,
  resolveDeletionRequestEnablement,
} from "../src/deletion-request-enablement";

describe("deletion request enablement", () => {
  it("opens NO scope when unset or blank — the launch state", () => {
    for (const env of [{}, { [DELETION_REQUEST_SCOPES_ENV]: "" }, { [DELETION_REQUEST_SCOPES_ENV]: "   " }]) {
      const enablement = resolveDeletionRequestEnablement(env);
      for (const scope of DELETION_SCOPES) {
        expect(enablement.requestsEnabled(scope), scope).toBe(false);
        expect(() => assertDeletionRequestsEnabled(enablement, scope)).toThrow(
          `deletion_refused:${REQUESTS_DISABLED_CODE}:${scope}`
        );
      }
    }
  });

  it("opens exactly the named scopes, tolerating spaces, and refuses an unknown token", () => {
    const enablement = resolveDeletionRequestEnablement({ [DELETION_REQUEST_SCOPES_ENV]: " identity , workspace " });
    expect(enablement.requestsEnabled("identity")).toBe(true);
    expect(enablement.requestsEnabled("workspace")).toBe(true);
    expect(enablement.requestsEnabled("profile")).toBe(false);
    expect(() => assertDeletionRequestsEnabled(enablement, "identity")).not.toThrow();
    expect(() => assertDeletionRequestsEnabled(enablement, "profile")).toThrow(
      `deletion_refused:${REQUESTS_DISABLED_CODE}:profile`
    );
    expect(() => resolveDeletionRequestEnablement({ [DELETION_REQUEST_SCOPES_ENV]: "identity,everything" })).toThrow(
      /RESPIN_DELETION_REQUEST_SCOPES names an unknown scope; allowed: identity,profile,workspace/
    );
  });

  it("the shared parser names the env var it was given, so the worker's flag reports as itself", () => {
    expect(() => parseDeletionScopeList("nope", "RESPIN_DELETION_ERASURE_SCOPES")).toThrow(
      /^RESPIN_DELETION_ERASURE_SCOPES names an unknown scope/
    );
    expect([...parseDeletionScopeList("workspace,identity", "X")].sort()).toEqual(["identity", "workspace"]);
  });
});
