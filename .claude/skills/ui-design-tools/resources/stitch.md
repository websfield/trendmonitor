# Google Stitch — UI generation

> ⏱ **Time-sensitive (captured 2026).** Caps, pricing, install commands, and API/MCP details change —
> confirm against the linked docs before relying on them.

AI UI design tool from Google Labs (Gemini-powered): text/voice/image → high-fidelity web & mobile
screens, multi-screen flows. Best for **fast first drafts and exploration**, not production-final or
design-system-strict work. Live app: https://stitch.withgoogle.com · Docs/skills: https://github.com/google-labs-code/stitch-skills

## When to reach for it
- Greenfield screen exploration; turning a prompt/sketch/screenshot into a first layout.
- Generating a multi-screen flow for a feature to react to.
- **Not** for: production-final code, complex stateful UX, or strict design-system consistency.

## The developer path (preferred): stitch-skills + Stitch MCP
The real "into the codebase" story is the official Agent Skills + MCP server, not copy-paste from the web app.

1. **Install the skills** (Claude Code / Cursor): `npx plugins add google-labs-code/stitch-skills`
   (Codex: `codex plugin marketplace add google-labs-code/stitch-skills`). Groups: `stitch-design`
   (screen gen, HTML extraction, asset upload), `stitch-build` (React / React Native + shadcn/ui),
   `stitch-utilities` (spec gen, design-quality, design-md).
2. **Configure the MCP server**: needs a **Google Cloud project with the Stitch API enabled** + an API
   key in `.mcp.json`. (The API itself is currently free.) Setup ref: https://justinmckelvey.com/blog/google-stitch-mcp
3. **Generate / pull**: common MCP tools — `build_site` (assemble screens → routes/structure),
   `get_screen_code` (raw HTML for one screen), `get_screen_image`. Skills download assets to
   `.stitch/designs` and track `.stitch/metadata.json`.

**No Google Cloud project (or MCP setup is too much right now)?** The MCP path is the convenience, not a
requirement — use the web app and export instead: **HTML/CSS (Tailwind)** or **paste-to-Figma** (Auto
Layout preserved). You still get the screens into your repo, just by hand.

## Feed it the design system
- Supply a **theme / `DESIGN.md`** up front (colors, type, spacing) to reduce drift.
- Per stitch-skills convention: set tokens at the **project/design-system level**; do **not** put hex
  codes or font names in per-screen *generation* prompts (hex is only for *edit* calls). Tokens belong
  to the system, not the screen.

## Gotchas (important)
- **Design-system drift is the #1 issue.** Across screens Stitch changes icons, nav, or flips dark mode
  unprompted, even with a DESIGN.md. → **Lock the design before handoff**; diff screens and reconcile
  tokens back to your `DESIGN.md`.
- **Output is layout, not an app** — no state/routing/business logic; verify a11y + responsive yourself.
- **Generic by default** — push past the first "safe" result; weak on edge/empty/error states.
- **Generation quotas** on the free tier (figures vary, ~hundreds/mo) — heavy iteration burns them.
- **Single-user**, no real version history (unlike Figma).

## Bring it back into the repo
1. Pull code via `get_screen_code` / `build_site` (or export HTML/CSS).
2. Re-normalize every token to `DESIGN.md`; replace any inline hex/font with system tokens.
3. Re-wire state/routing; commit one screen's-worth at a time.
4. Run the **designing-uis** Verify step (looks / access / states).

## Where it fits vs alternatives
Stitch = exploration + generous free tier; **v0 (Vercel)** = more production-ready React/Next but stingy
free tier; **Figma AI** = team collaboration. A common pipeline: **Stitch (explore/screens) → Cursor/
Claude/v0 (production component code)**, or stay in-agent via the Stitch MCP.
