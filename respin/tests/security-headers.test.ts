// P9-A7 (register 2026-10-05 item 47) — the response headers every route
// carries, asserted on the two routes the register named: `/`, and `/api/demo`,
// the public Sample Spin's endpoint (a metered run a framed page could click
// through).
//
// THE MATCH IS NEXT'S OWN. A `source` pattern this test evaluated with its own
// regex would prove the test's reading of path-to-regexp, not Next's (CLAUDE.md
// 2026-08-18: prove a property against the installed parser). So each rule
// `headers()` returns is compiled with `buildCustomRoute("header", …)` — the
// function Next's router uses to build custom header routes
// (next/dist/server/lib/router-utils/filesystem.js) — and asked whether it
// matches each path.
//
// Every clause is planted red once (CLAUDE.md 2026-08-26): deleting
// `frame-ancestors`, dropping a header, narrowing the source so a route
// escapes, and HSTS outside production.
import { describe, expect, it } from "vitest";
import { buildCustomRoute } from "next/dist/server/lib/router-utils/filesystem";
import nextConfig, { securityHeaders } from "../next.config";

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

const PATHS = ["/", "/api/demo"] as const;

/** The headers Next would attach to `path`, merged across every matching rule. */
function headersFor(rules: readonly HeaderRule[], path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of rules) {
    const route = buildCustomRoute("header", rule, undefined, false);
    if (route.match(path) === false) continue;
    for (const header of rule.headers) out.set(header.key.toLowerCase(), header.value);
  }
  return out;
}

/** What a route must carry; returns one line per missing or wrong header. */
function problems(headers: Map<string, string>, production: boolean): string[] {
  const p: string[] = [];
  const csp = headers.get("content-security-policy") ?? "";
  if (!/(^|;)\s*frame-ancestors\s+'none'\s*(;|$)/.test(csp)) p.push(`CSP lacks frame-ancestors 'none': "${csp}"`);
  if (headers.get("x-frame-options") !== "DENY") p.push("X-Frame-Options is not DENY");
  if (headers.get("x-content-type-options") !== "nosniff") p.push("X-Content-Type-Options is not nosniff");
  if (!headers.get("referrer-policy")) p.push("no Referrer-Policy");
  const hsts = headers.get("strict-transport-security");
  if (production && !/max-age=\d{7,}/.test(hsts ?? "")) p.push(`production lacks HSTS: "${hsts}"`);
  if (!production && hsts !== undefined) p.push("HSTS sent outside production");
  return p;
}

async function configuredRules(): Promise<HeaderRule[]> {
  expect(typeof nextConfig.headers).toBe("function");
  return (await nextConfig.headers!()) as HeaderRule[];
}

describe("security headers (P9-A7)", () => {
  it("next.config's headers() puts the full set on / and /api/demo", async () => {
    const rules = await configuredRules();
    expect(rules.length).toBeGreaterThan(0);
    // vitest runs with NODE_ENV=test, so the configured set is the non-production one.
    for (const path of PATHS) expect(problems(headersFor(rules, path), false), path).toEqual([]);
  });

  it("production adds HSTS; development and test do not", () => {
    const rules = (env: string): HeaderRule[] => [{ source: "/:path*", headers: securityHeaders(env) }];
    for (const path of PATHS) {
      expect(problems(headersFor(rules("production"), path), true), path).toEqual([]);
      expect(problems(headersFor(rules("development"), path), false), path).toEqual([]);
    }
  });

  it("the matcher is Next's and is not vacuous: a rule scoped elsewhere attaches nothing", () => {
    const scoped: HeaderRule[] = [{ source: "/elsewhere/:path*", headers: securityHeaders("production") }];
    for (const path of PATHS) expect(headersFor(scoped, path).size, path).toBe(0);
  });

  describe("planted variants each FAIL (lesson 2026-08-26)", () => {
    const base = (): Header[] => securityHeaders("production");
    const plant = (name: string, mutate: (h: Header[]) => Header[], source = "/:path*") =>
      [name, () => [{ source, headers: mutate(base()) }] as HeaderRule[]] as const;
    const cases = [
      plant("frame-ancestors deleted from the CSP", (h) =>
        h.map((x) => (x.key === "Content-Security-Policy" ? { ...x, value: "default-src 'self'" } : x))
      ),
      plant("the CSP header deleted", (h) => h.filter((x) => x.key !== "Content-Security-Policy")),
      plant("frame-ancestors loosened to 'self'", (h) =>
        h.map((x) => (x.key === "Content-Security-Policy" ? { ...x, value: "frame-ancestors 'self'" } : x))
      ),
      plant("X-Frame-Options deleted", (h) => h.filter((x) => x.key !== "X-Frame-Options")),
      plant("nosniff deleted", (h) => h.filter((x) => x.key !== "X-Content-Type-Options")),
      plant("Referrer-Policy deleted", (h) => h.filter((x) => x.key !== "Referrer-Policy")),
      plant("HSTS deleted", (h) => h.filter((x) => x.key !== "Strict-Transport-Security")),
      plant("the source narrowed to /app so / and /api/demo escape", (h) => h, "/app/:path*"),
    ];
    it.each(cases)("%s", (_name, rules) => {
      for (const path of PATHS) {
        expect(problems(headersFor(rules(), path), true).length, path).toBeGreaterThan(0);
      }
    });
  });
});
