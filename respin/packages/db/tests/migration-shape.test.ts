// AC-10, structural half — the two properties of migration 0011 that no INSERT
// can demonstrate, read out of the emitted SQL.
//
// WHY A SOURCE SCAN AND NOT A BEHAVIOURAL TEST:
//   - "every FK names an EXPLICIT ON DELETE" cannot be observed by inserting or
//     deleting, because Postgres silently defaults to NO ACTION. A behavioural
//     test would pass on a defaulted FK and pass again on a deliberate one.
//   - "the rollup has NO FK" is the absence of a thing. Its behavioural twin
//     lives in brain-schema.test.ts (the row survives its workspace), and this
//     is the structural statement of the same decision — worth having both,
//     because the behavioural one would also pass if the FK existed with
//     ON DELETE SET NULL, which is not what was decided.
//
// The plan's Verification Step 2 asked for exactly this inspection, and doing
// it by eye is what let migration 0011 first ship a composite FK that
// referenced a unique INDEX emitted after it. Reading is not a check; a test is.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

function migrationSql(prefix: string): string {
  const file = readdirSync(MIGRATIONS).find(
    (f) => f.startsWith(prefix) && f.endsWith(".sql")
  );
  if (!file) throw new Error("no migration matching " + prefix);
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

describe("AC-10 (structure): migration 0011", () => {
  const sql = migrationSql("0011_");

  it("creates the six M2a tables", () => {
    const created = [...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)]
      .map((m) => m[1])
      .sort();
    expect(created).toEqual([
      "brain_docs",
      "creator_profiles",
      "frameworks",
      "model_usage",
      "onboarding_inputs",
      "workspace_spend_monthly",
    ]);
  });

  it("EVERY foreign key names an explicit ON DELETE — none is left to the default", () => {
    // Postgres defaults an unqualified FK to NO ACTION, so a missing clause is
    // indistinguishable from a decision at runtime. Naming it is how the
    // cascade choice recorded in R-30 stays visible to the next reader.
    const fks = [...sql.matchAll(/FOREIGN KEY[\s\S]*?REFERENCES[^;]*/gi)].map(
      (m) => m[0]
    );
    expect(fks.length, "the scan found no FKs at all").toBeGreaterThanOrEqual(4);
    const unqualified = fks.filter((f) => !/ON DELETE/i.test(f));
    expect(
      unqualified,
      "these FKs leave ON DELETE to the Postgres default"
    ).toEqual([]);
  });

  it("the three profile children carry a COMPOSITE FK with both columns NOT NULL", () => {
    for (const table of ["brain_docs", "onboarding_inputs", "model_usage"]) {
      // A literal SUBSTRING, deliberately, not a built-up RegExp: a regex
      // assembled from a string literal needs doubled backslashes, and a lost
      // one turns "\s" into "s" — which makes this scan match nothing and
      // therefore fail OPEN. Substring matching has no escapes to lose.
      expect(
        sql,
        table + " has no composite FK on (profile_id, workspace_id)"
      ).toContain(
        table +
          '_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id")'
      );
      // Both halves NOT NULL. MATCH SIMPLE skips a composite FK entirely when
      // ANY column is NULL, so a nullable half admits a row naming a parent
      // that does not exist — reproduced in both directions during review.
      const create = sql.slice(
        sql.indexOf('CREATE TABLE "' + table + '"'),
        sql.indexOf(");", sql.indexOf('CREATE TABLE "' + table + '"'))
      );
      expect(
        /"profile_id" uuid NOT NULL/.test(create),
        table + ".profile_id is nullable"
      ).toBe(true);
      expect(
        /"workspace_id" uuid NOT NULL/.test(create),
        table + ".workspace_id is nullable"
      ).toBe(true);
    }
  });

  it("frameworks is CARVED OUT: visibility NOT NULL, owner columns nullable, both CHECKs present", () => {
    const start = sql.indexOf('CREATE TABLE "frameworks"');
    const create = sql.slice(start, sql.indexOf(");", start));
    expect(/"visibility" "framework_visibility" NOT NULL/.test(create)).toBe(true);
    // Deliberately nullable — a SHARED framework belongs to no profile, so a
    // blanket both-NOT-NULL rule contradicted this table and made its own
    // acceptance criterion unsatisfiable.
    expect(/"owner_profile_id" uuid,/.test(create)).toBe(true);
    expect(/"workspace_id" uuid,/.test(create)).toBe(true);
    expect(sql).toMatch(/frameworks_shared_has_no_owner/);
    expect(sql).toMatch(/frameworks_private_has_owner/);
  });

  it("workspace_spend_monthly.workspace_id has NO foreign key at all", () => {
    // The decision, structurally: it must OUTLIVE the workspace it records,
    // because model_usage cascades away with the profile. An FK — even one
    // with ON DELETE SET NULL — would defeat that, and the behavioural test in
    // brain-schema.test.ts cannot tell those two apart.
    const fkLines = sql
      .split("\n")
      .filter((l) => /workspace_spend_monthly/.test(l) && /FOREIGN KEY|REFERENCES/i.test(l));
    expect(fkLines).toEqual([]);
    // NON-VACUITY: the scan DOES see the FK on a sibling table, so an empty
    // result above is a measurement rather than a broken pattern.
    const siblingFks = sql
      .split("\n")
      .filter((l) => /creator_profiles/.test(l) && /REFERENCES/i.test(l));
    expect(siblingFks.length).toBeGreaterThan(0);
  });

  it("the partial unique index carries its WHERE predicate", () => {
    // Without the predicate this becomes a PLAIN unique index and every
    // proposed version for a (profile, kind) after the first is refused —
    // which is the opposite of what A-10 needs.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "brain_docs_one_active_uq"[\s\S]*?WHERE\s+"?brain_docs"?\."?status"?\s*=\s*'active'/i
    );
  });

  it("the composite FKs reference a table-level UNIQUE CONSTRAINT, not a unique INDEX", () => {
    // The ordering trap that made the first run of this migration fail:
    // drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every
    // CREATE INDEX — so a unique INDEX does not exist yet when the FK is added
    // and Postgres answers "there is no unique constraint matching given keys".
    // A table `unique()` is emitted INLINE in CREATE TABLE, so it is in place
    // before any FK references it.
    const start = sql.indexOf('CREATE TABLE "creator_profiles"');
    const create = sql.slice(start, sql.indexOf(");", start));
    expect(
      /CONSTRAINT "creator_profiles_id_workspace_uq" UNIQUE\("id","workspace_id"\)/.test(
        create
      ),
      "the unique constraint is not inline in CREATE TABLE — the FKs will be added before it exists"
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("migration 0012 (M2b-1): the confirmation columns, and A-3's corpus set", () => {
  const sql = migrationSql("0012_");

  // Each assertion below is paired with a PLANTED violation, because a source
  // scan that matches nothing is indistinguishable from a source scan that is
  // broken (2026-08-21). The plant is a doctored copy of the real SQL, so the
  // negative case is the real string minus the property — not a hand-typed
  // fixture that could drift away from what the file says.
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("adds `reference_corpus_ids` — the column register item A-3 was blocked on", () => {
    // THE POINT OF THE WHOLE MIGRATION, from A-3's perspective. Round 5 raised
    // it, round 6 restated it, and the plan's own object table listed six
    // changes without it — so `db:check` would have drifted and AC-62/AC-63
    // were unimplementable. It is NOT NULL with a default, so an existing row
    // gets `[]` ("this profile has no reference inputs") rather than NULL,
    // which `assertNoReferenceEcho` refuses outright as "nobody built a corpus".
    const ADD =
      /ADD COLUMN "reference_corpus_ids" jsonb DEFAULT '\[\]'::jsonb NOT NULL/i;
    expect(ADD.test(sql)).toBe(true);
    expect(
      ADD.test(withoutFirst(ADD)),
      "the scan matches a source with the column removed — it is not reading what it claims to"
    ).toBe(false);
  });

  it("makes `source_evidence` NOT NULL and non-empty (REQ-B02 has no zero case)", () => {
    const NOTNULL =
      /ALTER TABLE "brain_docs" ALTER COLUMN "source_evidence" SET NOT NULL/i;
    const NONEMPTY =
      /CHECK \(jsonb_array_length\("brain_docs"\."source_evidence"\) > 0\)/i;
    expect(NOTNULL.test(sql)).toBe(true);
    expect(NONEMPTY.test(sql)).toBe(true);
    // NOT NULL alone would admit `[]`, which is a version citing nothing while
    // passing every not-null check — the absence-is-not-zero shape.
    expect(NONEMPTY.test(withoutFirst(NONEMPTY))).toBe(false);
  });

  it("makes an ACTIVE row structurally require its confirmation columns", () => {
    // Round 2's V3: activation never pinned the activated content to the
    // confirmed content. `activateBrainDoc` checks this too — the CHECK is what
    // makes it true of rows written by any other path, including a hand-run
    // UPDATE during an incident.
    const CHK =
      /CHECK \("brain_docs"\."status" <> 'active' OR \("brain_docs"\."confirmed_at" IS NOT NULL AND "brain_docs"\."confirmed_content_sha256" IS NOT NULL\)\)/i;
    expect(CHK.test(sql)).toBe(true);
    expect(CHK.test(withoutFirst(CHK))).toBe(false);
  });

  it("adds all five confirmation/provenance columns, named", () => {
    // Named individually rather than counted: a count passes when one column is
    // swapped for another, and this migration's whole risk is a missing column.
    for (const col of [
      "confirmed_at",
      "confirmed_by",
      "confirmed_content_sha256",
      "confirmed_fields",
      "evidence_counts",
    ]) {
      expect(sql, `${col} is not added by 0012`).toMatch(
        new RegExp(`ADD COLUMN "${col}"`, "i")
      );
    }
  });

  it("`confirmed_by` names an EXPLICIT ON DELETE", () => {
    // Postgres silently defaults to NO ACTION, which would make deleting a user
    // fail while any brain doc they confirmed survives — REQ-A04 deletion has
    // to stay possible. SET NULL keeps the confirmation record without keeping
    // the person.
    expect(sql).toMatch(
      /"brain_docs_confirmed_by_users_id_fk"[\s\S]*?ON DELETE set null/i
    );
  });
});
