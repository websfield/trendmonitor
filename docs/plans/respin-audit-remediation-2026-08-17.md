# Respin Audit Remediation Plan — 2026-08-17

**Source audit:** [`docs/progress/audit/2026-08-17.md`](../progress/audit/2026-08-17.md)  
**Scope:** `respin/`, its CI and operating documentation, and the Respin-facing entries in `docs/initial/decisions.md` and `NORTH_STAR.md`.

## Objective

Move Respin from the audit's **C+ / Not yet** state to **Ready for the next milestone**, with the money-path invariants proven under real Postgres concurrency, the production data-recovery story executable, and every audit finding either fixed or explicitly accepted by decision.

The audit identified four release-shaping risks:

1. A paused workspace can still initiate a pack charge.
2. Paused-invoice handling does not have an explicit policy and currently grants credits.
3. Stripe subscription-mirror writers have an unlocked read-then-write race.
4. The money database has no backup or restore proof.

Those risks are handled first. The plan does not authorize work in the parked `src/` or `cutdown/` product lines, and the audit's unswept list is not treated as evidence that those areas are clean.

## Decisions to make before implementation

### D-AUDIT-1 — `invoice.paid` during a pause (#2)

Recommended default: preserve the strict REQ-G08 behavior for invoices generated during a pause, while explicitly allowing a delayed-delivery race for an invoice event whose Stripe event time predates the pause's `startedKnownAt`. The accepted exception is therefore “a pre-pause paid invoice may be granted while the mirror is already paused because delivery was late,” not “paused workspaces may receive arbitrary monthly grants.”

The implementation must:

- compare the invoice event time with the active pause's knowledge time;
- grant only for the documented pre-pause race;
- refuse/record an invoice event created during the pause without minting credits;
- emit a structured log naming the event type, invoice id, event id, pause decision, and reason; and
- replace the current test that unconditionally locks in a grant while paused with both allowed-race and genuine-paused-event cases.

If product instead requires “no grant is ever processed while the mirror is paused,” stop before the webhook phase and add a durable deferred-invoice/manual-reconciliation path keyed by invoice id. Do not silently choose that more expensive branch during implementation.

### D-AUDIT-2 — `stripe_events.payload` retention (#21)

Recommended default: retain the full payload for 90 days after `received_at` (or until the row's final processing state is known, if later), then redact or delete the payload while retaining non-PII audit metadata. The policy must cover rows whose workspace was deleted and rows with `workspace_id = NULL`. The M6 retention/deletion implementation remains a separate phase, but the policy and “no new reader before redaction” constraint are recorded now.

### D-AUDIT-3 — ledger-fold revisit trigger (#22)

Recommended default: instrument per-workspace ledger row count and fold duration now; revisit snapshotting when either a workspace reaches 10,000 ledger rows or the seven-day p95 fold duration exceeds 250 ms. These are operational triggers, not user-facing guarantees, and must be recorded in `docs/initial/decisions.md` with the metric names and owner.

### D-AUDIT-4 — repository license posture (#19)

Recommended default: add an explicit proprietary/all-rights-reserved notice unless the owner deliberately chooses an open-source license. The plan must not add an OSI license by assumption.

## Phase plan

### R0 — Decisions, entry gates, and M2 tenancy design

**Depends on:** none.  
**Blocks:** all billing changes that depend on D-AUDIT-1; M2 entry; final readiness claim.

1. Add D-AUDIT-1 through D-AUDIT-4 to `docs/initial/decisions.md`, including the chosen paused-invoice policy, retention receiver, fold thresholds, and license posture.
2. Add the M2 design note for `creator_profiles`: a branded `VerifiedProfileId`, a verified workspace/profile relationship, composite scoping at every profile accessor, and tests that cannot pass a profile from another workspace. Land this design before any M2 schema or route is written (#23).
3. Correct `NORTH_STAR.md`'s “PRD §5.2” citation to the actual flat-list item in `docs/initial/PRD.md` (#30). Do not make a structural NORTH_STAR revision.
4. Record the audit's adjacent ledger-numbering typo (`0010` vs `0009`) as a one-line documentation correction, without treating it as a new product finding.

**Acceptance criteria:** the decisions are unambiguous; the M2 plan has a profile-cage entry gate; the citation resolves to an existing PRD passage; no code phase starts with the paused-invoice policy still implicit.

### R1 — Money-path and webhook correctness

**Depends on:** R0, especially D-AUDIT-1.  
**Primary files:** `respin/packages/credits/src/stripe/{actions,auto-topup,webhooks}.ts`, `respin/packages/credits/src/state.ts`, `respin/app/(product)/settings/billing/{actions,billing-view}.tsx`.

1. **Pause the manual pack path (#1).** Add a package-level paused-subscription refusal before customer creation or Stripe Checkout creation in `createPackCheckoutUrl`; keep the server-side guard authoritative in `buyPackAction`; disable the UI control with an associated reason when paused; add an isolation/action test proving no Stripe call occurs.
2. **Implement D-AUDIT-1 (#2).** Add a single helper for invoice subscription identity and pause-time eligibility. Test the accepted pre-pause delivery race, the genuine during-pause refusal, idempotency, and the existing unpaused grant path.
3. **Serialize every subscription-mirror writer (#3).** Import and acquire `takeWorkspaceLock` after workspace resolution and before the mirror read in each writer: checkout binding, subscription created/updated, subscription deleted, invoice paid, and invoice payment failed. Keep event-id idempotency separate from the workspace lock. Add real-Postgres differential-payload races where the winning state is observable, including a stale invoice attempting to clear a newer grace period.
4. **Cross-check invoice subscription identity (#4).** Extract the invoice's subscription id from the installed Stripe SDK shape. Before any grant or dunning write, compare it with the mirror's bound subscription id; ignore mismatches with a diagnosable log. Preserve the legitimate first-invoice/before-snapshot case explicitly, or route it through a durable reconciliation path rather than weakening the mismatch guard.
5. **Clear dead-state fields (#5).** Extend `DEAD_SUBSCRIPTION_FIELDS` to clear `pausedAt`, `resumesAt`, and `stripePriceId`, and make the paused state branch require a live subscription. Add canceled-plus-paused drift tests for both webhook cleanup and read-time derivation.
6. **Separate subscription liveness from auto-top-up chargeability (#6).** Keep `unpaid` available for dunning recovery and portal handling, but make `setAutoTopup`, `maybeAutoTopup`, and their UI refuse off-session charging while the status is terminal/unpaid. Add tests proving no PaymentIntent is created for `unpaid`, paused, dead, or missing-subscription states.
7. **Unify pack pricing (#7).** Create one pack-price resolver used by manual Checkout and auto-top-up. It must use the configured Stripe pack price as the charge authority, validate currency/amount/active state against the installed SDK, and prevent an admin edit to `pack.priceUsd` from silently creating two prices. Add a test for config/Stripe-price divergence.
8. **Harden webhook edge cases (#27–#29).** Include `event.type` in ignore/refusal logs; classify only known business-object unique conflicts as convergent `ignored` outcomes (#28); and fail closed when a subscription snapshot has zero line items instead of writing a live mirror with a null price (#29).
9. **Make `PackParams.configVersion` required (#24)** and update every caller/test so packs and debits carry the same auditability guarantee.
10. **Guard resume with liveness (#25).** Check the shared live-subscription predicate before calling Stripe, returning the typed refusal for a dead/stale mirror. Test the canceled-plus-stale-paused state and the normal paused-live path.

**Acceptance criteria:**

- no pack Checkout, PaymentIntent, monthly grant, or dunning write occurs from a prohibited paused/dead/unpaid state;
- stale subscription or invoice events cannot overwrite a newer mirror or affect a replacement subscription;
- all five mirror writers are lock-protected or use a proven compare-and-set equivalent;
- distinct-event-id business-object races converge without a false 500;
- the differential-payload concurrency suite runs against real Postgres and fails before the fix; and
- `stripe.test.ts`, `actions.test.ts`, `state.test.ts`, `isolation.test.ts`, and the Docker concurrency suites cover every changed invariant.

### R2 — Billing state, incomplete subscriptions, and UI accessibility

**Depends on:** R1 for the shared billing predicates and mirror fields.

1. **Give `incomplete` a real UI state (#8).** Extend `BillingState` and the billing view with an explicit incomplete-payment branch. Provide an actionable retry/remedy that matches the installed Stripe API (for example, an owner-only hosted-invoice recovery action); do not send the user to a Customer Portal that cannot resolve an incomplete subscription. Keep the duplicate-checkout guard intact until Stripe expires or resolves the subscription.
2. **Auth form accessibility (#15).** Replace placeholder-only fields in `respin/app/(auth)/auth-form.tsx` with visible labels, stable ids, and a visible password-minimum instruction associated with the password input. Preserve the existing client behavior and error alert.
3. **Admin config error focus and association (#16).** Give the issue list an id, connect it to the textarea with `aria-describedby`, and move focus to the alert/error summary when an invalid submission returns. Add a focused component test for the rejected state.
4. **Billing disabled-control associations (#17).** Give each disabled billing control a stable reason id and connect it with `aria-describedby`; include the paused pack refusal and the auto-top-up chargeability reason in this model.
5. **Disclose the unbuilt auto-top-up trigger (#26).** Add the same honest “available when the M3 generation/debit path exists” disclosure already used by `/usage`, or disable the checkbox until the caller exists. The selected behavior must be tested in `billing-ui.test.tsx`.

**Acceptance criteria:** keyboard and screen-reader users can identify every auth field, password rule, config error, and disabled billing control; incomplete subscriptions have a truthful next action; and the UI never presents a charge control without its server-side reason and guard.

### R3 — Operational recovery, supply chain, and auth hardening

**Depends on:** R0 for policy wording; R1 for the final database and billing behavior.  
**Production blocker:** R3's backup/restore acceptance must pass before any first production deploy.

1. **Backups and restore drill (#9).** Once the Lightsail/Postgres deploy shape is selected, implement scheduled encrypted `pg_dump` backups to storage independent of the database host, with retention, checksum/health reporting, and least-privilege credentials. Document backup ownership and failure alerting. Restore the dump into an isolated Postgres instance, run migrations/checks, verify representative workspace, subscription, ledger, and webhook rows, and record the date and result in `RUNBOOK.md` and a progress artifact.
2. **Honest rollback (#10).** Do not invent a Drizzle `down` command. Use application rollback to a previous build plus database rollback by restoring a verified backup; document the forward-only migration rule, the restore blast radius, and the exact operator commands after the backup drill exists.
3. **Fix the Respin quick-start (#11).** Put the `DATABASE_URL=...` prefix directly on the `db:migrate` and `db:seed` commands in `RUNBOOK.md`, or link to the working README commands without duplicating an incomplete command chain.
4. **Add dependency scanning (#18).** Add a CI step for the locked Respin workspace using `pnpm audit` (with an agreed severity threshold and an explicit exception process). Verify it runs on pull requests and fails on an introduced high/critical vulnerability; do not claim coverage for packages outside the Respin path unless a separate job scans them.
5. **Add license/proprietary notice (#19).** Apply D-AUDIT-4 at repository root and make the notice consistent with the chosen distribution posture.
6. **Make auth rate limiting explicit (#20).** Inspect the installed Better Auth 1.6.28 types before coding. Configure a durable production limiter for sign-in/sign-up/reset-sensitive endpoints, or add a small DB-backed boundary limiter if the adapter does not provide the needed storage. Add tests that exercise the configured limiter in the same environment shape used by production; development/test behavior must be intentional rather than an undocumented default.
7. **Apply retention policy (#21).** Record the 90-day policy now; add the M6 receiver/maintenance task for redaction or deletion of old payloads, including null-workspace and post-deletion rows. Until that receiver exists, prohibit new product surfaces from exposing `stripe_events.payload`.
8. **Add fold observability (#22).** Instrument the balance authority with workspace-scoped row count and fold-duration measurements without logging customer PII. Add the 10,000-row / 250-ms-p95 revisit trigger to the decision entry and operational dashboard/backlog.

**Acceptance criteria:** a stranger can execute the Respin quick-start; CI includes vulnerability scanning; the license posture is explicit; auth limiting is durable and tested; rollback means a documented, tested restore; and the restore drill proves the money dataset can be recovered before production deployment.

### R4 — Documentation cleanup and readiness closeout

**Depends on:** R1–R3.  
**Primary files:** `RUNBOOK.md`, `NORTH_STAR.md`, `docs/initial/decisions.md`, `respin/tests/**`.

1. Fix the contradictory UGC rollback text (#12): scope “none found” to the Respin subsection and preserve the runnable UGC procedure.
2. Qualify generic `RUNBOOK.md` headings as UGC-only where they describe the parked product line (#13).
3. Update the Accounts “Last reviewed” date whenever the Accounts table changes (#14).
4. Run a source/document consistency pass so the runbook reflects the final backup, restore, rollback, CI scan, incomplete-subscription, auto-top-up, and retention behavior.
5. Add a short audit-closure record mapping each finding to its code diff, decision, test, or owner-gated evidence. Findings that are not yet verifiable because Lightsail is unprovisioned must remain explicitly marked as blocked by deployment setup, not marked complete.

**Acceptance criteria:** the runbook contains no contradictory Respin/UGC instructions, every finding has a closure reference, and the final report card distinguishes engineering proof, CI proof, and owner-credential/deployment evidence.

## Dependency order and parallelism

```text
R0 ──┬── R1 ──┬── R2 ──┐
     │        └── R3 ──┴── R4 ── final readiness review
     └── M2 profile-cage entry gate
```

R1 is the critical path for all future M2/M3 work touching billing. R2 and the non-backup portions of R3 can proceed in parallel after R1's shared predicates settle. The backup/restore portion of R3 is externally gated by the Lightsail/Postgres deployment decision and cannot be claimed complete from local Docker volume tests.

## Verification commands

Run the normal Respin gate after each code phase:

```text
pnpm -C respin typecheck
pnpm -C respin lint
pnpm -C respin test
pnpm -C respin db:check
pnpm -C respin build
```

Run the money-path proof with real Postgres and confirm the Docker suites do not loud-skip:

```text
TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin test
pnpm -C respin --filter @respin/db test:concurrency
```

Also verify the new CI audit step, the restore drill against an isolated database, and the relevant UI tests for auth/config/billing accessibility. Use the installed Stripe and Better Auth types as the API authority; do not infer SDK payload shapes from memory.

## Finding coverage

| Audit items | Receiving phase | Closure proof |
|---|---|---|
| 1–7 | R1 | Money-path tests, differential webhook races, and decision D-AUDIT-1 |
| 8 | R2 | Incomplete-state UI/action test and retained duplicate-checkout guard |
| 9–11 | R3 | Backup/restore evidence, rollback runbook, working quick-start |
| 12–14 | R4 | Runbook consistency diff and reviewed Accounts date |
| 15–17 | R2 | Component/UI accessibility assertions |
| 18–21 | R3 | CI audit output, license notice, limiter test, retention decision/receiver |
| 22 | R0 + R3 | Decision threshold plus fold metrics |
| 23 | R0 | M2 profile-cage design and entry gate |
| 24–29 | R1/R2 | Typecheck, focused money/UI tests, and concurrency coverage |
| 30 | R0/R4 | Resolved NORTH_STAR citation |

## Stop conditions

- Do not start M2 implementation until R0's `VerifiedProfileId` design and the D-AUDIT-1 invoice policy are recorded.
- Do not wire M3's debit-triggered auto-top-up until R1 closes #6 and #7 and the differential webhook suite is green.
- Do not make a first production deploy until #9 has a successful restore drill, #10's restore-based rollback is documented, and #18's CI scan is active.
- Do not claim the audit is fully closed while the deployment-gated evidence remains unrun; report it as owner/deployment blocked with the exact missing demonstration.
