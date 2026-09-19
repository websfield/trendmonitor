# Phase 1 — shared design foundation

Depends on: none. Owner: main orchestrator (available specialist: `respin-engineer`).

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

Functional: preserve the existing reachable product, auth and marketing flows while replacing the shared visual system (REQ-A02/A03, B02, C01/C02, F02/F04, G04/G05/G07, I03/I04). Technical: semantic token authority, one mounted theme model, no new service/dependency, guarded preference only, native accessible controls.

| Task | Work | File rows below |
|---|---|---|
| 1 | Document Colour Pop/After Hours palette, type/space/radius/motion, category/amber states and component rules; replace token values, retain names | 1–3 |
| 2 | Extract existing CSS by responsibility before styling; retain cascade and existing class API; cover quiet financial/evidence surfaces | 3, 12–17 |
| 3 | Bootstrap validated local preference before paint; add visible theme control; no remount/reload/router refresh or action | 4, 10–11 |
| 4 | Wordmark, icon navigation, workspace/balance rail, compact mobile navigation and skip link | 5–9, 14 |
| 5 | Build deterministic browser harness using actual UI components, installed Playwright and tsx's installed esbuild; verify both themes and shell | 18–25 |

## Files to Create / Modify

All files owned by main; M = modify, N = new. Paths below are relative to `respin/`.

| # | Path | Kind |
|---|---|---|
| 1 | `DESIGN.md` | M |
| 2 | `app/respin-tokens.css` | M |
| 3 | `app/globals.css` | M |
| 4 | `app/layout.tsx` | M |
| 5 | `app/(product)/layout.tsx` | M |
| 6 | `app/(product)/nav.tsx` | M |
| 7 | `app/(product)/shell-rail.tsx` | M |
| 8 | `app/ui/brand.tsx` | N |
| 9 | `app/ui/icon.tsx` | N |
| 10 | `app/ui/theme-switch.tsx` | N |
| 11 | `app/ui/theme.ts` | N |
| 12 | `app/styles/controls.css` | N |
| 13 | `app/styles/surfaces.css` | N |
| 14 | `app/styles/shell.css` | N |
| 15 | `app/styles/landing-base.css` | N |
| 16 | `app/styles/landing-sections.css` | N |
| 17 | `app/styles/landing-demo.css` | N |
| 18 | `tests/theme.test.ts` | N |
| 19 | `tests/shell-rail.test.tsx` | M |
| 20 | `e2e/visual/fixtures.tsx` | N |
| 21 | `e2e/visual/entry.tsx` | N |
| 22 | `e2e/visual/visual.spec.ts` | N |
| 23 | `playwright.visual.config.ts` | N |
| 24 | `e2e/visual/harness.ts` | N |
| 25 | `e2e/visual/navigation.ts` | N |

## Handoff and reachability

Phase 2/3 consume existing token names plus documented category/check/gradient tokens, shared Brand/Icon/ThemeSwitch, and browser harness. `theme.ts` owns the key, validation and bootstrap string; root layout and harness consume the same implementation. A creator can select Colour Pop or After Hours through the product shell; shared root tokens also style marketing/auth. No entity migration.

## Edge cases and external failures

| Boundary / inverse | Degraded behavior and reconciliation | Task/check |
|---|---|---|
| localStorage read/write throws, malformed/stale value | Initial light fallback; switching still changes current session; only valid theme stored | 3 / V1 |
| Reload/navigation/hydration | Persisted valid preference applied before paint; no hydration errors; no content-state mutation | 3 / V1 |
| JavaScript unavailable | Server light styles and native route links remain usable | 3–4 / V1 |
| Balance unavailable vs zero | Preserve null omission and real zero; no percentage bar without denominator | 4 / V2 |
| Narrow viewport/long workspace name/zoom | Wrapping/scroll limited to intended regions, reachable mobile links, visible focus | 4 / V3 |
| Forced colors/reduced motion | Visible outline and selected text/state cues; no essential decorative motion | 2–4 / V3 |

No external service is introduced. Auth/credit failures retain the existing page and shell handling.

## Verification Steps and acceptance

1. Before source edits save the canon-required checkpoint, record baseline dirty paths and scan file line endings. Read each source before editing. State: inspected repository; no prior verification dependency.
2. V1: `pnpm -C respin exec vitest run tests/theme.test.ts tests/shell-rail.test.tsx`. State established by tasks 1–5. Test theme validation/storage failure, real zero/null rail and production root bootstrap wiring.
3. V2: `pnpm -C respin exec vitest run tests/landing-pricing.test.ts tests/auth-form.test.tsx tests/brain-ui.test.tsx tests/onboarding-ui.test.tsx tests/studio-ui.test.tsx tests/client-bundle-boundary.test.ts tests/import-boundary.test.ts`. State: step 2 complete; preserve existing semantic assertions, not just class snapshots.
4. V3: `pnpm -C respin exec playwright test --config playwright.visual.config.ts`. State: step 2 establishes code and browser harness; installed Chromium already launched during reference inspection. Fixture harness imports actual components and CSS, bundles with esbuild resolved through installed tsx; no credentialed service/generation. Intercept unexpected network, test theme retention/keyboard/mobile links, take screenshots at 390/768/1024/1440 in both themes. Contrast, 44px controls, no page horizontal overflow, no hydration/page errors. Two render/critique/fix rounds until no observed fixes remain. Label fixture evidence distinctly from live route evidence.
5. Entry gate once stable: `pnpm -C respin typecheck`, `pnpm -C respin lint`, `pnpm -C respin test`, `pnpm -C respin build`, in that order, capture actual outputs. Do not read local env files. Build/tool failures remain unverified. If a command implicitly needs denied local env material, record the blocker rather than copying it elsewhere. Retain existing loud skipped Docker/provider tests as skipped, not passed live.
6. Review all four touched paths: separate billing/tenancy plus lean compliance/learning/general correctness. Reserve and read back slots first; reviewers see exact results and this phase manifest. Record final docs/map/DoD evidence; phase Ready is required before phase 2.

PASS criteria: V1–V3 and entry/reviews have current evidence; both exact handoff palettes render on the actual components; `theme-preserves-work`, `scoped-data-stays-scoped`, `server-offer-authority` hold. Counterexamples are a theme switch submitting a form, localStorage containing creator data, null balance rendered as zero or a shell gate disappearing. Browser fixture coverage cannot claim authenticated route verification.

Least confident: first-paint preference and responsive shell correctness across existing server-rendered routes; probe hydration and long labels, not just empty fixtures.

Out of scope: backend/domain changes, existing auth gates, workspace queries, pricing config, old product lines. Completion: applicable CLAUDE.md Definition of Done, same-phase checks and independent path verdicts, no Medium-or-higher residual, honest live-evidence limitations. Phase artifacts: ledger, gate transcripts, one report card.
