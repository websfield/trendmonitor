"""Phase 7 — live fetch adapters, the trend-path allowlist, and the hardened HTTP client.

Every test is network-free (injected openers). Locks: host-pinned deny-by-default allowlist with
structural disjointness from the exemplar-media rights schema (R4), transport hardening —
redirects refused, size cap, bounded retry, rate pacing, https-only (R3), request/response
hygiene — strict term encoding, DTD refusal, no-fetch-from-response-body (R5), Proxy provenance
on the live shape (R2), and the swap behind the unchanged port (R7). TikTok Creative Center has
no fetcher and no allowlist entry, ever (R1).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from c1_pattern_engine.adapters.allowlist import (
    TrendAllowlist,
    TrendSource,
    TrendSourceNotAllowlistedError,
    load_trend_allowlist,
)
from c1_pattern_engine.adapters.base import DateRange, build_adapter
from c1_pattern_engine.adapters.fetchers import build_live_fetchers
from c1_pattern_engine.adapters.http import (
    MAX_RESPONSE_BYTES,
    FetchFailed,
    KeylessHttpClient,
)
from c1_pattern_engine.adapters.sources import SOURCE_NAMES

REPO = Path(__file__).resolve().parents[2]
REAL_CONFIG = REPO / "config" / "source-allowlist.yaml"

AS_OF = datetime(2026, 3, 2, tzinfo=UTC)
SPAN = DateRange(start=AS_OF.date() - timedelta(days=41), end=AS_OF.date())


def allowlist():
    return load_trend_allowlist(REAL_CONFIG)


def client_with(opener, **kw):
    return KeylessHttpClient(
        allowlist=allowlist(),
        opener=opener,
        sleeper=kw.get("sleeper", lambda s: None),
        clock=kw.get("clock", lambda: 0.0),
    )


# --- R4: the allowlist -----------------------------------------------------------------------


def test_allowlist_is_structurally_disjoint_and_pins_hosts():
    al = allowlist()
    assert {s.name for s in al.sources} == set(SOURCE_NAMES) - {"tiktok_creative_center"}
    for s in al.sources:
        assert s.url_template.startswith("https://")
    with pytest.raises(TrendSourceNotAllowlistedError):
        al.require("tiktok_creative_center")  # deny-by-default; deliberately absent


def test_trend_host_grants_no_exemplar_media_rights():
    """The structural-disjointness proof against the REAL reconciled file: a trend host must be
    refused by extraction.acquire for exemplar acquisition (the D5 legal gate stays closed)."""
    from extraction.acquire import SourceNotAllowlistedError, load_allowlist

    media_allowlist = load_allowlist(REAL_CONFIG)
    assert media_allowlist.entry_for("wikimedia.org") is None  # trend hosts never enter sources:

    from extraction.acquire import SourceKind, acquire

    with pytest.raises(SourceNotAllowlistedError):
        acquire(
            "https://wikimedia.org/some/exemplar.mp4",
            SourceKind.EXEMPLAR,
            allowlist=media_allowlist,
            downloader=None,
            blob_store=None,
        )


def test_template_host_mismatch_refused_at_load():
    with pytest.raises(ValueError, match="does not match the pinned host"):
        TrendSource(name="x", host="a.example", url_template="https://b.example/{term}")
    with pytest.raises(ValueError, match="https"):
        TrendSource(name="x", host="a.example", url_template="http://a.example/{term}")


def test_final_url_host_check_before_request():
    calls = []

    def opener(url, timeout):
        calls.append(url)
        return 200, b"{}"

    c = client_with(opener)
    with pytest.raises(TrendSourceNotAllowlistedError):
        c.get("hacker_news", "https://evil.example/api")
    assert calls == []  # refused BEFORE any request


# --- R3: transport hardening -------------------------------------------------------------------


def test_redirects_are_refused_not_followed():
    import urllib.request

    from c1_pattern_engine.adapters.http import _NoRedirect

    handler = _NoRedirect()
    with pytest.raises(FetchFailed, match="redirect refused"):
        handler.redirect_request(
            urllib.request.Request("https://hn.algolia.com/x"),
            None,
            301,
            "Moved",
            {},
            "https://evil.example/",
        )


def test_response_size_cap():
    def opener(url, timeout):
        return 200, b"x" * (MAX_RESPONSE_BYTES + 1)

    with pytest.raises(FetchFailed, match="cap"):
        client_with(opener).get("hacker_news", "https://hn.algolia.com/api/v1/x")


def test_bounded_retry_with_backoff_then_dark():
    import urllib.error

    attempts, sleeps = [], []

    def opener(url, timeout):
        attempts.append(url)
        raise urllib.error.URLError("connection reset")

    c = client_with(opener, sleeper=sleeps.append)
    with pytest.raises(FetchFailed, match="after 3 attempts"):
        c.get("hacker_news", "https://hn.algolia.com/api/v1/x")
    assert len(attempts) == 3  # bounded, never unbounded
    assert sleeps == [1.5, 3.0]  # exponential backoff between attempts


def test_client_4xx_never_retries():
    import urllib.error

    attempts = []

    def opener(url, timeout):
        attempts.append(url)
        raise urllib.error.HTTPError(url, 404, "nope", {}, None)

    with pytest.raises(FetchFailed, match="404"):
        client_with(opener).get("hacker_news", "https://hn.algolia.com/api/v1/x")
    assert len(attempts) == 1


def test_per_host_rate_pacing():
    sleeps = []
    tick = {"t": 0.0}

    def clock():
        return tick["t"]

    def opener(url, timeout):
        return 200, b"{}"

    c = client_with(opener, sleeper=sleeps.append, clock=clock)
    c.get("hacker_news", "https://hn.algolia.com/api/v1/a")
    tick["t"] = 0.2  # only 0.2s later
    c.get("hacker_news", "https://hn.algolia.com/api/v1/b")
    assert sleeps and sleeps[0] == pytest.approx(0.8)  # paced up to the 1s/host floor


# --- R5: request hygiene — hostile terms --------------------------------------------------------


@pytest.mark.parametrize(
    "hostile",
    ["../../etc/passwd", "https://evil.example/x", "a\r\nHost: evil.example", "a?x=1&y=2#f"],
)
def test_hostile_terms_stay_in_their_slot(hostile):
    urls = []

    def opener(url, timeout):
        urls.append(url)
        return 200, b'{"hits": [], "items": []}'

    fetchers = build_live_fetchers(allowlist(), client_with(opener))
    fetchers["hacker_news"](hostile, SPAN)
    assert len(urls) == 1
    url = urls[0]
    assert url.startswith("https://hn.algolia.com/api/v1/search_by_date?query=")
    # Strict encoding: no raw /, :, ?, #, &, CR or LF from the term survives into the URL.
    from urllib.parse import quote

    assert quote(hostile, safe="") in url
    assert "evil.example" not in url.replace(quote(hostile, safe=""), "")


# --- R5: response hygiene ------------------------------------------------------------------------


def test_dtd_payload_refused_not_parsed():
    bomb = (
        b'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]>'
        b"<rss><channel><item><pubDate>Mon, 02 Mar 2026 00:00:00 +0000</pubDate>"
        b"</item></channel></rss>"
    )

    def opener(url, timeout):
        return 200, bomb

    from c1_pattern_engine.adapters.fetchers import PayloadRejected

    fetchers = build_live_fetchers(allowlist(), client_with(opener))
    with pytest.raises(PayloadRejected, match="DTD"):
        fetchers["reddit"]("glass skin", SPAN)


def test_no_url_from_a_response_body_is_ever_fetched():
    """A feed full of links must cause exactly ONE request — the template URL, nothing more."""
    feed = (
        b'<?xml version="1.0"?><rss><channel>'
        b"<item><link>https://evil.example/follow-me</link>"
        b"<pubDate>Mon, 02 Mar 2026 00:00:00 +0000</pubDate></item>"
        b"</channel></rss>"
    )
    urls = []

    def opener(url, timeout):
        urls.append(url)
        return 200, feed

    fetchers = build_live_fetchers(allowlist(), client_with(opener))
    volumes = fetchers["rss_news"]("glass skin", SPAN)
    assert len(urls) == 1
    assert "evil.example" not in urls[0]
    assert volumes == {date(2026, 3, 2): 1.0}


def test_malformed_payload_raises_never_fabricates():
    def opener(url, timeout):
        return 200, b"<<<not xml or json>>>"

    import json

    from c1_pattern_engine.adapters.fetchers import PayloadRejected

    fetchers = build_live_fetchers(allowlist(), client_with(opener))
    with pytest.raises(PayloadRejected):
        fetchers["reddit"]("glass skin", SPAN)
    for name in ("hacker_news", "wikipedia_pageviews"):
        with pytest.raises(json.JSONDecodeError):
            fetchers[name]("glass skin", SPAN)


# --- R1: per-source parsing (canned payloads) ----------------------------------------------------


def test_wikipedia_parses_absolute_daily_views():
    payload = (
        b'{"items": [{"timestamp": "2026030100", "views": 120},'
        b'{"timestamp": "2026030200", "views": 340}]}'
    )
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    volumes = fetchers["wikipedia_pageviews"]("glass skin", SPAN)
    assert volumes == {date(2026, 3, 1): 120.0, date(2026, 3, 2): 340.0}


def test_hacker_news_counts_stories_per_day():
    ts = int(datetime(2026, 3, 1, 12, tzinfo=UTC).timestamp())
    payload = (
        f'{{"hits": [{{"created_at_i": {ts}}}, {{"created_at_i": {ts}}},'
        f'{{"created_at_i": {ts + 86400}}}]}}'
    ).encode()
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    volumes = fetchers["hacker_news"]("glass skin", SPAN)
    assert volumes == {date(2026, 3, 1): 2.0, date(2026, 3, 2): 1.0}


def test_youtube_counts_matching_titles_only():
    feed = (
        b'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'
        b"<entry><title>GLASS SKIN routine</title><published>2026-03-01T10:00:00+00:00"
        b"</published></entry>"
        b"<entry><title>unrelated</title><published>2026-03-01T11:00:00+00:00</published></entry>"
        b"</feed>"
    )
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, feed)))
    volumes = fetchers["youtube_trending"]("glass skin", SPAN)
    assert volumes == {date(2026, 3, 1): 1.0}


def test_gap_days_stay_absent():
    payload = b'{"items": [{"timestamp": "2026030100", "views": 120}]}'
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    volumes = fetchers["wikipedia_pageviews"]("glass skin", SPAN)
    assert date(2026, 3, 2) not in volumes  # absent key, never 0/None


# --- R2: Proxy provenance on the live shape ------------------------------------------------------


def test_live_observations_are_proxy():
    from substrate.provenance import Provenance

    payload = b'{"items": [{"timestamp": "2026030100", "views": 120}]}'
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    adapter = build_adapter("wikipedia_pageviews", fetchers["wikipedia_pageviews"], as_of=AS_OF)
    observations = adapter.observe("glass skin", SPAN)
    assert observations and all(o.volume.provenance is Provenance.PROXY for o in observations)


# --- R7: swap behind the unchanged port ----------------------------------------------------------


def test_live_fetchers_run_through_the_unchanged_spine(tmp_path):
    from c1_pattern_engine.detector import StateRoot, run_scan
    from c1_pattern_engine.registry import AdmissionOrigin, TrackedTerm

    payload = b'{"items": []}'  # empty but live: source is up, nothing trending
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    state = StateRoot.load(tmp_path)
    result = run_scan(
        terms=[
            TrackedTerm(
                term="glass skin",
                vertical="beauty",
                platform="tiktok",
                origin=AdmissionOrigin.SCHEDULED_SCAN,
                admitted_at=AS_OF,
                last_activity_at=AS_OF,
                kind="topic",
            )
        ],
        fetchers={"wikipedia_pageviews": fetchers["wikipedia_pageviews"]},
        as_of=AS_OF,
        store=state.signals,
        identity_index=state.identity,
        samples=state.samples,
    )
    assert result.dark_sources == ()
    assert result.stored_signal_ids == ()  # no data → no signals, no fabrication


# --- R4 (round 2): construction-time refusal is exclude-don't-abort, tested through the entrypoint


def _truncated_allowlist(drop: str) -> TrendAllowlist:
    full = allowlist()
    return TrendAllowlist(
        version=full.version, sources=tuple(s for s in full.sources if s.name != drop)
    )


def test_missing_allowlist_entry_excludes_source_not_aborts(capsys):
    """Construction-time R4: a source with no allowlist entry is DROPPED from the live set and
    surfaced loudly — the sibling fetchers still build, so one missing entry never aborts."""
    fetchers = build_live_fetchers(
        _truncated_allowlist("wikipedia_pageviews"), client_with(lambda u, t: (200, b"{}"))
    )
    assert "wikipedia_pageviews" not in fetchers  # excluded, not built
    assert "hacker_news" in fetchers and "reddit" in fetchers  # siblings unaffected
    assert "wikipedia_pageviews" in capsys.readouterr().err  # surfaced, never a silent drop


def test_entrypoint_live_excludes_missing_source_without_aborting(tmp_path, monkeypatch, capsys):
    """R4 through the ENTRYPOINT path (not just the enforcer unit): --fetchers live with a source
    missing from the allowlist runs to completion, excludes the source, and surfaces it — proving
    the exclude-don't-abort contract end to end. Network-free: the client's opener is injected."""
    from c1_pattern_engine.adapters import allowlist as allowlist_mod
    from c1_pattern_engine.adapters import http as http_mod
    from c1_pattern_engine.detector import run as run_mod

    truncated = _truncated_allowlist("wikipedia_pageviews")
    monkeypatch.setattr(allowlist_mod, "load_trend_allowlist", lambda *a, **k: truncated)
    real_client = http_mod.KeylessHttpClient
    monkeypatch.setattr(
        http_mod,
        "KeylessHttpClient",
        lambda **kw: real_client(
            opener=lambda u, t: (200, b"{}"), sleeper=lambda s: None, clock=lambda: 0.0, **kw
        ),
    )
    terms = tmp_path / "terms.yaml"
    terms.write_text(
        "terms:\n  - term: glass skin\n    vertical: beauty\n    platform: tiktok\n",
        encoding="utf-8",
    )
    code = run_mod.main(
        [
            "--state-root",
            str(tmp_path / "state"),
            "--as-of",
            "2026-03-02T00:00:00+00:00",
            "--terms",
            str(terms),
            "--tenants",
            str(tmp_path / "absent.yaml"),
            "--fetchers",
            "live",
        ]
    )
    assert code == 0  # the run completed — one missing entry did not abort it
    assert "wikipedia_pageviews" in capsys.readouterr().err  # excluded + surfaced via the CLI


# --- R4 (round 2): breadth of the disjointness proof + port pin + duplicate-name refusal ---------


def test_all_trend_hosts_absent_from_media_sources():
    """Strengthen the structural-disjointness proof to the WHOLE section: every trend host, not
    just wikimedia, is absent from the exemplar-media `sources:` allowlist — so no trend host can
    silently widen media-ingestion rights (D5 stays closed for all six)."""
    from extraction.acquire import load_allowlist

    media = load_allowlist(REAL_CONFIG)
    for source in allowlist().sources:
        assert media.entry_for(source.host) is None


def test_nondefault_port_refused_by_check_url():
    al = allowlist()
    with pytest.raises(TrendSourceNotAllowlistedError, match="left the pinned endpoint"):
        al.check_url("hacker_news", "https://hn.algolia.com:8443/api/v1/x")
    al.check_url("hacker_news", "https://hn.algolia.com:443/api/v1/x")  # explicit 443 accepted
    al.check_url("hacker_news", "https://hn.algolia.com/api/v1/x")  # implicit default accepted


def test_duplicate_trend_source_name_refused_at_load(tmp_path):
    cfg = tmp_path / "dup.yaml"
    cfg.write_text(
        "version: test\n"
        "trend_sources:\n"
        '  - name: reddit\n    host: www.reddit.com\n'
        '    url_template: "https://www.reddit.com/search.rss?q={term}"\n'
        '  - name: reddit\n    host: evil.example\n'
        '    url_template: "https://evil.example/{term}"\n',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate entry for 'reddit'"):
        load_trend_allowlist(cfg)


# --- R5 (round 2): path-slot hostile term + non-finite JSON refusal ------------------------------


@pytest.mark.parametrize(
    "hostile",
    ["../../etc/passwd", "https://evil.example/x", "a/b/c", "{start}", "a\r\nHost: evil.example"],
)
def test_hostile_terms_stay_in_the_path_slot(hostile):
    """R5 PATH-slot proof: the wikipedia template puts {term} in a path SEGMENT, not a query slot.
    quote(safe='') encodes '/', so '../../' can't climb, and an encoded '{start}' can't trigger a
    second-pass substitution — the term stays one opaque segment between the pinned prefix and the
    '/daily/' suffix."""
    from urllib.parse import quote

    urls: list[str] = []

    def opener(url, timeout):
        urls.append(url)
        return 200, b'{"items": []}'

    build_live_fetchers(allowlist(), client_with(opener))["wikipedia_pageviews"](hostile, SPAN)
    assert len(urls) == 1
    url = urls[0]
    prefix = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/"
        "per-article/en.wikipedia/all-access/user/"
    )
    enc = quote(hostile, safe="")
    assert url.startswith(prefix)
    tail = url[len(prefix) :]
    assert "/daily/" in tail  # the pinned suffix survived — the term did not swallow it
    assert tail.split("/daily/")[0] == enc  # the term is confined to exactly its one segment
    assert "evil.example" not in url.replace(enc, "")  # nothing hostile escaped the encoded slot


def test_nonfinite_json_volume_refused():
    """R5: json.loads accepts NaN/Infinity by default; a non-finite volume from a compromised feed
    must fail closed (→ AdapterDark), never poison the median/MAD."""
    from c1_pattern_engine.adapters.fetchers import PayloadRejected

    payload = b'{"items": [{"timestamp": "2026030100", "views": Infinity}]}'
    fetchers = build_live_fetchers(allowlist(), client_with(lambda u, t: (200, payload)))
    with pytest.raises(PayloadRejected):
        fetchers["wikipedia_pageviews"]("glass skin", SPAN)
