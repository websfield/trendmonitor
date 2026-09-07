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
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  // The script exits during argument validation long before this loop, so the
  // loop is extracted and run over dated fixtures instead. That is a real
  // execution of the shipped lines, not a restatement of them.
  const PRUNE_START = "# PRUNE ON THE RECORDED EXPIRY, NOT ON mtime.";

  function pruneBlock(): string {
    const source = readFileSync(join(scriptsDir, "backup.sh"), "utf8");
    const start = source.indexOf(PRUNE_START);
    expect(start, "the prune block moved; this test is pinned to it by name").toBeGreaterThan(0);
    return source.slice(start);
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

  function writeBackup(
    dir: string,
    stamp: string,
    options: { expiresAt?: string | null; ageDays?: number }
  ): void {
    const base = join(dir, `respin-${stamp}`);
    writeFileSync(`${base}.dump.gz.gpg`, "x".repeat(5000));
    writeFileSync(`${base}.sha256`, `deadbeef  respin-${stamp}.dump.gz.gpg\n`);
    if (options.expiresAt !== null && options.expiresAt !== undefined) {
      writeFileSync(
        `${base}.manifest.json`,
        JSON.stringify({ backupFile: `respin-${stamp}.dump.gz.gpg`, expiresAt: options.expiresAt })
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
  }

  const runPrune = async (dir: string, retentionDays = 21) => {
    const script = [
      "set -euo pipefail",
      `BACKUP_DIR=${JSON.stringify(dir)}`,
      `RETENTION_DAYS=${retentionDays}`,
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
    writeBackup(dir, "fresh", { expiresAt: "2099-01-01T00:00:00Z", ageDays: 40 });
    const result = await runPrune(dir);
    expect(result.files).toContain("respin-fresh.dump.gz.gpg");
    expect(result.files).toContain("respin-fresh.manifest.json");
    rmSync(dir, { recursive: true, force: true });
  });

  it("NEVER deletes the manifest or checksum of a live dump (round-2 defect)", async () => {
    // The "orphan" sweep tested only mtime. On a 40-day-old but unexpired
    // backup it stripped both sidecars, destroying the manifest authority and
    // the integrity checksum while the dump itself survived.
    const dir = mkdtempPrune();
    writeBackup(dir, "old-but-valid", { expiresAt: "2099-01-01T00:00:00Z", ageDays: 40 });
    const result = await runPrune(dir);
    expect(result.files.sort()).toEqual([
      "respin-old-but-valid.dump.gz.gpg",
      "respin-old-but-valid.manifest.json",
      "respin-old-but-valid.sha256",
    ]);
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
