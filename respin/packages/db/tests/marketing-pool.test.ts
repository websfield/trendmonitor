// PHASE 6 BILLING GATE (MEDIUM, R-175): THE PUBLIC PAGES READ ON THEIR OWN POOL.
//
// R-175 makes `/` and `/for/*` read the active config on every request. On the
// shared query pool (10 connections) anonymous landing traffic would queue in
// front of Stripe webhooks, debits and settlements. These assertions read the
// constructed `pg.Pool`s themselves, so "separate, small, time-bounded" is a
// property of the objects rather than of a comment.
import { createServer, type Socket } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type pg from "pg";
import {
  DEFAULT_QUERY_POOL_MAX,
  MARKETING_READ_CONNECT_TIMEOUT_MS,
  MARKETING_READ_POOL_MAX,
  MARKETING_READ_STATEMENT_TIMEOUT_MS,
  createDb,
  createMarketingReadDb,
} from "../src/client";
import { MarketingReadPoolBusyError, getMarketingReadDb, getServerDb } from "../src/app-server";

// A SERVER THAT ACCEPTS AND NEVER ANSWERS: a connection to it stays "opening"
// until the pool's connect timeout, which is exactly a saturated pool. Only
// the saturation case queries; every other case constructs pools and reads
// their options.
const held: Socket[] = [];
const hanging = createServer((socket) => {
  held.push(socket);
});
await new Promise<void>((done) => hanging.listen(0, "127.0.0.1", () => done()));
const port = (hanging.address() as { port: number }).port;
const URL = `postgres://nobody:nothing@127.0.0.1:${port}/none`;
const previous = process.env.DATABASE_URL;
process.env.DATABASE_URL = URL;

type PoolOptions = { max?: number; statement_timeout?: number; application_name?: string };
const optionsOf = (db: { $client: unknown }): PoolOptions => (db.$client as pg.Pool & { options: PoolOptions }).options;

const opened: { $client: pg.Pool }[] = [];

afterAll(async () => {
  for (const db of opened) await db.$client.end();
  for (const socket of held) socket.destroy();
  await new Promise<void>((done) => hanging.close(() => done()));
  if (previous === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previous;
});

describe("the marketing read pool is its own, small and time-bounded", () => {
  it("the facade hands out two DIFFERENT pools, and the marketing one is the small one", () => {
    const query = getServerDb();
    const marketing = getMarketingReadDb();
    opened.push(query as unknown as { $client: pg.Pool }, marketing as unknown as { $client: pg.Pool });
    expect(marketing.$client).not.toBe(query.$client);
    expect(optionsOf(query).max).toBe(DEFAULT_QUERY_POOL_MAX);
    expect(optionsOf(marketing).max).toBe(MARKETING_READ_POOL_MAX);
    expect(MARKETING_READ_POOL_MAX).toBe(2);
    expect(optionsOf(marketing).statement_timeout).toBe(MARKETING_READ_STATEMENT_TIMEOUT_MS);
    expect(optionsOf(query).statement_timeout).toBeUndefined();
    expect(optionsOf(marketing).application_name).toBe("respin-marketing-read");
    // Cached like the query pool: one marketing pool per process, not per call.
    expect(getMarketingReadDb()).toBe(marketing);
  });

  it("the factories agree with the facade (the constants are what is constructed)", () => {
    const marketing = createMarketingReadDb(URL);
    const query = createDb(URL);
    opened.push(marketing as unknown as { $client: pg.Pool }, query as unknown as { $client: pg.Pool });
    expect(optionsOf(marketing).max).toBe(MARKETING_READ_POOL_MAX);
    expect(optionsOf(query).max).toBe(DEFAULT_QUERY_POOL_MAX);
    expect(MARKETING_READ_POOL_MAX).toBeLessThan(DEFAULT_QUERY_POOL_MAX);
  });

  it("SATURATED: a third read is refused at once, the two waiting ones give up within the connect timeout, and the pool recovers", async () => {
    expect(MARKETING_READ_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(500);
    const db = getMarketingReadDb();
    const started = Date.now();
    // Two reads take both connections, each stuck "opening" against the
    // server that never answers.
    const pending = [1, 2].map(() =>
      db.execute(sql`select 1`).then(
        () => "answered",
        () => "gave up"
      )
    );
    await new Promise((r) => setTimeout(r, 50));
    // A third request does not queue behind them: it is refused immediately.
    const refusedAt = Date.now();
    expect(() => getMarketingReadDb()).toThrow(MarketingReadPoolBusyError);
    expect(Date.now() - refusedAt).toBeLessThan(50);
    // The two stuck reads give up at the connect timeout, well inside 1 s.
    expect(await Promise.all(pending)).toEqual(["gave up", "gave up"]);
    expect(Date.now() - started).toBeLessThan(1_000);
    // ...and the pool is usable again once they have.
    expect(getMarketingReadDb()).toBe(db);
  });

  it("the public page's config read uses the marketing pool, not the query pool", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../../config/src/app-server.ts"), "utf8");
    const loader = readFileSync(resolve(here, "../../../app/(marketing)/pricing-load.ts"), "utf8");
    expect(config).toMatch(/getActiveConfigForPublicPage\(\)[^{]*\{\s*return getActiveConfig\(getMarketingReadDb\(\)\);/);
    expect(loader).toMatch(/read: \(\) => Promise<ActiveConfig> = getActiveConfigForPublicPage/);
    expect(loader).not.toMatch(/getActiveConfigServer/);
  });
});
