// THE HONESTY CANON'S THIRD TEXT SOURCE (learning-honesty gate, 2026-09-01).
//
// THE DEFECT THIS FILE EXISTS FOR. The canon has three sources of
// creator-facing text and only two were scanned:
//
//   1. STATIC SCREEN COPY — scanned by every `*-ui` suite that runs it against
//      `FORBIDDEN_CLAIMS ∪ PERFORMANCE_CLAIMS`.
//   2. MODEL OUTPUT — scanned by `packages/modes/src/claims.ts` since slice 6,
//      and bound to the canon by `tests/claims-vocabulary-agreement.test.ts`.
//   3. SEEDED AND CURATOR-AUTHORED LIBRARY DATA — scanned by NOTHING.
//
// Source 3 is `SHARED_FRAMEWORK_SEED` in `packages/db/src/frameworks.ts` plus
// every private framework a Pro or Studio creator writes. It renders verbatim
// to every creator through `sharedFrameworkLibrary` on `/studio/frameworks`,
// and two of its sentences were MEASURED matching `PERFORMANCE_CLAIMS` entries
// that `claims.ts` enforces as `hard` — "Every series pilot in the corpus
// OUTPERFORMED…" and "off far LARGER REACH and to far fewer follows". A model
// emitting either gets the draft refused and the creator debited; the product's
// own library said both out loud.
//
// `/studio/frameworks`' own honesty scan (`tests/framework-ui.test.tsx`) did
// not catch it because it renders a HAND-WRITTEN FIXTURE and never the seed,
// and `assertMechanismLevel` did not catch it because its `metric_phrase` rule
// covers `went viral` and `converts at` and neither of the two live strings.
//
// SO THIS FILE CLOSES THE POPULATION RATHER THAN THE TWO SENTENCES
// (CLAUDE.md 2026-08-29 — a population written as one path narrows silently
// the day a second appears). It does three things:
//
//   - runs the FULL canon over the real `SHARED_FRAMEWORK_SEED`, string by
//     string, with a planted violation per shape so a broken pattern is a red
//     test rather than a quiet zero;
//   - binds `packages/db`'s write-time `PERFORMANCE_CLAIM_RULES` to the canon
//     id-for-id, source-for-source and flag-for-flag, which is the same
//     agreement `claims-vocabulary-agreement.test.ts` asserts for the second
//     copy;
//   - drives the production write path with each specimen, so "creator-authored
//     content is scanned at write time" is a behaviour rather than a comment.
//
// BY PATH, NOT BY PACKAGE NAME, for the reason
// `tests/claims-vocabulary-agreement.test.ts` records: `tests/**` is the only
// tree exempt from the T1 default-deny and the specifier-shape deny, and
// importing `@respin/db`'s internals by path keeps the app package's resolution
// unchanged.
import { describe, expect, it } from "vitest";
import {
  assertMechanismLevel,
  matchesMechanismRule,
  MECHANISM_CONTENT_RULES,
  SHARED_FRAMEWORK_SEED,
  type FrameworkContent,
  type MechanismContentRule,
} from "../packages/db/src/frameworks";
import { FrameworkContentError } from "../packages/db/src/errors";
import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
  type ForbiddenClaim,
} from "./support/forbidden-claims";

/**
 * Every string a framework holds, with the field that holds it.
 *
 * A DELIBERATE SECOND WALKER, not an import of `contentStrings` (which is
 * module-private). If a field is added to `frameworkContentSchema` and only one
 * of the two walkers learns about it, the counts below disagree and this file
 * goes red — which is the property a shared helper would silently remove.
 */
function frameworkStrings(content: FrameworkContent): [string, string][] {
  const out: [string, string][] = [["name", content.name]];
  content.beats.forEach((b, i) => out.push([`beats[${i}]`, b]));
  out.push(["whyItConverts", content.whyItConverts]);
  content.applicability.forEach((a, i) =>
    out.push([`applicability[${i}].note`, a.note])
  );
  content.sourceReferences.forEach((s, i) =>
    out.push([`sourceReferences[${i}].ref`, s.ref])
  );
  content.evidenceEntries.forEach((e, i) => {
    out.push([`evidenceEntries[${i}].ref`, e.ref]);
    out.push([`evidenceEntries[${i}].observation`, e.observation]);
  });
  content.testedCaveats.forEach((c, i) => out.push([`testedCaveats[${i}]`, c]));
  return out;
}

const CANON: readonly ForbiddenClaim[] = [
  ...FORBIDDEN_CLAIMS,
  ...PERFORMANCE_CLAIMS,
];

/**
 * ONE SPECIMEN PER MECHANISM RULE, keyed by rule id, for the case declaration.
 *
 * BY RULE ID AND NOT AS A LIST, so a rule added to `MECHANISM_CONTENT_RULES`
 * without a specimen is a RED test rather than a rule nobody drove — the
 * population-as-a-list lesson (CLAUDE.md 2026-08-29) applied to the thing that
 * decides how each rule reads its input. The fourteen `claim:` entries are
 * derived from `CLAIM_SPECIMENS` rather than re-typed, because that map is
 * already the canon's per-word non-vacuity witness.
 *
 * EVERY SPECIMEN IS WRITTEN SO ITS SENTENCE-INITIAL FORM IS A DIFFERENT STRING
 * (BLOCK, tenancy + compliance gates, 2026-09-02). `attributed_person`'s was
 * "Invented by Marcus, refined since." — trigger word MID-SENTENCE and already
 * lower case — so upper-casing its first character produced the same string
 * and the sentence-initial branch had NO WITNESS. `matchesMechanismRule`'s
 * case opt-out had made the whole trigger alternation case-sensitive, and
 * "Credited to Sarah" was measured STORED as a framework NAME while "credited
 * to Sarah" refused. A specimen whose first word is not the thing under test
 * is a specimen that cannot fail.
 */
const RULE_CASE_SPECIMENS: Readonly<Record<string, string>> = {
  handle: "works the way @liahansenn does it",
  url: "see https://example.com/x for the shape",
  metric_unit: "reach of 75k on the first try",
  metric_noun: "it added 200 followers in a day",
  metric_phrase: "the six-figure month is the proof",
  metric_word_quantity: "it did four hundred thousand views",
  metric_multiplier: "it more than doubled her usual numbers",
  metric_multiplier_words: "twice as many saves",
  email: "questions to sarah.mitchell@mailbox.example",
  phone: "text 07700 900123 for the template",
  // The one CASE-SENSITIVE rule. Its specimen OPENS on the trigger word, in
  // lower case, so `sentence-initial` and `shouted` are both real variants.
  attributed_person: "by Marcus, refined since.",
  ...Object.fromEntries(
    PERFORMANCE_CLAIMS.map(([label]) => [`claim:${label}`, CLAIM_SPECIMENS[label]])
  ),
};

/** The three case forms every rule's specimen is driven in. */
const caseForms = (specimen: string): [string, string][] => [
  ["as written", specimen],
  ["sentence-initial", specimen[0].toUpperCase() + specimen.slice(1)],
  ["shouted", specimen.toUpperCase()],
];

type CanonHit = { framework: string; field: string; label: string; text: string };

/** The scan itself, so the planted cases and the real one share one implementation. */
function scanCanon(library: readonly FrameworkContent[]): CanonHit[] {
  const hits: CanonHit[] = [];
  for (const content of library) {
    for (const [field, text] of frameworkStrings(content)) {
      for (const [label, pattern] of CANON) {
        if (pattern.test(text.toLowerCase())) {
          hits.push({ framework: content.name, field, label, text });
        }
      }
    }
  }
  return hits;
}

/** A clean framework, so a plant is the baseline with exactly one field poisoned. */
const clean = (over: Partial<FrameworkContent> = {}): FrameworkContent => ({
  name: "The Reversal",
  beats: ["Open on the claim.", "Show the receipts.", "Invert the claim."],
  whyItConverts: "The turn arrives after the claim has been proven, so it lands.",
  applicability: [
    { goal: "follows", niche: "any", note: "Needs a claim the creator is inside." },
  ],
  sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
  evidenceEntries: [
    {
      kind: "internal_autopsy",
      ref: "corpus-batch-0",
      observation: "One piece built this way held its audience to the turn.",
    },
  ],
  testedCaveats: ["Inverting before the proof reads as a rationalisation."],
  saturation: "observed",
  ...over,
});

describe("the seeded library is held to the honesty canon", () => {
  it("the scan is NON-VACUOUS: a planted violation of every shape is seen", () => {
    // PER LABEL, NOT FOR THE LIST AS A WHOLE. A specimen caught by some OTHER
    // pattern would leave a typo in this one invisible — the failure
    // `/onboarding`'s own scan already shipped once (2026-08-27). Every plant
    // is placed in a DIFFERENT field in rotation, so the walker is exercised
    // across the shape rather than only on `whyItConverts`.
    const fields: (keyof FrameworkContent)[] = [
      "whyItConverts",
      "beats",
      "testedCaveats",
    ];
    CANON.forEach(([label], i) => {
      const specimen = CLAIM_SPECIMENS[label];
      expect(specimen, `${label} has no specimen in CLAIM_SPECIMENS`).toBeDefined();
      const field = fields[i % fields.length];
      const planted =
        field === "whyItConverts"
          ? clean({ whyItConverts: specimen })
          : field === "beats"
            ? clean({ beats: [specimen] })
            : clean({ testedCaveats: [specimen] });
      const hits = scanCanon([planted]);
      expect(
        hits.map((h) => h.label),
        `the plant for "${label}" (in ${String(field)}) was not seen — this pattern is scanning nothing`
      ).toContain(label);
    });
  });

  it("...and the CLEAN baseline is accepted, so the scan is not refusing everything", () => {
    expect(scanCanon([clean()])).toEqual([]);
  });

  it("the REAL seed makes no claim the canon forbids", () => {
    // Non-vacuity against the subject itself: the seed really was read, and it
    // really holds strings. Without this the assertion below passes on an
    // empty import.
    const strings = SHARED_FRAMEWORK_SEED.flatMap(frameworkStrings);
    expect(SHARED_FRAMEWORK_SEED.length, "the seed was not read").toBe(9);
    expect(strings.length, "the walker returned nothing").toBeGreaterThan(100);
    expect(
      scanCanon(SHARED_FRAMEWORK_SEED).map(
        (h) => `${h.framework} / ${h.field} [${h.label}]: ${h.text}`
      ),
      "the seeded library states a claim this product's own kill test refuses from a model — rewrite it to describe the MECHANISM, never the comparative outcome (R-71, REQ-D04)"
    ).toEqual([]);
  });
});

describe("the THIRD copy of the performance vocabulary agrees with the canon", () => {
  /**
   * `packages/db` cannot import the canon (test tree) and cannot import
   * `@respin/modes` (which depends on it), so its write-time copy is bound the
   * only way a copy can be: from here, exactly as
   * `tests/claims-vocabulary-agreement.test.ts` binds the second one.
   */
  const claimRules = MECHANISM_CONTENT_RULES.filter((r) =>
    r.id.startsWith("claim:")
  );

  it("id for id, IN ORDER, and the count is pinned on BOTH sides", () => {
    expect(claimRules.map((r) => r.id.slice("claim:".length))).toEqual(
      PERFORMANCE_CLAIMS.map(([label]) => label)
    );
    expect(claimRules.length).toBe(14);
    expect(PERFORMANCE_CLAIMS.length).toBe(14);
  });

  it("...and pattern for pattern, by SOURCE and FLAGS", () => {
    // The failure this rules out: an id list that agrees while one pattern was
    // edited on one side only, so the library scan and the screen guard
    // disagree about what the word means.
    for (const [i, rule] of claimRules.entries()) {
      const [label, pattern] = PERFORMANCE_CLAIMS[i];
      expect(rule.id, `entry ${i}`).toBe(`claim:${label}`);
      expect(rule.pattern.source, `${label} source`).toBe(pattern.source);
      expect(rule.pattern.flags, `${label} flags`).toBe(pattern.flags);
    }
  });

  it("no mechanism rule carries the `g` flag, which would make matching stateful", () => {
    // `matchesMechanismRule` builds a `g` COPY for the exemption path; a rule
    // that already carried `g` would make `new RegExp(p, 'gg')` a SyntaxError,
    // and a rule matched with `.test` under `g` returns false on its second
    // call for text that matches.
    for (const rule of MECHANISM_CONTENT_RULES) {
      expect(rule.pattern.flags, rule.id).not.toContain("g");
      for (const [i, list] of (rule.exempt ?? []).entries()) {
        expect(list.flags, `${rule.id} exempt[${i}]`).not.toContain("g");
      }
    }
  });

  it("...and a `caseFold` carries BOTH `g` and `i`, which are opposite failures", () => {
    // `caseFold` is REPLACED with rather than matched against, so its flags run
    // the other way from `pattern`'s. Without `g`, `String.replace` folds only
    // the FIRST occurrence and a second attribution later in the same string
    // keeps its capitals — the span-local hole this rule's exemption already
    // had once. Without `i` the fold matches nothing it was written for, and
    // the rule silently goes back to the case-sensitive trigger words that
    // stored "Credited to Sarah".
    for (const rule of MECHANISM_CONTENT_RULES) {
      if (!rule.caseFold) continue;
      expect(rule.caseFold.flags, `${rule.id} caseFold`).toContain("g");
      expect(rule.caseFold.flags, `${rule.id} caseFold`).toContain("i");
    }
  });

  it("a CASE-SENSITIVE rule must declare which of its parts are VOCABULARY", () => {
    // THE POPULATION GUARD FOR THE BLOCK (2026-09-02). Opting out of the fold
    // to keep `[A-Z][a-z]+` working also made the trigger alternation
    // case-sensitive, so every sentence-initial and shouted attribution
    // matched NOTHING while its lowercase twin refused. A `caseSensitive` rule
    // that declares no `caseFold` is claiming that EVERY character of it is
    // discriminator, which was false for the only rule that has ever taken the
    // opt-out — so the claim now costs a declaration.
    const caseSensitive = MECHANISM_CONTENT_RULES.filter((r) => r.caseSensitive);
    expect(caseSensitive.length, "no rule opts out — this case is vacuous").toBeGreaterThan(
      0
    );
    for (const rule of caseSensitive) {
      expect(
        rule.caseFold,
        `${rule.id} opts out of lowercasing and names no vocabulary — its own trigger words are then case-sensitive, which is the defect this case exists for`
      ).toBeDefined();
    }
  });

  it("EVERY performance specimen is REFUSED by the production write-time scan", () => {
    // The behavioural half. The agreement above says the two lists look alike;
    // this says the creator-facing write path actually refuses the sentence.
    for (const [label] of PERFORMANCE_CLAIMS) {
      const specimen = CLAIM_SPECIMENS[label];
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: specimen })),
        `"${specimen}" is storable as framework content — the write-time scan does not cover ${label}`
      ).toThrow(/was not stored/);
    }
  });

  it("EVERY RULE's specimen is refused AS WRITTEN, SENTENCE-INITIAL and SHOUTED", () => {
    // THE WITNESS THIS AGREEMENT NEVER HAD (tenancy gate, 2026-09-02) — AND
    // THE POPULATION IT WAS WRITTEN OVER WAS WRONG (BLOCK, tenancy +
    // compliance gates, 2026-09-02).
    //
    // ROUND 1's DEFECT: every specimen in `CLAIM_SPECIMENS` is lowercase, so
    // the agreement above held at PATTERN level while the APPLICATION level
    // was open. Nine of ten sentence-initial claims were measured storable —
    // "Outperforms the standalone pieces every time.", "Views climb when the
    // loop is seamless.", "Best-performing hook shape in the library."
    //
    // ROUND 2's DEFECT, WHICH IS THIS CASE'S OWN: the fix iterated
    // `PERFORMANCE_CLAIMS` — the fourteen `claim:` rules — and NEVER the
    // ELEVEN STRUCTURAL RULES beside them. `attributed_person` is the one rule
    // that opts out of lowercasing, so it is precisely the rule whose capitals
    // matter, and it is precisely the rule the loop could not reach. Measured
    // STORED on the live `createPrivateFramework` path: "Credited to Sarah" as
    // the framework NAME, "According to Marcus the turn lands late." in a
    // beat, "CREDITED TO SARAH." and "INVENTED BY MARCUS." shouted — a
    // personal name into shared-library-bound content, REQ-D03's queue,
    // REQ-A04's export and every generation's prompt (REQ-D04 / R-9).
    //
    // SO THE POPULATION IS `MECHANISM_CONTENT_RULES`, WHICH IS THE WHOLE
    // WRITE-PATH SCAN, and the specimen map is keyed by rule id so a rule with
    // no specimen is red rather than skipped (CLAUDE.md 2026-08-29). Driven
    // through `assertMechanismLevel` rather than through the single rule,
    // because "storable" is the property that leaked and the write path is
    // where it is decided.
    expect(MECHANISM_CONTENT_RULES.length, "the rule list was not read").toBeGreaterThan(
      14
    );
    for (const rule of MECHANISM_CONTENT_RULES) {
      const specimen = RULE_CASE_SPECIMENS[rule.id];
      expect(
        specimen,
        `${rule.id} has no case specimen — add one, it is what proves the rule reads capitals`
      ).toBeDefined();
      for (const [form, text] of caseForms(specimen)) {
        expect(
          () => assertMechanismLevel(clean({ whyItConverts: text })),
          `"${text}" (${form}) is storable as framework content — the write-time scan sees ${rule.id} in one case only`
        ).toThrow(/was not stored/);
      }
    }
  });

  it("...and the three forms are three DIFFERENT strings, so none is vacuous", () => {
    // The failure the specimen map already shipped: `attributed_person`'s
    // specimen was "Invented by Marcus, refined since." — trigger word
    // mid-sentence and already lower case — so `sentence-initial` produced the
    // IDENTICAL string and the case above asserted the same thing twice while
    // reading as though it covered three forms.
    for (const rule of MECHANISM_CONTENT_RULES) {
      const forms = caseForms(RULE_CASE_SPECIMENS[rule.id]).map(([, t]) => t);
      expect(
        new Set(forms).size,
        `${rule.id}'s specimen has no distinct sentence-initial or shouted form — one of the three cases above is asserting the same string twice`
      ).toBe(3);
    }
  });

  it("the case rule is DECLARED per rule, and the declaration is load-bearing", () => {
    // A `caseSensitive` rule that would answer the same lowercased is a flag
    // nobody needs, and an UNDECLARED rule that needs the case is a rule this
    // function has just silenced. Both directions are asserted, so the opt-out
    // cannot become decoration and cannot be added by habit.
    for (const rule of MECHANISM_CONTENT_RULES) {
      const specimen = RULE_CASE_SPECIMENS[rule.id];
      expect(
        specimen,
        `${rule.id} has no case specimen — add one, it is what proves the flag`
      ).toBeDefined();
      expect(matchesMechanismRule(rule, specimen), `${rule.id} specimen`).toBe(true);
      if (rule.caseSensitive) {
        expect(
          matchesMechanismRule(rule, specimen.toLowerCase()),
          `${rule.id} is declared caseSensitive but answers the same lowercased — the flag is decoration`
        ).toBe(false);
      } else {
        expect(
          matchesMechanismRule(rule, specimen.toUpperCase()),
          `${rule.id} does not see its own specimen shouted — it is matching raw text`
        ).toBe(true);
      }
    }
  });

  it("the three BARE NOUNS name what the rule knows, not a claim the writer made", () => {
    // MEASURED (2026-09-02): four of twelve plausible honest sentences were
    // refused on the bare nouns, each with a reason that is false about what
    // the creator wrote — "This shape wins saves, not views." was told it
    // "states a view count claim". The pattern cannot be softened here (it is
    // pinned source-for-source to the canon two cases up, and the model side
    // lives in another package), so the DETAIL is hedged exactly as
    // `attributed_person`'s was. Asserted rather than left in a comment.
    for (const id of ["claim:viral", "claim:views", "claim:engagement"]) {
      const rule = MECHANISM_CONTENT_RULES.find((r) => r.id === id);
      expect(rule, `${id} was renamed`).toBeDefined();
      expect(rule?.detail, id).toMatch(/reads as a claim/i);
      expect(rule?.detail, `${id} still asserts the creator made the claim`).not.toMatch(
        /^(states|claims) /
      );
    }
    // ...and the sentences that provoked it are still refused (the direction is
    // fail-closed), with the hedged wording rather than the false one.
    for (const text of [
      "This shape wins saves, not views.",
      "It trades engagement for attachment.",
      "The viral phase of this shape has passed.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).toThrow(
        /reads as a claim/
      );
    }
  });

  it("...and `FORBIDDEN_CLAIMS` is deliberately NOT on the write path", () => {
    // A RECORDED NON-COVERAGE, asserted so it cannot be mistaken for a gap.
    // `FORBIDDEN_CLAIMS` bans claims the PRODUCT makes about itself; a beat
    // saying a viewer learns something makes no claim about this product, and
    // refusing it would be the same false-reason over-reach the
    // `attributed_person` rule was corrected for in this pass. The SEED is
    // still held to both lists above — it is checked-in copy on a product
    // surface — and that difference is the whole decision.
    expect(() =>
      assertMechanismLevel(clean({ beats: ["The viewer learns the constraint."] }))
    ).not.toThrow();
  });
});

describe("the attribution rule's exemption is SPAN-LOCAL, not string-wide", () => {
  const attributed = MECHANISM_CONTENT_RULES.find(
    (r) => r.id === "attributed_person"
  ) as MechanismContentRule;

  it("the rule under test exists and carries an exemption", () => {
    expect(attributed, "attributed_person was renamed or removed").toBeDefined();
    expect(attributed.exempt, "the exemption is gone").toBeDefined();
    // TWO LISTS WITH DIFFERENT CASE SEMANTICS, which is the shape of the fix
    // for the shouted-name hole: `NOT_A_PERSON` carries `i` so a shouted
    // platform is exempt, and the acronym list is anchored ALL-CAPS so
    // `borrowed from SEO` passes while `credited to Seo` — a real surname —
    // still refuses. Collapsing them into one `i` regex reopens that.
    expect(attributed.exempt?.length, "the two exemption lists were merged").toBe(2);
    expect(attributed.exempt?.[0].flags, "the proper-noun list lost its `i`").toContain("i");
    expect(
      attributed.exempt?.[1].flags,
      "the acronym list gained an `i` — it now exempts Title-case surnames like Seo/Vo/Ai"
    ).not.toContain("i");
  });

  it("a non-person proper noun is accepted — the five sentences measured refused", () => {
    // Each of these was REFUSED on the live Pro+ write path, with the reason
    // "whyItConverts attributes the mechanism to a named person", which is
    // false about what the creator wrote.
    for (const text of [
      "Borrow a concept from Japanese and apply it to your own life.",
      "The shape travelled from Instagram to TikTok and still works.",
      "Cut from Monday footage so the week reads as one arc.",
      "It is the version people know from Reels.",
      "Open with a line lifted from Twitter-era discourse.",
    ]) {
      expect(matchesMechanismRule(attributed, text), text).toBe(false);
    }
  });

  it("a real attribution is still refused, and the wording no longer asserts a cause", () => {
    for (const text of [
      "Invented by Marcus, refined since.",
      "credited to Aisha for her own audience",
      "Run Vivian's version of the open.",
    ]) {
      expect(matchesMechanismRule(attributed, text), text).toBe(true);
    }
    // THE HEDGE IS THE FIX. A lexical rule cannot know a capitalised word is a
    // person; a refusal that says it does is naming a cause that did not
    // happen. Asserted rather than left in a comment (CLAUDE.md 2026-07-30).
    expect(attributed.detail).toMatch(/reads like/i);
    expect(attributed.detail).not.toMatch(/^attributes the mechanism/);
  });

  it("the POSSESSIVE half is exempt too — the half the exemption could not reach", () => {
    // MEASURED (tenancy gate, 2026-09-02): `NOT_A_PERSON` was anchored on the
    // END of the matched span and tested against that span, while this rule's
    // possessive alternative produces spans ending in the NOUN — so the
    // exemption was STRUCTURALLY UNREACHABLE for that whole half of the rule.
    // "Instagram's version of this loop is one beat shorter." refused as
    // reading like a person's name, with `Instagram` listed first in the
    // exemption. The exemption is now tested against the rule's CAPTURE.
    for (const text of [
      "Instagram's version of this loop is one beat shorter.",
      "TikTok's version opens on the caption instead.",
      "Monday's post is the anchor the rest of the week hangs off.",
    ]) {
      expect(matchesMechanismRule(attributed, text), text).toBe(false);
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
    // ...and a REAL possessive attribution still refuses, so the fix widened
    // the exemption to the alternative rather than to everything in it.
    expect(matchesMechanismRule(attributed, "Run Vivian's version of the open.")).toBe(
      true
    );
  });

  it("an EXEMPT span does not excuse a REAL one later in the same string", () => {
    // The mutation this closes: `test`-then-exempt would answer "no match"
    // for this sentence, because the first attribution-shaped span is
    // exempt — widening a span exemption into a whole-string one.
    expect(
      matchesMechanismRule(
        attributed,
        "The shape came from Instagram, and the wording came from Sarah."
      )
    ).toBe(true);
  });

  it("the TRIGGER WORDS are vocabulary, not discriminator — the BLOCK's own set", () => {
    // EVERY ONE OF THESE WAS MEASURED **STORED** on the live
    // `createPrivateFramework` path (tenancy + compliance gates, 2026-09-02),
    // and every lowercase equivalent refused. The rule opted out of
    // lowercasing so `[A-Z][a-z]+` would keep working, and took its own
    // trigger alternation with it: `by|from|credited to|…` matched lower case
    // only, so a sentence-initial or shouted attribution matched NOTHING.
    //
    // DRIVEN THROUGH THE WRITE PATH, not through the rule, because "stored" is
    // the property that leaked — into shared-library-bound content, REQ-D03's
    // curation queue, REQ-A04's export, and `whyItConverts` rides into every
    // generation's prompt (REQ-D04 / R-9).
    for (const text of [
      "Credited to Sarah, who ran it first. By Marcus it was refined. From Sarah came the double confession.",
      "According to Marcus the turn lands late.",
      "Credited to Sarah",
      "From Sarah, originally.",
      "By Marcus, refined since.",
      "By Sarah the shape was first run.",
      "Created by Sarah for her own audience.",
      "Invented by Marcus, refined since.",
      // MIXED CASE, which is neither of the two forms the reviewers measured
      // and is the same class: a trigger shouted in an ordinary sentence.
      "BY Marcus, refined since.",
      "CREDITED TO Sarah, who ran it first.",
      // The POSSESSIVE half, whose noun list was case-sensitive for the same
      // reason and had the same hole.
      "Run Vivian's version of the open.",
      "Run Vivian's VERSION of the open.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable — a personal name reaches library-bound content`
      ).toThrow(/was not stored/);
    }
    // ...and the lowercase twins, which always refused. If these ever go green
    // the fix has been reverted rather than widened.
    for (const text of [
      "credited to Sarah, who ran it first.",
      "according to Marcus the turn lands late.",
      "from Sarah, originally.",
      "by Marcus, refined since.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).toThrow(
        /was not stored/
      );
    }
  });

  it("...and SHOUTED, where the case signal is gone and the refusal says so", () => {
    for (const text of [
      "CREDITED TO SARAH.",
      "INVENTED BY MARCUS.",
      "FROM SARAH the double confession came.",
      "ACCORDING TO MARCUS the turn lands late.",
      "SARAH'S VERSION opens cold.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable`
      ).toThrow(/was not stored/);
    }
    // THE DETAIL NAMES BOTH HALVES, because the shouted branch cannot tell a
    // name from an ordinary word and a refusal that says it can is naming a
    // cause that did not happen — the class this file has now corrected four
    // times. The screen's copy is bound to this same string in
    // `tests/framework-ui.test.tsx`.
    expect(attributed.detail).toMatch(/reads like/i);
    expect(attributed.detail).toMatch(/shouts a word this scan cannot tell from one/i);
  });

  it("the DISCRIMINATOR survives: ordinary prose after a trigger is still ordinary", () => {
    // The fold lowercases the VOCABULARY and nothing else, so `[A-Z][a-z]+`
    // keeps doing the only job the case is for. If a future round reaches for
    // an `i` flag instead, every one of these goes red — which is the whole
    // reason the fold exists rather than the flag.
    for (const text of [
      "Cut from the top so the first beat is the claim.",
      "From the top, restate the claim.",
      "Borrow a concept from Japanese and apply it to your own life.",
      "The shape travelled from Instagram to TikTok and still works.",
      "Cut from Monday footage so the week reads as one arc.",
      "Instagram's version of this loop is one beat shorter.",
      // The exemption is case-insensitive, so a SHOUTED platform name is
      // exempt too — otherwise the shouted branch would refuse this with
      // `Instagram` sitting first in the exemption, which is the
      // structurally-unreachable failure the anchors were moved for.
      "THE SHAPE TRAVELLED FROM INSTAGRAM TO TIKTOK AND STILL WORKS.",
      // ACRONYMS, which pass because `NOT_A_PERSON_ACRONYM` NAMES THEM — not
      // because the shouted branch requires a shouted trigger. This comment
      // said the latter until 2026-09-02 (learning gate); that requirement is
      // exactly what the acronym list REPLACED, and the case forty lines
      // below ("a SHOUTED NAME after a LOWER-CASE trigger refuses") asserts
      // its opposite. An all-caps token after a lower-case trigger is a
      // PERSON here unless the list buys it back.
      "A shape lifted from ASMR still needs a personal turn.",
      "Borrowed from CGI, the reveal lands late.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
  });

  it("a SHOUTED NAME after a LOWER-CASE trigger refuses — the hole the first fix left", () => {
    // MEASURED STORED after the first fix for the BLOCK (coordinator
    // escalation, 2026-09-02). That fix required the TRIGGER to be shouted as
    // well as the name, so `FROM SARAH` refused and `from SARAH` did not —
    // a live instance of the very class two reviewers rated BLOCK, predicted
    // by the residue paragraph and left open by it. Shipping a known instance
    // of the class you just fixed is the weakest possible place to stop.
    for (const text of [
      "credited to SARAH, who ran it first.",
      "by MARCUS, refined since.",
      "from AISHA came the double confession.",
      "according to MARCUS the turn lands late.",
      "invented by SARAH.",
      "run VIVIAN'S version of the open.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable — a shouted personal name reaches library-bound content`
      ).toThrow(/was not stored/);
    }
  });

  it("...and a CAMELCASE or APOSTROPHE surname refuses — the same class, unreported", () => {
    // NOT NAMED BY EITHER REVIEWER and found by probing the class rather than
    // the instance: `[A-Z][a-z]+` cannot match a name with a capital inside
    // it, so these were STORED with every other half of the rule fixed. The
    // discriminator is "a token that looks like a proper noun", and Title case
    // is only one of the ways to look like one.
    for (const text of [
      "credited to McDonald for the shape.",
      "invented by MacLeod, refined since.",
      "from O'Brien came the double confession.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable`
      ).toThrow(/was not stored/);
    }
    // ...and the CamelCase PLATFORM names the same alternation now captures
    // are bought back by the exemption, so this widened the capture and not
    // the refusal.
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "The shape travelled from TikTok to Instagram." })
      )
    ).not.toThrow();
  });

  it("an ACRONYM passes and its TITLE-CASE SURNAME TWIN refuses — why there are two lists", () => {
    // THE TRADE, DRIVEN IN BOTH DIRECTIONS. An all-caps token after a trigger
    // is a person unless a list says otherwise, because `SARAH` and `ASMR` are
    // lexically identical. The acronym list is therefore ALL-CAPS-ANCHORED and
    // carries no `i`: several entries are real surnames in Title case, and an
    // `i` would trade the shouted-name leak for a Title-case one.
    for (const text of [
      "A shape lifted from ASMR still needs a personal turn.",
      "Borrowed from CGI, the reveal lands late.",
      "A trick borrowed from SEO, applied to a hook.",
      "Recorded from VO rather than to camera.",
      "A beat borrowed from AI tooling.",
      "Cut from UGC you already have.",
      "Learn from CTA placement on the last beat.",
      "Borrowed from VFX, the match cut hides the edit.",
      "A structure taken from BTS content.",
      "Lifted from GRWM openings.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
    for (const text of [
      "credited to Seo for the shape.",
      "invented by Vo, refined since.",
      "from Ai came the double confession.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable — the acronym list gained an \`i\` and now exempts a surname`
      ).toThrow(/was not stored/);
    }
  });

  it("the PRICE is asserted too: ALL-CAPS EMPHASIS after a trigger refuses", () => {
    // THE COST OF THE LINE ABOVE, measured and written as a passing assertion
    // so the residue paragraph cannot drift into claiming this is free. The
    // failure direction of an incomplete acronym list is exactly this: a
    // refusal a writer fixes by removing the shout, never a name stored.
    for (const text of [
      "Learn from EVERY comment you get.",
      "Cut it from THE TOP.",
      "Borrowed from OLD films.",
      "It works by REPETITION, not by novelty.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).toThrow(
        /shouts a word this scan cannot tell from one/
      );
    }
  });

  it("ONE WARRANT OVER EVERY ENTRY — the ambiguous months AND the ambiguous demonyms", () => {
    // ROUND 2 RAN THE WARRANT OVER HALF THE LIST (learning gate, 2026-09-02).
    // It removed `April`, `June` and `August` beside `May` because "those
    // three are common given names in English exactly as `May` is" — and left
    // the language/demonym half, which is full of ordinary English surnames,
    // and left `March` and `July` among the "unambiguous" months. Every one of
    // these was MEASURED STORED through the write path under that list. This
    // is the class fix written one instance wide, INSIDE the fix made for that
    // lesson, which is why the population here is the WHOLE removed set.
    for (const word of [
      "May",
      "April",
      "June",
      "August",
      "March",
      "July",
      "French",
      "German",
      "English",
      "Dutch",
      "Welsh",
      "Irish",
    ]) {
      expect(
        matchesMechanismRule(attributed, `Cut from ${word} footage.`),
        `"from ${word}" is exempt — it is a personal name in English exactly as "May" is`
      ).toBe(true);
    }
    // ...and the unambiguous entries are still exempt, so this NARROWED the
    // list rather than deleting it. A rule that refuses "from September" or
    // "from Japanese" buys nothing at all.
    for (const word of [
      "January",
      "February",
      "September",
      "October",
      "November",
      "December",
      "Monday",
      "Sunday",
      "Japanese",
      "Chinese",
      "Spanish",
      "Portuguese",
      "Instagram",
      "TikTok",
    ]) {
      expect(
        matchesMechanismRule(attributed, `Cut from ${word} footage.`),
        `"from ${word}" now refuses — the exemption was deleted, not narrowed`
      ).toBe(false);
    }
  });

  it("...and the residue the warrant does NOT remove is asserted, not just described", () => {
    // THE WARRANT IS "is it also a personal name", NOT "does the sentence
    // read oddly". The review that raised this listed nine measured-stored
    // sentences; three of them name no person, so exempting them leaks
    // nothing and removing them would cost "borrowed from Greek theatre".
    // `NOT_A_PERSON`'s docblock says these stay STORABLE, and a claim about
    // behaviour is asserted here or it is not a claim.
    for (const text of [
      "credited to Scottish.",
      "created by Latin.",
      "from Greek came the reveal.",
      "Borrowed from Greek theatre, the chorus states the claim.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
    // ...and the sayable form of the REMOVED ones costs an article, which is
    // the whole reason the removal is cheap: the rule only reads the token
    // IMMEDIATELY after the trigger.
    for (const text of [
      "Borrow a concept from a French tradition and apply it.",
      "Borrowed from the English music hall.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
  });

  it("BLOCK: a NON-ASCII personal name refuses — the capture is Unicode, not ASCII", () => {
    // EVERY ONE MEASURED STORED (learning gate, 2026-09-02), read back out of
    // the row on the live `createPrivateFramework` path, then APPROVED and
    // returned by `eligibleFrameworks()` → `promptFramework` → the vendor. The
    // rule's capture was `[A-Z][a-z]+` / `[A-Z]{2,}`, so it could not see a
    // letter outside ASCII at all.
    //
    // AND THE ASCII BEHAVIOUR INSIDE THE CLASS WAS ARBITRARY, which is the
    // part no writer could learn: `created by Björk` and `from Zoë` REFUSED
    // (the diacritic falls after two ASCII letters, so `\b` closed the token
    // early and the ASCII prefix matched) while `Müller` — diacritic in
    // position two — STORED. Both directions are here so the fix cannot be
    // read as having only closed the refusing half.
    for (const text of [
      "Credited to Müller, who ran it first.",
      "From Élodie came the double confession.",
      "Credited to Анна.",
      "Müller's version of this loop is one beat shorter.",
      "created by Björk, refined since.",
      "The turn comes from Zoë in the second beat.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable — a personal name reaches library-bound, prompt-bound content`
      ).toThrow(/was not stored/);
    }
  });

  it("...and a PARTICLE or an INITIAL between the trigger and the name refuses", () => {
    // The other half of the same measurement: the name is not always the
    // token immediately after the trigger. A closed linguistic class
    // (nobiliary particles and single-letter initials) sits OUTSIDE the
    // capture, so `exempt` still sees the head noun.
    for (const text of [
      "Invented by Ó Briain.",
      "Credited to J. Smith for the shape.",
      "The open was credited to van Gogh for the shape.",
      "The open was credited to de Souza for the shape.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable`
      ).toThrow(/was not stored/);
    }
    // ...and an ALL-CAPS surname with a capital or an apostrophe INSIDE it,
    // which the ASCII alternation's `[A-Z]{2,}` branch could not reach.
    for (const text of [
      "The open was credited to O'BRIEN for the shape.",
      "The open was credited to McDONALD for the shape.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable`
      ).toThrow(/was not stored/);
    }
    // THE STATED RESIDUE, ASSERTED IN THE DIRECTION IT WAS MEASURED: a name
    // behind a particle the closed set does not name still stores. That is
    // inside the "arbitrary personal name in ordinary prose" bullet, not a
    // separate promise, and writing it as a passing assertion is what stops
    // the residue drifting into a claim of completeness.
    expect(() =>
      assertMechanismLevel(
        clean({ whyItConverts: "The open was credited to bint Ahmed for the shape." })
      )
    ).not.toThrow();
  });

  it("WHAT THE UNICODE WIDENING COSTS: one EXISTING class, applied evenly", () => {
    // A Title-cased non-person proper noun after a trigger has ALWAYS refused
    // — that class is named in `MECHANISM_CONTENT_RULES`' residue ("a city, a
    // brand, a book"). These two refused before the widening; the third is
    // the same class in a non-ASCII spelling and refuses after it. The point
    // of asserting all three together is that the widening did not create a
    // cost class, it stopped the existing one at the ASCII boundary — which
    // is exactly the arbitrariness a writer could not learn.
    for (const text of [
      "A shape lifted from Kabuki still needs a personal turn.",
      "Borrowed from Zoetrope, the loop reads as one move.",
      "A structure borrowed from Kishōtenketsu, four beats and a turn.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        text
      ).toThrow(/was not stored/);
    }
    // ...and the sayable forms, so the cost really is one article: the rule
    // only reads the token IMMEDIATELY after the trigger, and a lower-case
    // borrowing never matched at all.
    for (const text of [
      "A structure borrowed from the Kishōtenketsu form, four beats and a turn.",
      "A shape lifted from cinéma vérité still needs a personal turn.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
  });

  it("the POSSESSIVE noun list is WIDER, and its remaining limit is asserted", () => {
    // MEASURED STORED against a SIX-word list while `Sarah's version` refused
    // (learning gate, 2026-09-02) — so the rule's behaviour inside its own
    // class was arbitrary and the residue named no such limit.
    for (const text of [
      "Sarah's framework is one beat shorter.",
      "Sarah's hook opens cold.",
      "Sarah's method is one beat shorter.",
      "Sarah's script opens cold.",
      "Sarah's edit opens cold.",
      "Sarah's structure opens cold.",
      "Sarah's approach opens cold.",
      "Sarah's technique opens cold.",
      "Sarah's opener opens cold.",
      "Sarah's format opens cold.",
      "Sarah's take opens cold.",
      "Sarah's video opens cold.",
      "Sarah's version is one beat shorter.",
      "Sarah's reel is one beat shorter.",
    ]) {
      expect(
        () => assertMechanismLevel(clean({ whyItConverts: text })),
        `"${text}" is storable`
      ).toThrow(/was not stored/);
    }
    // THE LIMIT, ASSERTED RATHER THAN DESCRIBED. The list is finite, so an
    // unlisted noun still stores. Removing the noun gate entirely was
    // MEASURED and rejected — see the next case for what it costs.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "Sarah's timing is one beat shorter." }))
    ).not.toThrow();
  });

  it("...and the PRICE of the noun gate is asserted too: a FRAMEWORK-name possessive refuses", () => {
    // THE COST OF THE LINE ABOVE, measured, so the residue cannot drift into
    // claiming the widening was free. A Title-cased framework name is
    // lexically identical to a surname — the same SARAH/ASMR trade — and this
    // one fails toward refusal, which the writer fixes by reordering.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "The Reversal's hook opens cold." }))
    ).toThrow(/was not stored/);
    // ...and the sayable form of the same sentence.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "The hook of The Reversal opens cold." }))
    ).not.toThrow();
    // WHY THE NOUN GATE WAS KEPT, as a run rather than an argument: these four
    // are what dropping it costs. They are ACCEPTED today; if a later round
    // removes the noun list, every one of them refuses with a `detail` telling
    // the writer they credited a person.
    for (const text of [
      "It's the turn that lands, not the claim.",
      "That's the whole move.",
      "Here's the shape in one line.",
      "The Reversal's second beat lands late.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).not.toThrow();
    }
  });

  it("the possessive noun list in `caseFold` and in `pattern` is ONE SET, not two copies", () => {
    // TWO COPIES OF ONE VOCABULARY IS HOW THE SHOUTED-POSSESSIVE HOLE OPENED.
    // The fold must lowercase exactly the nouns the pattern matches: a noun in
    // `pattern` but not in `caseFold` never refuses when SHOUTED
    // ("VIVIAN'S HOOK"), and a noun in `caseFold` but not in `pattern` folds
    // text nothing reads. Derived from the two sources, never from a
    // hand-written list.
    const nouns = (re: RegExp): string[] => {
      const m = /\['’\]s\\s\+\(\?:([a-z|]+)\)/.exec(re.source);
      expect(m, `the possessive noun alternation is unreadable in ${re.source}`).not.toBeNull();
      return (m as RegExpExecArray)[1].split("|").sort();
    };
    const fromFold = nouns(attributed.caseFold as RegExp);
    const fromPattern = nouns(attributed.pattern);
    // NON-VACUITY: a broken extraction would make two empty lists "equal".
    expect(fromFold.length, "the fold's noun list did not parse").toBeGreaterThan(20);
    expect(fromPattern, "the fold and the pattern disagree about the noun list").toEqual(
      fromFold
    );
    // ...and the set is really the one the rule uses: every noun in it refuses
    // after a name, shouted and unshouted alike.
    for (const noun of fromPattern) {
      expect(
        matchesMechanismRule(attributed, `Sarah's ${noun} is the thing.`),
        `"Sarah's ${noun}" is storable — the pattern's list and the fold's have drifted`
      ).toBe(true);
      expect(
        matchesMechanismRule(attributed, `SARAH'S ${noun.toUpperCase()} IS THE THING.`),
        `shouted "SARAH'S ${noun.toUpperCase()}" is storable — the fold does not cover this noun`
      ).toBe(true);
    }
  });

  it("a refusal RECORDS WHICH RULE fired, so a revisit trigger can name a real event", () => {
    // THREE REVISIT TRIGGERS NAMED AN EVENT NOTHING COULD OBSERVE (learning
    // gate, 2026-09-02): "the first framework refused by `claim:viral`", "the
    // first refused for an unlisted acronym". `FrameworkContentError` carried
    // `field` and `detail` only — so the rule that fired was not merely
    // uncounted, it was UNRECORDED, and no counter added later could have
    // answered them. The triggers are rewritten to name commits; this is the
    // field a counter would need, and it is an ID so it can never carry
    // creator prose.
    const thrown = (text: string): FrameworkContentError => {
      try {
        assertMechanismLevel(clean({ whyItConverts: text }));
      } catch (error) {
        return error as FrameworkContentError;
      }
      throw new Error(`"${text}" was accepted`);
    };
    expect(thrown("Invented by Marcus, refined since.").ruleId).toBe("attributed_person");
    expect(thrown("The viral phase of this shape has passed.").ruleId).toBe("claim:viral");
    expect(thrown("It added 200 followers in a day.").ruleId).toBe("metric_noun");
    // ...and the refusals that come from NO rule carry `null` rather than a
    // borrowed id.
    expect(
      thrown("Invented by Marcus, refined since.").ruleId,
      "every rule id is a constant in this repo, never a captured value"
    ).not.toContain("Marcus");
  });
});

describe("a multiplier is a claim only when a PERFORMANCE is beside it", () => {
  // THE SAME OVER-REACH, RE-CREATED THREE RULES UP BY THE EDIT THAT WAS
  // CORRECTING IT (learning gate, 2026-09-02). `metric_multiplier`'s new noun
  // requirement listed `number(s)|baseline|average`, which are not
  // performances, so FIVE of six plausible craft sentences were MEASURED
  // refused as "states a performance multiple" with no performance in them —
  // and `metric_multiplier_words` carried the identical list, so the sibling
  // was open too and is fixed here rather than in the next round.
  const CRAFT = [
    "Double the number of beats in the middle.",
    "Triple the number of cuts at the turn.",
    "Double the baseline shot count for the B-roll.",
    "Double down on the average shot length.",
    "Double the comments you address on camera.",
    "Run it at twice the number of cuts.",
    "Triple the average distance between cuts.",
    "Halve the average shot length and double the number of beats.",
    // The four round-1 sentences, kept so this fix cannot un-fix that one.
    "Double the confession: admit the flaw, then admit the flaw behind it.",
    "The cut lands on a double-take.",
    "Escalate by tripling the stakes.",
    "Run it at twice the length.",
  ];

  it.each(CRAFT)("an honest craft sentence is stored: %s", (text) => {
    expect(() => assertMechanismLevel(clean({ whyItConverts: text }))).not.toThrow();
  });

  // BOTH DIRECTIONS, because a fix measured in one direction only is how the
  // over-reach got here: dropping the three nouns outright would have made
  // "it more than doubled her usual numbers" storable again, which is the
  // claim the previous round closed.
  const CLAIMS = [
    "it more than doubled her usual numbers",
    "It more than doubled her usual numbers.",
    "saves doubled on the second run",
    "Follows doubled in a week.",
    "It doubled the reach of the original.",
    "It doubled the comments on the second run.",
    "It tripled her views.",
    "Double your baseline every time.",
    "twice as many saves",
    "ten times the reach",
    "half again as many saves",
    "twice her usual numbers",
  ];

  it.each(CLAIMS)("a performance multiple still refuses: %s", (text) => {
    expect(() => assertMechanismLevel(clean({ whyItConverts: text }))).toThrow(
      /was not stored/
    );
  });
});

describe("`metric_unit` names what it knows, not a claim the writer made", () => {
  it("a RESOLUTION and a FRAME PERCENTAGE refuse — with the hedged reason", () => {
    // NOT A DEFECT OF THIS PASS and not left unnamed either (compliance gate,
    // 2026-09-02, NOTE). The rule's residue block claimed to name every
    // MEASURED over-reach class and named neither resolutions nor frame
    // percentages, both of which refuse on the live write path. The pattern is
    // KEPT — `%` is the ordinary spelling of a conversion rate and `4k` of a
    // follower count, and neither can be carved out without a list of
    // counterexamples wearing the word class — so the `detail` is hedged
    // exactly as `attributed_person`'s and the three bare nouns' are, and the
    // class is named in the residue. Asserted rather than left in a comment.
    const rule = MECHANISM_CONTENT_RULES.find((r) => r.id === "metric_unit");
    expect(rule, "metric_unit was renamed").toBeDefined();
    expect(rule?.detail).toMatch(/reads as a metric/i);
    expect(
      rule?.detail,
      "the detail asserts the creator stated a metric, which is false about a 9:16 crop"
    ).not.toMatch(/^(states|claims) /);
    for (const text of [
      "Shoot 4k footage so you can crop in post.",
      "Cut the 4K master down to a 9:16 crop.",
      "Leave 20% of the frame empty.",
    ]) {
      expect(() => assertMechanismLevel(clean({ whyItConverts: text })), text).toThrow(
        /reads as a metric/
      );
    }
  });

  it("every stated cost is asserted, so the residue cannot be aspirational", () => {
    // A COMMENT CLAIMING A PROPERTY IS NOT THE PROPERTY (CLAUDE.md
    // 2026-07-30). `MECHANISM_CONTENT_RULES`' residue now names three costs
    // this pass knowingly accepts; each one is a sentence whose behaviour a
    // future edit could change without noticing, so each is driven here. If
    // one of these flips, the residue paragraph has gone stale and this case
    // says which line.

    // COST 1 — an IMPERATIVE multiplier over a bare metric noun is ACCEPTED,
    // which is a HOLE and not an over-reach. `Double the reach of the
    // original.` is promise-shaped and storable, because the only lexical
    // difference from `Double the comments you address on camera.` is what
    // comes AFTER the noun, and no pattern here can read that. Closing it
    // re-refuses the craft sentence this pass was fixing.
    //
    // THIS ASSERTION IS WHY THE CASE EXISTS. The residue paragraph first
    // recorded this cost in the OTHER DIRECTION — "still refused" — which is
    // the same false-description defect this whole pass is about, written by
    // the pass correcting it. It was caught by running it, not by reading it.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "Double the reach of the original." }))
    ).not.toThrow();
    // ...and the inflected twin, which IS a claim about how a piece did, still
    // refuses — so the hole is the imperative and nothing wider.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "It doubled the reach of the original." }))
    ).toThrow(/states a performance multiple/);

    // COST 2 — a SHOUTED trigger followed by ordinary prose refuses, and the
    // refusal says why rather than accusing the writer of naming a person.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "CUT IT FROM THE TOP." }))
    ).toThrow(/shouts a word this scan cannot tell from one/);

    // COST 3 WAS A HOLE AND IS NOW CLOSED, so this assertion is INVERTED
    // rather than deleted (coordinator escalation, 2026-09-02). The residue
    // used to name `credited to SARAH` — lower-case trigger, shouted name —
    // as an accepted residual, on the reasoning that closing it would refuse
    // `lifted from ASMR`. Naming the non-people closes it instead, and the
    // acronym still passes; both are driven above. Kept here so the residue
    // paragraph and this case cannot disagree about which costs are real.
    expect(() =>
      assertMechanismLevel(clean({ whyItConverts: "credited to SARAH, who ran it first." }))
    ).toThrow(/was not stored/);
  });
});

describe("the four classes the scan used to accept outright", () => {
  // MEASURED ACCEPTED before this pass, each with the docblock claiming the
  // metric rules covered "every spelling this corpus actually produced". An
  // email address and a phone number are structurally detectable, so their
  // absence was a GAP rather than a stated limit.
  const PLANTS: [string, string][] = [
    ["word-form quantity", "it did four hundred thousand views and nine hundred follows"],
    ["multiplier comparative", "it more than doubled her usual numbers"],
    ["email address", "questions to sarah.mitchell@mailbox.example"],
    ["phone number", "text 07700 900123 for the template"],
  ];

  it.each(PLANTS)("%s is refused", (_label, text) => {
    expect(() => assertMechanismLevel(clean({ whyItConverts: text }))).toThrow(
      /was not stored/
    );
  });

  it("...and a POPULATION SIZE is still sayable, which is what makes an observation honest", () => {
    // The discriminator `metric_word_quantity` turns on. Refusing this would
    // make the rewritten seed unstorable and would push its observations back
    // towards the uncheckable comparatives this pass removed.
    expect(() =>
      assertMechanismLevel(
        clean({
          evidenceEntries: [
            {
              kind: "internal_autopsy",
              ref: "corpus-batch-0",
              observation:
                "Two pieces in the corpus drew saves and almost no follows; three series pilots named the next episode in the last seconds.",
            },
            {
              kind: "internal_autopsy",
              ref: "corpus-batch-1",
              observation: "Hold the first 2 seconds and give it 3 beats.",
            },
          ],
        })
      )
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

/**
 * RANKING MARKERS — the class the CANON cannot see, on the one text source
 * this repo controls end to end.
 *
 * WHY THIS EXISTS (learning gate, 2026-09-02). `MECHANISM_CONTENT_RULES`'
 * residue names "a comparative with no vocabulary at all" as NOT enforced, and
 * the round that wrote that sentence also wrote that this file "now runs over
 * this file's own seed" — which reads as covered and was not. What runs over
 * the seed is the CANON, a vocabulary about how content will DO; a ranking
 * phrased in ordinary English matches none of it. Five such sentences were
 * live in the seed for a whole review round: "the strongest follow mechanism
 * in the corpus", "led the corpus on saves and trailed it on follows", "come
 * apart here more sharply than anywhere else in the corpus", "well over the
 * usual length", "saved heavily". Each renders verbatim on `/studio/frameworks`
 * and `whyItConverts` additionally rides into EVERY generation's prompt
 * (`promptFramework` in `packages/credits/src/generate.ts` puts it in the
 * summary), so a ranking nobody can check is not merely displayed — it is
 * given to a model as context.
 *
 * WHAT IT IS AND IS NOT. It is a VOCABULARY, so it has a vocabulary's limit:
 * a ranking written in words nobody listed still passes, and that limit is
 * stated in `MECHANISM_CONTENT_RULES`' residue rather than papered over. What
 * it buys is that the five shapes this seed actually produced cannot come
 * back, and that a curator adding a sixth is told what to write instead.
 *
 * IT RUNS ON THE SEED ONLY, DELIBERATELY, and is not a write-time rule. The
 * seed is checked-in copy that a person reviews in a diff; a creator's private
 * framework is their own prose, and refusing "the best version of this opens
 * cold" would be exactly the over-reach the three bare metric nouns are
 * already recorded for. The same seed/creator line `FORBIDDEN_CLAIMS` draws.
 */
const RANKING_MARKERS: readonly ForbiddenClaim[] = [
  ["superlative", /\b(?:strongest|weakest|widest|highest|lowest|greatest|biggest|largest|best|worst)\b/],
  ["ranked the corpus", /\b(?:led|leads|topped|tops|trailed|trails|outdrew|outdraws)\s+(?:the\s+)?(?:corpus|batch|field|rest|others)\b/],
  // `almost no|hardly any|next to no` joined 2026-09-02 (learning gate). The
  // seed said "drew saves and discussion and ALMOST NO follows" — the same
  // magnitude shape as the "saved heavily" this marker was written to remove,
  // measured at ZERO hits against every alternative here. A near-zero stated
  // over a population nobody can open is a magnitude claim like any other.
  ["magnitude adverb", /\b(?:heavily|hugely|massively|barely|hardly|instantly|instant)\b|\bfar (?:more|fewer|larger|better|wider)\b|\bwell (?:over|above|beyond)\b|\bby a wide margin\b|\balmost no\b|\bhardly any\b|\bnext to no\b/],
  ["unanchored comparative", /\b(?:more|fewer|better|worse|stronger|higher|lower|sharper|faster)\b[^.]{0,20}?\bthan\s+(?:the\s+)?(?:others|rest|anywhere|usual|average|baseline|any\b)/],
  ["above a baseline", /\b(?:above|below|over)\s+(?:the\s+|their\s+|his\s+|her\s+)?(?:creator's own\s+)?(?:baseline|average|usual)\b/],
  // AN EXACT ZERO OVER AN UNOPENABLE POPULATION (learning gate, 2026-09-02).
  // The seed said one piece "drew no follows at all" and two montage pieces
  // drew "almost no follows" — a measured zero and a measured near-zero, over
  // a corpus a reader cannot open, with no word on whether follows were
  // recorded for that batch at all. ABSENT IS NEVER ZERO, and F6's sibling
  // observation already does this right ("How many of each was not recorded,
  // so this is the direction to expect and not a rate"). The lookahead is the
  // whole rule: "no follows RECORDED against it" states the recording status
  // and is what an honest version of the same sentence looks like.
  [
    "unrecorded zero",
    /\b(?:no|zero)\s+(?:follow|save|share|comment|view|like|subscriber|impression)s?\b(?!\s+(?:recorded|were recorded))|\bnone at all\b/,
  ],
];

/**
 * SPECIMENS PER MARKER — A LIST, NOT ONE STRING (learning gate, 2026-09-02).
 *
 * One specimen per marker proves the marker is not scanning NOTHING; it does
 * not prove that each ALTERNATIVE inside the marker is scanning anything. That
 * is the same hole `RULE_CASE_SPECIMENS` had, one file over and one level
 * down: the "magnitude adverb" marker held four top-level alternations and one
 * witness, so `almost no` could be added to the pattern with a typo and the
 * scan would stay green.
 */
const RANKING_SPECIMENS: Readonly<Record<string, readonly string[]>> = {
  superlative: [
    "the strongest follow mechanism in the corpus",
    "the weakest of the shapes on saves",
    "the biggest follow driver in the batch",
    "the best version of this open",
    "the worst shape for saves",
  ],
  "ranked the corpus": [
    "tutorial-shaped pieces led the corpus on saves",
    "this shape tops the batch on follows",
    "it trailed the rest on follows",
    "the personal turn outdrew the others",
  ],
  "magnitude adverb": [
    "two pieces on this shape saved heavily",
    "it converts hugely on this audience",
    "the shape barely moved anything",
    "it lands instantly with a cold audience",
    "it drew far more saves on this shape",
    "the piece runs well over the usual length",
    "the personal turn wins by a wide margin",
    "two montage pieces drew almost no follows",
    "the montage shape drew hardly any follows",
    "it drew next to no follows",
  ],
  "unanchored comparative": [
    "reach and follows come apart here more sharply than anywhere else",
    "it converted better than the others",
    "it drew fewer follows than usual",
    "the shape performed stronger than the baseline",
  ],
  "above a baseline": [
    "both converted above the creator's own baseline",
    "it landed below their average",
    "it ran over the usual",
  ],
  "unrecorded zero": [
    "the one without a first-person application drew no follows at all",
    "two montage pieces drew no follows",
    "it collected zero saves",
    "the shape drew none at all",
  ],
};

describe("the seed states MECHANISMS, never rankings the reader cannot check", () => {
  const scanRankings = (library: readonly FrameworkContent[]) => {
    const hits: CanonHit[] = [];
    for (const content of library) {
      for (const [field, text] of frameworkStrings(content)) {
        for (const [label, pattern] of RANKING_MARKERS) {
          if (pattern.test(text.toLowerCase())) {
            hits.push({ framework: content.name, field, label, text });
          }
        }
      }
    }
    return hits;
  };

  it("the scan is NON-VACUOUS: every marker sees EVERY one of its planted sentences", () => {
    // PER MARKER **AND PER ALTERNATIVE**. A specimen caught by some other
    // pattern would leave a typo in this one invisible — the failure
    // `/onboarding`'s scan already shipped — and one specimen for a marker
    // holding four alternations proves only that ONE of the four scans
    // anything, which is how `almost no` could have been added dead.
    for (const [label] of RANKING_MARKERS) {
      const specimens = RANKING_SPECIMENS[label];
      expect(specimens, `${label} has no specimens`).toBeDefined();
      expect(specimens.length, `${label} has one specimen for many shapes`).toBeGreaterThan(
        2
      );
      for (const specimen of specimens) {
        const hits = scanRankings([clean({ whyItConverts: specimen })]);
        expect(
          hits.map((h) => h.label),
          `the plant "${specimen}" for "${label}" was not seen — that alternative is scanning nothing`
        ).toContain(label);
      }
    }
  });

  it("...and the CLEAN baseline is accepted", () => {
    expect(scanRankings([clean()])).toEqual([]);
  });

  it("the REAL seed carries no ranking marker", () => {
    expect(SHARED_FRAMEWORK_SEED.length, "the seed was not read").toBe(9);
    expect(
      scanRankings(SHARED_FRAMEWORK_SEED).map(
        (h) => `${h.framework} / ${h.field} [${h.label}]: ${h.text}`
      ),
      "the seeded library ranks something the reader cannot check — state the MECHANISM, and the POPULATION where a count is what makes the observation honest (R-79, REQ-D04). If the count is not known, say so instead of implying one."
    ).toEqual([]);
  });

  it("the two cases are INDEPENDENT: naming the population does not license a ranking", () => {
    // WHAT THE DOCBLOCKS SAID AND WHAT THIS SCAN DOES (learning gate,
    // 2026-09-02). `MECHANISM_CONTENT_RULES`' residue and `decisions.md` R-79
    // both described this scan as "requiring a ranking or superlative marker to
    // be accompanied by the population it is over" — one conditional case. It
    // is two unconditional ones: the seed carries NO marker at all, and four
    // named population phrases are separately asserted PRESENT. A curator who
    // followed the old sentence would write this and go red, which is a
    // description failing in the PERMISSIVE direction.
    const withPopulation = "The strongest follow mechanism of the three pieces in corpus-batch-0.";
    expect(
      scanRankings([clean({ whyItConverts: withPopulation })]).map((h) => h.label),
      "a ranking that names its population passes — then the two cases really were one"
    ).toContain("superlative");
    // ...and the population case really is separate: a framework with no
    // ranking marker and no population phrase passes THIS scan, and is caught
    // (if at all) only by the presence case below.
    expect(scanRankings([clean()])).toEqual([]);
  });

  it("...and the seed still states its populations, so the fix was not deletion", () => {
    // The failure mode of the case above is a seed rewritten into vagueness:
    // every ranking removed and nothing put in its place. These are the counts
    // the observations are built on, asserted present.
    const all = SHARED_FRAMEWORK_SEED.flatMap(frameworkStrings).map(([, t]) => t);
    const pinned = [
      "Two pieces in the corpus",
      "Three series pilots in the corpus",
      "One personal-identity series in the corpus",
      "One piece in the corpus",
      // THE RECORDING STATUS, which is the other half of an honest count
      // (learning gate, 2026-09-02). The `unrecorded zero` marker above makes
      // "drew no follows at all" red; these phrases are what the honest
      // version says instead, and pinning them is what stops the fix being a
      // deletion of the observation. F6's own wording is the model.
      "Whether that is a zero or an absence was not recorded",
      "How many of each was not recorded, so this is the direction to expect and not a rate",
      // ...and a direction taken from ONE observation says so, rather than
      // stating a categorical rule the way the caveat at F2 used to.
      "That is one case, so treat it as the direction to expect",
    ];
    // THE COUNT IS BOUND, because two docblocks state it and one of them was
    // WRONG (learning-gate sweep, 2026-09-02): `MECHANISM_CONTENT_RULES`'
    // residue said "four named population phrases" while this list held
    // seven — the recording-status half was added beside it and the sentence
    // describing it was not. An unbound count in a comment is the class this
    // file has now corrected four times.
    expect(
      pinned.length,
      "the residue in `MECHANISM_CONTENT_RULES` and the seed docblock both say SEVEN — say the new number in both, then change this"
    ).toBe(7);
    for (const phrase of pinned) {
      expect(
        all.some((t) => t.includes(phrase)),
        `"${phrase}" is gone from the seed — an observation lost its population`
      ).toBe(true);
    }
  });
});
