"""Visual-description sub-stage tests (Phase 2 task 5).

The behaviours the phase plan names as acceptance evidence:

* the `--no-vlm` fixture asserting **descriptions absent, reason present**;
* the recorded-model fixture (tech-spec §6.6) replayed for byte-stable
  regression, plus property assertions — every description references a real
  `shotId`, and `keyframeCount` equals the number of frames actually sent;
* selective keyframes, never every frame;
* degraded paths that skip with a reason and NEVER fabricate a description.

No test opens a socket and no test needs a media file: the transport and the
keyframe loader are both injected.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import pytest
from harness import SubStageContext, read_checkpoint
from model_gateway import GatewayConfig, ModelUnavailableError
from visual import (
    KEYFRAME_POLICY,
    SECONDS_PER_EXTRA_KEYFRAME,
    SUB_STAGE,
    KeyframeImage,
    keyframe_budget,
    run_visual_descriptions,
    select_keyframe_ticks,
)

FIXTURES = Path(__file__).resolve().parents[3] / "skills" / "index" / "fixtures" / "visual"
FIXED_CLOCK = "2026-07-21T00:00:00Z"
FAKE_KEY = "sk-ant-test-0123456789abcdef"


def fixed_clock() -> str:
    return FIXED_CLOCK


def load_fixture(case: str, name: str) -> Any:
    return json.loads((FIXTURES / case / name).read_text(encoding="utf-8"))


@pytest.fixture
def ctx(tmp_path: Path) -> SubStageContext:
    return SubStageContext(
        job_id="visual-1",
        asset_id="01HQZX3F5G7K9M2N4P6R8S0T2V",
        job_root=tmp_path / "jobs" / "visual-1",
        content_hash="c" * 64,
    )


def enabled_config(**overrides: Any) -> GatewayConfig:
    """A config that WOULD permit a call — key plus an explicit spend ceiling."""
    base = {"api_key": FAKE_KEY, "spend_ceiling_aud": 25.0}
    return GatewayConfig(**{**base, **overrides})


class RecordedTransport:
    """Replays `recorded-model.json` in shot order (tech-spec §6.6).

    Also records every payload, so the tests can assert how many images were
    actually sent — the other half of the `keyframeCount` claim.
    """

    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self._responses = list(responses)
        self.payloads: list[dict[str, Any]] = []

    def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
        self.payloads.append(payload)
        if not self._responses:
            raise AssertionError("more model calls than recorded responses")
        return self._responses.pop(0)

    def image_counts(self) -> list[int]:
        return [
            sum(
                1
                for block in payload["messages"][0]["content"]
                if block.get("type") == "image"
            )
            for payload in self.payloads
        ]


def fake_keyframe_loader(shot: dict[str, Any], ticks: int) -> KeyframeImage:
    """A one-pixel stand-in; this sub-stage does not own frame extraction."""
    return KeyframeImage(
        ticks=ticks,
        media_type="image/jpeg",
        data_base64=base64.b64encode(f"{shot['shotId']}@{ticks}".encode()).decode(),
    )


class ExplodingLoader:
    """Stands in for an extractor that cannot produce frames."""

    def __call__(self, shot: dict[str, Any], ticks: int) -> KeyframeImage:
        raise ModelUnavailableError("ffmpeg/keyframe", "no decoder for this stream")


# --- keyframe selection -----------------------------------------------------


class TestSelectiveKeyframes:
    """PRD §10.7 minimisation: selective keyframes, never every frame."""

    def _shot(self, start: int, end: int, keyframe: int) -> dict[str, Any]:
        return {
            "shotId": "shot-0001",
            "startTicks": start,
            "endTicks": end,
            "timebase": {"num": 1, "den": 1000},
            "keyframeTicks": keyframe,
        }

    def test_a_short_shot_costs_exactly_one_frame(self) -> None:
        shot = self._shot(0, 2000, 1000)
        assert select_keyframe_ticks(shot, max_keyframes=3) == [1000]

    def test_a_long_shot_earns_more_frames_up_to_the_cap(self) -> None:
        # 12s at one extra per 5s earns 3; the cap is 3.
        shot = self._shot(2000, 14000, 5000)
        assert keyframe_budget(shot, 3) == 3
        assert len(select_keyframe_ticks(shot, max_keyframes=3)) == 3

    def test_the_cap_is_binding(self) -> None:
        # A 10-minute shot must not send 120 frames. This is the cost control.
        shot = self._shot(0, 600_000, 1000)
        assert keyframe_budget(shot, 3) == 3
        assert len(select_keyframe_ticks(shot, max_keyframes=3)) == 3

    def test_a_max_of_one_sends_one_frame_however_long_the_shot(self) -> None:
        shot = self._shot(0, 600_000, 1000)
        assert select_keyframe_ticks(shot, max_keyframes=1) == [1000]

    def test_the_shots_declared_keyframe_is_always_included(self) -> None:
        shot = self._shot(2000, 14000, 5000)
        assert 5000 in select_keyframe_ticks(shot, max_keyframes=3)

    def test_selection_is_deterministic(self) -> None:
        shot = self._shot(2000, 14000, 5000)
        assert select_keyframe_ticks(shot, 3) == select_keyframe_ticks(shot, 3)

    def test_ticks_are_sorted_deduplicated_and_inside_the_shot(self) -> None:
        shot = self._shot(14000, 20000, 15000)
        ticks = select_keyframe_ticks(shot, max_keyframes=3)
        assert ticks == sorted(set(ticks))
        assert all(14000 <= tick < 20000 for tick in ticks)

    def test_every_tick_is_an_integer_never_float_seconds(self) -> None:
        # Contract §3: no float seconds ever reach a value we emit or index by.
        shot = self._shot(2000, 14000, 5000)
        assert all(isinstance(tick, int) for tick in select_keyframe_ticks(shot, 3))


# --- the REQUIRED --no-vlm skip path ---------------------------------------


class TestNoVlmSkipSemantics:
    """`--no-vlm` is the DEFAULT until the D-21 ceiling is set."""

    def test_skipping_is_the_default_with_no_arguments(self, ctx: SubStageContext) -> None:
        shots = load_fixture("no-vlm", "input.json")["shots"]
        artefact = run_visual_descriptions(ctx, shots, clock=fixed_clock).artefact
        assert artefact["visualDescriptions"] == []
        assert artefact["subStage"]["status"] == "skipped"

    def test_matches_the_no_vlm_fixture_exactly(self, ctx: SubStageContext) -> None:
        # The phase plan's required fixture: descriptions absent, reason present.
        case = load_fixture("no-vlm", "input.json")
        expected = load_fixture("no-vlm", "expected-output.json")
        artefact = run_visual_descriptions(
            ctx, case["shots"], enable_vlm=case["options"]["enableVlm"], clock=fixed_clock
        ).artefact
        assert artefact == expected

    def test_descriptions_absent_and_reason_present(self, ctx: SubStageContext) -> None:
        shots = load_fixture("no-vlm", "input.json")["shots"]
        record = run_visual_descriptions(ctx, shots, clock=fixed_clock).artefact["subStage"]
        assert record["status"] == "skipped"
        assert record["reason"] is not None and record["reason"].strip() != ""
        assert record["engine"] is None, "a skipped stage names no engine"

    def test_the_skip_never_calls_the_transport(self, ctx: SubStageContext) -> None:
        transport = RecordedTransport([])
        shots = load_fixture("no-vlm", "input.json")["shots"]
        run_visual_descriptions(
            ctx,
            shots,
            enable_vlm=False,
            config=enabled_config(),
            transport=transport,
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        # Even fully configured, --no-vlm must not spend money.
        assert transport.payloads == []

    def test_a_configuration_skip_is_cached_not_recomputed(self, ctx: SubStageContext) -> None:
        shots = load_fixture("no-vlm", "input.json")["shots"]
        run_visual_descriptions(ctx, shots, clock=fixed_clock)
        second = run_visual_descriptions(ctx, shots, clock=fixed_clock)
        assert second.cache_hit is True, "a stable skip is a stable answer"


class TestDegradedPathsSkipAndNeverFabricate:
    def test_no_spend_ceiling_degrades_to_a_skip(self, ctx: SubStageContext) -> None:
        # D-21's ceiling is owner-set and NOT SET: enabling the flag is not
        # enough to authorise a paid call.
        artefact = run_visual_descriptions(
            ctx,
            load_fixture("no-vlm", "input.json")["shots"],
            enable_vlm=True,
            config=GatewayConfig(api_key=FAKE_KEY, spend_ceiling_aud=None),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        ).artefact
        assert artefact["visualDescriptions"] == []
        assert artefact["subStage"]["status"] == "skipped"
        assert "CUTDOWN_SPEND_CEILING_AUD" in artefact["subStage"]["reason"]

    def test_a_missing_api_key_degrades_to_a_skip(self, ctx: SubStageContext) -> None:
        artefact = run_visual_descriptions(
            ctx,
            load_fixture("no-vlm", "input.json")["shots"],
            enable_vlm=True,
            config=GatewayConfig(api_key=None, spend_ceiling_aud=25.0),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        ).artefact
        assert artefact["visualDescriptions"] == []
        assert "ANTHROPIC_API_KEY" in artefact["subStage"]["reason"]

    def test_a_provider_error_skips_with_a_reason_and_no_invented_text(
        self, ctx: SubStageContext
    ) -> None:
        class FailingTransport:
            def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
                raise ModelUnavailableError("anthropic/claude-sonnet-5", "provider unreachable")

        artefact = run_visual_descriptions(
            ctx,
            load_fixture("recorded-shot-descriptions", "input.json")["shots"],
            enable_vlm=True,
            config=enabled_config(),
            transport=FailingTransport(),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        ).artefact
        assert artefact["visualDescriptions"] == [], "never invent text"
        assert artefact["subStage"]["status"] == "skipped"
        assert "MODEL_UNAVAILABLE" in artefact["subStage"]["reason"]

    def test_a_partial_run_keeps_nothing(self, ctx: SubStageContext) -> None:
        # First shot succeeds, second fails. A half-built list is worse than an
        # empty one: a caller cannot tell which shots were never described.
        recorded = load_fixture("recorded-shot-descriptions", "recorded-model.json")

        class HalfFailingTransport:
            def __init__(self) -> None:
                self.calls = 0

            def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
                self.calls += 1
                if self.calls == 1:
                    return recorded["responses"][0]
                raise ModelUnavailableError("anthropic/claude-sonnet-5", "rate limited")

        artefact = run_visual_descriptions(
            ctx,
            load_fixture("recorded-shot-descriptions", "input.json")["shots"],
            enable_vlm=True,
            config=enabled_config(),
            transport=HalfFailingTransport(),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        ).artefact
        assert artefact["visualDescriptions"] == []

    def test_a_missing_keyframe_extractor_degrades_rather_than_crashes(
        self, ctx: SubStageContext
    ) -> None:
        artefact = run_visual_descriptions(
            ctx,
            load_fixture("no-vlm", "input.json")["shots"],
            enable_vlm=True,
            config=enabled_config(),
            transport=RecordedTransport([]),
            keyframe_loader=None,
            clock=fixed_clock,
        ).artefact
        assert artefact["subStage"]["status"] == "skipped"
        assert "keyframe extractor" in artefact["subStage"]["reason"]

    def test_an_extractor_failure_degrades_rather_than_crashes(
        self, ctx: SubStageContext
    ) -> None:
        artefact = run_visual_descriptions(
            ctx,
            load_fixture("no-vlm", "input.json")["shots"],
            enable_vlm=True,
            config=enabled_config(),
            transport=RecordedTransport([]),
            keyframe_loader=ExplodingLoader(),
            clock=fixed_clock,
        ).artefact
        assert artefact["visualDescriptions"] == []
        assert artefact["subStage"]["status"] == "skipped"

    def test_a_degradation_is_logged_at_warn(self, ctx: SubStageContext) -> None:
        run_visual_descriptions(
            ctx,
            load_fixture("no-vlm", "input.json")["shots"],
            enable_vlm=True,
            config=GatewayConfig(api_key=FAKE_KEY),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        entries = [
            json.loads(line)
            for line in ctx.run_log.read_text(encoding="utf-8").splitlines()
            if line
        ]
        warnings = [entry for entry in entries if entry.get("level") == "warn"]
        assert len(warnings) == 1
        assert warnings[0]["subStage"] == SUB_STAGE

    def test_a_runtime_degradation_is_retried_not_cached(self, ctx: SubStageContext) -> None:
        # The load-bearing resumability property: a provider outage must not
        # become this job's permanent "no visual descriptions".
        class FailingTransport:
            def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
                raise ModelUnavailableError("anthropic/claude-sonnet-5", "down")

        shots = load_fixture("recorded-shot-descriptions", "input.json")["shots"]
        run_visual_descriptions(
            ctx,
            shots,
            enable_vlm=True,
            config=enabled_config(),
            transport=FailingTransport(),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        assert read_checkpoint(ctx, SUB_STAGE) is None

        recorded = load_fixture("recorded-shot-descriptions", "recorded-model.json")
        retried = run_visual_descriptions(
            ctx,
            shots,
            enable_vlm=True,
            config=enabled_config(),
            transport=RecordedTransport(recorded["responses"]),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        assert retried.cache_hit is False
        assert len(retried.artefact["visualDescriptions"]) == 3


# --- the recorded-model case (tech-spec §6.6) -------------------------------


class TestRecordedModelRegression:
    @pytest.fixture
    def replayed(self, ctx: SubStageContext) -> tuple[dict[str, Any], RecordedTransport]:
        case = load_fixture("recorded-shot-descriptions", "input.json")
        recorded = load_fixture("recorded-shot-descriptions", "recorded-model.json")
        transport = RecordedTransport(recorded["responses"])
        artefact = run_visual_descriptions(
            ctx,
            case["shots"],
            enable_vlm=True,
            config=enabled_config(max_keyframes=case["options"]["maxKeyframes"]),
            transport=transport,
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        ).artefact
        return artefact, transport

    def test_byte_stable_against_the_recorded_expectation(self, replayed) -> None:
        artefact, _ = replayed
        assert artefact == load_fixture("recorded-shot-descriptions", "expected-output.json")

    def test_every_description_references_a_real_shot_id(self, replayed) -> None:
        artefact, _ = replayed
        case = load_fixture("recorded-shot-descriptions", "input.json")
        known = {shot["shotId"] for shot in case["shots"]}
        described = {item["shotId"] for item in artefact["visualDescriptions"]}
        assert described <= known
        assert described == known, "every shot gets exactly one description"

    def test_keyframe_count_matches_the_frames_actually_sent(self, replayed) -> None:
        # The auditable half of the minimisation claim: the recorded count is
        # what the VLM saw, not what was available.
        artefact, transport = replayed
        reported = [item["keyframeCount"] for item in artefact["visualDescriptions"]]
        assert reported == transport.image_counts()
        assert reported == [1, 3, 2]

    def test_it_is_selective_not_every_frame(self, replayed) -> None:
        _, transport = replayed
        # 20 seconds of footage; sending every frame at any sane rate would be
        # hundreds. Six is the whole point.
        assert sum(transport.image_counts()) == 6

    def test_scope_is_shot_at_phase_zero(self, replayed) -> None:
        artefact, _ = replayed
        assert all(item["scope"] == "shot" for item in artefact["visualDescriptions"])

    def test_description_ids_are_stable_zero_padded_ordinals(self, replayed) -> None:
        artefact, _ = replayed
        ids = [item["descriptionId"] for item in artefact["visualDescriptions"]]
        assert ids == ["visdesc-0001", "visdesc-0002", "visdesc-0003"]

    def test_every_description_records_provider_and_model_id(self, replayed) -> None:
        artefact, _ = replayed
        for item in artefact["visualDescriptions"]:
            assert item["engine"]["name"] == "anthropic"
            assert item["engine"]["version"] == "claude-sonnet-5"

    def test_the_engine_record_names_the_keyframe_policy(self, replayed) -> None:
        artefact, _ = replayed
        pairs = {
            pair["key"]: pair["value"]
            for pair in artefact["visualDescriptions"][0]["engine"]["parameters"]
        }
        assert pairs["keyframePolicy"] == KEYFRAME_POLICY
        assert pairs["secondsPerExtraKeyframe"] == str(SECONDS_PER_EXTRA_KEYFRAME)

    def test_no_credential_reaches_the_artefact(self, replayed) -> None:
        artefact, _ = replayed
        assert FAKE_KEY not in json.dumps(artefact)
        assert "sk-ant" not in json.dumps(artefact)

    def test_the_completed_record_carries_no_reason(self, replayed) -> None:
        artefact, _ = replayed
        record = artefact["subStage"]
        assert record["status"] == "completed"
        assert record["reason"] is None
        assert record["engine"] is not None

    def test_the_emitted_shape_has_exactly_the_contract_keys(self, replayed) -> None:
        artefact, _ = replayed
        assert set(artefact["visualDescriptions"][0]) == {
            "descriptionId",
            "scope",
            "shotId",
            "startTicks",
            "endTicks",
            "timebase",
            "text",
            "keyframeCount",
            "engine",
        }
        assert set(artefact["subStage"]) == {
            "name",
            "status",
            "reason",
            "engine",
            "startedAt",
            "completedAt",
        }


class TestCacheKeying:
    def test_toggling_no_vlm_invalidates_the_checkpoint(self, ctx: SubStageContext) -> None:
        # A skipped result must never be served to a run that asked for the
        # real thing.
        case = load_fixture("recorded-shot-descriptions", "input.json")
        recorded = load_fixture("recorded-shot-descriptions", "recorded-model.json")
        run_visual_descriptions(ctx, case["shots"], enable_vlm=False, clock=fixed_clock)
        enabled = run_visual_descriptions(
            ctx,
            case["shots"],
            enable_vlm=True,
            config=enabled_config(),
            transport=RecordedTransport(recorded["responses"]),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        assert enabled.cache_hit is False
        assert len(enabled.artefact["visualDescriptions"]) == 3

    def test_the_artefact_is_reused_on_an_unchanged_rerun(self, ctx: SubStageContext) -> None:
        case = load_fixture("recorded-shot-descriptions", "input.json")
        recorded = load_fixture("recorded-shot-descriptions", "recorded-model.json")
        kwargs = dict(
            enable_vlm=True,
            config=enabled_config(),
            keyframe_loader=fake_keyframe_loader,
            clock=fixed_clock,
        )
        run_visual_descriptions(
            ctx, case["shots"], transport=RecordedTransport(recorded["responses"]), **kwargs
        )
        # An empty transport would raise if a second paid call were attempted.
        second = run_visual_descriptions(
            ctx, case["shots"], transport=RecordedTransport([]), **kwargs
        )
        assert second.cache_hit is True
