import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DbLike } from "@respin/db";

export type CreateAuthOptions = {
  baseURL?: string;
  secret?: string;
  /**
   * Injected so a test can build the auth instance for a NAMED environment
   * rather than mutating `process.env` (audit 2026-08-17 #20). Defaults to the
   * real `process.env.NODE_ENV`.
   */
  nodeEnv?: string;
  /**
   * Injected for the same reason as `nodeEnv`, so the production policy can be
   * driven from a test without mutating the real environment. Defaults to
   * `process.env.RESPIN_TRUSTED_PROXIES`.
   */
  trustedProxiesEnv?: string;
};

/** The deliberate opt-out token. Spelled out so it cannot be a typo. */
export const NO_TRUSTED_PROXIES = "none";

/**
 * R-26's first-deploy blocker, ENFORCED instead of written down.
 *
 * R-26 records the hazard exactly and correctly: with
 * `advanced.ipAddress.trustedProxies` unset, better-auth's `getIPFromHeader`
 * trusts only a SINGLE-value forwarded header and returns null for a chain with
 * more than one hop, after which the limiter keys every request as
 * `no-trusted-ip|<path>` (verified in the installed @better-auth/core 1.6.28
 * `utils/ip.mjs` and `api/rate-limiter/index.mjs`). Behind a two-hop proxy that
 * is ONE shared 5-per-minute sign-in bucket for every tenant, and any client
 * can lock the whole product out of sign-in by spending it.
 *
 * R-26 then left it unset, and that judgement is right: the correct value is
 * the deployment's real proxy addresses, and a wrong one lets a client spoof
 * its own IP and evade the limiter entirely. Guessing would be worse.
 *
 * What was missing is that the constraint lived ONLY in a decision document.
 * This project already knows that is not enough — audit #21's no-new-reader
 * rule got a source-scanning tripwire for exactly this reason ("a constraint
 * that lives only in a decision document is a constraint the next milestone
 * breaks by accident"). The retention rule got a test; the one that can lock
 * every creator out of sign-in got a paragraph. This closes that asymmetry.
 *
 * WHAT IT ACTUALLY DOES, stated precisely because the first version of this
 * comment overclaimed: `getAuth()` is lazy (server.ts), so an unset variable
 * does not stop the process — static pages still render and a health check on
 * one still passes. It refuses **every auth request**, as a 500, from the first
 * one onward. Fail-closed, but a deploy can go green and the failure appear
 * only when somebody tries to sign in. Calling `getAuth()` at server start
 * would make it a true boot failure; that is a deployment-shape decision and is
 * recorded in R-27 rather than guessed at here.
 *
 * Fail closed, but never without a way forward (CLAUDE.md, 2026-07-30) — there
 * are two, and the refusal prints both:
 *
 *   RESPIN_TRUSTED_PROXIES=10.0.0.0/8,172.31.0.0/16   the real proxy hops
 *   RESPIN_TRUSTED_PROXIES=none                       deliberate opt-out
 *
 * The opt-out exists so a single-hop deployment is not blocked by a rule aimed
 * at a multi-hop one — but it must be TYPED, so it is a decision on the record
 * rather than an inherited default. That is the same distinction #20 drew
 * about `enabled`.
 *
 * Entries are validated, not just counted. Better Auth DROPS an entry it cannot
 * parse — it does warn (`create-context.mjs` calls `findInvalidTrustedProxies`,
 * and the limiter logs once when no IP resolves), but a start-up warning in a
 * log nobody is reading is not a control, and the resulting state is a silent
 * cross-tenant outage. See `isWellFormedProxy` for the one-directional rule
 * that keeps this guard from claiming more than it enforces.
 */
/**
 * Named for the CLASS of fault, not one instance of it (tenancy gate NOTE): it
 * is thrown for an UNSET variable, an empty list, and a malformed or
 * operationally useless entry alike. `…UnsetError` described only the first and
 * read as the wrong diagnosis for the other three.
 */
export class TrustedProxiesConfigError extends Error {
  constructor(detail: string) {
    super(
      `RESPIN_TRUSTED_PROXIES ${detail}. Auth did not start. Better Auth resolves a client IP from \`x-forwarded-for\`, and with no trusted proxies it trusts ONLY a single-value header — behind a two-hop proxy every request falls back to one shared rate-limit bucket, so a single client can exhaust the 5-per-minute sign-in limit for every creator at once (R-26). Set ONE of:
  RESPIN_TRUSTED_PROXIES=10.0.0.0/8,172.31.0.0/16   # the deployment's REAL proxy addresses or CIDRs, nearest hop last
  RESPIN_TRUSTED_PROXIES=none                       # deliberate opt-out: single-hop deployment, header trusted as-is
Do not guess the addresses — a wrong value lets a client spoof its own IP and evade the limiter entirely.`
    );
    this.name = "TrustedProxiesConfigError";
  }
}

/**
 * Is this a strictly well-formed IPv4/IPv6 address or CIDR range?
 *
 * DELIBERATELY STRICTER than Better Auth's own `parseCIDR`, never looser, and
 * the direction is the whole design (tenancy gate, 2026-08-18). The first
 * version of this guard was a loose regex, and the gate measured it against the
 * installed parser: it admitted `999.999.999.999`, `10.0.0`, `1.2.3.4/33` and
 * `abc`. Better Auth DROPS an entry it cannot parse, and if every entry is
 * dropped the trusted list is empty — which sends a multi-hop chain straight
 * back to the single shared `no-trusted-ip` bucket this whole guard exists to
 * prevent. A validator that admits what the library discards claims a property
 * it does not have.
 *
 * So the rule is one-directional and testable: **anything this accepts, Better
 * Auth accepts.** `tests/rate-limit.test.ts` pins exactly that against the
 * installed `findInvalidTrustedProxies`, so the two cannot drift apart silently.
 * Erring strict is safe — a false refusal is a loud boot error naming the
 * entry, which is recoverable; a false accept is a silent cross-tenant outage.
 */
/** A decimal octet with NO leading zero — `z.ipv4()` rejects `010`, `01`, `001`. */
const V4_OCTET = /^(0|[1-9]\d{0,2})$/;
/** One IPv6 hextet. */
const V6_GROUP = /^[0-9a-fA-F]{1,4}$/;

function isStrictV4(addr: string): boolean {
  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  return parts.every((o) => V4_OCTET.test(o) && Number(o) <= 255);
}

/**
 * Strict IPv6, GROUP COUNTS included — the clause the first version omitted.
 * Checking characters and the `::` count but never how many hextets there are
 * admitted `1:2`, `1:2:3`, `:1`, `1:` and a nine-group address, all of which
 * `z.ipv6()` rejects.
 *
 * IPv4-mapped forms (`::ffff:192.0.2.1`) are deliberately refused here even
 * though the library accepts them: that is the safe direction (a loud, named
 * refusal), and the error text tells the operator to write the IPv4 form.
 */
function isStrictV6(addr: string): boolean {
  if (!addr.includes(":")) return false;
  if (/[^0-9a-fA-F:]/.test(addr)) return false;
  const elisions = (addr.match(/::/g) ?? []).length;
  if (elisions > 1) return false;
  if (elisions === 1) {
    const [left = "", right = ""] = addr.split("::");
    const l = left ? left.split(":") : [];
    const r = right ? right.split(":") : [];
    // `:::` and friends leave empty members on one side.
    if ([...l, ...r].some((g) => g === "")) return false;
    // `::` stands for AT LEAST one all-zero group, so at most 7 are explicit.
    if (l.length + r.length > 7) return false;
    return [...l, ...r].every((g) => V6_GROUP.test(g));
  }
  const groups = addr.split(":");
  if (groups.length !== 8) return false;
  return groups.every((g) => V6_GROUP.test(g));
}

function isWellFormedProxy(entry: string): boolean {
  const slash = entry.lastIndexOf("/");
  const addr = slash === -1 ? entry : entry.slice(0, slash);
  const prefixPart = slash === -1 ? null : entry.slice(slash + 1);

  const isV4 = isStrictV4(addr);
  const isV6 = !isV4 && isStrictV6(addr);
  if (!isV4 && !isV6) return false;

  if (prefixPart === null) return true;
  if (!V4_OCTET.test(prefixPart)) return false;
  const prefix = Number(prefixPart);
  // A `/0` (or any all-matching range) is syntactically fine and operationally
  // fatal: `getIPFromHeader` walks the chain right-to-left and returns null
  // when EVERY hop is trusted, so `0.0.0.0/0` resolves no client at all — the
  // shared bucket again, from a value that parses perfectly. Measured by the
  // gate, not reasoned: `["0.0.0.0/0"] → null`.
  if (prefix === 0) return false;
  return prefix <= (isV4 ? 32 : 128);
}

function parseProxies(value: string): string[] {
  const entries = value.split(",").map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0) {
    throw new TrustedProxiesConfigError("is set but lists no addresses");
  }
  const invalid = entries.filter((e) => !isWellFormedProxy(e));
  if (invalid.length > 0) {
    throw new TrustedProxiesConfigError(
      `contains ${invalid.length} entr${invalid.length === 1 ? "y" : "ies"} that are not a usable IP address or CIDR range (${invalid.join(", ")}) — Better Auth DROPS an entry it cannot parse, and an all-matching range like 0.0.0.0/0 trusts every hop, so either would leave every tenant sharing one rate-limit bucket while the configuration LOOKED correct. Common causes: a LEADING ZERO in an octet (write 10.0.0.0, not 010.000.000.000), an IPv6 address with the wrong number of groups, or an IPv4-mapped form (write 192.0.2.1, not ::ffff:192.0.2.1)`
    );
  }
  return entries;
}

/**
 * The environments `@better-auth/core` gives a localhost IP fallback, verified
 * in its `env/env-impl.mjs` (`isDevelopment`, `isTest`) rather than assumed.
 * Everything else — `staging`, `preview`, an unset NODE_ENV — resolves to no IP
 * at all on a multi-hop header, so it needs a real choice.
 */
const LOCAL_ENVS = new Set(["development", "dev", "test"]);

/**
 * Resolve `trustedProxies` for this environment, refusing an unchosen one.
 *
 * Returns `undefined` when no proxies are trusted (the opt-out, and every local
 * environment) — the option's own "unset" shape, so the opt-out and the old
 * default behave identically. The difference is only that one was chosen.
 */
export function resolveTrustedProxies(
  nodeEnv: string | undefined,
  raw: string | undefined
): string[] | undefined {
  const value = raw?.trim();
  // WHICH environments are exempt, and why it is not `!== "production"`
  // (tenancy gate, 2026-08-18). The first version keyed on the literal string
  // `production`, on the premise that "outside production better-auth falls
  // back to localhost". That premise is only true for the environments the
  // library itself recognises: `isDevelopment()` is `NODE_ENV === "dev" |
  // "development"` and `isTest()` is `NODE_ENV === "test"`. Measured on a
  // two-hop header: `development` and `test` resolve to 127.0.0.1, but
  // **`staging` and an unset NODE_ENV resolve to null** — no fallback, and
  // `rateLimitEnabled` has the limiter ON for both. So a staging deployment got
  // no refusal and every tenant on one bucket: the exact hazard, in the
  // environment most likely to share production's proxy topology.
  //
  // Exempt therefore means "the library guarantees a fallback", not "not
  // production". Anything else must choose.
  if (LOCAL_ENVS.has(nodeEnv ?? "")) {
    return value && value !== NO_TRUSTED_PROXIES ? parseProxies(value) : undefined;
  }
  if (!value) {
    throw new TrustedProxiesConfigError(
      `is not set (NODE_ENV=${nodeEnv ?? "<unset>"}, which Better Auth does not treat as local, so there is no localhost fallback)`
    );
  }
  if (value === NO_TRUSTED_PROXIES) return undefined;
  return parseProxies(value);
}

/**
 * Is the limiter on? (audit 2026-08-17 #20)
 *
 * Better Auth's own default is production-only, which is exactly the state the
 * finding is about: nothing outside production exercised the limiter, so its
 * configuration was never executed by anything before it reached real users.
 * Here it is ON in development too — a developer hitting the throttle is the
 * point, not a nuisance — and OFF only under `NODE_ENV=test`, which is a
 * deliberate, NAMED exception rather than an inherited default:
 *
 *  - the suites sign in and out dozens of times in seconds and would trip a
 *    5-per-minute rule against each other, making unrelated tests flaky;
 *  - the limiter's OWN tests turn it back on explicitly by passing
 *    `nodeEnv: "production"`, so the shipped configuration IS the configuration
 *    under test — which is what #20 asks for and what a production-only default
 *    made impossible.
 */
export function rateLimitEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "test";
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

/**
 * The password-reset URL is a BEARER CREDENTIAL (account takeover if leaked).
 * Outside development it must never enter logs — and neither does the email
 * (T6: keep PII out of aggregatable logs; the user id suffices for support).
 * Exported for the guard test.
 */
export function resetPasswordLogLine(
  nodeEnv: string | undefined,
  user: { id: string; email: string },
  url: string
): string {
  if (nodeEnv === "development") {
    return `[dev-only] password reset link for ${user.email}: ${url}`;
  }
  return `password reset requested (user ${user.id})`;
}

/**
 * Factory (testability: tests inject a PGlite db and run REAL sign-up flows).
 * The runtime instance is built lazily in server.ts — no env read at import.
 */
export function createAuth(db: DbLike, opts: CreateAuthOptions = {}) {
  return betterAuth({
    // The db's schema map already contains the generated auth tables —
    // packages/db/src/schema.ts re-exports auth-schema.ts (adapter-wiring pin).
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: opts.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: opts.baseURL ?? process.env.BETTER_AUTH_URL,
    // AUTH RATE LIMITING, EXPLICIT (audit 2026-08-17 #20).
    //
    // Nothing was passed before, and the installed package's default is not a
    // configuration this project can rely on. Verified against
    // @better-auth/core 1.6.28 `types/init-options.d.mts`, not from memory:
    //
    //   - `enabled` — "By default, rate limiting is only enabled on
    //     production." So outside NODE_ENV=production the limiter was OFF, and
    //     no test could exercise it, which is the second half of the finding:
    //     the behaviour under test was never the behaviour that ships.
    //   - `storage` — "@default 'memory'". An in-process counter resets on
    //     every restart and is not shared between instances, so on a redeploy
    //     (or a second instance) the limit silently resets. That is not a
    //     durable limiter, and #20 asks for one.
    //
    // So: ON everywhere (see `rateLimitEnabled` for why test is the exception),
    // stored in the DATABASE — the `rate_limit` table added in the same change,
    // matching the field names the installed adapter resolves.
    rateLimit: {
      enabled: rateLimitEnabled(opts.nodeEnv ?? process.env.NODE_ENV),
      storage: "database",
      // The GLOBAL floor for every auth endpoint. Better Auth applies this to
      // anything without a custom rule below.
      window: 60,
      max: 60,
      // The CREDENTIAL endpoints, which is where #20's risk actually is: these
      // are the paths an attacker sprays. Each is tighter than the floor.
      //
      // The paths are Better Auth's own route names for the email/password
      // provider this app enables; a typo here fails OPEN (the global rule
      // applies instead), so `tests/auth.test.ts` drives the real endpoints
      // rather than asserting this object.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/forget-password": { window: 3600, max: 5 },
        "/reset-password": { window: 3600, max: 5 },
      },
    },
    // WHOSE request is it? (R-26, enforced — see `resolveTrustedProxies`.)
    // Every rule above keys on the resolved client IP, so an unresolvable IP
    // silently turns all of them into one global bucket. Production must
    // choose a value; dev and test resolve to localhost and need none.
    advanced: {
      ipAddress: {
        trustedProxies: resolveTrustedProxies(
          opts.nodeEnv ?? process.env.NODE_ENV,
          opts.trustedProxiesEnv ?? process.env.RESPIN_TRUSTED_PROXIES
        ),
      },
    },
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      // SHORTCUT: no email provider until M6 (digests land there — auth-swap
      // plan, Deferral Ledger). Ceiling: users cannot actually receive reset
      // email; dev reads the link from the dev console. Guard: outside
      // development the URL is never logged (resetPasswordLogLine).
      // Upgrade trigger: M6 email provider — replace this stub with real send.
      sendResetPassword: async ({ user, url }) => {
        console.log(resetPasswordLogLine(process.env.NODE_ENV, user, url));
      },
    },
    ...(isGoogleConfigured()
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID as string,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
          },
        }
      : {}),
  });
}

export type Auth = ReturnType<typeof createAuth>;
