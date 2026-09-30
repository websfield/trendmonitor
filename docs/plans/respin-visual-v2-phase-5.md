# Phase 5 — assembled-app integration and final acceptance

Depends on: 4, with current Ready proof on disk. Owner: main orchestrator. Any delegated test-database, auth or financial-boundary implementation uses an independent `gpt-5.6-sol`/high implementer with exclusive files.

## Project Conventions Pinned (READ FIRST)

## Golden rules (any project — keep these even if you rewrite everything else)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code — and a claim you *record* (in a comment, a doc, a decision log) is verified against the file it names **in the same action that records it**. A structural claim ("this can never happen") is proven by running it (a test or the command), not by an argument.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state. Deletion is the one mistake you can't iterate on.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back. A result counts only if the *method* was sanctioned too: output from a command this file's rules forbid, or from a run pointed at a copy instead of the real target, is discarded and re-obtained — and you name the command you actually ran, rather than waiting for someone to object.
7. **Small, verifiable steps.** Prefer the change you can test over the big-bang you can't; if you can't verify it, say so.
8. **Scale caution to blast radius.** Reading and analyzing are free — they change nothing. Edits and test runs are cheap — they're reversible. Pushing, publishing, sending anything outside the repo, and deleting what you didn't create (rule 3) are not: those wait for explicit confirmation, and if you catch yourself reaching for reasons one is *probably* fine, that reaching is the signal to stop and ask.
9. **Current facts beat trained memory.** Library APIs, CLI flags, and config schemas are present-day facts: verify against the installed version (lockfile, type definitions, `--help`, official docs) before use — partial recognition from training is not current knowledge.

## Non-negotiable rules (Respin — the active build)

1. **Spin, never copy.** The similarity gate is a hard pre-display gate (REQ-E04/I02, R-3); ingest from compliant sources only — no scraping of closed platforms (REQ-E01, R-4).
2. **The ledger is the balance.** `credit_ledger` is append-only, balance derived; webhooks idempotent on Stripe event id; debit in the generation's transaction (REQ-G04/G06, R-6).
3. **Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
4. **Learning is earned.** Proposals only from `packages/brain` at n ≥ 3 comparable verified results; unverified never learns; paid/organic never pool; reach and conversion never collapse (R-10, REQ-F).
5. **No leakage.** Nothing crosses profiles or workspaces; library contributions are mechanism-level only (REQ-A03/D04, R-9).
6. **No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point; engineering and evidence completion are separate claims (REQ-I03/I04, build-plan).
7. **A derived guard's population is a list, not a producer.** Any allowlist/guard computed by reading "everything that can reach this state" from a single call site — refusal codes a screen can throw, fields a scope guards, tables a registry covers — enumerates that population explicitly and is updated by listing every producer, never by grepping one; a second producer added later is a list edit, not an automatic inclusion (recurred twice: onboarding's refusal-code scan missed `infer-voice.ts`, then 9a's brain-doc-kind read missed a call site — promoted from the Lessons section below after the second recurrence).


## Relevant Lessons (verbatim)
- 2026-07-30 — A comment claiming a property is not the property: **assert it in a test or delete the claim**, and when a review names an inversion your fix might cause, write that inversion as a test before calling the fix done (why: a "total order" docstring sat above a *string* compare on an offset-bearing `date-time`, letting an approval outrank a later rejection; the fix then realised the exact inversion round 1 had warned about — an unreadable rejection vanished and an older approval authorised a rejected cut — and two more comments asserted behaviour the code lacked).
- 2026-08-10 — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun**, and an architecture guard satisfied by *splitting* a file must be re-checked for the hole the split opens (why: `cutdown doctor` printed a green `OK` for a `uv`/`pnpm` it had just failed to execute — four probe outcomes collapsed into one empty version string, in the one command whose job is honest environment reporting, surviving because no test called either check — and moving the spawn out of `doctor.ts` to satisfy tech-spec §11 then made `toolVersion('ffmpeg')` invisible to the very detector, since the caller names the binary without importing `child_process` and the helper imports it without naming one).
- 2026-09-04, recurred 2026-09-18 — **Any operation that re-materialises worktree bytes can flip line endings, and `git status` will not show it**: not only a text-mode write but `git stash push`/`apply`, `checkout`, `merge`, `rebase` and an editor save all pass through the `core.autocrlf` filter, so a scanner that matches a multi-line source literal reads bytes git does not pin — a positive match goes red on a phantom change, a negative match goes silently green on a real violation. The fix is to pin the bytes (`.gitattributes` `eol=lf` for every file a scanner reads, as `*.sh`/`*.md`/`*.json` already are) or to normalise `\r\n` inside the scanner, never a note to re-check; until pinned, run `git ls-files --eol` on the scanned set after any snapshot or branch switch before believing a red or a green scanner, and watch any harness that greps a tool's formatted output FAIL a known-bad case before trusting it (why: Python text-mode writes converted LF→CRLF across two dozen files while git showed a clean 95-line diff and `with-workspace.test.ts`'s pause-gate anchor went red; a mutation matrix greped vitest's ANSI-coloured summary and reported "SURVIVED" for all nine mutations unconditionally; then the checkpoint stash+apply re-checked out 48 LF files as CRLF and Phase 1's `page-wiring` multi-line plant went red on a phantom change — the first lesson had named the producer, not the class).

## Definition of Done

A change is done when (the full gate machinery lives in the `using-the-pack` skill):
- **Entry gate clean first:** every command in the Commands block passes — schemas parse, `dotnet build` + `dotnet test`, `pytest`, `ruff`, frontend typecheck + tests — or, when a baseline is recorded at `docs/progress/entry-baseline.md`, no **new** failures vs it (it only ratchets down, and retires at green).
- Every applicable Critical-Path gate reports PASS — the table above decides which run — and the report card reads **Ready**.
- Cross-referenced docs stay consistent: an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together, in the same change.
- Acceptance criteria met; docs updated if behaviour or config changed (`/sync-docs` does this).
- **Reachability:** a user path reaches this change — or the plan names the slice that makes it live. A capability nothing can reach is not done, it is inventory.

Stack: Next.js 15 App Router, TypeScript, React 19, pnpm 10.28.2. App imports sanctioned package facades; packages never import app. No new core dependency, raw DB query, model call, billing mutation or creator-content persistence. CLAUDE.md and .claude/** are read-only. Preserve unrelated changes. Read exact sources before editing; use small components and existing helpers. Available specialist: respin-engineer. Available reviewers: respin-billing-reviewer, respin-tenancy-reviewer, respin-compliance-reviewer, respin-learning-reviewer, code-reviewer, plan-reviewer, security-reviewer. Do NOT request unavailable spark_worker. All review requests remain independent and at the required model tier.

## Requirements and tasks

Verification of the master's existing REQ-A02–A04, B01–B04, C01–C06, D01–D05, E01–E07, F01–F04, G01/G04/G05/G07/G08, H01–H03 and I01–I05 presentation contract. This phase receives former phase 4 Task 4's assembled-app, manual AT and comparative UX obligations without changing their acceptance thresholds.

| Task | Work | File rows |
|---|---|---|
| 1 | Build the isolated disposable database/app runner and fail-closed external transport; prove interception, handshake and cleanup boundaries | 1–3, 5 |
| 2 | Exercise real authenticated creator journeys and test-ledger/lineage assertions across all three engines and both themes | 4–5 |
| 3 | Complete the five-creator comparative checks; consolidate source map and whole-goal evidence (assembled-app screen-reader walkthrough is optional per R-133) | 6–7 |

## Files to Create / Modify

Relative to `respin/` except map. Single owner per file; no concurrent write ownership with phase 4.

| # | Path | Kind |
|---|---|---|
| 1 | `playwright.integration.config.ts` | N |
| 2 | `e2e/integration/runner.ts` | N |
| 3 | `e2e/integration/external-preload.mjs` | N |
| 4 | `e2e/integration/visual-v2.spec.ts` | N |
| 5 | `e2e/integration/fixtures.ts` | N |
| 6 | `DESIGN.md` | M |
| 7 | `../.codebase-map/SUMMARY.md` | M |

## Handoff and reachability

Consumes phase 4's F1–F3 proof, completed real-component three-engine matrix and D1–D10 scorecards, all predecessor Ready evidence, and phase 1's preserved baseline/task script. F4/F5/F6 retain their original IDs and remain mandatory for whole-redesign Ready. Phase 4's local Ready is never whole-goal acceptance.

The runner reaches the actual current Next application, authentication, scoped readers, server actions and settlement. UI fixtures, route interception, archived baseline stimuli and real-service evidence cannot substitute for these journeys. Run only synthetic local resources; no production deployment or paid operation is authorized.

Any demonstrated application defect returns to its original owning phase and file manifest, with affected validation/review refreshed under that same gate's retained allowance. This phase cannot patch production files silently or retain stale predecessor Ready evidence after a repair. Finish required corrections before final acceptance.

## Actual-app test harness contract — V2-R2

The existing `playwright.config.ts` journeys call a live provider and are not this unpaid regression suite. Add the five test-only files in rows 1–5. `playwright.integration.config.ts` selects only `e2e/integration/visual-v2.spec.ts`, defines Chromium/Firefox/WebKit, uses one worker and `webServer` to run `pnpm exec tsx e2e/integration/runner.ts --serve` at `http://localhost:8011`, with `reuseExistingServer: false`. Run the journeys in both themes with fresh identities/state per browser/theme; no shared mutable fixture account. Never stop an existing process occupying that port. Existing persona journeys and their live-service expectations remain separate.

`runner.ts --check` checks the current worktree, required browsers, local Docker and test-environment prerequisites without starting application journeys; `--serve` launches only resources it owns. Create an isolated local Postgres instance without a persistent/shared volume, with generated test-only credentials and a fresh `respin_test_<lowercase-alphanumeric>` database name. Reuse `packages/db/src/testing.ts:createDockerTestDb` for its name guard and committed migrations only after proving this instance/name was created by this run; that helper resets schemas and must never target an existing shared database. Seed from the existing seed/config/framework authorities. Close pools and remove only this run's instance/resources in `finally`; retain diagnostic artifacts without private data. Do not read/copy local env files or inherit credentials. A clean CI/worktree environment with no dotenv files available to Next is a prerequisite; refuse startup if that cannot be established, rather than allowing Next to load denied material. No temporary application copy is tested.

Launch the actual Next CLI from this worktree with an explicit child environment containing only required safe runtime settings and generated/synthetic test configuration. No real Stripe/provider/telemetry credentials, no inherited `NODE_OPTIONS`, no production auth bypass or test-mode route. The test preload is installed only into that launched process and its Next children using a runner-owned Node preload argument. It replaces the outbound fetch transport before Next boots: the real Anthropic adapter still performs its host pin, SDK call and response parsing, but its captured underlying global fetch returns finite synthetic Anthropic Messages responses. Use existing adapter-test response envelopes and valid mode/voice fixtures; support multiple completions, provider refusal, schema failure and delayed responses. Never replace the adapter, application modules, routes, auth, RSC responses or Server Actions.

The preload must fail closed on unmatched vendor requests and unexpected non-loopback fetch/http/https egress, including Stripe/telemetry; it never forwards an Anthropic call. Allow only the runner's known loopback services. `--check` includes a child-process probe of the real adapter through the preload plus negative probes for unmatched request, forbidden egress and missing/stale preload handshake. Missing preload must prevent server readiness, not fall back to live transport. Record actual SDK/preload call counts and synthetic-response labels without logging headers, passwords or creator text. This is new test infrastructure to implement and prove, not a capability claimed to exist today; if Next's installed fetch wrapping or process model defeats interception, the test stays blocked until the test-only boundary is corrected.

`fixtures.ts` supplies only synthetic data and expected assertions. Sign up/sign in through real UI using the existing `e2e/support/auth.ts` pattern; do not seed a session cookie or replace `requireUser`. Prepare local tier/role/pause states, append-only credit grants and completed reference records through existing test/domain helpers, then exercise production pages/actions. No real Checkout, subscription mutation, account deletion or external worker is run. An existing completed reference tests the UI's selection→Spin integration; it is not new-ingestion/worker evidence. Assert database lineage and the number/value of actual test-ledger debits after actions; unknown/failed cases retain their real charging semantics. External transport fixtures do not prove real provider quality or Stripe behaviour.

## Edge cases / failures

| Boundary / inverse | Required behavior | Acceptance |
|---|---|---|
| Missing browser, Docker, safe environment, preload or handshake | Refuse readiness; record missing evidence; no live fallback or skipped engine | F4 |
| Existing port, database or volume | Never stop, reset or remove resources not created by this run | F4 |
| Unknown vendor request or non-loopback egress | Fail closed before any real provider/Stripe request | F4 |
| Scope switch, delayed action, foreign/missing reference, viewer/paused/Free state | Actual production isolation/refusal/charging semantics hold | F4 |
| Analysis/Spin prices differ or genuine zero | Pre-submit quote matches its own authority and actual settlement is separately asserted | F4 |
| Missing AT operator or participants; assisted trial or missing pair | Keep affected acceptance pending; no DOM/fixture/assistance-derived pass | F5/F6 |

## Verification and acceptance

1. Inspect current phase 4 and predecessor Ready evidence before implementation. Preserve the goal-wide checkpoint waiver and unrelated work. Prove the runner's negative probes before trusting any journey result.
2. F4 (V2-R2): after Task 1 creates the harness, run `pnpm -C respin exec tsx e2e/integration/runner.ts --check`, then `pnpm -C respin exec playwright test --config playwright.integration.config.ts`. The runner establishes the isolated DB, synthetic transport and actual Next server. All three browser projects must pass: real sign-up/sign-in/session-expiry redirects; complete onboarding/explicit Brain activation; six Studio modes through actual forms; full-script generation/checks/scene/export and parent-linked revision; A reference→existing completed analysis→Spin; Free/viewer/paused refusals; profile switching while old work is pending; Frameworks navigation and create/edit/approve/retire permissions; manual Results; read-only Usage/Billing/Account. Check real test-ledger debit counts, generation lineage and no duplicate submissions; theme/tab/scene/navigation alone invoke no paid action. Assert withheld/refused output cannot be exported, foreign/missing autopsy IDs refuse, selected profile/action scopes agree and no hydration/browser errors occur. No route/RSC/action interception is allowed. Test failures or absent prerequisites block whole-redesign Ready.
3. F5 (V2-R7): the manual screen-reader walkthrough on the assembled app is **optional and non-blocking** (R-133) and no longer a phase-5 acceptance input. If performed, record exact browser/AT versions, the covered journey and observed failures. If not performed, record it as not obtained and claim no accessibility conformance.
4. F6 (V2-R6): use phase 1's preserved baseline and the master's counterbalanced five-creator protocol, shared tasks, denominators and non-regression/improvement criteria. New-only export is separate from shared-task comparisons. Record results in this phase's report; unavailable participants/baseline leave F6 pending. Close V2-R3 only from actual D1–D10 evidence, never a self-declared percentage.
5. Re-run `pnpm -C respin exec playwright test --config playwright.visual.config.ts` on the final tree; retain the master's complete three-engine/theme/width/state population, D1–D10 scores and phase-local AT records. Run canonical Respin typecheck/lint/test/build once stable and record failures/skips/environment limits. Gate all four touched paths: separate billing and tenancy, lean compliance/learning plus general correctness; include explicit security assessment of test-only egress, credentials, database ownership and cleanup. Reserve all required specialist/security/final slots before dispatch. Required docs, final affected validation/review and all predecessor evidence must be current before closure.

Additional mandatory B-V2-02 witness: F4 compares the visible pre-submit Spin quote to the seeded config separately from analysis, then checks the existing action's actual settled debit; post-action charge assertions alone cannot satisfy the quote check. Preserve legitimate parked-autopsy refunds. Phase 4 retains the independent F1/F3 quote witnesses.

F6 uses the master's frozen assistance rule: all five participants remain in completion denominators, paired unassisted trials alone support time/wrong-turn comparison and improvement, and missing paired evidence stays pending. Record assisted outcomes and comprehension before corrective help separately.

PASS: F4–F6 plus current inherited F1–F3, all five phases, all V2-R1–V2-R7 obligations and entry/reviews/DoD. Preserve the complete eight-invariant contract. No skipped browser, mocked-action substitute, missing human evidence or visual average can satisfy a failed gate. Actual-app integration with synthetic external responses, real-service evidence and observed creator usability remain separate claims.

Least confident: the new unpaid external-transport preload across Next's real process/fetch lifecycle; prove handshake, interception and forbidden-egress failures before using its journey results.

Out of scope: new production source adapters, metric/proposal algorithms, ledger/subscription behaviour, analytics connectors, production test-mode switches and deployment. Disposable synthetic database setup and real test-ledger assertions belong only to this harness. Phase artifacts: gate transcripts, one report card and ledger entries; no per-task document sets.
