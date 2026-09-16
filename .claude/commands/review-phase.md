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

Read the accepted contract and existing build/review evidence, findings and review allowance before dispatching anything. Identify all owed checks: current entry validation, every touched Critical Path, acceptance, integration/reachability, any triggered production gate and the actual DoD. A prior report is usable only when its independent context, assessed inputs, scope and findings still match this work. Do not remove a review merely because a build card says PASS: without evidence of equivalent coverage, retain the independent check and count it honestly within the continuing gate's budget. This manual inspection does not claim machine-verified freshness.

For a compatible solo/fast record, use canon §1 and `/implement`'s self-contained durable-evidence
steps. A team goal with an existing `workflow.json` gets the same read-only inspection here — see
`/start-teams`'s team-evidence bridge; recording team review/build evidence through the helper is
still out of scope. Call `node .claude/scripts/workflow-state.js status` with JSON stdin
`{"projectRoot":"<actual absolute path>","goalDirectory":"docs/progress/<selected goal>"}`.
That call needs a permission the shipped inspection-only allow list does not cover, so say in one line
what it is before the prompt appears: this one only reads the progress record — it changes nothing,
runs no check and starts no reviewer. A declined prompt is an expected path; fall back to the manual
checklist per canon §1 and reassure them in one line: no problem, every check and review still runs
exactly the same, progress just gets tracked in the written notes instead of the saved record.
Resolve the requested phase to its retained UUID, then include that `phaseId` for scoped review.
Read `state`, `assessmentScope`, `outstanding`, `coveredObligationIds` and the linked immutable
contract/receipts. Reconcile the accepted plan/brief and actual current checklist obligations;
add newly owed coverage through `amend` rather than silently reducing it. A prior build receipt
can satisfy identical current independent coverage with zero duplicate reviewer evaluations.
Use exact covered obligation IDs, not every ID in a partly applicable receipt. State validity or
CLI exit 0 alone is not acceptance or independent review.

This command owns the single state-writing role while it runs; reviewer agents remain read-only.
Use the latest `expectedRevision` for every mutation and inspect status after a conflict. When
current authorized review reopens stale completed work, retain closure history and record the
actual running session/disposition through `amend`; a pause or absent authorization stays honored.
Do not initialize over an existing record. Older/team evidence, partial/missing helpers and
unsupported capabilities retain the manual checklist, original scope, history and handoff.
If a helper hold cannot be represented truthfully, report it; another command cannot reset it.

### Step 2: Entry gate
For registered work, reuse only current equivalent check evidence that covers every actual entry
command; otherwise reserve and run each missing assessment using `/implement`'s transaction and
record its real command, exit status and report. Preserve the brownfield ratchet below. A real
approved baseline-comparison command may prove it with its own actual output; absent that command,
the valid manual ratchet is reported separately and cannot become a fabricated helper check PASS.
Confirm `typecheck` + `lint` + `test` are **clean** on the current tree (run the project's real scripts): green, or — when a brownfield baseline exists (`docs/progress/entry-baseline.md`, recorded on a repo that was already red) — no new failures vs it (no failing identifier it doesn't already record, no count above it). When passing by baseline, note the ratchet movement for the report card (e.g. `baseline 12 failing → 9`) — an improving run also rewrites the baseline down, and an all-green run retires it (the standard reverts to plain green). If not clean, the phase is NOT ready — report the new failures and stop; there is nothing to gate yet. (Red with no baseline recorded, and the failures look older than this phase? Say that `/go` — or `/implement` / `/start-teams` directly — will offer to record a baseline at its entry gate; recording one is the person's call, made there, not here.)

### Step 3: Acceptance Criteria walk (row by row)
For registered work, map every criterion to its retained acceptance obligation. Reuse current exact
evidence or reserve and perform the missing assessment, then `record-evidence` with actual provenance
and output. Integration/reachability, required docs/config, production and DoD remain distinct owed
coverage; a generalist or test receipt never implicitly discharges them.
For **each** Acceptance Criterion in the phase plan, render PASS or FAIL with concrete evidence (file:line, test name + result, or screenshot path). A criterion you cannot evidence is a FAIL, not a pass-by-default. Quote the criterion, then the evidence, then the verdict.

### Step 4: Critical-Path reviewer gates
For registered work, complete canon §2's saved batch/attempt reservations and explicit Read before
every actual reviewer dispatch. Include all missing review/production obligations and the correctly
ordered separate final slot where required. Send actual returned reports/provenance to the single
writer for `record-evidence`; preserve raw verdicts and requested versus resolved model facts.
For interrupted/unverified attempts, query `status` with `attemptId` and use `/implement`'s actual
terminal recovery fields, retaining unknown lineage, partial reports and consumed allowance.
A null current assessment digest or missing query retains the pending/manual hold without proof.
Use `record-finding` for stable finding/parent/invariant identity, ownership and dispositions; a
new or continued verdict consumes its actual reserved evaluation, not a renamed free confirmation.
From `CLAUDE.md`'s Critical-Path table, account for every path this phase touched and spawn **every owed reviewer not already demonstrably covered** by Step 1's applicable independent evidence, read-only, briefed with the diff scope, the declared *least-confident* line(s) — read them from the phase plan's *Least confident* line and the progress ledger's `least-confident:` entries (read its `started`, `builder`, `reviewer`, `escalated:`, and `context carry:` lines in the same pass — they feed the card's *Session model* row, and the carry line says whether a repair kept its context or started cold), briefed as "probe the declared weakest bet first" — and "think hard before rendering your verdict". Include the exact typecheck/lint/test results already observed in Step 2; say that the reviewer may run any validation it distrusts and must state when it does. If no declaration exists anywhere (plans authored before this line was introduced), note the absence on the report card and proceed — never manufacture one, and absence alone is never a gate failure. Before spawning, also read the phase plan's *Reachability* line and `docs/progress/<feature>/deferred-findings.md` if it exists — re-brief any entry whose activating phase is this one (see *Where a deferred finding goes* below). Collect each verdict (PASS / NEEDS CHANGES / BLOCK) with file:line findings. Run the generalist/qa reviewer last to consolidate. Track each reviewer spawn's requested/inherited model and effort for the card; those are dispatch facts, not proof of an unexposed runtime.

<!-- canon: .claude/gate-rules.md#1-16 -->
**Before running this gate, read `.claude/gate-rules.md` §§1–§16 and follow it.** This is the independent-review lane: verify and route rather than fix, a Medium finding means Almost only when usable behavior is demonstrated and no critical or independent assurance is missing, while missing/stale independent assurance or critical proof means Not yet; Low/Info alone do not move the tier, and a missing reviewer falls back to a separate independent general-purpose context with the same checklist. Missing independent capacity remains unverified; self-review or human risk acceptance cannot manufacture PASS.

**Independent scope and retained allowance.** Zero touched paths still requires an independent generalist. The reviewer must use a context separate from construction; a role/model name alone proves nothing. Reserve all owed specialist and final consolidator slots before initial batch 0; retries are batches 1 and 2, with sequential consolidation in its reserved slot on fixed assessed inputs. A repair cannot turn that slot into a free evaluation of changed work. Read prior reservations and attempted evaluations from the ledger or quick card; record every actual evaluation, including continued-agent verdicts and failed/interrupted attempts. Renaming a check, changing commands/models/sessions or amending scope cannot renew the same gate's budget. When allowance is exhausted or unknown, report the missing assurance and next decision instead of inventing a free run.

**Review the repair, not only the changed line.** For High/BLOCK or repeated same-invariant findings, read the owner's repair brief in its implementer notes, ledger or quick card. Challenge the violated invariant, causal explanation, bounded affected population/discovery query, original reproducer, sibling/boundary cases, correction and failing-before/passing-after proof. If a relevant source or assertion changed after validation, route it for affected validation again; semantic fixes require affected independent review within the remaining allowance. Cosmetic Medium-or-lower fixes can retain the no-re-review exception only with relevant validation and a recorded resolution. Risk accepted, blocked, deferred and independently verified remain distinct dispositions; accepted BLOCK never becomes PASS.

**Long routed lists stay auditable.** Apply canon §16 when the findings routed back to the build contain at least five items: enumerate every item in the review detail with its `file:line`, or state why it remains undone, and report the total and done/undone split. This is accounting, never a new severity or round trigger.

**Order findings by reachability.** A finding against code that **no user path reaches yet** is recorded as a backlog item against the phase that will make it live — not as a blocker on this phase. Unreachable means the phase plan's *Reachability* line says so, or the master plan's *Deferral Ledger* names the receiving phase — a reviewer's own guess that nothing calls it yet is not enough. Two exceptions never defer: anything a security reviewer rates **High or above**, and anything that can **lose or corrupt data**. The gate still runs and every finding is still written down with its evidence; what reachability changes is the **order and the blocking status**, never whether the path was looked at. A properly filed deferred finding is recorded on the card and does not count toward the reviewer's verdict or the tier. This deferral channel is `/review-phase` only — the build lanes' gates block on every finding as before.

**Where a deferred finding goes, and how it comes back.** Append it to `docs/progress/<feature>/deferred-findings.md` (append-only; created on first entry) as one line: `- <YYYY-MM-DD> — <finding, one sentence> — <file:line> — activates with: <capability> (<feature> phase <N>)` — the phase is the one named in the master plan's *Deferral Ledger* row when one exists; the capability half is what a later plan for a different feature matches on. Two readers bring it back, so it cannot be lost: **`/create-plan` Step 3** reads every feature's file (`docs/progress/*/deferred-findings.md`) and picks up each entry whose `activates with:` names a capability this plan builds, and **`/review-phase` Step 4** opens this feature's file before spawning reviewers, whenever it exists, and re-briefs every entry whose activating phase is the one under review — those findings re-enter this gate as ordinary findings, at their original severity; mark the line `— re-entered <date>` when it is re-briefed and `— done` once the finding is closed (readers skip `— done` lines; the review file tracks a re-entered finding until then). Report the counts on the card's *Deferred findings* row: filed, re-entered, still pending. A deferred finding with no activating phase named is not deferrable: it blocks. On a phase plan written before this field existed, there is no *Reachability* line to read — say so on the report card and review normally; a missing line is never itself a finding on an older plan.

**Structured named deferral.** For a compatible planned record, preserve the manual evidence above
and update the same finding via `record-finding` with the common root/goal/expectedRevision fields:

```json
{
  "findingId":"<actual retained UUID>", "disposition":"deferred", "reason":"<actual reason>",
  "deferral":{
    "receivingPhaseId":"<later existing phase UUID>", "reference":"<actual deferral decision>",
    "reachability":{"status":"unreachable","reference":"<accepted plan Reachability or Deferral Ledger reference>","proofReceiptId":"<current independent report receipt UUID>"},
    "risk":{"security":"no","dataLoss":"no","reference":"<actual risk assessment reference>"}
  }
}
```

Replace the example risk values with actual assessed facts, never convenient defaults. The proof
must be a current observed independent review/production report from the original gate that assessed
this finding's current ID/version; an earlier generic review is insufficient. A real FAIL may support
the reachability finding but stays FAIL for review coverage. Do not recode it to PASS. Security
High/Critical, any possible data loss, and unknown risk reject deferral; a security obligation keeps
that risk through generic reviewer fallback, and positive recorded facts cannot be downgraded.

The receiving phase must be later and not yet entered, reserved or closed. Keep its original binding
on later proof updates. Whole-goal status retains this work; only a valid future deferral is omitted
from an earlier phase's scoped result. When authorized work enters the named phase, use `/implement`'s
(or, for a team goal, `/start-teams`'s) phase-entry amendment and re-brief the returned activated
findings. Successful reservation/close of
that phase also activates defensively; status stays read-only. Activation preserves the original
finding/owner/gate/budget, clears old proof and increments the proof version without labeling it
recurrence. Obtain fresh check/review proof in that original gate; no re-deferral or new gate allowance.
Older/partial helpers and changed-input cosmetic equivalence retain a documented manual limit.

**Simplification gate (advisory).** Unless the lean exception in canon §9 applies, also spawn the `simplification-reviewer` (read-only, same diff scope) — an additive voice that hunts over-engineering only (delete / stdlib / native / yagni / shrink). It judges **means, never coverage**: fold its findings into the consolidation, but apply a cut **only if coverage stays identical**. It never flags a test, guard, or edge case for removal, never reduces the Definition of Done, and cannot block or downgrade a completeness PASS. When leanness and completeness conflict, completeness wins. It is not a Critical Path, so its absence is never a gate failure — note it on the report card as advisory only.

**Production-readiness gate (on demand).** *Additionally* spawn the `production-reviewer` agent when production quality is in scope — i.e. the person asked for it (e.g. "make this production-ready", "ship to prod", "harden for production", "go live"), or `CLAUDE.md` / `NORTH_STAR.md` declares the project a production target. It is **not** run on every phase by default. When it runs, treat its verdict as a gate like any other and include it on the report card.

**Paste-fidelity self-check — before sending each spawn prompt:** check every pinned block against its source — a phase-plan contract block byte-for-byte, a standard brief intact — nothing summarized or trimmed to fit. A paraphrased contract is a broken contract.

### Step 5: Definition of Done audit
For registered work, perform and record the missing integration/docs/DoD assessments under their
actual obligation IDs. After all source, assertion, contract, checklist, config and required-doc
fixes, call `status` again; stale evidence requires affected validation/review within the retained
allowance. Perform `close` with JSON stdin containing the common root/goal/current-revision fields
and actual `phaseId` only after the audit. Read its returned scope/readiness and remaining reasons.
Walk the phase plan's Completion Criteria and every item in the project's **actual** `CLAUDE.md` Definition of Done — the project's list governs, not a generic one. Flag any unmet item (typical items: tests-in-same-commit, mandatory specs the project defines, docs/config updated, progress table updated).

Before the final verdict, confirm all evidence still applies after the last source, assertion or documentation fix. Required documentation is part of closure. An author inspection, accepted risk or old PASS cannot replace missing current independent assurance. Report the original acceptance scope still owed; a smaller finished slice is partial progress unless the person explicitly amended scope.

### Step 6: Write the review
For registered work, derive the card from current scoped helper evidence plus the actual reports;
write only the declared generated card/progress projection, not the immutable contract or receipts.
Include the assessed phase/goal and any manual compatibility limit. A phase-only Ready explicitly
leaves whole-goal readiness unevaluated; inspect whole-goal `status` without `phaseId` before a
whole-goal completion claim. Present Not yet/Almost reasons and one concrete next action plainly.
Write `docs/progress/<feature>-phase-<N>-review.md`. **Lead with a plain-language report card** anyone can read, then the evidence below it:

The template below is an output shape, not observed results. Replace each field only from current
linked evidence. If used as a working record before assessment, keep Overall **Not yet** and every
unassessed result/probe/finding count pending under canon §1; review-dependent DoD remains unmet.
Never save prospective success and plan to correct it later. Retain launch uncertainty under §2
and distinguish planned settings, actual invocation arguments and resolved runtime evidence under §6.

```markdown
# Phase <N> review — <feature>

## Report card
**Overall: <Ready / Almost / Not yet from current evidence; Not yet while required proof is pending>** — <what is done, what remains and one next action>. **Ready here means locally ready for release, never that a release happened** — never say "shipped" or "deployed" unless deployment actually occurred with recorded authorization; that is `/release`'s job, not this card's.

| Gate | Result | One line |
|------|--------|----------|
| Release status | local Ready / not released | <"Ready for your release process" at most — link to `/release` when the person wants to ship; never claim deployment this command didn't perform> |
| Entry checks (typecheck/lint/test) | Ready / Not yet | <e.g. all green — or `baseline 12 failing → 9` on a brownfield repo> |
| <Critical-Path reviewer> | <derived tier and compatible grade, or Not yet — pending> | <link the returned independent verdict/findings, or name the missing assessment> |
| Acceptance criteria | <evidenced PASS count>/<total owed> | <link each assessed result; list failed and unassessed criteria> |
| Least-confident probe | <held / broke from observed probe evidence, or pending / not declared> | <the declared weakest bet and linked probe result — or "no declaration (pre-dates this line)"> |
| Definition of Done | <met only with every required item evidenced; otherwise not met> | <remaining items, including pending independent review> |
| Reviewer spend | <observed actual evaluations> · <consumed batches and remaining allowance, or unknown> | <initial batch 0 and retries 1–2; distinguish reserved/pending-launch slots from actual runs, retain uncertain launches; include failed/interrupted attempts and continued-agent verdicts> |
| Session model | <orchestrating model> · effort <level> / unknown — not exposed to this session | <record the orchestrating session from the ledger's `started` line when exposed; summarize visibly different builder/reviewer model and effort requests from ledger entries, escalation records, and this review's dispatches; label them requested/inherited, never as the actual runtime unless the tool exposes it; "not recorded (pre-dates this row)" on an older card> |
| Fixed without re-review | <count> | <cosmetic Medium-or-lower items routed to the build lane, with relevant validation and recorded resolution; semantic edits require affected independent review> |
| Tail diff check | <N> lines / not triggered | <use the build ledger/evidence; fast-lane cards record directly; "not recorded (pre-dates this row)" for older work; this row is reporting-only> |
| Fix-list accounting | <N> items · <done> done · <undone> undone / not triggered | <for lists of at least five, enumerate every item below with file:line or an undone reason; this row is reporting-only> |
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
**Overall: Not yet** — tests pass, but the login review found an account-lockout bypass that must be fixed before shipping.

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

Normalize workflow path tiers under canon §4 before writing or aggregating this card. Preserve each original independent report and verdict in linked detail. An unrated CHANGE is High under the canon, so explain a workflow Not yet even when the original reviewer headline was Almost. Do not copy a contradictory original grade onto that normalized row; retain it only with the original report. This is transparent severity interpretation, never a new reviewer verdict or PASS.

Then the detail: diff scope · entry-gate result · the Acceptance Criteria walk (row by row, with evidence) · each reviewer's readiness headline + findings · any §16 item-by-item accounting · Definition-of-Done audit. Missing/stale independent assurance, unknown critical proof or High/BLOCK makes the phase Not yet; Almost is reserved for demonstrated usable behavior with confirmed noncritical residuals. The **Overall** is the *worst normalized workflow* tier across all gates (any Not-yet ⇒ Not yet; any Almost with no Not-yet ⇒ Almost; all Ready ⇒ Ready) and must equal the binary verdict (`Ready` = READY, anything else = NOT READY). The Ready/Almost/Not-yet tier is the pack's one user-facing vocabulary — it's what the person acts on; reviewer-internal verdicts (PASS / NEEDS CHANGES / BLOCK, READY / NOT READY) are machinery and always agree with it. On a re-review after fixes, show the movement (e.g. "Not yet → Ready"). Update the master plan's *Progress Tracking* row only if READY. This Ready review file is itself the **proof of completion** a dependent phase gates on; if a progress ledger is in use (`docs/progress/<feature>/ledger.md`), append the verdict to it (append-only, convenience only — never gated on in place of the evidence).

## Hard rules
- Never mark a criterion PASS without cited evidence.
- Never skip a reviewer gate for a touched Critical Path.
- A gate's verdict exists only if the reviewer actually ran in a separate independent context (including a declared general-purpose fallback). Reporting a gate as passed without the run is fabricating the verdict, not reviewing.
- READY requires: a clean entry gate (green — or no new failures vs the recorded brownfield baseline, with the ratchet shown on the card) **and** every Acceptance Criterion PASS **and** every reviewer gate PASS **and** the Definition of Done met. Anything less is NOT READY.
