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

function back(path: string, req: Request): Response {
  return Response.redirect(new URL(path, req.url), 303);
}

export async function POST(req: Request): Promise<Response> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413 });
  }
  let form: FormData;
  try {
    form = await req.formData();
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
    return back(`${PAGE}?${echo.toString()}`, req);
  }
  return back(`${PAGE}?ok=${restored}`, req);
}
