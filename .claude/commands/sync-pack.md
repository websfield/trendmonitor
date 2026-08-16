---
description: Merge the good parts of a newer pack version into THIS project's already-customized commands, skills, and agents (any installed module's files included) — AND prospect the repo for new project-specific coverage it now warrants (skills, guardrail rules, post-edit checks, audit critics). Fills the gaps the installer and the bootstrap generators leave: install never updates files you already have, and the generators run once while repos keep growing new Critical Paths, surfaces, and packages. Additive only; your project-specific content is never replaced. Do NOT use to update the project's own documentation to match the code — that's /sync-docs.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, TodoWrite, Agent
---

# Sync Pack (the divergence harvester)

The installer (`install.ps1` / `install.sh`) uses **merge-not-clobber**: it copies any pack file the project is missing and **skips every file that already exists** (unless `--force`, which destroys your edits). `/bootstrap-claude-pack` generates *project-specific* artefacts (CLAUDE.md sections, guardrail rules, reviewer agents, skills) but **never touches the shipped commands/skills/agents**.

That leaves a real gap: when the pack ships an improved `create-plan`, `implement`, `review-phase`, a sharper skill, or a better reviewer agent, a project that has already **customized** those files gets nothing. This command closes that gap — it harvests the pack's improvements into your existing files **additively**, preserving every project-specific part and rewiring the pack's generic references (agent names, skill names, paths) to the ones that actually exist in this repo.

There is a **second gap** this command closes: the bootstrap generators run **once**. `/bootstrap-claude-pack` generates a project's Critical-Path skills, reviewer agents, guardrail rules, and post-edit checks at setup, and `/bootstrap-critics` generates its audit critic panel — all from the repo as it was *then*. But repos grow — a new module, a new integration, a new surface, a new package, a rule people keep breaking. The newly-warranted coverage was never written. So this command also **prospects the repo for new project-specific coverage** — across every dimension those generators produce (skills, guardrail rules, post-edit checks, critics) — and offers to scaffold it. Each sync makes the installed pack more capable, not just more current.

> Run this after pulling a newer version of the pack repo. It compares the pack's `template/.claude/**` — plus any installed module's `template/modules/<name>/.claude/**` and the golden-rules block in `CLAUDE.md.template` — against this project's `.claude/**`, reconciles what diverged, and prospects for new coverage the repo now warrants. Nothing is written without your confirmation.

## Usage
```
/sync-pack [path-to-claude-pack-repo]
```
- `$ARGUMENTS`: the local path to the **claude-pack repo** (the source of truth, e.g. `C:/projects/claude-pack`). If omitted, ask the user for it (or check common sibling locations). The command needs the pack's `template/.claude/` to diff against.

## Process

Use `TodoWrite` to track these phases.

### Phase 1: Locate the pack + scan for divergence

1. Resolve the pack root from `$ARGUMENTS` (or ask). Verify `<pack>/template/.claude/` exists; if not, stop and ask for the correct path.
2. Optionally compare `<pack>/VERSION` against any recorded last-synced version to tell the user what changed.
3. Walk every file under `<pack>/template/.claude/` and classify it against this project's `.claude/` counterpart into exactly one bucket:
   - **IDENTICAL** — byte-equal → skip.
   - **TARGET-MISSING** — exists in pack, absent here → the installer should have added it; offer to copy it in verbatim (it's new pack machinery, no project content to preserve).
   - **DIVERGENT** — exists in both, differs → candidate for harvest (Phases 2–4).
   - **TARGET-SUPERSET** — your file is a strict, richer extension of the pack's (much larger, already contains the pack's structure) → usually skip; confirm with a quick gap-check.

   Use `diff -q` (or equivalent) per file. Present the divergence report as a table: path · bucket · pack lines / target lines.

4. **Module walk (so installed modules receive improvements too).** If `<pack>/template/modules/` exists (older pack checkouts lack it — skip this step silently then), walk each `<pack>/template/modules/<name>/.claude/` and check the target's **footprint**: do any of that module's files already exist in this project's `.claude/`? (Installed module files merge indistinguishably into `.claude/`, so footprint is the detection.) A module **with** footprint is synced exactly like core — its files classify into the same four buckets above (a customized module file is DIVERGENT and harvests additively; a missing one is TARGET-MISSING and is offered). A module with **zero** footprint is skipped, with a one-line mention that it's available via the installer's `--with <name>` / `-With <name>`. One honest limit: detection is by the *current* pack's filenames — if a later pack version renames a module's files, its footprint reads zero and it drops out of sync coverage; note that in the report if a name mismatch is suspected.
5. **Golden-rules currency check (the one file outside the walk).** The walk covers the `.claude/`-shaped trees only, but the pack's canonical *Golden rules* block lives in `<pack>/template/CLAUDE.md.template` and occasionally gains a rule. Compare it against the same block in this project's `CLAUDE.md`: if the pack's block has rules the project's lacks, add one row to the harvest plan offering to **append the missing rules verbatim** — never reword or renumber the rules already there, and touch nothing else in `CLAUDE.md`. If the project's `CLAUDE.md` has no golden-rules section at all, offer to insert the pack's canonical block as-is (heading included) — or leave it to a `/bootstrap-claude-pack` run, which inserts it per its Phase 3.

### Phase 2: Gap-analyze each DIVERGENT file (pack-only good parts)

For each DIVERGENT (and any uncertain TARGET-SUPERSET) file, identify **only what the pack version has that this project's version lacks** — additive value, never a list of things to replace.

- Read both versions. For large files (commands/skills over ~150 lines), delegate the read to **one read-only `Agent`** per file with the brief: *"Compare PACK vs TARGET; report only what the PACK has that the TARGET lacks (concept, pack location, value HIGH/MEDIUM/LOW, one-line integration note). The target is project-customized — do not suggest replacing anything. Be honest if the pack offers nothing."* Keep its conclusions, not the file dumps. The compare agents may run **one model tier cheaper than the session** when the account exposes one — never a more expensive one; unsure → inherit (canon: the `using-the-pack` skill's token-economy dials).
- Be ruthless about honesty: if the target is already a superset, say "nothing to harvest" and skip it. Do not manufacture value to justify an edit.
- Produce a per-file harvest list ranked by value. Drop LOW items unless they're cheap one-liners.

### Phase 3: Confirm scope with the user

Present the consolidated harvest plan via `AskUserQuestion` (multi-select): one option per file that has HIGH/MEDIUM additive value, each summarizing what would be added. Let the user deselect anything. Ask **once**. Skip files with nothing to harvest without asking.

### Phase 4: Integrate additively (the merge, not a copy)

For each confirmed file, apply the pack's good parts with `Edit` (targeted inserts), **never** `Write`-over:

- **Preserve all project-specific content** — domain rules, real file paths, conventions, examples. If a pack section conflicts with a project-specific one, keep the project's and only add what's genuinely new.
- **Rewire references to this project's reality** — replace the pack's generic placeholders with what exists in `.claude/agents/` and `.claude/skills/` here. The pack's generic `code-reviewer` / `security-reviewer` / reviewer-gate language must point at the actual reviewer agents and Critical-Path skills this repo has (read `.claude/agents/` and `.claude/skills/` to get the real names). Never introduce a reference to an agent or skill that does not exist here.
- **Insert at the natural seam** — add new steps/sections beside the existing structure with clear headings; keep the file's numbering and voice coherent.

**Config files are special — merge fields, never the file:**
- `settings.json` — merge missing `hooks` entries and additively union `permissions.allow` / `permissions.deny`. Never remove the project's existing entries; never overwrite the whole file. Show the diff first. (If a `settings.pack.json` is lying around from install, treat it as the pack's settings and delete it after merging.)
- `guardrails.rules.json` / `workspaces.json` — append/union rules and workspace entries; keep every project-specific rule.

### Phase 5: Prospect for new project-specific coverage

Harvesting (Phases 1–4) only improves files that already exist. This phase asks the separate question:
**what project-specific coverage does this repo now warrant that it doesn't have yet?** The bootstrap
generators (`/bootstrap-claude-pack`, `/bootstrap-critics`) produce per-repo coverage **once**, from
the repo as it was *then* — and every kind of it goes stale as the repo grows. This phase re-prospects
**all** of it.

Run **one evidence sweep** of the repo's own knowledge and feed every dimension below from it:
- the **Critical-Path table in `CLAUDE.md`** (a path with no coverage is the strongest candidate);
- **structure/integration drift since setup** — a new module, service, surface, package, or external SDK;
- **recurring-mistake signal** — a guardrail that fires often, a convention stated in docs but enforced
  nowhere, TODO/FIXME clusters, or anything the user names as a pain point.

For a large repo, delegate the sweep to **one read-only `Agent`** and keep its ranked conclusions. The
sweep may run one model tier cheaper than the session when the account exposes one — never a more
expensive one; unsure → inherit (canon: the `using-the-pack` skill's token-economy dials).
Consolidate every proposal into **one `AskUserQuestion`** (multi-select), one option per item tagged by
dimension with its evidence, so the user confirms the whole coverage plan in a single pass. Ask
**once**; skip entirely if nothing is warranted. Hold **one honesty bar across all dimensions:
evidence-only, additive, and if the repo is already covered, propose nothing and say so.** Never
manufacture coverage to justify the phase.

| Dimension | Gap it closes | Author with | Wire into |
|---|---|---|---|
| **Skill (+ paired reviewer)** | a Critical Path with no rule canon or gate | `discovering-project-skills` → `authoring-project-skills` | a `CLAUDE.md` Critical-Path → reviewer row |
| **Guardrail rule** | a write-time-catchable violation with no rule | `authoring-guardrail-rules` | append to `.claude/guardrails.rules.json` |
| **Post-edit check** | a new package/workspace whose edits aren't typechecked/linted | the real verify scripts found in the repo | a `.claude/workspaces.json` entry (specific-before-broad) |
| **Audit critic** | a surface/track no critic lens owns | `auditing-with-critics` → author from `_critic-template.md` | `/audit` discovers it by `Track:` |
| **Production surfaces** | a production fact drifted since setup — a new test/coverage tool, CI gate, migration tool, or observability stack not reflected in `project-context.md`'s *Production surfaces* block | the real facts found in the repo | refresh the *Production surfaces* block in `.claude/project-context.md` |

Per-dimension specifics:
- **Skills** — a Critical Path with no skill is the strongest candidate; decide full triple (skill + reviewer agent) vs skill alone, and name it to this repo's real files/routes/tables, never generic placeholders. A scaffolded reviewer agent carries `effort: max` frontmatter (gates think hardest when dispatched by name); a scaffolded implementer carries `effort: high` (producers over-engineer at max). Model stays consented, as in bootstrap Phase 6.
- **Guardrail rules** — `block` only unambiguous, expensive violations; `warn` for heuristic ones; keep every `filePattern` absolute-path-safe (`(^|/)foo`, never bare `^foo`). Append to `guardrails.rules.json`; keep every project-specific rule.
- **Post-edit checks** — start conservative: a failing check blocks the edit loop, so only wire fast, reliable commands for a newly-appeared workspace.
- **Audit critics** — two cases:
  - **(a) No panel yet** — the repo has `audit.md` / `bootstrap-critics.md` and only the generic `architecture-critic` / `accessibility-critic` / `correctness-critic` / `operability-critic` / `outbound-truth-critic` / `supply-chain-critic`. → **Recommend the user run `/bootstrap-critics`**; don't silently write a roster — its roster-confirmation is the required interaction. This is the case that makes the audit framework actually *usable* in a repo that predates it.
  - **(b) Panel exists but a new track has no lens** — author the missing critic from `_critic-template.md` per `auditing-with-critics` (one lens, read-only `Read, Grep, Glob`, a `Track:` marker, real reading-list paths, and the archetype's `effort: max`), or point the user at `/bootstrap-critics <track>`. Never duplicate a generic critic's lens.
- **Production surfaces** — only if `project-context.md` has a *Production surfaces* block whose facts have drifted (a test/coverage tool, CI gate, migration tool, or observability stack the block doesn't name). Refresh it additively — same "cite the evidence, or 'none found'" honesty as bootstrap Phase 7; never invent a surface, and skip the dimension entirely if the block is absent or already current. This is what keeps the on-demand `production-reviewer` citing the repo's *current* commands, not the setup-day snapshot.

Also **flag, but don't auto-create**: a **specialist implementer agent** if a substantial new surface appeared with no agent to own it (a backend / frontend / test agent) — note it for the user to generate via `/bootstrap-claude-pack` if they want a team.

**Scope of this phase.** Phase 5 is only for the **per-repo, generated** coverage the bootstrap generators would have produced. Any *generic* new machinery (new commands, generic reviewers, generic critics, new skills like `keeping-it-lean`) is already carried in by the harvest path (Phases 1–4) as TARGET-MISSING copies or additive harvests — it is not re-derived here.

### Phase 6: Validate

- Every JSON file written still parses: `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` (covers `guardrails.rules.json` and `workspaces.json`).
- Every command/skill/agent reference points at a file that exists (`.claude/agents/*`, `.claude/skills/*`).
- Every newly-scaffolded skill has matching frontmatter `name` == directory, and (if a triple) a paired reviewer agent plus a `CLAUDE.md` Critical-Path row.
- Every newly-scaffolded reviewer agent carries `effort: max`, and every scaffolded implementer agent `effort: high`.
- Every new guardrail rule's `filePattern`/`bodyPattern` compiles and is absolute-path-safe; every new `workspaces.json` command is one that actually runs green on the current tree.
- Every newly-authored critic is read-only (`tools: Read, Grep, Glob`), carries a `Track:` marker and `effort: max`, and its reading-list paths all exist (no invented paths). `/audit` will discover it by track.
- Markdown structure intact (headings balanced, code fences closed).
- If this project wires guardrails, optionally smoke-test that the rule JSON still loads.

### Phase 7: Summary

Report: the divergence buckets, which files were harvested and the specific parts added to each, which were skipped and why (superset / nothing to harvest / user-deselected), any TARGET-MISSING files copied in, **any new coverage prospected and scaffolded — skills, guardrail rules, post-edit checks, and critics — each with its evidence (or a plain "already covered" per dimension), and a clear "run `/bootstrap-critics` to set up the audit panel" if this repo has the machinery but no panel yet**, and the validation results. Note the pack version synced from so the next run can diff against it. Do **not** stage or commit — leave the changes for the user to review with `git diff`.

## Rules
- **Additive only.** This command never replaces a project's customized file. The whole point is to keep project-specific content and graft pack improvements (and net-new coverage: skills, guardrail rules, post-edit checks, critics) onto it.
- **Honesty over activity.** A file where the target is already a superset gets skipped with a one-line reason — not a manufactured edit. A dimension that already fits the repo (Critical Paths all have skills, the guard set is complete, the critic panel covers every surface) gets **nothing** — "already covered" is the right answer, never coverage invented to justify the phase.
- **Prospect from evidence.** All new coverage (Phase 5) must trace to repo evidence — an uncovered Critical Path, a new module/integration/surface/package, a recurring mistake, or the user's own words — never to what a project "usually" has.
- **Bootstrap, don't auto-generate, the critic panel.** If the repo has the audit machinery but no panel, *recommend* `/bootstrap-critics` rather than silently writing a roster — its roster-confirmation is the required interaction.
- **Rewire, don't transplant.** Pack references to generic agents/skills/paths must be mapped to this repo's real names before they're written, or the harvested gate references something that doesn't exist.
- **Confirm before applying.** Surface the harvest plan (Phase 3) and config diffs (Phase 4) before writing. Never `git add`/`commit`.
- **Validate everything written** (Phase 6) before reporting done.
