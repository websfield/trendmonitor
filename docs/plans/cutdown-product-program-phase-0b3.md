# Stage 0B-3 — The deliberate contract bump: `render-v2`, and nothing else

**Governing PRD phase:** Phase 0 (completion — the last engineering work in Stage 0).
**Depends on:** 0B-1 + 0B-2 (complete, `docs/progress/cutdown-product-program-stage-0b-review.md`).
**Master plan:** `docs/plans/cutdown-product-program-master-plan.md` §7a; order-critical clause in its §7 Stage-0 summary.
**Evidence base:** `docs/progress/cutdown-product-program-stage-0b-spike.md` (findings **F-A**…**F-Q**) and `docs/progress/cutdown-product-program-stage-0b3-codebase-review.md` (this session's measurements, cited as **CR §n**). Every design claim cites one of the two; nothing here is argued from memory.
**Discharges:** `phase-0b.md` §9's 0B-3 outline and re-planning trigger. That section is not edited; the master plan's Progress Tracking points here.

**Revision 2 (2026-08-10)** — after the rev-1 plan gate: `cutdown-boundary-reviewer` **BLOCK**, `cutdown-measurement-reviewer` **NEEDS CHANGES**. Every finding verified against the code before acceptance, and every one held. Marked **[R1-fix]** below. The BLOCK was this program's signature failure landing in the plan's own evidence base: the writer-move task named `render/main.ts` as the envelope stamper, but the render record's envelope is hand-built in `packages/renderer-ffmpeg/src/adapter.ts:485-491` with a literal `'1.0.0'` — and `renderer-ffmpeg` depends only on `@cutdown/contracts` + `@cutdown/renderer-core` (verified in its `package.json`), so it **cannot import `skillEnvelope`** — the exact package boundary the 2026-07-30 lesson records. The fix adopts the D-52 mechanism: a shared constant in `contracts/src/versions.ts` with a drift test (precedent `PLATFORM_EDL_SCHEMA_VERSION`, `versions.test.ts:11-16`). The measurement round killed five unreconciled numbers, including a phantom "18 lint rules" born in the spike and propagated through the evidence base into this plan (the artefact defines **12** rule ids; the gate is now stated count-free), and a pytest pin over a population pytest does not read (the Python-side proof is `validate:contracts`' 0-cross-validator-disagreements gate; pytest stays **689, delta exactly 0**).

**Revision 3 (2026-08-10)** — after the round-2 gate: both reviewers report **all round-1 findings RESOLVED**, verdicts NEEDS CHANGES on five small items, all applied, marked **[R2-fix]**: (a) rev 2's own "no pytest test reads contract fixtures" was a new categorical falsehood of the phantom-18 class — `workers/indexer-python/tests/test_bounds.py:24` drives a pytest suite from `fixtures/range-check/cases.json`; the claim is narrowed everywhere to the per-contract valid/invalid buckets (the operational pin, 689 / delta 0, was and is correct — `render-v2` fixtures don't touch `range-check`); (b) B4's sole-stamper grep had no stated key and the plan's dual-key grep provably cannot find the stamper (zero hits on `adapter.ts`) — the key is now pinned and the match list must be non-empty; (c) a third home of the pattern-residual comment (`artefact-path-discipline.test.ts:13-16` header) joins task 7's sweep; (d) `phase-0b.md`'s four stale "roughly 4×" / `todos.md:26` citations get a dated correction in task 10 (T-1 graduated; the only measurement on disk says 2×); (e) §12a row 2b's "exactly" softened to "include" (F-F's probe set is not Stage 5's schema set).

---

## Project Conventions Pinned (READ FIRST)

*Pasted from `CLAUDE.md`. A spawned agent does not auto-read it.*

### Golden rules

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.** Pushing, publishing, and deleting what you didn't create wait for explicit confirmation. **Do not run `git commit` or `git push` — the owner authorises those personally** (standing instruction, 2026-08-10; announced checkpoint snapshots by the orchestrator are the one sanctioned exception, per `CLAUDE.md` `Checkpoints: on`).
9. **Current facts beat trained memory.**

### Lessons that touch this stage's ground

- **2026-07-30** — Fix the **class, not the field**; validate the whole artefact at its boundary; put the guard where every consumer can import it; add a lint.
- **2026-07-30** — A comment claiming a property is not the property: **assert it in a test or delete the claim**; when a review names an inversion your fix might cause, write that inversion as a test before calling the fix done.
- **2026-07-30** — Fail closed, but **never without a way forward**.
- **2026-08-10** — A diagnostic that reports "present" must distinguish present-and-verified from present-and-unrun.
- **Program lesson (0B):** a fix that names one site leaves its sibling — three consecutive rounds. Derive every enumeration; never hand-carry a list.
- **Program lesson (0B):** report pass / skipped / fail separately; "total > N" accepts a run that converts passes into skips.

### Contract versioning law (`tech-spec.md` §3) — verbatim

> A **semantic** change (new required field, changed meaning, removed field) bumps the major version and **adds a new file** — it never mutates a published schema in place.

### Scope boundary

**Do not change `src/`, `tests/`, `config/`, or `docs/initial/`** (`tech-spec.md` §14). Cutdown work lives in `cutdown/`, `docs/video-editing/`, `docs/plans/`, `docs/progress/`, and the root `todos.md`.

### Stack

TypeScript (pnpm workspace, Node 24); Python worker (`uv`, ruff pinned by `cutdown/ruff.toml`). Contract generated trees are **committed** (D-24). `decisions.md` is **append-only settled law**.

### Available agents

`general-purpose` owns every implementation task. Gates run `code-reviewer`, `cutdown-boundary-reviewer` and `cutdown-measurement-reviewer` — all three exist natively. **Do NOT request** any UGC Critical-Path reviewer. **No spawned agent runs `git commit` or `git push`, ever.**

---

## 1. Scope — what the evidence kept, and what it dissolved

The old Stage 0 migration was `content-package-v2` + `render-v2` + `supersession-record-v1` + lineage machinery. What remains after D-56 and this session's measurements:

| Candidate | Fate | Evidence |
|---|---|---|
| `content-package-v2` | **DISSOLVED — not created** | The identity motive is dead (F-J, D-56). Stage 1's additions are declared **additive/minor** by its own plan (`phase-1.md:87`, task 11), so it needs no v2 either — it needs a plan-text amendment (task 10). Stage 5 owns its own later bump (the master plan §7 Stage-5 **Risk** line) under risk-rule 4 |
| `render-v2` | **KEPT — the whole stage** | Phase 5 residual 1 (`cutdown-phase-5-review.md:213-221`): `outputPath` + `captions.*Path` job-relative but constrained only by `minLength: 1`; tightening is breaking and was parked for exactly this deliberate bump. CR §4 designed and cross-validated the pattern |
| `supersession-record-v1` | **RETIRED** (0B-2, F-K) | unchanged |
| `render-manifest-v2` / `source-asset-v2` (pattern-tightening of the same path class) | **DEFERRED, named** — receiving home: the Stage 5 bump re-plan | Their fields are read-and-joined but guarded by the shared code guard every consumer imports (`artefact-paths.ts`, CR §4–5). Bundling them now multiplies the consumer sweep in the program's most defect-prone ground for defence-in-depth value. Deferring them is safe **only because the guard is structural**; the deferral row and D-62 both say so |
| Version-dispatching reader | **KEPT, narrowed** | F-N's rule applied to render: exactly **one** validating reader exists (`package`, CR §5); it dispatches on the envelope's declared major **before** the writer moves |

**Why now:** the master plan's Stage-0 **Order-critical** clause (§7 Stage summaries) requires the bump to land before real-output accumulation resumes. **MEASURED (CR §1): criterion 3's window holds 1/10 resolved real outputs — under the ≤3 threshold `phase-0b.md` §2 recorded.** T-4 asks the owner for 19 more outputs; every one produced before this lands raises the bump's cost. This stage is the cheapest it will ever be, and landing it closes Stage 0's engineering entirely.

**Why one family only, when the lesson says "fix the class":** the class fix for path safety already exists and is structural — `assertJobRelativePath`/`resolveArtefactPath` in `packages/contracts`, importable by every consumer, enforced by the `artefact-path-discipline` lint. The schema pattern is defence-in-depth *per family*, purchased at the price of a consumer sweep per family. The render family is the one with a named, owed residual; the others are deferred by name with their guard intact (D-62 records both halves).

## 2. Critical Paths touched

| Critical Path | Touched? | Reviewer |
|---|---|---|
| The four UGC paths | No — `tech-spec.md` §14 | — |
| **Cutdown tenancy & boundaries** | **Yes** — new schema file + versioning, generated trees, registry + mirror, artefact paths, reader-dispatch-before-writer | `cutdown-boundary-reviewer` |
| **Cutdown measurement honesty** | **Yes** — criterion 3 trajectory claims, `validate:contracts` case count, pytest/TS-test count movement, the "live status unchanged" claim | `cutdown-measurement-reviewer` |
| *(general)* | — | `code-reviewer` |

## 3. Decisions

- **D-62 (appended by task 9):** the Stage 0 deliberate contract bump is **`render-v2` only**. (a) `content-package-v2` is not created — its identity motive dissolved into D-56, and Stage 1's package additions are additive/minor by its own plan. (b) `render-manifest-v1` and `source-asset-v1` keep their pattern-less path fields, guarded by the shared code guard; their tightening is deferred to the next deliberate bump (Stage 5's re-plan), named here so the deferral is settled law rather than drift. (c) The `artefact-path-discipline` lint and the code guard **stay** — Phase 5 residual 1's "delete the lint's reason for existing" was an over-claim (the lint also covers the two deferred families, device names, and containment, which no JSON-Schema pattern can express). Changing how the bump is scoped changes what criterion 3 will detect; that is settled law.
- **D-13, D-33, D-47, D-56–D-61** — not edited; supersede-by-append only.

## 4. Requirements Checklist

| REQ / source | What this stage must satisfy | Owning task |
|---|---|---|
| tech-spec §3 | The semantic change **adds `render-v2.json`**; `render-v1.json` is byte-identical before/after | 2, B2 |
| PRD §15 Phase 0 criterion 3 | The bump is **detectable**: a post-bump package's contractSet against a pre-bump one classifies **breaking** via 0B-1's family logic | 8 (test), B6 |
| master plan §7 Stage-0 **Order-critical** clause | The bump lands while the window holds ≤3 resolved real outputs (holds 1, CR §1) | 1 |
| F-N (reader before writer) | `package` accepts both majors **before** the writer (`renderer-ffmpeg`'s adapter) emits v2; unknown major refused fail-closed with a non-destructive remedy | 4 before 5 |
| D-52 (shared version constant) | The envelope version is stamped from `RENDER_SCHEMA_VERSION` in `contracts/src/versions.ts`, drift-tested against the schema file — never a literal a later bump can miss | 5, B4 |
| F-O | `skills-sync.ts:214-216`'s false claim corrected in the same change | 7 |
| D-24 | Regenerated trees committed with the schema in the same change | 3 |
| `cd-measurement-honesty` R9 | Every count in this plan re-derived at build time against the artefact | §7, B8 |
| R1 (absence ≠ zero) | Live `status --phase0` byte-identical before/after — asserted by capture, not assumed | B5 |

## 5. Edge Cases & Failure Paths

- **A v2 instance also validates under v1.** The v2 schema only *narrows* (patterns added, nothing else moves), so a v2 record satisfies v1's shape. Dispatch therefore keys on the envelope's **declared** `schemaVersion` major — never on try-in-order validation, which would mask a mislabelled instance. A record declaring major 2 that fails v2's pattern is **invalid**, full stop — it is not retried against v1.
- **An unknown major (e.g. 3).** Refused fail-closed: the error names the majors this reader accepts and the file, and instructs re-running the producing skill or moving the file aside — never deleting evidence (`reviews.ts:341-342` wording precedent).
- **A missing/malformed envelope.** The existing `RENDER_ARTEFACT_UNREADABLE` path — same code, same non-destructive posture.
- **Existing v1 render records.** Never rewritten (immutability); keep validating as v1 through the dispatch, forever. The four `contractsUsed` lists gain `render-v2` and **keep `render-v1`** — dropping v1 would orphan every existing job's artefacts in the registry's model.
- **The pattern's blind spots.** `renders/nul.mp4` (device name) and symlinked escapes match the pattern; the code guard catches them at join time, as today. Stated in D-62 and in the v2 field descriptions so the schema never claims more than it enforces (the 2026-07-30 comment lesson).
- **The next minted package flips criterion 3.** Intended (CR §6): drift `breaking` naming the render family, `not_met` at any window size, self-healing by ~output 11 of the accumulation T-4 requires anyway. The review record states this trajectory so the first post-bump `not_met` is read as the machinery working.
- **`pnpm build` ordering.** F-H's order is embedded in the task sequence; `ContentPackageV2`-style symbols do not exist here, but `RenderV2` equally exists only after step-3 regeneration — consumer code compiles only after task 3.

## 6. Failure Modes & Degraded Behavior

| Boundary crossing | Failure | Degraded behavior | Spec that proves it |
|---|---|---|---|
| `package` reads a v2 render before the writer moves | pinned v1 validation refuses it | dispatch on declared major; both majors readable | `skill-runtime` dispatch test: v1 ✓, v2 ✓ |
| A render record declares major 3 | silently skipped or crash | refusal naming accepted majors + non-destructive remedy | dispatch test: unknown major |
| A render record declares major 2 but violates the pattern | fallback to v1 masks it | invalid — no cross-major retry | dispatch test: mislabelled instance |
| A traversal/absolute path in a v2 record | schema accepts (v1 behaviour) | schema **rejects** in both validators | `fixtures/render-v2/invalid/` ×3 |
| The bump lands; a package is minted after it | drift classifies `added` (the F-A defect) | **breaking** via family keying (0B-1) | `status.test.ts` post-bump-package test (task 8) |
| `skills sync --check` after registry edits | mirror drift | `skills sync` regenerates mirror; `--check` green at 10 skills | verification step 6 |

## 7. Implementation Tasks

*Order is F-H's build order and F-N's reader-before-writer, embedded. Every count marked (pin) is re-derived at build time; a mismatch is reported, never adjusted silently.*

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | **Constraint gate + before-capture.** Run `status --phase0` live; assert the window holds ≤3 resolved real outputs (expected: 1); capture the verbatim output as the "before" for B5 and the review record. If >3, **stop and surface** — the threshold is settled law (`phase-0b.md` §2) | general-purpose | (read-only) |
| 2 | **Write `render-v2.json`** — copy of `render-v1.json` with exactly five kinds of difference: `$id` `…/render-v2.json`; `schemaVersion` `"2.0.0"`; a changelog entry (breaking, path patterns, citing Phase 5 residual 1 and D-62); the CR §4 pattern on `outputPath` and `captions.assPath/srtPath/vttPath`; field descriptions updated to state what the pattern does **not** cover (device names, containment — code guard's job). `render-v1.json` untouched. **The lint gate is stated count-free [R1-fix]:** `lintAllSchemas()` returns **0 violations** (the probe proved this shape passes — CR §3; the artefact defines 12 rule ids, and the "18" that appeared in the spike and rev 1 has no artefact behind it) | general-purpose | `cutdown/packages/contracts/schemas/render-v2.json` (new) |
| 3 | **Regenerate and commit trees** (F-H steps 2–4): `pnpm build` → `build:contracts` → `pnpm build`. Expected diff (pin, CR §3): `generated/typescript/index.ts` modified; `generated/typescript/render-v2.ts` + `generated/python/cutdown_contracts/render_v2.py` new; **nothing else** — in particular `style_profile_v1.py` unchanged (no `Role` renumbering; spike residual 5 moot). A wider diff is a stop-and-report | general-purpose | `cutdown/packages/contracts/generated/**` |
| 4 | **Reader dispatch, one implementation.** New `readVersionedContractJson(path, basenames, code, what)` in `packages/skill-runtime` beside `readContractJson`: parse; read `envelope.schemaVersion` major; select the basename whose `-vN` matches; validate against that `$id`; unknown major → fail-closed refusal naming accepted majors, non-destructive remedy; malformed → existing unreadable path. **No cross-major retry** (§5). Switch `package/main.ts:160` to it with `['render-v1','render-v2']`, **and retire or repoint the stranded `RENDER_SCHEMA` constant at `package/main.ts:132` [R1-fix]** — a dangling pinned-`$id` survives as a future repoint hazard. Tests: v1 instance, v2 instance, major-3 refusal (message asserted), major-2-with-bad-path invalid (not retried against v1), **and the premise test [R1-fix]: a valid v2 fixture passes the v1 validator** — asserting §5's "a v2 instance also validates under v1", which is what makes no-cross-major-retry a *choice* rather than a necessity (the 2026-07-30 comment lesson) | general-purpose | `cutdown/packages/skill-runtime/src/index.ts` + tests, `cutdown/skills/package/src/main.ts` |
| 5 | **Writer moves — via the D-52 shared-constant mechanism, at the real writer [R1-fix, the BLOCK].** The render record's envelope is hand-built in **`packages/renderer-ffmpeg/src/adapter.ts:485-491`** with a literal `'1.0.0'`; `renderer-ffmpeg` cannot import `skill-runtime` (deps: `@cutdown/contracts`, `@cutdown/renderer-core` only). So: (a) add `RENDER_SCHEMA_VERSION = '2.0.0'` to `packages/contracts/src/versions.ts` with its drift test asserting the constant equals `render-v2.json`'s `schemaVersion` (precedent: `PLATFORM_EDL_SCHEMA_VERSION`, `versions.test.ts:11-16` — D-52's "a bump that misses this file fails the suite"); (b) `adapter.ts:488` stamps from the constant, never a literal; (c) the review record proves by grep that the adapter is the **sole** envelope-construction site for render records — a second stamper is the D-52 failure verbatim. **The grep key is pinned [R2-fix]:** grep for inline envelope construction (`schemaVersion:` object-literal sites) **and** `skillEnvelope(` calls across `apps`, `skills`, `packages`, `workers` — a stamper necessarily contains one of the two; the plan's dual-key read-site grep (`render-v1`/`render.json`) provably finds neither (zero hits on `adapter.ts`). The match list in the review record must be **non-empty and contain `adapter.ts`**, or the proof is vacuous (R8, the A12 lesson). Test: a rendered record's envelope says `2.0.0` and validates against `render-v2`'s `$id`; its templated paths satisfy the pattern. After task 4 is green | general-purpose | `cutdown/packages/contracts/src/versions.ts` + `tests/versions.test.ts`, `cutdown/packages/renderer-ffmpeg/src/adapter.ts` + tests |
| 6 | **Fixtures** — 1 valid (realistic v2 record, envelope `2.0.0`) + **4 invalid [R1-fix]**: traversal `../`, absolute `/`, drive-letter `C:`, **empty-segment `a//b`** — all four classes CR §4 verified cross-engine; dropping one is the name-three-sites-leave-the-fourth failure, and an unexercised class gets no cross-validator-agreement evidence. (pin) `validate:contracts` case count moves 42 → **47** (each fixture file is one case; +5 files), 0 failures, **0 cross-validator disagreements** — the disagreement gate is the Python-side proof of the pattern (no pytest test reads the per-contract valid/invalid buckets; the one pytest consumer under `fixtures/` is the `range-check` corpus, untouched here **[R2-fix]**) | general-purpose | `cutdown/packages/contracts/fixtures/render-v2/{valid,invalid}/**` (new) |
| 7 | **Metadata sweep, derived not hand-carried.** Re-derive by grep — **on both the contract name (`render-v1`) and the artefact filename (`render.json`) [R1-fix]**, because a version-agnostic reader contains no version string (that grep gap is how `editorial.ts:48-67`'s bare-parse walk was missed in rev 1) — then update: `contractsUsed` in the 4 SKILL.md files (add `render-v2`, **keep `render-v1`**, §5); 4 rows in `skills/registry.json`; run `skills sync` to regenerate the `.claude/skills/cutdown-*` mirror; correct F-O's false claim in **both homes [R1-fix]** — the doc comment at `skills-sync.ts:214-216` **and** the printed problem message at `:250-255` (a fix that corrects the comment and ships the claim in the user-facing string is the signature failure verbatim); update `artefact-paths.ts:9-11`'s comment (render's fields now patterned in v2; manifest + source-asset still code-guard-only; lint stays); **and `package/main.ts:575`'s comment [R1-fix]**, **and the `artefact-path-discipline.test.ts:13-16` header [R2-fix]** — the third home of the same residual comment ("tightening those patterns would be a BREAKING change"): after v2 lands, the render half of that residual is discharged and each comment names both majors and the two still-deferred families, or reads as if no pattern exists anywhere. The greps that derived the list are recorded in the review record | general-purpose | 4× `SKILL.md`, `skills/registry.json`, `.claude/skills/cutdown-*` (via sync), `cutdown/apps/cli/src/commands/skills-sync.ts`, `cutdown/packages/contracts/src/artefact-paths.ts`, `cutdown/skills/package/src/main.ts` |
| 8 | **The detection proof.** `status.test.ts`: a hand-authored pre-bump package (render family `{1}`) followed by a post-bump package (`{1,2}`) yields **breaking** drift naming the render family and criterion 3 `not_met` — the F-A trap closed by 0B-1, now exercised on the real transition this stage performs. Plus: the live-tree case — `currentContractSet()` now contains 15 entries including both render majors; assert the family reducer reports the render family as `{1,2}` with `from` = max (B4's order-independence, exercised on the live tree) | general-purpose | `cutdown/apps/cli/tests/status.test.ts`, `cutdown/packages/contracts/tests/contract-set.test.ts` |
| 9 | **Append D-62** to `decisions.md` (§3's three clauses, with reasons) | general-purpose | `docs/video-editing/decisions.md` |
| 10 | **Plan-text amendments** citing D-62: `phase-1.md:87` and task 11/:135 (and its Files table row) point at `content-package-v1` **additive/minor** instead of `content-package-v2`; no other stage's file is touched. `phase-0b.md` §9 gets a one-line pointer to this plan (banner precedent, task 14 of 0B). **Correct the spike's phantom number in place [R1-fix]:** spike F-H's "all 18 lint rules" gets the dated-correction blockquote treatment (the established convention — the spike already carries four such corrections) with the measurement: `subset-lint.ts` defines **12** rule ids. **And retire `phase-0b.md`'s dead citations [R2-fix]:** its four "roughly 4×" claims cite `todos.md:26`, but T-1 graduated into D-56 (its `todos.md` row is gone; `:26` now lands inside T-3) and the only measurement on disk says **2×** (`stage-0b-review.md:77`) — a dated-correction blockquote in `phase-0b.md` retires the invented figure's last live home; the ≤3 threshold on the same line is unaffected (verified live this session) | general-purpose | `docs/plans/cutdown-product-program-phase-1.md`, `docs/plans/cutdown-product-program-phase-0b.md`, `docs/progress/cutdown-product-program-stage-0b-spike.md` |
| 11 | **After-capture + review record** — verbatim before/after `status --phase0`, **both captured fresh from live runs [R1-fix]** (the 0B review record's "verbatim" pastes are excerpts — a byte-comparison against them fails spuriously); the criterion-3 trajectory statement (CR §6, unit named: heals earliest at the **11th resolved real output overall**, the 10th of T-4's 19 further outputs); the complete B5 mechanism stated — `createAjv` (`packages/contracts/src/ajv.ts:42-45`) **does** read the live schemas tree on the status path, inertly for v1 validation, so "status never reads the live tree" must not harden into a comment [R1-fix]; every (pin) re-derived with its measured value; residuals table; the derived-grep evidence from tasks 5 and 7. **Re-verify the `reviews.ts` non-destructive-wording line number cited in §5 [R1-fix]** (0B residual 6's citation-drift class) | general-purpose | `docs/progress/cutdown-product-program-stage-0b3-review.md` (new) |
| 12 | **Master plan: Progress Tracking + Deferral Ledger [R1-fix].** Progress Tracking: 0B-3 → Complete with evidence pointer; Stage 0 row updated honestly per D-38 — **engineering complete; A7 (CI green on a clean clone) still unverifiable from this environment and stays open**; T-2/T-3/T-4 remain owner-blocked. Deferral Ledger (§6): the `render-v1` path-patterns row (`master-plan.md:105`) marked discharged by this stage, and **one new row** naming the Stage 5 bump re-plan as receiving stage for: `render-manifest-v1`/`source-asset-v1` pattern-tightening (D-62b), spike residual 5 (`Role3` pinning — the schemas Stage 5 adds are exactly the ones F-F measured renumbering it), and 0B residual 10 (commons/enums invisible to criterion 3). The ledger is the program's single home for deferrals; two of three homes is how the third disagrees | general-purpose | `docs/plans/cutdown-product-program-master-plan.md` |

## 8. Handoff Contracts

Consumed by later stages:

- **`render-v2.json`** — the render family's current major. Stage 2's Review Studio reads render records through whole-artefact validation; from this stage on, that validation enforces path shape at the boundary for v2 records.
- **`readVersionedContractJson`** — the single dispatch implementation. Stage 2's transport and any future multi-major family reader use it, never a second dispatch rule.
- **The deferral row** — `render-manifest-v1`/`source-asset-v1` pattern-tightening belongs to Stage 5's bump re-plan (D-62b). Stage 5's planner must find it there, not rediscover it.

**Not handed off, deliberately:** no `content-package-v2` (Stage 1 must plan against v1, additive-only — task 10 makes its plan say so).

## 9. Files to Create / Modify

| Path | New/Modified |
|---|---|
| `cutdown/packages/contracts/schemas/render-v2.json` | **New** |
| `cutdown/packages/contracts/generated/typescript/index.ts` | Modified (regenerated) |
| `cutdown/packages/contracts/generated/typescript/render-v2.ts` | **New** (generated) |
| `cutdown/packages/contracts/generated/python/cutdown_contracts/render_v2.py` | **New** (generated) |
| `cutdown/packages/contracts/fixtures/render-v2/**` | **New** (1 valid + 4 invalid) |
| `cutdown/packages/skill-runtime/src/index.ts` + tests | Modified (dispatch helper) |
| `cutdown/skills/package/src/main.ts` | Modified (dispatch at `:160`; stranded `RENDER_SCHEMA` at `:132`; comment at `:575`) |
| `cutdown/packages/contracts/src/versions.ts` + `tests/versions.test.ts` | Modified (`RENDER_SCHEMA_VERSION` + drift test) **[R1-fix]** |
| `cutdown/packages/renderer-ffmpeg/src/adapter.ts` + tests | Modified (envelope stamped from the constant) **[R1-fix]** |
| `cutdown/skills/{approve,package,render,revise}/SKILL.md` | Modified (`contractsUsed`) |
| `cutdown/skills/registry.json` | Modified (4 rows) |
| `.claude/skills/cutdown-*` | Modified (via `skills sync`) |
| `cutdown/apps/cli/src/commands/skills-sync.ts` | Modified (comment, F-O) |
| `cutdown/packages/contracts/src/artefact-paths.ts` | Modified (comment) |
| `cutdown/apps/cli/tests/status.test.ts`, `cutdown/packages/contracts/tests/contract-set.test.ts` | Modified (task 8) |
| `docs/video-editing/decisions.md` | Modified (append D-62) |
| `docs/plans/cutdown-product-program-phase-1.md`, `phase-0b.md`, master plan (Progress Tracking **and** Deferral Ledger), `docs/progress/cutdown-product-program-stage-0b-spike.md` (F-H correction) | Modified (tasks 10, 12) |
| `docs/progress/cutdown-product-program-stage-0b3-review.md` | **New** |

**`render-v1.json` is not in this table because it does not change** — asserted by B2's git diff, not by this sentence.

## 10. Verification Steps

1. `cd cutdown && pnpm build` — clean (requires task 3's regeneration first for consumer code).
2. `build:contracts --check` — PASS, trees current, committed diff exactly the task-3 pin.
3. `validate:contracts` — PASS, **47 cases** (pin), 0 lint, 0 failures, **0 cross-validator disagreements** — this gate is the Python-side proof of the pattern.
4. `uv run pytest -q` — 0 fail; capture the summary line; **689 passed, delta exactly 0 [R1-fix]** — no pytest test reads the per-contract valid/invalid fixture buckets (the Python side of that validation is `validate_fixtures.py`, spawned by `validate:contracts`; the one pytest consumer under `fixtures/` is the `range-check` corpus at `test_bounds.py:24`, which this stage does not touch **[R2-fix]**), so any movement here is unexplained and is a stop-and-report.
5. `pnpm -r --no-bail run test` — **fail == 0 AND skipped <= 5 AND pass >= 969**, each named separately; the pass-count delta equals the new tests added (pin at build time). Baseline: 974 = 969 pass + 5 skipped + 0 fail.
6. `skills sync --check` — PASS, 10 skills, after the task-7 sync.
7. `ruff check --config ruff.toml .` — clean.
8. `doctor` — 7/7.
9. `status --phase0` — **byte-identical to the task-1 capture** (B5).
10. `git diff --exit-code <baseline> -- cutdown/packages/contracts/schemas/render-v1.json` exits 0, after `git ls-tree` proves the pathspec non-vacuous (the A12 lesson: a bare pathspec that matches nothing passes vacuously).
11. Render-check `decisions.md`: D-62 renders inside the table.

## 11. Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| B1 | `render-v2.json` exists, differs from v1 in exactly the five stated kinds of change, and `lintAllSchemas()` returns 0 violations | schema diff + `validate:contracts` |
| B2 | `render-v1.json` byte-identical to baseline; pathspec proven non-vacuous first | verification step 10 |
| B3 | Both majors readable through **one** dispatch implementation; major-3 refused naming accepted majors, non-destructively; a major-2 instance with a traversal path is invalid and **not retried** against v1; a valid v2 fixture **passes the v1 validator** (the premise test) | `skill-runtime` tests ×5 |
| B4 | The render record's envelope is stamped from `RENDER_SCHEMA_VERSION` (no version literal in `renderer-ffmpeg`); the drift test pins the constant to `render-v2.json`; the record validates against `render-v2`; the adapter is the sole envelope-construction site, proven by the **pinned** grep (`schemaVersion:` literals + `skillEnvelope(` calls), whose match list is non-empty and contains `adapter.ts` | `versions.test.ts` + adapter test + review-record grep with its key and match list recorded |
| B5 | Live `status --phase0` **byte-identical** before/after the whole stage, both sides captured fresh | verbatim captures in the review record |
| B6 | A post-bump package against a pre-bump package classifies **breaking**, naming the render family; criterion 3 `not_met` | `status.test.ts` (task 8) |
| B7 | `validate:contracts` = 47 cases, 0 failures, 0 cross-validator disagreements — the pattern behaves identically in both engines, all four invalid classes exercised | verification step 3 |
| B8 | Every pinned count re-derived at build and reported with pass/skip/fail split; no "total > N" claim anywhere | review record + verification 4–5 |
| B9 | The registry/mirror/SKILL.md sweep was **derived by grep at build time** and the grep is recorded; `contractsUsed` keeps `render-v1` | review record + `skills sync --check` |
| B10 | D-62 appended (three clauses); `phase-1.md` no longer instructs building on `content-package-v2` | `decisions.md` render-check + grep |
| B11 | The F-O comment no longer claims `skills sync --check` detects a family bump | `skills-sync.ts` diff |
| B12 | The review record states the criterion-3 trajectory (first post-bump package ⇒ `not_met`, self-healing by ~output 11) | review record |

## 12. Out of Scope (Surgical Changes)

- **Do not** create `content-package-v2.json`, `render-manifest-v2.json`, `source-asset-v2.json`, or `supersession-record-v1.json`.
- **Do not** edit `render-v1.json` or any published schema in place; **do not** hand-edit anything under `generated/`.
- **Do not** rewrite existing render records or delivered packages.
- **Do not** delete or weaken the `artefact-path-discipline` lint or the code guards.
- **Do not** promote `approve`/`revise`'s bare-parse render reads to validating reads (pre-existing, named in CR §8; widening the fatal surface is its own decision with its own gate).
- **Do not** touch `src/`, `tests/`, `config/`, `docs/initial/`.
- **Do not** retire `render-v1` from `contractsUsed` or from disk.
- **Do not** start Stage 1 contracts, the HTTP layer, or any UI.
- **Do not** renumber `decisions.md`; D-62 is the next free number (D-59/D-60 reserved elsewhere, D-61 taken).

## 12a. Recorded residuals — carried knowingly

| # | Residual | Disposition |
|---|---|---|
| 1 | **0B residual 10** — a semantic change under `schemas/common/` or `enums/` is invisible to criterion 3 (`currentContractSet()` records only the 14 top-level contracts; 15 after this stage). This stage changes no commons/enums file, so the gap is not widened | re-pointed to the **Stage 5 bump re-plan**, alongside D-62b's deferred families — task 11 records it |
| 2 | `approve`/`revise`/**`editorial.ts:48-67`** bare-parse render reads (CR §5, corrected — rev 1's "every site" claim missed the `editorial.ts` walk because its grep keyed on `render-v1`, which a version-agnostic reader does not contain) — all version-agnostic, pre-existing | named, unchanged (§12); task 7's grep rule widened so the enumeration cannot re-open |
| 2b | Spike residual 5 (`Role3` unpinned against codegen renumbering) — moot for this stage (CR §3: `render-v2` alone renumbers nothing) but **not dropped**: the schemas Stage 5's bump adds include the kind F-F measured renumbering it, and the spike's own general statement holds — "adding any schema can renumber" **[R2-fix]** | re-pointed to the Stage 5 bump re-plan via task 12's ledger row |
| 3 | The `readJson` unvalidated `creativeBriefId` read (spike F-I caveat) | 0B-2's residual, unchanged here |

## 13. Completion Criteria (Definition of Done)

- Every verification step passes, or any miss is reported as exactly that.
- `code-reviewer`, `cutdown-boundary-reviewer` and `cutdown-measurement-reviewer` report PASS on the diff.
- Cross-referenced docs consistent in the same change: `decisions.md`, `phase-1.md`, `phase-0b.md` pointer, master plan Progress Tracking, the review record.
- **The milestone claim is honest (D-38):** this stage completes Stage 0's *engineering*. `PHASE_0_EXIT_EARNED` stays red (T-2/T-3/T-4 owner-blocked; A7 unverifiable from this environment); live status is unchanged today and the *next* minted package will turn criterion 3 `not_met` **by design**. Reported as exactly that, never softened.
