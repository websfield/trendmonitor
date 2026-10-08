// THE GENERATIVE WITNESS `claims.ts` NEVER HAD (audit Phase 2, P2-R1).
//
// WHY IT EXISTS. `claims.ts` owns REQ-I04/I05 and carried only specimen tables,
// while its sibling `traceability.ts` carries a generative witness that is the
// strongest control in the repo. Round 3 found three escapes in it — R3-2 (a
// `guarantee` in a caption only flags), R3-3a (the negated-clause guard reads
// `,`/`;` but not the em dash `assemble.ts` invites), R3-3b (a non-global
// match reads only the FIRST occurrence) — and `KNOWN_VOCABULARY_GAPS`' own
// revisit trigger fired. CLAUDE.md's 2026-08-18 lesson names the remedy: prove
// the property GENERATIVELY, never with a list of counterexamples.
//
// THE TEMPLATE IS `traceability.test.ts`'s generative block, copied in shape:
// a deterministic LCG seeded by a date literal; hand-written vocabularies, not
// a fuzzer; the property stated over the CLAUSE the generator planted (it knows
// whether the claim sits in a negated clause or an affirmed one, so the oracle
// is the construction, not the scanner); the shape population read from the
// module (`OUTPUT_CLAIM_SHAPES`, `CLAIM_CONTEXT_GUARDS`); the seed in every
// assertion label; and two-way non-vacuity.
//
// THE FIELD ORACLE IS A HAND-WRITTEN TABLE, NOT THE MODULE (Phase 2 gate,
// compliance). The first version asked `claimFieldsFor` which fields a shape
// refuses on and then checked the module against that answer — circular. The
// table below is R-168's decision written out independently: three shapes on
// every presented field except the creator's own quote, the rest on the
// explanation section only.
//
// AXES (widened after the Phase 2 gate; re-cut for the owner's 2026-10-07
// "strict + free refusal" decision, R-173, and again after its compliance
// verification BLOCK): {field — every one a shape refuses on} × {shape} ×
// {connective: separators, conjunctions, relative pronouns, parentheses,
// slash} × {negation form: a phrase of the CLOSED hedge allowlist, a phrase
// of it negated, questioned or excepted, or a negator anywhere else} ×
// {occurrence count} × {apostrophe spelling}. HONEST's phrases are READ FROM
// `CLAIM_HEDGE_ALLOWLIST` itself, so the honest frames and the allowlist
// cannot drift; UNDER asserts every other negation form refuses. A refusal
// caused only by the claim scan is free (R-173), which is what makes the
// strict direction affordable.
//
// THE MEASUREMENTS ARE RECORDED IN THE PHASE CARD, not here
// (`docs/progress/respin-audit-remediation-2026-09-19/phase-2-card.md`), each
// against the `claims.ts` bytes it ran on. Every rate below is a rate OVER
// THIS FILE'S SYNTHETIC VOCABULARY, not over stored creator drafts.
import { describe, expect, it } from "vitest";

import {
  ADMISSION_CLAIM_FIELDS,
  CLAIM_HEDGE_ALLOWLIST,
  CLAIM_HEDGE_TAILS,
  OUTPUT_CLAIM_SHAPES,
  scanOutputClaims,
  type ClaimFinding,
  type OutputClaimShape,
} from "../src/claims";
import { outputTextPointers } from "../src/output";
import { type TextUnit } from "../src/text";

/** Deterministic, so a violation is reproducible from the seed in the message. */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};
const pick = <T,>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length) % xs.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ITERATIONS = 1500;

// ------------------------------------------------------------ the oracle
//
// R-168, WRITTEN OUT BY HAND. Editing the module's scope without editing this
// table is red — which is the point of an independent oracle.

/** The three shapes that refuse on every presented field. */
const EVERY_PRESENTED = new Set(["guarantee", "proven to", "best-performing"]);

/** Every concrete pointer a creator-facing string can sit at (`*` → 0). */
const FIELDS = outputTextPointers().map((p) => p.replace(/\*/g, "0"));

/** Not presented (R-154): the model's disclosure section. */
const notPresented = (field: string) => field.startsWith("/disclosure/");
/** The creator's own quote — their words, never the product's claim. */
const creatorQuote = (field: string) => /\/basis\/excerpt$/.test(field);
/**
 * The weakest point: the draft's admission (R-173). Every hard shape refuses
 * there unless its sentence is an exact hedge or admission phrase, so the
 * field oracle treats it as part of the explanation section.
 */
const admission = (field: string) => field === "/whyThisPerforms/weakestPoint";
/** The product explaining its own draft. */
const explanation = (field: string) => field.startsWith("/whyThisPerforms/");

/** THE ORACLE: does this shape refuse on this field (unhedged)? */
function refusesOn(shape: OutputClaimShape, field: string): boolean {
  if (shape.enforcement === "flag") return false;
  if (explanation(field)) return true;
  if (!EVERY_PRESENTED.has(shape.id)) return false;
  return !notPresented(field) && !creatorQuote(field);
}

const HARD_SHAPES = OUTPUT_CLAIM_SHAPES.filter((s) => s.enforcement === "hard");

/** The families a hedge can soften: every hard shape but concealment, whose guards are its own. */
const HEDGEABLE = HARD_SHAPES.filter((s) => s.family === "performance" || s.family === "certainty");

/** Every field a shape refuses on, by the oracle. */
const refusingFields = (shape: OutputClaimShape) => FIELDS.filter((f) => refusesOn(shape, f));

// ------------------------------------------------------------ vocabularies

/** Negated clauses that END before the claim begins: the claim is affirmed. */
const NEGATED_CLAUSES = [
  "nothing here is certain",
  "none of this has been tested on your audience",
  "nobody can promise numbers",
  "not one line here is measured",
  "no part of this is checked against your posts",
  "nothing else matters",
  "nobody talks about this",
  "nothing beats a method",
  "i can't promise anything",
];

/**
 * Every clause boundary a model writes between a negated clause and a claim:
 * punctuation, coordinating and subordinating conjunctions, relative
 * pronouns, a slash. `{}` marks where the claim goes, so a parenthesis can
 * close after it.
 */
const CONNECTIVES = [
  ", {}", "; {}", ": {}", " — {}", " – {}", " - {}",
  " and {}", " but {}", ", but {}", " — but {}", " or {}", " so {}", " yet {}",
  " because {}", " while {}", " although {}", " since {}", " that {}",
  " which means {}", " (and {})", " / {}",
];

/** Lead-in clauses an honest weakest point opens with. */
const LEADS = ["", "Honestly, ", "To be clear, ", "For now, ", "In short; ", "One caveat: "];

/**
 * THE HONEST FRAMES ARE THE ALLOWLIST × THE TAIL LIST, BOTH READ FROM THE
 * MODULE (final compliance verification, 2026-10-07): a hedge is admitted only
 * as a whole sentence that IS a phrase plus one closed tail, so the honest
 * frames cannot drift from what the scan accepts.
 */
const hedgeSentence = (r: () => number, hedge: (typeof CLAIM_HEDGE_ALLOWLIST)[number]) =>
  pick(r, hedge.phrases) + pick(r, CLAIM_HEDGE_TAILS);

/** Sentence endings an admitted hedge may carry. A `?` is not one of them. */
const ENDINGS = [".", "!", "", "..."];

/** What a creator-facing claim does after a hedge to take it back, in the same sentence. */
const TRAILING_AFFIRMATIONS = [
  " like this hook",
  "; this hook is",
  ", they're inevitable",
  ", it just works every time",
  " comes close to this hook",
  ", the hook does",
  " anything less than results",
];

/** A LATER sentence of the same unit that takes the hedge back. */
const LATER_SENTENCES = ["Except results.", "Results are.", "But this hook is.", "Apart from this one.", "This one is, though."];

/**
 * OFF-ALLOWLIST NEGATORS (R-173 and its verification): a negator anywhere else,
 * including the factive and reporting frames the first allowlist accepted,
 * double negation and a challenge. Each frame is followed directly by a claim.
 */
const OFF_ALLOWLIST = [
  "don't miss this:",
  "never post again until you know",
  "no more guessing —",
  "not everyone knows",
  "you won't believe how",
  "nobody talks about how",
  "nothing beats knowing",
  "it's not luck,",
  "no doubt",
  "nobody tells you",
  "nobody tells you that",
  "nothing says growth like this:",
  "nothing makes it clearer than this:",
  "nothing shows it like this:",
  "nothing here means",
  "who says",
  "never not",
  "it's never not true that",
  "nothing else,",
];

/** How an allowlisted phrase is taken back: a second negator, a question, an exception. */
const DISQUALIFIERS: readonly [string, (hedge: string) => string][] = [
  ["second negator before", (h) => "nobody thinks " + h],
  ["second negator after", (h) => h + ", not even close"],
  ["double negation", (h) => "never " + h],
  ["question", (h) => h + "?"],
  ["who says", (h) => "who says " + h],
  ["except", (h) => h + ", except this hook"],
  ["but", (h) => h + ", but this one works"],
  ["apart from", (h) => h + " apart from this hook"],
];

/** The compliance gate's specimens (owner decision and its verification, 2026-10-07): each REFUSES. */
const COMPLIANCE_SPECIMENS: readonly (readonly [string, string])[] = [
  ["Don't miss this guaranteed growth hack.", "guarantee"],
  ["Never post again without this guaranteed hook.", "guarantee"],
  ["No more guessing with this guaranteed method.", "guarantee"],
  ["Not everyone knows this method is proven to work.", "proven to"],
  ["You won't believe how this is guaranteed to work.", "guarantee"],
  ["Nothing but guaranteed growth.", "guarantee"],
  ["Nothing is certain-this will perform.", "will perform"],
  // The verification BLOCK: factive and reporting verbs.
  ["Nobody tells you this hook is guaranteed to work.", "guarantee"],
  ["Nothing says growth like this guaranteed hook.", "guarantee"],
  ["Nothing makes it go viral faster than this hook.", "goes viral"],
  ["Nothing shows this is the best-performing hook like the numbers do.", "best-performing"],
  // The verification High: a negated or questioned hedge.
  ["Who says this isn't guaranteed?", "guarantee"],
  ["Nothing here means the results aren't guaranteed.", "guarantee"],
  ["Never not guaranteed.", "guarantee"],
  ["Nothing is ever guaranteed, except this hook.", "guarantee"],
  // The final verification BLOCK: a hedge phrase used as a comparison or an
  // affirmation, and a hedge taken back by a later sentence.
  ["There's no guarantee like this hook.", "guarantee"],
  ["No guarantee comes close to this hook.", "guarantee"],
  ["I don't guarantee results, the hook does.", "guarantee"],
  ["Nothing is guaranteed; this hook is.", "guarantee"],
  ["No guarantee, it just works every time.", "guarantee"],
  ["I can't guarantee anything less than results.", "guarantee"],
  ["Results aren't guaranteed, they're inevitable.", "guarantee"],
  ["Nothing here is guaranteed... except results.", "guarantee"],
  ["Nothing here is guaranteed! Results are.", "guarantee"],
  ["It's unlikely this won't go viral.", "goes viral"],
];

/** Straight or curly apostrophes, chosen by the rng, so the scan's normalisation is exercised. */
const spelled = (r: () => number, text: string) => (r() < 0.5 ? text : text.replace(/'/g, "’"));

/** Frames a claim sentence sits in on any field. None carries a negator. */
const CLAIM_FRAMES = ["{}.", "Honestly, {}.", "Here is the thing: {}.", "{}, and that is the point.", "Look — {}."];

const unitAt = (field: string, text: string): TextUnit => ({ field, text, isHook: false });

/** The hard finding for one shape, or undefined. */
const hardFor = (found: readonly ClaimFinding[], shape: OutputClaimShape) =>
  found.find((f) => f.shape === shape.id && f.enforcement === "hard");

describe("claims.ts, proven generatively (P2-R1)", () => {
  it("non-vacuity of the populations: every axis is non-empty, and the oracle names real pointers", () => {
    expect(FIELDS.length, "pointer set").toBeGreaterThan(20);
    expect(HARD_SHAPES.length).toBeGreaterThan(10);
    expect(HEDGEABLE.length).toBeGreaterThan(5);
    for (const id of EVERY_PRESENTED) {
      expect(HARD_SHAPES.map((s) => s.id), id).toContain(id);
    }
    expect(FIELDS.some(creatorQuote), "no creator-quote pointer — the exclusion is vacuous").toBe(true);
    expect(FIELDS.some(notPresented)).toBe(true);
    // The admission field is a real pointer, is the module's own, and every
    // UNDER property reaches it (none filters it out any more).
    expect(FIELDS.filter(admission)).toEqual([...ADMISSION_CLAIM_FIELDS]);
    for (const h of CLAIM_HEDGE_ALLOWLIST) for (const id of h.shapes) expect(HEDGEABLE.map((s) => s.id), h.id).toContain(id);
  });

  it("AFFIRMED: a negated clause before ANY clause boundary never softens the claim after it (seed 20261006)", () => {
    // `<lead><negated clause><connective><claim>`, on a field the claim
    // refuses on. The negator's clause has ended, so the claim is affirmed.
    // NO EXCLUSION since the final verification: the admission field flags
    // only exact admission sentences, so every field refuses these.
    const r = rng(20261006);
    const violations: string[] = [];
    const byConnective = new Map<string, number>();
    const reached = new Set<string>();
    let refused = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const shape = pick(r, HEDGEABLE);
      const connective = pick(r, CONNECTIVES);
      const field = pick(r, refusingFields(shape));
      const sentence = cap(pick(r, LEADS) + pick(r, NEGATED_CLAUSES) + connective.replace("{}", shape.specimen)) + ".";
      const found = scanOutputClaims([unitAt(field, sentence)]);
      reached.add(shape.id);
      if (hardFor(found, shape)) refused++;
      else {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + " not hard");
        byConnective.set(JSON.stringify(connective), (byConnective.get(JSON.stringify(connective)) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byConnective: Object.fromEntries(byConnective), first: violations.slice(0, 3) },
      "seed 20261006, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byConnective: {}, first: [] });
    expect(refused).toBeGreaterThan(ITERATIONS * 0.9);
    for (const s of HEDGEABLE) expect([...reached], s.id).toContain(s.id);
  });

  it("OCCURRENCE: a hedged first occurrence never hides an unhedged later one (seed 20261007)", () => {
    // Earlier occurrences are ALLOWLIST phrases where the shape has any — the
    // ones that really flag on their own — and the last is the bare claim.
    const r = rng(20261007);
    const violations: string[] = [];
    const byCount = new Map<number, number>();
    const reached = new Set<string>();
    let refused = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const shape = pick(r, HEDGEABLE);
      const k = 1 + Math.floor(r() * 3);
      const field = pick(r, refusingFields(shape));
      const hedges = CLAIM_HEDGE_ALLOWLIST.filter((h) => h.shapes.includes(shape.id));
      const earlier = Array.from({ length: k - 1 }, () => {
        if (hedges.length === 0) return shape.specimen;
        const h = pick(r, hedges);
        return hedgeSentence(r, h);
      });
      const sentence = [...earlier, shape.specimen].map((x) => cap(x) + ".").join(" ");
      const found = scanOutputClaims([unitAt(field, sentence)]);
      reached.add(shape.id + "@" + k);
      if (hardFor(found, shape)) refused++;
      else {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + " not hard");
        byCount.set(k, (byCount.get(k) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byOccurrenceCount: Object.fromEntries(byCount), first: violations.slice(0, 3) },
      "seed 20261007, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byOccurrenceCount: {}, first: [] });
    expect(refused).toBeGreaterThan(ITERATIONS * 0.9);
    for (const s of HEDGEABLE) for (const k of [1, 2, 3]) expect([...reached], s.id + "@" + k).toContain(s.id + "@" + k);
  });

  it("FIELD: every hard shape refuses exactly where the hand-written table says (seed 20261008)", () => {
    const r = rng(20261008);
    const violations: string[] = [];
    const byField = new Map<string, number>();
    const reached = new Set<string>();
    const refusedBy = new Set<string>();
    let refused = 0;
    let flagged = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const shape = pick(r, HARD_SHAPES);
      const field = r() < 0.25 ? pick(r, ["/whyThisPerforms/reasoning", ...ADMISSION_CLAIM_FIELDS]) : pick(r, FIELDS);
      const sentence = cap(pick(r, CLAIM_FRAMES).replace("{}", shape.specimen));
      const mine = scanOutputClaims([unitAt(field, sentence)]).find((f) => f.shape === shape.id);
      reached.add(shape.id);
      const shouldRefuse = refusesOn(shape, field);
      const didRefuse = mine?.enforcement === "hard";
      if (didRefuse) {
        refused++;
        refusedBy.add(shape.id);
      } else flagged++;
      if (mine === undefined || shouldRefuse !== didRefuse) {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + (didRefuse ? " hard" : " not hard"));
        byField.set(field, (byField.get(field) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byField: Object.fromEntries(byField), first: violations.slice(0, 3) },
      "seed 20261008, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byField: {}, first: [] });
    expect(refused).toBeGreaterThan(ITERATIONS * 0.2);
    expect(flagged).toBeGreaterThan(ITERATIONS * 0.2);
    for (const s of HARD_SHAPES) expect([...reached], s.id).toContain(s.id);
    for (const s of HARD_SHAPES) expect([...refusedBy], s.id + " never refused").toContain(s.id);
  });

  it("HONEST: every allowlist phrase × closed tail flags as a whole sentence — either apostrophe, any ending, any field its shape refuses on (seed 20261009)", () => {
    const r = rng(20261009);
    const violations: string[] = [];
    const byHedge = new Map<string, number>();
    const reachedPhrases = new Set<string>();
    let found0 = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const hedge = pick(r, CLAIM_HEDGE_ALLOWLIST);
      const shapeId = pick(r, hedge.shapes);
      const shape = HARD_SHAPES.find((x) => x.id === shapeId)!;
      const field = pick(r, refusingFields(shape));
      const phrase = pick(r, hedge.phrases);
      reachedPhrases.add(phrase);
      const sentence = spelled(r, cap(phrase + pick(r, CLAIM_HEDGE_TAILS)) + pick(r, ENDINGS));
      const results = scanOutputClaims([unitAt(field, sentence)]);
      if (results.some((f) => f.shape === shape.id)) found0++;
      if (hardFor(results, shape)) {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + " hard");
        byHedge.set(hedge.id, (byHedge.get(hedge.id) ?? 0) + 1);
      }
    }
    expect(
      { falseFires: violations.length, byHedge: Object.fromEntries(byHedge), first: violations.slice(0, 3) },
      "seed 20261009, " + ITERATIONS + " iterations"
    ).toEqual({ falseFires: 0, byHedge: {}, first: [] });
    expect(found0).toBe(ITERATIONS);
    const total = CLAIM_HEDGE_ALLOWLIST.reduce((n, h) => n + h.phrases.length, 0);
    expect(reachedPhrases.size, "phrases reached of " + total).toBeGreaterThan(total * 0.9);
  });

  it("UNDER: a negator OFF the allowlist never softens a claim (seed 20261010)", () => {
    // EVERY field the shape refuses on, the admission field included: since
    // the final verification a negator anywhere in a weakest point admits
    // nothing unless the sentence is an exact admission phrase.
    const r = rng(20261010);
    const violations: string[] = [];
    const byFrame = new Map<string, number>();
    for (let i = 0; i < ITERATIONS; i++) {
      const shape = pick(r, HEDGEABLE);
      const field = pick(r, refusingFields(shape));
      const frame = pick(r, OFF_ALLOWLIST);
      const sentence = spelled(r, cap(pick(r, LEADS) + frame + " " + shape.specimen) + ".");
      if (!hardFor(scanOutputClaims([unitAt(field, sentence)]), shape)) {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + " not hard");
        byFrame.set(frame, (byFrame.get(frame) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byFrame: Object.fromEntries(byFrame), first: violations.slice(0, 3) },
      "seed 20261010, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byFrame: {}, first: [] });
  });

  it("UNDER: an allowlisted phrase NEGATED, QUESTIONED or EXCEPTED refuses — every field, the admission field included (seed 20261011)", () => {
    const r = rng(20261011);
    const violations: string[] = [];
    const byHow = new Map<string, number>();
    const reached = new Set<string>();
    for (let i = 0; i < ITERATIONS; i++) {
      const hedge = pick(r, CLAIM_HEDGE_ALLOWLIST);
      const shapeId = pick(r, hedge.shapes);
      const shape = HARD_SHAPES.find((x) => x.id === shapeId)!;
      const field = pick(r, refusingFields(shape));
      const [how, apply] = pick(r, DISQUALIFIERS);
      reached.add(how);
      const phrase = hedgeSentence(r, hedge);
      const sentence = spelled(r, cap(pick(r, LEADS) + apply(phrase)) + (how === "question" ? "" : "."));
      if (!hardFor(scanOutputClaims([unitAt(field, sentence)]), shape)) {
        violations.push(JSON.stringify(sentence) + " @ " + field + " -> " + shape.id + " not hard");
        byHow.set(how, (byHow.get(how) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byHow: Object.fromEntries(byHow), first: violations.slice(0, 3) },
      "seed 20261011, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byHow: {}, first: [] });
    for (const [how] of DISQUALIFIERS) expect([...reached], how).toContain(how);
  });

  it("UNDER: a hedge sentence followed by an AFFIRMATION in the same sentence, or taken back by a LATER sentence, refuses — every field (seed 20261012)", () => {
    const r = rng(20261012);
    const violations: string[] = [];
    const byHow = new Map<string, number>();
    for (let i = 0; i < ITERATIONS; i++) {
      const hedge = pick(r, CLAIM_HEDGE_ALLOWLIST);
      const shape = HARD_SHAPES.find((x) => x.id === pick(r, hedge.shapes))!;
      const field = pick(r, refusingFields(shape));
      const sameSentence = r() < 0.5;
      const text = sameSentence
        ? cap(hedgeSentence(r, hedge) + pick(r, TRAILING_AFFIRMATIONS)) + "."
        : cap(hedgeSentence(r, hedge)) + pick(r, [".", "!", "..."]) + " " + pick(r, LATER_SENTENCES);
      const how = sameSentence ? "trailing affirmation" : "later sentence";
      if (!hardFor(scanOutputClaims([unitAt(field, spelled(r, text))]), shape)) {
        violations.push(JSON.stringify(text) + " @ " + field + " -> " + shape.id + " not hard");
        byHow.set(how, (byHow.get(how) ?? 0) + 1);
      }
    }
    expect(
      { escapes: violations.length, byHow: Object.fromEntries(byHow), first: violations.slice(0, 3) },
      "seed 20261012, " + ITERATIONS + " iterations"
    ).toEqual({ escapes: 0, byHow: {}, first: [] });
  });

  it("UNDER: every compliance specimen REFUSES on every field its shape refuses on, the admission field included", () => {
    const escapes: string[] = [];
    for (const [sentence, id] of COMPLIANCE_SPECIMENS) {
      const shape = HARD_SHAPES.find((s) => s.id === id)!;
      for (const field of refusingFields(shape)) {
        if (!hardFor(scanOutputClaims([unitAt(field, sentence)]), shape)) escapes.push(sentence + " @ " + field);
      }
    }
    expect({ escapes: escapes.length, first: escapes.slice(0, 3) }).toEqual({ escapes: 0, first: [] });
  });
});
