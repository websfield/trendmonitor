// @respin/auth server surface. Sanctioned for app/** (default-deny lint):
// getSessionUser, requireUser, requireAdmin, authHandlers, isGoogleConfigured,
// adminAllowed, parseAdminAllowlist, and types. createAuth/getAuth stay
// package/tests-only. Client components use @respin/auth/client.
export {
  createAuth,
  isGoogleConfigured,
  resetPasswordLogLine,
  type Auth,
  type CreateAuthOptions,
} from "./create-auth";
export { adminAllowed, parseAdminAllowlist } from "./allowlist";
export {
  authHandlers,
  getAuth,
  getSessionUser,
  requireAdmin,
  requireUser,
  type SessionUser,
} from "./server";
