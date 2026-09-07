# Phase 1 — The profile tenancy cage and the complete M2 schema (ENTRY GATE)

**Depends on:** none.
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-A03 (primary), REQ-A01 (schema + caps), REQ-B02/REQ-D01 (schema shape), REQ-J02 (usage recording shape).
**Binding design:** [`respin-m2-profile-cage-design.md`](respin-m2-profile-cage-design.md) — this phase implements it, it does not re-decide it.

> **This phase is a stop condition for EVERY other M2 phase, phase 2 included.** The design says *"M2 implementation does not start"*, not "phases 3-6 do not start".

> **This phase owns the whole M2 schema AND the whole write surface.** Round 2 found three creator-data write paths — creating a `creator_profiles` row, counting profiles for the tier cap, inserting `onboarding_inputs` — that belonged to **no phase at all**. `ProfileScope`'s accessors were all read-only, `app/**` cannot reach a table, and nothing filled the gap. Whatever did would land after this gate, outside the accessor map, outside P3 and P4 — the retro-fit hazard this phase exists to prevent.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.** If you can't verify it, say so.
8. **Scale caution to blast radius.** Pushing, publishing, sending anything outside the repo, and deleting what you didn't create wait for explicit confirmation.
9. **Current facts beat trained memory.** Verify against the installed version before use.

### Non-negotiable rules (Respin) — the ones this phase touches

- **3. Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03/D04, R-9).
- **2. The ledger is the balance.** Append-only, balance derived. `brain_docs` and `model_usage` follow the same discipline.

### Lessons that touch this ground (from `CLAUDE.md`)

- **2026-07-30 — fix the class, not the field.** Guard where the path is *built*; validate the whole artefact at its boundary; put the guard in a package every consumer can import; add a lint. "Grep every sibling id" is the version of this rule that already failed. **This phase's round-1 and round-2 drafts each failed it** — a brand guarded by name and directory, then a *brand* guarded while the **authority object that replaced it** stayed forgeable.
- **2026-07-30 — a comment claiming a property is not the property.** Assert it in a test or delete the claim. **And: when a plan asserts a mutation outcome ("P4 must go red"), it must name the fixture that produces it** — round 1 and round 2 both asserted the outcome without a working mechanism.
- **2026-08-10 — present-and-verified is not present-and-unrun.**
- **2026-08-18 — prove a parser-dependent guard generatively** against the installed parser; a counterexample list fixes named instances and leaves the class open. Never report a thing recorded until you have re-read the file.

### Stack and boundaries

- Next.js 15 App Router, TypeScript, **pnpm** (`pnpm -C respin ...`), self-hosted Postgres 17 (Docker, port 5435) + Drizzle, Zod at boundaries.
- **`app/` imports `packages/`, never the reverse.** `app/**` reaches packages only through `@respin/*` names; a relative or `@/`-aliased path into `packages/` is blanket-denied.
- Respin's ESLint config is pinned inside `respin/` deliberately (2026-08-02 lesson).
- uuid v7 app-side (`uuidv7()`) per R-17; `created_at`/`updated_at` with timezone on every table.

### Available specialist agents

`respin-engineer`. Reviewers (read-only): `respin-tenancy-reviewer`, `respin-billing-reviewer`, `respin-learning-reviewer`, `respin-compliance-reviewer`, `code-reviewer`, `security-reviewer`.
**Do NOT request** any agent not listed in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | `creator_profiles`, nested under `workspaces`, with a `workspace_id` FK **and a unique index on `(id, workspace_id)`** so children can carry a composite FK | REQ-A01, tech-spec §2 |
| F2 | `brain_docs`: `(profile_id, workspace_id, kind, version, content jsonb, source_evidence jsonb, status, reason, activated_at, superseded_at)`, composite FK to `(id, workspace_id)`, D-M2-3 partial unique index | tech-spec §2:63; D-M2-3 |
| F3 | `frameworks` per tech-spec §2:67, plus `workspace_id` (nullable), `tested_caveats`, `evidence_entries`, `source_references`; `owner_profile_id` FK `onDelete: cascade`; **two CHECKs** — `visibility='private'` implies a non-null owner, and `visibility='shared'` implies `owner_profile_id IS NULL AND workspace_id IS NULL` | REQ-D01; R-9 as a constraint, not a seeder convention |
| F4 | **`onboarding_inputs`**: `(id, workspace_id, profile_id, input_class, content, content_sha256, source_url nullable, created_at)` — **immutable**, no update path | D-M2-4, D-M2-10 |
| F5 | **`model_usage`**: `(id, workspace_id, profile_id NOT NULL, attempt_id, purpose, model, tokens_in, tokens_out, usage_raw jsonb, cost_micro_usd bigint nullable, cost_state, stripe_price_id nullable, prompt_bundle_version, config_version, outcome, created_at)` — append-only | D-M2-2, D-M2-2b, D-M2-13 |
| F6 | `VerifiedProfileId` brand, **no `trustProfileId`**, and no other expression anywhere producing it | Cage design §1 |
| F7 | `WorkspaceScope.profile(id)` mints a `ProfileScope` via one composite-predicate query, or throws `ProfileAccessError` | Cage design §2 |
| F8 | Every `ProfileScope` accessor **and capability** filters on **both** `profile_id` and `workspace_id` | Cage design §3, D-M2-6 |
| F9 | `ProfileAccessError`'s message is byte-identical for foreign and nonexistent | Cage design §4 |
| F10 | **The write surface is scoped too**: `WorkspaceScope.accessors.creatorProfiles()` (for the cap count) and `WorkspaceScope.createProfile()`; `ProfileScope.capabilities.appendOnboardingInput()` | Round-2 tenancy BLOCK 3 |
| F11 | **`ProfileScope` and `WorkspaceScope` are themselves branded** with a `unique symbol` minted only in `with-workspace.ts` | Round-2 tenancy BLOCK 4 |
| F12 | Per-tier profile caps in `respinConfigV1`; **new config keys are `.default(...)`** so a pre-change stored document parses unchanged | D-M2-7, D-M2-7b |
| F13 | **`hasOpenPause` is added to the `@respin/credits` facade** | D-M2-11 |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | No leakage across profiles **or profiles within one workspace** | P1-P4, with **both** fixture axes (cross-workspace and same-workspace-two-profiles) and **both** mutations (drop `workspace_id`; drop `profile_id`) |
| T2 | Brains versioned, never silently mutated (R-8) | append-only shape + partial unique index |
| T3 | Config not code (B5), **and a config change never breaks a money read** | `.default(...)` keys (F12) + the data step as cleanup, not as a gate |
| T4 | Migration parity | `db:check` clean; migration generated, not hand-written |
| T5 | The verified brands **and the scope objects** have exactly one producer each | P7, repo-wide, proven red against a cast **and** a spread-forge |

## Edge Cases & Failure Paths

**Inverse events.**

| Event | Inverse | Behaviour |
|---|---|---|
| Profile created | Profile deleted | **Out of scope — M6 (DL-4).** All children cascade from profile; profiles cascade from workspace. No in-product delete path. |
| Framework owned by a profile | That profile deleted | `owner_profile_id` is `onDelete: **cascade**`, deliberately: `SET NULL` would convert a creator's private framework into a **library-owned** row (`owner_profile_id IS NULL` is phase 4's marker for exactly that) — creator data entering the shared library by deletion. The F3 CHECK makes that state unrepresentable as well. |
| Brain doc activated | Previous deactivated | Same transaction; `superseded_at` on the outgoing version, `activated_at` on the incoming. |
| Onboarding input stored | Input edited | **Impossible by construction** — no update path; `content_sha256` makes a silent rewrite detectable. This is what makes D-M2-4's guarantee durable rather than write-time-only. |
| Config key added | Existing database read | **Nothing happens** — the key is `.default(...)`, so the stored document parses unchanged. The data step is cleanup that can run any time. Round 2 made this a *gate* with an ordering window; F12 removes the window. |

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| `scope.profile()` returns no row | Caller ignores the throw | Impossible — the mint throws rather than returning an optional. |
| A `brain_docs` row's `workspace_id` disagrees with its profile's | An accessor reads with only `profile_id` | The composite FK makes the row unrepresentable in production; the accessor's own predicate is defence in depth. P4 proves the predicate by **dropping the FK inside a rolled-back transaction** — see Verification 6. |
| Two profiles in ONE workspace | An accessor reads with only `workspace_id` | Returns both creators' brains. **This is the breach the cage exists for**, and no round-1 or round-2 fixture tested it. P4's second axis does. |
| Config data step never runs | Webhook fires | **Nothing breaks** under F12's defaults. This is why the defaults route was chosen over a mandatory ordered step. |

**Degraded mode.** No external boundary. Postgres unavailability fails loudly; there is no partial-data degraded mode, and inventing one would be a leak surface.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| App -> Postgres (mint) | Connection lost | Request fails; no cached or partial scope | None | AC-1 |
| App -> Postgres (activation tx) | Tx aborts | Neither half lands | Rollback | AC-8 |
| Any reader -> `config_versions` | Stored document has no new keys | **Parses, using defaults** (F12) | The data step, whenever convenient | AC-11 |
| Any reader -> `config_versions` | Stored document genuinely invalid | `ConfigUnavailableError` — fail-closed, and an outage on the money path | Operator repair; note `/admin/config` is *also* down, since it reads the same config | AC-11 |

## Handoff Contracts

Consumed by phases 2-6:

    // packages/db/src/with-workspace.ts
    declare const verifiedProfileIdBrand: unique symbol;
    declare const profileScopeBrand: unique symbol;      // F11 — the AUTHORITY is branded too
    declare const workspaceScopeBrand: unique symbol;

    export type VerifiedProfileId = string & { readonly [verifiedProfileIdBrand]: true };

    export class ProfileAccessError extends Error {}

    export type ProfileScope = {
      readonly [profileScopeBrand]: true;               // forging this requires an as-cast P7 catches
      workspaceId: VerifiedWorkspaceId;
      profileId: VerifiedProfileId;
      accessors: {
        profile:          () => Promise<CreatorProfile[]>;
        brainDocs:        () => Promise<BrainDoc[]>;
        activeBrainDocs:  () => Promise<BrainDoc[]>;
        onboardingInputs: () => Promise<OnboardingInput[]>;
        modelUsage:       (page: UsagePage) => Promise<ModelUsageRow[]>;
      };
      // WRITE surface — scoped, composite, and enumerated by P3/P4 exactly like the reads.
      capabilities: {
        appendOnboardingInput: (i: NewOnboardingInput) => Promise<OnboardingInput>;
        recordModelUsage:      (u: NewModelUsage, tx?: TxLike) => Promise<ModelUsageRow>;
        writeBrainDoc:         (d: NewBrainDoc, tx: TxLike) => Promise<BrainDoc>;   // drafts AND activations
      };
    };

    // on WorkspaceScope:
    profile:  (id: string) => Promise<ProfileScope>;     // throws ProfileAccessError
    accessors.creatorProfiles: () => Promise<CreatorProfile[]>;   // the tier-cap count reads THIS
    createProfile: (p: NewCreatorProfile) => Promise<ProfileScope>;

**There is no `trustProfileId`, under that name or any other**, and no phase may add one. P7 enforces the class.
**`VerifiedProfileId` is NOT on the app-side eslint allowlist** — app code holds a `ProfileScope`.
**`writeBrainDoc` is the single insert path for `brain_docs`**, drafts included; phase 3's enumeration covers it (round-2 learning BLOCK-B).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Write P1-P7 **first**, against un-caged code, each recorded red — **P4 on both fixture axes, P7 against a cast and a spread-forge** | `respin-engineer` | `respin/tests/profile-cage.test.ts`, `respin/packages/db/tests/with-workspace.test.ts`, `respin/tests/import-boundary.test.ts` |
| 2 | `brain-schema.ts`: `creator_profiles` (+ unique `(id, workspace_id)`), `brain_docs`, `frameworks` (+ both CHECKs) | `respin-engineer` | `respin/packages/db/src/brain-schema.ts` |
| 3 | `onboarding-schema.ts`: `onboarding_inputs` (immutable, `content_sha256`, `input_class` enum) and `model_usage` (append-only, `profile_id` **NOT NULL**, `attempt_id`, `cost_micro_usd bigint`, `usage_raw jsonb`, `stripe_price_id`, `outcome` enum **enumerated in the schema**) | `respin-engineer` | `respin/packages/db/src/onboarding-schema.ts` |
| 4 | Re-export from `schema.ts`; sanctioned **types only** in `index.ts` | `respin-engineer` | `respin/packages/db/src/{schema.ts,index.ts}` |
| 5 | Generate + commit migration `0011_*` and its meta snapshot | `respin-engineer` | `respin/packages/db/migrations/**` |
| 6 | `VerifiedProfileId` + the two **scope brands** (F11) + `ProfileAccessError` | `respin-engineer` | `respin/packages/db/src/with-workspace.ts` |
| 7 | `WorkspaceScope.profile()` mint, five accessors, **three capabilities**, `creatorProfiles()` and `createProfile()` — all composite | `respin-engineer` | `respin/packages/db/src/with-workspace.ts` |
| 8 | Extend the eslint `@respin/db` allowlist with `ProfileScope` + row **types** — **not `VerifiedProfileId`** | `respin-engineer` | `respin/eslint.config.mjs` |
| 9 | Profile caps + the `creditCosts.onboardingBrainRebuild` key into `respinConfigV1` as **`.default(...)`** (F12), with `CONFIG_V1_SEED` and the parity test | `respin-engineer` | `respin/packages/config/src/schema.ts`, `respin/packages/db/src/seed.ts` |
| 10 | `migrate-config` as **cleanup**: read the raw stored jsonb, **merge only the added keys**, re-append. Plus the AC-11 preservation test | `respin-engineer` | `respin/packages/config/src/migrate-config.ts`, `respin/packages/config/tests/config.test.ts` |
| 11 | **Add `hasOpenPause` to the `@respin/credits` facade** (D-M2-11) — explicitly in scope | `respin-engineer` | `respin/packages/credits/src/app-server.ts`, `respin/eslint.config.mjs` |
| 12 | Real-Postgres concurrency case for the partial unique index | `respin-engineer` | `respin/packages/db/tests/concurrency.docker.test.ts` |
| 13 | **Correct `PRD.md:125`** (remove "(lite brain)", D-M2-12) and record **D-M2-11 and D-M2-12 as decision entries** | `respin-engineer` | `docs/initial/PRD.md`, `docs/initial/decisions.md` |
| 14 | Record the red-then-green transition and every mutation output | `respin-engineer` | `docs/progress/respin-m2/ledger.md` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/packages/db/src/brain-schema.ts` | New | Mirrors `billing-schema.ts` |
| `respin/packages/db/src/onboarding-schema.ts` | New | Inputs + usage |
| `respin/packages/db/migrations/0011_*.sql` + `meta/0011_snapshot.json` | New | Generated |
| `respin/tests/profile-cage.test.ts` | New | P1, P2, P4, P7 |
| `respin/packages/config/src/migrate-config.ts` | New | Merge-into-raw cleanup |
| `respin/packages/db/src/with-workspace.ts` | Modified | Brands, error, mint, accessors, capabilities |
| `respin/packages/db/src/{schema.ts,index.ts,seed.ts}` | Modified | Re-export, surface, seed |
| `respin/packages/db/tests/{with-workspace,concurrency.docker}.test.ts` | Modified | P3, AC-8 |
| `respin/tests/import-boundary.test.ts` | Modified | P6 |
| `respin/eslint.config.mjs` | Modified | `ProfileScope` + types; `@respin/credits/app-server` gains `hasOpenPause` |
| `respin/packages/config/src/schema.ts`, `respin/packages/config/tests/config.test.ts` | Modified | `.default(...)` keys; preservation test |
| `respin/packages/credits/src/app-server.ts` | Modified | `hasOpenPause` on the facade (task 11) |
| `docs/initial/PRD.md`, `docs/initial/decisions.md` | Modified | D-M2-11, D-M2-12 |
| `docs/progress/respin-m2/ledger.md` | Modified | Task 14 |

## Migration Steps

1. `pnpm -C respin db:generate`.
2. Inspect the emitted SQL for four things Drizzle may not produce: the **partial** unique index, the **composite FK**, both `frameworks` **CHECK**s, and `model_usage.profile_id NOT NULL`. Add any missing one explicitly in the **same** migration, with the reason recorded. *(A nullable `profile_id` under a composite FK is skipped entirely by Postgres MATCH SIMPLE — verified — putting those rows outside the cage and outside the attempt count.)*
3. `pnpm -C respin db:migrate` on a fresh database; `db:check` clean.
4. **The config data step is cleanup, not a gate.** New keys are `.default(...)`, so a pre-change stored document parses unchanged and no ordering window exists between code and data. `migrate-config` then normalises stored documents by **reading the raw jsonb and merging only the added keys** — never by appending `CONFIG_V1_SEED`, which would erase `stripePriceMap`, `pack`, `graceDays` and `allowances` customisation while parsing perfectly.
5. Update `seedDb` so a seeded workspace has a `creator_profile`.

## Verification Steps

1. **State: un-caged code.** `pnpm -C respin test -- profile-cage` -> every P1-P7 assertion fails. Record it.
2. **After task 5.** `db:check` clean.
3. **After step 2.** `typecheck` exit 0, including P5's `// @ts-expect-error`.
4. **After step 3.** `lint` exit 0.
5. **After step 4, Docker up.** CI-shape suite green, no loud-skips.
6. **The P4 cross-workspace mutation — with a fixture that can exist.** The composite FK makes a cross-parented row unrepresentable, which is the point in production and an obstacle in test. Three mechanisms were tried against Postgres 17 and **all three fail**: re-parenting the profile is rejected by the FK (`ON UPDATE no action`, which is what Drizzle emits); `ON UPDATE CASCADE` makes the child follow the parent, so the rows *agree* and the mutation stays green **silently**; and `SET CONSTRAINTS ALL DEFERRED` on a non-deferrable FK succeeds while changing nothing. **The mechanism is therefore:** `BEGIN; ALTER TABLE brain_docs DROP CONSTRAINT <fk>; INSERT cross-parented row; assert composite returns 1 and profile-only returns 2; ROLLBACK` — DDL is transactional in Postgres. *Disable the outer defence to prove the inner one.* Then drop the `workspace_id` predicate from one accessor: **P4 goes red**.
7. **The P4 same-workspace mutation — the breach the cage is for.** Seed **two profiles P1, P2 inside workspace A** with colliding-shape rows. Assert each accessor on `scope.profile(P1)` returns only P1's. Drop the **`profile_id`** predicate: **P4 goes red**. *(REQ-A01 puts five profiles in one Studio workspace, and this is the cage design's own opening example. No round-1 or round-2 fixture tested it.)*
8. **`profile()`'s breach case is P1, not a planted row** — a cross-parented `creator_profiles` row would be the same PK with a different `workspace_id`, which cannot exist. Stated so no one tries.
9. **After step 8.** Drop the composite predicate from the mint: **P1 goes red**.
10. **The P7 mutations.** Each planted separately, each must go red: `raw as VerifiedProfileId` in `packages/brain/src` and in `app/`; a differently-named mint (`asProfileId`); a type alias (`type Pid = VerifiedProfileId; raw as Pid`); a re-export of the brand; and **`{...scope, profileId: other} as unknown as ProfileScope`** — the spread-forge, which defeats a scan aimed only at the brands and is how the authority object was still castable after round 2.
11. **AC-11.** Seed a config document with a **customised** `stripePriceMap` and `pack`, run `migrate-config`, assert every pre-existing value is byte-identical afterwards. Then plant a `migrate-config` that appends `CONFIG_V1_SEED` + the new keys: **AC-11 goes red**. *(That implementation parses perfectly and drops every paying subscriber to `{tier: "free", reason: "unmapped_price"}` — silently, because nothing throws.)*

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | **P1** — a foreign profile id throws `ProfileAccessError` | red at step 9 |
| AC-2 | **P2** — message byte-identical for foreign and nonexistent (`toBe`) | `P2: not an enumeration oracle` |
| AC-3 | **P3** — accessor keys, capability keys, breach-validator keys and arg-map keys all agree, **and contain at least** `{profile, brainDocs, activeBrainDocs, onboardingInputs, modelUsage}` + `{appendOnboardingInput, recordModelUsage, writeBrainDoc}` | the named minimum stops `{} === {} === {}` passing while AC-4's loop runs zero times. *(The cited precedent `with-workspace.test.ts:138` is a non-emptiness check; this criterion is deliberately stronger.)* |
| AC-4 | **P4** — per accessor **and per capability**, on **both** axes: cross-workspace (step 6) and **two profiles in one workspace** (step 7); every read returns >0 rows; **both** mutations go red | steps 6, 7 |
| AC-5 | **P5** — bare `string` to `VerifiedProfileId` is a type error | `// @ts-expect-error` |
| AC-6 | **P6** — no `trustProfileId`-shaped export in `packages/db/src` | import-boundary suite |
| AC-7 | **P7** — repo-wide, the only producers of `VerifiedProfileId`, `VerifiedWorkspaceId`, `ProfileScope` and `WorkspaceScope` are the sanctioned mints in `with-workspace.ts` | **five distinct mutations, step 10**, including the spread-forge. Closes the pre-existing `as VerifiedWorkspaceId` hole in the same stroke |
| AC-8 | Concurrent activation leaves exactly one active row | real-Postgres; red without the index |
| AC-9 | `db:check` clean; `0011_*` committed; composite FK, both CHECKs, and `profile_id NOT NULL` present in the emitted SQL | step 2 |
| AC-10 | Profile caps and the rebuild price read from `respinConfigV1` | parity test |
| AC-11 | **`migrate-config` preserves every pre-existing config value**, and a pre-change stored document parses **without** the step having run | step 11; red against a `CONFIG_V1_SEED`-appending implementation |
| AC-12 | A profile that owns a private framework **cascades**; the `visibility='shared'` CHECK makes an owned shared row unrepresentable | `frameworks` FK + CHECK tests |
| AC-13 | `onboarding_inputs` has no update path; `content_sha256` matches its content | schema + source-scan |
| AC-14 | **`model_usage.profile_id` is NOT NULL**, so no usage row escapes the cage or the attempt count | schema test; red under a nullable column |
| AC-15 | `hasOpenPause` is reachable from `app/**` via the facade, and `isPausedSubscription` is **not** | facade + eslint test |
| AC-16 | Every P1-P7 was **observed red** first, with output recorded, and each mutation named which cases went red | `docs/progress/respin-m2/ledger.md` |

## Least confident (one line)

**That `ALTER TABLE ... DROP CONSTRAINT` inside a rolled-back transaction is available to the test harness** — it needs DDL rights on the test database and the PGlite harness may not support transactional DDL the way real Postgres does, in which case P4's cross-workspace axis becomes a **Docker-only** case (`concurrency.docker.test.ts`) and loud-skips elsewhere; that is an acceptable answer and the plan says so now, but it must be *decided and stated*, not discovered — because the failure mode is the suite silently not running the one test the design calls the one that matters.

## Out of Scope (Surgical Changes)

Do not touch `packages/credits/**` **except** task 11's facade export (explicitly in scope). Do not touch `packages/auth/**`, `app/(product)/settings/billing/**`, `app/api/stripe/**`, `src/`, `cutdown/`. Do not add a profile-delete path. Do not build any onboarding or brain route. Do not write any `frameworks` row.

## Completion Criteria (Definition of Done)

- Entry gate clean, CI shape, no loud-skips.
- Critical-Path gates PASS: **brain tenancy** (primary), **learning honesty**, **billing & credits** (this phase edits `packages/config`, `seed.ts`, the `@respin/credits` facade, and a PRD §4G number, and carries AC-11).
- `tech-spec.md` §2, `build-plan.md` M2, `PRD.md:125`, `decisions.md` updated together.
- AC-1 .. AC-16 met with named evidence.
