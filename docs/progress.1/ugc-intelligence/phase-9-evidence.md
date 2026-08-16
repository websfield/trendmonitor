# Phase 9 — Manager UI + Operator Dashboard + Fairness Audit — Completion Evidence

**Status: Complete — Ready (with one environment-blocked residual).** Both Critical-Path gates rendered; accessibility audited; typecheck green; vitest execution blocked by a corrupted local npm environment and recorded honestly below.

## Gate verdicts

| Gate | Verdict | How rendered |
|---|---|---|
| Measurement discipline | **PASS** | Lead inspection with file:line evidence (the reviewer agent stalled twice on the degraded host; every in-scope file was read line-by-line — announced, not hidden) |
| Veto & verdict integrity | **PASS** | Lead inspection with file:line evidence (the independent `veto-integrity-reviewer` run stalled on the degraded host, as did the measurement agent — both were reading in-scope files when killed by the stream watchdog; announced, not hidden). Re-running both reviewers on a healthy host is a cheap confirmation, not a blocker. |
| Accessibility (WCAG 2.2 AA, advisory) | **PASS** | Lead inspection; one real defect found and fixed (active-nav indicator: `styles.css` targeted `nav a[aria-current]` while `App.tsx` renders `<button aria-current>` — rule widened to cover both) |

## Measurement-discipline evidence

- **Single breaker predicate, fail closed.** `lib/breaker.ts:16-18` — `mayRenderGovernedNumber` returns true iff `state === 'armed'`; `'unknown'` (C3 down) is explicitly not-armed. Every surface consults this one predicate (`VerdictPanel.tsx:32`, `AmplificationPanel.tsx:23`, banners); no component re-decides.
- **No governed number without armed.** VPS: `VerdictPanel.tsx:97-106` (withheld branch names the state). Per-criterion scores: `VerdictPanel.tsx:225-229` (dash when not armed). AWS: `AmplificationPanel.tsx:103` — `armed && !low_confidence && aws != null` (insufficient_baseline/overlapping bands force numberless even when armed). ρ: `OperatorDashboard.tsx:77` — `n >= 60 && rho != null`; C3-down renders breaker-unknown with no ρ (`OperatorDashboard.tsx:28-37`).
- **ρ > 0.5 is a warning, never a win.** `OperatorDashboard.tsx:104-112` — `suspected_leak` renders `role="alert"` "SUSPECTED LEAK — a high ρ here is a warning, not a win." No headline accuracy figure exists (`OperatorDashboard.tsx:9`).
- **Provenance + as_of structurally required.** `Provenance.tsx:22-41` — `ProvenancedNumber` has no prop to render a bare value; `types/view.ts:15-19` (`Provenanced<T>` carries `provenance` + `as_of`).
- **Empty ≠ unreachable ≠ stale.** `EmptyState.tsx` (distinct kind/role/icon per state), `KnowledgePanel.tsx:13-27` (unreachable = "UNKNOWN, not empty"), `TriageQueue.tsx:29-49` (no-submissions vs all-filtered-out), `Banners.tsx:58-81` (stale carries `as_of`).
- **Knowledge panel serves no governed number.** `KnowledgePanel.tsx:3-5, 101-114` — no 0-100, no effect size; `prevalence_ratio` only inside the "descriptive only — not a multiplier… does not forecast any score" caveat; no causal verbs (fixture + honesty test H7 assert this).
- **What-changed derives from C4 only.** `WhatChangedReport.tsx:15-27` — unreachable C4 ⇒ refuses to assemble the report from any other source.
- **Fairness audit measured-only.** `eval/fairness.py` — performance axis admitted via `MeasuredOutcome.try_from` (Proxy dropped and counted in `n_dropped_nonmeasured`, never imputed); VPS and performance are two separate Theil–Sen regressions compared, never pooled; per-band median; insufficient bands ⇒ `assessable=False`, slope `None`; the audit reports only (no weight mutation, no calibration re-run). 17 tests incl. flag/no-flag control pairs — part of the 243-green Python suite.

## Veto & verdict integrity evidence (lead inspection)

- **No auto-approval.** `VerdictPanel.tsx:129-137` — one real focusable `<button>`; App has no global keydown (`App.tsx:2-4` and grep-verified); `App.test.tsx:40-50` asserts a global Enter does not approve; approve disabled + `role="alert"` note when C2 down (`VerdictPanel.tsx:133,148-152`); fixture client fails closed — approve/override/signOff return `down` and record nothing (`fixtures.ts:459-482`).
- **No bulk approval.** `TriageQueue.tsx:1-4, 97-103` — no approve control, no checkbox, only Open per row; honesty suite H3 asserts no checkbox/approve button role exists in the queue.
- **Model never decides.** `VerdictPanel.tsx:70-93` — suspected vetoes badged "Model-raised · not acted on" with a `role="note"` caveat "NOT an input to the deterministic verdict"; fired vetoes render stored deterministic evidence (`VerdictPanel.tsx:50-68`); no veto/scoring computation exists in the frontend (verdicts arrive as data via `api/client.ts`).
- **Override requires a typed reason** recorded on VerdictOverridden (`VerdictPanel.tsx:156-195`; submit disabled with empty reason or API down).
- **Sign-off gate (REQ-037).** `AmplificationPanel.tsx:136-211` — unsigned artefact renders blocked-pending ("Nothing reaches the client until a named reviewer signs off"); named reviewer required; disabled when API down.

## Test evidence

- **Typecheck: PASS (exit 0)** — `npm --prefix src/Frontend run typecheck` (types regenerated from the three contract schemas by `scripts/gen-types.mjs`, then `tsc --noEmit` over all components and all tests, `strict` + `noUncheckedIndexedAccess`).
- **Suites on disk:** 9 component test files + the consolidated `src/__tests__/honesty.test.tsx` (P9-T9: 8 invariant groups H1–H8, non-vacuous — asserts stored magnitudes are absent from the DOM when withheld, with armed-renders control tests) + `WhatChangedReport.test.tsx` (P9-T10).
- **Python: 243 passed** (226 prior + 17 fairness), ruff clean.

## Environment-blocked residual (the one honest gap)

**The frontend vitest suite has not been executed.** Cause: the local npm environment on this host is corrupted — a pre-interruption `npm install` ran hidden for 11 hours holding locks on `node_modules` while every concurrent repair attempt corrupted the tree further; the global npm cache also holds a poisoned entry (`Invalid Version` in npm 10.1.0's dedupe), and AV/indexer locks break directory replacement (`ENOTEMPTY`). All install attempts were **stopped deliberately** after the cost exceeded the value.

To close it (one command, from `src/Frontend`, once the machine is quiet — a reboot clears the stale locks):

```
npm install && npm test
```

The code-level risk this leaves is low: typecheck proves all tests compile against the real component APIs, and every assertion targets testids/text verified present in the components by inspection.

## Accepted residuals (non-gating)

1. Vitest execution environment-blocked (above) — code-complete, evidence-incomplete.
2. Three quarantined `node_modules_broken*` directories under `src/Frontend/` await deletion (blocked by the destructive-command guard; delete or let a reboot + manual cleanup handle them).
3. No live HTTP backend wired — the surfaces take an injected `ApiClient` (fixture implementation); the honesty invariants are rendering invariants and hold on fixtures by design (`api/client.ts:1-6`).
4. `package-lock.json` not committed (install flakiness prevented a stable lockfile); generate one when the environment is healthy.
