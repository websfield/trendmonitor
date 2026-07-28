"""Model-gateway tests (Phase 2 task 5).

Three things are load-bearing here and each has a test that can fail:

1. **Key hygiene.** The key comes from `cutdown/.env` only, and never appears in
   a repr, a log line, an artefact, or an error message.
2. **Structured-output discipline.** ONE repair retry, then a structured error —
   never a coerced result and never a partial one.
3. **No network.** Every test injects a fake transport. `HttpTransport` is never
   constructed here; if it were, these tests would need a key and a socket.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness import SubStageError
from model_gateway import (
    CODE_NOT_CONFIGURED,
    CODE_SCHEMA_INVALID,
    DEFAULT_MODEL_ID,
    ENV_API_KEY,
    ENV_BASE_URL,
    ENV_MAX_KEYFRAMES,
    ENV_MAX_OUTPUT_TOKENS,
    ENV_MODEL_ID,
    ENV_PROVIDER,
    ENV_SPEND_CEILING,
    ENV_TIMEOUT_SECONDS,
    PROVIDER_ANTHROPIC,
    GatewayConfig,
    ModelGateway,
    ModelNotConfiguredError,
    ModelSchemaError,
    load_config,
    load_env_file,
    scrub,
)

FAKE_KEY = "sk-ant-test-0123456789abcdef"

ALL_ENV_VARS = (
    ENV_API_KEY,
    ENV_PROVIDER,
    ENV_MODEL_ID,
    ENV_BASE_URL,
    ENV_SPEND_CEILING,
    ENV_MAX_KEYFRAMES,
    ENV_MAX_OUTPUT_TOKENS,
    ENV_TIMEOUT_SECONDS,
)


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Never let a developer's real exported key reach a test run.

    Without this, a machine with `ANTHROPIC_API_KEY` exported would flip the
    default-is-skip tests green for the wrong reason — and the whole point of
    those tests is that the default path does NOT have a key.
    """
    for name in ALL_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


class FakeTransport:
    """Replays canned provider responses and records what it was asked."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.payloads: list[dict[str, Any]] = []

    def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
        self.payloads.append(payload)
        if not self._texts:
            raise AssertionError("transport called more times than the test allowed")
        return {"content": [{"type": "text", "text": self._texts.pop(0)}]}


def enabled_config(**overrides: Any) -> GatewayConfig:
    base = {"api_key": FAKE_KEY, "spend_ceiling_aud": 25.0}
    return GatewayConfig(**{**base, **overrides})


def accept_anything(_: Any) -> None:
    return None


def require_description(payload: Any) -> None:
    if not isinstance(payload, dict) or not isinstance(payload.get("description"), str):
        raise ValueError("'description' must be a string")


class TestEnvFileLoading:
    """API keys come from `cutdown/.env` ONLY (D-21). This is the whole surface."""

    def test_parses_keys_comments_quotes_and_export(self, tmp_path: Path) -> None:
        env = tmp_path / ".env"
        env.write_text(
            "\n".join(
                [
                    "# a comment",
                    "",
                    f"{ENV_API_KEY}={FAKE_KEY}",
                    f'{ENV_MODEL_ID}="claude-sonnet-5"',
                    f"export {ENV_SPEND_CEILING}='25'",
                    "MALFORMED_LINE_WITHOUT_EQUALS",
                ]
            ),
            encoding="utf-8",
        )
        values = load_env_file(env)
        assert values[ENV_API_KEY] == FAKE_KEY
        assert values[ENV_MODEL_ID] == "claude-sonnet-5"
        assert values[ENV_SPEND_CEILING] == "25"
        assert "MALFORMED_LINE_WITHOUT_EQUALS" not in values

    def test_a_missing_env_file_is_not_an_error(self, tmp_path: Path) -> None:
        # An unconfigured checkout is the DEFAULT Phase 0 state; raising here
        # would make `cutdown index` fail on a fresh clone.
        assert load_env_file(tmp_path / "nope.env") == {}

    def test_env_file_wins_over_the_process_environment(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The repo `.env` is the documented location (D-21), so a stale exported
        # shell variable must not silently override the file just edited.
        env = tmp_path / ".env"
        env.write_text(f"{ENV_MODEL_ID}=from-dot-env", encoding="utf-8")
        monkeypatch.setenv(ENV_MODEL_ID, "from-stale-shell-export")
        assert load_config(env_file=env).model_id == "from-dot-env"

    def test_the_process_environment_is_the_fallback(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv(ENV_MODEL_ID, "from-shell")
        assert load_config(env_file=tmp_path / "absent.env").model_id == "from-shell"


class TestDefaultsAreTheSkipPath:
    """D-21's ceiling is owner-set and NOT SET, so the default must not call out."""

    def test_an_empty_config_is_not_enabled(self, tmp_path: Path) -> None:
        config = load_config(env_file=tmp_path / "absent.env", environ={})
        assert config.is_enabled is False
        assert config.unconfigured_reason() is not None

    def test_a_key_without_a_spend_ceiling_is_still_not_enabled(self) -> None:
        # The load-bearing one: having a key must NOT be sufficient to spend money.
        config = GatewayConfig(api_key=FAKE_KEY, spend_ceiling_aud=None)
        assert config.is_enabled is False
        assert ENV_SPEND_CEILING in config.unconfigured_reason()

    def test_a_ceiling_without_a_key_is_not_enabled(self) -> None:
        config = GatewayConfig(api_key=None, spend_ceiling_aud=25.0)
        assert config.is_enabled is False
        assert ENV_API_KEY in config.unconfigured_reason()

    def test_both_present_enables_the_call(self) -> None:
        assert enabled_config().is_enabled is True
        assert enabled_config().unconfigured_reason() is None

    def test_require_enabled_raises_a_structured_error(self) -> None:
        with pytest.raises(ModelNotConfiguredError) as caught:
            GatewayConfig().require_enabled()
        assert caught.value.to_payload()["code"] == CODE_NOT_CONFIGURED

    def test_the_default_model_is_the_d21_sonnet_class_anthropic_model(self) -> None:
        config = GatewayConfig()
        assert config.provider == PROVIDER_ANTHROPIC
        assert config.model_id == DEFAULT_MODEL_ID

    def test_a_non_numeric_spend_ceiling_is_rejected_not_ignored(self) -> None:
        # Silently treating "twenty" as unset would be defensible; silently
        # treating it as enabled would not. Either way it must be visible.
        with pytest.raises(ModelNotConfiguredError):
            load_config(environ={ENV_SPEND_CEILING: "twenty"})

    def test_a_zero_or_negative_ceiling_is_rejected(self) -> None:
        with pytest.raises(ModelNotConfiguredError):
            load_config(environ={ENV_SPEND_CEILING: "0"})


class TestSecretsNeverLeak:
    """Golden rule 2: no secrets in code, commits, or logs."""

    def test_the_key_is_absent_from_the_config_repr(self) -> None:
        assert FAKE_KEY not in repr(enabled_config())

    def test_the_key_is_absent_from_the_cache_key_fields(self) -> None:
        fields = enabled_config().cache_key_fields()
        assert FAKE_KEY not in json.dumps(fields)
        assert "api_key" not in fields and "apiKey" not in fields

    def test_the_key_is_absent_from_engine_parameters(self) -> None:
        # EngineRecord.parameters lands verbatim in a committed artefact.
        assert FAKE_KEY not in json.dumps(enabled_config().engine_parameters())

    def test_scrub_removes_the_configured_key(self) -> None:
        assert scrub(f"failed with {FAKE_KEY}", FAKE_KEY) == "failed with ***"

    def test_scrub_removes_an_unknown_anthropic_key(self) -> None:
        # A key echoed back by a provider error body is not the configured key,
        # so pattern-scrubbing is the only defence.
        other = "sk-ant-api03-SOMEONEELSES"
        assert other not in scrub(f"header x-api-key: {other} rejected")

    def test_rotating_the_key_does_not_change_the_cache_key(self) -> None:
        a = enabled_config(api_key="sk-ant-aaa")
        b = enabled_config(api_key="sk-ant-bbb")
        assert a.cache_key_fields() == b.cache_key_fields()


class TestCacheKeyFields:
    """REQ-005: everything that changes the output is part of the key."""

    def test_model_id_changes_the_cache_key(self) -> None:
        assert enabled_config(model_id="a").cache_key_fields() != enabled_config(
            model_id="b"
        ).cache_key_fields()

    def test_max_keyframes_changes_the_cache_key(self) -> None:
        # Sending 1 frame vs 3 is a different question and a different answer.
        assert enabled_config(max_keyframes=1).cache_key_fields() != enabled_config(
            max_keyframes=3
        ).cache_key_fields()

    def test_base_url_does_not_change_the_cache_key(self) -> None:
        # A proxy or region swap is transport, not semantics.
        assert enabled_config(base_url="https://a").cache_key_fields() == enabled_config(
            base_url="https://b"
        ).cache_key_fields()

    def test_max_keyframes_is_read_from_the_environment(self) -> None:
        config = load_config(environ={ENV_MAX_KEYFRAMES: "1"})
        assert config.max_keyframes == 1


class TestStructuredOutputDiscipline:
    def test_a_valid_first_response_needs_no_retry(self) -> None:
        transport = FakeTransport(['{"description": "a kitchen"}'])
        result = ModelGateway(enabled_config(), transport).complete_json(
            system="s", content=[{"type": "text", "text": "go"}], validate=require_description
        )
        assert result.data == {"description": "a kitchen"}
        assert result.attempts == 1
        assert len(transport.payloads) == 1

    def test_malformed_json_gets_exactly_one_repair_retry(self) -> None:
        transport = FakeTransport(["not json at all", '{"description": "a kitchen"}'])
        result = ModelGateway(enabled_config(), transport).complete_json(
            system="s", content=[{"type": "text", "text": "go"}], validate=require_description
        )
        assert result.attempts == 2
        assert len(transport.payloads) == 2, "exactly one repair retry, not a loop"

    def test_the_repair_turn_echoes_the_bad_reply_and_states_the_constraint(self) -> None:
        transport = FakeTransport(["garbage", '{"description": "ok"}'])
        ModelGateway(enabled_config(), transport).complete_json(
            system="s", content=[{"type": "text", "text": "go"}], validate=require_description
        )
        repair_messages = transport.payloads[1]["messages"]
        assert repair_messages[1]["role"] == "assistant"
        assert repair_messages[1]["content"][0]["text"] == "garbage"
        assert "ONLY the JSON object" in repair_messages[2]["content"][0]["text"]

    def test_schema_valid_json_that_fails_validation_also_retries(self) -> None:
        # Parses fine, wrong shape — the failure mode a naive `json.loads` guard misses.
        transport = FakeTransport(['{"summary": "wrong key"}', '{"description": "right"}'])
        result = ModelGateway(enabled_config(), transport).complete_json(
            system="s", content=[], validate=require_description
        )
        assert result.data == {"description": "right"}

    def test_two_failures_raise_a_structured_error_and_never_coerce(self) -> None:
        transport = FakeTransport(["garbage", "still garbage"])
        gateway = ModelGateway(enabled_config(), transport)
        with pytest.raises(ModelSchemaError) as caught:
            gateway.complete_json(system="s", content=[], validate=require_description)
        payload = caught.value.to_payload()
        assert payload["code"] == CODE_SCHEMA_INVALID
        assert payload["details"]["attempts"] == 2
        assert payload["details"]["modelId"] == DEFAULT_MODEL_ID
        assert len(transport.payloads) == 2, "no third attempt"

    def test_a_json_fence_is_unwrapped_rather_than_burning_the_retry(self) -> None:
        transport = FakeTransport(['```json\n{"description": "fenced"}\n```'])
        result = ModelGateway(enabled_config(), transport).complete_json(
            system="s", content=[], validate=require_description
        )
        assert result.attempts == 1 and result.data["description"] == "fenced"

    def test_a_response_with_no_text_block_is_a_structured_error(self) -> None:
        class NoTextTransport:
            def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
                return {"content": [{"type": "thinking", "thinking": "hmm"}]}

        with pytest.raises(SubStageError):
            ModelGateway(enabled_config(), NoTextTransport()).complete_json(
                system="s", content=[], validate=accept_anything
            )

    def test_text_blocks_are_concatenated_not_indexed_at_zero(self) -> None:
        class SplitTransport:
            def send(self, payload: dict[str, Any], config) -> dict[str, Any]:
                return {
                    "content": [
                        {"type": "thinking", "thinking": "…"},
                        {"type": "text", "text": '{"desc'},
                        {"type": "text", "text": 'ription": "split"}'},
                    ]
                }

        result = ModelGateway(enabled_config(), SplitTransport()).complete_json(
            system="s", content=[], validate=require_description
        )
        assert result.data["description"] == "split"


class TestNoCallWithoutConfiguration:
    def test_an_unconfigured_gateway_never_touches_the_transport(self) -> None:
        transport = FakeTransport(['{"description": "should never be reached"}'])
        gateway = ModelGateway(GatewayConfig(), transport)
        with pytest.raises(ModelNotConfiguredError):
            gateway.complete_json(system="s", content=[], validate=accept_anything)
        assert transport.payloads == [], "a paid call must not be attempted by default"


class TestProvenance:
    def test_the_result_records_provider_and_model_id(self) -> None:
        # PRD §10.6: the model ID is recorded per artefact, not inferred later.
        transport = FakeTransport(['{"description": "x"}'])
        result = ModelGateway(enabled_config(model_id="claude-sonnet-5"), transport).complete_json(
            system="s", content=[], validate=require_description
        )
        assert (result.provider, result.model_id) == (PROVIDER_ANTHROPIC, "claude-sonnet-5")

    def test_the_request_names_the_configured_model(self) -> None:
        transport = FakeTransport(['{"description": "x"}'])
        ModelGateway(enabled_config(model_id="claude-sonnet-5"), transport).complete_json(
            system="s", content=[], validate=require_description
        )
        assert transport.payloads[0]["model"] == "claude-sonnet-5"

    def test_engine_parameters_are_pairs_not_a_dict(self) -> None:
        parameters = enabled_config().engine_parameters()
        assert isinstance(parameters, list)
        assert all(set(pair) == {"key", "value"} for pair in parameters)
        assert all(isinstance(pair["value"], str) for pair in parameters)
