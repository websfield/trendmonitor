# Report card — Respin finish, Slice 1: Profile + intake

**Overall: Almost.** The slice does what its card says and a creator can walk it, every applicable gate has been run twice and no BLOCK survives — but three reviewers still hold open CHANGEs after round 2, and the round economy stops at two rounds. What is left is listed below as residuals for the owner to schedule, not quietly closed.

Date: 2026-08-27 · Feature: `respin-finish` · Phase: slice 1 of 10
Plan: [`../plans/respin-finish-phase-1.md`](../plans/respin-finish-phase-1.md) · Ledger: [`respin-finish/ledger.md`](respin-finish/ledger.md) · Decisions: `docs/initial/decisions.md` **R-35**, **R-36**

---

## The acceptance test

> **A creator can create a creator profile and paste their own past posts, and see them listed back.**

**Walked in a browser against real Postgres, three times** (initial, after the round-1 fixes, after the round-2 fixes). Final walk: sign up → `/onboarding` → create "Jonah Reed" → paste a post → listed back with its date, its whole-post character count, and an expander that shows the stored text in full. The plan's cap sentence renders on both steps, the stated limits come from the server's own constants, and neither field carries a `maxlength`.

---

## Gates

| Gate | Round 1 | Round 2 | Notes |
|---|---|---|---|
| Entry gate (CI shape, Docker live, zero skips) | PASS | **PASS** | 46 files / 914 tests / 0 skipped, exit 0; `db:check` clean; `next build` compiles |
| Respin brain tenancy | **BLOCK** | NEEDS CHANGES | BLOCK lifted; 6 CHANGE / 3 NOTE open |
| Production readiness (on-demand — "client ready" was asked for) | **BLOCK** (Not yet / D) | NEEDS CHANGES (Almost / **B−**) | all four BLOCKs closed |
| Respin billing & credits | NEEDS CHANGES (Almost / B−) | NEEDS CHANGES (Almost / **B**) | 4 of 6 prior CHANGEs closed |
| Respin spin compliance | NEEDS CHANGES (Almost / C) | NEEDS CHANGES (Almost / C) | round-1 substance fixed |
| Mutation matrix | 16 planted / 16 killed | — | population note below |
| Acceptance (the "A creator can…" line) | PASS | **PASS** | walked, not inferred |

**Reviewer spend: 8 reviewer runs across 2 rounds** (4 per round), plus 4 discarded launches — see *How the gate was run* below. Gate intensity: `lean` in `CLAUDE.md`, but tenancy and billing are `Full gates? yes`, so both ran as separate reviewers in both rounds; compliance and production were added on the touched-path rule and the person's production intent.

### How the gate was run, and one deviation

The phase plan requires reviewers in **isolated worktrees**. The first launch was killed: `isolation: worktree` checks out HEAD, and this change is **uncommitted**, so all four worktrees sat two commits behind with no `respin/` directory at all — two agents reported exactly that before being stopped. Re-run **read-only against the main working tree** with an explicit no-mutation instruction. That is the actual intent of R-34's rule, whose damage came from four *mutating* reviewers sharing a tree; all eight runs confirmed they created, edited, moved and deleted nothing. For an uncommitted change, isolation reviews the wrong tree, which is worse than sharing.

---

## What shipped

Migration `0013` (`creator_profiles.state`) · `createProfile` in `@respin/credits` with the cap, the tier, the pause, the role and the clock · `workspaceWriteCapabilities` in `@respin/db` (insert + count) · `appendOwnPost` / `listOnboardingInputs` · `/onboarding` (page, two server actions, pure view, pure copy, two client islands, an error boundary) · `safe-log.ts` · four typed refusals with copy · the negation-form eslint catch-all · and repairs to five existing instruments.

**Open items closed:** R-30.2, R-30.3, R-30.11, brain-surface tasks 24, 25, 26, 46 — plus **G-13**, which was not scheduled here and which the tenancy gate's BLOCK forced.

---

## Residuals — open after two rounds

Listed with severity and a recommendation. None is a BLOCK.

| # | Finding | Reviewer | Recommendation |
|---|---|---|---|
| 1 | **No UI path to a second creator profile.** Studio's cap of 5 has no route in the interface; a server action can still create one, after which the page binds the newest and the paste box follows it | tenancy, billing, production | **Schedule a profile-switcher slice.** `profile_cap` copy no longer sells the upgrade, so nothing over-promises meanwhile |
| 2 | **`/usage` and `/settings/billing` carry the first-load bootstrap race** `/onboarding` no longer has | production, tenancy | One line each — route them through `scopeForUser`. Recommend folding into slice 2a |
| 3 | **No `DESIGN.md` in a repo shipping UI**, so "visual quality" has no standard | production | Run `/design` before the public surface (slice 10a), not now |
| 4 | **No request id in logs**; `tech-spec.md` §7 requires structured logs + request id | production | Slice 10a's observability pass, which already owns it |
| 5 | **`safe-log`'s rule is "authored template", not "authored content."** Two of our own classes (`ProvenanceError`, `ContentSchemaError`) interpolate user-derived values. Unreachable in slice 1; reachable at slice 2a | production | **Owed by slice 2a**, which makes them reachable |
| 6 | **Double config read** inside `createProfile`'s transaction can yield a tier from version N and a cap from N+1 | billing | Judged not blocking by the reviewer; close when convenient |
| 7 | **No content dedupe, no delete, no rate limit** on the intake path | production | The row ceiling closes the disk-exhaustion half; dedupe is R-33, delete/rate-limit are slices 10a/10b |
| 8 | **The `own_post` label has a creator-side warrant only** — one sentence on the form, no attestation | compliance | Recorded in the register against **G-12, now staged at slice 3** |

---

## Population note — read before trusting "16 of 16"

The mutation matrix perturbs code that **exists**. Every finding that actually mattered in both gate rounds was an **absence** no mutation could reach: a missing role gate, a missing log sanitiser, a missing refusal, a missing test for a fix. The matrix was 16/16 green on code with a viewer-writable immutable corpus, a creator's post text going to the logs, and a silently truncated paste. **This is the third milestone running with that signature** (CLAUDE.md, 2026-08-26).

Round 2 sharpened it further: the round-1 fixes introduced four new defects, three of them the same shape as the finding being fixed — including a role gate that closed a BLOCK and was asserted by nothing.

---

## Definition of Done

- [x] Entry gate clean on the CI shape, Docker live, zero skips
- [x] `db:check` clean, migration applied
- [x] **The "A creator can…" line walked in a browser**
- [x] Applicable Critical-Path gates run on the slice — no BLOCK outstanding
- [x] Mutation matrix names its population, including what it cannot cover
- [x] Docs updated in the same change (R-35, R-36, the master plan, the open-items register, both stubs)
- [ ] **Reviewers report PASS** — three hold CHANGEs; residuals above

---

*Ask `/go` to explain any residual in plain words — or to fix them.*
