# Respin brain tenancy — slice 8c, round 1 (Full gate)

**Reviewer:** `respin-tenancy-reviewer` · **Verdict: NEEDS CHANGES** · Readiness **Almost · B** · 0 BLOCK · 2 CHANGE · 4 NOTE

*Filed by the orchestrator: the reviewer is read-only and was told not to edit any file, so it returned the report as its result. The text below is the reviewer's, verbatim except for this header.*

> The isolation, scoping, role, export and deletion work is genuinely sound and I could not break it by running at it — but the compensating credit R-98 introduces is reachable only through a narrower population than R9 states, and the one designed-in leak path (creator content → shared library) gained its first creator-initiated producer in this slice without a decision entry or a test.

**Scope**: the 64 slice-8c files in [`8c-review-manifest.md`](8c-review-manifest.md), read on the MAIN TREE (no worktree). The 102 slice-8 context files were consulted, not reviewed. **Hash protocol**: pre-review 166/166 match; post-review 166/166 match. Result stands.

---

## Findings

### CHANGE 1 — `respin/packages/credits/src/pasted-reference.ts:349` — the refund's population is "the newest claim per item", not "the profile's parked claims"

**Verified by running it**, not by reading.

R9 and the module's own docblock say: *"for each of the profile's `parked` claims with an `autopsy_claim` debit and no `autopsy_refund` credit, append ONE compensating credit."* The code is:

```ts
const parked = (await pastedReferencesForProfile(tx, scope, profileId)).filter(
  (row) => row.claim?.status === "parked"
);
```

`pastedReferencesForProfile` → `projectPastedReference` (`respin/packages/db/src/trends-storage.ts:1272`) reads **one** claim per item:

```ts
.orderBy(desc(autopsyCacheClaims.createdAt), desc(autopsyCacheClaims.id)).limit(1)
```

So the settlement's population is "parked ∩ newest-per-item", which is strictly narrower than "parked".

**Failure scenario, driven on PGlite.** Paste → claim `C1` parks (5 attempts, R-93). `AUTOPSY_ANALYSIS_VERSION` is bumped — which is exactly what `trends-storage.ts:946`'s docblock plans for ("Bump it when that contract changes") and what `submitPastedReference`'s own `replayed` docblock anticipates ("The intake can return existing source/item/transcript rows and still mint a FRESH claim (a completed claim at a superseded analysis version)"). A re-paste mints `C2`. From that instant:

```
reader claim seen: [{"status":"pending", …, "claimId":"…fa5c…"}]      # C2 only
settled = {"refundedClaimIds":[],"creditsReturned":0}   balance 196 -> 196
ledger  = [grant +200, debit autopsy_claim C1 -4]        # the -4 is never returned
```

`C1`'s refund becomes **permanently unreachable** — `settleParkedAutopsies` is idempotent, so no later load recovers it — and `/trends` renders the item as **"Queued for autopsy"** (`app/(product)/trends/page.tsx:193`) rather than "Could not be completed — N credits returned". The creator is silently down `creditCosts.autopsy` with no surface that says so.

This is the repo's 2026-08-29 lesson in its exact shape: a population written as one path, narrowing silently the day a second path appears. It is also the card's own least-confident line ("the refund must be idempotent by claim id, creator-scoped, and impossible to reach twice") answered from the wrong side — it is impossible to reach *twice*, and in this case impossible to reach *once*.

Latency, stated honestly: today `AUTOPSY_ANALYSIS_VERSION` is the fixed literal `"v1"` and the claim identity index is `(digest, version, rights_scope, cache_scope_key)`, so within one profile only a version bump produces a second claim on one item. The defect is **latent, not live** — which is why it is CHANGE and not BLOCK.

**Fix**: settle from a claims query, not from the display projection — read `autopsyCacheClaims` under the minted pair with `rightsScope='profile_private'` and `status='parked'` directly (the same pair predicate `projectPastedReference` already uses, so the scoping property is unchanged), or have the reader return every claim per item and settle over all of them. Then delete or amend the docblock sentence "read through stage A's owner-only `pastedReferencesForProfile`" so the comment describes the population it actually has.

### CHANGE 2 — `respin/packages/db/src/system-spend.ts:1170` — a creator's private paste now feeds the shared framework library, and no 8c decision, registry entry or test records it

**Verified by running it.**

`finalizeAttempt` calls `resolveAutopsyFramework(tx, { trendItemId: cacheClaim.trendItemId, analysis: normalized })` with **no `rightsScope` branch**, for every completed autopsy. Before 8c every autopsied item was `shared_analysis` and ownerless. 8c makes profile-private, creator-paid, creator-initiated autopsies the first production producer — so the T2 boundary (the product's one designed-in leak path) now has a creator-initiated producer.

Driven directly:

```
resolution kind: proposed  created: true
row: { visibility:"shared", curatorStatus:"proposed",
       ownerProfileId:null, workspaceId:null,
       sourceReferences:[{kind:"trend_item", ref:"trend-item-alpha-abkagh…"}], … }
sharedFrameworkLibrary returns the proposed row? false
```

**What is fine, and I checked each**: the content passes `assertMechanismLevel` inside `prepareContent` (no personal details, numbers or performance data); the row's ownership pair is NULL by CHECK; `sharedFrameworkLibrary` does not serve `proposed` rows; R-94 explicitly sanctions "every canonical mechanism emitted by a completed autopsy" entering proposed-only curation, human-approved only. Nothing T2 forbids actually crosses. That is why this is CHANGE, not BLOCK.

**What is not fine**: `grep` finds **no test anywhere** tying a `profile_private` claim to a shared-library proposal (`packages/db/tests/frameworks.test.ts`, `packages/db/tests/system-spend.test.ts`, `worker/tests/autopsy.test.ts` — none). R-96 describes the paste end to end and never mentions it; R-97 and R-98 do not either; `creator-data-registry.ts`'s new `autopsies` entry says the private autopsy "belongs beside the transcript in their export" and is silent about the row it also proposes into the shared library. T2 says the stripping "is a tested transformation, not a review-time promise" — for this producer it is currently a promise.

**Fix**: add a witness that a `profile_private` claim's finalize produces a `shared`/`proposed` framework carrying no owner column and mechanism-level content only (planted-personal-detail mutation reddens it), and record the flow in one sentence on R-96 (or a short R-99) and in the `autopsies` registry entry, so a reader of the paste's decisions learns that a creator-initiated autopsy proposes shared-library content.

### NOTE 3 — `respin/packages/modes/src/assemble.ts:56` — the comment names the wrong module

"the part that has already passed **`@respin/trends`'** `assertMechanismLevel`". `assertMechanismLevel` lives in `@respin/db` (`packages/db/src/frameworks.ts:1205`); `packages/trends/` contains no such symbol. The property the comment asserts is true (I traced it through `worker/system-autopsy.ts:423` → `assertAutopsyFrameworkCandidate` → `prepareContent` → `assertMechanismLevel`); only the attribution is wrong. Read, not run.

### NOTE 4 — `respin/packages/db/src/frameworks.ts:1504` — "contains no creator identity" is weaker after 8c than when written

`frameworkTrendItemRef` encodes the `trend_items.id` reversibly onto an ownerless shared row. When written, every autopsied item was `shared_analysis`. After 8c that id can name a **profile-private** row — a join key into one creator's record, sitting on a row a curator may approve into the library every tenant reads. Not exploitable from a tenant (the id resolves to nothing without DB access, and every read of `trend_items` is pair-predicated — I drove the cross-profile and cross-workspace cases below), and not one of T2's five forbidden categories. Medium confidence that this is worth acting on; low confidence that it is harmful. If kept, the comment should say "no creator identity **column**; the ref is an opaque encoding of a row that may be profile-private."

### NOTE 5 — `settleParkedAutopsies` being viewer-allowed is sound; here is why I say so rather than assume it

Judged against T5. A viewer triggering a `credit_ledger` write on page load is unusual and the docblock flags it. It holds because: (a) the mint still cages the profile to the scope (`ProfileAccessError` on a foreign profile — driven); (b) the candidate set is the profile's own parked claims only; (c) the amount is the **original debit's**, not today's price, so nothing is minted; (d) `refundCredits`' over-refund guard plus `credit_ledger_autopsy_refund_uq` make it once-per-claim; (e) the credit lands in the workspace, not with the viewer, and a viewer still cannot spend it. No REQ-A02 boundary is crossed. Witnessed at `packages/credits/tests/pasted-reference.test.ts:523`.

### NOTE 6 — `respin/.tmp/` is neither gitignored nor eslint-ignored; the tree's lint was red during the round

`pnpm lint` on this tree exits 1 with 14 errors, **all in `respin/.tmp/rev/probe.test.ts`** — a scratch file another agent dropped during my review (I also watched `packages/credits/src/__rev_mut1..4.ts` and `packages/credits/tests/__rev_probe.test.ts` appear at 21:14–21:16 and be cleaned up; while they existed `packages/credits/tests/isolation.test.ts` was red on "every SOURCE module is enumerated"). None of this is 8c's code. But `.tmp/` shows as untracked rather than ignored, so `git add -A` would commit it and turn CI red, and the entry gate's "lint 0" is not reproducible on the tree as it stands. Worth adding `respin/.tmp/` to `.gitignore` and the eslint ignores. **Also**: the manifest protocol assumes a quiet tree; a concurrent agent was writing into `packages/credits/src/` during a Full gate. That is a process risk to raise with whoever schedules the rounds.

---

## Checks run

- **T1 — single scoping helper.** Holds. Every new entry point mints first: `submitPastedReference` (`pasted-reference.ts:235`), `settleParkedAutopsies` (`:343`), `intakePastedReference` (`trends-storage.ts:1072`), `pastedReferencesForProfile` (`:1221`), `pastedReferenceForProfile` (`:1245`); helpers below them take the minted **pair**, never a scope. `respinDb.intakePastedReference` was **deliberately deleted** (`packages/db/src/app-server.ts`, the "no bind here" block) so no screen can paste unmetered. AC-13 completeness (`tests/profile-cage.test.ts:1242+`) enumerates all five plus both facade binds. Driven: `pastedReferencesForProfile`, `submitPastedReference`, `settleParkedAutopsies`, `intakePastedReference` all raise `ProfileAccessError` on a **cross-workspace** profile id; `pastedReferenceForProfile` refuses a sibling workspace's claim id; W1's settlement leaves W2's parked claim untouched and writes no row into W2. Cross-*profile* is witnessed in-repo at `packages/db/tests/pasted-reference.test.ts:337` and `packages/credits/tests/pasted-reference.test.ts:405,481`.
- **T2 — mechanism-level stripping.** See CHANGE 2 and NOTE 4. The stripping itself is real and runs before persistence; its creator-initiated producer is unwitnessed and undocumented. R-97's prompt half is clean: `generate.ts:728` field-lists the four mechanism fields (no spread), `assertReferenceMechanism` (`assemble.ts:681+`) refuses `hook`/`subjectTerms`/`structure` by name before the vendor, and the gate's fields stay on `spinSimilarity` (`generate.ts:820`). R-9 seeding: n/a, no seeding code in this diff.
- **T3 — append-only brains / no silent mutation / no fine-tuning.** n/a-clean. This diff writes no `brain_docs`; `grep` finds no brain mutation and no fine-tuning path in the 64 files.
- **T3/REQ-B02 — sensitive inference.** n/a. The paste stores creator-supplied text as a `reference`-class input and infers nothing about the creator; `appendReferencePost` keeps it out of the voice corpus (R-3).
- **T4 — export and deletion.** Holds. Six trend tables joined `PROFILE_EXPORT_TABLES` and `exportPage` with `both(table)` (`with-workspace.ts:319,1387`), each with a `CREATOR_DATA_REGISTRY` entry naming its export reason and cascade. `exportPage` selects whole rows, so `referenceInputId` rides (witnessed, `packages/db/tests/export.test.ts:881`). Cascade witnessed at `packages/db/tests/brain-schema.test.ts:576` ("deleting the REFERENCE ONBOARDING INPUT cascades its transcript away"), and the delete suite's population is *derived from the registry* rather than hand-listed (`:498`). No new table lacks either flow.
- **T5 — roles and admin.** Holds. Viewer refused at **two independent layers**, each with its own witness: `submitPastedReference` (`ProfileRoleError`, `packages/credits/tests/pasted-reference.test.ts:293`) and `intakePastedReference` (`assertMayTrack`, `packages/db/tests/pasted-reference.test.ts:246`). Editor and owner both paste. This is *not* slice 8's round-1 class (role carried and never read) — the role is read at both sites. No admin surface touched; no reason-code path touched.
- **T6 — PII and secrets.** Holds. `paste-panel.tsx` is `"use client"` and imports no server module (the fix landed; `tests/client-bundle-boundary.test.ts` green). The refusal `copy` that now crosses the wire is a static entry from `BILLING_ERROR_COPY` keyed by a code `logRefusal` returns from `billingErrorCode` (always a valid key) — **no error message and no refused value rides along**; the only other travelling value is `field`, clamped to the four-name closed set by `pasteRefusedField` (`paste-state.ts:23`). `logSpend`/`logRefusal` carry ids and numbers only (`safe-log.ts`'s no-message rule). No LLM key client-side.
- **Requirement provenance.** Holds. Every new behaviour cites REQ or R ids; R-96/R-97/R-98 are recorded in `decisions.md` before the code. The one gap is CHANGE 2 (a behaviour with no id).
- **R2/R7 (FK).** Verified **against live Postgres**, not against the header: `trend_transcripts_reference_input_id_onboarding_inputs_id_fk … ON DELETE CASCADE`; `trend_transcripts_reference_input_uq` UNIQUE on the column; and the CHECK really is `NOT ((provenance ->> 'kind') IS DISTINCT FROM 'creator_paste') = (reference_input_id IS NOT NULL)` — the `IS NOT DISTINCT FROM` the header claims, present for the reason it claims. Registry entry names both cascades.
- **Migration 0026.** Header claims check out against the SQL and against `pg_constraint`. `trend_items_baseline_state_shape` ties `unavailable` to `rights_scope='profile_private'` and eight NULLs; the two re-added CHECKs are `baseline_state='unavailable' OR (<previous predicate verbatim>)`. `db:check` clean.
- **Migration 0027.** Honest, and **global scope is correct here**. Proven by name on real Postgres inside a rolled-back transaction: a second `autopsy_refund` for one claim → `duplicate key … credit_ledger_autopsy_refund_uq`; a NULL `ref_id` → `violates check constraint "credit_ledger_autopsy_ref"`. On PGlite the same for `autopsy_claim`, plus a *different* workspace writing a debit for the same claim id is refused. Global (not workspace-keyed) is right: `ref_id` is an `autopsy_cache_claims.id` (uuidv7, one workspace), so the global index is strictly stronger, and the only theoretical cost — workspace A pre-empting B's claim id — needs an unguessable uuid and a code path that lets A name B's claim, neither of which exists (`submitPastedReference` derives `claimId` from the pair-scoped intake).
- **No leakage into the shared surface.** Holds. `feedItemsForProfile` (`trends-storage.ts:779`) carries `eq(trendItems.baselineState, "measured")` with M7 named in the comment, so an `unavailable` pasted item cannot enter the ranked feed. The worker sees only `{cacheClaimId, itemId, attemptNumber}` (`system-spend.ts:67`); the private-claim finalize is witnessed with owner absent from `system_model_usage` (`packages/db/tests/system-spend.test.ts:739`), and the per-name identity-column scan over the five system tables (`:279`) is structural with a planted-mutation non-vacuity case (`:293`).
- **`with-workspace.ts` / `app-server.ts` / `index.ts` / `eslint.config.mjs`.** No app capability widened. The only new `app/**` name is the inert `PASTED_REFERENCE_TITLE_MAX`; `normaliseContent` was exported for one in-package reader; the `systemWorkerSurface` widening is `worker/**` only (slice 8) and does **not** include `intakePastedReference`. `app/**` still cannot obtain a DB handle, so the package-index export of `intakePastedReference` is unreachable from a route.
- **`trends-actions.test.ts` `importOriginal`.** Not vacuous. `billing-errors.ts` is *not* mocked, and the test's `refused()` helper reads the real `BILLING_ERROR_COPY[code]`, so it asserts the action resolved the right entry rather than pinning a retyped sentence. The partial mocks keep the real error classes, which `billingErrorCode`'s `instanceof` matching needs. (One residual: `logRefusal` is stubbed, so no test in this file proves the real `logRefusal` returns a key the copy map answers for — it does, by construction, since it returns `billingErrorCode`.)

## Coverage

- **Read fully**: `packages/credits/src/pasted-reference.ts`; `packages/db/migrations/0026_lazy_vector.sql`, `0027_curious_paper_doll.sql`; `app/(product)/trends/{actions.ts,page.tsx,paste-state.ts}`; `trends-storage.ts:363-470, 555-700, 765-1302`; `app/(product)/safe-log.ts`; `frameworks.ts:1490-1700`.
- **Read as diffs vs `cc3ed43`**: `with-workspace.ts`, `creator-data-registry.ts`, `export.ts`, `packages/db/src/{index,app-server}.ts`, `packages/credits/src/{index,app-server}.ts`, `billing-errors.ts`, `eslint.config.mjs`, `tests/profile-cage.test.ts`.
- **Skimmed**: `paste-panel.tsx`, `pasted-references.tsx`, `packages/modes/src/assemble.ts`, `packages/credits/src/generate.ts`, `worker/system-autopsy.ts`, `packages/db/src/system-spend.ts`, the four `pasted-reference` test files.
- **Not reached**: `packages/modes/src/{bundle,traceability,pipeline}.ts` and their tests (read only by grep — the compliance gate owns the prompt); `packages/trends/src/sources.ts`; `trends-view.tsx`; `pnpm-lock.yaml`; `migrations/meta/*.json`; the seven changed docs/plan files beyond R-96/97/98 and the 8c card.
- **Commands run**: SHA-256 verification of all 166 manifest files, before and after (166/166, both). `vitest run` on `packages/{credits,db}/tests/pasted-reference*`, `export`, `brain-schema`, `migration-shape`, `profile-cage` → **178 passed**. `vitest run` on `client-bundle-boundary`, `import-boundary`, `table-writers`, `trends-actions`, `trends-page`, `billing-ui`, `profile-scope`, `isolation`, `spin-reference` → 353 passed, 1 failed (`isolation.test.ts`, caused by another agent's `__rev_mut*.ts`, since removed). `pnpm db:check` → *Everything's fine*. `pnpm lint` → exit 1, 14 errors, **all** in `.tmp/rev/probe.test.ts`. Four `tsx` probes against PGlite (cross-workspace matrix; superseded-claim settlement; 0027 constraints) and one rolled-back `psql` transaction against the live `respin-postgres` container (0027 constraint names; `pg_constraint`/`pg_indexes` inspection).

## Verdict

**NEEDS CHANGES**

The isolation work is genuinely strong — I attacked the cross-workspace axis the in-repo tests do not cover and every entry point refused — but R-98's compensating credit settles over a narrower population than R9 states (proven by running it), and 8c's first creator-initiated feed into the shared framework library has neither a decision entry nor a test.

**Least-confident line:** my judgement on CHANGE 2's severity. I proved the private→shared-proposal flow runs and that nothing T2 forbids crosses it, but I did not drive the full worker path end to end on a real private claim (I called `resolveAutopsyFramework` directly), so I have not measured whether a real pasted-reference autopsy's four fields survive `assertMechanismLevel` in practice as reliably as a fixture does — if they routinely fail it, the parked/refund path in CHANGE 1 becomes the common case rather than the rare one, and the two findings compound.
