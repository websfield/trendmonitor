// `pnpm -C respin exec tsx scripts/scan-journey-notes.ts <artifactsDir> [reportDir]`
//
// The journeys record refusals and CONTINUE by design, so a green Playwright
// run is evidence only through what it wrote. This scan is the CI job's
// judgement over both uploaded trees (creator-ready Phase 2, T4). It fails on:
//
//   * any `[note] BLOCKING…` line in a persona's console.log — ONLY a note
//     line beginning with `BLOCKING_NOTE_PREFIX`; the same log also carries
//     page console text, page errors and URLs that may contain the word;
//   * any persona whose MAIN-CHAPTER screenshot (e2e/support/main-chapters.ts)
//     is missing — a suffix match `*-<name>.png`, because artifacts.ts
//     prefixes every shot with a running number — or whose log is absent;
//   * any file under a `_handoff/` directory in EITHER tree — handoff files
//     carry the synthetic personas' credentials and are deleted before this
//     scan runs and excluded from upload; finding one means that did not happen.
//
// `--consumption-evidence <artifactsDir> <outputDir> [--run-id <id>]` is the
// second mode: it validates the structured per-press consumption records under
// `<artifactsDir>/consumption/` and writes ONE newly serialised, allowlisted
// `consumption.json` into an otherwise EMPTY `<outputDir>`. It copies no raw
// file and carries no free-text code/kind string. The manifest records
// completeness and unknown status explicitly; absent or ambiguous records never
// count as zero and never authorise another dispatch.
import fs from "node:fs";
import path from "node:path";
import { countConsumingRefusals, isUuid } from "../e2e/support/brain";
import { BLOCKING_NOTE_PREFIX, currentRunId, type ConsumptionRecord } from "../e2e/support/artifacts";
import { MAIN_CHAPTERS, PERSONAS, VOICE_PRESS_PERSONAS } from "../e2e/support/main-chapters";

export type ScanProblem = { kind: "blocking-note" | "missing-screenshot" | "missing-log" | "handoff-file"; detail: string };

const BLOCKING_LINE = new RegExp(`^\\[note\\] ${BLOCKING_NOTE_PREFIX}`);

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Every problem in the two trees; an empty list is a clean run. */
export function scanJourneyTrees(artifactsDir: string, reportDir?: string): ScanProblem[] {
  const problems: ScanProblem[] = [];
  for (const persona of PERSONAS) {
    const logPath = path.join(artifactsDir, persona, "console.log");
    if (!fs.existsSync(logPath)) {
      problems.push({ kind: "missing-log", detail: `${persona}: no console.log — the persona did not run` });
    } else {
      const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (BLOCKING_LINE.test(line)) problems.push({ kind: "blocking-note", detail: `${persona}: ${line}` });
      }
    }
    const main = MAIN_CHAPTERS[persona];
    const shotsDir = path.join(artifactsDir, persona, "screenshots");
    const shots = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir) : [];
    if (!shots.some((name) => name.endsWith(`-${main}.png`))) {
      problems.push({ kind: "missing-screenshot", detail: `${persona}: no *-${main}.png under ${shotsDir}` });
    }
  }
  for (const root of [artifactsDir, reportDir].filter((d): d is string => typeof d === "string")) {
    for (const file of walk(root)) {
      const rel = path.relative(root, file);
      if (rel.split(path.sep).includes("_handoff")) {
        problems.push({ kind: "handoff-file", detail: `${file} — handoff files must be deleted before the scan and never uploaded` });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Consumption evidence manifest.
// ---------------------------------------------------------------------------

const RECORD_KEYS = ["runId", "persona", "pressOrdinal", "profileId", "attemptId", "outcome", "consumed"] as const;
const RECORD_FILE = /^(solo-creator|studio-operator)-([1-9][0-9]*)\.json$/;

export type ConsumptionManifest = {
  runId: string;
  /** every voice-press persona has at least one record and none is unknown */
  complete: boolean;
  unknownCount: number;
  consumingRefusals: ReturnType<typeof countConsumingRefusals>;
  personas: Record<string, { records: number; settled: number }>;
  records: ConsumptionRecord[];
};

export class ConsumptionRejected extends Error {
  constructor(readonly reasons: string[]) {
    super(`consumption evidence rejected: ${reasons.join("; ")}`);
  }
}

function validateRecord(raw: unknown, fileName: string, runId: string, reasons: string[]): ConsumptionRecord | null {
  const m = RECORD_FILE.exec(fileName);
  if (!m) {
    reasons.push(`${fileName}: unexpected path`);
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    reasons.push(`${fileName}: not an object`);
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  if (keys.join(",") !== [...RECORD_KEYS].sort().join(",")) {
    reasons.push(`${fileName}: unexpected field set [${keys.join(",")}]`);
    return null;
  }
  const { runId: r, persona, pressOrdinal, profileId, attemptId, outcome, consumed } = obj;
  if (r !== runId) {
    reasons.push(`${fileName}: foreign run id`);
    return null;
  }
  if (persona !== m[1]) {
    reasons.push(`${fileName}: persona does not match the file name`);
    return null;
  }
  if (typeof pressOrdinal !== "number" || !Number.isInteger(pressOrdinal) || pressOrdinal < 1 || pressOrdinal !== Number(m[2])) {
    reasons.push(`${fileName}: pressOrdinal is not the positive integer in the file name`);
    return null;
  }
  if (!isUuid(profileId)) {
    reasons.push(`${fileName}: profileId is not a UUID`);
    return null;
  }
  if (attemptId !== null && !isUuid(attemptId)) {
    reasons.push(`${fileName}: attemptId is neither null nor a UUID`);
    return null;
  }
  if (outcome !== "succeeded" && outcome !== "refused" && outcome !== "unknown") {
    reasons.push(`${fileName}: outcome out of range`);
    return null;
  }
  if (consumed !== true && consumed !== false && consumed !== "unknown") {
    reasons.push(`${fileName}: consumed out of range`);
    return null;
  }
  return {
    runId: r,
    persona: persona as ConsumptionRecord["persona"],
    pressOrdinal,
    profileId,
    attemptId,
    outcome,
    consumed,
  };
}

/** Reads and validates `<artifactsDir>/consumption/*.json`; throws ConsumptionRejected on any violation. */
export function buildConsumptionManifest(artifactsDir: string, runId: string): ConsumptionManifest {
  const dir = path.join(artifactsDir, "consumption");
  const reasons: string[] = [];
  const records: ConsumptionRecord[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) {
        reasons.push(`${name}: symlink`);
        continue;
      }
      if (!st.isFile()) {
        reasons.push(`${name}: not a regular file`);
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(full, "utf8"));
      } catch {
        reasons.push(`${name}: not JSON`);
        continue;
      }
      const record = validateRecord(raw, name, runId, reasons);
      if (record) records.push(record);
    }
  }
  const counted = countConsumingRefusals(records);
  if (counted.stop && counted.reason === "conflicting-duplicates") {
    reasons.push("conflicting duplicate records for one (runId, profileId, attemptId)");
  }
  if (reasons.length > 0) throw new ConsumptionRejected(reasons);

  const personas: ConsumptionManifest["personas"] = {};
  for (const persona of VOICE_PRESS_PERSONAS) {
    const mine = records.filter((r) => r.persona === persona);
    personas[persona] = {
      records: mine.length,
      settled: mine.filter((r) => r.outcome !== "unknown" && r.consumed !== "unknown").length,
    };
  }
  const unknownCount = records.filter((r) => r.outcome === "unknown" || r.consumed === "unknown").length;
  const complete =
    unknownCount === 0 && VOICE_PRESS_PERSONAS.every((persona) => personas[persona].records > 0);
  return { runId, complete, unknownCount, consumingRefusals: counted, personas, records };
}

/** Writes the manifest into an otherwise-empty output directory; returns its path. */
export function writeConsumptionManifest(manifest: ConsumptionManifest, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const existing = fs.readdirSync(outputDir);
  if (existing.length > 0) {
    throw new ConsumptionRejected([`output directory is not empty: ${existing.join(", ")}`]);
  }
  const target = path.join(outputDir, "consumption.json");
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
  return target;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  if (argv[0] === "--consumption-evidence") {
    const [, source, output, ...rest] = argv;
    if (!source || !output) {
      console.error("usage: scan-journey-notes.ts --consumption-evidence <artifactsDir> <outputDir> [--run-id <id>]");
      return 2;
    }
    const runIdFlag = rest.indexOf("--run-id");
    let runId: string | undefined;
    try {
      runId = runIdFlag >= 0 ? rest[runIdFlag + 1] : currentRunId(env);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
    if (!runId) {
      console.error("--run-id needs a value");
      return 2;
    }
    try {
      const manifest = buildConsumptionManifest(path.resolve(source), runId);
      const target = writeConsumptionManifest(manifest, path.resolve(output));
      console.log(
        `consumption manifest written: ${target} (complete=${manifest.complete}, unknown=${manifest.unknownCount}, consumingRefusals=${manifest.consumingRefusals.count}, stop=${manifest.consumingRefusals.stop})`
      );
      return 0;
    } catch (error) {
      if (error instanceof ConsumptionRejected) {
        for (const reason of error.reasons) console.error(`REJECTED: ${reason}`);
        return 1;
      }
      throw error;
    }
  }
  const [artifactsDir, reportDir] = argv;
  if (!artifactsDir) {
    console.error("usage: scan-journey-notes.ts <artifactsDir> [reportDir]");
    return 2;
  }
  const problems = scanJourneyTrees(path.resolve(artifactsDir), reportDir ? path.resolve(reportDir) : undefined);
  for (const p of problems) console.error(`${p.kind}: ${p.detail}`);
  if (problems.length === 0) {
    console.log(`journey scan clean: ${PERSONAS.length} personas, main-chapter screenshots present, no BLOCKING notes, no handoff files`);
    return 0;
  }
  console.error(`journey scan failed: ${problems.length} problem(s)`);
  return 1;
}

if (process.argv[1] && /scan-journey-notes\.ts$/.test(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
