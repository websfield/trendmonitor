# Stage 3 — Editorial intelligence (OUTLINE)

**Governing PRD phase:** Phase 1. **Depends on:** Stage 1, Stage 2.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` when Stages 1 and 2 are proven complete on disk.

---

## Objective

Make the editorial decisions good, and make "good" measurable — so that a producer accepts a first draft more often than not, and the system's account voice is the account's, not a generic one.

**Why it depends on Stage 1:** every criterion below is a *measurement*. Without the measurement system, this stage can only assert improvement. That dependency is the whole reason Stage 1 comes first.

**Why it depends on Stage 2:** first-pass choice rate and revision counts are observations of a human reviewing. Without the studio, the data comes from a CLI transcript and is not representative.

## Requirement bindings

REQ-032 (Hook Lab) · REQ-035 (versioned contextual rule engine) · REQ-036 (weak-footage refusal/narrowing) · REQ-061 (learned style, second half) · plus alternative moments, live model execution, semantic distinctness and anti-homogenisation.

## Exit gate (PASS/FAIL) — all from PRD §14.1

| # | Criterion |
|---|---|
| D1 | First-pass choice rate ≥ **50%** of jobs have ≥1 variant approved without structural regeneration |
| D2 | Median structural revision rounds ≤ **1** |
| D3 | Variant angle distinctness ≥ **90%** pass human "meaningfully different angle" review |
| D4 | Weak-footage honesty ≥ **90%** of unsupportable golden-set jobs refuse or narrow rather than fabricate |
| D5 | Style fidelity ≥ **80%** correct account match in a blind 5+ account panel |
| D6 | Quote/claim integrity **100%**; zero known meaning-altering edits |

## Blocked on

**D-21 spend ceiling.** Live model execution cannot start without it. Recorded fixtures got Phase 0 built; they cannot demonstrate editorial quality, because a recorded reply is not a decision.

## Risks that must not be discovered late

1. **Learned preferences silently become invariants.** `style-profile-v1` was deliberately built so a schema that cannot hold a learned tendency cannot silently treat a preference as an invariant. Adding learned fields must preserve that separation, with per-field confidence and provenance. Regression here is a brand-safety failure, not a modelling one.
2. **Anti-homogenisation is unmeasurable without a distinctness metric that predates it.** Build the metric in Stage 1's golden sets, not here.
3. **The quote gate is currently order-preserving-subsequence, not negation-aware** (known Phase 0 limitation, D-37 promotion backlog). D6 demands 100%. Promoting that gate is in this stage's scope.
4. **Live model spend.** Every live call is money. The D-21 gate pattern already exists; reuse it rather than inventing a second budget path.

## Out of scope

Cross-account learning. Publishing. Trend signals (PRD Phase 1 scope, separate work package).
