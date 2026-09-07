# Shaping brief — Respin M2b (the metered brain substrate)

**Request (as stated):** "proceed with respin m2b"

**Real job:** A creator hands us their own posts and gets back a brain they can read, correct field by field, and trust — because every claim in it points at a quote they actually wrote, and nothing in it changed without their say-so.

**Chosen scope:** Right-sized — **`packages/llm` + `packages/brain` + `createProfile`: the backend brain substrate, no UI.**

Owner-chosen 2026-08-24 from three options. M2's remaining phases 2-6 total ~166 acceptance criteria; the original six-phase plan failed all four Critical-Path gates three rounds running (blocking counts 14 -> 10 -> 18) purely from size, and M2a only converged once cut to one document / 20 criteria. M2b is therefore the next coherent slice, not the remainder.

### What M2b builds

1. **`packages/llm`** — the Anthropic adapter behind a provider interface (R-5, tech-spec §1), the stub every test drives, the model price table keyed by model id with a fail-closed lookup (D-M2-13), and the `model_usage` write path.
2. **`packages/brain`** — onboarding inference, `source_evidence` validation against the stored `onboarding_inputs` corpus (D-M2-4), the countable "evidence: N of M posts" label (D-M2-5), append-only versioning with activation/supersession, and brain export (REQ-A04's export half).
3. **`createProfile`** — in a layer that can see config *and* billing state (R-30 constraint 2), with the per-tier cap, the tier from `credits/src/state.ts`'s sole authority, and a role check.
4. **The M2b migration** — activation, supersession, the per-field confirmation columns (R-30 constraint 6), `source_evidence NOT NULL`, and the `creator_profiles` state column the downgrade decision needs.
5. **The metering caller** — the one authority for `resolved_tier` and `cost_state` (constraint 8), the `workspace_spend_monthly` writer with an idempotency key and its reconciliation query (constraints 5 and 9), one debit per `attempt_id` (constraint 4), and the pause gate at **operation entry, before the model call** (constraint 1).

### Owner decision taken in this shaping round

**Downgrade semantics (R-30 constraint 3, previously undecided): archive beyond the cap.** `creator_profiles` gains a state column (`active` | `archived`) in M2b's migration. On downgrade, profiles beyond the new cap become archived — readable and exportable, but not usable for generation and not counted against the active cap. The creator picks which stay active; oldest-first is the default. Nothing is destroyed, the entitlement stays honest, and it rides M2b's existing migration rather than becoming a second migration on a table M2a just landed.

### R-30 constraints this scope discharges

1 (operation-entry pause gate) - 2 (`createProfile`'s home) - 3 (downgrade semantics, decided above) - 4 (one debit per `attempt_id`) - 5 (`workspace_spend_monthly` pseudonymisation) - 6 (per-field confirmation columns) - 8 (`resolved_tier`/`cost_state` authority) - 9 (rollup idempotency + reconciliation query) - 10 (the `reference`-input substring rule, which needs a content generator to gate) - 11 (the `ProfileScope` mint's export surface).

Constraint 7 (R-29's seed-content assertion) stays with the framework seed in M2c. Constraint 12 (`takeConfigLock` on every `config_versions` writer) is a standing rule M2b obeys rather than discharges.

**10-star sketch (aim, not commitment):** the brain reads back as something the creator recognises as themselves rather than a form they filled in — each field written in their own idiom, its evidence shown inline as the actual sentences they wrote, and a one-line "here's what I'd get wrong about you" that invites the correction instead of waiting for it.

**North Star alignment:** advances **Goal item 1** directly and solely — "a per-creator brain that is inspectable, confirmable context, never weights; nothing updates it silently." Current focus names M2 as next. No Non-goal is touched.

**Non-goals (now):**

| Not building | Receiving milestone |
|---|---|
| The framework library seed (F1-F9, R-29) | **M2c** |
| The onboarding wizard UI and paste-only ingestion | **M2c** |
| Brain editor pages, version-history UI, export UI | **M2c** |
| REQ-B04 first-three-ideas at onboarding end | **M3** |
| The seven Studio modes, streaming, the kill test | **M3** |
| Free-tier credit minting (R-21) | **M3** |
| Promotion proposals / minimum-n learning | **M5** |
| Seats and roles beyond `createProfile`'s check (REQ-A02) | **M6** |
| Account deletion (REQ-A04's deletion half) | **M6** |

M2's master plan remains the authoritative scope contract, Deferral Ledger, and Derived Budgets for M2 as a whole; this brief slices it, it does not replace it.

**How this fails (pre-mortem):**

1. **The pause gate holds trivially again.** M2a's mint was unreachable, so its cage passed without ever being exercised. If M2b's pause check sits somewhere the real inference path doesn't traverse — or if it is asserted only by a fixture that writes both the `pause_periods` row and the subscription mirror, so `hasOpenPause` and `isPausedSubscription` agree — the test cannot tell the authority from the non-authority. The gate must be proved by a fixture where the two predicates **disagree**, and by removing the check to see red.
2. **Provenance theatre.** `source_evidence` can carry a quote that validates as a substring while supporting nothing the field claims. D-M2-5 already refuses the word *confidence* for exactly this reason. The live risk in M2b is the inverse of D-M2-10: a third-party sentence appearing in a brain doc's **value** while grounded by an `own_post` quote — R-3 failing through a door the round-2 findings named and nothing yet closes.
3. **The margin number is wrong in the flattering direction.** `resolved_tier` and `cost_state` are ordinary caller-supplied parameters today. A caller that re-derives the tier, or a retried rollup writer with no idempotency key, understates cost and therefore **overstates** margin — the dangerous direction for the number R-6 tunes pricing against, and the one nobody notices because it reads as good news.

**Must-answer before code:** where the `ProfileScope` mint is exposed (constraint 11 — the place `trustProfileId` would reappear, and it must stay unimportable from `app/**`), and whether the `reference`-substring bar extends past `voice` to `strategy` / `performance_meta` / `killtest` (constraint 10 leaves the set to M2b, and all four kinds reach M3's prompt bundle).
