# Local restore drill — 2026-10-05 (audit-remediation Phase 9a, decisions.md R-155)

**What this is.** The transcript of `respin/scripts/restore-drill.sh` run end to end **as a script**, on a developer machine, in the local-drill mode (RUNBOOK.md, Respin → *Restore drill — local*). This is the **third run of the day, on the scripts as amended by the gate's round 2** (R-155 §8): every manifest field either script reads is bound by `respin/scripts/backup-manifest.mjs`.
- A real workspace deletion request is made through the app's own UI and journaled to a fresh loopback MinIO bucket by the real S3 writer.
- `backup.sh` dumps a scratch source database left **one migration behind head**.
- The drill restores it, migrates it and verifies it against that journal.

The dev database's data was not touched: the source and the drill target are scratch databases, dropped at the end. The app and worker were stopped by their captured PIDs, and MinIO by container name. Commands are quoted as run, with the local database password in echoed command lines masked as `***`.

**What this is not.** It is **not** the production restore walk. The passing run carries `EMPTY-MONEY-ALLOWED (local drill)`, so it closes nothing in todos.md T-23, and `RUNBOOK.md`'s "Last production drill: NEVER" stays NEVER.

**Read in order:**
- **Seed.** One operation, four journal versions, at `grace`.
- **Source aged** by one migration (62 applied of 63).
- **Backup, exit 0.** The file-name stamp and `createdAt` are now **one instant** (`respin-20261005T111355Z` / `2026-10-05T11:13:55Z`). The manifest carries `backupFile`, `sha256`, the `source*` fields and the journal fields.
- **Directory moved.**
- **DRILL 1, no flag.** The drill prints the manifest line (the effective expiry, and the journal "matches this drill"), then the **bindings line**, then the empty money tables RAISE (exit 3).
- **DRILL 2, no flag, the drill pointed at another journal.** Refused before anything is restored (exit 1). Since round 2 the journal binding applies with or without the flag.
- **DRILL 3, an edited copy whose `createdAt` is in 2099.** Refused by the `createdAt` binding (exit 1).
- **DRILL 4, the pass.** Every binding passes. One migration is applied between restore and verify. The verifier reports `journal_operations=1 … conflicts=0` and ends with `RESTORE-VERIFY: JOURNAL VERIFIED`, which the drill requires as well as exit 0. Exit 0.

**Stamps seen:**
- `EMPTY-MONEY-ALLOWED (local drill)`, on DRILL 4, as its first and last line.
- `JOURNAL-EMPTY` did **not** appear. The manifest records its journal, and since round 2 that stamp is only for a legacy manifest that records none; besides, the journal held an operation.

```text
### LOCAL RESTORE DRILL (re-run on the gate-round-2 scripts: every manifest field bound) — 2026-10-05T11:11:03Z — host: MINGW64_NT-10.0-26200, bash 5.2.37(1)-release, node v24.18.0, pg client psql (PostgreSQL) 18.1, server postgres (PostgreSQL) 17.11

$ docker compose -f respin/docker-compose.yml --profile drill up -d --force-recreate minio minio-init   (a fresh, empty bucket)
respin-minio bitnamilegacy/minio:2025.7.23@sha256:8935e75fa5d11295c17171e4aa49efe390a1193cd7f12e4d21b92af9ffef09d7 Up 5 seconds (healthy) 127.0.0.1:9000->9000/tcp
journal objects before the seed: 0

$ docker exec respin-postgres psql -U respin -d postgres -c 'CREATE DATABASE respin_drill_source'
DROP DATABASE
NOTICE:  database "respin_drill_source" does not exist, skipping
CREATE DATABASE
$ DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source pnpm -C respin db:migrate && pnpm -C respin db:seed
migrations applied successfully
seed complete (idempotent — safe to re-run)

### SEED — app (pid-captured) + worker (pid-captured) with the RUNBOOK env block; one workspace deletion request through /settings/account
{"step":"signed-up","email":"drill.seed.1791198688593@example.test"}
{"step":"account-page","requestsClosed":false,"journalUnavailable":false}
{"step":"result","search":"?ok=workspace_requested"}
seed exit=0
{"code":"deletion_lifecycle_tick","observedAt":"2026-10-05T11:12:12.343Z","deletionClaimed":1,"deletionAdvanced":1,"deletionWaiting":0,"deletionBlocked":0,"deletionErased":0}
{"code":"deletion_lifecycle_tick","observedAt":"2026-10-05T11:13:12.402Z","deletionClaimed":1,"deletionAdvanced":1,"deletionWaiting":0,"deletionBlocked":0,"deletionErased":0}
$ mc ls --recursive --versions l/respin-deletion-journal-local
[2026-10-05 11:11:41 UTC]   566B STANDARD 141cec42-9971-4bba-9de3-1edeeb0983bf v1 PUT local/deletion-journal/01a10bc3-2675-70df-9df6-a5b0ce3714b2/000001.json
[2026-10-05 11:11:41 UTC]   629B STANDARD 9abc3ffe-7e98-4858-801f-18e09190d2b1 v1 PUT local/deletion-journal/01a10bc3-2675-70df-9df6-a5b0ce3714b2/000002.json
[2026-10-05 11:12:12 UTC]   638B STANDARD 52d6a12f-95af-4df0-8711-980dc6dc5861 v1 PUT local/deletion-journal/01a10bc3-2675-70df-9df6-a5b0ce3714b2/000003.json
[2026-10-05 11:13:12 UTC]   633B STANDARD d96e1d54-b20b-4aa5-88e6-f52da21b5455 v1 PUT local/deletion-journal/01a10bc3-2675-70df-9df6-a5b0ce3714b2/000004.json
$ select id, scope, state, journal_version from deletion_operations  (source)
01a10bc3-2675-70df-9df6-a5b0ce3714b2|workspace|grace|4

### MAKE THE SOURCE OLDER THAN HEAD — revert migration 0062 and its ledger row (scratch source only)
BEGIN
DROP TABLE
DROP TYPE
ALTER TABLE
DELETE 1
COMMIT
 applied_migrations 
--------------------
                 62
(1 row)

committed migration files in this checkout: 63

### BACKUP — the env block exported in this shell, so the manifest records the journal
$ (env block) PATH="/c/Program Files/PostgreSQL/18/bin:$PATH" DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source BACKUP_DIR="respin/.tmp/drill/r2 backups" BACKUP_PASSPHRASE_FILE=respin/.tmp/drill/drill.pass bash respin/scripts/backup.sh
[backup] dumping → respin/.tmp/drill/r2 backups/respin-20261005T111355Z.dump.gz.gpg
[backup] ok: respin/.tmp/drill/r2 backups/respin-20261005T111355Z.dump.gz.gpg (59209 bytes), checksum respin/.tmp/drill/r2 backups/respin-20261005T111355Z.sha256
[backup] manifest: respin/.tmp/drill/r2 backups/respin-20261005T111355Z.manifest.json (expires 2026-10-26T11:13:55Z, retention 21d)
[backup] pruning backups whose effective expiry has passed
[backup] health: backups_present=1 newest=respin-20261005T111355Z bytes=59209
backup.sh exit=0
$ ls; cat the .sha256 and the manifest (createdAt and the file-name stamp are one instant)
respin-20261005T111355Z.dump.gz.gpg
respin-20261005T111355Z.manifest.json
respin-20261005T111355Z.sha256
4bfc488287629d4c1165da45659d1dcf3d337d8d9136028e5215c20a642acbbc *respin-20261005T111355Z.dump.gz.gpg
{
  "backupFile": "respin-20261005T111355Z.dump.gz.gpg",
  "sha256": "4bfc488287629d4c1165da45659d1dcf3d337d8d9136028e5215c20a642acbbc",
  "bytes": 59209,
  "createdAt": "2026-10-05T11:13:55Z",
  "retentionDays": 21,
  "expiresAt": "2026-10-26T11:13:55Z",
  "maxRetentionDays": 21,
  "sourceHost": "127.0.0.1",
  "sourcePort": 5435,
  "sourceDatabase": "respin_drill_source",
  "journalBucket": "respin-deletion-journal-local",
  "journalEnvironment": "local",
  "activeTombstones": [{"operationId" : "01a10bc3-2675-70df-9df6-a5b0ce3714b2", "scope" : "workspace", "state" : "grace"}],
  "note": "activeTombstones is null when the tombstone query could not run. A null is NOT an empty list: restore-drill.sh refuses to enable traffic on a null, because it cannot tell an absence of tombstones from an absence of an answer. The source* fields come from DATABASE_URL (never its user or password) and the journal* fields from RESPIN_DELETION_JOURNAL_*; they guard against mistakes and prove no origin."
}

### THE BACKUP DIRECTORY IS MOVED (the checksum names the file alone)
$ mv "r2 backups" "r2 moved/backups"

### DRILL 1 — production-shaped (no flag): the bindings print and pass; the empty money tables RAISE
$ (env block) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/r2 moved/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh
[drill] manifest: created 2026-10-05T11:13:55Z, effective expiry 2026-10-26T11:13:55.000Z, source 127.0.0.1:5435/respin_drill_source, journal respin-deletion-journal-local/local (matches this drill), active tombstones at backup time: 1
[drill] manifest bindings: backupFile = this dump; createdAt within 3600s of the file-name stamp and not in the future; sha256 = the dump's bytes; journal = this drill's
[drill] verifying checksum
[drill] recreating respin_restore_drill
NOTICE:  database "respin_restore_drill" does not exist, skipping
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
ERROR:  RESTORE INCOMPLETE: a money table came back empty (subscriptions=0 credit_ledger=2 stripe_events=0). A restored production database has rows in all three, so this backup lost the money and must not be relied on. A LOCAL drill against a fresh database may pass --allow-empty-money in local-drill mode (RUNBOOK.md, Restore drill — local).
CONTEXT:  PL/pgSQL function inline_code_block line 29 at RAISE
restore-drill.sh exit=3

### DRILL 2 — NO flag, but the drill points at a journal the manifest does not record: refused before anything is restored (gate round 2: the journal binding applies with or without the flag)
$ (env block) RESPIN_DELETION_JOURNAL_BUCKET=respin-deletion-journal-prod-770371751912 RESPIN_DELETION_JOURNAL_ENVIRONMENT=prod … bash respin/scripts/restore-drill.sh
FATAL: this backup was taken against journal "respin-deletion-journal-local"/"local", but this drill verifies "respin-deletion-journal-prod-770371751912"/"prod" — the dump was not taken against the journal this drill verifies, so verifying it there proves nothing. Set RESPIN_DELETION_JOURNAL_BUCKET and _ENVIRONMENT to the recorded journal, or drill a backup taken against this one.
restore-drill.sh exit=1

### DRILL 3 — a COPY of the backup whose manifest was edited: createdAt and expiresAt moved to 2099 (an edit, or a wrong clock): refused before anything is restored
$ (copy of the backup; manifest createdAt=2099-01-01T00:00:00Z, expiresAt=2099-01-22T00:00:00Z) … bash respin/scripts/restore-drill.sh --allow-empty-money
FATAL: respin/.tmp/drill/r2 edited/respin-20261005T111355Z.manifest.json fails its binding — createdAt 2099-01-01T00:00:00Z is in the future (now 2026-10-05T11:14:19.254Z, skew allowed 300s) — so this backup's age, and therefore whether it may still exist, is unknown. Take a fresh backup with scripts/backup.sh and drill that one.
restore-drill.sh exit=1

### DRILL 4 — local-drill mode, end to end: every manifest binding → restore → content → db:migrate on the drill database → journal verification
$ (env block) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/r2 moved/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh --allow-empty-money
EMPTY-MONEY-ALLOWED (local drill)
[drill] manifest: created 2026-10-05T11:13:55Z, effective expiry 2026-10-26T11:13:55.000Z, source 127.0.0.1:5435/respin_drill_source, journal respin-deletion-journal-local/local (matches this drill), active tombstones at backup time: 1
[drill] manifest bindings: backupFile = this dump; createdAt within 3600s of the file-name stamp and not in the future; sha256 = the dump's bytes; journal = this drill's
[drill] verifying checksum
[drill] recreating respin_restore_drill
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
NOTICE:  EMPTY MONEY TABLES ALLOWED (local drill): subscriptions=0 credit_ledger=2 stripe_events=0. This run proves nothing about restoring money.
NOTICE:  money-path checks passed on the restored dataset
[drill] comparing the restored migration ledger with the committed migrations
[drill]   migrations applied in the restored database: 62
[drill]   migration files committed in this checkout:  63
[drill]   the dump predates 1 committed migration(s); applying them to respin_restore_drill now (restore → migrate → verify)
migrations applied successfully
[drill]   migration COUNT matches (63, 1 applied by this drill); this is a cardinality check, not schema identity
[drill] extracting the restored deletion state for journal comparison
[drill] verifying the external deletion journal (R-124)
journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  reapply_tombstone  01a10bc3-2675-70df-9df6-a5b0ce3714b2 scope=workspace state=grace v4
JOURNAL VERIFIED. This is NOT yet permission to serve.
Every operation above has a row in the restored database, so the worker
can claim it. Before any worker or traffic is enabled:
  1. run the deletion worker against THIS database with the journal configured,
     so every reapply_tombstone / replay_erasure step above is executed;
  2. confirm the erasure transactions committed (a non-zero residue rolls them
     back and leaves the operation blocked, which is the intended outcome);
  3. only then enable workers, then traffic.
A standalone post-replay residue sweep is not wired into this script; the
residue check that exists today runs inside the executor's erasure
transaction. Until the production restore walk records one, treat step 2 as
the residue evidence and say so in the transcript.
RESTORE-VERIFY: JOURNAL VERIFIED
[drill] RESTORE DRILL PASSED (data restored, migrated by this drill: 1, journal verified, migration count matched)
  backup:   respin/.tmp/drill/r2 moved/backups/respin-20261005T111355Z.dump.gz.gpg
  restored: respin_restore_drill
  journal:  journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  money:    EMPTY TABLES ALLOWED — local drill, not evidence of a money restore
  date:     2026-10-05T11:14:25Z
THIS IS NOT PERMISSION TO SERVE. The replay plan printed above has not been
executed, and restore-verify refuses outright if any planned step names an
operation the restored database has no row for (the worker claims work from
that table, so it could never execute such a step). Before any worker or
traffic touches respin_restore_drill:
  1. run the deletion worker against it with the journal configured, so every
     reapply_tombstone / replay_erasure step is executed;
  2. confirm each erasure transaction committed -- a non-zero residue rolls it
     back and leaves the operation blocked, which is the intended outcome;
  3. only then enable workers, and only then traffic.
RECORD THIS RUN in RUNBOOK.md (Backups) and in the progress artifact — an
undocumented drill is a drill nobody can point at when it matters. Then drop the
drill database:
  psql "<your maintenance url>" -c 'DROP DATABASE respin_restore_drill WITH (FORCE);'
EMPTY-MONEY-ALLOWED (local drill)
restore-drill.sh exit=0

### CLEAN-UP
$ docker exec respin-postgres psql -U respin -d postgres -c 'DROP DATABASE respin_restore_drill WITH (FORCE)' -c 'DROP DATABASE respin_drill_source WITH (FORCE)'
DROP DATABASE
DROP DATABASE
$ docker stop respin-minio
respin-minio
```

---

## Superseded — the second run (gate round 1 scripts), earlier on 2026-10-05

Kept for the history. Run after round 1 and before round 2. Its manifest had the origin and journal fields, but `createdAt` was taken after the dump rather than from the stamp's instant, and the drill printed no bindings line. The journal match was checked only under `--allow-empty-money`.

```text
### LOCAL RESTORE DRILL (re-run on the gate-round-1 scripts) — 2026-10-05T10:48:14Z — host: MINGW64_NT-10.0-26200, bash 5.2.37(1)-release, node v24.18.0, pg client psql (PostgreSQL) 18.1, server postgres (PostgreSQL) 17.11

$ docker compose -f respin/docker-compose.yml --profile drill up -d --force-recreate minio minio-init   (a fresh, empty bucket)
respin-minio bitnamilegacy/minio:2025.7.23@sha256:8935e75fa5d11295c17171e4aa49efe390a1193cd7f12e4d21b92af9ffef09d7 Up 23 seconds (healthy) 127.0.0.1:9000->9000/tcp
journal objects before the seed: 0

$ docker exec respin-postgres psql -U respin -d postgres -c 'CREATE DATABASE respin_drill_source'
DROP DATABASE
NOTICE:  database "respin_drill_source" does not exist, skipping
CREATE DATABASE
$ DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source pnpm -C respin db:migrate && pnpm -C respin db:seed
migrations applied successfully
seed complete (idempotent — safe to re-run)

### SEED — app (pid-captured) + worker (pid-captured) with the RUNBOOK env block; one workspace deletion request through /settings/account
{"step":"signed-up","email":"drill.seed.1791197335461@example.test"}
{"step":"account-page","requestsClosed":false,"journalUnavailable":false}
{"step":"result","search":"?ok=workspace_requested"}
seed exit=0
{"code":"deletion_lifecycle_tick","observedAt":"2026-10-05T10:50:02.126Z","deletionClaimed":1,"deletionAdvanced":1,"deletionWaiting":0,"deletionBlocked":0,"deletionErased":0}
{"code":"deletion_lifecycle_tick","observedAt":"2026-10-05T10:51:02.194Z","deletionClaimed":1,"deletionAdvanced":1,"deletionWaiting":0,"deletionBlocked":0,"deletionErased":0}
$ mc ls --recursive --versions l/respin-deletion-journal-local
[2026-10-05 10:49:20 UTC]   566B STANDARD 821efc6f-24ac-4a18-8a06-3157585c9d44 v1 PUT local/deletion-journal/01a10bae-b100-7693-9c22-0804fadc6e11/000001.json
[2026-10-05 10:49:20 UTC]   629B STANDARD 7d006af5-ad54-41fd-8f7b-a140624cc922 v1 PUT local/deletion-journal/01a10bae-b100-7693-9c22-0804fadc6e11/000002.json
[2026-10-05 10:50:02 UTC]   638B STANDARD 42d3bced-4f7c-4120-aba2-3ac5dca556ee v1 PUT local/deletion-journal/01a10bae-b100-7693-9c22-0804fadc6e11/000003.json
[2026-10-05 10:51:02 UTC]   633B STANDARD 0fbd9631-b618-41d2-a974-591968e50e4d v1 PUT local/deletion-journal/01a10bae-b100-7693-9c22-0804fadc6e11/000004.json
$ select id, scope, state, journal_version from deletion_operations  (source)
01a10bae-b100-7693-9c22-0804fadc6e11|workspace|grace|4

### MAKE THE SOURCE OLDER THAN HEAD — revert migration 0062 and its ledger row (scratch source only)
BEGIN
DROP TABLE
DROP TYPE
ALTER TABLE
DELETE 1
COMMIT
 applied_migrations 
--------------------
                 62
(1 row)

committed migration files in this checkout: 63

### BACKUP — the env block exported in this shell too, so the manifest records the journal
$ (env block) PATH="/c/Program Files/PostgreSQL/18/bin:$PATH" DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source BACKUP_DIR="respin/.tmp/drill/rerun backups" BACKUP_PASSPHRASE_FILE=respin/.tmp/drill/drill.pass bash respin/scripts/backup.sh
[backup] dumping → respin/.tmp/drill/rerun backups/respin-20261005T105124Z.dump.gz.gpg
[backup] ok: respin/.tmp/drill/rerun backups/respin-20261005T105124Z.dump.gz.gpg (59521 bytes), checksum respin/.tmp/drill/rerun backups/respin-20261005T105124Z.sha256
[backup] manifest: respin/.tmp/drill/rerun backups/respin-20261005T105124Z.manifest.json (expires 2026-10-26T10:51:25Z, retention 21d)
[backup] pruning backups whose effective expiry has passed
[backup] health: backups_present=1 newest=respin-20261005T105124Z bytes=59521
backup.sh exit=0
$ cat the .sha256 and the manifest
33d6a012172cc1474763f7272f6fa843ae0865e2765478043f5d9f2e0d1a9358 *respin-20261005T105124Z.dump.gz.gpg
{
  "backupFile": "respin-20261005T105124Z.dump.gz.gpg",
  "sha256": "33d6a012172cc1474763f7272f6fa843ae0865e2765478043f5d9f2e0d1a9358",
  "bytes": 59521,
  "createdAt": "2026-10-05T10:51:25Z",
  "retentionDays": 21,
  "expiresAt": "2026-10-26T10:51:25Z",
  "maxRetentionDays": 21,
  "sourceHost": "127.0.0.1",
  "sourcePort": 5435,
  "sourceDatabase": "respin_drill_source",
  "journalBucket": "respin-deletion-journal-local",
  "journalEnvironment": "local",
  "activeTombstones": [{"operationId" : "01a10bae-b100-7693-9c22-0804fadc6e11", "scope" : "workspace", "state" : "grace"}],
  "note": "activeTombstones is null when the tombstone query could not run. A null is NOT an empty list: restore-drill.sh refuses to enable traffic on a null, because it cannot tell an absence of tombstones from an absence of an answer. The source* fields come from DATABASE_URL (never its user or password) and the journal* fields from RESPIN_DELETION_JOURNAL_*; they guard against mistakes and prove no origin."
}

### THE BACKUP DIRECTORY IS MOVED (the checksum names the file alone, so it must still verify)
$ mv "rerun backups" "rerun moved/backups"

### DRILL 1 — production-shaped (no flag): the empty money tables must RAISE
$ (env block) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/rerun moved/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh
[drill] manifest: created 2026-10-05T10:51:25Z, effective expiry 2026-10-26T10:51:25.000Z, source 127.0.0.1:5435/respin_drill_source, journal respin-deletion-journal-local/local, active tombstones at backup time: 1
[drill] verifying checksum
[drill] recreating respin_restore_drill
NOTICE:  database "respin_restore_drill" does not exist, skipping
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
ERROR:  RESTORE INCOMPLETE: a money table came back empty (subscriptions=0 credit_ledger=2 stripe_events=0). A restored production database has rows in all three, so this backup lost the money and must not be relied on. A LOCAL drill against a fresh database may pass --allow-empty-money in local-drill mode (RUNBOOK.md, Restore drill — local).
CONTEXT:  PL/pgSQL function inline_code_block line 29 at RAISE
restore-drill.sh exit=3

### DRILL 2 — --allow-empty-money against a NON-loopback journal endpoint: refused before anything runs
$ … RESPIN_DELETION_JOURNAL_ENDPOINT=https://s3.ap-southeast-2.amazonaws.com bash respin/scripts/restore-drill.sh --allow-empty-money
FATAL: --allow-empty-money is accepted only in local-drill mode, and RESPIN_DELETION_JOURNAL_ENDPOINT is "https://s3.ap-southeast-2.amazonaws.com", not the loopback MinIO journal (http://127.0.0.1:9000). A drill against a real database or journal must prove the money came back: drop the flag.
restore-drill.sh exit=1

### DRILL 3 — --allow-empty-money with a drill journal that is NOT the one the manifest records: refused (gate round 1's journal-match bound)
$ … RESPIN_DELETION_JOURNAL_ENVIRONMENT=staging bash respin/scripts/restore-drill.sh --allow-empty-money
FATAL: --allow-empty-money is accepted only in local-drill mode, and this backup's manifest records journal "respin-deletion-journal-local"/"local", not this drill's "respin-deletion-journal-local"/"staging" — the dump was not taken against the journal this drill verifies. A drill against a real database or journal must prove the money came back: drop the flag.
restore-drill.sh exit=1

### DRILL 4 — local-drill mode, end to end: manifest + effective expiry → restore → content → db:migrate on the drill database → journal verification
$ (env block) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/rerun moved/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh --allow-empty-money
EMPTY-MONEY-ALLOWED (local drill)
[drill] manifest: created 2026-10-05T10:51:25Z, effective expiry 2026-10-26T10:51:25.000Z, source 127.0.0.1:5435/respin_drill_source, journal respin-deletion-journal-local/local, active tombstones at backup time: 1
[drill] verifying checksum
[drill] recreating respin_restore_drill
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
NOTICE:  EMPTY MONEY TABLES ALLOWED (local drill): subscriptions=0 credit_ledger=2 stripe_events=0. This run proves nothing about restoring money.
NOTICE:  money-path checks passed on the restored dataset
[drill] comparing the restored migration ledger with the committed migrations
[drill]   migrations applied in the restored database: 62
[drill]   migration files committed in this checkout:  63
[drill]   the dump predates 1 committed migration(s); applying them to respin_restore_drill now (restore → migrate → verify)
migrations applied successfully
[drill]   migration COUNT matches (63, 1 applied by this drill); this is a cardinality check, not schema identity
[drill] extracting the restored deletion state for journal comparison
[drill] verifying the external deletion journal (R-124)
journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  reapply_tombstone  01a10bae-b100-7693-9c22-0804fadc6e11 scope=workspace state=grace v4
JOURNAL VERIFIED. This is NOT yet permission to serve.
Every operation above has a row in the restored database, so the worker
can claim it. Before any worker or traffic is enabled:
  1. run the deletion worker against THIS database with the journal configured,
     so every reapply_tombstone / replay_erasure step above is executed;
  2. confirm the erasure transactions committed (a non-zero residue rolls them
     back and leaves the operation blocked, which is the intended outcome);
  3. only then enable workers, then traffic.
A standalone post-replay residue sweep is not wired into this script; the
residue check that exists today runs inside the executor's erasure
transaction. Until the production restore walk records one, treat step 2 as
the residue evidence and say so in the transcript.
RESTORE-VERIFY: JOURNAL VERIFIED
[drill] RESTORE DRILL PASSED (data restored, migrated by this drill: 1, journal verified, migration count matched)
  backup:   respin/.tmp/drill/rerun moved/backups/respin-20261005T105124Z.dump.gz.gpg
  restored: respin_restore_drill
  journal:  journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  money:    EMPTY TABLES ALLOWED — local drill, not evidence of a money restore
  date:     2026-10-05T10:51:52Z
THIS IS NOT PERMISSION TO SERVE. The replay plan printed above has not been
executed, and restore-verify refuses outright if any planned step names an
operation the restored database has no row for (the worker claims work from
that table, so it could never execute such a step). Before any worker or
traffic touches respin_restore_drill:
  1. run the deletion worker against it with the journal configured, so every
     reapply_tombstone / replay_erasure step is executed;
  2. confirm each erasure transaction committed -- a non-zero residue rolls it
     back and leaves the operation blocked, which is the intended outcome;
  3. only then enable workers, and only then traffic.
RECORD THIS RUN in RUNBOOK.md (Backups) and in the progress artifact — an
undocumented drill is a drill nobody can point at when it matters. Then drop the
drill database:
  psql "<your maintenance url>" -c 'DROP DATABASE respin_restore_drill WITH (FORCE);'
EMPTY-MONEY-ALLOWED (local drill)
restore-drill.sh exit=0

### CLEAN-UP
$ docker exec respin-postgres psql -U respin -d postgres -c 'DROP DATABASE respin_restore_drill WITH (FORCE)' -c 'DROP DATABASE respin_drill_source WITH (FORCE)'
DROP DATABASE
DROP DATABASE
$ docker stop respin-minio
respin-minio
```
---

## Superseded — the first run, earlier on 2026-10-05, before the gate's round-1 changes

Kept for the history. It ran against the scripts as first built. Its manifest has no `sourcePort`, `sourceDatabase` or journal fields; the drill printed `expires …` rather than the effective expiry; and the journal-match bound did not exist yet. Its findings still stand as recorded: notably, with the journal names on the app only, the seed was not red.

### (superseded) Local restore drill — first run, 2026-10-05

**What this is.** The transcript of `respin/scripts/restore-drill.sh` run end to end **as a script**, on a developer machine, in the local-drill mode (RUNBOOK.md, Respin → *Restore drill — local*): a real workspace deletion request made through the app's own UI, journaled to a loopback MinIO bucket by the real S3 writer, a real `backup.sh` dump of a source database deliberately left **one migration behind head**, and the drill restoring it, migrating it, and verifying it against that journal. Commands are quoted as run; the local database password in connection strings is masked as `***` in the echoed command lines.

**What this is not.** It is **not** the production restore walk: it carries the `EMPTY-MONEY-ALLOWED (local drill)` line, so it closes nothing in todos.md T-23, and `RUNBOOK.md`'s "Last production drill: NEVER" stays NEVER. No real backup, account or bucket was involved.

**Read in order:** the seed (four journal versions for one operation) → the source aged by one migration → the backup (exit 0, `sourceHost` recorded, a checksum line naming the file alone) → the backup directory moved → DRILL 1 without the flag (the empty money tables RAISE) → DRILL 2 (the flag refused against a non-loopback endpoint) → **DRILL 3, the pass** (one migration applied by the drill between restore and verify; `journal_operations=1`, four versions, verified; the marker first and last; exit 0) → the three withheld-variable seeds → the verifier run from a path with a space (its success marker printed) → DRILL 4, the same backup re-drilled after a later request, **refused** as a pre-request backup.

**One AC3 expectation did not hold as written, recorded as measured:** with the journal names on the app only (run C), the seed is **not** red — the app journals the request's first two versions itself. The failure lands at the worker instead: it composes the refusing journal, advances nothing (`deletionAdvanced:0`, `deletionWaiting:2`), and the operation stays at `tombstoned` v2 with no third version. Runs A (scopes blank: controls closed) and B (no AWS keys: `?e=journal_unavailable`) are red at the seed.

```text
### LOCAL RESTORE DRILL — 2026-10-05T08:07:21Z — host: MINGW64_NT-10.0-26200, bash 5.2.37(1)-release, node v24.18.0, pg client psql (PostgreSQL) 18.1, server postgres (PostgreSQL) 17.11

$ docker compose -f respin/docker-compose.yml --profile drill ps minio
respin-minio bitnamilegacy/minio:2025.7.23@sha256:8935e75fa5d11295c17171e4aa49efe390a1193cd7f12e4d21b92af9ffef09d7 Up 32 minutes (healthy) 127.0.0.1:9000->9000/tcp

$ docker exec respin-postgres psql -U respin -d postgres -c 'CREATE DATABASE respin_drill_source'
DROP DATABASE
NOTICE:  database "respin_drill_source" does not exist, skipping
CREATE DATABASE

$ DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source pnpm -C respin db:migrate && pnpm -C respin db:seed

migrations applied successfully
> tsx src/seed-cli.ts

seed complete (idempotent — safe to re-run)

### SEED — app + worker with the RUNBOOK env block (scopes=workspace, journal on both, MinIO keys on both)
{"step":"signed-up","email":"drill.seed.1791187731397@example.test"}
{"step":"account-page","requestsClosed":false,"journalUnavailable":false}
{"step":"result","search":"?ok=workspace_requested"}
seed exit=0
$ mc ls --recursive --versions l/respin-deletion-journal-local
[2026-10-05 08:09:07 UTC]   566B STANDARD f2a5d7c7-59b1-46d3-870e-74fa893dd168 v1 PUT local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000001.json
[2026-10-05 08:09:07 UTC]   629B STANDARD 614f7c4d-0adc-4163-be8a-f310d6f73886 v1 PUT local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000002.json
[2026-10-05 08:09:32 UTC]   638B STANDARD 4dfee726-87ff-44af-ad2b-be0490607c50 v1 PUT local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000003.json
[2026-10-05 08:10:02 UTC]   633B STANDARD 2471dbe6-cab5-4b7b-9485-7deb0ed28af7 v1 PUT local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000004.json
$ select id, scope, state, journal_version from deletion_operations  (source)
01a10b1c-0396-7dd7-93ae-e9260bfd7e5b|workspace|grace|4

### MAKE THE SOURCE OLDER THAN HEAD — revert migration 0062 and its ledger row (scratch source only)
$ psql respin_drill_source: DROP TABLE creative_pieces; DROP TYPE creative_piece_state; ALTER TABLE generation_attempts DROP COLUMN intent_sha256, DROP COLUMN request_snapshot; DELETE the newest drizzle.__drizzle_migrations row
BEGIN
DROP TABLE
DROP TYPE
ALTER TABLE
DELETE 1
COMMIT
 applied_migrations 
--------------------
                 62
(1 row)

committed migration files in this checkout: 63

### BACKUP
$ PATH="/c/Program Files/PostgreSQL/18/bin:$PATH" DATABASE_URL=postgres://respin:***@127.0.0.1:5435/respin_drill_source BACKUP_DIR="respin/.tmp/drill/backups dir" BACKUP_PASSPHRASE_FILE=respin/.tmp/drill/drill.pass bash respin/scripts/backup.sh
[backup] dumping → respin/.tmp/drill/backups dir/respin-20261005T081110Z.dump.gz.gpg
[backup] ok: respin/.tmp/drill/backups dir/respin-20261005T081110Z.dump.gz.gpg (59472 bytes), checksum respin/.tmp/drill/backups dir/respin-20261005T081110Z.sha256
[backup] manifest: respin/.tmp/drill/backups dir/respin-20261005T081110Z.manifest.json (expires 2026-10-26T08:11:18Z, retention 21d)
[backup] pruning backups whose recorded expiry has passed
[backup] health: backups_present=1 newest=respin-20261005T081110Z bytes=59472
backup.sh exit=0
$ ls "backups dir"; cat the .sha256 and the manifest
respin-20261005T081110Z.dump.gz.gpg
respin-20261005T081110Z.manifest.json
respin-20261005T081110Z.sha256
cf15c8f9409089480df00fd7314e600f7b3b4c6a68f2a70aa7638a7cc86fb325 *respin-20261005T081110Z.dump.gz.gpg
{
  "backupFile": "respin-20261005T081110Z.dump.gz.gpg",
  "sha256": "cf15c8f9409089480df00fd7314e600f7b3b4c6a68f2a70aa7638a7cc86fb325",
  "bytes": 59472,
  "createdAt": "2026-10-05T08:11:18Z",
  "retentionDays": 21,
  "expiresAt": "2026-10-26T08:11:18Z",
  "maxRetentionDays": 21,
  "sourceHost": "127.0.0.1",
  "activeTombstones": [{"operationId" : "01a10b1c-0396-7dd7-93ae-e9260bfd7e5b", "scope" : "workspace", "state" : "grace"}],
  "note": "activeTombstones is null when the tombstone query could not run. A null is NOT an empty list: restore-drill.sh refuses to enable traffic on a null, because it cannot tell an absence of tombstones from an absence of an answer. sourceHost is the source database's host only."
}

### THE BACKUP DIRECTORY IS MOVED (checksum must still verify)
$ mv "backups dir" "moved elsewhere/backups"

### DRILL 1 — production-shaped (no flag): the empty money tables must RAISE
$ (env block exported) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/moved elsewhere/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh
[drill] manifest: created 2026-10-05T08:11:18Z, expires 2026-10-26T08:11:18Z, source host 127.0.0.1, active tombstones at backup time: 1
[drill] verifying checksum
[drill] recreating respin_restore_drill
NOTICE:  database "respin_restore_drill" does not exist, skipping
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
ERROR:  RESTORE INCOMPLETE: a money table came back empty (subscriptions=0 credit_ledger=2 stripe_events=0). A restored production database has rows in all three, so this backup lost the money and must not be relied on. A LOCAL drill against a fresh database may pass --allow-empty-money in local-drill mode (RUNBOOK.md, Restore drill — local).
CONTEXT:  PL/pgSQL function inline_code_block line 29 at RAISE
restore-drill.sh exit=3

### DRILL 2 — --allow-empty-money with a NON-loopback journal endpoint: must be refused before anything runs
$ … RESPIN_DELETION_JOURNAL_ENDPOINT=https://s3.ap-southeast-2.amazonaws.com bash respin/scripts/restore-drill.sh --allow-empty-money
FATAL: --allow-empty-money is accepted only in local-drill mode, and RESPIN_DELETION_JOURNAL_ENDPOINT is "https://s3.ap-southeast-2.amazonaws.com", not the loopback MinIO journal (http://127.0.0.1:9000). A drill against a real journal must prove the money came back: drop the flag.
restore-drill.sh exit=1

### DRILL 3 — local-drill mode, end to end: restore → content → db:migrate on the drill database → journal verification
$ (env block exported) RESTORE_SERVING_DISABLED=confirmed BACKUP_FILE="…/moved elsewhere/backups/respin-…dump.gz.gpg" BACKUP_PASSPHRASE_FILE=… MAINTENANCE_URL=postgres://respin:***@127.0.0.1:5435/postgres bash respin/scripts/restore-drill.sh --allow-empty-money
EMPTY-MONEY-ALLOWED (local drill)
[drill] manifest: created 2026-10-05T08:11:18Z, expires 2026-10-26T08:11:18Z, source host 127.0.0.1, active tombstones at backup time: 1
[drill] verifying checksum
[drill] recreating respin_restore_drill
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
NOTICE:  EMPTY MONEY TABLES ALLOWED (local drill): subscriptions=0 credit_ledger=2 stripe_events=0. This run proves nothing about restoring money.
NOTICE:  money-path checks passed on the restored dataset
[drill] comparing the restored migration ledger with the committed migrations
[drill]   migrations applied in the restored database: 62
[drill]   migration files committed in this checkout:  63
[drill]   the dump predates 1 committed migration(s); applying them to respin_restore_drill now (restore → migrate → verify)

> respin@0.0.0 db:migrate C:\projects\ai.playground\trendMonitor\respin
> pnpm --filter @respin/db db:migrate


> @respin/db@0.0.0 db:migrate C:\projects\ai.playground\trendMonitor\respin\packages\db
> tsx src/migrate-cli.ts

migrations applied successfully
[drill]   migration COUNT matches (63, 1 applied by this drill); this is a cardinality check, not schema identity
[drill] extracting the restored deletion state for journal comparison
[drill] verifying the external deletion journal (R-124)

journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  reapply_tombstone  01a10b1c-0396-7dd7-93ae-e9260bfd7e5b scope=workspace state=grace v4

JOURNAL VERIFIED. This is NOT yet permission to serve.

Every operation above has a row in the restored database, so the worker
can claim it. Before any worker or traffic is enabled:
  1. run the deletion worker against THIS database with the journal configured,
     so every reapply_tombstone / replay_erasure step above is executed;
  2. confirm the erasure transactions committed (a non-zero residue rolls them
     back and leaves the operation blocked, which is the intended outcome);
  3. only then enable workers, then traffic.

A standalone post-replay residue sweep is not wired into this script; the
residue check that exists today runs inside the executor's erasure
transaction. Until the production restore walk records one, treat step 2 as
the residue evidence and say so in the transcript.

RESTORE-VERIFY: JOURNAL VERIFIED

[drill] RESTORE DRILL PASSED (data restored, migrated by this drill: 1, journal verified, migration count matched)
  backup:   respin/.tmp/drill/moved elsewhere/backups/respin-20261005T081110Z.dump.gz.gpg
  restored: respin_restore_drill
  journal:  journal_operations=1 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=0
  money:    EMPTY TABLES ALLOWED — local drill, not evidence of a money restore
  date:     2026-10-05T08:11:57Z

THIS IS NOT PERMISSION TO SERVE. The replay plan printed above has not been
executed, and restore-verify refuses outright if any planned step names an
operation the restored database has no row for (the worker claims work from
that table, so it could never execute such a step). Before any worker or
traffic touches respin_restore_drill:
  1. run the deletion worker against it with the journal configured, so every
     reapply_tombstone / replay_erasure step is executed;
  2. confirm each erasure transaction committed -- a non-zero residue rolls it
     back and leaves the operation blocked, which is the intended outcome;
  3. only then enable workers, and only then traffic.

RECORD THIS RUN in RUNBOOK.md (Backups) and in the progress artifact — an
undocumented drill is a drill nobody can point at when it matters. Then drop the
drill database:
  psql "<your maintenance url>" -c 'DROP DATABASE respin_restore_drill WITH (FORCE);'
EMPTY-MONEY-ALLOWED (local drill)
restore-drill.sh exit=0

### AC3 — THE ENV BLOCK IS SUFFICIENT, AND EACH WITHHELD VARIABLE IS RED BEFORE THE VERIFY
(each launcher exports every name — set, or explicitly blank — so respin/.env.local cannot supply a withheld one: @next/env never overrides a key already in process.env)

-- run A: RESPIN_DELETION_REQUEST_SCOPES blank on the app
{"step":"signed-up","email":"drill.seed.1791187956907@example.test"}
{"step":"account-page","requestsClosed":true,"journalUnavailable":false}
seed exit=3

-- run B: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY blank on the app (shared credentials file and IMDS disabled)
{"step":"signed-up","email":"drill.seed.1791187999919@example.test"}
{"step":"account-page","requestsClosed":false,"journalUnavailable":false}
{"step":"result","search":"?e=journal_unavailable"}
seed exit=5
[account-action] refused { code: 'unknown', errorName: 'Error' }

-- run C: the four journal names on the app only (blank on the worker)
{"step":"signed-up","email":"drill.seed.1791188056954@example.test"}
{"step":"account-page","requestsClosed":false,"journalUnavailable":false}
{"step":"result","search":"?ok=workspace_requested"}
seed exit=0
[worker] journal_bucket='' aws_key_set=yes
{"code":"deletion_lifecycle_tick","observedAt":"2026-10-05T08:16:01.016Z","deletionClaimed":2,"deletionAdvanced":0,"deletionWaiting":2,"deletionBlocked":0,"deletionErased":0}
$ deletion_operations (source)
01a10b1c-0396-7dd7-93ae-e9260bfd7e5b|workspace|grace|4
01a10b20-2785-7742-b015-7fc227896156|workspace|requested|0
01a10b20-f623-7b37-a2fe-f52ea2e81966|workspace|tombstoned|2
$ journal keys
local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000001.json
local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000002.json
local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000003.json
local/deletion-journal/01a10b1c-0396-7dd7-93ae-e9260bfd7e5b/000004.json
local/deletion-journal/01a10b20-f623-7b37-a2fe-f52ea2e81966/000001.json
local/deletion-journal/01a10b20-f623-7b37-a2fe-f52ea2e81966/000002.json

### THE VERIFIER RUN FROM A PATH CONTAINING A SPACE, against the live loopback journal and the source database operations
$ node --import tsx "respin/.tmp/restore verify space path/restore-verify.ts" --operations "…/operations.json"
pre-journal  01a10b20-2785-7742-b015-7fc227896156 state=requested — no journal version was ever written (v0); the worker will append when it next claims it

journal_operations=2 unparseable_keys=0 restored_operations=3 pre_journal=1 purged=0 conflicts=0
  reapply_tombstone  01a10b1c-0396-7dd7-93ae-e9260bfd7e5b scope=workspace state=grace v4
  reapply_tombstone  01a10b20-f623-7b37-a2fe-f52ea2e81966 scope=workspace state=tombstoned v2

JOURNAL VERIFIED. This is NOT yet permission to serve.

Every operation above has a row in the restored database, so the worker
can claim it. Before any worker or traffic is enabled:
  1. run the deletion worker against THIS database with the journal configured,
     so every reapply_tombstone / replay_erasure step above is executed;
  2. confirm the erasure transactions committed (a non-zero residue rolls them
     back and leaves the operation blocked, which is the intended outcome);
  3. only then enable workers, then traffic.

A standalone post-replay residue sweep is not wired into this script; the
residue check that exists today runs inside the executor's erasure
transaction. Until the production restore walk records one, treat step 2 as
the residue evidence and say so in the transcript.

RESTORE-VERIFY: JOURNAL VERIFIED
exit=0

### DRILL 4 — the SAME backup, re-drilled after a later deletion request was journaled (run C above): the pre-request backup must be REFUSED
$ (env block) … bash respin/scripts/restore-drill.sh --allow-empty-money
EMPTY-MONEY-ALLOWED (local drill)
[drill] manifest: created 2026-10-05T08:11:18Z, expires 2026-10-26T08:11:18Z, source host 127.0.0.1, active tombstones at backup time: 1
[drill] verifying checksum
[drill] recreating respin_restore_drill
DROP DATABASE
CREATE DATABASE
[drill] decrypting and restoring
gpg: AES256.CFB encrypted data
gpg: encrypted with 1 passphrase
[drill] verifying representative rows
NOTICE:  workspaces=3 subscriptions=0 credit_ledger=2 stripe_events=0 config_versions=1
NOTICE:  EMPTY MONEY TABLES ALLOWED (local drill): subscriptions=0 credit_ledger=2 stripe_events=0. This run proves nothing about restoring money.
NOTICE:  money-path checks passed on the restored dataset
[drill] comparing the restored migration ledger with the committed migrations
[drill]   migrations applied in the restored database: 62
[drill]   migration files committed in this checkout:  63
[drill]   the dump predates 1 committed migration(s); applying them to respin_restore_drill now (restore → migrate → verify)
migrations applied successfully
[drill]   migration COUNT matches (63, 1 applied by this drill); this is a cardinality check, not schema identity
[drill] extracting the restored deletion state for journal comparison
[drill] verifying the external deletion journal (R-124)
CONFLICT 01a10b20-f623-7b37-a2fe-f52ea2e81966 journal_operation_absent_from_database: the journal records this operation at tombstoned (v2) and needs "reapply_tombstone", but the restored database has no row for it, so the worker cannot claim it. The backup predates the request. Re-materialising a journal-only operation is not implemented; this restore must not serve.
journal_operations=2 unparseable_keys=0 restored_operations=1 pre_journal=0 purged=0 conflicts=1
  reapply_tombstone  01a10b1c-0396-7dd7-93ae-e9260bfd7e5b scope=workspace state=grace v4
  reapply_tombstone  01a10b20-f623-7b37-a2fe-f52ea2e81966 scope=workspace state=tombstoned v2
RESTORE REFUSED. Do not enable workers or traffic. Every conflict above must be explained before this database serves anyone.
FATAL: the external deletion journal did not verify against this restore (restore-verify exited 2).
Do NOT enable workers or traffic on respin_restore_drill.
EMPTY-MONEY-ALLOWED (local drill)
restore-drill.sh exit=1

### CLEAN-UP
$ docker exec respin-postgres psql -U respin -d postgres -c 'DROP DATABASE respin_restore_drill WITH (FORCE)' -c 'DROP DATABASE respin_drill_source WITH (FORCE)'
DROP DATABASE
DROP DATABASE
$ docker compose -f respin/docker-compose.yml --profile drill stop minio
 Container respin-minio Stopped
```
