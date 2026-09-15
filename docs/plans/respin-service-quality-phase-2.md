# respin-service-quality — Phase 2: journeys as a nightly Free-path service regression

Status: NOT READY — plan review batch 3 (2026-09-15) findings applied the same day as edits E7–E9 (master plan Plan Review Log), unverified until the owner-approved batch 4. Depends on: 1.
Master plan: [`respin-service-quality-master-plan.md`](respin-service-quality-master-plan.md) — **creator-ready Phase 2** (owner ticket T7-A, Free path) under [`creator-ready-master-plan.md`](creator-ready-master-plan.md) · Audit rows: F-18, F-19, F-20, F-21 (Free-path parts; paid chapters env-gated off).

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
- 2026-08-26 — **A verifier that reports success is not verified until something OUTSIDE it tries to break it** … every scanner must assert it catches a PLANTED violation of each shape it claims to cover.
- 2026-09-04 — **Verify the bytes your edit changed, and the harness that says they are fine** … a check that greps a tool's *formatted* output is worthless until you have watched it FAIL a known-bad case.
- 2026-09-09 — **Isolating a failure so the batch survives it converts a LOUD failure into a SILENT one**: the try/catch ships in the same change as a count that reaches an alert.

Stack: Playwright `@playwright/test` ^1.63 (`respin/playwright.config.ts`: one worker, no retries, journeys run one at a time solo → studio → editor → admin), GitHub Actions — the journeys run in a **new** `.github/workflows/respin-journeys.yml`, never as a job in `respin.yml`, whose workflow-level triggers are `push` and `pull_request` (`respin.yml:5-14`) — Node 22 in CI. The journeys spend real Anthropic credits: never on `push` or `pull_request`. The journeys record refusals and continue by design — a green run is evidence only through its notes and screenshots. `e2e/support/db-shortcut.ts:52-56, 66-82` shells `docker exec respin-postgres psql`, so CI must host Postgres through `docker compose -f respin/docker-compose.yml` (container `respin-postgres`, `docker-compose.yml:11`), not a service container. `platform-admin.spec.ts:41-56` ends in `test.skip` when `_handoff/platform-admin.json` is absent. **Money path parked:** no Stripe forwarder, no checkout, no rollout activation in this phase; the subscribe chapters run only when `E2E_PAID_TIERS=1`.

Agents: owner `respin-engineer`; reviewers `respin-tenancy-reviewer` (separate, full — T4 provisions the admin identity, asserts `ADMIN_USER_IDS` and handles secrets: the admin-surface and secrets triggers of that path) and `plan-reviewer`. Do NOT request `eval-harness-engineer` (UGC) or any agent absent from `.claude/agents/`.

## Requirements Checklist (functional)

- [ ] F-19 / REQ-A02: studio-operator builds and activates a voice brain for Profile A (Free includes one build per profile), so editor-seat generates a draft and asserts a usable or honest-refusal outcome — never a precondition refusal.
- [ ] F-18: every screenshot and status read follows a settled-state wait; no capture mid-submit (landing `.demo-panel` visible; niche `niche-saved`/`niche-refused`/`niche-disabled-tier`; onboarding `onboarding-steps`; Studio `studio-result`/refusal testids).
- [ ] F-20: the journeys cover `/settings/account`, `/studio/frameworks`, `/admin/activation`, `/changelog`, `/legal`, every `/for/<slug>` from `app/(marketing)/audiences.ts`, `/recover-deletion` (render + screenshot).
- [ ] F-21: `respin/e2e/journeys/README.md` states run order, processes, env, the `E2E_PAID_TIERS` gate, the admin identity contract, artifact locations, and "a green run is not a walked product".
- [ ] Paid chapters (subscribe, second profile, paste/autopsy/spin, results logging, pause/pack) are wrapped in `if (process.env.E2E_PAID_TIERS === "1")`; when absent they write one `[note] skipped: paid tiers not enabled` line (never the `BLOCKING` prefix) and the journey continues on the Free path it already handles.
- [ ] A `journeys` workflow job (`workflow_dispatch` now; `schedule` nightly only after the owner records a spend ceiling in the README) runs the four specs on the Free path after `docker compose up`, `db:migrate`, `db:seed`, with the admin identity minted per run by a bootstrap sign-up; uploads artifacts; fails on any spec failure **and** on any `BLOCKING` note **and** on any missing main-chapter screenshot.

## Requirements Checklist (technical)

- [ ] No product code changes in this phase; a testid the product lacks is a finding routed to Phase 1, not a product edit here.
- [ ] One persistent secret only (`ANTHROPIC_API_KEY`); the admin identity is created per run through the product's own sign-up with the journeys' committed throwaway password (`e2e/support/auth.ts:17` — not a secret; owner decision 2026-09-15) and its id exported to the job environment; `BETTER_AUTH_SECRET` is minted per run and masked; nothing echoed.
- [ ] Invariant `journeys-manual-or-nightly-only`: `respin-journeys.yml`'s triggers are exactly `workflow_dispatch` and (when enabled) `schedule`, and `respin.yml` gains no journeys job.
- [ ] Invariant `journeys-no-persona-skips`: a presence assertion per persona for its main-chapter screenshot; the note scan and the screenshot check are each proven against a planted violation.

## Edge Cases & Failure Paths

| Question | Answer → task |
|---|---|
| Inverse: the admin allowlist does not contain the run's admin id | Cannot happen by construction: the bootstrap step signs the identity up against a first dev-server start, reads its id from the handoff, exports `ADMIN_USER_IDS` to `$GITHUB_ENV`, stops that server, and only then does a later step start the dev server and worker the specs use; if the export fails the job stops there. If a stale server were already running, `requireAdmin` calls `notFound()` (`packages/auth/src/server.ts:120`) — Next's 404 copy does not match the spec's `/not authorised|not allowed|forbidden/` regex at `platform-admin.spec.ts:64` (dead code), so the loud failure is the `heading "Admin"` assertion at `:70` — a failure, not a skip (T4). |
| Voice build for Profile A refused (Phase 1's kinds now name why) | A kind-bearing refusal is recorded (kind in the note) with no retry — a Free re-press is refused before the vendor; a pre-vendor refusal is retried once; either way the editor chapter asserts the precondition refusal explicitly instead of passing silently (T2). |
| `E2E_PAID_TIERS=1` set but no Stripe forwarder | The subscribe chapter records a `BLOCKING` note as today — that is correct: the flag claims paid tiers are enabled (T3). |
| Phrase drift in the note scan | The prefix is one exported constant in `support/artifacts.ts`; the planted-note test proves the scan (T4). |
| Handoff file from a previous CI run | Fresh checkout; `_handoff/` is git-ignored and absent; the bootstrap step writes the admin handoff (T4). |
| Model slow (>90 s) | `waitForGenerationOutcome` returns `timed_out`; the journey asserts and records it (existing helper). |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behaviour | Reconciliation | Spec |
|---|---|---|---|---|
| Anthropic | refusal / timeout | recorded outcome; job fails only on `BLOCKING` or missing screenshot | rerun | T2, T4 scan |
| GitHub runner | browsers missing | `playwright install --with-deps chromium` step | — | T4 |
| Docker in CI | compose fails | job fails at setup before any journey | — | T4 |

## Handoff Contracts

Consumes Phase 1's `signUp` wait (`**/onboarding`), `onboarding-steps`, `studio-no-voice`, `niche-*` testids, and `AssemblyError.kind` in the refusal note. Produces the CI artifacts as evidence; nothing downstream.

## Reachability

A maintainer can run `pnpm -C respin test:e2e` locally or trigger the `journeys` workflow and read a report where every persona walked its main chapter on the Free path — via the workflow and the README shipped in this phase.

## Depends on

1 (testids, `signUp` wait, assembly kinds).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| T1 | Terminal-state waits everywhere: export `BLOCKING_NOTE_PREFIX` and `SKIPPED_NOTE_PREFIX` from `support/artifacts.ts`; every `artifacts.screenshot` in a chapter is preceded by an `expect(...).toBeVisible` on that chapter's settled testid (landing `.demo-panel`; niche `niche-saved`/`niche-refused`/`niche-disabled-tier`; onboarding `onboarding-steps`; Studio terminal testids; billing: on the Free path CI runs **without** `STRIPE_SECRET_KEY`, so `/settings/billing` renders the keyless refusal (`settings/billing/page.tsx:144`, remedy copy `billing-errors.ts:885`) — `data-testid="stripe-unconfigured"` (`billing-view.tsx:258-262`) is the settled state, and `manage-plan`/`subscribe` are asserted only under `E2E_PAID_TIERS=1`). Because keyless CI with an empty `stripePriceMap` (`packages/db/src/seed.ts:74`) disables every billing control for every role, editor-seat's boundary chapter (`editor-seat.spec.ts:91-102`) additionally asserts the not-owner reason — "Only the workspace owner can change billing", which `billing-view.tsx:219-221` ranks before the Stripe remedy — is visible, and the owner personas assert it absent. Remove the stale header comment in `e2e/support/stripe.ts:2-3` ("callers verify `sk_test_` first" — no caller does; the `E2E_PAID_TIERS` wrap is the real guard). **AC2's witness** is `respin/tests/journey-settled-waits.test.ts` (new): reads the four spec sources and asserts every `artifacts.screenshot(` call is preceded within five lines by `toBeVisible` or `waitFor`, proven by a planted violation. | respin-engineer | `respin/e2e/journeys/*.spec.ts`, `respin/e2e/support/artifacts.ts`, `respin/e2e/support/stripe.ts` (comment only), `respin/tests/journey-settled-waits.test.ts` (new) |
| T2 | `support/brain.ts`: move `activateBrainSection` and add `buildVoiceBrain(page)` (paste ≥ `minOwnPostsForVoice` posts, press, wait; **on a refusal that carries `data-assembly-kind` record the kind and do not retry** — the included build was claimed at step 8b before the parse and a Free re-press is refused by the balance gate (rebuild 50 > Free 25 in the seed), so a retry would reach no vendor and yield an `insufficient_credits` banner with no kind; **retry once only on a pre-vendor refusal**, identified by the banner's `data-code` (added by Phase 1 T1) being in the explicit list `run_slot_busy`, `server_at_capacity` — on the voice path both come only from `RunSlotBusyError` at `packages/credits/src/inference.ts:740`, before the vendor call, the included-build claim and any debit (never merely "no kind attribute" — a post-vendor `LlmError` also carries no kind yet consumed the build); **`workspace_paused` is not on the list**: besides `inference.ts:562` it is produced after the claim by `writeBrainDoc` and by `debitCredits` (`ledger.ts:414`); such a refusal is still the included build at 0 credits; for the three pre-vendor assembly kinds no build was claimed, but the failure is deterministic, so a re-press repeats it and there is no retry either); studio-operator runs it for Profile A on Free; editor-seat asserts `usable`/`honest_refusal` via `waitForGenerationOutcome` and fails on `studio-blocked`. | respin-engineer | `respin/e2e/support/brain.ts`, the three creator specs |
| T3 | Gate every paid chapter behind `E2E_PAID_TIERS === "1"` with a `SKIPPED_NOTE_PREFIX` note when absent; add the F-20 chapters (navigate, settled-state expect, screenshot; `/for/*` enumerated from `AUDIENCES` at test time); each spec takes its **main-chapter screenshot name** from `e2e/support/main-chapters.ts` (the map the scan also reads). | respin-engineer | the four spec files, `respin/e2e/support/main-chapters.ts` |
| T4 | **`.github/workflows/respin-journeys.yml`** (new file; `on: workflow_dispatch` only — `schedule` commented with the README's ceiling rule; `respin.yml` untouched, because its `push`/`pull_request` triggers at `:5-14` are workflow-level and would carry any job in that file). **Job environment, enumerated** (there is no dotenv anywhere; `respin/env.example` is the reference): `DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin` (compose maps **5435**, `docker-compose.yml:20`), `BETTER_AUTH_URL=http://localhost:8000` (`create-auth.ts:354-355`), `ANTHROPIC_API_KEY` (the one GitHub secret; `worker/main.ts:14`), `BETTER_AUTH_SECRET` and `ADMIN_USER_IDS` (both set by earlier steps through `$GITHUB_ENV`, which reaches only **later** steps); the `RESPIN_DELETION_*` journal variables stay unset as they do locally. **Steps, in order:** (1) `docker compose -f respin/docker-compose.yml up -d --wait` (the compose healthcheck, `docker-compose.yml:27-31`, gates it); (2) `pnpm install`, `pnpm -C respin exec playwright install --with-deps chromium`; (3) `db:migrate`, `db:seed`; (4) **secret step** — mint `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `::add-mask::` it, write it to `$GITHUB_ENV`; (5) **admin bootstrap step** — start `pnpm -C respin dev` backgrounded with **no** `ADMIN_USER_IDS`, wait for readiness, run `playwright test e2e/journeys/platform-admin.spec.ts` once: with no handoff it signs a fresh identity up through the product's own `/sign-up` using the committed throwaway password (`freshIdentity`, `e2e/support/auth.ts:12-19`), reads the Better Auth id via `lookupAuthUserId` (docker psql, `e2e/support/db-shortcut.ts`), writes `_handoff/platform-admin.json` and ends in its bootstrap `test.skip` (`platform-admin.spec.ts:41-56`) — then read `authUserId` from the handoff, write `ADMIN_USER_IDS=<id>` to `$GITHUB_ENV`, and stop that dev server by its recorded PID; this reuses the sanctioned UI path, so no script imports `getAuth`/`createAuth` (the `respin/scripts/**` lint allowlist, `eslint.config.mjs:584-608,1076-1078`, keeps them package-only, and that boundary is **not** widened); its report goes to its own output directory and is not a persona run; (6) **start step** — start `pnpm -C respin dev` and `pnpm -C respin worker:start` backgrounded with PIDs recorded (both now see `ADMIN_USER_IDS` and `BETTER_AUTH_SECRET`; the worker reads `process.env`, `worker/production.ts:309,340`), wait for readiness (a curl loop on `http://localhost:8000/` until 200, up to 3 minutes), then warm-up GETs of public routes (`/sign-up`, `/`) — **stated residual:** unauthenticated warm-ups are redirected away from product pages, so the first authenticated navigation may still pay a cold compile; if a spec fails on the 30 s navigation timeout the rule is one recorded re-dispatch, never a raised timeout; (7) run the four specs in order, each with its own `PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/<persona>` (supported by the installed Playwright 1.63.0) so later runs cannot overwrite an earlier failure's report; (8) **delete** `e2e/journeys/artifacts/_handoff/` (`if: always()`); (9) `scripts/scan-journey-notes.ts` over both trees (`if: always()`) — fails on any `BLOCKING` note, any missing main-chapter screenshot, or any file under `_handoff/`; (10) upload `e2e/journeys/artifacts` with `_handoff/**` excluded and `playwright-report/**` with `data/*.zip` excluded (`if: always()`). The per-persona main-chapter screenshot names live in **`e2e/support/main-chapters.ts`** (a plain module imported by each spec and by the scan — a spec file cannot be imported outside the Playwright runner because its top-level `test()` throws), and the presence check is a **suffix match** `*-<name>.png` because `artifacts.ts:72` prefixes every screenshot with a running number. **What an uploaded artifact can contain, stated once:** `HANDOFF_DIR` is `e2e/journeys/artifacts/_handoff` (`e2e/support/handoff.ts:9`) and handoff files carry `{ email, password, authUserId }`, so `_handoff/` is deleted before the scan and excluded from upload; fill-step titles in `playwright-report/<persona>/index.html` and any retained failure trace may contain the personas' and the admin's passwords — all the committed throwaway constant of `auth.ts:17`, for identities that exist only in the runner's ephemeral database — so no secret reaches an artifact, and the plan claims no password scan of zipped or encoded report content. The only persistent secret the job holds is `ANTHROPIC_API_KEY`; `BETTER_AUTH_SECRET` is masked and never written to a file. Unit test plants three violations (note, missing screenshot, a `_handoff/` file in either tree) and expects exit 1; a clean tree exits 0. | respin-engineer | `.github/workflows/respin-journeys.yml` (new), `respin/scripts/scan-journey-notes.ts`, `respin/e2e/support/main-chapters.ts`, `respin/tests/scan-journey-notes.test.ts` |
| T5 | `respin/e2e/journeys/README.md`: run order, processes (dev server, worker; Stripe forwarder only with `E2E_PAID_TIERS=1`), the two-start admin bootstrap, a sentence that uploaded artifacts contain full-page screenshots and console logs of the synthetic personas' brain documents and drafts, env, the local worker start (`node --env-file=.env.local --import tsx worker/main.ts` — the worker reads `process.env` and has no dotenv; verified 2026-09-15 on Node 24; CI passes env through `$GITHUB_ENV` instead), the admin identity contract, artifact locations, the spend-ceiling rule for enabling `schedule`, and "a green run is not a walked product — read the notes". | respin-engineer | `respin/e2e/journeys/README.md` |

## Files to Create / Modify

| Path | New/Mod | Owner | Note |
|---|---|---|---|
| `respin/e2e/journeys/solo-creator.spec.ts` | mod | respin-engineer | T1–T3 |
| `respin/e2e/journeys/studio-operator.spec.ts` | mod | respin-engineer | T1–T3 |
| `respin/e2e/journeys/editor-seat.spec.ts` | mod | respin-engineer | T1–T3 |
| `respin/e2e/journeys/platform-admin.spec.ts` | mod | respin-engineer | T1, T3 |
| `respin/e2e/support/artifacts.ts` | mod | respin-engineer | T1 constants |
| `respin/e2e/support/stripe.ts` | mod (header comment only) | respin-engineer | T1 |
| `respin/e2e/support/main-chapters.ts` | new | respin-engineer | T3, T4 |
| `respin/tests/journey-settled-waits.test.ts` | new | respin-engineer | T1 (AC2) |
| `respin/e2e/support/brain.ts` | new | respin-engineer | T2 |
| `respin/e2e/journeys/README.md` | new | respin-engineer | T5 |
| `.github/workflows/respin-journeys.yml` | new | respin-engineer | T4 (`respin.yml` untouched) |
| `respin/scripts/scan-journey-notes.ts` | new | respin-engineer | T4 |
| `respin/tests/scan-journey-notes.test.ts` | new | respin-engineer | T4 |

## Migration Steps

None.

## Verification Steps

1. `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` — clean (the scan unit test is part of `test`).
2. Locally with the dev server and worker running (state: Postgres up, Phase 1 shipped): run the four specs in order without `E2E_PAID_TIERS` (requires 1) — expect `skipped: paid tiers not enabled` notes, no `BLOCKING` note, every persona's main-chapter screenshot present, the editor persona's generation outcome recorded.
3. Delete `e2e/journeys/artifacts/_handoff/` (the specs write it, `studio-operator.spec.ts:137`), then `pnpm -C respin exec tsx scripts/scan-journey-notes.ts e2e/journeys/artifacts` on the run from 2 → exit 0; then on a copy with a planted `_handoff/` file → exit 1; then on a copy with a planted `BLOCKING` note → exit 1; then on a copy with one main-chapter screenshot deleted → exit 1 (requires 2).
4. Trigger the `respin-journeys` workflow by `workflow_dispatch` (requires the `ANTHROPIC_API_KEY` secret configured **and the owner-side vendor spend limit on that key recorded** — owner actions, recorded) — expect green with artifacts; record model spend from `/admin/model-spend`.

## Acceptance Criteria (PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC1 | editor-seat records `usable` or `honest_refusal` and fails on `studio-blocked`; editor-seat asserts the not-owner billing reason visible and owner personas assert it absent; studio-operator's Profile A brain is activated on Free | `editor-seat/console.log`, `studio-operator/…brain-activated.png` |
| AC2 | Every `artifacts.screenshot` call is preceded by a settled-state `expect` in the same chapter | lint-style test over the spec sources (a regex over `artifacts.screenshot(` preceded within 5 lines by `toBeVisible` or `waitFor`), proven with a planted violation |
| AC3 | Every F-20 route has a screenshot in a local run's artifacts | `ls` transcript |
| AC4 | `.github/workflows/respin-journeys.yml` triggers are exactly `workflow_dispatch` (and `schedule` only once the README carries a ceiling); `.github/workflows/respin.yml` contains no journeys job | grep transcript over both files |
| AC5 | Planted `BLOCKING` note → exit 1; planted missing main-chapter screenshot → exit 1; planted `_handoff/` file in either upload tree → exit 1; clean → exit 0; the workflow deletes `_handoff/` before the scan, scans both trees before upload, runs delete/scan/upload with `if: always()`, excludes `_handoff/**` and `data/*.zip` from upload, and masks `BETTER_AUTH_SECRET` | `scan-journey-notes.test.ts` + verification 3 + workflow grep |
| AC6 | First `workflow_dispatch` run green with artifacts uploaded and all four main-chapter screenshots present; model spend recorded | Actions run link + artifact listing + `/admin/model-spend` screenshot |
| AC7 | README present with the `E2E_PAID_TIERS`, admin identity and ceiling sections | file |

## Risk coverage within those criteria

`journeys-manual-or-nightly-only` → AC4. `journeys-no-persona-skips` → AC1 + AC5 + AC6 (presence of every persona's main screenshot, proven failable). Lesson 2026-08-26 → AC2 and AC5 planted violations.

## Least confident

Corrected in batch 3: the earlier "answered" claim that a `respin/scripts/` file could import `getAuth` was false (`eslint.config.mjs:1018-1019` default-deny covers everything but `packages/**` and `tests/**`; the scripts allowlist excludes the auth factories), so the admin identity now comes from the spec's own UI bootstrap. The remaining bet: whether the two-start bootstrap, compose-hosted Postgres on the hosted runner and the unauthenticated warm-up reach a green first `workflow_dispatch` without a runner-specific surprise — Docker availability on the hosted runner is assumed, and a cold compile of an authenticated page is the likeliest first failure (T4 step 6's re-dispatch rule).

## Out of Scope (Surgical Changes)

Any file under `respin/app`, `respin/packages`, `docs/runbooks`; `e2e/support/db-shortcut.ts` (unchanged — CI runs the same `respin-postgres` container); the body of `stripe.ts` (its stale header comment is the one edit) and every paid chapter's logic; `playwright.config.ts` worker/retry/trace settings.

## Completion Criteria (Definition of Done)

Entry gate clean; `respin-tenancy-reviewer` PASS (T4); independent generalist review PASS; report card Ready with the four journeys' artifacts linked and the first CI run's model spend recorded; README shipped.
