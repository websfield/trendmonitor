// PHASE 6 BILLING RE-RUN (MEDIUM): A SATURATED MARKETING POOL GIVES THE VISITOR
// THE NUMBER-FREE PAGE QUICKLY, AND NEVER QUEUES.
//
// `packages/db/tests/marketing-pool.test.ts` asserts the pool's bounds. This is
// the same saturation driven through the page's own loader with NO mock: the
// default `landingPricing()` read goes `getActiveConfigForPublicPage` ->
// `getMarketingReadDb` -> a server that accepts and never answers.
import { createServer, type Socket } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const held: Socket[] = [];
const hanging = createServer((socket) => {
  held.push(socket);
});
await new Promise<void>((done) => hanging.listen(0, "127.0.0.1", () => done()));
const port = (hanging.address() as { port: number }).port;
const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = `postgres://nobody:nothing@127.0.0.1:${port}/none`;

const { landingPricing } = await import("../app/(marketing)/pricing-load");
const { PricingSection } = await import("../app/(marketing)/landing-sections");
const { PRICING_NUMBERS_UNAVAILABLE } = await import("../app/(marketing)/pricing-copy");

afterAll(async () => {
  for (const socket of held) socket.destroy();
  await new Promise<void>((done) => hanging.close(() => done()));
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

describe("the landing under a saturated marketing pool", () => {
  it("three concurrent visitors all get the number-free page within about 1 s, and the third is not queued", async () => {
    // The refusal lines are expected output, not noise worth printing.
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const started = Date.now();
      const first = landingPricing();
      const second = landingPricing();
      await new Promise((r) => setTimeout(r, 50));
      const thirdStarted = Date.now();
      const third = await landingPricing();
      // Refused at once rather than waiting behind the two stuck reads.
      expect(Date.now() - thirdStarted).toBeLessThan(100);
      const all = [await first, await second, third];
      expect(Date.now() - started).toBeLessThan(1_000);
      for (const pricing of all) {
        expect(pricing.configVersion).toBeNull();
        const html = renderToStaticMarkup(createElement(PricingSection, { pricing }));
        expect(html).toContain("pricing-numbers-unavailable");
        expect(html).toContain(PRICING_NUMBERS_UNAVAILABLE);
        for (const tier of pricing.tiers) {
          for (const line of tier.lines) expect(line).not.toMatch(/\d/);
        }
      }
      // The failure is logged, loud, for each visitor (CLAUDE.md 2026-09-09).
      expect(errorLog.mock.calls.filter((c) => c[0] === "[landing] pricing config unavailable")).toHaveLength(3);
    } finally {
      errorLog.mockRestore();
    }
  });
});
