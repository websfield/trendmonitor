---
name: approve
skillVersion: 1.0.0
description: Record one named human's immutable review decision about a reviewed draft render — approving it (which alone authorises a final render) or rejecting it with a reason (which leads only to revision).
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - render-v1
  - render-v2
  - render-manifest-v1
  - technical-qa-report-v1
  - review-decision-v1
sideEffects: [reads-project-data, writes-project-data]
timeoutSeconds: 60
---

# approve — the human act, recorded with a name

Implements tech-spec §15 step 8 (first half) and decisions.md **D-9**: there is no
review UI at Phase 0. `cutdown approve <draft-render-id> --by <name>` writes a
`ReviewDecision` to `reviews/`, and that record is the only thing in the system
that can authorise a final render.

## What it is a decision *about*

The subject is the reviewed **draft render** plus the exact `PlatformEDL` and
`RenderManifest` revisions it realised, and the render's `planHash`. Four ids, not
one, because "approved" has to mean *this cut, as it stood*: a later EDL revision
creates a new object (REQ-113) and must not inherit this approval.

There is **no package field**, and the schema's `additionalProperties: false`
makes that structural rather than a convention. At the moment of approval no
package exists; a decision that pointed at a future one would invert the lineage
the Phase 0 exit criteria are computed over.

## What it refuses

| Refusal | Why |
|---|---|
| A render that is not `draft` tier | Approval is of a draft. A final render is a *consequence* of approval; approving one would make the ordering circular. |
| A draft whose QA gate does not allow advance | D-35's blockers are non-waivable **by anyone**, including an approver. The runner's transition gate already refuses to enter this step; enforcing it here too is what stops the direct CLI call being a documented bypass — one rule, both callers. |
| An approval with no `--by` name | D-9. An approval nobody's name is on is not an approval. |
| A rejection with no `--reason` | The rejection path leads to `revise`, and a revision needs something to interpret. The schema enforces this too. |

A **rejection** is always recordable, including for a QA-failed draft — rejecting a
broken cut is exactly what a reviewer should be able to do.

## Duplicate and conflicting decisions

Decisions are immutable and never overwritten: a second thought is a second
record. Which one is *in force* is computed by `selectLatestDecision()` in
`@cutdown/contracts` — ordered by `decidedAt`, then by `reviewDecisionId` (a ULID,
so the pair is a total order and ties are impossible). Every reader — this skill,
`render`, `package`, and `status --phase0` — uses that one implementation, because
a second sort rule would be a second answer to "is this approved?".

The latest decision wins **whatever it says**. An approval does not outrank a
later rejection; a reviewer who changes their mind must be able to record it.
