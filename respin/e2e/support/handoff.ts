// Tiny JSON handoff between separately-run journey specs. The studio-operator
// journey provisions an editor identity and records how to reach it; the
// editor-seat journey (run afterwards, as its own `playwright test` invocation
// per the task brief) reads it back. Plain files on disk are the simplest
// thing that works across two separate CLI invocations.
import fs from "node:fs";
import path from "node:path";

const HANDOFF_DIR = path.join(__dirname, "..", "journeys", "artifacts", "_handoff");

export function writeHandoff(name: string, data: unknown): void {
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });
  fs.writeFileSync(path.join(HANDOFF_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

export function readHandoff<T>(name: string): T {
  const raw = fs.readFileSync(path.join(HANDOFF_DIR, `${name}.json`), "utf8");
  return JSON.parse(raw) as T;
}
