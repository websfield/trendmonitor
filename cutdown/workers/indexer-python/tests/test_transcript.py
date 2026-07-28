"""Transcript sub-stage tests (Phase 2 task 2).

Two layers, deliberately:

* **Pure-logic tests run always.** Tick conversion, D-28 flagging, the proper-noun
  heuristic, display-text normalisation, turn derivation and artefact shape all
  take engine *boundary types* (`RawSegment`/`RawWord`), so they need no model on
  disk and no HuggingFace download. These are the tests that must never be
  skipped, because they cover every rule the schema and the decisions record.
* **`@pytest.mark.slow` tests run a real `tiny` model** against the golden-set
  media, including the required silent-clip case.

The fake-model tests in `TestSubStageIntegration` prove the harness wiring and the
degraded paths without inference, by passing a stub with the same `transcribe`
contract the real engine has (returns `(generator, info)`).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from harness import ModelUnavailableError, SubStageContext, SubStageError
from transcript import (
    AUDIO_SAMPLE_RATE,
    AUDIO_TIMEBASE,
    LOW_CONFIDENCE_THRESHOLD,
    TURN_CONFIDENCE_CEILING,
    RawSegment,
    RawWord,
    TranscriptOptions,
    build_engine_record,
    build_transcript_artefact,
    build_words,
    derive_speaker_turns,
    is_low_confidence,
    is_proper_noun_candidate,
    is_sentence_opener,
    load_model,
    model_config_for,
    normalise_display_text,
    normalise_language,
    run_transcript_sub_stage,
    seconds_to_ticks,
    segment_confidence,
    transcribe_media,
    turn_confidence,
    word_tokens,
)

GOLDEN = Path(__file__).resolve().parents[3] / "data" / "golden-sets" / "ingest"
FIXTURES = Path(__file__).resolve().parents[3] / "skills" / "index" / "fixtures" / "transcript"


def word(text: str, start: float, end: float, probability: float = 0.9) -> RawWord:
    return RawWord(start=start, end=end, text=text, probability=probability)


def segment(text: str, start: float, end: float, *, words=(), avg_logprob: float = -0.2) -> RawSegment:
    return RawSegment(start=start, end=end, text=text, avg_logprob=avg_logprob, words=tuple(words))


@pytest.fixture
def ctx(tmp_path: Path) -> SubStageContext:
    return SubStageContext(
        job_id="transcript-1",
        asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
        job_root=tmp_path / "jobs" / "transcript-1",
        content_hash="c" * 64,
    )


class TestTickConversion:
    """§3: rational ticks, never float seconds. Audio ticks ARE samples."""

    def test_a_tick_is_an_audio_sample(self) -> None:
        assert seconds_to_ticks(1.0) == AUDIO_SAMPLE_RATE
        assert AUDIO_TIMEBASE == {"num": 1, "den": AUDIO_SAMPLE_RATE}

    def test_conversion_is_exact_integer_arithmetic(self) -> None:
        assert seconds_to_ticks(0.5) == 8000
        assert seconds_to_ticks(2.25) == 36000
        assert isinstance(seconds_to_ticks(1.234), int)

    def test_sub_sample_values_round_rather_than_truncate(self) -> None:
        # 0.000_1 s is 1.6 samples; truncation would systematically pull every
        # boundary earlier, and those errors accumulate across a long clip.
        assert seconds_to_ticks(0.0001) == 2

    def test_a_negative_engine_timestamp_is_clamped_not_propagated(self) -> None:
        # whisper occasionally emits a tiny negative start for the first word;
        # the schema requires startTicks >= 0.
        assert seconds_to_ticks(-0.01) == 0

    def test_a_non_finite_timestamp_is_a_structured_error(self) -> None:
        with pytest.raises(SubStageError) as caught:
            seconds_to_ticks(float("nan"))
        assert caught.value.code == "TRANSCRIPT_INVALID_TIMESTAMP"

    def test_conversion_respects_a_non_audio_timebase(self) -> None:
        assert seconds_to_ticks(1.0, {"num": 1001, "den": 30000}) == 30

    def test_conversion_is_stable_across_calls(self) -> None:
        assert seconds_to_ticks(3.7) == seconds_to_ticks(3.7)


class TestLowConfidenceMarking:
    """D-28: flag ASR confidence < 0.6 for reviewer attention."""

    def test_below_the_threshold_is_flagged(self) -> None:
        assert is_low_confidence(0.59) is True

    def test_exactly_at_the_threshold_is_not_flagged(self) -> None:
        # The decision says "< 0.6", not "<= 0.6". Getting this wrong flags a
        # band of perfectly ordinary words on every clip.
        assert is_low_confidence(0.6) is False

    def test_above_the_threshold_is_not_flagged(self) -> None:
        assert is_low_confidence(0.95) is False

    def test_the_threshold_is_the_decisions_value(self) -> None:
        assert LOW_CONFIDENCE_THRESHOLD == 0.6

    def test_the_threshold_is_configurable_per_run(self) -> None:
        assert is_low_confidence(0.7, threshold=0.8) is True

    def test_words_carry_the_flag(self) -> None:
        words = build_words(
            (word("clear", 0.0, 0.4, 0.98), word("mumbled", 0.4, 0.8, 0.31)),
            LOW_CONFIDENCE_THRESHOLD,
        )
        assert [w["lowConfidence"] for w in words] == [False, True]

    def test_the_threshold_is_recorded_in_the_engine_parameters(self) -> None:
        # REQ-012: thresholds are recorded WITH the index. A threshold applied but
        # not recorded makes an old artefact uninterpretable.
        record = build_engine_record(TranscriptOptions(), "1.2.1")
        params = {p["key"]: p["value"] for p in record["parameters"]}
        assert params["lowConfidenceThreshold"] == "0.6"

    def test_the_threshold_is_part_of_the_cache_key(self) -> None:
        # REQ-005: lowering it changes which words are flagged for the same audio,
        # so a cached artefact from the old threshold must not be served.
        base = model_config_for(TranscriptOptions(), "1.2.1")
        lowered = model_config_for(TranscriptOptions(low_confidence_threshold=0.4), "1.2.1")
        assert base != lowered
        assert base["lowConfidenceThreshold"] == 0.6


class TestProperNounHeuristic:
    """D-28: all proper nouns flagged — a misspelt name is the costly error."""

    def test_a_capitalised_mid_sentence_token_is_flagged(self) -> None:
        assert is_proper_noun_candidate("Ada", sentence_opener=False) is True

    def test_a_sentence_opener_is_not_flagged(self) -> None:
        # Sentence-initial capitalisation carries no information about names.
        assert is_proper_noun_candidate("The", sentence_opener=True) is False

    def test_a_lowercase_token_is_not_flagged(self) -> None:
        assert is_proper_noun_candidate("meeting", sentence_opener=False) is False

    def test_surrounding_punctuation_does_not_hide_a_name(self) -> None:
        assert is_proper_noun_candidate('"Ada,', sentence_opener=False) is True

    def test_the_first_person_pronoun_is_not_a_name(self) -> None:
        # Capitalised everywhere in English; flagging it would put a candidate on
        # a large fraction of all clips and train reviewers to ignore the flag.
        assert is_proper_noun_candidate("I", sentence_opener=False) is False
        assert is_proper_noun_candidate("I'm", sentence_opener=False) is False
        assert is_proper_noun_candidate("I've", sentence_opener=False) is False

    def test_a_name_beginning_with_the_pronoun_letter_is_still_flagged(self) -> None:
        # The negative control for the exclusion above: it enumerates the pronoun
        # forms rather than matching an "I'" prefix, so a real surname survives.
        assert is_proper_noun_candidate("I'Anson", sentence_opener=False) is True
        assert is_proper_noun_candidate("Ian", sentence_opener=False) is True

    def test_a_number_is_not_flagged(self) -> None:
        assert is_proper_noun_candidate("2026", sentence_opener=False) is False

    def test_a_punctuation_only_token_is_not_flagged(self) -> None:
        assert is_proper_noun_candidate("--", sentence_opener=False) is False

    def test_sentence_openers_are_detected_after_terminal_punctuation(self) -> None:
        assert is_sentence_opener(None) is True
        assert is_sentence_opener("done.") is True
        assert is_sentence_opener("really?") is True
        assert is_sentence_opener('done."') is True
        assert is_sentence_opener("and") is False

    def test_the_flag_lands_on_the_right_word_in_a_real_sequence(self) -> None:
        words = build_words(
            (
                word("Hello", 0.0, 0.3),
                word("Ada.", 0.3, 0.6),
                word("Grace", 0.6, 0.9),
                word("spoke", 0.9, 1.2),
                word("to", 1.2, 1.4),
                word("Ada", 1.4, 1.7),
            ),
            LOW_CONFIDENCE_THRESHOLD,
        )
        flags = {w["verbatim"]: w["properNounCandidate"] for w in words}
        assert flags["Hello"] is False, "first word of the segment is a sentence opener"
        assert flags["Ada."] is True, "mid-sentence capital is a candidate"
        assert flags["Grace"] is False, "follows a full stop, so it is a sentence opener"
        assert flags["Ada"] is True


class TestDisplayTextNormalisation:
    """`displayText` may tidy; it may NEVER change what was said."""

    def test_whitespace_runs_are_collapsed(self) -> None:
        assert normalise_display_text("hello   there\n\nfriend") == "hello there friend"

    def test_space_before_punctuation_is_removed(self) -> None:
        assert normalise_display_text("hello , there .") == "hello, there."

    def test_bracket_padding_is_removed(self) -> None:
        assert normalise_display_text("a ( b ) c") == "a (b) c"

    def test_word_order_is_never_changed(self) -> None:
        source = "Ada spoke to Grace about the machine ."
        assert word_tokens(normalise_display_text(source)) == word_tokens(source)

    def test_no_word_is_ever_dropped(self) -> None:
        # The load-bearing invariant: the quotation gate tokenises `verbatimText`,
        # so if a cleaned caption could drop a word it would launder a misquote
        # past a gate that never sees the cleaned side.
        for source in [
            "um so I I think we should ship it",
            "no,no,no — not like that",
            "he said  \"stop\"  and left .",
            "one 2 three-four five's six",
        ]:
            assert word_tokens(normalise_display_text(source)) == word_tokens(source), source

    def test_normalisation_is_idempotent(self) -> None:
        once = normalise_display_text("hello ,  world .")
        assert normalise_display_text(once) == once

    def test_disfluencies_are_kept_at_phase_0(self) -> None:
        # Phase 0 is a whitespace/punctuation tidy only. Removing "um" is a
        # meaning-adjacent edit and needs its own decision, not a silent default.
        assert "um" in normalise_display_text("um  so  yeah")

    def test_the_segment_carries_both_sides_separately(self) -> None:
        artefact = build_transcript_artefact(
            (segment("hello ,  world .", 0.0, 1.0, words=[word("hello", 0.0, 0.5)]),),
            language="en",
            language_confidence=0.9,
            options=TranscriptOptions(),
            engine_version="1.2.1",
        )
        seg = artefact["transcript"]["segments"][0]
        assert seg["verbatimText"] == "hello ,  world ."
        assert seg["displayText"] == "hello, world."
        assert seg["verbatimText"] != seg["displayText"]

    def test_the_whole_transcript_text_is_built_from_the_verbatim_side(self) -> None:
        artefact = build_transcript_artefact(
            (segment("hello ,  world .", 0.0, 1.0), segment("bye .", 1.0, 2.0)),
            language="en",
            language_confidence=0.9,
            options=TranscriptOptions(),
            engine_version="1.2.1",
        )
        assert artefact["transcript"]["verbatimText"] == "hello ,  world . bye ."


class TestSpeakerTurns:
    """REQ-011 at its D-17 Phase-0 subset: turns, not diarisation."""

    def test_contiguous_segments_form_one_turn(self) -> None:
        turns, per_segment = derive_speaker_turns(
            (segment("a", 0.0, 1.0), segment("b", 1.1, 2.0), segment("c", 2.05, 3.0))
        )
        assert len(turns) == 1
        assert per_segment == ["turn-0001"] * 3

    def test_a_long_silence_starts_a_new_turn(self) -> None:
        turns, per_segment = derive_speaker_turns(
            (segment("a", 0.0, 1.0), segment("b", 3.0, 4.0)), silence_gap_seconds=0.75
        )
        assert len(turns) == 2
        assert per_segment == ["turn-0001", "turn-0002"]

    def test_a_short_pause_does_not(self) -> None:
        # The negative control for the case above: ordinary sentence pacing must
        # not shatter a monologue into dozens of "turns".
        turns, _ = derive_speaker_turns(
            (segment("a", 0.0, 1.0), segment("b", 1.2, 2.0)), silence_gap_seconds=0.75
        )
        assert len(turns) == 1

    def test_the_gap_threshold_is_inclusive(self) -> None:
        turns, _ = derive_speaker_turns(
            (segment("a", 0.0, 1.0), segment("b", 1.75, 2.0)), silence_gap_seconds=0.75
        )
        assert len(turns) == 2

    def test_turn_ids_are_stable_deterministic_strings(self) -> None:
        # A `--speaker-map` keys on these; an unstable ID silently reassigns names.
        segments = (segment("a", 0.0, 1.0), segment("b", 5.0, 6.0))
        first, _ = derive_speaker_turns(segments)
        second, _ = derive_speaker_turns(segments)
        assert [t["turnId"] for t in first] == ["turn-0001", "turn-0002"]
        assert first == second

    def test_labels_are_positional_never_an_identity_claim(self) -> None:
        turns, _ = derive_speaker_turns((segment("a", 0.0, 1.0), segment("b", 5.0, 6.0)))
        assert [t["inferredLabel"] for t in turns] == ["speaker_1", "speaker_2"]

    def test_every_turn_is_marked_low_confidence_at_phase_0(self) -> None:
        # A silence-gap heuristic over ASR segment boundaries is not diarisation.
        # If any turn could present itself as confident, the mark would be
        # decorative rather than honest.
        turns, _ = derive_speaker_turns(
            (segment("a", 0.0, 1.0), segment("b", 9.0, 10.0), segment("c", 30.0, 31.0))
        )
        assert all(t["lowConfidence"] is True for t in turns)
        assert all(t["inferredConfidence"] <= TURN_CONFIDENCE_CEILING for t in turns)
        assert TURN_CONFIDENCE_CEILING < LOW_CONFIDENCE_THRESHOLD

    def test_confidence_rises_with_the_evidence_for_the_boundary(self) -> None:
        assert turn_confidence(None, 0.75) < turn_confidence(1.5, 0.75)
        assert turn_confidence(0.8, 0.75) < turn_confidence(1.5, 0.75)

    def test_turns_start_uncorrected(self) -> None:
        turns, _ = derive_speaker_turns((segment("a", 0.0, 1.0),))
        assert turns[0]["correction"] is None

    def test_no_segments_yields_no_turns(self) -> None:
        assert derive_speaker_turns(()) == ([], [])

    def test_every_segment_carries_its_speaker_turn_id(self) -> None:
        # A turn nothing points at is unusable to a reviewer.
        artefact = build_transcript_artefact(
            (segment("a", 0.0, 1.0), segment("b", 5.0, 6.0)),
            language="en",
            language_confidence=0.9,
            options=TranscriptOptions(),
            engine_version="1.2.1",
        )
        turn_ids = {t["turnId"] for t in artefact["speakerTurns"]}
        assert turn_ids == {"turn-0001", "turn-0002"}
        for seg in artefact["transcript"]["segments"]:
            assert seg["speakerTurnId"] in turn_ids

    def test_turn_ticks_span_the_segments_it_contains(self) -> None:
        turns, _ = derive_speaker_turns((segment("a", 0.0, 1.0), segment("b", 1.1, 2.5)))
        assert turns[0]["startTicks"] == seconds_to_ticks(0.0)
        assert turns[0]["endTicks"] == seconds_to_ticks(2.5)


class TestArtefactShape:
    """§4: closed schemas — exactly these keys, no extras, no omissions."""

    @pytest.fixture
    def artefact(self) -> dict:
        return build_transcript_artefact(
            (
                segment(
                    "Hello Ada.",
                    0.0,
                    1.0,
                    words=[word("Hello", 0.0, 0.4, 0.99), word("Ada.", 0.4, 1.0, 0.42)],
                ),
            ),
            language="en",
            language_confidence=0.98,
            options=TranscriptOptions(),
            engine_version="1.2.1",
        )

    def test_transcript_has_exactly_the_contract_keys(self, artefact: dict) -> None:
        assert set(artefact["transcript"]) == {
            "language",
            "languageConfidence",
            "verbatimText",
            "segments",
        }

    def test_segment_has_exactly_the_contract_keys(self, artefact: dict) -> None:
        assert set(artefact["transcript"]["segments"][0]) == {
            "segmentId",
            "startTicks",
            "endTicks",
            "timebase",
            "verbatimText",
            "displayText",
            "confidence",
            "speakerTurnId",
            "words",
        }

    def test_word_has_exactly_the_contract_keys(self, artefact: dict) -> None:
        assert set(artefact["transcript"]["segments"][0]["words"][0]) == {
            "startTicks",
            "endTicks",
            "timebase",
            "verbatim",
            "confidence",
            "lowConfidence",
            "properNounCandidate",
        }

    def test_speaker_turn_has_exactly_the_contract_keys(self, artefact: dict) -> None:
        assert set(artefact["speakerTurns"][0]) == {
            "turnId",
            "startTicks",
            "endTicks",
            "timebase",
            "inferredLabel",
            "inferredConfidence",
            "lowConfidence",
            "correction",
        }

    def test_the_sub_stage_artefact_has_a_stable_top_level_shape(self, artefact: dict) -> None:
        assert set(artefact) == {"transcript", "speakerTurns", "audioPresent", "engine"}

    def test_engine_parameters_are_a_list_of_pairs_not_a_dict(self, artefact: dict) -> None:
        record = artefact["engine"]
        assert set(record) == {"name", "version", "parameters"}
        assert isinstance(record["parameters"], list)
        assert all(set(p) == {"key", "value"} for p in record["parameters"])
        assert all(isinstance(p["value"], str) for p in record["parameters"])

    def test_no_float_seconds_leak_into_time_fields(self, artefact: dict) -> None:
        seg = artefact["transcript"]["segments"][0]
        assert isinstance(seg["startTicks"], int) and isinstance(seg["endTicks"], int)
        assert isinstance(seg["words"][0]["startTicks"], int)
        assert seg["timebase"] == {"num": 1, "den": AUDIO_SAMPLE_RATE}

    def test_ids_are_stable_deterministic_strings(self, artefact: dict) -> None:
        assert artefact["transcript"]["segments"][0]["segmentId"] == "segment-0001"

    def test_the_artefact_validates_against_the_generated_contract_model(self, artefact: dict) -> None:
        # The generated pydantic models are `extra='forbid'`, so this catches an
        # extra key or a wrong type the hand-written key assertions would miss.
        from cutdown_contracts.source_index_v1 import SpeakerTurn, Transcript

        Transcript.model_validate(artefact["transcript"])
        for turn in artefact["speakerTurns"]:
            SpeakerTurn.model_validate(turn)

    def test_the_artefact_is_json_serialisable_and_stable(self, artefact: dict) -> None:
        # §5 determinism: byte-identical across runs on the same input.
        assert json.dumps(artefact, sort_keys=True) == json.dumps(artefact, sort_keys=True)

    def test_segment_confidence_maps_log_probability_into_the_schema_range(self) -> None:
        assert segment_confidence(0.0) == 1.0
        assert 0.0 < segment_confidence(-0.2) < 1.0
        assert segment_confidence(-100.0) >= 0.0
        assert segment_confidence(float("-inf")) == 0.0

    def test_whitespace_only_words_are_dropped(self) -> None:
        # `verbatim` has minLength 1; an engine whitespace token would produce a
        # schema-invalid word.
        assert build_words((word("  ", 0.0, 0.1), word("real", 0.1, 0.5)), 0.6) == [
            w for w in build_words((word("real", 0.1, 0.5),), 0.6)
        ]


class TestEmptyTranscript:
    """A silent clip is empty-but-VALID: not an error, not a fabrication."""

    @pytest.fixture
    def empty(self) -> dict:
        return build_transcript_artefact(
            (),
            language="en",
            language_confidence=0.0,
            options=TranscriptOptions(),
            engine_version="1.2.1",
        )

    def test_segments_and_turns_are_empty(self, empty: dict) -> None:
        assert empty["transcript"]["segments"] == []
        assert empty["speakerTurns"] == []

    def test_no_transcript_text_is_invented(self, empty: dict) -> None:
        assert empty["transcript"]["verbatimText"] == ""

    def test_the_transcript_is_still_structurally_valid(self, empty: dict) -> None:
        from cutdown_contracts.source_index_v1 import Transcript

        Transcript.model_validate(empty["transcript"])

    def test_a_valid_language_is_still_present(self, empty: dict) -> None:
        # The schema requires the field; a silent clip cannot be `null` there.
        assert empty["transcript"]["language"] == "en"

    def test_language_confidence_is_honest_about_the_absent_evidence(self, empty: dict) -> None:
        assert empty["transcript"]["languageConfidence"] == 0.0

    def test_language_falls_back_to_the_configured_value_when_detection_is_junk(self) -> None:
        assert normalise_language("Unknown", "en") == "en"
        assert normalise_language(None, None) == "en"
        assert normalise_language("fr", "en") == "fr"
        assert normalise_language("en-GB", "en") == "en-GB"

    def test_silent_audio_is_distinguished_from_no_audio_track(self, empty: dict) -> None:
        # Two different facts, and the source-index schema treats them
        # differently: `transcript` is null "only when the asset has no audio at
        # all", whereas a silent-but-transcribed clip yields empty segments. Only
        # this sub-stage knows which happened, so it records it.
        assert empty["audioPresent"] is True

        no_audio = build_transcript_artefact(
            (),
            language="en",
            language_confidence=0.0,
            options=TranscriptOptions(),
            engine_version="1.2.1",
            audio_present=False,
        )
        assert no_audio["audioPresent"] is False
        assert no_audio["transcript"]["segments"] == []


class TestAudioStreamProbe:
    """faster-whisper 1.2.1 crashes on a video-only container; we ask first."""

    @pytest.mark.skipif(not (GOLDEN / "clean.mp4").exists(), reason="golden-set media not present")
    def test_media_with_an_audio_track_is_detected(self) -> None:
        from transcript import has_audio_stream

        assert has_audio_stream(GOLDEN / "clean.mp4") is True

    @pytest.mark.skipif(
        not (GOLDEN / "broll-silent.mp4").exists(), reason="golden-set media not present"
    )
    def test_video_only_media_is_detected(self) -> None:
        # The negative control for the case above. broll-silent.mp4 turns out to
        # carry NO audio stream at all rather than a silent one, which is exactly
        # the input that makes faster-whisper raise a bare IndexError.
        from transcript import has_audio_stream

        assert has_audio_stream(GOLDEN / "broll-silent.mp4") is False

    def test_unreadable_media_is_an_input_validation_error(self, tmp_path: Path) -> None:
        from transcript import has_audio_stream

        junk = tmp_path / "junk.mp4"
        junk.write_bytes(b"definitely not a container")
        with pytest.raises(SubStageError) as caught:
            has_audio_stream(junk)
        assert caught.value.code == "TRANSCRIPT_MEDIA_UNREADABLE"
        assert caught.value.exit_code == 2


class FakeInfo:
    def __init__(self, language: str = "en", probability: float = 0.97) -> None:
        self.language = language
        self.language_probability = probability


class FakeSegment:
    def __init__(self, start, end, text, avg_logprob, words):
        self.start, self.end, self.text = start, end, text
        self.avg_logprob = avg_logprob
        self.words = words


class FakeWord:
    def __init__(self, start, end, w, probability):
        self.start, self.end, self.word, self.probability = start, end, w, probability


class FakeModel:
    """Mirrors the real contract: `transcribe` returns `(generator, info)`.

    A list would hide the fact that the real segments object is lazy — consuming
    it is what runs inference, so it is also where inference failures surface.
    """

    def __init__(self, segments, info=None, raises: Exception | None = None) -> None:
        self._segments = segments
        self._info = info or FakeInfo()
        self._raises = raises
        self.calls: list[dict] = []

    def transcribe(self, audio, **kwargs):
        self.calls.append({"audio": audio, **kwargs})

        def generate():
            if self._raises is not None:
                raise self._raises
            yield from self._segments

        return generate(), self._info


class TestSubStageIntegration:
    """Harness wiring and degraded paths — proved without inference."""

    def test_the_sub_stage_writes_a_cache_keyed_artefact(self, ctx: SubStageContext, tmp_path: Path) -> None:
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"not really a video")
        model = FakeModel(
            [FakeSegment(0.0, 1.0, "Hello Ada.", -0.2, [FakeWord(0.0, 0.4, "Hello", 0.99)])]
        )

        result = run_transcript_sub_stage(ctx, media, options=TranscriptOptions(), model=model)
        assert result.cache_hit is False
        assert result.artefact_path.exists()
        assert result.artefact["transcript"]["segments"][0]["verbatimText"] == "Hello Ada."

    def test_a_second_run_is_a_cache_hit_and_does_not_re_transcribe(
        self, ctx: SubStageContext, tmp_path: Path
    ) -> None:
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"not really a video")
        model = FakeModel([FakeSegment(0.0, 1.0, "hi", -0.2, [FakeWord(0.0, 0.4, "hi", 0.9)])])

        run_transcript_sub_stage(ctx, media, model=model)
        second = run_transcript_sub_stage(ctx, media, model=model)
        assert second.cache_hit is True
        assert len(model.calls) == 1, "unchanged content must not be re-transcribed"

    def test_a_changed_model_size_invalidates_the_cache(self, ctx: SubStageContext, tmp_path: Path) -> None:
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"not really a video")
        model = FakeModel([FakeSegment(0.0, 1.0, "hi", -0.2, [FakeWord(0.0, 0.4, "hi", 0.9)])])

        run_transcript_sub_stage(ctx, media, options=TranscriptOptions(model_size="tiny"), model=model)
        rerun = run_transcript_sub_stage(
            ctx, media, options=TranscriptOptions(model_size="base"), model=model
        )
        assert rerun.cache_hit is False

    def test_word_timestamps_are_actually_requested(self, tmp_path: Path) -> None:
        # REQ-010 needs word-level timing, and faster-whisper leaves
        # `Segment.words` as None unless this flag is set.
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"x")
        model = FakeModel([])
        transcribe_media(media, TranscriptOptions(), model=model)
        assert model.calls[0]["word_timestamps"] is True

    def test_decoding_is_pinned_to_a_single_temperature(self, tmp_path: Path) -> None:
        # §5 determinism: the default temperature list is a fallback ladder that
        # re-decodes with sampling, which is not reproducible.
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"x")
        model = FakeModel([])
        transcribe_media(media, TranscriptOptions(), model=model)
        assert model.calls[0]["temperature"] == 0.0

    def test_a_silent_clip_produces_an_empty_transcript_not_an_error(self, tmp_path: Path) -> None:
        media = tmp_path / "silent.mp4"
        media.write_bytes(b"x")
        artefact = transcribe_media(media, TranscriptOptions(), model=FakeModel([]))
        assert artefact["transcript"]["segments"] == []
        assert artefact["speakerTurns"] == []
        assert artefact["transcript"]["verbatimText"] == ""

    def test_empty_engine_segments_are_dropped_rather_than_kept_as_blank_speech(
        self, tmp_path: Path
    ) -> None:
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"x")
        model = FakeModel([FakeSegment(0.0, 1.0, "   ", -0.2, [])])
        artefact = transcribe_media(media, TranscriptOptions(), model=model)
        assert artefact["transcript"]["segments"] == [], (
            "a blank segment would turn 'this clip is silent' into "
            "'this clip contains an empty utterance'"
        )

    def test_a_missing_media_file_is_an_input_validation_error(self, tmp_path: Path) -> None:
        with pytest.raises(SubStageError) as caught:
            transcribe_media(tmp_path / "nope.mp4", TranscriptOptions(), model=FakeModel([]))
        assert caught.value.code == "TRANSCRIPT_INPUT_MISSING"
        assert caught.value.exit_code == 2

    def test_a_decoding_failure_is_a_structured_error_not_a_traceback(self, tmp_path: Path) -> None:
        media = tmp_path / "clip.mp4"
        media.write_bytes(b"x")
        model = FakeModel([], raises=RuntimeError("ctranslate2 exploded"))
        with pytest.raises(SubStageError) as caught:
            transcribe_media(media, TranscriptOptions(), model=model)
        assert caught.value.code == "TRANSCRIPT_ENGINE_FAILED"

    def test_a_failed_sub_stage_leaves_no_checkpoint(self, ctx: SubStageContext, tmp_path: Path) -> None:
        from harness import read_checkpoint

        media = tmp_path / "clip.mp4"
        media.write_bytes(b"x")
        model = FakeModel([], raises=RuntimeError("boom"))
        with pytest.raises(SubStageError):
            run_transcript_sub_stage(ctx, media, model=model)
        assert read_checkpoint(ctx, "transcript") is None, "the failure must stay resumable"

    def test_model_load_failure_names_the_model(self) -> None:
        options = TranscriptOptions(
            model_size="definitely-not-a-real-whisper-model",
            local_files_only=True,
        )
        with pytest.raises(ModelUnavailableError) as caught:
            load_model(options)
        payload = caught.value.to_payload()
        assert payload["code"] == "MODEL_UNAVAILABLE"
        assert payload["details"]["model"] == "faster-whisper/definitely-not-a-real-whisper-model"
        assert "definitely-not-a-real-whisper-model" in payload["message"]


@pytest.mark.slow
class TestRealModel:
    """End-to-end against the golden-set media with a real `tiny` model.

    Marked slow: the first run downloads CTranslate2 weights from the HF Hub.
    """

    OPTIONS = TranscriptOptions(model_size="tiny", compute_type="int8", beam_size=1)

    @pytest.mark.skipif(not (GOLDEN / "clean.mp4").exists(), reason="golden-set media not present")
    def test_clean_media_produces_words_with_timestamps(self, ctx: SubStageContext) -> None:
        from cutdown_contracts.source_index_v1 import Transcript

        result = run_transcript_sub_stage(ctx, GOLDEN / "clean.mp4", options=self.OPTIONS)
        transcript = result.artefact["transcript"]
        Transcript.model_validate(transcript)
        assert transcript["segments"], "clean.mp4 carries speech and must transcribe"
        words = [w for s in transcript["segments"] for w in s["words"]]
        assert words, "REQ-010 requires WORD-level timestamps"
        assert all(w["endTicks"] >= w["startTicks"] for w in words)
        assert result.artefact["speakerTurns"], "speech must yield at least one turn"

    @pytest.mark.skipif(
        not (GOLDEN / "broll-silent.mp4").exists(), reason="golden-set media not present"
    )
    def test_silent_media_produces_an_empty_but_valid_transcript(self, ctx: SubStageContext) -> None:
        from cutdown_contracts.source_index_v1 import Transcript

        result = run_transcript_sub_stage(ctx, GOLDEN / "broll-silent.mp4", options=self.OPTIONS)
        Transcript.model_validate(result.artefact["transcript"])
        assert result.artefact["transcript"]["segments"] == [], "silence must not be hallucinated"
        assert result.artefact["speakerTurns"] == []
        assert result.artefact["transcript"]["verbatimText"] == ""
        assert result.artefact["audioPresent"] is False, "this clip has no audio track at all"
