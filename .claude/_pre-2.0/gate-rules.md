# Gate rules

<!-- canon-coverage: 1-16 (workflow policy 1) -->

This file is the authoritative source for reviewer-gate mechanics. Commands still own their local
workflow, briefing, evidence, and report-card steps; when a command points here, read and follow the
applicable rules below before running its gate. Each section names the lanes it binds so later
sections can be appended without making an older range claim stale.

## 1. Gates vs rounds

**Lanes:** plan, build, independent review, fast, and `/go` routing.

Gates are about **what** is checked. Rounds are about **how many times** reviewers run. Every
applicable Critical-Path reviewer runs once: a change touching **N** Critical Paths must receive
**N** gate verdicts. Never skip a gate because the change is small or tests pass. Under the
sanctioned lean merge, one run may carry several checklists, but every touched path is still checked
and receives its own verdict.

Both planned build lanes require a current independently reviewed plan contract. A fast change
keeps its compact brief instead. Zero mapped paths still owes one independent generalist review.
The final coverage also includes entry checks, acceptance, integration/reachability, any triggered
production review, and the project's actual Definition of Done, including required documentation.
A completed slice never closes unfinished original scope.

Ready requires all currently owed proof and no unresolved Medium-or-higher finding. Almost means
demonstrated usable behavior with only confirmed noncritical residuals. Missing/stale independent
assurance, unknown critical proof, or High/BLOCK means Not yet. Low/Info may remain recorded.
Risk acceptance preserves the actual failing verdict and cannot create Ready.

Every saved working record and intermediate report follows the same evidence rule as the final
card. Intended work and reserved reviews remain **pending / not yet assessed**; missing required
proof keeps Overall **Not yet**. Never scaffold a future PASS, successful reviewer probe, zero
findings, review-dependent DoD completion or Ready and plan to correct it later. Fill results only
from linked evidence actually obtained. Keep observed, user-reported, configured and inferred facts
distinct; an inspection or configuration alone does not demonstrate runtime behavior.

Method is part of admissibility. A result obtained by a means the project’s `CLAUDE.md` forbids —
arbitrary shell where only a fixed command is sanctioned, a run pointed at a scratch copy instead of
the pinned target — is **not evidence**, however green it looks. Discard it and re-obtain the result
by the sanctioned means. Then say so yourself, in the same record where the result would have
appeared (the selected goal’s brief/card, Plan Review Log or retry notes): name the command you actually
ran and the sanctioned one you re-ran. **Disclosing your own method is the expected outcome and is
never itself a finding**; a method a reviewer has to discover is. If the sanctioned means cannot
produce the result — the runner cannot reach that target, the permission is unavailable, the
environment is gone — then the proof is **missing, not obtained**: record it that way, keep the item
**Not yet**, and ask for the sanctioned way. The `permissions.deny` list in `.claude/settings.json`
enumerates dangerous patterns and cannot detect any of this, so a command it did not block is not
thereby sanctioned — its silence is not clearance.

**Durable solo/fast evidence.** For a compatible registered `/implement` goal, the explicit
`node .claude/scripts/workflow-state.js <verb>` caller owns `docs/progress/<goal>/workflow.json`
and its immutable evidence files. The pair `.claude/lib/workflow-evidence.js` and
`.claude/scripts/workflow-state.js` must both be present and usable with Node. Send one JSON
object on stdin; paths/goal text are JSON data, never interpolated shell code. Every call includes
`projectRoot` (the actual absolute project path) and `goalDirectory` (`docs/progress/<one goal>`).
Every mutation includes the last observed `expectedRevision`; `init` alone uses 0. Only the
orchestrator writes this state through the CLI. Reviewers return reports read-only; never edit
the snapshot, receipt, report hash, reserved IDs or past evidence to obtain a green result.

`status` is read-only. Inspect `ok`, `readiness`, `assessmentScope`, `wholeGoalReadiness`,
`outstanding`, `coveredObligationIds` and `nextAction`; exit 0 alone proves no acceptance check.
A phase-only Ready does not evaluate the whole goal. A valid receipt is reusable only for its
current exact covered obligations and observed independent context; use the helper's covered
obligation IDs, not a union of every obligation named in an older partly applicable report.
Read linked reports and reconcile their scope/findings before omitting a duplicate review.

Missing Node/helper, a partial upgrade, missing/legacy/invalid/unsupported state, an uncertain
lock, or unexposed required provenance keeps the existing manual checklist and structured handoff.
A refused or unavailable permission for the helper call is treated exactly like a missing helper:
the shipped `permissions.allow` list is inspection-only and never pre-approves running the CLI, so
a declined prompt is an expected path, not a failure. Fall back to the manual checklist, preserve
scope, files, IDs and consumed allowance, and say which record could not be written. Never re-ask
for the same permission to obtain a different answer, and never treat the refusal as approval.
Preserve original scope, files, IDs and consumed allowance; disclose the exact unavailable proof.
Do not initialize over an invalid snapshot, infer unknown history as zero, delete a lock from its
age, or switch to manual work to obtain another review after a helper budget/pending-state hold.
Authorized inspection, implementation and checks can continue independently of held reviews.
Older/team work remains on this honest manual bridge until its retained history can be mapped;
copying Markdown or installing the pair does not manufacture structured evidence or approval. A
team goal with an existing `workflow.json` receives the same read-only `status` inspection and
phase-entry `amend` reactivation as a solo/fast goal — recording team review or build evidence
through the helper stays out of scope and remains on this manual bridge. Before resuming any
interrupted work, solo, fast or team, call `status` first and reconcile its returned state before
continuing, rather than re-deriving progress from memory.
The helper records supplied execution facts; it does not dispatch checks/reviewers, observe hidden
model reasoning or replace the human-readable card. Nothing here can halt or block a session — the
pack has no session-blocking hook; the record is written after the fact.
Report helper state to the person in plain words. **Never print raw UUIDs, digests, revision numbers
or helper error codes in anything a person reads** — name the check, the review, or the missing
evidence instead.

## 2. What a round is

**Lanes:** plan, build, independent review, and fast.

**Initial evaluation is batch 0; retries are batches 1 and 2.** Before each batch starts,
reserve every required reviewer slot, including any final consolidator. Its sequential verdict
belongs to that reserved batch; a new evaluation after feedback belongs to a retry batch.
Record the fixed assessment inputs with the reservation; repairs between specialist and
consolidator do not turn the reserved original-input slot into a free review of changed work.
Every actual reviewer run is counted separately for spend. A new verdict from a continued agent,
“focused confirmation”, renamed sign-off, changed model, or outside assessment of the same gate is
still an evaluation. Failed and interrupted runs remain recorded; they do not earn free retries.

Save the complete reservation in the selected goal's brief/card, Plan Review Log or retry notes;
reuse its record, or create the compact record and parent directory if absent as part of the
authorized workflow. Missing storage is not unknown history: creation never establishes unused
allowance for an existing goal. Missing files or an empty history search retain **review history
unknown** until records or the user's confirmation about this continuing gate establish it,
including in status/pause output and saved projections. A record establishes history only if it
addresses **consumption** — a Plan Review Log, retry notes, or a line that names this gate and
states no evaluation has been dispatched. A plan that merely says it is "unreviewed" or lacks a
prior approval speaks to approval status, not to consumption; that leaves history unknown, so ask
once rather than read it as zero. A goal first created in this session has no prior history: the
reservation the creating command writes — naming the gate, batch 0, no evaluation dispatched — is
its establishing line. For an existing goal, newly created assessed inputs do not change this: a
current verdict may be owed on them, but which batch it belongs to is still unknown until history
is established.

Before each reviewer invocation, mark its reserved slot **pending launch** in that same record,
with planned dispatch settings, then explicitly use **Read** on the saved reservation after its
last edit. Verify the gate, consumed allowance, complete slot list and fixed inputs before calling
the reviewer. A Write/Edit acknowledgment, cached file contents or a host hint saying "no need to
Read it back" does not perform this checkpoint. Do not claim read-back until the Read result was
actually obtained and checked. A batch number in a reviewer prompt alone is not a reservation.
If the allowance is unknown, saving fails or read-back cannot be obtained, hold that review and
ask the specific history/capability question; continue separately authorized inspection/checks.
An absent directory alone needs no extra record-creation permission.

After invocation, reconcile the pending slot with actual dispatch/start/result evidence, including
exposed IDs. A pending launch is not a completed evaluation or verdict. A started run with no
terminal result remains consumed and incomplete; a proven rejection before launch is recorded
separately. If interruption leaves launch uncertain, retain that uncertainty and reservation on
resume, inspect available tool/session evidence, and hold redispatch until reconciled. Never infer
zero attempts or a reusable slot merely because the foreground call did not return.

For a registered compatible solo/fast gate, persist the complete schedule with `reserve-attempt`
and `{gateId,mode:"batch",batch,slots:[{key,obligationIds,role,after:[]}]}` before the batch.
Use returned IDs, reserve all currently owed review/production obligations, preserve separate/full
slots and make a final generalist depend on every specialist key. Immediately before its actual
dispatch, use `reserve-attempt` with `{gateId,mode:"run",slotId}` and retain the returned attempt
ID and assessment fingerprint. Explicitly Read the saved `workflow.json` after that reservation;
the CLI's successful save/read-back supplements, not replaces, the §2 dispatch checkpoint.
For checks and other non-review assessments, reserve `{gateId,mode:"run",obligationIds:[...]}`.
Every actual attempt is retained, including continued-agent verdicts and interrupted runs.

Reconcile each result using `record-evidence` as specified in `/implement`'s evidence steps.
Recording a specialist's finding is a control output; the reserved final slot may consume that
report on the same subject. A source/contract/obligation change is different: retire only unused
slots with `{gateId,mode:"unavailable",slotId,reason}` and use remaining retry coverage. That mode
cannot erase a reserved actual attempt. Reconcile an actual interrupted/unverified attempt using
`status` with `attemptId` and its returned `attemptAssessment.currentFingerprint`, then the terminal
`record-evidence` shape in `/implement`. Unknown lineage requires a reasoned reconciliation record;
it supplies no independent proof and retains the consumed attempt/slot/batch. If that digest is null
or an older/partial API lacks this query, preserve the pending attempt, hold review redispatch and
describe the access/integrity or compatibility limitation. Never invent a digest or observed receipt.
An implementer repair is construction, not evaluation. A bounded diagnostic clarification of an
existing finding creates no verdict and consumes no evaluation slot, but its usage is recorded.

An orchestrator inspecting changed lines under §14 is not a reviewer spawn and is neither a reviewer
run nor a round.

## 3. Round budget

**Lanes:** plan, build, independent review, and fast.

Run batch 0 plus **at most two retry batches per continuing gate**, not per reviewer. Each retry
reserves only missing or invalidated coverage (under lean, the affected checklists). After batch 2,
stop with residual severity, evidence, remaining original scope and one recommended next action.
Another evaluation requires explicit approval at that point, never advance or inferred consent.
Persist the gate identity, reserved slots and actual runs in the existing progress record (the
compact card/brief in fast work). Resumption, command/model changes, amendments, renaming, or a
replacement gate ID never reset a continuing gate's allowance. New obligations retain a link and
explanation while old obligations and exhausted budgets remain intact. Unknown legacy history
stays unknown: inspect it before dispatch, or report unavailable allowance and request a decision.

The compatible helper records a confirmed legacy allowance with `amend` and
`{reason,change:{type:"budget",gateId,consumedBatches,reference}}`; the reference is retained
history or the user's actual confirmation for that continuing gate. After exhaustion, only
explicit additional approval can support `amend` with
`{reason,change:{type:"budget-extension",gateId,batches:[3],approval:{reference,gateId,obligationIds}}}`.
Use the exact finite consecutive next batch numbers and review/production scope actually approved,
after prior slots are reconciled. Prior 0–2 and every attempt remain; new obligations outside the
approval still remain owed. A generic continue instruction, new name, or schema edit grants no run.

## 4. Severity filter

**Lanes:** plan, build, independent review, and fast; apply §9’s lane-specific fix and verdict rules.

Fix or route every confirmed finding as the lane requires. `BLOCK` or High sends the affected
reviewer coverage back within the remaining allowance. Cosmetic Medium-or-lower fixes may close
without re-review after relevant validation and a recorded resolution. Naming, layout and duplicated
test setup can be cosmetic; missing assertions and ineffective tests cannot. **Semantic edits
invalidate affected validation and review regardless of severity.** A comment-only correction
does not need a confirmation spawn. Never turn accepted risk or an author's self-check into PASS.

Reviewer vocabulary maps onto this filter: ❌ BLOCK is BLOCK; ⚠️ CHANGE is High unless the reviewer
rates it Medium or lower or it is one of the cosmetic kinds above; 💡 NOTE is Info. A security
reviewer’s CRITICAL / HIGH / MEDIUM / LOW ratings are used as-is. The plan lane uses its own
what-will-be-built test in §9.

**Normalize before presenting the workflow card.** Preserve the original independent report,
verdict and findings. Derive each workflow path's tier from its canonical severity and current
assurance under §1 before aggregating the worst workflow tier. An unrated CHANGE is High here,
so an original reviewer headline of Almost may yield workflow Not yet. Explain that stricter
interpretation and link the original report; never rewrite it or manufacture PASS. Do not copy a
raw grade that contradicts the normalized tier: omit that grade on the compact workflow row and
retain it in linked reviewer detail. Raw reviewer vocabulary keeps its documented local mapping;
the workflow card uses these explicit normalized tiers consistently in every lane.

For compatible registered work, `record-finding` preserves the gate/invariant, stable finding and
parent IDs, severity, classification, owner lineage and disposition. Use its actual returned IDs.
Same-ID reopening advances the finding version; applicable resolution needs current check and
independent review receipts assessed with that version, plus the class repair for High/repeated
findings. A first, nonrelated Medium-or-lower cosmetic/false-positive finding may explicitly record
`applicability:{findingVersion,kind,reason,reference}` with unchanged current proof. This does not
turn changed-input evidence current or accepted risk into PASS. Changed-input manual cosmetic
equivalence remains outside structural proof. Named future-phase deferral is recorded only by
planned `/review-phase` under its reachability rules: keep the original finding/gate, current
version-bound independent reachability receipt, explicit decision/reference and known risk.
Security High/Critical, any data-loss possibility and unknown risk never defer. A deferred finding
remains owed to the whole goal; entering its named phase activates that same finding with fresh
proof required under its original budget. Activation is a distinct event from defect recurrence.
Older/partial helpers preserve the manual record and limitation without claiming structural proof.

## 5. Convergence stop-rule

**Lanes:** plan, build, independent review, and fast.

If findings recur for the same invariant a second time, or fixes introduce substantial new defects,
pause editing for one bounded owner/reviewer diagnostic exchange: reconcile the invariant and
reproducer, then repair only under the remaining allowance or stop with the residual. Diagnosis
does not grant another verdict. If work still fails to converge, stop revising. A thinner usable
slice is partial progress; the original acceptance scope remains owed unless the user changes it.

## 6. Announcing spend

**Lanes:** plan, build, independent review, fast, and `/go` routing.

Announce the spend before it happens and total it after. Before the gate, say how many reviewer agents
are about to run and why — for example, `Gate: 2 reviewers — security-reviewer (new endpoint),
code-reviewer (consolidating)`. On the report or report card, state the total for the phase. Cost a
person cannot see is cost they cannot choose to avoid.

Keep planned dispatch settings separate from the actual invocation's model/effort arguments.
Record an explicit model override exactly as requested, not as "inherit" or "no override".
When an argument is absent, label it "inherit / no override requested", separately from any
configured agent pin. Actual resolved model/effort remain **unknown** unless exposed by runtime
evidence; a request or pin cannot prove them.

## 7. Lean gate mechanics

**Lanes:** plan, build, independent review, and fast when `CLAUDE.md` says `Gate intensity: lean`.

Lean consolidates the per-path reviewers into **one merged reviewer run**: spawn the lane’s generalist
reviewer, or `general-purpose` under §10, once and read-only. Give it the lane’s complete briefing,
“think hard before rendering your verdict”, and every touched path’s numbered checklist or dimension
brief pinned verbatim from that path’s reviewer agent. It renders PASS / NEEDS CHANGES / BLOCK **per
path**. Paste-fidelity still applies.

The merged run is the consolidation, with no separate generalist spawn, except in the plan lane (§9).
The merged context does not apply each specialist's individual `model:` or `effort: xhigh` pin.
Explicitly request the strongest model the account exposes — in this project pass `model: fable` as
the dispatch parameter on every merged run and every `general-purpose` reviewer under §10, because
`.claude/settings.json` sets `CLAUDE_CODE_SUBAGENT_MODEL=opus` as the fallback for unpinned
read/gather agents and the dispatch parameter outranks it — and ask it to “think hard”; that wording
is a reasoning instruction, not evidence of an effective effort setting. Record the merged context's
requested/session posture separately from each specialist's configured maximum. Resolved runtime
model and effort remain unknown unless exposed, under §6. This is the accepted lean trade.

Lean changes how many agents run, never what is checked: never zero reviewers and never fewer
checklists. Record the lane’s lean marker in its evidence or report card so lean is never silent. The
advisory simplification-pass behavior and any cross-model checks remain lane-specific in §9.

## 8. Auto-escalate (`Full gates?`)

**Lanes:** plan, build, independent review, fast, and `/go` routing.

A phase or plan touching a Critical Path marked `yes` in `CLAUDE.md`’s **`Full gates?`** column runs
that path at full intensity even under lean: it receives its own separate reviewer, not the merged
run. The person saying **“full gates on this one”**, or asking for full gates in plain words, escalates
the phase the same way regardless of the recorded intensity. Say which paths escalated on the report
card.

An absent `Gate intensity:` line, an unresolved `⟨lean | full⟩` placeholder, or an unrecognised value
means **full**. In plan, build, and independent-review lanes, a table with no `Full gates?` column
marks nothing; that is not an error, and the report card says so once. `/go` previously carried no
such null-case instruction; §9 preserves that as-found boundary.

## 9. Lane variants

Only the lane(s) named on a row inherit that row.

| # | Lane(s) | Clause preserved from the template |
|---|---|---|
| 1 | Build — `/implement` | The main session fixes findings. Cosmetic Medium-or-lower fixes retain the prior independent assessment with validated resolutions marked *fixed without re-review*. Semantic changes require current affected proof under §4; never rewrite the prior verdict. |
| 2 | Build — `/start-teams` | The owning implementer repairs; the orchestrator never edits code. The same cosmetic-only resolution and semantic-freshness rules apply. Under lean, Codex Mode 1 remains a visible outside check, never extra free gate evaluations; write `gates ran lean (consolidated)` in evidence and on the card. |
| 3 | Independent review — `/review-phase` | Verify and do not fix. Confirmed noncritical Medium residuals on demonstrated usable behavior make Almost and route to the build lane; missing/stale critical or independent proof makes Not yet under §1. Low/Info do not move the tier. Ready requires applicable Medium findings to close. |
| 4 | Plan — `/create-plan` | Use the plan-shaped severity test: a finding that changes **what will be built** re-runs only its reviewer; a finding that changes **only how the plan reads** is fixed, batched, and logged without re-review. If an implementer would act differently after the fix, it changes what will be built. |
| 5 | Round counting — all gate lanes | The cap is per gate, not per reviewer. Some former source sites stated the unit and others were silent; the common §3 rule governs every pointer without inventing a lane exception. |
| 6 | Build — `/start-teams` only | An implementer re-spawn is a fix, never a reviewer round, and does not count against the cap. |
| 7 | Plan lean — `/create-plan` only | Keep the 6c generalist `plan-reviewer` separate, always, and last. Write `plan gate ran lean (consolidated)` in the plan-review report and Plan Review Log. Codex Mode 2 remains outside the gate unchanged. |
| 8 | Simplification distribution | Lean skips the advisory simplification pass in `/start-teams` and `/review-phase`; the `/implement` plan-lane lean block carried no such clause. The fast lane skips it explicitly. Preserve that silence rather than completing it in either direction. |
| 9 | Convergence distribution | All gate lanes apply §5; a usable slice is reported as partial when original scope remains open. |
| 10 | Missing-`Full gates?`-column distribution | `/create-plan`, `/implement`, `/start-teams`, and `/review-phase` say a table without the column marks nothing and the card says so once. `/go` carried no null-case instruction; preserve that boundary. |
| 11 | Fast — `/implement` | The fast lane skips plan artifacts, never entry checks, reviewer gates, or Definition of Done. It skips the advisory simplification pass by design. |
| 12 | Independent review lean — `/review-phase` | The production-readiness trigger is unchanged. |
| 13 | Reviewer order and consolidation | `/start-teams` and `/review-phase` run the generalist/qa reviewer last. Plan lean keeps its separate final reviewer under row 7. The template imposed no broader generalist-last rule on `/implement`; do not invent one. |
| 14 | Independent review reachability | Reachability ordering and `deferred-findings.md` remain local to `/review-phase`; §1–§10 do not relocate or weaken them. |
| 15 | Build — `/implement` lean-marker destination | In the plan lane, write `gates ran lean (consolidated)` in both the ledger and report card. The fast lane has no ledger, so write it on the report card only. |

`/go` detects and reports gate intensity, preserves every touched-path verdict, and routes to the
command that runs the gate. Its fast route skips paperwork, never gates.

## 10. Missing-reviewer fallback

**Lanes:** plan, build, independent review, and fast.

If a required or selected reviewer agent is missing, preserve the lane’s disclosure wording and any
destination its source named:

- Plan (`/create-plan`): use a `general-purpose` review that walks the same checklist; note the absence
  in the plan-review report.
- Build (`/implement`): use a `general-purpose` review that walks that path’s checklist; note the
  absence.
- Team build (`/start-teams`): use a `general-purpose` review that explicitly walks that Critical
  Path’s checklist; note the absence in the phase evidence.
- Independent review (`/review-phase`): use a separate `general-purpose` reviewer walking the
  same checklist; note the absence. Never use the construction context as independent review.

A fallback is still a run and must return the path verdict required by §1. Zero mapped paths
uses an independent generalist in every build lane. Record the actual separate review context;
a role or model label alone is insufficient. Missing independent capability leaves assurance
unverified and readiness Not yet; manual inspection or human risk acceptance cannot supply PASS.

## 11. Plan and phase size

**Dial:** rounds. **Lane:** plan.

Size is a plan-time finding, never a refusal. Raise and record a finding when either signal fires:

- a phase’s *Files to Create / Modify* table has **more than 25 rows**; or
- the `plan-reviewer` cannot faithfully simulate the plan document at its current size.

These signals enter the plan-review gate rather than failing the mechanical audit that precedes it.
The plan must either split the work or record that the person accepted the risk of reaching the round
budget. Accepted risk is a warning disposition, **not** advance permission for round three: §3’s
explicit go-ahead is still requested at that moment if the budget is exhausted.

## 12. Retry context carry

**Dial:** rounds and cost. **Lanes:** team, solo and fast repair. **Mechanism:**
`implementer-notes-file` (the guaranteed floor), with an optional warm tier above it on runtimes that
support one.

If the runtime can deliver new instructions to an already-running implementer, prefer that for a
**fix** so the repair keeps its working context instead of re-deriving it — call this the **warm
tier**. Four bounds are binding.
It applies to **implementer fixes only** — a reviewer is never continued across batches, because
independence outranks warmth. The notes file below is still written in **every** tier, because a live
continuation dies with its session and the file does not. And the ledger states which tier ran:
`context carry: warm — continuation` for the warm tier, then the `context carry: <notes path>` line
below in the same append, so the artifact stays discoverable after an interruption. This tier is
**team-lane only** — it needs an implementer lineage to continue, which solo and fast repair do not
have (their §12 seam is the repair brief), so those lanes keep the notes file as their sole mechanism.

For each implementer lineage, use
`docs/progress/<feature>/phase-<N>-<owner>-implementer-notes.md` as the context-carry artifact. The
first implementer’s prompt must require it to write that file before its done-report, recording
decisions, files touched, validation run and results, unresolved work, and its weakest bet. Every
retry or replacement implementer’s prompt must require it to read the same file **before editing**.
The writer and reader are separate mandatory obligations; a generic retry sentence does not satisfy
either one.

If the notes are missing or unreadable, or context carry otherwise fails, degrade to a cold re-spawn
with the original phase contract plus the current findings and log
`context carry fallback: cold re-spawn — <reason>`. Never stall the build on the carry mechanism.

For High/BLOCK or a repeated same-invariant finding, include a compact repair brief in those notes:
violated invariant, causal explanation, bounded affected population and discovery query, original
reproducer, sibling/boundary cases, correction, and failing-before/passing-after proof. Solo/fast
owners may record this inline in their existing brief/card. The independent reviewer challenges
the population and whether the test catches the original defect; use a held-out counterexample
when the class warrants it. Preserve baseline failures; never weaken a check to make it green.

## 13. Escalation ladder

**Dial:** rounds. **Lane:** team build (`/start-teams`) only.

Before escalating a fix to the strongest available implementer model, classify the evidence and state
the reading in the ledger. If the new findings are mostly defects introduced by the previous round’s
own fixes, §5's bounded diagnosis outranks this ladder; stop if the invariant or repair remains
unresolved. Otherwise state that the surviving
BLOCK/High finding indicates harder work and the escalation may proceed. Allow **at most one
escalation per phase**; no counter in a different retry branch supplies or resets this bound.

Claude Code 2.1.247 was measured on 2026-09-03: a per-dispatch `model` parameter outranks agent
frontmatter, while `CLAUDE_CODE_SUBAGENT_MODEL` outranks both. Escalation only moves upward and needs
no downgrade consent. A finding that was BLOCK is never recorded PASS after a fix without a reviewer
verdict that closes it.

## 14. Tail diff check

**Dial:** visibility and correctness. **Lanes:** build and fast.

After reviewer-driven fixes and before the phase closes, trigger this check when a fix either touches
non-test source outside the lines named by its finding or deletes or weakens an existing test
assertion. Added tests are exempt; deleted assertions trigger. The orchestrator inspects exactly those
changed lines and records `tail diff check: <N> lines`; when neither trigger fires, record
`tail diff check: not triggered`. This is orchestration inspection, not a reviewer spawn or round.

Before closure, compare the final source, assertions, relevant config, contract and reviewer
checklists with the inputs actually assessed. Any affected change after validation requires new
validation; any semantic change requires current affected independent review under the same
allowance. Tail inspection is not that review. Complete required docs before this final check.

## 15. Briefs state completed validation

**Dial:** rounds and cost. **Lanes:** build, fast, and independent review.

Every reviewer brief states which entry validation the orchestrator already ran, **the exact command
used**, and the observed results. This lets reviewer time go to targeted proofs, but never restricts verification: a reviewer
may run any check the project sanctions when it distrusts a result, and must say when it did.

For a class repair, include §12's evidence and ask the reviewer to challenge the affected population,
original-failing/fixed-passing assertion, sibling cases and any fix-induced regression. A convincing
explanation or schema-shaped note alone does not prove the defect is repaired.

## 16. Long fix-list accounting

**Dial:** visibility. **Lanes:** plan, build, fast, and independent review.

When a finding or fix list contains **five or more items**, disclose every item individually at
completion. Each item names its `file:line`, or—if it remains undone—the reason. Record the total and
the done/undone split in the lane’s report or log. This is an accounting duty only: list length never
changes severity, reviewer selection, escalation, or the round budget.
