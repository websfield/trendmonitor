---
description: Write and maintain the docs your USERS read — a getting-started guide, per-feature how-tos, and an FAQ under docs/help/ — derived from what actually shipped and written for a reader who has never seen the repo. Gated by the outbound-truth skill: a capability the docs describe must trace to shipped code or recorded evidence, so the help can never promise what the product doesn't do. Re-run after features ship to catch drift (new pages offered, changed pages flagged, removed features offered for retirement — never deleted silently). Do NOT use for developer docs (README, architecture, CLAUDE.md) — that's /sync-docs. Do NOT use for release notes — that's /release. Never publishes or pushes anywhere — the files are yours to put on a docs site or in the app.
argument-hint: [optional: a feature name to document, or blank for the full drift pass]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite
---

# /user-docs — the docs your users read

`/sync-docs` keeps *developer* docs honest; nothing produced the docs *customers* read — and for a one-person company every undocumented feature converts directly into a support interrupt (the very ones `/triage` absorbs). Writing user docs is also the classic solo-founder procrastination casualty. `/user-docs` makes them a command: derived from what shipped, written for the customer, and incapable of overclaiming.

> The gate above all else: **the `outbound-truth` skill is the canon here** — read it and apply its trace rule and verdict mapping exactly. Every capability these docs describe must trace to one of its evidence classes. A claim that doesn't trace doesn't get written; where behavior is unclear, the doc says *less*, never guesses. Overclaim = the draft isn't offered.

## Usage
```
/user-docs                 # full pass: create or drift-check the whole docs/help/ set
/user-docs <feature>       # document (or update) one feature's how-to
```
`/go` offers this as a closing step when user-visible work ships.

## Process

Use `TodoWrite` to track the steps.

### Step 1 — Establish what shipped and is user-visible
From the records and the code: ledger `complete` lines (`docs/progress/**/ledger.md`), release records (`docs/progress/release/*.md`), briefs/plans for context — then verify against the **actual surfaces a user can touch** (routes/screens/CLI commands/API endpoints). The docs describe only what a user can reach; internals stay out. Absence-safe: nothing user-visible shipped yet → say so honestly ("nothing to document yet") and stop — **don't create `docs/help/` with nothing to put in it.**

### Step 2 — Inventory the existing doc set
Read what's already under `docs/help/` (if anything): `getting-started.md`, per-feature how-tos (`docs/help/<feature>.md`), `faq.md`. The default shape is plain markdown in those three forms — voice and venue (docs site, in-app help) are product-specific, so the files are the deliverable and publishing is the person's move.

### Step 3 — Write for the customer reader
Create or update pages, in the customer's language:
- **Task-oriented** — "How do I …", not "The system implements …". No repo jargon, no file paths, no internal names a user never sees.
- **Traced** — each capability described checks against Step 1's evidence before it's written (the outbound-truth gate). Numbers (limits, quotas, prices) need a recorded source or they stay out.
- **Honest about edges** — if a flow has a known limitation, the doc says it plainly; hiding it converts into a support ticket.

### Step 4 — Drift pass (on re-runs)
The comparison basis is **records + surfaces vs the page set**: diff the ledger `complete` lines and release records since the docs were last touched — plus the real user-visible surfaces from Step 1 — against the pages under `docs/help/`:
- **Shipped, no page** → offer a new how-to.
- **Changed, page exists** → flag the stale sections (auto-fix the mechanical facts; ask before rewording — the `/sync-docs` split).
- **Removed, page remains** → offer to retire the page; never delete silently.
Never silently rewrite existing voice — the person may have hand-tuned it for their audience.

### Step 5 — Report
List pages written / updated / flagged / offered-to-retire, each with the evidence its claims trace to (one line per page). Remind, once: these files don't publish themselves — putting them on a docs site or in the app is your move.

## Hard rules
- **Outbound-truth governs (pointer, not paraphrase).** The canon lives in the `outbound-truth` skill; this command applies it. Overclaim = the draft isn't offered — no exceptions for "it'll ship next week".
- **The reader has never seen the repo.** If a sentence needs the code to make sense, it's a developer doc — move it to `/sync-docs`' territory.
- **Lane split with `/sync-docs`:** this command owns `docs/help/**` (customer voice); `/sync-docs` owns developer docs and only *flags* drift it notices in help pages.
- **Absence-safe.** No ledgers, no releases, no user-visible surface → an honest "nothing to document yet", not scaffolding for its own sake.
- **Never publishes.** No pushing, posting, or deploying docs anywhere (golden rule 8). Respect the git policy — no commits unless asked.
