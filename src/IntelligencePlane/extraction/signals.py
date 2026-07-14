"""First-frame, disclosure, and authenticity signals (P2-T6).

``authenticity_signals`` operationalises the friction-over-polish register — handheld motion,
ambient audio, filler-word rate, natural lighting — captured as first-class features *precisely
because* a production-quality-biased scorer would penalise them. Disclosure signals feed V1/V5 in
Phase 1; their emptiness is only meaningful when the owning record's ``onscreen_text_complete`` is
True.
"""

from __future__ import annotations

from extraction.model import (
    AuthenticitySignals,
    DisclosureSignals,
    FirstFrameFeatures,
)
from extraction.ports import SignalResult

__all__ = ["authenticity_signals", "disclosure_signals", "first_frame_features"]


def first_frame_features(signal: SignalResult) -> FirstFrameFeatures:
    return FirstFrameFeatures(
        face_present=signal.face_present,
        face_scale=signal.face_scale,
        composition=signal.composition,
        clutter_index=signal.clutter_index,
    )


def disclosure_signals(signal: SignalResult) -> DisclosureSignals:
    return DisclosureSignals(
        onscreen_tag=tuple(signal.onscreen_disclosure_tags),
        caption_tag=tuple(signal.caption_disclosure_tags),
        spoken_disclosure_ts_ms=signal.spoken_disclosure_ts_ms,
    )


def authenticity_signals(signal: SignalResult, *, audio_present: bool) -> AuthenticitySignals:
    """Build the authenticity signals, stamping the audio-completeness marker.

    ``audio_signals_complete`` is the AND of ``audio_present`` (there *was* an audio track) and
    ``signal.audio_signals_complete`` (the analysis actually ran and produced something). The
    pipeline owns ``audio_present``, so an extractor cannot assert completeness the media does not
    support — a ``filler_word_rate`` of ``0.0`` from an audio-absent clip carries the mark that
    says "unmeasured", never "no filler words".
    """
    return AuthenticitySignals(
        handheld_motion=signal.handheld_motion,
        ambient_audio=signal.ambient_audio,
        filler_word_rate=signal.filler_word_rate,
        lighting_kind=signal.lighting_kind,
        audio_signals_complete=audio_present and signal.audio_signals_complete,
    )
