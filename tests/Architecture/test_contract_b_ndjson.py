"""R2 (#2) — Contract B wire-format round-trip: C# serializer -> real C1 assembler.

The one Contract-B serializer, ``AppendOnlyEventLog.ToReplayExportNdjson`` (C#), must emit NDJSON
the intelligence plane can read: ``snake_case`` keys and a **string** ``event_type`` whose value
stays PascalCase (``"PostPublished"``, the token ``internal.py`` matches on). This test proves it
against the **real** assembler, not a stub:

* the fixture ``fixtures/contract_b_replay_export.ndjson`` is captured verbatim from the C#
  ``JsonSerializer`` (see the phase-R2 fixture generator), never hand-typed to match — a hand-built
  fixture would only prove Python agrees with itself;
* the fixture is fed through the real :func:`c1_pattern_engine.corpora.replay` and the real
  :class:`c1_pattern_engine.corpora.OutcomeEvent` dataclass — the narrowest real parse+fold entry
  point C1 actually uses.

Falsification: revert the C# fix (bare ``JsonSerializer.Serialize(e)`` -> PascalCase keys, integer
``event_type``) and regenerate the fixture, and ``replay`` folds **zero** records — every assertion
below goes red. That is the intended failure signal, not a silent skip.
"""

from __future__ import annotations

import json
import pathlib
from datetime import datetime
from uuid import UUID

from c1_pattern_engine.corpora import OutcomeEvent, replay

_FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "contract_b_replay_export.ndjson"

# The submission history the C# fixture encodes (one submission through its full lifecycle).
_TENANT = UUID("44444444-4444-4444-4444-444444444444")
_SUBMISSION = UUID("11111111-1111-1111-1111-111111111111")
_FEATURE = UUID("22222222-2222-2222-2222-222222222222")
_LIVE_POST = UUID("33333333-3333-3333-3333-333333333333")


def _load_csharp_ndjson() -> list[OutcomeEvent]:
    """Parse the C#-serialized NDJSON into the *real* assembler's ``OutcomeEvent`` dataclass.

    This is the only mapping step; it reads the envelope by its snake_case keys exactly as the
    Python consumer must. It reimplements nothing about the fold — ``replay`` does that.
    """
    events: list[OutcomeEvent] = []
    for line in _FIXTURE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        env = json.loads(line)
        events.append(
            OutcomeEvent(
                event_id=UUID(env["event_id"]),
                event_type=env["event_type"],  # a string; PascalCase token replay matches on
                idempotency_key=env["idempotency_key"],
                tenant_id=UUID(env["tenant_id"]),
                occurred_at=datetime.fromisoformat(env["occurred_at"]),
                recorded_at=datetime.fromisoformat(env["recorded_at"]),
                payload=env["payload"],
            )
        )
    return events


def test_fixture_is_csharp_wire_format_not_hand_typed() -> None:
    """Guard the fixture origin: snake_case keys, string event_type, no PascalCase keys."""
    raw = _FIXTURE.read_text(encoding="utf-8")
    assert '"event_type":"SubmissionScored"' in raw  # string value, PascalCase token
    assert '"feature_record_id":' in raw  # snake_case envelope->payload key
    assert '"breaker_state_at_score":' in raw
    # The exact drift #2 was about: PascalCase keys / integer enum must NOT be present.
    assert '"EventType"' not in raw
    assert '"event_type":0' not in raw
    assert '"event_type":1' not in raw


def test_replay_assembles_csharp_ndjson_via_the_real_assembler() -> None:
    events = _load_csharp_ndjson()

    records = replay(events)  # the real fold — raises MissingArmError on broken arm propagation

    # A correct wire format means the fold finds the submission and reads every field. A regressed
    # serializer (PascalCase keys or numeric event_type) yields an empty dict here instead.
    assert list(records.keys()) == [_SUBMISSION]
    rec = records[_SUBMISSION]

    # SubmissionScored fields, read by their snake_case keys.
    assert rec.tenant_id == _TENANT
    assert rec.feature_record_id == _FEATURE
    assert rec.vps == 0.72
    assert rec.bas == 0.61
    assert rec.breaker_state_at_score == "live"
    assert rec.version_triple == {
        "extractor_version": "x.3",
        "library_version": "beauty.tiktok.v7",
        "rubric_version": "1.0.0",
    }

    # VerdictIssued.
    assert rec.verdict == "APPROVED"
    assert rec.human_approved_at == "2026-07-01T00:02:00Z"

    # PostPublished + AmplificationAllocated: arm propagation is the discipline internal.py guards.
    assert rec.live_post_id == _LIVE_POST
    assert rec.arm == "explore"

    # PerformanceSnapshot folded, with the allocation's arm and the true as_of preserved.
    assert len(rec.snapshots) == 1
    snap = rec.snapshots[0]
    assert snap.live_post_id == _LIVE_POST
    assert snap.engagement_rate == 0.051
    assert snap.arm == "explore"
    assert snap.as_of == "2026-07-02T00:00:00Z"
