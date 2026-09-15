# Creator-ready — Phase 0: the actual starting state (T0)

Status: **NOT READY (Almost)** — plan review batches 0, 1, 2 run (20 → 13 → 10 findings, all applied 2026-09-15); owner-approved scoped batches 3 and 4 (2026-09-15) verified the translation paragraph; batch 3's B3-1 fix was applied, and batch 4 found the same invariant still open (B4-1 witness population unlisted, B4-2 "none executable" closes environment/owner rows) — §5 convergence stop, allowance consumed, batch-4 findings not applied, not executable until Ready. Depends on: none. Inspection and documents only — **no product code, no configuration, no database write.**
Master plan: [`creator-ready-master-plan.md`](creator-ready-master-plan.md) · Owner's ticket: T0 in [`../creator-ready/02_Remediation_Plan.md`](../creator-ready/02_Remediation_Plan.md) §2.

## Project Conventions Pinned (READ FIRST)

Golden rules, verbatim from `CLAUDE.md`:

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code — and a claim you *record* (in a comment, a doc, a decision log) is verified against the file it names **in the same action that records it**. A structural claim ("this can never happen") is proven by running it (a test or the command), not by an argument.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state. Deletion is the one mistake you can't iterate on.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back. A result counts only if the *method* was sanctioned too: output from a command this file's rules forbid, or from a run pointed at a copy instead of the real target, is discarded and re-obtained — and you name the command you actually ran, rather than waiting for someone to object.
7. **Small, verifiable steps.** Prefer the change you can test over the big-bang you can't; if you can't verify it, say so.
8. **Scale caution to blast radius.** Reading and analyzing are free — they change nothing. Edits and test runs are cheap — they're reversible. Pushing, publishing, sending anything outside the repo, and deleting what you didn't create (rule 3) are not: those wait for explicit confirmation, and if you catch yourself reaching for reasons one is *probably* fine, that reaching is the signal to stop and ask.
9. **Current facts beat trained memory.** Library APIs, CLI flags, and config schemas are present-day facts: verify against the installed version (lockfile, type definitions, `--help`, official docs) before use — partial recognition from training is not current knowledge.

Respin non-negotiable 6, verbatim: **No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point; engineering and evidence completion are separate claims (REQ-I03/I04, build-plan).

Lessons that touch this phase, verbatim:

- 2026-08-02 — **A tool's exit code tells you it ran, never WHAT it ran on** … treat a green claim as vacuous until you know which config or package produced it.
- 2026-08-10 — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun**.

The owner's T0 rules, verbatim from the remediation plan §2: "Treat this as an inspection lead, not an instruction to reset the current repository." "Resolve absent access as **unknown/blocked**, not passed or zero effort." "Do not treat the historical 5,168-test report as a fresh run." And from §3: "Historical open items are investigation targets — not automatically current defects."

Facts fixed on 2026-09-15 (verified this session; the uncommitted list is illustrative, **not exhaustive** — T1 re-inventories it): HEAD `3273f36`; the working tree carries uncommitted edits in `.claude/**`, `.agents/skills/doctor/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore` (the workflow-hardening / pack-sync lineage — **not this programme's**), two test-only journey edits (`respin/e2e/journeys/solo-creator.spec.ts`, `studio-operator.spec.ts`), `respin/packages/db/tests/migration-shape.test.ts`, and the new `docs/creator-ready/`, `docs/plans/respin-*`, `docs/progress/respin-*` documents; the dev database is at migration 62 with config version 17; the trend adapters are exactly `youtube` and `submitted` (`respin/packages/trends/src/trend-source.ts:1,9-10`); the owner's cited sources P0/P1/P2/P3/P5/L1 are **absent** from the repo (`docs/creator-ready/` holds only the brief, the remediation plan and their `.docx`).

Agents: owner `respin-engineer` — writes **only** under `docs/progress/creator-ready/` (including the ledger line) plus the master plan's progress row; reads the stack from the tree (`respin/package.json`, `pnpm-lock.yaml`), never from its own agent file, whose stack section is stale (workflow-hardening WF-03); reviewer `plan-reviewer`. Do NOT request any agent absent from `.claude/agents/`.

## Requirements Checklist (functional — the owner's T0 deliverables)

- [ ] **Baseline manifest** (stamped with HEAD and an ISO timestamp): branch, HEAD, every staged/unstaged/untracked path grouped by lineage (pack tooling / journeys / programme docs / other), lockfile hash, migration head and active config version as read from the dev database, `.env.local` **key names only** via `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' respin/.env.local` (the `Read` tool is denied on `.env.*` files and `cat` would print values; if the grep is refused the cell is **blocked**; if the file is absent — it is gitignored — the cell reads **absent**, and `respin/env.example`'s names are recorded separately as the template, never as the live set), the migration head read **two ways and both recorded** — `select count(*), max(created_at) from drizzle.__drizzle_migrations;` and the tree-side file count `ls respin/packages/db/migrations/*.sql | wc -l` (migration head = row count = file count), the Node/pnpm/Playwright/Stripe CLI versions via `node --version`, `pnpm --version`, `pnpm -C respin exec playwright --version` (never `npx`, which may fetch), and `stripe --version` (absent → the cell reads absent), and **every row** of the two rollout tables via `select protocol, state, revision from tier_checkout_protocol_rollouts;` and `select protocol, state, revision from auto_topup_protocol_rollouts;` — values recorded as read, never pre-stated. Records the divergence from the owner's snapshot (branch `respin-m1-billing-credits`, base `961c2a9`): this tree is on `main` at `3273f36`, which merged that branch.
- [ ] **Obligation register** (closed / closed-by-record / open / unknown) with the pinned column set **obligation · state · citation (path:line) · witness (check name and its T6 result, or "none executable") · cited at (HEAD, date) · audit F-id · receiving creator-ready phase · re-checked against P1**, the **state vocabulary pinned** — `closed` only when the citation was opened in this phase **and** every executable witness of the obligation ran green in this phase's own T6 transcript (or the obligation has no executable witness and the citation is to current code, not to a historical card or progress table); `closed-by-record (witness unrun: <suite>)` when the only evidence is a historical record (card, progress table, open-items entry) or its witnessing suite is recorded NOT RUN in T6 — e.g. any obligation witnessed by a `*.docker.test.ts` suite, since T6 runs the loud-skip shape; `open` when a citation opened this phase shows the gap; `unknown` when no repo record exists either way or only a named missing source (P1) could prove it — never `closed` on a named missing source — and the row population **enumerated here**, from the owner's §3 table: (1) admission enforced on signup, (2) on OAuth, (3) on workspace/bootstrap routes, (4) server-side scope checks, (5) server-side plan checks, (6) full-script entitlement not unlocked by extra Free credits, (7) deletion-journal provisioning, (8) restore handling, (9) autopsy scrub residual, (10) newly retained fields/records in deletion, (11) delayed-job resurrection after erasure, (12) billing configuration vs checkout/entitlements/displayed costs, (13) the seeded tier/add-on concern, (14) payment grant/invoice/cancellation/failure witnesses, (15) telemetry collectors, (16) content minimisation in events/errors, (17) spend/error visibility, (18) alert recipients, (19) recovery diagnosis, (20) support contact, (21) incident/rollback owners, (22) customer-document placeholders, (23) page/help/checkout alignment with accepted routes and charges, — rows (1)–(23) from the owner's §3 table, plus (24), found on 2026-09-15: documentation drift on the Docker-suite count (CLAUDE.md "two", compose "nine", master plan "twelve", tree 23 — receiving: the master plan's Deferral Ledger row, an owner-assigned track). **Receiving phase for rows (1)–(23)**, by the owner's §3 table areas (`docs/creator-ready/02_Remediation_Plan.md:53-57`) and the umbrella's money/non-money split (master plan Requirements, "T0 release closures" row): admission and entitlement (1)–(6) → Phase 4; deletion and recovery (7)–(11) → Phase 4; billing configuration (12)–(14) → Phase 3; telemetry and support (15)–(21) → Phase 4; customer-document placeholders (22) → Phase 4; page/help/checkout alignment (23) → Phase 7, with its checkout part → Phase 3; a row whose state is `closed` reads `n/a`. **Plus one row per journey finding F-01…F-21** (21 rows) with its receiving phase via the master plan's translation paragraph, **applying its precedence rule** (where the service-quality defining set or a service-quality phase header claims a row or half-row, that claim wins → Phase 1/2; the remainder → Phase 3) and its **enumerated split rows — F-02, F-05, F-17, F-18, F-20, F-21 — each one register row whose receiving-phase cell names every half** as the paragraph lists them (F-19 is Phase 2 only), and its non-phase dispositions (operator note, outside programme) where named. Citations: `docs/plans/respin-finish-master-plan.md` (progress table), `docs/plans/respin-finish-phase-10b-1.md` (the progress table labels it the 10b-1 card), `docs/progress/respin-finish-slice-8c-card.md`, `docs/progress/respin-finish/respin-finish-slice-9a-card.md`, the 9b card as the progress table links it under `docs/progress/respin-finish/`, `docs/progress/respin-finish/respin-finish-slice-10a-card.md`, `docs/progress/respin-finish-open-items.md`, `docs/progress/respin-journey-fixes-audit.md`, `docs/plans/respin-service-quality-master-plan.md` (its defining set, for the precedence rule), the phase headers' audit-row lines `docs/plans/respin-service-quality-phase-1.md:4`, `-phase-2.md:4`, `docs/plans/respin-journey-fixes-phase-1.md:4`, `-phase-3.md:4` (for the half labels), the root `todos.md`; a row with no repo record is **unknown** with the reason "only P1 §§10–11 could prove it; P1 is absent".
- [ ] **Configuration/offer comparison**: the active config's tiers, allowances, credit costs and `stripePriceMap` keys read by `select version, content from config_versions order by version desc limit 1;` (the **primary and only** method in this phase — the `/admin/config` editor needs a dev server and a login that writes session rows, which this phase forbids; if the `SELECT` is refused, the deliverable is recorded **blocked** and the owner is asked to run that one query and paste its output) against the pricing page copy (`tests/landing-pricing.test.ts` pins numbers to `CONFIG_V1_SEED`, the seed — not the active version, so both are compared) — differences recorded, none changed.
- [ ] **Reference-support matrix** (T3-REF's initial state): per target — Instagram, TikTok, YouTube, pasted text — the adapter that exists or does not, what it retrieves, the analysis limit (text-only autopsy), charging, and an evidence cell that distinguishes **present-and-verified** (a dated live run) from **present-and-unrun** (the YouTube adapter's live discovery evidence is unrun — `respin-finish` slice 8's T-15); Instagram and TikTok read "no adapter; missing-adapter rule → owner decision" (`trend-source.ts` pins exactly two adapters); a note that `PLATFORM_OPTIONS` at `app/(product)/studio/run-copy.ts:35-39` lists "TikTok", "Instagram Reels" and "YouTube Shorts" as **script platform targets**, not ingestion routes, so T8 does not read them as capability claims.
- [ ] **Bounded change list and re-estimate**, produced **last**, citing the register's final row count and date, separated into known enhancements, existing remediation, verification/review and external dependencies, with uncertainty as a range and the unknowns that widen it named; the owner's 13–21-day figure recorded as superseded, not as a baseline.
- [ ] **Executed check record**: the Commands-block gates run **in the loud-skip shape** (no `TEST_DATABASE_URL`, so nothing writes to the dev database), sequenced after T1's reads: `typecheck`, `lint`, `test`, `build`, `preflight`, `worker:typecheck`, `db:check` (offline), each with its real result; **every `*.docker.test.ts` suite vitest reports SKIPPED is recorded NOT RUN by name** — the population is the glob `respin/**/*.docker.test.ts` (23 files on 2026-09-15: 14 under `packages/db/tests`, 7 under `packages/credits/tests`, 1 under `packages/config/tests`, `tests/pg-boss.docker.test.ts`), never "the two" (CLAUDE.md's Commands line says two, `docker-compose.yml:15` says nine, `respin-finish-master-plan.md` says twelve — that drift becomes register row 24); anything else not run marked **NOT RUN**.

## Requirements Checklist (technical)

- [ ] No **tracked** file outside `docs/progress/creator-ready/` is created or modified, except the master plan's progress row (the ledger line lives in `docs/progress/creator-ready/ledger.md`; build outputs such as `.next/` are gitignored and do not count); no test is edited; no database row is written; **neither the dev server nor the worker is started in this phase** — no Phase 0 read requires them, the worker runs retention and deletion sweeps against the dev database on start, and the entry gate runs in its loud-skip shape.
- [ ] Every claim in the manifest names the command that produced it (`git rev-parse`, `git status --short`, `docker exec … psql` **read-only** `SELECT`, `node --version`, …) — sanctioned read-only commands only; a denied command is recorded as **blocked**, never worked around.
- [ ] The register never promotes a historical item to "current defect" without a repo citation opened during this phase (owner's §3 rule; golden rule 1).

## Edge Cases & Failure Paths

| Question | Answer → task |
|---|---|
| A read-only command is refused by the permission classifier (this happened to a `SELECT` on 2026-09-15) | The cell is **blocked**, with the command named; never substituted by a guess. For T1 the affected cells are the migration head, config version and rollout rows; for **T3 the whole deliverable** — its only zero-write source is `config_versions` — so AC3 has a blocked variant: the owner runs the one query and pastes its output (T1, T3). |
| The dev database is not the owner's intended environment | The manifest says which database it read and that the intended environment is **unknown** until the owner names it (T1). |
| A historical obligation has no repo record either way | **unknown** row with the missing source named (T2). |
| The owner's sources arrive later | The register gains a "re-checked against P1" column; rows move only with a citation (T2). |
| The estimate is asked for before the register is complete | Refused: the estimate is the last deliverable and states its uncertainty (T5). |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behaviour | Reconciliation | Spec |
|---|---|---|---|---|
| Docker Postgres | down | migration/config rows marked NOT RUN; manifest still produced | rerun when up | T1 |
| Permission classifier | denies a read | row blocked, command recorded | owner allows or runs it | T1 |
| Entry-gate commands | a gate fails | recorded as the current baseline failure, never fixed in this phase | receiving phase named | T6 |

## Handoff Contracts

- `docs/progress/creator-ready/00-baseline-manifest.md`, `00-obligation-register.md`, `00-reference-matrix.md`, `00-config-offer-comparison.md`, `00-estimate.md` — consumed by Phases 1–7; the register's "receiving phase" column is the programme's routing table.
- Phase 1 may start only when the manifest exists and the entry gate's recorded state is known (green, or a named baseline failure) — and Phase 1's **first step re-runs `git rev-parse HEAD && git status --short` and records the diff against the manifest** (workflow-hardening runs in parallel and will move the uncommitted set); the manifest carries HEAD and an ISO timestamp for that comparison.

## Reachability

Phase 0 wires nothing user-facing by design. It unblocks Phase 1's start (the first-session service) by fixing the tree, the gate state and the obligation set that Phase 1 builds on — recorded as a Deferral Ledger row in the master plan.

## Depends on

none. Workflow-hardening may run in parallel; its uncommitted files are inventoried here, not touched.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| T1 | Baseline manifest (read-only commands listed above; lineage grouping; environment named; rollout states) | respin-engineer | `docs/progress/creator-ready/00-baseline-manifest.md` (new) |
| T2 | Obligation register from repo records; unknowns named; journey findings mapped by F-id to receiving phase | respin-engineer | `docs/progress/creator-ready/00-obligation-register.md` (new) |
| T3 | Configuration/offer comparison (active version via the `config_versions` `SELECT`, values read only; blocked variant if refused; pricing copy from the landing test's seed pin) | respin-engineer | `docs/progress/creator-ready/00-config-offer-comparison.md` (new) |
| T4 | Reference-support matrix from `respin/packages/trends/src/{trend-source,sources,autopsy}.ts` and `respin/app/(product)/trends/paste-panel.tsx`; Instagram/TikTok as a bounded owner decision with the two options the owner's §6 names; verified-vs-unrun evidence cell | respin-engineer | `docs/progress/creator-ready/00-reference-matrix.md` (new) |
| T5 | Bounded change list and re-estimate with uncertainty, separated as the owner asks; produced last | respin-engineer | `docs/progress/creator-ready/00-estimate.md` (new) |
| T6 | Run the Commands-block entry gate in the loud-skip shape on the current tree, after T1's reads and after the `TEST_DATABASE_URL` pre-check; record real results and **every `*.docker.test.ts` suite (the glob, 23 files on 2026-09-15) as NOT RUN by name** — the population is the glob; vitest's per-file skipped counts corroborate it (the module-level skip warning may not reach the transcript); transcript saved | respin-engineer | `docs/progress/creator-ready/entry-gate-phase-0.txt` (new), summarised in `00-baseline-manifest.md` |
| T7 | Phase report card and ledger line | respin-engineer | `docs/progress/creator-ready/creator-ready-phase-0-card.md` (new; named to match the repo's `<feature>-slice-N-card.md` pattern with `phase` — no `phase-N-card` file exists yet, this is the first), `docs/progress/creator-ready/ledger.md` (new), master plan progress row |

## Files to Create / Modify

| Path | New/Mod | Owner | Note |
|---|---|---|---|
| `docs/progress/creator-ready/00-baseline-manifest.md` | new | respin-engineer | T1, T6 |
| `docs/progress/creator-ready/00-obligation-register.md` | new | respin-engineer | T2 |
| `docs/progress/creator-ready/00-config-offer-comparison.md` | new | respin-engineer | T3 |
| `docs/progress/creator-ready/00-reference-matrix.md` | new | respin-engineer | T4 |
| `docs/progress/creator-ready/00-estimate.md` | new | respin-engineer | T5 |
| `docs/progress/creator-ready/entry-gate-phase-0.txt` | new | respin-engineer | T6 transcript |
| `docs/progress/creator-ready/creator-ready-phase-0-card.md` | new | respin-engineer | T7 report card |
| `docs/progress/creator-ready/ledger.md` | new | respin-engineer | T7 ledger line |
| `docs/plans/creator-ready-master-plan.md` | mod | respin-engineer | Progress row |

## Migration Steps

None.

## Verification Steps

1. `git rev-parse HEAD && git status --short` (state: any) — the manifest's tree section matches its output verbatim.
2. `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build && pnpm -C respin preflight && pnpm -C respin worker:typecheck && pnpm -C respin db:check` **without `TEST_DATABASE_URL`** (state: dependencies installed; `db:check` is offline) — **pre-check first:** `echo "TEST_DATABASE_URL=${TEST_DATABASE_URL:-unset}"` into the transcript, which must read `unset` (a value exported by a shell profile would run all 23 suites live against Docker Postgres — the exact inspection-only breach; if set, stop and record the gate blocked); then the loud-skip shape, so every `*.docker.test.ts` suite (the glob, 23 files) skips and is recorded NOT RUN by name; each result recorded in T6 exactly, output saved to `entry-gate-phase-0.txt`; a failure is a baseline fact, not a task (runs after step 3).
3. `docker exec respin-postgres psql -U respin -d respin -t -A -c "select max(version) from config_versions"`, `… -c "select version, content from config_versions order by version desc limit 1"`, `… -c "select protocol, state, revision from tier_checkout_protocol_rollouts"`, `… -c "select protocol, state, revision from auto_topup_protocol_rollouts"`, `… -c "select count(*), max(created_at) from drizzle.__drizzle_migrations"` plus `ls respin/packages/db/migrations/*.sql | wc -l` (state: Postgres up) — read-only; a denial is recorded as blocked and, for T3, the owner is asked to run the second query (requires 1). Expect roughly a dozen permission prompts across steps 1–3 (none of these commands is on the shipped allow list); an unattended run records blocked / NOT RUN cells, never a guess.
4. Every register row's citation opened (`Read`) in the same session it is written (golden rule 1).

## Acceptance Criteria (PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC1 | Manifest reproduces the tree: another engineer running step 1 sees the same HEAD and path list; lineages grouped; HEAD and timestamp stamped; no secret values (the key-only grep or a blocked cell) | `00-baseline-manifest.md` (its "commands run" section quotes step 1's output) |
| AC2 | Register: all 24 enumerated obligation rows (23 from the owner's §3 plus row 24) and exactly 21 F-id rows present (one row per F-id; F-02, F-05, F-17, F-18, F-20, F-21 each name every half in the receiving-phase cell, F-19 names Phase 2 only); every row's state is one of the four pinned values and obeys its definition: **no row reads `closed` unless its citation was opened this phase and its witness column shows a check that ran green in `entry-gate-phase-0.txt` (or "none executable" with a citation to current code)** — a row whose witness is NOT RUN, or whose only evidence is a historical record, reads `closed-by-record (witness unrun: <suite>)`; a row citing only a named missing source reads `unknown`; rows (1)–(23) carry the group receiving phase above (`n/a` when closed); F-id rows carry the translation paragraph's phase(s); no row promoted to "current defect" without a citation opened this phase | `00-obligation-register.md` + `entry-gate-phase-0.txt` (each `closed` row's witness located in the transcript) |
| AC3 | Config/offer comparison lists every tier, allowance, credit cost and price-map key present in the active version, with differences from the seed-pinned pricing copy stated — **or** the deliverable reads blocked with the exact query for the owner to run | `00-config-offer-comparison.md` |
| AC4 | Reference matrix has a row per target; the evidence cell reads verified (dated) or unrun for each adapter; Instagram and TikTok read "no adapter" with the owner's two options; the `PLATFORM_OPTIONS` note is present; nothing describes text analysis as visual inspection | `00-reference-matrix.md` |
| AC5 | Estimate cites the register's final row count and date (so it was produced last), separates the four categories, states uncertainty as a range with named unknowns; the 13–21-day figure is marked superseded | `00-estimate.md` |
| AC6 | Entry-gate results recorded per command with real output in `entry-gate-phase-0.txt`; every `*.docker.test.ts` suite named as NOT RUN and the list equal to the glob's file set; nothing marked green that did not run | `entry-gate-phase-0.txt` + manifest T6 section + the glob listing |
| AC7 | `git status` after the phase shows no tracked change outside `docs/progress/creator-ready/` and the master plan's progress row; no dev server or worker process was started (the ledger line says so) | `creator-ready-phase-0-card.md` quotes the closing `git status --short` |

## Risk coverage within those criteria

`t0-inspection-only` (a Phase 0 that edits product code, writes a database row, or starts the worker is a failure) → AC7 + the loud-skip gate shape in AC6. `unknown-never-passed` (an unprovable obligation marked closed) → AC2's citation rule. `closed-means-witnessed` (a row reads `closed` on a historical card while its witnessing suite is NOT RUN — e.g. the deletion journal witnessed by `deletion-executor.docker.test.ts`) → AC2's witness-column rule, checked against `entry-gate-phase-0.txt`. `green-only-if-run` → AC6.

## Least confident

Whether the permission classifier will allow the read-only database `SELECT`s this phase needs (it denied one on 2026-09-15); if not, T1's database cells (config version, both rollout tables, and the database half of the migration head — its tree half, the migrations file count, still lands) are **blocked** and T3 is blocked whole (its only zero-write source is `config_versions`), the owner is asked to run the five queries and paste their output, and the phase completes with those cells and that deliverable so marked — never with a guessed value.

## Out of Scope (Surgical Changes)

Any file under `respin/`; any decision the owner reserved (admission rule, no-debit policy, pricing, processors, deployment); the workflow-hardening files; fixing anything the register finds.

## Completion Criteria (Definition of Done)

Independent generalist review PASS on this plan; the five documents present; AC1–AC7 met; master plan progress row and one ledger line written; the owner's five evidence states reported as "implemented: n/a; locally tested: n/a; real-service accepted: n/a; deployed: n/a; customer-observed: n/a" — this phase produces records, not a candidate.
