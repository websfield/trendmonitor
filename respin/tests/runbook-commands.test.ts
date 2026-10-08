// EVERY `pnpm -C respin <script>` RUNBOOK.md NAMES IS A SCRIPT respin/package.json
// HAS (audit Phase 3, 2026-10-06) — a doc that names a command an operator
// cannot run is the outage. And the held-draft section names every refusal the
// settle command can print, from the command's own `--help`.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HELP } from "../scripts/settle-candidate";

const here = dirname(fileURLToPath(import.meta.url));
const runbook = readFileSync(resolve(here, "../../RUNBOOK.md"), "utf8").replace(/\r\n/g, "\n");
const scripts = Object.keys(
  (JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as { scripts: Record<string, string> }).scripts
);
const NAMED = /pnpm -C respin ([a-z0-9][a-z0-9:_-]*)/g;
const named = (text: string) => [...new Set([...text.matchAll(NAMED)].map((m) => m[1]!))];

describe("RUNBOOK.md's respin commands", () => {
  it("every named script exists in respin/package.json", () => {
    const missing = named(runbook).filter((name) => !scripts.includes(name));
    expect(missing).toEqual([]);
    expect(named(runbook)).toContain("settle:candidate");
  });

  it("PLANTED: a script the package does not have is caught", () => {
    expect(named("run `pnpm -C respin settle:everything`").filter((n) => !scripts.includes(n))).toEqual(["settle:everything"]);
  });

  it("the held-draft section names every refusal code the settle command's --help lists", () => {
    const section = runbook.slice(runbook.indexOf("## Held generation drafts"), runbook.indexOf("## Deploy — UGC"));
    const codes = [...HELP.matchAll(/^ {2}([a-z_]+)\s{2,}/gm)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThanOrEqual(10);
    for (const code of codes) {
      expect(section.includes(`\`${code}\``) || section.includes(`code=${code}`), code).toBe(true);
    }
    expect(section).toMatch(/paused workspace is refused/);
  });
});
