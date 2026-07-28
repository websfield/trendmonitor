"""P7-T8 — the coverage reporter.

A feed showing six Reddit trends and no TikTok trends *without comment* reads as a claim that
nothing is happening on TikTok. That is the most likely way this component quietly misleads
someone. So a coverage gap is **stated, never implied by an empty list**: every tracked platform
gets a row, and a platform with no live signal and no live source carries an explicit
``coverage_gap`` note saying why.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from c1_pattern_engine.detector.signals import TrendSignal

__all__ = ["PlatformCoverage", "coverage_report"]


@dataclass(frozen=True, slots=True)
class PlatformCoverage:
    """One row per tracked platform. Present even when everything about it is zero."""

    platform: str
    automated_signals: int
    human_sourced_signals: int
    open_submissions: int
    live_sources: tuple[str, ...]
    coverage_gap: bool
    note: str


def coverage_report(
    tracked_platforms: Sequence[str],
    *,
    signals: Iterable[TrendSignal],
    open_submissions_by_platform: dict[str, int] | None = None,
    live_sources_by_platform: dict[str, tuple[str, ...]] | None = None,
) -> list[PlatformCoverage]:
    """Build one :class:`PlatformCoverage` row for **every** tracked platform.

    ``tracked_platforms`` is the authority for which platforms exist — a platform with no signals
    still appears, so its silence is a stated fact rather than an inferred absence. A platform is a
    coverage gap when it has no live signal and no live source feeding it.
    """
    open_by = open_submissions_by_platform or {}
    sources_by = live_sources_by_platform or {}

    live = [s for s in signals if not s.is_archived]
    auto_by: dict[str, int] = {}
    human_by: dict[str, int] = {}
    for s in live:
        # Split on the detection-ORIGIN label, never the confidence rung (Phase 9 R3): an
        # automated-detected signal a human predated is upgraded to `human_corroborated` confidence
        # but is still automated-sourced coverage. Keying on confidence would silently reclassify
        # it as human-sourced and understate automated reach — origin and confidence are separate
        # axes (the conflation Phase 4 R3 fixed for resolved samples).
        if s.detection_origin == "human_sourced":
            human_by[s.platform] = human_by.get(s.platform, 0) + 1
        else:
            auto_by[s.platform] = auto_by.get(s.platform, 0) + 1

    rows: list[PlatformCoverage] = []
    for platform in tracked_platforms:
        automated = auto_by.get(platform, 0)
        human = human_by.get(platform, 0)
        open_subs = open_by.get(platform, 0)
        sources = sources_by.get(platform, ())
        gap = automated == 0 and human == 0 and len(sources) == 0
        # An OPEN submission is a candidate awaiting resolution, not an observation, so it does not
        # close a gap — but it is named in both notes, because "a human is already watching here"
        # changes what the reader should do about the gap.
        watching = f" {open_subs} open submission(s) awaiting resolution." if open_subs else ""
        if gap:
            note = (
                f"COVERAGE GAP: no live signal and no live source on {platform}. "
                "This is a gap in observation, not evidence that nothing is happening here."
                + watching
            )
        else:
            note = (
                f"{automated} automated + {human} human-sourced signal(s), "
                f"{len(sources)} live source(s)." + watching
            )
        rows.append(
            PlatformCoverage(
                platform=platform,
                automated_signals=automated,
                human_sourced_signals=human,
                open_submissions=open_subs,
                live_sources=tuple(sources),
                coverage_gap=gap,
                note=note,
            )
        )
    return rows
