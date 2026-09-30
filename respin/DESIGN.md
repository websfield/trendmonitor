# Respin design system — Colour Pop / After Hours

Approved direction: docs/design/v2/Respin_Visual_Refinement_Handoff.md v5, its prototype and four mockups. The v2 master plan governs production qualifications. Colour Pop is the default; html[data-theme="dark"] selects After Hours. Both themes use the same components and state.

## Reference contract, frozen before styling

Reference captures: .tmp/respin-v2-reference/manifest.json (48 prototype screenshots: start, brief, script, filming, references and Brain; light/dark at 390/768/1024/1440). Compare the real prototype DOM and supplied mockups, not an imagined redesign. .tmp/respin-v2-baseline/manifest.json retains the previous UI, synthetic tasks, revision/source hashes and interactive Studio/limited Brain stimuli. These are comparison materials, not authenticated-route or human-trial evidence.

Production differences: retain Geist; use authoritative offers and real charges; omit prototype search/history, mock credit meter and sample plan/profile selectors; preserve complete onboarding; route reference work through Trends; join shots by beatIndex and retain independent timed cues. Mockups supply art direction, never evidence, permissions or pricing. These differences do not excuse missing layout structure.

| Dimension | Weight | Applicable reference |
|---|---|---|
| D1 palette, contrast and quiet evidence | 15 | Every core surface/state |
| D2 shell proportions and responsive navigation | 15 | Shell and every core surface/state |
| D3 typography and reading density | 10 | Every core surface/state |
| D4 spacing, cards, borders and selection | 10 | Every core surface/state |
| D5 brand, icons, illustration and annotation | 10 | Shell and every core surface/state; artwork stays decorative |
| D6 action hierarchy, access and actual cost | 10 | Every core surface/state; shell uses derived balance instead of sample meter |
| D7 task, tabs, source stages and Brain sections | 10 | Start/brief, script/checks, filming, references and Brain; N/A for shell-only fixture |
| D8 persistent findings and evidence navigation | 10 | Script/checks, filming, references and Brain; N/A for shell and unsubmitted start/brief |
| D9 scene/detail relationship | 5 | Filming, references and Brain; N/A for shell, start/brief and script/checks |
| D10 mobile order and long-content resilience | 5 | Every core surface/state |

Applicability is fixed across both themes and widths. Document any additional state-level N/A before changing that surface, citing its reference and actual prop contract. Shell's denominator is 75; start/brief and script/checks are 85 and 95 respectively; filming/references/Brain are 100. Met=1, partial=0.5 for nonfunctional spacing/art differences only, absent/reversed structure=0. Score = 100 × earned weight / applicable weight. Require ≥90 for each core surface and theme, with width-level observations and two critique passes. Never average a failed surface away. Functional, honesty, scope or accessibility failure fails irrespective of score. Supporting pages without a prototype counterpart receive full functional/accessibility checks, not invented conformance scores.

## Tokens

app/respin-tokens.css is the implementation authority. Existing semantic names remain available.

Brand-only top/middle/bottom gradients reproduce the prototype capsule mark: 150deg #ff63b3→#d42de5, 120deg #5559ff→#7637f5, 145deg #a57cffad→#6638ff. They carry no text or status.

| Role | Colour Pop | After Hours |
|---|---|---|
| bg | #FAFBFF | #090F22 |
| surface-1 | #FFFFFF | #121B33 |
| surface-2 | #F3F2FB | #1A2442 |
| surface-3 | #E9E7F6 | #25314E |
| border / border-strong | #E0E3F0 / #74728C | #2E3A5B / #8E9CBD |
| text-1 | #15152E | #F6F4FF |
| text-2 | #46415F | #D6D9EB |
| text-3 | #595571 | #BAC2DB |
| text-4 | #67657F | #A5AEC8 |
| accent / accent-hover | #6337E8 / #5127C4 | #6337E8 / #5127C4 |
| accent-text / strong | #6337E8 / #5127C4 | #B99AFF / #D4C2FF |
| accent-surface / surface-2 | #F3EDFF / #EEE7FF | #201C3A / #251E43 |
| accent-border | #7B61B7 | #A18AE0 |
| on-accent / body | #FFFFFF / #F5EFFF | #FFFFFF / #F5EFFF |
| lavender / ink | #EEE7FF / #5830B5 | #251E43 / #CFBAFF |
| peach / ink | #FFF0E6 / #9A3C17 | #35251F / #FFB99A |
| mint / ink | #DDF9F1 / #09634E | #123831 / #86E0CA |
| blue / ink | #E7F0FF / #2558A3 | #172F4A / #A9CCFF |
| check surface / ink / border | #FFF3D6 / #825100 / #A46500 | #302719 / #FFD58A / #C59440 |

Primary actions use a gradient from accent to #7931CA with white text; the pale dark-theme accent text is never the primary fill. Shadows are subtle violet/navy tints; financial/evidence panels remain quiet. Focus uses an outline plus contrasting ring. Sidebar uses surface-1. Dark photo bands retain a fixed dark scrim, pale #D4C2FF accent and on-accent ink in both themes.

Spacing retains the 4px base: 4/8/12/16/20/24/32/40/48/64. Control radius 12px; card radius 24px; chip radius 8px. Rail width 232px; desktop content max-width 1280px. Navigation changes below 800px. Controls target 44×44px. Sidebar and mobile disclosure scroll when their contents exceed the viewport; data tables and later scene strips retain their own scroll regions. Long text wraps.

## Type and motion

Keep self-hosted Geist / Geist Mono. Display 44px (landing fluid 40–88), h1 28px, h2 20px, h3 16px, body 15.5px/1.6, UI 13.5px, meta 12px, label 11px. Numbers, timestamps, credit values and checking markers use mono. Script measure max 66ch. Decorative annotation uses a local cursive fallback; never put essential instructions or prices in it.

Motion durations 120/200/300ms; decorative transform/opacity only; reduced motion disables animation/transition. Density 4–6, motion 2, variance 5. The supplied violet gradient and three task cards are intentional exceptions to generic anti-slop defaults. Restrict expressive art to entry/brand areas; avoid nested ornamental panels and fabricated metrics.

## Components and state

- Shared Brand/Icon, native theme buttons and navigation; visible selected state plus text/ARIA.
- Buttons retain primary/secondary/quiet and explicit disabled/pending reasons. Theme controls always type=button.
- Inputs keep labels, validation, minimum touch height and visible focus in forced colors.
- Panels use card radius and quiet surfaces; refusal remains plain language plus a strong border and recovery.
- Badges keep VERIFIED/UNVERIFIED/STALE and other actual labels; color never creates an evidence status.
- Checking markers use amber, preserving literal [check] text. Tabs/exports never resolve findings.
- Ledger values remain derived; null is unavailable, never zero. No invented capacity meter.
- Existing landing photography/section order and auth behavior remain until the owning phase changes presentation. Pricing remains in pricing-copy.ts under its config assertions. Photography stays environments, hands and silhouettes only — never an identifiable face posed as a customer, which would be invented social proof (REQ-I03).
- Empty, loading, blocked/refused/error and long-content states are first-class. Self-reported results never imply verified learning.

### Named states this system owes (a list, not a category)

The first v2 draft replaced the named states below with the generic sentence above, and three of them then appeared nowhere in any v2 phase plan. A category is not a population: these are enumerated so the phase that styles each surface cannot quietly omit one (CLAUDE.md non-negotiable rule 7).

- **Money (REQ-G)** — the zero-credit block (REQ-G03); paused read-only and the pause-first cancel interstitial, where cancelling offers pause before it offers cancellation, with brain-as-asset on that path (REQ-G08, R-12 — **not** R-7, which is tiers and prices); plan, pack and auto-top-up states, including **auto-top-up's monthly spend-cap field** (REQ-G03 [Must], live today at `app/(product)/settings/billing/billing-view.tsx` whose value arrives as the mapped `autoTopup.monthlyCapCents` prop from `settings/billing/page.tsx`). The ledger table states that it is **append-only** and carries its **"showing N of M" clamp note** when the view is truncated (REQ-G04, R-6 — the ledger is the balance). The **payment-failed grace state** (REQ-G06: grace, then downgrade) and the **unpaid-first-invoice `incomplete` state** are their own surfaces, as are the usage runway refusals `runway-paused` and `runway-no-spend` (REQ-G07 — no spending rate to estimate from is said, never estimated). Real zero and unavailable are always distinct surfaces, never one.
- **Brain (REQ-B02, REQ-C05, R-8)** — the onboarding confirmation card: the inferred value, its SOURCE EVIDENCE quote block, and per-field Confirm/Edit; the page-level "N of M confirmed" sticky bar; **activation stays blocked until every enumerated position is confirmed** (enforced at `packages/db/src/with-workspace.ts`, `activateBrainDoc` AC-26, which compares `enumerateClaimFields` against `confirmedFields` and refuses citing REQ-B02; `activateBrainCoherent` is `/brain`'s entrypoint and proposal acceptance reaches the same gated capability at `packages/db/src/promotion-ops.ts:803`, both running AC-26; `brain-ops.ts`'s `claimsFor` comment about R9 is prose, not the gate). Proposal approve/reject is always explicit, **never silent**. Active, proposed and missing Brain evidence stay visually distinct.
- **Studio (REQ-E, REQ-I)** — the kill-test failure state, which surfaces honestly rather than padding, and the generating skeleton. Output stays marked "checking" until finalised.
- **References (REQ-E)** — the empty feed with its reason, and saturation plus stale, whose labels stay visible rather than hiding the retained item. Trend badges keep EMERGING / ESTABLISHED / SATURATED as actual labels.
- **Results (REQ-F, R-10)** — the meter renders reach and conversion as separate bars with a baseline tick, and they are **never merged into one score**. Every comparison is against the creator's own baseline, rendered as that tick. Unverified entries, degraded "unavailable + why" panels, and exploratory n<3 are three separate states and none of them is a result.

### Copy rules (REQ-I03, REQ-I04)

Sentence case throughout; mono uppercase for labels only; no em-dashes. No hype verbs and no virality promises; the weakest point is always disclosed. Refusals name the remedy. Unknown personal details render as literal `[check]` placeholders and are never invented. These bind every surface this design system reaches. **Enforcement is narrower than that, and the gap is stated rather than implied:** the no-hype/no-guarantee bans are enforced in code by the shared claims canon in `tests/support/forbidden-claims.ts`, whose consumers are the shell chrome, `sample-spin-panel`, `legal/page`, `changelog/entries` and — since R-130 — **every marketing route**, through `tests/marketing-claims.test.tsx`. That test renders the landing, all three `/for/<slug>` variants *and* their `generateMetadata` output, `/changelog` and `/legal`, in both branches of the public Sample Spin flag, and applies `FORBIDDEN_CLAIMS` + `PERFORMANCE_CLAIMS` + the marketing-scoped `MARKETING_CLAIMS`. Its population is a **directory read** of `app/(marketing)/**/page.tsx` asserted equal to the set it rendered, so a new marketing route is a red test rather than an unscanned surface — the phase-1 gate found the previous shape of this paragraph describing two files that carried live "learns your voice" copy the canon's own `learn` pattern bans (R-8, non-negotiable 3: a brain is context, never weights), with the suite green because nothing read them. What the canon still does **not** enforce: "the weakest point is disclosed" (that is `STUDIO_POSITIVE_ASSERTIONS`, a different mechanism on one screen), and the Phase-4 marketing qualifications V2-R5 / V2-MKT-01 — fixture labelling, the `[check]` placeholder for `MAIN_DEMO`'s clip, the setup-duration and one-output-shape claims — which are not claims any pattern here matches. Naming both stops this paragraph from claiming more coverage than exists.

## Theme and state lifetime

theme.ts owns the sole key respin.theme.v1, light/dark validation and pre-paint bootstrap. Guard storage getters and writes; malformed/unreadable storage falls back to light. Switching applies to the current session even when storage fails. Persist only the appearance value, never creator content. No system theme, account sync, router refresh or state-key change. Without JavaScript use light CSS and native navigation.

Root bootstrap and browser fixtures share the exact implementation. The server initially renders light; hydration handles only the root theme-attribute difference. A switch does not submit forms, clear inputs or remount product content.

## Verification and evidence

Full surface/state population and human-comparison protocol live in the v2 master plan. Browser matrix uses Chromium/Firefox/WebKit, both themes, 390/768/1024/1440, plus 320px reflow, 200% text enlargement, 799/800/801 navigation, forced colors and reduced motion. Contrast targets: 4.5:1 normal text, 3:1 large text and essential controls. Verify actual rendered combinations; token ratios alone are insufficient.

Manual screen-reader observations are lowest priority and never block a phase (decisions.md R-133); announcement behaviour is recorded as not obtained, never as passing. Phase 5 executes the real isolated app and five-creator comparison. Missing prerequisites remain pending; no visual, accessibility, usability or production completion is claimed by this design contract.
