# Slice 1: Profile + intake

## A creator can…
**Create a creator profile and paste their own past posts, and see them listed back.**

That sentence is the acceptance test. Walk it in a browser or the slice is not done.

## Why this is first
Nothing in product code can create a `creator_profile`, and every brain capability is gated behind `ProfileScope`, which needs that row. Until this ships, the 3,062 lines of M2b-1 are unreachable in principle. This slice also builds the **app-server facade** every later brain slice goes through.

**No LLM.** Deliberately — this slice proves the seam, not the intelligence.

## Prerequisites
- [x] M2a cage, migrations `0000`–`0012`
- [x] `appendOnboardingInput`, `profileCaps` in config
- [ ] Entry gate green before starting

---

## Requirements

### Profile creation
- [ ] **R1:** `createProfile(displayName)` on the profile write surface. Calls `assertScoped` first. Server-derives `workspace_id` from the scope; the caller supplies only a display name.
- [ ] **R2:** Enforces `profileCaps` from the **active config document**, per resolved tier — free/creator/pro 1, studio 5. Refuses over-cap with a typed error naming the tier and the cap.
- [ ] **R3:** The cap check is **not a check-then-act race**. Either a partial unique index, or the workspace lock taken at entry. Proved with a two-connection Docker test.
- [ ] **R4:** Refused while the workspace is paused? **No** — creating a profile is not an entitlement spend. Record the decision either way; do not leave it unclassified.

### The facade
- [ ] **R5:** `@respin/db/app-server` (or extend the existing `respinDb` entrypoint) exposes exactly: `createProfile`, `listProfiles`, `addOnboardingInput`, `listOnboardingInputs`. `writeCapabilities` stays denied to `app/**`.
- [ ] **R6:** Added to the eslint `@respin/db` allowlist by name — never by widening the default-deny. `tests/import-boundary.test.ts` gets a deny fixture proving `writeCapabilities` is still refused from `app/**`.

### Intake
- [ ] **R7:** `/onboarding` — signed-in, no profile yet → a display-name form. With a profile → the paste step.
- [ ] **R8:** Paste a post → `appendOnboardingInput({inputClass:"own_post", content})`. Content NFC/LF-normalised and sha'd by the existing write path (do not re-implement).
- [ ] **R9:** Pasted posts list back, newest first, with their character count. Empty state says what to do, not "no data".
- [ ] **R10:** `input_class` is **not** a user-facing choice in this slice — `own_post` only. References are slice 4, with G-12 (`own_post` switches both R-3 controls off) closing alongside them.

### Honesty
- [ ] **R11:** No page claims a brain will be built, a script generated, or a credit spent. This slice does none of those.

---

## Tasks
1. [ ] `createProfile` + `ProfileCapError` in `errors.ts`, app copy in `billing-errors.ts`, eslint allowlist entry
2. [ ] Cap enforcement + the concurrency guard (R3)
3. [ ] The app-server facade (R5) + the import-boundary deny fixture (R6)
4. [ ] `/onboarding` route: profile form → paste form → list
5. [ ] Tests: cap refusal, cross-workspace isolation on `listProfiles`, paste round-trip, the two-connection race
6. [ ] Walk it in a browser; record what a real paste of 5 posts actually feels like

## Files
| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/with-workspace.ts` | Modify | `createProfile` on the write surface |
| `respin/packages/db/src/errors.ts` | Modify | `ProfileCapError` |
| `respin/packages/db/src/app-server.ts` | Modify | The four facade functions |
| `respin/packages/db/src/index.ts` | Modify | Export the facade surface |
| `respin/eslint.config.mjs` | Modify | Allowlist by name |
| `respin/app/(product)/onboarding/page.tsx` | Create | The route |
| `respin/app/(product)/onboarding/actions.ts` | Create | Server actions through the facade |
| `respin/app/(product)/billing-errors.ts` | Modify | Copy for `ProfileCapError` |
| `respin/packages/db/tests/profile-create.test.ts` | Create | Cap, isolation, refusals |
| `respin/packages/db/tests/profile-create.docker.test.ts` | Create | The two-connection cap race |
| `respin/tests/import-boundary.test.ts` | Modify | Deny fixture for `writeCapabilities` |
| `respin/tests/onboarding-ui.test.tsx` | Create | Route renders, empty state, list |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips
2. [ ] `db:check` clean
3. [ ] **Sign up → create profile → paste 5 posts → see 5 posts.** In a browser.
4. [ ] A second profile on a free tier is refused, and the message names the cap
5. [ ] Two concurrent `createProfile` calls at the cap boundary create exactly one
6. [ ] `writeCapabilities` still unreachable from `app/**` (deny fixture red when the allowlist is widened)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Cap check reads a hardcoded 1 instead of config | Cap test on studio tier |
| M2 | `createProfile` skips `assertScoped` | Forgery test |
| M3 | `listProfiles` drops the workspace predicate | Isolation test |
| M4 | The concurrency guard removed | Docker race test |
| M5 | Facade re-exports `writeCapabilities` | Import-boundary deny fixture |

**Population note:** these cover the guards that exist. They say nothing about a guard nobody wrote — record explicitly what this matrix does **not** cover.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser
- [ ] Critical-Path gates on **this slice** (tenancy certain; billing if the cap reads config) PASS, reviewers in **isolated worktrees**
- [ ] Ledger entry recording what the browser walk actually showed
