// THE MARKETING SURFACES ENTER THE CLAIMS CANON.
//
// WHY THIS FILE EXISTS (audit 2026-09-19 finding 28, phase-1 visual-v2 gate).
// The canon had no consumer for `app/(marketing)/audiences.ts` or
// `app/(marketing)/landing-sections.tsx`. Those carried "Respin learns your
// voice from your own posts" and "Log results. It learns you." on the live
// landing and on all three /for/<slug> variants — the canon's own flagship
// ban, because a brain is CONTEXT, never weights (R-8, non-negotiable 3) and
// nothing in this product learns. `app/(marketing)/page.tsx` said "built on
// mechanisms proven by posted results", which no posted result has ever
// backed. The suite was green throughout, because nothing read those files.
//
// WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, recorded because the second
// version is only trustworthy if the first one's failure is stated (batch-3
// gate, 2026-09-20):
//
//   1. It scanned route BODIES from a directory read — sound — and collected
//      metadata for ONE route by hand. `changelog/page.tsx`, `legal/page.tsx`
//      and the ROOT `app/layout.tsx` export `metadata` that no scan read, and
//      `app/layout.tsx` is where the landing's real `<meta description>` lives.
//      That is non-negotiable 7 in the file whose header cited it.
//   2. `MARKETING_CLAIMS` held one entry, taken from the single sentence a
//      reviewer had quoted. The landing FOOTER — rendered on all four routes —
//      said "built on mechanisms that perform", and this scan rendered it four
//      times per run and returned clean.
//   3. It inlined a fifth private copy of the canon predicate, in the same
//      week a register entry asked for exactly one shared copy.
//
// All three are fixed below; `claimHits` is that one shared copy.
//
// WHICH LISTS APPLY, stated because a scan's scope is what people over-read:
//
//   - `FORBIDDEN_CLAIMS` — capability and certainty. A marketing visitor has
//     strictly less ability to check these than a signed-in creator.
//   - `PERFORMANCE_CLAIMS` — how a piece of content will DO once posted. The
//     landing is the one surface built to sell, so this is where it would say
//     "more views".
//   - `MARKETING_CLAIMS` — sales-only shapes; see that list for why they are
//     not in the shared canon.
//   - `NOT_BUILT_YET` is DELIBERATELY NOT APPLIED. It bans `generat`,
//     `script`, `hook` and `analy` on screens that do not do the thing. The
//     product does all four, and "a script you can film" is the honest name
//     for what the landing sells. `/studio` left the same list in slice 6.
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Metadata } from "next";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIENCES } from "../app/(marketing)/audiences";
import {
  FORBIDDEN_CLAIMS,
  MARKETING_CLAIM_GAPS,
  MARKETING_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

// The landing's proof slot is a SERVER component that reads the public Sample
// Spin rollout flag through the credits facade. `vi.hoisted` rather than a
// closed-over `const`: the factory is hoisted above every import, and the
// plain-`const` form only survived because no static import in this file
// transitively reached the facade. Adding one would have turned it into a TDZ
// error with a misleading message (batch-3 gate, N-10).
const mocks = vi.hoisted(() => ({ publicSampleSpinEnablement: vi.fn() }));
vi.mock("@respin/credits/app-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@respin/credits/app-server")>();
  return {
    ...actual,
    // SPREAD, not replaced: a wholesale single-method object turns any future
    // `respinCredits.*` call on a marketing route into "undefined is not a
    // function" rather than into a claim finding (batch-3 gate, N-10).
    respinCredits: { ...actual.respinCredits, publicSampleSpinEnablement: mocks.publicSampleSpinEnablement },
  };
});

// `app/layout.tsx` is imported for its `metadata` — the landing's real
// `<meta name="description">`, and the producer the first version of this scan
// missed. Its font imports are Next's build-time loaders and do not resolve
// under vitest's node environment; only the CSS variable names are used, and
// nothing here renders the layout. The `metadata` object itself is the real
// one, not a stub, which is the whole point of importing the module.
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "--font-geist-sans" } }));
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "--font-geist-mono" } }));

const APPLIED = [FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS, MARKETING_CLAIMS] as const;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app");
const marketingDir = join(appDir, "(marketing)");

const rel = (full: string): string => relative(marketingDir, full).split(sep).join("/");

/**
 * Every Next file kind that may export `metadata` for a route.
 *
 * A LIST, NOT A PRODUCER (non-negotiable 7). It is the documented set of
 * special files Next reads, not the two this repo happens to have.
 */
const ROUTE_MODULE =
  /^(page|layout|not-found|error|global-error|loading|template|default)\.tsx$/;

/**
 * Every `page.tsx` under `app/(marketing)`.
 *
 * The guard's POPULATION, produced by reading the directory rather than by
 * listing this file's imports. The rendered set is asserted equal to it, so a
 * new marketing route is a red test until somebody renders it here.
 */
function everyMarketingRoute(): string[] {
  return marketingModules((name) => name === "page.tsx");
}

/** Every file under `app/(marketing)` whose basename the predicate accepts. */
function marketingModules(accept: (name: string) => boolean): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (accept(entry.name)) found.push(rel(full));
    }
  };
  walk(marketingDir);
  return found.sort();
}

/**
 * Every module a marketing visitor's browser takes METADATA from.
 *
 * DERIVED THE SAME WAY THE ROUTE SET IS, and that is the whole point of this
 * function existing. The first version invoked `generateMetadata` for the
 * audience route and nothing else, so three producers — two page modules and
 * the root layout — were outside the scan while the file's own header claimed
 * a derived population. A metadata producer is any marketing `page.tsx` that
 * exports `metadata` or `generateMetadata`, PLUS `app/layout.tsx`, which is
 * not under `(marketing)` at all and supplies the description for every route
 * that does not override it — including the landing, which exports none.
 */
function everyMetadataProducer(): string[] {
  // Every marketing page is a producer whether or not it exports metadata
  // today: a route that exports none inherits the root layout's, and a route
  // that starts exporting some must not thereby enter the scan silently. So
  // the set is "every route, plus every LAYOUT, plus the root layout", and a
  // module with no export contributes empty text rather than being absent
  // from the population.
  //
  // LAYOUTS ARE PRODUCERS TOO, and leaving them out was this scan's second
  // hand-written population (batch-4 gate). Next merges a segment layout's
  // `metadata` into every route beneath it, so an `app/(marketing)/layout.tsx`
  // added tomorrow would supply a title and description to all four marketing
  // routes while this file read none of it. There is no such file today —
  // which is exactly when a population is cheap to widen and impossible to
  // remember later.
  // THE ARGUMENT ABOVE WAS APPLIED TO ONE MEMBER OF A CLASS (batch-5
  // compliance gate, C-6). Next exports `metadata` from `not-found.tsx`,
  // `error.tsx`, `loading.tsx`, `template.tsx`, `default.tsx` and
  // `global-error.tsx` too, and every one is a page a visitor can land on.
  // Measured 2026-09-21: none exists under `(marketing)` today — which is
  // the same reason the docblock gives for adding layouts, so the whole
  // class is named now rather than the next member being remembered later.
  return [
    "../layout.tsx",
    ...marketingModules((name) => ROUTE_MODULE.test(name)),
  ];
}

/**
 * Every string inside one metadata object.
 *
 * DERIVED BY WALKING THE OBJECT, not by naming fields. The version that read
 * `title` and `description` alone could not see `openGraph.description`,
 * `twitter.title`, `keywords` or `applicationName` — all of which a crawler
 * and a social card show a visitor, and any of which can carry a claim. A
 * field population written as the two fields somebody had in mind is
 * non-negotiable 7 inside the scan that exists to close it.
 *
 * A `URL` object — Next's metadata base — is not a string and contributes
 * nothing, which is correct: a host name is not a sentence.
 */
function metaStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  return Object.values(value as Record<string, unknown>).flatMap((inner) =>
    metaStrings(inner, seen)
  );
}

/** The text of one metadata object — every string it carries, at any depth. */
const metaText = (meta: Metadata | undefined): string =>
  metaStrings(meta).join(" ");

/**
 * A route module's own `metadata`, if it exports one.
 *
 * `app/(marketing)/page.tsx` exports NONE — which is exactly why the root
 * layout is in the population — so this is read structurally rather than by
 * type. A route that starts exporting metadata is picked up with no edit here;
 * one that stops contributes empty text instead of vanishing from the scan.
 */
const moduleMeta = (mod: unknown): Metadata | undefined => (mod as { metadata?: Metadata }).metadata;

/**
 * Every metadata producer's module, LOADED FROM THE GLOB rather than listed.
 *
 * `import.meta.glob` is resolved by the bundler from the pattern, so the set
 * of modules this file can load is the set on disk — a new `layout.tsx` or a
 * new route is loadable with no edit here, and the population assertion below
 * compares the loaded keys to a fresh directory read. A hand-written import
 * list would make "the population is derived" a sentence rather than a fact,
 * which is what the first version of this file got wrong.
 */
// `import.meta.glob` is Vite's, resolved at transform time. It is declared
// here rather than by pulling `vite/client` into this workspace's types: one
// call site needs it, and the signature it needs is this narrow.
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

// THE PATTERN COVERS ALL OF `app/` AND THE FILTER IS IN CODE, deliberately.
// A glob scoped to the `(marketing)` segment matches NOTHING: the parentheses
// are an extglob GROUP to the matcher, so the pattern asks for
// `app/marketing/…`, which does not exist — and a glob that matches nothing
// yields an empty module map and a scan that reads no metadata at all,
// silently. Measured here, not assumed (2026-09-20). Widening the glob and
// filtering the keys cannot fail that way: the keys are asserted against a
// directory read below.
const PRODUCER_MODULES: Record<string, () => Promise<unknown>> =
  Object.fromEntries<() => Promise<unknown>>(
    Object.entries(import.meta.glob("../app/**/*.tsx")).flatMap(
      ([spec, load]) => {
        if (spec === "../app/layout.tsx") return [["../layout.tsx", load] as const];
        if (!spec.startsWith("../app/(marketing)/")) return [];
        const name = spec.replace("../app/(marketing)/", "");
        return ROUTE_MODULE.test(name.split("/").pop()!)
          ? [[name, load] as const]
          : [];
      }
    )
  );

/** The audience route's own metadata, one entry per shipped audience. */
async function audienceMetaText(mod: unknown): Promise<string> {
  const generate = (
    mod as {
      generateMetadata?: (args: {
        params: Promise<{ audience: string }>;
      }) => Promise<Metadata>;
    }
  ).generateMetadata;
  if (!generate) return "";
  const parts: string[] = [];
  for (const audience of AUDIENCES) {
    parts.push(metaText(await generate({ params: Promise.resolve({ audience: audience.slug }) })));
  }
  return parts.join("\n");
}

type Scanned = { rendered: Record<string, string>; metadata: Record<string, string> };

/** Every marketing route's rendered HTML, and every metadata producer's text. */
async function scanEverything(): Promise<Scanned> {
  const { default: LandingPage } = await import("../app/(marketing)/page");
  const { default: AudiencePage } = await import(
    "../app/(marketing)/for/[audience]/page"
  );
  const changelog = await import("../app/(marketing)/changelog/page");
  const legal = await import("../app/(marketing)/legal/page");

  const rendered: Record<string, string> = {
    "page.tsx": renderToStaticMarkup(<LandingPage />),
    "changelog/page.tsx": renderToStaticMarkup(<changelog.default />),
    "legal/page.tsx": renderToStaticMarkup(<legal.default />),
  };

  const audienceParts: string[] = [];
  for (const audience of AUDIENCES) {
    audienceParts.push(
      renderToStaticMarkup(await AudiencePage({ params: Promise.resolve({ audience: audience.slug }) }))
    );
  }
  rendered["for/[audience]/page.tsx"] = audienceParts.join("\n");

  // METADATA IS READ FROM THE POPULATION, not from a list beside it. Every
  // producer on disk is loaded, its static `metadata` and its
  // `generateMetadata` are both taken, and a producer exporting neither
  // contributes empty text rather than dropping out of the scan. The landing
  // exports NO metadata of its own, so the root layout's is what a visitor and
  // a crawler actually receive for `/`.
  const metadata: Record<string, string> = {};
  for (const producer of everyMetadataProducer()) {
    const load = PRODUCER_MODULES[producer];
    if (!load) throw new Error(`${producer} is on disk but the glob did not load it`);
    const mod = await load();
    metadata[producer] = [metaText(moduleMeta(mod)), await audienceMetaText(mod)]
      .join(" ")
      .trim();
  }
  return { rendered, metadata };
}

beforeEach(() => {
  mocks.publicSampleSpinEnablement.mockReset();
  mocks.publicSampleSpinEnablement.mockReturnValue("disabled");
});

describe("the marketing surfaces pass the claims canon", () => {
  it("the scanned population is every marketing route on disk plus every metadata producer", async () => {
    const onDisk = everyMarketingRoute();
    const { rendered, metadata } = await scanEverything();
    expect(Object.keys(rendered).sort()).toEqual(onDisk);
    // Metadata is derived the same way, and INCLUDES the root layout, which is
    // outside `(marketing)` and is the landing's real description.
    expect(Object.keys(metadata).sort()).toEqual([...everyMetadataProducer()].sort());
    // Not vacuous: the four routes REQ-H01 names are really there.
    expect(onDisk).toEqual([
      "changelog/page.tsx",
      "for/[audience]/page.tsx",
      "legal/page.tsx",
      "page.tsx",
    ]);
  });

  it("no marketing route or metadata claims anything the applied lists forbid (shipped mockup branch)", async () => {
    const { rendered, metadata } = await scanEverything();
    for (const [route, html] of Object.entries(rendered)) {
      expect(claimHits(html, ...APPLIED), route).toEqual([]);
    }
    for (const [producer, text] of Object.entries(metadata)) {
      expect(claimHits(text, ...APPLIED), `metadata: ${producer}`).toEqual([]);
    }
  });

  it("no marketing surface ships a sentence the vocabulary was MEASURED to miss", async () => {
    // THE GAP LIST BECOMES A GUARD (batch-5 compliance gate, C-5).
    //
    // `MARKETING_CLAIM_GAPS` records six sales sentences the three marketing
    // patterns cannot reach. Until now that record was only an assertion that
    // they still escape — honest about the vocabulary's scope, and no defence
    // at all: `"Audiences punish it."` was live on all four marketing routes
    // while the list documented that it was allowed to be.
    //
    // This does not close the class — closing it needs the generator over
    // {subject} x {outcome} x {hedge} the card names as the next mechanism.
    // It closes the SIX, exactly and cheaply, which is the difference between
    // recording a measurement and acting on it.
    const { rendered, metadata } = await scanEverything();
    const surfaces: Record<string, string> = {
      ...rendered,
      ...Object.fromEntries(
        Object.entries(metadata).map(([key, text]) => [`metadata: ${key}`, text])
      ),
    };
    // Non-vacuity: an empty surface map would pass every case below.
    expect(Object.keys(surfaces).length).toBeGreaterThan(5);
    for (const [where, text] of Object.entries(surfaces)) {
      const lower = text.toLowerCase();
      for (const gap of MARKETING_CLAIM_GAPS) {
        expect(lower, `${where} ships a recorded gap verbatim: ${gap}`).not.toContain(
          gap.toLowerCase()
        );
      }
    }
  });

  it("NON-VACUITY: the gap guard catches the sentence that actually shipped", () => {
    // `"Audiences punish it."` was on `page.tsx:29` and `audiences.ts:47,75,103`
    // until 2026-09-20. The canon still does not see it — that is the point of
    // the gap list — so the guard above is what would now stop it.
    const planted = "<p>Audiences punish it.</p>".toLowerCase();
    expect(
      claimHits(planted, ...APPLIED),
      "the canon has started catching this — edit MARKETING_CLAIM_GAPS in the same change"
    ).toEqual([]);
    expect(
      MARKETING_CLAIM_GAPS.some((gap) => planted.includes(gap.toLowerCase()))
    ).toBe(true);
  });

  it("nor with the public Sample Spin open — and the preview branch is proved taken", async () => {
    mocks.publicSampleSpinEnablement.mockReturnValue("preview");
    const { rendered, metadata } = await scanEverything();
    // THE POSITIVE WITNESS. Without it this test passes whether or not the
    // mock reaches `SampleSpinOrMockup` — and that component swallows a failed
    // flag read into the mockup branch, so the failure would be silent
    // (batch-3 gate, compliance). Proving the branch was TAKEN is what makes
    // the scan below worth reading.
    expect(rendered["page.tsx"], "the preview branch did not render").toContain("NOTHING YOU TYPE IS KEPT");
    expect(rendered["page.tsx"]).not.toContain("THE SAME IDEA, ANY CHAT MODEL");
    for (const [route, html] of Object.entries(rendered)) {
      expect(claimHits(html, ...APPLIED), route).toEqual([]);
    }
    for (const [producer, text] of Object.entries(metadata)) {
      expect(claimHits(text, ...APPLIED), `metadata: ${producer}`).toEqual([]);
    }
  });

  it("the scan really reached each route's own copy, not just the shared bands", async () => {
    const { rendered, metadata } = await scanEverything();
    // ONE WITNESS PER ROUTE, against a string only that route can produce. The
    // first version witnessed the audience route and one shared-band string,
    // which any page rendering the bands satisfies — so two of four routes
    // could have rendered near-empty markup with every scan still green.
    expect(rendered["page.tsx"]).toContain("Leave with a script you can film");
    expect(rendered["changelog/page.tsx"]).toContain("What has shipped, by date");
    expect(rendered["legal/page.tsx"]).toContain("not published yet");
    expect(AUDIENCES.length).toBeGreaterThan(0);
    for (const audience of AUDIENCES) {
      expect(rendered["for/[audience]/page.tsx"], audience.slug).toContain(audience.h1Turn);
      expect(metadata["for/[audience]/page.tsx"], audience.slug).toContain(audience.metaTitle);
      // The exact field the original BLOCK was found in.
      expect(metadata["for/[audience]/page.tsx"], audience.slug).toContain(audience.metaDescription);
    }
    // ...and the root layout's description really is in the scanned metadata,
    // which is the producer the first version missed entirely.
    expect(metadata["../layout.tsx"]).toContain("Scripts in your voice");
  });

  it.each(specimensFor(...APPLIED))(
    "PLANTED: %s is caught inside a real rendered route, not just in a bare string",
    async (label, specimen) => {
      const { rendered } = await scanEverything();
      expect(claimHits(`${rendered["page.tsx"]}<p>${specimen}</p>`, ...APPLIED)).toContain(label);
    }
  );

  /**
   * THE SHIPPED SENTENCES, each named with the claim that must catch it.
   *
   * Every one of these was live on this tree at some point and was found by a
   * reviewer or an audit rather than by this scan. Keeping them here means a
   * weakened pattern goes red on the exact text it was written for.
   */
  it("PLANTED: every sentence this surface actually shipped is caught, by the claim that names it", () => {
    const shipped: readonly [string, string][] = [
      [
        "Scripts that sound like you, mapped to shots you can film solo. Respin learns your voice from your own posts and nothing activates until you confirm it.",
        "learn",
      ],
      ["Log results. It learns you.", "learn"],
      [
        "Respin turns your idea into a shot-mapped script in your voice, built on mechanisms proven by posted results.",
        "proven",
      ],
      // The one the FIRST version of this scan rendered four times and passed.
      ["Scripts in your voice, built on mechanisms that perform.", "that performs"],
      ["It never promises virality.", "viral"],
      ["Hey guys! Today we are going to talk about a game-changing training secret.", "train"],
      ["Every program you have ever bought is wrong about training to failure.", "train"],
    ];
    for (const [sentence, label] of shipped) {
      expect(claimHits(sentence, ...APPLIED), sentence).toContain(label);
    }
  });
});
