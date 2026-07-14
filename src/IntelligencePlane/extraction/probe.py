"""Probe with ``ffprobe`` and compute the REQ-018 degradation flags (P2-T3).

``audio_present=False`` is the trigger REQ-018 names: every audio-dependent criterion — hook
strength, emotional specificity, completion likelihood — is flagged ``degraded`` and its
confidence band widened. A *missing usable transcript* degrades them too (a Whisper-down clip
scores from frames alone). Crucially, **the hook hard gate still applies**: degradation widens the
band, it never waives the gate — a degraded low hook score is still a low hook score.

An unsupported codec yields no record (the reason is recorded); this module raises so the pipeline
declines to persist a partial record.
"""

from __future__ import annotations

from extraction.model import (
    AudioDependentCriterion,
    DegradationFlag,
    TranscriptSource,
)
from extraction.ports import AcquiredMedia, IMediaProbe, ProbeResult

__all__ = [
    "AUDIO_DEPENDENT_CRITERIA",
    "DEGRADED_BAND_WIDEN_FACTOR",
    "HARD_GATE_CRITERIA",
    "UnsupportedCodecError",
    "compute_degradation",
    "probe_media",
]

# The three criteria that read audio (REQ-018).
AUDIO_DEPENDENT_CRITERIA = (
    AudioDependentCriterion.HOOK_STRENGTH,
    AudioDependentCriterion.EMOTIONAL_SPECIFICITY,
    AudioDependentCriterion.COMPLETION_LIKELIHOOD,
)

# Hook strength carries the hard gate; degradation must not waive it.
HARD_GATE_CRITERIA = frozenset({AudioDependentCriterion.HOOK_STRENGTH})

# When degraded, widen the confidence band. > 1.0 so REQ-018's "band widens" is enforced.
DEGRADED_BAND_WIDEN_FACTOR = 2.0


class UnsupportedCodecError(RuntimeError):
    """``ffprobe`` reported an unsupported codec. No record is produced; reason recorded."""


def probe_media(media: AcquiredMedia, probe: IMediaProbe) -> ProbeResult:
    """Run ``ffprobe``. Raise on an unsupported codec so no partial record is persisted."""
    result = probe.probe(media)
    if not result.codec_supported:
        raise UnsupportedCodecError(
            f"Unsupported codec for {media.uri!r}: {result.reason or 'no reason reported'}. "
            "No FeatureRecord is produced — never a default record."
        )
    return result


def compute_degradation(
    *, audio_present: bool, transcript_source: TranscriptSource
) -> tuple[DegradationFlag, ...]:
    """Flag the three audio-dependent criteria when audio or a usable transcript is missing.

    Returns a flag for *every* audio-dependent criterion, degraded or not, so a consumer never has
    to infer degradation from the *absence* of a flag. The hook flag always carries
    ``is_hard_gate=True`` — degraded or not, the gate stands.
    """
    no_audio = not audio_present
    no_transcript = transcript_source is TranscriptSource.NONE
    degraded = no_audio or no_transcript

    if no_audio:
        reason = "no_audio_track"
    elif no_transcript:
        reason = "no_transcript"
    else:
        reason = ""

    flags: list[DegradationFlag] = []
    for criterion in AUDIO_DEPENDENT_CRITERIA:
        flags.append(
            DegradationFlag(
                criterion=criterion,
                degraded=degraded,
                reason=reason,
                band_widen_factor=DEGRADED_BAND_WIDEN_FACTOR if degraded else 1.0,
                is_hard_gate=criterion in HARD_GATE_CRITERIA,
            )
        )
    return tuple(flags)
