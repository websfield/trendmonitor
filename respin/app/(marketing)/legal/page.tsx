// /legal — the terms and privacy entrypoint REQ-H01 names (Phase 10a task 5).
// HONEST PLACEHOLDER, NOT A CONTRACT: the terms and the privacy statement are
// published in Phase 10c after legal review (plan 10a deferral ledger, R-122's
// jurisdiction assumption). Until then this page says what the product does
// with what a visitor types, in plain words, and states that the documents are
// not yet published rather than pretending a link exists.
import type { Metadata } from "next";
import { LandingFooter, LandingHeader } from "../landing-sections";
import { SAMPLE_SPIN_RETENTION } from "../sample-spin/disclosure";
import { legalDeletionSentence, openDeletionScopes } from "../deletion-status";

// Rendered per request (P5-R1 amendment): the deletion sentence reads the
// deployment's request flag, which a build-time render would bake in.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Respin terms and privacy",
  description: "Where Respin's terms and privacy statement stand.",
};

export default function LegalPage() {
  return (
    <div className="landing">
      <div className="landing-stripe" />
      <LandingHeader />
      <section className="landing-section legal-section">
        <h1>Terms and privacy</h1>
        <p className="hero-sub">
          The terms of service and the privacy statement are not published yet. They are reviewed before the public launch, and this page will carry them.
        </p>
        <h2>What is true today</h2>
        <ul className="legal-list">
          <li>The Sample Spin on the landing page keeps neither the idea you type nor the output it shows you &mdash; {SAMPLE_SPIN_RETENTION.toLowerCase()} That provider receives the text in order to answer; this product stores none of it. It records the cost of the model calls, with the request&rsquo;s random id, as a financial record kept for the period the law requires, and a keyed hash of your connection address for twenty-four hours, to allow one run per day.</li>
          <li>A signed-in creator&rsquo;s brain is context handed to the model with each request; it is never used to build or update a model, and nothing in it changes without an explicit confirmation.</li>
          {/*
            DERIVED FROM THE REQUEST FLAG (audit P1-A1, then P5-R1's
            2026-10-05 amendment): RESPIN_DELETION_REQUEST_SCOPES unset renders
            P1-A1's not-yet-open sentence; an open scope renders the enabled
            one. `tests/marketing-claims.test.tsx` pins both renders.
          */}
          <li>{legalDeletionSentence(openDeletionScopes())}</li>
        </ul>
      </section>
      <LandingFooter />
    </div>
  );
}
