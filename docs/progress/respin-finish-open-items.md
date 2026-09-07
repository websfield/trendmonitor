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

**Five rows were added on 2026-09-04 that are NOT part of the 73** — `8c-C4` and `8c-C9`, both from slice 8c's round-1 gates, both deferred with an owner and a trigger. They are here because the slice-8c billing reviewer's round-2 NOTE 4 was that they existed **only** in a review report (`8c-gate-code-review-round1.md` §4's Gate-C table) and not in the register that exists for exactly this purpose — a deferral nobody can find is indistinguishable from a deferral nobody made. **`8c-W1`, `8c-W2` and `8c-W3` came from slice 8c's real-vendor browser walk**, and none of them was reachable by any test: the first needed a real API response, the second needed someone to read a screen, the third needed a real failure to be swallowed. The 73-item arithmetic above is deliberately left alone: these are new findings, not a re-disposition of an existing row.

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

**SUPERSEDED IN SLICE 4C (2026-08-31, appended rather than rewriting the history above).** R4 remains closed: the retained `unknown_call_count`, new-call spend UPSERT, and read-only reconciliation report are live. R4a is not a current capability: the exported delta writer and its sanctioned `model_usage` UPDATE were removed because there is no real reconciliation source or payload identity to authenticate and deduplicate. Its owner is now the future provider/job/operator-import integration; it must ship the real caller and idempotency proof in the same slice.

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
| task 22 | **No brain export exists at all.** `packages/db/src/export.ts` does not exist | `respin/packages/db/src/` has no `export.ts`, and no `exportBrain`-shaped function exists anywhere in `packages/*/src` | slice 5 | REQ-A04 [Must] has no engineering behind it — see F-2 — **CLOSED 2026-08-31 (slice 5).** `packages/db/src/export.ts` ships the registry-driven exporter; delivery at `app/api/export/route.ts`. Exactly ONE exporter — the unreachable non-streaming twin found by the tenancy gate was deleted. |
| R-30.7 | The R-29 seed-content assertion is owed by the first `frameworks` writer, and there is no writer | `frameworks` is in the schema (`packages/db/src/brain-schema.ts`) and nothing in `packages/*/src` inserts into it; M2a pinned its expected writer set to `[]` | slice 5 seeds F1–F9 | the shared library seeds without the mechanism-level assertion R-29 made the condition of seeding at all |
| task 21 | No `frameworks` accessor on `ProfileAccessors` | `with-workspace.ts:415-440` — five accessors, none of them `frameworks` | slice 5 exports | the export builds its own framework query, i.e. a second corpus — **CLOSED 2026-08-31 (slice 5), differently from how it was written.** The export does not build its own framework query: `exportPage`'s scoped `frameworks` branch is the live reader and carries the private-only rule and its witness. The separate `ProfileAccessors.frameworks` accessor was DELETED as unreachable (`decisions.md` R-62). |
| task 23 | Export coverage test plus cross-profile and cross-workspace assertions | no export to test | slice 5 | — — **CLOSED 2026-08-31 (slice 5).** Cross-profile and cross-workspace assertions run on the LIVE streaming path over all six export branches; a foreign profile and a bogus id return the same 404 (walked). |
| task 15 | The "annotate at export" half of wiring the R-3 bar | the echo bar runs at write (`:1030`) and activation (`:1284`); there is no export path | slice 5 | — — **CLOSED 2026-08-31 (slice 5).** Annotate-at-export implemented and walked: a corrupted offset yields HTTP 200 with a named annotation in JSON and markdown, and `/brain` renders it inline. |
| task 37 | Export must never throw (`validateSourceEvidence` annotate mode) | `echo.ts:401` states the rule; nothing implements it | slice 5 | a data-subject right fails closed on one bad row — **CLOSED 2026-08-31 (slice 5).** The export never throws on a bad row; proven in a browser against a deliberately corrupted offset, then reversed and re-verified. |
| task 44 | Absent is never zero at export — a claim-bearing array with no evidence renders "no claim made" | no export | slice 5 | an empty list reads as "nothing to avoid" — **CLOSED 2026-08-31 (slice 5).** Absent is never zero: empty claim arrays render "no rules recorded". Absence ATTRIBUTION is now selected on (kind, reason) after all three gates found it misattributed. |

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
| `packages/brain` | **CLOSED 2026-09-05** — `@respin/brain` is the sole deterministic proposal constructor/mint; `feedback-readers.test.ts` structurally refuses construction elsewhere | the package exists and exports no public proposal-payload constructor | slice 9b implemented and reviewed it | reopen only if a second proposal site or public payload constructor appears |

### Slice 10b — Seats, admin, retention, deletion

| ID | Claim | Verified at | Reachable when | Blast radius |
|---|---|---|---|---|
| B-2 / G-13 | A viewer can WRITE a brain document and append onboarding inputs | `with-workspace.ts:816-818` — `assertMayDecide` is called at `:1108` and `:1201` only; `writeBrainDoc`, `appendOnboardingInput` and `recordModelUsage` have no role check | a second seat exists (Studio seats, M6) | `brain_docs` is append-only, so a viewer permanently consumes version numbers **and** the profile's R-3 quote budget — neither reversible by the owner. **Seats do not ship until this closes.** |
| task 41 | The role × capability table has no unclassified-cell instrument | `packages/db/tests/profile-scope.test.ts:1245-1252` — the unclassified instrument is over **columns**, not role × capability | seats | the same class of hole reappears on the next capability |
| Retention receiver | Three personal-data stores (`stripe_events.payload`, `rate_limit.key`, `session.ip_address`) have a policy and no receiver | `respin/tests/retention.test.ts:75,144` holds the line; `build-plan.md` M6 owes the receiver | first production deploy | a policy in force but unexecuted, over unredacted customer PII |
| REQ-G05 margin | No aggregation code for the margin dashboard | `packages/db/src/onboarding-schema.ts:189` — a rollup table with no writer and no aggregation | slice 10 | success metric #4 has no number behind it |
| REQ-A04 deletion | The deletion half of REQ-A04 is unbuilt | `creator-data-registry.ts` declares per-table decisions; no deletion executor exists | slice 10 | a [Must] with 30-day teeth |
| T-12 (Respin restatement) | Append-only history versus erasure | `brain_docs` versions are append-only (`with-workspace.ts:1044-1059`) while REQ-A04 requires full removal within 30 days | slice 10b-1 | R-119 narrows append-only to in-life integrity; the executable registry erases authorised history and proves backup expiry by day 28 |

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
| **8c-C4** | **BINDS RESPIN** | whoever builds M6's admin refund surface | **The over-refund budget in `packages/credits/src/ledger.ts` is per REFERENCE SPELLING, not per debit.** Two reviewers independently minted credits out of nothing against the real module — one 4-credit debit, refund #1 as `{autopsy_refund, claimId}` (the settlement's spelling), refund #2 by the default `{debit, debitId}` (the M6 admin surface's shape), both accepted, 8 returned against 4. Arbitrated to CHANGE rather than BLOCK on a caller census run **twice, independently** (`refundCredits` has exactly one production caller, always passing the same `ref`; no dynamic-import or facade path reaches it). The rider landed this slice: the docblock no longer claims a per-debit budget, and `packages/credits/tests/ledger.test.ts` carries a **red-by-design** test that pins today's behaviour and marks the two `expect`s M6 must invert — proven to be a tripwire, not a snapshot, by planting M6's fix and watching it redden. **The structural fix (carry the original debit id in its own column and sum over that) is M6's.** | The **second** caller of `refundCredits` |
| **8c-C9** | **BINDS RESPIN** | M6 / operator-surface work | **A settlement refusal takes down the whole `/trends` surface, permanently.** Driven by the billing reviewer: a paste funded only by a never-expiring lot, then parked, makes `refundCredits` raise `RefundSourceNeverExpiresError` on **every** later page load, and `app/(product)/trends/page.tsx` returns `<AccessRefusal>` — no feed, no niche tracker, no paste panel, no pasted-references section — for a refund the creator would happily wait for. Applies to any `LedgerIntegrityError` out of `refundCredits`, not just this one. Not creator-reachable today: it needs a positive `adjustCredits` with no expiry, which has no app-reachable caller, and free-allowance lots carry an expiry. The refusal copy itself is good and names the operator path; **the blast radius is the finding.** Fix: contain the refusal to the pasted-references section rather than the page. A second reviewer noted `page.tsx:269-272` argues the whole-page refusal *is* containment — that argument is what needs revisiting, not just the code. | The first `adjustCredits` with no expiry reaching production, **or** M6 shipping its operator surface |
| **8c-W1** | **BINDS RESPIN** | engineering | **The autopsy prices by the SERVED model, and the vendor does not always serve the alias it was asked for.** Found by slice 8c's real-vendor walk on 2026-09-04, not by any test. `worker/autopsy-vendor.ts` calls `priceFor(config.prices, result.servedModel)`. Measured directly against the installed API: `claude-sonnet-5` is echoed as `claude-sonnet-5`, but **`claude-haiku-4-5` is served as `claude-haiku-4-5-20251001`**. The active document priced only the alias, so `priceFor` raised, cost was null, and every attempt failed `vendor_usage_unknown` until the claim parked at five and the creator was refunded — i.e. **the autopsy could never complete against the real API**. The generation path degrades to `costState: "unknown"` and still serves, which is why slices 3/6/7 walked green: the autopsy is the first production consumer of the **classification** model on a paid path. Unblocked for the walk with the sanctioned lever — a config version carrying the served id at the same real Haiku 4.5 rates — which is a **patch, not the decision**. The decision is: dated snapshot ids rotate, so pricing by served id silently re-breaks on every rotation (fail-closed, but the creator's paste parks). Options: keep pricing by served id and treat "price every served id" as an operator obligation with an alert; resolve served→requested and price the requested alias; or let the autopsy degrade to unknown cost the way generation does. CLAUDE.md's 2026-08-18 lesson in its exact shape. | The next Anthropic model-id rotation, **or** any new production consumer of a model whose alias is not echoed |
| **8c-W2** | **CLOSED 2026-09-05** | engineering | `/usage` now renders Studio generation, creator-brain construction, and pasted-reference autopsy as the three creator-paid charge paths. `usage-burn-by-mode.test.ts` derives the direct `autopsy_claim` debit marker from Credits source and reads all three from the rendered page. | — |
| **8c-W3** | **BINDS RESPIN** | engineering | **The worker's top-level failure handler tells an operator nothing.** `worker/main.ts`'s `void main().catch(...)` writes `{"code":"worker_start_failed"}` with no reason, no message and no cause. During slice 8c's walk it swallowed a fully actionable `ConfigNotMigratedError` that named the two missing config keys *and* the command to fix them. An operator on the target host would have had a crash-looping unit and nothing to act on — and the worker's own runbook already notes it cannot alert on its own absence. Fix: emit a safe reason code and the error's own operator-facing message (both are content-safe by construction; `safe-log.ts` already draws that line elsewhere). | The first production worker start failure, **or** 10b-1's out-of-process heartbeat monitor |

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

---

## CLOSED IN SLICE 6 (2026-09-01, appended — this register corrects by appending)

**DL-2 / R-21 — Free-tier credits have no minting path. CLOSED.** Minting is **lazy, at balance-derivation
time**, the mechanism R-20 already chose for expiry — no runner, no signup grant, no job.
`mintFreeAllowanceIfDue` (`packages/credits/src/balance.ts`) appends a `grant` row inside
`deriveBalanceInTx`, idempotent through the partial unique `credit_ledger_free_allowance_uq` on
`(workspace_id, ref_id) WHERE ref_type = 'free_allowance'` with `ref_id` the `yyyy-MM` UTC period key —
**workspace-keyed, not the `(ref_type, ref_id)` shape its five siblings use**, because every workspace on
the platform mints `'2026-08'` and the sibling shape would have let the first Free workspace to derive a
balance in a month take the key and refuse every other workspace's grant for the rest of it (R-63). The
index ships with `credit_ledger_free_allowance_ref`, because NULLs are distinct in a unique index and the
index alone is not idempotency. Proven on real Postgres by eight concurrent first reads minting **one**
grant, by name, and by dropping the index in a rolled-back transaction and measuring the doubling.
**Pause-gated** on both authorities — `billing.state` and `hasOpenPause` — because `fold.ts` freezes a
lot's clock under an open pause, so grants minted while paused would never expire and would accumulate
against Free's no-rollover rule (R-67); the skip **suspends rather than forfeits**. R17's stated cost is a
test rather than a hope: a balance read inside the real `handleStripeEvent` transaction does not fail the
webhook. **Residual, not claimed closed:** the acceptance walk on Free against a real vendor has not been
run — see the slice 6 report card; engineering completion and evidence completion are separate claims.

**REQ-I03 — "no invented personal specifics" unmet on the surface a creator reads. CLOSED as
TRACEABILITY, with its limit stated to the creator rather than only in a decision log.** The scan
(`packages/modes/src/traceability.ts`) checks every specific-shaped token in the output for membership in
the union of the creator's active brain content and the input they gave this generation. It is honest
about which error it makes: enforcement is **per shape and per field** (R-64, corrected by R-68) —
currency, percent, multiplier and both date shapes are `hard`; a plain number and a proper noun `flag`;
everything under `/disclosure/` flags whatever its shape — because an entirely honest listicle hook was
**measured being refused** on the `5` in "The 5 mistakes…", and question 4's table debits a refusal. The
behaviour is **flag and offer `[check]`, never silently delete**, asserted directly, because deleting on a
false positive corrupts the creator's script. The `[check]` exemption is scoped to the **specific the
marker is attached to**, never the sentence — the sentence-scoped version was measured returning four
invented specifics for display with `hardRules: []` (R-68/R-69). The limit reaches the creator on screen:
the product checked every specific against what they told it, and **it cannot check whether a claim is
true**.

**Also closed here, and not in the original 73:** REQ-I04's no-guarantee rule and REQ-I05's no-concealment
rule became **deterministic controls on model-authored text** rather than prompt lines (`claims.ts`, the
fifth hard rule `forbidden_claim`) — see R-69, including the round-2 BLOCK where that rule was inert on
`/disclosure/`, the only field its concealment half could ever land on. **The vocabulary behind it is a
stated recall aid with known gaps, not a complete control** (owner decision, R-69): "no finding" means "no
listed string matched" and nothing more, and the revisit trigger is a measured claim reaching a creator
through an unlisted class — which is the signal to change the mechanism, not to add another string.

---

## Added 2026-09-04 — slice-8c generation close-out (NOT part of the 73)

Five defects behind slice 8c's one "unresolved" finding. Three are fixed (`decisions.md` R-100, R-101); two are deferred with an owner and a trigger, recorded here rather than only in a ledger entry — the discipline 8c's round-2 billing NOTE 4 established.

| ID | Claim (one clause) | Verified at | Status | Owner / trigger |
|---|---|---|---|---|
| 8c-G1 | `llm.overallDeadlineMs: 40_000` is below a real generation's 53,233 ms, so every spin aborted at 40,130 ms | real-vendor probe 2026-09-04; **four** `model_usage` rows at 0/0 `unavailable` (the row count said three; the code-review gate read the table and corrected it) | **CLOSED** — 120,000, measured, under the 135,000 lease ceiling | R-100 |
| 8c-G2 | `llm.maxOutputTokens: 4000` is below the mode's natural 5,060 output tokens | real-vendor probe; `LlmTruncatedError`, billed | **CLOSED** — 12,000, with a chained `CORRECTIONS` entry for seeded databases | R-100 |
| 8c-G3 | The spin gate's four reference bounds are all stricter than the autopsy's own contract | `similarity.ts` vs `autopsy.ts`; the walk's real 63-word hook | **CLOSED** — bounds are the producer's, hook compared in 30-word windows | R-101 |
| 8c-G4 | `SpinSimilarityError` has no `billing-errors.ts` entry, so an escape renders "Something went wrong" | absent from `HANDLERS`; `billingErrorCode` falls through to `"unknown"` | **CLOSED 2026-09-04** — re-exported through the credits facade, mapped to a new `reference_unusable` billing code with its own copy, and given its own `GENERATION_REFUSAL_CODES.reference_unusable` so the operator column stops calling it `parse_failed`. **The deferral warrant this row carried was WRONG and is recorded as such**: it said reachability was low because G3 made malformed references near-impossible, and the code-review gate then measured two producer-legal references the gate still refused (a hook of pure punctuation or emoji — the producer's predicate is `trim()`, the gate's was `words()`). That predicate is aligned now. Both money and compliance lanes reached this independently |
| 8c-G5 | `safe-log.ts:62` returns the sentinel `"Error"` for any **minified** class name, so production logs cannot name the failing class | `/^[A-Za-z][A-Za-z0-9]*$/` vs SWC-mangled names; the 8c walk logged `errorName: 'Error'` | **OPEN** | This is why 8c could not diagnose the blocker from its own logs. Fix is a stable discriminator carried ON the error (as `billable`/`operatorRemedy` already are), not a looser regex — a mangled `'l'` is no more useful than `'Error'`. Trigger: the next operability pass, or the next production incident that needs a class name |
| 8c-G6 | The reference bounds check runs AFTER the vendor call, so a malformed reference is paid for before it is refused | `pipeline.ts` — `assertTrustedReference` runs inside `evaluateSpinSimilarity`, post-draft | **CLOSED 2026-09-04** — `runGeneration` asserts the trusted reference at entry, before any vendor call; the gate still asserts it too, so this is an earlier second call rather than a replacement. Billing showed the bound designed to catch this could not see it: `meteredCall` had already written `consumedIncludedBuild: true`, which `countUnchargedBillableAttempts` filters out — an unbounded-rate paid-call loop with no counter |
| 8c-M1 | Uncharged-billable output exposure triples to 4.20 USD per profile per window; `maxUnchargedBillableAttempts: 10` was sized against 1.40 | `schema.ts` exposure arithmetic, recomputed by `generation-pricing.test.ts` | **CLOSED 2026-09-04 (R-102)** — the attempt cap stays 10 (its derivation from `concurrencyLimits.studio` still holds) and gains a money-denominated twin, `generation.maxUnchargedBillableCostMicroUsd`, seeded at 1.00 USD per profile per window. The billing reviewer's framing was decisive: 10 is the right number and the wrong control |
| 8c-M2 | A spin sells for 5 credits (USD 0.05) and costs USD 0.078–0.112 | measured `model_usage` rows, 2026-09-04 | **OPEN — owner flagged it deliberately; CLAIM CORRECTED** | "Below cost" holds only at the overage-pack rate; at Creator/Pro/Studio a spin runs at +61/+48/+38% on one call. **The real breach is PRD §5's >=70%/>=60% blended-margin north-star, missed on every route** — see the R-100 amendment. Owner's call unchanged. Trigger: pricing review before launch |
| 8c-L1 | tech-spec §132 "full script < 45s" is not met (53.2 s measured, ×2 with a rewrite) | `tech-spec.md:132`, annotated | **OPEN — budget breached** | Needs a shorter mode output, a faster model, or generation moved to the slice-8 worker. Until then no surface states a latency figure |

## Added 2026-09-04 (round 2) — what the three reviewer gates found on the close-out itself

The gates ran at FULL on the R-100/R-101 change: billing **BLOCK**, compliance **NEEDS CHANGES**, consolidating code review **NEEDS CHANGES**. Every finding below is closed unless marked otherwise.

| ID | Claim | Status |
|---|---|---|
| 8c-B1 | `CORRECTIONS`' provenance guard launders: every `config:migrate` appends as `migrate-config`, so a key-adding run turns an operator's document product-authored and the NEXT run overwrites their values. Driven against a real database on three spend dials, upward | **CLOSED** — `appliedCorrections` records a correction as CONSUMED when it is DECLINED on an operator's document, making their choice permanent instead of deferred by one run. A marker alone would not have worked: after the laundering pass nothing can tell 4000 was the operator's choice. Three-run regression test plus a product-authored non-vacuity witness |
| 8c-B2 | `llm-deadline-coherence.test.ts` read the schema defaults only; a fresh install runs on `CONFIG_V1_SEED`. The reviewer planted the exact seed reversion and got **8 of 8 green** | **CLOSED** — the population is a list of two, in `generation-pricing.test.ts`'s shape. The same planted reversion now reddens three assertions |
| 8c-B3 | Nine of ten mutations planted on the R-3 gate survived `similarity.test.ts` at 24/24 green | **CLOSED** — discriminating fixtures found by SEARCH (one per proxy, each with the other two under the threshold), a final-window case, the exact-threshold case, and equality bounds. Matrix re-run: **11 of 11 killed** |
| 8c-B4 | `scoreSpan`'s docblock cited `similarity.test.ts` as the witness for its `contentOverlap` equality; that file never imported `contentOverlap` | **CLOSED** — the relation is asserted against the real function |
| 8c-B5 | `spin-reference-bounds.test.ts`'s `.not.toThrow(/regex/)` passes on a DIFFERENT error, and its fixture was raising a `TypeError` on every run — so the case never reached the gate | **CLOSED** — bare `.not.toThrow()` and a real parsed output. The bare form immediately exposed the `TypeError` the regex form had masked |
| 8c-B6 | `REFERENCE_MECHANISM_BEATS_MAX = 20` against the producer's 50 — the R-101 defect one file over, with two docblocks asserting a false fact and a green test pinning the stale value | **CLOSED** — 50, both docblocks corrected, the bound added to the cross-package witness, and a 25-beat end-to-end case |
| 8c-B7 | The `subject` axis no-ops above ~6-8 words: a 20-word term with one word inserted went unflagged, and the vendor prompt constrains `subjectTerms` not at all | **CLOSED** — windowed at 6 tokens, which is the OLD `MAX_SUBJECT_TERM_WORDS`, so every term the old bound admitted behaves identically and only previously-unmatchable terms change |
| 8c-B8 | `9/30` is exactly `0.3`, one ulp under `1 - 0.7`, and the window made a constant denominator the common case — a 9-word lift cleared a hard gate | **CLOSED** — the comparison carries a `1e-9` tolerance, far below any ratio this gate produces, with the case pinned |
| 8c-B9 | tech-spec §132 has two figures and only one was annotated; TTFT < 3s is unmet structurally, since nothing streams | **CLOSED** — both halves annotated |
| 8c-B10 | Comments arguing for the old numbers survived the change: `schema.ts` "180s at the defaults below" (now 360s) and "40_000 rather than 45_000"; `autopsy-policy.ts`'s "four seed-default 40 s deadlines (160 s)" (now 480 s in a 600 s lease, 89% of the code ceiling) | **CLOSED** — all three rewritten to the shipped numbers, with the autopsy lease's lost margin named and its revisit trigger marked urgent |
| 8c-B11 | `respinConfigV1` validates each key in isolation, so `/admin/config` could store `timeoutMs: 300_000` beside `overallDeadlineMs: 5_000` | **CLOSED at the operator's door, deliberately NOT in the schema.** A `.refine()` on the read schema makes the legacy documents `CORRECTIONS` exists to repair unparseable — measured: it reddened three correction tests — which is "fail closed with no way forward". The relation is enforced in `validateConfigContent`, where a way forward always exists |
| 8c-B12 | My own tooling rewrote edited files from LF to CRLF, breaking a source-scanning guard that matches multi-line literals | **CLOSED** — files renormalised to LF. Invisible to git (`core.autocrlf=true`), caught only by `with-workspace.test.ts`'s pause-gate anchor probe. Worth a Lessons line |

**Still open and deferred with an owner:** `8c-G5` (production logs cannot name a minified class — operability, no creator harm), `8c-L1` (both halves of the §132 latency budget), `8c-M2` (the PRD §5 margin target), `8c-C4` and `8c-C9` from the earlier round.

## Added 2026-09-04 (round 2 gates → fix pass) — closed, and the residuals

The three round-2 gates returned **0 BLOCK** (billing's round-1 BLOCK discharged and re-driven on real Postgres across four runs), and between them raised 16 findings on the fix pass itself. The two-round cap was spent, so everything below marked CLOSED shipped **fixed without re-review**.

| ID | Claim | Status |
|---|---|---|
| 8c-R1 | The entry-time `assertTrustedReference` had no witness — both compliance and code review planted its deletion and got the whole suite green (3,777 tests). Its truth is what makes `reference_unusable`'s "nothing was spent" a true money claim | **CLOSED** — four malformed-reference cases through `runGeneration` with a provider that throws if called, plus a non-vacuity case proving the stub is reachable. Deletion now reddens |
| 8c-R2 | The R-102 cost refusal emitted the ATTEMPT cap's telemetry, printing `attempts=2 cap=10` on a refusal the attempt check had just passed | **CLOSED** — the metric carries a required `bound: "attempts" \| "cost"` discriminator plus the money numbers; every call site must now declare which bound fired, and a test asserts the cost branch |
| 8c-R3 | Two off-by-ones on the R-3 subject axis both survived the suite: the last start position of `containsWordSequence`, and the final window of a long term | **CLOSED** — two fixtures placing the term and the run at the last position; both mutations now killed |
| 8c-R4 | The money accessor's tenancy had no witness — dropping `both(modelUsage)` from both accessors left **1,199 tests green**, because the fixture's row is `consumedIncludedBuild: true` and both accessors filter for `false`, so both return 0 | **CLOSED** — a by-value case with uncharged rows on the profile, a same-workspace sibling and a cross-workspace foreigner at three magnitudes, plus a non-vacuity case. The mutation is killed. Three comments citing a test title that did not exist are corrected |
| 8c-R5 | A fifth uncompared copy of the autopsy contract in `trends-storage.ts`, gating the trend feed, the spin reference and the worker's post-payment completion | **CLOSED** — driven through the real parser at every producer maximum with a non-vacuity case per bound, and the function's docblock names what each of its three paths does on failure |
| 8c-R6 | `REFERENCE_MECHANISM_TEXT_MAX_CODE_POINTS` mirrored an unexported `MAX_STAGE_TEXT_CHARS` and was not compared | **CLOSED** — the producer's bound is exported and pinned |
| 8c-R7 | `autopsy-policy.ts`'s rewritten arithmetic was wrong twice: the room is 120 s not 60 s, and 89% vs 27% used different denominators | **CLOSED** — 120 s at the shipped deadline, 60 s at the ceiling, and the comparison restated on one denominator (27% → 80%) |
| 8c-R8 | The new cap copy wrote its own clearing sentence instead of importing `UNCHARGED_CAP_WINDOW_CLAUSE`, breaking a rule stated 20 lines below it | **CLOSED** |
| 8c-R9 | `config/src/index.ts`'s docblock claimed "a caller that skips this cannot write an invalid document" — false once the relation moved out of the schema | **CLOSED** — the sentence now names `applyConfigMigration` as the deliberate exception and why |
| 8c-R10 | `scoreSpan`'s docblock claimed an equality its named witness did not assert | **CLOSED** — the docblock states the property as code, not as tested, and names what the test does assert |
| 8c-R11 | R-101's closing paragraph still recorded two items as open that the fix pass had closed | **CLOSED** — R-101 amendment |
| 8c-R12 | Four manifest files still carried CRLF, so "I renormalised to LF" was false | **CLOSED** — actually renormalised. The 178 remaining CRLF files are the checkout's own (`core.autocrlf=true`); code review converted all 214 sources and found exactly one guard affected, failing loud |
| 8c-R13 | Duplicate `6b.` test labels | **CLOSED** |
| **8c-R14** | The subject window can FALSE-REFUSE on a sentence-shaped subject term: a common six-word English run inside one refuses an unrelated spin, after the creator paid for two drafts | **PARTIALLY CLOSED — cause fixed, residual open.** The producer prompt now constrains `subjectTerms` to short noun phrases (≤4 words) and interpolates the char bound. Terms already stored are unaffected. **Not tuned further deliberately**: this project's own 8c lesson is that a heuristic tuned by review one instance per round does not converge, and the two-round cap was spent. Owner: the next compliance pass. Trigger: the first false refusal reported by a creator, or the first 200 autopsies under the new prompt |
| **8c-R15** | `spinReferenceForProfile` throws bare `Error`s, so pressing Spin on a still-running autopsy renders "Something went wrong" — the db-layer twin of the finding fixed one layer up | **OPEN** — needs a typed class reaching `reference_unusable`. Owner: the next slice touching trends copy. Trigger: bundled with 8c-G5 |
| **8c-R16** | The R-102 money sum measures unusable CALLS, not uncharged ATTEMPTS — 60,000 of 420,000 micro-USD on the mixed shape — so its 1,000,000 value is not derived from what it can see | **OPEN — R-103.** Claims corrected; the redesign is deliberately NOT shipped unreviewed after the cap. Trigger: the first 200 uncharged billable attempts' measured cost |
| 8c-R17 | `migrate-config`'s decline is per-DOCUMENT, so an unrelated `/admin/config` edit permanently declines every pending correction — a slice-2a database can strand on `maxOutputTokens: 1024` | **OPEN** — the mirror image of the BLOCK it fixed, and the safer direction of the two. Needs per-field provenance or a CLI line naming the remedy. Owner: the next config work |
| 8c-R18 | `hookMatchField`'s tie-break docblock, the `1e-9` magnitude, and `turnBeat === -1` (dead branch) have no witnesses | **OPEN — notes.** None affects gate strength; recorded so the next reader does not mistake them for guards |

## Added 2026-09-05 — slice 9a close-out residuals (not part of the 73)

All ten rows are **recorded / non-blocking** at the slice-9a close-out. They are visible here because this register, not the slice card alone, is the status source. The close-out contract explicitly forbids fixing them in the unreviewed pass.

| ID | Claim | Status / owner or trigger |
|---|---|---|
| 9a-C1 | The confounder paragraph and the truncated branch can still contradict each other on one card; the missing proof is a test that renders a truncated card and reads both blocks | **CLOSED 2026-09-05 (9b)** — `results-comparison.test.tsx` renders a clipped population as one unit and proves the unread-confounder limitation replaces both contradictory present/absent claims |
| R-112 | The performance log is ungated against PRD §4G's “View only” for Free | **CLOSED 2026-09-05 (9b)** — strict config-derived performance entitlement separates Free/view-only, paid pause, and role restrictions; focused, full, live-PostgreSQL, billing, and tenancy evidence is recorded in the 9b manifest |
| R-113 | Any strategy edit splits a creator's metric history even when the metric declaration is byte-identical | **CLOSED 2026-09-05 (9b)** — comparison and proposal strata use exact `{key,label,unit,direction}` identity and the non-empty set of declaring Strategy document ids; same tuples pool and any changed member splits |
| R-114 | The slug rule is a stored-data format and every non-Latin label collapses to `metric` | **RECORDED / NON-BLOCKING** — not reachable today; first cross-profile `metric_key` reader, which must key on `(profile_id, metric_key)` |
| 9a-G1 | The canonical suite can exit non-zero with every test passing because PGlite WASM blocks the worker long enough to hit birpc's hard 60 s `onTaskUpdate` timeout; 9a's contribution is removed and the repo-wide worst leakers are 45 money-suite `createTestDb` sites with zero closes | **RECORDED / NON-BLOCKING** — observed again at close-out: exit 1 after 4,206 passing tests; next test-harness lifecycle pass |
| 9a-D1 | `MIN_COMPARABLE_RESULTS` carries the phase-card rationale instead of PRD REQ-F03's “default 3” | **RECORDED / NON-BLOCKING** — next requirements-provenance pass |
| 9a-D2 | The narrow-read pin scans one file while three `brain-ops.ts` call sites can reach `brainDocsByKind` | **RECORDED / NON-BLOCKING** — next comparison-reader population change |
| 9a-D3 | `credit_ledger` is absent from `tests/table-writers.test.ts`'s manual `TABLES` map | **CLOSED 2026-09-05 (9b)** — the exact-writer scanner registers the ledger and proves only the reviewed `balance.ts::insert` and `ledger.ts::insert` production writer modules exist |
| 9a-U1 | Browser `maxLength` counts UTF-16 code units while the server refuses at 2,001 code points | **RECORDED / NON-BLOCKING** — next Unicode form-boundary pass |
| 9a-U2 | `DeclaredMetric` carries no label, so the Results screen prints a slug instead of the creator's words | **CLOSED 2026-09-05 (9b)** — the exact declaration carries `label`, and Results renders it adjacent to the key with explicit creator-authored attribution |

## Added 2026-09-07 — Phase 10b-1 Task 4 round-1 gate residuals (not part of the 73)

Every round-1 finding was fixed in code the same day (`docs/progress/respin-finish/10b1-task4-contract.md`, "Round-1 gate fixes"). What remains is owned by later tasks and recorded here so nothing is taken as closed by silence:

- **T4-R1 (Task 5) — orphaned journal version after a rolled-back erasure.** The erasure transaction appends `verifying` at version N before the executors run; a residue rollback leaves N in the journal with no database receipt, and the next append (`blocked`) reuses N with different content. The S3 adapter's conflict rule must accept or supersede that orphan, or a blocked-after-residue operation can never resume in production. Pinned in `deletion-executor.test.ts`. **CORRECTED 2026-09-07 (Task 5 round-1 code BLOCK 5):** this was true only while `unavailableDeletionJournal` never appended anything. With a real S3 store the journal PUT and the Postgres COMMIT are not one transaction, so a window exists — the `complete` PUT failing after `verifying` succeeded, a receipt mismatch after a successful PUT, or a crash between the second PUT and COMMIT — in which a version is durably written and the transaction rolls back. Because the version bytes are deterministic from committed state, the retry recomputes the SAME key and gets `precondition_failed`, so the operation wedges on `journal_conflict` with no residue to explain it. Task 5 does NOT close this; it is recorded as an open item, and the reconciliation read that would close it (an existing object whose checksum equals the intended bytes is an idempotent replay, not a conflict) needs the verifier principal in the worker and is deferred with the rest of the provisioning work.
- **T4-R2 (Task 6) — the financial chain still cascades with the workspace.** `credit_ledger`, `subscriptions`, `pause_periods` are `workspace_lifetime`; the executor refuses workspace erasure and the worker refuses the `workspace` scope token until Task 6 re-registers them under the seven-year receiver (R-122). The workspace walk's ledger-empty assertion is the flip point.
- **T4-R3 (Task 6) — the raw Stripe payload survives subject erasure** (`stripe_events.payload`, 90-day receiver clock, Task 6's extract input). A completed workspace erasure would hold the subject's email in it for up to 90 days; moot while T4-R2 holds, and Task 6 must purge or redact it in the same enabling change.
- **T4-R4 (Task 6) — the 90-day mail receiver is unwired inventory.** `sweepExpiredAuthMail` exists and is tested; nothing calls it until Task 6 wires the retention receivers.
- **T4-R5 (Task 8) — copy.** Cancellation does not re-arm auto-top-up (plan C2 reverses listed controls only); the password-reset endpoint answers "check your email" regardless of the mail outcome (Better Auth 1.6.28 enumeration guard) — both must be stated on the pages, not only in the outbox.
- **T4-R6 (compliance/learning reviewers, Task 3 registry) — consent-basis library records.** The registry cascades whole `creator_consent` rows (including `frameworks` with that basis) at identity erasure, stricter than R-122's "versions retained, source link nulled" for shared library records. Pre-existing Task 3 classification, flagged by the tenancy reviewer; decide at the Task 6 receiver review whether the library keeps a source-unreadable version.
- **T4-R7 (rollout evidence) — live proofs still separate.** Stripe `Emptyable` customer clearing and real Resend delivery (T-16) remain live-account evidence; the round-1 reviewers re-verified only the installed SDK types.

## Added 2026-09-07 (round 2) — Phase 10b-1 Task 4 round-2 gate residuals

- **T4-R1 — CLOSED by design, not deferred.** Both journal receipts are appended after the executors and the independent probes, inside the erasure transaction; a rollback appends nothing and no version is ever reused. Task 5's S3 adapter keeps R-124's conditional-create, never-overwrite rule unchanged. (Three round-2 reviewers judged the earlier "adapter conflict rule" framing dishonest; they were right.)
- **T4-R2 — extended.** The financial chain now includes `model_usage` at profile scope (R-122 "model-usage … facts"); profile erasure is held as well as workspace erasure until Task 6 re-registers all four tables.
- **T4-R3 — extended to identity scope.** Identity erasure of a workspace's Stripe contact leaves that contact's email in `stripe_events.payload`; identity erasure is held (`STRIPE_PAYLOAD_RECEIVER_WIRED = false`) until Task 6 purges the payload or plan C3's billing-contact binding refuses the deletion. Every scope token is refused at worker startup until then.
- **T4-R8 (Task 8 / runbook) — operator procedure for an exhausted erasure.** After three real failures the blocked path refuses to resume; the runbook says to reset `retry_count` once the residue is understood. Task 8's admin surface should show the count and the code and offer the reset; today it is a database statement.
- **T4-R9 (rollout evidence) — mirror-lag reopen.** A period-end cancellation the owner set in the Stripe portal seconds before requesting deletion, not yet mirrored by webhook, is enqueued as the operation's own fence and would be reopened on cancellation (billing round-2 NOTE, confidence medium-low). If it matters at rollout, the fence's `execute` retrieves the subscription first and records `already_cancel_at_period_end` as a no-op so the reopen never enqueues.
- **T4-R10 (10b-2) — validate mail ceilings at the config-write boundary.** The reserve-floor refusal fires per send inside `admitAuthMail`; once 10b-2 wires a config key, a bad override would refuse all auth mail. Validate on write, keep the per-send check as a backstop.
- **T4-R11 (cosmetic) — tick counts.** `handleCancelled` reports a dispatched reversal as `advanced`; a cancellation racing the pre-grace tick bumps `retry_count` on a terminal operation through the refused `cancelled → grace` transition. Neither misleads the row; both mislead the count.
- **T4-R12 (author's least-confident line after round 2) — a shared failure budget.** `retry_count` counts every real failure of an operation, not only erasure failures, so earlier unrelated failures shorten the erasure retry budget. Fail-closed; a dedicated counter is a migration for Task 8 if the operator surface wants exact semantics.
