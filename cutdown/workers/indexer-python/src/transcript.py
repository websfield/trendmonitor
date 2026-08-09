"""Transcript + speaker-turn sub-stage of the `index` skill (Phase 2 task 2).

REQ-010 (word- and segment-level transcript) and REQ-011 at its Phase-0 subset
(decisions.md D-17: real diarisation is DEFERRED, so REQ-011 is satisfied by
segment-level speaker *turns* plus manual naming with low-confidence marking).

Four things in here are load-bearing and easy to get subtly wrong:

1. **`verbatimText` and `displayText` are separate fields, always.** The
   deterministic quotation gate tokenises the *verbatim* side. If the cleaned
   caption were allowed to overwrite the verbatim record, a tidy-up pass could
   launder a misquote past that gate and nothing downstream would notice. At
   Phase 0 `displayText` is a whitespace/punctuation tidy only —
   `normalise_display_text` re-derives the word-token sequence and falls back to
   the untouched text if its own edit changed a single word, so "never reorders,
   never drops" is enforced in code rather than promised in a comment.

2. **Ticks, never float seconds.** Audio uses `{num: 1, den: 16000}` — the rate
   faster-whisper resamples to — so a tick IS an audio sample. Floats are
   converted exactly once, at the engine boundary, in `seconds_to_ticks`.

3. **D-28's 0.6 threshold is recorded, not just applied.** It lives in the
   EngineRecord parameters and in the sub-stage `model_config` (so it is part of
   the REQ-005 cache key): lowering it later must invalidate prior artefacts,
   because the same audio then yields differently-flagged words.

4. **A silent clip is an EMPTY transcript, not a failure and not a fabrication.**
   `broll-silent.mp4` must produce `segments: []` and `speakerTurns: []` with a
   valid language field. Whisper will happily hallucinate speech from silence, so
   the VAD pre-filter is on by default and empty segments are dropped.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from harness import (
    EXIT_INPUT_VALIDATION,
    ModelUnavailableError,
    SubStageContext,
    SubStageError,
    SubStageResult,
    run_sub_stage,
)

ENGINE_NAME = "faster-whisper"

#: faster-whisper resamples everything to 16 kHz internally, so a tick is an
#: audio sample and the conversion below is exact rather than a rounding of a
#: rounding.
AUDIO_SAMPLE_RATE = 16_000
AUDIO_TIMEBASE: dict[str, int] = {"num": 1, "den": AUDIO_SAMPLE_RATE}

#: D-28: "Flag ASR confidence < 0.6 ... for reviewer attention; no automated
#: caption pass/fail yet." This DIRECTS a human reviewer, it does not gate.
LOW_CONFIDENCE_THRESHOLD = 0.6

#: A pause at or above this length is taken as a turn boundary. Chosen at the
#: long end of a within-sentence breath (~0.2-0.5 s) and the short end of a
#: hand-off between speakers, so ordinary sentence pacing does not shatter a
#: monologue into dozens of "turns". It is a heuristic, and its output is marked
#: low-confidence accordingly.
SPEAKER_TURN_SILENCE_GAP_SECONDS = 0.75

#: Every Phase-0 turn confidence is held BELOW `LOW_CONFIDENCE_THRESHOLD` on
#: purpose. A silence-gap heuristic over ASR segment boundaries is not
#: diarisation (D-17 defers that), so no turn may ever present itself as
#: confidently attributed. The ceiling is what makes `lowConfidence` honest
#: instead of decorative.
TURN_CONFIDENCE_CEILING = 0.5
TURN_CONFIDENCE_FLOOR = 0.25

_LANGUAGE_PATTERN = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")
_WHITESPACE = re.compile(r"\s+")
#: Word tokens for the "did my tidy-up change the words?" guard. Unicode-aware:
#: `[^\W_]` is "alphanumeric, not underscore" under the default re flags.
_WORD_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
_SENTENCE_ENDERS = ".!?…"
#: Capitalised in every position, never a name. See `is_proper_noun_candidate`.
_FIRST_PERSON_PRONOUNS = frozenset({"I", "I'm", "I'll", "I've", "I'd"})
_TRIM_PUNCTUATION = " \t\"'“”‘’„()[]{}<>«».,;:!?…-—–"


@dataclass(frozen=True)
class TranscriptOptions:
    """Every knob that changes the output, and therefore the cache key.

    D-17 names `large-v3` on GPU / `distil-large-v3` int8 on CPU as the product
    default; `model_size` stays configurable so tests can run `tiny` in seconds
    instead of downloading a multi-gigabyte model.
    """

    model_size: str = "distil-large-v3"
    device: str = "cpu"
    compute_type: str = "int8"
    #: D-17 fixes language=en. `None` would ask whisper to detect, which makes
    #: the output depend on the first 30 s of audio — declared, not detected.
    language: str | None = "en"
    beam_size: int = 5
    #: Whisper's own silero pre-filter. On by default because without it a silent
    #: clip does not come back empty, it comes back hallucinated.
    vad_filter: bool = True
    low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD
    silence_gap_seconds: float = SPEAKER_TURN_SILENCE_GAP_SECONDS
    download_root: str | None = None
    local_files_only: bool = False


@dataclass(frozen=True)
class RawWord:
    """One engine word, still in float seconds. The boundary type."""

    start: float
    end: float
    text: str
    probability: float


@dataclass(frozen=True)
class RawSegment:
    """One engine segment, still in float seconds. The boundary type."""

    start: float
    end: float
    text: str
    #: Whisper reports mean token log-probability; `segment_confidence` maps it.
    avg_logprob: float
    words: tuple[RawWord, ...]


# --------------------------------------------------------------------------
# Pure logic. No model, no I/O — these are the tests that must always run.
# --------------------------------------------------------------------------


def seconds_to_ticks(seconds: float, timebase: dict[str, int] | None = None) -> int:
    """Convert at the engine boundary, exactly once, and never look back.

    Negative engine timestamps are clamped to 0 rather than propagated: the
    schema requires `startTicks >= 0`, and whisper occasionally emits a very
    small negative start for the first word of a clip.
    """
    base = timebase or AUDIO_TIMEBASE
    if not math.isfinite(seconds):
        raise SubStageError(
            code="TRANSCRIPT_INVALID_TIMESTAMP",
            message=f"engine reported a non-finite timestamp: {seconds!r}",
        )
    ticks = round(seconds * base["den"] / base["num"])
    return max(0, int(ticks))


def is_low_confidence(confidence: float, threshold: float = LOW_CONFIDENCE_THRESHOLD) -> bool:
    """D-28: strictly below the threshold. A word at exactly 0.6 is not flagged."""
    return confidence < threshold


def _trim(token: str) -> str:
    return token.strip(_TRIM_PUNCTUATION)


def is_sentence_opener(previous_verbatim: str | None) -> bool:
    """True for the first word of a segment, or the word after `.`/`!`/`?`.

    Sentence-initial capitalisation carries no information about proper nouns,
    which is exactly why the heuristic has to know where sentences begin.
    """
    if previous_verbatim is None:
        return True
    trimmed = previous_verbatim.strip().rstrip("\"'”’)]}")
    return bool(trimmed) and trimmed[-1] in _SENTENCE_ENDERS


def is_proper_noun_candidate(verbatim: str, *, sentence_opener: bool) -> bool:
    """A cheap, deterministic "probably a name" flag (D-28).

    Deliberately a heuristic, not a classifier: a capitalised token *mid*
    sentence. It over-flags (brand names, emphatic capitals) and that is the
    intended failure direction — a false flag costs a reviewer one glance, a
    missed one ships a misspelt name in a client's caption.
    """
    token = _trim(verbatim)
    if not token or sentence_opener:
        return False
    first = token[0]
    if not first.isalpha() or not first.isupper():
        return False
    # The English first-person pronoun is capitalised everywhere and is never a
    # name; flagging it would put a candidate on a large fraction of all clips
    # and train reviewers to ignore the flag. Enumerated rather than matched on
    # the "I'" prefix, so a genuine name like "I'Anson" is still flagged.
    return token not in _FIRST_PERSON_PRONOUNS


def word_tokens(text: str) -> list[str]:
    """The word sequence `normalise_display_text` is forbidden to change."""
    return _WORD_TOKEN.findall(text)


def normalise_display_text(verbatim: str) -> str:
    """Light, reversible-in-meaning tidy of ASR output for reading.

    Collapses runs of whitespace and removes the space ASR leaves before
    punctuation and inside brackets. It may NOT reorder or drop words, so the
    result is checked against the input's word-token sequence and discarded in
    favour of a whitespace-only tidy if it differs. A cleaned caption that can
    change what was said is precisely the failure `verbatimText` exists to
    prevent.
    """
    whitespace_only = _WHITESPACE.sub(" ", verbatim).strip()
    cleaned = re.sub(r"\s+([,.;:!?…])", r"\1", whitespace_only)
    cleaned = re.sub(r"([(\[{])\s+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([)\]}])", r"\1", cleaned)
    if word_tokens(cleaned) != word_tokens(verbatim):
        return whitespace_only
    return cleaned


def segment_confidence(avg_logprob: float) -> float:
    """Whisper's mean token log-probability, mapped into the schema's [0, 1].

    `exp(avg_logprob)` is the geometric mean token probability — the natural
    reading of the quantity whisper actually reports. Clamped because a
    log-probability marginally above 0 is arithmetic noise, not >100% certainty.
    """
    if not math.isfinite(avg_logprob):
        return 0.0
    return _clamp(math.exp(avg_logprob))


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, float(value)))


def build_words(raw_words: tuple[RawWord, ...], threshold: float) -> list[dict[str, Any]]:
    """Word records, with D-28's two reviewer-attention flags applied."""
    words: list[dict[str, Any]] = []
    previous: str | None = None
    for raw in raw_words:
        verbatim = raw.text.strip()
        if not verbatim:
            # `verbatim` has minLength 1; a whitespace-only token is engine noise
            # and must not become a schema-invalid word.
            continue
        confidence = _clamp(raw.probability)
        words.append(
            {
                "startTicks": seconds_to_ticks(raw.start),
                "endTicks": seconds_to_ticks(raw.end),
                "timebase": dict(AUDIO_TIMEBASE),
                "verbatim": verbatim,
                "confidence": confidence,
                "lowConfidence": is_low_confidence(confidence, threshold),
                "properNounCandidate": is_proper_noun_candidate(
                    verbatim, sentence_opener=is_sentence_opener(previous)
                ),
            }
        )
        previous = verbatim
    return words


def derive_speaker_turns(
    raw_segments: tuple[RawSegment, ...],
    *,
    silence_gap_seconds: float = SPEAKER_TURN_SILENCE_GAP_SECONDS,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Group consecutive segments into turns, split on silence (REQ-011, D-17).

    Returns `(turns, turn_id_per_segment)` so every TranscriptSegment can carry
    its `speakerTurnId` — a turn nothing points at is unusable to a reviewer.

    `inferredLabel` is POSITIONAL (`speaker_1`, `speaker_2`, ...) and indexed by
    turn ordinal, never by a claim that turn 3 is the same person as turn 1.
    Without diarisation we cannot know that, and a label that implies it would be
    an identity claim the system cannot support.
    """
    if not raw_segments:
        return [], []

    turns: list[dict[str, Any]] = []
    turn_id_by_segment: list[str] = []
    current: list[RawSegment] = []

    def flush(gap_before: float | None) -> None:
        if not current:
            return
        ordinal = len(turns) + 1
        turn_id = f"turn-{ordinal:04d}"
        confidence = turn_confidence(gap_before, silence_gap_seconds)
        turns.append(
            {
                "turnId": turn_id,
                "startTicks": seconds_to_ticks(current[0].start),
                "endTicks": seconds_to_ticks(current[-1].end),
                "timebase": dict(AUDIO_TIMEBASE),
                "inferredLabel": f"speaker_{ordinal}",
                "inferredConfidence": confidence,
                "lowConfidence": is_low_confidence(confidence),
                "correction": None,
            }
        )
        turn_id_by_segment.extend([turn_id] * len(current))

    previous_gap: float | None = None
    for segment in raw_segments:
        if current:
            gap = segment.start - current[-1].end
            if gap >= silence_gap_seconds:
                flush(previous_gap)
                previous_gap = gap
                current = []
        current.append(segment)
    flush(previous_gap)

    return turns, turn_id_by_segment


def turn_confidence(gap_before: float | None, silence_gap_seconds: float) -> float:
    """How much evidence there is that a turn boundary is real.

    The first turn has no preceding gap, so it gets the floor. Later turns scale
    with how much longer than the threshold their preceding silence was, and the
    whole range is capped below `LOW_CONFIDENCE_THRESHOLD` — see
    `TURN_CONFIDENCE_CEILING`.
    """
    if gap_before is None or silence_gap_seconds <= 0:
        return TURN_CONFIDENCE_FLOOR
    excess = min(1.0, max(0.0, (gap_before - silence_gap_seconds) / silence_gap_seconds))
    span = TURN_CONFIDENCE_CEILING - TURN_CONFIDENCE_FLOOR
    return round(TURN_CONFIDENCE_FLOOR + span * excess, 4)


def normalise_language(detected: str | None, configured: str | None) -> str:
    """The schema's `^[a-z]{2}(-[A-Z]{2})?$`, or a declared fallback.

    A silent clip still needs a syntactically valid language, and whisper's
    detection on silence is meaningless — so the configured language wins over a
    detection that does not parse, and `languageConfidence` carries the honesty.
    """
    for candidate in (detected, configured):
        if candidate and _LANGUAGE_PATTERN.match(candidate):
            return candidate
    return "en"


def build_engine_record(options: TranscriptOptions, engine_version: str) -> dict[str, Any]:
    """REQ-012: thresholds are recorded WITH the index, not just applied to it."""
    parameters = {
        "modelSize": options.model_size,
        "device": options.device,
        "computeType": options.compute_type,
        "language": options.language or "auto",
        "beamSize": str(options.beam_size),
        "temperature": "0.0",
        "wordTimestamps": "true",
        "vadFilter": str(options.vad_filter).lower(),
        "lowConfidenceThreshold": str(options.low_confidence_threshold),
        "speakerTurnSilenceGapSeconds": str(options.silence_gap_seconds),
        "audioSampleRate": str(AUDIO_SAMPLE_RATE),
    }
    return {
        "name": ENGINE_NAME,
        "version": engine_version,
        # Sorted: dict order is stable in CPython but determinism should not
        # depend on knowing that.
        "parameters": [{"key": k, "value": v} for k, v in sorted(parameters.items())],
    }


def build_transcript_artefact(
    raw_segments: tuple[RawSegment, ...],
    *,
    language: str,
    language_confidence: float,
    options: TranscriptOptions,
    engine_version: str,
    audio_present: bool = True,
) -> dict[str, Any]:
    """Assemble the sub-stage artefact from already-decoded engine output.

    Pure: takes boundary types, returns the dict. That is what lets the whole
    shape be tested without a model on disk.

    `audioPresent` is carried alongside the transcript because the two ways of
    having nothing to say are NOT the same thing, and the source-index schema
    distinguishes them: `transcript` is null "only when the asset has no audio at
    all", while a silent clip that WAS transcribed yields empty segments. Only
    this sub-stage knows which happened, so it records it rather than leaving the
    assembler to guess from an empty segment list.
    """
    turns, turn_id_by_segment = derive_speaker_turns(
        raw_segments, silence_gap_seconds=options.silence_gap_seconds
    )

    segments: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_segments):
        verbatim = raw.text.strip()
        segments.append(
            {
                "segmentId": f"segment-{index + 1:04d}",
                "startTicks": seconds_to_ticks(raw.start),
                "endTicks": seconds_to_ticks(raw.end),
                "timebase": dict(AUDIO_TIMEBASE),
                "verbatimText": verbatim,
                "displayText": normalise_display_text(verbatim),
                "confidence": segment_confidence(raw.avg_logprob),
                "speakerTurnId": turn_id_by_segment[index] if index < len(turn_id_by_segment) else None,
                "words": build_words(raw.words, options.low_confidence_threshold),
            }
        )

    segments.sort(key=lambda s: (s["startTicks"], s["segmentId"]))
    turns.sort(key=lambda t: (t["startTicks"], t["turnId"]))

    return {
        "transcript": {
            "language": language,
            "languageConfidence": _clamp(language_confidence),
            # The whole verbatim record, joined from the segments' verbatim side
            # — never from displayText. This is the string the quotation gate
            # tokenises (D-37).
            "verbatimText": " ".join(s["verbatimText"] for s in segments if s["verbatimText"]),
            "segments": segments,
        },
        "speakerTurns": turns,
        "audioPresent": audio_present,
        "engine": build_engine_record(options, engine_version),
    }


def model_config_for(options: TranscriptOptions, engine_version: str) -> dict[str, Any]:
    """The REQ-005 cache-key half that belongs to this sub-stage.

    Every value here changes the transcript for byte-identical media. `download_root`
    and `local_files_only` are deliberately absent: they change where weights come
    from, not what the weights produce.
    """
    return {
        "engine": ENGINE_NAME,
        "engineVersion": engine_version,
        "modelSize": options.model_size,
        "computeType": options.compute_type,
        "device": options.device,
        "language": options.language or "auto",
        "beamSize": options.beam_size,
        "temperature": 0.0,
        "wordTimestamps": True,
        "vadFilter": options.vad_filter,
        "lowConfidenceThreshold": options.low_confidence_threshold,
        "speakerTurnSilenceGapSeconds": options.silence_gap_seconds,
        "audioSampleRate": AUDIO_SAMPLE_RATE,
    }


# --------------------------------------------------------------------------
# Engine boundary.
# --------------------------------------------------------------------------


def engine_version() -> str:
    try:
        import faster_whisper

        return str(faster_whisper.__version__)
    except Exception as error:
        raise ModelUnavailableError(
            model=ENGINE_NAME,
            message=f"faster-whisper is not importable: {type(error).__name__}: {error}",
        ) from error


def has_audio_stream(media_path: Path) -> bool:
    """Does this container carry an audio track at all?

    Asked BEFORE the model is loaded, because faster-whisper 1.2.1 does not
    degrade gracefully here: `decode_audio` calls PyAV's
    `container.streams.get(audio=0)`, which raises a bare
    `IndexError: tuple index out of range` on a video-only file. Surfacing that
    as a transcript failure would make a perfectly ordinary b-roll clip fail the
    index, when the correct answer is an empty transcript.

    PyAV is faster-whisper's own decoding dependency, not a new one.
    """
    try:
        import av
    except ImportError as error:  # pragma: no cover - ships with faster-whisper
        raise ModelUnavailableError(
            model=ENGINE_NAME,
            message=f"PyAV (faster-whisper's decoder) is not importable: {error}",
        ) from error

    try:
        with av.open(str(media_path)) as container:
            return any(stream.type == "audio" for stream in container.streams)
    except Exception as error:
        raise SubStageError(
            code="TRANSCRIPT_MEDIA_UNREADABLE",
            message=f"could not open media for audio inspection: {type(error).__name__}: {error}",
            details={"path": media_path.name},
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error


def load_model(options: TranscriptOptions) -> Any:
    """Construct the WhisperModel, converting ANY failure into a named error.

    The first use downloads CTranslate2 weights from the HF Hub. Offline, gated,
    or corrupt-cache all surface as `MODEL_UNAVAILABLE` naming the model, which
    is what keeps the sibling sub-stages running and the job resumable.
    """
    model_name = f"{ENGINE_NAME}/{options.model_size}"
    try:
        from faster_whisper import WhisperModel
    except Exception as error:
        raise ModelUnavailableError(
            model=model_name,
            message=f"faster-whisper is not importable: {type(error).__name__}: {error}",
        ) from error

    try:
        return WhisperModel(
            options.model_size,
            device=options.device,
            compute_type=options.compute_type,
            download_root=options.download_root,
            local_files_only=options.local_files_only,
        )
    except Exception as error:
        raise ModelUnavailableError(
            model=model_name,
            message=(
                f"could not load {model_name} "
                f"(device={options.device}, compute_type={options.compute_type}): "
                f"{type(error).__name__}: {error}"
            ),
        ) from error


def transcribe_media(media_path: Path, options: TranscriptOptions, model: Any = None) -> dict[str, Any]:
    """Run ASR and return the artefact dict. The `compute` body of the sub-stage.

    Two engine facts drive the shape of this function:
      * `transcribe(...)` returns `(segments, info)` where **segments is a
        generator** — nothing is decoded until it is consumed, so the `for` loop
        below is where inference actually happens and where its failures appear.
      * Word timestamps only exist when `word_timestamps=True`; otherwise
        `Segment.words` is `None`, and REQ-010 needs them.
    """
    if not media_path.exists():
        raise SubStageError(
            code="TRANSCRIPT_INPUT_MISSING",
            message=f"media file not found: {media_path.name}",
            details={"path": media_path.name},
            exit_code=EXIT_INPUT_VALIDATION,
        )

    version = engine_version()

    # Guarded on `model is None` because an injected model is a test double that
    # never touches PyAV, so probing its stand-in media would be meaningless.
    if model is None and not has_audio_stream(media_path):
        # Video-only b-roll. An empty transcript is the honest answer: there is
        # nothing to transcribe, so there is nothing to fail about and certainly
        # nothing to invent. The model is not even loaded.
        return build_transcript_artefact(
            (),
            language=normalise_language(None, options.language),
            language_confidence=0.0,
            options=options,
            engine_version=version,
            audio_present=False,
        )

    if model is None:
        model = load_model(options)

    try:
        segments_iter, info = model.transcribe(
            str(media_path),
            language=options.language,
            beam_size=options.beam_size,
            # A single temperature: the default list is a fallback ladder that
            # re-decodes with sampling on failure, which is non-deterministic.
            temperature=0.0,
            word_timestamps=True,
            vad_filter=options.vad_filter,
        )
    except Exception as error:
        raise SubStageError(
            code="TRANSCRIPT_ENGINE_FAILED",
            message=f"faster-whisper transcribe() failed: {type(error).__name__}: {error}",
            details={"model": options.model_size},
        ) from error

    raw_segments = _consume_segments(segments_iter, options)

    detected = getattr(info, "language", None)
    probability = getattr(info, "language_probability", 0.0) or 0.0
    return build_transcript_artefact(
        raw_segments,
        language=normalise_language(detected, options.language),
        # A clip with no speech gets no language evidence, so its confidence is
        # 0.0 rather than whisper's reading of noise.
        language_confidence=float(probability) if raw_segments else 0.0,
        options=options,
        engine_version=version,
    )


def _consume_segments(segments_iter: Any, options: TranscriptOptions) -> tuple[RawSegment, ...]:
    """Drain the generator — this is what actually runs inference."""
    raw: list[RawSegment] = []
    try:
        for segment in segments_iter:
            text = (segment.text or "").strip()
            words = tuple(
                RawWord(
                    start=float(word.start),
                    end=float(word.end),
                    text=word.word,
                    probability=float(word.probability),
                )
                for word in (segment.words or [])
                if (word.word or "").strip()
            )
            # An empty segment is what VAD-filtered silence and whisper's
            # no-speech path leave behind. Keeping it would turn "this clip is
            # silent" into "this clip contains an empty utterance".
            if not text and not words:
                continue
            raw.append(
                RawSegment(
                    start=float(segment.start),
                    end=float(segment.end),
                    text=text,
                    avg_logprob=float(segment.avg_logprob),
                    words=words,
                )
            )
    except SubStageError:
        raise
    except Exception as error:
        raise SubStageError(
            code="TRANSCRIPT_ENGINE_FAILED",
            message=f"faster-whisper decoding failed: {type(error).__name__}: {error}",
            details={"model": options.model_size},
        ) from error
    return tuple(raw)


def run_transcript_sub_stage(
    ctx: SubStageContext,
    media_path: Path,
    *,
    options: TranscriptOptions | None = None,
    force: bool = False,
    model: Any = None,
) -> SubStageResult:
    """Cache-keyed, resumable, atomically-written transcript sub-stage."""
    resolved = options or TranscriptOptions()
    # The engine version is part of the cache key, so it must resolve BEFORE the
    # harness is entered. An unimportable engine raises `ModelUnavailableError`
    # here — for the whole sub-stage, rather than as a mid-compute surprise that
    # would already have written a run-log "started" entry.
    version = engine_version()

    return run_sub_stage(
        ctx,
        "transcript",
        lambda: transcribe_media(media_path, resolved, model=model),
        model_config=model_config_for(resolved, version),
        force=force,
    )


def with_model_size(options: TranscriptOptions, model_size: str) -> TranscriptOptions:
    """Convenience for callers and tests that only vary the model."""
    return replace(options, model_size=model_size)
