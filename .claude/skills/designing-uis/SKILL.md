---
name: designing-uis
description: Use when building a new UI (page, screen, component, or whole app) or reshaping an existing one — whenever visual design, layout, typography, color, spacing, or "make it look good / less generic / less like AI made it" is in play. Establishes a project DESIGN.md as the design source of truth, grounds the look in references or a named aesthetic family, renders 2–3 divergent directions the person picks with their eyes, applies quantified anti-slop rules and a priority-tiered checklist (accessibility/touch first), and iterates on screenshots until the built result verifies. For which external tool to reach for (Stitch, Claude Design, Canva, OpenAI image), defer to the ui-design-tools skill.
---

# Designing UIs

The pack's default is functional but plain. This skill is how you produce UI that is **intentional**
— grounded in the product, consistent across screens, accessible, and not recognizable as a generic
AI default. It is tool-agnostic: the methodology here holds whether you hand-write the code, use
Google Stitch, Claude Design, or generate assets. For *which tool*, see the **ui-design-tools** skill.

## The spine: DESIGN.md is the source of truth

Every capable design tool in 2026 — Stitch, Claude Design, ui-ux-pro-max, awesome-claude-design —
converges on a single artifact: a **`DESIGN.md`** at the repo root that names the design system
(atmosphere, color, type, spacing, motion, components, anti-patterns). Adopt it as the one place the
system lives, so every screen and every tool reads/writes the same tokens instead of drifting.

- **No `DESIGN.md` yet?** Create one *before* building UI. Use `resources/design-md-template.md` as the
  skeleton and fill it from the product's real subject and the brand, not from defaults.
- **Has one?** Read it first and build to it. If a screen needs a token the system lacks, add it to
  `DESIGN.md` first, then use it — never invent a one-off color/font/spacing inline.
- It pairs with `NORTH_STAR.md` (what the product is for) — `DESIGN.md` is *how it looks and feels*.

## The loop: references → diverge → critique → render & pick → build → iterate → verify

Do **not** start writing UI code from the prompt, and do **not** design in prose alone — a model judges
rendered UI far better than it imagines it. Run this loop (extends Anthropic's frontend-design
two-pass method with references, rendered variants, and screenshot iteration):

0. **Ground in references.** Ask for 1–3 references (screenshots, or named sites/apps to be in the
   family of) and extract the *actual* system from them — palette, type feel, density, shapes. No
   references? Offer the aesthetic-families menu (`resources/aesthetic-families.md`) and pick one
   deliberately. Taste transfers through examples, not adjectives.
1. **Pass 1 — diverge.** Sketch **2–3 genuinely different directions** (different families or different
   signature moves — not three tints of one idea). Each direction: the thesis (what is this product,
   who is it for), a small token set — 4–6 named hex colors, 2+ type roles, a spacing scale — and one
   *signature* element (a layout move, a motif, a motion idea) that makes it recognizable.
2. **Pass 2 — self-critique each.** Ask: *"Would I produce this exact design for any other product in
   this category?"* If yes, it's a default, not a choice — push it further. Run the anti-slop bans in
   `resources/anti-slop.md`. Then remove one thing from each survivor (the "take one accessory off
   before you leave" rule).
3. **Render the survivors and let the person pick.** Throwaway single-file HTML mockups of the most
   representative screen — real tokens, honest content, no build system. Screenshot them side by side;
   the person chooses with their eyes, not from prose. The pick (plus anything they liked from the
   losers) becomes the locked `DESIGN.md`. Small additions to an existing, already-chosen system skip
   the variants.
4. **Build** to the locked `DESIGN.md`. Tokens come from the system, never hardcoded per component.
5. **Iterate with eyes open.** At least two rounds of build → render → screenshot → critique → fix
   for new UI (a small change that renders clean in one round is done); stop when a round yields no
   fixes (see "Verify the result").
6. **Verify** before calling it done.

## Priority-tiered rules (fix in this order)

When time or attention is limited, resolve higher tiers first. A beautiful UI that fails Tier 1 is *Not yet*.

Lower tier number = fix first. Tier 1 is CRITICAL; a Tier-1 miss is always *Not yet*.

| Tier | Category | Non-negotiables |
|---|---|---|
| **1** | Accessibility | Text contrast ≥ 4.5:1 (3:1 for large/UI). Visible focus states. Labels on inputs. Respects `prefers-reduced-motion`. Keyboard-operable. |
| **1** | Touch / target | Interactive targets ≥ 44×44px; adequate spacing between them. |
| **2** | Layout & hierarchy | One clear primary action per view. Deliberate alignment and grouping. Meaningful empty/loading/error states (never a blank or a dead-end). |
| **3** | Style & identity | Adheres to `DESIGN.md`. Passes the anti-slop bans. Has the signature element. |
| **4** | Type & color | Type scale with real hierarchy; max ~1 accent color; restrained saturation. |
| **5** | Motion | Animate `transform`/`opacity` only; 150–300ms; purposeful, not decorative. |

Full bans, quantified dials, and the AI-fingerprint→fix table live in **`resources/anti-slop.md`** —
read it during Pass 2. The bans are subtractive; the *generative* counterpart — named aesthetic
directions with token starting points — lives in **`resources/aesthetic-families.md`**, read it at
step 0/1 when no references are given.

## Microcopy is design material

Labels, buttons, empty states, and errors are part of the design, not an afterthought. Use the
end-user's voice and active verbs; keep a label consistent with its toast/confirmation; make empty and
error states say *what to do next*. **Never fabricate data** — no fake metrics, uptime %, testimonials,
or logos to make a mockup look full.

## When to bring in a tool

Hand-writing components against `DESIGN.md` is the default and often the best path. Reach for an
external tool when it genuinely helps — first-draft exploration, multi-screen flows, or asset
generation — and let **ui-design-tools** route you to the right one (Stitch / Claude Design / Canva /
OpenAI image) and show how to bring its output back into the repo cleanly. Whatever a tool emits,
**re-normalize it to `DESIGN.md` and re-run Verify** — generated layout is a starting point, not the
finished, accessible, stateful UI.

## Verify the result

Verification is a **loop, not a single look**: with a screenshot tool available, run at least two
render → critique → fix rounds for new UI (a small change that renders clean in one round is done)
and stop when a round yields no fixes. No tool wired? Recommend one
plainly (it is the single biggest lever on UI quality) and ask the person to paste screenshots between
rounds — never silently degrade to prose-only judgment.

Before "done":
- **Looks:** screenshot the built UI and compare against the `DESIGN.md` intent, the chosen
  reference/family, and the anti-slop bans; check 2–3 viewport widths. Use a screenshot tool (e.g. a
  `browse`/Playwright skill) if one is available; if not, describe the gap and ask the person to paste a
  screenshot. Don't skip this step just because no tool is wired up.
- **Access:** contrast, focus, keyboard path, reduced-motion, target sizes (Tier 1).
- **States:** empty, loading, error, and long-content all render sensibly.
- Report readiness in plain words (Ready / Almost / Not yet) earned by what you found — a Tier-1 miss
  is always *Not yet*.

## Going deeper (optional external skills)

The pack carries the methodology embedded; for a larger knowledge base you can additionally install the
skills below (search them by name in your skills marketplace, or add the GitHub repo with your agent's
plugin/skill installer — e.g. `npx plugins add <repo>` for Claude Code):
- **`anthropics/skills` → frontend-design** — the canonical taste methodology.
- **`nextlevelbuilder/ui-ux-pro-max`** — queryable palettes/fonts/rules + persisted design-system DB.
- **`rohitg00/awesome-claude-design`** — a reference library of DESIGN.md systems by aesthetic family.

These are complements, not requirements — this skill stands alone.
