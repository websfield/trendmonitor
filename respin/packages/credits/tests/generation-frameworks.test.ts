// THE FRAMEWORK LIBRARY AS GENERATION CONTEXT (slice 7, R1/R5b/R9a/R17).
//
// PURE — nothing here opens a database. What it drives is the pair of functions
// that turn already-read `frameworks` rows into the two things the rest of the
// system needs: the `{name, summary}` pairs `@respin/modes` puts in a prompt,
// and the `{id, version}` provenance `generations.framework_versions` records.
//
// THE CROSS-CHECK IS THE POINT OF THIS FILE. `packages/modes`'
// `framework_eligibility` decides whether a named framework is one this
// generation was OFFERED, and `frameworkVersionsUsed` decides which offered row
// a named framework IS. Those are two implementations of the same matching
// question in two packages, and CLAUDE.md's rule about a guard whose promise
// depends on another component's behaviour applies exactly: the property is
// driven GENERATIVELY against the real `scanModeChecks`, not asserted in prose.
// If they disagree, a settled output names a framework the row records no
// provenance for — R9a's whole claim, silently false.
//
// AND R17'S MEASUREMENT. The card says this slice "must not exceed §7's budget
// by adding six modes' worth of context to the same call", and says to MEASURE
// the growth rather than assert it is fine. The last describe block does that
// against the real seeded library, prints the arithmetic, and pins the number
// so a library that doubles is a red test rather than a slower product.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_EVIDENCE_LABEL,
  MODE_IDS,
  MODE_SPECS,
  assembleGenerationPrompt,
  scanModeChecks,
  type Framework,
  type GenerationContext,
  type ScriptOutput,
} from "@respin/modes";
import {
  CONFIG_V1_SEED,
  FRAMEWORK_CONFIDENCE_RUNGS,
  SATURATION_NOTICE,
  SHARED_FRAMEWORK_SEED,
  deriveFrameworkConfidence,
  frameworkSlug,
  type Framework as FrameworkRow,
  type FrameworkContent,
} from "@respin/db";
import {
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_TEXT_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
} from "@respin/db";
import { respinConfigV1 } from "@respin/config";
import {
  UNIVERSAL_LAWS,
  frameworkVersionsUsed,
  frameworksForContext,
  promptFramework,
} from "../src/generate";
import { PLATFORM, hooksOutput } from "./support/generation-fixtures";

/**
 * A `frameworks` ROW built from seed CONTENT.
 *
 * THE CAST IS SCOPED TO FOUR FIELDS AND SAID OUT LOUD. `promptFramework` reads
 * `name`, `beats`, `whyItConverts` and `saturation`; `frameworkVersionsUsed`
 * reads `name`, `id` and `version`. Those six are supplied here for real, and
 * the rest of the row (curator status, both owner columns, the timestamps) is
 * absent because neither function can see it — which is itself a property this
 * fixture makes visible rather than hiding behind a full row builder.
 */
const row = (
  content: FrameworkContent,
  over: { id?: string; version?: number; visibility?: "shared" | "private" } = {}
): FrameworkRow =>
  ({
    id: over.id ?? `framework-${content.name}`,
    version: over.version ?? 1,
    name: content.name,
    beats: content.beats,
    whyItConverts: content.whyItConverts,
    saturation: content.saturation,
    // SLUG AND VISIBILITY ARE PRODUCTION READS NOW, so the fixture supplies
    // them for real (billing gate, 2026-09-01). `slug` is what the accessor
    // ORDERS by and `visibility` is what the offer order and the drop metric
    // SPLIT by; a fixture missing either would stand in for a production read
    // it cannot reproduce, which is exactly the defect this file was found to
    // have.
    slug: frameworkSlug(content.name),
    visibility: over.visibility ?? "shared",
    // THE EVIDENCE RUNG, DERIVED BY THE PRODUCT'S OWN LADDER (round 2). It is
    // a production read now — `promptFramework` puts it in the prompt — and it
    // is computed with `deriveFrameworkConfidence` rather than typed, because
    // `frameworks_confidence_matches_evidence` is a CHECK constraint: a row
    // whose rung disagreed with its evidence count could not exist, so a
    // fixture that hand-typed one would stand in for a row production cannot
    // produce.
    confidence: deriveFrameworkConfidence(content.evidenceEntries),
  }) as unknown as FrameworkRow;

const SEED_ROWS = SHARED_FRAMEWORK_SEED.map((c, i) =>
  row(c, { id: `f-${i + 1}`, version: 1 })
);

/** `slug ASC, version DESC` — the tail both orders below share. */
const bySlugThenVersion = (a: FrameworkRow, b: FrameworkRow): number =>
  a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : b.version - a.version;

/**
 * THE ORDER `eligibleFrameworks()` RETURNS TODAY: shared rows first, then
 * `slug ASC, version DESC`.
 *
 * EVERY FIXTURE THAT STANDS IN FOR THAT READ GOES THROUGH THIS FUNCTION, and
 * that is the general form of the defect the billing gate found: a list built
 * as `[...SEED_ROWS, ...private]` is an order production NEVER produces, so a
 * bound "certified" over it certifies nothing. It is written from the
 * accessor's own `orderBy` clause, and `with-workspace.ts` is the authority —
 * if that clause moves, this helper is what has to move with it.
 *
 * IT MOVED ONCE ALREADY, WHICH IS WHY THE SENTENCE ABOVE IS NOT DECORATION.
 * The `packages/db` half of the same gate round put a `CASE` expression ahead
 * of the slug — shared before private — so this helper claimed the accessor's
 * order for one round while producing the one it had just stopped returning.
 * The `CASE` is deliberately not `asc(visibility)`; the accessor says why.
 */
const asProductionReads = (rows: readonly FrameworkRow[]): FrameworkRow[] =>
  [...rows].sort((a, b) => {
    const shared = (r: FrameworkRow) => (r.visibility === "shared" ? 0 : 1);
    return shared(a) - shared(b) || bySlugThenVersion(a, b);
  });

/**
 * `slug ASC, version DESC` ALONE — what the accessor returned BEFORE the
 * `CASE`, kept on purpose and never as a leftover.
 *
 * `frameworksForContext` sorts curated-first ITSELF, and the claim it makes is
 * that a private row cannot evict a curated one *whatever order the accessor
 * returns*. A fixture already sorted curated-first cannot drive that claim —
 * it would pass against a `frameworksForContext` with no sort at all. So the
 * two guards are proved against the order each is responsible for: the
 * accessor's order is what `asProductionReads` reproduces, and this is the
 * adversarial input the offer's own sort has to survive.
 */
const asSlugOrderOnly = (rows: readonly FrameworkRow[]): FrameworkRow[] =>
  [...rows].sort(bySlugThenVersion);

/** What one row costs the prompt — the same sum `frameworksForContext` takes. */
const sizeOf = (r: FrameworkRow): number => {
  const f = promptFramework(r);
  return f.name.length + f.summary.length;
};

/** A private row at `@respin/db`'s maximum size: ~100,000 characters. */
const fat = (i: number): FrameworkRow =>
  row(
    {
      ...SHARED_FRAMEWORK_SEED[0],
      name: `Private mechanism ${String.fromCharCode(97 + (i % 26))}${i}`,
      beats: Array.from({ length: FRAMEWORK_LIST_MAX }, () =>
        "x".repeat(FRAMEWORK_TEXT_MAX)
      ),
      whyItConverts: "y".repeat(FRAMEWORK_TEXT_MAX),
    },
    { id: `p-${i}`, version: 1, visibility: "private" }
  );

/**
 * The budget, THROUGH THE REAL SCHEMA AND THE REAL SEED.
 *
 * Not a literal: this is the value a generation actually runs under — the same
 * expression `generate` reads (`content.generation.frameworkContextCharBudget`)
 * over the same parsed seed — so a stored document that carried a different
 * number would move this test with it.
 */
const SEEDED_CONFIG = respinConfigV1.parse(CONFIG_V1_SEED);
const BUDGET = SEEDED_CONFIG.generation.frameworkContextCharBudget;

describe("promptFramework: one row as prompt material (R5b)", () => {
  it("carries the name, the beats and why it converts — nothing a prompt cannot use", () => {
    const [first] = SHARED_FRAMEWORK_SEED;
    const framework = promptFramework(row(first));
    expect(framework.name).toBe(first.name);
    expect(framework.summary).toContain(first.whyItConverts);
    for (const beat of first.beats) {
      expect(framework.summary, `beat missing: ${beat}`).toContain(beat);
    }
  });

  it("both saturated and observed legacy tags carry the unmeasured limitation", () => {
    // Neither tag has a framework-level population/window, so both carry
    // `@respin/db`'s own limitation rather than a second wording here.
    const saturated = promptFramework(
      row({ ...SHARED_FRAMEWORK_SEED[0], saturation: "saturated" })
    );
    expect(saturated.summary).toContain(SATURATION_NOTICE);
    const observed = promptFramework(
      row({ ...SHARED_FRAMEWORK_SEED[0], saturation: "observed" })
    );
    expect(observed.summary).toContain(SATURATION_NOTICE);
    // NON-VACUITY: both legacy tags are live in the seed, so the comparison is
    // not two invented fixtures.
    expect(
      SHARED_FRAMEWORK_SEED.filter((f) => f.saturation === "saturated").length,
      "no seeded framework is saturated, so the notice has no live path"
    ).toBeGreaterThan(0);
    expect(
      SHARED_FRAMEWORK_SEED.filter((f) => f.saturation === "observed").length,
      "no seeded framework is observed, so the second tag is not live",
    ).toBeGreaterThan(0);
  });

  it("beats that are not strings contribute nothing — `beats` is jsonb, so it is guarded", () => {
    const poisoned = row({
      ...SHARED_FRAMEWORK_SEED[0],
      beats: [{ nested: "object" }, 7, "a real beat"] as unknown as string[],
    });
    const framework = promptFramework(poisoned);
    expect(framework.summary).toContain("a real beat");
    expect(framework.summary).not.toContain("[object Object]");
    expect(framework.summary).not.toContain("nested");
  });
});

// ------------------------------------------------------------ the cross-check

describe("frameworkVersionsUsed agrees with framework_eligibility (R9a)", () => {
  const offered = [SEED_ROWS[0], SEED_ROWS[1]];
  const asPrompt: Framework[] = offered.map(promptFramework);

  /** A hooks document that names a framework — the position the check reads. */
  const namingFramework = (name: string): ScriptOutput => ({
    ...hooksOutput(),
    framework: {
      name,
      why: "it opens on the thing the viewer already suspects and then pays it off",
    },
  });

  const eligibilityFindings = (output: ScriptOutput) =>
    scanModeChecks({
      mode: "hooks",
      output,
      input: "some input the creator typed",
      frameworks: asPrompt,
    }).filter((f) => f.rule === "framework_not_offered");

  /**
   * THE DECORATIONS A MODEL ACTUALLY PRODUCES. Each is the offered name with
   * something a writer would add, and `framework_eligibility` is built to
   * accept every one of them ("containment in either direction, because a model
   * decorates"). Every one must therefore RESOLVE here too.
   */
  const DECORATIONS = [
    (n: string) => n,
    (n: string) => n.toUpperCase(),
    (n: string) => n.toLowerCase(),
    (n: string) => `The ${n} framework`,
    (n: string) => `${n}!`,
    (n: string) => `  ${n}  `,
    (n: string) => n.replace(/\s+/g, "  "),
  ];

  it("every name the eligibility check ACCEPTS is a name this resolver FINDS", () => {
    let accepted = 0;
    for (const source of offered) {
      for (const decorate of DECORATIONS) {
        const named = decorate(source.name);
        const output = namingFramework(named);
        if (eligibilityFindings(output).length > 0) continue;
        accepted += 1;
        const used = frameworkVersionsUsed(output, offered);
        expect(
          used.map((u) => u.id),
          `'${named}' passed framework_eligibility but resolved to no row — the generation would record no provenance for a framework it was allowed to name`
        ).toEqual([source.id]);
        expect(used[0].version).toBe(source.version);
      }
    }
    // NON-VACUITY: the loop really exercised the accepted branch, and did so
    // more than once. A tokeniser change that made every decoration a finding
    // would otherwise leave this test green having asserted nothing.
    expect(
      accepted,
      "no decoration was accepted by framework_eligibility, so nothing above was checked"
    ).toBeGreaterThanOrEqual(DECORATIONS.length);
  });

  it("a name the check REFUSES records no provenance", () => {
    const output = namingFramework("The Ladder Of Abstraction");
    // The other implementation refuses it...
    expect(eligibilityFindings(output)).toHaveLength(1);
    // ...and this one records nothing, which is the fail-closed direction:
    // under-recording, never a framework the generation did not use.
    expect(frameworkVersionsUsed(output, offered)).toEqual([]);
  });

  it("an output that names NO framework records none, and a refusal records none", () => {
    expect(frameworkVersionsUsed(hooksOutput(), offered)).toEqual([]);
    // A refused run has no output at all — `candidateOf` passes `null`.
    expect(frameworkVersionsUsed(null, offered)).toEqual([]);
  });

  it("an ideation document records the frameworks its IDEAS name, deduplicated", () => {
    // `/ideas/N/framework` is the second position `framework_eligibility` reads,
    // so it is the second position this must read. Two ideas naming the same
    // framework are one framework used, not two.
    const output = {
      ...hooksOutput(),
      hooks: undefined,
      ideas: [
        {
          hook: "the part nobody tells you about starting out",
          thesis: "the first year is mostly deciding what not to make",
          framework: offered[0].name,
        },
        {
          hook: "what changed when i stopped planning every shot",
          thesis: "planning was hiding the part i was avoiding",
          framework: `The ${offered[0].name} framework`,
        },
        {
          hook: "why my first year looked like nothing was working",
          thesis: "nothing compounding is not the same as nothing happening",
          framework: offered[1].name,
        },
      ],
    } as unknown as ScriptOutput;
    expect(frameworkVersionsUsed(output, offered).map((u) => u.id).sort()).toEqual(
      [offered[0].id, offered[1].id].sort()
    );
  });
});

// ------------------------------------------------- which modes get a library

describe("which modes are offered a library at all", () => {
  it("exactly the modes whose registry entry runs framework_eligibility", () => {
    // `generate` derives this from `MODE_SPECS[mode].checks` rather than from a
    // list of its own — one population, so a mode that starts carrying a
    // framework cannot be starved of the library by a second list nobody
    // updated. This pins the derivation against the registry.
    const carriesAFramework = MODE_IDS.filter((m) =>
      MODE_SPECS[m].checks.includes("framework_eligibility")
    );
    // Six of seven: a CAPTION carries no framework, which is why it is the one
    // mode that pays nothing for the library.
    expect([...carriesAFramework].sort()).toEqual(
      MODE_IDS.filter((m) => m !== "caption").sort()
    );
    expect(carriesAFramework).not.toContain("caption");
  });
});

// -------------------------------------------------------------- R17's budget

describe("the fixture order is the accessor's order (R-77)", () => {
  // THE HELPER'S DOCBLOCK CLAIMS TO BE WRITTEN FROM `eligibleFrameworks()`'s
  // OWN `orderBy` CLAUSE. That claim went stale once already inside a single
  // gate round — `packages/db` put a `CASE` ahead of the slug and this file
  // went on reproducing the order the accessor had stopped returning — so it
  // is asserted here rather than trusted. A comment claiming a property is not
  // the property (CLAUDE.md 2026-07-30).
  const accessorSource = (): string => {
    const file = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../db/src/with-workspace.ts"
    );
    return readFileSync(file, "utf8");
  };

  /**
   * The `.orderBy(...)` argument list of `eligibleFrameworks`, by BALANCING
   * PARENTHESES rather than by hunting for a closing sequence \u2014 the clause
   * contains nested calls and a template literal, and a "find the next `)`"
   * reader silently returns a truncated clause that this scan would then
   * report as missing a key it simply never read.
   */
  const orderByClause = (src: string): string => {
    // THE IMPLEMENTATION, NOT THE INTERFACE. `eligibleFrameworks: () =>`
    // appears twice \u2014 once in the `ProfileAccessors` type as
    // `=> Promise<Framework[]>` and once as the method \u2014 and taking the first
    // hit walked forward into a DIFFERENT accessor's `.orderBy`. The
    // non-vacuity case below caught that on its first run, which is the whole
    // reason it is here: the scan was reading `generationFeedback` and
    // reporting on `eligibleFrameworks`.
    const impl = /eligibleFrameworks: \(tx\?: TxLike\) =>\s*\r?\n\s*\(tx \?\? db\)/g;
    const hits = [...src.matchAll(impl)];
    expect(
      hits.length,
      "eligibleFrameworks' implementation is not where this scan looks for it"
    ).toBe(1);
    const at = hits[0].index ?? -1;
    const from = src.indexOf(".orderBy(", at);
    expect(from, "eligibleFrameworks has no .orderBy at all").toBeGreaterThan(-1);
    let depth = 0;
    for (let i = from + ".orderBy".length; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) return src.slice(from, i + 1);
      }
    }
    throw new Error("the .orderBy clause never closed");
  };

  it("the accessor really orders SHARED first, then slug, then version", () => {
    const clause = orderByClause(accessorSource());
    const caseAt = clause.search(
      /case when [\s\S]*?visibility[\s\S]*?= 'shared' then 0 else 1 end/
    );
    const slugAt = clause.indexOf("asc(frameworks.slug)");
    const versionAt = clause.indexOf("desc(frameworks.version)");
    expect(caseAt, "no shared-first CASE in the accessor's orderBy").toBeGreaterThan(-1);
    expect(slugAt, "no asc(frameworks.slug)").toBeGreaterThan(-1);
    expect(versionAt, "no desc(frameworks.version)").toBeGreaterThan(-1);
    expect(caseAt).toBeLessThan(slugAt);
    expect(slugAt).toBeLessThan(versionAt);
    // ...and NOT `asc(visibility)`, which would work today and invert silently
    // the day the pgEnum is re-ordered. The accessor's own comment says so.
    expect(clause).not.toContain("asc(frameworks.visibility)");
  });

  it("...and the scan would SEE the clause it claims to check", () => {
    // NON-VACUITY. A scan that finds nothing reports the same "no problem" as
    // a scan that is working, so each shape is planted as an absence.
    const clause = orderByClause(accessorSource());
    expect(clause.length, "the extracted clause is empty").toBeGreaterThan(40);
    for (const removed of [
      /case when [\s\S]*?end/,
      /asc\(frameworks\.slug\)/,
      /desc\(frameworks\.version\)/,
    ]) {
      const mutated = clause.replace(removed, "");
      expect(
        mutated,
        `removing ${String(removed)} changed nothing — the pattern never matched`
      ).not.toBe(clause);
    }
  });

  it("the two fixture orders really DIFFER, so choosing between them means something", () => {
    const rows = [
      ...SEED_ROWS,
      row(
        { ...SHARED_FRAMEWORK_SEED[0], name: "Angle 00" },
        { id: "p-0", version: 1, visibility: "private" }
      ),
    ];
    expect(asProductionReads(rows)[0].visibility).toBe("shared");
    expect(asSlugOrderOnly(rows)[0].visibility).toBe("private");
  });
});

describe("R17: what the library costs the prompt, MEASURED", () => {
  const context = (frameworks: readonly Framework[]): GenerationContext => ({
    universalLaws: UNIVERSAL_LAWS,
    frameworks,
    brain: {
      voice: ["register: plain and direct, like talking to one person"],
      strategy: ["goal: more of the right followers"],
      killtest: ["rules/0: it must not sound like an advert"],
    },
    input: "i want to talk about what my first year actually looked like",
    platform: PLATFORM,
    // An ORIGINAL. Required rather than defaulted, so this measurement cannot
    // silently be taken against a context a revision could not produce.
    unvouchedSpecifics: [],
  });

  it("the whole seeded library adds a MEASURED, BOUNDED amount to one call", () => {
    const withLibrary = assembleGenerationPrompt({
      mode: "hooks",
      context: context(SEED_ROWS.map(promptFramework)),
    });
    const without = assembleGenerationPrompt({
      mode: "hooks",
      context: context([]),
    });
    const added =
      withLibrary.system.length +
      withLibrary.prompt.length -
      (without.system.length + without.prompt.length);

    // THE MEASUREMENT, and what it is a measurement OF. These are CHARACTERS,
    // not tokens: nothing in this package tokenises, and a character count is
    // an honest upper-bound proxy (English prose runs roughly 3.5-4.5
    // characters per token, so this over-states tokens rather than
    // under-stating them). What it cannot measure is LATENCY, which is what
    // §7's 45s budget is actually about — and input tokens are not where
    // generation latency comes from, output tokens are. So this is a bound on
    // CONTEXT GROWTH, stated as such, and the deadline itself is R-40's
    // `llm.overallDeadlineMs` (120s since 2026-09-04 — R-100), unchanged by
    // this slice.
    expect(SEED_ROWS.length, "the seeded library").toBe(9);
    expect(added, `the library adds ${added} characters to one prompt`)
      .toBeGreaterThan(0);
    // THE MEASURED NUMBER, re-taken in round 2 (2026-09-01) when the evidence
    // rung and its note joined the block: the nine seeded frameworks add 6,375
    // characters to a hooks prompt on this tree — roughly 1.5-1.8k input
    // tokens. THE EVIDENCE HALF OF THAT IS 494: 261 across the nine rows
    // (`FRAMEWORK_EVIDENCE_LABEL` plus each row's rung) and one 233-character
    // note above the list. That split is asserted in the case below rather
    // than remembered here.
    //
    // THE REST OF THE MOVE FROM THE PREVIOUS 5,298 IS NOT CLAIMED AS THIS
    // CHANGE'S. `SHARED_FRAMEWORK_SEED` lives in `@respin/db` and was being
    // edited in the same window; attributing the whole delta to the rung would
    // be a measurement with a confounder in it.
    // PINNED AT 12,000 rather than at 5,298, so adding a framework is not a red
    // test and doubling the library is.
    expect(
      added,
      "the shared library outgrew its context budget — measure the latency effect before raising this"
    ).toBeLessThan(12_000);
  });

  it("the EVIDENCE RUNG reaches the prompt, and its cost is measured (round 2)", () => {
    // WHAT THIS CLOSES. `promptFramework` carried the saturation notice and
    // DROPPED `confidence`, so a framework at `unsupported` — "a shape
    // somebody wrote down, and nothing more" on the creator's screen — reached
    // the model identically to one at `contrasted`, and the model wrote a
    // weakest point about it without the fact that most often IS the weakest
    // point.
    const rows = SEED_ROWS.map(promptFramework);
    for (const [i, f] of rows.entries()) {
      expect(f.summary, SEED_ROWS[i].name).toContain(
        FRAMEWORK_EVIDENCE_LABEL + SEED_ROWS[i].confidence
      );
    }
    // EVERY RUNG IS A REAL LADDER VALUE, never `undefined` printed into a
    // prompt: the first draft of this fixture omitted `confidence` entirely
    // and `promptFramework` cheerfully wrote "Evidence recorded: undefined" —
    // caught here, by the assertion below, rather than by a creator.
    for (const r of SEED_ROWS) {
      expect(FRAMEWORK_CONFIDENCE_RUNGS as readonly string[]).toContain(
        r.confidence
      );
    }

    const prompt = assembleGenerationPrompt({
      mode: "hooks",
      context: context(rows),
    }).prompt;
    // The WORD is on the row and the SENTENCE that stops it reading as a score
    // is above the list, exactly once.
    expect(prompt).toContain(FRAMEWORK_EVIDENCE_LABEL);
    expect(prompt.split("not a prediction, and not a promise").length - 1).toBe(
      1
    );

    // THE COST, MEASURED RATHER THAN ASSUMED. `frameworksForContext` sizes the
    // SAME string `promptFramework` returns, so the rung is rationed by
    // `config.generation.frameworkContextCharBudget` like every other
    // character — it is not spent behind the budget's back.
    const sized = rows.reduce(
      (n, f) => n + f.name.length + f.summary.length,
      0
    );
    const rungCost = SEED_ROWS.reduce(
      (n, r) => n + FRAMEWORK_EVIDENCE_LABEL.length + r.confidence.length + 1,
      0
    );
    expect(
      rungCost,
      `the rung adds ${rungCost} characters across ${SEED_ROWS.length} rows`
    ).toBeLessThan(400);
    // (The note itself is paid ONCE, not per row — asserted above by counting
    // its occurrences in the assembled prompt, which is why it is explained
    // over the list rather than on every line.)
    expect(sized).toBeLessThanOrEqual(BUDGET);
  });

  it("the WHOLE seeded library fits — the budget rations nothing the product curated", () => {
    expect(frameworksForContext(SEED_ROWS, BUDGET).kept).toHaveLength(
      SEED_ROWS.length
    );
    expect(frameworksForContext(SEED_ROWS, BUDGET).dropped).toEqual([]);
  });

  it("R17: the offer is BOUNDED, and the bound is what an unbounded read would have blown", () => {
    // THE REACHABLE WORST CASE, from `@respin/db`'s OWN limits rather than from
    // an imagined one: `PRIVATE_FRAMEWORK_COUNT_MAX` is 50 live private
    // frameworks per profile, on top of the shared library, and
    // `FRAMEWORK_TEXT_MAX` (4,000) x `FRAMEWORK_LIST_MAX` (24 beats) makes ONE
    // row ~100,000 characters. `eligibleFrameworks()` returns all of them.
    expect(PRIVATE_FRAMEWORK_COUNT_MAX).toBe(50);
    const worstCase = asProductionReads([
      ...SEED_ROWS,
      ...Array.from({ length: PRIVATE_FRAMEWORK_COUNT_MAX }, (_, i) => fat(i)),
    ]);

    // WITHOUT THE BOUND: what one generation's prompt would have carried.
    const unbounded = worstCase
      .map(promptFramework)
      .reduce((n, f) => n + f.name.length + f.summary.length, 0);
    expect(
      unbounded,
      "the worst case is not actually large, so this test proves nothing"
    ).toBeGreaterThan(1_000_000);

    // WITH IT: whole rows only, and never past the ceiling.
    const offer = frameworksForContext(worstCase, BUDGET);
    const bounded = offer.kept
      .map(promptFramework)
      .reduce((n, f) => n + f.name.length + f.summary.length, 0);
    expect(bounded).toBeLessThanOrEqual(BUDGET);
    // ...and the curated library still arrives WHOLE, because `continue` (not
    // `break`) means one oversized private row does not hide the rows after it.
    //
    // AS A SET, AND OVER A FIXTURE SORTED THE WAY PRODUCTION READS IT (billing
    // gate, 2026-09-01). This assertion used to be
    // `expect(kept.map(id)).toEqual(SEED_ROWS.map(id))` over
    // `[...SEED_ROWS, ...fat]` — an ORDER production never produces, since the
    // accessor interleaves shared and private by `slug ASC`. Re-sorting the
    // same fixture the way the accessor sorts it made the old assertion FALSE
    // while the library was in fact intact: the test was green and its
    // load-bearing claim was not. What is claimed is that every curated row is
    // OFFERED, so it is asserted as a set — and the offer ORDER is a separate
    // claim with its own case below.
    expect(new Set(offer.kept.map((k) => k.id))).toEqual(
      new Set(
        [...SEED_ROWS.map((k) => k.id)].concat(
          offer.kept.filter((k) => k.visibility !== "shared").map((k) => k.id)
        )
      )
    );
    for (const seeded of SEED_ROWS) {
      expect(
        offer.kept.map((k) => k.id),
        `the curated library lost ${seeded.slug}`
      ).toContain(seeded.id);
    }
    expect(offer.dropped.every((r) => r.visibility === "private")).toBe(true);
  });

  it("a PRIVATE framework cannot evict a curated one — at any count, whatever order the accessor returns", () => {
    // THE DEFECT THIS CASE EXISTS FOR, measured before the fix (billing gate,
    // 2026-09-01). All nine seeded frameworks are named "The …", so every
    // curated slug begins `the-`, and `eligibleFrameworks()` ordered by
    // `slug ASC` alone — so a private framework named with an earlier letter
    // sorted AHEAD of the entire curated library. With THIS fixture's private
    // rows — 526 characters against a curated average of 593, no pathological
    // row involved — the measured loss was: 30 private frameworks -> 2 curated
    // ones gone, 40 -> all nine, 50 -> all nine. The creator paid full price
    // for the generation that lost them.
    //
    // DRIVEN IN `asSlugOrderOnly` AND NOT IN THE ACCESSOR'S ORDER, DELIBERATELY.
    // The accessor now sorts shared-first too, so a fixture in its order would
    // make this case pass against a `frameworksForContext` that did no sorting
    // at all — it would certify the OTHER guard. What is claimed here is that
    // the offer's own sort makes the eviction impossible whatever the accessor
    // returns, so the input is the order the accessor no longer produces.
    //
    // NON-VACUITY IS THE FIRST HALF: the fixture has to actually sort ahead,
    // or this case is about nothing.
    const ordinary = (i: number): FrameworkRow =>
      row(
        {
          ...SHARED_FRAMEWORK_SEED[0],
          // "Angle 00" — an ordinary name that begins before "The".
          name: `Angle ${String(i).padStart(2, "0")}`,
          beats: ["b".repeat(360)],
          whyItConverts: "c".repeat(150),
        },
        { id: `p-${i}`, version: 1, visibility: "private" }
      );
    const curatedSizes = SEED_ROWS.map(sizeOf);
    const averageCurated = Math.round(
      curatedSizes.reduce((a, b) => a + b, 0) / curatedSizes.length
    );
    expect(
      Math.abs(sizeOf(ordinary(0)) - averageCurated),
      "the private fixture is not the same size as a curated framework, so this measures a pathology rather than ordinary use"
    ).toBeLessThan(150);

    for (const count of [20, 30, 40, PRIVATE_FRAMEWORK_COUNT_MAX]) {
      const rows = asSlugOrderOnly([
        ...SEED_ROWS,
        ...Array.from({ length: count }, (_, i) => ordinary(i)),
      ]);
      // NON-VACUITY: the private rows really do sort ahead of the library in
      // the order the accessor returns.
      expect(rows[0].visibility, `private=${count}`).toBe("private");
      const offer = frameworksForContext(rows, BUDGET);
      const kept = new Set(offer.kept.map((k) => k.id));
      const lost = SEED_ROWS.filter((s) => !kept.has(s.id));
      expect(
        lost.map((l) => l.slug),
        `private=${count}: the curated library lost ${lost.length} of ${SEED_ROWS.length} frameworks`
      ).toEqual([]);
      // ...and the pressure is real: at the higher counts the budget IS full,
      // so this is not passing because everything happened to fit.
      if (count >= 40) {
        expect(
          offer.dropped.length,
          `private=${count}: nothing was dropped, so the budget was never under pressure`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("the offer order is CURATED FIRST, and stable within each group", () => {
    // `asSlugOrderOnly` for the reason the eviction case above states: the
    // claim under test belongs to `frameworksForContext`, and an input already
    // sorted curated-first cannot distinguish a working sort from no sort.
    const rows = asSlugOrderOnly([
      ...SEED_ROWS,
      ...Array.from({ length: 3 }, (_, i) =>
        row(
          { ...SHARED_FRAMEWORK_SEED[0], name: `Angle ${i}` },
          { id: `p-${i}`, version: 1, visibility: "private" }
        )
      ),
    ]);
    const kept = frameworksForContext(rows, BUDGET).kept;
    const visibilities = kept.map((k) => k.visibility);
    expect(visibilities.indexOf("private")).toBe(
      visibilities.lastIndexOf("shared") + 1
    );
    // STABLE: within the shared group the accessor's own order survives, so
    // the same profile gets the same offer twice.
    expect(kept.filter((k) => k.visibility === "shared").map((k) => k.slug)).toEqual(
      rows.filter((k) => k.visibility === "shared").map((k) => k.slug)
    );
  });

  it("a row LARGER than the whole budget is skipped, and the rows after it still arrive", () => {
    const monster = row(
      {
        ...SHARED_FRAMEWORK_SEED[0],
        name: "The Monster",
        beats: ["z".repeat(BUDGET + 1)],
      },
      { id: "monster", version: 1 }
    );
    const offer = frameworksForContext([monster, SEED_ROWS[0], SEED_ROWS[1]], BUDGET);
    expect(offer.kept.map((k) => k.id)).toEqual([
      SEED_ROWS[0].id,
      SEED_ROWS[1].id,
    ]);
    expect(offer.dropped.map((k) => k.id)).toEqual(["monster"]);
  });

  it("a dropped framework records NO provenance — it was never offered", () => {
    // The pairing that makes the drop safe: `frameworkVersionsUsed` is computed
    // over what was OFFERED, so a row the budget skipped cannot be recorded as
    // used even if the model produced its name from somewhere else.
    const monster = row(
      { ...SHARED_FRAMEWORK_SEED[0], name: "The Monster", beats: ["z".repeat(BUDGET + 1)] },
      { id: "monster", version: 1 }
    );
    const offered = frameworksForContext([monster, SEED_ROWS[0]], BUDGET).kept;
    const output = {
      ...hooksOutput(),
      framework: { name: "The Monster", why: "it opens on the thing the viewer already suspects" },
    } as ScriptOutput;
    expect(frameworkVersionsUsed(output, offered)).toEqual([]);
  });

  it("the budget is a CONFIG dial, and it is the number the module constant carried", () => {
    // REQ-G05: this sets the input-token floor of every generation that offers
    // frameworks, and input is billed per token on every call an attempt
    // makes. It was a module constant; the dial now lives in the versioned
    // document, seeded explicitly and `.default(...)`ed in the schema (R-77).
    // 20,000 is pinned rather than derived, because the whole point of the
    // move was that no generation's prompt size changed with it.
    expect(BUDGET).toBe(20_000);
    // AND AN OPERATOR'S EDIT REALLY REACHES THE SCHEMA — a stored document
    // carrying a different number parses to that number, not to the default.
    expect(
      respinConfigV1.parse({
        ...CONFIG_V1_SEED,
        generation: { ...CONFIG_V1_SEED.generation, frameworkContextCharBudget: 7_000 },
      }).generation.frameworkContextCharBudget
    ).toBe(7_000);
    // A SMALLER BUDGET REALLY OFFERS LESS — the dial does something.
    expect(
      frameworksForContext(SEED_ROWS, 2_000).kept.length
    ).toBeLessThan(SEED_ROWS.length);
  });

  it("a CAPTION pays nothing for the library, because it is offered none", () => {
    // The behavioural half of the derivation above: `generate` passes `[]` for
    // a mode that runs no eligibility check, so the caption prompt is the same
    // size whether the library has nine rows or none.
    const empty = assembleGenerationPrompt({
      mode: "caption",
      context: context([]),
    });
    expect(empty.prompt).not.toContain(SEED_ROWS[0].name);
  });

  it("the frameworks are NOT in the traceability corpus — they are our material", () => {
    // `traceabilityCorpusFor` builds REQ-I03's corpus from the creator's brain
    // and their own input. A framework blurb is the PRODUCT's material, so a
    // specific traceable only to it is still a specific the creator never gave
    // — `assemble.ts` says so and this is the assertion that it stays true.
    const withLibrary = assembleGenerationPrompt({
      mode: "hooks",
      context: context(SEED_ROWS.map(promptFramework)),
    });
    expect(withLibrary.prompt).toContain(SEED_ROWS[0].name);
  });
});
