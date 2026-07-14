"""C1 §1.8, §1.10 — the immutable, content-addressed artefact publishers.

Phase 8 ships the **mechanism library** publisher (P8-T8), which needs no verdict: a mechanism
makes no numeric prediction, so there is nothing for C3 to referee (mechanisms-v1.json,
``who_gates_this``). Phase 6 ships the **pattern library** publisher (§1.8), which is the opposite:
C1 **cannot publish a pattern library without C3's** ``promote`` ``LibraryVerdict`` (Contract D).
"""

from __future__ import annotations

from c1_pattern_engine.publishers.artefact_store_writer import (
    MECHANISMS_PREFIX,
    PATTERNS_PREFIX,
    ContentAddressedArtefactWriter,
    canonical_json,
    content_sha256,
)
from c1_pattern_engine.publishers.mechanism_library import (
    LibraryManifest,
    SchemaValidationError,
    load_mechanism_schema,
    publish_library,
    validate_manifest,
    validate_mechanism,
    write_mechanism_library_artefact,
)
from c1_pattern_engine.publishers.pattern_library import (
    LibraryVerdict,
    PatternLibraryArtefact,
    PatternLibraryPublisher,
    PatternLibraryVersion,
    PublicationRefused,
    build_pattern_library_body,
    write_pattern_library_artefact,
)

__all__ = [
    "MECHANISMS_PREFIX",
    "PATTERNS_PREFIX",
    "ContentAddressedArtefactWriter",
    "LibraryManifest",
    "LibraryVerdict",
    "PatternLibraryArtefact",
    "PatternLibraryPublisher",
    "PatternLibraryVersion",
    "PublicationRefused",
    "SchemaValidationError",
    "build_pattern_library_body",
    "canonical_json",
    "content_sha256",
    "load_mechanism_schema",
    "publish_library",
    "validate_manifest",
    "validate_mechanism",
    "write_mechanism_library_artefact",
    "write_pattern_library_artefact",
]
