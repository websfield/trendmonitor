"""De-identification: the inverse of extraction, scheduled not intended (P2-T7).

compliance-notes / APP 11: after the rights window, frames and the transcript are dropped and only
tenant-neutral derived scalars survive. This job is *scheduled* — it runs on a clock, it is not a
thing an operator has to remember to do. ``cut_cadence_per_sec`` and ``filler_word_rate`` are the
two scalars the plan names explicitly; both are structural, neither is personal content.

The transform is pure (:func:`deidentify_record`); the scheduling selection is deterministic
(:func:`due_for_deidentification`); the job (:func:`run_deidentification`) wires them to a store.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from extraction.model import DeidentifiedRecord, FeatureRecord

__all__ = [
    "IFeatureRecordStore",
    "deidentify",
    "deidentify_record",
    "due_for_deidentification",
    "run_deidentification",
]


def deidentify_record(record: FeatureRecord, *, now: datetime) -> DeidentifiedRecord:
    """Drop frames and the transcript; retain the derived scalars.

    ``onscreen_text``, ``disclosure_signals``, and ``first_frame_features`` go with the frames —
    they are content derived from frames. What remains is what a tenant-neutral mechanism-prevalence
    count can legitimately read after the media itself is gone.
    """
    return DeidentifiedRecord(
        id=record.id,
        extractor_version=record.extractor_version,
        media_sha256=record.media_sha256,
        media_duration_ms=record.media_duration_ms,
        cut_cadence_per_sec=record.cut_cadence_per_sec,
        cut_confidence=record.cut_confidence,
        filler_word_rate=record.authenticity_signals.filler_word_rate,
        audio_signals_complete=record.authenticity_signals.audio_signals_complete,
        no_redistribute=record.no_redistribute,
        derived_at=record.derived_at,
        deidentified_at=now,
    )


class IFeatureRecordStore(Protocol):
    """The artefact store. Fakes implement this for tests; no relational entity exists."""

    def get(self, record_id: UUID) -> FeatureRecord | None: ...

    def list_ids(self) -> tuple[UUID, ...]: ...

    def replace_with_deidentified(self, deidentified: DeidentifiedRecord) -> None: ...


@dataclass(frozen=True, slots=True)
class _DueRecord:
    record_id: UUID
    derived_at: datetime


def due_for_deidentification(
    records: tuple[FeatureRecord, ...], *, now: datetime, rights_window: timedelta
) -> tuple[UUID, ...]:
    """Select records whose rights window has elapsed. Deterministic: ``derived_at + window <=
    now``. No probabilistic sampling — the clock decides, nothing else."""
    cutoff = now - rights_window
    return tuple(r.id for r in records if r.derived_at <= cutoff)


def deidentify(record_id: UUID, store: IFeatureRecordStore, *, now: datetime) -> DeidentifiedRecord:
    """De-identify a single stored record in place, replacing it with its stripped form."""
    record = store.get(record_id)
    if record is None:
        raise KeyError(f"No FeatureRecord {record_id} to de-identify.")
    stripped = deidentify_record(record, now=now)
    store.replace_with_deidentified(stripped)
    return stripped


def run_deidentification(
    store: IFeatureRecordStore, *, now: datetime, rights_window: timedelta
) -> tuple[DeidentifiedRecord, ...]:
    """The scheduled job: de-identify every record whose rights window has elapsed."""
    records = tuple(
        r for r in (store.get(rid) for rid in store.list_ids()) if r is not None
    )
    due = due_for_deidentification(records, now=now, rights_window=rights_window)
    return tuple(deidentify(rid, store, now=now) for rid in due)
