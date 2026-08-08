---
name: revise
skillVersion: 1.0.0
description: Interpret a reviewer's free-form note into structured constraints and regenerate the narrowest affected object — a caption fix never spawns a new creative brief, and the source index is never rebuilt.
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - platform-edl-v1
  - render-v1
  - review-decision-v1
sideEffects: [reads-project-data, writes-project-data, network]
timeoutSeconds: 300
---

# revise — the narrowest change that satisfies the note

Implements PRD REQ-039 / REQ-112 / REQ-113 and tech-spec §4's revision stage.

## Narrowness is the whole point

REQ-039: *free-form notes produce a new brief, story plan, or EDL revision **while
reusing unchanged source indexes***. "Tighten the opening" is a trim. "Fix that
caption" is a caption. Regenerating a `CreativeBrief` for either would discard the
story plan, the EDL, the approved draft and every review decision attached to
them — and would do it invisibly, because the resulting pipeline would still be a
valid one.

So the target is **computed, not chosen by the model**. `selectTarget()` maps the
constraint kinds to the widest object any of them forces, and records why. The
model's job stops at interpretation: "which object do we rewrite" decides how much
approved work is thrown away, and that is not a judgement to delegate to a sampler.

| Constraint kinds | Object regenerated |
|---|---|
| `caption_text`, `clip_trim`, `clip_order`, `clip_remove`, `clip_replace`, `aspect_treatment`, `cover_frame` | `PlatformEDL` |
| `beat_structure`, `pacing` | `MasterStoryPlan` |
| `angle`, `audience_promise`, `cta` | `CreativeBrief` |

## The interpretation is checkable

REQ-112 requires the interpreted constraints to be *shown*. Every constraint
carries a `sourceText` that must be a **verbatim substring** of the reviewer's
note — an exact check with no threshold to argue about. A paraphrased `sourceText`
would let a constraint the reviewer never asked for look like one they did, which
defeats showing it.

A note fragment that cannot be pinned to an object goes to `unresolved`, and the
skill returns `needs_confirmation` rather than a revision. A guess here silently
re-cuts somebody's approved video.

## No re-index

Nothing in this skill reads or writes `index/` or `moments/`. The proof is a test
assertion (index artefact mtimes unchanged across a revision), not this sentence —
re-indexing is the slow, model-spending path, so the incentive to skip the check
runs the wrong way.

## Lineage

Every revision is a NEW object with `parentEdlId` (or the equivalent parent link)
set, and the previous version stays on disk and reproducible (REQ-113). Nothing is
mutated in place, and a rejected draft's EDL remains exactly what was rejected.

## Degraded behaviour

| Boundary | Failure | Behaviour |
|---|---|---|
| Gateway unconfigured (no key / no D-21 ceiling) | — | Clean `skipped` result, exit 0. The Phase 0 default. |
| Model output schema-invalid ×2 | one repair retry, then stop | Structured error; **no artefact written**, originals untouched. |
| Note unresolvable | — | `needs_confirmation`, naming what could not be pinned. |
