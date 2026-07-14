"""C1 corpora (§1.5-1.6). Phase 4 ships the internal corpus assembler (P4-T7).

The internal corpus is built by **replaying the append-only event log** into one record per
submission — features joined to outcome, arm, and human judgement. C1 only ever consumes that log
(Rule 3); it writes no ``OutcomeEvent``. The exemplar corpus and event-replay mining live in later
phases; this module is the assembler alone.
"""

from __future__ import annotations

from c1_pattern_engine.corpora.internal import (
    EVENT_TYPES,
    AssembledRecord,
    AssembledSnapshot,
    MissingArmError,
    OutcomeEvent,
    replay,
)
from c1_pattern_engine.corpora.repository import PatternRepository

__all__ = [
    "EVENT_TYPES",
    "AssembledRecord",
    "AssembledSnapshot",
    "MissingArmError",
    "OutcomeEvent",
    "PatternRepository",
    "replay",
]
