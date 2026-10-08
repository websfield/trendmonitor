// The Signal landing's BODY (design/Respin Landing mockup); `./page.tsx` reads
// the active config and renders it. Marketing surface only:
// the BILLING page keeps its price-honesty rule and prints nothing it cannot
// verify. The pricing/marquee copy lives in ./pricing-copy.ts, where every
// number is pinned to its authority by `tests/landing-pricing.test.ts` — the
// mockup's own figures contradicted the shipped config (billing gate BLOCK,
// 2026-08-29). The proof slot (REQ-H02) is `SampleSpinOrMockup`: the real,
// metered Sample Spin when RESPIN_PUBLIC_SAMPLE_SPIN=preview, otherwise the
// mockup's illustrative before/after, whose foot says it is not product output.
// Sections shared with the /for/<audience> variants live in
// ./landing-sections.tsx; audience copy lives in ./audiences.ts.
import { buttonClass } from "../ui/button";
import {
  ClosingBand,
  LandingFooter,
  LandingHeader,
  MarqueeTags,
  PricingSection,
  RefusesBand,
  StepsBand,
} from "./landing-sections";
import type { DemoCopy } from "./audiences";
import { SampleSpinOrMockup } from "./sample-spin/sample-spin-section";
import type { LandingPricing } from "./pricing-load";

const MAIN_DEMO: DemoCopy = {
  slop: [
    "“Hey guys! Today we’re going to talk about a game-changing workout secret that will take your gains to the next level…”",
    "“Make sure you like and follow for more amazing fitness content! Let’s dive in…”",
  ],
  critique: "No timestamps. No shots. Nothing in it could only have come from you.",
  hook: {
    tc: "00:00",
    text: "Every program you have ever bought is wrong about lifting to failure.",
  },
  turn: {
    tc: "00:14",
    text: "Failure was never the stimulus. Volume you can recover from is.",
  },
  shot: "Your clip [check]: the heavy triple, phone angle. Receipt on screen at 00:22.",
};

/**
 * THE LANDING'S MARKUP, a pure function of the numbers read for this request
 * (audit P6-A3, R-175). It lives apart from `./page.tsx` because a Next page
 * module may export only its page and route config, and the visual harness and
 * the claims scan render this body with a fixed `pricing` rather than a
 * database read.
 */
export function LandingView({ pricing }: { pricing: LandingPricing }) {
  return (
    <div className="landing">
      <div className="landing-stripe" />
      <LandingHeader />

      <section className="hero">
        <div className="hero-inner">
          <h1>
            Leave with a script you can film,{" "}
            <span className="hero-turn">not a chat transcript.</span>
          </h1>
          {/* SCOPED (audit P6-A2, register item 33): the shared library is
              curator-approved, a private framework is the creator's own, and
              any structure a draft invents is labelled unreviewed
              (`CUSTOM_STRUCTURE_NOTE`). "Built on reviewed mechanisms" alone
              was a universal none of the last two keeps. */}
          <p className="hero-sub">
            Respin turns your idea into a timed script in your voice, with the
            shots it suggests described for you to film. It
            builds on reviewed library mechanisms or your own frameworks, and
            labels any other structure as unreviewed.
          </p>
          <div className="hero-ctas">
            <a href="/sign-up" className={buttonClass("primary")}>
              Start free, no card
            </a>
            <a href="#pricing" className={buttonClass("secondary")}>
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* The demo panel overlaps the hero photo's bottom edge (negative
          margin), so the product artifact reads as sitting on the page. */}
      <SampleSpinOrMockup demo={MAIN_DEMO} />

      <MarqueeTags />
      <StepsBand terms={pricing.terms} />
      <RefusesBand />
      <PricingSection pricing={pricing} />
      <ClosingBand />
      <LandingFooter />
    </div>
  );
}
