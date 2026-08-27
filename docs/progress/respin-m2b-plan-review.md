# Plan review — Respin M2b (round 1)

**Draft reviewed:** [`../plans/respin-m2b-plan.md`](../plans/respin-m2b-plan.md) (DRAFT, 2026-08-24)
**Brief:** [`../plans/respin-m2b-brief.md`](../plans/respin-m2b-brief.md)
**Verdict: NOT READY.** All four Critical-Path reviewers returned **BLOCK**.

| Reviewer | Verdict | Grade | BLOCK | CHANGE | NOTE |
|---|---|---|---|---|---|
| `respin-tenancy-reviewer` | **BLOCK** | D | 8 | 13 | 6 |
| `respin-billing-reviewer` | **BLOCK** | D | 4 | 13 | 6 |
| `respin-compliance-reviewer` | **BLOCK** | D | 4 | 10 | 5 |
| `respin-learning-reviewer` | **BLOCK** | D | 4 | 7 | 4 |
| **Total (before dedup)** | | | **20** | **43** | **21** |

The generalist `plan-reviewer` (Step 6c) was **not run**: with 20 blocking findings converging on a whole-plan rewrite, its simulate-and-pre-mortem pass would be spent on text that will not survive. It runs against the rewrite.

**Reviewer quality note, recorded because it changes how much weight the findings carry:** all four verified by execution rather than by reading. Tenancy ran `tsc --noEmit --strict` against a probe reproducing the post-`0012` insert type; learning ran a shingle-collision measurement over two real repo documents and a six-variant evasion probe; billing traced each P-mutation to the AC it claims to redden and asked whether a *vacuous* implementation would also pass; compliance grepped `[check]` across `respin/` (zero hits) and confirmed `insert(brainDocs)` has exactly one writer today.

---

## 1. Convergent findings (independently reached by 3-4 reviewers)

Independent convergence from different dimensions means these are not judgment calls.

### C1 — The echo bar is specified two ways, and the useless reading is the cheaper build *(all four reviewers)*

B-10(b) says no **string leaf** of ≥8 words may appear verbatim in a reference input — that is **whole-leaf containment** (`input.includes(leaf)`). AC-17 says an **8-word span** copied in is refused — that is **sliding-window n-gram matching**. They are different algorithms. Under the decision's wording a 200-word voice rule embedding one stolen sentence **passes**, because the leaf as a whole is not a substring of anything — which is precisely the door B-10's own justification says it closes.

**AC-17 and P-6 cannot discriminate the two implementations.** AC-17's fixture is satisfiable by a leaf that *is* the eight words; P-6 deletes the call entirely and reddens under either. This is the same failure shape as M2a's round-2 pause fixture that B-3 was written to avoid — applied to B-10 and failing.

Three further defects in the same decision:

- **The matcher misses its ordinary case.** Measured by the learning reviewer against B-10's stated NFC/LF normalisation, on six trivial variants of a copied 9-word span: `exact CAUGHT · smart apostrophe MISSED · capitalised MISSED · double space MISSED · nbsp MISSED · one word swapped MISSED`. Five of six evade — and re-casing and re-punctuating is an LLM's *default* behaviour when reproducing a sentence.
- **"Word" is undefined and the bar never fires for scripts without word delimiters.** A 22-character CJK span is one whitespace token; Japanese, Chinese, Thai and Khmer content is entirely unchecked.
- **The two sides are not normalised the same way.** `normaliseContent` runs only in `appendOnboardingInput` (`with-workspace.ts:586`); brain `content` is stored raw.

**The threshold number itself survives.** Measured: `PRD.md` vs `gtm.md`, 8-grams — 9 collisions in 607, all 9 from one deliberately copied sentence. **Zero incidental collisions.** So the plan's declared *Least confident* line was **wrong in direction**: false positives are near zero, false negatives are the defect.

### C2 — `SourceEvidenceEntry` has no field key, so nothing per-field is computable *(tenancy, learning, compliance)*

The stored shape is `{quote, inputId, startUtf16, endUtf16, confidence}` (`with-workspace.ts:523-529`, mirrored in `tech-spec.md` §2) — **no field identifier**. So REQ-B02's "shows its source evidence" per field, D-M2-5's "evidence: N of M posts" per field, and D-M2-5b's "ANY inferred field unconfirmed" all rest on a link that does not exist. The plan added `confirmed_fields jsonb` without adding the matching key to the evidence entry, and never defined how "inferred fields" are enumerated.

Consequences: the label would be computed per *document*, so a zero-evidence field inherits "evidence: 3 of 7 posts" — a fabricated warrant, the exact thing D-M2-4/5 exist to prevent. And **AC-18 passes vacuously against an empty inferred-field set** — the failure M2a's AC-3 explicitly guarded against.

### C3 — The `confidence` field is left wired, unowned, and unmentioned *(tenancy, learning, compliance)*

`SourceEvidenceEntry.confidence: string` is **required**, free-form (no enum), never inspected by `validateSourceEvidence`, unreachable by `stripGuarded` (it lives inside jsonb), and exported to the creator by task 16. M2a's A-8 says it "carries REQ-B02's second half, **its shape defined by M2b**". **The plan does not mention the field once.** D-M2-5's whole argument — a count cannot be laundered, a model-derived confidence can — is defeated by a column the plan silently inherits and makes mandatory.

Related: AC-24 bans the *spelling* "confidence" in source literals, so a value rendered from the database is invisible to it, and synonyms ("certainty", "strength", "reliability") pass unchanged. And M2b ships no UI, so the scan can pass while examining nothing.

### C4 — Activation creates a second `brain_docs` writer, outside every M2a control *(tenancy BLOCK, compliance BLOCK, learning NOTE)*

`status`, `version`, `activatedAt`, `supersededAt` are all in `GUARDED_WRITE_FIELDS`, so `activateBrainDoc`/`confirmFields` **cannot** go through `writeBrainDoc` and must issue their own `update(brainDocs)` from `packages/brain` — with no cage assertion, no pause gate, no server-derived ids. `tests/table-writers.test.ts:257-282` pins `brain_docs`' sole writer as `with-workspace.ts`, and pins `creator_profiles` and `workspace_spend_monthly` as **empty sets**, commenting that "the FIRST writer is a deliberate edit to this file". **No task, AC or decision in the plan mentions that file** — so the build hits an unplanned red whose path of least resistance is to allowlist `packages/brain`, opening a `brain_docs` write that bypasses both `validateSourceEvidence` and `assertNoReferenceEcho`.

### C5 — REQ-I03 is claimed while only the opposite failure mode is covered *(compliance BLOCK, tenancy CHANGE)*

REQ-I03 is *invented personal specifics → `[check]` placeholders*. The plan reduces it to the reference-echo bar, which guards the inverse. Verified in code: `source_evidence NOT NULL` is satisfied by `'[]'::jsonb`, and `validateSourceEvidence` returns immediately on an empty array (`with-workspace.ts:773`). **A brain doc of entirely model-invented fields writes cleanly, is confirmed, and activates.** `grep '\[check\]' respin/` returns zero hits. This is the master plan's round-1 compliance BLOCK recurring verbatim.

---

## 2. Tenancy-only blocking findings

- **T1 — The AC-13 completeness scan cannot see the new package, so `createProfile`'s role check is forgeable.** `tests/profile-cage.test.ts:514` walks `packages/credits/src` **only**. R-30's Revisit line promises "the AC-13 scan will fail, deliberately" when M2b adds a `WorkspaceScope`-taking entry — **that promise is false for a new package.** `createProfile` reading `scope.role === "owner"` with no `assertScoped` accepts `Object.assign({}, viewerScope, {role:"owner"})` — the A-3 escalation — and a forged `workspaceId` creates a profile in another workspace.
- **T2 — The three new confirmation columns are outside the write allowlist. Proved by compiler.** `tsc --noEmit --strict` against a probe reproducing the post-`0012` shape: a non-literal carrying `confirmedFields`/`confirmedAt`/`confirmedBy` compiles **clean** into `WriteBrainDocParams`, while the same shape carrying `status` errors `TS2345`. `stripGuarded` is driven by the same constant, so the runtime strip misses them too. Chain: forged `confirmed_fields` + `confirmed_at` → AC-18 satisfied → the new CHECK satisfied (it tests *presence*, never authenticity) → **silent brain activation with no creator confirmation**. This is the round-2/round-3 defect M2a's header says failed twice, re-opened by adding columns.
- **T3 — `confirmed_by uuid` FK → `user.id` cannot be created.** `auth-schema.ts:13` declares `id: text("id").primaryKey()`; Postgres refuses a `uuid`→`text` FK. Beyond the type, the domain identity is `users.id` (uuid) and D-M1-5 says domain code never joins auth tables — so the confirmation would name a different subject than the membership check.
- **T4 — `runInference` has no role gate: a viewer can spend the workspace's credits.** `ProfileScope` carries no `role`; only `WorkspaceScope` does. REQ-A02 is explicit that a viewer may not generate.
- **T5 — The `strategy` provenance exemption admits verbatim third-party text into a column the echo bar does not cover.** A `strategy` doc citing a `reference` input stores that third party's sentences verbatim in `source_evidence[].quote` (verbatim by construction — `validateSourceEvidence` requires exact slice equality). That column is exported and is the natural feed for M3's prompt bundle. The exemption reopens the door B-10 exists to close, one column over.

## 3. Billing-only blocking findings

- **B1 — The model is called before any balance check, and the debit's refusal then destroys the record of the spend.** Task 10's order puts the adapter call before a transaction holding `model_usage` + rollup + debit. `debitCredits` refuses *after* the money is gone — on `InsufficientCreditsError` (`ledger.ts:347`), on a pause opened mid-flight (`:343`), on `assertWriteClock` (`:341`). Each throw rolls back the transaction that B-9 deliberately put `model_usage` in, **discarding the only record of a spend that already happened**: simultaneously an unmetered generation and an unrecorded cost, in the margin-flattering direction. The plan never mentions `InsufficientCreditsError`, a top-up prompt, or `maybeAutoTopup`.
- **B2 — The one free included build is a check-then-act race with no lock and no constraint.** `COUNT(DISTINCT attempt_id) < 1` is evaluated in application code. The zero-cost path skips `debitCredits` — and therefore also skips `takeWorkspaceLock` — so two concurrent calls both count zero, both run free, and we pay Anthropic twice with no ledger row. B-4's own justification convicts it: "a money invariant enforced by application code is a race". The plan settled the *paid* path in the schema and left the *free* path settled by nothing. **The zero-cost fact was carried to the pause gate and not to the lock — partial application.**
- **B3 — `runInference` on an archived profile is unguarded, defeating the cap B-13 exists to enforce.** Downgrade Studio→Creator with 5 profiles, archive 4, pass `assertProfileCap` at 1 active, then generate against any of the 4 archived ones. `ProfileScope` carries no `state`. The brief states the intent ("not usable for generation"); the plan routes the refusal only through the workspace-level cap.
- **B4 — The `.default()` deploy window mis-attributes real money.** `getActiveConfig` returns `{version: row.version, content: parsed.data}` (`config/src/index.ts:41`) — the version of the *stored* row with *defaulted* content. Between the code deploy and `migrate-config`, a 5-credit debit is stamped `config_version = N` while document N contains neither `onboardingBrainRebuild` nor `llm.prices`, making the debit unreconcilable — the exact failure `DebitParams.configVersion`'s docblock exists to prevent. `profileCaps` set this precedent harmlessly; a price and a credit cost are not harmless.

## 4. Learning-only blocking findings

- **L1 — `performance_meta` is treated as a writable kind.** The plan bars reference provenance for it, echo-checks it and exports it, but never says whether onboarding may *write* it — and `writeBrainDoc` accepts any `BrainKind`. The master plan's Exit Demonstration item 6 says the opposite in terms: three writable kinds, with `performance_meta` rendered "not yet earned — written by M5's learning loop". A `performance_meta` doc inferred from pasted, number-free, unverified posts is a performance claim at n=0 that reaches M3's prompt bundle.
- **L2 — N and M name no population and no period, and the denominator moves.** "M = inputs submitted" has no class filter, so `reference` inputs and B-14's new `creator_authored` edit rows land in a denominator labelled "**posts**" — every creator edit silently lowers that field's ratio. N is fixed at write time while M is read at render time, so a stored label drifts as inputs accrue: not period-stable.
- **L3 — N is vacuous by construction.** `writeBrainDoc` already throws on any entry failing the substring check, and `onboarding_inputs` is immutable, so **every persisted entry passes forever**: N always equals the number of distinct inputs the model chose to cite. A prompt citing one quote per input renders "evidence: 7 of 7" with zero support. D-M2-5's own text says this ("counts quote *existence*, not quote *support*"); the plan carried the label and dropped the caveat.

---

## 5. Cross-cutting CHANGE findings worth carrying into the rewrite

**Verified-in-source facts the plan got wrong:**

| Finding | Evidence |
|---|---|
| `migrate-config` migrates **top-level keys only** — `creditCosts.onboardingBrainRebuild` is nested and would land only as a side effect of `appendConfigVersion` re-parsing | `migrate-config.ts:107,116` |
| Migrations live at `packages/db/migrations/`, not `packages/db/drizzle/` | directory listing |
| Task 17 is a no-op as written: `CROSS_PACKAGE_DENY` is already generic (`@respin/*/src`). The real gap is the **app-direction** deny, which is name-enumerated with no catch-all — so `@respin/brain`, and later `@respin/modes` and `@respin/trends`, are app-importable by default | `eslint.config.mjs:199-224` |
| B-12's justification is false: `withWorkspace` **returns** a scope, it is not a scoped callback — and `withProfile(…, async s => s)` hands out a bare `ProfileScope`, which is `trustProfileId` in four characters. P6's scan matches only `(trust\|unsafe\|raw\|assume\|force)…Profile` | `with-workspace.ts:829-874`; `import-boundary.test.ts:753-756` |
| B-8's "REQ-G05 **already** excludes `unknown`" is false — `tech-spec.md` §2 says the opposite in terms ("no aggregation code and no test, the margin dashboard is M6") | `tech-spec.md` §2 |
| New brain errors have no app-facing copy, so they render "Something went wrong"; and a **new `packages/db` error turns `billing-ui.test.tsx` red**, which the Out-of-Scope list does not exempt | `billing-ui.test.tsx:783-820` |
| `WriteBrainDocParams.sourceEvidence` is `… | null`; the NOT NULL alter requires dropping `| null` in the same change | `with-workspace.ts:556` |
| `credit_ledger.refType` is `text`, not an enum, so `0012` needs no `ALTER TYPE` — **B-4's parity claim verified and holds** | `billing-schema.ts:132,172-196` |
| `hasOpenPause` is at `credits/src/index.ts:32`; the plan cited `:29` (the block's opening line) | — |

**Design gaps:**

- `createProfile`'s cap is a SELECT-then-INSERT race with no `takeWorkspaceLock` — the same defect as B2, on the entitlement counter.
- `activateProfile` has no cap check: archive → reactivate is an unbounded route back over the cap.
- B-7's "Anthropic list prices are whole dollars per MTok, so micro-USD per token is exact and integral" is **false as a general claim** — sub-dollar-per-MTok models and cache-read/write multipliers are fractional (a $5/MTok input at 0.1× cache-read is 0.5 micro-USD/token). DL-12 defers caching to M3, so the unit breaks one milestone out, on an append-only versioned document. **Price in nano-USD per token.**
- `model_usage_outcome` has **five** enum values (`succeeded`, `schema_invalid`, `rate_limited`, `unavailable`, `refused`); B-5 classifies two or three. `refused` is unclassified, and a pre-response transport failure has no distinct value — so AC-7's "one case per outcome" cannot be written as stated.
- **`schema_invalid` consuming the one free attempt can permanently deprive a creator.** That is *our* prompt failing. Free has no minting until M3, the rebuild costs 5 credits, and `profileCaps.free = 1` blocks the new-profile workaround — so a Free workspace whose single build returns invalid schema is locked out of ever having a brain. `model_usage`'s own comment anticipates the fix ("a bounded retry writes two rows"); the plan never says a schema-invalid response retries under the **same** `attempt_id`.
- `reconcileWorkspaceSpend` is not well-defined: no `tier` dimension against a `(workspace_id, period_month, tier)` grain; no repair path for the sanctioned `estimated → reconciled` update; no rule for `cost_state='unknown'` rows whose cost is NULL (a naive `sum()` treats absent as zero — understating cost, overstating margin, on the one aggregate that survives deletion); and after a REQ-A04 deletion it compares against an empty set and reports maximal false drift forever.
- **B-1's adapter injection seam is never named.** "Provable by handing `runInference` a stub that throws if invoked" requires the adapter to be a **parameter**, not a module import stubbed with `vi.mock`. The plan does not say which — and B-1 is the decision the whole pause-gate argument rests on.
- No clock source named: `DebitParams` requires `at: Date`, bounded by `assertWriteClock`. The repo's discipline is `getDbNow(tx)`, not `new Date()`.
- No AC forbids prompt or completion text reaching logs or thrown error messages. `assertMeteringOnly` structurally covers `usage_raw` only.
- `source_evidence NOT NULL` is a shape guard, not a provenance guard — `'[]'` satisfies it.
- REQ-B03 is claimed with nothing behind it: `north_star` appears nowhere in `respin/`. REQ-B02's third sentence ("never silently infers sensitive personal traits") has zero coverage. The Stop Condition "every task binds ≥1 REQ id" is unverifiable — the task table has no REQ column.
- Scans without planted-violation proof: AC-1 and AC-13. Money-critical ACs with no mutation at all: AC-6, AC-7, AC-11.
- Reviewers were split-but-consistent on the flagged `onboardingBrainRebuild = 5`: flagging is acceptable, **shipping the flagged value is not** — it prices the first debit the product ever takes, and finding B-5 shows 5 credits is unpayable by exactly the Free creator most likely to need a rebuild. Make owner confirmation a precondition of the config data step, not of M2c's UI.

---

## 6. What the plan got right (carried forward unchanged)

Recorded so the rewrite does not discard load-bearing work:

- **B-2's pause gate rests on a claim verified in code and true**: `creditCosts.onboardingBrainBuild: 0` (`seed.ts:53`) and `assertPositiveInt` throwing on it (`ledger.ts:339,365-369`), so a zero-cost operation genuinely skips `debitCredits` and its embedded pause check. First-statement gating is the right answer.
- **B-1's dumb-adapter split is the right answer** to "the gate holds trivially" — conditional on naming the injection seam.
- **B-3's discriminating fixture is constructible and genuinely discriminating**: `pause_periods` FKs only to `workspaces`, and `isPausedSubscription` requires a live Stripe subscription, so an open pause with no subscription row makes the two predicates disagree. Consider also M2a's harder `{open pause, mirror canceled}` shape.
- **B-4's index matches its three precedents in shape exactly**, and `ref_type='inference_attempt'` is free of collision with `lot`, `checkout_session`, `invoice`, `auto_topup`, `debit`.
- **B-7's Opus-5 arithmetic is correct** ($5/MTok → 5 micro-USD/token; 1M × 25 = $25 exactly) — only the generality claim fails.
- **B-8's fail-closed price lookup is clean on its own terms**: it refuses before spending and writes `cost_state='unknown'` with a NULL cost rather than a flattering zero.
- **B-10's threshold number survives measurement** (zero incidental 8-gram collisions), and keeping it a code constant rather than a config key is correct.
- **AC-25's registry-driven export coverage is the right shape.**
- **DL-11's re-taking of R-30 constraint 5 in writing is expressly sanctioned** by the constraint and the registry text.
- **Migration `0012` adds no table**, so the registry's "every table any migration creates" predicate is unaffected — the plan is right not to touch it.
- **Non-Goals verified accurate**: no `promotion_proposals` anywhere in `respin/`; the M5 receiver is named.

---

## 7. Recommendation

**Rewrite the plan whole rather than patch it.** M2a's own history is the precedent: after four rounds of patching produced the same partial-application failure each time, it was rewritten end to end and converged. Twenty blocking findings across four dimensions, several of which change the same decisions (B-5, B-9, B-10, B-13, B-14 are each touched by two or more reviewers), is exactly the condition under which patching re-randomises a document.

**Two structural questions the rewrite must answer, both larger than a paragraph:**

1. **The confirmation/activation surface belongs in `packages/db`'s capability allowlist, not in `packages/brain`** (C4, T2, T3). That means M2b now edits M2a's `GUARDED_WRITE_FIELDS`, `SourceEvidenceEntry` (adding a field key, C2), `WriteBrainDocParams`, `table-writers.test.ts`'s expected-writer set, and `tech-spec.md` §2 — substantial surgery on the substrate that just passed its gates.
2. **The findings cluster into two coherent halves**, which is a signal M2b is still too big: the **metered inference path** (B1-B4, T1, T4 — ordering, locks, roles, config window) and the **brain-document surface** (C1-C5, T2, T3, T5, L1-L3 — evidence shape, confirmation, activation, echo matcher, export). Splitting them would follow the M2a pattern that worked; keeping them together would be the third attempt at a document this size.
