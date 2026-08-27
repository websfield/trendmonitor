# Plan review — Respin M2b-1 (round 2)

**Draft reviewed:** [`../plans/respin-m2b1-brain-surface-plan.md`](../plans/respin-m2b1-brain-surface-plan.md) (DRAFT, 2026-08-24) — the post-BLOCK rewrite of [`respin-m2b-plan.md`](../plans/respin-m2b-plan.md), split in two.
**Verdict: NOT READY.** All four reviewers returned **BLOCK**.

| Reviewer | Verdict | BLOCK | CHANGE | NOTE | Round-1 findings closed |
|---|---|---|---|---|---|
| `respin-tenancy-reviewer` | **BLOCK** | 6 | 14 | 6 | **6 of 8** |
| `respin-compliance-reviewer` | **BLOCK** | 2 | 12 | 3 | **4 of 4** |
| `respin-learning-reviewer` | **BLOCK** | 2 | 9 | 5 | **2 of 4** |
| `respin-billing-reviewer` (scoped to the non-trigger claim) | **BLOCK** | 2 | 5 | 3 | **4 of 4 carried to M2b-2** |
| **Total** | | **12** | **40** | **17** | |

**Movement vs round 1: 20 → 12 BLOCK, 43 → 40 CHANGE.** More importantly, the *character* of the findings changed. Round 1's blocks were structural — wrong ordering, wrong size, whole concerns absent. Round 2's are specification defects inside a structure every reviewer accepted: three reviewers explicitly confirmed the rewrite closed most of their round-1 blocks, and the billing reviewer verified all four of its round-1 blocks are carried into the M2b-2 scope note **at full strength**, with 7 of 8 CHANGEs faithful.

---

## 1. Convergent blocking findings

### V1 — A non-string leaf escapes every gate *(compliance, learning, tenancy — all three)*

C-6 enumerates the inferred-field set as "every JSON Pointer to a **string leaf** of `content`". A claim written as a number, boolean, or null (`{"followerCount": 42000}`, `{"is_a_parent": true}`, `{"posting_cadence": 5}`) is therefore **not an inferred field**: it needs no evidence entry, never renders `[check]`, passes D-M2-5b's activation gate vacuously, is not walked by the echo bar (also leaf-scoped), and is invisible to C-16's barred-trait check. A number is the most likely form of an invented personal specific, and it reaches the export and M3's prompt bundle.

Learning put the root cause most precisely: `content` is `unknown` with **no per-kind schema**, so the domain of the derivation is model-controlled. "Server-derived" holds in the weak sense (the server performs the walk) and fails in the strong sense (the server decides what is walked). This lands exactly on the plan's declared *Least confident* line, in the under-broad direction it named as the one that matters — and took no action on.

**Root fix, not a patch:** declare a per-kind server-owned content schema (Zod) for the four brain kinds, and enumerate every claim-bearing leaf regardless of JSON type.

### V2 — C-4 and C-5 are jointly unsatisfiable *(compliance, tenancy — both BLOCK; learning CHANGE)*

`validateSourceEvidence` requires a quote be an exact slice of the stored input (`with-workspace.ts:821`), so a `strategy` doc citing a `reference` input stores a verbatim reference span **by construction**. C-4 puts the echo bar over `source_evidence[].quote`; the bar refuses any ≥8-segment window occurring in a reference input. A 240-character quote is ~40 segments. So **AC-7 kills AC-8** for every quote longer than seven words, and C-5's 240-character cap — the thing the exemption was bought with — is unreachable.

The predicted resolution is an unreviewed carve-out scoping the quote check to exclude the entry's own cited input, at which point T5's door is held shut by the cap alone. **This is round 1's "two specifications, the weaker one passes the AC" reproduced on a new pair.**

### V3 — Activation never pins the activated content to the confirmed content *(learning, tenancy)*

Task 8 says "deactivate current + **insert new** in one transaction". The confirmation columns live on the `proposed` row `writeBrainDoc` already wrote, and `confirmed_fields`' pointers resolve against **that row's** `content`. If activation inserts a fresh row, nothing requires its content to match, and the new CHECK tests only that `confirmed_at IS NOT NULL` — so a copied `confirmed_at` over different content satisfies it. AC-16 cannot discriminate: it activates the row it just confirmed.

That is activation of content the creator never confirmed — Risk R3 (confirm-screen theatre) as a silent brain activation, in the milestone whose purpose is to make that impossible.

### V4 — The two new capabilities have no pause semantics *(billing BLOCK; tenancy + compliance CHANGE)*

REQ-G08 (`PRD.md:118`) says a paused workspace is read-only. `writeBrainDoc` refuses on `hasOpenPause` because "a brain write is an ENTITLEMENT" (M2a A-7); `appendOnboardingInput` and `recordModelUsage` deliberately do not. **`confirmBrainDocFields` and `activateBrainDoc` are classified nowhere** — not in the decisions, tasks, 34 ACs, or 21 mutations. Activating a brain is a stronger entitlement than writing a draft.

Two compounding facts: `packages/db/tests/profile-scope.test.ts:612` names its three capabilities one by one rather than parameterising over the capability set, so both new ones land with the suite green either way; and `tests/table-writers.test.ts:258-261` justifies the single-writer pin with the words "cage-asserted, **pause-gated**, status and version server-derived" — a sentence that becomes false for two of three writers in that file, with nothing reddening.

### V5 — The echo bar at export can permanently deny a REQ-A04 export *(tenancy BLOCK; compliance CHANGE)*

`onboarding_inputs` is immutable with no delete path and brain versions are append-only. Appending a `reference` input that collides with an already-active doc makes the export refuse **permanently**, with no product action that clears it — the 2026-07-30 lesson ("if the refusal's remedy says delete this evidence, the control is the outage") reproduced on the creator's data-portability right. It also protects nothing: the export goes to the creator, about their own profile. The leak route the bar exists for is M3's prompt bundle.

## 2. Single-reviewer blocking findings

- **T-A — Confirmation and activation ship with no role authority, and the gap is owned by neither half.** `ProfileScope` carries no `role` (only `WorkspaceScope` does), so `writeCapabilities(scope)` grants both new capabilities to **any** member: a viewer can confirm someone else's inferred voice rules, activate the brain, and be recorded in `confirmed_by`. Round-1's T4 was deferred as "`runInference` role gate", and the M2b-2 scope note inherits only `runInference` — so the role gate on the two REQ-A02/REQ-B02 operations *this* plan ships was lost in the split.
- **T-B — Three new query paths over creator data are unscoped, and the scan the plan claims to widen still cannot see them.** The export's grain is never stated; `ProfileAccessors` has **no `frameworks` accessor**, so task 17's "private rows only" must be a raw `select().from(frameworks)` outside the single scoping helper. And task 19 extends the M2a AC-13 scan's **roots** but not its **predicate**: `takesScope` matches `/\bWorkspaceScope\b/`, while every entry M2b-1 adds is `ProfileScope`-grained. **Measured: extending the roots adds exactly one entry repo-wide, and it is already covered.** Among 34 ACs there is not one cross-profile or cross-workspace assertion for the export.
- **B-A — AC-31 fails open and cannot run in this CI.** (a) It measures directories, but since R-30 the billing triggers do not live there: `hasOpenPause` is in `packages/db/src/pause.ts`, and `RecordModelUsageParams`/`assertMeteringOnly`/`GUARDED_WRITE_FIELDS` are all in the file M2b-1 edits in **seven** tasks. (b) It has no planted violation, which the plan's own pinned 2026-08-21 lesson forbids. (c) `.github/workflows/respin.yml` uses `checkout@v4` at default `fetch-depth: 1`, so a merge-base diff has nothing to diff against; both likely degraded implementations fail open.

## 3. Errors of mine the reviewers caught, recorded plainly

- **I stated a fact about code I had not verified.** C-4's rationale says "D-M2-4 already re-validates quotes at activation and export". False: `validateSourceEvidence` has exactly **one** caller (`with-workspace.ts:656`, inside `writeBrainDoc`), and M2a has no activation or export path at all. The plan then gave activation and export the *echo* bar while silently dropping D-M2-4's quote re-validation at both points — citing as already-done the thing it was removing. **Golden rule 1.**
- **Dropping `| null` from `sourceEvidence` breaks three of M2a's own forgery assertions, silently.** `tests/profile-cage.test.ts:89,103,114` build their `@ts-expect-error` fixtures with `sourceEvidence: null`. After C-15 each errors on `sourceEvidence` instead of on `profileId`/`status`/`version`, the directive stays "used" (no TS2578) — and **compile-red 6, the silent-brain-activation assertion for `status:"active"`, stops testing `status`**. A green suite that has stopped checking the thing it names.
- **My `Intl.Segmenter` decision is runtime-dependent and I pinned no locale.** `new Intl.Segmenter(undefined, …)` resolves the **host default locale** and depends on the runtime's ICU build. Measured by the reviewers on the same Node v24.18.0: default locale resolved to `en-AU`; one Japanese sample gave **10** word-like segments, another **7**; my own sample gave 9. A small-ICU container silently degrades CJK segmentation and AC-4 with it. The 8-segment threshold is also ~40 English characters but ~13 CJK characters, and round 1's zero-collision measurement was **English-only** — so the threshold is calibrated in one script and applied to all.
- **AC-21 is unsatisfiable as written.** `frameworks.confidence` is a real `text NOT NULL` column and task 17 exports private `frameworks` rows.
- **AC-27 is vacuous.** `table-writers.test.ts`'s `EXPECTED` is keyed by **table**, and `creator_profiles: {}` already exists — so the assertion is true before task 4 runs, and there is no column-level scanner.
- **AC-3 contradicts AC-2.** I carried round 1's measured "one word swapped MISSED" into a criterion without re-deriving whether an exact 8-gram *should* catch it. Swap mid-span and the longest surviving run is 4 — the matcher must accept. Round 1's defect is round 2's correct behaviour.
- **C-16's barred-trait set is false coverage**, said by all three non-billing reviewers. It matches model-chosen field **keys**; REQ-B02's clause is about *inferred* traits, which live in values (`{"audienceNotes": "a devout Catholic mother in Leeds"}`). A fixed list over a model-chosen key space is a denylist — the shape R-30 records as having "failed twice" on this exact surface, and the counterexample-list form the plan's own lessons section forbids.
- **`[check]` has no way forward.** A single zero-evidence field is both unconfirmable *and* activation-blocking, so one uncited field bricks the brain with no remedy in this plan (the editor is M2c; a rebuild is priced in M2b-2 and Free gets one attempt). It also inverts REQ-I03's purpose: placeholders exist so output can *ship* with them.
- **In the M2b-2 scope note:** my nano-USD correction reintroduces its own defect one line later ("divide at the end in `bigint`" truncates → understates cost → **overstates margin**); I dropped `maybeAutoTopup`; and I lost two round-1 items entirely (the money-AC mutation discipline, and B-3's discriminating pause fixture).
- **M2b-1 makes M2b-2's money work harder than the scope note plans for.** It adds roughly **seven** new ways a model-produced doc is refused *after the tokens are spent* (kind refusal, sensitive key, empty evidence, dangling pointer, echo bar, quote cap, fail-closed walker). The note carries the free-attempt-lockout argument for `schema_invalid` only — and none of the seven maps onto the five-value outcome enum, since a kind refusal is schema-*valid*.

## 4. What held

- **The split and the reversed ordering** — explicitly endorsed ("well-argued and correct").
- **C-10's capability placement**: both new writers land inside the already-pinned writer file, so the allowlist doctrine is not widened; AC-28's planted second writer is the right shape.
- **C-11 is implementable as written** — verified independently by two reviewers: `users.id` is `uuid`, `memberships.userId` already references it, `withWorkspace` already holds the row, and `mintVerified` has exactly one caller repo-wide. The `uuid → text` FK problem is genuinely solved.
- **C-7's removal of `confidence` is the honest direction**, not a Must narrowed by convenience — D-M2-5 had already decided it.
- **C-8's wording** — "quoted from N of your M posts" carries the caveat adequately: it describes the operation performed and makes no support claim.
- **C-12's placement** — refusing the kind at the sole writer is the right place.
- **C-13 creates no unenforceable-entitlement window** — verified: nothing can create, archive or generate against a profile in M2b-1.
- **C-9's `'[]'::jsonb` closure** — the non-empty CHECK plus raw-SQL AC plus planted mutation genuinely closes the route compliance blocked on, and `[check]` is confirmed first-of-kind in the repo.
- **Task 21/AC-32 are sound** — the error enumeration derives from live module exports and cannot be padded to absorb new errors.
- **The billing non-trigger's four factual claims are each true**, verified: no ledger change, no debit call site, no config key, no price.
- **Deferrals are genuine** — every reviewer traced its own deferred findings into the M2b-2 scope note and found nothing quietly dropped.

## 5. Recommendation

**Targeted round 3 on the 12 blocking findings, not a third rewrite.** The structure held: every reviewer accepted the split, the ordering, the capability placement and most decisions, and the failures are now paragraph-level specification defects rather than the whole-document incoherence that forced the round-1 rewrite. Rewriting whole again would discard work four reviewers just validated.

**One fix is a root cause rather than a patch, and it should be taken first:** V1's real cause is that `brain_docs.content` has no schema. Declaring per-kind Zod content schemas for the four brain kinds fixes the leaf-type hole at its source, and also gives C-16 a typed surface and C-9 a well-defined field set. It is an addition to M2b-1's scope, and it is the honest fix.
