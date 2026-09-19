// Test support (not a test): reads `.github/workflows/respin-journeys.yml` as
// text and answers "which files would this upload step actually ship?" — the
// upload-population witness the Phase 2 plan requires (B11-C1). The
// `actions/upload-artifact` path semantics modelled here: each line is a
// path or glob; a bare directory means everything under it; a leading `!`
// excludes; `**` spans directories, `*` stays within one segment.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const WORKFLOW_PATH = resolve(__dirname, "../../.github/workflows/respin-journeys.yml");

export function workflowText(): string {
  return readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
}

/** The `path:` block lines of the upload step whose `name:` starts with `prefix`. */
export function uploadPathLines(text: string, artifactNamePrefix: string): string[] {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*name:\s*/.test(lines[i]) || !lines[i].includes(`name: ${artifactNamePrefix}`)) continue;
    // walk forward to `path:` within the same `with:` block
    for (let j = i + 1; j < lines.length && j < i + 6; j += 1) {
      const m = /^(\s*)path:\s*(.*)$/.exec(lines[j]);
      if (!m) continue;
      if (m[2] && m[2] !== "|") return [m[2].trim()];
      const indent = m[1].length;
      const out: string[] = [];
      for (let k = j + 1; k < lines.length; k += 1) {
        const l = lines[k];
        if (l.trim() === "") break;
        const ind = l.length - l.trimStart().length;
        if (ind <= indent) break;
        out.push(l.trim());
      }
      return out;
    }
  }
  throw new Error(`no upload step with artifact name prefix ${artifactNamePrefix}`);
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (glob[i + 1] === "/") i += 1;
      } else re += "[^/]*";
    } else if (/[.+?^${}()|[\]\\]/.test(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

/** Files (repo-relative, `/`-separated) the given `path:` lines would upload. */
export function uploadPopulation(pathLines: readonly string[], files: readonly string[]): string[] {
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  for (const raw of pathLines) {
    const neg = raw.startsWith("!");
    const pattern = neg ? raw.slice(1) : raw;
    const re = /[*?]/.test(pattern) ? globToRegExp(pattern) : new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")}(/.*)?$`);
    (neg ? exclude : include).push(re);
  }
  return files.filter((f) => include.some((re) => re.test(f)) && !exclude.some((re) => re.test(f)));
}
