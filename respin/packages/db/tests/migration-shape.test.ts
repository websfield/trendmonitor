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
import { BILLABLE_USAGE_OUTCOMES } from "../src/onboarding-schema";

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

/**
 * The offset of `needle`, PROVEN PRESENT FIRST.
 *
 * A FAIL-OPEN ASSERTION SHAPE THIS FILE CARRIED TWICE (tenancy gate NOTE,
 * 2026-09-02), and `-1` is why: `indexOf` returns it for absent, and -1 is a
 * perfectly good number.
 *   - In an ORDERING comparison it is LESS THAN every real offset, so
 *     "the index is created before the backfill" passed on a migration whose
 *     index had been deleted outright.
 *   - As a `slice` start it is the LAST CHARACTER, so "nothing in the trigger
 *     body uses `<>`" passed on a one-character body that is not the trigger.
 * Both are the shape where a scan reporting no violations is indistinguishable
 * from a scan that found nothing to read (CLAUDE.md 2026-08-21).
 *
 * SLICE ENDS GO THROUGH IT TOO, AS OF 2026-09-02 (billing gate round 2, NOTE).
 * The first fix closed slice STARTS and left every END as a bare
 * `sql.indexOf(");", start)` — which returns -1 for absent, and `slice(start,
 * -1)` runs to the last character of the FILE. That silently widens the
 * extracted block over every table after it, weakening a positive assertion
 * like `/"profile_id" uuid NOT NULL/.test(create)` into "some table somewhere
 * has this column". Barely reachable (drizzle always emits `);`) and the same
 * class in the same block whose header claims every assertion is paired with a
 * plant, so it is closed rather than annotated. `from` is what lets an END use
 * this function at all.
 */
function offsetOf(sql: string, needle: string, from = 0): number {
  const at = sql.indexOf(needle, from);
  expect(
    at,
    "the migration does not contain " +
      JSON.stringify(needle) +
      (from > 0 ? " at or after offset " + from : "")
  ).toBeGreaterThanOrEqual(0);
  return at;
}

/**
 * The body of ONE `CREATE TABLE "<table>" (...)`, BOTH ENDS PROVEN PRESENT.
 *
 * The seven call sites that used to open this block by hand all ended it with
 * a bare `indexOf`, so the widening above had seven places to happen in. One
 * helper is what makes "both ends are checked" a property of the file rather
 * than of seven copies of two lines.
 */
function createTableBlock(sql: string, table: string): string {
  const start = offsetOf(sql, 'CREATE TABLE "' + table + '"');
  return sql.slice(start, offsetOf(sql, ");", start));
}

describe("the block extractor itself, PLANTED (billing gate round 2 NOTE)", () => {
  // The two helpers above are what every structural assertion in this file
  // reads through, so their failure mode is the file's failure mode.
  const UNTERMINATED =
    'CREATE TABLE "a" (\n\t"x" uuid\n' +
    'CREATE TABLE "b" (\n\t"profile_id" uuid NOT NULL\n';

  it("THE OLD SHAPE really was fail-open: a bare indexOf widens table a's block over table b", () => {
    // Not an argument — the counterfactual, run. `indexOf(");", start)` is -1
    // here, and `slice(start, -1)` is "everything but the last character", so
    // a positive assertion about table `a` passes on a column that belongs to
    // table `b`.
    const start = UNTERMINATED.indexOf('CREATE TABLE "a"');
    const widened = UNTERMINATED.slice(
      start,
      UNTERMINATED.indexOf(");", start)
    );
    expect(UNTERMINATED.indexOf(");", start)).toBe(-1);
    expect(
      /"profile_id" uuid NOT NULL/.test(widened),
      "the widening this helper exists to prevent did not reproduce — the fixture is wrong, not the rule"
    ).toBe(true);
  });

  it("...and createTableBlock REFUSES it instead, naming what is missing", () => {
    expect(() => createTableBlock(UNTERMINATED, "a")).toThrow(/does not contain/);
  });

  it("a well-formed block stops at its OWN closing paren", () => {
    const TWO_TABLES =
      'CREATE TABLE "a" (\n\t"x" uuid\n);\n' +
      'CREATE TABLE "b" (\n\t"profile_id" uuid NOT NULL\n);\n';
    const block = createTableBlock(TWO_TABLES, "a");
    expect(block).toContain('"x" uuid');
    expect(
      block,
      "the block ran past its own table — every positive assertion in this file would then be about the wrong table"
    ).not.toContain("profile_id");
  });

  it("a MISSING table is a failure, not offset -1 (the first half of the fix, still asserted)", () => {
    expect(() => createTableBlock('CREATE TABLE "b" (\n);', "a")).toThrow(
      /does not contain/
    );
  });
});

describe("migration 0033 (slice 9b): proposal persistence and summary classes", () => {
  const sql = migrationSql("0033_");

  it("adds the closed proposal vocabularies and both product-summary input classes", () => {
    expect(sql).toContain(
      `CREATE TYPE "public"."promotion_proposal_source" AS ENUM('results', 'feedback')`
    );
    expect(sql).toContain(
      `CREATE TYPE "public"."promotion_proposal_status" AS ENUM('proposed', 'accepted', 'rejected', 'stale', 'superseded')`
    );
    expect(sql).toContain(
      `CREATE TYPE "public"."promotion_proposal_strength" AS ENUM('early', 'repeated', 'corroborated')`
    );
    for (const value of ["result_summary", "feedback_summary"]) {
      expect(sql).toContain(
        `ALTER TYPE "public"."onboarding_input_class" ADD VALUE '${value}'`
      );
    }
  });

  it("does not use newly-added onboarding enum labels inside the same migration transaction", () => {
    expect(sql).toContain(
      `"onboarding_inputs"."input_class"::text NOT IN ('result_summary', 'feedback_summary')`
    );
    expect(sql).not.toContain(
      `"onboarding_inputs"."input_class" NOT IN ('result_summary', 'feedback_summary')`
    );
  });

  it("creates exactly the proposal row plus its two relational evidence joins", () => {
    const created = [...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)].map(
      (match) => match[1]
    );
    expect(created).toEqual([
      "promotion_proposals",
      "proposal_evidence_feedback",
      "proposal_evidence_results",
    ]);
    const feedback = createTableBlock(sql, "proposal_evidence_feedback");
    expect(feedback).not.toContain("generation_id");
    expect(feedback).not.toContain("reaction");
    expect(feedback).not.toContain("target");
  });

  it("adds composite FK targets before any 0033 foreign key can reference them", () => {
    const activationUnique = offsetOf(
      sql,
      'ADD CONSTRAINT "brain_activation_snapshots_id_profile_workspace_uq" UNIQUE'
    );
    const feedbackUnique = offsetOf(
      sql,
      'ADD CONSTRAINT "generation_feedback_id_profile_workspace_uq" UNIQUE'
    );
    expect(activationUnique).toBeLessThan(
      offsetOf(sql, 'ADD CONSTRAINT "promotion_proposals_accepted_activation_fk"')
    );
    expect(feedbackUnique).toBeLessThan(
      offsetOf(sql, 'ADD CONSTRAINT "proposal_evidence_feedback_feedback_fk"')
    );
  });

  it("pins every same-tenant edge and its delete/update action", () => {
    const expected = [
      ["promotion_proposals_profile_workspace_fk", "creator_profiles"],
      ["promotion_proposals_basis_doc_fk", "brain_docs"],
      ["promotion_proposals_accepted_doc_fk", "brain_docs"],
      ["promotion_proposals_accepted_activation_fk", "brain_activation_snapshots"],
      ["proposal_evidence_feedback_proposal_fk", "promotion_proposals"],
      ["proposal_evidence_feedback_feedback_fk", "generation_feedback"],
      ["proposal_evidence_results_proposal_fk", "promotion_proposals"],
      ["proposal_evidence_results_result_fk", "results"],
    ] as const;
    for (const [name, target] of expected) {
      const at = offsetOf(sql, `ADD CONSTRAINT "${name}"`);
      const end = offsetOf(sql, ";", at);
      const statement = sql.slice(at, end);
      expect(statement).toContain(`REFERENCES "public"."${target}"`);
      expect(statement).toContain("ON DELETE cascade");
      expect(statement).toContain("ON UPDATE restrict");
    }
    expect(sql).toMatch(
      /promotion_proposals_decision_user_id_users_id_fk[\s\S]*?REFERENCES "public"\."users"\("id"\) ON DELETE set null/i
    );
  });

  it("holds source/basis/target, lifecycle, idempotency and summary attribution as database constraints", () => {
    for (const name of [
      "promotion_proposals_payload_is_object",
      "promotion_proposals_source_basis",
      "promotion_proposals_source_target",
      "promotion_proposals_decision_shape",
      "promotion_proposals_evidence_digest_uq",
      "onboarding_inputs_summaries_have_no_caller_attribution",
    ]) {
      expect(sql, `${name} is absent`).toContain(`"${name}"`);
    }
  });
});

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
      const create = createTableBlock(sql, table);
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
    const create = createTableBlock(sql, "frameworks");
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
    const create = createTableBlock(sql, "creator_profiles");
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

// ---------------------------------------------------------------------------

describe("migration 0020 (slice 6, stage A): the generation substrate", () => {
  const sql = migrationSql("0020_");

  // Every assertion below is paired with a PLANTED violation, for the reason
  // the 0012 block states: a source scan that matches nothing is
  // indistinguishable from a source scan that is broken (CLAUDE.md
  // 2026-08-21). The plant is a doctored copy of the REAL SQL, so the negative
  // case is this file minus the property rather than a hand-typed fixture.
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("creates exactly the two generation tables", () => {
    const created = [...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)]
      .map((m) => m[1])
      .sort();
    expect(created).toEqual(["generation_attempts", "generations"]);
  });

  it("EVERY foreign key names an explicit ON DELETE and an explicit ON UPDATE", () => {
    // Postgres defaults an unqualified FK to NO ACTION, so a missing clause is
    // indistinguishable from a decision at runtime — the same reason migration
    // 0011 is checked for this. ON UPDATE matters here specifically:
    // `generations_attempt_fk` is RESTRICT deliberately, which is the one
    // piece of R14's "the attempt's identity is immutable" the database can
    // hold on its own.
    const fks = [...sql.matchAll(/FOREIGN KEY[\s\S]*?REFERENCES[^;]*/gi)].map(
      (m) => m[0]
    );
    expect(fks.length, "the scan found no FKs at all").toBe(3);
    expect(fks.filter((f) => !/ON DELETE/i.test(f))).toEqual([]);
    expect(fks.filter((f) => !/ON UPDATE/i.test(f))).toEqual([]);
    const RESTRICT =
      /"generations_attempt_fk" FOREIGN KEY \("attempt_id","mode","profile_id","workspace_id"\) REFERENCES "public"\."generation_attempts"\("attempt_id","mode","profile_id","workspace_id"\) ON DELETE cascade ON UPDATE restrict/;
    expect(RESTRICT.test(sql)).toBe(true);
    expect(
      RESTRICT.test(withoutFirst(RESTRICT)),
      "the scan matches a source with the FK removed — it is not reading what it claims to"
    ).toBe(false);
  });

  it("both profile children carry the composite FK with BOTH columns NOT NULL", () => {
    for (const table of ["generation_attempts", "generations"]) {
      // A literal SUBSTRING, deliberately, not a built-up RegExp — a regex
      // assembled from a string literal needs doubled backslashes, and a lost
      // one turns "\s" into "s", which makes the scan match nothing and fail
      // OPEN.
      expect(
        sql,
        table + " has no composite FK on (profile_id, workspace_id)"
      ).toContain(
        table + '_profile_workspace_fk" FOREIGN KEY ("profile_id","workspace_id")'
      );
      const create = createTableBlock(sql, table);
      // MATCH SIMPLE skips a composite FK entirely when ANY column is NULL, so
      // a nullable half admits a row naming a parent that does not exist.
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

  it("both FK-TARGET uniques are INLINE in CREATE TABLE, not CREATE INDEX", () => {
    // THE ORDERING TRAP that made the first run of migration 0011 fail:
    // drizzle-kit emits every CREATE TABLE, then every FK ALTER, then every
    // CREATE INDEX — so a unique INDEX does not exist yet when an FK
    // references it, and Postgres answers "there is no unique constraint
    // matching given keys". `generations_attempt_fk` references the attempt
    // table's four-column unique TODAY; `generations_id_profile_workspace_uq`
    // is referenced by slices 7 and 9, which is later but is the same trap.
    for (const [table, constraint, columns] of [
      [
        "generation_attempts",
        "generation_attempts_attempt_mode_profile_workspace_uq",
        '"attempt_id","mode","profile_id","workspace_id"',
      ],
      [
        "generations",
        "generations_id_profile_workspace_uq",
        '"id","profile_id","workspace_id"',
      ],
    ] as const) {
      const create = createTableBlock(sql, table);
      const needle = `CONSTRAINT "${constraint}" UNIQUE(${columns})`;
      expect(
        create.includes(needle),
        `${constraint} is not inline in CREATE TABLE — an FK referencing it will be added before it exists`
      ).toBe(true);
      // NON-VACUITY: the same needle really is absent from a doctored copy.
      expect(create.replace(needle, "").includes(needle)).toBe(false);
    }
  });

  it("R17: the free-allowance index is PARTIAL and WORKSPACE-KEYED", () => {
    // Two separate properties, and dropping either one is a different outage.
    //
    // Without the WHERE it stops being partial and starts constraining every
    // ledger row that shares a (workspace_id, ref_id) pair across ref_types —
    // a debit and a grant naming the same business object would collide.
    //
    // Without `workspace_id` it becomes GLOBAL on a key that is NOT globally
    // unique: `ref_id` here is the period key ('2026-08'), which every
    // workspace on the platform mints, so the first Free workspace to derive a
    // balance in a month would take the key and refuse the grant to every
    // other workspace for the rest of it. That is the difference between this
    // index and its five siblings, which key on globally unique Stripe object
    // ids.
    const IDX =
      /CREATE UNIQUE INDEX "credit_ledger_free_allowance_uq" ON "credit_ledger" USING btree \("workspace_id","ref_id"\) WHERE "credit_ledger"\."ref_type" = 'free_allowance'/;
    expect(IDX.test(sql)).toBe(true);
    expect(
      IDX.test(withoutFirst(IDX)),
      "the scan matches a source with the index removed — it is not reading what it claims to"
    ).toBe(false);
    // ...and the CHECK that stops a NULL `ref_id` slipping past it, which is
    // the sibling `credit_ledger_expiry_ref` already carries for the expiry
    // index. Without it the index is idempotency-unless-the-writer-forgets.
    const CHK =
      /ADD CONSTRAINT "credit_ledger_free_allowance_ref" CHECK \("credit_ledger"\."ref_type" IS DISTINCT FROM 'free_allowance' OR "credit_ledger"\."ref_id" IS NOT NULL\)/;
    expect(CHK.test(sql)).toBe(true);
    expect(CHK.test(withoutFirst(CHK))).toBe(false);
  });
});

describe("migration 0022 (slice 7, stage A): lineage, feedback and the framework library", () => {
  const sql = migrationSql("0022_");
  // Every assertion is paired with a PLANTED violation, for the reason the
  // 0012 and 0020 blocks state: a source scan that matches nothing is
  // indistinguishable from a source scan that is broken (CLAUDE.md
  // 2026-08-21). The plant is a doctored copy of the REAL SQL, so the negative
  // case is this migration minus the property rather than a hand-typed
  // fixture.
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("M9: the lineage FK carries profile AND workspace, with an explicit ON DELETE and ON UPDATE", () => {
    // M9 is "parent_id FK drops profile/workspace columns", and it is a
    // MIGRATION mutation — no INSERT can demonstrate which COLUMNS a
    // constraint was declared with, only what it happens to refuse. This is
    // the structural half; `lineage-feedback.test.ts` drives the behavioural
    // one (a cross-profile parent that a one-column FK would accept).
    const FK =
      /"generations_parent_fk" FOREIGN KEY \("parent_id","profile_id","workspace_id"\) REFERENCES "public"\."generations"\("id","profile_id","workspace_id"\) ON DELETE cascade ON UPDATE restrict/;
    expect(FK.test(sql), "the three-column lineage FK is not in the migration").toBe(
      true
    );
    expect(
      FK.test(withoutFirst(FK)),
      "the scan matches a source with the FK removed — it is not reading what it claims to"
    ).toBe(false);
  });

  it("the feedback FKs are composite too — one to the profile, one to the generation", () => {
    // The second is not implied by the first: without it a row could name this
    // profile and ANOTHER profile's generation.
    const PROFILE_FK =
      /"generation_feedback_profile_workspace_fk" FOREIGN KEY \("profile_id","workspace_id"\) REFERENCES "public"\."creator_profiles"\("id","workspace_id"\) ON DELETE cascade/;
    const GENERATION_FK =
      /"generation_feedback_generation_fk" FOREIGN KEY \("generation_id","profile_id","workspace_id"\) REFERENCES "public"\."generations"\("id","profile_id","workspace_id"\) ON DELETE cascade ON UPDATE restrict/;
    for (const re of [PROFILE_FK, GENERATION_FK]) {
      expect(re.test(sql), String(re)).toBe(true);
      expect(re.test(withoutFirst(re))).toBe(false);
    }
    // ...and all three FK columns are NOT NULL, which is what stops MATCH
    // SIMPLE skipping either composite FK entirely.
    const create = createTableBlock(sql, "generation_feedback");
    for (const column of ["profile_id", "workspace_id", "generation_id"]) {
      // A literal SUBSTRING, not a built-up RegExp — a regex assembled from a
      // string literal needs doubled backslashes, and a lost one makes the
      // scan match nothing and fail OPEN.
      expect(
        create.includes('"' + column + '" uuid NOT NULL'),
        "generation_feedback." + column + " is nullable"
      ).toBe(true);
    }
  });

  it("EVERY foreign key this migration adds names an explicit ON DELETE and ON UPDATE", () => {
    const fks = [...sql.matchAll(/FOREIGN KEY[\s\S]*?REFERENCES[^;]*/gi)].map((m) => m[0]);
    expect(fks.length, "the scan found no FKs at all").toBe(3);
    expect(fks.filter((f) => !/ON DELETE/i.test(f))).toEqual([]);
    expect(fks.filter((f) => !/ON UPDATE/i.test(f))).toEqual([]);
  });

  it("the four framework partial uniques carry their WHERE predicates", () => {
    // Without the WHERE each becomes a GLOBAL unique over a key that is not
    // globally unique — `frameworks_shared_live_uq` on `slug` alone would stop
    // a creator ever naming their own framework after a library one, and
    // `frameworks_private_live_uq` would collapse every creator's frameworks
    // into one namespace. The predicate is the index.
    const INDEXES: [string, RegExp][] = [
      [
        "frameworks_shared_slug_version_uq",
        /CREATE UNIQUE INDEX "frameworks_shared_slug_version_uq" ON "frameworks" USING btree \("slug","version"\) WHERE "frameworks"\."visibility" = 'shared'/,
      ],
      [
        "frameworks_private_slug_version_uq",
        /CREATE UNIQUE INDEX "frameworks_private_slug_version_uq" ON "frameworks" USING btree \("owner_profile_id","slug","version"\) WHERE "frameworks"\."visibility" = 'private'/,
      ],
      [
        "frameworks_shared_live_uq",
        /CREATE UNIQUE INDEX "frameworks_shared_live_uq" ON "frameworks" USING btree \("slug"\) WHERE "frameworks"\."visibility" = 'shared' AND "frameworks"\."superseded_at" IS NULL/,
      ],
      [
        "frameworks_private_live_uq",
        /CREATE UNIQUE INDEX "frameworks_private_live_uq" ON "frameworks" USING btree \("owner_profile_id","slug"\) WHERE "frameworks"\."visibility" = 'private' AND "frameworks"\."superseded_at" IS NULL/,
      ],
    ];
    for (const [name, re] of INDEXES) {
      expect(re.test(sql), name + " is missing or has lost its WHERE").toBe(true);
      expect(re.test(withoutFirst(re)), name + " non-vacuity").toBe(false);
    }
    // ...and the GLOBAL slug unique the four replace is really gone: leaving it
    // would silently keep every property they exist to remove.
    expect(sql).toContain('DROP INDEX "frameworks_slug_uq"');
  });

  it("R6: parent_id immutability is a TRIGGER, and it is narrow", () => {
    // A CHECK cannot see a row's previous value, so this is the one property
    // in the slice that drizzle-kit cannot emit and the migration hand-appends.
    // Structural half only — `lineage-feedback.test.ts` ATTEMPTS the UPDATE.
    const FN =
      /CREATE OR REPLACE FUNCTION generations_refuse_parent_change\(\) RETURNS trigger/;
    const TRIGGER =
      /CREATE TRIGGER generations_parent_id_immutable\s+BEFORE UPDATE ON "generations"\s+FOR EACH ROW EXECUTE FUNCTION generations_refuse_parent_change\(\)/;
    for (const re of [FN, TRIGGER]) {
      expect(re.test(sql), String(re)).toBe(true);
      expect(re.test(withoutFirst(re))).toBe(false);
    }
    // NARROW: it compares `parent_id` with `IS DISTINCT FROM` (so a NULL on
    // either side is compared rather than swallowed) and refuses only that.
    // A blanket `BEFORE UPDATE ... RAISE` would be a control that becomes an
    // outage for a future deletion/pseudonymisation executor.
    expect(sql).toContain("NEW.parent_id IS DISTINCT FROM OLD.parent_id");
  });

  it("R6: the one-row cycle CHECK is present — the FK alone accepts a self-parent", () => {
    const CHK =
      /ADD CONSTRAINT "generations_parent_is_not_self" CHECK \("generations"\."parent_id" IS NULL OR "generations"\."parent_id" <> "generations"\."id"\)/;
    expect(CHK.test(sql)).toBe(true);
    expect(CHK.test(withoutFirst(CHK))).toBe(false);
  });

  it("R-29: confidence is tied to the evidence COUNT by a CHECK, in an ordered CASE", () => {
    // A `CASE`, not an `AND` chain: `jsonb_array_length` RAISES on a non-array
    // and Postgres does not guarantee `AND` evaluates left to right, so the
    // `AND` form would sometimes surface a driver error instead of a
    // constraint violation.
    const CHK = /ADD CONSTRAINT "frameworks_confidence_matches_evidence" CHECK \(CASE/;
    expect(CHK.test(sql)).toBe(true);
    expect(CHK.test(withoutFirst(CHK))).toBe(false);
    expect(sql).toContain(
      'WHEN jsonb_typeof("frameworks"."evidence_entries") <> \'array\' THEN false'
    );
    // ...and the retirement EQUALITY, which is what stops the two spellings of
    // "retired" disagreeing.
    const RET =
      /ADD CONSTRAINT "frameworks_retired_stamp" CHECK \(\("frameworks"\."saturation" = 'retired'\) = \("frameworks"\."retired_at" IS NOT NULL\)\)/;
    expect(RET.test(sql)).toBe(true);
    expect(RET.test(withoutFirst(RET))).toBe(false);
  });
});

describe("migration 0023 (tenancy gate, 2026-09-01): framework ownership is immutable", () => {
  // WHY THIS MIGRATION EXISTS. 0022 shipped a `BEFORE UPDATE` trigger for
  // `generations.parent_id` on the "an incident-time hand-run UPDATE is exactly
  // the path this closes" threat model, and left the column whose flip is
  // CROSS-TENANT unguarded. Measured on this repo's own PGlite build before
  // the fix: `UPDATE frameworks SET visibility='shared', owner_profile_id=NULL,
  // workspace_id=NULL` was ACCEPTED, turning a creator's private framework into
  // shared library content — while each HALF of the same move is refused by one
  // of the two CHECKs. Structural half only; `frameworks.test.ts` ATTEMPTS all
  // three UPDATEs and asserts the legitimate writes still pass.
  const sql = migrationSql("0023_");
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("the trigger and its function are declared, and the scan sees their absence", () => {
    const FN =
      /CREATE OR REPLACE FUNCTION frameworks_refuse_ownership_change\(\) RETURNS trigger/;
    const TRIGGER =
      /CREATE TRIGGER frameworks_ownership_immutable\s+BEFORE UPDATE ON "frameworks"\s+FOR EACH ROW EXECUTE FUNCTION frameworks_refuse_ownership_change\(\)/;
    for (const re of [FN, TRIGGER]) {
      expect(re.test(sql), String(re)).toBe(true);
      expect(
        re.test(withoutFirst(re)),
        "the scan matches a source with the statement removed — it is not reading what it claims to"
      ).toBe(false);
    }
  });

  it("it guards the WHOLE ownership triple, not the one column the finding named", () => {
    // Guarding `visibility` alone would leave re-parenting open: the composite
    // FK only requires the target to be a real (profile, workspace) pair, so
    // `SET owner_profile_id = <another profile>` hands one creator's framework
    // to another. Fixing the field and not the class is the defect this repo
    // has paid for six times (CLAUDE.md 2026-07-30).
    for (const column of ["visibility", "owner_profile_id", "workspace_id"]) {
      // A literal SUBSTRING, not an assembled RegExp — a lost backslash in a
      // string-built pattern makes the scan match nothing and fail OPEN.
      expect(
        sql.includes("NEW." + column + " IS DISTINCT FROM OLD." + column),
        column + " is not compared by the trigger"
      ).toBe(true);
    }
  });

  it("it is NARROW: nothing else on the table is frozen", () => {
    // 0022's trigger was deliberately narrow so it could not become an outage
    // for R-54's deletion/pseudonymisation executor, and this one holds to that
    // shape. A blanket refusal would break `editPrivateFramework`'s supersede,
    // `approvePrivateFramework` and `retirePrivateFramework` — all three of
    // which are driven against the live trigger in `frameworks.test.ts`.
    const body = sql.slice(
      offsetOf(sql, "CREATE OR REPLACE FUNCTION frameworks_refuse_ownership_change")
    );
    const compared = [...body.matchAll(/NEW\.([a-z_]+) IS DISTINCT FROM/g)].map(
      (m) => m[1]
    );
    expect(compared.sort()).toEqual([
      "owner_profile_id",
      "visibility",
      "workspace_id",
    ]);
    // ...and it is an UPDATE trigger only. A BEFORE INSERT version would make
    // every insert compare against a NULL `OLD` and refuse everything.
    expect(sql).not.toMatch(/BEFORE INSERT ON "frameworks"/);
    expect(sql).not.toMatch(/BEFORE DELETE ON "frameworks"/);
  });

  it("`IS DISTINCT FROM`, never `<>` — two of the three columns are NULL on every shared row", () => {
    // Not style: with `<>`, a shared row's NULL `owner_profile_id` makes the
    // comparison NULL, the `IF` does not fire, and the trigger passes the exact
    // move it exists to refuse.
    const body = sql.slice(offsetOf(sql, "CREATE OR REPLACE FUNCTION"));
    expect(body).not.toMatch(/NEW\.[a-z_]+ <> OLD\./);
    // PAIRED, BOTH WAYS (tenancy gate NOTE, 2026-09-02). A NEGATIVE assertion
    // over a slice is the other fail-open shape `offsetOf` closes: `indexOf`
    // returning -1 made `body` the LAST CHARACTER of the file, and "no `<>` in
    // the trigger body" passed on a body that was not the trigger. So: the
    // rule really fires on a body that violates it, and the slice really
    // refuses a source with no function in it.
    expect(/NEW\.[a-z_]+ <> OLD\./.test(body.replace(/IS DISTINCT FROM/g, "<>"))).toBe(
      true
    );
    expect(() =>
      offsetOf(sql.replace(/CREATE OR REPLACE FUNCTION/g, ""), "CREATE OR REPLACE FUNCTION")
    ).toThrow();
  });
});

describe("migration 0024 (R-80): the included-build claim, and its backfill", () => {
  const sql = migrationSql("0024_");
  // Every assertion is paired with a PLANTED violation, for the reason the
  // 0012, 0020 and 0022 blocks state: a source scan that matches nothing is
  // indistinguishable from a source scan that is broken (CLAUDE.md
  // 2026-08-21). The plant is a doctored copy of the REAL migration.
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("creates exactly the one table", () => {
    const created = [...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)].map(
      (m) => m[1]
    );
    expect(created).toEqual(["first_billable_attempts"]);
  });

  it("THE UNIQUE INDEX IS THE WHOLE CONTROL — one claim per (profile, purpose)", () => {
    // Without it this table is a log, not a decision: two concurrent
    // first-ever attempts would each insert a row and each read itself as the
    // holder, which is the defect R-80 exists to close, one layer down.
    const IDX =
      /CREATE UNIQUE INDEX "first_billable_attempts_profile_purpose_uq" ON "first_billable_attempts" USING btree \("profile_id","purpose"\)/;
    expect(IDX.test(sql)).toBe(true);
    expect(
      IDX.test(withoutFirst(IDX)),
      "the scan matches a source with the index removed — it is not reading what it claims to"
    ).toBe(false);
  });

  it("the composite FK carries BOTH scope columns, with an explicit ON DELETE", () => {
    // Postgres defaults an unqualified FK to NO ACTION, and MATCH SIMPLE skips
    // a composite FK entirely when any column is NULL — so both halves are
    // NOT NULL and the cascade is named, exactly like `model_usage`, the table
    // whose rows this one ranks.
    const FK =
      /"first_billable_attempts_profile_workspace_fk" FOREIGN KEY \("profile_id","workspace_id"\) REFERENCES "public"\."creator_profiles"\("id","workspace_id"\) ON DELETE cascade/;
    expect(FK.test(sql)).toBe(true);
    expect(FK.test(withoutFirst(FK))).toBe(false);
    const create = createTableBlock(sql, "first_billable_attempts");
    expect(/"profile_id" uuid NOT NULL/.test(create)).toBe(true);
    expect(/"workspace_id" uuid NOT NULL/.test(create)).toBe(true);
  });

  it("IT BACKFILLS, and the backfill is the part a populated database needs", () => {
    // A claim table that arrives EMPTY means "nobody has claimed a build yet",
    // so every creator who already spent theirs would silently get a second
    // one — the same defect pointing the other way, once per existing profile.
    // The behavioural half of this (what the statement actually selects,
    // against real rows) is `included-build-backfill.docker.test.ts`; this is
    // the structural half, which no INSERT can demonstrate.
    const INSERT =
      /INSERT INTO "first_billable_attempts" \("id", "profile_id", "workspace_id", "purpose", "attempt_id", "created_at"\)/;
    expect(INSERT.test(sql)).toBe(true);
    expect(INSERT.test(withoutFirst(INSERT))).toBe(false);
    // ...over the SAME population the pricing rule uses: billable outcomes AND
    // consumed_included_build. Either half alone is a different table.
    expect(sql).toMatch(/"outcome" IN \('succeeded', 'schema_invalid', 'refused'\)/);
    expect(sql).toMatch(/"consumed_included_build" = true/);
    // ...and it is RE-RUNNABLE, which is what makes the migrate-then-deploy
    // window closable rather than a permanent hole.
    expect(sql).toMatch(/ON CONFLICT \("profile_id", "purpose"\) DO NOTHING/);
  });

  it("the index is created BEFORE the backfill runs — and BOTH statements are there", () => {
    // Ordering, structurally. If the backfill could ever produce two winners
    // for one (profile, purpose), the migration must FAIL rather than seed the
    // exact ambiguity the table exists to remove.
    //
    // THIS WAS THIS BLOCK'S ONE UNPAIRED ASSERTION (tenancy gate NOTE,
    // 2026-09-02), and the block's header claims every assertion is paired
    // with a planted violation. `indexOf` returns -1 for absent and -1 is less
    // than every real offset, so DELETING THE INDEX OUTRIGHT made the case
    // pass — an ordering test that is satisfied by there being nothing to
    // order. `offsetOf` refuses the absence; the plant below is the witness.
    expect(
      offsetOf(sql, "CREATE UNIQUE INDEX"),
      "the backfill runs before the constraint that would catch a bad one"
    ).toBeLessThan(offsetOf(sql, 'INSERT INTO "first_billable_attempts"'));

    const IDX = /CREATE UNIQUE INDEX "first_billable_attempts_profile_purpose_uq"[^;]*;/;
    expect(IDX.test(sql), "the plant below would remove nothing").toBe(true);
    expect(
      () => offsetOf(sql.replace(IDX, ""), "CREATE UNIQUE INDEX"),
      "with the index removed the ordering assertion still passed — it is reading -1, not an offset"
    ).toThrow();
  });

  it("the FROZEN outcome list still equals BILLABLE_USAGE_OUTCOMES (R-81)", () => {
    // THE MIGRATION MUST NOT CHANGE — it is applied and its journal entry is
    // committed. So this does NOT derive the SQL from the constant; it pins
    // the two together so a DIVERGENCE is a decision somebody makes on
    // purpose rather than a surprise.
    //
    // WHY IT MATTERS FOR A FROZEN FILE (billing + tenancy gate NOTE,
    // 2026-09-02): this migration's own header recommends RE-RUNNING the
    // backfill after the code that writes claims is deployed, and
    // `onboarding-schema.ts` records that a sixth billable outcome was
    // expected. A re-run under a widened `BILLABLE_USAGE_OUTCOMES` would use
    // the old, narrower list and silently leave the new outcome's first
    // attempts unclaimed. `USAGE_OUTCOME_BILLABLE`'s
    // `satisfies Record<UsageOutcome, boolean>` cannot see this: it proves the
    // map is TOTAL over the enum, never that this SQL agrees with it.
    //
    // A DIVERGENCE IS NOT AUTOMATICALLY A DEFECT. Whoever reddens this decides
    // between "the frozen backfill was right for the rows it ran against, and
    // a NEW forward migration claims the new outcome's rows" and "the re-run
    // is no longer safe" — and records which, here.
    // SET-WISE, NOT SUBSTRING (billing gate round 2 NOTE). The first version
    // joined the constant in DECLARATION ORDER and matched it as a substring,
    // so a purely COSMETIC reorder of `USAGE_OUTCOME_BILLABLE`'s keys reddened
    // this case — and the message then told the reader to decide what the
    // re-run should do about a set that had not changed, which is the wrong
    // question entirely. What matters here is WHICH outcomes, never in which
    // order they were written.
    expect(
      sql.split('"outcome" IN (').length - 1,
      "this pin reads the FIRST outcome predicate; a second one means it is no longer reading the whole story"
    ).toBe(1);
    const predicate = sql.match(/"outcome" IN \(([^)]*)\)/);
    expect(
      predicate,
      "the backfill's outcome predicate is gone — this migration is not what this case thinks it is"
    ).not.toBeNull();
    const inSql = predicate![1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(
      inSql,
      "BILLABLE_USAGE_OUTCOMES has changed since migration 0024 was frozen — decide what the re-run its header recommends should now do, and say so here"
    ).toEqual([...BILLABLE_USAGE_OUTCOMES].sort());
    // Non-vacuity, three ways: the parse really read a list rather than an
    // empty `IN ()`; a REORDER of the constant does NOT redden this; and a
    // CHANGED SET does.
    expect(inSql.length).toBeGreaterThan(1);
    expect(inSql).toEqual([...BILLABLE_USAGE_OUTCOMES].reverse().sort());
    const widened = sql.replace('"outcome" IN (', "\"outcome\" IN ('rate_limited', ");
    const widenedList = widened
      .match(/"outcome" IN \(([^)]*)\)/)![1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(widenedList).not.toEqual([...BILLABLE_USAGE_OUTCOMES].sort());
  });

  it("NOTHING here alters an existing table (B-4)", () => {
    // Migration 0012 set NOT NULL plus a non-empty CHECK on a POPULATED table
    // with no backfill and no NOT VALID/VALIDATE split, which aborts a deploy
    // mid-migration. This migration creates a new table and fills it from data
    // that already exists, so there is no constraint a pre-existing row can
    // violate. The only ALTER it may contain is the new table's own FK.
    const alters = [...sql.matchAll(/ALTER TABLE "([a-z_]+)"/gi)].map((m) => m[1]);
    expect([...new Set(alters)]).toEqual(["first_billable_attempts"]);
  });
});

describe("migration 0026 (R-96): the unavailable baseline, and the transcript's reference input", () => {
  const sql = migrationSql("0026_");
  const previous = migrationSql("0025_");
  // Every assertion paired with a planted violation, as the 0024 block states.
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");
  const EIGHT = [
    "channel_id", "video_views", "channel_median_recent_views", "baseline_sample_size",
    "baseline_observation_ids", "baseline_window_starts_at", "baseline_window_ends_at", "outlier_ratio",
  ];

  it("creates NO table and alters exactly trend_items and trend_transcripts (expand-only)", () => {
    expect([...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)]).toEqual([]);
    const alters = [...sql.matchAll(/ALTER TABLE "([a-z_]+)"/gi)].map((m) => m[1]);
    expect([...new Set(alters)].sort()).toEqual(["trend_items", "trend_transcripts"]);
    expect(sql).toMatch(/CREATE TYPE "public"\."trend_baseline_state" AS ENUM\('measured', 'unavailable'\)/);
  });

  it("baseline_state arrives NOT NULL WITH DEFAULT 'measured' — the default IS the backfill", () => {
    const COLUMN = /ADD COLUMN "baseline_state" "trend_baseline_state" DEFAULT 'measured' NOT NULL/;
    expect(COLUMN.test(sql)).toBe(true);
    expect(COLUMN.test(withoutFirst(COLUMN))).toBe(false);
  });

  it("EXACTLY the eight baseline columns drop NOT NULL — no more, no fewer", () => {
    const dropped = [...sql.matchAll(/ALTER TABLE "trend_items" ALTER COLUMN "([a-z_]+)" DROP NOT NULL/g)].map((m) => m[1]);
    expect([...dropped].sort()).toEqual([...EIGHT].sort());
    // `source_published_at` is deliberately NOT among them.
    expect(dropped).not.toContain("source_published_at");
    const outlierDrop = /ALTER TABLE "trend_items" ALTER COLUMN "outlier_ratio" DROP NOT NULL;--> statement-breakpoint(?:\r?\n|$)/;
    const matches = sql.match(new RegExp(outlierDrop.source, "g")) ?? [];
    expect(
      matches,
      "the plant must remove exactly one real outlier_ratio statement"
    ).toHaveLength(1);
    const planted = withoutFirst(outlierDrop);
    expect(
      sql.length - planted.length,
      "withoutFirst must remove the complete one matched statement"
    ).toBe(matches[0]!.length);
    expect([...planted.matchAll(/ALTER COLUMN "([a-z_]+)" DROP NOT NULL/g)].map((m) => m[1]).sort()).not.toEqual([...EIGHT].sort());
  });

  it("the two arithmetic CHECKs are re-issued as `'unavailable' OR (<0025's predicate, VERBATIM>)`", () => {
    // Read 0025's predicates out of 0025 itself, so "verbatim" is measured
    // against the file rather than restated here.
    const predicateOf = (name: string): string => {
      const line = previous.split("\n").find((l) => l.includes(`CONSTRAINT "${name}" CHECK (`));
      expect(line, name + " is not in 0025").toBeDefined();
      const start = line!.indexOf("CHECK (") + "CHECK (".length;
      return line!.slice(start, line!.lastIndexOf("),"));
    };
    const provenance = predicateOf("trend_items_baseline_provenance");
    const ratio = predicateOf("trend_items_outlier_ratio_matches_inputs");
    expect(provenance).toContain("jsonb_array_length");
    expect(ratio).toContain("ROUND(");
    const PROV = `ADD CONSTRAINT "trend_items_baseline_provenance" CHECK ("trend_items"."baseline_state" = 'unavailable' OR (${provenance}));`;
    const RATIO = `ADD CONSTRAINT "trend_items_outlier_ratio_matches_inputs" CHECK ("trend_items"."baseline_state" = 'unavailable' OR ${ratio});`;
    expect(sql).toContain(PROV);
    expect(sql).toContain(RATIO);
    // Both are DROPPED before they are re-added (a re-add without the drop fails on a live database).
    expect(offsetOf(sql, 'DROP CONSTRAINT "trend_items_baseline_provenance"')).toBeLessThan(offsetOf(sql, PROV));
    expect(offsetOf(sql, 'DROP CONSTRAINT "trend_items_outlier_ratio_matches_inputs"')).toBeLessThan(offsetOf(sql, RATIO));
    // Planted: a predicate that quietly loosened one comparison is not verbatim.
    expect(sql.replace("> 0 AND", ">= 0 AND")).not.toContain(PROV);
  });

  it("the shape CHECK names ALL EIGHT in both branches and ties `unavailable` to `profile_private`", () => {
    const line = sql.split("\n").find((l) => l.includes('ADD CONSTRAINT "trend_items_baseline_state_shape"'));
    expect(line).toBeDefined();
    for (const column of EIGHT) {
      expect(line!.match(new RegExp(`"${column}" IS NULL`, "g")), column + " IS NULL").toHaveLength(1);
      expect(line!.match(new RegExp(`"${column}" IS NOT NULL`, "g")), column + " IS NOT NULL").toHaveLength(1);
    }
    expect(line).toMatch(/"baseline_state" = 'unavailable' AND "trend_items"\."rights_scope" = 'profile_private'/);
    // Planted: with one column removed from the NULL branch, the count is wrong.
    const planted = line!.replace('AND "trend_items"."outlier_ratio" IS NULL', "");
    expect(planted.match(/"outlier_ratio" IS NULL/g)).toBeNull();
  });

  it("reference_input_id: FK → onboarding_inputs(id) ON DELETE cascade, a unique index, and the IS NOT DISTINCT FROM CHECK", () => {
    const FK = /"trend_transcripts_reference_input_id_onboarding_inputs_id_fk" FOREIGN KEY \("reference_input_id"\) REFERENCES "public"\."onboarding_inputs"\("id"\) ON DELETE cascade/;
    expect(FK.test(sql)).toBe(true);
    expect(FK.test(withoutFirst(FK))).toBe(false);
    const UQ = /CREATE UNIQUE INDEX "trend_transcripts_reference_input_uq" ON "trend_transcripts" USING btree \("reference_input_id"\)/;
    expect(UQ.test(sql)).toBe(true);
    expect(UQ.test(withoutFirst(UQ))).toBe(false);
    const CHECK = /ADD CONSTRAINT "trend_transcripts_creator_paste_has_reference" CHECK \(\("trend_transcripts"\."provenance"->>'kind' IS NOT DISTINCT FROM 'creator_paste'\) = \("trend_transcripts"\."reference_input_id" IS NOT NULL\)\)/;
    expect(CHECK.test(sql)).toBe(true);
    expect(CHECK.test(withoutFirst(CHECK))).toBe(false);
    // Planted: the `=` spelling (NULL passes) is NOT what shipped.
    expect(sql).not.toMatch(/provenance"->>'kind' = 'creator_paste'\)/);
    // Nullable, deliberately: pre-0026 rows and shared rows have no input.
    expect(sql).toMatch(/ADD COLUMN "reference_input_id" uuid;/);
  });

  it("the header documents compatibility, order, rollback, restore and the deletion registry", () => {
    for (const heading of ["FORWARD / BACKWARD COMPATIBILITY", "ORDER: expand", "ROLLBACK", "RESTORE IMPLICATIONS", "DELETION-REGISTRY IMPACT"]) {
      expect(sql, heading).toContain(heading);
    }
    // The rollback names its one destructive step rather than hiding it.
    expect(sql).toMatch(/DELETE FROM trend_items WHERE baseline_state = 'unavailable'/);
    // Planted: a header with the rollback section deleted is seen.
    expect(sql.replace(/-- ROLLBACK[\s\S]*?-- RESTORE/, "-- RESTORE")).not.toContain("ROLLBACK");
  });
});

describe("migration 0028 (C11): the unmeasured reason names its cause, and the backfill sits between the two constraints", () => {
  const sql = migrationSql("0028_");
  const withoutFirst = (needle: RegExp): string => sql.replace(needle, "");

  it("alters exactly trend_items, creates and drops nothing else", () => {
    expect([...sql.matchAll(/CREATE TABLE\s+"([a-z_]+)"/gi)]).toEqual([]);
    expect([...sql.matchAll(/CREATE (UNIQUE )?INDEX/gi)]).toEqual([]);
    expect([...new Set([...sql.matchAll(/ALTER TABLE "([a-z_]+)"/gi)].map((m) => m[1]))]).toEqual(["trend_items"]);
    // One constraint dropped, the same one re-added: this is a re-issue, not a
    // second control.
    expect([...sql.matchAll(/DROP CONSTRAINT "([a-z_]+)"/g)].map((m) => m[1])).toEqual(["trend_items_saturation_measurement_nonempty"]);
    expect([...sql.matchAll(/ADD CONSTRAINT "([a-z_]+)"/g)].map((m) => m[1])).toEqual(["trend_items_saturation_measurement_nonempty"]);
  });

  it("the reason is tied to baseline_state by a CASE — not widened to a two-value list", () => {
    const CASE_TIE = /"saturation_unmeasured_reason" = CASE WHEN "trend_items"\."baseline_state" = 'unavailable' THEN 'no_population' ELSE 'incomplete_provenance' END/;
    expect(CASE_TIE.test(sql)).toBe(true);
    expect(CASE_TIE.test(withoutFirst(CASE_TIE))).toBe(false);
    // THE MUTATION THIS ASSERTION EXISTS FOR: `IN ('no_population',
    // 'incomplete_provenance')` admits both reasons on both states, which is a
    // vocabulary and not a tie — an `unavailable` row could still ship
    // `incomplete_provenance`, the exact defect 0028 closes.
    expect(sql).not.toMatch(/"saturation_unmeasured_reason" IN \(/);
    // The measured branch is untouched: it still requires the reason to be NULL.
    expect(sql).toContain(`"trend_items"."saturation_unmeasured_reason" IS NULL`);
  });

  it("IT BACKFILLS, and the backfill runs BETWEEN the drop and the re-add", () => {
    const UPDATE = `UPDATE "trend_items" SET "saturation_unmeasured_reason" = 'no_population' WHERE "baseline_state" = 'unavailable' AND "saturation" = 'unmeasured' AND "saturation_unmeasured_reason" IS DISTINCT FROM 'no_population';`;
    expect(sql).toContain(UPDATE);
    // Order is the whole point: re-adding the CHECK before the rows are
    // relabelled fails on any populated database.
    expect(offsetOf(sql, 'DROP CONSTRAINT "trend_items_saturation_measurement_nonempty"'))
      .toBeLessThan(offsetOf(sql, UPDATE));
    expect(offsetOf(sql, UPDATE))
      .toBeLessThan(offsetOf(sql, 'ADD CONSTRAINT "trend_items_saturation_measurement_nonempty"'));
    // Planted, with PLAIN STRING operations rather than an assembled regex
    // (CLAUDE.md 2026-08-21 — a scan built from a string literal fails open the
    // day one backslash is lost): the statement appears EXACTLY once, and with
    // that one occurrence removed the file no longer contains it. The header's
    // ROLLBACK section quotes a different, unquoted UPDATE, so this cannot be
    // satisfied by prose.
    expect(sql.split(UPDATE)).toHaveLength(2);
    expect(sql.replace(UPDATE, "")).not.toContain(UPDATE);
    // ...and the backfill is IDEMPOTENT by its own predicate, so a re-run and a
    // restore-then-apply are no-ops rather than a second relabelling.
    expect(UPDATE).toContain(`IS DISTINCT FROM 'no_population'`);
  });

  it("the header documents compatibility, order, rollback, restore and the deletion registry — including that it is NOT expand-only", () => {
    for (const heading of ["FORWARD / BACKWARD COMPATIBILITY", "ORDER: expand", "ROLLBACK", "RESTORE IMPLICATIONS", "DELETION-REGISTRY IMPACT"]) {
      expect(sql, heading).toContain(heading);
    }
    // The one operational fact a reader must not miss: old code writing the old
    // reason is REFUSED, so deploy order is not free.
    expect(sql).toContain("DEPLOY ORDER");
    expect(sql).toContain("never before it");
    // The rollback names what it cannot restore rather than claiming to be clean.
    expect(sql).toContain("NOT loss-free");
    // Planted, again with plain string slicing: with the ROLLBACK SECTION cut
    // out, its heading is gone. (`toContain("ROLLBACK")` alone would be
    // satisfied by the compatibility paragraph, which mentions rolling back —
    // the heading is what this asserts.)
    const rollbackAt = offsetOf(sql, "-- ROLLBACK (no automated down");
    const restoreAt = offsetOf(sql, "-- RESTORE IMPLICATIONS", rollbackAt);
    expect(sql.slice(0, rollbackAt) + sql.slice(restoreAt)).not.toContain("-- ROLLBACK (no automated down");
  });
});

describe("migration 0034: persisted rights and Stripe receipt attribution", () => {
  const sql = migrationSql("0034_");

  it("fails closed instead of guessing subjects for pre-existing shared analysis", () => {
    for (const table of ["trend_transcripts", "autopsy_cache_claims", "autopsies"]) {
      expect(sql).toContain(`SELECT 1 FROM "${table}" WHERE "rights_scope" = 'shared_analysis'`);
    }
    expect(sql).toContain("no subject was guessed");
    expect(sql).toContain(`"curated_by" IS DISTINCT FROM 'seed:respin-library-v1'`);
    expect(sql).toContain("explicit rights attribution for pre-existing non-seed shared frameworks");
  });

  it("backfills only deterministic classes before setting the new columns NOT NULL", () => {
    expect(sql).toContain(`SET "rights_basis" = 'profile_private'`);
    expect(sql).toContain(`WHEN "visibility" = 'shared' AND "curated_by" = 'seed:respin-library-v1' THEN 'product_seed'`);
    expect(sql).toContain(`WHEN "workspace_id" IS NOT NULL THEN 'workspace_attributed'`);
    expect(sql).toContain(`WHEN "stripe_customer_id" IS NOT NULL THEN 'customer_attributed'`);
    expect(sql).toContain(`ELSE 'unattributed'`);
    expect(offsetOf(sql, `UPDATE "stripe_events"`))
      .toBeLessThan(offsetOf(sql, `ALTER TABLE "stripe_events" ALTER COLUMN "receipt_attribution" SET NOT NULL`));
  });

  it("uses SET NULL and immutable persisted classifications", () => {
    expect(sql).toContain(
      `"stripe_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action`,
    );
    expect(sql).toContain(
      `"autopsies_matched_framework_id_frameworks_id_fk" FOREIGN KEY ("matched_framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null`,
    );
    for (const trigger of [
      "trend_transcripts_rights_immutable",
      "autopsy_cache_claims_rights_immutable",
      "autopsies_rights_immutable",
      "frameworks_rights_immutable",
      "stripe_events_receipt_attribution_immutable",
    ]) {
      expect(sql).toContain(`CREATE TRIGGER ${trigger}`);
    }
  });

  it("requires non-NULL, nonblank evidence for consent and licences on every rights table", () => {
    for (const table of ["trend_transcripts", "autopsy_cache_claims", "autopsies", "frameworks"]) {
      expect(sql.match(new RegExp(`"${table}"\\."rights_evidence_id" IS NOT NULL`, "g"))).toHaveLength(2);
      expect(sql.match(new RegExp(`"${table}"\\."rights_evidence_id" ~ '\\[\\^\\[:space:\\]\\]'`, "g"))).toHaveLength(2);
    }
  });
});

describe("migration 0046: durable scoped authority and cross-scope requester privacy", () => {
  const sql = migrationSql("0046_");

  it("fails closed on active legacy sessionless operations before mutating the table", () => {
    const guard = `WHERE "request_session_digest" IS NULL\n      AND "state" NOT IN ('complete', 'cancelled')`;
    const firstMutation = `ALTER TABLE "deletion_operations" DROP CONSTRAINT "deletion_operations_request_session_digest_shape"`;
    expect(sql).toContain(guard);
    expect(sql).toContain("refuses to fabricate missing deletion request session authority");
    expect(offsetOf(sql, guard)).toBeLessThan(offsetOf(sql, firstMutation));
    expect(sql).not.toContain(`ALTER COLUMN "request_session_digest" SET NOT NULL`);
    expect(sql).toContain(`"state" IN ('complete', 'cancelled') AND "deletion_operations"."request_session_digest" IS NULL`);
    expect(sql).toContain(`"state" NOT IN ('complete', 'cancelled') AND "deletion_operations"."request_session_digest" ~ '^[0-9a-f]{64}$'`);
  });

  it("backfills domain-separated requester digests before tightening either table", () => {
    for (const table of ["deletion_operations", "deletion_operation_transitions"]) {
      const add = `ALTER TABLE "${table}" ADD COLUMN "requester_digest" text;`;
      const update = `UPDATE "${table}"
SET "requester_digest" = encode(`;
      const tighten = `ALTER TABLE "${table}" ALTER COLUMN "requester_digest" SET NOT NULL;`;
      expect(sql).toContain(add);
      expect(sql).toContain(update);
      expect(sql).toContain(`respin:deletion-requester:v1:`);
      expect(offsetOf(sql, add)).toBeLessThan(offsetOf(sql, update));
      expect(offsetOf(sql, update)).toBeLessThan(offsetOf(sql, tighten));
    }
  });

  it("makes the stable digest, not the nullable human id, the transition identity", () => {
    const childDrop = `DROP CONSTRAINT "deletion_operation_transitions_operation_identity_fk"`;
    const parentDrop = `DROP CONSTRAINT "deletion_operations_transition_identity_uq"`;
    const parentUnique = `ADD CONSTRAINT "deletion_operations_transition_identity_uq" UNIQUE("id","scope","target_key","requester_digest","payload_hash")`;
    const childFk = `FOREIGN KEY ("operation_id","scope","target_key","requester_digest","payload_hash")`;
    expect(offsetOf(sql, childDrop)).toBeLessThan(offsetOf(sql, parentDrop));
    expect(sql).toContain(parentUnique);
    expect(sql).toContain(childFk);
    expect(offsetOf(sql, parentUnique)).toBeLessThan(offsetOf(sql, childFk));
    expect(sql.match(/requester_user_id_users_id_fk" FOREIGN KEY \("requester_user_id"\)[^;]+ON DELETE set null/g)).toHaveLength(2);
    expect(sql).not.toContain(`FOREIGN KEY ("operation_id","scope","target_key","requester_user_id","payload_hash")`);
  });
});

describe("migration 0047: profile deletion restore authority is total and scoped", () => {
  const sql = migrationSql("0047_");

  it("fails closed on legacy rows before installing the constraint", () => {
    const guard = `WHERE ("scope" = 'profile' AND (`;
    const constraint =
      `ALTER TABLE "deletion_operations" ADD CONSTRAINT "deletion_operations_profile_prior_state_shape"`;
    expect(sql).toContain(guard);
    expect(sql).toContain(`"profile_prior_state" NOT IN ('active', 'archived')`);
    expect(sql).toContain(`"scope" <> 'profile' AND "profile_prior_state" IS NOT NULL`);
    expect(sql).toContain("refuses invalid deletion profile restore authority");
    expect(offsetOf(sql, guard)).toBeLessThan(offsetOf(sql, constraint));
  });

  it("changes only deletion_operations and closes both halves of the shape", () => {
    expect([...new Set([...sql.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]))])
      .toEqual(["deletion_operations"]);
    expect(sql).not.toContain(`ALTER TABLE "memberships"`);
    expect(sql).toContain(
      `"deletion_operations"."scope" = 'profile' AND "deletion_operations"."profile_prior_state" IN ('active', 'archived')`
    );
    expect(sql).toContain(
      `"deletion_operations"."scope" <> 'profile' AND "deletion_operations"."profile_prior_state" IS NULL`
    );
    expect(sql).toContain(`) IS TRUE`);
  });
});

describe("migration 0048: durable auto-top-up attempt and rollout authority", () => {
  const sql = migrationSql("0048_");

  it("runs its populated-money preflight before any DDL", () => {
    const guard = "0048 preflight: a legacy auto_topup row lacks";
    expect(sql).toContain(guard);
    expect(offsetOf(sql, guard)).toBeLessThan(
      offsetOf(sql, 'CREATE TABLE "auto_topup_protocol_rollouts"')
    );
  });

  it("keeps expansion protocol-0 by default and normalizes fresh inserts only after activation", () => {
    expect(sql).toContain(
      'ADD COLUMN "auto_topup_protocol_version" integer DEFAULT 0 NOT NULL'
    );
    expect(sql).toContain(
      'ADD COLUMN "auto_topup_attempt_cutover_at" timestamp with time zone'
    );
    expect(sql).toContain('CREATE FUNCTION "normalize_auto_topup_protocol_insert"()');
    expect(sql).toContain(`WHERE "protocol" = 'v1' AND "state" = 'active'`);
    expect(sql).toContain('NEW."auto_topup_protocol_version" := 1');
    expect(sql).toContain('NEW."auto_topup_attempt_cutover_at" := clock_timestamp()');
    expect(sql).toContain('NEW."auto_topup_attempt_id" := NEW."id"');
    expect(sql).toContain('NEW."auto_topup_period_month_utc" := to_char(');
    expect(sql).toContain(
      "auto_topup ledger rows require durable attempt authority after activation"
    );
  });

  it("makes rollout revisions part of every legal state shape", () => {
    const rollout = createTableBlock(sql, "auto_topup_protocol_rollouts");
    expect(rollout).toContain('"revision" integer DEFAULT 0 NOT NULL');
    expect(rollout).toContain('"state" = \'expanded\'\n        AND "auto_topup_protocol_rollouts"."revision" = 0');
    expect(rollout).toContain('"state" = \'draining\'\n        AND "auto_topup_protocol_rollouts"."revision" > 0');
    expect(rollout).toContain('"state" = \'active\'\n        AND "auto_topup_protocol_rollouts"."revision" > 0');
  });

  it("requires reservation, dispatch and claim authority atomically for every pending attempt", () => {
    const constraintAt = offsetOf(
      sql,
      'ADD CONSTRAINT "subscriptions_auto_topup_attempt_shape"'
    );
    const constraint = sql.slice(
      constraintAt,
      offsetOf(sql, ");", constraintAt)
    );
    for (const predicate of [
      '"auto_topup_attempt_reserved_at" IS NOT NULL',
      '"auto_topup_attempt_dispatched_at" >= "subscriptions"."auto_topup_attempt_reserved_at"',
      '"auto_topup_attempt_claim_id" IS NOT NULL',
      '"auto_topup_attempt_claimed_at" >= "subscriptions"."auto_topup_attempt_dispatched_at"',
    ]) {
      expect(constraint, `${predicate} is absent`).toContain(predicate);
    }
  });

  it("makes nullable money-state comparisons fail closed instead of passing as UNKNOWN", () => {
    for (const constraintName of [
      "auto_topup_protocol_rollouts_shape",
      "credit_ledger_auto_topup_attempt_shape",
      "subscriptions_auto_topup_attempt_shape",
      "subscriptions_auto_topup_protocol_shape",
    ]) {
      const constraintAt = offsetOf(sql, `CONSTRAINT "${constraintName}"`);
      const constraint = sql.slice(
        constraintAt,
        offsetOf(sql, ");", constraintAt) + 2
      );
      expect(constraint, `${constraintName} must reject SQL UNKNOWN`).toContain(
        ")) IS TRUE)"
      );
    }
  });
});

describe("migration 0049: staged durable tier Checkout authority", () => {
  const sql = migrationSql("0049_");

  it("is one atomic expansion with a closed rollout and no intermediate attempt shape", () => {
    expect(sql).toContain('CREATE TABLE "tier_checkout_protocol_rollouts"');
    expect(sql).toContain(
      'INSERT INTO "tier_checkout_protocol_rollouts" ("protocol", "state", "revision")'
    );
    expect(sql).toContain("VALUES ('v1', 'expanded', 0)");
    expect(sql).toContain('ADD COLUMN "tier_checkout_attempt_stripe_account_id" text');
    expect(sql).toContain('ADD COLUMN "tier_checkout_attempt_stripe_livemode" boolean');
    expect(sql).toContain('ADD COLUMN "tier_checkout_fence_observed_subscription_id" text');
  });

  it("keeps expansion transparent to old webhooks and serializes every later subscription write", () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "respin_tier_checkout_write_guard"()');
    expect(sql).toContain("IF rollout_state = 'expanded' THEN");
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain(
      'CREATE TRIGGER "subscriptions_tier_checkout_write_guard"'
    );
    expect(sql).toContain("tier Checkout attempt creation requires active rollout");
    expect(sql).toContain("tier Checkout attempt authority is immutable");
  });

  it("fences legacy inserts and irreversible transitions only after draining begins", () => {
    expect(sql).toContain("IF TG_OP = 'INSERT'");
    expect(sql).toContain(
      "NEW.\"stripe_subscription_id\" := 'checkout_fence:' || NEW.\"workspace_id\"::text"
    );
    expect(sql).toContain("NEW.\"status\" IN ('canceled', 'incomplete_expired')");
    expect(sql).toContain(
      'NEW."tier_checkout_fence_subscription_id" := NEW."stripe_subscription_id"'
    );
  });

  it("binds attempts to the active rollout account/mode and rejects SQL UNKNOWN", () => {
    expect(sql).toContain("rollout_state NOT IN ('draining', 'active')");
    expect(sql).toContain(
      'NEW."tier_checkout_attempt_stripe_account_id" IS DISTINCT FROM rollout_account'
    );
    expect(sql).toContain(
      'NEW."tier_checkout_attempt_stripe_livemode" IS DISTINCT FROM rollout_livemode'
    );
    for (const constraintName of [
      "tier_checkout_protocol_rollouts_shape",
      "credit_ledger_pack_checkout_attempt_shape",
      "credit_ledger_tier_checkout_attempt_shape",
      "subscriptions_tier_checkout_attempt_shape",
      "subscriptions_tier_checkout_fence_shape",
    ]) {
      const constraintAt = offsetOf(sql, `CONSTRAINT "${constraintName}"`);
      const constraint = sql.slice(
        constraintAt,
        offsetOf(sql, ");", constraintAt) + 2
      );
      expect(constraint, `${constraintName} must reject SQL UNKNOWN`).toContain(
        ")) IS TRUE)"
      );
    }
  });

  it("guards every post-expansion config write and pins pack expiry to UTC", () => {
    expect(sql).toContain('CREATE TRIGGER "config_versions_pack_checkout_write_guard"');
    expect(sql).toContain("IF rollout_state IN ('draining', 'active') THEN");
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("to_timestamp(provider_created) AT TIME ZONE 'UTC'");
    expect(sql).toContain("AT TIME ZONE 'UTC' THEN");
  });
});
