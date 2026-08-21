# Plan review — respin-m2 (round 3, consolidating)

**Readiness: Not yet · Grade: D · The plan is close on tenancy and provenance, but the two newest owner decisions were applied to some paragraphs and not others, three phases contain tasks whose target package or data contract does not exist, and two acceptance criteria in phase 2 contradict each other on the money path.**

Reviewer: generalist `plan-reviewer` (simulation + pre-mortem + consolidation). Read in full: master plan, phases 1-6, the profile-cage design, the codebase review, and the round-1/2 review record. Code facts below were verified against the repo, not taken from the plan.

Prior rounds: 14 BLOCK (round 1) -> 10 BLOCK (round 2). This round finds **11 blocking**, **14 change**, **13 note**. The composition has shifted again in the way the round-2 review predicted: most of what follows is *an owner decision applied in one place and missed in five*, plus new holes opened by the round-3 fixes themselves — the schema consolidation into phase 1 and the priced-rebuild decision each opened one.

---

## Execution simulation

Walked as `respin-engineer`, task by task, with only the phase plan in front of me.

### Phase 1 — profile cage + complete schema

- ✅ Tasks 1-8, 12-14 are executable. The handoff block gives real signatures, the mutation mechanisms are named, and the P4 fixture problem that blocked two rounds is solved with a mechanism that works (probed below).
- ❌ **Task 3 — the enum value sets are missing.** `model_usage.outcome` is specified as "outcome enum **enumerated in the schema**" with the values never given; `cost_state`, `purpose` and `brain_docs.status` are the same. Two phase-2 criteria (AC-7c, AC-7d) discriminate billable from non-billable **by outcome**, and phase 5 writes `status='draft'` rows against an enum phase 1 never enumerates. · Fix: enumerate all four value sets in F2/F5.
- ❌ **Task 9 — `creditCosts.onboardingBrainRebuild` has no value.** The key is added as `.default(...)` with no default named, no row in Derived Budgets, no PRD amendment. It is the price of a new money path. Worse: `debitCredits` calls `assertPositiveInt(p.cost)` (`respin/packages/credits/src/ledger.ts:337`), so a `0` rebuild price throws an unrelated error at the debit rather than refusing cleanly, and no failure-mode row covers it. · Fix: name the number, cite or derive it, amend the PRD §4G credit-cost list in the same change (D-M2-12's own precedent).
- ❌ **Task 7 — the write surface is only half-enumerated.** AC-3/AC-4 enumerate `ProfileScope.accessors` + `capabilities`. `WorkspaceScope.createProfile()` is neither, so it joins no completeness set and gets no breach validator; `accessors.creatorProfiles()` joins the *existing* `WorkspaceScope` enumeration only if the implementer thinks to add it there, which no task says. A creator-data **write** path outside the enumeration is round-2 tenancy BLOCK 3 exactly, one level up. · Fix: name both in AC-3's minimum set and give `createProfile` a both-axes breach case.
- ⚠️ Verification step 1 ("un-caged code -> every P1-P7 assertion fails") is not achievable for P3, P5 and P7, which cannot compile before the types they enumerate exist; the suite errors rather than the assertions failing, while AC-16 demands recorded red output per test. · Fix: state the form (stub types; record the compile failure as the red state).

### Phase 2 — `packages/llm`

- ❌ **The phase contradicts itself on the owner's priced-rebuild decision, in four places.** F7/F9, task 7, AC-7b, AC-15 and AC-16 implement a priced, debited rebuild. Against them: **Out of Scope** says *"do not add a credit debit here (D-M2-2 prices onboarding at 0 — the debit call site is M3's)"*; the **Handoff** pins `LlmLimitExhaustedError // once per profile, PRD.md:135`; **Verification step 9** says the second inference is *"refused with `LlmLimitExhaustedError`"*; **AC-7** says *"the limit refuses **before** any network call"*. An implementer working the Out-of-Scope list ships no debit at all; one working step 9 ships the refusal the owner overturned. · Fix: rewrite all four, and decide whether `LlmLimitExhaustedError` still exists.
- ❌ **AC-1 and AC-15 are mutually exclusive.** AC-1 (and D-M2-2b) require a `model_usage` row after **every** call, success or failure. AC-15 requires that "if the debit fails, **no usage row** and no inference result persist". A rebuild refused for insufficient balance is a call whose tokens were already spent: AC-15 deletes its record. That is spend under-reported in the direction that flatters the margin dashboard — the exact dishonesty `cost_state='unknown'` exists to prevent — and because the attempt row rolls back with it, the attempt is never consumed, so the creator retries without limit.
- ❌ **Nothing orders the balance check before the vendor call.** AC-7's "refuse before any network call" is attached to the *limit*, which no longer governs build #2. The specified sequence for a rebuild is therefore: call Anthropic, open a transaction, discover the balance is short, roll back. With the item above: unbounded vendor spend at zero revenue, no record, no attempt consumed — the same shape as the spend loop this phase congratulates itself on closing for schema-invalid 200s.
- ❌ **The attempt-counting rule contradicts AC-7c.** The rule is "distinct `attempt_id`s in `model_usage`". D-M2-2b writes a row for a 429 and a 5xx too. Unless the count filters on `outcome`, a rate-limit blip permanently consumes the creator's included build — the defect D-M2-2b was written to fix — and no filter is stated, over an enum whose values are undefined (phase 1 task 3).
- ⚠️ The Files table omits `src/pricing.ts` and the `pause`/`pricing`/`logging` test files that tasks 7c/7d/11 and AC-15/16/17 require. `WorkspacePausedError` already exists in `packages/credits`; whether phase 2 re-exports it or defines a second class of the same name is unstated — an `instanceof` hazard across three packages.
- ✅ Tasks 1-6 and 8-12 are otherwise executable; the keyless build, stub adapter, log allowlist and config-defaults work is specified well enough to build from.

### Phase 3 — `packages/brain`

- ❌ **Task 11 is unimplementable as written.** "Confidence cut-points into `respinConfigV1` + its config data step; phase 3 owns the `brain.*` keys." D-M2-5 deleted the enum: there are no cut-points, no thresholds, and no named `brain.*` key anywhere in the plan set. The implementer must either invent config keys — re-introducing the graded label AC-6b forbids — or skip a task the Definition of Done counts.
- ❌ **The evidence count is vacuous under this phase's own contract.** D-M2-5 defines N as "the number of **distinct `onboarding_inputs` rows** whose cited quote passes the check". The pinned `FieldProvenance` carries exactly one `quote`/`inputId`/`startOffset`/`endOffset` per field. N can therefore only ever be 0 or 1, so every grounded field renders "evidence: **1** of M posts" forever, and AC-6's perturbation test passes against a constant. · Fix: provenance carries a quote **list**, or the label drops its "of M posts" claim.
- ❌ **D-M2-10 is implemented voice-only, again.** The decision says a `reference` quote may never be provenance on **any writable brain kind**, and that no brain-doc content string may be a verbatim substring of any reference input. F12 and AC-13 say `voice`. The inverted-substring half has no task and no AC in this package at all — it exists only as phase 5's AC-21, at the app layer. Round 2 blocked this exact pair: voice-only, and guarded at the caller.
- ❌ **`activateNewVersion` cannot satisfy phase 5's AC-4.** Phase 5 requires activation to be all-or-nothing across the three writable kinds. The pinned signature takes **one** `kind` and **no transaction handle** (unlike `writeBrainDoc(d, tx)`), so three-kind atomicity is not expressible in the contract phase 5 is handed. · Fix: expose a tx-composing or multi-kind form, and pin it here.
- ⚠️ Task 3 still says "the confidence **derivation rule**"; the *Least confident* line still argues the agreement clause the plan deleted; AC-14's table row has no evidence cell.
- ✅ Tasks 1-2, 4-4d and 5-10 are executable, and the enumeration/mutation specs (AC-14, AC-15, AC-16) are the strongest writing in the plan set.

### Phase 4 — framework library seed

- ❌ **The phase cannot start when the master plan says it can.** Every task writes into `respin/packages/brain/**`, and the Files table marks `packages/brain/src/{index,app-server}.ts` as *Modified*. `respin/packages/` today contains `auth, config, credits, db` only — verified. `packages/brain` is scaffolded by **phase 3 task 1**. Phase 4 declares "Depends on: **Phase 1**" and the master plan says "Phases 3 and 4 may run alongside each other after 1". · Fix: declare the dependency on phase 3, or move the scaffold into phase 1.
- ⚠️ AC-12's evidence ("`db:seed-library` runs against a non-local host and inserts no dev user") is not a runnable assertion as written. Phase 3 labels its one vacuous AC honestly, so this one's silence is inconsistent. The handoff's "NOT in the seed file… computed AT LOAD" comment sits directly above `testedCaveats`, reading as if that were the derived field.
- ✅ Otherwise every task is executable, and AC-3/AC-8's four-planted-shapes-plus-stated-residual pattern is the best-specified work in M2.

### Phase 5 — onboarding wizard

- ❌ **Task 3b targets a package that does not exist and that no task creates.** `respin/packages/trends/src/link-resolver.ts`. There is no scaffolding task (package.json, tsconfig, vitest, `pnpm-workspace.yaml` member, eslint default-deny + facade grant), the path is absent from the phase's *Files to Create / Modify* table, and `app/**` may import packages only through `@respin/*` names — so the wizard cannot legally call the resolver as planned. AC-12 is the compliance gate's load-bearing criterion and names no test file. · Fix: scaffold `@respin/trends` here, or relocate the resolver to a package that exists, and add every path to the Files table.
- ❌ **The brain content field set is undefined.** Task 5b builds "a closed allowlist of inferable brain fields"; task 6 renders "per field, the verbatim quote… confirm/edit"; phase 3 AC-17 refuses out-of-allowlist keys; phase 6 builds per-kind editors and a per-field provenance panel. No phase enumerates the field keys of `voice`/`strategy`/`killtest`, and no phase cites `PRD.md:42` — the only place the four documents' contents are sketched. `BrainDocContent = Record<string, unknown>`. The most-consumed data contract in M2 is unpinned, and four acceptance criteria are defined over it.
- ❌ **The priced-rebuild decision is missed in five places here too.** F11 is correct. Against it: the Failure Modes row *"Re-inference limit exhausted -> Refused with no network call"*; **AC-7** (same); **AC-17** *"A second inference for the same profile is refused"*; **Out of Scope** *"Do not add a credit debit (D-M2-2 prices this at 0)"*; and the *Least confident* line, still reasoning from "only one inference included".
- ❌ **AC-18 has no implementing task and no mechanism.** "A specific the submitted inputs do not state renders as `[check]`, never as a fact." The substring validator proves a quote *exists*; D-M2-5's own rationale says counting quote existence cannot show quote *support*. Nothing in any phase detects an unsupported specific. As written the criterion is unsatisfiable, and the cheapest resolution at implementation time is to weaken it.
- ❌ **AC-13 demands pause refusals on writes that have no guard.** It names profile creation, input append and draft writes. Those paths are built in `packages/db` (phase 1 F10 capabilities), which has no pause check and no task adding one; D-M2-11 places the refusal only inside `packages/llm` and `packages/brain`. Three of the five named writes are guarded at the app layer only — the placement round 2 blocked.
- ⚠️ Stale captions references survive the owner's drop: the Failure Modes boundary row reads "Wizard -> YouTube oEmbed **/ captions API**", and the degraded-mode paragraph says "If YouTube's oEmbed **or captions API** is unavailable". Task 5b writes into `packages/brain` and 3b into `packages/trends` while the phase presents itself as app-layer. The Files row "`packages/config/src/schema.ts` — Modified (**if not done in P1**) `profileCaps`" violates D-M2-7b's "no key is added in two phases". Tasks name `respin/lib/routes.ts` and `respin/tests/gate-completeness.test.ts`; neither appears in the Files table, which instead lists two files no task names.
- ✅ Tasks 1-2, 4 and 6-14 are executable, and task 12's "the profile-scoped half needs a **new** mechanism" is correct: `respin/tests/gate-completeness.test.ts:112` really does enforce only `["requireUser","requireAdmin"]` — verified.

### Phase 6 — brain editor + export

- ❌ **`performance_meta` is still writable from `app/**`, through phase 1's own capability.** T2 argues the app-layer scan is near-vacuous because "`app/**` cannot import `brainDocs` at all". True — but phase 1 puts **`ProfileScope` on the app eslint allowlist** and hands app code `capabilities.writeBrainDoc(d, tx)`: a raw `brain_docs` insert with no kind restriction, no provenance validation, no field allowlist and no pause check. `respinDb` is already allowlisted (`respin/eslint.config.mjs:29`), so a server action can open the transaction it needs. Phase 3's guards (AC-4, AC-12, AC-17, AC-19) and its sole-call-site enumeration (AC-15/AC-16, scoped to `packages/brain/src`) all sit outside that path. Round 1's `performance_meta` finding, re-opened one layer down by round 3's schema consolidation. · Fix: type `writeBrainDoc` to `WritableBrainKind` + draft status at the phase-1 layer, or keep it off the app allowlist so `packages/brain` holds the only handle.
- ⚠️ F4, task 5 and AC-12 all say "derived **confidence**" — the word D-M2-5 removed from M2. Tasks 11-13 name `respin/tests/import-boundary.test.ts`, `respin/lib/routes.ts` and `respin/tests/gate-completeness.test.ts`; none appear in the Files table.
- ✅ Tasks 1-10 and 14 are executable; AC-7's "the plant is a runtime cast, because a plain plant would fail `tsc` and the redness would come from the compiler" is exactly the right level of care.

---

## Pre-mortem

Assume M2 shipped and failed. The most likely causes, each traced to a receiving task or recorded as a finding.

- ❌ **Every activation fails in production with `ProvenanceMismatchError` while every test stays green.** D-M2-4 validates a quote "as a literal substring of the stored input **at its recorded offsets**", at activation and again at export. Nothing states the offset unit (UTF-16 code units in `String.prototype.slice` vs code points in Postgres `substring()` — they differ on **every emoji**, and creator posts are full of emoji), whether validation runs in JS or SQL, or that `content` is stored byte-verbatim (a textarea submits CRLF; any trim or normalise between render and storage shifts every offset). Fixtures are clean ASCII; production is not. **No receiving task.** · Fix: pin the unit and the normalisation rule in phase 1 F4; add an emoji/CRLF case to phase 3 AC-4.
- ❌ **A Free creator's rebuild burns Anthropic tokens and leaves no trace, repeatedly.** Composite of phase 2 AC-15's rollback, the missing pre-flight balance check, and R-21's structurally-zero Free balance. **No receiving task.**
- ❌ **The inference request times out at the proxy after the vendor billed us.** Onboarding assembles 5-10 pasted posts into the product's longest-running request; there is no job runner (codebase review §2: D-M1-4 lands at M4); and no phase states a request timeout, a `maxTokens` value, or an input-length cap on `onboarding_inputs.content`. If the process dies between the vendor response and the `model_usage` commit, D-M2-2b's "every call writes a row" is silently false and the spend is invisible. **No receiving task.**
- ❌ **A creator finishes onboarding and their brain is a paraphrase of a competitor's post.** The inverted-substring check — the only thing stopping third-party text appearing in a field's *value* — is one app-layer AC in phase 5 with no owning task and no package-layer counterpart, and the reference-provenance bar covers `voice` only. **Receiving task missing** (blocking finding B9).
- ❌ **An admin edits `llm.model` in `/admin/config` and onboarding stops for everyone.** D-M2-13's fail-closed lookup is the right answer and phase 2 AC-8 tests it, but the operational consequence — a config save with no deploy takes the product's entry flow down with a typed error nobody sees until a creator hits it — has no Failure Modes row and no admin-side validation. Partially received; state it.
- ❌ **A `[check]`-worthy invented specific ships as a fact.** Phase 5 AC-18: no mechanism produces `[check]`. **No receiving task.**
- ✅ **Two brains active at once for one (profile, kind)** — absorbed: D-M2-3's partial unique index, phase 1 AC-8 and phase 3 AC-3, both under real Postgres.
- ✅ **A member of workspace A reads workspace B's brain, or a Studio seat reads a sibling profile's** — absorbed: phase 1 AC-4 now carries **both** fixture axes and both mutations. The same-workspace axis (round-2 tenancy BLOCK 2) is genuinely closed.
- ✅ **A config-key addition takes the Stripe webhook down** — absorbed and improved: `.default(...)` keys remove the ordering window entirely, and AC-11 is red against the `CONFIG_V1_SEED`-appending implementation that would silently drop paying subscribers to `{tier:"free", reason:"unmapped_price"}`. The blast-radius number is now right: five `getActiveConfig(tx)` sites, verified at `webhooks.ts:588,786,1082,1197,1283`.
- ✅ **A model-fabricated quote is stored as provenance** — absorbed: `onboarding_inputs` is a real immutable table and the check runs inside the activation transaction (subject to the offset finding above).
- ✅ **A creator's brain is activated with fields they never saw** — absorbed: D-M2-5b, applied consistently in phases 3, 5 and 6 (AC-5 in all three, each red against the narrowed form). The cleanest cross-phase propagation in the plan.
- ✅ **The library seed leaks a person** — absorbed: phase 4, four planted shapes, stated human residual.
- ✅ **A scraper ships** — absorbed at the *rule* level: D-M2-9 is endpoint-scoped now, with four named mutations and a generative corpus. Blocked only on the missing package (B5).
- ✅ **Onboarding runs during a pause** — absorbed for inference and activation (phase 2 AC-17, phase 3 AC-19, both with the `{open period, mirror canceled}` drift fixture that discriminates the predicates). **Not** absorbed for the three phase-1 write paths.

---

## Mechanical consistency

**Coverage parity**

- PASS — `ProfileScope.accessors`/`capabilities` name their defining set and match the handoff 1:1 (phase 1 AC-3's named minimum).
- PASS — brain kinds: 4 declared / 3 writable, now consistent in phase 3 (F1, `WritableBrainKind`), phase 5 (AC-1, AC-4, task 7), phase 6 (AC-6) and master Exit Demonstration item 6. Round-2 learning BLOCK 1 is genuinely closed; I checked all five sites.
- FAIL — phase 5 AC-13 enumerates five M2 writes; package-layer guards exist for two.
- FAIL — `WorkspaceScope.createProfile()` belongs to no completeness set.
- FAIL — D-M2-10's defining set is "any writable brain kind"; phases 3 and 5 implement `voice`.

**Closure**

- FAIL — files in *Implementation Tasks* missing from *Files to Create / Modify*: phase 2 (`src/pricing.ts`, `tests/{pause,pricing,logging}.test.ts`), phase 5 (`packages/trends/src/link-resolver.ts`, `packages/brain/src/inferable-fields.ts`, `lib/routes.ts`, `tests/gate-completeness.test.ts`), phase 6 (`lib/routes.ts`, `tests/gate-completeness.test.ts`, `tests/import-boundary.test.ts`). Reverse direction: phase 5's table lists `tests/routes.test.ts` and `tests/page-wiring.test.tsx`, named by no task.
- PASS — every Owner agent (`respin-engineer`) and every named reviewer exists in `.claude/agents/` (verified).
- FAIL — acceptance criteria with no satisfiable evidence pointer: phase 5 AC-18, phase 4 AC-12, phase 3 AC-14 (empty evidence cell).
- PARTIAL — requirement IDs reconcile master to phase headers **except** REQ-G04/G06/G08, now load-bearing (the debit; pause read-only) and listed in neither.
- PASS — every phase carries a non-empty *Least confident* line. Phase 3's is **stale** (see probes).

**Deferral ledger**

- PASS — DL-1..DL-9 each name a receiving milestone with a resolvable trigger; DL-7's cache-key constraint and DL-8's "a test-time guard stops being enough the moment M4 adds a second writer" are the two best rows in the plan.
- FAIL — the **dropped captions leg** has no deferral row, no Non-Goals row and no decision entry, while `tech-spec.md` §4 still specifies it for the `submitted` adapter. A capability removed from the doc set by a plan sentence is behaviour-by-absence — the thing R-28 exists to stop, and which phase 2 task 1 cites.

**Handoff contracts**

- PASS — 1 -> 2/3/5/6 (`ProfileScope`, the brands, `writeBrainDoc`): pinned and cited.
- FAIL — 1 -> 4: phase 4 consumes `packages/brain`, created in phase 3, cited nowhere.
- FAIL — 3 -> 5: `activateNewVersion` cannot express phase 5 AC-4's three-kind atomicity.
- FAIL — the export sets of `@respin/brain/app-server` and `@respin/llm/app-server` are pinned in no phase, while four ACs assert properties of them (phase 2 AC-9, phase 3 AC-12, phase 4 AC-14, phase 6 AC-7).
- FAIL — phase 5 writes `brain_docs.status='draft'` against an enum phase 1 never enumerates, and hedges with "added as `0012_*`/`0013_*` **in this phase**", contradicting "phase 1 owns the whole M2 schema".

**Verifiability** — PASS overall: 105 criteria, nearly all PASS/FAIL with a named red state. Exceptions: two unsatisfiable pairs (phase 2 AC-1 vs AC-15; phase 5 AC-7/AC-17 vs F11), two unsatisfiable singletons (phase 5 AC-18; phase 3 task 11's absent keys), and one vacuous-by-construction criterion the plan does **not** label (phase 3 AC-6, perturbation over a count that cannot vary). The honest labelling of phase 3 AC-10 and phase 6 T2/task 11 as vacuous is real and creditable — the labelling is simply not complete.

**Number provenance**

- PASS — profile caps, post counts, doc kinds, seeded frameworks, and the <20-minute claim (correctly demoted to evidence with a named population and a "not yet measured" default).
- FAIL — `creditCosts.onboardingBrainRebuild`: a price with no value and no citation, on a new money path.
- FAIL — recurring cost rows: the Anthropic bound ("1 inference x profiles onboarded") is falsified by priced rebuilds; the YouTube row names the dropped captions leg and calls the public oEmbed endpoint "YouTube Data API… quota-limited" (it needs neither key nor quota project).
- FAIL — no `llm.maxTokens` value, no input-length cap, no latency budget: three unstated numbers on the only path that spends money per request.

---

## Least-confident probes (evidence, not opinion)

- **Phase 1 — "transactional `DROP CONSTRAINT` may not be available to the harness."** **The bet HOLDS.** I ran it against the installed harness (`@electric-sql/pglite ^0.3.0`, `respin/packages/db/package.json:25`): `BEGIN; ALTER TABLE c DROP CONSTRAINT c_fk; INSERT cross-parented row; ROLLBACK;` gave rows-inside-tx **1**, rows-after-rollback **0**, constraint-restored **true**. P4's cross-workspace axis runs in the default suite. The plan's permitted Docker-only fallback is unnecessary and should be **deleted**, because taking it would move the one test the design calls decisive into a loud-skip suite — the failure mode the line itself names.
- **Phase 2 — the installed SDK's usage and cost surface.** Unprobeable (`@anthropic-ai/sdk` is not installed). **Partially holds:** `usage_raw jsonb` preserves the vendor's evidence, but the mitigation the line names — "the price map must be able to grow components without a schema break" — is contradicted by the price shape the same phase pins (two fixed scalars per model, under a `.strict()` config). The hedge is asserted, not designed.
- **Phase 3 — "that *agreement* survives contact with real inference."** **STALE — the bet no longer exists.** D-M2-5 deleted the agreement clause, and this line's own proposed fallback ("drop the word, render a count") is what the plan already adopted. Phase 3 therefore has no live declared weakest bet, and its real one — that a single-quote provenance record can carry a count over posts — is unnamed and, on my reading, false (C2).
- **Phase 4 — "neither *personal-specific* nor *causal claim* is fully detectable by a scan."** **HOLDS**, and is the model for the rest: the residual is a named human read, carried into the Completion Criteria and the ledger. Gap: the reader is never named, and the same section carries an unnamed "founding creator" confirmation.
- **Phase 5 — "a thin first brain compounds with the one-inference limit."** **HOLDS, and got worse under the owner's decision.** On Free — the default signup tier — R-21 means the balance is structurally zero until M3, so a *priced* rebuild is refused for every Free creator. For M2's entire realistic population the priced decision is identical in effect to the permanent refusal the owner rejected, now with a top-up prompt attached. The prompt at least is not a dead end: `createPackCheckoutUrl` is owner-gated but not subscription-gated — verified. The compounding's only outlet is the manual-entry path, which no AC ties to the thin-brain case.
- **Phase 6 — "optimistic concurrency vs the partial unique index."** **HOLDS** and is well aimed. Note the index will rarely be the surfaced conflict: two activations of the same kind serialise on the deactivate-then-insert, so `expectedActiveVersion` fires first. AC-4 should assert *which* error surfaced, not merely that one did.

---

## Consolidated reviewer findings

Merged with rounds 1-2, deduplicated, ordered by what blocks first. Round-2 items I **verified closed** are listed at the end so they are not re-worked.

### Blocking (11)

| # | Finding | Where | Severity / Confidence |
|---|---|---|---|
| B1 | Priced-rebuild decision applied in some paragraphs, contradicted in others | P2 Out-of-Scope, Handoff, Verification 9, AC-7; P5 AC-7/AC-17/Failure-Modes/Out-of-Scope/Least-confident; master Exit Demo 8, Non-Goals, budget bound | High / Certain |
| B2 | AC-1 and AC-15 mutually exclusive — a failed debit erases the spend record | P2 | High / Certain |
| B3 | No pre-flight balance check before the vendor call: unbounded spend, no record, attempt not consumed | P2, P5 | High / High |
| B4 | Rebuild price has no value and no provenance; `assertPositiveInt` makes `0` a crash | P1 task 9, master Derived Budgets | High / Certain |
| B5 | `packages/trends` does not exist and no task creates it; AC-12's home is unreachable from `app/**` | P5 task 3b | High / Certain |
| B6 | Phase 4 writes into `packages/brain`, which phase 3 creates, while both are declared parallel | P4 header, master phase table | Med-High / Certain |
| B7 | The brain content field set (keys per kind) is undefined in every phase; four ACs depend on it | P3, P5, P6 | High / High |
| B8 | `capabilities.writeBrainDoc` is reachable from `app/**` and bypasses every `packages/brain` guard | P1 handoff vs P6 T2 | High / High |
| B9 | D-M2-10 implemented voice-only; the inverted-substring half exists only at the app layer | P3 F12/AC-13, P5 AC-16/AC-21 | High / Certain |
| B10 | Quote offsets: no unit, no normalisation rule — production-wide activation failure with green tests | P1 F4, P3 AC-4 | High / High |
| B11 | `activateNewVersion` cannot express phase 5 AC-4's three-kind atomicity | P3 handoff vs P5 AC-4 | High / High |

### Change (14)

**C1** The word *confidence* survives D-M2-5 in eight places (P3 task 3, task 11, Least-confident; P5 F5, task 6; P6 F4, task 5, AC-12; master Exit Demo 4 and phase table). · **C2** The evidence count is vacuous under the single-quote provenance record. · **C3** Two doc-set deviations with no decision entry and no amendment: REQ-B02's "confidence level" ([Must], `PRD.md:67`) and `tech-spec.md` §4's captions leg — the treatment phase 1 task 13 correctly applies to "lite brain". · **C4** Attempt counting must filter on `outcome`, whose values are undefined. · **C5** Pause guards missing on `createProfile`, `appendOnboardingInput`, `writeBrainDoc`. · **C6** REQ-A01's cap is enforced only at the app layer, with no constraint and no transactional count — phase 5's own edge table anticipates the race and assigns it to no mechanism. · **C7** Neither `app-server` facade's export set is pinned, though four ACs assert properties of them. · **C8** `brain_docs.status`, `purpose` and `cost_state` value sets undefined; phase 5's `0012_*` hedge re-opens the retro-fit the consolidation was for. · **C9** Nine task-named files absent from Files tables (P2/P5/P6). · **C10** `profileCaps` claimed by two phases, against D-M2-7b's own "one phase per key". · **C11** Phase 5 AC-18 has no mechanism and no task. · **C12** No timeout, `maxTokens` or input-length number anywhere on the paid path; no job runner until M4. · **C13** `createProfile` joins no completeness enumeration. · **C14** Phase 3 task 11's config data step has no keys to migrate.

### Note (13)

**N1** Master *Plan Review Log* records round 1 only; round 2's four BLOCKs appear nowhere in the plan set, and the `plan-reviewer` row still says "deferred to round 2". · **N2** Codebase review §9 still says "six" webhook sites and "a low-confidence field cannot activate unconfirmed" — both superseded; the master's R10 row also still says six. · **N3** The YouTube cost row is wrong twice: it names the dropped captions leg, and the public oEmbed endpoint is not the YouTube Data API and needs neither key nor quota project. · **N4** The Anthropic spend bound is falsified by priced rebuilds. · **N5** `model_usage.profile_id NOT NULL` forecloses M3's REQ-H02 landing demo, which has no profile — worth a stated deferral rather than a surprise. · **N6** Phase 1 verification step 1's red-first ritual is unachievable for the type and scan tests as written. · **N7** Phase 4 AC-12 is near-vacuous and unlabelled where phase 3 AC-10 is labelled. · **N8** Phase 4's derived-confidence comment sits above the wrong field. · **N9** REQ-G04/G06/G08 appear in no requirement list. · **N10** D-M2-3..D-M2-10 and D-M2-13 are recorded in no `decisions.md` task; D-M2-9 most needs one. · **N11** The bound facade shape of `hasOpenPause` is unstated — the package function takes a db-or-tx plus a `VerifiedWorkspaceId`. · **N12** `WorkspacePausedError` already exists in `packages/credits`; re-export vs redefine is unstated across three packages. · **N13** Phase 3 AC-14's row has no evidence cell.

### Verified closed since round 2 — do not re-work

The submitted-input store; persisted `model_usage` (success and failure, one row per HTTP call, `cost_state='unknown'`); phase 2 under the cage's stop condition; the `performance_meta` refusal at the layer where the path is built (subject to B8's new door); the brand cast **and** the spread-forge (P7's five mutations); the engineering/evidence split with a named population; P4's fixture mechanism — **and I proved it runs in the default harness**; P4's same-workspace axis; the five-vs-six webhook correction; `migrate-config` merging into raw jsonb, with AC-11 red against the `CONFIG_V1_SEED`-appending implementation; the `.default(...)` route that removes the ordering window entirely; D-M2-5b applied consistently in three phases; the three-writable-kinds correction applied consistently in four places; the endpoint-scoped (not host-scoped) allowlist rule with a generative corpus.

---

## Verdict

**NOT READY.**

Ordered fix list. The first four unblock everything else, and three of them are one decision each rather than a survey:

1. **Sweep the priced-rebuild decision through every document** (B1, B2, B3, B4, C4). Decide and write down: the rebuild price and its provenance; that the balance is checked **before** the vendor call; that the usage row is written and committed **before or independently of** the debit, so a refusal never erases the spend; whether `LlmLimitExhaustedError` still exists; and which `outcome` values make an attempt billable. Then delete the five stale refusal paragraphs.
2. **Sweep the paste-only decision through every document** (B5, C3, N3). Scaffold `@respin/trends` — or relocate the resolver to a package that exists — remove the two captions references in phase 5, add the Non-Goals and deferral rows, amend `tech-spec.md` §4, and record D-M2-9 in `decisions.md`.
3. **Close the two write-path doors the consolidation opened** (B8: restrict or hide `writeBrainDoc`; C5/C6/C13: pause and cap enforced where the path is built, and `createProfile` inside a completeness set).
4. **Pin the three missing contracts** (B7: brain field keys per kind, cited to `PRD.md:42`; B11: a tx-composing or multi-kind activation; C7/C8: the two facade export sets and the four enum value sets).
5. **Fix the provenance model's two defects** (B10: offset unit plus normalisation rule, with an emoji/CRLF case in phase 3 AC-4; C2: a quote list, or drop the count's "of M posts" claim).
6. **Finish the D-M2-10 propagation** — every writable kind, and the inverted-substring check inside `packages/brain` (B9).
7. **Fix the phase graph** — phase 4 depends on phase 3, and the master's parallelism sentence changes with it (B6).
8. **Retire the stale word and the stale line** — `confidence` in eight places, phase 3's *Least confident* line, phase 3 task 11 (C1, C14), plus C3's decision entries and PRD amendment.
9. **Sweep the notes** — N1..N13, mostly one line each.

A fourth round should be scoped to **phases 2 and 5**, where every blocking finding except B6, B8 and B10 lands, plus one sweep pass over the master plan's stale claims. Phase 1's tenancy work — the part two rounds fought over, and the part everything else waits on — is, once C5/C6/C13 and B8 are closed, ready: the fixture mechanism is real, both axes are covered, and I verified the harness can run it.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
