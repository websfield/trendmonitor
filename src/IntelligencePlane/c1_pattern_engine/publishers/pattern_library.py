"""P6-T7 — the pattern library publisher (Contract D).

C1 cuts a ``candidate`` library any time — cheap, no authority needed. To *publish* it, C1 must
receive a ``LibraryVerdict`` of ``promote`` from C3. **C1 cannot promote itself**: an unreachable
C3 (modelled as ``verdict=None``) leaves the candidate a candidate, no publication — the safe
direction (Rule 3). C1 never *calls* C3; the verdict is an injected input.

Two immutability rules (Rule 9):

* A published ``PatternLibraryVersion`` is content-addressed and frozen; it is never modified.
* ``active_version`` is a per-cohort pointer. Rollback repoints the pointer to an earlier,
  still-resolvable version — it never edits or deletes an artefact.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from c1_pattern_engine.miner.pattern import Pattern
from c1_pattern_engine.publishers.artefact_store_writer import (
    PATTERNS_PREFIX,
    ContentAddressedArtefactWriter,
    canonical_json,
)

__all__ = [
    "LibraryVerdict",
    "PatternLibraryArtefact",
    "PatternLibraryPublisher",
    "PatternLibraryVersion",
    "PublicationRefused",
    "build_pattern_library_body",
    "write_pattern_library_artefact",
]

LibraryVerdict = Literal["promote", "reject", "extend_shadow"]


class PublicationRefused(RuntimeError):
    """Publication was refused because C3 did not issue ``promote`` (or C3 was unreachable).

    The candidate remains a candidate. C1 cannot publish a pattern library without C3's verdict —
    the safe direction when the referee is silent.
    """


def _content_id(vertical: str, platform: str, patterns: tuple[Pattern, ...]) -> str:
    """A deterministic content hash over the cohort and its patterns (content-addressed)."""
    body = {
        "vertical": vertical,
        "platform": platform,
        "patterns": [
            {
                "id": str(p.id),
                "assertion": p.assertion,
                "feature_predicate": p.feature_predicate,
                "effect_size": p.effect_size,
                "effect_ci": list(p.effect_ci),
                "sample_size": p.sample_size,
                "evidence_arm": p.evidence_arm,
                "evidence_status": p.evidence_status,
                "valid_from": p.valid_from.isoformat(),
                "valid_to": p.valid_to.isoformat(),
                "is_upper_bound": p.is_upper_bound,
            }
            for p in patterns
        ],
    }
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode("utf-8")).hexdigest()
    return f"patlib-{digest[:16]}"


@dataclass(frozen=True, slots=True)
class PatternLibraryVersion:
    """An immutable, content-addressed library artefact for one ``(tenant_id, vertical, platform)``.

    Every pattern — including ``insufficient_evidence`` and ``stale`` ones — is shipped inside for
    auditability; the repository decides which are retrieved for scoring.
    """

    version_id: str
    tenant_id: UUID
    vertical: str
    platform: str
    patterns: tuple[Pattern, ...]
    created_at: datetime


class PatternLibraryPublisher:
    """Cuts candidates, publishes on ``promote``, and holds the immutable version store.

    ``active_version`` is a pointer per ``(tenant_id, vertical, platform)``. Superseded versions
    stay resolvable by ``version_id`` forever.
    """

    def __init__(self) -> None:
        self._versions: dict[str, PatternLibraryVersion] = {}
        self._active: dict[tuple[UUID, str, str], str] = {}

    def cut_candidate(
        self,
        *,
        tenant_id: UUID,
        vertical: str,
        platform: str,
        patterns: tuple[Pattern, ...],
        created_at: datetime,
    ) -> PatternLibraryVersion:
        """Cut a candidate library. Cheap and needs no authority — it is not yet published."""
        version_id = _content_id(vertical, platform, patterns)
        return PatternLibraryVersion(
            version_id=version_id,
            tenant_id=tenant_id,
            vertical=vertical,
            platform=platform,
            patterns=patterns,
            created_at=created_at,
        )

    def publish(
        self,
        candidate: PatternLibraryVersion,
        verdict: LibraryVerdict | None,
    ) -> PatternLibraryVersion:
        """Publish a candidate **only** on ``promote``. Any other verdict — or ``None`` (C3
        unreachable) — refuses, and ``active_version`` is left unchanged."""
        if verdict != "promote":
            raise PublicationRefused(
                f"C1 cannot publish without C3's promote (got {verdict!r}). The candidate stays a "
                "candidate; C1 does not promote itself (Contract D, the safe direction)."
            )
        # Store the immutable artefact and repoint the active pointer. The artefact is never edited.
        self._versions[candidate.version_id] = candidate
        self._active[(candidate.tenant_id, candidate.vertical, candidate.platform)] = (
            candidate.version_id
        )
        return candidate

    def active_version(
        self, *, tenant_id: UUID, vertical: str, platform: str
    ) -> PatternLibraryVersion | None:
        """The currently-active library for a cohort, or ``None`` if nothing is published yet."""
        version_id = self._active.get((tenant_id, vertical, platform))
        return self._versions.get(version_id) if version_id is not None else None

    def resolve(self, version_id: str) -> PatternLibraryVersion:
        """Resolve any published version by id — a superseded version still resolves (immutable)."""
        return self._versions[version_id]

    def rollback(
        self, *, tenant_id: UUID, vertical: str, platform: str, to_version_id: str
    ) -> None:
        """Roll back by repointing ``active_version`` to an earlier version. Never edits artefacts.

        The target must be an already-published version for this cohort — rollback repoints, it
        does not resurrect or fabricate.
        """
        target = self._versions.get(to_version_id)
        if target is None or (target.tenant_id, target.vertical, target.platform) != (
            tenant_id,
            vertical,
            platform,
        ):
            raise ValueError(
                f"Cannot roll back to {to_version_id!r}: not a published version for this cohort. "
                "Rollback repoints active_version to an existing artefact, never edits one."
            )
        self._active[(tenant_id, vertical, platform)] = to_version_id


# --- Cross-process transport: the content-addressed store artefact --------------------------
#
# The in-memory ``PatternLibraryPublisher`` above holds Python-side bookkeeping. The *transport*
# to C2 (the VPS/pattern resolver, C#) is the shared artefact store: a pattern library is
# serialised to a canonical JSON body and written content-addressed under the ``patterns`` prefix,
# byte-for-byte as ``ArtefactStore.cs`` reads it. Writing the immutable artefact is not promotion —
# repointing ``active_version`` is, and that stays C3's authority (Rule 3). C1 has no repoint path.


@dataclass(frozen=True, slots=True)
class PatternLibraryArtefact:
    """A pattern library serialised to the store: its content-address sha and the exact body bytes.

    ``sha256`` is the store content address (over the written bytes); ``prefix`` is always
    ``patterns`` — a keyspace distinct from ``mechanisms`` so C2's VPS resolver, scoped to
    ``patterns``, can never load a mechanism artefact.
    """

    pattern_library_version: str
    sha256: str
    prefix: str
    body: dict[str, Any]


def build_pattern_library_body(
    version: PatternLibraryVersion,
    *,
    compatible_extractor_versions: Sequence[str],
    revision: int,
    corpus_snapshot_sha256: str,
) -> dict[str, Any]:
    """Serialise a ``PatternLibraryVersion`` to the artefact body C2's pattern resolver reads.

    ``library_kind`` discriminates the artefact type; ``compatible_extractor_versions`` is what
    ``VersionTriple.IsCompatibleWith`` matches against so the score's extractor can be checked. A
    pattern library is **tenant-scoped** (Rule 8), so ``tenant_id`` is on the body — the opposite of
    a mechanism library, which carries no tenant axis.
    """
    return {
        "library_kind": "pattern_library",
        "pattern_library_version": f"{version.vertical}.{version.platform}.v{revision}",
        "content_id": version.version_id,
        "tenant_id": str(version.tenant_id),
        "vertical": version.vertical,
        "platform": version.platform,
        "created_at": version.created_at.isoformat(),
        "corpus_snapshot_sha256": corpus_snapshot_sha256,
        "compatible_extractor_versions": list(compatible_extractor_versions),
        "patterns": [
            {
                "id": str(p.id),
                "assertion": p.assertion,
                "feature_predicate": p.feature_predicate,
                "effect_size": p.effect_size,
                "effect_ci": list(p.effect_ci),
                "sample_size": p.sample_size,
                "evidence_arm": p.evidence_arm,
                "evidence_status": p.evidence_status,
                "valid_from": p.valid_from.isoformat(),
                "valid_to": p.valid_to.isoformat(),
                "is_upper_bound": p.is_upper_bound,
                "is_retrievable": p.is_retrievable,
            }
            for p in version.patterns
        ],
    }


def write_pattern_library_artefact(
    version: PatternLibraryVersion,
    store_writer: ContentAddressedArtefactWriter,
    *,
    compatible_extractor_versions: Sequence[str],
    revision: int,
    corpus_snapshot_sha256: str,
) -> PatternLibraryArtefact:
    """Write ``version`` to the shared store, content-addressed, under the ``patterns`` prefix.

    Returns the artefact ref (version, store sha, prefix, body). This writes the immutable artefact
    only; it does **not** repoint ``active_version`` — promotion is C3's sole authority and this
    writer has no pointer path.
    """
    body = build_pattern_library_body(
        version,
        compatible_extractor_versions=compatible_extractor_versions,
        revision=revision,
        corpus_snapshot_sha256=corpus_snapshot_sha256,
    )
    content = canonical_json(body)
    sha = store_writer.write(PATTERNS_PREFIX, content)
    return PatternLibraryArtefact(
        pattern_library_version=body["pattern_library_version"],
        sha256=sha,
        prefix=PATTERNS_PREFIX,
        body=body,
    )
