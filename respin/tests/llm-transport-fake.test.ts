// Launch L2 (E-30): the transport-seam fake, driven THROUGH the real Anthropic
// adapter — so the proof is that it sits below `pinnedFetch` (the REQ-E01 pin
// still refuses an off-origin request before the fake is reached), that it
// answers with the sentinel served model journeys assert, that it counts every
// call, and that its restated constants are `@respin/db`'s.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PRODUCTION_ROOTS } from "./support/source-files";

import {
  LLM_TRANSPORT_FAKE_GLOBAL,
  LLM_TRANSPORT_FAKE_SELECTOR,
  LLM_TRANSPORT_FAKE_SERVED_MODEL,
} from "@respin/db";
import { LlmHostNotAllowedError, createAnthropicProvider, pinnedFetch } from "@respin/llm";

import {
  FAKE_GLOBAL,
  FAKE_SELECTOR,
  FAKE_SERVED_MODEL,
  createLlmTransportFake,
  fakeConceptBatch,
} from "../e2e/support/llm-transport-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("the LLM transport-seam fake", () => {
  it("restates @respin/db's selector, global and sentinel EXACTLY", () => {
    expect(FAKE_SELECTOR).toBe(LLM_TRANSPORT_FAKE_SELECTOR);
    expect(FAKE_GLOBAL).toBe(LLM_TRANSPORT_FAKE_GLOBAL);
    expect(FAKE_SERVED_MODEL).toBe(LLM_TRANSPORT_FAKE_SERVED_MODEL);
  });

  it("answers a generation and a scoring call through the real adapter, with the sentinel served model, and counts both", async () => {
    const fake = createLlmTransportFake();
    const provider = createAnthropicProvider({
      apiKey: "placeholder",
      timeoutMs: 5_000,
      maxRetries: 0,
      underlyingFetch: fake.fetch,
    });
    const draft = await provider.complete({
      attemptId: "fake-1",
      model: "claude-sonnet-5",
      system: "You write concepts.",
      prompt: "Propose ideas. Every idea is a hook, a thesis and a framework.",
      maxOutputTokens: 1000,
    });
    expect(draft.servedModel).toBe(FAKE_SERVED_MODEL);
    expect(JSON.parse(draft.text)).toEqual(fakeConceptBatch());
    expect(draft.usage.tokensIn).toBe(100);
    const scored = await provider.complete({
      attemptId: "fake-1",
      model: "claude-haiku-5",
      system: "You score a draft against a creator's own criteria. Nothing else.",
      prompt: 'criteria: [{"id":"/rules/0"},{"id":"/rules/1"}]',
      maxOutputTokens: 1000,
    });
    expect(JSON.parse(scored.text).verdicts.map((v: { ruleId: string }) => v.ruleId)).toEqual([
      "/rules/0",
      "/rules/1",
    ]);
    expect(fake.calls().map((c) => c.kind)).toEqual(["generation", "scoring"]);
  });

  it("sits BELOW the origin pin: an off-origin request is refused before the fake is reached", async () => {
    const fake = createLlmTransportFake();
    const pinned = pinnedFetch(fake.fetch);
    await expect(pinned("https://example.test/v1/messages", { method: "POST" })).rejects.toBeInstanceOf(
      LlmHostNotAllowedError
    );
    expect(fake.calls()).toHaveLength(0);
  });

  it("importing it does NOT install it: only the selector does", async () => {
    // This test process has no selector, so the module's preload branch must
    // have installed nothing on the global the provider factory reads.
    expect((globalThis as unknown as Record<symbol, unknown>)[FAKE_GLOBAL]).toBeUndefined();
  });

  it("no PRODUCTION ROOT imports the fake's file (it reaches a server only by --import)", () => {
    // An IMPORT of the module — static, dynamic or require — not a mention in
    // a comment (the selection rule's own docblock names the file).
    const IMPORTS_FAKE =
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'`][^"'`]*llm-transport-fake[^"'`]*["'`]/;
    // THE SHARED PRODUCTION ROOTS (`tests/support/source-files.ts`), never a
    // private copy of them.
    const roots = PRODUCTION_ROOTS;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "tests") continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|mjs|js)$/.test(entry) && IMPORTS_FAKE.test(readFileSync(path, "utf8"))) {
          offenders.push(relative(ROOT, path));
        }
      }
    };
    for (const root of roots) {
      try {
        walk(join(ROOT, root));
      } catch {
        // a root that does not exist in this tree references nothing
      }
    }
    expect(offenders).toEqual([]);
    // NON-VACUITY: every import shape is caught when PLANTED, and a comment is not.
    for (const planted of [
      'import { x } from "../../e2e/support/llm-transport-fake";',
      "const m = await import('../e2e/support/llm-transport-fake.ts');",
      "require(`./llm-transport-fake`)",
    ]) {
      expect(IMPORTS_FAKE.test(planted), planted).toBe(true);
    }
    expect(IMPORTS_FAKE.test("// see e2e/support/llm-transport-fake.ts")).toBe(false);
  });
});
