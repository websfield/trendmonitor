import { requireUser } from "@respin/auth";
import { Panel } from "../../ui/panel";

export default async function StudioPage() {
  // The real gate, per-page (client-nav caches layouts — gate-completeness test).
  await requireUser();
  // Honest empty shell (build-plan M0 acceptance: "an empty product shell"),
  // restyled as a Signal Panel — same copy, later milestones fill it.
  return (
    <section>
      <h1>Studio</h1>
      <Panel>
        <p style={{ margin: 0 }}>
          Your workspace is ready. Script generation arrives in a later milestone.
        </p>
      </Panel>
    </section>
  );
}
