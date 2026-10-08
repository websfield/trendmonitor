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
import { isPlantedProbePath } from "./support/probe-artifacts";
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
  NOT_AN_ID,
  NOT_A_LABEL,
  logRefusal,
  logSpend,
  safeLogFields,
  wireId,
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
   * reads every use of an error identifier in them (`rawErrorUses`, below —
   * widened by gate L4 from "a bare argument"). `{ digest: error.digest }` is a
   * property read and stays sanctioned; `err` itself, its `.message` and
   * `String(err)` are the leak (a DrizzleQueryError's message embeds the bound
   * query parameters, which on the intake path is the creator's post text).
   */

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

  /**
   * An argument's CODE: string-literal contents blanked, and a template's text
   * blanked while its `${…}` interpolations are kept — so `"[x] err failed"` is
   * prose, while `` `${err.message}` `` is a read of the error.
   */
  const codeOnly = (arg: string): string => {
    let out = "";
    for (let i = 0; i < arg.length; i += 1) {
      const c = arg[i];
      if (c === '"' || c === "'") {
        out += " ";
        for (i += 1; i < arg.length && arg[i] !== c; i += 1) {
          if (arg[i] === "\\") i += 1;
          out += " ";
        }
        out += " ";
        continue;
      }
      if (c === "`") {
        out += " ";
        for (i += 1; i < arg.length && arg[i] !== "`"; i += 1) {
          if (arg[i] === "\\") {
            i += 1;
            out += "  ";
          } else if (arg[i] === "$" && arg[i + 1] === "{") {
            const end = closingBrace(arg, i + 1);
            if (end < 0) break;
            out += ` (${arg.slice(i + 2, end)}) `;
            i = end;
          } else out += " ";
        }
        out += " ";
        continue;
      }
      out += c;
    }
    return out;
  };

  /**
   * THE ERROR IDENTIFIERS OF ONE FILE (gate L4): every name a `catch (x)` or a
   * `.catch((x) => …)` binds there, plus the three conventional names. Until
   * 2026-10-05 only `err`/`error`/`e` were recognised, so `catch (failure)`
   * followed by `console.error(failure)` was invisible.
   */
  /**
   * Functions that turn an error into a CLOSED label — each returns a class
   * name, a driver code or a refusal code built from fixed alphabets, never a
   * message: `poolErrorFields` (packages/db/src/client.ts), `sinkErrorName`
   * (packages/credits/src/metrics.ts), `authMailFailureCode`
   * (packages/auth/src/create-auth.ts) and `safeLogFields` (this module's
   * subject). An error passed DIRECTLY to one of them is not forwarded. A LIST:
   * a fifth is an edit here, after reading what it returns.
   */
  const SANITISER_CALL = /\b(?:poolErrorFields|sinkErrorName|authMailFailureCode|safeLogFields)\s*\(\s*$/;

  const errorIdentifiers = (src: string): Set<string> => {
    const names = new Set(["err", "error", "e"]);
    for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/\.catch\s*\(\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    return names;
  };

  /**
   * Every way one console call forwards an error's CONTENT, as strings.
   *
   * GATE L4 WIDENED IT FROM "a bare identifier argument" TO EVERY USE OF THE
   * VALUE. An error identifier is safe only as `x instanceof …`, a comparison,
   * or a read of a property OTHER than `message`, `stack` or `cause` (`digest`,
   * `code`, `name`). Anything else forwards content: the bare value,
   * `String(x)`, `` `${x}` ``, `x.message`, a ternary branch `: x`.
   */
  const rawErrorUses = (raw: string): string[] => {
    const src = blankComments(raw);
    const ids = errorIdentifiers(src);
    const out: string[] = [];
    const call = /console\s*\.\s*(?:error|warn|log|info)\s*\(/g;
    for (let m = call.exec(src); m !== null; m = call.exec(src)) {
      const open = call.lastIndex - 1;
      const close = closingParen(src, open);
      if (close < 0) continue;
      for (const arg of topLevelArgs(src.slice(open + 1, close))) {
        const code = codeOnly(arg);
        for (const id of ids) {
          for (const use of code.matchAll(new RegExp(`(?<![.\\w$])${id}(?![\\w$])`, "g"))) {
            // Handed straight to a CLAMPING function: what reaches the log is
            // that function's closed label, not the error.
            if (SANITISER_CALL.test(code.slice(0, use.index ?? 0))) continue;
            const after = code.slice((use.index ?? 0) + id.length);
            if (/^\s*instanceof\b/.test(after)) continue;
            if (/^\s*[!=]==?/.test(after)) continue;
            if (/^\s*\??\.\s*(?:message|stack|cause)\b/.test(after)) {
              out.push(`${id}.message|stack|cause`);
              continue;
            }
            if (/^\s*\??\.\s*[A-Za-z_$]/.test(after)) continue;
            out.push(`${id} (the value itself)`);
          }
        }
      }
    }
    return out;
  };
  const logsRawError = (raw: string): boolean => rawErrorUses(raw).length > 0;

  /**
   * THE JUSTIFIED ERROR USES (gate L4), per file and counted — so an ADDED use
   * is red. Every one is an OPERATOR command line: it runs in an operator's
   * terminal, never on a request path or in the worker, and prints to that
   * terminal rather than to the collected server log. What it prints is the
   * operator's only diagnostic for a failed one-off command, and for most of
   * them it is the CLI's own refusal text, which IS the remedy.
   *
   * FIXED rather than justified on 2026-10-05: `setup-cli.ts` and
   * `scan-journey-notes.ts` printed a non-`Error` VALUE in their fallback
   * branch; both print a fixed string now, so only their `.message` read stays.
   */
  const OPERATOR_CLI_ERROR_USES: Readonly<Record<string, readonly [number, string]>> = {
    "packages/credits/src/stripe/setup-cli.ts": [1, "`.message` — the missing-env and price-divergence refusals are the operator's remedy"],
    "packages/credits/src/stripe/auto-topup-rollout-cli.ts": [1, "`.message` — the cutover's blocker list (PaymentIntent ids) is the operator's remedy"],
    "packages/credits/src/stripe/auto-topup-v1-reconcile-cli.ts": [1, "`.message` — the reconciliation's own refusal"],
    "packages/credits/src/stripe/tier-checkout-rollout-cli.ts": [1, "`.message` — the rollout's own refusal"],
    "packages/db/src/sample-spin-keyring-cli.ts": [1, "`.message` of `PublicSampleSpinKeyringError` ONLY — the read is guarded by that class"],
    "scripts/scan-journey-notes.ts": [1, "`.message` — `currentRunId`'s own refusal, in CI"],
    "packages/db/src/migrate-cli.ts": [1, "`formatErrorChain(error)` — a failed migration's full cause chain is the operator's only diagnostic; drizzle's migrator runs each file as `sql.raw(stmt)`, so a query error carries no bound parameters (pg-core/dialect.js, drizzle-orm 0.44.7)"],
    "packages/config/src/migrate-config-cli.ts": [1, "`formatErrorChain(error)` — a failed config migration's cause chain, for the operator; nothing was written"],
  };

  it("no production file logs a raw error object", () => {
    // THE SHARED ROOT LIST, NOT `app/` ALONE (P1-R6). This walked `app/` until
    // 2026-09-21, so `packages/`, `worker/`, `lib/` and `scripts/` were outside
    // a scan whose failure mode is a creator's post text in stdout.
    // `PRODUCTION_ROOTS` is asserted against `ROOT_DIRS` in
    // `claim-scan.test.ts`.
    // THE SKIP IS THE PLANTS AND NOTHING ELSE (2026-10-05). It was every
    // `__*` segment, so a production file named `__foo.ts` was never read;
    // it is now only the exact paths other suites plant mid-run
    // (`isPlantedProbePath`). The case below proves a `__foo.ts` is read.
    const offenders = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter(({ file }) => !file.endsWith("safe-log.ts"))
      .filter(({ file }) => !isPlantedProbePath(file))
      // Two-way per file: a use beyond a justified count, or a justified count
      // the file no longer reaches, is red.
      .filter(({ file, text }) => rawErrorUses(text).length !== (OPERATOR_CLI_ERROR_USES[file]?.[0] ?? 0))
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
      // GATE L4: the content forwarded by another route, and a catch binding
      // with any name.
      'console.error("[x]", String(err));',
      "console.error(`[x] ${err.message}`);",
      "console.error(`[x] ${err}`);",
      'console.error("[x]", err?.stack);',
      'console.error(err instanceof Error ? err.message : err);',
      'try { x(); } catch (failure) { console.error("[x]", failure); }',
      'p.catch((reason) => console.warn("[x]", String(reason)));',
      'console.info("[x]", e);',
    ]) {
      expect(logsRawError(planted), planted).toBe(true);
    }
    // ...and does not flag the sanctioned shapes.
    for (const fine of [
      'logRefusal("[x] failed", err);',
      'console.error("[x] failed", { digest: error.digest });',
      'console.error("[x] no args");',
      // A property read off the error OTHER than its message is what the
      // sanctioned shape looks like, inside a nested call or a template too.
      'console.error("[x]", String(err.code));',
      "console.error(`[x] ${err.name}`);",
      'console.error("[x]", err instanceof TypeError ? "type" : "other");',
      // The identifier inside a STRING is prose.
      'console.error("[x] err was thrown");',
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
    // Clamped since P1-A3: a no-op on the server-minted uuid, and the scan
    // below refuses a bare identifier in any log context.
    expect(src).toMatch(/attemptId: wireId\(attemptId\),/);
    expect(src).toMatch(/workspaceId: scope\.workspaceId/);
    // ...and the id is hoisted so the REFUSAL path can name it too.
    expect(src).toMatch(/const attemptId = randomUUID\(\);/);
  });
});

// ---------------------------------------------------------------------------
// AUDIT P1-A3 (register 2026-10-05 item 43): AN ID FROM THE WIRE IS CLAMPED.
//
// A server action's bound `profileId`, a posted `operationId` and a JSON
// `requestId` are untrusted input, and the refusal path fires precisely when
// one is not what the server offered. They were logged raw beside fields the
// same call clamped. `wireLabel` cannot clamp them — it needs a letter first
// and every uuidv7 minted today starts with a digit — so `wireId` keeps a
// UUID or a ULID byte for byte and replaces anything else with `NOT_AN_ID`.
//
// THE RULE THE SCAN ENFORCES, PER LOG CALL (tightened by gate M5):
//   - the TAG (first argument) is a string literal, or a template literal
//     with no interpolation;
//   - the CONTEXT (third argument of `logRefusal`, second of `logSpend`), when
//     present, is an OBJECT LITERAL — never a name, a call or anything else;
//   - every member of it is `key: value` or a shorthand with a plain key — a
//     quoted or computed key is refused, because it hides the key's name;
//   - a SPREAD is refused, except a conditional `...(c ? A : B)` whose two
//     branches are each an object literal (checked by these same rules) or a
//     call to one of the CLAMPING BUILDERS listed below;
//   - a member whose key ends in `Id` is `wireId(…)` as the WHOLE value, or a
//     WHOLE property path `root.a.b` off a server-derived root — so
//     `profile.id ?? profileId`, `scope.x && profileId` and
//     `wireId(a) + profileId` are all refused. A shorthand id is refused: the
//     scan cannot tell a bound parameter from a locally minted uuid, and
//     clamping a minted uuid is a no-op.
//
// THE STATED LIMIT: roots are matched BY NAME. A variable named `profile` that
// held a wire value would pass. Every root below is bound by convention to the
// producer its reason names, and no production log call today names one any
// other way — but the scan does not trace that binding, and says so here
// rather than implying it does.
const SERVER_DERIVED_ROOTS: Readonly<Record<string, string>> = {
  scope: "the membership read's own scope (`scopeForUser`)",
  result: "a facade operation's return value",
  row: "a row the scoped write returned",
  doc: "a brain document the scoped write returned",
  piece: "a piece the scoped operation returned",
  profile: "the selected profile, read from the database by `selectedProfileForMember`",
  event: "a Stripe event whose signature was verified before it was parsed",
};

/**
 * Calls that may be SPREAD into a log context: builders in `safe-log.ts` whose
 * every output field is already clamped and none of which carries an `Id` key.
 */
const CLAMPING_BUILDERS = ["schemaIssueFields"] as const;

/** Source with comments blanked; strings and templates intact. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) =>
    before === undefined ? " " : `${before} `
  );
}

/**
 * Split `text` at every top-level occurrence of `sep`, skipping strings,
 * templates (and their `${}`), and anything inside (), [] or {}.
 */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i += 1; i < text.length && text[i] !== c; i += 1) {
        if (text[i] === "\\") i += 1;
        else if (c === "`" && text[i] === "$" && text[i + 1] === "{") {
          let d = 0;
          for (; i < text.length; i += 1) {
            if (text[i] === "{") d += 1;
            else if (text[i] === "}" && --d === 0) break;
          }
        }
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** The index of the bracket closing the one at `open`, or -1. */
function closeOf(text: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const want = pairs[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === "\\") i += 1;
      continue;
    }
    if (c === text[open]) depth += 1;
    else if (c === want && --depth === 0) return i;
  }
  return -1;
}

/** `text` with redundant outer parentheses removed. */
function unwrap(text: string): string {
  let t = text.trim();
  while (t.startsWith("(") && closeOf(t, 0) === t.length - 1) t = t.slice(1, -1).trim();
  return t;
}

const isObjectLiteral = (t: string): boolean => t.startsWith("{") && closeOf(t, 0) === t.length - 1;

/** True when `t` is exactly one call to `name(…)` and nothing else. */
function isWholeCall(t: string, name: string): boolean {
  const m = new RegExp(`^${name}\\s*\\(`).exec(t);
  return m !== null && closeOf(t, m[0].length - 1) === t.length - 1;
}

/** `c ? a : b` at top level, or null. A `?.` or `??` is not a ternary. */
function ternary(t: string): [string, string] | null {
  let depth = 0;
  let q = -1;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i += 1; i < t.length && t[i] !== c; i += 1) if (t[i] === "\\") i += 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && c === "?" && t[i + 1] !== "." && t[i + 1] !== "?" && t[i - 1] !== "?" && q < 0) q = i;
    else if (depth === 0 && c === ":" && q >= 0) return [t.slice(q + 1, i), t.slice(i + 1)];
  }
  return null;
}

/** Every violation in one context object literal, as human-readable strings. */
function contextViolations(context: string): string[] {
  const t = unwrap(context);
  if (!isObjectLiteral(t)) return [`context is not an object literal: ${t.slice(0, 40)}`];
  const out: string[] = [];
  for (const raw of splitTopLevel(t.slice(1, -1), ",")) {
    const member = raw.trim();
    if (member === "") continue;
    if (member.startsWith("...")) {
      const branches = ternary(unwrap(member.slice(3)));
      if (branches === null) {
        out.push(`spread of a non-conditional value: ${member.slice(0, 40)}`);
        continue;
      }
      for (const branch of branches.map(unwrap)) {
        if (isObjectLiteral(branch)) out.push(...contextViolations(branch));
        else if (!CLAMPING_BUILDERS.some((b) => isWholeCall(branch, b))) {
          out.push(`spread branch is neither a literal nor a clamping builder: ${branch.slice(0, 40)}`);
        }
      }
      continue;
    }
    if (/^["'`[]/.test(member)) {
      out.push(`quoted or computed key: ${member.slice(0, 40)}`);
      continue;
    }
    if (/^[A-Za-z_$][\w$]*$/.test(member)) {
      if (/Id$/.test(member)) out.push(`${member} (shorthand)`);
      continue;
    }
    const parts = splitTopLevel(member, ":");
    const key = parts[0].trim();
    const value = parts.slice(1).join(":").trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(key) || value === "") {
      out.push(`unrecognised member: ${member.slice(0, 40)}`);
      continue;
    }
    if (!/Id$/.test(key)) continue;
    if (isWholeCall(value, "wireId")) continue;
    const root = /^([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)+$/.exec(value)?.[1];
    if (root !== undefined && Object.hasOwn(SERVER_DERIVED_ROOTS, root)) continue;
    out.push(`${key}: ${value}`);
  }
  return out;
}

/**
 * A string literal, a template with no interpolation, or a conditional whose
 * two branches are each one of those (`written ? "[x] proposed" : "[x] held"`).
 */
function isLiteralTag(tag: string): boolean {
  const t = unwrap(tag);
  if (/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`$]*`)$/.test(t)) return true;
  const branches = ternary(t);
  return branches !== null && branches.every(isLiteralTag);
}

/** Every violation in every log call in one file's code. */
function logCallViolations(text: string): string[] {
  const code = codeOf(text);
  const out: string[] = [];
  const call = /\blog(Refusal|Spend)\s*\(/g;
  for (let m = call.exec(code); m !== null; m = call.exec(code)) {
    const open = call.lastIndex - 1;
    const close = closeOf(code, open);
    if (close < 0) continue;
    const args = splitTopLevel(code.slice(open + 1, close), ",").map((a) => a.trim()).filter((a) => a !== "");
    const tag = args[0] ?? "";
    if (!isLiteralTag(tag)) out.push(`non-literal tag: ${tag.slice(0, 40)}`);
    const context = m[1] === "Refusal" ? args[2] : args[1];
    if (context !== undefined) out.push(...contextViolations(context));
  }
  return out;
}

function wireIdOffenders(files: readonly { file: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const { file, text } of files) {
    for (const hit of logCallViolations(text)) out.push(`${file}: ${hit}`);
  }
  return out.sort();
}

describe("P1-A3: an id from the wire is clamped before it is logged", () => {
  it("wireId keeps a uuidv7, a uuidv4 and a ULID, and replaces anything else with a fixed token", () => {
    // THE CASE `wireLabel` FAILS: a uuidv7 minted today starts with a digit.
    const v7 = "01a10a48-8e88-7c3d-9f00-0123456789ab";
    expect(wireLabel(v7)).toBe(NOT_A_LABEL);
    expect(wireId(v7)).toBe(v7);
    expect(wireId("9b2f6c1e-4d3a-4f8b-8a2c-1e2d3c4b5a69")).toBe("9b2f6c1e-4d3a-4f8b-8a2c-1e2d3c4b5a69");
    expect(wireId("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    for (const hostile of [
      "",
      "profile_a",
      `${v7}\n[studio-action] forged line`,
      ` ${v7}`,
      `${v7}x`,
      "01a10a48-8e88-7c3d-9f00-0123456789a",
      "I have been trying to lose the same 10 kilos",
      "81ARZ3NDEKTSV4RRFFQ69G5FAV",
      "01ARZ3NDEKTSV4RRFFQ69G5FAU!",
      "../../etc/passwd",
    ]) {
      expect(wireId(hostile), JSON.stringify(hostile)).toBe(NOT_AN_ID);
    }
    // Not a string at all (a FormData File, null) is the token too.
    expect(wireId(null)).toBe(NOT_AN_ID);
    expect(wireId(42)).toBe(NOT_AN_ID);
    // The token is not itself an id.
    expect(wireId(NOT_AN_ID)).toBe(NOT_AN_ID);
  });

  it("no production log call carries an unclamped wire id, a non-literal tag or an opaque context", () => {
    const files = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter(({ file }) => !file.endsWith("safe-log.ts"))
      .filter(({ file }) => !file.split("/").includes("tests"))
      .filter(({ file }) => !isPlantedProbePath(file));
    expect(wireIdOffenders(files)).toEqual([]);
    // NON-VACUITY: the scan found the clamped population it exists for —
    // measured 2026-10-05 as 46 clamped id members (30 `profileId`, 14
    // `attemptId`, 1 `workspaceId`, 1 `requestId`) across 8 wire-facing files.
    const clamped = files.flatMap(({ text }) => [...codeOf(text).matchAll(/\b\w*Id: wireId\(/g)]);
    expect(clamped.length).toBeGreaterThanOrEqual(46);
    for (const [root, why] of Object.entries(SERVER_DERIVED_ROOTS)) {
      expect(why.length, `${root} is a server-derived root with no reason`).toBeGreaterThan(20);
    }
  });

  it("NON-VACUITY: every shape that hides a wire id is red, and the clamped forms are not", () => {
    const red: [string, string][] = [
      ["bound parameter, shorthand", 'logRefusal("[x]", err, {\n  workspaceId: scope.workspaceId,\n  profileId,\n})'],
      ["bound parameter, named", 'logRefusal("[x]", err, { profileId: profileId })'],
      ["input.profileId", 'logSpend("[x]", { profileId: input.profileId, n: 1 })'],
      ["a FormData id", 'logRefusal("[x]", err, { attemptId: String(formData.get("operationId") ?? "") })'],
      ["a wire workspaceId", 'logRefusal("[x]", err, { workspaceId: body.workspaceId })'],
      ["inline shorthand", 'logRefusal("[x]", err, { requestId })'],
      ["the letter-first clamp, which erases uuids", 'logRefusal("[x]", err, { attemptId: wireLabel(attemptId) })'],
      ["a context passed by name", 'logRefusal("[x]", err, context)'],
      ["AC14's plant", 'logRefusal("x", err, { profileId: input.id })'],
      // Gate M5's shapes.
      ["a root, then a fallback to the wire", 'logRefusal("[x]", err, { profileId: profile.id ?? profileId })'],
      ["a root, then a conjunction", 'logRefusal("[x]", err, { profileId: scope.x && profileId })'],
      ["a clamp, then a concatenation", 'logRefusal("[x]", err, { profileId: wireId(a) + profileId })'],
      ["a quoted key", 'logRefusal("[x]", err, { "profileId": input.profileId })'],
      ["a computed key", 'logRefusal("[x]", err, { ["profileId"]: input.profileId })'],
      ["a spread of the input", 'logRefusal("[x]", err, { ...input })'],
      ["a call result as the context", 'logRefusal("[x]", err, ctx(input))'],
      ["a call result spread", 'logRefusal("[x]", err, { ...ctx(input) })'],
      ["a conditional spread hiding a raw id", 'logRefusal("[x]", err, { ...(ok ? { profileId } : {}) })'],
      ["a conditional spread of the input", 'logRefusal("[x]", err, { ...(ok ? input : {}) })'],
      ["a non-literal tag", "logRefusal(tag, err)"],
      ["an interpolated tag", "logRefusal(`[x] ${act}`, err)"],
      ["a conditional tag with one non-literal branch", 'logRefusal(ok ? "[x]" : tag, err)'],
      ["logSpend with a context by name", 'logSpend("[x]", fields)'],
    ];
    for (const [shape, text] of red) {
      expect(wireIdOffenders([{ file: "app/plant.ts", text }]), shape).not.toEqual([]);
    }
    const clean = [
      'logRefusal("[x]", err, { profileId: wireId(profileId) })',
      'logRefusal("[x]", err, {\n  ...(scope ? { workspaceId: scope.workspaceId } : {}),\n  profileId: wireId(profileId),\n})',
      'logSpend("[x]", { generationId: result.generation.id, profileId: profile.id })',
      'logRefusal("[x]", err, { stripeEventId: event.id })',
      'logRefusal("[x]", err)',
      'logRefusal(`[x] plain`, err)',
      'logSpend(written ? "[x] proposed" : "[x] held", { version: doc.version })',
      'logRefusal("[x]", err, { ...(e instanceof AssemblyError ? schemaIssueFields(e.schemaIssue) : {}) })',
      'logRefusal("[x]", err, { ...(formChoice === null ? {} : { formChoice: wireLabel(String(formChoice)) }) })',
      // A string mentioning an id key is prose, not a member.
      'logRefusal("[x] profileId refused", err)',
      '// logRefusal("[x]", err, { profileId })\n',
    ];
    for (const text of clean) {
      expect(wireIdOffenders([{ file: "app/plant.ts", text }]), text).toEqual([]);
    }
  });

  it("a real production file named __foo.ts is SCANNED — only exact plants are skipped", () => {
    // The skip used to be every `__*` segment; these two lines are the line
    // between "another suite's plant" and "a production file".
    expect(isPlantedProbePath("worker/__foo.ts")).toBe(false);
    expect(isPlantedProbePath("app/(product)/__bar.tsx")).toBe(false);
    expect(isPlantedProbePath("lib/__p6_probe.ts")).toBe(true);
    expect(isPlantedProbePath("app/__scan_probe__/probe.ts")).toBe(true);
    expect(isPlantedProbePath("app\\__stripe_scan_probe__\\probe.ts")).toBe(true);
  });
});
