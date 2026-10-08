# Phase card — Phases 1 and 6, session of 2026-09-20

**Scope of this card:** P1-R4 (the shared claim-scan helper and its populations) and the part of Phase 6 this session executed. **Not a phase completion.** Phase 1 requirements R1, R2, R3, R5, R6, R7 and R8 are untouched; two Phase 6 requirements are deliberately owed. See *What is owed*.

**Re-homed by R-132** from the visual-v2 Phase 1 gate, on the owner's decision of 2026-09-20. The pre-rewrite measurements are in [`phase-1-and-6-instruments.md`](phase-1-and-6-instruments.md), dated ahead of the copy changes as Phase 6 Task 1 requires.

**Gates: none run. No batch approved, none spent.** Every statement below is an engineering claim backed by a named run, not a review verdict.

---

## 1. The entry gate

All commands run from `respin/` on 2026-09-20, after the last edit in this session.

| Command | Result |
|---|---|
| `pnpm typecheck` | pass — root `tsc --noEmit` plus all seven packages |
| `pnpm lint` | pass — `eslint .`, no output |
| `pnpm build` | pass — `/sign-up` moves from `○ (Static)` to `ƒ (Dynamic)`, the expected consequence of reading `searchParams` |
| `pnpm preflight` | pass — `preflight ok: brain_content_registry` |
| `pnpm db:check` | pass — `Everything's fine` |
| `pnpm worker:typecheck` | pass — no output |
| `pnpm test` | see below |

### The test run, stated exactly

Run 3 (23:38:49 start, 525.68s): **221 test files passed, 23 skipped (244); 5,629 tests passed, 119 skipped (5,748), 0 failed** — and **1 error**, reported by vitest outside any test and surfacing in a `processTimers` frame, which made `pnpm test` exit non-zero. That is not a green run and was not reported as one.

Run 4 (23:47:54 start, 533.89s) was run for that reason, capturing the whole log: **exit 0, 221 test files passed / 23 skipped, 5,629 passed / 119 skipped, zero failures and zero errors** — `grep -c "Unhandled\|Errors "` over the full log returns 0. The tree was not edited between run 3 and run 4.

**So the honest statement is: the suite is green, and it carried one non-reproducing out-of-test error on the run before.** The error's own text is lost — run 3's captured output retained only the tail, and it was a `processTimers` frame, i.e. something rejecting in a timer after its suite had finished. It is recorded here rather than rounded away, because "it passed the second time" is exactly how a real flake gets written out of a record. Nothing in this session's changes introduces a timer. **Owed:** if it reappears, capture the full log and name the suite.

The two earlier full runs in this session each ended with failures that were mine and are now fixed:

- Run 1 (23:07:58): 3 failed — all three were the repo's own comment-integrity guards catching claims I had just written. `tests/symbol-citations.test.ts` on `noSeatClaim` and `metadataBase` (symbols this workspace does not have), `tests/source-citations.test.ts` on a cited `tests/source-files.test.ts` that does not exist, and `packages/db/tests/connector-verified-closure.test.ts` on a marketing comment that named the `connector_verified` literal without being listed. This is CLAUDE.md's 2026-07-30 lesson firing on schedule: the comment that explains a fix is written at the moment you believe the property most and have verified it least.
- Run 2 (23:28:03): 1 failed — `runSampleSpin`, a function name I invented for a comment; the symbol is `runPublicSampleSpin`. The same comment's line citations (`:220-239`, `:248`) had been shifted by the comment itself and were re-measured to `:230-249` and `:258` — the 2026-09-16 lesson, in the same edit.

Docker concurrency suites loud-skip: no `TEST_DATABASE_URL` was set, so the 23 skipped files include them. **The money invariants were not proven under real concurrency in this session.**

---

## 2. What was built

### The instrument (P6-R2)

`respin/tests/landing-pricing.test.ts` pins every `PRICING[].lines[]` entry to an authority it evaluates against the tree, both directions. It found three unpinnable lines, **none cited by any reviewer across four batches**, including a **fourth unshipped capability** on the pricing table: Studio's seats, which have no config key, no cap and no invite path. The full red list and the authority table are in the instruments file.

Copy fixes closed all three: run `pnpm vitest run tests/landing-pricing.test.ts`, 2026-09-20, **21 passed**.

### P1-R4's gaps

Population, shapes, census, metadata producers and metadata fields — each measured, each proved failable with a plant. Detail and the plant transcripts are in the instruments file. Headline numbers, all from runs on 2026-09-20:

- Re-invention scan: was `tests/` only (513 files outside it). Now every root, asserted against disk, plus root-level modules. A planted `worker/__plant-probe.ts` turned **4 of 41** assertions red; removed, 41 passed.
- Consumer census: **22 canon consumers, 6 with no plant**, recorded as a ratchet.
- Marketing metadata: layouts added to the population, and every string in the metadata object read rather than `title`/`description`. One planted `app/(marketing)/layout.tsx` with a claim in `openGraph.description` turned **2 of 31** red; removed, 31 passed.
- `MARKETING_CLAIMS`: the "derived" claim struck from the docblock and corrected in R-132. **Measured 17 of 17** plausible sales sentences pass.

### Copy, from Phase 6's requirement list

| Requirement | What changed |
|---|---|
| P6-R3 | "Seven modes, one output shape" scoped to the four script modes; the clip-inventory promise dropped — there is no media/clip/asset table in `packages/db/src/`; the kill-test sentence made true (one rewrite, then refusal, and the run is still debited, per `MAX_GENERATION_ATTEMPTS = 2` and `decideAfterKillTest`) |
| P6-R4 | The meter sentence names the non-credit meters (profiles, tracked niches, concurrency, mode access). The tier travels: every CTA carries `?plan=<key>`, `/sign-up` validates it against `PLAN_KEYS`, and the form states the plan **and** that the account is still free |
| P6-R5 | The `[check]` sentence replaced with `TRACEABILITY_LIMIT_NOTE`'s own wording — it *offers* a marker instead of changing your words, and the check is about provenance, not truth |
| P6-R6 | The demo foot says "ILLUSTRATION, NOT PRODUCT OUTPUT" instead of "REAL OUTPUT SHAPE"; the portal's missing pause stated beside our own pause offer (R-22); the Sample Spin's six **post-admission** refusals no longer print a remedy the limiter refuses |
| P6-R7 | The changelog's "Seven Studio modes" corrected to six plus Spin on Trends, and its result-evidence entry rewritten; the three unsourced landing numbers replaced with config-pinned ones; "MOST CREATORS" replaced with "RECOMMENDED"; the third-party model provider disclosed on the Sample Spin strip |
| D13 (register) | `"Audiences punish it."` removed from all four marketing routes — the finding in the same register file the failed repair cited four items from and did not read |

Two copy claims are now pinned rather than trusted: `tests/landing-pricing.test.ts` asserts the onboarding numbers against `minOwnPostsForVoice`/`voiceCorpusMaxPosts` and asserts "20 minutes" and "MOST CREATORS" stay gone; and it asserts, as absences, that no card sells a seat and none sells a proposal that results would produce.

---

## 3. What is owed

**Two Phase 6 requirements, deliberately not done:**

1. **The conditional "No results of yours have been logged" sentence** (P6-R6). It renders unconditionally at `app/(product)/studio/run-copy.ts:272` and `app/(product)/onboarding/first-ideas/copy.ts:109`, and is false for any creator who has used `/results`. `tests/support/forbidden-claims.ts`'s `studio-no-results-basis` entry *requires* the sentence, so the test cements it. Making it conditional needs a scoped result-count query in the `@respin/db` app-server facade, threaded into two screens, plus a widened `must` pattern — a change that crosses the **Respin brain tenancy** Critical Path. It is not a copy edit and was not smuggled in as one.
2. **The "contact support" decision** (P6-R6), which Phase 6 itself routes to the owner. **Measured 2026-09-20: 47 occurrences across 9 files, and no channel of any kind exists** — no `support@`, no `mailto:`, no `/support` route. Every `/support` grep hit is a `tests/support/…` path inside a comment. The two options Phase 6 names are: add an address, or reword. The phase does not invent a channel.

**Phase 1:** R1, R2, R3, R5, R6, R7, R8 untouched. R4 is complete except for clearing the six plantless canon consumers, which is Task 4's remaining work and is six bespoke edits to large test files.

**Not claimed:** that the marketing-claims class is closed. R-132 §1 records the measurement that says it is not, and `MARKETING_CLAIM_GAPS` holds the escaping shapes with an assertion that keeps the record and the code together. Closing them needs a generator over {subject} × {outcome} × {hedge} — the audit's own round-3 conclusion for `claims.ts`, which says to write the generator and count the escapes **before** fixing anything by hand.

**No browser ran.** Every figure here comes from a named vitest or pnpm run.

---

## 4. Batch 5 reservation — gate `respin-audit-remediation-2026-09-19-phase-1-and-6`

**Owner approval, quoted verbatim (2026-09-21): "approve batch 5 against the re-homed Phase 1/6 evidence".** The same message authorises extending rounds and batches, and asks for the work to finish in one further round.

**History, stated so the batch number is not a guess.** Seventeen evaluations are terminal on the *visual-v2 phase-1* gate (batches 0-2: 9; batch 3: 4; batch 4: 4). R-132 re-homed this work to the remediation phases, so this is the **first** review of it under its own plan; it keeps the number **batch 5** because the owner named it and because the spend it continues is one continuous ledger, not a fresh allowance.

**Reserved slots — 3 evaluations, all PENDING LAUNCH at the time this was written.** Gate intensity is `lean`, so the two `Full gates? = no` paths merge into one consolidated run and the one `Full gates? = yes` path keeps its own reviewer:

| # | Reviewer | Critical Path(s) | Why |
|---|---|---|---|
| 18 | `respin-billing-reviewer` | Respin billing & credits (`Full gates? = yes`, stays separate) | The pin table reads `CONFIG_V1_SEED` allowances/caps/niches/concurrency; the pricing cards were rewritten; every CTA now carries `?plan=` and `/sign-up` validates it against `PLAN_KEYS` |
| 19 | merged `respin-compliance-reviewer` + `respin-learning-reviewer` | Respin spin compliance; Respin learning honesty | The claims canon, `MARKETING_CLAIMS` and its measured gap list, the `[check]`/traceability wording, the Sample Spin refusals and provider disclosure (compliance); the results→proposal line, the connector precondition, the changelog's result-evidence entry, `performanceLearning` (learning) |
| 20 | `code-reviewer` (final consolidator) | all of the above plus correctness and the Definition of Done | Depends on 18 and 19; renders the batch verdict |

**Respin brain tenancy is NOT reserved, and that is a decision rather than an omission.** The one requirement in this work that crosses it — P6-R6's conditional "No results of yours have been logged" sentence — is deliberately **not done** (§3 above), precisely because it needs a scoped result-count query. No query scoping, no `brain_docs` write, no membership/seat code and no admin surface changed; the seat work was the *removal* of a claim. If reviewer 20 finds tenancy-touching code in the frozen set, the batch is short one gate and says so rather than absorbing it.

**Fixed assessment inputs, sha256 (first 8), taken before dispatch.**

| Hash | File |
|---|---|
| `e7debb16` | `respin/tests/landing-pricing.test.ts` |
| `fa84bbf0` | `respin/tests/support/source-files.ts` |
| `e16b93f0` | `respin/tests/support/claim-scan.ts` |
| `e98db76d` | `respin/tests/support/forbidden-claims.ts` |
| `96e87257` | `respin/tests/claim-scan.test.ts` |
| `700ec5da` | `respin/tests/marketing-claims.test.tsx` |
| `a1429a26` | `respin/tests/sign-up-plan.test.tsx` |
| `a20c7fff` | `respin/tests/changelog.test.ts` |
| `d0d297c4` | `respin/tests/sample-spin-copy.test.tsx` |
| `0754ba97` | `respin/tests/activation-view.test.tsx` |
| `83adc422` | `respin/app/(marketing)/pricing-copy.ts` |
| `20d3f5eb` | `respin/app/(marketing)/landing-sections.tsx` |
| `c299d25c` | `respin/app/(marketing)/page.tsx` |
| `1a563dfa` | `respin/app/(marketing)/audiences.ts` |
| `a3ce9b56` | `respin/app/(marketing)/changelog/entries.ts` |
| `20b59fa4` | `respin/app/(marketing)/sample-spin/sample-spin-panel.tsx` |
| `a27b4a17` | `respin/app/(auth)/auth-form.tsx` |
| `91a82004` | `respin/app/(auth)/sign-up/page.tsx` |
| `5501380e` | `respin/packages/credits/src/sample-spin/run.ts` |
| `1f5b8c21` | `docs/initial/decisions.md` |
| `785d68e3` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` |
| `7953b629` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-instruments.md` |

**Entry evidence fixed with them — one measured run each, 2026-09-21, all from `respin/`.** `pnpm typecheck` exit 0 (root plus all seven packages); `pnpm lint` exit 0, no output; `pnpm test` **exit 0, 221 test files passed / 23 skipped (244), 5,629 passed / 119 skipped (5,748), zero failures** and `grep -c "Unhandled"` over the whole captured log returns **0** — the non-reproducing `processTimers` error §1 records from the previous session did **not** recur; `pnpm preflight` → `preflight ok: brain_content_registry`; `pnpm db:check` → `Everything's fine`; `pnpm worker:typecheck` exit 0; `pnpm build` exit 0. Docker concurrency suites loud-skip again — no `TEST_DATABASE_URL` on this run, so **the money invariants are still not proven under real concurrency**, and reviewer 18 is told so rather than left to infer it.

**Dispatch discipline, carried forward from batch 3 where it first held.** All three reviewers are read-only and are told in their prompts that they may not edit, write, plant a mutation, or run any command that writes to the tree. Three reviewers mutating one checkout is what rewrote the tree twice mid-gate in batch 2. A mutation a reviewer wants proven is **named** in its report and run serially by the orchestrator afterwards, with hashes verified either side.

**What batch 5 is specifically asked to distrust.** That the pin table's `holds()` predicates read the tree rather than the copy, and that a pin whose authority is a `repoFile(...).includes(...)` string is not itself a claim about code it never executes. That `MARKETING_CLAIM_GAPS` is an honest scope statement and not an exemption list wearing a docblock. That `source-files.ts`'s `ROOT_DIRS` assertion actually fails when a root appears. That the six-entry `PLANT_OWED` ratchet cannot be satisfied by deleting an entry. That `?plan=` is validated everywhere it is read and never reflected. And that **every number in §1-§3 of this card and in the instruments file re-derives from the tree today** — five stale counts shipped in certifying artefacts two sessions ago.

**One hash in that table is this file's own, and a file cannot hash itself after writing the hash down.** `785d68e3` is this card as the other 21 inputs were measured, before §4 existed. The byte state reviewers are actually given is this card **as of dispatch**, and the orchestrator records that measurement in `ledger.md`'s batch-5 dispatch entry (the card has no ledger section of its own — pointer corrected 2026-09-21) rather than inside the file, which is the only place it can be stated without invalidating itself. The other 21 hashes are self-consistent and are the ones to verify; a mismatch on this card alone means §4 was appended, which is what §4 is.

---

## 5. Owed items closed, 2026-10-07 (engineering only; no gate run)

- **The "contact support" decision is R-176** (owner-delegated 2026-10-05; plan label R-159): one operator-set address, `RESPIN_SUPPORT_EMAIL`, read only in `respin/app/support-contact.ts`. Measured at execution:
  - `grep -rni "contact support" app packages/*/src --include=*.ts --include=*.tsx` found **21 lines in 5 files**, the plan's list. It finds **0** now.
  - `grep -rniE "tell us"` over the same trees found **34 lines in 7 files**: 28 contact promises (rewritten), 4 form prompts (listed as not promises), 2 comments.
  - Both lists are held by site in `respin/tests/support-contact.test.tsx`.
- **The two-branch results sentence, its scoped count accessor and the three prose pins** are built. Their decisions and witnesses are R-174 and R-175 in `docs/initial/decisions.md`, plus `respin/tests/landing-pricing.test.ts`.
