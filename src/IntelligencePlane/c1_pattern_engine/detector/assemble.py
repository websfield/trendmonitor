"""Candidate → ``TrendSignal`` assembly — the seam between detection and the signal store.

Three rules carried from the plan (trend-monitor-runtime Phase 2) and ADR-0009:

* **Deterministic id (R2).** ``uuid5`` over the business key
  ``{scope}:{tenant_id}:{platform}:{vertical}:{term}:{first_seen}``. ``first_seen`` is
  *caller-resolved and persisted* (the ``IdentityIndex``, Phases 3-4) — never recomputed from the
  fetched window, because keyless sources revise history (a feed's item window slides day to day,
  and recency-truncated feeds drop old days as volume rises), so a nightly-recomputed ``start_day``
  would mint duplicate ids for the same real trend. An archived-then-resurging identity mints a
  *new* signal (new-episode semantics — do not "fix" this into id reuse across an archive boundary).

* **Primary series (R2b).** One signal per identity. When several sources corroborate, the series
  driving ``ema → classify_stage`` is the source with the most observed days in the window, ties
  broken lexicographically by source name — deterministic, and volumes are **never** arithmetically
  combined across sources (series stay per ``(term, source)`` end-to-end). Near-tie flips between
  runs are expected; the orchestrator logs which source was primary.

* **``valid_to`` (R5).** ``as_of`` plus a lifecycle-dependent horizon aligned with the
  days-remaining band thresholds in :mod:`.lifecycle`: a ``rising`` trend is presumed *long*
  (``> 21d`` → 21-day horizon); ``peak``/``declining`` are presumed *short* (``< 7d`` → 7-day
  horizon). The horizon is a validity window for the *record*, not a numeric days-remaining
  claim — that stays band-only until 20 resolutions (REQ-005 / ``lifecycle.days_remaining``).

No numeric field is added to the signal (REQ-005e) — the assembler only ever constructs the
existing ``TrendSignal`` contract.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from uuid import UUID, uuid5

from c1_pattern_engine.detector.detect import TrendCandidate
from c1_pattern_engine.detector.lifecycle import (
    _LONG_MIN_DAYS,
    _SHORT_MAX_DAYS,
    classify_stage,
    ema,
)
from c1_pattern_engine.detector.signals import (
    Kind,
    Scope,
    TrendSignal,
    assess_confidence,
)

__all__ = [
    "SIGNAL_NAMESPACE",
    "VALIDITY_STAGES",
    "assemble_signal",
    "select_primary_series",
    "signal_id",
    "validity_horizon_days",
]

# Fixed uuid5 namespace for TrendSignal business keys. Changing it re-mints every signal id, so it
# is pinned here once and never derived from config.
SIGNAL_NAMESPACE = UUID("6f9c2d84-3f6e-5c1a-9d7b-2e8a41c0b5d3")

# Lifecycle-dependent validity horizons (days past as_of), derived from lifecycle's band
# thresholds so they cannot silently desync: rising ⇒ presumed long (the >21d band),
# peak/declining ⇒ presumed short (the <7d band).
_VALIDITY_DAYS: dict[str, int] = {
    "rising": int(_LONG_MIN_DAYS),
    "peak": int(_SHORT_MAX_DAYS),
    "declining": int(_SHORT_MAX_DAYS),
}

# The stages a signal can be born or assembled at. Public so callers can VALIDATE untrusted input
# against it (a submission's resolver-supplied `observed_class`) instead of indexing blind and
# raising a KeyError mid-run — "candidate"/"archived" are not valid birth stages.
VALIDITY_STAGES: frozenset[str] = frozenset(_VALIDITY_DAYS)


def validity_horizon_days(stage: str) -> int:
    """Days past the anchor date a signal at ``stage`` stays valid.

    Public so a submission-born signal (Phase 9) shares this exact horizon rule rather than
    re-deriving it — the two cannot silently desync. Raises ``KeyError`` for a stage outside
    :data:`VALIDITY_STAGES`; validate untrusted input against that set first.
    """
    return _VALIDITY_DAYS[stage]


def signal_id(
    *,
    scope: Scope,
    tenant_id: UUID | None,
    platform: str,
    vertical: str,
    term: str,
    first_seen: date,
) -> UUID:
    """The deterministic signal id from the business key (Phase 2 R2).

    Same identity + same ``first_seen`` ⇒ same id in every process; the store's id-keyed dedupe
    then makes nightly re-runs idempotent.
    """
    key = f"{scope}:{tenant_id or ''}:{platform}:{vertical}:{term}:{first_seen.isoformat()}"
    return uuid5(SIGNAL_NAMESPACE, key)


def select_primary_series(
    volumes_by_source: Mapping[str, Mapping[date, float]],
) -> tuple[str, Mapping[date, float]]:
    """Pick the primary series for stage classification (Phase 2 R2b).

    Most observed days wins; ties break lexicographically by source name. Never merges or sums
    series — the runner-up series contribute corroboration (``distinct_sources``) only.
    """
    if not volumes_by_source:
        raise ValueError("select_primary_series needs at least one (source, series) pair")
    name = min(volumes_by_source, key=lambda s: (-len(volumes_by_source[s]), s))
    return name, volumes_by_source[name]


def assemble_signal(
    candidate: TrendCandidate,
    *,
    term: str,
    platform: str,
    vertical: str,
    kind: Kind,
    distinct_sources: int,
    volumes: Mapping[date, float],
    as_of: date,
    first_seen: date | None = None,
    tenant_id: UUID | None = None,
    scope: Scope = "public",
    human_corroborated: bool = False,
) -> TrendSignal:
    """Turn a detected candidate (+ context) into a stored-shape ``TrendSignal``.

    ``volumes`` is the **primary series** for this identity (see :func:`select_primary_series`),
    ordered by day internally before smoothing. ``first_seen`` is the caller-resolved persisted
    first-detection date; it defaults to ``candidate.start_day`` only at *first* detection — a
    caller holding an ``IdentityIndex`` entry must pass that instead (Phase 3 R6).
    """
    if not volumes:
        # A stage claim from zero observations would be fabricated; fail closed (fewer signals).
        raise ValueError("assemble_signal needs a non-empty primary series")

    anchored_first_seen = first_seen if first_seen is not None else candidate.start_day

    smoothed = ema([volumes[d] for d in sorted(volumes)])
    stage = classify_stage(smoothed)

    return TrendSignal(
        id=signal_id(
            scope=scope,
            tenant_id=tenant_id,
            platform=platform,
            vertical=vertical,
            term=term,
            first_seen=anchored_first_seen,
        ),
        scope=scope,
        tenant_id=tenant_id,
        platform=platform,
        vertical=vertical,
        kind=kind,
        lifecycle_stage=stage,
        confidence=assess_confidence(
            distinct_sources=distinct_sources, human_corroborated=human_corroborated
        ),
        valid_to=as_of + timedelta(days=_VALIDITY_DAYS[stage]),
    )
