# Phase 7 — Accessibility: the creator's way in

Depends on: none. Owner: `respin-engineer`. Est. 4–5 h; **5–7 h with the 2026-10-05 additions** (an estimate).
**Read first:** the codebase review §1's **two corrections** — four of the five "silent" pages already pass `role="alert"` (what they lack is the focus island), and the marquee **is** covered by a global reduced-motion reset. Planning from the audit's wording alone would produce the wrong change in both places.

**Split per `.claude/gate-rules.md` §11 (plan-gate batch 0, 2026-09-21):** the earlier draft's Task 5 — thirteen unrelated one-attribute edits across `/settings/account`, `/trends`, the five data tables, the marketing landmark and the seven LOWs — is now **Phase 10** (`respin-audit-remediation-2026-09-19-phase-10.md`, depends on this phase). This phase keeps Tasks 1–4: the three Level-A/AA failures a creator meets on the way in, the class behind them, and the document titles. No requirement was lost: P7-R5's `/settings/account` and `/trends` halves are P10-R1, and P7-R6 in full is P10-R2…R7.

## Objective

Three Level-A or AA failures a creator meets on the way in, plus the class behind them. **Re-measured 2026-09-21 against the tree as it stands** (the uncommitted visual-v2 rewrite of `globals.css` and `respin-tokens.css` moved several of the audit's targets): the token `--text-4` was `#6B7280` / `#8A8F9B` and failed 1.4.3; it is now `#67657F` (light) / `#A5AEC8` (dark) and **passes everywhere** — but **no contrast arithmetic exists anywhere in `respin/tests`**, so nothing caught it then and nothing would catch the next regression; that test is now the requirement. The redirect-refusal focus island is documented in the repo, explained correctly in its own comment, and applied at three of eight sites. The Sample Spin's over-limit state no longer references `--danger-text` or `#b42318` (zero references today) but is still colour-only (`.sample-spin-over` swaps to `--check-ink`, `landing-demo.css:159-161`) with a silently disabled submit.

The fix for the second is the **class**: a `Banner` arrival prop, not five call-site edits. `banner.tsx:1-4` says callers own the a11y wiring "because WHEN a refusal announces depends on how it arrived… which only the call site knows" — which is exactly the thing a prop can carry.

## Critical Paths touched and gate selection

**Zero mapped Critical Paths.** Per `.claude/gate-rules.md` §10 that is not zero review: this phase owes **one independent generalist review** in a separate context, running the same checklist. Reserve the slot before the batch starts.

Row 13 edits the public Sample Spin panel's copy under zero paths. That surface is inside the claims canon already: `tests/marketing-claims.test.tsx:383-392` renders `/` with the public Sample Spin `preview` branch **proved taken** (`"NOTHING YOU TYPE IS KEPT"` asserted present) and scans the render against `FORBIDDEN_CLAIMS`, so the panel's initial-state copy is covered by the marketing render scan; the over-limit sentence is a client-state branch that scan cannot reach, so AC4 renders that branch and passes it through the same canon. Stated so the merged reviewer's cross-phase note has an answer rather than a gap.

## Requirements

- **P7-R1 (REG-32, HIGH — requirement changed 2026-09-21 from "fix the token" to "ship the arithmetic").** The audit's failing ratios are stale: `respin-tokens.css` now sets `--text-4: #67657F` (light, `:48`) and `#A5AEC8` (dark, `:79`), and recomputed against `--surface-1/2/3` (WCAG 2.x relative luminance, `node -e` over the hex values in the file) they are **light 5.61 / 5.05 / 4.60**:1 and **dark 7.71 / 6.90 / 5.83**:1 — every pair ≥ 4.5:1, so `--text-4` passes 1.4.3 for text at any size in both themes today. (The old values fail exactly as the audit said: `#6B7280` gives light 4.83 / 4.35 / 3.97 and dark 3.53 / 3.16 / 2.67.) What is **still true** is that no contrast arithmetic exists in `respin/tests`, so the fix was luck, not control. The requirement is therefore the **token-pair contrast test**: every text-bearing token paired against every surface it can render on, both themes, asserted ≥ 4.5:1 (or ≥ 3:1 for large text), with the population derived from the CSS rather than a hand list, and a revert probe proving it reddens on the old value. The consumer migration to `--text-3` becomes conditional: only if the test finds a pair that fails. `DESIGN.md`'s claim then points at the test rather than being stated.
  - **Amendment 2026-10-05 (register 2026-10-05 item 16, HIGH).** The token test as scoped cannot see either of the two Level-A/AA failures the new register measured, because both are outside its population:
    - **Inline links are colour-only.** `a` has `text-decoration: none` outside `:hover` (`app/globals.css:57-66`), and nothing else marks a link (1.4.1 / F73; link against text ≈ 1.49:1).
    - **The hero's "See pricing" CTA fails in light theme.** `.btn-secondary` is transparent with `--text-2` (`app/styles/controls.css:76-80`; `--text-2: #46415F`, `app/respin-tokens.css:46`) over the hero's `--scrim` (`rgba(9, 15, 34, 0.84)`, `:35`; applied at `app/styles/landing-base.css:71-79`), at ≈ 1.98:1 (1.4.3).
    So the scrim becomes a **surface** in row 1's population: the worst case composites `--scrim` over white, the lightest photo pixel. Row 1's out-of-scope note for hero text no longer holds for the CTA and the hero sub-line. P7-A1 carries the fixes.
- **P7-R2 (REG-33, HIGH — corrected scope).** A redirect-delivered refusal is announced *and reaches focus*. `Banner` gains an `arrival: "redirect" | "in-place"` prop that sets `role="alert" tabIndex={-1}` and mounts `FocusOnMount`; the five call sites migrate (`billing-view.tsx:283`, `usage-view.tsx:438-441`, `studio-view.tsx:60`, `first-ideas-view.tsx:48-51` — all of which already have the role and lack the focus — and `account-view.tsx:71-72`, which has **neither**; that fifth site stays in this phase so the requirement is whole, and `account-view.tsx`'s other items are Phase 10's). `FocusOnMount` moves out of `onboarding/` since it is no longer an onboarding concern. WCAG 4.1.3 / 3.3.1.
- **P7-R3 (REG-34, HIGH — corrected rationale).** The landing marquee gains a visible pause/play control, or renders static and animates only on hover/focus-within. The tags are content (mechanic names), and `prefers-reduced-motion` — which **is** globally honoured at `respin-tokens.css:96-98` (the audit's `:91` predates the uncommitted token rewrite) — is an OS setting, not the on-page mechanism WCAG 2.2.2 (Level A) requires. The phase card states the existing reduced-motion coverage so the finding is not overstated.
- **P7-R4 (REG-35, HIGH — half already landed).** The Sample Spin over-limit counter: the undefined `--danger-text` token is **already gone** (zero references in the tree; `.sample-spin-over` now uses `--check-ink`, `landing-demo.css:159-161`), so the colour half is done and AC4's grep pins it. What remains: the counter's **wording** changes when over the limit, not only its colour (1.4.1 — `sample-spin-panel.tsx:123-125` renders only `{used} / {maxCodePoints}`); and the disabled submit (`:126`) is linked to the reason with `aria-describedby` (3.3.2) — today only the textarea (`:120`) carries it.
- **P7-R5 (REG-36, MEDIUM — the titles, the input boundary and forced-colors; the `/settings/account` and `/trends` halves are P10-R1).** A `title` template plus per-page metadata, so every product surface stops sharing the document title "Respin" (2.4.2, Level A — only changelog, legal and `/for/[audience]` override today). **The population is every `page.tsx` under `app/(product)/`**, measured 2026-09-21 with `find app -path '*/(product)/*' -name page.tsx` = **11** (`brain`, `onboarding`, `onboarding/first-ideas`, `onboarding/interview`, `results`, `settings/account`, `settings/billing`, `studio`, `studio/frameworks`, `trends`, `usage`) — not the audit's "12+", and not the flat `app/(product)/*/page.tsx` glob, which misses the four nested routes. Text inputs get a perceivable boundary — re-measured: input `--surface-2` against panel `--surface-1` is 1.11:1 (light) / 1.12:1 (dark), but the input already carries `border: 1px solid var(--border-strong)` (`controls.css:9`), and `--border-strong` is 4.64:1 (light) / 6.21:1 (dark) against `--surface-1`, so the audit's "border 1.21:1" no longer holds; the requirement is that the test in row 1 asserts the border pair too, and the boundary changes only if it fails. Forced-colors: the audit's `globals.css:135-141` `outline: none` is gone — the file is 134 lines and `:129-134` now sets `outline: 2px solid Highlight` under `@media (forced-colors: active)`; what remains is `controls.css:30-36`'s `input:focus { outline: none }` outside that media block, which the forced-colors override must be asserted to beat, plus the "fires on mouse focus" half (`:focus` versus `:focus-visible`).
- **P7-R6 → Phase 10.** The mojibake and the seven LOWs (REG-37) are P10-R2…R7, each with the production file it edits and its own AC. Nothing of REG-37 remains in this phase.

### 2026-10-05 register additions

Homed here from `docs/progress/audit/2026-10-05.md`. Every `file:line` below was re-read on 2026-10-05.

- **P7-A1 (item 16 — HIGH).** Two fixes, one per failure:
  - **Prose links get a non-colour cue.** An underline rule applies to prose links (`app/globals.css:57-66`), with chrome links (nav, buttons) exempted by class, not by default.
  - **The hero's secondary CTA uses the over-photo inks.** A `.hero .btn-secondary` override sets `--on-photo-*` text and border (`respin-tokens.css:33` declares `--on-photo-accent`).
  The P7-R1 amendment adds `--scrim`-over-white as a surface in `tests/token-contrast.test.ts` (row 1), in both themes, and asserts the CTA pair at ≥ 4.5:1. A computed-style assertion that prose `a` has a non-`none` `text-decoration` in its resting state is added beside it. Proof: AC8.
- **P7-A2 (item 34's Sample Spin half — MEDIUM). The Sample Spin run drops focus and never announces.** The textarea and submit carry `disabled={busy}` (`app/(marketing)/sample-spin/sample-spin-panel.tsx:119,126`), so focus is lost when the run starts, and the form unmounts on completion with no status announcement. **Fix:** the `aria-disabled` + `aria-busy` pattern `onboarding/submit-button.tsx` documents, so focus stays on the submit; a `role="status"` region is **pre-mounted** with the panel, empty until the run ends. At completion it receives **one sentence** (the run finished, or why it did not), never the result body. The result renders **outside** that region, and focus moves to the result heading. This is the `studio/piece-confirmation.tsx:168-180` pattern that P10-A1 makes shared. Proof: AC9.


## Tasks

| Task | Work | File rows |
|---|---|---|
| 1 | The contrast test first — derive the pairs from the CSS, assert them, prove the revert probe reddens. The token and consumer migration only if a pair fails | 1–3 |
| 2 | `Banner` arrival prop; `FocusOnMount` relocation; five call sites | 4–10, 17 |
| 3 | Marquee control; Sample Spin counter wording and the submit's `aria-describedby` | 11–13 |
| 4 | Title template and per-page metadata (eleven pages); the input-boundary and forced-colors assertions; the wiring test | 14–16, 18 |
| 5 | 2026-10-05: the scrim surface and link cue in the contrast test, the prose-link underline and the hero CTA inks (A1); the Sample Spin's `aria-disabled`, status and focus (A2) | 1, 12, 13, 18, 19 |

## Files to create / modify

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `tests/token-contrast.test.ts` | N | The arithmetic that has never existed: population derived from `respin-tokens.css` + every `color:` rule in `globals.css` and `app/styles/*.css`; both themes; the `#6B7280` revert probe |
| 2 | `app/respin-tokens.css` | M | Only if row 1 finds a failing pair (today `--text-4` passes 4.60–5.61 light / 5.83–7.71 dark); otherwise a comment pointing at the test |
| 3 | `DESIGN.md` | M | The claim made executable, pointing at the test |
| 4 | `app/ui/banner.tsx` | M | `arrival` prop |
| 5 | `app/ui/focus-on-mount.tsx` | N | Relocated from `onboarding/` |
| 6 | `app/(product)/onboarding/focus-on-mount.tsx` | M | Re-export or removal (importers: `brain-view.tsx`, `interview-view.tsx`, `onboarding-view.tsx`) |
| 7 | `app/(product)/settings/billing/billing-view.tsx` | M | `arrival="redirect"` (`:283`) |
| 8 | `app/(product)/usage/usage-view.tsx` | M | `arrival="redirect"` (`:438`) — its `<table>` `scope="col"` is Phase 10 row 11 |
| 9 | `app/(product)/studio/studio-view.tsx` | M | `arrival="redirect"` (`:60`) |
| 10 | `app/(product)/onboarding/first-ideas/first-ideas-view.tsx` | M | `arrival="redirect"` (`:48`) |
| 11 | `app/(marketing)/landing-sections.tsx` | M | Marquee pause control (`MarqueeTags`, `:28`) — the marketing `<main>` landmark is Phase 10 rows 15–16 |
| 12 | `app/styles/landing-base.css` | M | Marquee paused state (`.marquee-track`, `:145-150`) |
| 13 | `app/(marketing)/sample-spin/sample-spin-panel.tsx` | M | Over-limit wording (`:123-125`); `aria-describedby` on the submit (`:126`) |
| 14 | `app/layout.tsx` | M | Title template (`metadata`, `:9-11`) |
| 15 | `app/(product)/**/page.tsx` | M | Per-page `metadata` export — every `page.tsx` under `app/(product)/`, eleven files today (P7-R5 lists them) |
| 16 | `app/styles/controls.css` | M | `input:focus` (`:30-36`) — `:focus-visible` and no `outline: none` that the forced-colors block in `globals.css:129-134` must out-specify; boundary only if row 1's border pair fails |
| 17 | `app/(product)/settings/account/account-view.tsx` | M | `arrival="redirect"` on the refusal banner (`:71-72`, the fifth P7-R2 site) — **only** that; the two disabled buttons and the retype label are Phase 10 row 1 |
| 18 | `tests/a11y-wiring.test.tsx` | N | Arrival wiring on the five sites (the `<FocusOnMount>` + `tabIndex={-1}` static assertions), the eleven titles, the forced-colors specificity/order assertion, the over-limit branch through the claims canon |
| 19 | `app/globals.css` | M | P7-A1: the prose-link underline (`:57-66`), with the chrome exemption by class |

**2026-10-05 addendum: 19 rows (18 + 1).** Row 1 gains the scrim surface and the link cue, row 12 (`landing-base.css`) the hero CTA override, row 13 the Sample Spin `aria-disabled`/status/focus, and row 18 the Sample Spin wiring case.

**18 rows; within the 25-row authoring target of `.claude/gate-rules.md` §11.** The earlier 29-row draft was split at Task 5 (now Phase 10, 17 rows); both counts are derived from their tables. Three files appear in both phases (`account-view.tsx`, `usage-view.tsx`, `landing-sections.tsx`) with disjoint edits, and Phase 10 depends on this phase, so the two never run concurrently on one checkout (2026-08-02 lesson). The task→row ranges above are derived from the table.

## Edge cases and external failures

| Condition | Handling | Requirement |
|---|---|---|
| Row 1's derived population finds a failing pair the audit did not name | Fix that token or move that consumer; the test decides, not the eye. If `--text-4` itself fails on a surface not in the measured three, the ink hierarchy against `--text-3` (light 5.81, dark 7.27 on surface-3) is the constraint on the raise | P7-R1 |
| The contrast test needs a colour-space library | It does not: sRGB relative luminance is ~15 lines and a dependency for it would be the kind the codebase's rule 5 asks a reason for | P7-R1 |
| A token is used for text somewhere the test does not know about | The test's population is the CSS itself — every rule that sets `color` with a token, paired against the surfaces it can render on — not a hand list of selectors. Rule 7 | P7-R1 |
| `arrival="in-place"` is the wrong default for an existing caller | The default is `"in-place"` (today's behaviour), so migration is explicit and no call site changes silently | P7-R2 |
| The marquee control clutters the hero | Static-with-hover is the alternative and needs no control. Either satisfies 2.2.2 | P7-R3 |
| The over-limit sentence introduces a claim the canon forbids | AC4 renders the over-limit branch and passes it through `FORBIDDEN_CLAIMS`, the same canon `tests/marketing-claims.test.tsx` applies to the initial render | P7-R4 |
| Per-page metadata collides with a route's dynamic rendering | A static `metadata` export per surface is enough; no route needs `generateMetadata` for a fixed title | P7-R5 |
| The uncommitted visual-v2 rewrite of `globals.css` / `respin-tokens.css` is reverted or re-split before this phase runs | Every number in P7-R1/R5 was measured 2026-09-21 against the working tree, not `HEAD`. The phase re-runs the `node -e` luminance check and the `find` count on entry and corrects the card, not the plan, if they moved | P7-R1, P7-R5 |

## Verification and acceptance

| # | Criterion | Evidence |
|---|---|---|
| AC1 | Every token pair that can render text computes ≥ 4.5:1 (or ≥ 3:1 for ≥ 18.66 px bold / 24 px), in **both** themes, asserted by a test whose population is derived from the CSS; the table it prints includes `--text-4` at 5.61 / 5.05 / 4.60 (light) and 7.71 / 6.90 / 5.83 (dark) on surfaces 1/2/3, and setting `--text-4` back to `#6B7280` turns it red (light surface-3 3.97, dark 2.67) | card quotes the computed table and the revert probe |
| AC2 | A redirect-delivered refusal on all five migrated pages carries `role="alert"` and `tabIndex={-1}` in the rendered markup, and the rendered element tree contains `<FocusOnMount targetId=…>` naming that banner's id — the same static assertion `onboarding-ui.test.tsx:2265-2272` already makes for `onboarding-refusal`, because `FocusOnMount` renders `null` and `renderToStaticMarkup` never runs effects. **"Receives focus on mount" is not asserted here** (no live render in this phase, see Out of scope); the test's name says "wires focus", not "moves focus" | card quotes the five assertions |
| AC3 | The marquee can be paused from the page without an OS setting; the existing reduced-motion coverage is stated, not overstated | card quotes the control and `respin-tokens.css:96-98` |
| AC4 | The over-limit counter changes its **words**, carries no hardcoded red, and the disabled submit names its reason through `aria-describedby`; `--danger-text` and `#b42318` have zero references (already true today — the grep pins it against return); the rendered over-limit sentence passes `FORBIDDEN_CLAIMS` | card quotes the rendered text, the grep and the canon pass |
| AC5 | Every `page.tsx` under `app/(product)/` exports its own `metadata` title — **eleven** today (`find app -path '*/(product)/*' -name page.tsx \| wc -l`), asserted by row 18 as "count of page files = count of distinct titles", so a twelfth page is a red test, not a silent "Respin" | card quotes the eleven titles and the count |
| AC6 | The input's boundary pair (`--border-strong` on `--surface-1`/`--surface-2`, ≥ 3:1 — 4.64 / 4.17 light, 6.21 / 5.56 dark today) is in row 1's asserted table; a focused control keeps a visible indicator under forced-colors (`globals.css:129-134` beats `controls.css:33`'s `outline: none`, asserted by specificity/order in row 18, not by a browser) | card quotes the ratios and the rule |
| AC7 | Entry gate clean | card quotes the four results |
| AC8 | `token-contrast.test.ts` derives `--scrim`-over-white as a surface and asserts the hero secondary CTA ≥ 4.5:1 in both themes. Reverting the override is red. A resting prose `a` has a visible non-colour cue, and deleting the rule is red | card quotes the two ratios, the revert run and the link assertion |
| AC9 | Rendering the Sample Spin and pressing run keeps `document.activeElement` on the submit (`aria-disabled`), the pre-mounted status region gains exactly one sentence and contains no result text, and focus moves to the result heading. `a11y-wiring.test.tsx` asserts the wiring; the live announcement stays unverified (R-133) | card quotes the wiring assertions |

### Requirement → AC mapping

Every requirement has an AC (tabulated 2026-09-21). AC7 is the entry gate and maps to no single requirement.

| Requirement | AC(s) |
|---|---|
| P7-R1 | AC1 |
| P7-R2 | AC2 |
| P7-R3 | AC3 |
| P7-R4 | AC4 |
| P7-R5 | AC5, AC6 (the `/settings/account` and `/trends` halves are Phase 10 AC1) |
| P7-A1 | AC8 |
| P7-A2 | AC9 |
| P7-R6 | Phase 10 AC2–AC7 (moved whole under the §11 split; a pointer, not a requirement of this phase) |

## Definition of done

Every AC passes; the independent generalist review reports PASS (§10 — zero mapped paths still owes one); report card **Ready**; one card, one ledger line.

## Reachability

A creator who lands on `/settings/billing`, `/usage`, `/studio`, `/onboarding/first-ideas` or `/settings/account` carrying a redirect-delivered refusal has it announced and wired for focus (`Banner arrival`, rows 4 and 7–10, 17 — the five views ship migrated in this phase); a visitor on `/` can pause the marquee (row 11) and, over the Sample Spin limit, reads a changed sentence with the disabled submit's reason linked (row 13); every product page a creator opens carries its own document title (rows 14–15). The contrast test (row 1) and the wiring test (row 18) are reached by `pnpm -C respin test`.

## Least confident

Whether deriving the contrast test's population from the CSS is tractable — a token used in a rule whose element could render on any of three surfaces has three pairs, and the surface is not always statically knowable. The honest fallback is to assert the **worst** surface for every text-bearing token, which is stricter than reality and cannot silently pass. That is the version to ship if the derivation fights back; the card says which was used.

## Out of scope

Every live-render property: forced-colors behaviour in a real browser, **whether focus actually moves on mount** (AC2 asserts the wiring only), screen-reader announcement order, mobile layout at ≤ 720 px, and text-over-photograph contrast on the hero. This phase, like the audit, computes and asserts statically. The light theme doubling every contrast failure the moment a toggle ships is parked in the audit's own parked list and stays there. The surface-wide items — landmarks, table scope, the seven LOWs, the account and trends items — are Phase 10.
