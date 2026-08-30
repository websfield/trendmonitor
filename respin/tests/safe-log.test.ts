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
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  onboardingInputs,
  ContentSchemaError,
  PostContentError,
  ProfileCapError,
  ProvenanceError,
  ReferenceEchoError,
} from "@respin/db";
import { logRefusal, logSpend, safeLogFields } from "../app/(product)/safe-log";
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
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });

  /**
   * An error OBJECT passed as a logged argument.
   *
   * `[^;]{0,200}?` rather than `[^)]*`: the first argument is often a template
   * literal, and `(${code})` inside it closes the character class early — the
   * shape this repo's own billing action used, so the first version of this
   * scan missed the real call site it was written for. Bounded and
   * semicolon-stopped so it cannot span statements.
   */
  const LOGS_AN_ERROR =
    /console\.(?:error|warn|log)\s*\([^;]{0,200}?,\s*(?:err|error|e)\s*[,)]/;

  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app");

  it("no file in app/** logs a raw error object", () => {
    const offenders = walk(appDir)
      .filter((f) => !f.endsWith("safe-log.ts"))
      .filter((f) => LOGS_AN_ERROR.test(readFileSync(f, "utf8")))
      .map((f) => relative(appDir, f).split(sep).join("/"));
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
    ]) {
      expect(LOGS_AN_ERROR.test(planted), planted).toBe(true);
    }
    // ...and does not flag the sanctioned shapes.
    for (const fine of [
      'logRefusal("[x] failed", err);',
      'console.error("[x] failed", { digest: error.digest });',
      'console.error("[x] no args");',
    ]) {
      expect(LOGS_AN_ERROR.test(fine), fine).toBe(false);
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
