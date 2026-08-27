# Master Plan: Finish Respin

**Objective:** get from today's state — auth, billing and a credit ledger that work, plus a brain substrate no user can reach — to a product a creator walks end to end.

**Codebase review:** [`../progress/respin-finish-codebase-review.md`](../progress/respin-finish-codebase-review.md)
**Scope contract:** `docs/initial/build-plan.md` M2–M6 · **Supersedes:** `respin-m2b1-brain-surface-plan.md` (its 26 TODO tasks are re-homed into the slices below)

---

## The rule this plan exists to enforce

M2b-1 shipped **3,062 lines of source and 2,236 lines of tests through 11 gate rounds and ~80 blocks, with zero product callers and zero user-reachable routes**, against a build-plan budget of 1–2 sessions. It was not reachable even in principle: nothing in product code can create a `creator_profile`, and `app/**` is denied `writeCapabilities`.

> **Every slice below ends in a path a creator can walk. No package ships without a caller in the same slice. Gates run on the slice, not on primitives.**

A slice is **done** when a person can do the thing, not when the module is elegant.

---

## Slices

| # | Slice | A creator can… | Est. | Depends on |
|---|---|---|---|---|
| **1** | **Profile + intake** | Create a creator profile and paste their own posts, and see them listed back | 3–4 h | — |
| **2** | **One metered model call** | Press a button, cause a real Anthropic call, and see the credits and the usage row it produced | 4–6 h | 1 |
| **3** | **Infer → confirm → activate** | See a voice brain inferred from *their* posts, with the quote behind every field, confirm each, and activate it | 4–6 h | 2 |
| **4** | **References + the R-3 promise** | Add reference posts they admire, and be stopped from copying them | 3–4 h | 3 |
| **5** | **Brain editing, versions, export** | Edit a field, see the old version still readable, export JSON + markdown | 3–4 h | 3 |
| **6** | **First generation** | Generate hooks from their own brain, kill-tested, debited | 6–8 h | 3 |
| **7** | **The rest of the Studio** | Use all seven modes, revise with lineage, give feedback | 8–10 h | 6 |
| **8** | **Trends + Spin** | Browse a trend, read an autopsy, spin it into their own voice | 10–12 h | 7 |
| **9** | **Results + learning** | Log a result and get a promotion proposal at n ≥ 3 | 8–10 h | 7 |
| **10** | **Launch hardening** | (Marketing, admin, retention, seats) | 10–12 h | 8, 9 |

**Slices 1–5 complete M2. Slices 6–7 complete M3.** Slice 4 is separated from 3 deliberately — see below.

### Why slice 4 is its own slice

Three open register items — **G-10** (`[check]`-citable evidence), **G-11** (a trailing space mints a fresh quote budget), **G-12** (an `own_post` label switches both R-3 controls off) — are unreachable today and become live the moment onboarding accepts a reference post. R-3 ("spin, never copy") stops being a substrate property and becomes a promise to a creator in that slice, so **G-10, G-11 and G-12 close inside slice 4 or slice 4 does not ship.** They are not a gate on slices 1–3.

---

## Progress tracking

| Slice | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 | ⏳ | | | Phase plan written |
| 2 | ⏳ | | | Phase plan written |
| 3 | ⏳ | | | Phase plan on slice 2 ship |
| 4–10 | ⏳ | | | Phase plans just-in-time |

**Phase plans are written just-in-time, one slice ahead.** Writing all of M2b-2→M6 now would reproduce the 489-line specification that got reviewed instead of built.

---

## Decisions owed before the slice that needs them

| Decision | Owed by | Why it blocks |
|---|---|---|
| `creditCosts.onboardingBrainRebuild` value | Slice 2 | Owner-undecided; a config-data precondition, not a UI one |
| `packages/brain` vs `@respin/db` | Slice 3 | `tech-spec.md:36` names `packages/brain`; M2b-1 put it in `packages/db`. M5 needs the package as the sole proposal site. Cheap now, expensive at M5 |
| Model tiers per operation | Slice 2 | Generation on Sonnet-class, classification on Haiku-class |
| Background runner (Inngest or alternative) | Slice 8 | `tech-spec.md:18` makes it due at **M4 entry**, recorded before planning |

---

## Risks

| Risk | Mitigation |
|---|---|
| **The M2b-1 pattern repeats** — building substrate ahead of its caller | The slice rule. A package with no caller in its own slice is not done |
| **First outbound HTTP in `packages/**`** (slice 2) — key handling, base-URL pinning, retries, timeouts | Pinned non-overridable `baseURL` proved by a planted `fetch` to a closed platform; no prompt or completion text in logs or thrown errors |
| **Metering loses the spend record** — the round-1 defect: adapter call inside the transaction holding `model_usage`, so a refused debit rolls back the usage row | `model_usage` commits in **its own** transaction; the debit composes after; one debit per `attempt_id` via partial unique index |
| **A triggered auto-top-up is treated as money** | `maybeAutoTopup` never licenses proceeding — refuse this attempt regardless, and do not promise the next will succeed |
| **19 open register items become a gate on everything** | Carried as a reachability-ordered backlog; only G-10/11/12 are slice-blocking, and only for slice 4 |
| **Review cost recurs** | Gates run on the slice; reviewers run in **isolated worktrees** |

---

## Quality gates (per slice, not per module)

- [ ] Entry gate clean: `pnpm -C respin typecheck && lint && test` on the CI shape (Docker live, zero skips)
- [ ] `db:check` clean, migration applied
- [ ] **A person can walk the slice's "A creator can…" line** — the actual acceptance test
- [ ] Applicable Critical-Path gates PASS, run **on the slice**, reviewers in isolated worktrees
- [ ] Mutation matrix **names its population**, including what it could not cover
- [ ] Docs updated in the same change if an invariant moved

---

## Non-goals

Anything not in a slice above. Specifically: no new brain-substrate hardening without a caller; no plan-document expansion; no gate round on an artifact a user cannot reach.
