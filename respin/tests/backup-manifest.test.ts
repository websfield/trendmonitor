// R-155, gate round 2 — every manifest field a reader reads is BOUND to a value
// the manifest does not control, or it is unreadable (CLAUDE.md 2026-07-30: fix
// the class, not the field). `scripts/backup-manifest.mjs` is the one reader;
// this file plants a violation of each binding against it, and asserts that the
// two shell scripts read no manifest field except through it — so a fourth
// trusted field cannot arrive in a script the way the first three did.
import { createHash } from "node:crypto";
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_MAX_RETENTION_DAYS } from "@respin/db";
import { scratchDir } from "./support/scratch-dir";

const scriptsDir = resolve(__dirname, "../scripts");
// The module is plain JavaScript (it runs under bare node on a backup host), so
// it is loaded by URL and typed here.
const manifestModule = (await import(pathToFileURL(join(scriptsDir, "backup-manifest.mjs")).href)) as {
  CLOCK_SKEW_SECONDS: number;
  STAMP_TOLERANCE_SECONDS: number;
  FIELD_BINDINGS: Readonly<Record<string, string>>;
  pruneVerdict(manifestFile: string, dumpPath: string, nowMs: number, maxDays: number): string;
  drillVerdict(input: {
    manifestFile: string;
    dumpPath: string;
    nowMs: number;
    maxDays: number;
    allowRequested: boolean;
    endpoint: string;
    bucket: string;
    environment: string;
    localEndpoint: string;
  }): { ok: true; lines: string[] } | { ok: false; message: string };
};
const { pruneVerdict, drillVerdict, FIELD_BINDINGS, CLOCK_SKEW_SECONDS, STAMP_TOLERANCE_SECONDS } = manifestModule;

const DAY = 86_400_000;
const NOW = Date.now();
const LOCAL = "http://127.0.0.1:9000";
const stampOf = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/**
 * A dump and its manifest, written the way backup.sh writes them: the name
 * carries the creation stamp, `createdAt` is that instant, `sha256` is the
 * bytes' hash. `edit` then changes the manifest the way an operator (or a
 * wrong clock) could.
 */
function backupPair(opts: { createdMs?: number; name?: string; edit?: (m: Record<string, unknown>) => void; mtimeMs?: number } = {}) {
  const dir = scratchDir("respin-manifest-");
  const createdMs = Math.floor((opts.createdMs ?? NOW - DAY) / 1000) * 1000;
  const name = opts.name ?? `respin-${stampOf(createdMs)}.dump.gz.gpg`;
  const dump = join(dir, name);
  const bytes = `dump bytes ${createdMs}`;
  writeFileSync(dump, bytes);
  if (opts.mtimeMs !== undefined) utimesSync(dump, new Date(opts.mtimeMs), new Date(opts.mtimeMs));
  const manifest: Record<string, unknown> = {
    backupFile: name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    createdAt: new Date(createdMs).toISOString(),
    expiresAt: new Date(createdMs + 21 * DAY).toISOString(),
    sourceHost: "127.0.0.1",
    sourcePort: 5435,
    sourceDatabase: "respin_drill_source",
    journalBucket: "respin-deletion-journal-local",
    journalEnvironment: "local",
    activeTombstones: [],
  };
  opts.edit?.(manifest);
  const manifestFile = join(dir, name.replace(/\.dump\.gz\.gpg$/, ".manifest.json"));
  writeFileSync(manifestFile, JSON.stringify(manifest));
  return { dump, manifestFile };
}

const drill = (p: { dump: string; manifestFile: string }, over: Partial<Parameters<typeof drillVerdict>[0]> = {}) =>
  drillVerdict({
    manifestFile: p.manifestFile,
    dumpPath: p.dump,
    nowMs: NOW,
    maxDays: BACKUP_MAX_RETENTION_DAYS,
    allowRequested: false,
    endpoint: LOCAL,
    bucket: "respin-deletion-journal-local",
    environment: "local",
    localEndpoint: LOCAL,
    ...over,
  });
const prune = (p: { dump: string; manifestFile: string }, nowMs = NOW) => pruneVerdict(p.manifestFile, p.dump, nowMs, BACKUP_MAX_RETENTION_DAYS);
const refusal = (v: ReturnType<typeof drillVerdict>) => (v.ok ? "(accepted)" : v.message);

describe("the field population is a list, and only the module reads it", () => {
  it("FIELD_BINDINGS names exactly the fields the module reads (`m.<field>`)", () => {
    const source = readFileSync(join(scriptsDir, "backup-manifest.mjs"), "utf8");
    // Identifier characters include digits after the first (`m.sha256`).
    const read = [...new Set([...source.matchAll(/\bm\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((x) => x[1]!))].sort();
    expect(read).toEqual(Object.keys(FIELD_BINDINGS).sort());
  });

  it("backup.sh and restore-drill.sh read NO manifest field themselves — every read goes through the module", () => {
    for (const script of ["backup.sh", "restore-drill.sh"]) {
      const code = readFileSync(join(scriptsDir, script), "utf8")
        .split(/\r?\n/)
        .filter((l) => !l.trimStart().startsWith("#"))
        .join("\n");
      expect(code.match(/\bm\.[a-zA-Z][a-zA-Z0-9]*/g) ?? [], script).toEqual([]);
      expect(code, script).toContain("backup-manifest.mjs");
    }
  });

  it("the tolerances are the stated ones", () => {
    expect(CLOCK_SKEW_SECONDS).toBe(300);
    expect(STAMP_TOLERANCE_SECONDS).toBe(3600);
  });
});

describe("non-vacuity: a manifest written the way backup.sh writes it passes every binding", () => {
  it("prune reads it (not expired) and the drill accepts it, journal bound", () => {
    const p = backupPair();
    expect(prune(p)).toBe("NO");
    const v = drill(p);
    expect(v.ok, refusal(v)).toBe(true);
    if (v.ok) expect(v.lines).toContain("JOURNAL_BOUND=yes");
  });
});

describe("PLANTED: each binding refuses its own violation", () => {
  it("backupFile — a manifest copied beside another dump", () => {
    const p = backupPair({ edit: (m) => (m.backupFile = "respin-20200101T000000Z.dump.gz.gpg") });
    expect(prune(p)).toMatch(/^UNREADABLE:backupFile/);
    expect(refusal(drill(p))).toMatch(/fails its binding — backupFile/);
  });

  it("createdAt — in the FUTURE (an edit or a wrong clock)", () => {
    const p = backupPair({ edit: (m) => (m.createdAt = new Date(NOW + 2 * DAY).toISOString()) });
    expect(prune(p)).toMatch(/^UNREADABLE:createdAt .* is in the future/);
    expect(refusal(drill(p))).toMatch(/createdAt .* is in the future/);
  });

  it("createdAt — moved away from the file-name stamp (beyond the hour)", () => {
    const p = backupPair({ edit: (m) => (m.createdAt = new Date(Date.parse(String(m.createdAt)) + 2 * 3_600_000).toISOString()) });
    expect(prune(p)).toMatch(/^UNREADABLE:createdAt .* is not the file-name stamp/);
    expect(refusal(drill(p))).toMatch(/is not the file-name stamp/);
  });

  it("createdAt — a name with no stamp binds to the dump's mtime instead", () => {
    const created = NOW - DAY;
    const matching = backupPair({ createdMs: created, name: "respin-renamed.dump.gz.gpg", mtimeMs: created });
    expect(prune(matching)).toBe("NO");
    const moved = backupPair({ createdMs: created, name: "respin-renamed.dump.gz.gpg", mtimeMs: created - 5 * DAY });
    expect(prune(moved)).toMatch(/^UNREADABLE:createdAt .* is not the dump's mtime/);
  });

  it("the file-name stamp itself in the future", () => {
    const future = NOW + 3 * DAY;
    const p = backupPair({ createdMs: future, name: `respin-${stampOf(future)}.dump.gz.gpg` });
    expect(prune(p, NOW)).toMatch(/^UNREADABLE:/);
    expect(drill(p).ok).toBe(false);
  });

  it("expiresAt — pushed far out is capped at createdAt + 21 days", () => {
    const p = backupPair({ createdMs: NOW - 30 * DAY, edit: (m) => (m.expiresAt = "2099-01-01T00:00:00Z") });
    expect(prune(p)).toBe("YES");
    expect(refusal(drill(p))).toMatch(/EXPIRED at .* maximum retention 21 days/);
    const unparseable = backupPair({ edit: (m) => (m.expiresAt = "soon") });
    expect(prune(unparseable)).toMatch(/^UNREADABLE:expiresAt/);
  });

  it("sha256 — a manifest whose hash is not these bytes (drill)", () => {
    const p = backupPair({ edit: (m) => (m.sha256 = "0".repeat(64)) });
    expect(refusal(drill(p))).toMatch(/does not describe this dump/);
  });

  it("activeTombstones — null refuses; its content decides nothing", () => {
    expect(refusal(drill(backupPair({ edit: (m) => (m.activeTombstones = null) })))).toMatch(/activeTombstones=null/);
    const edited = drill(backupPair({ edit: (m) => (m.activeTombstones = [{ operationId: "x" }, { operationId: "y" }]) }));
    expect(edited.ok, refusal(edited)).toBe(true);
  });

  it("journalBucket/journalEnvironment — a mismatch is refused WITHOUT --allow-empty-money", () => {
    const p = backupPair({ edit: (m) => ((m.journalBucket = "respin-deletion-journal-prod-770371751912"), (m.journalEnvironment = "prod")) });
    const v = drill(p, { allowRequested: false });
    expect(refusal(v)).toMatch(/was taken against journal .* but this drill verifies .* proves nothing/);
    expect(refusal(drill(backupPair(), { environment: "staging" }))).toMatch(/not taken against the journal this drill verifies/);
  });

  it("journal — exactly one field recorded is unreadable; neither is a legacy manifest", () => {
    expect(refusal(drill(backupPair({ edit: (m) => (m.journalEnvironment = null) })))).toMatch(/records only one of journalBucket\/journalEnvironment/);
    const legacy = drill(backupPair({ edit: (m) => ((m.journalBucket = null), (m.journalEnvironment = null)) }));
    expect(legacy.ok, refusal(legacy)).toBe(true);
    if (legacy.ok) expect(legacy.lines).toContain("JOURNAL_BOUND=no");
  });

  it("source* — a mistake-guard: a non-loopback host refuses --allow-empty-money and nothing else", () => {
    const p = backupPair({ edit: (m) => (m.sourceHost = "db.internal.example") });
    expect(drill(p).ok).toBe(true);
    expect(refusal(drill(p, { allowRequested: true }))).toMatch(/source host "db.internal.example", not a loopback database/);
    expect(refusal(drill(backupPair({ edit: (m) => ((m.journalBucket = null), (m.journalEnvironment = null)) }), { allowRequested: true, bucket: "", environment: "" }))).toMatch(/records no journal/);
  });
});
