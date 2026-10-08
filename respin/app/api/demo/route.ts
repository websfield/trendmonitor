// POST /api/demo — the public Sample Spin (Phase 10a plan C2, R-116/R-117).
//
// SESSIONLESS BY DESIGN, and the gate-completeness suite allowlists it for
// that reason: a visitor has no session, and the endpoint mints none — no
// WorkspaceScope, no ProfileScope, no tenant read, no ledger row. What bounds
// it instead lives behind the one facade call below: the closed rollout flag
// (404 when unset), the strict untrusted-idea parse, the DB-atomic client-IP
// bucket, the product-wide concurrency limit and the R-123 spend reservation.
//
// This handler owns delivery only: the rollout flag, a bounded JSON body, the
// request id, the canonical client IP through the ONE trusted-proxy authority,
// and content-free response headers. It stores nothing and logs no content.
import { proxyAttestedClientIp } from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal, wireId } from "../../(product)/safe-log";

export const dynamic = "force-dynamic";

/** A 600-code-point idea is at most 2,400 bytes of UTF-8 plus the envelope. */
const MAX_BODY_BYTES = 4096;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

function refusal(status: number, reason: string, nextAction: string, requestId: string | null): Response {
  return json(status, { status: "refused", requestId, reason, nextAction });
}

/**
 * Read at most `MAX_BODY_BYTES`, counting what arrives rather than trusting
 * `Content-Length` (a chunked POST carries none, and route handlers have no
 * default body limit). Returns null when the bound is crossed.
 */
async function readBoundedText(req: Request): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return null;
  if (req.body === null) return "";
  const reader = req.body.getReader();
  void reader.closed.catch(() => {});
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export async function POST(req: Request): Promise<Response> {
  let enabled: "disabled" | "preview";
  try {
    enabled = respinCredits.publicSampleSpinEnablement();
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[demo]", err);
    return refusal(503, "service_unavailable", "The Sample Spin is not configured on this deployment.", null);
  }
  if (enabled === "disabled") return refusal(404, "disabled", "The Sample Spin is not open yet.", null);

  // NOT A CROSS-SITE SPEND TRIGGER (lean gate round 1, S-2). A `text/plain`
  // POST is a CORS simple request that needs no preflight, so a third-party
  // page could burn every visitor's window and the shared purpose cap from
  // their browsers. Requiring JSON forces the preflight (which the absent
  // CORS headers fail), and a browser that says the request is cross-site is
  // refused outright.
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return refusal(415, "idea_invalid", "Send JSON with a requestId and an idea.", null);
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return refusal(403, "idea_invalid", "The Sample Spin runs only from its own page.", null);
  }

  const text = await readBoundedText(req);
  if (text === null) return refusal(413, "idea_invalid", "Type an idea of up to six hundred characters and try again.", null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    rethrowNextControlFlow(err);
    return refusal(400, "idea_invalid", "Send JSON with a requestId and an idea.", null);
  }
  const envelope = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  const requestId = typeof envelope?.requestId === "string" && REQUEST_ID.test(envelope.requestId) ? envelope.requestId : null;
  if (!envelope || requestId === null) {
    return refusal(400, "idea_invalid", "Send JSON with a requestId and an idea.", null);
  }
  // Only the idea travels on: the orchestrator's untrusted parse refuses any
  // other key, so the envelope's shape is decided there, not here.
  const body = { idea: envelope.idea };

  try {
    const result = await respinCredits.publicSampleSpin({
      requestId,
      canonicalIp: proxyAttestedClientIp(req.headers),
      body,
    });
    return json(result.status === "accepted" ? 200 : statusFor(result.reason), result);
  } catch (err) {
    rethrowNextControlFlow(err);
    // Content-free by construction: the code, the class name and the request
    // id. Never the error's message, never the idea.
    logRefusal("[demo]", err, { requestId: wireId(requestId) });
    return refusal(503, "service_unavailable", "The Sample Spin could not complete. Nothing you typed was kept. Try again later.", requestId);
  }
}

function statusFor(reason: string): number {
  switch (reason) {
    case "idea_invalid":
    case "prompt_too_large":
      return 400;
    case "bucket_exhausted":
    case "concurrency_exhausted":
    case "budget_exhausted":
      return 429;
    case "in_progress":
    case "already_completed":
      return 409;
    case "gate_refused":
    case "draft_unusable":
      return 200;
    default:
      return 503;
  }
}
