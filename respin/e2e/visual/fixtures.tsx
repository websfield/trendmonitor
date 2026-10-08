import { useState, type ImgHTMLAttributes } from "react";
import { renderToString } from "react-dom/server";
import { ProductShell } from "../../app/(product)/product-shell";
import { AuthForm } from "../../app/(auth)/auth-form";
import { LandingView } from "../../app/(marketing)/landing-view";
import { pricingFor } from "../../app/(marketing)/pricing-copy";
import { AUDIENCES } from "../../app/(marketing)/audiences";
import { LandingHeader, DemoPanel, MarqueeTags, StepsBand, RefusesBand, PricingSection, ClosingBand, LandingFooter } from "../../app/(marketing)/landing-sections";
import { ThemeSwitch } from "../../app/ui/theme-switch";
export { themeBootstrap } from "../../app/ui/theme";
// Framework adapters stay test-only and alongside the fixtures that own them.
// Retain Next's actual signal predicate through its inspected installed entry.
export { unstable_rethrow } from "next/dist/client/components/unstable-rethrow";

export function usePathname() { return "/studio"; }
export function useRouter() {
  return { push: (href: string) => window.location.assign(href), refresh: () => {} };
}
async function email() {
  const response = await fetch("/__auth", { method: "POST" });
  return response.json();
}
export const authClient = {
  signIn: { email, social: email }, signUp: { email }, signOut: email,
};
export function SampleSpinOrMockup({ demo }: { demo: Parameters<typeof DemoPanel>[0]["demo"] }) {
  return <DemoPanel demo={demo} />;
}
export default function FixtureImage(props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  const { fill, priority, ...image } = props;
  void fill; void priority;
  return <img {...image} />;
}

export const SURFACES = ["shell", "landing", "women", "business", "coaches", "sign-in", "sign-up"] as const;
export type Surface = typeof SURFACES[number];
export type FixtureProps = { surface: Surface; balance: number | null; longName: boolean };

function Shell({ balance, longName }: FixtureProps) {
  const [draft, setDraft] = useState("");
  const [submissions, setSubmissions] = useState(0);
  // The REAL production shell component, not a hand-matched copy of its markup.
  // The first cut rewrote `layout.tsx`'s JSX here and the harness header still
  // claimed it ran the production UI, so the phase-1 design score was awarded
  // to a replica nothing held to production (phase-1 gate). Only the synthetic
  // DATA is the fixture's: the workspace name, the balance and the panel below.
  return <ProductShell
    workspaceName={longName ? "A very long synthetic workspace name with collaboration across several creative teams" : "Alex’s workspace"}
    credits={balance}
  >
    <h1>Your creative workspace</h1>
    <p>Shared shell fixture. Account and balance values are synthetic.</p>
    <form className="panel" style={{ display: "grid", gap: "var(--sp-3)" }} onSubmit={(event) => { event.preventDefault(); setSubmissions(submissions + 1); }}>
      <label htmlFor="draft">Draft to preserve</label>
      <textarea id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" className="btn btn-primary">Save fixture draft</button>
      <output aria-label="Fixture submissions">{submissions}</output>
    </form>
  </ProductShell>;
}

// THE LANDING'S NUMBERS, FIXED FOR THE CAPTURE (audit P6-A3, R-175). The page
// reads the ACTIVE config per request; the visual harness has no database and
// may not import the seed or a package's source (the `app/**` import rules), so
// these are fixture values for a screenshot, not product claims. They match a
// freshly seeded deployment today; `tests/landing-pricing.test.ts` is what pins
// the real page to its authorities.
const FIXTURE_METER = (free: number, creator: number, pro: number, studio: number) => ({ free, creator, pro, studio });
const FIXTURE_PRICING = {
  tiers: pricingFor(
    {
      allowances: FIXTURE_METER(25, 250, 2000, 8000),
      profileCaps: FIXTURE_METER(1, 1, 1, 5),
      trackedNiches: FIXTURE_METER(0, 1, 3, 10),
      concurrencyLimits: FIXTURE_METER(2, 2, 4, 8),
    },
    { creator: 1000, pro: 6000, studio: 20000 }
  ),
  terms: { pauseMinMonths: 1, pauseMaxMonths: 3, packValidityMonths: 12, minOwnPosts: 3, maxOwnPosts: 50 },
  configVersion: 1,
};

export function Fixture(props: FixtureProps) {
  if (props.surface === "shell") return <Shell {...props} />;
  if (props.surface === "sign-in" || props.surface === "sign-up") return <main className="auth-main">
    <div><ThemeSwitch /><AuthForm mode={props.surface} googleEnabled /></div>
  </main>;
  if (props.surface === "landing") return <LandingView pricing={FIXTURE_PRICING} />;
  const audience = AUDIENCES.find((item) => item.slug === props.surface)!;
  return <div className="landing">
    <div className="landing-stripe" /><LandingHeader />
    <section className={`hero ${audience.heroClass}`}><div className="hero-inner">
      <h1>{audience.h1Lead} <span className="hero-turn">{audience.h1Turn}</span></h1>
      <p className="hero-sub">{audience.sub}</p>
      <div className="hero-ctas"><a href="/sign-up" className="btn btn-primary">Start free, no card</a><a href="#pricing" className="btn btn-secondary">See pricing</a></div>
    </div></section>
    <DemoPanel demo={audience.demo} /><MarqueeTags /><StepsBand terms={FIXTURE_PRICING.terms} /><RefusesBand />
    <PricingSection pricing={FIXTURE_PRICING} /><ClosingBand /><LandingFooter />
  </div>;
}

export function renderFixture(props: FixtureProps) { return renderToString(<Fixture {...props} />); }
