// Phase 10b-1 Task 4 — the Resend adapter behind `AuthMailPort`.
//
// Facts pinned from the current Resend API reference (read 2026-09-07):
//   POST https://api.resend.com/emails with `Idempotency-Key` (unique per
//   request, 24 h, ≤256 chars) returns `{ id }`; the same key with the same
//   payload returns the original response; the same key with a different
//   payload is 409 `invalid_idempotent_request`; an in-flight same key is 409
//   `concurrent_idempotent_requests`.
//
// The origin is pinned, the request is bounded by a timeout, and NOTHING here
// logs: the recipient address and the action URL are a bearer credential and
// personal data respectively, and they leave this process only over TLS to
// the pinned origin. Outcomes are honest by construction — an indeterminate
// exchange is `unknown`, never `failed` and never `accepted`.
import type { AuthMailMessage, AuthMailPort, AuthMailSendResult } from "@respin/db";

export const RESEND_ORIGIN = "https://api.resend.com";
export const RESEND_SEND_PATH = "/emails";
export const RESEND_TIMEOUT_MS = 15_000;

export type ResendMailPortOptions = Readonly<{
  apiKey: string;
  /** The verified sender, e.g. `Respin <account@mail.example>`. */
  from: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}>;

type ResendErrorBody = { name?: unknown; message?: unknown };

function errorName(body: unknown): string {
  const name = (body as ResendErrorBody | null)?.name;
  return typeof name === "string" ? name : "";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Definitive-versus-indeterminate mapping of one HTTP exchange. */
export function classifyResendResponse(
  status: number,
  body: unknown
): AuthMailSendResult {
  if (status >= 200 && status < 300) {
    const id = (body as { id?: unknown } | null)?.id;
    return typeof id === "string" && id.length > 0
      ? { outcome: "accepted", providerMessageId: id }
      : // Accepted without an id: the provider may have sent it, but nothing
        // durable can name it. Indeterminate, so never reported delivered.
        { outcome: "unknown", failureCode: "accepted_without_id" };
  }
  if (status === 409) {
    // A 409 is either the idempotent replay of a send still in flight
    // (indeterminate) or a definitive conflict; an unreadable body cannot
    // tell them apart, so it is indeterminate too (round-1 lean NOTE C9).
    const name = errorName(body);
    return name === "concurrent_idempotent_requests" || name === ""
      ? { outcome: "unknown", failureCode: "concurrent_idempotent_request" }
      : { outcome: "failed", failureCode: "provider_rejected" };
  }
  if (status === 429) return { outcome: "failed", failureCode: "provider_rate_limited" };
  if (status === 401 || status === 403) {
    return { outcome: "failed", failureCode: "provider_unauthorized" };
  }
  if (status === 422 && errorName(body) === "validation_error") {
    return { outcome: "failed", failureCode: "recipient_rejected" };
  }
  if (status >= 400 && status < 500) return { outcome: "failed", failureCode: "provider_rejected" };
  return { outcome: "unknown", failureCode: `provider_status_${status}` };
}

export function createResendMailPort(options: ResendMailPortOptions): AuthMailPort {
  if (!options.apiKey.trim()) throw new Error("RESEND_API_KEY is required");
  if (!options.from.trim()) throw new Error("RESEND_FROM is required");
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? RESEND_TIMEOUT_MS;
  return {
    async send(message: AuthMailMessage): Promise<AuthMailSendResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(`${RESEND_ORIGIN}${RESEND_SEND_PATH}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: controller.signal,
          redirect: "error",
        });
        return classifyResendResponse(response.status, await readJson(response));
      } catch {
        // Timeout, DNS, TLS, socket reset: the request may or may not have
        // reached the provider. Indeterminate.
        return { outcome: "unknown", failureCode: "request_failed" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function isResendConfigured(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim());
}

/** Null when unconfigured: the keyless build and dev console path remain. */
export function resendMailPortFromEnv(
  env: Readonly<Record<string, string | undefined>>
): AuthMailPort | null {
  if (!isResendConfigured(env)) return null;
  return createResendMailPort({ apiKey: env.RESEND_API_KEY!, from: env.RESEND_FROM! });
}
