// THE APP SURFACE, DERIVED — not enumerated (round-3 meta-finding).
//
// Both guard suites in this directory used to answer "is this file an
// entrypoint?" with a hand-written list of FILENAMES:
//
//   ENTRYPOINT_FILES = ["page.tsx", "route.ts", "actions.ts"]
//
// Every one of those three names is an accident of how this repo happens to
// spell things, and all three holes were live at once:
//
//   1. `page.ts` / `page.js` / `page.jsx` are served by Next exactly like
//      `page.tsx` — its `pageExtensions` default is ['tsx','ts','jsx','js']
//      (node_modules/next/dist/server/config-shared.js). The tenancy gate
//      planted `app/(product)/zzbrain2/page.ts`, `app/(product)/settings/
//      zzsub/page.ts` and `app/(admin)/admin/zztools/page.ts`; the suite
//      stayed 15/15 GREEN and a keyless `next build` listed all three as live
//      dynamic routes, one of them with no `requireAdmin` anywhere in it.
//   2. A `"use server"` module is a POST endpoint with a stable action id no
//      matter what it is called. The billing gate renamed a planted ungated
//      fixture from `actions.ts` to `mutations.ts` and `findUnguarded`
//      returned `[]`.
//   3. `app/api/**` was excluded from the default-deny walk entirely, so a
//      planted `app/api/zzbrain/route.ts` returning cross-workspace data
//      passed 29/29 with lint clean.
//
// So this module answers the question by PROPERTY:
//
//   - a file Next serves at a URL of its own — basename in
//     URL_ENTRYPOINT_BASENAMES with an extension Next itself will pick up; or
//   - a file whose FIRST directive is "use server", by any name.
//
// and the extension set is read out of the installed Next rather than typed
// here, with a PIN in gate-completeness.test.ts giving deliberate notice if a Next
// upgrade moves it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { defaultConfig } from "next/dist/server/config-shared";
import { isMetadataRouteFile } from "next/dist/lib/metadata/is-metadata-route";
import nextConfig from "../../next.config";

/**
 * The extensions Next will treat as routable, DERIVED: this project's own
 * `pageExtensions` if it sets one, otherwise the installed Next's default.
 */
export const PAGE_EXTENSIONS: readonly string[] =
  nextConfig.pageExtensions ?? (defaultConfig.pageExtensions as string[]);

/** What the installed Next ships as its default — for the pin below. */
export const NEXT_DEFAULT_PAGE_EXTENSIONS = defaultConfig.pageExtensions as
  | string[]
  | undefined;

/**
 * The set this repo was written against. The WALK is derived, so a Next
 * upgrade that adds an extension widens coverage automatically — this pin
 * exists so the change is NOTICED (someone re-reads the fixtures and the
 * lint globs) instead of landing silently, and so a derivation that silently
 * returned `undefined` or `[]` (a moved internal path) cannot pass for
 * "no entrypoints found".
 */
export const PINNED_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/**
 * Basenames Next serves AT A URL OF THEIR OWN, i.e. independently reachable by
 * a request. `layout`/`template`/`default`/`error`/`not-found`/`loading` are
 * deliberately NOT here: they have no URL, they render only beneath a page
 * that has already had to pass its own gate, and this repo's doctrine
 * (middleware.ts) is explicitly that "the layout is not the gate". Requiring a
 * URL prefix for `app/(product)/layout.tsx` would also be nonsense — its URL
 * is the group root, `/`.
 */
export const URL_ENTRYPOINT_BASENAMES = ["page", "route"] as const;

/**
 * Next's METADATA file conventions. These ARE URL-addressable
 * (`/usage/opengraph-image`, `/sitemap.xml`, …), so they are treated as
 * entrypoints and must be gated or explicitly allowlisted.
 *
 * DERIVED, not enumerated (phase-4 round-3 tenancy CHANGE). This list used to
 * be seven exact basenames, which was the SAME defect as the filename list
 * this module exists to kill — one level down. Next builds the four
 * STATIC_METADATA_IMAGES matchers with a `'\\d?'` variant suffix
 * (node_modules/next/dist/lib/metadata/is-metadata-route.js), so
 * `opengraph-image2`, `icon2`, `apple-icon3` … are metadata routes too — while
 * `sitemap` takes no such suffix, so `sitemap2` is NOT one (round-4 tenancy
 * NOTE corrected the earlier "every image and sitemap matcher" wording here;
 * both directions are now asserted in gate-completeness.test.ts). The
 * tenancy gate planted `app/(product)/usage/opengraph-image2.tsx`: it was
 * classified `"module"`, the suite stayed green, and a keyless `next build`
 * served `/usage/opengraph-image2-1m8hwu` — a URL-addressable file under a
 * PROTECTED prefix carrying no gate. So we now ask the installed Next itself,
 * via its exported `isMetadataRouteFile`, exactly as PAGE_EXTENSIONS asks it
 * for the extension set.
 *
 * The literal list below is kept ONLY as the non-vacuity pin for that
 * derivation (gate-completeness.test.ts asserts Next agrees these are metadata
 * routes AND that it also catches the numeric variants this list cannot spell).
 */
export const METADATA_ROUTE_BASENAMES = [
  "sitemap",
  "robots",
  "manifest",
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
] as const;

/**
 * True when the installed Next serves this file as a metadata route.
 *
 * DELIBERATELY basename-only. `isMetadataRouteFile` wants a path with a leading
 * slash, and five of its eight regexes are `[\\/]name…$` — unanchored and
 * filename-terminal — so a bare `/name.ext` satisfies them identically to a
 * full app-relative path. The three that differ (`robots`, `manifest`,
 * `favicon.ico`) are `^`-anchored root-only conventions, so passing the
 * basename over-classifies a NESTED `robots.tsx` as an entrypoint. That is the
 * safe direction for a guard: under default-deny, over-classifying means "must
 * be gated or explicitly listed", and the round-4 tenancy probe confirmed a
 * planted `(product)/usage/robots.tsx` goes red rather than silent.
 *
 * (No appRoot parameter: there is no caller that wants the looser answer, and a
 * two-mode helper with one live mode is a claim nothing exercises.)
 */
export function isMetadataRoute(file: string): boolean {
  return isMetadataRouteFile("/" + basename(file), PAGE_EXTENSIONS as string[], true);
}

/** Roots both guard suites scan. ONE definition, both readers (round-3 meta). */
export const SCAN_ROOTS = ["app", "lib", "middleware.ts"] as const;

/** Every extension that can carry code in this tree (superset of the routable set). */
export const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"] as const;

export type AppFileKind =
  | "url-entrypoint"
  | "server-actions"
  | "layout-family"
  | "module";

/** Length-preserving comment blanking, LINE comments first (the AC-9 trap). */
export function blankComments(src: string): string {
  const noLine = src.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return noLine.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * True when the file's FIRST statement is the `"use server"` directive.
 *
 * Not a substring search: `billing-errors.ts` and `config-form-state.ts` both
 * discuss `"use server"` in prose and are NOT server-action modules — they are
 * this check's live non-vacuity cases.
 */
export function isUseServerModule(src: string): boolean {
  // trimStart, not a hand-rolled character class: ECMAScript counts U+FEFF
  // (the BOM readFileSync("utf8") leaves in place) as WhiteSpace, so a file
  // saved with a BOM still has its directive seen as first. Asserted below.
  const head = blankComments(src).trimStart();
  return /^(["'])use server\1\s*;?/.test(head);
}

/** Every code file under a root (which may itself be a file, e.g. middleware.ts). */
export function walkCodeFiles(root: string): string[] {
  let stat;
  try {
    stat = statSync(root);
  } catch {
    return []; // a scan root that does not exist yet is not a silent pass —
    // callers assert the total is non-trivial.
  }
  if (!stat.isDirectory()) {
    return CODE_EXTENSIONS.includes(extname(root) as (typeof CODE_EXTENSIONS)[number])
      ? [root]
      : [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => {
    const full = join(root, e.name);
    if (e.isDirectory()) return walkCodeFiles(full);
    return CODE_EXTENSIONS.includes(extname(e.name) as (typeof CODE_EXTENSIONS)[number])
      ? [full]
      : [];
  });
}

function stem(file: string): string {
  return basename(file, extname(file));
}

function isRoutableExtension(file: string): boolean {
  return PAGE_EXTENSIONS.includes(extname(file).slice(1));
}

/** Classify one file under app/ by PROPERTY (see the header). */
export function classifyAppFile(file: string): AppFileKind {
  const name = stem(file);
  if (isRoutableExtension(file)) {
    if ((URL_ENTRYPOINT_BASENAMES as readonly string[]).includes(name)) {
      return "url-entrypoint";
    }
    if (isMetadataRoute(file)) {
      return "url-entrypoint";
    }
    if (
      ["layout", "template", "default", "error", "global-error", "not-found", "loading"].includes(
        name
      )
    ) {
      return "layout-family";
    }
  }
  let src = "";
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return "module";
  }
  return isUseServerModule(src) ? "server-actions" : "module";
}

/**
 * Every INDEPENDENTLY REACHABLE file under an app root: a URL entrypoint, or a
 * `"use server"` module by any name. This is what both guard suites walk.
 */
export function findAppEntrypoints(appRoot: string): string[] {
  return walkCodeFiles(appRoot).filter((f) => {
    const kind = classifyAppFile(f);
    return kind === "url-entrypoint" || kind === "server-actions";
  });
}

/** URL for an app-router file: strip (groups), drop the filename. */
export function urlForAppFile(appRoot: string, file: string): string {
  const segments = relative(appRoot, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}
