// /admin/model-spend — the MINIMAL operator reader over
// workspace_spend_monthly (R14, slice 2b; renamed from /admin/margin in
// slice 2b-c because the page shows cost, not margin, and its old route name
// claimed the number this project has been burned by claiming before —
// docs/plans/respin-finish-phase-2b.md's route-rename requirement). Per-page
// requireAdmin (client-nav caches layouts — gate-completeness test). Gate,
// fetch, render — presentation lives in model-spend-view.tsx (R15's
// forbidden-word scan runs against that file's real rendered output, the
// same split /usage uses for the same reason: nothing in this repo executes
// a page component directly, it needs a session and a database).
import { requireAdmin } from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { logRefusal } from "../../../(product)/safe-log";
import {
  AdminModelSpendView,
  type AdminModelSpendViewProps,
} from "./model-spend-view";

export default async function AdminModelSpendPage() {
  await requireAdmin();

  let props: AdminModelSpendViewProps;
  try {
    const result = await respinDb.reconcileSpend();
    props = { ok: true, result };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[admin-model-spend] reconciliation unavailable", err);
    props = { ok: false };
  }

  return <AdminModelSpendView {...props} />;
}
