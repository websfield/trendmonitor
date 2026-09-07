// PURE presentation for `/studio/frameworks` (slice 7, R5b/R5c). The page
// component does the gate, the scoping and the reads; this file only renders
// what it is handed — so every state below (no profile, viewer, a plan without
// private frameworks, an empty private list, a saturated shared row, a refusal
// code) is reachable from a test with a fixture instead of a database. Same
// contract `studio-view.tsx` and `usage-view.tsx` hold.
//
// ---------------------------------------------------------------------------
// THE TWO LISTS ARE SEPARATE, AND THAT IS R5c's ANTI-MASQUERADE HALF.
//
// "Private rows cannot masquerade as shared/curated rows." Two things enforce
// it here and neither is a comment: the shared list and the private list come
// from DIFFERENT reads (`sharedFrameworkLibrary()` has no scope at all because
// a shared row belongs to nobody; `listPrivateFrameworks(scope, profileId)`
// carries both scope columns), and every row prints its OWN `visibility` — so a
// private row rendered under the shared heading would say `private` on itself.
// A reader can see the defect; it does not need a query to find it.
//
// WHAT NEVER APPEARS AT ALL (R5b): a proposed, rejected, superseded or retired
// SHARED framework. That is not this file's doing and must not become this
// file's doing — `recommendable()` in `@respin/db` is the one predicate, shared
// by the library reader and the generation reader, so "what the screen shows"
// and "what a draft can use" cannot drift. A filter here would be a second
// answer.
import { Badge } from "../../../ui/badge";
import { Banner } from "../../../ui/banner";
import {
  FRAMEWORK_INTRO,
  PRIVATE_LIBRARY_NOTE,
  SATURATION_HEADING,
  SHARED_LIBRARY_NOTE,
  confidenceNote,
  saturationNote,
} from "./form-copy";
import { FrameworkPanel, type FrameworkPanelProps } from "./framework-panel";
import type { FrameworkView } from "./view-state";

export type FrameworksViewProps = {
  profileName: string | null;
  /** The curated library, approved and non-retired only (R5b). */
  shared: FrameworkView[];
  /** This creator's own live frameworks, newest first (R5c). */
  privateFrameworks: FrameworkView[];
  /** The write controls, or null when this reader may not curate. */
  curate: FrameworkPanelProps | null;
  /** Why the write controls are absent, if they are. Role, plan, or pause. */
  block: { reason: string; kind: "role" | "plan" | "paused" } | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  onboardingHref: string;
  studioHref: string;
  /**
   * The creator's own export, per profile and per format.
   *
   * NULLABLE, because there is no export to link to without a creator profile:
   * `app/api/export/route.ts` requires `?profile` and `?format` and refuses a
   * request without them, so a bare `/api/export` is a link that 400s. The
   * note that carries it renders only in the profile branch; the type is what
   * stops a future reader moving it into the other one.
   */
  exportHref: string | null;
};

function FrameworkRow({ framework }: { framework: FrameworkView }) {
  return (
    <li
      data-testid="framework-row"
      data-visibility={framework.visibility}
      style={{ marginBottom: "1rem" }}
    >
      <div>
        <strong>{framework.name}</strong>{" "}
        {/*
          THE ROW SAYS WHAT IT IS. `visibility` is printed from the row's own
          column, so a private framework can never read as curated library
          content whatever list it lands in — R5c's anti-masquerade rule, as a
          property of the markup rather than of the query alone.

          WORDS, NEVER COLOUR ALONE (DESIGN.md): every badge here carries its
          own text.
        */}
        <Badge
          variant={framework.visibility === "shared" ? "outline" : "dashed"}
          data-testid="framework-visibility"
        >
          {framework.visibility === "shared" ? "Shared library" : "Yours"}
        </Badge>{" "}
        <Badge variant="outline" data-testid="framework-version">
          v{framework.version}
        </Badge>{" "}
        <Badge
          variant={framework.approved ? "filled" : "dashed"}
          data-testid="framework-status"
        >
          {framework.approved ? "In use" : "Not approved yet"}
        </Badge>
        {framework.retired ? (
          <>
            {" "}
            <Badge variant="dashed" data-testid="framework-retired">
              Retired
            </Badge>
          </>
        ) : null}
      </div>
      <p className="muted" data-testid="framework-confidence">
        {/*
          THE RUNG AND WHAT IT COUNTS, together. `confidence` is derived from
          the number of evidence entries and never typed, and it is the one
          field on a framework that reads like a score — so the screen prints
          what it counts rather than the word alone.
        */}
        {framework.confidence} — {confidenceNote(framework.confidence)}
      </p>
      <p>{framework.whyItConverts}</p>
      {framework.beats.length > 0 ? (
        <ol data-testid="framework-beats">
          {framework.beats.map((beat, i) => (
            <li key={i}>{beat}</li>
          ))}
        </ol>
      ) : null}
      {framework.applicability.length > 0 ? (
        <ul className="muted" data-testid="framework-applicability">
          {framework.applicability.map((a, i) => (
            <li key={i}>
              For {a.goal} · {a.niche}
              {a.note.trim().length > 0 ? ` — ${a.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {framework.testedCaveats.length > 0 ? (
        <ul className="muted" data-testid="framework-caveats">
          {framework.testedCaveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
      {framework.evidenceEntries.length > 0 ? (
        <ul className="muted" data-testid="framework-evidence">
          {framework.evidenceEntries.map((e, i) => (
            <li key={i}>
              {e.ref}
              {e.observation.trim().length > 0 ? ` — ${e.observation}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted" data-testid="framework-saturation">
        {SATURATION_HEADING}: {saturationNote(framework.saturation)}
      </p>
      {/*
        REQ-D02's WARNING, CARRIED FROM THE ROW. `SATURATION_NOTICE` is attached
        by `@respin/db`'s readers rather than written here — "a warning that
        every consumer has to reimplement is a warning one of them will omit" —
        so this renders the value it was handed and holds no sentence of its
        own. Every row is unmeasured until a framework-level population/window
        exists, so the limitation is unconditional.
      */}
      <Banner
        title="Framework limitation"
        data-testid="framework-saturation-notice"
        role="note"
      >
        <p className="muted">{framework.saturationNotice}</p>
      </Banner>
    </li>
  );
}

export function FrameworksView({
  profileName,
  shared,
  privateFrameworks,
  curate,
  block,
  error,
  onboardingHref,
  studioHref,
  exportHref,
}: FrameworksViewProps) {
  return (
    <section>
      <h1>Frameworks</h1>

      {error ? (
        <Banner
          title={error.title}
          data-testid="frameworks-action-error"
          role="alert"
        >
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}

      <p className="muted" data-testid="frameworks-intro">
        {FRAMEWORK_INTRO}
      </p>

      <div className="panel" data-testid="frameworks-shared">
        <h2 style={{ marginTop: 0 }}>The shared library</h2>
        <p className="muted" data-testid="frameworks-shared-note">
          {SHARED_LIBRARY_NOTE}
        </p>
        {shared.length === 0 ? (
          <p className="muted" data-testid="frameworks-shared-empty">
            This server has no approved shared frameworks. That is not something
            you can change from here — an operator seeds them. Your drafts still
            run; they name the shape they are using in plain words instead of
            naming a framework.
          </p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {shared.map((f) => (
              <FrameworkRow key={f.id} framework={f} />
            ))}
          </ul>
        )}
      </div>

      {profileName === null ? (
        // A NAMED STATE, NOT AN ERROR — the same shape `/studio` uses. A
        // private framework belongs to a creator profile, so with none selected
        // there is nothing to own one.
        <div className="panel" data-testid="frameworks-no-profile">
          <p style={{ margin: 0 }}>
            There is no creator profile selected for this workspace, so there is
            nobody for a private framework to belong to. Create one on the{" "}
            <a href={onboardingHref}>onboarding page</a> and come back — the
            shared library above is available either way.
          </p>
        </div>
      ) : (
        <div className="panel" data-testid="frameworks-private">
          <h2 style={{ marginTop: 0 }}>{profileName}&apos;s own frameworks</h2>
          <p className="muted" data-testid="frameworks-private-note">
            {PRIVATE_LIBRARY_NOTE}
          </p>
          {privateFrameworks.length > 0 ? (
            <ul style={{ listStyle: "none", paddingLeft: 0 }}>
              {privateFrameworks.map((f) => (
                <FrameworkRow key={f.id} framework={f} />
              ))}
            </ul>
          ) : null}
          {block ? (
            <p
              className="muted"
              // ONE MARKER PER KIND, so a test can tell WHICH refusal a
              // reader got. A paused workspace and a Free one are refused for
              // different reasons and told different things; collapsing them
              // into one marker is how "the screen said something" becomes
              // indistinguishable from "the screen said the right thing".
              data-testid={
                block.kind === "plan"
                  ? "frameworks-not-in-plan"
                  : block.kind === "paused"
                    ? "frameworks-blocked-paused"
                    : "frameworks-blocked-role"
              }
            >
              {block.reason}
            </p>
          ) : null}
          {curate ? <FrameworkPanel {...curate} /> : null}
          <p className="muted" data-testid="frameworks-export-note">
            Every framework you write — every version of it, including the ones
            you have superseded or retired — travels in your{" "}
            {exportHref === null ? (
              "export"
            ) : (
              <a href={exportHref}>export</a>
            )}
            . Drafts you make on the <a href={studioHref}>studio page</a> record
            which framework versions they used, so a framework you change later
            does not rewrite an explanation you already have.
          </p>
        </div>
      )}
    </section>
  );
}
