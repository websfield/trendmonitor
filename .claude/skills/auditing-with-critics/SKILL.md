---
name: auditing-with-critics
description: How the critic-panel audit works and when to use it - the audit-vs-gate distinction, the one-lens read-only critic archetype, co-equal tracks, the evidence rule, and how the chair merges findings into a ranked register. Read this to understand /audit and /bootstrap-critics, to author a critic by hand, or to decide whether an audit is worth running.
---

# Auditing with critics

A critic panel is a deliberate, whole-codebase **audit** that produces a ranked, owner-assignable risk register. It is the repo-wide counterpart to a per-phase gate.

## Audit vs gate (the core distinction)

- A **reviewer / gate** (jig's `code-reviewer`, `security-reviewer`, etc.) runs inside the build loop, pass/fail, on a change or a phase, and rolls into a report card. It answers "is this change allowed through?"
- A **critic** audits the system as it already exists, ranks what is wrong or risky, and writes a register. It answers "where are this codebase's biggest risks, and in what order?"

The same subjects can appear in both; the posture and the deliverable differ. Use gates continuously; run an audit periodically - before a milestone, when inheriting a system, or when hardening one.

## The critic archetype (one lens, read-only, evidence-bound, adversarial)

Every critic: one lens only; read-only tools (`Read, Grep, Glob`); a mandate phrased as checkable claims; a reading list of real paths it owns; and a strict output schema. The non-negotiable rule, in every critic and re-injected by the chair: **cite `path:line` or exact doc section for every finding; tag anything unverifiable `[UNVERIFIED]`; never present a guess as a finding.** This rule is necessary but not self-enforcing - it works only because the chair refuses to promote ungrounded items into the ranked register.

The posture is **adversarial**: the audit is the last line of defense before end users, so a critic assumes defects exist and hunts; a polite audit is a failed audit. Two mechanisms keep the evidence rule from turning rigor into self-censorship: a critic reports smells it cannot pin to a line as **`[HUNCH]`** items (a separate section the chair then chases with a bounded verification pass - promoted if evidence turns up, visibly parked if not), and every critic declares **Coverage** (read fully / skimmed / did not read) so the chair can compute what nothing swept. Zero findings must be *earned*: a clean report lists what it hunted for and failed to find.

## Tracks and co-equal rooms

Each critic declares a `Track:` (architecture, security, payments, data, ops, ux, accessibility, ...). The chair groups critics by track into rooms and runs them as co-equal. The recurring failure mode is letting one room (usually architecture) dominate and pushing another (usually UX) down by default - the chair must not do this.

## The chair (`/audit`)

Discovers the critics, groups them by track, dispatches each read-only with the run-context its fresh window lacks (build state, the evidence rule, the adversarial posture), then merges: dedup, rank-up cross-critic findings, keep verified separate from `[UNVERIFIED]`, chase every `[HUNCH]`, refuse to rank ungrounded items, and write a ranked register to `docs/progress/audit/<date>.md`. It leads with a readiness headline (Ready / Almost / Not yet plus a grade), and an A must be earned by a documented hunt.

Three structural defenses against the single-pass, single-model blind spot:

- **The outside voice.** The chair runs `codex-review.md` Mode 3 (a whole-repo sweep by the OpenAI Codex CLI) as one more co-equal room. A different model catches what any one model misses about its own output; cross-model agreement is the strongest signal an audit produces. Optional by design - no codex, no room, never an error. Codex claims pass the same evidence gate: the chair verifies each against the code before it can be ranked.
- **The depth room.** Lens-based critics give each file a sliver of an attention window, and nobody owns "read this one file end to end" - which is where internal contradictions, unexecutable steps, and dead references hide. After synthesis the chair picks the highest-risk artifacts (most-used surfaces, files several findings brushed against, past escapes, unswept paths) and dispatches one deep reader per artifact: full attention, simulating the artifact's real reader with only that artifact in hand. Findings merge tagged `(depth)`. The same deep read runs standalone as `/interrogate <path>`.
- **The second pass.** After synthesis the chair asks what no critic read (the unswept list, from the Coverage declarations), what stayed unverified, and whether a promoted hunch opened a lead - then dispatches a targeted second round until a round comes back with nothing new (bounded at two extra rounds). One pass always misses the tail; the register records how many rounds ran.

And one feedback loop across runs: **audit escapes**. Every register ends with an `## Audit escapes` section where any defect found *after* the audit that it should have caught gets logged - by the user, a later session, `/interrogate`, or an outside model - with the lens that leaked it. The next audit reads the escape list first, briefs the leaky room by name, and puts the escape's artifact on the depth-room shortlist. No fixed panel converges to zero; the escape list is how you *measure* the tail shrinking instead of assuming it.

## The generator (`/bootstrap-critics`)

Critics are **generated per repo**, not shipped, because they must name real files, routes, and tables - the same reason jig generates its domain reviewers. The generator surveys the repo, proposes a roster with a one-line evidence reason per critic, confirms with the user, then writes the agents from the `_critic-template`. Six generic critics ship as defaults because they apply anywhere: `architecture-critic`, `accessibility-critic`, `correctness-critic` (the defect hunt - it reads the code itself for bugs, where the others audit structure and surfaces), `operability-critic` (the `ops`-track stranger test - could someone who didn't build this run and *recover* it from the docs, including the backup/restore reality check), `outbound-truth-critic` (the `docs`-track trace check - do the claims customers read trace to shipped code or recorded evidence? canon in the `outbound-truth` skill), and `supply-chain-critic` (the `security`-track dependency floor - is anything scanning the dependencies, and does the license story hold? checklist framing, never legal advice). Everything else (payments, isolation, funnel, design-system, operator-ux, ...) is generated to fit the codebase; a *tailored* correctness-critic naming the repo's real entry points and risk surfaces is usually worth generating on any non-trivial codebase.

## Right-sizing

The overhead earns out only for high-stakes, multi-faceted, or repeated review. For a quick one-off, a single focused prompt is fine. And beware structure theater: the scaffolding makes a weak prompt produce prettier output, not better analysis - the quality lives in the mandate content and the grounding, not the number of seats.

For panel size, `/bootstrap-critics` works to a band — counting the whole reconciled panel, shipped generics included: **2–4** critics for a single-surface repo, **4–7** for a typical multi-surface app, **7–10** for a large multi-domain system; past ~10, lenses are overlapping. The band is a smell test; evidence per lens still decides every seat.
