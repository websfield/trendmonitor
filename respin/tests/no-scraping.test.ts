// Slice 8 R1/R3 compliance scanner. Its target is source and manifests, not
// this fixture: every forbidden shape has a planted specimen below.
//
// THE POPULATION IS A LIST (CLAUDE.md, 2026-08-29): it names every place a
// scraping dependency or a caption/media route could be introduced, and a new
// place joins the scan by joining the list. Until 2026-09-03 it was
// `packages/trends/src` plus that package's dependency-free manifest — so a
// `puppeteer` at the root or a `yt-dlp` shell-out in `worker/`, where the
// outbound HTTP lives, passed M4's compliance test (compliance gate round 1).
// The first widening read the root manifest and called it "where every
// runtime dependency actually lives" — measured false in round 2: six package
// manifests declare runtime dependencies (`packages/llm` carries the vendor
// SDK, `packages/credits` carries Stripe, `packages/db` carries `pg`), so a
// `puppeteer` added to `packages/llm/package.json` passed. The manifest
// population is now the root PLUS every `packages/*/package.json`, and the
// package list is pinned so a new package must be added here deliberately.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { originPinnedFetch } from "@respin/db";
import { activationEmitterPorts } from "../worker/activation-emitter";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");

/**
 * THE WORKSPACE PACKAGES, as a list. Derived from the directory below and
 * pinned EQUAL to this constant: a package that appears on disk without
 * appearing here fails the population test, and the scan therefore cannot
 * quietly cover six of seven.
 */
const PACKAGES = ["auth", "brain", "config", "credits", "db", "llm", "modes", "trends"] as const;


type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * The dependency NAMES a manifest declares — the population a scraping
 * dependency joins. Every dependency block is read, because a scraper listed
 * as optional or peer is still a scraper the install resolves.
 */
function dependencyNamesOf(manifest: Manifest): string {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
    // The browser test runner is a local verification tool, not a production
    // scraper. Exact-name exclusion keeps runtime `playwright` forbidden.
    .filter((name) => name !== "@playwright/test")
    .join("\n");
}

function manifestDependencyNames(file: string): string {
  return dependencyNamesOf(JSON.parse(readFileSync(file, "utf8")) as Manifest);
}

/**
 * OUTBOUND HTTP, AS A MEASURED POPULATION (P1-R2 / R-141).
 *
 * R-4 forbids ingesting from closed platforms, and the sharpest form of that
 * rule is "a URL somebody submitted is never fetched" — `trend_sources.source_url`
 * is a column holding exactly such a URL. The scan therefore finds every
 * outbound call in production source and asserts the set EQUALS the list below,
 * BOTH WAYS: a call the list lacks is red, and a list entry the scan no longer
 * finds is equally red, so the allowlist cannot rot into names nothing reaches.
 *
 * The callee tokens are the measured ones, not "the two permitted ports": the
 * repo's outbound calls go through `fetch`, an injected `fetchImpl`, a bound
 * `doFetch`, and the `underlying` of an origin-pinning wrapper. The two SDK
 * constructors are listed separately because the call shape cannot see inside
 * them — saying what the allowlist does NOT cover is part of the allowlist.
 */
const OUTBOUND_CALL = /(?:\bglobalThis\s*\.\s*fetch|\bfetch|\bfetchImpl|\bdoFetch|\bunderlying)\s*\(/g;
const SDK_CONSTRUCTOR = /new\s+(?:Stripe|S3Client)\s*\(/g;

/**
 * Every outbound call site, keyed by FILE AND CALLEE rather than by line.
 *
 * A line number rots on the next edit above it; the pair "which file, which
 * callee" is the thing the rule is actually about. Measured 2026-09-21 over
 * `PRODUCTION_ROOTS` minus the `tests/` segment: seven sites, five fetch-shaped
 * and two SDK-borne.
 */
const OUTBOUND_ALLOWLIST: Readonly<Record<string, string>> = {
  "packages/llm/src/anthropic.ts underlying(":
    "pinnedFetch's one call — the URL was just compared to ANTHROPIC_ORIGIN (a constant) and anything else threw",
  "packages/db/src/telemetry-sinks.ts underlying(":
    "originPinnedFetch's one call — the URL was just compared to the pinned origin, which is built from the env-derived DSN or sink host",
  "packages/db/src/telemetry-sinks.ts fetchImpl(":
    "sendOutbound posts payload.url, built by sentryEnvelope(dsn) or posthogActivationCapture(sink) — both env-derived, and both senders are handed an originPinnedFetch",
  "packages/auth/src/resend-mail.ts doFetch(":
    "the mail port — a template over the constant RESEND_ORIGIN, redirect: \"error\"",
  "app/(marketing)/sample-spin/sample-spin-panel.tsx fetch(":
    "a relative path (\"/api/demo\") in a client component — same origin, no origin to pin",
  "packages/credits/src/stripe/adapter.ts new Stripe(":
    "SDK-BORNE: the call shape cannot see inside it. The assertion is the import boundary below",
  "packages/db/src/deletion-journal-s3.ts new S3Client(":
    "SDK-BORNE: endpoint guarded https-or-loopback at its construction. The assertion is the import boundary below",
};

/**
 * THE URL EACH FETCH-SHAPED SITE MAY BE CALLED WITH — its first argument, read
 * from the call in the source rather than described in a sentence (P1-R2's
 * per-site `trend_sources.source_url` assertion). Each is a constant, a
 * template over constants, a value built by named functions whose inputs are
 * env, or — for the two wrappers — the `input` the wrapper has just compared
 * to its pinned origin. A planted `fetch(row.sourceUrl)` in an ALLOWLISTED
 * file is therefore as red as one in a new file.
 */
const FIRST_ARGUMENT: Readonly<Record<string, string>> = {
  "packages/llm/src/anthropic.ts underlying(": "input",
  "packages/db/src/telemetry-sinks.ts underlying(": "input",
  "packages/db/src/telemetry-sinks.ts fetchImpl(": "payload.url",
  "packages/auth/src/resend-mail.ts doFetch(": "`${RESEND_ORIGIN}${RESEND_SEND_PATH}`",
  "app/(marketing)/sample-spin/sample-spin-panel.tsx fetch(": '"/api/demo"',
};

/**
 * The first argument of the call whose `(` is at `open`, up to the first
 * top-level comma or the closing paren. Strings and template literals are
 * skipped whole, so a `,` or `)` inside one is text, not syntax.
 */
function firstArgumentAt(code: string, open: number): string {
  let depth = 0;
  for (let i = open + 1; i < code.length; i += 1) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i += 1; i < code.length && code[i] !== c; i += 1) {
        if (code[i] === "\\") i += 1;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return code.slice(open + 1, i).trim();
      depth -= 1;
    } else if (c === "," && depth === 0) return code.slice(open + 1, i).trim();
  }
  return code.slice(open + 1).trim();
}

/** Every fetch-shaped call's first argument, as `<file> <callee>( <argument>`. */
function outboundFirstArguments(sources: readonly { name: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const { name, text } of sources) {
    const code = blankComments(text);
    OUTBOUND_CALL.lastIndex = 0;
    for (let m = OUTBOUND_CALL.exec(code); m !== null; m = OUTBOUND_CALL.exec(code)) {
      const site = `${name} ${m[0].replace(/\s+/g, " ").trim()}`;
      found.push(`${site} ${firstArgumentAt(code, OUTBOUND_CALL.lastIndex - 1)}`);
    }
  }
  return found.sort();
}

/** The modules whose outbound HTTP is SDK-borne, and therefore proved by imports. */
const SDK_BORNE = [
  "packages/credits/src/stripe/adapter.ts",
  "packages/db/src/deletion-journal-s3.ts",
] as const;

/** Every outbound call site the scan can see, as `<file> <callee>(`. */
function outboundSites(sources: readonly { name: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const { name, text } of sources) {
    const code = blankComments(text);
    for (const re of [OUTBOUND_CALL, SDK_CONSTRUCTOR]) {
      re.lastIndex = 0;
      for (let m = re.exec(code); m !== null; m = re.exec(code)) {
        found.push(`${name} ${m[0].replace(/\s+/g, " ").trim()}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

const FORBIDDEN = [
  { id: "scraping dependency", pattern: /\b(?:puppeteer|playwright|cheerio|selenium|scrapy|yt-dlp)\b/i, specimen: 'import "puppeteer";' },
  // GATE M3: THE HTTP CLIENTS THE OUTBOUND ALLOWLIST'S CALL SHAPE CANNOT SEE.
  // `undici`, `got` and `axios` make requests through their own callees
  // (`request(`, `got(`, `axios.get(`), so a client library is refused by
  // NAME — as an import, a require or a manifest dependency — rather than
  // trusted to route through an allowlisted `fetch`. Measured 2026-10-05:
  // none is imported or declared anywhere in the scanned population (the one
  // `undici` in the tree is prose in a comment, which the blanking removes).
  {
    id: "HTTP client library",
    pattern: /(?:\bfrom\s*["'](?:undici|got|axios)(?:\/[^"']*)?["']|\b(?:import|require)\s*\(\s*["'](?:undici|got|axios)(?:\/[^"']*)?["']\s*\)|\bimport\s*["'](?:undici|got|axios)["']|^(?:undici|got|axios)$)/m,
    specimen: 'import { request } from "undici";',
  },
  // ...and Node's own: an import of `node:http`/`node:https` (or the bare
  // `http`/`https`) is how a raw `request(` or `get(` reaches the network
  // without any callee token the allowlist scan reads.
  {
    id: "node http module",
    pattern: /(?:\bfrom\s*["'](?:node:)?https?["']|\b(?:import|require)\s*\(\s*["'](?:node:)?https?["']\s*\))/,
    specimen: 'import { request } from "node:https";',
  },
  { id: "caption endpoint", pattern: /\/youtube\/v3\/captions\b/i, specimen: 'const path = "/youtube/v3/captions?key=fixture";' },
  { id: "media download endpoint", pattern: /\/(?:media|download)\b/i, specimen: 'const path = "/media/download?key=fixture";' },
] as const;

/**
 * The BROWSER TEST RUNNER's own configuration, exempt BY EXACT NAME.
 *
 * The same exemption `dependencyNamesOf` already makes for `@playwright/test`,
 * and for the same stated reason: Playwright is a local verification tool, not
 * a production scraper. It is spelled as two exact filenames rather than a
 * `playwright.*` pattern, so a `playwright-scraper.ts` is still scanned.
 *
 * Both files entered this scan's population on 2026-09-21, when P1-R3 widened
 * it from four hand-listed trees onto the shared root list — they sit at the
 * workspace root, which no walked tree covered.
 */
const RUNNER_CONFIGS = new Set([
  "playwright.config.ts",
  "playwright.visual.config.ts",
  // Launch L2 (E-30): the Free actual-app journey's own runner config (its own
  // dev server, port and isolated database). A local verification tool like the
  // other two, added BY NAME — the list is the population (CLAUDE.md
  // non-negotiable 7), so a look-alike file is still scanned.
  "playwright.l2.config.ts",
]);

/**
 * Source with its comments blanked — the scan reads CODE.
 *
 * A dependency NAMED IN PROSE is not a dependency: `scripts/scan-journey-notes.ts:3`
 * explains why a green Playwright run does not mean the journeys passed, and
 * that sentence is not a scraper. It was this scan's first false positive the
 * moment `scripts/` joined the population. One alternation rather than two
 * passes, so a `/**` inside a `//` line cannot open a phantom block that
 * swallows the code after it (the shape `claim-scan.test.ts` pins).
 */
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) =>
    before === undefined ? " " : `${before} `
  );
}

function offenders(pattern: RegExp, sources: readonly { name: string; text: string }[]): string[] {
  return sources
    .filter((source) => !RUNNER_CONFIGS.has(source.name))
    .filter((source) => pattern.test(blankComments(source.text)))
    .map((source) => source.name);
}

describe("R1/R3: no scraper or caption/media download route in any package, the worker, lib, the app, or any manifest", () => {
  // THE POPULATION, as a list. Dependencies are proved from manifests, never by
  // walking node_modules (which would make the result depend on unrelated
  // transitive installations). Every workspace manifest is read: the root and
  // each package's own, because each package declares its own runtime
  // dependencies (compliance gate round 2, 2026-09-03).
  //
  // THE SHARED ROOT LIST (P1-R3). This walked `packages/*/src`, `lib`,
  // `worker` and `app` until 2026-09-21 — `scripts/` and the workspace's own
  // root-level modules were outside it, and `middleware.ts` runs on every
  // request. `PRODUCTION_ROOTS` is asserted against `ROOT_DIRS` in
  // `claim-scan.test.ts`, so the population is a measurement rather than four
  // paths somebody typed.
  const sourceFiles = sourceFilesUnder(PRODUCTION_ROOTS).filter(
    ({ file }) =>
      !file.split("/").includes("tests") && !/\.test\.tsx?$/.test(file)
  );
  const manifests = [
    join(ROOT, "package.json"),
    ...PACKAGES.map((name) => join(PACKAGES_DIR, name, "package.json")),
  ];
  const sources = [
    ...sourceFiles.map(({ file, text }) => ({ name: file, text })),
    ...manifests.map((file) => ({
      name: `${relative(ROOT, file).split(sep).join("/")} (dependency names)`,
      text: manifestDependencyNames(file),
    })),
  ];

  it("the package list is the directory: a package on disk that is not in PACKAGES fails here", () => {
    const onDisk = readdirSync(PACKAGES_DIR)
      .filter((name) => statSync(join(PACKAGES_DIR, name)).isDirectory())
      .sort();
    expect(onDisk).toEqual([...PACKAGES].sort());
  });

  it("scans the real population: every package src, lib, worker, app server files, and every manifest", () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain("packages/trends/src/sources.ts");
    // The package where outbound HTTP to the vendor lives — the round-2 gap.
    expect(names).toContain("packages/llm/src/index.ts");
    expect(names).toContain("packages/credits/src/generate.ts");
    expect(names).toContain("lib/routes.ts");
    expect(names).toContain("worker/production.ts");
    expect(names).toContain("app/(product)/trends/actions.ts");
    expect(names).toContain("app/(product)/trends/spin-panel.tsx");
    // THE ROOTS THE OLD FOUR-PATH LIST MISSED — `middleware.ts` runs on every
    // request and belonged to no walked tree until 2026-09-21.
    expect(names).toContain("middleware.ts");
    expect(names.some((name) => name.startsWith("scripts/"))).toBe(true);
    expect(names).toContain("package.json (dependency names)");
    for (const name of PACKAGES) {
      expect(names).toContain(`packages/${name}/package.json (dependency names)`);
    }
    expect(names.some((name) => /\.test\.tsx?$/.test(name))).toBe(false);
    expect(names.some((name) => name.split("/").includes("tests"))).toBe(false);
    // A shrinking population is a weakened guard: the count is asserted, not
    // merely logged. RE-MEASURED 2026-10-05 (P1-R2, AC6) on the shared roots:
    // 182 packages + 147 app + 20 worker + 9 root-level + 5 scripts + 3 lib =
    // 366 source files, + 9 manifests (root + 8 packages). The floor IS the
    // measurement: a file leaving the population is red until somebody
    // re-measures and records why. Earlier figures: 348 on 2026-09-21 (the
    // first shared-root count), 223 over four hand-listed trees before it.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(366);
    expect(manifests).toHaveLength(1 + PACKAGES.length);
    expect(sources.map((source) => source.text).join("\n").length).toBeGreaterThan(100_000);
  });

  it.each(FORBIDDEN)("NON-VACUITY: finds planted $id in a source file", ({ pattern, specimen }) => {
    expect(offenders(pattern, [{ name: "planted.ts", text: specimen }])).toEqual(["planted.ts"]);
  });

  it("NON-VACUITY (gate M3): one planted specimen per HTTP client NAME and per node module spelling", () => {
    const client = FORBIDDEN.find((f) => f.id === "HTTP client library")!;
    const node = FORBIDDEN.find((f) => f.id === "node http module")!;
    for (const text of [
      'import { request } from "undici";',
      'import got from "got";',
      'import axios from "axios";',
      'const { fetch } = require("undici");',
      'const got = await import("got");',
      'import "axios";',
    ]) {
      expect(offenders(client.pattern, [{ name: "worker/plant.ts", text }]), text).toEqual(["worker/plant.ts"]);
    }
    // ...and in a manifest's dependency-name list, the derived shape the real
    // manifests are scanned in.
    for (const name of ["undici", "got", "axios"]) {
      expect(
        offenders(client.pattern, [{ name: "plant (dependency names)", text: dependencyNamesOf({ dependencies: { next: "^15", [name]: "^1" } }) }]),
        name
      ).toEqual(["plant (dependency names)"]);
    }
    for (const text of [
      'import { request } from "node:https";',
      'import { get } from "node:http";',
      'import https from "https";',
      'const http = require("http");',
      'const { request } = await import("node:https");',
    ]) {
      expect(offenders(node.pattern, [{ name: "worker/plant.ts", text }]), text).toEqual(["worker/plant.ts"]);
    }
    // NOT the names inside longer words or in prose.
    for (const text of ["const gotten = 1;", "// undici raises on a closed stream", 'import { x } from "./http-status";']) {
      expect(offenders(client.pattern, [{ name: "a.ts", text }]), text).toEqual([]);
      expect(offenders(node.pattern, [{ name: "a.ts", text }]), text).toEqual([]);
    }
  });

  it("R-141: every outbound call site is on the allowlist, and every entry is still reached", () => {
    // TWO-WAY. A site the list lacks is a new outbound producer nobody
    // reviewed; an entry the scan no longer finds is an allowlist rotting into
    // names nothing reaches. Both are red.
    const measured = outboundSites(sources.filter(({ name }) => !name.endsWith("(dependency names)")));
    expect(measured).toEqual(Object.keys(OUTBOUND_ALLOWLIST).sort());
    for (const [site, reason] of Object.entries(OUTBOUND_ALLOWLIST)) {
      expect(reason.length, `${site} is allowlisted with no stated origin`).toBeGreaterThan(20);
    }
  });

  it("R-141: each fetch-shaped site is called with its pinned argument, and nothing else", () => {
    // PER SITE, READ FROM THE CALL. The two-way list above proves WHICH sites
    // exist; this proves WHAT each one fetches — every call in every listed
    // file, so a second `fetch(...)` with a row's URL in an allowlisted file
    // is red here even though its `<file> <callee>(` key is already listed.
    const measured = outboundFirstArguments(sources.filter(({ name }) => !name.endsWith("(dependency names)")));
    const expected = Object.entries(FIRST_ARGUMENT)
      .map(([site, argument]) => `${site} ${argument}`)
      .sort();
    expect(measured).toEqual(expected);
    // Every fetch-shaped allowlist entry carries its argument; only the two
    // SDK constructors are proved by imports instead.
    expect(Object.keys(FIRST_ARGUMENT).sort()).toEqual(
      Object.keys(OUTBOUND_ALLOWLIST).filter((site) => !site.includes(" new ")).sort()
    );
  });

  it("NON-VACUITY: a submitted URL fetched inside an ALLOWLISTED file is red, and the reader skips strings", () => {
    const resend = sources.find(({ name }) => name === "packages/auth/src/resend-mail.ts");
    expect(resend, "the mail port is not in the scanned population").toBeDefined();
    const planted = `${resend!.text}\nexport const leak = (row: { sourceUrl: string }) => doFetch(row.sourceUrl, {});\n`;
    expect(outboundFirstArguments([{ name: "packages/auth/src/resend-mail.ts", text: planted }])).toContain(
      "packages/auth/src/resend-mail.ts doFetch( row.sourceUrl"
    );
    // The argument reader stops at the top-level comma, not at one inside a
    // string or a nested call.
    expect(firstArgumentAt('fetch("a,b)", { x: f(1, 2) })', 5)).toBe('"a,b)"');
    expect(firstArgumentAt("fetch(build(a, b), init)", 5)).toBe("build(a, b)");
    expect(firstArgumentAt("fetch(`${A}${B}`)", 5)).toBe("`${A}${B}`");
  });

  it("R-141: SDK-borne outbound modules cannot reach a submitted URL", () => {
    // The call shape cannot see inside an SDK constructor, so for those two
    // modules the assertion is the IMPORT BOUNDARY: neither reads the trends
    // tables, so `trend_sources.source_url` cannot arrive in one.
    for (const file of SDK_BORNE) {
      const source = sources.find(({ name }) => name === file);
      expect(source, `${file} is not in the scanned population`).toBeDefined();
      const code = blankComments(source!.text);
      expect(code, `${file} imports the trends schema`).not.toMatch(/trends-schema|trends-storage/);
    }
  });

  it("NON-VACUITY: a planted outbound call to a submitted URL is red, in every callee shape", () => {
    // THE SHAPE THE RULE EXISTS FOR — a row's own URL, fetched.
    for (const planted of [
      'await fetch(row.sourceUrl);',
      'await fetchImpl(row.sourceUrl);',
      'await underlying(row.sourceUrl);',
      'await globalThis.fetch(row.sourceUrl);',
      'await doFetch(row.sourceUrl);',
      'const s = new Stripe(row.sourceUrl);',
      'const c = new S3Client({ endpoint: row.sourceUrl });',
    ]) {
      expect(
        outboundSites([{ name: "worker/planted.ts", text: planted }]),
        planted
      ).not.toEqual([]);
      // ...and it is red precisely because it is not on the allowlist.
      expect(
        outboundSites([{ name: "worker/planted.ts", text: planted }]).every(
          (site) => !(site in OUTBOUND_ALLOWLIST)
        )
      ).toBe(true);
    }
    // A call named in PROSE is not a call site.
    expect(outboundSites([{ name: "worker/planted.ts", text: "// await fetch(row.sourceUrl);\n" }])).toEqual([]);
  });

  /**
   * GATE L2: EVERY `sendOutbound` CALLER, as a list, each with how it hands
   * the sender an origin-pinned fetch. `sendOutbound` posts `payload.url`;
   * the pin is what makes "a submitted URL is never fetched" structural for
   * it, so a third caller with a bare `fetch` must be a red test.
   */
  const SEND_OUTBOUND_CALLERS: Readonly<Record<string, RegExp>> = {
    // `fetchImpl` is `originPinnedFetch(dsn.envelopeUrl, …)` whenever a DSN
    // exists; with none, `captureError` returns "disabled" before the send.
    "lib/telemetry.ts": /originPinnedFetch\(dsn\.envelopeUrl,/,
    // `ports.fetchImpl` is built by `activationEmitterPorts` as
    // `originPinnedFetch(sink.host, …)`; with no sink nothing is sent.
    "worker/activation-emitter.ts": /fetchImpl:\s*sink === null \? fetchImpl : originPinnedFetch\(sink\.host, fetchImpl\)/,
  };

  it("L2: every sendOutbound caller is listed, and each passes an origin-pinned fetch", async () => {
    const callers = sources
      .filter(({ name }) => !name.endsWith("(dependency names)"))
      .filter(({ name }) => name !== "packages/db/src/telemetry-sinks.ts")
      .filter(({ text }) => /\bsendOutbound\s*\(/.test(blankComments(text)))
      .map(({ name }) => name)
      .sort();
    expect(callers).toEqual(Object.keys(SEND_OUTBOUND_CALLERS).sort());
    for (const [file, pinned] of Object.entries(SEND_OUTBOUND_CALLERS)) {
      const code = blankComments(sources.find(({ name }) => name === file)!.text);
      expect(code, `${file} builds no origin-pinned fetch for sendOutbound`).toMatch(pinned);
    }
    // BEHAVIOUR for the worker's caller, not only text: the fetch its ports
    // hand `sendOutbound` refuses any origin but the configured sink's.
    let reached = 0;
    const ports = activationEmitterPorts(
      null as never,
      null as never,
      { POSTHOG_HOST: "https://eu.posthog.example", POSTHOG_PROJECT_KEY: "phc_test" },
      async () => {
        reached += 1;
        return new Response("");
      }
    );
    await expect(ports.fetchImpl("https://evil.example/row-source-url")).rejects.toThrow(/may only reach/);
    expect(reached).toBe(0);
    await expect(ports.fetchImpl("https://eu.posthog.example/capture/")).resolves.toBeInstanceOf(Response);
    expect(reached).toBe(1);
  });

  it("R-141: the origin-pinned wrapper refuses another origin before any fetch", async () => {
    // The pin is a CONTROL, not a comment: it is observed refusing. AWAITED,
    // because an unawaited `.rejects` assertion can resolve after the test has
    // already passed — a test that cannot fail on the defect it guards.
    let reached = false;
    const pinned = originPinnedFetch("https://a.example", async () => {
      reached = true;
      return new Response("");
    });
    await expect(pinned("https://b.example/x")).rejects.toThrow(
      /may only reach https:\/\/a\.example/
    );
    expect(reached, "the underlying fetch ran despite the refusal").toBe(false);
    // ...and an unparseable URL is refused rather than passed through.
    await expect(pinned("not a url")).rejects.toThrow(/unparseable/);
    expect(reached).toBe(false);
    // ...while the pinned origin itself goes through, so the wrapper is not
    // simply refusing everything.
    await expect(pinned("https://a.example/ok")).resolves.toBeInstanceOf(Response);
    expect(reached).toBe(true);
  });

  it("NON-VACUITY: the comment blanking and the runner exemption are both real", () => {
    const [scraping] = FORBIDDEN;
    // A dependency named in PROSE is not a dependency...
    expect(
      offenders(scraping.pattern, [
        { name: "prose.ts", text: "// a green Playwright run does not mean the journeys passed\n" },
        { name: "block.ts", text: "/* puppeteer is not used here */\n" },
      ])
    ).toEqual([]);
    // ...but the same word in CODE is, in the very same file shape.
    expect(
      offenders(scraping.pattern, [
        { name: "prose.ts", text: '// a green Playwright run\nimport "puppeteer";\n' },
      ])
    ).toEqual(["prose.ts"]);
    // The runner's config is exempt BY EXACT NAME, and a look-alike is not.
    expect(
      offenders(scraping.pattern, [
        { name: "playwright.config.ts", text: 'import { defineConfig } from "@playwright/test";' },
      ])
    ).toEqual([]);
    expect(
      offenders(scraping.pattern, [
        { name: "playwright-scraper.ts", text: 'import { chromium } from "playwright";' },
      ])
    ).toEqual(["playwright-scraper.ts"]);
    // ...and the exemption is a LIVE one: both named files are in the scanned
    // population, so the list cannot rot into two names nothing reaches.
    const names = sources.map((source) => source.name);
    for (const config of RUNNER_CONFIGS) expect(names).toContain(config);
  });

  it("NON-VACUITY: finds a planted scraping dependency by NAME in a manifest's dependency list", () => {
    // The manifest text scanned is the dependency-name list, not the raw JSON,
    // so a planted dependency has to be found in that derived shape — through
    // the SAME derivation the real manifests go through, not a re-typed copy.
    const planted: Manifest = { dependencies: { next: "^15", puppeteer: "^23" }, devDependencies: {} };
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "planted-manifest", text: dependencyNamesOf(planted) }])).toEqual(["planted-manifest"]);
  });

  it("NON-VACUITY: finds a planted scraping dependency in a NON-ROOT package manifest shape", () => {
    // The round-2 gap, as a specimen: a package manifest (name, private, its
    // own runtime dependencies) that carries the vendor SDK AND a scraper. The
    // real `packages/llm/package.json` has the first; this one adds the second.
    const packageShaped: Manifest & { name: string; private: boolean } = {
      name: "@respin/llm",
      private: true,
      dependencies: { "@anthropic-ai/sdk": "^0.50.0", zod: "^3", playwright: "^1.40" },
      devDependencies: { typescript: "^5", vitest: "^3" },
    };
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "packages/llm/package.json (dependency names)", text: dependencyNamesOf(packageShaped) }]))
      .toEqual(["packages/llm/package.json (dependency names)"]);
    // ...and the same scraper hidden in an optional or peer block is found too.
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "optional", text: dependencyNamesOf({ optionalDependencies: { cheerio: "^1" } }) }])).toEqual(["optional"]);
    expect(offenders(FORBIDDEN[0].pattern, [{ name: "peer", text: dependencyNamesOf({ peerDependencies: { selenium: "^4" } }) }])).toEqual(["peer"]);
  });

  it.each(FORBIDDEN)("contains no $id", ({ pattern }) => {
    expect(offenders(pattern, sources)).toEqual([]);
  });
});
