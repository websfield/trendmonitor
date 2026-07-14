"""Phase 6 — C1 Pattern Miner + Library Publisher tests (A1-A12 + edge paths).

The single most important invariant under test: **proposal runs over the union of both corpora;
estimation runs over the internal corpus only.** ``test_estimator_provenance`` is the permanent
regression test on that architecture. Test names carry the plan's identifiers. No live DB, no
network: corpora are dataclasses and stores are in-memory (the Phase 0/2/4/7 convention).
"""

from __future__ import annotations

import ast
import dataclasses
import inspect
import pathlib
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from c1_pattern_engine.corpora.repository import PatternRepository
from c1_pattern_engine.miner import (
    ARM_WEIGHT,
    EffectSize,
    InternalPost,
    Pattern,
    ProposalPost,
    estimate_predicate,
    estimate_with_arm,
    evidence_status,
    is_corpus_stale,
    propose_predicates,
    select_survivors,
)
from c1_pattern_engine.miner.estimate import estimate_effect_size
from c1_pattern_engine.miner.model import CandidatePredicate
from c1_pattern_engine.publishers.pattern_library import (
    PatternLibraryPublisher,
    PublicationRefused,
)
from substrate.provenance import (
    MeasuredOutcome,
    Provenance,
    Provenanced,
    ProvenanceLaunderingError,
)

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)
TENANT_A = uuid4()
TENANT_B = uuid4()

_SRC = pathlib.Path(__file__).resolve().parents[2] / "src" / "IntelligencePlane"


# --- helpers -------------------------------------------------------------------------------


def measured(v: float) -> Provenanced[float]:
    return Provenanced(v, Provenance.MEASURED, NOW)


def proxy(v: float) -> Provenanced[float]:
    return Provenanced(v, Provenance.PROXY, NOW)


def internal_post(
    *,
    features: dict,
    outcome: Provenanced[float],
    arm: str | None = "explore",
    tenant_id=TENANT_A,
    vertical: str = "beauty",
    platform: str = "tiktok",
    period: str = "p1",
) -> InternalPost:
    return InternalPost(
        submission_id=uuid4(),
        tenant_id=tenant_id,
        vertical=vertical,
        platform=platform,
        features=features,
        outcome=outcome,
        arm=arm,  # type: ignore[arg-type]
        period=period,
    )


def face_predicate() -> CandidatePredicate:
    return CandidatePredicate(
        id="face_present=True",
        assertion="posts with a face in the first frame",
        feature_predicate={"all": [{"feature": "face_present", "op": "eq", "value": True}]},
    )


def make_pattern(
    *,
    tenant_id=TENANT_A,
    vertical: str = "beauty",
    platform: str = "tiktok",
    evidence_status_value: str = "active",
    valid_to: date = date(2027, 1, 1),
    is_upper_bound: bool = False,
) -> Pattern:
    return Pattern(
        id=uuid4(),
        tenant_id=tenant_id,
        vertical=vertical,
        platform=platform,
        assertion="face in first frame lifts 24h engagement",
        feature_predicate={"all": [{"feature": "face_present", "op": "eq", "value": True}]},
        effect_size=8.0,
        effect_ci=(3.0, 13.0),
        sample_size=45,
        evidence_arm="explore",
        evidence_status=evidence_status_value,  # type: ignore[arg-type]
        valid_from=date(2026, 1, 1),
        valid_to=valid_to,
        is_upper_bound=is_upper_bound,
    )


def _imports_of(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    mods: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            mods.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            mods.add(node.module or "")
    return mods


def _imported_names(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            names.update(a.name for a in node.names)
    return names


# --- A1: the estimator's input set contains NO exemplar-sourced outcome ----------------------


def test_estimator_provenance() -> None:
    """The permanent regression test on the architecture (P6-T9).

    (a) Behavioural: a corpus where matching posts include exemplar-sourced Proxy outcomes — the
    estimator admits only the measured ones, so its input set contains no exemplar outcome.
    (b) Structural: ``estimate.py`` reads neither the proposal stage nor any exemplar corpus, so a
    union-reading line added there is caught here.
    """
    pred = face_predicate()
    corpus = [
        internal_post(features={"face_present": True}, outcome=measured(70.0)) for _ in range(40)
    ]
    # Five exemplar-sourced (Proxy) outcomes that satisfy the predicate but must never be counted.
    corpus += [
        internal_post(features={"face_present": True}, outcome=proxy(999.0)) for _ in range(5)
    ]
    effect = estimate_predicate(pred, corpus)
    assert effect.n == 40  # the 5 Proxy outcomes were excluded, not pooled

    # (b) estimate.py imports no proposal/exemplar/union source module...
    est_path = _SRC / "c1_pattern_engine" / "miner" / "estimate.py"
    est_mods = _imports_of(est_path)
    assert not any(
        "propose" in m or "exemplar" in m or "synthesiser" in m for m in est_mods
    ), f"estimate.py must not read the proposal/union side: {est_mods}"
    # ...and imports no proposal-post name (the docstring may mention it; an *import* would not).
    assert "ProposalPost" not in _imported_names(est_path)


# --- A2: MeasuredOutcome.try_from(Proxy) is None; estimator cannot take a Proxy --------------


def test_measuredoutcome_barrier() -> None:
    assert MeasuredOutcome.try_from(proxy(5.0)) is None
    assert MeasuredOutcome.try_from(Provenanced(5.0, Provenance.ESTIMATED, NOW)) is None
    assert MeasuredOutcome.try_from(measured(5.0)) is not None

    # Direct construction from a Proxy value is a type error (the front door is guarded too).
    with pytest.raises(ProvenanceLaunderingError):
        MeasuredOutcome(5.0, Provenance.PROXY, NOW)

    # The estimator admits only MeasuredOutcomes; a Proxy simply cannot be built into one, so a
    # corpus of Proxy outcomes yields an empty (absent) estimate — never a laundered number.
    only_proxy = [internal_post(features={"face_present": True}, outcome=proxy(80.0))]
    assert estimate_predicate(face_predicate(), only_proxy).n == 0


# --- A3: proposal reads the union; estimation reads the internal corpus only -----------------


def test_proposal_union_estimation_internal() -> None:
    # The exemplar side carries an opening_line value the internal side never has.
    union = [
        ProposalPost(
            features={"face_present": True, "opening_line": "question"}, source="exemplar"
        ),
        ProposalPost(
            features={"face_present": True, "opening_line": "statement"}, source="internal"
        ),
    ]
    candidates = propose_predicates(union, combine_pairs=False)
    ids = {c.id for c in candidates}
    # Proposal read the exemplar: the exemplar-only value produced a candidate.
    assert "opening_line=question" in ids

    # Estimation reads the internal corpus only: that exemplar-only predicate, estimated over an
    # internal corpus that has no such post, sees zero matches — the exemplar never reached it.
    exemplar_only = next(c for c in candidates if c.id == "opening_line=question")
    internal_corpus = [
        internal_post(features={"opening_line": "statement"}, outcome=measured(50.0))
        for _ in range(10)
    ]
    assert estimate_predicate(exemplar_only, internal_corpus).n == 0


# --- A4: Benjamini-Hochberg across the FULL candidate set ------------------------------------


def test_bh_full_candidate_set() -> None:
    # 100 candidates: 10 strong, 40 marginal (raw-significant), 50 null. Uncorrected p<0.05 = 50;
    # BH across all 100 accepts far fewer.
    candidates = [f"cand-{i}" for i in range(100)]
    p_values = [0.001] * 10 + [0.04] * 40 + [0.9] * 50
    result = select_survivors(candidates, p_values)

    assert result.n_candidates == 100
    assert result.n_uncorrected == 50  # raw p < 0.05
    # The whole point of correcting across the FULL set: the survivor count is not the raw count.
    assert result.n_survivors != result.n_uncorrected
    assert result.n_survivors < result.n_uncorrected

    # Pairing is enforced over the full set — a filtered subset cannot be smuggled in.
    with pytest.raises(ValueError, match="paired"):
        select_survivors(candidates[:10], p_values)


# --- A5: explore and exploit weighted equally (REQ-053) -------------------------------------


def test_arm_equal_weight() -> None:
    assert ARM_WEIGHT["explore"] == ARM_WEIGHT["exploit"] == 1.0

    pred = face_predicate()
    # Identical outcome distributions on each arm — an estimate on explore equals one on exploit,
    # and a pooled estimate counts every outcome once (equal weight, no arm multiplier).
    explore = [
        internal_post(features={"face_present": True}, outcome=measured(60.0), arm="explore")
        for _ in range(30)
    ]
    exploit = [
        internal_post(features={"face_present": True}, outcome=measured(60.0), arm="exploit")
        for _ in range(30)
    ]
    e_explore = estimate_predicate(pred, explore, arm="explore")
    e_exploit = estimate_predicate(pred, exploit, arm="exploit")
    assert e_explore.lift == e_exploit.lift  # same treatment
    pooled = estimate_predicate(pred, explore + exploit)
    assert pooled.n == 60  # both arms counted, each outcome weighted once


# --- A6: exploit-arm effect sizes are upper bounds pending replication -----------------------


def test_exploit_arm_upper_bound() -> None:
    pred = face_predicate()

    # Sufficient explore arm (>= 30 matching) => estimate on explore, NOT an upper bound.
    explore_heavy = [
        internal_post(features={"face_present": True}, outcome=measured(70.0), arm="explore")
        for _ in range(35)
    ]
    armed = estimate_with_arm(pred, explore_heavy)
    assert armed.evidence_arm == "explore"
    assert armed.is_upper_bound is False

    # Thin explore, thick exploit => fall back to exploit and mark it an upper bound.
    mixed = [
        internal_post(features={"face_present": True}, outcome=measured(70.0), arm="explore")
        for _ in range(5)
    ] + [
        internal_post(features={"face_present": True}, outcome=measured(90.0), arm="exploit")
        for _ in range(40)
    ]
    armed2 = estimate_with_arm(pred, mixed)
    assert armed2.evidence_arm == "exploit"
    assert armed2.is_upper_bound is True


# --- A7: evidence floor => insufficient_evidence, never retrieved ----------------------------


def test_evidence_floor() -> None:
    ci_excl = EffectSize(lift=8.0, ci=(3.0, 13.0), n=45, p_value=0.001)
    ci_incl = EffectSize(lift=1.0, ci=(-2.0, 4.0), n=45, p_value=0.4)

    # sample_size < 30 => insufficient even with a clean CI.
    assert (
        evidence_status(sample_size=29, effect=ci_excl, valid_to=date(2027, 1, 1), as_of=NOW.date())
        == "insufficient_evidence"
    )
    # CI includes zero => insufficient even with a large n.
    assert (
        evidence_status(sample_size=45, effect=ci_incl, valid_to=date(2027, 1, 1), as_of=NOW.date())
        == "insufficient_evidence"
    )
    # Floor met and CI excludes zero => active.
    assert (
        evidence_status(sample_size=45, effect=ci_excl, valid_to=date(2027, 1, 1), as_of=NOW.date())
        == "active"
    )

    # Never retrieved: an insufficient_evidence pattern is stored but not returned for scoring.
    repo = PatternRepository()
    weak = make_pattern(evidence_status_value="insufficient_evidence")
    repo.add(weak)
    got = repo.retrieve(tenant_id=TENANT_A, vertical="beauty", platform="tiktok", as_of=NOW.date())
    assert weak not in got
    # ...but retained in the artefact for auditability.
    assert weak in repo.all_for_audit(tenant_id=TENANT_A, vertical="beauty", platform="tiktok")


# --- A8: past valid_to => stale, excluded from retrieval, retained in artefact ---------------


def test_stale_excluded_retained() -> None:
    valid_to = date(2026, 6, 1)
    after = date(2026, 7, 1)
    # The status function marks it stale once as_of passes valid_to.
    effect = EffectSize(lift=8.0, ci=(3.0, 13.0), n=45, p_value=0.001)
    assert evidence_status(sample_size=45, effect=effect, valid_to=valid_to, as_of=after) == "stale"

    repo = PatternRepository()
    # Stored 'active' but its window has since closed.
    expired = make_pattern(evidence_status_value="active", valid_to=valid_to)
    repo.add(expired)
    got = repo.retrieve(tenant_id=TENANT_A, vertical="beauty", platform="tiktok", as_of=after)
    assert expired not in got  # excluded from retrieval past valid_to
    assert expired in repo.all_for_audit(
        tenant_id=TENANT_A, vertical="beauty", platform="tiktok"
    )  # retained


# --- A9: C1 cannot publish without C3's promote ---------------------------------------------


def test_publish_requires_verdict() -> None:
    pub = PatternLibraryPublisher()
    patterns = (make_pattern(),)
    candidate = pub.cut_candidate(
        tenant_id=TENANT_A, vertical="beauty", platform="tiktok", patterns=patterns, created_at=NOW
    )

    for verdict in (None, "reject", "extend_shadow"):
        with pytest.raises(PublicationRefused):
            pub.publish(candidate, verdict)  # type: ignore[arg-type]
    # Nothing published: active_version is still empty.
    assert pub.active_version(tenant_id=TENANT_A, vertical="beauty", platform="tiktok") is None

    published = pub.publish(candidate, "promote")
    active = pub.active_version(tenant_id=TENANT_A, vertical="beauty", platform="tiktok")
    assert active is not None and active.version_id == published.version_id


# --- A10: published versions immutable; a superseded version still resolves ------------------


def test_immutability_and_rollback() -> None:
    pub = PatternLibraryPublisher()
    v1 = pub.cut_candidate(
        tenant_id=TENANT_A,
        vertical="beauty",
        platform="tiktok",
        patterns=(make_pattern(),),
        created_at=NOW,
    )
    pub.publish(v1, "promote")
    v2 = pub.cut_candidate(
        tenant_id=TENANT_A,
        vertical="beauty",
        platform="tiktok",
        patterns=(make_pattern(), make_pattern()),
        created_at=NOW + timedelta(days=1),
    )
    pub.publish(v2, "promote")

    active = pub.active_version(tenant_id=TENANT_A, vertical="beauty", platform="tiktok")
    assert active is not None and active.version_id == v2.version_id
    # The superseded version still resolves by id (immutable, never deleted).
    assert pub.resolve(v1.version_id).version_id == v1.version_id

    # Immutable: a published artefact cannot be mutated.
    with pytest.raises(dataclasses.FrozenInstanceError):
        v1.version_id = "tampered"  # type: ignore[misc]

    # Rollback is a repoint, not an edit: v1 becomes active again, v2 stays resolvable.
    pub.rollback(
        tenant_id=TENANT_A, vertical="beauty", platform="tiktok", to_version_id=v1.version_id
    )
    rolled = pub.active_version(tenant_id=TENANT_A, vertical="beauty", platform="tiktok")
    assert rolled is not None and rolled.version_id == v1.version_id
    assert pub.resolve(v2.version_id).version_id == v2.version_id


# --- A11: cross-tenant retrieval impossible; no widening override exists ---------------------


def test_cross_tenant_unreachable() -> None:
    repo = PatternRepository()
    a_pattern = make_pattern(tenant_id=TENANT_A)
    repo.add(a_pattern)

    today = NOW.date()
    # Tenant B cannot see Tenant A's pattern.
    b_view = repo.retrieve(tenant_id=TENANT_B, vertical="beauty", platform="tiktok", as_of=today)
    assert b_view == []
    # Tenant A can.
    a_view = repo.retrieve(tenant_id=TENANT_A, vertical="beauty", platform="tiktok", as_of=today)
    assert a_pattern in a_view

    # No widening override parameter exists on the retrieval surface.
    params = set(inspect.signature(repo.retrieve).parameters)
    assert "tenant_id" in params
    forbidden = {"all_tenants", "cross_tenant", "tenant_override", "include_all", "widen", "scope"}
    assert not (params & forbidden)


# --- A12: no trend signal value enters VPS at any weight (Python-side guard) -----------------


def test_trend_never_enters_vps() -> None:
    """Python-side guard for REQ (trend never enters VPS).

    A trend signal may be *proposed* as a predicate, but it never enters an effect size and there is
    no VPS in the Python plane for it to reach. The C# VPS->C1 barrier is enforced structurally by
    Phase-1 ``ReferenceGraphTests`` (different processes, one-way call graph) and re-asserted there.
    Here we assert the miner reads no ``TrendSignal`` into an estimate.
    """
    # A trend-derived feature is a legitimate proposal predicate...
    union = [ProposalPost(features={"trend_aligned": True}, source="internal")]
    assert any(c.id == "trend_aligned=True" for c in propose_predicates(union, combine_pairs=False))

    # ...but no estimation/effect-size module imports the trend package or a TrendSignal.
    for module in ("estimate.py", "pattern.py", "arm.py", "replicate.py", "multiplicity.py"):
        mods = _imports_of(_SRC / "c1_pattern_engine" / "miner" / module)
        assert not any("detector" in m or "adapters" in m for m in mods), module
        text = (_SRC / "c1_pattern_engine" / "miner" / module).read_text(encoding="utf-8")
        assert "TrendSignal" not in text, module


# --- Edge / failure paths (named as the plan does) ------------------------------------------


def test_Publish_WithoutVerdict_Refused() -> None:
    pub = PatternLibraryPublisher()
    candidate = pub.cut_candidate(
        tenant_id=TENANT_A,
        vertical="beauty",
        platform="tiktok",
        patterns=(make_pattern(),),
        created_at=NOW,
    )
    # C3 unreachable is modelled as verdict=None: no publication, candidate stays a candidate.
    with pytest.raises(PublicationRefused):
        pub.publish(candidate, None)
    assert pub.active_version(tenant_id=TENANT_A, vertical="beauty", platform="tiktok") is None


def test_Estimator_RejectsExemplarSourcedOutcome() -> None:
    # An exemplar post's engagement is Proxy; it cannot be constructed into a MeasuredOutcome.
    exemplar_engagement = proxy(1234.0)
    assert MeasuredOutcome.try_from(exemplar_engagement) is None
    # And a corpus of only such outcomes yields an absent estimate, never a laundered number.
    corpus = [internal_post(features={"face_present": True}, outcome=exemplar_engagement)]
    assert estimate_predicate(face_predicate(), corpus).n == 0


def test_Pattern_PastValidTo_IsStale_NotRetrieved() -> None:
    repo = PatternRepository()
    expired = make_pattern(evidence_status_value="active", valid_to=date(2026, 1, 10))
    repo.add(expired)
    got = repo.retrieve(
        tenant_id=TENANT_A, vertical="beauty", platform="tiktok", as_of=date(2026, 2, 1)
    )
    assert expired not in got


def test_Pattern_CrossTenant_Unreachable() -> None:
    repo = PatternRepository()
    repo.add(make_pattern(tenant_id=TENANT_A))
    assert (
        repo.retrieve(tenant_id=TENANT_B, vertical="beauty", platform="tiktok", as_of=NOW.date())
        == []
    )


def test_Miner_StaleCorpus_Alarms_NoImputation() -> None:
    # Alarm past 30 days...
    assert is_corpus_stale(NOW - timedelta(days=31), NOW) is True
    assert is_corpus_stale(NOW - timedelta(days=10), NOW) is False

    # ...and no imputation: a matching post whose outcome is not measured is excluded, never filled.
    corpus = [
        internal_post(features={"face_present": True}, outcome=measured(70.0)) for _ in range(10)
    ] + [internal_post(features={"face_present": True}, outcome=proxy(70.0)) for _ in range(3)]
    effect = estimate_predicate(face_predicate(), corpus)
    assert effect.n == 10  # the 3 non-measured outcomes were excluded, not imputed


def test_estimate_effect_size_only_takes_measured_outcomes() -> None:
    # The signature barrier, exercised directly: admit measured outcomes and estimate a lift.
    outcomes = [MeasuredOutcome.try_from(measured(70.0)) for _ in range(30)]
    outcomes = [o for o in outcomes if o is not None]
    effect = estimate_effect_size(outcomes, cohort_median=50.0)
    assert effect.n == 30
    assert effect.lift == pytest.approx(20.0)
