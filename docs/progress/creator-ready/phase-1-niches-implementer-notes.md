# Phase 1 T8 niche entitlement implementer notes

## Decisions

- Read the niche allowance only through `respinCredits.trackedNicheEntitlementFor(scope.workspaceId, at)`.
- Use one `Date` instance for the niche entitlement and pasted-reference quote reads in the existing page `Promise.all`.
- Treat the page block as a courtesy; the existing action remains the write-time entitlement gate.
- At allowance zero, replace only the add form. Existing tracked rows and Remove controls remain available.
- Keep the tier-block copy static and plan-name-free: "This workspace's plan does not include tracking niches. The billing page shows what this workspace is on today."

## Files

- `respin/app/(product)/trends/page.tsx`
- `respin/app/(product)/trends/track-niche-panel.tsx`
- `respin/tests/trends-page.test.tsx`
- `respin/tests/trends-niche-ui.test.tsx` (new)
- `respin/e2e/journeys/solo-creator.spec.ts`

## Checks and results

- Red: `pnpm -C respin exec vitest run tests/trends-page.test.tsx tests/trends-niche-ui.test.tsx` -> 6 failed, 19 passed before implementation.
- Green: `pnpm -C respin exec vitest run tests/trends-page.test.tsx tests/trends-niche-ui.test.tsx` -> 25 passed.
- `pnpm -C respin exec eslint 'app/(product)/trends/page.tsx' 'app/(product)/trends/track-niche-panel.tsx' 'tests/trends-page.test.tsx' 'tests/trends-niche-ui.test.tsx' 'e2e/journeys/solo-creator.spec.ts'` -> passed with no output.
- `pnpm -C respin exec playwright test e2e/journeys/solo-creator.spec.ts --list` -> collected 1 Chromium journey.
- `pnpm -C respin typecheck` -> not green because concurrent Phase 1 work currently leaves errors in `studio/page.tsx`, `first-ideas-ui.test.tsx`, and `onboarding-ui.test.tsx`. The first run also caught an invalid refusal-code fixture in T8; after correction, the rerun reported no T8-owned file.
- `git diff --check -- <four tracked T8 source/test paths>` -> passed.
- `git ls-files --eol -- <four tracked T8 source/test paths>` -> all report `w/crlf`.
- Byte counts after the final edit: page 361 CR/361 LF; panel 132/132; page test 642/642; new UI test 68/68; solo journey 327/327. The solo journey began at 321/321 and its diff is limited to the conditional niche branch (12 added, 6 removed).
- Unicode check: the two production `Tracking` labels use the ASCII source escape `\u2026`, no mojibake spelling remains, and U+2026 resolves to code point 8230.

## AC11 evidence

- `trends-niche-ui.test.tsx`: allowance 0 renders `niche-disabled-tier`, removes the add form, and preserves the tracked row and Remove control.
- `trends-niche-ui.test.tsx`: allowance greater than 0 renders the form.
- `trends-niche-ui.test.tsx`: rendered tier-block copy matches the required literal and is checked against `ENTITLEMENT_TIERS` so no configured tier name appears.
- `trends-page.test.tsx`: page calls the facade after profile selection, uses the same `Date` object as `pastedReferenceQuote`, skips the facade on no-profile, and renders `UnknownEntitlementTierError` through `AccessRefusal` as `unknown_entitlement_tier`.
- `trends-niche-ui.test.tsx`: pending text renders U+2026 (`Tracking\u2026` in source); saved/refused states carry `niche-saved`/`niche-refused`; refused copy retains "Nothing was charged."

## Residuals

- The full solo-creator journey was collected but not executed; it requires the live app, database, Stripe test flow, worker, and model path.
- The repository-wide typecheck is awaiting concurrent Phase 1 changes outside T8.

Weakest bet: the conditional solo-creator branch is the first likely failure because it was syntax-collected but not exercised against a live Free and upgraded workspace.
