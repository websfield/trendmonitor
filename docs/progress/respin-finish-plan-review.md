# Respin finish-plan gap report (2026-08-27)

Audit of `respin-finish-master-plan.md`, `respin-finish-phase-1.md`, `respin-finish-phase-2.md`
and `respin-finish-codebase-review.md` against nine lenses. Findings ranked most-severe first.

Companion: [`respin-finish-open-items.md`](respin-finish-open-items.md) — every open item's disposition.

**Line numbers into the four plan documents are as they stood before this audit's amendments**
(git `HEAD` at 8f67167). Line numbers into `respin/` source are current.

---

### F-1 · Slice 1 puts `createProfile` in the one package a recorded decision forbids, and it cannot compile there — `severity: blocking`

**Lens:** Sequencing / Under-specification
**Evidence:** `docs/plans/respin-finish-phase-1.md:22` requires `createProfile` to enforce `profileCaps`
"from the **active config document**, per resolved tier", and the Files table at `:63` puts it in
`respin/packages/db/src/with-workspace.ts`. `decisions.md` R-30 binding constraint 2 says the opposite
in terms: "`createProfile` belongs in a layer that can see config AND billing state — **not
`packages/db`**", because re-deriving the tier there creates a second tier authority. The dependency
graph agrees: `respin/packages/db/package.json` depends on `drizzle-orm`, `pg`, `zod`, `uuidv7` and
nothing else — no `@respin/config`, no `@respin/credits` — while `@respin/credits` depends on
`@respin/db` (`packages/credits/package.json:20`), so the import cannot be reversed.
**Consequence if unaddressed:** the developer's first hour is spent discovering that R2 does not
compile, and the two available exits are both bad — add `@respin/config` to `@respin/db` and
re-derive the tier (the second-authority defect that caused two M1 round-6 findings), or move
`createProfile` mid-slice with the facade already written against it.
**Fix applied:** `respin-finish-phase-1.md` R1/R2 rewritten as an invariant with the seam named
(`packages/credits` owns `createProfile`; `packages/db` keeps the capability), the Files table
corrected, and the layering constraint added to Prerequisites with its R-30 citation.

---

### F-2 · `creator_profiles` has no `state` column, and slice 2 requires reading it — `severity: blocking`

**Lens:** Coverage / Sequencing
**Evidence:** `docs/plans/respin-finish-phase-2.md:57` (R17) requires `runInference` to refuse "an
**archived profile** by reading `creator_profiles.state` **at operation time**", and
`respin-finish-codebase-review.md:57` states the same for `createProfile`. The column does not exist:
`respin/packages/db/src/brain-schema.ts:87-110` declares `id`, `workspace_id`, `display_name`,
`created_at`, `updated_at` and one unique constraint, and no migration `0000`–`0012` adds a `state`
column. `respin-m2b2-metered-inference-scope.md` states as an inherited constraint that "M2b-1 lands
the column with no writer" — **M2b-1 did not land it.** R-30 binding constraint 3 records the
underlying decision as still owed: a `state` column, or a written reason there never will be one.
Slice 2's migration task (`respin-finish-phase-2.md:74`) names only the partial unique index and the
enum extension.
**Consequence if unaddressed:** slice 2's R17 is unbuildable, slice 1 ships a cap counter with no
archive semantics, and the column arrives as a third migration on the table M2a's own "schema lands
once" argument was written to avoid.
**Fix applied:** the decision is added to the owner decision queue with a default; the column is
moved into slice 1's migration (the slice that first creates profiles), and slice 2's R17 now cites
it as a prerequisite rather than assuming it.

---

### F-3 · REQ-A04 export does not exist, and two documents say it does — `severity: blocking`

**Lens:** Honesty / Coverage
**Evidence:** `respin-finish-codebase-review.md:63` — "Export helpers exist; screens do not" — and
`:81` — "REQ-A04 (export helpers, no screen)". `respin/packages/db/src/` contains no `export.ts`,
and no export-shaped function exists anywhere under `respin/packages/*/src`. The only artefact is
`packages/db/src/creator-data-registry.ts`, which *declares* an `ExportDecision` and a
`DeletionDecision` per table — a policy record, not an exporter. Four brain-surface tasks (22, 23,
37, 44) name `packages/db/src/export.ts` as their file. `respin-finish-master-plan.md:30` budgets
slice 5 — "Edit a field, see the old version still readable, export JSON + markdown" — at **3–4 h**
on the assumption those helpers exist.
**Consequence if unaddressed:** slice 5 is estimated at roughly half its real size, and a [Must]
requirement is recorded as partly satisfied when nothing of it is built.
**Fix applied:** the codebase review's two claims are corrected in place with the evidence; slice 5's
estimate is raised and the stub names the export module as new construction.

---

### F-4 · Slice 2 inherits nine constraints from the M2b-2 scope note and drops three of them — `severity: major`

**Lens:** Coverage
**Evidence:** `respin-m2b2-metered-inference-scope.md` settles the metering path's obligations.
`respin-finish-phase-2.md` carries the pause gate, the pre-call balance read, the auto-top-up
semantics, `model_usage` in its own transaction, the `attempt_id` index, the enum exhaustiveness, the
free-attempt rule, `resolved_tier`/`cost_state` and the role gate. It carries **none** of:
(a) `workspace_spend_monthly` — its first writer lands in this slice, and R-30 constraints 5 and 9
both bind that writer (pseudonymisation re-taken in writing; an idempotency key on the increment; a
reconciliation query written *while* `model_usage` still exists, because the rollup is the only
record that survives a REQ-A04 deletion);
(b) the `.default()` deploy window — `getActiveConfig` returns the stored row's version with
defaulted content, so between deploy and `migrate-config` a debit is stamped with a `config_version`
whose stored document lacks the keys that priced it;
(c) `migrate-config` migrating top-level keys only, so `creditCosts.onboardingBrainRebuild` lands
only as a side effect of re-parsing.
**Consequence if unaddressed:** a retried rollup writer double-counts spend permanently and
undetectably, on the one aggregate that outlives deletion — and the number it corrupts is the margin
figure R-6 tunes pricing against.
**Fix applied:** the config-window failure is a new R19 in `respin-finish-phase-2.md`; the rollup's
three obligations moved to a new **slice 2b** ("the spend record that outlives deletion"), stubbed in
`respin-finish-slice-stubs.md`, because adding them in place took slice 2 to 22 requirements against
a ~12 budget and they change no creator-visible behaviour in 2a. All four items are homed in the
disposition register.

---

### F-5 · No slice owns free-tier credit minting, the `frameworks` seeder, the retention receiver, or the margin aggregation — `severity: major`

**Lens:** Coverage
**Evidence:** taking `respin-finish-codebase-review.md:59-71` ("what is missing") against the ten
slices at `respin-finish-master-plan.md:24-33`:

| Missing row | Owned by |
|---|---|
| Free-tier credit minting (DL-2 / R-21) | **no slice** — `decisions.md:141` records there is no path until M3 |
| `frameworks` seeder + F1–F9 JSON | **no slice** — and R-30 constraint 7 makes the R-29 seed assertion the first writer's obligation |
| Retention receiver (3 tables) | slice 10, unnamed — `build-plan.md` M6 owes it and `respin/tests/retention.test.ts:144` holds the line meanwhile |
| Margin dashboard aggregation (REQ-G05) | slice 10, unnamed — `packages/db/src/onboarding-schema.ts:189` is a rollup table with no writer |
| REQ-A04 deletion executor | slice 10, unnamed |
| REQ-I03 at the generation surface | **no slice** — narrowed to a provenance-*shape* rule in `decisions.md` R-34 and left open |

**Consequence if unaddressed:** slice 6's acceptance walk ("Generate hooks from their own brain,
kill-tested, debited") is unwalkable on Free, the tier every pilot creator starts on. The other four
are M6 obligations that reach slice 10 as unenumerated scope.
**Fix applied:** free-tier minting is named in slice 6's stub, the `frameworks` seeder in slice 5's,
REQ-I03 in slice 6's, and the four M6 obligations are enumerated in the slice 10 stubs — which is
also why slice 10 is now split (F-6).

---

### F-6 · Slice 10 is four milestones' worth of work in one 10–12 h line — `severity: major`

**Lens:** Gate load / Estimates
**Evidence:** `respin-finish-master-plan.md:33` — "Launch hardening (Marketing, admin, retention,
seats)", 10–12 h. `build-plan.md` M6 lists: landing page with the comparison demo (REQ-H02/R-14,
zero-credit and IP rate-limited), pricing wired to checkout, legal pages, changelog, admin curation
queue, source management, user/subscription lookup, credit adjustments, margin dashboard, PostHog,
Sentry, rate limits, free-tier abuse pass, REQ-A04 deletion within 30 days, Studio seats via Better
Auth organizations, Studio API, **plus** the retention receiver over three tables. It triggers all
four Respin Critical Paths at once: billing (margin, credit adjustments), tenancy (seats, deletion,
admin), compliance (source management, the public demo), learning (the demo's honesty).
**Consequence if unaddressed:** the single largest unshipped surface in the plan goes into a
four-gate round — the exact shape M2b-1's 11 rounds came from.
**Fix applied:** split into **10a (public surface + observability)** and **10b (seats, admin,
retention, deletion)** in the stub document, with the four-gate load landing on 10b alone and
B-2/G-13 made a hard precondition of shipping seats.

---

### F-7 · The estimate is honest and the build plan is now wrong — say so — `severity: major`

**Lens:** Estimates
**Evidence:** `respin-finish-master-plan.md:24-33` totals 60–80 h across slices 1–10, covering M2
through M6. `build-plan.md` budgets those five milestones at 1–2, 2–3, 2–3, 1–2 and 1–2 sessions —
7–12 sessions. M2 alone, budgeted at 1–2 sessions, has already consumed **8 days** and is not done
(`respin-finish-codebase-review.md:37-51`).
**Consequence if unaddressed:** the build plan keeps producing a budget every milestone blows, and
the overrun is read as a discipline failure rather than a wrong estimate — which is what made the
M2b-1 gate rounds feel like a crisis instead of a cost.
**Fix applied:** the slice estimates are kept (they are the honest number, and F-3 raises slice 5),
and a note added to the master plan stating plainly that `build-plan.md`'s session budget for M2–M6
is superseded by this plan's hour estimates. The build plan's *acceptance criteria* are untouched —
only its sizing was wrong.

---

### F-8 · A new `@respin/*` package is importable from `app/**` by default — and the plan creates four — `severity: major`

**Lens:** Coverage / Sequencing
**Evidence:** `respin/eslint.config.mjs:122-170` restricts `app/**` by naming each package
individually under `paths` with an `allowImportNames` list. The `patterns` block denies path-shaped
specifiers and deep imports (`@respin/db/*`, `@respin/auth/*`), but there is **no negation-form
catch-all** of the shape `["@respin/*", "!@respin/db", …]` — brain-surface task 25 is exactly this
and is still open. So `@respin/llm` (slice 2), `@respin/modes` (slice 6), `@respin/trends` (slice 8)
and `@respin/brain` (slice 9) each land outside the default-deny unless someone remembers.
**Consequence if unaddressed:** the import boundary that makes the M2a cage structural degrades to a
convention, one package at a time, and the failure is silent.
**Fix applied:** task 25 homed to slice 1 (the first slice to touch `eslint.config.mjs`), stated as
an invariant — "a package added without an allowlist entry is refused, proved by a deny fixture for
an unnamed package".

---

### F-9 · Slice 1 offers a facade shape an existing lint rule forbids — `severity: minor`

**Lens:** Under-specification
**Evidence:** `respin-finish-phase-1.md:31` (R5) — "`@respin/db/app-server` (or extend the existing
`respinDb` entrypoint)". `respin/eslint.config.mjs:157-159` denies the group `["@respin/db/*"]` from
`app/**` with the message "no deep imports into `@respin/db` from `app/**` — the package root's
sanctioned surface is the only door". The first option is dead; the card does not say so.
**Consequence if unaddressed:** the developer builds the deep entrypoint, then discovers the lint,
then rewrites the facade — cheap, but it is exactly the "one question before starting" the altitude
contract exists to remove.
**Fix applied:** R5 rewritten to name the surviving option and to state the invariant (`app/**`
reaches `@respin/db` through the package root only) rather than the two candidate shapes.

---

### F-10 · The background-runner decision is owed *before slice 8 is planned*, not *by slice 8* — `severity: minor`

**Lens:** Decision starvation
**Evidence:** `respin-finish-master-plan.md:81` lists the runner decision as "Owed by: Slice 8".
`tech-spec.md:18` is more specific: the choice "is settled at **M4 entry**, where trend refresh first
genuinely needs a scheduler; **the M4 plan's dependency check must show a recorded decision before
planning it**."
**Consequence if unaddressed:** slice 8's phase plan gets written against an unchosen scheduler, and
the plan then selects the decision — the shape AC-66 already produced once, where a criterion chose
its own implementation.
**Fix applied:** the decision queue row now reads "before slice 8's phase plan is written (end of
slice 7)".

---

### F-11 · Four owed decisions are listed; eight exist — `severity: minor`

**Lens:** Decision starvation
**Evidence:** `respin-finish-master-plan.md:76-82` lists four. Missing, each with a written source:
downgrade semantics / `creator_profiles.state` (R-30 constraint 3, and F-2 makes it blocking); the
`editor` confirmation authority (register B-1 — the code has already taken it at
`with-workspace.ts:816-818` and `decisions.md` says nothing); `workspace_spend_monthly`
pseudonymisation (R-30 constraint 5, "re-taken in writing" with an owner on it); and whether Free
requires a card (PRD §7 open decision 4, which gates slice 6's free-tier minting posture).
**Consequence if unaddressed:** an engineering-unanswerable question surfaces mid-slice and the build
stalls or guesses.
**Fix applied:** Deliverable 4 replaces the table with eight rows, each carrying the default the code
is built under if the answer does not arrive.

---

### F-12 · Both written cards over-specify in the same two places — `severity: minor`

**Lens:** Over-specification
**Evidence:** `respin-finish-phase-1.md:23` (R3) offers "either a partial unique index, or the
workspace lock taken at entry" — a mechanism menu where the property is what matters.
`respin-finish-phase-2.md:47` (R12) names the index shape and its `WHERE` clause. `phase-1.md:63-77`
labels its file table `## Files` with no note that it is expected surface rather than a contract, and
`phase-2.md:66-77` does the same. Neither card has a `Left to the developer` section.
**Consequence if unaddressed:** the developer reads a file list as a specification and reports a
deviation as a defect, which is how a card starts getting reviewed instead of built.
**Fix applied:** R3 and R12 restated as invariants with their proof; both file tables relabelled
*expected surface — deviate and say why in the ledger*; a `Left to the developer` section added to
both cards.

---

### Lenses that found nothing

**Reachability.** Every one of the ten slices ends in a sentence a person walks in a browser, and
both written cards make that sentence the acceptance test (`phase-1.md:6`, `phase-2.md:6`). No slice
builds a package whose only caller is a test. This is the lens the plan was written to satisfy and
it satisfies it.

**Honesty (card copy).** No card promises a capability its slice does not build.
`phase-1.md:41` (R11) explicitly forbids it. The one B-6-shaped defect found is in shipped code, not
in a card — `app/(product)/billing-errors.ts:351` promises a results surface — and it is homed to
slice 3.

---

## What this review could not verify

1. **Whether the four Critical-Path gates would pass on slices 1 and 2 as amended.** No gate was run.
   Every finding here is a reading of plans against code, which is the weaker evidence — and this
   milestone's whole record is that reviewers find what the author's own pass misses.
2. **The AC-13 scan's current predicate** (`respin/tests/profile-cage.test.ts`) and **the three
   discriminating fixtures** (`packages/db/tests/brain-content.test.ts`). Both files were opened for
   targeted greps, not read. Tasks 24, 30 and 46 are carried as UNVERIFIED with named triggers, not
   as findings.
3. **Whether the pause AC is parameterised over `ProfileWriteCapabilities`** (task 10). The type is
   imported at `profile-scope.test.ts:52`; that is not proof the assertion iterates it.
4. **The 60–80 h estimate itself.** F-7 says the build plan's session budget is wrong; it does not
   say the hour estimates are right. Nothing in this repo has been measured against an hour figure,
   and slice 5's was demonstrably wrong before F-3 (it assumed an export module that does not exist),
   which is one data point against the other nine.
5. **Rounds 1–2 of the block register.** By the register's own caveat, 25 of those 32 blocks have no
   individual record. If one of them named something still open, this audit cannot see it.

---

## Line budget

Plan text added: **368 lines** — master plan +25, slice 1 +35, slice 2 +39, and a new 269-line stub
file covering nine slices (~25 lines each). That is 121 lines under the 489-line document this
process exists to avoid, and it now covers ten slices instead of one milestone.

Progress text added (registers, not plans, and not something a developer reads before building):
`respin-finish-open-items.md` 183 lines, this file 264, plus +20 to the codebase review and +21
appended to the block register.

No file under `respin/` was edited — no source, no schema, no migration, no test.
