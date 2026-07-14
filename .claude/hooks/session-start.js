#!/usr/bin/env node
/*
 * Session orientation (SessionStart: startup | resume | clear).
 *
 * Portable, read-only, no project rules of its own. At the start of a session it
 * looks at where this project stands — is the pack set up, is the North Star
 * filled, is any work mid-build — and prints a short plain-language status plus the
 * single recommended next step. Claude Code adds this stdout to the session context,
 * so the assistant can orient the person without them having to know any command.
 *
 * It NEVER blocks or fails a session: any problem -> exit 0 with no output (fail
 * open). It only reads files; it never writes, runs commands, or touches the network.
 *
 * What it reports:
 *   - set up?      CLAUDE.md exists and is filled (not the skeleton template).
 *   - North Star?  NORTH_STAR.md exists and has a real Goal (not the placeholder).
 *   - in flight?   any docs/plans/<feature>-master-plan.md present.
 *   - dormant?     a leftover .claude/settings.pack.json (hooks may be un-merged).
 * and recommends the next step accordingly (almost always: just run /go).
 *
 * This is a convenience, not a gate. The real enforcement is the guardrail +
 * post-edit hooks and the reviewer agents; this just lowers the "what do I do now?"
 * barrier for anyone, regardless of how well they know the pack.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Fail open, always. A broken orientation hook must never wedge a session.
function done(text) {
  try {
    if (text) process.stdout.write(text);
  } catch (e) {
    /* ignore */
  }
  process.exit(0);
}

try {
  // ---- read the payload (best-effort; we mostly just want `source` and `cwd`) ----
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8")) || {};
  } catch (e) {
    input = {};
  }

  // Stay quiet during compaction — that fires mid-conversation and an orientation
  // banner there is noise, not help.
  if (input.source === "compact") done();

  // ---- locate the project root ----
  // Prefer CLAUDE_PROJECT_DIR (Claude Code sets it for hooks), then the payload cwd,
  // then two levels up from this file (.claude/hooks/ -> project root).
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR ||
    input.cwd ||
    path.join(__dirname, "..", "..");

  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(projectDir, rel), "utf8");
    } catch (e) {
      return null;
    }
  };
  const exists = (rel) => {
    try {
      return fs.existsSync(path.join(projectDir, rel));
    } catch (e) {
      return false;
    }
  };

  // ---- detect state (every check defensive; unknown -> treated as "not yet") ----
  const claudeMd = read("CLAUDE.md");
  const isSkeleton =
    claudeMd === null ||
    claudeMd.indexOf("Run `/bootstrap-claude-pack`") !== -1 ||
    claudeMd.indexOf("⟨") !== -1; // ⟨ angle-bracket placeholder
  const hasContext = exists(path.join(".claude", "project-context.md"));
  const setUp = !isSkeleton && hasContext;

  const northStar = read("NORTH_STAR.md");
  // "Filled" once the Goal placeholder comment is gone (bootstrap/go replace it with
  // real prose). Missing file or untouched template -> not set.
  const northStarSet =
    northStar !== null &&
    northStar.indexOf("One or two sentences") === -1 &&
    northStar.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*[#>].*$/gm, "").trim()
      .length > 40;

  // Plans in flight: master-plan files under docs/plans/.
  let inFlight = [];
  try {
    const dir = path.join(projectDir, "docs", "plans");
    if (fs.existsSync(dir)) {
      inFlight = fs
        .readdirSync(dir)
        .filter((f) => /-master-plan\.md$/.test(f))
        .map((f) => f.replace(/-master-plan\.md$/, ""));
    }
  } catch (e) {
    inFlight = [];
  }

  const dormant = exists(path.join(".claude", "settings.pack.json"));

  // ---- compose a short status + the single recommended next step ----
  const lines = [];
  lines.push("[claude-jig] claude-jig is installed in this project.");

  const statusBits = [];
  statusBits.push(setUp ? "set up: yes" : "set up: NOT YET");
  statusBits.push(northStarSet ? "North Star: set" : "North Star: not set");
  statusBits.push(
    inFlight.length
      ? "in progress: " + inFlight.slice(0, 4).join(", ")
      : "in progress: none"
  );
  lines.push("Status — " + statusBits.join(" | ") + ".");

  let next;
  if (!setUp) {
    next =
      'Run  /go  and say what you want to build — it will set the project up first (one short round of questions), then plan and build it. (Or run /bootstrap-claude-pack to set up manually.)';
  } else if (inFlight.length) {
    next =
      'Run  /go  to continue "' +
      inFlight[0] +
      '" from its next phase, or  /go  to start something new. (To check a finished phase: /review-phase <feature> <N>.)';
  } else {
    next =
      "Run  /go  and say what you want to build, in plain words — it plans, builds, and checks it for you.";
  }
  lines.push("Recommended next step: " + next);

  if (dormant) {
    lines.push(
      "Note: a .claude/settings.pack.json is present — the safety hooks may not be merged into your settings.json yet. /go or /bootstrap-claude-pack will offer to wire them."
    );
  }

  lines.push(
    "If the person seems unsure what to do, share the recommended next step above in plain language. Power users can still run the individual commands directly."
  );

  done(lines.join("\n") + "\n");
} catch (e) {
  // Absolutely never throw out of a SessionStart hook.
  done();
}
