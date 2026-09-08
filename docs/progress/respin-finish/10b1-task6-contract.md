# Phase 10b-1 Task 6 — implementation contract (2026-09-08)

Task-sequence item 6 of `docs/plans/respin-finish-phase-10b-1.md`: "Add the pre-redaction
Stripe finance extractor, all retention receivers, and worker health/alerts."

Tasks 1–5 are preserved. This task changes Task 4/5 files only at the two seams they
named for Task 6 in their own comments:

- `deletion-executor.ts` — `STRIPE_PAYLOAD_RECEIVER_WIRED` ("Task 6 flips it in the same
  change that wires the receiver") and `FINANCIAL_CHAIN_TABLES` ("Task 6 re-registers them
  under the finance extract/receiver, which empties this list").
- `worker/{main,production}.ts` — the receiver's schedule, beside the deletion tick.

## What Task 6 owns, from C5 and the derived budgets

1. A **retention clock authority**: every `RetentionRule` maps to exactly one clock. Compile
   closed (`satisfies Record<RetentionRule, …>`), so a rule added later without a clock is a
   typecheck failure, not a silently un-swept table.
2. The **pre-redaction Stripe finance extractor** — a same-transaction extract that runs
   *before* `stripe_events.payload` is redacted, into a new lifecycle-covered staging table.
3. **One scheduled, idempotent, traffic-independent receiver** covering every scheduled clock.
4. The **`generation_attempts` one-minute receiver** — 15 m claimed, deadline + 5 m
   vendor_started, 5 m vendor_complete settlement, the 24 h hard clear, the one-year terminal
   expiry.
5. **Worker health and alerts** for the receiver: rows scanned/redacted/deleted by table,
   oldest overdue age, blocked-deletion count, dead-letter count, tombstone/backup-expiry
   alerts. Codes, counts and opaque ids only.
6. The **financial-chain re-registration** that empties `FINANCIAL_CHAIN_TABLES` and lets
   `erasureHold` return null.

## The structural decision this task cannot avoid

`workspace_spend_monthly` survives workspace deletion because it has **no foreign key**
(`FINAL_SCHEMA_FOREIGN_KEYS.workspace_spend_monthly = []`) and its `workspace_id` is
pseudonymised in place. The four tables in `FINANCIAL_CHAIN_TABLES` do not have that shape:

| table | current FK | on delete |
|---|---|---|
| `credit_ledger` | `credit_ledger_workspace_id_workspaces_id_fk` | cascade |
| `subscriptions` | `subscriptions_workspace_id_workspaces_id_fk` | cascade |
| `pause_periods` | `pause_periods_workspace_id_workspaces_id_fk` | cascade |
| `model_usage` | `model_usage_profile_workspace_fk` | cascade |

A seven-year financial clock and a cascading FK to the row being erased are contradictory:
whichever wins, the other is a lie. C3 settles which one wins — "Financial/audit rows retain
only the minimum approved pseudonymous workspace key" — so the FK goes and the link
pseudonymises, exactly as `workspace_spend_monthly` already does.

**This is the intricate seam of the task and it is built first, with its own tests, before any
receiver is wired.** Getting it wrong destroys money records or retains identity.

## Deliverables

- **6.1** `packages/db/src/retention-clocks.ts` — the compile-closed `RetentionRule → clock`
  authority. Three clock kinds: `subject_lifetime` (no receiver — the scope executor erases
  it), `scheduled { measuredFrom, duration, precondition }`, and `financial_chain` (whose
  destructive receiver stays **disabled** pending jurisdiction/ledger review, R-122). A
  registry entry whose executor is a receiver but whose rule has no scheduled clock is a
  closure failure.
- **6.2** Migration `0053` + schema: `stripe_finance_extracts`; the four financial-chain FK
  drops; the pseudonymous workspace/profile key columns those tables need.
- **6.3** `packages/db/src/finance-extract.ts` — the pure extractor (Stripe object → content-free
  finance facts, `complete | incomplete(reason)`), and its same-transaction call site *before*
  payload redaction.
- **6.4** `packages/db/src/retention-receiver.ts` — the one idempotent sweep, registry-driven,
  returning per-table scanned/redacted/deleted counts and the oldest overdue age.
- **6.5** `packages/db/src/generation-recovery.ts` — the attempt receiver's five boundaries.
- **6.6** `worker/retention.ts` + wiring in `worker/{handlers,production,main,pg-boss-runtime}.ts`,
  and the receiver's alert codes in `worker/health.ts`.
- **6.7** The seam flips: `STRIPE_PAYLOAD_RECEIVER_WIRED = true`, `FINANCIAL_CHAIN_TABLES` empty,
  `erasureHold` → null, and the Task-4/5 comments that name Task 6 updated to what shipped.

## Out of scope (named, not silently dropped)

- The **activation classifier** and `activation_cohort_daily` — task-sequence item 7.
- The **owner-facing UI** and privacy/export copy — item 8.
- The **registration checklist/API** for 10a/10b-2/10c — item 9.
- The **destructive financial receiver**: built as a *reporting* receiver only; R-122 keeps
  the destructive half disabled until jurisdiction and ledger-chain review.
- **10b-2's projector**: this task writes the staging rows and their `incomplete` authority;
  consuming them idempotently is 10b-2's.
- Any external effect — no bucket, no charge, no mail, no deploy.

## Verification this task must produce

Focused, then the canonical gate at a stable boundary:

- Financial-chain: a workspace erasure retains all four tables with a pseudonymous key and no
  re-linkage path; a profile erasure retains `model_usage`; residue probes agree.
- Clocks: every `RetentionRule` has exactly one clock; every receiver-executor entry has a
  scheduled clock; a new unregistered table or a rule without a clock fails.
- Receiver: null/deleted-workspace Stripe rows swept; no-traffic expiry; large batch; partial
  failure and resume; idempotent re-run; financial rows never deleted.
- Finance extract: redaction cannot run before extraction (same transaction, ordered);
  unparseable/absent field → `incomplete(reason)`, never zero, never a delayed deadline.
- Attempts: the 5 m / 15 m / deadline+5 m / 24 h / one-year boundaries, settlement without a
  provider call, terminal clear, financial-chain linkage.
- Health: content-free codes/counts only; alert thresholds fire.
- Mutations from the plan's matrix, planted and reddened: "Redact Stripe payload before finance
  extraction or purge one ledger-chain row", "Ignore null/deleted-workspace retention rows".

## Stop conditions

- If the financial-chain re-registration cannot be made without either destroying a money
  record or retaining a re-linkable identity, stop and report rather than choosing one.
- If any receiver would need to run inside an HTTP request, stop: C2 puts the eraser in the
  worker only.

---

## Build record (2026-09-08)

### The structural decision, as built — and the correction that got there

The contract above proposed **dropping** the four cascade foreign keys. That was
wrong, and the suite proved it within one run: dropping
`model_usage_profile_workspace_fk` did not only remove a cascade, it removed the
composite key that structurally refuses a **cross-parented row**. Two tenancy
tests (`brain-schema.test.ts` "a CROSS-PARENTED row is refused by every
composite FK", `profile-scope.test.ts` P4) went red immediately — Respin
non-negotiable 5, caught by exactly the guard written to catch it.

**As shipped:** every key stays; only its delete action moves, `cascade →
restrict`. A seven-year clock and a CASCADE contradict each other; a seven-year
clock and RESTRICT do not. At erasure the existing `link` scrub rule repoints
the column to the "Deleted workspace" / "Deleted profile" stub that
`lifecycle-sql-port.ts` already mints, and `orderTargetsForExecution` already
ranks `pseudonymise` ahead of every cascade and puts root tables last — so the
links move before the root row goes. The machinery this needed already existed.

### Two defects only a real database could find

Both had the same shape: the receiver catches per table, so a broken sweep is a
**silent** no-op rather than a loud failure.

1. `stripe_finance_extracts.id` carries drizzle's `$defaultFn`, which is
   CLIENT-side and does not run for raw SQL. Every payload sweep aborted on the
   NOT NULL constraint, so the redaction never ran — while
   `STRIPE_PAYLOAD_RECEIVER_WIRED = true` unlocked erasure on the strength of it.
   The id is now minted in `persistFinanceExtractsInTx`.
2. The 24-hour hard clear moved `vendor_complete → recovery_required` without
   clearing `candidate`. `generation_attempts_candidate_iff_vendor_complete` is
   an EQUALITY, so the row is refused and the whole tick aborts. Fixed as a
   class: every transition in `generation-recovery.ts` clears the candidate.

A third was found by the closure written in 6.1: four measures named columns
that do not exist (`captured_at`, `occurred_at` ×3 — both are `created_at`).
All 28 measure columns were then checked at once rather than one at a time.

### Test movement

Twenty tests moved. Only one was a defect in the product (the cross-parented
leak above); four were defects in Task 6's own new code; the other fifteen were
tests pinning pre-Task-6 behaviour — several named for it ("pins current finance
rows to physical workspace cascades **until Task 6 replaces them**", "TASK-6
FLIP POINT, not desired behaviour"). Each was rewritten to pin the new contract
rather than deleted:

- `deletion-executor.test.ts` now asserts the finance rows are **retained AND
  repointed** after erasure — surviving alone would be retention without
  erasure, repointed alone would be erasure without retention — and that the
  stub they point at is a real row, so no retained money record dangles.
- `brain-schema.test.ts` and `db.test.ts` pin **both halves** of the new
  contract: the raw delete is REFUSED while a retained row still points at the
  workspace, and REQ-A04 is still possible once the links are repointed.
- `spend-rollup.test.ts`'s "KNOWN LIMITATION" (one profile of a multi-profile
  workspace false-positiving as DRIFT) is genuinely **closed** by retention —
  its own comment asked for that to be recorded when the assertion flipped.
- Both lifted holds keep a **planted-hold witness**, so `erasureHold`'s refusal
  is not dead code now that nothing real triggers it.

### What is NOT proven

- No S3 bucket, no charge, no mail, no deploy — unchanged from Task 5.
- The receiver is proven against PGlite and the shipped migrations; the
  live-Postgres run is the CI shape and is reported separately.
- The **destructive** financial receiver remains disabled (R-122): Task 6 ships
  the retention and reporting halves only, and no financial table appears in any
  sweep spec — asserted structurally, not by inspection.
- Tasks 7 (activation classifier), 8 (owner UI), 9 (registration API) are
  untouched and remain open.
