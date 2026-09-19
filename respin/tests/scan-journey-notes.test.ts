// creator-ready Phase 2, T4/AC5 — the CI judgement over both uploaded trees,
// proven against PLANTED violations (lesson 2026-08-26): a BLOCKING note, a
// missing main-chapter screenshot, a `_handoff/` file in either tree and the
// bootstrap-only admin screenshot each fail; a clean tree and a page-console
// line that merely contains the word BLOCKING each pass. The CLI's exit code is
// checked through a real process once, so `main()`'s return value is proven to
// reach `process.exitCode`.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ARTIFACTS_ROOT, BLOCKING_NOTE_PREFIX, SKIPPED_NOTE_PREFIX } from "../e2e/support/artifacts";
import { MAIN_CHAPTERS, PERSONAS } from "../e2e/support/main-chapters";
import { main, scanJourneyTrees } from "../scripts/scan-journey-notes";
import { uploadPathLines, uploadPopulation, workflowText } from "./journeys-upload-population";

const execFileAsync = promisify(execFile);
const respinRoot = resolve(__dirname, "..");

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A clean pair of trees: every persona ran, took its main chapter, wrote notes. */
function cleanTrees(): { artifacts: string; report: string } {
  const root = mkdtempSync(join(tmpdir(), "journey-scan-"));
  tmpDirs.push(root);
  const artifacts = join(root, "artifacts");
  const report = join(root, "playwright-report");
  for (const persona of PERSONAS) {
    mkdirSync(join(artifacts, persona, "screenshots"), { recursive: true });
    writeFileSync(join(artifacts, persona, "screenshots", `01-post-signup-onboarding.png`), "png");
    writeFileSync(join(artifacts, persona, "screenshots", `07-${MAIN_CHAPTERS[persona]}.png`), "png");
    writeFileSync(
      join(artifacts, persona, "console.log"),
      [
        `# ${persona} journey log`,
        `[note] ${SKIPPED_NOTE_PREFIX} paid tiers not enabled - checkout`,
        `[console:log] http://localhost:8000/studio :: BLOCKING is just a word the page printed`,
        `[pageerror] http://localhost:8000/ :: Error: BLOCKING_NOTE_PREFIX looked up`,
        `[screenshot] 07-${MAIN_CHAPTERS[persona]}.png @ http://localhost:8000/x`,
        "",
      ].join("\n")
    );
    mkdirSync(join(report, persona, "data"), { recursive: true });
    writeFileSync(join(report, persona, "index.html"), "<html></html>");
  }
  mkdirSync(join(report, "bootstrap"), { recursive: true });
  writeFileSync(join(report, "bootstrap", "index.html"), "<html></html>");
  return { artifacts, report };
}

describe("scanJourneyTrees", () => {
  it("a clean pair of trees has no problems; a console line containing BLOCKING is not a note", () => {
    const { artifacts, report } = cleanTrees();
    expect(scanJourneyTrees(artifacts, report)).toEqual([]);
    expect(main([artifacts, report])).toBe(0);
  });

  it("a planted BLOCKING note fails (only a `[note] BLOCKING…` line counts)", () => {
    const { artifacts, report } = cleanTrees();
    writeFileSync(
      join(artifacts, "solo-creator", "console.log"),
      `[note] ${BLOCKING_NOTE_PREFIX} APP BUG: Creator-tier checkout did not complete\n`,
      { flag: "a" }
    );
    const problems = scanJourneyTrees(artifacts, report);
    expect(problems.map((p) => p.kind)).toEqual(["blocking-note"]);
    expect(main([artifacts, report])).toBe(1);
  });

  it("a missing main-chapter screenshot fails, per persona", () => {
    for (const persona of PERSONAS) {
      const { artifacts, report } = cleanTrees();
      rmSync(join(artifacts, persona, "screenshots", `07-${MAIN_CHAPTERS[persona]}.png`));
      const problems = scanJourneyTrees(artifacts, report);
      expect(problems.map((p) => p.kind)).toEqual(["missing-screenshot"]);
      expect(problems[0].detail).toContain(persona);
    }
  });

  it("a persona that never ran (no console.log) fails", () => {
    const { artifacts, report } = cleanTrees();
    rmSync(join(artifacts, "editor-seat"), { recursive: true });
    expect(scanJourneyTrees(artifacts, report).map((p) => p.kind).sort()).toEqual(["missing-log", "missing-screenshot"]);
  });

  it("a `_handoff/` file in EITHER tree fails", () => {
    const a = cleanTrees();
    mkdirSync(join(a.artifacts, "_handoff"), { recursive: true });
    writeFileSync(join(a.artifacts, "_handoff", "editor-seat.json"), "{}");
    expect(scanJourneyTrees(a.artifacts, a.report).map((p) => p.kind)).toEqual(["handoff-file"]);
    const b = cleanTrees();
    mkdirSync(join(b.report, "solo-creator", "_handoff"), { recursive: true });
    writeFileSync(join(b.report, "solo-creator", "_handoff", "x.json"), "{}");
    expect(scanJourneyTrees(b.artifacts, b.report).map((p) => p.kind)).toEqual(["handoff-file"]);
  });

  it("only the bootstrap admin screenshot present fails: the suffix match must not accept it", () => {
    const { artifacts, report } = cleanTrees();
    rmSync(join(artifacts, "platform-admin", "screenshots", `07-${MAIN_CHAPTERS["platform-admin"]}.png`));
    writeFileSync(join(artifacts, "platform-admin", "screenshots", "01-admin-bootstrap-identity-created.png"), "png");
    expect(scanJourneyTrees(artifacts, report).map((p) => p.kind)).toEqual(["missing-screenshot"]);
  });

  it("the CLI exit code follows main(): a real process returns 1 on a planted violation and 0 when clean", async () => {
    const { artifacts, report } = cleanTrees();
    const script = resolve(respinRoot, "scripts", "scan-journey-notes.ts");
    const run = async (...args: string[]) => {
      try {
        const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", script, ...args], {
          cwd: respinRoot,
          encoding: "utf8",
        });
        return { code: 0, stdout };
      } catch (error) {
        const e = error as { code?: number; stderr?: string };
        return { code: e.code ?? -1, stdout: e.stderr ?? "" };
      }
    };
    const clean = await run(artifacts, report);
    expect(clean.code, clean.stdout).toBe(0);
    mkdirSync(join(artifacts, "_handoff"), { recursive: true });
    writeFileSync(join(artifacts, "_handoff", "platform-admin.json"), "{}");
    const dirty = await run(artifacts, report);
    expect(dirty.code).toBe(1);
    expect(dirty.stdout).toContain("handoff-file");
  }, 60_000);
});

describe("--consumption-evidence without a run id", () => {
  it("is a usage error (exit 2) that writes nothing — never a guessed id", () => {
    const { artifacts } = cleanTrees();
    const out = join(artifacts, "..", "manifest-out");
    const noEnv = {} as NodeJS.ProcessEnv;
    expect(main(["--consumption-evidence", artifacts, out], noEnv)).toBe(2);
    expect(existsSync(out)).toBe(false);
    expect(main(["--consumption-evidence", artifacts, out, "--run-id", "r-1"], noEnv)).toBe(0);
    expect(existsSync(join(out, "consumption.json"))).toBe(true);
  });
});

describe("the workflow deletes handoffs before the scan and scans both trees before upload", () => {
  const text = workflowText();

  it("cleanup runs on every outcome, deletes the handoff dir and gates scan/upload on safe_to_upload", () => {
    const cleanupIdx = text.indexOf("id: cleanup");
    const scanIdx = text.indexOf("id: scan");
    const uploadIdx = text.indexOf("name: Upload journey report");
    expect(cleanupIdx).toBeGreaterThan(0);
    expect(scanIdx).toBeGreaterThan(cleanupIdx);
    expect(uploadIdx).toBeGreaterThan(scanIdx);
    const cleanupBlock = text.slice(cleanupIdx, text.indexOf("id: consumption"));
    expect(cleanupBlock).toMatch(/if: always\(\)\n/);
    expect(cleanupBlock).toContain('rm -rf "$JOURNEYS_HANDOFF_DIR"');
    expect(cleanupBlock).toContain("JOURNEYS_HANDOFF_DIR:=respin/e2e/journeys/artifacts/_handoff");
    expect(text).toMatch(/id: scan\n\s+if: always\(\) && steps\.cleanup\.outputs\.safe_to_upload == 'true'\n/);
    expect(text).toMatch(/run: pnpm -C respin exec tsx scripts\/scan-journey-notes\.ts e2e\/journeys\/artifacts playwright-report\n/);
  });

  // G-2 (batch-3 final): the previous assertion pinned the command TEXT with `respin/`-prefixed arguments,
  // which `pnpm -C respin exec` (cwd respin/) resolved to respin/respin/… — a scan that could never see the
  // tree and a consumption manifest of zero records, certified green (lesson 2026-08-02). The arguments are
  // now resolved against the cwd that command actually gives, and compared with the real trees.
  it("the scan and consumption arguments resolve, from the cwd `pnpm -C respin exec` really gives, to the artifacts and report trees; every pnpm call is -C respin", async () => {
    const repoRoot = resolve(respinRoot, "..");
    const probe = mkdtempSync(join(tmpdir(), "journey-cwd-"));
    tmpDirs.push(probe);
    const cwdScript = join(probe, "cwd.js");
    writeFileSync(cwdScript, "console.log(process.cwd())\n");
    // spawned from the REPO ROOT, where the workflow's shell runs
    const { stdout } = await execFileAsync("pnpm", ["-C", "respin", "exec", "node", cwdScript], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const execCwd = stdout.trim().split(/\r?\n/).pop()!;
    expect(resolve(execCwd)).toBe(resolve(respinRoot));
    // the arguments as written in the workflow, resolved from that cwd, must be the trees the scan judges
    const scan = /run: pnpm -C respin exec tsx scripts\/scan-journey-notes\.ts (\S+) (\S+)\n/.exec(text);
    expect(scan).not.toBeNull();
    expect(resolve(execCwd, scan![1])).toBe(resolve(ARTIFACTS_ROOT));
    expect(resolve(execCwd, scan![2])).toBe(resolve(respinRoot, "playwright-report"));
    const consumption = /--consumption-evidence \\\n\s+(\S+) "\$RUNNER_TEMP\/consumption-manifest" \\\n/.exec(text);
    expect(consumption).not.toBeNull();
    expect(resolve(execCwd, consumption![1])).toBe(resolve(ARTIFACTS_ROOT));
    // the planted (previous) form must be red under this witness
    expect(resolve(execCwd, "respin/e2e/journeys/artifacts")).not.toBe(resolve(ARTIFACTS_ROOT));
    // G-1's premise (every pnpm call is `-C respin`, asserted in journeys-workflow-triggers.test.ts): the root has no manifest
    expect(existsSync(join(repoRoot, "package.json"))).toBe(false);
  }, 60_000);

  it("the report upload's population never contains a handoff file or a nested trace zip", () => {
    const lines = uploadPathLines(text, "journeys-");
    const files = [
      "respin/e2e/journeys/artifacts/_handoff/platform-admin.json",
      "respin/e2e/journeys/artifacts/platform-admin/console.log",
      "respin/playwright-report/bootstrap/data/trace.zip",
      "respin/playwright-report/bootstrap/index.html",
    ];
    expect(uploadPopulation(lines, files)).toEqual([
      "respin/e2e/journeys/artifacts/platform-admin/console.log",
      "respin/playwright-report/bootstrap/index.html",
    ]);
  });
});
