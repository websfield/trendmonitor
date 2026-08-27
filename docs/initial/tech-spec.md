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
| Auth | Better Auth (R-19; was Clerk) — self-hosted, sessions + auth tables in our own Postgres via its Drizzle adapter | Email/password now, Google when OAuth credentials exist; organizations plugin planned for Studio seats (M6); zero per-MAU cost |
| Payments | Stripe: Billing subscriptions (4 prices), Checkout for overage packs, Customer Portal, webhooks | Industry default; portal removes UI work |
| Background jobs | Inngest — **provisional; the runner decision is open** (D-M1-4, recorded in R-20) | Cron (trend refresh, digests) + durable steps for ingest pipelines. R-18 dissolved Inngest's original rationale (it was Vercel-bound), and nothing in M1 needs a runner for correctness — grace/downgrade derive lazily at read time, expiry materializes in the fold, auto-top-up is request-time — so **M1 shipped runner-free by design**. The choice (Inngest vs a self-hosted alternative) is settled at **M4 entry**, where trend refresh first genuinely needs a scheduler; the M4 plan's dependency check must show a recorded decision before planning it. Deploy shape decided with the Lightsail runbook (R-18) |
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
  /brain              brain document types, versioning, promotion proposals
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
creator_profiles ─< generations ─< generation_feedback
creator_profiles ─< results (performance entries) >─ generations (nullable link)
frameworks ─< framework_evidence
trend_sources ─< trend_items ─ 1:1 ─ autopsies ─?─ frameworks (matched)
generations >─ frameworks (used), >─ trend_items (spun from, nullable)
promotion_proposals >─ creator_profiles (pending brain updates)
```

Table notes (only the non-obvious):

- **creator_profiles**: `(workspace_id, display_name)` - the tenancy anchor, `ON DELETE CASCADE` from `workspaces`, with a table-level **UNIQUE `(id, workspace_id)`** so every child can carry a composite FK to it (M2a, R-30 / A-5). A plain FK to `id` alone would let a child name a profile whose workspace differs from its own. It is a table `unique()` and not a `uniqueIndex()`: drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every CREATE INDEX, so a unique *index* does not yet exist when the FKs reference it.
- **brain_docs**: `(profile_id, workspace_id, kind, version, content jsonb, source_evidence jsonb, status, reason, activated_at, superseded_at)` - append-only versions; active = max version with `status='active'`. Editing creates a new version (REQ-B02, REQ-C05). `kind='voice'|'strategy'|'performance_meta'|'killtest'`. Composite FK `(profile_id, workspace_id)` to `creator_profiles(id, workspace_id)`, **both columns NOT NULL** (Postgres MATCH SIMPLE skips a composite FK entirely when any column is NULL, so a nullable half admits a row naming a parent that does not exist), plus a **partial unique index** on `(profile_id, kind) WHERE status='active'` and a unique index on `(profile_id, kind, version)`. `version` is server-derived as max+1 and `status` is server-set; M2a writes `'proposed'` only (R-30 / A-10). Each `source_evidence` entry is `{field, quote, inputId, startUtf16, endUtf16}` - offsets in **UTF-16 code units** into the normalised `onboarding_inputs.content`, validated verbatim at write, and the whole entry parsed through a `z.strictObject` so the key space is closed and the **server-rebuilt** array is what is stored (M2b-1: a getter on a caller-supplied entry swapped a 10-character quote for a 900-character one after validation). `field` is an RFC-6901 pointer naming the claim position the entry supports (C-28) - without it "per-field provenance" is per-DOCUMENT provenance. `confidence` is **withdrawn** (C-15, R-34, and the REQ-B02 amendment). M2b-1 also adds `reference_corpus_ids` (the corpus the version was judged against, re-read at activation), the confirmation columns `(confirmed_at, confirmed_by, confirmed_content_sha256, confirmed_fields)`, `evidence_counts`, `source_evidence NOT NULL` with a non-empty CHECK, and a CHECK that an `active` row carries `confirmed_at` and `confirmed_content_sha256`.
- **onboarding_inputs**: `(profile_id, workspace_id, input_class 'own_post'|'reference'|'creator_authored', content, content_sha256, source_url nullable)` - IMMUTABLE after insert, with no update path. `content` is normalised at write (Unicode NFC, CRLF to LF) and `content_sha256` is taken over the **normalised** bytes. It is the corpus every `source_evidence` quote indexes: without it `inputId` is a dangling reference and a model-fabricated quote is storable as evidence (R-30 / A-8).
- **model_usage**: `(profile_id, workspace_id, attempt_id, purpose, model, tokens_in, tokens_out, usage_raw jsonb, cost_micro_usd bigint, cost_state 'estimated'|'reconciled'|'unknown', resolved_tier, stripe_price_id, prompt_bundle_version, config_version, outcome)` - append-only except the one sanctioned `estimated` to `reconciled` transition. `created_at` uses `clock_timestamp()` and not `now()`: this is a per-call record whose ordering the margin rollup reads. `usage_raw` holds **metering fields only, never prompt or completion text**. `cost_micro_usd` is `mode: "bigint"` because node-postgres returns int8 as a STRING by default, and a silent string concatenation on the one column a margin dashboard sums is the accumulation error integers exist to avoid. REQ-G05 **will** sum `reconciled`, fall back to `estimated`, and **never `unknown`, reporting the excluded share** - dropping `unknown` understates cost and therefore overstates margin, the dangerous direction for a number R-6 tunes pricing against. Stated in the future tense deliberately: as of M2a the only thing behind it is the `unknown` implies-NULL CHECK. There is no aggregation code and no test, the margin dashboard is M6, and `resolved_tier`/`cost_state` are caller-supplied (R-30 binding constraint 8).
- **workspace_spend_monthly**: `(workspace_id, period_month, tier, cost_micro_usd bigint, call_count)`, unique on the grain - an **UPSERT-maintained rollup**, not an append-only table: incrementing the two aggregates via `onConflictDoUpdate` is its one sanctioned update. `workspace_id` is a **plain column with no foreign key**, deliberately, because it must OUTLIVE the workspace it records - `model_usage` cascades away with the profile, so the cost side is preserved here instead (R-30 / A-6). Its retention decision, including whether `workspace_id` is pseudonymised at deletion, lives in `packages/db/src/creator-data-registry.ts`.
- **generations**: `(profile_id, mode, input jsonb, output jsonb, parent_id nullable, framework_ids uuid[], trend_item_id nullable, prompt_bundle_version, model, tokens_in, tokens_out, credit_cost, kill_test jsonb, status)`. `parent_id` gives revision lineage (REQ-C06). `prompt_bundle_version` satisfies REQ-J02.
- **credit_ledger**: `(workspace_id, delta int, kind 'grant'|'pack'|'debit'|'refund'|'adjust'|'expiry', ref_type, ref_id, expires_at nullable, stripe_event_id nullable unique)` - append-only; **balance is a chronological lot-allocation fold over the rows, not `sum(delta)` of unexpired rows** (**D-M1-7**, recorded as R-20; this wording supersedes the original naive-sum sentence). The naive sum over-subtracts as soon as an expired grant was only partially consumed, because debits never expire: the debit stays in the sum while the grant leaves it. Instead, `grant`/`pack`/`refund` and positive `adjust` rows are consumable **lots**, `debit` and negative `adjust` rows **allocate** against live lots in the D-M1-8 order, and `expiry` rows are materialization history the fold replays. When a lot crosses its (pause-shifted) expiry with a remainder, the balance authority lazily appends an `expiry` row for it - idempotent per lot, keyed to the DB clock - so `sum(delta)` of ALL rows equals the fold's answer and "the ledger is the balance" stays literally true with no cron. Computed per request, never stored as a mutable balance (REQ-G04). Idempotency via unique `stripe_event_id` plus one business-object partial unique per mint path - invoice, checkout session, payment intent (REQ-G06).
- **results**: `(profile_id, generation_id nullable, platform, posted_at, views, metric_numerator, metric_kind, computed_per_1k, verified bool, confounders text[], notes)`. `verified=false` when reported without numbers - the UI stores the claim but excludes it from learning (REQ-F02).
- **frameworks**: `(name, slug, beats jsonb, why_it_converts text, applicability jsonb, source_references jsonb, evidence_entries jsonb, tested_caveats jsonb, confidence, saturation 'observed'|'emerging'|'established'|'saturated'|'retired', visibility 'shared'|'private' NOT NULL, owner_profile_id nullable, workspace_id nullable, curator_status 'proposed'|'approved'|'rejected', version)`. Deliberately **carved out** of the both-columns-NOT-NULL rule (R-30 / A-5): a *shared* framework belongs to no profile and no workspace, so both are NULL and MATCH SIMPLE correctly skips the FK. Two CHECKs carry the invariant instead - `shared implies both NULL` and `private implies both NOT NULL` - which is R-9 as a constraint rather than a seeder convention, because `owner_profile_id IS NULL` is the marker for library-owned and a private framework that lost its owner would silently BECOME library content.
- **trend_items**: `(source_id, external_ref, url, title, channel_ref, channel_baseline jsonb, stats jsonb, outlier_ratio numeric, observed_at, stale_after, niche_tags text[])`.
- **autopsies**: `(trend_item_id unique, transcript text nullable, hook_mechanic, beats jsonb, ending_style, follow_trigger, matched_framework_id nullable, proposed_framework jsonb nullable, model, version)` - cached once, served to all (REQ-E03).
- **promotion_proposals**: `(profile_id, target_doc kind, proposed_change jsonb, evidence jsonb {n, effect, confidence, result_ids}, status 'pending'|'accepted'|'rejected')` (REQ-F03, REQ-C05).

## 3. The Generation Pipeline (packages/modes)

Every mode runs the same skeleton:

1. **Assemble context** (`packages/llm/assemble.ts`): universal laws (from config, versioned) + relevant shared frameworks (retrieved by mode + niche + goal, saturated ones flagged, retired excluded) + the profile's four active brain docs + mode template + user input. The assembled bundle hash is recorded as `prompt_bundle_version`.
2. **Generate** on the mode's model tier (default: generation on Sonnet-class, classification/autopsy on Haiku-class; tiers in config).
3. **Kill test pass**: a second, cheap model call scores the draft against the profile's KillTest items; hard-rule violations (fragment triads, antithesis constructions, invented specifics without `[check]`, hook >14 words where the rule is active) trigger one automatic rewrite, then surface honestly if still failing ("everything died, here is why, here is a sharper angle to try"). Kill-test results stored on the generation (REQ-C03).
4. **Similarity gate** (spin only): output vs source transcript, n-gram overlap + embedding similarity thresholds from config; failure triggers rewrite, never display (REQ-E04, REQ-I02).
5. **Meter**: debit ledger with the operation's configured cost inside the same transaction that persists the generation; insufficient balance rejects before step 2 with the top-up prompt (REQ-G03).
6. **Emit** the structured output (Zod schema `ScriptOutput`: thesis, framework, hooks[], script_beats[] with timestamps and `turn` marker, shot_map[], text_on_screen, caption, why_this_performs including `weakest_point`).

Streaming: generation streams to the client (Vercel AI SDK); kill test and similarity run on the buffered result before final commit - show the stream, mark the output "checking", then finalise or auto-rewrite.

## 4. Trend Monitor (packages/trends)

**Ingest adapters** (interface `TrendSource`): v1 ships two.

- `youtube`: Data API v3. Per tracked niche: search + channel stats; compute `outlier_ratio = video_views / channel_median_recent_views` (median of last ~20 uploads, cached per channel per day). Quota-aware batching; run daily per niche via Inngest cron. Shorts identifiable via duration + aspect heuristics.
- `submitted`: creator pastes a URL. Resolve via oEmbed for metadata; transcript from YouTube captions where available, otherwise the creator pastes the transcript (compliance-safe default). Enters the same autopsy pipeline (REQ-E07).

Explicitly not built: any adapter that scrapes TikTok/Instagram. A third adapter slot exists for a licensed data provider or official trend surface, decided post-pilot (PRD open decision 2).

**Autopsy pipeline** (Inngest durable function): new trend_item → fetch transcript → Haiku-class autopsy in the fixed order (hook mechanic → beats → ending → follow trigger) → embed → match against framework library (embedding + LLM confirm) → cache. Unmatched strong mechanisms create a `proposed_framework` into the curation queue (REQ-D03).

**Feed query**: per profile = tracked niches ∩ non-stale items, ranked by outlier_ratio × recency decay, saturation labels rendered (REQ-E06). Weekly digest email per profile via Inngest cron + Resend.

## 5. Billing and Credits (packages/credits)

- Stripe objects: 1 product, 4 recurring prices (free tier = no Stripe subscription, just default state); 1 one-off price for the 1,000-credit pack. Checkout Sessions for subscribe and packs; Customer Portal for everything else.
- Webhooks handled (single `/api/stripe/webhook`, signature-verified, idempotent on event id): `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid` (monthly grant: insert `grant` row with `expires_at = period_end + 1 month` for rollover semantics per REQ-G02), `invoice.payment_failed` (grace state; downgrade job after 7 days), pack purchase → `pack` row, 12-month expiry.
- Debit order (**D-M1-8**, recorded as R-20; this wording supersedes the original "oldest unexpired first"): **soonest effective expiry first**; equal expiry -> older `created_at` first; still equal -> grants before packs; never-expiring `adjust` lots last. "Effective" means pause-shifted (R-12: a pause suspends expiry clocks). Plain oldest-first contradicted REQ-G03's "packs are consumed after monthly credits" in the ordinary case - a January pack (12-month validity) is *older* than February's grant (1-month validity), so oldest-first would burn the pack while the grant expired unused. Soonest-expiry-first satisfies both documents in every case and is the order the customer would choose. Auto-top-up: optional saved payment method + monthly cap (in cents) stored per workspace; triggered when balance < cost of the requested operation.
- Config (`packages/config`): credit costs per operation, tier allowances, model tiers, similarity thresholds - stored in DB with a version row, editable from admin, no deploy needed (REQ-G05). Every generation records the config version it ran under.
- Margin dashboard: weekly Inngest job aggregates `tokens_in/out × provider price` vs credits consumed × effective $/credit per tier → `/admin/margin` (REQ-G05).

## 6. Auth, Tenancy, and Security

- Server-layer session gate (R-19): `getSessionUser`/`requireAdmin` called in layouts **and** every protected/admin page; middleware performs only an optimistic session-cookie redirect (UX fast path, never the gate — Better Auth cannot verify sessions in edge middleware). Admin gated by the fail-closed `ADMIN_USER_IDS` allowlist.
- Every query is workspace-scoped through a single `withWorkspace(ctx)` helper; no raw table access from route handlers. Profile isolation (REQ-A03) is enforced by query scoping + a test suite that attempts cross-profile reads.
- Rate limits: per-user generation concurrency 2 (Free/Creator) / 4 (Pro) / 8 (Studio); IP-based limits on the public demo (REQ-H02).
- Secrets in server env files (local `.env`, Lightsail environment — never committed); Stripe webhook secret verified; no LLM keys client-side, ever.
- PII: brain docs and generations are the sensitive surface; encryption at rest is an owner obligation on the self-hosted Postgres (R-18 — RUNBOOK item at first deploy), export and deletion flows per REQ-A04.

## 7. Non-Functional

- p95 time-to-first-token < 3s on script generation; full script < 45s.
- Trend refresh completes within daily API quota for 200 tracked niches (batching math documented in `packages/trends/README`).
- All money- and credit-mutating paths covered by integration tests including webhook replay and double-delivery.
- Observability: structured logs with request id; Inngest run history is the job audit trail; Sentry for errors.

## 8. What is deliberately deferred

Video rendering (parked Cutdown layer), platform OAuth analytics connectors (REQ-F05, post-pilot), mobile apps, JSON-Schema contract tooling (Zod suffices until an external API consumer exists - Studio API access ships as a thin, versioned REST wrapper over `packages/modes` when M6 arrives), multi-region, SOC2.
