"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  emitJson,
  extractFileChanges,
  findProjectRoot,
  readStdinJson,
} = require("./lib");

function selectChecks(config, changes) {
  const commands = new Map();
  const notes = [];

  for (const change of changes) {
    let selected = false;
    for (const check of config.checks || []) {
      const matcher = new RegExp(check.match);
      if (!matcher.test(change.path)) continue;

      if (check.note) notes.push(`${change.path}: ${check.note}`);
      if (!selected && check.command) {
        const key = `${check.cwd || "."}\u0000${check.command}`;
        if (!commands.has(key)) commands.set(key, { ...check, paths: [] });
        commands.get(key).paths.push(change.path);
        selected = true;
      }
    }
  }

  return { commands: [...commands.values()], notes: [...new Set(notes)] };
}

function runCheck(projectRoot, check) {
  const cwd = path.resolve(projectRoot, check.cwd || ".");
  const relative = path.relative(projectRoot, cwd);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing check cwd outside repository: ${check.cwd}`);
  }

  return childProcess.execSync(check.command, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: check.timeoutMs || 300000,
  });
}

function selfTest() {
  const config = {
    checks: [
      { match: "docs/", note: "docs changed" },
      { match: "\\.ts$", command: "echo test", cwd: ".", label: "typescript" },
    ],
  };
  const selected = selectChecks(config, [
    { path: "docs/a.ts", body: "" },
    { path: "src/b.ts", body: "" },
  ]);
  assert.strictEqual(selected.commands.length, 1);
  assert.deepStrictEqual(selected.commands[0].paths, ["docs/a.ts", "src/b.ts"]);
  assert.strictEqual(selected.notes.length, 1);
  process.stdout.write("post-edit-check self-test passed\n");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  let input;
  try {
    input = readStdinJson();
  } catch (error) {
    emitJson({ systemMessage: `Codex post-edit checks could not parse hook input: ${error.message}` });
    return;
  }

  const projectRoot = findProjectRoot(input.cwd || process.cwd());
  const changes = extractFileChanges(input, projectRoot);
  if (!changes.length) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(projectRoot, ".claude", "workspaces.json"), "utf8"));
  } catch (error) {
    emitJson({ systemMessage: `Codex post-edit checks failed open because the shared check map could not be loaded: ${error.message}` });
    return;
  }

  let selected;
  try {
    selected = selectChecks(config, changes);
  } catch (error) {
    emitJson({ systemMessage: `Codex post-edit checks failed open because a shared regex is invalid: ${error.message}` });
    return;
  }

  const successes = [];
  for (const check of selected.commands) {
    try {
      runCheck(projectRoot, check);
      successes.push(`${check.label || check.command} (${check.paths.join(", ")})`);
    } catch (error) {
      const stdout = String(error.stdout || "").trim();
      const stderr = String(error.stderr || "").trim();
      const details = [stdout, stderr].filter(Boolean).join("\n").slice(-12000);
      process.stderr.write(
        `Required post-edit check failed: ${check.label || check.command}\n` +
        `Changed paths: ${check.paths.join(", ")}\n` +
        `${details}\n`,
      );
      process.exitCode = 2;
      return;
    }
  }

  const context = [];
  if (successes.length) context.push(`Post-edit checks passed:\n- ${successes.join("\n- ")}`);
  if (selected.notes.length) context.push(`Project reminders:\n- ${selected.notes.join("\n- ")}`);
  if (context.length) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context.join("\n\n"),
      },
    });
  }
}

main();

