---
description: Support-to-fix lane. Paste a bug report or customer email; it reproduces the issue against the real code, fixes it through /implement's fast lane (every gate, no plan paperwork), and drafts — never sends — the customer reply. The pack as your support engineer. Do NOT use for a live outage where the priority is to stabilize first — that's /incident; or to plan a new feature — that's /shape → /create-plan.
argument-hint: [paste the bug report or customer email]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# /triage — from a bug report to a shipped fix

A customer-reported bug is the one-person company's most common interrupt, and it arrives as prose — an email, a support ticket, a "hey, this is broken" — not a spec. `/triage` turns that prose into a **reproduced, fixed, and reviewed** change, and hands you a drafted reply to send yourself. It composes pieces the pack already has: it reproduces first (evidence, not assumption), fixes through `/implement`'s **fast lane** (shipped gates, no plan documents), and never sends anything outbound on its own.

> This is a **normal-temperature** bug — reproduced and fixed properly. It is *not* the firefight for a live outage where users are locked out and the first move is to stabilize (roll back / mitigate) *before* root-causing; if the priority is "stop the bleeding right now," that's `/incident` — say so and route there, don't reproduce-then-fix a fire. And it is not feature planning: if the report is really a feature request in disguise, route it to `/shape`.

## Usage
```
/triage <paste the bug report or customer email>
```
`$ARGUMENTS` is the report in the reporter's words. If it's empty, ask for the paste before doing anything else.

## Process

Use `TodoWrite` to track these steps.

### Step 1 — Read the report (separate the signal from the prose)
**First, is this a live fire?** If the report describes an *active outage* — users locked out right now, data at risk, the site down, payments failing — the priority is to **stabilize first** (roll back / mitigate) *before* any reproduce-and-fix, and this normal-temperature lane is the wrong tool: say so plainly and route to `/incident` (read `.claude/commands/incident.md` and follow it), which stabilizes before diagnosing. Only when it's a bug that can wait for a proper fix do you continue below.

Parse the pasted report into: the **symptom** (what's wrong, in the user's words), any **repro steps / environment / version** they gave, the **affected area** (the feature or surface it points at), and the **reporter's identity** (needed only for the reply draft — a name/handle, never credentials). If the report is too thin to act on (no symptom you can pin down), ask **one** focused question for the missing piece rather than guessing.

### Step 2 — Reproduce first (evidence, not assumption)
**Reproduce the failure against the real code before touching anything.** Follow the reporter's steps (or the most likely path when they gave none), and confirm you see the actual broken behavior. This is the triage discipline: a fix for a bug you haven't reproduced is a guess.
- **Reproduced** → capture the exact failing behavior (the command/route, the wrong output, the error) — this is both the fix target and the evidence the reply's "what was wrong" must trace to.
- **Can't reproduce** → say so plainly and ask the reporter (via the person) for the missing specifics — version, exact steps, environment, a screenshot. Never fix a phantom; a change with no reproduced failure to verify against can't be shown to work.

### Step 3 — Write the fast-lane brief from the repro
The reproduction pins the surface, so you can write the clear-and-contained brief the fast lane needs. Write `docs/plans/<feature>-brief.md` (the same path and clear-and-contained shape `/shape` and `/implement`'s fast lane use — pick a short `<feature>` slug for the bug) with:
- `**Request (as stated):**` the reporter's symptom, verbatim or close.
- `**Chosen scope: As asked** — fix <symptom>` — the one-line definition of the fix.
- `**Surface:** <the closed set of files/routes the repro implicates>` — the real, checkable set the fix will touch.

That `Surface:` line is exactly what admits the change to `/implement`'s fast lane. If the reproduction shows the real fix is bigger than a nameable surface — it needs a new dependency, a data migration, or spans multiple phases — **do not force it through the fast lane**: say so and route to planning (`/shape` if the scope itself is unclear, else `/create-plan <feature>`), carrying the repro forward.

### Step 4 — Fix through the fast lane (gates without the paperwork)
**Read `.claude/commands/implement.md` and follow its Fast lane section** with the brief from Step 3. That runs the full gate set — the entry gate (typecheck/lint/test clean, or no new failures vs a baseline), **every** reviewer whose Critical Path the fix's diff touches (the generic `code-reviewer` if it touches none), the Definition of Done, and a report card. Test-first where practical: a test that reproduces the bug (red → green) is the proof the fix holds. The fast lane's **escape hatch** governs unchanged — the moment the fix wants to leave the named surface, stop and upgrade to the plan lane; never widen silently.

### Step 5 — Draft the customer reply (never send)
Draft a plain-language reply for the person to review and send themselves: **acknowledge** the report, **what was wrong** (from the reproduced failure in Step 2), **what's fixed**, and the **next step** (deploy timing, a workaround until then, or "please confirm it's resolved on your end").
- **Constrain every claim to the verified diff.** "What's fixed" may state only what the reproduced fix and its passing gates actually establish — never promise a fix the evidence doesn't back, a timeline you don't control, or a capability that didn't ship. An unverifiable claim in outbound copy is exactly the overclaim the pack refuses in its own docs.
- **Draft only — it is never sent** (golden rule 8: anything leaving the repo waits for the person). Present the draft inline and save it alongside the fast-lane report card at `docs/progress/quick/<yyyy-mm-dd>-<slug>-reply.md`, so the person can copy, edit, and send it on their own channel.
- **No reporter to reply to** (an internal bug, no contact) → skip the reply; say so.

### Step 6 — Report
Give a plain summary: the fast-lane **report card** (readiness, what was fixed, gate results), the **drafted reply** (or "no reply drafted — internal report"), and — offered **once**, never silent — a `CLAUDE.md` **Lessons** line (and a guardrail rule if a diff pattern can catch it) if the bug looks like it could recur, per `/go`'s "remember expensive mistakes"; a `DECISIONS.md` line if the fix settled a real trade-off (the decision journal — see the `using-the-pack` skill); and, **if the customer's message carried a feature ask alongside the bug** ("…and it'd be great if it also did X"), a `FEEDBACK.md` line so that ask becomes a ranked "what's next" candidate instead of being lost (the feedback ledger — same skill).

## Hard rules
- **Reproduce before you fix.** No reproduced failure → no fix; ask for what's missing instead.
- **The reply is drafted, never sent**, and every claim in it traces to the verified fix.
- **No gate is skipped.** The fast lane drops plan *artifacts*, never the entry gate, the reviewer gates, or the Definition of Done. If the fix outgrows the named surface, upgrade to the plan lane — don't route around the gates.
- **No commit or branch unless the person asks.**
