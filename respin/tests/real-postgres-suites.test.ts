// THE REAL-POSTGRES SUITE LIST EQUALS THE TREE (audit Phase 3, 2026-10-06).
//
// `vitest.config.ts` runs these files in small sequential groups so the live
// suite cannot exhaust the docker server's connections. A real-Postgres file
// missing from the list would run in the unbounded first group again, which is
// the failure the grouping exists to stop — so the list is asserted equal to
// the scan, both ways, and the scan is shown to catch a planted file.
import { describe, expect, it } from "vitest";

import { blankComments } from "./support/app-surface";
import { WORKSPACE_ROOT, sourceFilesUnder, type SourceFile } from "./support/source-files";
import {
  REAL_POSTGRES_EXEMPT,
  REAL_POSTGRES_FILES_PER_GROUP,
  REAL_POSTGRES_SUITES,
} from "./support/real-postgres-suites";
import config from "../vitest.config";
import { SPAWN_BOUND_SUITES } from "./support/spawn-bound-suites";

const IS_TEST = /\.test\.tsx?$/;
const OPENS_REAL_POSTGRES = /\bcreateDockerTestDb\s*\(/;

function scan(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => IS_TEST.test(f.file) && OPENS_REAL_POSTGRES.test(blankComments(f.text)))
    .map((f) => f.file)
    .filter((f) => !(f in REAL_POSTGRES_EXEMPT))
    .sort();
}

describe("the real-Postgres suite population", () => {
  const files = sourceFilesUnder();

  it("the written list equals every test file that calls createDockerTestDb(, both ways", () => {
    expect(WORKSPACE_ROOT.length).toBeGreaterThan(0);
    expect(scan(files)).toEqual([...REAL_POSTGRES_SUITES].sort());
  });

  it("every exemption names a real file that really calls the harness", () => {
    for (const exempt of Object.keys(REAL_POSTGRES_EXEMPT)) {
      const file = files.find((f) => f.file === exempt);
      expect(file, exempt).toBeDefined();
      expect(OPENS_REAL_POSTGRES.test(blankComments(file!.text)), exempt).toBe(true);
    }
  });

  it("PLANTED: a new real-Postgres file is red until listed; a call inside a comment is not", () => {
    const planted: SourceFile = {
      file: "packages/db/tests/planted.docker.test.ts",
      text: 'const h = await createDockerTestDb(URL, "respin_test_planted");',
    };
    expect(scan([...files, planted])).not.toEqual([...REAL_POSTGRES_SUITES].sort());
    expect(scan([{ ...planted, text: "// createDockerTestDb(URL)" }])).toEqual([]);
  });

  it("the config runs every listed file in a later group of at most REAL_POSTGRES_FILES_PER_GROUP, and excludes them from the first", () => {
    type Project = { test: { name: string; include?: string[]; exclude?: string[]; sequence?: { groupOrder?: number } } };
    const projects = (config as { test: { projects: Project[] } }).test.projects;
    const first = projects.find((p) => p.test.sequence?.groupOrder === 0)!;
    for (const file of REAL_POSTGRES_SUITES) expect(first.test.exclude, file).toContain(file);
    const later = projects.filter((p) => p.test.name.startsWith("postgres-"));
    // Every later group is either a real-Postgres group or the spawn-bound one.
    expect(
      projects.filter((p) => (p.test.sequence?.groupOrder ?? 0) > 0).map((p) => p.test.name).filter((name) => !name.startsWith("postgres-"))
    ).toEqual(["spawn-bound"]);
    expect(later.flatMap((p) => p.test.include ?? []).sort()).toEqual([...REAL_POSTGRES_SUITES].sort());
    for (const p of later) {
      expect((p.test.include ?? []).length).toBeLessThanOrEqual(REAL_POSTGRES_FILES_PER_GROUP);
    }
    // Distinct groups, so they run one after another.
    expect(new Set(later.map((p) => p.test.sequence?.groupOrder)).size).toBe(later.length);
    // The spawn-bound files run ALONE: out of group 0, in a group of their
    // own whose order no other group shares (tests/support/spawn-bound-suites.ts).
    const spawnBound = projects.find((p) => p.test.name === "spawn-bound")!;
    for (const file of SPAWN_BOUND_SUITES) expect(first.test.exclude, file).toContain(file);
    expect(spawnBound.test.include).toEqual([...SPAWN_BOUND_SUITES]);
    expect(projects.filter((p) => p.test.sequence?.groupOrder === spawnBound.test.sequence?.groupOrder)).toHaveLength(1);
  });
});
