"""The trend-path allowlist: host-pinned, deny-by-default, no override (Phase 7 R4, ADR-0009 §6).

Reads the ``trend_sources:`` section of ``config/source-allowlist.yaml`` — **structurally
disjoint** from the ``sources:`` key that grants exemplar-media rights (`extraction/acquire.py`),
so adding a trend host can never widen media-ingestion rights and the D5 legal gate stays closed.

The allowlist pins, per source, the **host the bytes actually go to** and the URL template the
fetcher may construct. Enforcement is two-layered and neither layer is overridable:

* **Construction time** — a source not listed here refuses to build at all
  (:class:`TrendSourceNotAllowlistedError`), before any fetch exists to go dark.
* **Request time** — the HTTP client validates the *final constructed URL's* host against the
  pinned host immediately before the request (the ``extraction/acquire.py`` pattern) — a name-level
  check can't see where the bytes go; this one can.

``tiktok_creative_center`` is deliberately absent: human-in-the-loop, never crawled
(ADR-0001/0004).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import yaml

__all__ = [
    "TrendAllowlist",
    "TrendSource",
    "TrendSourceNotAllowlistedError",
    "load_trend_allowlist",
]

# adapters/ → c1_pattern_engine → IntelligencePlane → src → repo root
_DEFAULT_PATH = Path(__file__).resolve().parents[4] / "config" / "source-allowlist.yaml"


class TrendSourceNotAllowlistedError(RuntimeError):
    """The source has no trend-path allowlist entry. Refused before any fetch — a refusal at
    configuration time, never laundered into a silent AdapterDark."""


@dataclass(frozen=True, slots=True)
class TrendSource:
    name: str
    host: str
    url_template: str

    def __post_init__(self) -> None:
        parsed = urlsplit(self.url_template)
        if parsed.scheme != "https":
            raise ValueError(f"trend source {self.name!r}: url_template must be https")
        if (parsed.hostname or "") != self.host:
            raise ValueError(
                f"trend source {self.name!r}: url_template host {parsed.hostname!r} does not "
                f"match the pinned host {self.host!r}"
            )


@dataclass(frozen=True, slots=True)
class TrendAllowlist:
    version: str
    sources: tuple[TrendSource, ...]

    def require(self, name: str) -> TrendSource:
        for source in self.sources:
            if source.name == name:
                return source
        raise TrendSourceNotAllowlistedError(
            f"Source {name!r} has no trend_sources allowlist entry (version {self.version}). "
            "Deny-by-default; no config flag or env var may bypass this (ADR-0009 invariant 6)."
        )

    def check_url(self, name: str, url: str) -> None:
        """Validate the FINAL constructed URL immediately before the request.

        Pins scheme, host, AND port: ``https://host:8443/…`` is a different endpoint even at the
        same hostname, so a non-default port is refused — closing the seam a future caller feeding
        an arbitrary URL through this public check could otherwise slip through.
        """
        source = self.require(name)
        parsed = urlsplit(url)
        off_host = parsed.scheme != "https" or (parsed.hostname or "") != source.host
        off_port = parsed.port not in (None, 443)
        if off_host or off_port:
            raise TrendSourceNotAllowlistedError(
                f"Constructed URL for {name!r} left the pinned endpoint: got "
                f"{parsed.scheme}://{parsed.hostname!r}:{parsed.port}, "
                f"pinned https://{source.host!r}:443."
            )


def load_trend_allowlist(path: str | Path | None = None) -> TrendAllowlist:
    """Parse the ``trend_sources:`` section. Absent section → empty allowlist (deny everything)."""
    p = Path(path) if path is not None else _DEFAULT_PATH
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    version = str(data.get("version", "unversioned"))
    sources = tuple(
        TrendSource(
            name=str(row["name"]), host=str(row["host"]), url_template=str(row["url_template"])
        )
        for row in data.get("trend_sources", [])
    )
    # Reject duplicate names at load: require() returns the first match, so a second entry with a
    # different host would silently shadow — a configuration ambiguity refused loudly, not resolved.
    seen: set[str] = set()
    for source in sources:
        if source.name in seen:
            raise ValueError(
                f"trend_sources has a duplicate entry for {source.name!r} — names must be unique "
                "(a shadowed entry could silently redirect a source's host)."
            )
        seen.add(source.name)
    return TrendAllowlist(version=version, sources=sources)
