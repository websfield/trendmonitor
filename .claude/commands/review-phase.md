---
description: Mandatory phase review — walk a phase plan's Acceptance Criteria row-by-row, run the Critical-Path reviewer gates, audit the Definition of Done, and write the review to docs/progress/. Do NOT use to audit the whole codebase — that's /audit.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, Agent
---

# Review Phase

Independently verify that a shipped phase actually satisfies its plan — separate from the agent that built it. This is the gate that converts "the code compiles" into "the phase is done".

## Usage
```
/review-phase [feature-name] [phase-number]
```

## How it learns the project
- The **phase plan** at `docs/plans/<feature>-phase-<N>.md` — the Acceptance Criteria and Completion Criteria are the rubric.
- **`CLAUDE.md`** — the Critical-Path → reviewer mapping and the Definition of Done.
- **`.claude/agents/`** — the reviewer agents to spawn.

## Process

### Step 1: Establish the diff scope
Determine what this phase changed (git diff against the phase's start point, or the *Files to Create / Modify* table). List the files in scope.

### Step 2: Entry gate
Confirm `typecheck` + `lint` + `test` are **clean** on the current tree (run the project's real scripts): green, or — when a brownfield baseline exists (`docs/progress/entry-baseline.md`, recorded on a repo that was already red) — no new failures vs it (no failing identifier it doesn't already record, no count above it). When passing by baseline, note the ratchet movement for the report card (e.g. `baseline 12 failing → 9`) — an improving run also rewrites the baseline down, and an all-green run retires it (the standard reverts to plain green). If not clean, the phase is NOT ready — report the new failures and stop; there is nothing to gate yet. (Red with no baseline recorded, and the failures look older than this phase? Say that `/go` — or `/implement` / `/start-teams` directly — will offer to record a baseline at its entry gate; recording one is the person's call, made there, not here.)

### Step 3: Acceptance Criteria walk (row by row)
For **each** Acceptance Criterion in the phase plan, render PASS or FAIL with concrete evidence (file:line, test name + result, or screenshot path). A criterion you cannot evidence is a FAIL, not a pass-by-default. Quote the criterion, then the evidence, then the verdict.

### Step 4: Critical-Path reviewer gates
From `CLAUDE.md`'s Critical-Path table, spawn **every** reviewer agent whose path this phase touched, read-only, briefed with the diff scope and "think hard before rendering your verdict". Collect each verdict (PASS / NEEDS CHANGES / BLOCK) with file:line findings. Run the generalist/qa reviewer last to consolidate.

**Lean gate (`Gate intensity: lean` in `CLAUDE.md`) — consolidate, never skip.** Under lean, the per-path reviewers merge into **one merged reviewer run**: spawn the generalist reviewer (or `general-purpose`, the same type the missing-reviewer fallback sanctions) once, read-only, briefed with the diff scope, "think hard before rendering your verdict", and each touched path's numbered checklist pinned **verbatim from that path's reviewer agent file** (paste-fidelity applies to each pinned checklist) — rendering PASS / NEEDS CHANGES / BLOCK **per path**, max two rounds; a re-run is the merged run scoped to the failing paths' checklists. The merged run is also the consolidation — no separate generalist spawn. Per-agent `model:` pins don't ride along in a merged run — explicitly request the strongest model the account exposes. A reviewer's `effort: max` frontmatter likewise doesn't ride along a merged run, and (unlike `model:`) has no per-dispatch override — so the merged run executes at session effort, with the "think hard" brief above as its effort lever. That is the accepted lean trade: lean already swaps separate-gate rigor for one consolidated pass. Under lean the advisory simplification pass below is skipped (it is advisory-only, never a gate); the production-readiness trigger is unchanged. Write "gates ran lean (consolidated)" on the report card — lean is never silent. Lean changes how many agents run, never what is checked.

**Simplification gate (advisory).** Also spawn the `simplification-reviewer` (read-only, same diff scope) — an additive voice that hunts over-engineering only (delete / stdlib / native / yagni / shrink). It judges **means, never coverage**: fold its findings into the consolidation, but apply a cut **only if coverage stays identical**. It never flags a test, guard, or edge case for removal, never reduces the Definition of Done, and cannot block or downgrade a completeness PASS. When leanness and completeness conflict, completeness wins. It is not a Critical Path, so its absence is never a gate failure — note it on the report card as advisory only.

**Production-readiness gate (on demand).** *Additionally* spawn the `production-reviewer` agent when production quality is in scope — i.e. the person asked for it (e.g. "make this production-ready", "ship to prod", "harden for production", "go live"), or `CLAUDE.md` / `NORTH_STAR.md` declares the project a production target. It is **not** run on every phase by default. When it runs, treat its verdict as a gate like any other and include it on the report card.

**Fallback** — missing reviewer agent → inline review walking that path's checklist yourself; note the absence.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

### Step 5: Definition of Done audit
Walk the phase plan's Completion Criteria and every item in the project's **actual** `CLAUDE.md` Definition of Done — the project's list governs, not a generic one. Flag any unmet item (typical items: tests-in-same-commit, mandatory specs the project defines, docs/config updated, progress table updated).

### Step 6: Write the review
Write `docs/progress/<feature>-phase-<N>-review.md`. **Lead with a plain-language report card** anyone can read, then the evidence below it:

```markdown
# Phase <N> review — <feature>

## Report card
**Overall: Ready | Almost | Not yet** — <one plain sentence: what's done, what (if anything) blocks shipping>

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (typecheck/lint/test) | Ready / Not yet | <e.g. all green — or `baseline 12 failing → 9` on a brownfield repo> |
| <Critical-Path reviewer> | Ready / Almost / Not yet · <grade> | <plain summary> |
| Acceptance criteria | 6/7 PASS | <which one fails, if any> |
| Definition of Done | met / not met | <gap if any> |

**Top things to fix (in order):** <1–3 plain-language items, or "none">

*Ask `/go` to explain any finding in plain words — or to just fix them.*
```

Before writing the card, self-check it: the **Overall** line is the first thing a reader sees; every *Top things to fix* item says where (file:line); and a person reading *only* the card knows exactly what to do next (the standing footer closes that loop — a card missing it fails this check). If any of the three fails, fix the card, not the standard.

A card that passes that self-check, and one that fails it — same review, opposite outcome for the person reading it:

*Good* — showing just the three self-check points, not the whole card (verdict leads, each fix names where, the footer gives a next move):
```markdown
**Overall: Almost** — the feature works and every test passes; one reviewer wants a fix before it ships.

**Top things to fix (in order):**
1. `auth/login.ts:42` — the password check runs before the rate limiter, so account lockout can be bypassed.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
```
*Why it works:* a non-expert reads the tier first, sees exactly which line to fix, and knows their next move.

*Bad* — same findings, unreadable to the person who needs them:
```markdown
## Report card
code-reviewer: NEEDS CHANGES (auth path); security-reviewer: PASS; DoD nominal.
Recommend hardening middleware ordering and revisiting the token TTL invariant.
```
*Why it fails:* the tier a person acts on is missing entirely — replaced by reviewer jargon (NEEDS CHANGES / DoD / TTL invariant); no fix cites a file:line, and there's no next step — the reader can't tell whether they can ship or what to do.

Then the detail: diff scope · entry-gate result · the Acceptance Criteria walk (row by row, with evidence) · each reviewer's readiness headline + findings · Definition-of-Done audit. The **Overall** is the *worst* tier across all gates (any Not-yet ⇒ Not yet; any Almost with no Not-yet ⇒ Almost; all Ready ⇒ Ready) and must equal the binary verdict (`Ready` = READY, anything else = NOT READY). The Ready/Almost/Not-yet tier is the pack's one user-facing vocabulary — it's what the person acts on; reviewer-internal verdicts (PASS / NEEDS CHANGES / BLOCK, READY / NOT READY) are machinery and always agree with it. On a re-review after fixes, show the movement (e.g. "Not yet → Ready"). Update the master plan's *Progress Tracking* row only if READY. This Ready review file is itself the **proof of completion** a dependent phase gates on; if a progress ledger is in use (`docs/progress/<feature>/ledger.md`), append the verdict to it (append-only, convenience only — never gated on in place of the evidence).

## Hard rules
- Never mark a criterion PASS without cited evidence.
- Never skip a reviewer gate for a touched Critical Path.
- A gate's verdict exists only if the reviewer actually ran (or the declared inline fallback was walked). Reporting a gate as passed without the run is fabricating the verdict, not reviewing.
- READY requires: a clean entry gate (green — or no new failures vs the recorded brownfield baseline, with the ratchet shown on the card) **and** every Acceptance Criterion PASS **and** every reviewer gate PASS **and** the Definition of Done met. Anything less is NOT READY.
