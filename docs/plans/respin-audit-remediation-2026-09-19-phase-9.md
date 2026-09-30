# Phase 9 — Operability truth and the dependency floor

Depends on: Phases 1, 3, 4, 5, 8, 11 (the ORM bump is the last money-touching change, so its gate re-runs nothing — Phase 8 edits `packages/credits/src/{clock,balance,stripe/customers}.ts` and Phase 11, split from 8, edits `packages/credits/src/mode-access.ts` under its own billing full gate, so both precede it; Phase 1 for the shared source walker row 1 consumes. **Not Phase 10:** it edits only `app/**` a11y attributes and a marketing layout, touches no money path, and this phase consumes nothing it produces). Owner: `respin-engineer`. Est. 5–7 h.
**Read first:** the codebase review §4's scope boundary — **deploy-side closure is not in this phase**, and §2's supply-chain paragraph (one bump answers both the advisory and the unmet peer).

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

## Tasks

| Task | Work | File rows |
|---|---|---|
| 1 | The runbook-counts test, then every count and command correction it reddens | 1–3 |
| 2 | Drill ordering (restore → migrate → verify), local-drill mode, env prerequisites at the command, `max_locks_per_transaction` | 4–7 |
| 3 | Worker start reason; the worker-health read | 8–11 |
| 4 | The runbook's structure, inventory and forecast corrections; `todos.md` T-23/T-24 | 12–14 |
| 5 | **Its own commit:** the ORM bump in the three package manifests, the sharp/postcss decision, `SECURITY-EXCEPTIONS.md` re-dating | 15–18 |
| 6 | CI schedule, SHA pins, `permissions`, the `ignoreGhsas` comment, the three LOW pins (the `license` field lands in rows 15, 16 and 22 — every manifest under `respin/`) | 19–22 |

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

**22 rows; within the target** (row 22 added by the 2026-09-21 Codex re-check).

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

## Definition of done

Every AC passes; both full gates report PASS **on the bumped tree**; R-147 appended; `SECURITY-EXCEPTIONS.md` records the missed trigger as missed rather than silently re-dated; report card **Ready**; one card, one ledger line. `RUNBOOK.md:31`'s "Last production drill: NEVER" stays NEVER until T-23 closes — this phase makes the drill runnable, it does not claim it was run.

## Reachability

An operator can paste every `RUNBOOK.md` command on a clean shell and have it run (row 2), run the restore drill locally end-to-end as a script with no cloud account (`scripts/restore-drill.sh`, row 4, against the MinIO journal row 3 starts under the `drill` profile), read a worker's start-failure reason from the unit's stderr/`journalctl` (`worker/main.ts`, row 8, via `worker:start`), and see `heartbeat_age` at `/admin/worker-health` (row 10, new page under the existing `(admin)` shell); a maintainer's `pnpm -C respin audit --audit-level high --prod` passes with no `drizzle-orm` exception (rows 15–18), and the workflow re-runs it on a schedule (row 19). The counts test (row 1) is reached by `pnpm -C respin test`.

## Least confident

Whether the ORM bump is clean. It is a minor version across 62 migrations, a tenancy cage and a money path, and the exception file itself says this is the one to do first and to do alone. If it is not clean, the honest outcome is that the phase splits: the operability half ships, the bump becomes its own phase with its own gates, and `SECURITY-EXCEPTIONS.md` records a third dated trigger with the reason.

## Out of scope

Everything in T-23 and T-24. The parked-product half of `RUNBOOK.md:73-181` — the Hangfire-absence claim, the "six keyless adapters" and the Contract assertions are all `[UNVERIFIED]` and out of this programme's scope, but the runbook offers them as current; this phase marks them as unverified rather than repairing them.
