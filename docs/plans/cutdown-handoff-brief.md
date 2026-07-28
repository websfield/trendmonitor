# Shaping brief — cutdown-handoff

**Request (as stated):** Review `docs/video-editing/PRD.md` & `docs/video-editing/tech-spec.md` to identify gaps & issues, then address them and create a set of docs sufficient to hand to a developer to build Cutdown without the owner overseeing the development.

**Real job:** A developer picks up Cutdown Phase 0 cold and never has to interrupt the owner — every decision is either made, given a decision rule, or explicitly marked as an owner-escalation with a stated trigger.

**Chosen scope:** Right-sized — fix the gaps in PRD + tech-spec, resolve or decision-rule every open decision, then produce a full handoff set (master plan + per-phase plans with verifiable acceptance criteria, setup guide, working agreements / definition of done) gated through the pack's multi-agent plan review. Developer context: Claude Code in this repo, so the plan documents live in `docs/plans/` per pack convention and the self-contained product docs stay in `docs/video-editing/`.

**10-star sketch (aim, not commitment):** Also scaffold the `cutdown/` skeleton (folders, first contract schemas, `validate:contracts` entry gate wired) so the developer starts from a running gate; add golden-set fixture footage; wire `.claude/skills/video-editing/` mirrors from day one.

**North Star alignment:** N/A by design — Cutdown is an independent incubated product (tech-spec §14); this repo's North Star governs the UGC Intelligence system. No drift flag: the doc set explicitly declares independence.

**Non-goals (now):** No `cutdown/` code or scaffolding in this scope; no changes to the UGC Intelligence doc set or `src/`; no resolution of decisions that genuinely belong to the owner (e.g. music-library partnerships, launch-platform choice beyond Phase 0's single-platform need) — those get decision rules and escalation triggers, not fabricated answers.

**How this fails (pre-mortem):**
1. **Open decisions left open** — PRD §18 (10 items) and tech-spec §16 (5 items) each block or misdirect an unsupervised developer; every one must end this work either decided-for-Phase-0 or carrying an explicit decision rule + revisit trigger.
2. **Unverifiable "done"** — acceptance criteria that a developer can't self-check (e.g. "editorial quality is good") make unsupervised work unfalsifiable; every phase criterion must be checkable by a command, a fixture, or a countable artefact.
3. **Cross-doc contradiction** — PRD §10.3's repo layout predates tech-spec §2 (no `skills/`), REQ numbering and readme claims ("113 requirements") may not match reality; any inconsistency the review finds gets fixed in the docs, not papered over in the plan.
