"use client";
// The public Sample Spin panel (Phase 10a plan C2, REQ-H02). TERMINAL STATES
// ONLY: the visitor types an idea, sees "checking", and then either the
// synthetic original beside the gate-passed Spin with the sample rules that
// shaped it highlighted, or an honest refusal with a next step. Nothing
// streams, nothing partial is shown, and no latency figure is claimed — the
// provider path is buffered and the checking state says only what is true.
//
// The idea is posted as JSON to /api/demo with a fresh request id per submit;
// a retry of the SAME submit (a network failure) reuses the id, so it can
// never start a second vendor sequence — the server answers the replay from
// its money fact.
import { useId, useRef, useState } from "react";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { buttonClass } from "../../ui/button";
import { SAMPLE_SPIN_RETENTION } from "./disclosure";
import { claimFamilyNote } from "../../(product)/studio/run-copy";

export type SampleSpinOriginal = Readonly<{ title: string; lines: readonly string[] }>;

type Accepted = Readonly<{
  status: "accepted";
  spin: readonly Readonly<{ field: string; text: string }>[];
  weakestPoint: string;
  claimFlags: readonly Readonly<{ family: string; token: string; field: string; unit: string }>[];
  highlightedRules: readonly Readonly<{ id: string; text: string }>[];
  rewritten: boolean;
}>;
type Refused = Readonly<{ status: "refused"; reason: string; nextAction: string }>;
type Panel = { kind: "idle" } | { kind: "checking" } | { kind: "accepted"; result: Accepted } | { kind: "refused"; result: Refused };

const FIELD_LABELS: Readonly<Record<string, string>> = {
  "/thesis/statement": "Thesis",
  "/thesis/why": "Why",
  "/framework/name": "Framework",
  "/framework/why": "Framework, why",
  "/caption/text": "Caption",
  "/whyThisPerforms/reasoning": "Why this could perform",
};

function labelFor(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]!;
  const hook = field.match(/^\/hooks\/(\d+)\/text$/);
  if (hook) return `Hook ${Number(hook[1]) + 1}`;
  const beat = field.match(/^\/beats\/(\d+)\/vo$/);
  if (beat) return `Beat ${Number(beat[1]) + 1}`;
  const shot = field.match(/^\/shotMap\/(\d+)\/(shot|note)$/);
  if (shot) return `Shot ${Number(shot[1]) + 1}${shot[2] === "note" ? ", note" : ""}`;
  const text = field.match(/^\/onScreenText\/(\d+)\/text$/);
  if (text) return `On screen ${Number(text[1]) + 1}`;
  return field.replace(/^\//, "").replace(/\//g, " ");
}

function codePoints(text: string): number {
  return Array.from(text).length;
}

export function SampleSpinPanel({ original, maxCodePoints }: { original: SampleSpinOriginal; maxCodePoints: number }) {
  const [idea, setIdea] = useState("");
  const [panel, setPanel] = useState<Panel>({ kind: "idle" });
  const requestId = useRef<string | null>(null);
  const ideaId = useId();
  const used = codePoints(idea);
  const busy = panel.kind === "checking";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || idea.trim().length === 0 || used > maxCodePoints) return;
    // One id per submit; a retry after a network failure reuses it.
    requestId.current ??= crypto.randomUUID();
    setPanel({ kind: "checking" });
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, idea }),
      });
      const body = (await response.json()) as Accepted | Refused;
      requestId.current = null;
      setPanel(body.status === "accepted" ? { kind: "accepted", result: body } : { kind: "refused", result: body });
    } catch (err) {
      rethrowNextControlFlow(err);
      setPanel({
        kind: "refused",
        result: { status: "refused", reason: "network", nextAction: "The request did not reach the server. Try again; the same request is reused, so nothing runs twice." },
      });
    }
  }

  return (
    <section className="landing-section demo-section" aria-labelledby={`${ideaId}-heading`}>
      <div className="demo-panel sample-spin">
        <div className="demo-grid">
          <div className="demo-before">
            <span className="demo-label">THE SYNTHETIC REFERENCE REEL (FICTIONAL)</span>
            <p className="sample-spin-title">{original.title}</p>
            <div className="demo-copy">
              {original.lines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
          <div className="demo-after">
            <span className="demo-label" id={`${ideaId}-heading`}>YOUR IDEA, THROUGH THE SAMPLE BRAIN</span>
            {panel.kind === "accepted" ? (
              <AcceptedView result={panel.result} />
            ) : (
              <form className="sample-spin-form" onSubmit={submit}>
                <label htmlFor={ideaId} className="sample-spin-label">
                  Type an idea for the sample creator, a chair restorer. {SAMPLE_SPIN_RETENTION}
                </label>
                <textarea
                  id={ideaId}
                  className="sample-spin-textarea"
                  value={idea}
                  onChange={(e) => {
                    requestId.current = null;
                    setIdea(e.target.value);
                  }}
                  rows={4}
                  disabled={busy}
                  aria-describedby={`${ideaId}-count`}
                />
                <div className="sample-spin-row">
                  <span id={`${ideaId}-count`} className={used > maxCodePoints ? "sample-spin-count sample-spin-over" : "sample-spin-count"}>
                    {used} / {maxCodePoints}
                  </span>
                  <button type="submit" className={buttonClass("primary")} disabled={busy || used === 0 || used > maxCodePoints}>
                    {busy ? "Checking every unit against the gates…" : "Run the Sample Spin"}
                  </button>
                </div>
                {panel.kind === "checking" ? (
                  <p className="sample-spin-status" role="status">
                    Drafting, then the Kill Test, traceability and the similarity gate. One rewrite is allowed. Nothing shows until it passes.
                  </p>
                ) : null}
                {panel.kind === "refused" ? (
                  <div className="sample-spin-refusal" role="status">
                    <span className="demo-label">WITHHELD</span>
                    <p>{panel.result.nextAction}</p>
                  </div>
                ) : null}
              </form>
            )}
          </div>
        </div>
        <div className="demo-foot">
          <span>
            SAMPLE SPIN &middot; FICTIONAL SAMPLE BRAIN AND REFERENCE &middot; THE PRODUCTION ANALYSE-AND-SPIN PIPELINE &middot; EVERY MODEL CALL METERED &middot; NOTHING YOU TYPE IS KEPT HERE, THOUGH IT DOES GO TO A THIRD-PARTY MODEL PROVIDER &middot; DISCLOSURE: CHECK YOUR PLATFORM&rsquo;S CURRENT POLICY BEFORE POSTING
          </span>
        </div>
      </div>
    </section>
  );
}

export function AcceptedView({ result }: { result: Accepted }) {
  return (
    <div className="sample-spin-result">
      <dl className="spin-units">
        {result.spin.map((unit) => (
          <div key={unit.field} className="spin-unit">
            <dt className="script-tc">{labelFor(unit.field)}</dt>
            <dd className="script-line">{unit.text}</dd>
          </div>
        ))}
      </dl>
      <div className="the-turn">
        <span className="the-turn-label">WEAKEST POINT</span>
        <p>{result.weakestPoint}</p>
      </div>
      {/* THE CLAIM FLAGS (audit Phase 2 gate, R-172), as `/studio` renders
          them: the phrase, the sentence it sits in, and the family's note. */}
      {result.claimFlags.length > 0 ? (
        <div className="spin-rules" data-testid="sample-spin-claims">
          <span className="demo-label">WHAT THE DRAFT SAYS ABOUT ITSELF</span>
          <ul>
            {result.claimFlags.map((flag, i) => (
              <li key={`${flag.field}-${i}`} className="spin-rule">
                <code>{flag.token}</code> — {flag.unit} · {claimFamilyNote(flag.family)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="spin-rules">
        <span className="demo-label">SAMPLE BRAIN RULES THE GATE SAYS THIS DRAFT KEPT</span>
        {result.highlightedRules.length === 0 ? (
          <p className="script-shot">No rule was scored as kept; the draft passed the hard gates only.</p>
        ) : (
          <ul>
            {result.highlightedRules.map((rule) => (
              <li key={rule.id} className="spin-rule">{rule.text}</li>
            ))}
          </ul>
        )}
        {result.rewritten ? <p className="script-shot">The first draft failed a gate and was rewritten once.</p> : null}
      </div>
    </div>
  );
}
