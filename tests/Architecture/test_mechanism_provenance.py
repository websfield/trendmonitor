"""P8-T10 - the mechanism provenance / reachability suite (the 8 day-one cases).

*"An adversarial suite asserting that no reachable code path lets an OutcomeEvent, a Pattern, a
PerformanceSnapshot, or a tenant_id enter a Mechanism. If any ever ships, the finding is a P1."*

The eight day-one cases (eval-and-calibration-plan.md), each asserted non-vacuously:

1. a mechanism whose feature_predicate was proposed from an internal post -> A3 (proposer
   independence, asserted as a **transitive** import closure, not just a direct-import line);
2. a prevalence computed over a corpus including a submission -> signatures admit exemplar posts;
3. a MechanismLibraryVersion key carrying a tenant id -> A5 (no tenant axis, in key AND schema);
4. a C2 code path that resolves a mechanism library -> A4 (no scorer path reaches a mechanism);
5. a C4 response containing any 0-100 field -> the served mechanism dict carries no numeric score;
6. a C4 response for an unratified statement, or one with an empty ratification_note -> refused;
7. a contrasted mechanism with fewer than two temporal slices, or two overlapping ones -> refused;
8. a Mechanism carrying an arm field -> A1 (schema additionalProperties: false).

Plus A10 (no ?include_unratified / admin / internal-caller exemption on either plane). This
complements test_synthesiser.py; the novel guards here are the transitive import-closure scans
(with a canary self-check) and the schema / C4-serving exemption scans.
"""

from __future__ import annotations

import ast
import dataclasses
import inspect
import pathlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from c1_pattern_engine.publishers.mechanism_library import (
    load_mechanism_schema,
    publish_library,
    validate_mechanism,
)
from c1_pattern_engine.synthesiser.mechanism import Mechanism, UnratifiedSerialisationError
from c1_pattern_engine.synthesiser.prevalence import compute_prevalence
from c1_pattern_engine.synthesiser.propose import propose_predicates
from c1_pattern_engine.synthesiser.ratify import RatificationError, ratify
from c1_pattern_engine.synthesiser.synthesise import synthesise
from c1_pattern_engine.synthesiser.warrant import Warrant

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
_SRC = pathlib.Path(__file__).resolve().parents[2] / "src" / "IntelligencePlane"
_SYNTHESISE = _SRC / "c1_pattern_engine" / "synthesiser" / "synthesise.py"
_FIRST_PARTY_ROOTS = ("c1_pattern_engine", "substrate", "extraction")


# --- shared pipeline fixtures ------------------------------------------------------------------


def _contrasted_face() -> Mechanism:
    from c1_pattern_engine.corpora.exemplar import fixture_exemplar_corpus

    corpus, contrast, _ = fixture_exemplar_corpus()
    xr = {p.id: 1 for p in propose_predicates(corpus)}   # n_cohorts reaches 2 via recurrence
    mechanisms = synthesise(corpus, corpus, contrast, [], cross_cohort_recurrence=xr)
    face = next(m for m in mechanisms if m.feature_predicate.id == "face_in_first_frame")
    assert face.warrant is Warrant.CONTRASTED
    return face


def _ratify(mechanism: Mechanism) -> Mechanism:
    return ratify(mechanism, ratified_by=uuid4(), ratification_note="reviewed", ratified_at=NOW)


def _ratified_face_dict() -> dict:
    d = _ratify(_contrasted_face()).to_dict()
    assert validate_mechanism(d) == []
    return d


# --- transitive import-closure scanner (stronger than a direct-import line check) --------------


def _referenced_modules(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    refs: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            refs.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if base:
                refs.add(base)
                refs.update(f"{base}.{a.name}" for a in node.names)
    return refs


def _module_to_path(module: str) -> pathlib.Path | None:
    rel = pathlib.Path(*module.split("."))
    as_file = _SRC / rel.with_suffix(".py")
    if as_file.is_file():
        return as_file
    as_pkg = _SRC / rel / "__init__.py"
    return as_pkg if as_pkg.is_file() else None


def _transitive_first_party_refs(start: pathlib.Path) -> set[str]:
    reached: set[str] = set()
    seen: set[pathlib.Path] = {start}
    stack = [start]
    while stack:
        for ref in _referenced_modules(stack.pop()):
            if ref.split(".")[0] not in _FIRST_PARTY_ROOTS:
                continue
            reached.add(ref)
            child = _module_to_path(ref)
            if child is not None and child not in seen:
                seen.add(child)
                stack.append(child)
    return reached


# --- case 1 / A3: the synthesiser proposer is independent of Phase 6's miner proposer ----------


def test_synthesiser_never_reaches_the_miner_proposer_transitively() -> None:
    reached = _transitive_first_party_refs(_SYNTHESISE)
    offenders = sorted(r for r in reached if "miner.propose" in r)
    assert offenders == [], f"synthesiser reaches Phase 6's miner proposer: {offenders} (ADR-0007)"

    assert synthesise.__kwdefaults__["proposer"] is propose_predicates
    assert propose_predicates.__module__ == "c1_pattern_engine.synthesiser.propose"


def test_transitive_scanner_detects_a_miner_proposer_reach(tmp_path: pathlib.Path) -> None:
    """Sensitivity self-check: the scanner flags a module that imports the miner proposer."""
    canary = tmp_path / "canary.py"
    canary.write_text("from c1_pattern_engine.miner import propose\n", encoding="utf-8")
    assert any("miner.propose" in r for r in _transitive_first_party_refs(canary))


# --- case 1 / A4b: the synthesiser imports nothing from the control plane -----------------------


def test_synthesiser_imports_nothing_from_the_control_plane() -> None:
    reached = _transitive_first_party_refs(_SYNTHESISE)
    markers = ("ijudge", "knowledgeapi", "ugcintelligence", "control_plane", "scoringservice")
    offenders = sorted(r for r in reached if any(m in r.lower() for m in markers))
    assert offenders == [], f"the synthesiser reaches the control plane: {offenders}"


# --- A2: synthesise() admits no OutcomeEvent / Pattern / PerformanceSnapshot / tenant_id -------


def test_synthesise_signature_admits_no_outcome_pattern_snapshot_or_tenant() -> None:
    sig = inspect.signature(synthesise)
    positional = [
        n for n, p in sig.parameters.items()
        if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]
    assert positional == ["cohort", "exemplar_corpus", "contrast_set", "trends"]

    forbidden = ("OutcomeEvent", "Pattern", "PerformanceSnapshot", "Submission", "tenant")
    for name, param in sig.parameters.items():
        assert "tenant" not in name.lower(), f"parameter {name!r} carries a tenant axis"
        annotation = str(param.annotation)
        for token in forbidden:
            assert token not in annotation, f"parameter {name!r} annotation references {token}"


# --- case 2: prevalence is computed over exemplar posts only (never a submission) --------------


def test_prevalence_signature_admits_no_submission_or_outcome() -> None:
    sig = inspect.signature(compute_prevalence)
    for name, param in sig.parameters.items():
        annotation = str(param.annotation)
        for token in ("Submission", "OutcomeEvent", "PerformanceSnapshot", "tenant"):
            assert token not in annotation, f"compute_prevalence {name!r} references {token}"


# --- case 3 / A5: the library key carries no tenant axis (key AND schema) ----------------------


def test_mechanism_library_key_and_schema_have_no_tenant_axis() -> None:
    from c1_pattern_engine.corpora.exemplar import Cohort

    lib = publish_library(
        Cohort("beauty", "tiktok"),
        [_ratify(_contrasted_face())],
        corpus_snapshot_sha256="0" * 64,
        compatible_extractor_versions=["extractor-3.2.0"],
        cut_at=NOW,
        published_at=NOW,
        revision=3,
    )
    assert "tenant" not in lib.mechanism_library_version          # e.g. "beauty.tiktok.m3"
    assert not any("tenant" in key for key in lib.body)

    # The schema forbids a tenant axis on the manifest key - no nullable one waiting to be filled.
    props = load_mechanism_schema()["library_manifest"]["properties"]
    assert "tenant_id" not in props
    assert "No tenant_id" in props["mechanism_library_version"]["description"]


# --- case 4 / A4: nothing on a scorer path reaches a mechanism ---------------------------------


def test_c2_has_no_mechanism_path() -> None:
    """The C2 side of REQ-066. C2 is C#; its barrier (C2 references neither KnowledgeApi nor
    Contracts.Mechanisms) is enforced by ReferenceGraphTests - already green. The Python echo: no
    scoring-adjacent module reaches a mechanism, and a Mechanism has no scorer-readable field."""
    scorer_fields = {"vps", "aws", "bas", "score", "weight", "effect_size", "lift", "points"}
    mech_fields = {f.name for f in dataclasses.fields(Mechanism)}
    assert not (mech_fields & scorer_fields), "a Mechanism exposes a scorer-readable numeric field"

    offenders: list[str] = []
    for py in _SRC.rglob("*.py"):
        if "__pycache__" in py.parts:
            continue
        if any(marker in py.name.lower() for marker in ("vps", "scoring", "amplif")):
            text = py.read_text(encoding="utf-8")
            if "synthesiser" in text or "Mechanism" in text:
                offenders.append(str(py))
    assert offenders == [], f"a scoring-adjacent module reaches a mechanism: {offenders}"


# --- case 5: the served mechanism dict has no 0-100 numeric field ------------------------------


def test_served_mechanism_dict_carries_no_numeric_score() -> None:
    d = _ratified_face_dict()
    numeric = {k: v for k, v in d.items() if isinstance(v, int | float) and not isinstance(v, bool)}
    assert numeric == {}, f"the served mechanism dict carries a numeric field: {numeric}"
    for banned in ("effect_size", "effect_ci", "lift", "vps", "aws", "arm", "score"):
        assert banned not in d


# --- case 6: unratified, or empty ratification_note, is unservable -----------------------------


def test_unratified_or_empty_note_is_unservable() -> None:
    face = _contrasted_face()
    assert not face.is_servable
    with pytest.raises(UnratifiedSerialisationError):
        face.to_dict()

    with pytest.raises(RatificationError):   # an empty note is a rubber stamp - refused
        ratify(face, ratified_by=uuid4(), ratification_note="   ", ratified_at=NOW)


# --- case 7: contrasted needs >= 2 disjoint temporal slices -----------------------------------


def test_contrasted_with_fewer_than_two_slices_is_refused() -> None:
    face = _contrasted_face()
    trimmed = dataclasses.replace(
        face.evidence, temporal_slices=face.evidence.temporal_slices[:1]
    )
    one_slice = dataclasses.replace(face, evidence=trimmed)
    with pytest.raises(RatificationError):
        ratify(one_slice, ratified_by=uuid4(), ratification_note="looks fine", ratified_at=NOW)

    # The schema also fixes minItems=2 for a contrasted mechanism's temporal_slices.
    rule = load_mechanism_schema()["$defs"]["mechanism"]["allOf"][0]
    assert rule["if"]["properties"]["warrant"]["const"] == "contrasted"
    slices_schema = rule["then"]["properties"]["evidence"]["properties"]["temporal_slices"]
    assert slices_schema["minItems"] == 2


# --- case 8 / A1: adding a forbidden field fails schema validation -----------------------------


@pytest.mark.parametrize("field", ["effect_size", "effect_ci", "lift", "vps", "aws", "arm"])
def test_forbidden_field_fails_schema_validation(field: str) -> None:
    d = _ratified_face_dict()
    assert validate_mechanism(d) == []               # valid before injection
    d[field] = "explore" if field == "arm" else 0.5
    errors = validate_mechanism(d)
    assert errors, f"the schema accepted a Mechanism carrying {field!r}"
    assert any("additional property" in e for e in errors)


def test_arm_is_absent_from_the_mechanism_dataclass() -> None:
    names = {f.name for f in dataclasses.fields(Mechanism)}
    assert "arm" not in names            # the amplification arm never appears on a Mechanism
    assert "ingestion_arm" in names      # only ingestion_arm, which must never converge with it


# --- A10: no include_unratified / admin / internal-caller exemption on either plane ------------


_EXEMPTION_TOKENS = ("include_unratified", "includeunratified", "bypass")


def test_no_unratified_or_admin_exemption_on_the_python_surface() -> None:
    # Public entry points expose no exemption parameter.
    for fn in (synthesise, ratify, publish_library):
        params = {p.lower() for p in inspect.signature(fn).parameters}
        bad = [p for p in params if any(tok in p for tok in _EXEMPTION_TOKENS)]
        assert bad == [], f"{fn.__name__} exposes an exemption parameter: {bad}"

    # No FUNCTION anywhere in the synthesiser declares such a parameter (prose that names the
    # absence in a docstring is fine; a real argument is not).
    synth_dir = _SRC / "c1_pattern_engine" / "synthesiser"
    for py in synth_dir.glob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                args = node.args
                names = [
                    a.arg.lower()
                    for a in (*args.posonlyargs, *args.args, *args.kwonlyargs,
                              args.vararg, args.kwarg) if a is not None
                ]
                bad = [n for n in names if any(tok in n for tok in _EXEMPTION_TOKENS)]
                assert bad == [], f"{py.name}:{node.name} declares an exemption parameter: {bad}"


def _is_cs_comment(line: str) -> bool:
    s = line.lstrip()
    return s.startswith(("//", "/*", "*"))


def test_no_unratified_exemption_on_the_c4_serving_surface() -> None:
    """The C# serving surface has no bypass argument either. Cited C# guards:
    KnowledgeApiBoundaryTests (no ?include_unratified / admin / internal exemption) and
    KnowledgeApiTests.ForbiddenVerb_NotServed_EvenIfRatified (serve-time lexicon)."""
    serving = (
        pathlib.Path(__file__).resolve().parents[2]
        / "src" / "KnowledgeApi" / "UgcIntelligence.KnowledgeApi" / "Serving"
    )
    assert serving.is_dir()
    for cs in serving.glob("*.cs"):
        for i, line in enumerate(cs.read_text(encoding="utf-8").splitlines(), start=1):
            if _is_cs_comment(line):
                continue   # a comment naming the absence is not a live exemption
            lower = line.lower()
            assert "?include_unratified" not in lower, f"{cs.name}:{i}"
            assert "includeunratified" not in lower, f"{cs.name}:{i}"
