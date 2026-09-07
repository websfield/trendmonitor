// Slice 8c stage B — THE PASTED REFERENCE'S MONEY (R8, R9, R10; R-98;
// REQ-G04/G06/E05). Every requirement's witness at the package layer, plus the
// three planted mutations the card names for this half (M1 debit outside the
// transaction, M2 refund not unique per claim, M6 tier gate removed), each
// reddening a case named below. The Docker suite beside this one
// (`pasted-reference.docker.test.ts`) drives the two writers under true
// concurrency, which PGlite cannot.
//
// NO LITERAL PRICE IN THIS FILE (R10): every expected amount is read from the
// active config document or from the row that was written.
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  PostContentError,
  ProfileRoleError,
  WorkspacePausedError,
  autopsyCacheClaims,
  createTestDb,
  creatorProfiles,
  creditLedger,
  ensureUserWorkspace,
  onboardingInputs,
  pastedReferencesForProfile,
  schema,
  seedAuthUser,
  seedDb,
  subscriptions,
  trendItems,
  trendSources,
  trendTranscripts,
  withWorkspace,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { submitted, type ReferenceIntakePort } from "@respin/trends";
import { deriveBalance } from "../src/balance";
import { grantCredits } from "../src/ledger";
import { recordPauseEnd, recordPauseStart } from "../src/pause";
import { ENTITLEMENT_TIERS } from "../src/mode-access";
import {
  InsufficientCreditsError,
  PastedReferenceInputError,
  PastedReferenceTierError,
} from "../src/errors";
import {
  PASTED_REFERENCE_CREDIT_COST_KEY,
  PASTED_REFERENCE_DEBIT_REF_TYPE,
  PASTED_REFERENCE_REFUND_REF_TYPE,
  PASTED_REFERENCE_TIERS,
  pastedReferenceIntakePort,
  pastedReferenceQuote,
  settleParkedAutopsies,
  submitPastedReference,
} from "../src/pasted-reference";

const URL_A = "https://www.youtube.com/watch?v=abc123";
const URL_B = "https://www.youtube.com/watch?v=def456";
const TRANSCRIPT = "Open on the tradeoff.\nShow the pan.\nReturn to the tradeoff.";
/**
 * A SECOND paste needs a second transcript, not just a second URL: stage A
 * keys a profile's autopsy cache identity on the TRANSCRIPT DIGEST, so the
 * same text under another URL is refused as "already bound to another item".
 */
const TRANSCRIPT_B = "Start on the bill.\nShow the receipt.\nEnd on the bill.";
/** A THIRD pair, for the settlement partition (three parked claims at once). */
const URL_C = "https://www.youtube.com/watch?v=ghi789";
const TRANSCRIPT_C = "Open on the empty shelf.\nShow the list.\nEnd on the shelf.";
const HOUR = 3_600_000;
/** A LIVE clock: the writer runs `assertWriteClock` (60s skew). */
const now = () => new Date();

type Fixture = {
  db: TestDb;
  scope: WorkspaceScope;
  /** The two profiles of ONE workspace — the sibling is the cross-profile witness. */
  a: { id: string };
  b: { id: string };
  workspaceId: string;
};

/**
 * A workspace on a PAID tier through the ONE authority — a live `subscriptions`
 * row plus a price the config maps — with `credits` granted and two profiles.
 * `tier: "free"` leaves the subscription out, which IS Free (B6).
 */
async function fixture(
  opts: { tier?: "free" | "creator" | "pro" | "studio"; credits?: number } = {}
): Promise<Fixture> {
  const tier = opts.tier ?? "creator";
  const db = await createTestDb();
  await seedAuthUser(db, "paste_owner");
  await seedDb(db);
  const { workspace } = await ensureUserWorkspace(db, { authUserId: "paste_owner", name: "Paste" });
  const scope = await withWorkspace(db, { authUserId: "paste_owner" });
  if (tier !== "free") {
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { [`price_${tier}`]: tier } },
      "test-admin"
    );
    await db.insert(subscriptions).values({
      workspaceId: workspace.id,
      stripeCustomerId: "cus_paste",
      stripeSubscriptionId: "sub_paste",
      stripePriceId: `price_${tier}`,
      status: "active",
    });
  }
  const credits = opts.credits ?? 100;
  if (credits > 0) {
    await db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: scope.workspaceId,
        amount: credits,
        expiresAt: new Date(Date.now() + 365 * 24 * HOUR),
        refType: "test",
        refId: "paste-grant",
        configVersion: 1,
      })
    );
  }
  const [a, b] = await db
    .insert(creatorProfiles)
    .values([
      { workspaceId: workspace.id, displayName: "Profile A" },
      { workspaceId: workspace.id, displayName: "Profile B" },
    ])
    .returning();
  return { db, scope, a, b, workspaceId: workspace.id };
}

/** A second seat in the SAME workspace with the given role. */
async function seatScope(db: TestDb, workspaceId: string, role: "viewer" | "editor"): Promise<WorkspaceScope> {
  const authUserId = `paste_${role}`;
  await seedAuthUser(db, authUserId);
  const [user] = await db.insert(schema.users).values({ authUserId }).returning();
  await db.insert(schema.memberships).values({ userId: user.id, workspaceId, role });
  return withWorkspace(db, { authUserId, workspaceId });
}

/** Row counts across the five tables one paste writes, plus the two ledger shapes — the "before any row" oracle. */
async function counts(db: TestDb) {
  const ledger = await db.select().from(creditLedger);
  return {
    inputs: (await db.select().from(onboardingInputs)).length,
    sources: (await db.select().from(trendSources)).length,
    items: (await db.select().from(trendItems)).length,
    transcripts: (await db.select().from(trendTranscripts)).length,
    claims: (await db.select().from(autopsyCacheClaims)).length,
    debits: ledger.filter((r) => r.refType === PASTED_REFERENCE_DEBIT_REF_TYPE).length,
    refunds: ledger.filter((r) => r.refType === PASTED_REFERENCE_REFUND_REF_TYPE).length,
  };
}
const NOTHING = { inputs: 0, sources: 0, items: 0, transcripts: 0, claims: 0, debits: 0, refunds: 0 };

const price = async (db: TestDb) =>
  (await getActiveConfig(db)).content.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY];
const balance = async (db: TestDb, scope: WorkspaceScope) =>
  (await deriveBalance(db, scope.workspaceId)).balance;

async function debitFor(db: TestDb, claimId: string) {
  return db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.refType, PASTED_REFERENCE_DEBIT_REF_TYPE), eq(creditLedger.refId, claimId)));
}
async function refundFor(db: TestDb, claimId: string) {
  return db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.refType, PASTED_REFERENCE_REFUND_REF_TYPE), eq(creditLedger.refId, claimId)));
}
const park = (db: TestDb, claimId: string) =>
  db.update(autopsyCacheClaims).set({ status: "parked", attemptCount: 5 }).where(eq(autopsyCacheClaims.id, claimId));

describe("R10: every number cites its source", () => {
  it("the price key is `creditCosts.autopsy`, and the seed prices it above zero so the witnesses below are non-vacuous", () => {
    expect(PASTED_REFERENCE_CREDIT_COST_KEY).toBe("autopsy");
    expect(CONFIG_V1_SEED.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY]).toBeGreaterThan(0);
  });

  it("the paid-tier set is DERIVED from the tier vocabulary — everything above Free, and only `free` is named", () => {
    expect(PASTED_REFERENCE_TIERS).toEqual(["creator", "pro", "studio"]);
    expect(new Set([...PASTED_REFERENCE_TIERS, "free"])).toEqual(new Set(ENTITLEMENT_TIERS));
  });
});

describe("R8: submitPastedReference — the paste and its debit, one transaction (R-98)", () => {
  it("a fresh paste writes the five rows AND one `autopsy_claim` debit of the ACTIVE document's price, in one commit", async () => {
    const { db, scope, a } = await fixture();
    const cost = await price(db);
    const before = await balance(db, scope);
    const { version } = await getActiveConfig(db);

    const result = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());

    expect(result.claimStatus).toBe("pending");
    expect(result.autopsyId).toBeNull();
    expect(result.creditsChargedNow).toBe(cost);
    expect(result.configVersion).toBe(version);
    expect(result.balanceAfter).toBe(before - cost);
    expect(await balance(db, scope)).toBe(before - cost);
    expect(await counts(db)).toEqual({ ...NOTHING, inputs: 1, sources: 1, items: 1, transcripts: 1, claims: 1, debits: 1 });
    const [debit] = await debitFor(db, result.claimId);
    expect(debit).toMatchObject({
      kind: "debit",
      delta: -cost,
      refType: PASTED_REFERENCE_DEBIT_REF_TYPE,
      refId: result.claimId,
      configVersion: version,
      workspaceId: scope.workspaceId as string,
    });
  });

  it("a DUPLICATE paste lands on the existing claim and charges 0: same ids, still one debit, nothing new", async () => {
    const { db, scope, a } = await fixture();
    const first = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const after = await counts(db);
    const bal = await balance(db, scope);

    const second = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());

    expect(second.creditsChargedNow).toBe(0);
    expect(second.referenceInputId).toBe(first.referenceInputId);
    expect(second.itemId).toBe(first.itemId);
    expect(second.claimId).toBe(first.claimId);
    expect(second.balanceAfter).toBe(bal);
    expect(await counts(db)).toEqual(after);
    expect(await debitFor(db, first.claimId)).toHaveLength(1);
  });

  it("a DIFFERENT transcript for the same URL is a second claim, and a second debit", async () => {
    const { db, scope, a } = await fixture();
    const cost = await price(db);
    const first = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const second = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: `${TRANSCRIPT}\nA corrected last line.` }, now());
    expect(second.claimId).not.toBe(first.claimId);
    expect(second.creditsChargedNow).toBe(cost);
    expect((await counts(db)).debits).toBe(2);
  });

  it("THE PRICE IS THE DOCUMENT'S (config-not-literal): a doctored active document moves the charge and the stamped version", async () => {
    const { db, scope, a } = await fixture();
    const seeded = await price(db);
    const { content, version: oldVersion } = await getActiveConfig(db);
    const doctored = seeded + 5;
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: doctored } },
      "test-admin"
    );
    const { version } = await getActiveConfig(db);
    expect(version).toBeGreaterThan(oldVersion);

    const result = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(result.creditsChargedNow).toBe(doctored);
    expect(result.configVersion).toBe(version);
    const [debit] = await debitFor(db, result.claimId);
    expect(debit.delta).toBe(-doctored);
    expect(debit.configVersion).toBe(version);
  });

  it("a document that prices the autopsy at ZERO writes the claim and no debit row (a zero debit is a ledger integrity error, not a row)", async () => {
    const { db, scope, a } = await fixture();
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: 0 } },
      "test-admin"
    );
    const result = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(result.creditsChargedNow).toBe(0);
    expect(await counts(db)).toMatchObject({ claims: 1, debits: 0 });
  });

  it("`replayed` IS THE DEBIT'S EXISTENCE, NOT THE PRICE: a zero-priced FIRST paste is `replayed: false` at `creditsChargedNow: 0`, and a duplicate is `replayed: true`", async () => {
    // Round-1 billing CHANGE 6: this predicate had NO witness at the layer that
    // implements it. A reviewer reverted it to `creditsChargedNow === 0` and
    // both credits suites stayed GREEN with Docker live (34 passed). The two
    // cases below are what that revert must redden — the FIRST is the one the
    // reverted predicate gets wrong (a creator's brand-new paste would be
    // announced as "already queued"), the SECOND is its non-vacuity.
    const zero = await fixture();
    const { content } = await getActiveConfig(zero.db);
    await appendConfigVersion(
      zero.db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: 0 } },
      "test-admin"
    );
    const free = await submitPastedReference(zero.db, zero.scope, zero.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(free.creditsChargedNow).toBe(0);
    expect(free.replayed).toBe(false);

    const paid = await fixture();
    const first = await submitPastedReference(paid.db, paid.scope, paid.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(first.replayed).toBe(false);
    expect(first.creditsChargedNow).toBeGreaterThan(0);
    const second = await submitPastedReference(paid.db, paid.scope, paid.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(second.replayed).toBe(true);
    expect(second.creditsChargedNow).toBe(0);
  });

  it("a paste that LANDS ON AN EXISTING CLAIM can still be CHARGED: `replayed: false` at `creditsChargedNow > 0`, on the same claim id", async () => {
    // THE SENTENCE THIS FALSIFIES, and it was written in two places: `replayed`
    // is "true when the paste landed on an existing claim and charged nothing"
    // (`app/(product)/trends/paste-state.ts`, round 2 billing CHANGE 2 —
    // measured false). `replayed` is the DEBIT's existence. A claim minted
    // under a document pricing the autopsy at 0 carries no debit, so the next
    // paste onto that same claim, under a document that prices it, pays for it
    // — an existing claim, charged, and not a replay. Without this witness the
    // app-side docblock could drift back and no test would notice.
    const { db, scope, a } = await fixture();
    const priced = await price(db);
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: 0 } },
      "test-admin"
    );
    const free = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(free.creditsChargedNow).toBe(0);
    expect(await debitFor(db, free.claimId)).toHaveLength(0);

    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: priced } },
      "test-admin"
    );
    const again = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(again.claimId).toBe(free.claimId);
    expect(again.creditsChargedNow).toBe(priced);
    expect(again.replayed).toBe(false);
    expect(await debitFor(db, free.claimId)).toHaveLength(1);
    // ...and a THIRD paste, now that the debit exists, is the replay.
    const third = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(third.claimId).toBe(free.claimId);
    expect(third.replayed).toBe(true);
    expect(third.creditsChargedNow).toBe(0);
  });

  it("a re-paste that lands on a PARKED claim reports `claimStatus: \"parked\"` — nothing is queued, and the screen is told so rather than inferring it from `replayed`", async () => {
    // Round-1 billing CHANGE 3: `replayed` is the right sentence for "nothing
    // charged" and the wrong one for "already queued". `parked` is terminal for
    // `startAttempt` and excluded from the system queue, so this claim will
    // never run again; the same URL + transcript always lands on it. The writer
    // already returns the claim's state — this pins it as ACCURATE and
    // reachable so `/trends` can condition its copy on the state rather than on
    // the money.
    const { db, scope, a } = await fixture();
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(paste.claimStatus).toBe("pending");
    await park(db, paste.claimId);
    await settleParkedAutopsies(db, scope, a.id);

    const again = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(again.claimId).toBe(paste.claimId);
    expect(again.claimStatus).toBe("parked");
    expect(again.replayed).toBe(true);
    expect(again.creditsChargedNow).toBe(0);
    // ...and the re-paste charged nothing a second time: one debit, one refund.
    expect(await debitFor(db, paste.claimId)).toHaveLength(1);
    expect(await refundFor(db, paste.claimId)).toHaveLength(1);
  });

  it("M6 / V5 — FREE is refused with PastedReferenceTierError BEFORE ANY ROW, and the copy names the plan without selling one", async () => {
    const { db, scope, a } = await fixture({ tier: "free" });
    const err = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now()).catch((e) => e);
    expect(err).toBeInstanceOf(PastedReferenceTierError);
    expect((err as PastedReferenceTierError).tier).toBe("free");
    expect((err as Error).message).toMatch(/free/);
    expect((err as Error).message).not.toMatch(/upgrade|buy|subscribe/i);
    expect(await counts(db)).toEqual(NOTHING);
  });

  it("every PAID tier may paste", async () => {
    for (const tier of PASTED_REFERENCE_TIERS) {
      const { db, scope, a } = await fixture({ tier: tier as "creator" | "pro" | "studio" });
      const result = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
      expect(result.creditsChargedNow, tier).toBe(await price(db));
    }
  });

  it("R-118 / V5 — viewers and editors are refused before any paid intake row", async () => {
    const { db, scope, a, workspaceId } = await fixture();
    const viewer = await seatScope(db, workspaceId, "viewer");
    await expect(
      submitPastedReference(db, viewer, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now())
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await counts(db)).toEqual(NOTHING);
    const editor = await seatScope(db, workspaceId, "editor");
    await expect(
      submitPastedReference(db, editor, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now())
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await counts(db)).toEqual(NOTHING);
    void scope;
  });

  it("an OPEN PAUSE is refused with WorkspacePausedError before any row (REQ-G08)", async () => {
    const { db, scope, a } = await fixture();
    const pausedAt = now();
    await db.transaction((tx) =>
      recordPauseStart(tx, scope.workspaceId, pausedAt, new Date(pausedAt.getTime() + 30 * 24 * HOUR), pausedAt)
    );
    await expect(
      submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now())
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    expect(await counts(db)).toEqual(NOTHING);
  });

  it("V5 — a SHORT BALANCE is refused with the top-up code BEFORE ANY ROW, naming the balance and the price", async () => {
    const { db, scope, a } = await fixture({ credits: 0 });
    const cost = await price(db);
    const err = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now()).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect((err as InsufficientCreditsError).cost).toBe(cost);
    expect((err as InsufficientCreditsError).balance).toBeLessThan(cost);
    expect(await counts(db)).toEqual(NOTHING);
  });

  it("the balance that decides is the FOLD's: a balance of exactly the price passes, one below refuses", async () => {
    const cost = CONFIG_V1_SEED.creditCosts[PASTED_REFERENCE_CREDIT_COST_KEY];
    const exact = await fixture({ credits: cost });
    const ok = await submitPastedReference(exact.db, exact.scope, exact.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(ok.balanceAfter).toBe(0);
    const short = await fixture({ credits: cost - 1 });
    await expect(
      submitPastedReference(short.db, short.scope, short.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now())
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await counts(short.db)).toEqual(NOTHING);
  });

  it("STAGE A's bare input refusals surface as PastedReferenceInputError naming the FIELD, before any row", async () => {
    const { db, scope, a } = await fixture();
    const cases: { input: { sourceUrl: string; transcript: string; title?: string; niche?: string }; field: string }[] = [
      { input: { sourceUrl: "ftp://example.test/x", transcript: TRANSCRIPT }, field: "sourceUrl" },
      { input: { sourceUrl: "not a url", transcript: TRANSCRIPT }, field: "sourceUrl" },
      { input: { sourceUrl: URL_A, transcript: TRANSCRIPT, title: "t".repeat(121) }, field: "title" },
      { input: { sourceUrl: URL_A, transcript: TRANSCRIPT, niche: "never tracked" }, field: "niche" },
      { input: { sourceUrl: URL_A, transcript: 42 as unknown as string }, field: "transcript" },
    ];
    for (const c of cases) {
      const err = await submitPastedReference(db, scope, a.id, c.input, now()).catch((e) => e);
      expect(err, c.field).toBeInstanceOf(PastedReferenceInputError);
      expect((err as PastedReferenceInputError).field).toBe(c.field);
      expect((err as PastedReferenceInputError).detail.length).toBeGreaterThan(0);
    }
    // ...while slice 4's typed content refusal passes through AS ITSELF.
    await expect(
      submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: "  \n " }, now())
    ).rejects.toBeInstanceOf(PostContentError);
    expect(await counts(db)).toEqual(NOTHING);
  });

  it("M1 — ONE transaction, and rolling it back leaves NEITHER the rows NOR the debit (atomicity witness)", async () => {
    // A `db` whose `transaction` is COUNTED and, once, FORCED TO ROLL BACK after
    // the operation's callback has resolved. Correct code makes exactly one
    // top-level transaction, so the rollback removes everything. With the debit
    // moved OUTSIDE it (M1), either the intake's rows survive without a debit
    // (debit-first order) or a debit lands for a claim that was never
    // committed (intake-first order) — and the transaction count reads 2.
    const { db, scope, a } = await fixture();
    let transactions = 0;
    let rolledBack = false;
    const rollback = new Error("forced rollback (test)");
    const spied = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== "transaction") return Reflect.get(target, key, receiver);
        return (fn: (tx: unknown) => Promise<unknown>) => {
          transactions += 1;
          return target.transaction(async (tx) => {
            const out = await fn(tx);
            if (!rolledBack) {
              rolledBack = true;
              throw rollback;
            }
            return out;
          });
        };
      },
    }) as unknown as TestDb;

    await expect(
      submitPastedReference(spied, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now())
    ).rejects.toBe(rollback);
    expect(transactions, "the paste and its debit are ONE transaction").toBe(1);
    expect(await counts(db)).toEqual(NOTHING);
    expect(await balance(db, scope)).toBe(100);

    // NON-VACUITY of the spy: with no forced rollback the same handle commits
    // the paste, still in one transaction.
    rolledBack = true;
    const ok = await submitPastedReference(spied, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(transactions).toBe(2);
    expect(await debitFor(db, ok.claimId)).toHaveLength(1);
  });

  it("CROSS-PROFILE: profile A's paste is invisible to profile B's replay — B pays for its own claim", async () => {
    const { db, scope, a, b } = await fixture();
    const cost = await price(db);
    const inA = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const inB = await submitPastedReference(db, scope, b.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(inB.claimId).not.toBe(inA.claimId);
    expect(inB.creditsChargedNow).toBe(cost);
    expect((await counts(db)).debits).toBe(2);
  });
});

describe("R9: settleParkedAutopsies — one compensating credit per parked claim, idempotent, creator-scoped (R-98)", () => {
  it("V4 — a parked claim is refunded ONCE: `autopsy_refund` for the ORIGINAL debit's amount; the balance equals the pre-paste balance; a second call appends nothing", async () => {
    const { db, scope, a } = await fixture();
    const before = await balance(db, scope);
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    expect(await balance(db, scope)).toBeLessThan(before);
    await park(db, paste.claimId);

    const first = await settleParkedAutopsies(db, scope, a.id);
    expect(first).toEqual({
      refundedClaimIds: [paste.claimId],
      creditsReturned: paste.creditsChargedNow,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(await balance(db, scope)).toBe(before);
    const refunds = await refundFor(db, paste.claimId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      kind: "refund",
      delta: paste.creditsChargedNow,
      refType: PASTED_REFERENCE_REFUND_REF_TYPE,
      refId: paste.claimId,
      workspaceId: scope.workspaceId as string,
    });

    // M2: the second settlement finds the refund row, appends nothing, AND
    // SAYS SO BY NAME (round 2). `{[], 0}` alone is the same value as "this
    // claim was parked after I looked", and the screen printed "credits
    // returned" over the second state; the claim id is what tells them apart.
    const second = await settleParkedAutopsies(db, scope, a.id);
    expect(second).toEqual({
      refundedClaimIds: [],
      creditsReturned: 0,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [paste.claimId],
    });
    expect(await refundFor(db, paste.claimId)).toHaveLength(1);
    expect(await balance(db, scope)).toBe(before);
  });

  it("the refund is the ORIGINAL debit's amount, not today's price", async () => {
    const { db, scope, a } = await fixture();
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: paste.creditsChargedNow + 7 } },
      "test-admin"
    );
    await park(db, paste.claimId);
    const settled = await settleParkedAutopsies(db, scope, a.id);
    expect(settled.creditsReturned).toBe(paste.creditsChargedNow);
    expect(settled.creditsReturned).not.toBe(await price(db));
  });

  it("the refund's expiry INHERITS the consumed lot's — no new expiry window is minted (D-M1-7)", async () => {
    const { db, scope, a } = await fixture();
    const [grant] = await db.select().from(creditLedger).where(eq(creditLedger.kind, "grant"));
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    await settleParkedAutopsies(db, scope, a.id);
    const [refund] = await refundFor(db, paste.claimId);
    expect(refund.expiresAt?.getTime()).toBe(grant.expiresAt?.getTime());
  });

  it("a NON-PARKED claim never refunds — pending, and completed", async () => {
    const { db, scope, a } = await fixture();
    const pending = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const done = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_B, transcript: TRANSCRIPT_B }, now());
    await db.update(autopsyCacheClaims).set({ status: "failed", attemptCount: 3 }).where(eq(autopsyCacheClaims.id, done.claimId));
    const bal = await balance(db, scope);
    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({ refundedClaimIds: [], creditsReturned: 0, deferred: false, neverChargedClaimIds: [], alreadyRefundedClaimIds: [] });
    expect(await balance(db, scope)).toBe(bal);
    expect((await counts(db)).refunds).toBe(0);
    void pending;
  });

  it("V7 / CROSS-PROFILE — a SIBLING profile's parked claim is never settled by this profile, and is by its owner", async () => {
    const { db, scope, a, b } = await fixture();
    const before = await balance(db, scope);
    const inB = await submitPastedReference(db, scope, b.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, inB.claimId);

    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({ refundedClaimIds: [], creditsReturned: 0, deferred: false, neverChargedClaimIds: [], alreadyRefundedClaimIds: [] });
    expect(await refundFor(db, inB.claimId)).toHaveLength(0);

    expect(await settleParkedAutopsies(db, scope, b.id)).toEqual({
      refundedClaimIds: [inB.claimId],
      creditsReturned: inB.creditsChargedNow,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(await balance(db, scope)).toBe(before);
  });

  it("STATE 2 of 3 — a parked claim that was NEVER DEBITED (a zero-priced document) settles to nothing, and SAYS SO by name rather than looking like an earlier load's refund", async () => {
    // Round-1 billing CHANGE 2's second half: `{[], 0}` alone is the same
    // value as "already refunded on an earlier load", and the screen asserted
    // a return that never happened. The claim id is named, so the screen can
    // tell the two apart without guessing.
    const { db, scope, a } = await fixture();
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: 0 } },
      "test-admin"
    );
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({
      refundedClaimIds: [],
      creditsReturned: 0,
      deferred: false,
      neverChargedClaimIds: [paste.claimId],
      alreadyRefundedClaimIds: [],
    });
    expect((await counts(db)).refunds).toBe(0);

    // DISCRIMINATION, not just presence: the SAME `{[], 0}` after a real
    // refund names NO never-charged claim, so the two states differ in the
    // result and not only in the ledger.
    const priced = await fixture();
    const charged = await submitPastedReference(priced.db, priced.scope, priced.a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(priced.db, charged.claimId);
    await settleParkedAutopsies(priced.db, priced.scope, priced.a.id);
    expect(await settleParkedAutopsies(priced.db, priced.scope, priced.a.id)).toEqual({
      refundedClaimIds: [],
      creditsReturned: 0,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [charged.claimId],
    });
  });

  it("STATES 1 and 3 of 3 — an OPEN PAUSE DEFERS settlement AND REPORTS `deferred: true` (REQ-G08); the first settlement after resume returns them with `deferred: false`", async () => {
    const { db, scope, a } = await fixture();
    const before = await balance(db, scope);
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    const pausedAt = now();
    await db.transaction((tx) => recordPauseStart(tx, scope.workspaceId, pausedAt, new Date(pausedAt.getTime() + 30 * 24 * HOUR), pausedAt));

    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({
      refundedClaimIds: [],
      creditsReturned: 0,
      deferred: true,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(await refundFor(db, paste.claimId)).toHaveLength(0);

    await db.transaction((tx) => recordPauseEnd(tx, scope.workspaceId, now(), now()));
    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({
      refundedClaimIds: [paste.claimId],
      creditsReturned: paste.creditsChargedNow,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(await balance(db, scope)).toBe(before);
  });

  it("`deferred` IS THE SETTLEMENT'S OWN PAUSE READ, and it is right where the paste QUOTE is wrong: a workspace that is BOTH paused AND non-paid", async () => {
    // Round-1 billing CHANGE 2 / learning CHANGE 4, reproduced before the fix:
    // `/trends` re-derived the deferral from `pastedReferenceQuote`, whose
    // `allowed` tests TIER BEFORE PAUSE. On a paused workspace whose
    // subscription had lapsed the quote says `reason: "tier"`, the page's
    // re-derivation read FALSE, and the creator was told "credits returned"
    // (past tense) with zero refund rows. The settlement's own answer is the
    // one that describes what the settlement did.
    const { db, scope, a } = await fixture();
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    const pausedAt = now();
    await db.transaction((tx) => recordPauseStart(tx, scope.workspaceId, pausedAt, new Date(pausedAt.getTime() + 30 * 24 * HOUR), pausedAt));
    await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.workspaceId, scope.workspaceId as string));

    const settled = await settleParkedAutopsies(db, scope, a.id);
    const quote = await pastedReferenceQuote(db, scope.workspaceId, now());

    // The quote's reason is NOT the deferral — this is the trap, pinned.
    expect(quote.allowed).toEqual({ ok: false, reason: "tier" });
    expect(settled.deferred).toBe(true);
    expect(settled).toEqual({ refundedClaimIds: [], creditsReturned: 0, deferred: true, neverChargedClaimIds: [], alreadyRefundedClaimIds: [] });
    expect(await refundFor(db, paste.claimId)).toHaveLength(0);
  });

  it("a VIEWER may trigger settlement (it spends nothing and returns the workspace's own money) — the page calls it for whoever loads it", async () => {
    const { db, scope, a, workspaceId } = await fixture();
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    const viewer = await seatScope(db, workspaceId, "viewer");
    expect(await settleParkedAutopsies(db, viewer, a.id)).toEqual({
      refundedClaimIds: [paste.claimId],
      creditsReturned: paste.creditsChargedNow,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
  });

  it("MANY parked claims settle in one call, one row each, and the sum is the sum of their own debits", async () => {
    const { db, scope, a } = await fixture();
    const before = await balance(db, scope);
    const one = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const two = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_B, transcript: TRANSCRIPT_B }, now());
    await park(db, one.claimId);
    await park(db, two.claimId);
    const settled = await settleParkedAutopsies(db, scope, a.id);
    expect(new Set(settled.refundedClaimIds)).toEqual(new Set([one.claimId, two.claimId]));
    expect(settled.creditsReturned).toBe(one.creditsChargedNow + two.creditsChargedNow);
    expect(await balance(db, scope)).toBe(before);
    expect((await counts(db)).refunds).toBe(2);
  });

  it("THE POPULATION IS PARKED CLAIMS, NOT THE NEWEST CLAIM PER ITEM: an OLDER parked, debited claim is still refunded once a SECOND claim exists on its item", async () => {
    // Round-1 tenancy CHANGE 1 / billing CHANGE 4, reached independently by two
    // Full-gate reviewers and reproduced here before the fix. The settlement
    // read the owner's SCREEN list, whose projection takes the newest claim per
    // item (`limit 1`), so the population was "parked ∩ newest-per-item". A
    // second claim on one item is what an `AUTOPSY_ANALYSIS_VERSION` bump
    // produces — the state `submitPastedReference`'s own `replayed` docblock
    // anticipates — and from that instant the older parked-and-debited claim
    // was invisible FOREVER (settlement is idempotent). Measured: balance
    // 100 -> 96, permanently, with no surface saying so.
    const { db, scope, a } = await fixture();
    const before = await balance(db, scope);
    const paste = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    await park(db, paste.claimId);
    const [older] = await db.select().from(autopsyCacheClaims).where(eq(autopsyCacheClaims.id, paste.claimId));

    // The version bump: a SECOND, NEWER claim on the SAME item, which the
    // display projection returns INSTEAD of the parked one.
    const [newer] = await db
      .insert(autopsyCacheClaims)
      .values({
        trendItemId: older.trendItemId,
        contentDigest: older.contentDigest,
        analysisVersion: `${older.analysisVersion}-next`,
        rightsScope: older.rightsScope,
        rightsBasis: older.rightsBasis,
        rightsSubjectUserId: older.rightsSubjectUserId,
        rightsEvidenceId: older.rightsEvidenceId,
        profileId: older.profileId,
        workspaceId: older.workspaceId,
        cacheScopeKey: older.cacheScopeKey,
        status: "pending",
        attemptCount: 1,
      })
      .returning();
    // NON-VACUITY: the display projection really does hide the parked claim,
    // so this test fails for the reason it names and not for another.
    const [shown] = await pastedReferencesForProfile(db, scope, a.id);
    expect(shown.claim?.claimId).toBe(newer.id);
    expect(shown.claim?.status).not.toBe("parked");

    expect(await settleParkedAutopsies(db, scope, a.id)).toEqual({
      refundedClaimIds: [paste.claimId],
      creditsReturned: paste.creditsChargedNow,
      deferred: false,
      neverChargedClaimIds: [],
      alreadyRefundedClaimIds: [],
    });
    expect(await refundFor(db, paste.claimId)).toHaveLength(1);
    expect(await balance(db, scope)).toBe(before);
  });

  it("THE THREE LISTS PARTITION THE PARKED CLAIMS THIS CALL SAW: every one is named exactly once, so 'said nothing about it' means 'never saw it'", async () => {
    // Round 2, billing CHANGE 1 / learning CHANGE 1. `/trends` rendered
    // "credits returned", past tense, for every parked claim the result did NOT
    // name — a complement, not an observation — so a claim parked between the
    // settlement and the pasted read got a money sentence about a ledger
    // holding its debit and no refund. The page can only require positive
    // evidence if this result covers everything it looked at, which is what
    // this test pins: three parked claims in three different states, one
    // settlement, each id in exactly one list and none left over.
    const { db, scope, a } = await fixture();
    const refundedNow = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_A, transcript: TRANSCRIPT }, now());
    const refundedEarlier = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_B, transcript: TRANSCRIPT_B }, now());
    await park(db, refundedEarlier.claimId);
    await settleParkedAutopsies(db, scope, a.id);
    expect(await refundFor(db, refundedEarlier.claimId)).toHaveLength(1);

    // The third: a claim minted under a document pricing the autopsy at 0, so
    // it carries no debit and settles to nothing correctly.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, [PASTED_REFERENCE_CREDIT_COST_KEY]: 0 } },
      "test-admin"
    );
    const neverCharged = await submitPastedReference(db, scope, a.id, { sourceUrl: URL_C, transcript: TRANSCRIPT_C }, now());
    expect(neverCharged.creditsChargedNow).toBe(0);
    await park(db, refundedNow.claimId);
    await park(db, neverCharged.claimId);

    const settled = await settleParkedAutopsies(db, scope, a.id);
    expect(settled.refundedClaimIds).toEqual([refundedNow.claimId]);
    expect(settled.alreadyRefundedClaimIds).toEqual([refundedEarlier.claimId]);
    expect(settled.neverChargedClaimIds).toEqual([neverCharged.claimId]);
    expect(settled.deferred).toBe(false);

    // THE PARTITION, derived rather than asserted claim by claim: the union of
    // the three lists is exactly the profile's parked claims, and no id repeats.
    const named = [
      ...settled.refundedClaimIds,
      ...settled.alreadyRefundedClaimIds,
      ...settled.neverChargedClaimIds,
    ];
    expect(new Set(named).size).toBe(named.length);
    const parkedNow = (await db.select().from(autopsyCacheClaims))
      .filter((claim) => claim.status === "parked")
      .map((claim) => claim.id);
    expect(parkedNow).toHaveLength(3);
    expect(new Set(named)).toEqual(new Set(parkedNow));
  });
});

describe("pastedReferenceQuote — a quote for a screen, never the decision", () => {
  it("reads the document's price, the derived balance, the tier, and whether the writer would refuse on tier or pause", async () => {
    const paid = await fixture({ tier: "pro" });
    expect(await pastedReferenceQuote(paid.db, paid.scope.workspaceId, now())).toEqual({
      creditCost: await price(paid.db),
      balance: 100,
      tier: "pro",
      allowed: { ok: true },
    });

    const free = await fixture({ tier: "free", credits: 0 });
    const q = await pastedReferenceQuote(free.db, free.scope.workspaceId, now());
    expect(q.tier).toBe("free");
    expect(q.allowed).toEqual({ ok: false, reason: "tier" });
    expect(q.creditCost).toBe(await price(free.db));

    const pausedAt = now();
    await paid.db.transaction((tx) =>
      recordPauseStart(tx, paid.scope.workspaceId, pausedAt, new Date(pausedAt.getTime() + 30 * 24 * HOUR), pausedAt)
    );
    expect((await pastedReferenceQuote(paid.db, paid.scope.workspaceId, now())).allowed).toEqual({ ok: false, reason: "paused" });
  });

  it("does NOT pre-decide insufficient balance — that is the writer's, under the lock", async () => {
    const { db, scope } = await fixture({ credits: 0 });
    const q = await pastedReferenceQuote(db, scope.workspaceId, now());
    expect(q.balance).toBeLessThan(q.creditCost);
    expect(q.allowed).toEqual({ ok: true });
  });
});

describe("the `submitted` adapter's PRODUCTION PORT (slice 8 R4)", () => {
  it("has the port's shape (asserted against `ReferenceIntakePort` itself) and drives the metered paste end to end through `submitted.submit`", async () => {
    const { db, scope, a } = await fixture();
    const cost = await price(db);
    // THE SHAPE, checked by the compiler against the port type where the
    // adapter lives — this assignment is the witness.
    const port: ReferenceIntakePort = pastedReferenceIntakePort(db, scope, now());
    const out = await submitted.submit({ profileId: a.id, url: URL_A, transcript: TRANSCRIPT, referenceIntake: port });
    const [input] = await db.select().from(onboardingInputs);
    expect(out.referenceInputId).toBe(input.id);
    expect(input.inputClass).toBe("reference");
    expect(await counts(db)).toMatchObject({ claims: 1, debits: 1 });
    expect(await balance(db, scope)).toBe(100 - cost);
  });

  it("never relabels a refusal as `quote_budget_exceeded`: a Free workspace's tier error propagates through the adapter AS ITSELF", async () => {
    const { db, scope, a } = await fixture({ tier: "free" });
    const port: ReferenceIntakePort = pastedReferenceIntakePort(db, scope, now());
    await expect(
      submitted.submit({ profileId: a.id, url: URL_A, transcript: TRANSCRIPT, referenceIntake: port })
    ).rejects.toBeInstanceOf(PastedReferenceTierError);
    expect(await counts(db)).toEqual(NOTHING);
  });
});
