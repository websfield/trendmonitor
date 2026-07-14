# Claude Design — visual prototyping + code round-trip

Anthropic's first-party visual-creation product (Anthropic Labs), launched April 2026 with a major
update June 2026. It is the **in-house** design path: prototype visually, import a design system, and
**round-trip bidirectionally with Claude Code**. Official: https://www.anthropic.com/news/claude-design-anthropic-labs

> ⏱ **Time-sensitive (captured 2026).** This is a fast-moving Labs product — availability, command names,
> and the round-trip flow change. Confirm against the official docs, and **detect before you rely on it**
> (see step 1).

Don't confuse three related things:
- **Claude Design** — the dedicated visual-design *product* (this file).
- **claude.ai Artifacts** — live-rendered React/HTML *in chat*, good for quick throwaway UI prototypes.
- **Claude generating frontend code** in Claude Code — the everyday "hand-write it" path, guided by the
  **designing-uis** skill. (Stitch/Canva/OpenAI are *external* tools; Claude Design is first-party.)

## When to reach for it
- You want to prototype a UI visually and then pull it into the codebase (and push code changes back).
- You have an existing **design system to import** (incl. from a GitHub repo) and want to design against it.
- Team/stakeholder review of visuals before committing to code; exporting to Canva/PDF/PPTX/HTML.

## The round-trip (the differentiator)
> These commands/flows exist **only inside the Claude Design product**. If `/design` (or a DesignSync-type
> tool) isn't present in your environment, you're not in it — don't try to invoke them; use the fallback
> in "How to use" step 1 (Stitch, or hand-write against `DESIGN.md`).

- Design-system imports (including from GitHub) keep the visual work on your real tokens.
- **Bidirectional code round-trip with Claude Code**: a design ↔ code sync / "handoff bundle" flow
  (surfaced as `/design` + design-sync style commands, and a `DesignSync`-type tool where the
  environment exposes it). Design changes flow to code and code changes reflect back, so the design
  doesn't rot the moment engineering starts.
- Exports: Canva, PDF, PPTX, HTML.

## How to use it in this workflow
1. **Check availability first.** It's an account-gated Labs product and a `DesignSync`/`/design` tool may
   or may not be present in a given environment (e.g. headless/CI runs often won't have it). If it's not
   available, fall back to **Stitch** for generated screens or hand-write against `DESIGN.md`.
2. **Seed it with your system.** Import the project's design system / `DESIGN.md` (or the GitHub repo) so
   it designs on your tokens, not generic defaults.
3. **Prototype** the screen/flow visually; iterate with stakeholders.
4. **Round-trip into code** via the design-sync flow; then treat the result like any generated UI —
   re-normalize to `DESIGN.md`, wire state/routing, and run the **designing-uis** Verify step.

## Gotchas
- **Availability/gating** is the main one — never assume the tool exists; detect, then fall back.
- It is a *design* surface: the round-tripped code still needs engineering (state, data, a11y, tests).
- Keep `DESIGN.md` authoritative — if Claude Design and the repo disagree on a token, reconcile in
  `DESIGN.md` and re-sync, rather than letting the two drift.

## Bring it back into the repo
- Use the design-sync flow to land code; commit the synced design system changes to `DESIGN.md`.
- Verify (looks / access / states) before done.
