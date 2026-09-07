// Read-only app-facing facade for runtime config (the respinDb precedent).
// The WRITE surface lives in ./admin-server, import-restricted to app/(admin).
import { getServerDb } from "@respin/db";
import {
  configVersionContents,
  getActiveConfig,
  type ActiveConfig,
} from "./index";
import type { RespinConfigV1 } from "./schema";

export type { ActiveConfig };
export type { RespinConfigV1, SubscriptionTier } from "./schema";
export { ConfigUnavailableError } from "./index";

export function getActiveConfigServer(): Promise<ActiveConfig> {
  return getActiveConfig(getServerDb());
}

// THE HISTORICAL DOCUMENTS, for the ONE reader that judges past attempts:
// `/admin/model-spend` resolves each `model_usage` row's own
// `config_version` rather than pricing history by today's document (billing
// gate, 2026-09-02). READ-ONLY, and on this entrypoint rather than
// ./admin-server because the reconciliation page is not the config editor.
export function configVersionContentsServer(
  versions: readonly number[]
): Promise<Map<number, RespinConfigV1>> {
  return configVersionContents(getServerDb(), versions);
}
