---
description: Analyze this repository and generate a tailored panel of read-only critic agents (one lens each, tagged by track), the way /bootstrap-claude-pack generates jig's reviewers. Proposes the roster, confirms it, then writes the agents. Do NOT use for first-time project setup — that's /bootstrap-claude-pack.
argument-hint: [optional focus e.g. "architecture security" | blank for full roster]
---

You are generating this repo's **critic panel** - the read-only auditors that `/audit` will convene. This mirrors how jig generates project-specific reviewers, with the same discipline: evidence-only, never manufacture a critic the repo does not warrant.

## 1. Read the repo

- Read `CLAUDE.md`, `NORTH_STAR.md`, and the Critical-Path table if present.
- Survey the actual layout with Glob/Grep: top-level apps/packages/modules, the stack, the surfaces present (API, UI, data, infra, payments, auth, realtime, ...). Cite what you find.
- **Inventory `.claude/agents/` fully**: existing critics (any file with a `Track:` marker that isn't the template's placeholder — from an earlier run or written by hand), jig's gate reviewers, and any foreign/hand-made agents. Note each existing critic's lens and reading list — the roster you propose must reconcile with this panel, not sit beside it.

## 2. Propose the roster (confirm before writing)

- Propose one critic per genuine lens the codebase warrants, each assigned a `Track`. Common tracks: `architecture`, `security`, `payments`, `data`, `ops`, `ux`, `accessibility`, `docs` - but choose only what THIS repo justifies, with a one-line evidence reason each (a real module/route/dependency). A data pipeline earns schema/PII/cost critics, not a funnel critic; a storefront earns the reverse.
- Do NOT duplicate a lens jig already covers as a generic reviewer unless the audit posture (whole-system, ranked register) adds something the gate does not.
- The six generic critics (`architecture-critic`, `accessibility-critic`, `correctness-critic`, `operability-critic`, `outbound-truth-critic`, `supply-chain-critic`) already ship; only re-generate them if this repo needs a tailored version. The exception worth making often: on any non-trivial codebase, a **tailored correctness-critic** that names this repo's real entry points, state-mutation sites, and risk surfaces out-hunts the generic one — propose it. (`operability-critic` is the `ops`-track stranger test — runbook currency, deploy/rollback, config inventory, the outside-account inventory, and the backup/restore reality check; propose a tailored version where the repo's deploy/data surface is non-trivial.)
- **Reconcile with the existing panel (one lens, one critic).** A proposed lens an existing critic already covers → propose an **upgrade in place**: keep its repo-specific reading list and any hand-added mandate lines (that tailoring is the most valuable content in the file), bring it to the current archetype (`Track:` marker, adversarial posture, Hunches + Coverage sections, the earned-A readiness line). An existing critic that already covers its lens and is current → `keep as-is`. A critic whose subject no longer exists in the repo → propose retiring it. Never propose a second critic beside an existing one for the same lens.
- **Panel-size band (a sanity check, not a quota):** counting the whole panel after reconcile — shipped generics included, retires excluded — a single-surface repo (one app, one stack) usually lands at **2–4** critics; a typical multi-surface app **4–7**; a large system with several distinct domains (payments, data pipeline, public UI, infra) **7–10**. Landing outside the band is a signal to re-check, not a rule: above ~10, two lenses probably overlap — merge them; below the band on a repo with several real surfaces, name the surface left uncovered and why. Evidence still decides every seat.
- Show the proposed roster with each row marked **`new` / `upgrade` / `keep as-is` / `retire`** (name, track, one-line evidence reason), state the final panel count against the band (e.g. *"6 critics — inside the 4–7 band for a multi-surface app"*), and STOP for the user's confirmation — retirements included. This is the only required interaction.

## 3. Generate the agents

- For each confirmed `new` critic, write `.claude/agents/<name>.md` from the `_critic-template.md` archetype, filled in for THIS repo: a one-lens mandate, a reading list of the **real** files/dirs it owns, and the critic output schema. Put the `Track:` marker line at the top of the body. Keep the archetype's `effort: max` frontmatter — critics are gates, so they think hardest; it applies when `/audit` dispatches them by name, `max` is the ceiling on any model, and it needs no per-account tuning.
- For each confirmed `upgrade`, show the diff before writing (the roster confirmation authorized the upgrade; the diff is so nothing hand-tuned is lost silently) and preserve every repo-specific line that is still true. For each confirmed `retire`, delete only after the roster confirmation explicitly included it.
- Read-only tools only (`Read, Grep, Glob`; add `WebFetch, WebSearch` only where confirming an external framework's behaviour is part of the lens).
- Never invent file paths; every reading-list entry must be a path you verified exists. If a lens has no real subject in the repo, drop it and say so.

## 4. Report

List the agents written, their tracks, and tell the user to run `/audit` (or `/audit <track>`).

Write only under `.claude/agents/`. Edit nothing else.

> This generates the panel from the repo as it is **today**. Surfaces grow new tracks later; `/sync-pack` re-prospects for missing critic lenses (and skills, guardrail rules, and post-edit checks) so audit coverage keeps pace without re-running this generator from scratch.
