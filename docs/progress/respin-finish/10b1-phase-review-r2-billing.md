# Respin billing & credits review — Phase 10b-1 independent review, round 2 (2026-09-09)

*Report returned by `respin-billing-reviewer`; saved verbatim by the review lane.*

**Readiness: Almost · Grade: B · Every round-1 money finding is closed by code that runs green, but the erasure-time finance extract — the one guarantee that lets the payload purge be safe — has no witness, and two comments written by the fixes claim guards their files do not have.**

0 BLOCK · 4 CHANGE · 4 NOTE. Round-1 movement: 1 BLOCK RESOLVED, 4 High RESOLVED, 6 Medium RESOLVED, 1 Medium PARTIAL (T69-R5, not re-verified here), 1 Medium UNCHANGED (T69-R2). The item fixed after the build lane's round 2 without re-review is RESOLVED and non-vacuous.

**Scope**: the whole uncommitted tree against `d5fbaf7`, read through the money path: finance extract, receiver, clocks, executor, lifecycle, billing schema, registry, external copies, request enablement, migrations 0055–0057, the credits Stripe modules and facade, the scripts, the price JSONs, the account surface, `billing-errors.ts`, the worker, and their tests. Round 1, the ledger's fix-round entries, the register's 2026-09-09 section, and both build-lane billing reports read first.

## Movement on round-1 findings

| Round-1 finding | Status | Evidence |
|---|---|---|
| BLOCK — negative proration wedge, `oldestOverdueMs` null on failure | **RESOLVED** | 0055 `amounts_shape`; `retention-receiver.ts:416-500` per-row fallback counting `poisoned`; `:512-516` measures on both paths; three regression tests `retention-receiver.test.ts:565-643` red-on-revert; `worker/retention.ts:116-122` pages `retention_poisoned_rows`. |
| High — `currency` literal `'USD'` | RESOLVED | `finance-extract.ts:126,236-249`; `currency_shape` CHECK; tests. |
| High — T69-R14 tax-inclusive amounts | RESOLVED | `amount_including_tax_cents` (0055); `taxBasis` required; tests. |
| High — payload survives identity erasure; `billing_contact_user_id` absent | RESOLVED (B7 gap in CHANGE 1) | `purgeSubjectStripePayloadsInTx` inside the erasure transaction before the executors (`deletion-executor.ts:617-633`); `deletion-executor.test.ts:632,721` assert `{}`. C3 built: 0056, `assertBillingContactReleased` on six sites plus the executor (`:560-572`, witnessed); `acceptBillingContact` provider-first, verified, per-call nonce, owner-only. |
| High — credentialed URI on argv | RESOLVED in code (comment defect, CHANGE 3) | `backup.sh:102-116`, `restore-drill.sh:118-132` `*_SAFE`; `shell-credentials.test.ts` non-vacuous. |
| Medium — dead `recovery_secret` specs | RESOLVED | `retention-clocks.ts:274-292, :303-321`; T-R2-8 witness. |
| Medium — 5 of 29 specs populated | RESOLVED | `retention-sweep-fixtures.test.ts` 7/7; found T-R2-1, now `orderChildrenFirst`. |
| Medium — forecast CLI exit codes; `ownerCostCeilingCents` producer | RESOLVED | `journal-forecast.ts:74-91`; three priced cases; clamp witness 63c under 10c; snapshot pinned to the evidence. |
| Medium — unattributed `linkable_source_ids` | RESOLVED | structurally NULL, refused-insert witness `retention-receiver.test.ts:668-687`. |
| Medium — dispute row `complete` with null timestamp | RESOLVED | `missing_dispute_effective_at`. |
| Medium — T69-R5 registration | PARTIAL / not re-verified | `retention-alerts.test.ts` green for alerts; registration half not re-verified here. |
| Medium — T69-R2 predicate-independent backlog age | UNCHANGED | still open in the register. |
| Build-lane round-2 CHANGE fixed without re-review | RESOLVED, non-vacuous | `deletion-commands.test.ts:223-238` through `execute` and `reconcile`. |

## Findings

- ⚠️ CHANGE `respin/packages/db/src/retention-receiver.ts:382` with `deletion-executor.test.ts:632,721` — **The extract-before-purge at erasure has no witness (B7).** No test calls `purgeSubjectStripePayloadsInTx` outside the two source files, and the executor suite never reads `stripe_finance_extracts`; the fixture payload has no `data.object`. Delete line 382 and every suite stays green while a completed erasure destroys the seven-year finance fact permanently. · Fix: seed a real `invoice.paid` payload in `populate` and, after `complete` for both identity and workspace cases, assert one `complete` extract row with `workspace_key = pseudonymousWorkspaceKey(fixture.workspaceId)` and the line amount.
- ⚠️ CHANGE `respin/packages/db/src/billing-schema.ts:1118-1120` — "The two revenue columns are SIGNED, because credits and refunds are negative revenue" is false of the stored data: `credit_note` books `total_excluding_tax` positive (`finance-extract.ts:290`, test pins `700`), `refund.amount` positive (`:277`, pins `2280`); only an invoice line carries Stripe's sign. A 10b-2 projector summing the column adds credit notes and refunds to revenue. · Fix: negate `credit_note` and `refund` at extraction, or rewrite the comment to say sign is per `object_type`; pin it.
- ⚠️ CHANGE `respin/scripts/restore-drill.sh:105-113` — the new comment names `assert_no_credentialed_argv` "at the foot of this script"; that identifier occurs only in the comment. The real witness is `tests/shell-credentials.test.ts`. · Fix: name the test, as `backup.sh:87-91` does.
- ⚠️ CHANGE `respin/packages/db/src/retention-receiver.ts:483-487` with `:442,:458` (medium confidence on the rule, low on frequency) — **The per-row fallback deletes by a `ctid` claimed in a separate, committed transaction.** The `FOR UPDATE SKIP LOCKED` lock is released at commit; `apply` then runs `DELETE … WHERE ctid IN (…)` with no predicate. A `ctid` is stable only under lock: a slot vacuumed and reused between claim and apply deletes an unrelated row. Milliseconds, only after a poisoned batch, but this receiver destroys rows across ~15 governed tables. · Fix: re-apply `overduePredicate` (and `NOT redactionDonePredicate`) in the per-row statement, or claim and apply one row inside one transaction.
- 💡 NOTE `deletion-lifecycle.ts:861-871` — the least-confident line holds; `unknownInMembership` refuses every MEMBER (T-R2-5 has it right; the ledger's wording said owners).
- 💡 NOTE `journal-forecast.ts:7,88-91` — `--owner-ceiling-cents` is "a RECORDED owner decision" but nothing requires the decision to be named. · Consider a required `--owner-decision <ref>`.
- 💡 NOTE `billing-contact.ts:130` — the handover blanks name/address/phone/description/shipping on a live paying customer; invoice finalisation unaffected (no `automatic_tax`/`customer_update`), but hosted invoices carry no customer name or address from then on. A product decision to record beside T-R2-7.
- 💡 NOTE `billing-schema.ts:1120-1121` — "no projector can double-book by summing the pair" is true within a row, not across rows (invoice line + `charge` + `payment_intent` for one payment); the rows carry ids for de-duplication, the comment should say the projector must do it.

## Checks run

- B1 ledger append-only — ✅ (credits diff is facade wiring, two call sites, the contact on INSERT, the shared predicate, the new module; `customers.ts:106` sole inserter). B2 idempotency — ✅ (no webhook change; fresh handover key; erasure key unchanged; the purge is idempotent via the `payload::text <> '{}'` filter and `ON CONFLICT … DO NOTHING`). B3 — n/a (nothing re-reads `stripe_events.payload` after receipt). B4 — n/a. B5 — ✅ snapshot equals the evidence. B6 — ✅ owner-only, session email. Threshold provenance — ✅ with one NOTE. B7 — ❌ one gap (CHANGE 1); every other witness read red-on-revert (reasoning from test text; no mutations planted, read-only).

## Coverage

- read fully: the money-path sources and diffs listed in Scope, migrations 0055-0057, `shell-credentials.test.ts`, both price JSONs, the account surface diffs, the money tests' diffs, round 1, both build-lane billing reports, ledger, register, the skill canon · skimmed: `retention-sweep-fixtures.test.ts`, `deletion-journal-cost.ts` (clamp), `retention-alerts.test.ts`, `account-copy.test.ts` · not read: `lifecycle-column-census.ts`, `lifecycle-sql-port.ts`, `trends-schema.ts`, `activation.ts`, `auth-mail*.ts`, the S3 templates, `deletion-executor.docker.test.ts`, `trend-rights-keys.test.ts`, `import-boundary.test.ts`, `table-writers.test.ts`.
- commands run: `git diff HEAD --stat -- respin/` (64 files, +3053/−488), `git status --short` (33 untracked); ripgrep for payload readers, `automatic_tax|customer_update`, the subscriptions inserter, `purgeSubjectStripePayloadsInTx`, extract reads in the executor test, `assert_no_credentialed_argv`, `runRetentionTick(` callers; `vitest run` over ten money suites → 121/121; `vitest run deletion-executor deletion-lifecycle -t "C3|billing contact|payload|retained|erases|USER|MEMBER"` → 8 passed; `vitest run retention-sweep-fixtures` → 7/7.

## Verdict

NEEDS CHANGES
No mutable balance, no unkeyed provider write, no unmetered path, no invented price, and every round-1 money finding is closed by code that runs — but the erasure-time finance extract that makes the payload purge safe has no witness, the schema tells the next slice a column is signed when its stored credit notes and refunds are not, and the drill's comment cites a guard that does not exist.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
