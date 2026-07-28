"""Phase 8 — the one permitted one-way coupling: rising+go → ingestion priority.

Locks: a public rising+go verdict admits/upgrades its term to ``TREND_DETECTED`` (0.8, monotonic —
never downgrades a human submission); skip/caution/internal/unresolvable admit nothing (fail
closed); a trend-occasioned exemplar carries ``TREND_DIRECTED`` + ``occasioned_by_trend_ids``; the
coupling never converges with the amplification ``arm`` and imports nothing from
``scoring``/``amplif``/``miner.arm`` (R4 — a standing test, not a one-time grep); the D5 legal gate
stays closed; and the nightly seed path never grows cold storage with duplicates (carried Phase 5
note a).
"""

from __future__ import annotations

import ast
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from c1_pattern_engine.corpora.exemplar import (
    IngestionArm,
    LiveIngestionBlocked,
    SourceAllowlist,
    fixture_exemplar_corpus,
    ingest_live,
    occasion_exemplar,
)
from c1_pattern_engine.detector.coupling import TrendDirection, apply_trend_direction
from c1_pattern_engine.detector.identity import IdentityIndex, SignalIdentity
from c1_pattern_engine.detector.run_scan import ScanResult
from c1_pattern_engine.detector.store_durable import StateRoot
from c1_pattern_engine.detector.verdict import TrendVerdict
from c1_pattern_engine.registry.terms import AdmissionOrigin, TermRegistry, TrackedTerm
from substrate.provenance import Provenance

REPO = Path(__file__).resolve().parents[2]
COUPLING_SRC = (
    REPO / "src" / "IntelligencePlane" / "c1_pattern_engine" / "detector" / "coupling.py"
)
AS_OF = datetime(2026, 3, 2, tzinfo=UTC)
IDENTITY = SignalIdentity(
    scope="public", tenant_id=None, platform="tiktok", vertical="beauty", term="glass skin"
)


def _index_with(identity: SignalIdentity, trend_id) -> IdentityIndex:
    idx = IdentityIndex()
    idx.record(identity, first_seen=date(2026, 2, 1), signal_id=trend_id)
    return idx


def _verdict(trend_id, verdict: str, *, stage: str, band: str = "long") -> TrendVerdict:
    return TrendVerdict(
        trend_id=trend_id,
        tenant_id=uuid4(),
        verdict=verdict,  # type: ignore[arg-type]
        stage=stage,  # type: ignore[arg-type]
        band=band,  # type: ignore[arg-type]
        reason="test",
    )


def _admitted(registry: TermRegistry, term: str = "glass skin") -> TrackedTerm | None:
    return next((t for t in registry.active() if t.term == term), None)


# --- R1: public rising+go admits/upgrades the term to TREND_DETECTED -----------------------------


def test_public_go_admits_term_with_trend_detected_origin():
    tid = uuid4()
    reg = TermRegistry()
    direction = apply_trend_direction(
        _verdict(tid, "go", stage="rising"),
        reg,
        identity_index=_index_with(IDENTITY, tid),
        as_of=AS_OF,
        kind="sound",
    )
    assert direction == TrendDirection(tid, "glass skin", "beauty", "tiktok")
    term = _admitted(reg)
    assert term is not None
    assert term.origin is AdmissionOrigin.TREND_DETECTED
    assert term.kind == "sound"  # fresh admit carries the resolved kind


@pytest.mark.parametrize(
    ("verdict", "stage"),
    [("skip", "declining"), ("caution", "peak")],
)
def test_non_go_verdict_admits_nothing(verdict, stage):
    tid = uuid4()
    reg = TermRegistry()
    assert (
        apply_trend_direction(
            _verdict(tid, verdict, stage=stage),
            reg,
            identity_index=_index_with(IDENTITY, tid),
            as_of=AS_OF,
        )
        is None
    )
    assert reg.active() == []


def test_internal_signal_go_admits_nothing_and_tags_nothing():
    """CLAUDE.md rule 8 / REQ-060: an internal-scope go never reaches the shared, tenant-neutral
    registry or corpus. The refusal lives in the coupling, robust to any caller."""
    tid = uuid4()
    internal = SignalIdentity(
        scope="internal",
        tenant_id=uuid4(),
        platform="tiktok",
        vertical="beauty",
        term="tenant secret",
    )
    reg = TermRegistry()
    assert (
        apply_trend_direction(
            _verdict(tid, "go", stage="rising"),
            reg,
            identity_index=_index_with(internal, tid),
            as_of=AS_OF,
        )
        is None
    )
    assert reg.active() == []


def test_unresolvable_trend_id_fails_closed():
    reg = TermRegistry()
    assert (
        apply_trend_direction(
            _verdict(uuid4(), "go", stage="rising"),
            reg,
            identity_index=IdentityIndex(),  # empty → trend_id unresolvable
            as_of=AS_OF,
        )
        is None
    )
    assert reg.active() == []


def test_origin_upgrade_is_monotonic():
    """A go promotes a lower-priority origin up to TREND_DETECTED, but never downgrades a human
    submission — the coupling raises priority, never lowers it."""
    tid = uuid4()
    idx = _index_with(IDENTITY, tid)
    go = _verdict(tid, "go", stage="rising")

    def _seed(origin: AdmissionOrigin) -> TermRegistry:
        reg = TermRegistry()
        reg.admit(TrackedTerm("glass skin", "beauty", "tiktok", origin, AS_OF, AS_OF))
        apply_trend_direction(go, reg, identity_index=idx, as_of=AS_OF)
        return reg

    # SCHEDULED_SCAN (0.5) → upgraded to TREND_DETECTED (0.8)
    assert _admitted(_seed(AdmissionOrigin.SCHEDULED_SCAN)).origin is AdmissionOrigin.TREND_DETECTED
    # HUMAN_SUBMISSION (1.0) → NOT downgraded
    assert (
        _admitted(_seed(AdmissionOrigin.HUMAN_SUBMISSION)).origin
        is AdmissionOrigin.HUMAN_SUBMISSION
    )


# --- R2: trend-occasioned exemplar carries the ingestion tags -------------------------------------


def test_occasioned_exemplar_carries_trend_directed_tags():
    corpus, _contrast, _ids = fixture_exemplar_corpus()
    post = corpus.posts[0]
    tid = uuid4()
    tagged = occasion_exemplar(post, [tid, tid])  # dedupes
    assert tagged.ingestion_arm is IngestionArm.TREND_DIRECTED
    assert tagged.occasioned_by_trend_ids == (tid,)
    # replace() re-validated the Proxy engagement invariant.
    assert tagged.engagement.provenance is Provenance.PROXY
    # Empty occasion → untouched (not trend-directed).
    assert occasion_exemplar(post, []) is post


def test_coupling_does_not_unblock_d5_live_ingestion():
    with pytest.raises(LiveIngestionBlocked):
        ingest_live("any_source", SourceAllowlist(sources=("any_source",), ratified=True))


# --- R3/R4: no convergence with the amplification arm; no score path -----------------------------


def test_coupling_imports_nothing_from_scoring_amplif_or_arm():
    """Standing structural guard (R4): the coupling module imports nothing from the scoring, the
    amplification, or the miner-arm surfaces — parsed from the AST so a docstring mention of those
    words (there are several) can never false-pass or false-fail this."""
    tree = ast.parse(COUPLING_SRC.read_text(encoding="utf-8"))
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            modules.append(node.module or "")
    for module in modules:
        parts = module.split(".")
        assert "arm" not in parts, f"coupling imports the amplification arm surface: {module}"
        assert not any(
            "scor" in p or "amplif" in p for p in parts
        ), f"coupling imports a scoring/amplification surface: {module}"


def test_ingestion_arm_and_amplification_arm_are_distinct_axes():
    """R3: IngestionArm (corpus effort) is a different concept from the amplification arm (client
    spend). Their value sets do not overlap — the two names must never converge."""
    from typing import get_args

    from c1_pattern_engine.miner.pattern import Arm

    ingestion_values = {a.value for a in IngestionArm}
    amplification_values = set(get_args(Arm))
    assert amplification_values == {"exploit", "explore"}  # guard the reference is the real axis
    assert ingestion_values.isdisjoint(amplification_values)


# --- carried Phase 5 note (a): the nightly seed path never grows cold storage with duplicates ----


def test_cold_evicted_seed_not_readmitted_nightly(tmp_path, monkeypatch):
    """A seed evicted to cold under cap pressure must not be re-admitted (and re-appended to
    append-only cold) every night. The seed guard skips terms known in active OR cold."""
    import c1_pattern_engine.registry.terms as terms_mod
    from c1_pattern_engine.detector import run as run_mod

    monkeypatch.setattr(terms_mod, "CAP_PER_VERTICAL_PLATFORM", 1)  # one slot per bucket
    seeds = tmp_path / "terms.yaml"
    seeds.write_text(
        "terms:\n"
        "  - term: alpha\n    vertical: beauty\n    platform: tiktok\n"
        "  - term: beta\n    vertical: beauty\n    platform: tiktok\n",
        encoding="utf-8",
    )
    state_root = tmp_path / "state"
    run_mod.run_once(state_root=state_root, as_of=AS_OF, terms_file=seeds, fetchers={})
    cold_after_first = len(StateRoot.load(state_root).registry.cold_storage())
    assert cold_after_first == 1  # one seed active, one displaced to cold

    run_mod.run_once(state_root=state_root, as_of=AS_OF, terms_file=seeds, fetchers={})
    cold_after_second = len(StateRoot.load(state_root).registry.cold_storage())
    assert cold_after_second == cold_after_first  # no nightly duplicate growth


# --- wiring: run_once applies the coupling to a go verdict, before persist -----------------------


def test_run_once_couples_public_go_verdict_to_the_registry(tmp_path, monkeypatch):
    """End-to-end wiring: run_once resolves a go verdict's term through the identity index and
    admits it TREND_DETECTED, persisting it so the next scan tracks the directed format."""
    from c1_pattern_engine.detector import run as run_mod

    state_root = tmp_path / "state"
    seeded = StateRoot.load(state_root)
    tid = uuid4()
    seeded.identity.record(IDENTITY, first_seen=date(2026, 2, 1), signal_id=tid)
    seeded.persist()

    go = _verdict(tid, "go", stage="rising")

    def fake_run_scan(**kw):
        return ScanResult(
            as_of=kw["as_of"],
            stored_signal_ids=(),
            archived_ids=(),
            alerts=(),
            dark_sources=(),
            verdicts=(go, go),  # same trend go for two tenants — directed exactly once
        )

    monkeypatch.setattr(run_mod, "run_scan", fake_run_scan)
    run_mod.run_once(
        state_root=state_root,
        as_of=AS_OF,
        terms_file=tmp_path / "absent.yaml",
        fetchers={},
    )
    final = StateRoot.load(state_root)
    admitted = [t for t in final.registry.active() if t.term == "glass skin"]
    assert len(admitted) == 1
    assert admitted[0].origin is AdmissionOrigin.TREND_DETECTED
