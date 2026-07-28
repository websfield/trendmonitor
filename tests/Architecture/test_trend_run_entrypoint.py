"""Phase 5 — the runnable entrypoint (`python -m c1_pattern_engine.detector.run`).

Locks: one-invocation-one-run via the CLI (R1/R2), CLI-level idempotency (R3), fail-closed run
semantics incl. no-partial-commit (R4), non-secret config + pinned default coverage (R5), and
injectable `as_of` (R6). Persisted-admission survival across re-seed is the amnesia fix's
acceptance (R1).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from c1_pattern_engine.detector import StateRoot
from c1_pattern_engine.detector.run import load_tracked_terms, main, run_once
from c1_pattern_engine.registry import AdmissionOrigin, TrackedTerm

AS_OF = "2026-03-02T00:00:00+00:00"
AS_OF_DT = datetime(2026, 3, 2, tzinfo=UTC)


def write_seeds(tmp_path, rows: str) -> str:
    p = tmp_path / "tracked-terms.yaml"
    p.write_text(f"terms:\n{rows}", encoding="utf-8")
    return str(p)


SEEDS = '  - { term: "glass skin", vertical: beauty, platform: tiktok, kind: topic }\n'


def cli(tmp_path, *extra: str, seeds: str = SEEDS) -> int:
    return main(
        [
            "--state-root",
            str(tmp_path / "state"),
            "--as-of",
            AS_OF,
            "--terms",
            write_seeds(tmp_path, seeds),
            *extra,
        ]
    )


# --- R1/R2: one CLI invocation = one complete scan ----------------------------------------------


def test_cli_invocation_completes_and_writes_signals(tmp_path, capsys):
    assert cli(tmp_path) == 0
    out = capsys.readouterr().out
    assert "signals stored/refreshed: " in out
    assert "coverage gaps (stated, not implied)" in out
    state = StateRoot.load(tmp_path / "state")
    assert len(state.signals.feed()) >= 1  # the fake fetchers produce a detectable spike


# --- R3: CLI-level idempotency ------------------------------------------------------------------


def test_cli_same_as_of_twice_leaves_store_unchanged(tmp_path):
    state_file = tmp_path / "state" / "trend-monitor-state.json"
    assert cli(tmp_path) == 0
    first = state_file.read_text(encoding="utf-8")
    assert cli(tmp_path) == 0
    # Byte-identical, not merely same-id-set: registry, samples, and signal fields all included.
    assert state_file.read_text(encoding="utf-8") == first


# --- R1: persisted admissions survive the seed file ----------------------------------------------


def test_persisted_admission_survives_restart_and_reseed(tmp_path):
    root = tmp_path / "state"
    state = StateRoot.load(root)
    state.registry.admit(
        TrackedTerm(
            term="corner mic",
            vertical="beauty",
            platform="tiktok",
            origin=AdmissionOrigin.HUMAN_SUBMISSION,
            admitted_at=AS_OF_DT,
            last_activity_at=AS_OF_DT,
            kind="sound",
        )
    )
    state.persist()

    assert cli(tmp_path) == 0  # seed file does NOT contain "corner mic"
    active = {t.term: t for t in StateRoot.load(root).registry.active()}
    assert "corner mic" in active  # survived the restart + re-seed
    assert active["corner mic"].origin is AdmissionOrigin.HUMAN_SUBMISSION  # never clobbered
    assert active["corner mic"].kind == "sound"
    assert "glass skin" in active  # and the seed landed too

    # The sharper clobber attempt: a seed row with the SAME key but a different origin/kind.
    hostile = '  - { term: "corner mic", vertical: beauty, platform: tiktok, kind: topic }\n'
    assert cli(tmp_path, seeds=SEEDS + hostile) == 0
    active = {t.term: t for t in StateRoot.load(root).registry.active()}
    assert active["corner mic"].origin is AdmissionOrigin.HUMAN_SUBMISSION
    assert active["corner mic"].kind == "sound"  # the seed file cannot relabel an admission


# --- R4: fail-closed ------------------------------------------------------------------------------


def test_dark_source_degrades_with_stated_gap_and_consistent_store(tmp_path):
    def dark(_term, _span):
        raise RuntimeError("transport exploded")

    result = run_once(
        state_root=tmp_path / "state",
        as_of=AS_OF_DT,
        terms_file=write_seeds(tmp_path, SEEDS),
        fetchers={"reddit": dark},
    )
    assert result.dark_sources == ("reddit",)
    assert result.stored_signal_ids == ()
    state = StateRoot.load(tmp_path / "state")  # store persisted and loadable — consistent
    assert state.signals.feed() == []
    assert {c.platform for c in result.coverage if c.coverage_gap} >= {"reddit", "tiktok"}


def test_mid_run_failure_leaves_prior_state_intact(tmp_path, monkeypatch):
    root = tmp_path / "state"
    assert cli(tmp_path) == 0  # night 1 persisted
    before = (root / "trend-monitor-state.json").read_text(encoding="utf-8")

    def boom(self):
        raise OSError("disk full")

    monkeypatch.setattr(StateRoot, "persist", boom)
    with pytest.raises(OSError):
        run_once(
            state_root=root,
            as_of=datetime(2026, 3, 3, tzinfo=UTC),
            terms_file=write_seeds(tmp_path, SEEDS),
        )
    after = (root / "trend-monitor-state.json").read_text(encoding="utf-8")
    assert after == before  # nothing on disk changed before the failed persist
    StateRoot.load(root)  # and it still loads


# --- R5: config is non-secret file/env; default coverage stays pinned ---------------------------


def test_default_run_states_blind_platforms(tmp_path):
    result = run_once(
        state_root=tmp_path / "state", as_of=AS_OF_DT, terms_file=write_seeds(tmp_path, SEEDS)
    )
    gaps = {c.platform for c in result.coverage if c.coverage_gap}
    assert {"tiktok", "instagram_reels"} <= gaps


def test_absent_seed_file_means_registry_only(tmp_path):
    result = run_once(
        state_root=tmp_path / "state",
        as_of=AS_OF_DT,
        terms_file=tmp_path / "does-not-exist.yaml",
    )
    assert result.stored_signal_ids == ()  # empty registry → no terms → no signals, no crash


def test_seed_kind_defaults_to_topic(tmp_path):
    seeds = write_seeds(tmp_path, '  - { term: "x", vertical: beauty, platform: tiktok }\n')
    terms = load_tracked_terms(seeds, as_of=AS_OF_DT)
    assert terms[0].kind == "topic"


# --- R6: as_of is injectable ---------------------------------------------------------------------


def test_as_of_injectable_and_naive_iso_assumed_utc(tmp_path):
    root = str(tmp_path / "state")
    seeds = write_seeds(tmp_path, SEEDS)
    assert main(["--state-root", root, "--as-of", "2026-03-02", "--terms", seeds]) == 0
    state = StateRoot.load(root)
    sid = state.signals.query()[0].id
    _, rec = state.identity.by_signal_id(sid)
    assert rec.first_detected_at == datetime(2026, 3, 2, 0, 0, tzinfo=UTC)
