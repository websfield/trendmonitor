# Phase 2 — focused Studio and filming workspace

Depends on: 1, with current Ready proof on disk. Owner: main orchestrator; money-bound presentation metadata, if delegated, uses an independent `gpt-5.6-sol`/high implementer with exclusive files.

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

Functional: REQ-C01–C06, G01/G04/G05, I02–I05. Technical: reuse the existing gated actions/state union; all server offers reachable; no second price/mode authority; all generated content/checks retained.

| Task | Work | File rows |
|---|---|---|
| 1 | Exhaustive presentation metadata alongside mode authority; extend server/structural projections without changing gate/order/labels/prices | 3–4, 14–16 |
| 2 | Three start groups, Free quick-tool emphasis, material subchoice, retained focused brief and explicit price/access context | 1–2, 6–7, 13, 22–25 |
| 3 | Extract document/check rendering; add content-derived accessible tabs and persistent warning summary; preserve all five outcome branches | 5, 8, 10–11, 13 |
| 4 | Beat-index filming strip, all matching shots/notes, separate full timed cue list, labelled vertical planning sketch and bounded Previous/Next | 9, 13 |
| 5 | Local current-usable-document Markdown export preserving every field/findings; actual revision/feedback/lineage remain operable | 1, 6, 12 |
| 6 | Focused regression, scanner population, interaction/long-content/theme tests and acceptance walkthrough | 16–21 |

## Files to Create / Modify

All relative to `respin/`, main-owned unless explicitly delegated before edits.

| # | Path | Kind |
|---|---|---|
| 1 | `app/(product)/studio/studio-panel.tsx` | M |
| 2 | `app/(product)/studio/studio-view.tsx` | M |
| 3 | `app/(product)/studio/page.tsx` | M |
| 4 | `app/(product)/studio/run-copy.ts` | M |
| 5 | `app/(product)/studio/generation-outcome.tsx` | M |
| 6 | `app/(product)/studio/studio-brief.tsx` | N |
| 7 | `app/(product)/studio/studio-start.tsx` | N |
| 8 | `app/(product)/studio/result-workspace.tsx` | N |
| 9 | `app/(product)/studio/filming-plan.tsx` | N |
| 10 | `app/(product)/studio/generation-document.tsx` | N |
| 11 | `app/(product)/studio/generation-checks.tsx` | N |
| 12 | `app/(product)/studio/generation-export.ts` | N |
| 13 | `app/(product)/studio/studio.css` | N |
| 14 | `packages/credits/src/mode-presentation.ts` | N |
| 15 | `packages/credits/src/mode-access.ts` | M |
| 16 | `packages/credits/tests/mode-access.test.ts` | M |
| 17 | `tests/studio-ui.test.tsx` | M |
| 18 | `tests/visual-workspace.test.tsx` | N |
| 19 | `e2e/visual/visual.spec.ts` | M |
| 20 | `e2e/visual/entry.tsx` | M |
| 21 | `e2e/visual/fixtures.tsx` | M |
| 22 | `public/illustrations/studio.svg` | N |
| 23 | `public/illustrations/mascot.svg` | N |
| 24 | `app/ui/illustration.tsx` | N |
| 25 | `scripts/extract-visual-assets.mjs` | N |

## Handoff contracts and reachability

Consumes phase 1 tokens/components/harness. Presentation metadata: `entryGroup` = idea/material/reference/quick, `inputKind` = idea/writing/footage-description/reference/short, and decorative `iconKey`; display fields only, exhaustive `Record<ModeId,...>`. Unknown/cast mode metadata fails explicitly; no fallback grants access. Existing `ModeOffer.status`, id, label, order and cost resolution unchanged. Structural client type mirrors only display fields; test fixtures gain explicit metadata where needed.

`StudioPanel` remains state/action owner, including controlled input/platform/revision choice. Its transitions are local presentation; only existing explicit submit controls run actions. Keep stable action identity; disable submission while pending. New result selection is keyed by generation identity, not theme. Retain review of original/revised lineage and feedback refusal independently from the accepted document. Request revision opens a native dialog with the real revision price, parent choice and note, submitting the existing parent-linked action. Escape/cancel restores trigger focus and does not submit. Pending state prevents duplicate submission; closing the dialog does not fabricate cancellation of an in-flight request.

`ResultWorkspace` receives only usable document/kill-test props and uses native tab semantics with unique per-instance IDs, Left/Right/Home/End roving focus and hidden panels. Script is default. Filming appears only for beats/shot data; Caption only for caption data; Checks remains available. Universal reasoning/weakest point/disclosure stay together and readable. Keep actual charge and dropped-framework notice outside conditional tab content.

Scenes enumerate beats in stored order. Match every shot by beatIndex; no shot is discarded if multiple match. A missing beat link renders its shot in an explicit unassigned list rather than hiding it. No inferred duration/end time, cast time sorting, fabricated image or text assignment. Keep all on-screen cues in source order with timestamps. Say/Show/Text labels are accurate; Text states that no scene link is stored and points to the cue list.

`extract-visual-assets.mjs` reads only the supplied prototype's embedded asset JSON. Produce static SVG sprite symbols with collision-free IDs for the small used light/dark entry illustrations, plus mascot. Refuse active/script/external references. No prototype adapter/eval or runtime code is copied. Illustration is decorative unless captioned as an example planning sketch; never a generated frame.

A creator can choose a real available task, submit a real brief, inspect the resulting script/checks/filming plan, revise it through the existing action, and locally export the current accepted result through `/studio`. No entity migration or new data read/write.

## Edge cases / failures

| Case | Behavior | Task / acceptance |
|---|---|---|
| Missing/unknown cost, no modes, viewer/paused/no Brain | Retain existing truthful refusal/recovery, never fixture values | 1–2 / S1 |
| Restricted entry group | Explain restriction; foreground available tools; no forbidden submit | 2 / S1 |
| Back/new-draft/theme/platform change | Keep typed work until an explicit new-draft choice; theme never clears state | 2 / S2 |
| Pending/failed/refused generation or feedback | Preserve separate states and existing charge/no-stream semantics; no old parent presented as a successful revision | 3,5 / S2,S4 |
| Caption/hooks/ideas-only result | No empty irrelevant tab; every present field and all idea tuple fields remain reachable | 3 / S3 |
| Duplicate/unsorted beat times, multiple/missing shots, cues outside beat times | No invented joins/durations/sorting; preserve all text in explicit views/export | 4 / S3 |
| Export browser API failure | Keep document/findings intact, show failure; revoke object URL in finally/cleanup | 5 / S4 |
| Storage unavailable and long generated strings | Theme works in-session; wrap within panels; strip scrolls locally | 2–4 / S2,S3 |

## Verification and acceptance

1. Require phase 1 Ready evidence and a successful checkpoint before edits. Read current sources/dirty baseline; preserve unrelated improvements. No generation/network required to build.
2. S1: `pnpm -C respin exec vitest run packages/credits/tests/mode-access.test.ts tests/page-wiring.test.tsx tests/studio-ui.test.tsx`. After tasks 1–6, assert all seven registry offers retain gate/price agreement, runtime cast rejection, changed server prices/revision prices, Free/paused/viewer/missing Brain. Keep literal-mode-ID and boundary guards. When extracting renderers, update the single-renderer scanner to cover the complete production source population and plant a duplicate outside the old filename; never delete its assertion.
3. S3/S4: `pnpm -C respin exec vitest run tests/visual-workspace.test.tsx tests/client-bundle-boundary.test.ts tests/import-boundary.test.ts`. After step 2, test pure scene association/export with reordered/duplicate/missing relationships, all output fields, multiple instances, unknown details, checks, honest refusal/replay. Exercise exact text preservation and cleanup/error paths.
4. S2/S3/S4: `pnpm -C respin exec playwright test --config playwright.visual.config.ts`. After steps 2–3, use real mounted Studio components with labelled deterministic action fixtures. Exercise start→brief→result, all tabs, scene bounds, revision parent mode/price, refusal/feedback, local download, focus and theme toggling mid-input/mid-result; action-call count must stay unchanged for presentation controls. Both themes × handoff widths; long and empty/restricted/error cases; compare screenshots in two iterations. This does not establish a live provider/debit run.
5. Run the canonical Respin entry gate (typecheck, lint, test, build) as phase 1 specifies, preserving actual failures/skips; affected tests again after fixes. Same separate billing/tenancy and consolidated compliance/learning/general correctness code reviews before Ready. Update progress/map documentation, inspect final diff and inherited user changes.

Invariants: `server-offer-authority`, `theme-preserves-work`, `scene-links-are-real`, `all-output-reachable`, `checks-never-cleared-by-view`, `scoped-data-stays-scoped`. Negative examples and required failures are the codebase-review table plus S1–S4 above. No view action resolves a finding; no local preference stores creator content.

Least confident: extracting the existing document without losing an honesty statement or weakening a source-population guard, especially because `GenerationOutcome` also renders within Trends. Include both callers in acceptance.

Out of scope: changing model schemas, output parser, similarity/kill-test algorithm, money mutation, new search/history backend, new media capability. Completion: current applicable DoD and path PASS verdicts, original semantics tested, all tasks/acceptance covered; no partial state claimed Ready.
