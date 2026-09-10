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
From `CLAUDE.md`'s Critical-Path table, spawn **every** reviewer agent whose path this phase touched, read-only, briefed with the diff scope, the declared *least-confident* line(s) — read them from the phase plan's *Least confident* line and the progress ledger's `least-confident:` entries (read its `started` and `escalated:` lines in the same pass — they feed the card's *Session model* row), briefed as "probe the declared weakest bet first" — and "think hard before rendering your verdict". Include the exact typecheck/lint/test results already observed in Step 2, and say that the reviewer may independently run any validation it distrusts and must state when it does. If no declaration exists anywhere (plans authored before this line was introduced), note the absence on the report card and proceed — never manufacture one, and absence alone is never a gate failure. Before spawning, also read the phase plan's *Reachability* line and `docs/progress/<feature>/deferred-findings.md` if it exists — re-brief any entry whose activating phase is this one (see *Where a deferred finding goes* below). Collect each verdict (PASS / NEEDS CHANGES / BLOCK) with file:line findings. Run the generalist/qa reviewer last to consolidate.

**A round is any reviewer spawn after the first verdict — whatever you name it.** "Focused confirmation", "sign-off check", "narrow re-read" and "just re-confirming X" are all rounds and all count. **Max two rounds** (counted per gate, not per reviewer — a round re-runs every still-failing reviewer at once), then **stop**: surface the residuals to the person (one line each, with severity and your recommendation) and let them decide. **Round three requires their explicit go-ahead, asked for at that moment** — never assume it. If you find yourself inventing a label so a spawn doesn't feel like a round, you have already blown the budget.

*(This is the independent review lane: read "fix" in the next paragraph as **record and route** — the lane rule two paragraphs down governs.)*

**Severity decides whether a reviewer re-runs at all.** Fix every confirmed finding. Then: **`BLOCK` or High** → re-run **only the failing reviewer** — that is what a round is for. **Medium, Low, Info, and every comment / typo / doc-table / test-quality finding** (test quality meaning naming, layout, duplicated setup — never a missing or non-asserting test) → fix them, **batch them into the commit**, and list them on the report card as *fixed without re-review*. **Do not spawn a reviewer to confirm a comment fix** — re-reviewing cosmetic fixes is the single most expensive habit a gate has, and it is waste, not rigour.

**Which lane you are in decides who fixes.** In a **build lane** (`/implement`, `/start-teams`) the fix happens in this lane — you make it in `/implement`, the re-spawned implementer makes it in `/start-teams` — so a reviewer whose only open findings were Medium-or-below — all fixed in the same commit — is recorded **PASS**, with those fixes listed as *fixed without re-review*. In the **independent review lane** (`/review-phase`) you verify and do not fix: Medium findings are recorded on the card, routed to the build lane, and set the tier to **Almost**; Low and Info are recorded and never move the tier — never a re-review spawn, and never a silent PASS. READY still requires the Medium findings closed; they close in the build lane, not by spawning another reviewer here.

**Reviewer vocabulary maps onto this filter:** ❌ BLOCK is BLOCK; ⚠️ CHANGE is High unless the reviewer itself rates it Medium or lower, or it is one of the cosmetic kinds listed above (a comment, typo, doc-table or test-quality fix); 💡 NOTE is Info. A security reviewer's own CRITICAL / HIGH / MEDIUM / LOW ratings are used as-is.

**Announce the spend before it happens; total it after.** Before the gate, say how many reviewer agents are about to run and why — `Gate: 2 reviewers — security-reviewer (new endpoint), code-reviewer (consolidating)`. On the report card, state the total for the phase. Cost a person cannot see is cost they cannot choose to avoid.

**Convergence stop-rule.** If a round's new findings are mostly defects the *previous round's own fixes* introduced, the work is not converging and another round will not fix that. Stop revising: surface the residuals with that observation stated plainly, and prefer shipping the thinnest reachable slice over one more fix round.

**Review the repair, not only the changed line.** For High/BLOCK or repeated same-invariant findings, read the owner's repair brief (in the ledger or working card). Challenge the violated invariant, causal explanation, bounded affected population/discovery query, original reproducer, sibling/boundary cases, correction and failing-before/passing-after proof. If a relevant source or assertion changed after the fix, route it for review again; a semantic fix needs a fresh look at its affected scope. Cosmetic Medium-or-lower fixes can keep the no-re-review exception only with relevant validation and a recorded resolution.

**Zero touched Critical Paths still requires an independent generalist.** A role or model name alone proves nothing about context separation — the reviewer must run in a context genuinely separate from construction.

**Order findings by reachability.** A finding against code that **no user path reaches yet** is recorded as a backlog item against the phase that will make it live — not as a blocker on this phase. Unreachable means the phase plan's *Reachability* line says so, or the master plan's *Deferral Ledger* names the receiving phase — a reviewer's own guess that nothing calls it yet is not enough. Two exceptions never defer: anything a security reviewer rates **High or above**, and anything that can **lose or corrupt data**. The gate still runs and every finding is still written down with its evidence; what reachability changes is the **order and the blocking status**, never whether the path was looked at. A properly filed deferred finding is recorded on the card and does not count toward the reviewer's verdict or the tier. This deferral channel is `/review-phase` only — the build lanes' gates block on every finding as before.

**Where a deferred finding goes, and how it comes back.** Append it to `docs/progress/<feature>/deferred-findings.md` (append-only; created on first entry) as one line: `- <YYYY-MM-DD> — <finding, one sentence> — <file:line> — activates with: <capability> (<feature> phase <N>)` — the phase is the one named in the master plan's *Deferral Ledger* row when one exists; the capability half is what a later plan for a different feature matches on. Two readers bring it back, so it cannot be lost: **`/create-plan` Step 3** reads every feature's file (`docs/progress/*/deferred-findings.md`) and picks up each entry whose `activates with:` names a capability this plan builds, and **`/review-phase` Step 4** opens this feature's file before spawning reviewers, whenever it exists, and re-briefs every entry whose activating phase is the one under review — those findings re-enter this gate as ordinary findings, at their original severity; mark the line `— re-entered <date>` when it is re-briefed and `— done` once the finding is closed (readers skip `— done` lines; the review file tracks a re-entered finding until then). Report the counts on the card's *Deferred findings* row: filed, re-entered, still pending. A deferred finding with no activating phase named is not deferrable: it blocks. On a phase plan written before this field existed, there is no *Reachability* line to read — say so on the report card and review normally; a missing line is never itself a finding on an older plan.

**Lean gate (`Gate intensity: lean` in `CLAUDE.md`) — consolidate, never skip.** Under lean, the per-path reviewers merge into **one merged reviewer run**: spawn the generalist reviewer (or `general-purpose`, the same type the missing-reviewer fallback sanctions) once, read-only, briefed with the diff scope, the declared *least-confident* line(s) ("probe them first"), "think hard before rendering your verdict", and each touched path's numbered checklist pinned **verbatim from that path's reviewer agent file** (paste-fidelity applies to each pinned checklist) — rendering PASS / NEEDS CHANGES / BLOCK **per path**, max two rounds (a lean re-run is a round like any other, per the round definition above); a re-run is the merged run scoped to the failing paths' checklists. The merged run is also the consolidation — no separate generalist spawn. Per-agent `model:` pins don't ride along in a merged run — explicitly request the strongest model the account exposes. A reviewer's `effort: max` frontmatter likewise doesn't ride along a merged run, and (unlike `model:`) has no per-dispatch override — so the merged run executes at session effort, with the "think hard" brief above as its effort lever. That is the accepted lean trade: lean already swaps separate-gate rigor for one consolidated pass. Under lean the advisory simplification pass below is skipped (it is advisory-only, never a gate); the production-readiness trigger is unchanged. Write "gates ran lean (consolidated)" on the report card — lean is never silent. Lean changes how many agents run, never what is checked.

**Auto-escalate — lean never thins the riskiest phases.** A phase touching a Critical Path marked `yes` in the project's **`Full gates?`** column runs at full intensity even under `Gate intensity: lean`: those paths get their own separate reviewers, not the merged run. The person saying **"full gates on this one"** (or asking for full gates in plain words) escalates the phase the same way, whatever the line says. An absent `Gate intensity:` line, an unresolved `⟨lean | full⟩` placeholder, or any unrecognised value means **full** — the safe direction. A table with no `Full gates?` column marks nothing — nothing escalates, and that is not an error; say so once on the report card, so lean is never silently thinning an auth or money path. Say which paths escalated on the report card. Lean's savings come from the cosmetic and single-path phases, which is where the waste actually is.

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
**Overall: Ready | Almost | Not yet** — <one plain sentence: what's done, what (if anything) blocks shipping>. **Ready here means locally ready for release, never that a release happened** — never say "shipped" or "deployed" unless deployment actually occurred with recorded authorization; that is `/release`'s job, not this card's.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (typecheck/lint/test) | Ready / Not yet | <e.g. all green — or `baseline 12 failing → 9` on a brownfield repo> |
| <Critical-Path reviewer> | Ready / Almost / Not yet · <grade> | <plain summary> |
| Acceptance criteria | 6/7 PASS | <which one fails, if any> |
| Least-confident probe | held / broke / not declared | <the declared weakest bet and what the probe found — or "no declaration (pre-dates this line)"> |
| Definition of Done | met / not met | <gap if any> |
| Reviewer spend | N reviewers · M rounds | <how many reviewer agents ran, and how many times any had to run again — this gate's cost, announced before it started> |
| Session model | <model> · effort <level> / unknown — not exposed to this session | <the model the implementers and the gates ran on — read from the ledger's `started` and `escalated:` lines, never guessed — so round counts can be compared across tiers later; name any reviewer dispatched on a different model; "not recorded (pre-dates this row)" on an older card> |
| Fixed without re-review | <count> | <small items (typos, comments, minor tidy-ups) recorded here and routed to the build lane, where they ship without a reviewer looking again> |
| Release status | local Ready / not released | <"Ready for your release process" at most — link to `/release` when the person wants to ship; never claim deployment this command didn't perform> |
| Tail diff check | <N> lines / not triggered | <from the build ledger/evidence; fast-lane cards record directly; "not recorded (pre-dates this row)" for older work; this row is reporting-only> |
| Reachability | reached / not yet — lands in <phase> / not declared | <can a person use this phase's work today? If not, which phase makes it usable — "no Reachability line (pre-dates this field)" on an older plan> |
| Deferred findings | <filed> filed · <re-entered> re-entered · <pending> pending | <findings against not-yet-reachable code, parked in deferred-findings.md with the phase that brings them back — or "none"> |
| Gate intensity | lean (consolidated) / full | <which paths escalated to separate reviewers, or "none" — "not set, running full" when the line is absent; "no Full gates? column — nothing escalates" when the table lacks it> |

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
