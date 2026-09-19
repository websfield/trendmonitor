// Per-journey artifact plumbing: console/page-error/request-failure logs and
// numbered screenshots, one directory per persona. Written incrementally
// (fs.appendFileSync / page.screenshot to disk immediately) so a journey that
// fails partway still leaves whatever it captured before the failure — the
// task's own instruction, not a nice-to-have.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { Persona } from "./main-chapters";

/** Exported so the CI witness can prove the workflow's scan/consumption arguments resolve to THIS tree (G-2). */
export const ARTIFACTS_ROOT = path.join(__dirname, "..", "journeys", "artifacts");

/**
 * The ONE spelling of a blocking note. A `[note] ` line that begins with this
 * prefix fails the CI scan (scripts/scan-journey-notes.ts); every other line
 * in the same log — page console text, page errors, URLs — may contain the
 * word without meaning it, which is why the scan matches the note prefix and
 * never the bare word.
 */
export const BLOCKING_NOTE_PREFIX = "BLOCKING";

/**
 * A paid chapter that did not run because `E2E_PAID_TIERS` is not `1` writes
 * exactly one note with this prefix and continues on the Free path. Never the
 * `BLOCKING` prefix: a skipped paid chapter is the designed Free-path outcome.
 */
export const SKIPPED_NOTE_PREFIX = "skipped:";

export type JourneyArtifacts = {
  readonly personaSlug: string;
  readonly dir: string;
  readonly screenshotsDir: string;
  readonly consoleLogPath: string;
  /** Attach console/pageerror/requestfailed capture to a page. Idempotent per page. */
  attach(page: Page): void;
  /** Numbered screenshot: 01-name.png, 02-name.png, ... */
  screenshot(page: Page, name: string): Promise<void>;
  /** Free-form line into the same console log, for chapter markers etc. */
  note(line: string): void;
  /** The one skipped-paid-chapter note shape; see SKIPPED_NOTE_PREFIX. */
  skipped(what: string): void;
};

export function journeyArtifacts(personaSlug: string): JourneyArtifacts {
  const dir = path.join(ARTIFACTS_ROOT, personaSlug);
  const screenshotsDir = path.join(dir, "screenshots");
  // Fresh screenshots per run, for the same reason the log below is fresh: a
  // failed attempt's leftover 03-whatever.png sitting next to this run's own
  // 03-something-else.png is stale evidence wearing the same number.
  fs.rmSync(screenshotsDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const consoleLogPath = path.join(dir, "console.log");
  // Fresh log per run — a stale log from a previous attempt reads as evidence
  // from this one otherwise.
  fs.writeFileSync(
    consoleLogPath,
    `# ${personaSlug} journey log — started ${new Date().toISOString()}\n`
  );
  // Fresh consumption records per run for THIS persona only: the personas run
  // as separate `playwright test` invocations, so each may clear only its own.
  clearConsumptionRecords(personaSlug);

  function append(line: string): void {
    fs.appendFileSync(consoleLogPath, line.endsWith("\n") ? line : `${line}\n`);
  }

  let shotCounter = 0;

  return {
    personaSlug,
    dir,
    screenshotsDir,
    consoleLogPath,
    attach(page: Page): void {
      page.on("console", (msg) => {
        append(`[console:${msg.type()}] ${page.url()} :: ${msg.text()}`);
      });
      page.on("pageerror", (err) => {
        append(`[pageerror] ${page.url()} :: ${err.stack ?? err.message}`);
      });
      page.on("requestfailed", (req) => {
        append(
          `[requestfailed] ${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "unknown"}`
        );
      });
      page.on("response", (res) => {
        if (res.status() >= 400) {
          append(`[http ${res.status()}] ${res.request().method()} ${res.url()}`);
        }
      });
    },
    async screenshot(page: Page, name: string): Promise<void> {
      shotCounter += 1;
      const fileName = `${String(shotCounter).padStart(2, "0")}-${name}.png`;
      await page.screenshot({
        path: path.join(screenshotsDir, fileName),
        fullPage: true,
      });
      append(`[screenshot] ${fileName} @ ${page.url()}`);
    },
    note(line: string): void {
      append(`[note] ${line}`);
    },
    skipped(what: string): void {
      append(`[note] ${SKIPPED_NOTE_PREFIX} ${what}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Structured per-press consumption records (Phase 2, Failed-dispatch retention).
//
// Separate from the free-form notes above: one small JSON file per persona and
// press ordinal under `artifacts/consumption/`, written BEFORE the press as an
// `unknown` record and atomically replaced after the press settles — so a run
// that dies mid-press leaves an honest `unknown`, never an absence that a
// later reader could count as zero. Persisted fields are exactly the closed
// set below; notes stay supplemental. The CI validator
// (`scan-journey-notes.ts --consumption-evidence`) re-serialises these into
// the one uploaded manifest and rejects anything outside this shape.
// ---------------------------------------------------------------------------

export const CONSUMPTION_DIR = path.join(ARTIFACTS_ROOT, "consumption");

export type VoicePressPersona = Extract<Persona, "solo-creator" | "studio-operator">;

/** The settled voice ACTION (not the model-usage enum). */
export type PressOutcome = "succeeded" | "refused" | "unknown";

export type ConsumptionRecord = {
  runId: string;
  persona: VoicePressPersona;
  pressOrdinal: number;
  profileId: string;
  attemptId: string | null;
  outcome: PressOutcome;
  consumed: boolean | "unknown";
};

/**
 * One id per dispatch, shared across the personas' separate invocations: on
 * GitHub it is `<run id>-<run attempt>`; locally `JOURNEY_RUN_ID` must be set
 * explicitly (the README says so) — a per-process timestamp would give each
 * persona its own id and the reconciliation would see a foreign run.
 */
export function currentRunId(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GITHUB_RUN_ID) {
    return `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? "1"}`;
  }
  if (env.JOURNEY_RUN_ID) return env.JOURNEY_RUN_ID;
  // No guessed id: a shared literal would let a stale sibling persona's record
  // from an earlier local run pass as this run's (billing batch 0, Low).
  throw new Error(
    "no run id: set JOURNEY_RUN_ID (one value shared by every persona of this run) — CI derives it from GITHUB_RUN_ID/GITHUB_RUN_ATTEMPT"
  );
}

export function consumptionRecordPath(
  persona: VoicePressPersona,
  pressOrdinal: number,
  dir: string = CONSUMPTION_DIR
): string {
  return path.join(dir, `${persona}-${pressOrdinal}.json`);
}

function clearConsumptionRecords(personaSlug: string, dir: string = CONSUMPTION_DIR): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(`${personaSlug}-`) && name.endsWith(".json")) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

/** Write (or atomically replace) one persona/press record: temp file, then rename. */
export function writeConsumptionRecord(record: ConsumptionRecord, dir: string = CONSUMPTION_DIR): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = consumptionRecordPath(record.persona, record.pressOrdinal, dir);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, target);
}
