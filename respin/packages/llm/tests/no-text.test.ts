// R3: NO PROMPT AND NO COMPLETION TEXT EVER REACHES AN ERROR MESSAGE, ASSERTED
// BY CONSTRUCTION.
//
// WHY THIS FILE EXISTS (slice 7 handoff, 2026-09-01). `errors.ts`'s header said
// this guard existed and named this path. It did not exist — `source-citations`
// found the dangling citation and recorded it as "an absent guard described as
// present". A comment claiming a property is not the property (CLAUDE.md
// 2026-07-30), so the claim is either asserted or deleted; it is worth keeping.
//
// AND WRITING IT CORRECTED THE CLAIM, which is the point of writing one. The
// header said "these constructors take NUMBERS, ENUMS and OUR OWN LITERALS.
// There is no parameter that can carry vendor or creator text." Measured
// against the file: `LlmError`'s own constructor takes `message: string`, and
// `LlmHostNotAllowedError` takes TWO strings and puts both in its message. The
// property is real and the sentence stating it was wider than the code. What is
// true, and what this file enforces, is the rule with its two exemptions NAMED:
//
//   Every constructor parameter of every error class in `errors.ts` has a type
//   that CANNOT carry free text — a number, a boolean, `null`, a closed
//   string-literal union, `InferenceOutcome`, or an object of those — except
//   the ones NAMED in `STRING_EXEMPTIONS` below, each with its reason and its
//   own compensating assertion.
//
// THE COUNT IS NOT WRITTEN OUT HERE, and that is the fix rather than laziness
// (round 2, 2026-09-01). This sentence said "except two" and the list held
// three, one line under a header in `errors.ts` that said "TWO PARAMETERS ARE
// STRINGS" and named three. A count in prose is bound to nothing; the two
// counts that remain in this file are bound to `STRING_EXEMPTIONS.length` —
// the block title below is computed from it, and the sentence in `errors.ts`
// is read and compared against it.
//
// A GUARD THAT SCANS SOURCE FAILS OPEN WHEN ITS PATTERN BREAKS (CLAUDE.md
// 2026-08-21): every shape is planted, the parse is asserted to have found the
// real classes, and the exemptions are driven behaviourally rather than
// asserted in prose.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_ORIGIN, pinnedFetch } from "../src/anthropic";
import {
  LlmError,
  LlmHostNotAllowedError,
  LlmNotConfiguredError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  LlmUnavailableError,
} from "../src/errors";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const ERRORS_TS = resolve(HERE, "../src/errors.ts");

/**
 * Every product source file under `packages/` and `app/`, as [path, source].
 *
 * ONE POPULATION, SHARED BY EVERY SCAN IN THIS FILE. It was inlined in the
 * `LlmError` scan; the `allowedOrigin` scan added in round 2 asks the same
 * question of the same tree, and two walks is two populations that drift the
 * day one of them learns about a new directory (CLAUDE.md, 2026-08-29).
 *
 * Tests are excluded on purpose: a suite legitimately constructs these classes,
 * and a construction reachable by nobody is not a channel for creator text.
 */
function productSourceFiles(): [string, string][] {
  const SKIP = new Set(["node_modules", ".next", "dist", "coverage", "tests"]);
  const files: [string, string][] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        try {
          files.push([
            relative(ROOT, full).split(sep).join("/"),
            readFileSync(full, "utf8"),
          ]);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw err;
        }
      }
    }
  };
  for (const tree of ["packages", "app"]) walk(join(ROOT, tree));
  return files;
}

/** Type references a parameter may name. Adding one is a deliberate edit. */
const ALLOWED_TYPE_REFS = new Set(["InferenceOutcome"]);

/**
 * The parameters that ARE strings, each with its reason.
 *
 * NAMED AND CLOSED, never a pattern: a rule with a wildcard exemption is a rule
 * anybody can join. Each entry carries a behavioural case below, because "this
 * string is safe" is a claim about where the value comes from, and that is not
 * something a type can say.
 */
const STRING_EXEMPTIONS: readonly { cls: string; param: string; why: string }[] =
  [
    {
      cls: "LlmError",
      param: "message",
      why: "the base's own message. Every subclass passes a LITERAL written in this file, and no product code constructs the base — both asserted below.",
    },
    {
      cls: "LlmHostNotAllowedError",
      param: "attemptedOrigin",
      why: "a URL ORIGIN (scheme://host:port) from `new URL(raw).origin`, which structurally cannot carry a path, a query or a body — driven below with a creator's post in the URL.",
    },
    {
      cls: "LlmHostNotAllowedError",
      param: "allowedOrigin",
      why: "the pinned constant `ANTHROPIC_ORIGIN`; both call sites pass it and nothing else — parsed below with the ARGUMENT POSITION checked, no other product file constructs the class, and the unparseable-URL site is driven through the real `pinnedFetch` with a creator's post in the URL.",
    },
  ];

const exempt = (cls: string, param: string): boolean =>
  STRING_EXEMPTIONS.some((e) => e.cls === cls && e.param === param);

type Offender = { cls: string; param: string; type: string };

/** Can this type annotation carry free text? */
function carriesFreeText(node: ts.TypeNode | undefined): boolean {
  // NO ANNOTATION IS A REFUSAL HERE. The INITIALISER case is handled one level
  // up, in `paramCarriesFreeText`, because it needs the sibling parameters.
  if (!node) return true;
  switch (node.kind) {
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
      return false;
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.ObjectKeyword:
      return true;
    default:
      break;
  }
  if (ts.isLiteralTypeNode(node)) {
    // A string LITERAL type is one of our own words, not free text. `null` and
    // numeric literals land here too.
    return false;
  }
  if (ts.isUnionTypeNode(node)) return node.types.some(carriesFreeText);
  if (ts.isParenthesizedTypeNode(node)) return carriesFreeText(node.type);
  if (ts.isTypeLiteralNode(node)) {
    return node.members.some((m) =>
      ts.isPropertySignature(m) ? carriesFreeText(m.type) : true
    );
  }
  if (ts.isTypeReferenceNode(node)) {
    return !ALLOWED_TYPE_REFS.has(node.typeName.getText());
  }
  // Anything unrecognised is refused. A new shape is a deliberate edit here,
  // never a silent pass.
  return true;
}

/**
 * One parameter, annotation or INITIALISER.
 *
 * FOUND BY THIS GUARD ON ITS FIRST RUN, which is the reason it exists rather
 * than a flourish. `LlmError`'s own constructor ends
 * `operatorRemedy = false, consumesIncludedBuild = billable` \u2014 two parameters
 * with no annotation, whose types TypeScript infers from the initialiser. The
 * first draft called both `any` and reported the base class as an offender.
 *
 * The rule stays FAIL-CLOSED: an unannotated parameter passes only when its
 * initialiser is a boolean/number/null literal, or an identifier naming
 * another parameter of the SAME constructor whose own type is clean. Anything
 * else \u2014 a call, a property access, a string \u2014 is refused, so
 * `detail = someLookup()` cannot slip through as "inferred and therefore fine".
 */
function paramCarriesFreeText(
  param: ts.ParameterDeclaration,
  siblings: readonly ts.ParameterDeclaration[],
  sf: ts.SourceFile
): boolean {
  if (param.type) return carriesFreeText(param.type);
  const init = param.initializer;
  if (!init) return true;
  if (
    init.kind === ts.SyntaxKind.TrueKeyword ||
    init.kind === ts.SyntaxKind.FalseKeyword ||
    init.kind === ts.SyntaxKind.NullKeyword ||
    ts.isNumericLiteral(init)
  ) {
    return false;
  }
  if (ts.isIdentifier(init)) {
    const named = siblings.find(
      (s) => s !== param && s.name.getText(sf) === init.text
    );
    // A parameter defaulting to a SIBLING inherits the sibling's type, and an
    // identifier that is not a sibling is an outer binding this scan cannot
    // reason about \u2014 refused.
    return named ? carriesFreeText(named.type) : true;
  }
  return true;
}

/** Every constructor parameter of every class, classified. */
export function scanConstructorParams(src: string): {
  classes: string[];
  offenders: Offender[];
} {
  const sf = ts.createSourceFile(
    "errors.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const classes: string[] = [];
  const offenders: Offender[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const cls = node.name.text;
      classes.push(cls);
      for (const member of node.members) {
        if (!ts.isConstructorDeclaration(member)) continue;
        for (const param of member.parameters) {
          const name = param.name.getText(sf);
          if (!paramCarriesFreeText(param, member.parameters, sf)) continue;
          if (exempt(cls, name)) continue;
          offenders.push({
            cls,
            param: name,
            type:
              param.type?.getText(sf) ??
              (param.initializer
                ? `(inferred from = ${param.initializer.getText(sf)})`
                : "(no annotation)"),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return { classes, offenders };
}

describe("the constructor-parameter scan is not vacuous", () => {
  it("catches a PLANTED text-carrying parameter of every shape", () => {
    // Each shape names the parameter the scan MUST report, because a count
    // would be wrong for the sibling-default case: there both `b` (the plant)
    // and its string-typed sibling `a` are offenders, and correctly so.
    const SHAPES: [string, string, string][] = [
      [
        "a bare string",
        "d",
        "class LlmX extends LlmError { constructor(d: string) {} }",
      ],
      [
        "a string in a union",
        "d",
        'class LlmX extends LlmError { constructor(d: "a" | string) {} }',
      ],
      [
        "unknown",
        "d",
        "class LlmX extends LlmError { constructor(d: unknown) {} }",
      ],
      ["any", "d", "class LlmX extends LlmError { constructor(d: any) {} }"],
      [
        "no annotation at all",
        "d",
        "class LlmX extends LlmError { constructor(d) {} }",
      ],
      [
        "no annotation, initialised from a STRING",
        "d",
        'class LlmX extends LlmError { constructor(d = "text") {} }',
      ],
      [
        "no annotation, initialised from a CALL",
        "d",
        "class LlmX extends LlmError { constructor(d = lookup()) {} }",
      ],
      [
        "no annotation, defaulting to a sibling that IS a string",
        "b",
        "class LlmX extends LlmError { constructor(a: string, b = a) {} }",
      ],
      [
        "a string inside an object literal type",
        "u",
        "class LlmX extends LlmError { constructor(u: { tokensIn: number; body: string }) {} }",
      ],
      [
        "an unrecognised type reference",
        "r",
        "class LlmX extends LlmError { constructor(r: Anthropic.Message) {} }",
      ],
      [
        "a string smuggled through a parameter PROPERTY",
        "d",
        "class LlmX extends LlmError { constructor(readonly d: string) {} }",
      ],
    ];
    for (const [label, planted, src] of SHAPES) {
      expect(
        scanConstructorParams(src).offenders.map((o) => o.param),
        `${label}: the scan did not see it`
      ).toContain(planted);
    }
  });

  it("...and passes the shapes this file really uses", () => {
    // The other direction, which is what stops "no offenders" being satisfied
    // by a rule that refuses nothing OR by one that refuses everything.
    const OK = [
      'class LlmX extends LlmError { constructor(reason: "missing" | "rejected") {} }',
      "class LlmX extends LlmError { constructor(status: number | null) {} }",
      "class LlmX extends LlmError { constructor(billable: boolean) {} }",
      "class LlmX extends LlmError { constructor(outcome: InferenceOutcome) {} }",
      "class LlmX extends LlmError { constructor(u: { tokensIn: number; tokensOut: number } | null = null) {} }",
      "class LlmX extends LlmError { constructor(readonly maxOutputTokens: number) {} }",
      // The shape the base really uses: unannotated, inferred from a boolean
      // literal and from a sibling parameter.
      "class LlmX extends LlmError { constructor(billable: boolean, operatorRemedy = false, consumesIncludedBuild = billable) {} }",
    ];
    for (const src of OK) {
      expect(scanConstructorParams(src).offenders, src).toEqual([]);
    }
  });

  it("an exemption is per (class, parameter) and not per name", () => {
    // `message` is exempt on `LlmError` ONLY. A subclass adding its own
    // `message: string` is a new hole and is reported.
    expect(
      scanConstructorParams(
        "class LlmError { constructor(message: string) {} }"
      ).offenders
    ).toEqual([]);
    expect(
      scanConstructorParams(
        "class LlmRefusedError { constructor(message: string) {} }"
      ).offenders
    ).toEqual([
      { cls: "LlmRefusedError", param: "message", type: "string" },
    ]);
  });
});

describe("THE REAL FILE: no constructor parameter can carry free text", () => {
  const source = readFileSync(ERRORS_TS, "utf8");

  it("every error class in errors.ts is clean, exemptions aside", () => {
    const { classes, offenders } = scanConstructorParams(source);
    // Non-vacuity: the parse really found the family.
    expect(classes).toContain("LlmError");
    expect(classes.length, "the parse found almost no classes").toBeGreaterThan(5);
    expect(
      offenders,
      "a constructor parameter can carry free text — give it a closed type, or add it to STRING_EXEMPTIONS with a reason and a behavioural case"
    ).toEqual([]);
  });

  it("every exemption names a parameter the file really has, and gives a reason", () => {
    // The list cannot rot in the safe direction either: an exemption for a
    // parameter that no longer exists is a hole held open for nothing, and one
    // without a reason is a hole nobody can review.
    expect(STRING_EXEMPTIONS.length, "the list emptied itself").toBe(3);
    // AND THE FILE'S OWN SENTENCE COUNTS THEM CORRECTLY (round 2,
    // 2026-09-01). `errors.ts`'s header read "TWO PARAMETERS ARE STRINGS" and
    // then named three — the same defect `REVISION_PARENT_MESSAGES` carried in
    // `@respin/credits`, and the reason it survived is that a number in prose
    // is bound to nothing. It is bound here: the word and the list length are
    // read together, and rewording the sentence out from under this fails
    // rather than passing vacuously.
    const counted = /^\/\/ (\w+) PARAMETERS ARE STRINGS/m.exec(source);
    expect(
      counted,
      "errors.ts no longer states how many of its parameters are strings"
    ).not.toBeNull();
    expect(counted?.[1].toLowerCase()).toBe(
      NUMBER_WORDS[STRING_EXEMPTIONS.length]
    );
    for (const e of STRING_EXEMPTIONS) {
      expect(
        source,
        `STRING_EXEMPTIONS names ${e.cls}, which is not a class in errors.ts`
      ).toContain(`class ${e.cls} `);
      expect(
        source,
        `STRING_EXEMPTIONS names ${e.cls}.${e.param}, which is not a string parameter in errors.ts`
      ).toContain(`${e.param}: string`);
      expect(e.why.length, `${e.cls}.${e.param} is exempt for no stated reason`)
        .toBeGreaterThan(30);
    }
  });
});

// The English for a small count, so a sentence that states one can be checked
// against the collection it describes instead of being fixed a third time.
const NUMBER_WORDS: Readonly<Record<number, string>> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
};

// THE TITLE COUNTS THE LIST, it does not remember it: this block said "THE TWO
// EXEMPTIONS" above a list of three (round 2, 2026-09-01).
describe(`THE ${NUMBER_WORDS[STRING_EXEMPTIONS.length].toUpperCase()} EXEMPTIONS, driven rather than argued`, () => {
  const SECRET =
    "my unpublished post about the 4am shoot, and my client's name is Sarah";

  it("no error's message, name or JSON carries text it was never given", () => {
    // Every class, constructed the way the adapter constructs it. None of them
    // has a channel for creator text, so the assertion is that the family's
    // messages are OUR OWN WORDS — the property the header claims.
    const errors: LlmError[] = [
      new LlmNotConfiguredError("missing"),
      new LlmNotConfiguredError("rejected"),
      new LlmRateLimitedError(),
      new LlmUnavailableError(503, "server"),
      new LlmUnavailableError(null, "network"),
      new LlmUnavailableError(null, "timeout"),
      new LlmRefusedError(),
      new LlmSchemaInvalidError("no_text_block", true),
      new LlmSchemaInvalidError("bad_request", false),
      new LlmTruncatedError(4000, { tokensIn: 12, tokensOut: 4000 }),
    ];
    for (const err of errors) {
      const surface = `${err.name} ${err.message} ${JSON.stringify(err)}`;
      expect(surface, err.name).not.toContain(SECRET);
      expect(err.message.length, `${err.name} has no message`).toBeGreaterThan(20);
    }
  });

  it("the HOST error's origin cannot carry a path, a query or a body", () => {
    // THE EXEMPTION'S WHOLE WARRANT, driven end to end through the real
    // `pinnedFetch` rather than by constructing the error directly: the value
    // that reaches the message is `new URL(raw).origin`, and an origin is
    // scheme://host:port. A creator's post in the path AND in the query of the
    // refused URL reaches nothing.
    const fetchPinned = pinnedFetch(async () => {
      throw new Error("the underlying fetch must not be reached");
    });
    const hostile = `https://www.instagram.com/${encodeURIComponent(SECRET)}?q=${encodeURIComponent(SECRET)}#${encodeURIComponent(SECRET)}`;
    expect.assertions(5);
    return fetchPinned(hostile).catch((err: unknown) => {
      expect(err).toBeInstanceOf(LlmHostNotAllowedError);
      const e = err as LlmHostNotAllowedError;
      expect(e.message).not.toContain(SECRET);
      expect(e.message).not.toContain(encodeURIComponent(SECRET));
      expect(e.attemptedOrigin).toBe("https://www.instagram.com");
      // ...and the second exempt string is the pinned constant, not an input.
      expect(e.message).toContain(ANTHROPIC_ORIGIN);
    });
  });

  it("the ALLOWED origin is the pinned constant at every call site, and there are only two", () => {
    // THE THIRD EXEMPTION'S WARRANT, which was the one sentence in
    // `STRING_EXEMPTIONS` with no run behind it (llm gate round 2,
    // 2026-09-01): "the pinned constant `ANTHROPIC_ORIGIN`; both call sites
    // pass it and nothing else". `attemptedOrigin` is driven end to end above;
    // this is the other string in the same constructor, and it is a claim
    // about CALL SITES, so it is checked over the call sites.
    //
    // PARSED, NOT GREPPED: the argument POSITION is the whole claim, and a
    // regex that finds the constant somewhere on the line cannot tell first
    // from second.
    const secondArgs = (source: string): string[] => {
      const sf = ts.createSourceFile(
        "scan.ts",
        source,
        ts.ScriptTarget.Latest,
        true
      );
      const out: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isNewExpression(node) &&
          node.expression.getText() === "LlmHostNotAllowedError"
        ) {
          out.push(node.arguments?.[1]?.getText() ?? "<no second argument>");
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      return out;
    };
    // NON-VACUITY, both directions: the scan sees a planted violation and
    // reads the position rather than the line.
    expect(
      secondArgs(
        'throw new LlmHostNotAllowedError(ANTHROPIC_ORIGIN, someUserString);'
      )
    ).toEqual(["someUserString"]);
    expect(secondArgs("const x = 1;")).toEqual([]);

    const adapter = readFileSync(resolve(HERE, "../src/anthropic.ts"), "utf8");
    // BOTH call sites — the unparseable-URL branch and the wrong-origin branch
    // — and the count is asserted, so a third one added without the constant
    // cannot hide behind the two that are right.
    expect(secondArgs(adapter)).toEqual([
      "ANTHROPIC_ORIGIN",
      "ANTHROPIC_ORIGIN",
    ]);
    // "...and nothing else": no other product file constructs it at all.
    const elsewhere = productSourceFiles()
      .filter(
        ([f, src]) =>
          f !== "packages/llm/src/anthropic.ts" &&
          /\bnew\s+LlmHostNotAllowedError\s*\(/.test(src)
      )
      .map(([f]) => f);
    expect(
      elsewhere,
      "a file outside the adapter constructs LlmHostNotAllowedError, so `allowedOrigin` has a caller that could pass something other than the pin"
    ).toEqual([]);
  });

  it("the UNPARSEABLE-URL call site carries no creator text either", () => {
    // The second call site, driven rather than read. Its `attemptedOrigin` is
    // one of OUR literals ("an unparseable URL") because there is no origin to
    // report — and the URL that produced it still contains the creator's post.
    const fetchPinned = pinnedFetch(async () => {
      throw new Error("the underlying fetch must not be reached");
    });
    expect.assertions(4);
    return fetchPinned(`not a url ${SECRET}`).catch((err: unknown) => {
      expect(err).toBeInstanceOf(LlmHostNotAllowedError);
      const e = err as LlmHostNotAllowedError;
      expect(e.message).not.toContain(SECRET);
      expect(e.attemptedOrigin).toBe("an unparseable URL");
      expect(e.message).toContain(ANTHROPIC_ORIGIN);
    });
  });

  it("no product code constructs the BASE, so `message: string` has no caller", () => {
    // The compensating control for the first exemption. `LlmError`'s message
    // parameter is the one place a string could enter, and every subclass in
    // `errors.ts` passes a literal written there. This asserts nothing under
    // `packages/*/src` or `app/**` calls it — which is the property that makes
    // the exemption safe, rather than an argument that it is.
    const files = productSourceFiles();
    expect(files.length, "the walk read nothing").toBeGreaterThan(100);
    // NON-VACUITY: the pattern really matches the shape it is looking for.
    expect(
      /\bnew\s+LlmError\s*\(/.test('const e = new LlmError("x", "refused", true);')
    ).toBe(true);
    const callers = files
      .filter(([, src]) => /\bnew\s+LlmError\s*\(/.test(src))
      .map(([f]) => f);
    expect(
      callers,
      "product code constructs LlmError directly, so its `message: string` has a caller that could pass creator text"
    ).toEqual([]);
  });
});
