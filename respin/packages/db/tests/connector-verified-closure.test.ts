// Phase 10a plan C1 (R-115): ONLY the future connector seam may mint
// `connector_verified`. Today there is no such seam, so the production tree
// must contain no writer that assigns the value — a source scan over every
// package's `src/**` and the app, with an ALLOWLIST of the files that may
// spell the literal for a non-write reason (the schema, the vocabulary, the
// comparison allowlist, copy) and a planted violation proving the scan reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Files that may mention the literal WITHOUT writing it. A LIST, never a grep (rule 7). */
const MAY_MENTION = new Set([
  "packages/db/src/results-schema.ts",          // the enum and its CHECK
  "packages/db/src/with-workspace.ts",           // recordResult's derivation comment and the NULL connector columns
  "packages/db/src/promotion-ops.ts",            // the eligibility reading
  "packages/db/src/promotion-audit.ts",          // the audit's predicate
  "packages/db/src/lifecycle-column-census.ts",
  "packages/db/src/creator-data-registry.ts",
  "packages/brain/src/vocabulary.ts",
  "packages/brain/src/comparison.ts",            // the ONE numerical allowlist
  "packages/brain/src/proposal.ts",              // the refusal
  "app/(product)/results/copy.ts",               // the evidence-state badge copy
  "app/(product)/results/log-panel.tsx",         // says the state is unreachable from a browser
  "app/(product)/results/results-view.tsx",      // the verification-unavailable notice
  "app/(product)/brain/brain-view.tsx",          // counts on screen
  "packages/db/src/export-brain.ts",
  "packages/db/src/results-ops.ts",
]);

/** A WRITE: the literal as an assigned value, not a comparison or a type. */
const WRITES = /(?:evidenceState|evidence_state)\s*[:=]\s*["']connector_verified["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "tests" || entry === "migrations") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no production writer mints connector_verified", () => {
  const files = [
    ...walk(join(RESPIN, "packages")).filter((f) => /[\\/]src[\\/]/.test(f)),
    ...walk(join(RESPIN, "app")),
    ...walk(join(RESPIN, "lib")),
    ...walk(join(RESPIN, "worker")),
  ];

  it("scans a real population", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("every file that assigns the literal is refused; every file that mentions it is on the list", () => {
    const writes: string[] = [];
    const unlisted: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("connector_verified")) continue;
      const rel = relative(RESPIN, file).replace(/\\/g, "/");
      if (WRITES.test(source)) writes.push(rel);
      if (!MAY_MENTION.has(rel)) unlisted.push(rel);
    }
    expect(writes, "a production file ASSIGNS connector_verified — only the future connector seam may").toEqual([]);
    expect(unlisted, "a production file mentions connector_verified and is not on MAY_MENTION — list it with a reason").toEqual([]);
  });

  it("NON-VACUITY: the write predicate catches the shapes a writer would take", () => {
    for (const planted of [
      'evidenceState: "connector_verified"',
      "evidence_state = 'connector_verified'",
      'evidenceState:"connector_verified"',
    ]) expect(WRITES.test(planted), planted).toBe(true);
    for (const safe of [
      'result.evidenceState === "connector_verified"',
      'evidenceState !== "connector_verified"',
      '"connector_verified" as const',
    ]) expect(WRITES.test(safe), safe).toBe(false);
  });
});
