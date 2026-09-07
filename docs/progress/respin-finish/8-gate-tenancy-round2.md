# Slice 8 — Respin brain tenancy gate, round 2 (2026-09-03, after the fix pass)

Reviewer: `respin-tenancy-reviewer` (Full gates). Manifest: `8-review-manifest-round2.md` — all 140 hashes matched before and after. Saved verbatim by the orchestrator.

---

# Respin brain tenancy review — Slice 8 (Trends + Spin), round 2

**Readiness: Not yet → Almost · Grade: D → B · The viewer-write hole, the fail-open guard, the unasserted scope, the missing cross-profile attempt and the unexported `trend_sources` are all closed with witnesses I re-ran; what remains is one dishonest tick on the phase card and a handful of notes.**

Counts: **0 BLOCK · 1 CHANGE · 7 NOTE** (round 1: 1 / 5 / 4). All 140 files in the round-2 manifest hashed identically before and after this review; none missing, none moved.

## Movement (per round-1 finding)

| Round 1 | Status | Evidence re-run |
|---|---|---|
| BLOCK — viewer writes `tracked_niches` | **RESOLVED** | `trends-storage.ts:63-65` `assertMayTrack` reuses `ProfileRoleError`; called at `:540` and `:590`, immediately after `ProfileScope.mint` and before `hasOpenPause` and any row read. `trends-storage.test.ts:177-215` seeds a real viewer membership, drives BOTH writers, asserts `ProfileRoleError`, zero rows / row intact, viewer can still read, owner still tracks and untracks. `billing-errors.ts:440` maps the class to `profile_role`; copy names tracked niches. Docker-live: green. |
| CHANGE 2 — identity-column guard fails open | **RESOLVED** | `system-spend.test.ts:236-286`: per-name on drizzle property AND SQL column, `toEqual([])` per table; population derived from `NOT_CREATOR_DATA` and pinned as a five-entry list (includes `system_worker_health`); non-vacuity plants a single `workspaceId` and a renamed `owner: uuid("profile_id")`; V12 delete-profile witness `:526-578`. |
| CHANGE 3 — `spinReferenceForProfile` never asserts scope | **RESOLVED** | `trends-storage.ts:719` `assertScoped(profile)` first statement; forged-scope test with a Proxy db that throws on any access → `ScopeForgeryError`; scan `:243-270` is a derivation pinned to `PROFILE_SCOPE_TAKERS = ["spinReferenceForProfile"]`, so a NEW taker fails equality; planted `leaky` seen. |
| CHANGE 4 — no cross-profile attempt | **RESOLVED** | `trends-storage.test.ts:273-391`: two profiles each with private source→item→transcript→autopsy→niche plus a shared trio; feed, projection, spin reference (both directions), reusable autopsy, untrack all witnessed; the mis-parented witness makes the item predicate's own pair observable. |
| CHANGE 5 — `trend_sources` unexported | **RESOLVED** | Registry `:309-332`; `PROFILE_EXPORT_TABLES`; `exportPage` case under `both()`; `EXPORT_ROW_OWNER`; `CHILD_BRANCHES`; `export.test.ts:753-759,858-873` submitted URL present, sibling's absent; `brain-schema.test.ts:516-556` ownerless youtube row survives the cascade. |
| CHANGE 6 — no `ReferenceIntakePort` implementer | **UNRESOLVED by owner decision** — honestly recorded at card `:10`, `:81`, `:162`. One residual contradiction: CHANGE 1 below. |
| NOTE 1 — worker lint does not deny `drizzle-orm` | UNRESOLVED — stays a NOTE (worker imports none). |
| NOTE 2 — reversible source-item encoding in proposed frameworks | UNRESOLVED — stays a NOTE for 10b-1. |
| NOTE 3 — private-path writers unreachable | RESOLVED as a record — card `:10`. |
| NOTE 4 — no REQ ids in the storage files | RESOLVED — `trends-storage.ts:5-23`, `trends-schema.ts:1-3`. |

## Findings

- **[CHANGE]** `docs/plans/respin-finish-phase-8.md:129` — Task 5 still reads `[x] The submitted-link adapter through slice 4's reference intake (R4)`, while `:81` says nothing implements `intakeReferenceTranscript`, `:162` un-ticks the verification, and `:10` says no paste-transcript form exists. Related: `:3` still reports `141 files / 3185 tests`, not the final tree's 143 / 3280. · Fix: un-tick task 5 with R4's annotation (or split port `[x]` / production adapter `[ ]`), refresh `:3`.
- **[NOTE]** `trends-schema.ts:181-198,215-236` — no composite FK `(trend_item_id, profile_id, workspace_id) → trend_items`; the mis-parented shape is representable at the DB grain; no production writer produces it. Class fix is a migration, not this slice.
- **[NOTE]** `trends-storage.test.ts:178,190,213` — the "editor still succeeds" half is witnessed by the owner seat only; seat an `editor` too.
- **[NOTE]** `trends-storage.ts:706-708` — docblock says every other export takes a `WorkspaceScope` and mints; five shared/system exports do not. Rewrite to the property the scan pins (every `ProfileScope`-taker asserts first).
- **[NOTE]** `credits/src/app-server.ts:494-502` — `trackedNicheEntitlementFor` reads tier + document outside the writer's locked transaction: a pricing race, not a leak; billing's call.
- **[NOTE]** `tests/import-boundary.test.ts:1195` — the worker allow-side fixture does not list the two new allowlist names; the deny side is intact; lint 0 on the real worker.
- **[NOTE]** (carried) worker not denied `drizzle-orm`/`pg`. **[NOTE]** (carried) `frameworks.ts:1093-1094,1415,1471` reversible source-item reference for 10b-1.

## Checks run
1 T1 holds (single helper, pinned `ProfileScope` population, cross-profile attempts exist) · 2 T2 holds (second authority deleted; `CURATION_PROPOSAL_FILES` exact-path list + AST positive test + doctored-copy non-vacuity; no seed) · 3 n/a with evidence (no brain write; the AST scan sees `brainDocs` as a target) · 4 n/a · 5 T4 holds (six trends tables exported, two-profile export, cascade with youtube survival) · 6 T5 holds (viewer refused at both writers and at spin; entitlement from the config document; `app/**` names no number) · 7 T6 holds (`requiredEnv`, `withheldState` carries rule + static remedy, worker holds no `drizzle-orm`) · 8 provenance holds, one comment overstatement (NOTE 3).

## Coverage
- read fully: `trends-storage.ts`, `trends-storage.test.ts`, `autopsy-policy.ts`, `worker/env.ts`, `actions.ts`, round-1 report, round-2 manifest, ledger 1803-1814, decisions R-95/closure/R-87 amendment, card `:3,:10,:81-113,:120-168`. Skimmed targeted regions of the registry, `with-workspace.ts`, the five DB test files, `mode-access.ts`, `credits/app-server.ts`, `feedback-readers.test.ts`, `eslint.config.mjs`, `import-boundary.test.ts`, `billing-errors.ts`, `trends-schema.ts`, `schema.ts`, `worker/main.ts`.
- commands: SHA-256 over all 140 rows before/after → no mismatch. Docker-live `trends-storage, export, profile-scope, brain-schema, system-spend, autopsy-policy` → **6 files / 108 passed**. `trends-actions, trends-page, profile-cage, table-writers, import-boundary, feedback-readers, mode-access, isolation, worker/tests/env` → **9 files / 275 passed**. Greps as listed.
- hunted for and did not find: a second `ProfileScope`-taking export outside the pinned list; a role gate after a row read; a `profiles[0]` or client-supplied cap; a config/tier read keyed on anything but the verified `workspaceId`; a youtube `trend_sources` row in any export; a brain write; a `Db`-taking symbol added to the worker allowlist; a re-created `framework-proposal.ts`; transcript text in any new log line.

## Verdict
NEEDS CHANGES
Every round-1 BLOCK and CHANGE in the fix pass's scope is closed with a witness re-run green; the one remaining change is a ticked deliverable the card's own verification section contradicts.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
