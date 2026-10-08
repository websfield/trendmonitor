// GET /api/reauth/google/callback — R-164 step 2. Google returns here with the
// code and the signed state. `completeGoogleReauthenticationForCurrentSession`
// consumes the state (single-use), requires THIS request's session to be the
// one the challenge was bound to, exchanges the code, verifies the ID token,
// and stamps the bound session only after the server has checked `auth_time`
// (present, not before the challenge, inside R-118's window) and `sub` (the
// linked Google account). A token without `auth_time` is refused: fail closed.
import {
  completeGoogleReauthenticationForCurrentSession,
  googleReauthLogCode,
  requireUser,
} from "@respin/auth";
import { rethrowNextControlFlow } from "../../../../../lib/next-control-flow";
import { logRefusal } from "../../../../(product)/safe-log";
import { googleReauthTooManyAttempts } from "../too-many";

const BILLING_PATH = "/settings/billing";

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function GET(req: Request): Promise<Response> {
  await requireUser();
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  try {
    await completeGoogleReauthenticationForCurrentSession(state, code);
  } catch (err) {
    rethrowNextControlFlow(err);
    // Which check refused is not surfaced to the page (it would say which half
    // of a forged callback was right); the server log carries the code, from
    // the flow's CLOSED list only (R-166).
    const refusal = googleReauthLogCode(err);
    logRefusal("[google-reauth] callback refused", err, { refusal });
    if (refusal === "rate_limited") return googleReauthTooManyAttempts();
    return redirectTo(`${BILLING_PATH}?e=billing_reauthentication`);
  }
  return redirectTo(`${BILLING_PATH}?reauth=google`);
}
