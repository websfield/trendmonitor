"""The durable state root (Phase 4) — every piece of cross-run trend-monitor state, one root.

Persists and rehydrates: the ``TrendSignalStore`` (signals + refresh dates), the bidirectional
``IdentityIndex`` (identity ↔ first_seen / first_detected_at / signal_id), the origin-labelled
``ResolvedSampleBook``, the ``TermRegistry`` (active + cold), and the ``VerdictLedger`` — so a
Phase 8 term admission tonight is in ``TermRegistry.active()`` tomorrow and the core loop
("trend detected tonight → corpus points at it tomorrow") closes across cron-invoked processes.

Discipline (Phase 4 R4/R5, ADR-0009 invariant 8):

* **Atomic writes** — serialize to a temp file, then ``os.replace``; a crash mid-write leaves the
  previous state intact, never a half-written file.
* **Fail closed on corruption** — an unreadable or malformed state file raises
  :class:`StateCorrupted`; the runtime never silently starts empty (which would hide history
  loss and re-mint every signal id). An *absent* file is a legitimate first run.
* **Append/compensate** — nothing here rewrites history: signals transition via the store's own
  rules (the archived-overwrite guard lives in ``archive.py``), samples and cold storage only
  accumulate.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from c1_pattern_engine.detector.archive import TrendSignalStore
from c1_pattern_engine.detector.identity import IdentityIndex, SignalIdentity
from c1_pattern_engine.detector.signals import TrendSignal
from c1_pattern_engine.detector.verdict import IssuedVerdict, VerdictLedger, _Outcome
from c1_pattern_engine.registry.terms import AdmissionOrigin, TermRegistry, TrackedTerm

__all__ = ["ResolutionOrigin", "ResolvedSampleBook", "StateCorrupted", "StateRoot"]

_STATE_FILENAME = "trend-monitor-state.json"
_STATE_VERSION = 1

ResolutionOrigin = Literal["automated", "human"]


class StateCorrupted(RuntimeError):
    """The state file exists but cannot be read/parsed — raise, never silently start empty."""


class ResolvedSampleBook:
    """Resolved trend durations, per platform, per resolution origin (Phase 4 R3).

    Measurement guards: (a) **public-scope only** — an internal signal's duration is tenant data
    and never enters the shared pool; (b) samples are **origin-labelled** and a signal's
    ``days_remaining`` draws only on its own origin class, each pool gated by
    ``lifecycle.MIN_RESOLUTIONS`` independently; (c) one sample per signal, ever — a signal that
    turned ``declining`` and later archives resolves once, not twice.

    **What actually separates the two pools is the START anchor, not the close.** Both close the
    same way — an observed volume decline. They differ in where the lifetime is measured *from*:
    ``automated`` runs from the volume-run start, ``human`` from the submitter's first sighting, so
    a human-anchored lifetime **includes the human lead time**. Merging them would silently add that
    lead to every automated estimate. (A human-*resolver*-observed close, if one is ever wired,
    is a third basis and needs its own pool — not this one.)

    **A ``human_sourced`` signal enters the ``human`` pool exactly one way: an observed decline.**
    Its *aging-out* never counts, and the two pools are therefore **censored differently** — a real
    asymmetry, deliberately kept:

    * ``human`` — observed declines only. A born signal that is never re-detected has a ``valid_to``
      that never moves, so its archive duration would be exactly the horizon CONSTANT; a pool of
      identical constants has ``MAD = 0`` and would publish a zero-width interval on a pure
      presumption. (A born signal that automation *does* later pick up has a ``valid_to`` that does
      move, so its archive close would be a genuine upper bound — but the spine cannot tell the two
      cases apart at archive time, so it censors **both**.) The pool is thus censored *short*: only
      trends that die inside the horizon enter, long-lived ones age out excluded. That biases the
      estimate short, which **tightens** the ``go`` lead-time guard — the conservative direction.
    * ``automated`` — observed declines **and** archive closes, the latter as deliberate upper
      bounds (Phase 4 R3).

    Do not "fix" this by symmetrising: the asymmetry is what keeps each pool honest about the
    lifetimes it can actually see. Until an observed decline arrives the human pool is empty, which
    correctly degrades to band-only with no numeric estimate.

    The two pools must also never leak into each other: the spine resolves a closing signal's origin
    from the **stored** record (the immutable birth origin), never from a freshly assembled object,
    whose ``detection_origin`` is always the ``automated`` default.
    """

    def __init__(self) -> None:
        self._samples: dict[tuple[str, ResolutionOrigin], list[float]] = {}
        self._resolved_ids: set[UUID] = set()

    def record(
        self,
        signal_id: UUID,
        *,
        platform: str,
        origin: ResolutionOrigin,
        scope: str,
        duration_days: float,
    ) -> bool:
        """Record one resolution. Returns False (and records nothing) for duplicates and for
        internal-scope signals — the tenancy guard, not an error."""
        if scope != "public" or signal_id in self._resolved_ids:
            return False
        self._resolved_ids.add(signal_id)
        self._samples.setdefault((platform, origin), []).append(float(duration_days))
        return True

    def samples(self, platform: str, origin: ResolutionOrigin) -> list[float]:
        return list(self._samples.get((platform, origin), []))

    def is_resolved(self, signal_id: UUID) -> bool:
        return signal_id in self._resolved_ids


@dataclass
class StateRoot:
    """The loaded state. ``StateRoot.load(root)`` → mutate via components → ``persist()``."""

    root: Path
    signals: TrendSignalStore
    identity: IdentityIndex
    samples: ResolvedSampleBook
    registry: TermRegistry
    ledger: VerdictLedger

    # --- lifecycle -------------------------------------------------------------------------

    @classmethod
    def load(cls, root: str | Path) -> StateRoot:
        root = Path(root)
        path = root / _STATE_FILENAME
        if not path.exists():
            return cls(
                root=root,
                signals=TrendSignalStore(),
                identity=IdentityIndex(),
                samples=ResolvedSampleBook(),
                registry=TermRegistry(),
                ledger=VerdictLedger(),
            )
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("state root must be a JSON object")
            return cls._deserialize(root, raw)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise StateCorrupted(
                f"Trend-monitor state at {path} is unreadable or malformed ({exc!r}). "
                "Refusing to start empty — that would hide history loss and re-mint every "
                "signal id. Restore the file or move it aside deliberately."
            ) from exc

    def persist(self) -> None:
        """Atomic write: temp file in the same directory, then ``os.replace``."""
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / _STATE_FILENAME
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._serialize(), indent=1), encoding="utf-8")
        os.replace(tmp, path)

    # --- serialization ---------------------------------------------------------------------

    def _serialize(self) -> dict:
        # Package-internal access to sibling privates: this module IS the persistence layer.
        return {
            "version": _STATE_VERSION,
            "signals": [_signal_to_dict(s) for s in self.signals._signals.values()],
            "last_refresh": {
                str(k): v.isoformat() for k, v in self.signals._last_refresh.items()
            },
            # One row per EPISODE (not per identity), in insertion order: replaying them through
            # record() rebuilds the per-identity current map AND the per-episode history, so a
            # superseded episode's id still resolves to its own dates after a restart.
            "identity": [
                {
                    "scope": ident.scope,
                    "tenant_id": str(ident.tenant_id) if ident.tenant_id else None,
                    "platform": ident.platform,
                    "vertical": ident.vertical,
                    "term": ident.term,
                    "first_seen": rec.first_seen.isoformat(),
                    "signal_id": str(rec.signal_id),
                    "first_detected_at": (
                        rec.first_detected_at.isoformat() if rec.first_detected_at else None
                    ),
                }
                for ident, rec in self.identity.episodes()
            ],
            "resolved_samples": [
                {"platform": platform, "origin": origin, "values": values}
                for (platform, origin), values in self.samples._samples.items()
            ],
            "resolved_ids": [str(i) for i in self.samples._resolved_ids],
            "registry": {
                "active": [_term_to_dict(t) for t in self.registry._active.values()],
                "cold": [_term_to_dict(t) for t in self.registry._cold],
            },
            "ledger": [
                {"verdict": o.verdict, "trend_survived": o.trend_survived}
                for o in self.ledger._outcomes
            ],
            "ledger_issued": [
                {
                    "trend_id": str(i.trend_id),
                    "tenant_id": str(i.tenant_id),
                    "verdict": i.verdict,
                    "issued_on": i.issued_on.isoformat(),
                    "lead_time_days": i.lead_time_days,
                    "signal_scope": i.signal_scope,
                }
                for i in self.ledger.open_issues()
            ],
            "ledger_resolved": [
                [str(t), str(ten)] for t, ten in sorted(self.ledger._resolved, key=str)
            ],
        }

    @classmethod
    def _deserialize(cls, root: Path, raw: dict) -> StateRoot:
        if raw.get("version") != _STATE_VERSION:
            raise ValueError(f"unknown state version {raw.get('version')!r}")

        signals = TrendSignalStore()
        signals._signals = {sig.id: sig for sig in map(_signal_from_dict, raw["signals"])}
        signals._last_refresh = {
            UUID(k): date.fromisoformat(v) for k, v in raw["last_refresh"].items()
        }

        identity = IdentityIndex()
        for row in raw["identity"]:
            identity.record(
                SignalIdentity(
                    scope=row["scope"],
                    tenant_id=UUID(row["tenant_id"]) if row["tenant_id"] else None,
                    platform=row["platform"],
                    vertical=row["vertical"],
                    term=row["term"],
                ),
                first_seen=date.fromisoformat(row["first_seen"]),
                signal_id=UUID(row["signal_id"]),
                first_detected_at=(
                    datetime.fromisoformat(row["first_detected_at"])
                    if row["first_detected_at"]
                    else None
                ),
            )

        samples = ResolvedSampleBook()
        for row in raw["resolved_samples"]:
            samples._samples[(row["platform"], row["origin"])] = [
                float(v) for v in row["values"]
            ]
        samples._resolved_ids = {UUID(i) for i in raw["resolved_ids"]}

        registry = TermRegistry()
        for row in raw["registry"]["active"]:
            term = _term_from_dict(row)
            registry._active[term.key] = term
        registry._cold = [_term_from_dict(row) for row in raw["registry"]["cold"]]

        ledger = VerdictLedger()
        ledger._outcomes = [
            _Outcome(verdict=o["verdict"], trend_survived=bool(o["trend_survived"]))
            for o in raw["ledger"]
        ]
        for row in raw.get("ledger_issued", []):  # absent in pre-Phase-6 files — legitimate
            issued = IssuedVerdict(
                trend_id=UUID(row["trend_id"]),
                tenant_id=UUID(row["tenant_id"]),
                verdict=row["verdict"],
                issued_on=date.fromisoformat(row["issued_on"]),
                lead_time_days=float(row["lead_time_days"]),
                signal_scope=row["signal_scope"],
            )
            ledger._issued[(issued.trend_id, issued.tenant_id)] = issued
        ledger._resolved = {
            (UUID(t), UUID(ten)) for t, ten in raw.get("ledger_resolved", [])
        }

        return cls(
            root=root,
            signals=signals,
            identity=identity,
            samples=samples,
            registry=registry,
            ledger=ledger,
        )


def _signal_to_dict(s: TrendSignal) -> dict:
    return {
        "id": str(s.id),
        "scope": s.scope,
        "tenant_id": str(s.tenant_id) if s.tenant_id else None,
        "platform": s.platform,
        "vertical": s.vertical,
        "kind": s.kind,
        "lifecycle_stage": s.lifecycle_stage,
        "confidence": s.confidence,
        "valid_to": s.valid_to.isoformat(),
        "archived_at": s.archived_at.isoformat() if s.archived_at else None,
        "detection_origin": s.detection_origin,
    }


def _signal_from_dict(row: dict) -> TrendSignal:
    return TrendSignal(
        id=UUID(row["id"]),
        scope=row["scope"],
        tenant_id=UUID(row["tenant_id"]) if row["tenant_id"] else None,
        platform=row["platform"],
        vertical=row["vertical"],
        kind=row["kind"],
        lifecycle_stage=row["lifecycle_stage"],
        confidence=row["confidence"],
        valid_to=date.fromisoformat(row["valid_to"]),
        archived_at=(
            datetime.fromisoformat(row["archived_at"]) if row["archived_at"] else None
        ),
        # Absent in pre-Phase-9 files → the honest default (every prior signal was scanner-raised).
        detection_origin=row.get("detection_origin", "automated"),
    )


def _term_to_dict(t: TrackedTerm) -> dict:
    return {
        "term": t.term,
        "vertical": t.vertical,
        "platform": t.platform,
        "origin": t.origin.value,
        "admitted_at": t.admitted_at.isoformat(),
        "last_activity_at": t.last_activity_at.isoformat(),
        "kind": t.kind,
    }


def _term_from_dict(row: dict) -> TrackedTerm:
    return TrackedTerm(
        term=row["term"],
        vertical=row["vertical"],
        platform=row["platform"],
        origin=AdmissionOrigin(row["origin"]),
        admitted_at=datetime.fromisoformat(row["admitted_at"]),
        last_activity_at=datetime.fromisoformat(row["last_activity_at"]),
        kind=row["kind"],
    )
