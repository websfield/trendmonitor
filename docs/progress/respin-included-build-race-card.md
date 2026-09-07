# The included-build revenue race — report card

**Closed 2026-09-02 at ALMOST, not Ready.** A pre-existing money defect, fixed at the owner's direction ahead of slice 8 and ahead of any third review round on slice 7.

Ledger: [`respin-finish/ledger.md`](respin-finish/ledger.md) · Decisions: `decisions.md` **R-80, R-81, R-82** · Manifests: `included-build-race-manifest.md`, `race-round2-manifest.md`

---

## The defect, in one paragraph

A profile's **first** onboarding brain build is free; rebuilds cost credits. Which attempt is "first" was decided by counting attempts strictly earlier by `(created_at, attempt_id)`. But `model_usage.created_at` is assigned at **INSERT** and row visibility is decided at **COMMIT**, and the usage row is deliberately committed **before** the debit's workspace lock (R11, so a crash still records the spend). So:

> A inserts (earlier timestamp) and has not committed → B inserts, commits, takes the lock, sees no committed earlier row → **B is free** → A commits, takes the lock, sees B's row but B is *later* by the key → **A is free too.**

**Both take the included build. One debit is never written.** The values were a total order; **the reader's snapshot was not** — and two comments asserted the opposite at length, one citing a docker test as proof.

**Direction: revenue-lossy for us, never an overcharge to a creator.** Reachable on every tier — the run slot is per-*workspace* and sized 2 even on Free, so it does not serialise two first builds on one profile.

## Readiness

| | |
|---|---|
| **Overall** | **Almost** — the race is closed and proven under real concurrency; the final fix pass is **unreviewed** |
| **Entry gate** (CI shape, Docker live, all concurrency suites) | **PASS** — typecheck 0 · lint 0 · `db:check` clean · **121 files / 2920 tests / 0 failed / 0 skipped, exit 0** · `next build` compiled |
| Test growth | 2875 → **2920 (+45)** across the fix and both gate rounds |

## Gate verdicts

**Reviewer spend: 3 agents** (billing + tenancy round 1; billing only round 2 — tenancy's findings were comments, a test-quality fix and a schema comment, so re-running it would have been re-reviewing a comment fix).

| Critical Path | Round 1 | Round 2 |
|---|---|---|
| Respin billing & credits (Full) | NEEDS CHANGES — Almost / B | NEEDS CHANGES — **Almost / B** |
| Respin brain tenancy (Full) | NEEDS CHANGES — **Almost / B** | not re-run, by design |

**Zero BLOCKs in either round.**

## The fix

The entitlement is now a **database-enforced claim** — one row per `(profile_id, purpose)` under a unique index, claimed in the same transaction as the usage row, with a composite profile+workspace FK and cascade. The old counter is **deleted**. Pricing is free when the claim is unheld **or held by this attempt** — the third branch a count could not express — and the pre-call price and the debit price are now the identical expression, closing a divergence nobody had named. The spend rollup's parallel ranking is replaced by a check against the same claim: **three readers of one rule became one row.**

A **backfill** from extant `model_usage` uses the exact pre-fix rule, so no creator who has already used their free build receives a second — the same defect in the opposite direction, and worse.

## What the gates established by running it

- **The reproduction's premise is true, and it decides everything.** Billing rewrote the harness to hold the *whole* transaction instead of gating at the rollup upsert: **B never completed — it parked on the rollup's grain-row lock and a watchdog fired.** The naive reproduction proves nothing while looking exactly like proof.
- **The fix is not decorative.** Tenancy dropped the unique index on a live migrated database and recreated it non-unique; Postgres refused the writer's exact statement. **The index is unique in the applied schema, not just in the migration file.**
- **All four tenancy crossings were constructed and refused** — and slice 7's "a real pair, not the same pair" hole **does not apply here**, because the parent carries both a primary key and a unique on the pair.
- **Both directions were attacked.** Two free builds requires two claim holders for one key — refused. Zero free builds requires a foreign claim, which requires a prior billable row, and the backfill cannot invent one. The reviewer enumerated the windows, including one nobody had named: **two attempts in different rollup grains** (a tier change or month boundary mid-flight) are not serialised by the rollup, but the unique index is unconditional and covers them.
- **A mutation survived and corrected the fix's own story.** Moving the claim read outside the locked transaction leaves every race case green — **the claim is immutable once written, so the transaction is not what closes the race.** The lock stays for a different, real reason, and the comment now says that instead of claiming credit it had not earned.

## What the gates found, and what it cost to fix

1. **The rollup exemption hid one lost debit per profile** — it exempted every profile's *first successful generation*, though no generation is ever free. **Not a regression** (the old query did the same); what was new was a docblock stating a rule false for that purpose. Fixed by exempting only purposes that genuinely have an included build.
2. **The exempt-purpose list was then a source constant for a config-dependent fact.** An operator setting the free build's price non-zero via `/admin/config` would have re-opened the blind spot with no code change — and **the test offered as its witness read the seed, not the active document, so it could never fire**, while the recorded revisit trigger was a *human* trigger on a value a *web form* changes. Now derived at reconciliation time by probing the **price**, with the witness reading the active document.
3. **Eight comments cited the deleted counter as the live authority**, including the creator-facing money-copy file. The class was closed with a new symbol-citation guard — which **found three further stale citations in nobody's brief**, and whose own population claim was then found one path short and widened.

## Residuals — not claimed done

1. **The final fix pass is UNREVIEWED.** The two-round cap was spent. Same posture as slice 7, stated rather than blurred. A third round is the owner's call.
2. **RELEASE ORDER, not work order.** Migration `0024` sits **behind** slice 7's `0022` and `0023` in the journal, and all three are untracked. The fix's *code* is independent of slice 7; **its migration chain is not.** This cannot deploy ahead of slice 7 without renumbering, and nothing was renumbered.
3. **A schema property resting on one writer**: `attempt_id` has no FK to `model_usage`, so at the database level a claim could name a foreign attempt. Unreachable today — every column is built from the returned usage row and both readers join on `profile_id` — and a real FK would need a unique the bounded-retry shape forbids. Stated in the schema with its warrant.
4. **The final fixer's declared weakest bet:** the generation population is enumerated through one pricing helper, so a *new* generation-pricing path bypassing it would narrow the derived list silently. The total record catches a new **purpose** at compile time; nothing forces a new **operation** within a purpose to register.
5. **`setup.test.ts` remains load-flaky** (60s subprocess-spawn timeout under parallel load), green alone. Unchanged by this work and reported rather than re-run away.

## Spend

1 implementer + 2 fix agents + **3 reviewer agents** = **6 agents.**
