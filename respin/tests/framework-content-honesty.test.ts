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
  // The one CASE-SENSITIVE rule, so its specimen must carry a capital.
  attributed_person: "Invented by Marcus, refined since.",
  ...Object.fromEntries(
    PERFORMANCE_CLAIMS.map(([label]) => [`claim:${label}`, CLAIM_SPECIMENS[label]])
  ),
};

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
      if (rule.exempt) expect(rule.exempt.flags, `${rule.id} exempt`).not.toContain("g");
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

  it("...and CAPITALISED, which is how a sentence starts (measured storable)", () => {
    // THE WITNESS THIS AGREEMENT NEVER HAD (tenancy gate, 2026-09-02). Every
    // specimen in `CLAIM_SPECIMENS` is lowercase, so the loop above held at
    // PATTERN level while the APPLICATION level was open: `matchesMechanismRule`
    // tested the RAW value, the fourteen patterns carry no `i` flag and cannot
    // (the flags are pinned two cases up), and `claims.ts` lowercases before it
    // matches. NINE OF TEN sentence-initial claims were measured ACCEPTED and
    // storable — "Outperforms the standalone pieces every time.", "Views climb
    // when the loop is seamless.", "Best-performing hook shape in the
    // library.", "Proven to work for this audience." — while "it outperforms
    // your last post" was refused.
    //
    // SENTENCE-INITIAL AND SHOUTED, because those are two different failures of
    // the same missing normalisation and only one of them needs a capital in
    // the first position.
    for (const [label] of PERFORMANCE_CLAIMS) {
      const specimen = CLAIM_SPECIMENS[label];
      const initial = specimen[0].toUpperCase() + specimen.slice(1);
      for (const text of [initial, specimen.toUpperCase()]) {
        expect(
          () => assertMechanismLevel(clean({ whyItConverts: text })),
          `"${text}" is storable as framework content — the write-time scan sees ${label} in lower case only`
        ).toThrow(/was not stored/);
      }
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
  ["magnitude adverb", /\b(?:heavily|hugely|massively|barely|hardly|instantly|instant)\b|\bfar (?:more|fewer|larger|better|wider)\b|\bwell (?:over|above|beyond)\b|\bby a wide margin\b/],
  ["unanchored comparative", /\b(?:more|fewer|better|worse|stronger|higher|lower|sharper|faster)\b[^.]{0,20}?\bthan\s+(?:the\s+)?(?:others|rest|anywhere|usual|average|baseline|any\b)/],
  ["above a baseline", /\b(?:above|below|over)\s+(?:the\s+|their\s+|his\s+|her\s+)?(?:creator's own\s+)?(?:baseline|average|usual)\b/],
];

/** A specimen per marker, so a broken pattern is a red test and not a quiet zero. */
const RANKING_SPECIMENS: Readonly<Record<string, string>> = {
  superlative: "the strongest follow mechanism in the corpus",
  "ranked the corpus": "tutorial-shaped pieces led the corpus on saves",
  "magnitude adverb": "two pieces on this shape saved heavily",
  "unanchored comparative": "reach and follows come apart here more sharply than anywhere else",
  "above a baseline": "both converted above the creator's own baseline",
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

  it("the scan is NON-VACUOUS: every marker sees its own planted sentence", () => {
    // PER MARKER. A specimen caught by some other pattern would leave a typo in
    // this one invisible — the failure `/onboarding`'s scan already shipped.
    for (const [label] of RANKING_MARKERS) {
      const specimen = RANKING_SPECIMENS[label];
      expect(specimen, `${label} has no specimen`).toBeDefined();
      const hits = scanRankings([clean({ whyItConverts: specimen })]);
      expect(
        hits.map((h) => h.label),
        `the plant for "${label}" was not seen — this pattern is scanning nothing`
      ).toContain(label);
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

  it("...and the seed still states its populations, so the fix was not deletion", () => {
    // The failure mode of the case above is a seed rewritten into vagueness:
    // every ranking removed and nothing put in its place. These are the counts
    // the observations are built on, asserted present.
    const all = SHARED_FRAMEWORK_SEED.flatMap(frameworkStrings).map(([, t]) => t);
    for (const phrase of [
      "Two pieces in the corpus",
      "Three series pilots in the corpus",
      "One personal-identity series in the corpus",
      "One piece in the corpus",
    ]) {
      expect(
        all.some((t) => t.includes(phrase)),
        `"${phrase}" is gone from the seed — an observation lost its population`
      ).toBe(true);
    }
  });
});
