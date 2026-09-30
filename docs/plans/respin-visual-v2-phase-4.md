# Phase 4 — References, Results and marketing

Depends on: 3, with current Ready proof on disk. Owner: main orchestrator; independently delegated files have exclusive ownership.

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

Functional: REQ-A02–A04, D01–D05 (existing Frameworks presentation/isolation), E01–E07, F01–F04, G01/G04/G05/G07/G08, H01–H03, I01–I05. Technical: reuse established design and current data/actions; qualify evidence, contain profile-specific state, and supply verified UI surfaces to phase 5's mandatory assembled-app and comparative-experience proof.

| Task | Work | File rows |
|---|---|---|
| 1 | Source/breakdown/adapt hierarchy; complete the Studio reference-link journey and missing pre-submit Spin quote using existing price and scoped action authorities | 1–3, 5, 7, 21–23 |
| 2 | Results/Frameworks/quiet financial treatment; complete Trends/Results/Frameworks scope boundaries | 4–7, 18–19 |
| 3 | Landing wordmark/theme/art; retain order/prices while correcting main/shared/audience hero, metadata and demo claims | 8–10, 24 |
| 4 | Complete fixture visual/three-engine coverage, phase-local AT, D1–D10 scorecards and UI source map/docs; hand F4–F6 to phase 5 | 11–17, 20 |

## Files to Create / Modify

Relative to `respin/` except map; main-owned unless delegated explicitly.

| # | Path | Kind |
|---|---|---|
| 1 | `app/(product)/trends/trends-view.tsx` | M |
| 2 | `app/(product)/trends/paste-panel.tsx` | M |
| 3 | `app/(product)/trends/pasted-references.tsx` | M |
| 4 | `app/(product)/results/results-view.tsx` | M |
| 5 | `app/(product)/trends/page.tsx` | M |
| 6 | `app/(product)/results/page.tsx` | M |
| 7 | `app/styles/product-surfaces.css` | M |
| 8 | `app/(marketing)/page.tsx` | M |
| 9 | `app/(marketing)/landing-sections.tsx` | M |
| 10 | `app/styles/landing-sections.css` | M |
| 11 | `tests/visual-surfaces.test.tsx` | M |
| 12 | `tests/selected-profile-pages.test.tsx` | M |
| 13 | `e2e/visual/fixtures.tsx` | M |
| 14 | `e2e/visual/entry.tsx` | M |
| 15 | `e2e/visual/visual.spec.ts` | M |
| 16 | `DESIGN.md` | M |
| 17 | `../.codebase-map/SUMMARY.md` | M |
| 18 | `app/(product)/studio/frameworks/page.tsx` | M |
| 19 | `app/(product)/studio/frameworks/frameworks-view.tsx` | M |
| 20 | `tests/framework-ui.test.tsx` | M |
| 21 | `app/(product)/trends/spin-panel.tsx` | M |
| 22 | `tests/trends-page.test.tsx` | M |
| 23 | `tests/trends-ui.test.tsx` | M |
| 24 | `app/(marketing)/audiences.ts` | M |

## Handoff and reachability

Consumes prior tokens/components/art, stylesheet, harness, frozen D1–D10 references and current-UI comparison baseline. Existing actions/readers remain authorities; extend presentation props for the missing Spin quote using existing facades, without a new raw query/table/backend operation. References retain public URL/pasted transcript forms, original/adapted output and source/autopsy/stale/saturation/baseline qualifications. Studio's reference link lands here; a completed selected analysis supplies its opaque autopsy ID to the existing profile-bound `spinAction`. No analysis is fabricated for missing/pending/stale/foreign IDs, and no caller transcript substitutes for the similarity reference. No fabricated feed, thumbnail frame or causal performance claim.

B-V2-02 / Task 1: keep analysis pricing from `respinCredits.pastedReferenceQuote`. In the Trends server page, obtain active config through the existing `@respin/config/app-server` read-only facade and derive the Spin price with the existing credits `priceOf`/`generationOp` authorities. Select the reference execution offer from phase 2's exhaustive metadata using the already resolved quote tier; do not add a second mode/price/tier switch. Project only the resulting numeric cost or explicit unavailable state through both feed `itemFor` and pasted `pastedStateFor` action variants, their shared SpinView and SpinPanel. Display it immediately beside the Spin submit control, separately from analysis. Preserve genuine zero; config/offer/read failure never becomes zero, an analysis price or a hardcoded fallback, and disables submission with an unavailable reason. This displayed quote grants no entitlement: the existing action still resolves current access/config/balance and settles the actual charge, which remains separately labelled after completion. Preserve current parked-autopsy settlement and refund semantics; quote projection adds no debit, grant or mutation. Task 1 owns the page and control tests in rows 22–23; Task 4 owns the fixture-browser witnesses; phase 5 Task 2 owns the actual-app witnesses.

Trends, Results and Frameworks pages key the complete returned scope-bearing subtree with `JSON.stringify([scope.workspaceId, profile.id])`, using the exact verified identity that produced props/actions. Every Trends ready/empty/unavailable branch includes its tracker sibling and PastePanel/SpinPanel descendants under that same keyed Fragment. Results includes LogPanel, verification and proposal controls. Frameworks includes all four FrameworkPanel action states and native inputs. Error/no-profile branches remove old owners. This resets prior native inputs and action/refusal/output state on workspace/profile change, including late responses, while same-scope theme changes retain work. No new shell query or display-name key.

Import the phase-3 product stylesheet into FrameworksView to apply quiet surfaces. Preserve shared/private separation, evidence and version/status labels, create/edit/approve/retire actions, role/plan/pause restrictions, export links and Studio return navigation. Add it to actual page-key tests and every browser population; the route must remain reachable from the Studio framework link on desktop and mobile. This addresses V2-R4 at plan level without changing framework data, entitlement or curation rules.

Results preserves self-reported labels, unavailable reasons, separate reach/conversion, paid/organic, confounders and approval. Billing/Usage/Account keep existing authorities and inherit quiet shared surfaces. No synthetic totals/counters or lifecycle change.

V2-R5 / V2-MKT-01: retain landing section order and authoritative prices, but correct unsupported inherited copy. DemoPanel visibly says “Illustrative example — not generated output or your data”; fixture text cannot be described as the visitor's actual Brain/output. MAIN_DEMO's purported personal clip becomes a `[check]` placeholder for the creator's own footage. Remove “proven by posted results”, the unconditional “It learns you”, unsupported setup-duration promises and the claim that all seven modes have one output shape. State that manual results remain self-reported and cannot qualify numerical learning; Brain updates require explicit approval. Apply the same rules to every shared audience demo. The actual Sample Spin preview remains distinct from the illustrative fallback; do not label a real response as a fixture or measured performance. Rollout, pricing and service authorities stay unchanged. Use approved art without a new external source.

**Partially pre-applied in Phase 1 (R-130) — read this before re-doing it.** The owner's 2026-09-20 ruling already rewrote the unsupported CLAIM copy and enrolled every marketing route in the claims canon: "learns your voice" is now "builds your voice rules", "It learns you" is "Approve every change", "proven by posted results" is "reviewed mechanisms", "never promises virality" is "never promises a video will take off", and `tests/marketing-claims.test.tsx` renders every route under `FORBIDDEN_CLAIMS` + `PERFORMANCE_CLAIMS` + `MARKETING_CLAIMS`, with its population read from the directory. **What that leaves this task is the QUALIFICATION half, which no pattern can catch:** the visible "Illustrative example" label, `MAIN_DEMO`'s purported personal clip becoming a `[check]` placeholder, the setup-duration and one-output-shape claims, and keeping the real Sample Spin branch distinct from the illustrative fallback. F1/F3's witnesses are unchanged, and any new copy they introduce has to pass the canon scan that now exists.

The correction population also includes every entry of `AUDIENCES` in `app/(marketing)/audiences.ts`: hero heading/subcopy, metadata title/description and demo fields, as well as main landing and shared sections. The audience route renders these hero fields directly and exports them through `generateMetadata`; shared-section edits alone cannot correct them. Remove the coaches claims that every unverifiable claim or anything the product cannot verify is marked. Describe bounded source-matching/check assistance, with the creator responsible for verification; do not promise universal detection or truth verification. Apply the same performance, personal-specific and explicit-approval rules to all audience entries, including their shared critique copy. Keep `for/[audience]/page.tsx` as the real test subject; its existing projection need not change. F1 enumerates the actual `AUDIENCES` population and tests every rendered route and metadata result, not a duplicate hand-picked sample.

A visitor can use themed landing/auth routes; a creator can reach references, Frameworks, Results and financial/account screens from the live shell and complete the actual-app journeys in phase 5.

## Handoff to phase 5

Phase 5 owns the five test-infrastructure files, the unchanged V2-R2 harness contract, F4 actual-app journeys, F5 assembled-app AT walkthrough and F6 comparative creator checks. These remain mandatory whole-goal obligations. This phase supplies current F1–F3 evidence, the complete real-component matrix, D1–D10 scorecards, phase-local AT observations and verified UI documentation. Missing phase-5 evidence never becomes whole-redesign Ready.

## Edge cases / failures

| Boundary / inverse | Behavior | Task / acceptance |
|---|---|---|
| Stale/restricted/unavailable reference, failed/withheld Spin | Preserve reason/cost/source; never reveal rejected draft | 1 / F1 |
| Analysis and Spin prices differ, are zero, or cannot be read | Distinct server-derived quotes before their own submissions; unavailable never fabricated as zero; existing settlement stays authoritative | 1 / F1,F3,F4 |
| A→B same-name profile or workspace change; delayed old action | Tracker, paste/spin and result/proposal native/action state contain no prior profile content | 2 / F2 |
| Frameworks empty/restricted/private proposal/refusal or scope switch | All existing library labels, curation restrictions and input/action-state isolation survive styling | 2 / F1,F2,F3 |
| Unqualified fixture or unavailable Sample Spin flag | Explicit illustrative fallback and `[check]` markers; no fabricated personal/evidence claim | 3 / F1,F3 |
| References: empty feed, saturation, stale | The empty feed states its reason; saturated and stale labels stay visible and the retained item is never hidden; trend badges keep EMERGING / ESTABLISHED / SATURATED as actual labels (REQ-E, DESIGN.md "Named states this system owes") | 1 / F1,F3 |
| Audience hero/metadata implies universal verification | Bounded claims in every audience record and actual route/metadata projection; planted old claims fail | 3 / F1,F3 |
| Missing browser or phase-local AT | Record missing evidence; no skipped engine or DOM-only AT pass | 4 / F3 |
| Missing DB/preload/participants or assembled-app AT | Phase 5 retains F4–F6; whole-goal acceptance remains pending | Phase 5 / F4–F6 |
| Missing comparison/manual numbers | No fake zero, verification or collapsed metric | 2 / F1 |
| Billing unavailable, paused, long ledger | Null/error distinction, readonly gates and local table scrolling | 2 / F1,F3 |
| Zero-credit block | The block state renders as its own surface; a real zero is never the unavailable state and never a percentage bar without a denominator (REQ-G03; the ledger-is-the-balance rule is R-6) | 2 / F1,F3 |
| Paused read-only | Every write control is absent or explicitly disabled with its reason; no action is merely hidden by CSS (REQ-G08, R-12 — not R-7, which is tiers and prices) | 2 / F1,F3 |
| Pause-first cancel interstitial | Cancelling offers pause BEFORE it offers cancellation, and the brain-as-asset framing is present on that path (REQ-G08, R-12) | 2 / F1,F3 |
| Auto-top-up with its monthly spend-cap field | The cap field renders with the stored value; no pack, price or cap is presentation-owned (REQ-G03) | 2 / F1,F3 |
| Ledger table: append-only note and "showing N of M" clamp | The table states it is append-only and names its clamp when truncated; a clamped view is never presented as the whole ledger (REQ-G04, R-6) | 2 / F1,F3 |
| Payment failed: grace, then downgrade | The grace panel states the deadline and what happens after it; the downgrade is never presented as a choice the creator made (REQ-G06). Rendered today as its own `data-testid="grace"` panel in `billing-view.tsx` | 2 / F1,F3 |
| Unpaid first invoice (`incomplete`) | The subscription-incomplete state is its own surface with its own recovery, never shown as active or as a refusal of the product (REQ-G06) | 2 / F1,F3 |
| Usage runway: `runway-paused` and `runway-no-spend` | The runway says there is no spending rate to estimate from rather than estimating one; a paused workspace says so (REQ-G07) | 2 / F1,F3 |
| Results: reach and conversion, unverified, degraded, exploratory n<3 | Reach and conversion render as separate bars with the creator's own baseline tick and are NEVER merged into one score; unverified, "unavailable + why" and exploratory n<3 are three distinct states and none is a result (REQ-F, R-10) | 2 / F1 |
| Long content/narrow/keyboard/zoom/reduced motion | All evidence/controls reachable in both themes | 1–3 / F3 |

## Verification and acceptance

1. Read phase 3 Ready evidence before source edits; the goal-wide checkpoint waiver remains in force. Preserve unrelated work.
2. F1/F2: `pnpm -C respin exec vitest run tests/trends-page.test.tsx tests/trends-ui.test.tsx tests/trends-niche-ui.test.tsx tests/selected-profile-pages.test.tsx tests/results-page-wiring.test.tsx tests/results-entry.test.tsx tests/results-honesty.test.tsx tests/results-comparison.test.tsx tests/results-comparison-contract.test.ts tests/results-verification-unavailable.test.tsx tests/billing-ui.test.tsx tests/usage-honesty.test.tsx tests/usage-burn-by-mode.test.ts tests/pause-authority.test.tsx tests/brain-usage-9b-ui.test.tsx tests/landing-pricing.test.ts tests/auth-form.test.tsx tests/framework-ui.test.tsx tests/framework-content-honesty.test.ts tests/visual-surfaces.test.tsx`. Actual page calls with mocked scoped readers establish complete identity-keyed subtrees in every branch, including Frameworks and tracker/result controls. Preserve corrected copy and all valid invariant guards. Render actual LandingPage/shared sections and every audience demo with Sample Spin disabled, flag-error/unknown fallback and real-preview branches. Require fixture qualification/check markers, manual-evidence/approval qualifications and absence of unsupported personal/performance/automatic-learning claims. Plant old wording and missing-label/marker cases; each must fail. Keep pricing-authority assertions and do not mislabel the real-preview branch.
3. F2/F3: `pnpm -C respin exec playwright test --config playwright.visual.config.ts`. Complete the master's entire population, explicitly including Frameworks and every audience route, across Chromium/Firefox/WebKit, both themes and 390/768/1024/1440. Preserve all applicable populated/empty/blocked/refused/error/long-content states and justified N/A rows. Explicitly test Trends, Results and Frameworks workspace-only/profile-only changes with same names, native input, private output/refusal and delayed actions. Same-scope theme changes preserve work. Verify library curation controls and navigation, visible marketing qualifications, 320px reflow/text enlargement and breakpoint checks inherited from phase 1. Complete D1–D10 scorecards and ≥90% per core surface/theme, at least two critique passes and every required correction. No paid/provider journey is used for visual evidence.
4. Phase-local manual screen-reader verification for References, Results, Frameworks and marketing/auth interactions is optional and non-blocking (R-133). If performed, record operator, versions, focus/labels/announcements and repairs.
5. Run canonical Respin typecheck/lint/test/build once stable, recording actual failures/skips/env limits, then separate billing/tenancy and lean compliance/learning/general correctness code gates on the frozen manifest and actual results. Finish verified UI DESIGN/map updates, final diff/freshness check, phase report and ledger. Phase 5 owns final integration and whole-goal closure.

Additional mandatory B-V2-02 witnesses: F1 changes analysis and Spin config prices independently, then checks the actual Trends page projections and Spin forms for both feed and pasted-reference ready states. Each quote changes only with its own authority; test true zero, unavailable config/offer, disabled submission, restricted access and no extra financial writes. A planted missing/swapped/hardcoded quote must fail. F3 checks each form's visible price and unavailable reason in both themes and narrow layouts before submission. Phase 5 F4 compares the visible pre-submit Spin quote to the seeded config separately from analysis, then checks the existing action's actual settled debit; post-action charge assertions alone cannot satisfy the quote check. Preserve legitimate parked-autopsy refunds when asserting that quote projection adds no mutations.

Additional mandatory V2-MKT-01 witnesses: F1 renders actual `AudienceLandingPage` and calls its `generateMetadata` for every slug in `AUDIENCES`, exercising hero/subcopy/metadata as well as the existing main/shared/demo Sample Spin branches. Retain exact route-population coverage checks; a new audience must enter the test population. Plant the old coaches universal-verification claims separately in hero and metadata, unsupported critique/performance wording, and missing fixture qualification/check markers; each must fail while bounded source-matching copy passes. F3 confirms visible qualifications on every audience route; metadata honesty is verified by the actual metadata function in F1. No source-text scan or demo-only render substitutes for these callers.

PASS for this phase: F1–F3, phase-local AT and current entry/reviews/DoD; F4–F6 and whole-goal V2-R1–V2-R7 closure remain with phase 5; the complete eight-invariant contract remains binding. No skipped browser, mocked-action substitute, missing human evidence or visual average can satisfy a failed gate. Actual-app integration with synthetic external responses, real-service evidence and observed creator usability remain separate claims.

Least confident: complete Trends sibling/Frameworks state ownership and both feed/pasted Spin-price projections; probe late responses and independently changing prices.

Out of scope: new production source adapters, metric/proposal algorithms, ledger/subscription behaviour, analytics connectors, production test-mode switches and deployment. Disposable synthetic database setup and real test-ledger assertions belong only to the phase-5 test harness. No partial/fixture-derived production readiness claimed.
