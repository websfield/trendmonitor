---
name: verifying-webapps
description: Use when proving a web UI change works in a real browser — "verify the page", "check it in the browser", "test it in the browser", "does the page still work", "did I break the site", "does the restyle work", "e2e", "screenshot the change", Playwright / Cypress / Puppeteer — or before a review-phase card claims a UI phase is Ready. Discovers the project's existing browser harness before configuring anything, defines readiness by assertion (never by sleep or networkidle), and fixes the evidence shape at one line per check. Not for visual taste or design direction — that is the designing-uis skill.
---

# Verifying web apps

Proof that a change works in the browser, at the cost the change earns — never a harness built to prove it.

## 1. Discover before you configure

- Look for an existing harness first: `playwright.config.*`, `cypress.config.*`, `puppeteer` in `package.json`, `vitest` browser mode, a `browse` / Playwright skill, `e2e/`, `tests/e2e`. Read its config, its fixtures and one existing spec; reuse them.
- None found? Say so and **ask** before installing any browser stack. Installing browsers, adding a runner or writing a config is a dependency decision the person makes.
- Auth, seed data, or a server you cannot start → the check is **unverified**. Report it as unverified, never as Ready.

## 2. Readiness is a locator or an assertion

- Wait for the thing you are about to assert (`expect(locator).toBeVisible()`, a response you awaited), not for time. `sleep`, `waitForTimeout` and `networkidle` are not readiness — they pass on a broken page and flake on a slow one.
- One check = one user-visible outcome (text, state, URL, network effect). Assert the outcome, not the implementation (never "the class name is present").

## 3. What counts as proof

- **A screenshot proves rendering, not persistence.** Reload, re-query or read the store before claiming "saved".
- A check must be able to fail: run it once against the planted defect or the pre-change build when that is cheap; a check that only mirrors the implementation is not evidence.
- Evidence is **one line per check**: `<command> · exit <code> · <assertion that held>`. No transcripts, no screenshot galleries. Redact test credentials before the line reaches the record.

## 4. Do not build

- No source scanners, screenshot matrices, viewport × page grids, or bespoke runners to prove a restyle. Verify the two or three journeys the change touches at the viewports `DESIGN.md` names; if the plan wants more, it says so.
- Do not add a browser stack to a project that verifies by unit tests and manual QA — record `browser check: unverified (no harness)` and move on.
- Stop only processes this run started; reuse a server that is already up.

## Report

In the pack's words: Ready / Almost / Not yet. Ready only when every claimed check has its evidence line; a missing browser, fixture or auth → `unverified` on the card, never Ready.
