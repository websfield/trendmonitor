// PURE presentation for /usage (REQ-G07, M1 slice). The page component does the
// gate, the scoping and the reads; this file only renders what it is handed, so
// every state below — zero balance, empty ledger, paused, degraded — is
// reachable from a test with a fixture instead of a database.
//
// Non-negotiable 2 (the ledger IS the balance): `balance` arrives already
// derived by `deriveBalance`, the single authority. Nothing here adds up the
// deltas in `rows` — the table is history, not arithmetic, and a second
// derivation living in a view is exactly the drift that rule forbids.
//
// Non-negotiable 6 (no invented specifics): every empty state says WHY it is
// empty and which milestone fills it. No projected burn, no estimated
// days-to-empty, no invoice list we do not have.
import type { ReactNode } from "react";
import type { UsageRunwayResult } from "@respin/credits/app-server";
import { Banner } from "../../ui/banner";
import { buttonClass } from "../../ui/button";
import { LedgerTable } from "../../ui/ledger-table";

/** A server action, or a plain URL when a test renders this component. */
export type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type UsageLedgerRow = {
  id: string;
  createdAt: Date;
  kind: string;
  delta: number;
  expiresAt: Date | null;
  ref: string | null;
};

/** R7/R8 (slice 2b): the scoped, unclamped credit-burn total for the current
 *  billing period. `ok: false` is a QUERY failure, distinct from `hasAnyDebit:
 *  false` (a real, answered "nothing spent") — collapsing the two would make a
 *  transient read failure render as a confirmed zero. */
export type MonthlyBurn =
  | { ok: true; hasAnyDebit: true; totalDebit: number }
  | { ok: true; hasAnyDebit: false }
  | { ok: false };

/** One mode's share of the period's burn. `label` is resolved on the server —
 *  `@respin/modes` is denied to `app/**` (R-64), so this view is handed the
 *  creator-facing name rather than looking one up. */
export type BurnModeRow = {
  mode: string;
  label: string;
  credits: number;
  debits: number;
};

/**
 * R17a (slice 6): the period's burn SPLIT BY MODE, from
 * `respinDb.burnByMode` — each `credit_ledger` debit joined to the terminal
 * generation its `ref_id` names.
 *
 * THREE BUCKETS, NOT ONE LIST, and the two extra ones are the honesty. A debit
 * is a mode's only when it reached a settled generation; a debit that names no
 * generation claim at all (the onboarding voice-brain build — same `ref_type`,
 * same attempt-id grain) is NOT a mode, and a debit whose claim never settled
 * is not a draft the creator has. Both are counted and named on the screen
 * rather than folded into a mode or dropped, so the parts add up to the total
 * above them.
 *
 * `ok: false` is a QUERY failure, kept distinct from an answered empty split
 * for exactly the reason `MonthlyBurn` keeps them distinct.
 */
export type BurnByMode =
  | {
      ok: true;
      byMode: BurnModeRow[];
      notAGeneration: { credits: number; debits: number };
      nonTerminalClaim: { credits: number; debits: number };
    }
  | { ok: false };

/**
 * WHICH PERIOD the burn numbers cover, and what the creator may be told it is
 * (R17a). Both strings come from `BURN_PERIOD_COPY` in `@respin/credits` —
 * the page resolves them beside the derivation that chose the window, for the
 * reason R-66 records for `modeLabel`.
 *
 * REQUIRED (learning honesty gate, 2026-09-01), and it shipped OPTIONAL for a
 * reason that was not a design one: making it required reddened `usageProps()`
 * in `tests/billing-ui.test.tsx`, which the change that added it was not
 * allowed to touch — so the absence was covered by a source scan instead. An
 * optional prop standing in for a required one, propped up by a scan over
 * source, is the shape CLAUDE.md has recorded twice (2026-08-26, 2026-08-29):
 * a required parameter with no default reads exactly like a guard and is not
 * one until a test drives it. The fixture now supplies a period, so the type
 * can say what was always true.
 *
 * WHAT REQUIRING IT BUYS, on a money screen: every renderer of this panel has
 * to state WHICH WINDOW its numbers cover, and the fallback noun is gone. A
 * dead subscription's stale `current_period_start` used to anchor "this month"
 * and sum many months of Free burn under that heading — the defect
 * `burnPeriod` was written to fix, and a silent default here is how it would
 * come back.
 */
export type BurnPeriodView = { start: Date; noun: string; phrase: string };

/** Exact, scoped brain-asset counts. This is a read for every billing state. */
export type UsageBrainAssets =
  | {
      state: "available";
      brainVersions: number;
      testedRules: number;
      loggedResults: number;
      feedback: number;
    }
  | { state: "no_profile" }
  | { state: "unavailable" };

export type UsageViewProps = {
  balance:
    | { ok: true; value: number; asOf: Date }
    | { ok: false; title: string; detail: string };
  burn: MonthlyBurn;
  period: BurnPeriodView;
  burnByMode: BurnByMode;
  /** One-snapshot, ledger-derived runway read. Never derived from page rows. */
  runway: UsageRunwayResult;
  brainAssets: UsageBrainAssets;
  rows: UsageLedgerRow[];
  /** True when the ledger has more rows than this page shows. */
  moreRows: boolean;
  paused: { resumesAt: Date | null } | null;
  portal:
    | { available: true; action: FormAction }
    | { available: false; reason: string };
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  billingHref: string;
};

// Panels, banners, muted text and the ledger table are Signal classes and
// primitives (app/globals.css, app/ui/).

/** ISO day. Deliberately not locale-formatted: the server and the browser must
 *  agree, and a test must be able to assert an exact string. */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sentence-case for a noun phrase used as a heading ("this month" -> "This
 *  month"). Deliberately ASCII-simple: both phrases are literals in
 *  `BURN_PERIOD_COPY`, so there is no locale question to get wrong. */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Note({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/**
 * What the two spend-derived notes may honestly say, given ONLY what this page
 * can see.
 *
 * A PURE FUNCTION over the visible page, because the wrong version of this is
 * two constants — which is exactly what shipped and what three reviewers found
 * (2026-08-28). The sentence "Nothing has been spent from this workspace yet"
 * was hardcoded into both notes and rendered directly above the creator's own
 * debit row.
 *
 * THREE BRANCHES, AND THE MIDDLE ONE IS THE POINT. `rows` is a CLAMPED page
 * (`moreRows` says so), so an absent debit on page 1 is not evidence that
 * nothing was ever spent — inferring it would be absence read as a zero, the
 * error this repo has shipped twice. So:
 *
 *   spent    — a debit is visible. Never claim nothing was spent.
 *   unknown  — no debit visible, but the page is clamped. Say what is true of
 *              the entries SHOWN, and claim nothing about the rest.
 *   none     — no debit visible and the whole ledger fits. Only here may the
 *              page say the workspace has spent nothing.
 */
export type SpendVisibility = "spent" | "unknown" | "none";

export function spendVisibility(
  rows: readonly { delta: number }[],
  moreRows: boolean
): SpendVisibility {
  if (rows.some((r) => r.delta < 0)) return "spent";
  return moreRows ? "unknown" : "none";
}

/**
 * The "by mode" note (R9, slice 2b; rewritten twice for slice 6's R17a).
 *
 * NO LONGER BRANCHES ON `SpendVisibility` — the burn TOTAL panel above now
 * answers "was anything spent" with a real, unclamped number (R7), so this
 * note's only job is the one question left: what can this page say about the
 * BREAKDOWN. That answer does not depend on whether anything was spent, so it
 * is one sentence, always.
 *
 * PINNED TO THE REAL PURPOSE LIST, not free prose: `tests/usage-burn-by-mode.test.ts`
 * derives the distinct spend-purpose constants defined anywhere in
 * `packages/credits/src` and asserts they are exactly `KNOWN_SPEND_PURPOSES`.
 * That mechanism is what made slice 6 rewrite this sentence rather than let it
 * go stale: the note first said "exactly one thing spends credits today
 * (building your voice brain)", generation made that false, and the second
 * version's "not split by mode yet" was made false by the split itself.
 */
export const KNOWN_SPEND_PURPOSES = ["onboarding_brain", "generation"] as const;

/**
 * Creator-paid ledger debits that do not enter the model-attempt purpose
 * vocabulary. A pasted-reference autopsy owns its own durable claim and debit,
 * so counting only `PricedOperation` purposes would repeat 8c-W2's omission.
 */
export const KNOWN_DIRECT_CHARGE_REF_TYPES = ["autopsy_claim"] as const;

/** Kept as a named export: it is the number the note's own wording depends on. */
export const KNOWN_SPEND_PURPOSE_COUNT: number =
  KNOWN_SPEND_PURPOSES.length + KNOWN_DIRECT_CHARGE_REF_TYPES.length;

/**
 * WHAT THIS SENTENCE MAY NOT DO, stated because R17a's own requirement says it
 * and mutation M13 is planted against it: there is NO MODE INFERENCE FROM THE
 * COST ROLLUP. `workspace_spend_monthly` is our vendor cost by month, its grain
 * carries no purpose and no mode, and a breakdown derived from it would be a
 * number about our spending wearing the label of theirs. The split above comes
 * from `respinDb.burnByMode`, which joins each `credit_ledger` debit to the
 * terminal generation its `ref_id` names — so the sentence now describes a
 * mechanism the page really runs instead of naming an absence.
 *
 * AND IT SAYS WHY ONLY GENERATION IS A MODE. The two `PricedOperation`
 * purposes share the `inference` ref_type (R-63), while a direct pasted-
 * reference autopsy debit uses `autopsy_claim`; neither row shape itself
 * carries a mode. "These credits went to a mode" is earned only by the
 * successful generation join, so creator-brain and autopsy charges appear
 * separately rather than being given an invented mode.
 */
export function burnByModeNote(): string {
  return `The split is made by joining each charge to the record it paid for, never by dividing up a cost total. ${KNOWN_SPEND_PURPOSE_COUNT} things spend credits today: generating a draft in the studio, which is what the modes above are; building a creator's voice brain; and running an autopsy for a reference you paste. The last two are not modes and are listed separately. Nothing here is estimated from the totals: every number is the sum of your real charges.`;
}

/**
 * The period line that sits under the burn total (R17a).
 *
 * IT EXISTS BECAUSE THE PANEL USED TO SAY "this month" FOR EVERY WORKSPACE
 * while a paid one was really being measured from its billing anniversary —
 * two different windows under one word, on a money screen. The word is now
 * chosen by the same derivation that chose the window, and the START DATE is
 * printed beside it so the creator can check it rather than trust it.
 */
export function burnPeriodLine(period: BurnPeriodView): string {
  return `Since ${day(period.start)} — ${period.phrase}.`;
}

/**
 * The by-mode split, or the honest reason there isn't one.
 *
 * A COMPONENT RATHER THAN INLINE JSX because it has four states and three of
 * them are the ones that go wrong: a failed read, an answered-but-empty split,
 * and a period whose only charges were not generations. Inline, those would be
 * nested ternaries no test could name.
 */
function BurnSplit({ burnByMode }: { burnByMode: BurnByMode }) {
  if (!burnByMode.ok) {
    return (
      <p className="muted" data-testid="burn-by-mode-error">
        The split by mode could not be loaded right now. The total above is
        still your real charge for this period.
      </p>
    );
  }
  const { byMode, notAGeneration, nonTerminalClaim } = burnByMode;
  if (
    byMode.length === 0 &&
    notAGeneration.debits === 0 &&
    nonTerminalClaim.debits === 0
  ) {
    return (
      <p className="muted" data-testid="burn-by-mode-empty">
        No charges in this period, so there is nothing to split.
      </p>
    );
  }
  return (
    <>
      <table className="ledger-table" data-testid="burn-by-mode-table">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Credits</th>
            <th>Charges</th>
          </tr>
        </thead>
        <tbody>
          {byMode.map((r) => (
            <tr key={r.mode} data-testid={`burn-mode-${r.mode}`}>
              <td>{r.label}</td>
              <td className="num num-delta">{r.credits}</td>
              <td className="num">{r.debits}</td>
            </tr>
          ))}
          {notAGeneration.debits > 0 ? (
            // NAMED, NOT FOLDED INTO A MODE. This bucket is "the debit's
            // reference matches no generation" — which is what the voice-brain
            // build looks like, because it spends under the same `ref_type`.
            <tr data-testid="burn-not-a-generation">
              <td>Not a studio draft</td>
              <td className="num num-delta">{notAGeneration.credits}</td>
              <td className="num">{notAGeneration.debits}</td>
            </tr>
          ) : null}
          {nonTerminalClaim.debits > 0 ? (
            // A charge whose draft never finished settling. Shown rather than
            // dropped or guessed into the mode its claim asked for: the
            // creator paid, and a number that quietly disappears is worse than
            // one that says it does not know.
            <tr data-testid="burn-non-terminal">
              <td>Charged, draft not settled</td>
              <td className="num num-delta">{nonTerminalClaim.credits}</td>
              <td className="num">{nonTerminalClaim.debits}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {nonTerminalClaim.debits > 0 ? (
        <p className="muted" data-testid="burn-non-terminal-note">
          One or more charges name a draft that never finished settling, so we
          cannot say which mode they belong to. Nothing is guessed into a mode.
          Contact support with this page open.
        </p>
      ) : null}
    </>
  );
}

/**
 * C8's operational runway state.  The projection is deliberately opaque to
 * this component: it arrives from `usageRunwayFor`, whose one transaction owns
 * the DB clock, active config, open-pause state, balance and debit aggregate.
 */
function RunwayPanel({ runway }: { runway: UsageRunwayResult }) {
  if (runway.state === "estimate") {
    return (
      <>
        <p data-testid="runway-estimate">
          <strong>Estimated {runway.daysToEmpty} days to empty.</strong>
        </p>
        <Note>
          This estimate uses the configured trailing {runway.trailingWindowDays} days,
          {" "}{runway.debitDayCount} distinct debit days, and your current
          ledger-derived balance of {runway.balance} credits as of {runway.asOf.toISOString()}.
        </Note>
      </>
    );
  }

  if (runway.state === "paused") {
    return (
      <p className="muted" data-testid="runway-paused">
        Not applicable while this workspace is paused. Credits are not debited
        and expiry clocks are frozen, so there is no current spending rate to project.
      </p>
    );
  }

  if (runway.state === "no_spend") {
    return (
      <p className="muted" data-testid="runway-no-spend">
        No debit was recorded in the configured trailing {runway.trailingWindowDays} days,
        so there is no spending rate to estimate from.
      </p>
    );
  }

  if (runway.state === "too_few_debit_days") {
    return (
      <p className="muted" data-testid="runway-too-few-debit-days">
        Estimate unavailable: {runway.debitDayCount} distinct debit days were recorded
        in the configured trailing {runway.trailingWindowDays} days. It needs at least
        {" "}{runway.minimumDebitDays} debit days before using a rate.
      </p>
    );
  }

  const copy = {
    config: "the configured trailing window could not be read",
    pause: "the pause state could not be read",
    balance: "the ledger-derived balance could not be read",
    ledger: "the ledger debit history could not be read",
  } as const;
  return (
    <p className="muted" data-testid={`runway-read-unavailable-${runway.component}`}>
      Runway estimate unavailable because {copy[runway.component]}. No estimate is shown.
    </p>
  );
}

function BrainAssetSummary({ assets }: { assets: UsageBrainAssets }) {
  if (assets.state === "no_profile") {
    return <p className="muted">Create or select a creator profile to see its brain assets.</p>;
  }
  if (assets.state === "unavailable") {
    return <p className="muted">Brain-asset counts could not be read right now.</p>;
  }
  return (
    <>
      <p data-testid="usage-brain-asset-counts">
        <span className="num">{assets.brainVersions}</span> brain versions, {" "}
        <span className="num">{assets.testedRules}</span> tested rules, {" "}
        <span className="num">{assets.loggedResults}</span> logged results, and {" "}
        <span className="num">{assets.feedback}</span> feedback entries.
      </p>
      <p className="muted">These are your creator brain assets, including history.</p>
    </>
  );
}

export function UsageView(props: UsageViewProps) {
  const {
    balance,
    burn,
    burnByMode,
    period,
    runway,
    brainAssets,
    rows,
    moreRows,
    paused,
    portal,
    error,
    billingHref,
  } = props;
  // The noun the burn TOTAL uses in-sentence, from the period the page
  // derived — never from a default. `BURN_PERIOD_COPY` is a total `Record`
  // over the two kinds, so there is no third answer to fall back to, and the
  // heading and the sentence below cannot name different windows.
  const periodNoun = period.noun;
  return (
    <section>
      <h1>Usage</h1>

      {error ? (
        <Banner
          title={error.title}
          data-testid="usage-action-error"
          role="alert"
        >
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}

      <div className="panel" data-testid="balance">
        <h2 style={{ marginTop: 0 }}>Credit balance</h2>
        {balance.ok ? (
          <>
            <p className="balance-num" style={{ margin: "0.25rem 0" }}>
              <strong data-testid="balance-value">{balance.value}</strong>{" "}
              <span className="muted">credits</span>
            </p>
            <Note>Derived from your credit ledger as of {day(balance.asOf)}.</Note>
            {balance.value === 0 ? (
              // REQ-G03's "clear prompt" at zero.
              <p data-testid="topup-prompt">
                You have no credits. Buy a credit pack or start a plan on{" "}
                <a href={billingHref}>billing settings</a> to keep generating.
              </p>
            ) : null}
          </>
        ) : (
          <div data-testid="balance-error">
            <strong>{balance.title}</strong>
            <p className="muted">{balance.detail}</p>
          </div>
        )}
      </div>

      {paused ? (
        <div className="panel" data-testid="paused-notice">
          <h2 style={{ marginTop: 0 }}>Credits are frozen</h2>
          <p>
            This workspace is paused: credits are not spent, not granted, and
            their expiry clocks are suspended until you resume.
          </p>
          <p>
            {paused.resumesAt
              ? `Scheduled to resume on ${day(paused.resumesAt)}.`
              : "No resume date has been recorded yet — it appears once Stripe confirms the pause."}{" "}
            <a href={billingHref}>Resume in billing settings</a>.
          </p>
        </div>
      ) : null}

      <div className="panel" data-testid="burn-by-mode">
        {/* R17a: the heading names the period the same way the numbers under
            it are measured — "This month" over an anniversary window was the
            2026-09-01 finding in one line of copy. */}
        <h2 style={{ marginTop: 0 }}>
          {capitalise(period.noun)}
        </h2>
        {/* R7/R8 (slice 2b): a SCOPED, UNCLAMPED query — never a sum over
            `rows` (that page is clamped; see the header note on this file).
            `ok: false` is a query failure, kept visibly distinct from a real
            answered zero so a transient read error cannot render as "you
            spent nothing" (absence is never a zero — the same rule
            `spendVisibility` exists for below, applied to a number that can
            now actually fail to load). */}
        {burn.ok ? (
          <p data-testid="burn-total">
            {burn.hasAnyDebit
              ? `${burn.totalDebit} credits spent ${periodNoun}`
              : `Nothing spent ${periodNoun}.`}
          </p>
        ) : (
          <p className="muted" data-testid="burn-total-error">
            {/* R17a, and the ONE line the R17a pass missed (billing +
                tenancy gates, round 2, 2026-09-01). The heading above takes
                its noun from the derivation and the period line below prints
                the window's start date, and this branch — sandwiched between
                them — said "This month" to every workspace. On a paid one
                that rendered three lines naming two different windows on a
                money screen, in the one state where the creator cannot see
                the number to check it against. */}
            {`${capitalise(periodNoun)}'s total could not be loaded right now.`}{" "}
            Your credit history below is read separately and is unaffected.
          </p>
        )}
        {/* R17a: WHICH period those numbers cover, stated rather than
            implied. One line, from the one derivation the page made, so the
            total and the split cannot be read as a different window than the
            one they were queried over. */}
        <p className="muted" data-testid="burn-period">
          {burnPeriodLine(period)}
        </p>
        {/* R17a (slice 6): the SLOT that used to live here is filled. The
            split is a scoped join from each debit to the terminal generation
            its `ref_id` names — never a division of `workspace_spend_monthly`,
            which is our vendor cost and carries no mode at all (mutation
            M13). `burnByModeNote` states that to the creator. */}
        <BurnSplit burnByMode={burnByMode} />
        <Note>{burnByModeNote()}</Note>
      </div>

      <div className="panel" data-testid="days-to-empty">
        <h2 style={{ marginTop: 0 }}>Days to empty</h2>
        <RunwayPanel runway={runway} />
      </div>

      <div className="panel" data-testid="usage-brain-assets">
        <h2>Brain assets</h2>
        <BrainAssetSummary assets={brainAssets} />
        <a
          href="/brain"
          className={buttonClass("secondary")}
          style={{ minHeight: "44px", minWidth: "44px" }}
        >
          View your Creator Brain
        </a>
      </div>

      <div className="panel" data-testid="ledger">
        <h2 style={{ marginTop: 0 }}>Credit history</h2>
        {rows.length === 0 ? (
          // A plain <p>, not <Note>: TypeScript does not check hyphenated JSX
          // attributes against a component's props, so `data-testid` on <Note>
          // would compile and silently never render.
          <p className="muted" data-testid="ledger-empty">
            No credit activity yet. Rows appear here when a subscription grants
            your monthly credits, when you buy a pack, and when credits are
            spent or expire.
          </p>
        ) : (
          <>
            <LedgerTable rows={rows} />
            {moreRows ? (
              <Note>
                Showing the most recent {rows.length} entries. Older entries are
                kept — paging through them arrives with the fuller usage view.
              </Note>
            ) : null}
          </>
        )}
      </div>

      <div className="panel" data-testid="invoices">
        <h2 style={{ marginTop: 0 }}>Invoices and payment method</h2>
        {/* SLOT (REQ-G07, receiver M2+/M6): an in-page invoice list adds no
            information the Customer Portal does not already show, and it needs
            live Stripe keys to be worth anything. The portal link IS the M1
            slice; the brain-as-asset panel that shares this page lands at M2. */}
        {portal.available ? (
          <form action={portal.action} data-testid="usage-portal">
            {/* Send a refusal back HERE rather than to the billing page the
                reader did not ask for. The action allowlists this value. */}
            <input type="hidden" name="from" value="/usage" />
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Current password{" "}
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                aria-describedby="usage-portal-reauth-help"
              />
            </label>
            <p className="muted" id="usage-portal-reauth-help">
              Required to confirm this billing change. The proof applies only to
              this signed-in session and expires after 10 minutes.
            </p>
            <button type="submit" className={buttonClass("primary")}>
              Open the Customer Portal
            </button>
            <Note>
              Invoices, receipts and your payment method live in Stripe&apos;s
              Customer Portal.
            </Note>
          </form>
        ) : (
          <div data-testid="portal-unavailable">
            {/* The reason is programmatically associated with the control it
                disables — same rule as billing's ActionButton (WCAG 3.3.2). */}
            <button
              type="button"
              disabled
              className={buttonClass("primary")}
              aria-describedby="portal-unavailable-reason"
            >
              Open the Customer Portal
            </button>
            <p className="muted" id="portal-unavailable-reason">
              {portal.reason}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
