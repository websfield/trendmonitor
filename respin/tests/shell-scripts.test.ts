// Phase 10b-1 Task 5 — line-ending integrity for the operator shell scripts.
//
// WHY THIS EXISTS. `scripts/backup.sh` and `scripts/restore-drill.sh` were
// committed with CRLF line endings, which silently broke every backslash line
// continuation in them — including the `pg_dump | gzip | gpg` pipeline that IS
// the backup. bash reads a backslash followed by CR as an escaped carriage
// return, not as a continuation, so
//
//     pg_dump --dbname="$URL" \<CR><LF>
//             --format=custom  ...
//
// runs `pg_dump --dbname=... r` and then tries to execute `--format=custom` as
// a command. Measured, not assumed: a two-line CRLF fixture printed "one r" and
// exited 127 with "two: command not found".
//
// Nothing caught it because `bash -n` passes (both halves are syntactically
// valid commands), `git diff` shows nothing under core.autocrlf=true, and no
// test had ever read these files. This suite is that missing reader, and it
// asserts against PLANTED violations so it cannot pass by finding nothing.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_MAX_RETENTION_DAYS } from "@respin/db";
import { scratchDir } from "./support/scratch-dir";
import { RESTORE_VERIFY_SUCCESS_MARKER } from "../scripts/restore-verify";

const scriptsDir = resolve(__dirname, "../scripts");

/**
 * Awaited, never synchronous. `spawnSync` blocks the whole worker thread and
 * starves vitest's reporter RPC — the repo has a guard for exactly that
 * (import-boundary.test.ts), and it caught the first version of this file.
 */
const execFileAsync = promisify(execFile);
async function runScript(
  script: string,
  env: Readonly<Record<string, string>>
): Promise<{ status: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [join(scriptsDir, script)], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}
const BACKSLASH = String.fromCharCode(92);

function shellScripts(): readonly string[] {
  return readdirSync(scriptsDir)
    .filter((name) => name.endsWith(".sh"))
    .sort();
}

/** The two defects, as one reusable check, so the planted-violation test uses
 *  exactly the code the real test uses rather than a restatement of it. */
export function shellLineEndingDefects(source: string): readonly string[] {
  const defects: string[] = [];
  const crlf = source.split("\r\n").length - 1;
  if (crlf > 0) defects.push(`${crlf} CRLF line ending(s)`);
  const broken = source.split(`${BACKSLASH}\r\n`).length - 1;
  if (broken > 0) defects.push(`${broken} backslash line continuation(s) followed by CR`);
  return defects;
}

describe("operator shell scripts", () => {
  it("finds the scripts at all (a suite that scans nothing proves nothing)", () => {
    expect(shellScripts().length).toBeGreaterThan(0);
    expect(shellScripts()).toContain("backup.sh");
    expect(shellScripts()).toContain("restore-drill.sh");
  });

  for (const name of shellScripts()) {
    it(`${name} uses LF endings, so its line continuations actually continue`, () => {
      const source = readFileSync(join(scriptsDir, name), "utf8");
      expect(shellLineEndingDefects(source)).toEqual([]);
    });

    it(`${name} still starts with a shebang whose interpreter is not CR-terminated`, () => {
      const source = readFileSync(join(scriptsDir, name), "utf8");
      expect(source.startsWith("#!")).toBe(true);
      expect(source.split("\n")[0]).not.toMatch(/\r$/);
    });
  }

  it("PARSES — a line-ending scanner cannot tell you the shell is valid", async () => {
    // Round-1 code CHANGE 7: this suite was named shell-scripts.test.ts and
    // asserted only line endings, so a syntax error anywhere in either script
    // left all tests green.
    for (const name of shellScripts()) {
      await expect(execFileAsync("bash", ["-n", join(scriptsDir, name)])).resolves.toBeDefined();
    }
  });

  it("CATCHES A PLANTED VIOLATION of each shape it claims to cover", () => {
    // Without this, a scanner that silently matched nothing would report every
    // script clean and the suite would be green over a broken backup.
    expect(shellLineEndingDefects(`echo one ${BACKSLASH}\r\n  two\r\n`)).toEqual([
      "2 CRLF line ending(s)",
      "1 backslash line continuation(s) followed by CR",
    ]);
    expect(shellLineEndingDefects("echo one\r\n")).toEqual(["1 CRLF line ending(s)"]);
    expect(shellLineEndingDefects(`echo one ${BACKSLASH}\n  two\n`)).toEqual([]);
  });
});

describe("backup.sh — the R-119 retention refusal (round-1 code CHANGE 7)", () => {
  // The whole BACKUP_MAX_RETENTION_DAYS block could be deleted and every test
  // stayed green, because nothing executed the script. These run it. Each case
  // exits on argument validation alone, before pg_dump, so nothing is dumped,
  // written or connected to.
  const run = (retention: string) =>
    runScript("backup.sh", {
      DATABASE_URL: "postgres://unused@127.0.0.1:1/none",
      BACKUP_DIR: join(scriptsDir, "..", ".tmp", "backup-guard-probe"),
      BACKUP_PASSPHRASE_FILE: join(scriptsDir, "..", "package.json"),
      RETENTION_DAYS: retention,
    });

  it("the shell's BACKUP_MAX_RETENTION_DAYS is the SAME number the account page quotes (compliance gate, independent round 2)", () => {
    // `external-copies.ts` quotes the day-28 window from BACKUP_MAX_RETENTION_DAYS
    // and this script enforces its own literal; the two never met, so an
    // R-119 change to one alone left the page wrong. A non-comment assignment
    // line must carry the TypeScript constant's value.
    const source = readFileSync(join(scriptsDir, "backup.sh"), "utf8");
    const assignments = source
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => /^BACKUP_MAX_RETENTION_DAYS=/.test(line));
    expect(assignments).toEqual([`BACKUP_MAX_RETENTION_DAYS=${BACKUP_MAX_RETENTION_DAYS}`]);
  });

  it("REFUSES a retention above 21 days rather than clamping it", async () => {
    const result = await run("22");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/exceeds the 21-day maximum/);
    expect(result.stderr).toMatch(/Lower RETENTION_DAYS, or change R-119 first/);
  });

  it("REFUSES a non-numeric or zero retention", async () => {
    const words = await run("thirty");
    expect(words.status).toBe(1);
    expect(words.stderr).toMatch(/whole number of days/);
    const zero = await run("0");
    expect(zero.status).toBe(1);
    expect(zero.stderr).toMatch(/would prune the backup this run just made/);
  });

  it("ACCEPTS 21 and below — non-vacuity, or the refusal above proves nothing", async () => {
    const result = await run("21");
    expect(result.stderr).not.toMatch(/exceeds the 21-day maximum/);
    expect(result.stderr).not.toMatch(/whole number of days/);
  });
});

describe("restore-drill.sh — the DROP DATABASE guard (round-1 security H3)", () => {
  // The guard was `respin_restore_drill*`, a PREFIX glob, and the value was
  // interpolated unquoted into `psql -c`, which runs every statement in the
  // string. The reviewer demonstrated the bypass; this pins it closed.
  const run = (drillDb: string, servingDisabled = "confirmed") =>
    runScript("restore-drill.sh", {
      BACKUP_FILE: join(scriptsDir, "nonexistent.dump.gz.gpg"),
      BACKUP_PASSPHRASE_FILE: join(scriptsDir, "..", "package.json"),
      MAINTENANCE_URL: "postgres://unused@127.0.0.1:1/postgres",
      RESTORE_SERVING_DISABLED: servingDisabled,
      DRILL_DB: drillDb,
    });

  it("REFUSES a name that merely starts with the safe prefix", async () => {
    const result = await run("respin_restore_drill; DROP DATABASE respin_prod; --");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/refusing to drop/);
    expect(result.stdout).not.toMatch(/recreating/);
  });

  it("REFUSES an unrelated database name", async () => {
    expect((await run("respin_prod")).status).toBe(1);
    expect((await run("postgres")).status).toBe(1);
  });

  it("ACCEPTS the exact name and a safe suffix — non-vacuity", async () => {
    for (const name of ["respin_restore_drill", "respin_restore_drill_2026"]) {
      expect((await run(name)).stderr, name).not.toMatch(/refusing to drop/);
    }
  });

  it("REFUSES to run at all unless serving is declared disabled", async () => {
    const result = await run("respin_restore_drill", "");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RESTORE_SERVING_DISABLED/);
  });
});

describe("backup.sh — the retention prune (round-2: the fix had no witness)", () => {
  // Round 2 found TWO defects here that a single fixture directory would have
  // caught: the keep-branch printed a prune it had not performed, and the
  // "orphan" sweep deleted the manifest and checksum of a LIVE dump — undoing
  // the manifest authority the same change had just installed.
  //
  // The prune is the `prune_expired_backups` function (since R-155 it runs from
  // the EXIT trap on every path). The function is extracted and called over
  // dated fixtures — a real execution of the shipped lines, not a restatement
  // of them. The whole-script runs further down prove the trap calls it.
  const PRUNE_START = "prune_expired_backups() {";

  function pruneBlock(): string {
    const source = readFileSync(join(scriptsDir, "backup.sh"), "utf8").replace(/\r\n/g, "\n");
    const start = source.indexOf(PRUNE_START);
    expect(start, "the prune function moved; this test is pinned to it by name").toBeGreaterThan(0);
    const end = source.indexOf("\n}\n", start);
    expect(end, "the prune function has no closing brace at column 0").toBeGreaterThan(start);
    return `${source.slice(start, end + 3)}prune_expired_backups\n`;
  }

  function fixture(name: string, opts: { expiresAt?: string; ageDays?: number; manifest?: boolean }) {
    const dir = mkdtempPrune();
    return { dir, name, ...opts };
  }
  function mkdtempPrune(): string {
    const dir = join(tmpdir(), `respin-prune-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * A backup the way backup.sh writes one (gate round 2): when it has a
   * manifest, the file name carries the creation stamp and `createdAt` is that
   * instant (default: a day ago), because scripts/backup-manifest.mjs binds the
   * two. A manifest-less fixture keeps its label as its name. Returns the name
   * stem (`respin-…`), which the assertions use.
   */
  function writeBackup(
    dir: string,
    label: string,
    options: { expiresAt?: string | null; ageDays?: number; createdAt?: string }
  ): string {
    const hasManifest = options.expiresAt !== null && options.expiresAt !== undefined;
    const createdAt = options.createdAt ?? new Date(Math.floor((Date.now() - 86_400_000) / 1000) * 1000).toISOString();
    const createdMs = Date.parse(createdAt);
    const stem =
      hasManifest && Number.isFinite(createdMs)
        ? `respin-${new Date(createdMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`
        : `respin-${label}`;
    const base = join(dir, stem);
    writeFileSync(`${base}.dump.gz.gpg`, "x".repeat(5000));
    writeFileSync(`${base}.sha256`, `deadbeef  ${stem}.dump.gz.gpg\n`);
    if (hasManifest) {
      writeFileSync(
        `${base}.manifest.json`,
        JSON.stringify({ backupFile: `${stem}.dump.gz.gpg`, createdAt, expiresAt: options.expiresAt })
      );
    }
    if (options.ageDays !== undefined) {
      const when = new Date(Date.now() - options.ageDays * 86_400_000);
      for (const suffix of [".dump.gz.gpg", ".sha256", ".manifest.json"]) {
        try {
          utimesSync(`${base}${suffix}`, when, when);
        } catch {
          /* the manifest may not exist for this fixture */
        }
      }
    }
    return stem;
  }

  const runPrune = async (dir: string, retentionDays = 21) => {
    const script = [
      "set -euo pipefail",
      `BACKUP_DIR=${JSON.stringify(dir)}`,
      `BACKUP_MAX_RETENTION_DAYS=${BACKUP_MAX_RETENTION_DAYS}`,
      `PRUNE_FALLBACK_DAYS=${retentionDays}`,
      // Where the prune finds scripts/backup-manifest.mjs (backup.sh sets it from $0).
      `BACKUP_SCRIPT_DIR=${JSON.stringify(scriptsDir)}`,
      pruneBlock(),
    ].join("\n");
    try {
      const { stdout, stderr } = await execFileAsync("bash", ["-c", script], { encoding: "utf8" });
      return { stdout, stderr, files: readdirSync(dir).sort() };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { stdout: failed.stdout ?? "", stderr: failed.stderr ?? "", files: readdirSync(dir).sort() };
    }
  };

  it("removes a backup whose RECORDED expiry has passed, even when its mtime is fresh", async () => {
    // The whole point of the manifest authority: an rsync or copy resets mtime,
    // so mtime must not decide whether a capable copy may still exist.
    const dir = mkdtempPrune();
    writeBackup(dir, "expired", { expiresAt: "2020-01-01T00:00:00Z", ageDays: 0 });
    const result = await runPrune(dir);
    expect(result.files).toEqual([]);
    expect(result.stdout).toMatch(/expired, removing/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("KEEPS a backup whose recorded expiry is in the future, even when its mtime is old", async () => {
    const dir = mkdtempPrune();
    const stem = writeBackup(dir, "fresh", { expiresAt: "2099-01-01T00:00:00Z", ageDays: 40 });
    const result = await runPrune(dir);
    expect(result.files).toContain(`${stem}.dump.gz.gpg`);
    expect(result.files).toContain(`${stem}.manifest.json`);
    rmSync(dir, { recursive: true, force: true });
  });

  it("NEVER deletes the manifest or checksum of a live dump (round-2 defect)", async () => {
    // The "orphan" sweep tested only mtime. On a 40-day-old but unexpired
    // backup it stripped both sidecars, destroying the manifest authority and
    // the integrity checksum while the dump itself survived.
    const dir = mkdtempPrune();
    const stem = writeBackup(dir, "old-but-valid", { expiresAt: "2099-01-01T00:00:00Z", ageDays: 40 });
    const result = await runPrune(dir);
    expect(result.files.sort()).toEqual([`${stem}.dump.gz.gpg`, `${stem}.manifest.json`, `${stem}.sha256`]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("sweeps a sidecar only once its dump is genuinely gone", async () => {
    const dir = mkdtempPrune();
    writeFileSync(join(dir, "respin-ghost.sha256"), "deadbeef  respin-ghost.dump.gz.gpg\n");
    writeFileSync(join(dir, "respin-ghost.manifest.json"), JSON.stringify({ expiresAt: "2099-01-01T00:00:00Z" }));
    const result = await runPrune(dir);
    expect(result.files).toEqual([]);
    expect(result.stdout).toMatch(/orphaned sidecar/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to mtime ONLY when no manifest is readable, and says so honestly", async () => {
    const young = mkdtempPrune();
    writeBackup(young, "no-manifest-young", { expiresAt: null, ageDays: 5 });
    const keptRun = await runPrune(young);
    expect(keptRun.files).toContain("respin-no-manifest-young.dump.gz.gpg");
    // The message must describe what actually happened — the round-2 defect was
    // a KEEP branch printing "pruning it on mtime alone".
    expect(keptRun.stderr).toMatch(/keeping it/);
    expect(keptRun.stderr).not.toMatch(/pruning it on mtime alone/);
    rmSync(young, { recursive: true, force: true });

    const old = mkdtempPrune();
    writeBackup(old, "no-manifest-old", { expiresAt: null, ageDays: 40 });
    const prunedRun = await runPrune(old);
    expect(prunedRun.files).toEqual([]);
    rmSync(old, { recursive: true, force: true });
  });

  it("PLANTED: an EDITED expiresAt cannot keep a copy alive — effective expiry is capped at createdAt + 21 days (gate round 1)", async () => {
    const dir = mkdtempPrune();
    const created = new Date(Math.floor((Date.now() - 30 * 86_400_000) / 1000) * 1000).toISOString();
    const stem = writeBackup(dir, "edited", { expiresAt: "2099-01-01T00:00:00Z", createdAt: created, ageDays: 0 });
    const result = await runPrune(dir);
    expect(result.files).toEqual([]);
    expect(result.stdout).toContain(`expired, removing: ${stem}.dump.gz.gpg`);
    rmSync(dir, { recursive: true, force: true });
  });

  it("PLANTED: a FUTURE createdAt (an edit or a wrong clock) is unreadable — an old dump is pruned on mtime, not kept (gate round 2)", async () => {
    // Without the binding, min(expiresAt, createdAt + 21 days) with a future
    // createdAt lands in the future too, and the copy is kept indefinitely.
    const dir = mkdtempPrune();
    const base = join(dir, "respin-20200101T000000Z");
    writeFileSync(`${base}.dump.gz.gpg`, "x".repeat(5000));
    writeFileSync(
      `${base}.manifest.json`,
      JSON.stringify({ backupFile: "respin-20200101T000000Z.dump.gz.gpg", createdAt: "2099-01-01T00:00:00Z", expiresAt: "2099-01-22T00:00:00Z" })
    );
    const old = new Date(Date.now() - 40 * 86_400_000);
    utimesSync(`${base}.dump.gz.gpg`, old, old);
    const result = await runPrune(dir);
    expect(result.files).toEqual([]);
    expect(result.stderr).toMatch(/UNREADABLE:createdAt 2099-01-01T00:00:00Z is in the future/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("an unreadable createdAt makes the manifest unreadable — the mtime fallback decides, said out loud", async () => {
    const dir = mkdtempPrune();
    writeBackup(dir, "no-created", { expiresAt: "2099-01-01T00:00:00Z", createdAt: "whenever", ageDays: 40 });
    const result = await runPrune(dir);
    expect(result.files).toEqual([]);
    expect(result.stderr).toMatch(/no readable manifest \(UNREADABLE:createdAt "whenever" does not parse\) and older than 21 days, removing: respin-no-created/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("bounds the fallback at the retention window, not one day past it", async () => {
    // `-mtime +21` matches at 22 days, which put the last capable copy at day
    // 29 against a day-28 promise. The fallback uses N-1 for that reason.
    const dir = mkdtempPrune();
    writeBackup(dir, "exactly-21", { expiresAt: null, ageDays: 21 });
    const result = await runPrune(dir, 21);
    expect(result.files).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  // `fixture` is retained for readability of the helpers above.
  void fixture;
});

// ---------------------------------------------------------------------------
// R-155 — the drill's PASS has to mean something, and the backup's failure
// modes are loud (register 2026-10-05 item 3; P9-A1, P9-A2).
//
// These run the WHOLE scripts, with the tools they shell out to replaced by
// stubs on PATH: `pg_dump`, `psql`, `pg_restore`, `gpg`, `gunzip` and `pnpm`
// are faked; `node`, `sha256sum`, `gzip`, `date` and `find` are the real ones.
// So what runs is the shipped control flow — the preflight, the EXIT trap, the
// manifest checks, the local-drill bound — not an extracted restatement.
// ---------------------------------------------------------------------------

/** Self-removing scratch directories (the repo helper; bound to the running test). */
const scratch = (prefix: string): string => scratchDir(prefix);

/**
 * A directory of executable bash stubs: name → script body. The shebang is
 * `/bin/bash`, not `/usr/bin/env bash`, so a stub still runs when PATH holds
 * only the stub directory (env would look bash up on that PATH and fail).
 */
function stubBin(stubs: Readonly<Record<string, string>>): string {
  const dir = scratch("respin-stubs-");
  for (const [name, body] of Object.entries(stubs)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, 0o755);
  }
  return dir;
}

/** The tools the prune needs, passed through when PATH holds only stubs. */
const PRUNE_TOOLS = ["date", "find", "rm", "basename"] as const;

/**
 * Run `bash <script> ...args` with `stubDir` on PATH — PREPENDED to the real
 * PATH, or as the ONLY entry (to prove a tool's absence even on a host that has
 * it, as ubuntu CI has psql). The PATH is set inside bash, from `$BASH`, so
 * neither node's command lookup nor msys path conversion decides it. In "only"
 * mode, each `passthrough` tool gets a wrapper in the stub directory that execs
 * the real binary, resolved on the ORIGINAL PATH before it is replaced — so a
 * test chooses exactly which real tools exist.
 */
async function runWithStubs(
  script: string,
  stubDir: string,
  env: Readonly<Record<string, string>>,
  options: { args?: readonly string[]; pathMode?: "prepend" | "only"; passthrough?: readonly string[] } = {}
): Promise<{ status: number; stdout: string; stderr: string }> {
  const stubPosix = 'stub="$(cygpath -u "$1" 2>/dev/null || printf %s "$1")"';
  const wrappers = (options.passthrough ?? [])
    .map((tool) => `real="$(command -v ${tool})" && printf '#!/bin/bash\\nexec "%s" "$@"\\n' "$real" > "$stub/${tool}" && chmod +x "$stub/${tool}"`)
    .join("; ");
  const setPath =
    options.pathMode === "only"
      ? `${stubPosix}; ${wrappers ? `${wrappers}; ` : ""}export PATH="$stub"`
      : `${stubPosix}; export PATH="$stub:$PATH"`;
  const inner = `${setPath}; shift; exec "$BASH" "$@"`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "bash",
      ["-c", inner, "bash", stubDir, join(scriptsDir, script), ...(options.args ?? [])],
      { env: { ...process.env, ...env }, encoding: "utf8" }
    );
    return { status: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

/** A fake gpg that copies stdin to `--output`, or the input file to stdout. */
const FAKE_GPG = [
  'out=""; prev=""; last=""',
  'for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; last="$a"; done',
  'if [ -n "$out" ]; then cat > "$out"; else cat "$last"; fi',
].join("\n");

describe("backup.sh — loud failure modes and an expiry prune on every exit (P9-A2)", () => {
  const passFile = (): string => {
    const dir = scratch("respin-pass-");
    const file = join(dir, "backup.pass");
    writeFileSync(file, "not-a-real-passphrase\n");
    return file;
  };
  const env = (backupDir: string): Record<string, string> => ({
    DATABASE_URL: "postgres://backup:pw@127.0.0.1:1/respin",
    BACKUP_DIR: backupDir,
    BACKUP_PASSPHRASE_FILE: passFile(),
    RETENTION_DAYS: "21",
    RESPIN_DELETION_JOURNAL_BUCKET: "",
    RESPIN_DELETION_JOURNAL_ENVIRONMENT: "",
  });
  const RANDOM_DUMP = "head -c 16384 /dev/urandom";
  const EXPIRED = "respin-20200101T000000Z";
  /**
   * An expired backup another run left behind — the prune must remove it. Its
   * manifest says so AND its mtime is 40 days old, so it is expired both to the
   * manifest reader and to the mtime fallback a node-less host uses.
   */
  const plantExpired = (dir: string): void => {
    const base = join(dir, EXPIRED);
    writeFileSync(`${base}.dump.gz.gpg`, "x".repeat(5000));
    writeFileSync(`${base}.sha256`, `deadbeef  ${EXPIRED}.dump.gz.gpg\n`);
    writeFileSync(
      `${base}.manifest.json`,
      JSON.stringify({ backupFile: `${EXPIRED}.dump.gz.gpg`, createdAt: "2020-01-01T00:00:00Z", expiresAt: "2020-01-22T00:00:00Z" })
    );
    const old = new Date(Date.now() - 40 * 86_400_000);
    for (const suffix of [".dump.gz.gpg", ".sha256", ".manifest.json"]) utimesSync(`${base}${suffix}`, old, old);
  };
  const expectPruned = (dir: string, result: { status: number; stdout: string; stderr: string }) => {
    expect(result.status, result.stderr).not.toBe(0);
    expect(readdirSync(dir).filter((f) => f.startsWith(EXPIRED)), `${result.stdout}\n${result.stderr}`).toEqual([]);
  };

  // THE EARLY EXITS (gate round 1, HIGH): every one of these used to leave the
  // expired backup in place, because the trap was installed after them. Each
  // plants one and asserts it is gone and the exit is non-zero.
  it("an absent psql exits 1 — even on a host that has one — and still prunes (no node either: the mtime fallback)", async () => {
    const dir = scratch("respin-bk-");
    plantExpired(dir);
    const stubs = stubBin({ pg_dump: "exit 0", gpg: "exit 0" });
    const result = await runWithStubs("backup.sh", stubs, env(dir), { pathMode: "only", passthrough: PRUNE_TOOLS });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FATAL: psql not on PATH/);
    expect(result.stderr).toMatch(/no readable manifest \(NO_NODE\) and older than 21 days, removing: respin-20200101T000000Z/);
    expectPruned(dir, result);
  });

  it("an absent gpg exits 1 and still prunes, on the manifest (node present)", async () => {
    const dir = scratch("respin-bk-");
    plantExpired(dir);
    const stubs = stubBin({ pg_dump: "exit 0", psql: "exit 0" });
    const result = await runWithStubs("backup.sh", stubs, env(dir), { pathMode: "only", passthrough: [...PRUNE_TOOLS, "node"] });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FATAL: gpg not on PATH/);
    expect(result.stdout).toMatch(/expired, removing: respin-20200101T000000Z\.dump\.gz\.gpg/);
    expectPruned(dir, result);
  });

  it("an absent node exits 1 and still prunes, on the mtime fallback", async () => {
    const dir = scratch("respin-bk-");
    plantExpired(dir);
    const stubs = stubBin({ pg_dump: "exit 0", psql: "exit 0", gpg: "exit 0", gzip: "exit 0", sha256sum: "exit 0" });
    const result = await runWithStubs("backup.sh", stubs, env(dir), { pathMode: "only", passthrough: PRUNE_TOOLS });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FATAL: node not on PATH/);
    expectPruned(dir, result);
  });

  it("an unreadable passphrase file, a refused RETENTION_DAYS, and an unset DATABASE_URL each exit 1 and still prune", async () => {
    for (const [label, overrides, message] of [
      ["unreadable passphrase", { BACKUP_PASSPHRASE_FILE: join(tmpdir(), "respin-no-such-passphrase-file") }, /passphrase file .* is not readable/],
      ["retention above 21", { RETENTION_DAYS: "22" }, /exceeds the 21-day maximum/],
      ["DATABASE_URL unset", { DATABASE_URL: "" }, /DATABASE_URL is required/],
    ] as const) {
      const dir = scratch("respin-bk-");
      plantExpired(dir);
      const result = await runWithStubs("backup.sh", stubBin({}), { ...env(dir), ...overrides });
      expect(result.status, label).toBe(1);
      expect(result.stderr, label).toMatch(message);
      expectPruned(dir, result);
    }
  });

  it("a FAILED tombstone query exits non-zero — and keeps the dump, writes the null manifest, and still prunes", async () => {
    const dir = scratch("respin-bk-");
    plantExpired(dir);
    const stubs = stubBin({
      pg_dump: RANDOM_DUMP,
      psql: 'echo "psql: connection refused" >&2; exit 2',
      gpg: FAKE_GPG,
    });
    const result = await runWithStubs("backup.sh", stubs, env(dir));
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/tombstone manifest is null/);
    expect(result.stdout).toMatch(/expired, removing: respin-20200101T000000Z\.dump\.gz\.gpg/);
    const manifests = readdirSync(dir).filter((f) => f.endsWith(".manifest.json"));
    expect(manifests).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, manifests[0]!), "utf8")).activeTombstones).toBeNull();
  });

  it("a FAILED pg_dump still runs the expiry prune (the EXIT trap), and removes only this run's partial files", async () => {
    const dir = scratch("respin-bk-");
    plantExpired(dir);
    const stubs = stubBin({ pg_dump: 'echo "pg_dump: error: connection failed" >&2; exit 1', psql: "echo '[]'", gpg: FAKE_GPG });
    const result = await runWithStubs("backup.sh", stubs, env(dir));
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/pruning backups whose effective expiry has passed/);
    expect(result.stdout).toMatch(/expired, removing: respin-20200101T000000Z\.dump\.gz\.gpg/);
    expect(result.stderr).toMatch(/this run did not complete; removing its partial file/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("the origin fields record the journal the backup was taken against, when the shell names one", async () => {
    const dir = scratch("respin-bk-");
    const stubs = stubBin({ pg_dump: RANDOM_DUMP, psql: "echo '[]'", gpg: FAKE_GPG });
    const result = await runWithStubs("backup.sh", stubs, {
      ...env(dir),
      RESPIN_DELETION_JOURNAL_BUCKET: "respin-deletion-journal-local",
      RESPIN_DELETION_JOURNAL_ENVIRONMENT: "local",
    });
    expect(result.status, result.stderr).toBe(0);
    const manifestFile = readdirSync(dir).find((f) => f.endsWith(".manifest.json"))!;
    const manifest = JSON.parse(readFileSync(join(dir, manifestFile), "utf8"));
    expect(manifest.journalBucket).toBe("respin-deletion-journal-local");
    expect(manifest.journalEnvironment).toBe("local");
  });

  it("a successful run records the origin (never user or password), a checksum relative to its directory, and a MOVED directory still verifies", async () => {
    const dir = scratch("respin-bk-");
    const stubs = stubBin({ pg_dump: RANDOM_DUMP, psql: "echo '[]'", gpg: FAKE_GPG });
    const result = await runWithStubs("backup.sh", stubs, env(dir));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/\[backup\] health: backups_present=1/);
    const base = readdirSync(dir).find((f) => f.endsWith(".manifest.json"))!.replace(/\.manifest\.json$/, "");
    const manifest = JSON.parse(readFileSync(join(dir, `${base}.manifest.json`), "utf8"));
    expect(manifest.sourceHost).toBe("127.0.0.1");
    expect(manifest.sourcePort).toBe(1);
    expect(manifest.sourceDatabase).toBe("respin");
    expect(manifest.journalBucket).toBeNull();
    expect(manifest.journalEnvironment).toBeNull();
    expect(JSON.stringify(manifest)).not.toMatch(/backup:|pw@|:1\/respin/);
    expect(manifest.activeTombstones).toEqual([]);
    // The checksum names the file alone — no directory. GNU sha256sum separates
    // hash and name with two spaces, or " *" in binary mode (the msys default).
    expect(readFileSync(join(dir, `${base}.sha256`), "utf8").trim()).toMatch(new RegExp(`^[0-9a-f]{64} [ *]${base}\\.dump\\.gz\\.gpg$`));
    // Move the whole directory and verify from it, exactly as restore-drill.sh does.
    const moved = join(scratch("respin-bk-moved-"), "elsewhere");
    renameSync(dir, moved);
    const check = await execFileAsync("bash", ["-c", 'cd "$(cygpath -u "$1" 2>/dev/null || printf %s "$1")" && sha256sum -c "$2"', "bash", moved, `${base}.sha256`], { encoding: "utf8" });
    expect(check.stdout).toMatch(/: OK/);
  });
});

describe("restore-drill.sh — manifest refusals, the bounded local mode, the verifier's marker (P9-A1)", () => {
  const ALL_TOOLS_FAIL_AT_CONNECT = {
    pg_restore: "exit 0",
    psql: 'echo "psql: stub refuses to connect" >&2; exit 2',
    gpg: FAKE_GPG,
    gunzip: "cat",
    pnpm: "exit 0",
  };
  /**
   * A dump and its manifest the way backup.sh writes them (gate round 2): the
   * name carries the stamp of `createdAt`, `backupFile` is that name and
   * `sha256` is the bytes' hash. A key in `manifest` overrides either, which is
   * how a planted case breaks one binding at a time.
   */
  function backup(manifest: Record<string, unknown> | null): string {
    const dir = scratch("respin-drill-bk-");
    const created = typeof manifest?.createdAt === "string" ? Date.parse(manifest.createdAt) : NaN;
    const stamp = new Date(Number.isFinite(created) ? created : Date.UTC(2026, 9, 5))
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const stem = `respin-${stamp}`;
    const dump = join(dir, `${stem}.dump.gz.gpg`);
    const bytes = "x".repeat(5000);
    writeFileSync(dump, bytes);
    if (manifest) {
      writeFileSync(
        join(dir, `${stem}.manifest.json`),
        JSON.stringify({ backupFile: `${stem}.dump.gz.gpg`, sha256: createHash("sha256").update(bytes).digest("hex"), ...manifest })
      );
    }
    return dump;
  }
  const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const PAST = new Date(Date.now() - 86_400_000).toISOString();
  const good = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date().toISOString(),
    expiresAt: FUTURE,
    sourceHost: "127.0.0.1",
    sourcePort: 5435,
    sourceDatabase: "respin_drill_source",
    journalBucket: "respin-deletion-journal-local",
    journalEnvironment: "local",
    activeTombstones: [],
    ...overrides,
  });
  /** The local-drill journal env, matching good()'s journal fields. */
  const LOCAL_JOURNAL = {
    RESPIN_DELETION_JOURNAL_ENDPOINT: "http://127.0.0.1:9000",
    RESPIN_DELETION_JOURNAL_BUCKET: "respin-deletion-journal-local",
    RESPIN_DELETION_JOURNAL_ENVIRONMENT: "local",
  };
  const run = (bk: string, extra: Record<string, string> = {}, args: readonly string[] = []) =>
    runWithStubs(
      "restore-drill.sh",
      stubBin(ALL_TOOLS_FAIL_AT_CONNECT),
      {
        BACKUP_FILE: bk,
        BACKUP_PASSPHRASE_FILE: join(scriptsDir, "..", "package.json"),
        MAINTENANCE_URL: "postgres://drill:pw@127.0.0.1:1/postgres",
        RESTORE_SERVING_DISABLED: "confirmed",
        // The journal good() records, so the journal binding (which applies
        // with or without the flag since gate round 2) passes by default; the
        // endpoint stays non-local unless a case sets it.
        RESPIN_DELETION_JOURNAL_ENDPOINT: "",
        RESPIN_DELETION_JOURNAL_BUCKET: "respin-deletion-journal-local",
        RESPIN_DELETION_JOURNAL_ENVIRONMENT: "local",
        ...extra,
      },
      { args }
    );

  it("the shell's success marker is the SAME literal restore-verify.ts prints", () => {
    const source = readFileSync(join(scriptsDir, "restore-drill.sh"), "utf8");
    const assignment = source.split(/\r?\n/).filter((l) => /^RESTORE_VERIFY_SUCCESS_MARKER=/.test(l));
    expect(assignment).toEqual([`RESTORE_VERIFY_SUCCESS_MARKER="${RESTORE_VERIFY_SUCCESS_MARKER}"`]);
  });

  it("REFUSES a positional argument (aws.md's old `<backup-file>` form), naming the env inputs", async () => {
    const result = await run(backup(good()), {}, ["/mnt/backups/x.dump.gz.gpg"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown argument .*BACKUP_FILE/);
  });

  it("REFUSES a backup with no manifest, with the fresh-backup way forward", async () => {
    const result = await run(backup(null));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no readable manifest/);
    expect(result.stderr).toMatch(/Take a fresh backup with scripts\/backup\.sh/);
    expect(result.stdout).not.toMatch(/recreating/);
  });

  it("REFUSES an EXPIRED manifest, with the fresh-backup way forward — before anything is restored", async () => {
    const result = await run(backup(good({ expiresAt: PAST })));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/this backup EXPIRED at/);
    expect(result.stderr).toMatch(/Take a fresh backup with scripts\/backup\.sh and drill that one/);
    expect(result.stdout).not.toMatch(/recreating/);
  });

  it("REFUSES a null tombstone manifest and an unreadable expiresAt", async () => {
    const nullTombstones = await run(backup(good({ activeTombstones: null })));
    expect(nullTombstones.status).toBe(1);
    expect(nullTombstones.stderr).toMatch(/activeTombstones=null/);
    const noExpiry = await run(backup(good({ expiresAt: "soon" })));
    expect(noExpiry.status).toBe(1);
    expect(noExpiry.stderr).toMatch(/expiresAt "soon" does not parse/);
    const noCreated = await run(backup(good({ createdAt: "a while ago" })));
    expect(noCreated.status).toBe(1);
    expect(noCreated.stderr).toMatch(/createdAt "a while ago" does not parse/);
  });

  it("PLANTED: an EDITED expiresAt is refused — the effective expiry is capped at createdAt + 21 days (gate round 1)", async () => {
    const result = await run(
      backup(good({ createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), expiresAt: "2099-01-01T00:00:00Z" }))
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/this backup EXPIRED at .* maximum retention 21 days/);
    expect(result.stderr).toMatch(/Take a fresh backup with scripts\/backup\.sh/);
    expect(result.stdout).not.toMatch(/recreating/);
  });

  it("the drill's maximum retention is the SAME number backup.sh and the account page use", () => {
    const source = readFileSync(join(scriptsDir, "restore-drill.sh"), "utf8");
    const assignments = source.split(/\r?\n/).filter((l) => /^BACKUP_MAX_RETENTION_DAYS=/.test(l));
    expect(assignments).toEqual([`BACKUP_MAX_RETENTION_DAYS=${BACKUP_MAX_RETENTION_DAYS}`]);
  });

  it("ACCEPTS an unexpired manifest — non-vacuity: it gets as far as the (stubbed, refusing) database", async () => {
    const result = await run(backup(good()));
    expect(result.stdout).toMatch(/\[drill\] manifest: created .* source 127\.0\.0\.1:5435\/respin_drill_source, journal respin-deletion-journal-local\/local/);
    expect(result.stdout).toMatch(/\[drill\] recreating respin_restore_drill/);
    expect(result.stderr).toMatch(/stub refuses to connect/);
    expect(result.status).not.toBe(0);
  });

  it("--allow-empty-money is REFUSED outside local-drill mode: a non-loopback journal endpoint", async () => {
    for (const endpoint of ["", "https://s3.eu-west-2.amazonaws.com", "http://localhost:9000", "http://127.0.0.1:9001"]) {
      const result = await run(backup(good()), { RESPIN_DELETION_JOURNAL_ENDPOINT: endpoint }, ["--allow-empty-money"]);
      expect(result.status, endpoint).toBe(1);
      expect(result.stderr, endpoint).toMatch(/accepted only in local-drill mode/);
      expect(result.stdout, endpoint).not.toMatch(/EMPTY-MONEY-ALLOWED/);
    }
  });

  it("--allow-empty-money is REFUSED outside local-drill mode: a manifest from a non-loopback source host", async () => {
    for (const sourceHost of ["db.internal.example", "10.0.0.5", null]) {
      const result = await run(
        backup(good({ sourceHost })),
        LOCAL_JOURNAL,
        ["--allow-empty-money"]
      );
      expect(result.status, String(sourceHost)).toBe(1);
      expect(result.stderr, String(sourceHost)).toMatch(/source host .* not a loopback database/);
    }
  });

  it("--allow-empty-money is REFUSED when the manifest's journal is not the drill's, or is not recorded", async () => {
    const cases: readonly [string, Record<string, unknown>, Record<string, string>, RegExp][] = [
      ["a production bucket on a co-located host", { journalBucket: "respin-deletion-journal-prod-770371751912", journalEnvironment: "prod" }, LOCAL_JOURNAL, /the dump was not taken against the journal this drill verifies/],
      ["a manifest with no journal recorded", { journalBucket: null, journalEnvironment: null }, LOCAL_JOURNAL, /records no journal/],
      ["the right bucket, another environment", { journalEnvironment: "staging" }, LOCAL_JOURNAL, /the dump was not taken against the journal this drill verifies/],
      ["the drill shell names no bucket", {}, { ...LOCAL_JOURNAL, RESPIN_DELETION_JOURNAL_BUCKET: "" }, /the dump was not taken against the journal this drill verifies/],
    ];
    for (const [label, manifest, env, message] of cases) {
      const result = await run(backup(good(manifest)), env, ["--allow-empty-money"]);
      expect(result.status, label).toBe(1);
      expect(result.stderr, label).toMatch(message);
      expect(result.stdout, label).not.toMatch(/EMPTY-MONEY-ALLOWED/);
    }
  });

  it("PLANTED: a recorded journal that is not the drill's is refused WITHOUT the flag too (gate round 2)", async () => {
    const result = await run(backup(good({ journalBucket: "respin-deletion-journal-prod-770371751912", journalEnvironment: "prod" })));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/was taken against journal .* the dump was not taken against the journal this drill verifies/);
    expect(result.stdout).not.toMatch(/recreating/);
  });

  it("PLANTED: a FUTURE createdAt, a manifest for another dump, and a wrong sha256 are each refused before anything is restored (gate round 2)", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    for (const [label, manifest, message] of [
      ["future createdAt", { createdAt: future }, /is in the future/],
      ["manifest names another dump", { backupFile: "respin-20200101T000000Z.dump.gz.gpg" }, /fails its binding — backupFile/],
      ["sha256 of other bytes", { sha256: "0".repeat(64) }, /does not describe this dump/],
    ] as const) {
      const result = await run(backup(good(manifest)));
      expect(result.status, label).toBe(1);
      expect(result.stderr, label).toMatch(message);
      expect(result.stdout, label).not.toMatch(/recreating/);
    }
  });

  it("in local-drill mode the marker is the FIRST and the LAST stdout line, even when the run then fails", async () => {
    const result = await run(
      backup(good()),
      LOCAL_JOURNAL,
      ["--allow-empty-money"]
    );
    const lines = result.stdout.split(/\r?\n/).filter((l) => l.trim() !== "");
    expect(lines[0]).toBe("EMPTY-MONEY-ALLOWED (local drill)");
    expect(lines[lines.length - 1]).toBe("EMPTY-MONEY-ALLOWED (local drill)");
    expect(result.status).not.toBe(0); // the stub psql refused the connection
  });

  describe("the journal-verify block, run against PLANTED verifiers", () => {
    // The block between the two marker comments is extracted and run with a
    // fake `pnpm` standing in for `pnpm exec tsx scripts/restore-verify.ts`.
    // `journalBound` stands in for MANIFEST_JOURNAL_BOUND, which the manifest
    // check sets before this block: "yes" when the manifest recorded the
    // journal (and the binding matched it), "no" for a legacy manifest.
    function verifyBlock(journalBound: "yes" | "no"): string {
      const source = readFileSync(join(scriptsDir, "restore-drill.sh"), "utf8").replace(/\r\n/g, "\n");
      const start = source.indexOf("# >>> JOURNAL VERIFY BLOCK");
      const end = source.indexOf("# <<< JOURNAL VERIFY BLOCK");
      expect(start, "the verify block's opening marker moved").toBeGreaterThan(0);
      expect(end, "the verify block's closing marker moved").toBeGreaterThan(start);
      const marker = source.split("\n").find((l) => l.startsWith("RESTORE_VERIFY_SUCCESS_MARKER="))!;
      return `set -euo pipefail\n${marker}\nWORKSPACE_DIR=.\nDRILL_DB=respin_restore_drill\nOPERATIONS_JSON=/dev/null\nMANIFEST_JOURNAL_BOUND=${journalBound}\n${source.slice(start, end)}\necho "VERDICT=$JOURNAL_VERDICT"\n`;
    }
    const runBlock = async (fakeVerifier: string, journalBound: "yes" | "no" = "yes") => {
      const stubs = stubBin({ pnpm: fakeVerifier });
      const dir = scratch("respin-vb-");
      const file = join(dir, "block.sh");
      writeFileSync(file, verifyBlock(journalBound));
      const inner = 'export PATH="$(cygpath -u "$1" 2>/dev/null || printf %s "$1"):$PATH"; exec "$BASH" "$2"';
      try {
        const { stdout, stderr } = await execFileAsync("bash", ["-c", inner, "bash", stubs, file], { encoding: "utf8" });
        return { status: 0, stdout, stderr };
      } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return { status: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
      }
    };

    it("PLANTED: a verifier that exits 0 WITHOUT the marker (the argv-guard skip) is NOT verified", async () => {
      const result = await runBlock("exit 0");
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/exited 0 but did not print its success marker/);
      expect(result.stdout).not.toMatch(/VERDICT=verified/);
    });

    it("PLANTED: the marker printed but NOT last, or with a non-zero exit, is NOT verified", async () => {
      const notLast = await runBlock(`echo "${RESTORE_VERIFY_SUCCESS_MARKER}"; echo "CONFLICT x"; exit 0`);
      expect(notLast.status).toBe(1);
      const nonZero = await runBlock(`echo "${RESTORE_VERIFY_SUCCESS_MARKER}"; exit 2`);
      expect(nonZero.status).toBe(1);
      expect(nonZero.stderr).toMatch(/restore-verify exited 2/);
    });

    it("non-vacuity: exit 0 AND the marker as the last line IS verified", async () => {
      const result = await runBlock(`echo "journal_operations=1 unparseable_keys=0"; echo; echo "${RESTORE_VERIFY_SUCCESS_MARKER}"; echo; exit 0`);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/VERDICT=verified$/m);
    });

    it("an EMPTY journal on a LEGACY manifest (no journal recorded) passes but is stamped VACUOUS", async () => {
      const result = await runBlock(`echo "journal_operations=0 unparseable_keys=0 restored_operations=0"; echo "${RESTORE_VERIFY_SUCCESS_MARKER}"; exit 0`, "no");
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/VERDICT=verified VACUOUSLY \(0 journal operations\)/);
    });

    it("an EMPTY journal the manifest is BOUND to is the right journal, empty — verified, no stamp (gate round 2)", async () => {
      const result = await runBlock(`echo "journal_operations=0 unparseable_keys=0 restored_operations=0"; echo "${RESTORE_VERIFY_SUCCESS_MARKER}"; exit 0`, "yes");
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/VERDICT=verified$/m);
    });
  });
});

describe("the documented recovery commands name every input the scripts require (AC1, P9-A2)", () => {
  /** `: "${NAME:?` on a non-comment line — the scripts' own required inputs. */
  const requiredInputs = (script: string): string[] =>
    readFileSync(join(scriptsDir, script), "utf8")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("#"))
      .map((l) => /^: "\$\{([A-Z][A-Z0-9_]*):\?/.exec(l)?.[1])
      .filter((n): n is string => n !== undefined);
  /** What `scripts/restore-verify.ts` reads from the drill's own shell. */
  const VERIFIER_INPUTS = ["RESPIN_DELETION_JOURNAL_BUCKET", "RESPIN_DELETION_JOURNAL_REGION", "RESPIN_DELETION_JOURNAL_ENVIRONMENT"];

  /**
   * Every fenced block's logical commands (backslash continuations joined)
   * that invoke `script`, with the NAME=value pairs assigned inline or by an
   * `export` earlier in the same block.
   */
  function documentedInvocations(doc: string, script: string): { command: string; names: Set<string> }[] {
    const out: { command: string; names: Set<string> }[] = [];
    const blocks = doc.replace(/\r\n/g, "\n").split(/^```[a-z]*\n/m).filter((_, i) => i % 2 === 1);
    for (const block of blocks) {
      const logical = block.split("```")[0]!.replace(/\\\n\s*/g, " ").split("\n");
      const exported = new Set<string>();
      for (const line of logical) {
        const ex = /^export ([A-Z][A-Z0-9_]*)=/.exec(line.trim());
        if (ex) exported.add(ex[1]!);
        if (!line.includes(`scripts/${script}`) || line.trim().startsWith("#")) continue;
        const inline = [...line.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=/g)].map((m) => m[1]!);
        out.push({ command: line.trim(), names: new Set([...exported, ...inline]) });
      }
    }
    return out;
  }
  const problems = (doc: string): string[] => {
    const p: string[] = [];
    const drills = documentedInvocations(doc, "restore-drill.sh");
    const backups = documentedInvocations(doc, "backup.sh");
    if (drills.length === 0) p.push("no restore-drill.sh invocation");
    for (const d of drills) {
      for (const n of [...requiredInputs("restore-drill.sh"), ...VERIFIER_INPUTS]) if (!d.names.has(n)) p.push(`drill command lacks ${n}: ${d.command}`);
      if (!/(^|\s)RESTORE_SERVING_DISABLED=confirmed(\s|$)/.test(d.command) && !d.names.has("RESTORE_SERVING_DISABLED")) p.push(`drill command does not set RESTORE_SERVING_DISABLED=confirmed: ${d.command}`);
      if (/RESTORE_SERVING_DISABLED=(?!confirmed\b)/.test(d.command)) p.push(`drill command sets RESTORE_SERVING_DISABLED to something other than confirmed: ${d.command}`);
      const after = d.command.split("scripts/restore-drill.sh")[1]!.trim().split(/\s+/).filter(Boolean);
      for (const a of after) if (a !== "--allow-empty-money") p.push(`drill command passes "${a}" — the script takes no positional argument`);
    }
    for (const b of backups) for (const n of requiredInputs("backup.sh")) if (!b.names.has(n)) p.push(`backup command lacks ${n}: ${b.command}`);
    return p;
  };
  const repo = resolve(scriptsDir, "..", "..");
  const AWS = join(repo, "docs", "operator", "aws.md");
  const RUNBOOK = join(repo, "RUNBOOK.md");

  it("the scripts' required inputs are read, not assumed (non-vacuity)", () => {
    expect(requiredInputs("restore-drill.sh")).toEqual(["BACKUP_FILE", "BACKUP_PASSPHRASE_FILE", "MAINTENANCE_URL", "RESTORE_SERVING_DISABLED"]);
    expect(requiredInputs("backup.sh")).toEqual(["BACKUP_DIR", "DATABASE_URL", "BACKUP_PASSPHRASE_FILE"]);
  });

  it("docs/operator/aws.md's drill command (Step 6) is complete and runs as written", () => {
    const doc = readFileSync(AWS, "utf8");
    expect(documentedInvocations(doc, "restore-drill.sh")).toHaveLength(1);
    expect(problems(doc)).toEqual([]);
  });

  it("RUNBOOK.md's backup and drill commands (production and local) are complete", () => {
    const doc = readFileSync(RUNBOOK, "utf8");
    expect(documentedInvocations(doc, "restore-drill.sh").length).toBeGreaterThanOrEqual(2);
    expect(documentedInvocations(doc, "backup.sh").length).toBeGreaterThanOrEqual(2);
    expect(problems(doc)).toEqual([]);
  });

  it.each([
    ["aws.md's original `RESTORE_SERVING_DISABLED=1 ./respin/scripts/restore-drill.sh <backup-file>`", "```bash\nRESTORE_SERVING_DISABLED=1 ./respin/scripts/restore-drill.sh <backup-file>\n```\n"],
    ["a drill command missing BACKUP_FILE", "```bash\nRESTORE_SERVING_DISABLED=confirmed \\\nBACKUP_PASSPHRASE_FILE=/p \\\nMAINTENANCE_URL=x \\\nRESPIN_DELETION_JOURNAL_BUCKET=b RESPIN_DELETION_JOURNAL_REGION=r RESPIN_DELETION_JOURNAL_ENVIRONMENT=e \\\n  bash respin/scripts/restore-drill.sh\n```\n"],
    ["a backup command missing BACKUP_PASSPHRASE_FILE", "```bash\nRESTORE_SERVING_DISABLED=confirmed BACKUP_FILE=f BACKUP_PASSPHRASE_FILE=p MAINTENANCE_URL=m RESPIN_DELETION_JOURNAL_BUCKET=b RESPIN_DELETION_JOURNAL_REGION=r RESPIN_DELETION_JOURNAL_ENVIRONMENT=e bash respin/scripts/restore-drill.sh\nDATABASE_URL=x BACKUP_DIR=/d bash respin/scripts/backup.sh\n```\n"],
    ["a drill command without the journal names", "```bash\nRESTORE_SERVING_DISABLED=confirmed BACKUP_FILE=f BACKUP_PASSPHRASE_FILE=p MAINTENANCE_URL=m bash respin/scripts/restore-drill.sh\n```\n"],
  ])("PLANTED: %s is red", (_name, doc) => {
    expect(problems(doc).length).toBeGreaterThan(0);
  });
});
