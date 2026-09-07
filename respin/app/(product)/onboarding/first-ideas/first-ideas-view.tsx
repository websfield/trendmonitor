// PURE presentation for `/onboarding/first-ideas` — PRD B04 (slice 7, R5).
//
// The page component does the gate, the scoping and the reads; this file only
// renders what it is handed, so every state (no profile, no activated brain,
// viewer, paused, mode not in this plan, a result, a refusal code) is reachable
// from a test with a fixture instead of a database. Same contract
// `studio-view.tsx` and `onboarding-view.tsx` hold.
//
// WHAT THIS SCREEN MAY NOT SAY. It is a creator's FIRST output, in their first
// session, and the product has logged no result of theirs at all — so nothing
// here may suggest these ideas are shaped by what works for them, and nothing
// may state how they will do. `tests/first-ideas-ui.test.tsx` scans every
// rendered state against `tests/support/forbidden-claims.ts`' shared canon plus
// PERFORMANCE_CLAIMS, exactly as `/studio` is scanned.
//
// IT IS NOT UNDER THE `NOT_BUILT_YET` BAN, and that is a deliberate difference
// from the rest of `/onboarding`. Those bans exist for screens that do not do
// the thing; this one does — it runs the real pipeline, spends a real credit
// and stores a real generation — so vague words on the control that spends the
// credit would be worse, not safer, exactly as R21 argued for `/studio`.
import { Banner } from "../../../ui/banner";
import { FirstIdeasPanel, type FirstIdeasPanelProps } from "./first-ideas-panel";

export type FirstIdeasViewProps = {
  profileName: string | null;
  /** The control, or null when there is no profile to run it for. */
  run: FirstIdeasPanelProps | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  onboardingHref: string;
  brainHref: string;
  studioHref: string;
};

export function FirstIdeasView({
  profileName,
  run,
  error,
  onboardingHref,
  brainHref,
  studioHref,
}: FirstIdeasViewProps) {
  return (
    <section>
      <h1>Your first ideas</h1>

      {error ? (
        <Banner
          title={error.title}
          data-testid="first-ideas-action-error"
          role="alert"
        >
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}

      {profileName === null ? (
        // A NAMED STATE, NOT AN ERROR — the same shape `/studio` uses. Without a
        // creator profile there is nobody to write as.
        <div className="panel" data-testid="first-ideas-no-profile">
          <p style={{ margin: 0 }}>
            There is no creator profile selected for this workspace yet, so
            there is nobody to write as. Create one on the{" "}
            <a href={onboardingHref}>onboarding page</a>, add some of their
            posts, and activate a brain — then come back.
          </p>
        </div>
      ) : (
        <div className="panel" data-testid="first-ideas">
          <h2 style={{ marginTop: 0 }}>The first thing for {profileName}</h2>
          <p className="muted">
            This runs on the brain you confirmed and activated on the{" "}
            <a href={brainHref}>brain page</a>. Everything after this happens on
            the <a href={studioHref}>studio page</a>, which uses the same brain
            and has the other modes and the revision control.
          </p>
          {run ? <FirstIdeasPanel {...run} /> : null}
        </div>
      )}
    </section>
  );
}
