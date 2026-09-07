# Plan review — Respin M2b-1 (round 3)

**Draft reviewed:** [`../plans/respin-m2b1-brain-surface-plan.md`](../plans/respin-m2b1-brain-surface-plan.md) (round-3 revision, 2026-08-24).
**Verdict: NOT READY.** All four reviewers **BLOCK**.

| Reviewer | Verdict | BLOCK | CHANGE | NOTE | Round-2 blocks closed |
|---|---|---|---|---|---|
| `respin-tenancy-reviewer` | BLOCK | 2 | 10 | 6 | **4 of 6** |
| `respin-compliance-reviewer` | BLOCK | 2 | 8 | 5 | 2 partial |
| `respin-learning-reviewer` | BLOCK | 3 | 11 | 2 | **1 of 2 fully** |
| `respin-billing-reviewer` | BLOCK | 2 | 9 | 6 | **2 of 2 in substance** |
| **Total** | | **9** | **38** | **19** | |

**Trend: 20 → 12 → 9 BLOCK.** Converging, and the findings are getting more specific each round.

---

## The defining fact of this round

**Every reviewer found its blocks by RUNNING code, not by reading the plan.** Between them they executed:

- **zod 4.4.3** (the installed version): `.strict()` does **not** propagate to nested objects, and the unknown key is stripped from the *parse output* while remaining in the *input* — while `writeBrainDoc` stores `doc.content`, the caller's object. A `z.record(...)` subtree inside a `.strict()` parent accepts arbitrary model-chosen keys.
- **`Intl.Segmenter`** on Node v24.18.0: `new Intl.Segmenter("und").resolvedOptions().locale === "en-AU"` — the `"und"` pin is **inert**, identical to `undefined`, so P-7 is provably vacuous and cannot redden its own criterion.
- **`git grep "sourceEvidence: null"`** → **12 sites in 2 files**, where C-15 named 3 in 1 — four of them `@ts-expect-error` guards against silent brain activation, five of them runtime fixtures that become unrepairable once the non-empty CHECK lands.
- **The `profile-cage.test.ts` scanner re-run** with the proposed predicate over every `packages/*/src`: 20 entries, **one uncovered today** (`validateSourceEvidence`) — so the widened scan goes red before M2b-1 writes a line.
- **`packages/db/package.json` + `node_modules`**: **`zod` is not a dependency of `@respin/db`**, and no task adds it — the root fix does not resolve.
- **`auto-topup.ts:216`**: credits land via the `payment_intent.succeeded` webhook, "never here" — so a triggered top-up does not raise the balance for the current attempt.
- **ESLint 9.39.5** against the proposed negation catch-all: verified **sound as written**, no finding.

This is the signal that matters more than the count: the plan is being asked to specify behaviour at a precision that only execution settles, and three rounds of prose have not settled it.

## The nine blocking findings

**C-1 and its downstream carry five of the nine, and all three non-billing reviewers converge on it:**

1. **`.strict()` relocates the invented-specific class one nesting level down** *(compliance, measured)*. `followerCount: 42000` at depth 2 passes validation, is not a schema-declared leaf, needs no evidence, never renders `[check]`, and reaches the export. Round 2's V1 verbatim, one level down. P-3 only reddens at the top level.
2. **The key space and optionality are undefined** *(tenancy, measured)*. `z.record` inside a strict schema returns the key space to the model, which evaporates C-20's stated rationale for resting REQ-B02 on confirmation. And "declared-but-absent optional leaf" is unspecified: one reading bricks every brain, the other reopens V1.
3. **No criterion can detect C-1's reopening** *(learning)*. Nothing forbids `z.record`/`.catchall`/`z.any`, "claim-bearing leaf" is undefined, and array/optional enumeration is unstated — making P-2 ambiguous against the *correct* implementation.
4. **C-1 and C-18 are jointly unsatisfiable for non-string leaves** *(learning)*. A `.strict()` `z.number()` leaf cannot hold `[check]`. Either the placeholder lives outside `content` (leaving the model's uncited number stored, neutralised only per-renderer) or every leaf needs a sentinel union the schemas don't declare. **The same two-specifications failure as round 2's C-4/C-5, on a new pair.**
5. **`evidence_counts` lands outside `GUARDED_WRITE_FIELDS`** *(learning BLOCK, billing CHANGE)*. Task 6 says "the confirmation columns"; `evidence_counts` is a separate migration row — so a caller can supply `{N, M}`, forging the creator-facing provenance label. The exact defect this file's own comment records shipping twice.

**Four more, each a distinct one-paragraph fix:**

6. **C-15 fixed 3 sites of a measured 12** *(tenancy)*. "Fix the class, not the field", with the sibling file one directory over.
7. **The 240-char cap bounds one quote, not the reassembly** *(compliance)*. N entries × 240 verbatim characters of the *same* reference input reassembles the third party's post — with the quote-level bar exempted for exactly those entries.
8. **`maybeAutoTopup` invites an unmetered generation** *(billing)*. Auto-top-up settles asynchronously, so the restored wording licenses proceeding to the model call on a triggered-but-unsettled top-up: tokens spent, `model_usage` committed, debit still refuses.
9. **The activation echo bar reproduces C-9's own permanent-refusal defect** *(billing)*. `appendOnboardingInput` is pause-exempt and inputs are immutable, so a reference input appended between write and activation bricks that version forever — remedy is a priced rebuild. The fix is C-21's own doctrine: scope the corpus to inputs existing as of the version's `created_at`.

## What round 3 genuinely closed

- **C-11's pause classification** — "closed, well" (billing); AC-24 parameterised, P-20, and the `table-writers.test.ts` reason string. Billing hunted for a third unclassified operation and **found none**.
- **The activation content pin** — learning: "**Closed.** Confirmation and content are now the *same row*, so the pin is structural rather than checked. This is the correct fix."
- **C-7's contradiction, C-9's export availability, C-12's role authority, C-19's scoping** — all closed per tenancy (4 of its 6).
- **C-2** (segment sequences), **C-6** (mid-span swap recorded as correct), **C-20** (denylist demoted, claim withdrawn) — closed per compliance.
- **Task 25/AC-39's eslint negation form** — verified sound by running ESLint 9.39.5.
- **Round 2's headline error is not repeated**: tenancy re-checked every code citation in this revision and found them accurate.

## Recommendation

The reviewers supplied a precise fix for all nine findings, so a round-4 revision is tractable. But three rounds of evidence say the bottleneck is not the fixes — it is that **prose specification of toolchain semantics keeps failing on contact**, and the failures are concentrated in exactly two pure, dependency-light modules: the per-kind content schemas (`brain-content.ts` / `brain-fields.ts`) and the echo matcher (`echo.ts`).

**Recommended: build those two modules first, with their tests, and let verified behaviour replace the contested prose.** Both are pure functions over in-memory values — no database, no migration, no model, no money — so they are cheap to build, fully testable, and independently reversible. The plan then cites measured behaviour (what `.strict()` actually does at depth, what the segmenter actually resolves, what the enumeration actually yields for an absent optional) instead of asserting it. The remaining seven findings are ordinary paragraph edits that can land in the same revision.
