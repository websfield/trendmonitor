# Respin — open-item disposition (2026-08-27)

Every open item from every register, with exactly one home. The source registers are
corrected by appending, never by editing their history.

**Verify-first.** No verdict here is carried on a register's word. Every `OPEN-CONFIRMED`
cites a file and line opened this session; every `ALREADY-CLOSED` cites the line that closes it.

## Summary

| Source | Items |
|---|---|
| `respin-m2b1-block-register.md` §A | 19 (B-1…B-11, G-10…G-17) |
| `respin-m2b1-brain-surface-plan.md` task table | 31 (26 TODO + 5 PART) |
| `decisions.md` R-30 binding constraints | 12 (R-30.1…R-30.12) |
| `todos.md` T-2…T-12 | 11 |
| in-code `TODO`/`FIXME` under `respin/` | 0 — the three grep hits are prose about a task that *was* TODO |
| **Total reconciled** | **73** |

- OPEN-CONFIRMED **50** · ALREADY-CLOSED **12** · UNVERIFIED **3** · NOT-RESPIN **8** — 50 + 12 + 3 + 8 = **73**
- Homed in a slice **50** · Deferred with an owner **3** · Deferred to Cutdown **8** · Already closed **12** — 50 + 3 + 8 + 12 = **73**

**This register also carries seven rows that came from outside those four sources** — free-tier
minting, REQ-I03, the `frameworks`/`packages/brain` homes, the background runner, the retention
receiver, REQ-G05 margin aggregation and the REQ-A04 deletion executor. They are coverage gaps found
by reading the build plan and the codebase review against the slice list (plan review F-5), not
register items, and they are excluded from the 73.

An `UNVERIFIED` item still gets a slice home; what it also gets is a named verification trigger,
because "we could not tell" is a reason to look again, not a reason to stop tracking it.

---

## Slice-blocking items

`Reachable when` is the user-visible event that makes the item exploitable or visible.
An item is homed in the **first slice that makes it reachable**, not the topically nearest one.

### Slice 1 — Profile + intake

| ID | Claim (one clause) | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| R-30.2 | `createProfile` belongs in a layer that can see config **and** billing state, never `packages/db` | `respin/packages/db/package.json` has neither `@respin/config` nor `@respin/credits`; `@respin/credits` depends on `@respin/db` (`packages/credits/package.json:20`) | slice 1's first line of code | slice 1 as written does not compile, or it ships a second tier authority |
| R-30.3 | Downgrade semantics undecided — `creator_profiles` needs a `state` column or a recorded reason it never will | `packages/db/src/brain-schema.ts:87-110` — no `state` column; no migration mentions one | a Studio workspace with 5 profiles downgrades; **and** slice 2's R17 already reads the column | slice 2 R17 is unbuildable; a second migration on a table M2a "landed once" |
| R-30.11 | Where the `ProfileScope` mint is exposed is an undecided seam, and is where `trustProfileId` reappears | `packages/db/src/app-server.ts:24-27` — `respinDb` exposes bootstrap + `withWorkspace` only | slice 1's facade | a mint reachable from `app/**` voids the M2a cage |
| task 24 | Widen the AC-13 scan predicate to `ProfileScope\|WorkspaceScope` across every `packages/*/src` | `respin/tests/profile-cage.test.ts` — UNVERIFIED which predicate the scan uses; R-30's own Revisit line says it fails deliberately at the first new scope-taking entry | slice 1 adds `createProfile`, the first such entry | a new write capability ships without `assertScoped` |
| task 25 | eslint has no negation-form catch-all, so a **new** `@respin/*` package is importable from `app/**` by default | `respin/eslint.config.mjs:122-170` — `paths` names `@respin/db`/`auth`/`credits`/`config` one by one; no `["@respin/*", "!@respin/db", …]` group | slice 2 creates `@respin/llm`; slices 6/8/9 create three more | every later package lands outside the import boundary silently |
| task 26 | App-facing copy + `allowImportNames` for every new `packages/db` error | `app/(product)/billing-errors.ts` maps 38 classes; `ProfileCapError` does not exist yet | slice 1 adds the first new error | a cap refusal renders "Something went wrong" |
| task 46 | Tighten the AC-13 scan's forward rule to argument identity | `respin/tests/profile-cage.test.ts:422` — "worth tightening the moment…"; the moment is slice 1 | slice 1 widens the scan's roots | the scan's own documented soundness limit expires unnoticed |

### Slice 2a — One metered model call

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| G-14 | No test races two `writeBrainDoc` calls; deleting the advisory lock leaves the suite green | `packages/db/tests/brain-concurrency.docker.test.ts` covers the partial unique index and a bigint round-trip only; no test in `packages/db/tests` mentions an advisory lock | slice 2 takes both locks in one transaction | the quote-budget serialisation is unproven on the first priced write |
| G-17 | Two advisory-lock keys, no recorded ordering | no lock-order sentence in `decisions.md`; brain key at `with-workspace.ts:968`, workspace key at `packages/credits/src/clock.ts:73-75` | slice 2 takes both in one transaction | deadlock on the product's first debit |
| B-10 | Pause reads take no workspace lock while every ledger writer holds one | `packages/db/src/pause.ts:35-50` — plain `select`, no lock | `creditCosts` for the operation stops being 0 | a pause committing concurrently is missed; four refusal messages assert "no credits were spent" on that basis |
| B-4 | Migration 0012 sets `source_evidence NOT NULL` plus a non-empty CHECK with no backfill and no `NOT VALID`/`VALIDATE` split | `packages/db/migrations/0012_dashing_killmonger.sql:1,10` | the first migrate run against a database holding a pre-0012 `brain_docs` row | the deploy aborts mid-migration; R-32 records "applied and clean" without naming the precondition |
| R-30.1 | Pause gate at operation entry, before the model call | covered by slice 2 R8 | slice 2 | — |
| R-30.4 | One debit per `attempt_id`, counted DISTINCT | covered by slice 2 R12 | slice 2 | — |
| R-30.8 | `resolved_tier`/`cost_state` written by one authority, not the caller | covered by slice 2 R15 | slice 2 | — |
| task 10 | Whether the pause AC is parameterised over `ProfileWriteCapabilities` is UNVERIFIED — the type is imported at `packages/db/tests/profile-scope.test.ts:52`, which is not proof the AC iterates it | see left | slice 2 adds `runInference` to the capability set | a new capability ships with no pause coverage and the suite stays green |
| task 33 | The ICU probe fires lazily at first segmentation, not at module load | `packages/db/src/echo.ts:181-186` — `getSegmenter()` throws on call | slice 2 runs the first real inference in a deployed process | a runtime without full ICU is discovered by a creator, not by boot |

### Slice 2b — The spend record that outlives deletion

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| R-30.5 | `workspace_spend_monthly`'s first writer must settle pseudonymisation | `packages/db/src/creator-data-registry.ts:112` — "`workspace_id` is NOT pseudonymised today … becomes real the moment M2b adds the first writer" | slice 2 writes the rollup | after a REQ-A04 deletion a per-workspace spend series survives with a resolvable identifier |
| R-30.9 | The rollup increment needs an idempotency key, and a reconciliation query written **while `model_usage` still exists** | `packages/db/src/onboarding-schema.ts:189` — "the margin history that must OUTLIVE a REQ-A04 deletion"; no writer, no key | slice 2 writes the rollup | a retried writer double-counts spend permanently and undetectably |

**CLOSED 2026-08-29 (appended, not edited above — this register corrects by appending).** R-30.5: settled by
`pseudonymiseWorkspaceSpend` (`packages/db/src/spend-rollup.ts`) plus the registry answer
(`creator-data-registry.ts`) and its deletion-executor tripwire (`tests/retention-pseudonymisation.test.ts`,
R17). R-30.9: settled by same-transaction composition (no separate idempotency key needed — see
`decisions.md` R-57) and `reconcileSpend`'s three-class query, written while `model_usage` still exists
(R12). The R-41 reconciliation debt (slice 2a's deferred-findings table — a `model_usage` row whose debit
never landed) is closed the same way: `reconcileSpend`'s `unbilledAttempts` (R11), with one documented
imprecision (a legitimate free truncated rebuild can appear as a false positive — see `spend-rollup.ts`'s
own docblock and the slice-2b ledger entry). **Full-gates billing/tenancy review of this closure completed
2026-08-30 as slice 2b-c**, which also closed the R4 (retained `unknown_call_count`) and R4a (reconciliation
delta writer) gaps a 2026-08-29 plan audit found unbuilt against this card's own corrected scope, and the
`/admin/margin` -> `/admin/model-spend` rename (R14/R15). Both gates PASS at Ready. Report card:
`respin-finish-slice-2b-c-card.md`.

### Slice 3 — Infer → confirm → activate

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| B-1 | The `editor` authority decision is unrecorded, and the code has already taken it | `with-workspace.ts:816-818` — `assertMayDecide` refuses `viewer` only, so an editor confirms and lands in `confirmed_by`; `decisions.md` contains the word "editor" zero times | slice 3 ships the confirm screen | REQ-B02 says *the creator* confirms; the code says any non-viewer |
| B-3 | The confirmation sha pins `content` only, not `(content, source_evidence)` | `with-workspace.ts:1183` — `confirmedContentSha256: contentSha256(doc.content)` | slice 3 | AC-27 names the pair; evidence can drift under a confirmation |
| B-5 | `confirmed_fields`/`evidence_counts` are nullable with no default, and the `active` CHECK omits `activated_at` | `migrations/0012_dashing_killmonger.sql:6,7,9` | slice 3 activates the first document | the plan and the code disagree, and nobody knows which is the contract |
| B-6 | `brain_kind_not_writable` copy promises a results surface that does not exist, and is silent on n ≥ 3 | `app/(product)/billing-errors.ts:351` | slice 3 shows the first brain-write refusal in a browser | the product promises a capability six slices away |
| R-30.6 | REQ-B02's per-field creator confirmation is owed | server half at `with-workspace.ts:1108-1200`; no screen — `app/(product)/` has no brain route | slice 3 | REQ-B02 [Must] unmet |
| task 11 | `validateSourceEvidence` is not re-run at activation | `with-workspace.ts:972` is its only call site; `:1284` re-runs the echo bar, not evidence validation | slice 3 activates | evidence validated at write is trusted at activation |
| task 17 | The countable label per field is not stored in `evidence_counts` | `packages/db/src/brain-fields.ts` does not exist | slice 3 renders the confirm screen | the creator reads no warrant count |
| task 20 | No rendering for a field with no `own_post` warrant (must be a distinct string, never a zero ratio) | `brain-fields.ts` absent | slice 3 | absent renders as zero — the honesty defect this repo has already shipped twice |
| task 30 | The three discriminating fixtures (undeclared key, nested object node, unmarked leaf) | UNVERIFIED — `packages/db/tests/brain-content.test.ts` not read line-by-line this session | slice 3 | AC-1/AC-2/AC-9 stay unmarked |
| task 40 | Only two derived artefacts exist (echo scan, claim enumeration); no placeholder-set or `evidenceCounts` derivation on the write path | `with-workspace.ts:988` and `:1030`; nothing computes `evidenceCounts` there | slice 3 | `evidence_counts` is caller-shaped or absent |
| task 45 | `evidenceCounts` numerator must be distinct `inputId`, with `N ≤ M` and a re-derivation check | `brain-fields.ts` absent | slice 3 | the number the creator actually reads counts entries, not inputs |
| G-12 | `input_class` is caller-supplied and verified nowhere, and `own_post` switches **both** R-3 controls off | caller-supplied at `with-workspace.ts` (the capability param); the corpus filters `inputClass = "reference"`; barred kinds in `validateSourceEvidence` | **SLICE 3, corrected 2026-08-27** — the two controls are keyed on `inputClass === "reference"`, so what makes them load-bearing is the first `voice` brain doc written FROM an onboarding input, not the arrival of reference intake. Slice 1 also opened a **creator-side** variant the original row does not name: a textarea whose only warrant for the `own_post` label is the sentence "Paste the text of posts you wrote yourself", with no attestation and no verification | 1000 contiguous characters of a third-party post in one write, needing no duplicate and no trick |

### Slice 4 — References + the R-3 promise

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| G-10 | An evidence entry may cite a claim position holding `[check]`, and the non-empty CHECK *forces* that shape | `with-workspace.ts:994-1014` — the entry loop checks the position is *declared*, never that it holds a value | a creator can paste a reference post | `source_evidence` is an unbounded text channel: 200 characters of a third party's post stored as "evidence" for a document asserting nothing |
| G-11 | The budget's identity is an exact sha, which is the wrong equivalence relation | `with-workspace.ts:835-837` — `normaliseContent` is NFC + CRLF→LF **only**, so a trailing space changes `content_sha256`; `echo.ts:430` aggregates on `postSha` | a creator can paste a reference post | a trailing space or a substring mints a fresh 600-character budget, and a whole post reassembles |
| G-16 | `retainedReferenceSpans`' skip-list and `assertUsableSpan`'s refuse-list disagree, resolving toward a permanent brick | skip-list at `with-workspace.ts:1590-1596` (integers only); refuse-list at `echo.ts:452-462` (also negative and inverted) | a stored inverted range exists — no product path writes one today | the profile throws forever, and the function's own comment at `:1577-1580` claims the opposite |
| B-7 | `echo.ts`'s "9 shared 8-grams in 607" names no unit or population, under a heading that says *Measured* | `packages/db/src/echo.ts:42-46` | slice 4 makes the bar a promise to a creator | an unmeasured claim is the warrant for a hard compliance rule |
| B-11 | `ECHO_MIN_SEGMENTS` and the two quote constants are code, not config — a carve-out argued in source and in no decision | carve-out at `echo.ts:48-50`; `decisions.md:39` (R-6) and `tech-spec.md:109` both say similarity thresholds live in config | slice 4 | two governing documents state the opposite of the code |
| R-30.10 | The `reference`-input substring rule is owed: no brain-doc content may be a verbatim substring of a `reference` input | `REFERENCE_BARRED_KINDS` is still `{voice}` at `with-workspace.ts:1419` | a creator can paste a reference post | the corpus-wide check R-30 assigned to M2b does not exist |
| task 12 | The `normaliseContent` byte-identical regression test is outstanding | `normaliseContent` is module-private at `with-workspace.ts:835`; no test references it | slice 4 | offsets shift on every emoji — green under ASCII fixtures |
| task 42 | Widen `REFERENCE_BARRED_KINDS` to `voice`/`performance_meta`/`killtest` and create `reference-echo.test.ts` | set is `{voice}` at `:1419`; `packages/db/tests/reference-echo.test.ts` does not exist | slice 4 | three of four kinds accept reference-classed provenance |
| task 47 | The "607" population and the sub-8 collision claim are still unstated | `echo.ts:42-46` (the `600` half is closed at `:87`) | slice 4 | same as B-7 |

### Slice 5 — Brain editing, versions, export

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| task 22 | **No brain export exists at all.** `packages/db/src/export.ts` does not exist | `respin/packages/db/src/` has no `export.ts`, and no `exportBrain`-shaped function exists anywhere in `packages/*/src` | slice 5 | REQ-A04 [Must] has no engineering behind it — see F-2 |
| R-30.7 | The R-29 seed-content assertion is owed by the first `frameworks` writer, and there is no writer | `frameworks` is in the schema (`packages/db/src/brain-schema.ts`) and nothing in `packages/*/src` inserts into it; M2a pinned its expected writer set to `[]` | slice 5 seeds F1–F9 | the shared library seeds without the mechanism-level assertion R-29 made the condition of seeding at all |
| task 21 | No `frameworks` accessor on `ProfileAccessors` | `with-workspace.ts:415-440` — five accessors, none of them `frameworks` | slice 5 exports | the export builds its own framework query, i.e. a second corpus |
| task 23 | Export coverage test plus cross-profile and cross-workspace assertions | no export to test | slice 5 | — |
| task 15 | The "annotate at export" half of wiring the R-3 bar | the echo bar runs at write (`:1030`) and activation (`:1284`); there is no export path | slice 5 | — |
| task 37 | Export must never throw (`validateSourceEvidence` annotate mode) | `echo.ts:401` states the rule; nothing implements it | slice 5 | a data-subject right fails closed on one bad row |
| task 44 | Absent is never zero at export — a claim-bearing array with no evidence renders "no claim made" | no export | slice 5 | an empty list reads as "nothing to avoid" |

### Slice 6 — First generation

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| DL-2 / R-21 | Free-tier credits have no minting path | `decisions.md:141` (R-21); no grant path exists for tier `free` | a Free creator reaches the Studio | the tier most pilots will use cannot generate, so slice 6's acceptance walk is unwalkable on Free |
| REQ-I03 | C-28 is a provenance-**shape** rule: it enforces *that* a claim is cited, never that the citation supports it | `with-workspace.ts:994-1014`; narrowed in `decisions.md` R-34 | slice 6 puts generated text in front of a creator | "no invented personal specifics" is an unmet [Must] on the surface a creator reads |

### Slice 8 — Trends + Spin

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| Background runner | The runner decision is due at **M4 entry**, "recorded before planning it" | `tech-spec.md:18` | **before slice 8's phase plan is written**, not at its first task | slice 8 gets planned against an unchosen scheduler |

### Slice 9 — Results + learning

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| `packages/brain` | `tech-spec.md:36` names `packages/brain`; M2b-1 put it in `packages/db/src`; M5 names it the **sole** proposal site | `respin/packages/` has no `brain` directory | slice 9 constructs the first proposal | a second proposal site, or a package move at M5 |

### Slice 10b — Seats, admin, retention, deletion

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| B-2 / G-13 | A viewer can WRITE a brain document and append onboarding inputs | `with-workspace.ts:816-818` — `assertMayDecide` is called at `:1108` and `:1201` only; `writeBrainDoc`, `appendOnboardingInput` and `recordModelUsage` have no role check | a second seat exists (Studio seats, M6) | `brain_docs` is append-only, so a viewer permanently consumes version numbers **and** the profile's R-3 quote budget — neither reversible by the owner. **Seats do not ship until this closes.** |
| task 41 | The role × capability table has no unclassified-cell instrument | `packages/db/tests/profile-scope.test.ts:1245-1252` — the unclassified instrument is over **columns**, not role × capability | seats | the same class of hole reappears on the next capability |
| Retention receiver | Three personal-data stores (`stripe_events.payload`, `rate_limit.key`, `session.ip_address`) have a policy and no receiver | `respin/tests/retention.test.ts:75,144` holds the line; `build-plan.md` M6 owes the receiver | first production deploy | a policy in force but unexecuted, over unredacted customer PII |
| REQ-G05 margin | No aggregation code for the margin dashboard | `packages/db/src/onboarding-schema.ts:189` — a rollup table with no writer and no aggregation | slice 10 | success metric #4 has no number behind it |
| REQ-A04 deletion | The deletion half of REQ-A04 is unbuilt | `creator-data-registry.ts` declares per-table decisions; no deletion executor exists | slice 10 | a [Must] with 30-day teeth |
| T-12 (Respin restatement) | Append-only history versus erasure | `brain_docs` versions are append-only (`with-workspace.ts:1044-1059`) while REQ-A04 requires full removal within 30 days | slice 10 | the executor either deletes append-only history, or the append-only claim is narrowed in writing |

---

## Already closed — verified against the code, corrected here by appending

| ID | Verified closed at |
|---|---|
| T-6 | `NORTH_STAR.md:7` — "Ship **Respin**". The question "does Cutdown get its own North Star?" is closed by supersession (R-1), and Cutdown is parked |
| B-8 | `respin/tests/table-writers.test.ts:281` — the `brain_docs` reason string now names all three write capabilities and records why the old one was false |
| R-30.12 | `packages/config/tests/migrate-config.docker.test.ts:82` — both call sites proved on two-connection Postgres |
| task 6 / 34 | `with-workspace.ts:641-646` — all five confirmation columns plus `referenceCorpusIds` in `GUARDED_WRITE_FIELDS`, in drizzle property space, with a completeness instrument |
| task 18 | `with-workspace.ts:739,1166` — `asPlaceholder` is a schema field and is checked against the stored value |
| task 19 | `brain-content.ts:470` — `parseBrainContent` refuses a non-writable kind, and `writeBrainDoc` calls it at `with-workspace.ts:971` |
| task 27 | `decisions.md` R-31…R-34 exist and carry dated corrections |
| task 28 | `brain-content.ts:418` — `assertRegistryClosed(BRAIN_CONTENT_SCHEMAS)` runs at module load |
| task 29 | the `brain-content.ts` walker throws `ClaimWalkError(pointer, "unhandled node …")` on every unhandled type |
| task 32 | `echo.ts:126` — `ZERO_WIDTH = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu` |
| task 36 | **Superseded by C-42.** `reason` is a server-rendered closed code (`brain-reason.ts`), so no caller prose reaches the column and there is nothing for the bar to walk |
| task 38 | `brain-content.ts:315` — `performanceMetaContent = z.strictObject({})` |

**B-9 (the plan's status column is stale in both directions)** is OPEN-CONFIRMED — `respin-m2b1-brain-surface-plan.md` marks task 28 TODO while `brain-content.ts:418` proves it built. **Home: retired with the plan.** `respin-finish-master-plan.md` supersedes that document; the disposition of its 31 rows is this file, and its task table stops being a status source the moment this register is committed.

---

## Deferred

| ID | Verdict | Owner | Reason | Trigger that reopens it |
|---|---|---|---|---|
| B-9 | OPEN-CONFIRMED | engineering | The brain-surface plan's status column is stale in both directions — task 28 is marked TODO and `brain-content.ts:418` proves it built. Not homed in a slice: the fix is to stop reading that table. This register replaces it and `respin-finish-master-plan.md` supersedes the document | Anyone cites `respin-m2b1-brain-surface-plan.md` for status again |
| G-15 | OPEN-CONFIRMED | engineering | The import-time throw (`brain-content.ts:418`) was recorded ACCEPTED in R-33 and no code moved, so the finding is now less tracked than when it was declined. Blast radius, not likelihood: an unimportable `@respin/db` is a 500 on every Stripe delivery with no env escape | Slice 10's launch hardening, **or** the first deploy where a schema-registry edit ships without a full CI run — whichever comes first |
| T-8 | **BINDS RESPIN** | owner / legal | "Whose analytics, under what permission, retained how long." REQ-F05 makes connectors optional and manual entry universal, so v1 is unblocked — but the question is live the day a connector is built | Any work on REQ-F05 analytics connectors (post-M6) |

## Not Respin — deferred to Cutdown, with owners and triggers

These bind the parked Cutdown line (`cutdown/`, `docs/video-editing/`), not Respin. They are kept,
not dropped: if Cutdown resumes they are still open against it.

| ID | Owner | What it blocks in Cutdown | Why it does not bind Respin | Trigger that reopens it |
|---|---|---|---|---|
| T-2 | owner | The D-21 spend ceiling in AUD; all of Stage 3's live model execution | Respin's equivalent is `creditCosts` plus the auto-top-up monthly cap, both built and tested | Cutdown resumes |
| T-3 | owner | `PHASE_0_EXIT_EARNED` — 3 accounts with rights records, has 1 | Respin holds the creator's own material and ingests third-party content from compliant sources only (R-4) | Cutdown resumes |
| T-4 | operations | `PHASE_0_EXIT_EARNED` — 20 resolved real outputs, has 1 | Respin's evidence phase is `build-plan.md`'s post-M6 pilot | Cutdown resumes |
| T-5 | owner / legal | Any use beyond internal stakeholder showcase | Same as T-3 | Cutdown resumes |
| T-7 | product owner + operations | Claiming Cutdown PRD Phase 1 complete | Respin's equivalents are the post-M6 evidence phase and PRD §5 | Cutdown resumes |
| T-9 | product owner | Stage 6's pooled uplift statistic and Stage 7's isolation model | Respin answered it structurally: REQ-A03 / R-9, nothing crosses profiles or workspaces | Cutdown resumes |
| T-10 | owner / legal | Stage 4's Remotion adapter — D-16 says escalate before `npm install remotion` | Respin has no rendering layer (PRD §6 out of scope) | Cutdown resumes |
| T-11 | owner | Stage 1 task 12's golden-set asset permissions | Respin has no golden set | Cutdown resumes |

**`todos.md` is not corrected in place.** It is a Cutdown/UGC-era file last updated 2026-08-10 and
its own header says so. This register is the Respin-side home for T-8 (deferred) and T-12 (slice 10b);
the eight rows above stay where they are.
