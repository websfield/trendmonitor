# Plan review — Respin M0 (Skeleton)

**Readiness: Ready · Grade: A- · An implementer can build all four phases from the plan text alone; six small non-blocking polish items remain, none of which gates execution.**

Reviewed: docs/plans/respin-m0-master-plan.md, respin-m0-phase-1..4.md, respin-m0-brief.md, docs/progress/respin-m0-codebase-review.md — verified against docs/initial/build-plan.md, tech-spec.md, PRD.md, decisions.md, NORTH_STAR.md, .claude/workspaces.json, .claude/guardrails.rules.json, .claude/agents/.

## Round-2 residual fixes — verified present (all 6)

| Item | Where verified |
|---|---|
| Phase-3 "fail closed" echo removed | phase-3 Degraded mode + Clerk-down failure-modes row: honest JWT-cache claim, explicit no-"fully fail closed" wording |
| Phase-2 stale REQ-A04 to M2 citation | phase-2 Inverse events: deletion to build-plan M6, export to build-plan M2 |
| Default-deny lint (allowImportNames / subpath split) | phase-2 Handoff "Audience split"; phase-3 technical checklist item 3 + task 6 |
| Seed-guard test + AC | phase-2 task 5 (dev-guarded), task 6 (seed-refuses-nonlocal), AC-8 |
| M6 accept-when deletion criterion in build-plan | build-plan.md line 52 (deletion half named) and line 54 accept-when ("deletion path exercised in test") |
| Race-row wording | phase-3 failure-modes: "the branch, not the constraint alone, is the guarantee" |

## Execution simulation (walked task-by-task as respin-engineer)

- PASS Phase 1 — all 6 tasks executable: file paths concrete, configs enumerated, CI patterned on cutdown.yml (exists), workspaces.json note-only entry confirmed at the stated location, decisions.md append target confirmed (highest entry R-15, so R-16/R-17 numbering is correct). eslint --inspect-config is hedged with "or the installed equivalent" (golden rule 9), so the interactive-tool risk is absorbed.
- PASS Phase 2 — all 8 tasks executable: schema columns fully specified, scripts named, export surface pinned. Least-confident bet (drizzle-kit db:check semantics) already carries its own fallback (generate-and-diff keeping the acceptance meaning) — probed, holds.
- PASS Phase 3 — all 7 tasks executable: URL topology pinned in URL terms, admin gate specified fail-closed in middleware, bootstrap post-conflict branch specified structurally, lint guard specified default-deny with an installed-API fallback. Least-confident bet (Drizzle on-conflict semantics) hedged with "pre-seeded conflict, no mocks" — holds.
- PASS Phase 4 — all 5 tasks executable: env inventory has count parity with Phase 3 handoff (4/4), secret-grep regex covers Clerk/Stripe key shapes, Vercel-config least-confident bet carries the dashboard-settings fallback — holds.
- PASS Handoffs — P1-P2 (workspace resolution, CI file), P1-P3 (URL topology), P2-P3 (exact @respin/db exports; "changing them re-opens this phase"), P3-P4 (env inventory), P4-M1 (runbook + ledger as ground truth): all pinned by producer and cited by consumer.

## Pre-mortem (assume M0 shipped and failed)

- ABSORBED Duplicate workspace under concurrent first login — phase-3 post-conflict resolve-existing branch + AC-2 (PGlite serialized ceiling honestly marked).
- ABSORBED Empty admin allowlist admits everyone — phase-3 fail-closed requirement + AC-4 (empty-denies-all test).
- ABSORBED Route handler bypasses withWorkspace via createDb + the sql tag — default-deny sanctioned-surface lint, phase-3 task 6 / AC-5 (class, not field).
- ABSORBED Secret in client bundle / committed file — phase-3 AC-6, phase-4 VS-2/AC-3, guardrails respin-public-env-secret + secret rules (all four cited guardrail IDs exist in guardrails.rules.json).
- ABSORBED CI silently never runs on respin changes — phase-1 failure-modes row + VS-6 + AC-5.
- ABSORBED Vacuous green lint from inherited root config — phase-1 AC-4 provenance proof.
- ABSORBED Seed lands in a real database — phase-2 dev-guard + AC-8 + phase-4 runbook wording.
- ABSORBED Credential-bound criteria claimed done — engineering-vs-evidence split in master Exit Demonstration + phase-4 AC-5.
- ABSORBED Vercel subdir deploy not expressible in file config — phase-4 least-confident + failure-modes row (documented dashboard fallback).
- ABSORBED Brief "How this fails" causes 1-3 — evidence split (P4), config bleed (P1 AC-4 + task 5), tech-spec section-1 drift (P1 checklist citations + import-direction lint).

## Mechanical consistency

Passed: coverage parity (env vars 4/4; roles verbatim per REQ-A02; deferral receivers verified in build-plan M2/M6 text); closure (task-file lists reconcile with Files-to-Create/Modify in all four phases; respin-engineer and respin-tenancy-reviewer exist in .claude/agents/); every AC is PASS/FAIL with a concrete evidence pointer; all four "Least confident" lines non-empty and individually probed (each carries its own hedge); recurring-cost rows present for all four external services.

Findings (none blocking):

1. [LOW, confidence high] Master plan, Deferral Ledger — the Neon-based concurrency test has no row. Phase-3 AC-2 promises "a Neon-based concurrency test before M1's money paths land on this bootstrap", tracked only by an in-code SHORTCUT marker. Build-plan M1 does not name it and the ledger has no row, so nothing structurally forces M1 to pick it up. Fix: one ledger row, receiver "M1 (before money paths use bootstrap)".
2. [LOW, confidence high] Master plan, Derived Budgets — "build-plan M0 verbatim" is not verbatim. Build-plan M0 lists "typecheck, lint, test, migration check"; the table adds "build" and still claims verbatim. The addition is right; the provenance word is wrong. Fix: "build-plan M0 + build (deploy sanity)".
3. [LOW, confidence medium-high] Phase 1 VS-8 / master Exit Demonstration — "no new failures vs current green" assumes the repo entry gate is currently green. CLAUDE.md documents known breakage (three UGC suites still read the old docs/initial/schemas/ path) and docs/progress/entry-baseline.md does not exist. The phases' Completion Criteria wording ("no new failures repo-wide") is executable, but the implementer should be told to record the baseline file on the first entry-gate run if it is red, per CLAUDE.md's own DoD mechanism.
4. [NOTE, confidence high] Phase 3, task 6 wording vs its checklist. The task-table shorthand ("createDb/schema/migrate/raw-SQL forbidden") reads denylist-shaped; the technical-checklist item it implements mandates default-deny via allowImportNames or a subpath split. The checklist governs and is unambiguous, but the shorthand could steer a skimming implementer to the exact denylist the plan forbids.
5. [NOTE, confidence medium] Phase 3 — the scoped-accessor surface is unenumerated. withWorkspace "returns a scoped query surface" and the suite iterates "the exported scoped-accessor map", but the plan never names the minimal M0 accessor set (workspace read + membership read is all the shell needs). Derivable, so executable — but naming it would remove the one invention the implementer must make. Related: the ensureUserWorkspace call site (the (product) layout) is implied by the master-plan decision table, not stated in a task.
6. [NOTE, confidence medium] Phase 3 — the route matcher is protect-listed, public-by-default. /studio(.*) and /admin(.*) are protected; any future URL prefix (e.g. M1 /api/* routes other than webhooks) is public until someone extends the matcher. Fine for M0's surface; worth one line in the handoff to M1 ("new protected prefixes must be added to the matcher — the default posture is public").
7. [NOTE, confidence medium] Small executability crumbs, each self-resolvable: "non-local host" for the seed guard is undefined (implementer parses DATABASE_URL for localhost/127.0.0.1 — fine); docs/progress/respin-m0/ledger.md is "created at build start" but no phase task creates it (orchestrator convention — Phase 4 task 5 appends to it, so the first writer should touch-create it); an empty app/api dir cannot exist in git without a placeholder (Phase 1 hedges this for packages/ but not for api/); Phase 3's Files list labels respin/middleware.ts "Modified (new)" — it is new.

## Consolidated reviewer findings (all rounds)

- respin-tenancy-reviewer round 1 (NEEDS CHANGES; 5 CHANGE + 5 NOTE): URL topology / route-group collision — fixed (master-plan decision row + P1 handoff + P3 URL-term matcher); admin gate in layout — fixed (middleware gate; layout demoted to defense-in-depth); REQ-A04 deferral record — fixed (ledger rows + verified build-plan receivers); PGlite race-test honesty — fixed (AC-2 SHORTCUT ceiling); sanctioned-export bypass class — fixed (default-deny). All verified applied.
- respin-tenancy-reviewer round 2 (NEEDS CHANGES, "narrow miss"): 2 residual lines + 4 NOTEs — all 6 verified applied (table above). The reviewer's own condition — "fix those two lines and this passes on re-read" — is met.
- plan-reviewer (this review): findings 1-7 above, none blocking.

## Verdict

READY

Recommended (non-blocking, cheapest at build start): add the Neon-concurrency-test ledger row (finding 1); correct the "verbatim" provenance word (finding 2); record docs/progress/entry-baseline.md on the first entry-gate run if red (finding 3); align phase-3 task-6 shorthand with its checklist line (finding 4).

*Ask `/go` to explain any finding in plain words — or to just fix them.*
