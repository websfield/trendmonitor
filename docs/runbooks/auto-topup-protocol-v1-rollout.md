# Auto-top-up durable-attempt rollout (v1)

This is a one-way, maintenance-window cutover. Migration 0048 is expansion-only:
it leaves the legacy charge bit and protocol-0 defaults intact. The application
returns `rollout_pending` until an operator proves the old fleet is quiescent,
reconciles every legacy Stripe PaymentIntent, and activates v1.

## Immutable key contract

Before migration, create `RESPIN_AUTO_TOPUP_AUTHORITY_KEY` as a random secret of
at least 32 characters. Store the same value in the runtime secret manager and
in the encrypted, restore-tested backup set outside PostgreSQL. Never print it,
commit it, or put it in an incident ticket.

Protocol v1 has the immutable key id `v1`. Drain binds a non-secret SHA-256
fingerprint into the rollout row. Activation and every new reservation refuse if
the configured key differs. Do not rotate or delete this key while any v1 Stripe
event can be delivered or replayed. Rotation requires a new protocol/key id and
a reviewed keyring migration; replacing the value under id `v1` is unsupported.

Drain also binds the authenticated Stripe account id and livemode. Set
`RESPIN_STRIPE_ACCOUNT_ID` to the expected `acct_...` id and
`RESPIN_STRIPE_LIVEMODE` to exactly `true` or `false`. The Stripe secret key may
rotate, but every replacement must authenticate to that same account and mode;
the runtime refuses provider reads and charges if either identity changes.

## Cutover

1. Back up PostgreSQL and the v1 authority key, and verify both restore paths.
2. Apply migration 0048 while the old fleet is still running. Confirm `pnpm
   stripe:auto-topup:rollout -- status` reports `expanded`.
3. Deploy the new build, but do not activate yet. In `expanded`, new code stages
   owner opt-ins without charging and old code may continue using the legacy bit.
4. Start a maintenance window. Stop all HTTP ingress, Stripe webhook consumers,
   workers, and every old/new application process that can invoke billing. Record
   the UTC instant when the last process stopped.
5. With the fleet still stopped, immediately run the fenced command below. Its
   first run records a database-authored drain fence and will refuse the audit
   until that fence has remained closed for 300 seconds. This is the pinned
   Stripe maximum call window (250 seconds) plus the reviewed 50-second safety
   margin. The supplied timestamp is audit evidence only; it cannot shorten the
   database-enforced wait.
6. Keep the fleet stopped. After the command's reported wait has elapsed, first
   run the account-wide v1 recovery scan while the rollout remains fenced in
   `draining`:

   ```bash
   DATABASE_URL=postgres://... STRIPE_SECRET_KEY=sk_... RESPIN_STRIPE_ACCOUNT_ID=acct_... RESPIN_STRIPE_LIVEMODE=false RESPIN_AUTO_TOPUP_AUTHORITY_KEY=... pnpm stripe:auto-topup:reconcile-v1
   ```

   Do not proceed until it prints `clear: true`. This scan is mandatory even on
   a first cutover: a point-in-time restore or lost local write can leave a
   signed v1 PaymentIntent at Stripe with no local pending row. The command may
   settle a real succeeded event or cancel a known failed intent, but it cannot
   create a charge. Its `rolloutRevision` must still match the current `status`.
7. Run the cutover command again with the same stop timestamp:

   ```bash
   DATABASE_URL=postgres://... STRIPE_SECRET_KEY=sk_... RESPIN_STRIPE_ACCOUNT_ID=acct_... RESPIN_STRIPE_LIVEMODE=false RESPIN_AUTO_TOPUP_AUTHORITY_KEY=... pnpm stripe:auto-topup:rollout -- cutover --fleet-quiesced-at=2026-09-06T00:00:00.000Z
   ```

   The command paginates the entire bound Stripe account, verifies both legacy
   and signed-v1 identity and ledger settlement, retrieves the real
   `payment_intent.succeeded` event for a legacy success whose webhook was lost,
   replays that provider event through the normal idempotent handler, and only
   then activates v1. It never logs the HMAC key and never writes a ledger row
   manually.
8. If either command reports blockers, leave the fleet stopped. Remaining named nonterminal
   intents must be deliberately canceled or settled; never repair the ledger by
   hand. A `post_drain_legacy_intent` means the old fleet was not quiescent:
   stop it, run `restart-drain` with the new stop timestamp, keep the fleet down
   for the new 300-second database barrier, then rerun `cutover`. `audit` is
   available for a read-only recheck.
   An `orphaned_customer_mapping` must be repaired from provider/account records
   before retrying; the account-wide audit intentionally does not trust the
   possibly restored or stale local mapping as its provider population.
   A `v1_provider_not_terminal` or `v1_succeeded_without_ledger` requires
   `stripe:auto-topup:reconcile-v1`; activation deliberately refuses while
   either provider-carried authority remains unresolved.
9. When the command prints `state: active`, run `status`, verify the stored key id
   is `v1` and the proof timestamps are ordered, then start only the new build.
   Exercise one test-mode auto-top-up and verify one PI, one webhook receipt, and
   one ledger row share the same attempt id.

## Rollback and recovery

After activation, never restart an old webhook or billing build. Although the
database permanently fences its legacy charge bit, an old webhook cannot settle
v1 signed attempts. Keep the new billing/webhook handler running and roll forward
with a fix; non-billing application processes may be isolated separately only if
their deployment supports that split.

After a point-in-time database restore, keep all ingress, webhook consumers, and
billing-capable processes stopped. Restore the exact v1 HMAC key first and the
expected Stripe account/mode bindings. Then inspect rollout `status`:

- `expanded`: run `cutover` once with the current fleet-stop timestamp to enter
  `draining`, wait for the reported database fence, and continue below.
- `draining`: run `restart-drain` with the current fleet-stop timestamp, wait for
  the new database fence, and continue below. This invalidates any stale audit
  from the restored snapshot.
- `active`: do not downgrade the row. Keep traffic stopped and continue below.

Run the account-wide recovery scan:

```bash
DATABASE_URL=postgres://... STRIPE_SECRET_KEY=sk_... RESPIN_STRIPE_ACCOUNT_ID=acct_... RESPIN_STRIPE_LIVEMODE=false RESPIN_AUTO_TOPUP_AUTHORITY_KEY=... pnpm stripe:auto-topup:reconcile-v1
```

The command paginates the bound Stripe account as well as every local pending
attempt. It replays the one real succeeded event through the normal webhook
transaction and cancels or retires known failed intents. A previously recorded
`refused_unknown_customer` or `refused_identity_mismatch` receipt is final by
project canon: repairing a mapping does not reinterpret that receipt and never
mints credits from it. Keep authority fenced and resolve or refund that charge
at Stripe; changing this behavior requires an explicit owner decision and a new
reviewed receipt-state design. `awaiting_provider_visibility` means a local attempt is still inside
the conservative idempotency window or has not appeared at Stripe;
`awaiting_provider_terminal` means an exact intent is still processing. Either
outcome makes `clear: false`: do not buy another pack, retry generation, clear a
claim, or mint credits manually. Repair mappings or wait for terminal provider
state, then rerun the command. After 23 hours, a provider-absent attempt is
retired only after the command replaces its dispatcher claim and completes a
second empty account proof.

For an `expanded` or `draining` restore, after recovery prints `clear: true`, run
`cutover` again. Its fresh account-wide audit must also be clear and its revision
must match the current drain before it can activate. For an `active` restore,
verify a second recovery run is still clear. Only then restart the new build and
webhook consumers. Never start traffic merely because the restored row says
`active`; provider truth may be newer than the restored database.

A succeeded PaymentIntent carries signed amount, currency,
pack credits, validity, config version, customer, workspace, month, and attempt id,
so the new webhook can reconstruct a settlement even if the pending/config rows
were created after the restored snapshot. A fingerprint mismatch is a hard stop:
recover the backed-up v1 key; do not edit the rollout row or mint manually.
