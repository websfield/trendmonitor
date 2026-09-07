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
# R-119 / plan C4: a backup is a CAPABLE COPY of data a deletion request must
# erase, so its lifetime is bounded by the deletion deadline, not by ordinary
# backup convenience. Live data is gone at day 7; a backup taken the instant
# before erasure may therefore survive at most 21 more days, which puts the last
# capable copy at day 28 -- two days inside REQ-A04's 30. A retention above 21
# would leave restorable personal data after the promised deletion date, so it
# is REFUSED here rather than clamped: silently shortening an operator's stated
# intent hides the conflict instead of surfacing it.
BACKUP_MAX_RETENTION_DAYS=21
RETENTION_DAYS="${RETENTION_DAYS:-$BACKUP_MAX_RETENTION_DAYS}"
case "$RETENTION_DAYS" in
  ''|*[!0-9]*)
    echo "FATAL: RETENTION_DAYS must be a whole number of days, got \"${RETENTION_DAYS}\"." >&2
    exit 1
    ;;
esac
if [ "$RETENTION_DAYS" -gt "$BACKUP_MAX_RETENTION_DAYS" ]; then
  echo "FATAL: RETENTION_DAYS=${RETENTION_DAYS} exceeds the ${BACKUP_MAX_RETENTION_DAYS}-day maximum (R-119). A backup is a capable copy of data a deletion request must erase; keeping one longer would leave restorable personal data past the day-28 deadline. Lower RETENTION_DAYS, or change R-119 first." >&2
  exit 1
fi
if [ "$RETENTION_DAYS" -lt 1 ]; then
  echo "FATAL: RETENTION_DAYS=${RETENTION_DAYS} would prune the backup this run just made." >&2
  exit 1
fi

if [ ! -r "$BACKUP_PASSPHRASE_FILE" ]; then
  echo "FATAL: passphrase file $BACKUP_PASSPHRASE_FILE is not readable." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "FATAL: pg_dump not on PATH." >&2; exit 1; }
command -v gpg >/dev/null || { echo "FATAL: gpg not on PATH (used for symmetric encryption)." >&2; exit 1; }
# node is load-bearing here: it strips the password out of the connection URI,
# validates the manifest JSON, and decides every prune. Without it the script
# writes a good dump and then exits 1 BEFORE pruning, so capable copies
# accumulate past day 28 — the R-119 breach this file exists to prevent,
# reported as a generic failure (round-2 code CHANGE).
command -v node >/dev/null || { echo "FATAL: node not on PATH (used for credential handling, manifest validation and the retention prune)." >&2; exit 1; }

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

# ---------------------------------------------------------------------------
# IMMUTABLE CREATION/EXPIRY MANIFEST + TOMBSTONE MANIFEST (plan C4).
#
# Two questions a restore has to answer, neither of them answerable from the
# dump itself:
#
#   1. WHEN does this copy stop being allowed to exist? Recorded here at
#      creation, from the retention this run actually used -- not recomputed
#      later from a file mtime that a copy or a sync can reset.
#   2. WHICH deletion tombstones were already active when it was taken? A
#      restore of this dump brings those identities/profiles/workspaces back
#      unless the tombstones are replayed first, so the manifest names them.
#      Ids only: no email, no name, no content -- a manifest that leaked the
#      data it governs would be a second copy of the problem.
#
# The manifest sits NEXT TO the dump and is covered by the same retention
# sweep. The AUTHORITATIVE record is the external S3 journal (R-124), which
# lives outside this directory and outside the database; this file is a
# convenience for the drill, never the authority.
MANIFEST="${BACKUP_DIR}/${BASE}.manifest.json"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EXPIRES_AT="$(date -u -d "+${RETENTION_DAYS} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null   || date -u -v "+${RETENTION_DAYS}d" +%Y-%m-%dT%H:%M:%SZ)"
DUMP_SHA="$(cut -d" " -f1 < "$SUMS")"

# Content-free: operation id, scope, state. `to_regclass` keeps this working
# against a database predating the lifecycle migrations rather than failing the
# whole backup on a missing table.
# KEEP THE PASSWORD OUT OF argv. On Linux /proc/<pid>/cmdline is world-readable,
# so `psql "postgres://user:pass@host/db"` publishes the credential for the
# database holding customer email, name and billing address to every local
# account (CLAUDE.md golden rule 2). libpq reads the password from PGPASSWORD,
# so the URI on the command line carries no secret.
#
# `node -e` receives the URI on ITS argv, which has the same exposure — so it
# gets the value through the environment instead and prints the two parts.
DB_PASSWORD="$(RESPIN_DB_URI="$DATABASE_URL" node -e '
  const u = new URL(process.env.RESPIN_DB_URI);
  const raw = u.password || "";
  // A password containing a stray "%" (e.g. `100%pass`) makes
  // decodeURIComponent throw. The first version swallowed that and substituted
  // an EMPTY password, so the tombstone query failed auth, its error was
  // discarded, and the manifest silently recorded activeTombstones: null --
  // which permanently FATALs every restore from that backup. Fall back to the
  // raw value instead of to nothing.
  try { console.log(decodeURIComponent(raw)); } catch { console.log(raw); }
')"
DB_URI_NO_PASSWORD="$(RESPIN_DB_URI="$DATABASE_URL" node -e '
  try { const u = new URL(process.env.RESPIN_DB_URI); u.password = ""; console.log(u.toString()); }
  catch { console.log(process.env.RESPIN_DB_URI); }
')"
TOMBSTONES="$(PGPASSWORD="$DB_PASSWORD" psql "$DB_URI_NO_PASSWORD" --quiet --tuples-only --no-align -c "
  SELECT CASE WHEN to_regclass('public.deletion_operations') IS NULL THEN '[]'
         ELSE coalesce((SELECT json_agg(json_build_object(
                'operationId', id, 'scope', scope, 'state', state
              ) ORDER BY id)::text
              FROM deletion_operations
              WHERE state NOT IN ('complete', 'cancelled')), '[]')
         END;
" 2>&1)" || {
  echo "WARNING: the tombstone query failed; the manifest will record activeTombstones=null and restore-drill.sh will REFUSE to serve from this backup. psql said:" >&2
  echo "${TOMBSTONES}" >&2
  TOMBSTONES="null"
}
case "$TOMBSTONES" in
  '['*|null) ;;
  *)
    echo "WARNING: the tombstone query returned something that is not a JSON array; recording null. It said:" >&2
    echo "${TOMBSTONES}" >&2
    TOMBSTONES="null"
    ;;
esac

cat > "$MANIFEST" <<MANIFEST_JSON
{
  "backupFile": "$(basename "$DUMP")",
  "sha256": "${DUMP_SHA}",
  "bytes": ${SIZE},
  "createdAt": "${CREATED_AT}",
  "retentionDays": ${RETENTION_DAYS},
  "expiresAt": "${EXPIRES_AT}",
  "maxRetentionDays": ${BACKUP_MAX_RETENTION_DAYS},
  "activeTombstones": ${TOMBSTONES},
  "note": "activeTombstones is null when the tombstone query could not run. A null is NOT an empty list: restore-drill.sh refuses to enable traffic on a null, because it cannot tell an absence of tombstones from an absence of an answer."
}
MANIFEST_JSON
node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$MANIFEST"   || { echo "FATAL: wrote a manifest that is not valid JSON: ${MANIFEST}" >&2; exit 1; }
echo "[backup] manifest: ${MANIFEST} (expires ${EXPIRES_AT}, retention ${RETENTION_DAYS}d)"

# RETENTION. Prune AFTER a verified new backup exists, never before — pruning
# first means a failed dump leaves you with fewer backups than you started with.
# PRUNE ON THE RECORDED EXPIRY, NOT ON mtime.
#
# Two defects the previous `find -mtime` sweep had, both found in the Task 5
# round-1 gate:
#
#   1. OFF BY ONE. GNU `find -mtime +N` truncates fractional days, so `+21`
#      matches files at least TWENTY-TWO days old. Measured on dated fixtures:
#      a 21-day-old file is NOT matched, a 22-day-old one is. With a day-7
#      erasure that put the last capable copy at day 29, breaching the day-28
#      deadline this same file derives at the top.
#   2. mtime IS NOT THE CREATION TIME. An rsync or copy without -p resets it,
#      and the manifest comment above says so in as many words -- and then the
#      sweep trusted it anyway. A copied backup directory would keep capable
#      copies of erased personal data indefinitely.
#
# So the manifest is the authority, as it always claimed to be. A dump with no
# readable manifest is pruned on a conservative mtime fallback (N-1) and said
# out loud, because an unknown expiry must not mean "keep forever".
echo "[backup] pruning backups whose recorded expiry has passed"
NOW_EPOCH="$(date -u +%s)"
for dump in "$BACKUP_DIR"/respin-*.dump.gz.gpg; do
  [ -e "$dump" ] || continue
  base="${dump%.dump.gz.gpg}"
  manifest="${base}.manifest.json"
  expired=""
  if [ -r "$manifest" ]; then
    expired="$(node -e '
      try {
        const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const t = Date.parse(m.expiresAt);
        if (!Number.isFinite(t)) { console.log("UNREADABLE"); process.exit(0); }
        console.log(t <= Number(process.argv[2]) * 1000 ? "YES" : "NO");
      } catch { console.log("UNREADABLE"); }
    ' "$manifest" "$NOW_EPOCH" 2>/dev/null || echo "UNREADABLE")"
  else
    expired="NO_MANIFEST"
  fi

  case "$expired" in
    YES)
      echo "[backup]   expired, removing: $(basename "$dump")"
      rm -f "$dump" "${base}.sha256" "$manifest"
      ;;
    NO)
      ;;
    *)
      # No manifest, or one we cannot read. Fall back to mtime at N-1 days so
      # the bound is never exceeded, and say which file and why.
      if [ -n "$(find "$dump" -maxdepth 0 -mtime "+$((RETENTION_DAYS - 1))" 2>/dev/null)" ]; then
        echo "[backup]   no readable manifest (${expired}) and older than ${RETENTION_DAYS} days, removing: $(basename "$dump")" >&2
        rm -f "$dump" "${base}.sha256" "$manifest"
      else
        # KEEPING it. The previous wording said "pruning it on mtime alone" in
        # this branch, which described the opposite of what happened -- and this
        # is the one script whose failure mode is silent.
        echo "WARNING: $(basename "$dump") has no readable manifest (${expired}); keeping it, and it will be pruned on mtime once it passes ${RETENTION_DAYS} days." >&2
      fi
      ;;
  esac
done
# Sweep sidecars whose dump is GENUINELY gone -- checked, not assumed.
#
# The previous version tested only mtime, so it deleted the manifest and the
# checksum of a LIVE dump once they aged past the window. That destroyed the
# manifest authority installed above (the dump then fell back to mtime, the very
# thing the manifest exists to replace) and removed the integrity checksum the
# restore drill verifies. Reproduced on dated fixtures by the round-2 gate.
for sidecar in "$BACKUP_DIR"/respin-*.sha256 "$BACKUP_DIR"/respin-*.manifest.json; do
  [ -e "$sidecar" ] || continue
  case "$sidecar" in
    *.sha256) owner="${sidecar%.sha256}.dump.gz.gpg" ;;
    *) owner="${sidecar%.manifest.json}.dump.gz.gpg" ;;
  esac
  if [ ! -e "$owner" ]; then
    echo "[backup]   orphaned sidecar (its dump is gone), removing: $(basename "$sidecar")"
    rm -f "$sidecar"
  fi
done

# HEALTH REPORT for whatever watches this job. Alerting on ABSENCE is the part
# people forget: a cron that stops running produces no failure email.
COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'respin-*.dump.gz.gpg' | wc -l)"
echo "[backup] health: backups_present=${COUNT} newest=${BASE} bytes=${SIZE}"
