---
name: cd-measurement-honesty
description: Use whenever a Cutdown change touches counting, exit criteria, baselines, cohorts, denominators, uplift or performance claims, QA pass rates, latency percentiles, cache-hit rates, caption/technical accuracy rates, `status --phase0`, `packages/evaluation`, `PerformanceObservation`/`Experiment` contracts, `output-counting-policy.md`, or any number a producer or stakeholder will read. The hard rule — an absent observation is never a zero, an unproven criterion is never "met", and every rate names its denominator, its population and its period. Mandatory before writing any counter, evaluator, scorecard, or exit-criterion predicate, and before editing PRD §14 or the counting policy.
---

# Cutdown Measurement Honesty

This is the rule canon for the **Cutdown measurement honesty** Critical Path. Its gate is
`.claude/agents/cutdown-measurement-reviewer.md`. Scope is Cutdown only — `cutdown/`,
`docs/video-editing/`. The UGC Intelligence `measurement-discipline` skill governs a
different product and does not apply here (`tech-spec.md` §14); this skill exists because
§14's exemption left Cutdown with *no* measurement gate at all, while Cutdown is now the
product line that computes PRD exit criteria and will shortly compute uplift.

## Why this path exists

Cutdown's entire claim to being finished is a set of **numbers about itself**: 20 approved
real outputs, 3 accounts, zero invalid ranges, ten outputs with no breaking contract
change. From Stage 1 it will also compute quality and uplift numbers *about a client's
content*. Every one of those is a number nobody can check by looking at a video. The
failure mode is not a crash — it is a green criterion that was never earned, and a metric
that renders perfectly while meaning nothing.

The project already has one instance on disk, and it is the reason this skill names the
rule so bluntly: in `apps/cli/src/commands/status.ts`, the `no-breaking-contract-change`
criterion computes `met: window.length >= 2 && …` under a label that says **ten**. Two
outputs satisfying a ten-output criterion is not a rounding error; it is the criterion
reporting green having tested 20% of itself. **Status: shipped and OPEN** — the fix is
Stage 0B task 13, so a review that re-finds it should record it as known, not as new.

## The rules

### R1 — Absent is not zero, and unproven is not met

A missing observation, an empty window, an unrun check, and a measurement of zero are
**four different states** and must stay four in the data. Never let absence collapse into
a numeric zero or a boolean `true`.

- A criterion with insufficient evidence reports **UNPROVEN** and says what is missing.
  Not `met: false` with a misleading reason, and never `met: true`.
- `?? 0`, `|| 0`, `.length === 0 ⇒ pass`, and `Number(x) || 0` on an observation path are
  each a finding unless a comment states why absence genuinely means zero *here*.
- The shape to match is in `apps/cli/src/commands/status.ts`, in the criteria
  `rights-and-qa-evidence` and `no-breaking-contract-change`: "UNPROVEN, not proven by
  absence". Cited by **criterion id, never by line number** — Stage 0B task 13 rewrites
  that file, and a rule anchored to a line number is a rule that quietly stops pointing
  at anything.

### R2 — A criterion's predicate must match its label

The label, the comment, and the predicate state the same threshold. If the label says
ten, the predicate requires ten. When a threshold is a PRD number, cite it (`PRD §15
Phase 0 row`, `PRD §14.1`, `§14.2`, `§14.3`) — an uncited threshold is an invented one.

Assert the agreement in a test that reads the label, not by eye.

### R3 — Every rate names denominator, population and period

No bare percentage. A rate carries, in the data and not only in prose:
- **denominator kind** — what was counted (renders? cues? jobs? keyframes?);
- **population** — which units were eligible, and what excluded the rest;
- **period** — the window, stable across the comparison.

Two rates with different denominator kinds are never compared, summed, or averaged.
`n` carries its unit: 3 outputs × 10 metrics is **not** n=30.

### R4 — Provenance is structural, and labels never merge

`real` vs `fixture` (D-36) and `pass` vs `pass_with_waivers` (D-35) are load-bearing
labels, not presentation. A fixture never enters a real count; a warning-waived pass is
counted **separately**, never folded into a clean pass. `status.ts`'s
`approved-real-outputs` criterion is the shape: filter by the **stored** label, never by
inference from a path or a name.

Recorded-model output is **not** live-model output. A number produced from a recorded
replay is labelled as such — a recorded reply is not a decision, so it cannot evidence
editorial quality.

### R5 — Independent claims are reported independently (D-38)

`PIPELINE_IMPLEMENTATION_COMPLETE` and `PHASE_0_EXIT_EARNED` are never merged, never
inferred from each other, and never rolled into one "percent complete". The general form:
**an engineering exit and a data/evidence exit are two claims.** A stage whose code is
done and whose data is absent is reported as exactly that.

### R6 — The system never baselines against itself, and correlated samples are one sample

A baseline that includes outputs this system produced measures the system against itself.
Cohort and baseline construction states its exclusion rule.

Two packages sharing a `creativeBriefId` are **one** angle rendered twice, not two
independent samples (owner decision 2026-08-09, `todos.md` T-1). They may not both enter a
cohort, a count, or an average as independent units.

### R7 — Claims language matches evidence strength

Forbidden without a controlled comparison: *causes, lifts, drives, improves, outperforms*.
A measured association is described as an association. An uplift claim requires its
minimum n, its comparability definition, and its pre-registration — and when they are
absent the claim is **withheld**, not computed and hedged in prose. A refusal must be
structural: a number that cannot be honestly produced is not produced.

### R8 — A behaviour claim is asserted in a test or deleted

Repo law (CLAUDE.md Lessons, 2026-07-30), and it bites hardest here: a comment saying
"this counts only approved real outputs" is worth nothing beside code that doesn't.
Threshold, exclusion and denominator claims get a test that fails if the claim stops
holding. A fixture cannot express a cross-document rule — those are enforced in code
(`tech-spec.md` §3 forbids `if/then/else` in schemas).

### R9 — A number written in a doc must match the artefact it came from

A count, rate, or threshold quoted in a decision row, a review, a plan, a ledger
entry, or a config comment is a **claim about the repository**, and it is checked
the same way code is: by running the thing that produces it. This is R8 pointed at
prose, and it earns its own rule because it is where these failures actually
happen — the first two reviews of this very Critical Path each found a decision row
citing counts the repo did not support, and one of them was a *correction* of the
other.

Two specific traps, both live in this repo:

- **The total wearing the subset's name.** "22 dead directives" was the total noqa
  count; only 17 were dead. Say which population the number is over.
- **A number measured over a population the tool does not read.** Lint counts
  quoted to justify excluding a rule were measured *including* a generated tree
  that the config excludes from linting — one of them was 98.5% generated code, and
  the honest figure did not support the argument being made.

If a number is expensive to re-derive, say where it came from so the next reader
can. A number with no reproduction path is an assertion.

## Anti-patterns seen in this repo or its plan reviews

| Anti-pattern | Why it is a finding |
|---|---|
| `window.length >= 2` under a label saying ten | R2 — **shipped, OPEN**; fix is Stage 0B task 13. The origin of this skill |
| A denominator field that is one string for every metric | R3 — cannot support correct aggregation |
| A union arm carrying provenance that vanishes at first type-narrowing | R4 — the label must survive the type system |
| "Uplift absent when n<30" expressed as a schema fixture | R7/R8 — `tech-spec.md` §3's subset cannot express it; enforce in `packages/evaluation` with a sole-emitter test |
| Counting both real packages of one `creativeBriefId` as 2 | R6 — **shipped, OPEN**: `status --phase0` prints 2/20 against a policy that says 1. Settled by owner decision T-1; implemented by Stage 0B task 13 under D-56. One angle, two renders |
| A pooled cross-account statistic before the tenancy question is settled | R6 + the boundary path; see `cd-tenancy-boundaries` |

## Worked example

Adding "caption accuracy ≥98%" (PRD §14.1):

1. Name the denominator: **cues**, not renders — and store `denominatorKind: 'cues'`.
2. Name the population: cues in final-tier renders of `real` packages; state that fixture
   renders and draft tiers are excluded, in the data.
3. Name the period: the ten-output contract window, or an explicit date range.
4. Below the minimum n, emit **UNPROVEN with the shortfall named** — never 0%, never 100%.
5. Test: a run with 9 eligible cues reports UNPROVEN naming the minimum; a run with a
   recorded-model transcript is labelled recorded, not live.
6. Cite `PRD §14.1` beside the 98.

## Checklist before shipping a change on this path

- [ ] Every new threshold cites a PRD section; label, comment and predicate agree.
- [ ] Every new rate stores denominator kind, population rule, and period.
- [ ] Every absence path reports UNPROVEN with the shortfall named — no `?? 0`.
- [ ] `real`/`fixture` and `pass`/`pass_with_waivers` survive every filter and aggregate.
- [ ] Engineering and data exits are reported as two claims (D-38).
- [ ] A test asserts each claim; cross-document rules live in code, not fixtures.
