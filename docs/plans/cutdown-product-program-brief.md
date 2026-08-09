# Shaping brief — cutdown-product-program

**Date:** 2026-08-08
**Status:** Shaping complete; planning authorised (planning only — no feature code this session, by the requester's explicit choice).

---

## Request (as stated)

A written assessment graded the cutdown product across eight areas (contracts A-, local pipeline B+, rendering B, editorial evidence D+, user editing experience D, platform/package completeness D, analytics F, external-user readiness D), concluded that `PIPELINE_IMPLEMENTATION_COMPLETE` is earned but "the broader objective of helping ordinary users produce engaging, high-quality social posts is not", listed eight critical gaps, and proposed an eight-stage transformation program (Stages 0–7) estimated at five-to-seven months plus hosted-beta hardening. The instruction was "implement according to below findings and plans".

The requester then chose: **plan all eight stages first** (no feature code this session), and **yes, commit the Phase 4–6 work** (done — commits `c21c7aa`, `7404a65`, `501f212`).

## Real job

> A Social Soup producer with a folder of campaign footage gets back a set of finished, platform-native social posts they'd actually publish under the client's name — and can tell, from evidence rather than faith, whether those posts did better than what the account was already making.

The current system does the *middle* of that sentence well: it turns indexed footage into a technically clean, rights-aware, contract-validated package. It does not do the front (a producer cannot get footage in or review a cut without a terminal and Claude Code) or the back (nothing observes what happened after publication, so "better" is currently unmeasurable and therefore unclaimable).

## Chosen scope

**Full program, planned now; built later, stage by stage.** Eight stages, each with acceptance criteria, dependencies and an exit gate, so that the sequencing decision is made once and deliberately rather than re-derived under pressure at each stage boundary.

Two deliberate authoring decisions inside that scope, both of which are judgment calls I'm stating rather than burying:

1. **The program is expressed in the PRD's existing roadmap vocabulary, not a parallel one.** The pasted plan invents Stages 0–7. The PRD already defines Phases 0 / 1 / 1.5 / 2 / 3 / 4 (§15). Publishing a second roadmap with different numbers would *worsen* the single-source-of-truth problem the assessment's own finding #2 raises. The stages are therefore mapped onto PRD phases explicitly, and the mapping is stated in the master plan.

2. **Planning detail decays with distance, deliberately.** Stages 0 and 1 get full task-level phase plans. Stages 2–7 get objective, requirement bindings, dependencies, acceptance criteria and known risks — but not invented task tables. Task-level detail written today for work five months out would be wrong on arrival and obeyed anyway because it is written down. Each far stage carries an explicit re-planning trigger.

## 10-star sketch (aim, not commitment)

- A producer drops a campaign folder in a browser, answers three questions about the objective, and comes back to four genuinely different cuts — each with its angle, the moments it chose, and why.
- They fix a caption by typing over it, drag a crop anchor, say "use the result sooner", and the system regenerates only what that note actually affects.
- Every published cut carries its objective and its changed variable, so the scorecard six weeks later says "hook-first openings beat context-first for this account, n=14" rather than "engagement up 4%".
- The account's own style is learned from its own approved history and proposed back for human ratification — never applied silently.

## North Star alignment — **FLAGGED, and this needs a decision eventually**

`NORTH_STAR.md` at the repo root describes **UGC Intelligence for ClientHub**: a deterministic compliance gate, an amplification scorer that must beat a naive baseline or delete itself, and a Knowledge API serving falsifiable `Mechanism` claims. Its Goal, Success-looks-like, Constraints and Non-goals are all about that system.

**Cutdown is not in it.** Cutdown is a second product line — "Cutdown v2 — Performance-Informed AI Editorial Engine for Social Video" (`docs/video-editing/PRD.md`) — with its own PRD, tech spec, decision log (D-1…D-55) and roadmap. `tech-spec.md` §14 formalises the separation by forbidding cutdown work from touching `src/`, `tests/`, `config/` or `docs/initial/`, and the existing `cutdown-master-plan.md` Critical-Paths table is all-No for exactly this reason.

So this is **not a Non-goal collision** — the two products don't contradict each other. It is a **coverage gap**: the repo's stated single yardstick does not measure the thing this program builds. Consequences worth naming:

- Stop Condition 5 (`/create-plan`) cannot be run meaningfully against the root North Star for this work. Planning proceeds against the **cutdown PRD §14/§15** as the governing success contract instead, which is the honest substitute and is what the existing cutdown plans already do.
- None of the four UGC Critical Paths (veto/verdict, boundaries, measurement, money) trigger, so cutdown has no project-specific reviewer gate. Its gates are `plan-reviewer` (plan-time) and `code-reviewer` (code-time), both generalist. **This is a real thinness** given that Stage 1 and Stage 6 introduce statistics and Stage 7 introduces tenancy — two areas where UGC has dedicated reviewers and cutdown will have none. The master plan proposes cutdown-specific reviewers as a Stage 0 deliverable rather than leaving the gap unnamed.

**Recommended, not done here:** either give cutdown its own North Star document, or extend the root one to name both product lines. I have not written either — that is the requester's call, and inventing a second goal to judge against would violate the pack's own honesty rule.

## Non-goals (this program)

- **Executing publishing.** Direct publishing connectors stay out until the editing experience and measurable quality are proven — the assessment's own closing recommendation, and consistent with PRD Phase 2.
- **Multi-tenant hosting ahead of proven quality.** Stage 7 exists, but sequenced last, deliberately.
- **Any change to `src/`, `tests/`, `config/`, `docs/initial/`** — the UGC Intelligence planes. `tech-spec.md` §14, unchanged.
- **Fine-tuning models.** Provider-neutral adapters and recorded model versions, per the PRD's executive-decisions table.
- **Re-opening settled decisions.** `decisions.md` D-1…D-55 is append-only settled law. Stages that need a settled decision reversed (e.g. D-47's refusal of `subject_reframe` / `split_screen`, which Stage 4 must revisit) do so by appending a superseding decision with its reasoning — never by silent drift.
- **Retrofitting per-phase commits onto Phase 4–6 history.** Already decided and executed: the worktree was a cumulative snapshot; three coherent commits, not four invented ones.

## How this fails (pre-mortem)

1. **The roadmap forks and nobody notices which one is real.** Two numbering schemes (Stages 0–7 vs PRD Phases 0–4) both live in `docs/`, drift apart, and the next reader trusts the wrong one — reproducing finding #2 at larger scale. *Mitigation: one mapping table in the master plan, stages named by PRD phase, and the stale `cutdown-master-plan.md` lines corrected as a Stage 0 task with its own acceptance criterion.*

2. **Stages 1 and 6 are planned as engineering and are unbuildable as engineering.** Both depend on inputs no amount of code produces: published outputs, real platform analytics, an owner-set spend ceiling (D-21), and permission to use client accounts' performance data. Planned as pure code, they will be marked "complete" with a working `evaluate` skill and zero observations — an F-grade that looks green. *Mitigation: every such input is a named, blocking, owner-owned prerequisite in the Dependencies table, in the same style D-21/D-27/D-36 already use, and each stage's exit criterion requires data, not just the code path.*

3. **Stage 2 is scoped as "a browser UI" and is actually a new product surface.** Cutdown today has no frontend, no design system, no `DESIGN.md`, no auth model, and no HTTP layer (`skills serve` is an unbuilt D-13 stretch). Video review specifically needs frame-accurate scrubbing, overlay simulation, and caption editing against burned-in output — none of which is boilerplate. Planned as one stage, it either balloons or ships something a producer politely declines to use. *Mitigation: Stage 2 is planned against a real thin-slice exit criterion — one producer completes upload-to-package without a terminal — with the design work (`/design`, `DESIGN.md`) named as an explicit task rather than assumed.*

**Must-answer ambiguities carried into planning:**
- Does cutdown get its own North Star, or does the root one grow to cover both product lines? *(Flagged above; not blocking Stage 0.)*
- Is the D-21 spend ceiling ever going to be set? Stage 1's live provider benchmarks and Stage 3's live model execution are both blocked on it, and `PHASE_3_ACCEPTED_LIVE` has been waiting since Phase 3.
- Whose analytics, under what permission, for Stage 6? The rights records from the real proving run already note that formal creator agreements are held by the campaign, not attached — performance data has a similar consent question.

---

**Next step:** `/create-plan cutdown-product-program` — this brief is its starting contract.
