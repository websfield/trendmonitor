# Claude Design prompt — Respin UI/UX

Paste everything below the line into Claude Design. When the design lands, normalize the resulting
tokens/decisions into `respin/DESIGN.md` (create it — none exists yet) per the `designing-uis` skill,
then round-trip to code.

---

I'm building **Respin**, a subscription web app for short-form creators (TikTok / Reels / YouTube Shorts, 1k–500k followers, solo, filming on their phone). It turns their idea, a trending reel, or a day of footage into a script **in their own voice**, mapped to shots they can film — built on mechanisms extracted from posts proven to perform, and it learns from their posted results. The core promise: leave 10 minutes later with a filmable script, not a chat transcript.

The current UI is completely unstyled (bare HTML, inline styles, no design system). I want you to design a **complete design system plus the key screens** — slick, intuitive, and distinctly *not* generic-AI-looking. The product's whole ethos is anti-generic ("audiences punish generic AI output"), so the design itself must embody that: no purple-gradient AI-slop, no stock glassmorphism, no template dashboard look.

## Step 1 — give me 2–3 divergent visual directions first

Before designing screens, propose 2–3 genuinely different directions I can pick with my eyes (e.g., one editorial/print-inspired, one bold studio-tool, one warm minimal). For each: palette, type pairing, one sample screen. Guardrails for all directions:

- **Audience-true**: confident, energetic, creator-native — but a professional tool, not a toy. These users live in TikTok all day; the tool should feel sharper than the platforms, not like them.
- **Content-first**: the product's output is dense structured text (scripts, hooks, shot maps). Typography IS the product. Prioritize a serious type system with real hierarchy — script text must be genuinely readable, hooks must feel like headlines.
- **Honest by design**: this product never fakes certainty (see "honesty states" below). The visual language needs a calm, credible way to say "we don't know" and "this failed" without alarm-red panic styling everywhere.
- Dark and light mode, WCAG 2.2 AA contrast, responsive from 360px phone to desktop (creators check on phones; deep work happens on desktop).

After I pick a direction, produce the full system: color tokens (semantic, both themes), type scale, spacing scale, radius, elevation, motion rules, and a component inventory (buttons, inputs, cards, tables, badges, banners, modals, empty states, skeletons).

## Taste rules — hard constraints on every direction

These are non-negotiable bans on the visual tells that make AI-generated design look generic:

**Color.** One accent color maximum, saturation under ~80%, used consistently across the whole app (no blue CTA appearing in one section of a warm-grey app). No pure `#000000` or `#ffffff` — off-black and off-white only. No purple/blue "AI glow" gradients, no neon outer glows. No default beige + brass + oxblood "premium AI palette" (`#f5f1ea` backgrounds with `#b08947` accents — the palette every AI tool reaches for). Shadows tinted to the background hue, never pure-black on light. Pick something with an actual point of view: cold luxury silver + chrome, deep forest + bone + amber, cobalt + cream, terracotta + slate, olive + brick + paper, or monochrome + one saturated pop.

**Typography.** Don't default to Inter; consider Geist, Satoshi, Cabinet Grotesk, or Outfit (good pairings: Geist + Geist Mono, Satoshi + JetBrains Mono, Cabinet Grotesk + Inter Tight). A monospace companion is genuinely useful here — timestamps, credit numbers, metric values. If a direction goes editorial-serif, not Fraunces and not Instrument Serif (the two AI-favorite display serifs). Body text max ~65ch. One corner-radius system applied everywhere.

**Layout.** No "three identical feature cards in a row" pattern. Max 2 consecutive image-left/text-right zigzag sections on the landing page. Bento grids only with exactly as many cells as there is real content — no filler cells. Eyebrow labels at most 1 per 3 sections. No section-number eyebrows ("001 · Capabilities"), no "scroll to explore" cues, no decorative status dots, no fake locale/time strips.

**Content in mockups.** Use realistic creator content (real-sounding niches, plausible hooks, believable metrics like 3.2 follows/1k), never "John Doe" / "Acme" / 99.99% / round fake numbers. No filler marketing verbs ("Elevate", "Seamless", "Unleash"). No em-dashes anywhere in UI copy — it's the number-one AI tell. No div-built fake screenshots inside the landing hero; the hero demo shows real product output.

**Motion.** Every animation must communicate something (hierarchy, feedback, state change) — nothing "because it looks cool." Everything degrades under `prefers-reduced-motion`.

**Density dials per surface** (1–10 scale): product app screens (Studio, Trends, Results, Usage) — layout variance 5–6, motion 3–4, density 4–6: a calm, information-dense working tool. Marketing landing — variance 7–8, motion 5–7, density 3–4. Landing hero must fit the initial viewport: headline max 2 lines, subtext max 20 words, CTA visible without scrolling, max 4 stacked elements.

## Step 2 — design these screens (in priority order)

**1. Studio — the generation workspace (the heart of the app).**
Seven generation modes (idea-to-script, footage-to-thesis, source-to-reel, analyse-and-spin, hooks-only, caption, ideation) — design the mode picker and one full output view. The output is a rich structured document, always this shape: thesis → framework + why it fits → 3–5 hooks (each labeled with its mechanic) → timestamped voice-over script with **"THE TURN"** marked as a first-class moment → shot map (each beat mapped to a clip they have or a shot to film) → on-screen text plan → caption → "why this performs" **including the concept's weakest point**. Design this as a scannable, filmable artifact — something a creator props their phone next to while shooting — not a wall of chat text. Placeholders for unverifiable specifics render as literal `[check]` tokens; give them a distinct visual treatment.

**2. Trends — the feed + Spin.**
A feed of outperforming posts in the creator's niches, each pre-autopsied. Card anatomy: the post reference, outlier score (outperformance vs the channel's own baseline — not raw views), the autopsy (hook mechanic, structure/beats, ending style, follow trigger), matched framework, recency + saturation badges (observed / emerging / established / saturated; stale items are marked stale, never deleted). One primary action per card: **Spin** — generate my version through my brain. Design the spin result as a **side-by-side view: original vs. my version**, making the transformation obvious.

**3. Onboarding — building the brain (<20 min, guided).**
Interview (goals, positioning, north-star metric, banned words) + paste 5–10 of their own posts + optional reference posts. The critical screen: **inferred-field confirmation** — every inferred brain field shows its source evidence and the creator confirms or edits each one before the brain activates. Nothing activates silently. Ends with an aha moment: their first three generated ideas.

**4. Results — the learning loop.**
Log a result per posted script: platform, date, views, north-star numerator; system computes the normalized metric vs their own baseline. Design: confounder flags as structured chips (topic overlap, timing unknown, account growth, spillover); **reach and conversion always shown as two separate levers, never one score**; unverified entries visibly badged unverified; below minimum sample size (n<3), findings styled as "exploratory" with no rule proposed. **Proposal cards**: "Framework X converts for you — sample size, effect, confidence — Approve / Reject." The brain never updates silently.

**5. Usage & billing.**
Credit balance (derived from an append-only ledger — show the ledger as history), this month's burn by mode, overage packs, auto-top-up with spend cap, and the **brain-as-asset view** (brain version count, tested rules, logged results — the "here's what you'd walk away from" panel shown at any cancel decision). The cancel flow always offers **pause** first (1–3 months, everything frozen and preserved, read-only).

**6. Marketing landing + pricing.** Hero with the product thesis and a before/after comparison demo (generic AI script vs. their-voice script). Pricing: Free / Creator $10 / Pro $60 / Studio $200 per month.

## The honesty states — design these deliberately, they're the brand

These are product non-negotiables and each needs a designed state, not an afterthought:

- **Kill-test failure**: every output must pass the creator's quality kill-test before display; if all candidates die, the UI says so plainly and offers "dig for a sharper angle" — never pads with filler. Design this refusal to feel like rigor, not error.
- **Empty states always say why** they're empty and what fills them (e.g., "No results yet — log your first posted script").
- **Zero credits**: generation blocked with a clear prompt (buy pack / enable auto-top-up) — firm but not dark-pattern.
- **Paused workspace**: full read-only mode with everything preserved and visible.
- **Degraded / unknown data**: when a number can't be computed, show "unavailable + why," never a fake zero.
- **Saturation warnings**: "this framework is saturated — it demands a fresh interpretation."
- **No guarantees anywhere**: copy tone never promises virality; the weakest point of every concept is always disclosed.

## Technical context for handoff

Next.js 15 App Router + React 19 + TypeScript. No CSS framework yet — propose one as part of the system (Tailwind v4 is acceptable and likely). Deliver the design system as tokens I can pull into code (CSS variables / Tailwind theme), and structure the handoff so screens map to components, since I'll implement via Claude Code. Server-rendered pages, forms via server actions — design loading/skeleton and error states accordingly.
