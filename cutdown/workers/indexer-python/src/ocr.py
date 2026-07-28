"""OCR sub-stage — on-screen text with time ranges (REQ-013, decision D-19).

PaddleOCR reads *frames*; REQ-013 asks for *text that was on screen between two
instants*. Four decisions bridge that gap, and each is load-bearing:

1. **Keyframes, not every frame.** A 60-second clip at 30 fps is 1800 frames; a
   detection+recognition pass over each is minutes of CPU for an answer that
   barely changes within a shot. The `shots` sub-stage already chose one
   representative frame per shot (`Shot.keyframeTicks`, recorded precisely so
   this sub-stage is reproducible), so OCR samples exactly those. The cost is
   linear in shots rather than frames, and a caption that appears mid-shot is
   attributed to the whole shot rather than missed — an over-attribution the
   time range makes visible instead of hiding.

2. **The observation spans the shot, not the instant.** `startTicks`/`endTicks`
   are the originating shot's range, so "when was this caption up?" has an
   answer. A zero-length range at the keyframe would be literally true about the
   sample and useless about the video.

3. **Bounding boxes are normalized, never pixels.** PaddleOCR returns pixel
   polygons against the decoded frame. Phase 4's caption-safe-zone check compares
   boxes to a platform overlay expressed in fractions of the frame, and a pixel
   box is meaningless to it without also shipping the frame size. Normalizing
   here — against the DISPLAY dimensions, rotation already applied — makes the
   observation self-contained, which is exactly what the schema's `NormalizedRect`
   asks for.

4. **A frame with no text produces no observations.** Not an empty-string
   observation, not a zero-confidence placeholder. Downstream consumers count
   observations; a placeholder would make a blank frame indistinguishable from a
   caption nobody could read.

**Installed-engine facts (verified against paddleocr 3.7.0 / paddlepaddle 3.3.1,
not recalled).** The 3.x API is not the 2.x API:

- `PaddleOCR(...)` takes `lang=`, `ocr_version=`, and `text_*`-prefixed threshold
  arguments. The 2.x names (`det_db_thresh`, `use_angle_cls`, `rec_model_dir`, …)
  still parse but emit deprecation warnings and are mapped internally.
- `.ocr()` is deprecated; `.predict(input)` is the current call and returns a
  `list` of `paddlex.inference.pipelines.ocr.result.OCRResult` — one per input
  image, so a single frame yields a one-element list.
- `OCRResult` is dict-like. The fields used here are `rec_texts` (list[str]),
  `rec_scores` (list[float]) and `rec_polys` (list of four `[x, y]` pixel
  points). There is no 2.x-style `[[box, (text, score)], ...]` nesting.
- A frame with no text yields those keys **present and empty**, which is what
  makes the negative case cheap to honour.
- `enable_mkldnn=False` is REQUIRED on this machine. With oneDNN enabled the
  PP-OCRv5 detector aborts inside paddle with
  `NotImplementedError: (Unimplemented) ConvertPirAttribute2RuntimeAttribute not
  support [pir::ArrayAttribute<pir::DoubleAttribute>]`. It is recorded in the
  engine parameters rather than hidden, because it is a real inference-path
  choice that could change results if a future paddle build fixes the bug.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from harness import (
    ModelUnavailableError,
    SubStageContext,
    SubStageError,
    SubStageResult,
    run_sub_stage,
)
from ids import ordinal_id

# `shots` owns the timebase probe and the rational tick conversion. Importing
# them keeps ONE definition of "what ticks mean for this asset" — a second copy
# here would be free to drift, and a shot range and an OCR range that disagree
# about the timebase are silently wrong rather than loudly broken.
from shots import Timebase, VideoProbe, probe_video

ENGINE_NAME = "paddleocr"

#: Bumped when this module's post-processing (normalization, filtering, ID
#: assignment) changes in a way that alters output for unchanged input.
OCR_RULES_VERSION = "1.0.0"

#: Normalized coordinates are rounded before serialisation so the artefact bytes
#: are stable: 66/640 is not exactly representable, and an unrounded float would
#: make byte-identical re-runs hostage to libm. Six places is ~0.0006 px on a
#: 640-wide frame — far below any decision the value feeds.
_COORD_PLACES = 6

DEFAULT_OCR_CONFIG: dict[str, Any] = {
    "lang": "en",
    "ocr_version": "PP-OCRv5",
    # Chosen, not inherited: PaddleX ships `score_thresh: 0.0`, i.e. no floor at
    # all. Measured on the burned-in fixture, a clean caption scores 0.9998;
    # scores under ~0.6 are in practice partial or garbled reads off blurred or
    # low-contrast frames. REQ-013 text feeds search and the Phase 4 safe-zone
    # check, where a confidently wrong string costs more than a missing one — so
    # the floor is deliberately conservative. Tunable, and recorded in the
    # EngineRecord and the cache key so a change re-indexes rather than mixes.
    "confidence_floor": 0.60,
    # Detector thresholds, passed explicitly so they are recorded rather than
    # implied by whichever pipeline YAML the installed paddlex happens to ship.
    "text_det_thresh": 0.3,
    "text_det_box_thresh": 0.6,
    # All three preprocessing classifiers are off: this is short-form video, not
    # scanned documents. They cost a model download and inference each, and each
    # is another source of run-to-run variation for no gain on burned-in captions.
    "use_doc_orientation_classify": False,
    "use_doc_unwarping": False,
    "use_textline_orientation": False,
    "device": "cpu",
    # See the module docstring: True aborts the PP-OCRv5 detector on this build.
    "enable_mkldnn": False,
    # Single-threaded so a re-run reduces in the same order.
    "cpu_threads": 1,
}

#: Constructor arguments forwarded to PaddleOCR. Everything else in the config
#: (notably `confidence_floor`) is ours and is applied in this module.
_ENGINE_ARG_KEYS = (
    "lang",
    "ocr_version",
    "text_det_thresh",
    "text_det_box_thresh",
    "use_doc_orientation_classify",
    "use_doc_unwarping",
    "use_textline_orientation",
    "device",
    "enable_mkldnn",
    "cpu_threads",
)


@dataclass(frozen=True)
class ShotWindow:
    """One shot's time range plus the single frame OCR samples for it.

    Deliberately NOT the full `Shot` dict. The OCR logic needs four numbers, and
    depending on the whole shape would make every unit test here require a
    complete, schema-valid Shot — which is how pure logic ends up untestable
    without the sub-stage that produces it.
    """

    shot_id: str | None
    start_ticks: int
    end_ticks: int
    keyframe_ticks: int


@dataclass(frozen=True)
class TextDetection:
    """One recognised text region in FRAME PIXEL coordinates.

    The engine-neutral boundary: `detections_from_paddle_result` is the only
    function that knows PaddleOCR's shape, so every downstream rule — the
    confidence floor, normalization, ordering, ID assignment — is testable
    without importing paddle or downloading a model.
    """

    text: str
    confidence: float
    #: Four or more `(x, y)` pixel points. PaddleOCR returns a quadrilateral,
    #: which is not necessarily axis-aligned for rotated text.
    polygon: tuple[tuple[float, float], ...]


def shot_windows_from_shots(shots: list[dict[str, Any]]) -> list[ShotWindow]:
    """Adapt the `shots` artefact into the four numbers this sub-stage needs."""
    windows = []
    for shot in shots:
        try:
            window = ShotWindow(
                shot_id=shot["shotId"],
                start_ticks=int(shot["startTicks"]),
                end_ticks=int(shot["endTicks"]),
                keyframe_ticks=int(shot["keyframeTicks"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise SubStageError(
                code="SHOTS_ARTEFACT_INVALID",
                message=f"a shot is missing the fields OCR keyframing needs: {error}",
                details={"shot": {k: shot.get(k) for k in ("shotId", "startTicks", "endTicks", "keyframeTicks")}},
            ) from error
        if not window.start_ticks <= window.keyframe_ticks < window.end_ticks:
            raise SubStageError(
                code="SHOTS_ARTEFACT_INVALID",
                message=(
                    f"{window.shot_id} keyframe {window.keyframe_ticks} lies outside its own "
                    f"range [{window.start_ticks}, {window.end_ticks})"
                ),
            )
        windows.append(window)
    return sorted(windows, key=lambda w: (w.start_ticks, w.shot_id or ""))


def shot_windows_from_keyframe_ticks(keyframe_ticks: list[int], *, duration_ticks: int) -> list[ShotWindow]:
    """Windows from bare keyframe ticks, for when no shots artefact exists.

    Used by unit tests and by any caller running OCR standalone. Each keyframe
    owns the span from itself up to the next one (the last runs to the asset
    end), so the observations still carry a real time range and `shotId` is
    honestly `null` rather than a fabricated `shot-0001`.
    """
    ordered = sorted(set(int(t) for t in keyframe_ticks))
    if any(t < 0 or t >= duration_ticks for t in ordered):
        raise SubStageError(
            code="KEYFRAME_OUT_OF_RANGE",
            message=f"keyframe ticks must lie in [0, {duration_ticks}); got {ordered}",
        )
    bounds = [*ordered[1:], duration_ticks]
    return [
        ShotWindow(shot_id=None, start_ticks=tick, end_ticks=end, keyframe_ticks=tick)
        for tick, end in zip(ordered, bounds, strict=True)
    ]


def _clamp_unit(value: float) -> float:
    return 0.0 if value < 0.0 else 1.0 if value > 1.0 else value


def normalize_polygon(
    polygon: tuple[tuple[float, float], ...] | list[list[float]],
    frame_width: int,
    frame_height: int,
) -> dict[str, float]:
    """Pixel polygon -> `NormalizedRect` (0..1), as the axis-aligned bounds.

    The schema stores a rectangle, so a rotated quadrilateral is reduced to the
    box that contains it — over-inclusive rather than clipping real text off.
    Clamping happens on the EDGES before the extent is taken, not on the width
    afterwards: PaddleOCR's `unclip_ratio` routinely pushes a box a few pixels
    past the frame, and clamping only the width would leave `x + width > 1`,
    which describes a rectangle running off the frame.
    """
    if frame_width <= 0 or frame_height <= 0:
        raise SubStageError(
            code="FRAME_DIMENSIONS_INVALID",
            message=f"cannot normalize against a {frame_width}x{frame_height} frame",
        )
    points = [tuple(point) for point in polygon]
    if len(points) < 3:
        raise SubStageError(
            code="BOUNDING_BOX_INVALID",
            message=f"a text polygon needs at least 3 points, got {len(points)}",
        )

    xs = [_clamp_unit(float(x) / frame_width) for x, _ in points]
    ys = [_clamp_unit(float(y) / frame_height) for _, y in points]

    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    return {
        "x": round(left, _COORD_PLACES),
        "y": round(top, _COORD_PLACES),
        "width": round(right - left, _COORD_PLACES),
        "height": round(bottom - top, _COORD_PLACES),
    }


def detections_from_paddle_result(result: Any) -> list[TextDetection]:
    """Read one PaddleOCR 3.x `OCRResult` into engine-neutral detections.

    The single place that knows the 3.x result shape. A missing key or a length
    disagreement between the three parallel lists is raised, never patched by
    zipping to the shortest — a silent truncation would drop real text and leave
    the artefact looking complete.
    """
    try:
        texts = list(result["rec_texts"])
        scores = list(result["rec_scores"])
        polys = list(result["rec_polys"])
    except (KeyError, TypeError) as error:
        raise SubStageError(
            code="OCR_RESULT_UNRECOGNISED",
            message=(
                "PaddleOCR returned a result without rec_texts/rec_scores/rec_polys; "
                f"the installed API may have changed: {error}"
            ),
        ) from error

    if not len(texts) == len(scores) == len(polys):
        raise SubStageError(
            code="OCR_RESULT_UNRECOGNISED",
            message=(
                f"PaddleOCR returned {len(texts)} texts, {len(scores)} scores and "
                f"{len(polys)} polygons; they must correspond one-to-one"
            ),
        )

    detections = []
    for text, score, poly in zip(texts, scores, polys, strict=True):
        detections.append(
            TextDetection(
                text=str(text),
                confidence=_clamp_unit(float(score)),
                polygon=tuple((float(point[0]), float(point[1])) for point in poly),
            )
        )
    return detections


def build_observations(
    windowed: list[tuple[ShotWindow, list[TextDetection]]],
    *,
    timebase: Timebase,
    frame_width: int,
    frame_height: int,
    engine: dict[str, Any],
    confidence_floor: float,
) -> list[dict[str, Any]]:
    """Detections + their shot windows -> sorted, ID-assigned `OcrObservation`s.

    Ordering and identity are decided together on purpose. The contract asks for
    observations sorted by `startTicks` then `ocrId`, and for IDs to be stable
    ordinals — which is only consistent if the IDs are assigned *in* the sort
    order. So the list is first sorted by a natural key that owes nothing to the
    order PaddleOCR happened to emit regions in (time, then top-to-bottom,
    left-to-right, then text as the final tie-break), and `ocr-0001…` is assigned
    down that ordering. The result satisfies both requirements by construction.
    """
    kept: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    for window, detections in windowed:
        for detection in detections:
            text = detection.text.strip()
            # A blank frame must yield NOTHING. An empty-string observation would
            # be counted, searched and rendered as "there was text here".
            if not text:
                continue
            if detection.confidence < confidence_floor:
                continue

            box = normalize_polygon(detection.polygon, frame_width, frame_height)
            record = {
                "ocrId": "",  # assigned below, once the order is settled
                "startTicks": window.start_ticks,
                "endTicks": window.end_ticks,
                "timebase": timebase.to_dict(),
                "text": text,
                "confidence": round(detection.confidence, _COORD_PLACES),
                "boundingBox": box,
                "shotId": window.shot_id,
                "engine": engine,
            }
            kept.append(((window.start_ticks, box["y"], box["x"], text), record))

    kept.sort(key=lambda pair: pair[0])
    for index, (_, record) in enumerate(kept, start=1):
        record["ocrId"] = ordinal_id("ocr", index)
    return [record for _, record in kept]


def ocr_engine_record(config: dict[str, Any]) -> dict[str, Any]:
    """EngineRecord carrying EVERY parameter that can change the output.

    Includes `confidence_floor` — REQ-012's "every threshold recorded with the
    index" is not satisfied by recording only the thresholds the vendor owns.
    Sorted by key so the bytes do not depend on dict construction order.
    """
    import paddleocr

    recorded = {**config, "ocr_rules_version": OCR_RULES_VERSION}
    return {
        "name": ENGINE_NAME,
        "version": str(paddleocr.__version__),
        "parameters": [{"key": key, "value": _stringify(recorded[key])} for key in sorted(recorded)],
    }


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def load_ocr_engine(config: dict[str, Any]) -> Any:
    """Construct the PaddleOCR pipeline, or fail naming the model.

    First use downloads the detection and recognition weights. Offline, gated or
    corrupt-cache all surface here, and they must surface as
    `MODEL_UNAVAILABLE` naming the model: the run stays resumable and the other
    sub-stages still proceed (contract §6). The alternative — an empty OCR
    artefact — is a fabricated result that would then be cached as complete.
    """
    model = f"{ENGINE_NAME}/{config['ocr_version']}/{config['lang']}"
    try:
        from paddleocr import PaddleOCR
    except ImportError as error:
        raise ModelUnavailableError(
            model=model,
            message=f"paddleocr is not importable in this environment: {error}",
        ) from error

    kwargs = {key: config[key] for key in _ENGINE_ARG_KEYS if key in config}
    # Let the engine drop what our floor would drop anyway — the same value is
    # still applied in `build_observations`, so the floor holds even if a future
    # engine version reinterprets this argument.
    kwargs["text_rec_score_thresh"] = config["confidence_floor"]
    try:
        return PaddleOCR(**kwargs)
    except Exception as error:  # noqa: BLE001 — the model-load boundary is the point
        raise ModelUnavailableError(
            model=model,
            message=f"PaddleOCR weights could not be loaded or downloaded: {type(error).__name__}: {error}",
        ) from error


def ticks_to_milliseconds(ticks: int, timebase: Timebase) -> float:
    """Exact rational tick -> millisecond position, converted once at the seek.

    `Fraction` throughout so the multiplication never rounds; the float appears
    only in the last step, because OpenCV's seek API takes one. Never
    `ticks / fps` — a VFR source has no single fps to divide by.
    """
    return float(Fraction(int(ticks) * timebase.num * 1000, timebase.den))


def extract_keyframes(media_path: Path, windows: list[ShotWindow], probe: VideoProbe) -> list[Any]:
    """Decode one frame per shot window, seeking by timebase-derived position.

    One capture opened for the whole list and seeked forward, rather than
    reopening per keyframe. `CAP_PROP_ORIENTATION_AUTO` is set explicitly so a
    rotated source is decoded at its DISPLAY dimensions — the schema normalizes
    bounding boxes against display, not storage, so a 90-degree phone clip would
    otherwise have every box transposed.
    """
    import cv2

    capture = cv2.VideoCapture(str(media_path))
    if not capture.isOpened():
        raise SubStageError(
            code="KEYFRAME_DECODE_FAILED",
            message=f"{media_path.name} could not be opened for keyframe extraction",
        )
    try:
        capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        frames = []
        for window in windows:
            capture.set(cv2.CAP_PROP_POS_MSEC, ticks_to_milliseconds(window.keyframe_ticks, probe.timebase))
            ok, frame = capture.read()
            if not ok or frame is None:
                raise SubStageError(
                    code="KEYFRAME_DECODE_FAILED",
                    message=(
                        f"no frame decoded at tick {window.keyframe_ticks} of {media_path.name} "
                        f"(shot {window.shot_id})"
                    ),
                )
            frames.append(frame)
        return frames
    finally:
        capture.release()


def _predict_one(engine: Any, frame: Any) -> Any:
    """`.predict()` on a single frame; 3.x returns a one-element list."""
    try:
        results = engine.predict(frame)
    except Exception as error:  # noqa: BLE001 — inference failure must be structured
        raise SubStageError(
            code="OCR_INFERENCE_FAILED",
            message=f"PaddleOCR inference failed: {type(error).__name__}: {error}",
        ) from error
    if not results:
        raise SubStageError(
            code="OCR_RESULT_UNRECOGNISED",
            message="PaddleOCR.predict returned no result for a frame",
        )
    return results[0]


def compute_ocr(
    media_path: Path,
    *,
    shots: list[dict[str, Any]] | None = None,
    keyframe_ticks: list[int] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The sub-stage body: probe, window, extract, recognise, normalize, order.

    Takes the `shots` artefact when there is one — that is the real pipeline —
    and falls back to bare `keyframe_ticks` when OCR is run standalone.
    """
    resolved = {**DEFAULT_OCR_CONFIG, **(config or {})}
    # Input validation before the ffprobe spawn: a caller that supplied neither
    # input has made a programming error, and it should read as one (exit 2)
    # rather than as whatever the probe happens to say about the media.
    if shots is None and keyframe_ticks is None:
        raise SubStageError(
            code="OCR_INPUT_MISSING",
            message="OCR needs either a shots artefact or an explicit list of keyframe ticks",
            exit_code=2,
        )

    probe = probe_video(media_path)
    windows = (
        shot_windows_from_shots(shots)
        if shots is not None
        else shot_windows_from_keyframe_ticks(keyframe_ticks or [], duration_ticks=probe.duration_ticks)
    )

    engine_record = ocr_engine_record(resolved)
    if not windows:
        return {"ocr": []}

    frames = extract_keyframes(media_path, windows, probe)
    height, width = frames[0].shape[:2]

    engine = load_ocr_engine(resolved)
    windowed = [
        (window, detections_from_paddle_result(_predict_one(engine, frame)))
        for window, frame in zip(windows, frames, strict=True)
    ]

    return {
        "ocr": build_observations(
            windowed,
            timebase=probe.timebase,
            frame_width=width,
            frame_height=height,
            engine=engine_record,
            confidence_floor=float(resolved["confidence_floor"]),
        )
    }


def run_ocr_sub_stage(
    ctx: SubStageContext,
    media_path: Path,
    *,
    shots: list[dict[str, Any]] | None = None,
    keyframe_ticks: list[int] | None = None,
    config: dict[str, Any] | None = None,
    force: bool = False,
) -> SubStageResult:
    """`ocr` as an independently resumable sub-stage (tech-spec §6.5).

    The whole resolved config is the `model_config`, so the language, the model
    version and the confidence floor all sit in the REQ-005 cache key. Lowering
    the floor must re-run OCR rather than serve an artefact filtered under the
    old one.
    """
    resolved = {**DEFAULT_OCR_CONFIG, **(config or {})}
    return run_sub_stage(
        ctx,
        "ocr",
        lambda: compute_ocr(media_path, shots=shots, keyframe_ticks=keyframe_ticks, config=resolved),
        model_config=resolved,
        force=force,
    )
