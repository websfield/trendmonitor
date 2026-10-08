# L4 gate — `respin-tenancy-reviewer` (brain tenancy, full) (2026-10-04)

Frozen manifest `L4-gate.sha256` digest `4bceef9ce49a`: 40/40 OK before and after.

The reviewer ran `TEST_DATABASE_URL=… vitest run` on nine files: `saved-generation`, `creative-work`, `isolation`, `profile-cage`, `profile-scope`, `gate-completeness`, `table-writers`, `pause-authority` and `saved-pack-action.docker`. Result: 9 files passed, 304 tests, none skipped. Nothing was edited or planted.

**Verdict: NEEDS CHANGES · Almost · B.** 0 BLOCK, 0 High, 1 Medium, 3 Low, 3 Notes. No tenancy leak was found.

## Findings

- **Medium:** `tests/pause-authority.test.tsx:197-203`. The new page is missing from `PAUSE_COURTESY_PAGES` (Respin rule 7).
  - The page decides a pause courtesy (`saved/[attemptId]/page.tsx:106-118`).
  - A later switch to the `billing.state` mirror would offer paused creators the select and revise presses, and every test would stay green.
  - The server still refuses those presses, so the harm is misleading copy, not a leak.
  - Fix: add `"(product)/studio/saved/[attemptId]/page.tsx"` to the list.
- **Low:** `packages/credits/tests/isolation.test.ts:963`. The `INTERNAL_MODULES["saved-generation.ts"]` reason omits `getActiveConfig(db)` (`saved-generation.ts:333`). That is a global config read and leaks no tenant data. Fix: name it in the reason.
- **Low:** `saved-generation.test.ts:379-460`. Editor and viewer seats are not tested end to end on the saved path.
  - Failure scenario: dropping `"editor"` from `selectCreativePieceVersion`'s role list (`with-workspace.ts:5681`) leaves every test green.
  - Fix: add a membership-downgrade case asserting three things:
    - a viewer can still read the saved page;
    - a viewer's select and revise are refused with `ProfileRoleError`, with no claim and no debit;
    - an editor's select lands.
- **Low:** `app/(product)/studio/run-copy.ts:435`. `replayChargeSentence`'s docstring was moved above `savedPackHref`. Fix: move it back.
- **Note:** `creative-work-ops.ts:404`. `depth <= SAVED_LINEAGE_DEPTH_MAX` allows 65 reads against the stated 64. This is a work bound only; every step is scoped.
- **Note:** `saved-generation.ts:340`. `getWorkspaceBillingState` runs outside the guarded transaction. It returns only the caller's own tier, so nothing leaks.
- **Note:** `creative-work-ops.ts:427-435`. `pieceVersionsInScope` does not filter children by mode. Only a raw-inserted row reaches this, and the effect is intra-profile and display-only.

## Checks

- **T1, single scoping helper: holds.**
  - The page and actions go `requireUser` → `scopeForUser` → the facade. There is no `@respin/modes` import.
  - `saved-generation.ts` mints the scope first. Every db touch after that is a caged accessor or capability, scoped by `both()`, behind the lifecycle guard.
  - New db readers carry both scope columns on every statement.
  - The parent walk is scoped at each step. The FK `generations_parent_fk` is composite (`0022_foamy_doctor_octopus.sql:20`), and the chain is acyclic.
  - The origin piece id is server-derived.
  - A crafted foreign `attemptId` resolves to `missing`, and a foreign select or revise to `not_found` / `not_this_creators`. Both directions are witnessed.
  - Inventories: `gate-completeness`, `profile-cage` AC-13 (17 entries), `profile-scope`, `table-writers`, `WRITE_PAUSE_POLICY` and the capability records are all updated. The one exception is `PAUSE_COURTESY_PAGES`.
- **T2, T3, sensitive inference and T4:** not applicable or holding. There is no new table or migration. The export is browser-local, using the clipboard and a Blob, and makes no request.
- **T5, roles: holds.** Selection is gated twice. Revision goes through `generate`'s owner/editor claim. Reads are open to all roles. Pause refuses selection but never a read. Viewers do not see the presses.
- **T6, PII: holds.** Logs are redacted, and the preset is clamped.
- **Provenance: holds,** except the `isolation.test.ts:963` reason.
