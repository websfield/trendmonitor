// THE ONE READER OF A BACKUP MANIFEST (`respin-<stamp>.manifest.json`), for
// `backup.sh`'s prune and `restore-drill.sh` alike (R-155, gate round 2).
//
// WHY ONE MODULE. Two gate rounds found the same class in both scripts: a
// manifest field the operator can edit, or a wrong clock can produce, was
// trusted as written — an `expiresAt` pushed into the future (round 1), then a
// future `createdAt` and a journal mismatch that only the flag checked (round
// 2). The fix is the class: every field either script reads is listed here with
// what binds it to a value the manifest does not control, and a field that
// fails its binding is UNREADABLE — the prune falls back to mtime, the drill
// refuses with the way forward. `restore-verify.ts` reads no manifest field.
//
// FIELD → BINDING (the population is a list, CLAUDE.md non-negotiable 7; the
// test `tests/backup-manifest.test.ts` asserts every reader below against it):
//
//   backupFile         must equal the dump's own file name. A manifest copied
//                      beside another dump describes that other dump.
//   createdAt          must parse; must not be later than now + CLOCK_SKEW
//                      (a wrong clock or an edit cannot place it in the
//                      future); and must equal, within STAMP_TOLERANCE, the
//                      `respin-<YYYYMMDDTHHMMSSZ>` stamp in the dump's file name —
//                      or, when the name carries no stamp, the dump's mtime.
//                      The stamp is checked against now + CLOCK_SKEW too.
//   expiresAt          must parse; capped: the effective expiry is the EARLIER
//                      of expiresAt and createdAt + the maximum retention.
//   sha256             (drill only) must equal the sha256 of the dump's bytes,
//                      computed here — the manifest is bound to these bytes.
//   activeTombstones   must be an array (null = the query could not run). Its
//                      CONTENT decides nothing: it is printed as a count, and
//                      the external journal (restore-verify.ts) is the
//                      authority on deletions. So an edit to it changes no
//                      outcome; nulling it refuses.
//   journalBucket,     when the manifest records them (both, non-empty), they
//   journalEnvironment must equal the drill's RESPIN_DELETION_JOURNAL_BUCKET /
//                      _ENVIRONMENT — WITH OR WITHOUT --allow-empty-money: a
//                      dump verified against a journal it was not taken against
//                      proves nothing. Exactly one recorded = unreadable.
//                      Neither recorded = a LEGACY manifest: accepted, and an
//                      empty journal on it is stamped JOURNAL-EMPTY by the drill.
//   sourceHost,        A MISTAKE-GUARD ONLY. Read for --allow-empty-money (host
//   sourcePort,        must be loopback) and printed; no binding is possible,
//   sourceDatabase     since a co-located production database is also loopback.
//                      The control for an empty-money run is its stamp.
//
//   Written but read by nothing: bytes, retentionDays, maxRetentionDays, note.
//   They carry no authority and no reader may start relying on them without a
//   binding here.
//
// THE TOLERANCES, stated: CLOCK_SKEW_SECONDS = 300 covers ordinary NTP drift
// between the backup host and the drill host. STAMP_TOLERANCE_SECONDS = 3600:
// backup.sh writes createdAt from the same instant as the stamp, so a current
// manifest matches to the second; the hour admits manifests written before
// that change, whose createdAt was taken after the dump finished.
//
// Plain JavaScript (ESM) with builtins only, so it runs under bare `node` on a
// backup host with no build step and no TypeScript loader.
// The Node globals it uses, declared here rather than in the shared eslint
// config: it is the workspace's one plain-JavaScript script.
/* global process, console, Buffer */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const CLOCK_SKEW_SECONDS = 300;
const STAMP_TOLERANCE_SECONDS = 3600;
const DAY_MS = 86_400_000;
const STAMPED_NAME = /^respin-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump\.gz\.gpg$/;
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];

/** The fields any reader reads, each with its binding — asserted by the test. */
const FIELD_BINDINGS = Object.freeze({
  backupFile: "equals the dump's file name",
  createdAt: "parses; not later than now + skew; equals the file-name stamp (or the dump's mtime) within tolerance",
  expiresAt: "parses; effective expiry = min(expiresAt, createdAt + maximum retention)",
  sha256: "equals the sha256 of the dump's bytes (drill)",
  activeTombstones: "is an array; content decides nothing (the journal is the authority)",
  journalBucket: "when recorded, equals the drill's journal bucket, flag or not",
  journalEnvironment: "when recorded, equals the drill's journal environment, flag or not",
  sourceHost: "mistake-guard only: loopback for --allow-empty-money",
  sourcePort: "mistake-guard only: printed",
  sourceDatabase: "mistake-guard only: printed",
});

const str = (v) => (typeof v === "string" && v !== "" ? v : null);

/** The stamp in a `respin-<stamp>.dump.gz.gpg` name, as epoch ms, or null. */
function stampOf(dumpPath) {
  const m = STAMPED_NAME.exec(path.basename(dumpPath));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : null;
}

/**
 * Bind the fields the expiry depends on. Returns `{ ok: true, created, effective }`
 * or `{ ok: false, reason }` — a reason names the field and the binding it failed.
 */
function bindExpiry(m, dumpPath, nowMs, maxDays, dumpMtimeMs) {
  if (str(m.backupFile) !== path.basename(dumpPath)) {
    return { ok: false, reason: `backupFile ${JSON.stringify(m.backupFile)} is not this dump's name ${JSON.stringify(path.basename(dumpPath))}` };
  }
  const created = Date.parse(m.createdAt);
  if (!Number.isFinite(created)) return { ok: false, reason: `createdAt ${JSON.stringify(m.createdAt)} does not parse` };
  if (created > nowMs + CLOCK_SKEW_SECONDS * 1000) {
    return { ok: false, reason: `createdAt ${m.createdAt} is in the future (now ${new Date(nowMs).toISOString()}, skew allowed ${CLOCK_SKEW_SECONDS}s)` };
  }
  const stamp = stampOf(dumpPath);
  const anchor = stamp ?? dumpMtimeMs;
  const anchorName = stamp !== null ? "the file-name stamp" : "the dump's mtime";
  if (anchor === null || anchor === undefined || !Number.isFinite(anchor)) {
    return { ok: false, reason: `the dump has neither a file-name stamp nor a readable mtime to bind createdAt to` };
  }
  if (stamp !== null && stamp > nowMs + CLOCK_SKEW_SECONDS * 1000) {
    return { ok: false, reason: `the file-name stamp ${new Date(stamp).toISOString()} is in the future` };
  }
  if (Math.abs(created - anchor) > STAMP_TOLERANCE_SECONDS * 1000) {
    return { ok: false, reason: `createdAt ${m.createdAt} is not ${anchorName} ${new Date(anchor).toISOString()} (tolerance ${STAMP_TOLERANCE_SECONDS}s)` };
  }
  const expires = Date.parse(m.expiresAt);
  if (!Number.isFinite(expires)) return { ok: false, reason: `expiresAt ${JSON.stringify(m.expiresAt)} does not parse` };
  return { ok: true, created, effective: Math.min(expires, created + maxDays * DAY_MS) };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** backup.sh's prune: prints YES (expired), NO, or UNREADABLE:<reason>. Never throws. */
function pruneVerdict(manifestFile, dumpPath, nowMs, maxDays) {
  let m;
  try {
    m = readJson(manifestFile);
  } catch {
    return "UNREADABLE:manifest is not valid JSON";
  }
  const bound = bindExpiry(m, dumpPath, nowMs, maxDays, mtimeOf(dumpPath));
  if (!bound.ok) return `UNREADABLE:${bound.reason}`;
  return bound.effective <= nowMs ? "YES" : "NO";
}

function sha256OfFile(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

/**
 * restore-drill.sh's manifest check. Returns `{ ok: true, lines }` — the lines
 * the drill prints, the last being `JOURNAL_BOUND=yes|no` — or
 * `{ ok: false, message }`, a FATAL with its way forward.
 */
function drillVerdict(input) {
  const { manifestFile, dumpPath, nowMs, maxDays, allowRequested, endpoint, bucket, environment, localEndpoint } = input;
  const fresh = "Take a fresh backup with scripts/backup.sh and drill that one.";
  let m;
  try {
    m = readJson(manifestFile);
  } catch {
    return { ok: false, message: `FATAL: ${manifestFile} is not valid JSON, so this backup cannot be checked. ${fresh}` };
  }
  if (!Array.isArray(m.activeTombstones)) {
    return { ok: false, message: `FATAL: ${manifestFile} records activeTombstones=${JSON.stringify(m.activeTombstones)}. The backup could not read the tombstone table, so this restore cannot know what it is about to bring back. Do not serve from it; fix the query cause and take a fresh backup with scripts/backup.sh.` };
  }
  const bound = bindExpiry(m, dumpPath, nowMs, maxDays, mtimeOf(dumpPath));
  if (!bound.ok) {
    return { ok: false, message: `FATAL: ${manifestFile} fails its binding — ${bound.reason} — so this backup's age, and therefore whether it may still exist, is unknown. ${fresh}` };
  }
  if (bound.effective <= nowMs) {
    return { ok: false, message: `FATAL: this backup EXPIRED at ${new Date(bound.effective).toISOString()} (created ${m.createdAt}, recorded expiresAt ${m.expiresAt}, maximum retention ${maxDays} days). A copy past its expiry may hold personal data a deletion request has since erased, and restoring it would bring that data back. ${fresh}` };
  }
  const actual = sha256OfFile(dumpPath);
  if (str(m.sha256) !== actual) {
    return { ok: false, message: `FATAL: ${manifestFile} records sha256 ${JSON.stringify(m.sha256)} but the dump's bytes hash to ${actual}: this manifest does not describe this dump. ${fresh}` };
  }
  const recordedBucket = str(m.journalBucket);
  const recordedEnvironment = str(m.journalEnvironment);
  if ((recordedBucket === null) !== (recordedEnvironment === null)) {
    return { ok: false, message: `FATAL: ${manifestFile} records only one of journalBucket/journalEnvironment (${JSON.stringify(recordedBucket)}/${JSON.stringify(recordedEnvironment)}), so the journal it was taken against is unknown. ${fresh}` };
  }
  const journalBound = recordedBucket !== null;
  if (journalBound && (recordedBucket !== bucket || recordedEnvironment !== environment)) {
    return { ok: false, message: `FATAL: this backup was taken against journal ${JSON.stringify(recordedBucket)}/${JSON.stringify(recordedEnvironment)}, but this drill verifies ${JSON.stringify(bucket || null)}/${JSON.stringify(environment || null)} — the dump was not taken against the journal this drill verifies, so verifying it there proves nothing. Set RESPIN_DELETION_JOURNAL_BUCKET and _ENVIRONMENT to the recorded journal, or drill a backup taken against this one.` };
  }
  const host = str(m.sourceHost);
  if (allowRequested) {
    const refuse = (why) => ({ ok: false, message: `FATAL: --allow-empty-money is accepted only in local-drill mode, and ${why} A drill against a real database or journal must prove the money came back: drop the flag.` });
    if (endpoint !== localEndpoint) return refuse(`RESPIN_DELETION_JOURNAL_ENDPOINT is ${JSON.stringify(endpoint)}, not the loopback MinIO journal (${localEndpoint}).`);
    if (!LOOPBACK_HOSTS.includes(host)) return refuse(`this backup's manifest records source host ${JSON.stringify(host)}, not a loopback database.`);
    if (!journalBound) return refuse(`this backup's manifest records no journal, so it cannot be tied to the loopback journal this drill verifies.`);
  }
  const origin = `${host ?? "(not recorded)"}:${m.sourcePort ?? "?"}/${str(m.sourceDatabase) ?? "?"}`;
  const journal = journalBound ? `${recordedBucket}/${recordedEnvironment} (matches this drill)` : "(not recorded — legacy manifest)";
  const stampNote = stampOf(dumpPath) !== null ? "the file-name stamp" : "the dump's mtime";
  return {
    ok: true,
    lines: [
      `[drill] manifest: created ${m.createdAt}, effective expiry ${new Date(bound.effective).toISOString()}, source ${origin}, journal ${journal}, active tombstones at backup time: ${m.activeTombstones.length}`,
      `[drill] manifest bindings: backupFile = this dump; createdAt within ${STAMP_TOLERANCE_SECONDS}s of ${stampNote} and not in the future; sha256 = the dump's bytes; journal ${journalBound ? "= this drill's" : "not recorded"}`,
      `JOURNAL_BOUND=${journalBound ? "yes" : "no"}`,
    ],
  };
}

export { CLOCK_SKEW_SECONDS, STAMP_TOLERANCE_SECONDS, FIELD_BINDINGS, stampOf, bindExpiry, pruneVerdict, drillVerdict };

// Run as a CLI only when node was asked to run THIS file — compared as resolved
// paths, the lesson of scripts/entrypoint.ts (a URL suffix test skips on a
// space in the path).
const invokedDirectly = (() => {
  try {
    return fs.realpathSync(path.resolve(process.argv[1] ?? "")) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

// CLI: `node backup-manifest.mjs prune <manifest> <dump> <nowEpochSeconds> <maxDays>`
//      `node backup-manifest.mjs drill <manifest> <dump> <maxDays> <allow> <endpoint> <bucket> <environment> <localEndpoint>`
if (invokedDirectly) {
  const [mode, ...a] = process.argv.slice(2);
  if (mode === "prune") {
    console.log(pruneVerdict(a[0], a[1], Number(a[2]) * 1000, Number(a[3])));
  } else if (mode === "drill") {
    const v = drillVerdict({
      manifestFile: a[0], dumpPath: a[1], nowMs: Date.now(), maxDays: Number(a[2]),
      allowRequested: a[3] !== "", endpoint: a[4], bucket: a[5], environment: a[6], localEndpoint: a[7],
    });
    if (v.ok) console.log(v.lines.join("\n"));
    else {
      console.error(v.message);
      process.exitCode = 1;
    }
  } else {
    console.error(`usage: node backup-manifest.mjs prune|drill ... (got ${JSON.stringify(mode)})`);
    process.exitCode = 2;
  }
}
