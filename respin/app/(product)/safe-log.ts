// What may be written to a server log when an action or a page refuses.
//
// THE LEAK THIS EXISTS TO CLOSE, verified against the INSTALLED drizzle-orm
// (0.44.7) rather than reasoned about. `pg-core/session.js` wraps EVERY query
// failure in `DrizzleQueryError`, whose message is built as:
//
//     `Failed query: ${query}\nparams: ${params}`          (errors.js:12-13)
//
// So `console.error("[onboarding-action] refused", err)` prints the BOUND
// PARAMETERS of the failing statement — which on the intake path is the
// creator's unpublished post text, and on profile creation is a person's name.
// Any transient database failure was enough: a deadlock, a statement timeout, a
// connection reset, a pool exhaustion, a constraint violation. From stdout it
// reaches whatever collects the Lightsail logs and, per tech-spec §7, Sentry —
// and log retention makes it hard to reverse. (Production gate, 2026-08-27.)
//
// THE RULE, and why it is drawn here rather than at a blocklist of fields:
//
//   Exception messages are never logged. Only the stable refusal code, concrete
//   class name, driver code, and caller-supplied server identifiers cross this
//   boundary. Authorship of an Error subclass is not authorship of every value
//   interpolated into its message.
//
// Error messages are never safe merely because we own the class. Several typed
// refusals interpolate creator values: ReferenceEchoError can include a matched
// reference span, ContentSchemaError can relay a parser issue, and provenance
// failures can contain attacker-controlled pointers. Therefore NO exception
// message crosses this boundary. Operators get a stable refusal code, the
// concrete class name, an optional driver code, and server-derived context.
//
// A blocklist would have to know which field of which library's error can hold
// user data, for every library, forever. This is the complement of a
// hand-written allowlist, the same shape `GUARDED_WRITE_FIELDS` uses and for
// the same reason.
import { billingErrorCode } from "./billing-errors";
import { rethrowNextControlFlow } from "../../lib/next-control-flow";

/** A pg driver error code (`23505`, `40P01`, …), if this error carries one. */
function driverCode(err: unknown): string | undefined {
  try {
    const cause = (err as { cause?: unknown })?.cause;
    const code =
      (cause as { code?: unknown })?.code ?? (err as { code?: unknown })?.code;
    return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
      ? code
      : undefined;
  } catch (err) {
    rethrowNextControlFlow(err);
    // A thrown object can expose metadata through hostile getters. Logging a
    // refusal must not execute or retain that metadata.
    return undefined;
  }
}

/** Closed-alphabet class label; constructor metadata is attacker-controlled too. */
function errorName(err: unknown): string {
  if (!(err instanceof Error)) {
    return typeof err === "object" && err !== null ? "UnknownObject" : typeof err;
  }
  try {
    const candidate = err.constructor?.name ?? err.name;
    return /^[A-Za-z][A-Za-z0-9]*$/.test(candidate) ? candidate : "Error";
  } catch (err) {
    rethrowNextControlFlow(err);
    return "Error";
  }
}

/**
 * A log line that names what happened without quoting anything a creator typed.
 *
 * Returns a plain object rather than logging, so it is a pure function a test
 * can drive — the leak it prevents is invisible to a test that can only assert
 * on `console.error` having been called.
 */
export function safeLogFields(err: unknown): {
  code: string;
  errorName: string;
  driverCode?: string;
} {
  let code = "unknown";
  try {
    code = billingErrorCode(err);
  } catch (err) {
    rethrowNextControlFlow(err);
    // Refusal logging is a containment boundary. A hostile thrown value must
    // degrade to the closed fallback instead of preventing the real handler.
  }
  // `constructor.name`, NOT `.name` — measured against the installed
  // drizzle-orm 0.44.7 (production gate, 2026-08-27): `DrizzleQueryError`
  // extends Error and never sets `this.name`, so `err.name` is the literal
  // string "Error" for the exact class this module exists to contain. An
  // operator's line read `{code: "unknown", errorName: "Error"}` on every
  // database failure. The live walk that "confirmed" this module threw one of
  // OUR classes, which does set `.name`, so the foreign branch was never
  // exercised — which is why it now has a test.
  const stableErrorName = errorName(err);
  const stableDriverCode = driverCode(err);
  return {
    code,
    errorName: stableErrorName,
    ...(stableDriverCode ? { driverCode: stableDriverCode } : {}),
  };
}

/** Server-derived identifiers that accompany a log line. Never creator text. */
export type LogContext = Readonly<Record<string, string | number>>;

/**
 * A value that arrived ON THE WIRE, clamped to a shape a log line may carry.
 *
 * WHY THIS EXISTS (compliance gate, 2026-09-01). `logRefusal`'s contract says
 * "ONLY SERVER-DERIVED IDENTIFIERS BELONG HERE… every call site passes ids",
 * and `/studio`'s generation action broke it in the one place it mattered
 * most: it read `mode` straight off the `FormData` and logged it, so the
 * `UnknownModeError` path — the path that fires precisely BECAUSE the value was
 * not a mode — wrote the bad value to stdout. The field is a fixed hidden input
 * in the browser, but a server action is a POST endpoint, so what actually
 * arrives is an unbounded attacker-chosen string heading for whatever collects
 * the Lightsail logs and, per tech-spec §7, Sentry.
 *
 * THE ANSWER IS A CLAMP, NOT AN ALLOWLIST, and the reason is R18's: the set of
 * modes lives in `@respin/modes` and the set a plan includes lives in
 * `mode-access.ts`, so a membership test here would be a third copy of a map
 * this tree may not even import. What the log needs is not the mode — it is
 * enough of the string to tell "someone typed `hookss`" from "someone posted 4kB
 * of JSON", and a closed alphabet with a length bound gives exactly that.
 *
 * THE SHAPE IS `errorName`'s, deliberately: the same closed alphabet, the same
 * fall back to a fixed sentinel rather than a truncation, for the same reason —
 * a value that fails the shape is not made safe by keeping the first 40
 * characters of it, and a sentinel is a fact ("this was not a label") where a
 * prefix is a leak.
 */
export const NOT_A_LABEL = "not-a-label";

export function wireLabel(raw: string): string {
  return /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(raw) ? raw : NOT_A_LABEL;
}

/** How many rejected key names a single refusal line may name. */
const SCHEMA_KEYS_LOGGED_MAX = 5;

/**
 * A schema refusal's LOCATION, clamped to what a log line may carry.
 *
 * WHY (live walk, 2026-09-18). `bad_shape` on the voice build was
 * undiagnosable on every occurrence: `parseVoiceReply` computed the failing
 * path and put it in the `Error`'s message, and this module withholds
 * messages. The answer is NOT to start logging messages — a foreign error's
 * message is exactly what this file exists to contain — but to carry the
 * location as structured fields that are clamped here, at the boundary.
 *
 * `path` and `code` are derived from OUR schema and zod's closed issue set, so
 * they are clamped only as defence in depth. `keys` is genuinely
 * vendor-controlled — it is the names a strict object rejected — so it goes
 * through `wireLabel`, the clamp this file already uses for the same problem,
 * and the list is bounded: the diagnostic value is in the first few names, and
 * an unbounded model-chosen array is a log-flooding channel.
 */
export function schemaIssueFields(
  issue: { path: string; code: string; keys?: readonly string[] } | undefined
): Readonly<Record<string, string>> {
  if (!issue) return {};
  const path = /^[A-Za-z0-9_/-]{0,120}$/.test(issue.path) ? issue.path : NOT_A_LABEL;
  return {
    // An empty path is the ROOT of the reply, which is a real location (the
    // top-level object was the wrong type) — reported as "/" rather than as an
    // absent field, so a reader never has to guess whether it was missing.
    schemaPath: path === "" ? "/" : path,
    schemaIssue: wireLabel(issue.code),
    ...(issue.keys && issue.keys.length > 0
      ? {
          schemaKeys: issue.keys
            .slice(0, SCHEMA_KEYS_LOGGED_MAX)
            .map((k) => wireLabel(k))
            .join(","),
          // STATED, NOT IMPLIED. A truncated list that looks complete would
          // send the next reader hunting for a key this line never named.
          ...(issue.keys.length > SCHEMA_KEYS_LOGGED_MAX
            ? { schemaKeysTotal: String(issue.keys.length) }
            : {}),
        }
      : {}),
  };
}

/**
 * Log a refusal safely — one call-site shape, so the rule cannot be applied in
 * one file and forgotten in the next — naming WHO it happened to as well as
 * WHAT happened.
 *
 * The production gate's question was "a creator says they were charged and got
 * nothing — what in the logs answers that?", and the answer was nothing: the
 * refusal line carried `{code, errorName}` and no tenant, no user and no
 * attempt, so a support ticket became a manual database hunt. `attemptId` in
 * particular was minted at the edge and never left the database — it is the
 * key `model_usage` and the ledger debit share, i.e. the one value that joins
 * "what the vendor charged us" to "what we charged them".
 *
 * ONLY SERVER-DERIVED IDENTIFIERS BELONG HERE. Everything this module exists to
 * withhold — a foreign error's message, a bound query parameter, anything a
 * creator typed — is still withheld; a caller passing creator content through
 * this parameter would be defeating the module in a new way, which is why the
 * type is `string | number` and every call site passes ids.
 */
export function logRefusal(
  prefix: string,
  err: unknown,
  context: LogContext = {}
): string {
  const fields = safeLogFields(err);
  console.error(prefix, { ...context, ...fields });
  return fields.code;
}

/**
 * The other half the gate asked for: a SUCCESSFUL spend left no trace at all.
 *
 * A run that completes is the event most worth being able to reconcile later,
 * and it wrote nothing — so "was I charged?" was answerable only from the
 * tables. Same discipline as the refusal: server-derived values, no creator
 * content, and never the model's reply.
 */
export function logSpend(prefix: string, context: LogContext): void {
  console.info(prefix, context);
}
