// THE SAVED RECORDING PACK'S REAL ACTIONS AND PAGE, ON REAL POSTGRES (launch
// L4, R-153; E-27 / E-30).
//
// `studio-piece-action.docker.test.ts`'s arrangement: the REAL server actions
// and the REAL server component, against a real database (`TEST_DATABASE_URL`),
// on a paid tier set through the `setTier` authority pattern, with the
// provider's transport replaced BELOW the origin pin by the e2e transport-seam
// fake. Only the session (`requireUser`) is stubbed. No paid model is called.
//
// THE WALK: find concepts -> choose -> commission the script -> revise it with
// a fixed preset -> use the revision -> close the context (a fresh render, a
// fresh scope) -> reopen the saved page -> copy/export. THE PROPERTY: after the
// revision, reopening, rendering, copying and exporting add ZERO transport
// calls, ZERO ledger rows, ZERO usage rows and ZERO claims; the page shows the
// selected version; the export carries its checks and the product's
// disclosure, never the model's. The browser walk itself is L6 LA-2's.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@respin/auth", () => ({ requireUser: gate.requireUser, requireAdmin: vi.fn() }));

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[saved-pack-action.docker.test] SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run: that the real saved-pack actions and page revise, select and reopen a recording pack on a real database with zero transport calls and zero ledger rows for the read, copy and export. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const DB_NAME = "respin_test_l4saved";
const USER = "l4_saved_user";

function redirectTarget(err: unknown): string {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) throw err;
  return digest.split(";")[2] ?? "";
}

function decoded(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe.skipIf(!MAINTENANCE_URL)("the saved recording pack's actions and page on REAL Postgres", () => {
  let harness: Awaited<ReturnType<typeof import("@respin/db")["createDockerTestDb"]>>;
  let fake: ReturnType<typeof import("../e2e/support/llm-transport-fake")["installLlmTransportFake"]>;
  let profileId = "";
  let ws = "";

  beforeAll(async () => {
    const dbMod = await import("@respin/db");
    harness = await dbMod.createDockerTestDb(MAINTENANCE_URL as string, DB_NAME);
    await dbMod.seedDb(harness.db);
    const url = new URL(MAINTENANCE_URL as string);
    url.pathname = `/${DB_NAME}`;
    process.env.DATABASE_URL = url.toString();
    process.env.RESPIN_LLM_TRANSPORT = "e2e-transport-fake";
    const fakeMod = await import("../e2e/support/llm-transport-fake");
    fake = fakeMod.installLlmTransportFake();

    await dbMod.seedAuthUser(harness.db, USER, `${USER}@test.dev`);
    await dbMod.ensureUserWorkspace(harness.db, { authUserId: USER, name: "L4" });
    const scope = await dbMod.withWorkspace(harness.db, { authUserId: USER });
    ws = scope.workspaceId;
    const { createProfile } = await import("../packages/credits/src/profiles");
    profileId = (await createProfile(harness.db, scope, "Lee", new Date())).id;
    const config = await import("@respin/config");
    const { content } = await config.getActiveConfig(harness.db);
    await config.appendConfigVersion(harness.db, { ...content, stripePriceMap: { price_creator: "creator" } }, "test-admin");
    await harness.db.insert(dbMod.subscriptions).values({
      workspaceId: scope.workspaceId, stripeCustomerId: "cus_l4", stripeSubscriptionId: "sub_l4",
      stripePriceId: "price_creator", status: "active",
    });
    const { grantCredits } = await import("../packages/credits/src/ledger");
    await harness.db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: scope.workspaceId, amount: 100, expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test", refId: "l4-grant", configVersion: 1,
      })
    );
    // Voice + strategy, NO kill-test rules: one dispatch is ONE transport call.
    const evidence = [{ field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 }];
    const confirmed = { confirmedAt: new Date(), confirmedContentSha256: "0".repeat(64), activatedAt: new Date() };
    const [voice] = await harness.db.insert(dbMod.brainDocs).values({
      profileId, workspaceId: scope.workspaceId, kind: "voice", version: 1,
      content: { register: "plain and direct", sentenceRhythm: "short lines", signatureMoves: ["opens on what went wrong"], avoid: ["hype words"] },
      reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    const [strategy] = await harness.db.insert(dbMod.brainDocs).values({
      profileId, workspaceId: scope.workspaceId, kind: "strategy", version: 1,
      content: { audience: "people who film alone", positioning: "plain craft", pillars: ["lighting"] },
      reason: "Version 1: you edited this document.",
      sourceEvidence: [{ ...evidence[0], field: "/audience" }], status: "active", ...confirmed,
    }).returning();
    await harness.db.insert(dbMod.brainActivationSnapshots).values({
      profileId, workspaceId: scope.workspaceId, voiceDocId: voice.id, strategyDocId: strategy.id,
    });
    gate.requireUser.mockResolvedValue({ id: USER, name: "L4" });
  }, 120_000);

  afterAll(async () => {
    delete process.env.RESPIN_LLM_TRANSPORT;
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("respin.e2e.llmTransportFake")];
    await harness?.pool.end();
  });

  it("commission -> revise -> use this version -> reopen: the page shows the selected version, and reopening, copying and exporting add NO call and NO row", async () => {
    const dbMod = await import("@respin/db");
    const studio = await import("../app/(product)/studio/actions");
    const saved = await import("../app/(product)/studio/saved/actions");
    const { IDLE_STUDIO_STATE, IDLE_SAVED_REVISE_STATE } = await import("../app/(product)/studio/run-state");
    const { default: SavedPackPage } = await import("../app/(product)/studio/saved/[attemptId]/page");
    const { savedPackFor } = await import("../app/(product)/studio/projection");
    const pack = await import("../app/(product)/studio/saved/recording-pack");
    const { respinCredits, SAVED_REVISION_OPTIONS } = await import("@respin/credits/app-server");
    const form = (fields: Record<string, string>) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      return fd;
    };
    const rows = async () => ({
      ledger: (await harness.db.select().from(dbMod.creditLedger)).filter((r) => r.workspaceId === ws).length,
      usage: (await harness.db.select().from(dbMod.modelUsage)).filter((r) => r.workspaceId === ws).length,
      claims: (await harness.db.select().from(dbMod.generationAttempts)).filter((r) => r.workspaceId === ws).length,
      calls: fake.calls().length,
    });

    // 1-3. Concepts, choose, commission (L2's walk, through the real actions).
    const found = await studio.findConceptAction(profileId, IDLE_STUDIO_STATE, form({ platform: "tiktok", hint: "", formChoice: "auto" }));
    expect(found.latest.status, JSON.stringify(found.latest)).toBe("usable");
    const sourceAttemptId = found.lineage[found.lineage.length - 1].attemptId;
    let target = "";
    try {
      await studio.selectConceptAction(profileId, form({ sourceAttemptId, ideaIndex: "0" }));
    } catch (e) {
      target = redirectTarget(e);
    }
    const pieceId = decodeURIComponent(target.replace("/studio?piece=", ""));
    const [piece] = (await harness.db.select().from(dbMod.creativePieces)).filter((r) => r.id === pieceId);
    const committed = await studio.commissionPieceAction(profileId, pieceId, IDLE_STUDIO_STATE, form({ operationId: piece.operationAttemptId, platform: "tiktok", input: "" }));
    expect(committed.latest.status, JSON.stringify(committed.latest)).toBe("usable");
    const scriptAttemptId = piece.operationAttemptId;
    // The finished draft links to its saved pack.
    expect(committed.latest.status === "usable" ? committed.latest.attemptId : null).toBe(scriptAttemptId);

    // 4. REVISE through the saved page's action: one paid press, priced as a revision.
    const { content } = await (await import("@respin/config")).getActiveConfig(harness.db);
    const beforeRevise = await rows();
    // THE QUOTE the page would carry: the parent's own read names its config version.
    const quoted = await respinCredits.savedGeneration(await dbMod.withWorkspace(harness.db, { authUserId: USER }), profileId, scriptAttemptId);
    if (quoted.status !== "saved") throw new Error(quoted.status);
    const quote = String(quoted.view.revision.quoteConfigVersion);
    // NO QUOTE, NO RUN: the same press without the field is refused before any call or row.
    const beforeNoQuote = await rows();
    const unquoted = await saved.reviseSavedAction(profileId, scriptAttemptId, IDLE_SAVED_REVISE_STATE, form({ preset: SAVED_REVISION_OPTIONS[0].id }));
    expect(unquoted).toEqual({ status: "refused", code: "revision_preset" });
    expect(await rows()).toEqual(beforeNoQuote);
    const revised = await saved.reviseSavedAction(profileId, scriptAttemptId, IDLE_SAVED_REVISE_STATE, form({ preset: SAVED_REVISION_OPTIONS[0].id, quote }));
    expect(revised.status, JSON.stringify(revised)).toBe("done");
    if (revised.status !== "done") throw new Error("unreachable");
    expect(revised.outcome).toBe("usable");
    expect(revised.creditsChargedNow).toBe(content.creditCosts.revision);
    const afterRevise = await rows();
    expect(afterRevise.calls - beforeRevise.calls).toBe(1);
    expect(afterRevise.ledger - beforeRevise.ledger).toBe(1);
    const usage = (await harness.db.select().from(dbMod.modelUsage)).filter((u) => u.attemptId === revised.attemptId);
    expect(usage.map((u) => u.model)).toEqual(["respin-e2e-transport-fake"]);

    // 5. USE THIS VERSION — zero cost, through the real action, which redirects back.
    const shown = await respinCredits.savedGeneration(await dbMod.withWorkspace(harness.db, { authUserId: USER }), profileId, revised.attemptId);
    if (shown.status !== "saved") throw new Error(shown.status);
    const beforeSelect = await rows();
    let selected = "";
    try {
      await saved.selectSavedVersionAction(profileId, revised.attemptId, pieceId, form({ version: String(shown.view.piece!.version) }));
    } catch (e) {
      selected = redirectTarget(e);
    }
    expect(selected).toBe(`/studio/saved/${encodeURIComponent(revised.attemptId)}?selected=1`);
    expect(await rows()).toEqual(beforeSelect);
    // A STALE press from the page rendered before the move is refused, and changes nothing.
    let stale = "";
    try {
      await saved.selectSavedVersionAction(profileId, scriptAttemptId, pieceId, form({ version: String(shown.view.piece!.version) }));
    } catch (e) {
      stale = redirectTarget(e);
    }
    expect(stale).toBe(`/studio/saved/${encodeURIComponent(scriptAttemptId)}?e=creative_piece_stale`);

    // 6. CLOSE THE CONTEXT AND REOPEN: the real page, rendered twice, at a fresh scope.
    const beforeRead = await rows();
    const render = async () =>
      decoded(renderToStaticMarkup(await SavedPackPage({
        params: Promise.resolve({ attemptId: revised.attemptId }),
        searchParams: Promise.resolve({}),
      })));
    const html = await render();
    expect(await render()).toBe(html);
    expect(html).toContain("This is the version your piece uses.");
    // B2: `?selected=1` is believed only over the version the read says is selected.
    const renderWith = async (id: string, search: Record<string, string>) =>
      decoded(renderToStaticMarkup(await SavedPackPage({ params: Promise.resolve({ attemptId: id }), searchParams: Promise.resolve(search) })));
    expect(await renderWith(revised.attemptId, { selected: "1" })).toContain('data-testid="saved-selected-status"');
    const crafted = await renderWith(scriptAttemptId, { selected: "1" });
    expect(crafted).not.toContain('data-testid="saved-selected-status"');
    expect(crafted).not.toContain("This version is now the one your piece uses");
    // M2: the parent's page lists the revision and says one exists, above the presses.
    expect(crafted).toContain('data-testid="saved-already-revised"');
    expect(crafted).toContain(`href="/studio/saved/${encodeURIComponent(revised.attemptId)}"`);
    expect(html).toContain('data-testid="saved-shot-checklist"');
    expect(html).toContain("Before you post, check the platform's current rules");
    expect(html).not.toContain("mark the post as made with the help of an assistant");
    // COPY AND EXPORT, from the same read: pure, and the ledger and transport do not move.
    const view = await respinCredits.savedGeneration(await dbMod.withWorkspace(harness.db, { authUserId: USER }), profileId, revised.attemptId);
    if (view.status !== "saved") throw new Error(view.status);
    const projected = savedPackFor(view.view);
    const md = pack.recordingPackMarkdown(projected);
    const text = pack.scriptText(projected);
    expect(md).toContain("## Checks before you film");
    expect(md).toContain("Before you film: confirm every event and result here really happened");
    expect(md).not.toContain("mark the post as made with the help of an assistant");
    expect(text).toContain("Disclosure: Before you post");
    expect(html).toContain(md.split("\n")[0]);
    expect(await rows()).toEqual(beforeRead);

    // A1 ON THE REAL PAGE: a stored rule verdict whose MODEL NOTE quotes the
    // model's disclosure reaches neither the page, the copied script nor the
    // export; the verdict reads as the creator's own rule (none here: no
    // kill-test document, so "one of your rules").
    // The note QUOTES the model's own disclosure from this run's transport fake.
    const NOTE = "zqxvplantednote: mark the post as made with the help of an assistant";
    const [row] = (await harness.db.select().from(dbMod.generations)).filter((g) => g.attemptId === revised.attemptId);
    const kt = row.killTest as Record<string, unknown>;
    // Raw SQL: `drizzle-orm` is not a dependency of the app package.
    await harness.pool.query("UPDATE generations SET kill_test = $1::jsonb WHERE id = $2", [
      JSON.stringify({ ...kt, creatorRulesScored: true, creatorRuleVerdicts: [{ ruleId: "/rules/0", passed: false, note: NOTE }] }),
      row.id,
    ]);
    const plantedHtml = await render();
    const plantedView = await respinCredits.savedGeneration(await dbMod.withWorkspace(harness.db, { authUserId: USER }), profileId, revised.attemptId);
    if (plantedView.status !== "saved") throw new Error(plantedView.status);
    const plantedPack = savedPackFor(plantedView.view);
    for (const out of [plantedHtml, pack.scriptText(plantedPack), pack.recordingPackMarkdown(plantedPack), JSON.stringify(plantedView)]) {
      expect(out).not.toContain("zqxvplantednote");
      expect(out).not.toContain("made with the help of an assistant");
    }
    expect(plantedHtml).toContain("one of your rules");
  });
});
