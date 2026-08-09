# Stage 0A review — cutdown product program

**Date:** 2026-08-09 → 2026-08-10
**Plan:** `docs/plans/cutdown-product-program-phase-0.md` §7a (Stage 0A half)
**Baseline:** commit `501f212`
**Verdict:** **Ready (Almost — 4 residuals, all named below)**
**Milestones changed:** **none.** `PIPELINE_IMPLEMENTATION_COMPLETE` stands from 2026-08-02; `PHASE_0_EXIT_EARNED` still red; `PHASE_3_ACCEPTED_LIVE` still blocked on D-21.

---

## What Stage 0A is, and what it deliberately is not

Stage 0 was split (plan §7a, decided 2026-08-09) after three plan-review rounds returned BLOCK three times, with every round's fixes introducing new defects and essentially all findings landing on one thing: the contract migration. **0A is the half that does not touch contracts.** Tasks 1, 2, 15, 16, 17, 18, 19, 20, 21.

**0B — tasks 3–14 — is not started and is not attempted here.** No schema changed in this stage; `git diff --exit-code 501f212 -- cutdown/packages/contracts/schemas/` is clean over a pathspec that matches 18 tracked files (checked for vacuity, per the plan's own A12 lesson).

## Entry gate

Green, re-run after every reviewer round.

| Command | Result |
|---|---|
| `pnpm build` | clean |
| `build:contracts --check` | PASS — trees current |
| `validate:contracts` | PASS — 42 cases, 0 lint, 0 failures, **0 cross-validator disagreements** |
| `skills sync --check` | PASS — 10 skills, no orphan mirrors |
| `cutdown doctor` | 7/7, exit 0 |
| `pnpm -r --no-bail run test` | **901 pass / 0 fail / 5 skipped** = 906 total (baseline 857 pass / 2 skipped = 859) |
| `uv run pytest -q` | **689 passed / 0 fail** (unchanged — the evidence the ruff fixes were behaviour-preserving) |
| `ruff check --config ruff.toml .` | clean, under the **widened** D-58 selection |

The five skips are honest: 2 pre-existing Windows symlink-privilege tests, and 3 POSIX-only cases that this stage converted **from silent early returns into real skips** (see residual note and the reviewer findings below).

## Delivered

**Task 1 — the two missing Cutdown reviewers.** `cutdown-measurement-reviewer` + `cd-measurement-honesty` (R1–R9), `cutdown-boundary-reviewer` + `cd-tenancy-boundaries` (B1–B8). Authored **first** so they gate this stage's own diff, which is what the plan sequenced them for. They take a `cd-` skill prefix deliberately: `orphanMirrors` fails `skills sync --check` on any hand-written `.claude/skills/cutdown-*` directory.

**Task 2 — the gate set agrees in both places.** `CLAUDE.md`'s Critical-Path table and `tech-spec.md` §14 both carry the two new rows, with identical trigger lists. §14 previously said the Critical-Path gates "do not apply to Cutdown" full stop; it now says the *UGC* gates do not apply, and that the exemption is from those gates rather than from gating.

**Tasks 15/16 — the multi-asset audio-event defect (D-51's remaining half), now gated.** Written in a prior session and never reviewed; reviewed here. `clip.assetId` is carried into the projection and events are filtered to their own asset; a filtered clip still advances the output offset. Three refusals, each naming the way forward. The single-asset exemption is kept — `index`'s per-sub-stage checkpoints genuinely carry no `assetId`, and refusing them would recreate D-51's dead-option failure from the other side — and is **pinned by a test as a known limit rather than left as an oversight**.

**Task 17 — CI (D-57 supersedes D-33).** `.github/workflows/cutdown.yml`: clean clone, Linux **and** Windows, path-scoped to `cutdown/**` + the Cutdown doc paths so a Cutdown failure never gates UGC work. Two jobs — `gate` (both OSes) and `python-worker` (Linux, `uv sync --all-packages --frozen`, with an explicit **import** proof per the 2026-07-21 lesson). `permissions: contents: read`; frozen lockfiles on both sides; a step asserting the gate did not modify the working tree; FFmpeg pinned by major with a hard failure and a named remedy.

**Task 18 — tech-spec §12 + the revisit triggers.** §12's determinism-proof environment rewritten; D-39's and D-44's "revisit at Stage B, where CI replaces the pinned local machine" triggers discharged **by appending D-57**, never by editing the rows. D-43's container trigger, D-45's Temporal trigger and D-46's Node-major trigger are untouched and stay open — verified against the row text rather than assumed.

**Task 19 — ruff widened (D-58).** Principle: families that find defects are in, families that express taste are out, and every exclusion carries its reason in the file. Added `B, C4, PIE, RET, SIM, UP, S, RUF, T20, E501, BLE` + four zero-finding tripwires. `BLE` earned its place: RUF100 revealed **17 dead `# noqa: BLE001`** directives suppressing a rule Cutdown never enabled — 15 removed, 2 kept as live documented suppressions. `E501` earned its place immediately by catching a **403-character line one of this pass's own autofixes had just produced**.

**Task 20 — `cutdown doctor`.** Node/pnpm against the declared `engines`, FFmpeg+libass, ffprobe, uv, hash-pinned fonts, generated-tree freshness. Every check runs; exactly one fix is promoted, in blocking order. Reuses the pipeline's own modules (`probeCapabilities`, `resolveFonts`, `checkGenerated`) so a green `doctor` is evidence about the real code path.

**Task 21 — the master plan corrected.** Two falsified lines and one pointer, no renumbering.

## Reviewer gates — three reviewers, two rounds, and what they caught

`code-reviewer` returned **BLOCK** in round 1. Both Cutdown reviewers returned **NEEDS CHANGES**. All findings applied.

**The `code-reviewer` BLOCK was a real defect, demonstrated rather than argued:** `cutdown doctor` printed a green `OK` line for a `uv`/`pnpm` that was on PATH but could not be executed — with the words "could not be spawned" in the very detail beside it. `toolVersion` returned `version: ''` from four different situations and both checks treated all four as a pass. **Absence reported as success, in the command whose entire job is to report the environment honestly.** It survived because no test called `checkPnpm` or `checkUv` at all. Fixed structurally with a discriminated `ProbeOutcome`, and the untested branches now have tests.

Other findings worth recording, all fixed:

- **`satisfiesRange` answered ranges it documented itself as refusing.** `clauses.every(parse-and-test)` short-circuits, so an unparseable clause after a failing one was never parsed — the function returned a verdict it had not computed, falsifying its own docblock. Now every clause is parsed before any is evaluated. A bare `22` under an equality operator is refused outright, because "22.x" and "exactly 22.0.0" disagree and guessing fails in the believable direction.
- **The §11 single-spawner guard fired on `doctor.ts`, and the response was structural.** tech-spec §11 permits exactly one module to spawn FFmpeg; its enforcing test detects a file that both imports `node:child_process` and names a media binary. Rather than add an exclusion — which that test's own comment warns is where the next real violation hides — the spawning machinery moved to `tool-probe.ts`. **Then the boundary reviewer found that the split had opened a hole the detector cannot see**: `toolVersion('ffmpeg')` from any file would name the binary without importing `child_process`. Fixed at the primitive — `toolVersion` refuses the media binaries outright, importing the list from `renderer-core` (its one home) rather than restating names that would trip the very detector the guard supports.
- **Three tests reported PASS having asserted nothing** — `if (win32) return` instead of a real skip, two of them the positive controls for the BLOCK fix. This project's own R1 turned on its own suite. Now real skips, and the count says so.
- **`shim` was the one `ok`-producing outcome with no test.** A present-but-not-executed tool was counted inside "All 7 checks passed. This machine can run the pipeline." Now a third `CheckStatus`, `unverified`, which never claims verification that did not happen.
- **`audio-events.ts` guarded the field, not the class.** A non-string `assetId` fell through to the absence branch — silently accepted on a single-asset EDL, and misdiagnosed on a multi-asset one as "carries no document-level `assetId`" about a document that carries one.
- **The ruff config's clean run was carried by `.gitignore`, not by itself.** `exclude` *replaces* ruff's built-in default list; measured at **238,569** findings with `--no-respect-gitignore`. Now `extend-exclude`. This is the 2026-08-02 config-discovery lesson one turn on.
- **D-58 quoted numbers the repo did not support — twice.** First "22 dead noqa" (22 was the total; 17 were dead), then exclusion counts measured over a population *including* the generated tree the config excludes — one of them 98.5% generated code, so the honest figure did not support the argument. Both corrected; the argument was restated rather than propped up. This drove a new rule, **R9**, into the measurement canon, and the corresponding check into its reviewer.
- **The append broke the log it appended to.** D-57 and D-58 were separated from the decisions table by blank lines, so the two newest rows rendered as literal pipe text.
- **`tech-spec.md` §12 claimed CI in the present tense**, and the determinism tests still cited the superseded "there is no CI". Both corrected; §2/§14 now name the two host-level artefacts that reference `cutdown/` (the D-55 mirror, the D-57 workflow) and state that neither travels at a Stage C extraction.

## Honest limits

1. **CI has never executed.** The branch is unpushed pending owner authorisation (`todos.md` T-13). The workflow is written, YAML-validated and reviewed; **"CI is green on a clean clone" is unproven**, and acceptance criterion **A7 is not met** — it is not claimed to be. The first run is what verifies the FFmpeg provisioning URL and `setup-node`'s `.tool-versions` support; both fail loudly with a named remedy rather than degrading silently.
2. **The counting model is Stage 0B's.** `status --phase0` prints **2/20**; the policy (owner decision T-1) says **1**. The master plan now states the disagreement *and* its consequence explicitly: criterion 3 currently reads green **only** because two correlated packages are counted as two independent outputs, and it is expected to go honestly UNPROVEN when Stage 0B task 13 lands. Stricter and more honest is the right direction.
3. **D-56 is reserved, not missing.** The plan assigns it to the counting policy (0B task 4); 0A appended D-57/D-58 under the numbers the plan gave them rather than renumbering. Recorded in the log itself.
4. **Both Cutdown reviewers ran via the `general-purpose` fallback**, carrying their own agent file and rule canon, because the agent registry is snapshotted at session start and they were authored in this very diff. The same fallback the plan review log already used. They should run natively from Stage 0B onward.

## Residuals (open, with reasons)

| # | Residual | Why it is open |
|---|---|---|
| 1 | `non_speech_cue_review` reports `ran` over a population covering 1 of N assets on a multi-asset EDL, with nothing recording that N−1 were unexamined | A real R3 population gap the audio-events fix introduced by narrowing correctly. Severity `info`. Belongs with Stage 4's indexing work, or a small follow-up that adds the coverage count to the QA report |
| 2 | The single-asset `--audio-events` exemption trusts the caller | Deliberate and pinned by a test. Closing it needs `index` to stamp `assetId` on its per-sub-stage checkpoints — a producer change, not a consumer one |
| 3 | `.github/workflows/cutdown.yml` pins third-party actions by tag, not commit SHA | `permissions: contents: read` is in place, which is the load-bearing half. SHA-pinning needs SHAs this session cannot verify; first CI run is the natural moment |
| 4 | A17's "CI green on a clean clone" | Owner-gated on T-13 (`git push`). Nothing else in Stage 0A depends on it |

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| A6 | `--audio-events` on a multi-asset EDL projects only that clip's asset's events, driven by a pipeline-produced artefact | **Met** — driven from two committed real source indexes |
| A7 | CI passes on a clean clone, both OSes | **Not met — owner-blocked (T-13), not claimed** |
| A8 | `doctor` names the single most important fix and exits non-zero | **Met** |
| A9 | `cutdown-master-plan.md` contains no statement contradicted by `proving-run-real.md` | **Met** |
| A10 | Both reviewers exist; `CLAUDE.md` and tech-spec §14 agree | **Met** |
| A11 | Entry gate green | **Met** |
| A12 (0A half) | `content-package-v1.json` / `render-v1.json` byte-identical to `501f212` | **Met** — no schema touched at all in 0A |

A1–A5, A13–A15 belong to Stage 0B and are untouched.

## Next

Stage 0B, per plan §7a: **spike first.** Write the failing tests and type signatures and let the compiler and `validate:contracts` answer the questions three rounds of prose review got wrong — then write the plan from what the code proved.
