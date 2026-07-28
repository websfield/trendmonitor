"""Concrete keyless fetchers (Phase 7 R1/R5) — one ``RawVolumeFetch`` per allowlisted source.

Request hygiene: the term is attacker-influenceable (``HUMAN_SUBMISSION``-origin admissions), so
it is **strictly percent-encoded** — ``quote(term, safe="")``, because bare ``quote`` leaves
``/`` unescaped and ``../../`` would survive it — into its template slot, and the final URL is
host-checked by the client immediately before the request.

Response hygiene: fetched content is attacker-influenceable data, never instruction —

* parsed volumes are numeric day-counts only; nothing from a payload is interpolated into a
  prompt, a decision, or another request;
* **no URL found in a response body is ever fetched** — a feed item never causes a follow-up
  request (the ``RawVolumeFetch`` port returns ``Mapping[date, float]``, and every fetcher makes
  exactly one ``client.get`` per call);
* XML parsing refuses DTDs outright: ``<!DOCTYPE``/``<!ENTITY`` anywhere in a payload raises
  before the parser runs (an explicit expat-independent guard — feeds never legitimately carry a
  DTD, and rejecting them closes the entity-expansion/billion-laughs class without a new
  dependency; stdlib ``xml.etree`` already refuses external entities);
* any parse failure raises → ``AdapterDark`` upstream — degraded coverage stated, never a
  fabricated series; a gap stays an absent key, never 0/None.

Per-source unit/denominator notes live on each fetcher — robust z is scale-invariant, so
per-fetch renormalization is tolerable, but volumes are NEVER arithmetically combined across
sources (locked by the Phase 3 structural test).
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from datetime import UTC, date, datetime
from urllib.parse import quote

from c1_pattern_engine.adapters.allowlist import (
    TrendAllowlist,
    TrendSourceNotAllowlistedError,
)
from c1_pattern_engine.adapters.base import DateRange, RawVolumeFetch
from c1_pattern_engine.adapters.http import KeylessHttpClient

__all__ = ["build_live_fetchers"]


class PayloadRejected(RuntimeError):
    """Hostile or malformed payload. Raises → AdapterDark; never a fabricated series."""


def _reject_constant(token: str) -> float:
    """`json.loads(parse_constant=...)` hook: refuse `NaN`/`Infinity`/`-Infinity` outright, so a
    non-finite volume from a compromised feed can never reach the median/MAD statistics."""
    raise PayloadRejected(f"JSON payload carries the non-finite constant {token!r} — refused")


def _fill(template: str, term: str, span: DateRange) -> str:
    """Encode the term into its slot — strictly, so ``../../`` or a full URL can't survive."""
    start_epoch = int(datetime.combine(span.start, datetime.min.time(), tzinfo=UTC).timestamp())
    return (
        template.replace("{term}", quote(term, safe=""))
        .replace("{start}", span.start.strftime("%Y%m%d"))
        .replace("{end}", span.end.strftime("%Y%m%d"))
        .replace("{start_epoch}", str(start_epoch))
    )


def _guard_xml(payload: bytes) -> ET.Element:
    """Parse XML with the DTD refusal guard. A feed carrying a DOCTYPE/ENTITY is hostile.

    The scan covers the WHOLE payload, not a prefix window: XML permits unbounded comments and
    PIs before the doctypedecl, so a 64KB-prefix scan is bypassable by comment-padding the DTD
    past the window (Phase 7 security-gate MEDIUM). The payload is already capped at 5MB by the
    HTTP client, so ``upper()`` over all of it is negligible — and we do not depend on the expat
    version's own entity-expansion limits, which is the whole point of an expat-independent guard.
    """
    if b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise PayloadRejected("XML payload carries a DTD/entity declaration — refused")
    try:
        return ET.fromstring(payload.decode("utf-8", errors="strict"))
    except (ET.ParseError, UnicodeDecodeError) as exc:
        raise PayloadRejected(f"XML parse failed: {exc}") from exc


def _count_by_day(days: list[date], span: DateRange) -> dict[date, float]:
    out: dict[date, float] = {}
    for d in days:
        if span.start <= d <= span.end:
            out[d] = out.get(d, 0.0) + 1.0
    return out


def _parse_rss_dates(root: ET.Element) -> list[date]:
    """Item dates from RSS (`pubDate`) or Atom (`published`/`updated`) — data only, no URLs."""
    stamps: list[date] = []
    for tag in (".//item/pubDate", ".//{*}entry/{*}published", ".//{*}entry/{*}updated"):
        for node in root.findall(tag):
            text = (node.text or "").strip()
            parsed = _parse_datetime(text)
            if parsed is not None:
                stamps.append(parsed)
    return stamps


def _parse_datetime(text: str) -> date | None:
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def build_live_fetchers(
    allowlist: TrendAllowlist, client: KeylessHttpClient
) -> dict[str, RawVolumeFetch]:
    """One fetcher per allowlisted source. A source with no allowlist entry refuses to build at
    all (construction-time enforcement) — and ``tiktok_creative_center`` has no fetcher here by
    design (ADR-0001/0004: human-in-the-loop, never crawled)."""

    def wikipedia_pageviews(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: ABSOLUTE daily pageview counts (stable across fetches, not feed-truncated)."""
        url = _fill(allowlist.require("wikipedia_pageviews").url_template, term, span)
        # Reject non-finite numbers: json.loads accepts NaN/Infinity by default, and one such
        # value from a compromised feed would poison the downstream median/MAD. A hostile payload
        # fails closed to AdapterDark, never a fabricated series.
        raw = json.loads(client.get("wikipedia_pageviews", url), parse_constant=_reject_constant)
        out: dict[date, float] = {}
        for item in raw.get("items", []):
            day = datetime.strptime(str(item["timestamp"])[:8], "%Y%m%d").date()
            if span.start <= day <= span.end:
                views = float(item["views"])
                if views != views or views in (float("inf"), float("-inf")):  # NaN or ±inf
                    raise PayloadRejected("wikipedia_pageviews: non-finite view count — refused")
                out[day] = views
        return out

    def hacker_news(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: stories-per-day mentioning the term (count). Feed-truncated: the pinned template
        caps at 1000 hits with no pagination, so a term with >1000 stories in the span loses its
        oldest days — high-volume terms are censored on the low-recency end, exactly like reddit."""
        url = _fill(allowlist.require("hacker_news").url_template, term, span)
        raw = json.loads(client.get("hacker_news", url))
        days = [
            datetime.fromtimestamp(int(hit["created_at_i"]), tz=UTC).date()
            for hit in raw.get("hits", [])
            if "created_at_i" in hit
        ]
        return _count_by_day(days, span)

    def reddit(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: posts-per-day in search results (count; recency-truncated by the feed)."""
        url = _fill(allowlist.require("reddit").url_template, term, span)
        root = _guard_xml(client.get("reddit", url))
        return _count_by_day(_parse_rss_dates(root), span)

    def google_trends(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: trending-searches matches per day, sampling frame geo=US (pinned in the
        template). SPARSE PRESENCE signal — the daily RSS is not per-term; a day appears only
        when the term matches a trending item's title. Structurally inert for detection: the feed
        carries ~one day of pubDates, so a single fetch can never assemble the 14 baseline days
        robust-z needs — this source can raise no candidate, alert, or corroboration vote. It is
        kept for future baseline work and honest liveness, never as a silent numeric input."""
        url = _fill(allowlist.require("google_trends").url_template, term, span)
        root = _guard_xml(client.get("google_trends", url))
        needle = term.lower()
        days: list[date] = []
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").lower()
            stamp = _parse_datetime((item.findtext("pubDate") or "").strip())
            if needle in title and stamp is not None:
                days.append(stamp)
        return _count_by_day(days, span)

    def youtube_trending(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: feed videos-per-day whose title mentions the term (count; feed-truncated)."""
        url = _fill(allowlist.require("youtube_trending").url_template, term, span)
        root = _guard_xml(client.get("youtube_trending", url))
        needle = term.lower()
        days: list[date] = []
        for entry in root.findall(".//{*}entry"):
            title = (entry.findtext("{*}title") or "").lower()
            stamp = _parse_datetime((entry.findtext("{*}published") or "").strip())
            if needle in title and stamp is not None:
                days.append(stamp)
        return _count_by_day(days, span)

    def rss_news(term: str, span: DateRange) -> Mapping[date, float]:
        """Unit: news items-per-day in search results (count; feed-truncated)."""
        url = _fill(allowlist.require("rss_news").url_template, term, span)
        root = _guard_xml(client.get("rss_news", url))
        return _count_by_day(_parse_rss_dates(root), span)

    candidates: dict[str, RawVolumeFetch] = {
        "wikipedia_pageviews": wikipedia_pageviews,
        "hacker_news": hacker_news,
        "reddit": reddit,
        "google_trends": google_trends,
        "youtube_trending": youtube_trending,
        "rss_news": rss_news,
    }
    # Construction-time enforcement, exclude-don't-abort (Phase 7 R4): a candidate source whose
    # allowlist entry is missing is DROPPED from the live set — it never fetches, so it can't be
    # laundered into a silent AdapterDark — and the exclusion is surfaced loudly on stderr. One
    # missing entry never aborts the whole scan (consistent with Phase 5 R4); the excluded
    # source's platform simply carries no live observations and shows up as a stated coverage gap
    # when no sibling source covers it. Deny-by-default still holds: only allowlisted sources build.
    fetchers: dict[str, RawVolumeFetch] = {}
    excluded: list[str] = []
    for name, fetcher in candidates.items():
        try:
            allowlist.require(name)
        except TrendSourceNotAllowlistedError:
            excluded.append(name)
            continue
        fetchers[name] = fetcher
    if excluded:
        print(
            f"trend live fetchers: excluded non-allowlisted sources {excluded} — scan continues, "
            "these become stated coverage gaps (Phase 7 R4: refuse loudly, never abort the run).",
            file=sys.stderr,
        )
    return fetchers
