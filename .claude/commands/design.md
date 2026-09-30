---
description: UI/UX front door. Designs or reshapes a UI the right way — establishes a project DESIGN.md as the source of truth, grounds the look in references or a chosen aesthetic family, renders 2–3 directions so you pick with your eyes, iterates on screenshots so the result doesn't read as a generic AI default, routes to the right tool when generation helps (Google Stitch, Claude Design, Canva, OpenAI image), and verifies the built result (accessibility, states, looks). Proportional — a small styling tweak passes straight through. Loads the designing-uis and ui-design-tools skills.
argument-hint: [what you want to design, in plain words]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite
---

# /design — design the UI, deliberately

This is the front door for UI/UX work. The pack's default output is functional but plain; `/design`
produces UI that is **intentional, consistent, accessible, and not recognizable as an AI default** — and
it brings in an external design tool only when that actually helps. It drives two skills so you don't
have to know them: **designing-uis** (the methodology) and **ui-design-tools** (which tool + how to wire it).

> Serves the project's reason to exist: anyone, regardless of design skill, ends up with a UI that looks
> and works like someone made a choice. `/go` calls this automatically when a request is UI-shaped.

## Usage
```
/design <what you want to design>
```
`$ARGUMENTS` is the request in plain words (e.g. "a settings page", "make the dashboard feel less generic").

**Load the `designing-uis` and `ui-design-tools` skills now** — they carry the rules, the anti-slop bans,
the DESIGN.md template, and the per-tool how-to this command relies on.

## Step 1 — Right-size (don't over-engineer a tweak)

Restate the request plainly, then classify:
- **Trivial styling** — a color, a spacing fix, one label, an obvious tweak that already fits the system.
  → Just make it against the existing `DESIGN.md` tokens and stop. Say "small change — done."
- **Real UI work** — a new page/screen/component/flow, or "make X look good / less generic / less like AI
  made it." → Continue.

When unsure, lean to a quick pass; keep it proportional.

## Step 2 — Run the design method

For real UI work, follow the `designing-uis` skill as the authority, in order:

1. Read and follow **The spine: DESIGN.md is the source of truth**.
2. Run **The loop: references → diverge → critique → render & pick → build → iterate → verify**.
3. Apply its **Priority-tiered rules** and **Microcopy is design material** section while building.

Do not restate or alter those rules here. The skill owns the DESIGN.md contract, reference fallback,
variant count, anti-slop pass, build rules, screenshot cadence, real-state checks, and accessibility floor.

## Step 3 — Choose how to produce it (route to a tool only if it helps)

Use the `ui-design-tools` decision tree. Default is **hand-write against `DESIGN.md`** — often the best path.
Reach for a tool when it genuinely accelerates a step, and confirm the choice with the person if it adds a
dependency or an external account:
- **First-draft screens / multi-screen flow fast** → Google Stitch (`.claude/skills/ui-design-tools/resources/stitch.md`).
- **Visual prototype / round-trip with the team** → Claude Design (`.claude/skills/ui-design-tools/resources/claude-design.md`) — *detect
  it first; fall back if absent.*
- **Generated icons / illustrations / hero images** → OpenAI gpt-image (`.claude/skills/ui-design-tools/resources/openai-images.md`).
- **Marketing / brand-template assets** → Canva Connect (`.claude/skills/ui-design-tools/resources/canva.md`).

Whatever a tool emits is a **starting layout, not the finished UI**: re-normalize its tokens to `DESIGN.md`,
land assets in a versioned repo folder (never a temporary URL), keep API keys in env vars.

## Step 4 — Build

Build to the locked `DESIGN.md`. Tokens come from the system, never hardcoded per component. Microcopy is
design material — active verbs, consistent labels, empty/error states that say what to do next, and **never
fabricate data** (no fake metrics/logos/testimonials).

## Step 5 — Iterate with your eyes open (the quality lever)

Building blind is how UI ends up generic — a model judges rendered UI far better than it imagines it.
- With a screenshot tool available (a Playwright/browser MCP, a `browse` skill): **loop at least twice for
  new UI** (a small change that renders clean in one round is done) — build → render → screenshot →
  critique against `DESIGN.md`, the anti-slop bans, and the chosen reference/family → fix. Stop when a
  round produces no fixes, not after the first look.
- Critique at 2–3 widths, and the real states (empty / loading / error), not just the happy screen.
- **No screenshot tool?** Say so plainly and recommend wiring one (it is the single biggest lever on UI
  quality); fall back to asking the person to paste screenshots between rounds. Never silently skip iteration.

## Step 6 — Verify and report a readiness card

Run the `designing-uis` Verify step, then report in plain words:
- **Looks** — screenshot and compare to `DESIGN.md` + anti-slop bans at 2–3 widths (use a screenshot tool
  if available; otherwise ask the person to paste a screenshot — don't skip it).
- **Access (Tier 1)** — contrast, focus, keyboard path, reduced-motion, 44×44px targets.
- **States** — empty, loading, error, long-content all render sensibly.

Lead with **Ready / Almost / Not yet**, earned by what you found — a Tier-1 miss is always *Not yet*.

## Step 7 — Keep DESIGN.md honest

If the work introduced or changed a token, update `DESIGN.md` (merge, never clobber) and show the change, so
the next screen and the next tool inherit it.

## Hard rules
- **DESIGN.md is the contract.** Add a token there before using it; re-normalize any tool's output back to it.
- **Design with eyes, not prose alone.** Render variants before committing to a direction; iterate on screenshots before reporting readiness.
- **Tier 1 (accessibility/touch) is non-negotiable.** A beautiful UI that fails it is *Not yet*.
- **Proportional.** A styling tweak doesn't need the whole loop. A new UI does.
- **Recommend, never impose.** Confirm before adding a tool/dependency or an external account; the person decides.
- **Plain language, honest readiness.** No jargon; never inflate the grade; never fabricate content or data.
