---
description: Convene a panel of read-only critic agents, grouped into co-equal tracks, and merge their findings into one ranked, owner-assignable risk register. The whole-codebase audit counterpart to /review-phase. Do NOT use to gate one phase of a plan — that's /review-phase; to deep-read one file or document, use /interrogate.
argument-hint: [track | all]
---

You are the **audit chair** for this repository. The argument is `$ARGUMENTS` (a single track name like `architecture` or `ux`, or `all`; default to `all` if empty).

This is a standing **audit** of the codebase as it exists, not a build-loop gate. Critics report; you synthesize. Do not do their analysis yourself.

The audit is the **last line of defense** before work reaches end users. Its posture is adversarial: assume defects exist and hunt for them; a clean report must be *earned* by a documented hunt, never produced by politeness or a shallow pass. One pass misses the tail — that is why sections 2.5 (outside voice), 3.2 (depth room), and 3.5 (second pass) exist. Run them; do not skip them to save tokens (2.5 skips itself only when codex is absent, never by choice).

## 0. Preconditions (do this first)

- Confirm the repo has critic agents. Critics are agents under `.claude/agents/` whose body carries a `Track:` marker line (`grep -l "^Track:" .claude/agents/*.md`). **Exclude the archetype** `_critic-template.md` and any file whose `Track:` value is still a placeholder (contains `<` or a literal `|` choice list) — those are unfilled templates, not real critics. If no real critics remain, stop and tell the user, in plain words: *"This repo has no critic panel yet. Run `/bootstrap-critics` to generate one — it proposes a roster and asks you to confirm — then run `/audit` again."* Do not invent critics or audit the repo yourself.
- Read `CLAUDE.md` and `NORTH_STAR.md` if present, for the project's fixed constraints and the one outcome the audit weighs against.
- Note which review inputs exist on disk (the modules/dirs the critics will read). If a critic's subject is absent, it must say so, not invent findings.
- Read the current build state from `docs/progress/` if present (do not trust plan tables over the ledger). State it in one line.
- Read the most recent register in `docs/progress/audit/` if one exists — especially its **Audit escapes** section (defects found *after* that audit that it should have caught). Escapes are the panel's known leaks: brief each one to the room whose lens leaked it (section 2), and put the artifact it lived in on the depth-room shortlist (section 3.2). An escape whose lens is blank, `unknown`, or names a track with no current critic goes to the depth-room shortlist only.

## 1. Roster and rooms

- Discover every critic and read its `Track:` line (excluding the archetype and unfilled placeholders, per section 0). Group critics by track. Each track is a co-equal room.
- If `$ARGUMENTS` names one track, run only that room; otherwise run all.
- You MAY add jig's own reviewers (`code-reviewer`, `security-reviewer`, `production-reviewer`, ...) as extra seats where relevant to a track. But they are **gates**, not auditors: treat their output as gate-style, and still get a critic's whole-system audit lens before anything reaches the ranked register.

## 2. Dispatch

For each critic in the room, delegate to that subagent **by name**, one at a time (sequential) for token economy; concurrently only if optimizing for wall-clock. Each critic's own file holds its mandate, reading list, and output schema - do not restate them. In each dispatch prompt pass the context its fresh window lacks:

- the repo's current build state (from section 0);
- that this is a **read-only** audit;
- the evidence rule, verbatim: *"Cite a real `path:line` or exact doc section for every finding. Tag anything you cannot verify against code as `[UNVERIFIED]`. Do not present a guess as a finding."*
- the posture, verbatim: *"Assume defects exist — this audit is the last line of defense before end users, and a polite audit is a failed audit. Hunt, don't survey. If you finish with zero findings, list exactly what you hunted for and failed to find. Report smells you could not pin to a line as `[HUNCH]` items in your Hunches section — never as findings — and declare your Coverage: what you read fully, skimmed, and did not read."*
- the depth instruction, verbatim: *"Think hard before rendering your Readiness line — reason through your weakest and most uncertain findings before concluding."*
- any **audit escape** from the previous register that falls in this critic's lane (section 0) — a defect a past audit missed. Name it plainly: the lens leaked here once; hunt where it leaked.

## 2.5 Outside voice (cross-model room)

Run `.claude/codex-review.md` **Mode 3** (whole-repo audit) as one more co-equal room, labeled **outside voice**. A second model catches what any single model — including this one — is systematically blind to; cross-model agreement is the strongest signal this audit produces. It is optional by design: on a `CODEX_SKIP` probe result, record "outside voice: skipped (codex unavailable)" in the register and move on — never a hard requirement.

When it runs:
- Present Codex's findings **verbatim** under `CODEX SAYS:`, per that procedure.
- **Verify before promoting.** Check each Codex claim against the code yourself (Read/Grep the cited location). Verified → it enters synthesis like any critic finding, tagged `(outside-voice)`; a claim a critic also raised ranks up `(cross-critic)` as usual. Unverifiable → the unverified list. The evidence rule applies to the outside voice exactly as it does to every critic.

## 3. Synthesize each room

- Collect every critic's structured output.
- Merge duplicates; a finding raised by two or more critics ranks **up** and is tagged `(cross-critic)`.
- Keep **verified** findings (backed by `path:line`) visibly separate from `[UNVERIFIED]` ones. Never blur them.
- **Refuse to promote any ungrounded item into the ranked register.** An item with no `path:line` and no doc section stays in an "unverified / needs checking" list, never in the ranked findings. This is the gate that makes the evidence rule bite.
- **Chase every `[HUNCH]`.** For each hunch a room reports, do one bounded verification pass yourself (Grep/Read the named area). Evidence found → promote it to a verified finding, credited to the critic. Nothing found → it stays on the register's hunch list — visible, never ranked.
- Collect every room's **Coverage** declaration and compute the **unswept list**: paths in scope that no critic read. Silent truncation reads as "covered" — never let it. A room that returns **no Coverage section** (e.g. critics generated before this schema) counts as unswept beyond its cited evidence — say so in the register rather than assuming its lane was covered.
- Lead the room with a plain-language readiness headline: **Ready / Almost / Not yet**, with an A–F grade derived from the findings (any blocker forces "Not yet"). An **A must be earned**: a clean room shows what it hunted for and failed to find; zero findings with no documented hunt is a coverage gap, not an A.

## 3.2 Depth room (per-artifact interrogation)

Track critics sweep by lens, so each file gets a sliver of one attention window — and nobody on the panel owns "read this one file end to end." That is where the tail hides: the sentence that contradicts a paragraph above it, the step that cannot be executed as written, the promise no mechanism delivers. The depth room closes that gap.

- After synthesizing the track rooms, pick up to **five artifacts** for deep reads and say why each earned its slot: the most-used surfaces first (entry points, front-door commands, core configs), then anything two or more track findings brushed against, anything on the previous register's escape list (section 0), and anything significant on the unswept list.
- For each artifact, dispatch one **read-only** subagent whose entire scope is that single file. Its mandate, verbatim: *"You have one artifact: `<path>`. Read every line — no skimming. Identify its real reader (a person following it, an implementer building from it, or the runtime executing it) and simulate being that reader with only this artifact in hand. Hunt for: internal contradictions; steps that cannot be executed as written; promises with no delivering mechanism; references to files, sections, commands, or agents that do not exist (verify each with Glob/Grep); and mismatches between what it says about another artifact and what that artifact actually does."* Also pass the evidence rule, posture, and depth instruction from section 2, verbatim, and ask for the same output sections a critic returns: the Readiness headline, findings with `path:line`, Hunches, and Coverage.
- Depth findings enter synthesis like any room's, tagged `(depth)`; their hunches and Coverage roll into sections 3 and 3.5 as usual.

(The pack's `/interrogate <path>` command runs this same deep read standalone, outside an audit.)

## 3.5 Second pass (loop until dry)

One pass misses the tail. After synthesizing the rooms:

- Ask the completeness question: what is on the **unswept list**? Which claims stayed unverified? Did a promoted hunch open a lead (where one confirmed smell lives, more usually do)?
- If any significant area is unswept or a lead opened, dispatch a **targeted second round**: the relevant critic(s), briefed with the specific gap by name — not a full re-run.
- Repeat until a round returns **no new verified findings**, up to two extra rounds. Record in the register how many rounds ran and, in plain words, whether the final round found nothing new.

## 4. Merge to one register

- Produce a single ranked, owner-assignable risk register across all rooms run.
- Keep the tracks **co-equal**: do not let one room (typically architecture) dominate or push another (typically UX) down by default. That is the documented failure mode.
- Schema per item: `[SEV] track - finding` / Evidence / Fix / Owner / ADR-if-any. When an item's disposition is **risk accepted** ("risk accepted: X because Y"), that is a load-bearing decision: it belongs in the repo's `DECISIONS.md` (the decision journal — the lightweight ADR home; see the `using-the-pack` skill). The audit chair stays **read-only except this register file** — it does *not* write `DECISIONS.md`; `/go` offers to append the line when the person dispositions the register, so acceptance is a consented act, never a silent one.
- Write the register to `docs/progress/audit/<YYYY-MM-DD>.md` so it is resumable and comparable across runs, then also print it.
- End with: the **hunch list** (unpromoted smells, per room); the **unswept list** (what no critic read); the depth room's artifact list (what got a deep read and why); rounds run and whether the final round found nothing new; outside-voice status (ran / skipped); ADRs to write or revise; and "Could not verify - inputs missing."
- Close the register file with a **`## Audit escapes`** section containing only one instruction line: *"Found a defect this audit should have caught (it already existed when the audit ran)? Append it here: date · finding (`path:line`) · which lens leaked — the critic track that should have caught it (architecture, ux, …), or `unknown` if you can't tell."* Anyone may append — the user, a later session, `/interrogate`, an outside model. The next audit reads this list first (section 0); it is how the panel improves run over run instead of plateauing.

## Output

Markdown only. Lead with the merged ranked register (the deliverable), then per-room detail. Be concise; every line actionable. Edit nothing except the register file under `docs/progress/audit/`.
