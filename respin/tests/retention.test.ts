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
// THE RECEIVER NOW EXISTS (Phase 10b-1 Task 6), so the constraint is no longer
// "until" anything: the column still holds unredacted webhook JSON for up to 90
// days, so a new reader is still a new exposure and still needs a stated reason
// on the allowlist below.
//
// AND THE SCAN HAD A HOLE THIS SLICE DROVE THROUGH. Every pattern below keyed
// on a drizzle identifier (`stripeEvents.payload`, `.from(stripeEvents)`,
// `db.query.stripeEvents`). Task 6 introduced a RAW-SQL reader --
// `SELECT id, type, payload ... FROM "stripe_events"` -- which matched none of
// them, so the guard permitted an entire class it was written to police, and
// reported green while doing it.
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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";

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
  [
    "packages/db/src/deletion-executor.ts",
    "R-165 (audit P5-A1): inside the erasure transaction and BEFORE the subject purge redacts it, the executor reads ONLY `amount_total`/`amount_paid`/`amount_received` and `currency` off the workspace's `held_tombstoned` events, to list them as refund owed by the operator. Ids and amounts only, never a person; and the purge right after still blanks the column.",
  ],
  [
    "packages/db/src/lifecycle-subjects.ts",
    "the deletion executor's subject capture selects ONLY the event id for a workspace, so the receipt ids survive the FK being nulled; it names the table and never the payload column (Phase 10b-1 Task 4).",
  ],
  [
    "packages/db/src/retention-receiver.ts",
    "THE REDACTION RECEIVER ITSELF (Phase 10b-1 Task 6). It reads the payload for exactly one purpose - lifting the finance facts out in the same transaction, immediately BEFORE blanking the column - and for the subject-erasure purge that does the same at erasure time. It is the one reader this constraint exists to allow, and it was invisible to this scan until the raw-SQL shapes above were added.",
  ],
  [
    "packages/db/src/finance-extract.ts",
    "the pure extractor the receiver hands a parsed payload to. It never queries the table; it appears here because it names the payload's own fields.",
  ],
]);

/** Blank comments first — a comment naming the column is not a reader. */
function stripComments(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("audit #21: nothing new reads stripe_events.payload before the M6 redaction receiver", () => {
  // THE SHARED ROOT LIST, NOT THREE OF SIX (P1-R3/P1-R7). This scan read
  // `packages`, `app` and `lib` until 2026-09-21 and was therefore blind to a
  // payload reader landing in `worker/` or `scripts/` — half the production
  // tree, in the suite whose whole job is "no NEW product surface reads this
  // column". `PRODUCTION_ROOTS` is asserted against `ROOT_DIRS` in
  // `claim-scan.test.ts`, so the population is now a measurement.
  //
  // PRODUCT SOURCE ONLY is preserved: D-AUDIT-2's constraint is about surfaces
  // a user can reach, and a suite asserting what the dispatcher wrote ships to
  // nobody. (The old local walker also skipped `migrations/`; measured
  // 2026-09-21, neither migrations directory holds a `.ts` file, so reading
  // them through the shared walker widens this population by nothing.)
  const scanned = sourceFilesUnder(PRODUCTION_ROOTS).filter(
    ({ file }) => !/\.test\.(ts|tsx)$/.test(file)
  );

  it("the scan is NOT vacuous: it sees the files it is supposed to police", () => {
    // The failure mode this catches is a broken path making the whole scan
    // sweep zero files and pass, which is the shape of a guard that guards
    // nothing (CLAUDE.md, 2026-08-10).
    expect(scanned.length).toBeGreaterThan(20);
    const rels = scanned.map(({ file }) => file);
    for (const allowed of ALLOWED.keys()) {
      expect(rels, `${allowed} must be inside the scanned tree`).toContain(
        allowed
      );
    }
  });

  it("every file naming the payload column is on the allowlist, with a reason", () => {
    const offenders: string[] = [];
    for (const { file: rel, text } of scanned) {
      if (ALLOWED.has(rel)) continue;
      // The ENOENT race this loop used to handle itself now lives in
      // `sourceFilesUnder` — `import-boundary.test.ts` writes a probe file into
      // `respin/lib/` and deletes it while vitest runs suites concurrently, and
      // the walk drops a path that vanished between listing and reading. Every
      // other read error still throws there, for the reason it did here.
      const src = stripComments(text);
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
        // RAW SQL against the table. The drizzle-identifier patterns above are
        // blind to it, which is how the Task 6 receiver's
        // `SELECT ... payload ... FROM "stripe_events"` slipped past a green
        // guard. Matching the table alone would flag every id-only select, so
        // these require the payload column nearby in the same statement.
        /FROM\s+"?stripe_events"?[\s\S]{0,400}?\bpayload\b/i,
        /\bpayload\b[\s\S]{0,400}?FROM\s+"?stripe_events"?/i,
        /UPDATE\s+"?stripe_events"?[\s\S]{0,200}?\bpayload\b/i,
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
