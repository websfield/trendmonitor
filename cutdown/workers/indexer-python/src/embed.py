"""Per-Moment transcript embeddings — Phase 2 task 9 (decisions.md D-22).

The embedding is stored **on the Moment artefact**, which is the whole point:
Phase 3's retrieval then does brute-force cosine in pure TypeScript over vectors
already on disk and never shells out to Python for the corpus side. Moment counts
per job are small, so brute force is correct at Stage A; the Stage B move to
pgvector becomes a re-embed rather than a redesign.

Model: **bge-small-en-v1.5**, 384 dimensions, run locally. The dimension count is
load-bearing — `moment-v1` caps `dimensions` at 2000 because pgvector's index
types cap around there (tech-spec §9.2), so a model chosen now cannot make the
Stage B migration impossible. 384 is comfortably inside that ceiling.

REQ-005 requires the model ID to be recorded per artefact, which is what makes a
later re-embed detectable rather than a silent mixing of vector spaces from two
different models — vectors from different models are not comparable, and cosine
similarity between them is meaningless rather than merely inaccurate.
"""

from __future__ import annotations

from typing import Any, Protocol

from harness import ModelUnavailableError

MODEL_ID = "BAAI/bge-small-en-v1.5"
MODEL_VERSION = "1.5"
DIMENSIONS = 384

#: `moment-v1` caps embedding dimensions so the Stage B migration stays possible.
MAX_DIMENSIONS = 2000


class Encoder(Protocol):
    """The slice of SentenceTransformer this module needs.

    Narrow on purpose: tests inject a deterministic fake instead of downloading
    a model, and the production path is the only place the real one is built.
    """

    def encode(self, sentences: list[str], **kwargs: Any) -> Any: ...


#: Keyed BY MODEL ID, not a bare single slot. A single slot ignored the argument
#: on every call after the first, so `load_encoder("other-model")` silently
#: returned the previously-loaded model — and vectors from two different models
#: are not comparable, so the resulting mixture is meaningless rather than
#: merely inaccurate. Harmless with one call site; a silent vector-space
#: corruption the day there are two.
_encoder_cache: dict[str, Encoder] = {}


def load_encoder(model_id: str = MODEL_ID) -> Encoder:
    """Load the local sentence-transformers model, once per process.

    A load failure raises `ModelUnavailableError` naming the model, so an offline
    or gated cache degrades to a named, resumable failure rather than to a
    fabricated vector — a fabricated embedding would silently corrupt every
    retrieval ranking that followed.
    """
    cached = _encoder_cache.get(model_id)
    if cached is not None:
        return cached

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise ModelUnavailableError(
            model_id, f"sentence-transformers is not importable: {error}"
        ) from error

    try:
        encoder = SentenceTransformer(model_id)
    except Exception as error:  # noqa: BLE001 — any load failure is the same outcome
        raise ModelUnavailableError(
            model_id,
            f"could not load {model_id}; the model cache may be empty and the host offline: {error}",
        ) from error
    _encoder_cache[model_id] = encoder
    return encoder


def embed_text(text: str, encoder: Encoder, *, model_id: str = MODEL_ID) -> dict[str, Any] | None:
    """Embed one Moment's transcript text into a `MomentEmbedding`, or `None`.

    Returns `None` for a Moment with no transcript text — a silent Moment is a
    legitimate outcome (b-roll), and the schema permits a null embedding. A
    zero vector would be worse than nothing: it is a real point in the space and
    would match queries by accident.
    """
    if not text or not text.strip():
        return None

    vector = encoder.encode([text], normalize_embeddings=True)
    values = _to_float_list(vector)

    if len(values) > MAX_DIMENSIONS:
        raise ValueError(
            f"{model_id} produced {len(values)} dimensions, above the {MAX_DIMENSIONS} cap "
            "that keeps the Stage B pgvector migration possible (tech-spec §9.2)."
        )

    return {
        "model": model_id,
        "modelVersion": MODEL_VERSION,
        "dimensions": len(values),
        "vector": values,
    }


def _to_float_list(vector: Any) -> list[float]:
    """Coerce a numpy array / nested sequence into a flat list of plain floats.

    Plain floats, not numpy scalars, because the artefact is JSON and numpy types
    are not JSON-serialisable — a failure that would otherwise surface only at
    write time, after the expensive work was already done.
    """
    candidate = vector
    if hasattr(candidate, "tolist"):
        candidate = candidate.tolist()
    # `encode([text])` returns a batch of one; unwrap it.
    if candidate and isinstance(candidate[0], list):
        candidate = candidate[0]
    return [float(value) for value in candidate]
