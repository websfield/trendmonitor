// /admin/model-spend — the MINIMAL operator reader over
// workspace_spend_monthly (R14, slice 2b; renamed from /admin/margin in
// slice 2b-c because the page shows cost, not margin, and its old route name
// claimed the number this project has been burned by claiming before —
// docs/plans/respin-finish-phase-2b.md's route-rename requirement). Per-page
// requireAdmin (client-nav caches layouts — gate-completeness test). Gate,
// fetch, render — presentation lives in model-spend-view.tsx (R15's
// forbidden-word scan runs against that file's real rendered output, the
// same split /usage uses for the same reason: a page component needs a
// session and a database, so rendering ONE costs a mock of both — which is
// why the presentation is proved against the view. This page IS executed,
// with those two mocked, in `tests/model-spend-page.test.tsx`, for the one
// decision that lives here and nowhere else: the argument it passes to
// `reconcileSpend`.
import { requireAdmin } from "@respin/auth";
import { respinDb } from "@respin/db";
// R-81/R-82: which purposes price their first billable attempt at zero.
// `@respin/db` cannot answer that (it may not import `@respin/credits`), so
// this page — which can import both — carries the answer across. Passing the
// wrong list here would silently hide, or invent, unbilled attempts.
//
// DERIVED FROM THE ACTIVE DOCUMENT, NEVER A CONSTANT (R-82): the price of the
// included build is `min(0)` in the schema and any admin can append a version
// that raises it, at which point the claim holder owes a debit and must be
// reported like every other attempt. So the list is computed from the same
// document this reconciliation is about. `tests/model-spend-page.test.tsx`
// executes this page and asserts the argument it passes.
import { includedBuildPurposes } from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
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
    // INSIDE THE TRY, so a config that cannot be read renders "could not be
    // loaded" rather than a report built on a guessed exemption. There is no
    // fallback list: the document is the authority or there is no report.
    const { content } = await getActiveConfigServer();
    const result = await respinDb.reconcileSpend(includedBuildPurposes(content));
    props = { ok: true, result };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[admin-model-spend] reconciliation unavailable", err);
    props = { ok: false };
  }

  return <AdminModelSpendView {...props} />;
}
