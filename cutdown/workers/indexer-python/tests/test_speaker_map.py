"""Speaker-map tests (Phase 2 task 2, REQ-011 / D-17).

Every rule here exists because its violation attaches a name to the wrong
speech and nothing downstream would notice. So each rule gets both sides: the
case where the correction is applied, and the control where it must be REFUSED
and the original inference must survive completely untouched.

No model, no media — all of this is pure validation logic and always runs.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from harness import SubStageError, main_guard
from speaker_map import (
    CODE_DUPLICATE_TURN,
    CODE_INVALID,
    CODE_UNKNOWN_TURN,
    CODE_UNREADABLE,
    SpeakerCorrection,
    apply_speaker_map,
    apply_speaker_map_to_artefact,
    load_speaker_map,
    main,
    parse_speaker_map,
    validate_against_turns,
)

FIXTURES = Path(__file__).resolve().parents[3] / "skills" / "index" / "fixtures" / "transcript"


def turn(turn_id: str, label: str, start: int = 0, end: int = 16000) -> dict:
    return {
        "turnId": turn_id,
        "startTicks": start,
        "endTicks": end,
        "timebase": {"num": 1, "den": 16000},
        "inferredLabel": label,
        "inferredConfidence": 0.25,
        "lowConfidence": True,
        "correction": None,
    }


@pytest.fixture
def turns() -> list[dict]:
    return [turn("turn-0001", "speaker_1", 0, 16000), turn("turn-0002", "speaker_2", 32000, 48000)]


@pytest.fixture
def artefact(turns: list[dict]) -> dict:
    return {
        "transcript": {
            "language": "en",
            "languageConfidence": 0.97,
            "verbatimText": "hello",
            "segments": [],
        },
        "speakerTurns": turns,
        "engine": {"name": "faster-whisper", "version": "1.2.1", "parameters": []},
    }


class TestFixturesExist:
    def test_every_documented_fixture_is_on_disk(self) -> None:
        for name in [
            "speaker-map-valid.yaml",
            "speaker-map-unknown-turn.yaml",
            "speaker-map-duplicate-turn.yaml",
            "speaker-map-missing-author.yaml",
            "speaker-map-bad-timestamp.yaml",
        ]:
            assert (FIXTURES / name).exists(), name


class TestParsing:
    def test_a_valid_map_parses_with_inherited_defaults(self) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        assert [c.turn_id for c in corrections] == ["turn-0001", "turn-0002"]
        assert corrections[0].name == "Ada Lovelace"
        assert corrections[0].author == "reviewer@example.com"
        assert corrections[0].corrected_at == "2026-07-21T10:00:00Z"

    def test_a_per_entry_author_overrides_the_default(self) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        assert corrections[1].author == "second-reviewer@example.com"

    def test_a_missing_file_is_an_input_validation_error(self, tmp_path: Path) -> None:
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(tmp_path / "nope.yaml")
        assert caught.value.code == CODE_UNREADABLE
        assert caught.value.exit_code == 2

    def test_malformed_yaml_is_an_input_validation_error(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad.yaml"
        bad.write_text("corrections: [unclosed", encoding="utf-8")
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(bad)
        assert caught.value.code == CODE_UNREADABLE
        assert caught.value.exit_code == 2

    def test_an_empty_map_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            parse_speaker_map(None)
        assert caught.value.code == CODE_INVALID

    def test_a_map_without_corrections_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            parse_speaker_map({"author": "a@b.c"})
        assert caught.value.code == CODE_INVALID

    def test_an_unrecognised_top_level_key_is_rejected(self) -> None:
        # A typo'd key silently doing nothing is how a reviewer believes a
        # correction landed when it did not.
        with pytest.raises(SubStageError) as caught:
            parse_speaker_map({"correctons": [], "corrections": [{"turnId": "t", "name": "n"}]})
        assert caught.value.code == CODE_INVALID

    def test_an_unrecognised_entry_key_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            parse_speaker_map(
                {
                    "author": "a@b.c",
                    "correctedAt": "2026-07-21T10:00:00Z",
                    "corrections": [{"turnId": "turn-0001", "nmae": "typo"}],
                }
            )
        assert caught.value.code == CODE_INVALID

    def test_a_correction_without_an_author_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(FIXTURES / "speaker-map-missing-author.yaml")
        assert caught.value.code == CODE_INVALID
        assert caught.value.exit_code == 2

    def test_a_non_iso_timestamp_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(FIXTURES / "speaker-map-bad-timestamp.yaml")
        assert caught.value.code == CODE_INVALID

    def test_an_empty_name_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            parse_speaker_map(
                {
                    "author": "a@b.c",
                    "correctedAt": "2026-07-21T10:00:00Z",
                    "corrections": [{"turnId": "turn-0001", "name": "   "}],
                }
            )
        assert caught.value.code == CODE_INVALID


class TestDuplicateRejection:
    """One turn takes one name — last-wins would silently pick."""

    def test_a_duplicate_turn_id_is_a_validation_failure(self) -> None:
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(FIXTURES / "speaker-map-duplicate-turn.yaml")
        assert caught.value.code == CODE_DUPLICATE_TURN
        assert caught.value.exit_code == 2

    def test_the_error_names_the_duplicated_turn(self) -> None:
        with pytest.raises(SubStageError) as caught:
            load_speaker_map(FIXTURES / "speaker-map-duplicate-turn.yaml")
        assert caught.value.details["turnId"] == "turn-0001"

    def test_two_distinct_turn_ids_are_fine(self) -> None:
        # The negative control: the rule catches duplicates, not plurality.
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        assert len(corrections) == 2


class TestUnknownTurnRejection:
    """A stale map means the turns moved; its other names are wrong too."""

    def test_an_unknown_turn_id_is_a_validation_failure(self, turns: list[dict]) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-unknown-turn.yaml")
        with pytest.raises(SubStageError) as caught:
            validate_against_turns(corrections, turns)
        assert caught.value.code == CODE_UNKNOWN_TURN
        assert caught.value.exit_code == 2

    def test_the_error_names_the_unknown_turn_and_the_known_ones(self, turns: list[dict]) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-unknown-turn.yaml")
        with pytest.raises(SubStageError) as caught:
            validate_against_turns(corrections, turns)
        assert caught.value.details["unknownTurnIds"] == ["turn-9999"]
        assert caught.value.details["knownTurnIds"] == ["turn-0001", "turn-0002"]

    def test_a_known_turn_id_passes(self, turns: list[dict]) -> None:
        validate_against_turns(load_speaker_map(FIXTURES / "speaker-map-valid.yaml"), turns)

    def test_correcting_an_empty_turn_list_is_a_failure(self) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        with pytest.raises(SubStageError) as caught:
            validate_against_turns(corrections, [])
        assert caught.value.code == CODE_UNKNOWN_TURN


class TestApplication:
    """A correction is added lineage, never a replacement."""

    def test_the_correction_lands_in_the_correction_field(self, turns: list[dict]) -> None:
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        corrected = apply_speaker_map(turns, corrections)
        assert corrected[0]["correction"] == {
            "name": "Ada Lovelace",
            "author": "reviewer@example.com",
            "correctedAt": "2026-07-21T10:00:00Z",
        }

    def test_the_original_inference_is_preserved(self, turns: list[dict]) -> None:
        # The whole reason both are kept: a WRONG correction must stay traceable
        # and distinguishable from what the engine actually inferred.
        corrections = load_speaker_map(FIXTURES / "speaker-map-valid.yaml")
        corrected = apply_speaker_map(turns, corrections)
        assert corrected[0]["inferredLabel"] == "speaker_1"
        assert corrected[0]["inferredConfidence"] == 0.25
        assert corrected[0]["lowConfidence"] is True

    def test_an_uncorrected_turn_keeps_a_null_correction(self, turns: list[dict]) -> None:
        corrected = apply_speaker_map(
            turns, [SpeakerCorrection("turn-0001", "Ada", "a@b.c", "2026-07-21T10:00:00Z")]
        )
        assert corrected[1]["correction"] is None

    def test_the_input_turns_are_never_mutated(self, turns: list[dict]) -> None:
        before = copy.deepcopy(turns)
        apply_speaker_map(turns, load_speaker_map(FIXTURES / "speaker-map-valid.yaml"))
        assert turns == before

    def test_the_corrected_turn_still_validates_against_the_contract(self, turns: list[dict]) -> None:
        from cutdown_contracts.source_index_v1 import SpeakerTurn

        corrected = apply_speaker_map(turns, load_speaker_map(FIXTURES / "speaker-map-valid.yaml"))
        for item in corrected:
            SpeakerTurn.model_validate(item)


class TestFailureLeavesTheInferenceUntouched:
    """A refused map must change nothing at all."""

    def test_an_unknown_turn_leaves_every_turn_untouched(self, turns: list[dict]) -> None:
        before = copy.deepcopy(turns)
        corrections = load_speaker_map(FIXTURES / "speaker-map-unknown-turn.yaml")
        with pytest.raises(SubStageError):
            apply_speaker_map(turns, corrections)
        assert turns == before, "the VALID entry in that file must not land either"
        assert all(t["correction"] is None for t in turns)

    def test_a_rejected_map_leaves_the_artefact_byte_identical(self, artefact: dict) -> None:
        before = json.dumps(artefact, sort_keys=True)
        with pytest.raises(SubStageError):
            apply_speaker_map_to_artefact(artefact, FIXTURES / "speaker-map-unknown-turn.yaml")
        assert json.dumps(artefact, sort_keys=True) == before

    def test_a_duplicate_map_leaves_the_artefact_byte_identical(self, artefact: dict) -> None:
        before = json.dumps(artefact, sort_keys=True)
        with pytest.raises(SubStageError):
            apply_speaker_map_to_artefact(artefact, FIXTURES / "speaker-map-duplicate-turn.yaml")
        assert json.dumps(artefact, sort_keys=True) == before

    def test_a_successful_application_does_not_mutate_the_input_artefact(self, artefact: dict) -> None:
        before = json.dumps(artefact, sort_keys=True)
        updated = apply_speaker_map_to_artefact(artefact, FIXTURES / "speaker-map-valid.yaml")
        assert json.dumps(artefact, sort_keys=True) == before
        assert updated["speakerTurns"][0]["correction"] is not None

    def test_the_transcript_side_is_untouched_by_a_speaker_correction(self, artefact: dict) -> None:
        updated = apply_speaker_map_to_artefact(artefact, FIXTURES / "speaker-map-valid.yaml")
        assert updated["transcript"] == artefact["transcript"]

    def test_an_artefact_without_turns_is_rejected(self) -> None:
        with pytest.raises(SubStageError) as caught:
            apply_speaker_map_to_artefact({"transcript": {}}, FIXTURES / "speaker-map-valid.yaml")
        assert caught.value.code == CODE_INVALID


class TestCli:
    """`--speaker-map <yaml>` — exit code 2 on any validation failure."""

    def _write(self, tmp_path: Path, artefact: dict) -> Path:
        path = tmp_path / "transcript.json"
        path.write_text(json.dumps(artefact), encoding="utf-8")
        return path

    def test_a_valid_map_is_applied_and_written(self, tmp_path: Path, artefact: dict) -> None:
        source = self._write(tmp_path, artefact)
        out = tmp_path / "out.json"
        code = main(
            [
                "--transcript",
                str(source),
                "--speaker-map",
                str(FIXTURES / "speaker-map-valid.yaml"),
                "--out",
                str(out),
            ]
        )
        assert code == 0
        written = json.loads(out.read_text(encoding="utf-8"))
        assert written["speakerTurns"][0]["correction"]["name"] == "Ada Lovelace"
        assert written["speakerTurns"][0]["inferredLabel"] == "speaker_1"

    def test_an_unknown_turn_exits_2_and_writes_nothing(
        self, tmp_path: Path, artefact: dict, capsys
    ) -> None:
        source = self._write(tmp_path, artefact)
        out = tmp_path / "out.json"
        code = main_guard(
            lambda: main(
                [
                    "--transcript",
                    str(source),
                    "--speaker-map",
                    str(FIXTURES / "speaker-map-unknown-turn.yaml"),
                    "--out",
                    str(out),
                ]
            )
        )
        assert code == 2
        assert not out.exists(), "a refused map must not produce a half-corrected artefact"
        assert json.loads(capsys.readouterr().err)["code"] == CODE_UNKNOWN_TURN

    def test_a_duplicate_correction_exits_2(self, tmp_path: Path, artefact: dict, capsys) -> None:
        source = self._write(tmp_path, artefact)
        code = main_guard(
            lambda: main(
                [
                    "--transcript",
                    str(source),
                    "--speaker-map",
                    str(FIXTURES / "speaker-map-duplicate-turn.yaml"),
                ]
            )
        )
        assert code == 2
        assert json.loads(capsys.readouterr().err)["code"] == CODE_DUPLICATE_TURN

    def test_an_in_place_failure_leaves_the_original_file_intact(
        self, tmp_path: Path, artefact: dict, capsys
    ) -> None:
        source = self._write(tmp_path, artefact)
        before = source.read_text(encoding="utf-8")
        assert (
            main_guard(
                lambda: main(
                    [
                        "--transcript",
                        str(source),
                        "--speaker-map",
                        str(FIXTURES / "speaker-map-duplicate-turn.yaml"),
                    ]
                )
            )
            == 2
        )
        capsys.readouterr()
        assert source.read_text(encoding="utf-8") == before

    def test_a_missing_transcript_exits_2(self, tmp_path: Path, capsys) -> None:
        code = main_guard(
            lambda: main(
                [
                    "--transcript",
                    str(tmp_path / "nope.json"),
                    "--speaker-map",
                    str(FIXTURES / "speaker-map-valid.yaml"),
                ]
            )
        )
        assert code == 2
        assert json.loads(capsys.readouterr().err)["code"] == CODE_UNREADABLE

    def test_a_corrupt_transcript_exits_2(self, tmp_path: Path, capsys) -> None:
        source = tmp_path / "transcript.json"
        source.write_text("{not json", encoding="utf-8")
        code = main_guard(
            lambda: main(
                [
                    "--transcript",
                    str(source),
                    "--speaker-map",
                    str(FIXTURES / "speaker-map-valid.yaml"),
                ]
            )
        )
        assert code == 2
        assert json.loads(capsys.readouterr().err)["code"] == CODE_UNREADABLE
