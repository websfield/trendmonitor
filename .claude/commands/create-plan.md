---
description: Create an implementation plan (codebase review + master plan + short per-phase plans), then gate it through one plan-reviewer round before handing off to /implement or /start-teams. Do NOT use for a small, clear change — /shape (or /go) routes it to /implement's fast lane, no plan documents.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Create Implementation Plan

Create an implementation plan that an implementer can build from **with only the plan text** — and gate the finished draft through one **plan-reviewer** round (Step 6) so gaps are caught at authoring time, not during implementation.

> The plan is the contract every downstream agent obeys. It says *what* will be built and *how you will know*; it does not restate the rulebook — the build lanes paste `CLAUDE.md`'s conventions into each spawn prompt themselves.

## Where this command learns the project

This command is project-agnostic. It learns the specifics at run time from:
- **`CLAUDE.md`** at the repo root — the non-negotiable rules, Critical Paths, Definition of Done, and "where things live". The top of the precedence stack.
- **`NORTH_STAR.md`** if filled — drives the alignment check (Stop Condition 4).
- **`DECISIONS.md`** if it exists — the decision journal. A trade-off already settled there is *context, not a fresh debate*: honor it, and if this feature would reverse a load-bearing decision, flag it for the person.
- **`.claude/project-context.md`** if present — the longer context bible from `/bootstrap-claude-pack`.
- **`.claude/agents/`** and **`.claude/skills/`** — the available specialist agents and Critical-Path reviewer skills. **Only name agents/skills that actually exist here.**
- The **docs tree** the project uses for requirements (`docs/`, `PRD.md`, an issue tracker). Discover it; do not assume a fixed path.

If `CLAUDE.md` is absent or thin, say so and recommend `/bootstrap-claude-pack` first — plan quality depends on the project contract existing.

## Usage
```
/create-plan [feature-name-or-description]
```

---

## Stop Conditions (read FIRST — these prevent silent drift)

Do not proceed past Step 2 if any of the following is true. Surface the blocker; do not bluff past it.

1. **The feature does not map to any tracked requirement.** If the project tracks requirements (REQ-IDs, issues, a PRD), the feature must bind to ≥1; otherwise stop and ask.
2. **The feature depends on a capability that has not shipped.** Verify against ground-truth artefacts (status docs, CI, the code), not optimistic plan tables.
3. **A new core dependency would be introduced with no decision record** where the project requires one (`CLAUDE.md` §Conventions / ADR policy).
4. **The feature contradicts the North Star.** A feature matching a **Non-goal**, or not advancing the **Goal** / **Current focus**, is possible scope creep: name the specific Non-goal or gap and ask whether to proceed, reshape, or update the North Star. (Missing or template `NORTH_STAR.md` → skip; do not invent a goal.)

If a stop condition fires, document it in the Step 7 summary and ask how to proceed.

---

## Guiding Principles (apply to every step)

- **Traceability** — every phase's *Goal* line names the requirement IDs it satisfies.
- **Respect the project's hard rules** — read them from `CLAUDE.md`; the project's convention wins over any habit from elsewhere.
- **Failure paths are first-class** — every handled lifecycle event has its inverse/teardown; every recovery mechanism has a stated double-failure behaviour; every external dependency has a degraded mode. These become acceptance criteria, not prose.
- **Goal-driven execution** — every phase ends with PASS/FAIL acceptance criteria backed by a test name, a command, or `file:line` — never "improvement".
- **Surgical changes** — exact file paths within the existing structure. No new top-level directories or frameworks.
- **Simplicity first (minimal *scope*, not minimal *completeness*)** — the fewest phases and the smallest surface that satisfy the request; no speculative phases; no abstractions until ≥2 callers exist.
- **Boil the lake (complete the right thing)** — within the agreed scope, plan the *complete* implementation: every edge case, error path and teardown, and the tests that prove them, in the same phase. A *lake* is boilable now; an *ocean* (a rewrite, a new product surface) is scope — record it as a Non-goal with a receiving phase, never half-start it.
- **Economy of means (least new code, full coverage)** — reach for an existing helper, the standard library, or a native platform feature before new code, a dependency, or an abstraction (`keeping-it-lean` skill). Economy governs *how*, coverage governs *how much*: never trade one for the other. One test per behaviour, at the seam, in the project's existing harness; a plan that names a new harness says why the existing one cannot do the job.
- **No requirement substitution** — implement what was asked, not a generic stand-in.

---

## Process

### Step 0: Pre-flight — clarify scope
**If a shaping brief exists** at `docs/plans/<feature>-brief.md` (written by `/shape` or `/go`), read it first: its **Chosen scope** + **Real job** are the starting contract — do not re-litigate them; carry its Non-goals into the master plan. Restate the request in your own words and resolve any *remaining* ambiguity. If the request is precise and fits one phase, skip the rest of this step. If genuinely ambiguous and no documented default applies, ask the **highest-leverage** ambiguity only — at most two questions. Bias toward proceeding with a documented assumption recorded in the master plan.

### Step 1: Determine workflow type
- "refactor / improve / fix / upgrade / migrate / harden" → **Refactoring/Hardening**: audit first; write `docs/progress/<feature>-audit.md` before the plan. The audit opens with a **behaviour contract** (≤ one screen): the user journeys and inputs the code serves, their visible outcomes, and side effects (writes, calls, events). Run the existing tests first and record the result; add only the characterization tests the contract needs and no test covers. Browser checks follow the `verifying-webapps` skill.
- Otherwise → **Feature Development**.

### Step 2: Load project context + reviewer skills
Read in parallel (skip what you've read this session): `CLAUDE.md` and `.claude/project-context.md`; the brief; `NORTH_STAR.md` (run Stop Condition 4); `DECISIONS.md`; the requirements source; ground-truth status artefacts for any dependency; the Critical-Path reviewer **skills** whose path this feature touches. For a broad sweep, optionally spawn **one read-only `Explore` agent** and keep only its conclusions, then verify the key claims yourself. A sub-agent never drafts plan text.

### Step 3: Codebase review
**Create `docs/progress/<feature>-codebase-review.md`** (short — it feeds the plan, it is not the plan):
- Requirement IDs satisfied (with links); what must already be shipped, citing the artefact that proves it.
- Modules/areas touched and which owns each new entity; cross-boundary reach (service call / event / API).
- **Entry-point trace** — for each new capability, the concrete path from a user-reachable entry point (route, screen, job, CLI) to it. A capability only tests or seeds can reach has no live caller yet — say so.
- **Deferred findings** — read every `## Deferred` list in `docs/progress/*/progress-and-log.md`; an entry whose `activates with:` capability this plan builds re-enters scope: list it here and give it a phase.
- Critical-Path triggers (from `CLAUDE.md`'s table); inherited stopgaps in the flows this extends (`TODO`/`FIXME`, hardcoded IDs, single-tenant assumptions) with a retire-or-keep verdict each.
- Exact file paths this work will touch (new vs modified); the closest existing implementation to replicate.
- Risks — for each material risk, the invariant that must hold and one negative example that would disprove it; each becomes an acceptance criterion somewhere.

### Step 4: Master plan
Create `docs/plans/<feature>-master-plan.md` with six sections:
- **Objective** — one sentence, no scope expansion.
- **Non-goals** — including every *ocean* deferred.
- **Critical Paths touched** — table (`Path | Reviewer | Full gates?`); selects the reviewers that run on the *code* in the build lanes.
- **Phases** — `N | Title | Depends on | Makes live | Status | File`. *Depends on* names lower-numbered phases or `none`; *Makes live* is the route/screen/job/command a person can use when the phase lands, or the later phase that makes it live; *Status* is `planned` / `in progress` / `Ready`, set by the build lanes and `/review-phase` (a claim — the record's phase section is the proof).
- **Risks and decisions** — the brief's *How this fails* bullets and the review's risks with their invariants; any decision baked in; every new external service or paid dependency with its estimated monthly cost and free-tier ceiling.
- **Plan Review Log** — `| Date | Round | Reviewer | Reviewed ref | Verdict | Notes |`, filled by Step 6.

### Step 5: Phase plans
For each phase create `docs/plans/<feature>-phase-<N>.md` with six sections — nothing else:
- **Goal** — one sentence: what a user can do when this phase lands, plus the requirement IDs it satisfies.
- **Files** — `path | new/modified | owner agent | why`; **at most 10 rows** — more means the phase splits. Owner agents must exist in `.claude/agents/`. The *why* cell names the pattern to replicate or the stopgap to retire (from the codebase review); the build lanes let the implementer read the codebase review and audit themselves.
- **Acceptance criteria** — `AC-n | criterion | the test name or command that proves it | expected result`. "It works" is forbidden; a row with no test or command is not a criterion yet. Every edge case, failure path and risk invariant from Step 3 lands here as a row that can fail.
- **Least confident** — one line: the bet in this phase you'd expect to fail first. Never "none".
- **Out of scope** — adjacent code the implementer must not touch.
- **Depends on** — earlier phase number(s), or `none`.

### Step 5.5: Author self-check (you, no reviewer, no round)
1. Every `file:line` the plan cites was opened in this session — re-open each now; a stale cite is a wrong plan.
2. Every "every X" claim (all callers, all routes, all handlers, the whole population a guard covers) lists the sites, with the grep command that produced the list shown beside it.
3. Every acceptance criterion names the test or command that goes red if the behaviour is broken. For each, imagine one planted violation and name the test that catches it; none → not testable yet.
4. Each phase's *Files* table has at most 10 rows; each *Depends on* names a lower phase or `none`; the master plan's *Phases* table and the phase files agree.
5. Each phase has a non-empty *Least confident* line and a real *Makes live* entry.
Fix what fails, then Step 6.

### Step 6: Plan review gate (one round)

<!-- canon: .claude/gate-rules.md#1-8 -->
**Before running this gate, read `.claude/gate-rules.md` and follow it.** This is the plan lane: one `plan-reviewer` run over the frozen draft (Critical-Path reviewers run on the code later, not on the plan); a finding that changes *what will be built* earns one re-run; a finding that changes only *how the plan reads* is fixed without one.

**Brief the reviewer** — never rely on a spawned agent reading anything automatically. The spawn prompt contains: the file paths (master plan, all phase plans, codebase review) with "Read these fully before judging"; "You are reviewing PLAN DOCUMENTS, not a code diff — simulate executing each phase from the plan text alone as the implementer, then run your pre-mortem"; "probe each phase's *Least confident* line first"; "report every finding with its location and say whether it changes what will be built"; and the verdict format READY / NOT READY. A missing `plan-reviewer` agent → `general-purpose` with `plan-reviewer.md`'s checklist pasted verbatim (§8).

**Run, then converge** — append one row to the Plan Review Log per run (`| <date> | 0 | plan-reviewer | <commit or "working tree"> | READY/NOT READY | <one line> |`). Fix every finding that changes what will be built, re-run Step 5.5 if a table changed, then re-run `plan-reviewer` **once** (round 1). Wording-only findings are fixed and noted in the row, no re-run. If NOT READY survives round 1, stop and surface the residual to the person. **Amending a READY plan:** if you change any phase's *Files* or *Acceptance criteria* after READY, first append `| <date> | – | – | – | STALE | <what changed> |` to the log — `plan-ready.js` then refuses the build until one more `plan-reviewer` run appends a new READY row.

**Boundary** — this gate verifies the *plan*. The Critical-Path reviewers run against shipped code in the build lanes and `/review-phase`. A plan-gate READY discharges nothing at code time.

### Step 7: Summary
Report the plan files created, the Critical Paths touched, the Plan Review Log's last verdict, any fired Stop Conditions, and the handoff: `/implement <feature>` by default, `/start-teams <feature>` when a phase's *Files* Owner column names two or more different specialist agents; both run `node .claude/scripts/plan-ready.js docs/plans/<feature>-master-plan.md` first.

**Offer to journal a load-bearing plan decision** if the plan settled a real trade-off — an approach chosen over a named alternative, a deferral accepted, a Stop Condition resolved a particular way. Offer **once**, never silently: *"Record this choice in `DECISIONS.md`?"* — one line per the decision-journal convention (`using-the-pack`): `- <today, YYYY-MM-DD> — <chose X over Y> for <feature> — because <why>`. Skip it when the plan raised no genuine fork.
