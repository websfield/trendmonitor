---
description: Execute an implementation plan phase-by-phase yourself (no team spawning), with the project's Critical-Path reviewer gates and the CLAUDE.md Definition of Done. Includes the fast lane — a small, clear change (a shaping brief that names its exact surface) ships with no plan documents at all, through the same gates.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Implement (single-driver execution)

Execute an existing plan **yourself**, phase by phase, instead of spawning a specialist team. Use this for smaller plans, or when you want the main session to do the work directly while still passing through the same gates `/start-teams` enforces.

> Prerequisite: a master plan + phase plans with a current independent plan-review verdict covering the accepted contract. An unreviewed material plan cannot enter this lane: run `/create-plan`'s review gate first. If no plan exists, use `/create-plan <feature>` — **unless** the ask qualifies for the **Fast lane** below, the one mode that runs without a plan.

## Usage
```
/implement [feature-name] [optional: phase number]
```
`/implement <feature>` with no plan on disk but a clear-and-contained brief at `docs/plans/<feature>-brief.md` enters the **Fast lane** below.

## Durable evidence for both solo lanes

Follow canon §§1–4 for the compatible helper pair, one state writer and the manual bridge. Use
`node .claude/scripts/workflow-state.js <verb>` with one JSON object on stdin. Every request has
`projectRoot` (the actual absolute project path) and `goalDirectory` (`docs/progress/<one goal>`);
every mutation has the last observed `expectedRevision`. Only `init` uses revision 0. Request
text and paths are JSON data, never interpolated shell expressions. Use literal-input quoting
appropriate to the host; any scratch request file stays outside the declared project inputs.
The CLI runs no check, reviewer or hook. Keep the existing quick card/ledger as the readable handoff.

**Open or resume.** Call `status` for the selected record, read its immutable contract/reports and
reconcile the brief/plan, source inputs, findings, authorization and consumed attempts before
continuing — canon §1's cold-handoff rule: reconcile current state before picking work back up,
never from memory. Retain its UUIDs; renaming, resumption or amendments never call `init` again.
Missing/legacy/invalid state follows canon §1. Plan review remains a separate prerequisite; its
report is not build evidence.

**Initialize only an inspected authorized goal.** Preserve original requirement wording and
criterion IDs (assign stable local IDs only where absent, mapping the existing accepted wording).
Map every real entry check, Critical-Path checklist, acceptance criterion, integration/reachability,
required docs/config and actual DoD. Add independent `production` obligations when triggered.
Zero paths still requires the generalist. Lean may group non-separate review obligations while
retaining every checklist/verdict; use a distinct final obligation only where the lane needs one.
The `init` stdin shape below is illustrative; replace every placeholder and the obligation set
with inspected facts. It supplies neither authorization nor a completed assessment:

```json
{
  "projectRoot": "<actual absolute path>", "goalDirectory": "docs/progress/<stable goal>",
  "expectedRevision": 0, "title": "<accepted goal>", "lane": "fast",
  "acceptanceScope": ["A1"],
  "contract": {"content": "<accepted wording and checklist/obligation mapping>", "sources": []},
  "authorization": {"reference": "<actual authorization>", "scope": ["build", "checks", "reviews", "docs"]},
  "owner": {"ownerId": "<stable owner>", "contextId": "<observed constructor context>"},
  "execution": {"sessionId": "<observed session>", "disposition": "running"},
  "scope": {"roots": ["<relevant source/dependency directory>", "<assertion directory>", "<docs/config/checklist paths>"], "dependencyKnowledge": "unknown"},
  "phases": [{"key": "p1", "title": "<accepted phase or fast goal>", "gates": [{
    "key": "g1", "budget": {"history": "known", "consumedBatches": [], "reference": "new goal — no prior review history"},
    "obligations": [
      {"key": "check", "kind": "check", "coverage": ["A1"], "command": "<actual check command>"},
      {"key": "review", "kind": "review", "coverage": ["A1"], "role": "code-reviewer", "final": true},
      {"key": "acceptance", "kind": "acceptance", "coverage": ["A1"]},
      {"key": "integration", "kind": "integration", "coverage": ["A1"]},
      {"key": "docs", "kind": "docs", "coverage": ["A1"]},
      {"key": "dod", "kind": "dod", "coverage": ["A1"]}
    ]
  }]}], "nextAction": "<next authorized action>"
}
```

Use `lane:"planned"` and the actual phases for a plan. Fast work has one internal phase, with no
master or phase-plan files. Every obligation's `coverage` names the accepted IDs it serves; this
example is not a six-obligation ceiling. Use only actually authorized scope values and observed
context/session identities.

**A genuinely new goal is `"history":"known"` with an empty `consumedBatches` and a real reference,
as above** — there is no prior allowance to inspect, and saying so is the honest record. Reserve
`"unknown"` for imported or legacy work whose retained history you have not inspected yet: unknown
history stays unknown and **blocks every reviewer dispatch** (`UNKNOWN_BUDGET`) until you inspect it
and amend. Do not start a new goal at `"unknown"` — it stops the first review and asks the person to
confirm the review history of work that did not exist a minute ago. Inspected legacy imports
additionally use `legacyInspection:{reference}` while preserving originals.

Populate `contract.sources` with the accepted brief/plans and related contract files as
`{path,projectionBlocks:[]}`. Before initialization, put uniquely named start/end markers around
only generated card/ledger/progress content, declaring each exact pair via
`{path,projectionBlocks:[{start,end}]}`. Keep acceptance and decisions outside that generated block.
Only its interior is ignored. Include relevant directories to discover additions/renames/deletions,
plus assertions, product docs, checklists and config. Unknown impact uses the broad declared scope;
narrow obligation `roots` require complete dependency knowledge and `dependencyJustification`.
Never exclude all docs or `.claude`, or treat a contract edit as generated output. On successful
`init`, explicitly Read `workflow.json` and retain its UUID maps and revision.

**Reserve, execute, record.** Before any assessment use `reserve-attempt`: non-review work sends
`{gateId,mode:"run",obligationIds:["<actual obligation UUID>"]}` with the common fields. Reviews
first reserve the complete `{gateId,mode:"batch",batch,slots:[{key,obligationIds,role,after:[]}]}`
schedule, including production and any separate final consolidator, then reserve the particular
`{gateId,mode:"run",slotId}` immediately before dispatch. Retain `ids.attemptId` and the returned
assessment `fingerprint.digest`; explicitly Read the saved reservation before the actual command/
review. Reviewers are read-only, briefed with accepted scope/checklists, frozen inputs, observed
checks, current findings and the weakest-bet probe. They return actual reports and provenance.

After that assessment, `record-evidence` receives the common root/goal/current-revision fields and
`{attemptId,goalId,gateId,slotId,obligationIds,preFingerprint,postFingerprint,result,report:{content},
observed:{contextId,dispatchId,sessionId,provenance:"observed"},startedAt,finishedAt}`. Use exact
reserved identities/coverage; `slotId:null` is for non-review work. Keep actual timestamps/output.
Use `PASS|FAIL|UNVERIFIED|INTERRUPTED` from the evidence; review/production also keeps the actual
`rawVerdict` and needs independent PASS/READY for PASS. Checks add the declared `command` and real
integer `exitCode`; PASS requires zero. Record actual `requested:{model,effort}` and exposed
`capabilities:{model,effort}` when available (unknown values are null), never guessed runtime facts.
`report:{path:"evidence/<file>"}` may instead import a report directly within this goal's evidence
directory. Retain the returned immutable receipt/report references; never edit them after saving.

For unchanged inputs, pass the reserved digest as the **expected** post digest. The helper
re-enumerates actual inputs and rejects a mismatch; copying that value is not a claimed independent
post-hash measurement. For interrupted/unverified work, call `status` with the common root/goal
fields and `attemptId`. Its `attemptAssessment` returns `{attemptId,preFingerprint,
currentFingerprint,currentMatchesReserved,status}` for that exact assessment. Retain the original
preFingerprint and use the current digest as the expected postFingerprint; the global top-level
fingerprint is not interchangeable. Inputs that changed during a run cannot support PASS/FAIL.

Terminalize actual interrupted/refused/uncertain attempts with INTERRUPTED or UNVERIFIED. If the
host exposed no reliable lineage, use `observed:{provenance:"unknown",contextId:null,
dispatchId:null,sessionId:null}` plus `reconciliation:{disposition:"launch-refused"|"interrupted"|
"unverified",reason,reference}`. Retain every actually known identity, the raw verdict/partial
report and actual observed launch-window timestamps; absent rawVerdict/command/exitCode may be
null for these terminal outcomes. Never invent a run, exit or independent context. This records
uncertainty without successful proof and retains the consumed attempt/slot/batch. A known dispatch
cannot be replayed; another evaluation needs a remaining authorized retry. `mode:"unavailable"`
retires only an unused slot, not a reserved actual attempt.

If currentFingerprint is null because scope cannot be read/validated, preserve the pending attempt
and report, repair the named access/integrity issue or report the manual limitation; do not submit
null as a digest. Older/partial APIs without the attempt query keep that same hold. A failed
mutation means inspect status and reconcile; never blindly repeat it or reset the gate's history.

**Amend and resolve.** Use `amend` with `{reason,change:{type:"contract",contract:{content,sources},
acceptanceScope}}` for an accepted amendment, or `{reason,change:{type:"obligations",gateId,add:[...]}}`
for newly owed coverage. New constructor contexts append `{reason,change:{type:"owner",owner:
{ownerId,contextId}}}` with a new owner identity; previous constructors never become independent.
Session/disposition changes follow `/go`; confirmed history/extensions follow canon §3. Create
findings through `record-finding` with `{gateId,severity,classification,invariantId,description,
ownerId,parentFindingId?,risk?}`. Updates use `{findingId,reason,disposition,proofReceiptIds,repair?,risk?}`
and actual proof under canon §4. Preserve original IDs, versions, scope and failed findings.
Optional `risk:{security:"yes"|"no"|"unknown",dataLoss:"yes"|"no"|"unknown",reference}` records
actual assessed facts; absence is unknown. Known yes facts stay yes and retain their history.
The class-repair object uses `{invariant,cause,population,query,reproducer,siblings:[...],correction,
before,after}`; `before` is the actual failing check receipt ID and `after` the current passing
check receipt ID. High/related/reopened findings also need current independent review proof.

For an approved brownfield ratchet, preserve actual nonzero validator results. If the project
already supplies an approved baseline-comparison command, declare that exact command as a check
and retain its real exit/output plus underlying failures. Do not invent a comparison command or
recode failure as PASS. Without one, explain the valid manual ratchet separately; helper Ready
for that entry condition remains unavailable.

**Close.** After source/assertion/docs/config fixes, call `status`, execute and record missing/stale
checks and independent coverage, and perform actual acceptance/integration/docs/DoD assessments
with their reservations/receipts. Required scope never disappears because a receipt is missing.
Invoke `close` with the common fields and optional actual `phaseId`; inspect its readiness and
assessmentScope. A phase-only Ready leaves whole-goal readiness unevaluated: inspect whole-goal
status and continue authorized remaining phases. Update only generated completion projections.
Pause/wait records preserve scope and next action; never amend execution directly to complete.
Before beginning an authorized planned phase after its dependencies pass, use `amend` with
`{reason,change:{type:"phase-entry",phaseId,reference}}` and the common fields. It requires running
disposition/build authorization and reactivates findings assigned to this phase under their original
IDs/gates/budgets. Re-brief their retained findings, ownership and reachability evidence. Activation
increments the proof version and clears pre-activation resolution proof; it does not invent a new
defect recurrence. Perform fresh applicable check/review proof in the ORIGINAL gate's remaining
allowance, even when the receiving phase has a different gate. Never use its fresh allowance for an
old finding or defer an activated finding again. Planned independent `/review-phase` owns creation
of named deferrals; the build lane keeps its existing finding policy. Unrepresented manual cosmetic
equivalence or older helper behavior remains explicit and cannot manufacture helper Ready.

## Fast lane (small changes — gates without the paperwork)

For a small, clear change, the plan documents are overhead the discipline doesn't need — but the gates still are. The fast lane skips the artifacts (codebase review, master plan, phase plans, plan-review gate) and keeps **every gate**. `/go` drives it automatically when `/shape` classifies an ask clear-and-contained; it also runs directly from a clear-and-contained brief (see Usage above).

**Admission test — ALL must hold. Any failure routes out — each bullet names where:**

- **(a) The project is set up.** `CLAUDE.md` is filled (not the skeleton), with a Critical-Path → reviewer mapping derived from this project. Do not invent a path for a small repo: zero touched paths still receives an independent generalist under canon §10. On a skeleton, run `/bootstrap-claude-pack` first.
- **(b) A clear-and-contained shaping brief with a `Surface:` line** — the closed, named set of files/components/routes (or one mechanical pattern applied uniformly). No brief, or no nameable surface → `/shape` first.
- **(c) Nothing irreversible.** No new dependency, no data migration, no destructive or one-way operation. Any of those → plan it: `/create-plan <feature>`.
- **(d) A single-sitting unit of work** — no phases, no handoff contracts. Bigger than that → plan it: `/create-plan <feature>`.

**Process:**

0. **Checkpoint snapshot:** run the plan lane's Step 2 "Checkpoint snapshot" step first (consent ask included) — the fast lane skips paperwork, not the safety net.
1. **Implement inside the named surface.** The `Surface:` line is the boundary — it stands in for the plan's *Files to Create / Modify* table. In place of a phase plan's pinned-conventions block, read `CLAUDE.md`'s golden rules, the non-negotiables that apply, and every **Lessons** entry touching this ground — the main session can read them directly; the pinned block exists for spawned agents, which the fast lane's implementer isn't. Test-first where practical; the plan lane's Step 2 evidence rule holds — a claim without a run is "not verified yet", never "done".
2. **Entry gate.** Open/resume the durable record above when supported; reserve the real entry assessments and record their actual results. The project's typecheck + lint + test clean **before** any reviewer runs — green, or no new failures vs a recorded baseline (the plan lane's Step 3 rule and the helper/manual ratchet distinction above).
3. **Reviewer gate.** First write your one-line *least-confident* declaration — the plan lane's Step 2 *Declare your weakest bet* rule; with no ledger in this lane, the line goes straight into the reviewer briefing and onto the Step 5 card. Then spawn **every** reviewer whose Critical Path the diff touched, per the plan lane's Step 4 briefing discipline and `.claude/gate-rules.md` §§1–§16. **Zero touched paths → run the generic `code-reviewer` on the diff instead** — no change ships reviewer-less. **Production intent** (the person's words signal it, or `CLAUDE.md`/`NORTH_STAR.md` declares a production target) → `production-reviewer` joins the set, same trigger as `/review-phase`'s on-demand gate.
4. **Definition of Done.** Apply the plan lane's Step 5 final freshness check after all fixes; then walk `CLAUDE.md`'s actual DoD items that apply to this diff (tests in the same commit, mandatory specs, docs updated, …). The DoD is a gate, not paperwork — the fast lane skips artifacts, never the DoD.
5. **Report card.** Write `docs/progress/quick/<yyyy-mm-dd>-<slug>.md` in `/review-phase` Step 6's card format and present it plainly. The acceptance rubric is the brief itself: the *Chosen scope* one-liner satisfied, and the diff confined to the `Surface:` set — each cited with evidence (file:line / test name / command output), the same no-pass-without-evidence rule as a phase review. Card rows: entry checks · each reviewer · acceptance (brief satisfied, surface respected) · least-confident probe (the declared line and whether it held or broke) · Definition of Done · reviewer spend (N actual evaluations · initial batch 0 plus retries used / 2 — announced before dispatch, including failed/interrupted attempts) · session model (the orchestrating session model/effort when exposed, otherwise `unknown`, plus any visibly different reviewer dispatch request — never a guessed hidden runtime) · fixed without re-review (cosmetic Medium-or-lower items only, with relevant validation and recorded resolution) · tail diff check (`N lines` or `not triggered`) · fix-list accounting (for lists of at least five, total and done/undone; every item detailed below with `file:line` or undone reason) · gate intensity (lean or full, and which paths escalated) · reachability (does a user path reach this change — "not declared" is not an option here: the brief's `Surface:` line names the caller). The *Deferred findings* row does not apply — the deferral channel is `/review-phase` only; a build lane blocks on every finding.

No master-plan table or phase files. Before Step 3 dispatch, create or resume the quick card at the
Step 5 path as a **working record**, with this pending-only shape:

- **Overall: Not yet** — name the required evidence still owed and one next action.
- Original goal, accepted scope and authorization; stable continuing gate identity.
- Known consumed batches and remaining allowance, or **review history unknown**; fixed assessment
  inputs and every reserved specialist/final slot. Missing history is not unused allowance.
- Observed checks and acceptance evidence already obtained, with links; unrun checks stay pending.
- Reviewer result and findings: **not yet assessed** until an actual independent result returns;
  reviewer probe: **pending**; review-dependent DoD items: **not yet met**.
- Reserved slots, pending launches, observed started/completed/interrupted evaluations and any
  uncertain launches shown separately. Planned model/effort settings are labeled planned.

Never prefill PASS, zero findings, a held reviewer probe, completed DoD, actual review spend or
Ready as a temporary scaffold. Follow canon §2: mark the selected slot pending launch, save and
explicitly Read the reservation after its last edit before invoking the reviewer, even when a
Write/Edit hint says no Read is needed. Reconcile each invocation from actual tool evidence;
record model arguments exactly as requested under §6, with unresolved runtime values unknown.
On interruption, retain pending/started attempts for reconciliation before another dispatch.
Resume this same card and inspect the diff; a new session, command, model or slug cannot reset the
continuing gate's budget. Fill Step 5's result fields only from actual linked evidence as it arrives.
This is the fast lane's one compact record, not a separate ledger. Compared to `/review-phase`,
this lane skips the **advisory simplification pass** by design — advisory-only, never a gate.

With a compatible helper, this same card is derived from the helper's actual IDs, attempts, coverage
and scoped readiness; it is not another state writer or editable retry counter. **Report those in
plain words — never print raw UUIDs, digests or revision numbers on the card.** They are how the
record is keyed, not something the reader needs; name the check, the review or the missing evidence. Step 3 uses the assessment
transaction above before each reviewer, Step 4 records actual acceptance/integration/docs/DoD
assessments, and Step 5 presents `close` after checking its assessed scope.

**Escape hatch (the loophole-closer).** The moment the work wants to leave the named surface — a file not in the set, a new dependency, a migration — **stop, say so, and upgrade to the plan lane.** Never widen silently; catching yourself arguing the growth is small enough to absorb is the signal to upgrade. Mechanics: keep the working diff, tell the person what grew and why, update the brief's *Chosen scope* (or note the growth alongside it) so planning starts from the true scope, then run `/create-plan <feature>` — its codebase review meets the in-flight diff and phase 1 absorbs it; nothing is discarded.

## How it learns the project
Same as `/start-teams`: `CLAUDE.md` (rules, Critical-Path→reviewer map, Definition of Done), the phase plans (the contract), and `.claude/agents/` + `.claude/skills/` (the reviewers to run). Read what you need; never assume anything was injected for you.

## Process (the plan lane)

### Step 1: Load
Open/resume the durable record above. Initialization is neither plan approval nor predecessor proof;
retain the dependency gate below and inspect its current scoped evidence before building.
Confirm the independent plan-review evidence covers the current accepted master/phase contract, including material amendments. A READY label for older plan text is insufficient. Preserve the original acceptance scope, authorization and review history when reconciling changes; route an unreviewed material amendment to the existing plan-review gate before building it.
Read the master plan and the target phase plan(s). Build a `TodoWrite` list from the phase's *Implementation Tasks* table. Locate the **progress ledger** at `docs/progress/<feature>/ledger.md` (append-only timeline; create if absent) — you append one line per lifecycle event (`started: session model <observed name or unknown> · effort <observed level or unknown>` / `least-confident: <line>` / `entry-gate PASS`/`FAIL` / `reviewer <name>: <verdict> · dispatch model <requested name or inherit> · effort <requested level or inherit>` / `complete` / `blocked` / `residual`) so an interrupted session is resumable and the report card can be rebuilt. The `started` line records the orchestrating session; reviewer entries record only the dispatch posture visible to the orchestrator. A request, frontmatter pin, or `inherit` is not proof of a hidden runtime, and an unexposed value is `unknown`, never guessed. It is a convenience layer, never rewritten — proof of completion is the evidence on disk (Step 1.5), so a missing ledger never blocks authorized reading/building; unknown review history cannot supply unused allowance or completion proof.

### Step 1.5: Dependency gate (build only on finished work)
Read the target phase's *Depends on* line (default: the immediately preceding phase; `none` = independent). A predecessor counts as complete **only with proof on disk** — its phase review `docs/progress/<feature>-phase-<P>-review.md` marked Ready/READY, or its entry-gate + Definition-of-Done evidence under `docs/progress/<feature>/`. A `Complete` row in the master plan is a *claim*, not the proof. If any predecessor's proof is missing, the phase is **blocked, not started**: append a `blocked` line to the ledger naming it, surface it, and stop — never build on unproven work. Once startable, append a `started` line and proceed.

### Step 2: Implement the phase

**Honor existing authorization first.** If the person forbids git operations or has declined checkpoints, skip the snapshot and its consent question. A previous authorization remains applicable within its stated scope; never ask again simply because this is another phase or session.

**Checkpoint snapshot (opt-in, before the phase's first edit) — this is the canonical wording and mechanic; other commands point here.** In a git repo (`git rev-parse --is-inside-work-tree` succeeds), check `CLAUDE.md` for a `Checkpoints:` line. No line → ask **once**, plainly: *"Before each build phase I can save a git snapshot you can restore if anything goes wrong. Claude Code already auto-saves my own file edits (`/rewind` restores them); a git snapshot also covers what commands and code generation change. Want snapshots on?"* Record the answer as a `Checkpoints: on` / `Checkpoints: off` line (show the edit); `off` is never re-asked, and the recorded consent is what makes each later snapshot an *asked-for* git operation. When `Checkpoints: on`:
- Probe with `git status --porcelain` (untracked files count as **not** clean). **Dirty tree** → `git stash push --include-untracked -m "claude-jig checkpoint: <feature> phase <N>"` (in the fast lane, use the brief's slug in place of `phase <N>`) then immediately `git stash apply --index` — tree and staged state end unchanged; the named entry is the restore point. Announce by **name**, never by `stash@{0}`: "Snapshot saved as `claude-jig checkpoint: <feature> phase <N>` — to restore, ask me (or `git stash list` to find it, then `git stash apply <that entry>`)."
- **Clean tree** → push nothing, apply nothing (a clean-tree `git stash push` creates no entry, so a scripted apply would resurrect whatever unrelated stash sits at `stash@{0}`). Announce it plainly: "nothing unsaved to snapshot — your last commit (`<short-sha>`) is the restore point; to restore, just ask me."
- Snapshots accumulate in `git stash list`: at each snapshot moment, if an earlier phase's review has since landed READY, offer once to drop that phase's named snapshot — dropping destroys a restore point, so it is always an announced offer, never automatic.
- A recorded variant (e.g. `Checkpoints: on (work-branch)`) means the person chose their own mechanic — follow their stated preference exactly; never improvise one.
- If a snapshot fails, say so and pause for the person's call — never proceed as if saved.
- Not a git repo but `Checkpoints: on` recorded → say snapshots need git, and offer `git init` or flipping the line to `off`; the person decides.

Work the *Implementation Tasks* in order, respecting handoff contracts. For each task:
- Follow the *Project Conventions Pinned* block exactly. If a Critical-Path **skill** applies (e.g. an idempotency-ledger or isolation skill in `.claude/skills/`), invoke it before writing the relevant code.
- **Test-first where practical:** for each acceptance criterion, write the failing test *before* the behaviour (red → green) — a test written first catches building the wrong thing per-task; a test written after only confirms what was built. Either way, tests ship in the same commit as the behaviour, per the plan's test rows (including the mandatory idempotency-replay and isolation specs, if the project defines them).
- Stay inside the *Files to Create / Modify* table. Do not drive-by refactor adjacent code.
- **Self-review before the gate:** when the phase's tasks are done, re-read your own diff adversarially — assume defects exist, the way `/audit` does — against the *Project Conventions Pinned* block and the *Acceptance Criteria*, and fix what you find. A defect caught here costs seconds; the same defect at the reviewer gate costs a fix round.
- **Done only with evidence:** for each acceptance criterion, name the command or test you ran and its result — the command this project sanctions, run against the real target. A result from any other method is discarded and re-run before you report, never reported and corrected afterwards; if you did re-run, name both commands. A claim without a run is "not verified yet", never "done".
- **Declare your weakest bet:** after the self-review, write one line — the thing in this diff you're least confident about (the change you'd bet fails first). Append it to the ledger (`least-confident: <line>`) and hand it to every Step 4 reviewer, briefed to probe it first. Never "none" — every diff has a weakest point, and only its author knows where the guessing happened; the line turns that private knowledge into review depth.

**Repair a demonstrated defect class.** For a High/BLOCK or repeated same-invariant finding, record a compact repair brief before editing: violated invariant, causal explanation, bounded affected population and discovery query, original reproducer, sibling/boundary cases, proposed correction, and failing-before/passing-after evidence. Solo work can put this inline in the ledger; fast work uses its working card. Give it to the affected independent reviewer to challenge the population and whether the tests could detect the defect. A second recurrence or substantial defects introduced by fixes triggers one bounded owner/reviewer diagnostic exchange to reconcile the invariant and reproducer before another edit. Clarification creates no new verdict; a requested new verdict counts as an evaluation under the remaining allowance. Never weaken a check to manufacture green results or silently reduce the original acceptance scope.

### Step 3: Entry gate (ordering is mandatory)
Use the durable assessment transaction above for each actual entry check when supported; retain
the exact command/output and the approved-baseline distinction. Never dispatch reviewers on a
helper exit code alone.
Before this and each later gate, re-read the phase plan's *Project Conventions Pinned* block — a long session drifts; the plan does not. Run the project's `typecheck` + `lint` + `test` (discover the real scripts). They must be **clean before** any reviewer runs — the orchestrator supplies actual results, and reviewers may independently run any check they distrust. Clean = green, or — when a **brownfield baseline** exists (`docs/progress/entry-baseline.md`, recorded by bootstrap — or by this gate, below — on a repo that was already red) — no new failures vs it: no failing identifier it doesn't already record, no count above it; a failure this change introduced is always FAIL. A run that beats the baseline rewrites it down to the smaller set (downward-only, never up); the first all-green run deletes it — the standard reverts to plain green for good. If checks are red with no baseline recorded, ask **once**: do these failures pre-date this work? If yes, offer the pair together: record the baseline and proceed on this rule, **and** update `CLAUDE.md`'s entry-gate Definition-of-Done line to the ratchet-aware wording (show the diff; merge, never clobber) — without that second edit the Step 5 DoD audit still fails on the old "green" line. If they decline, the gate stays red. Capture the run under `docs/progress/<feature>/` and append an `entry-gate PASS`/`FAIL` line to the ledger, with any ratchet movement (e.g. `entry-gate PASS (baseline 12 → 9)`) or retirement.

### Step 4: Critical-Path reviewer gate
For compatible registered work, use current covered obligation IDs to identify owed assessments;
reserve the complete batch and each actual attempt above before dispatch. Read the saved state,
retain fixed inputs and reconcile returned or interrupted evidence without resetting this gate.
From `CLAUDE.md`'s Critical-Path → reviewer table, run **every** reviewer agent whose path this phase touched (N paths → N gates). Spawn them read-only, briefed with the diff scope, the Step 2 *least-confident* line ("probe the author's declared weakest bet first"), "think hard before rendering your verdict", the PASS / NEEDS CHANGES / BLOCK format, and the exact typecheck/lint/test results already captured in Step 3. Say that the reviewer may run any validation it distrusts and must state when it does. Append one `reviewer <name>: <verdict> · dispatch model <requested name or inherit> · effort <requested level or inherit>` line to the ledger per reviewer. These are dispatch facts; call the actual runtime `unknown` unless the tool exposes it.

<!-- canon: .claude/gate-rules.md#1-16 -->
**Before running this gate, read `.claude/gate-rules.md` §§1–§16 and follow it.** This is the
`/implement` build lane: the main session fixes findings; only cosmetic Medium-or-lower fixes retain
the no-re-review exception, with relevant validation and recorded resolution. Semantic fixes invalidate
affected assurance. The fast lane inherits the same gates, and a missing reviewer uses a separate
independent `general-purpose` context with the same checklist. Under lean, write `gates ran lean (consolidated)` in both the ledger and
report card; the fast lane has no ledger, so its marker goes on the report card only.

**Reserve and retain review history.** Before dispatch, read the existing ledger or working quick card and reserve every required slot, including any final consolidator, in initial batch 0; retries are batches 1 and 2. Sequential consolidation uses its already-reserved slot and fixed assessed inputs; repairs cannot turn it into a free evaluation of changed work. Record each actual evaluation, including continued-agent verdicts and failed/interrupted attempts, rather than just the final verdict. Renaming a check, changing models/commands/sessions or amending scope never renews the same gate's allowance. Zero touched paths still requires an independent generalist. The builder's context cannot supply its own final verdict; missing independent capacity stays unverified, and risk acceptance does not become PASS.

**Tail diff and long-list accounting before closure.** Apply canon §§14 and 16 after reviewer-driven fixes. If a fix touches non-test source outside its finding’s named lines or deletes/weakens an existing test assertion, inspect exactly those changed lines and append `tail diff check: <N> lines` to the ledger; added tests are exempt. When neither trigger fires, append `tail diff check: not triggered`. The fast lane records the same result directly on its card because it has no ledger. For a finding/fix list of at least five items, enumerate every item at completion with `file:line` or a reason it remains undone, and record the total and done/undone split in the ledger and card (fast: card only). Neither duty is a reviewer round or escalation.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

### Step 5: Definition of Done
For compatible registered work, perform and record current acceptance/integration/docs/DoD evidence
and invoke `close` as above. Its phase/whole-goal scope controls which completion claim is supported.
After all reviewer, advisory and documentation fixes, check that final evidence still covers the current inputs. Rerun affected validation after source or assertion edits, and obtain affected independent review after semantic edits within the remaining allowance. Record the validation and resolution for cosmetic-only fixes. Walk the project's actual `CLAUDE.md` Definition of Done, including required documentation/config updates, alongside the plan criteria. An older PASS, an accepted risk, or a tail inspection cannot substitute for current independent assurance. Unmet acceptance scope remains owed unless the person explicitly amends it.
Walk the phase plan's *Completion Criteria* and *Acceptance Criteria* against the shipped code; each must PASS with cited evidence. Update the master plan's *Progress Tracking* row, drop evidence under `docs/progress/<feature>/`, and append a `complete` line to the ledger citing that evidence — it is what makes the next phase startable at its dependency gate.

### Step 6: Next phase or stop
Before continuing or stopping, write and present the phase's completion evidence as a report card in `/review-phase` Step 6's format. In the *Session model* row, record the orchestrating session model/effort from the ledger when exposed (otherwise `unknown`) and summarize any visibly different reviewer dispatch posture; label it requested/inherited rather than claiming an unexposed runtime. If the person authorized the whole goal, continue through its remaining phases and required documentation without asking whether to continue. A progress question is answered without cancelling that work; an explicit pause is honored. At a required decision or session boundary, preserve original goal, accepted scope, authorization, evidence, review allowance and one next action in the existing record. A fresh session is a context option, never a reason to abandon authorized work.

## Hard rules
- Reviewer gates are mandatory per touched Critical Path — never skipped for size or green tests.
- The fast lane skips plan *artifacts* only — the entry gate, the reviewer gates, and the Definition of Done run in full.
- Tests alone do not satisfy the Definition of Done.
- Commit/branch only if the user asks.
