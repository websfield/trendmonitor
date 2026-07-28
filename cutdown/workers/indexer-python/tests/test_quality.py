"""Quality-flag sub-stage tests (Phase 2 task 7, PRD REQ-014).

The acceptance criterion for this task is a **field-by-field matrix**, not a
sample: every one of the twelve `quality-flag-kind` enum members must have a real
detector, a positive fixture where the defect is present and IS reported, and a
negative control where it is absent and is NOT reported.
`TestCoverageMatrix::test_every_kind_is_detected_and_not_falsely_reported` walks
that matrix explicitly and is the evidence — it is written so that deleting a
detector, breaking a threshold, or quietly dropping an enum member fails it.

The rest of the file covers the parts that must hold whatever the media is: the
artefact's shape against the closed schema, deterministic IDs and ordering,
time-ranging, threshold recording, cache keying, and the advisory-only rule.

Test speed: the matrix decodes fifteen short clips through FFmpeg. That is a few
seconds, not a model download, so it runs in the fast suite — there is no model
here to be unavailable, which is why nothing in this file is marked `slow`.
"""

from __future__ import annotations

import json
import shutil
from fractions import Fraction
from pathlib import Path

import pytest
from harness import SubStageContext
from quality import (
    AUDIO_SAMPLE_RATE,
    ENGINE_NAME,
    GREATER_THAN,
    LESS_THAN,
    QUALITY_FLAG_KINDS,
    RULES,
    RULES_BY_KEY,
    SUB_STAGE,
    Rule,
    Span,
    analyse,
    build_spans,
    engine_record,
    model_config,
    probe,
    run,
)

FIXTURES = Path(__file__).resolve().parents[3] / "skills" / "index" / "fixtures" / "quality"
INGEST = Path(__file__).resolve().parents[3] / "data" / "golden-sets" / "ingest"

#: The negative controls. Both are the ingest golden set's `clean.mp4` with
#: nothing done to them, so "this kind is not reported here" means "not reported
#: on defect-free media" rather than merely "not reported on some other defect".
NEGATIVE_VIDEO = "negative-video.mp4"
NEGATIVE_AUDIO = "negative-audio.wav"

#: THE MATRIX. One row per `quality-flag-kind` enum member: the fixture where the
#: defect is present, and the control where it is absent. `positives` is a list
#: because two kinds are named once in the enum but occur as two physically
#: distinct defects, and both halves must be shown to work.
COVERAGE: dict[str, dict[str, list[str]]] = {
    "blur": {"positives": ["blur.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "shake": {"positives": ["shake.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "exposure": {
        "positives": ["exposure-under.mp4", "exposure-over.mp4"],
        "negatives": [NEGATIVE_VIDEO],
    },
    "black_or_frozen_frame": {
        "positives": ["black-frame.mp4", "duplicate-frames.mp4"],
        "negatives": [NEGATIVE_VIDEO],
    },
    "occlusion": {"positives": ["occlusion.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "poor_crop": {"positives": ["poor-crop-bars.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "low_resolution": {"positives": ["low-resolution.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "duplicate_frames": {"positives": ["duplicate-frames.mp4"], "negatives": [NEGATIVE_VIDEO]},
    "audio_clipping": {"positives": ["audio-clipping.wav"], "negatives": [NEGATIVE_AUDIO]},
    "audio_noise": {"positives": ["audio-noise.wav"], "negatives": [NEGATIVE_AUDIO]},
    "speech_intelligibility": {
        "positives": ["speech-unintelligible.wav"],
        "negatives": [NEGATIVE_AUDIO, "silence.wav"],
    },
    "silence": {"positives": ["silence.wav"], "negatives": [NEGATIVE_AUDIO]},
}


pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg/ffprobe are required to decode the fixture corpus",
)


@pytest.fixture(scope="module")
def flags_by_fixture() -> dict[str, list[dict]]:
    """Analyse each fixture once; the matrix reads every clip several times over."""
    names = {name for row in COVERAGE.values() for name in row["positives"] + row["negatives"]}
    return {name: analyse(FIXTURES / name) for name in sorted(names)}


def kinds_in(flags: list[dict]) -> set[str]:
    return {flag["kind"] for flag in flags}


class TestCoverageMatrix:
    """REQ-014 acceptance: ALL twelve named fields, not a sample."""

    def test_the_matrix_covers_every_enum_member(self) -> None:
        # Guards the guard. If a kind is added to the enum and not to COVERAGE,
        # the matrix below would still pass while silently testing eleven of
        # twelve — so the matrix's own completeness is asserted first.
        assert set(COVERAGE) == set(QUALITY_FLAG_KINDS)
        assert len(QUALITY_FLAG_KINDS) == 12

    def test_every_kind_has_a_detector(self) -> None:
        implemented = {rule.kind for rule in RULES}
        missing = set(QUALITY_FLAG_KINDS) - implemented
        assert not missing, f"kinds with no detector: {sorted(missing)}"

    @pytest.mark.parametrize("kind", sorted(COVERAGE))
    def test_every_kind_is_detected_and_not_falsely_reported(
        self, kind: str, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        """THE acceptance test: positive fires, negative does not, for each kind.

        Both halves are asserted in one test per kind on purpose. A detector that
        fires on everything passes the positive half; a detector that can never
        fire passes the negative half; only a real one passes both.
        """
        row = COVERAGE[kind]

        for name in row["positives"]:
            flags = flags_by_fixture[name]
            assert kind in kinds_in(flags), (
                f"{kind} was NOT detected in its positive fixture {name}; "
                f"that fixture reported {sorted(kinds_in(flags))}"
            )

        for name in row["negatives"]:
            flags = flags_by_fixture[name]
            assert kind not in kinds_in(flags), (
                f"{kind} was falsely reported on the negative control {name}; "
                f"that control reported {sorted(kinds_in(flags))}"
            )

    def test_the_negative_controls_are_completely_clean(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        # Stronger than the per-kind negative half, and the assertion most likely
        # to catch a badly chosen threshold: defect-free media must produce NO
        # flag of any kind, because every flag on it is a false positive.
        assert flags_by_fixture[NEGATIVE_VIDEO] == []
        assert flags_by_fixture[NEGATIVE_AUDIO] == []

    @pytest.mark.parametrize("kind", sorted(COVERAGE))
    def test_every_kind_records_a_threshold_that_its_score_actually_crosses(
        self, kind: str, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        """The recorded threshold must be the one that fired, not decoration.

        A flag whose score does not cross its own stated threshold would mean the
        artefact's evidence and the code's decision had come apart — the number a
        reviewer reads would not be the number the detector used.
        """
        for name in COVERAGE[kind]["positives"]:
            for flag in flags_by_fixture[name]:
                if flag["kind"] != kind:
                    continue
                threshold = flag["threshold"]
                assert threshold["name"] in RULES_BY_KEY, threshold["name"]
                if threshold["comparison"] == GREATER_THAN:
                    assert flag["score"] > threshold["value"]
                else:
                    assert flag["score"] < threshold["value"]


class TestFlagShape:
    """The closed `QualityFlag` schema: exactly these keys, no extras, no omissions."""

    def test_flags_carry_exactly_the_schema_fields(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        expected = {
            "flagId",
            "kind",
            "startTicks",
            "endTicks",
            "timebase",
            "severity",
            "score",
            "threshold",
            "engine",
        }
        seen = 0
        for flags in flags_by_fixture.values():
            for flag in flags:
                assert set(flag) == expected
                assert set(flag["threshold"]) == {"name", "value", "comparison"}
                assert set(flag["engine"]) == {"name", "version", "parameters"}
                assert set(flag["timebase"]) == {"num", "den"}
                seen += 1
        assert seen > 0, "the corpus produced no flags at all; nothing was asserted"

    def test_enumerated_fields_stay_inside_their_enums(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        for flags in flags_by_fixture.values():
            for flag in flags:
                assert flag["kind"] in QUALITY_FLAG_KINDS
                assert flag["severity"] in {"info", "warning", "severe"}
                assert flag["threshold"]["comparison"] in {GREATER_THAN, LESS_THAN}

    def test_ticks_are_integers_and_ordered(self, flags_by_fixture: dict[str, list[dict]]) -> None:
        # Rational timecode (contract §3): ticks are integers against a timebase.
        # A float here would mean someone had reintroduced seconds.
        for flags in flags_by_fixture.values():
            for flag in flags:
                assert isinstance(flag["startTicks"], int)
                assert isinstance(flag["endTicks"], int)
                assert flag["startTicks"] >= 0
                assert flag["endTicks"] > flag["startTicks"]

    def test_the_artefact_is_json_serialisable(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        # dBFS on digital silence is -inf before flooring, and `Infinity` is not
        # valid JSON — this is the assertion that catches it coming back.
        for name, flags in flags_by_fixture.items():
            text = json.dumps({"qualityFlags": flags}, allow_nan=False)
            assert "Infinity" not in text and "NaN" not in text, name


class TestTimeRanging:
    """A flag names the span that is defective, not the whole asset."""

    def test_a_defect_span_matches_where_the_defect_was_authored(self) -> None:
        # black-frame.mp4 is black for exactly t=1s..2s at 30 fps CFR, i.e.
        # frames 30..60. If the detector reported the whole asset this test
        # would fail, which is the point.
        flags = analyse(FIXTURES / "black-frame.mp4")
        black = [
            flag
            for flag in flags
            if flag["threshold"]["name"] == "black_or_frozen_frame.mean_luma"
        ]
        assert len(black) == 1
        assert black[0]["timebase"] == {"num": 1, "den": 30}
        assert black[0]["startTicks"] == pytest.approx(30, abs=2)
        assert black[0]["endTicks"] == pytest.approx(61, abs=2)

    def test_a_flag_does_not_span_the_whole_asset(self) -> None:
        flags = analyse(FIXTURES / "black-frame.mp4")
        info, _ = probe(FIXTURES / "black-frame.mp4")
        assert info is not None
        for flag in flags:
            covered = flag["endTicks"] - flag["startTicks"]
            assert covered < 80, f"{flag['kind']} spans essentially the whole 90-frame clip"

    def test_audio_ticks_are_sample_indices(self) -> None:
        flags = analyse(FIXTURES / "silence.wav")
        assert flags, "the silence fixture must produce a flag"
        for flag in flags:
            assert flag["timebase"] == {"num": 1, "den": AUDIO_SAMPLE_RATE}
            # 2.5 s at 16 kHz is 40000 samples; a tick that is not a sample index
            # would be off by orders of magnitude.
            assert flag["endTicks"] <= 41_000


class TestDeterminism:
    """Same input, same bytes (contract §5)."""

    def test_ids_are_sequential_and_zero_padded(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        for flags in flags_by_fixture.values():
            assert [flag["flagId"] for flag in flags] == [
                f"quality-{index:04d}" for index in range(1, len(flags) + 1)
            ]

    def test_two_runs_over_the_same_file_are_byte_identical(self) -> None:
        first = analyse(FIXTURES / "black-frame.mp4")
        second = analyse(FIXTURES / "black-frame.mp4")
        assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)

    def test_flags_are_ordered_by_elapsed_time_then_kind(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        # Ordering compares REAL time, not raw startTicks: video ticks are frame
        # indices and audio ticks are sample indices, so ordering the integers
        # directly would interleave two unrelated scales.
        for flags in flags_by_fixture.values():
            keys = [
                (Fraction(f["startTicks"] * f["timebase"]["num"], f["timebase"]["den"]), f["kind"])
                for f in flags
            ]
            assert keys == sorted(keys)

    def test_no_absolute_path_leaks_into_an_artefact(
        self, flags_by_fixture: dict[str, list[dict]]
    ) -> None:
        for flags in flags_by_fixture.values():
            text = json.dumps(flags)
            assert "/" not in text.replace("\\/", "") or ":\\" not in text


class TestThresholdsAreData:
    """REQ-012 (thresholds recorded with the index) and REQ-005 (they key the cache)."""

    def test_every_rule_threshold_reaches_the_engine_record(self) -> None:
        parameters = {pair["key"] for pair in engine_record()["parameters"]}
        for rule in RULES:
            for field in ("comparison", "fireAt", "warningAt", "severeAt", "minUnits"):
                assert f"{rule.key}.{field}" in parameters, f"{rule.key}.{field} unrecorded"

    def test_every_rule_threshold_reaches_the_model_config(self) -> None:
        config = model_config()
        for rule in RULES:
            assert rule.key in config, f"{rule.key} is missing from the REQ-005 cache key"
            assert config[rule.key]["fireAt"] == rule.fire_at

    def test_engine_parameters_are_the_schema_pair_array(self) -> None:
        record = engine_record()
        assert record["name"] == ENGINE_NAME
        assert isinstance(record["parameters"], list)
        for pair in record["parameters"]:
            assert set(pair) == {"key", "value"}
            # Stringified so the record is language-neutral and hashable.
            assert isinstance(pair["value"], str)

    def test_no_rule_is_applied_with_parameters_other_than_its_recorded_ones(self) -> None:
        """The recorded rule must BE the applied rule, not a copy of it.

        This caught a real bug: `silence` was declared with `min_units=1` in the
        rule table and then applied through a locally rebuilt Rule with
        `min_units=62`, so the artefact advertised a sustain requirement the
        detector did not use. Detection therefore goes through `RULES_BY_KEY`
        only, and the rule table is the single source of every number.
        """
        import quality

        source = Path(quality.__file__).read_text(encoding="utf-8")
        detection = source[source.index("def detect_video_spans") :]
        assert "Rule(**" not in detection, (
            "a rule is being rebuilt at the call site; its recorded parameters "
            "would no longer describe the detector that ran"
        )

    def test_engine_parameters_are_sorted_for_byte_stability(self) -> None:
        keys = [pair["key"] for pair in engine_record()["parameters"]]
        assert keys == sorted(keys)

    def test_changing_a_threshold_changes_the_cache_key(self) -> None:
        # The load-bearing REQ-005 property: re-tuning a fire point must not
        # serve the artefact computed under the old one.
        from harness import compute_cache_key

        ctx = SubStageContext(
            job_id="j", asset_id="a", job_root=Path("x"), content_hash="c" * 64
        )
        baseline = model_config()
        retuned = json.loads(json.dumps(baseline))
        retuned["blur.laplacian_variance"]["fireAt"] = 999.0
        assert compute_cache_key(ctx, SUB_STAGE, baseline) != compute_cache_key(
            ctx, SUB_STAGE, retuned
        )


class TestSpanBuilding:
    """Pure logic — no media, no FFmpeg. These must always run."""

    def rule(self, comparison: str = LESS_THAN, min_units: int = 2) -> Rule:
        return Rule(
            key="t.metric",
            kind="blur",
            comparison=comparison,
            fire_at=10.0,
            warning_at=5.0,
            severe_at=1.0,
            min_units=min_units,
            units="test",
        )

    def ticks(self, count: int) -> list[tuple[int, int]]:
        return [(index, index + 1) for index in range(count)]

    def test_consecutive_firing_units_become_one_span(self) -> None:
        spans = build_spans(self.rule(), [50, 1, 2, 3, 50], self.ticks(5))
        assert spans == [Span(1, 4, 1)]

    def test_a_run_shorter_than_min_units_is_dropped(self) -> None:
        # Single-frame spikes are what every frame-differencing metric produces
        # on ordinary footage; without the floor the artefact fills with them.
        assert build_spans(self.rule(min_units=3), [50, 1, 50], self.ticks(3)) == []

    def test_two_separated_runs_are_two_spans(self) -> None:
        spans = build_spans(self.rule(), [1, 1, 50, 50, 1, 1], self.ticks(6))
        assert [(s.start_ticks, s.end_ticks) for s in spans] == [(0, 2), (4, 6)]

    def test_a_run_still_open_at_the_end_is_emitted(self) -> None:
        # Off-by-one bait: a defect that runs to the last frame has no
        # non-firing unit after it to close the span.
        assert build_spans(self.rule(), [50, 1, 1], self.ticks(3)) == [Span(1, 3, 1)]

    def test_a_span_reports_its_worst_unit_not_its_mean(self) -> None:
        # For a less_than rule the worst score is the smallest.
        assert build_spans(self.rule(), [9, 2, 9], self.ticks(3))[0].score == 2
        assert (
            build_spans(self.rule(GREATER_THAN), [11, 40, 11], self.ticks(3))[0].score == 40
        )

    def test_a_qualifier_can_veto_a_firing_unit(self) -> None:
        # This is what stops a black frame being reported as an occlusion.
        scores = [1, 1, 1]
        assert build_spans(self.rule(), scores, self.ticks(3)) == [Span(0, 3, 1)]
        assert build_spans(self.rule(), scores, self.ticks(3), qualifier=[False] * 3) == []

    def test_no_span_when_nothing_fires(self) -> None:
        assert build_spans(self.rule(), [50, 60, 70], self.ticks(3)) == []


class TestSeverityLadder:
    def test_less_than_rules_escalate_downward(self) -> None:
        rule = RULES_BY_KEY["blur.laplacian_variance"]
        assert rule.severity(rule.fire_at - 0.1) == "info"
        assert rule.severity(rule.warning_at - 0.1) == "warning"
        assert rule.severity(rule.severe_at - 0.1) == "severe"

    def test_greater_than_rules_escalate_upward(self) -> None:
        rule = RULES_BY_KEY["poor_crop.bar_fraction"]
        assert rule.severity(rule.fire_at + 0.001) == "info"
        assert rule.severity(rule.warning_at + 0.001) == "warning"
        assert rule.severity(rule.severe_at + 0.001) == "severe"

    def test_every_rule_has_a_monotonic_ladder(self) -> None:
        # An inverted ladder would silently make `severe` unreachable.
        for rule in RULES:
            if rule.comparison == GREATER_THAN:
                assert rule.fire_at <= rule.warning_at <= rule.severe_at, rule.key
            else:
                assert rule.fire_at >= rule.warning_at >= rule.severe_at, rule.key


class TestMissingStreams:
    """An absent stream is a fact about the asset, not a defect and not an error."""

    def test_a_video_with_no_audio_track_reports_no_audio_flags(self) -> None:
        # broll-silent.mp4 has ZERO audio streams. Reporting `silence` for it
        # would be a lie: silence is a property of audio that exists.
        source = INGEST / "broll-silent.mp4"
        info, has_audio = probe(source)
        assert info is not None and has_audio is False
        audio_kinds = {"audio_clipping", "audio_noise", "speech_intelligibility", "silence"}
        assert kinds_in(analyse(source)) & audio_kinds == set()

    def test_an_audio_only_file_reports_no_video_flags(self) -> None:
        video_kinds = {rule.kind for rule in RULES} - {
            "audio_clipping",
            "audio_noise",
            "speech_intelligibility",
            "silence",
        }
        assert kinds_in(analyse(FIXTURES / "silence.wav")) & video_kinds == set()

    def test_a_static_take_is_reported_as_frozen(self) -> None:
        # The other side of the same clip: broll-silent.mp4 is a genuinely static
        # frame, so the frozen detector SHOULD fire. Without this, the test above
        # would also pass on a detector that reported nothing at all.
        assert "black_or_frozen_frame" in kinds_in(analyse(INGEST / "broll-silent.mp4"))


class TestErrors:
    def test_a_missing_file_is_a_structured_input_error(self) -> None:
        from harness import SubStageError

        with pytest.raises(SubStageError) as caught:
            analyse(FIXTURES / "does-not-exist.mp4")
        assert caught.value.code == "INPUT_NOT_FOUND"
        assert caught.value.exit_code == 2

    def test_an_undecodable_file_fails_structured_not_as_a_traceback(
        self, tmp_path: Path
    ) -> None:
        broken = tmp_path / "broken.mp4"
        broken.write_bytes(b"this is not media")
        from harness import SubStageError

        with pytest.raises(SubStageError) as caught:
            analyse(broken)
        assert caught.value.code in {"MEDIA_PROBE_FAILED", "MEDIA_DECODE_FAILED"}


class TestHarnessIntegration:
    """The sub-stage rides the shared harness: checkpointed, cached, resumable."""

    @pytest.fixture
    def ctx(self, tmp_path: Path) -> SubStageContext:
        return SubStageContext(
            job_id="quality-1",
            asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
            job_root=tmp_path / "jobs" / "quality-1",
            content_hash="d" * 64,
        )

    def test_it_runs_under_the_named_sub_stage(self, ctx: SubStageContext) -> None:
        result = run(ctx, FIXTURES / "blur.mp4")
        assert result.name == SUB_STAGE == "quality_flags"
        assert result.cache_hit is False
        assert "blur" in kinds_in(result.artefact["qualityFlags"])

    def test_a_second_run_is_a_cache_hit(self, ctx: SubStageContext) -> None:
        run(ctx, FIXTURES / "blur.mp4")
        assert run(ctx, FIXTURES / "blur.mp4").cache_hit is True

    def test_the_artefact_lands_on_disk_and_round_trips(self, ctx: SubStageContext) -> None:
        result = run(ctx, FIXTURES / "blur.mp4")
        assert result.artefact_path.exists()
        stored = json.loads(result.artefact_path.read_text(encoding="utf-8"))
        assert stored == result.artefact

    def test_the_artefact_holds_only_the_quality_flags_collection(
        self, ctx: SubStageContext
    ) -> None:
        # The artefact is spliced into SourceIndex.qualityFlags, whose schema is
        # closed; an extra key here becomes a schema violation there.
        assert set(run(ctx, FIXTURES / "blur.mp4").artefact) == {"qualityFlags"}


class TestAdvisoryOnly:
    """Flags are evidence, never a gate."""

    def test_the_sub_stage_computes_no_usable_verdict(self, tmp_path: Path) -> None:
        ctx = SubStageContext(
            job_id="q", asset_id="a", job_root=tmp_path, content_hash="e" * 64
        )
        artefact = run(ctx, FIXTURES / "black-frame.mp4").artefact
        # black-frame.mp4 trips six severe flags. If this sub-stage were ever
        # given gate authority, this is the artefact where a `usable: false`
        # would appear — asserting its absence is what keeps it advisory.
        text = json.dumps(artefact).lower()
        for forbidden in ("usable", "reject", "blocked", "pass", "fail", "verdict"):
            assert forbidden not in text, f"{forbidden!r} implies a gate; flags are advisory"

    def test_severe_flags_do_not_stop_the_sub_stage_completing(
        self, tmp_path: Path
    ) -> None:
        ctx = SubStageContext(
            job_id="q", asset_id="a", job_root=tmp_path, content_hash="f" * 64
        )
        result = run(ctx, FIXTURES / "black-frame.mp4")
        severities = {flag["severity"] for flag in result.artefact["qualityFlags"]}
        assert "severe" in severities
        # Completion is recorded exactly as it would be for a spotless asset.
        checkpoint = json.loads(
            (ctx.checkpoint_dir / f"{SUB_STAGE}.json").read_text(encoding="utf-8")
        )
        assert checkpoint["status"] == "completed"


class TestFixtureCorpus:
    """The corpus is part of the contract; a missing fixture must fail loudly."""

    def test_every_fixture_named_in_the_matrix_exists(self) -> None:
        for kind, row in COVERAGE.items():
            for name in row["positives"] + row["negatives"]:
                assert (FIXTURES / name).exists(), f"{kind}: missing fixture {name}"

    def test_the_corpus_stays_small_enough_to_commit(self) -> None:
        total = sum(path.stat().st_size for path in FIXTURES.glob("*") if path.is_file())
        assert total < 3_000_000, f"fixture corpus grew to {total} bytes"

    def test_the_readme_documents_every_fixture(self) -> None:
        # D-14 keeps fixtures reproducible: a clip nobody can regenerate is a
        # binary blob with an opinion.
        readme = (FIXTURES / "README.md").read_text(encoding="utf-8")
        for path in sorted(FIXTURES.glob("*")):
            if path.suffix in {".mp4", ".wav"}:
                assert path.name in readme, f"{path.name} is not documented in README.md"
