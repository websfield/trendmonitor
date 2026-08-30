# Tech Spec: Respin

**Companion to:** `PRD.md` (requirements referenced as REQ-xxx). Read the PRD first.
**Audience:** Claude Code, building from scratch. This spec makes the opinionated calls so build sessions don't re-litigate them; every stack decision has an entry in `decisions.md` with a revisit trigger.

---

## 1. Stack

| Concern | Choice | Why (short) |
|---|---|---|
| App framework | Next.js 15, App Router, TypeScript, single repo | One deployable for marketing site + app + API routes; strongest Claude Code ergonomics |
| Hosting | AWS Lightsail (R-18; was Vercel) | Owner-directed self-hosting; deploy shape decided at first deploy |
| Database | Self-hosted PostgreSQL — Docker locally, Lightsail in prod (R-18; was Neon) | Same `pg` driver either way; no vendor lock-in |
| ORM | Drizzle | Typed schema in TS, plain SQL migrations, no codegen step |
| Auth | Better Auth (R-19; was Clerk) — self-hosted, sessions + auth tables in our own Postgres via its Drizzle adapter | Email/password now, Google when OAuth credentials exist; existing `memberships` remains the role authority and custom hashed single-use invites add Studio seats at M6; Better Auth Organizations is not used |
| Payments | Stripe: Billing subscriptions (4 prices), Checkout for overage packs, Customer Portal, webhooks | Industry default; portal removes UI work |
| Background jobs | **pg-boss** — decided at M4 entry as required (R-52, 2026-08-29; supersedes the provisional Inngest of D-M1-4/R-20) | Cron (trend refresh, digests) + durable steps for ingest pipelines, as rows in the product's own Postgres. Runs as a **dedicated worker process on the Lightsail box** with its own bounded pool (the R-42 connection arithmetic governs). R-18 had dissolved Inngest's original rationale (it was Vercel-bound), and M1–M3 ship runner-free by design — grace/downgrade derive lazily at read time, expiry materializes in the fold, auto-top-up is request-time. R-52 is verify-first: pg-boss's capabilities are proven against the installed version at M4's first task, fallback systemd timer + idempotent CLI |
| LLM | Anthropic API behind a provider adapter (`packages/llm`) | Model tiers per operation; adapter keeps provider replaceable (Cutdown principle, kept) |
| Email | Resend | Digests, receipts via Stripe |
| Product analytics | PostHog | Activation funnel (metric #1) |
| Validation | Zod everywhere at boundaries | Contracts discipline without JSON Schema tooling overhead for v1 |

Monorepo layout:

```
/app                  Next.js app (marketing + product + api routes)
  /(marketing)        landing, pricing, legal, changelog
  /(product)          studio, trends, results, brain, settings, usage
  /(admin)            curation queue, sources, margin dashboard, user lookup
  /api                route handlers (webhooks, generation, spin, ledger)
/packages
  /db                 drizzle schema + migrations + seed
  /llm                provider adapter, model tiers, prompt assembly
  /brain              promotion construction only; brain storage/versioning stays in /db (R-44)
  /modes              the 7 generation pipelines + kill test + output schema
  /trends             ingest adapters, outlier scoring, autopsy pipeline
  /credits            ledger operations, metering, balance derivation
  /config             versioned runtime config (credit costs, allowances, model tiers)
```

Rule: `app/` imports from `packages/`; packages never import from `app/`. Generation logic lives in `packages/modes` and is callable from tests without HTTP.

## 2. Data Model

Postgres, all tables with `id` (uuid v7), `created_at`, `updated_at`. Key entities and relationships:

```
users ─< memberships >─ workspaces ─< creator_profiles
creator_profiles ─< onboarding_inputs,  ─< model_usage   (composite FK on (profile_id, workspace_id))
workspaces ··· workspace_spend_monthly            (NO fk - deliberately outlives the workspace)
workspaces ─ 1:1 ─ subscriptions (stripe mirror)
workspaces ─< credit_ledger
creator_profiles ─< brain_docs (voice | strategy | performance | killtest, versioned)
creator_profiles ─< brain_activations (immutable coherent document-version snapshots)
creator_profiles ─< generations ─< generation_feedback
creator_profiles ─< results (performance entries) >─ generations (nullable link)
generation_attempts ─ 0..1 generations ─ 0..1 credit_ledger debit (one atomic settlement)
promotion_proposals ─< proposal_evidence_results, proposal_evidence_feedback
frameworks ─< framework_evidence
trend_sources ─< trend_items ─ 1:1 ─ autopsies ─?─ frameworks (matched)
generations >─ frameworks (used), >─ trend_items (spun from, nullable)
promotion_proposals >─ creator_profiles (pending brain updates)
workspaces ─< workspace_invites; Stripe business objects ─< billing_revenue_events
system_model_usage ··· system_spend_daily (non-tenant product overhead)
```

Table notes (only the non-obvious):

- **creator_profiles**: `(workspace_id, display_name)` - the tenancy anchor, `ON DELETE CASCADE` from `workspaces`, with a table-level **UNIQUE `(id, workspace_id)`** so every child can carry a composite FK to it (M2a, R-30 / A-5). A plain FK to `id` alone would let a child name a profile whose workspace differs from its own. It is a table `unique()` and not a `uniqueIndex()`: drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every CREATE INDEX, so a unique *index* does not yet exist when the FKs reference it.
- **brain_docs**: `(profile_id, workspace_id, kind, version, content jsonb, source_evidence jsonb, status, reason, activated_at, superseded_at)` - append-only versions; active = max version with `status='active'`. Editing creates a new version (REQ-B02, REQ-C05). `kind='voice'|'strategy'|'performance_meta'|'killtest'`. Composite FK `(profile_id, workspace_id)` to `creator_profiles(id, workspace_id)`, **both columns NOT NULL** (Postgres MATCH SIMPLE skips a composite FK entirely when any column is NULL, so a nullable half admits a row naming a parent that does not exist), plus a **partial unique index** on `(profile_id, kind) WHERE status='active'` and a unique index on `(profile_id, kind, version)`. `version` is server-derived as max+1 and `status` is server-set; M2a writes `'proposed'` only (R-30 / A-10). Each `source_evidence` entry is `{field, quote, inputId, startUtf16, endUtf16}` - offsets in **UTF-16 code units** into the normalised `onboarding_inputs.content`, validated verbatim at write, and the whole entry parsed through a `z.strictObject` so the key space is closed and the **server-rebuilt** array is what is stored (M2b-1: a getter on a caller-supplied entry swapped a 10-character quote for a 900-character one after validation). `field` is an RFC-6901 pointer naming the claim position the entry supports (C-28) - without it "per-field provenance" is per-DOCUMENT provenance. `confidence` is **withdrawn** (C-15, R-34, and the REQ-B02 amendment). M2b-1 also adds `reference_corpus_ids` (the corpus the version was judged against, re-read at activation), the confirmation columns `(confirmed_at, confirmed_by, confirmed_content_sha256, confirmed_fields)`, `evidence_counts`, `source_evidence NOT NULL` with a non-empty CHECK, and a CHECK that an `active` row carries `confirmed_at` and `confirmed_content_sha256`.
- **brain_activations**: immutable, workspace-scoped snapshot of exact Voice, Strategy, Kill Test and nullable Performance Meta document version ids. Activating any document locks the workspace, validates a complete compatible set and carries unchanged active versions forward. Generations reference the activation id so later edits never rewrite historical context.
- **onboarding_inputs**: `(profile_id, workspace_id, input_class 'own_post'|'reference'|'creator_authored'|'result_summary', content, content_sha256, source_url nullable)` - IMMUTABLE after insert. Structured interview/edits create honestly labelled `creator_authored` rows; product-built proposal evidence uses `result_summary` backed by relational evidence joins.
- **model_usage**: `(profile_id, workspace_id, attempt_id, purpose, model, tokens_in, tokens_out, usage_raw jsonb, cost_micro_usd bigint, cost_state 'estimated'|'reconciled'|'unknown', resolved_tier, stripe_price_id, prompt_bundle_version, config_version, outcome)` - append-only except the one sanctioned `estimated` to `reconciled` transition. `created_at` uses `clock_timestamp()` and not `now()`: this is a per-call record whose ordering the margin rollup reads. `usage_raw` holds **metering fields only, never prompt or completion text**. `cost_micro_usd` is `mode: "bigint"` because node-postgres returns int8 as a STRING by default, and a silent string concatenation on the one column a margin dashboard sums is the accumulation error integers exist to avoid. REQ-G05 **will** sum `reconciled`, fall back to `estimated`, and **never `unknown`, reporting the excluded share** - dropping `unknown` understates cost and therefore overstates margin, the dangerous direction for a number R-6 tunes pricing against. Stated in the future tense deliberately: as of M2a the only thing behind it is the `unknown` implies-NULL CHECK. There is no aggregation code and no test, the margin dashboard is M6, and `resolved_tier`/`cost_state` are caller-supplied (R-30 binding constraint 8).
- **workspace_spend_monthly**: `(workspace_id, period_month, tier, cost_micro_usd bigint, call_count, unknown_call_count)`, unique on the grain. UPSERT and estimated/unknown→reconciled deltas compose with the usage transition, idempotently. The retained denominator preserves unknown share after detail deletion. `workspace_id` has no FK so the row outlives/pseudonymises after workspace deletion.
- **generation_attempts / generations**: an attempt claim is unique by scoped `attempt_id` + payload hash with states `claimed|vendor_started|vendor_complete|settled|refused|recovery_required`. `generations` stores coherent-brain activation and exact document/input/framework/config/prompt/model versions, output/refusal/kill-test state, and has `UNIQUE(id, profile_id, workspace_id)`. Parent FK includes all three columns, is server-selected earlier/same-scope and immutable.
- **credit_ledger**: `(workspace_id, delta int, kind 'grant'|'pack'|'debit'|'refund'|'adjust'|'expiry', ref_type, ref_id, expires_at nullable, stripe_event_id nullable unique)` - append-only; **balance is a chronological lot-allocation fold over the rows, not `sum(delta)` of unexpired rows** (**D-M1-7**, recorded as R-20; this wording supersedes the original naive-sum sentence). The naive sum over-subtracts as soon as an expired grant was only partially consumed, because debits never expire: the debit stays in the sum while the grant leaves it. Instead, `grant`/`pack`/`refund` and positive `adjust` rows are consumable **lots**, `debit` and negative `adjust` rows **allocate** against live lots in the D-M1-8 order, and `expiry` rows are materialization history the fold replays. When a lot crosses its (pause-shifted) expiry with a remainder, the balance authority lazily appends an `expiry` row for it - idempotent per lot, keyed to the DB clock - so `sum(delta)` of ALL rows equals the fold's answer and "the ledger is the balance" stays literally true with no cron. Computed per request, never stored as a mutable balance (REQ-G04). Idempotency via unique `stripe_event_id` plus one business-object partial unique per mint path - invoice, checkout session, payment intent (REQ-G06).
- **results**: scoped optional composite generation FK; historical metric version, platform, paid/organic, observation window, normalized metric, structured confounders, `treatment_key`, and evidence state `unquantified|quantified_self_reported|connector_verified`. Manual numbers are never labelled verified.
- **frameworks**: `(name, slug, beats jsonb, why_it_converts text, applicability jsonb, source_references jsonb, evidence_entries jsonb, tested_caveats jsonb, confidence, saturation 'observed'|'emerging'|'established'|'saturated'|'retired', visibility 'shared'|'private' NOT NULL, owner_profile_id nullable, workspace_id nullable, curator_status 'proposed'|'approved'|'rejected', version)`. Deliberately **carved out** of the both-columns-NOT-NULL rule (R-30 / A-5): a *shared* framework belongs to no profile and no workspace, so both are NULL and MATCH SIMPLE correctly skips the FK. Two CHECKs carry the invariant instead - `shared implies both NULL` and `private implies both NOT NULL` - which is R-9 as a constraint rather than a seeder convention, because `owner_profile_id IS NULL` is the marker for library-owned and a private framework that lost its owner would silently BECOME library content.
- **trend_items**: `(source_id, external_ref, url, title, channel_ref, channel_baseline jsonb, stats jsonb, outlier_ratio numeric, observed_at, stale_after, niche_tags text[])`.
- **autopsies**: `(trend_item_id unique, transcript text nullable, hook_mechanic, beats jsonb, ending_style, follow_trigger, matched_framework_id nullable, proposed_framework jsonb nullable, model, version)` - cached once, served to all (REQ-E03).
- **promotion_proposals**: scoped target/change, cohort/evidence digest, deterministic evidence-strength metadata and lifecycle `proposed|accepted|rejected|stale|superseded`; membership lives in same-tenant `proposal_evidence_results` / `proposal_evidence_feedback` joins. Summary prose is not the source of truth.

## 3. The Generation Pipeline (packages/modes)

Every mode runs the same skeleton:

1. **Claim + assemble context**: commit a scoped attempt/idempotency claim before outbound HTTP; then assemble universal laws + approved/non-retired shared or eligible private frameworks + the immutable coherent Voice/Strategy/Kill Test activation (and optional active Performance Meta after M5) + mode template + user input. Record every exact document/input/framework/config version and `prompt_bundle_version`.
2. **Generate** on the mode's model tier (default: generation on Sonnet-class, classification/autopsy on Haiku-class; tiers in config).
3. **Kill test pass**: a second, cheap model call scores the draft against the profile's KillTest items; hard-rule violations (fragment triads, antithesis constructions, invented specifics without `[check]`, hook >14 words where the rule is active) trigger one automatic rewrite, then surface honestly if still failing ("everything died, here is why, here is a sharper angle to try"). Kill-test results stored on the generation (REQ-C03).
4. **Similarity gate** (spin only): output vs source transcript, n-gram overlap + embedding similarity thresholds from config; failure triggers rewrite, never display (REQ-E04, REQ-I02).
5. **Record spend + settle**: every vendor call commits append-only `model_usage` independently. After all gates, one workspace-locked transaction rechecks tier/price/balance and atomically persists the usable generation or billable honest refusal **with** its one debit. Duplicate claims cannot repeat the vendor sequence; a durable `vendor_complete` retry settles without another call; ambiguous post-HTTP/pre-checkpoint crashes become `recovery_required` and never auto-call again. Insufficient balance rejects before step 2 and is rechecked at settlement (REQ-G03/G04).
6. **Emit** only a settled structured output. A debit failure exposes no usable output. `ScriptOutput` contains thesis, framework, hooks, beats/timestamps/turn, shot map, on-screen text, caption, weakest point and platform-specific AI-assistance disclosure guidance.

Streaming: generation streams to the client (Vercel AI SDK); kill test and similarity run on the buffered result before final commit - show the stream, mark the output "checking", then finalise or auto-rewrite.

## 4. Trend Monitor (packages/trends)

**Ingest adapters** (interface `TrendSource`): v1 ships two.

- `youtube`: Data API v3 for discovery/metadata/views only. Per tracked niche compute `outlier_ratio = video_views / channel_median_recent_views`; quota-aware daily batching via pg-boss. An API key does **not** authorize arbitrary public captions. Creator-owned caption download requires explicit OAuth permission to edit that video.
- `submitted`: creator pastes a URL plus third-party transcript (or uses an approved licensed provider added later). Resolve metadata via oEmbed/Data API and store transcript provenance through the reference path. Creator-pasted third-party text defaults to profile-private rights; raw transcript is never cross-tenant. Metadata-only items cannot enter autopsy/feed/Spin, and shared analysis/cache requires an affirmative shared-analysis rights basis (REQ-E07).

Explicitly not built: any adapter that scrapes TikTok/Instagram. A third adapter slot exists for a licensed data provider or official trend surface, decided post-pilot (PRD open decision 2).

**Autopsy pipeline** (a durable worker job): compliant transcript → Haiku-class fixed-order autopsy → match against approved/non-retired framework library → cache. Unmatched mechanisms create proposed-only curation rows. Sessionless calls use separate `system_model_usage`/`system_spend_daily`, atomic daily budget and bounded worker concurrency—never tenant usage/credits. Worker heartbeat, last success, lag, parked/dead-letter counts and budget exhaustion are alerted with content-safe logs.

**Feed query**: per profile = tracked niches ∩ non-stale items, ranked by outlier_ratio × recency decay, saturation labels rendered (REQ-E06). Weekly digest email per profile via the worker's cron + Resend (R-52).

## 5. Billing and Credits (packages/credits)

- Stripe objects: 1 product, 4 recurring prices (free tier = no Stripe subscription, just default state); 1 one-off price for the 1,000-credit pack. Checkout Sessions for subscribe and packs; Customer Portal for everything else.
- Webhooks handled (single `/api/stripe/webhook`, signature-verified, idempotent on event id): `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid` (monthly grant: insert `grant` row with `expires_at = period_end + 1 month` for rollover semantics per REQ-G02), `invoice.payment_failed` (grace state; downgrade job after 7 days), pack purchase → `pack` row, 12-month expiry.
- Debit order (**D-M1-8**, recorded as R-20; this wording supersedes the original "oldest unexpired first"): **soonest effective expiry first**; equal expiry -> older `created_at` first; still equal -> grants before packs; never-expiring `adjust` lots last. "Effective" means pause-shifted (R-12: a pause suspends expiry clocks). Plain oldest-first contradicted REQ-G03's "packs are consumed after monthly credits" in the ordinary case - a January pack (12-month validity) is *older* than February's grant (1-month validity), so oldest-first would burn the pack while the grant expired unused. Soonest-expiry-first satisfies both documents in every case and is the order the customer would choose. Auto-top-up: optional saved payment method + monthly cap (in cents) stored per workspace; triggered when balance < cost of the requested operation.
- Config (`packages/config`): credit costs per operation, tier allowances, model tiers, similarity thresholds - stored in DB with a version row, editable from admin, no deploy needed (REQ-G05). Every generation records the config version it ran under. **"Similarity thresholds" here means the §3 step 4 SPIN similarity gate only** (decisions.md R-58/B-11) — the R-3 brain echo bar's constants (`ECHO_MIN_SEGMENTS`, `REFERENCE_QUOTE_MAX_CHARS`, `REFERENCE_QUOTE_TOTAL_MAX_CHARS`, `packages/db/src/echo.ts`) are a DIFFERENT control and are deliberately CODE, never config, because `/admin/config` is a paste-the-whole-document editor with no deploy — a config home for a hard compliance rule would be a deploy-free path to weaken it.
- Revenue/margin: `/admin/model-spend` is cost-only. M6 adds authoritative append-only `billing_revenue_events`: subscription net-of-tax recognized ratably over service periods; pack/top-up revenue recognized through consumed lot allocation (remainder at expiry); refunds/credit notes reverse the original; USD-only v1. Contribution margin = recognized revenue − tenant model cost, with retained unknown share visible; system spend is separate product overhead and shown separately before the total-after-overhead line.

## 6. Auth, Tenancy, and Security

- Server-layer session gate (R-19): `getSessionUser`/`requireAdmin` called in layouts **and** every protected/admin page; middleware performs only an optimistic session-cookie redirect (UX fast path, never the gate — Better Auth cannot verify sessions in edge middleware). Admin gated by the fail-closed `ADMIN_USER_IDS` allowlist.
- Every query is workspace-scoped through a single `withWorkspace(ctx)` helper; no raw table access from route handlers. Profile isolation (REQ-A03) is enforced by query scoping + a test suite that attempts cross-profile reads.
- Rate limits: generation concurrency 2 (Free/Creator) / 4 (Pro) / 8 (Studio), enforced **per workspace** — the limits are keyed to tiers and a tier belongs to a workspace, so a per-user reading would multiply by the seat count and bound one person's spend rather than our vendor bill (R-39, which supersedes this bullet's original "per-user" wording). Implemented as a counting semaphore over session advisory locks (`packages/db/src/run-slot.ts`), held across the vendor call, on a pool of its own; the limits live in `concurrencyLimits` config. The provider call also carries an overall deadline spanning retries (`llm.overallDeadlineMs`, R-40) — the per-attempt `llm.timeoutMs` multiplies by `maxRetries + 1` and cannot bound §7's budget. IP-based limits on the public demo (REQ-H02).
- Public/Free abuse: canonical IP is stored only as a versioned keyed HMAC bucket with short retention; code ceilings bound per-IP/account/workspace velocity, global daily vendor cost, concurrency, input/output and deadline, while config may only tighten. Free requires verified email but no card. The thin `/api/v1` Studio API uses one-time scoped hashed keys, the same modes/settlement/capability pipeline and required idempotency keys.
- Secrets in server env files (local `.env`, Lightsail environment — never committed); Stripe webhook secret verified; no LLM keys client-side, ever.
- PII: brain docs and generations are the sensitive surface; encryption at rest is an owner obligation on the self-hosted Postgres (R-18 — RUNBOOK item at first deploy), export and deletion flows per REQ-A04.
- Deletion scopes are explicit: user identity/membership deletion preserves shared work; owner-only profile deletion removes one governed profile tree; owner-only workspace deletion cancels billing, revokes sessions/invites and tombstones jobs before registry-driven erasure. Requests block access immediately, allow 7 days' recovery, erase live rows, and expire all backup copies within 21 further days (≤30 total); restores replay deletion tombstones before traffic.

## 7. Non-Functional

- p95 time-to-first-token < 3s on script generation; full script < 45s.
- Trend refresh completes within daily API quota for 200 tracked niches (batching math documented in `packages/trends/README`).
- All money- and credit-mutating paths covered by integration tests including webhook replay and double-delivery.
- Observability: content-safe structured logs with request id; Sentry for errors; explicit worker heartbeat/last-success/lag/dead-letter/budget metrics and alerts. pg-boss tables are supporting audit data, not sufficient health monitoring by themselves.

## 8. What is deliberately deferred

Video rendering (parked Cutdown layer), general platform analytics connectors (REQ-F05, post-pilot), arbitrary third-party caption acquisition without a licensed source, mobile apps, JSON-Schema tooling beyond the M6 versioned REST contract (Zod remains authoritative), multi-region, SOC2.
