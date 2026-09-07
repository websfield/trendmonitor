# Respin — slice stubs (2b, 3–10b) — ⚠️ SUPERSEDED 2026-08-29

> **Do not plan from this file. Every stub below has been promoted to a full card**, and the cards
> answer the "questions before the full card" that each stub leaves open — sometimes differently
> from what the stub assumed, and in three places the stub was wrong:
>
> | Stub | Card | What changed |
> |---|---|---|
> | 2b | [`respin-finish-phase-2b.md`](respin-finish-phase-2b.md) | The acceptance line conflated the creator's **credit** burn with the **cost** rollup; the rollup also has no `purpose` column, so "by mode" is not derivable from it |
> | 3 | [`respin-finish-phase-3.md`](respin-finish-phase-3.md) | Built; not yet closed |
> | 4 | [`respin-finish-phase-4.md`](respin-finish-phase-4.md) | `REFERENCE_BARRED_KINDS` has **one** definition, not two |
> | 5 | [`respin-finish-phase-5.md`](respin-finish-phase-5.md) | |
> | 6 | [`respin-finish-phase-6.md`](respin-finish-phase-6.md) | |
> | 7 | [`respin-finish-phase-7.md`](respin-finish-phase-7.md) | |
> | 8 | [`respin-finish-phase-8.md`](respin-finish-phase-8.md) | **Provisional** — the runner decision is still unrecorded |
> | 9 | [`respin-finish-phase-9.md`](respin-finish-phase-9.md) | |
> | 10a | [`respin-finish-phase-10a.md`](respin-finish-phase-10a.md) | |
> | 10b | [`respin-finish-phase-10b.md`](respin-finish-phase-10b.md) | Recommends splitting again; and the register's task-41 line-citation is wrong — there is **no** role × capability instrument at all |
>
> This file is kept for provenance only, in the same spirit as `respin-m2b1-brain-surface-plan.md`:
> a document that stops being a status source should be marked, not deleted, because a stub that
> merely vanishes is indistinguishable from one that was forgotten.

**These were stubs, not phase plans.** Each carried only what a stub needs: the sentence a creator
walks, prerequisites, the open items closing there, the gates it triggers, and the questions that
had to be answered before its full card was written.

**Why a separate file rather than the master plan.** The master plan is a one-screen map that stays
stable; a stub is churn — it gets rewritten the moment its slice comes up, and then deleted in
favour of `respin-finish-phase-N.md`. Putting the churn in the map turns the map into a review
artifact, which is the failure this whole plan set exists to avoid.

**Open-item claims live in** [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md).
Ids are referenced here; they are not restated.

Gate abbreviations: **B**illing · **T**enancy · **C**ompliance · **L**earning
(`CLAUDE.md` Critical Paths → reviewer mapping).

---

## Slice 2b — The spend record that outlives deletion · 3–4 h · after 2a

**A creator can…** see this month's burn on `/usage` computed from the stored rollup, and have it
still be right after a retried settlement.

**Prerequisites:** 2a shipped (a real `model_usage` row exists) · owner decision on
`workspace_id` pseudonymisation (queue default: pseudonymise at deletion time).

**Open items closing here:** R-30.5, R-30.9.

**Gates:** B (certain — the one mutable stored aggregate), T (pseudonymisation and the deletion path).

**Questions before the full card:**
1. Is the rollup's idempotency key `model_usage.id` or `attempt_id`? A retry shares `attempt_id`, so
   the two answers differ for exactly the case that matters.
2. Does `/usage` read the rollup or `model_usage` directly? If both, which is authoritative, and what
   does the page show when they disagree?
3. What does the reconciliation query report **after** a REQ-A04 deletion — a distinct status, or
   maximal false drift?

---

## Slice 3 — Infer → confirm → activate · 4–6 h · after 2a

**A creator can…** see a voice brain inferred from *their* posts, with the quote behind every field,
confirm each one, and activate it.

**Prerequisites:** 2a shipped · owner decision: may an **editor** confirm someone's inferred voice
rules? (the code already answers yes; `decisions.md` is silent) · `packages/brain` vs `@respin/db`
recorded.

**Open items closing here:** B-1, B-3, B-5, B-6, R-30.6, tasks 11, 17, 20, 30, 40, 45, and
**G-12** — moved here from slice 4 on 2026-08-27 by the slice-1 compliance gate. The two R-3
controls `own_post` switches off are keyed on `inputClass === "reference"`, so they become
load-bearing at the first `voice` brain document written from an onboarding input, which is this
slice. Slice 1 also opened a creator-side variant: the only warrant for the `own_post` label is a
sentence on the paste form.

**Gates:** T (certain — REQ-B02, provenance, roles), L (the warrant counts a creator reads),
C (what `[check]` renders as), B (only if the rebuild is priced here).

**Questions before the full card:**
1. What does the confirm screen show for a field whose only warrant is a `reference` input, and for
   one with **no** `own_post` warrant at all? Task 20 says a distinct string, never a zero ratio —
   what string?
2. Does confirmation pin `(content, source_evidence)` or content alone (B-3)? If the pair, what
   invalidates a confirmation when evidence changes?
3. `confirmed_fields` / `evidence_counts`: nullable as built, or `NOT NULL DEFAULT` as planned
   (B-5)? Learning argued nullable is better — that argument either becomes the contract or loses.
4. Does the inference run through slice 2a's `runInference` unchanged, or does it need a second
   operation type?

---

## Slice 4 — References + the R-3 promise · 3–4 h · after 3

**A creator can…** add reference posts they admire, and be stopped from copying them.

**Prerequisites:** slice 3 shipped.

**Open items closing here:** **G-10, G-11** (slice 4 does not ship without these), G-16, B-7,
B-11, R-30.10, tasks 12, 42, 47.

**Gates:** C (certain — R-3 becomes a live promise), L (the number provenance in `echo.ts`),
T (`input_class` as an authority), B (the budget's refusal on the money path).

**Questions before the full card:**
1. **G-11's equivalence relation.** The register proposes bucketing by a shingle/containment class
   over normalised content, reusing `wordLikeSegments` and `ECHO_MIN_SEGMENTS`, and unioning ranges
   across the bucket. Is that the answer, and what is the false-positive cost to a creator who pastes
   two genuinely similar posts?
2. **G-12's disposition** (now a slice-3 question, see above). Apply the quote budget to *every* `input_class` — the bar is how much of
   one post was extracted, which does not depend on who the creator says wrote it — or record the
   acceptance with its blast radius. Not both.
3. **R-30.10's barred set.** The `reference`-substring rule is corpus-wide. Does it bar `voice` only,
   or all four kinds (task 42 proposes three)?
4. Where does `[check]` come from in a reference-derived field, given G-10 forbids citing a `[check]`
   position and the non-empty CHECK forces at least one entry? The two constraints have to be made
   compatible in this slice, not argued about.

---

## Slice 5 — Brain editing, versions, export · 6–8 h · after 3

**A creator can…** edit a field, see the old version still readable, and export their brain as JSON
and markdown.

**Prerequisites:** slice 3 shipped · R-29's seed-content assertion settled (it is the condition R-29
placed on seeding the library at all).

**Open items closing here:** R-30.7, tasks 15, 21, 22, 23, 37, 44.

**Gates:** T (certain — export completeness, cross-profile isolation, REQ-A04), C (the export
annotates rather than throws; `frameworks` seeds mechanism-level only), L (absent is never zero).

**Note on the estimate.** This is 6–8 h, not the 3–4 h originally budgeted: **there is no export**.
`packages/db/src/export.ts` does not exist and nothing in `packages/*/src` exports a brain. The
`creator-data-registry.ts` module is a policy record, not an exporter.

**Questions before the full card:**
1. Is the export registry-driven off `CREATOR_DATA_REGISTRY`, so a new table joins the export by
   being registered rather than by being remembered?
2. Markdown for whom — a human reading their own brain, or a machine round-trip? They are different
   documents.
3. Does an edit go through the same `writeBrainDoc` path as an inference (versions, evidence,
   quote budget), or is a hand edit a distinct kind of write with its own provenance?
4. Which F1–F9 frameworks seed, and what asserts they are mechanism-level (R-29)?

---

## Slice 6 — First generation · 6–8 h · after 3, 5

**A creator can…** generate hooks from their own brain, kill-tested, and see the credit debited.

**Prerequisites:** slices 3 and 5 shipped · owner decision: does Free require a card? ·
**free-tier credit minting must exist or the walk is unwalkable on Free**.

**Open items closing here:** free-tier credit minting (DL-2 / R-21), REQ-I03 at the generation
surface.

**Gates:** all four. C (the kill test's honesty, REQ-I03, no-guarantee language), B (the debit in the
generation's transaction), L (no performance claim at n = 0), T (the brain the generation reads).

**Questions before the full card:**
1. **Free-tier minting.** Where do a Free creator's 25 monthly credits come from — a grant on signup,
   a monthly job (which needs the runner decision), or a lazy derivation at read time like grace and
   downgrade already use?
2. **REQ-I03.** C-28 proves *that* a claim is cited, never that the citation supports it, and R-34
   records semantic support as not computable and not claimed. What does the generation surface do
   instead — `[check]` everything unverifiable, or state the limit to the creator?
3. Does `packages/modes` land whole, or does slice 6 ship one mode and slice 7 the other six? The
   slice rule permits either; the estimate assumes one pipeline plus hooks.
4. Which of the ~seven post-call brain-write refusals apply to a generation, and does a
   `schema_invalid` response consume a Free creator's credits?

---

## Slice 7 — The rest of the Studio · 8–10 h · after 6

**A creator can…** use all seven modes, revise with lineage, and give feedback that is captured.

**Prerequisites:** slice 6 shipped · **the background-runner decision recorded before slice 8's card
is written** — this slice's end is that deadline (`tech-spec.md:18`).

**Open items closing here:** none carried; the slice's own scope is REQ-C01–C08.

**Gates:** C (kill test across all seven modes), L (feedback → proposal is *capture only* here;
construction is slice 9's and `packages/brain` is its sole site), B (tier gating: Free gets
hooks/captions/ideas only).

**Questions before the full card:**
1. Where does captured feedback live between slice 7 and slice 9, given proposals may only be
   constructed in `packages/brain`?
2. Does a revision re-run the kill test and the similarity gate, or inherit its parent's verdict?
3. What is the streaming "checking" finalisation state actually checking, and what does a creator see
   if it fails after tokens were spent?

---

## Slice 8 — Trends + Spin · 10–12 h · after 7

**A creator can…** browse a trend, read an autopsy, and spin it into their own voice.

**Prerequisites:** slice 7 shipped · **background-runner decision recorded** (a card written against
an unchosen scheduler selects the scheduler) · YouTube Data API credentials.

**Open items closing here:** the **background-runner decision** — and it closes *before this card is
written*, not inside the slice. `tech-spec.md:18` requires a recorded decision before planning, and a
card written against an unchosen scheduler selects the scheduler.

**Gates:** C (certain — REQ-E01 compliant sources, the similarity gate as a hard pre-display gate,
REQ-I02), B (spin costs 5 credits, autopsy cached separately), L (outlier ratios against the
channel's own baseline, saturation labels), T (a spin reads one profile's brain).

**Questions before the full card:**
1. Which runner, and does it run on the Lightsail box or off it?
2. The similarity gate's thresholds are config (`tech-spec.md:109`) while `ECHO_MIN_SEGMENTS` is
   deliberately code (B-11). Which is this gate, and is the answer consistent with B-11's carve-out?
3. What does the kill-test/similarity failure show a creator — a rewrite, or an honest refusal?
4. Does the submitted-link adapter share the reference-post intake path from slice 4, and therefore
   the R-3 quote budget?

---

## Slice 9 — Results + learning · 8–10 h · after 7

**A creator can…** log a result and get a promotion proposal at n ≥ 3.

**Prerequisites:** slice 7 shipped · `packages/brain` vs `@respin/db` resolved (queue default:
create `packages/brain` here, for proposal construction only).

**Open items closing here:** the `packages/brain` discrepancy.

**Gates:** L (certain — minimum-n, verified-only, paid/organic never pool, reach and conversion never
collapse), T (proposals write brain versions), B (results are not a spend path but the north-star
metric feeds the margin story).

**Questions before the full card:**
1. What makes two results "comparable" for the n ≥ 3 bar — same mode, same platform, same metric,
   same window?
2. What is a creator's "own baseline", computed from what population and over what period?
3. Does an accepted proposal write through the same confirm/activate path as slice 3, or a distinct
   one?

---

## Slice 10a — Public surface + observability · 6–8 h · after 8, 9

**A creator can…** (as an anonymous visitor) run the comparison demo, see the two outputs genuinely
differ in voice and structure, and subscribe.

**Prerequisites:** slice 8 shipped (the demo spins) · a named sample brain that is not a real
creator's.

**Open items closing here:** none carried.

**Gates:** C (the demo makes no guarantee, REQ-I04; the sample brain carries no real person's
specifics), B (zero-credit and IP rate-limited, REQ-H02/R-14), L (the demo's claim about what
changed is a claim).

**Questions before the full card:**
1. Whose brain does the demo run on, and what asserts it is not a real creator's?
2. What is the rate limit, and does it reuse `rate_limit` — the table that holds a plaintext IP and
   has a 24-hour retention sentence with no receiver until 10b?
3. Landing, pricing, legal, changelog, PostHog, Sentry — is this one slice or does observability
   split off? Answer before writing the card, not during it.

---

## Slice 10b — Seats, admin, retention, deletion · 8–10 h · after 10a

**A creator can…** invite a seat that can generate but cannot touch billing, and delete their account
and have the data actually go.

**Prerequisites:** 10a shipped · **B-2 / G-13 closed — seats do not ship while a viewer can write a
brain document** · owner/legal decision on `session.ip_address`'s retention period (it has none) ·
the T-12 tension resolved: `brain_docs` is append-only and REQ-A04 requires erasure.

**Open items closing here:** B-2 / G-13, task 41, the retention receiver over three tables
(`stripe_events.payload`, `rate_limit.key`, `session.ip_address`), REQ-G05 margin aggregation,
REQ-A04 deletion, T-12's Respin restatement.

**Gates:** all four, and this is the heaviest gate load in the plan — which is why 10a went first.
T (certain — roles, deletion, admin surface, seat isolation), B (margin aggregation, credit
adjustments with reason codes), C (source management), L (the margin dashboard reports real numbers
or says it cannot).

**Questions before the full card:**
1. **The role × capability table** (task 41): five capabilities × three roles. Every cell classified,
   with an instrument that fails on an unclassified one — what is the instrument?
2. **T-12.** Does REQ-A04 deletion remove append-only brain versions, or is the append-only claim
   narrowed in writing? One of the two; not silence.
3. `session.ip_address` has no retention sentence. What period, and decided with the deletion path
   rather than inherited by default?
4. Does the retention receiver need the background runner, and is that the same runner slice 8 chose?
5. Is this still one slice after answering 1–4, or does deletion+retention split from seats+admin?
