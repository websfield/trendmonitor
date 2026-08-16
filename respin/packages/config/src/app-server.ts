// Read-only app-facing facade for runtime config (the respinDb precedent).
// The WRITE surface lives in ./admin-server, import-restricted to app/(admin).
import { getServerDb } from "@respin/db";
import { getActiveConfig, type ActiveConfig } from "./index";

export type { ActiveConfig };
export type { RespinConfigV1, SubscriptionTier } from "./schema";
export { ConfigUnavailableError } from "./index";

export function getActiveConfigServer(): Promise<ActiveConfig> {
  return getActiveConfig(getServerDb());
}
