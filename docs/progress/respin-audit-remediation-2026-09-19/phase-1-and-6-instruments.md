# Instruments and the pre-rewrite red list — Phases 1 and 6, 2026-09-20

**This file is the measurement Phase 6 Task 1 owes, and it is dated ahead of the rewrites on purpose.** Task 1 reads: *"The scanner first … Record which sentences go red before any copy changes,"* and *"Task 1 precedes Task 2 … the scanner's red list is the evidence that the rewrite was necessary and complete."* The repair that failed batches 3 and 4 did Task 2 and Task 3 and never did Task 1, which is why a false claim shipped unguarded on the Free tier. Everything below was measured before any marketing copy was touched in this session.

**Re-homing.** This work was logged against the visual-v2 Phase 1 gate; it belongs to remediation **P1-R4** and **P6-R1…R7**. Owner decision 2026-09-20: re-home it, recorded as **R-132** in `docs/initial/decisions.md`. Evidence lives here from now on.

**Every figure below names the run it came from.** Nothing is carried over from the batch-3 or batch-4 records; five stale counts shipped in certifying artefacts in the previous session and none of them is reused here.

---

## 1. The instrument: `respin/tests/landing-pricing.test.ts` (P6-R2)

**Before.** The file pinned three lines per tier — price, credit allowance, profile count — and read nothing else. Nine of the twelve feature lines were prose no test had an opinion about.

**After.** The population is `PRICING[].lines[]` itself, compared **both ways** against a pin table. Each pin names an authority (a config key, an exported tier table, a schema column, a path on disk) and evaluates it against the shipped tree. A line with no pin fails. A pin naming no line fails. The numeric pins are keyed by a string *built from* the authority, so a changed number leaves a line unpinned and a pin unclaimed, and both halves say so.

**Non-vacuity, in the same file:** the real predicate is driven against an unpinned line and a false pin, and one probe per *kind* of authority (missing config key, missing schema column, missing route file) proves each kind can return false — beside three positive probes proving the kinds the cards actually use are live.

### The red list — run: `pnpm vitest run tests/landing-pricing.test.ts`, 2026-09-20, start 22:53:20 local, **17 passed / 2 failed** (2 failing cases naming 3 lines)

Three lines, on two tiers. **None of the three was cited by any reviewer in batches 1–4.**

| Tier | Line | What the tree says |
|---|---|---|
| Creator | `Results log and approval-gated brain proposals` | The results→proposal path is closed. `buildResultProposalDraft` refuses any evidence row that is not `connector_verified` (`packages/brain/src/proposal.ts:229-232`); `recordResult` has no branch and no parameter that can reach that state (`packages/db/src/with-workspace.ts:5168`); `/results` tells creators in `CONNECTOR_NOT_OFFERED` that "this product holds no such connection yet". Proposals from **session feedback** do ship (`packages/db/src/promotion-ops.ts:183-198`) — a different source the line does not name. |
| Studio | `3 seats with roles` | **No authority at all.** No seat key in `CONFIG_V1_SEED`, no seat cap in `packages/config/src/schema.ts`, and no invite path: the only two `insert(memberships)` sites in the tree are `packages/db/src/bootstrap.ts:132` (the signed-in person, as owner) and `packages/db/src/seed.ts:237`. `packages/db/src/app-server.ts:35` states it: "until 10b-2 introduces seat caps there is no capacity to…". A Studio subscriber gets a workspace exactly one person can ever be in. |
| Studio | `For teams running several accounts` | Rests on the same absent seat authority. Only the "several accounts" half is real (`CONFIG_V1_SEED.profileCaps.studio = 5`). |

**This is a fourth unshipped capability sold on the pricing table**, beside the three the audit's item 28 named (the weekly digest, the trends feed, the learning loop). It was found by the instrument, not by a citation — which is the argument for building the instrument first.

### Lines the instrument passes, with their authorities

**This section used to hold a 13-row table, and the batch-5 billing gate was right to reject it.** `PRICING[].lines[]` holds **16** entries. The three with no row were exactly the three lines this session created — Creator's `Brain proposals from your feedback, approval-gated`, and Studio's two replacements for the seat lines — so the authority table published under a post-rewrite heading was the **pre-rewrite** passing set, and a reader auditing the change could not check the three lines that most needed checking. That is the sixth stale count this programme has shipped inside a certifying artefact, in the file whose own preamble promises every figure names its run.

**The table is deleted rather than corrected, and that is the fix.** A hand-maintained mirror of a machine-checked table is a second authority, and it will drift again the next time a line changes. The authorities live in `respin/tests/landing-pricing.test.ts`'s `numericPins` / `CAPABILITY_PINS`, where each is a `LinePin` carrying the citation a reader checks and a `holds()` the suite evaluates against the tree — in **both** directions, so a line with no pin and a pin with no line each fail by name. To read the current authority for any line, read that table; to know whether it holds today, run the file.

Run: `pnpm -C respin vitest run tests/landing-pricing.test.ts`, 2026-09-21 — **26 passed** (was 21 before the batch-5 repairs added the fenced-capability pin kind, the absolute-quantifier rule, the meter-note derivation and the comment-stripping probe).

**Two observations recorded rather than acted on — and the batch-5 billing gate reversed both calls, correctly (2026-09-21).** They are kept here as written, with what happened to each:

- `Your data stays readable, always` — the export route exists, and **"always" is false during a deletion grace window**: `/api/export` answers 404 for the whole period (audit item 12, `packages/db/src/membership-lifecycle.ts:142-157`). Recorded as "the pin cannot see a word; a reader can. Carried to the owner."

  **Reversed.** The word *was* the whole claim, and recording it was not enough on a Free card. The line now reads `Your data stays readable`, which is exactly what the pin proves. The CLASS is now a rule rather than a judgement: `landing-pricing.test.ts` refuses any line whose only authority is a path on disk and which carries an absolute quantifier (*always / never / every / any / all*), because a file's existence can never ground a universal.

- `Auto-top-up with a spend cap` — the mechanism ships, and every call refuses `rollout_pending` until an operator runs the v1 authority rollout (`packages/credits/src/stripe/auto-topup-rollout.ts:138-148`). Recorded as "an unrun deploy step on a branch with no deploy, not an absent capability, so it is not scored red."

  **Reversed, and this one was a BLOCK.** Migration `0048` seeds that rollout `'expanded'`, `isAutoTopupProtocolActive` returns false for anything but `'active'`, and `maybeAutoTopup` returns `rollout_pending` **before** the `cap_reached` branch the pin's own authority string cited as its enforcement. So on any freshly migrated database a paid tier sold a capability that refuses on every call — and the hedge convention for exactly that situation had been invented in this same change and applied to the two `tracked niches` lines, with this one left bare and its reason filed in this document instead of in the copy.

  Three things changed. The line reads `Auto-top-up with a spend cap, once activation completes`. A third pin kind exists — a **fenced capability**, which holds only when the thing ships AND (the fence is open OR the line carries the hedge) — and it reads the fence from the tree: the migration's seeded state, and the discovery port `worker/production.ts` actually wires. And the same fence is now named on the **billing screen's own Subscribe and Buy-pack controls**, which consult it through `startTierCheckout` and both pack paths and previously reported a failure as `topup_reconciliation_required` to an owner who was starting a subscription.

---

## 2. P1-R4's gaps, closed — `respin/tests/claim-scan.test.ts`

### 2a. The population was `tests/` only

**Measured:** the re-invention scan walked `tests/` and nothing else, leaving 513 files under `app/`, `packages/`, `worker/` and `e2e/` outside it — including `packages/modes/tests/claims.test.ts` and `packages/modes/tests/kill-test.test.ts`, which import the very canon it guards.

**Fix:** `respin/tests/support/source-files.ts` — one walker, one root list, asserted against disk (`topLevelDirsHoldingTypeScript()`), plus the workspace's root-level modules, because `middleware.ts` runs on every request and belongs to no directory root. Line endings are normalised in the walker and nowhere else.

**Proved it can fail — run: `pnpm vitest run tests/claim-scan.test.ts`, 2026-09-20, with `worker/__plant-probe.ts` planted:** 4 failed of 41. All four new assertions named `worker/__plant-probe.ts`, a path the previous scan could not see. Probe removed; 41 passed.

### 2b. One spelling, not the class

**Fix:** three shapes, each run as its own `it.each` case with the allowlist as the expected value — `pattern-or-string` (`.pattern ?? String(`), `regexp-branch` (`instanceof RegExp`), `pattern-cast` (`as { pattern`). Each is non-vacuous from the other side: this file carries all three as a running fixture, so a shape that matched nothing fails before it can report a clean tree.

**The gap is named, not claimed closed.** A re-invention that is correctly *shaped* but weaker is invisible to a source scan. That class is covered from the other side by a new **consumer census**: every file that imports a canon list must drive `CLAIM_SPECIMENS` or `specimensFor` against its own scan.

**Census measurement, 2026-09-20, over every root:** 22 canon consumers; **6 have no plant**, recorded as a ratchet list in `PLANT_OWED`, each by path:

- `packages/modes/tests/claims.test.ts`
- `tests/billing-ui.test.tsx`
- `tests/brain-ui.test.tsx`
- `tests/brain-usage-9b-ui.test.tsx`
- `tests/results-page-wiring.test.tsx`
- `tests/shell-rail.test.tsx`

All six were read before listing: each imports a canon list and matches it against text, so each is owed a plant. **A new consumer gets no entry and is red until it plants.** Clearing the six is Phase 1 Task 4's remaining work and is *not* done here — it is six bespoke edits to large test files, and inventing them inside a gate repair is how the previous two batches failed. The audit's own measurement is the reason the list is the finding: the three structurally vacuous scans were also the only three canon consumers with no plant.

### 2c. `marketing-claims.test.tsx`'s metadata population and field set

Two holes, both closed and both proved:

1. **Layouts were invisible.** The producer population was every `page.tsx` plus the root layout. Next merges a segment layout's `metadata` into every route beneath it, so an `app/(marketing)/layout.tsx` would have supplied a title and description to all four marketing routes with this scan reading none of it. The population is now every `page.tsx` **and** every `layout.tsx` under `(marketing)`, plus the root layout, and the modules are loaded from an `import.meta.glob` rather than a hand-written import list.
2. **`metaText` read `title` and `description` only.** `openGraph.description`, `twitter.title`, `keywords` and `applicationName` — all of which a crawler or a social card shows a visitor — were outside the scan. It now walks the metadata object and collects **every string at any depth**.

**Proved both at once — run: `pnpm vitest run tests/marketing-claims.test.tsx`, 2026-09-20, with `app/(marketing)/layout.tsx` planted carrying `openGraph.description: "we learn your style over time"`:** 2 failed of 31, both naming `metadata: layout.tsx` and the `learn` label. Neither hole alone would have produced that failure. Plant removed; 31 passed.

**One measured gotcha, recorded because it fails silently:** `import.meta.glob("../app/(marketing)/**/*.tsx")` matches **nothing** — the parentheses are an extglob group, so the pattern asks for `app/marketing/…`. A glob that matches nothing yields an empty module map and a scan that reads no metadata at all, green. The pattern is now `../app/**/*.tsx` with the filter in code, and the keys are asserted against a directory read.

### 2d. `MARKETING_CLAIMS` claimed to be derived and was not

**The overclaim, verbatim, in two places:** the docblock said the entries "are derived from the marketing vocabulary rather than from what a reviewer happened to cite", and `decisions.md` **R-131** said the same. The list is three morphological variants of the two sentences the batch-3 reviewer quoted.

**Measured 2026-09-20** (run: a temporary probe driving `claimHits` over 17 plausible sales sentences against `FORBIDDEN_CLAIMS` + `PERFORMANCE_CLAIMS` + `MARKETING_CLAIMS`; probe deleted after the reading): **17 of 17 pass.** Among them `"Audiences punish it."`, live on all four marketing routes at the time of measurement (`app/(marketing)/page.tsx:29`, `app/(marketing)/audiences.ts:47,75,103`).

*This figure is this session's own measurement over this session's sentence set. The handoff recorded 13 of 17 over a different set; that number is not reused.*

**Fix, both halves:**

- The docblock now states what the list **is**, carries the measurement, and cites `packages/modes/src/claims.ts:138-149`'s own doctrine — a recall aid with measured gaps, not a complete control.
- `MARKETING_CLAIM_GAPS` records six escaping shapes, and `claim-scan.test.ts` **asserts each one still escapes**. That is the opposite of a snooze: the day a pattern catches one, the assertion goes red and the gap list must be edited in the same change, so the recorded gap and the shipped vocabulary can never disagree.
- R-131's matching sentence is corrected by **R-132**; R-131 is append-only and is not edited.

**Not attempted here, and why:** closing these gaps needs a generator over {subject} × {outcome} × {hedge} — the same conclusion the audit's round 3 reached for `claims.ts` ("Write that generator and count the escapes **before** fixing anything by hand"). A pattern per escaping sentence is the instance fix whose failure this very file records.

---

## 3. What the instruments do **not** cover

Stated because a green scan is read as more than it is:

- The pin table asks what a line *depends on*. It cannot tell a well-written sentence from a true one, and it reads nothing outside `PRICING[].lines[]` — the landing's prose sections, the hero, the demo block and the audience pages are the render scan's ground, not its.
- The render scan applies `FORBIDDEN_CLAIMS`, `PERFORMANCE_CLAIMS` and `MARKETING_CLAIMS`. `NOT_BUILT_YET` is deliberately not applied. Its power is bounded by the vocabulary, which §2d has just measured at 17 of 17 escapes on ordinary sales language.
- Neither instrument ran a browser. Every claim here comes from vitest runs named at each figure.
