// "Your pasted references" (slice 8c, R14; R-96/R-98). Owner-only, newest
// first, and every item shows the STATE its claim is actually in — queued,
// retrying, ready, could-not-complete, transcript-unavailable — rather than a
// spinner or a blank. Pure: the page supplies only what the scoped reader
// returned, projected; this file never sees a transcript, a channel id, or a
// baseline, because a pasted reference has none (R-96) and none is invented.
import type { ReactNode } from "react";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import type { AnalysedTrendItem } from "./trends-view";

export type PastedReferenceState =
  | Readonly<{ kind: "queued" }>
  | Readonly<{ kind: "retrying"; attempt: number; ceiling: number }>
  /** The completed autopsy, as the SAME card the ranked feed renders. */
  | Readonly<{ kind: "ready"; item: AnalysedTrendItem }>
  /**
   * Parked (R-93's attempt ceiling, or the mechanism-level check) AND the
   * settlement OBSERVED a refund for this claim — either it appended one on
   * this load (`refundedClaimIds`) or it found one already there from an
   * earlier load (`alreadyRefundedClaimIds`). Both are positive observations;
   * neither is "the settlement said nothing about this claim".
   *
   * THREE REALITIES, TWO SPELLINGS, AND ALL THREE ARE NAMED HERE — the docblock
   * that named two of them is what round 2 caught (billing CHANGE 1). The
   * number is the page's settlement result for THIS claim on THIS load;
   * `creditsReturned` is `null` when (a) the refund was made on an earlier load,
   * or (b) this load refunded several claims and the total cannot be split
   * across debits priced under different config versions. The copy then says
   * "credits returned" without a number rather than guessing one. A return
   * happened in all three, which is what makes the past tense true.
   *
   * THE FOURTH REALITY IS NOT A MEMBER: a claim parked between the settlement
   * and the pasted read is `parked_unsettled` below, because nothing here
   * observed it and the money sentence is not something to reach by
   * elimination.
   */
  | Readonly<{ kind: "parked_returned"; creditsReturned: number | null }>
  /**
   * Parked, and the settlement DEFERRED because the workspace has an open
   * pause: credits and their expiry clocks are frozen (REQ-G08), so
   * `settleParkedAutopsies` returns `deferred: true` and reads nothing.
   *
   * IT IS THE SETTLEMENT'S OWN BOOLEAN, never a screen's re-derivation. The
   * page inferred it from `pastedReferenceQuote`, whose `allowed` tests TIER
   * BEFORE PAUSE, so a paused workspace that was also non-paid reported
   * `reason: "tier"` and this state was never reached — the creator read
   * "credits returned", past tense, with zero refund rows (code review round 1,
   * C2). The copy claims nothing about the amount, because a deferred
   * settlement did not look at the debits.
   */
  | Readonly<{ kind: "parked_deferred" }>
  /**
   * Parked, and the settlement found NO debit for the claim — under a document
   * pricing `creditCosts.autopsy` at 0 the paste wrote no ledger row, so there
   * is nothing to return and nothing was ever taken.
   *
   * A THIRD STATE, not a quiet member of the first (code review round 1, C2b).
   * `creditsReturned: null` used to carry three realities at once — refunded
   * earlier, refunded among several this load, and never charged at all — under
   * one sentence asserting a return.
   */
  | Readonly<{ kind: "parked_never_charged" }>
  /**
   * Parked, and THIS LOAD'S SETTLEMENT NEVER SAW THIS CLAIM — so this screen
   * knows the autopsy stopped and knows nothing yet about its money.
   *
   * THE STATE THAT USED TO BE A FALSE SENTENCE (round 2, billing CHANGE 1 /
   * learning CHANGE 1, reached independently by both reviewers and driven by
   * one). `settleParkedAutopsies` commits in its own transaction before the
   * pasted references are read in a later one; a claim the worker parks in that
   * window is in none of the settlement's three lists. `parked_returned` was
   * the fallthrough, so the creator was told "credits returned" — past tense,
   * with an amount-free sentence that reads as settled — over a ledger holding
   * the debit and no refund at all.
   *
   * IT CLAIMS NOTHING ABOUT THE MONEY, which is the only honest thing to say:
   * the settlement has not looked at this claim yet, and the next load's
   * settlement will refund it (or find it never charged) before this section is
   * read again. It self-heals, and the copy says what is true meanwhile rather
   * than borrowing the outcome of the state next door.
   */
  | Readonly<{ kind: "parked_unsettled" }>
  | Readonly<{ kind: "transcript_unavailable" }>
  /** A completed claim whose stored analysis this build cannot display. */
  | Readonly<{ kind: "unavailable"; reason: string }>;

export type PastedReferenceItem = Readonly<{
  itemId: string;
  /** `null` when the creator gave none; the link's host stands in. */
  title: string | null;
  sourceUrl: string;
  /** ISO instant — the one date this product observed for it. */
  createdAt: string;
  niche: string | null;
  state: PastedReferenceState;
}>;

/**
 * The host of an http(s) URL, or `null` for anything else. The link is only
 * rendered as an `<a>` when this is non-null: a stored value that is not an
 * http(s) address is shown as text, never as a clickable `javascript:`.
 */
export function referenceHost(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null;
  } catch (err) {
    // FIRST STATEMENT, always (`tests/action-gate.test.ts`). `new URL()` cannot
    // throw a Next signal, but the scan is a class rule and a binding-less
    // `catch` is the shape it exists to refuse — it cannot re-throw what it
    // cannot name.
    rethrowNextControlFlow(err);
    return null;
  }
}

/** What the row is called: the creator's title, else the link's host. */
export function referenceTitle(item: Pick<PastedReferenceItem, "title" | "sourceUrl">): string {
  return item.title ?? referenceHost(item.sourceUrl) ?? "Untitled reference";
}

/**
 * The two sentences every parked state shares, written ONCE.
 *
 * The four parked branches below differ only in what they say about MONEY;
 * the reason it stopped and what a re-paste does are the same facts in all
 * four, and four copies of a sentence is four places for one of them to
 * drift into a claim the others do not make.
 */
const WHY_IT_STOPPED =
  "The autopsy did not reach a usable, mechanism-level analysis within its attempts, so it stopped.";
const SAME_CLAIM =
  "Pasting the same link with the same transcript lands on this same claim; a different transcript starts a new one.";

function StateLine({ state }: { state: PastedReferenceState }): ReactNode {
  switch (state.kind) {
    case "queued":
      return (
        <p data-testid="pasted-state-queued">
          <span className="badge badge-dashed">Queued for autopsy</span>{" "}
          <span className="muted">The autopsy runs in the background. Reload this page to see whether it has finished.</span>
        </p>
      );
    case "retrying":
      return (
        <p data-testid="pasted-state-retrying">
          <span className="badge badge-dashed">
            Retrying — attempt <span className="mono">{state.attempt}</span> of <span className="mono">{state.ceiling}</span>
          </span>{" "}
          <span className="muted">An earlier attempt did not produce a usable analysis, so it is being tried again.</span>
        </p>
      );
    case "ready":
      return (
        <p data-testid="pasted-state-ready">
          <span className="badge badge-filled">Ready</span>
        </p>
      );
    case "parked_returned":
      return (
        <section className="banner" data-testid="pasted-state-parked" data-refund="returned">
          <strong>
            {state.creditsReturned === null ? (
              "Could not be completed — credits returned"
            ) : (
              <>
                Could not be completed — <span className="mono">{state.creditsReturned}</span> credits returned
              </>
            )}
          </strong>
          <p>
            {WHY_IT_STOPPED} What this paste charged has been returned to your balance. {SAME_CLAIM}
          </p>
        </section>
      );
    case "parked_deferred":
      return (
        <section className="banner" data-testid="pasted-state-parked" data-refund="deferred">
          <strong>Could not be completed — settled when the pause ends</strong>
          <p>
            {WHY_IT_STOPPED} While this workspace is paused its credits are frozen and nothing has been returned yet, so whatever this paste charged comes back to your balance on the first load after the pause ends; a return already made before the pause stays in place. {SAME_CLAIM}
          </p>
        </section>
      );
    case "parked_never_charged":
      return (
        <section className="banner" data-testid="pasted-state-parked" data-refund="never-charged">
          <strong>Could not be completed — nothing was charged</strong>
          <p>
            {WHY_IT_STOPPED} Nothing was charged for this attempt, so there is nothing to return and your balance is untouched. {SAME_CLAIM}
          </p>
        </section>
      );
    case "parked_unsettled":
      return (
        <section className="banner" data-testid="pasted-state-parked" data-refund="unsettled">
          <strong>Could not be completed — not settled yet</strong>
          <p>
            {WHY_IT_STOPPED} This attempt stopped after the last time this page settled what it owes, so whether anything was charged for it has not been worked out yet; reload this page and this line will say what happened to it. {SAME_CLAIM}
          </p>
        </section>
      );
    case "transcript_unavailable":
      return (
        <p data-testid="pasted-state-transcript-unavailable">
          <span className="badge badge-outline">Transcript unavailable</span>{" "}
          <span className="muted">The transcript for this reference is no longer stored, so no autopsy can run or be shown for it.</span>
        </p>
      );
    case "unavailable":
      return (
        <p data-testid="pasted-state-unavailable">
          <span className="badge badge-outline">Autopsy details unavailable</span>{" "}
          <span className="muted">{state.reason}</span>
        </p>
      );
  }
}

function PastedReferenceRow({
  item,
  readyCard,
}: {
  item: PastedReferenceItem;
  readyCard: (item: AnalysedTrendItem) => ReactNode;
}) {
  const host = referenceHost(item.sourceUrl);
  return (
    <li>
      <article className="panel" data-testid={`pasted-${item.itemId}`} aria-labelledby={`pasted-title-${item.itemId}`}>
        <header>
          <p className="label">Pasted reference · another creator&apos;s work</p>
          <h3 id={`pasted-title-${item.itemId}`}>{referenceTitle(item)}</h3>
          <p className="muted">
            {host !== null ? (
              <a href={item.sourceUrl} rel="noopener noreferrer" target="_blank">
                The original, by its creator, on {host} (opens in a new tab)
              </a>
            ) : (
              <span>The original&apos;s link is not a web address this page can open.</span>
            )}
            {" · "}Pasted <time className="mono" dateTime={item.createdAt}>{item.createdAt}</time>
            {item.niche !== null ? (
              <>
                {" · "}Niche: <span className="mono">{item.niche}</span>
              </>
            ) : null}
          </p>
        </header>
        <StateLine state={item.state} />
        {item.state.kind === "ready" ? readyCard(item.state.item) : null}
      </article>
    </li>
  );
}

export function PastedReferences({
  items,
  readyCard,
}: {
  /** Newest first, as the scoped reader returns them. */
  items: readonly PastedReferenceItem[];
  /** The ranked feed's own analysed-item card, supplied by the view that owns it. */
  readyCard: (item: AnalysedTrendItem) => ReactNode;
}) {
  return (
    <section aria-labelledby="pasted-references-heading" data-testid="pasted-references">
      <h2 id="pasted-references-heading">Your pasted references</h2>
      {items.length === 0 ? (
        <section className="panel trends-state" data-testid="pasted-references-empty">
          <p>Nothing pasted yet.</p>
          <p className="muted">
            Pasting a public video link and its transcript queues a background autopsy of its mechanism, which you can then spin into your own voice from here.
          </p>
        </section>
      ) : (
        <ol className="trends-feed" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <PastedReferenceRow key={item.itemId} item={item} readyCard={readyCard} />
          ))}
        </ol>
      )}
    </section>
  );
}
