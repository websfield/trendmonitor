---
description: Create an implementation plan (codebase review + master plan + per-phase plans with project conventions pinned), then gate it through a multi-agent plan review before handing off to /start-teams. Do NOT use for a small, clear change — /shape (or /go) routes it to /implement's fast lane, no plan documents.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Create Implementation Plan

Create a comprehensive implementation plan **with this project's conventions pinned into every phase plan**, so whichever orchestrator implements it cannot drift onto patterns from other projects or onto generic AI defaults — and **gate the finished draft through a multi-agent plan review (Step 6)** so gaps are caught at authoring time, not during implementation.

> The plan is the contract every downstream agent obeys. A spawned agent does **not** auto-read your `CLAUDE.md`; the orchestrator pastes the phase plan into the agent's prompt. So every convention a phase depends on must live in the phase plan itself (Step 5).

## Where this command learns the project

This command is project-agnostic. It learns the specifics at run time from:
- **`CLAUDE.md`** at the repo root — the non-negotiable rules, Critical Paths, Definition of Done, and "where things live". This is the top of the precedence stack.
- **`NORTH_STAR.md`** at the repo root if filled — the single outcome the project exists for. Drives the alignment check (Stop Condition 5): a feature that hits a Non-goal or doesn't advance the Goal is flagged before planning.
- **`DECISIONS.md`** at the repo root **if it exists** — the decision journal (see the `using-the-pack` skill). A trade-off already settled there is *context, not a fresh debate*: honor it in the plan rather than re-deriving it, and if this feature would reverse a load-bearing decision, surface that as a Stop-Condition-style flag for the person, don't silently overturn it.
- **`.claude/project-context.md`** if present — the longer context bible produced by `/bootstrap-claude-pack`.
- **`.claude/agents/`** and **`.claude/skills/`** — the available specialist agents and Critical-Path reviewer skills. **Only request agents/skills that actually exist here.**
- The **docs tree** the project uses for requirements (e.g. `docs/`, `PRD.md`, issue tracker). Discover it; do not assume a fixed path.

If `CLAUDE.md` is absent or thin, say so and recommend running `/bootstrap-claude-pack` first — the plan quality depends on the project contract existing.

## Usage
```
/create-plan [feature-name-or-description]
```
- `$ARGUMENTS`: feature name, description, or requirement reference.

---

## Stop Conditions (read FIRST — these prevent silent drift)

Do not proceed past Step 2 if any of the following is true. Surface the blocker; do not bluff past it.

1. **The feature does not map to any tracked requirement.** If the project tracks requirements (REQ-IDs, issues, a PRD), the feature must bind to ≥1. If none and the project tracks them, stop and ask: "no requirement binding — in scope, or add one first?".
2. **The feature depends on a capability that has not shipped.** Verify against ground-truth progress artefacts (status docs, CI, the actual code), not against optimistic plan tables.
3. **A Critical Path applies but its reviewer skill/agent is missing from `.claude/`.** Stop and surface "missing reviewer X required for this task" — do not fabricate a substitute.
4. **A new core dependency would be introduced with no decision record** where the project requires one (see `CLAUDE.md` §Conventions / ADR policy).
5. **The feature contradicts the North Star.** If `NORTH_STAR.md` is filled, check the request against it: a feature matching a **Non-goal**, or that does not advance the **Goal** / **Current focus**, is possible scope creep. Surface it plainly — name the specific Non-goal or the gap — and ask whether to proceed anyway, reshape the feature, or update the North Star. (If `NORTH_STAR.md` is missing or still the template, skip this check — do not invent a goal to judge against.)

If a stop condition fires, document it in the Step 7 summary and ask how to proceed.

---

## Guiding Principles (apply to every step)

- **Traceability** — every phase lists the requirement IDs it satisfies. A phase with no requirement is platform plumbing (rare, justify it) or out of scope.
- **Respect the project's hard rules** — read them from `CLAUDE.md` and pin them verbatim into each phase plan. If a convention here conflicts with a habit from another project, the project's convention wins.
- **Derive, don't hand-enumerate** — any list that gates something (a spec's coverage scope, an event dispatch list, an audit's page list) is *derived* from its defining set and checked for count parity (Step 5.5).
- **Failure paths are first-class** — every handled lifecycle event has its inverse/teardown counterpart; every recovery mechanism has a stated double-failure behavior; every external dependency has a degraded mode.
- **Numbers have provenance** — every quantitative target is cited to a doc:line or derived in a Derived Budgets table.
- **Goal-driven execution** — every phase ends with verifiable PASS/FAIL acceptance criteria backed by file:line, test name, or screenshot — never "improvement".
- **Surgical changes** — phase plans list exact file paths within the existing structure. Do not invent new top-level directories or frameworks.
- **Simplicity first (minimal *scope*, not minimal *completeness*)** — the minimum number of phases and the smallest surface that satisfy the request. No speculative phases; no abstractions until ≥2 callers exist. This governs *scope* — it never licenses a half-built version of what is in scope (see *Boil the lake*).
- **Boil the lake (complete the right thing)** — within the agreed scope, plan the *complete* implementation: every edge case, every error path, every teardown, and the tests that prove them. AI-assisted implementation makes the marginal cost of completeness near-zero, so a phase that knowingly ships "90% for now" is under-planned, not lean. The boundary is **lake vs ocean** — a *lake* is boilable now (all branches of this feature, full error handling, the spec the behaviour needs): boil it in the same phase. An *ocean* is a genuinely larger undertaking (a rewrite, a new product surface, a speculative abstraction): that is *scope*, so record it as a Non-Goal with a receiving phase — never half-start it. Deferring completable work, or its tests, to "a later PR" is the anti-pattern. Leanness never overrides this: when the shortest means would drop a branch or its test, coverage wins (see *Economy of means*).
- **Economy of means (least new code, full coverage)** — express the agreed scope with the *fewest new* lines, dependencies, and abstractions: reach for an existing helper, the standard library, or a native platform feature before writing new code, adding a dependency, or introducing an abstraction (see the `keeping-it-lean` skill and its platform-native cheatsheet). This is a *second axis, orthogonal to Boil the lake*: economy governs **how** you build, coverage governs **how much behaviour you cover** — maximise both, never trade one for the other. It never licenses dropping an edge case, error path, teardown, test, or requirement to shrink a diff. **Never apply "fewer lines" to:** validation at trust boundaries, data-loss / error handling, security, accessibility, edge cases, tests, or anything explicitly requested. When economy and completeness ever appear to conflict, **completeness wins** — full coverage first, then the leanest means that delivers it.
- **No requirement substitution** — implement what was asked, not a generic stand-in.

---

## Process

### Step 0: Pre-flight — clarify scope
**If a shaping brief exists** at `docs/plans/<feature>-brief.md` (written by `/shape` or `/go`), read it first and treat its **Chosen scope** + **Real job** as the starting contract — the "are we building the right thing?" question is already answered, so do not re-litigate it; carry its Non-goals and any 10-star sketch into the master plan. Then restate the request in your own words and resolve any *remaining* ambiguity. If the request (or brief) is precise and unambiguous and names the surface + requirement IDs and fits one phase, skip the rest of this step. If genuinely ambiguous and no documented default applies, use `AskUserQuestion` for the **highest-leverage** ambiguity only — at most two questions, never trivia. Bias toward proceeding with a documented assumption recorded in the master plan.

### Step 1: Determine workflow type
- "refactor / improve / fix / upgrade / migrate / harden" → Refactoring/Hardening workflow (audit first; write `docs/progress/<feature>-audit.md` before the plan).
- Otherwise → Feature Development workflow.

### Step 2: Load project context + reviewer skills
Read in parallel (skip what you've read this session):
- `CLAUDE.md` and `.claude/project-context.md` (if present).
- `docs/plans/<feature>-brief.md` (if present) — the shaping brief; its Chosen scope and Non-goals are the contract for what to plan.
- `NORTH_STAR.md` (if filled) — run the Stop Condition 5 alignment check against the request before drafting.
- `DECISIONS.md` (if it exists) — the decision journal; a settled trade-off is context to honor, not to re-derive.
- The requirements source for this feature (PRD / issue / spec).
- Ground-truth status artefacts for any dependency.
- The Critical-Path reviewer **skills** in `.claude/skills/` whose path this feature touches (read only the matching ones).

For a broad multi-area sweep, optionally spawn **one read-only `Explore` agent** and keep only its conclusions. A sub-agent never drafts plan text.

### Step 3: Codebase review
**Create `docs/progress/<feature>-codebase-review.md`:**
- Requirement IDs satisfied (with links).
- Where this fits in the roadmap and what must already be shipped (cite the artefact that proves each dependency shipped).
- Modules/areas touched and which owns each new entity.
- Cross-boundary reach — every place this needs another module's data and how it will reach it (service call / event / API). If a foreign-key reach is the answer in a project that forbids it, redesign before writing the plan.
- Critical-Path triggers — list each that applies (read from `CLAUDE.md`'s Critical-Path table).
- **Inherited stopgaps** — grep the flows this feature extends for env-var defaults, hardcoded IDs, `TODO`/`FIXME`, `demo`/`placeholder`, single-tenant assumptions. Each hit gets a verdict: retire here (cite task #) or keep (reason + the phase that retires it). Empty section requires an explicit "none found" with the grep commands as evidence.
- Exact file paths this work will touch (new vs modified).
- Existing patterns to follow verbatim (name the closest existing implementation as the pattern to replicate).
- Risks — anything shared this could break.

### Step 4: Master plan
Create `docs/plans/<feature>-master-plan.md` with: Objective (one sentence, no scope expansion) · Requirement IDs · Non-Goals · **Critical Paths touched** table (drives Step 6 reviewer selection) · Project Conventions Pinned (reference Step 5 block) · Open-question decisions baked in · Dependencies (each citing its proof-of-shipped artefact) · Deferral Ledger (every "a later phase will…" promise → a row with a resolvable receiving task; this tracks *plan-level* deferrals — *code-level* shortcuts are marked inline with a `SHORTCUT:` comment naming a ceiling + upgrade trigger and harvested by `/shortcut-ledger`, see the `keeping-it-lean` skill) · Derived Budgets (every uncited number) · Risk Assessment (seeded from the brief's *How this fails* section when present) · Phase Plans table (Phase / Description / **Depends on** / Primary Agent(s) / Plan File — agents MUST exist in `.claude/agents/`; *Depends on* names the earlier phase(s) this phase builds on — lower-numbered only — or `none` if it can start independently, defined per phase in Step 5) · Progress Tracking · Plan Review Log (filled by Step 6) · Exit Demonstration (drawn verbatim from the project's phase exit-gate doc).

### Step 5: Phase plans (CRITICAL — anti-drift section)
For each phase create `docs/plans/<feature>-phase-<N>.md`. The phase plan is pasted verbatim into each specialist's prompt, so **every convention this phase depends on must live in the phase plan itself**. Each phase plan contains:

- **Project Conventions Pinned (READ FIRST)** — paste verbatim from `CLAUDE.md`: the golden rules, the relevant non-negotiable rules, and any **Lessons** entries that touch this phase's ground (they exist because something already went wrong here once — an implementer who never sees them repeats them); plus the stack and package manager, the module/boundary rules, the financial/security/isolation rules that apply, the anti-patterns from other projects to avoid, and the list of available specialist agents (from `.claude/agents/`, with a "do NOT request" line for agents that don't exist).
- **Requirements Checklist (functional)** — derived directly from the requirement IDs; no expansion.
- **Requirements Checklist (technical)** — the project's non-negotiables that apply to this phase.
- **Edge Cases & Failure Paths** — answer the three derivation questions (inverse events, double failure, degraded mode); each answer becomes a task, a spec, or an explicit out-of-scope row with a receiving phase.
- **Failure Modes & Degraded Behavior** — one row per external boundary crossing (interaction / failure / degraded behavior / reconciliation / spec that proves it). "Throws an exception" is not a degraded behavior.
- **Handoff Contracts** — any artifact consumed by a later phase has its interface pinned here and cited by the consuming phase.
- **Depends on** — the earlier phase(s) whose completed work this phase builds on (the producers of every artifact this phase reads in *Handoff Contracts*), or `none` if it can start independently; default is the immediately preceding phase. The orchestrator gates on this line: a phase whose predecessor is not *proven* complete on disk is un-startable (see `/start-teams` / `/implement`), so it must name only lower-numbered phases.
- **Implementation Tasks** — table of `# | Task | Owner agent | File(s)`; Owner agent drives `/start-teams` selection.
- **Files to Create / Modify** — exact paths, new vs modified, owner, notes.
- **Migration Steps** (if entities changed) — generate, run on a fresh DB, seed updates.
- **Verification Steps** — paper-dry-run rule: each step names the exact command, the state it requires, and the numbered prior step that establishes that state.
- **Acceptance Criteria (verifiable PASS/FAIL)** — each cites evidence (file:line / test name / screenshot). Weak criteria like "it works" are forbidden.
- **Out of Scope (Surgical Changes)** — adjacent code the agent must not touch.
- **Completion Criteria (Definition of Done)** — from `CLAUDE.md`.

### Step 5.5: Mechanical consistency audit (derivations, not judgment)
Cross-check the plan's own artifacts: (1) coverage parity — every gating enumeration names its defining set and matches it 1:1; (2) closure — every file in Tasks appears in Files-to-Modify and vice versa, every Owner agent exists, every criterion has an evidence pointer, requirement lists reconcile, and every phase's *Depends on* names only existing lower-numbered phases (no forward or cyclic dependency; the master-plan table column and the phase plan's line agree); (3) deferral ledger closed — and each deferral is a genuine *ocean*, not a completable *lake* punted to "later"; (4) handoff contracts pinned; (5) every claimed invariant names mechanism + same-phase migration + test; (6) budget provenance; (7) paper dry-run of every verification step; (8) completeness (boil-the-lake) — every edge case and failure path named in a phase's *Edge Cases & Failure Paths* maps to a task, every behaviour has its test in the **same** phase, and nothing in scope ships knowingly partial. Fix every failure before Step 6.

**Codex cross-check (optional, cross-model).** After your own audit passes, run the Codex cross-check in **Mode 2 (Plan documents)** per `.claude/codex-review.md`, feeding it this feature's master plan, phase plans, and codebase review. It is an independent second model auditing the same mechanical-consistency dimensions; treat every `[P1]` it raises as a Step 5.5 failure to fix or explicitly dismiss before Step 6. If Codex is not installed/authenticated the cross-check skips with a note and this step proceeds on your audit alone — do not block on its absence.

### Step 6: Plan review gate (sub-agents — mandatory)
**6a. Select reviewers** — one reviewer per "yes" row in the master plan's Critical-Paths table, mapped to the reviewer agents in `.claude/agents/`, plus a generalist plan-integrity reviewer (`plan-reviewer`, or `workflow-manager` if the project defines one) **always, last**.

**Lean gate (`Gate intensity: lean` in `CLAUDE.md`) — consolidate, never skip.** Under lean, the per-path reviewers merge into **one merged reviewer run**: spawn the generalist reviewer type (or `general-purpose`, the same type the missing-reviewer fallback sanctions) once, read-only, carrying 6b's full briefing frame (the read-these-files preamble, the PLAN-DOCUMENTS reframing line, the depth and recall instructions) plus each touched path's dimension brief pinned **verbatim from that path's reviewer agent file** — paste-fidelity applies to each pinned brief — and rendering PASS / NEEDS CHANGES / BLOCK **per path**. Per-agent `model:` pins don't ride along in a merged run, so the spawn explicitly requests the strongest model the account exposes. A reviewer's `effort: max` frontmatter likewise doesn't ride along, and (unlike `model:`) has no per-dispatch override — so the merged run runs at session effort, with 6b's "think hard" instruction as its effort lever. The 6c generalist spawn stays separate, always, last — its simulate-and-pre-mortem job is different in kind. Under 6d, a failing path re-runs as the merged run scoped to the failing paths' checklists. Write "plan gate ran lean (consolidated)" into the plan-review report and the Plan Review Log — lean is never silent. (Codex Mode 2 sits at Step 5.5, outside this gate, unchanged.) Lean changes how many agents run, never what is checked.

**6b. Brief each reviewer** — spawned agents read nothing automatically. Every spawn prompt contains: the file paths (master plan, all phase plans, codebase review) with "Read these fully before judging"; the reframing line "You are reviewing PLAN DOCUMENTS, not a code diff — your verdict is about whether the PLAN will produce code that passes your gate"; the per-reviewer dimension brief; the depth instruction "think hard before rendering your verdict — reason through the plan's weakest points before concluding"; the recall instruction "Report every finding including low-severity/uncertain ones with a confidence + severity; do not self-filter"; and the verdict format `PASS / NEEDS CHANGES / BLOCK` with each finding naming the plan file + section.

**6c. Run** — spawn the Critical-Path reviewers in parallel (read-only over the same frozen draft); when all return, spawn the generalist reviewer last with their verdicts attached and the brief: "Simulate executing this plan phase-by-phase as each Owner agent. Flag every task an implementer could not complete from the plan text alone. Then run your pre-mortem: assume the plan shipped and failed in production — every likely cause must map to an existing task/spec in some phase, else it's a finding. Think hard through the simulation and the pre-mortem before rendering the verdict. Consolidate all findings, write `docs/progress/<feature>-plan-review.md`, verdict READY / NOT READY."

**Paste-fidelity self-check — before sending each spawn prompt (6b, the 6c generalist, and a lean merged spawn alike):** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

**6d. Fix and converge** — fix every confirmed finding; re-run Step 5.5 if a table changed; re-spawn only the reviewers that returned NEEDS CHANGES/BLOCK. Max two rounds; surface residuals to the user after round two. Record every spawn in the Plan Review Log.

**Fallback** — if a selected reviewer agent is missing, fall back to a `general-purpose` review that walks the same checklist and note the absence in the report.

**Boundary** — this gate verifies the *plan*. The same reviewers re-run against shipped code in `/start-teams` and `/review-phase`. A plan-gate PASS discharges nothing at code time.

### Step 7: Summary
Report the plan files created, the Critical Paths touched, the plan-review verdict, any fired Stop Conditions, and the handoff: "Run `/start-teams <feature>` to implement."

**Offer to journal a load-bearing plan decision** if the plan settled a real trade-off — an approach chosen over a named alternative, a deferral accepted, a Stop Condition resolved a particular way. Offer **once**, never silently: *"Record this choice in `DECISIONS.md`?"* — one line per the decision-journal convention (`using-the-pack`): `- <today, YYYY-MM-DD> — <chose X over Y> for <feature> — because <why>` (a pointer to the plan, never a copy of it). Skip it when the plan raised no genuine fork.
