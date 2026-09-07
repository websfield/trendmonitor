# Respin brain tenancy — slice 8c, round 2 (Full gate, final round)

**Readiness: Almost · Grade: B · The two round-1 CHANGEs are genuinely closed — I re-proved both with my own planted mutations, not by reading the fix — but each fix left a smaller defect behind it, and the R-99 gate stranded a rule on the worker that now punishes the creators it no longer applies to.**

**Reviewer:** `respin-tenancy-reviewer` · **Verdict: NEEDS CHANGES** · 0 BLOCK · 2 CHANGE · 7 NOTE

**Scope**: the 39 round-1 fix-pass files in [`8c-review-manifest-round2.md`](8c-review-manifest-round2.md), on the MAIN TREE (HEAD `cc3ed43` + uncommitted). The 134 unchanged files were re-consulted where the fixes moved code under them. **Hash protocol: pre-review 173/173 match; post-review 173/173 match.** No repo file changed under this review; every probe lives in the session scratchpad or in a scratch database I created and dropped.

---

## Movement on every round-1 finding

| # | Round-1 finding | Status | How I determined it |
|---|---|---|---|
| CHANGE 1 | settlement population is "newest claim per item" | **CLOSED** | Ran it. `settleParkedAutopsies` (`pasted-reference.ts:413`) now reads `parkedAutopsyClaimsForProfile`. I planted the `eq(autopsyCacheClaims.profileId, ...)` deletion myself through a vitest transform plugin outside the repo: `packages/db/tests/pasted-reference.test.ts` "CROSS-PROFILE and CROSS-WORKSPACE" went **red** (`expected [ {...}, {...} ] to deeply equal [ {...} ]`). The both-claims-on-one-item case — the exact shape I drove on PGlite in round 1 — is now a green test at `:395`. **New defect introduced: CHANGE A.** |
| CHANGE 2 | private paste feeds the shared library, no decision, no test | **CLOSED** | Ran it. R-99 is recorded (`decisions.md:1341`) and the gate is at `system-spend.ts:1185`. I made the gate unconditional through the same plugin: `system-spend.test.ts` "processes an opaque profile-private claim..." went **red** (`expected [ {...(21)} ] to deeply equal []`), 20/21 others green. The witness is non-vacuous: the private test's `toEqual([])` and the shared test's `toHaveLength(1)` run the **same** `CANONICAL_ANALYSIS`, so the zero is the `rightsScope` condition and nothing else. |
| NOTE 3 | `assemble.ts:56` names `@respin/trends` for a symbol in `@respin/db` | **STILL OPEN**, and it got worse — see NOTE 3-prime | `assemble.ts` is hash-identical in the unchanged 134 set; line 56 still reads "`@respin/trends`' `assertMechanismLevel`". |
| NOTE 4 | `frameworkTrendItemRef` "contains no creator identity" | **CLOSED** | Read `frameworks.ts:1506-1519`. It now says "no creator identity **COLUMN**", states that it *is* a reversible encoding of a `trend_items.id`, and — better than I asked for — discloses the residual itself: "The worker's `assertAutopsyFrameworkCandidate` preflight still runs this on private items to validate content; it persists nothing." Every clause checks out. |
| NOTE 5 | viewer-allowed settlement is sound | **STILL SOUND** | Re-verified the five legs. `mintProfileScope` at `:405` still cages; `ProfileScope.mint` (`with-workspace.ts:1716,1724`) takes `workspaceId` off the **scope**, not the profile row, so the outer and inner mints cannot disagree about which workspace the ledger row lands in. |
| NOTE 6 | `respin/.tmp/` neither gitignored nor eslint-ignored | **CLOSED, and widened past what I asked** | `respin/.gitignore` now has `.tmp/` plus `__*.ts` / `__*.tsx`; `eslint.config.mjs:625-635` matches. `git status --short --untracked-files=all -- respin` shows no stray probe artifact. The convention moved from the `_probe` **suffix** to the `__` **prefix**, which is the class fix rather than the instance fix. |

---

## Findings

### CHANGE A — `respin/packages/db/src/trends-storage.ts:1312,1327` — the new reader hands out a `trend_item_id` it never scoped, under a docblock claiming its scoping is "IDENTICAL" to the reader it replaced

**Verified by running it, at SQL level, against real Postgres.**

The docblock at `:1312` says: *"THE SCOPING PROPERTY IS IDENTICAL to `projectPastedReference`'s claim read: the same `ProfileScope.mint` and the same `(rights_scope='profile_private', profile_id, workspace_id)` triple..."*

The **claim triple** is identical, and I confirmed that. The **scoping property** is not. `projectPastedReference` (`:1345-1348`) derives the claim **from** a row already proven pair-owned and under a `submitted` source (`pastedReferencesForProfile:1256-1262`). `parkedAutopsyClaimsForProfile` (`:1327-1335`) starts at the claim and **selects `autopsyCacheClaims.trendItemId` out**, with no predicate on that column's row at all. Nothing in the schema ties a claim's pair to its item's pair — `autopsy_cache_claims` has an FK to `trend_items(id)` and a separate composite FK to `creator_profiles(id, workspace_id)`, and no constraint relates them (`trends-schema.ts:285,304-310`).

Driven on a fresh migrated database (`respin_0028_probe`, migrations 0000-0028 applied by the real `db:migrate`):

```
ACCEPTED BY THE DATABASE | claim e000...000e | claim_profile 3333...3333 | trend_item_id d000...000d
READER WOULD RETURN      | claim e000...000e |                             trend_item_id d000...000d
ITEM OWNER               | item  d000...000d | profile_id    6666...6666      <-- a SIBLING profile
```

The claim carries profile A's pair; the item it names belongs to profile B; the reader's exact predicate returns it.

**Why this is a finding and not a shrug:** the sibling reader of the same table makes exactly this check. `startAttempt` (`system-spend.ts:963-987`) builds `itemOwnership` from `cacheClaim.profileId/workspaceId` and refuses with "system autopsy cache claim does not match a transcript-ready rights owner" if the item does not match. So the pairing is guarded everywhere the value is *used* — and the one reader that hands the value **out**, across a package boundary (`index.ts:332`), skips it. This is the repo's 2026-07-30 rule in its stated form: guard the class where the path is built, not the field. A correctly-filtered-today bypass is still a finding.

**Live reachability: none, and I checked rather than assumed.** `claimPrivateAutopsyForSystem` (`:647-654`) pair-checks the item before inserting the claim, so no writer creates the shape; `settleParkedAutopsies` destructures `{ claimId }` only (`pasted-reference.ts:417`) and ignores `trendItemId`; there is no `app-server` bind. **Confidence: high on the mechanism, high that it is unreachable today.**

**Fix — and NOT by adding the item join.** Drop `trendItemId` from the return type. The docblock two lines down (`:1320`) already argues for it: *"Returns claim ids and their items only ... the caller is the ledger, and it needs neither."* Adding an `innerJoin(trendItems, ...pair)` would re-narrow the money's population and reintroduce round 1's CHANGE 1 in a new dress — see NOTE 7, where an item lifted to `measured` would vanish from the display reader while its parked claim must still be refundable. Then amend the "IDENTICAL" sentence to what is true: the same mint and the same claim triple; the item is not re-scoped because it is not returned.

### CHANGE B — `respin/worker/system-autopsy.ts:423` — after R-99, a shared-library content rule still parks private pastes it no longer governs (the routed finding)

**Read, plus a grep census I ran.**

`assertAutopsyFrameworkCandidate` runs on **every** analysed autopsy, private included. It calls `prepareAutopsyFrameworkCandidate`, then `prepareContent`, then `assertMechanismLevel` (`frameworks.ts:1460`), whose `MECHANISM_CONTENT_RULES` refuse a handle, a URL, percent/k/M/x/currency-adjacent digits (`metric_unit`, `frameworks.ts:851`), performance nouns and performance phrases. A failure becomes `framework_candidate_invalid` (`:434`), finalized as outcome `analysis_invalid` — a **paid failed attempt**. `AUTOPSY_ATTEMPT_CODE_CEILING` failures park the claim.

**Failure scenario.** A creator pastes a competitor's transcript. The canonical autopsy returns a beat such as *"promise the 10x version before the constraint lands"*. `metric_unit` fires. The attempt is burned. Five such attempts park the claim. `parked` is terminal for `startAttempt` and excluded from `systemAutopsyQueueCandidates`, and a re-paste of the same URL + transcript lands on the same dead claim (code review C6). **The creator's money is made whole** — R-98's settlement refunds the debit, and I re-ran that suite green — so the loss is not credits; the loss is that the paste can never be autopsied, refused by a rule that R-99 has just declared inapplicable to them, with no surface explaining it. That is the sharp end of a rule enforced past its own scope.

**The orchestrator's cost estimate is too high, and I checked.** The grant `startAttempt` already returns carries `transcript` and `contentDigest` (`system-spend.ts:716-724`, returned at `:1056-1063`), both derived server-side inside the same transaction that reads `cacheClaim`. One additional **derived boolean** on that grant — not the scope, not a profile id, not a workspace id — needs no change to the `run-once` CLI, no change to the worker command, and no runbook edit, and it is invisible to the R21 "no tenant identity column on any retained system table" scan because it is neither stored nor an identity.

**A constraint on the fix, which is the part I would not want lost.** The preflight is currently the **only** `assertMechanismLevel` on private autopsy content anywhere in the running system — I greped every non-test TS file: `assertMechanismLevel` has exactly two call sites (`frameworks.ts:1460`, `:2553`), both inside framework writes, and `assertAutopsyFrameworkCandidate` has exactly one caller (`system-autopsy.ts:423`). Meanwhile `packages/modes/src/assemble.ts:52-58` asserts of `SpinReferenceMechanism` — the four fields that go into the **prompt** — that they have already passed `assertMechanismLevel` (no personal details, no numbers, no performance data) before being persisted, and `assertReferenceMechanism` checks only the object's *shape*, never its content. **So the naive fix — skip the preflight for private items — would silently falsify `assemble.ts:52-58` and put un-vetted numbers into a generation prompt.** The correct shape is: keep running the content check on private items, and drop only the *shared-library-candidacy consequence* (do not burn the attempt; do not park), or classify a private failure as something other than a paid `analysis_invalid`.

**Severity: CHANGE.** No profile or workspace boundary is crossed, no data leaves a tenant, no role is bypassed, and the credit is returned — so it does not meet my BLOCK bar. But it is a consequence the round-1 fix created, it is creator-visible, it is permanent for the affected paste, and one of the two lanes must own it before the slice closes.

### NOTE 3-prime — `respin/packages/modes/src/assemble.ts:56` — the wrong-module attribution is still there, and the property it asserts now rests entirely on the line CHANGE B wants moved

Round-1 NOTE 3 was not actioned (file hash-identical). It is now more than a citation error: the sentence names the wrong package **and** its truth depends on a preflight two lanes are about to change. Fix both together — correct the attribution to `@respin/db`, and when CHANGE B lands, say which line now guarantees it.

### NOTE 4-prime — `respin/packages/db/migrations/0028_light_mulholland_black.sql:63-68` — the CONTRACT paragraph's example failure cannot happen

**Verified by running it on a populated table**, which is the evidence the builder said it could not get.

The header says the `ADD` "VALIDATES every existing row on the way in. A failure here means a row this migration's own backfill did not reach — e.g. an `unavailable` row whose `saturation` is `measured`". I built exactly that row (`baseline_state='unavailable'`, `saturation='measured'`, six saturation columns populated, reason `NULL`) alongside a pre-0028 pasted reference and a measured-baseline shared item, then ran 0028's three statements verbatim in one transaction:

```
BEGIN / ALTER TABLE / UPDATE 1 / ALTER TABLE / COMMIT
AFTER | a...a | unavailable | unmeasured | no_population           <- relabelled
AFTER | b...b | measured    | unmeasured | incomplete_provenance   <- untouched
AFTER | c...c | unavailable | measured   | (null)                  <- SURVIVED the ADD
```

Row `c` satisfies the CHECK's *measured* branch, which does not mention `baseline_state`. In fact, after the backfill **no** pre-0028-conforming row can fail the ADD: the old CHECK admitted exactly one unmeasured reason, and the backfill rewrites precisely the rows whose reason the new CHECK changes. The validation is expected to be vacuous on any conforming database. Repo law (2026-07-30): a comment claiming a property is not the property — say the true thing, which is stronger and simpler than the invented one.

### NOTE 5-prime — the CHECK admits a NULL reason on an unmeasured row, in both the old and the new form

**Verified by running it against the live 0028 constraint**: `UPDATE trend_items SET saturation_unmeasured_reason=NULL` on an `unavailable`/`unmeasured` row gives `UPDATE 1`. `NULL = CASE...` is NULL; `NULL OR FALSE` is NULL; a CHECK passes on NULL. **This is pre-existing in 0025 and 0028 does not widen it** — I ran both directions and both refuse the wrong non-NULL value (`incomplete_provenance` on an unavailable row, and `no_population` on a measured one, each raise `violates check constraint "trend_items_saturation_measurement_nonempty"`). It is a NOTE because the header claims more than the constraint delivers: "the CHECK is the whole vocabulary" (`:15`) and "the CASE makes the reason a FACT of the row" (`:27-28`). It is not reachable from a writer — `assertTrendItemInput` (`trends-storage.ts:231`) requires `incomplete_provenance` on the unmeasured branch and `recordPrivateTrendItem:315` hardcodes `no_population` — so this is a wording fix, or an `IS NOT NULL` conjunct if the claim is meant literally.

### NOTE 6-prime — R-99's decision entry does not record that the `matched` case went with the proposal

`system-spend.ts:1183` says "`matched_framework_id` stays NULL for it". `decisions.md:1341-1353` does not. One sentence, so a reader of the decision learns the full consequence rather than discovering it in the code.

### NOTE 7 — `pastedReferenceForProfile`'s divergence from the list reader is disclosed, and `pastedReferencesForProfile`'s new predicate narrows nothing today

Both checked. `PastedReference.baselineState`'s docblock (`trends-storage.ts:1185-1194`) states the divergence explicitly ("the per-claim reader does not"), so it is stated rather than silent — that is the right handling. And `pastedReferenceForProfile` has **zero** production callers and no `app-server` bind (grep over `app`, `lib`, `worker`, `packages/*/src`), so the divergence is unreachable as well as disclosed. Separately: the new `eq(trendItems.baselineState, "unavailable")` narrows nothing a creator needs, because `recordPrivateTrendItem` has exactly one production caller (`trends-storage.ts:1106`, the paste intake) and it always writes `unavailable`. The latent risk is a future unavailable-to-measured lift, which `recordPrivateTrendItem:339-341` permits: the item would leave the pasted-references section for the ranked feed, taking its claim status with it. **The money is immune to that** precisely because CHANGE 1's fix reads claims, not items — which is the argument for fixing CHANGE A by dropping the field rather than by adding the item join.

### NOTE 8 — the deploy-order hazard is documented where an operator reads it, and has nowhere else to live yet

0028 is the first migration in this repo that is **not** expand-only (0026 and 0027 both declare that they are). The header's DEPLOY ORDER paragraph (`:38-45`) is accurate — I reproduced the refusal it predicts. There is no deployment runbook in `docs/runbooks/` for it to be repeated in, and no production database exists (tech-spec:13, "deploy shape decided at first deploy"); 0026, which created the `unavailable` state at all, is itself unshipped, so **there is no old writer anywhere that this can break**. The hazard is entirely prospective. Recommendation: when the first deploy runbook is written, name 0028 in it. Not a blocker for this slice.

---

## The three judgements you asked for

**1. Is losing the `matched` case right? Yes — and for a reason stronger than "nothing reads the column".**

I confirmed the column census: `matchedFrameworkId` / `matched_framework_id` appears in exactly three non-test, non-migration places (`system-spend.ts:1183` comment, `:1202` write, `trends-schema.ts:259` definition). Nothing reads it. But the decisive point is that **`resolveAutopsyFramework` is not a read**: besides inserting (`frameworks.ts:1613-1630`), it can set `superseded_at` on an existing live shared row (`:1686-1692`) when the slug's live row is rejected or retired. A "match but do not propose" variant would have to run those write paths and discard the result — a private paste could then mutate shared-library state — which is exactly the fragile shape R-99 exists to remove. The blanket gate is the safer control, it costs nothing observable, and R-99's revisit trigger is the right place to reopen it.

**2. Is the deploy-order hazard acceptable and correctly documented? Yes** (NOTE 8). Loud refusal over quiet lie is the right call in this product, and the header states the direction of failure, the rollback, its lossiness, and the restore implications. The one factual error in the header is NOTE 4-prime, and it is in the paragraph that matters least.

**3. Is the backfill idempotent, and does B-4's lesson apply? Yes and yes — discharged, not merely acknowledged.**

Idempotent: I ran the `UPDATE` a second time on the already-migrated table and got `UPDATE 0`. Its `IS DISTINCT FROM 'no_population'` predicate is NULL-safe, so it is a no-op on a fresh database and on a re-run alike. B-4's lesson (0012 set `NOT NULL` plus a CHECK on a populated table) applies in **form** — a validating `ADD CONSTRAINT` on a table that may hold rows — and is discharged: I populated the table with four rows including both edge shapes and the whole file committed. It differs from 0012 in kind: no column is made `NOT NULL`, no column is added, and the migration relabels rows rather than demanding the data already be right. I also ran the header's **ROLLBACK SQL verbatim** — `DROP` / `UPDATE 1` / `ADD` all succeeded and put `incomplete_provenance` back — so the printed remedy is one an operator can actually paste, which round 1's fail-closed lesson says to check.

---

## Checks run

- **T1 — single scoping helper.** Holds. `parkedAutopsyClaimsForProfile` mints first (`trends-storage.ts:1326`) and is pinned in AC-13's surface list (`tests/profile-cage.test.ts:1285`), which is a **derived** guard — `uncovered` must be empty against a source walk, so a new scope-taking export that never mints fails it. Deliberately not bound in `app-server.ts` (verified by grep: the only bind is `pastedReferences` at `app-server.ts:201`). Cross-profile and cross-workspace are both witnessed in-repo now (`packages/db/tests/pasted-reference.test.ts:440-465`), and I reddened the cross-profile half with my own planted mutation. The one gap is the returned-but-unscoped `trendItemId` -> **CHANGE A**.
- **T2 — mechanism-level stripping.** Holds, and is now materially stronger. R-99 closes the creator-initiated producer entirely; both directions are witnessed with the same analysis fixture; I reddened the guard myself. R-9 seeding: n/a — no seeding code in this diff (`packages/db/src/seed.ts` hash-unchanged). The residual is **CHANGE B**'s constraint: the stripping *check* is still the only content gate on private autopsy text that reaches a prompt.
- **T3 — append-only brains / provenance / approval / no fine-tuning.** n/a-clean. Grep over all nine changed source modules: no `brain_docs` write, no fine-tuning path. `packages/db/src/index.ts:232` re-exports the table; nothing in the fix pass mutates it.
- **T3 / REQ-B02 — sensitive inference.** n/a. Nothing in the fix pass infers anything about a creator.
- **T4 — export and deletion.** Holds. No table, column or FK is added by 0028 (asserted structurally at `migration-shape.test.ts:935-943` and confirmed against `pg_constraint` on the live database). The new reason **is** pinned in the creator's export at `packages/db/tests/export.test.ts:896-904` — `baselineState: "unavailable", saturationUnmeasuredReason: "no_population"`, read out of the parsed JSON export, which is where round 1's learning gate found the wrong value. `brain-schema.test.ts` cascade cases still green.
- **T5 — roles and admin.** Holds, unchanged. Viewer still refused at two layers for the paste; `settleParkedAutopsies` is still deliberately role-free and still safe for the five reasons in round-1 NOTE 5, one of which I re-derived from source this round (the mint takes `workspaceId` off the scope, `with-workspace.ts:1724`). No admin surface, no reason-code path touched.
- **T6 — PII and secrets.** Holds. C8's cast is now a clamp with `isBillingErrorCode` (`app/(product)/trends/actions.ts:212-227`); `logRefusal` sites carry ids only; no LLM key client-side; the settlement's `deferred` and `neverChargedClaimIds` are a boolean and claim ids, no content.
- **Requirement provenance.** Holds. R-99 is recorded before the code and is accurate about what it decided; the code comment at `system-spend.ts:1174-1183` cites it and CLAUDE.md's 2026-08-29 lesson. The one omission is NOTE 6-prime.
- **Migration 0028 against `pg_constraint`.** Verified on the live `respin-postgres` container: the deployed `trend_items_saturation_measurement_nonempty` is the CASE tie, matching the predicate in `trends-schema.ts:182`. `trend_items` holds **0 rows** live, confirming the builder's statement.

## Coverage

- **Read fully**: `packages/db/migrations/0028_light_mulholland_black.sql` (header and SQL); `packages/db/src/trends-storage.ts:1180-1377` and `:221-350, 600-700, 1090-1160`; `packages/db/src/system-spend.ts:950-1000, 1100-1215`; `packages/db/src/frameworks.ts:1460-1720`; `packages/credits/src/pasted-reference.ts:290-480`; `packages/db/tests/pasted-reference.test.ts:340-470`; `packages/db/tests/migration-shape.test.ts:931-1000`; `packages/db/tests/system-spend.test.ts:690-845`; `decisions.md` R-99; `respin/.gitignore`.
- **Read in the parts that matter**: `tests/profile-cage.test.ts` AC-13 list; `packages/db/tests/export.test.ts` R7 case; `app/(product)/trends/page.tsx:250-340`; `app/(product)/trends/actions.ts`; `packages/modes/src/assemble.ts:40-110, 540-560`; `packages/db/src/with-workspace.ts:1700-1730`; `eslint.config.mjs` ignores; `worker/system-autopsy.ts:380-447`; `packages/db/src/trends-schema.ts:250-318`.
- **Not reached**: `packages/modes/src/traceability.ts` and its new test (the compliance lane's BLOCK); `packages/credits/src/ledger.ts` and `tests/ledger.test.ts` (the billing lane's C4); `tests/trends-ui.test.tsx`, `tests/billing-ui.test.tsx`, `tests/trends-page.test.tsx` beyond running them; `packages/db/migrations/meta/0028_snapshot.json`; `pnpm-lock.yaml`.
- **Commands run**:
  - SHA-256 over all **173** manifest paths, **before and after** — 173/173 both times, 0 mismatches, 0 missing.
  - `docker exec respin-postgres psql` against the live database: `pg_get_constraintdef` for both saturation CHECKs; `select count(*) from trend_items` -> **0**.
  - Created `respin_0028_probe`, applied migrations 0000-0028 with the real `pnpm db:migrate` (exit 0), rewound to the 0025 constraint, populated four `trend_items` rows through their real FKs, ran **0028's three statements verbatim** in one transaction (`UPDATE 1`, committed); re-ran the backfill (`UPDATE 0`); drove both refusal directions (two `violates check constraint` errors, named); drove the NULL-reason case (`UPDATE 1`); ran the header's **ROLLBACK SQL verbatim** (succeeded, `UPDATE 1`); forged a claim whose pair is profile A's and whose `trend_item_id` is profile B's (**accepted**, and returned by the new reader's exact predicate). Database dropped afterwards.
  - Two **planted mutations of my own**, applied through a vitest transform plugin in a config **outside the repo** (no repo file touched): (a) the `cacheClaim.rightsScope === "shared_analysis"` condition replaced by `true` — `system-spend.test.ts` 1 failed / 20 passed; (b) `eq(autopsyCacheClaims.profileId, ...)` deleted — `pasted-reference.test.ts` 1 failed / 23 passed. Baseline of both files with the plugin inert: green.
  - `vitest run` over the twelve suites the fix pass touched in my lane (`pasted-reference` x2, `export`, `brain-schema`, `migration-shape`, `system-spend`, `profile-scope`, `frameworks`, `profile-cage`, `ledger`, `isolation`, `probe-artifacts`) with `TEST_DATABASE_URL` live -> **352 passed, 0 failed**.
  - Greps: every `insert(autopsyCacheClaims)` site; every `from(trendItems)` site; every `assertMechanismLevel` and `assertAutopsyFrameworkCandidate` call site; every `matchedFrameworkId` reference; every caller of `recordPrivateTrendItem` and `pastedReferenceForProfile`; `git status --short --untracked-files=all -- respin`.

**What I hunted for and did NOT find**, so the clean rows are not mistaken for a skim:

- A second reader introduced by the fix pass that takes a `WorkspaceScope` and skips the mint — **not found**; AC-13's derived `uncovered` list is empty and I re-read the collector's shape.
- A new `app/**` capability or facade bind for `parkedAutopsyClaimsForProfile` — **not found**; package-index export only, no `app-server.ts` bind.
- A workspace mismatch between the settlement's outer mint and the reader's inner mint — **not found**; both take `workspaceId` off the scope, and the inner mint fails closed if the profile moved between them.
- A new table, column or FK in 0028 that would owe an export or deletion entry — **not found**; asserted structurally and confirmed against `pg_constraint`.
- A brain-doc write, a silent brain mutation, or a fine-tuning path anywhere in the 39 fix-pass files — **not found**.
- A creator-visible narrowing from the new `baseline_state='unavailable'` predicate — **not found** today (one writer, always `unavailable`); the latent case is NOTE 7, and the money is immune to it.
- A second spelling of the R-99 gate (another `resolveAutopsyFramework` caller that is not gated) — **not found**; `resolveAutopsyFramework` has exactly one caller, `system-spend.ts:1185`.

## Verdict

**NEEDS CHANGES · Almost · B**

**0 BLOCK · 2 CHANGE · 7 NOTE.** Both round-1 CHANGEs are genuinely closed, and I proved each by planting the mutation myself rather than by reading the fix. Neither remaining CHANGE crosses a tenancy boundary: no row leaves a profile or a workspace, nothing personal reaches the shared library, no brain mutates, no table misses export or deletion, no role is bypassed. What each does is what slice 6's round 2 warned about — CHANGE A is a scoping *class* left open by the reader that closed a money defect, and CHANGE B is a rule the R-99 fix stranded on a worker where it now punishes the creators R-99 just exempted.

**Least-confident line:** my grading of CHANGE B as a CHANGE rather than a BLOCK rests on the claim that the creator's credit is always returned, which I took from re-running R-98's suite green rather than from driving the five-attempt park end to end through the real worker against a private claim whose analysis genuinely fails `assertMechanismLevel`. I never measured how often a real canonical autopsy of a real pasted transcript trips `MECHANISM_CONTENT_RULES`; I reasoned from the rule set that `metric_unit` is easy to trip and stopped. If that rate is high, CHANGE B is not an edge case but the ordinary experience of pasting a reference, and it should be graded above CHANGE A rather than beside it.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
