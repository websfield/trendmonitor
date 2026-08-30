# Slice 3b: Interview + complete Creator Brain

## A creator can…
**Answer a structured interview, review Voice + Strategy + Kill Test + a declared north-star metric, correct them, and activate one coherent Creator Brain.**

That sentence is the acceptance test and is walked from a new profile in a browser. Slice 3 proved
evidence-backed voice inference; it did not satisfy M2's structured interview or create the Strategy
and Kill Test documents required by the PRD and build plan. M2 is not complete until this slice ships.

## Requirements owned here

- PRD **B01**: goals, positioning, north-star metric, banned words/vibes and ambitions are collected as structured creator-authored answers.
- PRD **B03**: the north-star metric is explicitly declared during onboarding and can later be changed through slice 5's normal versioned edit path.
- Build-plan M2: Voice, Strategy and Kill Test are editable, reviewable, confirmable and activatable as a coherent brain.
- PRD **B04** is explicitly owned by slice 7: onboarding ends with a "Create my first three ideas" action into the Studio's Ideation mode. It is not silently claimed by this slice.

## Prerequisites

- [ ] Slice 3 is closed and its confirm/activate path is the only confirmation path reused here.
- [ ] The current `voice`, `strategy` and `kill_test` content schemas are re-read before implementation; schema changes use expand/migrate/contract ordering.

---

## Requirements

### Structured interview and evidence

- [ ] **R1:** The interview captures structured goals, positioning/audience, declared north-star metric, banned words, banned vibes and ambitions. Each field has an explicit "not decided" state; blank text is not silently converted into a claim.
- [ ] **R2:** The creator reviews a summary before submission and can go back without losing answers. Validation errors identify the field, cause and correction.
- [ ] **R3:** Submitted answers are canonical `creator_authored` inputs with profile/workspace scope, a stable input id, timestamp and field key. They are not labelled inferred or verified.
- [ ] **R4:** Strategy and Kill Test claims sourced from the interview cite the exact creator-authored field/value. Voice continues to cite `own_post` evidence. Reference inputs remain barred from Voice and Strategy provenance where the existing policy bars them.
- [ ] **R5:** Vendor inference is optional enrichment, not a prerequisite to preserve the creator's answers. A vendor/schema refusal leaves the interview draft recoverable and writes no partial brain document.

### Complete brain and metric semantics

- [ ] **R6:** The slice creates or updates all three document kinds: `voice`, `strategy`, and `kill_test`. Each uses the existing version, confirmation and activation invariants; there is no parallel onboarding-only writer.
- [ ] **R7:** Strategy owns the declared metric plus goals and positioning. The metric stores a stable key, human label, unit/direction and optional platform/window so slice 9 can test comparability without parsing prose.
- [ ] **R8:** Activation records an immutable coherent snapshot containing the exact active Voice, Strategy and Kill Test version ids plus nullable Performance Meta (introduced in slice 9). Activating any document later creates a new snapshot that carries the unchanged active versions forward. The operation is workspace-locked and all-or-nothing; a generation can never observe a half-activated set.
- [ ] **R9:** Every generation later records the coherent brain activation id and exact document/input versions it used. Changing the north-star metric creates a new Strategy version/activation and never rewrites historical generations or results.
- [ ] **R10:** Confirmation language distinguishes creator-authored declarations from model inference. No screen says the declared metric, positioning or ambitions were learned, verified or measured.

### Reachability and roles

- [ ] **R11:** A new profile is routed through interview → evidence review → per-field confirmation → coherent activation. Returning creators can resume a draft.
- [ ] **R12:** Owner/editor permissions match the recorded slice-3 decision; viewers can read the active brain but cannot change answers, confirm, activate or change the metric.
- [ ] **R13:** Completion routes to a named B04 handoff owned by slice 7. Before slice 7 ships, the action renders an honest named absence rather than pretending three ideas were created.

## Tasks

1. [ ] Add the structured interview schema, draft/resume state and accessible review screen.
2. [ ] Persist canonical `creator_authored` evidence and expose it through the existing scoped input accessors.
3. [ ] Assemble/parse Strategy and Kill Test drafts, preserving creator answers on refusal.
4. [ ] Reuse the existing brain write/confirm path for all three kinds; add coherent activation snapshot storage and locking.
5. [ ] Add versioned declared-metric editing hooks consumed by slice 5 and immutable brain provenance consumed by slice 6.
6. [ ] Add the B04 handoff contract to slice 7 and an honest pre-slice-7 absence state.
7. [ ] Walk the full new-profile path and run the quality gates from the master plan.

## Files — expected surface; re-read before implementation

| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/onboarding-schema.ts` | Modify | Interview/activation schema and same-tenant constraints |
| `respin/packages/db/migrations/00xx_*.sql` | Create | Expand-only schema for creator-authored fields and coherent activations |
| `respin/packages/db/src/with-workspace.ts` | Modify | Scoped draft, evidence, confirmation and atomic activation accessors |
| `respin/packages/llm/src/assemble.ts` | Modify | Pure Strategy/Kill Test assembly and fail-closed parsing |
| `respin/app/(product)/onboarding/**` | Modify | Structured interview, review, resume and completion handoff |
| `respin/app/(product)/brain/**` | Modify | Complete-brain review and activation state |
| `respin/tests/**` | Modify/Create | UI, tenancy, provenance, concurrency and migration witnesses |

## Verification

1. [ ] From an empty profile: answer every interview field → review → create all three documents → confirm → activate; the active snapshot names exactly those three versions.
2. [ ] Leave a field undecided, navigate away and return; draft state survives and no unsupported claim is invented.
3. [ ] Force vendor and parse failures; creator-authored answers remain, no partial document/activation exists and no false success renders.
4. [ ] Race two activation requests; one coherent terminal activation wins and both callers observe it.
5. [ ] Change the north-star metric; a new Strategy version/activation appears while an earlier generation fixture still points to the old snapshot.
6. [ ] Cross-workspace ids, a viewer mutation and a caller-supplied workspace id are refused.

## Mutations to plant

| # | Mutation | Should redden |
|---|---|---|
| M1 | Store interview answers as inferred evidence | R3/R10 evidence-state tests |
| M2 | Allow activation with no Kill Test | R6/R8 coherent-snapshot tests |
| M3 | Activate documents in separate commits | R8 crash/concurrency test |
| M4 | Update the metric in place | R9 history test |
| M5 | Let a viewer submit the interview | R12 capability test |
| M6 | Drop a creator answer when inference refuses | R5 recovery test |

## Done when

- [ ] The creator walk passes at 360 px and 1440 px with keyboard, focus, error/refusal and resume states.
- [ ] All schema, tenancy, privacy, idempotency and Critical-Path gates in the master plan pass.
- [ ] The M2 coverage row has evidence for the complete brain and no phase claims M2 complete without this slice; B04 remains visibly open until slice 7's real Ideation handoff ships.
