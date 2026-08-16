import { requireUser } from "@respin/auth";

export default async function StudioPage() {
  // The real gate, per-page (client-nav caches layouts — gate-completeness test).
  await requireUser();
  // Honest empty shell (build-plan M0 acceptance: "an empty product shell").
  return (
    <section>
      <h1>Studio</h1>
      <p>Your workspace is ready. Script generation arrives in a later milestone.</p>
    </section>
  );
}
