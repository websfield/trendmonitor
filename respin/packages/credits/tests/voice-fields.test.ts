// `VOICE_FIELDS` is a hand-written list, and this file is what stops it drifting
// from the schema it describes.
//
// THE DEFECT IT EXISTS TO CATCH. `infer-voice.ts` cannot read guidance text out
// of a zod schema, so the fields the model is asked to fill are declared by
// hand. If someone widens `voiceContent` with a new `claim()` leaf and does not
// widen `VOICE_FIELDS`, the model is never asked about it — so the stored
// document has no value there, `enumerateClaimFields` still enumerates the
// position, the confirm screen cannot show it, and `activateBrainDoc` refuses
// forever with a message naming a field the creator was never offered. A brain
// that can never activate, from a two-line schema edit, with every other test
// green. That is the whole reason this file is here.
import { describe, expect, it } from "vitest";

import { BRAIN_CONTENT_SCHEMAS, CHECK, enumerateClaimFields } from "@respin/db";

import {
  buildVoiceDocument,
  isAllPlaceholders,
  VOICE_FIELDS,
} from "../src/infer-voice";
import type { AssembledField } from "@respin/llm";

/** A parsed reply filling every declared field with one grounded value. */
function filled(over: Partial<Record<string, AssembledField>> = {}) {
  const ev = (n: number) => ({
    inputId: "a1",
    quote: `q${n}`,
    startUtf16: n,
    endUtf16: n + 2,
  });
  const base = VOICE_FIELDS.map((f, i): AssembledField => ({
    key: f.key,
    kind: f.kind,
    values: [{ value: `v${i}`, evidence: ev(i) }],
  }));
  return base.map((f) => over[f.key] ?? f);
}

describe("VOICE_FIELDS is pinned to the voice schema", () => {
  it("names EXACTLY the schema's top-level claim-bearing keys", () => {
    // Derived from the schema, not restated: a document filled from
    // VOICE_FIELDS must enumerate to positions whose top-level key set is
    // exactly VOICE_FIELDS' key set. Restating the four names here would make
    // this test agree with itself rather than with the schema.
    const { content } = buildVoiceDocument(filled());
    const topLevel = new Set(
      enumerateClaimFields("voice", content).map((p) => p.split("/")[1]),
    );
    expect([...topLevel].sort()).toEqual(VOICE_FIELDS.map((f) => f.key).sort());
  });

  it("declares every claim-bearing key the schema has — the widening case", () => {
    // The direction the test above cannot see on its own: it builds content
    // FROM VOICE_FIELDS, so a schema key nobody declared is simply absent and
    // the enumeration never reaches it. This reads the SCHEMA's own shape.
    const shape = (
      BRAIN_CONTENT_SCHEMAS.voice as unknown as {
        def: { shape: Record<string, unknown> };
      }
    ).def.shape;
    // `provenance` is the schema's server-owned node and is never a claim, so
    // it is legitimately absent from VOICE_FIELDS.
    const claimKeys = Object.keys(shape).filter((k) => k !== "provenance");
    expect(claimKeys.sort()).toEqual(VOICE_FIELDS.map((f) => f.key).sort());
  });

  it("gives every field non-empty guidance — a key alone is not an instruction", () => {
    for (const f of VOICE_FIELDS) {
      expect(f.guidance.length).toBeGreaterThan(20);
    }
  });

  it("caps every LIST field, so the confirm screen stays finishable", () => {
    for (const f of VOICE_FIELDS.filter((f) => f.kind === "list")) {
      expect(f.max).toBeGreaterThan(0);
      expect(f.max).toBeLessThanOrEqual(5);
    }
  });
});

describe("buildVoiceDocument — the pointer convention", () => {
  it("builds /key for a single and /key/index for a list entry", () => {
    const fields = filled({
      signatureMoves: {
        key: "signatureMoves",
        kind: "list",
        values: [
          {
            value: "one",
            evidence: {
              inputId: "a1",
              quote: "q",
              startUtf16: 0,
              endUtf16: 1,
            },
          },
          {
            value: "two",
            evidence: {
              inputId: "a1",
              quote: "r",
              startUtf16: 2,
              endUtf16: 3,
            },
          },
        ],
      },
    });
    const { sourceEvidence } = buildVoiceDocument(fields);
    const pointers = sourceEvidence.map((e) => e.field);
    expect(pointers).toContain("/register");
    expect(pointers).toContain("/signatureMoves/0");
    expect(pointers).toContain("/signatureMoves/1");
  });

  it("EVERY evidence pointer is a position the enumerator also derives", () => {
    // The agreement `inferVoice` checks at runtime, asserted here cheaply. If
    // the convention above and `enumerateClaimFieldsOf` ever disagree, the
    // document writes and can never activate.
    const { content, sourceEvidence } = buildVoiceDocument(filled());
    const enumerated = enumerateClaimFields("voice", content);
    for (const e of sourceEvidence) {
      expect(enumerated).toContain(e.field);
    }
  });

  it("a placeholder contributes a POSITION but NO evidence", () => {
    const fields = filled({
      avoid: { key: "avoid", kind: "list", values: [{ value: CHECK }] },
    });
    const { content, sourceEvidence } = buildVoiceDocument(fields);
    // The position exists — so the creator is asked about it...
    expect(enumerateClaimFields("voice", content)).toContain("/avoid/0");
    // ...and nothing claims to be evidence for it.
    expect(sourceEvidence.map((e) => e.field)).not.toContain("/avoid/0");
  });

  it("a placeholder LIST is a one-entry list, never an EMPTY one", () => {
    // An empty array enumerates to ZERO positions, so the creator would never
    // be asked and activation would pass over the field vacuously. This is the
    // fail-open shape, and it is the reason the placeholder is kept as a value.
    const fields = filled({
      avoid: { key: "avoid", kind: "list", values: [{ value: CHECK }] },
    });
    const { content } = buildVoiceDocument(fields);
    expect((content.avoid as string[]).length).toBe(1);
    expect(enumerateClaimFields("voice", content)).toContain("/avoid/0");
  });

  it("isAllPlaceholders is true only when NOTHING is grounded", () => {
    expect(isAllPlaceholders(filled())).toBe(false);
    const none = VOICE_FIELDS.map((f): AssembledField => ({
      key: f.key,
      kind: f.kind,
      values: [{ value: CHECK }],
    }));
    expect(isAllPlaceholders(none)).toBe(true);
  });
});
