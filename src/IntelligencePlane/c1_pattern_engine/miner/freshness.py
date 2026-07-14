"""Corpus freshness alarm (P6 failure mode: C1 -> event-log lag).

When the event log lags, the internal corpus goes stale. The miner's response is disciplined:
run on what it has, **alarm** past 30 days, and **never impute a missing outcome**. A z-score or an
effect size computed across an imputed gap is a fabrication with a decimal point; the estimator
excludes what it cannot measure (via the ``MeasuredOutcome`` barrier) and this alarm surfaces the
staleness so nobody mistakes a thin corpus for a settled one.
"""

from __future__ import annotations

from datetime import datetime

__all__ = ["CORPUS_STALE_DAYS", "is_corpus_stale"]

CORPUS_STALE_DAYS = 30


def is_corpus_stale(
    latest_as_of: datetime,
    now: datetime,
    *,
    threshold_days: int = CORPUS_STALE_DAYS,
) -> bool:
    """True when the newest outcome is older than the threshold — an alarm, never a fill.

    The alarm changes nothing about the estimate: missing outcomes stay missing (the estimator
    excludes them), and this flag simply makes the staleness visible.
    """
    return (now - latest_as_of).days > threshold_days
