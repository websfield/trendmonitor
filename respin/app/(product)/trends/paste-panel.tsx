"use client";

// "Paste a reference" (slice 8c, R13; R-96/R-98). The one control on /trends
// that spends credits. Every number on it is a PROP the page read from config
// or a package constant — the price and balance from the credits quote, the
// transcript ceiling from `POST_CONTENT_MAX`, the title ceiling from
// `PASTED_REFERENCE_TITLE_MAX` — so no number is typed in this file.
//
// THE PANEL IS A THIN HOOK OWNER OVER A PURE VIEW, the `SpinPanel` /
// `SpinOutcome` split: `PastePanelView` takes `state` and `pending` as props so
// every rendered state — idle, pending, saved, replayed, refused per field,
// disabled per reason — can be rendered by a test and swept by the claims
// canon, which `useActionState` alone would hide behind a server round trip.
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "../../ui/button";
import { Field } from "../../ui/field";
import { SubmitButton } from "../onboarding/submit-button";
import {
  IDLE_PASTE_STATE,
  type PasteActionState,
  type PasteRefusedField,
} from "./paste-state";

/** The credits facade's answer to "what would a paste cost, and may it run". */
export type PasteQuote = Readonly<{
  creditCost: number;
  balance: number;
  allowed:
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; reason: "tier" | "paused" }>;
}>;

export type PastePanelProps = Readonly<{
  quote: PasteQuote;
  /** `POST_CONTENT_MAX`, read by the page from `@respin/db`. Code points. */
  transcriptLimit: number;
  /** `PASTED_REFERENCE_TITLE_MAX`, read by the page from `@respin/db`. Code points. */
  titleLimit: number;
  /** The profile's tracked niches — the only values the intake accepts. */
  niches: readonly Readonly<{ id: string; niche: string }>[];
  action: (prev: PasteActionState, formData: FormData) => Promise<PasteActionState>;
}>;

export const PASTE_FIELD_IDS: Readonly<Record<PasteRefusedField, string>> = {
  sourceUrl: "paste-url",
  title: "paste-title",
  transcript: "paste-transcript",
  niche: "paste-niche",
};

export const PASTE_REFUSAL_ID = "paste-refusal";
export const PASTE_DISABLED_REASON_ID = "paste-disabled-reason";

/**
 * CODE POINTS, NOT UTF-16 UNITS. `POST_CONTENT_MAX` and
 * `PASTED_REFERENCE_TITLE_MAX` are both enforced over `[...value].length` in
 * `@respin/db`, so a counter over `value.length` would tell a creator with an
 * emoji in the title that they had room when the server would refuse.
 */
export function codePoints(value: string): number {
  return [...value].length;
}

/**
 * What the disabled panel says, per reason. NEITHER SELLS: the tier copy
 * names the plans that include the feature and where to compare them (the
 * `profile_cap` / `mode_not_in_plan` precedent) and offers no link and no
 * "upgrade"; the pause copy names the resume act, which is the remedy.
 */
export const PASTE_DISABLED_COPY: Readonly<
  Record<"tier" | "paused", Readonly<{ title: string; detail: string }>>
> = {
  tier: {
    title: "This plan does not include pasting references",
    detail:
      "Pasting a reference for autopsy is part of the Creator, Pro and Studio plans, and this workspace's plan does not include it. The billing page shows what this workspace is on today.",
  },
  paused: {
    title: "This workspace is paused",
    detail:
      "While a pause is on, credits are frozen and nothing that would spend them runs — and an autopsy spends credits. Your credits and your pasted references are exactly where you left them. Resume from the billing page and this becomes available again.",
  },
};

export function PastePanel(props: PastePanelProps) {
  const [state, formAction, pending] = useActionState(props.action, IDLE_PASTE_STATE);
  // A field-named refusal moves focus to that field. The refusal text is
  // already linked from the field by `aria-describedby`, so the move is what
  // makes the description reach a screen-reader user without a hunt; with JS
  // off the live region still renders and the field is still one Tab away.
  useEffect(() => {
    if (state.status !== "refused" || state.field === undefined) return;
    const el = document.getElementById(PASTE_FIELD_IDS[state.field]);
    if (el instanceof HTMLElement) el.focus();
  }, [state]);
  return <PastePanelView {...props} state={state} pending={pending} formAction={formAction} />;
}

export type PastePanelViewProps = PastePanelProps &
  Readonly<{
    state: PasteActionState;
    pending: boolean;
    formAction: (formData: FormData) => void;
  }>;

function describedBy(
  field: PasteRefusedField,
  blocked: boolean,
  refusedField: PasteRefusedField | undefined
): string {
  return [
    `${PASTE_FIELD_IDS[field]}-limit`,
    blocked ? PASTE_DISABLED_REASON_ID : null,
    refusedField === field ? PASTE_REFUSAL_ID : null,
  ]
    .filter((id): id is string => id !== null)
    .join(" ");
}

export function PastePanelView({
  quote,
  transcriptLimit,
  titleLimit,
  niches,
  state,
  pending,
  formAction,
}: PastePanelViewProps) {
  // ALL FOUR CONTROLLED, so a refused paste keeps what the creator typed and
  // what they SELECTED, and so the counters are live.
  //
  // THE SELECT WAS THE FOURTH AND IT WAS NOT (code review round 1, C5).
  // Verified against the installed react-dom 19.2.8 rather than remembered:
  // every `<form action>` submit calls `requestFormReset` on the form fiber,
  // which sets flag 1024 and commits `stateNode.reset()`. A controlled input
  // is re-driven from state on the same commit and never visibly changes; an
  // uncontrolled `<select defaultValue="">` snaps back to "None". `niche` is a
  // REFUSABLE field, so on the refusal path the panel moved focus to a control
  // reading "None" with `aria-invalid="true"` — announcing a choice the
  // creator never made as the invalid one — and a second press would then
  // store the reference with no niche at all.
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [niche, setNiche] = useState("");

  const blocked = quote.allowed.ok ? null : quote.allowed.reason;
  const refusedField = state.status === "refused" ? state.field : undefined;
  const titleCount = codePoints(title);
  const transcriptCount = codePoints(transcript);

  return (
    <section className="panel" aria-labelledby="paste-reference-heading" data-testid="paste-panel">
      <h2 id="paste-reference-heading">Paste a reference</h2>
      <p className="muted">
        Paste another creator&apos;s public video link and its transcript. The autopsy finds the mechanism behind it — hook mechanic, beats, ending, follow trigger — so you can spin it into your own voice. A spin that comes out too close to the original is withheld.
      </p>
      {blocked !== null ? (
        <div className="banner" id={PASTE_DISABLED_REASON_ID} data-testid={`paste-disabled-${blocked}`}>
          <strong>{PASTE_DISABLED_COPY[blocked].title}</strong>
          <p>{PASTE_DISABLED_COPY[blocked].detail}</p>
        </div>
      ) : (
        <p id="paste-cost" data-testid="paste-cost">
          Costs <span className="mono">{quote.creditCost}</span> credits — the autopsy runs in the background, usually within a few minutes. Balance: <span className="mono">{quote.balance}</span>.
        </p>
      )}
      <form action={formAction} aria-busy={pending} aria-describedby={blocked !== null ? PASTE_DISABLED_REASON_ID : "paste-cost"}>
        <Field
          label="Video link"
          htmlFor={PASTE_FIELD_IDS.sourceUrl}
          limitId={`${PASTE_FIELD_IDS.sourceUrl}-limit`}
          limit="A full public web address starting with http:// or https://."
        >
          <input
            id={PASTE_FIELD_IDS.sourceUrl}
            name="sourceUrl"
            type="url"
            inputMode="url"
            required
            pattern="https?://.+"
            autoComplete="off"
            disabled={blocked !== null}
            aria-describedby={describedBy("sourceUrl", blocked !== null, refusedField)}
            aria-invalid={refusedField === "sourceUrl" ? true : undefined}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </Field>
        <Field
          label="Title (optional)"
          htmlFor={PASTE_FIELD_IDS.title}
          limitId={`${PASTE_FIELD_IDS.title}-limit`}
          limit={
            <span data-testid="paste-title-count">
              <span className="mono">{titleCount}</span> of <span className="mono">{titleLimit}</span> characters. Left blank, the link&apos;s site is shown instead.
            </span>
          }
        >
          <input
            id={PASTE_FIELD_IDS.title}
            name="title"
            type="text"
            autoComplete="off"
            // NO `maxLength` (the onboarding precedent): the attribute truncates
            // a paste silently and counts UTF-16 units, while the server counts
            // code points and refuses by name. The limit is stated instead.
            disabled={blocked !== null}
            aria-describedby={describedBy("title", blocked !== null, refusedField)}
            aria-invalid={refusedField === "title" ? true : undefined}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Transcript"
          htmlFor={PASTE_FIELD_IDS.transcript}
          limitId={`${PASTE_FIELD_IDS.transcript}-limit`}
          limit={
            <span data-testid="paste-transcript-count">
              <span className="mono">{transcriptCount.toLocaleString("en-US")}</span> of{" "}
              <span className="mono">{transcriptLimit.toLocaleString("en-US")}</span> characters. The transcript is another creator&apos;s work: it is kept to find the mechanism behind it and is never shown back on this page.
            </span>
          }
        >
          <textarea
            id={PASTE_FIELD_IDS.transcript}
            name="transcript"
            rows={8}
            required
            disabled={blocked !== null}
            aria-describedby={describedBy("transcript", blocked !== null, refusedField)}
            aria-invalid={refusedField === "transcript" ? true : undefined}
            style={{ width: "100%" }}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </Field>
        <Field
          label="Niche (optional)"
          htmlFor={PASTE_FIELD_IDS.niche}
          limitId={`${PASTE_FIELD_IDS.niche}-limit`}
          limit="Only niches this creator profile tracks are listed."
        >
          <select
            id={PASTE_FIELD_IDS.niche}
            name="niche"
            disabled={blocked !== null}
            aria-describedby={describedBy("niche", blocked !== null, refusedField)}
            aria-invalid={refusedField === "niche" ? true : undefined}
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          >
            <option value="">None</option>
            {niches.map((row) => (
              <option key={row.id} value={row.niche}>{row.niche}</option>
            ))}
          </select>
        </Field>
        {blocked !== null ? (
          <button
            type="submit"
            className={buttonClass("primary")}
            disabled
            aria-disabled="true"
            aria-describedby={PASTE_DISABLED_REASON_ID}
          >
            Paste for autopsy
          </button>
        ) : (
          <SubmitButton className={buttonClass("primary")} pendingLabel="Queuing the autopsy…">
            Paste for autopsy
          </SubmitButton>
        )}
      </form>
      <div role="status" aria-live="polite" data-testid="paste-status" style={{ minHeight: "1.2em" }}>
        <PasteOutcome state={state} pending={pending} />
      </div>
    </section>
  );
}

/**
 * What a saved paste says, decided by the CLAIM it landed on rather than by
 * what this press cost (code review round 1, C6).
 *
 * The panel printed "Already queued — nothing charged" for every replay. A
 * re-paste of the same link and transcript lands on the same claim, and a
 * `parked` claim is terminal — `startAttempt` refuses it and the system queue
 * reader excludes it — so that sentence promised background work that will
 * never run, on the exact press a creator repeats when they are waiting. A
 * `completed` claim is not queued either; it is done.
 *
 * NO RETRY IS OFFERED, because there is no retry mechanism to offer. What the
 * copy gives instead is the true way forward the intake already has: the item
 * is keyed on the transcript digest, so a different transcript for the same
 * link is a different item and a new claim.
 *
 * THE SWITCH IS EXHAUSTIVE. A fifth claim status reaching `paste-state.ts`
 * fails to narrow at `never` below rather than falling into "queued".
 */
function SavedOutcome({ state }: { state: Extract<PasteActionState, { status: "saved" }> }): ReactNode {
  const balance = <span className="mono">{state.balanceAfter}</span>;
  const charged = <span className="mono">{state.creditsChargedNow}</span>;
  switch (state.claimStatus) {
    case "parked":
      return (
        <p className="muted" data-testid="paste-saved-parked">
          This link and transcript land on an earlier attempt that stopped, so nothing new was queued and {charged} credits were charged. Balance: {balance}. That attempt is listed under your pasted references below, with what it charged; pasting the same link with a different transcript starts a new one.
        </p>
      );
    case "completed":
      return (
        <p className="muted" data-testid="paste-saved-completed">
          This link and transcript were analysed already, so nothing new was queued and {charged} credits were charged. Balance: {balance}. The analysis is under your pasted references below.
        </p>
      );
    case "pending":
    case "failed":
      return state.replayed ? (
        <p className="muted" data-testid="paste-saved-replayed">
          Already queued — nothing charged. Balance: {balance}.
        </p>
      ) : (
        <p className="muted" data-testid="paste-saved">
          Queued for autopsy. {charged} credits charged. Balance: {balance}.
        </p>
      );
    default: {
      const unreachable: never = state.claimStatus;
      return unreachable;
    }
  }
}

export function PasteOutcome({ state, pending }: { state: PasteActionState; pending: boolean }): ReactNode {
  if (pending) return <p className="muted">Queuing the autopsy…</p>;
  if (state.status === "idle") return null;
  if (state.status === "saved") return <SavedOutcome state={state} />;
  // THE WORDS ARRIVE WITH THE STATE. This file is a client module, and
  // `../billing-errors` reaches `@respin/credits/app-server` and therefore
  // `pg`; importing the copy map here compiled, typechecked and tested green
  // and broke `next build` with "Module not found: Can't resolve 'tls'". The
  // action resolves the copy on the server (`paste-state.ts`'s `copy`).
  const copy = state.copy;
  return (
    <div className="banner" id={PASTE_REFUSAL_ID} data-testid="paste-refused" data-field={state.field ?? ""}>
      <strong>{copy.title}</strong>
      <p>{copy.detail}</p>
    </div>
  );
}
