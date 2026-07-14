"""OCR frames -> on-screen text, with a 3-band contrast and a safe-zone check (P2-T6).

Contrast is scored in **three coarse bands**, never a float — the tech spec says a precise claim
will not survive, and a spurious-precision contrast measure invites a spurious-precision veto.

The load-bearing rule: **a missing OCR result is not "no text present".** When OCR fails on a
frame, that frame contributes no ``onscreen_text`` *and* ``onscreen_text_complete`` goes False.
A disclosure veto (V1) cannot pass on that absence — a disclosure that passes because OCR silently
failed is the exact P1 this system exists to prevent.
"""

from __future__ import annotations

from dataclasses import dataclass

from extraction.model import OnscreenText
from extraction.ports import AcquiredMedia, IOcr
from extraction.untrusted import Untrusted

__all__ = ["OcrOutcome", "run_ocr"]


@dataclass(frozen=True, slots=True)
class OcrOutcome:
    onscreen_text: tuple[OnscreenText, ...]
    complete: bool


def run_ocr(
    media: AcquiredMedia, frame_timestamps: tuple[int, ...], ocr: IOcr
) -> OcrOutcome:
    """OCR each frame. ``complete`` is True only if *every* frame's OCR succeeded.

    A single failed frame flips ``complete`` to False so that downstream code treats the on-screen
    text set as *incomplete*, never as evidence of absence. Successful frames still contribute
    their hits — the failure narrows what we can certify, it does not discard what we saw.
    """
    hits: list[OnscreenText] = []
    complete = True
    for ts in frame_timestamps:
        result = ocr.ocr_frame(media, ts)
        if not result.succeeded:
            complete = False
            continue
        for hit in result.hits:
            hits.append(
                OnscreenText(
                    ts_ms=result.ts_ms,
                    text=Untrusted(hit.text),
                    bbox=hit.bbox,
                    contrast_band=hit.contrast_band,
                    in_safe_zone=hit.in_safe_zone,
                )
            )
    return OcrOutcome(onscreen_text=tuple(hits), complete=complete)
