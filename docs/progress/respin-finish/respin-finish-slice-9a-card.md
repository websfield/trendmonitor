# Slice 9a — Result logging + honest comparison — report card

**Close-out status 2026-09-05: ALMOST, not Ready.** Engineering is complete. Evidence is incomplete: the final fix pass shipped **UNREVIEWED** under the owner's explicit authorisation in the slice-9a close-out contract, the canonical test command exited 1 on registered harness defect `9a-G1`, and the real-vendor browser walk was blocked before navigation by the managed browser policy. These are separate claims.

## Report card

| Area | Verdict | Evidence |
|---|---|---|
| Engineering | **Complete** | All four permitted close-out edits were already present. No code was changed in this close-out pass. |
| Evidence | **Incomplete** | Two review rounds were spent; the final fix pass is unreviewed. The browser walk was attempted but blocked before the app loaded. |
| Overall | **ALMOST** | The implementation is present, but the evidence bar for Ready is not met. |
| Definition of Done | **Not met** | The entry gate is non-zero, not every shipped fix has reviewer evidence, and the creator walk is blocked. |

## Closed-set implementation audit

| Edit | Status | Anchor and line-ending check |
|---|---|---|
| A1 — stored-data migration warning below `metricKeyFromLabel` | **LANDED-ALREADY** | The migration sentence occurs once in `brain-content.ts`; the file is uniformly CRLF (831 line endings). The claim was checked against the real `results.metric_key`, nullable `results.treatment_key`, and their writer. |
| A2 — remove the malformed pasted artefact from `profile-scope.test.ts` | **LANDED-ALREADY** | The literal artefact occurs zero times; the file is uniformly LF (3,370 line endings). |
| B1 — retire the stale numeric export count | **LANDED-ALREADY** | `THE COUNT IS RETIRED` occurs once and the test derives the allowlist; `import-boundary.test.ts` is uniformly CRLF (1,817 line endings). |
| B2 — add the three missing ALLOW fixtures | **LANDED-ALREADY** | `ComparisonStratumError`, `ComparisonInputError`, and `RESULT_NOTE_MAX` each occur once in the ALLOW fixtures; the same CRLF check applies. |

**Code edits outside A1/A2/B1/B2: zero.** The only extra change was the owner's explicitly authorised documentation correction in `9a-review-manifest.md`: five amendments became seven, and the file count became 56 listed files / 57 including the separately listed lockfile.

## Review evidence and spend

**Reviewer spend: 8 agents over 2 rounds.** Round 1 reported **1 BLOCK / 12 CHANGE / 17 NOTE**. Round 2 reported **0 BLOCK / 11 CHANGE / 19 NOTE**. The two-round allowance is spent. The owner explicitly authorised one final fix pass to ship **UNREVIEWED**; no third round was run.

The convergence is unflattering: **8 of round 2's 11 CHANGEs were copy or comments introduced by the round-1 fix pass.** The structural cause is that copy claims mechanism while nothing binds that copy to behavior. A comment can say a guard exists while every executable check remains green after the guard is removed.

### The round-1 BLOCK and its closure

The entire Results path was unreachable. `metric.key` was treated as stored input even though it is `serverOwned`: `parseBrainContent` strips it and `writeBrainDoc` stores the stripped content. `declaredMetricOf` therefore returned `null` for real strategy documents, `/results` rendered `no_declared_metric`, and `recordResult` refused every submission.

**Why 4,176 green tests missed it:** the Results fixtures hand-built a strategy document containing the stored key that the real producer removes. A real `submitInterview` test already asserted that the key was absent, but no Results test crossed that producer boundary.

**Closure:** `metricKeyFromLabel` is now the sole key derivation; the metric fixture is faithful and omits a stored key; and a database end-to-end test crosses real interview submission → result writer → comparison. Planting the old code back reddens **six tests**, including cases that had previously passed with hand-built fixtures. Tenancy verified the closure by running that end-to-end test itself. This close-out's canonical test run also observed that end-to-end test pass before the separate `9a-G1` harness error.

## Gate results

Each exit code below was captured from the command itself. No command was piped through a summariser.

| Command | Exit | Observed result |
|---|---:|---|
| `docker compose -f respin/docker-compose.yml up -d` | 0 | Postgres was already running. |
| `pnpm -C respin typecheck` | 0 | Passed. |
| `pnpm -C respin worker:typecheck` | 0 | Passed. |
| `pnpm -C respin lint` | 0 | Passed. |
| `pnpm -C respin db:check` | 0 | Clean: `Everything's fine`. |
| `TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin test` | **1** | **159 test files and 4,206 tests passed**, then Vitest reported one unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` error and exited 1 after 261.09 s. This is `9a-G1`; the gate is not green. |
| `pnpm -C respin build` | 0 | Next production build completed, including `/results`. |

## Browser walk

**BLOCKED — not run and not claimed.** The owner confirmed the expected **USD 0.10–0.25** ceiling for 1–2 generations. The production build was started locally and reported Ready on `http://localhost:8000`. At **2026-09-04T14:53:30Z**, the first attempted navigation to `/results` was refused by the managed browser's admin-enforced security policy because localhost access is blocked. That policy also forbids bypassing the control through another browser surface or URL variant, so the walk stopped there.

**Observed spend:** USD 0; zero vendor calls; zero creator credits consumed. **Observed product evidence:** none—the app did not load in the controlled browser. Generation, the declared-metric screen, `recordResult`, comparison honesty, the confounder/truncation contradiction, slug display, refusal remedies, denominators, and verification labels all remain unwalked.

## Residuals — recorded / non-blocking, deliberately not fixed

| ID | Residual | Disposition |
|---|---|---|
| 9a-C1 | The confounder paragraph and the truncated branch can still contradict each other on one card. Builder C closed the sentence, not the class. The real fix is a test that renders a truncated card and reads **both** blocks; it was deliberately not built on an unreviewed pass. | **RECORDED / NON-BLOCKING** |
| R-112 | The performance log is **ungated** against PRD §4G's “View only” for Free. This is the first tier gate on a Results capability and needs an owner decision. | **RECORDED / NON-BLOCKING** |
| R-113 | **Any** strategy edit splits a creator's metric history, even when the metric declaration is byte-identical. Decide in 9b. | **RECORDED / NON-BLOCKING** |
| R-114 | The slug rule is a **stored-data format**, and every non-Latin label collapses to the literal `metric`. It is not reachable today. The first cross-profile reader of `metric_key` must key on `(profile_id, metric_key)`. | **RECORDED / NON-BLOCKING** |
| 9a-G1 | The canonical test command can exit non-zero after every test passes. Cause: birpc's hard 60 s `onTaskUpdate` timeout while PGlite WASM blocks the worker. 9a's contribution was removed; the repo-wide worst leakers are the money suites, with 45 `createTestDb` sites and zero closes. This close-out observed exit 1 after 4,206 passing tests. | **RECORDED / NON-BLOCKING** |
| 9a-D1 | `MIN_COMPARABLE_RESULTS` carries the phase-card rationale, not PRD **REQ-F03**'s “default 3”. | **RECORDED / NON-BLOCKING** |
| 9a-D2 | The narrow-read pin's scan population is **one file**; **three** `brain-ops.ts` call sites can reach `brainDocsByKind`. A population written as one path can narrow silently. | **RECORDED / NON-BLOCKING** |
| 9a-D3 | `credit_ledger` is absent from `tests/table-writers.test.ts`'s manual `TABLES` map. | **RECORDED / NON-BLOCKING** |
| 9a-U1 | Browser `maxLength` counts **UTF-16 code units**; the server refuses at **2,001 code points**. | **RECORDED / NON-BLOCKING** |
| 9a-U2 | `DeclaredMetric` carries no label, so the Results screen prints the **slug**, not the creator's words. | **RECORDED / NON-BLOCKING** |

## Final self-review

**Which claim in this report is the weakest, and what would prove it?** The weakest claim is the historical reviewer provenance in “tenancy verified the closure by running the end-to-end test itself.” The close-out contract records it, and this session independently observed the end-to-end test pass, but no preserved round-2 per-reviewer report is present in the repository. A preserved tenancy report with its exact command and raw passing output, or a new authorised tenancy review that reruns the test, would prove the reviewer-specific claim.
