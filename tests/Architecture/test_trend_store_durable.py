"""Phase 4 — the durable state root: persistence, restart idempotency, tenancy, resolved samples.

Locks: the shared store contract on both the in-memory store and a persist→load roundtrip (R1),
restart idempotency incl. the shifted-start_day case (R2), origin-scoped public-only resolved
samples gated per-pool (R3), append/compensate immutability (R4), fail-closed corruption (R5),
and registry/ledger rehydration — the amnesia fix (R6).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from c1_pattern_engine.detector import (
    ResolvedSampleBook,
    StateCorrupted,
    StateRoot,
    TrendSignal,
    TrendSignalStore,
    days_remaining,
    run_scan,
)
from c1_pattern_engine.registry import AdmissionOrigin, TermRegistry, TrackedTerm

# Deliberately a PAST date: if the implementation ever drifted to wall-clock now(), the
# logical-day-start assertion below would catch it instead of coincidentally passing.
AS_OF = datetime(2026, 3, 2, tzinfo=UTC)


def make_signal(*, scope="public", tenant_id=None, stage="rising", archived_at=None):
    return TrendSignal(
        id=uuid4(),
        scope=scope,
        tenant_id=tenant_id,
        platform="reddit",
        vertical="beauty",
        kind="topic",
        lifecycle_stage=stage,
        confidence="single_source",
        valid_to=AS_OF.date() + timedelta(days=21),
        archived_at=archived_at,
    )


def make_term(text="glass skin", *, kind="topic", origin=AdmissionOrigin.SCHEDULED_SCAN):
    return TrackedTerm(
        term=text,
        vertical="beauty",
        platform="tiktok",
        origin=origin,
        admitted_at=AS_OF,
        last_activity_at=AS_OF,
        kind=kind,
    )


def fake_fetch(tail: list[float] | None = None):
    """Alternating 9/11 baseline (nonzero MAD) with an optional spike tail — mirrors the Phase 3
    spine-test fake (kept local: test modules aren't importable as a package)."""

    def fetch(_term, span):
        days = list(span.days())
        vols = {d: (9.0 if i % 2 == 0 else 11.0) for i, d in enumerate(days)}
        if tail:
            for j, v in enumerate(tail):
                vols[days[len(days) - len(tail) + j]] = v
        return vols

    return fetch


def roundtrip(state: StateRoot, tmp_path) -> StateRoot:
    """Persist and load in a 'new process' (all-new objects)."""
    state.persist()
    return StateRoot.load(tmp_path)


def fresh_state(tmp_path) -> StateRoot:
    return StateRoot.load(tmp_path)


# --- R1: shared store contract, in-memory and through a persistence roundtrip -------------------


@pytest.mark.parametrize("durable", [False, True])
def test_store_contract_holds_through_roundtrip(durable, tmp_path):
    state = fresh_state(tmp_path)
    sig = make_signal()
    state.signals.add(sig, observed_at=AS_OF.date())

    store = roundtrip(state, tmp_path).signals if durable else state.signals
    assert store.get(sig.id) == sig
    assert store.feed() == [sig]
    assert store.query() == [sig]

    archived = store.archive_due(AS_OF + timedelta(days=30))
    assert archived == [sig.id]
    assert store.feed() == []
    assert store.get(sig.id).is_archived  # archived stays queryable (REQ-005h)


def test_repository_layer_tenancy_no_unfiltered_read_path(tmp_path):
    tenant_a, tenant_b = uuid4(), uuid4()
    state = fresh_state(tmp_path)
    public = make_signal()
    internal_a = make_signal(scope="internal", tenant_id=tenant_a)
    state.signals.add(public, observed_at=AS_OF.date())
    state.signals.add(internal_a, observed_at=AS_OF.date())

    store = roundtrip(state, tmp_path).signals  # tenancy survives persistence too
    assert store.feed() == [s for s in store.feed() if s.scope == "public"]
    assert internal_a.id not in {s.id for s in store.feed()}  # no-tenant read → public only
    assert internal_a.id in {s.id for s in store.feed(for_tenant=tenant_a)}
    assert internal_a.id not in {s.id for s in store.feed(for_tenant=tenant_b)}
    assert internal_a.id not in {s.id for s in store.query(for_tenant=tenant_b)}


# --- R2: restart idempotency + identity index --------------------------------------------------


def _scan(state: StateRoot, *, as_of=AS_OF):
    return run_scan(
        terms=[make_term()],
        fetchers={"reddit": fake_fetch([30.0, 30.0])},
        as_of=as_of,
        store=state.signals,
        identity_index=state.identity,
        samples=state.samples,
    )


def test_restart_idempotency_including_shifted_start_day(tmp_path):
    state = fresh_state(tmp_path)
    first = _scan(state)

    reloaded = roundtrip(state, tmp_path)  # process restart
    same_night = _scan(reloaded, as_of=AS_OF)
    assert same_night.stored_signal_ids == first.stored_signal_ids

    reloaded2 = roundtrip(reloaded, tmp_path)  # another restart; source revises its window
    next_night = _scan(reloaded2, as_of=AS_OF + timedelta(days=1))
    assert next_night.stored_signal_ids == first.stored_signal_ids  # persisted first_seen wins
    assert len(reloaded2.signals.feed()) == 1


def test_first_detected_at_is_the_logical_day_start_and_immutable(tmp_path):
    state = fresh_state(tmp_path)
    first = _scan(state)
    _, rec = state.identity.by_signal_id(first.stored_signal_ids[0])
    assert rec.first_detected_at == datetime(2026, 3, 2, 0, 0, tzinfo=UTC)

    reloaded = roundtrip(state, tmp_path)
    _scan(reloaded, as_of=AS_OF + timedelta(days=1))  # re-detection must not move the anchor
    _, rec2 = reloaded.identity.by_signal_id(first.stored_signal_ids[0])
    assert rec2.first_detected_at == rec.first_detected_at


# --- R3: resolved samples — origin-scoped, public-only, per-pool gated --------------------------


def test_days_remaining_gated_per_origin_pool():
    book = ResolvedSampleBook()
    for i in range(20):
        assert book.record(
            uuid4(), platform="reddit", origin="automated", scope="public", duration_days=10 + i % 3
        )
    assert days_remaining("rising", book.samples("reddit", "automated")).is_numeric
    # The human pool is NOT unlocked by automated samples — origins never pool.
    assert not days_remaining("rising", book.samples("reddit", "human")).is_numeric
    # Below the gate: band-only.
    assert not days_remaining("rising", book.samples("open_web", "automated")).is_numeric


def test_internal_scope_durations_never_enter_the_shared_pool():
    book = ResolvedSampleBook()
    assert not book.record(
        uuid4(), platform="reddit", origin="automated", scope="internal", duration_days=12
    )
    assert book.samples("reddit", "automated") == []


def test_one_sample_per_signal_ever():
    book = ResolvedSampleBook()
    sid = uuid4()
    assert book.record(sid, platform="reddit", origin="automated", scope="public", duration_days=9)
    assert not book.record(
        sid, platform="reddit", origin="automated", scope="public", duration_days=9
    )
    assert len(book.samples("reddit", "automated")) == 1


def test_scan_captures_resolution_at_archive(tmp_path):
    state = fresh_state(tmp_path)
    _scan(state)  # detect (rising, valid_to +21d)
    reloaded = roundtrip(state, tmp_path)
    run_scan(  # 30 days later: no candidate, the old signal archives → one automated sample
        terms=[make_term()],
        fetchers={"reddit": fake_fetch()},
        as_of=AS_OF + timedelta(days=30),
        store=reloaded.signals,
        identity_index=reloaded.identity,
        samples=reloaded.samples,
    )
    samples = reloaded.samples.samples("reddit", "automated")
    assert len(samples) == 1
    # Pinned basis: archive-closed duration = the signal's own valid_to - first_seen — NEVER
    # tonight's scan_day (which would be ~31d here and inflate with any outage).
    sid = reloaded.signals.query()[0].id
    _, rec = reloaded.identity.by_signal_id(sid)
    expected = (reloaded.signals.get(sid).valid_to - rec.first_seen).days
    assert samples[0] == expected
    # The [.., 30, 30] tail decelerates the EMA into "peak" (horizon 7d) + first_seen one day
    # before as_of ⇒ 8. A regression to scan_day-based closing would read ~31 here.
    assert samples[0] == 8


def test_resolved_samples_and_dedupe_survive_restart(tmp_path):
    """R3's point is accumulation ACROSS runs — persistence must carry data, not just shape."""
    state = fresh_state(tmp_path)
    sid = uuid4()
    assert state.samples.record(
        sid, platform="reddit", origin="automated", scope="public", duration_days=9
    )
    reloaded = roundtrip(state, tmp_path)
    assert reloaded.samples.samples("reddit", "automated") == [9.0]
    # Dedupe survives too: the same signal cannot resolve again after a restart.
    assert not reloaded.samples.record(
        sid, platform="reddit", origin="automated", scope="public", duration_days=9
    )
    assert reloaded.samples.samples("reddit", "automated") == [9.0]


def test_by_signal_id_is_episode_faithful_in_process_and_across_restart(tmp_path):
    """A superseded episode's id resolves to ITS OWN record — never the successor's, and not
    None after a restart (Phase 8 term resolution / Phase 9 anchoring)."""
    from c1_pattern_engine.detector import SignalIdentity

    state = fresh_state(tmp_path)
    ident = SignalIdentity(
        scope="public", tenant_id=None, platform="reddit", vertical="beauty", term="glass skin"
    )
    old_id, new_id = uuid4(), uuid4()
    state.identity.record(
        ident,
        first_seen=AS_OF.date() - timedelta(days=60),
        signal_id=old_id,
        first_detected_at=AS_OF - timedelta(days=60),
    )
    state.identity.record(  # resurgence: a new episode overwrites the identity's current record
        ident,
        first_seen=AS_OF.date(),
        signal_id=new_id,
        first_detected_at=AS_OF,
    )

    for index in (state.identity, roundtrip(state, tmp_path).identity):
        _, old_rec = index.by_signal_id(old_id)
        assert old_rec.first_seen == AS_OF.date() - timedelta(days=60)  # its own dates
        assert old_rec.first_detected_at == AS_OF - timedelta(days=60)
        _, new_rec = index.by_signal_id(new_id)
        assert new_rec.first_seen == AS_OF.date()
        assert index.get(ident).signal_id == new_id  # current record is the successor


def test_resurrection_collision_is_skipped_not_resurrected(tmp_path):
    """Recomputed start_day landing exactly on a dead episode's first_seen mints the archived
    id — the scan must skip it (fewer signals), never resurrect archived history."""
    state = fresh_state(tmp_path)
    first = _scan(state)  # detect at AS_OF (first_seen = AS_OF-1, valid_to +21d)
    archived_id = first.stored_signal_ids[0]
    state.signals.archive_due(AS_OF + timedelta(days=30))
    assert state.signals.get(archived_id).is_archived

    # Same as_of again → candidate.start_day == the archived episode's first_seen → id collision.
    again = _scan(state, as_of=AS_OF)
    assert again.stored_signal_ids == ()
    assert state.signals.get(archived_id).is_archived  # untouched


def test_serializer_round_trips_every_dataclass_field(tmp_path):
    """Drift guard: a field added to any persisted dataclass must not silently skip persistence."""
    from dataclasses import fields

    from c1_pattern_engine.detector import IdentityRecord, SignalIdentity
    from c1_pattern_engine.detector.store_durable import _signal_to_dict, _term_to_dict

    sig_keys = set(_signal_to_dict(make_signal()))
    assert sig_keys == {f.name for f in fields(TrendSignal)}
    term_keys = set(_term_to_dict(make_term()))
    assert term_keys == {f.name for f in fields(TrackedTerm)}

    # Identity rows are serialized inline; the row keys must cover every field of both classes.
    state = fresh_state(tmp_path)
    state.identity.record(
        SignalIdentity(
            scope="public", tenant_id=None, platform="reddit", vertical="beauty", term="x"
        ),
        first_seen=AS_OF.date(),
        signal_id=uuid4(),
        first_detected_at=AS_OF,
    )
    row = state._serialize()["identity"][0]
    expected = {f.name for f in fields(SignalIdentity)} | {f.name for f in fields(IdentityRecord)}
    assert set(row) == expected


def test_naive_as_of_is_refused(tmp_path):
    state = fresh_state(tmp_path)
    with pytest.raises(ValueError, match="timezone-aware"):
        _scan(state, as_of=datetime(2026, 3, 2))  # no tzinfo


def test_valid_json_non_object_state_is_corrupt(tmp_path):
    fresh_state(tmp_path).persist()
    (tmp_path / "trend-monitor-state.json").write_text("[1, 2, 3]", encoding="utf-8")
    with pytest.raises(StateCorrupted):
        StateRoot.load(tmp_path)


# --- R4: immutability --------------------------------------------------------------------------


def test_archived_signal_is_never_overwritten():
    from dataclasses import replace

    store = TrendSignalStore()
    sig = make_signal(stage="archived", archived_at=AS_OF)
    store._signals[sig.id] = sig  # seed archived history directly
    resurrected = replace(sig, lifecycle_stage="rising", archived_at=None)
    with pytest.raises(ValueError, match="new episode"):
        store.add(resurrected, observed_at=AS_OF.date())
    with pytest.raises(ValueError, match="new episode"):  # refresh() mirrors the add() guard
        store.refresh(sig.id, observed_at=AS_OF.date(), extend_valid_to=AS_OF.date())


# --- R5: fail closed on corruption --------------------------------------------------------------


def test_corrupt_state_file_raises_never_starts_empty(tmp_path):
    state = fresh_state(tmp_path)
    state.signals.add(make_signal(), observed_at=AS_OF.date())
    state.persist()
    (tmp_path / "trend-monitor-state.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(StateCorrupted):
        StateRoot.load(tmp_path)


def test_absent_state_file_is_a_legitimate_first_run(tmp_path):
    state = StateRoot.load(tmp_path / "never-written")
    assert state.signals.feed() == []
    assert isinstance(state.registry, TermRegistry)


# --- R6: registry + ledger durability (the amnesia fix) -----------------------------------------


def test_term_admission_survives_restart(tmp_path):
    state = fresh_state(tmp_path)
    state.registry.admit(
        make_term("corner mic", kind="sound", origin=AdmissionOrigin.HUMAN_SUBMISSION)
    )
    reloaded = roundtrip(state, tmp_path)
    active = {t.term: t for t in reloaded.registry.active()}
    assert "corner mic" in active
    assert active["corner mic"].kind == "sound"
    assert active["corner mic"].origin is AdmissionOrigin.HUMAN_SUBMISSION


def test_ledger_records_survive_restart(tmp_path):
    state = fresh_state(tmp_path)
    state.ledger.record("go", trend_survived=True)
    state.ledger.record("go", trend_survived=False)
    reloaded = roundtrip(state, tmp_path)
    assert reloaded.ledger.go_count == 2
    assert reloaded.ledger.misses == 1
    assert reloaded.ledger.go_accuracy() == 0.5
