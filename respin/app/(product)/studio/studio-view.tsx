// PURE presentation for `/studio` (slice 6, stage D; widened by slice 7). The
// page component does the gate, the scoping and the reads; this file only
// renders what it is handed — so every state below (no profile, no activated
// brain, viewer, paused, a draft, an honest refusal, a refusal code) is
// reachable from a test with a fixture instead of a database. That is the same
// contract `usage-view.tsx` and `onboarding-view.tsx` hold, and it is what lets
// the honesty scan run over this screen's REAL copy rather than a sample of it.
//
// WHAT THIS SCREEN MAY NOT SAY (non-negotiable 6, and R20/R21 in particular).
// It hands a creator something they might publish, and the product has logged
// no result of theirs at all — the results loop is slice 9 — so nothing here
// may suggest a draft is shaped by what has worked for them, and nothing may
// state how it is going to do. `tests/studio-ui.test.tsx` scans every rendered
// state of this file against the shared canon in
// `tests/support/forbidden-claims.ts` plus that file's PERFORMANCE_CLAIMS.
//
// SLICE 7 ADDS THE HARDEST CASE OF THAT RULE: this screen now RECORDS FEEDBACK,
// and a reaction button is exactly where a reader forms the belief that the
// product is adjusting to them. `learn`, `improv` and `train` are banned on
// every creator-facing surface and this is the screen where the ban earns its
// keep — `FEEDBACK_TODAY` in `./run-copy.ts` is the sentence that says what
// feedback does and does not do without reaching for any of the three.
//
// AND WHAT IT MAY: `/studio` LEFT the `NOT_BUILT_YET` ban list in slice 6
// (R21), because it genuinely generates now — see `STUDIO_POSITIVE_ASSERTIONS`
// in that same file for the markers that replaced the three bans, and why a
// word leaving a ban has to be paid for rather than simply removed.
import { Banner } from "../../ui/banner";
import { StudioPanel, type StudioPanelProps } from "./studio-panel";
import { VOICE_DOCUMENT_NEEDED } from "./run-copy";

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
  /** Where the creator curates their own frameworks (R5c). */
  frameworksHref: string;
  /** An active brain without its voice document needs an explicit remedy. */
  brainActiveWithoutVoice: boolean;
};

export function StudioView({
  profileName,
  run,
  error,
  onboardingHref,
  brainActiveWithoutVoice,
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
          <h2 style={{ marginTop: 0 }}>Make something for {profileName}</h2>
          {brainActiveWithoutVoice ? (
            <Banner title="Voice document needed" data-testid="studio-no-voice" role="status">
              <p className="muted">{VOICE_DOCUMENT_NEEDED}</p>
            </Banner>
          ) : null}
          {run ? <StudioPanel {...run} /> : null}
        </div>
      )}
    </section>
  );
}
