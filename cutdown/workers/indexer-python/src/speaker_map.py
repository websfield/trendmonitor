"""Manual speaker naming for inferred turns — `--speaker-map <yaml>` (REQ-011).

D-17 defers real diarisation, so REQ-011 is met by inferred segment-level turns
*plus manual naming*. This module is the manual half.

The rules exist because of what a silent failure would cost:

* **An unknown turn ID is a validation failure, not a shrug.** A map keyed on a
  turn that no longer exists means the transcript was re-indexed and the turns
  moved — the names in that file now belong to different moments of speech.
  Ignoring the stale key would attach the remaining names to the wrong people.
* **A duplicate correction for one turn is a validation failure.** Two names for
  one turn has no correct resolution; picking last-wins would silently choose.
  This is also why the file format is a LIST of corrections rather than a YAML
  mapping — a mapping cannot express a duplicate for us to catch, because the
  parser collapses it before we ever see it.
* **The inference is preserved.** A correction lands in `correction: {name,
  author, correctedAt}` and NEVER overwrites `inferredLabel`, so a wrong
  correction is traceable to whoever made it instead of being indistinguishable
  from what the engine said.
* **A failed correction changes nothing.** The whole file is validated before any
  turn is touched, and application builds new turn objects, so a rejected map
  leaves the original inference byte-identical.

File format::

    author: reviewer@example.com          # optional default for every entry
    correctedAt: 2026-07-21T10:00:00Z     # optional default for every entry
    corrections:
      - turnId: turn-0001
        name: Ada Lovelace
      - turnId: turn-0002
        name: Grace Hopper
        author: someone-else@example.com  # per-entry override
"""

from __future__ import annotations

import argparse
import copy
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from harness import (
    EXIT_INPUT_VALIDATION,
    SubStageError,
    main_guard,
    write_json_atomic,
)

CODE_UNREADABLE = "SPEAKER_MAP_UNREADABLE"
CODE_INVALID = "SPEAKER_MAP_INVALID"
CODE_UNKNOWN_TURN = "SPEAKER_MAP_UNKNOWN_TURN"
CODE_DUPLICATE_TURN = "SPEAKER_MAP_DUPLICATE_TURN"


@dataclass(frozen=True)
class SpeakerCorrection:
    turn_id: str
    name: str
    author: str
    corrected_at: str

    def to_payload(self) -> dict[str, str]:
        return {"name": self.name, "author": self.author, "correctedAt": self.corrected_at}


def _invalid(message: str, **details: Any) -> SubStageError:
    return SubStageError(
        code=CODE_INVALID,
        message=message,
        details=details or None,
        exit_code=EXIT_INPUT_VALIDATION,
    )


def _require_text(value: Any, field: str, index: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _invalid(
            f"speaker map entry {index}: `{field}` must be a non-empty string",
            entryIndex=index,
            field=field,
        )
    return value.strip()


def _require_timestamp(value: Any, index: int) -> str:
    text = _require_text(value, "correctedAt", index)
    # `correctedAt` is schema `format: date-time`. Parsing here rather than
    # trusting the file keeps an unparseable timestamp a validation failure at
    # the boundary, instead of a schema failure much later in the assembler.
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise _invalid(
            f"speaker map entry {index}: `correctedAt` is not an ISO-8601 date-time: {text!r}",
            entryIndex=index,
            field="correctedAt",
        ) from error
    return text


def parse_speaker_map(document: Any) -> list[SpeakerCorrection]:
    """Validate a parsed YAML document into corrections. Order is preserved."""
    if document is None or document == {}:
        raise _invalid("speaker map is empty")
    if not isinstance(document, dict):
        raise _invalid("speaker map must be a mapping with a `corrections` list")

    unknown_keys = set(document) - {"author", "correctedAt", "corrections"}
    if unknown_keys:
        raise _invalid(
            f"speaker map has unrecognised top-level keys: {sorted(unknown_keys)}",
            keys=sorted(unknown_keys),
        )

    entries = document.get("corrections")
    if not isinstance(entries, list) or not entries:
        raise _invalid("speaker map must contain a non-empty `corrections` list")

    default_author = document.get("author")
    default_corrected_at = document.get("correctedAt")

    corrections: list[SpeakerCorrection] = []
    seen: dict[str, int] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise _invalid(f"speaker map entry {index}: each correction must be a mapping", entryIndex=index)
        unknown = set(entry) - {"turnId", "name", "author", "correctedAt"}
        if unknown:
            raise _invalid(
                f"speaker map entry {index}: unrecognised keys {sorted(unknown)}",
                entryIndex=index,
                keys=sorted(unknown),
            )

        turn_id = _require_text(entry.get("turnId"), "turnId", index)
        if turn_id in seen:
            # Two names for one turn has no correct resolution — refusing is the
            # only answer that cannot silently attach the wrong name.
            raise SubStageError(
                code=CODE_DUPLICATE_TURN,
                message=(
                    f"speaker map corrects {turn_id!r} twice "
                    f"(entries {seen[turn_id]} and {index}); one turn takes one name"
                ),
                details={"turnId": turn_id, "entryIndexes": [seen[turn_id], index]},
                exit_code=EXIT_INPUT_VALIDATION,
            )
        seen[turn_id] = index

        corrections.append(
            SpeakerCorrection(
                turn_id=turn_id,
                name=_require_text(entry.get("name"), "name", index),
                author=_require_text(entry.get("author", default_author), "author", index),
                corrected_at=_require_timestamp(entry.get("correctedAt", default_corrected_at), index),
            )
        )
    return corrections


def load_speaker_map(path: Path) -> list[SpeakerCorrection]:
    """Read and validate a speaker-map YAML file."""
    try:
        import yaml
    except ImportError as error:  # pragma: no cover - PyYAML ships with the env
        raise SubStageError(
            code=CODE_UNREADABLE,
            message="PyYAML is required to read a speaker map",
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error

    if not path.exists():
        raise SubStageError(
            code=CODE_UNREADABLE,
            message=f"speaker map file not found: {path.name}",
            details={"path": path.name},
            exit_code=EXIT_INPUT_VALIDATION,
        )
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 — yaml raises several error types
        raise SubStageError(
            code=CODE_UNREADABLE,
            message=f"speaker map is not valid YAML: {type(error).__name__}: {error}",
            details={"path": path.name},
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error
    return parse_speaker_map(document)


def validate_against_turns(corrections: list[SpeakerCorrection], turns: list[dict[str, Any]]) -> None:
    """Every corrected turn must exist. Runs BEFORE anything is applied."""
    known = {turn.get("turnId") for turn in turns}
    unknown = [c.turn_id for c in corrections if c.turn_id not in known]
    if unknown:
        raise SubStageError(
            code=CODE_UNKNOWN_TURN,
            message=(
                f"speaker map names turn(s) not present in this transcript: {unknown}. "
                "The transcript was likely re-indexed and the turn IDs moved."
            ),
            details={"unknownTurnIds": unknown, "knownTurnIds": sorted(t for t in known if t)},
            exit_code=EXIT_INPUT_VALIDATION,
        )


def apply_speaker_map(
    turns: list[dict[str, Any]], corrections: list[SpeakerCorrection]
) -> list[dict[str, Any]]:
    """Return NEW turns carrying corrections. The input list is never mutated.

    `inferredLabel` and `inferredConfidence` are copied through untouched: the
    correction is additional lineage, not a replacement for what was inferred.
    """
    validate_against_turns(corrections, turns)
    by_turn = {c.turn_id: c for c in corrections}
    corrected: list[dict[str, Any]] = []
    for turn in turns:
        clone = copy.deepcopy(turn)
        correction = by_turn.get(clone.get("turnId"))
        if correction is not None:
            clone["correction"] = correction.to_payload()
        corrected.append(clone)
    return corrected


def apply_speaker_map_to_artefact(artefact: dict[str, Any], path: Path) -> dict[str, Any]:
    """Load, validate and apply a map to a transcript sub-stage artefact.

    Validation happens in full before a single turn is rewritten, so a rejected
    map leaves the artefact exactly as the engine produced it.
    """
    turns = artefact.get("speakerTurns")
    if not isinstance(turns, list):
        raise _invalid("artefact has no `speakerTurns` list to correct")
    corrections = load_speaker_map(path)
    updated = copy.deepcopy(artefact)
    updated["speakerTurns"] = apply_speaker_map(turns, corrections)
    return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="speaker-map",
        description="Apply a speaker-map YAML to a transcript sub-stage artefact.",
    )
    parser.add_argument("--transcript", required=True, type=Path, help="transcript artefact JSON")
    parser.add_argument("--speaker-map", required=True, type=Path, help="speaker map YAML")
    parser.add_argument("--out", type=Path, help="output path (defaults to in-place)")
    args = parser.parse_args(argv)

    if not args.transcript.exists():
        raise SubStageError(
            code=CODE_UNREADABLE,
            message=f"transcript artefact not found: {args.transcript.name}",
            exit_code=EXIT_INPUT_VALIDATION,
        )
    try:
        artefact = json.loads(args.transcript.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SubStageError(
            code=CODE_UNREADABLE,
            message=f"transcript artefact is not valid JSON: {error}",
            exit_code=EXIT_INPUT_VALIDATION,
        ) from error

    updated = apply_speaker_map_to_artefact(artefact, args.speaker_map)
    write_json_atomic(args.out or args.transcript, updated)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main_guard(main))
