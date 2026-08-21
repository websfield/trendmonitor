# Build Plan: Respin

**Read first:** `PRD.md`, then `tech-spec.md`, then `decisions.md`. This plan sequences the build into milestones sized for focused Claude Code sessions. Each milestone has acceptance criteria; a milestone is done when its criteria pass, not when its code exists. Engineering completion and evidence completion are reported separately, always.

**Working agreements (carried from the previous program, because they worked):**
- Branch per milestone (`respin/m1-billing`), merge on green criteria. Commit at least at every completed task.
- Decisions not answered by the doc set: pick the most reversible default, append it to `decisions.md` with a revisit trigger, keep moving. Never silently drift from a written decision - supersede it in writing.
- Every schema change ships with its migration and a seed update in the same commit.
- Money paths and credit paths get integration tests before UI polish.
- No feature that touches other creators' content ships without its similarity gate and source-compliance check.

---

## M0 - Skeleton (1 session)

Repo scaffold per tech-spec §1 layout; Next.js app with marketing/product/admin route groups; Better Auth wired (email/password sign up and sign in, workspace bootstrap on first login — R-19); local Postgres (Docker) + Drizzle with initial migration for users/workspaces/memberships (R-18); CI (typecheck, lint, test, migration check). Deploy evidence is deferred to the Lightsail runbook (R-18 — the preview-deploy criterion dissolved with Vercel).

**Accept when:** a fresh clone passes CI; a new user can sign up with email/password against the local Docker Postgres — no third-party accounts required — land in an empty product shell, and sign out.

## M1 - Billing and the Credit Ledger (1-2 sessions)

Stripe products/prices created via a checked-in setup script; checkout for the three paid tiers; Customer Portal link; pause/resume flow (REQ-G08: pause_collection, credits frozen, expiry clocks suspended, cancel flow offers pause first); webhook handler with idempotency; `credit_ledger` with grant/pack/debit/adjust kinds, expiry semantics, and derived balance; overage pack purchase; auto-top-up opt-in with monthly cap; usage page (balance, burn, invoices); config table v1 (credit costs, allowances) editable from admin.

**Accept when:** integration tests cover subscribe → grant, cancel → downgrade, payment-failed → grace → downgrade, pack purchase, double-delivered webhook (no double grant), debit refused at zero balance; a test-mode user can subscribe at $10, see 250 credits, buy a pack, and see the ledger reflect all of it; pausing freezes credits and resuming restores them with expiry clocks correctly shifted. **This milestone intentionally precedes generation: metering exists before anything burns tokens.**

## M2 - The Brain: Onboarding and Profile (1-2 sessions)

Onboarding wizard (interview → paste/links of past posts → optional references → review-and-confirm screen showing evidence + confidence per inferred field, per REQ-B02); `brain_docs` versioned storage; brain editor pages (voice, strategy, killtest) where every edit creates a version; north-star metric declaration; brain export (REQ-A04); seed the shared framework library from the generalised mechanism set (mechanism-level only - confirm PRD open decision 3 before this task).

**Accept when:** a new user completes onboarding in under 20 minutes with realistic inputs; every active brain field shows its provenance; editing a field creates a new version and the old one remains readable; export produces complete, readable JSON + markdown.

## M3 - The Studio: Modes, Kill Test, Metering (2-3 sessions)

`packages/modes` with the shared pipeline skeleton (assemble → generate → kill test → meter → emit) and all seven modes; streaming UI with the "checking" finalisation state; structured `ScriptOutput` rendering (thesis / framework / hooks / timestamped script with the turn marked / shot map / text on screen / caption / why-this-performs); revision flow with lineage; feedback capture → promotion proposals; tier gating (Free gets hooks/captions/ideas only); credit debit in-transaction with generation persist.

**Accept when:** each mode produces schema-valid output against a seeded test brain; kill-test hard rules demonstrably catch planted violations (a test fixture with a fragment triad, an antithesis construction, an invented specific, a 16-word hook - each caught and rewritten or honestly failed); a zero-balance workspace is refused with the top-up prompt; generations record prompt bundle version, config version, model, tokens, and cost. **Evidence criterion (separate):** run 10 real generations against the founder's own brain and log a quality verdict per output in `docs/progress/m3-quality.md` - this is the first honest quality snapshot, not a gate.

## M4 - Trend Monitor and Spin (2-3 sessions)

`packages/trends` with the `TrendSource` interface; YouTube adapter with outlier scoring and quota-aware daily refresh (Inngest); submitted-link adapter with oEmbed + caption/paste transcript path; autopsy pipeline with framework matching and new-framework proposals into the curation queue; trends feed UI with saturation/staleness labels and niche tracking per tier; **Spin** action through the full modes pipeline including the similarity gate; weekly digest email.

**Accept when:** a tracked niche fills with items whose outlier ratios are reproducible from stored channel baselines; an autopsy renders in the fixed order and caches (second view costs zero); a spin visibly differs from its source in subject, hook wording, and one structural element, and a deliberately-forced near-copy is blocked by the similarity gate (test fixture); the digest email sends to a test profile. **Compliance criterion:** the ingest layer contains adapters for exactly the compliant sources named in tech-spec §4 and nothing else; grep-level check that no scraping dependency exists.

## M5 - Results and Learning (1-2 sessions)

Results entry UI (numbers required for `verified`; unverified claims stored but excluded from learning); per-1k computation against the declared metric; baseline comparison scoped to the profile's own comparable posts; confounder flags; reach-vs-conversion split on every result view; promotion proposals with minimum-n enforcement in `packages/brain` (the sole construction site for proposals - no other code path may create one); accept/reject flow writing new brain-doc versions.

**Accept when:** a result without numbers cannot enter learning; a proposal only appears at n ≥ 3 comparable verified results and displays n, effect, and confidence; accepting a proposal creates a new brain version with the evidence attached; paid and organic results never pool (test).

## M6 - Marketing Site, Admin, Launch Hardening (1-2 sessions)

Landing page with the side-by-side comparison demo (same idea, generic vs sample brain, shaping rules highlighted - REQ-H02/R-14; zero-credit, IP rate-limited); pricing page wired to checkout; legal pages; changelog; admin: curation queue, source management, user/subscription lookup, credit adjustments with reason codes, margin dashboard; PostHog activation funnel; Sentry; rate limits per tech-spec §6; abuse pass on the free tier; account deletion with full data removal within 30 days (REQ-A04 - the deletion half; brain export ships in M2); Studio seats via Better Auth's organizations plugin (R-19); Studio API (thin versioned wrapper, keyed, metered).

**Carried in from the 2026-08-17 audit (finding #21, decision R-25/D-AUDIT-2) — the `stripe_events.payload` RETENTION RECEIVER.** That column stores complete unredacted Stripe webhook JSON (customer email, name, billing address) indefinitely. The *policy* is already in force (retain 90 days after `received_at`, or until the row's final processing state is known if later, then redact the payload and keep the non-PII audit metadata: event id, type, workspace id, customer id, outcome, timestamps). What M6 owes is the **receiver that executes it**, and it must cover the two row classes workspace deletion misses — rows whose workspace has since been deleted, and rows with `workspace_id = NULL` (unattributable `refused_unknown_customer` events). It belongs here because it is the same machinery as REQ-A04 deletion/retention. Until it exists, `respin/tests/retention.test.ts` fails the build if any new surface reads that column.

**Two more personal-data stores land in the SAME receiver — one sweep, three tables.** (a) `rate_limit.key` holds a plaintext client IP; **retain 24 hours after `last_request`** (R-26; Better Auth's own opportunistic pruning is an internal of a pinned dependency, not a retention guarantee). (b) **`session.ip_address`** holds a plaintext client IP joined to a user; it was enumerated by neither R-25 nor R-26 and has **no retention sentence yet** — R-27 records that setting `RESPIN_TRUSTED_PROXIES` to a real proxy list is exactly what makes a genuine IP resolvable and therefore stored, so this column goes from `""` to real personal data at first deploy. M6 owes it a retention period decided with the deletion path (REQ-A04), not inherited by default.

**Accept when:** an anonymous visitor can run the comparison demo and visibly see the two outputs differ in voice and structure, subscribe, onboard, and generate without touching anything internal; the activation funnel (signup → brain → first script) reports in PostHog; the margin dashboard shows real numbers from M3-M5 usage; a seat invited to a Studio workspace can generate but cannot touch billing; a deleted account's data is verifiably removed (REQ-A04: full removal within 30 days, deletion path exercised in test); **and the retention receiver has redacted at least one payload older than 90 days, including a `workspace_id = NULL` row, with the audit metadata still readable afterwards, and has swept `rate_limit` and `session.ip_address` on their own periods.**

---

## After M6 - the evidence phase (not engineering)

GTM runs in parallel from the pilot onward per `gtm.md`: founder build-in-public starts during the pilot, waitlist opens during the pilot, affiliates (REQ-H04) and referral (REQ-H05) activate post-launch.

Recruit 5-10 pilot creators (YouTube Shorts-first per R-11) across different niches and goals. The program's real exit criterion, mirroring PRD success metric #2: each pilot creator logs ≥3 verified results, and ≥50% of them have at least one system-generated post beating their own baseline on their declared metric. Until that reads green on real creators, the product claim stays "in pilot" on the marketing site. No amount of code substitutes for this data - do not mark it done from fixtures.

## Standing risks (watch from M0)

1. **Margin inversion at Pro/Studio heavy use** - the margin dashboard exists from M1's config and M6's rollup precisely so pricing is tuned from data; credit costs are config, not code.
2. **The similarity gate under-blocking** - keep a growing fixture set of near-copies; every gate change reruns it.
3. **Trend source fragility** - the YouTube adapter is quota-bound and ToS-bound; the `TrendSource` interface exists so a licensed provider can slot in without touching the pipeline.
4. **Brain quality at onboarding** - a thin brain produces generic output, which is the product's one unforgivable sin; M3's evidence criterion and the pilot phase are the honest checks, and REQ-B04's first-three-ideas moment is the earliest signal.
