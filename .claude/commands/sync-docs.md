---
description: Technical-writer mode. Make the project's documentation match what the code actually is now. Reads the doc set, diffs it against what changed, auto-fixes mechanical drift (paths, command lists, counts, file trees, version strings), and asks before any subjective rewrite. Gives CLAUDE.md a deeper truth-bloat-and-lessons check, since a wrong line there misleads every agent. Only ever makes docs match reality — it never invents capabilities. Run it after shipping, or any time the docs feel stale. Do NOT use to pull a newer pack version into the project — that's /sync-pack. Do NOT use for the customer-facing help under docs/help/ — that's /user-docs, which owns that voice.
argument-hint: [optional: feature name or "since main" — defaults to recent changes]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite
---

# /sync-docs — keep the docs honest

Documentation drifts the moment code changes: a renamed file, a new command, a count that's now wrong, a tree that's missing a folder. Drift is invisible until it bites someone — and it bites a beginner hardest, because they trust the docs. `/sync-docs` is the technical-writer pass that closes that gap automatically, so the person doesn't have to notice.

> The one rule above all others: **docs are made to match reality, never the other way around.** This command never invents a capability, never documents something the code doesn't do, and never inflates. If a doc claims something the code lacks, it flags the contradiction — it does not "make it true". This rule is the per-edit application of the pack-wide **outbound-truth** discipline (canon: the `outbound-truth` skill — the same trace rule the `outbound-truth-critic` audits and `/release` applies to changelogs).

## Usage
```
/sync-docs                # sync docs against recent changes (working tree / last commit / last shipped phase)
/sync-docs <feature>      # sync against a feature's diff (docs/plans/<feature>-*)
/sync-docs since main     # sync against everything that changed vs the base branch
```
`/go` runs this as its closing step after a build, so most people never call it directly.

## Process

### Step 1 — Establish what changed
Determine the change set: `git diff` against the base branch, the working tree, the last commit, or the named feature's diff. List the concrete deltas that docs care about: files added/removed/renamed, new or removed commands/scripts, new modules or directories, changed counts, changed version strings, moved files that docs link to. If there is no detectable change, say so and stop — nothing to sync.

### Step 2 — Find the doc set
Discover the project's documentation; don't assume a fixed list. Typically: `README.md`, `CLAUDE.md`, `NORTH_STAR.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `.claude/project-context.md`, and anything under `docs/`. Read each one that the change set could affect. **One carve-out:** `docs/help/**` is customer-facing and `/user-docs` owns its voice — flag drift you notice there (one line, pointing at `/user-docs`), don't rewrite it.

### Step 3 — Classify every needed edit
For each doc, cross-reference it against the change set and sort each required edit into one of two buckets:

- **Mechanical / factual → auto-apply.** A fact that is simply now wrong and has one correct value: a renamed path, a file-tree entry, an item missing from (or stale in) a command/skill list, a count ("9 skills" → "10"), a renamed identifier, a moved-file link, a version string. Apply these directly with minimal-diff edits that preserve the surrounding voice.
- **Subjective / semantic → ask first.** Anything where the right wording is a judgment call: new prose describing behavior, a new section, a reworded explanation, a deletion of existing content, or a change that alters meaning. Surface these as a short list and ask before writing (recommendation format: context, options, "RECOMMENDATION: <option> because <reason>"). Never silently rewrite prose.

### Step 3.5 — CLAUDE.md gets a deeper check (it misleads agents, not just readers)

`CLAUDE.md` is loaded into every session, so drift there is worse than drift in a README — a wrong line actively misleads every agent. Whenever the doc set includes a `CLAUDE.md`, run three extra checks on it:

- **Truth.** Every command in its Commands section exists in the project's real scripts (manifest / Makefile / task runner); every reviewer skill and agent in its Critical-Paths table exists under `.claude/skills/` and `.claude/agents/`; every path in "Where things live" exists on disk. Each mismatch is a mechanical fix (or, if the code side is the wrong one, a flagged contradiction per Step 4).
- **Diet.** If the file has grown well past ~100 lines, states the same rule twice, or inlines explanation a skill already carries, flag it as a *subjective* item: propose the trim, ask first. Bloat is drift too — it dilutes the rules agents must obey.
- **Lessons hygiene.** If it has a Lessons section: entries stay one line each; if the list is over its ~10 cap, propose which to merge or retire; and if a lesson has proven itself, offer to promote it — to a Non-negotiable rule in `CLAUDE.md`, or (when a diff pattern can catch it) to a guardrail rule in `.claude/guardrails.rules.json` (ask first — promotion changes enforcement, never do it silently).

### Step 4 — Apply and ask
Apply all mechanical fixes. Present the subjective ones for a decision. If a doc **claims something the code does not do** (reverse drift), do not edit code to match — flag it as "the docs promise X but the code doesn't do X; fix the doc, or is this a missing feature?" and let the person decide.

### Step 5 — Report
List, in plain language: which docs changed, what was auto-fixed (one line each), what you asked about and the outcome, and anything still open (e.g. a flagged contradiction). Keep it short — the diffs speak for themselves.

## Hard rules
- **Reality only.** Docs are updated to match the code, never to describe something that isn't there. No invented features, no aspirational claims.
- **Auto-fix mechanical, ask on subjective.** A renamed path is safe to fix; a reworded paragraph is the person's call.
- **Minimal diffs, preserve voice.** Change the wrong fact, not the surrounding style. You are a copy editor, not a ghostwriter.
- **Docs, not code.** This command edits documentation. It does not refactor code to match the docs — it flags the mismatch instead.
- **Respect the git policy.** Don't commit or branch unless the person asks.
