# Phase R5 — Frontend accessibility

**Depends on:** none. **Primary agent:** `frontend-engineer`. **Gates:** `accessibility-critic` (audit lens) + `code-reviewer` on the diff. (No dedicated Critical-Path reviewer agent for accessibility; `review-phase` covers.)

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **What you're building:** React/TS frontend that **renders honesty; never invents a number**.
- **Golden rule 5:** Match the codebase — follow the existing component/CSS patterns (e.g. the Approve path's `data-testid="approved-stamp"` `role="status"`).
- **Golden rule 6:** Report honestly — vitest is environment-blocked (phase-9-evidence); if it cannot run, say so, do not claim "tests pass".
- **Available agents:** `frontend-engineer`, `accessibility-critic`, `code-reviewer`.

## Requirements Checklist (functional)

1. **#9 (HIGH):** programmatic focus on view/route transitions — on route change and on open-submission/back-to-queue, move focus to the new section's heading (`ref` + `.focus()` on a `tabIndex={-1}` heading) or announce via a live region. (`App.tsx:130-152`, `:159-173`.)
2. **#14 (MEDIUM):** the verdict override path gets a `role="status"` confirmation mirroring `approved-stamp`; `overrideOpen` + reason textarea reset on success. (`VerdictPanel.tsx:156-195`.)
3. **#15 (MEDIUM):** primary action buttons `min-height: 44px` for `.btn-approve`, `override-submit`, `signoff-submit`. (`styles.css:62-69`.)
4. **#22-24 (LOW, UI):** SPA `document.title` updates per route (`index.html:6`); disabled submit buttons get `aria-describedby` explaining why (`VerdictPanel.tsx:191`, `AmplificationPanel.tsx:200`).

## Requirements Checklist (technical)

- WCAG 2.4.3 (Focus Order), 4.1.3 (Status Messages), 2.5.8 / the audit's stricter 44px primary-action bar.
- No number is invented or rendered that isn't sourced (honesty suite discipline).
- Changes are additive to existing components; no restyle beyond the named selectors.

## Edge Cases & Failure Paths

- **#9:** focus target must exist before `.focus()` (guard the ref); back-to-queue returns focus to a sensible heading, not lost to `<body>`.
- **#14:** the `role="status"` must announce on success only (not at mount) to avoid stale AT chatter (matches the existing approved-stamp behavior).
- **Degraded mode:** if vitest cannot execute, verification falls to typecheck + reviewer inspection + (optional) a Playwright/manual a11y check; the block is reported, not hidden.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R5-T1 | Focus management on route + open/close-submission | frontend-engineer | `src/Frontend/src/App.tsx` |
| R5-T2 | Override `role="status"` confirmation + form reset on success | frontend-engineer | `src/Frontend/src/verdict/VerdictPanel.tsx` |
| R5-T3 | 44px min-height on primary action buttons | frontend-engineer | `src/Frontend/src/styles.css` |
| R5-T4 | `document.title` per route | frontend-engineer | `src/Frontend/src/App.tsx` / `index.html` |
| R5-T5 | `aria-describedby` on disabled submit buttons | frontend-engineer | `VerdictPanel.tsx`, `AmplificationPanel.tsx` |
| R5-T6 | Component/honesty tests for the above (if vitest runnable) | frontend-engineer | `src/Frontend/src/**/*.test.tsx` |

## Files to Create / Modify

`src/Frontend/src/App.tsx`, `verdict/VerdictPanel.tsx`, `AmplificationPanel.tsx`, `styles.css`, `index.html`; tests under `src/Frontend/src`.

## Verification Steps

1. `npm --prefix src/Frontend run typecheck` → 0 errors. (State: R5-T1..T5.)
2. `npm --prefix src/Frontend test` (vitest) → green **if the env runs**; if it still fails on the corrupted local npm env, record the exact error and fall back to reviewer + manual a11y inspection (DR4). (State: R5-T6.)
3. Manual/Playwright check: tab through a route change → focus lands on the new heading; override success announces via `role="status"`.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R5-1 (#9):** route/open/back transitions move focus to the destination heading. (evidence: code + test/manual)
- **A-R5-2 (#14):** override success shows a `role="status"` confirmation and resets the form. (evidence: `VerdictPanel.tsx` line + test)
- **A-R5-3 (#15):** `.btn-approve`/`override-submit`/`signoff-submit` are 44px tall. (evidence: `styles.css` line)
- **A-R5-4 (#22-24):** `document.title` changes per route; disabled submits have `aria-describedby`. (evidence: file:line)
- **A-R5-5:** typecheck green; vitest green **or** the block reported honestly with the failing command.

## Out of Scope

No backend, no schema, no new component. Do not invent metrics. Do not restyle beyond the named selectors.

## Completion Criteria (DoD)

Typecheck green; vitest green or block reported (DR4); `accessibility-critic` finds the four items resolved; `code-reviewer` PASS.
