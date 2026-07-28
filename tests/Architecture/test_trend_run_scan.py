"""Phase 3 — the orchestrator spine (`run_scan`) on fake fetchers. No network anywhere.

Locks: grouping preserves gaps (R2), per-identity merge + cross-source corroboration counting
(R3), alerts surfaced not stored (R4), dark-source coverage honesty incl. the pinned blind
platforms and the source→platform map (R5), and double-run / shifted-window idempotency (R6).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from c1_pattern_engine.adapters.base import DateRange
from c1_pattern_engine.detector import (
    DEFAULT_TRACKED_PLATFORMS,
    IdentityIndex,
    TrendSignalStore,
    group_observations,
    run_scan,
)
from c1_pattern_engine.registry import AdmissionOrigin, TrackedTerm

AS_OF = datetime(2026, 7, 16, tzinfo=UTC)
NOW = AS_OF


def term(text: str = "glass skin", platform: str = "tiktok") -> TrackedTerm:
    return TrackedTerm(
        term=text,
        vertical="beauty",
        platform=platform,
        origin=AdmissionOrigin.SCHEDULED_SCAN,
        admitted_at=NOW,
        last_activity_at=NOW,
        kind="topic",
    )


def fake_fetch(tail: list[float] | None = None, *, gap_stride: int | None = None):
    """A deterministic fake: alternating 9/11 baseline (nonzero MAD), optional spike tail.

    ``gap_stride=n`` drops every n-th day — gaps that must stay gaps.
    """

    def fetch(_term: str, span: DateRange) -> dict[date, float]:
        days = list(span.days())
        vols: dict[date, float] = {}
        for i, d in enumerate(days):
            if gap_stride and i % gap_stride == 0:
                continue
            vols[d] = 9.0 if i % 2 == 0 else 11.0
        if tail:
            for j, v in enumerate(tail):
                vols[days[len(days) - len(tail) + j]] = v
        return vols

    return fetch


def dark_fetch(_term: str, _span: DateRange) -> dict[date, float]:
    raise RuntimeError("transport exploded")


def scan(terms=None, fetchers=None, *, store=None, index=None, as_of=AS_OF, platforms=None):
    return run_scan(
        terms=terms if terms is not None else [term()],
        fetchers=fetchers if fetchers is not None else {"reddit": fake_fetch([30.0, 30.0])},
        as_of=as_of,
        store=store if store is not None else TrendSignalStore(),
        identity_index=index if index is not None else IdentityIndex(),
        tracked_platforms=platforms or DEFAULT_TRACKED_PLATFORMS,
    )


# --- R2: grouping preserves gaps ----------------------------------------------------------------


def test_group_observations_gaps_stay_gaps():
    from c1_pattern_engine.adapters.sources import all_adapters

    adapters = all_adapters({"reddit": fake_fetch(gap_stride=5)}, as_of=AS_OF)
    span = DateRange(start=AS_OF.date() - timedelta(days=41), end=AS_OF.date())
    obs = adapters["reddit"].observe("glass skin", span)
    series = group_observations(obs)
    volumes = series[("glass skin", "reddit")]
    assert len(volumes) < 42  # dropped days are absent keys
    assert all(v in (9.0, 11.0) for v in volumes.values())  # nothing imputed


# --- R1/R3: happy path, merge, corroboration ----------------------------------------------------


def test_single_source_yields_single_source_signal_on_mapped_platform():
    store = TrendSignalStore()
    result = scan(store=store)
    assert len(result.stored_signal_ids) == 1
    sig = store.get(result.stored_signal_ids[0])
    assert sig.platform == "reddit"  # the source-mapped platform, not the term's tiktok bucket
    assert sig.confidence == "single_source"
    assert sig.kind == "topic"


def test_same_platform_sources_merge_into_one_corroborated_signal():
    store = TrendSignalStore()
    result = scan(
        store=store,
        fetchers={
            "hacker_news": fake_fetch([30.0, 30.0]),
            "rss_news": fake_fetch([30.0, 30.0], gap_stride=7),
        },
    )
    assert len(result.stored_signal_ids) == 1  # one identity on open_web, not two signals
    sig = store.get(result.stored_signal_ids[0])
    assert sig.platform == "open_web"
    assert sig.confidence == "corroborated"
    # Primary series = most observed days (hacker_news is gapless), logged per run.
    assert result.primary_source_by_signal[sig.id] == "hacker_news"


def test_cross_platform_corroboration_counts_sources_but_keeps_identities():
    store = TrendSignalStore()
    result = scan(
        store=store,
        fetchers={
            "reddit": fake_fetch([30.0, 30.0]),
            "google_trends": fake_fetch([30.0, 30.0]),
        },
    )
    platforms = {store.get(i).platform for i in result.stored_signal_ids}
    assert platforms == {"reddit", "open_web"}  # identities never merge across platforms
    # ADR-0004 §2: corroboration is "a second independent source" — both signals are corroborated.
    assert all(store.get(i).confidence == "corroborated" for i in result.stored_signal_ids)


# --- R4: alerts surfaced, never stored ----------------------------------------------------------


def test_single_day_spike_is_alert_not_signal():
    store = TrendSignalStore()
    result = scan(store=store, fetchers={"reddit": fake_fetch([60.0])})
    assert result.stored_signal_ids == ()
    assert store.feed() == []
    assert any(a.term == "glass skin" and a.source == "reddit" for a in result.alerts)


# --- R5: dark sources + pinned coverage honesty -------------------------------------------------


def test_dark_source_excluded_and_coverage_gap_stated():
    result = scan(fetchers={"reddit": dark_fetch})
    assert result.dark_sources == ("reddit",)
    rows = {c.platform: c for c in result.coverage}
    assert rows["reddit"].coverage_gap is True
    assert rows["reddit"].live_sources == ()


def test_source_dark_mid_run_drops_its_earlier_observations():
    """A source that dies on term B must not mint signals from term A's half-read data.

    Deleting the dark-source observation drop in run_scan would flip this platform's
    coverage_gap to False with zero live sources — ADR-0004's coverage-fabrication trap.
    """
    calls = {"n": 0}
    good = fake_fetch([30.0, 30.0])

    def dies_on_second_term(term_text: str, span: DateRange) -> dict[date, float]:
        calls["n"] += 1
        if calls["n"] > 1:
            raise RuntimeError("rate limited")
        return good(term_text, span)

    store = TrendSignalStore()
    result = scan(
        terms=[term("glass skin"), term("dopamine decor")],
        store=store,
        fetchers={"reddit": dies_on_second_term},
    )
    assert result.dark_sources == ("reddit",)
    assert result.stored_signal_ids == ()  # term A's half-read data minted nothing
    rows = {c.platform: c for c in result.coverage}
    assert rows["reddit"].coverage_gap is True


def test_index_record_missing_from_store_is_new_episode_not_crash():
    """A durable index meeting a rebuilt/partial store must fail closed, not KeyError."""
    from uuid import uuid4

    from c1_pattern_engine.detector import SignalIdentity

    store, index = TrendSignalStore(), IdentityIndex()
    index.record(
        SignalIdentity(
            scope="public", tenant_id=None, platform="reddit", vertical="beauty", term="glass skin"
        ),
        first_seen=AS_OF.date() - timedelta(days=40),
        signal_id=uuid4(),  # not in the store
    )
    result = scan(store=store, index=index)
    assert len(result.stored_signal_ids) == 1  # scan completed; new episode minted


def test_default_run_states_blind_platform_gaps():
    result = scan()  # reddit live, signal stored — tiktok/reels still blind
    rows = {c.platform: c for c in result.coverage}
    assert rows["tiktok"].coverage_gap is True
    assert rows["instagram_reels"].coverage_gap is True
    assert "gap in observation" in rows["tiktok"].note


def test_open_web_proxy_never_fabricates_closed_platform_coverage():
    store = TrendSignalStore()
    result = scan(store=store, fetchers={"google_trends": fake_fetch([30.0, 30.0])})
    sig = store.get(result.stored_signal_ids[0])
    assert sig.platform == "open_web"  # tiktok-bucketed term, but the signal is open-web
    rows = {c.platform: c for c in result.coverage}
    assert rows["tiktok"].coverage_gap is True  # tiktok stays a stated gap


# --- R5: the pinned map + refuse-before-fetch ---------------------------------------------------


def test_source_platform_map_is_pinned():
    from c1_pattern_engine.adapters.sources import SOURCE_NAMES
    from c1_pattern_engine.detector import SOURCE_PLATFORM

    # Every automatable source is mapped; tiktok_creative_center is deliberately NOT — it is a
    # human-in-the-loop surface (ADR-0001/0004) and its absence is the load-bearing pin.
    assert set(SOURCE_PLATFORM) == set(SOURCE_NAMES) - {"tiktok_creative_center"}
    assert "tiktok_creative_center" not in SOURCE_PLATFORM
    for proxy in ("google_trends", "wikipedia_pageviews", "hacker_news", "rss_news"):
        assert SOURCE_PLATFORM[proxy] == "open_web"
    assert SOURCE_PLATFORM["reddit"] == "reddit"
    assert SOURCE_PLATFORM["youtube_trending"] == "youtube"


def test_unmapped_fetcher_refused_before_any_fetch():
    import pytest

    calls: list[str] = []

    def recording_fetch(term: str, span: DateRange) -> dict[date, float]:
        calls.append(term)
        return {}

    store = TrendSignalStore()
    with pytest.raises(ValueError, match="human-in-the-loop"):
        scan(store=store, fetchers={"tiktok_creative_center": recording_fetch})
    assert calls == []  # the forbidden surface was never fetched
    assert store.query() == []  # and no partial state was written


def test_no_cross_source_summation_in_spine():
    """Series stay per (term, source) through grouping — never merged, summed, or overwritten.

    Structural lock (the organic+boosted analogue). A threshold-based version cannot work: for
    in-phase identical series the summed robust z is a mediant of the component z's and can never
    exceed the larger one, so "each below 3, sum above 3" is unsatisfiable. This form breaks
    directly under a by-term merge: both source keys must exist, each carrying its own unmixed
    value on the same day (12.0, never 24.0).
    """
    from c1_pattern_engine.adapters.sources import all_adapters

    adapters = all_adapters(
        {"hacker_news": fake_fetch([12.0, 12.0]), "rss_news": fake_fetch([12.0, 12.0])},
        as_of=AS_OF,
    )
    span = DateRange(start=AS_OF.date() - timedelta(days=41), end=AS_OF.date())
    obs = []
    for adapter in adapters.values():
        obs.extend(adapter.observe("glass skin", span))
    series = group_observations(obs)

    assert ("glass skin", "hacker_news") in series
    assert ("glass skin", "rss_news") in series
    hn = series[("glass skin", "hacker_news")]
    rss = series[("glass skin", "rss_news")]
    assert hn[AS_OF.date()] == 12.0
    assert rss[AS_OF.date()] == 12.0  # unmixed — a sum would read 24.0
    assert hn == rss and hn is not rss  # two separate series objects, never one merged mapping


# --- R6: idempotency ----------------------------------------------------------------------------


def test_double_run_same_as_of_no_duplicates():
    store, index = TrendSignalStore(), IdentityIndex()
    first = scan(store=store, index=index)
    second = scan(store=store, index=index)
    assert first.stored_signal_ids == second.stored_signal_ids
    assert len(store.feed()) == 1


def test_shifted_window_next_night_keeps_the_signal_id():
    """The source revises its window overnight; the persisted first_seen wins — no re-mint."""
    store, index = TrendSignalStore(), IdentityIndex()
    first = scan(store=store, index=index)
    next_night = scan(store=store, index=index, as_of=AS_OF + timedelta(days=1))
    assert next_night.stored_signal_ids == first.stored_signal_ids
    assert len(store.feed()) == 1


def test_archived_identity_resurging_mints_new_episode():
    store, index = TrendSignalStore(), IdentityIndex()
    first = scan(store=store, index=index)
    # 30 days later: valid_to (as_of+21 for rising) elapsed with no refresh → archived, and the
    # same identity trending again is a new episode with a new id.
    later = scan(store=store, index=index, as_of=AS_OF + timedelta(days=30))
    assert first.stored_signal_ids[0] in later.archived_ids
    assert later.stored_signal_ids != first.stored_signal_ids
    assert store.get(first.stored_signal_ids[0]).is_archived


# --- no network in the spine --------------------------------------------------------------------


def test_spine_imports_no_network_layer():
    import importlib
    from pathlib import Path

    spine = importlib.import_module("c1_pattern_engine.detector.run_scan")
    source = Path(spine.__file__).read_text(encoding="utf-8")
    for banned in ("urllib", "httpx", "requests", "aiohttp", "socket"):
        assert banned not in source
