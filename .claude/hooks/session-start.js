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
 *   - progress?    last recorded phase outcomes; ambiguous records need inspection.
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

// Deliberately recognize a small written contract, not arbitrary success prose.
// These records are orientation hints, never a fresh validation of the work.
function recordLines(text) {
  let fence = null;
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/).map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (fence[0] === marker[1][0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return "";
    }
    return fence || /^(?:\s*>| {4}|\t)/.test(line) ? "" : line;
  });
}

function recordedPhase(ledger, review, phase) {
  const historical = /\b(?:histor(?:y|ical)|previous(?:ly)?|prior|archive(?:d)?|example|component|baseline|superseded|old)\b/i;
  const currentScope = (sections, kind) => sections.every((section, index) => {
    if (historical.test(section)) return false;
    const numbers = [...section.matchAll(/\bPhase\s+(\d+)\b/gi)];
    if (numbers.some((match) => Number(match[1]) !== phase)) return false;
    // A one-file record's title heading ("# <feature>") scopes nothing; the sections below it do.
    if (index === 0 && sections.length > 1) return true;
    const headings = kind === "ledger"
      ? /^(?:Progress(?:\s+(?:tracking|ledger))?|Ledger|Current(?:\s+progress)?|Phase\s+\d+)(?:\s*[—–:-].*)?$/i
      : /^(?:Phase\s+\d+(?:\s+review)?|Review(?:\s+report)?|Report\s+card|Current(?:\s+(?:review|overall))?)(?:\s*[—–:-].*)?$/i;
    return headings.test(section);
  });
  let ledgerStatus = null;
  const ledgerSections = [];
  for (const raw of recordLines(ledger)) {
    const line = raw.replace(/\*\*/g, "").trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      ledgerSections.length = heading[1].length;
      ledgerSections[heading[1].length - 1] = heading[2];
    }
    // Append-only ledgers put the status immediately after the exact Phase cell.
    // A later started/blocked/reopened/unknown cell supersedes an older complete.
    const cells = line.split("|").map((cell) => cell.trim());
    const index = cells.findIndex((cell) => new RegExp(`^Phase\\s+${phase}$`, "i").test(cell));
    if (index >= 0 && index + 1 < cells.length) {
      ledgerStatus = /^complete$/i.test(cells[index + 1]) && currentScope(ledgerSections, "ledger")
        ? "complete" : "inspect";
    } else if (new RegExp(`^(?:[-*]\\s+)?Phase\\s+${phase}\\s*(?::|[—–-]|\\bis\\b|\\bnot\\b)`, "i").test(line)) {
      ledgerStatus = new RegExp(`^(?:[-*]\\s+)?Phase\\s+${phase}\\s*:\\s*complete\\s*$`, "i").test(line) && currentScope(ledgerSections, "ledger")
        ? "complete" : "inspect";
    } else if (new RegExp(`\\bPhase\\s+${phase}\\b[^\\r\\n]*\\b(?:not complete|blocked|reopen(?:ed)?)\\b`, "i").test(line)) {
      ledgerStatus = "inspect";
    }
  }

  let reviewStatus = null;
  const sections = [];
  // The phase named by the most recent heading at any level. One progress-and-log.md holds every
  // phase, and a card's own sub-heading (e.g. "## Report card") must not lose that scope.
  let lastPhaseHeading = null;
  for (const raw of recordLines(review)) {
    const line = raw.replace(/\*\*/g, "").trim();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    // Only the report's Overall headline establishes a positive record. Status,
    // Readiness, component cards and historical examples cannot close a phase.
    const overall = line.match(/^(?:#{1,6}\s+)?Overall\s*:\s*(.+)$/i);
    const negative = /^(?:#{1,6}\s+)?(?:Status|Readiness)\s*:\s*(?:Not\b|Almost\b|Blocked\b|Reopen(?:ed)?\b|In progress\b)/i.test(line);
    if (heading && !overall && !negative) {
      sections.length = heading[1].length;
      sections[heading[1].length - 1] = heading[2];
      const named = heading[2].match(/\bPhase\s+(\d+)\b/i);
      if (named) lastPhaseHeading = Number(named[1]);
    }
    if (!overall) {
      // The goal-level `Status: in progress` line directly under the record's title is about the
      // whole goal (goalFinished reads it), not a verdict on this phase. Every other negative counts.
      if (negative && !(sections.length === 1 && /^Status\s*:\s*In progress\b/i.test(line))) reviewStatus = "inspect";
      continue;
    }
    const value = overall[1].trim();
    // An Overall line under another phase's heading belongs to that phase and says nothing about this one.
    if (lastPhaseHeading !== null && lastPhaseHeading !== phase) continue;
    // Unknown sections cannot turn a later status into silence and leave an old
    // success standing. Only a fresh, correctly scoped positive can close it.
    reviewStatus = currentScope(sections, "review") && /^Ready(?:\s*(?:[—–·]|$))/i.test(value) &&
      !/\b(?:not|almost|blocked|reopen(?:ed)?|previous(?:ly)?|histor(?:y|ical)|was|pending)\b/i.test(value)
      ? "complete" : "inspect";
  }
  // Across different files there is no trusted total ordering. A conflicting
  // incomplete record always wins; /go can inspect dates and real evidence.
  if (ledgerStatus === "inspect" || reviewStatus === "inspect") return false;
  return ledgerStatus === "complete" || reviewStatus === "complete";
}

// A goal's own `Status:` line at the top of progress-and-log.md closes the whole goal.
function goalFinished(text) {
  const lines = recordLines(text);
  // Only the top of the record — before the first section heading after the title — closes the goal.
  const firstSection = lines.findIndex((line, index) => index > 0 && /^#{1,6}\s/.test(line.trim()) && !/^#\s/.test(line.trim()));
  return lines.slice(0, firstSection < 0 ? undefined : firstSection)
    .some((line) => /^Status\s*:\s*(?:done|complete|shipped)\b/i.test(line.replace(/\*/g, "").trim()));
}

// "round N · last review: <verdict>" from the `## Review log` table; columns found by header name.
function reviewLogSummary(text) {
  const lines = recordLines(text);
  const start = lines.findIndex((line) => /^#{1,6}\s+Review\s+log\b/i.test(line.trim()));
  if (start < 0) return null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (/^\s*\|/.test(line)) rows.push(line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.replace(/[*_`]/g, "").trim()));
  }
  if (rows.length < 2) return null;
  const header = rows[0];
  const verdictAt = header.findIndex((cell) => /verdict/i.test(cell));
  const data = rows.slice(1).filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (!data.length) return null;
  const verdict = verdictAt >= 0 ? (data[data.length - 1][verdictAt] || "").slice(0, 40) : "";
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(verdict)) return `round ${data.length}`;
  return `round ${data.length}` + (verdict ? ` · last review: ${verdict}` : "");
}

try {
  // ---- read the payload (best-effort; we mostly just want `source` and `cwd`) ----
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (e) {
    done();
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) done();
  if (
    Object.prototype.hasOwnProperty.call(input, "cwd") &&
    (typeof input.cwd !== "string" || input.cwd.length === 0 || input.cwd.includes("\0"))
  ) {
    done();
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "source") &&
    typeof input.source !== "string"
  ) {
    done();
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
      if (e && e.code === "ENOENT") return null;
      throw e;
    }
  };
  const exists = (rel) => {
    try {
      return fs.existsSync(path.join(projectDir, rel));
    } catch (e) {
      throw e;
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

  // Lightweight recorded progress only. No source hashing or current gate claims.
  let inFlight = [];
  const planned = new Set(); // goals judged by the plan scan; the fast-lane scan must not re-list them
  try {
    const dir = path.join(projectDir, "docs", "plans");
    if (fs.existsSync(dir)) {
      const planFiles = fs.readdirSync(dir);
      const masters = planFiles
        .filter((f) => /-master-plan\.md$/.test(f))
        .map((f) => f.replace(/-master-plan\.md$/, ""));
      masters.forEach((name) => planned.add(name));
      inFlight = masters.filter((feature) => {
        const log = read(path.join("docs", "progress", feature, "progress-and-log.md"));
        if (log !== null && goalFinished(log)) return false;
        const escaped = feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const phasePattern = new RegExp(`^${escaped}-phase-(\\d+)\\.md$`);
        const phases = planFiles
          .map((file) => {
            const match = file.match(phasePattern);
            return match ? Number(match[1]) : null;
          })
          .filter((phase) => phase !== null);
        if (!phases.length) return true;

        // No 2.0 record: fall back to the pre-2.0 ledger + review files an upgraded project may still hold.
        const ledger = log !== null ? log : (read(path.join("docs", "progress", feature, "ledger.md")) || "");
        return phases.some((phase) => {
          const review = log !== null ? log
            : (read(path.join("docs", "progress", `${feature}-phase-${phase}-review.md`)) || "");
          return !recordedPhase(ledger, review, phase);
        });
      }).map((name) => {
        let nextAction = null;
        try { const log = read(path.join("docs", "progress", name, "progress-and-log.md")); if (log !== null) nextAction = reviewLogSummary(log); } catch (e) { /* bare name is always safe */ }
        return { name, nextAction };
      });
    }
  } catch (e) {
    done();
  }

  // Fast-lane work has no plan documents, so the scan above cannot see it; its record is
  // docs/progress/<goal>/progress-and-log.md. Without this, the first screen a returning user reads
  // reports nothing outstanding for work that is genuinely unfinished. Read-only, bounded, silent.
  try {
    const progressDir = path.join(projectDir, "docs", "progress");
    if (fs.existsSync(progressDir)) {
      const recorded = new Set([...planned, ...inFlight.map((entry) => entry.name)]);
      for (const entry of fs.readdirSync(progressDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || recorded.has(entry.name)) continue;
        const log = read(path.join("docs", "progress", entry.name, "progress-and-log.md"));
        if (log === null) continue;
        // A finished goal's record is never deleted, so presence alone would flag it forever; only
        // its own Status line closes it. A malformed record stays flagged — conservative, never dropped.
        let nextAction = null;
        try {
          if (goalFinished(log)) continue;
          nextAction = reviewLogSummary(log);
        } catch (e) { /* still flag it; the bare name is always safe */ }
        inFlight.push({ name: entry.name, nextAction });
      }
    }
  } catch (e) {
    // Leave whatever the plan scan already found; never wedge the session over this.
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
      ? "unfinished work: " + inFlight.slice(0, 4).map((entry) => entry.name).join(", ")
      : "unfinished work: none recorded"
  );
  lines.push("Recorded progress — " + statusBits.join(" | ") + ". Current completion has not been verified.");

  let next;
  if (!setUp) {
    next =
      'Run  /go  and say what you want to build — it will set the project up first (one short round of questions), then plan and build it. (Or run /bootstrap-claude-pack to set up manually.)';
  } else if (inFlight.length) {
    next =
      'Run  /go  to inspect "' +
      inFlight[0].name +
      '" and identify its next step.' +
      (inFlight[0].nextAction ? " Last recorded: " + inFlight[0].nextAction : "");
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
