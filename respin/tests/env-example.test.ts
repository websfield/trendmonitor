// P9-A4 (register 2026-10-05 item 14; R-155) — `env.example` is the env
// authority, and this test is what makes that a property rather than a claim.
//
// THE READ SET IS DERIVED, AND ITS READERS ARE A LIST (non-negotiable 7). The
// population is every production source file (`PRODUCTION_ROOTS` through the
// shared walker, test files excluded) plus the operator shell scripts, read in
// the FOUR shapes this repository reads a variable in — each listed, each
// planted below:
//
//   1. a member read on an env object: `process.env.X`, `env.X`, `env?.X`;
//   2. an indexed read with a literal: `process.env["X"]`, `env["X"]`;
//   3. a whole quoted ALL_CAPS literal with an underscore — the indirect
//      readers name their variable once as a constant
//      (`ACTIVATION_EXCLUDED_USER_IDS_ENV = "ACTIVATION_EXCLUDED_USER_IDS"`,
//      `envInteger(env, "RESPIN_WORKER_CONCURRENCY", 4)`,
//      `DELETION_JOURNAL_ENV.bucket`), so the literal is where the name lives;
//      a non-variable literal of that shape goes on the exemption list with
//      its reason;
//   4. a shell expansion with a modifier in `scripts/*.sh`: `${X:?`, `${X:-`.
//
// A reader in a shape outside these four is not seen. That is this test's
// limit, stated here rather than implied; the measured set it found on
// 2026-10-05 is quoted in R-155.
//
// TWO-WAY. Every derived name is in env.example (a `NAME=` line, commented or
// not) or exempt with a written reason; every env.example name is read by
// something or exempt as library-read; every exemption is still true.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ROOTS, sourceFilesUnder, type SourceFile } from "./support/source-files";

const WORKSPACE = resolve(__dirname, "..");
const REPO = resolve(WORKSPACE, "..");

/**
 * Root-level files the walker returns that are TEST HARNESS configuration, not
 * production code. Their variables (`TEST_DATABASE_URL`, `JOURNEYS_*`) are the
 * harness's inputs and are documented with the harness (e2e/journeys/README.md,
 * CLAUDE.md Commands), not in the app's env template.
 */
const NOT_PRODUCTION_FILES: ReadonlyMap<string, string> = new Map([
  ["playwright.config.ts", "the journeys/visual Playwright harness"],
  ["playwright.l2.config.ts", "the L2 Playwright harness"],
  ["playwright.visual.config.ts", "the visual-matrix Playwright harness"],
  ["vitest.config.ts", "the unit-test runner"],
]);

type ExemptionKind =
  | "runtime-set" // set by Node/Next at runtime, never by an operator
  | "script-internal" // a temporary a script sets for its own child process
  | "deliberately-ignored" // a library would read it; this code neutralises it
  | "library-read" // read by a library's default chain; documented, not read by our code
  | "not-an-env-var"; // a literal of the env-name shape that is something else

type Exemption = Readonly<{ name: string; kind: ExemptionKind; reason: string; witness: string }>;

/** The written exemption list. `witness` is a repo-relative file that must contain the name. */
export const EXEMPTIONS: readonly Exemption[] = [
  { name: "NODE_ENV", kind: "runtime-set", reason: "Set by Next.js and Node (`next build`/`next start` set production); never an operator input.", witness: "respin/next.config.ts" },
  { name: "NEXT_RUNTIME", kind: "runtime-set", reason: "Set by Next.js to `nodejs` or `edge` for `instrumentation.ts`'s runtime branch.", witness: "respin/instrumentation.ts" },
  { name: "RESPIN_DB_URI", kind: "script-internal", reason: "backup.sh hands DATABASE_URL to its `node -e` helpers through the environment so the credential never reaches argv.", witness: "respin/scripts/backup.sh" },
  { name: "RESPIN_MAINT_URI", kind: "script-internal", reason: "restore-drill.sh hands MAINTENANCE_URL to its `node -e` helpers through the environment, never argv.", witness: "respin/scripts/restore-drill.sh" },
  { name: "RESPIN_DRILL_DB", kind: "script-internal", reason: "restore-drill.sh passes the guarded drill database name to the `node -e` that builds the target URL.", witness: "respin/scripts/restore-drill.sh" },
  { name: "JOURNAL_COUNTS", kind: "script-internal", reason: "restore-drill.sh's own variable holding the verifier's count line for the PASS summary.", witness: "respin/scripts/restore-drill.sh" },
  { name: "JOURNAL_EMPTY_LINE", kind: "script-internal", reason: "restore-drill.sh's own variable: the JOURNAL-EMPTY stamp, expanded with `:+` so the PASS summary carries the line only when the journal was empty.", witness: "respin/scripts/restore-drill.sh" },
  { name: "ANTHROPIC_BASE_URL", kind: "deliberately-ignored", reason: "The Anthropic SDK reads it when baseURL is omitted, so the adapter passes its pinned origin explicitly; pinned by packages/llm/tests/adapter.test.ts.", witness: "respin/packages/llm/src/anthropic.ts" },
  { name: "AWS_ACCESS_KEY_ID", kind: "library-read", reason: "Read by the AWS SDK's default credential chain; set only for the local drill's MinIO (production resolves the instance role).", witness: "RUNBOOK.md" },
  { name: "AWS_SECRET_ACCESS_KEY", kind: "library-read", reason: "As AWS_ACCESS_KEY_ID.", witness: "RUNBOOK.md" },
  { name: "SERVICE_UNAVAILABLE", kind: "not-an-env-var", reason: "A Better Auth APIError status code passed as a string literal.", witness: "respin/packages/auth/src/create-auth.ts" },
];

/** Comment lines blanked, so a sentence ABOUT a variable is not a read of it. */
const codeOf = (text: string): string =>
  text
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*|\/\*|#)/.test(l) ? "" : l))
    .join("\n");

/** The four shapes, each a separate pattern so a plant can name the one it tests. */
export const READ_SHAPES = {
  member: /\b\w*[eE]nv\??\.([A-Z][A-Z0-9_]*)\b/g,
  indexed: /\b\w*[eE]nv\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
  literal: /["']([A-Z][A-Z0-9]*_[A-Z0-9_]+)["']/g,
  shell: /\$\{([A-Z][A-Z0-9_]*)[:?-]/g,
} as const;

/** name → the files that read it. */
export function deriveReadSet(sources: readonly SourceFile[], shellScripts: readonly SourceFile[]): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (name: string, file: string) => {
    if (!found.has(name)) found.set(name, new Set());
    found.get(name)!.add(file);
  };
  for (const f of sources) {
    const code = codeOf(f.text);
    for (const shape of [READ_SHAPES.member, READ_SHAPES.indexed, READ_SHAPES.literal]) {
      for (const m of code.matchAll(shape)) add(m[1]!, f.file);
    }
  }
  for (const f of shellScripts) {
    const code = codeOf(f.text);
    for (const m of code.matchAll(READ_SHAPES.shell)) add(m[1]!, f.file);
    for (const m of code.matchAll(READ_SHAPES.member)) add(m[1]!, f.file);
  }
  return found;
}

/** Every `NAME=` line in env.example, commented or not. */
export function documentedNames(envExample: string): Set<string> {
  const names = new Set<string>();
  for (const line of envExample.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

export function envAuthorityProblems(
  readSet: ReadonlyMap<string, ReadonlySet<string>>,
  documented: ReadonlySet<string>,
  exemptions: readonly Exemption[],
  readWitness: (path: string) => string
): string[] {
  const p: string[] = [];
  const exempt = new Map(exemptions.map((e) => [e.name, e]));
  for (const [name, files] of readSet) {
    if (documented.has(name) || exempt.has(name)) continue;
    p.push(`${name} is read by ${[...files].join(", ")} but is not in env.example and not exempt — document it in env.example, or exempt it with a reason`);
  }
  for (const name of documented) {
    if (readSet.has(name)) continue;
    const e = exempt.get(name);
    if (e && (e.kind === "library-read" || e.kind === "deliberately-ignored")) continue;
    p.push(`env.example documents ${name} but nothing in the read set reads it — a stale entry, or a reader in a shape this test cannot see`);
  }
  for (const e of exemptions) {
    if (!e.reason.trim()) p.push(`exemption ${e.name} has no reason`);
    let witness = "";
    try {
      witness = readWitness(e.witness);
    } catch {
      p.push(`exemption ${e.name}'s witness ${e.witness} cannot be read`);
    }
    if (witness && !witness.includes(e.name)) p.push(`exemption ${e.name}'s witness ${e.witness} does not mention it`);
    const mustBeRead = e.kind === "runtime-set" || e.kind === "script-internal" || e.kind === "not-an-env-var";
    if (mustBeRead && !readSet.has(e.name)) p.push(`exemption ${e.name} (${e.kind}) is stale: nothing reads it any more`);
    if (mustBeRead && documented.has(e.name)) p.push(`${e.name} is both documented in env.example and exempt as ${e.kind}`);
  }
  return p;
}

function productionSources(): SourceFile[] {
  return sourceFilesUnder(PRODUCTION_ROOTS).filter(
    (f) => !/(^|\/)tests\//.test(f.file) && !/\.test\.tsx?$/.test(f.file) && !NOT_PRODUCTION_FILES.has(f.file)
  );
}

function shellScriptSources(): SourceFile[] {
  const dir = join(WORKSPACE, "scripts");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sh"))
    .sort()
    .map((n) => ({ file: `scripts/${n}`, text: readFileSync(join(dir, n), "utf8").replace(/\r\n/g, "\n") }));
}

const readRepoFile = (path: string): string => readFileSync(join(REPO, path), "utf8");
const envExampleText = (): string => readFileSync(join(WORKSPACE, "env.example"), "utf8");

describe("env.example is the env authority (P9-A4, R-155)", () => {
  const sources = productionSources();
  const shells = shellScriptSources();
  const readSet = deriveReadSet(sources, shells);

  it("the population is the real one (non-vacuity)", () => {
    const files = sources.map((f) => f.file);
    for (const expected of ["worker/env.ts", "worker/main.ts", "packages/db/src/seed.ts", "instrumentation-node.ts", "middleware.ts", "lib/telemetry.ts"]) {
      expect(files, expected).toContain(expected);
    }
    expect(shells.map((s) => s.file)).toEqual(["scripts/backup.sh", "scripts/restore-drill.sh"]);
    for (const name of ["DATABASE_URL", "RESPIN_SEED_FORCE", "RESPIN_WORKER_CONCURRENCY", "ACTIVATION_EXCLUDED_USER_IDS", "BACKUP_FILE", "RESPIN_DELETION_JOURNAL_BUCKET"]) {
      expect(readSet.has(name), name).toBe(true);
    }
    // the root-level harness configs are excluded by name, and each one exists
    for (const name of NOT_PRODUCTION_FILES.keys()) expect(sourceFilesUnder([]).map((f) => f.file)).toContain(name);
  });

  it("every variable read is documented or exempt, every documented one is read, every exemption holds", () => {
    expect(envAuthorityProblems(readSet, documentedNames(envExampleText()), EXEMPTIONS, readRepoFile)).toEqual([]);
  });

  it("each exemption names its kind and carries a reason (listed for the card)", () => {
    for (const e of EXEMPTIONS) {
      expect(e.reason.length, e.name).toBeGreaterThan(10);
      expect(["runtime-set", "script-internal", "deliberately-ignored", "library-read", "not-an-env-var"]).toContain(e.kind);
    }
  });

  describe("planted variants each FAIL (lesson 2026-08-26)", () => {
    const withPlant = (file: string, text: string) => deriveReadSet([...sources, { file, text }], shells);
    const run = (rs: Map<string, Set<string>>, doc = envExampleText(), ex = EXEMPTIONS) =>
      envAuthorityProblems(rs, documentedNames(doc), ex, readRepoFile);

    it.each([
      ["process.env.RESPIN_PLANTED in worker/", "worker/planted.ts", "export const x = process.env.RESPIN_PLANTED;"],
      ["an env-object member read", "packages/db/src/planted.ts", "export const f = (env: Record<string, string>) => env.RESPIN_PLANTED;"],
      ["an indexed read", "app/planted.ts", 'export const x = process.env["RESPIN_PLANTED"];'],
      ["a constant-named indirect reader", "packages/credits/src/planted.ts", 'export const PLANTED_ENV = "RESPIN_PLANTED";'],
    ])("PLANTED: %s is red until listed, green once env.example documents it", (_name, file, text) => {
      const rs = withPlant(file, text);
      expect(run(rs).join(" | ")).toMatch(/RESPIN_PLANTED is read by .* not in env\.example/);
      expect(run(rs, `${envExampleText()}\nRESPIN_PLANTED=\n`)).toEqual([]);
    });

    it("PLANTED: a new required input in a shell script is red", () => {
      const rs = deriveReadSet(sources, [...shells, { file: "scripts/planted.sh", text: ': "${RESPIN_PLANTED_SH:?required}"\n' }]);
      expect(run(rs).join(" | ")).toMatch(/RESPIN_PLANTED_SH is read by scripts\/planted\.sh/);
    });

    it("a comment that MENTIONS a variable is not a read", () => {
      const rs = withPlant("worker/planted.ts", "// process.env.RESPIN_PLANTED is mentioned, not read\n");
      expect(rs.has("RESPIN_PLANTED")).toBe(false);
    });

    it("PLANTED: a documented name nothing reads is red (stale)", () => {
      expect(run(readSet, `${envExampleText()}\nRESPIN_NOBODY_READS_THIS=\n`).join(" | ")).toMatch(/documents RESPIN_NOBODY_READS_THIS but nothing/);
    });

    it("PLANTED: a stale exemption, a reason-less exemption and a witness that does not mention its name are red", () => {
      const stale = [...EXEMPTIONS, { name: "RESPIN_GONE", kind: "script-internal" as const, reason: "a temporary that was removed", witness: "respin/scripts/backup.sh" }];
      expect(run(readSet, envExampleText(), stale).join(" | ")).toMatch(/RESPIN_GONE \(script-internal\) is stale/);
      const noReason = EXEMPTIONS.map((e) => (e.name === "NODE_ENV" ? { ...e, reason: " " } : e));
      expect(run(readSet, envExampleText(), noReason).join(" | ")).toMatch(/exemption NODE_ENV has no reason/);
      const wrongWitness = EXEMPTIONS.map((e) => (e.name === "NEXT_RUNTIME" ? { ...e, witness: "respin/scripts/backup.sh" } : e));
      expect(run(readSet, envExampleText(), wrongWitness).join(" | ")).toMatch(/NEXT_RUNTIME's witness .* does not mention it/);
    });

    it("PLANTED: deleting a documented operator input from env.example is red", () => {
      const doc = envExampleText().replace(/^ACTIVATION_EXCLUDED_USER_IDS=\s*$/m, "");
      expect(run(readSet, doc).join(" | ")).toMatch(/ACTIVATION_EXCLUDED_USER_IDS is read by .* not in env\.example/);
    });
  });
});
