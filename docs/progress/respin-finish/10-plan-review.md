# Respin Phase 10 pre-implementation plan gate (2026-09-05)

**Current verdict: READY — Grade A**

| Slice | Verdict | Grade |
|---|---|---|
| 10a | READY | A |
| 10b-1 | READY | A |
| 10b-2 | READY | A |
| 10c | READY | A |

Implementation had not started when this gate closed. The gate was deliberately run before Phase 10 work and consisted of full-intensity billing, tenancy, compliance, and learning-honesty reviews, followed by the general plan reviewer. The reviews were static and read-only; no implementation tests were run for this plan gate.

## Grade A closure

The Grade D preflight below was preserved as provenance, repaired at the plan and authority level, and then re-run against current bytes. Owner decisions R-115–R-121 close the six product-policy conflicts; reversible build defaults R-122–R-124 make retention, abuse ceilings, and the deletion journal executable without pretending to authorise legal conclusions, vendor provisioning, or spend. R-2 remains an explicit owner decision, with one typed placeholder/final identity and a fail-closed public-enablement gate rather than an implementation guess.

The executable order is **10b-1 → 10a → 10b-2 → 10c**. Each card now pins exact dependency proof, sole authorities, lifecycle registration, state transitions and races, expected files, focused checks, acceptance walks, planted mutations, rollback, evidence boundaries, and a least-confident statement. The current contract preserves every `ALMOST` evidence residual from Slices 8/8c/9a/9b and never treats fixtures, static review, or engineering completion as launch/pilot proof.

| Current review lane | Verdict |
|---|---|
| Learning honesty | PASS / A |
| Billing and credits, including R-124 cost and R-2 Stripe identity deltas | PASS / A |
| Brain tenancy, lifecycle, privacy, and R-124 restore-journal delta | PASS / A |
| Spin compliance and outbound truth, including the final R-2 delta | PASS / A |
| General plan-integrity review, run last on current bytes | PASS / A |

Static close checks passed: all local links in the 14-file manifest resolve; `git diff --check` is clean for the manifest; R-115–R-124 headings are unique; the four cards have the required anti-drift structure; exact reusable dependency files/symbols exist; no stale `mode-spec.ts`, `97–133`, M3-in-progress, or Slice-7-in-progress marker remains; execution order and handoffs agree; and the 17 slice estimates sum to **129–176 hours**. This proves plan readiness only. AWS provisioning/restore, jurisdiction/legal review, vendor/browser/operator walks, R-2's final name/domain, and pilot/connector evidence remain explicit fail-closed implementation or launch gates.

*The dated Grade D preflight is preserved below as provenance; every finding in it is closed by the current Grade A plan above.*

## Historical preflight — executive finding

The phase cards have a useful scope skeleton, but they are older than the current implementation and current planning discipline. As written, they permit a second spend authority, an ungated public experience labelled as Spin, unsafe first callers for credit adjustment and revenue writers, retained data without same-change deletion coverage, incomplete human and machine authorization, and public or measurement claims that the evidence cannot support.

Most mechanical drift can be repaired in the cards. The product and canon choices in the next section cannot be inferred by an implementer.

## Historical preflight — decisions that blocked plan repair

1. **Learning authority — binding conflict.** `CLAUDE.md` requires promotion proposals to use at least three comparable verified results and says unverified data never learns. Current `comparison.ts` and `proposal.ts`, intentionally authorized by R-112, admit `quantified_self_reported` evidence into numerical baselines and all-self-reported evidence into an `early` proposal. No connector verification writer exists, so enforcing verified-only immediately makes proposals unreachable. A named owner must choose either verified-only plus a reachable verification writer, or a formally bounded, provenance-labelled role for self-reported evidence. Codex cannot silently amend `CLAUDE.md`.
2. **Public demo semantics — product conflict.** The PRD describes both a live Spin demo and a generic no-brain-versus-sample-brain comparison. Only the actual Spin path has the source, autopsy, original/reference display, hard similarity gate, three minimum-difference axes, one rewrite, and honest-refusal behavior; generic no-brain generation is currently refused. Choose a real gated Spin, or a separately named sandbox/sample comparison with a truthful, narrower contract.
3. **Money policy.** Settle the 8c-C4 refund disposition, revenue-recognition timing, reversals/chargebacks, unknown usage/cost treatment, and failed-settlement behavior before the new callers exist.
4. **Authority model.** Settle seat administration, ownership transfer/last-owner behavior, credit-adjustment authority, and whether API keys are workspace-owned or issuer-bound, including their machine scope and lifecycle.
5. **Data governance.** Settle rights for `shared_analysis`, anonymous-demo retention, deletion grace cancellation, backup/tombstone guarantees, and the exact legal/privacy promise.
6. **Measurement and claims.** Approve the activation definition, pilot/evidence language, threshold provenance/owners, and the contribution-margin behavior when costs are incomplete.

## Historical preflight — consolidated blocking findings

### Cross-phase and dependency truth

- **BLOCK — Critical, high confidence:** Phase 10a says Slices 8 and 9 are shipped, while the master plan records 8, 8c, 9a, and 9b as `ALMOST`. Their implemented interfaces may be reused after exact inspection, but browser, vendor, launch, pilot, and clean-entry-gate evidence cannot be inherited. The plan must replace the blanket dependency with an artifact-by-artifact proof and preserve every unearned evidence residual.
- **BLOCK — Critical, high confidence:** The cards lack the modern anti-drift structure: explicit dependency proofs, owner agents, edge/failure cases, handoff contracts, out-of-scope boundaries, and `Least confident:` lines. Acceptance language repeatedly relies on phrases such as “same protections” instead of an enforceable contract.

### Phase 10a — public foundation and demo

- **BLOCK — Critical, high confidence:** The anonymous demo would call the Modes pipeline outside the Credits wrapper and record no durable append-only usage/cost fact. “Zero credits” must not mean “zero metering.” Generalize the existing system-spend claim/finalize authority—currently constrained to trend autopsy—instead of adding `rate-limit-demo.ts` as a second spend authority. Require idempotent pre-call claims, actual/unknown finalization, crash-conservative reservations, and reconciliation.
- **BLOCK — Critical, high confidence:** The planned “live Spin demo” can satisfy its acceptance criteria without using Spin or its similarity gate. Mockup disclosure cannot be removed until the chosen public product has a complete terminal gate/refusal contract and forced-near-copy proof.
- **CHANGE — High, high confidence:** Define a typed untrusted-input boundary and canonical serializer. Current prompt assembly concatenates caller text under a label, so “prompt fencing” is not a closed property.
- **CHANGE — High, high confidence:** A checked-in synthetic brain needs recorded provenance, structural exclusion of creator/profile/performance identifiers, a full import-closure scan, and composition outside `@respin/modes` if reuse of the DB-owned validator would reverse package dependencies.
- **CHANGE — High, high confidence:** HMAC-IP limiting must reuse the canonical trusted-proxy/client-IP authority, use a versioned dedicated key rather than a “salt,” never log raw IP, and ship a traffic-independent expiry receiver in the same change.
- **CHANGE — High, high confidence:** If activation analytics ships, define a closed content-free event schema and exact numerator, denominator, cohort clock, 24-hour censoring, deduplication, timezone, exclusions, and attribution. It cannot be cut while also claiming the M6 acceptance criterion is complete.
- **CHANGE — Medium, high confidence:** Pre-register the demo fixture population, paired conditions, model/config/prompt versions, run count, rubric, assessor, and failures. The result may demonstrate sampled transformation capability, not improved performance.

### Phase 10b-1 — seats, admin, revenue, and new retained data

- **BLOCK — Critical, high confidence:** `adjustCredits` would become app-reachable before 8c-C9 is contained. Positive adjustments currently permit never-expiring lots, ignore an open pause, and lack business-event idempotency. Define expiry/source, pause behavior, a stable operation identity, duplicate/concurrent behavior, and same-transaction ledger plus audit writes before exposing the action. Explicitly disposition 8c-C4 before any second refund caller.
- **BLOCK — Critical, high confidence:** Revenue writers are not explicitly joined to the existing `stripe_events` event-ID transaction. Require both the unique Stripe delivery identity and immutable business-object/reversal identity in the same transaction; cover replay, concurrent replay, distinct events for one object, out-of-order refund/credit note, rollback, and redelivery.
- **BLOCK — Critical, high confidence:** Revenue recognition is not an executable accounting contract. Define immutable revenue-to-lot allocation or deterministic as-of derivation, partial multi-lot consumption, chronology, rounding, pause-shifted expiry, breakage, refunds, already-recognized reversals, and retained/re-linkable Stripe identifiers.
- **BLOCK — Critical, high confidence:** The role matrix is based on a stale single capability factory. Establish one closed registry of every app/API user capability, test every owner/editor/viewer cell, keep internal-only operations unreachable, make seat administration owner-only, require a separately reauthenticated ownership transfer, and refuse last-owner identity deletion until owned workspaces are transferred or deleted.
- **BLOCK — High, high confidence:** Human curation lacks a sole server transition authority that accepts only readable `shared_analysis` evidence, revalidates the final edit/merge as mechanism-only, preserves null-owner shared identity and immutable version history, excludes private creator/profile/autopsy material, and cannot become a Performance Meta promotion bypass.
- **BLOCK — Critical, high confidence:** Invite, revenue, and audit tables would ship in an independently releasable slice before executable deletion in 10b-2. The current table-level registry is descriptive, not a per-scope executable deletion/export plan. Every new retained scope must gain executable lifecycle coverage in the same change, or move to the later slice.

### Phase 10b-2 — deletion, retention, and recovery

- **BLOCK — Critical, high confidence:** Workspace deletion cannot literally revoke “all sessions”: Better Auth sessions are user-global and have no workspace key. Tombstone workspace membership/access; reserve global session revocation for identity deletion unless a workspace-bound session model is introduced.
- **BLOCK — Critical, high confidence:** Deletion needs a durable state machine for grace, cancellation, Stripe and auto-top-up commands, running jobs, write fences, retry/idempotency, irreversible erasure, and terminal reconciliation. The plan currently promises both billing cancellation and cancellation of deletion without defining restoration behavior.
- **BLOCK — Critical, high confidence:** Backup restore cannot replay a deletion tombstone that existed only inside the restored database. Define an append-only deletion journal outside the restorable DB, replay it before migrations/workers/traffic, retain it until every capable backup is gone, enumerate all replicas/versions/snapshots, and clean failed restore-drill targets.
- **CHANGE — High, high confidence:** Use a populated deletion fixture spanning onboarding reference input, submitted URL, private item/transcript/autopsy/cache claim, Spin generation, and queued/running worker job alongside shared YouTube analysis. Prove private rows disappear, shared cache survives, jobs cannot recreate data, and revenue/finance rows keep only their explicitly approved pseudonymous or re-linkable identity.

### Phase 10c — API, global abuse ceiling, disclosure, and public truth

- **BLOCK — Critical, high confidence:** API-key authentication has no defined way to enter the single scope cage. Create one verifier/mint that atomically verifies hash, status, workspace/profile ownership and deletion state and returns a branded least-privilege machine scope. Define ownership, issuer demotion, rotation, revocation, expiry, compromise, profile/identity/workspace deletion, capability registration, and audit lifecycle.
- **BLOCK — Critical, high confidence:** “Same protections” does not prove API Spin parity. The API contract must require similarity before any body is displayable, subject/hook/structure change, one rewrite then refusal, no failed draft in responses or idempotent replay, `[check]` traceability, weakest point, no guarantees/concealment, original/reference attribution, and persisted terminal gate evidence. Add forced-near-copy and UI/API parity mutations.
- **BLOCK — Critical, high confidence:** The product-wide spend ceiling does not enumerate every vendor-call site. Derive a closed population covering paid UI/API, onboarding, Free, demo, and workers, then prove every path enters the single authority before vendor work. Ambiguous post-outbound crashes become `recovery_required`, never an automatic reissue.
- **CHANGE — High, high confidence:** Define a compile-closed, versioned platform-policy registry and deterministic disclosure presenter outside model prose, including source/effective date, owner, stale/unknown fallback, and adversarial tests for wrong platform, concealment, evasion, and false-authorship guidance.
- **CHANGE — High, high confidence:** Register each API-key, idempotency, audit, account/workspace counter, and IP-bucket table with exact export, deletion, revocation, and retention behavior. Secret hashes are excluded from export with a reason; lifecycle metadata is handled separately.
- **CHANGE — High, high confidence:** Run claim-by-claim outbound-truth, learning, compliance, and privacy review across landing, pricing, FAQ, legal pages, changelog, API docs, and support copy. Efficacy/learning claims remain “in pilot” with real population/evidence; fixture arithmetic cannot close unit-economics or pilot evidence.

### Measurement and non-vacuity

- **BLOCK — High, high confidence:** An exact contribution-margin number is dishonest when any cost is unknown. Define aligned UTC period/grain, tier attribution, workspace/pseudonym joins, pack and reversal treatment, USD population, and an unavailable/partial/range state. Reconcile the PRD’s “gross margin on model spend” with the plan’s “contribution margin.”
- **CHANGE — High, high confidence:** Add crash, replay, rollback, concurrency, and planted-integrity matrices for demo metering, adjustments, Stripe events, revenue allocation, API settlement, global ceiling coverage, invented specifics without `[check]`, guarantees, concealment, failed rewrites, deletion by scope, last-owner behavior, and curation non-promotion.
- **NOTE — High confidence:** Phase 10a lists M1–M9 but calls them seven mutations, and it carries a gate-completeness prerequisite already recorded closed. Correct both mechanically.

## Historical preflight — could 10a be decoupled?

Not as a public demo. A non-public foundation slice can be decoupled from later admin/revenue/API work only if it introduces no competing spend authority, generalizes durable spend claim/finalize safely, retains no visitor-derived data or ships its lifecycle receiver in the same change, preserves all existing Spin gates, makes no unresolved public claim, and depends only on individually proven Phase 8/9 interfaces. The public anonymous experience remains blocked by the demo product decision, metering, privacy/retention, and prerequisite truth.

## Historical preflight — required re-plan order

1. Record this `NOT READY / D` gate and preserve prior `ALMOST` evidence honestly.
2. Obtain and record the six named-owner decisions above; reconcile owner-controlled canon and product requirements without silent inference.
3. Replace blanket 8/9 dependencies with exact implementation-interface and evidence proofs.
4. Define shared contracts for verification provenance, Spin terminal behavior, spend/revenue identity and states, authorization, retention, deletion, and public measurement.
5. Re-plan 10a as a non-public foundation followed by separately gated public enablement.
6. Pull executable per-scope lifecycle handling ahead of or into the first change that creates retained demo, invite, revenue, audit, API, or abuse data.
7. Re-plan 10b-1 so authorization, money, and lifecycle foundations precede new callers; use 10b-2 for remaining deletion completion and evidence, not first availability.
8. Re-plan 10c around the machine-principal cage, typed Spin response/refusal parity, one product-wide spend authority, and deterministic platform disclosure.
9. Add modern card structure, exact checks, non-vacuity mutations, and separate engineering acceptance from external/pilot evidence.
10. Re-run specialist gates in slice order, then the general plan reviewer last.

## Historical gate conclusion

At the preflight snapshot, no implementation could safely start from the then-current Phase 10 cards. The earliest safe engineering work was a newly planned, non-public foundation slice after the blocking decisions were recorded and the repaired plan re-passed the full gate.

## Current gate conclusion

The repaired Phase 10 plan is **READY / Grade A** with zero open plan blockers. Implementation starts with 10b-1; later public or external enablement remains governed by the evidence and approval gates named above.

*Ask /go to explain any finding in plain words — or to just fix them.*
