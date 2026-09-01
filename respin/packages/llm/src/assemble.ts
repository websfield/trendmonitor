// Prompt assembly and reply parsing for the onboarding voice inference (slice
// 3, R1/R2/R3/R4).
//
// PURE BY CONSTRUCTION: no database, no network, no clock. Everything here is a
// function from values to values, so the prompt this product sends and the way
// it reads a reply are both assertable without a vendor and without Postgres.
// That is the point of the module — slice 2a's card named an `assemble.ts` and
// 2a shipped without one, so the prompt lived inline in a server action where
// nothing could test it.
//
// WHY THIS FILE KNOWS NOTHING ABOUT BRAIN KINDS. `@respin/llm` does not depend
// on `@respin/db` — `packages/llm/package.json` names two dependencies and
// neither is it — so this module cannot import `BRAIN_CONTENT_SCHEMAS` or
// `enumerateClaimFields`. It is told which FIELDS to fill and returns values
// keyed by those field names; the caller turns them into a brain document and
// into RFC-6901 pointers, because the caller is the layer that may name a kind.
//
// AND THE CALLER IS NOT `app/**`. `tests/import-boundary.test.ts`'s R6 case
// denies `@respin/llm` from `app/**` and `lib/**` by default, so no server
// action may build a prompt. The composed operation lives in `@respin/credits`
// beside `runInference`, which is also where the money path already is.
//
// WHY FIELDS AND NOT POINTERS. The first draft of this module took a list of
// claim POSITIONS and asked the model to fill each one. That is wrong for the
// `voice` schema and the mistake is worth recording: `signatureMoves` and
// `avoid` are `z.array(claim(z.string()))`, and `enumerateClaimFieldsOf` walks
// schema and INSTANCE together (`brain-content.ts`), so `/signatureMoves/2`
// exists only once the instance has three entries. The claim positions of a
// voice document are therefore not knowable until the model has decided how
// many signature moves it found — the positions are an OUTPUT of the inference,
// not an input to it.
import { z } from "zod";

/**
 * The placeholder a claim position holds when the material does not support it.
 *
 * DUPLICATED FROM `@respin/db`'s `brain-content.ts`, deliberately and by the
 * same precedent as `INFERENCE_OUTCOMES` in `./types.ts`: this package may not
 * import that one. The duplication is not left to trust — the assertion that
 * the two are byte-identical lives in
 * `packages/credits/tests/check-marker.test.ts`, which is in the package that
 * depends on BOTH rather than in this one, so that proving the agreement does
 * not require `@respin/llm` to depend on `@respin/db` even for tests. A change
 * on either side is a red test rather than a document whose placeholders
 * silently stop being placeholders.
 */
export const CHECK = "[check]" as const;

/**
 * One of the creator's own posts, as it is stored.
 *
 * `content` is expected to be ALREADY NORMALISED — it comes from
 * `onboarding_inputs`, which stores `normaliseContent(raw)`. Offsets this
 * module computes are UTF-16 code units into exactly this string, which is the
 * unit `brain_docs.source_evidence` records and the unit
 * `validateSourceEvidence` re-verifies against.
 */
export type OwnPost = {
  id: string;
  content: string;
};

/**
 * A field the model is asked to fill.
 *
 * `single` becomes one claim position; `list` becomes zero or more, and its
 * `max` is what stops a model returning fifty signature moves and minting fifty
 * positions a creator has to confirm one at a time.
 */
export type ClaimSpec = {
  /** The document key, e.g. `register`. NOT a pointer — see the header note. */
  key: string;
  kind: "single" | "list";
  /** What this field is, in words the model can act on. */
  guidance: string;
  /** Only meaningful for `list`. Ignored for `single`. */
  max?: number;
};

export type AssembledPrompt = {
  system: string;
  prompt: string;
};

/** One value the model produced, with the citation that grounds it. */
export type AssembledValue = {
  /** The stated value, or `CHECK` when the posts do not support one. */
  value: string;
  /** Absent exactly when `value === CHECK`. */
  evidence?: {
    inputId: string;
    quote: string;
    startUtf16: number;
    endUtf16: number;
  };
};

/** Everything the model produced for one requested field. */
export type AssembledField = {
  key: string;
  kind: "single" | "list";
  /** Exactly one entry for `single`; zero or more for `list`. */
  values: AssembledValue[];
};

/** Refusals this module raises. All of them mean "no document is written". */
export class AssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssemblyError";
  }
}

/**
 * Too few posts to infer a voice from (R6).
 *
 * Separate from `AssemblyError` because it is refused BEFORE the vendor is
 * called and is the one refusal here that names an action the creator can take.
 */
export class NotEnoughPostsError extends Error {
  constructor(
    readonly have: number,
    readonly need: number,
  ) {
    super(
      `${have} ${have === 1 ? "post" : "posts"} is not enough to infer a voice from; ${need} is the minimum`,
    );
    this.name = "NotEnoughPostsError";
  }
}

/**
 * The reply shape, closed.
 *
 * `z.strictObject` throughout: an open key space on a model reply is an
 * unbounded channel from a vendor into a jsonb column this product exports, and
 * the repo has already paid for that lesson once in `sourceEvidenceEntrySchema`.
 *
 * NOTE WHAT THE MODEL IS **NOT** ASKED FOR: offsets. It supplies the post id and
 * the quote; the range is computed. A model doing UTF-16 arithmetic over an
 * emoji-bearing post is the least reliable thing in this path, and an offset it
 * got wrong would be refused by `validateSourceEvidence` as an invented quote —
 * a confusing refusal for a citation that was actually correct.
 */
const replyValueSchema = z.strictObject({
  value: z.string().min(1),
  inputId: z.string().min(1).nullable(),
  quote: z.string().min(1).nullable(),
});

const replyFieldSchema = z.strictObject({
  key: z.string().min(1),
  values: z.array(replyValueSchema),
});

const replySchema = z.strictObject({
  fields: z.array(replyFieldSchema).min(1),
});

/**
 * Build the system and user prompts for the voice inference.
 *
 * @throws NotEnoughPostsError below `minPosts` — R6, and it throws rather than
 * returning an empty prompt so that no caller can spend a vendor call on a
 * document that would be `[check]` in every field.
 */
export function assembleVoicePrompt(params: {
  posts: OwnPost[];
  fields: ClaimSpec[];
  minPosts: number;
}): AssembledPrompt {
  const { posts, fields, minPosts } = params;
  if (fields.length === 0) {
    throw new AssemblyError(
      "no fields were supplied, so there is nothing to infer",
    );
  }
  if (posts.length < minPosts) {
    throw new NotEnoughPostsError(posts.length, minPosts);
  }
  // Ids are what the reply cites, so a duplicate id would make a citation
  // ambiguous about which post it came from.
  const seenIds = new Set<string>();
  for (const p of posts) {
    if (seenIds.has(p.id)) {
      throw new AssemblyError(`post '${p.id}' was supplied twice`);
    }
    seenIds.add(p.id);
  }
  const seenKeys = new Set<string>();
  for (const f of fields) {
    if (seenKeys.has(f.key)) {
      throw new AssemblyError(`field '${f.key}' was requested twice`);
    }
    seenKeys.add(f.key);
  }

  const system = [
    "You infer a creator's writing voice from posts they wrote themselves.",
    "",
    "You describe how they write. You never write in their voice, never give advice, and never comment on how their posts perform.",
    "",
    "Rules you cannot break:",
    "- Every value you state must be grounded in a VERBATIM quote from one of the supplied posts. Copy the quote exactly, character for character.",
    `- If the posts do not support a field, state its value as "${CHECK}" with inputId and quote set to null. This is expected and is better than guessing.`,
    "- Never quote text that is not in the posts. Never paraphrase a quote.",
    "- Reply with a single JSON object and nothing else. No prose, no code fence.",
    "",
    'The object has one key, `fields`: an array of `{key, values}`, where each value is `{value, inputId, quote}`. A "single" field has exactly one value. A "list" field has between one and its stated maximum.',
  ].join("\n");

  const postBlock = posts
    .map((p, i) => `<post id="${p.id}" n="${i + 1}">\n${p.content}\n</post>`)
    .join("\n\n");

  const fieldBlock = fields
    .map((f) =>
      f.kind === "list"
        ? `- ${f.key} (list, at most ${listMax(f)}) — ${f.guidance}`
        : `- ${f.key} (single) — ${f.guidance}`,
    )
    .join("\n");

  const prompt = [
    "Here are posts the creator wrote themselves.",
    "",
    postBlock,
    "",
    "Fill exactly these fields, one entry each:",
    "",
    fieldBlock,
    "",
    `Reply with the JSON object only. Use "${CHECK}" for anything the posts do not support.`,
  ].join("\n");

  return { system, prompt };
}

/**
 * A list field's cap.
 *
 * DEFAULTED HERE RATHER THAN AT EVERY USE, and the default is deliberately
 * small: every list entry becomes a claim position the creator confirms
 * individually, so an uncapped list is a confirm screen nobody finishes.
 */
function listMax(spec: ClaimSpec): number {
  return spec.kind === "list" ? Math.max(1, spec.max ?? 5) : 1;
}

/**
 * Locate a quote in a post, returning UTF-16 offsets, or `null` if it is not
 * there verbatim.
 *
 * The quote is normalised the way `onboarding_inputs.content` was normalised
 * before storage (NFC, CRLF→LF) so that a model returning a decomposed
 * accented character still matches the composed form a person typed. Without
 * it the citation is refused for a difference no reader could see.
 *
 * FIRST OCCURRENCE when a quote appears more than once. A later occurrence
 * would be an equally true citation — the recorded range is verbatim either
 * way, which is the property `validateSourceEvidence` checks — so there is
 * nothing to choose between them and no reason to refuse.
 */
export function locateQuote(
  content: string,
  quote: string,
): { startUtf16: number; endUtf16: number } | null {
  const needle = quote.normalize("NFC").replace(/\r\n/g, "\n");
  if (needle.length === 0) return null;
  const at = content.indexOf(needle);
  if (at < 0) return null;
  return { startUtf16: at, endUtf16: at + needle.length };
}

/**
 * Parse a model reply into filled fields, or refuse.
 *
 * FAIL CLOSED, AND THE FAILURE IS TOTAL (R2). Every refusal below throws, so
 * the caller writes NO brain document — never a partially-filled one. A
 * document missing a claim position cannot activate anyway (activation refuses
 * while any position is unconfirmed), so a partial write would produce a row a
 * creator can see, cannot use, and cannot clear.
 */
export function parseVoiceReply(params: {
  text: string;
  fields: ClaimSpec[];
  posts: OwnPost[];
}): AssembledField[] {
  const { text, fields, posts } = params;

  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    throw new AssemblyError("the reply was not JSON");
  }
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AssemblyError(
      `the reply is not the shape a voice inference takes: ${first.path.length ? `/${first.path.join("/")} ` : ""}${first.message}`,
    );
  }

  const specOf = new Map(fields.map((f) => [f.key, f]));
  const byId = new Map(posts.map((p) => [p.id, p.content]));
  const out: AssembledField[] = [];
  const filled = new Set<string>();

  for (const f of parsed.data.fields) {
    const spec = specOf.get(f.key);
    if (!spec) {
      throw new AssemblyError(
        `the reply fills '${f.key}', which was not one of the requested fields`,
      );
    }
    if (filled.has(f.key)) {
      throw new AssemblyError(`the reply fills '${f.key}' twice`);
    }
    filled.add(f.key);

    if (f.values.length === 0) {
      throw new AssemblyError(
        `'${f.key}' has no values; a field the posts do not support is "${CHECK}", not empty`,
      );
    }
    if (spec.kind === "single" && f.values.length !== 1) {
      throw new AssemblyError(
        `'${f.key}' is a single value and the reply gave ${f.values.length}`,
      );
    }
    if (spec.kind === "list" && f.values.length > listMax(spec)) {
      throw new AssemblyError(
        `'${f.key}' allows at most ${listMax(spec)} values and the reply gave ${f.values.length}`,
      );
    }

    const values: AssembledValue[] = [];
    for (const v of f.values) {
      if (v.value === CHECK) {
        // A placeholder carries no evidence, and carrying one would be a
        // citation for a claim that was not made — the shape G-10 is about.
        if (v.inputId !== null || v.quote !== null) {
          throw new AssemblyError(
            `'${f.key}' has a placeholder carrying a citation; a value that states nothing is not evidenced`,
          );
        }
        // A LIST OF PLACEHOLDERS IS ONE PLACEHOLDER. Several `[check]` entries
        // in `signatureMoves` would mint several claim positions that all say
        // the same nothing, and the creator would confirm "unknown" three
        // times. Refused rather than de-duplicated, because a model doing this
        // has misunderstood the instruction and its other fields are suspect.
        if (spec.kind === "list" && f.values.length > 1) {
          throw new AssemblyError(
            `'${f.key}' mixes a placeholder into a list; a list the posts do not support is a single "${CHECK}"`,
          );
        }
        values.push({ value: CHECK });
        continue;
      }
      if (v.inputId === null || v.quote === null) {
        throw new AssemblyError(
          `'${f.key}' states a value with no quote behind it. Every stated value is grounded or it is "${CHECK}"`,
        );
      }
      const content = byId.get(v.inputId);
      if (content === undefined) {
        throw new AssemblyError(
          `'${f.key}' cites a post that was not supplied`,
        );
      }
      const at = locateQuote(content, v.quote);
      if (at === null) {
        // THE INVENTED-QUOTE REFUSAL. `validateSourceEvidence` would catch this
        // too, at the write — this catches it before the write is attempted, so
        // the refusal names the model rather than the database.
        throw new AssemblyError(
          `'${f.key}' quotes text that does not appear in the post it cites`,
        );
      }
      values.push({
        value: v.value,
        evidence: { inputId: v.inputId, quote: v.quote, ...at },
      });
    }
    out.push({ key: f.key, kind: spec.kind, values });
  }

  const missing = fields.map((f) => f.key).filter((k) => !filled.has(k));
  if (missing.length > 0) {
    throw new AssemblyError(
      `the reply left ${missing.length} of ${fields.length} fields unfilled (${missing.join(", ")})`,
    );
  }
  // Returned in the REQUESTED order, not the reply's. The caller turns this
  // into array indices that become claim pointers, so a model reordering its
  // reply must not reorder a creator's signature moves.
  return fields.map((f) => out.find((o) => o.key === f.key)!);
}

/**
 * Tolerate a fenced reply, because models emit them despite instructions.
 *
 * Deliberately narrow: it strips ONE leading fence and ONE trailing fence and
 * changes nothing else. Anything more forgiving starts guessing which part of a
 * chatty reply was the JSON, and a parser that guesses is the fail-open half of
 * R2.
 *
 * EXPORTED IN SLICE 6 (stage B, R3) so `@respin/modes`'s `parseScriptOutput`
 * uses THIS fence tolerance rather than a second copy of it. R3 says the
 * fail-closed parse contract is "copied, not reinvented"; the strongest reading
 * of that is to share the code, because two hand-copied strippers drift and the
 * one that drifts is the one nobody re-reads. It is pure, takes no options and
 * decides nothing about content, so exporting it widens no surface that
 * matters.
 */
export function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  const firstNewline = t.indexOf("\n");
  if (firstNewline < 0) return t;
  const withoutOpen = t.slice(firstNewline + 1);
  const close = withoutOpen.lastIndexOf("```");
  return (close < 0 ? withoutOpen : withoutOpen.slice(0, close)).trim();
}
