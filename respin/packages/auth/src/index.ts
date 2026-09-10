// @respin/auth server surface. Sanctioned for app/** (default-deny lint):
// getSessionUser, reauthenticateCurrentSessionWithPassword, requireUser,
// requireAdmin, authHandlers, isGoogleConfigured, adminAllowed,
// parseAdminAllowlist, and types. createAuth/getAuth stay
// package/tests-only. Client components use @respin/auth/client.
export {
  createAuth,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  emailVerificationLogLine,
  isGoogleConfigured,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  resetPasswordLogLine,
  type Auth,
  type CreateAuthOptions,
} from "./create-auth";
export {
  classifyResendResponse,
  createResendMailPort,
  isResendConfigured,
  RESEND_ORIGIN,
  resendMailPortFromEnv,
  type ResendMailPortOptions,
} from "./resend-mail";
export { adminAllowed, parseAdminAllowlist } from "./allowlist";
export { canonicalClientIp, proxyAttestedClientIp } from "./client-ip";
export {
  authHandlers,
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
  getAuth,
  getSessionUser,
  requireAdmin,
  requireUser,
  reauthenticateCurrentSessionWithPassword,
  type SessionUser,
} from "./server";
