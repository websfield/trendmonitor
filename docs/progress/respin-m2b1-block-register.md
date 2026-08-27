# Respin M2b-1 — register of every BLOCK raised, rounds 1–6

**Compiled 2026-08-26.** Every blocking finding from all six Critical-Path gate rounds, with its current status.

| Round | Date | Artifact under review | BLOCK | Verdict |
|---|---|---|---|---|
| 1 | 2026-08-24 | pre-split `respin-m2b-plan.md` | **20** | BLOCK ×4 |
| 2 | 2026-08-24 | M2b-1 after rewrite + split | **12** | BLOCK ×4 |
| 3 | 2026-08-24 | round-3 revision | **9** | BLOCK ×4 |
| 4 | 2026-08-25 | round-4 revision + 2 built modules | **7** | BLOCK ×4 |
| 5 | 2026-08-25 | round-5 revision (**prose only**) | **11** | BLOCK ×4 |
| 6 | 2026-08-26 | ROOT A built (**code**) | **8** | BLOCK ×4 |
| | | **Total raised** | **67** | |

**Trend: 20 → 12 → 9 → 7 → 11 → 8.**

> **Detail caveat, stated rather than smoothed over.** Rounds 3–6 have full per-block records on disk (`respin-m2b1-plan-review-round3/4/5/6.md`). Rounds 1–2 have counts and the convergent findings recorded in the ledger, but **not** all 32 individual blocks — 7 of round 2's 12 and roughly 5 of round 1's 20 are named below. The rest are summarised as closed-by-rewrite without individual citations, because that is what the record supports.

---

## A. OPEN — the actionable list

**REOPENED 2026-08-26 (fourth entry).** The previous entry said "EMPTY … all 67 blocks closed in code and measured." **That was false**, and all four Critical-Path gates said so within the hour — every one BLOCK at Grade D, nine BLOCKs between them, against work this register had recorded as closed and measured.

**The nine BLOCKs are now fixed and each is pinned by a mutation that reddens** — see section A-double-prime. What remains open is listed here honestly rather than declared empty a second time.

| # | Open item | Raised by | Status |
|---|---|---|---|
| B-1 | **The `editor` authority decision is unrecorded.** C-39 requires `decisions.md` to state explicitly that an *editor* — not "the creator" (REQ-B02) — may confirm someone's inferred voice rules and land in `confirmed_by`. It says nothing. | tenancy | Open — a decision, not code |
| B-2 | **A viewer can still WRITE a brain document.** `assertMayDecide` guards confirm and activate only; `writeBrainDoc`, `appendOnboardingInput` and `recordModelUsage` have no role check, and the role x capability table (task 41) has no unclassified-cell instrument. | tenancy | Open |
| B-3 | **The confirmation sha pins `content` only, not `(content, source_evidence)`.** AC-27 names the pair. No product path mutates evidence today, so exploitability is low — but a task marked LANDED does not meet its criterion. | tenancy | Open |
| B-4 | **Migration 0012 has no backfill and no `NOT VALID`/`VALIDATE` split.** On any database holding a pre-0012 `brain_docs` row it aborts, and a `[]` backfill does not help because the CHECK refuses it. Zero such rows exist, so it has never run — but R-32 records "applied and `db:check` clean" without naming the precondition. | billing | Open — recorded, not fixed |
| B-5 | **`confirmed_fields` and `evidence_counts` are nullable with no default** where the plan specifies `NOT NULL DEFAULT`. Learning judged nullable BETTER for its lane (NULL means "never computed"; `'{}'` would read as a computed zero) — but it is a silent substantive divergence from the plan, and the `active` CHECK also omits `activated_at`. | learning | Open — reconcile plan to code, or code to plan |
| B-6 | **`brain_kind_not_writable` copy promises a capability that does not exist** ("Log some results first and this document gets written from them") — there is no results surface, and the copy is silent on the n >= 3 bar. Same shape in the package-level message. | learning | Open |
| B-7 | **Task 47's other half.** `echo.ts`'s "9 shared 8-grams in 607" names no unit or population, and "below 8 the collision rate climbs into ordinary phrasing" is an unmeasured claim sitting in a paragraph headed *Measured*. The 600 constant is treated correctly and is the standard this should meet. | learning | Open |
| B-8 | **`table-writers.test.ts`'s reviewed-decision string for `brain_docs` still says "the ONE write surface".** Three capabilities write it now, so the scan stays green while its stated reason is false. | learning | Open |
| B-9 | **The plan's status column is stale in BOTH directions** — tasks 28/29/32/33/38 built but marked TODO; task 19 still lists an outstanding item A-4 closed. A status table nobody can trust is what let "all 67 closed" through. | tenancy, learning, compliance | Open |
| B-10 | **Pause reads take no workspace lock** while every ledger writer holds one, so a pause committing concurrently can be missed. Immaterial only while `onboardingBrainBuild` costs 0 — a **config** value an operator can raise with no deploy. Four error messages assert "no credits were spent" on the same basis. | billing | Open — becomes material in M2b-2 |
| B-11 | **`ECHO_MIN_SEGMENTS` / the two quote constants are code, not config** — a deliberate carve-out from B5 / tech-spec §5 ("similarity thresholds live in config"), argued in source and recorded in no decision. | billing | Open — record the carve-out |
| G-10 | **An evidence entry may cite a claim position holding `[check]`**, turning `source_evidence` into an unbounded text channel — and the non-empty CHECK *forces* it, since an all-placeholder version has no legitimate entries. Found by compliance and learning independently; compliance stored 200 characters of a third party's post as the "evidence" for a document asserting nothing. | compliance, learning | **OPEN** — Tier 2. Fix: refuse an entry whose `field` resolves to `CHECK`, and let an all-placeholder version store with zero entries |
| G-11 | **The budget's identity is an exact sha, which is the wrong equivalence relation.** A trailing space or a substring mints a second 600-character budget; compliance reassembled a 984-character post **byte-identical** through public capabilities. The exact-duplicate route is closed; the class is open. | compliance | **OPEN** — Tier 2. Fix: bucket by a shingle/containment class over the normalised content, reusing `wordLikeSegments` and `ECHO_MIN_SEGMENTS`, and union ranges across the bucket |
| G-12 | **`input_class` is caller-supplied and verified nowhere, and `own_post` switches BOTH R-3 controls off** — no quote budget, no echo bar. Compliance stored 1000 contiguous characters of a third-party post in a single write. Needs no duplicate and no trick. | compliance | **OPEN** — Tier 2. Fix: apply the budget to every `input_class` (the bar is how much of one post was extracted, which does not depend on who the creator says wrote it), or record the acceptance with its blast radius |
| G-13 | **A viewer can still WRITE a brain document** and append onboarding inputs. Tenancy explicitly **rejected** the earlier deferral: `brain_docs` is append-only, so a viewer permanently consumes version numbers *and* permanently consumes the profile's R-3 quote budget — neither reversible by the owner. | tenancy | **OPEN** — Tier 2, deferral withdrawn. Fix: gate all five capabilities and build task 41's role x capability table with an unclassified-cell instrument |
| G-14 | **The advisory lock that closed billing's BLOCK survives its own deletion** — 789/789 green. Found by billing and tenancy independently. Nothing races two `writeBrainDoc` calls. | billing, tenancy | **OPEN** — Tier 2. Billing has a 60-line two-connection harness that reproduces both directions |
| G-15 | **The import-time throw did not move.** Billing's recommendation was recorded ACCEPTED in R-33 and no code changed, so the finding is now *less* tracked than when it was declined. | billing | **OPEN** — Tier 3 carryover, now tracked here |
| G-16 | **`retainedReferenceSpans`' skip-list and `assertUsableSpan`'s refuse-list disagree**, and the disagreement resolves toward the permanent brick: a stored inverted range is skipped by neither and throws forever. Unreachable through product paths today; the function's own comment claims the opposite. | billing | **OPEN** — Tier 2 |
| G-17 | **Two advisory-lock keys with no recorded ordering.** M2b-2 takes `debitCredits` (workspace key) and `writeBrainDoc` (brain key) in one transaction by B3's rule; the reverse order deadlocks. | billing | **OPEN** — one decision line: workspace key before brain key, always |

**Also open, and much larger than this register:** M2b-1 has **26 TODO and 5 PART** tasks (16 LANDED, 47 numbered tasks over two tables). The figure first recorded here was 28/4 — wrong in both directions, and it was the *replacement* for a count a gate had already blocked on. Derived by counting the plan's own status column, which register item B-9 records as stale, so treat it as an upper bound on what is built. The earlier "unbuilt tasks" line named four items and was wrong about the scale. The register tracks BLOCKS, never the milestone.

---

## A-double-prime. THE NINE GATE BLOCKS — fixed in the remediation pass, each pinned by a mutation

Every one of these was raised against work sections A-prime and B had already recorded as closed. That is the finding, not a footnote.

| # | BLOCK | Raised by | Fix | Mutation |
|---|---|---|---|---|
| G-1 | The budget's unit was `(profile, inputId)` and `onboarding_inputs` has no content dedupe, so **the same post pasted twice bought two budgets** — a 989-character post reassembled exactly and contiguously through public capabilities alone | compliance | Unit is now `(profile, content_sha256)`: the identity of a post is its content | G1 RED |
| G-2 | **A getter on an evidence entry swapped the quote after validation** — drizzle's serialiser re-reads every property, so a 10-character quote validated and a 900-character one stored, leaving a range that under-counts that row forever | compliance | Each entry parsed through `z.strictObject`; the **server-rebuilt** array is stored | G4 RED |
| G-3 | **C-28 was recorded closed in four places while task 31 was TODO** — including as the stated PREMISE for C-42 in `brain-reason.ts`'s header | compliance, learning x2 | C-28 built: `field` pointer on the entry, every claim position cited or `[check]`, every entry pointing at a declared position. **NARROWED after the re-gate:** C-28 is a provenance-SHAPE rule — it enforces *that* a claim is cited, never that the citation SUPPORTS it. Compliance re-ran the invented-specific walk and it still writes, confirms and activates with four unrelated characters as its warrant. Semantic support is not computable and is not claimed; **REQ-I03 remains OPEN at the brain surface** | G6 RED |
| G-4 | **The activation gate was vacuous** — `confirmed_fields` was never compared to the claim set, `enumerateClaimFields` had zero production callers, AC-26 was an orphan criterion, and every fixture passed `confirmedFields: []` | tenancy, learning | AC-26 enforced; confirmation validates pointer validity and the placeholder flag | G7, G13, G14 RED |
| G-5 | **A concurrency race re-created the permanent brick** — the budget is a read-then-write with no serialisation, two concurrent writes of different kinds both committed (reproduced on real Postgres, trial 0), and the profile was refused thereafter with no remedy | billing | `pg_advisory_xact_lock` on `(workspace, profile)`, **and** the ceiling refuses only on material the write ADDS | G3 RED |
| G-6 | `unionLength` **failed open on `NaN`** — one such span turned the entire ceiling off | billing | `assertUsableSpan` refuses non-finite ranges in the public export itself | G2 RED |
| G-7 | An **inverted range CREDITED** the budget | compliance | same | G2 RED |
| G-8 | **"A. OPEN — EMPTY, all 67 closed" was false** — block 4.4/W-11 was marked Fixed via unbuilt C-28 | learning | C-28 built; this register reopened | — |
| G-9 | **"24 of 24 RED, every survivor was wiring, never module logic" was a true count over an inadequate population** — reviewers planted ten more and six survived, two of them module logic | learning, tenancy | Generalisation withdrawn in R-32; detectors added for all six; the lesson promoted to CLAUDE.md | G8-G12 RED |

**Six mutations the author's population could not see, now pinned:** the two workspace predicates (`readOwnBrainDoc`, `referenceCorpusAsOf`), the pause gate on both new capabilities, `confirmedFields` stored empty, the `asPlaceholder` flag flattened, and `citedInputCount` counting entries instead of distinct inputs — the last being the number the creator actually reads.

---

## A-prime. CLOSED EARLIER 2026-08-26 — the five register items

### A-3 · C-29's recorded corpus id set had no column — **CLOSED (migration 0012 + tasks 5/8/9/34/35)**
Raised round 5 (tenancy BLOCK; billing + learning CHANGE), restated round 6. It was the last one open, and it was the expensive one: closing it required the migration and everything AC-62/AC-63 name.

**The column exists.** Migration `0012` adds `reference_corpus_ids jsonb NOT NULL DEFAULT '[]'`, alongside the five confirmation/provenance columns, `source_evidence NOT NULL`, a non-empty CHECK on it, and a CHECK making an `active` row structurally require `confirmed_at` and `confirmed_content_sha256`. `db:check` is clean and the migration is applied.

**The write RECORDS the set and activation RE-READS IT** — which is the whole decision. A corpus rebuilt at activation asks a different question from the one the write answered: a `reference` input appended in between refuses a version the write had already cleared, permanently (inputs are immutable, versions append-only), with a priced rebuild as the only remedy. `created_at` cannot fix it, because `defaultNow()` is transaction-START time, so an input whose transaction starts before the write and commits after it is invisible to the write and inside any timestamp-bounded corpus rebuilt later. **AC-63 proves that interleaving on real Postgres** (`activate.docker.test.ts`), with the counterfactual asserted rather than argued: the test checks that a `created_at`-bounded corpus really would have seen the raced row, so the assertion cannot pass vacuously on a run where the race never happened. PGlite cannot express it at all — one connection — so a PGlite version would have passed against the broken implementation.

**It is guarded, and the guard is now a class-level instrument.** `referenceCorpusIds` is in `GUARDED_WRITE_FIELDS` in drizzle property space, and C-32's **completeness test** finally exists: it enumerates the drizzle table's own property space and fails on any `brain_docs` column that is neither guarded nor declared caller-suppliable. The hand-list had missed exactly one field in four consecutive rounds — `status`, `version`, `evidence_counts`, and then the one the plan predicted it would miss and did, this one. A fifth miss now fails at the point of adding the column.

**What it dragged in, stated plainly:** `VerifiedUserId` and `role`/`userId` on the scopes (task 5), `confirmBrainDocFields` and `activateBrainDoc` (tasks 8/9), `referenceCorpusAsOf` (task 35), and `GUARDED_WRITE_FIELDS` in property space (task 34). Shipping activation without the role gate and the server-derived `confirmed_by` would have **reopened closed blocks 2.6 (T-A) and 1.2 (T3)**, so those were not optional; both are pinned by mutations.

**A measured defect found while building, not by reading:** the corpus accessor closes over the pool, and reading the pool from inside an open transaction **deadlocks on a single-connection driver** — every write test hung for 30 s. The accessor now takes the transaction. Building a second query inside `writeBrainDoc` to dodge it would have been the two-corpora shape C-29 exists to remove.

---

### The four closed earlier the same day

Recorded here rather than folded into section B, because these were the **open** list until today and the next gate round should read them as claims to attack.

### A-1 · C-37's quote ceiling was a monotone counter — **CLOSED (C-41)**
Raised round 5 (billing), restated round 6, never claimed fixed until now.

The measure is now the **union of distinct covered source ranges** per `(profile, reference inputId)` across every retained version and kind, not the sum of quote lengths. Re-citing a span costs nothing, so N rebuilds citing the same spans always write — the bricking, and the priced-refusal-after-tokens-spent that came with it, are gone. Disjoint new material still accrues, so the reassembly bar C-37 was raised to close still holds; overlapping spans count once, so a one-character shift cannot buy 240 fresh characters.

**`AC-66` was REPLACED, not merely re-measured** — and this is the substantive half. Its wording ("N versions each within the per-doc ceiling but jointly reassembling one post is refused") was satisfiable *only* by a counter spanning all retained versions, i.e. the criterion **selected** the bricking implementation, and an active-version-only counter would have failed it. Three criteria replace it: re-citation is free (AC-66a), disjoint material still refuses (AC-66b), overlap counts once (AC-66c).

Mutations: sum-instead-of-union RED, one-bucket-for-all-inputs RED, merge-swallows-adjacent RED, budget-ignores-retained-versions RED (**detector added — it survived the first run**), sum-end-to-end-at-the-write-path RED. `REFERENCE_QUOTE_TOTAL_MAX_CHARS = 600` is now recorded in source as an unmeasured judgment rather than implied to be derived.

### A-2 · `[check]` was required for `content` and not for `reason` — **CLOSED (C-42)**
Raised round 5 (compliance), restated round 6 (verified honestly declared open).

**`reason` stops being model-written free text.** The caller supplies a closed `BrainDocReason` code; `writeBrainDoc` renders the stored sentence, interpolating only numbers the server derived. Extending C-28's cited-or-`[check]` rule to `reason` was not available — C-28 works because `content` has enumerable positions and a sentence has none — and every detector for the free-text form (digit runs, capitalised tokens, proper nouns) is the counterexample-list shape the 2026-08-18 lesson forbids. So the channel is removed rather than filtered: the compliance reviewer's own fixture, "a devout Catholic mother in Leeds, 42000 followers", is unrepresentable.

Mutations: caller-`detail`-reaches-the-column RED, runtime-code-check-removed RED (the `as unknown as` smuggle, per 2026-08-21), writeBrainDoc-bypasses-the-renderer RED (**detector added — it survived the first run**).

### A-4 · The strip was correct in the funnel and the funnel was off the write path — **CLOSED (task 3 + C-40)**
Raised round 6 by three reviewers.

`writeBrainDoc` now calls `parseBrainContent` and **stores the value it returns**. That re-arms THREE controls on the only live brain-write surface: the `serverOwned` strip, content-schema validation, and `WRITABLE_BRAIN_KINDS`. **CORRECTED 2026-08-26 after the tenancy gate** — this said FOUR and named the claim enumeration, which `parseBrainContent` never called; that wiring landed with C-28 in the remediation pass — so R-10's "no performance claim at n = 0" is enforced where writes happen. C-40 lands with it: every field of the params is read exactly once into a local, so a getter cannot swap the content between the check and the store.

Mutations: store-raw-not-parsed RED, no-parse-at-all RED, TOCTOU-second-read RED — **all three survived the first run and needed detectors**. Six existing fixtures were carrying content that had never been schema-valid; they reached the assertion under test only because nothing on the write path looked at content.

### A-5 · The module-load guard ran in no deployed process — **CLOSED (task 43)**
Raised round 6 (billing measured; learning + tenancy concurred).

`brain-content.ts`, `echo.ts` and `brain-reason.ts` are exported from the package index, so `assertRegistryClosed()` executes wherever `@respin/db` is imported. The test asserts the load through the **package root**, not the relative path that stayed green.

**The export immediately turned the `billing-ui.test.tsx` facade-completeness guard red for seven refusal classes** — `SchemaShapeError`, `KindNotYetWritableError`, `ClaimWalkError`, `ContentSchemaError`, `ContentWalkError`, `SegmenterUnavailableError`, `BrainReasonError` — which is precisely the gap billing said the dormancy was masking. All seven have copy and an allowlist entry.

**Billing's boot/health-assertion alternative was considered and NOT taken** (R-31 records the reasoning): the registry is a module constant, so the guard's condition is static and cannot become true in a deployed process without also being red in CI. The first mutation written for this block was a *bad* one — dropping one name from the export list leaves the module loaded — and is recorded as such; the honest mutations (drop the whole block; make it a type-only export) both redden.

## B. Closed — by round

### Round 6 (8 blocks) — all code blocks fixed and measured this session

| # | Block | Reviewer(s) | Status |
|---|---|---|---|
| 6.1 | `serverOwned` was a marker with **no enforcement** — `parseBrainContent` returned `{"schemaVersion":999}` verbatim, and the source comment claimed a strip that did not exist | tenancy, compliance, learning | **Fixed in the funnel** (N1 RED) — wiring open, see **A-4** |
| 6.2 | Absence was never a disagreement: `enumerateClaimFields("strategy", {})` → `[]`, and a widened schema left stored rows enumerating the **old** claim set | tenancy | **Fixed** (N2 RED) |
| 6.3 | `\p{Default_Ignorable_Code_Point}` excludes **32** `\p{Cf}` characters, every one measured defeating the bar — a bigger list, not a class | compliance | **Fixed** (N5 RED) |
| 6.4 | "10 of 11 RED" false as a **coverage** claim — a reviewer's own 21 mutations found 4 survivors | learning | **Fixed** — all four redden (M8, M15, M18, M19) |
| 6.5 | The aggregate contradicted the document and cited `P-56`, which exists nowhere | learning | **Fixed** — per-row colours, aggregate withdrawn |
| 6.6 | The canary's "equivalent mutant" label was a missing detector — a seam was available | learning | **Fixed** (N7 RED, via injectable `check` + asserted canary set) |
| 6.7 | C-37 monotone counter | billing | **OPEN → A-1** |
| 6.8 | `[check]` for `reason` | compliance | **OPEN → A-2** |

### Round 5 (11 blocks) — the prose-only round

**Six of the eleven were introduced by that revision itself.**

| # | Block | Status |
|---|---|---|
| 5.1 | `C-27(a)` as worded **refused all four shipped schemas** (three reviewers measured it) | **Fixed** — the rule is a split: `assertShapePosition` / `assertClaimInner` |
| 5.2 | The obvious repair re-admits `claim(z.any())` / `claim(z.record())`, whose criterion had been withdrawn unreplaced | **Fixed** — both refuse; regression test pinned |
| 5.3 | `serverOwned` an unguarded exemption with no production site | **Fixed** (site + strip) — wiring open, **A-4** |
| 5.4 | `AC-55` permitted `claim(z.strictObject(...))`, collapsing two claims into one confirmable position | **Fixed** — `assertClaimInner` refuses containers |
| 5.5 | `AC-51`/`P-38` could not detect the defect they guarded (the test looped the registry itself) | **Fixed** — loop deleted, canary + source scan |
| 5.6 | C-29 corpus set: no column, no guard, no criterion; empty set silently disabled R-3 | **Half** — module fixed, schema open → **A-3** |
| 5.7 | `[check]` for `reason` | **OPEN → A-2** |
| 5.8 | C-29 opens a post-write reference-paste blind spot recorded nowhere | **Fixed** — recorded as a residual |
| 5.9 | `C-27(c)`/`AC-53` named four fail-open shapes; the class had at least seven | **Fixed** — any schema/instance disagreement refuses |
| 5.10 | Withdrawn RED marks re-asserted in aggregate at three sites | **Fixed** |
| 5.11 | `AC-44`'s cell said both "MARK WITHDRAWN" and "MET" | **Fixed** |

### Round 4 (7 blocks)

| # | Block | Status |
|---|---|---|
| 4.1 | `assertClosedSchema` accepted any unmarked scalar leaf | **Fixed** (round 6) |
| 4.2 | `assertClosedSchema` had **no production caller** — "walks the registry" described a test loop | **Fixed** structurally; dormant → **A-5** |
| 4.3 | `enumerateClaimFieldsOf` failed **open** on the shapes the guard refused | **Fixed** |
| 4.4 | `[check]` representable but never **required** | **Fixed** for `content` (C-28); `reason` → **A-2** |
| 4.5 | The quote-level bar's corpus was unscoped | **Fixed** (C-29 mechanism) |
| 4.6 | `brain_docs.reason` — model-written free text, echo-unchecked, exported | **Fixed** for echo + cap; `[check]` → **A-2** |
| 4.7 | **`P-2` marked RED and provably GREEN** — 0 of 4 fixtures discriminated | **Fixed** — discriminating fixtures added, mark withdrawn then re-earned |

### Round 3 (9 blocks)

| # | Block | Status |
|---|---|---|
| 3.1 | `.strict()` relocates the invented-specific class one nesting level down | **Fixed** — `z.strictObject` at every node |
| 3.2 | The key space and optionality were undefined (`z.record` inside a strict parent) | **Fixed** — `assertClosedSchema` |
| 3.3 | No criterion could detect C-1's reopening | **Fixed** |
| 3.4 | C-1 and C-18 **jointly unsatisfiable** for non-string leaves | **Fixed** — `claim(x) = union([x, literal("[check]")])` |
| 3.5 | `evidence_counts` outside `GUARDED_WRITE_FIELDS` — forgeable provenance label | **Fixed** — C-32, drizzle property space + completeness test |
| 3.6 | C-15 fixed 3 sites of a measured 12 | **Fixed** — grep-asserted, no line numbers |
| 3.7 | The 240-char cap bounds one quote, not the reassembly | **Fixed** per doc; unit → **A-1** |
| 3.8 | `maybeAutoTopup` invites an unmetered generation | **Fixed** — refuses this attempt regardless |
| 3.9 | The activation echo bar reproduces C-9's permanent-refusal defect | **Fixed** — C-29 |

### Rounds 1–2 (32 blocks)

Closed by the rewrite-and-split and by round 3, per the reviewers' own round-2 confirmations: **tenancy 6 of 8, compliance 4 of 4, learning 2 of 4, billing 4 of 4 carried into the M2b-2 scope note at full strength.**

Individually named in the record:

| # | Block | Round | Status |
|---|---|---|---|
| 2.1 | **V1** — a non-string leaf escapes every gate (`content` was `unknown`) | 2 | **Fixed** — per-kind schemas |
| 2.2 | **V2** — C-4/C-5 jointly unsatisfiable (a `reference` quote is verbatim by construction) | 2 | **Fixed** — C-7 |
| 2.3 | **V3** — activation never pinned the activated content to the confirmed content | 2 | **Fixed** — UPDATE + sha pin |
| 2.4 | **V4** — the two new capabilities had no pause classification | 2 | **Fixed** — C-11 |
| 2.5 | **V5** — the echo bar at export could permanently deny a REQ-A04 export | 2 | **Fixed** — C-9, annotate-never-refuse |
| 2.6 | **T-A** — `ProfileScope` carried no role; a viewer could confirm and activate | 2 | **Fixed** — C-12 |
| 2.7 | **T-B** — the AC-13 scan's **predicate** matched `WorkspaceScope` only | 2 | **Fixed** — C-19 |
| 1.1 | **C1** — the echo matcher's instrument (whole-leaf containment) | 1 | **Fixed** — sliding window over segments |
| 1.2 | **T3** — `confirmed_by` forgeable as a parameter | 1 | **Fixed** — server-derived from `scope.userId` |
| 1.3 | **T4** — `runInference` role gate | 1 | Deferred to M2b-2 (recorded) |
| 1.4 | **C4/T2** — confirmation/activation not capabilities | 1 | **Fixed** — C-14 |
| 1.5 | **L1** — `performance_meta` writable at onboarding | 1 | **Fixed** — C-17, and now `z.strictObject({})` |

---

## C. What the register shows

**Blocks by origin.** Of the 67 raised, a large share were defects the *previous revision introduced* rather than pre-existing gaps — round 5 alone contributed six. The recurring shape, present in every round without exception until round 6: **a finding closed at the instance it names, with the class open one level down.**

**Blocks by discovery method.** Effectively every block from round 3 onward was found by a reviewer **running code** — the installed zod's nesting semantics, `Intl.Segmenter`'s locale resolution, drizzle's silent snake_case drop, a 4174-code-point Unicode sweep, a 21-mutation independent pass. Almost none were found by reading prose.

**Method comparison, two observations per arm.**

| Rounds | Method | BLOCK |
|---|---|---|
| 3 → 4 | Built the contested modules | 9 → **7** |
| 4 → 5 | Revised prose only | 7 → **11** |
| 5 → 6 | Built ROOT A | 11 → **8** |

**Current state (2026-08-26, after the re-gate remediation).** Entry gate on the CI shape: `typecheck 0 · eslint 0 · db:check clean · 789 passed / 789, 41 files, zero skips` — confirmed independently by all four reviewers and re-run on a verified-clean tree. Mutation record: **24 planted by the author + 14 in the first remediation + 17 by tenancy + 7 by billing + 4 by learning + 3 in this pass**; the author's matrices were all-RED and reviewers still found **seven survivors** across two rounds. The number that matters is the population, not the count — see the paragraph below.

*(This paragraph read `734 / 734, 38 files … 11 of 11 RED` for three revisions after those figures stopped being true, inside the document whose reopening was the fix for a false status claim. Learning caught it.)*

**The register is NOT empty, and the previous entry saying so is the single most instructive thing in this file.** All four Critical-Path gates ran within the hour of that claim and every one returned BLOCK at Grade D. Nine BLOCKs, all against work recorded here as closed and measured. Eleven items remain open in section A.

**The mutation record, stated with its population this time.** The author planted 24 mutations across the day and all 24 reddened. Reviewers then planted ten and **six survived** — two workspace predicates, the pause gate on two capabilities, `confirmedFields` stored empty, the `asPlaceholder` flag flattened, and `citedInputCount` counting entries rather than distinct inputs. Two of the six are module logic on the confirm surface, which falsifies the generalisation the previous entry drew ("every survivor was wiring, never module logic"). That generalisation is **withdrawn** in R-32. All six now redden.

**What the gates confirmed rather than refuted, because it belongs on the record too.** All four independently reproduced the entry-gate figures exactly. C-42 (`reason` as a closed code) held under sustained attack — extra keys, nested codes, bare strings, `null`, `42`, case variants, all via `as unknown as` — and was called "the right shape of fix; it is on the wrong field to be sufficient". C-41's tests were verified non-vacuous. Every `migration-shape` assertion pairs with a planted violation. The tenancy cage, export/deletion, PII, B1-B4/B6, the sources allowlist, no-guarantees and no-automation all pass. The 30s->60s timeout raise was judged **honest engineering, not a green-wash**. R-10 / `performance_meta` is true. And learning explicitly credited the docs for keeping "an empty register is not a gate PASS" separate from the engineering claim throughout — that separation was the one thing that made this correction cheap.

**The four Critical-Path gates HAVE now run** (2026-08-26): all four BLOCK at Grade D, nine BLOCKs fixed and pinned in section A-double-prime, eleven items open in section A. **A re-gate has not been run against the fixes** — this remediation pass is entry-gate and mutation evidence again, which is the weaker claim, on a milestone whose entire record is that reviewers find what the author's matrix misses.
