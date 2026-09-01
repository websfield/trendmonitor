// PURE presentation for `/studio` (slice 6, stage D). The page component does
// the gate, the scoping and the reads; this file only renders what it is handed
// — so every state below (no profile, no activated brain, viewer, paused, a
// draft, an honest refusal, a refusal code) is reachable from a test with a
// fixture instead of a database. That is the same contract `usage-view.tsx` and
// `onboarding-view.tsx` hold, and it is what lets the honesty scan run over
// this screen's REAL copy rather than a sample of it.
//
// WHAT THIS SCREEN MAY NOT SAY (non-negotiable 6, and R20/R21 in particular).
// It hands a creator something they might publish, and the product has logged
// no result of theirs at all — the results loop is slice 9 — so nothing here
// may suggest a draft is shaped by what has worked for them, and nothing may
// state how it is going to do. `tests/studio-ui.test.tsx` scans every rendered
// state of this file against the shared canon in
// `tests/support/forbidden-claims.ts` plus that file's PERFORMANCE_CLAIMS.
//
// AND WHAT IT MAY: `/studio` LEFT the `NOT_BUILT_YET` ban list in this slice
// (R21), because it genuinely generates now — see `STUDIO_POSITIVE_ASSERTIONS`
// in that same file for the markers that replaced the three bans, and why a
// word leaving a ban has to be paid for rather than simply removed.
import { Banner } from "../../ui/banner";
import { StudioPanel, type StudioPanelProps } from "./studio-panel";

export type StudioViewProps = {
  /** The creator this draft would be for, or null when none is selected. */
  profileName: string | null;
  /** The generate control, or null when there is no profile to run it for. */
  run: StudioPanelProps | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  onboardingHref: string;
  brainHref: string;
  usageHref: string;
};

export function StudioView({
  profileName,
  run,
  error,
  onboardingHref,
  brainHref,
  usageHref,
}: StudioViewProps) {
  return (
    <section>
      <h1>Studio</h1>

      {error ? (
        <Banner title={error.title} data-testid="studio-action-error" role="alert">
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}

      {profileName === null ? (
        // A NAMED STATE, NOT AN ERROR. A creator with no profile has nothing to
        // generate for, and telling them where to start is the honest answer —
        // the same shape `/brain` uses for the same situation.
        <div className="panel" data-testid="studio-no-profile">
          <p style={{ margin: 0 }}>
            There is no creator profile selected for this workspace yet, so
            there is nobody to write as. Create one on the{" "}
            <a href={onboardingHref}>onboarding page</a>, add some of their
            posts, and activate a brain — then come back.
          </p>
        </div>
      ) : (
        <div className="panel" data-testid="studio-generate">
          <h2 style={{ marginTop: 0 }}>Hook set for {profileName}</h2>
          <p className="muted">
            A hook set is written from the brain you confirmed and activated for
            this creator on the <a href={brainHref}>brain page</a>, plus what you
            type in below. Every charge appears in your credit history on the{" "}
            <a href={usageHref}>usage page</a>.
          </p>
          {run ? <StudioPanel {...run} /> : null}
        </div>
      )}
    </section>
  );
}
