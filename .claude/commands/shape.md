---
description: Product / founder mode. Before planning, pressure-test whether you're building the right thing. Reframes your request from the user's point of view, finds the "10-star" version hiding inside it, aligns it to the North Star, and writes a short brief the next step consumes — small clear asks ride /implement's fast lane (no plan documents), everything else goes to /create-plan. Proportional — a small, clear request passes straight through. Recommends; you decide the scope.
argument-hint: [what you want to build, in plain words]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite
---

# /shape — are we building the right thing?

This is **founder mode**. Most requests are stated as the literal mechanic ("add a photo upload") when the real job is bigger ("help sellers create listings that actually sell"). A change implemented from the literal ask can be perfectly built and still be the wrong thing. `/shape` exists to catch that **before** any planning or code — and to capture what the person actually wants, even when they didn't have the words for it.

> This directly serves the project's reason to exist: that anyone, regardless of how well they can specify what they want, ends up with what they actually wanted. `/shape` is the bridge from "what they typed" to "what they meant".

## Usage
```
/shape <what you want>
```
`$ARGUMENTS` is the request in plain words. (`/go` runs this automatically before planning, so most people never call it directly.)

## Step 1 — Right-size the response (do NOT over-think small asks)

Restate the request in your own plain words. Then classify it:

- **Clear and contained** — a rename, a copy fix, a single field with obvious behavior, a well-specified bug fix. This classification is **earned, not vibes**: it applies only if the one-line brief can name the **exact surface** the change touches — a closed, named set of files, components, or routes, or one mechanical pattern applied uniformly (a rename across many files is still contained). Can name the surface → write a one-line brief (Step 5, "literal" path) and stop; say: "This is clear — building it as asked." Can't name it → it isn't contained; go to Step 2. Do **not** philosophize a trivial change into a product epic. Proportionality is the rule; the classic founder-review posture assumes every feature deserves a CEO — we serve all sizes.
- **Vague, ambitious, or underspecified** — "make it better", "add login", "let sellers upload a photo", anything where the real job is plausibly larger than the words. → Continue to Step 2.

When unsure which bucket, lean to a quick Step 2 — but keep it to one round.

## Step 2 — Find the real job (founder's eye)

Ask the question the request is dancing around: **what is this actually for?** Reframe from the user's point of view, not the implementer's. For the listing-app example, "photo upload" is not the feature — "create a listing that sells" is. **Read `FEEDBACK.md` at the repo root if it exists** (the feedback ledger — user asks/complaints, see the `using-the-pack` skill): a request that echoes a recurring ask there is real-job evidence, and related asks often reveal the bigger job the current request is one slice of. Absent file → nothing to read; never invent user demand it doesn't record. Name:

- **The real job-to-be-done** — one sentence, from the end user's perspective.
- **The 10-star version** — what would make this feel inevitable, effortless, maybe a little magical? (For the photo: identify the product, pull specs and pricing comps, draft the title and description, pick the best hero image.) This is a sketch to aim toward, not a mandate to build all of it now.
- **Why it matters** — the outcome behind the request.
- **How this fails (pre-mortem)** — the top 3 ways the built thing could be wrong, harmful, or misunderstood by the person it's for, and any ambiguity that must be answered before code. This is the earliest moment a failure can be caught — three sharp bullets, not a risk workshop. `/create-plan` seeds its Risk Assessment from this.

Keep it concrete and grounded in this project. Do not invent ambition the person hasn't signaled; offer it.

## Step 3 — Align to the North Star

Read `NORTH_STAR.md` if it exists and is filled. Also read `DECISIONS.md` at the repo root **if it exists** — the decision journal (see the `using-the-pack` skill). If a past entry already settled a scope question this request reopens, say so plainly and don't relitigate it from scratch; carry the prior decision forward unless the person chooses to revisit it. An absent journal just means there's nothing to check.

- If the reframed job advances the **Goal / Current focus**, note that alignment in the brief.
- If it hits a **Non-goal** or pulls away from the Goal, surface it plainly ("the bigger version drifts from what this project is for, because …") and treat the literal/smaller scope as the default.
- If `NORTH_STAR.md` is missing or still the template and a real goal has now surfaced from this conversation, offer to draft it (one or two sentences) — this is often the moment the project's North Star first becomes clear.

## Step 4 — Offer the scope, let the person choose (User Sovereignty)

Present the options with `AskUserQuestion`, using the recommendation format: a one-line context, then lettered options, then **"RECOMMENDATION: <option> because <reason>"**. Offer (skip any that don't apply):

- **As asked** — build exactly the literal request. Fast, safe, no scope growth.
- **Right-sized real job (usually recommended)** — the smallest version that does the actual job well, not just the mechanic.
- **10-star** — the ambitious version; may be larger or multi-phase.

You recommend, but **the person decides**. Never silently expand a request into the bigger version — a beginner asking for a small thing must be able to get the small thing. Equally, never talk someone out of ambition they want.

## Step 5 — Write the brief

Write `docs/plans/<feature>-brief.md` (create `docs/plans/` if needed):

```markdown
# Shaping brief — <feature>

**Request (as stated):** <verbatim or close>
**Real job:** <one sentence from the user's POV>
**Chosen scope:** As asked | Right-sized | 10-star — <the one-line definition of what we're building now>
**10-star sketch (aim, not commitment):** <bullets — the magical version, for later phases>
**North Star alignment:** advances <Goal/Current focus> | flagged: <non-goal/drift> | N/A (no North Star yet)
**Non-goals (now):** <what we are deliberately not doing in this scope>
**How this fails (pre-mortem):** <top 3 failure modes + must-answer ambiguities — omit on the clear-and-contained path>
```

For the **clear-and-contained** path, the brief is just `Request`, `Chosen scope: As asked`, a one-line definition, and the line that earned the classification:

```markdown
**Surface:** <the named files / components / routes this touches — the closed set>
```

— no 10-star or pre-mortem sections. The `Surface:` line is what admits the change to `/implement`'s **fast lane** (gates without the paperwork), so it must be the real, checkable set.

If you drafted or updated `NORTH_STAR.md`, do it now (merge, never clobber) and show the person the change.

**Offer to journal the scope decision** when it's genuinely load-bearing — the chosen scope diverged from the literal ask, or from a flagged North-Star Non-goal, or resolved a real ambiguity. Offer **once**, never append silently: *"Want me to record this in `DECISIONS.md` so it isn't reargued later?"* — one line per the decision-journal convention (`using-the-pack`): `- <today, YYYY-MM-DD> — chose <scope> for <feature> — because <why>`. Skip the offer for a small clear ask that never had a real fork.

**And if adjacent user asks surfaced** — the person mentioned other things users want that you're deliberately *not* building in this scope — offer **once** to log them to `FEEDBACK.md` (the feedback ledger; canon in `using-the-pack`), so they become ranked "what's next" candidates later instead of being lost: `- <today, YYYY-MM-DD> — <what they asked for / complained about> — <source>`. Same never-silent, person-okays-each discipline; skip it when no real user signal came up.

## Step 6 — Hand off

Tell the person, in plain language, what the chosen scope is and what happens next:

- **Clear-and-contained brief (has a `Surface:` line)** → the next step is the **fast lane**: `/implement`'s Fast lane section builds it with no plan documents but every gate (or `/go` continues automatically). Its admission test governs — if the change turns out bigger than the surface, it upgrades to planning.
- **Everything else** → the next step is planning it (`/create-plan <feature>`, or `/go` will continue automatically). `/create-plan` reads this brief as the starting contract.

## Hard rules
- **Proportional.** Small clear asks pass straight through. Don't manufacture a product epic from a one-line change.
- **Recommend, never impose.** Scope is the person's call. Never auto-expand a request.
- **Plain language.** No jargon. The point is to help someone who couldn't fully specify what they wanted.
- **Honest.** The 10-star is an offer; the North Star alignment is real or it's "N/A". Never invent a goal to judge against.
