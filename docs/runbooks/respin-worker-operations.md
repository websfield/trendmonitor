# Respin worker operations

Status: the pg-boss 12.29.0 production worker, DB-owned system-usage adapter, Anthropic autopsy adapter, schedules, health persistence, the deletion lifecycle tick (Phase 10b-1 Task 4) and the systemd unit are implemented in source. The most recent recorded gate on this tree is the Task 4 set in `docs/progress/respin-finish/entry-gate-task4-r2-{pglite,docker,build}.txt` (default suite with the live-Postgres files loud-skipped, the live-Postgres run, the production build); the numbers live in those artefacts and in the Task 4 review manifest — re-run the gate rather than trusting a number once the tree moves. Live YouTube discovery and Resend delivery remain explicitly deferred as root `todos.md` T-15/T-16.

This runbook covers `respin/worker/main.ts`, its pg-boss runtime, and the non-tenant adapters in `packages/db/src/system-spend.ts`. It does not claim live YouTube discovery or a Resend sender. pg-boss is pinned exactly at 12.29.0. What `respin/tests/pg-boss.docker.test.ts` proves against that installed version on real Postgres, stated exactly: (a) behaviours — a cron schedule fires, a failing job retries `retryLimit` times with backoff then fails terminally, `localConcurrency` bounds in-process parallelism, the constructor's `max` bounds the pool and `useListenNotify: true` adds **exactly one** LISTEN session (asserted as an equality at peak, with a `notify: true` queue in use), a stately queue collapses a duplicate queued singleton key, `send(…, { id })` makes the caller's id the job id and a re-send of the same id returns `null`, and a graceful stop finishes in-flight work and closes every session; (b) the production runtime's own option set — the real `RespinPgBossRuntime` is started **twice** against the same database, so `createQueue` with the full shape, `updateQueue` with the create-fixed keys stripped, `schedule(…, { tz, key })` re-upserted on the same key, the `work` options, `findJobs`, `getQueueStats({ force })` and the constructor options are accepted by the installed version and the queue rows read back as configured. One measured latency fact from that suite worth knowing on a host: with `notify: true` queues and `useListenNotify`, the installed worker relies on NOTIFY for immediacy and polls only every `notifyPollingIntervalSeconds` as a backstop (default 30 s, `attorney.js`; the runtime sets only `pollingIntervalSeconds: 1`), so a job that already existed when the worker started is picked up within 30 s, not 1 s. **Not proven by that suite:** that `expireInSeconds` fails a stuck job at its expiry (the lease-derived `AUTOPSY_JOB_EXPIRE_SECONDS`, 600 s, on the autopsy queue; the plain 300 s liveness bound on the refresh and dispatch queues — the suite asserts the stored values, not the failure), that `heartbeatSeconds: 30` keeps a long handler's job alive, or that `deleteAfterSeconds`/`retentionSeconds` sweep on schedule — those options are accepted and stored, their behaviour is taken from reading `plans.js`/`manager.js`, not from a run.

## Safety boundary

- Scheduled autopsies are system work. They never mint a `WorkspaceScope`, consume tenant credits, or write tenant `model_usage` / `workspace_spend_monthly`.
- `SystemUsagePort.startAttempt` is the persistence seam. Its adapter must atomically claim the unique attempt id and reserve the maximum call cost against the business-date system cap before outbound work. The config an attempt is priced under (prices, per-stage deadline, output ceiling) is resolved ONCE per attempt, before this claim, and never re-read inside a stage: a refused document reserves nothing and records no call, and a document appended mid-attempt changes nothing about that attempt (`worker/production.ts` `attemptBoundAutopsyVendor`).
- `SystemUsagePort.finalizeAttempt` must durably attribute measured actual cost even when it exceeds the reservation. An overrun is stored as a terminal failure and reconciled into the retained system rollup; it must not be rejected because it exceeded the reservation.
- One attempt makes exactly four bounded vendor calls in the canonical order: `hook_mechanic`, `beats`, `ending`, `follow_trigger`. Each call receives the remaining token/cost ceiling and a stage-qualified idempotency key. The worker validates every stage, aggregates the actual four-call usage, and only then constructs the canonical `@respin/trends` analysis. A missing, malformed or failed stage is a recorded paid failure, never completion. If a successful response omits token or cost usage, the worker records the unknown fact and stops before another paid stage because remaining headroom is no longer provable.
- The sessionless command carries only a DB-minted opaque `autopsyCacheClaimId`. Shared claims are prepared only from affirmative creator-owned-caption consent. Profile-private claims are prepared while a caller still holds a minted `ProfileScope`; the later worker receives neither that scope nor either owner id. Under the cache-claim lock, the DB adapter resolves the exact item/digest/version/rights owner and returns the matching transcript in memory only.
- `finalizeAttempt` receives canonical analysis in a separate completion envelope. The adapter stores it with the cache claim's original shared/private ownership while the system-usage row stays content-free and has no creator/workspace/profile column.
- The vendor adapter receives `maxInputTokens`, `maxOutputTokens`, and `costCeilingMicroUsd`. It must enforce the token limits before/during the outbound request. A response above any limit is recorded and failed, never reported as success.
- Re-running a finalized or in-flight attempt id makes zero vendor calls. The adapter may classify a duplicate as finalized only when the content-free usage and canonical autopsy completion both exist; a claim without both stays in-flight. The replay must name the same job, item, cache claim, purpose, model, business date and requested reservation, and duplicate usage/reconciliation facts must carry the same values. A changed value is conflicting work, not an idempotent replay. A new paid call requires a new attempt id from the finite retry state machine.
- `BoundedConcurrencyPool` limits in-process task execution only. It is not pg-boss's Postgres connection pool. Its local wait queue is separately capped and refuses overflow. Refresh batches are drained by a fixed number of consumers rather than eagerly enqueued, and the DB scheduler source refuses a population above its admitted ceiling instead of silently dropping the remainder. The production runtime also bounds pg-boss `localConcurrency`, its pool `max`, and the dedicated query pool independently.
- Structured worker events may contain only bounded content-safe event/reason codes, job/item/attempt ids, timestamps and counters. Vendor prose is replaced with a fixed internal code before persistence. Never attach errors, prompts, transcripts, email bodies, creator ids, workspace ids or profile ids.

## Current external-evidence blockers

| Capability | Honest status/code | Evidence required to clear it |
|---|---|---|
| Live YouTube discovery | `youtube_live_discovery_unverified` | Provisioned credentials, measured quota, and an observed metadata discovery run |
| Weekly digest delivery | `resend_delivery_unavailable_unverified` | Installed sender adapter, provisioned account, and an observed delivery result |
| Auth mail (verification, reset, deletion recovery) | closed Resend authority installed (Phase 10b-1 Task 4): quota-admitted outbox rows, origin-pinned adapter, honest accepted/failed/unknown classification; sends only when `RESEND_API_KEY` and `RESEND_FROM` are set | A provisioned Resend account and an observed delivery through the real adapter (T-16); until then every send is a dev-console line and no outbox row exists |
| Deletion journal (S3, R-124) | `journal_store_unavailable_until_task5` — the worker composes a refusing journal, so no deletion operation can advance past its request state | Task 5's S3 adapter, the provisioned bucket/IAM/policy digest and a real restore walk |
| Production DB adapter | implemented in source; PGlite integration suites green on migration 0025 (`packages/db/tests/system-spend.test.ts` 21 tests; `trends-storage.test.ts` 8 tests, of which the ownership evidence is its two REQ-A03 blocks — the forged-scope refusal and the cross-profile readers — plus `system-spend.test.ts`'s identity witness) | A real-Postgres run of the same adapter cases proving shared/private opaque ownership, atomic usage+autopsy completion, four-call attribution, zero-call cap refusal/replay, failure/retry and no tenant identity fields. The only real-Postgres adapter coverage today is the last block of `respin/tests/pg-boss.docker.test.ts` (one real attempt through the production config read, the real attempt store and a fake provider: four measured calls, a reserved claim, and the config refusal before any claim) |
| Production worker executable | wired in `worker/main.ts` through `worker/production.ts`; focused composition/runtime/vendor tests green | An observed systemd start/heartbeat/stop walk on the target host with a separately held Anthropic key. This is deployment evidence, not a precondition for deterministic source verification |
| pg-boss scheduling/retries/DB pool | wired and verified against installed 12.29.0 on real Postgres 17 (`respin/tests/pg-boss.docker.test.ts`, Docker-live only, loud-skips otherwise): the behaviours listed at the top of this runbook, plus the production runtime started twice | Keep the exact pin. Connection budget is `max` pooled pg-boss sessions **plus exactly one** LISTEN/NOTIFY client (measured), plus the separately bounded worker query pool. Expiry, job heartbeat and retention sweeps are accepted-and-stored options whose behaviour is read from the installed source, not run |

Digest composition is available and deterministic. Every displayed outlier ratio requires its positive baseline, sample size and increasing observation window in the same item; partial measurement evidence is refused. Sending is not. The refresh contract is available; the built-in discovery port returns the blocker above rather than fake success.

## Run-once contract

`respin/worker/run-once.ts` remains a library parser/dispatcher for deterministic one-job tests and the recorded systemd-timer fallback. The selected production runner is the pg-boss process in `worker/main.ts`; it builds the same closed command shapes directly from DB-owned scheduler sources. Any future CLI fallback must call `executeRunOnce(argv, handlers)` and preserve these explicit arguments. Do not put command values in environment fallbacks or silently ignore unknown flags.

| Job | Required arguments |
|---|---|
| Refresh | `--job refresh --run-id <id> --scheduled-at <ISO timestamp> --niche-id <id>` |
| Weekly digest | `--job weekly-digest --run-id <id> --scheduled-at <ISO timestamp> --digest-id <id> --week-start <YYYY-MM-DD>` |
| Autopsy | `--job autopsy --run-id <id> --scheduled-at <ISO timestamp> --job-id <id> --item-id <id> --attempt-id <unique id> --autopsy-cache-claim-id <opaque DB id> --business-date <YYYY-MM-DD> --model-code <code> --max-cost-micro-usd <positive integer> --max-input-tokens <positive integer> --max-output-tokens <positive integer> --configured-daily-cap-micro-usd <non-negative integer>` |

Library exit semantics are: `0` for completed/succeeded/already-finalized, `1` for a failed operation, and `2` for an external blocker, exhausted budget or already-in-flight attempt. The long-running production process emits only content-safe structured events; job success/retry is governed by the runtime and the DB-owned attempt state, not process exit after each job.

Do not select the systemd fallback merely because pg-boss is unavailable in a development sandbox. The recorded runner decision remains pg-boss until its verify-first task proves otherwise or a new decision is recorded.

## Production process and systemd

The committed unit is `respin/ops/systemd/respin-worker.service`. It runs one worker from `/opt/respin/current`, restarts only on failure, sends `SIGTERM`, and allows 45 seconds for the runtime's 30-second graceful pg-boss shutdown plus process overhead.

**A graceful stop is not lossless past 30 seconds.** `stop({ graceful: true, timeout: 30_000 })` waits up to 30 s for in-flight handlers; past that, pg-boss marks whatever is still running as failed (`failWip`) while the handler itself keeps running until the process exits, and the worker then closes its query pool under it. An autopsy attempt caught there can complete its four paid vendor calls and be unable to finalize — it lands as a **stale lease**: money-safe (the reservation is retained, no second paid call is made for that attempt id), and recorded by the next dispatcher tick after the ten-minute lease as four unknown calls with the cache claim moved to failed/retryable. Do not read `TimeoutStopSec=45` as "nothing is lost"; read it as "nothing is paid twice". Prefer stopping the unit when the dead-letter and active counts in `system_worker_health` are at rest.

**Restarts are bounded.** The unit carries `StartLimitIntervalSec=600` / `StartLimitBurst=10`: a start that fails ten times inside ten minutes (a missing env value, an option the installed pg-boss refuses, Postgres still down) leaves the unit `failed` instead of looping every 5 s forever. Recover with `sudo systemctl reset-failed respin-worker && sudo systemctl start respin-worker` after fixing the cause. `After=postgresql.service` is inert against a docker-compose Postgres (no such unit exists); the restart policy is what covers that boot-time race.

The environment file `/etc/respin/respin-worker.env` is provisioned outside the repository. It requires `DATABASE_URL` and `ANTHROPIC_API_KEY`; never print or copy either value into logs or work records. Optional numeric bounds are documented in `respin/env.example`. No YouTube or Resend credential is consumed by this worker yet: refresh returns the recorded T-15 blocker, and no weekly-digest schedule is installed while T-16 remains open.

With defaults, the process can hold at most four database connections: two pg-boss pool sessions, one separate LISTEN/NOTIFY client, and one query-pool session. The two pool settings are independently code-clamped. Include this total in R-42 deployment arithmetic before adding another app or worker process.

Install or update the unit only after the application files and dependencies are present:

```bash
sudo cp /opt/respin/current/ops/systemd/respin-worker.service /etc/systemd/system/respin-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now respin-worker.service
sudo systemctl status respin-worker.service --no-pager
```

Verify a fresh content-safe heartbeat in `system_worker_health`, the daily refresh and minute dispatcher schedules in the `respin_worker` pg-boss schema, and no unexpected dead-letter growth. Do not treat a running process alone as healthy. On a brand-new deployment expect a `missed_schedule` alert until the first 02:00 UTC refresh completes — with no completed refresh on record the most recent 02:00 counts as due-and-unfulfilled, whatever the start time.

For rollback, stop and disable the unit before switching the application release, then restore the preceding compatible release and unit and start it again. Do not drop the pg-boss schema or delete system-usage rows during rollback; they are durable recovery evidence.

## Deletion lifecycle tick (Phase 10b-1 Task 4)

The queue `respin.deletion-lifecycle.v1` runs on a one-minute cron (key `deletion-lifecycle-v1`, exclusive policy) and is registered only when the runtime is composed with the deletion ports, which `worker/production.ts` always is. Each tick claims due operations under a five-minute lease and advances each one state per tick: `tombstoned` enqueues the reversible fences (period-end cancellation, auto-top-up disable), `external_actions_pending` dispatches them and moves to `grace` only when every fence succeeded, `grace` moves to `erasing` only after `grace_expires_at` **and** when `RESPIN_DELETION_ERASURE_SCOPES` names the scope, `erasing` dispatches the irreversible commands and then runs one erasure transaction (subjects → journal → registry executors → independent residue probes → journal → `complete`; residue rolls the whole erasure back), and `blocked` retries a failed command up to three attempts before waiting for an operator.

- **Fail closed, three ways.** An unknown command outcome is never stepped over and never retried as new; an unset scope list holds every operation at `grace`; a refusing journal (until Task 5) holds every operation where its request left it. None of these is an error state — the tick reports them as `waiting`.
- **The event is counts only.** `deletion_lifecycle_tick` carries `deletionClaimed`, `deletionAdvanced`, `deletionWaiting`, `deletionBlocked` and `deletionErased`. Operation ids stay in the database.
- **Reading what is stuck.** `deletion_operations.last_failure_code` holds the content-free reason for the last waiting or failed tick: `external_command_unknown` / `external_command_pending` / `nested_operation_active` (waits, not retries), `external_command_failed`, and for a rolled-back erasure the code the executor put on the row when it moved the operation to `blocked` — `residue_detected:<n>`, `sqlstate_<code>:<constraint>`, or a refusal code such as `unknown_outcome_pending`. `retry_count` counts real failures only. `deletion_external_commands` holds each command's status, attempt and failure code. A row in `blocked` with `blocked_resume_state` set resumes automatically once its commands are clean. A rolled-back erasure resumes on the next tick and is retried **up to three real failures** (`retry_count`, which counts erasure failures and other real failures, never waits); after that the tick reports `blocked_awaiting_operator:erasure_failures_exhausted`, leaves the row untouched, and an operator who has understood the residue resets `retry_count` to 0 to allow another attempt. Nothing about a rolled-back erasure reaches the journal: both receipts are appended only after the probes pass, inside the erasure transaction. Anything blocked without a clean resume path waits for an operator decision.
- **Holds that are not failures.** `erasure_disabled` (the scope is not in `RESPIN_DELETION_ERASURE_SCOPES`, re-read at grace, at erasing and on resume), `erasure_disabled:financial_chain_unretained:<tables>` (R-122: `credit_ledger`, `subscriptions`, `pause_periods` at workspace scope and `model_usage` at profile scope still cascade until Task 6 registers the seven-year receiver) and `erasure_disabled:stripe_payload_receiver_unwired` (identity scope: the raw Stripe payload naming a workspace's contact has no receiver until Task 6). None writes `last_failure_code`. Today EVERY scope is held, and naming any scope in the list refuses worker startup with the same reason.
- **A cancelled deletion may still owe one command.** Cancellation is refused (`command_in_flight` / `unknown_outcome_pending`) while a fence is dispatched but unresolved or its outcome is unknown; once settled, if the operation's own period-end cancellation had succeeded at Stripe, cancelling inside grace enqueues `stripe_subscription_reopen` (cancellation phase); the tick dispatches it and retries a failure up to the three-attempt bound. A fence the owner cancelled ahead of is never dispatched afterwards. An operation in `cancelled` with `last_failure_code = external_command_failed` and three failed reopen attempts is exhausted: the workspace is already `active` locally and the subscription must be reopened by hand in Stripe. Auto-top-up is never re-armed by cancellation; the owner opts in again.
- **Do not edit rows by hand.** A stale lease (`lease_expires_at` in the past) is reclaimed by the next tick; a lease held by a dead worker needs no intervention beyond waiting five minutes.

## Health snapshot and alerts

The health reader supplies one `WorkerHealthSnapshot` containing the observation time, heartbeat, earliest unfulfilled schedule due/start, last successful run, active/queued/parked/dead-letter counts, pool limit and system-budget totals. The runtime restores and evaluates daily refresh and minute dispatcher history independently; a recent dispatcher can never mask a missed daily refresh. `evaluateWorkerAlerts` deterministically emits:

| Alert | Trigger | First diagnosis |
|---|---|---|
| `stale_heartbeat` | Heartbeat age exceeds the code-fixed threshold: `HEARTBEAT_STALE_INTERVALS` (3) × the heartbeat interval (`RESPIN_WORKER_HEARTBEAT_MS`, default 30 s → 90 s). Emitted **in-process** only for the worker's own stalled loop — see "What the worker cannot alert on itself" | Check whether the worker process is alive, then DB/provider adapter health. Do not infer health from process state alone. |
| `missed_schedule` | The latest expected schedule is beyond the code-fixed grace (`SCHEDULE_GRACE_MS`, 120 s) and no matching completion exists. With **no** completed daily refresh on record (a first start, or a restart after pg-boss swept the history) the refresh due at the most recent 02:00 UTC counts as due-and-unfulfilled, so ANY start with no completed refresh on record (whatever the clock says) reports this until its first refresh completes — absence of evidence is not success. Refresh completions are retained for two cadences (`DAILY_REFRESH_HISTORY_RETENTION_SECONDS`) so a plain restart keeps yesterday's evidence | Compare due/start timestamps and the scheduler's durable job record. Confirm clock/time zone before replay. |
| `growing_dead_letters` | Current dead-letter count exceeds the prior observed count | Group by safe failure code, inspect one item id, and identify permanent vs transient cause. Never log its transcript. |
| `budget_near_cap` | Reserved spend is at/above the code-fixed near-cap ratio (`NEAR_BUDGET_RATIO`, 0.8) but below the cap | Check reservation pressure and unknown-cost share. Do not raise config above the code ceiling. |
| `budget_exhausted` | Spend reaches/exceeds the resolved daily cap | Expected behaviour is zero further vendor calls. Confirm refusals are being recorded with `callCount = 0`. |
| `pool_pressure` | Active/pool ratio reaches the code-fixed threshold (`POOL_PRESSURE_RATIO`, 0.8) or any job is queued | Check long-running attempts and adapter latency. Tighten concurrency if needed; config cannot exceed the code ceiling. |

The four multipliers and ratios (`HEARTBEAT_STALE_INTERVALS`, `SCHEDULE_GRACE_MS`, `NEAR_BUDGET_RATIO`, `POOL_PRESSURE_RATIO`) are code-fixed in `respin/worker/health.ts` with their reasons and revisit triggers and are read from neither env nor config; changing one is a reviewed code change. The 90 s stale-heartbeat figure is NOT one of them: it is `HEARTBEAT_STALE_INTERVALS` × `RESPIN_WORKER_HEARTBEAT_MS`, so a deployment that sets a different heartbeat interval moves it.

## What the worker cannot alert on itself

The worker evaluates alerts inside the same process whose health they describe, on the snapshot it is about to persist. Two consequences, stated so nobody reads the alert table as complete monitoring:

- **A stopped, crashed, or restart-limited worker emits nothing.** `stale_heartbeat` from the process itself means only "my own heartbeat loop stalled longer than the threshold" (it is evaluated against the *previously persisted* heartbeat, never against the row just written — that row's age is zero by construction). The "stop the worker → alert" half of the slice-8 verification is therefore **not** discharged by anything in this repository today. It needs an **out-of-process reader** of `system_worker_health.last_heartbeat_at`: slice 10b-1's admin read is the designated owner. Until it exists, the check is manual — run it after every deploy and whenever the unit reports `failed`:

  ```sql
  SELECT worker_name,
         now() - last_heartbeat_at AS heartbeat_age,
         schedule_lag_seconds,
         active_count, parked_count, dead_letter_count, budget_exhausted
    FROM system_worker_health;
  ```

  A `heartbeat_age` above 90 s with the unit `active` means the loop is stuck; above 90 s with the unit `failed` or `inactive` means systemd's start limit or an operator stopped it.
- **A missed daily refresh across a restart** is now detected in-process (see `missed_schedule` above), but only *after* the worker is running again; the gap between a crash at 01:59 and the next successful start is invisible to it for the same reason as the first bullet.

## Recovery procedures

### Stale heartbeat or missed schedule

1. Capture the content-safe snapshot and alert codes.
2. Check the worker process and its DB connection without printing configuration values.
3. Inspect the durable schedule/run row by run id. If it is finalized, do not replay it.
4. If an attempt is still inside its lease, do not call the vendor with the same attempt id. The DB adapter returns `already_in_flight`; lease age is never permission to replay that id.
5. The dispatcher automatically recovers an attempt beyond the code-defined ten-minute lease under the claim lock. Because no durable vendor-complete envelope exists, recovery finalizes the attempt conservatively as four unknown calls, retains its reserved system spend, and moves the cache claim to failed/retryable or parked at the five-attempt ceiling. It is idempotent: the same stale attempt recovers once.
6. After recovery and correction of the cause, only the finite retry state machine may create a new attempt id for genuinely new paid work. Keep the original job/run identity for schedule attribution.
7. Verify a fresh heartbeat, a successful run timestamp and cleared schedule lag.

The DB duplicate classifier is part of recovery correctness. It may return
`already_finalized` for a successful attempt only after the atomic transaction
has stored both the usage fact and canonical autopsy completion. A crash before
that transaction leaves neither completion durable. Automatic stale recovery
does **not** claim to resume the missing result: it records the worst bounded
usage fact and preserves the reservation before the finite retry path may admit
new work. Never describe this as provider-result recovery or a refund.

### Growing parked/dead-letter population

**A refused config document looks like this.** A stored `llm.overallDeadlineMs` above `AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS` (135 000 ms — four of them plus the margin would outrun the ten-minute claim lease) is refused by every worker read of config: at start-up the process exits (`worker_start_failed`); at a dispatch tick or an autopsy attempt the job throws before any claim exists, retries `retryLimit` (2) times and dead-letters about two minutes later, so the first visible symptom is `growing_dead_letters`. Worker events are content-free, so the sentence that names the ceiling lands ONLY in pg-boss's job `output` column, on the failed row in the job's own queue (kept one day by `deleteAfterSeconds` (a failed row survives until `completed_on + deletion_seconds`; `retentionSeconds` governs only not-yet-active rows)). Read it there before touching config:

```sql
SELECT name, state, retry_count, completed_on, output->>'message' AS message
  FROM respin_worker.job
 WHERE state = 'failed'
   AND name IN ('respin.autopsy-dispatch.v1', 'respin.autopsy.v1')
 ORDER BY completed_on DESC
 LIMIT 20;
```

The fix is a NEW config version at or below the ceiling (config is append-only); the refusal clears on the next dispatch tick with nothing to replay, because no attempt was claimed.

1. Compare current and previous counts; a flat non-zero population is not the `growing_dead_letters` condition.
2. Group by safe failure code. `request_invalid`, limit overruns and repeated permanent failures require correction before replay; vendor unavailability may be transient.
3. Correct the root cause. Never increase retry count beyond the code ceiling or reset it in a loop.
4. Requeue deliberately with a new attempt id. Preserve the old terminal record.
5. Confirm the retry state either succeeds or parks again at its finite bound.

### Near or exhausted system budget

1. Check spent, cap, reservations, measured calls and unknown calls for the same business date.
2. At exhaustion, confirm the vendor call count does not increase. A configured cap of zero is the supported emergency-disable setting and must immediately take this path.
3. Reconcile completed attempts idempotently. An actual-cost overrun must remain attributed and visible; do not delete or coerce it under the reservation.
4. Config may tighten the cap. If the new cap is below spend already reserved that day, the retained cap clamps to the irreversible reserved amount and admits no further work; it does not corrupt the daily row or pretend the reservation disappeared. Config cannot lift the cap above `SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD`; changing that code ceiling requires an explicit reviewed change.
5. Resume only when the next business-date budget is available or an authorized code/config decision changes the bound.

### Pool pressure

1. Compare active and queued counts with the resolved limit.
2. Locate old in-flight attempt ids and diagnose their adapters. Never start a duplicate call with the same id.
3. Tighten configured concurrency if the database/provider is saturated. Config above `WORKER_CONCURRENCY_CODE_CEILING` is clamped; local queue overflow is refused at its own ceiling rather than growing without bound.
4. Verify active count never exceeds the resolved limit while the queue drains.

## Verification commands

From `respin/`, the focused worker checks are:

```powershell
node_modules\.bin\vitest.cmd run --config worker/vitest.config.ts
node_modules\.bin\tsc.cmd -p worker/tsconfig.json --pretty false
node_modules\.bin\eslint.cmd worker
```

The production worker proof additionally runs:

```powershell
node_modules\.bin\vitest.cmd run worker/tests/autopsy-vendor.test.ts worker/tests/pg-boss-runtime.test.ts worker/tests/production.test.ts
$env:TEST_DATABASE_URL='postgres://respin:respin_local_dev@localhost:5435/respin'
node_modules\.bin\vitest.cmd run tests/pg-boss.docker.test.ts
```

The Docker test proves the exact installed pg-boss behaviour on disposable Postgres. The runtime/composition tests prove application wiring without making live provider calls. Neither proves live YouTube discovery or email delivery.

The DB adapter's focused proof additionally requires, from `respin/` after migration 0025 exists:

```powershell
node_modules\.bin\vitest.cmd run packages/db/tests/system-spend.test.ts worker/tests/autopsy.test.ts worker/tests/retry.test.ts
node_modules\.bin\tsc.cmd -p packages/db/tsconfig.json --pretty false
```

Those checks prove the adapter and worker protocol. Live YouTube and Resend acceptance remain T-15/T-16.
