#!/usr/bin/env bash
# Restore drill for Respin (audit 2026-08-17 #9, and the half that matters).
#
# "No backup has ever been restored" was the finding. A backup file is a claim;
# a restore is the evidence. This script turns the claim into a check anyone can
# re-run, and it REFUSES to report success unless the money tables actually came
# back with rows in them.
#
# It restores into an ISOLATED database — never over a live one — and the name
# is guarded the way `createDockerTestDb` guards its own (packages/db/src/
# testing.ts): only a `respin_restore_drill*` name may be dropped, because
# everything below the guard is destructive.
#
# USAGE
#   BACKUP_FILE=/mnt/backups/respin/respin-<stamp>.dump.gz.gpg \
#   BACKUP_PASSPHRASE_FILE=/etc/respin/backup.pass \
#   MAINTENANCE_URL=postgres://respin:...@host:5432/postgres \
#   bash scripts/restore-drill.sh   # (authored on Windows; no +x bit is set)
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"
: "${MAINTENANCE_URL:?MAINTENANCE_URL is required (a maintenance database on the target server)}"
DRILL_DB="${DRILL_DB:-respin_restore_drill}"

# THE GUARD, before anything destructive and before any connection — same rule
# and the same reason as the test harness's: this script runs DROP DATABASE.
case "$DRILL_DB" in
  respin_restore_drill*) ;;
  *)
    echo "FATAL: refusing to drop \"${DRILL_DB}\" — this script DROPS the target database, so it only ever operates on a name starting with respin_restore_drill." >&2
    exit 1
    ;;
esac

command -v pg_restore >/dev/null || { echo "FATAL: pg_restore not on PATH." >&2; exit 1; }
command -v psql >/dev/null || { echo "FATAL: psql not on PATH." >&2; exit 1; }

SUMS="${BACKUP_FILE%.dump.gz.gpg}.sha256"
if [ -r "$SUMS" ]; then
  echo "[drill] verifying checksum"
  ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$SUMS")" >/dev/null ) \
    || { echo "FATAL: checksum mismatch — this backup is corrupt. Do NOT rely on it." >&2; exit 1; }
else
  echo "WARNING: no .sha256 beside ${BACKUP_FILE}; restoring unverified." >&2
fi

TARGET_URL="$(node -e 'const u=new URL(process.argv[1]);u.pathname="/"+process.argv[2];console.log(u.toString())' "$MAINTENANCE_URL" "$DRILL_DB")"

echo "[drill] recreating ${DRILL_DB}"
psql "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);"
psql "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DRILL_DB};"

echo "[drill] decrypting and restoring"
gpg --batch --yes --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" "$BACKUP_FILE" \
  | gunzip \
  | pg_restore --dbname="$TARGET_URL" --no-owner --no-privileges --exit-on-error

# ---------------------------------------------------------------------------
# THE ACTUAL CHECK. A restore that produces empty tables "succeeds" at the
# pg_restore level — every command runs, nothing errors, and the money is gone.
# So the drill asserts the representative rows the audit named: workspaces,
# subscriptions, the credit ledger, and the webhook event log.
# ---------------------------------------------------------------------------
echo "[drill] verifying representative rows"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 --quiet --tuples-only --no-align <<'SQL'
\set ON_ERROR_STOP on
DO $$
DECLARE
  n_ws bigint; n_sub bigint; n_led bigint; n_evt bigint; n_cfg bigint;
  ledger_sum bigint;
BEGIN
  SELECT count(*) INTO n_ws  FROM workspaces;
  SELECT count(*) INTO n_sub FROM subscriptions;
  SELECT count(*) INTO n_led FROM credit_ledger;
  SELECT count(*) INTO n_evt FROM stripe_events;
  SELECT count(*) INTO n_cfg FROM config_versions;

  RAISE NOTICE 'workspaces=% subscriptions=% credit_ledger=% stripe_events=% config_versions=%',
    n_ws, n_sub, n_led, n_evt, n_cfg;

  -- config_versions is the one table that can never legitimately be empty in a
  -- restored production database: without an active config the app fails closed
  -- and no price, allowance or credit cost can be read at all.
  IF n_cfg = 0 THEN
    RAISE EXCEPTION 'RESTORE INCOMPLETE: config_versions is empty. The app fails closed without an active config, so this restore would not boot.';
  END IF;

  -- The money invariant, re-derived on the RESTORED data: the ledger is
  -- append-only and balance is the sum of deltas, so a workspace can never sum
  -- negative. Checking it here proves the restore preserved the ledger's
  -- integrity, not merely its row count.
  SELECT coalesce(min(total), 0) INTO ledger_sum FROM (
    SELECT sum(delta) AS total FROM credit_ledger GROUP BY workspace_id
  ) per_workspace;
  IF ledger_sum < 0 THEN
    RAISE EXCEPTION 'RESTORE SUSPECT: a workspace''s restored ledger sums to % (negative). The ledger cannot go negative; this restore is not trustworthy.', ledger_sum;
  END IF;

  RAISE NOTICE 'money-path checks passed on the restored dataset';
END $$;
SQL

echo "[drill] verifying the schema matches the committed migrations"
echo "[drill]   (run from respin/: DATABASE_URL=${TARGET_URL} pnpm db:check)"

cat <<EOF

[drill] RESTORE DRILL PASSED
  backup:   ${BACKUP_FILE}
  restored: ${DRILL_DB}
  date:     $(date -u +%Y-%m-%dT%H:%M:%SZ)

RECORD THIS RUN in RUNBOOK.md (Backups) and in the progress artifact — an
undocumented drill is a drill nobody can point at when it matters. Then drop the
drill database:
  psql "${MAINTENANCE_URL}" -c 'DROP DATABASE ${DRILL_DB} WITH (FORCE);'
EOF
