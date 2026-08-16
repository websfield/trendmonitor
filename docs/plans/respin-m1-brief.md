# Shaping brief — respin-m1 (Billing and the Credit Ledger)

**Request (as stated):** "continue build according to @docs/initial" — the build plan's next milestone after M0 (as amended by R-18/R-19) is M1.

**Real job:** A creator can pay for the product and see exactly what their money bought — and the founder can meter every generation before a single token burns, so pricing is tunable from data instead of hope.

**Chosen scope:** As documented — `docs/initial/build-plan.md` M1 verbatim, as amended by R-18 (self-hosted Postgres/Lightsail; Stripe stays) and constrained by PRD §4G and decisions R-6 (credits are config-priced internal units, append-only ledger, derived balance, oldest-first, expiry), R-7 (Free/$10/$60/$200 tiers), R-12 (pause-instead-of-cancel, REQ-G08). Scope was settled by the doc set and its prior plan reviews; this brief does not reopen it.

*Deliverables (build-plan M1):* Stripe products/prices via a checked-in setup script; checkout for the three paid tiers; Customer Portal link; pause/resume flow (pause_collection, credits frozen, expiry clocks suspended, cancel flow offers pause first); webhook handler with idempotency; `credit_ledger` with grant/pack/debit/adjust kinds, expiry semantics, derived balance; overage pack purchase; auto-top-up opt-in with monthly cap; usage page (balance, burn, invoices); config table v1 (credit costs, allowances) editable from admin.

**Inherited M1-entry obligations (from the M0 + auth-swap deferral ledgers — the plan must show each one's receiving task):**
1. Bootstrap concurrency test for `ensureUserWorkspace` on real Postgres (Docker, no longer credential-bound) — required *before any money path lands on it* (M0 deferral, `SHORTCUT:` marker phase-3 AC-2).
2. Empty-string email guard at the bootstrap call site + test — required *before the users row feeds billing*.
3. FK from `users.auth_user_id` to the Better Auth `user` table (with the empty-email guard row).
4. `email` dual-truth resolution: sync-on-session or drop the domain copy.

**10-star sketch (aim, not commitment):** Usage page that narrates value, not consumption ("this month your credits produced N scripts; your best performer came from one of them"); margin dashboard live from day one; pause flow that shows the brain-as-asset view at the cancel moment (R-12 — the view itself is M2+, the pause mechanics are now).

**North Star alignment:** advances the Goal directly — build-plan M1 is the doc set's own sequencing ("metering exists before anything burns tokens"); NORTH_STAR and decisions R-6/R-7/R-12 all point here.

**Non-goals (now):** Generation/modes (M3); brain docs (M2); trends (M4); annual pricing (R-7 revisit); affiliate tracking (R-13, off-the-shelf, post-launch); Free-tier card requirement (PRD open decision 4); margin dashboard *rollup UI* beyond what config v1 + ledger make trivially readable (full dashboard is M6; M1 ships the config + cost recording that feed it); any edit to `src/` or `cutdown/`.

**How this fails (pre-mortem):**
1. **Ledger correctness under concurrency and replay** — a double-delivered webhook granting twice, a debit racing a grant expiry, or a balance derived differently in two places turns the ledger into fiction. Money paths need real-Postgres (Docker) concurrency tests and a single balance-derivation authority; PGlite alone is single-session (R-17) and cannot prove this.
2. **Stripe evidence vs engineering conflated** — Stripe test-mode keys are owner-bound. Everything must be provable keyless (adapter boundary + fixture/replay tests for webhooks, integration tests against the ledger), with the live test-mode run reported as a separate evidence row — exactly the M0 Clerk discipline. Building against remembered Stripe API shapes is the sub-risk: verify against current Stripe docs/SDK types (golden rule 9).
3. **Expiry/pause semantics drift** — R-6/R-12 pin subtle clock rules (1-month rollover grants, 12-month packs, oldest-first consumption, pause suspends expiry clocks and shifts them on resume). If these live as scattered date arithmetic instead of one tested module with table-driven cases, they will silently disagree with the PRD and the reviewer can't tell.

**Must-answer ambiguities for the plan (pick reversible defaults, record per working agreement):** where webhook idempotency state lives (dedicated `stripe_events` table vs ledger constraint); whether config v1 versioning is append-only rows or version-column; how "credits frozen" is represented (ledger kind vs workspace state); auto-top-up trigger location given no Inngest decision post-R-18 (R-5's Inngest row stands but nothing self-hosted is wired yet).
