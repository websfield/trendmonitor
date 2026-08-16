---
description: The weekly founder brief. Come back after days away and get one page — what shipped, what's stuck, what was decided, what users asked for, and the one thing to do next — assembled from the records the pack already keeps (progress ledgers, report cards, DECISIONS.md, FEEDBACK.md, git log). Read-only; offers (never silently writes) to save the brief so the next recap starts where this one ended. Do NOT use for a shipping changelog — that's /release. Do NOT use to check whether the pack is healthy — that's /doctor — or for a risk ranking of the codebase — that's /audit. Do NOT use to start work — that's /go, which /recap's closing recommendation points you at.
argument-hint: [optional: "since <date>" — defaults to since the last recap, release, or 7 days]
allowed-tools: Read, Glob, Grep, Bash, Write, AskUserQuestion, TodoWrite
---

# /recap — what happened while I was away?

A solo founder wears every hat, and a week of sales calls or day-job fires erases the build context completely. The answer to "where was I?" already exists — the pack records everything as it works — but it's scattered across ledgers, report cards, journals, and git history. `/recap` assembles it into **one page**: shipped / stuck / decided / heard / the one thing next. Context recovery in one read, not an hour of archaeology.

**Read-only, with one offered write.** This command builds and edits nothing, runs no mutating command, and launches no work. Its only write — saving the brief — is offered, never silent.

## Usage
```
/recap                    # since the last recap (or last release, or 7 days)
/recap since 2026-07-01   # explicit window
```

## Process

Use `TodoWrite` to track the steps.

### Step 1 — Bound the window
Newest `docs/progress/recap/<yyyy-mm-dd>.md` → the window starts there. None → the newest release record (`docs/progress/release/<yyyy-mm-dd>.md`). Neither → the last 7 days. An explicit `since <date>` always wins. Say which boundary you're using in one line.

### Step 2 — SHIPPED (what actually landed)
Aggregate, in-window and cited to disk:
- `complete` lines across every `docs/progress/<feature>/ledger.md`;
- fast-lane report cards (`docs/progress/quick/*.md`) and release records;
- then cross-check `git log` (read-only) for in-window work with **no** ledger trace — list it plainly as *"shipped outside the pack's records"* with the commit subjects. Never upgrade a bare commit into a feature claim: every line here traces to something on disk (the `outbound-truth` discipline applies to your own brief too).

### Step 3 — STUCK (what's waiting, and on what)
- Phases blocked on an unproven predecessor: walk in-progress master plans (`docs/plans/*-master-plan.md`) with the proof-on-disk rule — a `Complete` cell without its evidence is *unproven*, not done.
- Report cards standing at **Almost** or **Not yet** (phase reviews, fast-lane cards) with their headline finding.
- A still-red entry baseline (`docs/progress/entry-baseline.md`) — the count and direction (shrinking or stalled).
- Open items on the newest audit register (`docs/progress/audit/<date>.md`), if one exists.
Each stuck item names *what unblocks it* in a few words.

### Step 4 — DECIDED & HEARD
- `DECISIONS.md` lines dated in-window (verbatim — they're already one-liners).
- `FEEDBACK.md` **open** asks: the count, plus the newest one or two verbatim.

### Step 5 — THE ONE THING NEXT
Don't invent a fresh opinion — reuse the front door's own ladder: **read `.claude/commands/go.md` action 1 and apply its ordering** (an in-progress plan's next unproven phase first; when nothing's mid-build, the open `FEEDBACK.md` asks ranked against a filled `NORTH_STAR.md`; failing both, invite the person to say what they want). State **one** recommendation with its one-line reason, and **offer** it — `/recap` never launches work.

### Step 6 — Render, print, offer to save
Print the brief as one page, in plain words, in this shape:

```
# Recap — <window start> → <today>
**Shipped:** <n items, one line each — or "nothing recorded in this window">
**Stuck:** <one line each: what · why · what unblocks it — or "nothing waiting">
**Decided:** <the DECISIONS lines — or "no entries">
**Heard (users asked):** <open-ask count + the newest — or "no open asks">
**Next:** <the one recommendation, and why — in one sentence>
```

Then **offer once** to save it to `docs/progress/recap/<yyyy-mm-dd>.md` — that file is the next recap's window marker, so saving is what makes the window advance on its own (same pattern as `/release`'s changelog). Declining is fine; the next recap just falls back to the release/7-day boundary.

## Hard rules
- **Every claim traces to disk.** Ledger line, report card, journal entry, commit — cite it. A brief that flatters is worse than no brief (`outbound-truth` governs here too).
- **Absence-safe, honestly.** No ledgers, no journal, no feedback file, not a git repo — each section says "none found" and moves on. A brand-new repo gets one honest line: *"Nothing recorded yet — run `/go <what you want>` and the records this command reads will start existing."*
- **Read-only except the one offered save.** No builds, no edits, no commits, nothing launched — the Next recommendation is an offer that hands off to `/go`.
- **One page.** If a busy week overflows the shape, tighten the lines — never spill to a second page; detail lives in the records the brief cites.
