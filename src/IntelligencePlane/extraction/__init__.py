"""Extraction Service — the shared, stateless, versioned ``FeatureRecord`` producer.

*"An exemplar post scraped from TikTok and a creator submission uploaded to ClientHub produce the
same shape."* One pipeline, one artefact, stamped ``extractor_version``. Every external tool sits
behind a ``Protocol`` in :mod:`extraction.ports`; every metric that leaves here does so inside a
``FeatureRecord`` whose fields are comparable only within a single extractor version.
"""

from __future__ import annotations

from extraction.model import (
    AudioDependentCriterion,
    AuthenticitySignals,
    ConfidenceBand,
    ContrastBand,
    CrossVersionComparisonError,
    DegradationFlag,
    DeidentifiedRecord,
    DisclosureSignals,
    FeatureRecord,
    Frame,
    OnscreenText,
    SourceKind,
    TranscriptSource,
    require_comparable,
)
from extraction.pipeline import Extractor
from extraction.untrusted import UnfencedUntrustedError, Untrusted, fence

__all__ = [
    "AudioDependentCriterion",
    "AuthenticitySignals",
    "ConfidenceBand",
    "ContrastBand",
    "CrossVersionComparisonError",
    "DegradationFlag",
    "DeidentifiedRecord",
    "DisclosureSignals",
    "Extractor",
    "FeatureRecord",
    "Frame",
    "OnscreenText",
    "SourceKind",
    "TranscriptSource",
    "UnfencedUntrustedError",
    "Untrusted",
    "fence",
    "require_comparable",
]
