// The rendered face of `WorkspaceAccessError` (`workspace_access` copy).
//
// `billing-errors.ts` has carried that copy since Phase 4 landed, and NOTHING
// on the page path could reach it: every page called
// `respinDb.withWorkspace(...)` OUTSIDE its try, so the M2 multi-workspace
// refusal ("user belongs to multiple workspaces — an explicit workspaceId is
// required") and the unknown-user refusal both went to Next's default error
// page (billing/tenancy round-2 NOTE). A written remedy with no way to reach it
// is the same defect as no remedy at all.
//
// PURE, so a test renders it with a fixture — the page component itself needs a
// session and a database and is executed by no test in this repo.
import type { BillingErrorCopy } from "./billing-errors";

export function AccessRefusal({ copy }: { copy: BillingErrorCopy }) {
  return (
    <section>
      <h1>This workspace is not available</h1>
      <div
        className="banner"
        data-testid="workspace-access-error"
        role="alert"
      >
        <strong>{copy.title}</strong>
        <p className="muted">{copy.detail}</p>
      </div>
    </section>
  );
}
