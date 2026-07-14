"""Producer for the R4b cross-process transport fixture (Python writer side).

Runs C1's **real** artefact writer and lays a pattern-library artefact down in the documented
``<prefix>/<sha256[0:2]>/<sha256>.json`` store layout under this directory, plus a ``manifest.json``
recording the cohort key, the ``pattern_library_version``, the sha256, and the relative artefact
path. The C# R4b end-to-end test starts from *this* real serialized output — not a hand-built C#
fixture — reads it through ``ArtefactStore``, and drives VPS to ``Anchored``.

Regenerate with (from the repo root)::

    uv run python tests/Architecture/fixtures/transport/produce_transport_fixture.py

Deterministic by construction (fixed ids/dates), so the sha is stable across runs and the
committed fixture is reproducible.
"""

from __future__ import annotations

import json
import pathlib
from datetime import UTC, date, datetime
from uuid import UUID

from c1_pattern_engine.miner.pattern import Pattern
from c1_pattern_engine.publishers.artefact_store_writer import (
    PATTERNS_PREFIX,
    ContentAddressedArtefactWriter,
)
from c1_pattern_engine.publishers.pattern_library import (
    PatternLibraryPublisher,
    write_pattern_library_artefact,
)

HERE = pathlib.Path(__file__).resolve().parent

TENANT = UUID("000000a1-0000-0000-0000-000000000001")
CREATED_AT = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
REVISION = 7
COMPATIBLE_EXTRACTORS = ["3.2.x"]
CORPUS_SNAPSHOT = "corpus-beauty-tiktok-2026q2"


def _fixture_pattern() -> Pattern:
    return Pattern(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        tenant_id=TENANT,
        vertical="beauty",
        platform="tiktok",
        assertion="A face in the first frame lifts 24h engagement percentile.",
        feature_predicate={"all": [{"feature": "face_present", "op": "eq", "value": True}]},
        effect_size=8.0,
        effect_ci=(3.0, 13.0),
        sample_size=45,
        evidence_arm="explore",
        evidence_status="active",
        valid_from=date(2026, 1, 1),
        valid_to=date(2027, 1, 1),
    )


def main() -> None:
    publisher = PatternLibraryPublisher()
    version = publisher.cut_candidate(
        tenant_id=TENANT,
        vertical="beauty",
        platform="tiktok",
        patterns=(_fixture_pattern(),),
        created_at=CREATED_AT,
    )

    store = ContentAddressedArtefactWriter(HERE)  # root = this fixtures/transport directory
    artefact = write_pattern_library_artefact(
        version,
        store,
        compatible_extractor_versions=COMPATIBLE_EXTRACTORS,
        revision=REVISION,
        corpus_snapshot_sha256=CORPUS_SNAPSHOT,
    )

    sha = artefact.sha256
    relative = f"{PATTERNS_PREFIX}/{sha[:2]}/{sha}.json"
    manifest = {
        "note": "Real C1 (Python) writer output for R4b transport. Do not hand-edit; regenerate "
        "via produce_transport_fixture.py.",
        "prefix": PATTERNS_PREFIX,
        "cohort_key": "beauty.tiktok",
        "tenant_id": str(TENANT),
        "vertical": "beauty",
        "platform": "tiktok",
        "pattern_library_version": artefact.pattern_library_version,
        "compatible_extractor_versions": COMPATIBLE_EXTRACTORS,
        "sha256": sha,
        "artefact_relative_path": relative,
    }
    (HERE / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {relative} (sha256={sha})")
    print(f"pattern_library_version={artefact.pattern_library_version}")


if __name__ == "__main__":
    main()
