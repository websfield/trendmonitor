---
name: render
skillVersion: 1.0.0
description: Render one PlatformEDL to a draft (proxy) or final (source-original) video with burned-in open captions, an SRT/WebVTT sidecar pair, and a technical QA report — the hard gate no render passes without.
entrypoint: ["node", "dist/src/main.js"]
execution: async
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - platform-edl-v1
  - source-asset-v1
  - style-profile-v1
  - render-manifest-v1
  - render-v1
  - technical-qa-report-v1
  - qa-waiver-v1
sideEffects: [reads-project-data, writes-project-data]
timeoutSeconds: 1800
---

# render — draft and final tiers, with QA as a hard gate

Implements tech-spec §15 steps 6–7 and PRD REQ-080–087 / REQ-100 / REQ-104–106.

`execution: async` even though the Phase 0 local runner simply waits. The marker
is Stage C truth (tech-spec §10): the HTTP surface returns 202 + an operation
handle for exactly the skills marked async, and the generated OpenAPI is honest
about which those are only because the registry says so here. Marking it `sync`
now would be a lie that costs a contract change later.

## The two tiers (decisions.md D-34)

| | `draft` | `final` |
|---|---|---|
| media | proxy (D-25) | source-hashed originals |
| visible version identifier | burned in, top-left | none |
| CRF / audio bitrate | 26 / 128k | 20 / 192k |
| authorisation | none needed | **requires an approved draft** |

Both manifests carry the same `editorialPlanHash` — they realise one editorial
plan. The final links `approvedDraftManifestId` and may differ from the approved
draft only in tier, media and encode fields; `assertFinalMatchesApprovedDraft()`
checks the rest, including the caption content hash.

**A `final` render without a matching approval is refused.** There is no flag to
bypass it. The approval is a file a human wrote (`reviews/<manifestId>-approval.json`,
written by the Phase 5 `approve` skill); its absence is not an edge case, it is
the ordering rule tech-spec §15 step 8 exists to enforce.

## QA is a gate, not a report

Every render is measured and gated in the same invocation. The skill exits 0 with
a `fail` gate status — a failed gate is a *result*, not a skill error, exactly as
`validate` treats a failed editorial gate. What the runner does with a `fail` is
the runner's decision (it refuses to advance); what this skill guarantees is that
no render exists without a report beside it.

Blockers are non-waivable (D-35). A waiver naming a blocker is **rejected**, not
ignored — ignoring it would leave the operator believing a finding was accepted.

## Determinism

Tier 1 only (tech-spec §12): byte-identical on the pinned local environment
(D-33). The encode pins `-threads 1`, `-fflags/-flags/-flags:a +bitexact` and
`-map_metadata -1`; the manifest records all of them. Cross-machine byte
identity is not claimed and its test would be spec-forbidden.
