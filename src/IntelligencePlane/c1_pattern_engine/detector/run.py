"""The nightly-scan entrypoint: ``python -m c1_pattern_engine.detector.run`` (Phase 5, ADR-0009).

**The scheduling port.** One invocation = one scan; the process loads the durable state root,
runs the pipeline, persists, prints a summary, and exits. There is **no in-process timer or
loop** — cadence is an external concern (OS cron / a container scheduler invokes this nightly).
That is the whole port: the contract between this code and any scheduler is "invoke me once per
logical day with an ``--as-of``".

**Hydration order (Phase 5 R1):** load the state root (signals + identity index + resolved
samples + term registry + verdict ledger) → seed the registry from the term-source config
(``config/tracked-terms.yaml`` — seeds only terms the persisted registry doesn't already hold,
so a persisted admission, e.g. Phase 8's ``TREND_DETECTED`` terms, always survives and is never
clobbered by the seed file) → scan over the registry's active terms → persist atomically.

**Fail-closed (Phase 5 R4):** a dark source degrades to fewer signals plus a stated coverage
gap; any error before ``persist()`` leaves the on-disk state untouched (the write is atomic
tmp+replace, so a crash mid-persist also leaves the previous state intact); a corrupt state file
refuses to run rather than silently starting empty.

**Configuration (Phase 5 R5):** non-secret, file/env driven — no credential exists anywhere on
this path (the keyless sources need none).
"""

from __future__ import annotations

import argparse
import os
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

import yaml

from c1_pattern_engine.adapters.base import DateRange, RawVolumeFetch
from c1_pattern_engine.detector.coupling import apply_trend_direction
from c1_pattern_engine.detector.run_scan import (
    DEFAULT_TRACKED_PLATFORMS,
    ScanResult,
    run_scan,
)
from c1_pattern_engine.detector.store_durable import StateRoot
from c1_pattern_engine.detector.tenants import load_tenant_briefs
from c1_pattern_engine.registry.terms import AdmissionOrigin, TrackedTerm
from c1_pattern_engine.submissions.merge import admit_submission_terms
from c1_pattern_engine.submissions.submit import load_submission_book

__all__ = ["load_tracked_terms", "main", "run_once", "synthetic_fetchers"]

ENV_STATE_ROOT = "TREND_MONITOR_STATE_ROOT"
ENV_TERMS_FILE = "TREND_MONITOR_TERMS_FILE"
ENV_AS_OF = "TREND_MONITOR_AS_OF"
ENV_TENANTS_FILE = "TREND_MONITOR_TENANTS_FILE"
ENV_SUBMISSIONS_FILE = "TREND_MONITOR_SUBMISSIONS_FILE"
DEFAULT_STATE_ROOT = ".trend-monitor"
DEFAULT_TERMS_FILE = "config/tracked-terms.yaml"
DEFAULT_TENANTS_FILE = "config/tenant-briefs.yaml"
# The interim submission ingestion surface (Phase 9 R1): NDJSON under the state root, so
# submissions/resolutions survive across nightly processes until POST /api/trends/submissions lands.
DEFAULT_SUBMISSIONS_FILENAME = "submissions.ndjson"


def load_tracked_terms(path: str | Path, *, as_of: datetime) -> list[TrackedTerm]:
    """Read the term-source config: a YAML list of ``{term, vertical, platform, kind}`` rows.

    Absent file → no seeds (the persisted registry alone drives the scan). Non-secret by
    construction — the file names public search terms only.
    """
    path = Path(path)
    if not path.exists():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return [
        TrackedTerm(
            term=row["term"],
            vertical=row["vertical"],
            platform=row["platform"],
            origin=AdmissionOrigin.EDITORIAL_SEED,
            admitted_at=as_of,
            last_activity_at=as_of,
            kind=row.get("kind", "topic"),
        )
        for row in raw.get("terms", [])
    ]


def synthetic_fetchers() -> dict[str, RawVolumeFetch]:
    """Deterministic fake fetchers (the Phase 5 default — live adapters land in Phase 7).

    Every term gets an alternating 9/11 baseline (nonzero MAD) with a two-day spike tail, so a
    local invocation visibly detects and stores signals. Deterministic: same term, same span,
    same volumes — no RNG, no wall clock.
    """

    def fetch(_term: str, span: DateRange) -> dict[date, float]:
        days = list(span.days())
        vols = {d: (9.0 if i % 2 == 0 else 11.0) for i, d in enumerate(days)}
        for offset in (2, 1):
            vols[days[-offset]] = 30.0
        return vols

    return {"reddit": fetch, "hacker_news": fetch}


def run_once(
    *,
    state_root: str | Path,
    as_of: datetime,
    terms_file: str | Path | None = None,
    tenants_file: str | Path | None = None,
    submissions_file: str | Path | None = None,
    fetchers: dict[str, RawVolumeFetch] | None = None,
    tracked_platforms: tuple[str, ...] = DEFAULT_TRACKED_PLATFORMS,
) -> ScanResult:
    """One scan, end to end: load → seed → merge submissions → scan → couple → persist. Raises,
    never half-commits."""
    state = StateRoot.load(state_root)

    # Hydrate the human submission book (Phase 9): NDJSON under the state root by default. An absent
    # file → an empty book (a scan with no submissions is legitimate).
    book = load_submission_book(
        submissions_file or Path(state_root) / DEFAULT_SUBMISSIONS_FILENAME
    )
    # Registry-side merge (kept off the spine, like the Phase 8 coupling): every open submission
    # admits its term HUMAN_SUBMISSION BEFORE the scan, so a submitted term is scanned this run — an
    # open-web term may then be auto-detected (and a predating submission upgrades its confidence),
    # while a closed-platform term stays unscanned and becomes a submission-born signal in merge.
    admit_submission_terms(book, state.registry, as_of=as_of)

    seeds = load_tracked_terms(terms_file or DEFAULT_TERMS_FILE, as_of=as_of)
    # Seed only terms the persisted registry doesn't already hold — active OR cold. Guarding the
    # cold set too (Phase 8, carried Phase 5 note a): a seed evicted to cold under cap pressure is
    # not in `active()`, so without the cold guard it would be re-admitted every night and, if the
    # bucket is still full, re-appended to append-only cold storage unboundedly. Known-either-way
    # → skip.
    known = {t.key for t in state.registry.active()} | {
        t.key for t in state.registry.cold_storage()
    }
    for seed in seeds:
        if seed.key not in known:
            state.registry.admit(seed)

    result = run_scan(
        terms=state.registry.active(),
        fetchers=fetchers if fetchers is not None else synthetic_fetchers(),
        as_of=as_of,
        store=state.signals,
        identity_index=state.identity,
        samples=state.samples,
        tracked_platforms=tracked_platforms,
        # Verdict rendering is config-gated (Phase 6 R5): an absent tenant-brief artefact means
        # signals + coverage only — never an error.
        tenants=load_tenant_briefs(tenants_file or DEFAULT_TENANTS_FILE),
        ledger=state.ledger,
        book=book,  # Phase 9: born signals + confidence upgrades + coverage open-submission counts
    )

    # The one permitted coupling (Phase 8 R1): a rising+go verdict on a PUBLIC signal raises its
    # term's ingestion priority (origin TREND_DETECTED) so the corpus builder points at that
    # format. apply_trend_direction refuses internal-scope signals and unresolvable ids fail-
    # closed; we dedupe by trend_id so a trend that is `go` for several tenants directs its term
    # exactly once. This runs BEFORE persist, so the directed admission survives to the next scan.
    directed: set[UUID] = set()
    for verdict in result.verdicts:
        if verdict.verdict != "go" or verdict.trend_id in directed:
            continue
        directed.add(verdict.trend_id)
        try:
            kind = state.signals.get(verdict.trend_id).kind
        except KeyError:
            kind = "topic"
        apply_trend_direction(
            verdict, state.registry, identity_index=state.identity, as_of=as_of, kind=kind
        )

    # Registry lifecycle decision (Phase 8, carried Phase 5 note b): the nightly run does NOT call
    # registry.evict_stale(as_of). Enabling 90-day staleness eviction correctly first requires
    # refreshing an active term's last_activity_at whenever the scan OBSERVES it — the spine does
    # not do that today, so evict_stale would age terms by admission time and wrongly evict ones
    # still producing volume. The 250-per-bucket cap already bounds growth (lowest-priority
    # displaced to cold); time-based eviction is deferred to a phase that also wires activity
    # refresh. Documented here rather than left as silent inert code.

    state.persist()  # atomic; nothing on disk changed before this line
    return result


def _parse_as_of(value: str | None) -> datetime:
    if value is None:
        # The one deliberate "now": the production cron default, explicit and documented here —
        # tests and replays always pass --as-of (Phase 5 R6).
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m c1_pattern_engine.detector.run",
        description=(
            "Run ONE nightly trend scan and exit (the scheduling port — cadence lives in an "
            "external cron/scheduler, never in-process; ADR-0009)."
        ),
    )
    parser.add_argument(
        "--state-root",
        default=os.environ.get(ENV_STATE_ROOT, DEFAULT_STATE_ROOT),
        help=f"Durable state directory (env {ENV_STATE_ROOT}; default {DEFAULT_STATE_ROOT!r}).",
    )
    parser.add_argument(
        "--as-of",
        default=os.environ.get(ENV_AS_OF),
        help="Logical scan datetime, ISO-8601 (UTC assumed if naive). Default: now (UTC). "
        "Tests/replays always pass this — runs are reproducible from it.",
    )
    parser.add_argument(
        "--terms",
        default=os.environ.get(ENV_TERMS_FILE, DEFAULT_TERMS_FILE),
        help=f"Tracked-terms seed YAML (env {ENV_TERMS_FILE}; default {DEFAULT_TERMS_FILE!r}).",
    )
    parser.add_argument(
        "--fetchers",
        choices=("fake", "live"),
        default="fake",
        help="'fake' = deterministic synthetic (default, safe); 'live' = the keyless adapters "
        "behind the host-pinned trend_sources allowlist (Phase 7).",
    )
    parser.add_argument(
        "--tenants",
        default=os.environ.get(ENV_TENANTS_FILE, DEFAULT_TENANTS_FILE),
        help=f"Tenant-brief artefact YAML (env {ENV_TENANTS_FILE}; default "
        f"{DEFAULT_TENANTS_FILE!r}). Absent file → signals + coverage only, no verdicts.",
    )
    parser.add_argument(
        "--submissions",
        default=os.environ.get(ENV_SUBMISSIONS_FILE),
        help=f"Human submission NDJSON (env {ENV_SUBMISSIONS_FILE}; default "
        f"<state-root>/{DEFAULT_SUBMISSIONS_FILENAME}). Absent file → no submission merge.",
    )
    args = parser.parse_args(argv)

    fetchers = None  # "fake": run_once resolves the deterministic synthetic set
    if args.fetchers == "live":
        # Live adapters: allowlist loaded fresh (construction-time enforcement refuses any
        # source without a trend_sources entry, before a single fetch exists).
        from c1_pattern_engine.adapters.allowlist import load_trend_allowlist
        from c1_pattern_engine.adapters.fetchers import build_live_fetchers
        from c1_pattern_engine.adapters.http import KeylessHttpClient

        allowlist = load_trend_allowlist()
        fetchers = build_live_fetchers(allowlist, KeylessHttpClient(allowlist=allowlist))

    result = run_once(
        state_root=args.state_root,
        as_of=_parse_as_of(args.as_of),
        terms_file=args.terms,
        tenants_file=args.tenants,
        submissions_file=args.submissions,
        fetchers=fetchers,
    )

    gaps = [c.platform for c in result.coverage if c.coverage_gap]
    print(f"scan as_of={result.as_of.isoformat()}")
    print(f"tenant verdicts rendered: {len(result.verdicts)}")
    print(f"signals stored/refreshed: {len(result.stored_signal_ids)}")
    print(f"archived this run: {len(result.archived_ids)}")
    print(f"alerts (single-day spikes, for humans): {len(result.alerts)}")
    print(f"dark sources: {list(result.dark_sources) or 'none'}")
    print(f"coverage gaps (stated, not implied): {gaps or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
