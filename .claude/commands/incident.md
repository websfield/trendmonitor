---
description: The prod-down firefight. For when the site is down / users are locked out / payments are failing RIGHT NOW: it stabilizes FIRST (offers the rollback or mitigation from RUNBOOK.md before any root-causing), then diagnoses ("what shipped last?"), fixes through /implement's fast lane with every touched gate still running, and writes a short postmortem to memory. Do NOT use it for a normal-temperature customer bug that can wait for a proper fix — that's /triage; nor to ship a planned release — that's /release. If nothing is actually on fire, this is the wrong tool.
argument-hint: [what's broken, in plain words — "site is down", "payments failing", the error]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# /incident — stabilize first, then fix

The scariest moment for a one-person company is prod down at 2 a.m. with no colleague to call — and panic-editing live code is exactly how one outage becomes two. The pack has *pre*-deploy discipline (`production-reviewer`, `/release`) and *post*-fix discipline (Lessons), but nothing for the minutes in between. `/incident` is that discipline, and its whole value is the **order**: you **stabilize before you diagnose**. A panicking human reaches straight for the cause; the rail remembers to stop the bleeding first.

> This is a **fire** — something is broken for real users *right now*. It is not `/triage` (a customer-reported bug at normal temperature, reproduced and fixed properly) and not `/release` (shipping planned work). If nothing is actually down, stop and use one of those instead. And every state-changing action here still honors golden rule 8 — a fire is a reason to be *fast*, never a reason to fire an irreversible action unasked.

## Usage
```
/incident <what's broken, in plain words>
```
`$ARGUMENTS` is the symptom in the person's words ("checkout is 500ing", "nobody can log in"). If it's empty, ask the one question that matters — *what is broken for users right now?* — before anything else.

## Process

Use `TodoWrite` to track these steps — but Step 1 comes before everything, including reading much of the code.

### Step 1 — Stabilize FIRST (before any root-causing — this is the discipline)
**Stop the bleeding before you understand it.** Do not start reading code to find the cause yet. Reach for the fastest safe way to get users back to working:
- **Read `RUNBOOK.md`'s Rollback section** (written by `/bootstrap-claude-pack`) and offer the mitigation it names — usually rolling back to the last known-good deploy, or a documented mitigation (feature flag off, maintenance page, failover).
- **Confirm before acting, in one fast question — and split reversible from irreversible.** A reversible mitigation (redeploy the previous build, flip a flag) needs one quick "OK to roll back to `<last-good>`?" and then `/incident` can run it. An **irreversible** step (a destructive restore, a data-losing rollback) is **presented for the person to run themselves** — you lay out the exact command and its consequence, you do not fire it (golden rule 8; the same present-vs-execute split `/release` Step 5 uses). Never a silent auto-rollback; never a slow ceremony either — one clear question, then move.
- **No RUNBOOK, or no rollback path in it** → say so plainly and help identify a mitigation now (what was the last deploy; can it be reverted; is there a flag). Never pretend a rollback path exists. Absence of a runbook is a reason to name the gap in the postmortem (Step 4), not a reason to stall the fire.
- If stabilizing isn't possible (no deploy history, no mitigation), say that honestly and move to diagnosis with the outage still live — but say it, don't let "I couldn't stabilize" pass silently.

Once users are back (or you've confirmed you can't stabilize), and only then, continue.

### Step 2 — Diagnose (what changed?)
With the bleeding stopped, find the cause — evidence, not guessing. Check the most specific, most likely symptom first, not the whole system — don't confirm your favorite theory, rule the alternatives out.
- **"What shipped last?"** — the single highest-yield question. Read the recent **progress ledgers** (`docs/progress/<feature>/ledger.md` `complete` lines) and recent git history: an outage minutes after a deploy is almost always that deploy.
- **Read the signal** — `RUNBOOK.md`'s Observability section points at the logs / dashboard / error tracker; go there for the actual error, don't theorize from the symptom.
- Name the cause with evidence (the error, the commit, the config change) before you touch anything — a fix for a cause you haven't confirmed is another guess shipped into a fire.

### Step 3 — Fix through the fast lane (every gate still runs)
An emergency is not a license to skip the gates — it's when a skipped gate does the most damage. **Read `.claude/commands/implement.md` and follow its Fast lane section** with a one-line brief naming the surface the fix touches. That runs the entry gate and **every** reviewer whose Critical Path the fix's diff touches (the generic `code-reviewer` if none), plus the Definition of Done — the same gates a normal fast-lane fix runs. The escape hatch governs unchanged: the moment the fix wants to leave the named surface, stop and upgrade to planning — a fire is exactly when the temptation to widen silently is strongest, and exactly when it's most dangerous.
- If Step 1 already stabilized users, this fix is the *permanent* repair done at normal care, not a second panic-edit on top of the fire. That's the payoff of stabilizing first: you fix from safety.

### Step 4 — Postmortem to memory (so it doesn't happen twice)
A short, honest note while it's fresh — **what** broke, **why**, **impact** (who/how long), and how it was stabilized and fixed. Then, offered **once**, never silent (the same discipline as `/go`'s "remember expensive mistakes"):
- a **`CLAUDE.md` → Lessons** line if this could recur — and, where a diff pattern could have caught it, a **guardrail rule** too (per `/go` and the `authoring-guardrail-rules` skill);
- a **`RUNBOOK.md`** fix if the incident exposed an operability gap (no rollback path, a missing mitigation, an untested backup) — the runbook is how the *next* fire is shorter;
- a **`DECISIONS.md`** line if a load-bearing call was made mid-fire (accepted a data-loss tradeoff to restore service, chose a mitigation approach).

Then close with the one line a rattled person needs: **are users back, is the permanent fix shipped through the gates, and what got logged where** — the "you're clear" beat, so the fire has a definite end, not just a trailing offer.

## Hard rules
- **Stabilize before you diagnose.** The order is the whole point; reaching for the cause before stopping the bleeding is the mistake this command exists to prevent.
- **Golden rule 8 holds even mid-fire.** A reversible mitigation runs on one fast confirmation; an irreversible one is presented for the person to run — never fired unasked, never silent.
- **No gate skipped for the emergency.** The fast lane drops plan *paperwork*, never the entry gate, the reviewer gates, or the Definition of Done.
- **Don't commit, push, or deploy on your own.** A reversible mitigation runs only after one confirmation; an *irreversible* step — a destructive restore, a data-losing rollback — is presented for the person to run, never fired for them. (When a "rollback" is one-way, it's the irreversible case: present it, don't run it.)
