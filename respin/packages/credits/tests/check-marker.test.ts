// The `[check]` placeholder is DECLARED IN TWO PACKAGES, and this file is what
// makes that safe.
//
// `@respin/llm`'s `assemble.ts` needs the marker to tell a model what to emit
// for a field the creator's posts do not support; `@respin/db`'s
// `brain-content.ts` needs it to decide which claim positions hold a value.
// `@respin/llm` may not depend on `@respin/db` — a provider adapter that needs
// the database is not a provider adapter — so the constant is duplicated, by
// the same precedent and for the same reason as `INFERENCE_OUTCOMES` in
// `packages/llm/src/types.ts`.
//
// THIS TEST LIVES IN `@respin/credits`, not in either of the two packages it
// compares, and that placement is the point. Asserting the agreement from
// inside `packages/llm/tests` would make `@respin/llm` depend on `@respin/db`
// in dev — most of the boundary given away in order to prove the boundary — and
// the repo root does not depend on `@respin/llm` at all, deliberately (the app
// never touches the provider package; `tests/import-boundary.test.ts` R6 denies
// it from `app/**` and `lib/**`). `@respin/credits` already depends on BOTH,
// because composing them is its job, so the assertion costs no new edge.
//
// If this test goes red, do not "fix" it by editing one constant to match the
// other — decide which value is right, change that one, and let the other
// follow. The two are the same string because they are the same idea, not
// because a test said so.
import { describe, expect, it } from "vitest";

import { CHECK as DB_CHECK } from "@respin/db";
import { CHECK as LLM_CHECK } from "@respin/llm";

describe("the [check] marker agrees across the package boundary", () => {
  it("is byte-identical in @respin/llm and @respin/db", () => {
    expect(LLM_CHECK).toBe(DB_CHECK);
  });

  it("is the literal the doc set names, so neither side drifted together", () => {
    // Pinned to the LITERAL as well as to each other. Two constants that agree
    // can still both be wrong — the failure mode where someone renames the
    // marker in both packages in one edit and every placeholder already stored
    // stops being recognised as one. `REQ-I03` names this string.
    expect(DB_CHECK).toBe("[check]");
  });
});
