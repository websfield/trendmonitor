#!/usr/bin/env node
/*
 * Config-driven post-write check (PostToolUse: Edit | Write | MultiEdit).
 *
 * Portable engine. After a file changes, it runs the project's own verification
 * command for the matching path (typecheck, lint, build, whatever the repo uses).
 * Exit 2 surfaces the command's stderr so Claude fixes the breakage before moving
 * on (the write has already happened — this is a fast feedback loop, not a veto).
 *
 * It reads its check table from `.claude/workspaces.json` next to the hooks dir.
 * If that file is missing or empty, the hook is a no-op (exit 0) — so a fresh
 * install never breaks edits until you opt in by configuring checks.
 *
 * workspaces.json schema:
 *   {
 *     "checks": [
 *       {
 *         "match":   "regex tested against the changed file path",
 *         "command": "shell command to run on match",
 *         "cwd":     ".",                 // optional, relative to project root; default "."
 *         "label":   "typecheck @app/api",// optional, for the failure message
 *         "timeoutMs": 150000,            // optional; default 150000
 *         "note":    "non-blocking reminder printed on match (no command run if command omitted)"
 *       }
 *     ]
 *   }
 *
 * Evaluation: the FIRST check whose `match` hits the path wins (order matters — put
 * specific patterns before broad ones). A check with `note` but no `command` only
 * prints a reminder (exit 0). Multiple notes can stack before the command check by
 * listing note-only entries first; they print and the loop continues until a
 * command-bearing match runs.
 */

const fs = require("fs");
const path = require("path");

function failOpen() {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch (e) {
  failOpen();
}

const ti = input.tool_input || {};
const p = (ti.file_path || ti.path || "").replace(/\\/g, "/");
if (!p) failOpen();

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// Resolve the config like guardrails.js does: prefer the project dir, but fall back to
// a path relative to this script so checks still run when invoked from a subdirectory
// without CLAUDE_PROJECT_DIR set (otherwise the engine would silently skip every check).
const candidates = [
  path.join(projectDir, ".claude", "workspaces.json"),
  path.join(__dirname, "..", "workspaces.json"),
];

let config = null;
let cfgDir = projectDir;
for (const c of candidates) {
  try {
    if (fs.existsSync(c)) {
      config = JSON.parse(fs.readFileSync(c, "utf8"));
      cfgDir = path.dirname(path.dirname(c)); // <project>/.claude/x.json -> <project>
      break;
    }
  } catch (e) {
    process.stderr.write(`post-edit-check: could not parse ${c} (${e.message}).\n`);
    failOpen();
  }
}
if (!config || !Array.isArray(config.checks) || !config.checks.length) failOpen();

function safeRegex(src) {
  try {
    return new RegExp(src);
  } catch (e) {
    return null;
  }
}

const { execSync } = require("child_process");

// Defensive: any unanticipated error while evaluating checks must fail open, never
// surface as a failed edit (invariant #1) — the risky ops below are individually
// guarded, but this makes the guarantee hold even if a future edit adds one that isn't.
// Intentional exits (0 on pass/skip, 2 on check failure) terminate before the catch.
try {
for (const check of config.checks) {
  if (!check || typeof check !== "object" || !check.match) continue;
  const re = safeRegex(check.match);
  if (!re || !re.test(p)) continue;

  // Note-only entry: print the reminder and keep scanning for a command check.
  if (check.note) {
    process.stderr.write(`post-edit note: ${check.note}\n`);
    if (!check.command) continue;
  }
  if (!check.command) continue;

  // Guard the type: a non-string cwd in a hand-edited workspaces.json would make
  // path.join throw *outside* the try below and escape as an uncaught exception
  // (breaking invariant #1's "no output, degrade silently"). Fall back instead.
  const cwd = path.join(cfgDir, typeof check.cwd === "string" ? check.cwd : ".");
  const label = check.label || check.command;
  try {
    // Capture (not inherit) so we can both (a) tell "tool missing" from "tool failed"
    // and (b) re-emit the real output to Claude. inherit would send the diagnostic to
    // the terminal and leave us nothing to inspect.
    execSync(check.command, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: check.timeoutMs || 150000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch (e) {
    const out = ((e && e.stdout) || "") + ((e && e.stderr) || "");
    const code = e && e.code;
    const status = e && typeof e.status === "number" ? e.status : null;
    // "Tool missing" (skip — never false-fail an edit) vs "tool ran and reported errors"
    // (fail — Claude must fix). Exit codes alone are ambiguous on Windows (a missing
    // command and a normal failure both exit 1), so also match the canonical shell
    // "not found" phrasings in the captured output.
    const missing =
      code === "ENOENT" ||
      status === 127 ||
      status === 9009 ||
      /is not recognized as an internal or external command|command not found|: No such file or directory/i.test(
        out
      );
    if (missing) {
      process.stderr.write(
        `post-edit-check SKIPPED: command for "${label}" not found on PATH.\n`
      );
      process.exit(0);
    }
    // Surface the real errors, then the actionable line.
    if (out.trim()) process.stderr.write(out.endsWith("\n") ? out : out + "\n");
    process.stderr.write(
      `post-edit-check FAILED: "${label}" failed after editing ${p}. Fix the errors before continuing.\n`
    );
    process.exit(2);
  }
  // First command-bearing match wins.
  process.exit(0);
}
} catch (e) {
  process.stderr.write(`post-edit-check: evaluation error (${(e && e.message) || String(e)}); failing open.\n`);
  failOpen();
}

process.exit(0);
