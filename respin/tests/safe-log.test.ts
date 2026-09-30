// The PII control's own tests.
//
// `safe-log.ts` shipped with none (production gate round 2, 2026-08-27). Its
// own docstring said it returns a plain object "so it is a pure function a test
// can drive — the leak it prevents is invisible to a test that can only assert
// on `console.error`", and then no test drove it: a weakening edit (adding
// `detail: err.message` as a readability fallback, say) left the entry gate
// green. That is CLAUDE.md's 2026-07-30 lesson exactly — assert it in a test or
// delete the claim — applied to the module that exists because a creator's
// unpublished post was reaching the server log.
//
// THE FOREIGN-ERROR CASE USES A REAL `DrizzleQueryError`, produced by running a
// genuinely failing write through the INSTALLED driver, not a hand-rolled
// stand-in. The leak was a property of that class's message
// construction; a fake with the same shape would prove nothing about the
// version actually installed, and the live browser walk that first "confirmed"
// this module threw one of OUR classes, so the branch that matters was never
// exercised.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { isProbeArtifactSegment } from "./support/probe-artifacts";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";
import {
  createTestDb,
  onboardingInputs,
  ContentSchemaError,
  PostContentError,
  ProfileCapError,
  ProvenanceError,
  ReferenceEchoError,
} from "@respin/db";
import {
  NOT_A_LABEL,
  logRefusal,
  logSpend,
  safeLogFields,
  wireLabel,
} from "../app/(product)/safe-log";
import { PostCallDebitError } from "@respin/credits/app-server";

/** A payload standing in for a creator's unpublished post. */
const SECRET = "MY UNPUBLISHED POST: a caption about something private";

describe("safeLogFields — exception messages never cross the log boundary", () => {
  it("a real DrizzleQueryError leaks NOTHING, though its message carries the payload", async () => {
    const db = await createTestDb();
    let caught: unknown;
    try {
      // An INSERT that binds the payload and then fails on the composite
      // foreign key — the shape a real paste takes when anything goes wrong
      // underneath it. `drizzle-orm` is not a dependency of the app package
      // (deliberately), so the failure is produced through the sanctioned
      // `@respin/db` surface rather than by hand-building SQL.
      await db.insert(onboardingInputs).values({
        profileId: "00000000-0000-7000-8000-000000000000",
        workspaceId: "00000000-0000-7000-8000-000000000001",
        inputClass: "own_post",
        content: SECRET,
        contentSha256: "0".repeat(64),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught, "the probe query must actually fail").toBeDefined();

    // NON-VACUITY, and it is the whole point: prove the payload IS in the
    // error before proving it is NOT in what we log. Without this the test
    // passes just as well against a driver that never embedded it.
    expect(
      String((caught as Error).message),
      "the installed driver no longer embeds params — this test is now vacuous, re-derive it"
    ).toContain(SECRET);

    const fields = safeLogFields(caught);
    expect(JSON.stringify(fields)).not.toContain(SECRET);
    expect(fields, "a foreign message is never logged").not.toHaveProperty("detail");
    expect(fields.code).toBe("unknown");
    // `constructor.name`, because `DrizzleQueryError` never sets `this.name` —
    // `err.name` is the literal "Error", which told an operator nothing.
    expect(fields.errorName).toBe("DrizzleQueryError");
    expect(fields.errorName).not.toBe("Error");
    // ...and the driver's own code survives, which is what is actually
    // diagnosable (23503 = foreign key violation).
    expect(fields.driverCode).toBe("23503");
  });

  it("withholds messages even for one of our typed refusals", () => {
    const fields = safeLogFields(new PostContentError("it is blank"));
    expect(fields.code).toBe("post_content");
    expect(fields.errorName).toBe("PostContentError");
    expect(fields).not.toHaveProperty("detail");
  });

  it("keeps the stable class and code while withholding interpolated values", () => {
    const fields = safeLogFields(new ProfileCapError("free", 1, 1));
    expect(fields.code).toBe("profile_cap");
    expect(fields.errorName).toBe("ProfileCapError");
    expect(fields).not.toHaveProperty("detail");
  });

  it.each([
    ["reference echo", new ReferenceEchoError(`${SECRET}\nforged-log-line`)],
    ["content schema", new ContentSchemaError("voice", `${SECRET}\nforged-log-line`)],
    ["pointer provenance", new ProvenanceError(`/claim/${SECRET}\nforged-log-line`)],
  ])("withholds creator content and newlines from %s refusals", (_label, err) => {
    expect(err.message).toContain(SECRET);
    const fields = safeLogFields(err);
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("forged-log-line");
    expect(fields).not.toHaveProperty("detail");
  });

  it("a bare object carrying the payload as its message is still withheld", () => {
    // The shape a library that does not extend Error would produce.
    const fields = safeLogFields({ message: SECRET });
    expect(JSON.stringify(fields)).not.toContain(SECRET);
    expect(fields.errorName).toBe("UnknownObject");
    expect(fields).not.toHaveProperty("detail");
  });

  it("a plain Error is foreign too — extending Error is not authorship", () => {
    const fields = safeLogFields(new Error(SECRET));
    expect(JSON.stringify(fields)).not.toContain(SECRET);
    expect(fields.code).toBe("unknown");
    expect(fields).not.toHaveProperty("detail");
  });

  it("refuses hostile driver-code and constructor metadata", () => {
    const err = new Error("fixed message") as Error & {
      code: string;
      constructor: { name: string };
    };
    err.code = `${SECRET}\nforged-log-line`;
    Object.defineProperty(err, "constructor", {
      value: { name: `${SECRET}\nforged-log-line` },
    });

    const fields = safeLogFields(err);
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("forged-log-line");
    expect(fields.errorName).toBe("Error");
    expect(fields).not.toHaveProperty("driverCode");
  });

  it("keeps only a closed five-character PostgreSQL driver code", () => {
    expect(safeLogFields({ code: "40P01" }).driverCode).toBe("40P01");
    expect(safeLogFields({ cause: { code: "23505" } }).driverCode).toBe("23505");
    expect(safeLogFields({ code: "23505\nsecret" })).not.toHaveProperty(
      "driverCode"
    );
  });

  it("degrades rather than throwing on the shapes a catch block can receive", () => {
    for (const weird of [undefined, null, "a string", 42]) {
      expect(() => safeLogFields(weird)).not.toThrow();
      expect(safeLogFields(weird).code).toBe("unknown");
    }
  });
});

describe("the rule is enforced, not merely conventional (source scan)", () => {
  // `safe-log.ts`'s own docblock claimed "one call site shape, so the rule
  // cannot be applied in one file and forgotten in the next" while nine
  // `console.error(prefix, err)` sites survived elsewhere in `app/**`
  // (production gate round 2, 2026-08-27). None of them bound creator
  // free-text, so it was a control gap rather than a live leak — but nothing
  // kept the next one out, and this repo already owns the instrument shape
  // (`tests/action-gate.test.ts` scans `app/**` for a sibling rule).
  /**
   * An error OBJECT passed as a logged argument.
   *
   * NOT A REGEX OVER THE ARGUMENT TEXT, and that is a measured correction
   * rather than a preference. This scan read
   * `console\.(?:error|warn|log)\s*\([^;]{0,200}?,\s*(?:err|error|e)\s*[,)]`
   * until 2026-09-21. `[^;]` was chosen so the match could not span statements
   * — but a semicolon inside the FIRST ARGUMENT stops it just as dead, so
   *
   *     console.warn("[x] threw; ignoring", err)
   *
   * was invisible to a scan written to catch exactly that call. A character
   * class cannot tell a statement terminator from a semicolon inside a string,
   * so the bound is not tightened here; the argument list is READ instead.
   *
   * Reading the call's own parentheses cannot fail open on any character: the
   * scan finds `console.error(`, walks to its matching `)` through strings,
   * templates and nested calls, splits the arguments at top-level commas, and
   * asks whether any argument is a BARE error identifier. `{ digest:
   * error.digest }` is a property read and stays sanctioned; `err` alone is
   * the leak (a DrizzleQueryError's message embeds the bound query parameters,
   * which on the intake path is the creator's post text).
   */
  const ERROR_IDENTIFIER = /^(?:err|error|e)$/;

  /** The index just past the `)` that closes the `(` at `open`, or -1. */
  const closingParen = (src: string, open: number): number => {
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        // Skip the whole literal — a `)` or `,` inside it is text, not syntax.
        const quote = c;
        i += 1;
        for (; i < src.length; i += 1) {
          if (src[i] === "\\") i += 1;
          else if (src[i] === quote) break;
          else if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
            const end = closingBrace(src, i + 1);
            if (end < 0) return -1;
            i = end;
          }
        }
        continue;
      }
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };

  /** The index of the `}` closing the `${` whose `{` is at `open`. */
  const closingBrace = (src: string, open: number): number => {
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };

  /** The call's arguments, split at commas that are not inside anything. */
  const topLevelArgs = (args: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < args.length; i += 1) {
      const c = args[i];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i += 1;
        for (; i < args.length; i += 1) {
          if (args[i] === "\\") i += 1;
          else if (args[i] === quote) break;
          else if (quote === "`" && args[i] === "$" && args[i + 1] === "{") {
            const end = closingBrace(args, i + 1);
            if (end < 0) break;
            i = end;
          }
        }
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      else if (c === "," && depth === 0) {
        out.push(args.slice(start, i));
        start = i + 1;
      }
    }
    out.push(args.slice(start));
    return out;
  };

  /**
   * Source with its comments blanked.
   *
   * THE SCAN READS CODE. A `console.warn(…, err)` quoted in a docblock that
   * EXPLAINS this rule is prose about the rule, not an instance of it — and it
   * is the first thing to appear once anybody documents the fix, which is
   * exactly what happened when `packages/credits/src/metrics.ts` gained the
   * comment naming its own repair. One alternation rather than two passes, so a
   * `/**` inside a `//` line cannot open a phantom block that swallows the code
   * after it (the shape `claim-scan.test.ts` pins for the same reason).
   */
  const blankComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) =>
      before === undefined ? " " : `${before} `
    );

  const logsRawError = (raw: string): boolean => {
    const src = blankComments(raw);
    const call = /console\s*\.\s*(?:error|warn|log)\s*\(/g;
    for (let m = call.exec(src); m !== null; m = call.exec(src)) {
      const open = call.lastIndex - 1;
      const close = closingParen(src, open);
      if (close < 0) continue;
      const args = topLevelArgs(src.slice(open + 1, close));
      // The FIRST argument is the prefix; an error identifier anywhere after it
      // is the leak. `console.error(err)` alone is one too.
      if (args.some((arg) => ERROR_IDENTIFIER.test(arg.trim()))) return true;
    }
    return false;
  };

  it("no production file logs a raw error object", () => {
    // THE SHARED ROOT LIST, NOT `app/` ALONE (P1-R6). This walked `app/` until
    // 2026-09-21, so `packages/`, `worker/`, `lib/` and `scripts/` were outside
    // a scan whose failure mode is a creator's post text in stdout.
    // `PRODUCTION_ROOTS` is asserted against `ROOT_DIRS` in
    // `claim-scan.test.ts`.
    const offenders = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter(({ file }) => !file.endsWith("safe-log.ts"))
      .filter(({ file }) => !file.split("/").some(isProbeArtifactSegment))
      .filter(({ text }) => logsRawError(text))
      .map(({ file }) => file);
    expect(
      offenders,
      "a raw error object reaches the log — a DrizzleQueryError's message embeds the bound query parameters, which on the intake path is the creator's post text. Use logRefusal from app/(product)/safe-log.ts"
    ).toEqual([]);
  });

  it("NON-VACUITY: the scan catches the shapes it claims to", () => {
    // A scan that finds nothing is indistinguishable from a scan that is
    // broken (CLAUDE.md 2026-08-21), so each shape is planted.
    for (const planted of [
      'console.error("[x] failed", err);',
      "console.error(`[x] refused (${code})`, err);",
      'console.error("[x]", error);',
      'console.warn("[x] odd", e);',
      // THE SEMICOLON CASE (P1-R6, AC4). The old `[^;]` bound stopped at the
      // `;` inside this prefix and reported the file clean.
      'console.warn("[x] threw; ignoring", err);',
      // ...and the same semicolon inside a TEMPLATE, plus a nested call and a
      // multi-line argument list — each of which the bounded class also lost.
      "console.error(`[x] threw; ignoring (${fmt(code)})`, err);",
      'console.error(\n  "[x] failed",\n  err\n);',
      // A single bare argument is a leak too.
      "console.error(err);",
    ]) {
      expect(logsRawError(planted), planted).toBe(true);
    }
    // ...and does not flag the sanctioned shapes.
    for (const fine of [
      'logRefusal("[x] failed", err);',
      'console.error("[x] failed", { digest: error.digest });',
      'console.error("[x] no args");',
      // A property read off the error is what the sanctioned shape looks like,
      // even when the identifier appears inside a nested call or a template.
      'console.error("[x]", String(err));',
      "console.error(`[x] ${err.message}`);",
      // An argument merely CONTAINING the identifier's letters is not it.
      'console.error("[x]", errors);',
      'console.error("[x]", err.digest);',
      // A COMMENT QUOTING THE VIOLATION IS NOT THE VIOLATION — and it is the
      // shape that appears the moment somebody documents this rule's own fix.
      '// console.error("[x] failed", err);',
      '/** …the identical `console.warn("… threw; ignoring", err)` line. */',
    ]) {
      expect(logsRawError(fine), fine).toBe(false);
    }
  });
});

describe("a spend log names WHO it happened to (production gate, 2026-08-28)", () => {
  // The gate's question was "a creator says they were charged and got nothing —
  // what in the logs answers that?" The answer was nothing: a refusal carried
  // `{code, errorName}` with no tenant and no attempt, and a SUCCESSFUL spend
  // wrote no line at all. `attemptId` is the join between what the vendor
  // charged us and what we charged them, and it never left the database.

  it("logRefusal carries the context ids alongside the safe fields", () => {
    const seen: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
      seen.push(a);
    });
    try {
      logRefusal("[t] refused", new PostCallDebitError("att-9", 0, 50), {
        workspaceId: "ws-1",
        profileId: "p-1",
        attemptId: "att-9",
      });
    } finally {
      spy.mockRestore();
    }
    const fields = seen[0][1] as Record<string, unknown>;
    expect(fields.workspaceId).toBe("ws-1");
    expect(fields.profileId).toBe("p-1");
    expect(fields.attemptId).toBe("att-9");
    // ...and it still carries what it always did.
    expect(fields.code).toBe("debit_refused_after_call");
    expect(fields.errorName).toBe("PostCallDebitError");
  });

  it("context CANNOT override the safe fields", () => {
    // A caller passing `{code: "fine"}` must not be able to relabel a refusal,
    // and one passing `{detail: ...}` must not be able to smuggle a message
    // past the no-exception-message rule. The safe fields are spread last.
    const seen: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
      seen.push(a);
    });
    try {
      logRefusal("[t]", new PostCallDebitError("att-9", 0, 50), {
        code: "looks_fine",
        errorName: "NotThis",
      } as never);
    } finally {
      spy.mockRestore();
    }
    const fields = seen[0][1] as Record<string, unknown>;
    expect(fields.code).toBe("debit_refused_after_call");
    expect(fields.errorName).toBe("PostCallDebitError");
  });

  it("logSpend records a COMPLETED run, which previously wrote nothing", () => {
    const seen: unknown[][] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...a) => {
      seen.push(a);
    });
    try {
      logSpend("[t] run completed", {
        workspaceId: "ws-1",
        attemptId: "att-9",
        creditsCharged: 50,
      });
    } finally {
      spy.mockRestore();
    }
    expect(seen).toHaveLength(1);
    const fields = seen[0][1] as Record<string, unknown>;
    expect(fields.attemptId).toBe("att-9");
    expect(fields.creditsCharged).toBe(50);
  });

  it("wireLabel clamps a WIRE value to a shape a log line may carry", () => {
    // THE CONTRACT `LogContext` STATES: "ONLY SERVER-DERIVED IDENTIFIERS BELONG
    // HERE… every call site passes ids". `/studio`'s generation action broke it
    // — it read `mode` off the `FormData` and logged it, so the
    // `UnknownModeError` path wrote whatever a POST carried. A hidden input is
    // a browser convenience; a server action is an endpoint.
    //
    // A PLAUSIBLE TYPO SURVIVES, because that is the whole diagnostic value: an
    // operator has to be able to tell "someone typed hookss" from "someone
    // posted 4kB".
    expect(wireLabel("hooks")).toBe("hooks");
    expect(wireLabel("hookss")).toBe("hookss");
    expect(wireLabel("footageToThesis")).toBe("footageToThesis");
    expect(wireLabel("source-to-reel")).toBe("source-to-reel");
    expect(wireLabel("full_script")).toBe("full_script");

    // EVERYTHING ELSE IS THE SENTINEL, NOT A TRUNCATION: a prefix of a hostile
    // string is still a leak, and 40 characters of a creator's pasted script is
    // exactly the thing this module exists to keep out of stdout.
    for (const hostile of [
      "",
      " ",
      "9hooks",
      "-hooks",
      "hooks mode",
      // LOG FORGERY: a newline lets a wire value invent a second log line.
      "hooks\n[studio-action] generation refused { forged: true }",
      "a".repeat(41),
      "I have been trying to lose the same 10 kilos since my daughter was born",
      '{"mode":"hooks"}',
      "../../etc/passwd",
      "<script>alert(1)</script>",
      "hooks\u0000",
      "hooks\u001b[31m",
      "モード",
    ]) {
      expect(wireLabel(hostile), JSON.stringify(hostile)).toBe(NOT_A_LABEL);
    }
    // The boundary is 40, and it is a real boundary rather than an approximate
    // one.
    expect(wireLabel("a".repeat(40))).toBe("a".repeat(40));
    expect(wireLabel("a".repeat(41))).toBe(NOT_A_LABEL);
    // The sentinel is not itself mistakable for a mode.
    expect(NOT_A_LABEL).not.toMatch(/^[a-z]+$/);
  });

  it("the studio action CLAMPS the wire mode, and no LogContext carries a raw one", () => {
    // The helper existing proves nothing about the call site — the defect was a
    // call site, not a missing capability.
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const actions = readFileSync(
      resolve(root, "app/(product)/studio/actions.ts"),
      "utf8"
    );
    expect(actions).toMatch(/mode: wireLabel\(mode\)/);
    // ...and the SUCCESS line uses the server's own value, which needs no clamp
    // because it came back from the operation.
    expect(actions).toMatch(/mode: result\.generation\.mode/);

    // THE CLASS, NOT THE INSTANCE (CLAUDE.md, 2026-08-29: a population written
    // as one path narrows silently the day a second appears). The population is
    // "every .ts/.tsx under app/", DERIVED by walking the tree rather than
    // listed, and the shape refused is a bare `mode,` shorthand inside any
    // logRefusal/logSpend context — which is exactly the shape the defect had.
    // REGEXP LITERALS, never assembled from strings: one lost backslash turns
    // `\s` into `s` and the scan silently matches nothing (2026-08-21).
    const CALL = /log(?:Refusal|Spend)\([\s\S]*?\n\s*\}\)/g;
    const BARE_MODE = /^\s*mode,\s*$/m;

    // THE SHARED ROOT LIST (P1-R3). `logRefusal`/`logSpend` are exported from
    // `app/(product)/safe-log.ts`, but nothing stops a worker or a package from
    // calling them, and this walk read `app/` alone until 2026-09-21.
    const files = sourceFilesUnder(PRODUCTION_ROOTS);
    expect(files.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    let callsSeen = 0;
    for (const { file, text } of files) {
      for (const m of text.matchAll(CALL)) {
        callsSeen += 1;
        if (BARE_MODE.test(m[0])) offenders.push(file);
      }
    }
    expect(
      offenders,
      "a wire value reaching LogContext by shorthand — clamp it with wireLabel"
    ).toEqual([]);
    // NON-VACUITY, TWO WAYS. First: the scan actually found calls to look at, so
    // "no offenders" is not "no calls".
    expect(callsSeen).toBeGreaterThan(3);
    // Second: it catches a PLANTED violation of the shape it claims to cover,
    // and does NOT fire on the clamped form. Template literals so the fixtures
    // carry real newlines the way a source file does.
    const planted = `logRefusal("[x] refused", err, {
  workspaceId,
  mode,
})`;
    const clean = `logRefusal("[x] refused", err, {
  workspaceId,
  mode: wireLabel(mode),
})`;
    const first = (text: string) => [...text.matchAll(CALL)][0]?.[0] ?? "";
    expect(first(planted)).not.toBe("");
    expect(BARE_MODE.test(first(planted))).toBe(true);
    expect(BARE_MODE.test(first(clean))).toBe(false);
  });

  it("the ACTION passes the ids, rather than the helper merely accepting them", () => {
    // The helper taking a parameter proves nothing about the call sites; this
    // is the half that would otherwise be a capability nothing uses.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "app/(product)/onboarding/actions.ts"),
      "utf8"
    );
    expect(src).toMatch(/logSpend\(/);
    expect(src).toMatch(/attemptId,/);
    expect(src).toMatch(/workspaceId: scope\.workspaceId/);
    // ...and the id is hoisted so the REFUSAL path can name it too.
    expect(src).toMatch(/const attemptId = randomUUID\(\);/);
  });
});
