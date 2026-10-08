// /changelog — REQ-H01's changelog entrypoint (Phase 10a task 5). A checked-in
// list, dated, in plain words; every entry names shipped engineering, never
// evidence the product does not have. Static-rendered.
import type { Metadata } from "next";
import { LandingFooter, LandingHeader } from "../landing-sections";
import { openDeletionScopes } from "../deletion-status";
import { changelogFor } from "./entries";

// Rendered per request (P5-R1 amendment): the deletion entry reads the
// deployment's request flag, which a build-time render would bake in.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Respin changelog",
  description: "What has shipped in Respin, by date.",
};

export default function ChangelogPage() {
  return (
    <div className="landing">
      <div className="landing-stripe" />
      <LandingHeader />
      <section className="landing-section legal-section">
        <h1>Changelog</h1>
        <p className="hero-sub">What has shipped, by date. Engineering only: a line here says the feature exists, not that it has been measured.</p>
        <dl className="changelog">
          {changelogFor(openDeletionScopes()).map((entry) => (
            <div key={entry.date + entry.title} className="changelog-entry">
              <dt>
                <span className="script-tc">{entry.date}</span> {entry.title}
              </dt>
              <dd>{entry.summary}</dd>
            </div>
          ))}
        </dl>
      </section>
      <LandingFooter />
    </div>
  );
}
