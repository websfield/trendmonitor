// The SANCTIONED surface for app/** (phase-2 handoff contract, audience split):
// app code gets high-level, always-scoped operations and never the raw
// connection — a handler holding createDb + the sql tag could bypass
// withWorkspace with zero schema imports, so the connection stays in here.
// The lint in respin/eslint.config.mjs enforces this default-deny for STATIC
// imports; the dynamic-import source scan in respin/tests/import-boundary.test.ts
// covers `await import(...)`, which no-restricted-imports does not see.
import { createDb, type Db } from "./client";
import { ensureUserWorkspace, type BootstrapParams } from "./bootstrap";
import { withWorkspace, type WorkspaceCtx } from "./with-workspace";

let cached: Db | undefined;

/**
 * Lazy, call-time connection (no env read at import time — testability, R-16).
 * Exported for OTHER PACKAGES (e.g. @respin/auth's adapter) — the default-deny
 * lint keeps it unimportable from app/**, same as createDb.
 */
export function getServerDb(): Db {
  cached ??= createDb(process.env.DATABASE_URL);
  return cached;
}

export const respinDb = {
  ensureUserWorkspace: (params: BootstrapParams) =>
    ensureUserWorkspace(getServerDb(), params),
  withWorkspace: (ctx: WorkspaceCtx) => withWorkspace(getServerDb(), ctx),
};
