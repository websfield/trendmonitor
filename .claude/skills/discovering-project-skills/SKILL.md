---
name: discovering-project-skills
description: Use when prospecting a target repo for NEW project-specific skills it would benefit from — during /sync-pack, when a repo has grown new Critical Paths since bootstrap, or when the user asks "what skills does this project need?". The discovery half that pairs with authoring-project-skills (this finds the gap from evidence; that writes the skill + reviewer to fill it). Evidence-only and additive — never manufactures a skill the repo doesn't warrant.
---

# Discovering Project Skills (the prospector)

`/bootstrap-claude-pack` generates a project's Critical-Path skills **once**, at setup, from the
repo as it was then. But repos grow: a new module appears, a new external integration lands, the
same kind of mistake keeps recurring. The skills that would catch those were never written, because
bootstrap already ran. This skill is the method for **finding the new skills a repo now warrants** —
the discovery counterpart to [[authoring-project-skills]], which writes them.

The loop is **prospect → author → enforce**: this skill prospects (find the gap from evidence);
`authoring-project-skills` authors (the skill + reviewer pair); `authoring-guardrail-rules` adds the
write-time catch. Each is additive. Nothing here creates a skill on its own — it produces a ranked,
evidence-backed *proposal* the user confirms.

## What a project skill is for (the bar)

A project skill earns its place only when it documents a **rule or convention that an implementer
must obey on a recurring class of change**, where getting it wrong is expensive or silent — the same
bar bootstrap uses for a Critical Path. A skill that just restates what the code already makes
obvious is noise. The test: *would an agent about to edit this path make a costly mistake the skill
would prevent?* If no, don't propose it.

## Where the repo's knowledge lives (mine these, in order)

Prospect from evidence already in the repo — not from what a project "usually" has:

1. **The Critical-Path table in `CLAUDE.md`** — the canonical list of what matters here. Cross-check
   it against `.claude/skills/`: **a Critical Path with no skill is the strongest candidate.** The
   table names the gap for you.
2. **The existing skills inventory** (`.claude/skills/*/SKILL.md`) — what's already covered. Never
   propose a duplicate; if a path is covered, the job is harvest (that's `/sync-pack`'s main flow),
   not a new skill.
3. **Structure drift since setup** — Glob the architectural units; compare against what the existing
   skills and `CLAUDE.md` describe. A new module, service, package, or layer with no skill and a
   real rule attached is a candidate. (`git log --stat` / new top-level dirs reveal what arrived.)
4. **New external integrations** — grep for SDKs/clients (payment, auth, cloud, queue, search, LLM)
   not mentioned by any existing skill. Each new adapter boundary is a candidate Critical Path.
5. **Recurring-mistake signal** — anything the repo records about repeated errors: a guardrail rule
   that fires often, review history, a friction log if one exists, TODO/FIXME clusters, or a
   convention stated in `CONTRIBUTING.md`/ADRs but enforced nowhere. A rule people keep breaking is
   a skill waiting to be written.
6. **The user's own words** — if they named a pain point or a new area, weight it heavily; it's
   first-hand evidence the generic sweep can't see.

## Rank the candidates

For each candidate, capture: **the rule** (what must always/never happen), **the evidence** (the
file/path/integration that proves the repo needs it), a **value** (HIGH / MEDIUM / LOW), and the
**shape** it warrants:

- **Full triple** (skill + reviewer agent + maybe a guardrail rule) — for a true Critical Path where
  a diff needs gating. Hand off to [[authoring-project-skills]] for the pair.
- **Skill only** — for a strong convention worth documenting that doesn't need a read-only gate
  (e.g. a house pattern for a non-dangerous but easy-to-get-wrong area).

Drop LOW unless it's a cheap, obviously-useful one-liner. Rank by value and present the top few — a
short, honest list beats an exhaustive one.

## The honesty bar (non-negotiable)

- **Evidence-only.** Every proposed skill must trace to something concrete in *this* repo or an
  explicit user statement. No skill justified by "projects like this usually have one."
- **Additive, never a rewrite.** Prospecting only *adds* coverage. It never proposes replacing or
  editing an existing skill — that's the harvest path.
- **Honesty over activity.** If the repo's Critical Paths are already covered and nothing new has
  landed, the correct output is **"no new skills warranted"** — say it and stop. A manufactured skill
  is worse than none; it adds maintenance and dilutes the real ones.
- **Confirm before scaffolding.** The output is a proposal. The user picks which candidates become
  real before any file is written.

## Handoff

Once the user confirms a candidate, build it with [[authoring-project-skills]] (skill + reviewer
pair, named to this repo's reality) and, if a write-time pattern exists, [[authoring-guardrail-rules]].
Then add the new path to `CLAUDE.md`'s Critical-Path → reviewer table so the gate is selectable. The
new skill must reference *real* files/tables/routes in this repo — never generic placeholders.

## Checklist before proposing
- [ ] Each candidate traces to repo evidence (a Critical Path without a skill, a new module/integration, a recurring mistake) or the user's own words.
- [ ] No candidate duplicates an existing `.claude/skills/` entry.
- [ ] Each has: the rule, the evidence, a value, and a shape (full triple vs skill-only).
- [ ] If nothing is warranted, the output says so plainly — no manufactured skills.
- [ ] Confirmed candidates hand off to [[authoring-project-skills]] and land a row in `CLAUDE.md`'s Critical-Path table.
