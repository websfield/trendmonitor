# Codebase review — finishing Respin (2026-08-26)

Prepared for `docs/plans/respin-finish-master-plan.md`. Two halves: **what is built** (measured first-hand this session) and **what remains** (mapped from `docs/initial/`).

---

## 1. The finding that shapes the plan

**Nothing built in M2b-1 is reachable from the product.** Not "uncalled" — *unreachable*, for two independent structural reasons:

1. **No product code can create a `creator_profile`.** `grep "insert(creatorProfiles)"` across `respin/packages/*/src` and `respin/app` returns nothing; the only writers are tests and the seed. Every brain capability is gated behind `ProfileScope`, which requires that row. `bootstrapInTx` creates user + workspace + membership and stops.
2. **`app/**` is denied `writeCapabilities` by the import boundary** — deliberately and correctly (`respin/eslint.config.mjs`: *"Deliberately ABSENT, so the default-deny refuses them: writeCapabilities, assertScoped, VerifiedProfileId"*). No page or action can call `writeBrainDoc` directly. The sanctioned seam is an **app-server facade**, the pattern `@respin/credits/app-server` already establishes. No such facade exists for profiles or the brain.

So the two ends were never joined by even a stub, and nothing ever forced the question *"how does a request reach this?"*

### The cost, measured

| | |
|---|---|
| Build-plan budget for M2 | **1–2 sessions** |
| Actual | **8 days**, 26 M2 ledger entries |
| Gate rounds | **11** |
| Blocks raised | **~80** |
| M2b-1 source shipped | 3,062 lines (`brain-content`, `echo`, `brain-reason`, `with-workspace`) |
| M2b-1 tests | 2,236 lines |
| Plan document | 52 tasks · 39 decisions · 82 ACs · 59 mutations · 489 lines |
| M2b-1 tasks landed | **16 of 47** (26 TODO · 5 PART) |
| Open register items | **19** (B-1…B-11, G-10…G-17) |
| **Onboarding / brain routes** | **0** |
| **Product callers of the brain surface** | **0** |

**Diagnosis.** Code with no consumer has no forcing function, so the only available feedback is review — and adversarial review of a large unconsumed substrate produces findings faster than anyone closes them, with no shipped behaviour to calibrate severity against. The prose-only gate round moved blocks **7 → 11** by the project's own record. G-11 (a trailing space defeats the quote budget) is genuinely serious *when a creator can paste a reference post*; today nobody can.

**Consequence for this plan: every slice ends in something a creator can walk through, and gates run against that.**

---

## 2. What is built and reusable

**Routes:** `(marketing)`, `(auth)/sign-{in,up}`, `(product)/settings/billing`, `(product)/usage`, `(product)/studio` *(stub)*, `(admin)/admin{,/config}`, `api/auth/[...all]`, `api/stripe/webhook`.

**`@respin/auth`** — Better Auth; `requireUser`, `requireAdmin`, `getSessionUser`. Per-page gating, rate-limited sign-in.

**`@respin/db`** — `withWorkspace` → `WorkspaceScope`; `ProfileScope.mint`; `writeCapabilities(scope)` → `appendOnboardingInput`, `recordModelUsage`, `writeBrainDoc`, `confirmBrainDocFields`, `activateBrainDoc`; accessors incl. `referenceCorpusAsOf`, `brainDocs`, `activeBrainDocs`, `onboardingInputs`. Brain content: per-kind Zod schemas, `claim()`/`serverOwned()`/`CHECK`, `enumerateClaimFields`, `readPointer`, `placeholderFields`. Reference-echo bar and quote budget in `echo.ts`. Migrations `0000`–`0012`.

**`@respin/credits`** — append-only ledger with derived balance, lot-allocation fold, expiry, pause, Stripe webhooks (idempotent on event id), `debitCredits`, `maybeAutoTopup`, billing state.

**`@respin/config`** — versioned DB config, admin-editable. Has `creditCosts` (nine keys incl. `onboardingBrainBuild`), `allowances`, `pack`, `graceDays`, `profileCaps` (1/1/1/5).

**Entry gate today:** `typecheck 0 · eslint 0 · db:check clean · 793 passed / 793, 41 files, zero skips` (CI shape, Docker live).

---

## 3. What is missing, in dependency order

| Missing | Needed by | Note |
|---|---|---|
| `createProfile` + cap enforcement | **everything** | The blocker. `profileCaps` exists as a value with no reader. Must `assertScoped`; archived profiles refused by reading `creator_profiles.state` **at operation time** |
| App-server facade for profile + brain | every brain slice | `app/**` cannot import `writeCapabilities` |
| `packages/llm` | M2b-2 → M2c → M3 | Adapter, `assemble.ts`, model-id-keyed price table. **The repo's first outbound HTTP client in `packages/**`** — pinned non-overridable `baseURL` |
| Config: `llm.model`, price table, model tiers, `creditCosts.onboardingBrainRebuild` | M2b-2 | All absent from `schema.ts`. The rebuild cost is **owner-undecided** and is a precondition of the config step, not of UI |
| `/onboarding` wizard | M2c | Interview → north-star → paste 5–10 own posts → optional 2–3 references → inference → review-and-confirm → activate |
| `/brain` editor, versions, export | M2c | Export helpers exist; screens do not |
| `frameworks` seeder + F1–F9 JSON | M2c | No writer exists for the table |
| `packages/modes` + `/api/generation` | M3 | 7 modes, kill test, `ScriptOutput` schema, streaming |
| Free-tier credit minting | M3 | DL-2/R-21 — until then a Free creator has no path to credits |
| `packages/trends`, `/trends`, `/api/spin` | M4 | Background-runner decision is due at **M4 entry** and must be recorded before planning it |
| `packages/brain`, `results`, `promotion_proposals` | M5 | **Sole** construction site for proposals |
| Marketing, admin surface, retention receiver | M6 | |

### A discrepancy to settle early

`tech-spec.md:36` specifies **`packages/brain`** as the home for brain types and versioning. M2b-1 put all of it in **`packages/db/src`**. M5 names `packages/brain` as the sole construction site for promotion proposals. Either create the package and move, or re-point the tech-spec bullet at `@respin/db` with a reason. **Cheap now, expensive at M5.**

---

## 4. Requirements already satisfied

**Fully:** REQ-G01 (tiers/Checkout/Portal), REQ-G02/G03/G04 (grant, pack, debit, expiry, auto-top-up cap, append-only ledger), REQ-G06 (idempotent webhooks), REQ-G07 (usage page), REQ-G08 (pause/resume), REQ-A03 (profile isolation — structural via the M2a cage).

**Partly:** REQ-A01 (workspace yes; **profile creation and caps no**) · REQ-B02 (server half only — the confirm *screen* is M2c) · REQ-C05 (versioning half) · REQ-A04 (export helpers, no screen) · REQ-D04/R-9 (echo bar + quote budget enforced; `frameworks` contributions have no writer) · REQ-G05 (config half; **margin dashboard is M6 and has no aggregation code**).

**Explicitly open despite the substrate:** **REQ-I03** — C-28 is a provenance-*shape* rule; it enforces *that* a claim is cited, never that the citation supports it (R-34).

---

## 5. Open register items — how this plan treats them

19 open (B-1…B-11, G-10…G-17). **None is reachable by a user, because there is no user path.** They are carried as a **backlog re-prioritised by reachability**, not as a gate on new work:

- **Becomes reachable the moment onboarding accepts a reference post:** G-10 (`[check]`-citable evidence), G-11 (trailing space mints a fresh quote budget), G-12 (`own_post` label switches both R-3 controls off). **These must close in the same slice that ships reference-post intake** — that is the slice where R-3 becomes a live promise.
- **Becomes reachable when a second seat exists:** B-2/G-13 (a viewer can write a brain document). Tenancy withdrew its acceptance of the deferral.
- **Becomes reachable at M2b-2:** G-14 (no test races two `writeBrainDoc` calls), G-17 (two advisory-lock keys, no recorded ordering — M2b-2 takes both in one transaction).
- **Honesty/record debt, no user impact:** B-5…B-9, G-15, G-16.

---

## 6. Process changes this plan adopts

1. **Slices, not substrate.** Every unit ends in a path a creator can walk. No package ships without a caller in the same slice.
2. **Gate shipped behaviour.** Critical-Path gates run on the slice, not on unconsumed primitives.
3. **Reviewers in isolated worktrees.** Four mutating reviewers on one tree produced a spurious BLOCK, two invalidated mutation runs, and a reviewer unable to distinguish a compliance outage from a dirty harness (R-34).
4. **Just-in-time phase plans.** The master plan lists slices; a slice gets its detailed phase plan when the previous one ships. Writing all of M2b-2→M6 now would be the 489-line specification again, one milestone up.
5. **Mutation matrices name their population.** A green matrix says nothing about a control that was never written (CLAUDE.md Lessons, 2026-08-26).
