# Shaping brief — respin-journey-fixes

**Request (as stated):** "run all journeys in respin\e2e\journeys to identify bugs and issues and ui ux gaps. then create plan to address them"

**Real job:** A creator who signs up today should be able to reach every surface the pricing page sells — upgrade, second profile, paste-and-spin, log a result — without hitting a dead end, a silent refusal, or a wall of prose; and the persona journeys should prove that path on every run, not skip it.

**Chosen scope:** Right-sized — fix what the four journeys actually surfaced on 2026-09-15 (register: [`../progress/respin-journey-fixes-audit.md`](../progress/respin-journey-fixes-audit.md)), grouped into three phases: (1) paid tiers reachable and credit consumption honest, (2) first-session flow and page ergonomics, (3) journeys that prove the paid path and run in CI. Nothing the register did not surface is in scope.

**10-star sketch (aim, not commitment):**
- A new account lands in a four-step onboarding with a visible "you are here", and the brain page reads like a document, not a dump.
- Every refusal names its reason and its remedy in one sentence, and never offers a control that cannot help.
- The persona journeys run nightly against a dedicated Stripe sandbox and a real model, and the report card links every screenshot.

**North Star alignment:** advances the Goal's day-90 proof directly — free→paid ≥ 5% is unreachable while subscription checkout refuses on every environment whose rollout row is `expanded`, and 40% activation is undercut when a Free creator's one included voice build can be spent by a parse failure. No Non-goal is touched.

**Non-goals (now):**
- The PRD REQ-J01 admin surfaces (curation queue, trend sources, bounded credit adjustments) and the invite-a-seat UI — both already planned in [`respin-finish-phase-10b-2.md`](respin-finish-phase-10b-2.md); the journeys record their absence, this plan does not build them.
- Any bypass of the tier-checkout or auto-top-up rollout authority (a seeded `active` row, an env flag). The rollout ceremony stays the only producer of `active`.
- Worker dead-letter hygiene on the shared dev database (8,418 rows observed) — the `growing_dead_letters` signal already fires; clearing dev residue is an operator action, recorded in the register, not product work.
- Visual redesign beyond DESIGN.md's existing tokens and components.

**How this fails (pre-mortem):**
1. The tier-checkout audit on the shared dev Stripe test account reports blockers from historical Checkout Sessions that no local action can clear, so "activate in dev" never completes — must-answer: does the runbook's CI path need a dedicated Stripe sandbox account?
2. Moving the voice-reply parse inside the metered run changes which failures consume the included build; if the new error class defaults `consumesIncludedBuild` from `billable`, a parse failure still spends the free build — must-answer: the class passes `consumesIncludedBuild = false` explicitly and a planted-unparseable-reply test asserts no claim row.
3. Reordering onboarding and adding a step header derives "done" states from data the page does not currently load, so the header lies — must-answer: which props already carry posts count, voice activation, interview submission, first-ideas run.
