"""The orchestrator spine (Phase 3): fetch → group → z → detect → assemble → store → coverage.

One call = one scan over injected fetchers — **no network code lives here** (live fetchers arrive
in Phase 7 behind the same ``RawVolumeFetch`` port; this module must never import an HTTP layer).

The measurement rules this spine owns:

* **Gaps stay gaps.** Observations group into per-``(term, source)`` series by unwrapping
  ``Provenanced.value``; an unobserved day is an absent key, never 0/None (``test_no_imputation``
  semantics). Volumes are **never arithmetically combined across sources** — every series stays
  per ``(term, source)`` end-to-end; corroboration is a *count of sources*, never a merged series.

* **Signal platform = the source's mapped platform** (`SOURCE_PLATFORM`), never the tracked
  term's aspirational bucket — an open-web-proxy detection of a tiktok-bucketed term mints an
  ``open_web`` signal, so the blind platforms stay *stated* coverage gaps rather than being
  fabricated into covered ones (plan N5; ADR-0004's coverage trap). Sources mapping to the same
  platform merge into **one signal per identity** with the primary series driving the stage
  (Phase 2 R2b); ``distinct_sources`` counts every candidate-producing source for the term across
  platforms (ADR-0004 §2 — corroboration is "a second independent source", not "a second source
  in the same bucket").

* **First-seen wins.** Each identity's ``first_seen`` resolves against the ``IdentityIndex``
  (live signal → reuse; else the candidate's ``start_day``, recorded thereafter), which is what
  keeps ids stable when a source revises its window.

* **Darkness is surfaced, never papered over.** A source that raises ``AdapterDark`` is excluded
  from ``live_sources_by_platform`` for the whole run; the coverage report then states the gap.
  A single-day spike is a ``SpikeAlert`` for a human, never a stored signal.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from c1_pattern_engine.adapters.base import (
    AdapterDark,
    DateRange,
    RawVolumeFetch,
    TrendObservation,
)
from c1_pattern_engine.adapters.sources import all_adapters
from c1_pattern_engine.detector.archive import TrendSignalStore
from c1_pattern_engine.detector.assemble import assemble_signal, select_primary_series
from c1_pattern_engine.detector.coverage import PlatformCoverage, coverage_report
from c1_pattern_engine.detector.detect import (
    BASELINE_DAYS,
    SpikeAlert,
    detect_candidates,
    z_series,
)
from c1_pattern_engine.detector.identity import IdentityIndex, SignalIdentity
from c1_pattern_engine.detector.lifecycle import days_remaining, days_remaining_adjusted
from c1_pattern_engine.detector.signals import TrendSignal
from c1_pattern_engine.detector.store_durable import ResolutionOrigin, ResolvedSampleBook
from c1_pattern_engine.detector.tenants import TenantBrief
from c1_pattern_engine.detector.verdict import TrendVerdict, VerdictLedger, compute_verdict
from c1_pattern_engine.registry.terms import TrackedTerm

if TYPE_CHECKING:  # layering: `submissions` depends on `detector`, never the reverse at import time
    from c1_pattern_engine.submissions.submit import SubmissionBook

__all__ = [
    "DEFAULT_TRACKED_PLATFORMS",
    "SCAN_WINDOW_DAYS",
    "SOURCE_PLATFORM",
    "ScanResult",
    "TermAlert",
    "group_observations",
    "run_scan",
]

# Which platform each keyless source counts as live evidence for (Phase 3 R5, pinned).
# The four open-web proxies are cross-platform aggregates: they prove the open web is observed,
# never that a closed platform is. tiktok_creative_center is deliberately absent — it is a
# human-in-the-loop surface (ADR-0001/0004) and must never gain an automated fetcher.
SOURCE_PLATFORM: dict[str, str] = {
    "google_trends": "open_web",
    "reddit": "reddit",
    "youtube_trending": "youtube",
    "wikipedia_pageviews": "open_web",
    "hacker_news": "open_web",
    "rss_news": "open_web",
}

# The default coverage rows. MUST include the blind platforms (tiktok, instagram_reels — no
# automated source exists for either) so a default run states its blindness instead of silently
# reporting only the open web (Phase 3 R5 / Phase 5 R5; ADR-0004 §Consequences).
DEFAULT_TRACKED_PLATFORMS: tuple[str, ...] = (
    "tiktok",
    "instagram_reels",
    "reddit",
    "youtube",
    "open_web",
)

# Active detection window fetched on top of the trailing baseline. Two weeks: the manager
# lead-time signal ADR-0004 values is "one to two weeks before a volume spike", so a nightly scan
# that can catch a run begun any time in the last fortnight (and re-confirm current runs) covers
# the horizon that matters. Total span per fetch = BASELINE_DAYS + SCAN_WINDOW_DAYS.
SCAN_WINDOW_DAYS = 14


@dataclass(frozen=True, slots=True)
class TermAlert:
    """A single-day spike, term- and source-tagged, surfaced to a human — never stored."""

    term: str
    source: str
    alert: SpikeAlert


@dataclass(frozen=True, slots=True)
class ScanResult:
    as_of: datetime
    stored_signal_ids: tuple[UUID, ...]
    archived_ids: tuple[UUID, ...]
    alerts: tuple[TermAlert, ...]
    dark_sources: tuple[str, ...]
    primary_source_by_signal: dict[UUID, str] = field(default_factory=dict)
    coverage: tuple[PlatformCoverage, ...] = ()
    verdicts: tuple[TrendVerdict, ...] = ()


def _resolution_origin(signal: TrendSignal) -> ResolutionOrigin:
    """Which resolution-sample pool a signal's duration belongs to (Phase 9 R3, closing the Phase 4
    R3 / Phase 6 deferral): a ``human_sourced`` (submission-born) signal resolves into the ``human``
    pool, an ``automated`` one into ``automated`` — two measurement bases, never mixed, and a
    signal's ``days_remaining`` draws only on its own pool."""
    return "human" if signal.detection_origin == "human_sourced" else "automated"


def group_observations(
    observations: list[TrendObservation],
) -> dict[tuple[str, str], dict[date, float]]:
    """Group observations into per-``(term, source)`` series, unwrapping ``Provenanced.value``.

    A gap stays a gap: only observed days become keys; nothing is imputed, averaged, or merged
    across sources.
    """
    series: dict[tuple[str, str], dict[date, float]] = {}
    for obs in observations:
        series.setdefault((obs.term, obs.source), {})[obs.day] = obs.volume.value
    return series


def run_scan(
    *,
    terms: list[TrackedTerm],
    fetchers: dict[str, RawVolumeFetch],
    as_of: datetime,
    store: TrendSignalStore,
    identity_index: IdentityIndex,
    tracked_platforms: tuple[str, ...] = DEFAULT_TRACKED_PLATFORMS,
    samples: ResolvedSampleBook | None = None,
    tenants: list[TenantBrief] | None = None,
    ledger: VerdictLedger | None = None,
    book: SubmissionBook | None = None,
) -> ScanResult:
    """Run one scan. Pure orchestration over injected fetchers; fail-closed throughout."""
    if as_of.tzinfo is None:
        raise ValueError(
            "as_of must be timezone-aware (UTC): a naive datetime makes the logical scan day "
            "and the first_detected_at anchor ambiguous (Phase 4 R2)."
        )

    # Refuse-before-fetch: a fetcher with no SOURCE_PLATFORM mapping is a caller error, and for
    # tiktok_creative_center specifically it is a forbidden crawl of a human-in-the-loop surface
    # (ADR-0001/ADR-0004; ADR-0009 invariant 6). Raising here — before archive_due or any fetch —
    # leaves no partial state and no forbidden network call.
    unmapped = set(fetchers) - set(SOURCE_PLATFORM)
    if unmapped:
        raise ValueError(
            "Fetchers with no source→platform mapping refused before any fetch: "
            f"{sorted(unmapped)}. tiktok_creative_center is human-in-the-loop and must never "
            "gain an automated fetcher (ADR-0001, ADR-0004, ADR-0009 invariant 6)."
        )

    scan_day = as_of.date()
    span = DateRange(
        start=scan_day - timedelta(days=BASELINE_DAYS + SCAN_WINDOW_DAYS - 1),
        end=scan_day,
    )

    # Maintenance first: a signal whose validity window elapsed archives now, so first-seen reuse
    # below checks liveness honestly (an archived identity resurging is a new episode).
    archived_ids = tuple(store.archive_due(as_of))

    # A resolution sample closes at archive (Phase 4 R3). Duration = first_seen → closing date,
    # per platform, origin "automated"; the book itself enforces public-scope-only and dedupe.
    # A trend's close also resolves its open verdicts (Phase 6 R2): survived iff the signal
    # stayed non-declining ≥ the issuance's lead_time_days. Archive closes at valid_to.
    if ledger is not None:
        for archived_id in archived_ids:
            ledger.resolve_trend(archived_id, closed_on=store.get(archived_id).valid_to)

    if samples is not None:
        for archived_id in archived_ids:
            looked_up = identity_index.by_signal_id(archived_id)
            if looked_up is None:
                continue
            ident, rec = looked_up
            archived_signal = store.get(archived_id)
            if archived_signal.detection_origin == "human_sourced":
                # CENSORED, not observed — never a resolution sample. A born signal that was never
                # re-detected has a valid_to that never moved, so (valid_to - first_seen) is exactly
                # the horizon CONSTANT (21 or 7): a pool of identical constants has MAD = 0 and
                # would publish a ZERO-WIDTH days-remaining interval on a pure presumption. One that
                # automation DID later pick up has a moved valid_to and a genuine upper bound — but
                # we cannot tell the two apart here, so we censor both (conservative). The human
                # pool is fed solely by the observed-decline path below.
                # Do NOT add a human-resolver-observed close here: that is a THIRD basis (human
                # start, human end) and needs its own pool — see ResolvedSampleBook.
                continue
            # Close at the signal's own valid_to, not tonight's scan_day: a missed cron (or a
            # long-dark source) must not inflate the recorded lifetime by the outage length.
            # valid_to embeds the presumption horizon, so archive-closed samples are deliberate
            # upper bounds — the lesser distortion (plan phase-4 R3).
            samples.record(
                archived_id,
                platform=ident.platform,
                # Defensive only — the censoring `continue` above means this can no longer return
                # "human". This is NOT an inlet to the human pool: that pool is fed exclusively by
                # an observed DECLINE (below), never by aging out.
                origin=_resolution_origin(archived_signal),
                scope=ident.scope,
                duration_days=(archived_signal.valid_to - rec.first_seen).days,
            )

    adapters = all_adapters(fetchers, as_of=as_of)
    dark: set[str] = set()
    observations: list[TrendObservation] = []
    for source_name, adapter in adapters.items():
        for term in terms:
            if source_name in dark:
                break
            try:
                observations.extend(adapter.observe(term.term, span))
            except AdapterDark:
                dark.add(source_name)

    # A source that went dark is excluded for the whole run: observations it delivered for
    # earlier terms are dropped too, so a partially-read source can't mint signals that then
    # read as coverage. Conservative direction — fewer signals, stated gap.
    if dark:
        observations = [o for o in observations if o.source not in dark]

    series = group_observations(observations)

    # Detect per (term, source) series — never on a merged one.
    candidates_by_term: dict[str, dict[str, tuple]] = {}
    alerts: list[TermAlert] = []
    for (term_text, source_name), volumes in series.items():
        result = detect_candidates(z_series(volumes))
        for alert in result.alerts:
            alerts.append(TermAlert(term=term_text, source=source_name, alert=alert))
        if result.candidates:
            # The latest run per series is the current candidate for this scan.
            candidates_by_term.setdefault(term_text, {})[source_name] = result.candidates[-1]

    stored: list[UUID] = []
    primary_by_signal: dict[UUID, str] = {}
    terms_by_text = {t.term: t for t in terms}
    for term_text, by_source in candidates_by_term.items():
        term = terms_by_text[term_text]
        distinct_sources = len(by_source)  # computed from candidate-producing sources, not passed

        # One signal per (platform-mapped) identity: sources mapping to the same platform merge.
        by_platform: dict[str, dict[str, tuple]] = {}
        for source_name, candidate in by_source.items():
            by_platform.setdefault(SOURCE_PLATFORM[source_name], {})[source_name] = candidate

        for platform, platform_sources in by_platform.items():
            primary_source, primary_volumes = select_primary_series(
                {s: series[(term_text, s)] for s in platform_sources}
            )
            candidate = platform_sources[primary_source]
            identity = SignalIdentity(
                scope="public",
                tenant_id=None,
                platform=platform,
                vertical=term.vertical,
                term=term_text,
            )

            record = identity_index.get(identity)
            first_seen = candidate.start_day
            new_episode = True
            if record is not None:
                try:
                    existing = store.get(record.signal_id)
                except KeyError:
                    existing = None  # index ahead of a rebuilt/partial store → new episode
                if existing is not None and not existing.is_archived:
                    first_seen = record.first_seen  # persisted identity wins over revised windows
                    new_episode = False

            signal = assemble_signal(
                candidate,
                term=term_text,
                platform=platform,
                vertical=term.vertical,
                kind=term.kind,  # type: ignore[arg-type]
                distinct_sources=distinct_sources,
                volumes=primary_volumes,
                as_of=scan_day,
                first_seen=first_seen,
            )
            # Resurrection guard: if the minted id collides with an *archived* signal (the
            # candidate's recomputed start_day landed exactly on the dead episode's first_seen),
            # skip it — archived history is immutable; the episode resumes only when the window
            # moves. Conservative direction: fewer signals.
            try:
                prior = store.get(signal.id)
            except KeyError:
                prior = None
            if prior is not None and prior.is_archived:
                continue

            store.add(signal, observed_at=scan_day)
            identity_index.record(
                identity,
                first_seen=first_seen,
                signal_id=signal.id,
                # The AUTOMATED-detection event anchor: the injected as_of's logical-day start in
                # UTC — never wall-clock (Phase 4 R2). Set on a NEW episode, and also on the first
                # automated detection of an identity that has no anchor yet (a Phase 9
                # submission-born signal records None, because no automation had detected it) —
                # otherwise that identity would never acquire an automated anchor and the
                # confidence-upgrade gate could never fire for it. Once set it is immutable:
                # passing None on a re-detection lets the index keep the original.
                first_detected_at=(
                    datetime.combine(scan_day, time(0), tzinfo=UTC)
                    if (new_episode or (record is not None and record.first_detected_at is None))
                    else None
                ),
            )
            stored.append(signal.id)
            primary_by_signal[signal.id] = primary_source

            # First-declining scan also closes the resolution sample (Phase 4 R3) — the book
            # dedupes, so a declining-then-archived signal resolves exactly once.
            if signal.lifecycle_stage == "declining":
                if samples is not None:
                    samples.record(
                        signal.id,
                        platform=identity.platform,
                        # Resolve origin from the STORED signal, never this locally assembled one:
                        # `assemble_signal` never sets detection_origin, so the local object always
                        # carries the "automated" default, while the store preserves the BIRTH
                        # origin (archive.py). A submission-born signal that automation later
                        # detects and sees decline would otherwise drop a human-basis lifetime
                        # (measured from the human's first sighting) into the AUTOMATED pool — the
                        # pool that actually reaches MIN_RESOLUTIONS and publishes a median/MAD —
                        # systematically inflating it and loosening the `go` lead-time guard.
                        origin=_resolution_origin(store.get(signal.id)),
                        scope=identity.scope,
                        duration_days=(scan_day - first_seen).days,
                    )
                if ledger is not None:
                    ledger.resolve_trend(signal.id, closed_on=scan_day)

    # Submission→signal merge (Phase 9): a resolved submission that predated automated detection
    # upgrades that signal's confidence to human_corroborated; one on a platform with no automated
    # series mints a public, human_sourced born signal (stage = the independent resolver's
    # observed_class). Runs BEFORE verdict rendering + coverage so a born signal gets a verdict and
    # counts in coverage. Registry-side term admission is the run.py caller's job (kept off the
    # spine, like the Phase 8 coupling).
    if book is not None:
        # Imported at call time, not module scope: `submissions` depends on `detector`, so a
        # module-scope import here would close an import cycle (detector/__init__ → run_scan →
        # submissions.merge → detector.archive) and make `submissions.merge` unimportable on its
        # own. The control flow spine→merge is intended; the *import* direction stays one-way.
        from c1_pattern_engine.submissions.merge import merge_resolutions

        merge_resolutions(book, store=store, identity_index=identity_index, as_of=as_of)

    # Per-tenant verdict rendering (Phase 6). The cross-product is public signals x tenants plus
    # each tenant's OWN internal signals only — store.feed(for_tenant=...) is exactly that set
    # (repository-layer tenancy, Phase 4 R1), so tenant B never renders against A's internal
    # signal. Optional: a scan with no tenant config still produces signals + coverage (R5).
    verdicts: list[TrendVerdict] = []
    for brief in tenants or []:
        for signal in store.feed(for_tenant=brief.tenant_id):
            stage = signal.lifecycle_stage
            if stage not in ("rising", "peak", "declining"):
                continue
            looked_up = identity_index.by_signal_id(signal.id)
            # Origin-matched pool (Phase 4 R3, closed in Phase 9 R3): a human_sourced signal draws
            # only on the human resolution pool, an automated one only on automated — never serve
            # automated lifetimes to a submission-born signal.
            pool = (
                samples.samples(signal.platform, _resolution_origin(signal))
                if samples is not None
                else []
            )
            if looked_up is None:
                # Unknown age → never serve a numeric window; band from stage only (fail closed).
                dr = days_remaining(stage, [])
            else:
                _, rec = looked_up
                dr = days_remaining_adjusted(
                    stage, pool, age_days=float((scan_day - rec.first_seen).days)
                )
            verdict = compute_verdict(
                trend_id=signal.id,
                tenant_id=brief.tenant_id,
                stage=stage,
                band=dr.band,
                days_remaining_est=dr.est,
                lead_time_days=brief.lead_time_days,
                brand_fit=brief.brand_fit,
                risk_flag=brief.risk_flag,
            )
            verdicts.append(verdict)
            if ledger is not None:
                ledger.issue(
                    verdict,
                    issued_on=scan_day,
                    lead_time_days=brief.lead_time_days,
                    signal_scope=signal.scope,
                )

    live_sources_by_platform: dict[str, tuple[str, ...]] = {}
    for source_name in adapters:
        if source_name in dark or source_name not in SOURCE_PLATFORM:
            continue
        platform = SOURCE_PLATFORM[source_name]
        live_sources_by_platform[platform] = (
            *live_sources_by_platform.get(platform, ()),
            source_name,
        )

    open_by_platform: dict[str, int] | None = None
    if book is not None:
        # Call-time import — see the merge_resolutions call above for why.
        from c1_pattern_engine.submissions.merge import open_submissions_by_platform

        open_by_platform = open_submissions_by_platform(book)

    coverage = coverage_report(
        tracked_platforms,
        signals=store.feed(),
        live_sources_by_platform=live_sources_by_platform,
        # A platform can be covered by an open human submission even with no signal and no live
        # source — surface that so its silence isn't read as "nothing happening" (Phase 9 R3).
        open_submissions_by_platform=open_by_platform,
    )

    return ScanResult(
        as_of=as_of,
        stored_signal_ids=tuple(stored),
        archived_ids=archived_ids,
        alerts=tuple(alerts),
        dark_sources=tuple(sorted(dark)),
        primary_source_by_signal=primary_by_signal,
        coverage=tuple(coverage),
        verdicts=tuple(verdicts),
    )
