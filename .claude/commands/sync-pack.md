---
description: Merge the good parts of a newer pack version into THIS project's already-customized commands, skills, and agents (any installed module's files included) — AND prospect the repo for new project-specific coverage it now warrants (skills, guardrail rules, post-edit checks, audit critics). Fills the gaps the installer and the bootstrap generators leave: install never updates files you already have, and the generators run once while repos keep growing new Critical Paths, surfaces, and packages. Additive — except the one-time move to the 2.0 workflow, which may replace a workflow file after backing yours up under `.claude/_pre-2.0/`, and only with your yes. Do NOT use to update the project's own documentation to match the code — that's /sync-docs.
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
   - **TARGET-MISSING** — exists in pack, absent here → the installer should have added it; offer to copy it in verbatim (it's new pack machinery, no project content to preserve). Ownership exception: the **workflow files** (listed in step 6) are classified here but offered there, as one grouped choice, never as per-file copies.
   - **DIVERGENT** — exists in both, differs → candidate for harvest (Phases 2–4).
   - **TARGET-SUPERSET** — your file is a strict, richer extension of the pack's (much larger, already contains the pack's structure) → usually skip; confirm with a quick gap-check.

   Use `diff -q` (or equivalent) per file; on a Windows checkout re-check a changed file with `diff -q --strip-trailing-cr` before calling it DIVERGENT, since `diff -q` reports a CRLF/LF mismatch as a change even when the text is the same — a match under `--strip-trailing-cr` counts as IDENTICAL. Present the divergence report as a table: path · bucket · pack lines / target lines.

4. **Module walk (so installed modules receive improvements too).** If `<pack>/template/modules/` exists (older pack checkouts lack it — skip this step silently then), walk each `<pack>/template/modules/<name>/.claude/` and check the target's **footprint**: do any of that module's files already exist in this project's `.claude/`? (Installed module files merge indistinguishably into `.claude/`, so footprint is the detection.) A module **with** footprint is synced exactly like core — its files classify into the same four buckets above (a customized module file is DIVERGENT and harvests additively; a missing one is TARGET-MISSING and is offered). A module with **zero** footprint is skipped, with a one-line mention that it's available via the installer's `--with <name>` / `-With <name>`. One honest limit: detection is by the *current* pack's filenames — if a later pack version renames a module's files, its footprint reads zero and it drops out of sync coverage; note that in the report if a name mismatch is suspected.
5. **Golden-rules currency check (the one file outside the walk).** The walk covers the `.claude/`-shaped trees only, but the pack's canonical *Golden rules* block lives in `<pack>/template/CLAUDE.md.template` and occasionally gains a rule. Compare it against the same block in this project's `CLAUDE.md`: if the pack's block has rules the project's lacks, add one row to the harvest plan offering to **append the missing rules verbatim** — never reword or renumber the rules already there, and touch nothing else in `CLAUDE.md`. If a rule the project already has is word-identical (whitespace-normalized) to a rule the pack has since amended — prove it against an evidenced earlier pack revision — offer the amended rule as a scoped replacement of **that one rule**, showing the diff; a rule the project customized is preserved and the amended clause is flagged for manual reconciliation, never appended beside it. If the project's `CLAUDE.md` has no golden-rules section at all, offer to insert the pack's canonical block as-is (heading included) — or leave it to a `/bootstrap-claude-pack` run, which inserts it per its Phase 3.
6. **Workflow reset to 2.0 (the one check a customized file cannot dodge).** The pack's review workflow changed shape in 2.0: one-page `gate-rules.md` (marker `<!-- canon-coverage: 1-8 (workflow policy 2) -->`), a four-item Definition of Done, six-section phase plans, one record per feature (`docs/progress/<feature>/progress-and-log.md`), `plan-ready.js`, and no durable-evidence engine. A target on the 1.x workflow keeps producing 1.x paperwork until these files move together, so this step offers them as **one grouped choice, "Move to the 2.0 lean workflow"**, with a sub-row per file the person can deselect.

   **Detect pre-2.0.** Any of: the target's `gate-rules.md` lacks the `workflow policy 2` marker; `.claude/lib/workflow-evidence.js`, `.claude/scripts/workflow-state.js` or `.claude/hooks/workflow-stop.js` exists; live `.claude/settings.json` (or `settings.pack.json`) has a `Stop → workflow-stop.js` entry; the project `CLAUDE.md` Definition of Done is not the four-item block. None of these → the target is on 2.0; skip this step with one line.

   **The workflow files:** `.claude/gate-rules.md` · `.claude/commands/go.md`, `create-plan.md`, `implement.md`, `start-teams.md`, `review-phase.md`, `shape.md` · `.claude/agents/code-reviewer.md`, `plan-reviewer.md`, `production-reviewer.md`, `security-reviewer.md` · `.claude/skills/using-the-pack/SKILL.md` · the **Critical Paths** block and **Definition of Done** block in the project `CLAUDE.md` · `.claude/scripts/plan-ready.js` (new).

   **Classify each with the installation receipt** (`.claude/pack-installation.json`, when present — `targetHash` recorded at install vs the file's hash now; without a receipt, compare against an evidenced earlier pack revision):
   - **pack-origin, unchanged** → offer **replace** with the 2.0 file, diff shown.
   - **customized** (hash differs, or no provenance) → offer **replace with backup**: move the old file to `.claude/_pre-2.0/<same relative path>`, install the 2.0 file, and attach a one-paragraph summary of the project-specific content the old file held (delegate the read to one read-only `Agent`: *"List only what this file contains that the pack's 2.0 version does not — project rules, real paths, names — so the person can re-add it."*). Your customizations are **not** carried into the new file — they wait in the backup, and the summary (shown in the Phase 3 row and repeated in the Phase 7 report) tells you what to re-add by hand. Nothing is silently merged into a file whose shape changed.
   - **missing** → offer **install** (`plan-ready.js`, and any command the target never had).
   - For the two `CLAUDE.md` blocks: scoped replacement of exactly that block, diff shown; a block the person customized gets the same replace-with-backup treatment (the old block goes into `.claude/_pre-2.0/CLAUDE.md-blocks.md`).

   **Retired files** — if present, offer **delete** as one row: `.claude/lib/workflow-evidence.js`, `.claude/scripts/workflow-state.js`, `.claude/hooks/workflow-stop.js`, and the `Stop` hook entry in `settings.json` (a scoped diff of the `hooks` block; foreign entries untouched). Never touch `docs/progress/<goal>/workflow.json` or any `evidence/` directory — records of work stay.

   **Consent and consequence.** Every row is shown as a diff and needs a yes. A declined row leaves the file as it is and the report says: *"pre-2.0 workflow retained in <file> — `/go` will run the rules in this project's copy."* A partly accepted reset is reported file by file, never as "synced to 2.0". Records already on disk are not migrated: a target's old `docs/progress/<feature>/ledger.md` and `-phase-N-review.md` files stay readable to the startup hook and `/go`; new work writes the one record.

### Phase 2: Gap-analyze each DIVERGENT file (pack-only good parts)

For each DIVERGENT (and any uncertain TARGET-SUPERSET) file, identify **only what the pack version has that this project's version lacks** — additive value, never a list of things to replace. A TARGET-SUPERSET workflow file still gets the step 6 offer whatever this gap-analysis concludes — a superset is where the 1.x rules hide.

- Read both versions. For large files (commands/skills over ~150 lines), delegate the read to **one read-only `Agent`** per file with the brief: *"Compare PACK vs TARGET; report only what the PACK has that the TARGET lacks (concept, pack location, value HIGH/MEDIUM/LOW, one-line integration note). The target is project-customized — do not suggest replacing anything. Be honest if the pack offers nothing."* Keep its conclusions, not the file dumps. The compare agents may run **one model tier cheaper than the session** when the account exposes one — never a more expensive one; unsure → inherit (canon: the `using-the-pack` skill's token-economy dials).
- Be ruthless about honesty: if the target is already a superset, say "nothing to harvest" and skip it. Do not manufacture value to justify an edit.
- Produce a per-file harvest list ranked by value. Drop LOW items unless they're cheap one-liners.

### Phase 3: Confirm scope with the user

Present the consolidated harvest plan via `AskUserQuestion` (multi-select): one option per file/outcome, each summarizing every individual addition and its consequence. Include the grouped **"Move to the 2.0 lean workflow"** choice from step 6 with its per-file sub-rows and the retired-files delete row. Let the user deselect anything. Ask **once** — never a second prompt for controls. Skip files with nothing to harvest without asking.

### Phase 4: Integrate additively (the merge, not a copy)

For each confirmed file, apply the pack's good parts with `Edit` (targeted inserts), **never** `Write`-over:

- **Preserve all project-specific content** — domain rules, real file paths, conventions, examples. If a pack section conflicts with a project-specific one, keep the project's and only add what's genuinely new.
- **Rewire references to this project's reality** — replace the pack's generic placeholders with what exists in `.claude/agents/` and `.claude/skills/` here. The pack's generic `code-reviewer` / `security-reviewer` / reviewer-gate language must point at the actual reviewer agents and Critical-Path skills this repo has (read `.claude/agents/` and `.claude/skills/` to get the real names). Never introduce a reference to an agent or skill that does not exist here.
- **Insert at the natural seam** — add new steps/sections beside the existing structure with clear headings; keep the file's numbering and voice coherent.

**Config files are special — merge fields, never the file:**
- `settings.json` — merge missing `hooks` entries and additively union `permissions.allow` / `permissions.deny`. Never remove the project's existing entries; never overwrite the whole file. Show the diff first. **One exception to additive-only:** if the target's `allow` still carries `Bash(find:*)`, `Bash(git branch:*)` or `Bash(mkdir:*)` — these shipped in earlier pack versions and are no longer shipped, though the project may also have added them deliberately — say so in plain words and **offer** to remove them; an allow entry matches a command *prefix*, so it cannot exclude `find -exec`, `git branch -D` or a `mkdir` anywhere on disk. Show the diff, explain the trade (shell `find`, `git branch` and `mkdir` will now prompt; the pack's own agents search with `Grep`/`Glob` and never needed them), and accept a no. Never remove silently. (If a `settings.pack.json` is lying around from install, treat it as the pack's settings and delete it after merging.)
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
- **Skills** — a Critical Path with no skill is the strongest candidate; decide full triple (skill + reviewer agent) vs skill alone, and name it to this repo's real files/routes/tables, never generic placeholders. A scaffolded reviewer agent carries `effort: max` frontmatter to request maximum effort when dispatched by name; a scaffolded implementer carries an `effort: high` request intended to limit over-engineering. Configured settings and dispatch requests do not prove effective model or effort; actual runtime values remain unknown unless exposed by runtime evidence. Model stays consented, as in bootstrap Phase 6.
- **Guardrail rules** — `block` only unambiguous, expensive violations; `warn` for heuristic ones; keep every `filePattern` absolute-path-safe (`(^|/)foo`, never bare `^foo`). Append to `guardrails.rules.json`; keep every project-specific rule.
- **Post-edit checks** — start conservative: a failing check blocks the edit loop, so only wire fast, reliable commands for a newly-appeared workspace.
- **Audit critics** — two cases:
  - **(a) No panel yet** — the repo has `audit.md` / `bootstrap-critics.md` and only the generic `architecture-critic` / `accessibility-critic` / `correctness-critic` / `operability-critic` / `outbound-truth-critic` / `supply-chain-critic`. → **Recommend the user run `/bootstrap-critics`**; don't silently write a roster — its roster-confirmation is the required interaction. This is the case that makes the audit framework actually *usable* in a repo that predates it.
  - **(b) Panel exists but a new track has no lens** — author the missing critic from `_critic-template.md` per `auditing-with-critics` (one lens, read-only `Read, Grep, Glob`, a `Track:` marker, real reading-list paths, and the archetype's `effort: max`), or point the user at `/bootstrap-critics <track>`. Never duplicate a generic critic's lens.
- **Production surfaces** — only if `project-context.md` has a *Production surfaces* block whose facts have drifted (a test/coverage tool, CI gate, migration tool, or observability stack the block doesn't name). Refresh it additively — same "cite the evidence, or 'none found'" honesty as bootstrap Phase 7; never invent a surface, and skip the dimension entirely if the block is absent or already current. This is what keeps the on-demand `production-reviewer` citing the repo's *current* commands, not the setup-day snapshot.

Also **flag, but don't auto-create**: a **specialist implementer agent** if a substantial new surface appeared with no agent to own it (a backend / frontend / test agent) — note it for the user to generate via `/bootstrap-claude-pack` if they want a team.

**Scope of this phase.** Phase 5 is only for the **per-repo, generated** coverage the bootstrap generators would have produced. Any *generic* new machinery (new commands, generic reviewers, generic critics, new skills like `keeping-it-lean`) is already carried in by the harvest path (Phases 1–4) as TARGET-MISSING copies or additive harvests — it is not re-derived here.

### Phase 6: Validate

- **Refresh the installation receipt for what actually changed.** Call `node <pack>/scripts/install-receipt.js record-install` with a `sourcePath`/`targetPath` action entry for each file this sync actually harvested, copied or left superseded — the same shape the installer produces, **the same generator marker `claude-jig`** the installer uses (not a distinct one — `record-install`'s foreign-receipt protection requires an exact match, so install and sync must agree they're the same owner or neither can ever refresh what the other wrote). Submit only the files this sync actually touched, not a full-tree walk — `record-install` merges incoming actions into the prior receipt by path, so an untouched file's install-time action/hash entry is preserved, not erased by a partial sync submission. The script lives in the pack checkout, never in the project, so a stale target copy can never falsify a receipt. Missing Node: skip this step and say so; it never blocks the sync itself.
- Every JSON file written still parses: `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` (covers `guardrails.rules.json` and `workspaces.json`).
- Every command/skill/agent reference points at a file that exists (`.claude/agents/*`, `.claude/skills/*`).
- Every newly-scaffolded skill has matching frontmatter `name` == directory, and (if a triple) a paired reviewer agent plus a `CLAUDE.md` Critical-Path row.
- Every newly-scaffolded reviewer agent carries `effort: max`, and every scaffolded implementer agent `effort: high`.
- Every new guardrail rule's `filePattern`/`bodyPattern` compiles and is absolute-path-safe; every new `workspaces.json` command is one that actually runs green on the current tree.
- Every newly-authored critic is read-only (`tools: Read, Grep, Glob`), carries a `Track:` marker and `effort: max`, and its reading-list paths all exist (no invented paths). `/audit` will discover it by track.
- After an accepted 2.0 reset: `gate-rules.md` carries the `workflow policy 2` marker and eight numbered sections; every replaced command carries the `<!-- canon: .claude/gate-rules.md#1-8 -->` pointer; `node --check .claude/scripts/plan-ready.js` passes; no retired file remains unless its delete row was declined (say which).
- Markdown structure intact (headings balanced, code fences closed).
- If this project wires guardrails, optionally smoke-test that the rule JSON still loads.

### Phase 7: Summary

Report: the divergence buckets, the 2.0 reset outcome file by file (replaced / replaced with backup / installed / deleted / declined), which files were harvested and the specific parts added to each, which were skipped and why (superset / nothing to harvest / user-deselected), any TARGET-MISSING files copied in, **any new coverage prospected and scaffolded — skills, guardrail rules, post-edit checks, and critics — each with its evidence (or a plain "already covered" per dimension), and a clear "run `/bootstrap-critics` to set up the audit panel" if this repo has the machinery but no panel yet**, and the validation results. Note the pack version synced from so the next run can diff against it. Do **not** stage or commit — leave the changes for the user to review with `git diff`.

## Rules
- **Additive only, with one named exception.** This command never merges into a project's customized file. The 2.0 workflow reset (Phase 1 step 6) may *replace* a workflow file — with the old one backed up under `.claude/_pre-2.0/` and its project-specific content summarized — and may delete the retired engine files; both only after a shown diff and a yes. Phase 4's `permissions.allow` removal offer is the other scoped removal. Nothing else is ever replaced or removed. The whole point is to keep project-specific content and graft pack improvements (and net-new coverage: skills, guardrail rules, post-edit checks, critics) onto it.
- **Honesty over activity.** A file where the target is already a superset gets skipped with a one-line reason — not a manufactured edit. A dimension that already fits the repo (Critical Paths all have skills, the guard set is complete, the critic panel covers every surface) gets **nothing** — "already covered" is the right answer, never coverage invented to justify the phase.
- **Prospect from evidence.** All new coverage (Phase 5) must trace to repo evidence — an uncovered Critical Path, a new module/integration/surface/package, a recurring mistake, or the user's own words — never to what a project "usually" has.
- **Bootstrap, don't auto-generate, the critic panel.** If the repo has the audit machinery but no panel, *recommend* `/bootstrap-critics` rather than silently writing a roster — its roster-confirmation is the required interaction.
- **Rewire, don't transplant.** Pack references to generic agents/skills/paths must be mapped to this repo's real names before they're written, or the harvested gate references something that doesn't exist.
- **Confirm before applying.** Surface the harvest plan (Phase 3) and config diffs (Phase 4) before writing. Never `git add`/`commit`.
- **Validate everything written** (Phase 6) before reporting done.
