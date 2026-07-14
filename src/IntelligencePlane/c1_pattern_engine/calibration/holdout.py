"""P4-T2 — the temporal holdout splitter. Never a random split.

*"Two posts from the same campaign share a brief, a product, and an audience — a random split
leaks."* So this module has **no seed, no shuffle, no random path, and no import of any splitter
that would introduce one**. The held-out set is the temporally-latest slice, so training never
sees the future. A campaign is kept **atomic** — all of its records fall on one side of the split
— because a campaign straddling the boundary is exactly the leak a random split would create.

There is one public entry, :func:`temporal_holdout`, and its result is stamped
``method="temporal"``. There is no overload, flag, or parameter that produces a random split; the
absence is the guarantee (asserted by ``test_holdout_module_has_no_random_split`` and, on the C#
side, ``TemporalHoldoutTests``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from c1_pattern_engine.calibration.dataset import CalibrationRecord

__all__ = ["TemporalSplit", "temporal_holdout"]

DEFAULT_HOLDOUT_FRACTION = 0.3


@dataclass(frozen=True, slots=True)
class TemporalSplit:
    """A time-ordered split. ``method`` is a type-level marker: only ``"temporal"`` exists."""

    train: tuple[CalibrationRecord, ...]
    holdout: tuple[CalibrationRecord, ...]
    cutoff: datetime | None
    method: Literal["temporal"] = "temporal"


def _campaign_of(record: CalibrationRecord) -> str:
    # A record with no campaign is its own singleton campaign, keyed by its submission id, so it is
    # never grouped with an unrelated record.
    if record.campaign_id is not None:
        return record.campaign_id
    return f"__solo__{record.submission_id}"


def temporal_holdout(
    records: Sequence[CalibrationRecord],
    *,
    holdout_fraction: float = DEFAULT_HOLDOUT_FRACTION,
) -> TemporalSplit:
    """Split ``records`` so the temporally-latest campaigns are held out.

    Campaigns are ordered by their *completion* time (the latest ``scored_at`` among their
    records) and the latest ``holdout_fraction`` of records — snapped to whole campaigns — is held
    out. Training is everything earlier. No campaign appears on both sides.
    """
    if not 0.0 < holdout_fraction < 1.0:
        raise ValueError("holdout_fraction must be in (0, 1).")
    if not records:
        return TemporalSplit(train=(), holdout=(), cutoff=None)

    # Group into atomic campaigns.
    campaigns: dict[str, list[CalibrationRecord]] = {}
    for r in records:
        campaigns.setdefault(_campaign_of(r), []).append(r)

    # Order campaigns by completion time; ties broken by campaign key for determinism.
    def completion(items: list[CalibrationRecord]) -> tuple[datetime, str]:
        latest = max(items, key=lambda x: x.scored_at)
        return (latest.scored_at, _campaign_of(latest))

    ordered = sorted(campaigns.values(), key=completion)

    total = len(records)
    target_holdout = max(1, round(total * holdout_fraction))

    # Peel the latest campaigns into the holdout until it reaches the target size. Whole campaigns
    # only — a campaign is never split, so it never straddles the boundary.
    holdout: list[CalibrationRecord] = []
    held_campaigns = 0
    for items in reversed(ordered):
        if len(holdout) >= target_holdout:
            break
        holdout.extend(items)
        held_campaigns += 1

    # Guard: keep at least one campaign in training so the split is a split, not a move.
    if held_campaigns >= len(ordered) and len(ordered) > 1:
        # The last-added (earliest of the held) campaign goes back to training.
        earliest_held = ordered[len(ordered) - held_campaigns]
        for r in earliest_held:
            holdout.remove(r)

    holdout_ids = {id(r) for r in holdout}
    train = [r for r in records if id(r) not in holdout_ids]

    # Time-order each side for stable, inspectable output.
    train.sort(key=lambda x: x.scored_at)
    holdout.sort(key=lambda x: x.scored_at)

    cutoff = holdout[0].scored_at if holdout else None
    return TemporalSplit(
        train=tuple(train),
        holdout=tuple(holdout),
        cutoff=cutoff,
        method="temporal",
    )
