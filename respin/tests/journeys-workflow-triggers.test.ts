// creator-ready Phase 2, T4/AC4/AC5 — the repeatable proof of the invariant
// `journeys-manual-or-nightly-only` and of the workflow's process discipline.
//
// PART A reads `.github/workflows/*.yml` AS TEXT with a small line reader (no
// YAML dependency exists in respin and none is added) and asserts: the
// journeys workflow's top-level `on:` is a non-empty BLOCK whose keys are a
// subset of {workflow_dispatch, schedule} containing workflow_dispatch (a flow
// sequence or a quoted `"on":` yields NO keys to a line reader, and an empty
// set is a subset of anything — so any unparseable form FAILS); its `journeys`
// job declares `environment: journeys` (the control) and the courtesy `if:`;
// and NO OTHER FILE in the directory names ANTHROPIC_API_KEY, declares
// `environment: journeys` or dumps `toJSON(secrets)` — the whole directory,
// read by a glob (CLAUDE.md non-negotiable 7). Every clause is proven against
// a planted in-memory variant that must fail.
//
// PART B extracts the ACTUAL `bootstrap`, `start` and `cleanup` shell from the
// workflow and runs it against synthetic Linux processes with no vendor key. Linux only:
// on other hosts it records NOT RUN, and the workflow itself runs this file
// with JOURNEYS_PROCESS_PROOF=required before its `start` step, so a skip
// there fails the job.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { uploadPathLines, workflowText, WORKFLOW_PATH } from "./journeys-upload-population";

const execFileAsync = promisify(execFile);
const workflowsDir = resolve(__dirname, "../../.github/workflows");
const JOURNEYS_FILE = "respin-journeys.yml";
/** The secret-free Playwright workflow; see `checkVisualWorkflow`. */
const VISUAL_FILE = "respin-visual.yml";

/**
 * Every workflow file this repository has, as a LIST (non-negotiable 7).
 *
 * The directory sweep below is a search; this is the population it searches.
 * Before, the check was `arrayContaining([...three names])` plus `length >= 3`,
 * which a fourth workflow satisfied by existing — so a new file entered the
 * repository with no statement of what it is allowed to do. Adding one is now
 * an edit here, and that edit is where somebody has to say which clauses the
 * new file answers to.
 */
const EVERY_WORKFLOW = ["cutdown.yml", JOURNEYS_FILE, VISUAL_FILE, "respin.yml"];

// ---------------------------------------------------------------------------
// The line reader.
// ---------------------------------------------------------------------------

/**
 * The entries of a top-level block (`on:`, `jobs:`) at indent 2. An entry this
 * reader cannot parse as a plain `name:` key is returned as `<unreadable@N>`,
 * never skipped: GitHub reads `"push":`, `? push`, `push :`, `"leak":` or a
 * flow one-liner as an ordinary key, so a reader that dropped them would be a
 * search wearing a list's name (B3-TEN-1; non-negotiable 7).
 */
const BLOCK_ENTRY = /^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*$/;

function topLevelBlockEntries(text: string, block: string): string[] | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const idx = lines.findIndex((l) => l === `${block}:`);
  if (idx < 0) return null; // `on: [...]`, `"on":`, `on: push` — none is a block this reader accepts
  const keys: string[] = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() === "" || l.trim().startsWith("#")) continue;
    if (/^\S/.test(l)) break;
    if (!/^ {2}\S/.test(l)) continue; // deeper lines belong to the entry above
    const m = BLOCK_ENTRY.exec(l);
    keys.push(m ? m[1] : `<unreadable@${i + 1}>`);
  }
  return keys;
}

/** Keys of the top-level `on:` block, or null when `on` is not a non-empty block. */
export function topLevelOnKeys(text: string): string[] | null {
  const keys = topLevelBlockEntries(text, "on");
  return keys && keys.length > 0 ? keys : null;
}

/**
 * Every line classified as YAML structure, a comment, or the BODY of a block
 * scalar (`key: |` / `key: >`). GitHub expands `${{ }}` in a `run:` body before
 * the shell sees it, so a `#` line inside a block scalar is shell text that can
 * still write a secret into the step's temp script (B2-TEN-2) — only a `#` line
 * OUTSIDE a block scalar is a comment to this reader. Anchors, aliases and ids
 * are likewise only meaningful on YAML lines.
 */
export type LineKind = "yaml" | "comment" | "block";
/** Any key spelling — `run:`, `"run":`, `'run':` — whose value is a block indicator opens a block (B3-TEN-2). */
const BLOCK_SCALAR_KEY = /^(\s*)(- )?\S.*?:\s*[|>][-+0-9]*\s*(#.*)?$/;

export function classifyLines(lines: readonly string[]): LineKind[] {
  const kinds: LineKind[] = [];
  let blockKeyColumn = -1; // column of the key that opened the current block scalar, or -1
  for (const l of lines) {
    const blank = l.trim() === "";
    const indent = l.length - l.trimStart().length;
    if (blockKeyColumn >= 0) {
      if (blank || indent > blockKeyColumn) {
        kinds.push("block");
        continue;
      }
      blockKeyColumn = -1;
    }
    if (blank || l.trim().startsWith("#")) {
      kinds.push("comment");
      continue;
    }
    kinds.push("yaml");
    const m = BLOCK_SCALAR_KEY.exec(l);
    if (m) blockKeyColumn = m[1].length + (m[2] ? 2 : 0);
  }
  return kinds;
}

/** The names of the top-level jobs (`  <name>:` under `jobs:`), in file order, unreadable entries included; null without a `jobs:` block. */
export function topLevelJobNames(text: string): string[] | null {
  return topLevelBlockEntries(text, "jobs");
}

/** The lines of one job (`  <name>:` under `jobs:`), dedented by nothing — raw. */
export function jobLines(text: string, job: string): string[] | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx < 0) return null;
  const start = lines.findIndex((l, i) => i > jobsIdx && l === `  ${job}:`);
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^ {2}\S/.test(l) || /^\S/.test(l)) break;
    out.push(l);
  }
  return out;
}

/** The `run: |` block of the step with `id: <id>`, dedented to a runnable script. */
export function stepRunBlock(text: string, id: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const idIdx = lines.findIndex((l) => l.trim() === `id: ${id}`);
  if (idIdx < 0) throw new Error(`no step with id: ${id}`);
  let runIdx = -1;
  for (let i = idIdx; i < lines.length; i += 1) {
    if (/^\s+run:\s*\|\s*$/.test(lines[i])) {
      runIdx = i;
      break;
    }
    if (i > idIdx && /^\s{6}- /.test(lines[i])) break; // next step
  }
  if (runIdx < 0) throw new Error(`step ${id} has no run: | block`);
  const runIndent = lines[runIdx].length - lines[runIdx].trimStart().length;
  const body: string[] = [];
  let bodyIndent = -1;
  for (let i = runIdx + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() === "") {
      body.push("");
      continue;
    }
    const ind = l.length - l.trimStart().length;
    if (ind <= runIndent) break;
    if (bodyIndent < 0) bodyIndent = ind;
    body.push(l.slice(bodyIndent));
  }
  return `${body.join("\n").trimEnd()}\n`;
}

/**
 * Any mention of the secrets context or the key's name on a non-comment line:
 * `secrets.X`, `secrets['X']`, `secrets.x` (secret names are case-insensitive),
 * `toJSON(secrets)`, `fromJSON(...)` over secrets, computed indexes — the CLASS,
 * not one spelling (B1-TEN-1). Only a `#` line OUTSIDE a block scalar is a
 * comment (`classifyLines`); a `#` line inside a `run: |` body is shell text
 * GitHub still expands (B2-TEN-2).
 */
const SENSITIVE_REF = /secrets|anthropic_api_key/i;
const STEP_START = /^ {6}-(\s|$)/;
/** A step's `id:` sits at the step-key column (8) or inline after the dash — nothing deeper (`with:`, a `run:` body) is an id (B2-TEN-4). */
const STEP_ID = /^ {8}id:\s*(\S+)\s*$|^ {6}- id:\s*(\S+)\s*$/;
/** Runner files and legacy commands an allowed step could relay the key through to every later step or action (B2-TEN-3; B3-TEN-4). */
const RUNNER_RELAY = /GITHUB_(ENV|OUTPUT|STATE|PATH)|::set-output|::save-state/;
/** YAML anchors, aliases and merge keys on a YAML line — after whitespace, `:`, `,`, `[` or `{` too (flow mappings, B3-TEN-4): a line reader cannot follow them, so the file refuses them (B2-TEN-4). */
const YAML_INDIRECTION = /(^|[\s:,[{])[&*][\w-]+|<<:/;
/** The third-party actions this file may use — a list, so a forked `x/upload-artifact` after cleanup is a violation, not a miss (B3 NOTE). */
/**
 * `environment:` under ANY key spelling GitHub accepts.
 *
 * WAS `environment:` LITERALLY, AND WAS EVADED BY ONE QUOTE CHARACTER
 * (batch-3 gate, security HIGH, proven by execution against this file's own
 * regexes). `"environment": journeys`, `'environment': journeys`,
 * `? environment / : journeys` and a flow-mapping job all produced ZERO
 * violations from both the directory-wide clause and the visual one, while
 * `environment: journeys` and `environment: staging` were caught — so the
 * class was open in exactly the shapes this file's own plant list already
 * knew GitHub accepts for JOB names (`"leak":`, `'leak':`, `leak :`, a flow
 * one-liner). The plants covered a quoted VALUE and never a quoted KEY, so
 * the hole sat in the gap between two plants that looked like they covered it.
 *
 * CLAUDE.md 2026-08-18: prove the property against the class, never against a
 * list of counterexamples.
 *
 * BUILT WITH `String.raw`, DELIBERATELY. The first draft used a plain template
 * literal, in which `\s` is not an escape and collapses to a bare `s` — the
 * silent fail-open shape CLAUDE.md records at 2026-08-26 ("one lost backslash
 * turns `\s` into `s`"). `String.raw` keeps every backslash, and the plants
 * below prove the assembled pattern still catches its controls.
 */
const ENV_KEY = String.raw`["']?environment["']?[ \t]*:`;

const ALLOWED_ACTIONS = ["actions/checkout", "actions/setup-node", "actions/upload-artifact", "pnpm/action-setup"];

export type StepRecord = { id: string | null; start: number; end: number; lines: string[] };

/** The steps of a job (its raw lines) with their `id:`; a step without one has `id: null`. */
export function jobSteps(jobLinesRaw: readonly string[]): StepRecord[] {
  const kinds = classifyLines(jobLinesRaw);
  const starts: number[] = [];
  jobLinesRaw.forEach((l, i) => {
    if (kinds[i] === "yaml" && STEP_START.test(l)) starts.push(i);
  });
  return starts.map((start, k) => {
    const end = starts[k + 1] ?? jobLinesRaw.length;
    const lines = jobLinesRaw.slice(start, end);
    let id: string | null = null;
    for (let i = start; i < end && id === null; i += 1) {
      if (kinds[i] !== "yaml") continue;
      const m = STEP_ID.exec(jobLinesRaw[i]);
      if (m) id = m[1] ?? m[2];
    }
    return { id, start, end, lines };
  });
}

/**
 * The step ids that reference the secrets context or the key's name, attributed
 * by `id:` ONLY — a step name is mutable text GitHub does not keep unique, an id
 * is rejected at parse when duplicated (B1-TEN-2). A reference outside any step
 * is `<job-level>`; a referencing step without an id is `<step-without-id@N>`.
 */
export function keyReferencingSteps(jobLinesRaw: readonly string[]): string[] {
  const steps = jobSteps(jobLinesRaw);
  const kinds = classifyLines(jobLinesRaw);
  const names = new Set<string>();
  jobLinesRaw.forEach((l, i) => {
    if (kinds[i] === "comment" || !SENSITIVE_REF.test(l)) return;
    const step = steps.find((st) => st.start <= i && i < st.end);
    if (!step) names.add("<job-level>");
    else names.add(step.id ?? `<step-without-id@${step.start}>`);
  });
  return [...names].sort();
}

/** Every step must carry a unique `id:` so attribution can never fall back to a name. */
export function stepIdProblems(jobLinesRaw: readonly string[]): string[] {
  const steps = jobSteps(jobLinesRaw);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const st of steps) {
    if (!st.id) problems.push(`step at job line ${st.start} has no id:`);
    else if (seen.has(st.id)) problems.push(`duplicate step id ${st.id}`);
    else seen.set(st.id, st.start);
  }
  return problems;
}

/**
 * The key must not FLOW out of the steps allowed to name it (B2-TEN-3): a
 * key-bearing step may not write the runner's relay files (`GITHUB_ENV` would
 * make it job-wide for every later step and third-party action; `GITHUB_OUTPUT`
 * would hand it to any `steps.<id>.outputs` reader), and no line in the job may
 * read a key-bearing step's outputs.
 */
export function keyFlowProblems(jobLinesRaw: readonly string[], keyBearing: readonly string[]): string[] {
  const steps = jobSteps(jobLinesRaw);
  const kinds = classifyLines(jobLinesRaw);
  const problems: string[] = [];
  for (const st of steps) {
    if (!st.id || !keyBearing.includes(st.id)) continue;
    st.lines.forEach((l, k) => {
      if (kinds[st.start + k] !== "comment" && RUNNER_RELAY.test(l)) problems.push(`key-bearing step ${st.id} writes a runner relay file: ${l.trim()}`);
    });
  }
  // dot form, bracket form (`steps['start']`, `steps["start"]`) and a whole-context dump (`toJSON(steps)`) — B3-TEN-4
  const ids = keyBearing.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const outputsRef = new RegExp(`steps\\s*(?:\\.|\\[\\s*['"])(?:${ids})(?:['"]\\s*\\])?\\s*\\.outputs|tojson\\s*\\(\\s*steps\\s*\\)`, "i");
  jobLinesRaw.forEach((l, i) => {
    if (kinds[i] !== "comment" && keyBearing.length > 0 && outputsRef.test(l)) problems.push(`a step reads a key-bearing step's outputs: ${l.trim()}`);
  });
  return problems;
}

/** YAML lines with an unbalanced `"` or `'`: a quoted scalar continuing onto the next line is invisible to a line reader, so the file refuses the shape (B3-TEN-2). */
export function unbalancedQuoteLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kinds = classifyLines(lines);
  return lines.filter((l, i) => {
    if (kinds[i] !== "yaml") return false;
    const code = l.replace(/\s#.*$/, "");
    return (code.match(/"/g) ?? []).length % 2 === 1 || (code.match(/'/g) ?? []).length % 2 === 1;
  });
}

/** The `owner/repo` of every `uses:` on a YAML line, in file order. */
export function usedActions(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kinds = classifyLines(lines);
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (kinds[i] !== "yaml") return;
    const m = /^\s*(?:- )?uses:\s*(\S+?)@/.exec(l);
    if (m) out.push(m[1]);
    else if (/^\s*(?:- )?uses:/.test(l)) out.push(`<unreadable@${i + 1}>`);
  });
  return out;
}

/** YAML lines (never block-scalar bodies, where `2>&1` and globs are shell) carrying an anchor, alias or merge key. */
export function yamlIndirectionLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kinds = classifyLines(lines);
  return lines.filter((l, i) => kinds[i] === "yaml" && YAML_INDIRECTION.test(l));
}

export type WorkflowViolation = string;

/** The whole invariant over a directory's worth of workflow files (name -> text). */
export function checkWorkflowSet(files: Record<string, string>): WorkflowViolation[] {
  const v: WorkflowViolation[] = [];
  const journeys = files[JOURNEYS_FILE];
  if (!journeys) return [`${JOURNEYS_FILE} is missing`];
  const keys = topLevelOnKeys(journeys);
  if (!keys) v.push("`on:` is not a non-empty block (flow form, quoted key, or absent)");
  else {
    if (!keys.includes("workflow_dispatch")) v.push("`on:` lacks workflow_dispatch");
    for (const k of keys) if (k !== "workflow_dispatch" && k !== "schedule") v.push(`\`on:\` carries a forbidden trigger: ${k}`);
  }
  // The file's job POPULATION is a list (non-negotiable 7): GitHub issues the
  // Environment secret to ANY job that declares the environment, so a third job
  // would receive the key with none of the controls below (B2-TEN-1).
  const jobNames = topLevelJobNames(journeys);
  const expectedJobs = ["journeys", "no-repository-secret"];
  if (!jobNames) v.push("no `jobs:` block");
  else if ([...jobNames].sort().join("|") !== expectedJobs.join("|")) v.push(`the file's jobs are [${jobNames.join(", ")}]; allowed exactly [${expectedJobs.join(", ")}]`);
  // A line reader cannot follow anchors, aliases or merge keys, so the file may not use them (B2-TEN-4).
  for (const l of yamlIndirectionLines(journeys)) v.push(`YAML anchor/alias/merge key is not readable here: ${l.trim()}`);
  for (const l of unbalancedQuoteLines(journeys)) v.push(`a quoted scalar continuing past its line is not readable here: ${l.trim()}`);
  // the actions the file may use are a list; anything else (a forked upload-artifact, a new publisher) is a violation
  for (const a of usedActions(journeys)) if (!ALLOWED_ACTIONS.includes(a)) v.push(`uses an action outside the allowed list: ${a}`);
  // the repo root has no package.json: every pnpm invocation names the workspace (G-1, batch-3 final)
  {
    const lines = journeys.split("\n");
    const kinds = classifyLines(lines);
    lines.forEach((l, i) => {
      if (kinds[i] !== "comment" && /(^|\s)pnpm\s/.test(l) && !/pnpm -C respin /.test(l)) v.push(`a pnpm call without -C respin (the repo root has no package.json): ${l.trim()}`);
    });
  }
  const job = jobLines(journeys, "journeys");
  if (!job) v.push("no `journeys` job");
  else {
    if (!job.some((l) => l.trim() === "environment: journeys")) v.push("`journeys` job does not declare `environment: journeys`");
    if (!job.some((l) => l.trim() === "if: github.ref == 'refs/heads/main'")) v.push("`journeys` job lacks the courtesy main guard");
    // the vendor key is never job-level env: only steps may carry it
    const envIdx = job.findIndex((l) => l === "    env:");
    if (envIdx >= 0) {
      for (let i = envIdx + 1; i < job.length && /^ {6}\S/.test(job[i]); i += 1) {
        if (job[i].includes("ANTHROPIC_API_KEY")) v.push("ANTHROPIC_API_KEY is job-level env; it must be step-level on `start` only");
      }
    }
    // ...and every step-level reference is ATTRIBUTED to its step: exactly the
    // issued-check and `start`, never Install/bootstrap/a third-party action
    // (B0-TEN-1: a count of occurrences let a key moved onto Install pass).
    for (const p of stepIdProblems(job)) v.push(`journeys: ${p}`);
    const steps = keyReferencingSteps(job);
    const expected = ["start", "vendor-key"];
    if (steps.join("|") !== expected.join("|")) {
      v.push(`the secrets context / ANTHROPIC_API_KEY is referenced by steps [${steps.join(", ")}]; allowed exactly [${expected.join(", ")}]`);
    }
    // ...and the key never FLOWS out of those steps through the runner's relay files or their outputs (B2-TEN-3)
    for (const p of keyFlowProblems(job, [...new Set([...expected, ...steps])])) v.push(`journeys: ${p}`);
    // The dev-scope audit, blocking, before any dependency code runs and so
    // before the key is issued to any step (P9-A3, register item 38).
    {
      const all = jobSteps(job);
      const at = (id: string) => all.findIndex((st) => st.id === id);
      const devAudit = at("dev-audit");
      if (devAudit < 0) v.push("journeys: no `dev-audit` step — the job that holds the vendor key runs devDependencies no blocking audit has read");
      else {
        if (!all[devAudit].lines.some((l) => l.trim() === JOURNEYS_DEV_AUDIT_RUN)) {
          v.push(`journeys: the dev-audit step does not run exactly \`${JOURNEYS_DEV_AUDIT_RUN.slice(5)}\` (dev scope: no --prod)`);
        }
        if (all[devAudit].lines.some((l) => /continue-on-error|\|\|\s*true/.test(l) || /^\s+if:/.test(l))) {
          v.push("journeys: the dev-audit step is conditional or non-blocking");
        }
        for (const later of ["install", "vendor-key", "start"]) {
          const i = at(later);
          if (i < 0 || i < devAudit) v.push(`journeys: dev-audit must run before \`${later}\``);
        }
      }
    }
    // an unconditional upload is a violation: every upload-artifact step is gated on cleanup's output
    for (let i = 0; i < job.length; i += 1) {
      if (!/uses: actions\/upload-artifact@/.test(job[i])) continue;
      const window = job.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!/if: always\(\) && steps\.cleanup\.outputs\.safe_to_upload == 'true'/.test(window)) v.push("an upload-artifact step is not gated on steps.cleanup.outputs.safe_to_upload");
    }
  }
  const canary = jobLines(journeys, "no-repository-secret");
  if (!canary) v.push("no `no-repository-secret` canary job");
  else {
    if (canary.some((l) => /^\s+environment:/.test(l))) v.push("the canary job must not declare an environment");
    for (const p of stepIdProblems(canary)) v.push(`canary: ${p}`);
    const refs = keyReferencingSteps(canary);
    if (refs.join("|") !== "canary") v.push(`canary job references the secrets context from [${refs.join(", ")}]; allowed exactly [canary]`);
    for (const p of keyFlowProblems(canary, [...new Set(["canary", ...refs])])) v.push(`canary: ${p}`);
  }
  if (job && !job.some((l) => l.trim() === "needs: no-repository-secret")) v.push("`journeys` does not `needs:` the canary — a run with a repository secret would still spend");
  for (const [name, text] of Object.entries(files)) {
    if (name === JOURNEYS_FILE) continue; // its own lines are attributed step by step above
    const lines = text.split("\n");
    const kinds = classifyLines(lines);
    const code = lines.filter((_, i) => kinds[i] !== "comment").join("\n");
    if (/anthropic_api_key/i.test(code)) v.push(`${name} names ANTHROPIC_API_KEY`);
    // block form `environment: journeys`, quoted, flow mapping `{name: journeys}`, and mapping form `environment:` + `name: journeys` (B2 Info; B3-TEN-3)
    if (new RegExp(String.raw`${ENV_KEY}\s*["']?journeys["']?\s*(#.*)?$|${ENV_KEY}\s*\{[^}]*name:\s*["']?journeys|${ENV_KEY}[ \t]*\n(?:[ \t]+[\w-]+:.*\n)*?[ \t]+name:\s*["']?journeys`, "m").test(code)) v.push(`${name} declares environment: journeys`);
    if (/tojson\s*\(\s*secrets\s*\)|fromjson\s*\([^)]*secrets|secrets\s*\[|secrets\.\*/i.test(code)) v.push(`${name} dumps or indexes the secrets context`);
  }
  if (files["respin.yml"] && /playwright/i.test(files["respin.yml"])) v.push("respin.yml contains a journeys job (playwright)");
  // THE CLAUSE THAT MAKES EVERY CLAUSE ABOVE REACHABLE (batch-3 gate, security
  // HIGH). This whole invariant is enforced by ONE vitest file, which runs in
  // CI only inside `respin.yml`'s gate job. That job's `paths:` filter named
  // `respin/**` and `.github/workflows/respin.yml` — so a pull request that
  // added `.github/workflows/leak.yml` with the vendor key, or that weakened
  // this file, touched nothing under the filter and ran NO guard at all. The
  // population list a few lines up made that sharper rather than safer: the
  // fifth workflow would have reddened on some later, unrelated `respin/**`
  // change, attributing the failure to the wrong pull request.
  if (files["respin.yml"] && !/^ {6}- "\.github\/workflows\/\*\*"$/m.test(files["respin.yml"])) {
    v.push("respin.yml does not run on workflow-file changes, so nothing in this file gates a workflow-only pull request");
  }
  v.push(...checkVisualWorkflow(files));
  v.push(...checkRespinWorkflow(files));
  return v;
}

/**
 * The SECRET-FREE Playwright workflow (visual-v2 phase-1 gate, 2026-09-20).
 *
 * THE PROBLEM IT ANSWERS. A client-rendered duplicate of the shell foot
 * survives the whole vitest suite — `renderToStaticMarkup` never runs effects,
 * so two `shell-credits` in the live DOM leave 5,445 tests green. The only
 * automated guard is the visual matrix, and nothing in CI ran it. Adding the
 * step to `respin.yml` trips the clause directly above, because Playwright in
 * the push/pull_request code gate is how the vendor-SPENDING journeys job
 * would arrive on every PR.
 *
 * SO THE INVARIANT IS RESTATED RATHER THAN WEAKENED: the thing forbidden
 * outside `respin-journeys.yml` is the SECRET and the SPEND, never the
 * browser. `respin-visual.yml` may run Playwright precisely because the
 * clauses below hold it to neither — and they are clauses, not a comment, so
 * a later edit that gives that file a key, an environment, or any read of the
 * secrets context is a red test rather than a reviewer's catch.
 *
 * The last clause is the POSITIVE half, and it is the one the CLAUDE.md
 * 2026-08-26 lesson exists for: without it, deleting the `pnpm
 * test:e2e:visual` step leaves every ban above satisfied by a workflow that
 * guards nothing at all.
 */
export function checkVisualWorkflow(files: Record<string, string>): WorkflowViolation[] {
  const v: WorkflowViolation[] = [];
  const visual = files[VISUAL_FILE];
  if (!visual) return [`${VISUAL_FILE} is missing — no CI step runs the visual matrix`];
  const lines = visual.split("\n");
  const kinds = classifyLines(lines);
  const code = lines.filter((_, i) => kinds[i] !== "comment").join("\n");
  // NOT just the vendor key: this file reads NOTHING from the secrets context,
  // so there is no value in it for a later edit to widen.
  if (/secrets\s*[.[]|secrets\s*\*|tojson\s*\(\s*secrets|fromjson\s*\([^)]*secrets/i.test(code)) {
    v.push(`${VISUAL_FILE} reads the secrets context; it is the secret-free Playwright workflow`);
  }
  // ANY key spelling. `/^\s+environment:/m` was evaded by `"environment":`.
  if (new RegExp(String.raw`^\s*(- )?${ENV_KEY}`, "m").test(code)) {
    v.push(`${VISUAL_FILE} declares an environment; GitHub would issue it that environment's secrets`);
  }
  // THE JOB POPULATION IS A LIST, exactly as the journeys file's is and for
  // the same reason (non-negotiable 7). Without it a SECOND job — including a
  // flow-mapping one-liner the line reader cannot parse, which is how the
  // environment ban was bypassed — answers to none of the clauses here.
  const jobNames = topLevelJobNames(visual);
  if (!jobNames) v.push(`${VISUAL_FILE}: no \`jobs:\` block`);
  else if ([...jobNames].sort().join("|") !== "visual") {
    v.push(`${VISUAL_FILE}: jobs are [${jobNames.join(", ")}]; allowed exactly [visual]`);
  }
  // ...and the shapes a line reader cannot follow are refused outright here
  // too, which is what closes the flow-mapping and anchor classes rather than
  // the individual spellings.
  for (const l of yamlIndirectionLines(visual)) v.push(`${VISUAL_FILE}: YAML anchor/alias/merge key is not readable here: ${l.trim()}`);
  for (const l of unbalancedQuoteLines(visual)) v.push(`${VISUAL_FILE}: a quoted scalar continuing past its line is not readable here: ${l.trim()}`);
  // The actions are a list, and each is pinned by a 40-hex SHA — the same two
  // rules the journeys file carries. A floating `@v4` in the one workflow that
  // executes untrusted fork code is a supply-chain path (tj-actions, 2025).
  for (const a of usedActions(visual)) if (!ALLOWED_ACTIONS.includes(a)) v.push(`${VISUAL_FILE} uses an action outside the allowed list: ${a}`);
  for (const l of visual.split("\n").filter((l) => /^\s+-?\s*uses:/.test(l))) {
    if (!/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}( #.*)?$/.test(l)) v.push(`${VISUAL_FILE}: action is not pinned by a 40-hex commit SHA: ${l.trim()}`);
  }
  // A job-level `uses:` points at a reusable workflow whose text is OUTSIDE
  // the directory this guard reads — the guard's whole population model. It is
  // refused rather than inspected.
  if (/^ {4}uses:/m.test(code)) v.push(`${VISUAL_FILE} calls a reusable workflow; its text is outside the swept directory`);
  // The token floor, pinned. Deleting the block reads as cleanup in review and
  // silently reverts to whatever the repository default grants.
  if (!/^permissions:\n {2}contents: read\n/m.test(code)) {
    v.push(`${VISUAL_FILE} does not pin \`permissions: contents: read\``);
  }
  const on = topLevelBlockEntries(visual, "on");
  if (!on) v.push(`${VISUAL_FILE}: \`on:\` is not a readable block`);
  else if ([...on].sort().join("|") !== "pull_request|push") {
    v.push(`${VISUAL_FILE}: \`on:\` is [${on.join(", ")}]; it is the PR gate and must be exactly [push, pull_request]`);
  }
  // THE TRIGGER SCOPE, not just the trigger names. `on:` staying [push,
  // pull_request] while `paths:` became `docs/**` would leave every clause
  // here green with the matrix never running on a code change — which is
  // precisely what the positive half below exists to prevent.
  const pathEntries = visual.split("\n").filter((l) => /^ {6}- "/.test(l)).map((l) => l.trim());
  const expectedPaths = ['- "respin/**"', '- ".github/workflows/respin-visual.yml"'];
  if (pathEntries.join("|") !== [...expectedPaths, ...expectedPaths].join("|")) {
    v.push(`${VISUAL_FILE}: \`paths:\` is [${pathEntries.join(", ")}]; both triggers must scope to exactly ${expectedPaths.join(" + ")}`);
  }
  if (!/pnpm test:e2e:visual/.test(code)) {
    v.push(`${VISUAL_FILE} does not run \`pnpm test:e2e:visual\` — every ban above is satisfied by a workflow that guards nothing`);
  }
  if (!/playwright install/.test(code)) {
    v.push(`${VISUAL_FILE} installs no browser; the matrix would fail for an environment reason, not a product one`);
  }
  return v;
}

/** The blocking audit line `respin.yml` must carry, exactly (P9-A3). */
export const RESPIN_AUDIT_RUN = "run: pnpm audit --audit-level high --prod";
/** Its condition: run after a red earlier step, but not on a cancelled run (gate round 1). */
export const RESPIN_AUDIT_CONDITION = "if: ${{ !cancelled() }}";
/** The dev-scope audit line the journeys job must carry, exactly (P9-A3). */
export const JOURNEYS_DEV_AUDIT_RUN = "run: pnpm -C respin audit --audit-level high";

/**
 * THE CODE GATE'S AUDIT HAS A WITNESS (P9-A3, register 2026-10-05 item 13).
 *
 * Before this, deleting `respin.yml`'s blocking audit step left the whole suite
 * green, and `respin.yml` — the one workflow that runs on every push and pull
 * request — answered to none of the SHA-pin and token-floor rules this file
 * already applied to the visual workflow. Each clause below is planted red in
 * the `planted variants` table.
 */
export function checkRespinWorkflow(files: Record<string, string>): WorkflowViolation[] {
  const name = "respin.yml";
  const text = files[name];
  if (!text) return [`${name} is missing — the code gate and its dependency audit do not exist`];
  const v: WorkflowViolation[] = [];
  const lines = text.split("\n");
  const kinds = classifyLines(lines);
  const code = lines.filter((_, i) => kinds[i] !== "comment").join("\n");
  if (!/^permissions:\n {2}contents: read\n/m.test(code)) {
    v.push(`${name} does not pin \`permissions: contents: read\``);
  }
  const used = usedActions(text);
  if (used.length === 0) v.push(`${name}: no \`uses:\` line was read — the pin check would be vacuous`);
  for (const a of used) if (!ALLOWED_ACTIONS.includes(a)) v.push(`${name} uses an action outside the allowed list: ${a}`);
  lines.forEach((l, i) => {
    if (kinds[i] !== "yaml" || !/^\s+-?\s*uses:/.test(l)) return;
    if (!/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}( #.*)?$/.test(l)) v.push(`${name}: action is not pinned by a 40-hex commit SHA: ${l.trim()}`);
  });
  for (const l of yamlIndirectionLines(text)) v.push(`${name}: YAML anchor/alias/merge key is not readable here: ${l.trim()}`);
  const on = topLevelBlockEntries(text, "on");
  if (!on) v.push(`${name}: \`on:\` is not a readable block`);
  else if ([...on].sort().join("|") !== "pull_request|push|schedule") {
    v.push(`${name}: \`on:\` is [${on.join(", ")}]; it must be exactly [push, pull_request, schedule] — the schedule is what sees a newly published advisory`);
  }
  if (!/^ {4}- cron: "[^"]+"\s*$/m.test(code)) v.push(`${name}: the schedule carries no \`- cron:\` entry`);
  const job = jobLines(text, "gate");
  if (!job) v.push(`${name}: no \`gate\` job`);
  else {
    // A JOB-level `continue-on-error` makes every step in the job, the audit
    // included, unable to fail the run (gate round 1). Steps sit at 6 spaces,
    // so a 4-space key is the job's own.
    if (job.some((l) => /^ {4}continue-on-error\s*:/.test(l))) {
      v.push(`${name}: the gate job sets continue-on-error, so the blocking audit cannot fail the run`);
    }
    const audit = jobSteps(job).filter((st) => st.lines.some((l) => l.trim() === RESPIN_AUDIT_RUN));
    if (audit.length !== 1) {
      v.push(`${name}: ${audit.length} steps run \`${RESPIN_AUDIT_RUN.slice(5)}\`; the blocking audit step must exist exactly once`);
    } else {
      const step = audit[0];
      if (!step.lines.some((l) => l.trim() === RESPIN_AUDIT_CONDITION)) {
        v.push(`${name}: the blocking audit step lacks \`${RESPIN_AUDIT_CONDITION}\`, so any earlier red step skips it`);
      }
      if (step.lines.some((l) => /continue-on-error/.test(l) || /\|\|\s*true/.test(l))) {
        v.push(`${name}: the blocking audit step is made non-blocking`);
      }
    }
  }
  if (/ignoreCves/.test(text)) v.push(`${name} names \`ignoreCves\`; the mechanism in use is \`pnpm.auditConfig.ignoreGhsas\``);
  if (!/ignoreGhsas/.test(text)) v.push(`${name} does not name \`ignoreGhsas\` where it explains the exception process`);
  return v;
}

/** A `YYYY-MM-DD` in UTC. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * EVERY IGNORED ADVISORY HAS A ROW, AND NO ROW HAS LAPSED (P9-A3).
 *
 * `respin/package.json`'s `pnpm.auditConfig.ignoreGhsas` against the table
 * under `SECURITY-EXCEPTIONS.md`'s `## Active exceptions` heading, both ways:
 * an ignored id with no row is an unreviewed exception, and a row whose id is
 * no longer ignored is a stale one. Each row's `Review by` date must not have
 * passed — the file's previous trigger ("M2 entry") fired on 2026-08-19 and
 * nothing noticed for seven weeks, because a trigger written in prose has no
 * reader. This test is that reader, and with `respin.yml`'s daily schedule a
 * lapsed date turns CI red on the day.
 */
export function exceptionProblems(packageJsonText: string, exceptionsText: string, today: string): string[] {
  const p: string[] = [];
  const pkg = JSON.parse(packageJsonText) as { pnpm?: { auditConfig?: { ignoreGhsas?: unknown } } };
  const raw = pkg.pnpm?.auditConfig?.ignoreGhsas;
  const ignored = Array.isArray(raw) ? raw.map(String) : [];
  if (!Array.isArray(raw)) p.push("package.json has no pnpm.auditConfig.ignoreGhsas array");
  const lines = exceptionsText.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^## Active exceptions\b/.test(l));
  if (start < 0) return [...p, "SECURITY-EXCEPTIONS.md has no `## Active exceptions` section"];
  const tableLines: string[] = [];
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]); i += 1) {
    if (/^\|/.test(lines[i])) tableLines.push(lines[i]);
  }
  const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  const header = tableLines[0] ? cells(tableLines[0]) : [];
  const reviewCol = header.findIndex((c) => /^review by$/i.test(c));
  if (reviewCol < 0) return [...p, "the Active exceptions table has no `Review by` column"];
  const rows = new Map<string, string>();
  for (const l of tableLines.slice(2)) {
    const c = cells(l);
    const id = /`?(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})`?/.exec(c[0] ?? "")?.[1];
    if (!id) {
      p.push(`an Active exceptions row does not start with a GHSA id: ${l.trim()}`);
      continue;
    }
    if (rows.has(id)) p.push(`${id} has two Active exceptions rows`);
    rows.set(id, c[reviewCol] ?? "");
  }
  for (const id of ignored) {
    const review = rows.get(id);
    if (review === undefined) {
      p.push(`${id} is in ignoreGhsas with no Active exceptions row — an unreviewed exception`);
      continue;
    }
    const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(review)?.[1];
    if (!date) p.push(`${id}'s Review by cell carries no YYYY-MM-DD date: "${review}"`);
    else if (date < today) p.push(`${id}'s review-by date ${date} has passed (today ${today}) — re-review it, record the miss, and set a new date`);
  }
  for (const id of rows.keys()) if (!ignored.includes(id)) p.push(`${id} has an Active exceptions row but is not in ignoreGhsas — a stale row`);
  return p;
}

function readWorkflowSet(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    out[name] = readFileSync(join(workflowsDir, name), "utf8").replace(/\r\n/g, "\n");
  }
  return out;
}

// ---------------------------------------------------------------------------
// PART A — text invariants.
// ---------------------------------------------------------------------------

describe("respin-journeys.yml: manual-or-nightly only, environment-protected key (AC4)", () => {
  const files = readWorkflowSet();
  const text = files[JOURNEYS_FILE];

  it("the directory read is not vacuous, and the file population is exactly the declared list", () => {
    expect(Object.keys(files).sort()).toEqual([...EVERY_WORKFLOW].sort());
  });

  it("the visual workflow is Playwright with no secret, no environment and a matrix step that really runs", () => {
    expect(checkVisualWorkflow(files)).toEqual([]);
    // Non-vacuous from the other side: the file really is the Playwright one.
    expect(files[VISUAL_FILE]).toMatch(/playwright/i);
    // ...and `respin.yml` is still NOT, which is the clause this file exists
    // beside rather than instead of.
    expect(files["respin.yml"]).not.toMatch(/playwright/i);
  });

  it("the real directory satisfies every clause", () => {
    expect(checkWorkflowSet(files)).toEqual([]);
    expect(topLevelOnKeys(text)).toEqual(["workflow_dispatch"]);
  });

  it("the secrets context / key name is referenced by exactly the `vendor-key` and `start` step ids, and by `canary` in its own job; every step has a unique id", () => {
    const job = jobLines(text, "journeys")!;
    expect(keyReferencingSteps(job)).toEqual(["start", "vendor-key"]);
    expect(stepIdProblems(job)).toEqual([]);
    expect(jobSteps(job).length).toBeGreaterThanOrEqual(16);
    const canary = jobLines(text, "no-repository-secret")!;
    expect(keyReferencingSteps(canary)).toEqual(["canary"]);
    expect(stepIdProblems(canary)).toEqual([]);
    // the attribution is non-vacuous and class-wide, not one spelling
    expect(keyReferencingSteps(["    env:", "      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}"])).toEqual(["<job-level>"]);
    const step = (body: string) => ["      - name: x", "        id: x", `        run: ${body}`];
    for (const shape of ["${{ secrets['ANTHROPIC_API_KEY'] }}", "${{ secrets.anthropic_api_key }}", "${{ toJSON(secrets) }}", "${{ fromJSON(toJSON(secrets)).k }}", "echo $ANTHROPIC_API_KEY", "${{secrets.ANTHROPIC_API_KEY}}"]) {
      expect(keyReferencingSteps(step(shape)), shape).toEqual(["x"]);
    }
    expect(keyReferencingSteps(["      - name: x", "        run: echo ${{ secrets.ANTHROPIC_API_KEY }}"])).toEqual(["<step-without-id@0>"]);
    expect(keyReferencingSteps(["      -", "        id: y", "        run: echo ${{ secrets.ANTHROPIC_API_KEY }}"])).toEqual(["y"]);
    expect(keyReferencingSteps(["      - name: x", "        id: x", "        # ANTHROPIC_API_KEY in a comment only"])).toEqual([]);
    // a `#` line INSIDE a run body is shell GitHub still expands, never a comment (B2-TEN-2)
    expect(keyReferencingSteps(["      - name: x", "        id: x", "        run: |", "          # ${{ toJSON(secrets) }}", "          pnpm install"])).toEqual(["x"]);
    expect(keyReferencingSteps(["      - name: x", "        id: x", "        run: >-", "          # $ANTHROPIC_API_KEY"])).toEqual(["x"]);
    expect(classifyLines(["        run: |", "          # body", "", "          more", "        # yaml comment", "      - id: y"])).toEqual(["yaml", "block", "block", "block", "comment", "yaml"]);
    // an `id:` deeper than the step-key column is not the step's id (B2-TEN-4)
    expect(jobSteps(["      - uses: a/b@c", "        with:", "          id: start", "        env:", "          K: ${{ secrets.X }}"]).map((s) => s.id)).toEqual([null]);
    expect(jobSteps(["      - id: inline", "        run: |", "          id: fake"]).map((s) => s.id)).toEqual(["inline"]);
    expect(jobSteps(["      - run: |", "          id: fake", "        id: real"]).map((s) => s.id)).toEqual(["real"]);
    // the file's job population and YAML indirection (B2-TEN-1, B2-TEN-4)
    expect(topLevelJobNames(text)).toEqual(["no-repository-secret", "journeys"]);
    expect(topLevelJobNames("on:\n  push:\njobs:\n  a:\n    steps: []\n  b-2:\n    x: y\n")).toEqual(["a", "b-2"]);
    // an entry the reader cannot parse is REPORTED, never skipped (B3-TEN-1)
    expect(topLevelJobNames('jobs:\n  a:\n    x: y\n  "leak":\n    x: y\n  leak2: # x\n  leak3 :\n  leak4: {runs-on: u}\n')).toEqual(["a", "<unreadable@4>", "<unreadable@6>", "<unreadable@7>", "<unreadable@8>"]);
    expect(topLevelOnKeys('on:\n  workflow_dispatch:\n  "push":\n  ? pull_request\n  push :\n')).toEqual(["workflow_dispatch", "<unreadable@3>", "<unreadable@4>", "<unreadable@5>"]);
    expect(yamlIndirectionLines(text)).toEqual([]);
    expect(yamlIndirectionLines("a:\n  env: &k\n    X: 1\n  e2: *k\n  m:\n    <<: *k\n  run: |\n    x 2>&1 | grep '*'\n  if: a && b\n  f: {\"K\":*v}\n  g: [&w x]\n").map((l) => l.trim())).toEqual(["env: &k", "e2: *k", "<<: *k", 'f: {"K":*v}', "g: [&w x]"]);
    // quoted keys still open a block; an unbalanced quote is refused (B3-TEN-2)
    expect(classifyLines(['        "run": |', "          # body", "        id: x"])).toEqual(["yaml", "block", "yaml"]);
    expect(classifyLines(["        'run': >-", "          # body"])).toEqual(["yaml", "block"]);
    expect(unbalancedQuoteLines(text)).toEqual([]);
    expect(unbalancedQuoteLines('a:\n  run: "x &&\n    # y"\n  b: \'ok\'\n  c: it\'s\n  d: x # don\'t\n').map((l) => l.trim())).toEqual(['run: "x &&', "c: it's"]);
    // the actions used are a list (B3 NOTE)
    expect(usedActions(text)).toEqual(["actions/checkout", "pnpm/action-setup", "actions/setup-node", "actions/upload-artifact", "actions/upload-artifact"]);
    expect(usedActions("      - uses: foo/upload-artifact@abc\n      - uses: bar\n")).toEqual(["foo/upload-artifact", "<unreadable@2>"]);
    // the key never flows out through the runner's relay files or a key-bearing step's outputs (B2-TEN-3)
    expect(keyFlowProblems(job, ["start", "vendor-key"])).toEqual([]);
    expect(keyFlowProblems(["      - id: start", "        run: |", '          echo "K=$ANTHROPIC_API_KEY" >> "$GITHUB_ENV"'], ["start"])).toHaveLength(1);
    expect(keyFlowProblems(["      - id: start", "        run: echo k=1 >> $GITHUB_OUTPUT", "      - id: run", "        env:", "          K: ${{ steps.start.outputs.k }}"], ["start"])).toHaveLength(2);
    expect(keyFlowProblems(["      - id: start", "        run: |", '          # GITHUB_ENV named in a body comment is still shell text', "      - id: other", "        run: echo x >> $GITHUB_ENV"], ["start"])).toHaveLength(1);
    // legacy command relay, bracket-form reads and a whole-context dump (B3-TEN-4)
    expect(keyFlowProblems(["      - id: start", '        run: echo "::set-output name=k::$ANTHROPIC_API_KEY"', "      - id: run", "        env:", "          K: ${{ steps['start'].outputs.k }}"], ["start"])).toHaveLength(2);
    expect(keyFlowProblems(["      - id: run", '        env: { K: ${{ steps["vendor-key"].outputs.k }} }'], ["start", "vendor-key"])).toHaveLength(1);
    expect(keyFlowProblems(["      - id: run", "        env:", "          ALL: ${{ toJSON(steps) }}"], ["start"])).toHaveLength(1);
  });

  it("every third-party action is pinned by a 40-hex commit SHA", () => {
    const uses = text.split("\n").filter((l) => /^\s+-?\s*uses:/.test(l));
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const u of uses) expect(u, u).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}( #.*)?$/);
  });

  it("every curl in the job carries --connect-timeout 2 --max-time N (no probe can hang to the job limit)", () => {
    const curls = text
      .split("\n")
      .filter((l) => /(^|[\s(;&|])curl\s/.test(l) && !l.trim().startsWith("#") && !l.trim().startsWith("echo"));
    expect(curls.length).toBeGreaterThanOrEqual(6);
    for (const c of curls) expect(c, c).toMatch(/--connect-timeout 2 --max-time \d+/);
  });

  it("the admin id is extracted with jq -er '.authUserId | strings' and then shape-validated", () => {
    expect(text).toContain("jq -er '.authUserId | strings'");
    expect(text).toMatch(/\[\[ "\$admin_id" =~ \^\[A-Za-z0-9_-\]\+\$ \]\] \|\| \{ echo "::error::/);
  });

  it("the process proof runs in the workflow before `start` and is REQUIRED there", () => {
    const proofIdx = text.indexOf("JOURNEYS_PROCESS_PROOF: required");
    expect(proofIdx).toBeGreaterThan(0);
    expect(proofIdx).toBeLessThan(text.indexOf("id: start"));
    expect(text).toContain("run: pnpm -C respin exec vitest run tests/journeys-workflow-triggers.test.ts");
  });

  it("cleanup's defaults are the plan's 35 s TERM window and 10 s KILL window; secret is masked; port-refused wait exists", () => {
    expect(text).toContain('"${JOURNEYS_TERM_WAIT:=35}"');
    expect(text).toContain('"${JOURNEYS_KILL_WAIT:=10}"');
    expect(text).toContain('echo "::add-mask::$secret"');
    expect(text).toMatch(/\[ "\$rc" = "7" \] \|\| \{ echo "::error::bootstrap server still accepting connections/);
    expect(text).toContain("kill -0");
    expect(text).toContain("schedule:"); // commented, with the ceiling rule beside it
    expect(text).toMatch(/# schedule:\n\s+#\s+- cron:/);
  });

  it("the canary proves the repository-secret half: no environment, fails when the key is issued, and gates the spend via needs:", () => {
    const canary = jobLines(text, "no-repository-secret");
    expect(canary).not.toBeNull();
    expect(jobLines(text, "journeys")!.some((l) => l.trim() === "needs: no-repository-secret")).toBe(true);
    expect(canary!.some((l) => /^\s+environment:/.test(l))).toBe(false);
    expect(canary!.join("\n")).toContain("CANARY_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(canary!.some((l) => l.trim() === "id: canary")).toBe(true);
    expect(canary!.join("\n")).toMatch(/if \[ -n "\$CANARY_KEY" \]; then\n\s+echo "::error::[^\n]*\n\s+exit 1/);
  });

  describe("planted variants each FAIL (lesson 2026-08-26)", () => {
    const plant = (mutate: (f: Record<string, string>) => void) => {
      const copy = { ...files };
      mutate(copy);
      return checkWorkflowSet(copy);
    };
    const onBlock = "on:\n  workflow_dispatch:\n";
    it("baseline contains the exact `on:` block the plants edit", () => {
      expect(text).toContain(onBlock);
    });
    it.each([
      ["push added", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  push:\n`))],
      ["pull_request_target added", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  pull_request_target:\n`))],
      ["workflow_run added", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  workflow_run:\n    workflows: [respin]\n`))],
      ["flow-form on", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, "on: [workflow_dispatch, push]\n"))],
      ["quoted \"on\":", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, '"on":\n  workflow_dispatch:\n  push:\n'))],
      ["environment: removed", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("    environment: journeys\n", ""))],
      ["courtesy if: removed", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("    if: github.ref == 'refs/heads/main'\n", ""))],
      ["key added to respin.yml", (f: Record<string, string>) => (f["respin.yml"] = `${f["respin.yml"]}\n      - run: echo $ANTHROPIC_API_KEY\n`)],
      ["a new third workflow naming the key", (f: Record<string, string>) => (f["nightly-extra.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ secrets.ANTHROPIC_API_KEY }}\n")],
      ["a second file declaring environment: journeys", (f: Record<string, string>) => (f["other.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - run: env\n")],
      ["a file dumping toJSON(secrets)", (f: Record<string, string>) => (f["dump.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo '${{ toJSON(secrets) }}'\n")],
      ["playwright job added to respin.yml", (f: Record<string, string>) => (f["respin.yml"] = `${f["respin.yml"]}\n      - run: pnpm exec playwright test\n`)],
      ["key moved to job-level env", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("      PLAYWRIGHT_HTML_OPEN: never\n", "      PLAYWRIGHT_HTML_OPEN: never\n      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n"))],
      ["unconditional report upload", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        if: always() && steps.cleanup.outputs.safe_to_upload == 'true' && steps.scan.outcome == 'success'\n", ""))],
      ["canary given an environment", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("  no-repository-secret:\n", "  no-repository-secret:\n    environment: journeys\n"))],
      ["key moved onto the Install step", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n        run: |", "        id: install\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n        run: |").replace("        id: vendor-key\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n", "        id: vendor-key\n"))],
      ["key added to the bootstrap step (spacing variant)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: bootstrap\n        env:\n", "        id: bootstrap\n        env:\n          ANTHROPIC_API_KEY: ${{secrets.ANTHROPIC_API_KEY}}\n"))],
      ["key added to a third-party action step", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        with:\n          package_json_file: respin/package.json\n", "        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n        with:\n          package_json_file: respin/package.json\n"))],
      ["needs: canary gate removed", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("    needs: no-repository-secret\n", ""))],
      ["key on Install in bracket form, issued-check env kept", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n", "        id: install\n        env:\n          K: ${{ secrets['ANTHROPIC_API_KEY'] }}\n"))],
      ["key on Install in lower case", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n", "        id: install\n        env:\n          K: ${{ secrets.anthropic_api_key }}\n"))],
      ["toJSON(secrets) inside the journeys file's own Install run", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("          pnpm -C respin install --frozen-lockfile\n", "          pnpm -C respin install --frozen-lockfile\n          echo '${{ toJSON(secrets) }}'\n"))],
      ["Install renamed to the issued-check's name and given the key (duplicate-name spoof)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("      - name: Install\n        id: install\n", "      - name: Vendor key issued to this job\n        id: install\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n"))],
      ["run step rewritten with a bare-dash step start and given the key", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("      - name: Run the four journeys (Free path)\n        id: run\n", "      -\n        name: Run the four journeys (Free path)\n        id: run\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n"))],
      ["a step with the key and NO id", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("      - name: Install\n        id: install\n", "      - name: Leak\n        run: echo ${{ secrets.ANTHROPIC_API_KEY }}\n      - name: Install\n        id: install\n"))],
      ["a step whose id duplicates vendor-key", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n", "        id: vendor-key\n"))],
      ["bracket-form key in a third workflow file", (f: Record<string, string>) => (f["third.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ secrets['anthropic_api_key'] }}\n")],
      // batch 2 — the reviewer's held-out shapes
      ["a THIRD job in the journeys file declaring environment: journeys and reading the key", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  leak:\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - id: l\n        run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["a third job with no key at all (the population is a list, not a search)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - id: e\n        run: echo hi\n`)],
      ["`# ${{ toJSON(secrets) }}` inside Install's run body (a commented-out dump GitHub still expands)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("          pnpm -C respin install --frozen-lockfile\n", "          # ${{ toJSON(secrets) }}\n          pnpm -C respin install --frozen-lockfile\n"))],
      ["`# $ANTHROPIC_API_KEY` inside the bootstrap run body", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("          set -euo pipefail\n          # Defaults are the real commands", "          set -euo pipefail\n          # echo $ANTHROPIC_API_KEY\n          # Defaults are the real commands"))],
      ["vendor-key exports the key to GITHUB_ENV (job-wide for every later step and action)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace('          echo "vendor key present (value not printed)"\n', '          echo "vendor key present (value not printed)"\n          echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> "$GITHUB_ENV"\n'))],
      ["start relays the key through GITHUB_OUTPUT and `run` reads steps.start.outputs", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace('          launch worker "$JOURNEYS_WORKER_CMD"\n', '          launch worker "$JOURNEYS_WORKER_CMD"\n          echo "k=$ANTHROPIC_API_KEY" >> "$GITHUB_OUTPUT"\n').replace("        id: run\n", "        id: run\n        env:\n          K: ${{ steps.start.outputs.k }}\n"))],
      ["only the outputs read, no relay write (each half fails on its own)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: run\n", "        id: run\n        env:\n          K: ${{ steps.vendor-key.outputs.k }}\n"))],
      ["`id: start` planted under a third-party action's with:, the key on that step, the real start renamed", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: pnpm\n        with:\n          package_json_file: respin/package.json\n", "        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n        with:\n          id: start\n          package_json_file: respin/package.json\n").replace("        id: start\n", "        id: start2\n"))],
      ["`id: start` as the first line of a run body, ahead of the real id", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("      - name: Install\n        id: install\n        run: |\n", "      - name: Install\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n        run: |\n          id: start\n        id: install\n").replace("        id: start\n", "        id: start2\n"))],
      ["the key env block anchored on vendor-key and aliased onto Install", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: vendor-key\n        env:\n", "        id: vendor-key\n        env: &keyenv\n").replace("        id: install\n", "        id: install\n        env: *keyenv\n"))],
      ["a merge key on Install", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n", "        id: install\n        env:\n          <<: *keyenv\n"))],
      ["mapping-form environment in a third file with a secrets.* wildcard", (f: Record<string, string>) => (f["mapped.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    environment:\n      name: journeys\n    steps:\n      - run: echo ${{ join(secrets.*, ',') }}\n")],
      ["mapping-form environment in a third file, nothing else", (f: Record<string, string>) => (f["mapped2.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    environment:\n      url: https://example.test\n      name: journeys\n    steps:\n      - run: env\n")],
      // batch 3 — the reviewer's held-out shapes: an entry the reader cannot parse is a violation, never a skip
      ['a third job with a double-quoted name `"leak":`', (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  "leak":\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - id: l\n        run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["a third job with a single-quoted name", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  'leak':\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - id: l\n        run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["a third job whose header carries a trailing comment", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  leak: # x\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - id: l\n        run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["a third job with a space before the colon", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  leak :\n    runs-on: ubuntu-latest\n    environment: journeys\n    steps:\n      - id: l\n        run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["a third job as a flow one-liner", (f: Record<string, string>) => (f[JOURNEYS_FILE] = `${text}\n  leak: {runs-on: ubuntu-latest, environment: journeys, steps: [{id: l, run: "echo \${{ secrets.ANTHROPIC_API_KEY }}"}]}\n`)],
      ['a quoted `"push":` trigger', (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  "push":\n`))],
      ["a `? push` complex-key trigger", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  ? push\n`))],
      ["a `push :` trigger", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(onBlock, `${onBlock}  push :\n`))],
      ['`"run": |` on Install with a commented-out dump in its body', (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: install\n        run: |\n", '        id: install\n        "run": |\n          # ${{ toJSON(secrets) }}\n'))],
      ["a double-quoted multi-line run on Install hiding a dump behind a `#`", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        run: |\n          # The repo root has no package.json: every `pnpm` invocation in this file is `-C respin` (G-1, batch-3 final).\n          pnpm -C respin install --frozen-lockfile\n          pnpm -C respin exec playwright install --with-deps chromium\n", '        run: "pnpm -C respin install --frozen-lockfile &&\n          # ${{ toJSON(secrets) }}\n          pnpm -C respin exec playwright install --with-deps chromium"\n'))],
      ["flow-mapping environment in a third file", (f: Record<string, string>) => (f["flowenv.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    environment: {name: journeys}\n    steps:\n      - run: env\n")],
      ["quoted environment in a third file", (f: Record<string, string>) => (f["quotedenv.yml"] = 'on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    environment: "journeys"\n    steps:\n      - run: env\n')],
      ["start relays the key through ::set-output and `run` reads steps['start'].outputs", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace('          launch worker "$JOURNEYS_WORKER_CMD"\n', '          launch worker "$JOURNEYS_WORKER_CMD"\n          echo "::set-output name=k::$ANTHROPIC_API_KEY"\n').replace("        id: run\n", "        id: run\n        env:\n          K: ${{ steps['start'].outputs.k }}\n"))],
      ["the bracket-form outputs read alone", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: run\n", '        id: run\n        env:\n          K: ${{ steps["vendor-key"].outputs.k }}\n'))],
      ["the key anchored inside a flow mapping on vendor-key and aliased onto Install", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        id: vendor-key\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n", '        id: vendor-key\n        env: {"ANTHROPIC_API_KEY":&v "${{ secrets.ANTHROPIC_API_KEY }}"}\n').replace("        id: install\n", '        id: install\n        env: {"K":*v}\n'))],
      ["a forked upload-artifact action", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("uses: actions/upload-artifact@", "uses: foo/upload-artifact@"))],
      ["a bare `pnpm install` at the repo root (no package.json there — G-1)", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("          pnpm -C respin install --frozen-lockfile\n", "          pnpm install --frozen-lockfile\n"))],
      // The secret-free Playwright workflow. Both halves are planted: the bans
      // that keep a key out of it, and the steps whose absence would leave it
      // green and useless.
      ["the visual workflow given the vendor key", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n      - run: echo \${{ secrets.ANTHROPIC_API_KEY }}\n`)],
      ["the visual workflow reading SOME OTHER secret (the ban is the whole context)", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n      - run: echo \${{ secrets.GITHUB_TOKEN }}\n`)],
      ["the visual workflow reading the secrets context in bracket form", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n      - run: echo \${{ secrets['SOME_KEY'] }}\n`)],
      ["the visual workflow given an environment other than journeys", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    environment: staging\n"))],
      ["the visual matrix step deleted (every ban still satisfied, nothing guarded)", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("        run: pnpm test:e2e:visual\n", "        run: echo skipped\n"))],
      ["the browser install deleted", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace(/ *run: pnpm exec playwright install.*\n/, "        run: echo skipped\n"))],
      ["the visual workflow made manual-dispatch only, so no PR runs it", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace(/^on:\n(?: {2}.*\n| {4,}.*\n|\n)*/m, "on:\n  workflow_dispatch:\n"))],
      // THE SHAPES THE BATCH-3 SECURITY REVIEW PROVED BYPASSED, each row
      // naming the message ITS OWN clause emits. Every one of these produced
      // ZERO violations before this round, measured by executing the shipped
      // regexes against the real file text.
      ["the visual workflow given a DOUBLE-QUOTED environment key", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("    runs-on: ubuntu-latest\n", '    runs-on: ubuntu-latest\n    "environment": journeys\n')), /declares an environment/],
      ["the visual workflow given a SINGLE-QUOTED environment key", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    'environment': staging\n")), /declares an environment/],
      ["a THIRD workflow with a double-quoted environment key naming journeys", (f: Record<string, string>) => (f["quotedkey.yml"] = 'on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    "environment": journeys\n    steps:\n      - run: env\n'), /declares environment: journeys/],
      ["a THIRD workflow with a single-quoted environment key naming journeys", (f: Record<string, string>) => (f["quotedkey2.yml"] = "on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    'environment': journeys\n    steps:\n      - run: env\n"), /declares environment: journeys/],
      ["a flow-mapping job in the visual workflow", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n  leak: {runs-on: ubuntu-latest, environment: journeys, steps: [{run: "env"}]}\n`), /jobs are \[|declares an environment/],
      ["a SECOND job in the visual workflow", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`), /jobs are \[/],
      ["the visual workflow calling a reusable workflow with secrets: inherit", (f: Record<string, string>) => (f[VISUAL_FILE] = `${f[VISUAL_FILE]}\n  leak:\n    uses: evil/repo/.github/workflows/x.yml@main\n    secrets: inherit\n`), /reusable workflow|jobs are \[/],
      ["a floating action tag in the visual workflow", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace(/uses: actions\/checkout@[0-9a-f]{40}[^\n]*/, "uses: actions/checkout@v4")), /not pinned by a 40-hex commit SHA/],
      ["an action outside the allowed list in the visual workflow", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace(/uses: actions\/checkout@[0-9a-f]{40}[^\n]*/, "uses: some-random/exfil-action@0000000000000000000000000000000000000000")), /outside the allowed list/],
      ["permissions widened to write-all", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("permissions:\n  contents: read\n", "permissions: write-all\n")), /does not pin `permissions: contents: read`/],
      ["the permissions block deleted outright", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("permissions:\n  contents: read\n", "")), /does not pin `permissions: contents: read`/],
      ["the paths filter narrowed to docs", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace(/ {6}- "respin\/\*\*"/g, '      - "docs/**"')), /`paths:` is/],
      ["a YAML anchor in the visual workflow", (f: Record<string, string>) => (f[VISUAL_FILE] = f[VISUAL_FILE].replace("permissions:\n  contents: read\n", "permissions: &p\n  contents: read\n")), /anchor\/alias\/merge key/],
      ["respin.yml's path filter narrowed back to its own file only", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(/ {6}- "\.github\/workflows\/\*\*"/g, '      - ".github/workflows/respin.yml"')), /workflow-file changes/],
      ["the visual workflow deleted outright", (f: Record<string, string>) => { delete f[VISUAL_FILE]; }],
      // P9-A3 — respin.yml's dependency audit and its supply-chain floor. Each
      // row names the message its own clause emits.
      ["respin.yml's blocking audit step deleted", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(`      - name: Dependency audit (high/critical fails)\n        ${RESPIN_AUDIT_CONDITION}\n        ${RESPIN_AUDIT_RUN}\n`, "")), /the blocking audit step must exist exactly once/],
      ["respin.yml's blocking audit loses its `!cancelled()` condition", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(`      - name: Dependency audit (high/critical fails)\n        ${RESPIN_AUDIT_CONDITION}\n`, "      - name: Dependency audit (high/critical fails)\n")), /lacks `if: \$\{\{ !cancelled\(\) \}\}`/],
      ["respin.yml's blocking audit's condition reverted to always()", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(`      - name: Dependency audit (high/critical fails)\n        ${RESPIN_AUDIT_CONDITION}\n`, "      - name: Dependency audit (high/critical fails)\n        if: always()\n")), /lacks `if: \$\{\{ !cancelled\(\) \}\}`/],
      ["respin.yml's blocking audit made non-blocking", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(`        ${RESPIN_AUDIT_CONDITION}\n        ${RESPIN_AUDIT_RUN}\n`, `        ${RESPIN_AUDIT_CONDITION}\n        continue-on-error: true\n        ${RESPIN_AUDIT_RUN}\n`)), /made non-blocking/],
      ["respin.yml's gate job made continue-on-error", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace("  gate:\n    runs-on: ubuntu-latest\n", "  gate:\n    runs-on: ubuntu-latest\n    continue-on-error: true\n")), /gate job sets continue-on-error/],
      ["respin.yml's checkout unpinned to a tag", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(/uses: actions\/checkout@[0-9a-f]{40}[^\n]*/, "uses: actions/checkout@v4")), /respin\.yml: action is not pinned by a 40-hex commit SHA/],
      ["respin.yml's permissions block deleted", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace("permissions:\n  contents: read\n", "")), /respin\.yml does not pin `permissions: contents: read`/],
      ["respin.yml's schedule deleted", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace(/ {2}schedule:\n {4}- cron: "[^"]+"\n/, "")), /must be exactly \[push, pull_request, schedule\]/],
      ["respin.yml's exception comment back to `ignoreCves`", (f: Record<string, string>) => (f["respin.yml"] = f["respin.yml"].replace("`pnpm.auditConfig.ignoreGhsas`", "`pnpm.auditConfig.ignoreCves`")), /names `ignoreCves`/],
      ["journeys' dev-scope audit deleted", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace(/ {6}- name: Dependency audit, dev scope included \(high\/critical fails\)\n {8}id: dev-audit\n {8}run: pnpm -C respin audit --audit-level high\n/, "")), /no `dev-audit` step/],
      ["journeys' dev-scope audit narrowed to --prod", (f: Record<string, string>) => (f[JOURNEYS_FILE] = text.replace("        run: pnpm -C respin audit --audit-level high\n", "        run: pnpm -C respin audit --audit-level high --prod\n")), /dev scope: no --prod/],
      ["journeys' dev-scope audit moved after Install", (f: Record<string, string>) => {
        const step = "      - name: Dependency audit, dev scope included (high/critical fails)\n        id: dev-audit\n        run: pnpm -C respin audit --audit-level high\n\n";
        const moved = text.replace(step, "");
        f[JOURNEYS_FILE] = moved.replace("      # (3)\n", `${step}      # (3)\n`);
      }, /dev-audit must run before `install`/],
    ])("%s", (_name, mutate, expected?: RegExp) => {
      const before = { ...files };
      mutate(before);
      // the plant must have changed something, or the "failure" is vacuous
      expect(JSON.stringify(before)).not.toBe(JSON.stringify(files));
      const violations = plant(mutate);
      expect(violations.length).toBeGreaterThan(0);
      // ATTRIBUTION, where the row supplies it (batch-3 gate, security LOW).
      // `length > 0` cannot tell a plant that reddens for ITS OWN clause from
      // one reddening on somebody else's — two of the eight visual plants were
      // measured to be redundant that way. Rows added since carry the message
      // their clause emits; the older rows keep the weaker assertion rather
      // than being given expectations nobody verified.
      if (expected) expect(violations.join(" | "), violations.join(" | ")).toMatch(expected);
    });
  });

  it("the report upload lists the three exclusion lines the plan pins", () => {
    const lines = uploadPathLines(text, "journeys-");
    expect(lines).toEqual([
      "respin/e2e/journeys/artifacts",
      "!respin/e2e/journeys/artifacts/_handoff/**",
      "!respin/e2e/journeys/artifacts/consumption/**",
      "respin/playwright-report/**",
      "!respin/playwright-report/*/data/*.zip",
    ]);
  });
});

describe("ignoreGhsas ↔ SECURITY-EXCEPTIONS.md, both ways, no lapsed review (P9-A3)", () => {
  const pkgText = readFileSync(resolve(__dirname, "../package.json"), "utf8");
  const exceptionsText = readFileSync(resolve(__dirname, "../SECURITY-EXCEPTIONS.md"), "utf8");
  const today = isoDay(new Date());

  it("every ignored id has an Active exceptions row with an unexpired Review by date, and every row is ignored", () => {
    expect(exceptionProblems(pkgText, exceptionsText, today)).toEqual([]);
    // Non-vacuous: the populations it compared are the real ones.
    const ignored = (JSON.parse(pkgText) as { pnpm: { auditConfig: { ignoreGhsas: string[] } } }).pnpm.auditConfig.ignoreGhsas;
    expect(ignored.length).toBeGreaterThan(0);
    for (const id of ignored) expect(exceptionsText).toContain(`\`${id}\``);
  });

  describe("planted variants each FAIL (lesson 2026-08-26)", () => {
    const withIgnored = (ids: (list: string[]) => string[]) => {
      const pkg = JSON.parse(pkgText) as { pnpm: { auditConfig: { ignoreGhsas: string[] } } };
      pkg.pnpm.auditConfig.ignoreGhsas = ids([...pkg.pnpm.auditConfig.ignoreGhsas]);
      return JSON.stringify(pkg);
    };
    const firstId = (JSON.parse(pkgText) as { pnpm: { auditConfig: { ignoreGhsas: string[] } } }).pnpm.auditConfig.ignoreGhsas[0]!;
    it.each([
      ["an ignoreGhsas id with no exception row", () => exceptionProblems(withIgnored((l) => [...l, "GHSA-zzzz-zzzz-zzzz"]), exceptionsText, today), /GHSA-zzzz-zzzz-zzzz is in ignoreGhsas with no Active exceptions row/],
      ["an exception row whose id is no longer ignored", () => exceptionProblems(withIgnored((l) => l.filter((x) => x !== firstId)), exceptionsText, today), /a stale row/],
      ["a lapsed review-by date (run as if a year from now)", () => exceptionProblems(pkgText, exceptionsText, isoDay(new Date(Date.now() + 366 * 86_400_000))), /review-by date .* has passed/],
      ["the Review by column deleted", () => exceptionProblems(pkgText, exceptionsText.replace(/\| Review by \|/, "| Revisit |"), today), /no `Review by` column/],
      ["the Active exceptions heading renamed", () => exceptionProblems(pkgText, exceptionsText.replace("## Active exceptions", "## Exceptions"), today), /no `## Active exceptions` section/],
    ] as const)("%s", (_name, run, expected) => {
      const problems = run();
      expect(problems.join(" | "), problems.join(" | ")).toMatch(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// PART B — the process proof on Linux.
// ---------------------------------------------------------------------------

const onLinux = process.platform === "linux";
const proofRequired = process.env.JOURNEYS_PROCESS_PROOF === "required";

describe("start/cleanup shell against synthetic processes (AC5 process proof)", () => {
  const tmpDirs: string[] = [];
  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("is REQUIRED where the workflow runs it: a non-Linux host cannot satisfy it", () => {
    if (proofRequired) expect(onLinux, "JOURNEYS_PROCESS_PROOF=required on a non-Linux host").toBe(true);
    if (!onLinux) console.log("NOT RUN: Linux process proof (this host is not Linux; the workflow runs it before `start`)");
  });

  const linuxIt = onLinux ? it : it.skip;

  type Harness = {
    dir: string;
    env: NodeJS.ProcessEnv & Record<string, string>;
    startScript: string;
    cleanupScript: string;
    bootstrapScript: string;
    /** A server that closes its listener on TERM but never exits: port refused, group still alive. */
    lingeringServerCmd: string;
    port: number;
    outputFile: string;
    githubEnvFile: string;
  };

  function harness(workerCmd: string, webCmd?: string): Harness {
    const dir = mkdtempSync(join(tmpdir(), "journeys-proc-"));
    tmpDirs.push(dir);
    const text = workflowText();
    const startScript = join(dir, "start.sh");
    const cleanupScript = join(dir, "cleanup.sh");
    const bootstrapScript = join(dir, "bootstrap.sh");
    writeFileSync(startScript, stepRunBlock(text, "start"));
    writeFileSync(cleanupScript, stepRunBlock(text, "cleanup"));
    writeFileSync(bootstrapScript, stepRunBlock(text, "bootstrap"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const server = join(dir, "server.js");
    writeFileSync(
      server,
      'const http=require("http");const s=http.createServer((q,r)=>{r.statusCode=200;r.end("ok");});s.listen(Number(process.argv[2]),"127.0.0.1");process.on("SIGTERM",()=>{s.close();process.exit(0);});setInterval(()=>{},1000);\n'
    );
    const lingering = join(dir, "server-linger.js");
    writeFileSync(
      lingering,
      'const http=require("http");const s=http.createServer((q,r)=>{r.statusCode=200;r.end("ok");});s.listen(Number(process.argv[2]),"127.0.0.1");process.on("SIGTERM",()=>{s.close();});setInterval(()=>{},1000);\n'
    );
    const handoff = join(dir, "handoff");
    mkdirSync(handoff);
    writeFileSync(join(handoff, "editor-seat.json"), "{}");
    // the synthetic platform-admin spec: writes the handoff the bootstrap step reads with jq
    const spec = join(dir, "spec.sh");
    writeFileSync(spec, `mkdir -p "${handoff}" && printf '%s' '{"authUserId":"abc123"}' > "${handoff}/platform-admin.json"\n`);
    const outputFile = join(dir, "github_output");
    writeFileSync(outputFile, "");
    const githubEnvFile = join(dir, "github_env");
    writeFileSync(githubEnvFile, "");
    const webCommand = webCmd ?? `${process.execPath} ${server} ${port}`;
    return {
      dir,
      port,
      outputFile,
      githubEnvFile,
      startScript,
      cleanupScript,
      bootstrapScript,
      lingeringServerCmd: `${process.execPath} ${lingering} ${port}`,
      env: {
        ...process.env,
        JOURNEYS_STATE_DIR: join(dir, "state"),
        JOURNEYS_WEB_URL: `http://127.0.0.1:${port}`,
        JOURNEYS_WEB_CMD: webCommand,
        JOURNEYS_WORKER_CMD: workerCmd,
        JOURNEYS_BOOTSTRAP_WEB_CMD: webCommand,
        JOURNEYS_BOOTSTRAP_SPEC_CMD: `bash ${spec}`,
        JOURNEYS_READY_TIMEOUT: "20",
        JOURNEYS_TERM_WAIT: "5",
        JOURNEYS_KILL_WAIT: "3",
        JOURNEYS_HANDOFF_DIR: handoff,
        GITHUB_OUTPUT: outputFile,
        GITHUB_ENV: githubEnvFile,
        RUNNER_TEMP: dir,
      } as NodeJS.ProcessEnv & Record<string, string>,
    };
  }

  async function bash(script: string, env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
    try {
      // The same invocation GitHub uses for `shell: bash`: -e and pipefail are ON unless the script says otherwise.
      const { stdout, stderr } = await execFileAsync("bash", ["--noprofile", "--norc", "-eo", "pipefail", script], {
        env,
        encoding: "utf8",
      });
      return { code: 0, out: `${stdout}\n${stderr}` };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? -1, out: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
    }
  }

  async function groupAlive(pgid: string): Promise<boolean> {
    try {
      await execFileAsync("pgrep", ["-g", pgid], { encoding: "utf8" });
      return true;
    } catch (error) {
      const e = error as { code?: number };
      if (e.code === 1) return false;
      throw error;
    }
  }

  function pgidOf(h: Harness, name: string): string {
    return readFileSync(join(h.env.JOURNEYS_STATE_DIR, `${name}.pgid`), "utf8").trim();
  }
  function safeToUpload(h: Harness): boolean {
    return readFileSync(h.outputFile, "utf8").includes("safe_to_upload=true");
  }

  linuxIt("clean shutdown: start records two groups (each its own session leader), cleanup ends with both gone, port refused, handoff deleted, safe_to_upload=true", async () => {
    const h = harness("sleep 300");
    const s = await bash(h.startScript, h.env);
    expect(s.code, s.out).toBe(0);
    const web = pgidOf(h, "web");
    const worker = pgidOf(h, "worker");
    expect(web).toMatch(/^\d+$/);
    expect(worker).toMatch(/^\d+$/);
    expect(web).not.toBe(worker);
    expect(await groupAlive(web)).toBe(true);
    expect(await groupAlive(worker)).toBe(true);
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(await groupAlive(web)).toBe(false);
    expect(await groupAlive(worker)).toBe(false);
    expect(existsSync(h.env.JOURNEYS_HANDOFF_DIR)).toBe(false);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("web port closes while the worker delays TERM: no success output until the worker is actually gone", async () => {
    const h = harness(`bash -c 'trap "sleep 2; exit 0" TERM; while :; do sleep 1; done'`);
    expect((await bash(h.startScript, h.env)).code).toBe(0);
    const worker = pgidOf(h, "worker");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(await groupAlive(worker)).toBe(false);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("a worker that ignores TERM is KILLed; a child that outlives its launcher is still a live group", async () => {
    // launcher exits on TERM; its child ignores TERM and would survive a launcher-only check
    const h = harness(`bash -c 'bash -c "trap \\"\\" TERM; sleep 300" & trap "exit 0" TERM; wait'`);
    expect((await bash(h.startScript, h.env)).code).toBe(0);
    const worker = pgidOf(h, "worker");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).toContain("sending KILL");
    expect(await groupAlive(worker)).toBe(false);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("PLANT: a port-only cleanup reports success while the surviving child is still alive (so this proof would go red)", async () => {
    const h = harness(`bash -c 'bash -c "trap \\"\\" TERM; sleep 300" & trap "exit 0" TERM; wait'`);
    expect((await bash(h.startScript, h.env)).code).toBe(0);
    const worker = pgidOf(h, "worker");
    const original = readFileSync(h.cleanupScript, "utf8");
    const mutant = original.replace(/any_alive\(\) \{[\s\S]*?\n\}\n/, "any_alive() { return 1; }\n");
    expect(mutant).not.toBe(original);
    const mutantScript = join(h.dir, "cleanup-mutant.sh");
    writeFileSync(mutantScript, mutant);
    const c = await bash(mutantScript, h.env);
    // the mutant believes nothing is alive: TERM only, port refused (the web server honours TERM) -> "success"
    expect(c.code, c.out).toBe(0);
    expect(safeToUpload(h)).toBe(true);
    expect(await groupAlive(worker), "the mutant marked artifacts safe with a key-bearing group still alive").toBe(true);
    // real cleanup afterwards, so nothing leaks from this test
    writeFileSync(h.outputFile, "");
    const real = await bash(h.cleanupScript, h.env);
    expect(real.code, real.out).toBe(0);
    expect(await groupAlive(worker)).toBe(false);
  }, 60_000);

  linuxIt("a missing/invalid recorded PGID after a start fails cleanup with no output", async () => {
    const h = harness("sleep 300");
    mkdirSync(h.env.JOURNEYS_STATE_DIR, { recursive: true });
    writeFileSync(join(h.env.JOURNEYS_STATE_DIR, "started"), "");
    writeFileSync(join(h.env.JOURNEYS_STATE_DIR, "web.pgid"), "abc\n");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code).toBe(1);
    expect(c.out).toContain("is not a number");
    expect(safeToUpload(h)).toBe(false);
    const h2 = harness("sleep 300");
    mkdirSync(h2.env.JOURNEYS_STATE_DIR, { recursive: true });
    writeFileSync(join(h2.env.JOURNEYS_STATE_DIR, "started"), "");
    const c2 = await bash(h2.cleanupScript, h2.env);
    expect(c2.code).toBe(1);
    expect(c2.out).toContain("recorded no process groups");
    expect(safeToUpload(h2)).toBe(false);
  }, 30_000);

  linuxIt("a failing liveness probe (pgrep errors) fails cleanup rather than reading the group as gone", async () => {
    const h = harness("sleep 300");
    expect((await bash(h.startScript, h.env)).code).toBe(0);
    const worker = pgidOf(h, "worker");
    const fakeBin = join(h.dir, "bin");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "pgrep"), "#!/bin/bash\nexit 3\n", { mode: 0o755 });
    const c = await bash(h.cleanupScript, { ...h.env, PATH: `${fakeBin}:${h.env.PATH}` });
    expect(c.code).toBe(1);
    expect(c.out).toContain("pgrep failed");
    expect(safeToUpload(h)).toBe(false);
    // real cleanup so nothing leaks
    const real = await bash(h.cleanupScript, h.env);
    expect(real.code, real.out).toBe(0);
    expect(await groupAlive(worker)).toBe(false);
  }, 60_000);

  linuxIt("start fails when the web process never answers, and when a launched process exits after launch", async () => {
    const h = harness("sleep 300", "sleep 300");
    const s = await bash(h.startScript, { ...h.env, JOURNEYS_READY_TIMEOUT: "3" });
    expect(s.code).toBe(1);
    expect(s.out).toContain("never answered 200");
    const real = await bash(h.cleanupScript, h.env);
    expect(real.code, real.out).toBe(0);
    const h2 = harness("bash -c 'exit 0'");
    const s2 = await bash(h2.startScript, h2.env);
    expect(s2.code).toBe(1);
    expect(s2.out).toMatch(/no process group for pid|exited after launch/);
    await bash(h2.cleanupScript, h2.env);
  }, 60_000);

  // --- the bootstrap group (B1-TEN-3): recorded by the bootstrap step, swept by cleanup ---

  /** Launches a synthetic bootstrap server in its own session and records its pgid the way the bootstrap step does. */
  async function launchBootstrap(h: Harness): Promise<string> {
    mkdirSync(h.env.JOURNEYS_STATE_DIR, { recursive: true });
    const { stdout } = await execFileAsync(
      "bash",
      ["-c", `setsid ${h.env.JOURNEYS_WEB_CMD} > /dev/null 2>&1 & echo $!`],
      { encoding: "utf8" }
    );
    const pid = stdout.trim();
    expect(pid).toMatch(/^\d+$/);
    writeFileSync(join(h.env.JOURNEYS_STATE_DIR, "bootstrap.pgid"), `${pid}\n`);
    // give the server a moment to bind, then confirm the group is alive
    await new Promise((r) => setTimeout(r, 800));
    expect(await groupAlive(pid)).toBe(true);
    return pid;
  }

  linuxIt("a STALE bootstrap.pgid (the normal path: its step already stopped the group) plus a live web/worker pair still cleans up and marks safe", async () => {
    const h = harness("sleep 300");
    expect((await bash(h.startScript, h.env)).code).toBe(0);
    // a pgid that certainly has no live group: launch and let it exit
    const { stdout } = await execFileAsync("bash", ["-c", "setsid true & echo $!"], { encoding: "utf8" });
    const stale = stdout.trim();
    await new Promise((r) => setTimeout(r, 300));
    expect(await groupAlive(stale)).toBe(false);
    writeFileSync(join(h.env.JOURNEYS_STATE_DIR, "bootstrap.pgid"), `${stale}\n`);
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(safeToUpload(h)).toBe(true);
    expect(await groupAlive(pgidOf(h, "web"))).toBe(false);
    expect(await groupAlive(pgidOf(h, "worker"))).toBe(false);
  }, 60_000);

  linuxIt("a LIVE bootstrap group with no `started` marker (bootstrap failed after launch) is stopped and the port refused before safe_to_upload", async () => {
    const h = harness("sleep 300");
    const pid = await launchBootstrap(h);
    // the web URL answers now: the bootstrap server holds the port
    const { stdout: code } = await execFileAsync("curl", ["-s", "-o", "/dev/null", "--connect-timeout", "2", "--max-time", "5", "-w", "%{http_code}", `${h.env.JOURNEYS_WEB_URL}/`], { encoding: "utf8" });
    expect(code).toBe("200");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).not.toContain("no process was started");
    expect(await groupAlive(pid)).toBe(false);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("a non-numeric bootstrap.pgid alone fails cleanup with no output", async () => {
    const h = harness("sleep 300");
    mkdirSync(h.env.JOURNEYS_STATE_DIR, { recursive: true });
    writeFileSync(join(h.env.JOURNEYS_STATE_DIR, "bootstrap.pgid"), "12ab\n");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code).toBe(1);
    expect(c.out).toContain("bootstrap: recorded process group '12ab' is not a number");
    expect(safeToUpload(h)).toBe(false);
  }, 30_000);

  linuxIt("PLANT: reverting the group list to `web worker` marks safe with the bootstrap server still alive (so this proof would go red)", async () => {
    const h = harness("sleep 300");
    const pid = await launchBootstrap(h);
    const original = readFileSync(h.cleanupScript, "utf8");
    const mutant = original.replace("for name in bootstrap web worker; do", "for name in web worker; do");
    expect(mutant).not.toBe(original);
    const mutantScript = join(h.dir, "cleanup-mutant-groups.sh");
    writeFileSync(mutantScript, mutant);
    const c = await bash(mutantScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).toContain("no process was started");
    expect(safeToUpload(h)).toBe(true);
    expect(await groupAlive(pid), "the mutant marked artifacts safe with the bootstrap server alive").toBe(true);
    // real cleanup so nothing leaks
    writeFileSync(h.outputFile, "");
    const real = await bash(h.cleanupScript, h.env);
    expect(real.code, real.out).toBe(0);
    expect(await groupAlive(pid)).toBe(false);
  }, 60_000);

  // --- the bootstrap STEP itself (B2-TEN-5): the record is dropped only once the group is verifiably empty ---

  function bootstrapRecord(h: Harness): string | null {
    const f = join(h.env.JOURNEYS_STATE_DIR, "bootstrap.pgid");
    return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
  }
  /** The pgid the step wrote (kept in its log line even after the record is removed). */
  function bootstrapPgid(out: string): string {
    const m = /bootstrap group (\d+)/.exec(out);
    expect(m, out).not.toBeNull();
    return m![1];
  }

  linuxIt("bootstrap, server honours TERM: admin id exported, group verified empty, record dropped, exit 0", async () => {
    const h = harness("sleep 300");
    const b = await bash(h.bootstrapScript, h.env);
    expect(b.code, b.out).toBe(0);
    expect(b.out).toContain("verified empty, port refused");
    expect(b.out).not.toContain("sending KILL");
    expect(readFileSync(h.githubEnvFile, "utf8")).toContain("ADMIN_USER_IDS=abc123\n");
    expect(bootstrapRecord(h)).toBeNull();
    expect(await groupAlive(bootstrapPgid(b.out))).toBe(false);
  }, 60_000);

  linuxIt("bootstrap, server closes its port on TERM but never exits: port refused is NOT enough — KILL, then the record is dropped only once pgrep -g is empty", async () => {
    const h = harness("sleep 300");
    const b = await bash(h.bootstrapScript, { ...h.env, JOURNEYS_BOOTSTRAP_WEB_CMD: h.lingeringServerCmd });
    expect(b.code, b.out).toBe(0);
    expect(b.out).toContain("sending KILL");
    expect(b.out).toContain("verified empty, port refused");
    expect(bootstrapRecord(h)).toBeNull();
    expect(await groupAlive(bootstrapPgid(b.out))).toBe(false);
  }, 60_000);

  linuxIt("PLANT: dropping the record straight after port-refused (the batch-1 shape) leaves the lingering group alive with no record of it (so this proof would go red)", async () => {
    const h = harness("sleep 300");
    const original = readFileSync(h.bootstrapScript, "utf8");
    const mutant = original.replace(/bootstrap_alive\(\) \{[\s\S]*?\n(?=rm -f "\$JOURNEYS_STATE_DIR\/bootstrap\.pgid")/, "");
    expect(mutant).not.toBe(original);
    expect(mutant).not.toContain("bootstrap_alive");
    const mutantScript = join(h.dir, "bootstrap-mutant.sh");
    writeFileSync(mutantScript, mutant);
    const b = await bash(mutantScript, { ...h.env, JOURNEYS_BOOTSTRAP_WEB_CMD: h.lingeringServerCmd });
    expect(b.code, b.out).toBe(0);
    expect(bootstrapRecord(h)).toBeNull();
    const pgid = bootstrapPgid(b.out);
    expect(await groupAlive(pgid), "the mutant dropped the record with the bootstrap group still alive").toBe(true);
    // cleanup now has no record of it: the nothing-started path marks safe with the group alive (the exact window B2-TEN-5 names)
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).toContain("no process was started");
    expect(await groupAlive(pgid)).toBe(true);
    // real kill so nothing leaks
    await execFileAsync("bash", ["-c", `kill -KILL -- -${pgid}`]);
    await new Promise((r) => setTimeout(r, 300));
    expect(await groupAlive(pgid)).toBe(false);
  }, 60_000);

  linuxIt("bootstrap, group still alive after TERM and KILL (pgrep always reports a member): exit 1, the record is KEPT for cleanup", async () => {
    // B3 NOTE 1: the ordering witness — `rm -f` must sit after the final liveness refusal, not merely after the TERM poll
    const h = harness("sleep 300");
    const fakeBin = join(h.dir, "bin");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "pgrep"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    const b = await bash(h.bootstrapScript, { ...h.env, JOURNEYS_TERM_WAIT: "2", JOURNEYS_KILL_WAIT: "1", PATH: `${fakeBin}:${h.env.PATH}` });
    expect(b.code).toBe(1);
    expect(b.out).toContain("sending KILL");
    expect(b.out).toContain("still alive after TERM and KILL — record kept for cleanup");
    expect(bootstrapRecord(h)).toMatch(/^\d+$/);
    expect(readFileSync(h.githubEnvFile, "utf8")).toContain("ADMIN_USER_IDS=abc123\n"); // the failure is after the export, as on the runner
    // the real group was in fact KILLed; a real cleanup afterwards is clean
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("PLANT: moving `rm -f` ahead of the final liveness refusal drops the record on that path (so this proof would go red)", async () => {
    const h = harness("sleep 300");
    const original = readFileSync(h.bootstrapScript, "utf8");
    const mutant = original
      .replace('rm -f "$JOURNEYS_STATE_DIR/bootstrap.pgid"\n', "")
      .replace("if bootstrap_alive; then\n  echo \"::error::bootstrap group", 'rm -f "$JOURNEYS_STATE_DIR/bootstrap.pgid"\nif bootstrap_alive; then\n  echo "::error::bootstrap group');
    expect(mutant).not.toBe(original);
    expect(mutant).toContain('rm -f "$JOURNEYS_STATE_DIR/bootstrap.pgid"\nif bootstrap_alive; then');
    const mutantScript = join(h.dir, "bootstrap-mutant-order.sh");
    writeFileSync(mutantScript, mutant);
    const fakeBin = join(h.dir, "bin");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "pgrep"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    const b = await bash(mutantScript, { ...h.env, JOURNEYS_TERM_WAIT: "2", JOURNEYS_KILL_WAIT: "1", PATH: `${fakeBin}:${h.env.PATH}` });
    expect(b.code).toBe(1);
    expect(bootstrapRecord(h), "the mutant dropped the record while refusing").toBeNull();
    await bash(h.cleanupScript, h.env);
  }, 60_000);

  linuxIt("bootstrap fails after launch (the spec fails): exit 1, the record stays, and cleanup sweeps that group", async () => {
    const h = harness("sleep 300");
    const b = await bash(h.bootstrapScript, { ...h.env, JOURNEYS_BOOTSTRAP_SPEC_CMD: "false" });
    expect(b.code).toBe(1);
    const record = bootstrapRecord(h);
    expect(record).toMatch(/^\d+$/);
    expect(await groupAlive(record!)).toBe(true);
    expect(readFileSync(h.githubEnvFile, "utf8")).not.toContain("ADMIN_USER_IDS");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).not.toContain("no process was started");
    expect(await groupAlive(record!)).toBe(false);
    expect(safeToUpload(h)).toBe(true);
  }, 60_000);

  linuxIt("cleanup with nothing started marks safe (nothing to stop) — the pre-start failure path", async () => {
    const h = harness("sleep 300");
    const c = await bash(h.cleanupScript, h.env);
    expect(c.code, c.out).toBe(0);
    expect(c.out).toContain("no process was started");
    expect(safeToUpload(h)).toBe(true);
  }, 30_000);
});

// Keep the imported path referenced so a moved workflow is a loud failure here, not a silent read of nothing.
it("reads the workflow at its pinned path", () => {
  expect(existsSync(WORKFLOW_PATH)).toBe(true);
});
