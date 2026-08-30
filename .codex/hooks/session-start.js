"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { findProjectRoot, readStdinJson } = require("./lib");

function existing(root, candidates) {
  return candidates.filter((candidate) => fs.existsSync(path.join(root, candidate)));
}

function main() {
  let input = {};
  try {
    input = readStdinJson();
  } catch {
    // Session orientation is advisory; malformed input must not prevent startup.
  }

  const root = findProjectRoot(input.cwd || process.cwd());
  let branch = "unknown";
  try {
    branch = childProcess.execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "detached HEAD";
  } catch {
    // Branch context is useful but nonessential.
  }

  const orientation = existing(root, [
    "AGENTS.md",
    "CLAUDE.md",
    ".codebase-map/SUMMARY.md",
    ".claude/project-context.md",
    "docs/initial/NORTH_STAR.md",
    "docs/initial/build-plan.md",
  ]);

  process.stdout.write([
    `TrendMonitor Codex session on branch: ${branch}`,
    "Read AGENTS.md and CLAUDE.md before work; the latter is the shared product and quality canon.",
    "Use .codebase-map/SUMMARY.md before broad exploration and maintain a plan for non-trivial edits.",
    "Claude /commands are available as Codex $skills; Claude reviewer roles are available as project agents.",
    `Orientation files present: ${orientation.join(", ")}`,
  ].join("\n") + "\n");
}

main();

