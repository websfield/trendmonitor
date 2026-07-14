"""Feed visibility (REQ-005g).

The trend feed is visible to manager, client, and resolver roles. It is **not** visible to
creator roles — a creator seeing the trend board could reverse-engineer the scoring surface they
are being measured against. This is a role gate, not a suggestion: a creator request raises.
"""

from __future__ import annotations

from collections.abc import Sequence

from c1_pattern_engine.detector.signals import TrendSignal

__all__ = ["FEED_ROLES", "FeedAccessDenied", "require_feed_access", "trend_feed"]

FEED_ROLES: frozenset[str] = frozenset({"manager", "client", "resolver"})


class FeedAccessDenied(PermissionError):
    """Raised when a role outside :data:`FEED_ROLES` (notably a creator) requests the trend feed."""


def require_feed_access(role: str) -> None:
    if role not in FEED_ROLES:
        raise FeedAccessDenied(
            f"Role {role!r} may not view the trend feed. It is visible to "
            f"{sorted(FEED_ROLES)} only; creator roles are excluded (REQ-005g)."
        )


def trend_feed(role: str, live_signals: Sequence[TrendSignal]) -> list[TrendSignal]:
    """Return the live feed for an authorised role, or raise for a creator.

    Archiving already removed dead signals; this only enforces *who* may look."""
    require_feed_access(role)
    return [s for s in live_signals if not s.is_archived]
