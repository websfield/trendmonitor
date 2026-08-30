# Slice 3: Infer → confirm → activate

## A creator can…
**See a voice brain inferred from *their own* posts, with the quote behind every field, confirm each one, and activate it.**

That sentence is the acceptance test, and it is walked in a browser. "Their own" is load-bearing: the inference reads `own_post` rows and nothing else.

## Why this shape
Slice 2a proved the money spine with a prompt that was deliberately a ping — nothing the creator typed reached a model. **This slice is the first time a creator's own words are sent to a vendor, and the first time the product states a belief about a person.** The substrate for that belief (`writeBrainDoc`, `confirmBrainDocFields`, `activateBrainDoc`, `enumerateClaimFields`, the echo bar) shipped in M2b-1 with **zero product callers**. This slice is the caller. It writes almost no new invariant logic and a lot of screen.

It is separated from slice 4 (reference posts) deliberately: R-3 becomes a promise to a creator when references arrive, and the two R-3 controls this slice makes load-bearing are enough for one gate round.

## Open items closing here
B-1 · B-3 · B-5 · B-6 · R-30.6 · **G-12** · brain-surface tasks 11, 17, 20, 30, 40, 45.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — do not restate them here.

## Prerequisites
- [x] Slice 2a shipped — `runInference` reaches a real vendor and meters it (closed 2026-08-28)
- [ ] **Owner decision: may an `editor` confirm someone's inferred voice rules?** (B-1). **The code already answers yes** — `assertMayDecide` (`with-workspace.ts:1034`) refuses `viewer` only — and `decisions.md` contains the word "editor" zero times. REQ-B02 says *the creator* confirms. This is a decision taken by omission and it must be recorded either way before the confirm screen ships
- [ ] `packages/brain` vs `@respin/db` recorded (owner queue default: create `packages/brain` at slice 9, leave storage in `@respin/db`, re-point `tech-spec.md:36` with the reason)

---

## The four questions the stub left open, answered

Recorded here rather than left to the developer, because three of them are contract decisions and the fourth changes the slice's size.

**1. What does the confirm screen show for a field whose only warrant is a `reference` input, or which has no `own_post` warrant at all?**

The first case is **unreachable for `voice` and must stay that way**: `REFERENCE_BARRED_KINDS` (`with-workspace.ts:1813`) contains `voice`, so `validateSourceEvidence` refuses the write outright — the field never renders because the document never exists. The screen therefore needs no copy for it, and **R7 below turns that into a test rather than an assumption.**

The reachable case is a claim position holding `[check]` with no evidence entry. It renders as a **named absence** — "Not enough in your posts to say" — and offers the creator the edit box. It **never** renders a ratio, because "quoted from 0 of your 12 posts" reads as a measurement of the creator rather than of our evidence (task 20).

**2. Does confirmation pin `content` alone or `(content, source_evidence)`? (B-3)**

**The pair.** AC-27 names the pair and the code pins content alone (`confirmedContentSha256: contentSha256(doc.content)`). Today that gap is theoretical because nothing edits evidence after a write; it stops being theoretical in slice 5, which edits fields. Fixing it here — while there is exactly one writer and one reader — is a small diff; fixing it in slice 5 is a migration under a live confirmation. **The column keeps its name and its meaning changes**, so both sites (`confirmBrainDocFields`, and activation's re-computation at `with-workspace.ts:1624`) change in one edit, and a test proves an evidence-only mutation now refuses activation.

**3. `confirmed_fields` / `evidence_counts`: nullable, or `NOT NULL DEFAULT`? (B-5)**

**Nullable stands, and this card is where that argument becomes the contract rather than an unrecorded disagreement.** `NULL` means *never confirmed*; `[]` means *confirmed, and nothing was*. A `NOT NULL DEFAULT '[]'` collapses those into one value on the column that answers "did a human decide anything about this document" — and the activation gate's own message counts confirmed positions, so it needs the distinction to be honest. **The plan document is what changes, not the schema.** Separately, B-5's second half is a real defect and is fixed: the `active` CHECK omits `activated_at`, so an active row can exist with no activation time.

**4. Does the inference run through 2a's `runInference` unchanged? (this decides the slice's size)**

**Unchanged.** `RunInferenceParams` is `{attemptId, system, prompt}` returning `{text, …}` (`packages/credits/src/inference.ts:151`), and its purpose constant is already `ONBOARDING_BRAIN_PURPOSE` — this slice *is* that purpose. No second operation type, no new metering path, no new gate ordering. What changes is the two strings passed in and what the caller does with `text`. **Everything 2a's four reviewer gates established about the spend path is inherited, not re-opened.**

---

## Requirements

### The inference (`packages/llm`)
- [ ] **R1:** Prompt assembly lives in `packages/llm` (the `assemble.ts` the slice-2 card named and 2a did not build — record the deviation). It takes `own_post` content and returns `{system, prompt}`. **It is pure and unit-tested**: no db, no network, so the prompt is assertable without a vendor.
- [ ] **R2:** The model returns a **structured `voice` document plus, for every claim position, the exact quote and its offsets into a named input**. Parse fail-closed: an unparseable or schema-invalid reply is a typed refusal that writes **no** brain document — never a partially-filled one.
- [ ] **R3:** The offsets the model returns are **never trusted**. `validateSourceEvidence` already proves each quote verbatim at its range; a model that returns a quote it invented must be refused **by that existing gate**, and a test plants exactly that.
- [ ] **R4:** Only `own_post` rows are sent. Asserted at the assembly boundary, not commented.

### The write
- [ ] **R5:** One `writeBrainDoc` call, kind `voice`, status server-derived `proposed`, reason recorded (`brain_reason`).
- [ ] **R6:** A profile with **too few posts to infer from** is refused **before** the vendor is called, with copy naming how many more to paste. Spending a creator's included run to produce `[check]` in every field is the honest-but-useless outcome, and it is worse than a refusal.
- [ ] **R7:** **G-12, the substrate half.** A test proves a `reference` input cannot become provenance for the `voice` document this slice writes — the control exists (`REFERENCE_BARRED_KINDS`) and has **no product-path test**, which is the shape that has cost this milestone the most.
- [ ] **R8:** **G-12, the creator half — the part the register did not name.** The only warrant for the `own_post` label is the sentence "Paste the text of posts you wrote yourself" on slice 1's form. This slice is where that label starts deciding whether R-3's controls run. **Minimum: an explicit attestation at the point of paste, and copy on the confirm screen stating that these rules were inferred from material the creator declared as their own.** Verification is out of scope and *is recorded as out of scope* — an unverified label the product knows is unverified is a different risk from one it presents as verified.

### The confirm screen (REQ-B02 / R-30.6)
- [ ] **R9:** Every claim position from `enumerateClaimFields` is rendered. Activation already refuses while any is unconfirmed (`with-workspace.ts:1641`), so a screen that renders fewer produces a document that can never activate — **the failure is a dead end, not a leak, and a test pins the screen's set to the enumerator's**.
- [ ] **R10:** **The quote behind each field is shown, attributed to the post it came from.** This is the slice's headline and the reason the whole provenance substrate exists.
- [ ] **R11:** A `[check]` field renders the named absence from question 1 — **never a ratio, never a zero**.
- [ ] **R12:** Confirmation is **per field**, and `asPlaceholder` is submitted to match what was shown. The server already refuses a mismatch; the screen must not be able to produce one.
- [ ] **R13:** Activation is a **separate, explicit act** after confirmation, and its copy says what activating means: the product will act on these claims.
- [ ] **R14:** **B-1 recorded in `decisions.md`** — whichever way the owner decides. If it goes to owner-only, `assertMayDecide` gains a second branch and the editor refusal gets copy.

### Honesty
- [ ] **R15:** **B-6.** `brain_kind_not_writable`'s copy currently ends "Log some results first and this document gets written from them" — promising a distant results surface without its evidence limits. Rewrite to name the missing surface and say that later proposals require honestly-labelled quantified evidence, repeated comparable treatment and a separate baseline; never promise that three manually entered numbers are "verified" or automatically write a document.
- [ ] **R16:** No screen in this slice claims the brain is accurate, learned, or improving. It states what was inferred and from what.

### The defects fixed in passing
- [ ] **R17:** B-3 — the confirmation sha covers `(content, source_evidence)`.
- [ ] **R18:** B-5 — the `active` CHECK includes `activated_at`; the nullability contract is recorded, not changed.

---

## Left to the developer

- **Whether infer/confirm/activate are one route or three**, and whether confirmation is one submit or per-field POSTs. R12's invariant is that what was shown and what is recorded agree.
- **The prompt's wording and the reply's transport shape** (tool call, JSON block, delimited) — R2's invariant is fail-closed parsing, not a format.
- **The minimum-post threshold in R6** — a number in config, with the refusal copy reading it rather than restating it.
- **Where the attestation in R8 lives** — checkbox, typed confirmation, or a re-worded submit — as long as it is an act, not a sentence.
- **Test file layout.**

## Tasks
1. [ ] `assemble.ts`: pure prompt assembly over `own_post` rows; record the 2a deviation in the ledger
2. [ ] Fail-closed reply parsing into `{content, sourceEvidence[]}`; refuse partial
3. [ ] The infer action: too-few-posts refusal, then `runInference` unchanged, then `writeBrainDoc`
4. [ ] The confirm screen: every claim position, its quote, its source post, the `[check]` absence copy
5. [ ] Per-field confirmation submit; then the separate activate act
6. [ ] B-3 (sha over the pair), B-5 (`activated_at` in the CHECK + record nullability), B-6 (copy), B-1 (decision + code if it changes)
7. [ ] R8's attestation at paste, and the confirm screen's provenance sentence
8. [ ] Tests: G-12 substrate (R7), invented-quote refusal (R3), screen-set = enumerator-set (R9), evidence-drift refuses activation (R17)
9. [ ] Walk it: paste posts → infer → read the quotes → confirm each → activate → the brain is active

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/llm/src/assemble.ts` | Create | Pure prompt assembly + fail-closed reply parse |
| `respin/packages/db/src/with-workspace.ts` | Modify | B-3's sha over the pair, in both sites |
| `respin/packages/db/migrations/00xx_*.sql` | Create | B-5's `activated_at` in the `active` CHECK |
| `respin/app/(product)/onboarding/**` | Modify | Infer action, attestation, the real prompt replacing 2a's ping |
| `respin/app/(product)/brain/**` | Create | The confirm + activate screens |
| `respin/app/(product)/billing-errors.ts` | Modify | B-6 copy; the new typed refusals |
| `respin/packages/llm/tests/assemble.test.ts` | Create | Prompt purity, `own_post`-only, parse fail-closed |
| `respin/packages/db/tests/**` | Modify | R7, R3, R17 |
| `respin/tests/brain-ui.test.tsx` | Create | R9's screen-set = enumerator-set, R11's absence copy |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Paste → infer → confirm each field → activate, in a browser, against the real vendor.** The quote shown next to a field is findable in the post it names
3. [ ] A model reply quoting text that is not in any input → refused, no document written
4. [ ] A profile below the post threshold → refused **before** the vendor call
5. [ ] Activating with one field unconfirmed → refused, and the message names the field
6. [ ] Editing `source_evidence` after confirmation → activation refuses (R17/B-3)
7. [ ] A `reference` input cited for a `voice` field → refused (R7/G-12)
8. [ ] A viewer reaches neither confirm nor activate; an editor's outcome matches R14's recorded decision

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | `REFERENCE_BARRED_KINDS` emptied | R7's G-12 test |
| M2 | Reply parse accepts a partial document | R2's fail-closed test |
| M3 | Confirm screen renders only fields that have evidence | R9's screen-set test |
| M4 | `[check]` field renders "0 of N posts" | R11's absence-copy test |
| M5 | Confirmation sha reverts to `content` alone | R17's evidence-drift test |
| M6 | `assemble` includes `reference` rows | R4's own-post-only test |
| M7 | Too-few-posts check moved after the vendor call | R6's refusal test |

**Population note — read before reporting "N of N".** All seven perturb code that will exist. The
matrix says nothing about controls **nobody wrote** (CLAUDE.md, 2026-08-26), and this slice's largest
risk is exactly that shape: it is mostly screen over a substrate whose gates were written before any
screen existed, so the plausible defect is a requirement with **no control at all** — R8's attestation
and R11's absence copy are the two most likely. Before claiming a matrix result, state in the ledger
which requirements above have no control yet, and have someone other than the author plant at least
three mutations of their own.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser against the real vendor
- [ ] **Brain tenancy** (Full gates), **spin compliance** and **learning honesty** Critical-Path gates PASS on this slice, reviewers in **isolated worktrees**
- [ ] The open items above closed and the disposition register updated
- [ ] `decisions.md` carries B-1's editor decision, B-5's nullability contract, and R8's recorded scope limit on the `own_post` label
