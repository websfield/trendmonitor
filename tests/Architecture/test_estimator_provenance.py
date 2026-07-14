"""P6-T9 — the estimator-provenance regression suite (the permanent architectural guard).

*"A test asserting that the estimator's input set contains no exemplar-sourced outcome is a
permanent regression test on the architecture, in the same class as the prompt-injection suite."*

Two independent guards, either of which fails if the barrier is breached:

* **Behavioural — the type boundary.** An exemplar post's engagement is ``Proxy``, and
  ``MeasuredOutcome.try_from(Proxy)`` is ``None`` (direct construction is guarded too). Since
  ``estimate_effect_size`` accepts ``Iterable[MeasuredOutcome]``, an exemplar-sourced outcome
  cannot reach it at all; ``estimate_predicate`` *excludes* — never imputes — every non-measured
  outcome, so its input set contains no exemplar-sourced value.
* **Structural — the import closure.** ``estimate.py`` never *reaches* the proposal/exemplar path,
  even transitively. A union-reading line added anywhere on its first-party import closure is
  caught here — this is stronger than a direct-import check, which a one-hop indirection escapes.

The transitive scanner carries its own falsifiability. A canary self-check proves it flags a module
reaching the proposal stage (sensitivity); a clean-module self-check proves it does not
false-positive (specificity). The live proof is a union-reading import temporarily added to
``estimate.py`` (red), reverted (green).
"""

from __future__ import annotations

import ast
import pathlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from c1_pattern_engine.miner.estimate import estimate_predicate
from c1_pattern_engine.miner.model import CandidatePredicate, InternalPost
from substrate.provenance import (
    MeasuredOutcome,
    Provenance,
    Provenanced,
    ProvenanceLaunderingError,
)

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
_SRC = pathlib.Path(__file__).resolve().parents[2] / "src" / "IntelligencePlane"
_ESTIMATE = _SRC / "c1_pattern_engine" / "miner" / "estimate.py"

# A module on the estimator's import closure whose name carries one of these tokens is the
# proposal/union/exemplar side, which estimation must never read.
_FORBIDDEN_TOKENS = ("propose", "exemplar", "synthesiser")
_FIRST_PARTY_ROOTS = ("c1_pattern_engine", "substrate", "extraction")


# --- fixtures -----------------------------------------------------------------------------------


def _measured(v: float) -> Provenanced[float]:
    return Provenanced(v, Provenance.MEASURED, NOW)


def _proxy(v: float) -> Provenanced[float]:
    return Provenanced(v, Provenance.PROXY, NOW)


def _internal_post(features: dict, outcome: Provenanced[float]) -> InternalPost:
    return InternalPost(
        submission_id=uuid4(),
        tenant_id=uuid4(),
        vertical="beauty",
        platform="tiktok",
        features=features,
        outcome=outcome,
        arm="explore",
    )


def _face_predicate() -> CandidatePredicate:
    return CandidatePredicate(
        id="face_present=True",
        assertion="posts with a face in the first frame",
        feature_predicate={"all": [{"feature": "face_present", "op": "eq", "value": True}]},
    )


# --- A1 behavioural: the type boundary keeps every Proxy value out of the estimate --------------


def test_proxy_outcome_is_rejected_at_the_type_boundary() -> None:
    assert MeasuredOutcome.try_from(_proxy(999.0)) is None
    assert MeasuredOutcome.try_from(Provenanced(999.0, Provenance.ESTIMATED, NOW)) is None
    # A @dataclass generates a public __init__; direct construction is guarded too, so a Proxy
    # value cannot slip past try_from through the front door.
    with pytest.raises(ProvenanceLaunderingError):
        MeasuredOutcome(999.0, Provenance.PROXY, NOW)


def test_estimator_input_set_contains_no_exemplar_sourced_outcome() -> None:
    """A1 headline: the estimate over measured+Proxy equals the estimate over measured alone.
    The nine Proxy outcomes were excluded, not pooled — no exemplar value in the input set."""
    pred = _face_predicate()

    # A cohort with more non-matching baseline than matching, so the cohort median sits below the
    # matching arm and the lift is real (not a vacuous zero).
    baseline = [_internal_post({"face_present": False}, _measured(40.0)) for _ in range(40)]
    matching_measured = [_internal_post({"face_present": True}, _measured(70.0)) for _ in range(30)]
    matching_proxy = [_internal_post({"face_present": True}, _proxy(999.0)) for _ in range(9)]

    with_proxy = estimate_predicate(pred, baseline + matching_measured + matching_proxy)
    without_proxy = estimate_predicate(pred, baseline + matching_measured)

    assert with_proxy.n == 30                       # only the measured matches entered
    assert with_proxy == without_proxy              # the nine Proxy 999.0s changed nothing at all
    assert with_proxy.lift > 0.0                    # ...and the test is not vacuous — a real lift


def test_admit_drops_proxy_and_estimated_keeps_measured() -> None:
    mixed = [
        _measured(1.0),
        _proxy(2.0),
        Provenanced(3.0, Provenance.ESTIMATED, NOW),
        Provenanced(4.0, Provenance.USER_PROVIDED, NOW),
    ]
    admitted = MeasuredOutcome.admit(mixed)

    assert [m.value for m in admitted] == [1.0, 4.0]
    assert all(
        m.provenance in (Provenance.MEASURED, Provenance.USER_PROVIDED) for m in admitted
    )


# --- A1 structural: estimate.py never reaches the proposal/exemplar path (even transitively) ----


def _referenced_modules(path: pathlib.Path) -> tuple[set[str], set[str]]:
    """(referenced module strings, imported names) for one source file.

    ``from pkg.sub import name`` contributes both ``pkg.sub`` and ``pkg.sub.name`` so a submodule
    imported by name (``from c1_pattern_engine.miner import propose``) is not missed.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    refs: set[str] = set()
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            refs.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if base:
                refs.add(base)
            for a in node.names:
                names.add(a.name)
                if base:
                    refs.add(f"{base}.{a.name}")
    return refs, names


def _module_to_path(module: str) -> pathlib.Path | None:
    rel = pathlib.Path(*module.split("."))
    as_file = _SRC / rel.with_suffix(".py")
    if as_file.is_file():
        return as_file
    as_pkg = _SRC / rel / "__init__.py"
    return as_pkg if as_pkg.is_file() else None


def _transitive_first_party_refs(start: pathlib.Path) -> set[str]:
    reached: set[str] = set()
    seen_paths: set[pathlib.Path] = {start}
    stack = [start]
    while stack:
        refs, _ = _referenced_modules(stack.pop())
        for ref in refs:
            if ref.split(".")[0] not in _FIRST_PARTY_ROOTS:
                continue
            reached.add(ref)
            child = _module_to_path(ref)
            if child is not None and child not in seen_paths:
                seen_paths.add(child)
                stack.append(child)
    return reached


def test_estimator_directly_imports_no_proposal_or_exemplar_module() -> None:
    refs, names = _referenced_modules(_ESTIMATE)
    assert not any(tok in r for r in refs for tok in _FORBIDDEN_TOKENS), refs
    assert "ProposalPost" not in names   # the estimator reads InternalPost, never a ProposalPost


def test_estimator_never_reaches_proposal_or_exemplar_transitively() -> None:
    reached = _transitive_first_party_refs(_ESTIMATE)
    offenders = sorted(r for r in reached if any(tok in r for tok in _FORBIDDEN_TOKENS))
    assert offenders == [], (
        f"estimate.py reaches the proposal/union/exemplar side of the corpus: {offenders}. "
        "Estimation reads the internal corpus only (ADR-0001)."
    )


def test_transitive_scanner_detects_a_forbidden_reach(tmp_path: pathlib.Path) -> None:
    """Sensitivity self-check: the scanner flags a module that reaches the proposal stage. Without
    this, a scanner that silently stopped resolving imports would pass the guard above vacuously."""
    canary = tmp_path / "canary_reaches_propose.py"
    canary.write_text("from c1_pattern_engine.miner import propose\n", encoding="utf-8")

    reached = _transitive_first_party_refs(canary)
    assert any(tok in r for r in reached for tok in _FORBIDDEN_TOKENS)


def test_transitive_scanner_ignores_a_clean_module(tmp_path: pathlib.Path) -> None:
    """Specificity self-check: a module that reads only the measured barrier is not flagged."""
    clean = tmp_path / "clean.py"
    clean.write_text("from substrate.provenance import MeasuredOutcome\n", encoding="utf-8")

    reached = _transitive_first_party_refs(clean)
    assert not any(tok in r for r in reached for tok in _FORBIDDEN_TOKENS)
