# Stage 2 — Local Review Studio (OUTLINE)

**Governing PRD phase:** Phase 1. **Depends on:** Stage 0.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` for this stage when Stage 0 is proven complete on disk. Do not implement from this file.

---

## Why this is an outline

Task-level detail written now would be wrong on arrival. What is fixed and binding today is the *objective*, the *requirements*, the *exit gate*, and the *risks that must not be discovered late*. Those are below.

## Objective

A Social Soup producer completes the whole job — footage in, packaged output approved — **in a browser, without a terminal and without Claude Code**.

## Requirement bindings

REQ-110 (side-by-side variant review) · REQ-111 (structured controls: lock/replace/ban moments, correct speaker names and captions, alternative hooks, crop anchors, prohibited claims) · REQ-112 (natural-language revision with interpreted constraints shown) · REQ-113 (immutable lineage) · REQ-114 (approval roles) · REQ-105 (release state) · REQ-106 (actionable failure report) · REQ-107 (device/feed simulation) · D-13 (`skills serve` transport, promoted here from optional stretch to requirement).

## The honest size of this stage

Verified 2026-08-08: **zero** matches for `express`, `fastify`, `http.createServer` or `react` across every `package.json` in the cutdown workspace. There is no HTTP layer, no frontend, no design system, no `DESIGN.md`, and no auth model. This stage is **a new product surface**, not a view over an existing one.

Additionally, video review is not CRUD. Frame-accurate scrubbing, platform-overlay simulation, and caption correction against burned-in output are each genuinely hard, and the PRD asks for all three.

## Exit gate (PASS/FAIL)

| # | Criterion |
|---|---|
| C1 | A producer who has never used the CLI completes upload → rights intake → brief → variants → review → approval → package, with **no terminal access**, observed |
| C2 | Time from indexed footage to first review-ready draft ≤ **20 min p50** (PRD §14.1) |
| C3 | End-to-end time to approved package < **45 min p50** including review (PRD §14.1) |
| C4 | **Each REQ-111 control names the contract it writes, and that contract exists.** Verified at the round-1 gate: `review-decision-v1` has nine properties and none of them is a lock, ban, replacement, crop anchor, speaker-name correction, timecoded note or prohibited claim; `skills/revise` takes a free-form note and declares no output properties. **No revision-constraints contract exists today**, so "writes only artefacts the skills already define" was unsatisfiable as round 1 worded it. Those contracts are added under tech-spec §3 **before** the UI task |
| C4b | The serve package is **stateless**: delete its runtime directory and the job replays identically. This is the mechanism behind "not a second source of truth"; a reviewer is a gate, not a mechanism |
| C4c | A browser approval still records a **named human** — `decidedBy` never defaults. Approval is the only authority gate cutdown has, and this stage moves it into a single-user UI with no identity model |
| C5 | A revision creates a new linked object; the previously approved version remains reproducible (REQ-113) |
| C6 | Overlay simulation matches the effective-dated capability data, not a hand-drawn approximation |
| C7 | `DESIGN.md` exists and the built UI verifies against it (accessibility, states, looks) — via `/design` |

## Risks that must not be discovered late

0. **C2 and C3 are latency percentiles, and nothing currently measures latency.** PRD §14.1 sources both from "workflow telemetry, segmented by source minutes and worker class". The local runner writes a run log and `events-*.jsonl`, but nothing aggregates a p50. **Job timing telemetry is a task of this stage, not an assumption of it** — and it must be in place before the observed run in C1, or C2/C3 are unmeasurable at the moment they are supposed to be measured.
1. **The studio becomes a second source of truth.** Any state the studio holds that the artefacts do not is a fork. Its only writes are `ReviewDecision` and revision constraints. This is what the Stage-0-authored `cutdown-tenancy-boundaries` reviewer gates.
2. **Scope balloon.** The exit criterion is a thin slice — one producer, one complete job — not a feature-complete editor. Reach for the platform-native option before writing a component library (`keeping-it-lean`).
3. **Determinism leak.** Preview rendering must not become a second renderer with different output from the real one.
4. **Auth deferred wrongly.** Local-only single-user is acceptable *here* and becomes a migration cost in Stage 7. Name the boundary now so Stage 7 does not have to retrofit identity through every write path. **"Name it" must become a criterion, not a risk bullet** (round-1 gate finding): this stage must define the workspace-scoped read/write path even while there is exactly one workspace, because Stage 0 is the program's one deliberate breaking bump and adds no workspace identity — D-36's own revisit trigger already anticipates replacing owner-issued account IDs with workspace IDs. Without it Stage 7 gets a retrofit or a third breaking bump, both of which the plan says will not happen.
5. **Stop Condition 4 fires at this stage's planning too.** An HTTP framework, a frontend framework and a design system are three new core dependencies. The program requires decision records before task-planning Stage 7 and said nothing about Stage 2 — while sequencing Stage 2 first. Each needs a `decisions.md` row before this stage is task-planned.

## Out of scope

Publishing. Multi-tenant workspaces. Hosted deployment. All Stage 7 or PRD Phase 2.
