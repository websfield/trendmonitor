"""`source-index-v1` assembly — Phase 2 task 8.

Merges the sub-stage artefacts into the single `SourceIndex` object that Phase 3
reads. Three responsibilities live here and nowhere else:

1. **The timebase map** (REQ-019). A VFR source has no constant frames-per-second
   to divide by, so every downstream range on it would be a guess without an
   explicit mapping from normalized ticks back to real source presentation
   timestamps. For a CFR source the linear relation between the two timebases is
   exact and `entries` is empty; for a VFR source `entries` carries the observed
   PTS pairs. This is the object that makes "no generated range exceeds source
   bounds" decidable on a variable-frame-rate clip.

2. **The sub-stage ledger.** Every sub-stage appears in `subStages` with its
   status — including `skipped` and `failed`, each with a `reason`. This is what
   keeps "we did not look" distinguishable from "we looked and found nothing":
   an empty `visualDescriptions` array means nothing on its own, but an empty
   array beside a `skipped` record with a reason is a complete statement.

3. **Version stamping.** The index carries the indexer version and the source
   content hash, which together key the REQ-005 cache.

The assembler is deliberately dumb about *content*: it never re-derives a
detection, never fills a gap with a guess, and never fabricates a sub-stage
record for work that did not run.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from harness import INDEXER_VERSION
from ids import derive_ulid

SCHEMA_VERSION = "1.0.0"

#: The sub-stage names the schema's closed enum accepts, in pipeline order.
SUB_STAGE_ORDER = (
    "transcript",
    "shots",
    "scenes",
    "ocr",
    "visual_descriptions",
    "audio_events",
    "quality_flags",
    "moment_extraction",
)


@dataclass(frozen=True)
class Timebase:
    num: int
    den: int

    def to_json(self) -> dict[str, int]:
        return {"num": self.num, "den": self.den}

    def as_fraction(self) -> Fraction:
        return Fraction(self.num, self.den)


def convert_ticks(ticks: int, source: Timebase, target: Timebase) -> int:
    """Convert a tick count between timebases with exact rational arithmetic.

    `seconds = ticks * num / den`, so
    `target_ticks = ticks * (source.num/source.den) * (target.den/target.num)`.

    Computed with `Fraction` and rounded once at the end. Doing this in floating
    point is how a range ends up one tick past the end of an asset, which is
    precisely the defect `range-check.ts` exists to catch — so it is not done in
    floating point here.
    """
    exact = Fraction(ticks) * source.as_fraction() / target.as_fraction()
    return round(exact)


#: Every tick-valued field the contracts define. Rescaling walks these by name
#: rather than guessing from the value, so a new field is a deliberate addition.
TICK_FIELDS = ("startTicks", "endTicks", "keyframeTicks")


def rescale_item(item: Any, target: Timebase) -> Any:
    """Re-express one artefact's ticks in `target`, recursing into nested lists.

    **This is load-bearing.** The sub-stages do not share a timebase: transcript
    and audio events count 16 kHz samples, shots and OCR count container video
    ticks (e.g. 1/15360), and quality flags mix frame indices with sample
    indices. Comparing those integers directly is an off-by-a-large-factor bug
    that still produces entirely plausible-looking output — a speaker turn
    ending at 10.000 s becomes a Moment boundary at 10.417 s, and the error
    grows with position.

    It is also silent: a 16 kHz tick count is numerically LARGER than the video
    tick count for the same instant, so an out-of-range boundary gets dropped by
    the duration filter rather than reported. That was observed in a real job —
    a speech end at 4.98 s was discarded against a 5.0 s asset.

    Conversion is exact (`Fraction`), never float.
    """
    if not isinstance(item, dict):
        return item

    out = dict(item)
    source = out.get("timebase")
    if isinstance(source, dict) and {"num", "den"} <= set(source):
        source_tb = Timebase(int(source["num"]), int(source["den"]))
        for field in TICK_FIELDS:
            value = out.get(field)
            if isinstance(value, int) and not isinstance(value, bool):
                out[field] = convert_ticks(value, source_tb, target)
        out["timebase"] = target.to_json()

    # Words live inside segments, so the walk has to recurse rather than stop at
    # the top level.
    for key, value in out.items():
        if isinstance(value, list):
            out[key] = [rescale_item(entry, target) for entry in value]
    return out


def rescale_items(items: list[dict[str, Any]] | None, target: Timebase) -> list[dict[str, Any]]:
    """Rescale a whole collection into `target`."""
    return [rescale_item(item, target) for item in (items or [])]


def build_timebase_map(
    *,
    mode: str,
    source_timebase: Timebase,
    normalized_timebase: Timebase,
    presentation_ticks: list[int] | None = None,
) -> dict[str, Any]:
    """Build the REQ-019 normalisation record.

    `mode` is the frame-rate-mode enum: `cfr` | `vfr` | `unknown`.

    For `cfr`, `entries` is empty — the linear relation is exact and sufficient,
    and emitting one entry per frame would bloat the artefact without adding
    information. For `vfr` (and for `unknown`, which is treated with the same
    caution because we cannot prove the source is constant), each observed source
    presentation timestamp is mapped to its normalized tick.
    """
    if mode not in {"cfr", "vfr", "unknown"}:
        raise ValueError(f"frame-rate mode must be cfr|vfr|unknown, received {mode!r}")

    # `entries` exists so a NORMALIZED tick can be resolved back to a real source
    # frame. When the normalized timebase IS the source timebase, that resolution
    # is the identity: every tick is already expressed in the container's own
    # exact integer timebase, including on a VFR source, where presentation
    # timestamps are integers in precisely that timebase. So an empty `entries`
    # list is honest here, for CFR and VFR alike.
    #
    # It stops being honest the moment the two timebases DIFFER: then a mapping
    # genuinely has to be established, and claiming a linear relation without one
    # would make every downstream range on that clip a guess — the exact failure
    # REQ-019 exists to prevent.
    #
    # An earlier revision of this guard refused any non-CFR source outright. That
    # was worse than the problem: nothing in the pipeline produces presentation
    # timestamps yet, so it made every VFR, unknown-rate and audio-only asset
    # unindexable — and VFR is the case REQ-019 is FOR. Trading a silent lie for
    # a hard outage is not a fix.
    if normalized_timebase != source_timebase and not presentation_ticks:
        raise ValueError(
            f"normalized timebase {normalized_timebase} differs from source {source_timebase}, "
            "so a tick mapping must be supplied (REQ-019). An empty `entries` list would claim "
            "a relation that has not been established."
        )

    entries: list[dict[str, int]] = []
    if mode != "cfr" and presentation_ticks:
        entries = [
            {
                "sourceTicks": int(pts),
                "normalizedTicks": convert_ticks(int(pts), source_timebase, normalized_timebase),
            }
            for pts in presentation_ticks
        ]

    return {
        "mode": mode,
        "sourceTimebase": source_timebase.to_json(),
        "normalizedTimebase": normalized_timebase.to_json(),
        "entries": entries,
    }


def sub_stage_record(
    name: str,
    status: str,
    *,
    started_at: str,
    completed_at: str | None = None,
    reason: str | None = None,
    engine: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One `SubStageRecord`. All six fields are required by the closed schema."""
    if name not in SUB_STAGE_ORDER:
        raise ValueError(f"unknown sub-stage {name!r}; the schema enum is closed")
    if status not in {"completed", "skipped", "failed"}:
        raise ValueError(f"status must be completed|skipped|failed, received {status!r}")
    if status != "completed" and not reason:
        # A skip or a failure without a reason is the exact ambiguity the
        # sub-stage ledger exists to remove.
        raise ValueError(f"sub-stage {name!r} is {status!r} and must carry a reason")

    return {
        "name": name,
        "status": status,
        "reason": reason,
        "engine": engine,
        "startedAt": started_at,
        "completedAt": completed_at,
    }


def assemble_index(
    *,
    job_id: str,
    asset_id: str,
    source_content_hash: str,
    timebase_map: dict[str, Any],
    sub_stages: list[dict[str, Any]],
    transcript: dict[str, Any] | None = None,
    speaker_turns: list[dict[str, Any]] | None = None,
    shots: list[dict[str, Any]] | None = None,
    scenes: list[dict[str, Any]] | None = None,
    ocr: list[dict[str, Any]] | None = None,
    visual_descriptions: list[dict[str, Any]] | None = None,
    audio_events: list[dict[str, Any]] | None = None,
    quality_flags: list[dict[str, Any]] | None = None,
    created_at: str,
    indexer_version: str = INDEXER_VERSION,
) -> dict[str, Any]:
    """Merge sub-stage outputs into one `source-index-v1` instance.

    `created_at` is passed in rather than read from the clock so that assembly is
    a pure function — the caller owns the one impure value, and a test can assert
    byte-identical output across runs.
    """
    if len(source_content_hash) != 64:
        raise ValueError("sourceContentHash must be a 64-character sha256 hex digest")

    index_id = derive_ulid("source-index", asset_id, source_content_hash, indexer_version)

    # Sub-stage records are ordered by the pipeline, not by completion time, so
    # the ledger reads the same way the pipeline runs regardless of scheduling.
    ordered_sub_stages = sorted(
        sub_stages,
        key=lambda record: SUB_STAGE_ORDER.index(record["name"]),
    )

    return {
        "indexId": index_id,
        "envelope": {
            "schemaVersion": SCHEMA_VERSION,
            "createdAt": created_at,
            "createdBy": {
                "kind": "skill",
                "skill": "index",
                "skillVersion": indexer_version,
            },
        },
        "jobId": job_id,
        "assetId": asset_id,
        "sourceContentHash": {"algorithm": "sha256", "value": source_content_hash},
        "indexerVersion": indexer_version,
        "timebaseMap": timebase_map,
        "subStages": ordered_sub_stages,
        # A sub-stage that did not run contributes an EMPTY collection, never a
        # placeholder entry. Its `subStages` record carries the reason.
        "transcript": transcript,
        "speakerTurns": _sorted_by_time(speaker_turns, "turnId"),
        "shots": _sorted_by_time(shots, "shotId"),
        "scenes": _sorted_by_time(scenes, "sceneId"),
        "ocr": _sorted_by_time(ocr, "ocrId"),
        "visualDescriptions": _sorted_by_time(visual_descriptions, "descriptionId"),
        "audioEvents": _sorted_by_time(audio_events, "eventId"),
        "qualityFlags": _sorted_by_time(quality_flags, "flagId"),
    }


def _sorted_by_time(items: list[dict[str, Any]] | None, id_field: str) -> list[dict[str, Any]]:
    """Deterministic ordering: start time, then ID as the tie-break.

    Without a total order, two runs that detect the same events in a different
    sequence would produce different bytes and fail the §12 determinism
    assertion for a reason that has nothing to do with detection.
    """
    if not items:
        return []
    return sorted(items, key=lambda item: (item.get("startTicks", 0), item.get(id_field, "")))
