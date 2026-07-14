"""P6-T1 — predicate proposal over the UNION of both corpora.

Stage 1 is cheap, generous, and biased, and that is fine — promotion is where the discipline
lives. It reads the *union* of the exemplar and internal corpora as :class:`ProposalPost`s and
emits candidate feature predicates: one per observed value of a categorical/boolean feature, a
``>= median`` band per numeric feature, and pairwise combinations. It reads **only features**, so
no ``Proxy`` outcome (nor any outcome at all) enters this stage.

Reading the exemplar side here is not a provenance leak: an exemplar contributes a *predicate to
try*, never a magnitude to trust. The magnitude is estimated later, on the internal corpus only.
"""

from __future__ import annotations

from collections.abc import Iterable
from statistics import median
from typing import Any

from c1_pattern_engine.miner.model import CandidatePredicate, ProposalPost

__all__ = ["NUMERIC_BAND_QUANTILE", "propose_predicates"]

# Numeric features get a single ">= cohort median" band candidate. Cheap and generous by design.
NUMERIC_BAND_QUANTILE = "median"


def _is_numeric(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


_OP_SYMBOL = {"eq": "=", "ge": ">=", "le": "<="}


def _predicate_id(conds: tuple[tuple[str, str, Any], ...]) -> str:
    return "&".join(f"{f}{_OP_SYMBOL[op]}{v}" for f, op, v in conds)


def _single(feature: str, op: str, value: Any) -> CandidatePredicate:
    conds = ((feature, op, value),)
    human_op = {"eq": "is", "ge": ">=", "le": "<="}[op]
    return CandidatePredicate(
        id=_predicate_id(conds),
        assertion=f"posts where {feature} {human_op} {value!r}",
        feature_predicate={"all": [{"feature": feature, "op": op, "value": value}]},
    )


def _combine(a: CandidatePredicate, b: CandidatePredicate) -> CandidatePredicate:
    conds = tuple(a.feature_predicate["all"]) + tuple(b.feature_predicate["all"])
    id_conds = tuple((c["feature"], c["op"], c["value"]) for c in conds)
    return CandidatePredicate(
        id=_predicate_id(id_conds),
        assertion=f"{a.assertion} AND {b.assertion}",
        feature_predicate={"all": list(conds)},
    )


def propose_predicates(
    union: Iterable[ProposalPost],
    *,
    combine_pairs: bool = True,
) -> list[CandidatePredicate]:
    """Propose candidate predicates from the union of both corpora.

    Deterministic: the same union yields the same candidate list in a stable order. Every post's
    ``source`` (exemplar or internal) contributes equally to *what to try* — the union is the whole
    point of the proposal stage.
    """
    posts = list(union)

    categorical_values: dict[str, set[Any]] = {}
    numeric_values: dict[str, list[float]] = {}
    for post in posts:
        for feature, value in post.features.items():
            if _is_numeric(value):
                numeric_values.setdefault(feature, []).append(float(value))
            else:
                categorical_values.setdefault(feature, set()).add(value)

    singles: list[CandidatePredicate] = []
    for feature in sorted(categorical_values):
        for value in sorted(categorical_values[feature], key=repr):
            singles.append(_single(feature, "eq", value))
    for feature in sorted(numeric_values):
        band = median(numeric_values[feature])
        singles.append(_single(feature, "ge", band))

    candidates = list(singles)
    if combine_pairs:
        for i in range(len(singles)):
            for j in range(i + 1, len(singles)):
                # Do not combine two conditions on the same feature (e.g. face is True AND face is
                # False) — that is never satisfiable and wastes a comparison budget.
                fa = singles[i].feature_predicate["all"][0]["feature"]
                fb = singles[j].feature_predicate["all"][0]["feature"]
                if fa == fb:
                    continue
                candidates.append(_combine(singles[i], singles[j]))

    return candidates
