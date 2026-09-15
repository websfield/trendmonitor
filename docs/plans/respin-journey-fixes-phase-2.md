# respin-journey-fixes — Phase 2: first-session flow and page ergonomics

Status: DRAFT — revised after plan-review batches 0, 1 and 2 (all findings applied below). The specialist retry budget is exhausted with the last compliance verdict NEEDS CHANGES on the pre-batch-2-fix text; the batch-2 fixes are applied but unverified by a reviewer. Depends on: none.
Master plan: [`respin-journey-fixes-master-plan.md`](respin-journey-fixes-master-plan.md) · Audit rows: F-03, F-04, F-07, F-08, F-09, F-10, F-11, F-13, F-14.

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

Respin non-negotiables that govern this phase, verbatim:

3. **Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
5. **No leakage.** Nothing crosses profiles or workspaces; library contributions are mechanism-level only (REQ-A03/D04, R-9).
6. **No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point; engineering and evidence completion are separate claims (REQ-I03/I04, build-plan).
7. **A derived guard's population is a list, not a producer.** Any allowlist/guard computed by reading "everything that can reach this state" from a single call site … enumerates that population explicitly and is updated by listing every producer, never by grepping one.

Lessons that touch this phase, verbatim:

- 2026-07-30 — A comment claiming a property is not the property: **assert it in a test or delete the claim**, and when a review names an inversion your fix might cause, write that inversion as a test before calling the fix done.
- 2026-08-10 — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun** (a step header that says "done" must read the fact, never infer it).
- 2026-09-04 — **Verify the bytes your edit changed, and the harness that says they are fine**: an edit that rewrites line endings is invisible to `git` under `core.autocrlf=true` yet silently breaks every guard matching a multi-line source literal.

Stack and boundaries: Next.js 15 / TypeScript, pnpm, Drizzle behind `respinDb` (app never reads tables), Better Auth (`authClient` in `auth-form.tsx`), Signal design system (`respin/DESIGN.md`: panel classes, refusal banner, empty state, "Confirmation card … page-level 'N of M confirmed' sticky bar", copy rules: sentence case, refusals name the remedy, body max 66ch, pending labels never "Saving"). No new dependency; collapsing uses native `<details>`. Spin-compliance rules S3–S5 in `.claude/skills/respin-spin-compliance/SKILL.md` apply to T5–T7. Rendering facts that bind T6/T7 (verified 2026-09-15): `generation-outcome.tsx:91-92` computes the kill-test heading counts from the **unfiltered** `summary.traceability`; `run-copy.ts:558-566` prints "N other specifics were not found … or something in the disclosure guidance"; `run-copy.ts:587-589` is the `/disclosure/` branch of `traceabilityFlagNote`; `tests/studio-ui.test.tsx:701-748` pins per-finding notes by count (a fixed sentence once called the number `5` "a name"); `:741` asserts the disclosure note renders; `:581` asserts the heading clause; `:1747` is the `STATES` list the forbidden-claims canon scan iterates; `summary.claims` carries flag-level `/disclosure/guidance` concealment findings rendered under "What the draft says about itself" (`generation-outcome.tsx:164-208`); `packages/modes/src/claims.ts:22-30` scans `/disclosure/` **hard** for concealment advice.

Agents: owner `respin-engineer`; reviewers `respin-compliance-reviewer` (lean merged run, T5–T7), `respin-tenancy-reviewer` (separate, full — T3's new profile-scoped accessor), `plan-reviewer`. Do NOT request `frontend-engineer` for Respin (it owns the UGC manager UI), nor any agent absent from `.claude/agents/`.

## Requirements Checklist (functional)

- [ ] F-07 / REQ-A01: sign-up (email and Google) lands on `/onboarding`; sign-in keeps `/studio`.
- [ ] F-08 / REQ-B02: "Brain" appears in the product nav between Onboarding and Trends.
- [ ] F-09, F-10 / REQ-B01, B04: onboarding panels render in flow order under a step header whose states are read, not inferred; the profile-cap sentence appears once.
- [ ] F-11 / REQ-B02: each brain document's edit form and version history are collapsed by default; export, assets, performance meta and proposal history sit below the documents.
- [ ] F-04 / REQ-C01: Studio shows a notice when the brain is active but no voice document is; the precondition copy names which documents are in force.
- [ ] F-03 / REQ-I03, I05: no `[check]` **offer** is rendered in the traceability list for `/disclosure/` fields; the kill-test heading counts only what the list shows; one sentence states the disclosure guidance is written by the product from platform policy, is not traced to the creator's material, and **is still checked for advice to hide anything**; creator-material fields keep their offers; `summary.claims` is never filtered.
- [ ] F-13, F-14: Studio and first-ideas pre-form explanatory prose collapses into one "How this works and what it costs" block with `studio-mode-note`, `studio-cost`, `studio-no-results-basis`, `studio-no-stream` and `studio-status` **kept outside** it (only `studio-revision-cost` and the intro paragraphs fold); the Results page prints the view-only sentence once.

## Requirements Checklist (technical)

- [ ] No new table, no new scope path; any new read goes through `respinDb` + `withWorkspace`.
- [ ] `FLAG_ONLY_FIELD_PREFIXES`, `enforcementFor`, `offerCheck` and the stored `kill_test` unchanged; only `traceability` rendering changes.
- [ ] Every testid the journeys use (`run-result`, `run-refusal`, `<kind>-section`, `<kind>-empty`, `<kind>-active-meta`, `studio-result`, `studio-blocked`, `studio-no-profile`, `paste-disabled-tier`) survives the reorder and the collapsing.
- [ ] Invariants `check-markers-kept-for-creator-fields`, `disclosure-claims-never-filtered`, `honesty-blocks-never-folded`, `signup-lands-on-onboarding`, `step-state-derived-not-assumed` each have a test named below.

## Edge Cases & Failure Paths

| Question | Answer → task |
|---|---|
| Inverse: an existing user signs up again (duplicate) | Better Auth refuses as today; no redirect (T1). |
| Google sign-in for an existing account | `callbackURL` stays `/studio` for sign-in mode; `/onboarding` only in sign-up mode (T1). |
| An existing user presses Google on the **sign-up** page | Lands on `/onboarding` — accepted: the page shows their profile panel and links onward, and the mode of the page they chose is the only signal available before the auth round-trip (T1, recorded, no branch on account age). |
| Step header when the profile is missing | Header hidden; create-profile panel only (T3). |
| Step header when a brain read fails | State "unknown" rendered as neither done nor next, with the existing refusal copy (T3). |
| Brain page with a draft but nothing in force | `<details>` open by default for the draft section only (T4). |
| Studio with voice active but strategy missing | No notice (voice is what modes write in); precondition copy lists what is in force (T5). |
| The model wrote `[check]` inside `disclosure.guidance` itself | Rendered verbatim as today — the draft is never edited; T6 removes list **offers**, not text (T6). |
| Disclosure section absent | Unreachable: `disclosure` is a required section of every `ScriptDocument` (`packages/modes/src/output.ts:234-237`). The provenance sentence renders **always**, inside `KillTestBlock` under the traceability heading, in both the usable and the honest-refusal state — the honest-refusal state renders no `Document` (`generation-outcome.tsx:473-525`), so a sentence "under the disclosure block" would be absent exactly where disclosure findings are also omitted (T6). |
| Reduced motion / no JS | `<details>` is native; nothing depends on client JS (T4, T7). |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behaviour | Reconciliation | Spec |
|---|---|---|---|---|
| `respinDb` reads for the step header | any read throws | header omitted, page renders as today, refusal logged via `logRefusal` | next load | `onboarding-ui.test.tsx` "header omitted on read failure" |
| Auth client redirect | `router.push` unavailable | Better Auth's own redirect; page stays | none | `auth-form.test.tsx` |

## Handoff Contracts

- `respin/e2e/support/auth.ts` `signUp` waits for `**/onboarding`; `signIn` unchanged. Consumed by Phase 3.
- `data-testid="onboarding-steps"` with `data-step-state="done|next|todo|unknown"` per step. Consumed by Phase 3 T1.
- `data-testid="studio-no-voice"` notice; `data-testid="studio-check-offer"` on every rendered offer (exists today — verify before relying); `data-testid="studio-disclosure-provenance"` on the new sentence. Consumed by Phase 3 T2 and by this phase's tests.

## Reachability

A new creator can sign up and be looking at the ordered onboarding with a step header, reach Brain from the rail, and read a Studio draft whose traceability list offers `[check]` only for their own material — via `/sign-up`, the product rail, `/onboarding`, `/brain`, `/studio`, all shipped in this phase.

## Depends on

none.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| T1 | `auth-form.tsx`: sign-up mode pushes `/onboarding` and passes `callbackURL: "/onboarding"` to Google; sign-in mode unchanged. Update `e2e/support/auth.ts` `signUp` wait. Test: rendered form's mode → destination. | respin-engineer | `respin/app/(auth)/auth-form.tsx`, `respin/e2e/support/auth.ts`, `respin/tests/auth-form.test.tsx` |
| T2 | Add `{ href: "/brain", label: "Brain" }` after Onboarding in `nav.tsx`; test asserts the ordered list. | respin-engineer | `respin/app/(product)/nav.tsx`, `respin/tests/page-wiring.test.tsx` |
| T3 | Onboarding: page computes `steps` — posts (`listOnboardingInputs` count ≥ `content.onboarding.minOwnPostsForVoice`), voice (`readBrainHistory(scope,id,"voice")` has `active`), interview (`getInterviewDraft(...).submittedAt`), first ideas — `BrainAssetSummary` is `{brainVersions, testedRules, loggedResults, feedback}` (`packages/db/src/with-workspace.ts:1152-1157`), no generation count, so **add** `respinDb.hasGenerationForProfile(scope, profileId)` through `withWorkspace`, minting a `ProfileScope` and reading via accessors exactly as `brainAssetSummary` does (`:2780-2787`); this is a new profile-scoped query, so the **brain-tenancy full gate runs on this phase** (master plan Critical Paths). View renders `onboarding-steps` (DESIGN.md sticky-bar pattern) and reorders panels: profile → own posts → admired posts (optional, `<details>`) → candidate check (`<details>`) → build voice → interview link → first-ideas link → posts list; remove `PlanLine` from the posts panel. Tests: state derivation table incl. `unknown` on read failure; panel order; single plan line. | respin-engineer | `respin/app/(product)/onboarding/page.tsx`, `onboarding-view.tsx`, (`respin/packages/db/src/index.ts` + `with-workspace.ts` only if the accessor is needed), `respin/tests/onboarding-ui.test.tsx` |
| T4 | Brain page: wrap "Edit this document" and "<heading> version history" in `<details>` (closed unless the document has no in-force version); move Export, Brain assets, Performance Meta, Proposal history below the three documents; keep every testid. Test: closed-by-default, open-when-draft-only, section order. | respin-engineer | `respin/app/(product)/brain/brain-view.tsx`, `respin/tests/brain-ui.test.tsx` |
| T5 | Studio: page passes `activeKinds` (from the three histories it already reads at `page.tsx:132-138`); view renders `studio-no-voice` (refusal-banner style, names the remedy) when the brain is active without voice; precondition copy lists in-force kinds. **Add the new state to the `STATES` list at `tests/studio-ui.test.tsx:1747`** so the forbidden-claims scan covers its copy. Tests: three combinations. | respin-engineer | `respin/app/(product)/studio/page.tsx`, `studio-view.tsx`, `copy.ts`, `respin/tests/studio-ui.test.tsx` |
| T6 | Traceability rendering, scoped precisely: (i) filter **`summary.traceability` only, by field prefix `/disclosure/`** — never by `kind`, and never `summary.claims`; the filter lives in `KillTestBlock` (`generation-outcome.tsx`), which both the usable and honest-refusal states render (`:510`, `:543`), so the two agree by construction and `projection.ts:61` stays untouched; (ii) derive the kill-test heading counts (`generation-outcome.tsx:91-92`) from the same filtered list and drop the "or something in the disclosure guidance" clause from `run-copy.ts:558-566`; (iii) remove the `/disclosure/` branch of `traceabilityFlagNote` (`run-copy.ts:587-589`) or prove it unreachable from the renderer by test; (iv) the prefix literal cannot be imported here — `tests/client-bundle-boundary.test.ts:41` treats every `@respin/*` value import as server-only and these modules are reached from `"use client"` files — so `run-copy.ts` exports one `DISCLOSURE_FIELD_PREFIX` constant used by the `KillTestBlock` filter, and **`tests/claims-vocabulary-agreement.test.ts` itself** (it already imports `FLAG_ONLY_FIELD_PREFIXES` at `:44` and pins it to `["/disclosure/"]` at `:218-221`) gains the equality assertion — no new test file; the same file's `:201-222` block, which today asserts the `/disclosure/` branch of `traceabilityFlagNote` renders "the product wrote rather than you", is rewritten to the new contract (the branch is gone; the note for a `/disclosure/` field is never requested by the renderer); (v) add one sentence **inside `KillTestBlock`, under the traceability heading** (so it renders in both states, where the omission actually happens), in `run-copy.ts` (covered by the render scan): "The disclosure guidance is written by the product about the platform's policy, not from your material, so its names and terms are not traced to your brain. It is still checked for any advice to hide something." (`data-testid="studio-disclosure-provenance"`). Tests, updating the pinned assertions: `studio-ui.test.tsx:741` → the disclosure note is **absent**; `:566-594` (pure `traceabilityHeading(hard, flagged)`) → `expect(traceabilityHeading(0, 1)).not.toMatch(/disclosure/)`; a separate render-level assertion on the fixture below → the heading reads the filtered count; `:596-619` → the disclosure branch is gone/unreachable. **New fixture, same `kind` on both sides so no kind-keyed filter can pass** (reuse the shape at `:713-735`): creator-field number `5`, creator-field proper noun `Dorset`, disclosure-field proper noun `TikTok` → exactly **2** `studio-check-offer` elements; assert by token: `5 [check]` and `Dorset [check]` present, `TikTok [check]` absent inside `studio-traceability`; the same fixture on first-ideas. Negative test: a planted flag-level `/disclosure/guidance` **claim** (fixture exists at `:1184`) still renders under "What the draft says about itself". | respin-engineer | `respin/app/(product)/studio/generation-outcome.tsx`, `run-copy.ts`, `respin/tests/studio-ui.test.tsx`, `first-ideas-ui.test.tsx`, `respin/tests/disclosure-prefix-agreement.test.ts` (new) |
| T7 | Pre-form prose only. Studio: the paragraphs in `studio-panel.tsx:183-201` are, by testid, `studio-mode-note` (R20 "not built yet / outside this plan" labelling — the `studio-no-modes` copy at `:233-238` says "the note at the top of this panel lists every mode", so it **stays outside**), `studio-cost` (stays), `studio-revision-cost` (**folds**), `studio-no-results-basis` (`NO_RESULTS_BASIS`, R21, stays), `studio-no-stream` (`NO_STREAM_NOTE`, S3, stays); the live region `studio-status` stays. The one introductory paragraph above the panel — `studio-view.tsx:79-86` ("Every draft is written from the brain you confirmed…"), no testid today, rendered by `StudioView` outside `StudioPanel` — is moved into `StudioPanel` as the first child of the `<details>` "How this works and what it costs" with `data-testid="studio-intro"` (its three links kept), so one component owns the fold. Results: keep the sentence at `results/page.tsx:166` (the log panel); the proposals panel's `reason` at `:173` becomes one clause referring upward ("Brain-update proposals also require full access."); test: `tests/results-page-wiring.test.tsx`. First-ideas (`first-ideas-panel.tsx:65-91`, no mode note exists there): only `first-ideas-intro` folds; `first-ideas-cost`, `first-ideas-no-results-basis`, `first-ideas-no-stream`, `first-ideas-status` stay outside. Per-finding notes (`traceabilityFlagNote`) stay **per finding** — no dedupe of output prose. Results: print the Free view-only sentence once. **Test mechanism for AC8:** `StudioPanel` and `FirstIdeasPanel` take `useActionState` from the initial state under a static render (`studio-panel.tsx:404-410`, `tests/studio-ui.test.tsx:2787-2790`), so a view render never contains an outcome and an outcome render never contains the `<details>`; both panels therefore accept a test-only `initialState` prop forwarded as `useActionState`'s initial value (the pure-component pattern `lineage-view.tsx` documents), marked `@internal`, with a scan in `tests/page-wiring.test.tsx` asserting no `app/**` call site passes it; AC8's tests render the **whole panel** with the usable and honest-refusal states so the outcome testids and the `<details>` are asserted in the same tree. | respin-engineer | `respin/app/(product)/studio/studio-panel.tsx`, `studio-view.tsx`, `respin/app/(product)/onboarding/first-ideas/first-ideas-panel.tsx`, `first-ideas-result.tsx`, `respin/app/(product)/results/*.tsx`, `respin/tests/studio-ui.test.tsx`, `first-ideas-ui.test.tsx`, results test |

## Files to Create / Modify

| Path | New/Mod | Owner | Note |
|---|---|---|---|
| `respin/app/(auth)/auth-form.tsx` | mod | respin-engineer | T1 |
| `respin/e2e/support/auth.ts` | mod | respin-engineer | T1 |
| `respin/tests/auth-form.test.tsx` | mod | respin-engineer | T1 |
| `respin/app/(product)/nav.tsx` | mod | respin-engineer | T2 |
| `respin/tests/page-wiring.test.tsx` | mod | respin-engineer | T2 |
| `respin/app/(product)/onboarding/page.tsx` | mod | respin-engineer | T3 |
| `respin/app/(product)/onboarding/onboarding-view.tsx` | mod | respin-engineer | T3 |
| `respin/packages/db/src/index.ts`, `with-workspace.ts` | mod | respin-engineer | T3 accessor (required) |
| `respin/tests/onboarding-ui.test.tsx` | mod | respin-engineer | T3 |
| `respin/tests/results-page-wiring.test.tsx` | mod | respin-engineer | T7 |
| `respin/app/(product)/results/page.tsx` | mod | respin-engineer | T7 (replaces the `results/*.tsx` glob for the copy change) |
| `respin/app/(product)/brain/brain-view.tsx` | mod | respin-engineer | T4 |
| `respin/tests/brain-ui.test.tsx` | mod | respin-engineer | T4 |
| `respin/app/(product)/studio/page.tsx` | mod | respin-engineer | T5 |
| `respin/app/(product)/studio/studio-view.tsx` | mod | respin-engineer | T5 |
| `respin/app/(product)/studio/copy.ts` | mod | respin-engineer | T5 |
| `respin/app/(product)/studio/studio-panel.tsx` | mod | respin-engineer | T7 |
| `respin/tests/studio-ui.test.tsx` | mod | respin-engineer | T5, T6, T7 |
| `respin/app/(product)/studio/generation-outcome.tsx` | mod | respin-engineer | T6 |
| `respin/app/(product)/studio/run-copy.ts` | mod | respin-engineer | T6 |
| `respin/tests/first-ideas-ui.test.tsx` | mod | respin-engineer | T6, T7 |
| `respin/tests/claims-vocabulary-agreement.test.ts` | mod | respin-engineer | T6 (iii)/(iv) |
| `respin/app/(product)/onboarding/first-ideas/*.tsx` | mod | respin-engineer | T7 |
| `respin/app/(product)/results/*.tsx` | mod | respin-engineer | T7 |

## Migration Steps

None.

## Verification Steps

1. `pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build` — clean tree.
2. Start the dev server (state: Postgres up); sign up a fresh account in a browser — lands on `/onboarding` with the header showing step 1 next (requires 1).
3. Paste three posts, build the voice brain, activate on Brain (reached from the rail), submit the interview, run first ideas — the header shows 4 of 4 done (requires 2).
4. Open `/studio`, run Hooks — the traceability list has no offer for the disclosure field; the provenance sentence is present under "Where the specifics came from", in both a draft and an honest refusal; the weakest point and disclosure are visible without opening any `details` (requires 3).
5. Run `pnpm -C respin exec playwright test e2e/journeys/solo-creator.spec.ts` (requires 1; Free path is enough) — passes with the updated `signUp` wait.

## Acceptance Criteria (PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC1 | Sign-up mode → `/onboarding`, sign-in mode → `/studio`, Google callback matches mode | `auth-form.test.tsx` |
| AC2 | Nav order is Onboarding, Brain, Trends, Studio, Results, Usage, Billing, Account | `page-wiring.test.tsx` |
| AC3 | Step states: posts<min → step 1 next; voice active → step 2 done; read failure → `unknown`, never `done` | `onboarding-ui.test.tsx` |
| AC4 | Onboarding renders one plan line and panels in the specified order | `onboarding-ui.test.tsx` |
| AC5 | Brain: `details` closed by default per document; open when only a draft exists; documents precede export/assets/meta/proposals | `brain-ui.test.tsx` |
| AC6 | Studio: `studio-no-voice` rendered iff brain active and no voice active; the state is in the canon-scan `STATES` list | `studio-ui.test.tsx` |
| AC7 | Fixture (creator number `5`, creator proper noun `Dorset`, disclosure proper noun `TikTok`): exactly 2 `studio-check-offer` elements; `5 [check]` and `Dorset [check]` present; `TikTok [check]` absent inside `studio-traceability`; heading reads the filtered count (2); `traceabilityHeading(0, 1)` contains no "disclosure"; provenance sentence present once; a planted flag-level disclosure **claim** still renders under "What the draft says about itself" — on Studio and first-ideas; `DISCLOSURE_FIELD_PREFIX` equals `FLAG_ONLY_FIELD_PREFIXES`'s single entry | `studio-ui.test.tsx`, `first-ideas-ui.test.tsx`, `claims-vocabulary-agreement.test.ts` |
| AC8 | Rendered as the **whole panel with an injected state** (T7 mechanism), per surface and per state, each listed testid asserted **present** and then not a descendant of any `<details>`. Studio usable — `studio-disclosure`, `studio-weakest-point`, `studio-kill-test`, `studio-check-legend`, `studio-disclosure-provenance`, `studio-no-results-basis`, `studio-no-stream`, `studio-mode-note`, `studio-cost`, `studio-status`; Studio honest-refusal — `studio-kill-test`, `studio-disclosure-provenance`, `studio-no-results-basis`, `studio-no-stream`, `studio-mode-note`, `studio-cost`, `studio-status`; first-ideas usable — `studio-disclosure`, `studio-weakest-point`, `studio-kill-test`, `studio-check-legend`, `studio-disclosure-provenance`, `first-ideas-next`, `first-ideas-cost`, `first-ideas-no-results-basis`, `first-ideas-no-stream`, `first-ideas-status`; first-ideas honest-refusal — `studio-kill-test`, `studio-disclosure-provenance`, `first-ideas-cost`, `first-ideas-no-results-basis`, `first-ideas-no-stream`, `first-ideas-status`. Inside the `<details>`: exactly `studio-revision-cost` and `studio-intro` on Studio; exactly `first-ideas-intro` on first-ideas. Results view-only sentence appears once | tests + screenshot `docs/progress/respin-journey-fixes/phase-2-studio.png` |
| AC9 | Journey testids listed in the technical checklist all present after the change | `grep` transcript over `app/(product)` |

## Risk coverage within those criteria

`check-markers-kept-for-creator-fields` → AC7 (the disclosure finding shares its `kind` with a creator finding, so any kind-keyed filter either drops `Dorset [check]` or keeps `TikTok [check]`, and the token assertions fail either way). `disclosure-claims-never-filtered` → AC7's claim assertion. `honesty-blocks-never-folded` → AC8. `signup-lands-on-onboarding` → AC1 + verification 5. `step-state-derived-not-assumed` → AC3.

## Least confident

Whether `brainAssetSummary` exposes a per-profile generation count usable for "first ideas done"; if not, the new scoped accessor is a tenancy-adjacent read and the plan-reviewer should confirm it stays inside `withWorkspace` like its siblings.

## Out of Scope (Surgical Changes)

`packages/modes` (scan, thresholds, prefixes, `offerCheck`); `packages/brain`; activation logic; billing page (Phase 1); journeys beyond the `signUp` wait (Phase 3); any dedupe of per-finding output prose.

## Completion Criteria (Definition of Done)

Entry gate clean; `respin-compliance-reviewer` PASS on T5–T7; report card Ready; screenshots of onboarding header, Brain page, Studio notice and draft under `docs/progress/respin-journey-fixes/`.
