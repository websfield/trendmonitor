// Audience landing variants (/for/women, /for/business, /for/coaches):
// the main landing's shape with audience-specific hero copy, hero photo,
// and illustrative demo. Copy lives in ../../audiences.ts; every shared
// section (pricing included) renders from ../../landing-sections.tsx so
// the landing-pricing test keeps one authority to pin.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buttonClass } from "../../../ui/button";
import { getAudience } from "../../audiences";
import {
  ClosingBand,
  LandingFooter,
  LandingHeader,
  MarqueeTags,
  PricingSection,
  RefusesBand,
  StepsBand,
} from "../../landing-sections";
import { SampleSpinOrMockup } from "../../sample-spin/sample-spin-section";
import { landingPricing } from "../../pricing-load";

// RENDERED PER REQUEST (audit P6-A3, R-175): the shared pricing section reads
// the ACTIVE config, so this route can no longer be prerendered from the seed.
// An unknown slug is still a 404, by `notFound()` below rather than by a
// static params list.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ audience: string }>;
}): Promise<Metadata> {
  const a = getAudience((await params).audience);
  if (!a) return {};
  return { title: a.metaTitle, description: a.metaDescription };
}

export default async function AudienceLandingPage({
  params,
}: {
  params: Promise<{ audience: string }>;
}) {
  const a = getAudience((await params).audience);
  if (!a) notFound();
  const pricing = await landingPricing();

  return (
    <div className="landing">
      <div className="landing-stripe" />
      <LandingHeader />

      <section className={`hero ${a.heroClass}`}>
        <div className="hero-inner">
          <h1>
            {a.h1Lead} <span className="hero-turn">{a.h1Turn}</span>
          </h1>
          <p className="hero-sub">{a.sub}</p>
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

      <SampleSpinOrMockup demo={a.demo} />

      <MarqueeTags />
      <StepsBand terms={pricing.terms} />
      <RefusesBand />
      <PricingSection pricing={pricing} />
      <ClosingBand />
      <LandingFooter />
    </div>
  );
}
