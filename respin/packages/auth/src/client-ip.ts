// The client-IP authority the public Sample Spin buckets under (Phase 10a;
// tenancy gate round 1, CHANGE 1). Two exports, two honest promises:
//
//  - `canonicalClientIp` is Better Auth's own resolution, shared with the
//    sign-in limiter and the R-118 recovery limits. Under a real trusted-proxy
//    list it walks `x-forwarded-for` from the right past the trusted hops.
//    Under the `RESPIN_TRUSTED_PROXIES=none` opt-out Better Auth trusts a
//    SINGLE-value `x-forwarded-for` as the client's own claim (measured against
//    the installed @better-auth/core `getIPFromHeader`: a one-entry header is
//    returned as-is, a multi-entry one is `null`). That is the right call for
//    a per-account rate limit on a single-hop deployment; it is NOT an abuse
//    boundary a visitor cannot move.
//  - `proxyAttestedClientIp` is the address only when a trusted-proxy list is
//    configured, and `null` otherwise — the fail-closed shared bucket. It
//    reads headers, never the socket peer, so "attested" assumes the R-26
//    precondition the sign-in limiter already carries: the origin accepts
//    traffic ONLY from the listed proxies. A request that reaches the origin
//    without passing them is trusted as if it had (pinned in the test).
//    The public Sample Spin buckets under this one, so a deployment with no
//    trusted proxy admits one visitor product-wide per window instead of one
//    per header a visitor typed.
import { getIp } from "better-auth/api";
import { resolveTrustedProxies } from "./create-auth";

function trustedProxies(): string[] | undefined {
  return resolveTrustedProxies(process.env.NODE_ENV, process.env.RESPIN_TRUSTED_PROXIES);
}

/** Better Auth's resolution of the request's client address; `null` when it has none. */
export function canonicalClientIp(requestHeaders: Headers): string | null {
  return getIp(requestHeaders, { advanced: { ipAddress: { trustedProxies: trustedProxies() } } }) ?? null;
}

/**
 * The client address only when a configured trusted proxy attested it. With
 * no trusted-proxy list (the `none` opt-out, or a local environment with none
 * set) this is `null` regardless of any header: nothing a visitor sends can
 * choose their own bucket.
 */
export function proxyAttestedClientIp(requestHeaders: Headers): string | null {
  const proxies = trustedProxies();
  if (proxies === undefined || proxies.length === 0) return null;
  return getIp(requestHeaders, { advanced: { ipAddress: { trustedProxies: proxies } } }) ?? null;
}
