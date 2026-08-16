# Plan review — cutdown-product-program Stage 0B-3 (rev 3)

> **Correction (2026-08-11, code gate round 2).** This record cites `master-plan.md:105/:162/:187` as verified line anchors. They were correct when this gate ran; the 0B-3 build itself then reflowed the master plan (the §6 Deferral Ledger edit added one net line above them), so `:162` (the Stage-0 Order-critical clause) and `:187` (the Stage-5 Risk line) each moved one line down. The verdict history below is NOT edited — it records what this gate saw at the time; read those anchors against commit `0a0599e`, or use the anchor-stable names ("§7 Stage-0 Order-critical clause", "§7 Stage-5 Risk line") every live document now uses.


**Readiness: Ready · Grade: A- · Every task is executable from the plan text alone, every pre-mortem cause has a receiving task, and every load-bearing number and file:line citation re-verified against the code — nine low-severity notes recorded, none blocking.**

**Reviewer:** plan-reviewer (final integrity + consolidation gate) · **Date:** 2026-08-10
**Under review:** `docs/plans/cutdown-product-program-phase-0b3.md` (rev 3) with evidence base `docs/progress/cutdown-product-program-stage-0b3-codebase-review.md`, against `phase-0b.md` §2/§9 and `master-plan.md` §7a/§10.

## Verdict history

| Round | Reviewer | Verdict | Disposition |
|---|---|---|---|
| 1 | `cutdown-boundary-reviewer` | **BLOCK** — writer misidentified: the plan named `render/main.ts` as the envelope stamper; the real stamper is a hand-built literal at `renderer-ffmpeg/src/adapter.ts:485-491`, in a package that cannot import `skillEnvelope` | RESOLVED in rev 2 via the D-52 shared-constant mechanism (`RENDER_SCHEMA_VERSION` in `contracts/src/versions.ts` + drift test) |
| 1 | `cutdown-measurement-reviewer` | **NEEDS CHANGES** — five unreconciled numbers, incl. the phantom "18 lint rules" (the artefact defines 12) and a pytest pin over a population pytest does not read | RESOLVED in rev 2: 47-case pin, pytest 689 / delta exactly 0, count-free lint gate, fourth invalid fixture class, deferral ledger row |
| 2 | `cutdown-boundary-reviewer` | **NEEDS CHANGES** — rev 2's "no pytest test reads contract fixtures" was a new categorical falsehood (`test_bounds.py:24` drives a suite from the `range-check` corpus); a third home of the pattern-residual comment (`artefact-path-discipline.test.ts` header) missing from task 7 | APPLIED as rev 3 (claim narrowed to the per-contract valid/invalid buckets; third home added) |
| 2 | `cutdown-measurement-reviewer` | **NEEDS CHANGES** — B4's sole-stamper grep had no stated key and the dual read-site key provably finds no stamper (zero hits on `adapter.ts`); four stale "roughly 4x" / `todos.md:26` citations in `phase-0b.md`; §12a row 2b's "exactly" over-claim | APPLIED as rev 3 (grep key pinned: `schemaVersion:` object-literal sites + `skillEnvelope(` calls, match list must be non-empty and contain `adapter.ts`; dated-correction added to task 10; "exactly" softened to "include") |
| 3 | plan-reviewer (this review) | **READY** | see below |

All round-1 and round-2 findings verified as actually present in rev 3's text (not merely claimed applied): the pinned grep key in task 5/B4, the narrowed pytest claim with its `test_bounds.py:24` citation in task 6 and verification step 4, the third comment home in task 7, the four-citation correction in task 10, and "include" in §12a row 2b.

## Execution simulation (task-by-task, as the Owner agent)

- ✅ Task 1 — executable: command named (`status --phase0`), threshold named (≤3, verified at `phase-0b.md:119`), expected value (1) cited to CR §1, stop-and-surface branch stated.
- ✅ Task 2 — executable: exactly five kinds of difference enumerated; the pattern is written out verbatim in CR §4; the lint gate is count-free with the probe evidence cited. `render-v1.json`'s `outputPath` / `captions.{ass,srt,vtt}Path` verified on disk as `minLength: 1` only.
- ✅ Task 3 — executable: exact three-file diff pin (probe-measured, CR §3); wider diff is stop-and-report. Verified no existing test hardcodes a 14-contract count (`contract-set.test.ts:268-282` asserts sort + major/version agreement, not length), so the 15th entry breaks nothing pre-existing.
- ✅ Task 4 — executable: signature, placement (beside `readContractJson` — verified at `skill-runtime/src/index.ts:473`), dispatch rule, both failure paths, five named tests, and the stranded `RENDER_SCHEMA` at `package/main.ts:132` (verified; the reader at `:160` goes through the local `readContract = readContractJson` alias at `:119`).
- ✅ Task 5 — executable: real writer verified at `adapter.ts:488` (literal `'1.0.0'` in a hand-built envelope); `renderer-ffmpeg/package.json` confirms no `skill-runtime` dependency; precedent `PLATFORM_EDL_SCHEMA_VERSION` + `versions.test.ts:11-16` verified verbatim. The pinned sole-stamper grep verified **non-vacuous by independent execution**: `schemaVersion:` finds `adapter.ts:488`; `skillEnvelope(` finds 8 call sites, none a render-record stamper.
- ✅ Task 6 — executable: 1 valid + 4 named invalid classes; case arithmetic verified (43 fixture JSON files on disk minus the 1 `range-check/cases.json` corpus = 42 cases today; +5 = 47).
- ✅ Task 7 — executable: derived-by-dual-key-grep rule stated; all comment/metadata homes carry verified line citations (`skills-sync.ts:214-216` and `:250-255`, `artefact-paths.ts:9-11`, `package/main.ts:575`, `artefact-path-discipline.test.ts:13-16` — all re-read this session and correct); 4 SKILL.md `render-v1` entries and 4 `registry.json` rows (`:21,117,194,219`) verified.
- ✅ Task 8 — executable: both tests specified with inputs and expected classifications; the `currentContractSet()` 15-entry claim is consistent with the 14 top-level schemas on disk + `render-v2.json`.
- ✅ Task 9 — executable: D-62's three clauses are written out in §3. D-62 verified as the next free number (D-61 present at `decisions.md:78`; no D-62 exists).
- ✅ Task 10 — executable: `phase-1.md:87` and `:135` verified as the two `content-package-v2` references; the four "roughly 4x" claims verified at `phase-0b.md:33`, `:119`, `:225`, `:243`; `todos.md:26` verified to now land inside T-3 (T-1 gone); the spike-correction convention (dated blockquote) named with precedent.
- ✅ Task 11 — executable: contents enumerated; fresh-capture rule stated; the `reviews.ts:341-342` re-verification instruction is satisfied today (wording verified at exactly those lines) and correctly ordered as a build-time re-check.
- ✅ Task 12 — executable: both master-plan homes named; ledger row contents enumerated (D-62b families, spike residual 5, 0B residual 10); `master-plan.md:105` and `:162` verified as the cited rows.

No task requires information outside the plan and its two cited evidence documents.

## Pre-mortem (assume it shipped and failed — where would the cause land?)

- ✅ **A second render-record stamper survives the move** — absorbed at task 5(c)/B4 with a pinned, non-vacuity-checked grep key; both keys re-run this review and the match list is non-empty and contains `adapter.ts`.
- ✅ **A validating reader missed by the sweep refuses v2 records** — independently re-ran the dual-key grep (`render-v1` + `render.json`) across the src trees: the only validating reader is `package/main.ts:132/:160`; `approve:90`, `revise:125`, `editorial.ts:55` are bare-parse version-agnostic (named residual 2; §12 forbids widening them); `render/main.ts:472/:682` are the writer's path joins. Task 7 records the grep so the enumeration cannot silently re-open.
- ✅ **The first post-bump `not_met` is read as a regression** — absorbed at §5 ("the next minted package flips criterion 3 — intended"), B12, and task 11's trajectory statement with the unit pinned. Arithmetic checks out: 1 current resolved output + 10 post-bump = the pre-bump package leaves the 10-output span at the 11th.
- ✅ **`status --phase0` silently changes byte-wise** — verified `status.ts` imports `createAjv` (which registers every live schema, inertly — `ajv.ts:42-45`) and never calls `currentContractSet()`; B5 asserts by fresh capture, not assumption, and CR §6's precision note forbids hardening "status never reads the live tree" into a comment.
- ✅ **Codegen renumbers an unrelated Python class (`Role3`)** — measured moot for `render-v2` alone (CR §3 probe: `style_profile_v1.py` unchanged) and not dropped: re-pointed to the Stage 5 bump re-plan via task 12's ledger row (§12a row 2b).
- ✅ **The Python validator silently skips the new family, making the 0-disagreement gate vacuous** — checked `validate_fixtures.py`: discovery is by the shared `{valid,invalid}` bucket convention, a fixture directory with no schema is a reported failure, and a missing generated model is a `SystemExit` — a discovery miss cannot be silent.
- ✅ **`skills sync --check` drifts after registry edits** — task 7 runs `sync`, verification step 6 re-checks at 10 skills (10 skill dirs and 10 `cutdown-*` mirror entries verified on disk).
- ✅ **Dispatch masks a mislabelled instance via try-in-order** — §5 forbids it by design (dispatch on the declared major, no cross-major retry) and task 4's premise test makes the choice assertable rather than a comment claim.
- ✅ **Unknown major refused with a destructive remedy** — §5 pins the `reviews.ts:341-342` non-destructive wording precedent (verified verbatim on disk).
- ✅ **Stage 1 builds on the dissolved `content-package-v2`** — task 10 amends `phase-1.md` in the same change; B10 asserts it by grep.

## Mechanical consistency

All checks re-run, not trusted:

- **Coverage parity** — the consumer-metadata enumeration (4 SKILL.md + 4 registry rows + mirror + comment homes + F-O's 2 homes) matches an independent grep 1:1. The fixture-class enumeration (4 invalid) matches CR §4's cross-engine probe classes.
- **Closure (tasks vs Files table)** — every task-column file appears in §9 and vice versa, with one implicit cell noted below (finding 4). The read-only task 1 correctly has no row. `render-v1.json`'s deliberate absence is asserted by B2's git machinery, not prose.
- **Owner agents** — `general-purpose` (native), `code-reviewer`, `cutdown-boundary-reviewer`, `cutdown-measurement-reviewer` all verified present in `.claude/agents/`.
- **Acceptance criteria** — B1–B12 each carry a concrete evidence pointer (test name, verification step, capture, or recorded grep); none is "it works".
- **Ordering** — F-H's build order (schema → build → regenerate → build → consumers → fixtures → checks) is embedded in tasks 2→3→4/5→6→7; F-N's reader-before-writer is task 4 before task 5 with an explicit "after task 4 is green".
- **Deferral ledger** — all three deferrals (D-62b families, spike residual 5, 0B residual 10) name the Stage 5 bump re-plan as receiving home; task 12 lands the ledger row.
- **Handoff contracts** — `render-v2.json`, `readVersionedContractJson`, and the deferral row are pinned in §8; the deliberate non-handoff (no `content-package-v2`) is stated with its enforcement task.
- **Number provenance** — every pinned number re-derived this session: 42→47 cases (43 fixture files − 1 corpus + 5), 14→15 contracts, 969/5/974 baseline (matches master-plan §10's 0B row), 689 pytest (cited), 10 skills, 4 registry rows, 1/10 window (CR §1 MEASURED), ≤3 threshold (`phase-0b.md:119`), four 4x citations, 12 lint rule ids (measured at the round-1 gate; the gate itself now stated count-free).
- **Citation spot-checks** — `adapter.ts:485-491` ✓, `versions.test.ts:11-16` ✓, `package/main.ts:132/:160/:575` ✓, `skills-sync.ts:214-216/:250-255` ✓, `artefact-paths.ts:9-11` ✓, `artefact-path-discipline.test.ts:13-16` ✓, `reviews.ts:341-342` ✓, `ajv.ts:42-45` ✓, `test_bounds.py:24` ✓, `phase-1.md:87/:135` ✓, `master-plan.md:105/:162/:187` ✓, `todos.md:26` ✓, D-62 free ✓.

## Consolidated findings (mine; prior reviewers' findings all verified applied)

None blocking. Reported per the no-self-filtering rule, each with severity and confidence:

1. **Task 4 test-input ambiguity** (low; high confidence it is ambiguous, low impact). Task 4's tests reference "a valid v2 fixture", but fixtures land in task 6, two tasks later. The implementer should hand-author the instances inline in the `skill-runtime` tests (the natural reading); reading `fixtures/render-v2/valid/` instead would silently invert the stated order. One clause closes it.
2. **Verification step 10's `<baseline>` is an unpinned placeholder** (low). 0B pinned `276176e` explicitly; the CR names `0a0599e`, but commits have landed since. Say the baseline is the HEAD recorded at task-1 time and that the review record pins the hash. Executable as-is via the non-vacuity check, but the hash's home is unstated.
3. **B4's "no version literal in `renderer-ffmpeg`" is over-broad as written** (low). `renderer-ffmpeg/tests/render-determinism.test.ts:68` legitimately carries a `schemaVersion` literal in a PlatformEDL *input fixture*. Read literally, B4 is unsatisfiable without pointless churn; scope it to the render-record envelope construction in `src/` (plainly its intent).
4. **Files-table closure, one implicit cell** (low). Task 7's third comment home, `packages/skill-runtime/tests/artefact-path-discipline.test.ts`, is covered in §9 only by the "`skill-runtime/src/index.ts` + tests" row, annotated "(dispatch helper)". A reader working from the Files table alone could miss the header edit; the task text is explicit.
5. **The new adapter test vs `skipped <= 5`** (low / informational). If task 5's "rendered record's envelope says 2.0.0" test executes through FFmpeg like the determinism suite, it must not skip in this environment or verification step 5's skip ceiling breaks. FFmpeg is present (`doctor` 7/7) so this holds today; stating "the envelope assertion must not be skip-gated" would make it robust.
6. **Invalid fixtures are not pinned single-defect** (low). Nothing requires each invalid fixture to differ from the valid one *only* in the offending path, so a multi-defect fixture would pass the 0-disagreement gate without exercising the pattern in either engine. Mitigated by CR §4's 13-case direct cross-engine probe; one sentence in task 6 closes it fully.
7. **"Depends only on `@cutdown/contracts` + `@cutdown/renderer-core`"** (cosmetic). `renderer-ffmpeg` also depends on `ulid`. Irrelevant to the workspace-import-boundary argument the sentence makes, but "only" is imprecise.
8. **Two stale prose homes task 12 does not explicitly reword** (low). The master plan's 0B-3 Progress row still describes the stage as "`content-package-v2` / `render-v2`", and §9 risk-rule 4 says Stage 0 "bundles every known breaking bump into one deliberate change" — both read stale once D-62 lands (render-v2 only; manifest/source-asset deferred to Stage 5's bump). Task 12 updates the Progress row and adds the ledger row (the load-bearing homes, and `master-plan.md:187` already anticipates Stage 5's bump) but does not name the risk-4 phrasing. Worth one line during task 12.
9. **Task 10's "and its Files table row" for `phase-1.md`** (very low). The Files row at `phase-1.md:148` already reads `{creative-brief,content-package}-v*.json (additive/minor only)` — version-agnostic. The only v2-naming occurrences are `:87` and `:135`; the grep-derived sweep resolves this regardless.

## Verdict

**READY.**

An implementer with only this plan, its codebase review, and the two cited prior artefacts can build every task; every stated number was re-derived and held; the pre-mortem's likely failure causes each map to a task, criterion, or named residual with a receiving home; both specialist reviewers' two rounds of findings are verifiably applied in rev 3. The nine notes above are one-clause tightenings the Owner agent can absorb during the build without a further plan round — none changes a design decision, an ordering, or an acceptance criterion.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
