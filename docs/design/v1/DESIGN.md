# Respin DESIGN.md — "Signal" system

Direction chosen 2026-08-28 from three candidates (editorial print, dark studio tool, warm minimal).
Signal: a calm, information-dense dark studio tool. Graphite surfaces, one cobalt accent,
Geist for words, Geist Mono for anything that counts. Copy this file to `respin/DESIGN.md`;
tokens live in `respin-tokens.css` (drop into `app/` and import from the root layout, or fold
into Tailwind v4 `@theme` as below).

## Point of view

- Content-first: the script document IS the interface. Type does the hierarchy; chrome stays quiet.
- One accent (#4066E0 dark / #3556C4 light, sat < 80%). Cobalt means: confirmed, outperforming, or the primary action. Nothing else is colored.
- Honesty is a component class, not an afterthought: refusals use strong neutral borders and plain words. No alarm red, no fake zeros, status never color-only.
- Every comparison is against the creator's own baseline, rendered as a tick on a meter.
- Mono carries every number: timestamps, credits, multipliers, ledger rows, [check] tokens.

## Tokens

Source of truth: `respin-tokens.css`. Dark is `:root` (default); light overrides under
`[data-theme="light"]` / `.theme-light`. Key names:

- Surfaces: `--bg, --surface-1..3` (page, panel, nested row, pressed/table-head)
- Lines: `--border` (hairline seam), `--border-strong` (emphasis: refusals, weakest point, unverified)
- Ink: `--text-1..4` (ink, body, secondary, meta). Never #000/#fff.
- Accent: `--accent, --accent-hover, --accent-text, --accent-text-strong, --accent-surface, --accent-surface-2, --accent-border, --on-accent`
- Effects: `--shadow, --shadow-soft` (tinted to bg hue), `--scrim`, `--focus-ring`
- Motion: `--dur-fast 120ms, --dur 200ms, --dur-slow 360ms, --ease cubic-bezier(0.2,0,0,1)`
- Radius: `--radius 6px` (panels/buttons/inputs), `--radius-sm 4px` (chips/badges). Toggle knobs are the only pills.
- Spacing: `--sp-1..16` = 4 8 12 16 20 24 32 40 48 64. Panel padding 20; page gutter 36; desktop sidebar 224.

## Type scale (Geist / Geist Mono)

- display 44-52 / 700 / -0.03em (landing hero only)
- h1 28 / 600 / -0.02em; h2 20 / 600; h3 16 / 600
- body & script 15.5 / 400 / 1.6, max 66ch (script text is the product; keep it readable)
- ui 13.5 / 500 (buttons, chips, nav); meta 12 mono; label 10-11 mono 600 +0.12em uppercase
- Numbers, timestamps, credits, multipliers: always mono.

## Component inventory (states in parentheses)

- Button: primary cobalt / secondary outline / quiet (hover darkens or fills; disabled = surface-3 + linked reason text; pending = label swaps to in-flight words, never "Saving")
- Input, Textarea, Select (default, focus ring, error = strong border + words; limits stated up front, refuse never truncate)
- Toggle (auto-top-up), with spend-cap field
- Panel/Card (level 0 border; level 1 soft shadow: proposals, spin results; level 2 floating: modals, cancel interstitial)
- Table: ledger (mono numerics right-aligned, append-only note, clamp note "showing N of M")
- Badge: VERIFIED / EMERGING (cobalt fill) · ESTABLISHED / SATURATED (solid border) · UNVERIFIED / STALE-KEPT (dashed border) — words always
- Mechanic tag: `[consensus break]` mono cobalt text
- [check] token: mono, cobalt tint, dashed border — the only dashed cobalt element
- THE TURN block: accent-surface panel + diamond node on the timecode rail
- Timecode rail: 2px line + circle nodes; turn = cobalt diamond
- Meter: reach / conversion bars with baseline tick; never merged into one score
- Refusal banner (kill-test, blocked run): strong border, plain words, a way forward, no red
- Empty state: dashed border, says why empty + what fills it
- Skeleton: surface-3 bars, 1.6s pulse, static under reduced motion
- Mode picker: chip row (active = accent-surface-2 + accent-border)
- Confirmation card (onboarding): inferred value + SOURCE EVIDENCE quote block + Confirm/Edit; page-level "N of M confirmed" sticky bar; activation blocked until all confirmed

## Honesty states (each designed, see screens)

kill-test failure (Studio) · zero credits (Studio) · generating skeleton (Studio) ·
empty feed (Trends) · saturation + stale (Trends) · unverified + degraded "unavailable + why" +
exploratory n<3 (Results) · proposal approve/reject, never silent (Results) ·
paused read-only + cancel-offers-pause-first + brain-as-asset (Usage & billing)

## Density dials (1-10)

App screens: layout variance 5-6, motion 3-4, density 4-6. Landing: variance 7-8, motion 5-7,
density 3-4 (hero: 2-line headline, subtext under 20 words, CTA above fold, max 4 stacked elements).

## Copy rules

Sentence case; mono uppercase for labels only. No em-dashes. No hype verbs, no virality promises;
weakest point always disclosed. Refusals name the remedy. Numbers exact, in mono. Body max 66ch.

## Tailwind v4 mapping

```css
@theme {
  --font-sans: "Geist", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --color-bg: var(--bg);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-ink-1: var(--text-1);
  --color-ink-2: var(--text-2);
  --color-ink-3: var(--text-3);
  --color-ink-4: var(--text-4);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --radius-panel: 6px;
  --radius-chip: 4px;
}
```

Theme switch: `data-theme="light"` on `<html>`; default (no attribute) is dark.
`prefers-reduced-motion` globally disables animation/transition (already in tokens file).

## Screens → components (implementation map)

- `Respin Studio.dc.html` → app/(product)/studio: mode picker chips, run header, output doc
  (thesis, framework, hooks, script + rail + turn, shot map, on-screen text, caption, why +
  weakest point), kill-test refusal, zero-credit block, skeleton, 360px column
- `Respin Trends.dc.html` → trends feed: outlier card (autopsy grid, badges, Spin), spin
  side-by-side (original vs yours), empty feed
- `Respin Onboarding.dc.html` → app/(product)/onboarding: step header, confirmation cards with
  evidence, banned-words chips, sticky activation bar (blocked with reason), first-three-ideas
- `Respin Results.dc.html` → results: log entry card (two meters + confounder chips + verify badge),
  degraded state, proposal card, exploratory card, baseline panel, empty state
- `Respin Usage.dc.html` → app/(product)/usage + settings/billing: balance (ledger-derived),
  burn-by-mode bars, brain-as-asset, ledger table, plan/pack/auto-top-up, pause-first cancel
  interstitial, paused read-only
- `Respin Landing.dc.html` → app/(marketing): hero (thesis + real-output demo), 3 numbered steps,
  "what Respin refuses to do", pricing (Free $0 / Creator $10 / Pro $60 / Studio $200)

## Next.js notes

Server-rendered pages + server actions: every mutating control gets a pending label that is true
on all paths ("Working on your run…"), a linked disabled reason, and a refusal rendered as the
banner component (focus island on redirect refusals, live region on in-place ones — the existing
a11y patterns in app/(product) carry over unchanged). Skeletons only for generation runs; ordinary
navigations render full server HTML.
