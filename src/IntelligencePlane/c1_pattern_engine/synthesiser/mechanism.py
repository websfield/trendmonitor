"""The ``Mechanism`` dataclass — a hypothesis, never a number (Rule 6, Contract E).

A ``Mechanism`` carries **no effect size** (no ``effect_size``/``lift``/``vps``/``aws`` — and no
``arm``; it carries ``ingestion_arm``), a **required** ``falsifier``, a ``warrant`` computed
deterministically from corpus counts, a ``never_tested_against`` admission of survivorship bias, and
a ``provenance`` block fixed at ``Proxy-selected, Measured-evaluated``. It has **no tenant axis**.

Its :meth:`to_dict` emits exactly the shape ``mechanisms-v1.json`` accepts — nothing more, because
``additionalProperties: false`` turns a stray forbidden key into a validation failure rather than a
laundered number. An **unratified** mechanism cannot be serialised (``ratified_by`` is a required
uuid), so it is structurally unservable — there is no ``include_unratified`` door.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

from c1_pattern_engine.corpora.exemplar import IngestionArm
from c1_pattern_engine.synthesiser.propose import FeaturePredicate
from c1_pattern_engine.synthesiser.warrant import Evidence, Warrant

__all__ = [
    "CORPUS_SELECTION",
    "NEVER_TESTED_AGAINST",
    "PREDICATE_EVALUATION",
    "PROVENANCE_LABEL",
    "Mechanism",
    "MissingFalsifierError",
]

# The provenance block is a constant on every mechanism — see mechanisms-v1.json.
CORPUS_SELECTION = "Proxy"
PREDICATE_EVALUATION = "Measured"
PROVENANCE_LABEL = "Proxy-selected, Measured-evaluated"
NEVER_TESTED_AGAINST = "content that was attempted and failed"

_SERVED_WARRANTS = frozenset({Warrant.RECURRENT, Warrant.CONTRASTED})


class MissingFalsifierError(ValueError):
    """A mechanism was constructed without a falsifier — a caption, not a mechanism (REQ-063)."""


class UnratifiedSerialisationError(RuntimeError):
    """An unratified mechanism cannot be serialised to the served contract shape."""


@dataclass(frozen=True, slots=True)
class Mechanism:
    """A falsifiable hypothesis about **why** a content structure recurs among high performers."""

    id: UUID
    statement: str
    feature_predicate: FeaturePredicate
    falsifier: str
    warrant: Warrant
    evidence: Evidence
    ingestion_arm: IngestionArm
    valid_from: date
    valid_to: date
    occasioned_by_trend_ids: tuple[UUID, ...] = ()
    ratified_by: UUID | None = None
    ratified_at: datetime | None = None
    ratification_note: str | None = None
    superseded_by: UUID | None = None

    def __post_init__(self) -> None:
        if not self.falsifier or not self.falsifier.strip():
            raise MissingFalsifierError(
                "A Mechanism must carry a non-empty falsifier, recorded before its evidence "
                "(REQ-063). Without one it is not persisted."
            )

    @property
    def is_ratified(self) -> bool:
        """The single authoritative test of ratification — the **same triple** :meth:`to_dict`'s
        raise-guard checks (``ratified_by``, ``ratified_at``, ``ratification_note``), so a record
        that passes this can always be serialised. A partial record (e.g. ``ratified_at is None``)
        is *not* ratified, and callers gating on this can never hand ``to_dict`` a raiser."""
        return (
            self.ratified_by is not None
            and self.ratified_at is not None
            and self.ratification_note is not None
            and bool(self.ratification_note.strip())
        )

    @property
    def is_servable(self) -> bool:
        """Served by C4 only when human-ratified **and** at a served rung (``recurrent`` up)."""
        return self.is_ratified and self.warrant in _SERVED_WARRANTS

    def to_dict(self) -> dict[str, Any]:
        """Emit the ``mechanisms-v1.json`` mechanism shape. Refuses an unratified mechanism.

        ``ratified_by`` is a required uuid in the contract; an unratified mechanism would emit a
        null there and fail validation. Refusing here makes the unservability structural rather
        than a downstream surprise.
        """
        if self.ratified_by is None or self.ratified_at is None or self.ratification_note is None:
            raise UnratifiedSerialisationError(
                "Refusing to serialise an unratified Mechanism to the served contract. Promotion "
                "requires a named human (ratified_by) and a non-empty ratification_note before any "
                "rung is served (REQ-065)."
            )
        return {
            "id": str(self.id),
            "statement": self.statement,
            "feature_predicate": self.feature_predicate.to_dict(),
            "falsifier": self.falsifier,
            "warrant": self.warrant.value,
            "evidence": self.evidence.to_dict(),
            "provenance": {
                "corpus_selection": CORPUS_SELECTION,
                "predicate_evaluation": PREDICATE_EVALUATION,
                "label": PROVENANCE_LABEL,
            },
            "never_tested_against": NEVER_TESTED_AGAINST,
            "occasioned_by_trend_ids": [str(t) for t in self.occasioned_by_trend_ids],
            "ingestion_arm": self.ingestion_arm.value,
            "ratified_by": str(self.ratified_by),
            "ratified_at": self.ratified_at.isoformat(),
            "ratification_note": self.ratification_note,
            "superseded_by": str(self.superseded_by) if self.superseded_by else None,
            "valid_from": self.valid_from.isoformat(),
            "valid_to": self.valid_to.isoformat(),
        }

    def with_ratification(
        self, *, ratified_by: UUID, ratified_at: datetime, ratification_note: str
    ) -> Mechanism:
        return dataclasses.replace(
            self,
            ratified_by=ratified_by,
            ratified_at=ratified_at,
            ratification_note=ratification_note,
        )
