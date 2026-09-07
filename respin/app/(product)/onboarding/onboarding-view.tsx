// PURE presentation for /onboarding. The page does the gate, the scoping and
// the reads; this file renders what it is handed, so every state — no profile,
// cap reached, empty list, refusal, viewer, paused, run refused, run charged —
// is reachable from a test with a fixture rather than a database.
//
// NON-NEGOTIABLE 6, AND IT IS THE POINT OF THIS SCREEN'S COPY (R12). The
// temptation is real — an onboarding screen wants to promise what comes next —
// and the compliance and tenancy gates both caught this file doing it anyway:
// "you can change the name later" was a guarantee with no rename path anywhere
// in the tree (2026-08-27). What this screen says is exactly what it does.
//
// THE RULE HAS NARROWED TWICE, DELIBERATELY, AND ONLY TWICE.
//
// Slice 2a: this screen spends a credit for real, so it must say so — R18
// requires the control to state the price before it is pressed, asserted
// POSITIVELY in `tests/onboarding-ui.test.tsx` rather than by having stopped
// banning a word.
//
// Slice 3: it drafts a real voice brain from the creator's own posts, so it may
// say that too. What replaced "brain"/"voice rules" on the forbidden list is
// narrower and was never banned before — `learn`, `improve`, `accurate`,
// `understands you`. This slice still generates no script, analyses nothing,
// and learns nothing, and no sentence here may imply otherwise.
//
// THE PASTE PANEL'S DISCLOSURE IS PART OF THAT RULE (compliance gate BLOCK,
// 2026-08-29). It used to end "nothing else reads them yet — this screen keeps
// them, and that is all it does", which slice 3 made FALSE two panels above the
// control that sends those posts to a vendor — a false data-handling statement
// at the moment of collection. `tests/stale-disclosure.test.ts` now pairs that
// sentence with the code fact that retired it.
import type { ReactNode } from "react";
import { Banner } from "../../ui/banner";
import { buttonClass } from "../../ui/button";
import { capSentence, characterCount, referenceCountSentence } from "./copy";
import { FocusOnMount } from "./focus-on-mount";
import { SubmitButton } from "./submit-button";
import {
  RunInferencePanel,
  type RunInferencePanelProps,
} from "./run-inference-panel";
import {
  CandidateSafetyPanel,
  type SafetyAction,
} from "./candidate-safety-panel";
import {
  CreatorProfilePanel,
  type CreatorProfilePanelProps,
} from "./creator-profile-panel";

/** A server action, or a plain URL when a test renders this component. */
export type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type PastedPost = {
  id: string;
  createdAt: Date;
  content: string;
};

/** A reference post — someone else's work, kept to find the mechanism in it. */
export type ReferencePost = {
  id: string;
  createdAt: Date;
  content: string;
  sourceUrl: string | null;
};

/** Why a write control is unavailable, in words the reader can act on. */
export type WriteBlock = { reason: string } | null;

export type OnboardingViewProps = {
  step: "create-profile" | "paste-posts";
  /**
   * The plan's cap — computed server-side, never here, and NULL when the server
   * could not read it. Nullable rather than defaulted: a default is a number
   * this component would be inventing, which is the one thing non-negotiable 6
   * forbids on a screen a paying customer reads.
   */
  plan: { tier: string; cap: number; used: number } | null;
  capReached: boolean;
  /**
   * Why the CREATE form is unavailable, if it is — role or an open pause.
   *
   * SEPARATE FROM `pasteBlock`, because the server treats the two writes
   * differently: `createProfile` refuses under a pause (a per-tier allowance is
   * an entitlement) and `appendOwnPost` deliberately does not (refusing it
   * would throw away text the person typed — R-35 §3). One shared block told a
   * paused creator a rule the server does not enforce.
   */
  createBlock: WriteBlock;
  /** Why the PASTE form is unavailable, if it is — role only. */
  pasteBlock: WriteBlock;
  /**
   * Why the REFERENCE form is unavailable, if it is — role only, same as
   * `pasteBlock`. A reference post survives a pause for the identical reason
   * an own post does: refusing it would throw away text the person typed
   * (R-35 §3), and a reference is not a per-tier entitlement any more than an
   * own post is.
   */
  referenceBlock: WriteBlock;
  profileName: string | null;
  posts: PastedPost[];
  /** True when the list was clamped by the server's page size. */
  morePosts: boolean;
  /** This profile's reference posts, newest first (slice 4). */
  referencePosts: ReferencePost[];
  /** How many reference posts this profile holds, and the server's ceiling. */
  referenceCount: number;
  referenceCountMax: number;
  /** The server's per-post character ceiling, so the copy cannot drift from it. */
  postLimit: number;
  /** The server's display-name ceiling, for the same reason. */
  nameLimit: number;
  /**
   * How many posts this page shows — NOT the per-post character ceiling.
   *
   * Its own prop because conflating the two rendered "Showing the most recent
   * 20000." beside 25 rows: `postLimit` was interpolated where the page size
   * belonged, on the one screen non-negotiable 6 governs, inside copy written
   * to answer a BLOCK about honesty. Three reviewers found it independently
   * (2026-08-27); the covering test asserted the surrounding prose and never
   * the digits.
   */
  pageSize: number;
  createProfileAction: FormAction;
  addPostAction: FormAction;
  addReferenceAction: FormAction;
  profilePanel?: CreatorProfilePanelProps;
  selectionRequired?: boolean;
  candidateSafetyAction?: SafetyAction;
  /**
   * The metered run (slice 2a), or NULL where there is no profile to run for.
   *
   * Nullable rather than always-present because the create step has no profile
   * id to bind, and a control that spends money must not be rendered in a state
   * where the thing it would spend against does not exist yet.
   */
  run:
    | (RunInferencePanelProps & {
        /**
         * The pre-press disclosure, computed server-side by `preSendSentence`
         * so the corpus bound is STATED rather than implied away (compliance
         * gate round 2, 2026-08-29): "the posts you saved above" was false the
         * moment a creator had more posts than one inference reads.
         */
        sendSentence: string;
      })
    | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
};

// Panels, banners and muted text are Signal classes (app/globals.css).
// 44px min, both axes — the Tier-1 touch bar the production gate measured this
// screen against. The launch wedge is Shorts creators, i.e. phones, and these
// are the primary actions of the first screen in the product.
const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};
const field: React.CSSProperties = {
  minHeight: "44px",
  padding: "0.6rem",
  fontSize: "1rem",
};

/** ISO day — the server and the browser must agree, and a test must be able to
 *  assert an exact string (the `usage-view` precedent). */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A pasted post, shortened for a list row.
 *
 * The FULL text is rendered too, inside a collapsed `<details>` — the
 * production gate's point that a truncated row is what makes a silently
 * truncated PASTE invisible to the person it happened to. The copy says posts
 * are "stored exactly as you type them"; a reader has to be able to check that.
 */
export const PREVIEW_MAX = 140;

export function preview(content: string, max = PREVIEW_MAX): string {
  const points = [...content];
  if (points.length <= max) return content;
  return points.slice(0, max).join("") + "…";
}

function Refusal({ error }: { error: { title: string; detail: string } }): ReactNode {
  return (
    // The Signal Banner: strong neutral border, plain words, no alarm red.
    <Banner
      title={error.title}
      data-testid="onboarding-error"
      role="alert"
      // FOCUSABLE, and focused on render by the client island below.
      //
      // `role="alert"` alone does NOT announce here: a refusal arrives via a
      // full-page redirect, so the live region is present at load — precisely
      // the case screen readers do not announce — and focus resets to the top
      // of the document. The previous test asserted the ATTRIBUTE existed,
      // which is this repo's "a comment claiming a property is not the
      // property" in test form (production gate, 2026-08-27).
      tabIndex={-1}
      id="onboarding-refusal"
    >
      <p className="muted">{error.detail}</p>
      <FocusOnMount targetId="onboarding-refusal" />
    </Banner>
  );
}

/** Renders the cap sentence wherever the plan is known — BOTH steps. */
function PlanLine({ plan }: { plan: OnboardingViewProps["plan"] }): ReactNode {
  if (!plan) return null;
  return (
    <p className="muted" data-testid="cap-sentence">
      {capSentence(plan.tier, plan.cap, plan.used)}
    </p>
  );
}

export function OnboardingView({
  step,
  plan,
  capReached,
  createBlock,
  pasteBlock,
  referenceBlock,
  profileName,
  posts,
  morePosts,
  referencePosts,
  referenceCount,
  referenceCountMax,
  postLimit,
  nameLimit,
  pageSize,
  createProfileAction,
  addPostAction,
  addReferenceAction,
  profilePanel,
  selectionRequired = false,
  candidateSafetyAction,
  run,
  error,
}: OnboardingViewProps): ReactNode {
  return (
    <section>
      <h1>Set up your creator profile</h1>
      {error ? <Refusal error={error} /> : null}

      {step === "create-profile" ? (
        <div className="panel">
          <h2>Name this creator</h2>
          <p className="muted">
            A creator profile is one person&rsquo;s account and its posts. Name
            it however you refer to that creator.
          </p>
          <PlanLine plan={plan} />
          {capReached ? (
            <p className="muted" data-testid="cap-reached">
              You have used every creator profile your plan includes, so there
              is no form here. Change your plan on the billing page to add
              another.
            </p>
          ) : createBlock ? (
            <p className="muted" data-testid="create-blocked">
              {createBlock.reason}
            </p>
          ) : (
            <form action={createProfileAction}>
              <label htmlFor="displayName">Creator name</label>{" "}
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                autoComplete="off"
                // NO `maxLength`. HTML `maxlength` truncates a PASTE as a user
                // edit — silently, with no message and nothing rendered — and
                // it counts UTF-16 units while every limit in this slice counts
                // code points, so an emoji-bearing value was cut at roughly
                // half the stated limit. The server refuses by name instead,
                // and the reader is told the limit up front (production gate).
                style={{ ...field, minWidth: "18rem" }}
                aria-describedby="displayName-limit"
              />{" "}
              <SubmitButton className={buttonClass("primary")} style={control}>Create profile</SubmitButton>
              <p id="displayName-limit" className="muted">
                One line of visible text, up to {nameLimit} characters.
              </p>
            </form>
          )}
        </div>
      ) : (
        <>
          {profilePanel ? <CreatorProfilePanel {...profilePanel} /> : null}
          {selectionRequired ? (
            <div className="panel" data-testid="profile-selection-required">
              <h2>Choose a creator to continue</h2>
              <p className="muted">
                Select a creator profile above. No posts, interview answers, or
                brain data are shown until you choose one.
              </p>
            </div>
          ) : (
            <>
          {/*
            Slice 3b, Stage B1. A plain link, not folded into this page's own
            forms — the structured interview is its own screen with its own
            save/review/submit flow (`./interview/page.tsx`), reachable as
            soon as a profile exists, independent of how many posts have been
            pasted below.
          */}
          <div className="panel" data-testid="interview-link-panel">
            <h2>Answer the structured interview</h2>
            <p className="muted">
              Goals, positioning, your north-star metric, and words or vibes
              to avoid — a separate set of questions from the posts below,
              answered in your own words.
            </p>
            <a href="/onboarding/interview" data-testid="interview-link">
              Start the interview
            </a>
          </div>

          {/*
            SLICE 7, PRD B04 — "onboarding ends by ... the creator's first three
            ideas through their new brain, so the aha moment happens inside the
            first session". A plain link, like the interview panel above, and
            for the same reason: the step is its own screen with its own control
            and its own money copy.

            IT IS A SIGNPOST, NOT A CONTROL, and the order is stated rather than
            enforced here: the step needs an activated brain and refuses without
            one, with copy. Putting a spending button on this page would be a
            second spend control on a screen whose own control does something
            else.

            THE WORDING AVOIDS `generat`, `script`, `hook` AND `analy`, which
            `tests/onboarding-ui.test.tsx` bans on this screen — this screen
            does not do that thing, and a link to one that does must not read as
            a claim that it does.
          */}
          <div className="panel" data-testid="first-ideas-link-panel">
            <h2>Make this creator&apos;s first ideas</h2>
            <p className="muted">
              Once you have confirmed and activated a brain for this creator,
              this is the first thing the product makes for them — ideas, each
              with an opening line, the point it makes, and the framework behind
              it. It costs credits like anything else the product makes.
            </p>
            <a href="/onboarding/first-ideas" data-testid="first-ideas-link">
              Go to the first ideas step
            </a>
          </div>

          <div className="panel">
            <h2>Add your own past posts</h2>
            <p className="muted">
              Paste the text of posts you wrote yourself, one at a time. They
              are stored as you typed them — only line endings are normalised —
              against <strong>{profileName}</strong>. They are the material the
              voice draft below is built from, which means they are sent to our
              model provider when you build it.
            </p>
            <PlanLine plan={plan} />
            {pasteBlock ? (
              <p className="muted" data-testid="paste-blocked">
                {pasteBlock.reason}
              </p>
            ) : (
              <form action={addPostAction}>
                <label htmlFor="content">Post text</label>
                <textarea
                  id="content"
                  name="content"
                  required
                  rows={6}
                  // No `maxLength` here either, and for the sharper reason: a
                  // truncated post is hashed as the record and becomes the
                  // corpus later slices index `source_evidence` offsets into.
                  style={{ ...field, display: "block", width: "100%" }}
                  aria-describedby="content-limit"
                />
                <p id="content-limit" className="muted">
                  One post, up to {postLimit.toLocaleString("en-US")} characters.
                  Longer pastes are refused, never shortened.
                </p>
                {/*
                  R8's ATTESTATION, and it is an ACT rather than the sentence
                  above the box.

                  Why it exists: a post saved here is labelled `own_post`, and
                  that label is what switches off both of R-3's controls — a
                  reference post may not become the provenance of a voice rule,
                  and reference posts are the corpus the echo bar checks a brain
                  against. Slice 3 is where the label starts deciding what the
                  product believes about a person's voice, so "we told them in
                  a paragraph" stops being enough.

                  NO `required` ATTRIBUTE, deliberately. The browser check is a
                  courtesy that a disabled-JS submit, a replayed POST or curl
                  walks straight past; the enforcement is `appendOwnPost`'s
                  `attested` parameter, which has no default. Marking it
                  `required` here would make the real refusal unreachable from
                  a browser and therefore untested by the walk.

                  It is NOT verification, and the copy does not imply that it
                  is — nothing in this product checks authorship. What it buys
                  is that the label rests on something the creator did.
                */}
                <p style={{ marginTop: "0.6rem" }}>
                  <label
                    htmlFor="attest"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      minHeight: "44px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      id="attest"
                      name="attest"
                      type="checkbox"
                      style={{ width: "1.15rem", height: "1.15rem" }}
                    />
                    <span>I wrote this post myself.</span>
                  </label>
                </p>
                <p className="muted" data-testid="attest-note">
                  Only posts you wrote are used to work out how you write. We do
                  not check this — we record what you tell us, and it decides
                  how the post is treated.
                </p>
                <SubmitButton className={buttonClass("primary")} style={control}>Save post</SubmitButton>
              </form>
            )}
          </div>

          <div className="panel">
            <h2>Add posts you admire (optional)</h2>
            {/*
              R2 (slice 4): NO attestation control here, and the copy says what
              the label means instead of asking for one. A reference post is
              BY DEFINITION not the creator's own work, so reusing R8's "I
              wrote this myself" control would ask for an attestation that is
              false on its face.

              R12/R13: this panel names the ACTUAL control (a check against
              repeating a reference post's own wording) and does not promise
              the product analyses, learns from, or safely reuses anything —
              R-3 is a control, not a guarantee.

              COMPLIANCE GATE BLOCK (2026-08-29): the previous copy said
              "nothing here is copied", an unqualified guarantee that is FALSE
              for the one brain kind (`strategy`) `REFERENCE_BARRED_KINDS`
              deliberately exempts (REQ-D04, R-9) — a mechanism note may quote
              up to 240 characters of a reference post verbatim as its
              evidence (echo.ts's `REFERENCE_QUOTE_MAX_CHARS`). The corrected
              sentence names what IS true without promising the stronger
              thing: your own writing rules are never built from a reference
              post's wording, and a short line may still appear as evidence
              behind a noted pattern.
            */}
            <p className="muted">
              Add a post someone else wrote that you admire — the kind of
              thing you would like to make your own version of. It is kept
              only so a later draft can be checked against it: none of your
              own writing rules are ever built from its wording, though a
              short line from it may still appear as the quoted evidence
              behind a noted pattern.
            </p>
            <p className="muted" data-testid="reference-count-sentence">
              {referenceCountSentence(referenceCount, referenceCountMax)}
            </p>
            {referenceBlock ? (
              <p className="muted" data-testid="reference-blocked">
                {referenceBlock.reason}
              </p>
            ) : (
              <form action={addReferenceAction}>
                <label htmlFor="reference-content">Reference post text</label>
                <textarea
                  id="reference-content"
                  name="referenceContent"
                  required
                  rows={6}
                  style={{ ...field, display: "block", width: "100%" }}
                  aria-describedby="reference-content-limit"
                />
                <p id="reference-content-limit" className="muted">
                  One post, up to {postLimit.toLocaleString("en-US")} characters.
                  Longer pastes are refused, never shortened.
                </p>
                <label htmlFor="reference-source-url">Where it's from (optional)</label>{" "}
                <input
                  id="reference-source-url"
                  name="sourceUrl"
                  type="text"
                  autoComplete="off"
                  style={{ ...field, minWidth: "18rem" }}
                />
                <SubmitButton className={buttonClass("secondary")} style={control}>
                  Add reference post
                </SubmitButton>
              </form>
            )}
            {referencePosts.length > 0 ? (
              <ul data-testid="reference-list" className="posts-list">
                {referencePosts.map((p) => (
                  <li key={p.id} className="post-row">
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {preview(p.content)}
                    </div>
                    <span className="post-meta">
                      {day(p.createdAt)} · {characterCount(p.content)} characters
                      {p.sourceUrl ? <> · {p.sourceUrl}</> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {candidateSafetyAction ? (
            <CandidateSafetyPanel action={candidateSafetyAction} />
          ) : null}

          {run ? (
            <div className="panel">
              <h2>Draft the rules for how you write</h2>
              {/*
                EVERY SENTENCE HERE IS A STATEMENT ABOUT WHAT HAPPENS, and the
                three things it must say are the three a creator cannot find
                out afterwards: their posts leave this server, a draft is not
                in force, and they decide field by field.

                It does NOT say the draft will be accurate, that the product
                learns, or that it improves — R12 and non-negotiable 6. The
                verb is "draft", never "analyse" and never "learn".
              */}
              <p className="muted">
                {/*
                  The first sentence is computed server-side (`preSendSentence`)
                  because it must state the CORPUS BOUND — "the posts you saved
                  above" implied all of them while the read was bounded, and the
                  bound's number lives in config, which this component must not
                  read (compliance gate round 2, 2026-08-29).
                */}
                {run.sendSentence} Nothing is in force yet: you read every rule
                beside its quote, confirm each one, and activate it yourself.
              </p>
              <RunInferencePanel
                action={run.action}
                costSentence={run.costSentence}
                block={run.block}
                refusalCopy={run.refusalCopy}
                fallbackCopy={run.fallbackCopy}
              />
            </div>
          ) : null}

          <div className="panel">
            <h2>Your posts ({posts.length}{morePosts ? "+" : ""})</h2>
            {posts.length === 0 ? (
              <p className="muted" data-testid="posts-empty">
                No posts yet. Paste one above — the box takes the text of a
                single post.
              </p>
            ) : (
              <>
                <ul data-testid="posts-list" className="posts-list">
                  {posts.map((p) => (
                    <li key={p.id} className="post-row">
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {preview(p.content)}
                      </div>
                      <span className="post-meta">
                        {day(p.createdAt)} · {characterCount(p.content)} characters
                      </span>
                      {characterCount(p.content) > PREVIEW_MAX ? (
                        <details>
                          <summary
                            className="muted"
                            style={{
                              cursor: "pointer",
                              minHeight: "44px",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            Show the whole post
                          </summary>
                          <div
                            style={{ whiteSpace: "pre-wrap", marginTop: "0.4rem" }}
                            data-testid="post-full"
                          >
                            {p.content}
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {morePosts ? (
                  <p className="muted" data-testid="posts-clamped">
                    Showing the most recent {pageSize}. Older posts are stored
                    and are not shown here yet.
                  </p>
                ) : null}
              </>
            )}
          </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
