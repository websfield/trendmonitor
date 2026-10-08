// THE STUDIO'S PIECE ACTIONS, EXECUTED ON REAL POSTGRES (launch L2, E-26 /
// re-check finding 6; owner decision H-2 option C).
//
// `results-log-action.test.tsx` mocks the database, so it cannot prove that an
// operation id survives a refresh. This file runs the REAL server actions —
// `findConceptAction`, `selectConceptAction`, `commissionPieceAction`,
// `newGenerationAction` — against a real database (`TEST_DATABASE_URL`), on a
// paid tier set through the `setTier` authority pattern, with the provider's
// transport replaced BELOW the origin pin by the e2e transport-seam fake (the
// one sanctioned selector, against a database whose name carries the test
// marker). Only the session (`requireUser`) is stubbed.
//
// THE PROPERTY: across a resubmit and a refresh there is ONE claim, ONE debit
// and ONE fake-transport call for the script; "New generation" mints a new id.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@respin/auth", () => ({ requireUser: gate.requireUser, requireAdmin: vi.fn() }));

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[studio-piece-action.docker.test] SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run: that the real Studio piece actions keep ONE operation id across resubmit and refresh (one claim, one debit, one transport call) and that New generation mints a new id. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const DB_NAME = "respin_test_l2action";
const USER = "l2_action_user";

/** The redirect target a server action threw (Next's control-flow error). */
function redirectTarget(err: unknown): string {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) throw err;
  return digest.split(";")[2] ?? "";
}

describe.skipIf(!MAINTENANCE_URL)("the Studio piece actions on REAL Postgres", () => {
  let harness: Awaited<ReturnType<typeof import("@respin/db")["createDockerTestDb"]>>;
  let fake: ReturnType<typeof import("../e2e/support/llm-transport-fake")["installLlmTransportFake"]>;
  let profileId = "";
  let ws = "" as unknown as import("@respin/db").VerifiedWorkspaceId;

  beforeAll(async () => {
    const dbMod = await import("@respin/db");
    harness = await dbMod.createDockerTestDb(MAINTENANCE_URL as string, DB_NAME);
    await dbMod.seedDb(harness.db);
    const url = new URL(MAINTENANCE_URL as string);
    url.pathname = `/${DB_NAME}`;
    // The SERVER's own environment, as the actions read it.
    process.env.DATABASE_URL = url.toString();
    process.env.RESPIN_LLM_TRANSPORT = "e2e-transport-fake";
    const fakeMod = await import("../e2e/support/llm-transport-fake");
    fake = fakeMod.installLlmTransportFake();

    await dbMod.seedAuthUser(harness.db, USER, `${USER}@test.dev`);
    await dbMod.ensureUserWorkspace(harness.db, { authUserId: USER, name: "L2" });
    const scope = await dbMod.withWorkspace(harness.db, { authUserId: USER });
    ws = scope.workspaceId;
    const { createProfile } = await import("../packages/credits/src/profiles");
    profileId = (await createProfile(harness.db, scope, "Lee", new Date())).id;
    // A PAID TIER through the one authority (`generate.test.ts`' `setTier`).
    const config = await import("@respin/config");
    const { content } = await config.getActiveConfig(harness.db);
    await config.appendConfigVersion(harness.db, { ...content, stripePriceMap: { price_creator: "creator" } }, "test-admin");
    await harness.db.insert(dbMod.subscriptions).values({
      workspaceId: ws, stripeCustomerId: "cus_l2", stripeSubscriptionId: "sub_l2",
      stripePriceId: "price_creator", status: "active",
    });
    const { grantCredits } = await import("../packages/credits/src/ledger");
    await harness.db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws, amount: 100, expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test", refId: "l2-grant", configVersion: 1,
      })
    );
    // An activated brain: voice + strategy, and NO kill-test rules — so one
    // dispatch is exactly ONE transport call (no scoring call).
    const evidence = [{ field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 }];
    const confirmed = { confirmedAt: new Date(), confirmedContentSha256: "0".repeat(64), activatedAt: new Date() };
    const [voice] = await harness.db.insert(dbMod.brainDocs).values({
      profileId, workspaceId: ws, kind: "voice", version: 1,
      content: { register: "plain and direct", sentenceRhythm: "short lines", signatureMoves: ["opens on what went wrong"], avoid: ["hype words"] },
      reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    const [strategy] = await harness.db.insert(dbMod.brainDocs).values({
      profileId, workspaceId: ws, kind: "strategy", version: 1,
      content: { audience: "people who film alone", positioning: "plain craft", pillars: ["lighting"] },
      reason: "Version 1: you edited this document.",
      sourceEvidence: [{ ...evidence[0], field: "/audience" }], status: "active", ...confirmed,
    }).returning();
    await harness.db.insert(dbMod.brainActivationSnapshots).values({
      profileId, workspaceId: ws, voiceDocId: voice.id, strategyDocId: strategy.id,
    });
    gate.requireUser.mockResolvedValue({ id: USER, name: "L2" });
  }, 120_000);

  afterAll(async () => {
    delete process.env.RESPIN_LLM_TRANSPORT;
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("respin.e2e.llmTransportFake")];
    await harness?.pool.end();
  });

  it("one operation id across resubmit and refresh: ONE claim, ONE debit, ONE transport call; New generation mints a new id", async () => {
    const dbMod = await import("@respin/db");
    const actions = await import("../app/(product)/studio/actions");
    const { IDLE_STUDIO_STATE } = await import("../app/(product)/studio/run-state");
    const form = (fields: Record<string, string>) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      return fd;
    };

    // 1. FIND MY NEXT CONCEPT — one generation through the real action.
    const found = await actions.findConceptAction(profileId, IDLE_STUDIO_STATE, form({ platform: "tiktok", hint: "", formChoice: "auto" }));
    expect(found.latest.status, JSON.stringify(found.latest)).toBe("usable");
    expect(fake.calls()).toHaveLength(1);
    const sourceAttemptId = found.lineage[found.lineage.length - 1].attemptId;

    // 2. CHOOSE — zero cost, and the action redirects to the piece's own page.
    const balanceBefore = (await harness.db.select().from(dbMod.creditLedger)).filter((r) => r.workspaceId === ws).length;
    let target = "";
    try {
      await actions.selectConceptAction(profileId, form({ sourceAttemptId, ideaIndex: "1" }));
    } catch (e) {
      target = redirectTarget(e);
    }
    const pieceId = decodeURIComponent(target.replace("/studio?piece=", ""));
    expect(target).toMatch(/^\/studio\?piece=/);
    expect((await harness.db.select().from(dbMod.creditLedger)).filter((r) => r.workspaceId === ws).length).toBe(balanceBefore);
    const pieceRow = async () =>
      (await harness.db.select().from(dbMod.creativePieces)).find((r) => r.id === pieceId)!;
    const operationId = (await pieceRow()).operationAttemptId;

    // 3. CONFIRM — then RESUBMIT (a duplicate / a lost response) and REFRESH
    // (re-read the piece's id, as the page does) and submit again.
    const confirm = (id: string) =>
      actions.commissionPieceAction(profileId, pieceId, IDLE_STUDIO_STATE, form({ operationId: id, platform: "tiktok", input: "" }));
    const first = await confirm(operationId);
    expect(first.latest.status, JSON.stringify(first.latest)).toBe("usable");
    const resubmit = await confirm(operationId);
    expect(resubmit.latest.status).toBe("replayed");
    const refreshedId = (await pieceRow()).operationAttemptId;
    expect(refreshedId).toBe(operationId);
    const afterRefresh = await confirm(refreshedId);
    expect(afterRefresh.latest.status).toBe("replayed");

    const claims = (await harness.db.select().from(dbMod.generationAttempts)).filter((r) => r.attemptId === operationId);
    expect(claims).toHaveLength(1);
    const debits = (await harness.db.select().from(dbMod.creditLedger)).filter((r) => r.workspaceId === ws && r.refType === "inference" && r.refId === operationId);
    expect(debits).toHaveLength(1);
    // ONE call for the concept batch, ONE for the script — and none since.
    expect(fake.calls()).toHaveLength(2);
    // THE WITNESS: the usage rows carry the fake's sentinel served model.
    const usage = (await harness.db.select().from(dbMod.modelUsage)).filter((u) => u.attemptId === operationId);
    expect(usage.map((u) => u.model)).toEqual(["respin-e2e-transport-fake"]);
    expect((await pieceRow()).state).toBe("scripted");

    // 4. NEW GENERATION — another id, even for the identical request.
    const version = (await pieceRow()).version;
    try {
      await actions.newGenerationAction(profileId, pieceId, form({ version: String(version) }));
    } catch (e) {
      expect(redirectTarget(e)).toBe(`/studio?piece=${encodeURIComponent(pieceId)}`);
    }
    const newId = (await pieceRow()).operationAttemptId;
    expect(newId).not.toBe(operationId);
    // The OLD id still replays its own script; the new one is a new operation.
    expect((await confirm(operationId)).latest.status).toBe("replayed");
    const second = await confirm(newId);
    expect(second.latest.status).toBe("usable");
    expect(fake.calls()).toHaveLength(3);
  });
});
