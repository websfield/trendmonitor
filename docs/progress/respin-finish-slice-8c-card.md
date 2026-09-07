# Slice 8c — Paste-transcript intake + the spin prompt — report card

**Closed 2026-09-04 at ALMOST, not Ready.** Engineering completion and evidence completion are separate claims (build-plan, non-negotiable 6), and this card keeps them separate. Two full gate rounds ran at **FULL** intensity; the round-2 BLOCK was closed by a **structural** fix pass that, under the two-round cap, **no reviewer has seen**. The creator-facing line is now **walkable and was walked**, further than any slice-8 line had ever been — but not to its end.

Plan: [`respin-finish-phase-8c.md`](../plans/respin-finish-phase-8c.md) · Ledger: [`respin-finish/ledger.md`](respin-finish/ledger.md) · Decisions: `decisions.md` **R-96, R-97 (+ amendment), R-98, R-99**
Manifests: [round 1](respin-finish/8c-review-manifest.md) · [round 2](respin-finish/8c-review-manifest-round2.md)
Entry gates: [initial](respin-finish/entry-gate-slice-8c.txt) · [after fix 1](respin-finish/entry-gate-slice-8c-fixpass.txt) · [final](respin-finish/entry-gate-slice-8c-final.txt)
Gate reports: compliance [r1](respin-finish/8c-gate-compliance-round1.md) [r2](respin-finish/8c-gate-compliance-round2.md) · tenancy [r1](respin-finish/8c-gate-tenancy-round1.md) [r2](respin-finish/8c-gate-tenancy-round2.md) · billing [r1](respin-finish/8c-gate-billing-round1.md) [r2](respin-finish/8c-gate-billing-round2.md) · learning [r1](respin-finish/8c-gate-learning-round1.md) [r2](respin-finish/8c-gate-learning-round2.md) · code review [r1](respin-finish/8c-gate-code-review-round1.md)

---

## Report card

**Overall: Not yet → Almost.** Slice 8's central failing was that nothing could reach the feed. That is closed: a creator pastes a third-party link and transcript, pays once in their own credits, the background worker autopsies it against the real vendor, and the result renders with its absence named rather than invented. What keeps the slice at ALMOST is the spin half of the acceptance line, which the walk did not reach, and a final fix pass no reviewer has read.

| Gate | Round 1 | Round 2 | One line |
|---|---|---|---|
| Entry checks | **Ready** — 147 files / 3505 tests, 0 skipped, build 0 | **Ready** — typecheck 0 (7 packages), `worker:typecheck` 0, lint 0, `db:check` clean, migrations 0026 + 0027 + 0028 applied on real Postgres, **147 files / 3819 tests / 0 failed / 0 skipped, exit 0**, `next build` 0 | Run on each tree, never read from the ledger. 3290 (slice 8) → 3505 → 3780 → **3819**; **+529 tests, zero new failures** |
| Respin spin compliance | **Not yet · D** — 1 BLOCK · 4 CHANGE · 2 NOTE | **Not yet · D** — 1 BLOCK · 3 CHANGE · 2 NOTE | Round 1's BLOCK was closed for every enumerated case; round 2 fuzzed it and re-opened the **class** one regex group over. Closed structurally in the final pass — see below |
| Respin brain tenancy (Full) | **Almost · B** — 0 BLOCK · 2 CHANGE · 4 NOTE | **Almost · B** — 0 BLOCK · 2 CHANGE · 7 NOTE | Both round-1 CHANGEs closed, each proved by a mutation the reviewer planted itself. It attacked the cross-workspace axis the in-repo tests do not cover, and populated a table to run migration 0028 rather than reading its header |
| Respin billing & credits (Full) | **Almost · C+** — 0 BLOCK · 6 CHANGE · 3 NOTE | **Almost · B+** — 0 BLOCK · 2 CHANGE · 2 NOTE | *"Every money statement I could make false in round 1 is now true when I run it."* All six closed on real Postgres; what remained was two comments promising more than the code did |
| Respin learning honesty | **Not yet · D** — 1 BLOCK · 6 CHANGE · 4 NOTE | **Not yet · D** — 1 BLOCK · 1 CHANGE · 4 NOTE | Six of seven closed, five by re-running the round-1 probes and getting the opposite result. Its new BLOCK was the compliance CHANGE's sibling — one root cause, two lanes |
| Code review (consolidating) | **Not yet · D** — 1 BLOCK · 15 CHANGE · 11 NOTE | not run (round cap) | Arbitrated both severity splits, re-derived the convergences itself, verified the lockfile with a real `--frozen-lockfile` install, and checked React 19's form-reset behaviour against the **installed** react-dom rather than from memory |
| Acceptance criteria | — | **paste → queued → debited → autopsied → ready → read: PASS. Spin and forced near-copy: NOT WALKED** | See *The walk* below |
| Least-confident probe | — | **held, and was walked for real** | The card's own line was refund-on-park, "the ledger's first compensating credit". A genuine vendor failure parked a claim at 5 attempts and the refund appeared, once, idempotent across reloads |
| Definition of Done | not met | **not met — evidence, and an unreviewed fix pass** | Entry gate ✅ · every gate PASS ❌ · docs consistent ✅ · reachability ✅ (this slice IS the reachability) |
| Reviewer spend | 5 agents | **9 reviewer agents over 2 rounds** + **7 builder agents** over 2 fix passes · ≈ 2.1 M reviewer tokens | Announced before each gate |
| Fixed without re-review | — | **the entire round-2 fix pass** | The two-round cap was spent; the owner chose to fix structurally and ship unreviewed rather than open a third round |
| Gate intensity | full (escalated from the configured `lean`) | full | Both money paths are `Full gates? yes`; compliance and learning ran separately on slices 6–8's precedent |

---

## What the gates found, in plain words

**The headline is one defect that took two rounds and three attempts to actually kill.**

Round 1 blocked on `packages/modes/src/traceability.ts`'s `month-date` rule. Its day group was greedy, so `"March 2024"` tokenised as `"March 20"` — the year eaten as a day-of-month. It failed in **both** directions, and the reviewer measured both end to end through the real `runGeneration`:

- **fail-open** — a creator's brain containing the word "June" and any bare `20` let the model invent `"June 2019"` and clear traceability with **zero findings**, rendered under the screen's own sentence that *every number, date and name in this draft was checked*;
- **false refusal** — `"March 2024"` that the creator typed themselves was refused after **two paid vendor calls**, with an excerpt quoting `'March 20'`, a token absent from their draft — and the rewrite instruction's own remedy could not clear it.

The fix was a digit boundary, `(?!\d)`. It closed every case anyone had written down. **Round 2 fuzzed it** — 768 generated self-vouch sentences and 100 suppression pairs — and found the class alive one regex group over: an adjacent month word still cancelled the hard check on an invented **`3x`** reach claim, and `"By June 250000 views"` that the creator typed was still refused.

That is the pattern this project's own ledger already flagged once, for a different rule family: *a heuristic being tuned by review, one instance per round.* The owner's call was to stop tuning and fix it structurally.

**The structural fix.** The root cause was that the two sides used **different tokenisers**: `buildCorpusIndex` read the creator's material with one set of patterns and `scanTraceability` read the output with another, so their extents could disagree. No pattern changed. Instead one function now decides every extent and **both sides call it**, a claimed span narrows a later shape rather than cancelling it, and a date is never decomposed (made safe by indexing composites, so `march 2024` is one key). The witness is **generative**, which is the part that matters:

| property | before | after |
|---|---|---|
| self-vouch — `scanTraceability(T, corpus=[T])` has no hard finding | **423 / 20,000** violations | **0 / 20,000** |
| suppression — a month before a unit-bearing number | **1,254 / 10,000** (all hard) | **0 / 10,000** |
| suppression — any extra adjacent token, any boundary | **344 / 10,000** (34 hard) | **0 / 10,000** |

An 8-mutation matrix backs it, the harness proven non-vacuous. It also found a suppression case **neither reviewer found** (`"In March Anna arrived."` silently dropped `Anna`) and a real REQ-J02 gap: the rule went from clearing an invented `3x` to refusing it **with `prompt_bundle_version` unmoved**, so the hashed gate description now carries the tokeniser's measured behaviour.

**Three findings converged in round 1**, each reached independently by two lanes, and three more in round 2. Convergence across reviewers who were not talking to each other was the strongest signal in both rounds:

1. **The refund settled over the wrong population** (tenancy + billing). It iterated the display projection, which reads one claim per item — so once a second claim existed on an item, an older parked-and-debited claim became **permanently unrefundable** and the screen showed it as "Queued for autopsy". Fixed with a claim-level scoped reader, four mutations red.
2. **`refundDeferred` was re-derived from the paste quote** (learning + billing), whose reason order puts tier before pause — so a workspace that was both non-paid and paused printed *"credits returned"* in the past tense over a ledger with no refund. Fixed by returning `deferred` from inside the settlement's own transaction.
3. **A private paste proposed into the shared framework library** (learning BLOCK + tenancy CHANGE). Nothing the tenancy contract forbids actually crossed — the row sat behind `curator_status='approved'` and was never served — but R-94 rests on human curation and the curator was being handed a citation they could not open. **The owner answered no: R-99.**
4. **`parked_returned` was a fallthrough** (learning + billing, round 2): three parked realities were positively evidenced and the fourth was "everything else", so a claim that parked between the settlement and the read asserted a refund that had not happened. Now it requires positive evidence and an honest `parked_unsettled` state covers the window.
5. **The worker still ran the shared-library content check on private items** (compliance + tenancy, round 2) — and both corrected the orchestrator's judgement that the fix was expensive. It was two lines plus a type. Tenancy added the constraint that saved it from being done wrong: that assert is the **only** `assertMechanismLevel` on private autopsy content, and `assemble.ts` depends on it, so the content check stays and only the candidacy consequence is dropped. The builder planted the naive fix as a mutation and three tests caught it.
6. **A mint out of nothing** — billing minted 4 credits against the real `ledger.ts` because the over-refund guard counts per *reference spelling*, not per debit, while its docblock claimed the opposite. Arbitrated to CHANGE on a caller census run **twice, independently**; the docblock is corrected and a **red-by-design** test pins today's behaviour with the two assertions M6 must invert. Deferred as `8c-C4`.

---

## The walk (2026-09-04, real Anthropic, owner-authorised)

Production build, real authenticated routes, real provider. **Measured spend: 12,612 micro-USD across three priced autopsy calls, plus five attempts whose cost the product could not compute (see below) — roughly USD 0.019.**

**Walked and proven:**

- **Paste → queued → debited.** The panel read *"Costs 4 credits"* from the active config with no number in a screen file, and the balance beside it. After the press: *"Queued for autopsy. 4 credits charged. Balance: 196."*
- **`/usage` showed the debit** — balance 196, "4 credits spent this month", and a `-4` ledger row referencing the claim id.
- **Every storage requirement, verified in real rows**: `trend_sources.kind = submitted` with the **normalised** `external_id` (the `utm_source` tracking parameter stripped and the query sorted); `trend_items.baseline_state = unavailable`, `rights_scope = profile_private`; `trend_transcripts.reference_input_id` NOT NULL with `provenance.kind = creator_paste`; the transcript stored as a **`reference`-class onboarding input** through slice 4's intake. Migration 0028's fix is live on the row the walk created: `saturation_unmeasured_reason = no_population`, not the old wrong `incomplete_provenance`.
- **The background worker autopsied it against the real vendor**, producing a genuine four-part mechanism-level analysis — a paradoxical-reversal hook mechanic, twelve beats, ending, follow trigger — with no verbatim quotes, no numbers and no performance claims.
- **R-93's attempt ceiling and R-98's refund-on-park — the card's own least-confident line — walked for real**, driven by a genuine vendor failure rather than a fixture: the claim parked at 5 attempts, the screen said *"Could not be completed — 4 credits returned"*, and the ledger carried `autopsy_claim −4` and `autopsy_refund +4` on the same claim id with the balance back to exactly 200. **Reloading produced no second refund** — idempotency proven in the browser.
- **The honest-absence line**: the ready card renders *"No channel baseline — pasted reference"* where an outlier ratio would be, and the pasted item never entered the ranked feed.
- **The refunded-on-an-earlier-load branch**, observed naturally: on a later load the same card correctly dropped the number rather than re-asserting one it could no longer attribute.

**NOT walked, stated plainly:**

- **The spin, and the forced near-copy.** Both sit on the generation path. The first attempt refused `brain_not_activated` — correct, because that profile's voice document was activated in slice 3, *before* slice 3b introduced coherent activation snapshots. On a profile that **does** have one, every attempt refused `llm_unavailable` and wrote a `model_usage` row at zero tokens, on a server whose environment provably carried a working key (the same key succeeded from the worker and from a direct adapter probe in the same shell). **The cause is unresolved.** It is recorded as an open finding rather than guessed at, and it means slice 8c's acceptance line is walked up to "read the autopsy" and no further.

---

## What the walk found that no test did

1. **The autopsy could never have completed against the real vendor.** `worker/autopsy-vendor.ts` prices by `result.servedModel` — what Anthropic actually returned. Measured directly: `claude-sonnet-5` is echoed as `claude-sonnet-5`, but **`claude-haiku-4-5` is served as `claude-haiku-4-5-20251001`**. The config priced the alias, so `priceFor` raised, cost was null, and every attempt failed `vendor_usage_unknown` until the claim parked. The generation path degrades to unknown cost and still serves, which is why slices 3, 6 and 7 walked green — **the autopsy is the first production consumer of the classification model on a paid path**, so only this walk could find it. Unblocked with the sanctioned lever (prices are config, not code) by appending a version carrying the served id at the same real Haiku 4.5 rates. This is CLAUDE.md's 2026-08-18 lesson exactly: a guard proved against values we choose, never against what the installed vendor returns.
2. **`/usage` says there are two things that spend credits, and there are now three.** Its explanatory paragraph enumerates studio drafts and voice-brain builds; the autopsy debit appears above it labelled *"Not a studio draft"*. 8c added a third spender and this screen still says two.
3. **The worker's top-level failure handler tells an operator nothing.** `worker/main.ts` catches every start failure and writes `{"code":"worker_start_failed"}` with no reason. It swallowed a fully actionable refusal — a `ConfigNotMigratedError` naming the two missing keys *and* the command to fix it — and an operator on the target host would have had nothing to act on.
4. **Two guards refused correctly and named their own remedy**, which is worth recording as a positive: the `RESPIN_TRUSTED_PROXIES` guard (R-26) refused to start auth in production and printed both valid options, and the config guard refused rather than price a debit from a default.

---

## Residuals, stated not claimed

- **The spin leg of the acceptance line, and the forced near-copy** — unrun, cause unresolved (above). Slices 6 and 7's vendor walks remain unrun for the same generation path.
- **The whole round-2 fix pass is UNREVIEWED.** The two-round cap was spent; the owner chose it deliberately over a third round. Slices 3 and 7 closed the same way.
- **`traceable()` and `spans()`** — the structural fix's own author names the remaining class: the two sides now share a tokeniser, so any residual disagreement must come from `spans()` cutting the same characters differently when their neighbours differ. One live instance found and left: a brain holding `"Sept. 5"` against a draft saying `"Sept 5"` false-refuses, because the abbreviation dot splits the span. The self-vouch fuzz cannot see this class by construction (`corpus == draft`).
- **`"3x5x"` matches no shape at all**, so an invented multiplier chain produces zero findings. Both sides agree, so it is not a decomposition — it is a hole.
- **Traceability's hot path costs ~6x more** (measured warm on a 42 kB corpus: index 2.1 → 12.6 ms, scan 2.5 → 15 ms). Deliberately not optimised: the obvious win is a branch inside the tokeniser a hard integrity rule depends on.
- **`neverChargedClaimIds`** reports claims with no `autopsy_claim` debit — today exactly "priced at 0", but it would absorb a claim whose debit went missing for any other reason, and the screen would then say "nothing was charged" about a claim that was.
- **A private analysis that fails the content rule still burns its attempt** and parks after five, deterministically, at four vendor calls each. Failing is correct; the retries buy nothing.
- **Deferred with an owner and a trigger**, now recorded in [`respin-finish-open-items.md`](respin-finish-open-items.md) rather than only in a review report: **8c-C4** (the per-spelling refund budget → M6's admin refund surface) and **8c-C9** (a settlement refusal takes down the whole `/trends` surface → M6 / operator work).
- **The similarity gate remains a deterministic lexical/structural proxy**, not semantic or plagiarism detection.
- **A process risk worth naming:** a round-1 reviewer wrote two 501-line mutated copies of the money module into `packages/credits/src/` while another reviewer was hashing the tree. It cleaned up, and a **different** reviewer caught it. `tests/probe-artifacts.test.ts` and the `.tmp/` ignore now exist because of it; `.playwright-mcp/` was added to `.gitignore` for the same reason after this walk.

## Diff scope and method

HEAD `cc3ed43` → working tree, **nothing committed** (standing owner instruction: no git actions). Round 1 manifest 64 in-scope files of 166 hashed; round 2, 39 fix-pass files of 173. **Every reviewer verified hashes before and after and reported 166/166 and 173/173 clean** — no in-scope file moved under any review. Reviewers read the **main tree**, never a worktree, because a worktree reviews HEAD and HEAD is slice 7. Entry gate re-run on every tree. The four specialists ran in parallel on disjoint lanes; the two fix passes used 4 and 3 builder agents on disjoint file sets with type contracts pinned across them.
