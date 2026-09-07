# Slice 2b: The spend record that outlives deletion

> **Current truth override (Slice 4c, 2026-08-31):** this plan remains historical evidence of what Slice 2b-c built and tested. Its R4a completion claim is superseded: `applyReconciliationDelta`, the `model_usage` UPDATE allowance, error/copy plumbing, and mutation-only tests were removed because no real provider/job/operator-import caller exists. The retained unknown denominator, new-call rollup UPSERT, and read-only reconciliation report remain live. A future corrected-cost transition belongs to the real integration that can prove payload identity and idempotency.

## A creator can…
**See this month's credit burn on `/usage`, and have it still be right after a retried settlement.**

## …and an operator can
**See what a workspace cost us this month, from a record that survives that workspace being deleted.**

Two sentences, because **the master plan's one sentence conflated two different numbers** and the conflation has to be fixed before the card is built, not during it. See the correction below.

---

## The correction this card opens with

`respin-finish-master-plan.md` reads: *"See this month's burn on `/usage` computed from the rollup."* That is not buildable as written, for two independent reasons found by reading the schema:

**1. The rollup holds OUR cost, not the creator's burn.** `workspace_spend_monthly.cost_micro_usd` is model spend in micro-USD (`onboarding-schema.ts:240-242`), and its own docblock calls it "the margin history" (`:210-216`). REQ-G07's "this month's burn by mode" is **credits**, which a creator spends and understands. Putting our vendor cost on a creator's usage page would show them our margin, which is neither what they asked for nor something we want on that screen.

**2. The rollup cannot express "by mode" at all.** Its unique grain is `(workspace_id, period_month, tier)` (`onboarding-schema.ts:250-254`). There is no `purpose` column, so no per-mode breakdown is derivable from it. Widening the grain is possible and is **rejected here**: the table's stated reason for existing is a coarse financial aggregate that outlives a deletion, and a per-purpose grain makes it finer-grained data about a deleted person.

**So the slice splits cleanly along the reader:**

| Number | Source | Who reads it | Where |
|---|---|---|---|
| This month's **credit** burn | `credit_ledger` debit rows in the current period | the creator | `/usage` |
| This month's **cost** in micro-USD | `workspace_spend_monthly` | an operator | `/admin/model-spend` (minimal) |

**And "by mode" is vacuous today and must say so.** There is exactly one `purpose` value in existence — `ONBOARDING_BRAIN_PURPOSE` (`inference.ts:73`) — so a breakdown by mode would be a one-row table restating the total. `usage-view.tsx:171-186` already renders that slot with a note driven by the pure `spendVisibility()` and already records at `:60-80` that hardcoding it was a shipped absence-read-as-zero defect. This slice fills the **total** and leaves the breakdown as a named absence until slice 6 makes modes real.

**Why the rollup still needs a reader in this slice.** A writer with no reader is precisely the M2b-1 shape this plan exists to stop. So 2b ships the *minimal* operator reader — spend by month and tier, one table — and slice 10b keeps the full REQ-G05 margin dashboard (cost vs revenue, per-tier gross margin, the excluded-`unknown` share).

## Open items closing here
R-30.5 (pseudonymisation of `workspace_id`) · R-30.9 (the rollup's idempotency key and its reconciliation query) · the **R-41 reconciliation debt** inherited from slice 2a's deferred-findings table — a `model_usage` row whose debit never landed, which R-41 explicitly owes to "the slice that gives `model_usage` its first reader", i.e. this one.

## Prerequisites
- [ ] Slice 2a shipped (real `model_usage` rows exist) — **done 2026-08-28**
- [x] **`workspace_id` pseudonymisation decided — R-54 (2026-08-29, delegated):** at deletion time, by random replacement (one fresh identifier per deleted workspace, mapping discarded, no re-linkage path). R16 records it in the registry; R17's tripwire carries it to 10b-2's executor
- [ ] Slice 3 closed, so this does not land on top of an unreviewed round — **the closing round is decided (R-51): a third round scoped to the fix-pass diff runs first**

---

## The three questions the stub left open, answered

**1. Is the rollup's idempotency key `model_usage.id` or `attempt_id`?**

**Neither. The rollup increments inside the same transaction that inserts the `model_usage` row, and is therefore exactly-once by construction.**

The stub framed this as a key choice because it assumed a separate writer. Reading the code makes the assumption wrong in both directions:

- **`attempt_id` is the wrong grain for cost.** `model_usage` deliberately has **no unique index on `attempt_id`** (verified: `0011_first_rage.sql:59-77` and `:105` — the FK is the only constraint), because "a bounded retry writes two rows" (`onboarding-schema.ts:147-149`). Two rows means two vendor calls, both charged. A rollup keyed on `attempt_id` would count one of them and understate cost — the direction that overstates margin, which is the one direction `tech-spec.md` §2 names as dangerous.
- **`model_usage.id` as a key needs a record of what has been consumed**, and every available shape is worse than the alternative. A `rolled_up_at` column breaks `model_usage`'s append-only-except-one-sanctioned-transition rule. A high-water mark on `(created_at, id)` can skip a row, because `created_at` is `clock_timestamp()` (`onboarding-schema.ts:191-195`) and a transaction that stamps early can commit late.

`recordUsage` already opens its own transaction (`inference.ts:713-734`), and both writes are the same fact at two grains: **spend already incurred**. R-28/A-7's settlement tail is the rule that puts them together, not the rule that separates them.

**What this costs, stated rather than discovered.** The two writes now share a fate: a rollup failure rolls back the usage row, which is the shape round 1 of the slice-2a gate rejected. The mitigation is that the second write is the narrowest one available — one row, identified by an existing unique index, no FK, no cascade, no CHECK beyond column types — and **R6 below makes that atomicity a test rather than an assumption**, in both directions.

`packages/db` can write it without a second authority: `resolved_tier` is already on the usage row it is inserting, so no tier is re-derived and R-30 constraint 2 is untouched.

**2. Does `/usage` read the rollup or `model_usage`?**

**Neither — it reads `credit_ledger`,** per the correction above. The page already loads ledger rows (`usage/page.tsx:62`) and already refuses to do arithmetic on them (`usage-view.tsx:5-9`: *"Nothing here adds up the deltas in `rows` — the table is history, not arithmetic"*, reinforced at `with-workspace.ts:345-352`). That refusal is correct and stays: the burn total is computed by a **scoped query with its own period predicate**, not by summing a clamped page. Summing the page is exactly the defect `spendVisibility` was written to prevent.

**They cannot disagree, because they answer different questions** — which is the real reason to split them. If they could disagree, this card would owe a rule for which wins; it does not.

**3. What does reconciliation report after a REQ-A04 deletion?**

**A distinct status, never drift.** `model_usage` cascades away with the profile (`onboarding-schema.ts:198-202`) while `workspace_spend_monthly` has no FK and is retained (`creator-data-registry.ts:100-114`). So after a deletion the naive comparison reports maximal disagreement on a table that is behaving exactly as designed — an alarm that fires on correctness is an alarm nobody reads.

The query therefore classifies every rollup row into **one of three** outcomes and reports the counts separately:

| Class | Meaning |
|---|---|
| `reconciled` | rollup total equals the `model_usage` total for that grain |
| `orphaned` | no `creator_profiles` row for that workspace — the usage side was deleted, and this is the table doing its job |
| `drift` | both sides present and disagree — **the only class that is a defect** |

And a fourth number rides along because R-41 owes it: **`unbilled`** — attempts with a `model_usage` row and no `credit_ledger` debit for that `attempt_id`. R-41 recorded that a crash between the two commits leaves exactly that, and that "nothing reconciles it". This is where it gets a reader. It is a **report, not a repair**: charging a creator days later for a call they were never told about is worse than the lost revenue.

---

## Requirements

### The rollup writer (R-30.9)
- [ ] **R1:** The upsert runs in `recordModelUsage`'s transaction (question 1), via `onConflictDoUpdate` on `workspace_spend_monthly_grain_uq`, incrementing `cost_micro_usd`, `call_count` and `unknown_call_count` as applicable. This is the repo's **first `onConflictDoUpdate` in product code** — the writer-set scanner already knows the verb and probes for it in three shapes (`tests/table-writers.test.ts:349-375`), so it is instrumented before it exists.
- [ ] **R2:** `period_month` is derived from the row's **own** `created_at`, not from a caller clock — so the bucket and the row can never disagree. The column is a drizzle `date()`, so its TS type is `string`; there is **no month-bucketing helper in the repo** (`months.ts`'s `addMonthsUtc` clamps, it does not truncate), so this slice writes one, tested at a month boundary and across a UTC offset.
- [ ] **R3:** `tier` comes from the usage row's `resolved_tier`, never re-derived. `getWorkspaceBillingState` is the sole tier authority and lives in `@respin/credits`, which `@respin/db` cannot import.
- [x] **R4:** A migration adds `unknown_call_count NOT NULL DEFAULT 0` (or an equivalent retained denominator). A `cost_state = 'unknown'` row increments `call_count` and `unknown_call_count`, and **not** `cost_micro_usd`. The unknown share remains calculable after `model_usage` detail is deleted; deriving it from surviving detail is forbidden. — Slice 2b-c, 2026-08-30: `packages/db/migrations/0017_clumsy_wither.sql` (adds the column, backfills from extant `model_usage`); `onboarding-schema.ts`'s `workspaceSpendMonthly.unknownCallCount`; `spend-rollup.ts`'s `upsertSpendRollup`. Tested in `packages/db/tests/spend-rollup.test.ts`, including post-deletion survival.
- [x] **R4a:** If a usage row transitions from estimated/unknown to reconciled cost, the rollup applies the exact cost and unknown-count delta in the same transaction, once. A unique reconciliation/business id makes webhook/job retry idempotent; totals must not double-count or remain permanently estimated. — Slice 2b-c, 2026-08-30: `spend-rollup.ts`'s `applyReconciliationDelta`, `model_usage`'s first implementation of its one sanctioned UPDATE; idempotent by row-locked state (`SELECT ... FOR UPDATE` + already-`reconciled` no-op), not a separate id table. Sequential idempotency proven in `spend-rollup.test.ts` (M9's shape), concurrent idempotency proven on real Postgres in `spend-rollup.docker.test.ts`. **Billing gate round 1 (2026-08-30):** the concurrent-idempotency docker test flaked 1/7 on a JS-flag-plus-fixed-sleep handshake that could not prove genuine DB-level contention; replaced with a `pg_stat_activity`-based witness (the function's own locking was already correct — the lock is taken first, the reconciled-check runs strictly after), 40/40 clean afterward. The no-op branch now returns `{ applied: false, priorCostMicroUsd }` instead of a bare `{ applied: false }`, so a future caller can tell a duplicate delivery from a genuine second reconciliation carrying a corrected price (documented as a KNOWN LIMITATION in the function's own docblock, since no caller exists yet to act on the distinction).
- [ ] **R5:** `tests/table-writers.test.ts`'s `workspace_spend_monthly: {}` becomes a named single writer with a reason — the deliberate edit its comment asks for.
- [ ] **R6:** **The shared fate is proven in both directions**: a forced failure of the rollup upsert leaves **no** `model_usage` row, and a forced failure of the usage insert leaves **no** rollup increment. On real Postgres, in a `.docker.test.ts`, because that is where a constraint violation is real.

### The creator's burn (`/usage`)
- [ ] **R7:** This month's credit burn is a **scoped query with its own period predicate**, never a sum over the ledger page. Paid workspaces use the subscription billing period from the billing authority. Free workspaces, which have no subscription period, use a UTC calendar month. The UI states the actual start/end dates.
- [ ] **R8:** **Absent is never zero.** A workspace with no debits reads "nothing spent this month", never `0 credits` — the `spendVisibility` three-state shape (`usage-view.tsx:81-89`) already in the file, extended rather than replaced.
- [ ] **R9:** "By mode" stays a **named absence** with an honest sentence, because one purpose exists (see the correction). The sentence names what would make it real, and a test pins it to the number of distinct purposes so it **cannot stay true after slice 6** without someone noticing.
- [ ] **R10:** Days-to-empty is either computed with a stated window and population, or it stays the honest slot it is today. It is **not** required by this slice and must not be faked from one month of one purpose.

### The reconciliation query (R-30.9, R-41)
- [ ] **R11:** The three-class reconciliation of question 3, plus `unbilled`, as a **query an operator can run** — not a background job. There is no runner (`tech-spec.md:18`) and this slice must not select one.
- [ ] **R12:** It is written **while `model_usage` still exists**, which is R-30.9's actual requirement: a reconciliation that can only be written after the thing it reconciles against is gone cannot be validated.
- [ ] **R13:** The `orphaned` class has a test that creates the condition — a workspace whose profile tree is deleted while its rollup rows remain (`brain-schema.test.ts:214` and `db.test.ts:468-499` already prove the cascade is possible, so the fixture exists).

### The minimal operator reader
- [x] **R14:** `/admin/model-spend` renders spend by `(month, tier)` from the rollup, plus the retained excluded-`unknown` share (R4), plus the reconciliation counts (R11). `requireAdmin()` per `(admin)` convention, registered in `lib/routes.ts` and `tests/gate-completeness.test.ts`'s fixture list. If `/admin/margin` already shipped, add a deliberate redirect/removal migration and update all route fixtures. — Slice 2b-c, 2026-08-30: page moved `app/(admin)/admin/margin/` -> `app/(admin)/admin/model-spend/`; `next.config.ts` `redirects()` sends the old path to the new one (307); `lib/routes.ts` needed no change (`/admin` prefix already covers both); `tests/gate-completeness.test.ts`, `tests/model-spend-ui.test.tsx` (renamed from `margin-ui.test.tsx`), `tests/routes.test.ts` updated.
- [x] **R15:** It renders **no gross-margin figure**. Margin needs revenue, revenue needs the credit-to-dollar side, and REQ-G05's dashboard is slice 10b's. A cost number labelled "margin" is the claim this project has been burned by; the page shows cost and says it is cost. — Unchanged behaviourally by the rename; `tests/model-spend-ui.test.tsx`'s forbidden-word scan (moved from `margin-ui.test.tsx`) re-run against the new component and file, still green, including its own fixture-proof (a planted "margin: 40%" is caught).

### Pseudonymisation (R-30.5)
- [ ] **R16:** The registry entry for `workspace_spend_monthly` is **updated with the decision taken**, not left as the open question it is today (`creator-data-registry.ts:108-113`). `tests/creator-data-registry.test.ts:109-125` already requires the reason to match `/financial records/i` **and** `/pseudonymis/i`, so an evasive edit fails a test.
- [ ] **R17:** **The obligation is given an instrument, because the executor is six slices away.** A tripwire in the shape of `tests/retention.test.ts`'s no-new-reader scan: if a deletion executor lands anywhere under `packages/` or `app/` without the rollup's pseudonymisation step, the suite fails and names R-30.5. A prose obligation carried across six slices is how G-13 survived three review rounds.

---

## Left to the developer

- **Where the month-truncation helper lives** (R2) — `@respin/db` is the natural home since the writer is there.
- **The reconciliation query's delivery** — a `packages/db` function the admin page calls, a CLI script, or both. R11's invariant is that it needs no scheduler.
- **Whether `/admin/model-spend` is a new route or a section of `/admin`.** The cost-only surface must not use "margin" in its route/title.
- **Test file layout**, subject to R6 being a `.docker.test.ts`.

## Tasks
1. [ ] Month-truncation helper + its boundary tests (R2)
2. [ ] Migration + upsert inside `recordModelUsage`'s transaction; retained unknown count and reconciliation deltas (R1, R3, R4, R4a)
3. [ ] `tests/table-writers.test.ts` entry (R5); the shared-fate docker test (R6)
4. [ ] `/usage`: the period-scoped burn query, the three-state absence, the by-mode sentence (R7–R9)
5. [ ] The reconciliation query, four classes (R11–R13)
6. [ ] `/admin/model-spend` minimal reader + old-route disposition + route registration + gate fixture (R14, R15)
7. [ ] Registry update (R16) and the deletion-executor tripwire (R17)
8. [ ] Walk it: run an inference → `/usage` shows the credit burn → `/admin/model-spend` shows the cost row and retained unknown share → delete the profile → reconciliation reports `orphaned`, not drift

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/with-workspace.ts` | Modify | The rollup upsert inside `recordModelUsage`'s transaction |
| `respin/packages/db/src/onboarding-schema.ts` | Modify | Retained `unknown_call_count` (or equivalent) |
| `respin/packages/db/migrations/00xx_*.sql` | Create | Expand/backfill the retained unknown denominator |
| `respin/packages/db/src/spend-rollup.ts` | Create | Month truncation, the reconciliation query, the four classes |
| `respin/packages/db/src/creator-data-registry.ts` | Modify | R16's pseudonymisation decision |
| `respin/packages/db/src/app-server.ts` | Modify | `monthlySpend`, `reconcileSpend` — `WorkspaceScope` positionally (AC-13 scan) |
| `respin/packages/credits/src/*` | Modify | R7's period-scoped credit-burn read (the period authority lives here) |
| `respin/app/(product)/usage/**` | Modify | The burn total, the three-state absence, the by-mode sentence |
| `respin/app/(admin)/admin/model-spend/page.tsx` | Create/Move | R14's accurately named cost reader |
| `respin/lib/routes.ts` | Modify | Register `/admin/model-spend`; retire/redirect the misleading route |
| `respin/packages/db/tests/spend-rollup.docker.test.ts` | Create | R6's shared fate, on real Postgres |
| `respin/tests/table-writers.test.ts` | Modify | R5 |
| `respin/tests/creator-data-registry.test.ts` | Modify | Assert the decision is recorded, not just present |
| `respin/tests/retention.test.ts` *(or a sibling)* | Modify | R17's deletion-executor tripwire |
| `respin/tests/gate-completeness.test.ts` | Modify | `/admin/model-spend`'s gate fixture |

**A migration is required.** Expand with the retained unknown denominator, backfill it from extant
`model_usage` rows before any detail-retention deletion can run, deploy readers/writers, then contract
only after mixed-version compatibility is proven. Record rollback and restore implications.

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **A real inference → `/usage` shows the credit burn → `/admin/model-spend` shows the cost row**, in a browser
3. [ ] Forced rollup failure → no `model_usage` row (R6, real Postgres)
4. [ ] Forced usage-insert failure → no rollup increment (R6, real Postgres)
5. [ ] Two attempts in one retry → **two** rows and **two** increments (question 1's whole point)
6. [ ] An `unknown`-cost attempt → `call_count` +1, `unknown_call_count` +1, `cost_micro_usd` unchanged, excluded share visible; delete its `model_usage` row and the share is unchanged (R4)
6a. [ ] Reconcile that attempt twice → one exact cost delta, `unknown_call_count` decremented once and no double-count (R4a)
7. [ ] Workspace with no debits → "nothing spent this month", never `0` (R8)
8. [ ] Profile deleted, rollup rows remain → reconciliation reports `orphaned`, `drift` is empty (R13)
9. [ ] A `model_usage` row with no matching debit → reported as `unbilled` (R11 / R-41)
10. [ ] A non-admin reaching `/admin/model-spend` → 404 (`requireAdmin`'s fail-closed shape)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Rollup upsert moved out of the usage transaction into its own | R6's shared-fate pair |
| M2 | `onConflictDoUpdate` → `onConflictDoNothing` | The two-attempt increment test |
| M3 | Unknown share is derived from retained `model_usage` detail | R4's post-detail-deletion test |
| M4 | `period_month` from `new Date()` instead of the row's `created_at` | R2's boundary test |
| M5 | Burn total summed over the ledger page instead of queried | R7's >page-size fixture |
| M6 | Zero burn renders `0 credits` | R8's absence test |
| M7 | Reconciliation folds `orphaned` into `drift` | R13's post-deletion test |
| M8 | Tier re-derived in `packages/db` instead of read from the row | R3 + the import boundary |
| M9 | A reconciled retry applies its cost delta twice | R4a's duplicate-reconciliation test |

**Population note — read before reporting "N of N".** Eight mutations, all on code that will exist. Two requirements in this card have **no natural control and are named here rather than found later**: **R15** (the operator page must not render a margin figure) is an absence, and the only instrument for it is a forbidden-word scan over the real rendered copy — the shape that caught 23 of 33 codes on `/onboarding` (R-36); and **R17**'s tripwire is a guard whose subject does not exist yet, so it must be proven against a **planted** deletion executor or it is a scan that finds no candidates, which is CLAUDE.md's 2026-08-21 fail-open shape. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] Both "can…" lines walked — the creator's in a browser, the operator's in a browser
- [ ] **Respin billing & credits** (Full gates) and **brain tenancy** (Full gates) PASS — reviewers in **isolated worktrees**
- [ ] R-30.5, R-30.9 and R-41's reconciliation debt closed in the disposition register
- [ ] `decisions.md` carries: the same-transaction rollup decision with its stated cost, the pseudonymisation answer, and **the correction at the top of this card** — that the creator's burn and the margin rollup are two numbers with two readers
- [ ] `respin-finish-master-plan.md`'s slice-2b row is corrected to match
