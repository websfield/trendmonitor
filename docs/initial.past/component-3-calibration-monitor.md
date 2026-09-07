# Component 3 — Calibration Monitor (the referee)

**Status:** specification of an existing invariant set. This document introduces no new rule; it collects what [ADR-0005](adr/0005-three-components-and-the-referee.md), [integration-contract.md](integration-contract.md) (Contracts C and D), and [`schemas/events-v1.json`](schemas/events-v1.json) already fix, so that C3's configuration — window length, threshold, cohort keying, held-out split method — has a home and stops being the most likely thing to drift undocumented. Where this doc and an ADR or a contract disagree, the ADR or the contract wins and this doc is the bug.

**Related:** ADR-0005 (why the referee is a peer, not a subsystem) · [eval-and-calibration-plan.md](eval-and-calibration-plan.md) (the held-out design and the tests that can fail) · Contracts C and D in [integration-contract.md](integration-contract.md).

---

## 3.0 What C3 is, and what it may never become

C3 consumes scores from C2 and outcomes from C2, and computes whether the beliefs earned their use. **It produces nothing a user sees.** It holds exactly two write authorities, and neither of the other components may hold either:

1. **Sole authority over the breaker flag** per cohort key (Contract C). Neither C1 nor C2 can set, clear, or override it. C2 reads it and obeys it.
2. **Veto authority over library promotion** (Contract D). C1 may cut a candidate library at any time; it may not promote to `active` without a `LibraryVerdict` from C3.

C3 calls nothing. It consumes the append-only event log and a calibration statistic, and it writes one flag and one verdict. Its write path is not reachable from C1 or C2, and the flag it writes cannot be overridden by them at read time. *An authority overridable from the component it governs is a comment.*

**The compliance gate depends on none of this.** C3 can be entirely dark and C2 still runs the vetoes, scores, and issues verdicts — VPS simply goes advisory. Nothing in the critical path of a creator submission depends on C3 being up.

---

## 3.1 The cohort key

Everything C3 computes is per **cohort key**:

```
(tenant_id, vertical, platform, rubric_version, pattern_library_version)
```

The key is the point. A breaker state is a claim about how well *this specific scorer configuration* predicts outcomes in *this specific cohort*. Swap the library and the claim no longer applies — which is why library promotion resets the window (§3.5), and why promotion is expensive. Tenancy is part of the key: **tenant outcome data never crosses tenants**, and there is no pooled cross-tenant calibration.

---

## 3.2 The calibration statistic — `(n, rho, suspected_leak)`

The statistic is computed on the **held-out set** for a cohort. This is the cross-plane contract tuple, and it is all C3 needs from the intelligence plane:

- **`n`** — the count of held-out **(scored, measured)** submissions in the cohort, **after excluding**: `anomalous` scores (a clamped out-of-range model score is stored but never calibrated on), `EXCLUDED_FROM_AI_SCORING` (V6) submissions (a minor never entered AI scoring, so it never enters calibration), and `Origin.Fixture` outcomes (a fixture-seeded outcome is structurally distinguishable and never contributes to a real calibration number or a client surface).
- **`rho`** — the rolling **Spearman rank correlation** between predicted VPS and the actual 7-day engagement percentile, on the held-out set. **`rho` is `null` whenever `n < 60`.** There is no rho for a cohort that has not accumulated enough held-out evidence, and no code path returns one. A threshold on a rho that does not exist is a guess with a decimal point.
- **`suspected_leak`** — `true` when `rho > 0.5` out-of-sample on `n ≥ 60`. This is a **warning, never a win**: an out-of-sample rank correlation above 0.5 at this data volume is more likely a leak between the held-out split and the training slice than a genuinely excellent scorer. **It does not trip the breaker**; it flags the cohort for a human to check the split.

**Spearman, not Pearson.** The prediction is ordinal and the outcome is heavy-tailed; what matters is whether the scorer rank-orders, not whether it hits an absolute number.

**The held-out split is temporal, never random.** A scorer is evaluated on submissions from a later period than any it could have been tuned on. A random split leaks the future into the training slice and inflates rho — exactly the failure `suspected_leak` exists to catch. The temporal holdout is specified in the [eval plan](eval-and-calibration-plan.md); C3 consumes its output and never re-splits.

**The Python plane computes the statistic; C3 owns the decision.** The rank correlation, the temporal holdout, and the dataset exclusions are intelligence-plane work (`scipy`/`statsmodels`). C3 receives `(n, rho, suspected_leak)` through a read-only seam and turns it into a `BreakerState`. C3 never computes rho itself, and the seam is abstracted the same way C2's judge is: a deterministic interface with an offline default, real cross-plane integration wired in a later phase.

---

## 3.3 The window and the thresholds

| Parameter | Value (v1, provisional) | Notes |
|---|---|---|
| Held-out floor `n_min` | **60** | Below this the cohort is `cold`; there is no rho. |
| Arm/keep-armed threshold | **rho ≥ 0.35** | On `n ≥ 60`. Below it trips. From REQ-052 / ADR-0005. |
| Suspected-leak threshold | **rho > 0.5** | On `n ≥ 60`. A warning, not a trip. |
| Split method | **temporal holdout** | Never a random split. |
| Statistic | **rolling Spearman** | Predicted VPS vs 7-day percentile. |

These are **provisional until calibrated** and they are **version-controlled C3 configuration**, reviewed like code. Every breaker state transition records the config version that produced it, because a referee whose thresholds drift silently is a referee with no referee. ADR-0005 is explicit that C3 cannot audit its own auditor; naming the limitation is the honest response, and versioning the config is the partial mitigation.

---

## 3.4 Contract C — the breaker state

C3 writes; **C2 reads and has no write path.** Transport is a read-through cache with a **60-second TTL**.

| State | Condition | C2 behaviour |
|---|---|---|
| `armed` | rolling rho ≥ 0.35 on n ≥ 60 held out, **and a human has armed it** (§3.4.1) | VPS surfaced with a confidence band; weight 0.15 in AWS |
| `tripped` | rolling rho below threshold on n ≥ 60 | VPS computed and stored, **not shown**; weight 0 in AWS, redistributed to measured terms |
| `cold` | n < 60, **or** no library, **or** compatibility-triple mismatch, **or** eligible-but-not-yet-armed, **or** the fail-closed default | same as `tripped`; **the reason differs and is surfaced** |
| `shadow` | champion/challenger evaluation in progress | C2 scores twice; champion surfaces; both stored |

`breaker_state_at_score` **travels with the score** on `SubmissionScored`. It is recorded at score time, never reconstructed from flag history — reconstructing "was this score live or advisory?" from a flag's timeline is a source of quiet error.

### 3.4.1 Automatic to trip, manual to arm

This asymmetry is the same shape as every safety interlock worth having, and it is the same shape as mechanism demotion/promotion in ADR-0006.

- **Trip is automatic.** The moment C3 observes rho below 0.35 on n ≥ 60 for an armed cohort, it trips — instantly, with no human involvement, on the rolling computation. An automatic trip **revokes the arm**: a later recovery of rho does **not** silently re-arm the cohort.
- **Arm is manual, with a recorded reason.** Moving a cohort to `armed` — the state in which its VPS is surfaced to a client — requires a human to look at why it is eligible and record a reason. `ArmAsync` requires a real human id **and** a non-empty recorded reason; an arm with no reason is rejected. The recorded reason *is* the interlock.

A cohort that meets the calibration precondition (rho ≥ 0.35 on n ≥ 60) but has **not been armed by a human** is `cold`, with a reason that says so — not `armed`. The Contract C row states the *precondition* for arming; the *act* of arming is the human step. Reading the two together, the fail-closed default until a person signs off is `cold`, and VPS stays advisory. This is consistent with the Contract C rule "Manual, with a recorded reason, to arm" in `events-v1.json`; it introduces no new constraint.

### 3.4.2 Fail closed

If C3 is unreachable, **or** the cached reading is older than the 60-second TTL, C2 treats the cohort as `cold`. It does **not** treat an unreachable referee as permission, and it does **not** serve a stale last-known-`armed` reading as if it were current. Scoring continues, compliance continues, VPS goes advisory. There is no configuration in C2 that overrides a breaker, no admin flag, and no per-campaign exemption.

---

## 3.5 Contract D — the library verdict

C1 requests; **C3 issues.** C1 cannot promote a candidate library without a verdict, and cannot set `active_version` on a timer, under commercial pressure, or by config.

```
C1: cut candidate beauty.tiktok.v8
C1 → C3: RequestShadow(candidate=v8, incumbent=v7, cohort=beauty×tiktok)
C3: breaker → shadow
C2: reads shadow, scores every submission twice (v7 surfaces, v8 stored)
    … 6–12 weeks, until n ≥ 60 outcomes accumulate against BOTH …
C3: computes Spearman(v7) and Spearman(v8) on the SAME held-out submissions
C3 → C1: LibraryVerdict { promote | reject | extend_shadow }
C1: on promote, publishes v8 and repoints active_version
C3: resets the calibration window; breaker → cold until n rebuilds
```

**Paired, on the same posts.** The challenger must beat the incumbent on the *same* held-out submissions, not on a different window or cohort. The paired comparison controls for the quarter being easy or hard, which an unpaired comparison across time does not. C3 promotes only when the challenger's rho exceeds the incumbent's by a clear margin on a sufficient sample; it rejects only when the challenger clearly trails; otherwise it extends the shadow.

**`extend_shadow` is the common verdict, and that is fine.** Most mining runs surface refinements, not discoveries; the cost of extending is the doubled model spend and nothing else. A `reject` is recorded against the candidate and its mining run.

**Promotion resets the window.** A promoted library changes `pattern_library_version`, so the cohort key changes; the new cohort starts `cold` and rebuilds n from zero, and any prior arm on that key is cleared. A rolling correlation computed across a library swap is averaging two different scorers and calling it one number. This is the constraint that makes **publication cadence bounded below by calibration accumulation (~quarterly), not by mining cadence (nightly)** — the non-obvious consequence ADR-0005 draws out.

---

## 3.6 The API surface

`GET /api/calibration/{vertical}/{platform}` returns the cohort's breaker `state`, its `reason`, `n`, `rho`, and `suspected_leak`. A cohort with `n < 60` returns `cold`, a reason, and **no rho**. A cohort whose data is `Origin.Fixture` **never reaches this surface** — the handler refuses it, the same fixture-origin discipline that keeps synthetic calibration data off every client surface. This endpoint is a direct read of breaker state; there is no second place a client-facing calibration decision is made (REQ-038 client behaviour is a read of this state, not a second decision).

---

## 3.7 What C3 never does

- It never surfaces a number to a client. It has no client-facing score of its own.
- It never calls C1 or C2. It consumes the event log and the calibration statistic.
- It never lets C1 or C2 write, clear, or override the breaker.
- It never promotes a library on a timer or by config, and never across an unpaired comparison.
- It never computes rho on a random split, never on `n < 60`, and never on `anomalous`, V6-excluded, or `Origin.Fixture` data.
- It never auto-re-arms a tripped cohort. A human arms, with a reason.
