// R-165 / R-166 (billing gate H1): a HELD Stripe receipt's payload is the only
// copy of money a tombstoned workspace was paid. No payload producer may clear
// it — except the held workspace's OWN erasure, which first moves it to the
// durable `refund_owed` record (`recordRefundOwedInTx`).
//
// THE PRODUCERS ARE A LIST (Respin rule 7), checked against a scan of every
// production source file, so a fourth writer of `stripe_events.payload` is
// red here until it is listed with its exemption. And the class is proved by
// running it: a co-owner's identity erasure, then the workspace's deletion
// cancelled, then its held money replayed exactly once.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthMailRecoveryDelivery, type AuthMailPort } from "../packages/db/src/auth-mail";
import { session } from "../packages/db/src/auth-schema";
import { stripeEvents, subscriptions } from "../packages/db/src/billing-schema";
import { ensureUserWorkspace } from "../packages/db/src/bootstrap";
import { advanceDeletionOperations, type DeletionExecutorPorts } from "../packages/db/src/deletion-executor";
import type { ExternalCommandPort } from "../packages/db/src/deletion-external-commands";
import {
  cancelScopedDeletion,
  requestIdentityDeletion,
  requestWorkspaceDeletion,
} from "../packages/db/src/deletion-lifecycle";
import { journalReceiptDigest, journalRequestChecksum, type DeletionJournalPort } from "../packages/db/src/deletion-ports";
import { NO_ACTIVATION_EXCLUSIONS } from "../packages/db/src/activation";
import { migrationInventory } from "../packages/db/src/lifecycle-inventory";
import { deletionOperations } from "../packages/db/src/lifecycle-schema";
import { NOT_HELD, RETENTION_MEASURES } from "../packages/db/src/retention-clocks";
import { runRetentionTick } from "../packages/db/src/retention-receiver";
import { memberships, workspaces } from "../packages/db/src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../packages/db/src/testing";
import { withWorkspace } from "../packages/db/src/with-workspace";
import {
  handleStripeEvent,
  listStripeMoneyNeedingOperator,
  pageStripeMoneyNeedingOperator,
  replayHeldStripeEvents,
} from "../packages/credits/src/stripe/webhooks";
import { blankComments } from "./support/app-surface";
import ts from "typescript";
import { LIFECYCLE_REGISTRY, type LifecycleClassEntry } from "../packages/db/src/creator-data-registry";
import { LIFECYCLE_COLUMN_CENSUS } from "../packages/db/src/lifecycle-column-census";
import { PRODUCTION_ROOTS, sourceFilesUnder, WORKSPACE_ROOT } from "./support/source-files";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY PRODUCER THAT CLEARS `stripe_events.payload`, with the exemption each
 * carries for a held receipt. The scan below finds the files that write the
 * column; each must be named here.
 */
const HELD_PAYLOAD_PRODUCERS = [
  {
    file: "packages/db/src/retention-receiver.ts",
    producer: "purgeSubjectStripePayloadsInTx — identity and workspace erasure",
    exemption: "AND outcome <> 'held_tombstoned'",
  },
  {
    file: "packages/db/src/retention-receiver.ts",
    producer: "sweepOne — the 90-day clock, driven by RETENTION_MEASURES",
    exemption: "precondition: NOT_HELD on every stripe_events measure that redacts payload",
  },
] as const;

/**
 * Does this source write `stripe_events.payload` — or write `stripe_events`
 * through a `set` this scan cannot PROVE payload-free? PARSED, not pattern
 * matched (R-166 follow-up: the regex missed a nested object before the key,
 * a `.set(variable)`, and anything spread in):
 *   - drizzle: a `.set(arg)` whose chain holds `.update(stripeEvents)`, or an
 *     `onConflictDoUpdate({ set })` whose chain holds `.insert(stripeEvents)`.
 *     `arg` is payload-free only as an object literal of plain, non-computed
 *     keys none of which is `payload`; a variable, a call, a spread or a
 *     computed key is UNPROVABLE and counts as a write;
 *   - raw SQL: a template or string literal holding `UPDATE stripe_events SET`
 *     whose SET list names `payload`, or interpolates anything.
 */
function writesStripePayload(source: string): boolean {
  const file = ts.createSourceFile("scan.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const chainHas = (node: ts.Expression, method: string): boolean => {
    let current: ts.Expression = node;
    for (;;) {
      if (ts.isCallExpression(current)) {
        const callee = current.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === method &&
          current.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === "stripeEvents")
        ) {
          return true;
        }
        current = callee;
      } else if (ts.isPropertyAccessExpression(current) || ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
        current = current.expression;
      } else {
        return false;
      }
    }
  };
  const provablyPayloadFree = (arg: ts.Expression | undefined): boolean =>
    arg !== undefined &&
    ts.isObjectLiteralExpression(arg) &&
    arg.properties.every(
      (property) =>
        (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text !== "payload"
    );
  const sqlWritesPayload = (text: string): boolean => {
    const match = /UPDATE\s+"?stripe_events"?\s+SET\b([\s\S]*?)(?:\bWHERE\b|$)/i.exec(text);
    return match !== null && (/\bpayload\b/i.test(match[1]!) || /\$\{/.test(match[1]!));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "set" && chainHas(node.expression.expression, "update") && !provablyPayloadFree(node.arguments[0])) {
        found = true;
      }
      if (method === "onConflictDoUpdate" && chainHas(node.expression.expression, "insert")) {
        const config = node.arguments[0];
        const setProperty =
          config && ts.isObjectLiteralExpression(config)
            ? config.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === "set")
            : undefined;
        if (!setProperty || !ts.isPropertyAssignment(setProperty) || !provablyPayloadFree(setProperty.initializer)) found = true;
      }
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      if (sqlWritesPayload(node.getText(file))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Every registry row covering `stripe_events.payload` must be the payload
 * RECEIVER's (`delete_explicit` on its clock, `stripe_payload_receiver`), never
 * an erasure-time action: those run at erasure and would reach a held row.
 */
function payloadRegistryViolations(rows: readonly LifecycleClassEntry[]): string[] {
  const census = LIFECYCLE_COLUMN_CENSUS.stripe_events!;
  return rows
    .filter((row) => row.table === "stripe_events")
    .filter((row) => {
      const set = row.fieldSet;
      const columns =
        set.kind === "columns" ? set.columns : set.kind === "remaining_columns" ? census.filter((c) => !(set.excluding as readonly string[]).includes(c)) : census;
      return columns.includes("payload");
    })
    .filter((row) => row.action !== "delete_explicit" || row.executor !== "stripe_payload_receiver")
    .map((row) => `${row.rowClass}::${row.fieldSet.name}::${row.action}`);
}

describe("H1: every stripe_events payload producer honours the held exemption", () => {
  it("the files that write stripe_events.payload are exactly the listed producers", () => {
    const writers = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter((file) => !/\.test\.tsx?$/.test(file.file) && !file.file.startsWith("tests/"))
      .filter((file) => writesStripePayload(file.text))
      .map((file) => file.file);
    expect([...new Set(writers)].sort()).toEqual([...new Set(HELD_PAYLOAD_PRODUCERS.map((p) => p.file))].sort());
  });

  it("PLANTED: the scanner catches every write shape, and not a comment or a provably payload-free set", () => {
    // raw SQL, direct and interpolated
    expect(writesStripePayload("await tx.execute(sql`UPDATE \"stripe_events\" SET payload = '{}'::jsonb`)")).toBe(true);
    expect(writesStripePayload("await tx.execute(sql`UPDATE stripe_events SET ${column} = '{}' WHERE id = ${id}`)")).toBe(true);
    // drizzle, direct
    expect(writesStripePayload("await db.update(stripeEvents).set({ outcome: 'x', payload: {} })")).toBe(true);
    // a NESTED object before the key (the regex's blind spot)
    expect(writesStripePayload("await db.update(stripeEvents).set({ meta: { a: 1 }, payload })")).toBe(true);
    // a VARIABLE, a spread, a computed key, a call
    expect(writesStripePayload("const patch = { payload: {} };\nawait db.update(stripeEvents).set(patch)")).toBe(true);
    expect(writesStripePayload("await db.update(stripeEvents).set({ ...patch })")).toBe(true);
    expect(writesStripePayload("await db.update(stripeEvents).set({ [key]: {} })")).toBe(true);
    expect(writesStripePayload("await tx.update(stripeEvents).set(build()).where(x)")).toBe(true);
    // an upsert arm
    expect(writesStripePayload("await db.insert(stripeEvents).values(v).onConflictDoUpdate({ target: t, set: { payload: {} } })")).toBe(true);
    // NOT counted: comments, other tables, provably payload-free sets
    expect(writesStripePayload("// UPDATE stripe_events SET payload = '{}'")).toBe(false);
    expect(writesStripePayload("await db.update(stripeEvents).set({ outcome: 'processed', meta: { payload: 1 } })")).toBe(false);
    expect(writesStripePayload("await db.update(subscriptions).set(patch)")).toBe(false);
  });

  it("no lifecycle registry row covering stripe_events.payload acts at erasure — only the payload receiver's clock", () => {
    expect(payloadRegistryViolations(LIFECYCLE_REGISTRY)).toEqual([]);
    // PLANTED: an erasure-time action over a field set that includes payload.
    const receiver = LIFECYCLE_REGISTRY.find((row) => row.table === "stripe_events" && row.fieldSet.name === "provider_payload")!;
    const planted = [
      { ...receiver, action: "pseudonymise", executor: "identifier_scrubber" },
      { ...receiver, fieldSet: { name: "everything", kind: "remaining_columns", excluding: ["workspace_id"] }, action: "pseudonymise" },
    ] as unknown as LifecycleClassEntry[];
    expect(payloadRegistryViolations(planted)).toHaveLength(2);
  });

  it("the erasure purge excludes a held receipt in the statement that claims its rows", () => {
    const receiver = sourceFilesUnder(["packages"]).find((file) => file.file === HELD_PAYLOAD_PRODUCERS[0].file)!;
    const purge = blankComments(receiver.text).split("export async function purgeSubjectStripePayloadsInTx")[1]!.split(
      "\nasync function "
    )[0]!;
    expect(purge).toContain(HELD_PAYLOAD_PRODUCERS[0].exemption);
  });

  it("every retention measure that redacts stripe_events.payload carries NOT_HELD", () => {
    const payloadMeasures = RETENTION_MEASURES.filter(
      (measure) =>
        measure.table === "stripe_events" &&
        measure.effect.kind === "redact_columns" &&
        measure.effect.columns.some((column) => column.column === "payload")
    );
    expect(payloadMeasures.length).toBe(3);
    for (const measure of payloadMeasures) expect(measure.precondition).toEqual(NOT_HELD);
  });
});

// ---------------------------------------------------------------------------
// The class, run.

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const MIGRATIONS = join(WORKSPACE_ROOT, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }))
);

function journal(): DeletionJournalPort {
  return {
    appendTransition: async (request) => {
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return { outcome: "confirmed" as const, ...request, ...object, receiptDigest: journalReceiptDigest(request, object) };
    },
  };
}

const commands: ExternalCommandPort = {
  execute: async (command) => ({ outcome: "succeeded" as const, providerRef: `${command.kind}:ok` }),
  reconcile: async () => ({ outcome: "succeeded" as const }),
};
const mailer: AuthMailPort = { send: async () => ({ outcome: "accepted", providerMessageId: "re_ok" }) };

async function addSession(db: TestDb, authUserId: string, id: string) {
  await db.insert(session).values({
    id,
    token: `token-${id}`,
    userId: authUserId,
    expiresAt: new Date(Date.now() + HOUR),
    updatedAt: new Date(),
    reauthenticatedAt: new Date(),
    reauthenticatedMethod: "password",
  });
}

/**
 * Raw SQL on the test connection. The root workspace does not depend on
 * drizzle-orm (so `eq`/`sql` are not importable here); PGlite's own client
 * takes parameterised text.
 */
async function run(db: TestDb, text: string, params: unknown[] = []): Promise<void> {
  await (db as unknown as { $client: { query(q: string, p: unknown[]): Promise<unknown> } }).$client.query(text, params);
}

async function backdateGrace(db: TestDb, operationId: string) {
  const past = new Date(Date.now() - DAY);
  const current = await operation(db, operationId);
  await run(db, `UPDATE "deletion_operations" SET "grace_expires_at" = $1 WHERE "id" = $2`, [past, operationId]);
  if (current.scope === "identity") {
    await run(
      db,
      `UPDATE "deletion_operations" SET "recovery_expires_at" = $1, "recovery_delivery_attempted_at" = $2, "recovery_delivered_at" = $3 WHERE "id" = $4`,
      [past, new Date(past.getTime() - HOUR), new Date(past.getTime() - HOUR + 1_000), operationId]
    );
  }
}

const operation = async (db: TestDb, id: string) =>
  (await db.select().from(deletionOperations)).find((row) => row.id === id)!;
const stripeEvent = async (db: TestDb, id: string) =>
  (await db.select().from(stripeEvents)).find((row) => row.id === id)!;

const HELD_ID = "evt_held_w";
const heldEvent = (workspaceId: string) => ({
  id: HELD_ID,
  object: "event",
  type: "checkout.session.completed",
  data: { object: { object: "checkout.session", id: "cs_held_w", amount_total: 1900, currency: "usd", metadata: { workspace_id: workspaceId } } },
});

describe("H1, run: a co-owner's identity erasure, then the workspace's deletion cancelled, then its held money replays exactly once", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("the held payload survives the co-owner's erasure and replays once after the cancellation", async () => {
    await seedAuthUser(db, "owner-auth", "owner@example.test");
    await seedAuthUser(db, "coowner-auth", "coowner@example.test");
    const owner = await ensureUserWorkspace(db, { authUserId: "owner-auth", name: "Owner" });
    const coowner = await ensureUserWorkspace(db, { authUserId: "coowner-auth", name: "Coowner" });
    const W = owner.workspace.id;
    await db.insert(memberships).values({ userId: coowner.user.id, workspaceId: W, role: "owner" });
    await addSession(db, "owner-auth", "session-owner-auth");
    await addSession(db, "coowner-auth", "session-coowner-auth");
    await db.insert(subscriptions).values({
      workspaceId: W,
      stripeCustomerId: "cus_w",
      status: "none",
      billingContactUserId: owner.user.id,
    });
    const journalPort = journal();

    // W is deleted by its owner: tombstoned, grace open.
    const scope = await withWorkspace(db, { authUserId: "owner-auth", workspaceId: W });
    const wDeletion = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "w-deletion-1", typedName: owner.workspace.name },
      journalPort
    );
    expect(wDeletion.state).toBe("tombstoned");
    // Stripe collects money for W while it is tombstoned: HELD.
    await db.insert(stripeEvents).values({
      id: HELD_ID,
      type: "checkout.session.completed",
      payload: heldEvent(W),
      workspaceId: W,
      stripeCustomerId: "cus_w",
      receiptAttribution: "workspace_attributed",
      outcome: "held_tombstoned",
    });

    // The CO-OWNER erases their account. W is under deletion, so it is not
    // cascaded; their own sole-owned workspace is.
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, mailer, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}#${secret}`,
    });
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-coowner-auth", idempotencyKey: "coowner-identity-1" },
      { recoveryDelivery, journal: journalPort, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(identity).toMatchObject({ acknowledged: true });
    const cascaded = (await db.select().from(deletionOperations)).find(
      (row) => row.scope === "workspace" && row.workspaceId === coowner.workspace.id
    );
    const ports: DeletionExecutorPorts = { journal: journalPort, commands, enablement: { erasureEnabled: () => true } };
    const advance = () =>
      advanceDeletionOperations(db, ports, { workerName: "h1", migrations, activationExclusions: NO_ACTIVATION_EXCLUSIONS });
    const trace: string[] = [];
    for (let tick = 0; tick < 2; tick += 1) {
      for (const o of (await advance()).outcomes) trace.push(`${o.scope}:${o.from}->${o.to ?? "wait"}:${o.code}`);
    }
    // Only the co-owner's two operations leave grace; W's stays open.
    await backdateGrace(db, cascaded!.id);
    await backdateGrace(db, identity.operation.id);
    for (let tick = 0; tick < 12; tick += 1) {
      for (const o of (await advance()).outcomes) trace.push(`${o.scope}:${o.from}->${o.to ?? "wait"}:${o.code}`);
      if ((await operation(db, identity.operation.id)).state === "complete") break;
    }
    expect((await operation(db, identity.operation.id)).state, trace.join("\n")).toBe("complete");

    // THE CLAIM: the co-owner's erasure purged every payload it reaches (W
    // included, through the suspended membership) EXCEPT the held one.
    expect(await stripeEvent(db, HELD_ID)).toMatchObject({ outcome: "held_tombstoned", payload: heldEvent(W) });

    // The owner cancels W's deletion inside its grace window.
    const cancelled = await cancelScopedDeletion(db, wDeletion.id, { sessionId: "session-owner-auth" }, journalPort);
    expect(cancelled.state).toBe("cancelled");
    expect((await db.select().from(workspaces)).find((row) => row.id === W)!.lifecycleState).toBe("active");

    // ...and the held money replays EXACTLY ONCE.
    const dispatch = vi.fn(async () => "processed" as const);
    expect(await replayHeldStripeEvents(db, W, { dispatch })).toEqual({
      replayed: 1,
      alreadySettled: 0,
      failed: 0,
      stillHeld: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0] as unknown[])[1]).toMatchObject({ id: HELD_ID, type: "checkout.session.completed" });
    expect((await stripeEvent(db, HELD_ID)).outcome).toBe("processed");
    expect(await replayHeldStripeEvents(db, W, { dispatch })).toEqual({
      replayed: 0,
      alreadySettled: 0,
      failed: 0,
      stillHeld: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("the 90-day clock redacts an old settled payload and keeps an old HELD one", async () => {
    await seedAuthUser(db, "clock-auth", "clock@example.test");
    const owner = await ensureUserWorkspace(db, { authUserId: "clock-auth", name: "Clock" });
    const W = owner.workspace.id;
    const old = new Date(Date.now() - 100 * DAY);
    await db.insert(stripeEvents).values([
      {
        id: HELD_ID,
        type: "checkout.session.completed",
        payload: heldEvent(W),
        workspaceId: W,
        stripeCustomerId: "cus_clock",
        receiptAttribution: "workspace_attributed",
        outcome: "held_tombstoned",
        receivedAt: old,
      },
      {
        id: "evt_settled_old",
        type: "customer.updated",
        payload: { id: "evt_settled_old", object: "event", type: "customer.updated", data: { object: { object: "customer" } } },
        workspaceId: W,
        stripeCustomerId: "cus_clock",
        receiptAttribution: "workspace_attributed",
        outcome: "ignored",
        receivedAt: old,
      },
    ]);
    await runRetentionTick(db, new Date());
    expect((await stripeEvent(db, HELD_ID)).payload).toEqual(heldEvent(W));
    expect((await stripeEvent(db, "evt_settled_old")).payload).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Late money: an event that settles AFTER its workspace's erasure.

describe("R-166 (billing note): money that settles after the workspace is erased", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  async function erasedWorkspace(customer: string) {
    await seedAuthUser(db, "late-auth", "late@example.test");
    const owner = await ensureUserWorkspace(db, { authUserId: "late-auth", name: "Late" });
    const W = owner.workspace.id;
    await addSession(db, "late-auth", "session-late-auth");
    await db.insert(subscriptions).values({
      workspaceId: W,
      stripeCustomerId: customer,
      status: "none",
      billingContactUserId: owner.user.id,
    });
    const journalPort = journal();
    const scope = await withWorkspace(db, { authUserId: "late-auth", workspaceId: W });
    const op = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-late-auth", idempotencyKey: "late-ws-1", typedName: owner.workspace.name },
      journalPort
    );
    const ports: DeletionExecutorPorts = { journal: journalPort, commands, enablement: { erasureEnabled: () => true } };
    const advance = () =>
      advanceDeletionOperations(db, ports, { workerName: "late", migrations, activationExclusions: NO_ACTIVATION_EXCLUSIONS });
    for (let tick = 0; tick < 2; tick += 1) await advance();
    await backdateGrace(db, op.id);
    for (let tick = 0; tick < 8 && (await operation(db, op.id)).state !== "complete"; tick += 1) await advance();
    expect((await operation(db, op.id)).state).toBe("complete");
    return { W, operationId: op.id };
  }

  const lateInvoice = (id: string, customer: string) =>
    ({
      id,
      object: "event",
      type: "invoice.paid",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          object: "invoice",
          id: `in_${id}`,
          customer,
          amount_paid: 1900,
          currency: "usd",
          billing_reason: "subscription_cycle",
          lines: { data: [] },
        },
      },
    }) as unknown as Parameters<typeof handleStripeEvent>[1];

  it("LATE money for an erased workspace is recorded REFUND OWED against the erasure — never held forever — and pages once", async () => {
    const { operationId } = await erasedWorkspace("cus_late");
    expect(await handleStripeEvent(db, lateInvoice("evt_late_1", "cus_late"))).toBe("refund_owed");
    expect(await stripeEvent(db, "evt_late_1")).toMatchObject({
      outcome: "refund_owed",
      refundOwedOperationId: operationId,
      refundOwedAmount: 1900,
      refundOwedCurrency: "usd",
      moneyNeedsOperator: true,
    });
    expect((await listStripeMoneyNeedingOperator(db)).map((row) => [row.id, row.outcome])).toEqual([
      ["evt_late_1", "refund_owed"],
    ]);
    // Paged ONCE: the sweep stamps it, and the next sweep has nothing new.
    expect(await pageStripeMoneyNeedingOperator(db)).toBe(1);
    expect(await pageStripeMoneyNeedingOperator(db)).toBe(0);
    // Still on the operator's list after paging — the list is the record.
    expect(await listStripeMoneyNeedingOperator(db)).toHaveLength(1);
  });

  it("money for a customer NO workspace maps to is flagged for the operator and paged once; a non-money event is not", async () => {
    expect(await handleStripeEvent(db, lateInvoice("evt_orphan_1", "cus_nobody"))).toBe("refused_unknown_customer");
    expect((await stripeEvent(db, "evt_orphan_1")).moneyNeedsOperator).toBe(true);
    const customerUpdated = {
      id: "evt_orphan_2",
      object: "event",
      type: "customer.updated",
      created: Math.floor(Date.now() / 1000),
      data: { object: { object: "customer", id: "cus_nobody" } },
    } as unknown as Parameters<typeof handleStripeEvent>[1];
    await handleStripeEvent(db, customerUpdated);
    expect((await stripeEvent(db, "evt_orphan_2")).moneyNeedsOperator).toBe(false);
    expect(await pageStripeMoneyNeedingOperator(db)).toBe(1);
    expect((await listStripeMoneyNeedingOperator(db)).map((row) => row.id)).toEqual(["evt_orphan_1"]);
  });
});
