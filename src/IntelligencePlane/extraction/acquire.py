"""Acquire media, gated by the source allowlist (P2-T2).

*"No source outside the allowlist, ever."* Exemplars are fetched with ``yt-dlp`` only from a host
whose terms — reviewed like code — permit ingestion. Submissions and live posts are first-party
and read directly from blob storage. The allowlist review asks two questions: does the source
permit *ingestion*, and does it permit *redistribution*? Ingestion-yes / redistribution-no yields
a record flagged ``no_redistribute`` so C4 can serve counts without the URI.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from urllib.parse import urlsplit

import yaml

from extraction.model import SourceKind
from extraction.ports import AcquiredMedia, IBlobStore, IMediaDownloader

__all__ = [
    "Allowlist",
    "AllowlistEntry",
    "IngestionNotPermittedError",
    "SourceNotAllowlistedError",
    "acquire",
    "load_allowlist",
]

_DEFAULT_ALLOWLIST = (
    Path(__file__).resolve().parents[3] / "config" / "source-allowlist.yaml"
)


class SourceNotAllowlistedError(RuntimeError):
    """The host is not on the allowlist. A refusal to acquire, not a warning."""


class IngestionNotPermittedError(RuntimeError):
    """The host is listed but its terms do not permit ingestion."""


@dataclass(frozen=True, slots=True)
class AllowlistEntry:
    host: str
    permit_ingestion: bool
    permit_redistribution: bool


@dataclass(frozen=True, slots=True)
class Allowlist:
    version: str
    entries: tuple[AllowlistEntry, ...]

    def entry_for(self, host: str) -> AllowlistEntry | None:
        for entry in self.entries:
            if entry.host == host:
                return entry
        return None


def load_allowlist(path: Path | None = None) -> Allowlist:
    """Parse the versioned allowlist artefact. Missing/blank required fields fail closed."""
    data = yaml.safe_load((path or _DEFAULT_ALLOWLIST).read_text(encoding="utf-8"))
    version = data.get("version")
    if not version:
        raise ValueError("source-allowlist.yaml is missing a required `version`.")
    entries = tuple(
        AllowlistEntry(
            host=str(row["host"]),
            permit_ingestion=bool(row["permit_ingestion"]),
            permit_redistribution=bool(row["permit_redistribution"]),
        )
        for row in data.get("sources", [])
    )
    return Allowlist(version=str(version), entries=entries)


def _host_of(uri: str) -> str:
    return urlsplit(uri).hostname or ""


def acquire(
    uri: str,
    source_kind: SourceKind,
    *,
    allowlist: Allowlist,
    downloader: IMediaDownloader,
    blob_store: IBlobStore,
) -> AcquiredMedia:
    """Fetch media for extraction, refusing any exemplar host not on the allowlist.

    Exemplars go through the allowlist and ``yt-dlp``. Submissions / live posts are first-party
    and read from blob storage. A :class:`MediaUnreachableError` from either tool propagates — the
    pipeline then produces no record and the caller degrades to ``NEEDS_REVIEW``.
    """
    if source_kind is SourceKind.EXEMPLAR:
        host = _host_of(uri)
        entry = allowlist.entry_for(host)
        if entry is None:
            raise SourceNotAllowlistedError(
                f"Refusing to acquire exemplar from non-allowlisted host {host!r}. "
                f"No source outside the allowlist (version {allowlist.version}), ever."
            )
        if not entry.permit_ingestion:
            raise IngestionNotPermittedError(
                f"Host {host!r} is listed but its terms do not permit ingestion."
            )
        media = downloader.fetch(uri)
        # Redistribution is the second question: propagate the flag regardless of what the
        # downloader reported, so the allowlist is the single source of truth for rights.
        return replace(media, no_redistribute=not entry.permit_redistribution)

    # Submissions and live posts are first-party: read directly, no allowlist gate.
    return blob_store.read(uri)
