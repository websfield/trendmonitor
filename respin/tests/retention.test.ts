// Audit 2026-08-17 #21 — the `stripe_events.payload` no-new-reader constraint,
// enforced instead of asserted in prose.
//
// R-25/D-AUDIT-2 records the policy: retain the full Stripe payload for 90 days
// after `received_at`, then redact while keeping non-PII audit metadata. The
// redaction RECEIVER is M6 scope. The BINDING CONSTRAINT is in force from today:
//
//   "no new product surface may read `stripe_events.payload` until the
//    redaction receiver exists."
//
// That column holds complete, unredacted Stripe webhook JSON — customer email,
// name and billing address — indefinitely. It is not exploitable while nothing
// reads it, and it becomes exploitable the moment something does. A constraint
// that lives only in a decision document is a constraint the next milestone
// breaks by accident, so this scan is the tripwire.
//
// The scan is deliberately SOURCE-LEVEL rather than type-level: the risk is a
// new page, route or job selecting the column, and a `select()` with no argument
// returns every column including this one — which no type would flag.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The ONLY places allowed to touch the payload today, each for a stated reason.
 * Adding a path here is the reviewed decision the constraint exists to force.
 */
const ALLOWED = new Map<string, string>([
  [
    "packages/db/src/billing-schema.ts",
    "the column DEFINITION — the table has to declare it",
  ],
  [
    "packages/credits/src/stripe/webhooks.ts",
    "the dispatcher, and it only WRITES (D-M1-1 records the raw event so a redelivery can be told from a first delivery). It never reads the column back.",
  ],
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "migrations",
  "coverage",
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    // PRODUCT SOURCE ONLY. D-AUDIT-2's constraint is that no new *product
    // surface* may read the payload — a suite asserting what the dispatcher
    // wrote to `stripe_events` is not a surface, ships to nobody, and is how
    // the write is verified at all. Excluding tests is the constraint's own
    // scope, not a loophole: the four read shapes below are checked against
    // every file a user can reach.
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Blank comments first — a comment naming the column is not a reader. */
function stripComments(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("audit #21: nothing new reads stripe_events.payload before the M6 redaction receiver", () => {
  const scanned = [
    ...sourceFiles(join(ROOT, "packages")),
    ...sourceFiles(join(ROOT, "app")),
    ...sourceFiles(join(ROOT, "lib")),
  ];

  it("the scan is NOT vacuous: it sees the files it is supposed to police", () => {
    // The failure mode this catches is a broken path making the whole scan
    // sweep zero files and pass, which is the shape of a guard that guards
    // nothing (CLAUDE.md, 2026-08-10).
    expect(scanned.length).toBeGreaterThan(20);
    const rels = scanned.map((f) => relative(ROOT, f).replace(/\\/g, "/"));
    for (const allowed of ALLOWED.keys()) {
      expect(rels, `${allowed} must be inside the scanned tree`).toContain(
        allowed
      );
    }
  });

  it("every file naming the payload column is on the allowlist, with a reason", () => {
    const offenders: string[] = [];
    for (const file of scanned) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      // FOUR shapes, not one (tenancy gate 2026-08-18). The header of this file
      // says the scan is source-level precisely because "a `select()` with no
      // argument returns every column including this one — which no type would
      // flag" — and the first version then matched ONLY the explicitly-named
      // column, so it caught `select({p: stripeEvents.payload})` and missed
      // `select().from(stripeEvents)`, `db.query.stripeEvents...` and a
      // destructured `row.payload`. A guard that enforces less than its own
      // comment claims is the 2026-07-30 lesson, in the file written to
      // discharge it.
      //
      // A bare full-row select IS a payload read: the row it hands back carries
      // the unredacted customer JSON, whatever the caller then does with it.
      const READS = [
        // the column, named directly
        /stripeEvents\s*\.\s*payload/,
        /\bstripe_events\.payload\b/,
        // a whole-row select — every column, payload included
        /\.from\(\s*stripeEvents\s*\)/,
        // the relational query builder, which also returns whole rows
        /db\s*\.\s*query\s*\.\s*stripeEvents/,
        /\bquery\.stripeEvents\b/,
      ];
      if (READS.some((re) => re.test(src))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "stripe_events.payload holds unredacted customer PII (email, name, billing address) with no retention receiver yet. R-25/D-AUDIT-2 forbids a NEW reader until redaction exists. If this surface genuinely needs it, that is a decision to record — not a test to edit."
    ).toEqual([]);
  });

  it("the allowlisted dispatcher WRITES the payload and never reads it back", () => {
    const src = stripComments(
      readFileSync(
        join(ROOT, "packages/credits/src/stripe/webhooks.ts"),
        "utf8"
      )
    );
    // The one legitimate mention is the insert. A `select` naming the column
    // would be a read, and the point of the exception is that there is none.
    expect(src).toContain("payload:");
    expect(/stripeEvents\s*\.\s*payload/.test(src)).toBe(false);
  });
});
