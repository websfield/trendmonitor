// THE CREATIVE FORM CONTROL AND THE DECLARED FILMING LIMITS (R-148; PRD REQ-C01,
// REQ-C02 and REQ-D02 as amended 2026-10-03; launch remediation L1).
//
// WHAT THIS MODULE IS. The closed vocabulary a creator chooses from — three
// forms plus "Choose for me" — and the optional limits they may declare about
// how they can film, together with the ONE parse that turns wire input into a
// request this product will act on. It is pure: no database, no network, no
// clock (`purity.test.ts` scans it with the rest of `src/`).
//
// A CONTROL INSIDE TWO EXISTING PRICED MODES, NOT A MODE. R-148 point 1: no new
// mode, no new credit cost, no new billing mode and no model call selects the
// form. `CREATIVE_FORM_MODES` is the population of modes that accept it, as a
// LIST (CLAUDE.md non-negotiable 7) — the other five keep their legacy contract
// and refuse a creative request outright rather than silently ignoring it.
//
// WHY THE PARSE REFUSES RATHER THAN CLAMPS. Every field here reaches a prompt
// and a stored `jsonb` request, and is part of the request's identity
// (`hashRequest`). A value this parse "fixed" would be a request the creator did
// not make; a value it let through unbounded is an unbounded channel into a
// paid call. So an unknown form, an unknown key, a non-integer minute count, an
// over-long item or a control character is a REFUSAL, raised before any claim
// and before any provider call, naming the FIELD and never the value — the
// refusal must not become the channel that carries a hostile string into a log.
//
// WHAT IT DOES NORMALISE, stated because normalising changes identity: list
// items and the footage note are trimmed, blank list items are dropped, and an
// absent field becomes an explicit `null` / `[]`. Those are the only edits, and
// they are deterministic, so two submissions that differ only in surrounding
// whitespace are one request.
import { type ModeId } from "./modes";

/** The three forms a version-2 concept or script is written in (R-148 point 1). */
export const CREATIVE_FORMS = [
  "explain_opinion",
  "demonstration_experiment",
  "personal_story_observation",
] as const;

export type CreativeForm = (typeof CREATIVE_FORMS)[number];

/** What a creator may ask for: one of the forms, or "Choose for me". */
export const FORM_CHOICES = [...CREATIVE_FORMS, "auto"] as const;

export type FormChoice = (typeof FORM_CHOICES)[number];

/**
 * THE MODES THAT TAKE THE CONTROL — a list, not a predicate over the spec.
 *
 * Two of seven, and R-148 names both. A predicate ("modes whose output carries
 * ideas or beats") would silently admit `footageToThesis`, `sourceToReel` and
 * `analyseAndSpin` too, which R-148 keeps on the legacy contract; adding a
 * third mode here is a deliberate edit that `mode-checks.test.ts`' derivation
 * then requires to declare the four creative checks.
 */
export const CREATIVE_FORM_MODES: readonly ModeId[] = ["ideation", "ideaToScript"];

export function takesCreativeForm(mode: ModeId): boolean {
  return CREATIVE_FORM_MODES.includes(mode);
}

/**
 * The single pivot beat's kind, per form (R-148 point 2).
 *
 * A NARRATIVE TURN for an explanation or a story — the beat where the viewer's
 * understanding changes — and A REVEAL for a demonstration or experiment — the
 * beat where the result is shown. A `Record`, so a fourth form with no pivot
 * kind is a compile error rather than a script nobody can check.
 */
export const PIVOT_KINDS = ["turn", "reveal"] as const;
export type PivotKind = (typeof PIVOT_KINDS)[number];

export const PIVOT_FOR_FORM: Readonly<Record<CreativeForm, PivotKind>> = {
  explain_opinion: "turn",
  demonstration_experiment: "reveal",
  personal_story_observation: "turn",
};

/**
 * WHERE A PREMISE WRITES ITS EVENT OR RESULT (R-148 point 4) — the fields an
 * `unconfirmed` basis must mark with `[check]` (any one of them), and the text a
 * quoted basis must relate to.
 *
 * A story's event is WHAT HAPPENED; a demonstration's is THE RESULT, which a
 * premise names as its payoff; an explanation or opinion may state either.
 *
 * EVERY FORM HAS AN ANSWER, AND THAT IS THE ROUND-1 FIX (compliance gate
 * BLOCK, 2026-10-03). This map used to give `explain_opinion` the value `null`,
 * meaning "no event basis needed" — and the form is a label the MODEL writes.
 * Under "Choose for me" the model could label an invented story or a claimed
 * result `explain_opinion` and the basis rule switched itself off: measured
 * through `runKillTest`, "your views doubled" with basis `none` produced no
 * finding. No model-authored label may turn an integrity rule off, so the
 * label now only decides WHERE the marker goes, never WHETHER one is needed;
 * `mode-checks.ts`' event guard reads the text itself.
 */
export const EVENT_FIELDS: Readonly<
  Record<CreativeForm, readonly ("whatHappens" | "payoff")[]>
> = {
  explain_opinion: ["whatHappens", "payoff"],
  demonstration_experiment: ["payoff"],
  personal_story_observation: ["whatHappens"],
};

/**
 * What a quoted basis has to be (R-148 point 4), here so the prompt can STATE
 * the numbers the check enforces (`assemble.ts`) without a runtime import
 * cycle through `mode-checks.ts`.
 *
 * FOUR WORDS, TWO OF THEM CONTENT WORDS, so a quote is a clause and not a token:
 * "I" or "the bread" is in almost any creator's material. AND RELATED: at least
 * `BASIS_RELATED_MIN_CONTENT_WORDS` of the quote's content words must appear in
 * the premise's event text, or a genuine but unrelated line of the creator's
 * could vouch for an invented event (round-1 compliance gate, Medium).
 */
export const BASIS_EXCERPT_MIN_WORDS = 4;
export const BASIS_EXCERPT_MIN_CONTENT_WORDS = 2;
export const BASIS_RELATED_MIN_CONTENT_WORDS = 2;

/** Who is on set. */
export const FILMING_PEOPLE = ["solo", "with_help"] as const;
export type FilmingPeople = (typeof FILMING_PEOPLE)[number];

/** The longest a single location or equipment entry may be, in code points. */
export const CONSTRAINT_ITEM_MAX_CODE_POINTS = 80;
/** How many locations, or pieces of equipment, a creator may declare. */
export const CONSTRAINT_LIST_MAX = 12;
/** The longest the "footage I already have" note may be, in code points. */
export const FOOTAGE_MAX_CODE_POINTS = 1_000;
/**
 * The filming-time bound, in whole minutes, on both sides: a declared limit and
 * a concept's own estimate. Four hours is far past any short-form shoot a
 * creator would plan in one sitting; the bound exists so a number is a number.
 */
export const FILMING_MINUTES_MIN = 1;
export const FILMING_MINUTES_MAX = 240;

/**
 * The declared limits, CANONICAL: every field present, absence stated as
 * `null` or `[]`. No optional keys, because an omitted field shortens the
 * canonical form `hashRequest` takes and an omission is a collision surface
 * (the comment on `parentGenerationId` in `generate.ts` records the same
 * lesson).
 */
export type FilmingConstraints = {
  people: FilmingPeople | null;
  maxMinutes: number | null;
  locations: readonly string[];
  equipment: readonly string[];
  footage: string | null;
};

/** The validated creative half of a request. */
export type CreativeRequest = {
  formChoice: FormChoice;
  constraints: FilmingConstraints;
};

/** What a caller may hand in, before the parse. */
export type FilmingConstraintsInput = {
  people?: FilmingPeople | null;
  maxMinutes?: number | null;
  locations?: readonly string[] | null;
  equipment?: readonly string[] | null;
  footage?: string | null;
};

export type CreativeRequestInput = {
  formChoice: FormChoice;
  constraints?: FilmingConstraintsInput | null;
};

/** The closed reasons a creative request is refused. */
export const CREATIVE_REQUEST_REFUSALS = [
  "unknown_form",
  "form_not_offered_for_mode",
  "invalid_constraint",
  "revision_keeps_legacy_format",
  // Launch L2 (R-151; L1 deferral): a revision is the same piece made better,
  // priced as a revision — it keeps its parent's form. A different form is a
  // new commission (develop the concept again), never a revision-priced swap.
  "revision_keeps_form",
] as const;

export type CreativeRequestRefusal = (typeof CREATIVE_REQUEST_REFUSALS)[number];

/** The constraint fields a refusal may name. Closed, so a refusal names no value. */
export const CONSTRAINT_FIELDS = [
  "people",
  "maxMinutes",
  "locations",
  "equipment",
  "footage",
] as const satisfies readonly (keyof FilmingConstraints)[];

export type ConstraintField = (typeof CONSTRAINT_FIELDS)[number];

const REFUSAL_MESSAGES: Readonly<Record<CreativeRequestRefusal, string>> = {
  unknown_form:
    "the request named a creative form this product does not offer, so nothing was run",
  form_not_offered_for_mode:
    "a creative form was sent for a mode that does not take one, so nothing was run",
  invalid_constraint:
    "a filming limit on the request was not one this product accepts, so nothing was run",
  revision_keeps_legacy_format:
    "the draft being revised was made before creative forms existed, and its revision keeps that format",
  revision_keeps_form:
    "a revision keeps the form of the draft it revises; a script in a different form is a new script, so nothing was run",
};

/**
 * A creative request this product will not act on.
 *
 * THE MESSAGE NAMES THE REASON AND, AT MOST, THE FIELD — both from closed
 * lists — and never the value that was refused. Raised BEFORE the claim and
 * before any provider call (`generate.ts` runs the parse right after the mode
 * gate), so a refusal here spends nothing.
 */
export class CreativeRequestError extends Error {
  constructor(
    readonly reason: CreativeRequestRefusal,
    readonly field: ConstraintField | null = null
  ) {
    super(
      field === null
        ? REFUSAL_MESSAGES[reason]
        : `${REFUSAL_MESSAGES[reason]} (field: ${field})`
    );
    this.name = "CreativeRequestError";
  }
}

/**
 * What a creator reads for each choice. A `Record`, so a new choice with no
 * label is a compile error. `app/**` reaches these through the credits facade.
 */
export const FORM_CHOICE_LABELS: Readonly<Record<FormChoice, string>> = {
  explain_opinion: "Explain or give an opinion",
  demonstration_experiment: "Demonstration or experiment",
  personal_story_observation: "Personal story or observation",
  auto: "Choose for me",
};

/** The choices in the order the form offers them — "Choose for me" first. */
export const FORM_CHOICE_ORDER: readonly FormChoice[] = [
  "auto",
  "explain_opinion",
  "demonstration_experiment",
  "personal_story_observation",
];

/** A plain object — not null, not an array, not a primitive a cast smuggled. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePoints(text: string): number {
  return [...text].length;
}

/**
 * Characters a constraint may not carry.
 *
 * C0 CONTROLS AND DEL, because a single line in a prompt must stay one line
 * and `jsonb` refuses U+0000 outright — a NUL here would be accepted, paid for
 * at the vendor, and then refused INSIDE the settlement transaction. The
 * footage note is a paragraph, so it alone may carry a tab or a line break
 * (the prompt flattens those). A CODE-POINT WALK rather than a control-range
 * regex: a regex literal over U+0000 is the shape the linter refuses, and a
 * string-built one is the fail-open shape CLAUDE.md names.
 *
 * LONE SURROGATES for the same reason as NUL: `JSON.stringify` writes them as
 * `\ud800` escapes that Postgres' `jsonb` refuses. That regex is a literal.
 */
function hasControl(text: string, allowLineBreaks: boolean): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x7f) return true;
    if (c >= 0x20) continue;
    if (allowLineBreaks && (c === 0x09 || c === 0x0a || c === 0x0d)) continue;
    return true;
  }
  return false;
}
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function refuse(field: ConstraintField): never {
  throw new CreativeRequestError("invalid_constraint", field);
}

function listOf(field: "locations" | "equipment", value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) refuse(field);
  const out: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "string") refuse(field);
    const trimmed = (item as string).trim();
    if (trimmed.length === 0) continue;
    if (
      codePoints(trimmed) > CONSTRAINT_ITEM_MAX_CODE_POINTS ||
      hasControl(trimmed, false) ||
      LONE_SURROGATE.test(trimmed)
    ) {
      refuse(field);
    }
    out.push(trimmed);
  }
  if (out.length > CONSTRAINT_LIST_MAX) refuse(field);
  return out;
}

/**
 * THE ONE PARSE from wire input to a creative request — or a refusal.
 *
 * STRICT ON KEYS AT BOTH LEVELS, the `z.strictObject` discipline `output.ts`
 * follows: an unknown key is a value nobody validated arriving in a stored
 * request, so it is refused rather than dropped.
 *
 * TYPED SHUT IS NOT SHUT (CLAUDE.md 2026-08-21): the parameter is `unknown`
 * because the action casts wire strings into `CreativeRequestInput`, and every
 * branch below is what a cast actually meets.
 */
export function parseCreativeRequest(raw: unknown): CreativeRequest {
  if (!isPlainObject(raw)) throw new CreativeRequestError("unknown_form");
  for (const key of Object.keys(raw)) {
    if (key !== "formChoice" && key !== "constraints") {
      throw new CreativeRequestError("invalid_constraint");
    }
  }
  const formChoice = raw.formChoice;
  if (
    typeof formChoice !== "string" ||
    !(FORM_CHOICES as readonly string[]).includes(formChoice)
  ) {
    throw new CreativeRequestError("unknown_form");
  }
  const rawConstraints = raw.constraints;
  if (
    rawConstraints !== undefined &&
    rawConstraints !== null &&
    !isPlainObject(rawConstraints)
  ) {
    throw new CreativeRequestError("invalid_constraint");
  }
  const c: Record<string, unknown> = isPlainObject(rawConstraints)
    ? rawConstraints
    : {};
  for (const key of Object.keys(c)) {
    if (!(CONSTRAINT_FIELDS as readonly string[]).includes(key)) {
      throw new CreativeRequestError("invalid_constraint");
    }
  }

  let people: FilmingPeople | null = null;
  if (c.people !== undefined && c.people !== null) {
    if (
      typeof c.people !== "string" ||
      !(FILMING_PEOPLE as readonly string[]).includes(c.people)
    ) {
      refuse("people");
    }
    people = c.people as FilmingPeople;
  }

  let maxMinutes: number | null = null;
  if (c.maxMinutes !== undefined && c.maxMinutes !== null) {
    if (
      typeof c.maxMinutes !== "number" ||
      !Number.isInteger(c.maxMinutes) ||
      c.maxMinutes < FILMING_MINUTES_MIN ||
      c.maxMinutes > FILMING_MINUTES_MAX
    ) {
      refuse("maxMinutes");
    }
    maxMinutes = c.maxMinutes as number;
  }

  let footage: string | null = null;
  if (c.footage !== undefined && c.footage !== null) {
    if (typeof c.footage !== "string") refuse("footage");
    const trimmed = (c.footage as string).trim();
    if (trimmed.length > 0) {
      if (
        codePoints(trimmed) > FOOTAGE_MAX_CODE_POINTS ||
        hasControl(trimmed, true) ||
        LONE_SURROGATE.test(trimmed)
      ) {
        refuse("footage");
      }
      footage = trimmed;
    }
  }

  return {
    formChoice: formChoice as FormChoice,
    constraints: {
      people,
      maxMinutes,
      locations: listOf("locations", c.locations),
      equipment: listOf("equipment", c.equipment),
      footage,
    },
  };
}

/**
 * The declared limits as the creator's own text, for the two corpora.
 *
 * R-148 point 3: the constraints "are creator input for this generation". The
 * three free-text fields are therefore material the traceability scan may trace
 * a specific to and a basis excerpt may quote — the same standing the input box
 * has. The two closed fields (`people`, `maxMinutes`) are not text a creator
 * wrote and are not included.
 */
export function constraintTexts(constraints: FilmingConstraints): string[] {
  return [
    ...constraints.locations,
    ...constraints.equipment,
    ...(constraints.footage === null ? [] : [constraints.footage]),
  ];
}
