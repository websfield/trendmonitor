"""Deterministic identity for index artefacts.

tech-spec §3 requires object IDs to be ULIDs — Crockford base32, 26 characters.
tech-spec §12 separately requires deterministic (non-model) stages to be
byte-identical across runs on the same input.

A conventional ULID encodes wall-clock time, so those two requirements collide:
a time-based ID makes every re-run of a byte-identical input produce a different
artefact, which breaks both the determinism assertion and the REQ-005 content
cache (a re-index would differ from its predecessor in the ID alone).

The resolution: derive the ID from the CONTENT it identifies. The result still
satisfies the ULID lexical contract that every consumer validates against
(`^[0-9A-HJKMNP-TV-Z]{26}$`), while making identity a pure function of inputs.
Two indexes of the same asset at the same indexer version get the same ID
because they ARE the same index; a different asset, or a different indexer
version, gets a different one.

What is deliberately given up: ULIDs are normally sortable by creation time.
Nothing in Cutdown sorts artefacts by ID — lineage is carried by explicit parent
fields and ordering by `startTicks` — so the property is unused, and trading it
for reproducibility is the better bargain.
"""

from __future__ import annotations

import hashlib

# Crockford base32 — the ULID alphabet. Excludes I, L, O and U so that a
# transcribed ID cannot be confused with 1, 0 or a profanity.
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ULID_LENGTH = 26


def derive_ulid(*parts: str) -> str:
    """A stable 26-character Crockford-base32 ID derived from `parts`.

    Distinct inputs yield distinct IDs with the collision resistance of the
    underlying sha256, truncated to the 130 bits a 26-character base32 string
    carries.
    """
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).digest()

    # Interpret the digest as a big integer and emit 26 base32 symbols, most
    # significant first. Slicing the hex string instead would waste half the
    # entropy, since hex only uses 16 of the 32 available symbols.
    value = int.from_bytes(digest, "big")
    out = []
    for _ in range(_ULID_LENGTH):
        out.append(_CROCKFORD[value % 32])
        value //= 32
    return "".join(reversed(out))


def ordinal_id(prefix: str, index: int, *, width: int = 4) -> str:
    """A stable sub-stage identifier such as `shot-0001`.

    Sub-stage IDs are NOT ULIDs (the schema types them as plain non-empty
    strings). They are ordinals so that a human reading an index can follow
    `shot-0007` to the seventh shot, and so that a re-run reproduces them
    exactly.
    """
    return f"{prefix}-{index:0{width}d}"
