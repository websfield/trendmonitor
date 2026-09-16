#!/usr/bin/env node
/*
 * Stop hook — bounded, read-only corrective continuation for one registered, actively running
 * goal. See docs/plans/developer-quality-workflow-stop-decision.md (source repo) for the full
 * decision this implements.
 *
 * WHAT THIS ACTUALLY DOES TODAY: nothing, for any real project. `stopGuard.enabled` can never be
 * true on a real goal in this increment — there is no `amend` verb or any other CLI-reachable path
 * in workflow-state.js that sets it. This hook's decision logic is complete and fully tested (see
 * tests/workflow/stop.test.js and the isolated tests/workflow/stop-probe.js), but until a later
 * increment adds a real activation path (with the additional project-hook/config-hash binding the
 * decision doc requires alongside session identity), it is permanently a no-op in production. Ship
 * it now anyway: the machinery is safest to build and test while nothing depends on it working.
 *
 * FAIL-OPEN CONTRACT (same promise as every other hook in this pack): missing/malformed input,
 * an unreadable or ambiguous goal, any internal error, or exceeding a bounded read all resolve to
 * exit 0 with no output. The only other outcome is exit 2 with one plain-text corrective reason on
 * stderr, and only when this evaluation has positively established: a specific registered goal is
 * bound to this exact session, it is actively running, and it has a plain, mechanical check
 * obligation (never a review, an unresolved finding, a lock, or an unknown budget) that has never
 * been run or last failed. This hook NEVER writes a file, spawns a shell/reviewer, or touches the
 * network — it only reads the same workflow.json files the engine already writes.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const workflowEvidence = require("../lib/workflow-evidence.js");

const MAX_GOALS_SCANNED = 1000;

// Pure: no writes, no process.exit, no console output. Exported for tests/workflow/stop-probe.js
// and tests/workflow/stop.test.js to call directly against a synthetic project/input, and for the
// CLI entry point below to call against the real one. Never throws — every path is fail-open.
function evaluateStop({ input, projectRoot }) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { exitCode: 0 };
    if (input.stop_hook_active === true) return { exitCode: 0 };
    const sessionId = input.session_id;
    if (typeof sessionId !== "string" || !sessionId.trim()) return { exitCode: 0 };
    if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) return { exitCode: 0 };

    const progressDir = path.join(projectRoot, "docs", "progress");
    let entries;
    try {
      entries = fs.readdirSync(progressDir, { withFileTypes: true });
    } catch (e) {
      return { exitCode: 0 }; // no docs/progress at all is normal (unbootstrapped or fast-lane-only project)
    }

    const bound = { count: 0 };
    const matches = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (++bound.count > MAX_GOALS_SCANNED) break; // bounded scan; never unbounded on a huge tree
      const goalDirectory = "docs/progress/" + entry.name;
      let loaded;
      try {
        loaded = workflowEvidence.loadWorkflow({ projectRoot, goalDirectory });
      } catch (e) {
        continue; // one unreadable/malformed goal never blocks evaluating the others
      }
      if (!loaded || loaded.status !== "valid") continue;
      const state = loaded.state;
      if (!state || !state.stopGuard || state.stopGuard.enabled !== true) continue;
      if (!state.execution || state.execution.disposition !== "running") continue;
      const identity = state.stopGuard.sessionIdentity;
      if (!identity || identity.value !== sessionId) continue;
      matches.push({ goalDirectory, state });
    }

    // Ambiguous (zero or more than one session-bound running goal) is explicitly a no-op — this
    // hook never guesses which goal a session means, per the decision's binding requirement.
    if (matches.length !== 1) return { exitCode: 0 };
    const { goalDirectory, state } = matches[0];

    const readiness = workflowEvidence.deriveReadiness({ projectRoot, goalDirectory, state });
    if (!readiness || !Array.isArray(readiness.outstanding)) return { exitCode: 0 };

    // Deliberately the narrowest possible class: a plain deterministic check, never run or last
    // failed. Never review/acceptance/integration/docs/dod (those need independent dispatch or a
    // human decision — out of scope for a hook forcing continuation), never STALE/LOCKED/PENDING/
    // DEFERRED/FINDING/UNKNOWN_BUDGET/UNKNOWN_OBLIGATION/ORPHAN (all of those are legitimate-stop
    // territory: they need inspection, more allowance, or a person's judgment, not a mechanical
    // rerun). The decision doc's own phrase "under existing permissions and remaining review
    // allowance" is not evidence that review-type OWED items are in scope — it guards against ever
    // implying a nudge could exceed budget, in case this scope is deliberately widened later; it
    // does not itself widen it here.
    //
    // An obligation can be OWED/FAILED (no current passing receipt) while ALSO having an unresolved
    // PENDING reservation already in flight for it — deriveReadiness reports both independently.
    // Forcing a rerun there would be exactly the ambiguous case this scope excludes: the orchestrator
    // (this session or another) may already be about to record evidence for that exact attempt, and
    // workflow-state.js's non-review reserve path has no duplicate-reservation guard, so a forced
    // rerun could mint a second, orphaned pending attempt. Treat any obligation with a pending
    // attempt as legitimate-stop, not forceable, regardless of its OWED/FAILED status.
    const pendingObligationIds = new Set(
      (Array.isArray(state.attempts) ? state.attempts : [])
        .filter((attempt) => attempt && attempt.status === "pending")
        .flatMap((attempt) => (Array.isArray(attempt.obligationIds) ? attempt.obligationIds : []))
    );
    const actionable = readiness.outstanding.find(
      (item) => item.kind === "check" && (item.code === "OWED" || item.code === "FAILED") && !pendingObligationIds.has(item.obligationId)
    );
    if (!actionable) return { exitCode: 0 };

    const base = actionable.nextAction || `Run the declared check for ${actionable.obligationId || "the owed obligation"}; record its actual result.`;
    const message = "Unfinished work: " + base + " This does not authorize a new review, deployment, or commit — only the already-owed check.";
    return { exitCode: 2, message };
  } catch (e) {
    return { exitCode: 0 };
  }
}

if (require.main === module) {
  try {
    let raw = "";
    try {
      raw = fs.readFileSync(0, "utf8");
    } catch (e) {
      process.exit(0);
    }
    let input;
    try {
      input = JSON.parse(raw);
    } catch (e) {
      process.exit(0);
    }
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || (typeof input.cwd === "string" ? input.cwd : path.join(__dirname, "..", ".."));
    const result = evaluateStop({ input, projectRoot });
    if (result && result.exitCode === 2) {
      try {
        process.stderr.write(result.message + "\n");
      } catch (e) {
        /* ignore */
      }
      process.exit(2);
    }
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
}

module.exports = { evaluateStop };
