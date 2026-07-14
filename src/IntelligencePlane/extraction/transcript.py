"""Transcript: native captions first, Whisper fallback, source recorded (P2-T5).

*"Running Whisper on every submission"* is the anti-pattern — a cost and performance decision as
much as a quality one. Native captions come first; Whisper runs only when captions are absent and
audio is present. Which source produced the transcript is recorded, because a Whisper transcript
of a noisy handheld clip has a different error profile than platform captions.

The transcript payload is :class:`Untrusted` — a caption can carry a prompt injection, and only
``fence()`` may place it in a model prompt.
"""

from __future__ import annotations

from dataclasses import dataclass

from extraction.model import TranscriptSource
from extraction.ports import AcquiredMedia, ITranscriber
from extraction.untrusted import Untrusted

__all__ = ["TranscriptOutcome", "transcribe"]


@dataclass(frozen=True, slots=True)
class TranscriptOutcome:
    text: Untrusted[str]
    source: TranscriptSource


def transcribe(
    media: AcquiredMedia, transcriber: ITranscriber, *, audio_present: bool
) -> TranscriptOutcome:
    """Return the transcript and which source produced it.

    Order: native captions, then Whisper (only if ``audio_present``). If neither yields text —
    captions absent and Whisper down, or no audio at all — the source is ``none`` and the payload
    is empty. That is recorded honestly, not hidden; downstream degradation flags follow from it.
    """
    native = transcriber.native_captions(media)
    if native is not None:
        return TranscriptOutcome(Untrusted(native), TranscriptSource.NATIVE_CAPTIONS)

    if audio_present:
        whisper = transcriber.whisper(media)
        if whisper is not None:
            return TranscriptOutcome(Untrusted(whisper), TranscriptSource.WHISPER)

    return TranscriptOutcome(Untrusted(""), TranscriptSource.NONE)
