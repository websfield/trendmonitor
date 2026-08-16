# Next-session prompt — cutdown product program

Copy everything below the line into a fresh session.

---

/go continue the cutdown product program

**Where things stand (2026-08-10, `origin/main` = `6e178b8`, working tree clean).**

Stage 0A and Stage **0B-1 + 0B-2** are complete and pushed. Read `docs/progress/cutdown-product-program-stage-0b-review.md` first — it is the state of the world — then `docs/plans/cutdown-product-program-master-plan.md` §7 and §10.

What 0B changed, in one line: `status --phase0` now reports **1/20 approved real outputs with criterion 3 unproven**, where it used to say 2/20 with criterion 3 green. Both were corrections. Output identity is **derived** from `lineage.creativeBriefId` (D-56) rather than stored, and contract drift is classified by schema **family** (D-61). No schema or generated file was touched.

**What I want you to do:** work out the right next step from the plan set and do it, with full automation — spawn the reviewer agents in `.claude/agents/`, gate every phase, and record progress in a per-phase file under `docs/progress/`. Pause only for a decision that is genuinely mine.

**My read of the options, so you can argue with it rather than rediscover it:**

- **Stage 1 (quality measurement system)** — `docs/plans/cutdown-product-program-phase-1.md` is already task-level. Its *engineering* exit (`MEASUREMENT_MACHINERY_COMPLETE`) is in this repo's gift, and Stages 3, 4 and 6 all need its machinery. **But its plan has known unresolved review findings** — see the master plan's Plan Review Log, round 3: N8 and N10 UNRESOLVED, N1/N3/N5/N6 PARTIAL, and eight criteria (B20–B27) were added without touching the Implementation Tasks table, so several have no owning task. Close those before building, the way Stage 0B did.
- **Stage 0B-3 (the contract migration)** — smaller, and it fully closes Stage 0. Needs re-planning. Its own first task is to re-read the master plan's order-critical constraint; the threshold recorded in `phase-0b.md` §2 is **before criterion 3's window holds more than three resolved real outputs** (it holds 1 today, so there is room). The spike already settled its build order, its exact codegen blast radius, and retired its Python-collision hazard — don't re-derive those.
- **Stage 2 (Local Review Studio)** — depends only on Stage 0, and the master plan says it *should* proceed in parallel with data accumulation. It is the largest risk in the program: cutdown has no HTTP layer and no frontend, so it is a new product surface, not a view. Needs `/create-plan`, a `DESIGN.md`, and the D-13 `skills serve` transport (D-59 is reserved for that decision).

Recommend one and start; tell me which and why in a sentence before you go.

**Six residuals from Stage 0B**, all named in the review record — the ones most likely to bite are (1) no test asserts that a hand-authored `published` package still resolves under the counting rule, (3) the counting policy's baseline-exclusion / minimum-n / no-pooling rules have **no enforcing artefact** and Stage 1 is where that home gets built, and (5) a `status.test.ts` intermittency that was fixed but never reproduced.

**Still owner-blocked, and no amount of engineering produces them:** T-2 (the D-21 spend ceiling, unset since Phase 3), T-3 (two more accounts with rights records), T-4 (**19** more approved real outputs — that number got larger, deliberately), and **A7** (a green CI run on a clean clone; the workflow has fired but no session so far has had `gh` to read the result). If you have `gh`, read the CI result and close or reopen A7 — that is the cheapest open item in the program.

**Five things this program has learned the hard way. Please do not re-learn them:**

1. **Prose review cannot see this class of defect.** Stage 0B's contract work BLOCKed three times as prose and was only settled by a spike — failing tests and type signatures, letting the compiler and `validate:contracts` answer. If a plan question is answerable by running something, run it.
2. **A fix that names one site leaves its sibling.** One defect (criterion 3 reporting green across a breaking change) recurred through **four** different doors in one stage — the predicate and the sentence beside it; the counting unit and the drift timeline; the span's members and the span's endpoints. When a review names a defect, fix the *class*.
3. **A claim can outrun the code into other documents.** The last BLOCK was asserted as fixed in a code comment *and* in the reviewer canon before anything tested it. Assert it in a test or delete the claim.
4. **Numbers in docs drift.** R9 has now earned its keep three stages running — this stage alone shipped an invented `4×` ratio into the PRD, and orphaned three citations by retiring the todo they pointed at. Re-derive every number against the artefact.
5. **Report pass / skipped / fail separately.** "Total > N" accepts a run that converts passes into skips. Baseline to beat: **974 TS tests = 969 pass + 5 skipped + 0 fail** and **689 Python passed**.

**One process note.** In the last session a subagent committed *and pushed* without being asked, bundling `cutdown/.env.example` into an unrelated commit. Tell your subagents explicitly not to run `git commit` or `git push` — I authorise those myself.
