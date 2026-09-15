# Shaping brief — respin-service-quality

**Request (as stated):** "I understand payment is important part of the success of the business. But services need to come first, for the last few rounds we have been focusing on payment related matters, let's park that now. I want all attentions on how to improve the services." (2026-09-15, after the persona-journey run and the `respin-journey-fixes` plan review)

**Real job:** A creator who signs up should get, in one sitting and without hitting a dead end, a voice brain that builds reliably, a clear path through onboarding to their first draft, and drafts whose `[check]` markers mean something — and the team should be able to prove that path keeps working every night.

**Chosen scope:** Right-sized — the service defects and gaps the 2026-09-15 journeys surfaced on the surfaces every creator reaches (onboarding, brain, Studio, first ideas, Free Trends and Results views), plus the journey harness as a nightly service regression on the Free path. Source register: [`../progress/respin-journey-fixes-audit.md`](../progress/respin-journey-fixes-audit.md) rows F-02 (service half), F-03, F-04, F-05 (UI only), F-07–F-14, F-18–F-21 (Free-path parts).

**Parked, by the owner's decision (2026-09-15):** everything on the money path — the tier-checkout and auto-top-up rollout activation, the dedicated Stripe sandbox, the included-build consumption fix, the billing page rewrite, paid-tier CI. Recorded in [`respin-journey-fixes-master-plan.md`](respin-journey-fixes-master-plan.md) with its full review history; nothing there is deleted.

**What cannot be walked while payment is parked, stated plainly:** Trends paste → autopsy → Spin, Results logging, and the four full-script Studio modes are gated to paid tiers by code tables (`packages/credits/src/mode-access.ts`, paste requires a paid tier; `performanceLearning.free = "view_only"`), and there is no sanctioned dev-tier fixture (`packages/db/src/seed.ts` creates a Free workspace). Their service quality is therefore **unassessed by this goal**; the slice cards for 8, 8c and 9a already record them at ALMOST with evidence unearned. This goal does not invent evidence for them.

**10-star sketch (aim, not commitment):**
- The voice brain builds first time, every time, or says exactly which of the product's own checks the reply failed and re-asks once inside the same run.
- A new account lands in a four-step onboarding with "you are here", reaches Brain from the rail, and reads a brain page that fits on a screen.
- Every draft's `[check]` marker points at something the creator actually needs to fill; the product never flags its own words.
- The four persona journeys run nightly on the Free path and fail loudly on any service regression, with screenshots attached.

**North Star alignment:** advances Goal item 1 (an inspectable, confirmable brain — it must build to be confirmed) and the day-90 activation proof (40%); the first-session path is the activation funnel. No Non-goal touched.

**Non-goals (now):** any billing, ledger, Stripe, tier or allowance change; the admin surfaces and invite UI (10b-2); autopsy/Spin/Results-logging service work (unreachable without a tier); visual redesign beyond DESIGN.md.

**How this fails (pre-mortem):**
1. The voice-build failure is misdiagnosed: the run-2 refusal was an `AssemblyError`, but the log carried only the class name, so the plan hardens the wrong check — must-answer: the first task records the failure kind (content-free) and reproduces it against the stored reply shape before any tolerance is added.
2. Reordering onboarding and adding a step header derives a "done" state the page never read — must-answer: every state comes from an existing scoped read or the one new accessor named, and a read failure renders `unknown`.
3. The nightly Free-path run passes on skips and recorded refusals (the admin persona's bootstrap skip, the editor's precondition refusal) — must-answer: every persona has a presence assertion for its main chapter's screenshot and the note scan fails the job on a `BLOCKING` note.
