"""Query-embed entrypoint tests (Phase 3 task Q, decisions.md D-22).

Two things are load-bearing and each has a test that can fail:

1. A short query yields a 384-dim vector recorded against the corpus model, so
   the TypeScript retrieval compares query and corpus in ONE vector space.
2. Empty query text yields a clean, explicit result — never a fabricated vector —
   and does so without loading a model at all.

The short-text test injects a fake encoder (monkeypatching `load_encoder`) so it
is fast and marked with no model download; it must pass under `-m "not slow"`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import embed_query
from embed import DIMENSIONS, MODEL_ID, MODEL_VERSION


class FakeEncoder:
    """Returns a deterministic 384-dim batch-of-one, matching bge-small's shape."""

    def encode(self, sentences: list[str], **_kwargs: Any) -> list[list[float]]:
        assert isinstance(sentences, list) and len(sentences) == 1
        return [[0.01 * (i % 7) for i in range(DIMENSIONS)]]


def _write(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def test_short_text_yields_384_dim_vector(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(embed_query, "load_encoder", lambda *a, **k: FakeEncoder())

    inp = tmp_path / "in.json"
    out = tmp_path / "out.json"
    _write(inp, {"text": "a founder explains the pricing change"})

    exit_code = embed_query.run(inp, out)
    assert exit_code == 0

    result = json.loads(out.read_text(encoding="utf-8"))
    assert result["model"] == MODEL_ID
    assert result["modelVersion"] == MODEL_VERSION
    assert result["dimensions"] == DIMENSIONS
    assert len(result["vector"]) == DIMENSIONS
    assert all(isinstance(v, float) for v in result["vector"])


def test_empty_text_is_a_clean_structured_result_not_a_fabrication(tmp_path: Path, monkeypatch) -> None:
    # If the encoder is even TOUCHED for empty text, this fails — empty text must
    # never reach the model, and must never produce a fabricated vector.
    def _forbidden(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("load_encoder must not be called for empty query text")

    monkeypatch.setattr(embed_query, "load_encoder", _forbidden)

    inp = tmp_path / "in.json"
    out = tmp_path / "out.json"
    _write(inp, {"text": "   "})

    exit_code = embed_query.run(inp, out)
    assert exit_code == 0

    result = json.loads(out.read_text(encoding="utf-8"))
    assert result["dimensions"] == 0
    assert result["vector"] == []
    assert result["empty"] is True
    assert isinstance(result["reason"], str) and result["reason"]


def test_missing_text_field_is_an_input_validation_error(tmp_path: Path) -> None:
    from harness import EXIT_INPUT_VALIDATION, SubStageError

    inp = tmp_path / "in.json"
    out = tmp_path / "out.json"
    _write(inp, {"notText": 1})

    try:
        embed_query.run(inp, out)
    except SubStageError as error:
        assert error.exit_code == EXIT_INPUT_VALIDATION
        assert error.code == "REQUEST_INVALID"
    else:  # pragma: no cover - the call above must raise
        raise AssertionError("a request without a string `text` must raise REQUEST_INVALID")
    assert not out.exists(), "no output must be written on an input-validation failure"
