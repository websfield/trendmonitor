# RUNBOOK

> The operating manual a competent stranger (or the founder six months from now) uses to run, deploy, and *recover* this system. Written by `/bootstrap-claude-pack` on 2026-07-10; refreshed 2026-07-14 (phases R4a/R4b) and 2026-08-14 (Respin pivot, R-1). **The repo is pushed to `github.com/websfield/trendmonitor` (the 2026-07-14 "no remote backup" gap is closed).** The sections below describe the **parked UGC Intelligence line** — built, tested, never production-deployed — and remain its honest operating manual. The **active build is Respin** (see the Respin section and Accounts below): M0 and M1's engineering half have landed and run locally, but **nothing is deployed and no backup has ever been restored**. The `operability-critic` audits this file; do not let it imply safety that hasn't been built.

## Respin (active build — M0 + M1 engineering landed; nothing deployed, honest by design)

- **Run it locally (this works today).** The `DATABASE_URL=` prefixes below are **required, not decoration** (audit #11): `db:migrate` and `db:seed` are drizzle-kit/tsx processes and **do not read `.env.local`** — only Next does — so without the prefix a stranger following this section fails at the first database step. `respin/README.md` explains the trap in full.

  ```bash
  docker compose -f respin/docker-compose.yml up -d   # postgres:17 on port 5435
  DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin db:migrate
  DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin db:seed
  pnpm -C respin dev                                   # Next DOES read .env.local
  ```

  Entry gate: `pnpm -C respin typecheck && lint && test && build`, plus `db:check` for migration drift. The money invariants are only proven when the two Docker concurrency suites run — same command with `TEST_DATABASE_URL` set (they loud-skip without it, and say so).
- **CI (exists):** `.github/workflows/respin.yml`, path-scoped to `respin/**` (like `cutdown.yml`). It runs typecheck, lint, test (with a real Postgres service so the concurrency suites cannot silently skip), `db:check`, build, and — since the 2026-08-17 audit remediation — a **dependency vulnerability scan** (`pnpm audit`, fails on high/critical). Pre-existing advisories are baselined with reasons and an owner in `respin/SECURITY-EXCEPTIONS.md`; the scan covers `respin/` **only**, not `src/` or `cutdown/`.
- **Deploy (planned, R-18):** AWS Lightsail; the deploy shape (container service vs instance) is **undecided** and is settled when the first deploy is planned. **Vercel/Neon/Clerk were dropped by R-18/R-19** (`vercel.json` removed). There is **no deploy surface today — "none found" is the current truth**, and "preview deploys per PR" dissolved with Vercel.
- **Rollback — what it actually IS (audit #10).** The previous wording named a DB rollback with no command behind it. There is **no `db:rollback`, no `down` migration, and Drizzle does not generate one** — migrations here are forward-only plain SQL. Inventing a command would be worse than admitting the shape, so:
  - **Application rollback = redeploy the previous build.** Nothing exists to do this with today (no deploy surface), and it lands with the first deploy.
  - **Database rollback = restore a verified backup.** There is no other mechanism. Its blast radius is the honest part: a restore returns the WHOLE database to the backup's instant, so **every write since that backup is lost** — including credit grants, ledger rows and Stripe webhook events that landed in between. The `credit_ledger` is append-only, so a restore does not "undo" a bad row so much as discard everything after it.
  - **Forward-only rule:** a bad migration is corrected by writing the next migration, not by reversing the last one.
  - **The exact operator commands are deliberately NOT written yet.** They depend on the deploy shape, and R3's acceptance is that they are written *after* a real backup drill exists — see Backup & restore below. Today: 11 migrations committed, **none ever rolled back**, and no production restore has been performed.
- **Configuration (names only, never values — golden rule 2):** the names live in `respin/env.example`; today that is `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_USER_IDS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESPIN_TRUSTED_PROXIES`. **`RESPIN_TRUSTED_PROXIES` is required in every non-local environment — staging and preview included — and every auth request fails with a 500 until it is set** (R-26/R-27; the process still starts and static pages still render, so a deploy can go green with the failure latent): it names the proxy hops allowed to report a client IP, and with it unset the sign-in rate limiter collapses every client onto one shared bucket behind a multi-hop proxy. Set it to the deployment's real proxy addresses/CIDRs, or to `none` for a single-hop deployment — never to a guess, which would let a client spoof its IP and evade the limiter. `ANTHROPIC_API_KEY` (server-side only, tech-spec §6) and the YouTube Data API key arrive with M3/M4. **The build is keyless-green: it compiles and the suite passes with no `STRIPE_*` set** — that is asserted, not assumed.
- **Observability (planned, tech-spec §7):** structured logs with request id; Sentry for errors; PostHog for the activation funnel. **Not built.** A job audit trail waits on the runner decision — R-18 dissolved Inngest's Vercel-bound rationale and D-M1-4 made M1 runner-free by design; the decision lands at M4 entry.
- **Backup & restore (audit #9 — half closed, and which half matters).** Durable data lives in **self-hosted Postgres** (R-18) — a local Docker volume today, a Lightsail-side instance in production.
  - **Tooling exists and has been rehearsed end-to-end:** `bash respin/scripts/backup.sh` (pg_dump → gzip → AES256 → checksum → retention prune) and `bash respin/scripts/restore-drill.sh` (checksum verify → isolated restore → **content** assertions: representative workspace/subscription/ledger/webhook rows, the ledger's no-negative-balance invariant re-derived on the restored data, and a migration-ledger COUNT comparison against the restored database (not `db:check`, which is offline and cannot observe a restore)). Rehearsal record, including the counts and the proof that the drill's own guard fires: [`docs/progress/audit/evidence/restore-drill-2026-08-17.md`](docs/progress/audit/evidence/restore-drill-2026-08-17.md).
  - **NO PRODUCTION BACKUP EXISTS AND NONE HAS BEEN RESTORED.** Lightsail is unprovisioned, so there is nothing to back up. Nothing schedules `backup.sh` (which also carries no executable bit yet — it was authored on Windows, so invoke it as `bash scripts/backup.sh` or `chmod +x` it on the deploy host); there is no cron, no independent storage target, no least-privilege backup role, and no alerting — on failure *or on absence*, which is the one that goes unnoticed.
  - **LINE-ENDING DEFECT FOUND AND FIXED 2026-09-07 (Phase 10b-1 Task 5).** Both scripts were committed with **CRLF** line endings, which silently broke every backslash line continuation in them — 10 in `backup.sh` (including the `pg_dump | gzip | gpg` pipeline that *is* the backup) and 6 in `restore-drill.sh`. bash reads a backslash followed by CR as an escaped carriage return, not a continuation: a two-line CRLF fixture printed `one r` and exited 127 with `two: command not found`. `bash -n` passes (both halves are syntactically valid commands) and `git diff` shows nothing under `core.autocrlf=true`, so nothing caught it. **The first fix was wrong and is recorded here because the correction matters:** converting the working tree to LF changed nothing durable. The blob in git was *already* LF (`git ls-files --eol` → `i/lf`, `attr/` empty); `core.autocrlf=true` re-adds the CRLF **on checkout**, and the root `.gitattributes` covered only `*.md` and `*.json`. `git checkout-index` through the real filters reproduced all 91 CRLF / 10 broken continuations. The actual fix is `*.sh text eol=lf` in `.gitattributes` plus `git add --renormalize respin/scripts`, re-verified the same way (now 0 and 0). `respin/tests/shell-scripts.test.ts` additionally fails on any CRLF or backslash-CR reintroduced into `respin/scripts/*.sh` (asserting against planted violations of both shapes, so it cannot pass by matching nothing) and now also runs `bash -n` on each script and executes their guards. **Consequence for the record above:** the 2026-08-17 "rehearsed end-to-end" claim was made against a tree whose committed script could not have completed a `pg_dump`. Either the rehearsal ran a differently-terminated copy or the record is overstated — it has not been re-run since the fix, so treat the rehearsal as **unverified** until a fresh drill is recorded.
  - **Production blocker (plan R3):** before the first production deploy — a scheduled backup to storage independent of the database host, least-privilege credentials, failure **and absence** alerting, and one real restore drill recorded here with its date and result.
  - **Last production drill: NEVER.** Update this line the first time one runs; a drill nobody recorded is a drill nobody can point at.

## Accounts (outside dependencies — where each login lives, never values · Last reviewed: 2026-08-17)

| Account | For | Credential location | Renewal / status |
|---|---|---|---|
| GitHub (`websfield/trendmonitor`) | Repo host + backup + CI | Owner's GitHub login | Active |
| AWS Lightsail | Respin hosting/deploy (R-18; replaced Vercel) | not yet provisioned — deploy shape undecided | — |
| ~~Neon~~ / ~~Clerk~~ / ~~Vercel~~ | — | **dropped by R-18/R-19** — self-hosted Postgres + Better Auth instead; no accounts needed | n/a |
| Stripe | Billing (live keys are rotate-everything) | test-mode account provisioned, used for M1's evidence run (`docs/progress/respin-m1-review.md`); **live keys not yet provisioned** — before launch | — |
| Resend / PostHog / Sentry | Email / analytics / errors | not yet provisioned — M1–M6 | — |
| Google Cloud (YouTube Data API) | Trend ingestion | not yet provisioned — M4 | quota-bound (tech-spec §4) |
| Domain registrar | Product domain (name pending R-2) | not yet purchased — before M6 | — |

Rows fill in with real locations (password-manager entry / env name) as accounts are created. **Bump the Last reviewed date in the heading on EVERY edit to this table, not only on a dedicated review pass** — audit #14 found it reading 2026-08-14 while the Stripe row already cited a 2026-08-17 document, so the date was stale against its own table. A stale **Last reviewed** date is itself a finding (`operability-critic`).

## Deletion journal — Respin (Phase 10b-1 Task 5, R-124) · Last reviewed: 2026-09-07

**Nothing is provisioned.** No S3 bucket, no IAM principal, no price snapshot, no restore walk. The code ships complete and the deployment default is a **refusing** journal: every append returns a conflict, so no deletion operation can advance past the state its request left it in. That is safe and deliberate — a journal that quietly wrote somewhere local would let an irreversible erasure proceed on a durability promise nothing was keeping.

**Provisioning is an owner action.** The full ordered checklist, the bucket policy and the three least-privilege IAM templates live in [`respin/infra/s3-deletion-journal/README.md`](respin/infra/s3-deletion-journal/README.md). Versioning and Object Lock must be enabled **before the bucket's first object** — Object Lock cannot be turned on afterwards.

**Operator commands**

```bash
pnpm -C respin journal:forecast          # cost forecast + the enablement decision; exit 2 = BLOCKED
pnpm -C respin journal:purge             # dry run: expired versions that could be purged
pnpm -C respin journal:purge --apply     # delete expired versions (Object Lock still refuses live ones)
```

`journal:forecast` today reports **WITHHELD (region_not_configured)** and **exits 2**, because no AWS region is chosen and no price snapshot has been reviewed.

**What that does and does not do, stated precisely.** The exit code is a *deployment-checklist* gate: a release process that runs `journal:forecast` and stops on a non-zero exit is what enforces R-124's ceiling. **Nothing in the running application consults it** — `app/(auth)/sign-up` is not gated, and there is no public-launch flag in the product to gate. An earlier draft of this section claimed the forecast "BLOCKS new-account/public enablement" as though the app enforced it; it does not, and the deferral is recorded in the plan's Deferral ledger. It never gates an in-flight deletion, append, purge, restore or residue verification.

**No price is compiled into the code.** The prices that decide whether public launch is allowed are facts about a vendor's price list on a date, so they are an operator-recorded artefact (`price-snapshot.<region>.json`), and a missing or stale one withholds the forecast rather than inventing a number. The shipped template is named `price-snapshot.EXAMPLE.json` and is excluded by name so its zero prices can never price anything.

**Restore ordering is fixed and fail-closed** (`respin/scripts/restore-drill.sh`, plan C4): isolated target → serving disabled (`RESTORE_SERVING_DISABLED=confirmed`, refused otherwise) → restore → migration-ledger count comparison (`db:check` is offline and was removed from this step) → **external journal verification** (`scripts/restore-verify.ts`: duplicate version, delete marker, gap, digest/checksum conflict, wrong retention, unreadable object, database-ahead-of-journal all refuse) → replay plan printed → **the drill never enables traffic**. Running the replay is the deletion worker's job with the journal configured; the drill's closing message says so explicitly rather than reading as a green light.

**Backup retention is capped at 21 days** (R-119) and `backup.sh` now **refuses** a higher `RETENTION_DAYS` rather than clamping it, and writes an immutable creation/expiry manifest beside each dump naming the tombstones active at backup time (ids, scope and state only — no email, no name, no content). `activeTombstones: null` means the query could not run, and the drill refuses on it: absence of an answer is not absence of tombstones.

**Evidence still owed before deletion or public launch** (none of it obtainable from this repository): bucket ARN, AWS region, rendered policy sha256, Versioning/Object-Lock/default-encryption status, the AWS SDK version from the lockfile, a reviewed regional price snapshot, and a real restore-walk transcript.

## Deploy — UGC Intelligence ONLY (how a change goes live)

**Three runnable host processes exist as of phase R4a (2026-07-14); no automated pipeline or container yet.** Each control-plane / knowledge component now has an ASP.NET host (`Microsoft.NET.Sdk.Web`, .NET 10) that runs its existing class-library logic as a **distinct executable/process** — the runtime separation ADR-0007 §6 requires. They are started manually, locally, one process each. There is still no CI, no `Dockerfile`, and no orchestration.

**Honest limitation:** the cross-process transport that carries Contracts A/C/E between the Python intelligence plane and these C# hosts is now **built and tested (phase R4b)**, but it is **wired behind config and not turned on by default**. Concretely: C2 uses the real HTTP breaker client **only when `C3:CalibrationBaseAddress` is configured** — otherwise it falls back to the fail-closed stub (C3 unreachable → breaker `cold` → VPS advisory); the pattern-artefact resolver reads real Python-written artefacts **only when a shared `ArtefactStore:Root` is configured and populated**. Unconfigured, each host runs individually correct and fail-closed. What remains is deployment: pointing the hosts at each other's real endpoints/store in a real environment, plus CI and containers.

Run each host (separate terminals; ports are examples, override with `ASPNETCORE_URLS`):

```bash
# C2 — scoring / compliance / verdict host (SOLE OutcomeEvent writer). No auto-approval endpoint exists.
ASPNETCORE_URLS=http://localhost:5211 dotnet run --project src/ControlPlane/UgcIntelligence.C2.Host
#   GET /health
#   GET /api/breaker/{tenantId}/{vertical}/{platform}/{rubricVersion}/{patternLibraryVersion}  → cold/advisory until R4b

# C3 — calibration / breaker authority host (reader-only over the event log; no write grant).
ASPNETCORE_URLS=http://localhost:5311 dotnet run --project src/ControlPlane/UgcIntelligence.C3.Host
#   GET /health
#   GET /api/calibration/{vertical}/{platform}   → breaker view (cold for an unknown cohort)

# C4 — Knowledge API host (read-only, one artefact-store prefix; no event log, no breaker, no C1/C2/C3).
ASPNETCORE_URLS=http://localhost:5411 dotnet run --project src/KnowledgeApi/UgcIntelligence.KnowledgeApi.Host
#   GET /health
#   GET /api/knowledge/mechanisms?vertical=&platform=&warrant=   → 200 + coverage.state (never 500 for an empty cohort)
```

**Non-secret configuration (each host's `appsettings.json` holds non-secret config only — golden rule 2):**

| Host | Non-secret env / config | Notes |
|---|---|---|
| C2 | `ASPNETCORE_URLS`, `ASPNETCORE_ENVIRONMENT`, `C2:BreakerTransport` | The real C3 breaker endpoint URL is an **R4b secret/env**, not committed. |
| C3 | `ASPNETCORE_URLS`, `ASPNETCORE_ENVIRONMENT` | The Python calibration-source endpoint URL is an **R4b secret/env**. |
| C4 | `ASPNETCORE_URLS`, `ASPNETCORE_ENVIRONMENT`, `ArtefactStore:Root` | `ArtefactStore:Root` is a non-secret local/blob path; C4's whole grant is the `mechanisms` prefix under it. |

**Secrets — never in `appsettings.json` or code:** LLM provider API key (APP-8 decision, Phase 3), social-platform API keys, DB/blob connection strings, and the R4b inter-host endpoint URLs. These arrive via environment variables / a secret manager when R4b lands. Record each name (never its value) here as it is introduced.

**Frontend (manager UI):** a React/TS SPA under `src/Frontend/` (triage queue, verdict/override panel, amplification sign-off, operator calibration dashboard). Build/serve with the standard Vite toolchain; `npm --prefix src/Frontend run typecheck` is green, and `npm --prefix src/Frontend test` (vitest) runs green as of 2026-07-28 — 10 test files / 86 tests pass (the earlier corrupted-npm-env block is resolved). It talks to C2's HTTP surface once that host is deployed.

**Remaining gap (deployment, not code):** a deploy command/pipeline, environments, container images, turning on the R4b transport config (`C3:CalibrationBaseAddress`, shared `ArtefactStore:Root`), and who may trigger a release.

**Known unbuilt seams (tracked, not misleading):** the Hangfire job runner is named in the tech spec but has no `src/` code yet (jobs land when built) — **and it was never the trend-scan host**: per ADR-0009 the nightly trend monitor is a Python entrypoint (`python -m c1_pattern_engine.detector.run`) triggered by external cron (deployment of the cron trigger itself is still deferred with the rest of deployment); Hangfire remains for genuinely .NET-side jobs (submission enqueue, outcome snapshots, staleness alarms). The `ArtefactStore` is local-filesystem-backed and needs a networked/blob backing for cross-host serving (folded into ADR-0008's durable-store step).

## The nightly trend scan — UGC Intelligence ONLY (built and runnable locally; cron deployment still deferred)

One invocation = one scan (the ADR-0009 scheduling port — no in-process timer; cadence is the
scheduler's job):

```bash
uv run python -m c1_pattern_engine.detector.run \
  --state-root .trend-monitor \
  --terms config/tracked-terms.yaml \
  --fetchers fake            # 'live' = the six keyless adapters behind the host-pinned allowlist
# --as-of 2026-07-16T00:00:00+00:00   # omit for now-UTC; tests/replays always pass it
# --tenants config/tenant-briefs.yaml # absent file → signals + coverage only, no verdicts
# --submissions <state-root>/submissions.ndjson   # absent file → no submission merge
```

Environment (non-secret): `TREND_MONITOR_STATE_ROOT`, `TREND_MONITOR_TERMS_FILE`,
`TREND_MONITOR_AS_OF`, `TREND_MONITOR_TENANTS_FILE`, `TREND_MONITOR_SUBMISSIONS_FILE`.
The intended production trigger is a daily cron (tech spec: 06:00 AEST)
invoking exactly the command above — **deploying that cron is part of the deferred deployment
gap**, consistent with this runbook's honest state. Re-running the same `--as-of` is idempotent;
a corrupt state file refuses to run (never silently starts empty) — restore it or move it aside
deliberately.

**No live source has ever been contacted from this code** — the whole test suite is network-free by
design, so `--fetchers live` is unverified against the real internet. That check, the cron install,
and the rest of the human-only work are tracked in [`ops-todos.md`](ops-todos.md).

## Rollback — UGC Intelligence ONLY (how to undo a bad deploy — named *before* it's needed)

> **Scope:** this section is the **parked UGC Intelligence** line's rollback procedure, and the three-step host
> rollback below is real and currently runnable. The **"none found — no deploy surface"** statement that used to
> open this section is about **Respin**, not about this — it contradicted the runnable procedure four lines under
> it (audit #12) and now lives where it is true, in the Respin section at the top of this file.

Two rollback semantics are already *designed* and must be preserved when built:

- **Pattern Library rollback** = repoint `active_version` to a previous immutable version — never edit a published artefact (`docs/initial.past/integration-contract.md`, Contract A).
- **Scoring rollback** = the circuit breaker: C3 trips a cohort to advisory automatically; restoring is a human decision with a recorded reason (Contract C).

**Host rollback (phase R4a — named before it is needed).** The three hosts (`UgcIntelligence.C2.Host`, `UgcIntelligence.C3.Host`, `UgcIntelligence.KnowledgeApi.Host`) are stateless executables that wrap deterministic class-library logic; none holds durable state of its own (C2's event log and C4's artefact cache are in-memory/local for now — see finding #16). Rollback of a bad host build is therefore **stop the process and restart the previous build**, per host, independently — there is no shared mutable runtime state to unwind and no schema migration to reverse:

1. **Stop the affected host** (`Ctrl-C` / kill the process). Even with the R4b transport wired, stopping one host degrades safe rather than cascading: a stopped or unreachable C3 leaves C2's breaker reading `cold` (advisory) — fail-closed, never a wrong score or an approval — and a stopped C4 returns nothing; it never held tenant data to lose.
2. **Redeploy the previous build** of that host project alone (`dotnet run`/`dotnet publish` of the prior commit). The other two hosts are unaffected — separate processes, separate blast radius.
3. **Verify** each host's `GET /health` returns 200 and, for C2, that the breaker endpoint reads `cold`/advisory (never `armed` without a live C3). No auto-approval endpoint exists to re-check.

Gap to close after R4b: image-based rollback and a documented order-of-operations once the inter-host transport (and any durable store, finding #16) exists — at that point stopping a host *does* have downstream effects and the rollback order will matter.

## Configuration — UGC Intelligence ONLY (each name and where it lives — never a value)

**One checked-in config artefact:** `config/source-allowlist.yaml` — the source ingestion/redistribution allowlist, versioned and reviewed like code. Beyond it: no `.env.example`, no config schema, no secrets in the repo (correct — golden rule 2).

Known-required configuration when code lands (from the docs): LLM provider API key (overseas processing — APP 8 decision required before Phase 3), social-platform API keys per source adapter (keyless reads are `Proxy` provenance by rule), database + blob-storage connection strings, ε exploration bounds (floor 0.10 / ceiling 0.30 — **must not be configurable to zero**, ADR-0003), breaker cache TTL (60s). Record each name and its store (env var, secret manager) here as it is introduced.

## Observability — UGC Intelligence ONLY (where to look when something breaks)

**Partially built (Phase 1).** The append-only OutcomeEvent log is now the system of record for every compliance decision.

- The **append-only OutcomeEvent log** (`UgcIntelligence.Events.AppendOnlyEventLog`, schema `docs/initial.past/schemas/events-v1.json`, **contract 1.3.0**) is the system of record for every decision. It carries `VerdictIssued` (the deterministic compliance verdict — `decided_by = deterministic_verdict_engine`, `vetoes_fired[]`, and a null-unless-clicked `human_approved_at`) and `VerdictOverridden` (original, override, reason, reviewer_id, and — as of 1.3.0 — a `human_approved_at` set only when the override verdict is `APPROVED`; a compensating event, never a delete). C2 is the sole writer; C1 and C3 are read-only consumers. Both APPROVED-emitting boundaries reject an approval with a null timestamp or over a live veto. A verdict whose event append failed is **not** issued — the caller sees the failure, and the idempotency key makes the retry safe. The replay export is snake_case NDJSON the Python plane parses (Contract B).
- **Auditing a decision:** replay the log tenant-scoped (`ReplayAsync(tenantId)` / `ToReplayExportNdjson(tenantId)`). Every `VerdictIssued` is reconstructible from stored records plus the pinned inputs; the model's `suspected_vetoes` ride on the event as surfaced context only, never as an input to the verdict.
- **Breaker state** per cohort is served by the **C3 host** at `/api/calibration/{vertical}/{platform}`; C2 reads it through a fail-closed HTTP client (60s TTL, then `cold`; a future-dated reading is also treated as `cold`).
- **Library staleness alarm** at 30 days; **override-rate-by-cohort** (from `VerdictOverridden`) as the human-review decay signal.
- Suspected prompt-injection attempts are logged against the creator record and routed to human review.

## Backup & restore — UGC Intelligence ONLY

**Durable runtime data now exists in one place:** the trend-monitor state root (default `.trend-monitor/trend-monitor-state.json`, gitignored — it may hold tenant-scoped signals). Backing it up = copying that file; restoring = putting it back (the loader refuses a corrupt file rather than silently starting empty). The design docs and source code are under **local git** (initial commit `587a0d6`); the remaining gap is a remote (push somewhere off this machine — the single cheapest backup step still available).

When the system exists, the durable data will be: the relational store (submissions, verdicts, rights grants, baselines), the event log, and the content-addressed library artefacts. **Restore has never been tested** — record here the backup job, its schedule, and the date of the last *successful restore test* before Phase 1 goes live. A backup whose restore was never tested is a hope, not a backup.
