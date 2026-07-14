---
description: The act-of-shipping gate. After the code is judged *ready*, /release makes the *release itself* disciplined — a plain-language changelog of what's going out, a migration/env checklist, a rollback plan named *before* the deploy, a post-deploy smoke test, and a report card — and it never deploys, migrates, commits, tags, or pushes on its own. Do NOT use it to judge whether the code is ready (that's the on-demand production-reviewer, or your phase reviews); and not for a live outage where the priority is to stabilize *first* — that's `/incident`, a different discipline.
argument-hint: [optional: what's shipping, or the version/release name]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# /release — the act of shipping, gated

The Definition of Done ends at reviewed code + synced docs. But for a one-person company with no second pair of eyes, the *release itself* — the deploy, the migration, the "did it actually come up?" — is the riskiest **unreviewed** step of all. `/release` gates that act. It does **not** re-judge whether the code is ready — that's the readiness gate (`production-reviewer`, or your phase reviews). It makes the release *disciplined*: what's going out, what config/migration it needs, how to undo it **before** you do it, and proof it came up healthy — then a report card. It never deploys or commits on its own (golden rule 8).

> This gate rides **on top of** the readiness gate; it never replaces it. Ready code is the precondition, not the output. And this is planned shipping at normal temperature — **not** the live-outage firefight where the first move is to stabilize before anything else; if the site is already down, that's `/incident`, so stabilize first, don't run a release checklist on a fire.

## Usage
```
/release [optional: what's shipping, or the version name]
```
`$ARGUMENTS` names the release if the person gave one; otherwise infer what's shipping in Step 2.

## Process

Use `TodoWrite` to track these steps.

### Step 1 — Confirm readiness (ride on top of the readiness gate, never replace it)
Establish that the code going out has **already** been judged ready — `/release` ships proven work, it doesn't re-prove it. Look for recorded readiness proof on disk: the shipped phases' reviews (`docs/progress/<feature>-phase-<N>-review.md` marked Ready), or a fast-lane report card (`docs/progress/quick/<yyyy-mm-dd>-<slug>.md`); and, for a **production target** (CLAUDE.md / NORTH_STAR.md declares it, or the person signals production intent), a `production-reviewer` verdict of Ready.
- **Recorded and Ready** → proceed.
- **No readiness proof, or it's Almost / Not yet** → **stop and run the readiness gate first**: read `.claude/commands/review-phase.md` and follow it (or, for a production target, dispatch the `production-reviewer` on the diff), get to Ready, *then* return here. `/release` gates *shipping*, not *readiness* — it never ships code that hasn't cleared its own gate.

### Step 2 — Build the changelog (what's actually going out, in plain words)
First, bound the release — what's new **since the last one**:
- Prefer the **last release marker**: the most recent prior record at `docs/progress/release/<date>.md`, or (if the repo tags releases) the last git tag.
- **No prior release** → this is the first; the boundary is "all completed work to date."

Aggregate what shipped inside that window from the per-feature **progress ledgers** (`docs/progress/<feature>/ledger.md` `complete` lines, across every feature closed since the boundary) plus any `DECISIONS.md` entries in the window, and write a plain-language changelog to `docs/progress/release/<yyyy-mm-dd>.md` — grouped by feature, in words a *user* understands, not a diff reader. That file **is** the next release's boundary marker, so the window advances on its own.

### Step 3 — Migration & config checklist (what must happen, in what order)
List every operational precondition the deploy needs, from the diff/ledger and `RUNBOOK.md`'s **Configuration** section (written by `/bootstrap-claude-pack`):
- **New env / config** — any env var or config key this release requires, cross-referenced to the runbook's Configuration inventory (names and *locations*, **never values** — golden rule 2). A key the release needs that the runbook doesn't list is a gap to close *before* deploy.
- **Data migrations** — any schema/data migration (a change to the database's shape or contents), whether it's **reversible**, and the order it runs relative to the code deploy (migrate-then-deploy vs deploy-then-migrate). An irreversible migration is a stop-and-confirm, not a checklist tick.

**Absence-safe:** no `RUNBOOK.md` → say so, build the checklist from the diff alone, and note that `/bootstrap-claude-pack` would generate the runbook this step wants.

### Step 4 — Name the rollback plan BEFORE deploying (the load-bearing discipline)
Before **anything** goes live, name how it comes back. Pull `RUNBOOK.md`'s **Rollback** section and state the exact rollback path for *this* release: the steps to revert the code, and to reverse (or forward-fix) any migration from Step 3. **No runbook, or no rollback path recorded → name one now, and don't deploy without it.** A release you can't undo is the one that turns a bad deploy into an all-nighter — naming the undo *first* is the whole point of the gate.

### Step 5 — Deploy (guided, never automatic)
Present the deploy steps from `RUNBOOK.md`'s **Deploy** section (absence-safe: from the repo's deploy config — CI job, `Procfile` / `fly.toml` / `vercel.json` / equivalent — if there's no runbook). **`/release` never runs an irreversible deploy on its own** (golden rule 8): it lays out the steps *and* the Step-4 rollback path, then either the person deploys, or they explicitly confirm and `/release` runs a named, reversible step. Anything one-way waits for an explicit go-ahead — and if you catch yourself reasoning that a deploy is *probably* safe to fire unprompted, that reaching is the signal to stop and ask.

**Not everything "deploys."** For a library, CLI, or package, shipping is *publish-to-registry + tag* (npm publish, a GitHub release, a crate/gem push), not a running service — that publish is the irreversible act this step guards (a published version can't be unpublished cleanly), so it waits for the same explicit confirmation, and Step 6's smoke test becomes "install the published artifact fresh and exercise it" rather than a health endpoint. Read "deploy" throughout as "the act that makes this release real to users," whatever shape that takes for this project.

### Step 6 — Post-deploy smoke test (did it actually come up?)
After the deploy, verify the release is live and healthy — a smoke check against `RUNBOOK.md`'s **Observability** section (the health endpoint, the log/dashboard to watch, the one critical path to exercise). "It deployed" is not "it works." **A failed smoke test triggers Step 4's rollback path — not a debugging session on live users.** Stabilize by rolling back, then diagnose from safety.

### Step 7 — Report card + remember the call
Write and present a release **report card** in `/review-phase` Step 6's format — a plain-language **Ready / Almost / Not yet** for the *release*, then one line each: readiness confirmed · changelog written · migration/config checklist · rollback named · deploy · smoke test — each with its evidence (the file, the command, the result). Then, offered **once**, never silent (the same discipline as `/triage` and `/go`):
- a **`DECISIONS.md`** line if a load-bearing release call was settled — shipping at "Almost", accepting a known gap, choosing a particular rollback approach: `- <today, YYYY-MM-DD> — <decision> — because <why>` (the decision journal; canon in the `using-the-pack` skill).
- a **`CLAUDE.md` → Lessons** line (and a guardrail rule, if a diff pattern can catch it) if the release surfaced a mistake that could recur, per `/go`'s "remember expensive mistakes".

## Hard rules
- **`/release` gates the act of shipping, not readiness.** It never ships code that hasn't cleared its readiness gate (`production-reviewer` / phase reviews); a not-yet-Ready readiness verdict sends you back to Step 1, not forward.
- **The rollback plan is named *before* the deploy, always.** No rollback path → no deploy.
- **Never deploy, migrate destructively, commit, tag, or push on your own.** Every irreversible step waits for explicit confirmation (golden rule 8) — the same reaching-for-reasons-it's-fine that the rule warns about is the signal to stop and ask.
- **No step skipped for a "small" release.** The smoke test and the named rollback are exactly what small releases skip — and exactly what a bad small release needed.
