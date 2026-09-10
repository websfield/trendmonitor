// /admin/activation — the internal activation report (Phase 10a plan C5,
// R-121). Per-page requireAdmin (client-nav caches layouts —
// gate-completeness test). Gate, fetch through the one activation seam,
// render; the presentation and its wording live in activation-view.tsx.
import { requireAdmin } from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { logRefusal } from "../../../(product)/safe-log";
import { AdminActivationView, type ActivationViewProps } from "./activation-view";

export default async function AdminActivationPage() {
  await requireAdmin();
  let props: ActivationViewProps;
  try {
    const asOf = new Date();
    const cohorts = await respinDb.activationReport(asOf);
    props = { ok: true, cohorts, asOf: asOf.toISOString() };
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[admin-activation] report unavailable", err);
    props = { ok: false };
  }
  return <AdminActivationView {...props} />;
}
