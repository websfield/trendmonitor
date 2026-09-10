// Per-kind, SERVER-OWNED content schemas for `brain_docs.content`.
//
// WHY THIS FILE EXISTS. `content` was `jsonb`/`unknown`, and the inferred-field
// set — the thing the creator must confirm field by field (REQ-B02, D-M2-5b) —
// was derived by walking the model's own document. Three plan-review rounds
// converged on the same defect from three directions: that makes the derivation
// "server-derived" only in the weak sense that the server performs the walk. In
// the strong sense that decides whether the guarantee is real, THE MODEL CHOSE
// WHAT WAS WALKED — so a claim written as a number, a boolean, or an extra key
// was not an inferred field at all: it needed no evidence, never rendered as a
// placeholder, passed the activation gate vacuously, and reached the export.
//
// The fix is to own the shape. A claim is a position the SCHEMA declares, not a
// leaf the payload happens to contain.
//
// THREE MEASURED FACTS ABOUT THE INSTALLED zod (4.4.3) SHAPE THIS FILE. Each
// was probed rather than assumed, because the prose version of each was wrong:
//
//   1. `.strict()` DOES NOT PROPAGATE. Measured:
//        z.object({tone: z.object({register: z.string()})}).strict()
//          .safeParse({tone: {register: "d", followerCount: 42000}})  ->  SUCCESS
//      A top-level `.strict()` refuses only top-level unknown keys, so an
//      invented specific one level down sails through. Every object node here
//      is therefore `z.strictObject`, and `assertClosedSchema` enforces it for
//      every node of every registered schema rather than trusting the author.
//
//   2. THE UNKNOWN KEY SURVIVES IN THE INPUT. zod strips it from the PARSE
//      OUTPUT while leaving the caller's object untouched. So `parseBrainContent`
//      returns the parse output and callers must store THAT — storing the
//      caller's payload after a successful parse re-admits everything the
//      schema just removed.
//
//   3. A `z.record` SUBTREE HANDS THE KEY SPACE BACK. Measured: a record inside
//      a strict parent accepts `{anythingTheModelWants: "..."}`. `record`,
//      `any`, `unknown` and loose objects are therefore refused outright by
//      `assertClosedSchema` — the closed key space is the whole basis on which
//      REQ-B02's "never silently infers" rests on creator confirmation.
import { z } from "zod";
import type { BrainKind } from "./brain-schema";

/**
 * The placeholder an unevidenced field renders as (REQ-I03).
 *
 * IT IS A SCHEMA VALUE, NOT A RENDER-TIME SUBSTITUTION, and that is the point.
 * The obvious design — "a zero-evidence field renders `[check]`" — is
 * unimplementable for the very leaves this file exists to cover: a strict
 * `z.number()` cannot hold the string `[check]`, so the placeholder would have
 * had to live outside `content`, leaving the model's uncited number STORED and
 * neutralised only by whichever readers remembered to do it. Making every claim
 * a union with this literal means the placeholder is representable for every
 * type, at rest, once — so there is no reader that can forget.
 */
export const CHECK = "[check]" as const;

/**
 * Mark a leaf as CLAIM-BEARING: something the model asserts about the creator,
 * which therefore needs evidence and creator confirmation.
 *
 * "Claim-bearing" is defined BY CONSTRUCTION rather than by a predicate over
 * JSON types. A predicate ("every string leaf", "every scalar") is a guess
 * about which values carry assertions, and the guess is what let numbers
 * escape. Here the schema author marks the position and the enumerator finds
 * exactly those — so widening a schema without marking a new claim is a visible
 * omission in this file, not a silent hole in a walker.
 */
export function claim<T extends z.ZodType>(inner: T) {
  return z.union([inner, z.literal(CHECK)]);
}

/**
 * The registry of SERVER-OWNED positions.
 *
 * A WeakSet rather than a wrapper schema, deliberately: every other marking
 * scheme considered changes the VALUE SPACE (a sentinel union) or the parse
 * behaviour, and a server-owned leaf must parse exactly as its own type. The
 * set holds the schema instances themselves, which are the same instances
 * `assertClosedSchema` walks.
 */
const SERVER_OWNED = new WeakSet<object>();

/**
 * Mark a leaf as SERVER-OWNED: not a claim about the creator, so it needs no
 * evidence and no confirmation.
 *
 * THE EXEMPTION IS ITSELF A MARKER, which is the whole point. Round 5's review
 * found that an unmarked leaf was the escape hatch a bare `z.string()` used to
 * be — so there is no third, unlabelled state: a leaf is either `claim(...)`
 * (the creator confirms it) or `serverOwned(...)` (the server writes it), and
 * anything else fails at module load.
 *
 * A `serverOwned` position is stripped from the caller's payload inside
 * `parseBrainContent` — the single validation funnel — so the marker is a
 * control and not a note of intent.
 */
export function serverOwned<T extends z.ZodType>(inner: T): T {
  // A FRESH CLONE, never the caller's instance. Marking the instance meant a
  // factored-out leaf was exempt everywhere it was reused:
  //   const t = z.string();
  //   z.strictObject({ srv: serverOwned(t), mine: t })  ->  BOTH exempt
  // `/mine` then needed no evidence, was not confirmable and could not hold
  // "[check]" — the unmarked-leaf defect this marker replaced, reachable by an
  // ordinary refactor. `claim()` was never exposed to this because it
  // allocates a new union per call; this now matches.
  const clone = (inner as unknown as { clone?: () => T }).clone?.() ?? inner;
  if (clone === (inner as unknown)) {
    throw new SchemaShapeError(
      "serverOwned() could not clone the schema it was given, so the marker would alias every other position sharing that instance"
    );
  }
  SERVER_OWNED.add(clone as unknown as object);
  return clone;
}

function isServerOwned(node: unknown): boolean {
  return SERVER_OWNED.has(node as object);
}

/** The scalar types a claim() may wrap. Containers are refused separately. */
const ALLOWED_CLAIM_INNER_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "literal",
  "enum",
]);

export class SchemaShapeError extends Error {
  constructor(detail: string) {
    super(
      `Brain content schema rejected: ${detail}. A registered kind schema must have a CLOSED key space — no record, any, unknown, catchall or loose object — because REQ-B02's "never silently infers sensitive personal traits" rests on the creator confirming every claim, and a claim the model can name a key for is a claim no one confirmed.`
    );
    this.name = "SchemaShapeError";
  }
}

type ZodInternals = { _zod: { def: Record<string, unknown> } };
const def = (s: unknown) => (s as ZodInternals)._zod.def;

/** True for the `claim(...)` shape: a union carrying the CHECK literal. */
function isClaim(node: unknown): boolean {
  const d = def(node);
  if (d.type !== "union") return false;
  const options = d.options as unknown[];
  return options.some((o) => {
    const od = def(o);
    return (
      od.type === "literal" && (od.values as unknown[])?.includes(CHECK)
    );
  });
}

/**
 * Refuse any schema that is not CLOSED and FULLY MARKED.
 *
 * Two rules, and the split between them is the part that was got wrong in
 * prose three times before it was measured:
 *
 *   1. At a SHAPE POSITION (an object value, an array element, an optional's
 *      inner type) every non-container node must be `claim(...)` or
 *      `serverOwned(...)`. An unmarked leaf is a position that needs no
 *      evidence, is not confirmable, cannot hold `[check]`, and passes the
 *      activation gate vacuously — the model's decision moved to a schema
 *      author who forgot a wrapper.
 *
 *   2. INSIDE a `claim(...)` union the option nodes are NOT required to carry
 *      a marker — they are the claim's own type — but they must still be
 *      CLOSED. Measured, and this is why the rule is split: `claim(x)` is
 *      `z.union([x, z.literal(CHECK)])`, so its options are bare `string` and
 *      `literal` nodes. Applying rule 1 inside the union refuses all four
 *      shipped kinds; dropping the recursion instead re-admits
 *      `claim(z.any())` and `claim(z.record(...))`. Both halves are needed.
 *
 * A `claim()` of an OBJECT or ARRAY is refused outright: it collapses a whole
 * subtree into ONE confirmable position, so one confirmation would confirm
 * claims the creator never saw and one evidence entry would satisfy the
 * evidence bar for all of them (REQ-B02's "confirm each inferred field").
 *
 * CALLED AT MODULE LOAD over the whole registry (see the bottom of this file).
 * A guard that runs only under vitest is a test, not a guard.
 */
export function assertClosedSchema(schema: unknown, path = ""): void {
  assertShapePosition(schema, path);
}

/** Rule 1: a position the schema declares. Must be a container or a marked leaf. */
function assertShapePosition(schema: unknown, path: string): void {
  const d = def(schema);
  const type = d.type as string;
  const where = path || "(root)";

  // THE MARKER IS CHECKED BEFORE THE CONTAINER BRANCHES.
  //
  // Testing `object`/`array` first meant a serverOwned CONTAINER never reached
  // the marker check at all, so the three walkers disagreed about one node:
  // assertClosedSchema accepted it, serverOwnedFieldsOf reported the whole
  // subtree as one stripped position, and enumerateClaimFieldsOf reported the
  // claims inside it as confirmable. Once the strip exists that is either a
  // required-but-unconfirmable claim or a silently stripped claim subtree.
  if (isServerOwned(schema)) {
    // The marking exemption is NOT a closure exemption: serverOwned(z.any())
    // hands the key space back exactly as claim(z.any()) would, and
    // assertClaimInner refuses containers for the reason above.
    assertClaimInner(schema, where);
    return;
  }

  if (type === "object") {
    assertStrictObject(d, where);
    for (const [k, v] of Object.entries(d.shape as Record<string, unknown>)) {
      assertShapePosition(v, `${where === "(root)" ? "" : where}/${k}`);
    }
    return;
  }
  if (type === "array") {
    assertShapePosition(d.element, `${where}[]`);
    return;
  }
  if (type === "optional") {
    assertShapePosition(d.innerType, where);
    return;
  }
  if (type === "union") {
    if (!isClaim(schema)) {
      throw new SchemaShapeError(
        `${where} is a union that is not a claim() — only claim(...) unions are permitted, so every union in a kind schema is a confirmable position`
      );
    }
    for (const o of d.options as unknown[]) assertClaimInner(o, where);
    return;
  }
  throw new SchemaShapeError(
    `${where} is an UNMARKED '${type}' leaf — every leaf must be claim(...) (the creator confirms it) or serverOwned(...) (the server writes it). An unmarked leaf needs no evidence, is not confirmable, cannot hold "${CHECK}", and passes the activation gate vacuously`
  );
}

/** Rule 2: the type INSIDE a claim. Not required to be marked; still must be closed. */
function assertClaimInner(schema: unknown, path: string): void {
  const d = def(schema);
  const type = d.type as string;
  const where = path || "(root)";

  if (type === "object" || type === "array") {
    throw new SchemaShapeError(
      `${where} is a claim() wrapping a ${type} — that collapses a whole subtree into ONE confirmable position, so one confirmation would cover claims the creator never saw individually (REQ-B02). Mark the leaves inside it instead`
    );
  }
  if (type === "optional") {
    assertClaimInner(d.innerType, where);
    return;
  }
  if (type === "union") {
    for (const o of d.options as unknown[]) assertClaimInner(o, where);
    return;
  }
  if (!ALLOWED_CLAIM_INNER_TYPES.has(type)) {
    throw new SchemaShapeError(
      `${where} is a claim() wrapping a '${type}' node — record, any, unknown and catchall hand the key space back to the model, which is what creator confirmation rests on being closed`
    );
  }
}

function assertStrictObject(d: Record<string, unknown>, where: string): void {
  // Measured: a strict object's catchall is a `never` node; a loose object's
  // catchall is undefined. Anything else is an open door.
  const catchall = d.catchall;
  if (!catchall || def(catchall).type !== "never") {
    throw new SchemaShapeError(
      `${where} is a loose object — use z.strictObject, because a top-level .strict() does NOT propagate to nested objects (measured on the installed zod)`
    );
  }
}

// --------------------------------------------------------------- the schemas
//
// DELIBERATELY SMALL. No writer exists yet — the inference path is M2b-2 — so
// these declare the shape the substrate guarantees, not the final vocabulary.
// Widening one is a visible edit to this file that must add `claim()` markers
// and update the fixtures, which is exactly the review point the old
// `unknown` content had nowhere to put.

const voiceContent = z.strictObject({
  register: claim(z.string()),
  sentenceRhythm: claim(z.string()),
  signatureMoves: z.array(claim(z.string())),
  avoid: z.array(claim(z.string())),
  // A NESTED OBJECT NODE and a SERVER-OWNED LEAF, both of which exist so the
  // guards above have a production site. Round 5's review found that no
  // registered kind had either, so the criteria covering them had nowhere to
  // fire and their mutations had nothing to mutate — the same defect as a
  // guard that runs only in a test.
  // OPTIONAL, because it is the SERVER's to write. Requiring a caller to
  // supply a server-owned field would invert the whole point of the marker —
  // and the runtime strip means a caller-supplied value never survives
  // anyway. The server fills it after the parse.
  provenance: z
    .strictObject({
      schemaVersion: serverOwned(z.number()),
    })
    .optional(),
});

/**
 * The declared north-star metric's direction (slice 3b, R7) — closed, because
 * "higher is better" and "lower is better" are the only two readings a later
 * comparability check (slice 9) can act on without parsing prose.
 */
export const METRIC_DIRECTIONS = ["higher_is_better", "lower_is_better"] as const;

/**
 * THE DECLARED METRIC'S STABLE IDENTITY, derived from its label (R15: one
 * definition, and every reader takes THIS one).
 *
 * IT LIVES HERE, beside the `metric.key` position it serves, because that
 * schema comment is what promises the value is "slugified from `label`", and a
 * promise made in one file and kept in another is how two copies begin. It was
 * a private slug helper in `interview-ops.ts` whose docblock said the value
 * "is never read back" — true until slice 9a needed a metric identity, false
 * the moment it did. Two readers now: the interview's pre-strip payload, and
 * `declaredMetricOf`'s read-time derivation.
 *
 * DERIVED, NEVER STORED ON A BRAIN DOCUMENT — which is the correction slice
 * 9a's BLOCK bought. `metric.key` is `serverOwned`, so `parseBrainContent`
 * strips it before `writeBrainDoc` ever sees it: a stored key does not exist
 * for any document any product path has written. Deriving from the label makes
 * the identity a pure function of content that IS stored, so it cannot go
 * missing and cannot disagree with itself.
 *
 * BUT THIS FUNCTION'S OUTPUT *IS* PERSISTED, AND THAT MAKES THE SLUG RULE A
 * STORED-DATA FORMAT. Read this before changing a line of it. Every result row
 * keeps the derived value twice: in `results.metric_key` and inside
 * `results.treatment_key` (migration 0029, and C4 composes the treatment key
 * from the metric key). So a change here — unicode handling, the separator,
 * the `[^a-z0-9]` class, dropping the `"metric"` fallback — does not just
 * change future keys. It makes EVERY EXISTING ROW disagree with its own
 * re-derivation: `comparison.ts` then refuses the group ("names metric X but
 * brain_docs Y declares Z"), and because `results` is APPEND-ONLY WITH NO
 * DELETE PATH those creators' comparisons are refused permanently, with
 * nothing they can do about it.
 *
 * CHANGING THIS FUNCTION IS THEREFORE A DATA MIGRATION, not an edit. The two
 * places its outputs are pinned, so a change is at least loud:
 * `packages/db/tests/results-schema.test.ts` ("New followers" -> `new-followers`,
 * in `declaredMetricOf`'s cases) and
 * `packages/db/tests/results-schema-write.test.ts` ("Weekly saves" ->
 * `weekly-saves`, asserted on the stored row, the treatment key and the
 * comparison group in the end-to-end case). Both go red on any change; neither
 * migrates the rows already written.
 *
 * (This paragraph exists because its absence is the shape that produced the
 * round-1 BLOCK: a property true of the code, unstated at the one place a
 * reader decides whether an edit is safe.)
 *
 * WHAT IT COSTS, stated rather than discovered: editing the label changes the
 * key, so results logged before and after read as different metrics. That is
 * ALREADY true for a stricter reason — any edit to a Strategy document appends
 * a NEW version, and `results.metric_declared_by_doc_id` is a comparability
 * predicate — so the derived key adds no split the version predicate did not
 * already make.
 */
export function metricKeyFromLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "metric";
}

const strategyContent = z.strictObject({
  audience: claim(z.string()),
  positioning: claim(z.string()),
  pillars: z.array(claim(z.string())),
  // ADDED IN SLICE 3B (R1/R7), and OPTIONAL AT THE SCHEMA LEVEL deliberately —
  // every `strategy` fixture written before this slice omits them, and an
  // ABSENT optional claim is not a claim position at all
  // (`enumerateClaimFieldsOf`'s own docblock: "an ABSENT optional claim is not
  // a field"), so widening this way is backward compatible with every
  // existing document and test rather than a breaking schema migration. The
  // INTERVIEW-DRIVEN BUILDER (`interview-ops.ts`) always populates all three
  // for a document it constructs; the schema merely declares what a strategy
  // document MAY carry.
  goals: z.array(claim(z.string())).optional(),
  ambitions: z.array(claim(z.string())).optional(),
  /**
   * THE DECLARED NORTH-STAR METRIC (R7, PRD B03) — structured, not prose, so
   * a later slice can test comparability across versions without parsing a
   * sentence. The whole OBJECT is optional for the same backward-compatibility
   * reason `goals`/`ambitions` are; a real interview submission always fills
   * it.
   */
  metric: z
    .strictObject({
      // SERVER-OWNED, not a claim: a stable identifier this product derives
      // (slugified from `label`) rather than one a creator confirms per
      // field. It needs no evidence and no confirmation — see `serverOwned`'s
      // own docblock for why the exemption is itself the marker.
      //
      // IT IS NEVER STORED, AND SINCE SLICE 9A THAT IS LOAD-BEARING RATHER
      // THAN INCIDENTAL. `serverOwned` means `stripServerOwned` removes this
      // position inside `parseBrainContent`, so no `brain_docs.content` this
      // product has ever written contains a `metric.key` —
      // `interview-ops.test.ts` asserts exactly that against a real
      // `submitInterview` document. Slice 9a needed a metric identity and read
      // this position back, which returned `undefined` for every creator and
      // made `/results` unusable for all of them. The identity is DERIVED at
      // read time instead, by `metricKeyFromLabel` below — the same slug this
      // comment already promised, now with one definition.
      key: serverOwned(z.string()),
      label: claim(z.string()),
      unit: claim(z.string()),
      direction: claim(z.enum(METRIC_DIRECTIONS)),
      // Genuinely optional in the PRODUCT sense too, not only the schema
      // sense: a creator may decline to name a platform or a measurement
      // window for their metric, which is different from "have not decided
      // yet" — the interview omits the key entirely rather than storing
      // `[check]` for a field nobody was asked to commit to.
      platform: claim(z.string()).optional(),
      window: claim(z.string()).optional(),
    })
    .optional(),
});

const killtestContent = z.strictObject({
  // The creator's own kill criteria. The product's hard integrity rules
  // (tech-spec §3 step 3) are SERVER-OWNED and deliberately not here: a rule
  // the creator can edit or confirm away is not an integrity rule.
  rules: z.array(claim(z.string())),
  // ADDED IN SLICE 3B (R1), OPTIONAL for the identical backward-compatibility
  // reason `strategy`'s new fields are: every `killtest` fixture written
  // before this slice supplies `rules` alone.
  bannedWords: z.array(claim(z.string())).optional(),
  bannedVibes: z.array(claim(z.string())).optional(),
});

const performanceMetaContent = z.strictObject({
  rules: z.array(
    z.strictObject({
      metricLabel: claim(z.string()),
      metricKey: claim(z.string()),
      metricUnit: claim(z.string()),
      metricDirection: claim(z.enum(METRIC_DIRECTIONS)),
      lever: claim(z.enum(["reach", "conversion"])),
      platform: claim(z.string()),
      audienceClass: claim(z.enum(["organic", "paid"])),
      observedFrom: claim(z.string()),
      observedTo: claim(z.string()),
      treatmentN: claim(z.number()),
      baselineN: claim(z.number()),
      treatmentMedianPer1k: claim(z.number()),
      baselineMedianPer1k: claim(z.number()),
      effectPer1k: claim(z.number()),
      pastOutcome: claim(z.enum(["better", "worse"])),
      evidenceStrength: claim(z.enum(["early", "repeated", "corroborated"])),
      selfReportedN: claim(z.number()),
      connectorVerifiedN: claim(z.number()),
      confounders: z.array(
        claim(
          z.enum([
            "topic_overlap",
            "posting_time_unknown",
            "account_growth",
            "spillover_from_other_post",
            "external_promotion",
            "platform_change",
          ])
        )
      ),
    })
  ),
});

export const BRAIN_CONTENT_SCHEMAS = {
  voice: voiceContent,
  strategy: strategyContent,
  killtest: killtestContent,
  performance_meta: performanceMetaContent,
} as const satisfies Record<BrainKind, z.ZodType>;

/**
 * The known-bad shapes the load-time guard proves it still refuses.
 *
 * ONE PER RULE, and exported so the COVERAGE is assertable: a canary
 * that passes is indistinguishable from a clean registry, so dropping one
 * silently narrows what the guard's silence is worth. Asserting that some
 * canary fires is not enough — a reviewer measured that removing a single
 * entry left such a test green.
 */
export function CANARY_SHAPES(): Array<[string, z.ZodType]> {
  return [

    ["unmarked leaf", z.strictObject({ bad: z.string() })],
    ["claim of an open node", z.strictObject({ bad: claim(z.any()) })],
    ["claim of a container", z.strictObject({ bad: claim(z.strictObject({})) })],
    ["loose object", z.strictObject({ bad: z.object({ a: claim(z.string()) }) })],
    ["non-claim union", z.strictObject({ bad: z.union([z.string(), z.number()]) })],
  ];
}

/**
 * Run the closed-schema guard over a whole registry.
 *
 * Exported so the property "a badly-shaped kind cannot be registered" is
 * TESTABLE — and `check` is injectable for the same reason, so a suite can
 * drive an INERT checker through and prove the canary actually fires. Without
 * that seam the canary was unobservable: a canary that passes looks exactly
 * like a registry that is clean, which is the whole condition it exists to
 * distinguish. Testing it through the real registry is impossible by
 * construction — every registered kind is valid, so removing the call is an
 * equivalent mutant and no fixture can discriminate it. The property is real;
 * the detector has to take the registry as an argument.
 */
export function assertRegistryClosed(
  registry: Record<string, unknown>,
  check: (schema: unknown, path?: string) => void = assertClosedSchema
): void {
  // A CANARY FIRST: prove the guard is actually refusing something before
  // trusting its silence over the registry. Round 5's review found the
  // previous guard had no production caller at all, and a guard that has been
  // neutered looks exactly like a registry that is clean. This makes the two
  // distinguishable at load: if the guard stops refusing, THIS throws.
  // ONE CANARY PER RULE. A single unmarked-leaf canary only exercises rule 1
  // (`assertShapePosition`), so any mutation confined to rule 2 — re-admitting
  // `claim(z.any())`, say — left it green and the guard's silence still meant
  // nothing for half of what it guards.
  const CANARIES: Array<[string, z.ZodType]> = CANARY_SHAPES();
  for (const [label, canary] of CANARIES) {
    let refused = false;
    try {
      check(canary);
    } catch {
      refused = true;
    }
    if (!refused) {
      throw new SchemaShapeError(
        `the closed-schema guard did not refuse a known-bad canary (${label}) — the guard is INERT for that rule, so its silence over the registry means nothing`
      );
    }
  }

  for (const [kind, schema] of Object.entries(registry)) {
    try {
      check(schema);
    } catch (cause) {
      throw new SchemaShapeError(
        `registered kind '${kind}' is not a closed, fully-marked schema — ${(cause as Error).message}`
      );
    }
  }
}

// THE GUARD NO LONGER RUNS AT MODULE LOAD (Phase 10a closes G-15).
//
// It used to: "a guard that runs only in a test is a test, not a guard", and
// the module-load call was how it reached a deployed process. It reached
// every deployed process — `@respin/db`'s index imports this module, and so
// does the Stripe webhook route through `@respin/credits/webhook-server` — so
// one bad schema edit made the package unimportable and every Stripe delivery
// a 500 with no way out. The guard now runs from `preflight.ts`
// (`runStartupPreflight`) at three explicit startup points: the CI step
// (`pnpm preflight`), the Next.js server's `instrumentation.ts` `register()`,
// and the worker's `main`. A refusal there stops a process from STARTING,
// which is where a registry defect belongs. `brain-content.test.ts` scans
// this file for a top-level call and refuses one; `preflight.test.ts` plants
// a bad kind and watches the refusal. Nothing here is skippable by
// environment.


/**
 * The kinds the single brain-doc writer may persist. Performance Meta joined
 * this closed set in slice 9b; its product path remains the promotion approval
 * ceremony, while this registry keeps the shared writer exhaustive.
 */
export const WRITABLE_BRAIN_KINDS: ReadonlySet<BrainKind> = new Set([
  "voice",
  "strategy",
  "killtest",
  "performance_meta",
]);

export class KindNotYetWritableError extends Error {
  constructor(kind: string) {
    super(
      `Brain documents of kind '${kind}' cannot be written yet. This document is written from verified results once enough are logged, not inferred from onboarding material — inferring it now would be a performance claim with no verified result behind it (R-10).`
    );
    this.name = "KindNotYetWritableError";
  }
}

export class ClaimWalkError extends Error {
  constructor(pointer: string, expected: string, got: unknown) {
    super(
      `Cannot enumerate the claims of this brain document: at ${pointer || "(root)"} the schema declares ${expected} but the stored value is ${got === null ? "null" : Array.isArray(got) ? "an array" : typeof got}. This REFUSES rather than returning an empty claim set, because an empty set satisfies the activation gate vacuously — a document whose shape has drifted from its schema would otherwise activate with zero fields confirmed (REQ-B02, REQ-C05).`
    );
    this.name = "ClaimWalkError";
  }
}

export class ContentSchemaError extends Error {
  constructor(kind: string, detail: string) {
    super(
      `Brain document content does not match the '${kind}' schema: ${detail}. Content is server-shaped so that every claim about the creator is a position the schema declares — which is what makes "confirm each inferred field" (REQ-B02) something the server can enumerate rather than something the model chooses.`
    );
    this.name = "ContentSchemaError";
  }
}

/**
 * Validate and RETURN THE PARSE OUTPUT.
 *
 * Callers must store what this returns, never the value they passed in:
 * measured on the installed zod, an unknown nested key is stripped from the
 * output while remaining in the caller's object, so storing the input after a
 * successful parse re-admits everything the schema just removed.
 */
export function parseBrainContent(kind: BrainKind, content: unknown): unknown {
  if (!WRITABLE_BRAIN_KINDS.has(kind)) throw new KindNotYetWritableError(kind);
  const schema = BRAIN_CONTENT_SCHEMAS[kind];
  const result = schema.safeParse(content);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ContentSchemaError(
      kind,
      `${first.path.length ? `/${first.path.join("/")}` : "(root)"} ${first.message}`
    );
  }
  // STRIP EVERY SERVER-OWNED POSITION, HERE, IN THE SINGLE FUNNEL.
  //
  // Not in a helper a caller has to remember. Three reviewers found the same
  // defect independently: the marker had a production site and no enforcement,
  // so a model-supplied value at a server-owned position was stored as fact —
  // no evidence, not confirmable, unable to hold "[check]", vacuous at the
  // activation gate. That is the unmarked-leaf defect wearing a label, and the
  // header of this file argues that a control left "to whichever readers
  // remembered to do it" is exactly the shape to avoid.
  return stripServerOwned(schema, result.data);
}

/**
 * Remove every server-owned position from a parsed document.
 *
 * The server writes these AFTER the parse; whatever the caller sent is not
 * evidence of anything. Fails closed on any node it does not understand, like
 * the other two walkers in this file.
 */
export function stripServerOwned(schema: unknown, value: unknown): unknown {
  if (isServerOwned(schema)) return undefined;
  if (value === undefined || value === null) return value;
  const d = def(schema);
  const type = d.type as string;
  if (type === "optional") return stripServerOwned(d.innerType, value);
  if (isClaim(schema)) return value;
  if (type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) return value;
    const shape = d.shape as Record<string, unknown>;
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!(k in shape)) continue;
      const kept = stripServerOwned(shape[k], v);
      if (kept !== undefined) out[k] = kept;
    }
    return out;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return value;
    return value.map((v) => stripServerOwned(d.element, v));
  }
  return value;
}

/**
 * Every claim position the schema declares that is PRESENT in this document,
 * as RFC-6901 JSON Pointers.
 *
 * Walks the schema and the instance together, which settles the three shapes
 * the prose version left ambiguous:
 *   - an ABSENT optional claim is not a field (the alternative reading makes
 *     D-M2-5b unsatisfiable and bricks every brain);
 *   - an array enumerates BY INDEX against the instance, because the schema
 *     declares the element and only the instance declares the count;
 *   - type is irrelevant — a claim is a claim whether it holds a string, a
 *     number or a boolean.
 */
export function enumerateClaimFields(
  kind: BrainKind,
  content: unknown
): string[] {
  return enumerateClaimFieldsOf(BRAIN_CONTENT_SCHEMAS[kind], content);
}

/**
 * The enumeration itself, over ANY closed schema.
 *
 * Exported because the kind-keyed wrapper above can only ever be exercised
 * against the shapes the registered kinds happen to declare — and every one of
 * them is currently all-string, so a test driven through the wrapper cannot
 * distinguish this implementation from one that enumerates string leaves only.
 * A planted mutation proved exactly that (it stayed green), which is why the
 * seam exists: the tests drive numeric, boolean and optional claims through the
 * IDENTICAL code path rather than through a copy.
 */
export function enumerateClaimFieldsOf(
  schema: unknown,
  content: unknown
): string[] {
  const out: string[] = [];
  const escape = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");

  const walk = (schema: unknown, value: unknown, pointer: string): void => {
    // SERVER-OWNED FIRST, BEFORE THE ABSENCE CHECK.
    //
    // Ordering, and it is load-bearing rather than tidy. A serverOwned position
    // is never a claim, and it is legitimately ABSENT: `parseBrainContent`
    // strips it, so by the time anything enumerates the parse output the value
    // is gone. With this branch below the absence check, the strip's own output
    // made the enumerator throw — found the moment `writeBrainDoc` started
    // calling it for C-28, on a document carrying a caller-supplied value at
    // `/provenance/schemaVersion`.
    if (isServerOwned(schema)) return;
    if (value === undefined && def(schema).type === "optional") return;
    if (value === undefined) {
      // ONLY AN `optional` NODE MAY CONSUME `undefined`.
      //
      // Treating absence as "not a field" at every position was the largest
      // member of the fail-closed class and the one this walker missed:
      //   enumerateClaimFields("strategy", {})  ->  []
      // and, worse, after a schema widening every already-stored row
      // enumerates the OLD claim set — so a newly-required claim is never
      // shown to the creator and the activation gate passes vacuously on a
      // document that has never been confirmed against its current schema
      // (REQ-B02, REQ-C05). The `optional` branch below consumes `undefined`
      // legitimately before control ever reaches here.
      throw new ClaimWalkError(pointer, "a required claim position", value);
    }
    if (isClaim(schema)) {
      out.push(pointer);
      return;
    }
    const d = def(schema);
    const type = d.type as string;
    if (type === "optional") {
      walk(d.innerType, value, pointer);
      return;
    }
    if (type === "object") {
      // FAIL CLOSED on a schema/instance DISAGREEMENT, not merely on an
      // unhandled node type. Round 5 measured that the previous form returned
      // [] for object-schema/string-instance, /null and /array, and for
      // array-schema/object-instance — and an empty claim set satisfies the
      // activation gate vacuously, which is silent activation over
      // unconfirmed content. The class is the disagreement, not a list of
      // four shapes.
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ClaimWalkError(pointer, "object", value);
      }
      const shape = d.shape as Record<string, unknown>;
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(shape)) {
        walk(v, obj?.[k], `${pointer}/${escape(k)}`);
      }
      return;
    }
    if (type === "array") {
      if (!Array.isArray(value)) {
        throw new ClaimWalkError(pointer, "array", value);
      }
      value.forEach((v, i) => walk(d.element, v, `${pointer}/${i}`));
      return;
    }
    // Any node type this walker does not handle. Its sibling walker in
    // echo.ts refuses rather than skipping, for the same reason: a walker
    // that skips what it does not understand reports "no claims" for a
    // document full of them.
    throw new ClaimWalkError(pointer, `unhandled node '${type}'`, value);
  };

  walk(schema, content, "");
  return out;
}

/**
 * Every SERVER-OWNED position the schema declares, as RFC-6901 pointers.
 *
 * The enumeration behind the strip, exposed for tests and for callers that
 * need to name the positions. THE STRIP ITSELF RUNS IN `parseBrainContent`;
 * this function only reports. Round 6 found three reviewers blocking on a
 * version of this that reported and never stripped.
 */
export function serverOwnedFields(
  kind: BrainKind,
  instance?: unknown
): string[] {
  return serverOwnedFieldsOf(BRAIN_CONTENT_SCHEMAS[kind], instance);
}

export function serverOwnedFieldsOf(
  schema: unknown,
  instance?: unknown
): string[] {
  const out: string[] = [];
  const escape = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
  // Walks schema AND instance together, like `enumerateClaimFieldsOf`. The
  // schema-only version emitted "/xs[]" for an array-nested position — not an
  // RFC-6901 pointer, and `readPointer` resolves it to undefined, so a strip
  // driven by that list failed open on exactly the array positions.
  const walk = (node: unknown, value: unknown, pointer: string): void => {
    if (isServerOwned(node)) {
      out.push(pointer);
      return;
    }
    const d = def(node);
    const type = d.type as string;
    if (type === "optional") {
      walk(d.innerType, value, pointer);
      return;
    }
    if (isClaim(node)) return;
    if (type === "object") {
      const obj = (value ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(d.shape as Record<string, unknown>)) {
        walk(v, obj?.[k], `${pointer}/${escape(k)}`);
      }
      return;
    }
    if (type === "array") {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(d.element, v, `${pointer}/${i}`));
      }
      return;
    }
    if (["string", "number", "boolean", "literal", "enum"].includes(type)) return;
    throw new ClaimWalkError(pointer, `a walkable node (got '${type}')`, value);
  };
  walk(schema, instance, "");
  return out;
}

/** The claim positions whose stored value is the unevidenced placeholder. */
export function placeholderFields(kind: BrainKind, content: unknown): string[] {
  return enumerateClaimFields(kind, content).filter(
    (p) => readPointer(content, p) === CHECK
  );
}

/** Minimal RFC-6901 read, used by the placeholder scan and by tests. */
export function readPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  let node: unknown = root;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || node === undefined) return undefined;
    node = Array.isArray(node)
      ? node[Number(key)]
      : (node as Record<string, unknown>)[key];
  }
  return node;
}
