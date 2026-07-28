# Ops TODOs — tasks that need a human

Things the trend-monitor work surfaced that **cannot be closed by writing code**: they need infrastructure access, legal judgment, business input, credentials, or a real-world check against the live internet. Coding follow-ups are *not* listed here — they live in the phase plans and review cards under `docs/plans/` and `docs/progress/`.

Raised: 2026-07-16, during the `trend-monitor-runtime` build (phases 1–9).
Owner column is blank on purpose — assign before the first production run.

---

## Blocking a first production run

### 1. Install the nightly scheduler
**Why a human:** I can't touch the deploy host, crontab, or container schedule.
The scan is a one-shot entrypoint by design (ADR-0009 — one invocation = one scan, no in-process timer):
```
python -m c1_pattern_engine.detector.run --as-of <ISO-8601>
```
**Needed:** pick the host; install the cron/systemd timer/container schedule; set the working directory, `TREND_MONITOR_STATE_ROOT`, and `--fetchers live`; confirm the invocation runs as a user that can write the state root. `RUNBOOK.md` documents the command; **deployment itself is still undone.**

### 2. Confirm the day boundary (AEST vs UTC)
**Why a human:** it's a product decision with a measurement consequence, not a code choice.
The tech spec says *"Daily, 06:00 AEST"*; the entrypoint is UTC-anchored (`first_detected_at` = the logical day at 00:00 UTC). That anchor is what every submitter lead-time credit is measured against, so the convention has to be *decided*, not defaulted into.
**Needed:** confirm which day boundary is intended, then set the cron TZ and `--as-of` convention to match.

### 3. Verify the six live sources against the real internet
**Why a human:** the entire test suite is network-free by design (the phase-7 plan requires *"Mock the network — no real external calls in the test suite"*). **No real request has ever been made from this code.**
**Needed:** one supervised `--fetchers live` run, confirming each of the six sources returns the expected shape:
`wikipedia_pageviews`, `hacker_news`, `reddit`, `google_trends`, `youtube_trending`, `rss_news`.
**Known risk:** the measurement gate flagged that `youtube_trending` hits `https://www.youtube.com/feeds/videos.xml?search_query=…` and it's uncertain YouTube still serves `search_query` feeds. If it 404s the system degrades *honestly* (→ `AdapterDark` → stated coverage gap), so nothing breaks loudly — it just quietly stops covering YouTube. Worth checking deliberately.

### 4. Legal / ToS review of the six trend hosts
**Why a human:** a compliance judgment I'm not able to make.
The trend allowlist (`config/source-allowlist.yaml` → `trend_sources:`) grants **volume-fetch only** and is structurally disjoint from the exemplar-media rights allowlist — adding a trend host cannot widen media-ingestion rights (proven by test). That disjointness is enforced; the *permission to poll at all* is not.
**Needed:** confirm each host's ToS/robots.txt permits automated keyless polling at a nightly cadence, and that the current etiquette is acceptable — 1 request/second per host, `User-Agent: ugc-intelligence-trend-monitor/1.0`, no credentials, https-only, redirects refused, 5 MB response cap.

---

## Business / editorial input the system is waiting on

### 5. Supply the tenant-brief artefact
**Why a human:** these are client commitments, not values I can invent.
`config/tenant-briefs.yaml` does not exist. With it absent the scan still runs and produces signals + coverage but renders **zero verdicts** (fail-safe by design, Phase 6 R5) — so no `go`/`caution`/`skip` reaches anyone, and the Phase 8 ingestion coupling never fires.
**Needed per tenant:** `tenant_id`, `lead_time_days` (the *actual* brief-to-live median — the `× 1.5` safety factor is applied on top), `brand_fit` ∈ [0,1], `risk_flag` ∈ {none, caution, blocked}.

### 6. Seed the real tracked-terms list
**Why a human:** an editorial decision about what's worth watching.
`config/tracked-terms.yaml` currently holds **3 placeholder seed terms**. Terms are capped at 250 per (vertical, platform).
**Needed:** the real editorial seed list per vertical/platform.

### 7. Staff and schedule the submission resolution sweep
**Why a human:** it's a staffing and process question.
The submitter loop only produces value if a resolver actually resolves submissions (tech-spec cadence: T+14d / T+30d sweeps). **A submitter may never resolve their own submission** — enforced in two places: `SubmissionBook.resolve` voids and logs it, and the nightly merge independently re-checks `resolver_id != submitter_id` (because the NDJSON path bypasses `resolve()` entirely). So at least two people are genuinely required.
**Needed:** named resolvers, a recurring sweep in someone's calendar, and agreement on who arbitrates `observed_class` — the resolver's call, not the submitter's forecast, is what sets a trend's stage.

### 8. Decide how submissions actually reach the system
**Why a human:** an architecture + access-control decision.
The tech spec's `POST /api/trends/submissions` does not exist. The interim surface is an append-only NDJSON file at `<state-root>/submissions.ndjson` (recorded as a deferral in the Phase 9 plan).
**Needed:** decide whether to build the real API or keep the file drop. The file is **trusted by position** — anyone who can write to it can append a row — so if it stays, its filesystem permissions *are* a security control. The merge treats every row as untrusted and re-checks role, resolver independence, and stage validity at the point of use, but it cannot check *who wrote the line*.
**Known limitation while the file surface stands:** the replay also bypasses `max_open_positions` (5/submitter), so an oversized file can admit unbounded weight-1.0 `HUMAN_SUBMISSION` terms that displace scanned terms under the 250-per-bucket cap. Bounded by whoever controls write access.

### 8b. Decide whether client-role submissions are in scope
**Why a human:** a product + tenancy decision, and the spec and the build currently disagree.
REQ-005a says *"Any authenticated user with a manager, **client**, or resolver role can submit a candidate trend."* But a client submission is **tenant-originated**, and the shared `TermRegistry` and exemplar corpus are tenant-neutral by construction (REQ-060) — publishing a client's trend as a public signal every tenant can read would be a tenancy widening. The Phase 9 plan explicitly puts tenant-originated submissions out of scope *"until an internal-scope rule exists"*.
**Current behaviour:** manager/resolver submissions are accepted; **client submissions are refused and logged** (fail-closed).
**Needed:** decide whether to build internal-scope (tenant-private) submissions so clients can submit, or amend REQ-005a to staff-only. Until then clients cannot submit, which is a deliberate divergence from the spec.

---

## Operability — do these before you depend on the data

### 9. Back up the state root *and test a restore*
**Why a human:** needs backup infrastructure I can't configure.
Everything cross-run lives in one file: `<state-root>/trend-monitor-state.json` — signals, identity anchors (`first_seen` / `first_detected_at`), resolved-duration samples, the term registry (active + cold), and the verdict ledger. Writes are atomic (tmp + `os.replace`), and a corrupt file makes the run **refuse to start** rather than silently start empty — but nothing replaces a lost file. Losing it re-mints every signal id and destroys all trend history and submitter credit anchors.
**Needed:** a backup schedule **and at least one actual restore drill** — an untested backup is not a backup.
**Note:** the state root is gitignored deliberately — it can hold tenant-scoped signals and must never be committed.

### 10. Wire monitoring / alerting for the nightly job
**Why a human:** needs access to the alerting stack.
Nothing currently notices if the cron stops firing, the process raises, or sources go dark.
**Needed:** alert on (a) job failure or a missed run, (b) `dark_sources` non-empty, (c) new coverage gaps. Plus the tech spec's product alerts: immediate on `z > 4` with corroboration, and on any newly-issued `go` verdict.
**Why it matters for measurement, not just uptime:** a missed run **biases results upward** — archived trends close at their `valid_to` (the presumption horizon), so an outage inflates recorded trend lifetimes and the verdict ledger's survival rate. A silent cron failure quietly makes the system look better than it is.

---

## Still deliberately closed

### 11. Ratify the exemplar-media source allowlist (the D5 legal gate)
**Why a human:** an explicit legal review, pre-dating this work and still open.
`corpora/exemplar.py::ingest_live` unconditionally raises `LiveIngestionBlocked`. Phases 7–9 all deliberately left it shut, and each phase's boundary gate re-verified it stays shut. Real exemplar-media ingestion cannot begin until this is ratified.
**Needed:** the legal review. (Implementing ingestion afterwards is a coding task — it is *blocked on* this, not part of it.)
