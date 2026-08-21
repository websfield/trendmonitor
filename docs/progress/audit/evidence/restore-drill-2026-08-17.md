# Restore-drill rehearsal — 2026-08-17

**Finding:** audit #9 — *"no backup exists, and none has ever been restored, for
the one dataset that is money."* (`docs/progress/audit/2026-08-17.md`)

**Status: PARTIALLY CLOSED. The production drill is NOT done and is not claimed.**

Read the two halves separately, because conflating them is exactly what the
audit's own rule about engineering-vs-evidence claims forbids:

| Half | State |
|---|---|
| Backup + restore **tooling exists and works** | **DONE**, rehearsed end-to-end below |
| A **production** backup has been taken and restored | **NOT DONE — blocked on deployment.** Lightsail is unprovisioned; there is no production database to back up. |

The remediation plan says this explicitly: R3's backup portion *"cannot be
claimed complete from local Docker volume tests."* This document is the local
rehearsal, and it is labelled as one.

---

## What was rehearsed

Against the **local Docker dev database** (`respin-postgres`, the container
`respin/docker-compose.yml` defines), which carries the real M1 Stripe
evidence-run data — not a synthetic fixture.

Scripts: `respin/scripts/backup.sh`, `respin/scripts/restore-drill.sh`. The
rehearsal drove the same command chain those scripts run (`pg_dump -Fc` → `gzip
-9` → `gpg --symmetric AES256` → `sha256sum` → `gpg -d` → `gunzip` →
`pg_restore`); `pg_dump`/`psql` ran inside the container and `gpg`/`sha256sum` on
the host, because neither environment has both.

### 1. Backup

```
docker exec respin-postgres pg_dump --format=custom --no-owner --no-privileges
  | gzip -9 | gpg --batch --symmetric --cipher-algo AES256 --passphrase-file …
```

- artifact written: `respin-drill.dump.gz.gpg`, **23 927 bytes**
- `sha256sum -c respin-drill.sha256` → **OK**

### 2. Restore into an isolated database

`respin_restore_drill`, created fresh (never over a live database; the script
guards the name the way `createDockerTestDb` guards its own, because everything
past that point runs `DROP DATABASE`).

`pg_restore --no-owner --no-privileges --exit-on-error` → **RESTORE OK**

### 3. Verification on the restored data — the part that matters

A restore that produces empty tables "succeeds" at the `pg_restore` level. So
the drill asserts content, and the assertions ran green:

```
NOTICE:  workspaces=4 subscriptions=1 credit_ledger=3 stripe_events=62 config_versions=3
NOTICE:  money-path checks passed on the restored dataset
```

- **representative rows present** in all four tables the audit named
  (workspaces, subscriptions, credit ledger, webhook events), plus
  `config_versions`;
- **the ledger's money invariant re-derived on the restored data** — no
  workspace's `sum(delta)` is negative. Row counts alone would not have caught a
  restore that preserved rows but corrupted deltas;
- **schema parity**: `DATABASE_URL=…/respin_restore_drill pnpm db:check` →
  `Everything's fine 🐶🔥`. The restored database matches the committed
  migrations, so the app would boot against it.

### 4. The guard is NOT decorative

Verified by running the empty-config branch against a database with an empty
`config_versions`:

```
ERROR:  RESTORE INCOMPLETE: config_versions is empty. The app fails closed
        without an active config, so this restore would not boot.
```

A drill that cannot fail proves nothing; this one fails on the condition it
claims to detect.

### 5. Cleanup

Both drill databases dropped; the rehearsal passphrase file deleted. The
passphrase used was a throwaway literal and is not a credential.

---

## What this does NOT prove

Stated plainly, because the plan's stop condition requires it:

1. **Nothing about production.** No production database exists yet. Storage
   independence, the backup schedule, retention on real storage, credential
   least-privilege, and failure alerting are all **unverified** — every one of
   them is a property of a deployment that has not happened.
2. **Storage independence in particular is untested.** The rehearsal wrote to
   local disk. `backup.sh` refuses to default `BACKUP_DIR` for exactly this
   reason, but "the script demands it" is not "the deployment provides it".
3. **No schedule exists.** Nothing runs `backup.sh` periodically; there is no
   cron, no timer, no alert on absence.

**Before the first production deploy, #9 requires:** a scheduled backup to
independent storage, running with least-privilege credentials, with failure
*and absence* alerting — and one real restore drill against a real backup,
recorded in `RUNBOOK.md` with its date and result.

**Owner:** whoever owns the Lightsail deploy plan.
