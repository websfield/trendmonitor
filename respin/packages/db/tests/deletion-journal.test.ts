// Phase 10b-1 Task 5 — the external deletion journal: store, restore verifier,
// purge, and the cost/enablement authority.
//
// Every damage case below is PLANTED THROUGH `tamper`, never through the store
// under test. That separation is the whole value of the suite: a fake driven
// only by the code it is checking proves the code agrees with itself. Here the
// writer creates the chain, an out-of-band actor breaks it, and the verifier —
// which shares no code with either — has to notice.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createDeletionJournalStore,
  journalObjectKey,
  journalRetentionRefusal,
  JOURNAL_CONFLICT_RETENTION,
  JOURNAL_CONFLICT_VERSION_EXISTS,
  type DeletionJournalConfig,
} from "../src/deletion-journal";
import {
  IRREVERSIBLE_STATES,
  compareRestoredState,
  journalPurgeCandidates,
  journalReplayAction,
  listJournalOperations,
  loadJournalChain,
  parseJournalRecord,
  planJournalRestore,
} from "../src/deletion-journal-restore";
import {
  describeForecast,
  forecastDeletionJournalCost,
  journalEnablementDecision,
  parseUsdToNano,
  validatePriceSnapshot,
  JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS,
  R124_LAUNCH_ENVELOPE,
  type S3PriceSnapshot,
} from "../src/deletion-journal-cost";
import { DELETION_JOURNAL_RETAIN_MS } from "../src/deletion-lifecycle";
import {
  canonicalJournalPayload,
  journalRequestChecksum,
  type JournalTransitionRequest,
} from "../src/deletion-ports";
import { createFakeS3, type FakeS3 } from "../src/testing-s3";
import type { DeletionOperationState } from "../src/lifecycle-schema";
import { deletionOperationState } from "../src/lifecycle-schema";

const CONFIG: DeletionJournalConfig = {
  environment: "test",
  bucket: "respin-deletion-journal-test",
  region: "eu-west-2",
};

const REQUESTED_AT = new Date("2026-09-01T00:00:00.000Z");
const RETAIN_UNTIL = new Date(REQUESTED_AT.getTime() + DELETION_JOURNAL_RETAIN_MS);
const OPERATION_ID = "01J8ZQ0000000000000000000A";

function request(overrides: Partial<JournalTransitionRequest> = {}): JournalTransitionRequest {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    scope: "identity",
    target: { userId: "user-1", workspaceId: null, profileId: null },
    requesterDigest: "a".repeat(64),
    version: 1,
    fromState: "requested",
    toState: "journal_pending",
    payloadHash: "b".repeat(64),
    priorReceiptDigest: null,
    requestedAt: REQUESTED_AT,
    effectiveAt: REQUESTED_AT,
    retainUntil: RETAIN_UNTIL,
    ...overrides,
  };
}

function fake(options: Partial<Parameters<typeof createFakeS3>[0]> = {}): FakeS3 {
  return createFakeS3({
    bucket: CONFIG.bucket,
    now: () => REQUESTED_AT,
    ...options,
  });
}

function store(s3: FakeS3) {
  return createDeletionJournalStore({ transport: s3.writer, config: CONFIG });
}

/**
 * The real happy path through `TRANSITIONS` (deletion-lifecycle.ts). The first
 * version of this helper used `requested -> tombstoned -> grace -> erasing ->
 * complete`, which skips `journal_pending` and `verifying` and is a history the
 * lifecycle can never produce — the round-2 transition check caught it
 * immediately, which is exactly what it is for.
 */
const LEGAL_CHAIN: readonly DeletionOperationState[] = [
  "journal_pending",
  "tombstoned",
  "external_actions_pending",
  "grace",
  "erasing",
  "verifying",
  "complete",
];

/** Append `count` chained versions, feeding each receipt into the next. */
async function appendChain(
  s3: FakeS3,
  count: number,
  states: readonly DeletionOperationState[] = LEGAL_CHAIN
): Promise<string[]> {
  const journal = store(s3);
  const digests: string[] = [];
  let prior: string | null = null;
  let from: DeletionOperationState = "requested";
  for (let version = 1; version <= count; version += 1) {
    const to = states[version - 1];
    if (to === undefined) throw new Error(`no state for version ${version}`);
    const result = await journal.appendTransition(
      request({ version, priorReceiptDigest: prior, fromState: from, toState: to })
    );
    if (result.outcome !== "confirmed") throw new Error(`append ${version}: ${JSON.stringify(result)}`);
    prior = result.receiptDigest;
    from = to;
    digests.push(result.receiptDigest);
  }
  return digests;
}

describe("journal store — the conditional-create contract", () => {
  it("writes one object per version at the R-124 key, with every required header", async () => {
    const s3 = fake();
    const result = await store(s3).appendTransition(request());

    expect(result.outcome).toBe("confirmed");
    expect(s3.puts).toHaveLength(1);
    const put = s3.puts[0]!;
    expect(put.key).toBe("test/deletion-journal/01J8ZQ0000000000000000000A/000001.json");
    expect(put.ifNoneMatch).toBe("*");
    expect(put.objectLockMode).toBe("COMPLIANCE");
    expect(put.objectLockRetainUntil.toISOString()).toBe(RETAIN_UNTIL.toISOString());
    expect(put.serverSideEncryption).toBe("AES256");
    expect(put.contentType).toBe("application/json");
    expect(put.checksumSha256).toBe(
      createHash("sha256").update(canonicalJournalPayload(request()), "utf8").digest("base64")
    );
    // The retain-until is exactly 28 days after the REQUEST, not after the write.
    expect(put.objectLockRetainUntil.getTime() - REQUESTED_AT.getTime()).toBe(28 * 86_400_000);
  });

  it("pads the version so listing order is version order", () => {
    expect(journalObjectKey(CONFIG, OPERATION_ID, 1)).toMatch(/000001\.json$/);
    expect(journalObjectKey(CONFIG, OPERATION_ID, 10)).toMatch(/000010\.json$/);
    expect(
      [journalObjectKey(CONFIG, OPERATION_ID, 10), journalObjectKey(CONFIG, OPERATION_ID, 2)].sort()
    ).toEqual([journalObjectKey(CONFIG, OPERATION_ID, 2), journalObjectKey(CONFIG, OPERATION_ID, 10)]);
  });

  it("refuses a second write at the same version instead of overwriting it", async () => {
    const s3 = fake();
    const journal = store(s3);
    await journal.appendTransition(request());
    const second = await journal.appendTransition(request({ payloadHash: "c".repeat(64) }));

    expect(second).toEqual({ outcome: "conflict", code: JOURNAL_CONFLICT_VERSION_EXISTS });
    // The critical assertion is not the verdict, it is that nothing changed.
    expect(s3.versionCount(journalObjectKey(CONFIG, OPERATION_ID, 1))).toBe(1);
  });

  it("refuses a retain-until that is not the request's day-28 timestamp, and writes nothing", async () => {
    const s3 = fake();
    const shortened = request({ retainUntil: new Date(REQUESTED_AT.getTime() + 86_400_000) });

    expect(journalRetentionRefusal(shortened)).toBe(JOURNAL_CONFLICT_RETENTION);
    expect(await store(s3).appendTransition(shortened)).toEqual({
      outcome: "conflict",
      code: JOURNAL_CONFLICT_RETENTION,
    });
    expect(s3.puts).toHaveLength(0);
    expect(s3.keys()).toEqual([]);
  });

  it("reports unknown — never confirmed, never conflict — when the store's answer is lost", async () => {
    const s3 = fake();
    s3.failNext({ keySuffix: "000001.json", as: "unknown", code: "InternalError" });
    const result = await store(s3).appendTransition(request());

    expect(result).toEqual({
      outcome: "unknown",
      reconciliationKey: journalObjectKey(CONFIG, OPERATION_ID, 1),
    });
  });

  it("reports a definitive policy refusal as a conflict carrying the store's code", async () => {
    const s3 = fake();
    s3.failNext({ keySuffix: "000001.json", as: "refused", code: "AccessDenied:EncryptionRequired" });

    expect(await store(s3).appendTransition(request())).toEqual({
      outcome: "conflict",
      code: "AccessDenied:EncryptionRequired",
    });
  });

  it("refuses to write at all against a bucket without Versioning or Object Lock", async () => {
    for (const broken of [{ versioningEnabled: false }, { objectLockEnabled: false }]) {
      const s3 = fake(broken);
      const result = await store(s3).appendTransition(request());
      expect(result.outcome).toBe("conflict");
      expect(s3.keys()).toEqual([]);
    }
  });

  it("gives the writer no verb but create", () => {
    const s3 = fake();
    expect(Object.keys(s3.writer)).toEqual(["putObject"]);
    expect("deleteObjectVersion" in s3.writer).toBe(false);
    expect("getObjectVersion" in s3.writer).toBe(false);
    // @ts-expect-error the writer transport has no delete verb to call
    expect(s3.writer.deleteObjectVersion).toBeUndefined();
  });
});

describe("the store <-> lifecycle seam (round-1 billing BLOCK 1)", () => {
  // THE SEAM NO TEST CROSSED. The store was tested against the fake, and Task
  // 3's lifecycle against its own hand-rolled journal stub, so nothing ever
  // asked whether the receipt the store returns is the receipt the lifecycle
  // accepts. It was not: the store returned the S3 wire encoding (base64) and
  // `appendJournalTransitionInTx` requires the domain encoding (hex), so every
  // append would have written its object to S3 under a 28-day COMPLIANCE lock
  // and then been refused, wedging the operation permanently.
  it("returns a receipt whose checksum is EXACTLY what the lifecycle validates", async () => {
    const s3 = fake();
    const req = request();
    const result = await store(s3).appendTransition(req);

    expect(result.outcome).toBe("confirmed");
    if (result.outcome !== "confirmed") return;
    // This is the literal predicate at deletion-lifecycle.ts:
    //   receipt.checksumSha256 !== journalRequestChecksum(request) -> refuse
    expect(result.checksumSha256).toBe(journalRequestChecksum(req));
  });

  it("sends the WIRE encoding to S3 and the DOMAIN encoding in the receipt", async () => {
    const s3 = fake();
    const req = request();
    const result = await store(s3).appendTransition(req);
    if (result.outcome !== "confirmed") throw new Error("expected a confirmed receipt");

    const wire = createHash("sha256").update(canonicalJournalPayload(req), "utf8").digest("base64");
    const domain = createHash("sha256").update(canonicalJournalPayload(req), "utf8").digest("hex");

    expect(s3.puts[0]!.checksumSha256).toBe(wire);
    expect(result.checksumSha256).toBe(domain);
    // Same digest, two encodings — and they are genuinely different strings, so
    // this test cannot pass by them accidentally coinciding.
    expect(wire).not.toBe(domain);
  });

  it("reports unknown — not confirmed — when the store echoes a checksum that does not match", async () => {
    // Reachable only through the fake's `wrong_checksum_echo` adversary verb;
    // a correct store never produces this, which is why the branch had no
    // witness until round 1 named it.
    const s3 = fake();
    s3.failNext({ keySuffix: "000001.json", as: "wrong_checksum_echo", code: "not-the-right-digest" });
    const result = await store(s3).appendTransition(request());

    expect(result).toEqual({
      outcome: "unknown",
      reconciliationKey: journalObjectKey(CONFIG, OPERATION_ID, 1),
    });
  });
});

describe("Object Lock — compliance retention is not advisory", () => {
  it("refuses a purge before retain-until and allows it after", async () => {
    const s3 = fake();
    await appendChain(s3, 1);
    const key = journalObjectKey(CONFIG, OPERATION_ID, 1);
    const versionId = (await s3.verifier.listVersions(CONFIG.bucket, "test/"))[0]!.versionId;

    s3.setClock(() => new Date(RETAIN_UNTIL.getTime() - 1));
    expect(await s3.purger.deleteObjectVersion(CONFIG.bucket, key, versionId)).toEqual({
      outcome: "refused",
      code: "AccessDenied:ObjectLockRetention",
    });
    expect(s3.keys()).toContain(key);

    s3.setClock(() => new Date(RETAIN_UNTIL.getTime()));
    expect(await s3.purger.deleteObjectVersion(CONFIG.bucket, key, versionId)).toEqual({
      outcome: "deleted",
    });
    expect(s3.keys()).not.toContain(key);
  });

  it("selects only versions whose lock has expired as purge candidates", async () => {
    const s3 = fake();
    await appendChain(s3, 2);
    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    if (chain.outcome !== "verified") throw new Error("expected a verified chain");

    expect(journalPurgeCandidates(chain.records, new Date(RETAIN_UNTIL.getTime() - 1))).toEqual([]);
    expect(journalPurgeCandidates(chain.records, RETAIN_UNTIL)).toHaveLength(2);
  });
});

describe("restore verifier — planted damage must be found", () => {
  it("verifies a clean chain and reports its latest state", async () => {
    const s3 = fake();
    const digests = await appendChain(s3, 4);
    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);

    expect(chain.outcome).toBe("verified");
    if (chain.outcome !== "verified") return;
    expect(chain.records.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    expect(chain.records.map((r) => r.receiptDigest)).toEqual(digests);
    // Four legal hops from `requested` land on `grace`, not `complete`.
    expect(chain.latest.record.toState).toBe("grace");
    expect(await listJournalOperations(s3.verifier, CONFIG)).toEqual({
      operationIds: [OPERATION_ID],
      unparseableKeys: [],
    });
  });

  it("COUNTS a key it cannot parse instead of dropping it (register 2026-10-05 item 44, planted)", async () => {
    // An operation whose only object is mis-keyed used to vanish from the
    // listing — and so from every check the restore verifier and the purge run.
    const s3 = fake();
    await appendChain(s3, 1);
    const strays = [
      `${CONFIG.environment}/deletion-journal/01J8ZQ0000000000000000000B/1.json`, // unpadded version
      `${CONFIG.environment}/deletion-journal/${OPERATION_ID}/000002.txt`, // wrong leaf
      `${CONFIG.environment}/deletion-journal/stray.json`, // too few segments
    ];
    const listedWithStrays = {
      ...s3.verifier,
      listVersions: async (bucket: string, prefix: string) => [
        ...(await s3.verifier.listVersions(bucket, prefix)),
        ...strays.map((key, i) => ({ key, versionId: `stray-${i}`, isDeleteMarker: false, size: 2, lastModified: REQUESTED_AT })),
      ],
    };
    const listing = await listJournalOperations(listedWithStrays, CONFIG);
    expect(listing.operationIds).toEqual([OPERATION_ID]);
    expect(listing.unparseableKeys).toEqual([...strays].sort());
  });

  const damage: readonly [string, (s3: FakeS3, key: string) => void, string][] = [
    ["a second object version on one logical key", (s3, key) => s3.tamper.addSecondVersion(key, "{}"), "duplicate_object_version"],
    ["a delete marker", (s3, key) => s3.tamper.addDeleteMarker(key), "delete_marker"],
    ["an unreadable object", (s3, key) => s3.tamper.corrupt(key), "unreadable_object"],
    ["rewritten bytes under an unchanged checksum", (s3, key) => s3.tamper.rewriteBody(key, "{}"), "checksum_mismatch"],
    ["a shortened Object Lock", (s3, key) => s3.tamper.setRetainUntil(key, new Date(REQUESTED_AT.getTime() + 1)), "retention_mismatch"],
    ["a removed encryption header", (s3, key) => s3.tamper.setEncryption(key, null), "encryption_missing"],
  ];

  for (const [label, plant, code] of damage) {
    it(`blocks the restore on ${label}`, async () => {
      const s3 = fake();
      await appendChain(s3, 3);
      plant(s3, journalObjectKey(CONFIG, OPERATION_ID, 2));

      const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
      expect(chain.outcome).toBe("conflict");
      if (chain.outcome !== "conflict") return;
      expect(chain.conflicts.map((c) => c.code)).toContain(code);
      expect(planJournalRestore([chain]).outcome).toBe("blocked");
    });
  }

  it("REFUSES a cancellation appended after erasure began — the un-deletion case", async () => {
    // The chain is digest-valid and every object is well formed. Only the STATE
    // SEQUENCE is illegitimate, which is precisely what the journal is the
    // authority for. Before round 1 this verified clean and planned
    // `restore_access`, handing a deleted creator's account back.
    const s3 = fake();
    const journal = store(s3);
    let prior: string | null = null;
    // Every hop here is legal EXCEPT the last: `blocked -> tombstoned` and
    // `tombstoned -> cancelled` are both in the table, so the chain is
    // transition-legal end to end and only the SEEN-STATE rule can refuse it.
    // That is why `cancellation_after_erasure` is not redundant with the
    // transition check.
    const chainStates: readonly [DeletionOperationState, DeletionOperationState][] = [
      ["requested", "journal_pending"],
      ["journal_pending", "tombstoned"],
      ["tombstoned", "external_actions_pending"],
      ["external_actions_pending", "grace"],
      ["grace", "erasing"],
      ["erasing", "blocked"],
      ["blocked", "tombstoned"],
      ["tombstoned", "cancelled"],
    ];
    let version = 0;
    for (const [fromState, toState] of chainStates) {
      version += 1;
      const result = await journal.appendTransition(
        request({ version, fromState, toState, priorReceiptDigest: prior })
      );
      if (result.outcome !== "confirmed") throw new Error(`append ${version} failed`);
      prior = result.receiptDigest;
    }

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    expect(chain.conflicts.map((c) => c.code)).toContain("cancellation_after_erasure");
    expect(planJournalRestore([chain]).outcome).toBe("blocked");
  });

  it("REFUSES a chain that BEGINS mid-lifecycle — the round-2 genesis case", async () => {
    // Round-2 tenancy BLOCK. A SINGLE object declaring `erasing -> cancelled`
    // slipped both round-1 checks: at version 1 there is no previous state and
    // no seen state, so neither could fire. It verified clean and planned
    // `restore_access` — and because `restore_access` is exempt from the
    // absent-from-database refusal, it cleared that gate too.
    const s3 = fake();
    const result = await store(s3).appendTransition(
      request({ version: 1, fromState: "erasing", toState: "cancelled", priorReceiptDigest: null })
    );
    if (result.outcome !== "confirmed") throw new Error("the store should still WRITE it; the verifier is what refuses");

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    const codes = chain.conflicts.map((c) => c.code);
    // Caught twice over: the transition is not one the state machine performs,
    // and the chain does not begin at `requested`.
    expect(codes).toContain("illegal_transition");
    expect(codes).toContain("invalid_chain_genesis");
    expect(planJournalRestore([chain]).outcome).toBe("blocked");
  });

  it("REFUSES every transition the lifecycle would never perform", async () => {
    // The verifier reads the SAME `TRANSITIONS` table the write path asserts
    // against, so these are not a second list to maintain.
    for (const [fromState, toState] of [
      ["erasing", "cancelled"],
      ["verifying", "cancelled"],
      ["complete", "requested"],
      ["grace", "complete"],
    ] as const) {
      const s3 = fake();
      const first = await store(s3).appendTransition(request({ version: 1 }));
      if (first.outcome !== "confirmed") throw new Error("append 1 failed");
      await store(s3).appendTransition(
        request({ version: 2, fromState, toState, priorReceiptDigest: first.receiptDigest })
      );
      const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
      expect(chain.outcome, `${fromState} -> ${toState}`).toBe("conflict");
    }
  });

  it("IRREVERSIBLE_STATES stays in step with the replay plan — the net the comment promised", () => {
    // Round-2 CHANGE: the constant's docblock claimed "the exhaustiveness test
    // over deletionOperationState.enumValues is what surfaces the new member",
    // and no such test existed. A new irreversible state would have been
    // silently absent from the list. This is that test.
    for (const state of deletionOperationState.enumValues) {
      expect(
        IRREVERSIBLE_STATES.includes(state),
        `${state}: IRREVERSIBLE_STATES and journalReplayAction disagree`
      ).toBe(journalReplayAction(state) === "replay_erasure");
    }
  });

  it("REFUSES a chain whose version does not start where the previous one ended", async () => {
    const s3 = fake();
    const journal = store(s3);
    const first = await journal.appendTransition(request({ version: 1 }));
    if (first.outcome !== "confirmed") throw new Error("append 1 failed");
    // v1 ended at `journal_pending`; v2 claims to start at `tombstoned`.
    // `tombstoned -> external_actions_pending` is a LEGAL hop, so only the
    // continuity rule can refuse this — the check is not redundant.
    const second = await journal.appendTransition(
      request({
        version: 2,
        fromState: "tombstoned",
        toState: "external_actions_pending",
        priorReceiptDigest: first.receiptDigest,
      })
    );
    if (second.outcome !== "confirmed") throw new Error("append 2 failed");

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    expect(chain.conflicts.map((c) => c.code)).toContain("state_discontinuity");
  });

  it("still accepts a LEGITIMATE cancellation during grace", async () => {
    // Non-vacuity for the two checks above: the honest path must stay open, or
    // the fix would simply refuse everything.
    const s3 = fake();
    const journal = store(s3);
    let prior: string | null = null;
    let version = 0;
    for (const [fromState, toState] of [
      ["requested", "journal_pending"],
      ["journal_pending", "tombstoned"],
      ["tombstoned", "external_actions_pending"],
      ["external_actions_pending", "grace"],
      ["grace", "cancelled"],
    ] as const) {
      version += 1;
      const result = await journal.appendTransition(
        request({ version, fromState, toState, priorReceiptDigest: prior })
      );
      if (result.outcome !== "confirmed") throw new Error(`append ${version} failed`);
      prior = result.receiptDigest;
    }

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("verified");
    if (chain.outcome !== "verified") return;
    expect(journalReplayAction(chain.latest.record.toState)).toBe("restore_access");
    expect(planJournalRestore([chain]).outcome).toBe("ready");
  });

  it("blocks the restore on a weakened Object Lock mode", async () => {
    const s3 = fake();
    await appendChain(s3, 2);
    s3.tamper.setLockMode(journalObjectKey(CONFIG, OPERATION_ID, 1), "GOVERNANCE");

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    expect(chain.conflicts.map((c) => c.code)).toContain("lock_mode_mismatch");
  });

  it("blocks the restore on a gap in the version sequence", async () => {
    const s3 = fake();
    await appendChain(s3, 3);
    s3.tamper.removeVersion(journalObjectKey(CONFIG, OPERATION_ID, 2));

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    expect(chain.conflicts.map((c) => c.code)).toContain("version_gap");
  });

  it("blocks the restore when a version does not chain to its predecessor", async () => {
    const s3 = fake();
    const journal = store(s3);
    await journal.appendTransition(request({ version: 1 }));
    // Version 2 chains to a digest that is not version 1's receipt.
    await journal.appendTransition(
      request({ version: 2, fromState: "tombstoned", toState: "grace", priorReceiptDigest: "f".repeat(64) })
    );

    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    expect(chain.outcome).toBe("conflict");
    if (chain.outcome !== "conflict") return;
    expect(chain.conflicts.map((c) => c.code)).toContain("prior_digest_mismatch");
  });

  it("PINS the canonical serialisation, because changing it would orphan every object already written", () => {
    // THE AUTHOR'S WEAKEST BET, made checkable. `parseJournalRecord` proves a
    // stored object by re-serialising it and comparing bytes. That is a strong
    // check, but it couples restore-readability to the EXACT current
    // serialisation: add a field to `canonicalJournalPayload`, or reorder one,
    // and every object written before that change stops round-tripping and is
    // reported `unparsable_payload` at the one moment it matters — a restore.
    //
    // So the bytes are pinned. If this test fails, the change is not "update
    // the golden": it is a schema version bump plus a reader that can still
    // parse schemaVersion 1, because objects under a 28-day COMPLIANCE lock
    // cannot be rewritten by anyone, including us.
    expect(canonicalJournalPayload(request())).toBe(
      '{"schemaVersion":1,' +
        '"operationId":"01J8ZQ0000000000000000000A",' +
        '"scope":"identity",' +
        '"target":{"userId":"user-1","workspaceId":null,"profileId":null},' +
        `"requesterDigest":"${"a".repeat(64)}",` +
        '"version":1,' +
        '"fromState":"requested",' +
        '"toState":"journal_pending",' +
        `"payloadHash":"${"b".repeat(64)}",` +
        '"priorReceiptDigest":null,' +
        '"requestedAt":"2026-09-01T00:00:00.000Z",' +
        '"effectiveAt":"2026-09-01T00:00:00.000Z",' +
        '"retainUntil":"2026-09-29T00:00:00.000Z"}'
    );
  });

  it("refuses a payload that is not the exact canonical serialisation", () => {
    const canonical = canonicalJournalPayload(request());
    expect(parseJournalRecord(canonical)).not.toBeNull();
    // Same field values, different key order: not the bytes we signed.
    const reordered = JSON.stringify({ ...JSON.parse(canonical), schemaVersion: 1 });
    expect(parseJournalRecord(reordered) === null || reordered === canonical).toBe(true);
    // An extra field, an unknown state, and a non-ISO date each refuse.
    expect(parseJournalRecord(JSON.stringify({ ...JSON.parse(canonical), extra: 1 }))).toBeNull();
    expect(parseJournalRecord(JSON.stringify({ ...JSON.parse(canonical), toState: "nonsense" }))).toBeNull();
    expect(parseJournalRecord(JSON.stringify({ ...JSON.parse(canonical), requestedAt: "2026-09-01" }))).toBeNull();
    expect(parseJournalRecord("not json")).toBeNull();
  });

  it("refuses to serve when the restored database is ahead of the journal", async () => {
    const s3 = fake();
    await appendChain(s3, 2);
    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);

    expect(
      compareRestoredState({
        operationId: OPERATION_ID,
        databaseState: "tombstoned",
        databaseVersion: 2,
        chain,
      })
    ).toBeNull();
    const ahead = compareRestoredState({
      operationId: OPERATION_ID,
      databaseState: "erasing",
      databaseVersion: 3,
      chain,
    });
    expect(ahead?.code).toBe("database_ahead_of_journal");
  });

  it("refuses when the restored database claims a DIFFERENT STATE at the same version", async () => {
    // Round-1 CHANGE: `databaseState` was accepted and never read, while the
    // function's docstring promised it caught "a state the journal does not
    // carry". The first fix had no witness either — a mutation reverting it
    // left the suite green — so this is the assertion that pins it.
    const s3 = fake();
    await appendChain(s3, 2);
    const chain = await loadJournalChain(s3.verifier, CONFIG, OPERATION_ID);
    if (chain.outcome !== "verified") throw new Error("expected a verified chain");
    expect(chain.records[1]!.record.toState).toBe("tombstoned");

    // Agreeing at v2 is fine...
    expect(
      compareRestoredState({
        operationId: OPERATION_ID,
        databaseState: "tombstoned",
        databaseVersion: 2,
        chain,
      })
    ).toBeNull();

    // ...disagreeing at the SAME version is not. The restored row and the
    // journal describe different histories, and the journal is the authority.
    const disagreeing = compareRestoredState({
      operationId: OPERATION_ID,
      databaseState: "complete",
      databaseVersion: 2,
      chain,
    });
    expect(disagreeing?.code).toBe("database_ahead_of_journal");
    expect(disagreeing?.detail).toMatch(/claims state "complete" at journal version 2, but that version records "tombstoned"/);
  });
});

describe("restore replay plan", () => {
  it("decides an action for every state the enum can hold", () => {
    // The population is the enum itself, so a state added later cannot slip
    // through this suite by simply not being listed here.
    for (const state of deletionOperationState.enumValues) {
      expect(journalReplayAction(state)).toBeTypeOf("string");
    }
  });

  it("only a verified cancellation restores access; erasure states replay", () => {
    expect(journalReplayAction("cancelled")).toBe("restore_access");
    for (const fenced of ["requested", "journal_pending", "tombstoned", "external_actions_pending", "grace"] as const) {
      expect(journalReplayAction(fenced)).toBe("reapply_tombstone");
    }
    for (const erasing of ["erasing", "verifying", "complete"] as const) {
      expect(journalReplayAction(erasing)).toBe("replay_erasure");
    }
    expect(journalReplayAction("blocked")).toBe("operator_required");
  });

  it("blocks the WHOLE restore when any one operation conflicts", async () => {
    const clean = fake();
    await appendChain(clean, 2);
    const cleanChain = await loadJournalChain(clean.verifier, CONFIG, OPERATION_ID);

    const broken = fake();
    await appendChain(broken, 2);
    broken.tamper.addDeleteMarker(journalObjectKey(CONFIG, OPERATION_ID, 1));
    const brokenChain = await loadJournalChain(broken.verifier, CONFIG, OPERATION_ID);

    expect(planJournalRestore([cleanChain]).outcome).toBe("ready");
    const plan = planJournalRestore([cleanChain, brokenChain]);
    expect(plan.outcome).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// Cost forecast
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-07T00:00:00.000Z");

function snapshot(overrides: Partial<S3PriceSnapshot> = {}): S3PriceSnapshot {
  return {
    region: "eu-west-2",
    currency: "USD",
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    effectiveAt: "2026-08-01",
    reviewedAt: "2026-09-01",
    // FIXTURE PRICES. Deliberately round and deliberately not presented as any
    // vendor's real price list: this suite tests the arithmetic and the
    // thresholds, and the real numbers are an operator-recorded artefact.
    storagePerGibMonth: "0.100000",
    putPer1000Requests: "0.010000",
    getPer1000Requests: "0.001000",
    ...overrides,
  };
}

describe("forecastDeletionJournalCost", () => {
  it("prices the R-124 envelope exactly, in integer cents", () => {
    const result = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot()],
      now: NOW,
    });

    expect(result.outcome).toBe("forecast");
    if (result.outcome !== "forecast") return;
    // 1,000 requests x 10 versions x 8 KiB = 80,000 KiB = 78.125 MiB.
    expect(result.inputs.storedBytes).toBe(1_000 * 10 * 8 * 1024);
    expect(result.inputs.putRequests).toBe(10_000);
    expect(result.inputs.readRequests).toBe(100_000);
    expect(result.inputs.egressBytes).toBe(0);
    // storage 0.0762939453125 GiB x $0.10 = $0.00763  -> rounds up
    // PUT    10,000/1000 x $0.01  = $0.10
    // LIST    1,000/1000 x $0.01  = $0.01   (one enumeration per request; LIST
    //                                        is the PUT tier, not the GET tier)
    // GET    99,000/1000 x $0.001 = $0.099
    // total  $0.2166…  -> 22 cents
    expect(result.amountUsd).toBe("0.22");
    expect(result.alert).toBe(false);
    expect(result.overCeiling).toBe(false);
  });

  it("alerts at USD 0.50 without blocking enablement", () => {
    const result = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ getPer1000Requests: "0.004000" })],
      now: NOW,
    });
    if (result.outcome !== "forecast") throw new Error("expected a forecast");

    expect(result.amountUsd).toBe("0.52");
    expect(result.alert).toBe(true);
    expect(result.overCeiling).toBe(false);
    const decision = journalEnablementDecision(result);
    expect(decision.allowed).toBe(true);
    expect(decision.alert).toBe(true);
  });

  it("alerts AT exactly USD 0.50, and stays silent one cent below", () => {
    // Round-1 NOTE 13: the suite tested 0.51 and a value well over the ceiling,
    // so flipping `>=` to `>` on the alert would have survived it — and "stays
    // silent at USD 0.50" is a named block condition.
    const at = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ storagePerGibMonth: "0", putPer1000Requests: "0", getPer1000Requests: "0.0050505" })],
      now: NOW,
    });
    if (at.outcome !== "forecast") throw new Error("expected a forecast");
    expect(at.amountCents).toBe(50n);
    expect(at.alert).toBe(true);

    const below = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ storagePerGibMonth: "0", putPer1000Requests: "0", getPer1000Requests: "0.00494" })],
      now: NOW,
    });
    if (below.outcome !== "forecast") throw new Error("expected a forecast");
    expect(below.amountCents).toBe(49n);
    expect(below.alert).toBe(false);
  });

  it("does NOT block AT exactly the USD 1.00 ceiling — only above it", () => {
    const at = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ storagePerGibMonth: "0", putPer1000Requests: "0", getPer1000Requests: "0.0101" })],
      now: NOW,
    });
    if (at.outcome !== "forecast") throw new Error("expected a forecast");
    expect(at.amountCents).toBe(100n);
    expect(at.overCeiling).toBe(false);
    expect(journalEnablementDecision(at).allowed).toBe(true);

    const above = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ storagePerGibMonth: "0", putPer1000Requests: "0", getPer1000Requests: "0.010102" })],
      now: NOW,
    });
    if (above.outcome !== "forecast") throw new Error("expected a forecast");
    expect(above.amountCents).toBe(101n);
    expect(above.overCeiling).toBe(true);
    expect(journalEnablementDecision(above).allowed).toBe(false);
  });

  it("withholds rather than pricing when two snapshots claim one region", () => {
    const result = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ reviewedAt: "2026-09-01" }), snapshot({ reviewedAt: "2026-08-20" })],
      now: NOW,
    });
    expect(result.outcome).toBe("withheld");
    if (result.outcome !== "withheld") return;
    expect(result.detail).toMatch(/2 reviewed price snapshots claim region eu-west-2/);
    expect(journalEnablementDecision(result).allowed).toBe(false);
  });

  it("withholds on a non-integer or negative measured usage instead of throwing", () => {
    for (const bad of [{ storedBytes: 8.5 }, { putRequests: -1 }, { readRequests: Number.NaN }]) {
      const result = forecastDeletionJournalCost({
        region: "eu-west-2",
        snapshots: [snapshot()],
        now: NOW,
        usage: {
          basis: "measured",
          storedBytes: 0,
          putRequests: 0,
          readRequests: 0,
          windowStart: NOW,
          windowEnd: NOW,
          ...bad,
        },
      });
      expect(result.outcome, JSON.stringify(bad)).toBe("withheld");
    }
  });

  it("blocks new-account and public enablement above USD 1.00", () => {
    const result = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot({ putPer1000Requests: "0.100000" })],
      now: NOW,
    });
    if (result.outcome !== "forecast") throw new Error("expected a forecast");

    expect(result.overCeiling).toBe(true);
    const decision = journalEnablementDecision(result);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("over_ceiling");
    // The refusal must say plainly that lifecycle work continues.
    expect(decision.reason).toMatch(/Active deletions, appends, purges, restores and residue verification are unaffected/);
  });

  it("lets a recorded owner cost decision raise the ceiling, never lower it", () => {
    const over = { region: "eu-west-2", snapshots: [snapshot({ putPer1000Requests: "0.100000" })], now: NOW };
    expect(forecastDeletionJournalCost({ ...over, ownerCostCeilingCents: 500n }).outcome).toBe("forecast");
    const raised = forecastDeletionJournalCost({ ...over, ownerCostCeilingCents: 500n });
    if (raised.outcome !== "forecast") throw new Error("expected a forecast");
    expect(raised.overCeiling).toBe(false);
    expect(journalEnablementDecision(raised).allowed).toBe(true);

    // A ceiling BELOW R-124's is ignored: the decision raises, it cannot weaken.
    const lowered = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot()],
      now: NOW,
      ownerCostCeilingCents: 1n,
    });
    if (lowered.outcome !== "forecast") throw new Error("expected a forecast");
    expect(lowered.ceilingCents).toBe(100n);
  });

  it("prices the read class the SAME way on both bases (round-2 billing CHANGE)", () => {
    // The first version used `putRequests` as a proxy for the measured LIST
    // count, so identical figures priced differently depending on which basis
    // the operator chose — 0.22 on the envelope, 0.30 measured.
    const envelopeInputs = {
      storedBytes: 1_000 * 10 * 8 * 1024,
      putRequests: 10_000,
      readRequests: 100_000,
    };
    const envelope = forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot()], now: NOW });
    const measured = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot()],
      now: NOW,
      usage: { basis: "measured", ...envelopeInputs, windowStart: NOW, windowEnd: NOW },
    });
    if (envelope.outcome !== "forecast" || measured.outcome !== "forecast") {
      throw new Error("expected two forecasts");
    }
    // Measured prices the whole read class at the PUT tier (the conservative
    // direction until a real LIST counter exists), so it is never CHEAPER than
    // the envelope on the same inputs.
    expect(measured.amountCents >= envelope.amountCents).toBe(true);
    expect(measured.listRequests).toBe(100_000);
    expect(envelope.listRequests).toBe(1_000);
    expect(envelope.getRequests).toBe(99_000);
  });

  it("uses a recorded LIST rate when the snapshot carries one", () => {
    // `listPer1000Requests` had no witness at all: no test supplied it, so both
    // the validator branch and the pricing branch were dead to the suite.
    const withList = snapshot({ listPer1000Requests: "0.500000" });
    expect(validatePriceSnapshot(withList).ok).toBe(true);
    expect(validatePriceSnapshot({ ...withList, listPer1000Requests: "free" }).ok).toBe(false);

    const priced = forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [withList], now: NOW });
    const withoutList = forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot()], now: NOW });
    if (priced.outcome !== "forecast" || withoutList.outcome !== "forecast") {
      throw new Error("expected two forecasts");
    }
    // 1,000 LIST at 0.50/1000 = 0.50 instead of 0.01 at the PUT rate.
    expect(priced.amountCents - withoutList.amountCents).toBe(49n);
    expect(describeForecast(priced)).toContain("LIST USD 0.500000/1000");
  });

  it("names the PUT tier when no LIST rate is recorded, so the total reconciles", () => {
    const text = describeForecast(
      forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot()], now: NOW })
    );
    expect(text).toContain("(PUT tier — no LIST rate recorded)");
    expect(text).toContain("1000 LIST + 99000 GET");
  });

  it("prices measured usage with the same formula once provisioned", () => {
    const result = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: [snapshot()],
      now: NOW,
      usage: {
        basis: "measured",
        storedBytes: 0,
        putRequests: 1_000,
        readRequests: 0,
        windowStart: new Date("2026-08-01T00:00:00.000Z"),
        windowEnd: NOW,
      },
    });
    if (result.outcome !== "forecast") throw new Error("expected a forecast");
    expect(result.basis).toBe("measured");
    expect(result.amountUsd).toBe("0.01");
  });

  const withheld: readonly [string, Parameters<typeof forecastDeletionJournalCost>[0], string][] = [
    ["no region is configured", { region: null, snapshots: [snapshot()], now: NOW }, "region_not_configured"],
    ["no snapshot exists", { region: "eu-west-2", snapshots: [], now: NOW }, "no_snapshot_for_region"],
    [
      "the snapshot is for another region",
      { region: "us-east-1", snapshots: [snapshot()], now: NOW },
      "snapshot_region_mismatch",
    ],
    [
      "the snapshot is stale",
      {
        region: "eu-west-2",
        snapshots: [snapshot({ reviewedAt: "2026-01-01" })],
        now: NOW,
      },
      "snapshot_stale",
    ],
    [
      "the snapshot is malformed",
      { region: "eu-west-2", snapshots: [{ ...snapshot(), storagePerGibMonth: "free" }], now: NOW },
      "snapshot_malformed",
    ],
    [
      "the snapshot source is not an https price list",
      { region: "eu-west-2", snapshots: [{ ...snapshot(), sourceUrl: "recalled from memory" }], now: NOW },
      "snapshot_malformed",
    ],
  ];

  for (const [label, input, code] of withheld) {
    it(`withholds the forecast and blocks enablement when ${label}`, () => {
      const result = forecastDeletionJournalCost(input);
      expect(result.outcome).toBe("withheld");
      if (result.outcome !== "withheld") return;
      expect(result.code).toBe(code);
      // A refusal with no way forward is an outage, so every one names a remedy.
      expect(result.detail.length).toBeGreaterThan(20);

      const decision = journalEnablementDecision(result);
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe("forecast_withheld");
    });
  }

  it("treats the staleness boundary as inclusive of the limit day", () => {
    const reviewedAt = new Date(NOW.getTime() - JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot({ reviewedAt })], now: NOW }).outcome
    ).toBe("forecast");

    const older = new Date(NOW.getTime() - (JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot({ reviewedAt: older })], now: NOW })
        .outcome
    ).toBe("withheld");
  });

  it("parses decimal USD exactly and refuses anything that is not one", () => {
    expect(parseUsdToNano("0.023")).toBe(23_000_000n);
    expect(parseUsdToNano("1")).toBe(1_000_000_000n);
    expect(parseUsdToNano("0.0004")).toBe(400_000n);
    for (const bad of ["", "-1", "1e-3", "0,023", "free", "NaN", "0.1234567891"]) {
      expect(parseUsdToNano(bad)).toBeNull();
    }
  });

  it("shows its source, region, dates and inputs, and says what it cannot do", () => {
    const result = forecastDeletionJournalCost({ region: "eu-west-2", snapshots: [snapshot()], now: NOW });
    const text = describeForecast(result);

    expect(text).toContain("https://aws.amazon.com/s3/pricing/");
    expect(text).toContain("region eu-west-2");
    expect(text).toContain("effective 2026-08-01");
    expect(text).toContain("reviewed 2026-09-01");
    expect(text).toContain("cannot create an AWS resource, incur a charge");
  });

  it("validates a snapshot before it can price anything", () => {
    expect(validatePriceSnapshot(snapshot()).ok).toBe(true);
    expect(validatePriceSnapshot(null).ok).toBe(false);
    expect(validatePriceSnapshot({ ...snapshot(), currency: "GBP" }).ok).toBe(false);
    expect(validatePriceSnapshot({ ...snapshot(), reviewedAt: "September 2026" }).ok).toBe(false);
  });

  it("compiles R-124's envelope, not a guess at it", () => {
    expect(R124_LAUNCH_ENVELOPE).toEqual({
      deletionRequestsPerMonth: 1_000,
      versionsPerRequest: 10,
      bytesPerVersion: 8192,
      verificationOperationsPerMonth: 100_000,
      publicEgressBytesPerMonth: 0,
    });
  });
});
