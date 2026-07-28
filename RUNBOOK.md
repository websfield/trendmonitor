# RUNBOOK

> The operating manual a competent stranger (or the founder six months from now) uses to run, deploy, and *recover* this system. Written by `/bootstrap-claude-pack` on 2026-07-10; refreshed 2026-07-14 (phases R4a/R4b). **A built, tested codebase with three runnable ASP.NET hosts exists, and the cross-process transport is built and wired behind config — but nothing is production-deployed (no CI, no container, no pipeline). The repo is under local git version control (initial commit `587a0d6`); no remote backup yet.** Each section states what exists honestly and names the remaining gap. The `operability-critic` audits this file; do not let it imply safety that hasn't been built.

## Deploy (how a change goes live)

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

## The nightly trend scan (built and runnable locally; cron deployment still deferred)

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

## Rollback (how to undo a bad deploy — named *before* it's needed)

**None found — no deploy surface.** Two rollback semantics are already *designed* and must be preserved when built:

- **Pattern Library rollback** = repoint `active_version` to a previous immutable version — never edit a published artefact (`docs/initial/integration-contract.md`, Contract A).
- **Scoring rollback** = the circuit breaker: C3 trips a cohort to advisory automatically; restoring is a human decision with a recorded reason (Contract C).

**Host rollback (phase R4a — named before it is needed).** The three hosts (`UgcIntelligence.C2.Host`, `UgcIntelligence.C3.Host`, `UgcIntelligence.KnowledgeApi.Host`) are stateless executables that wrap deterministic class-library logic; none holds durable state of its own (C2's event log and C4's artefact cache are in-memory/local for now — see finding #16). Rollback of a bad host build is therefore **stop the process and restart the previous build**, per host, independently — there is no shared mutable runtime state to unwind and no schema migration to reverse:

1. **Stop the affected host** (`Ctrl-C` / kill the process). Even with the R4b transport wired, stopping one host degrades safe rather than cascading: a stopped or unreachable C3 leaves C2's breaker reading `cold` (advisory) — fail-closed, never a wrong score or an approval — and a stopped C4 returns nothing; it never held tenant data to lose.
2. **Redeploy the previous build** of that host project alone (`dotnet run`/`dotnet publish` of the prior commit). The other two hosts are unaffected — separate processes, separate blast radius.
3. **Verify** each host's `GET /health` returns 200 and, for C2, that the breaker endpoint reads `cold`/advisory (never `armed` without a live C3). No auto-approval endpoint exists to re-check.

Gap to close after R4b: image-based rollback and a documented order-of-operations once the inter-host transport (and any durable store, finding #16) exists — at that point stopping a host *does* have downstream effects and the rollback order will matter.

## Configuration (each name and where it lives — never a value)

**One checked-in config artefact:** `config/source-allowlist.yaml` — the source ingestion/redistribution allowlist, versioned and reviewed like code. Beyond it: no `.env.example`, no config schema, no secrets in the repo (correct — golden rule 2).

Known-required configuration when code lands (from the docs): LLM provider API key (overseas processing — APP 8 decision required before Phase 3), social-platform API keys per source adapter (keyless reads are `Proxy` provenance by rule), database + blob-storage connection strings, ε exploration bounds (floor 0.10 / ceiling 0.30 — **must not be configurable to zero**, ADR-0003), breaker cache TTL (60s). Record each name and its store (env var, secret manager) here as it is introduced.

## Observability (where to look when something breaks)

**Partially built (Phase 1).** The append-only OutcomeEvent log is now the system of record for every compliance decision.

- The **append-only OutcomeEvent log** (`UgcIntelligence.Events.AppendOnlyEventLog`, schema `docs/initial/schemas/events-v1.json`, **contract 1.3.0**) is the system of record for every decision. It carries `VerdictIssued` (the deterministic compliance verdict — `decided_by = deterministic_verdict_engine`, `vetoes_fired[]`, and a null-unless-clicked `human_approved_at`) and `VerdictOverridden` (original, override, reason, reviewer_id, and — as of 1.3.0 — a `human_approved_at` set only when the override verdict is `APPROVED`; a compensating event, never a delete). C2 is the sole writer; C1 and C3 are read-only consumers. Both APPROVED-emitting boundaries reject an approval with a null timestamp or over a live veto. A verdict whose event append failed is **not** issued — the caller sees the failure, and the idempotency key makes the retry safe. The replay export is snake_case NDJSON the Python plane parses (Contract B).
- **Auditing a decision:** replay the log tenant-scoped (`ReplayAsync(tenantId)` / `ToReplayExportNdjson(tenantId)`). Every `VerdictIssued` is reconstructible from stored records plus the pinned inputs; the model's `suspected_vetoes` ride on the event as surfaced context only, never as an input to the verdict.
- **Breaker state** per cohort is served by the **C3 host** at `/api/calibration/{vertical}/{platform}`; C2 reads it through a fail-closed HTTP client (60s TTL, then `cold`; a future-dated reading is also treated as `cold`).
- **Library staleness alarm** at 30 days; **override-rate-by-cohort** (from `VerdictOverridden`) as the human-review decay signal.
- Suspected prompt-injection attempts are logged against the creator record and routed to human review.

## Backup & restore

**Durable runtime data now exists in one place:** the trend-monitor state root (default `.trend-monitor/trend-monitor-state.json`, gitignored — it may hold tenant-scoped signals). Backing it up = copying that file; restoring = putting it back (the loader refuses a corrupt file rather than silently starting empty). The design docs and source code are under **local git** (initial commit `587a0d6`); the remaining gap is a remote (push somewhere off this machine — the single cheapest backup step still available).

When the system exists, the durable data will be: the relational store (submissions, verdicts, rights grants, baselines), the event log, and the content-addressed library artefacts. **Restore has never been tested** — record here the backup job, its schedule, and the date of the last *successful restore test* before Phase 1 goes live. A backup whose restore was never tested is a hope, not a backup.
