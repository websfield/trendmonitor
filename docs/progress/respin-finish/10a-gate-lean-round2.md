# Phase 10a — lean merged gate, build lane, round 2 of 2

*Report returned by the merged lean run (`general-purpose`, four lenses); saved verbatim by the build lane. Both budgeted rounds are now spent; the build lane fixed the three CHANGEs the same hour (see the ledger) — a third reviewer round is the owner's call.*

**Reviewer:** one merged read-only run (spin compliance · learning honesty · security · consolidating code review), same four checklists as round 1, read in full from their skill/agent files. Billing and tenancy ran separately; nothing on their paths is verdicted here.
**Tree:** the working tree over `d5fbaf7`, uncommitted (124 paths). Canonical gate cited: `docs/progress/respin-finish/entry-gate-10a-7.txt` — typecheck, lint, worker typecheck, `db:check`, full suite with Docker live (231 files), `next build`, every stage `EXIT=0`. The transcript's slow-test filter hides sub-3 s lines, so it cannot show the new Docker limiter suite by name; I ran that suite live myself (below).
**Date:** 2026-09-09. Vocabulary as round 1: ❌ BLOCK · ⚠️ CHANGE · 💡 NOTE; security uses CRITICAL / HIGH / MEDIUM / LOW / INFO.

**Method.** Every round-1 finding was checked three ways: the code, a test in the repo that goes red if the fix is reverted, and — where a claim was executable — a probe (`scratchpad/probe/probe-r2-lean.test.ts`, four tests, all green; nothing in the repo was edited). Regression hunting concentrated on the inversions each fix could realise: isolation that hides failures, a filter that drops a gate input, a header requirement that refuses the real page, one authority that nothing tests.

**Headline.** Every round-1 finding is fixed in code and every fix I could execute behaves as claimed. Three things remain, all small: two fixes have no witness (the maturity authority; the scorer-bound / recovery-isolation classification), and one fix introduced a real regression — the recovery loop's failures are now swallowed silently where the tick used to fail loudly, and a docstring says the opposite.

---

## Lens 1 — Respin spin compliance

### Per-finding status

- **C-1 (public refusal names a cause that did not happen) — CLOSED on the live path; one Low residual.** `packages/credits/src/sample-spin/run.ts`: `draft_unusable` exists with its own static sentence (`SAMPLE_SPIN_NEXT_ACTION.draft_unusable`); `classifyFailure` maps `SampleSpinBoundError → analysis_invalid/draft_too_large`, `LlmTruncatedError → analysis_invalid/reply_truncated`, `ScriptOutputError/KillTestError/GenerationAssemblyError → analysis_invalid`, and only `LlmError → vendor_failed/vendor_*`; the live refusal is `analysis_invalid ? draft_unusable : service_unavailable`. The route's own 503 now says "could not complete" (`app/api/demo/route.ts:118`). Witnessed: `sample-spin-spend.test.ts` "an unparseable reply is an UNUSABLE DRAFT" (asserts `draft_unusable`, `nextAction` without "provider", usage `analysis_invalid/reply_unparseable`), "a truncated reply keeps the vendor's usage" (`draft_unusable`, `reply_truncated`, measured), `demo-route.test.ts` "a facade failure is a content-free 503" (`not.toContain("provider")`), and `sample-spin-copy.test.tsx` pins the two sentences' direction. Reverting the ternary reddens two tests.
  **Residual (Low, register):** `replay()` (`run.ts`, the replay function's last three lines) still answers `service_unavailable` — "The model provider did not answer" — for every stored `vendor_failed` row, which includes `recovery_required` (two successful vendor calls, then a failed finalise) and `unclassified_failure` (any non-vendor error thrown inside `runGeneration`, which `classifyFailure`'s fallback labels `vendor_failed`). **Executed (probe P2):** weakest bet → lease → recovery → replay of the same id → `"reason":"service_unavailable"`, sentence "The model provider did not answer." Reachability is narrow: the panel reuses an id only when no server answer arrived (`sample-spin-panel.tsx:68,77`), so this needs a network drop during a live attempt plus a failed finalise. Fix when convenient: a `could_not_complete` reason for non-`vendor_*` error codes on replay, and stop labelling an unclassified error `vendor_failed`. Owner's call whether that is round 3 or the register.
- **C-2 (weakest point renders twice) — CLOSED.** `run.ts` filters `/whyThisPerforms/weakestPoint` out of `spin`; it still enters the gate (the filter is on the response only) and still travels on `weakestPoint`, which the panel renders once (`sample-spin-panel.tsx:166-168`). Witnessed: "REWRITE THEN ACCEPT" asserts the unit is absent from `spin`. S4's "weakest point named on every output" holds.
- **C-3 (REQ-H01 entrypoints and the panel outside the canon) — CLOSED.** `tests/sample-spin-copy.test.tsx` runs `FORBIDDEN_CLAIMS` over the rendered idle panel, every `SAMPLE_SPIN_NEXT_ACTION` sentence and `/legal`; `/legal` no longer says "training data" ("never used to build or update a model", `legal/page.tsx:28`) and now states the cost record carries the request's random id and is kept for the legal period. 💡 The panel's accepted state (`AcceptedView`, not exported) is outside the scan; I read its five static strings against the canon by hand — clean ("Why this could perform", "WEAKEST POINT", "…RULES THE GATE SAYS THIS DRAFT KEPT", "No rule was scored as kept…", "…rewritten once."). Exporting it for the scan is a register item.
- **C-4 (comment contradicts code) — CLOSED.** `fixture.ts:279-282` now names `SAMPLE_FRAMEWORKS` as the fixture's own two frameworks.

### Regressions hunted (none found on this lens)

- Gate ordering unchanged: display only from the accepted branch after `runGeneration` returns usable; the new `draft_unusable` branch returns a static sentence and nothing else. **Executed (probe P1):** a schema-valid, digit-free draft whose rendered form makes the scorer prompt 38,802 bytes (bound 16,000) → `draft_unusable`; one vendor call; usage `analysis_invalid/draft_too_large/measured`; bucket `admitted 1 / refused 1`; the draft's text absent from the response.
- No new ingest adapter, no dependency (package.json adds two scripts); R-97's two projections still never cross (unchanged code); the neutral `policy_check_required` disclosure is still the only disclosure.

**Checks run:** `sample-spin-spend`, `sample-spin-copy`, `sample-spin-facade` (green in the 16-file run); probe P1, P2.

### Verdict: PASS. No CHANGE; one Low residual (C-1 replay branch) for the register, owner's call.

---

## Lens 2 — Respin learning honesty

### Per-finding status

- **L-1 (`/admin/activation` reports immature cohorts with a rate) — CLOSED in code; ⚠️ CHANGE (Medium): the ONE authority has no witness.**
  Code: `packages/db/src/activation.ts` — `ActivationCohort.matured` documented and computed as `Date.parse(cohortDate) + 2 × ACTIVATION_WINDOW_MS <= asOf` at the end of `deriveActivationCohorts`; `worker/activation-emitter.ts:52` filters on it and its own `cohortMatured` is gone (grep: no other maturity computation exists); `activation-view.tsx:86-92` renders an open cohort's counts as "(partial)", `window_open` in the Rate and External-sink columns, and no percentage; the page prose explains the label. **Executed (probe P4):** two live users at asOf − 36 h and asOf − 72 h → cohorts `2026-09-08 matured:false`, `2026-09-06 matured:true`; at exactly day start + 48 h → true; one millisecond earlier → false. The formula is right and consistent with the live-row filter (`createdAt > asOf − 24 h` excluded).
  Witness: `tests/activation-view.test.tsx` has the asOf − 1 day cohort round 1 asked for and asserts "(partial)" + no `\d+\.\d%` in that row; `worker/tests/activation-emitter.test.ts` asserts an unmatured cohort is never sent. **But both hand-set `matured`.** `grep -rn matured packages/db/tests` → nothing: no test computes it from dates. The deletion of the emitter's `cohortMatured` moved the maturity computation from a place the emitter test exercised into `deriveActivationCohorts`, where nothing asserts it. A wrong formula (`+ 1 × ACTIVATION_WINDOW_MS`, or `matured: true`) sends immature cohorts to PostHog and renders them with a rate, with the whole suite green — the external sink's gate is un-witnessed. Fix: P4's shape in `packages/db/tests/activation.test.ts` (two users, two dates, the +48 h boundary) — ~15 lines. Must change: it is the witness of a High finding on what leaves the system.
- **L-2 (three-state result UI and the legacy branch have no witness) — CLOSED.** `tests/results-verification-unavailable.test.tsx`: only self-reported/unquantified rows → the `results-verification-unavailable` notice (`results-view.tsx:297-301` derives it from `state.results`, not from a hand-fed flag); a verified row silences it (non-vacuity); empty history shows nothing. `packages/db/tests/promotion-legacy.test.ts`: a still-`proposed` unverified row → `PromotionFreshnessError` /proposal audit/; `rejected` → `learningEligibility {kind: "legacy_unverified"}`, `claims []`, `mergedContent null`; `accepted` → `PromotionPayloadError` /blocks deployment/; decide on the terminal row returns without a write (`promotion-ops.ts:776-778`), on the proposed row refuses before any token and the row stays `proposed`. 💡 The file's third test, titled "NON-VACUITY", asserts only `expect(PromotionDecisionError).toBeDefined()` — it cannot fail. Delete it or make it real (the comment says the verified path lives in `promotion-ops.test.ts`; then say so and drop the test).
- **Round-1 NOTE (audit tidy) — CLOSED.** `promotion-audit.ts:16-17` cites `proposal-audit-cli.ts`; `PROPOSAL_AUDIT_STATUSES` / `void inArray` / the redundant `ne` are gone; the supersede predicate is `source = results ∧ status = proposed ∧ ∃ unverified evidence`.

### Regressions hunted (none found)

- Both consumers read one authority, and their branch order is consistent (view: expired → window_open → small cell → rate; emitter: matured → expired → small cell → send). The emitter's `matured` summary count now counts matured cohorts only (test expects 3 of 4). The pending-deletion capture rows carry `matured` from their cohort date like every row. No new `promotion_proposals` writer; `MIN_COMPARABLE_RESULTS` and the `isNumerical` allowlist untouched. The evaluation doc still opens "REGISTERED, NOT RUN"; the 40% target still prints as "Target, not evidence".

**Checks run:** `activation`, `activation-view`, `activation-emitter`, `promotion-legacy`, `promotion-audit`, `results-verification-unavailable` (green); probe P4.

### Verdict: NEEDS CHANGES (L-1 witness, Medium — must change, small). No BLOCK.

---

## Lens 3 — Security

**Readiness: Almost → Ready · Grade: A · every round-1 finding closed and witnessed; the fixes opened no new hole; 0 high, 0 medium, 1 low (new, register).**

### Per-finding status

- **S-1 HIGH (deadline unclamped, lease assumes 120 s) — CLOSED.** `packages/db/src/system-spend.ts:118` `PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS = 120_000`, `:126` `FINALISE_MARGIN_MS = 30_000`, `:135-136` the lease is derived as their sum; `run.ts` `sampleSpinDeadlineMs = min(config, ceiling)` feeds `AbortSignal.timeout`. Witnessed: `sample-spin-spend.test.ts` "the deadline is the config value CLAMPED" — 300 s → 120 s, 45 s → 45 s, lease > ceiling; reverting the `min` reddens it. The facade's SDK `timeoutMs` (`app-server.ts:758`) stays unclamped, which is fine: the signal is passed on every call and `withDeadline` races on it, so 120 s bounds the attempt regardless.
- **S-2 MEDIUM (cross-site spend trigger) — CLOSED, and the real page still works.** `route.ts:76-81`: `Content-Type` must match `^application/json\b` (415) and `Sec-Fetch-Site: cross-site` is refused (403), both before the body is read and before the facade. Witnessed: `demo-route.test.ts` drives `text/plain` → 415, `cross-site` → 403, `same-origin` → facade called exactly once. Regression check: the panel sends `Content-Type: application/json` from the same origin (`sample-spin-panel.tsx:71-75`); it is the only caller of `/api/demo`. Attack paths re-tried on paper: `text/plain`, `multipart`, `urlencoded` simple requests and top-level form posts → 415 before any spend; `application/json` cross-origin `fetch` → preflight, no CORS headers → blocked; `\b` rejects `application/jsonp`; non-browser clients are bounded by the bucket, the two slots and the purpose cap as before.
- **S-3 LOW (`captureError` "never throws" could reject) — CLOSED.** `lib/telemetry.ts:57-67` wraps the body, `rethrowNextControlFlow` first; `telemetry.test.ts` "a collector failure is never an application failure" resolves "failed".
- **S-4 INFO (environment hard-coded) — CLOSED.** `SENTRY_ENVIRONMENT` → `sentryEnvelope(dsn, event, now, environment)` behind `safeToken`; test asserts `"environment":"staging"`; registered 10a-R9.
  **NEW ⚪ LOW `lib/telemetry.ts:35` / `telemetry-sinks.ts:100`** — a malformed tag (`staging (eu)`) is refused per event, so every `captureError` returns `"failed"` and the deployment ships zero Sentry events with no symptom; the sample rate, by contrast, throws at construction (`tightenOnlySampleRate`). Validate the token when `createTelemetry` is built (throw like the sample rate, or fall back to `production` and log once). Register.
- **S-5 INFO (shared bucket when no proxy attests) — CLOSED.** `packages/auth/src/client-ip.ts` `proxyAttestedClientIp` returns `null` whenever no trusted-proxy list resolves; the route buckets under it (`route.ts:109`). Witnessed against the INSTALLED Better Auth in `packages/auth/tests/client-ip.test.ts`: null under `none` for any header; behind `10.0.0.0/8` a two-hop header resolves to the pre-proxy hop and a spoofed prefix is ignored (so production under a real list buckets per visitor, not the whole internet). Registered 10a-R7 with the symptom. 💡 `public-sample-spin.ts:17-19` still names `canonicalClientIp` as the caller's authority.

### Project security rules (CLAUDE.md)
- ✅ No secrets in code/commits/logs — the keyring CLI prints key VERSIONS only and opens the DB only when a prior key exists (`sample-spin-keyring-cli.ts`); the 415/403 refusals carry no request id and nothing from the request; the envelope's new field is env-sourced and token-guarded.
- ✅ No leakage — the demo mints no scope; migration 0061 widens only the public purpose's success-with-unknown-cost shape (autopsy success still `measured` and 4 calls).

### Coverage
Read fully: `route.ts`, `demo-route.test.ts`, `client-ip.ts`, `client-ip.test.ts`, `lib/telemetry.ts`, `telemetry-sinks.ts`, `telemetry.test.ts`, `sample-spin-keyring-cli.ts`, migration `0061`, `public-sample-spin.docker.test.ts`. Sections: `create-auth.ts` `resolveTrustedProxies`, `app-server.ts` facade, `system-spend.ts` constants. Hunted for and did not find: a request field reaching the envelope through the new parameter; a panel request the new header rules refuse; a raw IP after `proxyAttestedClientIp`; a code path that reads `Sec-Fetch-Site` as an allow signal (it is deny-only).

### Verdict: PASS (Ready). 1 LOW for the register.

---

## Lens 4 — Consolidating code review

**Readiness: Almost · Grade: B · mechanisms correct where executed; one fix inverted a loud failure into a silent one, and two fixes have no witness; 2 must-fix, 1 optional-class.**

### Per-finding status

- **R-1** = S-1 (closed above).
- **R-2 (budget-refused replay told `in_progress`) — CLOSED.** The admission returns `claimStatus` (`public-sample-spin.ts:97,145`); `replay()` answers `budget_exhausted` for `cap_exhausted` before reading usage. Witnessed: "a replayed budget-refused id is told budget_exhausted, never in_progress".
- **R-3** = C-1 (above).
- **R-4 (scorer byte bound misclassified as an invariant) — CLOSED in code; witness missing (see the bundled CHANGE below).** `metered()` throws `SampleSpinBoundError` for a later prompt over its bound, classified `analysis_invalid/draft_too_large` → `draft_unusable`; 10a-R8 records the ~4× byte-vs-token factor. Executed (P1) as described under Lens 1. `grep draft_too_large packages/credits/tests tests` → only an export list: reverting the `SampleSpinBoundError` line in `classifyFailure` sends the case to `unclassified_failure/service_unavailable` with the suite green. 💡 `run.ts:181-185` docblock says the refusal is `prompt_too_large`; the code says `draft_unusable`.
- **R-5 (four stated invariants without a test)** — (a) rewrite-then-accept: CLOSED (3 requests, `callCount 3`, `rewritten true`, `tokensIn 3_000`). 💡 The title's "and the fourth-call guard is real" is not asserted — no test requests a fourth call (the pipeline cannot), so that guard stays structurally witnessed as in round 1; retitle. (b) truncated usage: CLOSED. (c) weakest bet: CLOSED as a test — vendor success, second transaction fails via a db Proxy, in-flight 1 → lease → `{recovered: 1, failed: 0}` → 0, bucket stays consumed, usage `vendor_failed/recovery_required/unknown/3`. (d) per-candidate isolation: CLOSED in code, **executed (P3):** two stale claims, first transaction throws → `{recovered: 1, failed: 1}`, one usage row, the next tick recovers the other. No repo test drives a failing candidate.
  **NEW ⚠️ CHANGE (Medium) `worker/retention.ts:55` — the isolation fix made recovery failures invisible.** `await recoverStalePublicSampleSpinAttempts(ports.db)` discards `{recovered, failed}`: `RetentionRunSummary` has no field for it, `evaluateRetentionAlerts` has no condition, `retentionTickEvent` no key, `worker/health.ts` no allowlisted key. Before the fix a failing candidate rejected the tick and the job failed visibly; now a claim that fails every minute (the S-1-shaped race, a constraint refusal, a poisoned row) loops silently forever — the exact shape `retention_poisoned_rows`' own comment says "has to page". The docstring at `system-spend.ts:507-509` claims "the retention summary carries the count"; the code lacks the property (lesson 2026-07-30). Fix: carry the summary in `RetentionRunSummary`, add `public_sample_spin_recovery_failed` (critical when `failed > 0`) to `evaluateRetentionAlerts`, two allowlisted keys in `health.ts`, one case in `retention-alerts.test.ts`. Must change.
- **⚠️ CHANGE (Medium, one item) — R-4 and R-5d have no witness.** Reverting either classification leaves the suite green (reasoned from the greps; both behaviours proven only by my probes). P1 and P3 are the two tests, ~40 lines together, in `sample-spin-spend.test.ts` and `system-spend-purpose.test.ts`. Must change under criterion (a); can ride with the R-5d fix.
- **R-6 (public registry rows without a witness) — CLOSED.** `creator-data-registry.ts:460,465` register one whole-row `retain_financial / financial_chain_seven_years / financial_retention_receiver` class per spend table (the unrunnable scrub withdrawn); `lifecycle-probes.test.ts:640-658` asserts both compile, exactly one target per table, and the autopsy scrub's discriminator excludes a public row even with a real trend item.
- **R-7** — unchanged, fine. **R-8 — CLOSED** (`public-sample-spin.ts:137-161`, branch gone). **R-9 — CLOSED** for the three named comments (`system-spend.ts:427` now says the limiter's advisory lock; fixture; audit).
  💡 **New stale text introduced by the fixes:** `run.ts:139` ("exactly the gate's inputs" — now minus two units), `run.ts:181-185` (`prompt_too_large`), `public-sample-spin.ts:17-19` (`canonicalClientIp`), `sample-spin-panel.tsx:36` (dead `weakestPoint` label). Optional.
- **Also-changed surfaces:** migration `0061` — correct and witnessed (the alias test inserts a `succeeded` public row with `costState: "unknown"` through the migrated PGlite schema); `db:check` `EXIT=0`. Docker limiter suite — I ran it live: 3/3 (one window across 8 racers, ≤ 2 slots across 6 addresses, one window across a key rotation); its header records the `LIMITER_LOCK` mutation as executed. Keyring CLI — versions only, exit 3 while a prior key has a live bucket; no test (operator tooling, acceptable).

### Convention adherence (CLAUDE.md)
- ✅ Rule 2 — no tenant ledger row touched (asserted); `system_model_usage` append-only; the purpose cap still sums reserved claims.
- ✅ Rule 7 — `SAMPLE_SPIN_NEXT_ACTION` is a closed record the copy test iterates; the registry classes are hand-listed and probed.
- ❌ Lesson 2026-07-30 (a comment claiming a property is not the property) — `system-spend.ts:507-509` vs `worker/retention.ts:55`.
- ✅ Lesson 2026-08-21 — the weakest bet is now executed by a real db Proxy, not reasoned.

### Verdict: NEEDS CHANGES (R-5d summary regression, Medium; R-4/R-5d witnesses, Medium). No BLOCK.

---

## Coverage

**Read fully:** `run.ts`, `activation.ts` (shape, derivation, maturity), `activation-view.tsx`, `activation/page.tsx`, `activation-emitter.ts`, `activation-view.test.tsx`, `activation-emitter.test.ts`, `results-verification-unavailable.test.tsx`, `promotion-legacy.test.ts`, `promotion-audit.ts`, `sample-spin-spend.test.ts`, `app/api/demo/route.ts`, `demo-route.test.ts`, `client-ip.ts`, `client-ip.test.ts`, `lib/telemetry.ts`, `telemetry-sinks.ts`, `telemetry.test.ts`, `public-sample-spin.docker.test.ts`, `0061_vengeful_eternity.sql`, `sample-spin-keyring-cli.ts`, `sample-spin-copy.test.tsx`, `legal/page.tsx`, `sample-spin-panel.tsx`, `worker/retention.ts`, `forbidden-claims.ts`, the round-1 report, all four lens definitions.
**Sections/diffs:** `system-spend.ts` (constants, `recoverStalePublicSampleSpinAttempts`, the two lock comments), `public-sample-spin.ts` (header, admission), `creator-data-registry.ts` (public rows), `lifecycle-probes.test.ts` (public class), `fixture.ts` docblock, `results-view.tsx` notice, `promotion-ops.ts` decide head, `create-auth.ts` `resolveTrustedProxies`, `app-server.ts` facade, `worker/production.ts` retention binding, `worker/health.ts` keys, `activation.test.ts` helpers, open-items 10a-R6..R11, gate transcript header and totals.
**Not read:** `pipeline.ts` beyond the two-`generate` grep; `output.ts`/`kill-test.ts` beyond the bounds grep; `retention-alerts.test.ts`; the drizzle snapshot JSONs; `globals.css`.

**Commands run:** `pnpm exec vitest run` on 16 files with `TEST_DATABASE_URL` set — 105 tests green (`sample-spin-spend`, `demo-route`, `telemetry`, `activation-view`, `activation-emitter`, `promotion-legacy`, `results-verification-unavailable`, `sample-spin-copy`, `lifecycle-probes`, `client-ip`, `public-sample-spin.docker`, `system-spend-purpose`, `public-sample-spin`, `promotion-audit`, `activation`, `sample-spin-facade`); the Docker limiter suite alone (3/3 live); probe file `probe-r2-lean.test.ts` (P1 scorer bound, P2 post-recovery replay, P3 recovery isolation, P4 maturity from dates) — 4/4.

**Hunted for and did not find:** a display path before the gate or a draft leaking on the new `draft_unusable` paths (P1); a real-page request the S-2 headers refuse; a second maturity computation or an emitter path around `matured`; a request field reaching the Sentry envelope through the environment parameter; a new proposal writer; a fourth vendor call (still structural); a dependency added; a claim in the transcript the tree does not back (231 files, `EXIT=0` per stage).

## Totals

❌ BLOCK: **0**. ⚠️ CHANGE: **3**, all Medium — L-1 witness (learning), R-5d silent-failure regression (code review), R-4/R-5d witnesses (code review). Low: **2** (C-1 replay residual; S-4 malformed environment tag) — register. 💡 NOTE: **5** (vacuous "NON-VACUITY" test; four stale comments/labels; rewrite test title; `AcceptedView` outside the scan).

Readiness per lens: spin compliance **PASS** · learning honesty **NEEDS CHANGES** · security **PASS** · code review **NEEDS CHANGES**.

**Must change vs register, stated plainly for the round-3 decision:** the three CHANGEs are must-change — one is a genuine regression introduced by a round-1 fix (a loud failure made silent, with a docstring asserting the opposite), the other two are the brief's own criterion (a fix without a witness is not closed). Together they are roughly 60 lines of test and 20 lines of code, no design change, and a single fix pass with one re-run of the four affected suites would close them; the two Lows and five NOTEs can go straight to `respin-finish-open-items.md` without another round.
