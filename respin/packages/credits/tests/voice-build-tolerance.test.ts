import { afterEach, describe, expect, it } from "vitest";
import {
  brainDocs,
  createTestDb,
  ensureUserWorkspace,
  mintProfileScope,
  seedAuthUser,
  seedDb,
  withWorkspace,
  writeCapabilities,
  type TestDb,
} from "@respin/db";
import type { LlmProvider } from "@respin/llm";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { inferVoice, VOICE_CORPUS_MAX_POSTS } from "../src/infer-voice";
import { anySlots } from "./support/run-slots";

describe("voice-build quote tolerance", () => {
  let db: TestDb;

  afterEach(async () => {
    await (db as unknown as { $client?: { close?: () => Promise<void> } })
      .$client?.close?.();
  });

  it("maps a curly model quote back to the original UTF-16 slice before writing", async () => {
    db = await createTestDb();
    await seedAuthUser(db, "voice-tolerance-user");
    await seedDb(db);
    await ensureUserWorkspace(db, {
      authUserId: "voice-tolerance-user",
      name: "Voice tolerance",
    });
    const workspace = await withWorkspace(db, {
      authUserId: "voice-tolerance-user",
    });
    const profile = await createProfile(db, workspace, "Anna", new Date());
    await db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: workspace.workspaceId,
        amount: 500,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000),
        refType: "test",
        refId: "voice-tolerance-grant",
        configVersion: 1,
      })
    );
    const scope = await mintProfileScope(db, workspace, profile.id);
    const [post] = await Promise.all([
      writeCapabilities(scope).appendOnboardingInput({
        inputClass: "own_post",
        content: "Start 😀 I don't waste words.",
      }),
    ]);
    const provider: LlmProvider = {
      vendor: "stub",
      complete: async () => ({
        text: JSON.stringify({
          fields: [
            {
              key: "register",
              values: [
                {
                  value: "Direct",
                  inputId: post.id,
                  quote: "I don’t waste words",
                },
              ],
            },
            {
              key: "sentenceRhythm",
              values: [{ value: "[check]", inputId: null, quote: null }],
            },
            {
              key: "signatureMoves",
              values: [{ value: "[check]", inputId: null, quote: null }],
            },
            {
              key: "avoid",
              values: [{ value: "[check]", inputId: null, quote: null }],
            },
          ],
        }),
        servedModel: "fixture-model",
        usage: {
          tokensIn: 10,
          tokensOut: 10,
          raw: { input_tokens: 10, output_tokens: 10 },
        },
      }),
    };

    const result = await inferVoice(
      db,
      workspace,
      profile.id,
      provider,
      anySlots(),
      "voice-tolerance-attempt",
      1,
      VOICE_CORPUS_MAX_POSTS,
      new Date()
    );

    const [stored] = await db.select().from(brainDocs);
    expect(stored.id).toBe(result.brainDocId);
    expect(stored.sourceEvidence).toEqual([
      {
        field: "/register",
        inputId: post.id,
        quote: "I don't waste words",
        startUtf16: 9,
        endUtf16: 28,
      },
    ]);
    expect(post.content.slice(9, 28)).toBe("I don't waste words");
  });
});
