// Pure Trends surface. The page supplies only data a scoped reader returned;
// this component never creates a trend, a metric, or a performance claim.
import type { ReactNode } from "react";
import { PastePanel, type PastePanelProps } from "./paste-panel";
import { PastedReferences, type PastedReferenceItem } from "./pasted-references";
import { SpinPanel } from "./spin-panel";

export type OutlierEvidence = Readonly<{
  ratio: number;
  baseline: number;
  baselineSampleSize: number;
  channel: string;
  window: Readonly<{ startsAt: string; endsAt: string }>;
}>;

export type OriginalReferenceSummary = Readonly<{
  source: "YouTube" | "Submitted";
  title: string;
  mechanismSummary: string;
}>;

// Temporary presentation shape for the app-safe DB facade's pending feed
// projection. It mirrors the projection, not `@respin/trends`: app/** must not
// cross the package boundary directly.
export type SaturationPresentation =
  | Readonly<{
      status: "measured";
      matchingItems: number;
      populationSize: number;
      prevalence: number;
      window: Readonly<{ startsAt: string; endsAt: string }>;
      methodVersion: string;
    }>
  | Readonly<{ status: "unmeasured"; reason: "incomplete_provenance" }>;

export type TrendAutopsy = Readonly<{
  hookMechanic: string;
  beats: readonly string[];
  ending: string;
  followTrigger: string;
}>;

export type TrendSpin =
  | Readonly<{
      kind: "result";
      originalReference: OriginalReferenceSummary;
      spinResult: string;
    }>
  | Readonly<{
      kind: "near_copy_refused";
      chargedCredits: number;
      whatToTry: string;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: string;
    }>
  | Readonly<{
      kind: "action";
      autopsyId: string;
      originalReference: OriginalReferenceSummary;
      action: (
        prev: import("./spin-state").SpinActionState,
        formData: FormData
      ) => Promise<import("./spin-state").SpinActionState>;
    }>;

export type AnalysedTrendItem = Readonly<{
  kind: "analysed";
  id: string;
  title: string;
  source: "YouTube" | "Submitted";
  stale: boolean;
  outlier: OutlierEvidence | null;
  /**
   * Slice 8c (R-96): a pasted reference has NO channel baseline and none is
   * invented. `"unavailable"` renders an explicit designed line where the
   * ratio block would sit; absent means the feed's ordinary "no evidence" (a
   * withheld partial bundle renders nothing, as before).
   */
  baselineState?: "unavailable";
  saturation: SaturationPresentation | null;
  autopsy: TrendAutopsy;
  spin: TrendSpin;
}>;

export type MetadataOnlyYoutubeItem = Readonly<{
  kind: "metadata_only_youtube";
  id: string;
  title: string;
  transcriptState: "required" | "unavailable";
  stale: boolean;
}>;

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type TrendsFeedState =
  | Readonly<{ kind: "unavailable"; reason: string }>
  | Readonly<{ kind: "empty"; reason: string }>
  | Readonly<{
      kind: "ready" | "stale";
      autopsiedItems: NonEmptyReadonlyArray<AnalysedTrendItem>;
      discoveryItems: readonly MetadataOnlyYoutubeItem[];
    }>;

export type TrendsViewProps = Readonly<{
  state: TrendsFeedState;
  /**
   * Slice 8c. The paste panel and the owner's pasted section render ABOVE the
   * feed in every feed state — a creator with no tracked niche, or an empty or
   * unavailable feed, can still paste. Both are absent only when there is no
   * selected profile to paste for.
   */
  paste?: PastePanelProps;
  pastedReferences?: readonly PastedReferenceItem[];
}>;

function StatePanel({ children }: { children: ReactNode }) {
  return <section className="panel trends-state">{children}</section>;
}

function StaleBadge() {
  return <span className="badge" aria-label="Stale item">Stale</span>;
}

function OutlierEvidenceView({ evidence }: { evidence: OutlierEvidence }) {
  if (
    !Number.isFinite(evidence.ratio) ||
    !Number.isFinite(evidence.baseline) ||
    evidence.baseline < 0 ||
    !Number.isSafeInteger(evidence.baselineSampleSize) ||
    evidence.baselineSampleSize <= 0 ||
    [evidence.channel, evidence.window.startsAt, evidence.window.endsAt].some(
      (value) => value.trim().length === 0
    )
  ) {
    return null;
  }

  return (
    <p className="muted" data-testid="outlier-evidence">
      <span className="label">Outlier ratio</span>{" "}
      <span className="mono">{evidence.ratio.toFixed(2)}×</span> against a{" "}
      <span className="mono">{evidence.baseline.toLocaleString()}</span> baseline from{" "}
      <span className="mono">{evidence.baselineSampleSize}</span> recent items on {evidence.channel},{" "}
      from <span className="mono">{evidence.window.startsAt}</span> through{" "}
      <span className="mono">{evidence.window.endsAt}</span>.
    </p>
  );
}

function SaturationView({ evidence, id }: { evidence: SaturationPresentation; id: string }) {
  if (evidence.status === "unmeasured") {
    return (
      <p className="muted" data-testid={`saturation-${id}`}>
        Saturation is unmeasured because its provenance is incomplete.
      </p>
    );
  }

  return (
    <p className="muted" data-testid={`saturation-${id}`}>
      <span className="label">Measured saturation</span>: <span className="mono">{evidence.matchingItems}</span>{" "}
      of <span className="mono">{evidence.populationSize}</span> items, prevalence{" "}
      <span className="mono">{(evidence.prevalence * 100).toFixed(1)}%</span>, from{" "}
      <span className="mono">{evidence.window.startsAt}</span> through{" "}
      <span className="mono">{evidence.window.endsAt}</span>, method{" "}
      <span className="mono">{evidence.methodVersion}</span>.
    </p>
  );
}

function AutopsyView({ autopsy, id }: { autopsy: TrendAutopsy; id: string }) {
  return (
    <details data-testid={`autopsy-${id}`}>
      <summary>Autopsy</summary>
      <dl>
        <dt>Hook mechanic</dt>
        <dd>{autopsy.hookMechanic}</dd>
        <dt>Beats</dt>
        <dd><ol>{autopsy.beats.map((beat, index) => <li key={`${index}-${beat}`}>{beat}</li>)}</ol></dd>
        <dt>Ending</dt>
        <dd>{autopsy.ending}</dd>
        <dt>Follow trigger</dt>
        <dd>{autopsy.followTrigger}</dd>
      </dl>
    </details>
  );
}

function SpinView({ spin, id }: { spin: TrendSpin; id: string }) {
  if (spin.kind === "near_copy_refused") {
    return (
      <section className="banner" data-testid={`spin-refusal-${id}`} role="status">
        <h3>Spin refused</h3>
        <p>The candidate is withheld because it was too close to the reference.</p>
        <p>One rewrite was attempted. Charge applied: <span className="mono">{spin.chargedCredits}</span> credits.</p>
        <p>What to try: {spin.whatToTry}</p>
      </section>
    );
  }

  if (spin.kind === "unavailable") {
    return <p className="muted">Spin is unavailable: {spin.reason}</p>;
  }

  if (spin.kind === "action") {
    // The client control receives the server-owned action and the opaque id;
    // it never receives reference content, a price, or a scope.
    return (
      <SpinPanel
        action={spin.action}
        autopsyId={spin.autopsyId}
        originalReference={spin.originalReference}
      />
    );
  }

  return (
    <section aria-labelledby={`spin-${id}`} data-testid={`spin-result-${id}`}>
      <h3 id={`spin-${id}`}>Spin result</h3>
      <div
        className="trends-side-by-side"
        style={{
          display: "grid",
          gap: "var(--sp-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
        }}
      >
        <section aria-label="Original reference">
          <h4>Original reference</h4>
          <p>{spin.originalReference.source}: {spin.originalReference.title}</p>
          <p>{spin.originalReference.mechanismSummary}</p>
        </section>
        <section aria-label="Your spin result">
          <h4>Your spin result</h4>
          <p>{spin.spinResult}</p>
        </section>
      </div>
    </section>
  );
}

function AnalysedTrendCard({ item }: { item: AnalysedTrendItem }) {
  return (
    <article className="panel" data-testid={`trend-${item.id}`}>
      <header>
        <p className="label">{item.source}</p>
        <h2>{item.title}</h2>
        {item.stale ? <StaleBadge /> : null}
      </header>
      {item.saturation ? <SaturationView evidence={item.saturation} id={item.id} /> : null}
      {item.outlier ? (
        <OutlierEvidenceView evidence={item.outlier} />
      ) : item.baselineState === "unavailable" ? (
        <p className="muted" data-testid={`baseline-unavailable-${item.id}`}>
          No channel baseline — pasted reference
        </p>
      ) : null}
      <AutopsyView autopsy={item.autopsy} id={item.id} />
      <SpinView spin={item.spin} id={item.id} />
    </article>
  );
}

function MetadataOnlyYoutubeCard({ item }: { item: MetadataOnlyYoutubeItem }) {
  const transcript =
    item.transcriptState === "required" ? "Transcript required" : "Transcript unavailable";
  return (
    <article className="panel" data-testid={`trend-${item.id}`}>
      <header>
        <p className="label">YouTube · metadata only</p>
        <h2>{item.title}</h2>
        {item.stale ? <StaleBadge /> : null}
      </header>
      <p className="muted">{transcript}. Autopsy and Spin stay unavailable until a compliant transcript is available.</p>
    </article>
  );
}

export function TrendsView({ state, paste, pastedReferences }: TrendsViewProps) {
  return (
    <>
      {paste ? <PastePanel {...paste} /> : null}
      {pastedReferences ? (
        <PastedReferences
          items={pastedReferences}
          readyCard={(item) => <AnalysedTrendCard item={item} />}
        />
      ) : null}
      <TrendsFeed state={state} />
    </>
  );
}

function TrendsFeed({ state }: { state: TrendsFeedState }) {
  if (state.kind === "unavailable") {
    return (
      <StatePanel>
        <h1>Trends</h1>
        <p>{state.reason}</p>
      </StatePanel>
    );
  }

  if (state.kind === "empty") {
    return (
      <StatePanel>
        <h1>Trends</h1>
        <p>{state.reason}</p>
      </StatePanel>
    );
  }

  // The type makes an empty ready feed unrepresentable. This runtime guard
  // retains the designed empty state if untyped data bypasses that boundary.
  if (state.autopsiedItems.length === 0) {
    return (
      <TrendsFeed
        state={{
          kind: "empty",
          reason: "No eligible autopsied trend items are available for this feed yet.",
        }}
      />
    );
  }

  return (
    <section aria-labelledby="trends-heading">
      <header>
        <p className="label">Trends</p>
        <h1 id="trends-heading">Reference-led trend feed</h1>
      </header>
      {state.kind === "stale" ? (
        <p className="banner" role="status">
          Some items are stale. Their labels remain visible so you can decide whether to revisit them.
        </p>
      ) : null}
      <div className="trends-feed">
        {state.autopsiedItems.map((item) => <AnalysedTrendCard key={item.id} item={item} />)}
      </div>
      {state.discoveryItems.length > 0 ? (
        <section aria-labelledby="discovery-candidates-heading">
          <h2 id="discovery-candidates-heading">Discovery candidates</h2>
          <p className="muted">These metadata-only items are not part of the autopsied feed.</p>
          <div className="trends-feed">
            {state.discoveryItems.map((item) => <MetadataOnlyYoutubeCard key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
