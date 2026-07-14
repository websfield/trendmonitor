"""Frame sampling (P2-T4): the true first frame and >= 3 frames inside the hook window.

*"Five evenly-spaced frames across a 47-second video samples the hook exactly once, and the hook
carries 20% of VPS weight and the entire hard gate."* So the sampler is dense at the front: the
true first frame at ``ts=0`` plus interior frames across ``hook_window_ms``, then scene-aware (or
evenly-spaced) coverage across the tail.

``plan_frame_timestamps`` is pure and is where the guarantee is tested; :func:`extract_frames`
renders each planned timestamp through :class:`IFrameExtractor`.
"""

from __future__ import annotations

from extraction.model import Frame
from extraction.ports import AcquiredMedia, IFrameExtractor

__all__ = [
    "DEFAULT_HOOK_WINDOW_MS",
    "MIN_HOOK_FRAMES",
    "extract_frames",
    "plan_frame_timestamps",
]

DEFAULT_HOOK_WINDOW_MS = 2000
MIN_HOOK_FRAMES = 3
_DEFAULT_TAIL_STRIDE_MS = 2000


def clamp_hook_window(hook_window_ms: int, duration_ms: int) -> int:
    """A video shorter than the hook window clamps the window to its duration, and that is
    recorded on the record. Never a hook window longer than the media."""
    return min(hook_window_ms, duration_ms)


def plan_frame_timestamps(
    duration_ms: int,
    hook_window_ms: int,
    scene_cuts: tuple[int, ...] = (),
    *,
    min_hook_frames: int = MIN_HOOK_FRAMES,
    tail_stride_ms: int = _DEFAULT_TAIL_STRIDE_MS,
) -> tuple[int, ...]:
    """Return the sorted, unique timestamps to sample. ``ts=0`` (the true first frame) is always
    present, and at least ``min_hook_frames`` timestamps fall strictly inside the hook window.

    The hook window is clamped to the duration first, so a clip shorter than the window still gets
    dense front coverage across everything it has.
    """
    if duration_ms <= 0:
        return (0,)

    effective_hook_window = clamp_hook_window(hook_window_ms, duration_ms)
    timestamps: set[int] = {0}  # the true first frame

    # Interior hook frames: (min_hook_frames + 1) evenly-spaced points across [0, hook_window),
    # so at least `min_hook_frames` land strictly inside the window even after the {0} de-dup.
    divisions = min_hook_frames + 1
    for k in range(divisions):
        ts = round(k * effective_hook_window / divisions)
        if ts < effective_hook_window:
            timestamps.add(ts)

    # Tail coverage: scene cuts where detection is reliable, else evenly-spaced stride.
    for cut in scene_cuts:
        if 0 <= cut < duration_ms:
            timestamps.add(int(cut))
    ts = effective_hook_window
    while ts < duration_ms:
        timestamps.add(int(ts))
        ts += tail_stride_ms

    return tuple(sorted(timestamps))


def extract_frames(
    media: AcquiredMedia,
    timestamps: tuple[int, ...],
    extractor: IFrameExtractor,
) -> tuple[Frame, ...]:
    """Render each planned timestamp to a blob. The lowest timestamp is the true first frame."""
    if not timestamps:
        return ()
    first_ts = min(timestamps)
    return tuple(
        Frame(
            ts_ms=ts,
            blob_uri=extractor.extract_frame(media, ts),
            is_first_frame=(ts == first_ts),
        )
        for ts in timestamps
    )
