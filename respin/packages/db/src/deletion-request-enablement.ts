// Phase 10b-1 rollout: deletion REQUEST creation is a deployment flag, per
// scope, separate from the worker's erasure flag.
//
// The plan's rollout order is "deploy additively with deletion request
// creation disabled ... then enable identity deletion, then profile deletion,
// then workspace deletion under separate flags". `RESPIN_DELETION_ERASURE_SCOPES`
// (worker) gates the irreversible half; this gates the front door, so a
// deployment can carry the whole lifecycle and expose none of it until the
// journal, the mail sender and the legal review are in place. Unset or blank
// = no scope accepts a request, which is the launch state. CANCELLATION IS
// NEVER GATED HERE: rollback may disable new requests but must let every
// in-flight operation be cancelled or completed (plan "Rollout, rollback").
import type { DeletionScope } from "./lifecycle-schema";

export const DELETION_REQUEST_SCOPES_ENV = "RESPIN_DELETION_REQUEST_SCOPES";
export const DELETION_SCOPES = ["identity", "profile", "workspace"] as const satisfies readonly DeletionScope[];
// Exhaustive by construction: a fourth scope in the enum is a type error here,
// not a scope the page's status record silently omits.
const _everyScopeListed: Record<DeletionScope, true> = { identity: true, profile: true, workspace: true };
void _everyScopeListed;
export const REQUESTS_DISABLED_CODE = "requests_disabled";

/**
 * Parse a comma-separated closed scope list. An unknown token throws rather
 * than silently enabling nothing or everything; blank/unset yields the empty
 * set. Shared by the worker's erasure flag and the app's request flag so the
 * two cannot drift in what they accept.
 */
export function parseDeletionScopeList(
  raw: string | undefined,
  envName: string
): ReadonlySet<DeletionScope> {
  const trimmed = raw?.trim();
  if (!trimmed) return new Set();
  const enabled = new Set<DeletionScope>();
  for (const token of trimmed.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (!(DELETION_SCOPES as readonly string[]).includes(token)) {
      throw new Error(`${envName} names an unknown scope; allowed: ${DELETION_SCOPES.join(",")}`);
    }
    enabled.add(token as DeletionScope);
  }
  return enabled;
}

export type DeletionRequestEnablement = Readonly<{
  requestsEnabled(scope: DeletionScope): boolean;
}>;

export function resolveDeletionRequestEnablement(
  env: Readonly<Record<string, string | undefined>>
): DeletionRequestEnablement {
  const enabled = parseDeletionScopeList(env[DELETION_REQUEST_SCOPES_ENV], DELETION_REQUEST_SCOPES_ENV);
  return { requestsEnabled: (scope) => enabled.has(scope) };
}

/** The refusal every request facade throws for a scope the deployment has not opened. */
export function assertDeletionRequestsEnabled(
  enablement: DeletionRequestEnablement,
  scope: DeletionScope
): void {
  if (!enablement.requestsEnabled(scope)) {
    throw new Error(`deletion_refused:${REQUESTS_DISABLED_CODE}:${scope}`);
  }
}
