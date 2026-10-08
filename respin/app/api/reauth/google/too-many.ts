// R-166 (gate M5): the response both Google re-authentication routes give when
// the server's per-account or per-client limit refuses (`rate_limited`). A
// real 429, so a client or proxy sees the limit; the body is a fixed sentence
// naming no account, client or count.
export const GOOGLE_REAUTH_TOO_MANY_BODY =
  "Too many re-authentication attempts. Wait fifteen minutes, then try again from billing settings.";

export function googleReauthTooManyAttempts(): Response {
  return new Response(GOOGLE_REAUTH_TOO_MANY_BODY, {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Retry-After": "900",
    },
  });
}
