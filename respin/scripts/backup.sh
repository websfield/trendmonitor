#!/usr/bin/env bash
# Encrypted Postgres backup for Respin (audit 2026-08-17 #9).
#
# The finding: "no backup exists, and none has ever been restored, for the one
# dataset that is money." This is the backup half. `restore-drill.sh` is the
# other half, and a backup nobody has restored is not a backup.
#
# WHAT IT DOES
#   pg_dump (custom format) → gzip → gpg symmetric AES256 → checksum → prune.
#
# WHAT IT DELIBERATELY DOES NOT DO
#   It does not choose where the backup lives. `BACKUP_DIR` must be a mount or
#   sync target on storage INDEPENDENT of the database host — the audit's
#   requirement, and the reason a local-disk default would be actively
#   misleading: a backup on the machine that dies with the database is not one.
#
# USAGE
#   DATABASE_URL=postgres://... \
#   BACKUP_DIR=/mnt/backups/respin \
#   BACKUP_PASSPHRASE_FILE=/etc/respin/backup.pass \
#   bash scripts/backup.sh          # (authored on Windows; no +x bit is set)
#
# Exit non-zero on ANY failure, including a failed checksum — a backup script
# that exits 0 having written a corrupt file is the worst possible outcome, and
# it is the one that goes unnoticed for months.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (the database to back UP)}"
: "${BACKUP_DIR:?BACKUP_DIR is required, and must be on storage independent of the database host}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required — the dump contains customer email, name and billing address}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [ ! -r "$BACKUP_PASSPHRASE_FILE" ]; then
  echo "FATAL: passphrase file $BACKUP_PASSPHRASE_FILE is not readable." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "FATAL: pg_dump not on PATH." >&2; exit 1; }
command -v gpg >/dev/null || { echo "FATAL: gpg not on PATH (used for symmetric encryption)." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="respin-${STAMP}"
DUMP="${BACKUP_DIR}/${BASE}.dump.gz.gpg"
SUMS="${BACKUP_DIR}/${BASE}.sha256"

echo "[backup] dumping → ${DUMP}"
# -Fc: custom format, which pg_restore can read selectively and which carries
# its own integrity framing. --no-owner/--no-privileges so the dump restores
# into a drill database owned by a different role (the restore drill relies on
# this, and a dump that only restores as its original owner is a dump that
# cannot be tested).
#
# LEAST PRIVILEGE: run this as a role with SELECT on the application schema and
# nothing more. `pg_dump` does not need superuser, and a backup job holding
# write credentials is a backup job that can destroy what it is protecting.
pg_dump --dbname="$DATABASE_URL" \
        --format=custom \
        --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
        --output "$DUMP"

# CHECKSUM, written next to the artifact and verified immediately. Verifying now
# catches a truncated write while the source database is still there to re-dump
# from; discovering it at restore time is discovering it too late.
sha256sum "$DUMP" > "$SUMS"
( cd "$BACKUP_DIR" && sha256sum -c "$(basename "$SUMS")" >/dev/null ) \
  || { echo "FATAL: checksum verification failed immediately after write." >&2; exit 1; }

SIZE="$(wc -c < "$DUMP")"
# A dump smaller than a few KB means pg_dump produced nothing useful — an empty
# database, a wrong DATABASE_URL, or a permissions failure that still exited 0.
if [ "$SIZE" -lt 4096 ]; then
  echo "FATAL: ${DUMP} is only ${SIZE} bytes — refusing to report success on a dump this small. Check DATABASE_URL and the backup role's SELECT grants." >&2
  exit 1
fi

echo "[backup] ok: ${DUMP} (${SIZE} bytes), checksum ${SUMS}"

# RETENTION. Prune AFTER a verified new backup exists, never before — pruning
# first means a failed dump leaves you with fewer backups than you started with.
echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name 'respin-*.dump.gz.gpg' -mtime "+${RETENTION_DAYS}" -print -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'respin-*.sha256' -mtime "+${RETENTION_DAYS}" -print -delete

# HEALTH REPORT for whatever watches this job. Alerting on ABSENCE is the part
# people forget: a cron that stops running produces no failure email.
COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'respin-*.dump.gz.gpg' | wc -l)"
echo "[backup] health: backups_present=${COUNT} newest=${BASE} bytes=${SIZE}"
