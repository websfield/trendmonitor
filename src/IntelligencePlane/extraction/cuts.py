"""Scene-change detection -> cut cadence, with a confidence band (P2-T6).

*"Pacing scored from five static frames is not pacing."* Pacing is scored from
``cut_cadence_per_sec``, derived from real scene-change timestamps. Scene detection on compressed
vertical mobile video is a named open question, so the cadence carries a :class:`ConfidenceBand`;
where it is ``LOW``, pacing's weight is surfaced as unreliable rather than silently scored from
noise. When detection is unsupported the cadence is still computed from whatever cuts were
reported (never a fabricated 0.0 — that would itself be imputation) but its confidence is forced
to ``LOW``, so a downstream scorer knows the number is not to be trusted.
"""

from __future__ import annotations

from dataclasses import dataclass

from extraction.model import ConfidenceBand
from extraction.ports import AcquiredMedia, ISceneDetector, SceneResult

__all__ = ["CutCadence", "cut_cadence", "detect_cuts"]


@dataclass(frozen=True, slots=True)
class CutCadence:
    cut_timestamps_ms: tuple[int, ...]
    cadence_per_sec: float
    confidence: ConfidenceBand


def detect_cuts(
    media: AcquiredMedia, detector: ISceneDetector, *, duration_ms: int
) -> SceneResult:
    return detector.detect(media, duration_ms)


def cut_cadence(scene: SceneResult, *, duration_ms: int) -> CutCadence:
    """Cuts per second over the media's true duration.

    When scene detection is unsupported, confidence is forced to ``LOW`` regardless of what the
    detector reported — an unreliable detector does not get to assert its own reliability.
    """
    seconds = duration_ms / 1000.0
    cadence = len(scene.cut_timestamps_ms) / seconds if seconds > 0 else 0.0
    confidence = scene.confidence if scene.supported else ConfidenceBand.LOW
    return CutCadence(
        cut_timestamps_ms=tuple(scene.cut_timestamps_ms),
        cadence_per_sec=cadence,
        confidence=confidence,
    )
