// Slice 3, R1–R4: the prompt is assertable without a vendor, and the reply
// parser fails closed.
//
// Every test here runs with no network and no database, which is the property
// `assemble.ts` exists to have — and this file imports NOTHING outside its own
// package, so `@respin/llm` needs no `@respin/db` dependency even in dev. The
// assertion that the duplicated CHECK marker still agrees with the database's
// lives in `packages/credits/tests/check-marker.test.ts` for that reason.
import { describe, expect, it } from "vitest";

import {
  assembleVoicePrompt,
  AssemblyError,
  CHECK,
  locateQuote,
  NotEnoughPostsError,
  parseVoiceReply,
  type ClaimSpec,
  type OwnPost,
} from "../src/assemble";

// Mirrors the real `voice` schema's shape: two single claims and two lists.
// The lists are the reason this module takes FIELDS rather than pointers —
// `/signatureMoves/2` does not exist until the instance has three entries.
const FIELDS: ClaimSpec[] = [
  { key: "register", kind: "single", guidance: "how formal they are" },
  { key: "sentenceRhythm", kind: "single", guidance: "how sentences are paced" },
  { key: "signatureMoves", kind: "list", guidance: "recurring moves", max: 3 },
  { key: "avoid", kind: "list", guidance: "what they never do", max: 3 },
];

const POSTS: OwnPost[] = [
  { id: "a1", content: "I ship small things daily. No grand plans, just reps." },
  { id: "b2", content: "Most advice is noise. Here is what actually moved me." },
];

const cite = (value: string, inputId: string, quote: string) => ({
  value,
  inputId,
  quote,
});
const placeholder = () => ({ value: CHECK, inputId: null, quote: null });

/** A complete, well-formed reply. Individual tests perturb one field of it. */
function goodReply(over: Record<string, unknown[]> = {}): string {
  const base: Record<string, unknown[]> = {
    register: [cite("plain and direct", "a1", "No grand plans")],
    sentenceRhythm: [cite("short declaratives", "b2", "Most advice is noise.")],
    signatureMoves: [
      cite("states a number early", "a1", "I ship small things daily."),
    ],
    avoid: [cite("never hedges", "b2", "Here is what actually moved me.")],
  };
  const merged = { ...base, ...over };
  return JSON.stringify({
    fields: Object.entries(merged).map(([key, values]) => ({ key, values })),
  });
}

describe("assembleVoicePrompt (R1, R4, R6)", () => {
  it("is PURE — the same inputs give byte-identical prompts", () => {
    const args = { posts: POSTS, fields: FIELDS, minPosts: 2 };
    expect(assembleVoicePrompt(args)).toEqual(assembleVoicePrompt(args));
  });

  it("puts every supplied post and every requested field in the prompt", () => {
    const { prompt } = assembleVoicePrompt({
      posts: POSTS,
      fields: FIELDS,
      minPosts: 2,
    });
    for (const p of POSTS) {
      expect(prompt).toContain(p.content);
      expect(prompt).toContain(`id="${p.id}"`);
    }
    for (const f of FIELDS) {
      expect(prompt).toContain(f.key);
      expect(prompt).toContain(f.guidance);
    }
  });

  it("states a LIST field's cap in the prompt, so the model can respect it", () => {
    const { prompt } = assembleVoicePrompt({
      posts: POSTS,
      fields: FIELDS,
      minPosts: 2,
    });
    expect(prompt).toContain("at most 3");
  });

  it("R6: refuses BELOW the minimum, and the refusal names both numbers", () => {
    try {
      assembleVoicePrompt({ posts: [POSTS[0]], fields: FIELDS, minPosts: 3 });
      expect.unreachable("a one-post profile must not assemble a prompt");
    } catch (err) {
      expect(err).toBeInstanceOf(NotEnoughPostsError);
      expect((err as NotEnoughPostsError).have).toBe(1);
      expect((err as NotEnoughPostsError).need).toBe(3);
    }
  });

  it("R6 NON-VACUITY: exactly the minimum is enough", () => {
    expect(() =>
      assembleVoicePrompt({ posts: POSTS, fields: FIELDS, minPosts: 2 }),
    ).not.toThrow();
  });

  it("refuses a duplicate post id, which would make a citation ambiguous", () => {
    expect(() =>
      assembleVoicePrompt({
        posts: [POSTS[0], { id: "a1", content: "different words" }],
        fields: FIELDS,
        minPosts: 2,
      }),
    ).toThrow(AssemblyError);
  });

  it("refuses a duplicate field key", () => {
    expect(() =>
      assembleVoicePrompt({
        posts: POSTS,
        fields: [...FIELDS, FIELDS[0]],
        minPosts: 2,
      }),
    ).toThrow(AssemblyError);
  });

  it("refuses an empty field list rather than spending a call on nothing", () => {
    expect(() =>
      assembleVoicePrompt({ posts: POSTS, fields: [], minPosts: 2 }),
    ).toThrow(AssemblyError);
  });

  it("tells the model that an ungrounded field is the placeholder, not a guess", () => {
    const { system } = assembleVoicePrompt({
      posts: POSTS,
      fields: FIELDS,
      minPosts: 2,
    });
    expect(system).toContain(CHECK);
    expect(system).toContain("VERBATIM");
  });
});

describe("locateQuote — the offsets are OURS, never the model's (R3)", () => {
  it("returns the UTF-16 range, and the slice at that range is the quote", () => {
    const at = locateQuote(POSTS[0].content, "No grand plans");
    expect(at).not.toBeNull();
    expect(POSTS[0].content.slice(at!.startUtf16, at!.endUtf16)).toBe(
      "No grand plans",
    );
  });

  it("survives an emoji before the quote — the unit is UTF-16 code units", () => {
    const content = "🎬 I ship small things daily.";
    const at = locateQuote(content, "I ship small things daily.");
    expect(at).not.toBeNull();
    // The emoji is a surrogate pair, so the offset is 3, not 2.
    expect(at!.startUtf16).toBe(3);
    expect(content.slice(at!.startUtf16, at!.endUtf16)).toBe(
      "I ship small things daily.",
    );
  });

  it("matches a DECOMPOSED quote against COMPOSED stored content", () => {
    const content = "café notes"; // composed
    const at = locateQuote(content, "café"); // decomposed
    expect(at).not.toBeNull();
    expect(content.slice(at!.startUtf16, at!.endUtf16)).toBe("café");
  });

  it("returns null for text that is not there — the invented quote", () => {
    expect(locateQuote(POSTS[0].content, "words I never wrote")).toBeNull();
  });

  it("returns null for an empty quote rather than a zero-width range at 0", () => {
    expect(locateQuote(POSTS[0].content, "")).toBeNull();
  });
});

describe("parseVoiceReply — fail closed, and the failure is TOTAL (R2)", () => {
  const parse = (text: string) =>
    parseVoiceReply({ text, fields: FIELDS, posts: POSTS });

  it("parses a well-formed reply and COMPUTES the offsets", () => {
    const fields = parse(goodReply());
    expect(fields).toHaveLength(4);
    const reg = fields.find((f) => f.key === "register")!;
    const ev = reg.values[0].evidence!;
    expect(POSTS[0].content.slice(ev.startUtf16, ev.endUtf16)).toBe(
      "No grand plans",
    );
  });

  it("returns fields in the REQUESTED order, whatever order the reply used", () => {
    const reversed = JSON.stringify({
      fields: JSON.parse(goodReply()).fields.reverse(),
    });
    expect(parse(reversed).map((f) => f.key)).toEqual(FIELDS.map((f) => f.key));
  });

  it("accepts several values in a LIST field, each with its own citation", () => {
    const fields = parse(
      goodReply({
        signatureMoves: [
          cite("states a number early", "a1", "I ship small things daily."),
          cite("names the counterpoint", "b2", "Most advice is noise."),
        ],
      }),
    );
    const moves = fields.find((f) => f.key === "signatureMoves")!;
    expect(moves.values).toHaveLength(2);
    expect(moves.values.every((v) => v.evidence)).toBe(true);
  });

  it("accepts a placeholder with NO citation", () => {
    const fields = parse(goodReply({ avoid: [placeholder()] }));
    const avoid = fields.find((f) => f.key === "avoid")!;
    expect(avoid.values[0].value).toBe(CHECK);
    expect(avoid.values[0].evidence).toBeUndefined();
  });

  it("tolerates ONE code fence, because models emit them anyway", () => {
    expect(parse("```json\n" + goodReply() + "\n```")).toHaveLength(4);
  });

  // Every case below must THROW. A partially-filled document is the outcome
  // this parser exists to make impossible.
  const refusals: Array<[string, string]> = [
    ["not JSON at all", "I think their voice is quite casual!"],
    ["JSON that is not the reply shape", JSON.stringify({ voice: "casual" })],
    ["an empty field list", JSON.stringify({ fields: [] })],
    [
      "an EXTRA key on a value — the key space is closed",
      goodReply({
        register: [
          { ...cite("plain", "a1", "No grand plans"), confidence: 0.9 },
        ],
      }),
    ],
    [
      "an INVENTED quote",
      goodReply({ register: [cite("plain", "a1", "never written this")] }),
    ],
    [
      "a citation to a post that was not supplied",
      goodReply({ register: [cite("plain", "nope", "No grand plans")] }),
    ],
    [
      "a stated value with NO quote behind it",
      goodReply({ register: [{ value: "plain", inputId: null, quote: null }] }),
    ],
    [
      "a PLACEHOLDER carrying a citation (the G-10 shape)",
      goodReply({ register: [cite(CHECK, "a1", "No grand plans")] }),
    ],
    [
      "a SINGLE field given two values",
      goodReply({
        register: [
          cite("plain", "a1", "No grand plans"),
          cite("terse", "b2", "Most advice is noise."),
        ],
      }),
    ],
    [
      "a LIST field OVER its cap",
      goodReply({
        signatureMoves: [
          cite("one", "a1", "I ship"),
          cite("two", "a1", "small things"),
          cite("three", "b2", "Most advice"),
          cite("four", "b2", "is noise."),
        ],
      }),
    ],
    ["a field with NO values at all", goodReply({ avoid: [] })],
    [
      "a placeholder MIXED into a list",
      goodReply({
        signatureMoves: [
          cite("one", "a1", "I ship small things daily."),
          placeholder(),
        ],
      }),
    ],
    [
      "a field that was never requested",
      goodReply({ audience: [cite("founders", "a1", "No grand plans")] }),
    ],
  ];

  for (const [name, text] of refusals) {
    it(`REFUSES ${name}`, () => {
      expect(() => parse(text)).toThrow(AssemblyError);
    });
  }

  it("REFUSES a MISSING field, and the refusal NAMES it", () => {
    const partial = JSON.stringify({
      fields: JSON.parse(goodReply()).fields.filter(
        (f: { key: string }) => f.key !== "avoid",
      ),
    });
    try {
      parse(partial);
      expect.unreachable("a partial reply must throw");
    } catch (err) {
      expect((err as Error).message).toContain("avoid");
    }
  });

  it("REFUSES the same field twice", () => {
    const dup = JSON.parse(goodReply());
    dup.fields.push(dup.fields[0]);
    expect(() => parse(JSON.stringify(dup))).toThrow(AssemblyError);
  });

  it("NO POST TEXT leaks into a refusal message", () => {
    // The refusal that has the creator's words in hand is the invented quote.
    try {
      parse(goodReply({ register: [cite("plain", "a1", "never written")] }));
      expect.unreachable("an invented quote must throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(POSTS[0].content);
    }
  });
});
