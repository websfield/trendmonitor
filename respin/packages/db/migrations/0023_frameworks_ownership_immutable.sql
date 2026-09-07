-- A HAND-WRITTEN MIGRATION (`drizzle-kit generate --custom`), because drizzle
-- has no trigger DSL. The schema is unchanged — `0023_snapshot.json` is
-- 0022's shape re-linked — and everything below is the one property the
-- generator cannot emit.
--
-- WHAT THIS CLOSES (tenancy gate, 2026-09-01, MEASURED). `frameworks` carries
-- two CHECKs that look like they make library membership immutable:
--
--   frameworks_shared_has_no_owner   visibility='shared'  => both ids NULL
--   frameworks_private_has_owner     visibility='private' => both ids NOT NULL
--
-- Each half of the move is refused by one of them, and this was measured in
-- both directions. The WHOLE move is not:
--
--   UPDATE frameworks
--   SET visibility='shared', owner_profile_id=NULL, workspace_id=NULL
--   WHERE id = <a creator's private framework>;              -- ACCEPTED
--
-- That statement turns one creator's private framework into SHARED LIBRARY
-- CONTENT, which `sharedFrameworkLibrary` serves to every workspace with no
-- scope predicate at all (correctly — a shared row belongs to nobody). It is
-- creator data crossing into the library, which is exactly the sentence
-- `creator-data-registry.ts` offered the CHECK as evidence for. The CHECK is
-- true of the move it names and was not true of the property it was cited for.
--
-- WHY A TRIGGER AND NOT ANOTHER CHECK, and why this file exists at all: a
-- CHECK cannot see the previous value of a row, so "this column may not
-- CHANGE" is not expressible as one. The only other thing keeping these
-- columns still is that no writer in `packages/db/src/frameworks.ts` sets them
-- after insert — which `tests/table-writers.test.ts` does police, but that is
-- a scan over our own source, not a property of the database. The
-- `generations_parent_id_immutable` trigger in 0022 says the same sentence
-- about the same threat model, and the column left unguarded was the one whose
-- flip is CROSS-TENANT.
--
-- THE GUARD IS THE OWNERSHIP TRIPLE, NOT `visibility` ALONE. Handing a private
-- framework to another creator profile —
-- `UPDATE frameworks SET owner_profile_id = <someone else>` — is the same
-- threat in a different spelling, and the composite FK does not forbid it: the
-- target only has to be a real (profile, workspace) pair. Guarding the field
-- that was named and leaving its two siblings open is the defect class this
-- repo has paid for six times (CLAUDE.md 2026-07-30).
--
-- NARROW ON PURPOSE, exactly as 0022's is. It refuses only a CHANGE to those
-- three columns. `curator_status`, `retired_at`, `saturation`, `superseded_at`,
-- the content columns and the timestamps are all still writable, so
-- `editPrivateFramework`'s supersede, `approvePrivateFramework`,
-- `retirePrivateFramework` and any future deletion/pseudonymisation executor
-- (R-54) keep working — a control that becomes an outage is the 2026-07-30
-- lesson, and 0022 was written narrow for that exact reason.
--
-- `IS DISTINCT FROM` rather than `<>`, and here it is load-bearing rather than
-- careful: two of the three columns are NULL on every shared row, so `<>`
-- would evaluate to NULL and the trigger would pass the very move it exists to
-- refuse.
--
-- WHAT IT DOES NOT COVER, SAID HERE RATHER THAN LEFT TO BE FOUND (2026-09-02).
-- `BEFORE UPDATE` sees no INSERT, so
--
--   INSERT INTO frameworks (...) SELECT ... FROM frameworks WHERE id = <private>
--
-- COPIES a creator's private framework into a new shared row and this trigger
-- never fires — MEASURED, and asserted as a recorded non-coverage in
-- `packages/db/tests/frameworks.test.ts` so the admission cannot rot into a
-- comment nobody checked. What stops it is the WRITER ENUMERATION —
-- `frameworks.ts` is the only file that inserts into this table (policed by
-- `tests/table-writers.test.ts`) and of its three inserts only
-- `seedSharedFrameworks` writes `visibility = 'shared'` — plus REQ-D02's
-- curator, which is a scan over
-- our own source and a person — exactly what this file's third paragraph says
-- is not a property of the database. It is a DIFFERENT threat from the one
-- above: an UPDATE re-labels the creator's own row, which their export and
-- their deletion still reach; a COPY makes a second row that their deletion
-- does not. A BEFORE INSERT guard cannot tell that copy from the seed's own
-- inserts at the row level, so the honest control stays where it is.
CREATE OR REPLACE FUNCTION frameworks_refuse_ownership_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.owner_profile_id IS DISTINCT FROM OLD.owner_profile_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'frameworks.visibility, owner_profile_id and workspace_id are immutable after insert (slice 7, R5a/R5c, R-9): a private framework may not become shared library content, and library content may not acquire an owner. Versioning appends a row; it never re-parents one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER frameworks_ownership_immutable
BEFORE UPDATE ON "frameworks"
FOR EACH ROW EXECUTE FUNCTION frameworks_refuse_ownership_change();
