import type { NextConfig } from "next";

/**
 * The response headers every route carries (R-155, register 2026-10-05 item
 * 47). Before this there were none, so the public Sample Spin — a metered run
 * any visitor can start — could be framed by another site and clicked through.
 *
 * WHAT THE CSP IS AND IS NOT. It carries `frame-ancestors 'none'` and nothing
 * else: an anti-framing policy, not a script policy. A `script-src` would need
 * per-request nonces wired through Next's inline runtime, which this change
 * does not build, and a CSP that breaks hydration is worse than none.
 * `X-Frame-Options: DENY` says the same thing to browsers that predate
 * `frame-ancestors`.
 *
 * HSTS ONLY IN PRODUCTION. `next dev` serves plain http on localhost, and a
 * browser that once saw HSTS for localhost refuses http there for a year.
 * Neither the subdomains directive nor preload is sent: both commit every
 * subdomain of a domain this repository has not chosen yet (todos.md T-23
 * records the deploy shape).
 *
 * `tests/security-headers.test.ts` asserts the set on `/` and `/api/demo`
 * through Next's own route matcher, with planted deletions.
 */
export function securityHeaders(
  nodeEnv: string | undefined = process.env.NODE_ENV
): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    ...(nodeEnv === "production"
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  // Workspace packages ship TS source; Next transpiles them.
  transpilePackages: ["@respin/db", "@respin/auth"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  // Slice 2b-c (R14, docs/plans/respin-finish-phase-2b.md): /admin/margin
  // shipped in slice 2b under a name this project has been burned by before
  // — the page renders COST, never margin (R15). Renamed to
  // /admin/model-spend rather than left to 404: `redirects()` is Next's own
  // mechanism for exactly this, applied at the routing layer before any page
  // component runs, so no stub page (and no duplicate `requireAdmin` gate)
  // is needed at the old path. `permanent: false` (a 307) rather than a 308:
  // this is one deliberate rename, not a settled public contract, and an
  // operator's browser/bookmark cache should re-check it rather than pin it
  // forever the way a 308 would.
  async redirects() {
    return [
      {
        source: "/admin/margin",
        destination: "/admin/model-spend",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
