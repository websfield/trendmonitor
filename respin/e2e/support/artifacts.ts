// Per-journey artifact plumbing: console/page-error/request-failure logs and
// numbered screenshots, one directory per persona. Written incrementally
// (fs.appendFileSync / page.screenshot to disk immediately) so a journey that
// fails partway still leaves whatever it captured before the failure — the
// task's own instruction, not a nice-to-have.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const ARTIFACTS_ROOT = path.join(__dirname, "..", "journeys", "artifacts");

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
  };
}
