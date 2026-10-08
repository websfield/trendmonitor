# respin-journey-fixes — Phase 3: journeys that prove the paid path

Status: **PARKED; stale against service-quality Phase 2** (plan-review batch 3, 2026-10-04 — see the master plan's Review Log). Four files this plan marks "new" already exist (`respin/e2e/support/brain.ts`, `respin/e2e/journeys/README.md`, `respin/scripts/scan-journey-notes.ts`, `respin/tests/scan-journey-notes.test.ts`), and the CI journeys job already exists as `.github/workflows/respin-journeys.yml`. **Re-base at launch-remediation L5/L6 together with F-01, keeping the paid chapters only** (`creator-ready-master-plan.md` Phase Plans row 3). Earlier status, kept for history: DRAFT — awaiting the plan review gate. Depends on: 1, 2.
Master plan: [`respin-journey-fixes-master-plan.md`](respin-journey-fixes-master-plan.md) · Audit rows: F-17 (CI half), F-18, F-19, F-20, F-21.

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
- 2026-08-26 — **A verifier that reports success is not verified until something OUTSIDE it tries to break it** … a mutation report needs someone else planting the mutations before "N of N red" is trusted.
- 2026-09-04 — **Verify the bytes your edit changed, and the harness that says they are fine** … a check that greps a tool's *formatted* output is worthless until you have watched it FAIL a known-bad case.
- 2026-09-09 — **Isolating a failure so the batch survives it converts a LOUD failure into a SILENT one**: the try/catch ships in the same change as a count that reaches an alert.

Stack: Playwright `@playwright/test` ^1.63 (`respin/playwright.config.ts`: one worker, no retries, journeys run one at a time in the order solo → studio → editor → admin), GitHub Actions (`.github/workflows/respin.yml`), Stripe CLI, Node 22 in CI. The journeys spend real Anthropic credits and Stripe test-mode calls: they never run on `push` or `pull_request`. The journeys record refusals and continue by design — a green run is evidence only through its notes and screenshots.

Agents: owner `respin-engineer`; reviewers `respin-billing-reviewer` (separate, full — T3's helper writes to Stripe and asserts the webhook downgrade, and T4 runs the activation ceremony) and `plan-reviewer`. Do NOT request `eval-harness-engineer` (UGC eval plan) or any agent absent from `.claude/agents/`.

## Requirements Checklist (functional)

- [ ] F-19 / REQ-A02: the studio-operator journey builds and activates a brain for Profile A so the editor-seat journey generates a draft and asserts a usable outcome, not a precondition refusal.
- [ ] F-18 / REQ-H01: every screenshot and status read in the four journeys follows a terminal-state wait (`data-testid` or text that only appears when the action settled); no capture mid-submit.
- [ ] F-20: the journeys cover `/settings/account`, `/studio/frameworks`, `/admin/activation`, `/changelog`, `/legal`, `/for/<every slug in audiences.ts>`, `/recover-deletion` (render + screenshot), and the Studio-tier pause → resume and pack purchase chapters on the operator journey.
- [ ] F-21: `respin/e2e/journeys/README.md` states run order, required processes, env names, the step-up password, and the activation prerequisite (Phase 1's script).
- [ ] F-17 / REQ-G01 — **SUPERSEDED 2026-10-04 (batch 3):** no job goes in `respin.yml` (`respin/tests/journeys-workflow-triggers.test.ts:409` fails on a playwright job there); the job is `.github/workflows/respin-journeys.yml`, whose triggers are `workflow_dispatch` with the `schedule` commented out until the spend ceiling is recorded (`respin-journeys.yml:26-31`), Postgres via `docker compose` (`:90`), not a service container. Original: a `journeys` workflow job runs the four specs in order on `workflow_dispatch` and a nightly `schedule` against a service Postgres, after `db:migrate` and `dev:activate-billing-protocols`, with `stripe listen` forwarding; artifacts (screenshots, console logs, HTML report) uploaded; the job fails on any spec failure **and** on any journey note that begins with `BLOCKING APP BUG`.

## Requirements Checklist (technical)

- [ ] No product code changes in this phase; if a journey needs a testid the product lacks, that is a finding routed back, not a product edit here.
- [ ] **SUPERSEDED 2026-10-04 (batch 3) for `ANTHROPIC_API_KEY`:** the vendor key lives in the `journeys` GitHub Environment only (`respin-journeys.yml:56`); any workflow other than `respin-journeys.yml` that names it fails `respin/tests/journeys-workflow-triggers.test.ts:404`, and a repository secret of that name is caught at run time by the `no-repository-secret` canary job (`respin-journeys.yml:37`). `STRIPE_WEBHOOK_SECRET` is exported from `stripe listen --print-secret` at job start, not stored (T4). Original: Secrets only via GitHub secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESPIN_STRIPE_ACCOUNT_ID`, `RESPIN_AUTO_TOPUP_AUTHORITY_KEY`, `ADMIN_USER_IDS`); never echoed.
- [ ] Invariant `journeys-manual-or-nightly-only`: workflow triggers are exactly `workflow_dispatch` and `schedule`.
- [ ] The "BLOCKING APP BUG" scan is proven against a planted note (lesson 2026-08-26).

## Edge Cases & Failure Paths

| Question | Answer → task |
|---|---|
| Inverse: activation script fails in CI (audit blockers on the sandbox) | Job fails at setup with the blocker list in the log; journeys do not start; the runbook's sandbox and snapshot requirements are the remedy (T4). |
| Snapshot restore fails or the restored row is not `active` for the bound sandbox | Job fails at setup before any journey; never re-create the database and re-run activation against the same sandbox — that is the orphaned-session trap (T4). |
| `stripe listen` starts after the first checkout | Job waits for the CLI's "Ready!" line before starting Playwright (T4). |
| Model refuses the voice build for Profile A (Phase 1 keeps the included build) | The support helper retries the build once; a second refusal is recorded and the editor chapter asserts the precondition refusal explicitly instead of passing silently (T2). |
| Journey note scan matches nothing because the phrase changed | Scan reads the phrase from one exported constant in `support/artifacts.ts`; planted-note test proves the scan (T4). |
| Handoff file from a previous CI run | Fresh checkout; `_handoff/` is git-ignored and absent (T5 README states it). |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behaviour | Reconciliation | Spec |
|---|---|---|---|---|
| Stripe Checkout (hosted page) | markup change breaks selectors | `completeStripeTestCheckout` throws; journey records `BLOCKING APP BUG` note; job fails loud | fix selectors | T4 scan |
| Anthropic | slow (>90 s) | `waitForGenerationOutcome` returns `timed_out`; the journey asserts and records it | rerun | existing helper |
| GitHub runner | Playwright browsers missing | `pnpm exec playwright install --with-deps chromium` step | — | T4 |

## Handoff Contracts

Consumes Phase 1's `dev:activate-billing-protocols` (exit 0 iff both rows `active`) and Phase 2's `signUp` wait, `onboarding-steps`, `studio-no-voice`. Produces nothing downstream; the CI artifacts are the phase's evidence.

## Reachability

A maintainer can run `pnpm -C respin test:e2e` locally, or trigger the `journeys` workflow, and read a report where the solo and operator journeys reached the paid chapters — via the workflow and the README shipped in this phase.

## Depends on

1 (activation script, included-build fix), 2 (`signUp` wait, testids).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| T1 | Terminal-state waits: niche panel — wait for the `saved`/`refused` sentence (Phase 1's reason text) not the pending label; landing — wait for `.demo-panel` visible before the screenshot; billing — wait for `manage-plan` or `action-error`; every `artifacts.screenshot` preceded by a settled-state expect. Export `BLOCKING_NOTE_PREFIX` from `support/artifacts.ts` and use it in all notes. | respin-engineer | `respin/e2e/journeys/*.spec.ts`, `respin/e2e/support/artifacts.ts` |
| T2 | Move `activateBrainSection` and a `buildVoiceBrain(page)` (paste ≥ min posts, press, wait, retry once on `run-refusal`) into `support/brain.ts`; studio-operator runs it for Profile A after the upgrade; editor-seat asserts a usable/honest-refusal outcome via `waitForGenerationOutcome` and fails on `studio-blocked`. | respin-engineer | `respin/e2e/support/brain.ts`, `solo-creator.spec.ts`, `studio-operator.spec.ts`, `editor-seat.spec.ts` |
| T3 | New chapters: solo — `/settings/account`, `/studio/frameworks`, marketing pages (`/changelog`, `/legal`, every `/for/<slug>` read from `app/(marketing)/audiences.ts` at test time), `/recover-deletion` (render only); operator — pause then resume (step-up password), buy a pack; admin — `/admin/activation` render. **Closing chapter on solo and operator: cancel the test subscription.** The product has no cancel action — its `cancel-final` control hands off to Stripe's Customer Portal (`billing-view.tsx:690-710`; `settings/billing/actions.ts` exports subscribe, buyPack, openPortal, recoverInvoice, pause, resume, setAutoTopup only) — so the chapter walks the interstitial to `cancel-final` (screenshot), then a **test-only** helper `cancelTestSubscription(email)` in `e2e/support/stripe.ts` resolves the subscription through the Stripe API (`customers.list({ email })` → `subscriptions.list({ customer })` — the page renders no id and the DB shortcut has no such query) and cancels it immediately with the test key (`STRIPE_SECRET_KEY`, already a CI secret); it runs in the spec's `afterAll`/`finally`, not only as a chapter, so an aborted journey still cancels; a sibling `sweepTestSubscriptions()` cancels every live subscription of an `e2e.*@example.test` customer and runs at CI job start; the journey then confirms the existing idempotent `customer.subscription.deleted` handler downgraded the workspace (billing page shows `subscribe` again). Immediate, not end-of-period, so the CI sandbox does not accumulate live subscriptions the restored snapshot forgets. Each chapter: navigate, settled-state expect, screenshot. | respin-engineer | the four spec files |
| T4 | **SUPERSEDED 2026-10-04 (batch 3) — re-base onto `.github/workflows/respin-journeys.yml`, paid chapters only.** No job in `respin.yml` (`respin/tests/journeys-workflow-triggers.test.ts:409`); the vendor key in the `journeys` Environment only (`respin-journeys.yml:56`; another workflow naming it fails the test's `:404`); triggers follow `respin-journeys.yml` (`workflow_dispatch`; `schedule` disabled until the ceiling is set, `:26-31`); `scripts/scan-journey-notes.ts` and its test already exist. Original text: `.github/workflows/respin.yml`: new `journeys` job (`workflow_dispatch`, `schedule` nightly) against a **persistent journeys database** — not a per-run service container: Phase 1's activation is one ceremony per (database lineage, Stripe sandbox), and the tier-checkout audit flags every Session from a previous lineage as `orphaned_customer_mapping` (`tier-checkout-rollout.ts:354-363`), so a fresh database fails activation from the second night onward. Provision: a `pg_dump` snapshot of a migrated, activated database bound to the CI sandbox **with the platform-admin identity already signed up in it**, stored as one object in the existing AWS account (same credential pattern as the R-124 deletion journal, its own key, refreshed by the owner whenever a migration lands — never an Actions artifact, which expires and is per-run, and never a secret, which cannot hold a dump), restored at job start into **Postgres started by `docker compose -f respin/docker-compose.yml up -d`** so the container is named `respin-postgres` — the journeys' `e2e/support/db-shortcut.ts:52-56, 66-82` shells `docker exec respin-postgres psql`, so a service container would break the editor-seat and admin chapters; `db:migrate` then runs forward-only; `dev:activate-billing-protocols` runs afterward and must short-circuit on `active`. Before Playwright, the job writes `e2e/journeys/artifacts/_handoff/platform-admin.json` from secrets `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_AUTH_USER_ID` (the identity baked into the snapshot) and sets `ADMIN_USER_IDS` to that id — otherwise `platform-admin.spec.ts:41-56` ends in its bootstrap `test.skip` and reports green without walking anything. `STRIPE_WEBHOOK_SECRET` is exported from `stripe listen --print-secret` at job start, not stored. Steps: compose up, restore, `pnpm install`, `playwright install --with-deps chromium`, `db:migrate`, `dev:activate-billing-protocols` (expect short-circuit), install Stripe CLI, export the webhook secret, write the admin handoff, sweep the CI sandbox's `e2e.*@example.test` subscriptions (T3 helper), start `pnpm dev`, `worker:start`, `stripe listen` (wait for "Ready!"), run the four specs in order, upload `e2e/journeys/artifacts` + `playwright-report`, then a scan step that fails if any `console.log` contains `BLOCKING_NOTE_PREFIX`; `scripts/scan-journey-notes.ts` (run via `tsx`, so it is inside the `table-writers` scan, typecheck and lint like every other `respin/scripts/*.ts`) with a unit test that plants the note and expects exit 1. **AC6 counts only after two consecutive green runs** (the second proves the lineage survives). Record the first run's model spend from `/admin/model-spend` in the report card; the runbook's CI snapshot section (owned by Phase 1 T1, not edited here) is where the snapshot key and refresh procedure live. | respin-engineer | `.github/workflows/respin.yml`, `respin/scripts/scan-journey-notes.ts`, `respin/tests/scan-journey-notes.test.ts` |
| T5 | `respin/e2e/journeys/README.md`: run order, processes (dev server, worker, `stripe listen`), env, the step-up password, Phase 1 activation prerequisite, the admin two-phase bootstrap, artifact locations, and "a green run is not a walked product — read the notes". | respin-engineer | `respin/e2e/journeys/README.md` |

## Files to Create / Modify

**Re-base note (2026-10-04, batch 3 L-6):** 11 rows, over the 10-row Files-table cap; split at re-base.

| Path | New/Mod | Owner | Note |
|---|---|---|---|
| `respin/e2e/journeys/solo-creator.spec.ts` | mod | respin-engineer | T1–T3 |
| `respin/e2e/journeys/studio-operator.spec.ts` | mod | respin-engineer | T1–T3 |
| `respin/e2e/journeys/editor-seat.spec.ts` | mod | respin-engineer | T1, T2 |
| `respin/e2e/journeys/platform-admin.spec.ts` | mod | respin-engineer | T1, T3 |
| `respin/e2e/support/artifacts.ts` | mod | respin-engineer | T1 constant |
| `respin/e2e/support/brain.ts` | ~~new~~ **mod** (exists, 2026-10-04) | respin-engineer | T2 |
| `respin/e2e/journeys/README.md` | ~~new~~ **mod** (exists, 2026-10-04) | respin-engineer | T5 |
| `respin/e2e/support/stripe.ts` | mod | respin-engineer | T3 cancel helper |
| ~~`.github/workflows/respin.yml`~~ `.github/workflows/respin-journeys.yml` (2026-10-04) | mod | respin-engineer | T4 |
| `respin/scripts/scan-journey-notes.ts` | ~~new~~ **mod** (exists, 2026-10-04) | respin-engineer | T4 |
| `respin/tests/scan-journey-notes.test.ts` | ~~new~~ **mod** (exists, 2026-10-04) | respin-engineer | T4 |

## Migration Steps

None.

## Verification Steps

1. `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` — clean (the scan unit test is part of `test`).
2. Locally, with both rollout rows `active` (Phase 1 step 3) and the three processes running: run the four specs in order (`pnpm -C respin exec playwright test e2e/journeys/<spec>`), requires 1 — expect no `BLOCKING` note and the paid chapters' screenshots present.
3. `pnpm -C respin exec tsx scripts/scan-journey-notes.ts e2e/journeys/artifacts` on the run from 2 → exit 0; then on a copy with a planted note → exit 1 (requires 2).
4. **SUPERSEDED 2026-10-04 (batch 3 L-3): the workflow is `respin-journeys.yml` and `ANTHROPIC_API_KEY` is a `journeys` Environment secret, not a repository secret; re-count the secrets at re-base.** Trigger the `journeys` workflow by `workflow_dispatch` (requires the five secrets configured — the owner's action, recorded) — expect green with artifacts; record model spend from `/admin/model-spend` in the report card.

## Acceptance Criteria (PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC1 | **Re-base note (2026-10-04, batch 3):** must also admit launch-remediation L2's clarification outcome (insufficient safe context asks a concise clarification) when re-based. Original: editor-seat records a `usable` or `honest_refusal` generation outcome and fails on `studio-blocked` | `editor-seat/console.log` note; spec assertion |
| AC2 | No screenshot in any run is taken before its settled-state expect (each `artifacts.screenshot` call is preceded by an `expect(...).toBeVisible` in the same chapter) | code review transcript listing the pairs |
| AC3 | Every route in F-20 has a screenshot in the artifacts of a local run | `ls` transcript |
| AC4 | **SUPERSEDED 2026-10-04 (batch 3): proof becomes `respin/tests/journeys-workflow-triggers.test.ts`** (the existing trigger test over `respin-journeys.yml`). Original: Workflow triggers are exactly `workflow_dispatch` and `schedule` | ~~`yq`/grep transcript on `respin.yml`~~ `tests/journeys-workflow-triggers.test.ts` |
| AC5 | Planted `BLOCKING` note makes the scan exit 1; clean artifacts exit 0 | `scan-journey-notes.test.ts` + verification 3 |
| AC6 | Two consecutive `journeys` runs green with artifacts uploaded, the second showing the activation short-circuit in its log; `platform-admin/02-admin-home.png` and `editor-seat/…studio-editor-generated.png` present in both runs' artifacts (no persona ended in a skip); model spend recorded | two Actions run links + artifact listings + `/admin/model-spend` screenshot in the report card |
| AC7 | README present and names the activation prerequisite and the step-up password | file |

## Risk coverage within those criteria

`journeys-manual-or-nightly-only` → AC4. Lesson 2026-08-26 (scanner proven by a planted violation) → AC5. Lesson 2026-09-09 (isolation stays loud) → AC1 + AC5 together: a journey that records a refusal and continues still fails the job.

## Least confident

`stripe listen` inside a GitHub Actions runner delivering `checkout.session.completed` to the dev server within the journeys' 30 s billing-page poll; if it does not, the poll length is a journey constant to raise, not a product change.

## Out of Scope (Surgical Changes)

Any file under `respin/app`, `respin/packages`, `docs/runbooks` (the CI snapshot section is Phase 1 T1's); `e2e/support/db-shortcut.ts` (unchanged — CI runs the same `respin-postgres` container); the `gate` job's existing steps; `playwright.config.ts` worker/retry settings.

## Completion Criteria (Definition of Done)

Entry gate clean; `respin-billing-reviewer` PASS (separate, full) on T3/T4; independent generalist review PASS; report card Ready with the four journeys' artifacts linked (including `platform-admin/02-admin-home.png` from a CI run, proving the admin persona walked) and the first CI run's model spend recorded; README shipped.
