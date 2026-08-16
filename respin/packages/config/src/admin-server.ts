// ADMIN-ONLY write surface (tenancy plan-gate round-2: a global config write
// must not rest on route gating alone). The eslint allowlist restricts this
// entrypoint to app/(admin)/** — everywhere else it is unimportable.
//
// The READ side of the editor lives here too, deliberately: the version history
// names who appended each version, and the validator exists to serve the write
// form. Neither belongs on ./app-server, which every page in app/** may import.
import { getServerDb } from "@respin/db";
import {
  appendConfigVersion,
  listConfigVersions,
  validateConfigContent,
  type ConfigIssue,
  type ConfigValidation,
  type ConfigVersionSummary,
  type RespinConfigV1,
} from "./index";

export { validateConfigContent };
export type { ConfigIssue, ConfigValidation, ConfigVersionSummary };

export function appendConfigVersionServer(
  content: RespinConfigV1,
  createdBy: string
): Promise<number> {
  return appendConfigVersion(getServerDb(), content, createdBy);
}

export function listConfigVersionsServer(
  limit?: number
): Promise<ConfigVersionSummary[]> {
  return listConfigVersions(getServerDb(), limit);
}
