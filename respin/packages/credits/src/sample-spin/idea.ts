// Phase 10a plan C2: the visitor's idea is UNTRUSTED DATA, and this module is
// the only place it is parsed.
//
// The brand makes the boundary a type: `runPublicSampleSpin` accepts an
// `Untrusted<SampleSpinIdea>` and nothing else, so a caller cannot hand the
// orchestrator a raw request body, a header or a query string by mistake.
// What the parse refuses (fail closed): anything but a strict `{ idea }`
// object, an idea over the R-123 ceiling of 600 Unicode code points, an empty
// idea, control characters other than newline and tab, and a value that is
// not NFC-normalisable text. What it never does: change what the model is
// asked to do. The idea reaches the assembler as `GenerationContext.input`,
// under the assembler's own input label, exactly where a signed-in creator's
// idea goes; the system prompt is `GENERATION_SYSTEM` byte for byte and
// `sample-spin-injection.test.ts` proves an injected instruction cannot leave
// that field.

/** R-123: at most 600 Unicode code points. Counted in code points, not UTF-16 units. */
export const SAMPLE_SPIN_IDEA_MAX_CODE_POINTS = 600;

declare const untrusted: unique symbol;
/** A value that came from a visitor and has passed the strict parse, and nothing more. */
export type Untrusted<T> = T & { readonly [untrusted]: true };

export type SampleSpinIdea = Readonly<{ idea: string }>;

export class SampleSpinIdeaError extends Error {
  readonly code: "shape" | "empty" | "too_long" | "control_characters";
  constructor(code: SampleSpinIdeaError["code"]) {
    super(`sample spin idea refused: ${code}`);
    this.name = "SampleSpinIdeaError";
    this.code = code;
  }
}

// Everything below U+0020 except tab and newline, plus DEL and the C1 range,
// tested by code point so no control character has to appear in this source.
function hasControlCharacter(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a) || (cp >= 0x7f && cp <= 0x9f)) return true;
  }
  return false;
}

/** Exactly `{ idea: string }`: no extra keys, no other type. Hand-rolled — this package carries no zod dependency. */
function ideaShape(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "idea") return null;
  const idea = (raw as { idea: unknown }).idea;
  return typeof idea === "string" ? idea : null;
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Parse a request body. Throws `SampleSpinIdeaError`; never returns a partial value. */
export function parseSampleSpinIdea(raw: unknown): Untrusted<SampleSpinIdea> {
  const shaped = ideaShape(raw);
  if (shaped === null) throw new SampleSpinIdeaError("shape");
  const idea = shaped.normalize("NFC").replace(/\r\n?/g, "\n");
  if (hasControlCharacter(idea)) throw new SampleSpinIdeaError("control_characters");
  if (idea.trim().length === 0) throw new SampleSpinIdeaError("empty");
  if (codePointLength(idea) > SAMPLE_SPIN_IDEA_MAX_CODE_POINTS) throw new SampleSpinIdeaError("too_long");
  return Object.freeze({ idea: idea.trim() }) as Untrusted<SampleSpinIdea>;
}
