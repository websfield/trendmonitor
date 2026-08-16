import { requireAdmin } from "@respin/auth";

export default async function AdminPage() {
  // Per-page gate (client-nav caches layouts — gate-completeness test).
  await requireAdmin();
  // Placeholder — curation queue, sources, margin dashboard arrive in M6 (REQ-J01).
  return (
    <section>
      <h1>Admin</h1>
      {/* /admin/config was reachable only by typed URL (round-2 NOTE 6). */}
      <p>
        <a href="/admin/config">Runtime configuration</a> — credit costs, tier
        allowances, the pack price, grace and pause bounds, the Stripe price
        map. Every save appends a new version.
      </p>
      <p>Other admin surfaces arrive in later milestones.</p>
    </section>
  );
}
