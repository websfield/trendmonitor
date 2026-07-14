---
name: ui-design-tools
description: Use when deciding which design/asset tool to reach for or how to wire one into a project — generating UI screens or a first-draft layout (Google Stitch), prototyping or round-tripping a design with Anthropic's Claude Design, producing marketing/brand assets at scale (Canva Connect API), or generating images/icons/illustrations (OpenAI gpt-image). Gives a which-tool decision tree, the technical how-to per tool (install/auth, getting assets into the repo, gotchas), and the rule that all output is re-normalized to DESIGN.md. For the design methodology itself, see the designing-uis skill.
---

# UI design tools — which one, and how

Picking the right tool matters more than the tool. This skill routes you and carries the technical
know-how to use each one *and bring its output back into the repo cleanly*. The methodology (taste,
anti-slop, the DESIGN.md spine, verification) lives in **designing-uis** — read that first; this is the
"now I need to generate something" layer.

## Decision tree — what are you producing?

```
What do you need?
├─ App UI: a page / screen / component for the product
│   ├─ Know the design + want full control  → hand-write it against DESIGN.md (default, best)
│   ├─ Need a first-draft layout or a multi-screen flow fast  → Google Stitch        (resources/stitch.md)
│   └─ Want to prototype visually / round-trip with the team  → Claude Design         (resources/claude-design.md)
├─ A raster asset: icon, illustration, hero image, texture, mockup
│   └─ Generate from a prompt, into the repo  → OpenAI gpt-image                       (resources/openai-images.md)
└─ Marketing / social / brand-template artifact at scale (PNG/PDF, human-editable)
    └─ Canva Connect API                                                               (resources/canva.md)
```

Quick gut-check: **product UI** → code / Stitch / Claude Design. **Generated imagery** → OpenAI gpt-image.
**Brand & marketing collateral** → Canva. None of these designs a real, stateful, accessible app *for*
you — they accelerate a step.

## Tool summary

| Tool | Best for | Output → repo | Cost / gate | Resource |
|---|---|---|---|---|
| **Google Stitch** | Fast text/voice/image → UI screens; multi-screen first drafts | HTML/CSS, React+shadcn via **stitch-skills + Stitch MCP**; paste-to-Figma | Free + Google account; monthly gen caps; MCP needs a GCP project w/ Stitch API | `resources/stitch.md` |
| **Claude Design** | Visual prototyping + **bidirectional round-trip with Claude Code**; importing a design system | Design ↔ code via the design-sync flow / handoff bundle | Anthropic Labs product; account-gated | `resources/claude-design.md` |
| **OpenAI gpt-image** | Generated icons / illustrations / hero / textures | API → decode `b64_json` → write bytes to asset dir | Pay per image (`gpt-image-2`/`1.5`); no free tier | `resources/openai-images.md` |
| **Canva Connect** | Marketing/social/brand-template batches, human-editable | Export job → poll → download (24h URLs) → commit | Free to build; **autofill needs Enterprise**; no SVG | `resources/canva.md` |

## Cross-cutting rules (apply to every tool)

1. **DESIGN.md is the contract.** Feed the tool your tokens where it accepts them; re-normalize whatever
   it returns back to `DESIGN.md`. A tool that drifts from the system (Stitch is prone to this) gets
   reconciled, not accepted as-is.
2. **Generated code is a layout, not the app.** Re-wire state/routing, add accessibility, verify
   responsive, and re-run the **designing-uis** Verify step. Never ship generated markup unreviewed.
3. **Assets land in the repo deterministically.** Write generated images/exports to a versioned asset
   dir (e.g. `src/assets/…` or `public/…`) with stable, slugged filenames; commit them. Never depend on
   a hosted/temporary URL (Canva download URLs expire in 24h; OpenAI returns base64, not a URL).
4. **Secrets stay out of the code.** API keys (OpenAI, Canva OAuth, Stitch/GCP) go in env vars with a
   `.env.example` placeholder — the guardrail hook will block a committed key literal.
5. **Pin model/API versions in config, not inline.** Especially OpenAI image model ids (`gpt-image-1`
   sunsets ~Oct 2026) — make the id a config value so a deprecation is a one-line change.

## How to use a tool resource

Open the matching `resources/<tool>.md` only when you've chosen that tool — it has the current install/
auth steps, the minimal API/MCP shape, the "into the repo" sequence, and the gotchas to avoid. The files
are deliberately concise; verify version-sensitive facts (caps, model names, scopes) against the tool's
live docs, which the resource links.
