// Phase 10a plan C5: the app process's error telemetry, built ONLY from
// `safe-log.ts`'s stable allowlist — the refusal code, the error class name
// and the driver SQLSTATE — plus the route PATTERN Next.js hands
// `onRequestError`. The original error object is never forwarded: the sink
// builders in `@respin/db` take a `SafeErrorEvent` and have no field for a
// message, a request, a header, a cookie, a user or a body.
//
// `tests/telemetry.test.ts` induces a real driver error carrying a secret and
// a canary in its message and proves neither reaches the envelope bytes.
import {
  MonthlyEventBudget,
  SENTRY_MONTHLY_EVENT_BUDGET,
  parseSentryDsn,
  originPinnedFetch,
  sendOutbound,
  sentryEnvelope,
  sentryEnvironmentTag,
  tightenOnlySampleRate,
  type SafeErrorEvent,
} from "@respin/db";
import { safeLogFields } from "../app/(product)/safe-log";
import { rethrowNextControlFlow } from "./next-control-flow";

export type Telemetry = Readonly<{
  /** Whether a collector is configured. */
  enabled: boolean;
  /** Build the event that WOULD be sent — exposed for the canary test; sends nothing. */
  eventFor(err: unknown, context: Readonly<{ route?: string }>): SafeErrorEvent;
  /** Send, within the sample rate and the monthly budget. Never throws. */
  captureError(err: unknown, context: Readonly<{ route?: string }>): Promise<"sent" | "sampled_out" | "budget_exhausted" | "disabled" | "failed">;
}>;

const ROUTE_PATTERN = /^[A-Za-z0-9/[\]._:-]{1,128}$/;

export function createTelemetry(
  env: Readonly<Record<string, string | undefined>>,
  deps: Readonly<{ fetchImpl?: typeof fetch; now?: () => Date; random?: () => number }> = {},
): Telemetry {
  const dsn = parseSentryDsn(env.SENTRY_DSN);
  const sampleRate = tightenOnlySampleRate(env.RESPIN_SENTRY_SAMPLE_RATE);
  const environment = sentryEnvironmentTag(env.SENTRY_ENVIRONMENT);
  const budget = new MonthlyEventBudget(SENTRY_MONTHLY_EVENT_BUDGET);
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  // ORIGIN-PINNED, NOT BARE (P1-R2 / R-141). Every envelope this sender posts
  // goes to `dsn.envelopeUrl`, so the DSN's own origin is the only one it may
  // reach — and pinning it here makes "a submitted URL is never fetched"
  // structural rather than a property of whoever next edits `sentryEnvelope`.
  // `dsn === null` means the sender is disabled and `captureError` returns
  // "disabled" before any send, so no fetch is constructed and the pin never
  // has to default to "any origin".
  const fetchImpl =
    dsn === null
      ? (deps.fetchImpl ?? fetch)
      : originPinnedFetch(dsn.envelopeUrl, deps.fetchImpl ?? fetch);
  const eventFor = (err: unknown, context: Readonly<{ route?: string }>): SafeErrorEvent => {
    const fields = safeLogFields(err);
    const route = context.route && ROUTE_PATTERN.test(context.route) ? context.route : undefined;
    return {
      code: fields.code,
      errorName: fields.errorName,
      ...(fields.driverCode ? { driverCode: fields.driverCode } : {}),
      ...(route ? { route } : {}),
      origin: "app",
    };
  };
  return {
    enabled: dsn !== null,
    eventFor,
    async captureError(err, context) {
      // NEVER THROWS, by construction rather than by claim (lean gate round 1,
      // S-3): a telemetry failure is never an application failure.
      try {
        if (dsn === null) return "disabled";
        if (random() >= sampleRate) return "sampled_out";
        const at = now();
        if (!budget.admit(at)) return "budget_exhausted";
        return await sendOutbound(fetchImpl, sentryEnvelope(dsn, eventFor(err, context), at, environment));
      } catch (err) {
        rethrowNextControlFlow(err);
        return "failed";
      }
    },
  };
}

let shared: Telemetry | null = null;

/** The process-wide instance, built lazily from the environment at first use. */
export function telemetry(): Telemetry {
  shared ??= createTelemetry(process.env);
  return shared;
}
