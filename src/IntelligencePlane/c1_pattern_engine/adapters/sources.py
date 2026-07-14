"""The seven keyless sources (P7-T2).

Each is a public surface reachable without an API key. They are named and enumerable so the
coverage reporter (P7-T8) can state, per platform, *which* sources are live and which are dark —
a Reddit-only feed is a stated coverage gap, never an implied claim that TikTok is quiet.

The concrete fetch behind each is an injected ``RawVolumeFetch`` (network in production, a fake in
a test). The adapter is otherwise pure: same term, same span, same observed data, same output.
"""

from __future__ import annotations

from datetime import datetime

from c1_pattern_engine.adapters.base import RawVolumeFetch, TrendAdapter, build_adapter

__all__ = ["SOURCE_NAMES", "all_adapters"]

# The seven keyless sources. Public, no key, independently disableable.
SOURCE_NAMES: tuple[str, ...] = (
    "google_trends",
    "reddit",
    "tiktok_creative_center",
    "youtube_trending",
    "wikipedia_pageviews",
    "hacker_news",
    "rss_news",
)


def all_adapters(
    fetchers: dict[str, RawVolumeFetch],
    *,
    as_of: datetime,
) -> dict[str, TrendAdapter]:
    """Build the full adapter set from a name->fetch map.

    A source absent from ``fetchers`` is simply not built — an adapter can be *independently
    disabled* by leaving it out, and its absence is later surfaced by the coverage reporter, never
    silently filled.
    """
    return {
        name: build_adapter(name, fetch, as_of=as_of)
        for name, fetch in fetchers.items()
        if name in SOURCE_NAMES
    }
