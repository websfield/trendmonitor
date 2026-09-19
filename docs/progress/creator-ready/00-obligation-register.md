# Creator-ready Phase 0 obligation register

Observed 2026-09-16T11:03:23.180Z at HEAD `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`. Routing observations only; no obligation status or historical-record assessment.

T3 pointers in rows (12)/(13) refreshed 2026-09-17 from owner-run database output; the original file-population and witness observation dates remain unchanged. No obligation status is inferred.

Journey findings F-01–F-21 route via `docs/progress/respin-journey-fixes-audit.md`'s Disposition column and the master plan's Phase-number translation paragraph; this register adds nothing to them.

All 24 rows below have eight columns. Row numbers identify the plan pins; the obligation labels are copied verbatim. The resumed T6 test run observed 75 green and 9 skipped (NOT RUN) unique witness files. Results cite transcript lines below; green does not settle an obligation.

| obligation | current-code citation | witness observed | what is missing to settle this | cited at | audit F-id | receiving creator-ready phase | re-checked against P1 |
|---|---|---|---|---|---|---|---|
| signup | Admission and entitlement (12 files) | Admission and entitlement (5 files); 5 green | owner input: the approved pilot admission rule | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Admission and entitlement: clean; witness Admission and entitlement: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| OAuth | Admission and entitlement (12 files) | Admission and entitlement (5 files); 5 green | owner input: the approved pilot admission rule | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Admission and entitlement: clean; witness Admission and entitlement: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| workspace/bootstrap | Admission and entitlement (12 files) | Admission and entitlement (5 files); 5 green | owner input: the approved pilot admission rule | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Admission and entitlement: clean; witness Admission and entitlement: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| scope | Scope and plan checks (4 files) | Scope and plan checks (6 files); 6 green | run respin/packages/db/tests/with-workspace.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Scope and plan checks: clean; witness Scope and plan checks: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| plan | Scope and plan checks (4 files) | Scope and plan checks (6 files); 6 green | run respin/packages/db/tests/profile-scope.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Scope and plan checks: clean; witness Scope and plan checks: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| full-script entitlement | Scope and plan checks (4 files) | Scope and plan checks (6 files); 6 green | run respin/tests/action-gate.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Scope and plan checks: clean; witness Scope and plan checks: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| journal provisioning | Deletion and recovery (30 files) | Deletion and recovery (25 files); 23 green; NOT RUN: respin/packages/db/tests/deletion-executor.docker.test.ts; NOT RUN: respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts | owner input: whether the R-124 provisioning evidence settles this row | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Deletion and recovery: clean; witness Deletion and recovery: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| restore | Deletion and recovery (30 files) | Deletion and recovery (25 files); 23 green; NOT RUN: respin/packages/db/tests/deletion-executor.docker.test.ts; NOT RUN: respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts | external action: the production restore walk | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Deletion and recovery: clean; witness Deletion and recovery: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| autopsy scrub residual | Deletion and recovery (30 files) | Deletion and recovery (25 files); 23 green; NOT RUN: respin/packages/db/tests/deletion-executor.docker.test.ts; NOT RUN: respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts | run respin/packages/db/tests/autopsy-policy.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Deletion and recovery: clean; witness Deletion and recovery: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| retained fields/records | Deletion and recovery (30 files) | Deletion and recovery (25 files); 23 green; NOT RUN: respin/packages/db/tests/deletion-executor.docker.test.ts; NOT RUN: respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts | run respin/packages/db/tests/retention-sweep-fixtures.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Deletion and recovery: clean; witness Deletion and recovery: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| delayed-job resurrection | Deletion and recovery (30 files) | Deletion and recovery (25 files); 23 green; NOT RUN: respin/packages/db/tests/deletion-executor.docker.test.ts; NOT RUN: respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts | run respin/worker/tests/deletion-lifecycle.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Deletion and recovery: clean; witness Deletion and recovery: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| configuration vs checkout/entitlements/costs | SELECT version, content FROM config_versions ORDER BY version DESC LIMIT 1 (T3); result pointer: 00-config-offer-comparison.md | Billing configuration (40 files); 33 green; NOT RUN: respin/packages/credits/tests/auto-topup-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/concurrency.docker.test.ts; NOT RUN: respin/packages/credits/tests/free-mint.docker.test.ts; NOT RUN: respin/packages/credits/tests/generate-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/inference-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/pasted-reference.docker.test.ts; NOT RUN: respin/packages/credits/tests/profiles.docker.test.ts | owner input: the approved offer/configuration record | n/a (query) | none (owner §3 obligation); overlap (12) ↔ F-12 | Phase 3 | not yet (P1 absent) |
| seeded tier/add-on | Seed (1 file); SELECT version, content FROM config_versions ORDER BY version DESC LIMIT 1 (T3); result pointer: 00-config-offer-comparison.md | Billing configuration (40 files); 33 green; NOT RUN: respin/packages/credits/tests/auto-topup-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/concurrency.docker.test.ts; NOT RUN: respin/packages/credits/tests/free-mint.docker.test.ts; NOT RUN: respin/packages/credits/tests/generate-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/inference-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/pasted-reference.docker.test.ts; NOT RUN: respin/packages/credits/tests/profiles.docker.test.ts | re-read respin/packages/db/src/seed.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Seed: clean; witness Billing configuration: clean | none (owner §3 obligation) | Phase 3 | not yet (P1 absent) |
| grant/invoice/cancellation/failure | Billing configuration (24 files) | Billing configuration (40 files); 33 green; NOT RUN: respin/packages/credits/tests/auto-topup-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/concurrency.docker.test.ts; NOT RUN: respin/packages/credits/tests/free-mint.docker.test.ts; NOT RUN: respin/packages/credits/tests/generate-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/inference-race.docker.test.ts; NOT RUN: respin/packages/credits/tests/pasted-reference.docker.test.ts; NOT RUN: respin/packages/credits/tests/profiles.docker.test.ts | run respin/packages/credits/tests/stripe.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Billing configuration: clean; witness Billing configuration: clean | none (owner §3 obligation) | Phase 3 | not yet (P1 absent) |
| collectors | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | external action: create the telemetry collector accounts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| content minimisation | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | run respin/tests/telemetry.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| spend/error visibility | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | run respin/tests/probe-artifacts.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| alert recipients | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | owner input: the named alert recipients | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| recovery diagnosis | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | run respin/worker/tests/retention-alerts.test.ts | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| support contact | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | owner input: the approved support contact | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| incident/rollback owners | Telemetry and support (25 files) | Telemetry and support (5 files); 5 green | owner input: the named incident and rollback owners | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Telemetry and support: clean; witness Telemetry and support: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| placeholders | Customer documents (10 files) | Customer documents (4 files); 4 green | owner input: the approved customer-document copy | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Customer documents: clean; witness Customer documents: clean | none (owner §3 obligation) | Phase 4 | not yet (P1 absent) |
| page/help/checkout alignment | Customer documents (10 files); Checkout (2 files) | Customer documents (4 files); 4 green | owner input: the approved offer, data and support copy | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Customer documents: clean; Checkout: clean; witness Customer documents: clean | none (owner §3 obligation); overlaps (23) ↔ F-01, (23) ↔ F-17 | Phase 7; checkout part → Phase 3 | not yet (P1 absent) |
| Docker-suite count | Documentation drift (26 files); three sources state two / nine / all 12 concurrency suites against the 23-file Docker glob (appendix) | none identified | re-read CLAUDE.md, respin/docker-compose.yml and docs/plans/respin-finish-master-plan.md | 79de2dbb14944f2f3089c621dc8bc9d31e0c1882; 2026-09-16T11:03:23.180Z; Documentation drift: clean | none (owner §3 obligation) | master plan Deferral Ledger: documentation drift (owner-assigned track) | not yet (P1 absent) |

## Populations appendix

Enumeration follows the phase-plan globs and explicit lists. Each listed file was opened with `fs.readFileSync` in the same invocation that wrote this appendix; bytes were read in full, without interpreting obligation status. This is a mechanical population read, not a semantic code review. Populations are unique within each list; shared members intentionally recur across groups.

### Read: Admission and entitlement (12 files)

Plan count: 12; observed: 12; no count divergence. Admission and entitlement: clean.

- `respin/packages/auth/src/allowlist.ts`
- `respin/packages/auth/src/client-ip.ts`
- `respin/packages/auth/src/client.ts`
- `respin/packages/auth/src/create-auth.ts`
- `respin/packages/auth/src/index.ts`
- `respin/packages/auth/src/resend-mail.ts`
- `respin/packages/auth/src/server.ts`
- `respin/app/(auth)/auth-form.tsx`
- `respin/app/(auth)/layout.tsx`
- `respin/app/(auth)/recover-deletion/page.tsx`
- `respin/app/(auth)/sign-in/page.tsx`
- `respin/app/(auth)/sign-up/page.tsx`

### Read: Scope and plan checks (4 files)

Plan count: 4; observed: 4; no count divergence. Scope and plan checks: clean.

- `respin/packages/db/src/with-workspace.ts`
- `respin/packages/credits/src/app-server.ts`
- `respin/packages/credits/src/mode-access.ts`
- `respin/packages/credits/src/generate.ts`

### Read: Deletion and recovery (30 files)

Plan count: 30; observed: 30; no count divergence. Deletion and recovery: clean.

- `respin/packages/db/src/deletion-executor.ts`
- `respin/packages/db/src/deletion-external-commands.ts`
- `respin/packages/db/src/deletion-journal-compose.ts`
- `respin/packages/db/src/deletion-journal-cost.ts`
- `respin/packages/db/src/deletion-journal-restore.ts`
- `respin/packages/db/src/deletion-journal-s3.ts`
- `respin/packages/db/src/deletion-journal.ts`
- `respin/packages/db/src/deletion-lifecycle.ts`
- `respin/packages/db/src/deletion-ports.ts`
- `respin/packages/db/src/deletion-request-enablement.ts`
- `respin/worker/activation-emitter.ts`
- `respin/worker/autopsy-vendor.ts`
- `respin/worker/calendar-date.ts`
- `respin/worker/deletion-lifecycle.ts`
- `respin/worker/env.ts`
- `respin/worker/handlers.ts`
- `respin/worker/health.ts`
- `respin/worker/index.ts`
- `respin/worker/main.ts`
- `respin/worker/pg-boss-runtime.ts`
- `respin/worker/pool.ts`
- `respin/worker/production.ts`
- `respin/worker/refresh.ts`
- `respin/worker/retention.ts`
- `respin/worker/retry.ts`
- `respin/worker/run-once.ts`
- `respin/worker/system-autopsy.ts`
- `respin/worker/system-usage.ts`
- `respin/worker/vitest.config.ts`
- `respin/worker/weekly-digest.ts`

### Read: Billing configuration (24 files)

Plan count: 24; observed: 24; no count divergence. Billing configuration: clean.

- `respin/packages/credits/src/stripe/actions.ts`
- `respin/packages/credits/src/stripe/adapter.ts`
- `respin/packages/credits/src/stripe/auto-topup-authority.ts`
- `respin/packages/credits/src/stripe/auto-topup-rollout-cli.ts`
- `respin/packages/credits/src/stripe/auto-topup-rollout-reconcile.ts`
- `respin/packages/credits/src/stripe/auto-topup-rollout.ts`
- `respin/packages/credits/src/stripe/auto-topup-v1-reconcile-cli.ts`
- `respin/packages/credits/src/stripe/auto-topup-v1-reconcile.ts`
- `respin/packages/credits/src/stripe/auto-topup.ts`
- `respin/packages/credits/src/stripe/billing-contact.ts`
- `respin/packages/credits/src/stripe/customers.ts`
- `respin/packages/credits/src/stripe/deletion-commands.ts`
- `respin/packages/credits/src/stripe/pack-checkout-authority.ts`
- `respin/packages/credits/src/stripe/pack-price.ts`
- `respin/packages/credits/src/stripe/setup-cli.ts`
- `respin/packages/credits/src/stripe/setup.ts`
- `respin/packages/credits/src/stripe/tier-checkout-authority.ts`
- `respin/packages/credits/src/stripe/tier-checkout-rollout-cli.ts`
- `respin/packages/credits/src/stripe/tier-checkout-rollout.ts`
- `respin/packages/credits/src/stripe/tier-checkout-v1-reconcile.ts`
- `respin/packages/credits/src/stripe/tier-invoice-authority.ts`
- `respin/packages/credits/src/stripe/webhooks.ts`
- `respin/packages/credits/src/ledger.ts`
- `respin/packages/credits/src/balance.ts`

### Read: Telemetry and support (25 files)

Plan count: 25; observed: 25; no count divergence. Telemetry and support: clean.

- `respin/packages/db/src/telemetry-sinks.ts`
- `respin/lib/telemetry.ts`
- `respin/instrumentation-node.ts`
- `respin/app/(product)/safe-log.ts`
- `respin/packages/credits/src/metrics.ts`
- `respin/worker/activation-emitter.ts`
- `respin/worker/autopsy-vendor.ts`
- `respin/worker/calendar-date.ts`
- `respin/worker/deletion-lifecycle.ts`
- `respin/worker/env.ts`
- `respin/worker/handlers.ts`
- `respin/worker/health.ts`
- `respin/worker/index.ts`
- `respin/worker/main.ts`
- `respin/worker/pg-boss-runtime.ts`
- `respin/worker/pool.ts`
- `respin/worker/production.ts`
- `respin/worker/refresh.ts`
- `respin/worker/retention.ts`
- `respin/worker/retry.ts`
- `respin/worker/run-once.ts`
- `respin/worker/system-autopsy.ts`
- `respin/worker/system-usage.ts`
- `respin/worker/vitest.config.ts`
- `respin/worker/weekly-digest.ts`

### Read: Customer documents (10 files)

Plan count: 10; observed: 10; no count divergence. Customer documents: clean.

- `respin/app/(marketing)/audiences.ts`
- `respin/app/(marketing)/changelog/entries.ts`
- `respin/app/(marketing)/changelog/page.tsx`
- `respin/app/(marketing)/for/[audience]/page.tsx`
- `respin/app/(marketing)/landing-sections.tsx`
- `respin/app/(marketing)/legal/page.tsx`
- `respin/app/(marketing)/page.tsx`
- `respin/app/(marketing)/pricing-copy.ts`
- `respin/app/(marketing)/sample-spin/sample-spin-panel.tsx`
- `respin/app/(marketing)/sample-spin/sample-spin-section.tsx`

### Read: Documentation drift (26 files)

Original requirement-2 summary count: 23; observed: 26. Count divergence: the summary omitted the three documentation sources from its total; the pinned membership is those three sources plus 23 Docker suites. The summary was corrected to 26 on 2026-09-17 (P0-B13-2); membership is unchanged. Documentation drift: clean at the recorded inspection HEAD/date.

Count wording: `CLAUDE.md:73` — the two Docker concurrency suites.

Count wording: `respin/docker-compose.yml:15` — nine .docker.test.ts.

Count wording: `docs/plans/respin-finish-master-plan.md:182` — all 12 concurrency suites.

This population comprises the three documentation sources plus 23 Docker test files; it is not a witnessing suite.

- `CLAUDE.md`
- `respin/docker-compose.yml`
- `docs/plans/respin-finish-master-plan.md`
- `respin/packages/config/tests/migrate-config.docker.test.ts`
- `respin/packages/credits/tests/auto-topup-race.docker.test.ts`
- `respin/packages/credits/tests/concurrency.docker.test.ts`
- `respin/packages/credits/tests/free-mint.docker.test.ts`
- `respin/packages/credits/tests/generate-race.docker.test.ts`
- `respin/packages/credits/tests/inference-race.docker.test.ts`
- `respin/packages/credits/tests/pasted-reference.docker.test.ts`
- `respin/packages/credits/tests/profiles.docker.test.ts`
- `respin/packages/db/tests/activate.docker.test.ts`
- `respin/packages/db/tests/auth-mail-quota.docker.test.ts`
- `respin/packages/db/tests/brain-concurrency.docker.test.ts`
- `respin/packages/db/tests/concurrency.docker.test.ts`
- `respin/packages/db/tests/deletion-executor.docker.test.ts`
- `respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts`
- `respin/packages/db/tests/frameworks-concurrency.docker.test.ts`
- `respin/packages/db/tests/generation-schema.docker.test.ts`
- `respin/packages/db/tests/included-build-backfill.docker.test.ts`
- `respin/packages/db/tests/interview-ops.docker.test.ts`
- `respin/packages/db/tests/promotion-concurrency.docker.test.ts`
- `respin/packages/db/tests/promotion-migration.docker.test.ts`
- `respin/packages/db/tests/public-sample-spin.docker.test.ts`
- `respin/packages/db/tests/spend-rollup.docker.test.ts`
- `respin/tests/pg-boss.docker.test.ts`

### Read: Seed (1 files)

Plan count: 1; observed: 1; no count divergence. Seed: clean.

- `respin/packages/db/src/seed.ts`

### Read: Checkout (2 files)

Plan count: 2; observed: 2; no count divergence. Checkout: clean.

- `respin/app/(product)/settings/billing/billing-view.tsx`
- `respin/app/(product)/settings/billing/page.tsx`

### Witness: Admission and entitlement (5 files)

Plan count: 5; observed: 5; no count divergence.

- `respin/packages/auth/tests/auth-mail-wiring.test.ts` — green (entry-gate-phase-0.txt:1208)
- `respin/packages/auth/tests/auth.test.ts` — green (entry-gate-phase-0.txt:1192)
- `respin/packages/auth/tests/client-ip.test.ts` — green (entry-gate-phase-0.txt:1551)
- `respin/packages/auth/tests/rate-limit.test.ts` — green (entry-gate-phase-0.txt:1237)
- `respin/packages/auth/tests/resend-mail.test.ts` — green (entry-gate-phase-0.txt:1555)

### Witness: Scope and plan checks (6 files)

Plan count: 6; observed: 6; no count divergence.

- `respin/packages/db/tests/with-workspace.test.ts` — green (entry-gate-phase-0.txt:683)
- `respin/packages/db/tests/profile-scope.test.ts` — green (entry-gate-phase-0.txt:860)
- `respin/packages/db/tests/profile-selection.test.ts` — green (entry-gate-phase-0.txt:1280)
- `respin/tests/profile-cage.test.ts` — green (entry-gate-phase-0.txt:988)
- `respin/tests/scope-cage-duplication.test.ts` — green (entry-gate-phase-0.txt:1427)
- `respin/tests/action-gate.test.ts` — green (entry-gate-phase-0.txt:1204)

### Witness: Deletion and recovery (25 files)

Plan count: 25; observed: 25; no count divergence.

- `respin/packages/db/tests/deletion-executor.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1707; Vitest skipped)
- `respin/packages/db/tests/deletion-executor.test.ts` — green (entry-gate-phase-0.txt:1371)
- `respin/packages/db/tests/deletion-external-commands.test.ts` — green (entry-gate-phase-0.txt:967)
- `respin/packages/db/tests/deletion-journal-s3.test.ts` — green (entry-gate-phase-0.txt:1541)
- `respin/packages/db/tests/deletion-journal.test.ts` — green (entry-gate-phase-0.txt:1540)
- `respin/packages/db/tests/deletion-lifecycle.test.ts` — green (entry-gate-phase-0.txt:585)
- `respin/packages/db/tests/deletion-recovery-concurrency.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1705; Vitest skipped)
- `respin/packages/db/tests/deletion-request-enablement.test.ts` — green (entry-gate-phase-0.txt:1599)
- `respin/worker/tests/activation-emitter.test.ts` — green (entry-gate-phase-0.txt:1578)
- `respin/worker/tests/autopsy-vendor.test.ts` — green (entry-gate-phase-0.txt:1588)
- `respin/worker/tests/autopsy.test.ts` — green (entry-gate-phase-0.txt:1501)
- `respin/worker/tests/deletion-lifecycle.test.ts` — green (entry-gate-phase-0.txt:1560)
- `respin/worker/tests/env.test.ts` — green (entry-gate-phase-0.txt:1595)
- `respin/worker/tests/handlers.test.ts` — green (entry-gate-phase-0.txt:1580)
- `respin/worker/tests/health.test.ts` — green (entry-gate-phase-0.txt:1590)
- `respin/worker/tests/pg-boss-runtime.test.ts` — green (entry-gate-phase-0.txt:1558)
- `respin/worker/tests/pool.test.ts` — green (entry-gate-phase-0.txt:1554)
- `respin/worker/tests/production-sources.test.ts` — green (entry-gate-phase-0.txt:1586)
- `respin/worker/tests/production.test.ts` — green (entry-gate-phase-0.txt:1561)
- `respin/worker/tests/retention-alerts.test.ts` — green (entry-gate-phase-0.txt:1601)
- `respin/worker/tests/retry.test.ts` — green (entry-gate-phase-0.txt:1597)
- `respin/worker/tests/run-once.test.ts` — green (entry-gate-phase-0.txt:1581)
- `respin/worker/tests/schedules.test.ts` — green (entry-gate-phase-0.txt:1587)
- `respin/packages/db/tests/autopsy-policy.test.ts` — green (entry-gate-phase-0.txt:1594)
- `respin/packages/db/tests/retention-sweep-fixtures.test.ts` — green (entry-gate-phase-0.txt:1206)

### Witness: Billing configuration (40 files)

Plan count: 40; observed: 40; no count divergence.

- `respin/packages/credits/tests/actions.test.ts` — green (entry-gate-phase-0.txt:1604)
- `respin/packages/credits/tests/auto-topup-race.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1684; Vitest skipped)
- `respin/packages/credits/tests/auto-topup-rollout.test.ts` — green (entry-gate-phase-0.txt:1131)
- `respin/packages/credits/tests/balance.test.ts` — green (entry-gate-phase-0.txt:1222)
- `respin/packages/credits/tests/billing-contact.test.ts` — green (entry-gate-phase-0.txt:1257)
- `respin/packages/credits/tests/burn-period.test.ts` — green (entry-gate-phase-0.txt:1266)
- `respin/packages/credits/tests/check-marker.test.ts` — green (entry-gate-phase-0.txt:1679)
- `respin/packages/credits/tests/concurrency.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1696; Vitest skipped)
- `respin/packages/credits/tests/days-to-empty.test.ts` — green (entry-gate-phase-0.txt:1221)
- `respin/packages/credits/tests/deletion-commands.test.ts` — green (entry-gate-phase-0.txt:1247)
- `respin/packages/credits/tests/facade-errors.test.ts` — green (entry-gate-phase-0.txt:1492)
- `respin/packages/credits/tests/free-mint.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1695; Vitest skipped)
- `respin/packages/credits/tests/free-mint.test.ts` — green (entry-gate-phase-0.txt:848)
- `respin/packages/credits/tests/generate-race.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1697; Vitest skipped)
- `respin/packages/credits/tests/generate.test.ts` — green (entry-gate-phase-0.txt:1000)
- `respin/packages/credits/tests/generation-frameworks.test.ts` — green (entry-gate-phase-0.txt:1490)
- `respin/packages/credits/tests/generation-pricing.test.ts` — green (entry-gate-phase-0.txt:1584)
- `respin/packages/credits/tests/included-build-purposes.test.ts` — green (entry-gate-phase-0.txt:1216)
- `respin/packages/credits/tests/infer-voice.test.ts` — green (entry-gate-phase-0.txt:1116)
- `respin/packages/credits/tests/inference-race.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1704; Vitest skipped)
- `respin/packages/credits/tests/inference.test.ts` — green (entry-gate-phase-0.txt:805)
- `respin/packages/credits/tests/isolation.test.ts` — green (entry-gate-phase-0.txt:498)
- `respin/packages/credits/tests/ledger.test.ts` — green (entry-gate-phase-0.txt:1434)
- `respin/packages/credits/tests/mode-access.test.ts` — green (entry-gate-phase-0.txt:1562)
- `respin/packages/credits/tests/months.test.ts` — green (entry-gate-phase-0.txt:1592)
- `respin/packages/credits/tests/pasted-reference.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1699; Vitest skipped)
- `respin/packages/credits/tests/pasted-reference.test.ts` — green (entry-gate-phase-0.txt:1053)
- `respin/packages/credits/tests/performance-learning.test.ts` — green (entry-gate-phase-0.txt:996)
- `respin/packages/credits/tests/profiles.docker.test.ts` — NOT RUN (entry-gate-phase-0.txt:1698; Vitest skipped)
- `respin/packages/credits/tests/profiles.test.ts` — green (entry-gate-phase-0.txt:791)
- `respin/packages/credits/tests/revision.test.ts` — green (entry-gate-phase-0.txt:1172)
- `respin/packages/credits/tests/sample-spin-facade.test.ts` — green (entry-gate-phase-0.txt:1546)
- `respin/packages/credits/tests/sample-spin-injection.test.ts` — green (entry-gate-phase-0.txt:1556)
- `respin/packages/credits/tests/sample-spin-spend.test.ts` — green (entry-gate-phase-0.txt:1398)
- `respin/packages/credits/tests/setup.test.ts` — green (entry-gate-phase-0.txt:1685)
- `respin/packages/credits/tests/state.test.ts` — green (entry-gate-phase-0.txt:942)
- `respin/packages/credits/tests/stripe.test.ts` — green (entry-gate-phase-0.txt:1714)
- `respin/packages/credits/tests/tier-checkout-rollout.test.ts` — green (entry-gate-phase-0.txt:1198)
- `respin/packages/credits/tests/tier-checkout-v1-reconcile.test.ts` — green (entry-gate-phase-0.txt:1314)
- `respin/packages/credits/tests/voice-fields.test.ts` — green (entry-gate-phase-0.txt:1602)

### Witness: Telemetry and support (5 files)

Plan count: 5; observed: 5; no count divergence.

- `respin/tests/telemetry.test.ts` — green (entry-gate-phase-0.txt:1470)
- `respin/tests/instrumentation.test.ts` — green (entry-gate-phase-0.txt:1369)
- `respin/tests/safe-log.test.ts` — green (entry-gate-phase-0.txt:1196)
- `respin/tests/probe-artifacts.test.ts` — green (entry-gate-phase-0.txt:1421)
- `respin/worker/tests/retention-alerts.test.ts` — green (entry-gate-phase-0.txt:1601)

### Witness: Customer documents (4 files)

Plan count: 4; observed: 4; no count divergence.

- `respin/tests/landing-pricing.test.ts` — green (entry-gate-phase-0.txt:1570)
- `respin/tests/changelog.test.ts` — green (entry-gate-phase-0.txt:1589)
- `respin/tests/sample-spin-copy.test.tsx` — green (entry-gate-phase-0.txt:1572)
- `respin/tests/account-copy.test.ts` — green (entry-gate-phase-0.txt:1600)

## T6 failures bearing on no obligation

- No failures in the latest full T6 rerun. `respin/tests/shell-scripts.test.ts` — green (entry-gate-phase-0.txt:3481), all 21 tests passed. Earlier nine failures at transcript line 1316 came from the PATH-resolved Windows Bash launcher. Prepending installed `C:\Program Files\Git\bin` resolved startup without source/test edits. Full rerun: 5,067 passed, 101 skipped, exit 0. All 23 Docker suites remain NOT RUN. Existing witness citations retain their earlier passing/skipped observations. This does not establish a production backup/restore exercise.
