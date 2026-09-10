// Phase 10a plan C5: the CONTENT-FREE telemetry sinks, SDK-less.
//
// WHY NO SDK. The card's list of what a collector must never receive —
// request bodies, headers, cookies, query strings, user identity, content
// breadcrumbs, replay, attachments, prompts, completions, brain text, emails,
// raw IPs, workspace/profile/generation ids, raw error messages — is exactly
// what a hosted SDK captures by default and has to be switched off knob by
// knob. Building the wire payload from an ALLOWLISTED value instead makes
// the exclusion a property of the type: there is no field for any of it.
// These builders are pure; `send` is the one function that talks to a host.
//
// Budgets are compiled ceilings that config can only tighten (R-117's rule,
// applied to telemetry): Sentry's Developer allowance is 5,000 errors/month
// (https://sentry.io/pricing/, reviewed 2026-09-09) → 4,000 (80%); PostHog's
// free allowance is 1,000,000 events/month (https://posthog.com/pricing,
// reviewed 2026-09-09) → 10,000 (1%), aggregate events only. Neither plan
// authorises a usage-based upgrade. The counters live per process, so a
// fleet of N processes can send N× the budget — stated as the limitation it
// is; the ceilings are far below either allowance.
import { createHash, randomUUID } from "node:crypto";

export const SENTRY_MONTHLY_EVENT_BUDGET = 4_000;
export const POSTHOG_MONTHLY_EVENT_BUDGET = 10_000;
/** R-121: an external sink never sees a cohort whose denominator is below this. */
export const ACTIVATION_SMALL_CELL_DENOMINATOR = 10;
export const ACTIVATION_COHORT_EVENT = "activation_cohort_matured";
export const TELEMETRY_SYSTEM_IDENTITY = "respin-system";

/** The ONLY shape a Sentry event is built from. Codes, class names, a route: never a message. */
export type SafeErrorEvent = Readonly<{
  code: string;
  errorName: string;
  driverCode?: string;
  /** A route PATTERN (`/api/demo`, `/settings/[id]`), never a concrete URL with ids or a query string. */
  route?: string;
  origin: "app" | "worker";
}>;

const SAFE_TOKEN = /^[A-Za-z0-9/][A-Za-z0-9._:/\-[\]]{0,127}$/;

function safeToken(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!SAFE_TOKEN.test(value)) throw new Error(`telemetry field ${field} is not a bounded content-free token`);
  return value;
}

/** Refuses any field the allowlist does not name and any value that is not a bounded token. */
export function assertSafeErrorEvent(event: SafeErrorEvent): SafeErrorEvent {
  const allowed = new Set(["code", "errorName", "driverCode", "route", "origin"]);
  for (const key of Object.keys(event)) {
    if (!allowed.has(key)) throw new Error(`telemetry event carries a field outside the allowlist: ${key}`);
  }
  if (event.origin !== "app" && event.origin !== "worker") throw new Error("telemetry origin must be app or worker");
  return {
    code: safeToken(event.code, "code")!,
    errorName: safeToken(event.errorName, "errorName")!,
    ...(event.driverCode === undefined ? {} : { driverCode: safeToken(event.driverCode, "driverCode") }),
    ...(event.route === undefined ? {} : { route: safeToken(event.route, "route") }),
    origin: event.origin,
  };
}

export type SentryDsn = Readonly<{ envelopeUrl: string; publicKey: string }>;

/** `https://<key>@<host>/<project>` → the envelope endpoint and the key. Null for anything else. */
export function parseSentryDsn(raw: string | undefined): SentryDsn | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const project = url.pathname.replace(/^\/+/, "");
  if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(project)) return null;
  return { envelopeUrl: `${url.protocol}//${url.host}/api/${project}/envelope/`, publicKey: url.username };
}

export type OutboundJson = Readonly<{ url: string; headers: Readonly<Record<string, string>>; body: string }>;

/**
 * The deployment's environment tag, validated ONCE when the telemetry is
 * built (lean gate round 2, S-4): a malformed `SENTRY_ENVIRONMENT` refused per
 * event would ship zero events with no symptom, so it refuses at start like
 * the sample rate does. Unset = `production`.
 */
export function sentryEnvironmentTag(raw: string | undefined): string {
  const value = (raw ?? "").trim() || "production";
  return safeToken(value, "SENTRY_ENVIRONMENT")!;
}

/** A Sentry envelope carrying ONE allowlisted event. No request, user, breadcrumbs, extra or message text. */
export function sentryEnvelope(dsn: SentryDsn, event: SafeErrorEvent, now: Date, environment = "production"): OutboundJson {
  const safe = assertSafeErrorEvent(event);
  const env = safeToken(environment, "environment")!;
  const eventId = randomUUID().replace(/-/g, "");
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn: undefined };
  const item = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    logger: "respin",
    environment: env,
    // The message IS the code: a stable, content-free token.
    message: safe.code,
    tags: {
      code: safe.code,
      error_name: safe.errorName,
      origin: safe.origin,
      ...(safe.driverCode ? { driver_code: safe.driverCode } : {}),
      ...(safe.route ? { route: safe.route } : {}),
    },
  };
  const body = [
    JSON.stringify({ event_id: header.event_id, sent_at: header.sent_at }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(item),
  ].join("\n");
  return {
    url: dsn.envelopeUrl,
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=respin-telemetry/1, sentry_key=${dsn.publicKey}`,
    },
    body,
  };
}

/** The aggregate activation cohort an external sink may receive: counts and a code version, nothing else. */
export type ActivationCohortAggregate = Readonly<{
  cohortDate: string;
  metricVersion: number;
  signups: number;
  activated: number;
  excluded: number;
}>;

/** Deterministic per (cohort, counts): a replay is the same event id, which PostHog deduplicates. */
export function activationCohortEventUuid(cohort: ActivationCohortAggregate): string {
  const digest = createHash("sha256")
    .update(`respin:${ACTIVATION_COHORT_EVENT}:${cohort.cohortDate}:${cohort.metricVersion}:${cohort.signups}:${cohort.activated}:${cohort.excluded}`)
    .digest("hex");
  // RFC 4122 layout with the version nibble set to 5 and the variant to 10xx.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
}

export type PosthogSink = Readonly<{ host: string; projectKey: string }>;

export function parsePosthogSink(env: Readonly<Record<string, string | undefined>>): PosthogSink | null {
  const host = (env.POSTHOG_HOST ?? "").trim();
  const projectKey = (env.POSTHOG_PROJECT_KEY ?? "").trim();
  if (!host || !projectKey) return null;
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return { host: `${url.protocol}//${url.host}`, projectKey };
}

/**
 * The one PostHog event this product emits, under the system identity, with
 * person processing OFF. Refuses (throws) a small cell rather than emitting it
 * — the caller decides what to report internally; this function is the last
 * line, and it does not trust the caller to have checked.
 */
export function posthogActivationCapture(sink: PosthogSink, cohort: ActivationCohortAggregate, now: Date): OutboundJson {
  if (!Number.isSafeInteger(cohort.signups) || cohort.signups < ACTIVATION_SMALL_CELL_DENOMINATOR) {
    throw new Error("a small-cell activation cohort never reaches an external sink");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cohort.cohortDate)) throw new Error("cohort date must be a UTC day");
  return {
    url: `${sink.host}/capture/`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: sink.projectKey,
      event: ACTIVATION_COHORT_EVENT,
      distinct_id: TELEMETRY_SYSTEM_IDENTITY,
      uuid: activationCohortEventUuid(cohort),
      timestamp: now.toISOString(),
      properties: {
        $process_person_profile: false,
        cohort_date: cohort.cohortDate,
        metric_version: cohort.metricVersion,
        signups: cohort.signups,
        activated: cohort.activated,
        excluded: cohort.excluded,
      },
    }),
  };
}

/** A per-process monthly counter. Config may lower the limit, never raise it past the compiled ceiling. */
export class MonthlyEventBudget {
  readonly limit: number;
  #month = "";
  #sent = 0;
  constructor(compiledCeiling: number, configured?: number) {
    if (!Number.isSafeInteger(compiledCeiling) || compiledCeiling < 0) throw new Error("telemetry ceiling must be a nonnegative integer");
    if (configured !== undefined && (!Number.isSafeInteger(configured) || configured < 0 || configured > compiledCeiling)) {
      throw new Error(`telemetry budget may only tighten the compiled ceiling of ${compiledCeiling}`);
    }
    this.limit = configured ?? compiledCeiling;
  }
  /** True and counted when there is room this UTC month; false and uncounted otherwise. */
  admit(now: Date): boolean {
    const month = now.toISOString().slice(0, 7);
    if (month !== this.#month) {
      this.#month = month;
      this.#sent = 0;
    }
    if (this.#sent >= this.limit) return false;
    this.#sent += 1;
    return true;
  }
  get sentThisMonth(): number {
    return this.#sent;
  }
}

/** A sample rate that can only be lowered: unset is 1, anything outside [0, 1] refuses. */
export function tightenOnlySampleRate(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!text) return 1;
  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error("a telemetry sample rate must be a number from 0 to 1");
  return rate;
}

/** POST one built payload. Never throws — a telemetry failure is never an application failure. */
export async function sendOutbound(fetchImpl: typeof fetch, payload: OutboundJson): Promise<"sent" | "failed"> {
  try {
    const response = await fetchImpl(payload.url, { method: "POST", headers: payload.headers, body: payload.body });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
