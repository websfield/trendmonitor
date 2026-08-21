# Plan — Respin M2a: the profile tenancy cage and the M2 schema

**One phase, one document, deliberately.** Split out of `respin-m2-master-plan.md` on 2026-08-20 after three plan-gate rounds whose fixes were applied to some documents and contradicted in others. **Rewritten whole on 2026-08-20** after two further rounds, for the same reason: patching reproduced the partial-application failure four times running.

**Depends on:** nothing. **Blocks:** every other M2 phase.
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-A03 (primary), REQ-A01 (schema), REQ-B02/REQ-D01 (schema shape), REQ-J02 (usage shape).
**Binding design:** [`respin-m2-profile-cage-design.md`](respin-m2-profile-cage-design.md).
**Gate findings this closes:** [`../progress/respin-m2-plan-review.md`](../progress/respin-m2-plan-review.md), [`../progress/respin-m2-plan-review-round3.md`](../progress/respin-m2-plan-review-round3.md), plus the two M2a rounds recorded in the ledger.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.**
6. **Report honestly.** "Done" is a claim the checks have to back.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify against the installed version.

### Non-negotiable rules (Respin)

- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03, R-9). **This plan is that rule.**
- **3. Brains are context, never weights, never silent** (R-8, REQ-B02/C05).
- **2. The ledger is the balance.** `model_usage` is append-only **except for one sanctioned update**: `cost_state` `'estimated' -> 'reconciled'` with its cost, fenced and commented like `pause_periods`' own single update, and listed in P8's expected-writer set. Declaring the table append-only while `cost_state` must transition made REQ-G05's "prefers reconciled" describe a state it could never reach.

### Lessons that touch this ground

- **2026-07-30 — fix the class, not the field.** **Five gate rounds have caught this plan's lineage failing it**: a brand guarded by name, then by directory, then an object branded while three cast-free forges compiled, then `NoIds` applied to the ids and not to `status`. A guard applied to one field of a class is not applied.
- **2026-07-30 — a comment claiming a property is not the property.** A plan asserting a mutation outcome must name the fixture that produces it, **and label it with the tool that produces the red** — three "compile-red" labels in the last draft were lint-red.
- **2026-08-10 — present-and-verified is not present-and-unrun.**
- **2026-08-18 — prove a parser-dependent guard generatively.**
- **2026-08-02 — a nested project's config is inherited silently.** The specifier-shape deny exists for `app/**` and **not** for `packages/**`, which is how a deep path import reaches the cage from a sibling package.

### Stack and boundaries

Next.js 15, TypeScript, **pnpm**, Postgres 17 (Docker, 5435) + Drizzle, PGlite for unit tests, Zod at boundaries. uuid v7 app-side (R-17).

**The dependency graph, verified:** `@respin/config` and `@respin/credits` both depend on `@respin/db`; `@respin/db` depends on neither. But `packages/db` **owns `pause_periods`** (`billing-schema.ts:263`) **and `config_versions`** (`:253`), so anything derivable from those tables is db-local. What is *not* db-local is the **tier**, whose sole authority is `credits/src/state.ts:229` — and that is why profile creation is not in this plan.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-tenancy-reviewer`, `respin-billing-reviewer`, `code-reviewer`, `security-reviewer`.

---

## Decisions

| ID | Decision | Why |
|---|---|---|
| **A-1** | `VerifiedProfileId` and the scope classes live in `packages/db/src/with-workspace.ts`. **No `trustProfileId`, under any name.** | Cage design §1. |
| **A-2** | Both scopes are **classes** whose constructor accepts a **module-private mint token** and refuses without it (`private static readonly TOKEN = Symbol()`, compared by identity), with `readonly #cage = true`, all fields `readonly`, a `new.target` check as a **second** line, and registration in a `WeakSet` keyed off `globalThis[Symbol.for("respin.scope.cage")]`. | **`new.target` does not work and the gate proved it by running it.** `Reflect.construct(target, args)` defaults `newTarget` to `target`, so `new.target === ProfileScope` and the guard **passes**: `Reflect.construct` and `new (X as any)(...)` both minted a **cage-registered** scope with attacker ids and passed `assertScoped`. Only a runtime subclass was caught. A token the constructor cannot obtain from outside the module is the check that actually holds; `new.target` stays as defence in depth. `#private` + `readonly` kill spread (TS2741) and in-place assignment (TS2540); `private constructor` kills `extends` (TS2675) and `new` (TS2673) — **both erase at runtime**, which is why the runtime token is load-bearing. The `globalThis` key defends module duplication under `vi.resetModules()` or a second Next server graph. |
| **A-2b** | Scopes are **exported as types only**, and the `packages/**` eslint block gains the same path/deep-import denies `app/**` already has. | `export type` makes a value import and an `extends` **TS1362** — verified. But eslint's `allowImportNames` makes no type/value distinction, and from `packages/credits/src` both `"../../db/src/with-workspace"` and `"@respin/db/src/with-workspace"` are **ALLOWED** — the specifier-shape hole, closed for `app/**` in M1 and still open one directory over, in the milestone that increases db↔credits traffic. |
| **A-3** | **`assertScoped(scope)` is exported from `packages/db` and called at every `WorkspaceScope`-taking entry in `packages/credits`.** | The cage asserted only inside `writeCapabilities` leaves the scope's *existing* consumers structural: `Object.assign({}, viewerScope, {role: "owner"})` compiles at exit 0 and reaches `assertOwner` (`credits/src/stripe/actions.ts:242`) — **viewer→owner escalation, REQ-A02** — and the same shape puts a raw form string into `scope.workspaceId` for the query at `:255`. The previous draft named that file as the vector, fixed only half of it, and exported no assertion, so `packages/credits` could not have checked even if asked. |
| **A-4** | **Each capability takes a hand-written input type naming only the fields a caller MAY supply** — `writeBrainDoc` takes `{kind, content, sourceEvidence, reason}` and nothing else — with every other column server-derived. `version` is `max+1`, computed server-side, with a unique index on `(profile_id, kind, version)`. | **Denylisting failed twice for the same reason, so the default is inverted.** Round 2 guarded the ids and missed `status`; round 3's named `GUARDED` constant was still one field short — `version` compiled at exit 0, and `tech-spec.md:66` makes it load-bearing ("active = max version"), with nothing forcing it to increment or forbidding duplicates. `activatedAt`/`supersededAt` were caller-settable too, on a table whose activation semantics are M2b's. An allowlist fails **closed** when a column is added; a denylist fails open, which is what "fix the class, not the field" means here. |
| **A-5** | Composite FKs on `brain_docs`, `onboarding_inputs`, `model_usage`, **both columns NOT NULL**. **`frameworks` is carved out** — `visibility NOT NULL` with two values, plus CHECKs, plus its own `onDelete: cascade`. | Postgres MATCH SIMPLE skips a composite FK when **any** column is NULL — reproduced in both directions. `frameworks` needs `shared ⇒ both NULL`, so a blanket rule contradicted the schema and made its own criterion unsatisfiable. |
| **A-6** | All FKs `onDelete: cascade`. **`workspace_spend_monthly` is an UPSERT-maintained rollup, not an append-only table** — `onConflictDoUpdate` incrementing `cost_micro_usd` and `call_count` is its **ONE sanctioned update**, commented in the schema the way `pause_periods` comments its own, and listed in P8's expected-writer set for that verb. `workspace_id uuid NOT NULL` as a **plain column with no FK**. | `restrict` + both-NOT-NULL made REQ-A04's deletion structurally impossible. But the replacement was specified into a contradiction: unique `(workspace_id, period_month, tier)` + aggregate columns + **append-only** + "written per debit" has no implementation — the second generation in a month must either violate the unique or upsert, and upsert is an UPDATE. Naming it a rollup with one sanctioned update resolves it honestly; pretending an aggregate table is append-only is the mutable-stored-counter shape `credit_ledger` forbids, wearing the wrong label. `uuid` not `text`: every other workspace id in the schema is `uuid`, and dropping the FK does not require dropping the type. |
| **A-7** | **`hasOpenPause` and `WorkspacePausedError` move into `packages/db`** (which owns `pause_periods`); `@respin/credits` re-exports both. **`writeBrainDoc` refuses under an open pause. `appendOnboardingInput` and `recordModelUsage` do not.** | The injection design rested on a false premise and had no wiring layer. On the exemptions: REQ-G08 suspends **entitlements** — a brain write is one. Storing the creator's own submitted text is not, and refusing it would silently discard their work; recording spend already incurred is R-28's settlement tail. **R-28's precondition is carried, not dropped:** its exemption holds *because* the authorisation is refused earlier. So M2b's inference path must refuse at **operation entry, before the model call** — recorded as a binding constraint on M2b, since M2a has no model call to gate, **together with the zero-cost fact that makes it load-bearing**: `creditCosts.onboardingBrainBuild` is `0` and `debitCredits` throws on a zero cost (`ledger.ts:339`), so a zero-cost operation skips `debitCredits` entirely — and with it the only pause gate on the spend path. **REQ-G08 is narrowed, and the narrowing is recorded rather than taken silently:** its "read-only access" (`PRD.md:118`) is read as covering entitlement-consuming writes, not input capture. `PRD.md:118` is amended in the same change. |
| **A-8** | `onboarding_inputs.content` normalised at write (**NFC, CRLF→LF**); `content_sha256` over the **normalised UTF-8 bytes**; offsets in **UTF-16 code units**. `source_evidence` entry shape pinned as `{quote, inputId, startUtf16, endUtf16, confidence}` — **`confidence` carries REQ-B02's second half**, its shape defined by M2b, the column present now. | Offsets had no unit and no normalisation rule; hashing raw input would leave the mismatch inside the fix; and the entry had no column until the shape was pinned. REQ-B02 requires evidence **and** a confidence level, and the previous draft claimed REQ-B02 as a schema requirement while omitting the second half. |
| **A-9** | New config keys are `.default(...)`. **Deploy order pinned: code first, then `migrate-config`.** `migrate-config` reads the raw **max/active** document, **refuses loudly if it does not parse**, merges only added keys, **compare-and-sets on the source version**, appends (never updates in place), and is a no-op when the key is present. | `.strict()` means a stored document carrying a new key is a parse failure for older code — so migrating first, or rolling back after, throws at the five in-transaction `getActiveConfig(tx)` sites. Three wrong-version failures were found across two rounds: reading v1 (empty `stripePriceMap`), appending `CONFIG_V1_SEED`, and **updating in place** — which preserves values byte-identically, is a no-op on re-run, and retroactively rewrites what priced every debit already stamped that version. Also stated: the reverse window opens at the **first `/admin/config` append after deploy**, not at `migrate-config`, because `appendConfigVersion` stores the parsed (defaulted) document. |
| **A-10** | **M2a writes `status='proposed'` only.** Activation, supersession, the confirmation columns and `source_evidence NOT NULL` land together in M2b's migration. | INSERT-only writes plus a caller-chosen status plus a partial unique index on `status='active'` would let the first row pin the brain forever, with no supersede path — unless an UPDATE existed outside the enumerated write surface, which P8 forbids. |
| **A-11** | **`createProfile` is NOT in this plan** (owner decision, 2026-08-20). M2a ships the cage, the schema, the read accessors, and the three write capabilities that need only db-local facts. | It needs the per-tier cap (config — db-local) **and the tier** (`credits/src/state.ts:229` — not db-local). From `packages/db` the only options were to let a caller supply the tier, or re-derive it and create a **second tier authority** — the defect class `state.ts` documents as the cause of two M1 gate findings, and which would grant Studio's 5 profiles to an `incomplete` subscription that never collected a cent. M2a has no route to call it from, so nothing is lost. **M2b owns it**, in a layer that can see config and billing state, composing the db-local mint. |

## Non-Goals

`packages/llm`, `packages/brain`, `packages/trends`, any route, any UI, any seeding, any inference, any credit debit, **profile creation** (A-11). `frameworks` is created and **written by nothing** — P8 pins its expected writer set to `[]`.

## Schema — one migration, `0011_*`

| Table | Notes |
|---|---|
| `creator_profiles` | `workspace_id` FK `onDelete: cascade`; **unique `(id, workspace_id)`** so children can carry a composite FK |
| `brain_docs` | composite FK → `creator_profiles(id, workspace_id)`, **both NOT NULL**, `cascade`; `kind`, `version`, `content jsonb`, `source_evidence jsonb` (A-8 shape; **`inputId` is validated against `onboarding_inputs` scoped to the same `(profile_id, workspace_id)` inside `writeBrainDoc`** — the composite FK cannot see inside jsonb), `status`, `reason`, `activated_at`, `superseded_at`; **partial unique index** on `(profile_id, kind) WHERE status='active'`. M2a writes `proposed` only |
| `onboarding_inputs` | composite FK, both NOT NULL, `cascade`; `input_class` enum; `content` (NFC/LF); `content_sha256` over normalised bytes; `source_url` nullable; **no update path** |
| `model_usage` | composite FK, both NOT NULL, **`cascade`**; `created_at` from **`clock_timestamp()`**; `attempt_id text` — **the same value M2b's debit carries as `ref_id`, one debit per `attempt_id`**; `purpose`; `model`; `tokens_in`; `tokens_out`; `usage_raw jsonb` (**metering fields only — never prompt or completion text**); `cost_micro_usd bigint` with **`mode: "bigint"`**; `cost_state` enum **`'estimated' \| 'reconciled' \| 'unknown'`**, default `'estimated'` at insert, with `'estimated' -> 'reconciled'` as the table's **ONE sanctioned update** (P8 expects it); REQ-G05 sums `reconciled`, falls back to `estimated`, **never `unknown`, and reports the excluded share** — dropping `unknown` understates cost and therefore *overstates* margin, the dangerous direction for a number R-6 tunes pricing against; `resolved_tier` **a pg enum `('creator','pro','studio','free','unmapped')`, written from `getWorkspaceBillingState` and never re-derived** **plus** `stripe_price_id` — the tier is resolved and stored, with `'unmapped'` **distinct from** `'free'`; `prompt_bundle_version`; `config_version`; `outcome` enum |
| `workspace_spend_monthly` | A-6. `workspace_id uuid NOT NULL` — **a plain column, deliberately not a cascading FK**; `period_month`, `tier` (same enum as `resolved_tier`), `cost_micro_usd bigint`, `call_count`, `created_at`, `updated_at`; **an UPSERT-maintained rollup with ONE sanctioned update** (`onConflictDoUpdate` incrementing the two aggregates), commented as such and in P8's expected-writer set; unique `(workspace_id, period_month, tier)`. Written by M2b. **In the P9 registry with an explicit deletion decision**, since it deliberately outlives workspace deletion |
| `frameworks` | tech-spec §2:67 plus `workspace_id`, `tested_caveats`, `evidence_entries`, `source_references`; composite FK `(owner_profile_id, workspace_id)` **`onDelete: cascade`**, carved out of A-5's NOT-NULL rule; `visibility NOT NULL`, two values; CHECKs `shared ⇒ both NULL`, `private ⇒ both NOT NULL` |

## Contract

    // packages/db/src/with-workspace.ts
    const cage: WeakSet<object> =
      (globalThis as any)[Symbol.for("respin.scope.cage")] ??= new WeakSet();
    const MINT = Symbol();                 // module-private; unobtainable from outside

    export class ProfileScope {
      readonly #cage = true;               // NOT `readonly #cage: true;` — that is TS2564
      readonly workspaceId: VerifiedWorkspaceId;
      readonly profileId: VerifiedProfileId;
      private constructor(token: symbol, ...) {
        if (token !== MINT) throw new ScopeForgeryError();   // THE check — Reflect.construct
        if (new.target !== ProfileScope) throw new ScopeForgeryError();  // defence in depth
        ...; cage.add(this);
      }
      static async mint(...): Promise<ProfileScope> { /* passes MINT */ }
      readonly accessors: { profile; brainDocs; activeBrainDocs; onboardingInputs; modelUsage };
    }
    // WorkspaceScope: identical shape, plus `readonly role` (the REQ-A02 authority).

    export function assertScoped(s: unknown): asserts s is ProfileScope | WorkspaceScope;

    // ALLOWLISTED inputs (A-4). Every other column is server-derived. A column added
    // to the row is DENIED until someone adds it here deliberately.
    export function writeCapabilities(scope: ProfileScope): {
      appendOnboardingInput: (i: { inputClass; content; sourceUrl? }) => Promise<OnboardingInput>;
      recordModelUsage:      (u: { attemptId; purpose; model; tokensIn; tokensOut;
                                   usageRaw; costMicroUsd?; costState; resolvedTier;
                                   stripePriceId?; promptBundleVersion; configVersion;
                                   outcome }, tx?: TxLike) => Promise<ModelUsageRow>;
      writeBrainDoc:         (d: { kind; content; sourceEvidence; reason },
                              tx: TxLike) => Promise<BrainDoc>;
      //  status='proposed', version=max+1, and both ids are ALL server-derived.
    };

    export async function withWorkspace(db: DbLike, ctx: WorkspaceCtx): Promise<WorkspaceScope>;
    export function hasOpenPause(tx: DbLike | TxLike, workspaceId: VerifiedWorkspaceId): Promise<boolean>;
    export class WorkspacePausedError extends Error {}   // moved from credits, ONE class
    export class ProfileAccessError extends Error {}
    export class ScopeForgeryError extends Error {}

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | Write P1-P9 **first**, against un-caged code; record each red | `respin/tests/profile-cage.test.ts`, `respin/packages/db/tests/with-workspace.test.ts`, `respin/tests/import-boundary.test.ts` |
| 2 | `brain-schema.ts` — `creator_profiles`, `brain_docs`, `frameworks` | `respin/packages/db/src/brain-schema.ts` |
| 3 | `onboarding-schema.ts` — `onboarding_inputs`, `model_usage`, `workspace_spend_monthly` | `respin/packages/db/src/onboarding-schema.ts` |
| 4 | Migration `0011_*` + meta snapshot | `respin/packages/db/migrations/**` |
| 5 | Both scope classes: private constructor, `new.target` guard, `globalThis`-keyed cage, `readonly` fields incl. `role` | `respin/packages/db/src/with-workspace.ts` |
| 6 | The mint, five accessors, `assertScoped` | same |
| 7 | `writeCapabilities()` — cage assertion first, `GUARDED` stripped ids-last, `hasOpenPause` refusal on `writeBrainDoc` only (A-7) | same |
| 8 | **Move `hasOpenPause` + `WorkspacePausedError` to `packages/db`; re-export from `@respin/credits`.** Update `facade-errors.test.ts` (its AST walk collects `class X extends Error` **declarations**, so a re-export makes the name vanish and the suite go red) and check `isolation.test.ts`'s `INTERNAL_MODULES` entries for `pause.ts`/`errors.ts` | `respin/packages/db/src/{pause.ts,errors.ts}`, `respin/packages/credits/src/{index,pause,errors}.ts`, `respin/packages/credits/tests/{facade-errors,isolation}.test.ts` |
| 9 | **Call `assertScoped` at every `WorkspaceScope`-taking entry in `packages/credits`** (`stripe/actions.ts:242` `assertOwner` first) | `respin/packages/credits/src/**` |
| 10 | `export type` the scopes; eslint: type names on the app allowlist, `writeCapabilities`/`VerifiedProfileId` denied, **and the `app/**` path/deep-import denies mirrored into the `packages/**` block** | `respin/packages/db/src/index.ts`, `respin/eslint.config.mjs` |
| 11 | Repair **seven** object-literal scopes, not one: `actions.test.ts:123` **and `isolation.test.ts:931,947,962,969,992,1079`** (cast-away literals feeding `createPortalUrl`, `createInvoiceRecoveryUrl` x3, `pause`/`resume`, `createTierCheckoutUrl`, `setAutoTopup`) — every one throws `ScopeForgeryError` once task 9 lands, while AC-18 asserts both suites stay green. **Mint through the real `withWorkspace`.** Note the true cost: `memberships_user_workspace_uq` (`schema.ts:72`) forbids one user holding owner+editor+viewer on one workspace, and `actions.test.ts:100`'s user belongs to `seedDb`'s workspace, not the one inserted at `:118` — so the fixture needs **three auth users, three domain users and three memberships**, not "the suite already seeds a user". No test mint is added: a cage-registering mint importable from `packages/*/src` would be `trustProfileId` under another name, and `packages/db/src/testing.ts` is re-exported from the package root | `respin/packages/credits/tests/{actions,isolation}.test.ts` |
| 11b | **Add `profileCaps` to `respinConfigV1` as `.default({free:1, creator:1, pro:1, studio:5})` (PRD §4G:125) and to `CONFIG_V1_SEED`.** Removing `createProfile` took this task with it while step 14, A-9's whole deploy-order apparatus and AC-14 still depend on the key existing — partial application, in the rewrite | `respin/packages/config/src/schema.ts`, `respin/packages/db/src/seed.ts` |
| 12 | `migrate-config` per A-9: parse-or-refuse, compare-and-set, append-never-update, no-op when present | `respin/packages/config/src/migrate-config.ts` |
| 12b | **Add the `workspace_paused` code and copy to `billing-errors.ts`, and replace `billing-ui.test.tsx:796`'s hand-typed `WorkspaceAccessError.name` with an enumeration over `@respin/db`'s app-importable error surface.** Moving `WorkspacePausedError` deletes its last mention in any suite — `facade-errors.test.ts` follows relative imports only, and `@respin/db`'s errors are enumerated by nobody — so without this the pause refusal renders as "Something went wrong", the outcome the move was justified by | `respin/app/(product)/billing-errors.ts`, `respin/tests/billing-ui.test.tsx` |
| 13 | P8 writer enumeration; P9 creator-data registry | `respin/tests/import-boundary.test.ts`, `respin/tests/creator-data-registry.test.ts` |
| 14 | Docker cases: the partial unique index; `cost_micro_usd` round-trip at `9007199254740993` on **real Postgres** | `respin/packages/db/tests/concurrency.docker.test.ts` |
| 15 | Record A-1..A-11 as **R-30**, including M2b's binding constraints: the operation-entry pause gate **and the zero-cost fact behind it**; `createProfile`'s home **and downgrade semantics** (Studio->Creator with 5 profiles needs a state column or a recorded reason it never will — a second migration on a table this plan lands, against its own "schema lands once" argument); one debit per `attempt_id`; the `workspace_spend_monthly` writer; **REQ-B02's per-field creator confirmation** (a round-1 BLOCK, deferred by A-10 and carried nowhere); and **R-29's seed-content assertion** for the first `frameworks` writer. Amend `PRD.md:118` for A-7's REQ-G08 narrowing | `docs/initial/decisions.md`, `docs/initial/PRD.md` |
| 16 | Ledger the red-then-green transition and every mutation output | `docs/progress/respin-m2/ledger.md` |

## Verification Steps

1. **Un-caged code.** `pnpm -C respin test -- profile-cage` -> every P1-P9 assertion fails. Record it.
2. **After task 4.** `db:check` clean; emitted SQL carries three both-NOT-NULL composite FKs, `frameworks` carved out with both CHECKs and `visibility NOT NULL`, an explicit `onDelete` on **every** FK including `frameworks`, the partial unique index, and `workspace_spend_monthly.workspace_id` as a **plain column with no FK**.
3. **After task 10.** `typecheck` and `lint` exit 0.
4. **After step 3, Docker up.** CI-shape suite green, no loud-skips.
5. **P4, cross-workspace axis** (mechanism verified against the installed PGlite 0.3.16 by three reviewers): `BEGIN; ALTER TABLE <t> DROP CONSTRAINT <fk>; INSERT cross-parented; assert composite=1, profile-only=2; ROLLBACK` — **for all three child tables**. Drop the `workspace_id` predicate from one accessor -> **red**.
6. **P4, same-workspace axis.** Two profiles P1, P2 in workspace A; each accessor on `scope.profile(P1)` returns only P1's; drop the **`profile_id`** predicate -> **red**.
7. **P4, write side.** A write on P1 carries only P1's ids and leaves P2's untouched. **Two mutations**: (a) capability takes its ids from params; (b) **spread order reversed to ids-first**, which makes the runtime strip load-bearing — without (b) the strip is inert and untested.
8. **P7, forgery — fifteen mutations, each planted separately, each red, each labelled with the tool that produces the red.**
   **compile-red:** `{...scope, profileId: other}` TS2741 · `scope.profileId = other` TS2540 · `class Evil extends ProfileScope` TS2675 · `new ProfileScope(...)` TS2673 · a non-literal carrying ids TS2345 · **a non-literal carrying `status:"active"`** TS2345 · a structural type alias in another module TS2345 · a value import of the scope from `app/**` TS1362 · `extends` it from `app/**` TS1362.
   **runtime-red via `cage.has()`:** `Object.assign({}, scope, {profileId: other})` · `{} as ProfileScope` · `new Proxy(scope, {get})`.
   **runtime-red via the MINT TOKEN:** `Reflect.construct(ProfileScope, [...])` · **`new (ProfileScope as any)(...)`** · a runtime subclass. Measured: `Reflect.construct` defaults `newTarget` to the target, so `new.target === ProfileScope` and a `new.target`-only guard **passes it** — the previous draft labelled this row `new.target` and the mutation was **green**. All three mint a cage-REGISTERED scope, so neither the `WeakSet` nor `#cage in x` sees them; only the token does.
   **lint/grep-red (P6 / the allowlist):** `raw as VerifiedProfileId` · a differently-named mint · a brand re-export — all three compile at **exit 0**, so labelling them compile-red would be red for the wrong reason.
9. **P8, writers — repo-wide, per shape.** For `brain_docs`, `onboarding_inputs`, `model_usage`, `creator_profiles`, `workspace_spend_monthly` (expected: the capabilities / none in M2a) and **`frameworks` (expected: `[]`)**: enumerate `insert`, `update`, `delete`, `onConflictDoUpdate` across `packages/**/src` and `app/**` in four shapes — direct table object, **aliased local (a two-pass scan: collect `const t = brainDocs` bindings, then check `insert(t)`)**, `schema.*`, and a raw `sql` template naming the table. **One planted mutation per shape per verb.**
10. **P9, creator-data registry.** Predicate: **every table created in this migration** — all **six**. An FK-based predicate yields five and excludes `workspace_spend_monthly`, the one table created *this round*, which deliberately outlives workspace deletion and would therefore have shipped a per-workspace spend series with no retention decision and no reviewer. Each table carries an export decision **and** a deletion decision **and** a reason; `workspace_spend_monthly`'s deletion decision states its financial-records basis and whether `workspace_id` is pseudonymised at deletion. Red when a seventh table is added without an entry.
11. **Pause.** `writeBrainDoc` refuses under `hasOpenPause` and succeeds otherwise; **`appendOnboardingInput` and `recordModelUsage` succeed while paused** (A-7's exemptions, as contrast cases). Drift fixture `{open pause_periods, mirror canceled}` makes an `isPausedSubscription` implementation **red**.
12. **A-3 escalation, plus a completeness scan.** `Object.assign({}, viewerScope, {role:"owner"})` passed to `assertOwner` throws `ScopeForgeryError`; a real owner scope passes; removing `assertScoped` -> **red**. **And a source scan** — every exported function in `packages/credits/src/**` whose signature names `WorkspaceScope` either calls `assertScoped` or is reachable only through one that does. There are **14** today (7 facade methods, 7 exported actions), all funnelling through `assertOwner`, so one insertion covers them — which is exactly why the scan is needed: a 15th entry in M2b that does *not* need owner would bypass the cage silently, and AC-13's "red when removed from any one entry" could never fire for it. Precedent: `actions.test.ts:1263`'s `takeWorkspaceLock` source scan.
13. **Config, three mutations.** Fixture: v1 = `CONFIG_V1_SEED`, v2 = customised `stripePriceMap` + `pack`. Assert the merge preserves **v2** byte-identically **and that the row count increased by exactly 1 and the v2 row is unchanged**. Red against: a v1-reading implementation · a `CONFIG_V1_SEED`-appending one · **an in-place UPDATE of v2** (which preserves values, is a no-op on re-run, and passes every other assertion). Plus: a non-parsing source is refused loudly; a concurrent `appendConfigVersion` makes the compare-and-set fail rather than revert it; a pre-change document parses without the step.
14. **Deploy order.** `respinConfigV1.omit({profileCaps:true}).strict()` — derived, not a second schema copy — fails to parse a document carrying the key.
15. **Offsets and hashing.** Round-trip a string with an emoji and a CRLF: content NFC/LF, sha over **normalised** bytes, UTF-16 offsets index correctly. Red under code-point offsets and under a raw-bytes hash.
16. **`cost_micro_usd` on real Postgres**, value `9007199254740993` — chosen because `2^53+2` is exactly representable as a double and would pass under `mode: "number"` vacuously.
17. **Module duplication.** Mint a scope, `vi.resetModules()`, re-import, and assert the scope still passes `cage.has()` — the `globalThis` key's reason for existing.

## Acceptance Criteria

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | **P1** — a foreign profile id throws `ProfileAccessError` | red when the mint's `workspace_id` predicate is dropped |
| AC-2 | **P2** — message byte-identical for foreign and nonexistent (`toBe`) | no enumeration oracle |
| AC-3 | **P3** — accessor keys, capability keys, breach-validator keys and arg-map keys agree, containing at least `{profile, brainDocs, activeBrainDocs, onboardingInputs, modelUsage}` and `{appendOnboardingInput, recordModelUsage, writeBrainDoc}` | the named minimum stops `{}==={}` passing while AC-4 loops zero times |
| AC-4 | **P4** — per accessor, both axes, reads non-vacuous, plus the write-side validator and **both** step-7 mutations | steps 5-7 |
| AC-5 | **P5** — a bare `string` where `VerifiedProfileId` is required is a type error | `// @ts-expect-error` |
| AC-6 | **P6** — no `trustProfileId`-shaped export, and no cage-registering mint importable from `packages/*/src` | import-boundary suite |
| AC-7 | **P7** — **fifteen** forgery mutations, each red, **each label matching the tool that produced it** | step 8 |
| AC-8 | **P8** — repo-wide enumeration, four verbs x four shapes x six tables, `frameworks` expecting zero writers, one planted mutation per shape per verb | step 9 |
| AC-9 | Concurrent insert of two `status='active'` rows for one `(profile_id, kind)` leaves one | real Postgres; red without the index |
| AC-10 | `db:check` clean; three both-NOT-NULL composite FKs; `frameworks` carved out; explicit `onDelete` **everywhere**; `workspace_spend_monthly.workspace_id` has **no FK** | step 2; red under a nullable half and under a mixed `frameworks` row in both directions |
| AC-11 | **No server-derived column is caller-settable** — `status`, `version`, `activatedAt`, `supersededAt`, and both ids are absent from every capability's input type, so a non-literal carrying any of them is TS2345. **`version` is `max+1` server-side, with a unique index on `(profile_id, kind, version)`** | red against a non-literal carrying each; red against a duplicate `version` | step 8's `status` mutation + step 7(b) |
| AC-12 | `writeBrainDoc` refuses under `hasOpenPause`; **`appendOnboardingInput` and `recordModelUsage` succeed**; the drift fixture makes `isPausedSubscription` red | step 11 |
| AC-13 | **`assertScoped` blocks the viewer→owner escalation** at `assertOwner`, and every `WorkspaceScope`-taking entry in `packages/credits` calls it | step 12; red when removed from any one entry |
| AC-14 | `migrate-config`: merges into max, appends exactly one row, leaves v2 unchanged, refuses a non-parsing source, compare-and-sets, no-ops on re-run | step 13; red against **all three** wrong-version implementations |
| AC-15 | `app/**` reaches the scopes as **types** but not as values and cannot `extends` them — **evidence is `tsc` (TS1362), not eslint**, which permits both. eslint carries the `writeCapabilities`/`VerifiedProfileId` denies and the new `packages/**` path denies | split fixtures, both harnesses |
| AC-16 | **P9** — six tables, each with an export and a deletion decision and a reason | step 10 |
| AC-17 | `cost_micro_usd` round-trips `9007199254740993` on real Postgres under `mode: "bigint"` | step 16 |
| AC-18 | `packages/credits`' suites stay green: `actions.test.ts` (REQ-A02 owner-only matrix), **`facade-errors.test.ts`** (whose AST walk loses a re-exported class), `isolation.test.ts` | tasks 8, 9, 11 |
| AC-19 | The `globalThis`-keyed cage survives module re-evaluation | step 17 |
| AC-20 | Every P1-P9 observed **red** first, output recorded, each mutation naming which cases went red | ledger |

## Least confident (one line)

**That `assertScoped` can be threaded through every `WorkspaceScope`-taking entry in `packages/credits` without a circular import** — `packages/credits` already depends on `@respin/db` so the direction is fine, but `assertOwner` and its callers sit deep in `stripe/actions.ts`, and if any of them is reached from a module `packages/db` transitively imports, the assertion has to move to the outermost entry instead; AC-13's "red when removed from any one entry" is what would expose a partial threading, and the fallback — assert once at each exported facade function rather than at `assertOwner` — must be **chosen and written down** if the deep placement does not hold.

## Out of Scope

`packages/auth/**`, `app/**` routes, `src/`, `cutdown/`. No profile-delete path, no seeding, no inference, no credit debit, **no `createProfile`** (A-11).

**`packages/credits` IS touched — owner-approved 2026-08-20** — in three bounded ways: the `hasOpenPause`/`WorkspacePausedError` move with re-exports (task 8), the `assertScoped` calls (task 9), and the `actions.test.ts` literal-scope repair (task 11).

## Completion Criteria (Definition of Done)

- Entry gate clean on the CI shape (`TEST_DATABASE_URL` set, both Docker suites live, no loud-skips), plus `db:check` and a keyless `build`.
- `migrate-config` run against a pre-change database.
- Critical-Path gates PASS: **brain tenancy** (primary) and **billing & credits** (this plan edits `packages/config`, `seed.ts`, `packages/credits`, and carries AC-14).
- `tech-spec.md` §2 and `decisions.md` R-30 updated together.
- AC-1 .. AC-20 met with named evidence.
