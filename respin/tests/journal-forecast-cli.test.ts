// Phase 10b-1 Task 5 — the operator forecast CLI.
//
// The failure this suite exists for: the shipped price-snapshot TEMPLATE has
// every price set to "0.000000". If the loader ever picked it up, the forecast
// would come out at USD 0.00, the enablement gate would say ALLOWED, and a
// public launch would have been authorised by a file of zeroes that no human
// ever priced. So the template is excluded BY NAME, and that exclusion is
// asserted here against the real file on disk rather than against a fixture.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scratchDir } from "./support/scratch-dir";

import { forecastDeletionJournalCost, journalEnablementDecision } from "@respin/db";

import { loadPriceSnapshots, main } from "../scripts/journal-forecast";

const respinRoot = resolve(__dirname, "..");
const NOW = new Date("2026-09-07T00:00:00.000Z");

describe("price snapshot loading", () => {
  it("does NOT load the shipped zero-price template", () => {
    const loaded = loadPriceSnapshots(join(respinRoot, "infra/s3-deletion-journal"));
    for (const snapshot of loaded) {
      expect((snapshot as { region?: string }).region).not.toBe("EXAMPLE");
    }
  });

  it("ships exactly ONE priced region, ap-southeast-2, pinned number-for-number to the operator's price evidence", () => {
    // The deliberate act the previous version of this case named: a human
    // read the price list (R-124 provisioning, 2026-09-08) and recorded it as
    // `price-evidence.ap-southeast-2.json`. The snapshot the loader reads is
    // DERIVED from that evidence and pinned here, so the forecast can never
    // price off a number the evidence file does not carry.
    const loaded = loadPriceSnapshots(join(respinRoot, "infra/s3-deletion-journal")) as Record<string, string>[];
    expect(loaded.map((s) => s.region)).toEqual(["ap-southeast-2"]);
    const evidence = JSON.parse(readFileSync(join(respinRoot, "infra/s3-deletion-journal/price-evidence.ap-southeast-2.json"), "utf8")) as Record<string, string>;
    expect(loaded[0]).toMatchObject({
      currency: evidence.currency,
      sourceUrl: evidence.source,
      reviewedAt: evidence.reviewedAt,
      storagePerGibMonth: evidence.standardStorageUsdPerGbMonthFirst50TiB,
      putPer1000Requests: evidence.putCopyPostListUsdPer1000Requests,
      getPer1000Requests: evidence.getOtherUsdPer1000Requests,
      listPer1000Requests: evidence.putCopyPostListUsdPer1000Requests,
    });
    // An UNPRICED region is still withheld, and withheld still blocks.
    const forecast = forecastDeletionJournalCost({ region: "eu-west-2", snapshots: loaded, now: NOW });
    expect(forecast.outcome).toBe("withheld");
    expect(journalEnablementDecision(forecast).allowed).toBe(false);
  });

  it("loads a recorded snapshot and ignores unrelated files", () => {
    const dir = scratchDir("respin-price-");
    writeFileSync(
      join(dir, "price-snapshot.eu-west-2.json"),
      JSON.stringify({ region: "eu-west-2", currency: "USD" })
    );
    writeFileSync(join(dir, "price-snapshot.EXAMPLE.json"), JSON.stringify({ region: "EXAMPLE" }));
    writeFileSync(join(dir, "README.md"), "not a snapshot");
    writeFileSync(join(dir, "bucket-policy.template.json"), "{}");

    expect(loadPriceSnapshots(dir)).toEqual([{ region: "eu-west-2", currency: "USD" }]);
  });

  it("returns nothing rather than throwing when the directory is absent", () => {
    expect(loadPriceSnapshots(join(tmpdir(), "respin-does-not-exist-9f2a"))).toEqual([]);
  });
});

describe("forecast CLI exit codes — what a deployment checklist gates on", () => {
  const silence = () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    return {
      written,
      restore: () => {
        process.stdout.write = original;
      },
    };
  };

  it("exits 2 and prints the remedy when no region is configured", () => {
    const out = silence();
    try {
      expect(main([], {}, NOW)).toBe(2);
    } finally {
      out.restore();
    }
    const text = out.written.join("");
    expect(text).toContain("WITHHELD (region_not_configured)");
    expect(text).toContain("BLOCKED");
    expect(text).toContain("price-snapshot.<region>.json");
    // The continuity promise must be printed at EVERY outcome, including this
    // one: an operator reading a BLOCKED line needs to know a deletion in
    // flight is not affected by it.
    expect(text).toContain("Active deletions, journal appends, purges, restores");
  });

  it("refuses a partial measured usage rather than pricing the missing terms at zero", () => {
    expect(() => main(["--measured-bytes", "10"], {}, NOW)).toThrow(/must be given together/);
    expect(() => main(["--measured-bytes", "-1", "--measured-puts", "1", "--measured-reads", "1"], {}, NOW)).toThrow(
      /non-negative integer/
    );
  });

  // A reviewed sheet, injected: this is what lets the three PRICED exit codes
  // run through `main` itself rather than only through the pure module.
  const priced = [{
    region: "ap-southeast-2", currency: "USD", sourceUrl: "https://example.test/prices",
    effectiveAt: "2026-08-01", reviewedAt: "2026-09-01",
    storagePerGibMonth: "0.025", putPer1000Requests: "0.0055", getPer1000Requests: "0.00044",
  }];
  const measured = (bytes: number) => ["--region", "ap-southeast-2", "--measured-bytes", String(bytes), "--measured-puts", "10", "--measured-reads", "10"];

  it("exit 0 ALLOWED on a small priced forecast, with no alert", () => {
    const out = silence();
    let code: number;
    try {
      code = main(measured(1_000), {}, NOW, priced);
    } finally {
      out.restore();
    }
    const text = out.written.join("");
    expect(code).toBe(0);
    expect(text).toContain("ALLOWED");
    expect(text).not.toContain("ALERT");
  });

  it("exit 0 with the ALERT printed once the forecast reaches USD 0.50", () => {
    const out = silence();
    let code: number;
    try {
      // ~25 GiB-months at 0.025 = USD 0.63: over the alert line, under the ceiling.
      code = main(measured(25 * 1024 ** 3), {}, NOW, priced);
    } finally {
      out.restore();
    }
    expect(code).toBe(0);
    expect(out.written.join("")).toContain("ALERT");
  });

  it("exit 2 BLOCKED over the USD 1 ceiling, and a RECORDED owner ceiling can raise it (never lower it)", () => {
    const heavy = measured(60 * 1024 ** 3); // ~USD 1.50
    let out = silence();
    let code: number;
    try {
      code = main(heavy, {}, NOW, priced);
    } finally {
      out.restore();
    }
    expect(code).toBe(2);
    expect(out.written.join("")).toContain("BLOCKED");

    out = silence();
    try {
      code = main([...heavy, "--owner-ceiling-cents", "250"], {}, NOW, priced);
    } finally {
      out.restore();
    }
    expect(code).toBe(0);
    expect(out.written.join("")).toContain("ALERT");

    // Lowering is refused by the module's clamp: a 63-cent forecast under a
    // "10 cent" owner ceiling is still ALLOWED, because a recorded decision can
    // only raise the USD 1 ceiling. (A 1-cent forecast would pass either way —
    // billing gate, fix round 2 — so the witness uses one that is over the
    // lowered figure and under the real one.)
    out = silence();
    try {
      code = main([...measured(25 * 1024 ** 3), "--owner-ceiling-cents", "10"], {}, NOW, priced);
    } finally {
      out.restore();
    }
    expect(code).toBe(0);
    expect(out.written.join("")).not.toContain("BLOCKED");
    expect(() => main(["--owner-ceiling-cents", "-5"], {}, NOW, priced)).toThrow(/non-negative integer/);
  });

  it("takes the region from the flag, then the environment", () => {
    const out = silence();
    try {
      main(["--region", "ap-southeast-2"], { RESPIN_DELETION_JOURNAL_REGION: "eu-west-2" }, NOW);
    } finally {
      out.restore();
    }
    expect(out.written.join("")).toContain("ap-southeast-2");
  });
});
