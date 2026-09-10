// The Signal landing (design/Respin Landing mockup). Marketing surface only:
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

const MAIN_DEMO: DemoCopy = {
  slop: [
    "“Hey guys! Today we’re going to talk about a game-changing training secret that will take your gains to the next level…”",
    "“Make sure you like and follow for more amazing fitness content! Let’s dive in…”",
  ],
  critique: "No timestamps. No shots. Sounds like everyone. Audiences punish it.",
  hook: {
    tc: "00:00",
    text: "Every program you have ever bought is wrong about training to failure.",
  },
  turn: {
    tc: "00:14",
    text: "Failure was never the stimulus. Volume you can recover from is.",
  },
  shot: "Your March clip 0451: the 315 for three set, phone angle. Receipt on screen at 00:22.",
};

export default function LandingPage() {
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
          <p className="hero-sub">
            Respin turns your idea into a shot-mapped script in your voice,
            built on mechanisms proven by posted results.
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
      <StepsBand />
      <RefusesBand />
      <PricingSection />
      <ClosingBand />
      <LandingFooter />
    </div>
  );
}
