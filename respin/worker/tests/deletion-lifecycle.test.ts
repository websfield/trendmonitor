// Phase 10b-1 Task 4.3 — the worker-side composition of the deletion executor.
import { describe, expect, it, vi } from "vitest";
import {
  createDeletionLifecycleTick,
  DELETION_ERASURE_SCOPES_ENV,
  DELETION_JOURNAL_ENV,
  JOURNAL_UNAVAILABLE_CODE,
  loadMigrationInventory,
  resolveDeletionJournal,
  resolveErasureEnablement,
  unavailableDeletionJournal,
} from "../deletion-lifecycle";
import {
  DELETION_LIFECYCLE_CRON,
  DELETION_LIFECYCLE_QUEUE,
  RespinPgBossRuntime,
  type PgBossRuntimeSources,
} from "../pg-boss-runtime";

describe("deletion journal composition from the environment (Task 5)", () => {
  const complete = {
    [DELETION_JOURNAL_ENV.bucket]: "respin-deletion-journal-prod",
    [DELETION_JOURNAL_ENV.region]: "eu-west-2",
    [DELETION_JOURNAL_ENV.environment]: "production",
  };

  it("composes the refusing journal when nothing is configured", async () => {
    const journal = resolveDeletionJournal({});
    expect(journal).toBe(unavailableDeletionJournal);
  });

  it("REFUSES STARTUP on a partial configuration rather than silently refusing appends", () => {
    // The failure this prevents: an operator half-way through provisioning sees
    // a worker that starts cleanly and a deletion that never advances, which
    // looks exactly like a deployment that configured no journal at all.
    for (const key of Object.values(complete)) {
      const partial = Object.fromEntries(
        Object.entries(complete).filter(([, value]) => value !== key)
      );
      expect(() => resolveDeletionJournal(partial)).toThrow(/partially configured/);
    }
  });

  it("refuses a bucket, region or environment that is not a safe key segment", () => {
    expect(() =>
      resolveDeletionJournal({ ...complete, [DELETION_JOURNAL_ENV.environment]: "../escape" })
    ).toThrow(/not a safe key segment/);
    expect(() =>
      resolveDeletionJournal({ ...complete, [DELETION_JOURNAL_ENV.bucket]: "Not A Bucket" })
    ).toThrow(/not a valid S3 bucket name/);
  });

  it("builds a real store, keyed by the configured environment, when fully configured", () => {
    const journal = resolveDeletionJournal(complete);
    expect(journal).not.toBe(unavailableDeletionJournal);
    expect(journal).toHaveProperty("config");
    const store = journal as unknown as {
      config: { bucket: string; region: string; environment: string };
      keyFor(operationId: string, version: number): string;
    };
    expect(store.config).toEqual({
      bucket: "respin-deletion-journal-prod",
      region: "eu-west-2",
      environment: "production",
    });
    expect(store.keyFor("01J8ZQ0000000000000000000A", 3)).toBe(
      "production/deletion-journal/01J8ZQ0000000000000000000A/000003.json"
    );
  });

  it("refuses a plaintext endpoint override outside loopback", () => {
    expect(() =>
      resolveDeletionJournal({
        ...complete,
        [DELETION_JOURNAL_ENV.endpoint]: "http://s3.example.com",
      })
    ).toThrow(/refuses plaintext transport/);
    // A loopback endpoint is the sanctioned local S3-compatible harness.
    expect(() =>
      resolveDeletionJournal({
        ...complete,
        [DELETION_JOURNAL_ENV.endpoint]: "http://127.0.0.1:9000",
      })
    ).not.toThrow();
  });
});

describe("erasure enablement from the environment", () => {
  it("is disabled for every scope when unset or blank", async () => {
    for (const env of [{}, { [DELETION_ERASURE_SCOPES_ENV]: "" }, { [DELETION_ERASURE_SCOPES_ENV]: "  " }]) {
      const port = resolveErasureEnablement(env);
      expect(await port.erasureEnabled("identity")).toBe(false);
      expect(await port.erasureEnabled("profile")).toBe(false);
      expect(await port.erasureEnabled("workspace")).toBe(false);
    }
  });

  it("enables exactly the named scopes and refuses an unknown token", async () => {
    // The hold seam is injected as "no hold" to prove the parsing; the default
    // (the executor's real derivation) is proven in the next case.
    const port = resolveErasureEnablement({ [DELETION_ERASURE_SCOPES_ENV]: " identity, profile " }, () => null);
    expect(await port.erasureEnabled("identity")).toBe(true);
    expect(await port.erasureEnabled("profile")).toBe(true);
    expect(await port.erasureEnabled("workspace")).toBe(false);
    expect(() => resolveErasureEnablement({ [DELETION_ERASURE_SCOPES_ENV]: "identity,everything" }, () => null)).toThrow(
      /RESPIN_DELETION_ERASURE_SCOPES names an unknown scope/
    );
  });

  it("admits every scope since Task 6 — no hold is left to refuse", () => {
    // The pre-Task-6 truth was that all three scopes were held: the financial
    // chain still cascaded, and the raw Stripe payload (carrying the billing
    // contact's email) had no receiver. Task 6 registered the finance tables
    // retained and wired the payload sweep, so the holds are gone and naming a
    // scope now ENABLES it.
    for (const scope of ["identity", "profile", "workspace"] as const) {
      const enablement = resolveErasureEnablement({ [DELETION_ERASURE_SCOPES_ENV]: scope });
      expect(enablement.erasureEnabled(scope)).toBe(true);
    }
  });

  it("still refuses a scope whose hold has come back — the refusal is not dead code", () => {
    // NON-VACUITY. With every real hold lifted, "refuses a held scope" would
    // otherwise have no witness at all, and a refusal with no witness is the
    // 2026-08-26 lesson: deleting it would leave the suite green. The hold is
    // injected here rather than faked in the environment, because `erasureHold`
    // is exactly the seam the worker consults.
    expect(() =>
      resolveErasureEnablement(
        { [DELETION_ERASURE_SCOPES_ENV]: "workspace" },
        (scope) => (scope === "workspace" ? "financial_chain_unretained:some_new_money_table" : null)
      )
    ).toThrow(/names workspace, but its erasure is held: financial_chain_unretained:some_new_money_table/);

    // ...and a scope the injected hold does NOT name is still admitted, so the
    // refusal is per-scope rather than a blanket one.
    const partial = resolveErasureEnablement(
      { [DELETION_ERASURE_SCOPES_ENV]: "profile" },
      (scope) => (scope === "workspace" ? "financial_chain_unretained:some_new_money_table" : null)
    );
    expect(partial.erasureEnabled("profile")).toBe(true);
  });
});

describe("journal and inventory composition", () => {
  it("refuses every append until the S3 store exists", async () => {
    const result = await unavailableDeletionJournal.appendTransition({
      schemaVersion: 1,
      operationId: "019b0d7a-86df-7000-8000-000000000001",
      scope: "workspace",
      target: { userId: null, workspaceId: "019b0d7a-86df-7000-8000-000000000002", profileId: null },
      requesterDigest: "a".repeat(64),
      version: 1,
      fromState: "requested",
      toState: "journal_pending",
      payloadHash: "b".repeat(64),
      priorReceiptDigest: null,
      requestedAt: new Date(),
      effectiveAt: new Date(),
      retainUntil: new Date(),
    });
    expect(result).toEqual({ outcome: "conflict", code: JOURNAL_UNAVAILABLE_CODE });
  });

  it("reads the committed migrations as the runtime registry authority", () => {
    const inventory = loadMigrationInventory();
    const names = inventory.tables.map((table) => table.name);
    expect(names).toContain("deletion_operations");
    expect(names).toContain("deletion_external_commands");
    expect(names).toContain("auth_mail_outbox");
  });

  it("composes one tick function over the executor without touching the database at construction", () => {
    const tick = createDeletionLifecycleTick({
      db: {} as never,
      workerName: "test-worker",
      migrations: loadMigrationInventory(),
      ports: {
        journal: unavailableDeletionJournal,
        commands: { execute: vi.fn(), reconcile: vi.fn() },
        enablement: resolveErasureEnablement({}),
      },
    });
    expect(typeof tick).toBe("function");
  });
});

describe("pg-boss registration", () => {
  function fakeBoss() {
    const queues: string[] = [];
    const schedules: { name: string; cron: string; key: string }[] = [];
    const workers: string[] = [];
    const boss = {
      on: vi.fn(),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      getQueue: vi.fn(async () => null),
      createQueue: vi.fn(async (name: string) => { queues.push(name); }),
      updateQueue: vi.fn(async () => {}),
      schedule: vi.fn(async (name: string, cron: string, _data: unknown, options: { key: string }) => {
        schedules.push({ name, cron, key: options.key });
      }),
      work: vi.fn(async (name: string) => { workers.push(name); }),
      findJobs: vi.fn(async () => []),
      getQueueStats: vi.fn(async () => []),
    };
    return { boss, queues, schedules, workers };
  }

  const sources = (advance?: PgBossRuntimeSources["advanceDeletionLifecycle"]): PgBossRuntimeSources => ({
    refreshNiches: async () => [],
    autopsyCandidates: async () => [],
    autopsyCommands: async () => [],
    operationalState: async () => ({
      parkedJobs: 0,
      budgetSpentMicroUsd: 0,
      budgetCapMicroUsd: 1,
      lastSuccessfulScheduleAt: null,
      lastSuccessfulRunAt: null,
    }),
    persistHealth: async () => {},
    ...(advance ? { advanceDeletionLifecycle: advance } : {}),
  });

  const runtime = (boss: ReturnType<typeof fakeBoss>["boss"], advance?: PgBossRuntimeSources["advanceDeletionLifecycle"]) =>
    new RespinPgBossRuntime({
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 1,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 60_000,
        workerName: "w",
        alertPolicy: { heartbeatStaleAfterMs: 1, scheduleGraceMs: 1, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "completed" }),
      },
      sources: sources(advance),
      events: { emit: () => {} },
      boss: boss as unknown as ConstructorParameters<typeof RespinPgBossRuntime>[0]["boss"],
    });

  it("registers the one-minute lifecycle queue only when a tick is composed", async () => {
    const without = fakeBoss();
    const bare = runtime(without.boss);
    await bare.start();
    await bare.stop();
    expect(without.queues).not.toContain(DELETION_LIFECYCLE_QUEUE);
    expect(without.schedules.map((s) => s.key)).not.toContain("deletion-lifecycle-v1");

    const withTick = fakeBoss();
    const composed = runtime(withTick.boss, async () => ({ claimed: 0, advanced: 0, waiting: 0, blocked: 0, erased: 0, refundOwed: 0, stalledWaits: 0, outcomes: [], wedgesResumed: 0, wedgesRefused: 0, heldMoneyReplayed: 0, heldMoneyFailed: 0, heldMoneyStillHeld: 0, moneyNeedsOperator: 0 }));
    await composed.start();
    await composed.stop();
    expect(withTick.queues).toContain(DELETION_LIFECYCLE_QUEUE);
    expect(withTick.schedules).toContainEqual({ name: DELETION_LIFECYCLE_QUEUE, cron: DELETION_LIFECYCLE_CRON, key: "deletion-lifecycle-v1" });
    expect(withTick.workers).toContain(DELETION_LIFECYCLE_QUEUE);
    expect(DELETION_LIFECYCLE_CRON).toBe("* * * * *");
  });

  it("R-162 / R-165: the tick's sweep counts reach the event stream, and every isolated failure PAGES", async () => {
    const events: Array<Record<string, string | number>> = [];
    const fake = fakeBoss();
    const composed = new RespinPgBossRuntime({
      config: {
        connectionString: "postgres://unused",
        queuePoolMax: 1,
        concurrency: 1,
        queueLimit: 1,
        heartbeatIntervalMs: 60_000,
        workerName: "w",
        alertPolicy: { heartbeatStaleAfterMs: 1, scheduleGraceMs: 1, nearBudgetRatio: 0.8, poolPressureRatio: 0.8 },
      },
      handlers: {
        refresh: async () => ({ status: "completed" }),
        digest: async () => ({ status: "completed" }),
        autopsy: async () => ({ status: "completed" }),
      },
      sources: sources(async () => ({
        claimed: 1, advanced: 0, waiting: 0, blocked: 0, erased: 1, refundOwed: 2, stalledWaits: 5, outcomes: [],
        wedgesResumed: 3, wedgesRefused: 1, heldMoneyReplayed: 4, heldMoneyFailed: 1, heldMoneyStillHeld: 6, moneyNeedsOperator: 7,
      })),
      events: { emit: (event) => events.push(event) },
      boss: fake.boss as unknown as ConstructorParameters<typeof RespinPgBossRuntime>[0]["boss"],
    });
    await composed.start();
    const registration = (fake.boss.work.mock.calls as unknown as unknown[][]).find((call) => call[0] === DELETION_LIFECYCLE_QUEUE)!;
    const handler = registration[2] as (jobs: Array<{ createdOn: Date }>) => Promise<void>;
    await handler([{ createdOn: new Date() }]);
    await composed.stop();
    const tick = events.find((event) => event.code === "deletion_lifecycle_tick")!;
    expect(tick).toMatchObject({
      deletionWedgesResumed: 3,
      deletionWedgesRefused: 1,
      deletionHeldMoneyReplayed: 4,
      deletionHeldMoneyFailed: 1,
      deletionHeldMoneyStillHeld: 6,
      deletionRefundOwed: 2,
      deletionStalledWaits: 5,
      deletionMoneyNeedsOperator: 7,
    });
    expect(events.map((event) => event.code)).toEqual(
      expect.arrayContaining([
        "deletion_alert_page_wedge_resume_refused",
        "deletion_alert_page_held_money_replay_failed",
        "deletion_alert_page_refund_owed",
        "deletion_alert_page_held_money_still_held",
        "deletion_alert_page_wait_stalled",
        "deletion_alert_page_money_needs_operator",
      ])
    );
    expect(events.find((event) => event.code === "deletion_alert_page_wait_stalled")).toMatchObject({ deletionStalledWaits: 5 });
    expect(events.find((event) => event.code === "deletion_alert_page_held_money_still_held")).toMatchObject({ deletionHeldMoneyStillHeld: 6 });
  });
});
