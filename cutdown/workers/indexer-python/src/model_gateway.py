"""Provider adapter for VLM / LLM calls (Cutdown Phase 2 task 5, decision D-21).

D-21 settles the provider: **Anthropic Claude (current Sonnet-class)** behind a
provider-neutral adapter, JSON-Schema-constrained structured output, model IDs
recorded per artefact (PRD §10.6), keys in `cutdown/.env` (gitignored) read only
by the CLI process. Phase 3 mirrors this exact config surface in TypeScript, so
the surface is deliberately small, explicit, and documented in one table below.

Four things this module owns, because every model-calling sub-stage would
otherwise reimplement them slightly differently:

1. **Key hygiene.** The API key is read from `cutdown/.env` (or the process
   environment) and from nowhere else. It is never a default, never a literal,
   never logged, never written into an artefact, and never included in an error
   message — `_scrub` strips it from every string that leaves this module, and
   the dataclass field is `repr=False` so an accidental f-string cannot leak it.
2. **Provenance.** Every result carries `provider` and `model_id`, so the
   `EngineRecord` in the artefact records exactly which model produced the text.
3. **Structured-output discipline** (REQ-013 / tech-spec §6.2). A response that
   does not parse or does not validate gets **one** repair retry, then fails with
   a structured error. Never a partial write, never a silently coerced result.
4. **Testability without network.** The transport is injected. `HttpTransport`
   is the only code path that touches a socket, and no test constructs it.

## Config surface (mirror this in TypeScript at Phase 3)

| env var                       | default             | meaning                                    |
|-------------------------------|---------------------|--------------------------------------------|
| `ANTHROPIC_API_KEY`           | *(none)*            | credential; absent ⇒ the caller degrades   |
| `CUTDOWN_MODEL_PROVIDER`      | `anthropic`         | provider id, recorded in every artefact    |
| `CUTDOWN_VLM_MODEL_ID`        | `claude-sonnet-5`   | model id, recorded in every artefact (D-21)|
| `CUTDOWN_MODEL_BASE_URL`      | `https://api.anthropic.com` | provider endpoint (swap = config) |
| `CUTDOWN_SPEND_CEILING_AUD`   | *(none)*            | D-21 owner-set ceiling; absent ⇒ degrade   |
| `CUTDOWN_VLM_MAX_KEYFRAMES`   | `3`                 | per-shot keyframe cap (cost control)       |
| `CUTDOWN_VLM_MAX_OUTPUT_TOKENS` | `512`             | per-call output cap                        |
| `CUTDOWN_MODEL_TIMEOUT_SECONDS` | `60`              | per-call wall clock                        |

`CUTDOWN_SPEND_CEILING_AUD` has **no default on purpose**. D-21 records the
ceiling as owner-set and not yet set, so an unset ceiling must degrade to the
skip path rather than silently attempt a paid call.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

from harness import ModelUnavailableError, SubStageError

# --- provider constants -----------------------------------------------------

PROVIDER_ANTHROPIC = "anthropic"

#: D-21: "Anthropic Claude (current Sonnet-class)". The decision names the tier,
#: not a snapshot, so the id lives here and is recorded into every artefact.
DEFAULT_MODEL_ID = "claude-sonnet-5"
DEFAULT_BASE_URL = "https://api.anthropic.com"
DEFAULT_MAX_OUTPUT_TOKENS = 512
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_KEYFRAMES = 3

#: Anthropic Messages API version header. A wire constant, not a model version.
ANTHROPIC_VERSION = "2023-06-01"

ENV_API_KEY = "ANTHROPIC_API_KEY"
ENV_PROVIDER = "CUTDOWN_MODEL_PROVIDER"
ENV_MODEL_ID = "CUTDOWN_VLM_MODEL_ID"
ENV_BASE_URL = "CUTDOWN_MODEL_BASE_URL"
ENV_SPEND_CEILING = "CUTDOWN_SPEND_CEILING_AUD"
ENV_MAX_KEYFRAMES = "CUTDOWN_VLM_MAX_KEYFRAMES"
ENV_MAX_OUTPUT_TOKENS = "CUTDOWN_VLM_MAX_OUTPUT_TOKENS"
ENV_TIMEOUT_SECONDS = "CUTDOWN_MODEL_TIMEOUT_SECONDS"

# Error codes. Distinct from one another because the caller's degraded behaviour
# differs: NOT_CONFIGURED is an expected Phase 0 state (skip cleanly), while
# SCHEMA_INVALID is a real failure after the repair retry was already spent.
CODE_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"
CODE_SCHEMA_INVALID = "MODEL_SCHEMA_INVALID"
CODE_TRANSPORT = "MODEL_TRANSPORT_ERROR"


class ModelNotConfiguredError(SubStageError):
    """No API key, or no D-21 spend ceiling.

    Not a bug and not a crash: at Phase 0 this is the *expected* state, and the
    caller is required to degrade to a clean skip rather than fail the run.
    """

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code=CODE_NOT_CONFIGURED, message=message, details=details)


class ModelSchemaError(SubStageError):
    """The model's output did not conform after the single repair retry.

    Raised instead of coercing, truncating, or best-effort-parsing: a silently
    salvaged structured output is indistinguishable from a fabricated one.
    """

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code=CODE_SCHEMA_INVALID, message=message, details=details)


# --- .env loading -----------------------------------------------------------


def load_env_file(path: Path) -> dict[str, str]:
    """Parse `cutdown/.env` — the ONLY on-disk source of the API key.

    Deliberately tiny (no python-dotenv dependency): `KEY=VALUE`, `#` comments,
    blank lines, optional surrounding quotes, optional `export ` prefix. A
    missing file is not an error — an unconfigured checkout is the default state
    at Phase 0, and it must degrade rather than raise.
    """
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def _lookup(env: dict[str, str], key: str) -> str | None:
    """`.env` wins over the process environment.

    The repo's `.env` is the documented location (D-21), so a stale exported
    shell variable must not silently override the file the developer just edited.
    """
    value = env.get(key)
    if value is None:
        value = os.environ.get(key)
    value = (value or "").strip()
    return value or None


# --- configuration ----------------------------------------------------------


@dataclass(frozen=True)
class GatewayConfig:
    """Everything a model call needs, minus the prompt.

    `api_key` is `repr=False` and `compare=False`: it must never reach a log
    line, a traceback, a pytest assertion diff, or a cache key.
    """

    provider: str = PROVIDER_ANTHROPIC
    model_id: str = DEFAULT_MODEL_ID
    base_url: str = DEFAULT_BASE_URL
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    max_keyframes: int = DEFAULT_MAX_KEYFRAMES
    #: D-21 owner-set ceiling in AUD. `None` means NOT SET, which is the Phase 0
    #: state and forces the skip path — never a paid call by default.
    spend_ceiling_aud: float | None = None
    api_key: str | None = field(default=None, repr=False, compare=False)

    @property
    def is_enabled(self) -> bool:
        """A paid call is permitted only with BOTH a key and a spend ceiling."""
        return bool(self.api_key) and self.spend_ceiling_aud is not None

    def unconfigured_reason(self) -> str | None:
        """Why a call is not permitted, phrased for a `SubStageRecord.reason`."""
        if not self.api_key:
            return (
                f"{ENV_API_KEY} is not set in cutdown/.env; "
                "the visual-description sub-stage is skipped rather than attempting a call"
            )
        if self.spend_ceiling_aud is None:
            return (
                f"{ENV_SPEND_CEILING} is not set; the D-21 spend ceiling is owner-set "
                "and not yet configured, so no paid model call is attempted"
            )
        return None

    def require_enabled(self) -> None:
        reason = self.unconfigured_reason()
        if reason is not None:
            raise ModelNotConfiguredError(reason)

    def cache_key_fields(self) -> dict[str, Any]:
        """The subset that changes model OUTPUT — the REQ-005 cache-key inputs.

        Excludes `api_key` (a secret, and rotating it does not change an answer)
        and `timeout_seconds` / `base_url` (transport concerns, not semantics).
        """
        return {
            "provider": self.provider,
            "modelId": self.model_id,
            "maxOutputTokens": self.max_output_tokens,
            "maxKeyframes": self.max_keyframes,
        }

    def engine_parameters(self) -> list[dict[str, str]]:
        """`EngineRecord.parameters` — a LIST OF PAIRS, stringified, sorted."""
        return [
            {"key": key, "value": str(value)}
            for key, value in sorted(self.cache_key_fields().items())
        ]


def load_config(
    *,
    env_file: Path | None = None,
    environ: dict[str, str] | None = None,
    overrides: dict[str, Any] | None = None,
) -> GatewayConfig:
    """Build a `GatewayConfig` from `cutdown/.env` plus explicit overrides.

    `environ` exists so tests can supply values without mutating `os.environ`
    (and therefore without any risk of a real key leaking into a test run).
    """
    env: dict[str, str] = {}
    if env_file is not None:
        env.update(load_env_file(env_file))
    if environ is not None:
        env.update(environ)

    def _int(key: str, default: int) -> int:
        raw = _lookup(env, key)
        if raw is None:
            return default
        try:
            return int(raw)
        except ValueError as error:
            raise ModelNotConfiguredError(f"{key} must be an integer, got {raw!r}") from error

    ceiling_raw = _lookup(env, ENV_SPEND_CEILING)
    ceiling: float | None = None
    if ceiling_raw is not None:
        try:
            ceiling = float(ceiling_raw)
        except ValueError as error:
            raise ModelNotConfiguredError(
                f"{ENV_SPEND_CEILING} must be a number, got {ceiling_raw!r}"
            ) from error
        if ceiling <= 0:
            raise ModelNotConfiguredError(
                f"{ENV_SPEND_CEILING} must be greater than zero, got {ceiling_raw!r}"
            )

    config = GatewayConfig(
        provider=_lookup(env, ENV_PROVIDER) or PROVIDER_ANTHROPIC,
        model_id=_lookup(env, ENV_MODEL_ID) or DEFAULT_MODEL_ID,
        base_url=(_lookup(env, ENV_BASE_URL) or DEFAULT_BASE_URL).rstrip("/"),
        max_output_tokens=_int(ENV_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
        timeout_seconds=_int(ENV_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
        max_keyframes=_int(ENV_MAX_KEYFRAMES, DEFAULT_MAX_KEYFRAMES),
        spend_ceiling_aud=ceiling,
        api_key=_lookup(env, ENV_API_KEY),
    )
    if overrides:
        config = GatewayConfig(**{**config.__dict__, **overrides})

    # The base URL is operator configuration, but it is the destination of a
    # key-bearing POST. Allowing `http://` would put the credential on the wire
    # in plaintext because of a one-character edit to `.env`, so the scheme is
    # checked rather than trusted. (localhost is permitted for a local mock.)
    # Parsed, not prefix-matched: `http://localhost.evil.com` starts with
    # "http://localhost" and would have sailed through a startswith() check,
    # sending the key in plaintext to an attacker-controlled host — the exact
    # outcome this guard exists to prevent.
    parsed = urlsplit(config.base_url)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ModelNotConfiguredError(
            f"{ENV_BASE_URL} must be an https:// URL (or http:// on an exact loopback host); "
            f"got {config.base_url!r}. The API key is sent to this host."
        )
    return config


# --- secret scrubbing -------------------------------------------------------

#: Anthropic keys are `sk-ant-...`. Scrubbed even when the configured key is
#: unknown, so a key pasted into a prompt or echoed by a provider error never
#: reaches a log line or an artefact.
_KEY_PATTERN = re.compile(r"sk-ant-[A-Za-z0-9_\-]+")


def scrub(text: str, api_key: str | None = None) -> str:
    """Remove any credential material from a string bound for a log or artefact."""
    if api_key:
        text = text.replace(api_key, "***")
    return _KEY_PATTERN.sub("***", text)


# --- transport --------------------------------------------------------------


class Transport(Protocol):
    """The single seam between this module and the network.

    Tests supply a fake; `HttpTransport` is the only implementation that opens a
    socket, and no test constructs it.
    """

    def send(self, payload: dict[str, Any], config: GatewayConfig) -> dict[str, Any]: ...


class HttpTransport:
    """`POST /v1/messages` over stdlib `urllib`.

    Uses the stdlib rather than the `anthropic` SDK because the SDK is not a
    declared dependency of the indexer worker and the default Phase 0 path never
    reaches this class (D-21's ceiling is unset, so the caller skips). The wire
    contract is the documented Messages API shape: `x-api-key` +
    `anthropic-version` headers, JSON body, JSON response.
    """

    def send(self, payload: dict[str, Any], config: GatewayConfig) -> dict[str, Any]:
        import urllib.error
        import urllib.request

        if not config.api_key:
            raise ModelNotConfiguredError(f"{ENV_API_KEY} is not set")

        # Both urllib calls below carry an S310 suppression (the "audit URL open for
        # permitted schemes" rule). Written without the directive spelling, because
        # ruff parses the literal token in prose as a malformed directive and emits
        # a permanent warning. The audit is answered, once, in `load_config`:
        # `base_url`'s scheme must be https, or http on an exact loopback host,
        # PARSED rather than prefix-matched, and operator overrides are applied
        # BEFORE that check runs. Re-testing the scheme here would give one rule two
        # homes, which is how two homes come to disagree.
        request = urllib.request.Request(  # noqa: S310
            url=f"{config.base_url}/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": config.api_key,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:  # noqa: S310
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = ""
            try:
                body = error.read().decode("utf-8", errors="replace")[:2000]
            except Exception:  # noqa: BLE001 — a best-effort read of a diagnostic body
                # The error body is decoration on an error we are already raising.
                # Anything at all going wrong while reading it (a closed socket, a
                # decode fault, a provider sending no body) must not replace the
                # real HTTP failure with a second, less informative one.
                body = ""
            # The provider echoes request headers in some error bodies, so the
            # body is scrubbed before it is allowed anywhere near a log.
            raise ModelUnavailableError(
                f"{config.provider}/{config.model_id}",
                f"provider returned HTTP {error.code}",
                details={"status": error.code, "body": scrub(body, config.api_key)},
            ) from None
        except urllib.error.URLError as error:
            raise ModelUnavailableError(
                f"{config.provider}/{config.model_id}",
                f"provider unreachable: {scrub(str(error.reason), config.api_key)}",
            ) from None


# --- gateway ----------------------------------------------------------------

#: Appended verbatim as the repair turn. Stated as a constraint rather than a
#: hint because a vague "try again" wastes the one retry we allow ourselves.
REPAIR_INSTRUCTION = (
    "Your previous reply was not valid JSON matching the required shape: {error}. "
    "Reply again with ONLY the JSON object, no prose, no markdown fence."
)

Validator = Callable[[Any], None]


@dataclass(frozen=True)
class GatewayResult:
    """A validated structured result plus the provenance the artefact records."""

    data: Any
    provider: str
    model_id: str
    #: 1 = first attempt validated; 2 = the repair retry was needed.
    attempts: int


class ModelGateway:
    """Provider-neutral, structured-output-only entry point for model calls."""

    def __init__(self, config: GatewayConfig, transport: Transport | None = None) -> None:
        self.config = config
        self.transport = transport if transport is not None else HttpTransport()

    def complete_json(
        self,
        *,
        system: str,
        content: Sequence[dict[str, Any]],
        validate: Validator,
    ) -> GatewayResult:
        """One structured-output call, with at most ONE repair retry.

        `validate` raises `ValueError` when the parsed object is wrong. Anything
        it accepts is returned unchanged; anything it rejects twice raises
        `ModelSchemaError`. There is no third path — no coercion, no partial
        result, no `None` that a caller might mistake for "no findings".
        """
        self.config.require_enabled()

        messages: list[dict[str, Any]] = [{"role": "user", "content": list(content)}]
        last_error = ""

        for attempt in (1, 2):
            payload = {
                "model": self.config.model_id,
                "max_tokens": self.config.max_output_tokens,
                "system": system,
                "messages": messages,
            }
            response = self.transport.send(payload, self.config)
            text = _first_text(response)
            try:
                parsed = json.loads(_strip_fence(text))
                validate(parsed)
            except (json.JSONDecodeError, ValueError, TypeError) as error:
                last_error = scrub(str(error), self.config.api_key)
                if attempt == 2:
                    break
                # Exactly one repair turn: echo what the model said, then state
                # the constraint it broke.
                messages = [
                    *messages,
                    {"role": "assistant", "content": [{"type": "text", "text": text}]},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": REPAIR_INSTRUCTION.format(error=last_error),
                            }
                        ],
                    },
                ]
                continue
            return GatewayResult(
                data=parsed,
                provider=self.config.provider,
                model_id=self.config.model_id,
                attempts=attempt,
            )

        raise ModelSchemaError(
            "model output failed schema validation after one repair retry",
            details={
                "provider": self.config.provider,
                "modelId": self.config.model_id,
                "attempts": 2,
                "validationError": last_error,
            },
        )


def _first_text(response: dict[str, Any]) -> str:
    """Concatenate the response's text blocks.

    A `content` array of typed blocks is the documented Messages API shape;
    indexing `content[0].text` blindly breaks the moment a thinking block leads.
    """
    blocks = response.get("content")
    if not isinstance(blocks, list):
        raise ModelSchemaError(
            "provider response has no content array",
            details={"keys": sorted(str(k) for k in response)},
        )
    parts = [
        block["text"]
        for block in blocks
        if isinstance(block, dict)
        and block.get("type") == "text"
        and isinstance(block.get("text"), str)
    ]
    if not parts:
        raise ModelSchemaError("provider response contained no text block")
    return "".join(parts)


def _strip_fence(text: str) -> str:
    """Tolerate a ```json fence around otherwise-valid JSON.

    Unwrapping a fence is not coercion — the bytes inside are still validated,
    and refusing here would burn the repair retry on formatting rather than shape.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1] if "\n" in stripped else ""
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[: -len("```")]
    return stripped.strip()
