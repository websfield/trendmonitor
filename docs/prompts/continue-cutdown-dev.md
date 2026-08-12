/go continue the cutdown product program

**Where things stand (update the commit hash after you push).** Stage 0 engineering is COMPLETE: 0B-3 landed the deliberate bump as `render-v2` only (D-62 — `content-package-v2` dissolved; render-manifest/source-asset tightening deferred to Stage 5's ledger row). Read `docs/progress/cutdown-product-program-stage-0b3-review.md` first — it is the state of the world — then the master plan §7/§10. Baselines to beat, pass/skip/fail separately: **986 TS = 981 pass + 5 skipped + 0 fail**, **689 Python**, `validate:contracts` **50 cases / 0 disagreements**.

**Owner inputs since last session:** the D-21 spend ceiling is SET (`CUTDOWN_SPEND_CEILING_AUD` in `cutdown/.env`, gitignored — never commit it). [Adjust to match reality when you run this: T-3 accounts supplied? T-4 outputs started? A7 CI result read after the push?]

**Do these small closures first, through the normal gates:**
1. Graduate T-2: append the D-row recording the ceiling and its configured home, retire T-2 from `todos.md` (decisions.md touch → boundary reviewer gates it). Note what it unblocks: PHASE_3_ACCEPTED_LIVE, Stage 1 live benchmarks, Stage 3.
2. If `gh` or a browser is available: read the CI result on the pushed commit and close or reopen A7 — cheapest open item in the program.
3. If a post-bump package now exists: verify live `status --phase0` shows criterion 3 `not_met` naming `render-v2.json v1→v2` — the first live proof of 0B-1's machinery. That red is CORRECT and self-heals by the 11th resolved output; record the verbatim output in the progress file.

**Then the real next step — work it out from the plan set and do it, full automation, reviewer agents spawned, every phase gated, progress under `docs/progress/`. My read, argue with it rather than rediscover it:**
- **Stage 2 (Local Review Studio)** is now unblocked (depends only on Stage 0) and the master plan says it *should* proceed in parallel with data accumulation. It is the program's largest risk — no HTTP layer, no frontend exists — so it starts with `/create-plan`, a `DESIGN.md`, and the D-13 `skills serve` transport decision (D-59 is reserved for it). Its studio must never become a second source of truth: its only writes are artefacts the skills already define.
- **Stage 1 (measurement system)** is the alternative: its plan carries known unresolved round-3 findings (N8/N10 UNRESOLVED, N1/N3/N5/N6 PARTIAL, B20–B27 without owning tasks) that must close before building, the way 0B did. Its machinery is needed by Stages 3/4/6, not before — so it can follow Stage 2's planning.
Recommend one and start; tell me which and why in a sentence before you go.

**Residuals that carry forward (all named in the 0B-3 review record):** Stage 5's ledger row inherits the deferred pattern-tightening + Role3 pin + commons/enums criterion-3 blind spot; approve/revise still bare-parse render records (named, Stage 5 home); the counting policy's baseline-exclusion / min-n / no-pooling rules still have NO enforcing artefact — Stage 1 builds that home.

**Lessons — do not re-learn:** (1) if a plan question is answerable by running something, run it; (2) a fix that names one site leaves its sibling — fix the CLASS (0B-3 paid this three times on line-anchored citations alone: cite clauses, never line numbers, in anything long-lived); (3) assert it in a test or delete the claim; (4) re-derive every number against its artefact (the "18 lint rules" was phantom; the artefact defines 12); (5) report pass/skipped/fail separately, never a total.

**Process notes:** subagents must NEVER run `git commit` or `git push` — I authorise those myself. Checkpoints are on; announce every snapshot.
