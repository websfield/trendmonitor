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

## R-30 — The profile tenancy cage: scopes are minted classes, writes are allowlisted capabilities (M2a, 2026-08-21)

**Records decisions A-1 .. A-11 of [`docs/plans/respin-m2a-cage-plan.md`](../plans/respin-m2a-cage-plan.md), landed 2026-08-21.** M2a ships the cage, the complete M2 schema (migration `0011_first_rage`), the five read accessors and the three write capabilities. It ships no route, no UI, no inference and no profile creation.

**The rule.** Nothing crosses profiles or workspaces (R-9, REQ-A03). M2a makes that structural in three layers rather than conventional in one:

1. **Both scopes are classes with a private constructor and a module-private mint token**, registered in `globalThis`-keyed WeakSets. `WorkspaceScope` additionally carries `role`, the REQ-A02 authority.
2. **Writes live OFF the instance**, in `writeCapabilities(scope)`, which `app/**` cannot import. Each capability takes a hand-written input type naming only the fields a caller MAY supply; every other column is server-derived.
3. **Every accessor filters on BOTH `profile_id` and `workspace_id`**, and every child table carries a composite FK to `creator_profiles(id, workspace_id)` with both columns NOT NULL.

**What does NOT work, measured rather than reasoned about.** This list is the useful half, because each entry is a guard a review round proposed and a later round compiled or ran:

- A `unique symbol` **brand** stops nothing at runtime and stops only one cast at compile time: object spread copies symbol keys, and three cast-free forges compiled at exit 0 against the branded version.
- `#private` + `readonly` kill the spread (TS2741) and the in-place assignment (TS2540) and nothing else. Five routes still reached `writeCapabilities` at exit 0.
- `private constructor` kills `extends` (TS2675) and `new` (TS2673). **Both erase at runtime.**
- `new.target` **does not stop `Reflect.construct`**: it defaults `newTarget` to the target, so the guard passes and a cage-REGISTERED scope is minted with attacker ids. A draft labelled that mutation "new.target" and the mutation was green.
- `instanceof` accepts a Proxy and a subclass; `#cage in x` accepts a subclass. Only WeakSet membership rejects all three — and it must be keyed off `globalThis`, or a duplicated module graph refuses genuinely minted scopes.
- Plain `Omit` does not stop a foreign id: excess-property checking fires only on fresh literals. `{workspaceId?: never; ...}` does.
- ESLint's `allowImportNames` makes **no type/value distinction**. `export type` is what keeps the scope classes out of `app/**` as values; the evidence for that is `tsc` (TS1362), never lint.

**The mint token is a module-level `const`, not a `private static` field** — `private` erases, so `(ProfileScope as any).TOKEN` would hand a forger the token.

**THE RESIDUAL, STATED CORRECTLY (tenancy gate, 2026-08-23).** The registries live on `globalThis[Symbol.for("respin.scope.cage.*")]` so a duplicated module graph shares them, and a WeakSet published that way has a public `add`. The gate registered a plain `{workspaceId, role: "owner", accessors: {}}` and cleared `assertOwner` **as an owner** — four lines, no import, so eslint is blind to it. An earlier draft of this entry and of the module header called that acceptable because *"app code cannot run module-scope code"*; **that was false** — a Next.js server action module body is module-scope code in the same process. The correct statement: **nothing defends against arbitrary in-process module-scope execution**, because a registry two module copies can both reach is reachable by anything else in the process, by construction — that is the price of surviving module duplication and no design pays less. So the threat model is **code in this repository**, which is gated: imports by eslint, and this import-free shape by a source scan in `tests/import-boundary.test.ts`, red against a planted registration in both `app/**` and `packages/**`. The control is the scan; the comment is not the control.

**Found while building, after five rounds of plan review had not:**
- `writeCapabilities` used `scope instanceof ProfileScope` and a `#private` db handle. Both are scoped to one class DECLARATION, so under module duplication a genuinely minted scope was refused (`TypeError: Cannot read private member`) — reintroducing, one line later, the exact failure the `globalThis` key exists to prevent. Fixed with two shared WeakSets plus a shared WeakMap for the db handle.
- The `packages/**` specifier-shape deny found **three live violations** the moment it was switched on: two package tests deep-importing `@respin/db`'s internals by relative path, and one importing another package's `app-server` entrypoint. The first two were fixed; the deny was narrowed to another package's `src/`, so declared entrypoints stay legal.
- The AC-13 completeness scan found **two internal helpers** (`subscriptionRow`, `liveSubscription`) that build a query from `scope.workspaceId` and assert nothing. They are covered — every caller asserts first — which is why the scan implements the plan's *caller-direction* rule rather than waving them past.

**Schema decisions.** Composite FKs with both columns NOT NULL on `brain_docs`, `onboarding_inputs` and `model_usage`, because MATCH SIMPLE skips a composite FK when any column is NULL — reproduced in both directions. `frameworks` is explicitly **carved out**, with `visibility NOT NULL` and two CHECKs, because a shared framework belongs to no profile and a blanket rule made its own criterion unsatisfiable. All FKs `cascade`: `restrict` plus both-NOT-NULL made REQ-A04 deletion **structurally impossible**, and since profiles cascade from workspaces, workspace deletion would have failed too. `workspace_spend_monthly` carries the margin history instead, as an **upsert-maintained rollup** with one sanctioned update — calling an aggregate table append-only is the mutable-stored-counter shape `credit_ledger` forbids, wearing the wrong label.

**Config.** `profileCaps` is added with a `.default(...)`, and the deploy order is pinned: **code first, then `migrate-config`**. `respinConfigV1` is `.strict()`, so a stored document carrying an unknown key is a parse failure — and that parse happens five times inside the Stripe webhook's single transaction (`webhooks.ts:588,786,1082,1197,1283`), where a throw rolls back `stripe_events` and Stripe retries forever. The reverse window opens at the first `/admin/config` append after deploy, not at `migrate-config`, because `appendConfigVersion` stores the parsed document.

**REQ-G08 is NARROWED, and the narrowing is recorded rather than taken silently.** `PRD.md` REQ-G08 is amended in the same change: a pause suspends entitlements, not input capture. `writeBrainDoc` refuses under an open pause; `appendOnboardingInput` and `recordModelUsage` do not.

**Two moves into `packages/db`, owner-approved 2026-08-20.** `hasOpenPause` and `WorkspacePausedError` now live there (which owns `pause_periods`), re-exported from `@respin/credits`. The plan first *injected* the pause predicate at mint time on the premise that a cycle forbade the move; the premise was false — `pause_periods` is defined at `billing-schema.ts:263` — and the injection bought a caller-side hole (`async () => false` satisfies a structurally-typed `isPaused`) with no wiring layer able to supply the real one.

### Binding constraints this decision places on M2b

1. **The pause gate moves to operation entry, before the model call.** A-7's two exemptions are only safe because authorisation is refused earlier, and `debitCredits` cannot be that gate: `creditCosts.onboardingBrainBuild` is `0` and `debitCredits` throws on a zero cost, so a zero-cost operation skips it entirely.
2. **`createProfile` belongs in a layer that can see config AND billing state** — not `packages/db`. It needs the per-tier cap (config, db-local) *and* the tier, whose sole authority is `credits/src/state.ts:229`. Re-deriving the tier in `packages/db` would create a second tier authority, the defect class that caused two M1 round-6 findings, and would grant Studio's 5 profiles to an `incomplete` subscription that never collected a cent. It also needs a **role check**: M2a's gate found that a viewer could otherwise create profiles (REQ-A02).
3. **Downgrade semantics are undecided and must be decided.** Studio→Creator with 5 profiles needs either a state column on `creator_profiles` or a recorded reason it never will. Adding the column later is a second migration on a table M2a lands, against this plan's own "schema lands once" argument.
4. **One debit per `attempt_id`.** `model_usage.attempt_id` is the same value M2b's debit carries as `ref_id`; attempts are counted as DISTINCT attempt_ids, never rows.
5. **`workspace_spend_monthly`'s first writer must settle its pseudonymisation question.** Its retention decision (in `packages/db/src/creator-data-registry.ts`) states plainly that `workspace_id` is **not** pseudonymised today. The exposure is zero while nothing writes the table — asserted by the P8 enumeration — and becomes real with the first writer. That writer either pseudonymises at deletion or this decision is re-taken in writing.
6. **REQ-B02's per-field creator confirmation is still owed.** A round-1 BLOCK, deferred by A-10 (M2a writes `status='proposed'` only) and carried nowhere else. `PRD.md:67` says the creator confirms *each* inferred field; activation, supersession and the confirmation columns land together in M2b's migration.
7. **R-29's seed-content assertion is owed by the first `frameworks` writer.** M2a creates the table and P8 pins its expected writer set to `[]`.

### Added after the M2a Critical-Path gates (2026-08-23)

8. **`model_usage.resolved_tier` and `cost_state` are written by ONE authority, and it is not the caller.** `resolved_tier` is stamped from `getWorkspaceBillingState` and never re-derived; `cost_state` moves to `reconciled` only when a provider-returned figure lands. Today both are ordinary caller-supplied parameters of `recordModelUsage`, and the billing gate was right that the schema comment claimed otherwise. It **cannot** be enforced in `packages/db`: `getWorkspaceBillingState` lives in `@respin/credits`, which depends on `@respin/db` — the same structural reason `createProfile` is deferred. So M2b's metering caller owns it, with a test. A wrong value understates cost and therefore **overstates margin**, the dangerous direction for the number R-6 tunes pricing against.
9. **`workspace_spend_monthly`'s increment carries an idempotency key, and a reconciliation query is written while `model_usage` still exists.** It is the one mutable stored aggregate in the schema, and its only source cascades away on REQ-A04 deletion — so after a deletion the rollup is the *sole* record, with nothing left to reconcile against. Nothing currently requires the increment to be keyed to the `model_usage` row that caused it, so a retried writer double-counts spend permanently and undetectably. Key it on `model_usage.id` or `attempt_id`, and write the reconciliation query *before* the first deletion makes it impossible. (Billing gate 2026-08-23; this is the mutable-counter class A-6 argues about, one step further than the argument went.)
10. **The `reference`-input substring rule is owed.** `onboarding_inputs.input_class` now has a real reader — a `reference` input cannot be provenance for a `voice` brain document (D-M2-10, enforced in `validateSourceEvidence` with a test). The *other* rule the schema comment claimed is not enforced and is M2b's: **no brain-doc content may be a verbatim substring of a `reference` input.** That is a corpus-wide check, M2a has no content generator to gate, and the similarity gate does not cover it because that gate is spin-only (tech-spec §3 step 4). The barred-kind set is deliberately just `voice`; M2b decides whether the other three kinds join it.
11. **Where the `ProfileScope` MINT is exposed is M2b's decision, and it is the place `trustProfileId` would reappear.** M2a exports the scopes as types only, so `writeCapabilities` is currently unreachable by any consumer — correct for a milestone with no callers, and the reason the cage holds trivially today. Constraint 2 records where `createProfile` lands; this records that the mint's *export surface* is the same decision and carries the same risk. Whatever exposes it must not be importable from `app/**`, and `tests/import-boundary.test.ts` P6 is the standing check.
12. **Every writer of `config_versions` takes `takeConfigLock` (`packages/config/src/index.ts`, `CONFIG_LOCK_KEY = 8_140_251_907_463_120n`) first, inside the same transaction, before reading `max(version)`.** `version` is `generatedAlwaysAsIdentity()`, so two concurrent appends never conflict — there is no unique violation to catch and no existing row to lock, because the contention is on a row that does not exist yet. Both `applyConfigMigration` and `appendConfigVersion` take the lock (the latter re-entrantly, since a migration calls the former which calls the latter); a writer added later that skips it reopens the lost-update race the billing gate found on 2026-08-23. Proved on real two-connection Postgres (`packages/config/tests/migrate-config.docker.test.ts`) for both call sites — the re-gate found the first suite proved only `applyConfigMigration`'s half and added the second case for `appendConfigVersion`'s own call. The key is a fixed constant, not a hash: unlike `takeWorkspaceLock` (`packages/credits/src/clock.ts:74`), the contention here is global — one document for the whole install — and the two share Postgres's single 64-bit advisory-lock key space with no practical collision risk.

**Owner:** respin-engineer.
**Revisit:** when M2b adds a `WorkspaceScope`-taking entry that does not need owner — the AC-13 scan will fail, deliberately, and the new entry needs its own `assertScoped`.

## R-31 — Four M2b-1 gate blocks closed in code: the parse funnel is wired, the quote budget unions ranges, `reason` is a code, and the brain modules reach a deployed process (2026-08-26)

**Context.** Six Critical-Path gate rounds against the M2b-1 brain surface raised **67 BLOCKs** (20 → 12 → 9 → 7 → 11 → 8). After round 6, five remained open, recorded in `docs/progress/respin-m2b1-block-register.md` as A-1…A-5. **A-3 (the C-29 corpus-id-set column) is NOT closed here** — it needs migration `0012`, which is unwritten, and that migration also carries the confirmation/activation columns tasks 8/9/11 depend on. Scoping this pass to the four blocks that need no schema change was the owner's call, taken so the migration lands as one piece rather than two.

**The four decisions.**

- **C-41 (supersedes C-37's aggregation unit; closes A-1 / billing).** The reference-quote budget's unit stays `(profile, reference inputId)` across every retained version and kind, but the **measure becomes the UNION of distinct covered source ranges, not the sum of quote lengths**. C-37's sum is a monotone counter over an append-only table: a first brain build citing 600 characters of reference R exhausted that profile's budget for R permanently, and every later **priced** rebuild citing R was refused *after the tokens were spent* — a compliance ceiling that had become a permanent refusal on the money path. The union keeps what C-37 wanted (new material still accrues across versions, so N versions cannot reassemble one post) and drops what it did not (re-citing a span already cited costs nothing). **AC-66 is replaced**: its old wording — "N versions each within the per-doc ceiling but jointly reassembling one post is refused" — was satisfiable *only* by the bricking implementation, so the criterion selected the defect. The three replacements assert re-citation is free, disjoint material still refuses, and overlap counts once. `REFERENCE_QUOTE_TOTAL_MAX_CHARS = 600` is recorded in source as an **unmeasured judgment**, not a derived number (task 47's half that this touched).

- **C-42 (supersedes C-30's `reason` half; closes A-2 / compliance).** **`brain_docs.reason` stops being model-written free text.** `WriteBrainDocParams.reason` is a closed `BrainDocReason` code and `writeBrainDoc` renders the stored sentence itself, interpolating only numbers the server derived — the distinct cited inputs counted off evidence `validateSourceEvidence` already proved verbatim, and the version it computed as max+1. C-28 made `content` structural because `content` has enumerable positions; a free-text sentence has none, so extending C-28 to `reason` was not available. Every detector proposed for the free-text form (digit runs, capitalised tokens, proper-noun heuristics) is a list of counterexamples wearing the word "class" — the shape CLAUDE.md's 2026-08-18 lesson forbids. **So the channel is removed rather than filtered**: "a devout Catholic mother in Leeds, 42000 followers" is unrepresentable because no caller prose reaches the column. R-8's "never silent" is preserved and strengthened — the sentence is now guaranteed to describe something that happened.

- **Task 3 (closes A-4 / tenancy + compliance + learning).** `writeBrainDoc` calls `parseBrainContent` and **stores the value it returns**. Round 6 closed the `serverOwned` strip inside `parseBrainContent` and reddened its mutation — but `writeBrainDoc` never called it, so on the only live brain-write surface a model-supplied value at a server-owned position was stored unstripped, and content-schema validation and `WRITABLE_BRAIN_KINDS` (hence R-10's "no performance claim at n = 0") were disarmed with it. **CORRECTED after the tenancy gate:** this originally also named the claim enumeration among them. `parseBrainContent` never called `enumerateClaimFields`; that wiring landed later, with C-28 in the remediation pass. **C-40 lands with it**: every field of the params is read exactly once into a local, so a getter cannot swap the content between the check and the store.

- **Task 43 (closes A-5 / billing).** `brain-content.ts`, `echo.ts` and the new `brain-reason.ts` are exported from `packages/db/src/index.ts`, so `assertRegistryClosed()`'s module-load call now executes in any process that imports `@respin/db`. It previously did not: nothing in `respin/**` imported the module outside its own test, and a reviewer measured `IMPORT @respin/db threw: NO` against a planted bad schema. **The export made the `billing-ui.test.tsx` facade-completeness guard demand copy for seven refusal classes** — which is exactly the gap the block said the dormancy was masking; all seven now have copy and an `allowImportNames` entry. **Billing's alternative (a boot/health assertion rather than an import-time throw) was considered and not taken**, on the ground that the registry is a module constant, so the guard's condition is static and cannot become true in a deployed process without also being red in CI. That reasoning is recorded here rather than assumed, because it is the load-bearing half of the choice.

**Method note, recorded because it is the milestone's most reliable finding.** Round 3→4 built and blocks fell 9→7; round 4→5 revised prose only and they rose 7→11; round 5→6 built and they fell 11→8. This pass built. **Of 13 planted mutations, 5 initially survived** — three on task 3, one on C-42's write-path wiring, one on C-41's cross-version wiring — i.e. every one of them on the *wiring* of a fix whose *module* was already proven. Detectors were added and all 13 redden. Reporting after the first run would have made four of the five claims here evidence-free, which is the class this milestone has now produced three times.

## R-32 — A-3 closed: migration 0012, the recorded reference corpus, and the confirm/activate surface it required (2026-08-26)

**Context.** R-31 closed four of the five open M2b-1 register items and recorded that **A-3 was deliberately left open** because it needs migration `0012`. This decision closes it, and with it the register: all 67 blocks raised across six gate rounds are now closed in code and measured. **The four Critical-Path reviewer gates have still not been run on any of this work** — an empty register is not a gate PASS.

**Migration 0012 landed as one piece, not as the corpus column alone.** The alternative was a partial migration plus an `0013` later. `0012` adds `reference_corpus_ids jsonb NOT NULL DEFAULT '[]'` (A-3's column), the five confirmation/provenance columns (`confirmed_at`, `confirmed_by`, `confirmed_content_sha256`, `confirmed_fields`, `evidence_counts`), `source_evidence NOT NULL` with a **non-empty CHECK**, and a CHECK making an `active` row structurally require its confirmation columns.

**C-29's mechanism is now real: the write RECORDS the corpus id set, activation RE-READS it.** A corpus rebuilt at activation asks a different question from the one the write answered — a `reference` input appended in between refuses a version the write had already cleared, and because `onboarding_inputs` is immutable with no delete path and versions are append-only, that refusal is permanent with a priced rebuild as the only remedy. A tighter timestamp does not remove the class: `created_at` is `defaultNow()`, i.e. transaction-START time, so an input whose transaction starts before the write and commits after it is invisible to the write **and** inside any timestamp-bounded corpus rebuilt later. **AC-63 proves that exact interleaving on real Postgres**, with the counterfactual asserted — the test checks that a `created_at`-bounded corpus really would have seen the raced row, so it cannot pass vacuously on a run where the race did not occur. PGlite (single connection) cannot express it, so a PGlite version would have passed against the broken implementation.

**`assertNoReferenceEcho` and `validateSourceEvidence` take ONE accessor.** `ProfileAccessors.referenceCorpusAsOf(ids?, conn?)` is the only builder of "which posts are somebody else's". Two builders would be two answers to the question the whole R-3 bar rests on.

**What closing A-3 required, and why none of it was optional.** AC-62/AC-63 both name activation, so `confirmBrainDocFields` and `activateBrainDoc` had to exist. Shipping those without `ProfileScope` carrying `role` and `userId` would have **reopened two already-closed blocks** — round-2 T-A (a viewer could confirm and activate) and round-1 T3 (`confirmed_by` forgeable as a parameter) — so task 5 came with them, and both properties are pinned by mutations rather than asserted.

**C-32's completeness instrument finally exists, and it exists because the hand-list failed a fourth time.** `GUARDED_WRITE_FIELDS` had missed exactly one field in three consecutive rounds; the plan predicted "the fourth miss is the likely one" and then made it — `reference_corpus_ids`, the field that decides which corpus the R-3 bar runs over. The list is now checked against the drizzle table's **own property space**, so a column that is neither guarded nor declared caller-suppliable fails at the point of adding it. Property space, not snake_case, is measured rather than stylistic: `stripGuarded` deletes keys drizzle reads, and drizzle reads `evidenceCounts`, never `evidence_counts`.

**An interaction stated rather than left to be discovered.** **THE ALL-PLACEHOLDER CLAIM IS WITHDRAWN, not revised a third time.** This decision originally stated that the non-empty `source_evidence` CHECK and C-28's cited-or-`[check]` rule jointly make an **all-placeholder brain version unstorable**. That was false when written (C-28 was task 31, TODO); it was annotated to say "true now" once C-28 landed; and the re-gate measured it **false again, for a different reason** — nothing forbids an evidence entry whose `field` points at a position that holds `[check]`, so an all-placeholder document stores with one irrelevant citation, and the non-empty CHECK actively *forces* that shape. Two reviewers found it independently. A sentence that has been wrong three times does not get a fourth revision: the property is **not claimed**, the hole is register item G-10 (`[check]`-citable evidence), and the CHECK's own defensibility is open with it. `writeBrainDoc` still refuses an EMPTY evidence list **by name**, because a raw `violates check constraint` names no action the reader can take (2026-07-30) — that much is true and tested.

**A defect found by running, not by reading, recorded because it would recur.** The corpus accessor closes over the connection pool, and reading the pool from inside an open transaction **deadlocks on a single-connection driver** — every write test hung for 30 s. The accessor takes the transaction now. Building a second query inside `writeBrainDoc` to dodge the deadlock would have been the two-corpora shape C-29 exists to remove, so the deadlock was pointing at the wrong fix.

**Mutation record, both passes of 2026-08-26.** 24 planted mutations, **7 survived their first run**. **THE GENERALISATION ORIGINALLY DRAWN HERE — "every survivor was on wiring or diagnosability, never module logic" — IS WITHDRAWN.** It was a true observation over an inadequate population, which is the same defect it purported to describe. Within an hour the tenancy gate planted three mutations of its own and all three survived (two workspace predicates, the pause gate on both new capabilities), and the learning gate planted four, of which three survived — two of them **module logic** on the confirm surface. The honest statement is the count and its population: 24 planted by the author, all red; ten more planted by reviewers, six of which the author's suite could not see. That is three sessions running with the same signature, and it is the same shape as the blocks the fixes were closing: a control that exists where nothing calls it. All 24 redden now. One mutation of mine was itself wrong (dropping one name from the package index leaves the module loaded) and is recorded as such; a second was GREEN for a real reason — the guarded-field list is type-level at the `writeBrainDoc` insert, because that insert names every column explicitly — and that is what produced the completeness instrument above.

## R-33 — The four Critical-Path gates on M2b-1: all four BLOCK, and what the remediation changed (2026-08-26)

**All four gates returned BLOCK at Grade D.** Nine BLOCKs and roughly twenty-one CHANGEs, against work R-31 and R-32 had recorded as closed and measured. The entry-gate figures were independently confirmed by all four reviewers (`774 passed / 774, 41 files, zero skips`; typecheck, lint and `db:check` clean) — **the numbers were true and the claims built on them were not.** This decision records what the gates found and what was changed in response; the block register carries the per-item detail.

**The defects, by root.**

- **The reference-quote budget had four independent holes**, all in code C-41 introduced the same day. (a) The unit was `(profile, reference inputId)`, and `onboarding_inputs` has no content dedupe — so the same post pasted twice bought two budgets, and compliance reassembled a 989-character post exactly and contiguously through the public capabilities alone. **The unit is now `(profile, content_sha256)`**: the identity of a post is its content, not the row it arrived in. (b) The check was a read-then-write with no serialisation, so two concurrent writes of different kinds both committed — billing reproduced it on real Postgres on the first trial — and the profile was refused thereafter with nothing the creator could do. **A `pg_advisory_xact_lock` on `(workspace, profile)` now serialises the write**, and the ceiling **refuses only on material the write ADDS**, so an over-ceiling history can never make a re-citing rebuild impossible. (c) `unionLength` returned `NaN` for a `NaN` span, and `NaN > 600` is false, so one such entry turned the whole ceiling off. (d) An inverted range contributed a negative length and CREDITED the budget. **Both now refuse rather than skip**, in `assertReferenceQuoteBudget` itself, because that function is a public export and its own doc comment had justified trusting a caller obligation.

- **`source_evidence` was an open key space with a TOCTOU on its elements.** Reading `doc.sourceEvidence` once guards the ARRAY; drizzle's serialiser re-reads every property of every entry when it stringifies, so a getter validated as a 10-character quote and stored a 900-character one, leaving a recorded range that under-counted that row forever. The key space was open besides — tenancy stored a home address and an invented specific in a free-text `confidence`. **Every entry now goes through a `z.strictObject` and the SERVER-REBUILT array is what is stored**, never the caller's objects. `confidence` is gone (C-15).

- **C-28 was recorded as closed in four places while its task was TODO** — including in `brain-reason.ts`'s own header, where it was the stated PREMISE for the C-42 fix. Reviewers stored, confirmed and ACTIVATED "a devout Catholic mother in Leeds, 42000 followers" with none of its three claim positions cited by anything. **C-28 is now built**: `SourceEvidenceEntry` carries the `field` pointer it always needed, every enumerated claim position must be cited or hold `[check]`, and every entry must point at a position the document declares.

- **The activation gate was vacuous.** `activateBrainDoc` checked only `confirmed_at` and the sha; it never compared `confirmed_fields` to the claim set. `enumerateClaimFields` was built, exported and unit-tested with **zero production callers**, AC-26 was an orphan criterion with no task, and every fixture passed `confirmedFields: []` so nothing could see it. **AC-26 is now enforced**, and confirmation validates both that each pointer names a declared position and that its placeholder flag matches the stored value — the two laundering routes learning measured.

**A LESSON WORTH MORE THAN THE FIXES.** Three separate defects this session were of one shape: **a control that exists where nothing calls it** (`enumerateClaimFields`), **a claim recorded as closed while its task was TODO** (C-28), and **a mutation matrix that was a true count over an inadequate population**. The third is the one that let the other two through. The author planted 24 mutations and all 24 reddened; reviewers then planted ten and six survived — including two on module logic, which the author's own generalisation had said could not happen. **A mutation matrix proves what it contains, and the number is worth nothing without the population.** The ledger recorded that sentence after round 6 and the same defect recurred one milestone later, which is why it is now in CLAUDE.md's Lessons rather than only in a progress file.

**Billing's import-time-throw recommendation is ACCEPTED after being declined once.** R-31 recorded the trade as settled by a static-condition argument: the registry is a module constant, so the guard cannot fire in a deployed process without also being red in CI. Billing verified that reasoning holds **on the axis it addresses** and then named the axis it does not reach: **blast radius, not likelihood.** An unimportable `@respin/db` is a 500 on every Stripe delivery with no env escape, on the one module whose comment says it deliberately has no import-time side effects. The argument was about whether the condition could become true; the block was about what happens if it does.

## R-34 — The re-gate: what the four reviewers found the second time, and the two class-level fixes taken from it (2026-08-26)

**All four gates re-ran against the R-33 remediation.** Billing moved **BLOCK → NEEDS CHANGES (Grade C)** and verified its own BLOCK resolved with a two-connection harness on real Postgres. The other three returned **BLOCK** again: eight of the nine original BLOCKs stayed closed, and four new ones appeared, three of which are the same defect shape as the fixes that produced them.

**The entry gate is settled, and the confound was mine.** Learning, tenancy, billing (against a byte-verified snapshot) and a clean-tree run all reproduce `789 passed / 789, 41 files, zero skips`. Compliance's five runs returned 785–787 with different failures each time — including on the C-28 and AC-26 controls, which is why it blocked. The cause was **four mutating reviewers sharing one working tree**: billing observed the same contamination and diagnosed it, and tenancy found `/* lock removed */` and a deleted array walk live in files it was reading. **Run reviewers in isolated worktrees.** The cost of not doing so was a spurious BLOCK, two invalidated mutation runs, and a reviewer unable to distinguish "the control does not fire" from "the harness is dirty" — the more alarming of which is a compliance outage.

**FIXED IN THIS PASS — the class, this time.**

- **`confirmed_fields` took the caller's objects**, twelve lines from the `source_evidence` fix that had just closed exactly this. Tenancy put a getter on the array property (validation saw `[]` and its loop passed trivially; the stored value was the full claim set with every `asPlaceholder` **inverted**) and on an element (validation reads `pointer` twice, so the third read won), then **activated** the document — recording a `[check]` position as a confirmed real claim and a real claim as still unknown. Its key space was open too. Now: a `confirmedFieldEntrySchema` beside its sibling, the array read **once**, every entry parsed, duplicates refused, and the **server-rebuilt** array stored. This is CLAUDE.md's 2026-07-30 lesson — fix the class, not the field — reproduced on the fix for a finding that was itself that shape, which is why the two schemas now sit adjacent in the source.

- **REQ-B02 is amended, dated, and the code no longer claims an amendment that did not exist.** R-31 and a source comment both said "and a confidence level" was withdrawn in `PRD.md`. It was not: the **[Must]** stood while the code had already dropped the field — found by learning and tenancy independently, and the 2026-08-18 lesson verbatim. `PRD.md` and `tech-spec.md` §2 are now amended, both dated, and the tech-spec entry shape names `field` (which C-28 added and without which "per-field provenance" is per-document provenance).

**WITHDRAWN, not revised a fourth time.** The "all-placeholder version is not storable" claim has now been false, corrected, and false again for a different reason. It is withdrawn; the hole is register item G-10.

**NARROWED.** C-28 is a provenance-**shape** rule: it enforces *that* a claim is cited, never that the citation supports it. Compliance re-ran the invented-specific walk and it still writes, confirms and activates with four unrelated characters as its warrant. Semantic support is not computable and is not claimed — **REQ-I03 remains open at the brain surface**, and the register says so.

**DEFERRED DELIBERATELY (register G-10…G-17), with the reasoning recorded because it is a judgment.** The remaining eight findings are design decisions — what counts as "the same post" (G-11), whether `input_class` is trustworthy (G-12), the role table's shape (G-13) — or need new test machinery (G-14). Three times in one day a fix pass introduced the next finding, every time on a design decision made inside it. So the class-level repair and the honesty debt were taken now, and the design work waits for a re-gate **in isolated worktrees**. Tenancy explicitly **withdrew** its acceptance of the viewer deferral (G-13) and that withdrawal is recorded rather than argued with: `brain_docs` is append-only, so a viewer permanently consumes version numbers and the profile's R-3 budget, neither reversible by the owner.

**The methodology finding, which is worth more than any single fix.** Compliance: *"All four new BLOCKs are absent controls or identity choices — a hash that is the wrong equivalence relation, a trusted label, a missing predicate — not corruptible lines. So '14 planted, 14 RED' is true and says nothing about them. That is the fourth round running with the same result, and it is now a property of the method, not of the population."* Mutation testing perturbs code that **exists**; it is structurally blind to a control that was never written. Billing and tenancy proved the same point from the other side — deleting the advisory lock, the one fix this remediation existed for, leaves 789 tests green. The CLAUDE.md Lesson is sharpened accordingly.