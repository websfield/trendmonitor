// R-166 (gate M5 and the security Low): the two Google re-authentication
// routes answer a server-side `rate_limited` refusal with a real 429, and log
// only a code from the flow's closed list — never an exception message.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class GoogleReauthenticationRefused extends Error {
    constructor(public readonly code: string) {
      super(`google_reauthentication_refused:${code}`);
    }
  }
  return {
    GoogleReauthenticationRefused,
    requireUser: vi.fn(),
    begin: vi.fn(),
    complete: vi.fn(),
    logRefusal: vi.fn(() => "unknown"),
  };
});

vi.mock("@respin/auth", () => ({
  requireUser: mocks.requireUser,
  beginGoogleReauthenticationForCurrentSession: mocks.begin,
  completeGoogleReauthenticationForCurrentSession: mocks.complete,
  // The real mapping's contract: the refusal's own code, else `unlisted`.
  googleReauthLogCode: (error: unknown) =>
    error instanceof mocks.GoogleReauthenticationRefused ? error.code : "unlisted",
}));
vi.mock("../app/(product)/safe-log", () => ({ logRefusal: mocks.logRefusal }));

import { GET as start } from "../app/api/reauth/google/start/route";
import { GET as callback } from "../app/api/reauth/google/callback/route";
import { GOOGLE_REAUTH_TOO_MANY_BODY } from "../app/api/reauth/google/too-many";

const CALLBACK_URL = "https://app.example/api/reauth/google/callback?state=s.m&code=c";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "u", email: "u@example.test", name: "U" });
});

describe("the Google re-authentication routes", () => {
  it("start: rate_limited is a 429 with the fixed body, and the log carries only the code", async () => {
    mocks.begin.mockRejectedValue(new mocks.GoogleReauthenticationRefused("rate_limited"));
    const response = await start();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(GOOGLE_REAUTH_TOO_MANY_BODY);
    expect(mocks.logRefusal).toHaveBeenCalledWith(
      "[google-reauth] start refused",
      expect.anything(),
      { refusal: "rate_limited" }
    );
  });

  it("callback: rate_limited is a 429; any other refusal still redirects to billing", async () => {
    mocks.complete.mockRejectedValueOnce(new mocks.GoogleReauthenticationRefused("rate_limited"));
    expect((await callback(new Request(CALLBACK_URL))).status).toBe(429);
    mocks.complete.mockRejectedValueOnce(new mocks.GoogleReauthenticationRefused("stamp_sub_mismatch"));
    const refused = await callback(new Request(CALLBACK_URL));
    expect(refused.status).toBe(303);
    expect(refused.headers.get("Location")).toBe("/settings/billing?e=billing_reauthentication");
    expect(mocks.logRefusal).toHaveBeenLastCalledWith(
      "[google-reauth] callback refused",
      expect.anything(),
      { refusal: "stamp_sub_mismatch" }
    );
  });

  it("a foreign error logs `unlisted`, never its message", async () => {
    mocks.begin.mockRejectedValue(new Error("Failed query: params: secret-value"));
    const response = await start();
    expect(response.status).toBe(303);
    expect(mocks.logRefusal).toHaveBeenCalledWith("[google-reauth] start refused", expect.anything(), {
      refusal: "unlisted",
    });
  });
});
