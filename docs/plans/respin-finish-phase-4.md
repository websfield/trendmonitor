# Slice 4: References + the R-3 promise

## A creator can…
**Add reference posts they admire, check a candidate safely, and be stopped from copying them.**

That sentence is the acceptance test and it is walked in a browser. Both halves matter: the first is a feature, the second is the promise the whole product is built on, and this is the slice where it becomes a promise to a person rather than a property of a substrate.

## Why this shape — the fact that should govern the whole slice

> **`referenceCorpusAsOf` returns `[]` on every profile in production, so `assertNoReferenceEcho` short-circuits at `echo.ts:379` on every write the product has ever made. The R-3 bar is fully built, extensively tested, and has never refused anything.**

The same is true of `retainedReferenceSpans` (returns `[]` at `with-workspace.ts:2193`), of `validateSourceEvidence`'s `referenceSpans` (always empty), and therefore of `assertReferenceQuoteBudget`, which runs only on the write path (`with-workspace.ts:1568`) over an always-empty list. `findReferenceEchoes` — the never-throw annotate twin — has **no production caller before this slice**; R14 makes the no-store safety check its first one.

So this slice does not *build* R-3. It **switches it on**, and everything it switches on has been exercised only by fixtures. That is the risk to plan against: a control that has never fired in anger, going live on the day it starts deciding whether a creator's work is refused.

## Open items closing here
**G-10** · **G-11** · G-16 · B-7 · B-11 · R-30.10 · brain-surface tasks 12, 42, 47.
**G-10 and G-11 are the slice's condition of shipping** — the master plan says so, and it is right: both are exploitable the moment a `reference` row can exist.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — do not restate them here.

## Prerequisites
- [ ] Slice 3b closed (the coherent Voice/Strategy/Kill Test brain exists, so barred reference provenance is a live rule across the complete M2 brain)
- [ ] **B-11's decision recorded before the first line of code** — see question 5. `decisions.md` R-6 and `tech-spec.md:109` both say similarity thresholds live in config; `echo.ts:48-50` says the opposite in source and cites a real reason. One of the three documents is wrong and the slice cannot begin without knowing which

---

## The five questions, answered

### 1. G-11's equivalence relation — what counts as "the same post"?

**Two layers, and each closes a different class. Do not build one and call it done.**

**Layer A — the aggregation key becomes a sha over `echoComparisonForm`, not `normaliseContent`.** Today `postSha` is `content_sha256`, taken over `normaliseContent` = NFC + CRLF→LF **only** (`with-workspace.ts:1210-1212`). A trailing space, a capital letter, a smart quote or a soft hyphen all mint a fresh 600-character budget. `echoComparisonForm` (`echo.ts:146-153`) already does NFKC → strip `ZERO_WIDTH` → fold dashes → fold quotes → lowercase, and is already the form the echo bar compares in. Keying the budget on it closes every character-level evasion **in one line, with no new machinery and no false positives** — two genuinely different posts do not collide under a cryptographic hash.

**This does not touch `content_sha256`.** That column is a different thing with a different job, and `echo.ts:134-145` states why `echoComparisonForm` must never replace `normaliseContent`: the stored UTF-16 offsets in `source_evidence` index into the `normaliseContent` output, and moving it invalidates every quote ever recorded. The budget gets a **second, separate digest**; the stored one is untouched. Task 12's byte-identical regression test for `normaliseContent` is what proves that, and it closes here.

**Layer B — a containment bucket, because Layer A cannot see a substring.** A 500-character excerpt of a 1,000-character post is a different document under any exact hash, so the reassembly attack survives Layer A. The bucket is the register's proposal and it is the right one: two reference inputs are **the same post** when they share at least `ECHO_MIN_SEGMENTS` word-like segments in a sliding window — the identical relation `findEchoWindow` already computes (`echo.ts:261-278`) — and the budget applies per bucket, unioning ranges across it.

**The false-positive cost to a creator, stated.** Two genuinely similar posts they admire land in one bucket and share one 600-character budget. REQ-B01 asks for 2–3 references, so the practical cost is small and the direction is safe. **What must not be lost is the never-brick property**: `echo.ts:529-532` permits a write that is already over the ceiling and adds nothing new, and bucketing changes which spans are compared — so R4 below makes that a test on the bucketed path specifically, not an inherited assumption.

### 2. G-12's disposition — apply the quote budget to every `input_class`, or record the acceptance?

**Record the acceptance, with the blast radius named — and the reason is not cost, it is that the alternative is wrong.**

The register frames it as "the bar is how much of one post was extracted, which does not depend on who the creator says wrote it." That is true of *extraction* and false of *the harm*. The budget exists because a reference post is a third party's work and 989 contiguous characters of it is a reproduction. An `own_post` is the creator's own material, and a `voice` rule quoting it verbatim is the entire provenance mechanism — slice 3 writes ten rules each with a verbatim quote from the creator's own posts, and it is walked in a browser. **Budgeting `own_post` at 600 characters per post would refuse a legitimate rebuild**, i.e. the control becomes the outage, on the product's core loop.

So the budget stays `reference`-keyed. **The residual is a mislabel** — a creator pasting a third party's post as `own_post` switches both R-3 controls off — and it is bounded by R-47's attestation and by nothing else. R-47 already records that the attestation is an act, not a verification. This slice adds one thing that genuinely narrows it and is worth doing:

**`source_url` is a real column that nothing writes** (`onboarding-schema.ts:128`, typed optional at `with-workspace.ts:1086`). A reference intake that captures the URL gives every `reference` row a provenance trail an `own_post` does not need, so a later audit can ask *where did this come from* of exactly the class where the question matters.

### 3. R-30.10's barred set — which kinds may not carry `reference` provenance?

**`voice`, `killtest`, and `performance_meta`. `strategy` stays exempt, and the exemption already has its reason in the source.**

`REFERENCE_BARRED_KINDS` has exactly one definition (`with-workspace.ts:2052`, `= {voice}`) with one read site (`:2124`) — the caller's "two definitions" was wrong and is corrected here. Its docblock (`:2043-2051`) says `voice` was the one kind M2a could name with certainty and that the other three were carried as an M2b question, "a set that is wrong in the permissive direction is worse than one that is deliberately small."

`echo.ts:58-68` answers for `strategy` directly: it is exempt from the provenance bar **because learning a mechanism is what the shared library is for** (REQ-D04, R-9), and the operative control for it is `REFERENCE_QUOTE_MAX_CHARS`. That reasoning is sound and this slice keeps it — it does not extend it to the other two. `performance_meta` is not writable today (`brain-content.ts:428-432`), so barring it costs nothing now and closes the hole before slice 9 makes it writable, which is the cheap moment.

This matches task 42's proposal exactly. `reference-echo.test.ts` is created here.

### 4. G-10 — where does `[check]` come from in a reference-derived field?

**Invert the check: an evidence entry must cite a claim position holding a STATED value, never a `[check]`.**

The hole is precise. `validateSourceEvidence`'s entry loop checks that the position an entry names is **declared** by the document (`with-workspace.ts:1522-1528`) and never that it **holds a value**. So an entry can be attached to a `[check]` position — a claim asserting nothing — and the entry's `quote` is an unbounded text field. That makes `source_evidence` a text channel: 200 characters of a third party's post, stored as "evidence" for a document that claims nothing.

G-10 and the non-empty `source_evidence` CHECK look incompatible and are not, once the direction is right:

- C-28 already requires every **stated** claim to be cited (`with-workspace.ts:1539-1547`).
- G-10's fix requires every **entry** to point at a stated claim.
- Together: entries and stated claims are in bijection, and `[check]` positions carry no evidence at all.
- The non-empty CHECK then means *"at least one claim is stated and cited"* — which is exactly what it should mean, and `brain-schema.ts:277-287` already records that an all-`[check]` version is deliberately not storable.

The two constraints are made compatible in this slice, as the stub demanded, rather than argued about.

### 5. B-11 — are the R-3 constants config or code?

**Code, and the carve-out gets the written decision it has never had.** `echo.ts:48-51` gives the reason and it is a good one: `/admin/config` is a paste-the-whole-document editor that takes effect with no deploy, so a config home for `ECHO_MIN_SEGMENTS` is a deploy-free path to weaken a hard compliance rule. `decisions.md` R-6 and `tech-spec.md:109` say similarity thresholds live in config; **they are about the spin similarity gate (tech-spec §3 step 4), which is a different control that does not exist yet.** This slice writes that distinction down in `decisions.md` and amends the two documents to name which control they govern — B-11 is a documentation defect, not a code defect, and closing it by moving the constant would be the wrong fix.

**B-7 and task 47 close alongside it**: `echo.ts:42-46`'s "9 shared 8-grams in 607" sits under a heading saying *Measured* and names no unit and no population. Either state the population (which two documents, how many segments each, what the 607 counts) or relabel the paragraph as the judgement it is. `REFERENCE_QUOTE_TOTAL_MAX_CHARS`'s docblock already does this correctly — "600 IS AN UNMEASURED JUDGMENT, recorded as one rather than implied to be derived" (`echo.ts:71-86`) — and it is the model to copy. `echo.ts:82-84` says the 600 becomes re-derivable once a reference corpus exists; **this slice creates that corpus**, so the note's own trigger fires here.

---

## Requirements

### Reference intake
- [ ] **R1:** A creator can add a reference post — pasted text, with an **optional `source_url`** (question 2). It writes `input_class: "reference"` through `appendOnboardingInput`, and the new operation is a **sibling of `appendOwnPost`, not a widening of it**: `onboarding-ops.ts:96-117` records that `input_class` is not a parameter and that its absence is the requirement (R11). A parameterised class on one function is how the label becomes forgeable.
- [ ] **R2:** The reference intake carries **no attestation**, and the copy says what the label means instead. R-47's attestation asserts authorship; a reference is by definition someone else's, so copying that control here would be a sentence nobody can act on. `PostAttestationError`'s message is hard-coded to `own_post` and must not be reused.
- [ ] **R3:** **Corpus starvation is handled**, not discovered. `with-workspace.ts:500-508` and `infer-voice.ts:160-169` already record it: 50 recent references would push `own_post` rows out of the page window. `ownPostsNewest` filters on `input_class` in the query and refuses (never clamps) a limit above the ceiling (`with-workspace.ts:700-719`, `assertCorpusLimit` at `:1947-1954`), so the mitigation exists — this slice needs the **test that proves it under a reference-heavy corpus**, and a reference count cap of its own.

### G-11 — the budget's identity
- [ ] **R4:** Layer A: the budget's aggregation key is a digest over `echoComparisonForm(content)`, `content_sha256` untouched (question 1). Task 12's byte-identical `normaliseContent` regression test closes here and is what makes that safe.
- [ ] **R5:** Layer B: the containment bucket, with the **never-brick property re-proved on the bucketed path** — a rebuild citing exactly the spans it cited before still writes, even when the bucket is already over the ceiling.
- [ ] **R6:** The false-positive case is a **test with a stated verdict**, not a hope: two genuinely similar reference posts share one budget, and the refusal copy tells the creator which posts were treated as one and what to do.

### G-10 — evidence may not cite an absence
- [ ] **R7:** Every `source_evidence` entry must name a claim position holding a **stated** value; an entry naming a `[check]` position is refused by name (question 4).
- [ ] **R8:** The bijection is asserted in both directions in one test — stated ⇒ cited (C-28, exists) and cited ⇒ stated (new) — so a future widening cannot re-open one side while the other stays green.

### R-30.10 / task 42 — the barred set
- [ ] **R9:** `REFERENCE_BARRED_KINDS` becomes `{voice, killtest, performance_meta}`; `strategy`'s exemption is recorded in `decisions.md` with `echo.ts:58-68`'s reason (question 3).
- [ ] **R10:** `packages/db/tests/reference-echo.test.ts` is created and covers **each** barred kind, not just the one that already worked.

### G-16 — the two lists that disagree
- [ ] **R11:** `retainedReferenceSpans`' skip-list (`with-workspace.ts:2208-2229`, integers only) and `assertUsableSpan`'s refuse-list (`echo.ts:453-458`, also negative and inverted) are reconciled. The resolution direction is **fixed by which side is on the write path**: a stored malformed row must never make a profile unable to write again (the permanent-refusal shape C-9/C-41 exist to remove), so `retainedReferenceSpans` keeps skipping — and `assertUsableSpan` keeps refusing on **new** spans. What changes is that the disagreement stops being accidental: one shared predicate, two call sites, and the comment at `with-workspace.ts:2171-2178` stops claiming the opposite.

### The promise a creator reads
- [ ] **R12:** When the bar or the budget refuses, the creator is told **what was too close and to which post**, and offered a way forward. `echo.ts:385-387` already names the pointer, input id and span in the refusal — this slice turns that into copy a person can act on, through `billing-errors.ts`'s four-step pattern.
- [ ] **R13:** No screen in this slice promises the output is original, safe, or non-infringing. R-3 is a control, not a guarantee, and REQ-I04's no-guarantee rule applies to compliance claims as much as performance ones.
- [ ] **R14:** Ship a creator-reachable, no-store **reference safety check** beside reference intake. A creator pastes a candidate draft; the action derives workspace/profile scope server-side, runs the exact shared echo/budget predicate used by writes, persists neither draft nor result, and returns actionable overlap/refusal copy. Walk its first live refusal in a browser.
- [ ] **R14a:** The safety check is not an advisory fork: a contract test pins its decision to the hard write predicate for the same scoped corpus. The actual write path remains authoritative and may still refuse after a preview if the corpus changed.
- [ ] **R14b:** The first creator-reachable **write** refusal is explicitly owned by slice 5's edit walk. Slice 4 proves the production predicate/copy and hard-path tests; it does not claim a browser write path that does not exist here.

### The honesty debt
- [ ] **R15:** B-7 / task 47 — `echo.ts:42-46` either states its population or is relabelled a judgement (question 5).
- [ ] **R16:** B-11 — the config-vs-code carve-out is recorded in `decisions.md`, and `decisions.md` R-6 and `tech-spec.md:109` are amended to name the **spin** similarity gate as their subject (question 5).

---

## Left to the developer

- **Whether reference intake is a step on `/onboarding` or its own panel.** R1's invariant is a separate operation, not a parameterised one.
- **Whether the no-store check is on that panel or `/brain`.** R14's invariant is a real production caller of the same predicate, not its route.
- **The bucket's data structure** (union-find, or transitive closure over pairwise windows) — R5's invariant is the never-brick property, not an algorithm.
- **The reference count cap's number** (R3), and whether it is code or config — B-11's decision governs it.
- **Test file layout**, subject to R10 naming `reference-echo.test.ts`.

## Tasks
1. [ ] `appendReferencePost` as a sibling operation, with `source_url` (R1, R2)
2. [ ] The intake UI + copy; reference count cap; starvation test (R3)
3. [ ] G-11 Layer A: the `echoComparisonForm` digest; task 12's regression test (R4)
4. [ ] G-11 Layer B: the containment bucket; never-brick re-proof; false-positive test (R5, R6)
5. [ ] G-10: the cited⇒stated direction and its bidirectional test (R7, R8)
6. [ ] R-30.10 / task 42: widen the barred set; `reference-echo.test.ts` (R9, R10)
7. [ ] G-16: one shared span predicate, two call sites, corrected comment (R11)
8. [ ] No-store reference safety-check action/UI using the shared predicate; refusal copy through `billing-errors.ts`'s four steps (R12–R14a)
9. [ ] B-7 / B-11 / task 47: the two docblocks and the two documents (R15, R16)
10. [ ] Walk it: add a reference → paste an echoing candidate into the safety check → be refused, on screen; record slice 5's write-refusal handoff (R14–R14b)

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/onboarding-ops.ts` | Modify | `appendReferencePost`, the reference cap |
| `respin/packages/db/src/echo.ts` | Modify | The bucket, the shared span predicate, the two docblocks (R15) |
| `respin/packages/db/src/with-workspace.ts` | Modify | R7's cited⇒stated direction; R9's barred set; R11's shared predicate; the budget's new key |
| `respin/packages/db/src/app-server.ts` | Modify | The reference intake door, `WorkspaceScope` positionally (AC-13 scan) |
| `respin/app/(product)/onboarding/**` | Modify | The reference panel, its copy, the corpus-mix display |
| `respin/app/(product)/brain/**` or reference panel | Modify | No-store candidate safety-check UI/action |
| `respin/app/(product)/billing-errors.ts` | Modify | Copy for every new refusal, per the four-step pattern |
| `respin/packages/db/tests/reference-echo.test.ts` | Create | R10 — every barred kind |
| `respin/packages/db/tests/echo.test.ts` | Modify | R4's digest, R5's bucket + never-brick, R6's false positive |
| `respin/packages/db/tests/with-workspace.test.ts` | Modify | R8's bijection, task 12's `normaliseContent` regression |
| `respin/tests/onboarding-ui.test.tsx` | Modify | R2's copy, R12's refusals, R13's honesty scan |
| `docs/initial/decisions.md`, `docs/initial/tech-spec.md` | Modify | R16 |

**No migration is expected** — `input_class` already has `reference`, and `source_url` already exists.

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Add a reference → check a candidate echoing 8 segments of it → refused, on screen, in a browser**; database inspection proves the candidate/result were not stored (R14)
2a. [ ] For the same candidate/corpus, the preview decision equals the hard write predicate; then change the corpus and prove the write rechecks rather than trusting preview state (R14a)
3. [ ] The same reference pasted twice, once with a trailing space → **one** budget, not two (R4 — G-11's exact exploit)
4. [ ] A 500-character excerpt of a 1,000-character reference → same bucket as the whole post (R5)
5. [ ] Two genuinely similar references → one budget, and the copy says which posts (R6)
6. [ ] An evidence entry naming a `[check]` position → refused (R7 — G-10's exact exploit)
7. [ ] A `reference` input cited for `voice`, `killtest`, **and** `performance_meta` → refused in all three (R9, R10)
8. [ ] A rebuild citing exactly the same spans, on an over-ceiling bucket → **writes** (R5's never-brick)
9. [ ] A profile with 50 references and 5 own posts → the voice corpus still sees the own posts (R3)
10. [ ] A stored inverted range → `retainedReferenceSpans` skips, a new inverted span refuses (R11)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Budget key reverts to `content_sha256` | The trailing-space test (verification 3) |
| M2 | Bucket disabled — one post per digest | The excerpt test (verification 4) |
| M3 | `[check]`-position entries permitted again | R7's test |
| M4 | `REFERENCE_BARRED_KINDS` back to `{voice}` | R10's per-kind cases |
| M5 | Never-brick short-circuit removed | Verification 8 |
| M6 | Reference intake reuses `appendOwnPost` with a class parameter | R1's sibling-operation test + `table-writers.test.ts` |
| M7 | `assertUsableSpan` made permissive on inverted ranges | R11 |
| M8 | Refusal copy replaced with "Something went wrong" | R12's copy test |

**Population note — read before reporting "N of N".** Eight mutations, all on code that will exist. **Two hazards this matrix cannot reach, named now:** (a) the whole slice's premise is that a **dormant** control is correct — every existing echo and budget test has only ever run against fixtures, so a defect in the bar itself would have survived every round to date and no mutation of *new* code can find it; **R14's browser walk is the only instrument that can**, which is why it is a requirement and not a nicety. (b) The bucket (R5) is new equivalence logic, and CLAUDE.md's 2026-08-26 record is that **a hash that is the wrong equivalence relation is exactly the class mutation testing is blind to** — G-11 *is* that finding, and building its replacement is the same risk one layer up. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations, targeting the bucket specifically.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser, including a real no-store safety-check refusal; slice 5 carries the first browser **write** refusal (R14b)
- [ ] **Spin compliance** PASS; **brain tenancy** (Full gates), **learning honesty** and **billing** PASS — reviewers in **isolated worktrees**
- [ ] G-10 and G-11 closed in the disposition register, with G-16, B-7, B-11, R-30.10 and tasks 12/42/47
- [ ] `decisions.md` carries: G-11's two-layer relation, G-12's recorded acceptance **with its blast radius**, the barred-set widening and `strategy`'s exemption, and B-11's config-vs-code carve-out
- [ ] `tech-spec.md:109` and `decisions.md` R-6 name the **spin** gate as their subject (R16)
