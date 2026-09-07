# Build Plan: Respin

**Read first:** `PRD.md`, then `tech-spec.md`, then `decisions.md`. This plan sequences the build into milestones sized for focused Claude Code sessions. Each milestone has acceptance criteria; a milestone is done when its criteria pass, not when its code exists. Engineering completion and evidence completion are reported separately, always.

**Sizing correction:** `docs/plans/respin-finish-master-plan.md` supersedes the session estimates for
M2–M6 (currently 129–176 engineering hours, excluding provisioning/legal/evidence/review elapsed time).
The milestone outcomes below remain the scope contract.

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

Onboarding wizard (structured goals/positioning/north-star/banned words-vibes/ambitions interview → paste/links of own posts → optional references → honest review-and-confirm screen showing evidence state per field, per REQ-B02); immutable creator-authored evidence; `brain_docs` versioned Voice/Strategy/Kill Test storage; coherent activation snapshot; editor pages where every edit/metric change creates a version without rewriting historical generation context; brain export (REQ-A04). Framework seeding moves to M3 with its first Studio reader.

**Accept when:** a new user completes onboarding in under 20 minutes with realistic inputs; Voice, Strategy, Kill Test and declared metric activate as one snapshot; every active brain field shows whether its provenance is creator-authored or inferred; editing any document/metric creates a new version and the old one remains readable; export produces complete, readable JSON + markdown; the first-three-ideas action has an explicit M3 owner.

## M3 - The Studio: Modes, Kill Test, Metering (2-3 sessions)

`packages/modes` with the shared pipeline skeleton (claim attempt → assemble → generate → kill/traceability gates → atomically settle generation/refusal + debit → emit) and all seven modes; buffered UI with a "checking" state and only terminal accepted/refused output after gates (streaming remains unimplemented and the latency budget remains open); structured `ScriptOutput`; approved/non-retired F1–F9 library plus Pro+ private frameworks; revision flow with same-tenant lineage; structured feedback capture (proposal construction waits for M5); tier gating (Free gets hooks/captions/ideas only); first-three-ideas onboarding handoff; burn by mode.

**Accept when:** each mode produces schema-valid output against a seeded test brain; kill-test fixtures catch the four planted violations; zero balance refuses before vendor work; duplicate/concurrent attempts execute one vendor sequence; a crash cannot expose an unpaid usable generation; spend facts survive settlement refusal; generations record the exact coherent brain/context/framework/config/prompt/model versions; `/usage` reports burn by mode. **Evidence criterion (separate):** run 10 real generations against the founder's own brain and log a quality verdict per output in `docs/progress/m3-quality.md` - this is the first honest quality snapshot, not a gate.

## M4 - Trend Monitor and Spin (2-3 sessions)

`packages/trends` with the `TrendSource` interface; YouTube Data API metadata/outlier scoring and quota-aware daily refresh via the pg-boss worker; creator-pasted third-party transcript path (creator-owned captions only under explicit edit-authorized OAuth; no arbitrary public caption assumption); transcript provenance/state gating before autopsy/feed/Spin; autopsy pipeline with framework matching/proposals; trends feed with saturation/staleness; **Spin** through the full modes/similarity pipeline; weekly digest; separate non-tenant system-usage/daily-spend accounting and worker health/alerts/dead letters.

**Accept when:** a tracked niche fills with items whose outlier ratios are reproducible from stored channel baselines; an autopsy renders in the fixed order and caches (second view costs zero); a spin visibly differs from its source in subject, hook wording, and one structural element, and a deliberately-forced near-copy is blocked by the similarity gate (test fixture); the digest email sends to a test profile. **Compliance criterion:** the ingest layer contains adapters for exactly the compliant sources named in tech-spec §4 and nothing else; grep-level check that no scraping dependency exists.

## M5 - Results and Learning (1-2 sessions)

Results entry UI with honest evidence state (`unquantified`, `quantified_self_reported`, `connector_verified`); verified-only per-1k computation against the historical declared-metric version; comparable connector-verified repeated-treatment cohorts; a separate connector-verified personal baseline excluding the treatment cohort/key; confounder flags; reach-vs-conversion split; connector-verified result proposals and repeated-feedback proposals with relational evidence, lifecycle/dedup/staleness and deterministic evidence-strength labels in `packages/brain` (sole constructor); accept/reject through the existing brain confirmation/activation path; brain-as-asset view. General analytics connectors remain post-pilot, so result-based learning is visibly unavailable at launch rather than simulated with fixtures or manual flags.

**Accept when:** neither unquantified nor quantified self-reported results enter numerical cohorts and manual numbers are never called verified; a result proposal needs at least three connector-verified same-treatment results plus at least three eligible connector-verified outside-treatment baseline results; treatment and baseline ids do not overlap; paid/organic/platform/metric/treatment strata never pool; the no-connector state is explicit; relational evidence backs every proposal; repeated feedback can propose but never silently mutate; acceptance creates a confirmed/activated brain version. Deployment audits pre-existing result proposals and blocks on any accepted proposal backed by non-verified evidence.

## M6 - Marketing Site, Admin, Launch Hardening (1-2 sessions)

Real Sample Spin (production Analyse-and-spin path; fictional fixtures; zero visitor credits but durable global system metering; keyed-HMAC IP buckets; cost/concurrency/input/output/deadline ceilings; one rewrite then terminal acceptance/refusal); verified-only learning correction; content-safe Sentry and aggregate activation reporting; executable retention/deletion registry and receiver before new retained tables; Amazon S3 Standard deletion journal behind `DeletionJournalStore` with versioning, conditional create, compliance Object Lock, SSE-S3 and restore-before-traffic proof (R-124; provisioning remains explicit evidence); custom hashed single-use workspace invites and a closed owner/editor/viewer capability registry; contained credit/refund administration; authoritative Stripe revenue events and complete-or-withheld margin view; separate identity/profile/workspace deletion with immediate tombstone, 7-day grace and all capable backups gone by day 28; thin workspace-owned, scoped, metered, idempotent Studio API through the tenant generation authority; closed deterministic platform disclosure registry; pricing/checkout/legal/changelog/FAQ and a full Free/demo/API abuse pass.

**Carried in from the 2026-08-17 audit (finding #21, decision R-25/D-AUDIT-2) — the `stripe_events.payload` RETENTION RECEIVER.** That column stores complete unredacted Stripe webhook JSON (customer email, name, billing address) indefinitely. The *policy* is already in force (retain 90 days after `received_at`, or until the row's final processing state is known if later, then redact the payload and keep the non-PII audit metadata: event id, type, workspace id, customer id, outcome, timestamps). What M6 owes is the **receiver that executes it**, and it must cover the two row classes workspace deletion misses — rows whose workspace has since been deleted, and rows with `workspace_id = NULL` (unattributable `refused_unknown_customer` events). It belongs here because it is the same machinery as REQ-A04 deletion/retention. Until it exists, `respin/tests/retention.test.ts` fails the build if any new surface reads that column.

**Two more personal-data stores land in the SAME receiver — one sweep, three tables.** (a) `rate_limit.key` holds a plaintext client IP; **retain 24 hours after `last_request`** (R-26; Better Auth's own opportunistic pruning is an internal of a pinned dependency, not a retention guarantee). (b) **`session.ip_address`** holds a plaintext client IP joined to a user; it was enumerated by neither R-25 nor R-26 and has **no retention sentence yet** — R-27 records that setting `RESPIN_TRUSTED_PROXIES` to a real proxy list is exactly what makes a genuine IP resolvable and therefore stored, so this column goes from `""` to real personal data at first deploy. M6 owes it a retention period decided with the deletion path (REQ-A04), not inherited by default.

**Accept when:** the anonymous Sample Spin uses the real hard gates, withholds failed drafts, durably meters every call, visibly differs, and cannot exceed its budgets; the mature-cohort activation funnel reports numerator, denominator and exclusions without creator identifiers leaving the database; revenue and tenant/system cost reconcile or margin is visibly withheld; an invited matching-email editor can generate but cannot administer billing; user identity deletion preserves shared work while profile/workspace deletion removes the intended scope and every capable backup expires by day 28; retention receivers and an independent residue verifier cover every governed table; a clean-room workspace-owned API key works idempotently through the same tenant settlement path; every supported platform receives current deterministic disclosure guidance or a stale-policy fallback; FAQ/support paths are live and make no unearned learning, latency, deletion, or performance claim.

---

## After M6 - the evidence phase (not engineering)

GTM runs in parallel from the pilot onward per `gtm.md`: founder build-in-public starts during the pilot, waitlist opens during the pilot, affiliates (REQ-H04) and referral (REQ-H05) activate post-launch.

Recruit 5-10 pilot creators (YouTube Shorts-first per R-11) across different niches and goals. The program's real exit criterion, mirroring PRD success metric #2: each eligible pilot creator supplies ≥3 connector-verified treatment results plus an eligible ≥3 connector-verified outside-treatment personal baseline, and ≥50% have at least one system-generated treatment cohort beating that baseline on the declared metric. This cannot be evaluated until a post-pilot connector writer exists; absence is unavailable, never zero. Until it reads green on real creators, the product claim stays "in pilot" on the marketing site. No amount of code or fixture data substitutes for this evidence.

## Standing risks (watch from M0)

1. **Margin inversion at Pro/Studio heavy use** - the margin dashboard exists from M1's config and M6's rollup precisely so pricing is tuned from data; credit costs are config, not code.
2. **The similarity gate under-blocking** - keep a growing fixture set of near-copies; every gate change reruns it.
3. **Trend source fragility** - the YouTube adapter is quota-bound and ToS-bound; the `TrendSource` interface exists so a licensed provider can slot in without touching the pipeline.
4. **Brain quality at onboarding** - a thin brain produces generic output, which is the product's one unforgivable sin; M3's evidence criterion and the pilot phase are the honest checks, and REQ-B04's first-three-ideas moment is the earliest signal.
