# Codebase review — respin-m2 (The Brain: Onboarding and Profile)

**Brief:** [`docs/plans/respin-m2-brief.md`](../plans/respin-m2-brief.md) — Chosen scope: **Full M2 including library seeding**.
**Written:** 2026-08-19. **Entry-gate baseline at time of writing:** typecheck PASS · lint PASS · `db:check` PASS · **541/541 tests, 26 files** with both Docker concurrency suites live PASS.

## 1. Requirement IDs satisfied

| ID | Requirement | Phase |
|---|---|---|
| REQ-A01 | One creator profile on Free/Creator/Pro, up to five on Studio | 1, 5 |
| REQ-A03 | Profiles strictly isolated; no data crosses profiles or workspaces | 1 (binds all) |
| REQ-A04 | Brain export as JSON/markdown (export half only; deletion is M6) | 3, 6 |
| REQ-B01 | Guided onboarding builds a draft brain in <20 min from interview + 5-10 own posts + optional 2-3 references | 2, 5 |
| REQ-B02 | Every inferred field shows source evidence + confidence; creator confirms/edits before activation; no silent sensitive inference | 3, 5 |
| REQ-B03 | North-star metric declared at onboarding, changeable later | 3, 5 |
| REQ-D01 | Frameworks are versioned records (name, beats, why-it-converts, applicability, confidence, saturation, visibility) | 4 |
| REQ-D02 | A named curator approves a framework before it is recommendable | 4 |
| REQ-D04 | Library contributions are mechanism-level only | 4 |
| REQ-C05 | Brain edits create durable versions, approval-gated, nothing silent (the *versioning* half; feedback capture is M3) | 3, 6 |
| REQ-I03 | No invented specifics — `[check]` placeholders | 2, 5 |
| REQ-J02 | `prompt_bundle_version` recorded on every model call | 2 |

**Non-goals** carried from the brief: REQ-B04 (first three ideas, needs M3), REQ-A02 (seats, M6), REQ-A04's deletion half (M6), REQ-D05 (private frameworks, schema-only), M3's modes/streaming, M5's promotion proposals.

## 2. Roadmap position and proof-of-shipped dependencies

| Dependency | Proof it shipped |
|---|---|
| M0 skeleton, Better Auth, Postgres+Drizzle, CI | `docs/progress/respin-m0/ledger.md`; `.github/workflows/respin.yml`; `respin/packages/auth/src/create-auth.ts` |
| M1 billing + credit ledger (metering before generation) | `docs/progress/respin-m1-review.md` (Ready, A/A); `docs/progress/respin-m1/ledger.md`; `respin/packages/credits/src/ledger.ts:335` (`debitCredits`) |
| Workspace tenancy cage | `respin/packages/db/src/with-workspace.ts`; `respin/packages/db/tests/with-workspace.test.ts` (AC-7 completeness assertion); `respin/tests/import-boundary.test.ts` |
| Audit remediation R0-R4 closed | `docs/progress/audit/closure-2026-08-17.md`; `docs/progress/audit/remediation-ledger.md` |
| Versioned runtime config | `respin/packages/config/src/schema.ts` (`respinConfigV1`, `.strict()`); `respin/packages/db/src/seed.ts` (`CONFIG_V1_SEED`) |
| **The M2 profile-cage design** (audit #23 / R-25 R0) | `docs/plans/respin-m2-profile-cage-design.md` — **a stop condition, and it is discharged** |
| **PRD Open Decision 3 (Vivian asset boundary)** | **R-29, `docs/initial/decisions.md`, owner-confirmed 2026-08-19** — the build-plan's precondition on library seeding, discharged |

**Not shipped, and M2 does not need it:** no job runner (D-M1-4; the decision lands at M4 entry), no deploy surface, no `packages/modes`.

## 3. Modules touched and entity ownership

| New entity | Owning module | Notes |
|---|---|---|
| `creator_profiles` | `packages/db` (schema) | Nested under `workspaces`; carries `workspace_id` FK |
| `brain_docs` | `packages/db` (schema), `packages/brain` (behaviour) | Append-only versions; carries **both** `profile_id` and `workspace_id` (cage rule 3) |
| `frameworks` | `packages/db` (schema), `packages/brain` (seed + curation) | `visibility`, `owner_profile_id` nullable, `curator_status` |
| `VerifiedProfileId` / `ProfileScope` | `packages/db/src/with-workspace.ts` | Deliberately the **same file** as `VerifiedWorkspaceId`, per the design |
| `packages/llm` | new package | Anthropic behind an adapter (R-5); Zod at the boundary |
| `packages/brain` | new package | Brain doc versioning, provenance, export, library seed |

**Import direction is unchanged and non-negotiable:** `app/` imports `packages/`, never the reverse (`respin-package-imports-app` guardrail).

## 4. Cross-boundary reach

| This needs... | Reaches it via | Not via |
|---|---|---|
| The verified workspace | `WorkspaceScope` from `withWorkspace` | never a raw `workspaceId` string |
| The verified profile | **`scope.profile(id)` -> `ProfileScope`** (new) | never a bare `profileId` string |
| Credit debit for onboarding inference | `@respin/credits/app-server` facade | never `packages/credits` root from `app/**` |
| Runtime config (credit costs, tier caps) | `@respin/config/app-server` (reads) | never a constant in code (**B5**) |
| The model | `packages/llm` adapter | never the Anthropic SDK from `app/**` or `packages/brain` |
| The DB connection | `respinDb` (app) / `DbLike` (packages) | never `createDb` from `app/**` |

**No foreign-key reach is required across a forbidden boundary.** Every profile-grained table carries `workspace_id` as a real column with a real FK — the design's rule 3, which exists precisely so no accessor has to trust a transitive invariant.

## 5. Critical-Path triggers (drives the reviewer gate)

| Critical Path | Applies? | Why |
|---|---|---|
| **Respin brain tenancy** | **YES — primary** | `creator_profiles`, the cage, `brain_docs` versioning + provenance, onboarding inference, library contributions, export. This is the path M2 *is*. |
| **Respin billing & credits** | **YES** | Onboarding inference is the product's first real token spend; it debits (or is decided not to) through `packages/credits`, and `creditCosts.onboardingBrainBuild` is a live config key. |
| **Respin learning honesty** | **YES** | `packages/brain` is named in this path's trigger list, and M2 declares the **north-star metric** every later result is judged against. |
| **Respin spin compliance** | **YES (narrow)** | REQ-I03: an inferred brain field asserting an unverified specific about the creator is an invented specific. The `[check]` convention and no-guarantee language apply to inference output. |

Four Critical-Path reviewers plus the generalist. All five exist in `.claude/agents/`: `respin-tenancy-reviewer`, `respin-billing-reviewer`, `respin-learning-reviewer`, `respin-compliance-reviewer`, `plan-reviewer`. **Stop Condition 3 does not fire.**

## 6. Inherited stopgaps

Grep run over the flows M2 extends:

    grep -rn "TODO|FIXME|placeholder|demo|hardcod" respin/packages/*/src respin/app --include=*.ts --include=*.tsx -i

| Hit | Verdict |
|---|---|
| `respin/app/(admin)/admin/page.tsx:6` — "Placeholder — curation queue, sources, margin dashboard arrive in M6" | **Keep.** M6 owns it. M2 seeds `frameworks` with a `curator_status` the M6 queue will drive; M2 does **not** build the queue UI. |
| `respin/app/(marketing)/page.tsx:2` — landing placeholder, M6 | **Keep.** Out of M2 scope. |
| `respin/app/layout.tsx:5` — R-2 working name in one place | **Keep.** R-2 says exactly this; it is the decision, not a stopgap. |
| `respin/app/(auth)/auth-form.tsx:55,59` | **Not a stopgap** — these are the audit #15 comments explaining why placeholders were *removed*. |

Two **live, named** gaps M2 inherits and must not silently absorb:

1. **R-21 — Free tier has no credit-minting path until M3.** M2 interacts with it: `creditCosts.onboardingBrainBuild` is seeded **`0`**, so a zero-balance Free workspace *can* complete onboarding.

   **Corrected 2026-08-19 by the round-1 billing gate.** This section originally said the zero was "coherent by a config value nobody has decided in writing." **That was wrong.** `docs/initial/PRD.md:135` reads: *"onboarding brain build 0 **(included once per profile)**"* — the zero **was** decided in writing, and R-6 frames it as an indicative launch number tunable against the margin dashboard. Two consequences of the error, both now fixed in the plan:
   - The master plan cited `seed.ts:53` — **the value itself** — as the provenance for the value. `PRD.md:135` is the authority.
   - Because the plan never read `PRD.md:135`, it never inherited **"included once per profile"** — the clause that specifies the re-inference limit the plan had left with no value, no period, and no storage. That limit is the *only* brake on M2's token spend.

   So D-M2-2 is not "deciding an inherited value"; it is **re-affirming a PRD number and adding the compensating controls** — a durable `model_usage` record and the once-per-profile limit derived from it.
2. **Audit #18's baselined advisories** — 4 high (one on `drizzle-orm`, a direct dependency on the money path) + 3 moderate, in `respin/SECURITY-EXCEPTIONS.md`. **A deferral, not an acceptance.** M2 adds no dependency that changes this and must not extend the baseline; `pnpm audit --audit-level high --prod` gates CI and stays gating.

## 7. Exact file paths

> **Revised after the round-1 plan gate.** Phase 1 now lands the **complete** M2 schema in one migration. Round 1 created three tables and left two more to be improvised in later phases — the store for submitted posts and whatever holds token spend — both profile-grained and creator-derived, i.e. exactly the data the cage exists to protect, arriving in phases the cage's stop condition did not cover.

**New:**
- `respin/packages/db/src/brain-schema.ts` — `creator_profiles`, `brain_docs`, `frameworks`
- `respin/packages/db/src/onboarding-schema.ts` — **`onboarding_inputs`** (immutable; the corpus D-M2-4's substring check validates against) and **`model_usage`** (append-only; the only possible record of token spend, since `debitCredits` rejects a zero cost)
- `respin/packages/config/src/migrate-config.ts` — the D-M2-7b config data step
- `respin/packages/db/migrations/0011_*.sql` (+ meta snapshot)
- `respin/packages/llm/{package.json, src/{index.ts, adapter.ts, anthropic.ts, assemble.ts, app-server.ts}, tests/*}`
- `respin/packages/brain/{package.json, src/{index.ts, docs.ts, provenance.ts, export.ts, library-seed.ts, app-server.ts}, tests/*}`
- `respin/packages/brain/src/data/frameworks-f1-f9.json` — the R-29 seed corpus (reviewable as text)
- `respin/app/(product)/onboarding/**`, `respin/app/(product)/brain/**`
- `respin/tests/profile-cage.test.ts` — P1-P6 home (P5/P6 additionally land in the type and import-boundary suites)

**Modified:**
- `respin/packages/db/src/with-workspace.ts` — `VerifiedProfileId`, `ProfileScope`, `scope.profile()`
- `respin/packages/db/src/{schema.ts, index.ts, seed.ts}` — re-export, seed
- `respin/packages/db/tests/with-workspace.test.ts` — the profile half of the AC-7 completeness assertion
- `respin/tests/import-boundary.test.ts` — P6 (no `trustProfileId`-shaped export)
- `respin/eslint.config.mjs` — the `@respin/db` allowlist gains `VerifiedProfileId`/`ProfileScope` types; `@respin/llm` and `@respin/brain` get default-deny plus a sanctioned `app-server` facade, exactly as `@respin/credits` and `@respin/config` have
- `respin/packages/config/src/schema.ts` — per-tier profile caps (REQ-A01) as **config, not code** (B5)
- `respin/package.json`, `pnpm-workspace.yaml` — the two new packages

## 8. Existing patterns to replicate verbatim

| For | Replicate |
|---|---|
| The profile cage | `with-workspace.ts`'s `VerifiedWorkspaceId` brand and `withWorkspace`'s verify-then-scope mint |
| Accessor completeness | `respin/packages/db/tests/with-workspace.test.ts` — `breachValidators` + `accessorArgs` keyed by `keyof ...["accessors"]`, the both-sides loop, and the **non-vacuity** `rows.length > 0` assertion |
| A package facade | `respin/packages/credits/src/app-server.ts` plus the `@respin/credits/app-server` eslint grant |
| Package-private exports | the `internalOnly` registry + `FACADE_REEXPORTED` pattern in `respin/packages/credits/tests/isolation.test.ts` |
| Append-only plus derived state | `credit_ledger` / `deriveBalance` — **one authority**, never a second summing caller |
| Config-not-code thresholds | `respinConfigV1` `.strict()` plus the `CONFIG_V1_SEED` parity test |
| A source-scanning tripwire | `respin/tests/retention.test.ts` — proven red against a planted violation |

## 9. Risks

| # | Risk | Mitigation (phase) |
|---|---|---|
| R1 | **The cage gets retro-fitted.** Any brain route written before `VerifiedProfileId` exists needs re-auditing plus a migration (audit #23's own argument). | Phase 1 is a hard gate; P1-P6 demonstrated **red** against un-caged code before Phase 3+ starts. (P1) |
| R2 | **P4 is the test that matters and the easiest to fake.** Per-accessor composite scoping catches a re-parented/soft-deleted profile; a single `scope.profile()` test does not. | Programmatic accessor enumeration plus non-vacuity row counts, copied from the AC-7 pattern that already works. (P1) |
| R3 | **Provenance becomes theatre.** A paraphrased `source_evidence` and a self-reported confidence look like provenance and are not. | `source_evidence` stores a **verbatim quote plus an index into the submitted input**, and a test asserts the quote is a literal substring of the input it cites. (P3) |
| R4 | **Two active brain doc versions for one `(profile_id, kind)`.** Application-code activation loses a race. | **Partial unique index** on `(profile_id, kind) WHERE status='active'` plus a real-Postgres concurrency case, same shape as M1's ledger proofs. (P1/P3) |
| R5 | **M2 is the product's first real token spend, priced at 0 credits.** `onboardingBrainBuild: 0` would let a Free workspace re-run inference repeatedly and burn Anthropic tokens against a >=70% margin target (PRD §5.4) with no credit brake. | **Persist** a `model_usage` row per HTTP call (round 1 only *returned* the numbers), and enforce `PRD.md:135`'s **once per profile** counted from that table. (P1 schema, P2 behaviour) |
| R9 | **A verified brand is bypassable by a cast.** `raw as VerifiedProfileId` compiles at `tsc` exit 0; the same hole exists today for `VerifiedWorkspaceId`. | Repo-wide brand-provenance scan (P7); `VerifiedProfileId` stays off the app allowlist; `packages/brain` takes `ProfileScope` only. (P1, P3) |
| R10 | **A config-key addition breaks every money read on an existing database** — `getActiveConfig` is called at six sites inside the Stripe webhook transaction. | D-M2-7b: a config data step in the same change, plus a test parsing a stored pre-change document. (P1, P2, P3) |
| R11 | **Onboarding runs during a pause** — vendor spend against zero revenue, and a `brain_docs` write against REQ-G08's read-only Must. | D-M2-11: pause checked before inference and before activation. (P5) |
| R12 | **The link input becomes a scraper.** The `respin-scraping-dependency` guardrail is `warn`-level and matches `package.json` only, so a bare `fetch()` trips nothing. | D-M2-9: paste-first, YouTube oEmbed allowlist only, AC asserting no non-allowlisted outbound fetch. (P5) |
| R13 | **Third-party reference text reaches M3's prompt bundle as brain provenance**, through a surface the spin-only similarity gate does not cover. | D-M2-10: input class on every provenance record; `reference` quotes barred from `voice`. (P1, P3, P5) |
| R6 | **The library seed leaks a person.** R-29's boundary is only as good as what is actually in the JSON. | Seed is a checked-in reviewable file **plus** an assertion that no seeded row carries personal-specific fields, proven red against a planted violation (the `retention.test.ts` pattern). (P4) |
| R7 | **Inference invents specifics about the creator** (REQ-I03). | `[check]` convention applied to inferred fields; a low-confidence field cannot activate unconfirmed. (P2/P5) |
| R8 | **Onboarding claims "<20 minutes" without measuring it.** The build-plan's accept-when is a time claim; a fixture cannot prove it. | Report it as an **evidence criterion separate from the engineering claim** (the build-plan's own M3 precedent), not as a gate. (P5) |
