// POST /api/deletion/recover — cancel an identity deletion from the emailed
// recovery link (Phase 10b-1 Task 8, plan C2). The session-free entry the
// gate-completeness suite allowlists, for the same reason the Stripe webhook
// is: the person's sessions were revoked when the deletion was acknowledged,
// so no session can exist. What authenticates the call instead is the
// single-use recovery secret from the mail, exchanged for a bounded recovery
// session, then a fresh password proof — the first two in @respin/auth, each
// rate-limited by client-IP digest, the third in @respin/db reachable only
// with a proof the rate-limited second step minted. Link possession alone
// reaches nothing.
import {
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
} from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { RECOVER_DELETION_PATH } from "../../../../lib/routes";

const PAGE = RECOVER_DELETION_PATH;
const MAX_BODY_BYTES = 4096;

/**
 * A RELATIVE `Location`, never `new URL(path, req.url)`.
 *
 * Deriving the redirect origin from the request meant that behind a proxy
 * forwarding an unvalidated `Host` / `X-Forwarded-Host`, the emitted `Location`
 * re-hosted to an attacker origin — carrying `op` and `s`, the recovery
 * credential, with it. Browsers accept a relative Location and it cannot be
 * re-hosted, so the whole class goes away rather than being validated.
 *
 * `Referrer-Policy: no-referrer` and `Cache-Control: no-store` ride along
 * because this URL carries a live credential in its query string: without them
 * it reaches any third-party resource the page loads, and any shared cache.
 */
function back(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Read at most `MAX_BODY_BYTES`, counting what actually arrives.
 *
 * The previous guard read `Content-Length` only. A `Transfer-Encoding: chunked`
 * POST carries no `Content-Length`, so the check was skipped entirely and
 * `req.formData()` buffered the whole body — and App Router route handlers have
 * no default body-size limit (`serverActions.bodySizeLimit` covers Server
 * Actions only, and `next.config.ts` sets neither). On a PUBLIC,
 * UNAUTHENTICATED route that is an unbounded allocation.
 */
async function readBoundedBody(req: Request): Promise<Request | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return null;
  if (req.body === null) return req;
  const reader = req.body.getReader();
  // The body's own `closed` promise gets a handler up front: an aborted or
  // reset request rejects it, and with no owner that rejection fails the run.
  void reader.closed.catch(() => {});
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // The bound holds whether or not the sender declared a length.
    if (total > MAX_BODY_BYTES) {
      // ABANDON the read; do NOT cancel it. Cancelling closes the stream while
      // the producer may still be enqueuing into it, and undici raises
      // "Invalid state: ReadableStream is already closed" as an unhandled
      // rejection — which fails the whole run with every test passing, on a
      // route whose job here is simply to refuse. Releasing the lock and
      // returning lets the runtime tear the request down, and the 413 below is
      // what actually stops the client.
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = req.headers.get("content-type");
  return new Request(req.url, {
    method: "POST",
    ...(contentType === null ? {} : { headers: { "content-type": contentType } }),
    body,
  });
}

export async function POST(req: Request): Promise<Response> {
  const bounded = await readBoundedBody(req);
  if (bounded === null) return new Response("payload too large", { status: 413 });
  let form: FormData;
  try {
    form = await bounded.formData();
  } catch (err) {
    rethrowNextControlFlow(err);
    return new Response("bad request", { status: 400 });
  }
  const operationId = String(form.get("op") ?? "");
  const secret = String(form.get("s") ?? "");
  const password = String(form.get("password") ?? "");
  let restored = 0;
  try {
    const { recoverySession } = await beginIdentityCancellationRecoverySession(operationId, secret);
    const proof = await createIdentityCancellationProofWithPassword(operationId, recoverySession, password);
    const report = await respinDb.cancelIdentityDeletion(operationId, secret, {
      proofId: proof.proofId,
      cancellationReceipt: proof.cancellationReceipt,
    });
    restored = report.restoredMembershipIds.length;
  } catch (err) {
    rethrowNextControlFlow(err);
    // Which of the three steps refused is deliberately not surfaced: it would
    // tell someone holding a stale link which half of the credential was right.
    // `op` and `s` ride back so a mistyped password can be retried on the page
    // the person is already on. Without them the form re-renders with empty
    // hidden fields and a disabled button, and the only way back is the email
    // -- which, if they have closed it, is no way back at all before grace
    // expires. They are the link's own values, returned to their own sender.
    // Echoed back only in the SHAPES a real link carries: an operation id is a
    // UUID and a secret is a 32-byte base64url value. Reflecting the raw input
    // would let an unauthenticated caller force an arbitrarily large
    // attacker-controlled `Location` header on a public route.
    const echo = new URLSearchParams({ e: "refused" });
    if (/^[0-9a-fA-F-]{36}$/.test(operationId)) echo.set("op", operationId);
    if (/^[A-Za-z0-9_-]{1,64}$/.test(secret)) echo.set("s", secret);
    return back(`${PAGE}?${echo.toString()}`);
  }
  return back(`${PAGE}?ok=${restored}`);
}
