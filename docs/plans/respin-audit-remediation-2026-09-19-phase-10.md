# Phase 10 — Accessibility: surface-wide titles, landmarks and tables (split from Phase 7 per gate-rules §11)

Depends on: Phase 7 (the `Banner` arrival prop, the relocated `FocusOnMount` and the `tests/a11y-wiring.test.tsx` file this phase extends all land there; three files — `account-view.tsx`, `usage-view.tsx`, `landing-sections.tsx` — are edited by both phases with disjoint edits, so this phase runs after, never beside). Owner: `respin-engineer`. Est. 2–3 h; **5–7 h with the 2026-10-05 additions** (an estimate).
**Read first:** Phase 7's objective and its two codebase-review corrections; the plan-gate batch-0 generalist report's §11 disposition (`docs/progress/respin-audit-remediation-2026-09-19-plan-review.md`, "§11 plan-size finding") — this file exists because Phase 7's Task 5 was thirteen unrelated one-attribute edits with ~40 line citations, the shape the reviewer's simulation fidelity was lowest on.

## Objective

The items REG-36 and REG-37 name that are **not** on a creator's way in but are on every surface once they are in: document landmarks, table header scope, labelled repeated controls, inline-error association, disabled-control reasons, one encoding defect in product copy, and the focus-dropping `disabled={busy}` pattern this repo already measured and rejected once (`onboarding/submit-button.tsx:64-71`). Each is small; together they are the class "a control or a region the assistive-technology user cannot name". Every item here names the **production file it edits** (rule 7 — a test row is not a fix), which is what pushed Phase 7 past the §11 target.

Nothing here changes a token, a colour or a number Phase 7 measured; Phase 7's recomputed contrast figures (`--text-4` light 5.61 / 5.05 / 4.60, dark 7.71 / 6.90 / 5.83; `--border-strong` 4.64 / 4.17 light, 6.21 / 5.56 dark) are the authority and are not re-measured here.

## Critical Paths touched and gate selection

**Zero mapped Critical Paths.** Per `.claude/gate-rules.md` §10 that is not zero review: this phase owes **one independent generalist review** in a separate context, running the same checklist. Reserve the slot before the batch starts. Inherited from Phase 7 (the parent's selection), as §11 requires of a split.

No row here edits a claims-scanned marketing sentence: the `<main>` landmark and skip link (rows 15–16) add structure, not copy, and `tests/marketing-claims.test.tsx` re-renders those pages regardless, so a stray sentence would be caught there.

## Requirements

Ids carry the Phase 7 requirement they came from.

- **P10-R1 (from P7-R5 — REG-36's `/settings/account` and `/trends` halves, MEDIUM).** `/settings/account`'s two disabled destructive buttons link their reason banners with `aria-describedby` (today `account-view.tsx:137` `disabled={!props.journalConfigured}` and the identity-deletion sibling sit beside unlinked reason banners), and the workspace name the user must retype stops being conveyed by placeholder alone (`:131` `placeholder={props.workspaceName}` — the name moves into the label text or an adjacent element, and the placeholder may stay as a duplicate). `/trends` renders its `<h1>` before its `<h2>`s (today `TrackNichePanel`'s `<h2>` at `track-niche-panel.tsx:69` is composed before `TrendsView`'s `<h1>` at `trends-view.tsx:332`, `trends/page.tsx:347-360`), labels its N identical "Remove" buttons with the niche they remove (`track-niche-panel.tsx:110`), and stops truncating the niche input at 80 characters silently (`:88` `maxLength={80}` gains a visible count or a stated limit).
- **P10-R2 (from P7-R6 — REG-37, LOW: the mojibake).** The two `â€¦` sequences in `brain-view.tsx:518,626` (`pendingLabel="Creating a new draftâ€¦"`, `pendingLabel="Updating your declared metric…"` — user-visible text, in an uncommitted edit, the line-ending/encoding lesson surfacing as product copy) become the ellipsis they were meant to be; the card records `git ls-files --eol` and the file's encoding after the fix.
- **P10-R3 (from P7-R6, LOW: disabled controls without a reason).** `recover-deletion`'s submit (`app/(auth)/recover-deletion/page.tsx:49`, `disabled={!op || !s}`) names its reason through `aria-describedby`; studio's disabled mode picker (`studio/studio-panel.tsx:286`, `disabled={parent !== null}`) names why a revision cannot change mode.
- **P10-R4 (from P7-R6, LOW: a label on a non-labelable element).** The `aria-label` on a generic `<span>` (`trends-view.tsx:123`, `<span className="badge" aria-label="Stale item">`) — `aria-label` is not reliably announced on a `<span>` with no role; the badge gets a role or its text is made sufficient.
- **P10-R5 (from P7-R6, LOW: inline errors).** Interview inline errors are associated with their `aria-invalid` fields through `aria-describedby` (`onboarding/interview/interview-view.tsx:120-155`).
- **P10-R6 (from P7-R6, LOW: table scope and landmarks).** `scope="col"` on every `<th>` of all five data tables — the population is every file under `app/` containing `<table` (measured 2026-09-21: `app/ui/ledger-table.tsx`, `usage/usage-view.tsx`, `(admin)/admin/activation/activation-view.tsx`, `(admin)/admin/config/config-view.tsx`, `(admin)/admin/model-spend/model-spend-view.tsx`; none of their `<th>` carry `scope`), asserted by a scan over that population rather than a hand list. A `<main>` landmark and a skip link on the marketing pages: there is **no** `app/(marketing)/layout.tsx` (verified absent 2026-09-21) — the marketing pages compose `LandingHeader`/`LandingFooter` from `landing-sections.tsx` directly, so the landmark lands **in a new `app/(marketing)/layout.tsx`** (row 16; the one form that covers `/`, `/legal`, `/changelog` and `/for/[audience]` without touching each page), with the skip-link target id on the `<main>` it renders and the header's first focusable as the link's home (row 15).
- **P10-R7 (from P7-R6, LOW: the busy pattern).** `auth-form.tsx:131,139`'s `disabled={busy}` becomes the `aria-disabled` + `aria-busy` pattern `onboarding/submit-button.tsx:64-71` documents from a real-browser measurement ("`disabled` removes the element from the focus order, so the browser drops focus to `<body>`"), so a sign-in press does not drop a keyboard user's place.
  - **Amendment 2026-10-05 (register item 46's sub-item).** One more producer of the pattern: the visual spec locks it in. `e2e/visual/visual.spec.ts:328` asserts `toBeDisabled()` on the sign-in/sign-up "Working…" button. It becomes an `aria-disabled="true"` assertion plus a focus-stays assertion, in the same change as the `auth-form.tsx` edit, or the visual run reddens on the fix.


### 2026-10-05 register additions

Homed here from `docs/progress/audit/2026-10-05.md`. Every `file:line` below was re-read on 2026-10-05, except where a sub-item says it was not.

- **P10-A1 (item 34's live-region half — MEDIUM; a rule-7 shape). The D-L1 live-region fix reached only part of its population.** Completion is announced only where a status region is filled on mount. `generation-outcome.tsx:764-765` wraps the **whole draft** in `role="status"`. The correct pattern already exists: a pre-mounted status region whose text changes on completion (`app/(product)/studio/piece-confirmation.tsx:168-180`).
  **The producer population** is every client component that awaits a server action through `useActionState`, measured 2026-10-05 with `grep -rln "useActionState\|useFormState" app --include=*.tsx`. That gives **21** files:
  - admin: `admin/config/config-view.tsx`;
  - brain: `brain/edit-form.tsx`;
  - onboarding: `candidate-safety-panel.tsx`, `first-ideas/first-ideas-panel.tsx`, `first-ideas/first-ideas-result.tsx`, `run-inference-panel.tsx`, `run-outcome.tsx`;
  - results: `log-outcome.tsx`, `log-panel.tsx`, `promotion-panel.tsx`;
  - studio: `entrances.tsx`, `feedback-block.tsx`, `frameworks/framework-panel.tsx`, `generation-outcome.tsx`, `lineage-view.tsx`, `piece-confirmation.tsx`, `saved/revise-panel.tsx`, `studio-panel.tsx`;
  - trends: `paste-panel.tsx`, `spin-panel.tsx`, `track-niche-panel.tsx`.
  **Fix:** one shared `CompletionStatus` component (in `app/ui/`) on the `piece-confirmation.tsx` pattern. It is mounted before the press and carries one short completion sentence, never the result body. `generation-outcome.tsx` drops `role="status"` from the draft wrapper. A test lists the 21 producers, asserts each renders `CompletionStatus` or sits on a written exemption with its reason, and asserts the list equals the grep, two-way. A 22nd producer is red until listed. Live announcement stays unverified (R-133, never a blocker). Proof: AC9.
- **P10-A2 (item 34's truncation half — MEDIUM). Silent `maxLength` truncation contradicts the repo's recorded rule and its own copy.** The rule is at `app/(product)/trends/paste-panel.tsx:205` ("NO `maxLength` (the onboarding precedent)"). The copy is `run-copy.ts:1043-1044` ("your words are kept exactly as you typed them"), shown beside `entrances.tsx:248`'s `maxLength={ownIdeaMax}`.
  **The population**, measured with `grep -rn "maxLength=" app --include=*.tsx`, is **13 sites in 7 files**: `results/log-panel.tsx:449`; `studio/entrances.tsx:248`; `studio/feedback-block.tsx:112,304`; `studio/frameworks/framework-panel.tsx:163,192,235,271,283`; `studio/studio-panel.tsx:265,278,289`; `trends/track-niche-panel.tsx:88`.
  **Fix:** remove every attribute. Each field states its limit as visible text with a live count, and the existing server refusal stays the control: refuse, never truncate. A source scan asserts zero `maxLength=` under `app/**`, with a planted one red. Phase 3's P3-R2 amendment keeps its new textarea in this shape. Proof: AC10.
- **P10-A3 (item 46's new sub-items — LOW).**
  - **Meter semantics.** `app/ui/meter.tsx:60` sets `role="meter"`; its value attributes are asserted against WAI-ARIA `meter` (`aria-valuenow`/`min`/`max` and a text alternative), or the role is changed.
  - **Located at build.** The auto-top-up toggle's touch target, the small sign-in targets, the colour-only "hot" tags and the hand-copied `/for/*` fixture (`app/(marketing)/for/[audience]/page.tsx` is the route) are re-located by the build first step. This addendum did not pin their lines. Each is fixed to WCAG 2.2 2.5.8 (24 px) or 1.4.1, as applicable.
  - **Deferred.** The mobile drawer's tab order is A11Y-1, accepted as a known defect under R-133 (`todos.md` T-22). It stays there.
  Proof: AC11.

## Tasks

| Task | Work | File rows |
|---|---|---|
| 1 | `/settings/account`'s two reason links and the retype label; `/trends`' heading order, labelled Remove buttons and visible truncation | 1–4 |
| 2 | The mojibake; the two disabled-control reasons; the `<span>` label; the interview error association; the busy pattern | 4–10 (row 4 is the `<span>` label; this range read 5–10 until the 2026-09-21 Codex re-check) |
| 3 | `scope="col"` across the five tables; the marketing `<main>` landmark and skip link | 11–16 |
| 4 | The wiring test's Phase-10 assertions (table scope, labels, landmarks, associations) | 17 |
| 5 | 2026-10-05: the completion-status producers (A1); refuse-not-truncate (A2); meter semantics and the re-located a11y LOWs (A3); the visual spec's `aria-disabled` (P10-R7 amendment) | 6, 18–23 |

## Files to create / modify

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `app/(product)/settings/account/account-view.tsx` | M | Two disabled destructive buttons linked to their reason banners (`:137` and the identity sibling); the retype name in the label, not only the placeholder (`:131`). The banner's `arrival="redirect"` at `:71-72` is Phase 7 row 17 and is not touched here |
| 2 | `app/(product)/trends/page.tsx` | M | Heading order (`TrackNichePanel` composed before `TrendsView`, `:347-360`) |
| 3 | `app/(product)/trends/track-niche-panel.tsx` | M | Labelled Remove buttons naming their niche (`:110`); visible truncation on the 80-character input (`:88`) |
| 4 | `app/(product)/trends/trends-view.tsx` | M | The `aria-label` on a generic `<span>` (`:123`) |
| 5 | `app/(product)/brain/brain-view.tsx` | M | Mojibake (`:518,626`) |
| 6 | `app/(auth)/auth-form.tsx` | M | `disabled={busy}` (`:131,139`) → the measured `aria-disabled` pattern |
| 7 | `app/(auth)/recover-deletion/page.tsx` | M | The disabled submit's reason (`:49`) |
| 8 | `app/(product)/onboarding/interview/interview-view.tsx` | M | Inline errors associated with their `aria-invalid` fields (`:120-155`) |
| 9 | `app/(product)/studio/studio-panel.tsx` | M | The disabled mode-picker's reason (`:286`) |
| 10 | `app/(product)/onboarding/submit-button.tsx` | M | Its documented pattern exported (or its comment cited) so row 6 reuses rather than re-derives it — a comment-only edit if the component already exports what `auth-form` needs |
| 11 | `app/(product)/usage/usage-view.tsx` | M | `scope="col"` on its table — Phase 7 row 8 owns this file's `arrival="redirect"`; disjoint edit |
| 12 | `app/ui/ledger-table.tsx` | M | `scope="col"` |
| 13 | `app/(admin)/admin/activation/activation-view.tsx` | M | `scope="col"` |
| 14 | `app/(admin)/admin/config/config-view.tsx`, `app/(admin)/admin/model-spend/model-spend-view.tsx` | M | `scope="col"` (one row: same one-attribute edit on the two remaining admin tables) |
| 15 | `app/(marketing)/landing-sections.tsx` | M | The skip link in `LandingHeader` targeting the layout's `<main>` — Phase 7 row 11 owns this file's marquee control; disjoint edit |
| 16 | `app/(marketing)/layout.tsx` | N | `<main>` landmark for `/`, `/legal`, `/changelog`, `/for/[audience]` — **new**, no marketing layout exists |
| 17 | `tests/a11y-wiring.test.tsx` | M (created by Phase 7 row 18 — absent on disk 2026-09-21, so this row edits a file that exists only once Phase 7 has landed) | Extends Phase 7's file: `scope="col"` on every `<th>` in every `<table`-bearing file under `app/` (population derived by scan), the Remove-button names, the `<main>` landmark on all four marketing renders, the `aria-describedby` associations (account ×2, recover-deletion, studio picker, interview fields), zero `â€¦` in the tree, and `auth-form`'s `aria-disabled` |
| 18 | `app/ui/completion-status.tsx` | N | P10-A1: the shared pre-mounted completion region |
| 19 | `tests/live-region-producers.test.ts` | N | P10-A1: the 21-producer list equals the `useActionState` grep two-way, and each producer uses `CompletionStatus` or carries its exemption; P10-A2: zero `maxLength=` under `app/**`. A planted 22nd producer and a planted `maxLength` are each red |
| 20 | the 21 producer files listed in P10-A1 | M | P10-A1: each renders `CompletionStatus`, and `generation-outcome.tsx:764-765` drops the draft-wide `role="status"`. One row: one substitution across a measured list, on the Phase 8 row-9 precedent |
| 21 | the 7 files carrying the 13 `maxLength` sites listed in P10-A2 | M | P10-A2: attribute removed, visible limit and live count added. One row: one substitution across a measured list |
| 22 | `app/ui/meter.tsx` | M | P10-A3: `meter` value attributes, or the role changed (`:60`) |
| 23 | `e2e/visual/visual.spec.ts` | M | P10-R7 amendment: `:328`'s `toBeDisabled()` becomes `aria-disabled` plus focus-stays |

**2026-10-05 addendum: 23 rows (17 + 6), within the 25-row target.** Rows 20 and 21 are measured lists of 21 and 7 files. They are listed in P10-A1/A2 rather than as separate rows, the Phase 8 row-9 precedent for one substitution across a list.

**17 rows; within the 25-row authoring target of `.claude/gate-rules.md` §11.** Sixteen of the seventeen came from Phase 7's rows 17–29 (row 10 is new: the reuse seam for the busy pattern, so row 6 does not re-derive a measured fix); Phase 7's row 27 was split into rows 13–14 so no row names three files. The task→row ranges above are derived from the table.

## Edge cases and external failures

| Condition | Handling | Requirement |
|---|---|---|
| The mojibake returns on the next editor save | It is an encoding defect: the card records `git ls-files --eol` and the file's encoding after the fix, and row 17 greps the tree for the sequence so a return is a red test | P10-R2 |
| A sixth `<table>` appears after this phase | Row 17's population is every `<table`-bearing file under `app/`, derived by scan, so the new table's `<th>` without `scope` is a red test, not a silent omission | P10-R6 |
| A marketing page renders its own `<main>` already | Verified 2026-09-21: none of the four does (no `app/(marketing)/layout.tsx`, pages compose header/footer directly). If one is added later, two `<main>` landmarks is exactly what row 17's "exactly one `<main>` per marketing render" catches | P10-R6 |
| Naming the niche inside the Remove button's accessible name leaks a stored niche into a `data-testid`-shaped attribute | It is an `aria-label` composed from the niche the row already renders as visible text on the same line; nothing not already on screen is added | P10-R1 |
| `aria-disabled` lets a double-submit through on `/sign-in` | The measured pattern at `submit-button.tsx` already handles this: the handler refuses while `pending`, and `aria-disabled` is the announcement, not the guard — the same as the money-spending control it was measured on | P10-R7 |
| Phase 7 has not landed when this phase starts | It cannot start: the arrival prop, the relocated `FocusOnMount` and `tests/a11y-wiring.test.tsx` are Phase 7's and this phase extends them. Dependency stated, not assumed | all |

## Verification and acceptance

| # | Criterion | Evidence |
|---|---|---|
| AC1 | On `/settings/account` both disabled destructive buttons carry `aria-describedby` naming their reason banner, and the retype label's text contains the workspace name; on `/trends` the `<h1>` precedes every `<h2>`, every "Remove" button has an accessible name naming its niche, and the niche input's limit is visible | card quotes the two `aria-describedby` targets, the label text, the heading order, one button name and the visible limit |
| AC2 | Zero `â€¦` sequences in the tree; `brain-view.tsx`'s encoding and `git ls-files --eol` line quoted | card quotes the grep and the eol line |
| AC3 | The `recover-deletion` submit and the studio mode picker each carry `aria-describedby` naming an element whose text states the reason | card quotes both associations |
| AC4 | `trends-view.tsx:123`'s badge has a role that carries its label, or the `aria-label` is gone and the visible text suffices | card quotes the rendered element |
| AC5 | Every interview field with `aria-invalid="true"` carries `aria-describedby` naming its inline error | card quotes the rendered pairs |
| AC6 | Every `<th>` in every `<table`-bearing file under `app/` carries `scope="col"` (five files today, population derived by scan; a planted sixth without scope turns it red); each of the four marketing renders contains exactly one `<main>` and a skip link whose `href` targets it | card quotes the scan, the plant and the four landmark assertions |
| AC7 | `auth-form.tsx`'s two submit controls render `aria-disabled` and `aria-busy` while busy and never `disabled` | card quotes the rendered attributes |
| AC8 | Entry gate clean | card quotes the four results |
| AC9 | `live-region-producers.test.ts` is green, and a planted 22nd `useActionState` file is red. `generation-outcome.tsx` has no `role="status"` around the draft. Each producer's completion sentence is a one-line status, never the result body | card quotes the list, the plant and the wrapper diff |
| AC10 | Zero `maxLength=` under `app/**`, and a planted one is red. An over-limit own idea is refused by the server with the limit named, never truncated. `DEVELOP_IDEA_HELP`'s "kept exactly as you typed them" holds | card quotes the scan, the plant and the refusal |
| AC11 | `meter.tsx`'s role and value attributes pass the a11y wiring test. Each re-located sub-item is quoted with its line and its fix. A11Y-1 is cited as accepted under R-133 | card quotes each |

### Requirement → AC mapping

Every requirement has an AC (tabulated 2026-09-21; the generalist found P7-R6's seven LOWs AC-less — each now has its own). AC8 is the entry gate and maps to no single requirement.

| Requirement | AC(s) |
|---|---|
| P10-R1 | AC1 |
| P10-R2 | AC2 |
| P10-R3 | AC3 |
| P10-R4 | AC4 |
| P10-R5 | AC5 |
| P10-R6 | AC6 |
| P10-R7 | AC7 |
| P10-A1 | AC9 |
| P10-A2 | AC10 |
| P10-A3 | AC11 |

## Definition of done

Every AC passes; the independent generalist review reports PASS (§10 — zero mapped paths still owes one, inherited from Phase 7); report card **Ready**; one card, one ledger line.

## Reachability

A creator on `/settings/account` reads why a destructive button is disabled and what to retype (row 1); on `/trends` a screen-reader user hears the page title before its sections and can tell which niche each Remove button removes (rows 2–3); a creator on `/brain` no longer reads `â€¦` in a pending label (row 5); a keyboard user signing in keeps their place while the form is busy (row 6); a visitor on `/`, `/legal`, `/changelog` or `/for/[audience]` can skip to `<main>` (rows 15–16, via `LandingHeader`); an admin or a creator reading any of the five tables gets column headers announced per cell (rows 11–14). Every assertion is reached by `pnpm -C respin test` through row 17.

## Least confident

Whether the marketing `<main>` belongs in a new layout or in the shared header/footer pair. The layout is chosen because it covers all four routes in one file and cannot be forgotten by a fifth marketing page; the cost is one more file in a route group that has never had a layout, and if the layout turns out to interfere with a page's own structure (a page that already renders a top-level wrapper the landmark should not nest inside), the fallback is the shared-component form — `LandingHeader` opening `<main>` and `LandingFooter` closing it — which the card records if taken.

## Out of scope

Everything Phase 7 lists: live-render properties, focus movement, announcement order, mobile layout, hero photograph contrast, the light-theme toggle. Nothing here re-measures a contrast number; Phase 7's figures stand.
