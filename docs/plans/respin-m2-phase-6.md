# Phase 6 — Brain editor pages, version history, and export UI

**Depends on:** Phase 3 (`packages/brain`), Phase 5 (onboarding — a brain must exist to edit).
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-C05 (versioning half), REQ-B02, REQ-B03, REQ-A04 (export half), REQ-A03.

> The editor is the second half of "nothing updates it silently": onboarding writes the first version, this phase is where every later change also becomes a version the creator can see.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.**
6. **Report honestly.**
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

### Non-negotiable rules (Respin) — the ones this phase touches

- **3. Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03).
- **6. No invented specifics, no guarantees** (REQ-I03/I04).

### Lessons that touch this ground

- **2026-08-17 audit #15/#16/#17** — visible labels; error summaries with an id, `aria-describedby`, `aria-invalid`, a focusable alert and a focus effect keyed on the **state object**; every disabled control's reason resolvable.
- **2026-07-30 — a comment claiming a property is not the property.**
- **2026-08-10 — present-and-verified is not present-and-unrun.**

### Stack and boundaries

- Next.js 15 App Router; server actions for writes; `@respin/brain/app-server` is the only sanctioned surface.
- Every read/write scoped: `withWorkspace` -> `scope.profile(id)` -> `ProfileScope`.
- Accessibility is an acceptance criterion, not a follow-up.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-tenancy-reviewer`, `respin-learning-reviewer`, `respin-compliance-reviewer`, `code-reviewer`, `security-reviewer`.
**Do NOT request** any agent not present in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | Editor pages for `voice`, `strategy`, `killtest`. **The `killtest` doc holds creator STYLE rules only** — REQ-I01-I05's product-level rules are not representable in it, so no edit can weaken them (DL row to M3, which executes the kill test) | build-plan M2; compliance skill S5 ("no config flag weakens this" — and brain content is not an exemption from that) |
| F2 | **Every edit creates a new version**; the old version remains readable | REQ-C05, build-plan M2 accept-when |
| F3 | Version history is browsable per doc, showing what changed and why | R-8 "never silent" |
| F4 | Every active field displays its provenance (verbatim quote + source + input class) and derived confidence, or **states its recorded `creator_authored` class** — never an empty evidence box, and never a relabel of a missing provenance | REQ-B02, D-M2-4 |
| F5 | North-star metric changeable, versioned | REQ-B03 |
| F6 | Export download: complete, readable JSON **and** markdown | REQ-A04 |
| F8 | **A paused workspace cannot save a brain edit or restore a version** — the editor is read-only while paused, and says so (D-M2-11) | REQ-G08's read-only Must |
| F7 | `performance_meta` is **readable and not writable at all** from the product. The refusal lives in `packages/brain` where the write path is BUILT (phase 3 F10); this phase's UI and action-layer checks are second and third layers, never the guard | R-10; 2026-07-30 lesson |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | Profile isolation | scoped actions only; action-gate completeness assertion |
| T2 | Append-only | the editor calls `activateNewVersion`; **no in-place update path is added**. Note `app/**` cannot import `brainDocs` at all (the eslint path deny plus a types-only allowlist), so an `app/**` source scan for `update(brainDocs)` is **near-vacuous** — the load-bearing guard is phase 3's sole-call-site enumeration inside `packages/brain` (AC-15 there) |
| T3 | Nothing silent | every version carries a required `reason`; the UI collects it |
| T4 | Accessibility | audit #15-#17 standard |

## Edge Cases & Failure Paths

**Inverse events.**

| Event | Inverse | Behaviour |
|---|---|---|
| Field edited | Edit reverted | Reverting is a **new version** whose content matches an older one — never a delete of the intervening version. |
| Version activated | Older version viewed | History is read-only; viewing an old version never activates it implicitly. **Restoring** one is an explicit action that creates a new version. |
| Export requested | — | Read-only; nothing to undo. |

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| Save fails on a version conflict | Retried without re-reading | `BrainVersionConflictError` surfaces as "this changed since you loaded it", with the current version shown; a blind retry cannot clobber, because activation is conditioned on the version the editor loaded. |
| Two editors save concurrently (M6 seats) | — | One wins; the other gets the conflict above. Tested now, since the index exists now. |
| Export while a save is in flight | — | Single-transaction snapshot; never a half-activated pair (phase 3 AC-8). |
| Owner pauses while the editor is open | Creator saves | **Refused** (D-M2-11): REQ-G08 makes a paused workspace read-only, and an edit is a write. The draft text is preserved in the form and the reason names the pause. **Export stays available** — reading is not writing, and withholding a creator's own data during a pause would be a worse answer than the pause protects against. |

**Degraded mode.** No external boundary beyond Postgres. A field whose **recorded** authorship is `creator_authored` renders as exactly that, rather than an empty evidence box that reads as a rendering bug.

**Corrected after round 1:** that fallback must key on the *recorded class*, never on the *absence of provenance*. Keying on absence would relabel a model-invented, ungrounded field as creator-authored — the most trustworthy provenance class the product has — which is laundering an invented specific. Phase 3's discriminated union makes an `inferred` field with empty provenance unrepresentable, so this UI has no such case to mishandle.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| Editor -> `@respin/brain` | `BrainVersionConflictError` | Named conflict message + current version shown; no clobber | Reload and re-apply | AC-4 |
| Editor -> `@respin/brain` | `UnconfirmedFieldError` | Field-level error, focus to summary, second submit re-focuses | Confirm the field | AC-5 |
| Export -> response | Large brain | Bounded/streamed; never a truncated document presented as complete | — | AC-6 |
| Editor -> Postgres | Unavailable | Loud failure; no partial save | — | AC-4 |
| Editor -> pause predicate | Workspace paused | Save and restore refused with the pause named; **export still permitted** | Resume | AC-13 |

## Handoff Contracts

Terminal phase of M2 — consumed by **M3** (which reads the active brain to assemble prompts) and **M5** (which writes `performance_meta` as the sole emitter). Pinned:

    // M2 guarantees to M3:
    //   readActiveBrain(scope) returns exactly one active doc per kind for any
    //   profile that completed onboarding, each with per-field provenance.
    // M2 guarantees to M5:
    //   performance_meta has NO write path in the product at all. The refusal is
    //   in packages/brain (activateNewVersion's WritableBrainKind + a runtime
    //   check), not in the UI — so the sole-emitter rule R-10 is not already
    //   violated when M5 arrives, and a crafted POST cannot violate it either.
    //   M5 adds its emitter through a narrow, non-facade entry point of its own.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | `/brain` route group + per-kind editor pages | `respin-engineer` | `respin/app/(product)/brain/**` |
| 2 | Field editor with required change **reason**, calling `activateNewVersion` | `respin-engineer` | `respin/app/(product)/brain/actions.ts` |
| 3 | Optimistic-concurrency guard: activation conditioned on the loaded version | `respin-engineer` | `respin/app/(product)/brain/actions.ts` |
| 4 | Version history view per doc, read-only, with an explicit **restore** action that creates a new version | `respin-engineer` | `respin/app/(product)/brain/history/**` |
| 5 | Provenance panel per field (verbatim quote, source, derived confidence, or the stated creator-authored absence) | `respin-engineer` | `respin/app/(product)/brain/**` |
| 6 | North-star metric editor | `respin-engineer` | `respin/app/(product)/brain/strategy/**` |
| 7 | Export download (JSON + markdown) | `respin-engineer` | `respin/app/(product)/brain/export/**` |
| 8 | `performance_meta` rendered as **"not yet earned — written by M5's learning loop"**. No M2 path creates one, so "renders read-only" would have nothing to render | `respin-engineer` | `respin/app/(product)/brain/**` |
| 9 | Accessibility pass + component tests to the audit #15-#17 standard | `respin-engineer` | `respin/tests/brain-ui.test.tsx` |
| 10 | Action-gate + route + wiring registration | `respin-engineer` | `respin/tests/{action-gate,routes,page-wiring}.test.*` |
| 11 | Second-layer scan for in-place updates in `app/**` (cheap, near-vacuous by construction — phase 3's enumeration is the guard) | `respin-engineer` | `respin/tests/import-boundary.test.ts` |
| 12 | **Move AC-7's sole-emitter assertion out of `brain-ui.test.tsx`** into the isolation/import-boundary suites, where an architectural invariant belongs and will be maintained | `respin-engineer` | `respin/tests/import-boundary.test.ts` |
| 13 | Register new routes in `respin/lib/routes.ts` and `NAMED_PROTECTED_PAGES` | `respin-engineer` | `respin/lib/routes.ts`, `respin/tests/gate-completeness.test.ts` |
| 14 | **Pause check on save and restore** (D-M2-11), with export deliberately exempt | `respin-engineer` | `respin/app/(product)/brain/actions.ts` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/app/(product)/brain/**` | New | Editors, history, export, `actions.ts` |
| `respin/tests/brain-ui.test.tsx` | New | Accessibility + behaviour + the in-place-update tripwire |
| `respin/tests/action-gate.test.ts` | Modified | New actions |
| `respin/tests/routes.test.ts` | Modified | New routes |
| `respin/tests/page-wiring.test.tsx` | Modified | Wiring |

## Migration Steps

None. This phase adds no entity and no column; it consumes phase 1's schema and phase 3's API.

## Verification Steps

1. **State: phases 3 and 5 complete and green.**
2. **State: after task 2.** Edit a `voice` field -> a new version exists, the previous one is still readable at its own URL (AC-1, AC-2).
3. **State: after step 2.** Mutation check — change the action to update the active row in place; AC-1 and the task-11 tripwire must both go red.
4. **State: after task 3.** Load the editor, activate a competing version from a second session, then save -> `BrainVersionConflictError` surfaced, **no clobber** (AC-4).
5. **State: after task 4.** Restore an old version -> a **new** version is created; the intervening version still exists (AC-3).
6. **State: after task 7.** Download export -> JSON and markdown both contain all three writable kinds and every active field, with `performance_meta` rendered as "not yet earned — written by M5's learning loop" rather than as an empty section (AC-6).
7. **State: after task 8.** `performance_meta` renders with no editable control, and **no server action can write it** — asserted, not just hidden (AC-7).
8. **State: after task 9.** Accessibility assertions to the audit standard, including the second-failed-submit re-focus (AC-8).
9. **State: after task 10.** Action-gate completeness covers every new action; mutation to a raw `profileId` goes red (AC-9).
10. **State: after step 9.** Full entry gate on the CI shape, plus `pnpm audit --audit-level high --prod` exit 0 with **no new baseline entries**.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | Every edit creates a new version. The guard is phase 3's **sole-call-site enumeration** inside `packages/brain`; the `app/**` scan is retained as a cheap second layer and is **not counted as the guard** | test + enumeration, red under the step-3 mutation |
| AC-2 | The previous version remains readable after an edit | test `the old version stays readable` |
| AC-3 | Restoring an old version creates a **new** version and deletes nothing | test `restore is append, not rollback` |
| AC-4 | A concurrent save yields a named conflict and cannot clobber | test (step 4) |
| AC-5 | **Any** unconfirmed inferred field blocks save, with focus management and second-submit re-focus | test, **red when narrowed to below-threshold only** — the round-1 wording, corrected in phases 3 and 5 and missed here |
| AC-6 | Export download contains all three writable kinds and every active field, with `performance_meta` rendered as "not yet earned — written by M5's learning loop" rather than as an empty section, in JSON **and** markdown | test `export download is complete in both formats`. *No M2 path creates a `performance_meta` doc, so "all four kinds" would be satisfied by an empty section (vacuous) or a planted row nothing can produce* |
| AC-7 | `performance_meta` has **no write path from the product**. The load-bearing layer is `packages/brain`'s runtime refusal (phase 3 AC-12); the facade and UI layers are second-order and labelled as such. **The plant is a runtime cast** (`"performance_meta" as WritableBrainKind`), because once the type excludes the kind a plain plant fails `tsc` and the redness would come from the compiler rather than from the assertion | red against the runtime cast |
| AC-8 | Accessibility to the audit #15-#17 standard: labels, associated errors, focus, resolvable disabled reasons | `respin/tests/brain-ui.test.tsx` |
| AC-9 | Every new action authenticated and profile-scoped; completeness assertion covers them | `respin/tests/action-gate.test.ts`, red under a raw-`profileId` mutation |
| AC-10 | Every active field displays provenance, or states its **recorded** `creator_authored` class. A field stored as `inferred` can never reach the screen without resolvable provenance — phase 3 rejects it at write time, so the UI has no "missing provenance" case to relabel | test `no empty evidence box, and no ungrounded field labelled creator-authored` |
| AC-11 | **REQ-I03:** a `[check]` marker survives editing, versioning and the export download unaltered | test, red against a planted stripped marker. *Round 1 claimed this gate PASSed with no such criterion* |
| AC-12 | Export download carries **provenance and derived confidence**, not just field values | `brain-ui.test.tsx` + phase 3 AC-8 |
| AC-13 | **A paused workspace cannot save an edit or restore a version** (REQ-G08), the reason is named on the disabled control, **and export still works**; an unpaused workspace can save (non-vacuity) | paired test, red when either direction is removed |

## Least confident (one line)

**That optimistic concurrency conditioned on the loaded version composes cleanly with phase 3's partial unique index** — the index guarantees one active row, but the editor also needs "the version I loaded is still the active one", and if those two mechanisms disagree the failure mode is a confusing double error rather than a clobber; AC-4 is written to catch the disagreement, and the fix, if needed, is to make the index violation the single surfaced conflict.

## Out of Scope (Surgical Changes)

Do not build feedback capture (REQ-C05's capture half — M3). Do not build promotion proposals or any `performance_meta` writer (M5, DL-5) — and do not add a facade export that could reach one. Do not build deletion (M6, DL-4). Do not build the curation queue (M6, DL-3). Do not touch `packages/credits/**`, `src/`, or `cutdown/`.

## Completion Criteria (Definition of Done)

- Entry gate clean on the CI shape; `pnpm audit --audit-level high --prod` exit 0 with no new baseline entries.
- Applicable Critical-Path gates PASS: **brain tenancy** (primary), **learning honesty** (`performance_meta` sole-emitter preserved at the layer where the path is built, north-star metric), **spin compliance** (REQ-I03 via AC-11), **billing & credits** (the pause refusal, AC-13).
- M2's Exit Demonstration in the master plan satisfied, with the engineering claim and the <20-minute evidence claim reported **separately**.
- AC-1 .. AC-13 met with named evidence.
