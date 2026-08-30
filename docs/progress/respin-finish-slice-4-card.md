# Slice 4 report card — References + the R-3 promise

**Readiness: Ready**
**Date: 2026-08-29**
**Plan: [`respin-finish-master-plan.md`](../plans/respin-finish-master-plan.md) · Card: [`respin-finish-phase-4.md`](../plans/respin-finish-phase-4.md)**

## The "A creator can…" line

**Add reference posts they admire, and be stopped from copying them.**

- **Add:** built and tested end to end — `appendReferencePost` (a sibling of `appendOwnPost`, no attestation, its own 50-post cap) wired through a new onboarding UI panel and `addReferencePostAction`.
- **Be stopped from copying them:** the R-3 echo bar and quote budget — dormant since M2b-1, switched on for real by this slice — are proven by direct integration tests (`writeCapabilities().writeBrainDoc()` citing an echoing span → refused). **Not walked in a browser against a live vendor call**: the bar's one production trigger is `inferVoice`'s call to `writeBrainDoc`, which requires the *model* to echo a reference post rather than a creator-editable field, so a deliberate browser contrivance isn't available the way it was for own-post refusals in earlier slices. Recorded as a residual, not claimed done — same shape as slices 2b and 3's precedent for an unavailable live-vendor walk.

## Gate summary

| Gate | Round 1 | Round 2 | Final |
|---|---|---|---|
| Respin billing & credits (Full gates) | **PASS** (Ready/A) | — not needed | **PASS** |
| Respin brain tenancy (Full gates) | NEEDS CHANGES (0 BLOCK · 1 CHANGE · 1 NOTE) | **PASS** (Ready/A) | **PASS** |
| Respin spin compliance | NEEDS CHANGES (1 BLOCK · 1 CHANGE · 2 NOTE) | **PASS** (Ready/A) | **PASS** |
| Respin learning honesty | — excluded, see below | — | n/a |

**Reviewer spend: 5 agent runs** (3 in round 1, 2 in round 2). Two rounds on tenancy and compliance, within the two-round bound — no third round required.

**Learning-honesty excluded, not skipped.** The phase card's "Done when" line names all four Respin Critical Paths generically; the actual diff touches none of learning-honesty's trigger surface (results entry, verification flags, promotion proposals, minimum-n, `packages/brain`, reach-vs-conversion). CLAUDE.md's rule is that gates run on what a diff touches, not on a plan document's a-priori list — running a reviewer against zero relevant surface would be pure cost with no check behind it. Billing was kept **in** scope despite the same reasoning arguing against it, because slice 4's main change lands inside `with-workspace.ts`, the same file that composes `recordModelUsage` and the money-adjacent advisory lock — a genuine collateral-risk surface, confirmed clean by the reviewer.

**Gate intensity note.** `CLAUDE.md` sets `Gate intensity: lean`, under which spin-compliance (not marked `Full gates? yes`) would ordinarily merge into one lean run with any other lean-eligible path. With learning-honesty excluded, compliance had no partner to merge with, so it ran as its own full dedicated agent rather than a hand-authored single-path lean-merge prompt — richer than lean strictly requires, cheaper than authoring and maintaining a fragile merged-checklist prompt for one path.

## What got built

- **`appendReferencePost`** (`packages/db/src/onboarding-ops.ts`) — sibling of `appendOwnPost`. No `attested` parameter (R2: a reference post is by definition not the creator's own work). Optional `sourceUrl`. Its own `REFERENCE_COUNT_MAX = 50` cap, checked ahead of the shared `POST_COUNT_MAX`.
- **G-11 — the quote budget's two-layer identity** (`packages/db/src/echo.ts`):
  - Layer A (`referenceBudgetKey`): a digest over a normalised comparison form, replacing `content_sha256` as the budget's aggregation key.
  - Layer B (`groupReferenceInputs`): a union-find containment bucket over a profile's reference corpus, reusing `findEchoWindow`, computed once per write and shared between new and retained spans.
  - Two defects self-caught by this slice's own tests, not by a reviewer: the first version of Layer A didn't actually close the register's own "trailing space" example (`echoComparisonForm` doesn't trim whitespace); and the budget's union computation mixed UTF-16 coordinate spaces across different `onboarding_inputs` rows sharing a bucket, silently under-counting. Both fixed before any gate ran.
- **G-16 — the shared span-validity predicate** (`isUsableSpanRange`, `echo.ts`), used by both `assertUsableSpan` (refuses a bad new span) and `retainedReferenceSpans` (now skips a bad stored span instead of only checking `Number.isInteger`, which previously let a malformed stored row permanently brick a profile).
- **G-10 — the evidence bijection's third direction** (`writeBrainDoc`, `with-workspace.ts`): every cited entry must name a position holding a stated value, never `[check]`.
- **R-30.10 — `REFERENCE_BARRED_KINDS` widened** to `{voice, killtest, performance_meta}`; `strategy` stays exempt (REQ-D04).
- **New UI panel** for reference-post intake (paste + optional source URL, no attestation), with its own count sentence and a class-filtered display list.
- **New `ReferenceEchoError`** class, separating the R-3 refusal from the generic `ProvenanceError` quote-mismatch refusal.
- **B-7 / B-11 honesty debts closed**: `ECHO_MIN_SEGMENTS`'s docblock relabelled from an unverifiable "measured" claim to an explicit judgment; the config-vs-code carve-out for the R-3 constants recorded in `decisions.md` R-58, with `tech-spec.md:115` and `decisions.md` R-6 amended to name the tech-spec §3 spin gate — a different control — as their actual subject.

## Findings fixed (both rounds)

| # | Gate | Severity | Finding | Fix |
|---|---|---|---|---|
| 1 | Tenancy | CHANGE | `page.tsx`'s two display lists filtered by `input_class` in JavaScript **after** paging — the same starvation anti-pattern `ownPostsNewest` closes for inference, reopened on the display path | `onboardingInputs` accessor gained an optional `inputClass` query predicate; both reads now filter in SQL; real-database regression test added |
| 2 | Compliance | BLOCK | The reference panel's "nothing here is copied" is an unqualified guarantee, **false** for `strategy` (REQ-D04 exempts it, and up to 240 chars may legitimately be quoted as mechanism evidence) | Copy rewritten to state what IS true without the false guarantee |
| 3 | Compliance | CHANGE | `PostContentError`'s stale "…and nothing else reads it yet" claim, now wired into two new slice-4 call sites | False clause removed |
| 4 | Compliance | NOTE | The banned verb "learn" survived in two server-log-only messages | Reworded to "a mechanism can be noted" |

Findings 2–4 were fixed together in one pass; finding 1 required a real schema-level accessor change and its own regression test. All four fixes were verified by the round-2 re-checks (findings 1–3) or spot-checked (finding 4, a NOTE, no re-review required).

## Entry gate (final)

CI shape, Docker live, `TEST_DATABASE_URL` set:
- **67 files / 1380 tests / 1379 passed / 0 skipped.** The one failure is the pre-existing `(marketing)/for/[audience]/page.tsx` gate-completeness gap, recorded in slices 2b and 3's ledger entries as belonging to a concurrent marketing stream — not introduced by this slice.
- `db:check`: clean. **No migration** — `input_class` already had the `reference` value and `source_url` already existed, matching the phase card's prediction.
- `next build`: clean, `ƒ /onboarding` compiles.

## Residuals — not claimed done

1. **R14's live-vendor browser walk.** The R-3 echo bar's one production trigger is `inferVoice`'s call to `writeBrainDoc` — there is no creator-editable field that reaches it directly, so a deliberate "paste a reference post, then trigger an echo" browser walk isn't available the way it was for R8's own-post attestation refusal. Proven instead by direct `writeCapabilities().writeBrainDoc()` integration tests. Same shape as slice 2b/3's precedent for a browser walk that couldn't be completed this session.
2. **The M1–M8 mutation-plantable population** (named in the ledger, with a test witness cited for each) was **not independently planted and run** this session. Per this project's standing lesson, a matrix authored by the same person who wrote the guards is blind to the same classes of gap — this is named honestly as an open item for the next independent check, not swept into "done."
3. **Tenancy round 1's NOTE** — the cross-write bucket-merge scenario in `assertReferenceQuoteBudget` (a reference post added between two writes that merges two previously-separate buckets) — was traced by hand by the round-1 reviewer and found sound (the conservative direction holds), but has no dedicated test. Left as a recommendation for a future slice, not a blocker.

## Decisions recorded

- `decisions.md` **R-58** — G-11's two-layer relation (including the two self-found defects and their fixes), G-12's reaffirmed disposition, R-30.10's barred-set widening, B-11's config-vs-code carve-out.
- `decisions.md` **R-6, corrected (append-only)** — "similarity thresholds" in that entry's own text refers to the tech-spec §3 spin gate only, not the R-3 echo bar.
- `tech-spec.md:115`, amended in the same change to name the spin gate as its subject.

## Next

Slice 5 — Brain editing, versions, export. Depends on slice 3 (already closed); slice 4 was not a dependency for it. Per this project's just-in-time rule, slice 5's card is re-read against the current code before it starts, not trusted as written.
