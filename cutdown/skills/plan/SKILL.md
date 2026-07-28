---
name: plan
skillVersion: 1.0.0
description: Turn one approved CreativeBrief into a MasterStoryPlan and a TikTok PlatformEDL, validating structure and every source range deterministically.
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
  - creative-brief-v1
  - moment-v1
  - master-story-plan-v1
  - platform-edl-v1
sideEffects: [reads-project-data, writes-project-data, network]
timeoutSeconds: 300
---

# plan — story plan + platform EDL

Implements tech-spec §7's `cutdown plan <creative-brief-id> --platform X` and PRD
REQ-033/050/052. The MODEL PROPOSES the narrative graph and the timeline;
deterministic code VALIDATES structure and every source range (decisions.md D-37).

## What it does

1. **Refuses any platform except `tiktok`** (D-3, `assertPhase0Platform`) — no
   fallback to a generic profile; only TikTok has a Phase-0 capability fixture.
2. Loads the CreativeBrief, the JobBrief (for objective/distribution/locale), the
   Moments, and the TikTok capability fixture (`data/platform-capabilities/…`).
3. Gateway-generates a **MasterStoryPlan**, validated against
   `master-story-plan-v1` AND `validateStoryPlanStructure` (every beat fills a
   selected Moment, order is a contiguous permutation, dependencies reference real
   beats) — all inside the gateway validator, so a bad response gets D-32's one
   repair.
4. Gateway-generates a **PlatformEDL**, then runs `resolveEdl` — the single bounds
   validator. An out-of-bounds source range is a HARD FAILURE, never clamped.
5. Writes the MasterStoryPlan to `story-plans/` and the PlatformEDL to `edl/`, and
   returns both ids plus the deterministic validation result.

When `recordedModelPath` is given the gateway replays a captured response over an
injected transport — never the network. When the gateway is unconfigured, the
skill returns a clean `skipped` result rather than attempting a paid call.
