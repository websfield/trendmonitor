// GET /api/reauth/google/start — R-164 step 1: send the signed-in person to
// Google for a FRESH authentication (`prompt=login`, `max_age=0`, PKCE, a
// signed single-use state bound to THIS session, a nonce). Not Better Auth's
// sign-in: that is ordinary session creation, which R-118 says never counts.
// Gated like every other API route: `requireUser()` first, so no session means
// the sign-in page, never a challenge.
import {
  beginGoogleReauthenticationForCurrentSession,
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

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    return redirectTo(await beginGoogleReauthenticationForCurrentSession());
  } catch (err) {
    rethrowNextControlFlow(err);
    // The log carries a code from the flow's CLOSED list only (R-166).
    const refusal = googleReauthLogCode(err);
    logRefusal("[google-reauth] start refused", err, { refusal });
    // R-166 (gate M5): per account and per client, server-side.
    if (refusal === "rate_limited") return googleReauthTooManyAttempts();
    // No Google account on this session's user, Google not configured, or the
    // session is not live: the same billing refusal the password arm gives.
    return redirectTo(`${BILLING_PATH}?e=billing_reauthentication`);
  }
}
