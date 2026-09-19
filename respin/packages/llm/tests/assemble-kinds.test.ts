import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  acceptCanonicalMatch,
  ASSEMBLY_KINDS,
  ASSEMBLY_KINDS_PRE_VENDOR,
  assembleVoicePrompt,
  AssemblyError,
  canon,
  CANON_CODE_POINT_TABLE,
  CHECK,
  locateQuote,
  parseVoiceReply,
  type AssemblyKind,
  type ClaimSpec,
  type MapBack,
} from "../src/assemble";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESPIN_ROOT = resolve(HERE, "../../..");
const REPO_ROOT = resolve(RESPIN_ROOT, "..");
const LLM_ROOT = resolve(RESPIN_ROOT, "packages/llm");
const ASSEMBLE_PATH = resolve(RESPIN_ROOT, "packages/llm/src/assemble.ts");
const execFileAsync = promisify(execFile);

const SINGLE: ClaimSpec[] = [
  { key: "register", kind: "single", guidance: "register" },
];
const SINGLE_AND_LIST: ClaimSpec[] = [
  ...SINGLE,
  { key: "moves", kind: "list", guidance: "moves", max: 1 },
];
const POSTS = [{ id: "post-1", content: "alpha beta gamma" }];
const cite = (value: string, inputId = "post-1", quote = "alpha") => ({
  value,
  inputId,
  quote,
});
const reply = (fields: unknown) => JSON.stringify({ fields });
const field = (key: string, values: unknown[]) => ({ key, values });

function caughtKind(run: () => unknown): AssemblyKind {
  try {
    run();
    throw new Error("expected AssemblyError");
  } catch (error) {
    expect(error).toBeInstanceOf(AssemblyError);
    return (error as AssemblyError).kind;
  }
}

describe("AssemblyError kinds", () => {
  const cases: ReadonlyArray<readonly [AssemblyKind, () => unknown]> = [
    ["no_fields_supplied", () => assembleVoicePrompt({ posts: POSTS, fields: [], minPosts: 1 })],
    [
      "duplicate_post",
      () => assembleVoicePrompt({ posts: [...POSTS, POSTS[0]], fields: SINGLE, minPosts: 1 }),
    ],
    [
      "duplicate_field_request",
      () => assembleVoicePrompt({ posts: POSTS, fields: [...SINGLE, SINGLE[0]], minPosts: 1 }),
    ],
    ["not_json", () => parseVoiceReply({ text: "not json", fields: SINGLE, posts: POSTS })],
    ["bad_shape", () => parseVoiceReply({ text: reply([]), fields: SINGLE, posts: POSTS })],
    [
      "unknown_field",
      () => parseVoiceReply({ text: reply([field("other", [cite("plain")])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "duplicate_field",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain")]), field("register", [cite("plain")])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "empty_values",
      () => parseVoiceReply({ text: reply([field("register", [])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "single_arity",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain"), cite("direct")])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "list_max",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain")]), field("moves", [cite("one"), cite("two")])]), fields: SINGLE_AND_LIST, posts: POSTS }),
    ],
    [
      "placeholder_with_citation",
      () => parseVoiceReply({ text: reply([field("register", [{ value: CHECK, inputId: "post-1", quote: "alpha" }])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "placeholder_in_list",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain")]), field("moves", [{ value: CHECK, inputId: null, quote: null }, cite("one")])]), fields: [{ ...SINGLE[0] }, { key: "moves", kind: "list", guidance: "moves", max: 2 }], posts: POSTS }),
    ],
    [
      "value_without_quote",
      () => parseVoiceReply({ text: reply([field("register", [{ value: "plain", inputId: null, quote: null }])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "post_not_supplied",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain", "other")])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "quote_not_found",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain", "post-1", "absent")])]), fields: SINGLE, posts: POSTS }),
    ],
    [
      "fields_unfilled",
      () => parseVoiceReply({ text: reply([field("register", [cite("plain")])]), fields: SINGLE_AND_LIST, posts: POSTS }),
    ],
  ];

  for (const [kind, run] of cases) {
    it(`produces ${kind}`, () => expect(caughtKind(run)).toBe(kind));
  }

  it("keeps the closed union equal to the kinds at every throw site", () => {
    const source = readFileSync(ASSEMBLE_PATH, "utf8");
    const parsed = ts.createSourceFile(ASSEMBLE_PATH, source, ts.ScriptTarget.Latest, true);
    const thrown = new Set<string>();
    const preVendor = new Set<string>();
    const visit = (node: ts.Node, insidePrompt = false): void => {
      const nowInsidePrompt = insidePrompt || (
        ts.isFunctionDeclaration(node) && node.name?.text === "assembleVoicePrompt"
      );
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "AssemblyError"
      ) {
        const first = node.arguments?.[0];
        expect(first && ts.isStringLiteral(first)).toBe(true);
        const kind = (first as ts.StringLiteral).text;
        thrown.add(kind);
        if (nowInsidePrompt) preVendor.add(kind);
      }
      ts.forEachChild(node, (child) => visit(child, nowInsidePrompt));
    };
    visit(parsed);
    expect([...thrown].sort()).toEqual([...ASSEMBLY_KINDS].sort());
    expect([...preVendor].sort()).toEqual([...ASSEMBLY_KINDS_PRE_VENDOR].sort());
  });
});

describe("canonical quote location", () => {
  it("keeps exact-match-first behavior", () => {
    const content = "It's first. It’s second.";
    expect(locateQuote(content, "It’s")).toEqual({ startUtf16: 12, endUtf16: 16 });
  });

  it("refuses empty and table-whitespace-only needles before exact matching", () => {
    expect(locateQuote("alpha beta", " ")).toBeNull();
    expect(locateQuote("alpha\t\nbeta", "\t\n")).toBeNull();
    expect(locateQuote("alpha", "")).toBeNull();
  });

  const located: ReadonlyArray<readonly [string, string, string, number, number]> = [
    ["curly quotes", "Say “yes” now", 'Say "yes" now', 0, 13],
    ["em dash", "alpha—beta", "alpha-beta", 0, 10],
    ["en dash", "alpha–beta", "alpha-beta", 0, 10],
    ["doubled spaces", "a  b", "a b", 0, 4],
    ["tab", "a\tb", "a b", 0, 3],
    ["single line feed", "a\nb", "a b", 0, 3],
    ["verbatim paragraph", "a\n\nb", "a\n\nb", 0, 4],
    ["trailing canonical space", "alpha  beta next", "alpha beta ", 0, 11],
    ["astral prefix", "😀 “yes”", '😀 "yes"', 0, 8],
    ["combining-mark neighbour", "q́—z", "q́-z", 0, 4],
    ["mixed paragraph run", "Start —\n\nfinish", "Start -\n\nfinish", 0, 15],
  ];

  for (const [name, content, needle, startUtf16, endUtf16] of located) {
    it(`maps the original literal slice for ${name}`, () => {
      if (content !== needle) expect(content.indexOf(needle)).toBe(-1);
      const result = locateQuote(content, needle);
      expect(result).toEqual({ startUtf16, endUtf16 });
      expect(content.slice(startUtf16, endUtf16)).toBe(content.slice(result!.startUtf16, result!.endUtf16));
    });
  }

  const refused = [
    ["space cannot replace a paragraph", "a\n\nb", "a b"],
    ["paragraph cannot replace U+2029", "a\u2029b", "a\n\nb"],
    ["case", "Alpha", "alpha"],
    ["comma", "alpha, beta", "alpha beta"],
    ["full stop", "alpha.beta", "alphabeta"],
    ["paraphrase", "quick brown fox", "fast brown fox"],
    ["NBSP", "a\u00a0b", "a b"],
  ] as const;
  for (const [name, content, needle] of refused) {
    it(`refuses ${name}`, () => {
      expect(content.indexOf(needle)).toBe(-1);
      expect(canon(content).indexOf(canon(needle))).toBe(-1);
      expect(locateQuote(content, needle)).toBeNull();
    });
  }

  const EXPECTED_CANON_FOLDS: Readonly<Record<string, string>> = Object.freeze({
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u0020": " ",
    "\u0009": " ",
    "\u000a": " ",
  });

  it("folds exactly the independently pinned table over every Unicode scalar value", () => {
    expect(CANON_CODE_POINT_TABLE).toEqual(EXPECTED_CANON_FOLDS);
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const point = String.fromCodePoint(cp);
      const expected = EXPECTED_CANON_FOLDS[point] ?? point;
      expect(canon(`a${point}b`)).toBe(`a${expected}b`);
    }
  });

  it("contains no broad whitespace class or trim call in the canonicaliser", () => {
    const source = readFileSync(ASSEMBLE_PATH, "utf8");
    const start = source.indexOf("function canonWithPositions");
    const end = source.indexOf("function defaultMapBack");
    const body = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(body).not.toContain("\\s");
    expect(body).not.toContain(".trim(");
  });

  it("generatively maps picked ranges through parseVoiceReply and preserves original evidence", () => {
    const substitutions: ReadonlyArray<readonly [string, string]> = [
      ["'", "’"],
      ['"', "“"],
      ["-", "—"],
      [" word", "\tword"],
      [" word", "  word"],
      ["\n\n", " \n \n"],
    ];
    const alphabet = [
      "plain!", "'\"- \t\n\n", "’“”—", "😀", "q\u0301",
      "\u00a0", "\u2028", "\u2029", "\u3000", "\ufeff", "«", "„",
      "\u2032", "\u02bc", "\uff07", "\u00b4", "\u2212", "\u200b", "\u00ad",
    ];
    let qualifying = 0;
    for (let i = 0; i < 72; i += 1) {
      const [from, to] = substitutions[i % substitutions.length];
      const target = `Alpha's "note"-${i} q\u0301 word\n\nnext`.normalize("NFC");
      const post = `${alphabet[i % alphabet.length]} prefix ${target} suffix ${alphabet[(i + 7) % alphabet.length]}`.normalize("NFC");
      const startUtf16 = post.indexOf(target);
      const endUtf16 = startUtf16 + target.length;
      expect(startUtf16).toBeGreaterThan(-1);
      expect(target[0]).not.toMatch(/[ \t\n]/u);
      expect(target.at(-1)).not.toMatch(/[ \t\n]/u);
      const needle = target.replace(from, to);
      if (post.indexOf(needle) !== -1) continue;
      if (canon(post).indexOf(canon(needle)) !== canon(post).lastIndexOf(canon(needle))) continue;
      qualifying += 1;
      const result = locateQuote(post, needle);
      expect(result).toEqual({ startUtf16, endUtf16 });
      const parsed = parseVoiceReply({
        text: reply([field("register", [cite("plain", "post-1", needle)])]),
        fields: SINGLE,
        posts: [{ id: "post-1", content: post }],
      });
      const evidence = parsed[0].values[0].evidence!;
      expect(evidence).toEqual({
        inputId: "post-1",
        quote: target,
        startUtf16,
        endUtf16,
      });
      expect(post.slice(evidence.startUtf16, evidence.endUtf16)).toBe(evidence.quote);
      expect(locateQuote(post, evidence.quote)).toEqual({ startUtf16, endUtf16 });
    }
    expect(qualifying).toBeGreaterThanOrEqual(20);
  });

  it("refuses generated case, punctuation and must-not-fold mutations", () => {
    const mustNotFold = ["\u00a0", "\u2028", "\u2029", "\u3000", "\ufeff", "\u2032", "\u02bc", "\uff07", "\u00b4", "\u2212", "\u200b", "\u00ad"];
    for (let i = 0; i < 24; i += 1) {
      const original = `Alpha-${i}-beta`;
      const content = `😀 prefix ${original} suffix`;
      const mutations = [
        `alpha-${i}-beta`,
        `Alpha${i}-beta`,
        `Alpha-${i}${mustNotFold[i % mustNotFold.length]}-beta`,
      ];
      for (const needle of mutations) {
        expect(content.indexOf(needle)).toBe(-1);
        expect(canon(content).indexOf(canon(needle))).toBe(-1);
        expect(locateQuote(content, needle)).toBeNull();
        expect(
          caughtKind(() => parseVoiceReply({
            text: reply([field("register", [cite("plain", "post-1", needle)])]),
            fields: SINGLE,
            posts: [{ id: "post-1", content }],
          }))
        ).toBe("quote_not_found");
      }
    }
  });
});

describe("canonical map-back postcondition", () => {
  const content = "\u{1f600} a-b tail";
  const needle = "a\u2013b";
  const cases: ReadonlyArray<
    readonly [string, string, string, number, number, boolean?]
  > = [
    ["negative", content, needle, -1, 6],
    ["fractional", content, needle, 3.5, 6],
    ["NaN", content, needle, Number.NaN, 6],
    ["infinite", content, needle, 3, Number.POSITIVE_INFINITY],
    ["empty", content, needle, 3, 3],
    ["reversed", content, needle, 6, 3],
    ["over-end", content, needle, 3, content.length + 1],
    ["start shifted", content, needle, 4, 6],
    ["end into non-whitespace", "a-bx", "a\u2013b", 0, 4, false],
    ["end into whitespace", "a-b tail", "a\u2013b", 0, 4, true],
    ["split-surrogate end", "a-b\u{1f600}", "a\u2013b\ud83d", 0, 4, true],
    ["split-surrogate start", "\u{1f600}a-b", "\ude00a\u2013b", 1, 5, true],
  ];
  for (const [name, caseContent, caseNeedle, start, end, canonicallyEqual] of cases) {
    it(`rejects ${name}`, () => {
      expect(caseContent.indexOf(caseNeedle), `${name}: exact miss`).toBe(-1);
      if (canonicallyEqual !== undefined) {
        expect(
          canon(caseContent.slice(start, end)) === canon(caseNeedle),
          `${name}: canonical equality`
        ).toBe(canonicallyEqual);
      }
      expect(acceptCanonicalMatch(caseContent, caseNeedle, start, end)).toBe(false);
    });
  }
  it("accepts the correct literal range", () => {
    expect(acceptCanonicalMatch(content, needle, 3, 6)).toBe(true);
  });

  const injected: ReadonlyArray<
    readonly [
      string,
      string,
      string,
      { startUtf16: number; endUtf16: number },
      boolean?,
    ]
  > = [
    ["negative", "a-b", "a\u2013b", { startUtf16: -1, endUtf16: 3 }],
    ["fractional", "a-b", "a\u2013b", { startUtf16: 0.5, endUtf16: 3 }],
    ["NaN", "a-b", "a\u2013b", { startUtf16: Number.NaN, endUtf16: 3 }],
    ["infinite", "a-b", "a\u2013b", { startUtf16: 0, endUtf16: Number.POSITIVE_INFINITY }],
    ["empty", "a-b", "a\u2013b", { startUtf16: 0, endUtf16: 0 }],
    ["reversed", "a-b", "a\u2013b", { startUtf16: 3, endUtf16: 0 }],
    ["over-end", "a-b", "a\u2013b", { startUtf16: 0, endUtf16: 4 }],
    ["end into non-whitespace", "a-bx", "a\u2013b", { startUtf16: 0, endUtf16: 4 }, false],
    ["end into whitespace", "a-b tail", "a\u2013b", { startUtf16: 0, endUtf16: 4 }, true],
    ["split-surrogate end", "a-b\u{1f600}", "a\u2013b\ud83d", { startUtf16: 0, endUtf16: 4 }, true],
    ["split-surrogate start", "\u{1f600}a-b", "\ude00a\u2013b", { startUtf16: 1, endUtf16: 5 }, true],
  ];
  for (const [name, caseContent, caseNeedle, range, canonicallyEqual] of injected) {
    it(`surfaces injected ${name} as quote_not_found`, () => {
      expect(caseContent.indexOf(caseNeedle), `${name}: exact miss`).toBe(-1);
      expect(
        canon(caseContent).indexOf(canon(caseNeedle)),
        `${name}: canonical match before map-back`
      ).toBeGreaterThanOrEqual(0);
      if (canonicallyEqual !== undefined) {
        expect(
          canon(caseContent.slice(range.startUtf16, range.endUtf16)) ===
            canon(caseNeedle),
          `${name}: mapped slice canonical equality`
        ).toBe(canonicallyEqual);
      }
      const mapBack: MapBack = () => range;
      const kind = caughtKind(() => parseVoiceReply({
        text: reply([field("register", [cite("plain", "post-1", caseNeedle)])]),
        fields: SINGLE,
        posts: [{ id: "post-1", content: caseContent }],
        mapBack,
      }));
      expect(kind).toBe("quote_not_found");
    });
  }
  it("stores the creator's original bytes for a correct injected range", () => {
    const content = "a-b";
    const needle = "a–b";
    const fields = parseVoiceReply({
      text: reply([field("register", [cite("plain", "post-1", needle)])]),
      fields: SINGLE,
      posts: [{ id: "post-1", content }],
      mapBack: () => ({ startUtf16: 0, endUtf16: 3 }),
    });
    expect(fields[0].values[0].evidence).toEqual({
      inputId: "post-1",
      quote: "a-b",
      startUtf16: 0,
      endUtf16: 3,
    });
  });
});

type ContainmentFinding = { file: string; reason: string };

function mapperContainment(files: ReadonlyArray<readonly [string, string]>): ContainmentFinding[] {
  const findings: ContainmentFinding[] = [];
  type SeamTarget = "locateQuote" | "parseVoiceReply";
  let forwarding = 0;
  let locateDeclaration = 0;
  let parseDeclaration = 0;
  let parseParameterBinding = 0;
  let inferVoiceParseWithoutOverride = 0;

  for (const [file, source] of files) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const isInjectionTest = file.replaceAll("\\", "/").includes("packages/llm/tests/");
    const aliases = new Map<string, SeamTarget>();
    const namespaceAliases = new Set<string>();
    const seamNamespaceAliases = new Set<string>();
    const isSeamNamespaceModule = (moduleName: string): boolean => {
      if (moduleName === "@respin/llm" || moduleName.startsWith("@respin/llm/")) return true;
      if (!moduleName.startsWith(".")) return false;
      const modulePath = resolve(dirname(file), moduleName);
      return modulePath === LLM_ROOT || modulePath.startsWith(`${LLM_ROOT}${sep}`);
    };
    const visitImports = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
        const moduleName = ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : "";
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            if (imported === "locateQuote" || imported === "parseVoiceReply") aliases.set(element.name.text, imported);
          }
        } else {
          const namespaceName = node.importClause.namedBindings.name.text;
          namespaceAliases.add(namespaceName);
          if (isSeamNamespaceModule(moduleName)) {
            seamNamespaceAliases.add(namespaceName);
          }
        }
      }
      ts.forEachChild(node, visitImports);
    };
    visitImports(parsed);
    if (resolve(file) === ASSEMBLE_PATH) {
      aliases.set("locateQuote", "locateQuote");
      aliases.set("parseVoiceReply", "parseVoiceReply");
    }

    const propertyName = (property: ts.ObjectLiteralElementLike): string | null => {
      if (ts.isSpreadAssignment(property)) return null;
      const name = property.name;
      if (!name) return null;
      if (ts.isComputedPropertyName(name)) {
        return ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression)
          ? name.expression.text
          : null;
      }
      return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
        ? name.text
        : null;
    };
    const unwrapExpression = (expression: ts.Expression): ts.Expression => {
      let current = expression;
      while (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isNonNullExpression(current) ||
        ts.isSatisfiesExpression(current)
      ) {
        current = current.expression;
      }
      return current;
    };
    const namespaceMemberTarget = (expression: ts.Expression): SeamTarget | undefined => {
      const unwrapped = unwrapExpression(expression);
      if (
        ts.isPropertyAccessExpression(unwrapped) &&
        ts.isIdentifier(unwrapExpression(unwrapped.expression)) &&
        namespaceAliases.has((unwrapExpression(unwrapped.expression) as ts.Identifier).text) &&
        (unwrapped.name.text === "locateQuote" ||
          unwrapped.name.text === "parseVoiceReply")
      ) {
        return unwrapped.name.text;
      }
      if (
        ts.isElementAccessExpression(unwrapped) &&
        ts.isIdentifier(unwrapExpression(unwrapped.expression)) &&
        namespaceAliases.has((unwrapExpression(unwrapped.expression) as ts.Identifier).text) &&
        unwrapped.argumentExpression &&
        (ts.isStringLiteral(unwrapped.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(unwrapped.argumentExpression)) &&
        (unwrapped.argumentExpression.text === "locateQuote" ||
          unwrapped.argumentExpression.text === "parseVoiceReply")
      ) {
        return unwrapped.argumentExpression.text;
      }
      return undefined;
    };
    const callTarget = (
      expression: ts.LeftHandSideExpression
    ): SeamTarget | undefined => {
      const unwrapped = unwrapExpression(expression);
      if (ts.isIdentifier(unwrapped)) return aliases.get(unwrapped.text);
      return namespaceMemberTarget(unwrapped);
    };
    const directCallForReference = (
      node: ts.Node,
      target: SeamTarget,
    ): ts.CallExpression | undefined => {
      let current = node;
      while (
        current.parent &&
        (ts.isParenthesizedExpression(current.parent) ||
          ts.isAsExpression(current.parent) ||
          ts.isTypeAssertionExpression(current.parent) ||
          ts.isNonNullExpression(current.parent) ||
          ts.isSatisfiesExpression(current.parent)) &&
        current.parent.expression === current
      ) {
        current = current.parent;
      }
      if (
        current.parent &&
        ts.isCallExpression(current.parent) &&
        current.parent.expression === current &&
        callTarget(current.parent.expression) === target
      ) {
        return current.parent;
      }
      return undefined;
    };
    const isNonReferenceIdentifier = (node: ts.Identifier): boolean => {
      const parent = node.parent;
      return (
        (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node)
      );
    };
    const isUnresolvableSeamNamespaceMember = (node: ts.Node): boolean => {
      if (!ts.isElementAccessExpression(node)) return false;
      const owner = unwrapExpression(node.expression);
      if (!ts.isIdentifier(owner) || !seamNamespaceAliases.has(owner.text)) return false;
      const argument = node.argumentExpression;
      return !argument || (
        !ts.isStringLiteral(argument) &&
        !ts.isNoSubstitutionTemplateLiteral(argument)
      );
    };
    const isStaticNamespaceMemberOwner = (node: ts.Identifier): boolean => {
      let current: ts.Node = node;
      while (
        current.parent &&
        (ts.isParenthesizedExpression(current.parent) ||
          ts.isAsExpression(current.parent) ||
          ts.isTypeAssertionExpression(current.parent) ||
          ts.isNonNullExpression(current.parent) ||
          ts.isSatisfiesExpression(current.parent)) &&
        current.parent.expression === current
      ) {
        current = current.parent;
      }
      const parent = current.parent;
      if (!parent) return false;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === current) return true;
      return (
        ts.isElementAccessExpression(parent) &&
        parent.expression === current &&
        parent.argumentExpression !== undefined &&
        (ts.isStringLiteral(parent.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(parent.argumentExpression))
      );
    };
    const enclosingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => {
      let parent = node.parent;
      while (parent) {
        if (ts.isFunctionLike(parent)) return parent;
        parent = parent.parent;
      }
      return undefined;
    };
    const validParseBindings = new Set<ts.FunctionDeclaration>();
    const hasUnchangedMapBackBinding = (node: ts.FunctionDeclaration): boolean => {
      if (!node.body || !ts.isIdentifier(node.parameters[0]?.name)) return false;
      const parameterName = node.parameters[0].name.text;
      const bindings: ts.Node[] = [];
      let expected: ts.BindingElement | undefined;
      let expectedDeclaration: ts.VariableDeclaration | undefined;
      const collect = (candidate: ts.Node): void => {
        if (
          (ts.isBindingElement(candidate) ||
            ts.isVariableDeclaration(candidate) ||
            ts.isParameter(candidate) ||
            ts.isFunctionDeclaration(candidate) ||
            ts.isClassDeclaration(candidate) ||
            ts.isEnumDeclaration(candidate)) &&
          candidate.name !== undefined &&
          ts.isIdentifier(candidate.name) &&
          candidate.name.text === "mapBack"
        ) {
          bindings.push(candidate);
        }
        // A declaration binds its name in the enclosing scope even though its
        // function body has a separate scope. Count that name before pruning
        // the body; a block function can shadow the forwarded const binding.
        if (candidate !== node && ts.isFunctionLike(candidate)) return;
        ts.forEachChild(candidate, collect);
      };
      collect(node.body);
      for (const statement of node.body.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
          continue;
        }
        for (const declaration of statement.declarationList.declarations) {
          if (
            !ts.isObjectBindingPattern(declaration.name) ||
            !declaration.initializer ||
            !ts.isIdentifier(declaration.initializer) ||
            declaration.initializer.text !== parameterName
          ) {
            continue;
          }
          for (const element of declaration.name.elements) {
            const sourceName = element.propertyName
              ? ts.isIdentifier(element.propertyName) ||
                ts.isStringLiteral(element.propertyName)
                ? element.propertyName.text
                : null
              : ts.isIdentifier(element.name)
                ? element.name.text
                : null;
            if (
              sourceName === "mapBack" &&
              ts.isIdentifier(element.name) &&
              element.name.text === "mapBack" &&
              element.initializer === undefined &&
              element.dotDotDotToken === undefined
            ) {
              expected = element;
              expectedDeclaration = declaration;
            }
          }
        }
      }
      if (
        expected === undefined ||
        expectedDeclaration === undefined ||
        bindings.length !== 1 ||
        bindings[0] !== expected
      ) {
        return false;
      }
      let unchangedParameterUse = false;
      let unsupportedParameterUse = false;
      const inspectParameterUses = (candidate: ts.Node): void => {
        if (
          ts.isIdentifier(candidate) &&
          candidate.text === parameterName &&
          !isNonReferenceIdentifier(candidate)
        ) {
          if (expectedDeclaration?.initializer === candidate) unchangedParameterUse = true;
          else unsupportedParameterUse = true;
        }
        ts.forEachChild(candidate, inspectParameterUses);
      };
      inspectParameterUses(node.body);
      return unchangedParameterUse && !unsupportedParameterUse;
    };
    const visit = (
      node: ts.Node,
      parseContext?: ts.FunctionDeclaration
    ): void => {
      let currentParse = parseContext;
      if (ts.isFunctionDeclaration(node) && node.name?.text === "locateQuote") {
        locateDeclaration += node.parameters.length === 3 && node.parameters[2].initializer ? 1 : 0;
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === "parseVoiceReply") {
        currentParse = node;
        parseDeclaration += source.slice(node.getStart(parsed), node.getEnd()).includes("mapBack?: MapBack") ? 1 : 0;
        if (hasUnchangedMapBackBinding(node)) {
          parseParameterBinding += 1;
          validParseBindings.add(node);
        }
      }
      if (!isInjectionTest) {
        if (ts.isIdentifier(node)) {
          const target = aliases.get(node.text);
          if (
            target &&
            !isNonReferenceIdentifier(node) &&
            directCallForReference(node, target) === undefined
          ) {
            findings.push({ file, reason: `escaped ${target} reference` });
          }
          if (
            seamNamespaceAliases.has(node.text) &&
            !isNonReferenceIdentifier(node) &&
            !isStaticNamespaceMemberOwner(node)
          ) {
            findings.push({ file, reason: "escaped seam namespace object" });
          }
        }
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const target = namespaceMemberTarget(node);
          if (target && directCallForReference(node, target) === undefined) {
            findings.push({ file, reason: `escaped ${target} namespace reference` });
          } else if (isUnresolvableSeamNamespaceMember(node)) {
            findings.push({ file, reason: "unresolvable seam namespace member" });
          }
        }
      }
      if (ts.isCallExpression(node)) {
        const target = callTarget(node.expression);
        if (target === "locateQuote" && !isInjectionTest) {
          if (node.arguments.some(ts.isSpreadElement)) findings.push({ file, reason: "spread locateQuote call" });
          if (node.arguments.length >= 3) {
            const allowed =
              resolve(file) === ASSEMBLE_PATH &&
              currentParse !== undefined &&
              enclosingFunction(node) === currentParse &&
              validParseBindings.has(currentParse) &&
              ts.isIdentifier(node.expression) &&
              node.expression.text === "locateQuote" &&
              node.questionDotToken === undefined &&
              node.arguments.length === 3 &&
              ts.isIdentifier(node.arguments[0]) &&
              node.arguments[0].text === "content" &&
              ts.isPropertyAccessExpression(node.arguments[1]) &&
              ts.isIdentifier(node.arguments[1].expression) &&
              node.arguments[1].expression.text === "v" &&
              node.arguments[1].name.text === "quote" &&
              ts.isIdentifier(node.arguments[2]) &&
              node.arguments[2].text === "mapBack";
            if (allowed) forwarding += 1;
            else findings.push({ file, reason: "supplied locateQuote mapper" });
          }
        }
        if (target === "parseVoiceReply" && !isInjectionTest) {
          if (node.arguments.some(ts.isSpreadElement)) findings.push({ file, reason: "spread parseVoiceReply call" });
          const first = node.arguments[0];
          if (!first || !ts.isObjectLiteralExpression(first)) {
            findings.push({ file, reason: "unresolvable parseVoiceReply arguments" });
          } else if (
            first.properties.some(
              (property) =>
                // Only plain data properties are argument fields. An accessor
                // or method carries a body that runs with `this` bound to the
                // params object, so a getter can define `mapBack` on it before
                // the seam destructures — the batch-2 getter injection.
                !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) ||
                propertyName(property) === null ||
                propertyName(property) === "mapBack" ||
                // `__proto__:` in a literal sets the prototype, and the seam's
                // destructure reads through the prototype chain.
                propertyName(property) === "__proto__",
            )
          ) {
            findings.push({ file, reason: "supplied parseVoiceReply mapper" });
          } else if (file.replaceAll("\\", "/").endsWith("/packages/credits/src/infer-voice.ts")) {
            inferVoiceParseWithoutOverride += 1;
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, currentParse));
    };
    visit(parsed);
  }

  if (forwarding !== 1) findings.push({ file: "assemble.ts", reason: `expected one forwarding call, saw ${forwarding}` });
  if (locateDeclaration !== 1) findings.push({ file: "assemble.ts", reason: "locateQuote seam declaration missing" });
  if (parseDeclaration !== 1) findings.push({ file: "assemble.ts", reason: "parseVoiceReply seam declaration missing" });
  if (parseParameterBinding !== 1) findings.push({ file: "assemble.ts", reason: "parseVoiceReply mapper is not the unchanged params.mapBack binding" });
  if (inferVoiceParseWithoutOverride !== 1) findings.push({ file: "infer-voice.ts", reason: `expected one normal production caller, saw ${inferVoiceParseWithoutOverride}` });
  return findings;
}

describe("mapper containment", () => {
  const trackedSources = async (): Promise<Array<readonly [string, string]>> => {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", REPO_ROOT, "ls-files", "--", "respin/**/*.ts", "respin/**/*.tsx"],
      { encoding: "utf8" },
    );
    const listed = stdout.split(/\r?\n/u).filter(Boolean);
    return listed.map((relative) => [resolve(REPO_ROOT, relative), readFileSync(resolve(REPO_ROOT, relative), "utf8")] as const);
  };

  it("permits only the internal forwarding call and test injection", async () => {
    expect(mapperContainment(await trackedSources())).toEqual([]);
  });

  const plants = [
    ["credits override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["namespace override", "import * as voice from '@respin/llm'; voice.parseVoiceReply({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["parenthesized namespace override", "import * as voice from '@respin/llm'; (voice.parseVoiceReply)({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["parenthesized alias override", "import { parseVoiceReply as parse } from '@respin/llm'; ((parse))({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["as-wrapped alias override", "import { parseVoiceReply } from '@respin/llm'; (parseVoiceReply as any)({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["non-null alias override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply!({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["satisfies-wrapped alias override", "import { parseVoiceReply } from '@respin/llm'; (parseVoiceReply satisfies Function)({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["template namespace override", "import * as voice from '@respin/llm'; voice[`parseVoiceReply`]({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["dynamic namespace override", "import * as voice from '@respin/llm'; const key='parseVoiceReply'; voice[key]({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["namespace object alias escape", "import * as voice from '@respin/llm'; const api=voice; api.parseVoiceReply({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["relative namespace object alias escape", "import * as voice from '../../llm/src/index'; const api=voice; api.parseVoiceReply({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["namespace object destructure escape", "import * as voice from '@respin/llm'; const {parseVoiceReply: parse}=voice; parse({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["namespace object argument escape", "import * as voice from '@respin/llm'; consume(voice);"],
    ["namespace reference escape", "import * as voice from '@respin/llm'; const parse=voice.parseVoiceReply; parse({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["imported reference escape", "import { parseVoiceReply } from '@respin/llm'; const parse=parseVoiceReply; parse({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["third argument", "import { locateQuote } from '@respin/llm'; locateQuote('a','a',()=>({startUtf16:0,endUtf16:1}));"],
    ["parenthesized third argument", "import { locateQuote } from '@respin/llm'; (locateQuote)('a','a',()=>({startUtf16:0,endUtf16:1}));"],
    ["template namespace third argument", "import * as voice from '@respin/llm'; voice[`locateQuote`]('a','a',()=>({startUtf16:0,endUtf16:1}));"],
    ["aliased override", "import { parseVoiceReply as parse } from '@respin/llm'; parse({text:'',fields:[],posts:[],mapBack:()=>({startUtf16:0,endUtf16:1})});"],
    ["spread override", "import { parseVoiceReply } from '@respin/llm'; const x={mapBack:()=>({startUtf16:0,endUtf16:1})}; parseVoiceReply({...x,text:'',fields:[],posts:[]});"],
    ["quoted-key override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',fields:[],posts:[],'mapBack':()=>({startUtf16:0,endUtf16:1})});"],
    ["dynamic-key override", "import { parseVoiceReply } from '@respin/llm'; const k='mapBack'; parseVoiceReply({text:'',fields:[],posts:[],[k]:()=>({startUtf16:0,endUtf16:1})});"],
    // Batch-2 held-out getter injection: the accessor's name is an ordinary
    // field, but its body defines the mapper on `this` before the seam reads it.
    ["getter-defined override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({get text(){Object.defineProperty(this,'mapBack',{value:()=>({startUtf16:0,endUtf16:1})});return '';},fields:[],posts:[]});"],
    ["setter-bearing override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',set fields(v){Object.defineProperty(this,'mapBack',{value:()=>({startUtf16:0,endUtf16:1})});},posts:[]});"],
    ["method override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',fields:[],posts:[],mapBack(){return {startUtf16:0,endUtf16:1};}});"],
    ["method-shaped field", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text(){return '';},fields:[],posts:[]});"],
    ["prototype override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',fields:[],posts:[],__proto__:{mapBack:()=>({startUtf16:0,endUtf16:1})}});"],
    ["quoted prototype override", "import { parseVoiceReply } from '@respin/llm'; parseVoiceReply({text:'',fields:[],posts:[],'__proto__':{mapBack:()=>({startUtf16:0,endUtf16:1})}});"],
  ] as const;
  for (const [name, source] of plants) {
    it(`rejects the ${name} plant`, async () => {
      expect(mapperContainment([...(await trackedSources()), [resolve(RESPIN_ROOT, `packages/credits/src/${name}.ts`), source]])).not.toEqual([]);
    });
  }

  const bindingPlants = [
    [
      "defaulted mapper binding",
      "const { text, fields, posts, mapBack = () => ({ startUtf16: 0, endUtf16: 1 }) } = params;",
    ],
    [
      "writable mapper binding",
      "let { text, fields, posts, mapBack } = params;",
    ],
    [
      "local mapper replacing the parameter-derived binding",
      "const { text, fields, posts, mapBack: suppliedMapBack } = params;\n" +
        "  const mapBack: MapBack = () => ({ startUtf16: 0, endUtf16: 1 });\n" +
        "  void suppliedMapBack;",
    ],
    [
      "parameter reassignment before binding",
      "params = { ...params, mapBack: () => ({ startUtf16: 0, endUtf16: 1 }) };\n" +
        "  const { text, fields, posts, mapBack } = params;",
    ],
    [
      "parameter property mutation before binding",
      "params.mapBack = () => ({ startUtf16: 0, endUtf16: 1 });\n" +
        "  const { text, fields, posts, mapBack } = params;",
    ],
    [
      "parameter computed-property mutation before binding",
      "params[`mapBack`] = () => ({ startUtf16: 0, endUtf16: 1 });\n" +
        "  const { text, fields, posts, mapBack } = params;",
    ],
    [
      "parameter alias before binding",
      "const paramsAlias = params;\n" +
        "  const { text, fields, posts, mapBack } = params;\n" +
        "  void paramsAlias;",
    ],
    [
      "parameter escape before binding",
      "escape(params);\n" +
        "  const { text, fields, posts, mapBack } = params;",
    ],
    [
      "parameter closure escape before binding",
      "const leak = () => params;\n" +
        "  const { text, fields, posts, mapBack } = params;\n" +
        "  void leak;",
    ],
  ] as const;
  for (const [name, replacement] of bindingPlants) {
    it(`rejects the ${name} plant`, async () => {
      let planted = false;
      const sources = (await trackedSources()).map(([file, source]) => {
        if (resolve(file) !== ASSEMBLE_PATH) return [file, source] as const;
        const original = "const { text, fields, posts, mapBack } = params;";
        expect(source).toContain(original);
        planted = true;
        return [file, source.replace(original, replacement)] as const;
      });
      expect(planted).toBe(true);
      expect(mapperContainment(sources)).not.toEqual([]);
    });
  }

  const shadowDeclarations = [
    ["block function", "function mapBack() { return { startUtf16: 0, endUtf16: 0 }; }", false],
    ["hoisted block function", "function mapBack() { return { startUtf16: 0, endUtf16: 0 }; }", true],
    ["async block function", "async function mapBack() { return { startUtf16: 0, endUtf16: 0 }; }", false],
    ["generator block function", "function* mapBack() { yield { startUtf16: 0, endUtf16: 0 }; }", false],
    ["block class", "class mapBack {}", false],
    ["block enum", "enum mapBack { startUtf16, endUtf16 }", false],
  ] as const;
  for (const [name, declaration, afterCall] of shadowDeclarations) {
    it(`rejects the ${name} mapper shadow plant`, async () => {
      const sources = (await trackedSources()).map(([file, source]) => {
        if (resolve(file) !== ASSEMBLE_PATH) return [file, source] as const;
        const binding = "const { text, fields, posts, mapBack } = params;";
        const call = "const at = locateQuote(content, v.quote, mapBack);";
        expect(source).toContain(binding);
        expect(source).toContain(call);
        return [file, source.replace(binding, `${binding}\n  void mapBack;`).replace(
          call,
          afterCall ? `${call}\n      ${declaration}` : `${declaration}\n      ${call}`,
        )] as const;
      });
      expect(mapperContainment(sources)).toContainEqual({
        file: "assemble.ts",
        reason: "parseVoiceReply mapper is not the unchanged params.mapBack binding",
      });
    });
  }

  it("allows unrelated nested mapper bindings without mistaking methods for declarations", async () => {
    const sources = (await trackedSources()).map(([file, source]) => {
      if (resolve(file) !== ASSEMBLE_PATH) return [file, source] as const;
      const binding = "const { text, fields, posts, mapBack } = params;";
      expect(source).toContain(binding);
      return [file, source.replace(binding, `${binding}\n` +
        "  function unrelated(mapBack: MapBack) { return mapBack; }\n" +
        "  const helper = { mapBack() { return 0; } };\n" +
        "  void unrelated; void helper;")] as const;
    });
    expect(mapperContainment(sources)).toEqual([]);
  });

  const forwardingPlants = [
    ["wrapped forwarding call", "(locateQuote)(content, v.quote, mapBack)"],
    ["different forwarding content", "locateQuote(v.quote, v.quote, mapBack)"],
    ["different forwarding quote", "locateQuote(content, content, mapBack)"],
    ["extra forwarding argument", "locateQuote(content, v.quote, mapBack, undefined)"],
  ] as const;
  for (const [name, replacement] of forwardingPlants) {
    it(`rejects the ${name} plant`, async () => {
      let planted = false;
      const sources = (await trackedSources()).map(([file, source]) => {
        if (resolve(file) !== ASSEMBLE_PATH) return [file, source] as const;
        const original = "locateQuote(content, v.quote, mapBack)";
        expect(source).toContain(original);
        planted = true;
        return [file, source.replace(original, replacement)] as const;
      });
      expect(planted).toBe(true);
      expect(mapperContainment(sources)).not.toEqual([]);
    });
  }
});
