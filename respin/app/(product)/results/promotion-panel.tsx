"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import {
  IDLE_PROMOTION_ACTION_STATE,
  PROMOTION_FIELD,
  type PromotionActionState,
} from "./promotion-state";

const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "0.6rem 1rem",
};
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

type Review = Extract<PromotionActionState, { status: "reviewed" }> ["review"];
type PromotionAction = (
  previous: PromotionActionState,
  formData: FormData
) => Promise<PromotionActionState>;

export type PromotionPanelProps = {
  access:
    | { kind: "full" }
    | { kind: "view_only"; reason: string }
    | { kind: "operational"; reason: string };
  reviews: readonly Review[];
  historyState?: "complete" | "partial" | "unavailable";
  refreshAction: PromotionAction;
  reviewAction: PromotionAction;
  decideAction: PromotionAction;
  /**
   * THE `[check]` MARKER, HANDED DOWN (audit Phase 2, P2-R8). This file is
   * "use client", so it may not import `@respin/db` at all
   * (`tests/client-bundle-boundary.test.ts`); the server parent
   * `results/page.tsx` reads `CHECK` and passes it here — the
   * `results/copy.ts` "takes the number rather than holding one" precedent.
   * Every decision and mint below reads this prop; the file holds no literal.
   */
  checkMarker: string;
};

/**
 * What the refresh status line says. The count is the PROPOSED rows only
 * (audit Phase 2, P2-A3) — the action computes it; this only words it.
 */
export function refreshedSentence(count: number): string {
  return `${count} proposal${count === 1 ? "" : "s"} available after refresh.`;
}

/**
 * What a decision's status line says. An accept of a value the document
 * already holds wrote nothing, and says so (R-171).
 */
export function decidedSentence(state: { decision: "accepted" | "rejected"; alreadyPresent: boolean }): string {
  if (state.decision === "accepted" && state.alreadyPresent) {
    return "Proposal accepted. That rule is already in the document it targets, so no new version was written.";
  }
  return `Proposal ${state.decision}.`;
}

function display(value: unknown, checkMarker: string): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return checkMarker;
  return JSON.stringify(value);
}

function payloadValue(payload: unknown, path: readonly string[]): unknown {
  let value: unknown = payload;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function OutcomeDisclosure({ effect }: { effect: unknown }) {
  const numericEffect = typeof effect === "number" ? effect : Number(effect);
  const relation = numericEffect === 0 ? "level with" : numericEffect > 0 ? "higher than" : "lower than";
  return (
    <>
      <p className="muted" data-testid="promotion-past-tense">
        This treatment was {relation} this baseline in these observations.
      </p>
      <p className="muted" data-testid="promotion-not-causal">
        This describes past observations, does not establish cause, and is not a forecast.
      </p>
    </>
  );
}

/**
 * ONE RESULT-EVIDENCE BOUNDARY (R-115, Phase 10a C1). The words come from the
 * derived eligibility, never from the stored strength enum: a verified result
 * proposal says its exact treatment and baseline n; a historic proposal that
 * carried self-reported rows says so and proposes nothing; a feedback proposal
 * says how many distinct generations repeated the reaction. There is no
 * "strong" tier and no five-result threshold.
 */
function evidenceMeaning(eligibility: Review["learningEligibility"]): string {
  switch (eligibility.kind) {
    case "verified_results":
      return `Verified result evidence: treatment n ${eligibility.treatmentN}, baseline n ${eligibility.baselineN}, every result connector verified.`;
    case "legacy_unverified":
      // "not learning eligible" is the plan's wording; the claims canon bans
      // the word "learn" on every creator-facing surface, so it reads as
      // "not proposal eligible" here — the same fact, in permitted words.
      return "Legacy mixed/unverified evidence — not proposal eligible. Kept as history; it proposes nothing and cannot be accepted.";
    case "structured_feedback":
      return `Structured feedback: the same reaction was recorded on ${eligibility.occurrences} distinct generations. It carries no result numbers.`;
  }
}

function Refusal({ state }: { state: PromotionActionState }) {
  return state.status === "refused" ? (
    <p role="alert" tabIndex={-1} data-testid="promotion-refusal">
      <strong>{state.copy.title}</strong> {state.copy.detail}
    </p>
  ) : null;
}

function ProposalFacts({ review, checkMarker }: { review: Review; checkMarker: string }) {
  const show = (value: unknown) => display(value, checkMarker);
  const rule = payloadValue(review.proposal.payload, ["rule"]);
  const metricLabel = payloadValue(rule, ["metric", "label"]);
  const metricKey = payloadValue(rule, ["metric", "key"]);
  const treatment = payloadValue(rule, ["treatment"]);
  const baseline = payloadValue(rule, ["baseline"]);
  const effect = payloadValue(rule, ["effectPer1k"]);
  const confounders = payloadValue(rule, ["confounders"]);
  const selfReportedN = payloadValue(rule, ["evidenceCounts", "quantifiedSelfReported"]);
  const connectorVerifiedN = payloadValue(rule, ["evidenceCounts", "connectorVerified"]);
  const resultIds = review.resultEvidence.map((row) => `${row.role}: ${row.id}`);
  const feedbackIds = review.feedbackEvidence.map((row) => row.feedbackId);
  const feedbackGenerations = new Set(review.feedbackEvidence.map((row) => row.generationId));
  return (
    <div data-testid={`promotion-facts-${review.proposal.id}`}>
      <p>
        Source: <strong>{review.proposal.source === "results" ? "Logged results" : "Generation feedback"}</strong>. Status: <strong>{review.proposal.status}</strong>. Freshness: <strong>{review.proposal.status === "proposed" ? "Review current before deciding" : "Terminal or no longer current"}</strong>.
      </p>
      {review.proposal.source === "results" ? (
        <>
          <p>
            Metric: <span data-testid="promotion-metric-label" data-creator-authored="true">{show(metricLabel)}</span>{" "}
            <span style={mono}>({show(metricKey)})</span>. The metric label is creator-authored data.
          </p>
          <p>
            Treatment: n {show(payloadValue(treatment, ["n"]))}, median {show(payloadValue(treatment, ["medianPer1k"]))}. Baseline: n {show(payloadValue(baseline, ["n"]))}, median {show(payloadValue(baseline, ["medianPer1k"]))}. Signed effect: {show(effect)} per 1,000.
          </p>
          <p>
            Evidence states: {show(selfReportedN)} self reported and {show(connectorVerifiedN)} connector verified. <span data-testid="promotion-evidence-meaning">{evidenceMeaning(review.learningEligibility)}</span>
          </p>
          <p>Structured confounders: {Array.isArray(confounders) && confounders.length ? confounders.map(show).join(", ") : "none recorded"}.</p>
          <p>Exact result evidence IDs: {resultIds.length ? resultIds.join(", ") : checkMarker}.</p>
          <OutcomeDisclosure effect={effect} />
        </>
      ) : <>
        <p>Feedback evidence population: n {feedbackIds.length} records across {feedbackGenerations.size} distinct generations.</p>
        <p><span data-testid="promotion-evidence-meaning">{evidenceMeaning(review.learningEligibility)}</span></p>
        <p>Exact feedback evidence IDs: {feedbackIds.length ? feedbackIds.join(", ") : checkMarker}.</p>
      </>}
    </div>
  );
}

function DecisionButton({ decision }: { decision: "accept" | "reject" }) {
  const { pending } = useFormStatus();
  const label = decision === "accept" ? "Accept reviewed proposal" : "Reject proposal";
  return (
    <button
      className={buttonClass(decision === "accept" ? "primary" : "secondary")}
      style={control}
      type="submit"
      name={PROMOTION_FIELD.decision}
      value={decision}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={(event) => { if (pending) event.preventDefault(); }}
    >
      {pending ? "Working on your decision…" : label}
    </button>
  );
}

export function confirmedFieldsFor(
  claims: Review["claims"],
  checkedPointers: ReadonlySet<string>,
  checkMarker: string
) {
  return claims
    .filter((claim) => checkedPointers.has(claim.pointer))
    .map((claim) => ({
      pointer: claim.pointer,
      asPlaceholder: claim.displayedValue === checkMarker,
    }));
}

function AcceptButton({
  complete,
  onIncomplete,
}: {
  complete: boolean;
  onIncomplete: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={buttonClass("primary")}
      style={control}
      type="submit"
      name={PROMOTION_FIELD.decision}
      value="accept"
      aria-disabled={pending || !complete}
      aria-busy={pending}
      onClick={(event) => {
        if (pending || !complete) {
          event.preventDefault();
          if (!complete) onIncomplete();
        }
      }}
    >
      {pending ? "Working on your decision…" : "Accept reviewed proposal"}
    </button>
  );
}

export function PromotionReviewDocument({ review, access, decideAction, checkMarker }: { review: Review; access: PromotionPanelProps["access"]; decideAction: PromotionAction; checkMarker: string }) {
  const [decisionState, decisionAction] = useActionState(
    decideAction,
    IDLE_PROMOTION_ACTION_STATE
  );
  const [checkedPointers, setCheckedPointers] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [acceptAttempted, setAcceptAttempted] = useState(false);
  const confirmations = confirmedFieldsFor(review.claims, checkedPointers, checkMarker);
  const allClaimsConfirmed = confirmations.length === review.claims.length;
  const toggleConfirmation = (pointer: string) => {
    setCheckedPointers((current) => {
      const next = new Set(current);
      if (next.has(pointer)) next.delete(pointer);
      else next.add(pointer);
      return next;
    });
  };
  return (
    <section className="panel" data-testid={`promotion-review-${review.proposal.id}`} aria-labelledby={`promotion-review-heading-${review.proposal.id}`}>
      <h3 id={`promotion-review-heading-${review.proposal.id}`}>Full proposal review</h3>
      <p>Every field and its source is shown below before a decision control.</p>
      <pre data-testid="promotion-merged-document" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{display(review.mergedContent, checkMarker)}</pre>
      <ul data-testid="promotion-review-claims">
        {review.claims.map((claim) => (
          <li key={claim.pointer}>
            <span style={mono}>{claim.pointer}</span>: {display(claim.displayedValue, checkMarker)}. {"quote" in claim.sourceEvidence ? `Source ${claim.sourceEvidence.inputClass ?? "record"}: ${claim.sourceEvidence.quote}` : claim.sourceEvidence.absence}
          </li>
        ))}
      </ul>
      <ProposalFacts review={review} checkMarker={checkMarker} />
      {review.alreadyPresent ? (
        <p data-testid="promotion-already-present">
          This rule is already in the document it targets. Accepting records your decision and writes no new version.
        </p>
      ) : null}
      {access.kind === "full" && review.proposal.status === "proposed" ? (
        <form
          action={decisionAction}
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            if (
              !allClaimsConfirmed &&
              (!(submitter instanceof HTMLButtonElement) || submitter.value !== "reject")
            ) {
              event.preventDefault();
              setAcceptAttempted(true);
            }
          }}
        >
          <input type="hidden" name={PROMOTION_FIELD.proposalId} value={review.proposal.id} />
          <input type="hidden" name={PROMOTION_FIELD.freshnessToken} value={review.freshnessToken} />
          <input type="hidden" name={PROMOTION_FIELD.acceptConfirmedFields} value={JSON.stringify(confirmations)} />
          <input type="hidden" name={PROMOTION_FIELD.rejectConfirmedFields} value="[]" />
          <fieldset data-testid="promotion-claim-confirmations">
            <legend>Confirm every current field before accepting</legend>
            {review.claims.map((claim) => {
              const checkId = `promotion-confirm-${review.proposal.id}-${claim.pointer.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              const needsDecision = claim.displayedValue === checkMarker;
              return (
                <label key={claim.pointer} htmlFor={checkId} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", minHeight: "44px" }}>
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={checkedPointers.has(claim.pointer)}
                    onChange={() => toggleConfirmation(claim.pointer)}
                    aria-describedby={acceptAttempted && !allClaimsConfirmed ? "promotion-confirmation-required" : undefined}
                  />
                  <span>I've reviewed <span style={mono}>{claim.pointer}</span>{needsDecision ? " and decided this [check] position." : "."}</span>
                </label>
              );
            })}
          </fieldset>
          {acceptAttempted && !allClaimsConfirmed ? (
            <p id="promotion-confirmation-required" role="alert" tabIndex={-1} data-testid="promotion-confirmation-required">
              Confirm every current field, including every [check] position, before accepting this proposal.
            </p>
          ) : null}
          <p role="status" aria-live="polite">{decisionState.status === "decided" ? decidedSentence(decisionState) : ""}</p>
          <AcceptButton complete={allClaimsConfirmed} onIncomplete={() => setAcceptAttempted(true)} />{" "}
          <DecisionButton decision="reject" />
          <Refusal state={decisionState} />
        </form>
      ) : <p className="muted">{access.kind === "full" ? "This proposal is not awaiting a decision." : access.reason}</p>}
    </section>
  );
}

function ProposalCard({ review, access, reviewAction, decideAction, checkMarker }: { review: Review; access: PromotionPanelProps["access"]; reviewAction: PromotionAction; decideAction: PromotionAction; checkMarker: string }) {
  const [reviewState, reviewedAction] = useActionState(reviewAction, IDLE_PROMOTION_ACTION_STATE);
  // The card's facts are the page-load record. A decision, however, must be
  // against the current review the action just reconstructed, never that
  // older record. Until the review action returns one, there is no full
  // document and no decision control to press.
  const visibleReview = reviewState.status === "reviewed" ? reviewState.review : null;
  return (
    <article className="panel panel-1" data-testid={`promotion-card-${review.proposal.id}`}>
      <h3>{review.proposal.source === "results" ? "Results proposal" : "Feedback proposal"}</h3>
      <ProposalFacts review={review} checkMarker={checkMarker} />
      <form action={reviewedAction}>
        <input type="hidden" name={PROMOTION_FIELD.proposalId} value={review.proposal.id} />
        <SubmitButton className={buttonClass("secondary")} style={control} pendingLabel="Opening full review…">Open full review</SubmitButton>
        <Refusal state={reviewState} />
      </form>
      {visibleReview ? <PromotionReviewDocument review={visibleReview} access={access} decideAction={decideAction} checkMarker={checkMarker} /> : null}
    </article>
  );
}

export function PromotionPanel({ access, reviews, historyState = "complete", refreshAction, reviewAction, decideAction, checkMarker }: PromotionPanelProps) {
  const [refreshState, refreshedAction] = useActionState(refreshAction, IDLE_PROMOTION_ACTION_STATE);
  return (
    <section data-testid="results-promotions" aria-labelledby="results-promotions-heading">
      <h2 id="results-promotions-heading">Brain update proposals</h2>
      <p className="muted">Proposals are reviewable records, not automatic changes to your brain.</p>
      {access.kind === "full" ? (
        <form action={refreshedAction}>
          <SubmitButton className={buttonClass("secondary")} style={control} pendingLabel="Refreshing proposals…">Refresh proposals</SubmitButton>
          <p role="status" aria-live="polite">{refreshState.status === "refreshed" ? refreshedSentence(refreshState.count) : ""}</p>
          <Refusal state={refreshState} />
        </form>
      ) : <p className="muted" role="status">{access.reason}</p>}
      {historyState === "unavailable" ? <p className="panel" role="alert" data-testid="promotion-history-unavailable">Proposal history could not be read. Results history remains available, but this section cannot say whether proposals exist.</p> : null}
      {historyState === "partial" ? <p className="panel" role="alert" data-testid="promotion-history-partial">Some proposal records could not be read. The cards below are not a complete proposal history.</p> : null}
      {historyState === "complete" && reviews.length === 0 ? <p className="panel">No proposals are recorded yet. Your result history remains available.</p> : reviews.map((review) => <ProposalCard key={review.proposal.id} review={review} access={access} reviewAction={reviewAction} decideAction={decideAction} checkMarker={checkMarker} />)}
    </section>
  );
}
