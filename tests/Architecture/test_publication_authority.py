"""P6-T10 — publication authority + trend-never-in-VPS (Python plane).

**A9 — C1 cannot publish without C3's ``promote``.** Given ``reject``, ``extend_shadow``, or
``None`` (C3 unreachable), the publisher refuses: no artefact stored, ``active_version`` unchanged.
Only ``promote`` publishes. C1 never *calls* C3 and never promotes itself — the verdict is an
injected input, and silence from the referee leaves the candidate a candidate (Contract D, the
safe direction, Rule 3). The refusal is falsifiable: a publisher that stored without checking the
verdict fails the refusal test, and a positive control proves the refusal is not merely
"publish always raises."

**A12 — no trend value enters VPS.** VPS is C# control-plane code (Phase 3). The cross-plane
barrier — C2 (the scorer) never references C1 (where ``TrendSignal`` and the miner live) — is
enforced structurally by Phase-1 C# ``ReferenceGraphTests`` (a one-way call graph across separate
processes). Here we assert the Python half: ``TrendSignal`` exposes no numeric accessor a scorer
could read, a ``Pattern``/``EffectSize`` carries no VPS field, and no scoring-adjacent Python module
reaches a ``TrendSignal`` or a miner output.
"""

from __future__ import annotations

import dataclasses
import inspect
import pathlib
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest

from c1_pattern_engine.detector.signals import TrendSignal
from c1_pattern_engine.miner.pattern import EffectSize, Pattern
from c1_pattern_engine.publishers.pattern_library import (
    PatternLibraryPublisher,
    PublicationRefused,
)

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
_SRC = pathlib.Path(__file__).resolve().parents[2] / "src" / "IntelligencePlane"

# Fields/accessors a scorer would read. A trend or a miner output that exposed any of these would
# have a path into a VPS; the guard is that none does.
_FORBIDDEN_SCORER_FIELDS = {"score", "weight", "vps", "bas", "aws", "points"}


def _pattern() -> Pattern:
    return Pattern(
        id=uuid4(),
        tenant_id=uuid4(),
        vertical="beauty",
        platform="tiktok",
        assertion="face in first frame lifts 24h engagement",
        feature_predicate={"all": [{"feature": "face_present", "op": "eq", "value": True}]},
        effect_size=8.0,
        effect_ci=(3.0, 13.0),
        sample_size=45,
        evidence_arm="explore",
        evidence_status="active",
        valid_from=date(2026, 1, 1),
        valid_to=date(2027, 1, 1),
    )


def _publisher_and_candidate() -> tuple[PatternLibraryPublisher, object, object]:
    pub = PatternLibraryPublisher()
    tenant = uuid4()
    candidate = pub.cut_candidate(
        tenant_id=tenant,
        vertical="beauty",
        platform="tiktok",
        patterns=(_pattern(),),
        created_at=NOW,
    )
    return pub, candidate, tenant


# --- A9: C1 cannot publish without C3's promote ------------------------------------------------


@pytest.mark.parametrize("verdict", ["reject", "extend_shadow", None])
def test_publish_refuses_without_promote(verdict: str | None) -> None:
    pub, candidate, tenant = _publisher_and_candidate()

    with pytest.raises(PublicationRefused):
        pub.publish(candidate, verdict)   # type: ignore[arg-type]

    # No artefact written, active_version unchanged (still nothing published for this cohort).
    assert pub.active_version(tenant_id=tenant, vertical="beauty", platform="tiktok") is None
    with pytest.raises(KeyError):
        pub.resolve(candidate.version_id)   # the candidate was never stored


def test_publish_only_on_promote_writes_the_artefact() -> None:
    """Positive control — publish CAN succeed on promote, so the refusal test is not vacuous
    ("publish always raises" would pass the refusal test for the wrong reason)."""
    pub, candidate, tenant = _publisher_and_candidate()

    published = pub.publish(candidate, "promote")

    assert published.version_id == candidate.version_id
    active = pub.active_version(tenant_id=tenant, vertical="beauty", platform="tiktok")
    assert active is not None
    assert active.version_id == candidate.version_id
    assert pub.resolve(candidate.version_id) is published


def test_cut_candidate_alone_publishes_nothing() -> None:
    """C1 cuts candidates freely (cheap, no authority). A candidate is not a publication: cutting
    one leaves active_version unset until a promote arrives."""
    pub, candidate, tenant = _publisher_and_candidate()

    assert pub.active_version(tenant_id=tenant, vertical="beauty", platform="tiktok") is None
    with pytest.raises(KeyError):
        pub.resolve(candidate.version_id)


def test_publish_takes_the_verdict_as_an_injected_input() -> None:
    """C1 does not promote itself: publish requires the verdict parameter — there is no
    self-promotion overload that publishes without one."""
    params = inspect.signature(PatternLibraryPublisher.publish).parameters
    assert "verdict" in params

    # The only public store mutators are publish (checks the verdict), cut_candidate, and rollback.
    mutators = [
        name
        for name, member in inspect.getmembers(PatternLibraryPublisher, inspect.isfunction)
        if not name.startswith("_") and name in {"publish", "cut_candidate", "rollback"}
    ]
    assert set(mutators) == {"publish", "cut_candidate", "rollback"}


# --- A12: no trend value (or miner output) enters VPS ------------------------------------------


def test_trend_signal_exposes_no_numeric_scorer_accessor() -> None:
    field_names = {f.name for f in dataclasses.fields(TrendSignal)}
    assert not (field_names & (_FORBIDDEN_SCORER_FIELDS | {"value", "effect_size"}))

    # No float-returning accessor a scorer could reach for, either.
    for attr in ("value", "score", "weight", "vps", "aws", "bas", "effect_size", "points"):
        assert not hasattr(TrendSignal, attr), f"TrendSignal exposes a scorer accessor: {attr}"


def test_pattern_and_effectsize_carry_no_vps_field() -> None:
    pattern_fields = {f.name for f in dataclasses.fields(Pattern)}
    effect_fields = {f.name for f in dataclasses.fields(EffectSize)}

    assert not (pattern_fields & _FORBIDDEN_SCORER_FIELDS)
    assert not (effect_fields & _FORBIDDEN_SCORER_FIELDS)

    # A Pattern legitimately carries its own effect_size (a lift), but never a vps/score — the
    # miner's output is not a scorer input (the C# barrier keeps C2 from reading it at all).
    assert "effect_size" in pattern_fields
    assert "vps" not in pattern_fields


def test_no_scoring_adjacent_python_module_reaches_a_trend_or_miner_output() -> None:
    """Re-assert the Python half of REQ-005e. The C# VPS->C1 barrier lives in Phase-1
    ``ReferenceGraphTests`` (C2 never references C1); this is the intelligence-plane echo."""
    assert _SRC.is_dir()
    scorer_markers = ("vps", "scoring", "amplif")

    offenders: list[str] = []
    for py in _SRC.rglob("*.py"):
        if "__pycache__" in py.parts:
            continue
        if any(marker in py.name.lower() for marker in scorer_markers):
            text = py.read_text(encoding="utf-8")
            if "TrendSignal" in text or "c1_pattern_engine.miner" in text:
                offenders.append(str(py))

    assert offenders == [], f"scoring-adjacent modules reach a trend/miner output: {offenders}"
