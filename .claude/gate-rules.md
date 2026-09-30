# Gate rules

<!-- canon-coverage: 1-8 (workflow policy 2) -->

How a reviewer gate runs, on one page. Commands point here instead of restating it. Reviewers judge
code and behaviour; docs, ledgers, counts and cards are bookkeeping for the orchestrator (the session
running the command) and are never a finding.

## 1. One run per touched path

Every Critical Path a change touches gets one reviewer verdict from a context that did not write the code:
N paths, N verdicts. Under `Gate intensity: lean` one run may carry several paths' checklists and returns one
verdict per path; a path marked `Full gates? yes` always gets its own run. Zero touched paths: one
`code-reviewer` run on the diff. Never skip a gate because the change is small or tests pass — the
follow-up is proportional to the findings; the gate itself is not.

## 2. Frozen tree

Name what the reviewer reads before it starts: a commit (simplest), a named stash (`claude-jig review:
<feature> phase <N>`, re-applied with `--index`), or an explicit diff range. No one edits the tree while a review runs; fixes
begin after the batch's last verdict returns. The brief names that snapshot, the exact validation command
already run, and its result.

## 3. Severity → action

| Reviewer says | Orchestrator does |
|---|---|
| BLOCK, or security CRITICAL / HIGH | fix, then re-run only the reviewer(s) whose cited files the fix touched (`git diff --name-only <snapshot>`) — once |
| CHANGE rated **High** | same as BLOCK |
| CHANGE rated Medium, or unrated | fix now, same session; write `fixed: <file:line>` on the card; no re-review |
| LOW | fix, or record on the card; no re-review |
| NOTE / INFO | not graded |

A CHANGE earns a re-run only if the reviewer wrote the word High and named the code or behaviour defect —
anything on the §6 list is dropped, whatever it is rated. "Re-run" and "re-review" mean the same thing here. Fixes are applied by whoever
drove the build: the session in `/implement`, the owning implementer in `/start-teams`.

## 4. Grade

Derived from code findings only, after the Medium/Low batch-fix:

| Open findings | Headline | Grade |
|---|---|---|
| any BLOCK / security High+ | Not yet | D (F if two or more, or data loss is possible) |
| any High, no BLOCK | Almost | C |
| any Medium still open | Almost | B |
| Medium all fixed-and-noted; Low / Info only | Ready | A |

Read top-down; the worst open finding wins. Low and Info never move the headline. If the person says
"ship it anyway", write that on the card — the headline still says what the findings say.

## 5. One re-run, then the person

Each gate gets at most one re-run (all affected reviewers in one batch). If BLOCK/High survives it, stop: the
card says Not yet, lists what is still open with `file:line`, and names one next action. No further reviewer
runs without the person saying so. An implementer re-spawn is a fix, not a run.

## 6. What a reviewer may not cite

Reviewers judge the diff's code, tests and behaviour, and the `CLAUDE.md` rules that code touches. They do
not file: stale docs, progress tables, ledgers, cards, how a result was written up, counts, or missing paperwork. If one
arrives, the orchestrator drops it from the grade and says so on the card. Comments and docstrings that
describe behaviour the diff changed are code, and count.

## 7. Spend, one line

Before: `Gate: 2 reviewers — security-reviewer (auth), code-reviewer (general)`. After, on the card:
`Gate ran: N runs · M re-runs`. Nothing about models or effort.

## 8. Missing reviewer

If a named reviewer is not in `.claude/agents/`, spawn `general-purpose` with that path's checklist pasted
verbatim and say so on the card; it still owes the path verdict. If no independent context can run at all,
the path is Not yet: "review not obtained".

## Project additions (not pack canon; §1–§8 above are)

**Dispatch model.** Every reviewer and critic agent in `.claude/agents/` pins `model: opus` +
`effort: max`; implementers pin `model: opus` + `effort: high`. A gate that spawns `general-purpose`
instead — the §8 fallback, and every merged run under `Gate intensity: lean` — has no frontmatter to
read, so it must pass `model: opus` **and** ask for "think hard" in the brief: the merged run cannot
inherit a specialist's `effort: max`. (Owner policy 2026-09-21, revised the same day when the Fable
limit was reached mid-gate; the superseded Fable pins and the full reasoning are in `settings.json`
`_MODEL_POLICY`. Batches 0–3 of the audit-remediation plan gate ran under the Fable policy — their
records say so and are not rewritten.)

**Same-finding recurrence.** If a gate's re-run (§5) returns a finding of the same class as the one it was
re-run to fix, stop before spending anything further and put the diagnosis to the person in one exchange.
A second instance of one class means the fix addressed the instance, not the cause; another round buys
another instance. Diagnosis is not a verdict — the card still reads what the findings say.

**Pre-2.0 citations.** Work recorded before 2026-09-21 cites `gate-rules.md` §§1–16 under the old
numbering, where §2–§8 named different rules than they do here. Those records are not rewritten: read
them against `.claude/_pre-2.0/gate-rules.md`, which is that canon, kept verbatim.
