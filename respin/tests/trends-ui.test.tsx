import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TrendsView,
  type AnalysedTrendItem,
  type MetadataOnlyYoutubeItem,
  type OriginalReferenceSummary,
} from "../app/(product)/trends/trends-view";
import { SpinOutcome } from "../app/(product)/trends/spin-panel";
import { spinWithheldLocator, type SpinActionState } from "../app/(product)/trends/spin-state";
// BY PATH, the `claims-vocabulary-agreement.test.ts` idiom: `tests/**` is the
// only tree that may read `@respin/modes` beside `app/**`'s copy of its
// vocabulary (R-64 denies the package to `app/**` outright), and importing by
// path keeps the app's resolution boundary intact.
import { SPECIFIC_SHAPES } from "../packages/modes/src/traceability";
import { SECTION_KEYS } from "../packages/modes/src/modes";
import {
  PASTE_DISABLED_COPY,
  PASTE_FIELD_IDS,
  PASTE_REFUSAL_ID,
  PastePanelView,
  codePoints,
  type PastePanelProps,
  type PastePanelViewProps,
} from "../app/(product)/trends/paste-panel";
import {
  PASTE_REFUSED_FIELDS,
  type PasteActionState,
  type PasteClaimStatus,
} from "../app/(product)/trends/paste-state";
import { BILLING_ERROR_COPY, type BillingErrorCode } from "../app/(product)/billing-errors";
import {
  PastedReferences,
  referenceHost,
  type PastedReferenceItem,
  type PastedReferenceState,
} from "../app/(product)/trends/pasted-references";
import {
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

const UNSAFE_REFERENCE: OriginalReferenceSummary = {
  source: "YouTube",
  title: "Reference",
  mechanismSummary: "A bounded mechanism summary.",
  // @ts-expect-error A raw transcript is not a renderable original-reference prop.
  transcript: "Raw third-party transcript text must not reach this view.",
};
void UNSAFE_REFERENCE;

const ANALYSED: AnalysedTrendItem = {
  kind: "analysed",
  id: "outlier-1",
  title: "A useful reference",
  source: "YouTube",
  stale: false,
  outlier: {
    ratio: 3.2,
    baseline: 1200,
    baselineSampleSize: 12,
    channel: "the reference channel",
    window: { startsAt: "2026-08-03T00:00:00Z", endsAt: "2026-09-02T00:00:00Z" },
  },
  saturation: {
    status: "measured",
    matchingItems: 18,
    populationSize: 45,
    prevalence: 0.4,
    window: { startsAt: "2026-08-03T00:00:00Z", endsAt: "2026-09-02T00:00:00Z" },
    methodVersion: "reference-count-v1",
  },
  autopsy: {
    hookMechanic: "A specific tension opens the reference.",
    beats: ["The comparison develops in three beats."],
    ending: "The ending returns to the opening tension.",
    followTrigger: "A concrete question closes the reference.",
  },
  spin: {
    kind: "result",
    originalReference: {
      source: "YouTube",
      title: "A useful reference",
      mechanismSummary: "Tension, contrast, question.",
    },
    spinResult: "Your result: use your own example, contrast and closing question.",
  },
};

const ORIGINAL_REFERENCE: OriginalReferenceSummary =
  ANALYSED.spin.kind === "result" ? ANALYSED.spin.originalReference : UNSAFE_REFERENCE;

function ready(autopsiedItems: readonly [AnalysedTrendItem, ...AnalysedTrendItem[]], discoveryItems: readonly MetadataOnlyYoutubeItem[] = []) {
  return { kind: "ready" as const, autopsiedItems, discoveryItems };
}

const METADATA_ONLY: MetadataOnlyYoutubeItem = {
  kind: "metadata_only_youtube",
  id: "youtube-meta-1",
  title: "Metadata-only upload",
  transcriptState: "unavailable",
  stale: false,
};

/**
 * The live action state after a usable spin. `reasoning` is deliberately NOT a
 * field here: the action's projection drops the model's performance rationale
 * and carries only what REQ-I04/I05 require beside the result.
 */
const RESULT_STATE: Extract<SpinActionState, { status: "result" }> = {
  status: "result",
  spinResult: "Your result: use your own example, contrast and closing question.",
  weakestPoint: "None of this has been checked against how your own audience actually behaves.",
  disclosureGuidance: "Say in the description that a tool helped draft this, in your own words.",
  chargedCredits: 2,
};

/**
 * A non-similarity refusal as the action returns it. The two sentences are the
 * REAL static copy a `forbidden_claim` refusal renders (`hard-rules.ts`
 * `REMEDIES` and `kill-test.ts` `SHARPER_ANGLES`), pinned here as strings so
 * the canon sweep below runs over the words a creator actually sees; they are
 * copies, not links, and drift there is caught by the modes package's own tests.
 */
const WITHHELD_STATE: Extract<SpinActionState, { status: "withheld" }> = {
  status: "withheld",
  chargedCredits: 2,
  why: [
    {
      rule: "forbidden_claim",
      remedy:
        "This says how the post will do once it is up, or how to avoid disclosing it. Neither is something this product can stand behind. Say what the idea does, and name what is weakest about it.",
      locators: ["in the caption"],
    },
    {
      rule: "invented_specific",
      remedy:
        "This specific is in neither your brain nor what you gave this generation. Replace it with one you can point to, or mark it [check] and fill it in before you post.",
      locators: ["a date in a hook", "a number in a beat"],
    },
  ],
  sharperAngle:
    "Try naming what the idea asks a viewer to do, and leave what happens after they see it out of the draft — nothing here has any evidence about that yet.",
};

// ------------------------- slice 8c fixtures: the paste panel and the pasted section

/** The two ceilings the page reads from `@respin/db`; here they are props, so the test can prove they are RENDERED, not typed. */
const TRANSCRIPT_LIMIT = 20000;
const TITLE_LIMIT = 120;

const PASTE_PROPS: PastePanelProps = {
  quote: { creditCost: 7, balance: 31, allowed: { ok: true } },
  transcriptLimit: TRANSCRIPT_LIMIT,
  titleLimit: TITLE_LIMIT,
  niches: [{ id: "tracked_1", niche: "home cooking" }],
  action: async () => ({ status: "idle" as const }),
};

function pasteView(
  overrides: Partial<PastePanelViewProps> = {}
): string {
  return renderToStaticMarkup(
    <PastePanelView {...PASTE_PROPS} state={{ status: "idle" }} pending={false} formAction={() => {}} {...overrides} />
  );
}

/**
 * A refused state as the ACTION builds one: the code, and the copy the ACTION
 * resolved from `BILLING_ERROR_COPY` on the server.
 *
 * The copy travels in the state rather than being looked up by the panel
 * because `paste-panel.tsx` is a client module and `../billing-errors` reaches
 * `@respin/credits/app-server` and therefore `pg` (`paste-state.ts`'s `copy`
 * docblock; `onboarding/run-copy.ts`'s header records the same break). This
 * fixture reads the SAME map the action reads, so a screen assertion here is
 * still an assertion about the one source of refusal words — not about a
 * sentence retyped in a test.
 */
function refusedState(code: BillingErrorCode, field?: (typeof PASTE_REFUSED_FIELDS)[number]): PasteActionState {
  return { status: "refused", code, copy: BILLING_ERROR_COPY[code], ...(field ? { field } : {}) };
}

const REFUSED: Record<string, PasteActionState> = Object.fromEntries(
  PASTE_REFUSED_FIELDS.map((field) => [
    field,
    refusedState(`pasted_reference_${field === "sourceUrl" ? "url" : field}` as BillingErrorCode, field),
  ])
);

const READY_PASTED: AnalysedTrendItem = {
  ...ANALYSED,
  id: "pasted-ready",
  title: "example.com",
  source: "Submitted",
  outlier: null,
  baselineState: "unavailable",
  saturation: null,
  spin: {
    kind: "action",
    autopsyId: "pasted-autopsy-1",
    originalReference: { source: "Submitted", title: "example.com", mechanismSummary: "Tension, contrast, question." },
    action: async () => ({ status: "idle" as const }),
  },
};

function pastedItem(state: PastedReferenceItem["state"], overrides: Partial<PastedReferenceItem> = {}): PastedReferenceItem {
  return {
    itemId: `pasted-${state.kind}`,
    title: "A pasted title",
    sourceUrl: "https://example.com/watch?v=abc",
    createdAt: "2026-09-03T10:00:00.000Z",
    niche: null,
    state,
    ...overrides,
  };
}

/**
 * ONE ENTRY PER `PastedReferenceState` KIND, AS A TOTAL MAP — THE POPULATION,
 * NOT A LIST SOMEBODY REMEMBERED (code review round 1, C12).
 *
 * This was a hand-written array whose only totality guard was
 * `RENDERED_STATES.length >= 41`. It happened to cover every kind; a seventh
 * kind joining the union left the type-checker green, the count green, and the
 * new copy unswept by the claims canon. Slice 6's and slice 7's round-1 BLOCKs
 * were both this class, and the source scan at the bottom of this file already
 * derives its population with `readdirSync`.
 *
 * `Record<PastedReferenceState["kind"], …>` makes the kind list the TYPE's, so
 * an unswept kind cannot compile; the cross-check below then re-derives the
 * same set from `pasted-references.tsx`'s own `case` labels, so a kind added
 * to the union AND to this map but never given a rendered branch is red too.
 */
const PASTED_STATE_SPECIMENS: Readonly<
  Record<PastedReferenceState["kind"], readonly PastedReferenceItem[]>
> = {
  queued: [pastedItem({ kind: "queued" }, { niche: "home cooking" })],
  retrying: [pastedItem({ kind: "retrying", attempt: 2, ceiling: 5 })],
  ready: [pastedItem({ kind: "ready", item: READY_PASTED }, { title: null })],
  // Both spellings of the SAME kind: the attributable number, and the load
  // that cannot attribute one.
  parked_returned: [
    pastedItem({ kind: "parked_returned", creditsReturned: 7 }, { itemId: "pasted-parked-n" }),
    pastedItem({ kind: "parked_returned", creditsReturned: null }, { itemId: "pasted-parked-null" }),
  ],
  parked_deferred: [pastedItem({ kind: "parked_deferred" }, { itemId: "pasted-parked-deferred" })],
  parked_never_charged: [
    pastedItem({ kind: "parked_never_charged" }, { itemId: "pasted-parked-never-charged" }),
  ],
  // Round 2: the state that used to be `parked_returned` by elimination.
  parked_unsettled: [
    pastedItem({ kind: "parked_unsettled" }, { itemId: "pasted-parked-unsettled" }),
  ],
  transcript_unavailable: [pastedItem({ kind: "transcript_unavailable" })],
  unavailable: [
    pastedItem({ kind: "unavailable", reason: "The completed autopsy's display details are unavailable." }),
  ],
};

const PASTED_ITEMS: readonly PastedReferenceItem[] = Object.values(PASTED_STATE_SPECIMENS).flat();

/**
 * ONE ENTRY PER `PasteActionState` STATUS, and — for `saved` — one per CLAIM
 * STATUS, which is the branch C6 found printing "Already queued" about a
 * parked, dead claim. Same reason as the map above: `Record<…>` over the
 * discriminant, never a remembered list.
 */
function savedState(over: Partial<Extract<PasteActionState, { status: "saved" }>> = {}): PasteActionState {
  return {
    status: "saved",
    claimId: "claim_1",
    creditsChargedNow: 7,
    balanceAfter: 24,
    replayed: false,
    claimStatus: "pending",
    ...over,
  };
}

const SAVED_BY_CLAIM_STATUS: Readonly<Record<PasteClaimStatus, readonly PasteActionState[]>> = {
  pending: [
    savedState(),
    savedState({ creditsChargedNow: 0, replayed: true }),
  ],
  failed: [savedState({ claimStatus: "failed", creditsChargedNow: 0, replayed: true })],
  completed: [savedState({ claimStatus: "completed", creditsChargedNow: 0, replayed: true })],
  parked: [savedState({ claimStatus: "parked", creditsChargedNow: 0, replayed: true })],
};

const PASTE_ACTION_SPECIMENS: Readonly<
  Record<PasteActionState["status"], readonly [label: string, state: PasteActionState][]>
> = {
  idle: [["idle", { status: "idle" }]],
  saved: Object.entries(SAVED_BY_CLAIM_STATUS).flatMap(([claimStatus, states]) =>
    states.map((state, i): [string, PasteActionState] => [`saved (${claimStatus} #${i})`, state])
  ),
  refused: [
    ...PASTE_REFUSED_FIELDS.map((field): [string, PasteActionState] => [`refused (${field})`, REFUSED[field]]),
    ["refused (no field)", refusedState("insufficient_credits")],
    ["refused (tier, server-side)", refusedState("pasted_reference_tier")],
    ["refused (viewer seat)", refusedState("profile_role")],
    // Compliance NOTE 2: two rendered codes that were outside every sweep.
    ["refused (settlement undated)", refusedState("refund_source_never_expires")],
    ["refused (unclassified input)", refusedState("pasted_reference_input")],
  ],
};

const readyCard = (item: AnalysedTrendItem) => (
  <TrendsView state={ready([item])} />
);

function pastedSection(items: readonly PastedReferenceItem[]): string {
  return renderToStaticMarkup(<PastedReferences items={items} readyCard={readyCard} />);
}

/**
 * EVERY RENDERABLE STATE OF THE TRENDS SURFACE, so the honesty sweep is over
 * the whole screen rather than the two states somebody remembered.
 *
 * THE TWO SLICE-8C POPULATIONS ARE DERIVED, not typed out (C12): the paste
 * panel's states come from `PASTE_ACTION_SPECIMENS` and the pasted section's
 * from `PASTED_STATE_SPECIMENS`, both `Record<…>`s over their discriminant, so
 * a new status or kind cannot be added without being swept. The feed and
 * outcome rows below are still named one by one; they are `TrendsView` /
 * `SpinOutcome` branches, which is a separate union and a separate fix.
 */
const RENDERED_STATES: readonly [label: string, html: string][] = [
  // Slice 8c — the paste panel, every state (R15).
  ["paste: disabled (tier)", pasteView({ quote: { creditCost: 7, balance: 0, allowed: { ok: false, reason: "tier" } } })],
  ["paste: disabled (paused)", pasteView({ quote: { creditCost: 7, balance: 31, allowed: { ok: false, reason: "paused" } } })],
  ["paste: pending", pasteView({ pending: true })],
  ...Object.values(PASTE_ACTION_SPECIMENS)
    .flat()
    .map(([label, state]): [string, string] => [`paste: ${label}`, pasteView({ state })]),
  // Slice 8c — the pasted section, every item state and the empty state.
  ["pasted: empty", pastedSection([])],
  ...PASTED_ITEMS.map((item): [string, string] => [`pasted: ${item.itemId}`, pastedSection([item])]),
  ["view: empty feed with the panel and the section", renderToStaticMarkup(<TrendsView paste={PASTE_PROPS} pastedReferences={PASTED_ITEMS} state={{ kind: "empty", reason: "No eligible trend items are available for this feed yet." }} />)],
  ["view: unavailable feed with the panel and the section", renderToStaticMarkup(<TrendsView paste={PASTE_PROPS} pastedReferences={[]} state={{ kind: "unavailable", reason: "The scoped reader is not connected." }} />)],
  // The feed's own states, unchanged.
  ["view: unavailable", renderToStaticMarkup(<TrendsView state={{ kind: "unavailable", reason: "The scoped reader is not connected." }} />)],
  ["view: empty", renderToStaticMarkup(<TrendsView state={{ kind: "empty", reason: "No eligible trend items are available for this feed yet." }} />)],
  ["view: stale", renderToStaticMarkup(<TrendsView state={{ kind: "stale", autopsiedItems: [{ ...ANALYSED, stale: true }], discoveryItems: [] }} />)],
  ["view: ready with a spin result", renderToStaticMarkup(<TrendsView state={ready([ANALYSED])} />)],
  ["view: ready with an unmeasured saturation", renderToStaticMarkup(<TrendsView state={ready([{ ...ANALYSED, saturation: { status: "unmeasured", reason: "incomplete_provenance" } }])} />)],
  ["view: ready without evidence", renderToStaticMarkup(<TrendsView state={ready([{ ...ANALYSED, outlier: null, saturation: null }])} />)],
  [
    "view: ready with a near-copy refusal",
    renderToStaticMarkup(
      <TrendsView state={ready([{ ...ANALYSED, spin: { kind: "near_copy_refused", chargedCredits: 2, whatToTry: "Use a different tension from your own experience." } }])} />
    ),
  ],
  ["view: ready with spin unavailable", renderToStaticMarkup(<TrendsView state={ready([{ ...ANALYSED, spin: { kind: "unavailable", reason: "This reference has no completed autopsy." } }])} />)],
  [
    "view: ready with the live spin form",
    renderToStaticMarkup(
      <TrendsView
        state={ready([{ ...ANALYSED, spin: { kind: "action", autopsyId: "autopsy-1", originalReference: ORIGINAL_REFERENCE, action: async () => ({ status: "idle" as const }) } }])}
      />
    ),
  ],
  ["view: ready with discovery candidates", renderToStaticMarkup(<TrendsView state={ready([ANALYSED], [METADATA_ONLY])} />)],
  ["view: untyped empty ready feed", renderToStaticMarkup(<TrendsView state={{ kind: "ready", autopsiedItems: [], discoveryItems: [] } as never} />)],
  ["outcome: near_copy_refused", renderToStaticMarkup(<SpinOutcome state={{ status: "near_copy_refused", chargedCredits: 2 }} originalReference={ORIGINAL_REFERENCE} />)],
  ["outcome: withheld with reasons", renderToStaticMarkup(<SpinOutcome state={WITHHELD_STATE} originalReference={ORIGINAL_REFERENCE} />)],
  ["outcome: withheld with nothing to show", renderToStaticMarkup(<SpinOutcome state={{ status: "withheld", chargedCredits: 2, why: [], sharperAngle: null }} originalReference={ORIGINAL_REFERENCE} />)],
  ["outcome: replayed", renderToStaticMarkup(<SpinOutcome state={{ status: "replayed", balanceAfter: 8 }} originalReference={ORIGINAL_REFERENCE} />)],
  ["outcome: refused", renderToStaticMarkup(<SpinOutcome state={{ status: "refused", code: "unknown" }} originalReference={ORIGINAL_REFERENCE} />)],
  ["outcome: result", renderToStaticMarkup(<SpinOutcome state={RESULT_STATE} originalReference={ORIGINAL_REFERENCE} />)],
];

describe("TrendsView honesty states", () => {
  it("renders a designed empty feed with a reason", () => {
    const html = renderToStaticMarkup(
      <TrendsView state={{ kind: "empty", reason: "No eligible trend items are available for this feed yet." }} />
    );
    // "References" since R-128: the creator-facing label for this surface.
    // The route, the subsystem and the REQ-E ids keep the name "Trends".
    expect(html).toContain("References");
    expect(html).toContain("No eligible trend items are available for this feed yet.");
    expect(html).toContain("trends-state");
  });

  it("names stale state without hiding the retained item", () => {
    const html = renderToStaticMarkup(
      <TrendsView state={{ kind: "stale", autopsiedItems: [{ ...ANALYSED, stale: true }], discoveryItems: [] }} />
    );
    expect(html).toContain("Some items are stale");
    expect(html).toContain("Stale");
    expect(html).toContain(ANALYSED.title);
  });

  it("renders saturation only with complete measured provenance", () => {
    const html = renderToStaticMarkup(<TrendsView state={ready([ANALYSED])} />);
    expect(html).not.toContain("Saturated.");
    expect(html).toContain("Measured saturation");
    expect(html).toContain("18");
    expect(html).toContain("45");
    expect(html).toContain("40.0%");
    expect(html).toContain("2026-08-03T00:00:00Z");
    expect(html).toContain("reference-count-v1");
    expect(html).not.toMatch(/market claim|market saturation/i);
  });

  it("renders explicit unmeasured copy and withholds a partial measured claim", () => {
    const unmeasured = renderToStaticMarkup(
      <TrendsView
        state={{
          kind: "ready",
          autopsiedItems: [{
            ...ANALYSED,
            saturation: { status: "unmeasured", reason: "incomplete_provenance" },
          }],
          discoveryItems: [],
        }}
      />
    );
    expect(unmeasured).toContain("Saturation is unmeasured because its provenance is incomplete.");

    const partial = {
      ...ANALYSED,
      saturation: { status: "unmeasured", reason: "incomplete_provenance" } as const,
    };
    const partialHtml = renderToStaticMarkup(
      <TrendsView state={ready([partial])} />
    );
    expect(partialHtml).toContain("Saturation is unmeasured because its provenance is incomplete.");
    expect(partialHtml).not.toContain("Measured saturation");
  });

  it("keeps the ratio, baseline, and structured window provenance in one evidence block", () => {
    const html = renderToStaticMarkup(<TrendsView state={ready([ANALYSED])} />);
    expect(html).toMatch(/Outlier ratio[\s\S]*3\.20[\s\S]*1,200[\s\S]*12[\s\S]*reference channel[\s\S]*2026-08-03T00:00:00Z/);

    const withoutEvidence = renderToStaticMarkup(
      <TrendsView
        state={ready([{ ...ANALYSED, outlier: null, saturation: null }])}
      />
    );
    expect(withoutEvidence).not.toContain("Outlier ratio");
    expect(withoutEvidence).not.toContain("reference channel");
  });

  it("withholds a partial outlier bundle rather than displaying a ratio alone", () => {
    const partial = {
      ...ANALYSED,
      outlier: { ratio: 3.2, baseline: 1200 } as unknown as AnalysedTrendItem["outlier"],
    };
    const html = renderToStaticMarkup(<TrendsView state={ready([partial])} />);
    expect(html).not.toContain("Outlier ratio");
    expect(html).not.toContain("3.20");
  });

  it("labels metadata-only YouTube items and withholds autopsy and Spin", () => {
    const html = renderToStaticMarkup(<TrendsView state={ready([ANALYSED], [METADATA_ONLY])} />);
    const metadata = html.slice(html.indexOf('data-testid="trend-youtube-meta-1"'));
    expect(metadata).toContain("YouTube");
    expect(metadata).toContain("metadata only");
    expect(metadata).toContain("Transcript unavailable");
    expect(metadata).toContain("Autopsy and Spin stay unavailable");
    expect(metadata).not.toContain("<summary>Autopsy</summary>");
    expect(metadata).not.toContain("Spin result");
  });

  it("uses a native accessible autopsy disclosure and side-by-side comparison", () => {
    const html = renderToStaticMarkup(<TrendsView state={ready([ANALYSED])} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary>Autopsy</summary>");
    expect(html).toContain('aria-label="Original reference"');
    expect(html).toContain('aria-label="Your spin result"');
    expect(html).toContain("trends-side-by-side");
    expect(html).toContain("grid-template-columns");
  });

  it("renders a near-copy refusal without a spin result", () => {
    const html = renderToStaticMarkup(
      <TrendsView
        state={{
          kind: "ready",
          autopsiedItems: [{
            ...ANALYSED,
            spin: {
              kind: "near_copy_refused",
              chargedCredits: 2,
              whatToTry: "Use a different tension from your own experience.",
            },
          }],
          discoveryItems: [],
        }}
      />
    );
    expect(html).toContain("Spin refused");
    expect(html).toContain("The candidate is withheld because it was too close to the reference.");
    expect(html).toContain("One rewrite was attempted.");
    expect(html).toContain("Charge applied:");
    expect(html).toContain("2");
    expect(html).toContain("What to try: Use a different tension from your own experience.");
    expect(html).not.toContain("Spin result");
  });

  it("drives the live Spin refusal with the settled charge, rewrite, remedy, and no candidate", () => {
    const html = renderToStaticMarkup(
      <SpinOutcome
        state={{ status: "near_copy_refused", chargedCredits: 2 }}
        originalReference={ORIGINAL_REFERENCE}
      />
    );
    expect(html).toContain("The candidate is withheld because it was too close to the reference.");
    expect(html).toContain("One rewrite was attempted.");
    expect(html).toContain("Charge applied:");
    expect(html).toContain("What to try:");
    expect(html).not.toContain("Your spin result");
  });

  it("renders the unavailable state without a fake feed", () => {
    const html = renderToStaticMarkup(
      <TrendsView state={{ kind: "unavailable", reason: "The scoped reader is not connected." }} />
    );
    expect(html).toContain("The scoped reader is not connected.");
    expect(html).not.toContain("Reference-led trend feed");
  });

  it("normalizes an untyped empty ready feed into the designed empty state", () => {
    const html = renderToStaticMarkup(
      <TrendsView
        state={{ kind: "ready", autopsiedItems: [], discoveryItems: [] } as never}
      />
    );
    expect(html).toContain("No eligible autopsied trend items are available for this feed yet.");
  });
});

// ------------------------- REQ-I04 / REQ-I05 on the one Spin surface a creator sees

describe("a usable spin result names its weakest point and disclosure guidance, never the rationale", () => {
  const html = renderToStaticMarkup(
    <SpinOutcome state={RESULT_STATE} originalReference={ORIGINAL_REFERENCE} />
  );

  it("renders the weakest point under its own heading (REQ-I04)", () => {
    expect(html).toContain('data-testid="spin-weakest-point"');
    expect(html).toMatch(/<h4[^>]*>Weakest point<\/h4>/);
    expect(html).toContain(RESULT_STATE.weakestPoint);
  });

  it("renders the disclosure guidance under its own heading (REQ-I05)", () => {
    expect(html).toContain('data-testid="spin-disclosure"');
    expect(html).toMatch(/<h4[^>]*>Disclosure guidance<\/h4>/);
    expect(html).toContain(RESULT_STATE.disclosureGuidance);
  });

  it("renders the spin result itself beside the labelled original", () => {
    expect(html).toContain(RESULT_STATE.spinResult);
    expect(html).toContain('aria-label="Original reference"');
  });

  it("the model's performance rationale is not a field the state can carry, so it cannot render", () => {
    // TYPE-LEVEL: `reasoning` is not on the `result` state.
    const smuggled = {
      ...RESULT_STATE,
      reasoning: "SENTINEL-RATIONALE this opens on a cost the viewer already feels",
    };
    // RUNTIME: even smuggled past the type, the component has no slot for it.
    const rendered = renderToStaticMarkup(
      <SpinOutcome state={smuggled as unknown as SpinActionState} originalReference={ORIGINAL_REFERENCE} />
    );
    expect(rendered).not.toContain("SENTINEL-RATIONALE");
    expect(rendered).not.toMatch(/why this performs/i);
  });
});

// ------------------------- a non-similarity refusal says why and offers a way forward

describe("a withheld spin says which rules fired and offers a sharper angle, never the candidate", () => {
  const html = renderToStaticMarkup(
    <SpinOutcome state={WITHHELD_STATE} originalReference={ORIGINAL_REFERENCE} />
  );

  it("names each fired rule with its remedy under 'What fired'", () => {
    expect(html).toContain('data-testid="spin-withheld"');
    expect(html).toContain("What fired");
    expect(html).toContain("forbidden claim");
    expect(html).toContain("invented specific");
    for (const reason of WITHHELD_STATE.why) expect(html).toContain(reason.remedy);
  });

  it("names WHERE each rule fired, redacted to the shape and the section (round 2, compliance CHANGE 4)", () => {
    // THE DEFECT: the refusal withholds the draft, so "invented specific: this
    // specific is in neither your brain nor what you gave this generation" named
    // a token the creator could not see, in an output they could not see. The
    // locator says which KIND of specific and which PART of the draft, and
    // quotes nothing.
    expect(html).toContain('data-testid="spin-withheld-where-invented_specific"');
    expect(html).toContain("Where: a date in a hook; a number in a beat.");
    expect(html).toContain('data-testid="spin-withheld-where-forbidden_claim"');
    expect(html).toContain("Where: in the caption.");
    // NO INDEX, and no excerpt: "a hook", never "the first hook", because the
    // draft is not on the screen for a position to point into.
    expect(html).not.toMatch(/hook <span class="mono">\d/);
  });

  it("says what the next move actually is, and offers no retry the product does not have", () => {
    expect(html).toContain('data-testid="spin-withheld-next"');
    expect(html).toContain("there is nothing here to edit");
    expect(html).toContain("a new run is charged like any other");
    expect(html.toLowerCase()).not.toMatch(/try again|retry|resume|re-run/);
  });

  it("a reason with NO locator renders its remedy and no dangling 'Where:'", () => {
    const bare = renderToStaticMarkup(
      <SpinOutcome
        state={{
          status: "withheld",
          chargedCredits: 2,
          why: [{ rule: "hook_too_long", remedy: "Cut it to the one claim that makes someone stay.", locators: [] }],
          sharperAngle: null,
        }}
        originalReference={ORIGINAL_REFERENCE}
      />
    );
    expect(bare).toContain("hook too long");
    expect(bare).toContain("Cut it to the one claim");
    expect(bare).not.toContain("Where:");
  });

  it("DERIVED: every shape and every section `@respin/modes` can report has a locator this screen can name", () => {
    // THE POPULATION IS THE MODULE'S, NOT A LIST SOMEBODY REMEMBERED
    // (CLAUDE.md, 2026-08-29). `app/**` cannot import `@respin/modes` (R-64), so
    // the vocabulary is a copy — and a copy is only safe while something red
    // notices the original moving. A new `SPECIFIC_SHAPES` id or a new
    // `SECTION_KEYS` member fails here rather than silently dropping the
    // creator back to a locator-less refusal.
    // NON-VACUITY FIRST: both imported populations are non-empty, so the loops
    // below are assertions and not empty-array theatre.
    expect(SPECIFIC_SHAPES.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.length).toBeGreaterThan(0);
    for (const shape of SPECIFIC_SHAPES) {
      const locator = spinWithheldLocator(shape.id, "/hooks/0/text");
      expect(locator, shape.id).not.toBeNull();
      expect(locator, shape.id).toContain("in a hook");
      // ...and the shape contributed a NOUN, not just the section.
      expect(locator, shape.id).not.toBe("in a hook");
    }
    for (const key of SECTION_KEYS) {
      const locator = spinWithheldLocator("month-date", `/${key}/0/text`);
      expect(locator, key).not.toBeNull();
      expect(locator, key).toMatch(/^a date in /);
    }
    // NON-VACUITY, both halves: an unknown shape falls back to the section, an
    // unknown section falls back to the noun, and neither known makes it `null`.
    expect(spinWithheldLocator("a_new_shape", "/hooks/0/text")).toBe("in a hook");
    expect(spinWithheldLocator("month-date", "/aNewSection/0/text")).toBe("a date");
    expect(spinWithheldLocator("a_new_shape", "/aNewSection/0/text")).toBeNull();

    // ...and EVERY sentence this vocabulary can produce is swept by the canon,
    // not only the three a specimen happens to render. The rendered-state sweep
    // below covers `WITHHELD_STATE`'s locators; this covers the whole cross
    // product, which is where a section label like "why this performs" lives.
    for (const shape of [...SPECIFIC_SHAPES.map((s) => s.id), "a_new_shape"]) {
      for (const key of SECTION_KEYS) {
        const locator = (spinWithheldLocator(shape, `/${key}/0/text`) ?? "").toLowerCase();
        for (const [label, re] of [...FORBIDDEN_CLAIMS, ...PERFORMANCE_CLAIMS]) {
          expect(locator, `"${label}" in the locator for ${shape} at /${key}`).not.toMatch(re);
        }
      }
    }
  });

  it("renders the sharper angle under its own heading", () => {
    expect(html).toContain("A sharper angle");
    expect(html).toContain('data-testid="spin-withheld-sharper-angle"');
    expect(html).toContain(WITHHELD_STATE.sharperAngle);
  });

  it("still states the charge and shows no candidate", () => {
    expect(html).toContain("Charge applied:");
    expect(html).not.toContain("Your spin result");
    expect(html).not.toContain('data-testid="spin-result"');
  });

  it("does not apologise for the checks working: no 'sorry', no 'unfortunately'", () => {
    expect(html).not.toMatch(/\bsorry\b|\bunfortunately\b|\bapolog/i);
  });

  it("a withheld state with nothing to report still renders honestly, without a blank list", () => {
    const empty = renderToStaticMarkup(
      <SpinOutcome state={{ status: "withheld", chargedCredits: 2, why: [], sharperAngle: null }} originalReference={ORIGINAL_REFERENCE} />
    );
    expect(empty).toContain("Spin withheld");
    expect(empty).not.toContain("What fired");
    expect(empty).not.toContain("A sharper angle");
    expect(empty).toContain("nothing this screen can show");
  });
});

// ------------------------- R23: the canon, over EVERY state (compliance + learning gates, 2026-09-03)

describe("no state of the Trends surface makes a forbidden or performance claim (R23, forbidden-claims.ts)", () => {
  // THE CANON, NOT A LOCAL REGEX. Until 2026-09-03 this file carried its own
  // four-word pattern (`will perform|outperform|more views|viral`) and never
  // imported `tests/support/forbidden-claims.ts` — the exact per-screen
  // divergence that file's header records as the reason it exists. Every
  // other creator-facing screen sweeps with the canon; this one now does too,
  // over every rendered state named in `RENDERED_STATES`.
  // THE LISTS ARE NAMED HERE; THE PREDICATE IS `claimHits` (P1-R4, applied
  // 2026-09-21). A private `CANON` array plus a bare `.test()` is a second
  // place where "does this string make this claim" gets decided, and it skips
  // the `lastIndex` reset the shared helper exists to guarantee.

  it("the sweep covers every state, and the idle outcome renders nothing", () => {
    // THE COUNT IS NOT THE GUARD. It used to be the only one
    // (`>= 41` over a hand-written array), and a count cannot tell "every
    // state" from "every state somebody listed" — the two derived populations
    // below are what makes an unswept state red. This line stays only as a
    // floor against the arrays collapsing to empty, which would make every
    // `it.each` below vacuously green.
    expect(RENDERED_STATES.length).toBeGreaterThanOrEqual(41);
    expect(
      renderToStaticMarkup(<SpinOutcome state={{ status: "idle" }} originalReference={ORIGINAL_REFERENCE} />)
    ).toBe("");
  });

  /**
   * The kinds `pasted-references.tsx` ACTUALLY RENDERS, read out of its own
   * `switch`, so the sweep's population is derived from the screen rather than
   * agreed with it. Same shape as the directory scan at the bottom of this
   * file: a regex LITERAL (never assembled from a string, CLAUDE.md 2026-08-21)
   * with a planted specimen proving it is not matching nothing.
   */
  const CASE_LABEL_RE = /case "([a-z_]+)":/g;
  const caseLabels = (relativePath: string): string[] => {
    const src = readFileSync(resolve(__dirname, "..", relativePath), "utf8");
    return [...src.matchAll(CASE_LABEL_RE)].map((m) => m[1]);
  };
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

  it("DERIVED: the swept pasted-state kinds are exactly the ones the section renders", () => {
    const rendered = caseLabels("app/(product)/trends/pasted-references.tsx");
    // NON-VACUITY: the parse found the branches, not zero of them.
    expect(rendered.length).toBeGreaterThanOrEqual(8);
    expect(sorted(rendered)).toEqual(sorted(Object.keys(PASTED_STATE_SPECIMENS)));
    // ...and every specimen really rendered its own branch, so a kind present
    // in the map but rendering nothing cannot pass the set comparison alone.
    for (const [kind, items] of Object.entries(PASTED_STATE_SPECIMENS)) {
      expect(items.length, kind).toBeGreaterThan(0);
      for (const item of items) {
        expect(pastedSection([item]), kind).toContain(`data-testid="pasted-${item.itemId}"`);
      }
    }
  });

  it("DERIVED: the swept saved-paste claim statuses are exactly the ones the panel branches on", () => {
    const rendered = caseLabels("app/(product)/trends/paste-panel.tsx");
    expect(rendered.length).toBeGreaterThanOrEqual(4);
    expect(sorted(rendered)).toEqual(sorted(Object.keys(SAVED_BY_CLAIM_STATUS)));
  });

  it("NON-VACUITY: the case-label pattern catches a planted branch", () => {
    const planted = 'case "queued":\n  case "a_seventh_kind":\n';
    expect([...planted.matchAll(CASE_LABEL_RE)].map((m) => m[1])).toEqual([
      "queued",
      "a_seventh_kind",
    ]);
    // ...and the comparison the two tests above make would REJECT it.
    expect(sorted(["queued", "a_seventh_kind"])).not.toEqual(sorted(["queued"]));
  });

  it("DERIVED: every paste action status has at least one swept specimen", () => {
    for (const [status, entries] of Object.entries(PASTE_ACTION_SPECIMENS)) {
      expect(entries.length, status).toBeGreaterThan(0);
    }
    // The labels are unique, so no specimen is silently shadowing another in
    // the `it.each` table below.
    const labels = Object.values(PASTE_ACTION_SPECIMENS).flat().map(([label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(RENDERED_STATES)("%s is clean against every canon pattern", (_label, html) => {
    expect(claimHits(html, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS), "the trends surface").toEqual([]);
  });

  // NON-VACUITY, per pattern: each canon entry catches its own planted
  // specimen, so a typo in one pattern cannot hide behind a neighbour that
  // happened to match. Copied from the discipline `forbidden-claims.ts`
  // records for `/onboarding` (2026-08-27).
  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "NON-VACUITY: the canon pattern for %s catches its planted specimen",
    (label, specimen) => {
      expect(claimHits(specimen, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );

  it("NON-VACUITY: a planted forecast in a rendered state is caught by the same loop", () => {
    const planted = renderToStaticMarkup(
      <SpinOutcome
        state={{ ...RESULT_STATE, weakestPoint: "This one will perform better and get more views." }}
        originalReference={ORIGINAL_REFERENCE}
      />
    ).toLowerCase();
    const hits = claimHits(planted, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS);
    expect(hits).toEqual(expect.arrayContaining(["will perform", "more views", "views"]));
  });

  // R15: no apology for a refusal, on ANY state — the gate working is not
  // something to be sorry about. Widened from the single withheld case above.
  it.each(RENDERED_STATES)("%s does not apologise for a refusal", (_label, html) => {
    expect(html).not.toMatch(/\bsorry\b|\bunfortunately\b|\bapolog/i);
  });
});

// ------------------------- slice 8c, R13/R15: the paste panel

describe("the paste panel (R13, R15)", () => {
  const html = pasteView();

  it("states the price and the balance from the quote, and every field's limit from its prop — nothing typed", () => {
    expect(html).toMatch(/Costs <span class="mono">7<\/span> credits — the autopsy runs in the background/);
    expect(html).toMatch(/Balance: <span class="mono">31<\/span>\./);
    expect(html).toContain(`<span class="mono">0</span> of <span class="mono">${TITLE_LIMIT}</span> characters`);
    expect(html).toContain(`<span class="mono">0</span> of <span class="mono">${TRANSCRIPT_LIMIT.toLocaleString("en-US")}</span> characters`);
    // A DIFFERENT limit renders a different number: the prop is what renders.
    expect(pasteView({ titleLimit: 33, transcriptLimit: 4444 })).toContain(`<span class="mono">33</span> characters`);
    expect(pasteView({ titleLimit: 33, transcriptLimit: 4444 })).toContain(`<span class="mono">4,444</span> characters`);
  });

  it("counts CODE POINTS, not UTF-16 units", () => {
    expect(codePoints("")).toBe(0);
    expect(codePoints("abc")).toBe(3);
    // An emoji is two UTF-16 units and one code point; the server counts one.
    expect("a😀b".length).toBe(4);
    expect(codePoints("a😀b")).toBe(3);
  });

  it("the URL control is type=url, http(s)-only, required; the transcript is required; the niche lists 'None' first", () => {
    // Attribute by attribute: React's static renderer orders them its own way.
    const url = html.match(/<input id="paste-url"[^>]*>/)?.[0] ?? "";
    expect(url).toContain('type="url"');
    expect(url).toMatch(/inputmode="url"/i);
    expect(url).toContain('required=""');
    expect(url).toContain('pattern="https?://.+"');
    expect(url).toContain('name="sourceUrl"');
    const transcript = html.match(/<textarea id="paste-transcript"[^>]*>/)?.[0] ?? "";
    expect(transcript).toContain('name="transcript"');
    expect(transcript).toContain('required=""');
    expect(html).toMatch(/<select id="paste-niche" name="niche"[^>]*><option value="" selected="">None<\/option><option value="home cooking">home cooking<\/option><\/select>/);
    // No `maxlength`: it truncates a paste silently in UTF-16 units (the
    // onboarding precedent); the limit is stated and the server refuses by name.
    expect(html).not.toContain("maxlength");
  });

  it("every control has an associated <label> and its limit line is linked by aria-describedby", () => {
    for (const id of Object.values(PASTE_FIELD_IDS)) {
      expect(html, id).toContain(`<label for="${id}">`);
      expect(html, id).toMatch(new RegExp(`id="${id}"[^>]*aria-describedby="${id}-limit"`));
      expect(html, id).toContain(`id="${id}-limit"`);
    }
  });

  it("idle: the submit is the pending-guarded client button, not disabled, and the live region is empty", () => {
    expect(html).toMatch(/<button type="submit" class="btn btn-primary" aria-disabled="false" aria-busy="false">Paste for autopsy<\/button>/);
    expect(html).toMatch(/<div role="status" aria-live="polite" data-testid="paste-status"[^>]*><\/div>/);
  });

  it("pending: the form is aria-busy, the button is in-flight and the live region says what is moving", () => {
    const pending = pasteView({ pending: true });
    expect(pending).toMatch(/<form aria-busy="true"/);
    expect(html).toMatch(/<form aria-busy="false"/);
    expect(pending).toContain("Queuing the autopsy…");
    // Not "Saving": a paste spends credits, and the pending state is the one
    // moment the product can say so (DESIGN.md button states).
    expect(pending).not.toMatch(/saving/i);
  });

  it("saved: names the charge and the balance; replayed: says nothing was charged", () => {
    const charged = pasteView({ state: savedState({ claimId: "c" }) });
    expect(charged).toMatch(/Queued for autopsy\. <span class="mono">7<\/span> credits charged\. Balance: <span class="mono">24<\/span>\./);
    expect(charged).toContain('data-testid="paste-saved"');
    const replayed = pasteView({ state: savedState({ claimId: "c", creditsChargedNow: 0, replayed: true }) });
    expect(replayed).toContain("Already queued — nothing charged.");
    expect(replayed).toContain('data-testid="paste-saved-replayed"');
    expect(replayed).not.toContain("credits charged");
    // The opaque claim id is state, never markup.
    expect(charged).not.toContain('"c"');
  });

  it("'Already queued' is said ONLY about a claim that is queued (C6)", () => {
    // THE DEFECT: paste → park → settle → re-paste the same URL and transcript
    // returns `{replayed: true, charged: 0, claimStatus: "parked"}`, and the
    // panel printed "Already queued — nothing charged". `parked` is terminal
    // for `startAttempt` and excluded from the system queue, so nothing was
    // queued and nothing ever would be — the one press a waiting creator
    // repeats, answered with a promise of background work.
    const parked = pasteView({ state: savedState({ claimStatus: "parked", creditsChargedNow: 0, replayed: true }) });
    expect(parked).not.toContain("Already queued");
    expect(parked).toContain('data-testid="paste-saved-parked"');
    expect(parked).toContain("an earlier attempt that stopped, so nothing new was queued");
    // A WAY FORWARD THAT EXISTS — the intake keys the item on the transcript
    // digest — and no invented retry.
    expect(parked).toContain("a different transcript starts a new one");
    expect(parked.toLowerCase()).not.toMatch(/try again|retry|resume/);

    const completed = pasteView({ state: savedState({ claimStatus: "completed", creditsChargedNow: 0, replayed: true }) });
    expect(completed).not.toContain("Already queued");
    expect(completed).toContain('data-testid="paste-saved-completed"');
    expect(completed).toContain("analysed already");

    // ...and the two statuses that ARE queued still say so.
    for (const claimStatus of ["pending", "failed"] as const) {
      const queued = pasteView({ state: savedState({ claimStatus, creditsChargedNow: 0, replayed: true }) });
      expect(queued, claimStatus).toContain("Already queued — nothing charged.");
    }
  });

  it.each(PASTE_REFUSED_FIELDS)("refused (%s): the copy renders in the live region, and THAT field is described by it and marked invalid", (field) => {
    const refused = pasteView({ state: REFUSED[field] });
    const id = PASTE_FIELD_IDS[field];
    expect(refused).toContain(`id="${PASTE_REFUSAL_ID}"`);
    expect(refused).toMatch(new RegExp(`id="${id}"[^>]*aria-describedby="${id}-limit ${PASTE_REFUSAL_ID}"`));
    expect(refused).toMatch(new RegExp(`id="${id}"[^>]*aria-invalid="true"`));
    // ...and ONLY that field.
    for (const other of PASTE_REFUSED_FIELDS) {
      if (other === field) continue;
      expect(refused).not.toMatch(new RegExp(`id="${PASTE_FIELD_IDS[other]}"[^>]*aria-invalid`));
    }
    // The refusal is the map's copy: it says the money did not move and names no number.
    expect(refused).toMatch(/nothing was charged/i);
  });

  it("a refusal WITHOUT a field marks no control invalid and still renders the copy", () => {
    const refused = pasteView({ state: refusedState("insufficient_credits") });
    expect(refused).not.toContain("aria-invalid");
    expect(refused).toContain("Not enough credits for this");
    expect(refused).toContain('data-field=""');
  });

  it("the focus move to the refused field is actually wired (the hook owner, not the pure view)", () => {
    // `useEffect` runs in no static render, so — as with `FocusOnMount` — the
    // wiring is asserted at the source: the effect reads the refused field's
    // id from `PASTE_FIELD_IDS` and calls `.focus()` on it.
    const src = readFileSync(resolve(__dirname, "../app/(product)/trends/paste-panel.tsx"), "utf8");
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?state\.status !== "refused"[\s\S]*?PASTE_FIELD_IDS\[state\.field\][\s\S]*?\.focus\(\)/);
    expect(src).toContain('import { useActionState, useEffect, useState');
  });

  it.each(["tier", "paused"] as const)("disabled (%s): every field and the submit are disabled with a linked reason, and nothing is sold", (reason) => {
    const disabled = pasteView({ quote: { creditCost: 7, balance: 0, allowed: { ok: false, reason } } });
    expect(disabled).toContain(`data-testid="paste-disabled-${reason}"`);
    expect(disabled).toContain(PASTE_DISABLED_COPY[reason].title);
    for (const id of Object.values(PASTE_FIELD_IDS)) {
      expect(disabled, id).toMatch(new RegExp(`id="${id}"[^>]*disabled=""[^>]*aria-describedby="${id}-limit paste-disabled-reason"`));
    }
    expect(disabled).toMatch(/<button type="submit" class="btn btn-primary" disabled="" aria-disabled="true" aria-describedby="paste-disabled-reason">/);
    // No price line while nothing can be pressed; the reason stands in.
    expect(disabled).not.toContain('data-testid="paste-cost"');
    // THE SELL SCAN, the same pattern `tests/billing-ui.test.tsx` runs over
    // the error map, with a planted specimen so it is not vacuous.
    const SELLS_A_PLAN = /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b/;
    expect(disabled.toLowerCase()).not.toMatch(SELLS_A_PLAN);
    expect(disabled).not.toMatch(/<a [^>]*href="[^"]*billing/);
    expect(SELLS_A_PLAN.test("upgrade to a plan that includes this")).toBe(true);
  });

  it("the tier copy NAMES the plans that include pasting (R13), and the viewer refusal is the profile_role copy", () => {
    expect(PASTE_DISABLED_COPY.tier.detail).toContain("Creator, Pro and Studio plans");
    const viewer = pasteView({ state: refusedState("profile_role") });
    expect(viewer).toContain("Viewer access cannot change this creator");
    expect(viewer).toContain("pasting a reference for autopsy");
  });
});

// ------------------------- slice 8c, R14/R15: the pasted section

describe("the pasted-references section (R14)", () => {
  it("empty: says nothing is pasted and what pasting does", () => {
    const empty = pastedSection([]);
    expect(empty).toContain("Your pasted references");
    expect(empty).toContain('data-testid="pasted-references-empty"');
    expect(empty).toContain("Nothing pasted yet.");
    expect(empty).toMatch(/Pasting a public video link and its transcript queues a background autopsy/);
  });

  it("renders items in the order given (the reader's newest-first), one designed state each", () => {
    const html = pastedSection(PASTED_ITEMS);
    const positions = PASTED_ITEMS.map((item) => html.indexOf(`data-testid="pasted-${item.itemId}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Queued for autopsy");
    expect(html).toMatch(/Retrying — attempt <span class="mono">2<\/span> of <span class="mono">5<\/span>/);
    expect(html).toContain('data-testid="pasted-state-ready"');
    expect(html).toMatch(/Could not be completed — <span class="mono">7<\/span> credits returned/);
    expect(html).toContain("Could not be completed — credits returned");
    expect(html).toContain("Transcript unavailable");
    expect(html).toContain("Autopsy details unavailable");
  });

  it("every original is a link to the other creator's work with rel=noopener noreferrer, labelled as theirs", () => {
    const html = pastedSection(PASTED_ITEMS);
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBe(PASTED_ITEMS.length);
    for (const link of links) {
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain('target="_blank"');
      expect(link).toMatch(/href="https:\/\/example\.com\/watch\?v=abc"/);
    }
    expect(html).toContain("The original, by its creator, on example.com");
    expect(html).toContain("another creator&#x27;s work");
  });

  it("a stored value that is not an http(s) address renders as text, never as a link", () => {
    expect(referenceHost("https://example.com/x")).toBe("example.com");
    expect(referenceHost("http://example.org")).toBe("example.org");
    expect(referenceHost("javascript:alert(1)")).toBeNull();
    expect(referenceHost("not a url")).toBeNull();
    const html = pastedSection([pastedItem({ kind: "queued" }, { sourceUrl: "javascript:alert(1)", title: null })]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Untitled reference");
  });

  it("a null title falls back to the host; a niche renders only when present; the date is a <time>", () => {
    const html = pastedSection(PASTED_ITEMS);
    expect(html).toContain('<h3 id="pasted-title-pasted-ready">example.com</h3>');
    expect(html).toContain('Niche: <span class="mono">home cooking</span>');
    expect((html.match(/Niche:/g) ?? []).length).toBe(1);
    const time = html.match(/<time [^>]*>/)?.[0] ?? "";
    expect(time).toContain('class="mono"');
    expect(time).toMatch(/datetime="2026-09-03T10:00:00\.000Z"/i);
  });

  // THE THREE PARKED REALITIES, ONE TEST EACH (code review round 1, C2/C2b).
  // They were two rendered branches carrying three facts: a `null` refund
  // number meant "settled on an earlier load" OR "settled among several this
  // load" OR "never charged at all", and all three printed one sentence
  // asserting a return. The middle one was true; the last was not.
  it("parked + returned: asserts a return, with the number only when the settlement attributed one", () => {
    const withNumber = pastedSection([pastedItem({ kind: "parked_returned", creditsReturned: 7 })]);
    expect(withNumber).toContain('data-refund="returned"');
    expect(withNumber).toMatch(/Could not be completed — <span class="mono">7<\/span> credits returned/);
    expect(withNumber).toContain("has been returned to your balance");
    expect(withNumber).not.toContain("when the pause ends");

    const withoutNumber = pastedSection([pastedItem({ kind: "parked_returned", creditsReturned: null })]);
    expect(withoutNumber).toContain("Could not be completed — credits returned");
    expect(withoutNumber).not.toMatch(/<span class="mono">\d+<\/span> credits returned/);
  });

  it("parked + deferred: promises a future settlement and asserts NO past return and no amount", () => {
    const deferred = pastedSection([pastedItem({ kind: "parked_deferred" })]);
    expect(deferred).toContain('data-refund="deferred"');
    expect(deferred).toContain("settled when the pause ends");
    expect(deferred).toContain("nothing has been returned yet");
    // Past tense is the whole defect: a deferred settlement returned nothing.
    expect(deferred).not.toContain("has been returned to your balance");
    expect(deferred).not.toMatch(/<span class="mono">\d+<\/span> credits returned/);
  });

  it("parked + never charged: says nothing was charged, and does NOT claim a return", () => {
    const never = pastedSection([pastedItem({ kind: "parked_never_charged" })]);
    expect(never).toContain('data-refund="never-charged"');
    expect(never).toContain("Could not be completed — nothing was charged");
    expect(never).toContain("nothing to return");
    expect(never).not.toContain("credits returned");
    expect(never).not.toContain("has been returned to your balance");
    expect(never).not.toContain("when the pause ends");
  });

  it("parked + NOT SETTLED YET: claims nothing about the money, in either direction (round 2)", () => {
    // THE STATE THAT USED TO BE A FALSE SENTENCE. A claim parked between the
    // page's settlement and its pasted read is in none of the settlement's
    // lists, and `parked_returned` was the fallthrough — so the screen said
    // "credits returned", past tense, over a ledger with the debit and no
    // refund. This branch must assert NEITHER a return NOR that nothing was
    // charged: the settlement has not looked at this claim.
    const unsettled = pastedSection([pastedItem({ kind: "parked_unsettled" })]);
    expect(unsettled).toContain('data-refund="unsettled"');
    expect(unsettled).toContain("Could not be completed — not settled yet");
    expect(unsettled).toContain("has not been worked out yet");
    expect(unsettled).toContain("reload this page");
    // The four money sentences the other three parked states own, none of them
    // borrowed here.
    expect(unsettled).not.toContain("credits returned");
    expect(unsettled).not.toContain("has been returned to your balance");
    expect(unsettled).not.toContain("nothing was charged");
    expect(unsettled).not.toContain("your balance is untouched");
    expect(unsettled).not.toContain("when the pause ends");
    expect(unsettled).not.toMatch(/<span class="mono">\d+<\/span> credits/);
    // ...and it still says why it stopped and what a re-paste does.
    expect(unsettled).toContain("within its attempts, so it stopped");
    expect(unsettled).toContain("a different transcript starts a new one");
  });

  it("the four parked states are distinguishable from each other in the rendered markup", () => {
    // Without this, a copy edit could collapse two of them back into one
    // sentence and every assertion above would still pass on its own branch.
    const rendered = (["parked_returned", "parked_deferred", "parked_never_charged", "parked_unsettled"] as const).map(
      (kind) => pastedSection(PASTED_STATE_SPECIMENS[kind].slice(0, 1))
    );
    expect(new Set(rendered).size).toBe(4);
  });

  it("ready: renders the feed's analysed card with the explicit no-baseline line, the autopsy and the live spin form", () => {
    const html = pastedSection([pastedItem({ kind: "ready", item: READY_PASTED })]);
    expect(html).toContain('data-testid="baseline-unavailable-pasted-ready"');
    expect(html).toContain("No channel baseline — pasted reference");
    expect(html).not.toContain("Outlier ratio");
    expect(html).toContain("<summary>Autopsy</summary>");
    expect(html).toContain("Spin this reference");
    expect(html).toContain('value="pasted-autopsy-1"');
  });

  it("the no-baseline line is an EXPLICIT state: a feed item without the flag still renders nothing there", () => {
    const html = renderToStaticMarkup(<TrendsView state={ready([{ ...ANALYSED, outlier: null }])} />);
    expect(html).not.toContain("No channel baseline");
    expect(html).not.toContain("baseline-unavailable");
  });

  it("the composition renders the panel and the section ABOVE the feed, in every feed state", () => {
    for (const state of [
      { kind: "empty" as const, reason: "Nothing here." },
      { kind: "unavailable" as const, reason: "Not connected." },
      ready([ANALYSED]),
    ]) {
      const html = renderToStaticMarkup(<TrendsView paste={PASTE_PROPS} pastedReferences={[]} state={state} />);
      const panel = html.indexOf('data-testid="paste-panel"');
      const section = html.indexOf('data-testid="pasted-references"');
      const feed = html.indexOf("<h1");
      expect(panel).toBeGreaterThanOrEqual(0);
      expect(section).toBeGreaterThan(panel);
      expect(feed).toBeGreaterThan(section);
    }
    // Without the props (no selected profile) neither renders.
    const bare = renderToStaticMarkup(<TrendsView state={{ kind: "empty", reason: "Select a profile." }} />);
    expect(bare).not.toContain("paste-panel");
    expect(bare).not.toContain("pasted-references");
  });
});

// ------------------------- slice 8c, R10/R13/R15: source scans over the whole trends directory

describe("no screen file under app/(product)/trends types a price, a limit, a colour or an animation", () => {
  const ROOT = resolve(__dirname, "..");
  const DIR = join(ROOT, "app", "(product)", "trends");
  const files = readdirSync(DIR)
    .filter((name) => /\.tsx?$/.test(name) && statSync(join(DIR, name)).isFile())
    .map((name) => join(DIR, name));
  const codeOnly = (src: string) =>
    src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // EVERY PATTERN IS A REGEX LITERAL (CLAUDE.md, 2026-08-21), and each has a
  // planted specimen below so a broken pattern reads red rather than clean.
  const SHAPES: readonly [label: string, pattern: RegExp, specimen: string][] = [
    ["a typed price", /\b\d+\s*credits?\b/i, "Costs 4 credits"],
    ["a typed limit", /\b(120|20,?000)\b/, "up to 20,000 characters"],
    ["a raw colour", /#[0-9a-f]{3,8}\b|\brgba?\(/i, "color: #4066E0"],
    ["an animation", /\banimation\b|\btransition\b|@keyframes/i, "animation: pulse 1.6s"],
  ];

  it("reads the whole directory, including the three slice-8c files", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const name of ["paste-panel.tsx", "paste-state.ts", "pasted-references.tsx", "page.tsx", "trends-view.tsx", "actions.ts"]) {
      expect(files.some((f) => f.endsWith(name)), name).toBe(true);
    }
  });

  it.each(SHAPES)("no file carries %s", (_label, pattern) => {
    for (const file of files) {
      expect(codeOnly(readFileSync(file, "utf8")), file).not.toMatch(pattern);
    }
  });

  it.each(SHAPES)("NON-VACUITY: the pattern for %s catches its planted specimen", (_label, pattern, specimen) => {
    expect(pattern.test(specimen)).toBe(true);
  });

  it("every style value in the slice-8c files is a token or a plain size, never a colour (DESIGN.md)", () => {
    for (const name of ["paste-panel.tsx", "pasted-references.tsx"]) {
      const src = codeOnly(readFileSync(join(DIR, name), "utf8"));
      const styles = src.match(/style=\{\{[^}]*\}\}/g) ?? [];
      for (const style of styles) {
        expect(style, name).not.toMatch(/color|background|border/i);
      }
    }
  });
});
