// PURE presentation for /brain — the confirm-and-activate screen.
//
// THIS IS THE SLICE'S HEADLINE AND THE REASON THE PROVENANCE SUBSTRATE EXISTS.
// Every rule the product believes about a creator is rendered here BESIDE THE
// QUOTE FROM THEIR OWN POST OR INTERVIEW ANSWER that it rests on (R4/R10), or
// beside a plain statement that there is no quote (R11). A rule without one or
// the other is not renderable — and the claim this comment used to make about
// WHY was the wrong pairing (compliance gate, 2026-08-29). `quote` and `source`
// being nullable together was never the risk; the shape that failed open was a
// STATED claim with no quote, which rendered the rule, no quote, no named
// absence, and a checkbox saying "Yes — this is right". `claimsFor` refuses
// that shape now, so the guarantee holds one layer up, in the data this
// component is handed.
//
// THREE KINDS, ONE SCREEN (slice 3b, Stage B2, R6): `voice`, `strategy` and
// `killtest` render through the SAME `Claim`/`ClaimsList` machinery — the
// difference between them is which field labels apply and whether a claim's
// quote came from an `own_post` or a `creator_authored` interview answer
// (`quoteIntro` in `./copy` says which). `strategy` additionally splits its
// declared north-star metric into its own panel (R7/R9) rather than listing it
// among `pillars`/`goals` undifferentiated.
//
// THE PAGE DOES THE GATE, THE SCOPING AND THE READS. This file renders what it
// is handed, so every state — no draft, a draft with placeholders, a partly
// confirmed draft, a fully confirmed draft, an active version, a viewer, a
// pause — is reachable from a test with a fixture rather than a database. The
// same rule `onboarding-view.tsx` obeys, and the reason `RunOutcome` exists.
//
// WHAT THIS SCREEN MAY NOT SAY. It is the first surface in the product that
// states a belief about a person, so non-negotiable 6 binds hardest here: it
// never says the rules are accurate, that anything was learned, that the
// product understands the creator, or that it will improve. It says what was
// drafted, from what, and what activating does. For `strategy`/`killtest`
// specifically (R10) it never says a creator-authored declaration — a goal, a
// metric, a banned word — was learned, verified or measured: the creator
// TOLD us; nothing here checked it against anything.
import type { ReactNode } from "react";
import { CHECK, type BrainClaimView, type BrainVersionView } from "@respin/db";
import { Banner } from "../../ui/banner";
import { buttonClass } from "../../ui/button";
import { FocusOnMount } from "../onboarding/focus-on-mount";
import { SubmitButton } from "../onboarding/submit-button";
import { BrainEditForm } from "./edit-form";
import type { BrainEditAction } from "./edit-state";
import {
  COHERENT_ACTIVATE_MEANING,
  BRAIN_EDIT_CHECK_COPY,
  BRAIN_EDIT_MEANING,
  BRAIN_EXPORT_JSON_COPY,
  BRAIN_EXPORT_MARKDOWN_COPY,
  claimLabel,
  confirmProgress,
  INTERVIEW_ANSWERED_NOTHING_TO_STATE,
  isMetricPointer,
  killtestClaimLabel,
  OPTIONAL_METRIC_BLANK_MEANING,
  PROPOSED_INTRO,
  quoteIntro,
  screenAbsenceSentence,
  STRATEGY_METRIC_FIELD_LABELS,
  strategyClaimLabel,
} from "./copy";

/** A server action, or a plain URL when a test renders this component. */
export type FormAction = string | ((formData: FormData) => void | Promise<void>);
export type BrainEditFormAction = string | BrainEditAction;

/** Why a decision control is unavailable, in words the reader can act on. */
export type DecideBlock = { reason: string } | null;

/** One brain kind's current state, derived from its ordered `readBrainHistory` result. */
export type BrainKindSectionData = {
  proposed: BrainVersionView | null;
  active: BrainVersionView | null;
};

/** Immutable proposal membership, projected by the scoped page reader. */
export type ProposalHistoryItem = {
  proposal: {
    id: string;
    source: "results" | "feedback";
    status: "proposed" | "accepted" | "rejected" | "stale" | "superseded";
    evidenceDigest: string;
    createdAt: Date;
    acceptedActivationId: string | null;
    acceptedBrainDocId: string | null;
    decisionUserId: string | null;
    decisionRole: "owner" | "editor" | null;
    decisionAt: Date | null;
  };
  resultEvidenceIds: string[] | null;
  feedbackEvidenceIds: string[] | null;
};

/** Exact, scoped asset counts. A missing reader is never rendered as zero. */
export type BrainAssetCounts = {
  brainVersions: number;
  testedRules: number;
  loggedResults: number;
  feedback: number;
};

/**
 * Select the actionable state from the facade's newest-first history.
 *
 * A proposal at or behind the active version is stale lifecycle residue. It
 * remains in history, but must never regain confirm, edit or activate controls.
 */
export function selectCurrentBrainState(
  history: BrainVersionView[]
): BrainKindSectionData {
  const active = history.find((item) => item.status === "active") ?? null;
  const proposed =
    history.find(
      (item) =>
        item.status === "proposed" &&
        (active === null || item.version > active.version)
    ) ?? null;
  return { proposed, active };
}

export type BrainViewProps = {
  /** The creator this brain belongs to, so the page never says "your" vaguely. */
  profileName: string;
  voice: BrainKindSectionData;
  strategy: BrainKindSectionData;
  killtest: BrainKindSectionData;
  voiceHistory: BrainVersionView[];
  strategyHistory: BrainVersionView[];
  killtestHistory: BrainVersionView[];
  performanceHistory: BrainVersionView[] | null;
  proposalHistory: ProposalHistoryItem[] | null;
  assetCounts: BrainAssetCounts | null;
  /**
   * Per target, true when the creator SUBMITTED the interview and answered
   * at least one field belonging to that target, but the target still has
   * no document — the "I decided there's nothing here" case (a decided-empty
   * list, or every touched field left not-decided), distinct from never
   * having started the interview at all. Tenancy gate finding, 2026-08-30:
   * without this, both states rendered the identical "Nothing drafted yet…
   * Complete the interview" — telling a creator who gave a real, deliberate
   * answer to go do something they already did.
   */
  interviewTouchedButUndrafted: { strategy: boolean; killtest: boolean };
  /** Why confirm/activate are unavailable — role, or an open pause. Shared: one workspace, one gate. */
  decideBlock: DecideBlock;
  confirmVoiceAction: FormAction;
  confirmStrategyAction: FormAction;
  confirmKillTestAction: FormAction;
  editVoiceAction: BrainEditFormAction;
  editStrategyAction: BrainEditFormAction;
  editKillTestAction: BrainEditFormAction;
  editMetricAction: BrainEditFormAction;
  /**
   * THREE SEPARATE BOUND ACTIONS, all calling the SAME underlying capability
   * (`respinDb.activateBrainCoherent`, R8) with a DIFFERENT `brainDocId` — the
   * page binds each to whichever kind's proposed version exists, exactly the
   * way `confirmVoiceAction` was already bound per document in slice 3.
   */
  activateVoiceAction: FormAction;
  activateStrategyAction: FormAction;
  activateKillTestAction: FormAction;
  /** Export is a read, so these remain available to viewers and while paused. */
  exportJsonHref: string | null;
  exportMarkdownHref: string | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
};

// 44px min, both axes — the Tier-1 touch bar this product's launch wedge
// (Shorts creators, i.e. phones) is measured against.
const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
  fontSize: "1rem",
};

/** ISO day — server and browser must agree, and a test must assert an exact
 *  string (the `usage-view` / `onboarding-view` precedent). */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Refusal({ error }: { error: { title: string; detail: string } }): ReactNode {
  return (
    // The same pattern as `/onboarding`'s redirect refusal, and for the same
    // reason: a refusal that arrives via a full-page redirect is present in the
    // DOM at load, which is precisely the case screen readers do NOT announce.
    // The focus island is what makes it heard.
    <Banner
      title={error.title}
      data-testid="brain-error"
      role="alert"
      tabIndex={-1}
      id="brain-refusal"
    >
      <p className="muted">{error.detail}</p>
      <FocusOnMount targetId="brain-refusal" />
    </Banner>
  );
}

/**
 * One claim: the rule, the quote behind it, and the decision.
 *
 * `readOnly` renders the same facts without the checkbox — used for the ACTIVE
 * version, which is a record of a decision already taken rather than a decision
 * to take.
 *
 * `labelFor` and `placeholderAbsence` TRAVEL IN rather than being imported
 * fixed, because this one component now renders three kinds' claims — the
 * label vocabulary and the "nothing here" sentence both differ by kind (R7,
 * R11).
 *
 * `placeholderAbsence` ARRIVES ALREADY RESOLVED — the caller has run
 * `screenAbsenceSentence(kind, version.reason)` for the version these claims
 * belong to. It cannot be resolved here: a claim knows nothing about why its
 * version exists, and the sentence depends on that (compliance gate round 2).
 */
function Claim({
  claim,
  readOnly,
  labelFor,
  placeholderAbsence,
}: {
  claim: BrainClaimView;
  readOnly: boolean;
  labelFor: (pointer: string) => string | null;
  placeholderAbsence: string;
}): ReactNode {
  const label = labelFor(claim.pointer);
  // AN UNKNOWN POINTER IS A REFUSAL, NOT A FALLBACK. Rendering the raw pointer
  // would leak an internal name onto a screen making claims about a person, and
  // it would do it silently — the page catches this and says so; see the page.
  if (label === null) throw new Error(`unlabelled claim position ${claim.pointer}`);
  const id = `c${claim.pointer.replace(/[^a-zA-Z0-9]/g, "_")}`;

  return (
    <li className="post-row" data-testid="claim" data-pointer={claim.pointer}>
      <p className="muted" style={{ margin: 0 }}>
        {label}
      </p>

      {claim.isPlaceholder ? (
        // R11 — THE NAMED ABSENCE. Never a ratio, never a zero, never a
        // confidence score. The absence is OURS: we could not find it (voice)
        // or the creator left it undecided (strategy/killtest) — either way, a
        // different sentence from "you do not do this".
        <p data-testid="claim-absent" style={{ margin: "0.2rem 0" }}>
          {placeholderAbsence}
        </p>
      ) : (
        <p data-testid="claim-value" style={{ margin: "0.2rem 0", whiteSpace: "pre-wrap" }}>
          {claim.value}
        </p>
      )}

      {claim.quote !== null && claim.source !== null ? (
        // R4/R10 — THE HEADLINE. The quote and the input it came from,
        // together. `<blockquote>` and not a styled `<p>`: this is somebody
        // else's words (the creator's own), quoted, and the element that says
        // so is the one a screen reader also announces as a quotation.
        <>
          <p className="muted" style={{ margin: "0.4rem 0 0.2rem" }} data-testid="quote-label">
            {quoteIntro(claim.source.inputClass, day(claim.source.postedAt))}
          </p>
          <blockquote
            data-testid="claim-quote"
            style={{
              margin: 0,
              paddingLeft: "0.8rem",
              borderLeft: "3px solid var(--border-strong)",
              whiteSpace: "pre-wrap",
            }}
          >
            {claim.quote}
          </blockquote>
        </>
      ) : null}

      {claim.evidenceAnnotation ? (
        <p
          className="muted"
          data-testid="evidence-annotation"
          style={{ margin: "0.4rem 0 0", borderLeft: "3px solid var(--border-strong)", paddingLeft: "0.8rem" }}
        >
          Evidence note: {claim.evidenceAnnotation}.
        </p>
      ) : null}

      {readOnly ? (
        <p className="muted" data-testid="claim-recorded" style={{ marginTop: "0.4rem" }}>
          {/*
            DERIVED FROM THE RECORD, not from the render position (tenancy +
            compliance gates, 2026-08-29). This branch used to print "You
            confirmed this." unconditionally while `claim.confirmed` sat right
            there on the prop — true today only because activation enforces full
            confirmation, and a statement about a human decision should come
            from the record of that decision, not from where it is being drawn.
          */}
          {!claim.confirmed
            ? "This was not confirmed."
            : claim.isPlaceholder
              ? "You confirmed this as still unknown."
              : "You confirmed this."}
        </p>
      ) : (
        <p style={{ marginTop: "0.4rem" }}>
          <label
            htmlFor={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            <input
              id={id}
              // ONE CHECKBOX PER POSITION, NAMED BY THE POINTER. Per-field
              // confirmation (REQ-B02) is the tick; the submit records the set
              // of ticks. `confirmBrainDocFields` replaces the whole array, so
              // one POST per tick would be read-modify-write on a column two
              // tabs can race — the losing tab silently un-confirming fields
              // the creator had already decided.
              name={`confirm:${claim.pointer}`}
              type="checkbox"
              defaultChecked={claim.confirmed}
              style={{ width: "1.15rem", height: "1.15rem" }}
            />
            <span>
              {claim.isPlaceholder
                ? "Yes — leave this as still unknown"
                : "Yes — this is right"}
            </span>
          </label>
          {/*
            R12 — WHAT WAS SHOWN TRAVELS WITH THE DECISION.

            The placeholder flag the creator SAW is submitted, not re-derived on
            the server. `confirmBrainDocFields` refuses when it disagrees with
            the stored value, so a document that changed under the reader is a
            named refusal rather than a confirmation of something they never
            saw. Deriving it server-side would make that disagreement invisible,
            which is the whole failure the check exists to catch.

            Hidden, and it is untrusted like every other field on the wire — the
            server is what refuses a mismatch, not this input's obscurity.
          */}
          <input
            type="hidden"
            name={`shown:${claim.pointer}`}
            value={claim.isPlaceholder ? "unknown" : "stated"}
          />
        </p>
      )}
    </li>
  );
}

function ClaimsList({
  claims,
  readOnly,
  labelFor,
  placeholderAbsence,
  testId,
}: {
  claims: BrainClaimView[];
  readOnly: boolean;
  labelFor: (pointer: string) => string | null;
  placeholderAbsence: string;
  testId: string;
}): ReactNode {
  return (
    <ul data-testid={testId} className="posts-list">
      {claims.map((c) => (
        <Claim
          key={c.pointer}
          claim={c}
          readOnly={readOnly}
          labelFor={labelFor}
          placeholderAbsence={placeholderAbsence}
        />
      ))}
    </ul>
  );
}

/**
 * `strategy`'s claim list, with the declared north-star metric split into its
 * OWN panel (R7/R9) — "not buried as an undifferentiated claim among
 * `pillars`/`goals`". Both groups still render through `ClaimsList`/`Claim`
 * unchanged, so a metric field is confirmed exactly like any other claim; only
 * where it appears on the page differs.
 */
function StrategyClaims({
  claims,
  readOnly,
  placeholderAbsence,
  testIdPrefix,
}: {
  claims: BrainClaimView[];
  readOnly: boolean;
  /** Already resolved for THIS version — see `Claim`'s docblock. */
  placeholderAbsence: string;
  testIdPrefix: string;
}): ReactNode {
  const general = claims.filter((c) => !isMetricPointer(c.pointer));
  const metric = claims.filter((c) => isMetricPointer(c.pointer));
  return (
    <>
      <ClaimsList
        claims={general}
        readOnly={readOnly}
        labelFor={strategyClaimLabel}
        placeholderAbsence={placeholderAbsence}
        testId={`${testIdPrefix}-claims`}
      />
      {metric.length > 0 ? (
        <div className="panel" data-testid={`${testIdPrefix}-metric-panel`}>
          <h3>Your north-star metric</h3>
          <p className="muted">
            What you told us you will judge this content by.
          </p>
          <ClaimsList
            claims={metric}
            readOnly={readOnly}
            labelFor={strategyClaimLabel}
            placeholderAbsence={placeholderAbsence}
            testId={`${testIdPrefix}-metric-claims`}
          />
        </div>
      ) : null}
    </>
  );
}

function ClaimEditFields({
  claims,
  labelFor,
  testId,
}: {
  claims: BrainClaimView[];
  labelFor: (pointer: string) => string | null;
  testId: string;
}): ReactNode {
  return (
    <div data-testid={testId} style={{ display: "grid", gap: "var(--sp-4)" }}>
      {claims.map((claim) => {
        const label = labelFor(claim.pointer);
        if (label === null) {
          throw new Error(`unlabelled claim position ${claim.pointer}`);
        }
        return (
          <label key={claim.pointer} style={{ display: "grid", gap: "var(--sp-2)" }}>
            <span>{label}</span>
            <textarea
              name={`edit:${claim.pointer}`}
              defaultValue={claim.isPlaceholder ? CHECK : claim.value}
              required
              rows={3}
              style={{ minHeight: "88px", minWidth: "44px", padding: "0.75rem" }}
            />
          </label>
        );
      })}
    </div>
  );
}

function editFieldLabels(
  claims: BrainClaimView[],
  labelFor: (pointer: string) => string | null
): Record<string, string> {
  return Object.fromEntries(
    claims.map((claim) => {
      const label = labelFor(claim.pointer);
      if (label === null) {
        throw new Error(`unlabelled claim position ${claim.pointer}`);
      }
      return [claim.pointer, label];
    })
  );
}

function EditDocumentForm({
  claims,
  labelFor,
  action,
  testIdPrefix,
}: {
  claims: BrainClaimView[];
  labelFor: (pointer: string) => string | null;
  action: BrainEditFormAction;
  testIdPrefix: string;
}): ReactNode {
  if (claims.length === 0) return null;
  return (
    <BrainEditForm
      action={action}
      fieldLabels={editFieldLabels(claims, labelFor)}
      testId={`${testIdPrefix}-edit-form`}
    >
      <h3>Edit this document</h3>
      <p className="muted">{BRAIN_EDIT_MEANING}</p>
      <p className="muted">{BRAIN_EDIT_CHECK_COPY}</p>
      <ClaimEditFields
        claims={claims}
        labelFor={labelFor}
        testId={`${testIdPrefix}-edit-fields`}
      />
      <SubmitButton
        className={buttonClass("primary")}
        style={{ ...control, marginTop: "var(--sp-4)" }}
        pendingLabel="Creating a new draftâ€¦"
      >
        Create a replacement draft
      </SubmitButton>
    </BrainEditForm>
  );
}

function metricValue(claims: BrainClaimView[], pointer: string): string {
  const claim = claims.find((item) => item.pointer === pointer);
  return !claim || claim.isPlaceholder ? "" : claim.value;
}

function StrategyEditForms({
  claims,
  editAction,
  metricAction,
}: {
  claims: BrainClaimView[];
  editAction: BrainEditFormAction;
  metricAction: BrainEditFormAction;
}): ReactNode {
  const general = claims.filter((claim) => !isMetricPointer(claim.pointer));
  const metric = claims.filter((claim) => isMetricPointer(claim.pointer));
  const direction = metricValue(metric, "/metric/direction");
  return (
    <>
      <EditDocumentForm
        claims={general}
        labelFor={strategyClaimLabel}
        action={editAction}
        testIdPrefix="strategy"
      />
      {metric.length > 0 ? (
        <BrainEditForm
          action={metricAction}
          fieldLabels={editFieldLabels(metric, strategyClaimLabel)}
          testId="strategy-metric-edit-form"
        >
          <h3>Edit your declared metric</h3>
          <p className="muted">{BRAIN_EDIT_MEANING}</p>
          <div style={{ display: "grid", gap: "var(--sp-4)" }}>
            <label style={{ display: "grid", gap: "var(--sp-2)" }}>
              <span>{STRATEGY_METRIC_FIELD_LABELS.label}</span>
              <input
                name="metric:label"
                defaultValue={metricValue(metric, "/metric/label")}
                required
                style={control}
              />
            </label>
            <label style={{ display: "grid", gap: "var(--sp-2)" }}>
              <span>{STRATEGY_METRIC_FIELD_LABELS.unit}</span>
              <input
                name="metric:unit"
                defaultValue={metricValue(metric, "/metric/unit")}
                required
                style={control}
              />
            </label>
            <label style={{ display: "grid", gap: "var(--sp-2)" }}>
              <span>{STRATEGY_METRIC_FIELD_LABELS.direction}</span>
              <select
                name="metric:direction"
                defaultValue={direction}
                required
                style={control}
              >
                <option value="" disabled>
                  Choose a direction
                </option>
                <option value="higher_is_better">Higher is better</option>
                <option value="lower_is_better">Lower is better</option>
              </select>
            </label>
            {/*
              THE TWO OPTIONAL POSITIONS, and the sentence under each says what
              blank actually DOES (slice 5 gate round 1, G1). It used to read
              "Leave blank to record this as [check]", which was wrong twice
              over: `[check]` means "we are not stating this yet", while a
              creator who leaves these blank has answered — they are not naming
              one — and the product stores that answer by leaving the position
              unstated, exactly as the interview does when the same question is
              declined. The same mismatch made the whole metric uneditable for
              anyone who had declined in the interview.
            */}
            <label style={{ display: "grid", gap: "var(--sp-2)" }}>
              <span>{STRATEGY_METRIC_FIELD_LABELS.platform}</span>
              <input
                name="metric:platform"
                defaultValue={metricValue(metric, "/metric/platform")}
                style={control}
              />
              <span className="muted">{OPTIONAL_METRIC_BLANK_MEANING}</span>
            </label>
            <label style={{ display: "grid", gap: "var(--sp-2)" }}>
              <span>{STRATEGY_METRIC_FIELD_LABELS.window}</span>
              <input
                name="metric:window"
                defaultValue={metricValue(metric, "/metric/window")}
                style={control}
              />
              <span className="muted">{OPTIONAL_METRIC_BLANK_MEANING}</span>
            </label>
          </div>
          <SubmitButton
            className={buttonClass("primary")}
            style={{ ...control, marginTop: "var(--sp-4)" }}
            pendingLabel="Updating your declared metricâ€¦"
          >
            Create a metric replacement draft
          </SubmitButton>
        </BrainEditForm>
      ) : null}
    </>
  );
}

function VersionHistory({
  heading,
  history,
  labelFor,
  absenceFor,
  renderClaims,
  testIdPrefix,
}: {
  heading: string;
  history: BrainVersionView[];
  labelFor: (pointer: string) => string | null;
  /**
   * PER VERSION, not per section. Each history entry carries its own stored
   * `reason`, and a version the creator EDITED must describe its `[check]`
   * positions as the creator's own decision rather than as a failed search of
   * ours — the same defect the export had, on the same rows (round 2).
   */
  absenceFor: (storedReason: string) => string;
  renderClaims?: (
    claims: BrainClaimView[],
    readOnly: boolean,
    testIdPrefix: string,
    placeholderAbsence: string
  ) => ReactNode;
  testIdPrefix: string;
}): ReactNode {
  return (
    <section data-testid={`${testIdPrefix}-history`}>
      <h3>{heading} version history</h3>
      {history.length === 0 ? (
        <p className="muted">No versions recorded.</p>
      ) : (
        <ol className="posts-list">
          {history.map((item) => {
            return (
              <li
                key={item.brainDocId}
                className="post-row"
                data-testid={`${testIdPrefix}-history-version`}
                data-version={item.version}
              >
                <h4>Version {item.version}</h4>
                <p className="muted" data-testid={`${testIdPrefix}-history-meta`}>
                  Status: {item.status}. Created {day(item.createdAt)}.
                  {item.confirmedAt ? ` Confirmed ${day(item.confirmedAt)}.` : ""}
                  {item.activatedAt ? ` Activated ${day(item.activatedAt)}.` : ""}
                </p>
                {item.status === "superseded" ? (
                  <p data-testid={`${testIdPrefix}-replacement-meta`}>
                    {item.replacedByVersion === null
                      ? "This version was replaced" +
                        (item.supersededAt ? " on " + day(item.supersededAt) : "") +
                        "; the replacement version is unavailable."
                      : `Replaced by version ${item.replacedByVersion}${
                          item.supersededAt ? ` on ${day(item.supersededAt)}` : ""
                        }.`}
                  </p>
                ) : null}
                <p className="muted">{item.reason}</p>
                {renderClaims ? (
                  renderClaims(
                    item.claims,
                    true,
                    `${testIdPrefix}-history-v${item.version}`,
                    absenceFor(item.reason)
                  )
                ) : (
                  <ClaimsList
                    claims={item.claims}
                    readOnly
                    labelFor={labelFor}
                    placeholderAbsence={absenceFor(item.reason)}
                    testId={`${testIdPrefix}-history-v${item.version}-claims`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

type KindSectionProps = {
  heading: string;
  emptyTitle: string;
  emptyBody: ReactNode;
  proposedIntro: string;
  data: BrainKindSectionData;
  history: BrainVersionView[];
  labelFor: (pointer: string) => string | null;
  /** The (kind, reason) absence selector for THIS kind — see `VersionHistory`. */
  absenceFor: (storedReason: string) => string;
  /** `strategy` overrides this to split out the metric panel (R7). */
  renderClaims?: (
    claims: BrainClaimView[],
    readOnly: boolean,
    testIdPrefix: string,
    placeholderAbsence: string
  ) => ReactNode;
  confirmAction: FormAction;
  activateAction: FormAction;
  editAction: BrainEditFormAction;
  metricEditAction?: BrainEditFormAction;
  decideBlock: DecideBlock;
  testIdPrefix: string;
};

/**
 * One brain kind's whole section: empty state, the proposed draft (confirm +
 * activate), and the active version. Shared by `voice`, `strategy` and
 * `killtest` (R6) — the per-kind differences (labels, placeholder wording,
 * the metric split) all travel in as props/callbacks rather than this
 * component branching on `kind` internally, so a fourth confirmable kind
 * would not need a new branch here.
 */
function KindSection({
  heading,
  emptyTitle,
  emptyBody,
  proposedIntro,
  data,
  history,
  labelFor,
  absenceFor,
  renderClaims,
  confirmAction,
  activateAction,
  editAction,
  metricEditAction,
  decideBlock,
  testIdPrefix,
}: KindSectionProps): ReactNode {
  const { proposed, active } = data;
  const confirmedCount = proposed ? proposed.claims.filter((c) => c.confirmed).length : 0;
  const evidenceBlocked =
    proposed?.claims.some((claim) => claim.evidenceAnnotation !== null) ?? false;
  const allConfirmed =
    proposed !== null && proposed.claims.length > 0 && confirmedCount === proposed.claims.length;
  // THE VERSION'S OWN STORED REASON TRAVELS WITH ITS CLAIMS. Every caller
  // below passes the reason of the version whose claims it is rendering, so a
  // proposed draft, the version in force and a history entry can each describe
  // their own `[check]` positions honestly — they need not have the same
  // origin (compliance gate round 2).
  const claims = (
    claimsIn: BrainClaimView[],
    readOnly: boolean,
    storedReason: string
  ) =>
    renderClaims ? (
      renderClaims(claimsIn, readOnly, testIdPrefix, absenceFor(storedReason))
    ) : (
      <ClaimsList
        claims={claimsIn}
        readOnly={readOnly}
        labelFor={labelFor}
        placeholderAbsence={absenceFor(storedReason)}
        testId={`${testIdPrefix}-claims`}
      />
    );

  return (
    <section data-testid={`${testIdPrefix}-section`}>
      <h2>{heading}</h2>

      {proposed === null && active === null ? (
        <div className="panel">
          <h3>{emptyTitle}</h3>
          <p className="muted" data-testid={`${testIdPrefix}-empty`}>
            {emptyBody}
          </p>
        </div>
      ) : null}

      {proposed !== null ? (
        <div className="panel">
          <h3>A draft, for you to check</h3>
          <p className="muted">{proposedIntro}</p>
          {/*
            THE VERSION'S OWN REASON, rendered from the column. Safe to print
            because of where it came from: `writeBrainDoc` stores
            `renderBrainReason(code, facts)`, a sentence the SERVER composed
            from a closed code set plus numbers it counted itself. There is no
            string parameter in that function (C-42, REQ-I03).
          */}
          <p className="muted" data-testid={`${testIdPrefix}-reason`}>
            {proposed.reason}
          </p>

          {evidenceBlocked ? (
            <>
              {claims(proposed.claims, true, proposed.reason)}
              <p className="muted" data-testid={`${testIdPrefix}-evidence-blocked`}>
                This draft has an evidence note, so it cannot be confirmed or
                activated. Edit it to create a replacement draft with current
                evidence; the version already in force is unchanged.
              </p>
            </>
          ) : (
            <>
              <form action={confirmAction}>
                {claims(proposed.claims, false, proposed.reason)}
                {decideBlock ? (
                  <p className="muted" data-testid={`${testIdPrefix}-decide-blocked`}>
                    {decideBlock.reason}
                  </p>
                ) : (
                  <SubmitButton className={buttonClass("primary")} style={control}>
                    Record my decisions
                  </SubmitButton>
                )}
              </form>

              <p className="muted" data-testid={`${testIdPrefix}-confirm-progress`}>
                {confirmProgress(proposed.claims.length, confirmedCount)}
              </p>
            </>
          )}

          {/*
            ACTIVATION IS A SEPARATE, EXPLICIT ACT (R13) — its own form and its
            own button, never a second effect of the confirm submit. A single
            press that confirmed and activated would be the silent brain update
            R-8 forbids: activation is what makes the product ACT on a claim
            about a person, and R8 widens what that means (the WHOLE coherent
            brain, not just this document — see `COHERENT_ACTIVATE_MEANING`).

            The button is offered only when every position is confirmed, which
            is a COURTESY and never the enforcement: `activateBrainDocCoherent`
            refuses while any position is unconfirmed and names the ones that
            are, and a server action is a POST endpoint reachable without this
            page.
          */}
          {allConfirmed && !decideBlock && !evidenceBlocked ? (
            <form action={activateAction}>
              <p data-testid={`${testIdPrefix}-activate-meaning`}>{COHERENT_ACTIVATE_MEANING}</p>
              <SubmitButton className={buttonClass("primary")} style={control}>
                Activate my Creator Brain
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {active !== null ? (
        <div className="panel">
          <h3>In force now</h3>
          <p className="muted" data-testid={`${testIdPrefix}-active-meta`}>
            Version {active.version}, activated on{" "}
            {active.activatedAt ? day(active.activatedAt) : "an unrecorded date"}.
          </p>
          {claims(active.claims, true, active.reason)}
        </div>
      ) : null}

      <details
        data-testid={`${testIdPrefix}-document-controls`}
        open={proposed !== null && active === null}
      >
        <summary>Document controls</summary>
        {proposed !== null || active !== null ? (
          <div className="panel" data-testid={`${testIdPrefix}-edit-panel`}>
            {decideBlock ? (
              <p className="muted" data-testid={`${testIdPrefix}-edit-blocked`}>
                {decideBlock.reason}
              </p>
            ) : testIdPrefix === "strategy" && metricEditAction ? (
              <StrategyEditForms
                claims={(proposed ?? active)!.claims}
                editAction={editAction}
                metricAction={metricEditAction}
              />
            ) : (
              <EditDocumentForm
                claims={(proposed ?? active)!.claims}
                labelFor={labelFor}
                action={editAction}
                testIdPrefix={testIdPrefix}
              />
            )}
          </div>
        ) : null}

        <div className="panel">
          <VersionHistory
            heading={heading}
            history={history}
            labelFor={labelFor}
            absenceFor={absenceFor}
            renderClaims={renderClaims}
            testIdPrefix={testIdPrefix}
          />
        </div>
      </details>
    </section>
  );
}

function performanceRuleIndexes(version: BrainVersionView): number[] {
  return [...new Set(
    version.claims.flatMap((claim) => {
      const match = /^\/rules\/(\d+)\//.exec(claim.pointer);
      return match ? [Number(match[1])] : [];
    })
  )].sort((a, b) => a - b);
}

function performanceValue(
  version: BrainVersionView,
  ruleIndex: number,
  field: string
): string | null {
  return version.claims.find((claim) => claim.pointer === `/rules/${ruleIndex}/${field}`)?.value ?? null;
}

function performanceValues(
  version: BrainVersionView,
  ruleIndex: number,
  field: string
): string[] {
  const prefix = `/rules/${ruleIndex}/${field}/`;
  return version.claims
    .filter((claim) => claim.pointer.startsWith(prefix))
    .sort((a, b) => a.pointer.localeCompare(b.pointer))
    .map((claim) => claim.value);
}

/** The signed stored effect states the observed direction, not the verdict. */
function relationFromStoredEffect(effectPer1k: string | null): "higher" | "lower" | null {
  const effect = Number(effectPer1k);
  if (!Number.isFinite(effect) || effect === 0) return null;
  return effect > 0 ? "higher" : "lower";
}

function PerformanceMetaVersion({ version }: { version: BrainVersionView }) {
  const rules = performanceRuleIndexes(version);
  return (
    <div data-testid="performance-meta-version">
      <p className="muted">
        Version {version.version}, {version.status}, recorded {day(version.createdAt)}.
      </p>
      {rules.length === 0 ? (
        <p className="muted">No tested rules are recorded in this version.</p>
      ) : rules.map((index) => {
        const label = performanceValue(version, index, "metricLabel");
        const metricKey = performanceValue(version, index, "metricKey");
        const metricUnit = performanceValue(version, index, "metricUnit");
        const metricDirection = performanceValue(version, index, "metricDirection");
        const lever = performanceValue(version, index, "lever");
        const platform = performanceValue(version, index, "platform");
        const audienceClass = performanceValue(version, index, "audienceClass");
        const observedFrom = performanceValue(version, index, "observedFrom");
        const observedTo = performanceValue(version, index, "observedTo");
        const treatmentN = performanceValue(version, index, "treatmentN");
        const baselineN = performanceValue(version, index, "baselineN");
        const treatmentMedian = performanceValue(version, index, "treatmentMedianPer1k");
        const baselineMedian = performanceValue(version, index, "baselineMedianPer1k");
        const effectPer1k = performanceValue(version, index, "effectPer1k");
        const observedRelation = relationFromStoredEffect(effectPer1k);
        const pastOutcome = performanceValue(version, index, "pastOutcome");
        const selfReportedN = performanceValue(version, index, "selfReportedN");
        const connectorVerifiedN = performanceValue(version, index, "connectorVerifiedN");
        const strength = performanceValue(version, index, "evidenceStrength");
        const confounders = performanceValues(version, index, "confounders");
        return (
          <div className="post-row" data-testid="performance-meta-rule" key={index}>
            <p className="muted" data-creator-authored="metric-label">
              Creator-authored metric label: {label ?? "Not recorded"}
            </p>
            <dl data-testid="performance-meta-details">
              <dt>Metric key</dt><dd>{metricKey ?? "Not recorded"}</dd>
              <dt>Metric unit</dt><dd>{metricUnit ?? "Not recorded"}</dd>
              <dt>Metric direction</dt><dd>{metricDirection ?? "Not recorded"}</dd>
              <dt>Lever</dt><dd>{lever ?? "Not recorded"}</dd>
              <dt>Platform</dt><dd>{platform ?? "Not recorded"}</dd>
              <dt>Audience class</dt><dd>{audienceClass ?? "Not recorded"}</dd>
              <dt>Observation envelope</dt><dd>{observedFrom ?? "Not recorded"} to {observedTo ?? "Not recorded"}</dd>
              <dt>Treatment</dt><dd>n {treatmentN ?? "Not recorded"}; median per 1,000 {treatmentMedian ?? "Not recorded"}</dd>
              <dt>Baseline</dt><dd>n {baselineN ?? "Not recorded"}; median per 1,000 {baselineMedian ?? "Not recorded"}</dd>
              <dt>Signed effect per 1,000</dt><dd>{effectPer1k ?? "Not recorded"}</dd>
              <dt>Past outcome</dt><dd>{pastOutcome ?? "Not recorded"}</dd>
              <dt>Evidence counts</dt><dd>{selfReportedN ?? "Not recorded"} quantified self-reported; {connectorVerifiedN ?? "Not recorded"} connector verified</dd>
            </dl>
            {observedRelation ? (
              <p data-testid="performance-outcome-summary">
                This treatment was {observedRelation} than this baseline in these observations.
              </p>
            ) : (
              <p className="muted">A past comparison direction was not recorded for this rule.</p>
            )}
            <p className="muted" data-testid="performance-strength">
              Evidence strength: {strength ?? "Not recorded"}. Evidence strength describes the recorded evidence, not confidence or probability.
            </p>
            <div data-testid="performance-confounders">
              <p className="muted">Structured confounders</p>
              {confounders.length ? <p>{confounders.map((confounder, position) => <span key={confounder}>{position ? ", " : ""}{confounder}</span>)}</p> : <p className="muted">None recorded.</p>}
            </div>
            <p className="muted" data-testid="performance-noncausal">
              This describes past observations, does not establish cause, and is not a forecast.
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PerformanceMeta({ history }: { history: BrainVersionView[] | null }) {
  if (history === null) {
    return (
      <section data-testid="performance-meta-unavailable">
        <h2>Performance Meta</h2>
        <p className="muted">Performance Meta could not be read right now. Other brain history remains available.</p>
      </section>
    );
  }
  const current = history.find((version) => version.status === "active") ?? null;
  return (
    <section data-testid="performance-meta">
      <h2>Performance Meta</h2>
      <div className="panel" data-testid="performance-meta-current">
        <h3>Current</h3>
        {current ? <PerformanceMetaVersion version={current} /> : (
          <p className="muted">No Performance Meta version is active yet. Accepted result proposals appear here after their explicit activation.</p>
        )}
      </div>
      <div className="panel" data-testid="performance-meta-history">
        <h3>History</h3>
        {history.length === 0 ? <p className="muted">No Performance Meta versions have been recorded yet.</p> : history.map((version) => (
          <PerformanceMetaVersion key={version.brainDocId} version={version} />
        ))}
      </div>
    </section>
  );
}

function decisionAttribution(proposal: ProposalHistoryItem["proposal"]): string | null {
  if (proposal.status !== "accepted" && proposal.status !== "rejected") return null;
  if (proposal.decisionRole === null || proposal.decisionAt === null) {
    return "Decision details were not recorded.";
  }
  const actor = proposal.decisionUserId === null
    ? `Deleted member · ${proposal.decisionRole}`
    : `Member ${proposal.decisionUserId} · ${proposal.decisionRole}`;
  return `Decision: ${actor}. Recorded ${proposal.decisionAt.toISOString()}.`;
}

function ProposalHistory({ proposals }: { proposals: ProposalHistoryItem[] | null }) {
  if (proposals === null) {
    return (
      <section data-testid="proposal-history-unavailable">
        <h2>Proposal history</h2>
        <p className="muted">Proposal history could not be read right now.</p>
      </section>
    );
  }
  return (
    <section data-testid="proposal-history">
      <h2>Proposal history</h2>
      {proposals.length === 0 ? <p className="muted">No result or feedback proposal has been recorded yet.</p> : proposals.map(({ proposal, resultEvidenceIds, feedbackEvidenceIds }) => (
        <div className="panel" data-testid="proposal-history-item" key={proposal.id}>
          <p><strong>{proposal.source === "results" ? "Result" : "Feedback"} proposal</strong></p>
          <p className="muted">Status: {proposal.status}. Recorded {day(proposal.createdAt)}.</p>
          <p className="muted">Immutable evidence digest: {proposal.evidenceDigest}.</p>
          {decisionAttribution(proposal) ? (
            <p className="muted" data-testid="proposal-decision">
              {decisionAttribution(proposal)}
            </p>
          ) : null}
          {resultEvidenceIds === null || feedbackEvidenceIds === null ? (
            <p className="muted">Its immutable evidence membership could not be read right now.</p>
          ) : (
            <>
              <p data-testid="proposal-result-evidence">Result evidence IDs: {resultEvidenceIds.length ? resultEvidenceIds.join(", ") : "None"}.</p>
              <p data-testid="proposal-feedback-evidence">Feedback evidence IDs: {feedbackEvidenceIds.length ? feedbackEvidenceIds.join(", ") : "None"}.</p>
            </>
          )}
          {proposal.status === "accepted" ? (
            <p data-testid="proposal-accepted-activation">
              Accepted activation: {proposal.acceptedActivationId ?? "Not recorded"}. Activated brain version: {proposal.acceptedBrainDocId ?? "Not recorded"}.
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function BrainAssets({ counts }: { counts: BrainAssetCounts | null }) {
  return (
    <section className="panel" data-testid="brain-assets">
      <h2>Brain assets</h2>
      {counts ? (
        <div>
          <p><span className="num">{counts.brainVersions}</span> brain versions</p>
          <p><span className="num">{counts.testedRules}</span> tested rules</p>
          <p><span className="num">{counts.loggedResults}</span> logged results</p>
          <p><span className="num">{counts.feedback}</span> feedback entries</p>
        </div>
      ) : <p className="muted">Exact brain-asset counts could not be read right now.</p>}
    </section>
  );
}

export function BrainView({
  profileName,
  voice,
  strategy,
  killtest,
  voiceHistory,
  strategyHistory,
  killtestHistory,
  performanceHistory,
  proposalHistory,
  assetCounts,
  interviewTouchedButUndrafted,
  decideBlock,
  confirmVoiceAction,
  confirmStrategyAction,
  confirmKillTestAction,
  editVoiceAction,
  editStrategyAction,
  editKillTestAction,
  editMetricAction,
  activateVoiceAction,
  activateStrategyAction,
  activateKillTestAction,
  exportJsonHref,
  exportMarkdownHref,
  error,
}: BrainViewProps): ReactNode {
  return (
    <section>
      <h1>Your Creator Brain</h1>
      {error ? <Refusal error={error} /> : null}

      <KindSection
        heading="How you write"
        emptyTitle="Nothing drafted yet"
        emptyBody={
          <>
            There is no draft for <strong>{profileName}</strong> yet. Save some
            of your own posts on the onboarding page and build one there — this
            is where you read it and decide.{" "}
            <a href="/onboarding">Go to onboarding</a>
          </>
        }
        proposedIntro={PROPOSED_INTRO.voice(profileName)}
        data={voice}
        history={voiceHistory}
        labelFor={claimLabel}
        absenceFor={(storedReason) => screenAbsenceSentence("voice", storedReason)}
        confirmAction={confirmVoiceAction}
        activateAction={activateVoiceAction}
        editAction={editVoiceAction}
        decideBlock={decideBlock}
        testIdPrefix="voice"
      />

      <KindSection
        heading="Your strategy"
        emptyTitle={
          interviewTouchedButUndrafted.strategy ? "You answered — nothing to draft" : "Nothing drafted yet"
        }
        emptyBody={
          interviewTouchedButUndrafted.strategy ? (
            INTERVIEW_ANSWERED_NOTHING_TO_STATE
          ) : (
            <>
              There is no Strategy draft for <strong>{profileName}</strong> yet.
              Complete the interview on the onboarding page to build one — this
              is where you read it and decide.{" "}
              <a href="/onboarding">Go to onboarding</a>
            </>
          )
        }
        proposedIntro={PROPOSED_INTRO.strategy(profileName)}
        data={strategy}
        history={strategyHistory}
        labelFor={strategyClaimLabel}
        absenceFor={(storedReason) => screenAbsenceSentence("strategy", storedReason)}
        renderClaims={(claims, readOnly, testIdPrefix, placeholderAbsence) => (
          <StrategyClaims
            claims={claims}
            readOnly={readOnly}
            placeholderAbsence={placeholderAbsence}
            testIdPrefix={testIdPrefix}
          />
        )}
        confirmAction={confirmStrategyAction}
        activateAction={activateStrategyAction}
        editAction={editStrategyAction}
        metricEditAction={editMetricAction}
        decideBlock={decideBlock}
        testIdPrefix="strategy"
      />

      <KindSection
        heading="Your kill test"
        emptyTitle={
          interviewTouchedButUndrafted.killtest ? "You answered — nothing to draft" : "Nothing drafted yet"
        }
        emptyBody={
          interviewTouchedButUndrafted.killtest ? (
            INTERVIEW_ANSWERED_NOTHING_TO_STATE
          ) : (
            <>
              There is no Kill Test draft for <strong>{profileName}</strong> yet.
              Complete the interview on the onboarding page to build one — this
              is where you read it and decide.{" "}
              <a href="/onboarding">Go to onboarding</a>
            </>
          )
        }
        proposedIntro={PROPOSED_INTRO.killtest(profileName)}
        data={killtest}
        history={killtestHistory}
        labelFor={killtestClaimLabel}
        absenceFor={(storedReason) => screenAbsenceSentence("killtest", storedReason)}
        confirmAction={confirmKillTestAction}
        activateAction={activateKillTestAction}
        editAction={editKillTestAction}
        decideBlock={decideBlock}
        testIdPrefix="killtest"
      />

      {exportJsonHref && exportMarkdownHref ? (
        <div className="panel" data-testid="brain-export-panel">
          <h2>Export your brain</h2>
          <p>{BRAIN_EXPORT_JSON_COPY}</p>
          <p className="muted">{BRAIN_EXPORT_MARKDOWN_COPY}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
            <a
              className={buttonClass("primary")}
              href={exportJsonHref}
              download
              style={control}
            >
              Download complete JSON
            </a>
            <a
              className={buttonClass("secondary")}
              href={exportMarkdownHref}
              download
              style={control}
            >
              Download readable markdown
            </a>
          </div>
        </div>
      ) : null}

      <BrainAssets counts={assetCounts} />

      <PerformanceMeta history={performanceHistory} />

      <ProposalHistory proposals={proposalHistory} />
    </section>
  );
}
