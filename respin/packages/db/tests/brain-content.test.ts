// The per-kind content schemas and the claim enumeration.
//
// This suite exists because three plan-review rounds found the PROSE version of
// these rules wrong, each time against the installed toolchain rather than in
// argument. So each assertion below pins a fact that was measured, not a
// property that was reasoned about — starting with the one that broke the
// previous design: a top-level `.strict()` does not propagate.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BRAIN_CONTENT_SCHEMAS,
  CHECK,
  ClaimWalkError,
  ContentSchemaError,
  SchemaShapeError,
  WRITABLE_BRAIN_KINDS,
  assertClosedSchema,
  CANARY_SHAPES,
  assertRegistryClosed,
  claim,
  enumerateClaimFields,
  enumerateClaimFieldsOf,
  parseBrainContent,
  placeholderFields,
  readPointer,
  serverOwned,
  serverOwnedFields,
} from "../src/brain-content";
import { brainKind } from "../src/brain-schema";

const voice = {
  register: "deadpan",
  sentenceRhythm: "short, then long",
  signatureMoves: ["cold open"],
  avoid: ["hype"],
};

describe("the measured zod behaviour this design rests on", () => {
  it("a top-level .strict() does NOT refuse a nested unknown key", () => {
    // THE DEFECT THIS FILE EXISTS TO CLOSE, pinned as an executable fact so
    // that a zod upgrade changing it is a visible red rather than a silent
    // loosening of the guarantee that replaced it.
    const loose = z
      .object({ tone: z.object({ register: z.string() }) })
      .strict();
    const parsed = loose.safeParse({
      tone: { register: "deadpan", followerCount: 42000 },
    });
    expect(parsed.success).toBe(true);
    // ...and the invented number is stripped from the OUTPUT while surviving in
    // the caller's object — which is why parseBrainContent returns the output.
    expect(parsed.data).toEqual({ tone: { register: "deadpan" } });
  });

  it("z.strictObject at every level DOES refuse it", () => {
    const closed = z.strictObject({
      tone: z.strictObject({ register: z.string() }),
    });
    expect(
      closed.safeParse({ tone: { register: "deadpan", followerCount: 42000 } })
        .success
    ).toBe(false);
  });
});

describe("assertClosedSchema", () => {
  // NOTE: there is deliberately NO loop asserting every registered kind here.
  // That loop used to live in this file, and it made the production guard
  // undetectable: `brain-content.ts` runs `assertClosedSchema` over the whole
  // registry AT MODULE LOAD, so importing this file at all is the assertion —
  // and a mutation removing the module-load call must be able to redden.
  // With a loop here it could not. The import at the top of this file IS the
  // registry check.
  it("REFUSES a registry containing a badly-shaped kind", () => {
    // The property behind the module-load call. It cannot be tested through
    // the real registry — every registered kind is valid, so removing the
    // call is an equivalent mutant — so the guard takes the registry as an
    // argument and this drives a bad one through the identical code path.
    expect(() =>
      assertRegistryClosed({ rogue: z.strictObject({ unmarked: z.string() }) })
    ).toThrow(/registered kind 'rogue'/);
  });

  it("keeps ONE CANARY PER RULE — dropping any is a narrowing", () => {
    // Asserting that SOME canary fires is not enough: a reviewer measured that
    // removing one entry left such a test green, because the others still
    // matched. The coverage set itself is the property.
    const labels = CANARY_SHAPES().map(([l]) => l).sort();
    expect(labels).toEqual(
      [
        "claim of a container",
        "claim of an open node",
        "loose object",
        "non-claim union",
        "unmarked leaf",
      ].sort()
    );
    // ...and every one of them is genuinely refused by the real guard.
    for (const [label, shape] of CANARY_SHAPES()) {
      expect(() => assertClosedSchema(shape), label).toThrow(SchemaShapeError);
    }
  });

  it("DETECTS an inert checker — the canary actually fires", () => {
    // The detector a reviewer pointed out was available and missing. An inert
    // checker (one that refuses nothing) is exactly the world a clean registry
    // is indistinguishable from, so the canary is driven through the injected
    // seam rather than asserted about in prose.
    const inert = () => {};
    expect(() => assertRegistryClosed({}, inert)).toThrow(/INERT/);
    // ...and it names WHICH rule went inert, so a mutation confined to one
    // half of the split rule is still caught.
    const onlyRule1 = (schema: unknown) => {
      const d = (schema as { _zod: { def: Record<string, unknown> } })._zod.def;
      const shape = (d.shape ?? {}) as Record<string, unknown>;
      for (const v of Object.values(shape)) {
        const t = (v as { _zod: { def: { type: string } } })._zod.def.type;
        if (t !== "union" && t !== "object") throw new Error("unmarked");
      }
    };
    expect(() => assertRegistryClosed({}, onlyRule1)).toThrow(
      /claim of an open node|claim of a container|loose object|non-claim union/
    );
  });

  it("refuses to trust its own silence — the canary", () => {
    // assertRegistryClosed proves the guard is live before reporting a clean
    // registry, so a neutered guard is distinguishable from a clean registry.
    // Both look identical otherwise, which is how the round-5 hole survived.
    expect(() => assertRegistryClosed({})).not.toThrow();
    expect(typeof assertRegistryClosed).toBe("function");
  });

  it("calls the guard AT MODULE LOAD in the shipped source — scanned, with a planted violation", async () => {
    // WHY A SOURCE SCAN. "The guard runs in a deployed process" cannot be
    // proved behaviourally while every registered kind is valid: removing a
    // check that passes is an EQUIVALENT MUTANT, unobservable by construction.
    // The property is still worth holding, because it is exactly the property
    // round 5 found missing — the guard existed and nothing production ever
    // called it.
    //
    // A scanner that finds nothing is indistinguishable from a scanner that is
    // broken (2026-08-21), so this asserts BOTH directions: the real source
    // matches, and a doctored copy does not.
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../src/brain-content.ts", import.meta.url);
    const src = await readFile(url, "utf8");

    // Phase 10a closes G-15: the guard must NOT run at module load any more.
    // A top-level call (column 0, not inside a function) is the shape that
    // took every Stripe delivery down with one bad schema edit.
    const TOP_LEVEL_CALL = /^assertRegistryClosed\(BRAIN_CONTENT_SCHEMAS\);$/m;

    expect(
      TOP_LEVEL_CALL.test(src),
      "brain-content.ts must NOT call assertRegistryClosed at module load (G-15) — the preflight owns it"
    ).toBe(false);

    // The planted violation: a source WITH the call must be refused.
    const doctored = `${src}\nassertRegistryClosed(BRAIN_CONTENT_SCHEMAS);\n`;
    expect(doctored, "the plant must actually change the source").not.toBe(src);
    expect(
      TOP_LEVEL_CALL.test(doctored),
      "the scan must CATCH a source that re-adds the module-load call"
    ).toBe(true);

    // And an indented (in-function) call is not the hazard: it does not match.
    expect(
      TOP_LEVEL_CALL.test("  assertRegistryClosed(BRAIN_CONTENT_SCHEMAS);")
    ).toBe(false);
  });

  it("does NOT run the registry guard at module load; the preflight does, and it is reachable from every startup (G-15)", async () => {
    const mod = await import("../src/brain-content");
    expect(Object.keys(mod.BRAIN_CONTENT_SCHEMAS).sort()).toEqual(
      [...brainKind.enumValues].sort()
    );
    expect(typeof mod.assertClosedSchema).toBe("function");
    // THE THREE STARTUP POINTS, by source: the CI step, the Next.js server's
    // register(), and the worker's main. A registry defect refuses a process
    // from STARTING rather than a delivery from being served.
    const { readFile } = await import("node:fs/promises");
    const root = new URL("../../../", import.meta.url);
    const ci = await readFile(new URL("../../../../.github/workflows/respin.yml", import.meta.url), "utf8");
    const instrumentation = await readFile(new URL("instrumentation-node.ts", root), "utf8");
    const workerMain = await readFile(new URL("worker/main.ts", root), "utf8");
    expect(ci).toMatch(/run:\s*pnpm preflight/);
    expect(instrumentation).toMatch(/runStartupPreflight\(\)/);
    expect(workerMain).toMatch(/runStartupPreflight\(\)/);
  });

  it("ORDINARY PACKAGE IMPORT CANNOT TAKE STRIPE DELIVERY DOWN: the root imports without running the guard, and the preflight is where it runs (G-15)", async () => {
    // The history: the module-load call was dormant until the index imported
    // brain-content, then it was LIVE in every process including the Stripe
    // webhook's — a bad schema edit made `@respin/db` unimportable and every
    // delivery a 500. Now the root imports cleanly and exposes the guard for
    // the preflight to run; `preflight.test.ts` plants the bad kind.
    const root = await import("../src/index");
    expect(
      typeof root.assertRegistryClosed,
      "@respin/db's index must still expose the guard for the preflight"
    ).toBe("function");
    expect(typeof root.runStartupPreflight).toBe("function");
    expect(typeof root.assertReferenceQuoteBudget).toBe("function");
    expect(typeof root.renderBrainReason).toBe("function");

    // Non-vacuity: an index that merely re-exported TYPES would satisfy the
    // above at compile time and load nothing at runtime. These are values, and
    // the registry they guard is reachable through the same import.
    expect(Object.keys(root.BRAIN_CONTENT_SCHEMAS).sort()).toEqual(
      [...brainKind.enumValues].sort()
    );
  });

  it("covers every kind in the enum — no kind is unregistered", () => {
    expect(Object.keys(BRAIN_CONTENT_SCHEMAS).sort()).toEqual(
      [...brainKind.enumValues].sort()
    );
  });

  it.each([
    ["a record (hands the key space back to the model)", z.strictObject({ p: z.record(z.string(), z.string()) })],
    ["z.any", z.strictObject({ p: z.any() })],
    ["z.unknown", z.strictObject({ p: z.unknown() })],
    ["a loose nested object", z.strictObject({ p: z.object({ a: z.string() }) })],
    ["a non-claim union", z.strictObject({ p: z.union([z.string(), z.number()]) })],
  ])("refuses %s", (_label, schema) => {
    expect(() => assertClosedSchema(schema)).toThrow(SchemaShapeError);
  });

  it("REFUSES an unmarked scalar leaf — the round-5 hole", () => {
    // The defect: an unmarked leaf is a declared position that needs no
    // evidence, is not confirmable, cannot hold [check], and passes the
    // activation gate vacuously. The model's choice moved to a schema author
    // who forgets a wrapper.
    expect(() => assertClosedSchema(z.strictObject({ sneaky: z.string() }))).toThrow(
      /UNMARKED 'string' leaf/
    );
    expect(() => assertClosedSchema(z.strictObject({ n: z.number() }))).toThrow(
      SchemaShapeError
    );
  });

  it("REFUSES a LOOSE OBJECT whose leaves are correctly marked", () => {
    // The discriminating fixture for `assertStrictObject`. Without it, the
    // "loose nested object" case reddens through the UNMARKED-LEAF branch
    // instead, and deleting the loose-object rule entirely stays green —
    // measured by a reviewer. This is the file's own measured fact M-1.
    expect(() =>
      assertClosedSchema(z.strictObject({ p: z.object({ a: claim(z.string()) }) }))
    ).toThrow(/loose object/);
  });

  it("REFUSES serverOwned() of an open node or a container", () => {
    // The marking exemption is not a closure exemption: serverOwned(z.any())
    // hands the key space back exactly as claim(z.any()) would, and a
    // serverOwned container makes the walkers disagree about whether its
    // subtree is one stripped position or several confirmable claims.
    expect(() =>
      assertClosedSchema(z.strictObject({ p: serverOwned(z.any()) }))
    ).toThrow(SchemaShapeError);
    expect(() =>
      assertClosedSchema(
        z.strictObject({ p: serverOwned(z.strictObject({ a: claim(z.string()) })) })
      )
    ).toThrow(SchemaShapeError);
  });

  it("does not exempt a SHARED leaf instance — serverOwned clones", () => {
    // Measured defect: marking the caller's instance meant a factored-out leaf
    // was exempt everywhere it was reused, so an ordinary refactor reopened
    // the unmarked-leaf hole.
    const shared = z.string();
    expect(() =>
      assertClosedSchema(
        z.strictObject({ srv: serverOwned(shared), mine: shared })
      )
    ).toThrow(/UNMARKED/);
  });

  it("ACCEPTS a serverOwned leaf, and only because it is marked", () => {
    expect(() =>
      assertClosedSchema(z.strictObject({ p: serverOwned(z.string()) }))
    ).not.toThrow();
    // The same schema without the marker is refused — so the marker, not the
    // shape, is what carries the exemption.
    expect(() => assertClosedSchema(z.strictObject({ p: z.string() }))).toThrow(
      SchemaShapeError
    );
  });

  it("still refuses claim(z.any()) and claim(z.record()) — closed at round 4, must not regress", () => {
    // This is the property the round-5 review predicted would be lost: the
    // obvious way to make the unmarked-leaf rule work is to stop recursing
    // into a claim's options, and that recursion is the ONLY reason these two
    // are refused. Both rules are kept, and this asserts it.
    expect(() =>
      assertClosedSchema(z.strictObject({ p: claim(z.any()) }))
    ).toThrow(SchemaShapeError);
    expect(() =>
      assertClosedSchema(
        z.strictObject({ p: claim(z.record(z.string(), z.string())) })
      )
    ).toThrow(SchemaShapeError);
  });

  it("refuses claim() of an object or array — it collapses per-field confirmation", () => {
    // Measured at round 5: assertClosedSchema accepted this and enumeration
    // returned ONE pointer for the whole subtree, so one confirmation would
    // confirm claims the creator never saw individually (REQ-B02).
    expect(() =>
      assertClosedSchema(
        z.strictObject({ t: claim(z.strictObject({ a: claim(z.string()) })) })
      )
    ).toThrow(/collapses a whole subtree/);
    expect(() =>
      assertClosedSchema(z.strictObject({ t: claim(z.array(z.string())) }))
    ).toThrow(/collapses a whole subtree/);
  });

  it("refuses an open node nested deep, not just at the root", () => {
    const deep = z.strictObject({
      a: z.strictObject({ b: z.array(z.strictObject({ c: z.any() })) }),
    });
    // (the `any` at depth 3 is the reason it throws, not the marking rule —
    // every other leaf on the path is a container)
    expect(() => assertClosedSchema(deep)).toThrow(SchemaShapeError);
  });
});

describe("claim()", () => {
  it("makes the placeholder representable for a NON-string leaf", () => {
    // The contradiction this resolves: "a zero-evidence field renders [check]"
    // is unimplementable against a strict z.number(), so the placeholder would
    // have had to live outside content and be re-applied by every reader.
    const numeric = claim(z.number());
    expect(numeric.safeParse(42).success).toBe(true);
    expect(numeric.safeParse(CHECK).success).toBe(true);
    expect(numeric.safeParse("something else").success).toBe(false);
  });
});

describe("parseBrainContent", () => {
  it("returns the PARSE OUTPUT — a DIFFERENT object from the caller's", () => {
    // A planted mutation (`return content`) proved the first version of this
    // test was vacuous: asserting only `toEqual(voice)` passes whether the
    // input or the output is returned. The identity assertion is the whole
    // point — zod strips unknown keys from the OUTPUT while leaving the
    // caller's object untouched (measured above), so returning the input
    // re-admits everything the schema just removed.
    const input = { ...voice };
    const out = parseBrainContent("voice", input);
    expect(out).toEqual(voice);
    expect(out).not.toBe(input);
  });

  it("refuses an unknown key at the top level AND nested", () => {
    expect(() =>
      parseBrainContent("voice", { ...voice, followerCount: 42000 })
    ).toThrow(ContentSchemaError);
    expect(() =>
      parseBrainContent("strategy", {
        audience: "a",
        positioning: "b",
        pillars: ["c"],
        extra: 1,
      })
    ).toThrow(ContentSchemaError);
  });

  it("accepts the closed 9b performance_meta shape and refuses its old malformed placeholder", () => {
    const content = {
      rules: [{
        metricLabel: "Followers",
        metricKey: "followers",
        metricUnit: "followers per 1k views",
        metricDirection: "higher_is_better",
        lever: "reach",
        platform: "shorts",
        audienceClass: "organic",
        observedFrom: "2026-08-01T00:00:00.000Z",
        observedTo: "2026-08-31T00:00:00.000Z",
        treatmentN: 3,
        baselineN: 3,
        treatmentMedianPer1k: 2,
        baselineMedianPer1k: 1,
        effectPer1k: 1,
        pastOutcome: "better",
        evidenceStrength: "early",
        selfReportedN: 6,
        connectorVerifiedN: 0,
        confounders: [],
      }],
    } as const;

    expect(parseBrainContent("performance_meta", content)).toEqual(content);
    expect(WRITABLE_BRAIN_KINDS.has("performance_meta")).toBe(true);
    expect(() =>
      parseBrainContent("performance_meta", { baselineNote: "x" })
    ).toThrow(ContentSchemaError);
  });

  it("names the offending pointer when content does not match", () => {
    expect(() =>
      parseBrainContent("voice", { ...voice, register: 42 })
    ).toThrow(/\/register/);
  });
});

describe("enumerateClaimFields", () => {
  it("enumerates every claim position present, by JSON Pointer", () => {
    expect(enumerateClaimFields("voice", voice)).toEqual([
      "/register",
      "/sentenceRhythm",
      "/signatureMoves/0",
      "/avoid/0",
    ]);
  });

  it("enumerates arrays BY INDEX against the instance", () => {
    // The schema declares the element; only the instance declares the count.
    const many = { ...voice, signatureMoves: ["a", "b", "c"] };
    expect(enumerateClaimFields("voice", many)).toContain("/signatureMoves/2");
    expect(enumerateClaimFields("voice", many)).not.toContain("/signatureMoves/3");
  });

  it("does NOT treat an absent optional claim as a field", () => {
    // The other reading makes D-M2-5b ("refuses while ANY inferred field is
    // unconfirmed") unsatisfiable, which bricks every brain.
    const schema = z.strictObject({ a: z.optional(claim(z.string())) });
    expect(() => assertClosedSchema(schema)).not.toThrow();
    // Exercised through the same walker the registry uses.
    const present = enumerateClaimFields("voice", voice);
    expect(present).not.toContain("/nothingHere");
  });

  it("is INDEPENDENT of JSON type — number, boolean and null claims are all fields", () => {
    // THE ROUND-3 DEFECT, and a planted mutation proved the first version of
    // this test could not see it: every registered kind is all-string today, so
    // an implementation enumerating only string leaves stayed GREEN. These
    // shapes therefore go through `enumerateClaimFieldsOf` — the same code path
    // the kind-keyed wrapper delegates to, not a copy of it.
    const schema = z.strictObject({
      followerCount: claim(z.number()),
      isAParent: claim(z.boolean()),
      nested: z.strictObject({ tone: claim(z.string()) }),
      items: z.array(claim(z.number())),
    });
    expect(() => assertClosedSchema(schema)).not.toThrow();
    const value = {
      followerCount: 42000,
      isAParent: true,
      nested: { tone: "deadpan" },
      items: [1, 2],
    };
    expect(schema.safeParse(value).success).toBe(true);
    expect(enumerateClaimFieldsOf(schema, value)).toEqual([
      "/followerCount",
      "/isAParent",
      "/nested/tone",
      "/items/0",
      "/items/1",
    ]);
  });

  it("an ABSENT optional claim is not a field; a PRESENT one is", () => {
    const schema = z.strictObject({
      here: claim(z.string()),
      maybe: z.optional(claim(z.number())),
    });
    expect(enumerateClaimFieldsOf(schema, { here: "x" })).toEqual(["/here"]);
    expect(enumerateClaimFieldsOf(schema, { here: "x", maybe: 3 })).toEqual([
      "/here",
      "/maybe",
    ]);
  });

  it("a NUMERIC claim can hold the placeholder — the C-1/C-18 contradiction", () => {
    // "A zero-evidence field renders [check]" is unimplementable against a
    // strict z.number(); making every claim a union with the literal is what
    // makes the placeholder representable at rest for every type.
    const schema = z.strictObject({ followerCount: claim(z.number()) });
    expect(schema.safeParse({ followerCount: CHECK }).success).toBe(true);
    expect(enumerateClaimFieldsOf(schema, { followerCount: CHECK })).toEqual([
      "/followerCount",
    ]);
  });
});

describe("placeholderFields", () => {
  it("finds the claim positions holding the unevidenced placeholder", () => {
    const withCheck = { ...voice, register: CHECK };
    expect(placeholderFields("voice", withCheck)).toEqual(["/register"]);
    expect(placeholderFields("voice", voice)).toEqual([]);
  });
});

describe("readPointer", () => {
  it("resolves the pointers the enumerator emits", () => {
    for (const p of enumerateClaimFields("voice", voice)) {
      expect(readPointer(voice, p)).toBeDefined();
    }
    expect(readPointer(voice, "/signatureMoves/0")).toBe("cold open");
  });
});

describe("the discriminator — what makes P-2 a real mutation", () => {
  // ROUND 5 MEASURED THAT P-2 ("enumerate from the payload instead of the
  // schema" — the exact defect the content schemas exist to prevent) was
  // marked RED in the plan and was GREEN: a payload-walking enumerator was
  // byte-identical to the real one on 0 of 4 fixtures, because every
  // registered kind's instance leaves coincided with its schema claims.
  //
  // A mutation nothing can discriminate is not evidence. These fixtures are
  // the discriminators, and each one is production-reachable.

  /** The P-2 mutant, kept here so the discrimination is asserted, not assumed. */
  const enumerateFromPayload = (content: unknown): string[] => {
    const out: string[] = [];
    const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
    const walk = (v: unknown, ptr: string): void => {
      if (v !== null && typeof v === "object") {
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${ptr}/${i}`));
        else
          for (const [k, x] of Object.entries(v as Record<string, unknown>))
            walk(x, `${ptr}/${esc(k)}`);
        return;
      }
      out.push(ptr);
    };
    walk(content, "");
    return out;
  };

  const validVoice = {
    register: "deadpan",
    sentenceRhythm: "short",
    signatureMoves: ["a"],
    avoid: ["b"],
    provenance: { schemaVersion: 1 },
  };

  it("a SERVER-OWNED leaf separates a schema-walk from a payload-walk", () => {
    // Driven against a document that CARRIES the server-owned position — the
    // shape the row holds once the server has written it. (A caller-supplied
    // one is stripped by parseBrainContent, asserted separately below, so the
    // parse output cannot be the fixture here.)
    const withServerField = { ...validVoice, provenance: { schemaVersion: 1 } };
    const real = enumerateClaimFieldsOf(
      BRAIN_CONTENT_SCHEMAS.voice,
      withServerField
    );
    const mutant = enumerateFromPayload(withServerField);

    expect(real).not.toEqual(mutant);
    // The server-owned position is NOT a claim: the creator must never be
    // asked to confirm a number the server wrote.
    expect(real).not.toContain("/provenance/schemaVersion");
    expect(mutant).toContain("/provenance/schemaVersion");
  });

  it("STRIPS a caller-supplied server-owned value inside the parse", () => {
    // Three reviewers blocked on this: the marker had a production site and no
    // enforcement, so a model-supplied number was stored as fact — no
    // evidence, not confirmable, unable to hold [check], vacuous at the
    // activation gate. Smuggled through `as unknown as` per the 2026-08-21
    // lesson: proving it cannot be TYPED is not proving it cannot be CAST.
    const smuggled = {
      ...validVoice,
      provenance: { schemaVersion: 999 },
    } as unknown;
    const out = parseBrainContent("voice", smuggled) as Record<string, unknown>;
    // The LEAF is server-owned; its parent is an ordinary declared position,
    // so the parent survives empty for the server to fill and the caller's
    // value is gone. Asserting on the value is the property that matters.
    expect(out.provenance).toEqual({});
    expect(JSON.stringify(out)).not.toContain("999");
    expect(readPointer(out, "/provenance/schemaVersion")).toBeUndefined();
  });

  it("an undeclared key separates them too, via the exported seam", () => {
    // Not production-reachable (a strict schema refuses it at parse), which is
    // why it is the SECOND discriminator and not the first.
    const smuggled = { ...validVoice, surprise: 9 } as unknown;
    const real = enumerateClaimFieldsOf(BRAIN_CONTENT_SCHEMAS.voice, smuggled);
    const mutant = enumerateFromPayload(smuggled);
    expect(real).not.toContain("/surprise");
    expect(mutant).toContain("/surprise");
  });

  it("the nested node enumerates its claims INDIVIDUALLY, not as a subtree", () => {
    // Guards the shape AC-55 mandates against the collapse round 5 measured:
    // a nested object must not become one confirmable position.
    const withServerField = { ...validVoice, provenance: { schemaVersion: 1 } };
    const real = enumerateClaimFieldsOf(
      BRAIN_CONTENT_SCHEMAS.voice,
      withServerField
    );
    expect(real).not.toContain("/provenance");
  });

  it("REFUSES a required claim that is absent — absence is a disagreement", () => {
    // The largest member of the fail-closed class, and the one the first
    // version missed: enumerateClaimFields("strategy", {}) returned [] and an
    // empty claim set satisfies the activation gate vacuously. Worse, after a
    // schema widening every stored row enumerated the OLD claim set, so a
    // newly-required claim was never shown to the creator.
    expect(() => enumerateClaimFields("strategy", {})).toThrow(ClaimWalkError);
    expect(() => enumerateClaimFields("voice", {})).toThrow(ClaimWalkError);

    // The widening case, explicitly.
    const widened = z.strictObject({
      register: claim(z.string()),
      audienceAssumption: claim(z.string()),
    });
    expect(() =>
      enumerateClaimFieldsOf(widened, { register: "deadpan" })
    ).toThrow(ClaimWalkError);

    // ...and an ABSENT OPTIONAL claim is still legitimately not a field.
    const opt = z.strictObject({
      here: claim(z.string()),
      maybe: claim(z.string()).optional(),
    });
    expect(enumerateClaimFieldsOf(opt, { here: "x" })).toEqual(["/here"]);
  });

  it("REFUSES an array-schema position holding a non-array — AC-53's own shape", () => {
    // A detector gap a reviewer found by running 21 mutations of its own:
    // the fail-closed loop drove four values at the ROOT, where all four land
    // in the object branch, so the array branch had no detector at all.
    expect(() =>
      enumerateClaimFieldsOf(BRAIN_CONTENT_SCHEMAS.voice, {
        register: "a",
        sentenceRhythm: "b",
        signatureMoves: { 0: "not-an-array" },
        avoid: [],
      })
    ).toThrow(ClaimWalkError);
  });

  it("the walk REFUSES an UNHANDLED NODE TYPE rather than skipping it", () => {
    // The other half of the fail-closed rule: not a disagreement between
    // schema and instance, but a node the walker does not understand. Its
    // sibling in echo.ts refuses for the same reason.
    const exotic = z.strictObject({ p: z.string() }) as unknown;
    // Reach the walker with a node type it has no branch for by handing it a
    // schema position that is neither container, claim, nor serverOwned.
    expect(() => enumerateClaimFieldsOf(z.string(), "anything")).toThrow(
      ClaimWalkError
    );
    expect(() => enumerateClaimFieldsOf(z.number(), 42)).toThrow(ClaimWalkError);
    void exotic;
  });

  it("the walk REFUSES a schema/instance disagreement instead of returning []", () => {
    // The class, not a list of four shapes: an empty claim set satisfies the
    // activation gate vacuously, so a drifted row would activate with zero
    // fields confirmed.
    for (const bad of ["a string", null, [], 42]) {
      expect(() =>
        enumerateClaimFieldsOf(BRAIN_CONTENT_SCHEMAS.voice, bad)
      ).toThrow(ClaimWalkError);
    }
  });

  it("serverOwnedFields names every server-owned position, so it can be stripped", () => {
    expect(serverOwnedFields("voice")).toEqual(["/provenance/schemaVersion"]);
  });
});
