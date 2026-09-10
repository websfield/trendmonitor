import { requireAdmin } from "@respin/auth";

export default async function AdminPage() {
  // Per-page gate (client-nav caches layouts — gate-completeness test).
  await requireAdmin();
  // Placeholder — curation queue, sources arrive in M6 (REQ-J01). The
  // minimal spend reader landed in slice 2b; the FULL REQ-G05 margin
  // dashboard (cost vs revenue, per-tier gross margin) is still slice 10b.
  return (
    <section>
      <h1>Admin</h1>
      {/* /admin/config was reachable only by typed URL (round-2 NOTE 6). */}
      <p>
        <a href="/admin/config">Runtime configuration</a> — credit costs, tier
        allowances, the pack price, grace and pause bounds, the Stripe price
        map. Every save appends a new version.
      </p>
      <p>
        <a href="/admin/model-spend">Model spend</a> — what we paid the
        provider, by month and tier, and the reconciliation against
        workspace_spend_monthly.
      </p>
      <p>
        <a href="/admin/activation">Activation</a> — exact daily signup cohorts:
        numerator, denominator, exclusions and metric version, with what each
        number cannot say.
      </p>
      <p>Other admin surfaces arrive in later milestones.</p>
    </section>
  );
}
