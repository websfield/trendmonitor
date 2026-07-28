---
name: validate
skillVersion: 1.0.0
description: Run the deterministic editorial gate over a PlatformEDL and, separately, an advisory LLM critic — keeping blockers and advisories in two persisted outputs (D-37).
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
  - creative-brief-v1
  - moment-v1
  - platform-edl-v1
  - style-profile-v1
sideEffects: [reads-project-data, writes-project-data, network]
timeoutSeconds: 300
---

# validate — deterministic gate + advisory critic

Implements tech-spec §7's `cutdown validate <platform-edl-id>` and PRD REQ-037.
The deterministic gate (`@cutdown/qa`) owns EVERY blocking decision; the LLM critic
is advisory evidence only (decisions.md D-37). The two are kept apart by design.

## What it does

1. Loads the PlatformEDL, its referenced Moments, the JobBrief, the (optional)
   StyleProfile and CreativeBrief, and the TikTok capability fixture.
2. Runs `runDeterministicGates` — quote fidelity, prohibited claims, required
   evidence & context, rights, disclosures, capability, and every source range.
   Writes the result to `reviews/<edlId>-gate.json`.
3. Runs the LLM critic over coherence / first-frame / redundancy / context /
   abrupt-audio / caption-overload / style-fit / originality / policy /
   platform-readiness, and writes it to `reviews/<edlId>-critic.json`.
4. Returns both paths and the overall `gateStatus`, which comes **only** from the
   deterministic blockers. A critic finding NEVER becomes a blocker.

## Two persisted outputs, never merged

The blockers file and the critic file are separate artefacts. `gateStatus` is
`pass`/`fail` from the deterministic blockers alone — a `fail` is a valid result,
not a skill error, so the skill still exits 0. When the gateway is unconfigured,
the deterministic gate STILL runs and returns its verdict (blockers need no model);
the critic half is reported as skipped-with-reason.
