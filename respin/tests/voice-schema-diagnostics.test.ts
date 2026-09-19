// WHERE a `bad_shape` happened must reach the log, and NOTHING ELSE MAY.
//
// The defect these tests exist for (live walk, 2026-09-18): a real voice build
// refused `assemblyKind: 'bad_shape'` and no evidence anywhere could say which
// schema field was wrong. `parseVoiceReply` computed the failing path and put
// it in the `Error`'s message; `safe-log.ts` withholds messages by design. So
// the location was discarded on EVERY occurrence, not just the captured one —
// re-running could never surface it, and two review passes recorded "the
// failing schema field unknown" for that reason.
//
// The fix carries the location as structured fields instead of relaxing the
// message rule, which means these tests have to hold BOTH halves at once: the
// location arrives, and the reply's content still does not.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AssemblyError, parseVoiceReply, type ClaimSpec, type OwnPost } from "@respin/llm";
import { NOT_A_LABEL, logRefusal, schemaIssueFields } from "../app/(product)/safe-log";

const POSTS: OwnPost[] = [{ id: "p1", content: "I open on a number every time." }];
const FIELDS: ClaimSpec[] = [
  { key: "signatureMoves", kind: "list", max: 3, guidance: "how they open" },
];

/** The reply shape the schema wants, as a starting point to corrupt. */
const good = {
  fields: [
    {
      key: "signatureMoves",
      values: [
        { value: "opens on a number", inputId: "p1", quote: "I open on a number" },
      ],
    },
  ],
};

const parse = (raw: unknown) =>
  parseVoiceReply({ text: JSON.stringify(raw), fields: FIELDS, posts: POSTS });

/** Runs `parse` and returns the `AssemblyError` it must throw. */
function refusalOf(raw: unknown): AssemblyError {
  try {
    parse(raw);
  } catch (e) {
    if (e instanceof AssemblyError) return e;
    throw e;
  }
  throw new Error("the reply was accepted — this fixture is supposed to be refused");
}

describe("bad_shape names WHERE it failed", () => {
  it("is the control: the uncorrupted fixture parses", () => {
    // Without this, every case below could be passing for the wrong reason —
    // a fixture that is malformed in some second, unintended way would still
    // produce `bad_shape` and still satisfy the assertions.
    expect(parse(good)).toHaveLength(1);
  });

  it("carries the rejected key names when a strict object sees an extra one", () => {
    // THE LEADING SUSPECT for the live refusal: every level is
    // `z.strictObject`, so one key the model was never asked for is fatal.
    const err = refusalOf({
      fields: [{ ...good.fields[0], confidence: 0.9 }],
    });
    expect(err.kind).toBe("bad_shape");
    expect(err.schemaIssue?.code).toBe("unrecognized_keys");
    expect(err.schemaIssue?.path).toBe("fields/0");
    expect(
      err.schemaIssue?.keys,
      "the key the model invented is the one datum that closes the diagnosis"
    ).toEqual(["confidence"]);
  });

  it("names the field when a required member is omitted rather than null", () => {
    const err = refusalOf({
      fields: [{ key: "signatureMoves", values: [{ value: "opens on a number" }] }],
    });
    expect(err.kind).toBe("bad_shape");
    // `nullable()` is not `optional()` — a model that drops the key entirely
    // fails here, and the path is what says so.
    expect(err.schemaIssue?.path).toBe("fields/0/values/0/inputId");
  });

  it("reports the ROOT as a path rather than as an absent field", () => {
    const err = refusalOf([good.fields[0]]);
    expect(err.kind).toBe("bad_shape");
    expect(schemaIssueFields(err.schemaIssue).schemaPath).toBe("/");
  });

  it("leaves schemaIssue absent on kinds that have no location", () => {
    // `not_json` and the post-parse kinds are not schema failures; a
    // `schemaPath` on them would be a location invented for a line that has
    // none.
    let notJson: AssemblyError | undefined;
    try {
      parseVoiceReply({ text: "not json at all", fields: FIELDS, posts: POSTS });
    } catch (e) {
      notJson = e as AssemblyError;
    }
    expect(notJson?.kind).toBe("not_json");
    expect(notJson?.schemaIssue).toBeUndefined();
    expect(schemaIssueFields(undefined)).toEqual({});
  });
});

describe("schemaIssueFields clamps the one vendor-controlled member", () => {
  it("passes a hostile key name through the same clamp as a wire label", () => {
    const fields = schemaIssueFields({
      path: "fields/0",
      code: "unrecognized_keys",
      keys: ["MY UNPUBLISHED POST: a caption about something private"],
    });
    expect(fields.schemaKeys).toBe(NOT_A_LABEL);
    expect(fields.schemaKeys).not.toContain("UNPUBLISHED");
  });

  it("bounds the list and SAYS it was bounded", () => {
    const fields = schemaIssueFields({
      path: "fields/0",
      code: "unrecognized_keys",
      keys: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(fields.schemaKeys).toBe("a,b,c,d,e");
    expect(
      fields.schemaKeysTotal,
      "a truncated list that looked complete would send the next reader hunting for a key this line never named"
    ).toBe("7");
  });

  it("refuses a path that is not shaped like a path", () => {
    // Defence in depth: our own schema's keys can only produce the safe
    // alphabet, so this asserts the clamp rather than a real reply.
    expect(
      schemaIssueFields({ path: "fields/0 and then some prose", code: "x" }).schemaPath
    ).toBe(NOT_A_LABEL);
  });
});

describe("the diagnosis reaches a real log line", () => {
  it("logRefusal prints the location and still withholds the message", () => {
    const err = refusalOf({ fields: [{ ...good.fields[0], confidence: 0.9 }] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let call: unknown[];
    try {
      logRefusal("[onboarding-action] voice inference refused", err, {
        assemblyKind: err.kind,
        ...schemaIssueFields(err.schemaIssue),
      });
      // READ BEFORE RESTORING — `mockRestore` clears the recorded calls, so a
      // read after it sees `undefined` and the assertions below would be
      // testing nothing.
      call = spy.mock.calls[0];
    } finally {
      spy.mockRestore();
    }
    const [, context] = call as [string, Record<string, string>];
    expect(context.assemblyKind).toBe("bad_shape");
    expect(context.schemaPath).toBe("fields/0");
    expect(context.schemaKeys).toBe("confidence");
    // THE HALF THAT MUST NOT REGRESS. The message is what names the location
    // in prose, and it is exactly what this module exists to withhold.
    expect(JSON.stringify(context)).not.toContain(err.message);
  });

  it("the ACTION passes it, rather than the helper merely accepting it", () => {
    // The clamp existing proves nothing about the one call site that logs a
    // voice refusal — the capability would otherwise be one nothing uses,
    // which is the shape the live defect already had.
    const src = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "app/(product)/onboarding/actions.ts"
      ),
      "utf8"
    );
    expect(src).toMatch(/schemaIssueFields\(err\.schemaIssue\)/);
  });
});
