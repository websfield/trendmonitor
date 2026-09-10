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
 *         "timeoutMs": 150000,            // optional; positive integer, max 165000
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

// Keep every fallible operation below one ultimate fail-open boundary. Individual
// diagnostics stay narrow; an unexpected engine error exits silently.
function main() {
let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8")) || {};
} catch (e) {
  failOpen();
}

const ti = input.tool_input || {};
const rawPath = ti.file_path || ti.path || "";
if (typeof rawPath !== "string" || !rawPath) failOpen();
const p = rawPath.replace(/\\/g, "/");

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
    process.stderr.write(
      `post-edit-check: SKIPPED configured checks from ${c}: could not parse the file (${e.message}). ` +
        `Your edit continued, but those checks did not run. Fix this file, then retry; ` +
        `run /doctor if this repeats.\n`
    );
    failOpen();
  }
}
if (!config || !Array.isArray(config.checks) || !config.checks.length) failOpen();

function safeRegex(src) {
  if (typeof src !== "string") return null;
  try {
    return new RegExp(src);
  } catch (e) {
    return null;
  }
}

// Parse only commands whose executable and argv can be preserved without a shell.
// Anything with expansion, redirection, chaining, or an environment prefix stays on
// the shell path below; a nonzero shell result is a real started failure.
function parseSimpleCommand(command) {
  const args = [];
  let token = "";
  let tokenStarted = false;
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (
        quote === '"' &&
        (process.platform === "win32" ? /[%!]/.test(ch) : /[$`]/.test(ch))
      ) {
        return null;
      } else if (quote === '"' && ch === "\\" && process.platform !== "win32") {
        // POSIX shells interpret backslashes inside double quotes contextually.
        // Let the shell preserve those rules rather than approximating them here.
        return null;
      } else if (quote === '"' && ch === "\\" && command[i + 1] === quote) {
        token += quote;
        tokenStarted = true;
        i += 1;
      } else {
        token += ch;
        tokenStarted = true;
      }
      continue;
    }
    if (ch === '"' || (ch === "'" && process.platform !== "win32")) {
      quote = ch;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(token);
        token = "";
        tokenStarted = false;
      }
      continue;
    }
    if (/[;&|<>()`$%!*?^~\r\n]/.test(ch)) return null;
    // POSIX comments and bracket globs change what argv the shell produces.
    // Route them through the shell; direct launch is only for exact argv.
    if (process.platform !== "win32" && /[#\[\]]/.test(ch)) return null;
    // POSIX backslash escaping changes tokenization; leave it to the shell. On
    // Windows, backslash is an ordinary path separator and remains safe here.
    if (ch === "\\" && process.platform !== "win32") return null;
    token += ch;
    tokenStarted = true;
  }
  if (quote) return null;
  if (tokenStarted) args.push(token);
  if (!args.length || /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) return null;
  return { executable: args[0], args: args.slice(1) };
}

function isShellBuiltin(executable) {
  const name = executable.toLowerCase();
  const windowsBuiltins = new Set([
    "assoc", "break", "call", "cd", "chdir", "cls", "color", "copy", "date", "del",
    "dir", "echo", "endlocal", "erase", "exit", "for", "ftype", "goto", "if", "md",
    "mkdir", "mklink", "move", "path", "pause", "popd", "prompt", "pushd", "rd", "rem",
    "ren", "rename", "rmdir", "set", "setlocal", "shift", "start", "time", "title", "type",
    "ver", "verify", "vol",
  ]);
  const posixBuiltins = new Set([
    ".", ":", "[", "alias", "bg", "break", "cd", "command", "continue", "echo", "eval",
    "exec", "exit", "export", "false", "fg", "getopts", "hash", "jobs", "kill", "printf",
    "pwd", "read", "readonly", "return", "set", "shift", "test", "times", "trap", "true",
    "type", "ulimit", "umask", "unalias", "unset", "wait",
  ]);
  return (process.platform === "win32" ? windowsBuiltins : posixBuiltins).has(name);
}

function resolveExecutable(executable, cwd) {
  const windows = process.platform === "win32";
  const hasSeparator = /[\\/]/.test(executable);
  const pathDirs = (process.env.PATH || "").split(path.delimiter).map((dir) => {
    const clean = dir.replace(/^"|"$/g, "");
    if (!clean) return cwd;
    return path.isAbsolute(clean) ? clean : path.resolve(cwd, clean);
  });
  // cmd.exe checks its working directory before PATH. POSIX searches only PATH,
  // but empty and relative PATH entries are still relative to the child's cwd.
  const searchDirs = windows ? [cwd, ...pathDirs] : pathDirs;
  const bases = hasSeparator
    ? [path.isAbsolute(executable) ? executable : path.resolve(cwd, executable)]
    : searchDirs.map((dir) => path.join(dir, executable));
  const hasExtension = windows && /\.[^\\/.]+$/.test(executable);
  const extensions = windows
    ? hasExtension
      ? [""]
      : (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const base of bases) {
    for (const extension of extensions) {
      const candidate = base + extension;
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        fs.accessSync(candidate, windows ? fs.constants.F_OK : fs.constants.X_OK);
        return candidate;
      } catch (e) {
        /* keep searching */
      }
    }
  }
  return null;
}

const { execSync, spawnSync } = require("child_process");
const DEFAULT_TIMEOUT_MS = 150000;
// settings.json gives the hook 180 seconds; retain 15 seconds for process cleanup and diagnostics.
const MAX_TIMEOUT_MS = 165000;

// Defensive: any unanticipated error while evaluating checks must fail open, never
// surface as a failed edit (invariant #1) — the risky ops below are individually
// guarded, but this makes the guarantee hold even if a future edit adds one that isn't.
// Intentional exits (0 on pass/skip, 2 on check failure) terminate before the catch.
try {
for (const [checkIndex, check] of config.checks.entries()) {
  if (!check || typeof check !== "object") {
    process.stderr.write(
      `post-edit-check SKIPPED: entry ${checkIndex + 1} in .claude/workspaces.json is not an object. ` +
        `Fix or remove the entry before retrying.\n`
    );
    continue;
  }
  if (typeof check.match !== "string" || check.match.length === 0) {
    const invalidLabel = check.label || check.command || `entry ${checkIndex + 1}`;
    process.stderr.write(
      `post-edit-check SKIPPED: invalid match for "${invalidLabel}" in ` +
        `.claude/workspaces.json. Set a non-empty regex string before retrying.\n`
    );
    continue;
  }
  const re = safeRegex(check.match);
  if (!re) {
    const invalidLabel = check.label || check.command || check.match;
    process.stderr.write(
      `post-edit-check SKIPPED: invalid match pattern /${check.match}/ for "${invalidLabel}" in ` +
        `.claude/workspaces.json; this check did not run. Fix the pattern before retrying.\n`
    );
    continue;
  }
  if (!re.test(p)) continue;

  // Note-only entry: print the reminder and keep scanning for a command check.
  if (check.note) process.stderr.write(`post-edit note: ${check.note}\n`);
  if (check.command === undefined || check.command === null || check.command === "") continue;
  if (
    typeof check.command !== "string" ||
    check.command.trim() === "" ||
    check.command.includes("\0")
  ) {
    const invalidLabel = check.label || check.match;
    process.stderr.write(
      `post-edit-check SKIPPED: invalid command for "${invalidLabel}" in ` +
        `.claude/workspaces.json. Fix the command before retrying.\n`
    );
    continue;
  }

  const configuredCwd = check.cwd === undefined || check.cwd === null ? "." : check.cwd;
  if (typeof configuredCwd !== "string" || configuredCwd.includes("\0")) {
    const invalidLabel = check.label || check.command;
    process.stderr.write(
      `post-edit-check SKIPPED: invalid cwd for "${invalidLabel}" in ` +
        `.claude/workspaces.json. Fix the cwd before retrying.\n`
    );
    continue;
  }
  const cwd = path.join(cfgDir, configuredCwd);
  const label = check.label || check.command;
  const timeoutMs = Object.prototype.hasOwnProperty.call(check, "timeoutMs")
    ? check.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    process.stderr.write(
      `post-edit-check SKIPPED: invalid timeoutMs for "${label}" in ` +
        `.claude/workspaces.json. Set a whole number from 1 to ${MAX_TIMEOUT_MS} before retrying.\n`
    );
    continue;
  }

  const simple = parseSimpleCommand(check.command);
  let resolvedSimple = null;
  let runDirect = false;
  if (simple && !isShellBuiltin(simple.executable)) {
    resolvedSimple = resolveExecutable(simple.executable, cwd);
    if (resolvedSimple === null) {
      process.stderr.write(
        `post-edit-check SKIPPED: command "${check.command}" for "${label}" was not found ` +
          `from its configured cwd or on PATH. Install it, correct command/cwd in ` +
          `.claude/workspaces.json, then retry.\n`
      );
      process.exit(0);
    }
    // Windows command scripts require cmd.exe. Their existence has been established,
    // but a nonzero shell result is still a started check failure.
    runDirect = !(
      process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolvedSimple)
    );
  }

  try {
    // Direct simple commands make ENOENT authoritative. Commands that need shell
    // syntax still run through the platform shell, but every nonzero shell result is
    // treated as a real check failure—the child's output is never launch evidence.
    if (runDirect) {
      const result = spawnSync(resolvedSimple, simple.args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8",
      });
      if (result.error) {
        result.error.stdout = result.stdout;
        result.error.stderr = result.stderr;
        throw result.error;
      }
      if (result.status !== 0) {
        const failure = new Error(`command exited ${result.status}`);
        failure.status = result.status;
        failure.signal = result.signal;
        failure.stdout = result.stdout;
        failure.stderr = result.stderr;
        throw failure;
      }
    } else {
      execSync(check.command, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8",
      });
    }
  } catch (e) {
    const out = ((e && e.stdout) || "") + ((e && e.stderr) || "");
    const code = e && e.code;
    const status = e && typeof e.status === "number" ? e.status : null;
    if (code === "ETIMEDOUT") {
      if (out.trim()) process.stderr.write(out.endsWith("\n") ? out : out + "\n");
      const timeoutFix =
        timeoutMs < MAX_TIMEOUT_MS
          ? `increase timeoutMs (up to ${MAX_TIMEOUT_MS}) in .claude/workspaces.json`
          : "use a faster check command or make the current command finish sooner";
      process.stderr.write(
        `post-edit-check FAILED: "${label}" timed out after ${timeoutMs} ms while checking ${p}. ` +
          `Run the command manually to diagnose it; if this duration is expected, ${timeoutFix}, then retry.\n`
      );
      process.exit(2);
    }
    if (code === "ENOENT") {
      process.stderr.write(
        `post-edit-check SKIPPED: "${label}" could not start because its working directory or ` +
          `system shell is unavailable. Correct cwd in .claude/workspaces.json or restore the shell, then retry.\n`
      );
      process.exit(0);
    }
    // Child execution reports a normal command failure with a numeric status, and a
    // command killed after launch with a signal. A string error code with neither, and no
    // captured output, is evidence that the process never started. ENOBUFS is excluded:
    // it means the command ran and exceeded maxBuffer, so it remains a real failure.
    const didNotStart =
      typeof code === "string" &&
      code !== "ENOBUFS" &&
      status === null &&
      !(e && e.signal) &&
      !out.trim();
    if (didNotStart) {
      process.stderr.write(
        `post-edit-check SKIPPED: "${label}" could not start (${code}). Check the command's ` +
          `permissions and system resources, correct command/cwd in .claude/workspaces.json if needed, then retry.\n`
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
  process.stderr.write(
    `post-edit-check: SKIPPED remaining checks after an evaluation error ` +
      `(${(e && e.message) || String(e)}). Your edit continued, but post-edit checks did not finish. ` +
      `Run /doctor, then run the configured check manually before continuing.\n`
  );
  failOpen();
}

process.exit(0);
}

try {
  main();
} catch (e) {
  failOpen();
}
