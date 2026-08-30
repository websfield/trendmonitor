import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TS source; Next transpiles them.
  transpilePackages: ["@respin/db", "@respin/auth"],
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
