# Codebase review — the nine unbuilt slices (2b, 4, 5, 6, 7, 8, 9, 10a, 10b)

**Date:** 2026-08-29. **Prepared for:** the nine phase cards `docs/plans/respin-finish-phase-{2b,4,5,6,7,8,9,10a,10b}.md`.
**Method:** six parallel read-only sweeps of `respin/` plus direct reads of the doc set. Every claim below carries a `file:line` verified this session. Where it contradicts an existing document, the contradiction is stated rather than smoothed.

**Working-tree note.** `git ls-files` is stale relative to the working tree — slice 1/2a/3's output (`app/(product)/{brain,onboarding}/**`, `packages/llm/**`, `packages/db/src/brain-ops.ts`, migrations `0013`–`0016`) is untracked. Everything here is read from the **working tree**. `pnpm -C respin typecheck` passes clean on it.

---

## 1. Nine corrections — things the plan set said that are not true

These are ordered by how much they change a card.

### 1.1 Slice 2b's premise conflates two different numbers

`respin-finish-master-plan.md` says slice 2b is *"see this month's burn on `/usage` computed from the rollup"*. Not buildable as written:

- `workspace_spend_monthly.cost_micro_usd` is **our model spend in micro-USD** (`onboarding-schema.ts:240-242`), and its own docblock calls it "the margin history" (`:210-216`). REQ-G07's "burn by mode" is **credits**, which is what a creator spends.
- Its unique grain is `(workspace_id, period_month, tier)` (`onboarding-schema.ts:250-254`). **There is no `purpose` column**, so no per-mode breakdown is derivable from it at all.

The card splits it: the creator's credit burn comes from `credit_ledger`; the rollup gets a minimal `/admin/margin` reader so it is not written-and-unread. Widening the rollup's grain is rejected in the card with a reason.

### 1.2 There is no role × capability instrument, and the register cites the wrong lines

`respin-finish-open-items.md`'s task-41 row cites `packages/db/tests/profile-scope.test.ts:1245-1252` as "the unclassified instrument … over columns, not role × capability". **Those lines are the A-8 Unicode normalisation test.** The real column-level instruments are `:1489-1502` (`brain_docs`) and `:1552-1564` (`creator_profiles`).

The honest statement is stronger than the register's: **there is no role × capability matrix, map, `can()` helper, or coverage instrument anywhere in the repo.** `editor` is functionally identical to `owner` for every profile and brain capability; only `assertOwner` (billing, `stripe/actions.ts:262`) distinguishes them.

### 1.3 `REFERENCE_BARRED_KINDS` has one definition, not two

One definition at `with-workspace.ts:2052` (`= {"voice"}`), one read site at `:2124`. The slice-4 stub's "report both" assumed two. Correcting it matters because widening the set is a one-line change, not a two-site reconciliation.

### 1.4 A test is currently red, and it is the default-deny gate suite

`tests/gate-completeness.test.ts:626` fails on `app/(marketing)/for/[audience]/page.tsx` — an entrypoint from the concurrent marketing stream with no `PUBLIC_ENTRYPOINTS` entry. Reproduced independently this session; it is the same failure the slice-3 ledger reports as "1264 of 1265". **It should be fixed now, not carried to slice 10a.** A default-deny suite that is habitually red is a suite nobody reads.

**Closed 2026-08-30:** `(marketing)/for/[audience]/page.tsx` is now explicitly classified in `PUBLIC_ENTRYPOINTS` with its public-marketing reason; the focused gate-completeness suite passes all 35 tests.

### 1.5 Two instruments look alike and behave oppositely

This asymmetry governs four cards and is not written down anywhere:

| Instrument | New table | New capability |
|---|---|---|
| `tests/creator-data-registry.test.ts:151-159` | **auto-detects** — scans every migration's `CREATE TABLE`, fails without an export + deletion decision (reasons > 40 chars) | n/a |
| `tests/table-writers.test.ts:27-34` | **manual** — a table absent from `TABLES` is simply unpoliced, and nothing fails | n/a |
| `packages/db/tests/profile-scope.test.ts:519-555` | n/a | **auto-detects** — key agreement across accessors, validators, args and capabilities |

Slices 6, 7, 8 and 9 each add tables. Each card names the manual registration as a requirement for exactly this reason.

### 1.6 `model_usage` has no unique index on `attempt_id` — deliberately

Verified: `0011_first_rage.sql:59-77` and `:105`; the FK is the only constraint. *"A bounded retry writes two rows"* (`onboarding-schema.ts:147-149`), counted as `countDistinct(attemptId)`. The at-most-one-debit guarantee lives on `credit_ledger` instead — `credit_ledger_inference_debit_uq`, partial unique on `(ref_type, ref_id) WHERE ref_type = 'inference'` (`billing-schema.ts:196-219`). This is why slice 2b's rollup cannot key on `attempt_id` without understating cost.

### 1.7 The Free tier genuinely has no credit path

The only `grantCredits` call site is `webhooks.ts:1140-1149`, guarded at `:1096-1103` to **throw** for any tier that is not `creator`/`pro`/`studio`. `allowances.free = 25` exists in the schema and the seed and **is read by nothing**. A Free workspace's balance is permanently zero unless it buys a pack. Slice 6's acceptance walk is unwalkable until this changes.

### 1.8 Three dependencies slice 8 needs are absent, and only one of them is the runner

- **No scheduler of any kind** — no `inngest`, `bullmq`, `pg-boss`, `agenda`, `node-cron`, `trigger.dev`, no `vercel.json`, no cron config, in any `package.json`.
- **No YouTube credentials** — `env.example` has no `YOUTUBE_*` or `GOOGLE_API_KEY`; the only Google entry is commented-out OAuth sign-in.
- **No email sender** — Resend is in `tech-spec.md` §1 and is not installed; there is no `RESEND_*` variable.

### 1.9 There is no observability at all

No Sentry, no PostHog, no OpenTelemetry, no logging library, no `instrumentation.ts`, and **no observability variable in `env.example`** (which documents exactly ten). Everything is `console.*`. The one metrics module (`packages/credits/src/metrics.ts`) is deliberately package-internal, pinned by `isolation.test.ts:373-376` so `app/**` cannot emit or redirect money-path telemetry — a property to preserve.

---

## 2. What is built, per slice's starting point

**Packages (5):** `auth`, `config`, `credits`, `db`, `llm`. **Absent:** `modes`, `trends`, `brain`.
**Migrations:** `0000`–`0016`; the next is `0017`.
**Routes:** `(marketing)/` + `/for/[audience]`, `(auth)/sign-{in,up}`, `(product)/{onboarding,brain,studio,usage,settings/billing}`, `(admin)/admin{,/config}`, `api/auth/[...all]`, `api/stripe/webhook`.
**UI primitives (7):** `Badge`, `Banner`, `Button`/`buttonClass`, `Field`, `LedgerTable`, `Meter`, `Panel`. `DESIGN.md:43-58` specs a dozen more that do not exist, including the mode picker, the `[check]` token, THE TURN block and the timecode rail — all of which slices 6–8 need.

**Slice 2b starts from:** `workspace_spend_monthly` complete since `0011` with **zero writers** (`table-writers.test.ts:315-317` pins the empty set deliberately); `recordUsage` already opening its own transaction (`inference.ts:713-734`); `/usage` reading `credit_ledger` only and explicitly refusing to do arithmetic on the page (`usage-view.tsx:5-9`). **No `onConflictDoUpdate` exists anywhere in product code** — the rollup would be the first, and the writer scanner already knows the verb (`table-writers.test.ts:349-375`).

**Slice 4 starts from:** the R-3 machinery **fully built and completely dormant**. `referenceCorpusAsOf` returns `[]` on every profile because nothing produces `reference` rows, so `assertNoReferenceEcho` short-circuits at `echo.ts:379` on **every write the product has ever made**; `retainedReferenceSpans` returns `[]` (`with-workspace.ts:2193`); `assertReferenceQuoteBudget` runs only on the write path (`:1568`) over an always-empty list; `findReferenceEchoes` — the never-throw export twin — has **no production caller**. `source_url` and the `creator_authored` input class both exist and are written by nothing.

**Slice 5 starts from:** **no export whatsoever.** `exportBrain`, `export.ts`, `toMarkdown`, `Content-Disposition`, `application/zip` — zero hits across `packages/*/src`, `app/**`, `lib/**`. No markdown renderer of any kind. The absence is already acknowledged in product copy at `brain-view.tsx:313-321`. Also: **no read path for a superseded version** — `readVoiceBrain` returns the newest `proposed` and the newest `active` only (`brain-ops.ts:156-158`). The `creator_edit` reason code exists and has no caller (`brain-reason.ts:51`). `confirmationSha256` **already covers `(content, sourceEvidence)`** after R-45, whose docblock names slice 5 as the reason it was fixed early.

**Slice 6 starts from:** no `generations` table, no lineage column, no feedback table, no `packages/modes`, no kill-test executor, no similarity gate, no tier→feature mechanism. `priceOf` is hard-coded to the onboarding pair (`inference.ts:631-638`) and `requiredConfigPaths` with it (`:244-252`). `creditCosts` names eight operations with **no readers**. The `runInference` facade door was **deliberately deleted** (`app-server.ts:230-238`) so `app/**` cannot reach a model with an arbitrary prompt — slice 6 adds a composed operation with its own cage, the way `inferVoice` did.

**Slice 8 starts from:** nothing. No `packages/trends`, no `TrendSource` symbol, no ingest, no autopsy, no spin, no similarity gate, no trend tables. `@respin/trends` is **already pre-registered as a denied import** at `tests/import-boundary.test.ts:862` — a guard written before its subject exists, and the precedent slice 7's card reuses.

**Slice 9 starts from:** `performance_meta`'s content schema **deliberately empty and saying so** (`brain-content.ts:315-327`: *"Its real shape is M5's to declare"*), not in `WRITABLE_BRAIN_KINDS` (`:428-432`), with `KindNotYetWritableError`'s copy carrying the minimum-n rule (`:434-441`, pinned by `brain-content.test.ts:369-372`). **No minimum-n constant exists anywhere.** No results table, no proposals table, no `packages/brain`. `Meter`'s `baseline` tick is wired to nothing.

**Slice 10a starts from:** a landing demo that is hardcoded copy and says so (`(marketing)/page.tsx:5-7`); `tests/landing-pricing.test.ts` pinning prices, allowances and profile caps to `CONFIG_V1_SEED` and banning digits in mechanic tags; **no application-level rate limiting** (the only limiter is Better Auth's, on its own endpoints, keyed on plaintext client IP).

**Slice 10b starts from:** three roles and three gates (`assertMayWrite`, `assertMayDecide`, `assertOwner`) with no matrix; `memberships` **absent from the writer-set instrument**; no invite flow, no seat column, no seat config; `tests/retention.test.ts` covering **only** `stripe_events.payload` with an `ALLOWED` map of two files, and **nothing at all** asserted about `rate_limit.key` or `session.ip_address`; no deletion executor, no retention receiver, no margin aggregation, no admin audit log.

---

## 3. Two design problems the cards had to solve, recorded because they recur

**Both are the same problem: a brain document must cite an `onboarding_inputs` row, and some writes have no post behind them.** `brain_docs.source_evidence` is `NOT NULL` with a non-empty CHECK (`brain-schema.ts:288-291`), and every entry is `{field, quote, inputId, startUtf16, endUtf16}` validated verbatim at its offsets.

- **Slice 5 (a creator edits a field):** the edit stores the creator's typed text as a **`creator_authored`** input — the third enum value, present since `0011` and written by nothing — and cites it. The warrant becomes *"you told us so, on this date"*, which is honest, and the verbatim check passes by construction.
- **Slice 9 (a promotion is accepted):** `creator_authored` would be a **false label** — the text is product-written from result rows. So a fourth input class, `result_summary`, holding the evidence statement. The card records the two rejected alternatives and why.

Both reuse the same mechanism rather than relaxing the CHECK, which is the option that removes a control from a governed column at the moment it starts carrying claims.

---

## 4. Constraints every card inherits

1. **The import boundary is default-deny for packages that do not exist yet** (`eslint.config.mjs:267-283`), with a measured gitignore-semantics trap at `:249-262`: negate the package **root** as well as the deep entrypoint, or the negation is inert. Slices 6, 8 and 9 each add a package.
2. **`packages/db` cannot import `@respin/credits`**, so anything needing the resolved tier lives in `credits` — the `createProfile` (R-35) and `runInference` (R-37) split.
3. **Config keys must be `.default(...)`, never required** (`schema.ts:102-109`): `.strict()` makes an unknown stored key a parse failure, and `getActiveConfig` runs five times inside the Stripe webhook's single transaction. Deploy code first, then `config:migrate`. A key that **prices a debit** additionally goes on `requiredConfigPaths` so it fails closed.
4. **Schema migrations migrate-then-deploy; config migrations deploy-then-migrate** (R-36).
5. **Reviewers run in isolated worktrees** (R-34) — four mutating reviewers on one tree produced a spurious BLOCK and two invalidated mutation runs.
6. **A mutation matrix names its population.** The 2026-08-26 record: 24 planted by the author all red, then six of ten reviewer-planted mutations surviving. Every card carries a population note naming the requirements with no control.

---

## 5. Scope note on this review

These nine cards were written **all at once, at the user's request**, which is a deliberate departure from `respin-finish-master-plan.md`'s just-in-time rule. What that rule protects against is real and is recorded in the master plan's own progress section — a 489-line specification that got reviewed instead of built. The mitigation, and its honest limit, is stated in the master plan's updated Progress-tracking section rather than here.

Full open-item disposition: [`respin-finish-open-items.md`](respin-finish-open-items.md).
The earlier review this one extends: [`respin-finish-codebase-review.md`](respin-finish-codebase-review.md).
