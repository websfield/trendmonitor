# Creator-ready Phase 0 baseline manifest

Initial observation: **2026-09-16T13:54:31.3367927+10:00**. Branch `creator-ready-plan-review`; HEAD `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`. This manifest describes the checkout, not a release candidate.

## Tree and checkpoint

Commands: `git branch --show-current`, `git rev-parse HEAD`, `git status --short`.

Initial stdout, before Phase 0 document writes:

```text
creator-ready-plan-review
79de2dbb14944f2f3089c621dc8bc9d31e0c1882
 M .codex/config.toml
```

Git also warned that the user-level ignore file could not be accessed. Inventory reflects Git's observable output under that limitation.

| Lineage | Staged | Unstaged | Untracked initially |
|---|---|---|---|
| Pack tooling | none | `.codex/config.toml` | none |
| Journeys | none | none | none |
| Programme documents | none | none | none |
| Other | none | none | none |

The initial checkpoint attempt failed creating `.git/index.lock`. The owner then ran Git locally. `git stash list --format='%gd %s'` confirmed `On creator-ready-plan-review: claude-jig checkpoint: creator-ready phase 0`; `git status --short` confirmed the configuration edit restored. No stash was dropped. The two unpublished commits remain local; the earlier push attempt failed to connect to GitHub.

Owner snapshot: branch `respin-m1-billing-credits`, base `961c2a9d7e7911e3c591d904dd52576a69495b5a`. This checkout differs in branch and revision as shown above; it was not reset. The earlier phase-plan dirty-file inventory is historical and is not reused here.

## Lockfile, migrations and tools

| Field | Observation | Command |
|---|---|---|
| Lockfile | `respin/pnpm-lock.yaml`, SHA256 `54E684B5E9EB581775FA2F0841110674CA4E3444937E7D4BF9B18A0A8483BD4D` | `Get-FileHash respin/pnpm-lock.yaml -Algorithm SHA256` |
| Tree migration count | 62 SQL files | `(Get-ChildItem respin/packages/db/migrations -Filter '*.sql').Count` |
| Database migration count/max timestamp | Owner-run export: 62 rows; max(created_at) 1788929988898 | SELECT export received 2026-09-17; preserved transcript below |
| Migration row/file equality | 62 reported database rows = 62 locally counted SQL files; count parity only | Owner export plus fresh local file count |
| Active config version | 18 in both max(version) and latest content result | Owner-run export received 2026-09-17 |
| Node | v24.18.0 | `node --version` |
| pnpm | 10.28.2 after setting TEMP/TMP to the ignored workspace `.codex-tmp`; initial startup was blocked | `pnpm --version` |
| Playwright | 1.63.0 with the same temporary-directory settings | `pnpm -C respin exec playwright --version` |
| Stripe CLI | executable discoverable, execution denied; version unverified | `stripe --version` |
| Live environment key names | blocked by session filesystem policy; file existence and values not inspected | planned key-only read not attempted because `.env.*` reads are prohibited |

The initial pnpm failure reports embedded Node v20.11.1; that is not the separately observed `node --version`. The package manifest requests pnpm 10.28.2, and the resumed version probe independently returned 10.28.2. Process-local TEMP/TMP settings permit startup without widening filesystem access.

## Database reads — initial blocked attempts

Intended target of these attempts: local Docker container `respin-postgres`, database `respin`, user `respin`. Whether that is the owner's intended acceptance environment remains unknown. No database connection was established, so no live server identity is asserted.

Each query below was attempted separately using `docker exec respin-postgres psql -U respin -d respin -t -A -c "<query>"`:

```sql
select max(version) from config_versions
select version, content from config_versions order by version desc limit 1
select protocol, state, revision from tier_checkout_protocol_rollouts
select protocol, state, revision from auto_topup_protocol_rollouts
select count(*), max(created_at) from drizzle.__drizzle_migrations
```

Each attempt returned Docker errors:

```text
WARNING: Error loading config file: open C:\Users\FredWang\.docker\config.json: Access is denied.
failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the path is correct and if the daemon is running: open //./pipe/docker_engine: The system cannot find the file specified.
```

Both rollout tables are **NOT RUN**, not empty and not in any assumed state. Config version and database migration head remain unobserved. Owner recovery: run the five SELECTs above against the intended local database and provide their non-credential results. The configuration comparison has its explicit blocked variant in [00-config-offer-comparison.md](00-config-offer-comparison.md).

## Initial entry-gate attempts (historical)

Pre-check: presence-only `Test-Path Env:TEST_DATABASE_URL` reported **unset**; no value was printed. Each command was then attempted independently after the database reads.

| Command | Exit | Actual outcome |
|---|---|---|
| `pnpm -C respin typecheck` | 1 | pnpm startup blocked; typecheck NOT RUN |
| `pnpm -C respin lint` | 1 | pnpm startup blocked; lint NOT RUN |
| `pnpm -C respin test` | 1 | pnpm startup blocked; Vitest NOT RUN |
| `pnpm -C respin build` | 1 | pnpm startup blocked; build NOT RUN |
| `pnpm -C respin preflight` | 1 | pnpm startup blocked; preflight NOT RUN |
| `pnpm -C respin worker:typecheck` | 1 | pnpm startup blocked; worker typecheck NOT RUN |
| `pnpm -C respin db:check` | 1 | pnpm startup blocked; offline migration check NOT RUN |

Full output and exit codes: [entry-gate-phase-0.txt](entry-gate-phase-0.txt). All fail before executing project checks with `EPERM: operation not permitted, lstat 'C:\Users\FredWang'`. These are environment launch failures, not demonstrated product/test failures; there is no green baseline or test count to report.

`rg --files respin -g '*.docker.test.ts'` returned **23** files (14 db, 7 credits, 1 config, 1 root tests). The exact set is listed as NOT RUN in the transcript. Vitest emitted no file results or skip counts; none is labelled observed SKIPPED. No live Docker test, dev server or worker was started.

## Resumed entry gate — before the Git Bash fix

Run started **2026-09-16T20:53:00.0817154+10:00**, on the same HEAD and lockfile hash. Initial failures above remain historical. Commands used process-local `TEMP` and `TMP` set to `C:\projects\ai.playground\trendMonitor\.codex-tmp`; `TEST_DATABASE_URL` was confirmed unset before the batch. The directory is already gitignored. Each command ran independently; a failed test command did not suppress later checks.

| Command | Exit | Observed result |
|---|---|---|
| `pnpm -C respin typecheck` | 0 | app and eight package typechecks passed |
| `pnpm -C respin lint` | 0 | passed |
| `pnpm -C respin test` | 1 | 207 test files passed, 1 failed, 23 skipped; 5,058 tests passed, 9 failed, 101 skipped |
| `pnpm -C respin build` | 0 | completed; warnings included denied `.env.local` loading and Edge Runtime API warnings |
| `pnpm -C respin preflight` | 0 | `preflight ok: brain_content_registry` |
| `pnpm -C respin worker:typecheck` | 0 | passed |
| `pnpm -C respin db:check` | 0 | offline migration check passed; no live migration applied |

The test summary totals **231 files / 5,168 tests** and is a fresh run, not the historical count in the owner handoff. Runtime: 365.29 seconds. Full output remains in [entry-gate-phase-0.txt](entry-gate-phase-0.txt), under `RESUMED RUN:`.

All nine failures are in `respin/tests/shell-scripts.test.ts` (21 tests total). Its first failure records `bash -n ...backup.sh` failing with `Bash/Service/CreateInstance/E_ACCESSDENIED`; `Get-Command bash -All` resolves first to `C:\WINDOWS\system32\bash.exe`. The suite's runtime calls use `execFileAsync("bash", ...)`. This run does not establish a shell-script logic defect or a successful backup/restore exercise. The failures remain red and are routed to Phase 4 operations/restore verification, including the shell execution environment. No source or test was repaired in Phase 0.

All **23** `*.docker.test.ts` paths were observed skipped by Vitest and are recorded **NOT RUN** in the resumed accounting at the transcript's end. The observed skipped-file set exactly matches the current glob. Per-file results are present; 75 unique obligation witnesses are green and 9 are NOT RUN. The sole failing file is outside those witness populations and is named in the register's closing failure list.

At that point the entry gate was **FAIL** because the test command exited 1; no approved green-baseline claim. Live database reads still fail on Docker access (later probes report permission denied on `docker_engine`, rather than the initial missing pipe). No database query or live concurrency suite executed. Build's denied environment-file read was not bypassed; no credential value was read or logged.

## Git Bash rerun — current local results

Full rerun started **2026-09-16T22:33:22.7870830+10:00**. Installed `C:\Program Files\Git\bin\bash.exe` starts successfully; prepending its directory to process-local PATH resolves the shell-launch failure. TEMP/TMP remain workspace `.codex-tmp`. No source/test/configuration edits were made by the assistant. Lockfile SHA256 remains unchanged.

`pnpm -C respin test` exited **0**: **208 files passed, 23 skipped; 5,067 tests passed, zero failed, 101 skipped**, duration 318.88 seconds. All 21 shell tests passed (transcript line 3481). The skipped-file set was rechecked against the exact 23-path Docker glob. No live Docker tests ran. Transcript marker: `GIT BASH FULL TEST RERUN:`; earlier attempts remain historical.

Together with the six successful checks above on unchanged product files, all seven local command checks now pass. At that point live database evidence and independent assurance remained outstanding; Phase 0 was not Ready. Git Bash settings were process-local, not persisted by the assistant.

## Owner-run database evidence — received 2026-09-17

The owner ran the supplied five-SELECT export and replied “done.” Complete output and command are preserved in `entry-gate-phase-0.txt` under `OWNER-RUN DATABASE EVIDENCE`. Source: `.codex-tmp/phase0-db-evidence.txt`, SHA256 `c93cfcd5b4dc0fbd16b4492dfd0d94a7943f0c3a2b5d8d20b9532642cf05e515`; inspected 2026-09-16T22:48:57.429Z. Source modification time 2026-09-16T22:46:55.483Z is not a certified execution timestamp. The file contains all five expected one-row result sets; shell exit status was not saved.

Actual owner command: `docker exec respin-postgres psql -X -v ON_ERROR_STOP=1 -U respin -d respin -c $sql`, with the five read-only SELECTs recorded in the transcript. This is owner-supplied evidence from the named local target, not execution through the agent's denied Docker connection. Acceptance-environment identity remains independently unconfirmed.

| Observation | Owner-exported result |
|---|---|
| Maximum / latest config version | 18 / 18 |
| Tier checkout rollouts — all returned rows | v1 / expanded / revision 0 (one row) |
| Auto-top-up rollouts — all returned rows | v1 / expanded / revision 0 (one row) |
| Migration rows / max(created_at) | 62 / 1788929988898 |

Fresh tree count: 62 SQL files, matching the reported database row count. Count parity does not prove migration hash/content parity. HEAD remains `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`; product tree unchanged. Historical config version 17 is superseded by the supplied version-18 observation.

The [configuration comparison](00-config-offer-comparison.md) now uses the export. Missing SELECT-output evidence is resolved via the owner's recovery path; direct agent Docker access remains denied. No live concurrency/checkout test or database write was performed. Batch-13 findings remain unresolved; no further review was run.
