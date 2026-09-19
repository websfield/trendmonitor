# Persona journeys

Four Playwright specs walk Respin as four people — a solo creator, a Studio
operator, an editor seat and the platform admin — against a real dev server, a
real Postgres and the real Anthropic API. They are the Free-path acceptance
harness (creator-ready Phase 2, ticket T7-A).

**A green run is not a walked product — read the notes.** The journeys record
refusals and continue by design: a run on which the operator's voice build was
refused by the model is green and says so in `studio-operator/console.log`. The
evidence is the notes and the screenshots, not the exit code.

## Run order and processes

The specs run **one at a time, in this order** (persona 3 depends on persona 2's
handoff; the admin needs its own two-start bootstrap):

1. `solo-creator.spec.ts`
2. `studio-operator.spec.ts`
3. `editor-seat.spec.ts`
4. `platform-admin.spec.ts`

Processes that must be running, from `respin/`:

| Process | Command | Notes |
|---|---|---|
| Postgres | `docker compose -f docker-compose.yml up -d --wait` | container **`respin-postgres`** on port 5435 — the specs shell `docker exec respin-postgres psql` for two setup/evidence reads |
| Migrations, seed | `pnpm db:migrate && pnpm db:seed` | the seed's `stripePriceMap` is empty, so every billing control is disabled on a keyless server |
| Dev server | `pnpm dev` | `next dev -p 8000`; `BETTER_AUTH_URL=http://localhost:8000` |
| Worker | `node --env-file=.env.local --import tsx worker/main.ts` | the worker reads `process.env` and has no dotenv (verified 2026-09-15 on Node 24); CI passes env through `$GITHUB_ENV` instead |
| Stripe forwarder | `stripe listen --forward-to localhost:8000/api/stripe/webhook` | **only with `E2E_PAID_TIERS=1`** — never on the Free path |

Then, per spec: `pnpm exec playwright test e2e/journeys/<persona>.spec.ts`, or all
four in order with `pnpm test:e2e`.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server, worker | `postgres://respin:respin_local_dev@localhost:5435/respin` for the bundled compose file |
| `BETTER_AUTH_SECRET` | server | any long random string; CI mints one per run and masks it |
| `BETTER_AUTH_URL` | server | `http://localhost:8000` |
| `ANTHROPIC_API_KEY` | server, worker | the ONE persistent secret; see *How the vendor key is protected* |
| `ADMIN_USER_IDS` | server | the journey admin id — see *Admin identity* |
| `E2E_PAID_TIERS` | spec process | `1` runs the paid chapters; absent, each writes one `[note] skipped: …` line |
| `JOURNEY_RUN_ID` | spec process | **required for local runs**: one id shared by every persona of one run (CI derives it from the GitHub run id and attempt). Without either, the first voice press throws rather than guessing — a shared default would let a stale sibling persona's record from an earlier run pass as this run's |

The only persistent secret is `ANTHROPIC_API_KEY`. Every identity the specs
create uses the committed throwaway password in `e2e/support/auth.ts` and
exists only in your local or the runner's ephemeral database.

## The `E2E_PAID_TIERS` gate

Everything that needs a paid tier — Creator/Studio checkout, the second creator
profile, paste → autopsy → spin, results logging, pause and pack purchase — runs
only when the spec process has `E2E_PAID_TIERS=1`. Absent, the chapter writes
exactly one `[note] skipped: paid tiers not enabled - <chapter>` line (never the
`BLOCKING` prefix) and the journey continues on the Free path it already
handles: the niche block, the withheld results form, the keyless or disabled
billing controls are the asserted states. Setting the flag without a Stripe
forwarder produces a `BLOCKING` checkout note — correct, because the flag claims
paid tiers are enabled.

## Admin identity (the two-start bootstrap)

`/admin` is gated by `ADMIN_USER_IDS`, read from `process.env` at request time
(fail closed), so the admin identity is created by the product's own sign-up
and then allow-listed with a server restart:

1. Start the dev server **without** `ADMIN_USER_IDS`.
2. `pnpm exec playwright test e2e/journeys/platform-admin.spec.ts` — with no
   handoff it signs a fresh identity up, looks its Better Auth id up through
   `docker exec respin-postgres psql`, writes `e2e/journeys/artifacts/_handoff/platform-admin.json`
   and ends in `test.skip` with the id in its reason.
3. Add that id to `ADMIN_USER_IDS` in `.env.local`, restart the dev server.
4. Re-run the spec: it signs in and walks `/admin`, `/admin/config`,
   `/admin/activation` and `/admin/model-spend`.

**The journey admin id and its committed throwaway password belong only in a
local or ephemeral environment, never in a shared or deployed
`ADMIN_USER_IDS`.** Remove a local run's id from `.env.local` afterwards. (The
owner accepted the local known-password identity with exactly this note,
2026-09-15.) CI performs both starts itself: a first server with no allowlist,
the bootstrap spec, `jq -er '.authUserId | strings'` on the handoff, the id
exported to later steps, the first server stopped by process group and its
port confirmed refused, then the real start.

Better Auth's database-backed limit is **10 sign-ups per hour** per database
(`packages/auth/src/create-auth.ts`); a full run signs up about four identities,
so at most two full local runs per hour against the persistent dev database.

## How the vendor key is actually protected (CI)

- `ANTHROPIC_API_KEY` lives **only** as an environment secret on the GitHub
  Environment named **`journeys`**, whose deployment-branch policy admits
  **`main` only**. GitHub issues environment secrets solely to jobs that
  declare that environment (docs.github.com, *Deployments and environments*:
  "Secrets stored in an environment are only available to workflow jobs that
  reference the environment" — read 2026-09-19).
- **There is no repository secret of that name.** That half is witnessed by the
  `no-repository-secret` canary job in `.github/workflows/respin-journeys.yml`:
  it declares no environment and fails when the key is issued to it, and the
  `journeys` job `needs:` it, so nothing is spent while the property is violated.
  Until the first dispatch runs green, treat it as an owner-attested
  prerequisite; the canary's first green is the running proof.
- The `journeys` job declares `environment: journeys`. Its
  `if: github.ref == 'refs/heads/main'` line is a **courtesy** that makes an
  off-`main` dispatch skip visibly; `workflow_dispatch` runs the file from the
  selected ref, so a branch could delete that line — the Environment is the control.
- Within the run the key reaches **step 6 only** (`start`, plus a presence
  check just before it). Dependency lifecycle scripts, `playwright install`,
  the bootstrap step and every third-party action never see it.
- Both step-6 process groups (dev server, worker) are verified **absent** by
  the cleanup step before anything is scanned or uploaded: TERM, a 35 s poll of
  group liveness (not the port, not the launcher pid), KILL, a 10 s poll, then
  the port must refuse connections. A failed cleanup leaves `safe_to_upload`
  unset and **suppresses every upload**.
- The bootstrap server's group is handled the same way by its own step: its id
  is recorded before any check can fail; after the spec the step sends TERM,
  waits for the port to refuse, then polls `pgrep -g` for the group to be empty
  (TERM 35 s, KILL, 10 s) and drops the record **only once the group is
  verifiably empty**. Any failure leaves the record in place, so cleanup sweeps
  that group too (it lists `bootstrap web worker`).
- `tests/journeys-workflow-triggers.test.ts` extracts the bootstrap, `start`
  and `cleanup` shell from the workflow and runs it against synthetic Linux
  processes — including a bootstrap server that closes its port but ignores
  TERM (KILL path), a live bootstrap group left behind by a failed step, and
  the mutants that drop the record early or forget the group; the workflow
  runs that test before `start` and fails if it is skipped.
- Third-party actions are pinned by commit SHA.

## Artifacts

Per persona, under `e2e/journeys/artifacts/<persona>/`: `console.log` (page
console, page errors, failed requests, `[note]` lines, one `[screenshot]` line
per capture) and `screenshots/NN-<name>.png` (full page). Uploaded artifacts
therefore contain **full-page screenshots and console logs of the synthetic
personas' brain documents and drafts** — vendor output about fictional people,
not customer data. Handoff files (`_handoff/`, they carry the personas'
credentials) are deleted before the scan and excluded from upload in every
outcome. Per-persona HTML reports land in `playwright-report/<persona>/`
(`playwright-report/bootstrap/` for the admin bootstrap). Inside each report,
`data/` holds Playwright's attachments: trace zips are excluded from upload,
but a failed test's `error-context.md` (an ARIA snapshot of the page) and its
failure screenshots are uploaded — the same class of content as the full-page
screenshots above. Fill-step titles in `index.html` may carry the committed
throwaway password. The bootstrap's `test.skip` reason carries the run's admin
id (an identity that dies with the runner's database).

The specs import no `@respin/*` package. `solo-creator.spec.ts` imports one
`app/` module, `app/(marketing)/audiences.ts` — plain constants with no imports
of its own — to enumerate the `/for/<slug>` pages.

Each persona has one **main-chapter** screenshot (`e2e/support/main-chapters.ts`)
that a green run must contain; `scripts/scan-journey-notes.ts` fails the run on
a missing one, on any `[note] BLOCKING…` line, or on a surviving handoff file.

### The consumption manifest (separate artifact)

Every voice-build press writes a structured record under
`e2e/journeys/artifacts/consumption/<persona>-<press>.json` — `unknown` before
the press, replaced after it settles — carrying only
`{runId, persona, pressOrdinal, profileId, attemptId, outcome, consumed}`.
`consumed` is decided from the database's own claim (`first_billable_attempts`)
and `model_usage` rows read before and after the press, never from the refusal
code. CI validates these and uploads **one** re-serialised `consumption.json`
as `consumption-<run id>-<attempt>` even when the behavioural scan fails (the
raw records never ship). To reconcile locally:

```
pnpm exec tsx scripts/scan-journey-notes.ts --consumption-evidence e2e/journeys/artifacts <empty dir> --run-id <JOURNEY_RUN_ID>
```

**Before any next dispatch:** download the manifest from the Actions run and
read `complete`, `unknownCount` and `consumingRefusals`. An `unknown` record, a
missing persona, a rejected manifest or an unavailable artifact means the run
is **unreconciled** — it never counts as zero and never authorises another
dispatch. The closing demonstration counts consuming refusals (a terminal
`refused` with `consumed: true`) across runs; it stops at **two refusals across
three dispatches**.

## Spend ceiling (enabling `schedule`)

The nightly `schedule` trigger stays commented out in
`.github/workflows/respin-journeys.yml` until this section records:

- the owner-side vendor spend limit set on the key (from the Anthropic console), and
- the measured spend of the first green dispatch (from `/admin/model-spend`).

Spend limit: _not yet recorded_. First measured run: _not yet run_. Each
`workflow_dispatch` also costs roughly 15–25 hosted-runner minutes.
