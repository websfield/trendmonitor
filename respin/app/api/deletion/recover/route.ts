// POST /api/deletion/recover — cancel an identity deletion from the emailed
// recovery link (Phase 10b-1 Task 8, plan C2). The session-free entry the
// gate-completeness suite allowlists, for the same reason the Stripe webhook
// is: the person's sessions were revoked when the deletion was acknowledged,
// so no session can exist. What authenticates the call instead is the
// single-use recovery secret from the mail, exchanged for a bounded recovery
// session, then a fresh password proof — each step in @respin/auth /
// @respin/db and rate-limited by client-IP digest. Link possession alone
// reaches nothing.
import {
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
} from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";

const PAGE = "/recover-deletion";
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
    return back(`${PAGE}?e=refused`, req);
  }
  return back(`${PAGE}?ok=${restored}`, req);
}
