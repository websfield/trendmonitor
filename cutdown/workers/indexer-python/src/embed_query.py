"""Query-embed entrypoint — the query side of Phase 3 retrieval (decisions.md D-22).

Phase 3's Moment retrieval reads the corpus embeddings in pure TypeScript, but the
QUERY vector has to be produced with the SAME model as the corpus, or the cosine
comparison is meaningless. There is exactly one embedding implementation
(`embed.py`, bge-small-en-v1.5, 384 dims), so this module gives it an argv
entrypoint the TypeScript side spawns:

    uv run --project <cutdown> python embed_query.py --input <req.json> --output <out.json>

The request is `{"text": "..."}`; the output is a `MomentEmbedding`-shaped
`{model, modelVersion, dimensions, vector}`. Two honesty rules ride along:

* A model that cannot load raises `ModelUnavailableError` (from `load_encoder`),
  surfaced as a structured error — never a fabricated vector.
* Empty query text is a clean, explicit result (`dimensions: 0`, `vector: []`),
  not a zero vector: a zero vector is a real point in the space that would match
  queries by accident, which is worse than nothing (`embed.embed_text` returns
  `None` for empty text for exactly this reason).

House style matches `main.py`: `--input`/`--output` argv, structured errors and
exit codes via `harness.main_guard`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from embed import MODEL_ID, MODEL_VERSION, embed_text, load_encoder
from harness import (
    EXIT_INPUT_VALIDATION,
    EXIT_RUNTIME,
    SubStageError,
    main_guard,
    write_json_atomic,
)


def parse_args(argv: list[str]) -> tuple[Path, Path]:
    """`--input` and `--output` are both mandatory (mirrors main.py, tech-spec §6.2)."""
    values: dict[str, str] = {}
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in ("--input", "--output") and index + 1 < len(argv):
            values[token.lstrip("-")] = argv[index + 1]
            index += 2
        else:
            index += 1
    if "input" not in values or "output" not in values:
        raise SubStageError(
            "MISSING_IO_ARGUMENTS",
            "embed_query requires --input <request.json> and --output <result.json>.",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return Path(values["input"]), Path(values["output"])


def load_request(path: Path) -> dict[str, Any]:
    try:
        request = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SubStageError(
            "REQUEST_UNREADABLE",
            f"Could not read the embed-query request at {path}: {error}",
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error
    if not isinstance(request, dict) or not isinstance(request.get("text"), str):
        raise SubStageError(
            "REQUEST_INVALID",
            "embed_query request must be a JSON object with a string `text` field.",
            details={"field": "text"},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    return request


def _empty_result() -> dict[str, Any]:
    """A clean, explicit no-embedding result — never a fabricated zero vector."""
    return {
        "model": MODEL_ID,
        "modelVersion": MODEL_VERSION,
        "dimensions": 0,
        "vector": [],
        "empty": True,
        "reason": "query text was empty; no embedding was computed (a zero vector would match by accident)",
    }


def run(input_path: Path, output_path: Path) -> int:
    request = load_request(input_path)
    text = request["text"]

    # Short-circuit empty text BEFORE loading the model: an empty query needs no
    # encoder, and loading one just to discard it would be wasted work (and would
    # make the empty-text path depend on a downloadable model).
    if not text or not text.strip():
        write_json_atomic(output_path, _empty_result())
        return 0

    encoder = load_encoder()  # raises ModelUnavailableError if the model cannot load
    result = embed_text(text, encoder)
    if result is None:
        # Non-empty text that stripped to empty is already handled above; anything
        # else returning None is a real defect, surfaced rather than fabricated.
        raise SubStageError(
            "EMPTY_EMBEDDING",
            "embed_text returned no vector for non-empty query text.",
            exit_code=EXIT_RUNTIME,
        )
    write_json_atomic(output_path, result)
    return 0


def entrypoint() -> int:
    input_path, output_path = parse_args(sys.argv[1:])
    return run(input_path, output_path)


if __name__ == "__main__":
    raise SystemExit(main_guard(entrypoint))
