---
name: package
skillVersion: 1.0.0
description: Assemble the deliverable ContentPackage from an approved, QA-passed final render — master, caption sidecars, cover and first frame, rights manifest, disclosures, QA report, range-validation evidence, contract set and full provenance.
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
  - source-asset-v1
  - platform-edl-v1
  - render-manifest-v1
  - render-v1
  - render-v2
  - technical-qa-report-v1
  - qa-waiver-v1
  - review-decision-v1
  - content-package-v1
sideEffects: [reads-project-data, writes-project-data]
timeoutSeconds: 600
---

# package — the last gate on the exit path

Implements tech-spec §15 step 8 (second half) and PRD REQ-088 (Phase-0 subset) /
REQ-103 / REQ-105 / REQ-163 / REQ-164 record-level.

This is where two of the four Phase 0 exit criteria become measurable — *at least
20 approved real outputs across 3 accounts* and *rights records and QA reports
accompany every delivered package* — so `cutdown status --phase0` reads
ContentPackages and **nothing else**. Every field the skill writes is an evidence
field, and every refusal below exists because a package that lacked that evidence
would still be counted.

## What it refuses

Each refusal cites the IDs it is refusing on, so nobody has to guess what to fix.

| Refusal | Why |
|---|---|
| A **draft** render | A draft is not a master (D-34). Its media is a proxy and it carries a burned-in version identifier. |
| A render with **no approval in force** | tech-spec §15 step 8's order. `resolveApprovalForManifest` is the single implementation. |
| A render whose approval is a **rejection** | Distinct from "no approval": a human looked and said no, and the next step is `cutdown revise`. |
| A render whose approval names a **different manifest or EDL** | Approving one cut never authorises another (REQ-113). |
| **Editorial divergence** — the final and approved-draft `editorialPlanHash` differ | Someone edited after sign-off. This is the check that makes "the delivered cut is the cut that was approved" a fact rather than a hope. |
| **Failed final QA** | D-35. `content-package-v1` does not even admit `gateStatus: "fail"`, so the state is unrepresentable rather than merely rejected. |
| A **waived blocker** | Non-waivable (D-35) — and already rejected at the render, so reaching here would mean a hand-edited report. Re-derived from the findings, never read off the stored status. |
| A **skipped or errored** range check | Absence of evidence is not evidence. `rangeValidation.status` is fixed at `ran` by the contract. |
| **Unknown, restricted or expired rights** on any asset | REQ-003/REQ-103, non-waivable. `unknown` refuses on the same footing as `expired`: an absent record is the worst case, never the benign one. |
| **Missing evidence** — no final manifest, no QA report, no JobBrief, an unresolvable lineage | Every one would produce a package asserting something it cannot show. |

A **warning waiver** is accepted, carried in full, and counted separately — that
is what D-35 asks for, and `status --phase0` reports waived packages apart from
clean ones.

## What it produces

An atomic directory under `packages/<contentPackageId>/`: staged beside the
target and renamed into place, so a crash mid-assembly can never leave a
half-package that a later count would treat as a delivered output.

```text
packages/<contentPackageId>/
  package.json      the ContentPackage (content-package-v1)
  master.mp4        the final-tier master, copied from the render
  captions.srt      REQ-104: a caption FILE exists even for a burned-in master
  captions.vtt
  cover.png         REQ-055 — its SOURCE is recorded, so a defaulted cover
  first-frame.png   can never present as a chosen one
  edl.json          the PlatformEDL the cut realises
  qa-report.json    the final render's technical QA report
```

`releaseState` (REQ-105) is **computed, never passed in**: `rights_approved` when
every asset resolves `cleared` with evidence, otherwise `editorially_approved`.
The skill never writes `publish_ready` (REQ-088's post copy, hashtags and alt text
are product Phase 1 — REQ-054) or `published` (Stage B+), because it cannot
substantiate either.

## Out of the Phase-0 subset

Platform derivatives, clean/dialogue-only audio stems, post caption and hashtags,
alt text, first comment, and OpenTimelineIO export. They are **absent** from
`content-package-v1` rather than present-and-null, so a Phase 1 addition is a
compatible change and an empty field can never be misread as "none needed".
