# Phase 2 — `packages/llm`: the provider adapter

**Depends on:** **Phase 1** (the `model_usage` table, the cage, and the config data step).
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-B01 (the inference engine half), REQ-I03, REQ-J02.

> M2 is the first milestone that spends real model tokens. M1 built metering first, deliberately. This phase is where that intent is honoured or quietly broken.

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
8. **Scale caution to blast radius.** Pushing, publishing, sending anything outside the repo wait for explicit confirmation.
9. **Current facts beat trained memory.** Verify library APIs against the installed version (lockfile, type definitions, official docs) before use.

### Non-negotiable rules (Respin) — the ones this phase touches

- **2. The ledger is the balance.** `credit_ledger` is append-only, balance derived; debit in the generation's transaction (REQ-G04/G06, R-6).
- **6. No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point; engineering and evidence completion are separate claims (REQ-I03/I04).

### Lessons that touch this ground

- **2026-08-18 — prove a parser-dependent guard generatively** against the installed parser; a counterexample list fixes named instances and leaves the class open. **This phase's Zod boundary is exactly such a guard** — it must accept precisely what the installed Anthropic SDK can return.
- **2026-08-10 — present-and-verified is not present-and-unrun.** A stub adapter that is never driven by a real-shape payload proves nothing about the real one.
- **2026-07-21 — a dependency install is proven by importing the package**, never by the installer's exit code.
- **2026-07-30 — a comment claiming a property is not the property.** Assert it in a test or delete the claim.

### Stack and boundaries

- pnpm workspace (`pnpm -C respin ...`), TypeScript, **Zod at every boundary**.
- **Anthropic behind a `packages/llm` adapter** (R-5, tech-spec §1). `app/**` and `packages/brain` never import the Anthropic SDK — the eslint default-deny plus a sanctioned `@respin/llm/app-server` facade, exactly the shape `@respin/credits` already uses.
- `app/` imports `packages/`, never the reverse.
- **Default to the latest and most capable Claude models**; the model id is config, not a literal buried in code.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-billing-reviewer`, `respin-compliance-reviewer`, `respin-tenancy-reviewer`, `respin-learning-reviewer`, `code-reviewer`, `security-reviewer`.
**Do NOT request** any agent not present in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | A provider-agnostic `LlmAdapter` interface with one Anthropic implementation | R-5, tech-spec §1 |
| F2 | Structured output validated by Zod at the boundary; an unparseable response is a typed failure, never a partial object | tech-spec §11 |
| F3 | Every call records `prompt_bundle_version` (the assembled bundle hash) | REQ-J02, tech-spec §3 |
| F4 | Every call **persists one `model_usage` row** carrying `tokens_in`, `tokens_out`, `model`, cost (or `cost_state='unknown'`), `prompt_bundle_version` and `config_version` — on success **and** on failure, one row per **HTTP call** (so a bounded retry writes two) | D-M2-2, D-M2-13, PRD §5.4 margin |
| F5 | A **stub adapter** the test suite drives, so no suite calls the live API | AC-5 |
| F6 | Keyless refusal: with no API key the package refuses with a typed error and the build still succeeds | mirrors `isStripeConfigured()`'s keyless-build behaviour |
| F7 | **The first inference per profile is free; a rebuild is PRICED and debited** (D-M2-2/R-30). Attempts are counted as **distinct `attempt_id`s** in `model_usage`, never rows and never process memory. **Only a billable vendor response consumes an attempt** — a success or a schema-invalid 200. A **429, a 5xx, and any pre-response transport failure consume nothing** | D-M2-2, D-M2-2b; `PRD.md:135` for the first build's price |
| F9 | A rebuild calls `debitCredits` **in the same transaction** that writes its `model_usage` row (REQ-G04/G06). On Free, with no minting path until M3 (R-21), it is refused for insufficient balance with the top-up prompt | non-negotiable 2; D-M2-2 |
| F10 | **`structured()` refuses while `hasOpenPause` is true** (`WorkspacePausedError`), inside the package — not at the caller | D-M2-11 |
| F8 | `[check]` convention available to callers for unverified specifics | REQ-I03 |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | Model id, token ceilings, prices and the limit are **config, not code** (B5), and the **price table is keyed by model id** with a fail-closed lookup (D-M2-13) | added to `respinConfigV1`; phase 2 owns the `llm.*` keys, phase 1 owns `profileCaps` — one phase per key |
| T2 | No secret **and no prompt content** in code or logs (golden rule 2) | key from env only; the structured log's field set is an **allowlist**, asserted by AC-11 — the bundle carries the creator's posts and their brain, so "never includes prompt content" is a claim that needs a test, not a comment |
| T3 | Engineering vs evidence claims stay separate | the phase claims "the adapter works against a stub and a recorded real-shape fixture", not "inference is good" |
| T4 | Metering intent from M1 is honoured | F4 + F7. Round 1 failed this: "recorded" meant *returned on an object*, with no table to persist into and an AC that passed against an adapter which discarded the numbers. `debitCredits` rejects a zero cost (`ledger.ts:339`), so no ledger row exists either — `model_usage` is the only possible record |
| T5 | No invented specifics (REQ-I03) | AC-12: the adapter never fills a missing field with a plausible value — a partial object is a typed failure — and the `[check]` marker survives a round-trip through the boundary. Round 1 claimed this gate PASSed with no AC mentioning `[check]` or REQ-I03 anywhere |

## Edge Cases & Failure Paths

**Inverse events.** A model call has no teardown, but its *accounting* does: a call that fails after tokens were spent must still record the spend. Task 6 covers this — a `model_usage` row is written on both the success and the failure path.

**A failure row records `cost_state='unknown'`, never `0`.** For a timeout or transport failure there is no usage object, so a derived cost is unavailable; writing zero would understate spend in the direction that flatters the margin dashboard, which is the measurement dishonesty this project's own rules exist to stop. The row still records model, purpose, outcome and `config_version`, so the attempt is countable even when its cost is not.

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| API returns malformed JSON | Retry also returns malformed JSON | Typed `LlmSchemaError` after the bounded retry; **no partial object is ever returned**. The caller decides; the adapter never invents a field to fill a gap (REQ-I03). |
| API times out | Retry times out | Typed `LlmUnavailableError`. Onboarding (phase 5) surfaces "we could not read your posts just now" and keeps the creator's typed input — it never activates a brain from nothing. |
| Rate limit hit (429) | Creator retries | **The attempt is NOT consumed** — a 429 is a vendor refusal, not a billable build. Round 2's F7 ("any vendor response consumes it") would have let one rate-limit blip permanently cost a creator their brain build, while the same table promised a retry. |
| 5xx after the request was accepted | Retry also 5xx | **Not consumed.** Only a success or a schema-invalid 200 is billable. |
| Schema-invalid 200 | Creator retries | **The limit is consumed.** A schema error is a 200: the model ran and the vendor billed us. Round 1 grouped it with `LlmUnavailableError` as "limit not consumed", which — with the bounded retry making each attempt >=2 paid calls, at 0 credits, on Free — is an unbounded spend loop. Only pre-response transport failures are free. |

**Degraded mode.** Anthropic unavailable -> onboarding cannot infer. The degraded behaviour is **not** a fabricated brain and **not** an empty activated brain: the wizard holds the creator's submitted material, says plainly that inference is unavailable, and offers retry. A brain never activates without inference or explicit manual entry.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| `packages/llm` -> Anthropic API | 5xx / timeout | `LlmUnavailableError`; caller retains input; no brain activation | Creator retries; re-inference limit not consumed by an infrastructure failure | AC-3, AC-7 |
| `packages/llm` -> Anthropic API | 200 with schema-invalid body | Bounded retry, then `LlmSchemaError`; no partial object | None — nothing was written | AC-2 |
| `packages/llm` -> Anthropic API | 429 rate limit | Typed `LlmRateLimitError` surfaced as a retryable state | Retry | AC-3 |
| `packages/llm` -> env | No API key | `LlmNotConfiguredError`; **build still succeeds keyless** | Operator sets the key | AC-6 |

## Handoff Contracts

Consumed by phases 3 and 5:

    export type LlmCallResult<T> = {
      value: T;
      usageRowIds: string[];         // the PERSISTED model_usage rows, one per HTTP call
      promptBundleVersion: string;   // hash of the assembled bundle (REQ-J02)
      configVersion: number;         // REQUIRED, per D-M2-13 and the DebitParams precedent
      model: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;        // null <=> costState === "unknown"
      costState: "known" | "unknown";
    };

    export interface LlmAdapter {
      // Takes a ProfileScope, not a profile id: the usage row is profile-grained,
      // so writing it requires the cage (phase 1), which is why this phase depends
      // on phase 1 rather than running beside it.
      structured<T>(scope: ProfileScope, req: {
        bundle: AssembledBundle;
        schema: ZodType<T>;
        maxTokens: number;
        purpose: "onboarding_brain_build";   // widened by M3, never by a string literal
      }): Promise<LlmCallResult<T>>;
    }

    export class LlmLimitExhaustedError extends Error {}   // once per profile, PRD.md:135
    export class LlmPriceUnknownError extends Error {}     // D-M2-13 fail-closed lookup

    export class LlmNotConfiguredError extends Error {}
    export class LlmUnavailableError extends Error {}
    export class LlmRateLimitError extends Error {}
    export class LlmSchemaError extends Error {}

    // Sanctioned app surface only:  @respin/llm/app-server

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Record **D-M2-2** in `docs/initial/decisions.md` as R-30 before code (behaviour-by-absence is what R-28 exists to stop) | `respin-engineer` | `docs/initial/decisions.md` |
| 2 | Scaffold the package (workspace entry, tsconfig, vitest) and **prove the dep by importing it**, not by the install exit code | `respin-engineer` | `respin/packages/llm/package.json`, `respin/pnpm-workspace.yaml`, `respin/package.json` |
| 3 | `adapter.ts` — the interface, the typed error classes, `LlmCallResult` | `respin-engineer` | `respin/packages/llm/src/adapter.ts` |
| 4 | `anthropic.ts` — the implementation, verified against the **installed** `@anthropic-ai/sdk` types; lazy client; keyless refusal. **Document `ANTHROPIC_API_KEY` in `env.example` in the same task** — an env var the code requires and the example omits is the audit #11 quick-start failure in a new place | `respin-engineer` | `respin/packages/llm/src/anthropic.ts`, `respin/env.example` |
| 5 | `assemble.ts` — bundle assembly + the `prompt_bundle_version` hash (stable, content-addressed) | `respin-engineer` | `respin/packages/llm/src/assemble.ts` |
| 6 | Token/cost recording on **both** success and failure paths; pricing table in config, not code | `respin-engineer` | `respin/packages/llm/src/anthropic.ts`, `respin/packages/config/src/schema.ts` |
| 7 | Attempt counting from `model_usage` (distinct `attempt_id`), the free-first rule, and the **priced rebuild** debit in-transaction | `respin-engineer` | `respin/packages/llm/src/{limit.ts,pricing.ts}` |
| 7d | **Pause refusal inside `structured()`** using `hasOpenPause` (D-M2-11) | `respin-engineer` | `respin/packages/llm/src/anthropic.ts` |
| 7b | The **config data step** for the `llm.*` keys + the stored-pre-change-document parse test (D-M2-7b) | `respin-engineer` | `respin/packages/config/src/migrate-config.ts`, `respin/packages/config/tests/config.test.ts` |
| 7c | Model-keyed price table with a fail-closed lookup (`LlmPriceUnknownError`) | `respin-engineer` | `respin/packages/llm/src/pricing.ts`, `respin/packages/config/src/schema.ts` |
| 8 | Stub adapter for tests + a recorded real-shape response fixture | `respin-engineer` | `respin/packages/llm/src/testing.ts`, `respin/packages/llm/tests/fixtures/*` |
| 9 | `app-server.ts` facade + eslint default-deny for the `@respin/llm` root, mirroring `@respin/credits` | `respin-engineer` | `respin/packages/llm/src/app-server.ts`, `respin/eslint.config.mjs` |
| 10 | Package-private `internalOnly` registry + facade re-export test, mirroring `credits/tests/isolation.test.ts` | `respin-engineer` | `respin/packages/llm/tests/isolation.test.ts` |
| 11 | Structured-log **field allowlist** — no prompt content, no key, no creator text | `respin-engineer` | `respin/packages/llm/src/anthropic.ts`, `respin/packages/llm/tests/logging.test.ts` |
| 12 | `pnpm audit --audit-level high --prod` run **here**, where the new prod dependency lands, with no new `SECURITY-EXCEPTIONS.md` entries | `respin-engineer` | CI + `respin/SECURITY-EXCEPTIONS.md` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/packages/llm/package.json`, `tsconfig.json`, `vitest.config.ts` | New | Mirror `packages/credits` |
| `respin/packages/llm/src/{index,adapter,anthropic,assemble,limit,testing,app-server}.ts` | New | |
| `respin/packages/llm/tests/{adapter,anthropic,assemble,limit,isolation}.test.ts` | New | |
| `respin/packages/llm/tests/fixtures/*.json` | New | Recorded real-shape responses |
| `respin/packages/config/src/schema.ts` | Modified | `llm: { model, maxTokens, prices: Record<modelId, {inMicroUsdPerMTok, outMicroUsdPerMTok}>, inferencesIncludedPerProfile }` — **a map keyed by model id** (D-M2-13), all keys `.default(...)` per D-M2-7b. Round 2's Files table still specified the two loose scalars D-M2-13 exists to forbid, so an implementer working the table would have shipped the round-1 defect |
| `respin/packages/db/src/seed.ts` | Modified | `CONFIG_V1_SEED.llm` |
| `respin/eslint.config.mjs` | Modified | `@respin/llm` deny + `@respin/llm/app-server` grant |
| `respin/env.example` | Modified | `ANTHROPIC_API_KEY` documented |
| `docs/initial/decisions.md` | Modified | R-30 (D-M2-2) |

## Migration Steps

**No SCHEMA migration** — `model_usage` lands in phase 1's `0011_*`, which is why this phase depends on phase 1. Round 1 said "adds no entity" while planning a per-profile counter and per-call token records, which is a contradiction in either direction: persisted, it is a profile-grained table outside the cage's stop condition; not persisted, a "limit per profile" in process memory limits nothing across a restart and F4's "records" collapses to "returns".

**The config keys are `.default(...)` (D-M2-7b, revised).** `respinConfigV1` gains `llm.*`, and because every added key carries a default, a pre-change stored document **parses unchanged** — there is no window between code shipping and a data step running. Round 2 made the step a *gate*, which opened exactly such a window at each of three phases, and during it `/admin/config` is down too (it reads the same config), so the operator has no self-serve repair. `migrate-config` remains as **cleanup**: it reads the raw stored jsonb and merges only the added keys.

For reference, the hazard the defaults route removes:

1. Append a new config version via `appendConfigVersion` for any database already holding one. `seedDb` inserts **only when `config_versions` is empty**, so `db:seed` cannot repair an existing database.
2. Add a test that parses a **stored pre-change document** — not `CONFIG_V1_SEED`. The existing parity test drives from the in-memory constant and would pass trivially while every seeded database is broken.
3. Blast radius: `getActiveConfig(tx)` throws `ConfigUnavailableError` at **five** sites inside the single-transaction Stripe webhook dispatch (`webhooks.ts:588,786,1082,1197,1283` — verified; "six" was propagated unchecked). The `stripe_events` row rolls back and Stripe retries with backoff for roughly three days, then **disables the endpoint** — so the grant is eventually *lost*, not merely delayed.

`llm.prices` is a **map keyed by model id**, not two loose scalars: an admin changing `llm.model` from `/admin/config` (the deploy-free path D-M1-2 exists to enable) must not silently invalidate every recorded cost. A model with no price row raises `LlmPriceUnknownError`.

**Costs are integer micro-USD** (`cost_micro_usd bigint`), matching the repo's money precedent (`credit_ledger.amountCents`, `autoTopupMonthlyCapCents`). A float on the one table REQ-G05's margin dashboard sums across millions of rows is an accumulation-error hazard. A `usage_raw jsonb` column carries the vendor's own usage object verbatim, so DL-7's cache-token components in M3 need no migration.

## Verification Steps

1. **State: after task 2.** `node -e "require('@anthropic-ai/sdk')"` (or the ESM equivalent) resolves — the dependency is proven by import, not by the installer's exit code.
2. **State: after task 4.** `pnpm -C respin typecheck` -> exit 0, with the adapter typed against the **installed** SDK types (not from memory).
3. **State: after step 2.** `pnpm -C respin test -- packages/llm` -> green, driven entirely by the stub and the recorded fixtures; **no test performs a live API call**.
4. **State: after step 3.** Unset `ANTHROPIC_API_KEY` and run `pnpm -C respin build` -> exit 0 (keyless build), and the adapter's first call raises `LlmNotConfiguredError`.
5. **State: after step 4.** Mutation check — remove the Zod parse from `structured()` and re-run: the malformed-body case (AC-2) must go red.
6. **State: after step 5.** Mutation check — move the re-inference limit check to *after* the network call and re-run: AC-7's "refused without a network call" assertion must go red.
7. **State: after task 7b.** Restore a database seeded before this change, run the config data step, confirm `getActiveConfig` parses; without the step, confirm it throws. **AC-13.**
8. **State: after task 11.** Plant a prompt echo in the structured log and confirm the allowlist assertion goes **red**. Restore. **AC-11.**
9. **State: after task 7.** Run one inference for a profile, rebuild the adapter from scratch, run a second: refused with `LlmLimitExhaustedError`. Replace the `model_usage` count with an in-memory counter: **AC-7b goes red**. Restore.
10. **State: after step 9.** Full entry gate: `pnpm -C respin typecheck && lint && test && build`, then the CI-shape suite with `TEST_DATABASE_URL` set, then `pnpm audit --audit-level high --prod` with no new baseline entries.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | **A `model_usage` row is queryable after every call** — success and failure — carrying model, tokens, cost or `cost_state='unknown'`, `prompt_bundle_version` and `config_version` | test `every call leaves a queryable usage row`, **red when the write is removed**. *Round 1's AC asserted the returned object carried the fields, which passes against an adapter that returns them and throws them away* |
| AC-2 | A schema-invalid body yields `LlmSchemaError` after a bounded retry and **never** a partial object | test `a malformed body is a typed failure, never a half-filled object`; red without the Zod parse (step 5) |
| AC-3 | Timeout, 5xx, and 429 each map to their named typed error | test `each transport failure maps to its own typed error` |
| AC-4 | `prompt_bundle_version` is stable for identical bundles and differs for any changed input | test `the bundle hash is content-addressed` |
| AC-5 | **No test in the repo performs a live Anthropic call** | source-scan assertion in `respin/packages/llm/tests/isolation.test.ts`, proven red against a planted live call |
| AC-6 | With no API key: `pnpm -C respin build` exits 0, and a call raises `LlmNotConfiguredError` | Verification step 4 |
| AC-7 | The limit refuses **before** any network call is attempted | transport-spy test; red when the check is moved after the call (step 6) |
| AC-7b | **Attempts count to N and survive a process boundary** — the first inference is free, the second is **priced and debited**, and the count still holds after the adapter is rebuilt from scratch (proving it comes from `model_usage`, not memory) | `limit.test.ts`; **red under an in-memory counter** |
| AC-7c | **Only billable responses consume an attempt.** Four cases, each asserted: success -> consumed; schema-invalid 200 -> consumed; **429 -> not consumed**; **5xx / transport -> not consumed** | `limit.test.ts`; red when 429 is grouped with success |
| AC-7d | **A retried call writes two `model_usage` rows sharing one `attempt_id`**, and counts as **one** attempt | red when the count uses rows instead of distinct `attempt_id` — the defect that appears the moment `inferencesIncludedPerProfile` moves off 1 |
| AC-15 | **A rebuild debits in the same transaction as its usage row**; if the debit fails, no usage row and no inference result persist | `pricing.test.ts`, red when the debit is moved outside the transaction |
| AC-16 | **On Free with a zero balance, a rebuild is refused for insufficient balance** with the top-up prompt — the honest R-21 consequence. This is the audit's deferred **E9** (debit-refused) evidence row, now discharged | `pricing.test.ts` |
| AC-17 | **`structured()` refuses while `hasOpenPause` is true**, inside the package, and an unpaused call succeeds (non-vacuity). The fixture includes the **drift state** `{open pause_periods, mirror canceled}`, so the wrong predicate goes red | `pause.test.ts`; red under `isPausedSubscription` |
| AC-8 | Model id, token ceilings, prices and the limit all read from `respinConfigV1`; the price table is **keyed by model** and an unpriced active model raises `LlmPriceUnknownError` | config parity test; grep shows no model-id or price literal in `packages/**/src`; fail-closed lookup test |
| AC-9 | `app/**` cannot import `@respin/llm` root or the Anthropic SDK | eslint rule + import-boundary suite, red against a planted import |
| AC-10 | **R-30 exists in `docs/initial/decisions.md` and has been re-read after writing** | the file itself (2026-08-18 lesson: recording a thing and reporting it recorded are different acts) |
| AC-11 | The structured log's field set is an **allowlist** — no prompt content, no creator text, no key | `logging.test.ts`, **red against a planted prompt echo** |
| AC-12 | **REQ-I03:** a response missing a required field is a typed failure, never filled with a plausible value; a `[check]` marker in a model response survives the boundary unaltered | `adapter.test.ts`, red against a planted defaulting branch. *Round 1 claimed this gate PASSed with no AC mentioning `[check]`, REQ-I03, or invented specifics anywhere in the phase* |
| AC-13 | **A config document stored before this change still parses after it** (D-M2-7b) | pre-change-document parse test |
| AC-14 | A retried call writes **two** `model_usage` rows, one per HTTP call | `anthropic.test.ts` retry case |

## Least confident (one line)

**The installed `@anthropic-ai/sdk`'s structured-output and usage surface — and the cost model derived from it** (widened after the round-1 gate, which pointed out the line named shape only while the two-scalar price rides on the same surface): if usage reports cache-creation and cache-read components separately — which DL-7's prompt caching will make live in M3 — a cost derived from two token counts is silently wrong, so the price map must be able to grow components without a schema break; AC-1's recorded real-shape fixture is what would expose a wrong guess, and the model-keyed price table (D-M2-13) is what keeps a wrong guess from being a silent one.

## Out of Scope (Surgical Changes)

Do not touch `packages/credits/**` beyond reading its facade pattern; do not add a credit debit here (D-M2-2 prices onboarding at 0 — the debit call site is M3's). Do not implement streaming (M3). Do not implement prompt caching (DL-7) — and when it arrives, its cache key is `(profileId, bundleHash)` or responses are never cached across profiles, because `prompt_bundle_version` is a content hash and a cache keyed on it alone would serve one profile's completion to another. Do not add a schema migration here (phase 1 owns `0011`). Do not build a link resolver (phase 5, D-M2-9). Do not touch `src/` or `cutdown/`.

## Completion Criteria (Definition of Done)

- Entry gate clean, including the keyless build.
- Applicable Critical-Path gates PASS: **billing & credits** (metering, persisted usage, the once-per-profile limit, the config data step, model-keyed pricing), **spin compliance** (REQ-I03, AC-12), and **brain tenancy** (`model_usage` is profile-grained, so it is written through the cage).
- `decisions.md` R-30 recorded and re-read; `tech-spec.md` §1's adapter line still accurate.
- AC-1 .. AC-17 met with named evidence.
