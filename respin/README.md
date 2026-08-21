# Respin — dev & deploy runbook (M0–M1)

Self-rooted pnpm workspace (decision R-15/R-16): nothing in here references the
enclosing repo. Product docs live at `../docs/initial/` (PRD, tech-spec,
build-plan, decisions).

## Layout

```
app/             Next.js 15 App Router — (marketing) /, (auth) /sign-in /sign-up,
                 (product) /studio /usage /settings/billing,
                 (admin) /admin /admin/config      [route groups are URL-invisible]
lib/             route-boundary constants (middleware deploys these directly)
packages/db      @respin/db — Drizzle schema (domain + auth + billing tables), migrations,
                 seed, tenancy helpers (withWorkspace + its scoped accessors)
packages/auth    @respin/auth — Better Auth instance, requireUser/requireAdmin (THE gate,
                 server layer, fail closed); middleware is an optimistic cookie redirect only
packages/config  @respin/config — the versioned runtime config (credit costs, allowances,
                 pack price, grace/pause bounds, Stripe price map); append-only versions
packages/credits @respin/credits — the credit ledger and its ONE balance authority, the
                 Stripe adapter, webhook handlers and the owner-gated billing actions
```

Rule: `app/` imports only the sanctioned surfaces — `respinDb` /
`WorkspaceAccessError` / types from `@respin/db`, `@respin/credits/app-server`,
`@respin/config/app-server` (and `@respin/config/admin-server` from
`app/(admin)/**` only) — enforced by a default-deny lint plus a dynamic-import
source scan. Every query is workspace-scoped through `withWorkspace` (tenancy
T1); the balance is always `deriveBalance`, never arithmetic in a page.

## Local dev

```bash
pnpm install
docker compose up -d         # local Postgres (port 5435; see docker-compose.yml)
cp env.example .env.local    # then fill values (the local DATABASE_URL is inside)
DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm db:migrate
DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm db:seed
pnpm dev                     # `next dev` DOES read .env.local; the CLIs above do not
```

**Why the two CLI lines carry `DATABASE_URL` inline:** only Next reads
`.env.local`. `db:migrate` and `db:seed` are drizzle-kit/tsx processes and see
the shell's environment only — found by running this runbook, not by reading it
(evidence run, 2026-08-17). `pnpm stripe:setup` is the exception: it loads
`.env.local` itself, because the billing section below tells the operator to put
the key there. **Never pipe `pnpm dev` through `head`** — when `head` exits the
pipe closes and the dev server dies mid-session, answering a few requests and
then hanging every one after.

Checks (same set CI runs): `pnpm typecheck && pnpm lint && pnpm test && pnpm db:check && pnpm build`
— you should see all five exit 0. Tests run against in-process PGlite (R-17): no
database setup needed.

The two `*.docker.test.ts` suites are the exception: they need real Postgres and
LOUD-SKIP without it. They are what proves the ledger's money invariants under
true concurrency, so run them too:

```bash
TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm test
```

Each suite creates and resets its OWN `respin_test_*` database (a name
whitelist refuses anything else before connecting — the harness drops schema
public).

## Services (R-18: self-hosted — Lightsail + Postgres)

1. **Database — DONE for dev**: `docker compose up -d` runs Postgres 17 on
   port 5435 (container `respin-postgres`, volume `respin-pgdata`); migration
   and seed are applied and verified. Production Postgres lives on/alongside
   the Lightsail host — provisioning runbook lands with the first deploy plan.
2. **Auth — Better Auth, fully self-hosted (R-19)**: sessions and auth tables
   live in our own Postgres; email/password works with zero third-party
   accounts. Set `BETTER_AUTH_SECRET` (e.g. `openssl rand -base64 32`) and
   `BETTER_AUTH_URL=http://localhost:3000` in `.env.local`. You should now
   see: `pnpm dev` → create an account at `/sign-up` → land on `/studio`
   showing "<name>'s workspace" → sign out returns to `/`. Google sign-in is
   optional (add the OAuth client credentials; the button appears only when
   configured). Admin: after signing up, copy your id from the `user` table
   into `ADMIN_USER_IDS` — an empty allowlist denies everyone, by design.
3. **Deploy — Lightsail**: deploy shape (container service vs instance, TLS,
   backups) is decided and documented when the first deploy is planned. The
   path-scoped GitHub Actions CI (`.github/workflows/respin.yml`) is
   deploy-target-independent and unchanged.
4. **Billing — Stripe test mode (M1)**: everything below is optional for
   development — with no keys the app builds and runs, `/usage` and
   `/settings/billing` render, and every billing control is disabled with the
   remedy printed next to it instead of throwing when clicked. To exercise the
   real flow (each step's **success check** is what "done" means for it):

   ```bash
   # 0. A Stripe account in TEST MODE. Everything below is test data: no real
   #    money moves, and test-mode cards are documented at
   #    https://docs.stripe.com/testing (4242 4242 4242 4242 is the plain
   #    success card).
   #    Success check: the dashboard's top-left toggle reads "Test mode".

   # 0b. The Stripe CLI (needed from step 5 on, and for the evidence run):
   #    winget install --id Stripe.StripeCli   # or see stripe.com/docs/stripe-cli
   #    stripe login                            # interactive, opens a browser
   #    Success check: `stripe --version` prints a version. On Windows, winget
   #    installs it under %LOCALAPPDATA%\Microsoft\WinGet\Packages\ and it may
   #    NOT be on a Git-Bash PATH; `stripe listen --api-key sk_test_...` works
   #    without `stripe login` if you would rather not authorise the CLI.

   # 1. Test-mode secret key: dashboard → Developers → API keys → "Secret key"
   #    Put it in .env.local as STRIPE_SECRET_KEY (sk_test_...).
   #    Success check: `pnpm stripe:setup` no longer prints the "not set" remedy.
   #    (This script loads .env.local itself — it is the ONE CLI here that does.)

   # 2. Create the product + prices (idempotent — safe to re-run).
   #    Needs DATABASE_URL too: the PACK price is created at the active
   #    config's `pack.priceUsd`, because auto-top-up charges that same number
   #    off-session. Re-running this IS the check that the two still agree — it
   #    refuses with a PRICE DIVERGENCE error naming both amounts if they drift
   #    (a Stripe price amount cannot be edited, so the fix is a new price plus
   #    a stripePriceMap update, and the script says so).
   pnpm stripe:setup
   #    Success check: it prints a JSON stripePriceMap block of price ids.

   # 3. Paste that block into /admin/config as `stripePriceMap` and save.
   #    (Reach it from /admin → "Runtime configuration". You need to be in
   #    ADMIN_USER_IDS — see Services step 2 — or the page returns 404 by
   #    design, which is also what a non-admin POST to its save action gets.)
   #    Paste it INTO the document already in the
   #    textarea, replacing the empty `stripePriceMap` object; the editor
   #    validates the whole document.
   #    Success check: the page reports "Saved as v<N>", the version history
   #    lists the new version with your user id beside it, and v1 is still
   #    listed unchanged — config is append-only, never edited.
   #    Failure check (worth doing once): save deliberately broken JSON. You
   #    should get field-level errors, your text still in the box, and NO new
   #    version in the history.

   # 4. Customer Portal configuration — LOOK AT IT AND WRITE DOWN WHAT IT SAYS.
   #    Dashboard → Settings → Billing → Customer portal.
   #    REQ-G08 says the cancel flow always offers pause first. We enforce that
   #    on OUR cancel path (/settings/billing → "Cancel subscription" shows the
   #    pause offer above the way out, asserted by tests). The portal is a
   #    Stripe surface: it can cancel, it has no pause feature at all
   #    (BillingPortal.Configurations has `subscription_cancel` and no
   #    `subscription_pause` — checked against stripe@22.5.0), and Stripe's own
   #    emails link to it. R-22 records the decision to LEAVE CANCELLATION ON
   #    with its reason; this step exists so the setting is named rather than
   #    inherited from a default nobody looked at.
   #    Success check: record in the ledger, from the dashboard screen —
   #    "Cancel subscriptions: ON" (needed for evidence step 7 below), and that
   #    no pause option is offered there. If cancellation is OFF, turn it on:
   #    evidence step 7 cannot run without it.

   # 5. Forward webhooks to the local app (leave running in its own terminal):
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   #    Success check: it prints `whsec_...` — put that in .env.local as
   #    STRIPE_WEBHOOK_SECRET and restart `pnpm dev`.
   #    Second success check: `/settings/billing` no longer shows the
   #    "Billing is not configured on this server" banner, and the subscribe
   #    buttons are live rather than disabled.
   ```

   The webhook endpoint verifies the Stripe signature and nothing else — it is
   deliberately outside every auth matcher. A bad signature returns 400 and
   records nothing.

   **When you create the PRODUCTION endpoint**, subscribe it to exactly these
   events (`stripe listen` forwards everything locally, so a missing production
   subscription cannot show up in local testing):

   ```
   checkout.session.completed
   checkout.session.async_payment_succeeded   # delayed payments settle HERE —
                                              # without it a slow pack payment
                                              # is taken and never credited
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.paid
   invoice.payment_failed
   payment_intent.succeeded                   # auto-top-up
   customer.updated                           # attribution for the deletion
   customer.deleted                           # cascade (REQ-A04)
   ```

## Recording M1 evidence (owner, test mode)

**This checklist is the ONLY thing that can discharge M1's evidence rows.** The
repo's tests prove the engineering half against constructed events; they cannot
prove that a real Stripe payload has the shape those fixtures assume. Nothing
below may be claimed from a passing test — run it, then record the result in
`../docs/progress/respin-m1/ledger.md`. Engineering completion and evidence
completion are separate claims (build-plan working agreement).

Prerequisites: the five setup steps above done, `pnpm dev` running, and
`stripe listen --forward-to localhost:3000/api/stripe/webhook` running in its
own terminal (leave it visible — every step below should print an event there).

1. **Subscribe at the Creator price** from `/settings/billing` (reachable from
   the header nav on any signed-in page: **Billing**). Test card
   4242 4242 4242 4242, any future expiry, any CVC.
   **Check (amount):** on Stripe's checkout page, **write down the amount it
   says it will charge**, and confirm it matches the Creator price that
   `pnpm stripe:setup` created (re-run the script — it prints each price id's
   amount). This is the only half of the accept-when clause "a test-mode user
   can subscribe at **$10**" that anything can discharge: the page deliberately
   prints no tier price (Stripe is the sole authority for tier amounts — see
   the phase-4 price-honesty entry in the ledger), so if nobody records the
   number here, nobody has checked it.
   **Check (credits):** `stripe listen` shows `customer.subscription.created`
   and `invoice.paid`; `/usage` then shows a balance of **250** credits and one
   `grant` row whose **expiry is one month after the invoice's service period
   end** (not one month after today).
   *(build-plan accept-when: "subscribe → grant"; "see 250 credits")*
2. **Try to subscribe again** while that subscription is live.
   **Check:** `/settings/billing` offers no subscribe button at all — only
   "Manage plan and payment method in the Customer Portal". This is the UI half
   of the double-billing guard.
3. **Buy an overage pack.**
   **Check:** a second row appears (`pack`, **+1,000**, 12-month expiry) and the
   balance is **1,250**.
   *(accept-when: "buy a pack, and see the ledger reflect all of it")*
4. **Re-send a delivered event**: `stripe events resend <event_id>` for the
   `invoice.paid` from step 1.
   **Check:** the balance does **not** change, no second `grant` row appears,
   and the app answers 200. This is the idempotency path, live.
4b. **Measure the real webhook lag — this run is the only place it is
   observable (decision R-24).** For two or three of the events above, compare
   these two timestamps. **Use these two sources and no others** — see the
   warning below.
   - The event's own `created`: `stripe events retrieve <event_id>` (the JSON
     carries `created` as a Unix timestamp).
   - When this app began processing it: `stripe_events.received_at`. Read it
     with
     `docker compose exec -T postgres psql -U respin -d respin -c "select id, type, received_at from stripe_events order by received_at desc limit 5;"`
   **Do NOT use `stripe listen`'s leading per-line timestamp**: that is the
   CLI's *local receipt* time, not the event's `created`, so subtracting it
   measures the CLI→app hop (milliseconds) and yields a number that can never
   trip the threshold below — a check that is performed but cannot fail. (If
   you prefer the CLI, `stripe listen --print-json` does carry the real
   `created`.) There is also **no app log line for a successful event** — the
   webhook only logs on a refusal or a handler error — so `received_at` is the
   processing-side source.
   **Check:** a number is written down in the ledger for each — not "looked
   fine". `CLOCK_SKEW_MS = 60_000` is currently a *guess* doing three jobs on
   the money path (write-clock guard, pause-open staleness bound, pause-close
   staleness bound), and R-24 accepts it only on condition that this
   measurement happens. **If any legitimate event's lag exceeds ~30s, R-24 says
   split the constant** — the delivery-lag tolerance and the clock-skew guard
   stop being the same number. R-24's second trip condition is operational
   rather than numeric: **if any pause or resume in steps 5–6 is refused**,
   that is the same tripwire firing, and it is recorded the same way.
   *(accept-when: "double-delivered webhook (no double grant)")*
5. **Pause the subscription** (1 month) from `/settings/billing`.
   **Check:** `/usage` shows the frozen notice with the resume date; the ledger
   rows' expiry dates are unchanged on screen (the shift is applied at
   derivation time); Stripe shows `pause_collection` on the subscription.
   *(accept-when: "pausing freezes credits")*
6. **Resume it.**
   **Check:** `/settings/billing` returns to `active`, and the credits' expiry
   has moved later by the pause duration. Note the exact before/after expiry
   dates in the ledger entry — this is the accept-when clause that says
   "expiry clocks correctly shifted", and only the two dates prove it.
7. **Cancel from the Customer Portal** — reach it through
   `/settings/billing` → "Cancel subscription", which shows the pause offer
   first (REQ-G08).
   **Check:** the interstitial offers pause **above** the link out; the portal's
   cancel confirmation says the plan runs to the end of the paid period, and
   `/settings/billing` then shows **"This subscription is set to end on
   &lt;date&gt;"** while still serving the paid tier. Once
   `customer.subscription.deleted` arrives at that period end (or immediately,
   if you cancel right away) the page reports the free tier and the subscribe
   buttons come back — a cancelled workspace is not locked out of re-subscribing.
   **Note the date the page shows**: on the API version this app pins, the
   portal expresses a period-end cancellation as `cancel_at`, NOT the legacy
   `cancel_at_period_end` boolean, and reading only the boolean is how the first
   evidence run found the page saying nothing at all (ledger, finding 1).
   *(accept-when: "cancel → downgrade")*
8. **Payment-failed → grace → downgrade** — **this one needs a Stripe TEST
   CLOCK, and the three obvious shortcuts do not work.** All three were tried in
   the 2026-08-17 evidence run and each is a dead end, for a different reason:
   - the failure-on-renewal card 4000 0000 0000 0341 is declined **at Checkout**,
     so no subscription is created and no `invoice.payment_failed` ever exists;
   - `stripe trigger invoice.payment_failed` mints its **own** customer, which
     maps to no workspace (`refused_unknown_customer`), and the invoice it
     builds is not subscription-generated, which `isSubscriptionInvoice` refuses
     by design;
   - `subscriptions update --billing-cycle-anchor=now` generates no invoice, so
     nothing is charged and nothing fails.

   What works is a customer created **with** a test clock, then advancing the
   clock past a renewal whose default payment method is
   `pm_card_chargeCustomerFail`. Our Checkout creates the customer itself with
   no `test_clock`, so there is no route to that through the product today —
   doing this needs either a dev-only customer-creation path that accepts a test
   clock, or waiting for a real renewal.
   **Check:** `/settings/billing` shows the grace state with a deadline
   `graceDays` away; past that deadline the effective tier is free.
   *(accept-when: "payment-failed → grace → downgrade" — recorded PENDING in the
   ledger until a test-clock route exists; do not claim it from the unit tests)*
9. **Debit refused at zero balance** — **not runnable at M1.** The only debit
   caller is the generation pipeline, which ships at M3; the debit API and its
   refusal are tested in `packages/credits`. Record this row as still pending
   rather than claiming it.

Also record, plainly: whether any real payload differed from what the fixtures
assume (the invoice line shape, the checkout session's subscription field, and
the pack settlement events are the three that have already been wrong once).

## Recording M0 evidence

Record in `../docs/progress/respin-m0/ledger.md` when they happen: live
sign-up → shell → sign-out (now runnable locally with zero external accounts —
see Services step 2), and the first Lightsail deploy. Until then the M0 report
card keeps those rows "pending" — engineering and evidence completion are
separate claims (build-plan).

## Teardown

`docker compose down -v` removes the local database (the `-v` deletes the data
volume — deliberate). This directory itself is removable as one tree.
