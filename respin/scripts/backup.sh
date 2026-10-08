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
# Host tools it needs on PATH: pg_dump, psql, gpg, gzip, sha256sum and node,
# each checked by `command -v` before anything is written; plus coreutils'
# date, find, wc, cut and basename, which are assumed rather than checked.
#
# Exit non-zero on ANY failure, including a failed checksum — a backup script
# that exits 0 having written a corrupt file is the worst possible outcome, and
# it is the one that goes unnoticed for months. Since R-155 that includes a
# backup whose tombstone manifest could not be read (`activeTombstones: null`):
# the drill refuses to serve from it, so reporting it as a success only moved
# the outage to restore time.
#
# THE RETENTION PRUNE RUNS ON EVERY EXIT PATH ONCE BACKUP_DIR IS KNOWN (an EXIT
# trap, installed straight after that one check — the only exit before it is
# BACKUP_DIR itself being unset, when there is nothing to prune). It used to sit
# at the end of the happy path, so under `set -e` a failing pg_dump exited
# before it — and expired backups holding erased personal data outlived
# REQ-A04's bound for as long as the dumps kept failing (register 2026-10-05
# item 3(d)). `tests/shell-scripts.test.ts` plants an expired backup into the
# early-exit runs and asserts it is gone.
#
# MANIFEST FIELDS READ (by the prune): backupFile (= the dump's name),
# createdAt (parses, not in the future, within an hour of the file-name stamp
# or the dump's mtime) and expiresAt (effective expiry = min(expiresAt,
# createdAt + 21 days)). The bindings live in scripts/backup-manifest.mjs, the
# one reader both scripts share; a manifest failing one is unreadable and the
# mtime fallback decides.
set -euo pipefail

# BACKUP_DIR FIRST, AND ALONE, because it is the one input the prune needs: with
# it known, the EXIT trap below is installed before every other check, so a
# missing tool, an unreadable passphrase or a refused RETENTION_DAYS still prunes
# expired copies on the way out. This `:?` is the ONE exit that cannot prune —
# with no directory there is nothing to prune.
: "${BACKUP_DIR:?BACKUP_DIR is required, and must be on storage independent of the database host}"
# R-119 / plan C4: a backup is a CAPABLE COPY of data a deletion request must
# erase, so its lifetime is bounded by the deletion deadline, not by ordinary
# backup convenience. Live data is gone at day 7; a backup taken the instant
# before erasure may therefore survive at most 21 more days, which puts the last
# capable copy at day 28 -- two days inside REQ-A04's 30. A retention above 21
# would leave restorable personal data after the promised deletion date, so it
# is REFUSED here rather than clamped: silently shortening an operator's stated
# intent hides the conflict instead of surfacing it.
BACKUP_MAX_RETENTION_DAYS=21
# The mtime fallback's window. It starts at the maximum and narrows to the
# operator's RETENTION_DAYS only once that value has been validated below, so a
# prune that runs on an early exit never uses an unchecked number.
PRUNE_FALLBACK_DAYS="$BACKUP_MAX_RETENTION_DAYS"
# Where this script lives, so the prune finds scripts/backup-manifest.mjs from
# any working directory. Parameter expansion, not `dirname`: the prune must
# still reach the manifest reader when only date, find, rm, basename and node
# are on PATH (the early-exit tests run it that way). Both separators, because
# a Windows caller hands bash a backslashed path.
case "$0" in
  */*|*\\*) BACKUP_SCRIPT_DIR="${0%[/\\]*}" ;;
  *) BACKUP_SCRIPT_DIR="." ;;
esac
BACKUP_SCRIPT_DIR="$(cd "$BACKUP_SCRIPT_DIR" && pwd)"

# RETENTION. PRUNE ON THE EFFECTIVE EXPIRY, NOT ON mtime.
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
#      and the manifest comment below says so in as many words -- and then the
#      sweep trusted it anyway. A copied backup directory would keep capable
#      copies of erased personal data indefinitely.
#
# So the manifest is the authority — but only the fields that pass their
# BINDINGS (R-155, gate rounds 1 and 2). An edited manifest or a wrong clock
# could otherwise keep a copy alive forever. The bindings live in ONE place,
# scripts/backup-manifest.mjs, which restore-drill.sh uses as well. Its header
# lists every manifest field either script reads, with what binds each one:
# backupFile must equal the dump's name; createdAt must parse, not be in the
# future, and match the file-name stamp (or the dump's mtime) within an hour;
# the effective expiry is the earlier of expiresAt and createdAt +
# BACKUP_MAX_RETENTION_DAYS. A manifest failing any binding is UNREADABLE. Such a
# dump, one with no manifest, or one on a host without node is pruned on a
# conservative mtime fallback (N-1), and the run says so. An unknown expiry must
# not mean "keep forever".
#
# WHEN IT RUNS: on every exit after BACKUP_DIR is known, from the EXIT trap
# below — never only at the end of a successful run. It removes EXPIRED copies
# only, so running it after a failed run cannot cost a backup that is still
# allowed to exist; what it prevents is a run of failures keeping expired copies
# of erased data past REQ-A04's bound (register 2026-10-05 item 3(d)). It uses
# only date, find, rm and basename, plus node when present.
prune_expired_backups() {
  echo "[backup] pruning backups whose effective expiry has passed"
  local now_epoch dump base manifest expired sidecar owner have_node
  now_epoch="$(date -u +%s)"
  have_node=""
  command -v node >/dev/null 2>&1 && have_node="yes"
  for dump in "$BACKUP_DIR"/respin-*.dump.gz.gpg; do
    [ -e "$dump" ] || continue
    base="${dump%.dump.gz.gpg}"
    manifest="${base}.manifest.json"
    expired=""
    if [ -z "$have_node" ]; then
      expired="NO_NODE"
    elif [ -r "$manifest" ]; then
      # Every field the expiry depends on is BOUND in scripts/backup-manifest.mjs
      # (backupFile, createdAt, expiresAt — see that file's header); a field that
      # fails its binding prints UNREADABLE:<reason> and the mtime fallback below
      # decides. A missing module is UNREADABLE too, never "keep".
      expired="$(node "$BACKUP_SCRIPT_DIR/backup-manifest.mjs" prune "$manifest" "$dump" "$now_epoch" "$BACKUP_MAX_RETENTION_DAYS" 2>/dev/null || echo "UNREADABLE:the manifest reader failed")"
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
        # No manifest, one we cannot read, or no node to read it. Fall back to
        # mtime at N-1 days so the bound is never exceeded, and say which file
        # and why.
        if [ -n "$(find "$dump" -maxdepth 0 -mtime "+$((PRUNE_FALLBACK_DAYS - 1))" 2>/dev/null)" ]; then
          echo "[backup]   no readable manifest (${expired}) and older than ${PRUNE_FALLBACK_DAYS} days, removing: $(basename "$dump")" >&2
          rm -f "$dump" "${base}.sha256" "$manifest"
        else
          # KEEPING it. The previous wording said "pruning it on mtime alone" in
          # this branch, which described the opposite of what happened -- and
          # this is the one script whose failure mode is silent.
          echo "WARNING: $(basename "$dump") has no readable manifest (${expired}); keeping it, and it will be pruned on mtime once it passes ${PRUNE_FALLBACK_DAYS} days." >&2
        fi
        ;;
    esac
  done
  # Sweep sidecars whose dump is GENUINELY gone -- checked, not assumed.
  #
  # The previous version tested only mtime, so it deleted the manifest and the
  # checksum of a LIVE dump once they aged past the window. That destroyed the
  # manifest authority installed above (the dump then fell back to mtime, the
  # very thing the manifest exists to replace) and removed the integrity
  # checksum the restore drill verifies. Reproduced on dated fixtures by the
  # round-2 gate.
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
}

# THE EXIT TRAP, installed here — before every check below, so all of them
# prune on the way out (gate round 1: it used to sit after the tool and
# passphrase preflight, so those exits skipped the prune). `RUN_COMPLETE` is set
# only once this run's dump, checksum and manifest all exist and verified. A run
# that dies before that removes ITS OWN partial files (never another run's) — a
# truncated `.dump.gz.gpg` with no manifest would otherwise sit in the directory
# looking like a backup. The three paths are empty until this run names them.
DUMP=""
SUMS=""
MANIFEST=""
RUN_COMPLETE=""
PRUNED=""
on_exit() {
  local status=$?
  set +e
  if [ -z "$RUN_COMPLETE" ]; then
    for partial in "$DUMP" "$SUMS" "$MANIFEST"; do
      if [ -n "$partial" ] && [ -e "$partial" ]; then
        echo "[backup]   this run did not complete; removing its partial file: $(basename "$partial")" >&2
        rm -f "$partial"
      fi
    done
  fi
  [ -n "$PRUNED" ] || prune_expired_backups
  exit "$status"
}
trap on_exit EXIT

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
PRUNE_FALLBACK_DAYS="$RETENTION_DAYS"

: "${DATABASE_URL:?DATABASE_URL is required (the database to back UP)}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required — the dump contains customer email, name and billing address}"

if [ ! -r "$BACKUP_PASSPHRASE_FILE" ]; then
  echo "FATAL: passphrase file $BACKUP_PASSPHRASE_FILE is not readable." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "FATAL: pg_dump not on PATH." >&2; exit 1; }
# psql runs the tombstone-manifest query. It was missing from this preflight, so
# a host without it wrote a dump, recorded activeTombstones=null and exited 0
# (register 2026-10-05 item 3(d)).
command -v psql >/dev/null || { echo "FATAL: psql not on PATH (used for the tombstone manifest query)." >&2; exit 1; }
command -v gpg >/dev/null || { echo "FATAL: gpg not on PATH (used for symmetric encryption)." >&2; exit 1; }
command -v gzip >/dev/null || { echo "FATAL: gzip not on PATH (used to compress the dump)." >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "FATAL: sha256sum not on PATH (used for the integrity checksum)." >&2; exit 1; }
# node is load-bearing here: it strips the password out of the connection URI,
# validates the manifest JSON, and reads every manifest's expiry. Its absence is
# refused here; the prune that the trap runs on this exit falls back to mtime.
command -v node >/dev/null || { echo "FATAL: node not on PATH (used for credential handling, manifest validation and the retention prune)." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
# ONE INSTANT for the file-name stamp, the manifest's createdAt and its
# expiresAt (R-155, gate round 2): scripts/backup-manifest.mjs binds createdAt to
# the stamp, so they are taken together rather than minutes apart. GNU date
# (`-d @epoch`) with the BSD form (`-r epoch`) as the fallback.
START_EPOCH="$(date -u +%s)"
fmt_epoch() { date -u -d "@$1" "+$2" 2>/dev/null || date -u -r "$1" "+$2"; }
STAMP="$(fmt_epoch "$START_EPOCH" %Y%m%dT%H%M%SZ)"
BASE="respin-${STAMP}"
DUMP="${BACKUP_DIR}/${BASE}.dump.gz.gpg"
SUMS="${BACKUP_DIR}/${BASE}.sha256"
MANIFEST="${BACKUP_DIR}/${BASE}.manifest.json"

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
# The password is lifted out ONCE, here, because the FIRST thing that needs
# it is the pg_dump below -- not the tombstone query further down. Deriving it
# after pg_dump left the main backup command passing the full credentialed URI
# on argv while this comment block sat below it explaining why that must never
# happen. tests/shell-credentials.test.ts is the witness.
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
  // libpq also accepts `?password=` on the URI; lift that form too.
  const raw = u.password || u.searchParams.get("password") || "";
  // A password containing a stray "%" (e.g. `100%pass`) makes
  // decodeURIComponent throw. The first version swallowed that and substituted
  // an EMPTY password, so the tombstone query failed auth, its error was
  // discarded, and the manifest silently recorded activeTombstones: null --
  // which permanently FATALs every restore from that backup. Fall back to the
  // raw value instead of to nothing.
  try { console.log(decodeURIComponent(raw)); } catch { console.log(raw); }
')"
DB_URI_NO_PASSWORD="$(RESPIN_DB_URI="$DATABASE_URL" node -e '
  try { const u = new URL(process.env.RESPIN_DB_URI); u.password = ""; u.searchParams.delete("password"); u.searchParams.delete("sslpassword"); console.log(u.toString()); }
  catch { console.log("(unparseable database url)"); }
')"
export PGPASSWORD="$DB_PASSWORD"

pg_dump --dbname="$DB_URI_NO_PASSWORD" \
        --format=custom \
        --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
        --output "$DUMP"

# CHECKSUM, written next to the artifact and verified immediately. Verifying now
# catches a truncated write while the source database is still there to re-dump
# from; discovering it at restore time is discovering it too late.
#
# RELATIVE TO THE BACKUP DIRECTORY. `sha256sum "$DUMP"` recorded the path as
# given, so a backup directory synced or moved anywhere else failed
# `sha256sum -c` and read as corrupt (register 2026-10-05 item 3, depth F4).
# The entry now names the file alone, and both this check and the drill's run
# `sha256sum -c` from inside the directory that holds it.
( cd "$BACKUP_DIR" && sha256sum "$(basename "$DUMP")" > "$(basename "$SUMS")" )
( cd "$BACKUP_DIR" && sha256sum -c "$(basename "$SUMS")" >/dev/null ) \
  || { echo "FATAL: checksum verification failed immediately after write." >&2; exit 1; }

SIZE="$(wc -c < "$DUMP" | tr -d ' ')"
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
# And where it came from (R-155): `sourceHost`, `sourcePort` and
# `sourceDatabase` from DATABASE_URL — never the user or the password — and
# `journalBucket`/`journalEnvironment` from this shell's RESPIN_DELETION_JOURNAL_*
# (null when unset). `restore-drill.sh --allow-empty-money` requires a loopback
# host AND a journal bucket and environment equal to the drill's own. These are
# a MISTAKE-GUARD, not proof of origin: the operator writes this file and can
# edit it, and a production database on the same host as its backup job also
# reports a loopback host. The control that keeps an empty-money run out of the
# record is the `EMPTY-MONEY-ALLOWED (local drill)` line such a run prints,
# which todos.md T-23 refuses as closure.
#
# The manifest sits NEXT TO the dump and is covered by the same retention
# sweep. The AUTHORITATIVE record is the external S3 journal (R-124), which
# lives outside this directory and outside the database; this file is a
# convenience for the drill, never the authority.
CREATED_AT="$(fmt_epoch "$START_EPOCH" %Y-%m-%dT%H:%M:%SZ)"
EXPIRES_AT="$(fmt_epoch "$((START_EPOCH + RETENTION_DAYS * 86400))" %Y-%m-%dT%H:%M:%SZ)"
DUMP_SHA="$(cut -d" " -f1 < "$SUMS")"
# The URI reaches node through the ENVIRONMENT, never argv, for the reason the
# password block above gives. Every value goes through JSON.stringify, so
# whatever a host, name or bucket contains it cannot break the manifest's syntax.
ORIGIN_JSON_FIELDS="$(RESPIN_DB_URI="$DATABASE_URL" node -e '
  const field = (k, v) => "\"" + k + "\": " + JSON.stringify(v === undefined || v === "" ? null : v);
  let host = null, port = null, database = null;
  try {
    const u = new URL(process.env.RESPIN_DB_URI);
    host = u.hostname || null;
    port = u.port ? Number(u.port) : 5432;
    database = decodeURIComponent(u.pathname.replace(/^\//, "")) || null;
  } catch {}
  console.log([
    field("sourceHost", host),
    field("sourcePort", port),
    field("sourceDatabase", database),
    field("journalBucket", process.env.RESPIN_DELETION_JOURNAL_BUCKET?.trim()),
    field("journalEnvironment", process.env.RESPIN_DELETION_JOURNAL_ENVIRONMENT?.trim()),
  ].join(",\n  "));
')"

# Content-free: operation id, scope, state. `to_regclass` keeps this working
# against a database predating the lifecycle migrations rather than failing the
# whole backup on a missing table.
TOMBSTONES_READ="yes"
TOMBSTONES="$(psql "$DB_URI_NO_PASSWORD" --quiet --tuples-only --no-align -c "
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
  TOMBSTONES_READ=""
}
case "$TOMBSTONES" in
  '['*) ;;
  null) TOMBSTONES_READ="" ;;
  *)
    echo "WARNING: the tombstone query returned something that is not a JSON array; recording null. It said:" >&2
    echo "${TOMBSTONES}" >&2
    TOMBSTONES="null"
    TOMBSTONES_READ=""
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
  ${ORIGIN_JSON_FIELDS},
  "activeTombstones": ${TOMBSTONES},
  "note": "activeTombstones is null when the tombstone query could not run. A null is NOT an empty list: restore-drill.sh refuses to enable traffic on a null, because it cannot tell an absence of tombstones from an absence of an answer. The source* fields come from DATABASE_URL (never its user or password) and the journal* fields from RESPIN_DELETION_JOURNAL_*; they guard against mistakes and prove no origin."
}
MANIFEST_JSON
node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$MANIFEST"   || { echo "FATAL: wrote a manifest that is not valid JSON: ${MANIFEST}" >&2; exit 1; }
echo "[backup] manifest: ${MANIFEST} (expires ${EXPIRES_AT}, retention ${RETENTION_DAYS}d)"

# The dump, its checksum and its manifest all exist and verified: from here on
# the EXIT trap keeps them, whatever the exit status.
RUN_COMPLETE="yes"

# HEALTH REPORT for whatever watches this job. Alerting on ABSENCE is the part
# people forget: a cron that stops running produces no failure email. The count
# is taken after the prune, so on this path the prune runs here and the EXIT
# trap skips it.
prune_expired_backups
PRUNED="yes"
COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'respin-*.dump.gz.gpg' | wc -l | tr -d ' ')"
echo "[backup] health: backups_present=${COUNT} newest=${BASE} bytes=${SIZE}"

# A null tombstone manifest is a FAILED backup, not a successful one with a
# warning (register 2026-10-05 item 3(d)). The dump is kept — it is intact, and
# its manifest says exactly why the drill will refuse it — but the exit status
# is what an alert watches, and an exit 0 here hid the problem until restore.
if [ -z "$TOMBSTONES_READ" ]; then
  echo "FATAL: ${BASE} was written but its tombstone manifest is null (the query above failed), so restore-drill.sh will refuse to serve from it. Fix the query's cause — the role's SELECT on deletion_operations, or the connection — and take a fresh backup." >&2
  exit 1
fi
