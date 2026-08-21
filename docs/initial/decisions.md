# Decision Log: Respin

Append-only. Each entry: context, decision, consequences, revisit trigger. Supersede by appending, never by editing. Numbering starts fresh (R-1...) - Cutdown's D-series remains valid history for the parked execution layer.

---

## R-1: Product direction supersedes Cutdown program (2026-08-13)

**Context:** The Cutdown v2 PRD and its eight-stage product program target a Social Soup producer job that no longer exists as the goal. The owner's direction: a subscription service helping creators create better content, generalising the proven vivian-content method.
**Decision:** Respin's PRD is the active product direction. Cutdown's PRD is demoted to a component spec for a possible future execution layer; its Stage 0-7 program is parked. Surviving requirement families are carried by reference in the Respin PRD.
**Consequences:** Owner-blocked items tied to the producer program (client accounts, client analytics consent, spend ceiling for the old pipeline) dissolve. The measurement-honesty discipline, contract habits, and integrity guardrails carry forward as product law.
**Revisit:** If pilot creators demand done-for-you editing, re-open the execution layer against the parked Cutdown spec.

## R-2: Working name "Respin" (2026-08-13)

**Decision:** Placeholder pending domain research. Nothing user-facing hardcodes the name; it lives in one config constant.
**Revisit:** Before M6 marketing site ships.

## R-3: Spin, never copy (2026-08-13)

**Context:** Owner asked for a trend monitor that lets creators "copy" trending posts. Platforms deprioritise or de-recommend unoriginal content; the product's own corpus evidence shows adapted mechanisms outperform copies; verbatim reproduction is also a rights risk.
**Decision:** The feature is capture → autopsy → Spin (mechanism kept, subject/wording/structure changed, similarity-gated). Verbatim or near-verbatim output is a hard release gate (REQ-E04/I02). The user-facing framing: "make my version".
**Consequences:** Slightly more model spend per trend action (autopsy cached to offset); a defensible feature that survives platform policy enforcement.
**Revisit:** Never on the principle; thresholds tunable in config.

## R-4: Compliant trend sources only (2026-08-13)

**Decision:** v1 ingests from the YouTube Data API and creator-submitted links (oEmbed + captions or pasted transcripts). No scraping of closed platforms. Third adapter slot reserved for a licensed provider or official trend surface, chosen from pilot demand.
**Revisit:** When pilots name the platform they most need coverage for.

## R-5: Stack defaults (2026-08-13)

**Decision:** Next.js 15 + TypeScript on Vercel; Neon Postgres + Drizzle; Clerk auth (Organizations for Studio seats); Stripe Billing + Checkout + Portal; Inngest jobs; Anthropic behind a provider adapter; Zod at boundaries; Resend; PostHog; Sentry.
**Consequences:** Fastest solo-founder build path; some vendor lock-in accepted knowingly.
**Revisit triggers:** Clerk cost at >5k MAU; Vercel cost at sustained job load (move Inngest workers); provider adapter exists so model vendor is swappable at any time.

## R-6: Credits are internal units, config-priced (2026-08-13)

**Decision:** Credits decouple pricing from tokens. Costs per operation, tier allowances, model tiers, and similarity thresholds live in versioned DB config, editable from admin without deploy. Ledger is append-only; balance is derived; grants expire (1-month rollover), packs expire at 12 months; debits consume oldest-first.
**Consequences:** Pricing tunable weekly against the margin dashboard; launch numbers in the PRD are explicitly indicative.
**Revisit:** Margin dashboard weekly from M3; hard review before public launch.

## R-7: Tiers and prices (2026-08-13)

**Decision:** Free / Creator $10 / Pro $60 / Studio $200 monthly, allowances and feature gates per PRD §4G table. Free tier has no card requirement at launch.
**Revisit:** Free-card requirement if abuse observed (PRD open decision 4); annual pricing after 60 days of cohort data.

## R-8: Brains are context, not weights (2026-08-13)

**Decision:** No fine-tuning per creator. The brain is four versioned documents assembled into context at generation time, with provenance per field and proposal-based updates only.
**Consequences:** Portability (export works), inspectability (creator sees exactly what the system believes), and provider independence.
**Revisit:** Only if context assembly measurably caps quality after prompt-bundle iteration is exhausted.

## R-9: Shared library seeds mechanism-level only (2026-08-13)

**Context:** The founding framework set (F1-F9 and hook taxonomy) was extracted partly from one creator's corpus and paid results.
**Decision:** Seed frameworks carry beats, mechanics, and evidence summaries only - no personal details, voice rules, numbers, or performance data from any individual creator, founding or otherwise (REQ-D04). Written confirmation with the founding creator before M2 seeding.
**Revisit:** If a revenue-share or attribution model for contributed frameworks is ever introduced.

## R-10: Minimum-n learning discipline (2026-08-13)

**Context:** The predecessor project's measurement program and the vivian performance log both documented the cost of claims made below evidential minimums (two withdrawn rankings; three review rounds on baseline honesty).
**Decision:** Promotion proposals require n ≥ 3 comparable verified results, constructed only in `packages/brain` (sole emitter). Unverified reports are stored but excluded from learning. Paid and organic never pool. Reach and conversion always reported separately. Engineering completion and evidence completion are reported separately in every milestone.
**Revisit:** The n threshold is config; the sole-emitter and no-pooling rules are not.

## R-11: Launch wedge is YouTube Shorts creators (2026-08-14)

**Context:** Primary persona is the short-form creator, but day-one compliant trend data exists only on YouTube. The paid-ideation market (Spotter $49, vidIQ $39, 1of10 $29, OutlierKit $29-49) is entirely YouTube, proving willingness to pay there; none outputs a voice-true script with a shot map.
**Decision:** Target YouTube Shorts creators at launch. Messaging stays "short-form creator"; targeting, pilot recruitment, and trend coverage are Shorts-first. TikTok/IG-native creators are the expansion via licensed data, sequenced by pilot demand. Partially resolves PRD open decision 2.
**Consequences:** Trend product and target audience are aligned at launch; competitor comparison pages become a viable SEO channel.
**Revisit:** After pilot, when creators name the platform they most need covered.

## R-12: Pause instead of cancel (2026-08-14)

**Context:** 44% of subscription cancellations occur inside 90 days; ~53% of AI subscribers cancel-and-restart as a habit; pause/cancel flexibility is the top stated reason consumers subscribe at all. The product's real proof (beating one's own baseline) takes weeks of posting.
**Decision:** REQ-G08 - paid tiers can pause 1-3 months with brain preserved, credits frozen, expiry clocks suspended; cancel flow offers pause first; win-back email before resume. The usage page surfaces the brain-as-asset view so the accumulated value is visible at the cancel moment.
**Revisit:** Pause-length limits if abuse appears in the data.

## R-13: Creator-educator affiliate program (2026-08-14)

**Decision:** 30% recurring for 12 months via Rewardful or Tolt (Stripe-native, off the shelf - do not build affiliate tracking). Affiliates bound by REQ-I04: no virality promises made on the product's behalf. Ships post-launch (REQ-H04); recruited from the pilot's orbit.
**Revisit:** Commission rate against blended CAC target (< $25 Creator tier) after 90 days of data.

## R-15: Build home is the `respin/` subdirectory of the incubation repo (2026-08-14)

**Context:** Tech-spec §1's layout (`/app`, `/packages`) reads as if the repo root is the Next.js monorepo, but the incubation repo's root already holds the UGC Intelligence (.NET/Python) and Cutdown trees. Cutdown proved the pattern: a self-rooted subdirectory workspace that references nothing above itself extracts later as a directory copy.
**Decision:** Respin is built under `respin/` in this repo — self-rooted (own `package.json`/workspace files), tech-spec §1's layout applying *within* it (`respin/app`, `respin/packages/...`). CI path-scopes to `respin/**`; Vercel's root-directory setting points at `respin/`. Owner-confirmed 2026-08-14.
**Consequences:** M0's "fresh clone passes CI" is satisfied by path-scoped CI in this repo; the pack's Respin gates and guardrails apply here directly; extraction to a standalone repo stays a directory copy.
**Revisit:** At public launch, or if Vercel's subdirectory deploy adds real friction — extraction is the escape hatch either way.

## R-14: The landing demo is the comparison proof (2026-08-14)

**Context:** The real competitor at the entry tier is the ChatGPT subscription the creator already pays for. The differentiators (brain, frameworks, kill test, evidence loop) must be seen, not argued.
**Decision:** REQ-H02 upgraded: the demo renders the same idea generic vs through a labelled sample brain, side by side, with the shaping rules highlighted. This comparison leads the landing page and all founder content (see gtm.md).
**Revisit:** Demo format after conversion data; the principle (show, don't claim) stands.

## R-16: pnpm workspace + lazy workspace bootstrap (2026-08-14)

**Context:** The doc set settles the stack (R-5) and the build home (R-15) but not the package manager or the workspace-bootstrap trigger. M0 planning picked the most reversible defaults (build-plan working agreement).
**Decision:** (a) **pnpm** manages the `respin/` workspace (root app + `packages/*`), matching the proven `cutdown/` precedent; Vercel supports it natively. (b) Workspace bootstrap on first login is a **lazy, idempotent `ensureUserWorkspace()`** call on the first authenticated product request — no Clerk webhook infrastructure at M0; a webhook path can replace it later without schema change.
**Consequences:** One package-manager discipline across both TS product lines; bootstrap correctness rests on the transactional resolve-existing-on-conflict branch (respin-m0 phase 3 plan), not on webhook ordering.
**Revisit:** (a) never on principle; (b) if lazy bootstrap measurably delays first paint or Clerk webhooks are added for other reasons (then consolidate).

## R-17: PGlite test harness + app-side uuid v7 (2026-08-14)

**Context:** M0 needs hermetic database tests (migration-on-fresh-DB, tenancy breach attempts) runnable locally and in CI with zero setup, and tech-spec §2 mandates uuid v7 ids while Neon's Postgres has no native v7 generator.
**Decision:** (a) Tests run against **PGlite** (in-process Postgres) with the committed Drizzle migrations applied — real SQL, no mocks. (b) uuid v7 is generated **app-side** via the `uuidv7` package in Drizzle `$defaultFn`.
**Consequences:** PGlite is **single-session** — concurrency tests are serialized approximations; the bootstrap conflict test carries a `SHORTCUT:` marker with a Neon-based concurrency test required before M1 money paths (respin-m0 master plan, Deferral Ledger). Anything Neon-specific PGlite can't reproduce gets the same marker treatment.
**Revisit:** (a) if PGlite diverges from Neon behavior on anything M0+ tests assert; (b) when Postgres 18's native `uuidv7()` reaches Neon.

## R-18: Self-hosted stack — Lightsail + Postgres; Neon/Clerk/Vercel dropped (2026-08-14)

**Context:** Owner direction after M0 landed: "not planning on using neon, clerk, vercel. Just lightsail and postgres SQL," with Docker for the local database. Supersedes the hosting, database, and (pending replacement) auth rows of R-5; the rest of R-5 stands.
**Decision:** (a) **Database:** self-hosted PostgreSQL — `respin/docker-compose.yml` (postgres:17, port 5435) for local dev; a Postgres instance on/alongside the Lightsail host in production. The `pg` driver already in `@respin/db` needs no change. (b) **Hosting:** AWS Lightsail (deploy shape — container service vs instance — decided when the first deploy is planned; `vercel.json` removed, path-scoped GitHub Actions CI unchanged). (c) **Auth:** Clerk is to be replaced with a self-hostable option; **replacement undecided** — M0's Clerk wiring keeps working until that decision lands, and the auth swap is planned as its own gated change (it touches the tenancy Critical Path).
**Consequences:** No third-party MAU/hosting fees or lock-in; the team owns backups, TLS, and uptime (RUNBOOK obligations when the first deploy lands). M0's "preview deploys" acceptance criterion dissolves with Vercel — its replacement deploy evidence is defined when the Lightsail runbook is written. Tech-spec §1 hosting/database rows updated in this change; auth row updates with the replacement decision.
**Revisit:** (b) if ops burden on Lightsail outweighs a managed platform after the pilot; (c) is not a revisit — it is an open decision to be made now.

## R-19: Better Auth replaces Clerk (2026-08-14)

**Context:** R-18 left the Clerk replacement open. Owner selected Better Auth over Auth.js, keeping Clerk, or deferring.
**Decision:** **Better Auth**, fully self-hosted: sessions and auth tables live in our own Postgres via its Drizzle adapter; email/password + Google sign-in at M0-parity; its organizations plugin is the planned vehicle for Studio seats at M6 (supersedes R-5's "Clerk Organizations for Studio seats" note). The swap is a tenancy-path gated change with its own plan and reviews; identity columns become provider-neutral (`auth_user_id`).
**Consequences:** No per-MAU fees; sign-up/sign-in becomes provable locally with zero third-party accounts (email/password path), which un-parks the M0 auth evidence run; we own password security posture (Better Auth defaults + our Postgres). Google OAuth needs owner-created client credentials when wanted — not a blocker for the evidence run.
**Revisit:** Only if Better Auth stalls as a project or a compliance need demands a managed IdP.

## R-20: M1 billing defaults — idempotency, config, pause, balance fold, consumption order (2026-08-14)

**Context:** M1 (billing + credit ledger) needed eight defaults the doc set didn't settle. Chosen per the build-plan working agreement (most reversible default, recorded, revisit trigger) and hardened through the M1 plan-review gate (Codex + billing×2 + tenancy×2 + generalist; `docs/progress/respin-m1-plan-review.md`).

**Decisions:**
- **D-M1-1 — Webhook idempotency:** dedicated `stripe_events` table (Stripe event id PK, `workspace_id`/`stripe_customer_id` resolved at receipt, **`received_at`/`processed_at` in place of the house `created_at`/`updated_at` pair** — rows commit once under the single-tx design, so an `updated_at` would be a lie; the named deviation from tech-spec §2's all-tables rule) + the ledger's unique `stripe_event_id` as defense-in-depth. Single-transaction dispatch: event-row insert + handler + processed-mark commit together; failure rolls the row back so an existing row always means final; never early-200 on in-flight work. *Revisit: never on principle.*
- **D-M1-2 — Config versioning:** append-only `config_versions` rows (integer identity, jsonb content, author); active = max version; Zod-validated. *Revisit: per-key versioning only if whole-document churn gets noisy.*
- **D-M1-3 — Pause representation:** ledger rows immutable; `pause_periods` one row per pause (close-on-resume sets `ended_at` — its ONE sanctioned update; the table is not append-only); effective expiry computed derivation-time by pause-overlap fold. *Revisit: shift-on-resume UPDATE + audit row if fold cost bites.*
- **D-M1-4 — No job runner at M1:** grace/downgrade derived lazily from webhook facts + clock; Stripe dunning drives eventual cancellation; auto-top-up is request-time (`maybeAutoTopup` ships and is tested at M1; the debit-refusal call site is M3's); expiry is derivation-time. *Revisit: M4 /create-plan entry — trend refresh needs a scheduler; the M4 plan must show a recorded runner decision.*
- **D-M1-5 — Email dual-truth:** `users.email` dropped; Better Auth `user.email` is the sole email truth, read from the session (the FK is a constraint, not a licence to join). Structurally retires the M0 empty-email-guard deferral. New FK `users.auth_user_id → user.id` ON DELETE RESTRICT (M6 deletion must remove both sides explicitly). *Revisit: only if a domain-side email cache is ever needed.*
- **D-M1-6 — Stripe→workspace resolution:** stored `stripe_customer_id → workspace` mapping (created at checkout creation) is the sole authority; Checkout metadata is a cross-check; unknown customer / null customer field / mismatch ⇒ recorded refusal (`refused_unknown_customer` / `refused_identity_mismatch`), 200, zero ledger writes; refusal logs carry **ids, never payload fields** — event id, outcome, and the Stripe object id concerned; never email/name/address/amount and never the payload object (round-7 wording correction: the operative invariant is ids-not-PII, and the object id is what makes a refusal diagnosable). *Revisit: never on principle.*
- **D-M1-7 — Balance derivation:** chronological lot-allocation fold over all six kinds (`grant`/`pack`/`refund` + positive `adjust` are lots; `debit` + negative `adjust` allocate; `expiry` rows are replayed as history, never recomputed); lazy `expiry` materialization idempotent per lot, keyed to DB `now()` (caller `at` = pure read; allocating writes reject skewed/retroactive `at`); joins a caller tx that already holds the per-workspace advisory lock, opens its own locked tx on the bare-db path. A refund inherits the latest effective expiry of the lots its debit consumed — a refund of expired credits is born expired (goodwill = admin `adjust` with explicit expiry). Invariant: post-materialization `sum(delta)` of ALL rows equals the fold. Supersedes tech-spec §2's naive "sum of unexpired rows" wording (sync in M1 phase 4). *Revisit: snapshot rows if fold cost bites — never a mutable counter.*
- **D-M1-8 — Lot consumption order:** soonest effective expiry first; equal → older first; then grants before packs; never-expiring `adjust` lots last. Resolves REQ-G03 ("packs after monthly credits") vs tech-spec §5 ("oldest first"): a January pack is older than February's grant, so plain oldest-first burns the 12-month pack while the 1-month grant expires — soonest-expiry-first satisfies both documents in every case (sync §5 in M1 phase 4). Stated consequence (plan-review F2): mid-cycle upgrades grant no extra allowance until the next billing anniversary (REQ-G02's anniversary reset). *Revisit: never on principle.*

**Consequences:** the ledger stays literally equal to its sum; webhook handling is replay-safe by construction; M1 ships with zero background infrastructure; the auth/domain identity model is provider-neutral with fail-closed deletion.

## R-21: Free-tier credits have no minting path until M3 (2026-08-16)

**Context:** M1 phase 3's billing gate (round 7, CHANGE 5) grepped every consumer of the seeded config key `allowances.free = 25` and found exactly one: the `invoice.paid` webhook handler. A Free workspace has **no Stripe subscription** by design (skill B6, R-7: Free is the absence of a subscription, not a $0 price) and therefore never produces an invoice — so nothing in the shipped system can ever mint the 25 monthly credits PRD §4G promises. It was an *unnamed gap*: no Deferral Ledger row, no build-plan M1 accept-when, no decision entry — the shape this repo has repeatedly recorded as how "present-and-unrun" becomes "recorded as done".

**Decision:** Name it as a deferral rather than build a minting mechanism inside M1 phase 3 (which is Stripe-integration scope and would be unplanned work on the money path). **Stated consequence, plainly: until M3, a Free workspace has a zero credit balance and can generate nothing.** The receiver is **build-plan M3**, at the credit-debit call site — the same place tier gating ships, and the only place a derivation-time mint can live given D-M1-4's "no background job runner at M1" (an expiring monthly free grant, minted lazily and idempotently per workspace per calendar month, is the shape that fits; a cron is excluded by D-M1-4 until the M4 runner decision).

**Tripwire:** the M3 plan's Stop-Condition-2 dependency check must clear the master-plan Deferral Ledger row "Free-tier monthly allowance has no minting path" by showing EITHER a free-allowance minting design at the debit site (with its idempotency key) OR a recorded decision that Free ships with zero credits, with PRD §4G corrected in the same change. `allowances.free` stays in config v1 meanwhile: it is the number the eventual mint will read, and removing it would hide the gap rather than close it.

**Revisit:** at M3 entry (the tripwire above), or earlier if pilot recruitment depends on a working free tier.

## R-22: Cancellation stays available in Stripe's Customer Portal (2026-08-17)

**Context:** REQ-G08 / billing skill B4 require that the cancel flow **always offers pause first**. Respin has no in-app cancellation API at M1 — the in-app path is `/settings/billing` → "Cancel subscription" → an interstitial that offers pause **above** the way out, and the way out is a link into Stripe's Customer Portal, which is where the cancellation actually happens (asserted by the AC-3 DOM-order test and its `data-cancel="final"` marker). M1 phase 4's round-2 billing gate pointed out that the same portal is reachable from two other controls that carry no pause offer (the "Manage plan and payment method" button on a live subscription, and the portal button on `/usage`), and from Stripe's own emails — so the pause-first rule was resting on a Stripe **dashboard configuration nobody had written down**: whether the portal's `subscription_cancel` feature is on.

**Decision:** **Portal cancellation stays enabled**, and that is recorded here rather than left to a default. Disabling it would (a) break the documented evidence step that cancels through the portal, (b) leave a subscriber with no self-serve way out of a paid subscription — a worse outcome than an un-offered pause, and a poor one to defend to a consumer-protection regulator — and (c) not even close the hole, since Stripe emails link to the portal directly. What REQ-G08 binds is **Respin's own cancel flow**, and that is enforced mechanically where we control it.

**Consequence, stated plainly:** a creator who reaches the Customer Portal by any route other than our interstitial can cancel without ever being offered a pause. The pause offer is a *product* control on our surface, not a *guarantee* about Stripe's.

**Compensating control (runbook, not code):** the README's Stripe setup gains a step that makes the operator **look at** the portal's feature configuration and record what it says. Verified against the installed SDK (`stripe@22.5.0`, golden rule 9): `BillingPortal.Configurations` carries a `subscription_cancel` feature and **no `subscription_pause` feature at all** — so the portal cannot be made to offer our pause even in principle, which is why the answer here is "record the choice", not "configure it away". A dashboard setting that no step names is exactly the kind of unwritten dependency this doc set exists to stop.

**Revisit:** when an in-app cancellation API ships (which would let the interstitial complete the cancellation itself, making the portal route optional), or if pilot data shows portal cancellations materially outnumber interstitial ones — at which point the win-back/pause offer belongs in the M6 email flow instead.

## R-23: Correction to R-22's third reason (append-only, 2026-08-17)

**This entry corrects R-22 above; R-22 is left as written because this file is append-only.**

**What is wrong:** R-22's decision paragraph gives three reasons for leaving portal cancellation enabled, and reason **(c)** — "and not even close the hole, since Stripe emails link to the portal directly" — is **not accurate**. A Customer Portal session renders the features its configuration enables. With `subscription_cancel` disabled, the emailed portal link opens a portal that shows **no cancellation control at all**; the email is a route *to the portal*, not a route *around its configuration*. So disabling the feature genuinely WOULD close the hole R-22 describes. Found by the M1 phase-4 round-3 billing gate.

**What is unchanged:** the decision itself. Reasons **(a)** (disabling breaks the documented evidence step that cancels through the portal) and **(b)** (it leaves a paying subscriber with no self-serve exit — the worse outcome, and the harder one to defend to a consumer-protection regulator) stand on their own and are sufficient. R-22's SDK claim is also unchanged and was independently verified: `stripe@22.5.0`'s `BillingPortal.Configurations` carries a `subscription_cancel` feature and no `subscription_pause` feature at all.

**Why this is worth an entry rather than a silent edit:** an overstated argument is a decision that looks better supported than it is, and the next person to weigh "should we disable portal cancellation?" would have read reason (c) as settling a question it does not settle. The honest statement is: **we could close this hole and are choosing not to, for reasons (a) and (b).**

**Revisit:** unchanged from R-22 — when an in-app cancellation API ships, or if pilot data shows portal cancellations materially outnumber interstitial ones.

## R-24: `CLOCK_SKEW_MS` is one 60-second tolerance doing three jobs (2026-08-17)

**Context:** `packages/credits/src/clock.ts` exports `CLOCK_SKEW_MS = 60_000`. It was introduced for ONE job — the allocating-write clock guard, where it means "a caller's `at` more than a minute from the database clock is a stale clock, not an ordering artefact" (D-M1-7, tenancy code-review BLOCK 1). It has since acquired two more, both on the pause bounds in `pause.ts`: the OPEN-side staleness bound (round 8 / migration 0007) and the CLOSE-side one (round 8 / round-3 migration 0008). In those two it is not a clock-skew tolerance at all — it is a **webhook delivery-lag / granularity tolerance**: Stripe's `event.created` is second-granularity while our stored instants are the millisecond DB clock, so an ordinary reconciling snapshot is routinely a few hundred milliseconds "older" than the row it reconciles. The billing gate's round-3 NOTE is correct that this threshold had **no PRD or decision citation** (skill B5, threshold provenance) — a comment is not provenance.

**Decision:** record the threshold **here** rather than move it into `packages/config`, and keep the single constant.

- Against a config key: `pause.ts` takes no config today, so threading one in means changing `ensurePauseStarted`/`ensurePauseEnded`'s signatures and both call sites, plus a config read inside the webhook transaction — new work on the money path, inside a fix round, for a number nobody has yet had a reason to change. This repo's own record (five of eight M1 rounds shipped a defect inside their own fix) is the argument against.
- Against splitting it into two constants: there is no measurement distinguishing them. Inventing `WEBHOOK_LAG_TOLERANCE_MS = 60_000` beside `CLOCK_SKEW_MS = 60_000` would look like two calibrated numbers where there is one guess.

**What the number actually claims, stated plainly:** 60 seconds is a *guess* chosen to be comfortably larger than second-level rounding and same-second races, and comfortably smaller than the minutes-to-hours staleness the bounds exist to refuse. It is **not** measured against real Stripe delivery lag. Its failure mode is bounded and known in both directions: too small refuses a legitimate reconciling snapshot (the pause converges on the next event, or on the owner's own action); too large lets a snapshot up to a minute stale act (bounded, and both bounds are additionally protected by the `mirrorEventAt` order guard).

**Tripwire / revisit:** the M1 owner evidence run (`stripe listen`, the run that closes E1–E8) is the first time real `event.created` → processing lag is observable. Record the observed lag in the ledger during that run. If any legitimate event's lag exceeds ~30s, or if a pause/resume is refused during it, split the constant and give the delivery-lag half a config key with the measured value. Also revisit if M4's background-job runner introduces queued (rather than inline) webhook processing, which would raise lag by construction.

## R-25: Audit remediation decisions D-AUDIT-1 … D-AUDIT-4 (2026-08-17)

**Context:** the 2026-08-17 whole-codebase audit (`docs/progress/audit/2026-08-17.md`, readiness **Not yet / C+**) raised 30 findings against the M1 build. Four of them are not code defects but **unrecorded policy** — the code does something defensible that no document sanctions, so the invariant reads as false. This entry settles the four before the code phases touch them, per the remediation plan's Stop Condition 1 ("no code phase starts with the paused-invoice policy still implicit"). The remediation plan is `docs/plans/respin-audit-remediation-2026-08-17.md`.

### D-AUDIT-1 — `invoice.paid` during a pause is refused, with ONE named exception (audit #2)

**The problem:** REQ-G08 (PRD §4G, "Must") says *"While paused: no charges, no monthly grants."* `webhooks.ts`'s `invoice.paid` handler had no pause check at all, and `stripe.test.ts` carried a test titled *"invoice.paid arriving while mirror-paused is PROCESSED… never dropped"* that asserted a grant lands. So the requirement was not merely unenforced — a test actively pinned its violation. The code's implicit rationale ("a paid invoice is a fact; don't drop the customer's money") is sound engineering for a genuine delivery race and unsound as a blanket rule.

**Decision:** the pause invariant is enforced, and the delivery race is carved out **narrowly and by timestamp**, not by vibes:

- A grant-bearing `invoice.paid` is a **pre-pause invoice delivered late** — and grants — when its `event.created` is **at or before the active pause's `started_known_at` PLUS the `CLOCK_SKEW_MS` tolerance** (R-24). The customer paid for that service period *before* pausing, and dropping it would take money without delivering credits.
- Otherwise — the event is more than `CLOCK_SKEW_MS` **after** the pause began — it is a genuine during-pause invoice and is **refused**: outcome `ignored`, zero ledger writes, and a structured log naming event type, invoice id, event id, the pause decision, and the reason. Stripe's `pause_collection: {behavior: "void"}` means such an invoice should not exist; if one does, it is a reconciliation question for a human, not credits for a robot.

**Which way the tolerance leans, and why it is stated rather than left to the reader:** the tolerance **widens the grant window**, so an ambiguous ordering at the pause boundary resolves in the customer's favour. This is the same direction and the same constant the two existing pause bounds in `pause.ts` already use (`ensurePauseStarted` / `ensurePauseEnded` both refuse only when the disagreement *exceeds* the tolerance) — one idiom, not a second one. The failure mode is bounded and known: an invoice created up to 60 seconds after a pause begins still grants one month's allowance.

**What this explicitly is NOT:** "paused workspaces may receive arbitrary monthly grants." The accepted exception is exactly one sentence long — *a pre-pause paid invoice may be granted while the mirror is already paused, because delivery was late.*

**Rejected alternative (recorded so it is not silently revisited):** "no grant is ever processed while the mirror is paused, full stop." That is the stricter reading of REQ-G08 and it is defensible — but it requires a **durable deferred-invoice / manual-reconciliation path keyed by invoice id**, because otherwise a legitimately pre-pause invoice is dropped with no record and no recovery. That is a new table, a new operator surface, and a new failure mode; it is not work to start inside a fix round. If product later requires it, it is a planned change, not an implementation detail.

**Consequence, stated plainly:** a creator who pauses seconds after their renewal invoice is paid still receives that month's allowance. A creator whose subscription somehow invoices *during* a void-behaviour pause receives nothing automatically and needs an operator.

**Revisit:** if any genuine during-pause `invoice.paid` is ever observed in production (the refusal log is the tripwire — it is designed to be greppable), which would mean Stripe's void behaviour is not what we believe it is.

### D-AUDIT-2 — `stripe_events.payload` retention: 90 days (audit #21)

**The problem:** `stripe_events.payload` stores complete unredacted Stripe webhook JSON — customer email, name, billing address — indefinitely. It is not currently exploitable (nothing reads it outside the dispatcher) but it becomes so the moment any surface does, and there is no retention policy independent of workspace deletion.

**Decision:** retain the full payload for **90 days after `received_at`**, or until the row's final processing state is known if that is later, then **redact the payload while retaining non-PII audit metadata** (event id, type, workspace id, customer id, outcome, timestamps). The policy explicitly covers the two row classes that workspace deletion misses: rows whose workspace has since been deleted, and rows with `workspace_id = NULL` (unattributable events — `refused_unknown_customer`).

**Binding constraint, effective now:** **no new product surface may read `stripe_events.payload` until the redaction receiver exists.** The retention *implementation* is M6 scope (it belongs with the rest of REQ-A04 deletion/retention machinery); the *policy* and the *no-new-reader* constraint are in force from today.

**Owner:** respin-engineer at M6; the constraint is enforced at review time by the Respin brain-tenancy gate.

**Revisit:** if a legitimate support or dispute workflow needs a longer window — chargeback dispute windows can exceed 90 days, and that is the most likely reason this number moves.

### D-AUDIT-3 — Ledger-fold revisit trigger: 10,000 rows / 250 ms p95 (audit #22)

**The problem:** R-20/D-M1-7 says "revisit snapshotting if fold cost bites" with no metric and no threshold — an escape hatch that cannot fire, because nothing measures the thing that would trip it. The fold is O(n) over a workspace's entire ledger history under a full-workspace advisory lock, and that lock will serialize concurrent generations on one multi-seat Studio workspace once M3 lands.

**Decision:** instrument now, and name the numbers that trigger the revisit:

- **Metrics:** `respin.credits.fold.row_count` (per-workspace ledger rows folded) and `respin.credits.fold.duration_ms` — both emitted at the balance authority, **workspace-scoped, with no customer PII** (workspace id is an internal identifier, not personal data).
- **Revisit triggers (either one):** any single workspace reaches **10,000 ledger rows**, or the **seven-day p95 fold duration exceeds 250 ms**.

These are **operational triggers, not user-facing guarantees** — nothing in the product promises a fold latency, and this entry does not create such a promise.

**Owner:** respin-engineer. The metrics ship with this remediation (R3); the dashboard/alert that watches them is deployment-gated and belongs with the first Lightsail runbook.

**Revisit:** at either trigger, or at M3 entry — whichever is first — with the snapshot-row design D-M1-7 already names (never a mutable counter).

### D-AUDIT-4 — Repository license posture: proprietary, all rights reserved (audit #19)

**The problem:** no LICENSE file anywhere in a repo that `NORTH_STAR.md` describes as "a subscription service." Absent a license, default copyright applies and nobody — including a future collaborator or contractor — has any recorded grant.

**Decision:** add an explicit **proprietary / all-rights-reserved** notice at the repository root. This matches the actual distribution posture: Respin is a hosted subscription product, not a distributable library, and no part of this repo is published to a package registry. **No OSI license is adopted by assumption** — that would be a real grant of rights made by default rather than by choice.

**Scope note:** the notice covers this repository's own source. It makes no claim about the third-party dependencies in `respin/pnpm-lock.yaml`, whose licenses are their own; D-AUDIT-4 is a checklist posture, **not legal advice**.

**Revisit:** if any part of the repo is ever intended for public distribution or open-source release, or if a contractor agreement requires a different grant.

**Related design note (not a decision, but gated by one):** D-AUDIT-1…4 are the four *policy* findings. The audit's fifth unrecorded-design finding (#23, no profile-level tenancy cage for M2's `creator_profiles`) is answered by `docs/plans/respin-m2-profile-cage-design.md`, which is an **M2 entry gate**: a `VerifiedProfileId` brand with no `trustProfileId` counterpart, composite workspace+profile scoping at every accessor, a non-enumerating refusal, and six tests (P1–P6) that must exist and fail against un-caged code before any M2 schema or route is written.

## R-26 — `rate_limit` is a personal-data store, and it gets its own retention sentence (tenancy gate, 2026-08-18)

**Append-only, as this file requires — R-26 does not edit R-25, it adds the row R-25 should have had.**

**The problem.** The audit-remediation work that recorded D-AUDIT-2 (a 90-day retention policy for `stripe_events.payload`, which holds unredacted customer email, name and billing address) shipped a NEW personal-data store in the same change and gave it no retention sentence at all: the `rate_limit` table added for audit #20's durable limiter.

`rate_limit.key` stores a **plaintext client IP**. Verified in the installed package, not assumed: `@better-auth/core` 1.6.28 builds the key as `` `${ip}|${path}` `` (`dist/utils/ip.mjs`). An IP address is personal data. D-AUDIT-2 enumerated the PII stores this system holds and this one was not in the list, because it did not exist yet — which is exactly how a store ends up unrecorded.

**Decision.**

1. **`rate_limit` is a recognised personal-data store.** It joins `stripe_events.payload` on the list D-AUDIT-2 opened.
2. **Retention: 24 hours after `last_request`.** Far shorter than D-AUDIT-2's 90 days, and the asymmetry is the point — a rate-limit counter has no audit, dispute or support value once its window has passed, so nothing is served by keeping it. The longest window any configured rule uses is one hour (`/sign-up/email`, `/forget-password`, `/reset-password`); 24 hours is a generous multiple of that and needs no coordination if a rule widens.
3. **Do NOT rely on better-auth's own cleanup.** It prunes opportunistically — only when some *other* key's window is found expired — so a quiet endpoint's rows can persist indefinitely. That is an internal of a pinned dependency, not a retention guarantee, and treating it as one would be the same "trusting a default nobody chose" mistake audit #20 was about.
4. **REQ-A04 (export/deletion) status: OUT of scope for export, IN for deletion sweep.** The rows are request metadata keyed by IP and path, not workspace-scoped creator content, and they are not joinable to a workspace — so there is nothing meaningful to hand a creator in an export, and attempting to attribute them would mean *inferring* which IP belonged to which person, which is worse than not exporting. They are covered by the time-based sweep above instead.

**Owner:** respin-engineer, with the M6 retention receiver (the same maintenance task D-AUDIT-2's redaction lands in — one sweep, two tables).

**Also recorded, and NOT fixed here — a live operational hazard.** `advanced.ipAddress.trustedProxies` is **unset**. The installed types state that when it is unset better-auth "trusts only single-value IP headers", and its `getIPFromHeader` returns `null` for a forwarded chain with more than one hop — after which every request falls back to the single shared key `no-trusted-ip|<path>`. **Behind a two-hop proxy, or against any client that sends its own `X-Forwarded-For`, all tenants share ONE 5-per-minute sign-in bucket and one client can lock everybody out of sign-in.** It is not configured here because the correct value is the deployment's real proxy addresses or CIDRs, and Lightsail is unprovisioned — guessing one would be worse than leaving it visible, since a wrong `trustedProxies` lets a client spoof its own IP and evade the limiter entirely.

**This is a first-deploy blocker, alongside the #9 backup drill:** set `trustedProxies` to the actual proxy addresses when the deploy shape exists, and add a two-hop `X-Forwarded-For` case asserting per-client keying survives. The current test suite proves per-client limiting only for the single-hop header it sends.

**Revisit:** at first deploy (both halves), or if a rate-limit rule's window ever exceeds 24 hours.

## R-27 — R-26's trusted-proxy blocker is enforced at boot, not recorded in prose (remediation review, 2026-08-18)

**Append-only — R-27 does not edit R-26. R-26's analysis was right and stands; this adds the enforcement it lacked.**

**The problem.** R-26 diagnosed the `trustedProxies` hazard exactly, verified it in the installed package, and declared it a **first-deploy blocker** — and then left it as a paragraph in this file. Nothing would have stopped a production deploy from going out with it unset. That is a gap this project has already named for itself: audit #21's "no new reader of `stripe_events.payload`" constraint was given a source-scanning test precisely because *"a constraint that lives only in a decision document is a constraint the next milestone breaks by accident."* The retention rule got a tripwire; the rule that can lock every creator out of sign-in got prose. The asymmetry was the finding.

**Also confirmed — the CONSEQUENCE empirically, the MECHANISM from the installed package.** A test drives the **real handler** with a two-hop `X-Forwarded-For`: with no trusted proxies, client A's six sign-in attempts return **429 to a different client B** — one client locking out another, reproduced end-to-end. The *key* they collapse onto in that test is `127.0.0.1|…`, not production's `no-trusted-ip|…`, because Better Auth reads the real `process.env` for its dev/test detection and the suite runs under `NODE_ENV=test`; production's exact key is not reachable from a test process. A companion case asserts the key that is really shared, so the difference is visible rather than assumed. R-26's mechanism was verified by reading `@better-auth/core` 1.6.28 (`utils/ip.mjs`, `api/rate-limiter/index.mjs`) and is accurate in every particular; the cross-tenant consequence is what the handler test demonstrates.

**Decision.**

1. **A non-local environment must choose a posture, and every auth request fails until it does.** `createAuth` resolves `advanced.ipAddress.trustedProxies` through `resolveTrustedProxies`, which throws `TrustedProxiesConfigError` when `RESPIN_TRUSTED_PROXIES` is unset, empty, malformed, or operationally useless (an all-matching range).

   **Scope is wider than "production", deliberately.** Keying on that literal string was wrong: Better Auth's localhost fallback covers only `development`/`dev`/`test`, so **`staging`, `preview` and an unset `NODE_ENV` get no fallback and no resolvable IP** while `rateLimitEnabled` still has the limiter ON — the full hazard, in the environment most likely to share production's proxy topology. Exempt now means "the library guarantees a fallback", not "not production".

   **It is not literally a boot refusal.** `getAuth()` is lazy, so the process starts and static pages render; the throw lands on the first request that touches auth, as a 500. Fail-closed, but a deploy can go green with the failure latent. Calling `getAuth()` once at server start would make it a true boot failure — deferred to the deployment shape rather than guessed at, and listed below as the remaining first-deploy task.
2. **Two ways forward, both printed by the refusal** (fail closed, never without a way forward — CLAUDE.md 2026-07-30): a real list of proxy IPs/CIDRs, or the literal `none` for a genuinely single-hop deployment. The opt-out must be **typed**, so it is a decision on the record rather than an inherited default — the same distinction audit #20 drew about `rateLimit.enabled`.
3. **Entries are validated against a one-directional rule: anything we accept, Better Auth accepts.** Better Auth drops an entry it cannot parse (it warns, but a start-up warning is not a control), and if every entry is dropped the list is empty and the shared bucket returns *while the configuration looks correct*. The validator is deliberately **stricter** than the library's, never looser, and a **generative** test measures exactly that against the installed `findInvalidTrustedProxies` so the two cannot drift. Generative is load-bearing, not a flourish: the first version of that test pinned 18 hand-picked strings, the validator was fixed until those passed, and the tenancy gate then found **nine** further over-accepts in unlisted classes — zero-padded IPv4 (`010.000.000.000/8`, which a person would plausibly type) and IPv6 group-count errors (`1:2`, `:1`) — one of which reproduced the shared-bucket outage end-to-end. That is the 2026-07-30 lesson in its failing form: fix the class, not the named instances. The corpus is now built by permutation (octet shapes × positions, IPv6 group counts × elision placement, prefixes × malformed bases) and is mutation-proven to catch the padding class. It also rejects an **all-matching range** (`0.0.0.0/0`): syntactically valid, and it trusts every hop, so `getIPFromHeader` resolves no client at all.

4. **This decision CHANGES the PII story, and that is not incidental.** Choosing a real proxy list is precisely what makes a genuine client IP resolvable — and therefore *stored*. Two sinks: `rate_limit.key`, which R-26 covered with a 24-hour retention sentence, and **`session.ip_address`** (`packages/db/src/auth-schema.ts`), which R-26 did not enumerate and which has no retention, export or deletion sentence anywhere. Before this change a multi-hop deployment wrote `no-trusted-ip` and `""`; after it, both hold a plaintext IPv4 (IPv6 is truncated to /64 by the library's `normalizeIP`). **`session.ip_address` joins the personal-data list D-AUDIT-2 opened**, and needs its own retention sentence with the M6 receiver — recorded here as an open item, not fixed by this decision.
5. **Local environments are unaffected** — better-auth falls back to localhost there, so there is no proxy to name and nothing to get wrong.
6. **R-26's remaining half is still owner work, and is unchanged:** the *value* is the deployment's real proxy addresses. This decision does not guess one. It guarantees somebody must supply or explicitly decline one before production runs.

**A residual this guard CANNOT close, recorded rather than papered over.** The validation is a bound on the *syntactic* class only. A well-formed, accepted range that is semantically **too broad** reproduces the same shared bucket: `getIPFromHeader` walks the chain right-to-left and returns `null` when *every* hop is trusted, so a range that happens to contain real clients resolves no client at all. Note the symptom is **per-request, not global**: only the clients whose own address falls inside a trusted range collapse onto the shared bucket, while everyone else keys normally — a partial collapse, which is harder to spot at first deploy than a total outage would be. Measured: only the literal `/0` is rejected — `0.0.0.0/1` and `::/1` are accepted, and `["203.0.113.0/24","10.0.0.0/8"]` against a chain from `203.0.113.9` yields `null`.

This is **inherent to `trustedProxies`, not a gap in the implementation**, and deliberately not addressed by a construction-time probe: deciding it requires knowing which client addresses actually arrive, which no synthetic chain can supply. The mitigations are operational, not static — set the list to the narrowest ranges that cover the real proxy hops, and watch for Better Auth's one-time *"Rate limiting could not determine a client IP…"* warning, which is the only runtime tell that the list has swallowed the client. **This is part of what "set it from the deployment's actual proxy hops, never a guess" means, and it is a first-deploy review item.**

**What this does NOT claim.** No production deploy has happened; the guard is proven by test and by fuzz, not by a deploy. Setting the real addresses remains a first-deploy task alongside the #9 backup drill. The syntactic validator does not and cannot certify that a well-formed range is the *right* range.

**Owner:** respin-engineer (enforcement, landed); deployment owner (the value, at first deploy).

**Revisit:** at first deploy, when the real proxy addresses replace the placeholder choice.

## R-28 — A pack settling during a pause MINTS; a monthly grant does not (remediation review close-out, 2026-08-18)

**Append-only. R-28 does not edit R-25/D-AUDIT-1 — it decides the case D-AUDIT-1 left unstated.**

**The problem.** D-AUDIT-1 settled what `invoice.paid` does during a pause, with a discriminator, a structured log and tests. The **pack mint** branch of `checkout.session.completed` had no pause consideration at all. The window is real and reachable — checkout opens → the owner pauses → the payment settles — so the product had a live money behaviour that nobody had decided. Behaviour by absence is not a decision, and the asymmetry with its sibling branch is what made it worth naming: one path had a recorded policy and a greppable refusal, the other had silence.

**Decision: MINT.** The credits land, exactly as they do outside a pause.

**Why this is not in tension with REQ-G08.** The distinction is *what a pause suspends*:

- A **monthly allowance** is an ENTITLEMENT the pause suspends. Granting one during a pause hands over something not owed — REQ-G08's "no monthly grants", enforced by D-AUDIT-1.
- A **pack** is a PURCHASE the owner initiated and Stripe has already collected. Refusing the mint would take the money and deliver nothing, which is strictly worse than the alternative and is not what "no charges while paused" is protecting anyone from. The **authorization** is what REQ-G08 forbids here, and that is refused at `createPackCheckoutUrl` — before Stripe is contacted, and now against `pause_periods` rather than a mirror proxy. A settlement arriving afterwards is the tail of a purchase that was already permitted.

**Said precisely, because the loose form invites a wrong reading** (billing gate, 2026-08-18): money *does* move during the pause — the card is charged at settlement. What happened before the pause is the owner's **authorization**. So the rule is not "no money moves while paused"; it is that an **owner-initiated, pre-pause-authorized** charge is not what "no charges while paused" protects anyone from, whereas a **system-initiated** one — a renewal, an auto-top-up — is. Both system-initiated paths are refused while paused (`invoice.paid` by D-AUDIT-1, `maybeAutoTopup` by `mayChargeOffSession`), which is what makes this distinction a line rather than an exception.

**Both settlement events are covered.** `checkout.session.completed` and `checkout.session.async_payment_succeeded` route to the same branch, so a delayed-notification payment settling deep into a pause is governed by this decision too.

**Stated consequence:** the credits are **frozen, not lost** — `effectiveExpiry` freezes every lot's clock for the duration of the pause, so the pack's 12 months are not consumed while the workspace is paused. `debitCredits` refuses to spend them until the pause ends, which is the intended behaviour and not a defect.

**Pinned, not asserted:** `stripe.test.ts` → "R-28: a PACK settling during a pause still mints", with a same-fixture contrast proving a monthly grant in the *same* open pause is refused. The two behaviours are now tested side by side, which is what stops a future change from quietly aligning them.

**Owner:** respin-engineer.
**Revisit:** if a pause is ever given a "refund in-flight purchases" behaviour, which would change the answer.

## R-29 — The Vivian asset boundary is confirmed: the shared library seeds mechanism-level only (M2 entry, 2026-08-19)

**Closes PRD Open Decision 3**, which the build-plan names as a hard precondition on M2's library-seeding task ("confirm PRD open decision 3 before this task"). Recorded here in writing because the build-plan asked for writing, and because a boundary agreed in conversation and never written down is the boundary that erodes.

**Context.** The shared framework library is the middle layer of the three-layer IP (universal laws → curated shared library → per-creator brain). Its seed corpus is the generalised F1–F9 framework set derived from the vivian-content method. That corpus has two separable parts: the *mechanisms* (what structure converts, and why), and the *person* (her voice rules, her performance log, her niche specifics, her numbers).

**Decision — owner-confirmed 2026-08-19.** The shipped shared library seeds from **mechanism-level content only**: F1–F9 generalised to name, beats, why-it-converts, applicability, and tested caveats. **Vivian's voice, her log, her personal specifics, and her performance numbers never enter the product** — not in the seed, not in a framework's evidence entries, not in a prompt bundle.

**This is the same rule R-9 already applies to every creator, applied to the seed corpus.** R-9 forbids a creator's session from contributing anything but mechanism-level content to the library (REQ-D04). A seed exempted from that rule would make the library's first nine rows the only rows in the product that carry a person — and would mean the library's own tenancy guarantee was false on day one.

**Consequences.**
- The seed is a checked-in data file reviewable as text, not an import from a private corpus. A reader can verify the boundary by reading it.
- `frameworks` rows seeded this way carry `visibility='shared'`, `owner_profile_id=NULL`, and a `curator_status` set by a named curator per REQ-D02 — the seed does not self-approve.
- Every seeded framework needs a `why_it_converts` written as a general mechanism claim. Where the original evidence is a single creator's result, the claim is stated at the mechanism level and its `confidence` reflects the thin evidence, rather than borrowing authority from numbers the product will not show.
- The boundary is testable and will be tested: the M2 plan carries an assertion over the seed data that no seeded framework carries personal-specific fields, so a later seed edit cannot quietly reintroduce them.

**Owner:** respin-engineer.
**Revisit:** if Vivian ever becomes a profile *inside* the product, at which point her data is ordinary creator data under R-9 and this entry does not grant it any additional path into the library.
