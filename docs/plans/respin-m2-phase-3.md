# Phase 3 — `packages/brain`: versioned docs, provenance, export

**Depends on:** Phase 1 (the cage and the `brain_docs` schema).
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-B02, REQ-B03, REQ-C05 (versioning half), REQ-A04 (export half), REQ-A03.

> This is where R-8 stops being a doc-set promise. "Brains are context, never weights, never silent" is a testable property or it is decoration.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences.
6. **Report honestly.** "Done" is a claim the checks have to back.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

### Non-negotiable rules (Respin) — the ones this phase touches

- **3. Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03/D04, R-9).
- **4. Learning is earned.** Proposals only from `packages/brain` at n >= 3 comparable verified results (R-10, REQ-F). **M2 emits no proposals** — this phase must not create a path that could.
- **6. No invented specifics, no guarantees.** `[check]` placeholders (REQ-I03/I04).

### Lessons that touch this ground

- **2026-07-30 — fix the class, not the field.** Guard where the path is **built**; a caller-side guard is a documented bypass. This phase's round-1 draft put the `performance_meta` refusal in an app-layer UI test while the write path is built here, and guarded in-place updates with a grep for one literal spelling.
- **2026-07-30 — a comment claiming a property is not the property**: assert it in a test or delete the claim.
- **2026-08-10 — present-and-verified is not present-and-unrun.**
- **2026-08-18 — never report a thing recorded until you have re-read the file.**

### Stack and boundaries

- `app/` imports `packages/`, never the reverse. `@respin/brain` gets a default-deny root plus a sanctioned `@respin/brain/app-server` facade, mirroring `@respin/credits`.
- **Every profile-scoped read and write goes through `ProfileScope` from phase 1.** `packages/brain`'s public API takes a **`ProfileScope` and nothing else** — not a bare `profileId: string`, and *not* a `VerifiedProfileId` either: the brand is defeated by a one-token cast (verified — `raw as VerifiedProfileId` compiles at `tsc` exit 0), so accepting it re-opens the hole the cage closes.
- Zod at boundaries; append-only writes; uuid v7 app-side.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-tenancy-reviewer`, `respin-learning-reviewer`, `respin-compliance-reviewer`, `respin-billing-reviewer`, `code-reviewer`.
**Do NOT request** any agent not present in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | Four brain doc kinds: `voice`, `strategy`, `performance_meta`, `killtest` | tech-spec §2:63 |
| F2 | Editing any field creates a **new version**; the previous version stays readable | REQ-C05, REQ-B02, build-plan M2 accept-when |
| F3 | Exactly one active version per `(profile_id, kind)`, enforced by the D-M2-3 index | D-M2-3 |
| F4 | Every inferred field carries `source_evidence`: a **verbatim quote** plus a stable reference to the input it came from | REQ-B02, D-M2-4 |
| F5 | Every inferred field carries a **countable label**, `evidence: N of M posts` — N = distinct `onboarding_inputs` rows whose cited quote passes the D-M2-4 check at its recorded offsets, M = inputs submitted. **No agreement clause; no confidence enum; the word *confidence* does not appear in M2** | D-M2-5 (revised after round 2) |
| F6 | **Activation refuses while ANY inferred field is unconfirmed** — not merely below-threshold ones | **`PRD.md:67`** (REQ-B02, [Must]: "the creator confirms or edits **each** before the brain activates"), D-M2-5b |
| F7 | North-star metric declared per profile, changeable, versioned like any other field | REQ-B03 |
| F8 | Export produces complete, readable **JSON and markdown** for all four docs | REQ-A04, build-plan M2 accept-when |
| F9 | Nothing in this package emits a promotion proposal | R-10; M2 non-goal |
| F10 | **`activateNewVersion` refuses `kind='performance_meta'`** with a typed error, and no facade export can write it | R-10 sole emitter; guard where the path is **built** |
| F13 | **`writeBrainDoc` (phase 1) is the single INSERT path for `brain_docs`, drafts included**, typed to `WritableBrainKind` | Round-2 learning BLOCK-B: consolidating the schema created a draft insert path no phase defined and no enumeration covered |
| F14 | **A closed allowlist of inferable field keys is enforced inside `activateNewVersion`**, per kind | REQ-B02's sensitive-trait Must, guarded where the path is built |
| F15 | **Editing an inferred field retires its provenance** — content changed with byte-identical `inferred` provenance is refused | Round-2 tenancy: F11 catches a *fabricated* quote, not a *stale* one |
| F16 | **`activateNewVersion` refuses while `hasOpenPause` is true** (`WorkspacePausedError`) | D-M2-11 |
| F11 | Every quote is re-validated against its **stored** `onboarding_inputs` row **inside the activation transaction**, and again in the export path | D-M2-4 |
| F12 | A `reference`-classed quote may never be stored as provenance on the `voice` doc | D-M2-10 |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | Profile isolation (REQ-A03) | **the public API accepts `ProfileScope` ONLY** — never a `VerifiedProfileId`, because the brand is defeated by a cast (`raw as VerifiedProfileId`, compiled at `tsc` exit 0). Every hand-written query in this package carries **both** predicates, and a cross-profile suite mirroring `credits/tests/isolation.test.ts` drives every export from both sides |
| T2 | Append-only, one authority | brain doc **history** is the store; the "active brain" is *derived* (max version where active), never a second mutable copy — the `credit_ledger`/`deriveBalance` discipline |
| T3 | Nothing silent (R-8) | every write is a version with an author and a reason; no in-place update path exists |
| T4 | No invented specifics (REQ-I03) | `[check]` preserved through storage and export (**AC-11**, an actual criterion — round 1 asserted this in T4 with no AC); **a field stored as `inferred` with empty provenance is a write-time rejection**, never a render-time relabel to "creator-authored" |

## Edge Cases & Failure Paths

**Inverse events.**

| Event | Inverse | Behaviour |
|---|---|---|
| Version activated | Previous deactivated | Same transaction; the partial unique index makes "both active" unrepresentable (phase 1 AC-7). |
| Field confirmed | Field un-confirmed / re-edited | Produces a **new version**; there is no un-confirm-in-place. History shows both. |
| North-star metric declared | Changed | New version of the `strategy` doc; the old metric stays readable, so a later result can be interpreted against the metric that was live when it was logged. |
| Doc created | Doc deleted | **Out of scope — M6 (DL-4).** No delete path exists; cascade from profile/workspace deletion only. |

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| Activation tx aborts | Client retries | Previous active version is still active; the retry is a fresh transaction. No orphan "activating" state exists because there is no such state. |
| Two editors activate concurrently (M6 seats) | — | One transaction wins; the loser gets a unique-violation surfaced as a typed conflict, not a 500. Tested now even though seats are M6, because the index exists now. |
| Export requested while an activation is in flight | — | Export reads a consistent snapshot in one transaction; it never renders a half-activated pair. |
| A quote fails re-validation at activation | Caller retries unchanged | Typed `ProvenanceMismatchError`; the version does not activate. A fabricated quote cannot be stored, and a quote whose input was somehow altered cannot be silently kept. |
| A caller passes `kind='performance_meta'` | Caller retries via the facade | Refused in `packages/brain` itself (F10). There is no facade export that reaches it, so the app layer has nothing to call. |

**Degraded mode.** This package makes no external call. It depends on Postgres (fails loudly). It accepts already-inferred field values plus their evidence, so an unavailable *model* degrades in phase 5's wizard, not here — that separation keeps the versioning store testable without a model.

**What changed after round 1:** the separation was taken too far. Because this package never saw the source text, its verbatim-quote validator had no runtime corpus, and AC-4 was satisfiable entirely against fixtures while the production write path stored whatever the model returned. `packages/brain` now reads `onboarding_inputs` through the `ProfileScope` accessor and re-validates every quote **inside the activation transaction**. It still never calls the adapter.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| `packages/brain` -> Postgres | Connection lost | Read/write fails loudly; no cached brain is served | None (nothing written) | AC-2 |
| `packages/brain` -> Postgres | Unique violation on activation | Typed `BrainVersionConflictError`, **not** a 500 | Caller re-reads and retries | AC-3 |
| Export -> filesystem/response | Serialization of an oversized brain | Streamed/bounded response; never a truncated document presented as complete | — | AC-8 |

## Handoff Contracts

Consumed by phases 5 and 6:

    export type BrainKind = "voice" | "strategy" | "performance_meta" | "killtest";
    // M2 ships a COUNT, not a graded word (D-M2-5, revised after round 2).
    // "high" reads to a creator as "we are confident this is true of you",
    // which counting quote EXISTENCE cannot support.
    export type EvidenceCount = { grounded: number; submitted: number };

    export type Authorship = "inferred" | "creator_authored";
    export type InputClass = "own_post" | "reference" | "creator_authored";

    export type FieldProvenance =
      | { authorship: "creator_authored" }          // no quote, and none implied
      | {
          authorship: "inferred";
          quote: string;        // VERBATIM substring of the STORED input (D-M2-4)
          inputId: string;      // FK -> onboarding_inputs.id
          inputClass: InputClass;
          startOffset: number;
          endOffset: number;
          evidence: EvidenceCount;  // DERIVED from verifier passes (D-M2-5)
          confirmed: boolean;
        };

    // An "inferred" field with empty provenance is UNREPRESENTABLE — that is the
    // point of the discriminated union. Round 1 made provenance optional and let
    // the UI relabel a missing one as "creator-authored", which launders a
    // model-invented field into the most trustworthy class the product has.

    export type BrainDocContent = Record<string, unknown>;

    // Every function takes a ProfileScope. NOT a VerifiedProfileId (defeated by a
    // cast), and not a bare string.
    export function readActiveBrain(scope: ProfileScope): Promise<Record<BrainKind, BrainDoc | null>>;
    export function readBrainHistory(scope: ProfileScope, kind: BrainKind): Promise<BrainDoc[]>;

    // WritableBrainKind EXCLUDES performance_meta at the type level (F10), and the
    // runtime refuses it too — M5 is its sole emitter (R-10).
    export type WritableBrainKind = Exclude<BrainKind, "performance_meta">;

    export function activateNewVersion(scope: ProfileScope, params: {
      kind: WritableBrainKind;
      content: BrainDocContent;
      provenance: Record<string, FieldProvenance>;
      reason: string;      // why this version exists — never optional (R-8 "never silent")
      expectedActiveVersion: number | null;   // optimistic concurrency (phase 6 AC-4)
    }): Promise<BrainDoc>;

    export function exportBrain(scope: ProfileScope): Promise<{ json: string; markdown: string }>;

    export class BrainVersionConflictError extends Error {}
    export class UnconfirmedFieldError extends Error {}
    export class ProvenanceMismatchError extends Error {}
    export class ForbiddenBrainKindError extends Error {}
    export class ReferenceProvenanceError extends Error {}   // D-M2-10

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Scaffold `packages/brain` (workspace, tsconfig, vitest), facade + eslint deny/grant | `respin-engineer` | `respin/packages/brain/**`, `respin/eslint.config.mjs` |
| 2 | `docs.ts` — read active, read history, `activateNewVersion` in one transaction | `respin-engineer` | `respin/packages/brain/src/docs.ts` |
| 3 | `provenance.ts` — the `FieldProvenance` Zod schema, the **verbatim-substring validator**, and the confidence **derivation rule** | `respin-engineer` | `respin/packages/brain/src/provenance.ts` |
| 4 | The confirm gate: activation refuses while **any inferred field** is unconfirmed (`UnconfirmedFieldError`) — REQ-B02's actual wording | `respin-engineer` | `respin/packages/brain/src/docs.ts` |
| 4b | `activateNewVersion` refuses `performance_meta` (`ForbiddenBrainKindError`) at the **type and runtime** level; the facade exports no path that reaches it | `respin-engineer` | `respin/packages/brain/src/{docs.ts,app-server.ts}` |
| 4c | Re-validate every quote against its stored `onboarding_inputs` row **inside the activation transaction** (`ProvenanceMismatchError`); refuse a `reference`-classed quote on `voice` (`ReferenceProvenanceError`) | `respin-engineer` | `respin/packages/brain/src/provenance.ts` |
| 4d | **Cross-profile isolation suite** mirroring `credits/tests/isolation.test.ts` — A/B profiles in A/B workspaces, every exported function driven from both sides with non-vacuous counts, plus the derived per-export coverage enumeration | `respin-engineer` | `respin/packages/brain/tests/cross-profile.test.ts` |
| 5 | North-star metric as a first-class `strategy` field with its own enum and version history | `respin-engineer` | `respin/packages/brain/src/north-star.ts` |
| 6 | `export.ts` — JSON + markdown renderers over a single-transaction snapshot | `respin-engineer` | `respin/packages/brain/src/export.ts` |
| 7 | `internalOnly` registry + facade re-export test, mirroring `credits/tests/isolation.test.ts` | `respin-engineer` | `respin/packages/brain/tests/isolation.test.ts` |
| 8 | Source-scan tripwire: **no export in this package accepts a bare `profileId: string` or a `VerifiedProfileId`** — `ProfileScope` only | `respin-engineer` | `respin/packages/brain/tests/isolation.test.ts` |
| 8b | **Sole-call-site enumeration** for the deactivating UPDATE: assert by enumeration that exactly one call site in `packages/brain/src` issues an `update(brainDocs)`, and that its `.set` key-set is the sanctioned status/`superseded_at` flip | `respin-engineer` | `respin/packages/brain/tests/isolation.test.ts` |
| 9 | Real-Postgres concurrency case for concurrent activation | `respin-engineer` | `respin/packages/brain/tests/concurrency.docker.test.ts` |
| 10 | **Derived export-coverage set**: enumerate the creator-derived tables from the schema and assert each is exported or excluded-with-reason | `respin-engineer` | `respin/packages/brain/tests/export.test.ts` |
| 11 | Confidence cut-points into `respinConfigV1` + its config data step (D-M2-7b); **phase 3 owns the `brain.*` keys** | `respin-engineer` | `respin/packages/config/src/schema.ts`, `respin/packages/config/src/migrate-config.ts` |
| 12 | Record the north-star metric's document location as a decision (R-31) and align `PRD.md:42` / `tech-spec.md` §2 in the same change | `respin-engineer` | `docs/initial/decisions.md`, `docs/initial/PRD.md`, `docs/initial/tech-spec.md` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/packages/brain/{package.json,tsconfig.json,vitest.config.ts}` | New | Mirror `packages/credits` |
| `respin/packages/brain/src/{index,docs,provenance,north-star,export,app-server}.ts` | New | |
| `respin/packages/brain/tests/{docs,provenance,export,isolation,concurrency.docker}.test.ts` | New | |
| `respin/eslint.config.mjs` | Modified | `@respin/brain` deny + `app-server` grant |
| `respin/package.json`, `respin/pnpm-workspace.yaml` | Modified | new workspace member |

## Migration Steps

**No SCHEMA migration** — `brain_docs`, `onboarding_inputs` and the `activated_at`/`superseded_at`/`reason` columns all land in phase 1's `0011_*`, which is why phase 1 now owns the whole M2 schema. If this phase genuinely discovers a missing column, it is added as `0012_*` **here**, generated via `db:generate`, `db:check` clean — never hand-edited into `0011`.

**A config DATA step is required (D-M2-7b)** for the `brain.*` confidence cut-points this phase adds to `respinConfigV1`: append a new config version for existing databases, and test against a **stored pre-change document**, not `CONFIG_V1_SEED`. Phase 3 owns the `brain.*` keys; phase 1 owns `profileCaps`; phase 2 owns `llm.*`. One phase per key.

## Verification Steps

1. **State: phase 1 complete and green** (`docs/progress/respin-m2/ledger.md` shows AC-1..AC-10 met).
2. **State: after task 3.** `pnpm -C respin test -- packages/brain/tests/provenance` -> the verbatim-substring validator rejects a paraphrase and accepts a real quote.
3. **State: after step 2.** Mutation check — replace the substring check with a length check and re-run: AC-4 must go red.
4. **State: after task 4.** `pnpm -C respin test -- packages/brain` -> the unconfirmed-field refusal (AC-5) passes, plus its **non-vacuity twin** (a fully confirmed brain does activate).
5. **State: after task 6.** Export a seeded brain and assert both renderings contain all three writable kinds and every active field, with `performance_meta` rendered as "not yet earned — written by M5's learning loop" rather than as an empty section, with each quote re-validated against its stored input (AC-8). Then plant a mutated stored input: AC-8 goes **red**.
6. **State: after task 9, Docker Postgres up.** `TEST_DATABASE_URL=... pnpm -C respin test` -> concurrent activation yields exactly one active row and a typed conflict for the loser (AC-3), with **no loud-skips**.
7. **State: after step 6.** Mutation check — remove the partial unique index reliance by catching and swallowing the unique violation; AC-3 must go red.
8. **State: after step 7.** Full entry gate.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | Editing a field creates a new version and the previous version remains readable | test `an edit versions; the old version stays readable` |
| AC-2 | The active brain is **derived** (max version, status active) — there is no second mutable copy, and no in-place update path exists | test plus a source-scan asserting no `update(brainDocs).set({content` anywhere |
| AC-3 | Concurrent activation leaves exactly one active row; the loser gets `BrainVersionConflictError`, not a 500 | real-Postgres test; red when the unique violation is swallowed (step 7) |
| AC-4 | Every stored `quote` is a literal substring of its **persisted `onboarding_inputs` row** at the recorded offsets, **re-validated inside the activation transaction** | test `a fabricated quote cannot be activated`, **red against a planted quote absent from the stored input** — not merely against fixtures |
| AC-5 | **Any** unconfirmed inferred field blocks activation with `UnconfirmedFieldError`, and a fully confirmed brain still activates (non-vacuity) | test pair; **red when the gate is narrowed to below-threshold fields only** — the round-1 behaviour |
| AC-6 | **Model-perturbation invariance:** hold the grounded quotes fixed, vary **every other field** of the adapter response, and the label **does not move**; it moves only when a quote's substring check passes or fails | `provenance.test.ts`; **red against an implementation that counts a model-supplied list**. With the agreement clause dropped, this is now satisfiable — round 2's version contradicted D-M2-5, since agreement compared the very values AC-6 requires to vary |
| AC-6b | The rendered label is a **count**, not a graded word — no `high`/`medium`/`low` anywhere in M2 | source-scan, red against a planted enum |
| AC-16 | **Every `insert(brainDocs)` AND `update(brainDocs)` call site in `packages/brain/src` is enumerated**, and the enumeration is class-shaped: aliased table objects (`db.update(t)`), `schema.brainDocs`, and raw `sql` templates naming `brain_docs` are all caught | red against **three** planted mutations — a second insert, an aliased update, and a raw-SQL update. *Round 2's version matched one literal spelling* |
| AC-17 | **An out-of-allowlist content key is refused by `activateNewVersion`** | red against a planted key, at the package layer — not the wizard's |
| AC-18 | **An edit that changes a field's value while keeping byte-identical `inferred` provenance is refused**; the editor writes `creator_authored` instead | red against a planted stale-provenance activation |
| AC-19 | **`activateNewVersion` refuses while `hasOpenPause` is true**, with the drift fixture `{open pause_periods, mirror canceled}` so the wrong predicate goes red | red under `isPausedSubscription` |
| AC-11 | **REQ-I03:** a `[check]` marker survives storage and export unaltered; an `inferred` field with empty provenance is **rejected at write time** | `provenance.test.ts` + `export.test.ts`, red against a planted stripped marker and a planted empty-provenance inferred field |
| AC-12 | **`activateNewVersion` refuses `performance_meta`** — at the type level and at runtime — and no facade export reaches it | `docs.test.ts` + facade scan, **red against a planted generic action taking `kind` from a request body** |
| AC-13 | A `reference`-classed quote is refused as `voice` provenance (`ReferenceProvenanceError`); an `own_post` quote is accepted (non-vacuity) | `provenance.test.ts` pair |
| AC-14 | **Cross-profile isolation at M1's full bar — all four mechanisms**, not two: the `package.json`-exports enumeration (`isolation.test.ts:537`, whose comment records "this is exactly how `webhook-server` escaped the previous guard"), the module-file enumeration (`:525`), the per-export coverage enumeration (`:560`), and the stale-key check (`:586-595`). Driven from both sides with non-vacuous counts, on **both** axes — A/B workspaces **and two profiles inside one workspace** |
| AC-14b | **Write-side breach validator**: a write driven on profile P1 inserts rows carrying **only** P1's ids, and P2's rows are untouched. M1 asserts this for grant/pack/adjust/refund; round 2's AC-14 specified a *return* shape only, so the one write path in the package had no isolation assertion |
| AC-15 | Exactly **one** call site issues an `update(brainDocs)`, and its `.set` key-set is the sanctioned flip | enumeration assertion (task 8b), **red against a second planted update** |
| AC-7 | **Given a timestamp, the active `strategy` version and its north-star metric are recoverable** — via `activated_at`/`superseded_at`, not by `created_at` ordering (which phase 5's `draft` rows break) | test `the metric live at time T is reconstructable`. *Round 1 proved only that history is readable, while the edge-case table claimed the stronger property* |
| AC-8 | Export produces JSON **and** markdown from one transactional snapshot, carrying every active field **plus its provenance and evidence count**, and **re-validating each quote against its stored input** — a quote that no longer matches is marked, never silently rendered. Coverage is **default-deny over every exported Drizzle table** (the `isolation.test.ts:525` module-enumeration pattern): each is exported, or excluded with a written reason, or the suite fails. *"Creator-derived" as a hand-maintained label is name-shaped and would miss a new table.* **`performance_meta` exports honestly as "not yet earned — written by M5's learning loop"**, since no M2 path can create one | `export.test.ts`; red against a mutated stored input and against a new table added without a reason |
| AC-9 | No public export of `packages/brain` accepts a bare `profileId: string` **or a `VerifiedProfileId`** | source-scan, red against both planted signatures |
| AC-10 | Nothing in this package emits a promotion proposal. **Stated plainly: this assertion is vacuous until M5 creates `promotion_proposals`** — it has never been red and cannot be. It is written repo-wide (`app/**`, `packages/**`) so M5 inherits a scan that becomes non-vacuous the moment the table exists | source-scan; the vacuity is recorded rather than presented as proof (2026-08-10 lesson) |

## Least confident (one line)

**That "agreement" survives contact with real inference** — the round-1 gate closed the laundering hole by making the count come from the *verifier* (AC-6's perturbation test), and evidence count is now genuinely countable, but *non-contradictory values across inputs* is still a judgment the code has to make, and if it turns out to need the model to decide whether two quotes agree, the whole rule is back where it started; the honest fallback, which I would take rather than ship a laundered enum, is to drop the word **confidence** entirely for M2 and render the countable label **"evidence: 3 posts"** — a count cannot be laundered, and the word can be earned later.

## Out of Scope (Surgical Changes)

Do not build any UI (phases 5, 6). Do not call the LLM adapter from here — this package accepts already-inferred values and reads `onboarding_inputs` only to verify them. Do not create `promotion_proposals` (M5). Do not write `performance_meta` (F10). Do not build deletion (M6). Do not add a schema migration (phase 1 owns `0011`). Do not touch `packages/credits/**`, `src/`, or `cutdown/`.

## Completion Criteria (Definition of Done)

- Entry gate clean including the CI-shape run with no loud-skips.
- Applicable Critical-Path gates PASS: **brain tenancy** (primary — including the cross-profile suite at M1's own bar), **learning honesty** (the derivation rule, the metric's reconstructability, `performance_meta` refused where the path is built), **spin compliance** (REQ-I03 via AC-11, reference-provenance via AC-13), **billing & credits** (this phase adds `brain.*` config keys, so D-M2-7b applies).
- `tech-spec.md` §2's `brain_docs` line and `decisions.md` stay consistent with what shipped.
- AC-1 .. AC-19 met with named evidence.
