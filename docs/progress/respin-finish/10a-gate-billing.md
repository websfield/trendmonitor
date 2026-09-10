# Respin billing & credits review — Phase 10a build lane, round 1 (2026-09-09)

*Report returned by `respin-billing-reviewer`; saved verbatim by the build lane. Full intensity (`Full gates? yes`).*

**Readiness: Almost · Grade: C · The money authority is sound in shape (one daily row, derived purpose cap, claim-before-call, never a refund or reissue) but the public lease can be outrun by config, the limiter's atomicity is unproven under real concurrency, and two recovery/finalise races throw instead of settling.**

Counts: 0 BLOCK · 5 CHANGE (2 High, 3 Medium) · 4 NOTE. First review of this phase on this path.

**Scope**: Phase 10a build-lane round 1, full intensity. Diff over `961c2a9` on `respin/packages/db/src/{system-spend,system-spend-schema,public-sample-spin,public-sample-spin-schema,retention-clocks}.ts`, migrations 0058–0060, `packages/config/src/schema.ts`, `packages/db/seed.ts`, `packages/credits/src/{sample-spin/run.ts,app-server.ts,generate.ts}`, `app/api/demo/route.ts`, `app/api/stripe/webhook/route.ts`, `app/(product)/billing-errors.ts`, `worker/retention.ts`, and the money tests named below. The learning-honesty changes were not reviewed here.

## Findings

- ⚠️ CHANGE (High) `respin/packages/credits/src/sample-spin/run.ts:235` — The attempt deadline is `AbortSignal.timeout(deps.content.llm.overallDeadlineMs)` with no clamp, while the in-flight lease is compiled at 150 s (`packages/db/src/system-spend.ts:116`) and `packages/config/src/schema.ts:591` accepts any positive integer (probe P6: `overallDeadlineMs: 300000` parses). R-123 says config may tighten the 120 s bound, never raise it; here it can. Once the deadline exceeds the lease, a live attempt (a) drops out of `publicSampleSpinInFlightCount` so a third concurrent attempt is admitted, and (b) is booked by `recoverStalePublicSampleSpinAttempts` as unknown/3 calls while the vendor is still answering; the real finalise then throws (probe P3), so an accepted spin returns a 503 and its measured cost is lost. The autopsy path already refuses exactly this (`assertAutopsyDeadlineWithinLease`). · Fix: clamp the public deadline to a compiled 120 s ceiling, derive the lease from that ceiling plus a cited margin, and add a test that a 300 s config cannot outrun the lease.

- ⚠️ CHANGE (High) `respin/packages/db/src/public-sample-spin.ts:109-119` — The DB-atomic admission (advisory lock → in-flight count → bucket lock → money) is only tested on PGlite, a single in-process connection where `pg_advisory_xact_lock` can never contend. No `*.docker.test.ts` references the limiter. The plan card's mutation matrix requires "rotate-at-boundary and concurrent dual-candidate mutations must redden if they admit twice", and CLAUDE.md names the Docker run as the only one that proves money invariants under real concurrency. · Fix: add a live-Postgres suite that fires N concurrent `admitPublicSampleSpin` calls for one address and for three addresses and asserts exactly one bucket / at most two `reserved` claims, and show that removing `LIMITER_LOCK` reddens it.

- ⚠️ CHANGE (Medium) `respin/packages/db/src/system-spend.ts:446-472` — The public stale recovery selects candidates outside the transaction, then inside re-checks only `status` and `purpose` — not the lease boundary and not the absence of a usage row. If the live attempt finalises between the select and the insert, `recordSystemModelUsageInTx` throws "already bound to a different fact", which aborts the whole retention tick and stalls every later candidate. The mirror race (recovery first, live finalise second) is the throw in probe P3. · Fix: re-check `createdAt < before` and `NOT EXISTS usage` inside the tx and `return false` on a miss; in `run.ts` `finalise`, treat an existing `recovery_required` row as "reconcile via `reconcileSystemModelUsage`, do not throw".

- ⚠️ CHANGE (Medium) `respin/packages/credits/src/sample-spin/run.ts:256-262` — When the vendor serves an alias with no `llm.prices` row, `priceFor(servedModel)` throws after the fact was pushed as unknown; the vendor's reported tokens are discarded, the attempt is booked `vendor_failed / unclassified_failure`, and the visitor is refused even though a gate-passable draft came back (probe P1). Served-alias pricing itself is correct when a price exists (probe P2) but that branch has no test. Also `:265-271` prices a truncated reply at the requested model. · Fix: catch `ModelPriceUnknownError` in `metered`, keep the fact as unknown with tokens retained, let the run continue; add a served-alias case.

- ⚠️ CHANGE (Medium) `respin/worker/retention.ts:55` — `recoverStalePublicSampleSpinAttempts` is wired into the retention tick, but no test witnesses that wiring; deleting the line leaves all 5,135 tests green — the T69-R5 class. · Fix: extend the worker source-witness (or a unit test with a stale claim on PGlite) to assert the public recovery runs on the tick.

- 💡 NOTE `respin/packages/db/src/system-spend.ts:116` — The 30 s finalise margin inside the 150 s lease is uncited (check 7).
- 💡 NOTE `respin/packages/credits/src/sample-spin/run.ts:383-405` — A finalise with zero facts cannot be recorded (`callCount: 0` is refused for anything but `budget_exhausted`); unreachable with the checked-in fixture today.
- 💡 NOTE `respin/packages/db/src/system-spend.ts:406-418, 432` — The lease boundary compares an application-clock `now` against a database-clock `created_at`; using `now()` from the database in both reads removes the second clock.
- 💡 NOTE `respin/packages/credits/src/sample-spin/run.ts:78-80, 242-244` — A rewrite or scoring prompt that crosses its byte bound after the first call is booked `invariant_failed` and surfaces as a 503, not a typed refusal.

## Checks run

B1 ✅ (no stored balance; purpose sub-cap is a sum over reserved claims under the daily row's lock; tenant tables asserted empty). B2 ✅ (replay keys on `job_attempt_id`; webhook change is log-only). B3 ✅ (reservation before any call, in one transaction with bucket consumption; never refunded). B4 n/a. B5 ✅ except the High: `overallDeadlineMs` can exceed 120 s. B6 n/a. B7 ⚠️ the 30 s margin uncited. B8 ⚠️ partial: no live-Postgres concurrency test for the limiter; no witness the tick calls the public recovery; no served-alias case.

## Coverage

read fully: the system-spend and limiter sources and schemas, `run.ts`, the demo route, migrations 0058/0059/0060, R-123, R-126, the plan card, the money tests; skimmed: config schema, inference, llm pricing/errors, pipeline, worker production, autopsy policy; not read: the fixture/idea/enablement modules, the registry, telemetry, preflight, the learning files, the marketing pages.
commands run: the five money suites → 5 files / 53 tests passed; scratchpad probes P1–P6 (unpriced alias, priced alias, lease overrun + late finalise throw, byte bounds, zero-call finalise, schema accepts 300 s); `entry-gate-10a-5.txt` → 225 / 5,135, build compiled, `GATE_EXIT=0`.
hunted for and did not find: a stored balance; a webhook path without event-id idempotency; a vendor call before a reservation; a refund or reissue; a fourth call path; a `cap_exhausted` row counted as in-flight; a public claim writing any tenant row; a compiled dollar figure where config is the authority.

## Verdict

NEEDS CHANGES
No BLOCK: the ledger is derived, every claim precedes its call, and no tenant row moves — but config can outrun the compiled lease, the atomic limiter is unproven under real concurrency, and the recovery/finalise pair can throw at each other.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
