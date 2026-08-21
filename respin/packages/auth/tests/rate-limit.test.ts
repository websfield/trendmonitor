// Audit 2026-08-17 #20 — auth rate limiting, exercised in the SHAPE that ships.
//
// The finding had two halves and both are covered here:
//  1. no `rateLimit` option was passed at all, so the app inherited Better
//     Auth's defaults — production-only, in MEMORY;
//  2. no test exercised it, so the limiter's behaviour was never executed by
//     anything before real users met it.
//
// These build the auth instance with `nodeEnv: "production"` — the same
// configuration a deploy gets — and drive the REAL `/sign-in/email` endpoint
// through `auth.handler`, because rate limiting is applied in the handler
// pipeline. Calling `auth.api.*` directly bypasses it, which is precisely the
// trap that would have made a green test meaningless.
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTestDb, type TestDb } from "../../db/src/testing";
import {
  createAuth,
  NO_TRUSTED_PROXIES,
  rateLimitEnabled,
  resolveTrustedProxies,
  TrustedProxiesConfigError,
} from "../src/create-auth";

const BASE = "http://localhost:3000";

function mkAuth(db: TestDb, nodeEnv: string, trustedProxiesEnv?: string) {
  return createAuth(db, {
    nodeEnv,
    secret: "test-secret-not-a-real-one",
    baseURL: BASE,
    // Every case below sends a SINGLE-value `x-forwarded-for`, which is the
    // one shape better-auth trusts with no proxies configured — so the
    // deliberate opt-out is the honest setting for them, and passing it
    // explicitly is the R-26 policy working as intended rather than a
    // workaround for it. The two-hop cases pass a real list.
    trustedProxiesEnv: trustedProxiesEnv ?? NO_TRUSTED_PROXIES,
  });
}

/** One real POST whose forwarded chain has TWO hops: client, then the proxy. */
async function twoHopSignIn(
  auth: ReturnType<typeof createAuth>,
  clientIp: string,
  proxyIp: string
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `${clientIp}, ${proxyIp}`,
      },
      body: JSON.stringify({
        email: "nobody@test.dev",
        password: "wrong-password-on-purpose",
      }),
    })
  );
}

/** One real POST through the handler, from a fixed client IP. */
async function signInAttempt(
  auth: ReturnType<typeof createAuth>,
  ip: string,
  email = "nobody@test.dev"
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The limiter keys on client IP; without this every request in a test
        // process shares one anonymous key and the cases below could not tell
        // "limited per client" from "limited globally".
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password: "wrong-password-on-purpose" }),
    })
  );
}

describe("audit #20: the sign-in limiter is CONFIGURED and it actually fires", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("refuses the 6th sign-in attempt inside the window with 429", async () => {
    const auth = mkAuth(db, "production");
    const ip = "203.0.113.10";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await signInAttempt(auth, ip)).status);
    }
    // The first five are ordinary credential failures (401) — the limiter is
    // not swallowing real traffic. The sixth is refused by the limiter.
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5], `statuses were ${statuses.join(",")}`).toBe(429);
  });

  it("limits PER CLIENT — a second IP is not punished for the first one's spray", async () => {
    const auth = mkAuth(db, "production");
    const attacker = "203.0.113.20";
    for (let i = 0; i < 6; i += 1) await signInAttempt(auth, attacker);
    expect((await signInAttempt(auth, attacker)).status).toBe(429);
    // A different creator, signing in for the first time, must still get through.
    const bystander = await signInAttempt(auth, "203.0.113.21");
    expect(bystander.status).not.toBe(429);
  });

  it("the counter survives rebuilding the auth instance against the same database", async () => {
    // WHAT THIS PROVES, precisely: the limit is not bound to one `betterAuth`
    // instance. It does NOT prove durability on its own — verified by mutation,
    // this case still passes with `storage: "memory"`, because that store is
    // process-wide and both instances live in this process. The durability
    // claim is carried by the next case (rows in `rate_limit`), which DOES go
    // red under that mutation. Kept because instance-independence is worth
    // pinning and because saying which half each case proves is cheaper than
    // discovering later that neither did.
    const ip = "203.0.113.30";
    const first = mkAuth(db, "production");
    for (let i = 0; i < 6; i += 1) await signInAttempt(first, ip);
    expect((await signInAttempt(first, ip)).status).toBe(429);

    const rebuilt = mkAuth(db, "production");
    expect(
      (await signInAttempt(rebuilt, ip)).status,
      "a restart must not hand an attacker a fresh allowance"
    ).toBe(429);
  });

  it("writes its counters to the rate_limit TABLE, not to process memory", async () => {
    const auth = mkAuth(db, "production");
    await signInAttempt(auth, "203.0.113.40");
    const rows = (await db.execute(
      "select key, count from rate_limit"
    )) as unknown as { rows: { key: string; count: number }[] };
    // The table exists, the adapter resolved it, and something was written —
    // the three things `storage: "database"` needs and that a missing table
    // would have failed at RUNTIME rather than at compile time.
    expect(rows.rows.length).toBeGreaterThan(0);
  });

  it("NON-VACUITY: under NODE_ENV=test the limiter is off, deliberately and by name", async () => {
    expect(rateLimitEnabled("test")).toBe(false);
    expect(rateLimitEnabled("production")).toBe(true);
    expect(rateLimitEnabled("development")).toBe(true);
    expect(rateLimitEnabled(undefined)).toBe(true);
    // …and the suites' own environment really does get the off setting, which
    // is why every OTHER test in this repo can sign in freely.
    const auth = mkAuth(db, "test");
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await signInAttempt(auth, "203.0.113.50")).status);
    }
    expect(statuses.includes(429)).toBe(false);
  });
});

// ===== R-26, enforced: the trusted-proxy policy and the two-hop keying =====

describe("R-26: production must CHOOSE a trusted-proxy posture", () => {
  /**
   * R-26 recorded this as a first-deploy blocker in a decision document and
   * nothing enforced it. Audit #21's constraint got a tripwire for exactly this
   * reason; the rule that can lock every creator out of sign-in got prose.
   */
  it("production with the variable UNSET refuses to build, naming both ways forward", () => {
    expect(() => resolveTrustedProxies("production", undefined)).toThrow(
      TrustedProxiesConfigError
    );
    let message = "";
    try {
      resolveTrustedProxies("production", "");
    } catch (e) {
      message = (e as Error).message;
    }
    // Fail closed, but never without a way forward (CLAUDE.md 2026-07-30):
    // the refusal has to print the remedy, not just the diagnosis.
    expect(message).toContain("RESPIN_TRUSTED_PROXIES=none");
    expect(message).toContain("10.0.0.0/8");
  });

  it("the opt-out is accepted, and it is a TYPED choice — not the same as unset", () => {
    expect(resolveTrustedProxies("production", NO_TRUSTED_PROXIES)).toBeUndefined();
    expect(() => resolveTrustedProxies("production", undefined)).toThrow();
  });

  it("a real list is parsed; a MALFORMED entry is refused rather than silently dropped", () => {
    expect(resolveTrustedProxies("production", "10.0.0.0/8, 172.31.0.0/16")).toEqual([
      "10.0.0.0/8",
      "172.31.0.0/16",
    ]);
    // Better Auth drops an unparseable entry from the list without a word, so a
    // typo would degrade to the shared-bucket state while LOOKING configured —
    // a guard claiming more than it enforces.
    expect(() =>
      resolveTrustedProxies("production", "10.0.0.0/8, not-an-address")
    ).toThrow(TrustedProxiesConfigError);
    expect(() => resolveTrustedProxies("production", ",  ,")).toThrow(
      TrustedProxiesConfigError
    );
  });

  /**
   * The one-directional property `isWellFormedProxy` promises: anything we
   * accept, Better Auth accepts. Measured against the INSTALLED parser, so the
   * two cannot drift apart silently.
   *
   * GENERATIVE, not a hand-picked list — and that distinction is the finding.
   * The first version of this test pinned 18 chosen strings, the guard was
   * fixed until those 18 passed, and the tenancy gate then found NINE more
   * over-accepts in classes nobody had listed (zero-padded IPv4 like
   * `010.000.000.000/8`, and IPv6 group-count errors like `1:2` and `:1`). One
   * of them reproduced the shared-bucket outage end-to-end from a value a human
   * would plausibly type. That is this repo's 2026-07-30 lesson in its failing
   * form: fix the CLASS, not the named instances — "grep every sibling id" is
   * the version of this rule that already failed once.
   *
   * So the corpus is built by permutation. It is the class.
   */
  it("VALIDATOR DIRECTION: everything we accept, Better Auth also accepts", async () => {
    // Resolved through better-auth's OWN dependency tree, so this is the very
    // instance the running app uses — not a second copy that could differ.
    // `@better-auth/core` is deliberately not a dependency of this package
    // (declaring it made pnpm materialise a second instance), so the test
    // reaches the real one rather than pretending it owns it.
    const require0 = createRequire(import.meta.url);
    const baMain = require0.resolve("better-auth");
    const nmRoot = baMain.slice(
      0,
      baMain.lastIndexOf("node_modules") + "node_modules".length
    );
    const ipModule = pathToFileURL(
      join(nmRoot, "@better-auth", "core", "dist", "utils", "ip.mjs")
    ).href;
    const { findInvalidTrustedProxies } = (await import(
      /* @vite-ignore */ ipModule
    )) as { findInvalidTrustedProxies: (e: string[]) => string[] };

    const corpus: string[] = [];

    // --- IPv4: octet shapes crossed into all four positions ---------------
    const octets = [
      "0", "1", "10", "255", "256", "999",
      "01", "001", "010", "0001", "00", "", "1a", "-1", "1.2",
    ];
    for (const o of octets) {
      corpus.push(`${o}.0.0.0`, `10.${o}.0.0`, `10.0.0.${o}`);
      corpus.push(`${o}.${o}.${o}.${o}`);
    }
    for (const n of [1, 2, 3, 5, 6]) corpus.push(Array(n).fill("10").join("."));

    // --- IPv6: group counts, elision placement, group shapes --------------
    const groups = ["1", "abcd", "ABCD", "0", "12345", "gggg", ""];
    for (let n = 0; n <= 10; n += 1) {
      const full = Array(n).fill("1").join(":");
      corpus.push(full, `::${full}`, `${full}::`, `${full}::1`, `1::${full}`);
    }
    for (const g of groups) {
      corpus.push(`${g}:2:3:4:5:6:7:8`, `1:2:3:4:5:6:7:${g}`, `${g}::1`, `::${g}`);
    }
    corpus.push(":", "::", ":::", "::::", ":1", "1:", ":1:", "1::2::3");
    corpus.push("::ffff:192.0.2.1", "::ffff:1.2.3", "fe80::1%eth0");

    // --- prefixes crossed onto a valid v4 and a valid v6 base -------------
    const prefixes = [
      "0", "1", "8", "24", "32", "33", "64", "128", "129", "255", "999",
      "01", "008", "", "-1", "8a", "1.5", " 8",
    ];
    for (const pfx of prefixes) corpus.push(`10.0.0.0/${pfx}`, `2001:db8::/${pfx}`);
    // ...and prefixes crossed onto MALFORMED bases, since a bad base with a
    // good prefix is exactly the `010.000.000.000/8` shape that got through.
    for (const o of octets) {
      for (const pfx of ["8", "24", "32", "0"]) {
        corpus.push(`${o}.0.0.0/${pfx}`, `10.0.0.${o}/${pfx}`);
      }
    }
    for (const g of groups) {
      for (const pfx of ["64", "128", "0"]) corpus.push(`${g}::1/${pfx}`);
    }

    // --- known-good anchors, so the test cannot pass by rejecting all -----
    const definitelyValid = [
      "10.0.0.0/8", "172.31.0.0/16", "192.168.1.1", "203.0.113.7/32",
      "::1", "2001:db8::/32", "fe80::1", "1:2:3:4:5:6:7:8",
    ];
    corpus.push(...definitelyValid);

    const overAccepts: string[] = [];
    let acceptedCount = 0;
    for (const c of corpus) {
      let weAccept = true;
      try {
        resolveTrustedProxies("production", c);
      } catch {
        weAccept = false;
      }
      if (!weAccept) continue;
      acceptedCount += 1;
      // `resolveTrustedProxies` splits on comma, so a value containing one is
      // not a single entry; the corpus deliberately contains none.
      if (findInvalidTrustedProxies([c]).length > 0) overAccepts.push(c);
    }

    expect(
      overAccepts,
      `these values pass our guard but Better Auth DROPS them, which empties the trusted list and returns every tenant to one shared rate-limit bucket: ${overAccepts.join(", ")}`
    ).toEqual([]);

    // NON-VACUITY, two ways: the corpus is large, and the guard is not simply
    // refusing everything (which would satisfy the assertion above trivially).
    expect(corpus.length).toBeGreaterThan(300);
    expect(acceptedCount).toBeGreaterThan(20);
    for (const v of definitelyValid) {
      expect(() => resolveTrustedProxies("production", v), v).not.toThrow();
    }
  });

  it("rejects an ALL-MATCHING range — it parses fine and resolves no client at all", () => {
    // `getIPFromHeader` walks right-to-left and returns null when every hop is
    // trusted, so `0.0.0.0/0` reproduces the shared bucket from a valid value.
    expect(() => resolveTrustedProxies("production", "0.0.0.0/0")).toThrow(
      TrustedProxiesConfigError
    );
    expect(() =>
      resolveTrustedProxies("production", "10.0.0.0/8,0.0.0.0/0")
    ).toThrow(TrustedProxiesConfigError);
  });

  it("STAGING and an unset NODE_ENV must choose too — they get no localhost fallback", () => {
    // The gap in the first version: it keyed on the literal "production", but
    // Better Auth's fallback covers only dev/test, so staging ran the limiter
    // with no resolvable IP and no refusal.
    expect(() => resolveTrustedProxies("staging", undefined)).toThrow(
      TrustedProxiesConfigError
    );
    expect(() => resolveTrustedProxies(undefined, undefined)).toThrow(
      TrustedProxiesConfigError
    );
    expect(() => resolveTrustedProxies("preview", undefined)).toThrow(
      TrustedProxiesConfigError
    );
  });

  it("NON-VACUITY: development and test are not blocked — there is no proxy to name", () => {
    expect(resolveTrustedProxies("development", undefined)).toBeUndefined();
    expect(resolveTrustedProxies("dev", undefined)).toBeUndefined();
    expect(resolveTrustedProxies("test", undefined)).toBeUndefined();
  });
});

describe("R-26: behind a TWO-HOP proxy the limiter still keys per client", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  /**
   * The case R-26 says the suite lacked: "The current test suite proves
   * per-client limiting only for the single-hop header it sends."
   */
  it("two clients behind one trusted proxy do NOT share a bucket", async () => {
    const proxy = "10.0.0.7";
    const auth = mkAuth(db, "production", "10.0.0.0/8");

    // Client A spends the whole 5-per-minute sign-in allowance.
    for (let i = 0; i < 6; i += 1) await twoHopSignIn(auth, "203.0.113.60", proxy);
    expect((await twoHopSignIn(auth, "203.0.113.60", proxy)).status).toBe(429);

    // Client B, arriving through the same proxy, must be unaffected. This is
    // the whole finding: with trustedProxies unset the chain resolves to no
    // per-client IP, both clients collapse onto ONE key, and one client locks
    // out everybody. IN PRODUCTION that shared key is `no-trusted-ip|<path>`;
    // in THIS process it is `127.0.0.1|<path>`, because Better Auth reads the
    // real `process.env` for its dev/test detection. The tenancy consequence is
    // identical either way — see "names the key it actually shares" below,
    // which asserts which one this suite really produces rather than letting
    // this comment imply production's.
    expect(
      (await twoHopSignIn(auth, "198.51.100.61", proxy)).status,
      "a second client behind the same proxy must have its own allowance"
    ).not.toBe(429);
  });

  it("MUTATION GUARD: with no trusted proxies the same two clients DO share one bucket", async () => {
    const proxy = "10.0.0.7";
    // The pre-R-26 configuration, stated explicitly so the case above cannot
    // pass vacuously — the two clients collapse onto ONE key and the second is
    // punished for the first's spray.
    const auth = mkAuth(db, "production", NO_TRUSTED_PROXIES);

    for (let i = 0; i < 6; i += 1) await twoHopSignIn(auth, "203.0.113.70", proxy);
    expect(
      (await twoHopSignIn(auth, "198.51.100.71", proxy)).status,
      "an untrusted two-hop chain collapses every client onto one shared key"
    ).toBe(429);
  });

  /**
   * HONESTY BOUND on the case above (tenancy gate, 2026-08-18).
   *
   * The first version of this suite claimed the collapse key is
   * `no-trusted-ip|/sign-in/email`. It is not, in THIS process: Better Auth
   * reads the real `process.env` for its dev/test detection, not our injected
   * `opts.nodeEnv`, so under `NODE_ENV=test` an unresolvable chain falls back to
   * 127.0.0.1 and both clients collapse onto THAT key instead.
   *
   * The tenancy conclusion is identical and is what the guard above asserts —
   * two clients, one bucket. The *mechanism* differs from production's, and a
   * test cannot reach production's from a test process. Asserting the key makes
   * the difference visible instead of letting a comment claim otherwise.
   */
  it("names the key it actually shares, rather than the one production would", async () => {
    const auth = mkAuth(db, "production", NO_TRUSTED_PROXIES);
    await twoHopSignIn(auth, "203.0.113.80", "10.0.0.7");
    const rows = (await db.execute(
      "select key from rate_limit"
    )) as unknown as { rows: { key: string }[] };
    const keys = rows.rows.map((r) => r.key);
    // Under NODE_ENV=test the fallback is localhost, NOT `no-trusted-ip`.
    expect(keys.some((k) => k.startsWith("127.0.0.1|"))).toBe(true);
    expect(keys.some((k) => k.startsWith("no-trusted-ip|"))).toBe(false);
  });
});
