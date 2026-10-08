// THE LLM TRANSPORT-SEAM FAKE for actual-app journeys (launch L2, E-30;
// decisions R-151). OUTSIDE every production root (`packages`, `app`,
// `worker`, `scripts`, `lib`, `ops`), and nothing in a production root imports
// it: the Next.js server receives it only when the journey harness PRELOADS it
// (`node --import ./e2e/support/llm-transport-fake.ts`), and even then the
// server uses it only if `@respin/db`'s `resolveLlmTransportSelection` selects
// it — the exact selector name, not a production build, a database whose name
// carries the test marker. Every other shape refuses at startup and at the
// provider factory.
//
// WHERE IT SITS: it is a `fetch`, handed to the Anthropic adapter as
// `underlyingFetch` — BELOW `pinnedFetch` — so every faked call still passes
// the REQ-E01 origin pin, is metered into `model_usage` and is costed. It
// answers only `POST https://api.anthropic.com/v1/messages`.
//
// THE WITNESSES: every reply carries the sentinel `servedModel`
// (`FAKE_SERVED_MODEL`), which journeys assert on the stored usage rows — a
// selector that was misspelt or ignored would reach the real provider and fail
// the journey instead of passing while spending money. And every call is
// counted, in memory and (when `RESPIN_LLM_FAKE_LEDGER` names a file) in a JSON
// ledger the journey reads, so "no provider call" is a number, not an absence.
//
// SELF-CONTAINED ON PURPOSE: Node's type stripping loads this file directly, so
// it imports only `node:` builtins. Its three shared constants are restated
// here and pinned equal to `@respin/db`'s by `tests/llm-transport-fake.test.ts`.
import { readFileSync, writeFileSync } from "node:fs";

export const FAKE_SELECTOR = "e2e-transport-fake";
export const FAKE_GLOBAL = Symbol.for("respin.e2e.llmTransportFake");
export const FAKE_SERVED_MODEL = "respin-e2e-transport-fake";
export const FAKE_LEDGER_ENV = "RESPIN_LLM_FAKE_LEDGER";

const ANTHROPIC_MESSAGES = "https://api.anthropic.com/v1/messages";

export type FakeCallKind = "generation" | "scoring" | "unrecognised";
export type FakeCall = { n: number; kind: FakeCallKind; model: string };

/** A concept batch every Studio check passes: three opinion concepts, no digits, no names. */
const IDEAS = [
  {
    hook: "you are shooting three takes when one honest take would do",
    thesis: "most reshoots come from a setting nobody checked, never from a bad performance",
    framework: "the evidence tutorial",
  },
  {
    hook: "the room tone you ignored is why your edit sounds cheap",
    thesis: "audio decides whether a solo shoot reads as professional long before the picture does",
    framework: "the confession arc",
  },
  {
    hook: "nobody tells you the boring part is where the work happens",
    thesis: "the unglamorous prep is what separates a usable filming day from a wasted one",
    framework: "the mirror",
  },
];

export function fakeConceptBatch(): Record<string, unknown> {
  return {
    ideas: IDEAS.map((idea) => ({
      ...idea,
      form: "explain_opinion",
      frameworkProvenance: "offered",
      premise: {
        whatHappens: "you change the lens again and again and keep almost none of the takes",
        interest: "everyone has kept going on a shoot they should have stopped",
        payoff: "the take worth keeping comes after checking the dial",
        basis: { kind: "none" },
      },
      filming: { location: "kitchen", equipment: ["phone"], people: "solo", minutes: 20 },
    })),
    whyThisPerforms: {
      reasoning:
        "each concept opens on a tension the viewer already feels and does not resolve it in the first line",
      weakestPoint:
        "none of these is grounded in a result you have logged, so this is a guess about attention and not a claim about reach",
    },
    disclosure: {
      platform: "tiktok",
      guidance:
        "mark the post as made with the help of an assistant in the platform's own disclosure control",
    },
  };
}

/** An opinion script every Studio check passes — present tense, no narrated event. */
export function fakeScript(): Record<string, unknown> {
  const batch = fakeConceptBatch();
  const concept = (batch.ideas as Record<string, unknown>[])[0];
  return {
    thesis: {
      statement: "you lose more takes to a setting you never checked than to nerves",
      why: "a reshoot usually traces back to one dial nobody looked at",
    },
    framework: { name: "the evidence tutorial", why: "the cost is the reshoot nobody sees", provenance: "offered" },
    hooks: IDEAS.map((idea, i) => ({
      text: idea.hook,
      mechanic: ["contradiction", "cost reveal", "withheld detail"][i],
    })),
    beats: [
      { atSeconds: 0, vo: "most people change the lens again and again before they check one dial", isTurn: false },
      { atSeconds: 6, vo: "here is the dial nobody checks before a lens change", isTurn: true, pivot: "turn" },
      { atSeconds: 14, vo: "show the same shot again with the dial where it should be", isTurn: false },
    ],
    shotMap: [{ beatIndex: 1, shot: "close on the dial", note: "hold it long enough to read" }],
    onScreenText: [{ atSeconds: 7, text: "the dial nobody checks" }],
    caption: { text: "the reshoot nobody sees is the one that costs you the whole day", hashtags: ["filmmaking"] },
    form: "explain_opinion",
    premise: concept.premise,
    filming: concept.filming,
    whyThisPerforms: batch.whyThisPerforms,
    disclosure: batch.disclosure,
  };
}

type MessagesBody = {
  model?: unknown;
  system?: unknown;
  messages?: { content?: unknown }[];
};

/** Which call this is, from the request body alone. */
export function classifyFakeCall(body: MessagesBody): FakeCallKind {
  const system = typeof body.system === "string" ? body.system : "";
  if (system.startsWith("You score a draft against a creator's own criteria.")) return "scoring";
  if (system.length > 0) return "generation";
  return "unrecognised";
}

/** The reply text for one call. `null` means the fake refuses it (HTTP 400). */
export function fakeReplyText(body: MessagesBody): string | null {
  const kind = classifyFakeCall(body);
  if (kind === "scoring") {
    const prompt = (body.messages ?? [])
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    const ruleIds = [...new Set(prompt.match(/\/rules\/\d+/g) ?? [])];
    return JSON.stringify({
      verdicts: ruleIds.map((ruleId) => ({
        ruleId,
        passed: true,
        note: "it does not do the thing this criterion rules out",
      })),
    });
  }
  if (kind === "generation") {
    // The mode's own task line opens the prompt: "Propose ideas." for a
    // concept batch, "Turn the creator's idea into a full script" for a script.
    const prompt = (body.messages ?? [])
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    if (prompt.startsWith("Turn the creator's idea into a full script")) {
      return JSON.stringify(fakeScript());
    }
    if (prompt.startsWith("Propose ideas.")) return JSON.stringify(fakeConceptBatch());
    return null;
  }
  return null;
}

/** The fake transport: a `fetch` plus its call counter. */
export function createLlmTransportFake(options: { ledgerPath?: string } = {}): {
  fetch: typeof fetch;
  calls: () => readonly FakeCall[];
} {
  const calls: FakeCall[] = [];
  const record = (call: FakeCall) => {
    calls.push(call);
    if (options.ledgerPath) {
      let existing: FakeCall[] = [];
      try {
        existing = JSON.parse(readFileSync(options.ledgerPath, "utf8")) as FakeCall[];
      } catch {
        existing = [];
      }
      writeFileSync(options.ledgerPath, JSON.stringify([...existing, call]));
    }
  };
  const fakeFetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as { url: string }).url;
    if (url !== ANTHROPIC_MESSAGES || (init?.method ?? "GET").toUpperCase() !== "POST") {
      return new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "fake: not a messages call" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const raw = typeof init?.body === "string" ? init.body : "";
    let body: MessagesBody = {};
    try {
      body = JSON.parse(raw) as MessagesBody;
    } catch {
      body = {};
    }
    const kind = classifyFakeCall(body);
    const model = typeof body.model === "string" ? body.model : "";
    record({ n: calls.length + 1, kind, model });
    const text = fakeReplyText(body);
    if (text === null) {
      return new Response(
        JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fake: unrecognised call" } }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        id: `msg_fake_${calls.length}`,
        type: "message",
        role: "assistant",
        model: FAKE_SERVED_MODEL,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
      { status: 200, headers: { "content-type": "application/json", "request-id": `req_fake_${calls.length}` } }
    );
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, calls: () => calls };
}

/** Install the fake where the provider factory looks for it. Returns the counter. */
export function installLlmTransportFake(options: { ledgerPath?: string } = {}) {
  const fake = createLlmTransportFake(options);
  (globalThis as unknown as Record<symbol, unknown>)[FAKE_GLOBAL] = fake.fetch;
  return fake;
}

// PRELOADED BY THE HARNESS (`--import`): install only when the server was
// started with the fake's selector, so importing this module for a unit test
// installs nothing by accident.
if (process.env.RESPIN_LLM_TRANSPORT === FAKE_SELECTOR) {
  const ledgerPath = process.env[FAKE_LEDGER_ENV];
  installLlmTransportFake(ledgerPath ? { ledgerPath } : {});
}
