// Phase 10b-1 Task 5 — the operator forecast CLI.
//
// The failure this suite exists for: the shipped price-snapshot TEMPLATE has
// every price set to "0.000000". If the loader ever picked it up, the forecast
// would come out at USD 0.00, the enablement gate would say ALLOWED, and a
// public launch would have been authorised by a file of zeroes that no human
// ever priced. So the template is excluded BY NAME, and that exclusion is
// asserted here against the real file on disk rather than against a fixture.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("today the repository ships NO priced region, so enablement is blocked", () => {
    // This is a statement about the repository as it stands: no AWS account is
    // provisioned and no price list has been reviewed, so there is nothing to
    // price with. When an operator records a real snapshot this assertion is
    // expected to change, and changing it is the deliberate act of saying "a
    // human read the price list".
    const loaded = loadPriceSnapshots(join(respinRoot, "infra/s3-deletion-journal"));
    expect(loaded).toEqual([]);

    const forecast = forecastDeletionJournalCost({
      region: "eu-west-2",
      snapshots: loaded,
      now: NOW,
    });
    expect(forecast.outcome).toBe("withheld");
    expect(journalEnablementDecision(forecast).allowed).toBe(false);
  });

  it("loads a recorded snapshot and ignores unrelated files", () => {
    const dir = mkdtempSync(join(tmpdir(), "respin-price-"));
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
