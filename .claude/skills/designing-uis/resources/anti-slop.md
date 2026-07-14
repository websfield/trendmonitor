# Anti-slop: the rules that keep a UI from reading as "AI made it"

Read this during **Pass 2** (self-critique) of the design loop. These are distilled from Anthropic's
frontend-design skill, Google Stitch's taste-design rulebook, and awesome-claude-design's anti-slop kit.
Treat the BANs as hard defaults to reject unless you have a deliberate reason, stated in `DESIGN.md`.

## Quantified taste dials

Pick values explicitly in `DESIGN.md` instead of letting them default:

- **Density** (1–10): how much breathing room. Low = airy/editorial, high = data-dense/pro.
- **Motion** (1–10): how much animation. Most product UI lives at 2–4.
- **Variance** (1–10): how far from a conventional layout. Higher variance *requires* asymmetry (see bans).
- **Color:** max **1** accent color. Accent saturation generally **< 80%**. Neutrals do the heavy lifting.
- **Contrast:** body text ≥ **4.5:1**; large text / UI affordances ≥ **3:1**.
- **Touch targets:** ≥ **44×44px**.
- **Motion timing:** **150–300ms**; animate **`transform`/`opacity` only** (never width/height/top/left).

## Named BANs (the recognizable AI fingerprints)

**Color / theme**
- ❌ "AI purple" / blue-violet gradient as the brand. ❌ Indiscriminate neon. ❌ Teal-on-everything.
- ❌ The three default clusters frontend-design calls out: cream+serif+terracotta; near-black+acid-green;
  broadsheet+hairline-rules. They are defaults, not choices.

**Typography**
- ❌ **Inter for "premium" contexts** (it's the safe default). Prefer Geist / Outfit / Cabinet Grotesk /
  Satoshi / a deliberate pairing chosen for the subject. Inter is fine for neutral utility UI — just don't
  reach for it *as* the design.

**Layout**
- ❌ **Three equal cards in a row** as the default content block → use asymmetry / a zig-zag / varied sizes.
- ❌ **Centered hero** when variance > 4 → off-center or editorial layout instead.
- ❌ Card-nesting deeper than **2 levels** ("card soup").
- ❌ Giant number + tiny label "stat" blocks used as filler.

**Detail / motion**
- ❌ Blinking/pulsing status dots and gratuitous micro-animation.
- ❌ Default Lucide/Heroicons mixed sets → commit to **one** icon family.
- ❌ Drop-shadow-on-everything; soft-glass-on-everything.

**Content**
- ❌ Fabricated metrics, uptime %, fake testimonials/logos, lorem that implies real data.

## Fingerprint → fix

| If you see… | Do this instead |
|---|---|
| Purple/blue-violet gradient brand | Derive color from the product's real subject; one accent, restrained saturation |
| Inter everywhere on a premium product | Choose a typeface with character for display; keep a neutral text face if needed |
| 3 equal cards / centered everything | Introduce a signature asymmetric layout move; vary block sizes |
| Cards nested 3+ deep | Flatten to ≤ 2 levels; use spacing and type for hierarchy, not boxes |
| Mixed icon sets | Pick one family; match weight to the type |
| Everything animates | Cut to purposeful transitions; `transform`/`opacity`, 150–300ms |
| Mockup padded with fake stats | Use real or clearly-placeholder content; design the empty state instead |

## The two questions to pass

1. *"Would I produce this exact design for any other product in this category?"* — if yes, it's a default.
2. *"What is the one signature element someone would remember?"* — if there isn't one, keep going.

Then **remove one thing** (the Chanel rule) before you ship.
