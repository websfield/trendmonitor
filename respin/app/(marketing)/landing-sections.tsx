// Shared sections for the marketing landing and its /for/<audience>
// variants. Pricing renders from ./pricing-copy.ts in exactly one place so
// tests/landing-pricing.test.ts keeps a single authority to pin.
import Image from "next/image";
import { buttonClass } from "../ui/button";
import { MECHANIC_TAGS, PRICING } from "./pricing-copy";
import { AUDIENCES, type DemoCopy } from "./audiences";

export function LandingHeader() {
  return (
    <header className="landing-header">
      <a href="/" className="landing-wordmark">
        Respin
      </a>
      <nav aria-label="Landing">
        <a href="#pricing">Pricing</a>
      </nav>
      <div className="landing-header-cta">
        <a href="/sign-in">Sign in</a>
        <a href="/sign-up" className={buttonClass("primary")}>
          Start free
        </a>
      </div>
    </header>
  );
}

export function MarqueeTags() {
  // The track is the content TWICE; the keyframe travels -50%, so the loop is
  // seamless. Decorative duplicate is hidden from assistive tech.
  return (
    <div className="marquee">
      <div className="marquee-track">
        {MECHANIC_TAGS.map((t) => (
          <span key={t.text} className={t.hot ? "mech-tag mech-hot" : "mech-tag"}>
            {t.text}
          </span>
        ))}
        {MECHANIC_TAGS.map((t) => (
          <span
            key={`dup-${t.text}`}
            className={t.hot ? "mech-tag mech-hot" : "mech-tag"}
            aria-hidden="true"
          >
            {t.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// Renders literal "[check]" occurrences as the styled [check] token — the
// product's marker for a specific it will not invent (REQ-I03).
function withCheckTokens(text: string) {
  const parts = text.split("[check]");
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={`check-${i}`} className="check-token">
            [check]
          </span>,
          part,
        ],
  );
}

export function DemoPanel({ demo }: { demo: DemoCopy }) {
  return (
    <section className="landing-section demo-section">
      <div className="demo-panel">
        <div className="demo-grid">
          <div className="demo-before">
            <span className="demo-label">THE SAME IDEA, ANY CHAT MODEL</span>
            <div className="demo-copy">
              <p>{demo.slop[0]}</p>
              <p>{demo.slop[1]}</p>
              <p>{demo.critique}</p>
            </div>
          </div>
          <div className="demo-after">
            <span className="demo-label">THE SAME IDEA, THROUGH YOUR BRAIN</span>
            <div className="script-grid">
              <span className="script-tc">{demo.hook.tc}</span>
              <p className="script-line">{demo.hook.text}</p>
              <span className="script-tc script-tc-turn">{demo.turn.tc}</span>
              <div className="the-turn">
                <span className="the-turn-label">THE TURN</span>
                <p>{demo.turn.text}</p>
              </div>
              <span className="script-tc">SHOT</span>
              <p className="script-shot">{withCheckTokens(demo.shot)}</p>
            </div>
          </div>
        </div>
        <div className="demo-foot">
          <span>
            REAL OUTPUT SHAPE: THESIS &middot; HOOKS &middot; TIMED SCRIPT
            &middot; SHOT MAP &middot; CAPTION &middot; WEAKEST POINT, ALWAYS
            DISCLOSED
          </span>
        </div>
      </div>
    </section>
  );
}

export function StepsBand() {
  return (
    <div className="band band-steps">
      <section className="landing-section">
        <h2 className="section-title">How it works</h2>
        <div className="steps">
          <div className="step">
            <span className="step-num">01</span>
            <h3>Build your brain in 20 minutes</h3>
            <p>
              A short interview plus 5 to 10 of your own posts. You confirm
              every inferred field before it activates; nothing is assumed
              silently.
            </p>
          </div>
          <div className="step">
            <span className="step-num">02</span>
            <h3>Generate, kill-test, film</h3>
            <p>
              Seven modes, one output shape: hooks, a timed script with the
              turn marked, and every beat mapped to a clip you have or a shot
              to film.
            </p>
          </div>
          <div className="step">
            <span className="step-num">03</span>
            <h3>Log results. It learns you.</h3>
            <p>
              Post, log the numbers, and approve or reject what the data
              proposes. The brain never updates behind your back.
            </p>
          </div>
        </div>
        <div className="steps-cta">
          <a href="/sign-up" className={buttonClass("secondary")}>
            Build your brain
          </a>
        </div>
        <Image
          className="steps-photo"
          src="/marketing/filming.png"
          alt=""
          width={1536}
          height={1024}
        />
      </section>
    </div>
  );
}

export function RefusesBand() {
  return (
    <div className="band band-refuses">
      <section className="landing-section">
        <div className="refuses">
          <h2>What Respin refuses to do</h2>
          <div className="refuses-grid">
            <span>
              It never promises virality. Every concept ships with its weakest
              point disclosed.
            </span>
            <span>
              It never pads. If all candidates die your kill-test, it says so
              and digs again.
            </span>
            <span>
              It never fakes a number. Unverifiable specifics render as [check]
              tokens for you to fill.
            </span>
            <span>
              It never scores you against other creators. Every baseline is
              your own history.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="landing-section">
      <div className="pricing-head">
        <h2>Pricing</h2>
        <span className="pricing-note">
          CREDITS ARE THE ONLY METER. EVERY RUN STATES ITS PRICE BEFORE IT
          SPENDS.
        </span>
      </div>
      <div className="pricing-grid">
        {PRICING.map((tier) => (
          <div
            key={tier.name}
            className={
              tier.featured ? "price-card price-featured" : "price-card"
            }
          >
            <div className="price-name-row">
              <span className="price-name">{tier.name}</span>
              {tier.featured ? (
                <span className="price-flag">MOST CREATORS</span>
              ) : null}
            </div>
            <div className="price-amount">
              {tier.amount}
              {tier.period ? (
                <span className="price-period">{tier.period}</span>
              ) : null}
            </div>
            <div className="price-lines">
              {tier.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <a
              href="/sign-up"
              className={buttonClass(tier.featured ? "primary" : "secondary")}
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>
      <p className="pricing-fine">
        Cancelling always offers a pause first: 1 to 3 months, no charges,
        everything frozen and readable. Unused monthly credits expire; packs
        last 12 months. No plan promises reach, and none of them ever will.
      </p>
    </section>
  );
}

export function ClosingBand() {
  return (
    <div className="band band-close">
      <section className="landing-section closing">
        <div className="close-card">
          <span className="landing-wordmark">Respin</span>
          <p>Leave with a script you can film.</p>
          <a href="/sign-up" className={buttonClass("primary")}>
            Start free, no card
          </a>
          <a href="/sign-in" className="close-signin">
            Already have an account? Sign in
          </a>
        </div>
      </section>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span className="landing-wordmark">Respin</span>
      <span className="footer-tag">
        Scripts in your voice, built on mechanisms that perform.
      </span>
      <nav aria-label="Footer">
        {AUDIENCES.map((a) => (
          <a key={a.slug} href={`/for/${a.slug}`}>
            {a.navLabel}
          </a>
        ))}
        <a href="#pricing">Pricing</a>
      </nav>
    </footer>
  );
}
