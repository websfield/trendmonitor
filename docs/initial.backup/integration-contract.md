# Integration Contract

**How Components 1, 2, and 3 talk to each other.**
**Decided by:** [ADR-0005](adr/0005-three-components-and-the-referee.md)
**Companions:** [component-1-pattern-engine.md](component-1-pattern-engine.md) · [component-2-scoring-amplification.md](component-2-scoring-amplification.md)
**Schemas:** [schemas/events-v1.json](schemas/events-v1.json)

---

## The shape of it

Two components do visible work. A third referees. They share exactly four contracts and one piece of infrastructure, and nothing else.

```
                    ┌──────────────────────────────┐
                    │   Extraction Service         │
                    │   stateless · versioned      │
                    │   owned by neither           │
                    └────┬────────────────────┬────┘
                         │                    │
              FeatureRecord              FeatureRecord
                         │                    │
   ┌─────────────────────▼──┐       ┌─────────▼────────────────────┐
   │  C1  Pattern Engine    │       │  C2  Scoring & Amplification │
   │  produces beliefs      │       │  acts on beliefs             │
   └──┬──────────────▲──────┘       └──┬────────────────▲──────────┘
      │              │                 │                │
      │ (A) publish  │ (B) consume     │ (B) emit       │ (C) read
      │ PatternLib   │ OutcomeEvents   │ OutcomeEvents  │ BreakerState
      │ Version      │                 │                │
      │              └─────────────────┤                │
      │                                │                │
      │                                ▼                │
      │              ┌──────────────────────────────────┴──┐
      │              │  C3  Calibration Monitor            │
      └──(D)─────────┤  referees · sole breaker authority  │
      LibraryVerdict │  sole promotion veto                │
                     └─────────────────────────────────────┘
```

**C2 never calls C1.** It resolves a pinned, immutable library version and reads it from an artefact store. There is no code path from a submission scoring request into the Pattern Engine.

**C1 never calls C2.** It consumes an append-only event log. It has no read access to ClientHub's operational tables.

**C3 calls nothing.** It consumes the same event log and writes one flag and one verdict.

The latency between C1 and C2 is measured in weeks, and that is a design property rather than a limitation. A system where a score depends on a pattern mined from scores is a system with feedback inside a request, and it will be unstable, irreproducible, and impossible to evaluate.

---

## Contract A: PatternLibraryVersion (C1 → C2)

**Direction:** C1 publishes. C2 reads. One way.
**Transport:** Immutable artefact in blob storage, content-addressed. A pointer table holds `active_version` per `(tenant_id, vertical, platform)`.
**Cadence:** Roughly quarterly. Bounded below by calibration accumulation, not by mining cadence. See [ADR-0005](adr/0005-three-components-and-the-referee.md).

```json
{
  "library_version": "beauty.tiktok.v7",
  "tenant_id": "…",
  "vertical": "beauty",
  "platform": "tiktok",
  "cut_at": "2026-06-30T00:00:00Z",
  "published_at": "2026-07-08T00:00:00Z",
  "promoted_by_verdict": "cv_9f3a…",
  "compatible_extractor_versions": ["3.2.x"],
  "compatible_rubric_versions": ["1.0.x"],
  "supersedes": "beauty.tiktok.v6",
  "patterns": [
    {
      "id": "…",
      "assertion": "first-person problem-statement hook delivered to camera within 1.5s",
      "feature_predicate": { "…": "machine-evaluable over FeatureRecord" },
      "effect_size": 1.41,
      "effect_ci": [1.12, 1.79],
      "sample_size": 63,
      "evidence_arm": "explore",
      "evidence_status": "active",
      "valid_from": "2026-04-01",
      "valid_to": "2026-10-01"
    }
  ],
  "exemplar_index_uri": "…",
  "sha256": "…"
}
```

### Rules

**Immutability.** A published version is never modified. A pattern retired in v8 still resolves in v7, because a score produced under v7 pins v7 and its evidence must remain reconstructible. Rollback is repointing `active_version`, not editing an artefact.

**Pinning.** C2 resolves `active_version` once, at score time, and writes it into the score record. Every stored score therefore names the exact library, rubric, and extractor version that produced it. Re-running the score tomorrow against the same triple yields the same number. This is what makes the compliance obligation in REQ-004 satisfiable and the eval plan's held-out split meaningful.

**The compatibility triple.** `extractor_version × rubric_version × library_version` must be mutually compatible, and C2 enforces this at read time rather than documenting it. A library mined over extractor v3.2 features cannot score a `FeatureRecord` produced by extractor v4.0. On mismatch, C2 fails to `cold` for that cohort - unanchored scoring, advisory-only VPS - and alerts. It does not silently score against incompatible patterns.

**Evidence status is load-bearing.** Only `evidence_status: active` patterns participate in retrieval. `insufficient_evidence` and `stale` patterns ship inside the artefact for auditability and are never retrieved. C2 does not decide which patterns are usable; it reads the decision C1 and C3 already made.

**Cold start.** When no library exists for a cohort, C2 scores unanchored with a maximum-width confidence band, the breaker sits at `cold`, VPS is advisory-only, and its weight in AWS redistributes. C2 does not block, does not error, and does not invent a library. A system that cannot operate before it has learned anything is a system that never starts.

---

## Contract B: OutcomeEvent stream (C2 → C1, C2 → C3)

**Direction:** C2 emits. C1 and C3 each consume independently.
**Transport:** Append-only log with idempotency keys. At-least-once delivery. Consumers are idempotent.
**Cadence:** Continuous.

This is the closed loop. Everything C1 learns about the real world, and everything C3 uses to referee, arrives here. C2 is the only writer.

| Event | Emitted when | Consumed by | Carries |
|---|---|---|---|
| `SubmissionScored` | Gate A scoring completes | C1, C3 | feature_record_id, vps + per-criterion, bas, pinned version triple, breaker_state_at_score, audio_degraded flags |
| `VerdictIssued` | Verdict engine resolves | C1, C3 | verdict, vetoes_fired[], deterministic inputs |
| `VerdictOverridden` | Manager overrides | C1, C3 | original, override, reason, reviewer_id |
| `PostPublished` | Live post detected/registered | C1, C3 | submission_id, live_post_id, published_at, platform |
| `PerformanceSnapshot` | T+24h, T+48h, T+7d collection | C1, C3 | er, denominator, provenance, as_of, organic vs boosted split |
| `AmplificationAllocated` | Budget allocator commits | C1, C3 | live_post_id, arm (exploit/explore), spend, aws, rationale |
| `AmplificationSignedOff` | Human sign-off | C3 | reviewer_id, modifications[] |
| `RightsGrantChanged` | Grant created, expired, revoked | C1 | grant_type, expires_at |

### Rules

**One writer.** C1 does not emit into this stream, and C3 does not either. If C1 needed to tell C2 something, the design is wrong; C1's only output is Contract A.

**`arm` is the most valuable field in the system.** Per [ADR-0003](adr/0003-exploration-budget.md), explore-arm outcomes are the only unconfounded evidence C1 will ever receive about content the exploit policy would not have chosen. `AmplificationAllocated.arm` propagates into every downstream `PerformanceSnapshot` for that post, and C1's miner conditions on it. An event stream that drops the arm tag reduces the entire exploration budget to money spent for nothing.

**`breaker_state_at_score` is recorded, not looked up later.** C3 needs to know whether VPS was live or advisory when a given score was produced, and reconstructing that from a flag's history is a source of quiet error. The state at the moment of scoring travels with the score.

**Media pointers do not outlive the rights window.** Per [compliance-notes.md](compliance-notes.md), events reference `feature_record_id`, never a raw media URI. When the rights window closes and the de-identification job strips frames and transcript from a `FeatureRecord`, the event log stays valid because it never held the media.

**Replay is a first-class operation.** C1 rebuilds its entire internal corpus by replaying the log. This is what makes an extractor version bump survivable: backfill the `FeatureRecord`s, replay the events against them, re-mine. Consumers therefore hold no state that cannot be reconstructed from the log plus the artefact store.

**At-least-once, not exactly-once.** Every event carries `idempotency_key = hash(event_type, entity_id, logical_timestamp)`. Duplicate delivery is normal and consumers deduplicate. A miner that double-counts an outcome inflates an effect size, and effect sizes are what the whole system rests on.

---

## Contract C: BreakerState (C3 → C2)

**Direction:** C3 writes. C2 reads. C2 has no write path.
**Transport:** Read-through cache over C3's store. TTL 60 seconds.
**Cohort key:** `(tenant_id, vertical, platform, rubric_version, pattern_library_version)`

That key is the point. A breaker state is a claim about how well *this specific scorer configuration* predicts outcomes in *this specific cohort*. Swap the library and the claim no longer applies, which is why library promotion resets the window and why promotion is expensive.

| State | Meaning | C2's behaviour |
|---|---|---|
| `armed` | Rolling Spearman ≥ 0.35 on n ≥ 60 held out | VPS surfaced with confidence band. Weight 0.15 in AWS. |
| `tripped` | Rolling Spearman fell below threshold | VPS computed and stored. Not shown to client. Weight 0 in AWS; redistributed to measured terms. |
| `cold` | n < 60, or no library, or compatibility mismatch | Same as `tripped`. Reason differs and is surfaced. |
| `shadow` | Cohort is running champion/challenger | C2 scores twice. Champion surfaces. Both stored. |

### Rules

**Automatic to trip, manual to arm.** C3 trips a breaker without human involvement, instantly, on the rolling computation. Moving a cohort from `tripped` back to `armed` requires a human to look at why it tripped and record a reason. The asymmetry is deliberate and it is the same shape as every safety interlock worth having.

**Fail closed.** If C3 is unreachable and the cache is stale beyond TTL, C2 treats the cohort as `cold`. It does not treat an unreachable referee as permission. Scoring continues, compliance continues, VPS goes advisory. Nothing in the critical path of a creator submission depends on C3 being up.

**C2 obeys, it does not interpret.** There is no configuration in C2 that overrides a breaker, no admin flag, and no per-campaign exemption. A breaker that can be switched off from the component it governs is a comment.

**Client-facing behaviour is derived, not decided.** REQ-038 says that where confidence is below threshold, the client artefact shows a ranking without numeric scores. That branch is a direct read of breaker state. There is no second place where the decision is made.

---

## Contract D: LibraryVerdict (C3 → C1)

**Direction:** C1 requests. C3 issues. C1 cannot proceed without it.
**Transport:** Request/response with a long-running shadow window in between, typically 6 to 12 weeks.

C1 may mine continuously and may cut a `candidate` library version at any time. It may not set `active_version`.

```
C1: cut candidate beauty.tiktok.v8
C1 → C3: RequestShadow(candidate=v8, incumbent=v7, cohort=beauty×tiktok)
C3: sets breaker state → shadow
C2: reads shadow state, scores every submission twice (v7 surfaces, v8 stored)
    … 6-12 weeks, until n ≥ 60 outcomes accumulate against BOTH ...
C3: computes Spearman(v7) and Spearman(v8) on the same held-out submissions
C3 → C1: LibraryVerdict { promote | reject | extend_shadow, evidence }
C1: on promote, publishes v8 and repoints active_version
C3: resets calibration window; breaker → cold until n rebuilds, then armed
```

### Rules

**The challenger must beat the incumbent on the same posts.** Not on a different window, not on a different cohort. Same held-out submissions, both scored, paired comparison. This controls for the quarter being an easy or hard one, which an unpaired comparison across time does not.

**`extend_shadow` is the common verdict, and that is fine.** Most candidate libraries will not clearly beat their incumbent, because most mining runs surface refinements rather than discoveries. A verdict of `extend_shadow` costs the doubled model spend and nothing else.

**A `reject` verdict is recorded against the candidate and its mining run.** A miner whose candidates are consistently rejected has a problem worth finding, and the rejection history is the only place that shows up.

**C1 cannot promote on a timer, under commercial pressure, or by config.** This is the second of C3's two authorities and it exists for the reason in ADR-0005: a component that can publish its way out of an unfavourable calibration reading will eventually do so.

---

## Sequence: Gate A, a submission

```
Creator ──▶ C2  POST /api/campaigns/{id}/submissions
             │
             ├─▶ ComplianceGate (sync, deterministic, C2-local, zero dependencies)
             │      └─ vetoes[] computed from stored records + brief. Result available now.
             │
             ├─▶ enqueue extraction
             │
   Extraction Service ──▶ FeatureRecord { extractor_version: 3.2.1, audio_present, … }
             │
             ├─▶ C3  GET breaker(tenant, beauty, tiktok, rubric 1.0.0, lib v7)  →  armed
             │        [ unreachable or stale → treat as cold, continue ]
             │
             ├─▶ artefact store  READ beauty.tiktok.v7   (pinned; no call to C1)
             │      └─ compatibility check: 3.2.1 ∈ compatible_extractor_versions ✓
             │
             ├─▶ retrieve top-k active patterns + nearest exemplars for cohort
             │
             ├─▶ build fenced prompt  ( <submission authority="untrusted"> … )
             │      └─ model → strict JSON → schema validation → clamp
             │           failure → NEEDS_REVIEW, never a default score
             │
             ├─▶ VerdictEngine (C#, deterministic)
             │      inputs: vetoes[], bas, vps + hook gate, breaker_state
             │      output: APPROVED | APPROVED_WITH_NOTES | REVISIONS_REQUIRED | REJECTED
             │
             ├─▶ RevisionNoteGenerator  (only if verdict ≠ APPROVED)
             │
             └─▶ emit  SubmissionScored, VerdictIssued
                        │                  │
                        ▼                  ▼
                       C1                 C3
                  (internal corpus)   (calibration)
```

Note what does not appear: any synchronous call into C1, and any point at which the model's output can clear a veto or assign a verdict.

---

## Sequence: Gate B, an amplification recommendation

```
Scheduler (T+24h) ──▶ C2 PerformanceCollector
             │
             ├─▶ platform connection | client export | provider   → snapshot
             │      └─ stamp provenance + as_of + declared denominator
             │           proxy-only → candidate is UNRANKABLE, reason surfaced
             │
             ├─▶ emit PerformanceSnapshot ─────────────▶ C1, C3
             │
             ├─▶ CreatorBaselineService
             │      trailing_posts_n ≥ 8 ?  → OutperformanceRatio
             │                    else      → insufficient_baseline, weight redistributes
             │
             ├─▶ C3  GET breaker(…)  →  tripped
             │        └─ VPS weight 0.15 → 0, redistributed to measured terms
             │
             ├─▶ AmplificationRanker → AWS per candidate
             │      hard gates first: paid rights, live disclosure, brand safety
             │      a gate failure EXCLUDES; it does not reduce a score
             │
             ├─▶ BudgetAllocator
             │      exploit (1-ε) proportional to (AWS - floor)
             │      explore (ε)   Thompson over ranks below cutoff
             │      every allocation tagged arm ∈ {exploit, explore}
             │
             ├─▶ Human sign-off (REQ-037). Nothing reaches a client before this.
             │
             └─▶ emit AmplificationAllocated{arm}, AmplificationSignedOff
                        │                                │
                        ▼                                ▼
                       C1                               C3
             (explore-arm = unconfounded evidence)   (audit trail)
```

---

## Sequence: a mining cycle

```
C1  replay OutcomeEvent log + exemplar corpus  →  labelled dataset
     │
     ├─ propose candidate feature predicates
     ├─ estimate effect sizes ON EXPLORE-ARM DATA where n permits
     │    exploit-arm estimates treated as upper bounds pending replication
     ├─ Benjamini-Hochberg across the full candidate set, not the survivors
     ├─ temporal replication: mined on period 1, confirmed on period 2
     ├─ back-test against prior quarter
     └─ cut candidate library v8   [ status: candidate — NOT published ]
                │
                ├─▶ C3  RequestShadow(v8, v7)
                │
                │   … C2 dual-scores for 6-12 weeks …
                │
                └─◀ C3  LibraryVerdict
                          promote        → C1 publishes, repoints active_version
                          extend_shadow  → keep dual-scoring
                          reject         → recorded against the mining run
```

---

## Failure semantics across the boundary

| Failure | Consequence | Behaviour |
|---|---|---|
| **C1 down** | No new libraries. No corpus updates. | C2 continues on the last pinned library, indefinitely. Scoring unaffected. Corpus staleness alarm after 30 days. |
| **C2 down** | No submissions scored, no events emitted. | C1's corpus goes stale. C3's windows stop advancing. Neither degrades incorrectly; both simply stop learning. Alarm. |
| **C3 down** | No breaker updates, no verdicts. | C2 fails closed to `cold` after cache TTL. VPS advisory everywhere. Compliance gate unaffected. C1 cannot promote, which is the safe direction. |
| **Extraction down** | No `FeatureRecord`s. | Submissions enter `NEEDS_REVIEW`. Compliance gate still runs on caption and metadata. Never auto-approve. |
| **Event log lag** | C1 and C3 see a stale world. | Both are batch consumers; lag of hours is invisible. Lag beyond 24h delays a `PerformanceSnapshot` past its T+24h semantics and the snapshot records its true `as_of`, not its intended one. |
| **Compatibility triple mismatch** | Library cannot score these features. | C2 fails to `cold` for the cohort. Alarm. Never scores against an incompatible library. |
| **Duplicate event delivery** | Effect-size inflation if unhandled. | Idempotency key dedupe at both consumers. This is the failure that silently corrupts the Pattern Library and it is the reason the key exists. |

The property worth naming: **nothing in the critical path of a creator submission depends on C1 or C3 being alive.** Compliance is deterministic and local. Scoring degrades to advisory. A creator uploads, gets a compliance result, and gets a verdict, with two of three components dark.

---

## What crosses the boundary, and what never does

**Crosses C1 → C2:** a pinned, immutable set of patterns and an exemplar index. Nothing else. Not trend signals, not submitter reputations, not mining diagnostics.

**Crosses C2 → C1:** outcome events. Never operational reads. C1 has no access to ClientHub's submission table, and building a read replica for its convenience is how the decoupling dies.

**Never crosses at all:**

- **Trend signals into VPS.** Per [ADR-0004](adr/0004-trend-detection-and-submission.md), a scorer with nightly-changing inputs cannot be evaluated on a temporally held-out split. Trends feed briefs. Patterns feed scores.
- **Tenant A's internal corpus into Tenant B's library.** `Pattern.tenant_id` is enforced at the repository layer with no widening override. Public exemplars are tenant-neutral and shared; internal outcome data is not, ever.
- **Untrusted creator text into any deterministic path.** Captions, transcripts, on-screen text, and trend submission rationales are fenced as data in model prompts and never reach a veto computation, a verdict, or a budget allocation.
- **A model's opinion into a veto.** C2's model may set `suspected_veto[]` for a human. It cannot clear one, and the veto computation does not read its output.
