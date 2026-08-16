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
