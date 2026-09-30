# Phase 3 — Creator Brain and complete setup

Depends on: 2, with current Ready proof on disk. Owner: main orchestrator; independently delegated files have exclusive ownership.

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

Functional: REQ-A02–A04, B01–B04, I01–I05. Technical: preserve the complete interview, per-field evidence, approval and bound actions; contain all editable/action state within its actual workspace/profile and immutable source document. Existing Frameworks presentation is owned by phase 4, not this Brain/setup phase.

| Task | Work | File rows |
|---|---|---|
| 1 | Extract Brain claims/edit/history; coloured qualified overview and anchors; preserve every evidence/approval/history state | 1–5, 12 |
| 2 | Style complete intake/interview/first-ideas; retain all existing questions, fields and actions | 6–8, 12 |
| 3 | Key full Brain, onboarding and interview page subtrees by their verified scope; key Brain editable descendants by source version | 1, 3, 9–11 |
| 4 | Verify scope transitions, source-version changes, theme/layout states and source scanner closure; update design documentation | 13–19 |

## Files to Create / Modify

Relative to `respin/`; main-owned unless delegated explicitly.

| # | Path | Kind |
|---|---|---|
| 1 | `app/(product)/brain/brain-view.tsx` | M |
| 2 | `app/(product)/brain/brain-claims.tsx` | N |
| 3 | `app/(product)/brain/brain-edit-forms.tsx` | N |
| 4 | `app/(product)/brain/brain-history.tsx` | N |
| 5 | `app/(product)/brain/brain-overview.tsx` | N |
| 6 | `app/(product)/onboarding/onboarding-view.tsx` | M |
| 7 | `app/(product)/onboarding/interview/interview-view.tsx` | M |
| 8 | `app/(product)/onboarding/first-ideas/first-ideas-panel.tsx` | M |
| 9 | `app/(product)/brain/page.tsx` | M |
| 10 | `app/(product)/onboarding/page.tsx` | M |
| 11 | `app/(product)/onboarding/interview/page.tsx` | M |
| 12 | `app/styles/product-surfaces.css` | N |
| 13 | `tests/brain-ui.test.tsx` | M |
| 14 | `tests/visual-surfaces.test.tsx` | N |
| 15 | `tests/selected-profile-pages.test.tsx` | M |
| 16 | `e2e/visual/fixtures.tsx` | M |
| 17 | `e2e/visual/entry.tsx` | M |
| 18 | `e2e/visual/visual.spec.ts` | M |
| 19 | `DESIGN.md` | M |

## Handoff and reachability

Consumes phase 1 tokens/Icon/Brand/static art and phase 2 result workspace/harness. Reuse existing scoped readers, props and actions; no new query, data model or backend operation. Brain overview derives content from actual scoped props, with active and proposed distinct. Voice/Strategy/Kill Test/performance/history stay separately inspectable; absent schema fields are labelled absent.

Retain confirmation/edit/activate forms, every name and bound action, field evidence, per-kind refusal isolation, complete export links and proposal approval. Extracted components share existing types. Expand fixed-file source guards to the complete extracted population; plant a violation outside the old filename.

The Brain, onboarding and interview server pages key their FULL returned scope-bearing subtree with `JSON.stringify([scope.workspaceId, profileIdOrNull])`, using the already-resolved selected profile that produced their data/actions. Onboarding's boundary includes sibling CandidateSafetyPanel/RunInferencePanel/profile-selection/intake controls, not only OnboardingView. Use a keyed Fragment where needed so all siblings share the identity without altering layout. No extra shell query; labels/action function identity are not keys. Profile-only/workspace-only changes discard unsaved native inputs, inference/candidate feedback and Brain refusal/edit state; delayed old actions cannot populate the new subtree. Missing-profile/error states cannot preserve the prior owner. Same-scope theme and local disclosure controls preserve work; no cross-route draft persistence is introduced.

Within Brain, key every editable or confirmation form subtree by the immutable source brainDocId and document kind at its current caller: BrainEditForm, strategy/metric inputs, claim pointers and plain native confirmation checkboxes. A replacement source version resets old uncontrolled inputs, checked confirmations and refusal spans even within the same profile. Test document A checked → document B unconfirmed, including equal claim pointers. Unchanged source IDs retain edits. History's existing brainDocId keys remain. No content or identity is persisted in localStorage.

Setup keeps every production interview question and real inference/confirmation/activation step; the prototype tour never replaces them. Product surfaces stylesheet is imported by the owned views and extends the established tokens. Phase 4 extends this same stylesheet and fixture suite.

A creator can review/edit/confirm a Brain and complete real setup from the live shell, with state belonging to the displayed profile/source version.

## Edge cases / failures

| Boundary / inverse | Behavior | Task / acceptance |
|---|---|---|
| Active absent, proposal present, evidence missing, approval blocked | Distinct truthful states and existing recovery links | 1 / B1 |
| Viewer/editor on /brain — the R-118 owner-only refusal | `brain/page.tsx` computes an owner-only refusal (REQ-A02, R-118); splitting `brain-view.tsx` into four files must not drop it. The witnesses are `tests/brain-ui.test.tsx` and `tests/selected-profile-pages.test.tsx` — both files are M in this phase, so the extraction keeps them green or the refusal is gone silently (a missing role gate is one of the module-logic mutations that survived in the 2026-08-26 lesson) | 1-3 / B1,B2 |
| Onboarding confirmation card, per field | The inferred value renders with its SOURCE EVIDENCE quote block and its own Confirm/Edit; evidence is never summarised away (REQ-B02, DESIGN.md "Named states this system owes") | 1 / B1 |
| Page-level "N of M confirmed" sticky bar | The counter renders the enumerated claim positions, not the content keys or the evidence list | 1 / B1 |
| Activation blocked until every position is confirmed | The blocked state names what is unconfirmed; enforcement is `packages/db/src/with-workspace.ts` `activateBrainDoc` AC-26 and the screen never implies activation is available (REQ-B02) | 1 / B1 |
| Proposal approve/reject is explicit, never silent | Both outcomes are creator-initiated and visible; no brain update renders as having happened without an approval (REQ-C05, R-8) | 1 / B1 |
| A→B same-name profile or workspace change; late old result | No prior private inputs, inference/candidate results, edit refusal or content beneath new identity | 3 / B2 |
| Same profile, new source brainDocId with same claim pointers | Every edited value/refusal resets to the new source; unchanged ID retains work | 3 / B2 |
| Cancel edit, inference failure, no selected profile | Existing saved/unsaved/recovery semantics; never claim activation | 1–3 / B1,B2 |
| Long content, keyboard/zoom/reduced motion | Evidence and controls remain reachable in both themes | 1–2 / B3 |

## Verification and acceptance

1. Read phase 2 Ready evidence, checkpoint current tree and inspect exact sources before edits.
2. B1/B2: `pnpm -C respin exec vitest run tests/brain-ui.test.tsx tests/onboarding-ui.test.tsx tests/onboarding-interview-ui.test.tsx tests/first-ideas-ui.test.tsx tests/selected-profile-pages.test.tsx tests/visual-surfaces.test.tsx`. Execute actual server pages with established module mocks and verify keys from the same IDs as displayed props/actions, including workspace-only/profile-only changes, same names, no-profile/error branches and all sibling state owners. Include current source-version form identity in renderer assertions. Retain phase-2 corrected copy; preserve valid invariants and scanner negative witnesses.
3. B2/B3: `pnpm -C respin exec playwright test --config playwright.visual.config.ts`. Real-component fixtures exercise Brain, intake, interview and first-ideas, plus inherited matrix. Same-name A→B tests cover all stateful/native form owners listed above; delayed actions and new source-doc IDs discard private prior state, while same-scope/version theme changes preserve it. Verify active/proposed/missing-evidence and applicable empty/blocked/error/long states in both themes at 390/768/1024/1440, keyboard/focus/contrast/no overflow, two screenshot critique iterations. Page wiring and component transitions are separately evidenced, never claimed as live authentication.

   Run all three browser projects. Require ≥90% Brain conformance per theme against the frozen D1–D10 checklist; the prototype's shortened setup never removes production questions. The phase-local V2-R7 screen-reader walkthrough (evidence, proposed/active distinctions, confirmation, validation/refusal announcements, retained answers) is optional and non-blocking (R-133). Include keyboard/zoom/long-content witnesses and the source-version checkbox reset. Preserve phase 1's baseline for phase 5's comparative tasks; real setup/approval integration remains a mandatory phase-5 obligation.
4. Run the canonical Respin typecheck/lint/test/build gate once stable, as phase 1 specifies. Record actual failures/skips and denied-env limits. Separate billing and tenancy reviews plus lean compliance/learning/general correctness, reservation first, frozen manifest and exact results. Do not invoke live generation to obtain visual evidence.
5. Update DESIGN and phase evidence/ledger, perform final diff/freshness check and all applicable DoD before Ready. Phase 4 completes remaining secondary surfaces; phase 5 completes whole-goal acceptance.

PASS: B1–B3 plus current entry/review/DoD; `brain-remains-explicit`, `scoped-data-stays-scoped`, `evidence-remains-qualified`, `checks-never-cleared-by-view`. Fixture/pilot/production evidence remain distinct.

Least confident: complete scope/source-version lifetime coverage across Brain's extracted forms and onboarding's siblings. Test real page keys AND client/native form state; an unchanged markup snapshot cannot prove resets.

Out of scope: question/schema changes, new queries, metric computation, proposals, billing mutations, analytics integrations. No partial state claimed Ready.
