"""P6 — the C1 pattern miner.

**Proposal runs over the union of both corpora; estimation runs over the internal corpus only.**
That one sentence is the whole architecture: :mod:`propose` reads the union (features only, no
outcome), :mod:`estimate` reads the internal corpus through the ``MeasuredOutcome`` barrier so a
``Proxy`` value cannot enter an effect size. Promotion is guarded three ways — Benjamini-Hochberg
across the full candidate set (:mod:`multiplicity`), temporal replication + a prior-quarter
back-test (:mod:`replicate`), and an evidence floor (:mod:`status`) — and arm conditioning
(:mod:`arm`) treats exploit-arm estimates as upper bounds.

This miner is **separate** from Phase 8's mechanism synthesiser: its proposal output never reaches
the synthesiser, and it imports none of the synthesiser's code.
"""

from __future__ import annotations

from c1_pattern_engine.miner.arm import (
    ARM_WEIGHT,
    EXPLORE_MIN_N,
    ArmedEstimate,
    estimate_with_arm,
)
from c1_pattern_engine.miner.estimate import (
    BOOTSTRAP_ITERATIONS,
    estimate_effect_size,
    estimate_predicate,
)
from c1_pattern_engine.miner.freshness import CORPUS_STALE_DAYS, is_corpus_stale
from c1_pattern_engine.miner.model import (
    CandidatePredicate,
    InternalPost,
    ProposalPost,
    Source,
)
from c1_pattern_engine.miner.multiplicity import (
    DEFAULT_ALPHA,
    BHResult,
    benjamini_hochberg,
    select_survivors,
)
from c1_pattern_engine.miner.pattern import (
    SAMPLE_FLOOR,
    Arm,
    EffectSize,
    EvidenceStatus,
    Pattern,
)
from c1_pattern_engine.miner.propose import propose_predicates
from c1_pattern_engine.miner.replicate import Replication, replicate
from c1_pattern_engine.miner.status import evidence_status

__all__ = [
    "ARM_WEIGHT",
    "BOOTSTRAP_ITERATIONS",
    "CORPUS_STALE_DAYS",
    "DEFAULT_ALPHA",
    "EXPLORE_MIN_N",
    "SAMPLE_FLOOR",
    "Arm",
    "ArmedEstimate",
    "BHResult",
    "CandidatePredicate",
    "EffectSize",
    "EvidenceStatus",
    "InternalPost",
    "Pattern",
    "ProposalPost",
    "Replication",
    "Source",
    "benjamini_hochberg",
    "estimate_effect_size",
    "estimate_predicate",
    "estimate_with_arm",
    "evidence_status",
    "is_corpus_stale",
    "propose_predicates",
    "replicate",
    "select_survivors",
]
