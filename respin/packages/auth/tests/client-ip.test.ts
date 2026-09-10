// The client-IP authority's two promises, driven against the INSTALLED Better
// Auth (tenancy gate round 1, CHANGE 1: the docstring had claimed "never a
// guess from an untrusted header", which is false under the `none` opt-out).
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalClientIp, proxyAttestedClientIp } from "../src/client-ip";

function headers(forwardedFor?: string): Headers {
  const h = new Headers();
  if (forwardedFor !== undefined) h.set("x-forwarded-for", forwardedFor);
  return h;
}

// `staging`: not a Better Auth local environment, so there is no localhost
// fallback and the proxy setting alone decides (create-auth.ts, 2026-08-18).
function staging(trustedProxies: string): void {
  vi.stubEnv("NODE_ENV", "staging");
  vi.stubEnv("RESPIN_TRUSTED_PROXIES", trustedProxies);
}

describe("the client-IP authority", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("under the `none` opt-out Better Auth trusts a single-value header a VISITOR can type — the fact the old docstring denied", () => {
    staging("none");
    expect(canonicalClientIp(headers("203.0.113.9"))).toBe("203.0.113.9");
    // A multi-entry header is trusted for NOTHING under `none` (Better Auth
    // falls back to localhost in its local environments, which vitest is).
    expect(canonicalClientIp(headers("203.0.113.9, 198.51.100.1"))).not.toMatch(/^(203\.0\.113\.9|198\.51\.100\.1)$/);
    expect(canonicalClientIp(headers())).not.toBe("203.0.113.9");
  });

  it("the attested address is NULL under `none` whatever the header says: the Sample Spin falls to its shared bucket", () => {
    staging("none");
    expect(proxyAttestedClientIp(headers("203.0.113.9"))).toBeNull();
    expect(proxyAttestedClientIp(headers("203.0.113.9, 198.51.100.1"))).toBeNull();
    expect(proxyAttestedClientIp(headers())).toBeNull();
  });

  it("NON-VACUITY: behind a configured trusted proxy the attested address is the hop before the proxy, and both authorities agree", () => {
    staging("10.0.0.0/8");
    const chain = headers("203.0.113.9, 10.1.2.3");
    expect(proxyAttestedClientIp(chain)).toBe("203.0.113.9");
    expect(canonicalClientIp(chain)).toBe("203.0.113.9");
    // A spoofed prefix is ignored: the proxy APPENDS the peer it saw, and the
    // rightmost untrusted entry is what both authorities return.
    expect(proxyAttestedClientIp(headers("1.2.3.4, 203.0.113.9, 10.1.2.3"))).toBe("203.0.113.9");
    // THE ASSUMPTION, VISIBLE: a single-value header with no trusted hop is
    // still returned — Better Auth cannot see the socket peer, so the origin
    // must accept traffic only from the listed proxies (R-26).
    expect(proxyAttestedClientIp(headers("203.0.113.9"))).toBe("203.0.113.9");
    // No header: nothing a visitor chose (localhost is Better Auth's own
    // local-environment fallback, never a header value).
    expect(proxyAttestedClientIp(headers())).not.toMatch(/^(203|198|1)\./);
  });
});
