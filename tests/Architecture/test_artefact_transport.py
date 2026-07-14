"""R4b-T1/T2/T6 (Python side) — the cross-process artefact transport, writer side.

C1 (Python) writes what C2/C4 (C#) read. These tests pin the three properties the C# reader relies
on and the one authority property the writer must **not** have:

* **Layout + content address (R4b-T1/T2):** a written artefact lands at
  ``<prefix>/<sha256[0:2]>/<sha256>.json`` and its filename is the lowercase-hex SHA-256 of its
  exact bytes — the self-consistency ``ArtefactStore.Read`` re-checks and refuses on mismatch.
* **Distinct keyspaces (R4b-T2):** pattern and mechanism artefacts occupy different prefixes, so
  C2's VPS/pattern resolver (scoped to ``patterns``) can never load a mechanism artefact.
* **No promotion path (R4b-T6):** the writer writes only content-addressed ``<sha>`` artefacts. It
  has no method, no parameter, and no code path that writes a ``pointer/active_version`` key —
  repointing ``active_version`` *is* promotion, and promotion is C3's sole authority (Rule 3).
"""

from __future__ import annotations

import hashlib
import inspect
import json
import pathlib
from datetime import UTC, date, datetime
from uuid import UUID

import pytest

from c1_pattern_engine.corpora.exemplar import Cohort
from c1_pattern_engine.miner.pattern import Pattern
from c1_pattern_engine.publishers import artefact_store_writer as writer_module
from c1_pattern_engine.publishers.artefact_store_writer import (
    MECHANISMS_PREFIX,
    PATTERNS_PREFIX,
    ContentAddressedArtefactWriter,
    canonical_json,
    content_sha256,
)
from c1_pattern_engine.publishers.mechanism_library import (
    LibraryManifest,
    write_mechanism_library_artefact,
)
from c1_pattern_engine.publishers.pattern_library import (
    PatternLibraryPublisher,
    write_pattern_library_artefact,
)

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
_FIXTURE_TENANT = UUID("000000a1-0000-0000-0000-000000000001")


def _pattern() -> Pattern:
    return Pattern(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        tenant_id=_FIXTURE_TENANT,
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


def _pattern_version() -> object:
    pub = PatternLibraryPublisher()
    return pub.cut_candidate(
        tenant_id=_FIXTURE_TENANT,
        vertical="beauty",
        platform="tiktok",
        patterns=(_pattern(),),
        created_at=NOW,
    )


def _mechanism_manifest() -> LibraryManifest:
    """A minimal library manifest for transport tests. The *content* validity of a mechanism is
    covered by test_synthesiser; here we exercise the store write and keyspace only."""
    body = {
        "mechanism_library_version": "beauty.tiktok.m3",
        "vertical": "beauty",
        "platform": "tiktok",
        "mechanisms": [],
    }
    body["sha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return LibraryManifest(
        mechanism_library_version="beauty.tiktok.m3",
        cohort=Cohort("beauty", "tiktok"),
        sha256=body["sha256"],
        body=body,
    )


# --- R4b-T1: pattern-library artefact lands content-addressed --------------------------------


def test_pattern_artefact_lands_at_content_addressed_path(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    artefact = write_pattern_library_artefact(
        _pattern_version(),
        store,
        compatible_extractor_versions=["3.2.x"],
        revision=7,
        corpus_snapshot_sha256="snap-abc",
    )

    sha = artefact.sha256
    expected = tmp_path / PATTERNS_PREFIX / sha[:2] / f"{sha}.json"
    assert expected.is_file(), f"artefact not at the documented layout: {expected}"

    # Self-consistency the C# ArtefactStore.Read re-checks: filename == sha256(file bytes).
    on_disk = expected.read_bytes()
    assert hashlib.sha256(on_disk).hexdigest() == sha
    # No BOM, no trailing newline — the hashed bytes are exactly the written bytes.
    assert not on_disk.startswith(b"\xef\xbb\xbf")
    assert not on_disk.endswith(b"\n")


def test_pattern_artefact_body_carries_resolver_fields(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    artefact = write_pattern_library_artefact(
        _pattern_version(),
        store,
        compatible_extractor_versions=["3.2.x"],
        revision=7,
        corpus_snapshot_sha256="snap-abc",
    )
    sha = artefact.sha256
    body = json.loads((tmp_path / PATTERNS_PREFIX / sha[:2] / f"{sha}.json").read_text())

    assert body["library_kind"] == "pattern_library"
    assert body["pattern_library_version"] == "beauty.tiktok.v7"
    assert body["compatible_extractor_versions"] == ["3.2.x"]
    assert body["tenant_id"] == str(_FIXTURE_TENANT)  # pattern libraries ARE tenant-scoped (Rule 8)
    assert body["patterns"][0]["id"] == "11111111-1111-1111-1111-111111111111"


# --- R4b-T2: mechanism-library artefact in a DISTINCT keyspace --------------------------------


def test_mechanism_artefact_lands_in_distinct_keyspace(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    sha = write_mechanism_library_artefact(_mechanism_manifest(), store)

    mech_path = tmp_path / MECHANISMS_PREFIX / sha[:2] / f"{sha}.json"
    assert mech_path.is_file()
    assert hashlib.sha256(mech_path.read_bytes()).hexdigest() == sha
    # It is NOT reachable under the pattern keyspace — a pattern resolver scoped to `patterns`
    # can never load it (mechanisms carry Proxy-selected provenance; they never enter VPS).
    assert not (tmp_path / PATTERNS_PREFIX / sha[:2] / f"{sha}.json").exists()


def test_pattern_and_mechanism_prefixes_are_distinct_and_match_csharp() -> None:
    assert PATTERNS_PREFIX != MECHANISMS_PREFIX
    # Byte-for-byte the same tokens as ArtefactStore.PatternsPrefix / MechanismsPrefix (C#).
    assert PATTERNS_PREFIX == "patterns"
    assert MECHANISMS_PREFIX == "mechanisms"


# --- R4b-T6: the writer has no pointer/active_version write path ------------------------------


def test_writer_exposes_only_a_content_addressed_write() -> None:
    public = [
        name
        for name, _ in inspect.getmembers(ContentAddressedArtefactWriter, inspect.isfunction)
        if not name.startswith("_")
    ]
    assert public == ["write"], f"writer exposes more than a content write: {public}"

    # No repoint/promotion/pointer method by any spelling.
    for forbidden in (
        "repoint",
        "repoint_active_version",
        "set_active_version",
        "active_version",
        "promote",
        "pointer",
    ):
        assert not hasattr(ContentAddressedArtefactWriter, forbidden), (
            f"writer exposes a promotion path: {forbidden}"
        )


def test_write_takes_no_key_only_prefix_and_content() -> None:
    params = list(inspect.signature(ContentAddressedArtefactWriter.write).parameters)
    # The caller names a keyspace and supplies content; it can never name a file/key/pointer.
    assert params == ["self", "prefix", "content"]
    for keyish in ("key", "filename", "name", "version", "path"):
        assert keyish not in params


def test_writer_module_has_no_pointer_literal() -> None:
    """The write code path never constructs a ``pointer`` segment — grep the source directly.

    ``ArtefactStore.cs`` reserves ``<prefix>/pointer/<key>.json`` for ``active_version``. That token
    must not appear in any string the writer could write to; the only 'pointer' mentions here are in
    prose explaining why the writer refuses to touch it. We assert no *code* constructs it: there is
    no ``"pointer"`` string literal in the module at all.
    """
    source = pathlib.Path(inspect.getfile(writer_module)).read_text(encoding="utf-8")
    # Strip the module docstring (prose legitimately says 'pointer' to explain the ban).
    tree_body = source.split('"""', 2)
    code = tree_body[2] if len(tree_body) == 3 else source
    assert '"pointer"' not in code
    assert "'pointer'" not in code


def test_write_refuses_a_pointer_shaped_prefix(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    # A caller cannot smuggle a pointer keyspace in via the prefix: only the two content keyspaces
    # are accepted, so `patterns/pointer` and a bare `pointer` are both refused.
    for bad in ("patterns/pointer", "mechanisms/pointer", "pointer", "patterns/active_version"):
        with pytest.raises(ValueError, match="prefix"):
            store.write(bad, "{}")


def test_written_artefact_parent_is_the_sha_prefix_never_pointer(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    sha = store.write(PATTERNS_PREFIX, "{}")
    path = tmp_path / PATTERNS_PREFIX / sha[:2] / f"{sha}.json"
    assert path.is_file()
    assert path.parent.name == sha[:2] != "pointer"


# --- Content address matches the C# computation ----------------------------------------------


def test_content_sha256_is_lowercase_hex_over_utf8() -> None:
    content = '{"library_kind":"pattern_library"}'
    sha = content_sha256(content)
    assert sha == hashlib.sha256(content.encode("utf-8")).hexdigest()
    assert sha == sha.lower()
    assert len(sha) == 64


def test_write_is_immutable_write_once(tmp_path: pathlib.Path) -> None:
    store = ContentAddressedArtefactWriter(tmp_path)
    body = canonical_json({"a": 1, "b": [2, 3]})
    sha1 = store.write(PATTERNS_PREFIX, body)
    path = tmp_path / PATTERNS_PREFIX / sha1[:2] / f"{sha1}.json"
    mtime = path.stat().st_mtime_ns
    sha2 = store.write(PATTERNS_PREFIX, body)  # same content -> same address, untouched
    assert sha1 == sha2
    assert path.stat().st_mtime_ns == mtime


# --- The committed transport fixture is self-consistent (the C# e2e's starting point) ---------


def test_committed_transport_fixture_is_self_consistent() -> None:
    """The fixture the C# e2e starts from must round-trip: the artefact at the manifest's recorded
    relative path hashes to the recorded sha, which is also its filename (what ArtefactStore.Read
    re-verifies). If this fails, the C# read would refuse the artefact as a P1 mismatch."""
    fixtures = pathlib.Path(__file__).resolve().parent / "fixtures" / "transport"
    manifest = json.loads((fixtures / "manifest.json").read_text(encoding="utf-8"))
    sha = manifest["sha256"]

    rel = pathlib.PurePosixPath(manifest["artefact_relative_path"])
    assert rel.parts == (manifest["prefix"], sha[:2], f"{sha}.json"), (
        f"manifest path {rel} is not the documented <prefix>/<sha[0:2]>/<sha>.json layout"
    )
    artefact = fixtures / pathlib.Path(*rel.parts)
    on_disk = artefact.read_bytes()
    assert hashlib.sha256(on_disk).hexdigest() == sha
    assert manifest["prefix"] == PATTERNS_PREFIX

    body = json.loads(on_disk)
    assert body["pattern_library_version"] == manifest["pattern_library_version"]
    assert body["library_kind"] == "pattern_library"
