# Pre-2.0 CLAUDE.md blocks (backed up by /sync-pack on 2026-09-21)

Replaced by the pack 2.0 forms. Kept verbatim so the rules they state stay readable,
and so records that cite gate-rules.md §§1-16 resolve against the canon they were written under
(that file is preserved at .claude/_pre-2.0/gate-rules.md).


## Critical Paths → reviewer mapping (which gate runs when)

<!-- canon: .claude/gate-rules.md#1-16 -->
**Before running any reviewer gate, read `.claude/gate-rules.md` §§1–§16 and follow it.** The block below is the project's human-readable summary and selector; the canon governs initial batch 0 plus retry batches 1–2, independent fallback, final freshness, severity, spend, intensity, lane variants and economy hooks.

A change touching **N** Critical Paths must pass **N** gates. Skipping a gate because "tests pass" or "it's a small change" is drift. Catching yourself arguing a change is too small **to check at all** is the signal to run the gate — once; only the *follow-up* is proportional to the risk. It is not a licence to re-review a typo fix. The proportionality dial is the **number of rounds**, and the reviewer set **only** through the sanctioned lean merge — never by dropping a Critical Path from the set. Every touched path is looked at, every time. (The lean merge is the `Gate intensity: lean` dial — one consolidated reviewer run per gate, still one verdict per path; details in the `using-the-pack` skill.)

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) | Full gates? |
|---|---|---|---|---|
| Veto & verdict integrity | vetoes V1–V6, verdict engine, approval flow, model prompt/output handling, `rubric-v1.json` lanes, compliance notes, **mechanism-statement ratification** | `veto-verdict-integrity` | `veto-integrity-reviewer` | yes |
| Boundaries & authority | component call-graph, event log / `events-v1.json`, breaker, library promotion, version triple, tenancy, **`mechanisms-v1.json` / Contract E / C4** | `component-boundaries` | `boundary-reviewer` | yes |
| Measurement discipline | provenance, baselines/denominators, calibration & eval plan, trend subsystem, holdout design, **prevalence & the warrant ladder** | `measurement-discipline` | `measurement-reviewer` | no |
| Money & exploration | budget allocation, ε, `arm` tags, AWS weights, amplification recommendations | `budget-exploration` | `budget-exploration-reviewer` | yes |

**Cutdown is a second product line** (`cutdown/`, `docs/video-editing/`) and is exempt from the four rows above by `docs/video-editing/tech-spec.md` §14 — it has its own two paths, and the exemption is not an absence of gates:

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) | Full gates? |
|---|---|---|---|---|
| Cutdown measurement honesty | counting & exit criteria, `status --phase0`, baselines/cohorts/denominators, uplift or performance claims, QA pass rates, latency/cache/accuracy rates, `packages/evaluation`, `output-counting-policy.md`, PRD §14/§15 numbers | `cd-measurement-honesty` | `cutdown-measurement-reviewer` | no |
| Cutdown tenancy & boundaries | `packages/contracts/schemas/**`, `contract-set.ts`, generated trees, delivered-artefact immutability, `decisions.md`, artefact paths & containment, skills registry / `cutdown-*` mirror, the boundary to `src/`, Review Studio & workspace isolation | `cd-tenancy-boundaries` | `cutdown-boundary-reviewer` | yes |

**Respin is the active product line** (`docs/initial/` — PRD/tech-spec/build-plan, decisions R-1 supersedes the Cutdown program; the UGC doc set is frozen at `docs/initial.past/`). Its four paths gate the Respin build (`app/`, `packages/`) from M0; the six rows above continue to gate the earlier codebases they name:

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) | Full gates? |
|---|---|---|---|---|
| Respin billing & credits | billing, `credit_ledger`, metering, Stripe webhooks, tiers/pricing/allowances, packs, auto-top-up, pause/resume, expiry, `packages/credits`, `packages/config`, margin dashboard, PRD §4G | `respin-billing-credits` | `respin-billing-reviewer` | yes |
| Respin brain tenancy | workspace/profile isolation, query scoping, `brain_docs` versioning & provenance, onboarding inference, session→library contributions, export/deletion, seats/roles, admin surface, PRD §4A/§4D | `respin-brain-tenancy` | `respin-tenancy-reviewer` | yes |
| Respin spin compliance | `packages/trends` ingest adapters, autopsy pipeline, Spin, the similarity gate, kill-test honesty, integrity guardrails REQ-I01–I05, PRD §4E/§4I | `respin-spin-compliance` | `respin-compliance-reviewer` | no |
| Respin learning honesty | results entry, verification flags, baselines, north-star metrics, promotion proposals, minimum-n, `packages/brain`, reach-vs-conversion, confounders, success-metric/pilot claims, PRD §4F/§5 | `respin-learning-honesty` | `respin-learning-reviewer` | no |

*`Full gates?` = `yes` for paths where a missed finding is expensive and hard to reverse — auth, money, data migration, anything that writes to an external system. Those keep their own separate reviewers even under lean. Here: the two verdict/authority paths, both money paths, and both tenancy paths.*

Reserve every required reviewer and final consolidator slot before a batch starts. Count every actual evaluation, including continued-agent verdicts and failed/interrupted attempts, and preserve remaining allowance across retries, sessions and amendments. Zero touched paths still requires an independent generalist; missing named reviewers use a separate general-purpose context with the same checklist. Unavailable independence stays unverified. Cosmetic Medium-or-lower fixes need relevant validation and a recorded resolution; semantic edits require affected validation/review again. Self-review and accepted risk never manufacture PASS.

Gate intensity: lean

`lean` consolidates each reviewer gate into **one merged run** that still renders a verdict per touched Critical Path — every checklist, fewer agents, never silent. It costs two things, stated plainly so the choice is real: the merged run cannot carry each reviewer's `effort: max` (each separate reviewer thinks at its maximum setting; the merged run thinks at your session's normal setting — say "think hard" to raise it), and the advisory simplification pass is skipped. `full` runs one reviewer per touched path — most thorough, most agents per gate. Paths marked `yes` in the **`Full gates?`** column above keep their own separate reviewers regardless. Say **"full gates on this one"** to escalate any phase. Absent or unresolved = `full`. (Details: the `using-the-pack` skill.)

## Definition of Done

A change is done when (the full gate machinery lives in the `using-the-pack` skill):
- **Entry gate clean first:** every command in the Commands block passes — schemas parse, `dotnet build` + `dotnet test`, `pytest`, `ruff`, frontend typecheck + tests — or, when a baseline is recorded at `docs/progress/entry-baseline.md`, no **new** failures vs it (it only ratchets down, and retires at green).
- Every applicable Critical-Path gate reports PASS — the table above decides which run — and the report card reads **Ready**.
- Cross-referenced docs stay consistent: an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together, in the same change.
- Acceptance criteria met; docs updated if behaviour or config changed (`/sync-docs` does this).
- **Reachability:** a user path reaches this change — or the plan names the slice that makes it live. A capability nothing can reach is not done, it is inventory.
