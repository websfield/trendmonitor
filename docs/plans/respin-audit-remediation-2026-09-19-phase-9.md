# Phase 9 — Operability truth and the dependency floor

Depends on: Phases 1, 3, 4, 5, 8, 11 (the ORM bump is the last money-touching change, so its gate re-runs nothing — Phase 8 edits `packages/credits/src/{clock,balance,stripe/customers}.ts` and Phase 11, split from 8, edits `packages/credits/src/mode-access.ts` under its own billing full gate, so both precede it; Phase 1 for the shared source walker row 1 consumes. **Not Phase 10:** it edits only `app/**` a11y attributes and a marketing layout, touches no money path, and this phase consumes nothing it produces). Owner: `respin-engineer`. Est. 5–7 h. **Amended 2026-10-05: this file now holds Phase 9a (depends on none; runs second; est. 5–7 h) and Phase 9 (the dependencies above; runs last; est. 4–6 h). Both are estimates.** See the split section below.
**Read first:** the codebase review §4's scope boundary — **deploy-side closure is not in this phase**, and §2's supply-chain paragraph (one bump answers both the advisory and the unmet peer).

## 2026-10-05 split — Phase 9a runs second; the rest of Phase 9 stays last

The 2026-10-05 register (`docs/progress/audit/2026-10-05.md`) ranks the restore drill **CRITICAL** (item 3). Its PASS was shown to be vacuous by execution, and it says to "pull the drill fixes forward of the rest". It also says the dependency-exception file's review trigger fired seven weeks ago (item 13). Neither needs anything a money phase builds. Only the ORM bump has to stay the last money-touching change. So this file now holds **two phases, run at two points in the serial order:**

- **Phase 9a — the drill, the env authority and the gate witnesses. Runs second, after Phase 1. Depends on: none.**
  - **Requirements.** P9-R3 and P9-R4 (moved unchanged), P9-R8 (T-23/T-24; register item 32 says these rows are owed now), P9-R10 and P9-R11 (moved unchanged), and **P9-R9's re-dating clause only.** `SECURITY-EXCEPTIONS.md` is re-dated now, records the missed M2 trigger as missed, and gets a new trigger: Phase 9's bump landing. The `drizzle-orm` row stays until that bump. Plus P9-A1, P9-A2, P9-A3, P9-A4 and P9-A7 below.
  - **Rows.** 2 (the drill section and env block only), 3 (MinIO, the digest pin and the loopback bind), 4–7, 13, 14, 16 and 22 (the `license` field only), 18 (re-date only), 19–21, and 23–31.
  - **ACs.** AC1 (the two recovery scripts' invocations only), AC3, AC8, AC9, AC11, AC13–AC16 and AC19.
  - **Est. 5–7 h** (an estimate).
  - **Gate: Respin brain tenancy, separate full gate.** The expiry refusal and the journal verification are the erasure guarantee's last line (REQ-A04). Billing is **not** selected: no money-path code changes, and the money-table check is a read-only `count(*)` inside an ops script. The card says so, so the billing reviewer can contest it.
  - **Why a split and not a move into Phase 1.** Phase 1 is mid-gate with unreviewed repairs and sits at 42 rows. Moving these 22 rows there would make it about 64 rows under a gate whose selection (compliance, learning, tenancy) does not read shell scripts or CI. The split reuses this file's requirement text by reference. It adds one gate run and no new document.
- **Phase 9 (the remainder) — runs last, unchanged in position. It depends on Phase 9a as well as on the phases below.** The two share rows 2, 3, 16 and 18. 9's bump removes the `drizzle-orm` row that 9a re-dated. 9's `runbook-counts.test.ts` (row 1) counts the runbook sections and the `docker-compose.yml` services 9a adds. So 9 starts only after 9a's gate reports.
  - **Requirements.** P9-R1, P9-R2, P9-R5, P9-R6, P9-R7, P9-R9 (the bump, the `sharp`/`postcss` decision, the removal of the `drizzle-orm` row), P9-A5 and P9-A6.
  - **Rows.** 1, 2 (everything but the drill section), 3 (the `:15` count only), 8–12, 15–17 (the version, the overrides and P9-A5/A6's root scripts), 18 (the row removal), and 32–34.
  - **ACs.** AC1 (the rest), AC2, AC4–AC7, AC10, AC12, AC17 and AC18.
  - **Gates** as written below.

## Objective

Two things, joined because neither touches product code and both are about the repo telling the truth about itself.

**Operability.** The ops room's verdict: "the docs are honest about what is unbuilt and stale about what is." `RUNBOOK.md`'s first command is not runnable — `pnpm -C respin typecheck && lint && test && build` runs three bare host commands when pasted — and it omits `preflight` and `worker:typecheck`, the latter flagged in CLAUDE.md as **not** covered by the entry-gate typecheck, so a reader who runs the runbook's gate can ship a worker that does not compile. It says "the two Docker concurrency suites" where there are 23 `*.docker.test.ts` files, several money-path. It never mentions `max_locks_per_transaction=512`, a setting this repo already diagnosed once ("every one failed with 'out of shared memory'") — and the restore drill is exactly where a fresh target gets created at defaults. It never mentions `worker:start`, so the process running the retention sweeps, the deletion tick, autopsy dispatch and the activation emitter is never started anywhere in the operating manual. And the drill itself has a circular remedy: for a backup older than migration head it says `db:migrate` then re-run, while every run re-drops and re-restores the same dump — with 62 migrations in five weeks, practically every backup more than a day old is unpassable.

Four findings across two audits are drifted **counts** in `RUNBOOK.md`, every one mechanically checkable. The audit's own closing note: a test asserting the runbook's counts against the tree "is the single highest-leverage thing on this register per hour spent." It ships here.

**Dependencies.** Four high-severity advisories are open a month past a trigger the exception file wrote for itself ("before the first production deploy, or M2 entry… the `drizzle-orm` row should not survive to a second review"). M2 entry happened 2026-08-27. CI has been green **by exception, not by remediation**, and the audit is event-driven only — no `schedule:`, no dependabot, no renovate — which is precisely how it aged a month.

## Critical Paths touched and gate selection

| Path | Why | Verdict owed |
|---|---|---|
| Respin billing & credits | the ORM under the ledger and every money query | 1 (**separate full gate**) |
| Respin brain tenancy | the ORM under every scoped query and the auth adapter | 1 (**separate full gate**) |

Two verdicts, both full gates. The bump is the reason both fire; the document work fires neither on its own.

## Requirements

### Operability (local halves only)

- **P9-R1 (D8, MEDIUM).** `RUNBOOK.md`'s entry gate is a runnable command, and includes `pnpm -C respin preflight` and `pnpm -C respin worker:typecheck`.
- **P9-R2 (the instrument — the audit's highest-leverage item).** A test asserts `RUNBOOK.md`'s stated counts against the tree: migrations, `*.docker.test.ts` files, frontend test files, and the milestone string. The repo already tests a document's shape (`tests/shell-scripts.test.ts`), so this is a pattern, not a new idea. `docker-compose.yml:15`'s third stale count ("the nine .docker.test.ts suites" — `:12` is the service line; corrected here to match row 3) is corrected in the same change.
- **P9-R3 (D7, HIGH).** The recovery commands run as written: seven required inputs, zero documented today. `backup.sh` needs `DATABASE_URL`, `BACKUP_DIR`, `BACKUP_PASSPHRASE_FILE`; `restore-drill.sh` needs `BACKUP_FILE`, `BACKUP_PASSPHRASE_FILE`, `MAINTENANCE_URL`, `RESTORE_SERVING_DISABLED=confirmed`. Both abort on line 28 under `set -euo pipefail`. The usage block exists at `backup.sh:17-21` and the runbook neither reproduces nor links it.
- **P9-R4 (REG-20 a/c, CRITICAL — the code half).** The drill's circular remedy goes: **restore → `db:migrate` the drill database → verify**, instead of "migrate then re-run" against a run that re-drops and re-restores. A documented **local-drill mode** exists, so the drill is runnable by a stranger with no cloud account, which is also the precondition for ever recording a real transcript. **Permitted is not provided (generalist BLOCK 3):** `deletion-journal-s3.ts:77-80` admits a loopback endpoint, but `restore-verify.ts:58-70` throws unless `RESPIN_DELETION_JOURNAL_BUCKET`, `_REGION` and `_ENVIRONMENT` are set, and `docker-compose.yml` runs only `postgres:17-alpine` — nothing serves S3 on loopback. **The provider, chosen: a MinIO service in `docker-compose.yml` under a compose profile (`profiles: ["drill"]`, so `docker compose up -d` is unchanged and the drill runs `docker compose --profile drill up -d`), with an init container that creates the journal bucket with versioning and Object Lock (`mc mb --with-lock`), and the env block (`RESPIN_DELETION_JOURNAL_BUCKET/_REGION/_ENVIRONMENT/_ENDPOINT=http://127.0.0.1:9000` plus the MinIO access keys) in `RUNBOOK.md`'s drill section.** Chosen over a filesystem journal transport because it is the smaller change *and* the truer one: the filesystem alternative is two new transports (`JournalWriterTransport`, `JournalVerifierTransport`, `deletion-journal.ts:198,222`) plus a selector in `deletion-journal-compose.ts:75` and `restore-verify.ts:124-131`, none of which production would ever run — while MinIO exercises the real S3 verifier (`s3JournalVerifier`, list-versions, `If-None-Match`, checksums) through the loopback path the writer already permits, and `restore-verify.ts` needs no code change beyond honouring `RESPIN_DELETION_JOURNAL_ENDPOINT`, which it already does (`:126-130`). **Which of the drill's assertions run in local mode — all of them:** step 3 (every journal record reads, checksums, chains), step 5a (the restored database is not ahead of the journal and claims no operation the journal lacks), the retention read, and the migrate-then-verify ordering — against whatever the local worker journalled before the backup was taken; on an empty local journal steps 3 and 5a are vacuously green, so the runbook's drill section seeds one local deletion request first and the card records the non-zero journal count it verified against. **The seeding step's prerequisites, named in the drill section's env block (batch-1 generalist MEDIUM — the earlier text named the verifier's env only, and the seed cannot be made under it):** (a) **`RESPIN_DELETION_REQUEST_SCOPES=workspace`** on the app process — unset, no deletion can be requested at all: `account-view.tsx:45-46` renders the request controls closed, and `deletion-request-enablement.ts:15` names the flag (allowed values `identity,profile,workspace`, `deletion-request-enablement.test.ts:39`); (b) **the journal env on the writer side, on both processes** — the app resolver (`deletion-journal-compose.ts:94`) and the worker (`worker/deletion-lifecycle.ts:88`) each call `parseDeletionJournalEnv` (`deletion-journal-compose.ts:56-73`), which reads `RESPIN_DELETION_JOURNAL_BUCKET`, `_REGION`, `_ENVIRONMENT` (all three or none, `:63-66`) and `_ENDPOINT` (`:60`), so the same four names the verifier reads must be exported to the app **and** to `worker:start`, or the request journals to the `unavailableDeletionJournal` (`:79`) and there is nothing to verify; (c) **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`** (MinIO's root user and password) in the shell of all three processes — neither the writer transport (`composeDeletionJournal:78-84` hands the factory `{ region, endpoint }` only) nor the verifier (`restore-verify.ts:124-130` passes `region` and `endpoint`, no `credentials`) sets `createS3JournalClient`'s optional `credentials` (`deletion-journal-s3.ts:47-51`, "omitted in production so the SDK resolves the instance role"), so locally the SDK's default chain must find the keys in the environment. **`forcePathStyle` is not set, and the endpoint is the IP form on purpose:** the SDK addresses a bucket virtual-host style (`<bucket>.<host>`) unless the host is an IP literal, in which case it uses path style — so `http://127.0.0.1:9000` works as written, while `http://localhost:9000` would resolve `<bucket>.localhost` and fail; `createS3JournalClient` accepts `forcePathStyle` (`deletion-journal-s3.ts:46`) for a hostname endpoint, and the runbook says which form it uses and why. The loopback admission itself is `deletion-journal-s3.ts:77-81`. `max_locks_per_transaction` is documented in Deploy and in the restore ordering. R-147 amends R-124 / plan C4.
- **P9-R5 (REG-24, HIGH).** Worker start failure emits its reason. `worker/main.ts:69-75` writes only `{"code":"worker_start_failed"}`; the env refusals it discards carry variable names only and are content-safe (`worker/env.ts:20,30`). With systemd's start limit a stranger gets a `failed` unit and no cause, while `main.ts:30-31` claims it "fails loudly at boot" — it fails, not loudly. Confirms open item 8c-W3.
- **P9-R6 (REG-23, HIGH — the local half).** A reader of `system_worker_health` exists under `respin/app/` and the `heartbeat_age` query is a surface rather than a manual SQL paste. **Paging above 90 s is deploy-side and goes to `todos.md` T-24.**
- **P9-R7 (D9, D10, REG-25, REG-26).** `RUNBOOK.md` gains Respin-level headings for Rollback, Configuration, Observability and Backup & restore — today six of ten `##` headings belong to the parked product, and a reader scanning for "Backup & restore" lands on trend-monitor state-file instructions. `worker:start` appears. `ANTHROPIC_API_KEY` stops being both live and arriving-with-M3/M4 eleven lines apart. `GOOGLE_CLIENT_ID`/`_SECRET` join the config inventory. The `journal:forecast` section stops stating a false cause — a reviewed price snapshot **is** in this repository (`reviewedAt: 2026-09-08`) and the withholding is the unset region alone — and names `--region`, `--owner-ceiling-cents` and the `--measured-*` trio. The money-path cutover runbook and the vendor-acceptance walks are linked; `journalctl -u respin-worker` appears; `backup.sh`'s host-side tool requirements are listed; the header's "M0 + M1" and "11 migrations" are corrected. The audit step's `--prod` scope (which excludes devDependencies) is stated in the bullet that makes a point of stating scope.
- **P9-R8 (deploy-side → `todos.md`).** Two new rows in the T-19/T-20 shape (numbered T-23/T-24 — renumbered 2026-09-21 from T-21/T-22, which `todos.md` had already taken by then), with `Last updated:` bumped:
  - **T-23** — the production restore walk and the account/secret inventory: executing the drill end-to-end as a script against a real backup; the AWS account `770371751912` row with credential location, MFA and break-glass ownership; the Anthropic and Google OAuth account rows; the off-host store for `BACKUP_PASSPHRASE_FILE` and `RESPIN_AUTO_TOPUP_AUTHORITY_KEY`; the deletion-journal credential mechanism (the SDK resolves an instance role while the provisioned principals are IAM users with zero keys and the worker unit's `ProtectHome=true` hides `~/.aws/credentials`). **Also here: the three documents contradicting each other on whether the R-124 journal is provisioned** — `RUNBOOK.md:49,61,71` and `todos.md` T-17 say nothing is, while `infra/s3-deletion-journal/RUNBOOK.md:3-24` records a created bucket with Object Lock COMPLIANCE and two locked probe objects. Reconciling those to the infra runbook's state needs the owner, because only the owner knows which is true.
  - **T-24** — worker-health paging above 90 s, and the expand/contract policy that makes "redeploy the previous build" meaningful after a forward-only migration (the master plan's own compatibility/rollback row is unchecked at `respin-finish-master-plan.md:273`).

### Dependency floor

- **P9-R9 (REG-42/43, HIGH).** `drizzle-orm` 0.44.7 → `^0.45.2`. This is simultaneously `GHSA-gpj5-g38j-94v9`'s fix and the satisfaction of `better-auth@1.6.28`'s declared peer — the auth vendor's tested range does not currently include the ORM version the auth tables run on. It lands as **its own commit** with the full billing and tenancy gates and the live-Postgres concurrency run, exactly as `SECURITY-EXCEPTIONS.md` prescribes. `sharp` and `postcss`: decide `overrides` or accept — the "fix via a `next` bump" rationale is stale, because the locked `next@15.5.23` pins both. `SECURITY-EXCEPTIONS.md` is re-dated with the missed M2 trigger **recorded as missed**.
- **P9-R10 (REG-43's second/third, MEDIUM).** A `schedule:` on the audit workflow, so a newly published advisory is not invisible until someone next edits `respin/`. The product's code gate SHA-pins its three third-party actions and sets `permissions: contents: read`, as the repo's other two workflows already do. **Who sees a scheduled failure (generalist pre-mortem):** a scheduled run has no PR author, so the route is GitHub's own workflow-failure notification, which for `schedule:` runs goes to the user who last committed the workflow file — the workflow's comment names that (the repo owner keeps that commit) and the failing step prints the audit's JSON summary into the job log so the notification links to the cause; CI-schedule paging beyond GitHub's notification is deploy-side and joins T-24.
- **P9-R11 (REG-44, LOW).** `respin.yml:106`'s exception comment names `ignoreCves` while the mechanism in use is `ignoreGhsas` — following the workflow's own instruction produces a silently ineffective key. Plus three pins, each with its own AC (AC11): the auth-schema generator is an unpinned `pnpm dlx` that writes into `packages/db/src/auth-schema.ts` (row 20 pins it to the installed `better-auth` version); `postgres:17-alpine` is unpinned by digest (row 3 pins `image: postgres:17-alpine@sha256:…` with the digest quoted from `docker image inspect`); no manifest carries a `license` field (the workspace-root and the eight package manifests under `respin/packages/` gain `"license": "UNLICENSED"` — private, not a grant — row 16).
  - **Amendment 2026-10-05 (register item 13).** The comment now sits at `respin.yml:113` and the blocking audit step at `:117-118`. `SECURITY-EXCEPTIONS.md:41-42` still names "M2 entry" as the review trigger. P9-A3 adds the witness this requirement lacked.

### 2026-10-05 register additions

Homed here from `docs/progress/audit/2026-10-05.md`. Every `file:line` below was re-read on 2026-10-05. Each requirement names its half (9a or 9), per the split at the top of this file.

- **P9-A1 (item 3 b/c, CRITICAL; and item 44's journal-listing LOW) — 9a. The drill's PASS has to mean something.** Four defects:
  - (b) **The argv guard can skip `main()` entirely.** The guard at `scripts/restore-verify.ts:269` compares `import.meta.url` to `process.argv[1]`. Any percent-encodable character in the checkout path (a space) makes it skip `main()`. The process exits 0, and `restore-drill.sh:278-279` reads exit 0 as "verified".
  - (c) **The money tables are not checked.** The drill's header promises to refuse unless "the money tables actually came back with rows in them" (`restore-drill.sh:5-7`). It counts `subscriptions`, `credit_ledger` and `stripe_events` (`:181-184`) but raises only on an empty `config_versions` (`:189-194`).
  - **An expired backup is not refused.** The manifest's `expiresAt` is printed (`:82`) and never compared, so a backup taken before a deletion request un-deletes the erased identity with nothing to detect it.
  - **Unreadable journal keys vanish.** `listJournalOperationIds` silently drops keys it cannot parse (`packages/db/src/deletion-journal-restore.ts:506-509`).

  **Fix.**
  - The guard compares resolved file paths (`fileURLToPath(import.meta.url)` against `path.resolve(process.argv[1])`).
  - The drill requires the verifier's printed success marker, as well as a zero exit.
  - The drill raises unless `subscriptions`, `credit_ledger` and `stripe_events` are non-empty.
  - **`--allow-empty-money` is bounded, not an escape.** It is accepted **only in local-drill mode**: the journal endpoint is the loopback MinIO (`RESPIN_DELETION_JOURNAL_ENDPOINT` is `http://127.0.0.1:9000`, P9-R4's env block) **and** the backup file's manifest records a loopback source host. That needs a new `sourceHost` field: the database URL's host only, never a credential. `backup.sh` writes it into the manifest heredoc (`scripts/backup.sh:190-201`, which today records no host), so it lands with P9-A2's row 6. In any other mode the flag is a refusal naming why. When accepted it prints `EMPTY-MONEY-ALLOWED (local drill)` as the transcript's first and last line. T-23's closure proof refuses any transcript carrying that marker (master deferral ledger), so a production-shaped PASS can never rest on it.
  - The drill refuses a manifest whose `expiresAt` is earlier than now, with the way forward printed: take a fresh backup.
  - The listing counts unparseable keys and the verifier fails on a non-zero count.

  Proof: AC13.
- **P9-A2 (item 3 d, CRITICAL — the backup half) — 9a.** Five defects:
  - **A null tombstone manifest is reported as success.** `backup.sh` records `activeTombstones=null` (`scripts/backup.sh:177-181`), then still exits 0 with a health line (`:289-291`). The drill refuses that manifest (`restore-drill.sh:78-80`), so the outage is found only at restore.
  - **`psql` is used but never checked.** The tool preflight (`backup.sh:61-68`) checks `pg_dump`, `gpg` and `node`, but not `psql`, which `:169` uses.
  - **A failed dump skips the expiry prune.** Under `set -euo pipefail` (`:26`), a failing `pg_dump` (`:117`) exits before the prune at `:227`, so expired backups that hold erased data outlive REQ-A04's bound for as long as dumps keep failing.
  - **A moved backup reads as corrupt.** The checksum records the path as given (`sha256sum "$DUMP"`, `:128`).
  - **The migrate remedy cannot authenticate.** It prints a password-stripped URL (`restore-drill.sh:252`, `DATABASE_URL=${TARGET_URL_SAFE}`). And `docs/operator/aws.md:151`'s drill command sets `RESTORE_SERVING_DISABLED=1` where the script requires `confirmed`.

  **Fix.**
  - A null manifest exits non-zero.
  - `psql` joins the preflight.
  - The prune runs from an `EXIT` trap, so it runs on every exit path.
  - The checksum is written relative to the backup directory and verified from it.
  - The remedy prints the command with the credential **variable** named, never a value.
  - `aws.md:151` is corrected and pinned by `tests/shell-scripts.test.ts`.

  Proof: AC14.
- **P9-A3 (item 13, HIGH; and item 38's CI half) — 9a. The audit gate gets a witness.**
  - **The gate has no witness.** Deleting the blocking step (`.github/workflows/respin.yml:117-118`) leaves the suite green. `respin.yml` is outside the SHA-pin and `permissions` rules that `tests/journeys-workflow-triggers.test.ts:479-494` applies to the visual workflow.
  - **The blocking step does not always run.** It is the last step, so a red earlier step skips it.
  - **The job holding the key is unaudited for dev dependencies.** The journeys job runs playwright and `tsx` with `ANTHROPIC_API_KEY` (`respin-journeys.yml:46`), but the blocking audit is `--prod`.

  **Fix.** The workflow test is extended to `respin.yml` and asserts:
  - the blocking audit step is present, with `if: always()`;
  - every action is SHA-pinned, and `permissions: contents: read` is set;
  - the comment names `ignoreGhsas`;
  - every id in `package.json`'s `pnpm.auditConfig.ignoreGhsas` (`:16`) has a `SECURITY-EXCEPTIONS.md` row with an unexpired trigger.

  Each of these is planted red once. `respin-journeys.yml` gains a dev-scope `pnpm audit --audit-level high` before the key is issued. `SECURITY-EXCEPTIONS.md` is re-dated now, recording the missed trigger as missed. Proof: AC15.
- **P9-A4 (item 14, HIGH; and item 44's `env.example` LOW) — 9a. `env.example` is the env authority, asserted against the tree.** The register over-claims part of item 14, measured 2026-10-05:
  - `respin/env.example` **does** carry `GOOGLE_CLIENT_ID`/`_SECRET` (`RUNBOOK.md` does not; P9-R7 adds them there).
  - `ANTHROPIC_BASE_URL` is **deliberately ignored** (`packages/llm/src/anthropic.ts:43`; pinned by `packages/llm/tests/adapter.test.ts:84`).
  - `RESPIN_DB_URI`, `RESPIN_MAINT_URI` and `RESPIN_DRILL_DB` are script-internal temporaries (`backup.sh:99,111`, `restore-drill.sh:100`), not operator inputs.

  The real gap, measured with `grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*"` over `app`, `packages/*/src`, `worker`, `lib`, `scripts`, `instrumentation*.ts` and `middleware.ts`: 21 names, of which `RESPIN_LLM_TRANSPORT`, `RESPIN_ENV_FILE`, `NEXT_RUNTIME`, `NODE_ENV` and the three temporaries are absent from `env.example`. Separately, `RESPIN_SEED_FORCE` is read through `env.` at `packages/db/src/seed.ts:35`, and the scripts' `BACKUP_*`/`MAINTENANCE_URL` inputs are absent too. **Fix:** `env.example` lists every operator input. A new test derives the read set with the grep above plus the listed indirect readers (`seed.ts`, `worker/env.ts`, the shell scripts' required-variable checks). It asserts each name is in `env.example` or on a written exemption list with its reason: runtime-set, script-internal, or deliberately ignored. A new reader is red until listed (rule 7). The off-host **locations** of restore-critical secrets stay in T-23. Proof: AC16.
- **P9-A7 (item 47's headers and bind — LOW) — 9a.**
  - **No security headers.** `next.config.ts` sets none (no `headers` key), so the public Sample Spin can be framed.
  - **Postgres listens on every interface.** The local Postgres port is published as `"5435:5432"` (`docker-compose.yml:19-20`).

  **Fix:** `headers()` sets `Content-Security-Policy` with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (production only), `Referrer-Policy` and `X-Content-Type-Options`; the port binds to `127.0.0.1:5435:5432`. The rest of item 47 is homed elsewhere:
  - the untrusted-input clause → P8-R2;
  - the framework summary → P8-A4;
  - sign-up credit farming → P4-A8;
  - `RESPIN_TRUSTED_PROXIES` honesty → the master's deferral ledger, since it needs the live topology.

  Proof: AC19.
- **P9-A5 (item 31's two documentation halves — MEDIUM) — 9.** `worker/main.ts:69-75` and the `system_worker_health` reader are P9-R5 and P9-R6, and paging is T-24. Two halves remain:
  - **No worker recipe.** No inline-env `worker:start` recipe exists anywhere.
  - **The README's billing walk dead-ends.** The walk (`respin/README.md:110` onward) ends at a subscribe the seeded tier-checkout rollout does not open (`0049_narrow_mentallo.sql:80` seeds the row), and the command that opens it is neither a root script nor documented.

  **Fix:** `RUNBOOK.md` gets the inline-env `worker:start` recipe. The README names the rollout command, and it becomes a root `pnpm` script beside `stripe:auto-topup:rollout` (`package.json:36`); or, if the build finds the rollout must stay closed, the README stops at the step that works and says why. Proof: AC17.
- **P9-A6 (item 44's remaining LOWs) — 9.** Three defects:
  - **The production worker runs on `tsx`.** `worker:start` is `tsx worker/main.ts` (`package.json:38`), and the systemd unit runs the same (`ops/systemd/respin-worker.service:28`), while `worker/tsconfig.json:8` is `noEmit`.
  - **`RUNBOOK.md` contradicts itself about where the code lives.** `:3` says the repository is pushed and "the 2026-07-14 'no remote backup' gap is closed". `:179` says the source is "under **local git**". The launch work L0–L4 also exists only on this disk (register item 14).
  - **A stray empty file sits at the workspace root.** It is named `, migrationInventory([{name` (0 bytes, dated Sep 10). It is not this plan's to delete (golden rule 3).

  **Fix:** a `worker:build` step emits JS, and `worker:start` and the unit run `node` on it. Or the card records why `tsx` stays, with a revisit trigger. Choosing between them is the build's first step, and a typecheck-only path is not accepted silently. The runbook states one truth: the last pushed commit, and what is uncommitted. The push itself is owed to the owner (master, *Owed to the owner*). The stray file is listed in the card as **owed to the owner** for a delete confirmation and is not removed by this phase. Proof: AC18.

## Tasks

| Task | Work | File rows |
|---|---|---|
| 1 | The runbook-counts test, then every count and command correction it reddens | 1–3 |
| 2 | Drill ordering (restore → migrate → verify), local-drill mode, env prerequisites at the command, `max_locks_per_transaction` | 4–7 |
| 3 | Worker start reason; the worker-health read | 8–11 |
| 4 | The runbook's structure, inventory and forecast corrections; `todos.md` T-23/T-24 | 12–14 |
| 5 | **Its own commit:** the ORM bump in the three package manifests, the sharp/postcss decision, `SECURITY-EXCEPTIONS.md` re-dating | 15–18 |
| 6 | CI schedule, SHA pins, `permissions`, the `ignoreGhsas` comment, the three LOW pins (the `license` field lands in rows 15, 16 and 22 — every manifest under `respin/`) | 19–22 |
| 7 | **9a**, 2026-10-05: the drill's honesty (A1), the backup failure modes (A2), the audit-gate witness and dev-scope audit (A3), `env.example` as asserted authority (A4), headers and the loopback bind (A7). Tasks 2 and 6, P9-R8's half of Task 4, and Task 5's re-dating also run in 9a | 2–7, 13, 14, 16, 18–31 |
| 8 | **9**, 2026-10-05: the worker recipe and README walk (A5); the worker's production runtime, the one repository statement, and the stray file owed to the owner (A6) | 2, 16, 32–34 |

## Files to create / modify

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `tests/runbook-counts.test.ts` | N | Stated counts asserted against the tree. **Consumes Phase 1's shared walker** `tests/support/source-files.ts` (`ROOT_DIRS`, `sourceFilesUnder`, `topLevelDirsHoldingTypeScript` — the built name; the plan's earlier `production-roots.ts` was never created): the `*.docker.test.ts` and frontend-test counts are taken from `sourceFilesUnder()` filtered by name, so this test and Phase 1's scanners share one population and one line-ending normalisation; the migration count reads `packages/db/migrations/meta/_journal.json` directly |
| 2 | `repo: RUNBOOK.md` | M | Gate command, counts, structure, inventory, forecast, `worker:start`, links; **the drill section's env block**: `RESPIN_DELETION_REQUEST_SCOPES=workspace` (app), `RESPIN_DELETION_JOURNAL_BUCKET/_REGION/_ENVIRONMENT/_ENDPOINT=http://127.0.0.1:9000` (app **and** worker **and** the verifier shell), `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (all three), the IP-endpoint/`forcePathStyle` note, then the seed request, the backup, the restore, `db:migrate`, the verify |
| 3 | `docker-compose.yml` | M | The third stale count ("the nine .docker.test.ts suites", `:15`); the `minio` service and its bucket-init container under `profiles: ["drill"]` (P9-R4) |
| 4 | `scripts/restore-drill.sh` | M | Restore → migrate → verify; env prerequisites; local mode |
| 5 | `scripts/restore-verify.ts` | M | Honour the loopback endpoint it already reads (`:126-130`) — no transport change; the printed remedy (`:64-70`) names the local-drill env block as the second way forward beside the production bucket |
| 6 | `scripts/backup.sh` | M | Usage block referenced by the runbook |
| 7 | `tests/shell-scripts.test.ts` | M | Pin the new ordering and the usage block |
| 8 | `worker/main.ts` | M | Emit the start-failure reason (`:69-75`) through `toSafeWorkerEvent` (`worker/health.ts`) with the variable name as `reasonCode` — `safe-log.ts` lives at `app/(product)/safe-log.ts` and the worker cannot import `app/**` |
| 9 | `worker/tests/main.test.ts` | N | A refused env var names itself, no creator content in the line — new: no test imports `worker/main.ts` today (`env.test.ts` covers `env.ts` only) |
| 10 | `app/(admin)/admin/worker-health/page.tsx` | N | The `heartbeat_age` read. **Repeats `requireAdmin()` itself** — `(admin)/layout.tsx:1-3` records that the gate is repeated on every admin page because client-side navigation caches layouts, and `tests/gate-completeness.test.ts:35,120` enforces it (`ENFORCING_GATES`), so the new page is a red test without the call |
| 11 | `packages/db/src/app-server.ts` | M | Expose the read |
| 12 | `repo: docs/runbooks/respin-worker-operations.md` | M | Point at the read instead of a manual query |
| 13 | `repo: todos.md` | M | T-23, T-24; bump `Last updated:` |
| 14 | `repo: docs/initial/decisions.md` | M | R-147 — migrate-then-verify restore order |
| 15 | `packages/db/package.json`, `packages/credits/package.json`, `packages/config/package.json` | M | `drizzle-orm ^0.44.0` → `^0.45.2` at `:26`, `:27`, `:19` — the three manifests that carry the specifier; the workspace-root `package.json` has **no** `drizzle-orm` entry. **`drizzle-kit` (`packages/db/package.json:34`, `^0.31.0`, installed 0.31.10) is pinned, not bumped:** it carries no open advisory, its installed manifest has **no `peerDependencies` key at all** (verified 2026-09-21 by `node -e` against `respin/node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/package.json`, which prints `0.31.10 NO peerDependencies key` — the earlier text's `peerDependencies: {}` was a claim recorded without reading the file, batch-1 billing NOTE), so it declares nothing about `drizzle-orm` and pnpm will emit no unmet-peer warning for it either way, and `db:check` runs on it — so AC10's `pnpm -C respin db:check` on the bumped tree is the compatibility witness; if it reddens, the kit bump joins the same commit with the reason recorded |
| 16 | `package.json` (workspace root) | M | The sharp/postcss decision — `pnpm.overrides` beside the existing `pnpm.onlyBuiltDependencies` / `auditConfig` block (`:9-16`), or an accept entry in row 18; `"license": "UNLICENSED"` here (P9-R11) — the eight package manifests get theirs in row 15 (the three the ORM bump edits) and row 22 (the five it does not) |
| 17 | `pnpm-lock.yaml` | M | The resolved tree |
| 18 | `SECURITY-EXCEPTIONS.md` | M | Re-dated; the missed trigger recorded as missed; the `drizzle-orm` row removed |
| 19 | `repo: .github/workflows/respin.yml` | M | `schedule:`, SHA pins, `permissions`, the `ignoreGhsas` comment, `--prod` scope stated; the scheduled run's failure route (P9-R10) |
| 20 | `packages/auth/better-auth.cli.ts` | M | Pin the generator |
| 21 | `repo: .github/workflows/respin-journeys.yml` | M | SHA pins to match |
| 22 | `packages/auth/package.json`, `packages/brain/package.json`, `packages/llm/package.json`, `packages/modes/package.json`, `packages/trends/package.json` | M | `"license": "UNLICENSED"` — the five package manifests the ORM bump does not touch (one row: the same one-field addition, on the Phase 8 row-9 precedent); measured 2026-09-21: eight directories under `respin/packages/` carry a `package.json`, none carries a `license` field, and three of the eight are row 15's. Rowed on the 2026-09-21 Codex re-check: P9-R11 and row 16 named "the eight package manifests" and the table carried only the three |
| 23 | `tests/restore-verify.test.ts` | M | P9-A1 (9a): the verifier runs `main()` from a checkout path containing a space; the drill-side marker assertion has a planted exit-0-without-marker case |
| 24 | `packages/db/src/deletion-journal-restore.ts` | M | P9-A1 (9a): `:506-509` counts unparseable keys instead of dropping them; the verifier fails on a non-zero count |
| 25 | `packages/db/tests/deletion-journal.test.ts` | M | P9-A1 (9a): a planted unparseable key is counted and fails verification |
| 26 | `repo: docs/operator/aws.md` | M | P9-A2 (9a): the `:151` drill command is corrected (`RESTORE_SERVING_DISABLED=confirmed`, the required inputs named); `shell-scripts.test.ts` (row 7) pins it |
| 27 | `tests/journeys-workflow-triggers.test.ts` | M | P9-A3 (9a): the existing SHA-pin and `permissions` rules (`:479-494`) extended to `respin.yml`; the blocking audit step is present with `if: always()`; the `ignoreGhsas` ↔ `SECURITY-EXCEPTIONS.md` unexpired-trigger equality. Each is planted red once |
| 28 | `env.example` | M | P9-A4 (9a): every operator input the test derives |
| 29 | `tests/env-example.test.ts` | N | P9-A4 (9a): the derived read set ⊆ `env.example` ∪ the written exemption list (runtime-set, script-internal, deliberately ignored), two-way; a planted new reader is red |
| 30 | `next.config.ts` | M | P9-A7 (9a): `headers()` with CSP `frame-ancestors 'none'`, `X-Frame-Options`, HSTS (production), `Referrer-Policy`, `X-Content-Type-Options` |
| 31 | `tests/security-headers.test.ts` | N | P9-A7 (9a): the header set is asserted on `/` and `/api/demo`; deleting `frame-ancestors` is red |
| 32 | `README.md` | M | P9-A5 (9): the billing walk names the rollout command or stops at the step that works |
| 33 | `worker/tsconfig.json` | M | P9-A6 (9): an emitting build for `worker:build` (or no change, if the card records why `tsx` stays) |
| 34 | `ops/systemd/respin-worker.service` | M | P9-A6 (9): `ExecStart` (`:28`) runs the built entry under `node` |

**22 rows; within the target** (row 22 added by the 2026-09-21 Codex re-check). **2026-10-05 addendum: 34 rows (22 + 12).** Phase 9a's rows are 2–7, 13, 14, 16, 18–31: 23 rows. Phase 9's are 1–3, 8–12, 15–18 and 32–34: 16 rows. Rows 2, 3, 16 and 18 are shared, with disjoint edits. Each half is within the 25-row target. Rows 2 (the `worker:start` recipe and the one repository-location statement), 6, 7, 16, 18, 19 and 21 also carry addendum work.

## Edge cases and external failures

| Condition | Handling | Requirement |
|---|---|---|
| The ORM bump changes generated SQL | That is what the full gates and the live-Postgres concurrency run are for. `pnpm -C respin db:check` must be clean and any emitted-SQL change is quoted in the card | P9-R9 |
| The bump breaks `better-auth`'s adapter | Unlikely in this direction — 0.45.2 is the version its peer declares — but the auth suite is named explicitly in the card's run list | P9-R9 |
| The counts test is itself vacuous | It plants a wrong count in a scratch copy of the runbook and asserts red, per the 2026-08-26 lesson | P9-R2 |
| The local-drill mode makes the real drill weaker | It does not change the drill's checks; it changes where the journal lives — the same S3 verifier against MinIO on loopback. Every assertion runs in both modes (P9-R4 lists them), and the production transcript is still owed under T-23 | P9-R4 |
| The local journal is empty, so steps 3 and 5a pass vacuously | The runbook's drill section seeds one local deletion request against MinIO before the backup, and AC3 requires the card to quote a non-zero verified journal count | P9-R4 |
| MinIO's Object Lock semantics differ from S3's on a probe the verifier makes | The verifier's calls are list-versions and get-object-version; MinIO implements both with versioning + lock at bucket creation. If a call differs, the card records it as a local-mode limitation naming the call — never as a production claim | P9-R4 |
| Documenting `max_locks_per_transaction` conflicts with a managed Postgres that forbids it | Then the restore target's creation step says so and names the alternative; the setting's reason (the 'out of shared memory' failure at ~55 migrations) travels with it | P9-R4 |
| Reconciling the three journal-provisioning documents needs facts only the owner has | It goes to T-23 rather than being guessed. A runbook that states a confident wrong answer is worse than one that names the open question | P9-R8 |

## Verification and acceptance

| # | Criterion | Evidence |
|---|---|---|
| AC1 | Every command in `RUNBOOK.md` runs as pasted on a clean shell, including the entry gate, `worker:start`, and both recovery scripts with their prerequisites named at the command | card quotes each invocation |
| AC2 | Planting a wrong migration count, docker-suite count or frontend-test count in the runbook turns `runbook-counts.test.ts` red | card quotes the three plants |
| AC3 | The restore drill completes locally end-to-end as a **script** against a backup older than migration head, with the migrate step between restore and verify, against the MinIO journal on loopback (`docker compose --profile drill up -d`), verifying a non-zero number of journal records — **and the runbook's env block is sufficient for the seed**: a clean shell with exactly the block's variables (`RESPIN_DELETION_REQUEST_SCOPES`, the four journal names on app and worker, the two AWS names) makes one workspace deletion request that journals one record, which the verify step then counts; a run with the scopes flag unset, or the journal names on the app only, or no AWS keys, is red at the seed (the controls closed / `unavailableDeletionJournal` / a credentials error), not at the verify | card quotes the transcript, its exit code, the verified journal count and the three withheld-variable outcomes |
| AC4 | A worker started with a missing required env var logs the variable's name; no creator content appears in the message | card quotes the emitted line |
| AC5 | A stale `system_worker_health` heartbeat is visible on an admin surface without hand-written SQL | card quotes the rendered value |
| AC6 | `pnpm -C respin audit --audit-level high --prod` passes **without** the `drizzle-orm` ignore entry; the entry is removed, not re-dated | card quotes the audit run and the diff |
| AC7 | `better-auth`'s `drizzle-orm` peer is satisfied — `pnpm install --frozen-lockfile` emits no unmet-peer warning for it | card quotes the install output |
| AC8 | The audit workflow runs on a schedule; the three actions are SHA-pinned; `permissions: contents: read` is set; the exception comment names `ignoreGhsas` | card quotes the workflow diff |
| AC9 | `todos.md` carries T-23 and T-24 in the T-19/T-20 shape, `Last updated:` bumped, and nothing deploy-side is claimed complete anywhere in this phase | card quotes both rows |
| AC10 | Entry gate clean; `pnpm -C respin db:check` clean **on the pinned `drizzle-kit` 0.31.10 against the bumped ORM** (the compatibility witness); `TEST_DATABASE_URL=… pnpm -C respin test` green with the Docker concurrency suites live, **after** the bump | card quotes all three |
| AC11 | The auth-schema generator invocation names a pinned version; `docker-compose.yml`'s `postgres` image carries a digest; every manifest under `respin/` carries a `license` field; the scheduled workflow's failure route is named in the workflow file | card quotes the four lines |
| AC12 | `RUNBOOK.md` carries the four Respin-level headings (Rollback, Configuration, Observability, Backup & restore), names `worker:start`, `journalctl -u respin-worker` and `max_locks_per_transaction`, lists `GOOGLE_CLIENT_ID`/`_SECRET`, states `ANTHROPIC_API_KEY` once, and the `journal:forecast` section names the region as the one withholding cause with the `--region`, `--owner-ceiling-cents` and `--measured-*` flags | card quotes each heading and line |
| AC13 | (9a) The verifier run from a checkout path containing a space executes `main()` and prints its marker. The drill fails on a planted verifier that exits 0 without the marker. A restore with an empty `credit_ledger` raises. `--allow-empty-money` is refused outside local-drill mode (a planted non-loopback endpoint is red). In local mode it prints the marker on the first and last lines. A manifest whose `expiresAt` is in the past is refused, with the fresh-backup remedy. A planted unparseable journal key fails verification. Each case is red on today's tree | card quotes the five runs |
| AC14 | (9a) `backup.sh` exits non-zero when the tombstone query fails, and when `psql` is absent. With `pg_dump` planted to fail, the expiry prune still runs, and the transcript shows it. A backup directory moved elsewhere verifies its checksum. The migrate remedy prints no URL and names the credential variable. `aws.md:151` is pinned by `shell-scripts.test.ts` | card quotes each exit code and the moved-directory verification |
| AC15 | (9a) Deleting `respin.yml`'s blocking audit step, unpinning one action, deleting `permissions`, and adding an `ignoreGhsas` id with no exception row each turn `journeys-workflow-triggers.test.ts` red. `respin-journeys.yml` runs a dev-scope audit before the key is issued. `SECURITY-EXCEPTIONS.md` records the M2 trigger as missed, with a new trigger | card quotes the four red plants and the re-dated block |
| AC16 | (9a) `env-example.test.ts` is green with `env.example` complete. A planted `process.env.RESPIN_PLANTED` in `worker/` is red until listed. Each exemption carries its reason | card quotes the derived set, the exemption list and the red plant |
| AC17 | (9) The `RUNBOOK.md` `worker:start` recipe runs as pasted on a clean shell (AC1's discipline). The README billing walk reaches either an open subscribe or a stated stop | card quotes both |
| AC18 | (9) `worker:start` runs built JS under `node`, and `pnpm -C respin worker:typecheck` stays clean — or the card records why `tsx` stays, with its trigger. `RUNBOOK.md` makes one statement about where the code lives. The stray file is listed as owed to the owner | card quotes the start line, the runbook sentence and the owed line |
| AC19 | (9a) `/` and `/api/demo` responses carry the header set (`security-headers.test.ts`), and deleting `frame-ancestors` is red. `docker compose config` shows the Postgres port bound to `127.0.0.1` | card quotes the headers and the port line |

### Requirement → AC mapping

Every requirement has an AC (tabulated 2026-09-21). AC10 is the entry gate on the bumped tree and also carries P9-R9's compatibility witness.

| Requirement | AC(s) |
|---|---|
| P9-R1 | AC1 |
| P9-R2 | AC2 |
| P9-R3 | AC1 |
| P9-R4 | AC3 |
| P9-R5 | AC4 |
| P9-R6 | AC5 |
| P9-R7 | AC12 (added) |
| P9-R8 | AC9 |
| P9-R9 | AC6, AC7, AC10 |
| P9-R10 | AC8, AC11 |
| P9-R11 | AC8, AC11 (added — the generalist found its three pins AC-less) |
| P9-A1 | AC13 |
| P9-A2 | AC14 |
| P9-A3 | AC15 |
| P9-A4 | AC16 |
| P9-A5 | AC17 |
| P9-A6 | AC18 |
| P9-A7 | AC19 |

## Definition of done

**Amended 2026-10-05:** Phase 9a is done when its ACs pass (AC1's recovery-script half, AC3, AC8, AC9, AC11, AC13–AC16, AC19), its brain-tenancy full gate reports PASS, R-147 and the `SECURITY-EXCEPTIONS.md` re-dating are appended, and its card reads Ready. Phase 9 (the remainder) is done as below, with R-147 already landed by 9a. Every AC passes; both full gates report PASS **on the bumped tree**; R-147 appended; `SECURITY-EXCEPTIONS.md` records the missed trigger as missed rather than silently re-dated; report card **Ready**; one card, one ledger line. `RUNBOOK.md:31`'s "Last production drill: NEVER" stays NEVER until T-23 closes — this phase makes the drill runnable, it does not claim it was run.

## Reachability

An operator can paste every `RUNBOOK.md` command on a clean shell and have it run (row 2), run the restore drill locally end-to-end as a script with no cloud account (`scripts/restore-drill.sh`, row 4, against the MinIO journal row 3 starts under the `drill` profile), read a worker's start-failure reason from the unit's stderr/`journalctl` (`worker/main.ts`, row 8, via `worker:start`), and see `heartbeat_age` at `/admin/worker-health` (row 10, new page under the existing `(admin)` shell); a maintainer's `pnpm -C respin audit --audit-level high --prod` passes with no `drizzle-orm` exception (rows 15–18), and the workflow re-runs it on a schedule (row 19). The counts test (row 1) is reached by `pnpm -C respin test`.

## Least confident

Whether the ORM bump is clean. It is a minor version across 62 migrations, a tenancy cage and a money path, and the exception file itself says this is the one to do first and to do alone. If it is not clean, the honest outcome is that the phase splits: the operability half ships, the bump becomes its own phase with its own gates, and `SECURITY-EXCEPTIONS.md` records a third dated trigger with the reason.

## Out of scope

Everything in T-23 and T-24. The parked-product half of `RUNBOOK.md:73-181` — the Hangfire-absence claim, the "six keyless adapters" and the Contract assertions are all `[UNVERIFIED]` and out of this programme's scope, but the runbook offers them as current; this phase marks them as unverified rather than repairing them.
