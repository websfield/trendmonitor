# Slice 9b — proposal to approved brain update

**Status: ALMOST — engineering and review complete; browser acceptance blocked by admin policy (2026-09-05).** This is not Ready. The frozen implementation contract is [the 9b phase plan](../../plans/respin-finish-phase-9b.md); this card records only earned evidence and residuals.

## What is being integrated

- `@respin/brain` is the sole deterministic proposal constructor/mint. DB persistence receives a mint-validated draft and the app never receives a draft/payload construction API.
- Promotion proposals and immutable result/feedback evidence joins are scoped creator data, registered for writers, readers, export, and deletion.
- Result/feedback evidence is creator-reviewable only. `quantified_self_reported` may support a review proposal but remains `early`; connector verification has no v1 writer; activation is never automatic.
- Performance-learning access is config-driven, and days-to-empty is a ledger-only estimate using the configured 30-day window and three-debit-day threshold.

## Evidence status

| Evidence class | Current status |
|---|---|
| Engineering implementation | Complete at the focused/static/live/build level on the current tree: typecheck, worker typecheck, lint, and `db:check` exit 0; the late 8c-W2/9a-D3 closeout set passes 4 files / 424 tests; live PostgreSQL concurrency runs in the canonical zero-skip shape; production build exits 0; the rebuilt local server reached Ready on port 8000. The final canonical run executed all 169 files / 4,382 tests with zero failures/skips, then exited 1 solely on the known `9a-G1` unhandled reporter timeout, so the canonical gate is not called green. An earlier stable-tree run exited 0; it does not erase this final non-zero evidence. |
| Focused boundary instruments | 309/309 in the six owned suites on 2026-09-05 after `credit_ledger` joined the exact-writer population. This is focused engineering evidence only; it is not a complete entry-gate claim. |
| Browser acceptance | Blocked by an admin-enforced policy rejecting `http://localhost:8000` and explicitly prohibiting alternate browser surfaces or circumvention. No substitute evidence is claimed. |
| Independent Critical-Path review | Complete. Specialist round 2 returned billing PASS and tenancy PASS; the remaining learning/compliance assertion gaps were fixed and parent-verified under the two-round cap. Final general review found one immutable-result BLOCK, whose exact action/writer path was repaired and rechecked PASS. After the closeout audit's three-file copy/test diff, the same final reviewer found two Low rationale/comment truth defects; both were corrected and its exact-fix recheck returned PASS. The additive simplification review proposed no required change; its optional deletions were declined because they would weaken audit clarity without changing behaviour. |
| PRD §5 pilot/product-efficacy evidence | Unearned; fixtures and local tests cannot satisfy it |

## Named residuals and deferrals

| ID | Status | Detail |
|---|---|---|
| 9b-I1 | Closed 2026-09-05 — focused evidence | The Credits owner added the exported `assertUsageRunwayScope` gate to every public runway chain. `profile-cage.test.ts` structurally registers assertion predicates that narrow `unknown` to `WorkspaceScope`, includes `assertUsageRunwayScope`, `usageRunwayInTx`, `usageRunwayFor`, `usageRunwayForWithReaders`, the credits facade, and `usageRunwayDebits`, and proves a planted assertion predicate without `assertScoped` remains uncovered. The six owned suites passed 307/307. |
| 9b-I2 | Closed 2026-09-05 — focused evidence | The product heading is now “Brain update proposals”. `results-honesty.test.tsx` scans the rendered product card/review/current/history/export surface with `FORBIDDEN_CLAIMS ∪ PERFORMANCE_CLAIMS`; it retains planted forecast and efficacy specimens and separately attributes creator-authored metric labels. The six owned suites passed 307/307. |
| 9a-G1 | Reproduced / non-blocking, unchanged | The final zero-skip canonical run passed 169 files / 4,382 tests with zero failures/skips, then exited 1 on the known unhandled `onTaskUpdate` reporter timeout. This slice records the non-zero result and does not claim it complete or redesign 9a. |
| 9a-D3 | Closed 2026-09-05 | `credit_ledger` is now in the manual exact-writer population. The scanner identifies only `balance.ts::insert` and `ledger.ts::insert`, with the reviewed append-only reasons stated beside them. |
| 8c-W2 | Closed 2026-09-05 | `/usage` now renders all three creator-paid charge paths: Studio generation, creator-brain construction, and pasted-reference autopsy. A source-derived direct-debit guard pins `autopsy_claim`, and the rendered page test reads all three. |
| 9a browser walk | Blocked, unchanged | Managed-browser localhost policy prevented the 9a walk. 9b must run its own acceptance path or remain ALMOST. |
| 9b browser walk | Blocked 2026-09-05 | The production app was running locally first, but the managed browser rejected localhost under an admin-enforced policy. The required paid/reject/feedback/Free/pause/operational/runway interaction matrix is unearned. |
| Connector verification | Deferred | No v1 connector writer exists; `connector_verified` remains unreachable. |
| PRD §5 metric 2 | Deferred | Requires the post-M6 real-creator pilot, not seeded fixtures. |

## Documentation decisions now in force

R-112 and R-113 are amended in `docs/initial/decisions.md`: the strict learning entitlement, exact metric tuple identity, self-report cap, connector limitation, and 30-day/three-debit-day rationale are canonical. Deployment order is additive DB migration → compatible code → config materialisation. Old code is safe only before materialisation; after it, use forward-compatible code or roll forward.

9a remains **ALMOST — engineering complete, evidence incomplete**. Nothing in this card makes a 9a residual, browser block, or PRD §5 pilot requirement disappear. 9b is also **ALMOST**: its implementation and review gates are complete, but the creator interaction matrix is unearned while the admin localhost policy remains in force.
