"""Phase 2 — the candidate → TrendSignal assembler (trend-monitor runtime).

Locks the four assembly rules: deterministic id anchored on a caller-persisted ``first_seen``
(R2), the primary-series merge rule (R2b), stage from the smoothed series (R3), and the
confidence ladder (R4) — plus the tenant/scope invariant pass-through (R6) and the no-numeric
contract (R1/REQ-005e).
"""

from __future__ import annotations

from dataclasses import fields
from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest

from c1_pattern_engine.detector import (
    TrendCandidate,
    assemble_signal,
    select_primary_series,
    signal_id,
)

D0 = date(2026, 1, 1)


def make_candidate(start: date = D0, run: int = 3) -> TrendCandidate:
    days = tuple(start + timedelta(days=i) for i in range(run))
    return TrendCandidate(start_day=start, days=days, z_scores=tuple(3.5 for _ in days))


def series(start: date, values: list[float]) -> dict[date, float]:
    return {start + timedelta(days=i): v for i, v in enumerate(values)}


RISING = [10.0, 12.0, 15.0, 20.0, 28.0, 40.0]
PEAKING = [10.0, 20.0, 35.0, 45.0, 46.0, 46.2]
DECLINING = [40.0, 38.0, 30.0, 22.0, 15.0, 10.0]


def assemble(
    *,
    term: str = "glass skin",
    platform: str = "reddit",
    vertical: str = "beauty",
    volumes: dict[date, float] | None = None,
    distinct_sources: int = 1,
    first_seen: date | None = None,
    as_of: date = D0 + timedelta(days=6),
    **kw,
):
    return assemble_signal(
        make_candidate(),
        term=term,
        platform=platform,
        vertical=vertical,
        kind="topic",
        distinct_sources=distinct_sources,
        volumes=volumes or series(D0, RISING),
        as_of=as_of,
        first_seen=first_seen,
        **kw,
    )


# --- R2: deterministic id ---------------------------------------------------------------------


def test_same_identity_same_first_seen_same_id():
    a = assemble()
    b = assemble()
    assert a.id == b.id


def test_shifted_start_day_with_stable_first_seen_keeps_id():
    """The source revises its window (start_day shifts); the persisted first_seen wins."""
    first = assemble()  # first detection: first_seen defaults to candidate.start_day (D0)
    shifted_candidate = make_candidate(start=D0 + timedelta(days=1))
    re_assembled = assemble_signal(
        shifted_candidate,
        term="glass skin",
        platform="reddit",
        vertical="beauty",
        kind="topic",
        distinct_sources=1,
        volumes=series(D0, RISING),
        as_of=D0 + timedelta(days=7),
        first_seen=D0,  # caller-resolved from the identity index — not the shifted start_day
    )
    assert re_assembled.id == first.id


def test_different_identity_different_id():
    base = assemble()
    assert assemble(term="dopamine decor").id != base.id
    assert assemble(platform="hacker_news").id != base.id
    assert assemble(first_seen=D0 + timedelta(days=30)).id != base.id  # new episode ⇒ new id


def test_signal_id_is_process_stable():
    """uuid5 over the pinned namespace — a hardcoded expectation catches accidental key drift."""
    sid = signal_id(
        scope="public",
        tenant_id=None,
        platform="reddit",
        vertical="beauty",
        term="glass skin",
        first_seen=D0,
    )
    assert sid == UUID("947f5454-6bac-53d5-af58-565aed8656a3")


# --- R2b: primary-series selection ------------------------------------------------------------


def test_primary_series_most_observed_days_wins():
    short, long_ = series(D0, RISING[:4]), series(D0, RISING)
    name, chosen = select_primary_series({"reddit": short, "wikipedia_pageviews": long_})
    assert name == "wikipedia_pageviews"
    assert chosen is long_


def test_primary_series_tie_breaks_lexicographically():
    a, b = series(D0, RISING), series(D0, DECLINING)
    name, _ = select_primary_series({"reddit": a, "hacker_news": b})
    assert name == "hacker_news"


def test_primary_series_empty_raises():
    with pytest.raises(ValueError):
        select_primary_series({})


def test_assemble_empty_volumes_raises():
    """No stage claim from zero observations — fail closed (fewer signals)."""
    with pytest.raises(ValueError):
        assemble_signal(
            make_candidate(),
            term="glass skin",
            platform="reddit",
            vertical="beauty",
            kind="topic",
            distinct_sources=1,
            volumes={},
            as_of=D0 + timedelta(days=6),
        )


# --- R3: stage from the smoothed series -------------------------------------------------------


@pytest.mark.parametrize(
    ("values", "stage"),
    [(RISING, "rising"), (PEAKING, "peak"), (DECLINING, "declining")],
)
def test_stage_classification(values, stage):
    assert assemble(volumes=series(D0, values)).lifecycle_stage == stage


# --- R4: confidence ladder --------------------------------------------------------------------


def test_confidence_rungs():
    assert assemble(distinct_sources=1).confidence == "single_source"
    assert assemble(distinct_sources=2).confidence == "corroborated"
    assert assemble(distinct_sources=1, human_corroborated=True).confidence == "human_corroborated"


# --- R5: valid_to rule ------------------------------------------------------------------------


def test_valid_to_is_lifecycle_dependent_and_deterministic():
    as_of = D0 + timedelta(days=6)
    assert assemble(volumes=series(D0, RISING), as_of=as_of).valid_to == as_of + timedelta(days=21)
    assert assemble(volumes=series(D0, DECLINING), as_of=as_of).valid_to == as_of + timedelta(
        days=7
    )


# --- R6: tenant/scope invariant honored -------------------------------------------------------


def test_internal_scope_requires_tenant():
    tenant = uuid4()
    internal = assemble(scope="internal", tenant_id=tenant)
    assert internal.tenant_id == tenant
    with pytest.raises(ValueError):
        assemble(scope="internal")  # no tenant_id
    with pytest.raises(ValueError):
        assemble(tenant_id=tenant)  # public + tenant


def test_tenant_enters_the_id_key():
    t1, t2 = uuid4(), uuid4()
    a = assemble(scope="internal", tenant_id=t1)
    b = assemble(scope="internal", tenant_id=t2)
    assert a.id != b.id


# --- R1/REQ-005e: the assembler adds no numeric field ------------------------------------------


# --- registry: kind survives refresh -----------------------------------------------------------


def test_tracked_term_kind_survives_refresh():
    """A non-default kind must not be reset to "topic" by admit()'s refresh path."""
    from datetime import UTC, datetime

    from c1_pattern_engine.registry import AdmissionOrigin, TermRegistry, TrackedTerm

    t0 = datetime(2026, 7, 1, tzinfo=UTC)
    registry = TermRegistry()
    registry.admit(
        TrackedTerm(
            term="corner mic",
            vertical="beauty",
            platform="tiktok",
            origin=AdmissionOrigin.HUMAN_SUBMISSION,
            admitted_at=t0,
            last_activity_at=t0,
            kind="sound",
        )
    )
    refreshed = registry.admit(
        TrackedTerm(
            term="corner mic",
            vertical="beauty",
            platform="tiktok",
            origin=AdmissionOrigin.HUMAN_SUBMISSION,
            admitted_at=t0,
            last_activity_at=t0.replace(day=2),
        )
    )
    assert refreshed.kind == "sound"


def test_assembled_signal_has_no_numeric_field():
    sig = assemble()
    for f in fields(sig):
        assert not isinstance(getattr(sig, f.name), (int, float)), (
            f"TrendSignal.{f.name} is numeric — REQ-005e forbids a scorer-readable number"
        )
