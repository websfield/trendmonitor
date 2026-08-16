# Shaping brief — trend-monitor-runtime

**Request (as stated):** "yes, i understand that trend monitor is not the whole thing. But we still need one" → `/shape first`.

**Real job:** As a campaign manager, I want the system to surface emerging trends on its own — from live sources, every day — so the campaign brief and corpus ingestion point at what's actually rising, without anyone hand-running a script.

**Key finding (why this is a runtime job, not a from-scratch build):** the detector *logic* already exists and is under test (part of the 261 passing pytest cases): [detector/](../../src/IntelligencePlane/c1_pattern_engine/detector/) — robust-z detection ([detect.py](../../src/IntelligencePlane/c1_pattern_engine/detector/detect.py)), lifecycle/days-remaining, `TrendSignal`, tenant-scoped `TrendVerdict` ([verdict.py](../../src/IntelligencePlane/c1_pattern_engine/detector/verdict.py)), coverage reporting, the manager feed, and the human submission loop ([submissions/](../../src/IntelligencePlane/c1_pattern_engine/submissions/)). What is missing is the **runtime**: a scheduler, live source ingestion, and the coupling into corpus-ingestion priority. Per `RUNBOOK.md`, the **Hangfire job runner is named in the tech spec but has no `src/` code yet** — that is the central gap this build fills.

**Chosen scope:** 10-star — a **nightly-scheduled, automated trend monitor**: a scheduled job runs the existing detector pipeline (`z_series → detect_candidates → lifecycle → verdict → store`) against **live keyless sources** (ADR-0001 Tier 3, `Proxy` provenance), merges the human submission loop, feeds **ingestion-priority** into the Pattern Engine's corpus builder, and surfaces a **manager-facing** trend feed with coverage honesty. Multi-phase.

**10-star sketch (aim across phases):**
- Nightly scheduler (the unbuilt Hangfire runner, or an equivalent job host) that runs the scan on a cadence, idempotently, and fails closed.
- Live source adapters for the keyless Tier-3 sources (Google Trends RSS, Reddit rising, YouTube RSS + outlier detection, Wikipedia pageviews, Hacker News, news pulse), enforcing `config/source-allowlist.yaml`, labelling every read `Proxy`.
- The human submission loop (closed platforms — TikTok/Reels) merged into the same feed, submitters scored on lead time + accuracy ([submissions/scoring.py](../../src/IntelligencePlane/c1_pattern_engine/submissions/scoring.py)).
- The permitted one-way coupling: a `rising` + `go` trend raises **ingestion priority** for exemplars in that format so the Pattern Engine's corpus builder points at the right place (ADR-0004 §1; ADR-0006 makes it an eval gate, not an assumption).
- A manager coverage view: the feed states which platforms it *cannot* see rather than silently reporting only the open web.

**North Star alignment:** advances **Goal item 3** (accumulate transferable knowledge — the trend subsystem is the ingestion-direction input to mechanism mining) and **Phase 6/7** of the roadmap. **Flagged drift:** pulls attention away from the stated **Current focus (Phase 0 → Phase 1: compliance instrumentation)** — the user chose to proceed anyway (user sovereignty).

**Non-goals (now):**
- **No creator-facing trend feed** (REQ-005g is an explicit North-Star Non-goal). The feed is manager/ingestion-facing only.
- **Trends never touch the score.** No `TrendSignal` value enters VPS/BAS/AWS/veto/verdict/budget at any weight, under any config (REQ-005e; already enforced in code — must stay enforced).
- **No mechanism warrant coupling.** A trend only decides *where the corpus builder looks*; it never touches a mechanism's warrant rung (ADR-0006 amendment).
- **No executing on closed-platform crawling.** TikTok Creative Center stays a human-in-the-loop surface, not an automated crawler (ADR-0001 declined the crawler; ADR-0004 §context).
- Not deploying the scheduler to a real environment (no CI/container/pipeline yet — consistent with RUNBOOK's honest state); "nightly" is built and runnable locally, deployment is a later gap.

**How this fails (pre-mortem):**
1. **Scope balloons into an external-integration project** — live keyless sources bring auth-free HTTP, rate limits, ret/backoff, allowlist enforcement, and network-failure handling; the "wire the detector" framing hides that surface. Sequence it so the scheduler + pipeline land on a fake/replayable source *first*, then swap in live adapters behind the same port.
2. **Provenance / coverage dishonesty** — a keyless read mislabelled `Measured`, or a `Proxy` value leaking toward an effect-size path, is a measurement-discipline breach; and a feed that reports only open-web platforms while blind to TikTok/Reels is the exact ADR-0004 coverage trap. Coverage honesty and `Proxy` labelling are acceptance criteria, not nice-to-haves.
3. **Invariant drift under the new runtime** — the new scheduler/ingestion path is a fresh place for a trend→score leak or a creator-facing drift to sneak in. The `measurement-discipline` and `component-boundaries` gates must run on every phase that touches ingestion, signals, or the coupling.

**Resolved decisions (settled during shaping):**
- **Scheduler host → Python entrypoint + external cron.** Build an idempotent orchestrator invokable as `python -m c1_pattern_engine.detector.run` (fetch → existing pipeline → store) behind a thin scheduling *port*; "nightly" is an external trigger (OS cron / container scheduler) invoking it. Rationale: the trend scan is non-decisional intelligence-plane work, so it stays in Python rather than forcing a .NET→Python cross-plane call; no new scheduler-framework dependency; fully testable now (run once → assert idempotent + fail-closed); the cadence mechanism is deferred to deployment, matching RUNBOOK's honest "nothing deployed yet" state. **This diverges from the tech spec's named Hangfire runner** — Hangfire remains available for genuinely .NET-side jobs (e.g. outcome snapshots, staleness alarms); it is simply not on the trend-scan path. The divergence should be captured (DECISIONS.md now; an ADR/tech-spec note during `/create-plan` per docs-first).

**Must-answer ambiguities remaining for planning:**
- **Live vs replayable sources for the first runnable cut** (pre-mortem #1 argues replayable/fake source behind the fetch port first, live adapters swapped in behind the same port after).
- **What "nightly" means without deployment** — a runnable local job + tests proving cadence-triggering and idempotency, deferring real cron/CI to a deployment phase.

**Critical Paths this touches:** Measurement discipline (provenance, baselines, coverage), Boundaries & authority (the one-way trend→ingestion coupling, signal store, no trend→score path). Both gates apply per phase.
