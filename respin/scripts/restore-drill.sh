#!/usr/bin/env bash
# Restore drill for Respin (audit 2026-08-17 #9, and the half that matters).
#
# "No backup has ever been restored" was the finding. A backup file is a claim;
# a restore is the evidence. This script turns the claim into a check anyone can
# re-run, and it REFUSES to report success unless the money tables actually came
# back with rows in them — subscriptions, credit_ledger and stripe_events, each
# asserted non-empty since R-155 (until then only config_versions was, and a
# restore with zero rows in every money table PASSED; register 2026-10-05 item
# 3(c)).
#
# It restores into an ISOLATED database — never over a live one — and the name
# is guarded the way `createDockerTestDb` guards its own (packages/db/src/
# testing.ts): only a `respin_restore_drill*` name may be dropped, because
# everything below the guard is destructive.
#
# THE ORDER (R-155, amending R-124's plan C4): manifest checks → isolated
# restore → content assertions → `db:migrate` ON THE DRILL DATABASE → journal
# verification. A dump older than migration head used to stop the drill with
# "run db:migrate, then re-run this drill" — and every re-run dropped and
# re-restored the same dump, so the remedy could never be satisfied.
#
# USAGE — every input is an environment variable; the one flag is optional.
#   BACKUP_FILE=/mnt/backups/respin/respin-<stamp>.dump.gz.gpg \
#   BACKUP_PASSPHRASE_FILE=/etc/respin/backup.pass \
#   MAINTENANCE_URL=postgres://respin:...@host:5432/postgres \
#   RESTORE_SERVING_DISABLED=confirmed \
#   RESPIN_DELETION_JOURNAL_BUCKET=... RESPIN_DELETION_JOURNAL_REGION=... \
#   RESPIN_DELETION_JOURNAL_ENVIRONMENT=... \
#   bash scripts/restore-drill.sh [--allow-empty-money]   # (no +x bit is set)
#
# Optional: DRILL_DB (default respin_restore_drill; guarded below).
# Host tools on PATH: pg_restore, psql, gpg, gunzip, sha256sum, node, pnpm.
# LOCAL DRILL (no cloud account): RUNBOOK.md, Respin → "Restore drill — local".
#
# --allow-empty-money is accepted ONLY in local-drill mode: the journal endpoint
# is exactly the loopback MinIO (http://127.0.0.1:9000), the backup's manifest
# records a loopback source host, and its journal bucket and environment equal
# this drill's. Those checks guard against mistakes; they do not prove where a
# dump came from (the manifest is editable, and a co-located production database
# is also "loopback"). The control is the stamp: any accepted run prints
# `EMPTY-MONEY-ALLOWED (local drill)` as its first and last line, and a
# transcript carrying that line never closes the production drill (todos.md
# T-23).
#
# MANIFEST FIELDS READ: backupFile, createdAt, expiresAt, sha256,
# activeTombstones, journalBucket, journalEnvironment, sourceHost, sourcePort,
# sourceDatabase — each bound as listed at THE MANIFEST below, through
# scripts/backup-manifest.mjs (the one reader, shared with backup.sh).
set -euo pipefail

# The line restore-verify.ts prints last on success, and only on success. The
# drill requires it as well as exit 0: a verifier that never ran `main()` also
# exits 0 (register 2026-10-05 item 3(b)). `tests/shell-scripts.test.ts` pins
# this literal equal to RESTORE_VERIFY_SUCCESS_MARKER in restore-verify.ts.
RESTORE_VERIFY_SUCCESS_MARKER="RESTORE-VERIFY: JOURNAL VERIFIED"
EMPTY_MONEY_MARKER="EMPTY-MONEY-ALLOWED (local drill)"
LOCAL_DRILL_ENDPOINT="http://127.0.0.1:9000"

ALLOW_EMPTY_MONEY=""
for arg in "$@"; do
  case "$arg" in
    --allow-empty-money) ALLOW_EMPTY_MONEY="requested" ;;
    *)
      echo "FATAL: unknown argument \"${arg}\". This script takes its inputs from the environment (BACKUP_FILE, BACKUP_PASSPHRASE_FILE, MAINTENANCE_URL, RESTORE_SERVING_DISABLED — see USAGE at the top of this file) and one optional flag, --allow-empty-money." >&2
      exit 1
      ;;
  esac
done

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"
: "${MAINTENANCE_URL:?MAINTENANCE_URL is required (a maintenance database on the target server)}"
DRILL_DB="${DRILL_DB:-respin_restore_drill}"
WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# THE GUARD, before anything destructive and before any connection — same rule
# and the same reason as the test harness's: this script runs DROP DATABASE.
# FULL MATCH, not a prefix glob. `respin_restore_drill*` accepted anything that
# merely STARTED with the safe name, and the value was then interpolated
# unquoted into `psql -c`, which executes every statement in the string. So
#   DRILL_DB='respin_restore_drill; DROP DATABASE respin_prod; --'
# passed the guard and dropped production. Demonstrated in the Task 5 round-1
# gate. The character class below admits only what a database name may contain,
# so no separator, quote or semicolon can survive it (CLAUDE.md golden rule 3,
# and non-negotiable 7: a guard's population is a list, not a pattern that
# happens to start right).
case "$DRILL_DB" in
  respin_restore_drill) ;;
  respin_restore_drill_[a-z0-9_]*)
    case "$DRILL_DB" in
      *[!a-z0-9_]*)
        echo "FATAL: refusing to drop \"${DRILL_DB}\" — a drill database name may contain only lowercase letters, digits and underscores." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "FATAL: refusing to drop \"${DRILL_DB}\" — this script DROPS the target database, so it only ever operates on the exact name respin_restore_drill or respin_restore_drill_<suffix>." >&2
    exit 1
    ;;
esac
if [ "${#DRILL_DB}" -gt 63 ]; then
  echo "FATAL: \"${DRILL_DB}\" exceeds PostgreSQL's 63-character identifier limit." >&2
  exit 1
fi

# --- STEP 2 (plan C4): restore with app, workers and network serving DISABLED.
# A script cannot verify that someone else's worker is stopped, so it does the
# next most honest thing: it refuses to run until the operator states it, and
# the statement lands in the transcript. An unattended cron cannot satisfy this
# by accident, which is the point -- this drill is a deliberate act.
: "${RESTORE_SERVING_DISABLED:?RESTORE_SERVING_DISABLED must be set to \"confirmed\" -- stop the app and every worker pointed at the restore target FIRST. A restore that serves before its tombstones are replayed has un-deleted someone.}"
if [ "$RESTORE_SERVING_DISABLED" != "confirmed" ]; then
  echo "FATAL: RESTORE_SERVING_DISABLED must be exactly \"confirmed\", got \"${RESTORE_SERVING_DISABLED}\"." >&2
  exit 1
fi

for tool in pg_restore psql gpg gunzip sha256sum node pnpm; do
  command -v "$tool" >/dev/null || { echo "FATAL: ${tool} not on PATH." >&2; exit 1; }
done

# --- THE MANIFEST (written by backup.sh), REQUIRED, and READ ONLY THROUGH ITS
# BINDINGS (R-155, gate rounds 1 and 2). It answers questions the dump cannot:
# which tombstones were active when it was taken, whether this copy may still
# exist, and which journal it was taken against. A backup without one has an
# UNKNOWN expiry, and backup.sh's own rule is that an unknown expiry must not
# mean "keep forever".
#
# EVERY FIELD THIS SCRIPT READS, AND WHAT BINDS IT. The authority is
# scripts/backup-manifest.mjs, which backup.sh's prune uses too, so the two
# cannot drift. A field failing its binding is a refusal with a way forward:
#   backupFile          = this dump's file name
#   createdAt           parses; not in the future (5 min clock skew allowed);
#                       within an hour of the `respin-<stamp>` in the file name
#                       (or the dump's mtime when the name has no stamp)
#   expiresAt           parses; effective expiry = min(expiresAt, createdAt + 21 days)
#   sha256              = the sha256 of the dump's bytes, computed here
#   activeTombstones    an array (null = refused); its content decides nothing —
#                       the external journal is the authority
#   journalBucket /     when recorded, must equal this drill's journal config,
#   journalEnvironment  WITH OR WITHOUT --allow-empty-money; one alone = refused;
#                       neither = a legacy manifest, accepted, and an empty
#                       journal on it is stamped JOURNAL-EMPTY below
#   sourceHost / sourcePort / sourceDatabase
#                       a MISTAKE-GUARD ONLY: loopback host required for
#                       --allow-empty-money, otherwise printed
#
# EXPIRED IS REFUSED (register 2026-10-05 item 3(c)). A copy past its effective
# expiry is one the retention prune should already have destroyed (R-119: day
# 28 is the last day any capable copy may exist); restoring it is the
# un-delete. The way forward is a fresh backup, never an override.
BACKUP_MAX_RETENTION_DAYS=21
MANIFEST_FILE="${BACKUP_FILE%.dump.gz.gpg}.manifest.json"
if [ ! -r "$MANIFEST_FILE" ]; then
  echo "FATAL: no readable manifest beside ${BACKUP_FILE} (expected ${MANIFEST_FILE}). Without it this backup's expiry and the tombstones active when it was taken are unknown, so it is not restored. Take a fresh backup with scripts/backup.sh, which writes one." >&2
  exit 1
fi
# --- LOCAL-DRILL MODE, bounded. The flag exists so a stranger can run the whole
# drill against a fresh local database whose money tables are legitimately
# empty. Beyond the bindings above, it is accepted only when the journal
# endpoint is exactly the loopback MinIO, the manifest's source host is a
# loopback host, and the manifest records the journal (which the binding has
# already matched to this drill's).
#
# THOSE CHECKS ARE A MISTAKE-GUARD, NOT PROOF OF ORIGIN. The manifest is a file
# the operator can edit, and a production database on the same host as its
# backup job also records a loopback host. What keeps an empty-money run out of
# the record is the stamp: an accepted run prints
# `EMPTY-MONEY-ALLOWED (local drill)` as its first line and — from the EXIT trap,
# on every exit path — its last, and todos.md T-23 refuses any transcript that
# carries it as the production drill's closure.
#
# Everything reaches the module through argv: the manifest path, the dump,
# whether the flag was given, the maximum retention, and this drill's journal
# endpoint, bucket and environment — none of them a secret.
MANIFEST_REPORT="$(node "$WORKSPACE_DIR/scripts/backup-manifest.mjs" drill "$MANIFEST_FILE" "$BACKUP_FILE" "$BACKUP_MAX_RETENTION_DAYS" "$ALLOW_EMPTY_MONEY" "${RESPIN_DELETION_JOURNAL_ENDPOINT:-}" "${RESPIN_DELETION_JOURNAL_BUCKET:-}" "${RESPIN_DELETION_JOURNAL_ENVIRONMENT:-}" "$LOCAL_DRILL_ENDPOINT")" || exit 1
MANIFEST_SUMMARY="$(printf '%s\n' "$MANIFEST_REPORT" | grep -v '^JOURNAL_BOUND=')"
MANIFEST_JOURNAL_BOUND="$(printf '%s\n' "$MANIFEST_REPORT" | sed -n 's/^JOURNAL_BOUND=//p')"

OPERATIONS_JSON=""
VERIFY_OUT=""
on_exit() {
  local status=$?
  set +e
  [ -z "$OPERATIONS_JSON" ] || rm -f "$OPERATIONS_JSON"
  [ -z "$VERIFY_OUT" ] || rm -f "$VERIFY_OUT"
  [ "$ALLOW_EMPTY_MONEY" != "accepted" ] || echo "$EMPTY_MONEY_MARKER"
  exit "$status"
}
if [ -n "$ALLOW_EMPTY_MONEY" ]; then
  ALLOW_EMPTY_MONEY="accepted"
  echo "$EMPTY_MONEY_MARKER"
fi
trap on_exit EXIT
echo "$MANIFEST_SUMMARY"

SUMS="${BACKUP_FILE%.dump.gz.gpg}.sha256"
if [ -r "$SUMS" ]; then
  echo "[drill] verifying checksum"
  # From inside the backup's own directory: backup.sh records the file name
  # alone (R-155), so a directory moved or synced elsewhere still verifies.
  ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$SUMS")" >/dev/null ) \
    || { echo "FATAL: checksum mismatch — this backup is corrupt. Do NOT rely on it." >&2; exit 1; }
else
  echo "WARNING: no .sha256 beside ${BACKUP_FILE}; restoring unverified." >&2
fi

# The URI reaches node through the ENVIRONMENT, not argv: /proc/<pid>/cmdline is
# world-readable on Linux, so a credentialed URI on a command line publishes the
# password to every local account (CLAUDE.md golden rule 2).
TARGET_URL="$(RESPIN_MAINT_URI="$MAINTENANCE_URL" RESPIN_DRILL_DB="$DRILL_DB" node -e '
  const u = new URL(process.env.RESPIN_MAINT_URI);
  u.pathname = "/" + process.env.RESPIN_DRILL_DB;
  console.log(u.toString());
')"
# The SAME URI with the password removed. EVERY psql/pg_restore invocation in
# this script uses a password-less URI and takes the secret through PGPASSWORD,
# mirroring scripts/backup.sh.
#
# The previous version of this comment claimed exactly that while all six
# invocations passed the credentialed URI on argv, and the string `PGPASSWORD`
# appeared nowhere else in the file. tests/shell-credentials.test.ts is the
# witness that keeps the claim true: every psql/pg_restore/pg_dump line is
# scanned for a credentialed variable, and an `export PGPASSWORD=` must exist
# on a non-comment line (CLAUDE.md 2026-07-30: a comment claiming a property is
# not the property — and a comment naming a guard that does not exist, as the
# previous version of THIS paragraph did, is the same mistake).
# libpq also accepts the password as a QUERY parameter (`?password=` and
# `?sslpassword=`); `u.password = ""` alone would leave that form on argv. Both
# are stripped here; `password` is lifted into DB_PASSWORD below, `sslpassword`
# (a client-key passphrase) is NOT re-supplied anywhere, so a deployment that
# needs one fails loudly at connect rather than leaking it — fail-closed, on
# purpose, until such a deployment exists.
TARGET_URL_SAFE="$(RESPIN_MAINT_URI="$TARGET_URL" node -e '
  try { const u = new URL(process.env.RESPIN_MAINT_URI); u.password = ""; u.searchParams.delete("password"); u.searchParams.delete("sslpassword"); console.log(u.toString()); }
  catch { console.log("(unparseable target url)"); }
')"
# The password, lifted out of the URI once. `node -e` receives the URI through
# the ENVIRONMENT, never its own argv, which has the same exposure.
DB_PASSWORD="$(RESPIN_MAINT_URI="$MAINTENANCE_URL" node -e '
  const u = new URL(process.env.RESPIN_MAINT_URI);
  const raw = u.password || u.searchParams.get("password") || "";
  // A password containing a stray "%" makes decodeURIComponent throw; falling
  // back to the raw value beats substituting an empty password and failing auth
  // with a discarded error (the defect backup.sh records).
  try { console.log(decodeURIComponent(raw)); } catch { console.log(raw); }
')"
MAINTENANCE_URL_SAFE="$(RESPIN_MAINT_URI="$MAINTENANCE_URL" node -e '
  try { const u = new URL(process.env.RESPIN_MAINT_URI); u.password = ""; u.searchParams.delete("password"); u.searchParams.delete("sslpassword"); console.log(u.toString()); }
  catch { console.log("(unparseable maintenance url)"); }
')"
export PGPASSWORD="$DB_PASSWORD"

echo "[drill] recreating ${DRILL_DB}"
# `-v db=` + `:"db"` makes psql quote the identifier, so even if the guard above
# were ever loosened the value could not break out of the statement.
#
# THE STATEMENTS GO ON STDIN, NOT `-c`. psql runs its own lexer over stdin and
# `-f` only; `-c` sends the string straight to the server, so `:"db"` arrives
# uninterpolated and the server answers `syntax error at or near ":"`. Measured
# against this repo's own client (psql 17.11): `-c` errors, stdin yields
# `SELECT "zzz_probe"`. The first version of this fix used `-c` and would have
# aborted the drill on every single run under `set -euo pipefail`.
psql "$MAINTENANCE_URL_SAFE" -v ON_ERROR_STOP=1 -v db="$DRILL_DB" <<'DROP_SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
DROP_SQL
psql "$MAINTENANCE_URL_SAFE" -v ON_ERROR_STOP=1 -v db="$DRILL_DB" <<'CREATE_SQL'
CREATE DATABASE :"db";
CREATE_SQL


echo "[drill] decrypting and restoring"
gpg --batch --yes --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" "$BACKUP_FILE" \
  | gunzip \
  | pg_restore --dbname="$TARGET_URL_SAFE" --no-owner --no-privileges --exit-on-error

# ---------------------------------------------------------------------------
# THE ACTUAL CHECK. A restore that produces empty tables "succeeds" at the
# pg_restore level — every command runs, nothing errors, and the money is gone.
# So the drill asserts the representative rows the audit named: workspaces,
# subscriptions, the credit ledger, and the webhook event log.
#
# The local-drill acceptance reaches the DO block as the session setting
# `respin.allow_empty_money` (psql does not interpolate its own variables inside
# a dollar-quoted body). The `SET` below ALWAYS runs, with `on` only when the
# flag was accepted above and `off` otherwise, so it overrides every other
# source of that setting — an inherited PGOPTIONS, or an ALTER ROLE / ALTER
# DATABASE default on the target server. Merely leaving it unset would have let
# any of those reach the allowance without the local-mode check.
# ---------------------------------------------------------------------------
echo "[drill] verifying representative rows"
ALLOW_EMPTY_MONEY_SETTING="off"
[ "$ALLOW_EMPTY_MONEY" != "accepted" ] || ALLOW_EMPTY_MONEY_SETTING="on"
psql "$TARGET_URL_SAFE" -v ON_ERROR_STOP=1 -v allow_empty_money="$ALLOW_EMPTY_MONEY_SETTING" --quiet --tuples-only --no-align <<'SQL'
\set ON_ERROR_STOP on
SET respin.allow_empty_money = :'allow_empty_money';
DO $$
DECLARE
  n_ws bigint; n_sub bigint; n_led bigint; n_evt bigint; n_cfg bigint;
  ledger_sum bigint;
  allow_empty boolean := coalesce(current_setting('respin.allow_empty_money', true), '') = 'on';
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

  -- THE MONEY TABLES (R-155). The header promised this refusal for a year and
  -- the body never made it: a restore with zero rows in all three passed.
  IF n_sub = 0 OR n_led = 0 OR n_evt = 0 THEN
    IF allow_empty THEN
      RAISE NOTICE 'EMPTY MONEY TABLES ALLOWED (local drill): subscriptions=% credit_ledger=% stripe_events=%. This run proves nothing about restoring money.', n_sub, n_led, n_evt;
    ELSE
      RAISE EXCEPTION 'RESTORE INCOMPLETE: a money table came back empty (subscriptions=% credit_ledger=% stripe_events=%). A restored production database has rows in all three, so this backup lost the money and must not be relied on. A LOCAL drill against a fresh database may pass --allow-empty-money in local-drill mode (RUNBOOK.md, Restore drill — local).', n_sub, n_led, n_evt;
    END IF;
  END IF;

  -- The money invariant, re-derived on the RESTORED data: the ledger is
  -- append-only and balance is the sum of deltas, so a workspace can never sum
  -- negative. A negative sum means the restore lost rows; a non-negative one is
  -- NECESSARY, NOT SUFFICIENT — a restore missing whole workspaces' rows, or
  -- matched pairs of debits and grants, still passes it. Witnessed by a planted
  -- negative workspace in tests/restore-drill-content.docker.test.ts.
  SELECT coalesce(min(total), 0) INTO ledger_sum FROM (
    SELECT sum(delta) AS total FROM credit_ledger GROUP BY workspace_id
  ) per_workspace;
  IF ledger_sum < 0 THEN
    RAISE EXCEPTION 'RESTORE SUSPECT: a workspace''s restored ledger sums to % (negative). The ledger cannot go negative; this restore is not trustworthy.', ledger_sum;
  END IF;

  RAISE NOTICE 'money-path checks passed on the restored dataset';
END $$;
SQL

# --- STEP 4 (plan C4, R-155): bring the restored schema to this checkout's
# migrations, ON THE DRILL DATABASE, before anything reads it as current.
#
# `db:check` is deliberately NOT used here. It is `drizzle-kit check`, which is
# OFFLINE (CLAUDE.md Commands: "db:check below is offline") -- it compares the
# committed migration files with each other and never opens a connection. The
# first version of this step ran it with DATABASE_URL set and printed "the
# schema matches the committed migrations", which was a claim the check could
# not make: a six-month-old dump twenty migrations behind would have passed
# (round-1 code BLOCK 4).
#
# What CAN be observed is the migration ledger inside the restored database.
# A dump BEHIND the checkout is migrated here, in place: restore → migrate →
# verify. A dump AHEAD of it is refused — this code does not know that schema.
# If the migrate fails with "out of shared memory", the target server needs
# max_locks_per_transaction raised (RUNBOOK.md, Restore drill — the docker
# service runs with 512 for exactly that failure).
migration_count() {
  psql "$TARGET_URL_SAFE" --quiet --tuples-only --no-align -c "
    SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 'NONE'
           ELSE coalesce((SELECT count(*)::text FROM drizzle.__drizzle_migrations), '0')
           END;" 2>/dev/null || echo "UNREADABLE"
}
echo "[drill] comparing the restored migration ledger with the committed migrations"
APPLIED="$(migration_count)"
COMMITTED="$(ls -1 "$WORKSPACE_DIR/packages/db/migrations"/*.sql 2>/dev/null | wc -l | tr -d ' ')"
echo "[drill]   migrations applied in the restored database: ${APPLIED}"
echo "[drill]   migration files committed in this checkout:  ${COMMITTED}"
case "$APPLIED" in
  ''|*[!0-9]*)
    # Covers NONE, UNREADABLE and any psql noise. Without this the `[ -gt ]`
    # comparisons below print "integer expression expected", `set -e` does NOT
    # fire (they are inside `if`), and the drill goes on to announce "migration
    # ledger matches" — a vacuous pass in the check that replaced a vacuous
    # check (round-2 code CHANGE).
    echo "FATAL: the restored database has no readable drizzle migration ledger (got \"${APPLIED}\"), so its schema cannot be compared with this checkout." >&2
    exit 1
    ;;
esac
case "$COMMITTED" in
  ''|*[!0-9]*|0)
    echo "FATAL: found no committed migration files at ${WORKSPACE_DIR}/packages/db/migrations — this checkout cannot be compared against anything. Run the drill from a complete checkout." >&2
    exit 1
    ;;
esac
if [ "$APPLIED" -gt "$COMMITTED" ]; then
  echo "FATAL: the restored database has ${APPLIED} migrations applied but this checkout only carries ${COMMITTED}. The dump is NEWER than the code; replaying deletion state onto it would run this code against a schema it does not know." >&2
  exit 1
fi
MIGRATED_BY_DRILL=0
if [ "$APPLIED" -lt "$COMMITTED" ]; then
  MIGRATED_BY_DRILL=$((COMMITTED - APPLIED))
  echo "[drill]   the dump predates ${MIGRATED_BY_DRILL} committed migration(s); applying them to ${DRILL_DB} now (restore → migrate → verify)"
  # The credentialed URI reaches db:migrate through its ENVIRONMENT, never argv.
  if ! ( cd "$WORKSPACE_DIR" && DATABASE_URL="$TARGET_URL" pnpm db:migrate ); then
    # The remedy names the credential VARIABLE and prints no URL at all: the
    # previous one printed a password-stripped URL, a command that could not
    # authenticate (register 2026-10-05 item 3, depth F5).
    echo "" >&2
    echo "FATAL: db:migrate failed on ${DRILL_DB}; its own error is printed above. Fix that cause and re-run this drill — it re-creates ${DRILL_DB} from the backup, so a half-applied migration cannot carry over. To run the step alone:" >&2
    echo "  DATABASE_URL=\"<your MAINTENANCE_URL with its database name replaced by ${DRILL_DB}>\" pnpm -C respin db:migrate" >&2
    echo "The credential lives in MAINTENANCE_URL; this script never prints it." >&2
    exit 1
  fi
  APPLIED="$(migration_count)"
  if [ "$APPLIED" != "$COMMITTED" ]; then
    echo "FATAL: after db:migrate the drill database reports \"${APPLIED}\" applied migrations against ${COMMITTED} committed; the schema did not reach this checkout's head." >&2
    exit 1
  fi
fi
# Cardinality only. Two branches with the same COUNT of migrations compare
# equal here, so this says what it observed and no more.
echo "[drill]   migration COUNT matches (${APPLIED}, ${MIGRATED_BY_DRILL} applied by this drill); this is a cardinality check, not schema identity"

# --- STEPS 3 and 5 (plan C4): verify the EXTERNAL journal, then plan the replay.
# The restored database is the record a deletion has to survive, so it is not
# its own witness. `restore-verify.ts` reads the S3 journal -- which lives
# outside this backup -- and refuses on a duplicate version, a delete marker, a
# gap, a digest or checksum conflict, a wrong retention, an unreadable object,
# an unparseable key, or a database claiming a transition the journal never
# recorded.
echo "[drill] extracting the restored deletion state for journal comparison"
OPERATIONS_JSON="$(mktemp)"
psql "$TARGET_URL_SAFE" --quiet --tuples-only --no-align -c "
  SELECT CASE WHEN to_regclass('public.deletion_operations') IS NULL THEN '[]'
         ELSE coalesce((SELECT json_agg(json_build_object(
                'id', id, 'state', state, 'journalVersion', journal_version,
                'requestedAt', to_char(requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              ) ORDER BY id)::text FROM deletion_operations), '[]')
         END;
" > "$OPERATIONS_JSON"

echo "[drill] verifying the external deletion journal (R-124)"
# >>> JOURNAL VERIFY BLOCK — tests/shell-scripts.test.ts extracts and runs
# these lines against planted verifiers; keep both marker comments.
#
# EXIT 0 ALONE IS NOT "VERIFIED" (R-155). The verifier's last non-blank line
# must be the success marker as well: a verifier whose `main()` never ran exits
# 0 with no output at all, and this drill used to read that as a pass.
VERIFY_OUT="$(mktemp)"
set +e
( cd "$WORKSPACE_DIR" && pnpm exec tsx scripts/restore-verify.ts --operations "$OPERATIONS_JSON" ) | tee "$VERIFY_OUT"
VERIFY_STATUS="${PIPESTATUS[0]}"
set -e
VERIFY_LAST="$(grep -v '^[[:space:]]*$' "$VERIFY_OUT" | tail -n 1 | tr -d '\r' || true)"
JOURNAL_COUNTS="$(grep '^journal_operations=' "$VERIFY_OUT" | tail -n 1 | tr -d '\r' || true)"
if [ "$VERIFY_STATUS" -eq 0 ] && [ "$VERIFY_LAST" = "$RESTORE_VERIFY_SUCCESS_MARKER" ]; then
  JOURNAL_VERDICT="verified"
else
  echo "" >&2
  if [ "$VERIFY_STATUS" -eq 0 ]; then
    echo "FATAL: restore-verify exited 0 but did not print its success marker (\"${RESTORE_VERIFY_SUCCESS_MARKER}\") as its last line, so nothing shows the journal was checked. Treat this as NOT verified." >&2
  else
    echo "FATAL: the external deletion journal did not verify against this restore (restore-verify exited ${VERIFY_STATUS})." >&2
  fi
  echo "Do NOT enable workers or traffic on ${DRILL_DB}." >&2
  exit 1
fi
# AN EMPTY JOURNAL ON A LEGACY MANIFEST VERIFIES VACUOUSLY (gate rounds 1-2).
# When the manifest records the journal it was taken against, the binding above
# has already matched it to this drill's, so an empty journal here is the right
# journal being empty — a legitimate state before the first deletion or after
# the day-28 purge — and needs no stamp. A LEGACY manifest records no journal:
# then an empty journal may be the wrong journal, every check passes by having
# nothing to check, and the run is stamped on its own line. todos.md T-23 says
# what such a transcript does and does not close.
JOURNAL_OPERATION_COUNT="$(printf '%s\n' "$JOURNAL_COUNTS" | sed -n 's/^journal_operations=\([0-9][0-9]*\).*/\1/p')"
JOURNAL_EMPTY_LINE=""
if [ "$JOURNAL_OPERATION_COUNT" = "0" ] && [ "$MANIFEST_JOURNAL_BOUND" != "yes" ]; then
  JOURNAL_VERDICT="verified VACUOUSLY (0 journal operations)"
  JOURNAL_EMPTY_LINE="JOURNAL-EMPTY: zero journal operations — this run proves the journal is reachable and lists nothing, not that a deletion replays."
fi
# <<< JOURNAL VERIFY BLOCK

# --- STEP 7 (plan C4): traffic is enabled ONLY on a clean report, and this
# script never enables it. Saying "PASSED" and stopping is how a drill gets
# mistaken for a green light.
cat <<EOF

[drill] RESTORE DRILL PASSED (data restored, migrated by this drill: ${MIGRATED_BY_DRILL}, journal ${JOURNAL_VERDICT}, migration count matched)
  backup:   ${BACKUP_FILE}
  restored: ${DRILL_DB}
  journal:  ${JOURNAL_COUNTS:-(no count line)}
${JOURNAL_EMPTY_LINE:+  ${JOURNAL_EMPTY_LINE}
}  money:    $([ "$ALLOW_EMPTY_MONEY" = "accepted" ] && echo "EMPTY TABLES ALLOWED — local drill, not evidence of a money restore" || echo "subscriptions, credit_ledger and stripe_events all non-empty")
  date:     $(date -u +%Y-%m-%dT%H:%M:%SZ)

THIS IS NOT PERMISSION TO SERVE. The replay plan printed above has not been
executed, and restore-verify refuses outright if any planned step names an
operation the restored database has no row for (the worker claims work from
that table, so it could never execute such a step). Before any worker or
traffic touches ${DRILL_DB}:
  1. run the deletion worker against it with the journal configured, so every
     reapply_tombstone / replay_erasure step is executed;
  2. confirm each erasure transaction committed -- a non-zero residue rolls it
     back and leaves the operation blocked, which is the intended outcome;
  3. only then enable workers, and only then traffic.

RECORD THIS RUN in RUNBOOK.md (Backups) and in the progress artifact — an
undocumented drill is a drill nobody can point at when it matters. Then drop the
drill database:
  psql "<your maintenance url>" -c 'DROP DATABASE ${DRILL_DB} WITH (FORCE);'
EOF
