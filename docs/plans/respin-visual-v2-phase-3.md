# Phase 3 — supporting surfaces and final walkthrough

Depends on: 2, with current Ready proof on disk. Owner: main orchestrator.

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

Functional: REQ-B01–B04, E01–E07, F01–F04, H01–H03, A02–A04, G01/G04/G05/G07/G08, I01–I05. Technical: no new backend decisions, full existing form/confirmation flow, no invented numbers or evidence; reuse phase 1/2 shared design.

| Task | Work | File rows |
|---|---|---|
| 1 | Extract Brain claim/edit/history rendering into focused files; add coloured, accurately qualified overview and section anchors | 1–5, 13 |
| 2 | Reference source/breakdown/adapt visual hierarchy using existing records/forms; preserve autopsy/source and withheld-state qualifications | 6–8, 13 |
| 3 | Style complete guided intake/interview/first-ideas, Results and billing/usage surfaces with existing fields/actions and evidence | 9–13 |
| 4 | Apply wordmark/theme/art treatment to landing and its shared sections; keep section order, pricing authority and labelled demo | 14–16 |
| 5 | Verify all surfaces in both themes and all required states; update relevant index/docs and final evidence | 17–23 |

## Files to Create / Modify

Relative to `respin/` except the final map entry; main-owned.

| # | Path | Kind |
|---|---|---|
| 1 | `app/(product)/brain/brain-view.tsx` | M |
| 2 | `app/(product)/brain/brain-claims.tsx` | N |
| 3 | `app/(product)/brain/brain-edit-forms.tsx` | N |
| 4 | `app/(product)/brain/brain-history.tsx` | N |
| 5 | `app/(product)/brain/brain-overview.tsx` | N |
| 6 | `app/(product)/trends/trends-view.tsx` | M |
| 7 | `app/(product)/trends/paste-panel.tsx` | M |
| 8 | `app/(product)/trends/pasted-references.tsx` | M |
| 9 | `app/(product)/onboarding/onboarding-view.tsx` | M |
| 10 | `app/(product)/onboarding/interview/interview-view.tsx` | M |
| 11 | `app/(product)/onboarding/first-ideas/first-ideas-panel.tsx` | M |
| 12 | `app/(product)/results/results-view.tsx` | M |
| 13 | `app/styles/product-surfaces.css` | N |
| 14 | `app/(marketing)/page.tsx` | M |
| 15 | `app/(marketing)/landing-sections.tsx` | M |
| 16 | `app/styles/landing-sections.css` | M |
| 17 | `tests/brain-ui.test.tsx` | M |
| 18 | `tests/visual-surfaces.test.tsx` | N |
| 19 | `e2e/visual/fixtures.tsx` | M |
| 20 | `e2e/visual/entry.tsx` | M |
| 21 | `e2e/visual/visual.spec.ts` | M |
| 22 | `DESIGN.md` | M |
| 23 | `../.codebase-map/SUMMARY.md` | M |

## Handoff and reachability

Consumes phase 1 semantic tokens/controls and phase 2 artwork/illustration component. Reuse existing view props; no new query, table or backend operation. Brain overview displays active and proposed separately, derives all values from existing scoped props, never substitutes sample audience/goals. Voice/Strategy/Kill Test/performance/history remain separately inspectable. Any semantic schema mismatch is labelled absence, not guessed prose.

Retain native confirmation/edit/activate forms and all current names/bound actions, evidence beside fields, per-kind refusal isolation, version history, complete export links and proposal approval. Overview navigation uses anchors/disclosures instead of changing persistence or adding an unsupported editor. Extracted components share existing types; no duplicate schema.

References keep real public-source/pasted-transcript forms and distinct original/adapted output, with existing stale/saturation/baseline qualification. Decorative concept icons are not frames. No invented analysis, causal performance claim or feed availability.

Setup preserves the full production interview and inference/confirmation journey. Visual progress describes real steps without pretending that the prototype's four-step sample is the contract. Results keeps self-reported labels, unavailable explanations, separate reach/conversion, paid/organic, confounders and approval. Billing/usage retain existing views/actions and inherit quiet shared surfaces from phases 1/3; no new financial wrapper or counter.

A creator can navigate the updated Brain, references, complete setup, Results, billing/usage and account views from the live product shell; visitors can use the themed landing/auth routes. No entity migration. Final code-map edits describe only source verified during this action.

## Edge cases / failures

| Boundary / inverse | Behavior | Task/check |
|---|---|---|
| Active version absent, proposal present, evidence missing, approval blocked | Distinct labelled states, no automatic activation; existing recovery links | 1 / P1 |
| Cancel edit/navigation, inference failure | Existing saved/unsaved semantics; never report a draft activated | 1,3 / P1 |
| Reference unavailable/stale/restricted, failed Spin | Preserve reasons, costs and source attribution; never display rejected candidate | 2 / P2 |
| Results absent, comparison unavailable, self-reported numeric values | No fake zero/verification or collapsed metrics; existing no-comparison explanation | 3 / P3 |
| Billing unavailable, long ledger, paused account | Existing null/error distinction and readonly access; local table scrolling | 3 / P3 |
| Long claims/labels, narrow screens, keyboard/zoom, reduced motion | Wrap correctly; controls and provenance remain reachable in both themes | 1–4 / P4 |

## Verification and acceptance

1. Read phase 2 Ready evidence and checkpoint current dirty worktree before edits. Source inspection precedes extraction. No source mutation before its current plan gate.
2. P1–P3: `pnpm -C respin exec vitest run tests/brain-ui.test.tsx tests/onboarding-ui.test.tsx tests/onboarding-interview-ui.test.tsx tests/first-ideas-ui.test.tsx tests/trends-page.test.tsx tests/trends-ui.test.tsx tests/landing-pricing.test.ts tests/auth-form.test.tsx tests/visual-surfaces.test.tsx`. Then `pnpm -C respin exec vitest run tests/results-entry.test.tsx tests/results-honesty.test.tsx tests/results-comparison.test.tsx tests/results-comparison-contract.test.ts tests/results-verification-unavailable.test.tsx tests/billing-ui.test.tsx tests/usage-honesty.test.tsx tests/usage-burn-by-mode.test.ts tests/pause-authority.test.tsx tests/brain-usage-9b-ui.test.tsx`. Tasks 1–5 establish code; phase 1/2 evidence establishes shared foundation. Full test gate in step 4 covers the complete population.
3. P4: `pnpm -C respin exec playwright test --config playwright.visual.config.ts`. After step 2, add real-component fixtures for populated/empty/blocked/error Brain, intake/interview, references, Results and financial surfaces. Exercise in both themes at 390/768/1024/1440; verify no page overflow, keyboard access, contrast, long-content resilience and two screenshot critique iterations. Do not change real journey/provider tests or invoke paid operations for visual evidence.
4. Run the canonical Respin typecheck/lint/test/build gate once stable. Use the existing per-path tests without weakening assertions. Record build/env limitations honestly. Check available running product routes read-only (marketing/auth; authenticated routes only if an already-authorized session exists), recording separately from fixture checks. Missing session/environment remains an explicit live-integration gap, never a fixture-derived PASS.
5. Final review: separate billing/tenancy plus lean compliance/learning/general correctness, with frozen manifest, actual commands/results, current checks and negative witnesses. Follow reservation/budget canon. Compare source/assertions/docs against reviewed inputs after fixes. Finish DESIGN/index updates and one phase report/ledger entry; whole redesign is complete only when all three phase obligations are evidenced.

PASS: P1–P4 plus applicable entry/review/DoD current; `brain-remains-explicit`, `evidence-remains-qualified`, `scoped-data-stays-scoped`, `checks-never-cleared-by-view` retain all negative witnesses from codebase review. Static fixture tests cannot certify production provider, billing or pilot usefulness.

Least confident: extracting the already-large Brain view without breaking a hidden source scanner or losing per-field confirmation/evidence in a secondary state. Preserve full existing assertions and exercise proposed plus active plus missing-evidence states.

Out of scope: new onboarding question model, Brain schema, metric computation, proposal creation, ledger operations, analytics connectors, platform integrations, deployment. Completion is the applicable CLAUDE.md Definition of Done plus the master plan's end-to-end design walkthrough, with all evidence gaps named and no premature Ready claim.
