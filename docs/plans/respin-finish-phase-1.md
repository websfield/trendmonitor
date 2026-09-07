# Slice 1: Profile + intake

## A creator can…
**Create a creator profile and paste their own past posts, and see them listed back.**

That sentence is the acceptance test. Walk it in a browser or the slice is not done.

## Why this is first
Nothing in product code can create a `creator_profile`, and every brain capability is gated behind `ProfileScope`, which needs that row. Until this ships, the 3,062 lines of M2b-1 are unreachable in principle. This slice also builds the **app-server facade** every later brain slice goes through.

**No LLM.** Deliberately — this slice proves the seam, not the intelligence.

## Open items closing here
R-30.2 · R-30.3 · R-30.11 · brain-surface tasks 24, 25, 26, 46.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — do not restate them here.

## Prerequisites
- [x] M2a cage, migrations `0000`–`0012`
- [x] `appendOnboardingInput`, `profileCaps` in config
- [ ] Entry gate green before starting
- [ ] **Owner decision (precondition of task 1 only, not of the slice): does `creator_profiles` get a `state` column?** Default in the decision queue is yes. Tasks 3–8 do not depend on the answer

### The layering constraint, because it is not negotiable and it is easy to miss
`decisions.md` R-30 constraint 2: **`createProfile` does not live in `packages/db`.** It needs the
per-tier cap (config) *and* the resolved tier, whose sole authority is `@respin/credits`. `@respin/db`
depends on neither and cannot: `@respin/credits` already depends on `@respin/db`. Re-deriving the tier
in `packages/db` would create a second tier authority — the defect class behind two M1 round-6
findings — and would grant Studio's five profiles to an `incomplete` subscription that never
collected a cent.

---

## Requirements

Requirements are **invariants plus their proof**. Where a mechanism is named it is because a
recorded decision names it; everything else is the developer's call.

### Profile creation
- [ ] **R1:** A profile can be created only through a capability that has passed `assertScoped`, and the caller supplies **only** a display name — `workspace_id` is server-derived from the scope and inexpressible by the caller. Proved by a forgery fixture (`Object.assign({}, viewerScope, {role:"owner"})`) and by an `as unknown as` smuggle of a `workspaceId`.
- [ ] **R2:** The cap is the **active config document's** `profileCaps` for the workspace's **resolved tier**, read from the one tier authority. Refusal is a typed error naming the tier and the cap. Proved by a test that changes the stored config document and sees the cap move, and by a mutation that hardcodes `1`.
- [ ] **R3:** The cap cannot be crossed by two concurrent calls. Proved on real Postgres with two connections at the cap boundary: exactly one profile exists afterwards. *(The mechanism is yours. R-30 constraint 2's sibling defect list and `respin-m2b2-metered-inference-scope.md` both note this is a SELECT-then-INSERT race today.)*
- [ ] **R4:** Two lifecycle questions are **decided and recorded**, either way: whether an open pause refuses profile creation (it is not obviously an entitlement spend), and — if the `state` column lands — whether reactivation is capped (archive-then-reactivate is otherwise an unbounded route back over the cap). Leaving either unclassified is the failure; choosing is not.

### The seam
- [ ] **R5:** `app/**` reaches this capability through the **`@respin/db` package root** — `eslint.config.mjs:157-159` already denies the group `@respin/db/*`, so a new deep entrypoint is not available. Whatever is exposed, `writeCapabilities`, `assertScoped` and the scope mints stay unreachable from `app/**`, proved by a deny fixture in `tests/import-boundary.test.ts` that goes red if the allowlist is widened.
- [ ] **R6:** A **new** `@respin/*` package is refused from `app/**` by default, not permitted by omission. Today the app restriction names each package individually, so `@respin/llm` (slice 2) would land outside it. Proved by a deny fixture for an unnamed package **and** an allow fixture for each sanctioned one. *(Brain-surface task 25.)*
- [ ] **R7:** Two existing completeness instruments cover the new surface rather than going stale around it: every new `packages/db` error class has app-facing copy and an `allowImportNames` entry (proved by the facade-completeness guard, not by inspection), and the cage's scope-taking scan covers the new entry. R-30's Revisit line predicts the second fails deliberately here; repairing it is part of this slice, not a surprise during it. *(Tasks 24, 26, 46.)*

### Intake
- [ ] **R8:** `/onboarding` — signed in, no profile yet → a display-name form. With a profile → the paste step.
- [ ] **R9:** A pasted post reaches storage through the **existing** write path, so NFC/LF normalisation and the content sha happen exactly once and in one place. Do not re-implement either.
- [ ] **R10:** Pasted posts list back, newest first, with their character count, scoped to the signed-in workspace. Cross-workspace isolation on the list is a test, not a claim. Empty state says what to do, not "no data".
- [ ] **R11:** `input_class` is **not** a user-facing choice in this slice — `own_post` only. References are slice 4, where G-12 (`own_post` switches both R-3 controls off) closes with them.

### Honesty
- [ ] **R12:** No page claims a brain will be built, a script generated, or a credit spent. This slice does none of those. **(Third clause superseded for `/onboarding` by slice 2a's R18 — see `decisions.md` R-38. The screen now spends a credit and must say so before it does; the first two clauses stand unchanged and are still scanned.)**

---

## Left to the developer

Named so the flexibility is real rather than accidental. None of these is a plan decision:

- **Where `createProfile` lives inside the layer that can see config and billing.** R-30 rules out `packages/db`; it does not say which module of `@respin/credits` (or a new thin layer above both) owns it.
- **The concurrency mechanism for R3** — partial unique index, workspace advisory lock at entry, or something else that survives the two-connection test.
- **The facade's shape** — extending `respinDb`, a second exported object, or per-operation functions. R5 constrains the *door*, not the furniture.
- **The `/onboarding` route's component structure**, form library (or none), and whether the paste step is a separate route or a state of one.
- **Test file layout and naming**, and whether the Docker race lives in an existing `*.docker.test.ts` or a new one.
- **The error type hierarchy** for cap refusals — one class or several.

---

## Tasks
1. [ ] `state` column decision → migration `0013` if taken (Prerequisites)
2. [ ] `createProfile` + its typed refusal, in the layer R-30 constraint 2 names; app copy + `allowImportNames`
3. [ ] Cap enforcement + the concurrency guard (R2, R3)
4. [ ] The app-server seam (R5) + the import-boundary deny fixtures (R5, R6)
5. [ ] Cage-scan repair (R7)
6. [ ] `/onboarding` route: profile form → paste form → list
7. [ ] Tests: cap refusal, cross-workspace isolation on the list, paste round-trip, the two-connection race
8. [ ] Walk it in a browser; record what a real paste of 5 posts actually feels like

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/credits/src/**` | Modify | `createProfile` (the layer that sees config + tier) |
| `respin/packages/db/src/with-workspace.ts` | Modify | The profile-insert capability it calls |
| `respin/packages/db/src/errors.ts` | Modify | The cap refusal |
| `respin/packages/db/src/app-server.ts` | Modify | The sanctioned surface |
| `respin/packages/db/migrations/0013_*.sql` | Create | `creator_profiles.state`, if the decision takes it |
| `respin/eslint.config.mjs` | Modify | Allowlist entry + the negation-form catch-all |
| `respin/app/(product)/onboarding/**` | Create | Route + server actions through the facade |
| `respin/app/(product)/billing-errors.ts` | Modify | Copy for the cap refusal |
| `respin/packages/*/tests/**`, `respin/tests/import-boundary.test.ts`, `respin/tests/profile-cage.test.ts` | Create/Modify | The proofs above |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Sign up → create profile → paste 5 posts → see 5 posts.** In a browser.
3. [ ] A second profile on a free tier is refused, and the message names the cap
4. [ ] The cap moves when the stored config document changes
5. [ ] Two concurrent creates at the cap boundary create exactly one
6. [ ] `writeCapabilities` still unreachable from `app/**`; an unnamed `@respin/*` package is refused

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Cap reads a hardcoded 1 instead of config | Cap test on studio tier |
| M2 | `createProfile` skips `assertScoped` | Forgery test |
| M3 | The list drops the workspace predicate | Isolation test |
| M4 | The concurrency guard removed | Docker race test |
| M5 | The facade re-exports `writeCapabilities` | Import-boundary deny fixture |
| M6 | `workspaceId` smuggled in via `as unknown as` | R1's runtime-strip test |

**Population note — read before reporting "N of N".** These six perturb code that exists. Every one
of the six survivors reviewers found in M2b-1 was a control **nobody had written**, which no mutation
can reach (CLAUDE.md, 2026-08-26). Before claiming a matrix result, state in the ledger which
requirements above have **no** control at all yet, and have someone other than the author plant at
least three mutations of their own.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser
- [ ] Critical-Path gates on **this slice** (tenancy certain; billing because the cap reads config and the tier) PASS, reviewers in **isolated worktrees**
- [ ] The open items above closed and the disposition register updated
- [ ] Ledger entry recording what the browser walk actually showed
