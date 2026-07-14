"""Shared content-addressed artefact-store writer — the language-neutral layout contract.

C1 (this Python plane) is the only writer of either published artefact; C2 and C4 (C#) read them.
The wire is a filesystem/blob layout, byte-for-byte agreed with ``ArtefactStore.cs``:

    <root>/<prefix>/<sha256[0:2]>/<sha256>.json

where ``<sha256>`` is the **lowercase hex SHA-256 of the exact UTF-8 bytes of the file content** —
identical to ``ArtefactStore.ComputeSha256``
(``Convert.ToHexStringLower(SHA256.HashData(UTF8 bytes))``). The C# reader re-hashes every artefact
on read and refuses on mismatch (a P1), so the filename and the content must agree to the byte. This
writer therefore writes plain UTF-8, **no BOM, no trailing newline**, and lets the *content* alone
determine the filename.

**This writer writes ONLY content-addressed ``<sha>`` artefacts. It has no method, no parameter, and
no code path that writes a ``pointer/active_version`` key.** Repointing ``active_version`` *is*
library promotion, and promotion is C3's sole authority (``RepointActiveVersion`` is ``internal`` to
the C# writer assembly, gated on a ``LibraryVerdict`` — ADR-0005, Rule 3). A Python writer that
could repoint would let C1 self-promote and bypass C3's verdict (patterns) or a human's ratification
(mechanisms). The filename is always derived from the content hash, so there is no key a caller
could steer at a pointer.

The two published artefacts occupy **distinct, prefix-discriminated keyspaces**: a mechanism
artefact is never loadable by C2's pattern (VPS) resolver, because a mechanism carries
``Proxy``-selected provenance and is a hypothesis — a mechanism reaching VPS would violate
"mechanisms never enter VPS". The writer refuses any prefix outside the two known content keyspaces.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

__all__ = [
    "MECHANISMS_PREFIX",
    "PATTERNS_PREFIX",
    "ContentAddressedArtefactWriter",
    "canonical_json",
    "content_sha256",
]

# Byte-for-byte the same prefix tokens as ArtefactStore.PatternsPrefix / MechanismsPrefix (C#).
PATTERNS_PREFIX = "patterns"
MECHANISMS_PREFIX = "mechanisms"

# The only two content keyspaces. A prefix outside this set (e.g. "patterns/pointer") is refused,
# so the writer can never be steered at the pointer keyspace ArtefactStore reserves for promotion.
_ALLOWED_PREFIXES = frozenset({PATTERNS_PREFIX, MECHANISMS_PREFIX})


def content_sha256(content: str) -> str:
    """Lowercase hex SHA-256 of the UTF-8 bytes of ``content`` (mirrors ComputeSha256 in C#)."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def canonical_json(body: dict[str, Any]) -> str:
    """Deterministic JSON: sorted keys, tight separators, no BOM, no newline. Stable across runs so
    the content address is reproducible."""
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class ContentAddressedArtefactWriter:
    """Writes immutable, content-addressed artefacts under a fixed root.

    The single write operation names the file from the SHA-256 of its content; the caller supplies a
    *prefix* (which keyspace) and the *content*, never a filename or key. There is deliberately no
    ``repoint``/``active_version`` operation here — that authority lives only in the C# writer
    assembly, gated on C3's verdict.
    """

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root)

    def write(self, prefix: str, content: str) -> str:
        """Write ``content`` under ``prefix`` at ``<root>/<prefix>/<sha[0:2]>/<sha>.json``; return
        the sha. Write-once: an existing identical artefact is left untouched (immutability)."""
        if prefix not in _ALLOWED_PREFIXES:
            raise ValueError(
                f"Unknown artefact prefix {prefix!r}: the writer serves only the content keyspaces "
                f"{sorted(_ALLOWED_PREFIXES)}. It cannot write a pointer/active_version key — that "
                "is promotion, C3's sole authority (ADR-0005, Rule 3)."
            )
        sha = content_sha256(content)
        path = self._root / prefix / sha[:2] / f"{sha}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            # newline="" so no platform newline translation corrupts the hashed bytes; encoding
            # "utf-8" writes no BOM. What we hash is exactly what lands on disk.
            path.write_text(content, encoding="utf-8", newline="")
        return sha
