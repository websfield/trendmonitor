# Slice 9a — Log a result, see an honest comparison

**Split from [`respin-finish-phase-9.md`](respin-finish-phase-9.md) on 2026-09-04.** That card is 11 tasks / ~24
requirements / 10–13 h across four Critical Paths, two of them `Full gates? yes`. Built in one pass it enters a
four-gate round as the largest single diff since M2b-1 — the exact shape the master plan split slice 10 to avoid
(F-6). 9a and 9b each end in a path a creator can walk and each takes its own gate round.

**9a is not a subset chosen for convenience.** It is the half that is true whether or not a proposal is ever
constructed: *a result is logged honestly, and compared honestly against the creator's own past.* 9b is the half
that turns a comparison into a proposal a brain can absorb.

## A creator can…

**Log a result against one of their own generations — honestly labelled, per-lever, with its confounders — and see
it compared to the median of their own eligible past results, or read exactly which population is short and by how
many.**

## Scope

| Phase-9 requirement | 9a | 9b | Why |
|---|---|---|---|
| R1 `packages/brain` created | **partial — created here** | charter widened | See the R-44 note below |
| R2 sole proposal construction site / scan flips to enforcement | — | ✅ | No proposal constructor exists in 9a; flipping a scan with nothing to find is pre-registration wearing the word enforcement |
| R3 import boundary + deny fixture | ✅ | — | The package exists in 9a, so its boundary does |
| R4 `tech-spec.md:36` re-point | — | ✅ | The re-point's *reason* is R-44's proposal-site argument; it lands with the proposals |
| R5 `results` table | ✅ | — | |
| R6–R9 entry: evidence states, confounders, per-1k metric, per-lever display | ✅ | — | |
| R10–R13 cohort, baseline, absence, paid/organic | ✅ | — | The comparison is 9a's creator-visible payoff |
| R14–R16 proposals, evidence strength, minimum-n at the proposal site | — | ✅ | |
| R15 minimum-n **constant** | ✅ | reused | Its first reader is 9a's comparison; one constant, one reader, defined once |
| R17–R19c proposal lifecycle, `performance_meta`, `result_summary`, accept/reject, feedback proposals | — | ✅ | |
| R19d brain-as-asset · R19e `/usage` days-to-empty | — | ✅ | R19e's edit to `/usage` is what fires **`8c-W2`**, which closes there |
| R20–R22 honesty scans | **R20 here** | R21/R22 there | R20 binds the comparison screen 9a ships; R22's `learn`/`improv` question only arises on 9b's copy |

### The R-44 deviation, stated rather than absorbed

R-44 says `packages/brain` is created "for **proposal construction only**". 9a creates it holding the **cohort and
comparison builder** instead, because:

- The master plan's own rule is *"no package ships without a caller in the same slice"* — a `packages/brain` with
  no proposals in 9a is inventory, the M2b-1 shape the plan exists to stop.
- Phase 9 R10 requires **one typed cohort builder shared by result and feedback proposal construction**. Putting it
  in `@respin/db` for 9a and moving it in 9b is the churn R-44 itself argues against.
- **R-44's stated trigger is untouched**: it inverts on "any second writer of brain-document *content* outside
  `@respin/db`". 9a writes no brain content. Storage stays where it is.

The charter therefore reads **"cohort construction and proposal construction"**. This gets its own `decisions.md`
entry at the 9a close — not a silent reinterpretation of R-44.

---

## THE PINNED CONTRACT

> **Read this before writing a line.** CLAUDE.md's 2026-09-04 ledger records slice 8c's most expensive defect:
> `packages/modes` chose four bounds independently of `packages/trends`, which *produces* them, all four were
> stricter than the producer's contract, and **both suites built their own fixtures and never met the other's
> data** — so a spin of a real autopsy was structurally impossible and no test could see it. Everything below is
> pinned so that cannot recur. **A builder who needs to deviate says so and stops; it does not choose locally.**

### C1 — vocabularies (closed sets, `as const`, exported from `@respin/db`)

```ts
export const RESULT_EVIDENCE_STATES = [
  "unquantified",              // stored, never enters a numerical cohort (R16)
  "quantified_self_reported",  // creator typed the numbers. NOT verified.
  "connector_verified",        // requires immutable connector provenance; v1 writes NONE
] as const;

export const RESULT_AUDIENCE_CLASSES = ["organic", "paid"] as const; // never pooled (R13)

export const RESULT_LEVERS = ["reach", "conversion"] as const;       // never collapsed (R9)

// Structured flags, never prose — the closed-code discipline `brain-reason.ts`
// established and states its reason for. A caller supplies codes from this set
// and nothing else.
export const RESULT_CONFOUNDER_CODES = [
  "topic_overlap",
  "posting_time_unknown",
  "account_growth",
  "spillover_from_other_post",
  "external_promotion",
  "platform_change",
] as const;
```

`connector_verified` is in the vocabulary and **unreachable in v1**, deliberately: R6 says it requires immutable
connector/source/event provenance. Enforce that structurally — three nullable connector columns and a CHECK making
`evidence_state = 'connector_verified'` true **iff** all three are non-null — so v1's inability to assign it is a
database property, not a convention. Do **not** ship a `CHECK evidence_state <> 'connector_verified'`; that would
need lifting by migration the day a connector lands.

### C2 — the `results` row (field names are the contract; column mechanics are the schema builder's)

```ts
type ResultRow = {
  id: string;
  profileId: string;
  workspaceId: string;

  /** Optional. When present, same-tenant composite FK; caller scope is never trusted (R5). */
  generationId: string | null;

  // ---- the five comparability predicates (phase-9 question 1) ----
  platform: string;
  audienceClass: (typeof RESULT_AUDIENCE_CLASSES)[number];
  /** The declared north-star metric's stable key. NOT `strategy.metric.key` — see amendment 7. */
  metricKey: string;
  /** The brain_docs row id of the STRATEGY VERSION that declared it. See C3. */
  metricDeclaredByDocId: string;
  observedFrom: Date;
  observedTo: Date;

  /**
   * The proposal cohort's sixth predicate. Normalized; see C4.
   * AMENDMENT 4 — NULLABLE, and null EXACTLY when `generationId` is null.
   */
  treatmentKey: string | null;

  evidenceState: (typeof RESULT_EVIDENCE_STATES)[number];

  // ---- the two levers, stored apart and never summed (R9) ----
  reachValue: string | null;         // numeric as string, the drizzle numeric convention
  reachDenominator: string | null;
  conversionValue: string | null;
  conversionDenominator: string | null;

  confounders: (typeof RESULT_CONFOUNDER_CODES)[number][];  // jsonb, NOT NULL, default '[]'
  note: string | null;               // creator's own words; nothing branches on it (the
                                     // `generation_feedback.note` precedent, verbatim)

  connectorSource: string | null;    // the three that gate `connector_verified`
  connectorEventId: string | null;
  connectorObservedAt: Date | null;

  createdAt: Date;
};
```

**Invariants the database enforces, not the application:**

- `evidence_state = 'unquantified'` ⇒ all four lever columns NULL.
- `evidence_state <> 'unquantified'` ⇒ **at least one** lever pair fully present (value **and** denominator).
- Any denominator present ⇒ `> 0` **and not `NaN`** — see amendment 5. A per-1k over a zero denominator is
  not a small number, it is undefined.
- `observed_to > observed_from`.
- `evidence_state = 'connector_verified'` **iff** all three connector columns non-null.
- `note` is `NULL OR ~ '[^[:space:]]'` — the exact CHECK `generation_feedback_note_says_something` uses.

### C3 — the declared metric, pointed at not copied

Store **`metricKey` + `metricDeclaredByDocId`**. Read `unit` and `direction` from that `brain_docs` version at
comparison time. Do **not** copy unit/direction onto the result row.

The reason is the codebase's own, from `generations.brainActivationId`'s docblock: copying creates *"a second
answer to which versions did this run under, and the two could disagree with nothing to adjudicate"*. `brain_docs`
versions are append-only, so the pointer cannot move under the row.

**Tenancy on that pointer.** Prefer a same-tenant composite FK `(metric_declared_by_doc_id, profile_id,
workspace_id) → brain_docs(id, profile_id, workspace_id)`. `brain_docs` today has
`brain_docs_profile_kind_version_uq` on `(profile_id, kind, version)` and **not** the unique the FK needs — so
**add `UNIQUE (id, profile_id, workspace_id)` to `brain_docs` in this migration**. It is additive, it costs one
index, and it converts a recorded limitation into a database-enforced property.

Only if that proves impossible: follow `brainActivationId`'s precedent exactly — **no** FK (never a bare FK to
`id` alone, which "would let this row name a snapshot belonging to another profile: worse than none, because it
would look like tenancy"), tenancy proved by the writer through scoped accessors, and **the limit written into the
column's docblock**, not implied.

### C4 — `treatmentKey`

A **server-computed, normalized, stable** string. Never creator-typed and never free text. Composed from, in a
fixed order, the parts that are present:

```
frameworkId@version | modeName | brainActivationId | metricKey
```

The generation is the source of every part (`generations.mode`, `.frameworkVersions`, `.brainActivationId`).
**A result with no `generationId` therefore has no derivable treatment key** — 9a stores such a result and it is
eligible for the *baseline*, never for a treatment cohort. Say this on screen; do not fabricate a key.

Expose one exported function that computes it. One function, one reader — the R15 discipline applied a field early.

### C5 — the comparison, `@respin/brain`'s only export surface in 9a

```ts
export const MIN_COMPARABLE_RESULTS = 3;   // R15: ONE named constant, ONE reader.
                                           // There is no minimum-n literal anywhere in the repo today —
                                           // not a wrong one, none — so there is nothing to be
                                           // inconsistent with. Every comparison site reads THIS.

export type ComparisonStratum = {
  profileId: string;
  platform: string;
  audienceClass: AudienceClass;
  metricKey: string;
  /** AMENDMENT 1 (see below) — predicate 2 is the metric VERSION, not the key. */
  metricDeclaredByDocId: string;
  observedFrom: Date;
  observedTo: Date;
};

export type Population =
  | { state: "present"; n: number; medianPer1k: number; resultIds: string[] }
  | { state: "short"; n: number; needed: number; resultIds: string[] }   // needed = MIN - n
  | { state: "none"; n: 0; needed: number; resultIds: readonly string[] }; // AMENDMENT 3

export type LeverComparison = {
  lever: "reach" | "conversion";
  treatment: Population;
  baseline: Population;
  /**
   * The signed difference `treatment - baseline`, NOT direction-normalized —
   * except that a TIE is reported as exactly `0`. See amendments 2 and 6.
   * null unless BOTH populations are `present`; `0` means a complete
   * comparison that came out level, which is a different fact from `null`.
   */
  effectPer1k: number | null;
  /** Carried so a reader can interpret the sign. Never itself an interpretation. */
  direction: "higher_is_better" | "lower_is_better";
  /**
   * THE ONLY SITE THAT DECIDES "BETTER" (amendment 2). Computed from
   * `effectPer1k` and `direction` together. 9a's screen renders this word and
   * never re-derives it from the sign; 9b's R14 "direction-normalized" reading
   * is THIS field, so the product never grows a second answer to "was it better".
   * null exactly when `effectPer1k` is null.
   */
  improvement: "better" | "worse" | "unchanged" | null;
  unit: string;
  confoundersPresent: ConfounderCode[];
};

/** ONE builder, shared by 9a's screen and 9b's proposal construction (R10). */
export function buildLeverComparisons(args: {
  stratum: ComparisonStratum;
  treatmentKey: string;
  results: readonly ResultRow[];   // ALREADY profile-scoped by the caller
  metricDirection: MetricDirection;
  metricUnit: string;
}): LeverComparison[];
```

**Rules the builder must implement and a test must pin, each separately:**

1. **Median, never mean.** *"A mean over a handful of results is moved by one outlier, and one outlier is exactly
   what a creator is trying to find."*
2. **Per 1k** = `value / denominator * 1000`, computed against the declared metric version (C3).
3. **The baseline excludes the treatment cohort AND every result carrying the treatment key.** Both exclusions,
   separately asserted — an implementation can satisfy the first and silently fail the second.
4. **`unquantified` never enters a numerical cohort** (R16), on either side.
5. **Paid and organic never pool** (R13) — the stratum carries `audienceClass`, so pooling is not expressible;
   the test asserts a mixed input yields two comparisons or none, never one merged.
6. **Absent is never zero** (R12). Below `MIN_COMPARABLE_RESULTS` the population is `short`/`none` and
   `effectPer1k` is `null`. **No caller may render `null` or `short` as a bar at zero** — this is the three-state
   shape `spendVisibility` already uses on `/usage`; read it before inventing a fourth.
7. **Reach and conversion are separate `LeverComparison` values and are never summed** (R9). There is no code path
   producing one score, on any screen, including a summary card.

### C6 — what 9a must NOT do

- No `packages/brain` proposal construction, and no flip of `tests/feedback-readers.test.ts` to enforcement.
- No `result_summary` input class and no migration touching `onboarding_inputs`' enum.
- No change to `WRITABLE_BRAIN_KINDS`, `performanceMetaContent`, or `KindNotYetWritableError`'s copy — R19's
  stale-copy fix belongs with the slice that makes the copy false.
- No edit to `/usage` (that fires `8c-W2`, which 9b closes).
- No brain write of any kind.

### C7 — registration is a requirement, not a courtesy

A new table registers in **three** instruments. Slice 6's R10 made this a requirement because *"an unregistered
table produces a green suite and an unpoliced write surface, and the green suite is the dangerous half."*

1. `packages/db/src/creator-data-registry.ts` — export **and** deletion decision, with reasons. Predicate is
   *"every table any migration creates"*; `tests/creator-data-registry.test.ts` enforces it.
2. `tests/table-writers.test.ts`'s `TABLES` map — **manual, and nothing fails if forgotten.**
3. `packages/db/src/export.ts` — the REQ-A04 export.

---

## Tasks and owners

| # | Task | Owner | Requirements |
|---|---|---|---|
| A1 | `results-schema.ts`, migration, all three C7 registrations, the `brain_docs` unique of C3 | **builder A** | R5, R6, R7, C1–C3, C7 |
| A2 | `treatmentKeyFor(generation)` + its scoped accessors on `with-workspace.ts` | **builder A** | C4, R5 |
| B1 | `packages/brain` package, `tsconfig`/`package.json`/workspace wiring | **builder B** | R1 |
| B2 | Import boundary: `eslint.config.mjs` negation catch-all + deny fixture in `tests/import-boundary.test.ts` | **builder B** | R3 |
| B3 | `buildLeverComparisons` + `MIN_COMPARABLE_RESULTS` + the seven C5 rules, each separately pinned | **builder B** | R10–R13, R15, C5 |
| B4 | The import-boundary suite's ESLint warm-up (see *Known flake* below) | **builder B** | — |
| C1 | `/results` route: `routes.ts`, `middleware.ts`, `nav.tsx`, gate-completeness | **builder C** | R5 |
| C2 | Entry form: evidence states, confounder flags, per-lever inputs, the honest labels | **builder C** | R6–R9 |
| C3 | Comparison view: both levers apart, both id sets inspectable, absence states, `meter.tsx`'s `baseline` tick | **builder C** | R9, R11, R12, C5.6 |
| C4 | R20 honesty: no comparison rendered as a prediction or a guarantee | **builder C** | R20 |

## Verification (9a's share of phase 9's list)

1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **A creator logs a result and sees a comparison or a named absence**, in a browser
3. [ ] A result without numbers → `unquantified`, stored, excluded from cohorts; manual numbers →
       `quantified_self_reported`, **never** `connector_verified` (R6)
4. [ ] Two treatment results + one unquantified → no comparison; three treatment + two baseline → named absence
       naming which population is short and by how many (R11/R12/R16)
5. [ ] Mix paid/organic, platforms, or metric versions → no merged comparison (R10/R13)
6. [ ] A treatment result offered to the baseline query → exclusion test fails; the rendered baseline id set never
       overlaps the cohort **and** never carries the treatment key (R11 — two assertions, not one)
7. [ ] One result → no baseline, no effect, a named absence, **no bar at zero** (R12)
8. [ ] Every result view shows reach and conversion separately (R9)
9. [ ] Cross-workspace generation/result ids refuse through composite FKs (R5)
10. [ ] `next build` compiles — the integration gate slice 8c proved catches what no unit suite sees

## Mutations to plant (9a's share; name the population before reporting N of N)

| # | Mutation | Should redden |
|---|---|---|
| M1 | `MIN_COMPARABLE_RESULTS` lowered to 1 | Verification 4, with n = 1 |
| M2 | `unquantified` rows admitted to a numerical cohort | Verification 3/4 |
| M3 | Paid/organic predicate dropped from the stratum | Verification 5 |
| M4 | Platform predicate dropped | Verification 5 |
| M5 | Baseline median → mean | An outlier fixture |
| M6 | `short`/`none` population renders 0 | Verification 7 |
| M8 | Reach and conversion summed into one score | Verification 8 |
| M10 | Treatment-cohort rows included in the baseline | Verification 6, first assertion |
| M10b | Treatment-**key** rows included in the baseline (cohort exclusion left intact) | Verification 6, second assertion |
| M15 | The `connector_verified` CHECK dropped | A direct insert asserting the database refuses it |
| M16 | A denominator of 0 accepted | The per-1k undefined-denominator test |

**What this matrix cannot reach, stated before any result is reported:** median difference at n = 3 is
*descriptive*, not statistical proof — a test can enforce the definition and cannot make the cohort
representative, so that limitation stays visible on screen. **R20 is an absence**: nothing fails if a screen
quietly starts implying a comparison predicts the future. Per CLAUDE.md's 2026-08-26 lesson, **someone other than
the author plants at least three of these**, against cohort construction and lever separation.

## Known flake, carried in rather than discovered again

`tests/import-boundary.test.ts > rejects an app/ import from inside packages/` **timed out at 60 s** in the
2026-09-04 full-suite run (149 files, `TEST_DATABASE_URL` live) and **passed in 802 ms in isolation**. The cause is
ESLint's flat-config + TS-parser load starving under 149-file contention on the file's first `lintText`, not a
regression. Builder B adds cases to this exact file, which makes it slower.

**The fix is a warm-up, not a loosened assertion:** pay the config load once in a `beforeAll` carrying its own
generous timeout, so each `it`'s timeout measures lint work rather than module initialisation. **No assertion
changes.** A builder that finds itself relaxing an expectation to make this green has left the fix and entered the
class CLAUDE.md's 2026-07-30 lesson names.

## Done when

- [ ] Every 9a requirement above met, every verification step passes with cited evidence
- [ ] The "A creator can…" line walked in a browser
- [ ] Gates: **learning honesty** (this is the path 9a exists for) · **brain tenancy** (Full) · **billing** (Full)
      · **spin compliance** — announced and costed before they run
- [ ] `decisions.md` carries: the 9a/9b split and its F-6 reason; the R-44 charter widening; the five comparison
      predicates and the treatment key; the treatment-excluding median baseline; `connector_verified`'s structural
      unreachability; the `brain_docs` unique added for C3
- [ ] **9b's residual list is written**, so nothing 9a deferred is discoverable only by reading this card

---

## Contract amendments (2026-09-04, after builder B reported)

**The contract was wrong in three places and is corrected here rather than in a builder's head.** All three were
found because builder B was instructed to *stop and report rather than choose locally*, and did. That instruction
is the contract's only real defence; a builder who quietly picks one reading produces exactly slice 8c's
`packages/modes` defect, where a stricter local choice made a real workflow structurally impossible and no test
could see it.

**Amendment 1 — `ComparisonStratum` could not express comparability predicate 2.** Phase 9's question 1 names
*"Same declared north-star metric version — REQ-B03. Historical generations keep the metric they actually used"*,
and verification step 5 requires that mixed metric versions produce no merged comparison. C5's stratum carried
`metricKey` alone, so two strategy versions declaring the same key would have pooled — a stronger claim than the
data supports, in the one module whose job is not making stronger claims than the data supports. `metricKey` is
kept **as well**: the key is the stable identity across versions and is what a treatment key composes.

**Amendment 2 — `effectPer1k`'s two sentences contradicted each other.** C5 said *"signed by the declared metric's
direction, so 'better' is never inferred from sign alone"*, which cannot both be true; R14 (9b) says the effect is
*"direction-normalized"*. Builder B implemented the plain difference and refused to guess, which was the right
refusal: normalising makes the sign mean "better", which is precisely what the `direction` field exists to
prevent, and it would have inverted the sign for every `lower_is_better` metric.

The resolution is neither reading alone. `effectPer1k` is the **plain signed delta**; a new `improvement` field is
**the one site that decides "better"**, computed from the delta and the direction together. 9a's screen renders
that word and never re-derives it from the sign, and 9b's R14 normalized reading *is* that field. The reason it is
one field and not two computations is the codebase's own, from `generations.brainActivationId`'s docblock:
duplicating a derivation creates *"a second answer … and the two could disagree with nothing to adjudicate"*.

**Amendment 3 — `Population`'s `none` variant typed `resultIds: []`**, which narrows the union member's element
type to `never` and makes `resultIds.includes(id)` fail to compile on every caller. A type error in the contract,
paid for by all three builders.

### Accepted deviations (not amendments — recorded so they are not rediscovered as defects)

- **`tests/no-scraping.test.ts`** was edited by builder B outside its named file list. Its `PACKAGES` registry is
  pinned equal to the package directory, so creating `packages/brain` turned it red and no other builder could
  fix it. That is the registration cost of B1, and flagging it beat burying it.
- **M10 / M10b survive individually; M10c (both exclusions removed) reddens 15 tests.** In 9a the treatment cohort
  *is* the set of key-carriers, so the two exclusions select the same rows — provably redundant here, **not** a
  test gap, and they become independent in 9b when join rows define membership. Both exclusions are written
  anyway. This is measured by running it, not argued: the survival is recorded rather than reported as 26/26.
- **`ResultRow` is not assignable to the comparison's input type** — `confounders` arrives as `unknown` because the
  drizzle `jsonb` column carries no `$type<...>()`. The fix belongs on the column, not on a widened consumer:
  widening would let the comparison read a vocabulary nobody owns.

**Amendment 4 — `treatmentKey` was pinned NOT NULL by C2 and un-derivable by C4, and both could not hold.**
C2 typed it `string`; C4 said a result with no `generationId` "has no derivable treatment key" and is stored
anyway, "do not fabricate a key". A NOT NULL column forces `''` or a sentinel, and **three generation-less results
sharing `''` form a cohort of three unrelated posts** — the exact fabrication C4 forbids, arriving through the
column that was supposed to prevent it, in the module whose minimum-n rule exists because *"three unrelated posts
cannot warrant a rule"*.

The column is **nullable**, with `results_treatment_key_iff_generation` — an equality in both directions — making
"a key exists exactly when a generation does" a database property rather than an application convention.

**Both builders reached this independently, from opposite ends**, before either saw the other's work: builder A
from the column, builder B from `ComparisonResultInput.treatmentKey: string | null`. Convergence from two
directions on a contract defect is the strongest signal the contract mechanism produces, and it is recorded
because a later reader will otherwise see only that the shipped code disagrees with the pinned text.

### Open defect carried into the integration gate — the truncated population

**Builder A's declared least-confident line, and it is a real defect in 9a's core promise, not a footnote.**
`ProfileAccessors.results` clamps at `LEDGER_PAGE_MAX` (200), so a creator past 200 logged results gets a cohort
and a baseline computed over a **silently truncated** population: the screen says *"n = 3, 2 more needed"* about
their most recent page, not about their history, and **nothing fails**.

This is CLAUDE.md's 2026-08-29 lesson in its exact shape — a derived guard is only as wide as its population —
and it lands on the one screen whose job is to be honest about how much evidence there is. A comparison computed
over a silently truncated population is not a weaker claim; it is a false one.

**Not fixable by raising the cap** (an invented specific that moves the wall), and **not fixable by refusing**
(a creator with 250 results can do nothing about it, so a refusal is the outage CLAUDE.md's 2026-07-30 lesson
names). The fix has two halves, one per owner: the accessor filters by the stratum's predicates **in SQL** so
truncation is rare rather than routine, **and** reports whether it truncated; the comparison surfaces truncation
as its own named population state, so an incomplete population is never rendered as a complete one. Owner:
integration gate, before any reviewer runs.

**Amendment 5 — a stated invariant was false, and it was in the sentence that introduces them.**
C2's invariants sit under the heading *"Invariants the database enforces, not the application"*. One of
them was not enforced by the database at all: `results_denominators_positive` writes `denominator > 0`,
and in Postgres **`'NaN'::numeric > 0` is true**. So a NaN denominator passed, and the per-1k it produces
is NaN — on the screen whose central rule is that an absence is never rendered as a number.

**It was found by a builder checking a claim instead of writing the plausible sentence about it.** The
claim under test was mine: that several of `ComparisonInputError`'s throw sites are unreachable *because
the CHECK constraints enforce those invariants*. Measured against the running Postgres 17:

```sql
select ('NaN'::numeric > 0), ('NaN'::numeric is null), ('NaN'::numeric = 'NaN'::numeric);
 t | f | t
```

The third column is why the obvious fix does not work: Postgres `numeric` NaN **equals itself**, unlike
float, so the usual `x = x` idiom detects nothing. Closed by migration 0031.

**What this says about the contract, and it is the uncomfortable half.** Amendments 1-4 were contradictions
*between* pinned statements, findable by reading. This one was a pinned statement that was simply **untrue
about the world**, and no amount of reading the contract against itself would have surfaced it — only
running the database did. A written contract makes disagreements findable; it does nothing whatever to
make its own claims true. Both halves of that are now on the record.

**Amendment 6 — a tie reports `0`, and the builder was right to refuse the fix the orchestrator proposed.**
Amendment 2 made `improvement` the one site that decides "better". The screen then contradicted it anyway:
`effectSentence` derived its *side* from the raw sign while its *reading* came from `improvement`, so a
ULP-level delta rendered *"the median reach was 5.68434e-14 follows per 1,000 **above** the median …, **which
is neither side of it**"* — a self-contradicting sentence, found by the learning-honesty gate.

**The orchestrator proposed nulling `effectPer1k` on a tie. The builder refused, and the refusal is the
decision.** `null` means *there is no comparison* — a population is `short`, `none` or `truncated`. A tie is
the **opposite**: a complete, valid comparison over two present populations that came out level. Collapsing
them would make the screen render an absence sentence for a real result, and would break the pinned
biconditional that `improvement` is null exactly when `effectPer1k` is — R12 applied to a word.

**So a tie reports `0`.** A tie *is* zero; exact ties already returned exactly `0`; and the entire meaning of
`IMPROVEMENT_ULP_BUDGET` is that below it the two medians are **not distinguishable by the arithmetic that
produced them**, which makes `5.68e-14` the overclaim and `0` the honest number.

**Why this is structural rather than a second rule.** `Math.sign(0)` is `0`, so a side derived from the sign
naturally becomes "neither", and the number displayed is `0` — **the verdict and the number agree by
construction** instead of by a screen-side rule someone has to remember. That is the property amendment 2 was
reaching for and did not achieve. It is still one bound and one derivation site: `improvement` is computed
first, and `effectPer1k` follows from it.

**Two mutations pin the argument itself, not just the behaviour**: reporting `null` for a tie reddens (the
collapse argued against above), and zeroing on smallness rather than on the verdict reddens (an absolute
threshold cannot produce "one delta, two magnitudes, two answers", which a relative bound does).

**And the screen-side defect this closed had escaped the suite.** Builder C planted a screen-side
`Math.abs(delta) < 1e-12` in place of the `improvement` check and **all 49 of its tests passed** — the exact
second derivation amendment 2 exists to forbid — because no fixture held a *small* delta with a *non-tie*
verdict. That case exists now. It is the third time on that surface that a planted violation found what the
suite could not.

**Amendment 7 — the contract defined the field the BLOCK was about, and kept defining it wrongly after the fix.**
C2 said `metricKey` is *"the declared north-star metric's stable key — `strategy.metric.key`"*. **There is no
such stored value and there never was**: `metric.key` is `serverOwned`, and `parseBrainContent` strips every
server-owned position in the single funnel before `writeBrainDoc` stores the result. That sentence is what the
whole slice was built against, and it produced the round-1 **BLOCK** — `/results` rendering `no_declared_metric`
for every creator and `recordResult` refusing every submission.

**The key is `metricKeyFromLabel(metric.label)`**, derived at read time through one shared function, with a
stored key ignored even when present. Storing it instead was rejected because `serverOwned` *means* stripped:
keeping one would need a new concept in the funnel — "server-owned but stored" — and every consumer of that
marker re-reasoned.

**Recorded late, and the lateness is the finding.** The plan carried six amendments for smaller contradictions —
a tuple type, a NaN comparison — while the one sentence that broke the entire slice went uncorrected through a
fix pass and into a second review round, in the document the manifest sends every reader to first and that 9b
will build proposals from. The tenancy reviewer caught it. **A contract that amends its small errors and not its
largest one is worse than one that amends nothing, because the amendment list is what a reader trusts.**

**Two consequences of the fix that belong here rather than only in a docblock:**

- **The slug rule is now a stored-data format.** `metricKeyFromLabel`'s output persists in `results.metric_key`
  and inside every `results.treatment_key`. Changing it — unicode handling, a different separator, dropping the
  fallback — makes every existing row disagree with its re-derivation, and because `results` is append-only with
  no delete path, those creators' comparisons are **permanently** refused. Changing that function is a data
  migration, not a tidy-up.
- **Metric identity is a pure function of a creator-typed label, and the collision is broader than first stated.**
  The slug strips everything outside `[a-z0-9]` and falls back to the literal `"metric"`, so **every creator
  writing a label in a non-Latin script shares one key**. It is not reachable today — verified: `treatmentKeyFor`
  always emits the per-profile `brainActivationId`, every population is caged twice, and the duplicate index keys
  on a same-tenant `generation_id` — so no cross-profile surface exists for a collision to reach. **The trigger is
  the first reader that treats `metricKey` as an identity across profiles** (a library aggregate, a benchmark, any
  cross-creator count); such a reader must key on `(profile_id, metric_key)`, never on `metric_key`.
