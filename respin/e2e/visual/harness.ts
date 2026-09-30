// Loopback-only fixture server.
//
// It renders the REAL production components — the shell comes from
// `app/(product)/product-shell.tsx`, the same component `layout.tsx` renders —
// with synthetic DATA and finite synthetic transport responses. The earlier
// wording, "runs the current production UI", was true of the components and
// false of the composition: the shell markup was hand-copied here, so the
// phase-1 design score was awarded to a replica (phase-1 gate). That copy is
// gone; what remains fixture-owned is stated exactly.
//
// What this is NOT, so no capture is mistaken for it: there is no Next route
// or layout composition, no Better Auth session, no database, no server action
// and no real settlement. `sample-spin-section` is substituted at the esbuild
// boundary. Authenticated application evidence is Phase 5's assembled-app run
// (V2-R2); nothing here discharges it.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, sep, extname } from "node:path";
import type { FixtureProps, Surface } from "./fixtures";
import type { FullConfig } from "@playwright/test";

// The sanctioned command runs from respin/. Avoid import.meta: Playwright's
// teardown loader and the tsx server use different module transforms.
const root = process.cwd();
const fixtureRequire = createRequire(resolve(root, "package.json"));
const tsxRequire = createRequire(fixtureRequire.resolve("tsx/package.json"));
const esbuild = tsxRequire("esbuild") as {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { path: string; text: string }[] }>;
  stop(): Promise<void>;
};
const output = resolve(root, ".tmp/visual");
mkdirSync(output, { recursive: true });
const adapter = resolve(root, "e2e/visual/fixtures.tsx");
async function start() {
const common = {
  absWorkingDir: root, bundle: true, write: false, jsx: "automatic",
  alias: {
    "next/navigation": adapter, "next/image": adapter, "@respin/auth/client": adapter,
  },
  plugins: [{
    name: "finite-sample-transport",
    setup(build: { onResolve(options: { filter: RegExp }, callback: () => { path: string }): void }) {
      build.onResolve({ filter: /sample-spin-section$/ }, () => ({ path: adapter }));
    },
  }],
};
const serverPath = resolve(output, "fixture.cjs");
const server = await esbuild.build({
  ...common, entryPoints: ["e2e/visual/fixtures.tsx"], platform: "node",
  packages: "external", format: "cjs", outfile: serverPath,
});
writeFileSync(serverPath, server.outputFiles[0].text);
const { renderFixture, themeBootstrap, SURFACES } = fixtureRequire(serverPath) as {
  renderFixture: (props: FixtureProps) => string; themeBootstrap: string; SURFACES: Surface[];
};
const client = await esbuild.build({
  ...common, entryPoints: ["e2e/visual/entry.tsx"], platform: "browser",
  outfile: resolve(output, "entry.js"), define: { "process.env.NODE_ENV": '"development"' },
  external: ["/marketing/*"],
});
const js = client.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
const css = client.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
await esbuild.stop();
const fontRoot = resolve(root, "node_modules/geist/dist/fonts");
const publicRoot = resolve(root, "public");
const mime: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
const fontCss = '@font-face{font-family:Geist;src:url("/fixture-font/sans.woff2");font-weight:100 900}@font-face{font-family:"Geist Mono";src:url("/fixture-font/mono.woff2");font-weight:100 900}:root{--font-geist-sans:Geist;--font-geist-mono:"Geist Mono"}';

const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:8137");
  function send(body: string | Buffer, type: string, status = 200) {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body);
  }
  if (req.method === "POST" && url.pathname === "/__shutdown") {
    if (!process.env.RESPIN_VISUAL_RUN_ID || req.headers["x-visual-run"] !== process.env.RESPIN_VISUAL_RUN_ID) {
      return send("Not this fixture run", "text/plain", 403);
    }
    send("Fixture stopped", "text/plain");
    http.close(() => process.exit(0));
    return;
  }
  if (req.method === "POST" && url.pathname === "/__auth") {
    return send(JSON.stringify({ error: { message: "Synthetic sign-in refusal. Check your details and try again." } }), "application/json");
  }
  if (req.method !== "GET") return send("Fixture method refused", "text/plain", 405);
  if (url.pathname === "/entry.js") return send(js, "text/javascript");
  if (url.pathname === "/entry.css") return send(fontCss + css, "text/css");
  if (url.pathname === "/favicon.ico") return send("", "image/x-icon", 204);
  const fonts: Record<string, string> = {
    "/fixture-font/sans.woff2": resolve(fontRoot, "geist-sans/Geist-Variable.woff2"),
    "/fixture-font/mono.woff2": resolve(fontRoot, "geist-mono/GeistMono-Variable.woff2"),
  };
  if (fonts[url.pathname]) return send(readFileSync(fonts[url.pathname]), "font/woff2");
  if (/^\/(marketing|illustrations)\//.test(url.pathname)) {
    const path = resolve(publicRoot, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(publicRoot + sep) || !mime[extname(path)] || !existsSync(path)) return send("Missing fixture asset", "text/plain", 404);
    return send(readFileSync(path), mime[extname(path)]);
  }
  if (url.pathname !== "/") return send("Unknown fixture route", "text/plain", 404);
  const surface = url.searchParams.get("surface") ?? "shell";
  if (!SURFACES.includes(surface as Surface)) return send("Unknown surface", "text/plain", 400);
  const props: FixtureProps = {
    surface: surface as Surface,
    balance: url.searchParams.get("balance") === "null" ? null : url.searchParams.get("balance") === "zero" ? 0 : 250,
    longName: url.searchParams.has("long"),
  };
  const data = JSON.stringify(props).replaceAll("<", "\\u003c");
  send(`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Respin synthetic visual fixture</title><script>${themeBootstrap}</script><link rel="stylesheet" href="/entry.css"></head><body><div id="fixture">${renderFixture(props)}</div><script type="application/json" id="fixture-props">${data}</script><script src="/entry.js"></script></body></html>`, "text/html");
}).listen(8137, "127.0.0.1", () => console.log("Visual fixtures at http://127.0.0.1:8137"));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(root, "e2e/visual/harness.ts")) {
  start().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}

export default async function teardown(config: FullConfig) {
  const response = await fetch("http://127.0.0.1:8137/__shutdown", {
    method: "POST", headers: { "x-visual-run": config.metadata.visualRunId },
  });
  if (!response.ok) throw new Error("Owned visual fixture did not shut down");
}
