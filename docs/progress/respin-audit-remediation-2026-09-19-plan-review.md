# Plan review — audit remediation, 2026-09-19 register

**Readiness: Not yet · Grade: D · The plan has the right shape everywhere (derive, then fix; measure first) but three tasks cannot be built from the text — two of them because they put code in `app/**` that the repo's own lint forbids from importing `@respin/modes` — and all three specialist gates returned BLOCK or NEEDS CHANGES on defects the plan text supports.**

> **Retry batch 3 (2026-09-21) — current verdict: Readiness: Almost · Grade: C · NOT READY** (compliance NEEDS CHANGES (High); tenancy NEEDS CHANGES (Medium); billing PASS; learning PASS). Batches 0–2 are history; the standing verdict is in § Retry batch 3.

**Gate:** `respin-audit-remediation-2026-09-19-plan` · **batch 0** (initial evaluation; retries are batches 1–2) · **plan gate ran lean (consolidated)**.

**Reviewer (this report):** slot 4, `plan-reviewer` (generalist, last) — dispatched by name; frontmatter `model: fable`, `effort: xhigh` as *requested*; the resolved runtime model/effort is unknown to me (not exposed). Read-only over the tree; this file is the one artefact written. No plan file, nothing under `respin/`, and no other progress file was edited; no mutation planted; no writing command run.

## Slots and dispatch

| Slot | Reviewer | Path(s) | Dispatch (requested; runtime unexposed) | Verdict |
|---|---|---|---|---|
| 1 | `respin-billing-reviewer` | Respin billing & credits (3, 4, 5, 6, 8, 9) — separate full gate | by name; frontmatter `model: fable`, `effort: xhigh` | **BLOCK** — 2 BLOCK / 9 CHANGE / 6 NOTE |
| 2 | `respin-tenancy-reviewer` | Respin brain tenancy (1, 4, 5, 6, 9) — separate full gate | by name; frontmatter `model: fable`, `effort: xhigh` | **BLOCK** — 1 BLOCK / 6 CHANGE / 6 NOTE |
| 3 | merged compliance + learning (lean) | Respin spin compliance (1, 2, 6, 8); Respin learning honesty (1, 2, 6) | `general-purpose`, dispatch `model: fable`, "think hard" | compliance **NEEDS CHANGES** (Almost / C); learning **NEEDS CHANGES** (Almost / B−) |
| 4 | `plan-reviewer` (this report) | plan integrity; Phase 7 zero-path coverage; §11 size; consolidation | by name; frontmatter `model: fable`, `effort: xhigh` | **NOT READY** (generalist) |

Verbatim slot reports: `respin-audit-remediation-2026-09-19/plan-gate/batch-0-billing.md`, `-tenancy.md`, `-merged.md`. Their verdicts are attached, not re-derived; every finding I cite from them I checked against the plan text and found supported (none challenged as unsupported).

## Frozen inputs — sha256 (first 8), re-measured by this reviewer before reading

| Hash | File | Match |
|---|---|---|
| `5f2b4014` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` (as dispatched; table row carries pre-reservation `f3cb7859`) | ✅ |
| `571f6670` | `…-phase-1.md` | ✅ |
| `f43789f4` | `…-phase-2.md` | ✅ |
| `f6447452` | `…-phase-3.md` | ✅ |
| `83133365` | `…-phase-4.md` | ✅ |
| `24f0700d` | `…-phase-5.md` | ✅ |
| `e410d0f2` | `…-phase-6.md` | ✅ |
| `28b6416b` | `…-phase-7.md` | ✅ |
| `d39a1431` | `…-phase-8.md` | ✅ |
| `47034be4` | `…-phase-9.md` | ✅ |
| `dfd6f30a` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` | ✅ |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` | ✅ |

Also measured (not in the reservation table): audit register `c307e6ae`, ledger `461444fa`, the three slot reports `d7174fed` / `afaf3686` / `548d676b`. No plan file changed since the freeze.

---

## Execution simulation

Walked as `respin-engineer` with only each phase file. Every path in all nine *Files to create / modify* tables was probed on disk (95 paths): every `M` row exists, every `N` row is absent — path closure holds. Line citations were spot-checked in Phases 1, 2, 3, 4, 7, 8 and 9 (see the ✅ rows). Where I could not complete a task from the text alone:

- ❌ **Phase 1, Task 5 (rows 11–16), P1-R1** — the disclosure helper is homed in `packages/modes/src/output.ts` "beside `outputTextUnits`" and "used by both live presenters and the projector", which are `app/(product)/studio/generation-outcome.tsx`, `app/(product)/trends/spin-panel.tsx`, `app/(product)/studio/projection.ts`. **`app/**` may not import `@respin/modes`** — `respin/eslint.config.mjs:801-820` records the denial as deliberate ("it stays denied… app/** reaches a generation through @respin/credits/app-server"), and no file under `app/` imports it today (grep: zero). Neither `packages/credits/src/app-server.ts` nor `generate.ts` is a Phase 1 row. The compliant presenter the plan cites as the template (`sample-spin/run.ts:363-372`) lives in `packages/credits`, which *can* import the modes root — that is where the substitution belongs. · Fix: home the substitution at the facade result boundary in `packages/credits` (the `GenerateResult` both presenters already consume, `trends/actions.ts:9-12`), add those rows, and let AC1's "zero readers under `app/**`" follow from the facade no longer carrying `guidance`; add `app/(product)/trends/spin-state.ts` (merged C-3's renamed carrier). Confidence: high.
- ❌ **Phase 2, Task 4 (row 17), P2-R6** — "`displayableSpin` derived from `outputTextUnits`" in `app/(product)/trends/actions.ts:27-49`: same denied import. `outputTextUnits` is not re-exported by `@respin/credits/app-server` or `@respin/db` (grep: zero). · Fix: derive the display-unit set inside the facade (`packages/credits`) and return it on the result; `displayableSpin` consumes the facade's field; add the facade row and a `tests/import-boundary.test.ts` fixture that the modes symbol stays unreachable from `app/**`. Confidence: high.
- ❌ **Phase 9, Task 2 (rows 4–5), P9-R4** — "a documented local-drill mode exists — loopback S3 is already permitted by `deletion-journal-s3.ts:77-80`". Permitted is not provided: `restore-verify.ts:64-70` throws unless bucket/region/environment are set, `docker-compose.yml` runs only `postgres:17-alpine`, and no row provides an S3-compatible loopback service or an alternative journal transport. Row 5's "accept the local-drill journal" names no object. · Fix: pick one and row it — a `minio` service in `docker-compose.yml` with a seeded bucket and the env block in `RUNBOOK.md`, **or** a filesystem journal behind the same `DeletionJournal` interface selected by a loopback endpoint — and state which of the drill's assertions the local mode runs (the edge row promises this and the task does not deliver it). Confidence: high.
- ❌ **Phase 5, Tasks 2–3 (rows 5–11), P5-R2/R3** — the tenancy BLOCK, confirmed against the tree: `with-workspace.ts` inner-joins `lifecycleState = 'active'` before any scope exists and every `(product)` route reaches the DB through `scopeForUser` → `withWorkspace`; Phase 5's table has no `with-workspace.ts`, `workspace-scope.ts` or `app/(product)/layout.tsx` row, so AC2–AC4 are unreachable from the listed files. (Found by slot 2.)
- ❌ **Phase 3, Task 2 (rows 11–12), P3-R3** — "per-window total bound": no config row, no number, no provenance; `packages/config/src/schema.ts` absent from the table. (Found by slot 1, BLOCK 2.) Also: P3-R2's ceiling is on the *assembled* prompt yet the task names only `studio-panel.tsx` and `assemble.ts`; slot 1's CHANGE that `assertUsable` sees the context, not the assembly, and that `inference.ts:799` never passes through it, means Task 2 as written cannot bound "both tenant paths".
- ❌ **Phase 8, Task 1 (row 3), P8-R1** — "`lock_timeout = 5000` on render transactions" is placed in `packages/db/src/client.ts`, which is pool construction (`:36-197`, no transaction helper); nothing in the text says which helper marks a transaction as "render". (Slot 1 CHANGE; sharpened in the pre-mortem below.)
- ❌ **Phase 5, Task 4, P5-R4** — `blocked → cancelled` has three guard sites (`TRANSITIONS`, `appendJournalTransitionInTx:585-590`, `validateWorkerTransitionInTx:3603`); the task names one. (Slot 2 CHANGE.)
- ❌ **Phase 6, Tasks 1–3 as read from the table** — rows 1, 3–7, 9–15 are marked `M` with no built/owed marker while the Status paragraph says Tasks 1–5 are built; only rows 2 and 8 say "built". Phase 1 marks its built rows `done`. An implementer reading the table alone re-does built work. · Fix: mark rows 1–8 and 12–15 `done (R-132, unreviewed)`. Confidence: high.
- ✅ **Phase 1, Tasks 1–4, 6–7** — executable from the text; `source-files.ts`, `claim-scan.ts`, `table-writers.test.ts:353/:1157`, `metrics.ts`, `create-auth.ts`, `rate-limit.test.ts` all present; the tenancy reviewer verified exactly one pre-existing raw-object log outside `app/`.
- ✅ **Phase 2, Tasks 1–3, 5** — executable; `traceability.test.ts` template cited; `hard-rules.ts:305,319,327` carry `[,;—–-]` and `claims.ts:600` carries `[^,;]` exactly as stated; the four `[check]` declaration sites and the two boundary constraints are stated with the allowlist precedent.
- ✅ **Phase 3, Tasks 1, 3–6** — executable; `worker/retention.ts:136` `retentionOldestOverdueMs`, `worker/health.ts:189/:253/:291` (`SafeWorkerEventInput`, `NUMBER_FIELDS`, `toSafeWorkerEvent`) as cited; `0062` ordinal and journal row named.
- ✅ **Phase 4, all five tasks** — executable at the row level; `trends-storage.ts:1018,1026,1033,1036` are the four bare `throw new Error` sites exactly as re-cited; `app/(product)/billing-errors.ts` exists; `_journal.json` and `0063` named.
- ✅ **Phase 5, Tasks 1, 5–7** — executable at the row level; `requesterUserId` column exists (`lifecycle-schema.ts:123`); `pendingDeletionsForScope` at `:928`; `TRANSITIONS` at `:202-212` confirms `blocked` lists no `cancelled`.
- ✅ **Phase 6, Tasks 4–5 owed halves** — rows 17–18 executable once the tenancy CHANGE (home the count in `results-ops.ts` behind `ProfileScope.mint`) is applied.
- ✅ **Phase 7, all five tasks** — executable; every number reproduces (see Mechanical consistency); the 11 `page.tsx` files enumerate exactly; `controls.css:30-36` and `globals.css:129-134` as cited; mojibake at `brain-view.tsx:518,626`; `.marquee-track` at `landing-base.css:145`; no `app/(marketing)/layout.tsx` exists (row 28 `N` correct).
- ✅ **Phase 8, Tasks 2–5** — executable at the row level; `frameworks/page.tsx:214` assigns the literal `"not_included"` as stated; `deletionExternalCommandKind` includes `stripe_subscription_reopen`, so the cascade's cancel path has a reversal command to name.
- ✅ **Phase 9, Tasks 1, 3–6** — executable; the three `drizzle-orm` specifiers are at `packages/db/package.json:26`, `credits:27`, `config:19` as stated; root `package.json` carries none; `worker/tests/main.test.ts` absent (row 9 `N` correct); `system_worker_health` is read by `system-spend.ts:307-311`, so row 11's "expose the read" has a seam.

**Simulation fidelity (§11):** the nine phase files total 1,321 lines. I walked every task and probed every path. Fidelity was lowest in **Phase 7 Task 5 (rows 17–29, thirteen unrelated one-attribute edits with ~40 line citations)** and **Phase 8 Task 3 (rows 13–24, the brand across seven files and a lint edge)** — there I verified existence and a sample of citations, not every line. That is the second §11 signal firing, recorded rather than rounded away.

## Pre-mortem

Assume every phase shipped as written and something failed in production. Likely causes, each mapped or flagged:

- ❌ **Phase 8 — `lock_timeout` leaks from a render into a money transaction.** Postgres `SET lock_timeout` without `LOCAL` persists on the pooled connection; the next webhook or debit on that connection aborts at 5 s with a lock error the money path was never designed to receive. P8-R1 says "render transactions set `lock_timeout`" and row 3 points at `client.ts`; nothing says `SET LOCAL`, nothing names the helper, and the edge row "set on render transactions only" is a promise with no mechanism. · Fix: `SET LOCAL lock_timeout = 5000` inside a named `withRenderTransaction` helper (slot 1's proposal), plus a test that the same pooled connection's next transaction reads the default. Confidence: high.
- ❌ **Phase 2 — hard `certainty` on every field refuses legitimate captions, and the refusal is debited.** Phase 6 P6-R3 states as product fact that "a refusal is debited"; Phase 2's edge row measures the false-fire rate over the generator's *synthetic* vocabulary only (merged C-5) and names no debit consequence and no real-corpus measurement. A false-fire increase is a direct creator charge with no receiving row. · Fix: an edge row naming the debit consequence and where in the pipeline the refusal fires (pre- or post-vendor); a measurement over stored generations or the pipeline fixtures before the field population is chosen. Confidence: medium-high.
- ❌ **Phase 3 — the input ceiling is on the assembled prompt, so a creator whose brain docs grow past it is refused on every run with no way forward.** The 2026-07-30 lesson ("fail closed, never without a way forward") is pinned to Phases 5 and 9 and bites here; the edge row covers only "legitimately pastes a long reference". · Fix: the typed refusal carries the component sizes and the ceiling; AC4 quotes the printed remedy; the headroom is measured against the largest *brain* assembly, not only the largest input. Confidence: medium.
- ❌ **Phase 9 — a scheduled audit run goes red on `main` and nobody sees it.** P9-R10 adds `schedule:`; no sentence names who receives a scheduled failure (no PR author exists). Deploy-side paging is correctly in T-24; CI-schedule routing is in neither. · Fix: one sentence in P9-R10 naming the notification route. Confidence: medium (Low severity).
- ❌ **Master — two phases edit the same file concurrently.** See Mechanical consistency (concurrency claim without a partition).
- ✅ **Phase 8 — the committed fold renders a stale number after a purchase** — absorbed at Phase 8 edge row 1 (settling indication); slot 1's rider that `/studio`'s cost sentence must not *decide* insufficiency from the committed fold stands as a CHANGE.
- ✅ **Phase 3 — the operator command settles a candidate whose workspace is paused / tombstoned / under-balance** — absorbed at slot 1 NOTE 1 (list the inherited refusals; AC2 quotes the paused case).
- ✅ **Phase 5 — identity-erasure cascade cancels a live Stripe subscription, then the creator cancels in grace** — `external_actions_pending` precedes `grace` (`deletion-lifecycle.ts:202-212`), so the Stripe action has run by the time cancel is offered; absorbed by the existing `stripe_subscription_reopen` command kind (`lifecycle-schema.ts:569-577`) and slot 1 NOTE 3's ask that the AC quote both money consequences. Phase 5 should name the reopen command in R-137.
- ✅ **Phase 4 — the DB trigger breaks the R-122 seven-year DELETE receiver when it is enabled** — absorbed at slot 1 CHANGE (migration comment re-decides the DELETE guard).
- ✅ **Phase 4 — locking the rollout writers deadlocks with `lockWorkspaceMembershipGraph`** — absorbed at Phase 4 edge row 3 (lock order stated at the line, matching `webhooks.ts:1017-1018`).
- ✅ **Phase 1 — widening `safe-log` to `packages/**` floods the phase with pre-existing hits** — absorbed at Phase 1 edge row 3 and the Least-confident line; slot 2 measured exactly one hit.
- ✅ **Phase 9 — the ORM bump changes emitted SQL under concurrency** — absorbed at Phase 9 edge rows 1–2 and the Least-confident split fallback; `drizzle-kit` not in the bump list surfaces at AC10 (slot 1 NOTE).
- ✅ **Phase 7 — `arrival="redirect"` steals focus on every in-place re-render** — absorbed at Phase 7 edge row 4 (default `"in-place"`, migration explicit); live-render behaviour is correctly out of scope.
- ✅ **Phase 1 — the outbound-HTTP shape false-fires on telemetry senders** — absorbed by merged C-2's measured producer list (a CHANGE, but the cause has a receiving row once applied).
- ✅ **Phase 3 — the dunning backfill cuts a live grace short** — absorbed at Phase 3 edge row 4; blast radius zero (no deploy).

## Mechanical consistency

- ❌ **Coverage parity — master:42 "Nothing in the register is unhomed" is false at the sub-item level.** Grep over all ten plan files for each returns nothing: item 41's second MEDIUM (Trends domain in three homes; four physical `provider.complete` sites, one outside `packages/`), item 41's third MEDIUM (pause's two stored truths, `pausedAt` vs `pause_periods`), item 41's AC-13 LOW; item 46's second MEDIUM (`connector-verified-closure.test.ts:34` cannot see an indirect writer — a learning-honesty tripwire); item 47's LOW "zero usable creator rules turns a paid Sample Spin success into a 503 after the vendor was billed" (a money-loss shape); round 2's three "also from that round" items (`quote_budget_exceeded` MEDIUM, `saturation.ts:11` MEDIUM-LOW, the verbatim/echo LOW). Two labels are also wrong: "9's LOW worker-loss items → 3" are item 47's LOWs (P3-R6), and item 47's `scan-journey-notes` LOW → Phase 1 (P1-R8) is not in the table. · Fix: home each (Phase 3 for the 503; Phase 2 for `quote_budget_exceeded`, saturation, echo and the closure scanner; Phase 8 or a Non-Goals entry with a ledger row for the two architecture MEDIUMs) or mark them dismissed with a reason; correct the two labels. Severity Medium-High (the items are Medium/Low; the false recorded claim is the plan's own Golden rule 1).
- ❌ **Concurrency claim without a partition — master:58.** "Phases 1, 3, 5 and 7… may run concurrently if the tree is partitioned" names no partition. Files in two or more phases (measured from the tables): 25, including `packages/db/src/app-server.ts` (5, 6, 8, 9), `app/(product)/studio/run-copy.ts` (1, 2, 4, 6), `app/(product)/trends/actions.ts` (1, 2, 8), `auth-form.tsx` and `recover-deletion/page.tsx` (5 and 7), `studio-panel.tsx` (3 and 7), `landing-sections.tsx` (6 and 7), `decisions.md` (six phases). The 2026-08-02 lesson (never two mutating agents on one checkout) is not among the master's pinned lessons. The migration-ordinal collision has a rule (Risks row 7); the decision-number collision (R-134… assigned per phase) has none. · Fix: serialise with a stated order, or list the shared files per pair and require one worktree per concurrent phase; add the decision-number renumber rule beside the migration one. Severity Medium.
- ❌ **Evidence pointer to a nonexistent file — Phase 1 AC5** names `tests/support/production-roots.ts`; the master (`:107`) and Phase 9 row 1 both say it was never created; disk confirms `MISS`. (Also slot 2 NOTE, merged C-6.) · Fix: `source-files.ts`, and state the `ROOT_DIRS` / `PRODUCTION_ROOTS` relation (merged C-6).
- ❌ **Verifiability — requirements with no acceptance criterion:** P1-R8 (regex escape + different-literal plant); P2-R10 (promotion-ops status filter); P2-R11 (trends registry ↔ enum); P3-R7 (auto-top-up depth bound + sink); P5-R7 (`isUseServerModule`, `holdsCreatorContent`); P7-R6's seven LOWs beyond mojibake (AC8 covers the mojibake only — `scope="col"`, landmarks, interview errors, the `<span>` label, the two disabled-reason links and `auth-form`'s busy pattern have no AC even though row 29 says it asserts some of them); P8-R6 (tech-spec §1); P9-R11's three LOW pins (AC8 names only the workflow items). · Fix: one AC per requirement, or name each in an existing AC's evidence line. Severity Medium.
- ❌ **§11 plan size — Phase 7 names 41 files in 29 rows** (row 15 is a glob over the 11 `page.tsx` files; row 27 bundles three admin views); **Phase 8 names 34 files in 32 rows**. Both exceed the 25-row target and the file count understates the row count's own signal. See the disposition section below.
- ❌ **Closure — Phase 5 P5-R3** says R-140 amends "the `respin-brain-tenancy` skill's T4 section"; `.claude/skills/respin-brain-tenancy/SKILL.md` exists and is not in Phase 5's table. · Fix: add the `repo:` row. Severity Low-Medium.
- ❌ **Closure — Phase 3 AC8** ("a failed activation send raises an alert") needs its own event code/detail in `worker/health.ts`'s allowlist by the phase's own P3-R1a argument; row 2's purpose names only the settlement key. · Fix: row 2 names both; AC8 quotes the emitted event. Severity Low.
- ❌ **Phase 2 AC8** (`TRACEABILITY_LIMIT_NOTE`'s universal claim) certifies no named requirement — R3-5's second half is only implicit in P2-R5. · Fix: name it in P2-R5. Severity Low.
- ❌ **Decisions table** — REG-29's ADR half ("record that `/studio`'s feedback copy is a dependent of the decision authorising the feedback→proposal source") has no row; R-143 covers the carve-out, not the copy dependency. · Fix: fold into R-143's subject. Severity Low.
- ❌ **Recorded claims that fail against the tree** (Golden rule 1, found by slot 3, confirmed as plan text): Phase 2 edge row 3 and Phase 8 P8-R2/row 12 claim `bundle.ts:218-222` hashes the enforcements Phase 2 changes — `HARD_CLAIM_FIELD_PREFIXES` and the guards are not hashed (merged C-4); `bundle.ts` is not a Phase 2 row.
- ❌ **Least-confident fallback that is not viable — Phase 4:109** offers "have the pseudonymiser insert a replacement row and delete nothing". On a balance-derived append-only ledger a replacement row with a new `workspace_id` either double-counts (original stays) or needs the DELETE it claims to avoid. · Fix: strike the fallback; slot 1's single trigger with the column-set pin is the viable form. Severity Low-Medium, confidence medium-high.
- ✅ **Number provenance — Phase 7 reproduces exactly** from `respin-tokens.css` today (`node -e` WCAG luminance, this review): `--text-4` light 5.61 / 5.05 / 4.60, dark 7.71 / 6.90 / 5.83; old `#6B7280` light 4.83 / 4.35 / 3.97, dark 3.53 / 3.16 / 2.67; `--border-strong` 4.64 / 4.17 light, 6.21 / 5.56 dark; `--text-3` on surface-3 5.81 / 7.27; eleven `page.tsx` under `(product)`; `prefers-reduced-motion` at `:96`. Phase 8's 5 000 ms is cited to the master's ledger row as owner-chosen. Phase 3's ceiling is the one uncited number and its Least-confident line says so (slot 1: wrong home, needs a config key).
- ✅ **Closure (paths)** — 95 table paths probed: every `M` present, every `N` absent. Owner `respin-engineer` exists in `.claude/agents/`.
- ✅ **Requirement IDs** — the master's coverage table and the nine phase headers reconcile for every homed item (P1-R1…R9 ↔ R3-1, R2-1, R2-2, 27, 29, 13, 14, 47-LOW, 16/17; P2 ↔ 45–47, R2-3, R3-2…R3-6; P3 ↔ 1, 2, 3, 9-part, D3, 47-LOWs; P4 ↔ 5–8, D11, D12; P5 ↔ 4, 10–12, 15, D1, D2, D14; P6 ↔ 28, 30, 31, D4–D6, D13; P7 ↔ 32–37; P8 ↔ 18, 19, 38, 40, 41, 39-doc; P9 ↔ 20-code, 23–26, 42–44, D7–D10).
- ✅ **Dependency table ↔ phase headers** — 2←1, 4←3, 6←1, 8←3, 9←1,3,4,5,8 match every header. (Missing edges are findings above: Phase 6 AC6 ← Phase 2 AC8, merged C-7.)
- ✅ **Reachability** — all nine present, non-empty, each naming an in-phase caller by row; Phase 5's runtime flag is stated as a toggle with a closed render (`account-view.tsx:45` confirmed). **Least confident** — all nine present; probes recorded below.
- ✅ **Deferral ledger** — every "later" in the phases has a row or a Non-Goals entry (automatic settlement, outbox, carve, seats/roles, live-render a11y, contact-support, connector, deploy-side T-23/T-24). Gap: merged L-5 (the marketing-claims generator, measured not closed) has no row.
- ✅ **Handoffs** — Phase 1 → 2/6/9 (`source-files.ts` exports named by symbol in Phase 9 row 1; `claim-scan.ts` interface named in P1-R4); Phase 3 → 4 (ordinal 0062 → 0063). Interfaces pinned and cited.
- ✅ **Phase 7 zero-path coverage (§10)** — Phase 7 states "Zero mapped Critical Paths… owes one independent generalist review in a separate context… Reserve the slot before the batch starts", and its DoD names it; master:71 repeats it. Carry merged's cross-phase note: Phase 7 row 13 edits Sample Spin panel copy under zero paths — say the marketing render scan covers it.

## Least-confident lines — probed

| Phase | Declared bet | Result |
|---|---|---|
| 1 | widening `safe-log` floods the phase | **Holds** — one pre-existing hit (slot 2); sharper risk is the root-list census (C-6) |
| 2 | false-fire rate of hard `certainty` on hooks | **Fails as posed** — the number is over synthetic vocabulary (C-5), the decision is pre-empted by R-142 (L-6), and the debit consequence is unnamed (slot 4) |
| 3 | the input-token number | **Fails as written** — compiled is the wrong home (slot 1); brain-overflow way-forward unnamed (slot 4) |
| 4 | column-scoped exemption in one trigger | **Holds with the pin** (slot 1); the stated fallback is not viable (slot 4) |
| 5 | `blocked → cancelled` vs unreachable-pre-grace | **Under-counts** — three guard sites (slot 2); the fallback names a surface with no rows |
| 6 | pinning every feature line without copying the page | **Holds for `PRICING[].lines[]`, fails for prose** (C-7); the tree already has a third pin kind the plan lacks (slot 1 BLOCK 1) |
| 7 | deriving the contrast population from CSS | **Holds** — fallback stated and viable; numbers reproduce (slot 4) |
| 8 | committed-fold fallback always cheap and present | **Holds on correctness** with riders (slot 1); `SET LOCAL` leak added (slot 4) |
| 9 | the ORM bump is clean | **Holds as checkable** — split fallback stated; `drizzle-kit` gap (slot 1) |

## Consolidated reviewer findings

Severity is normalised across the four slots (BLOCK = gate-blocking or unexecutable; HIGH/CHANGE = changes what will be built; MEDIUM; LOW; NOTE). Duplicates merged; the finder is named.

### BLOCK (7)
1. **Phase 1 Task 5 / rows 11–16 — helper in `@respin/modes`, consumers in `app/**`, import denied** (`eslint.config.mjs:801-820`). Slot 4. Conf. high.
2. **Phase 2 Task 4 / row 17 — `displayableSpin` cannot reach `outputTextUnits` from `app/**`.** Slot 4. Conf. high.
3. **Phase 9 Task 2 / rows 4–5 — local-drill mode has no S3 provider or alternative transport row.** Slot 4. Conf. high.
4. **Phase 5 P5-R2/R3, rows 5–11, AC2–AC4 — read-during-grace homed one fence below `withWorkspace`; AC2–AC4 unreachable from the listed files; T1 bypass risk.** Slot 2 (BLOCK); confirmed by slot 4 against `with-workspace.ts` and Phase 5's table. Conf. high.
5. **Phase 6 §Critical Paths / AC4 / DoD — no billing verdict in the phase's own text (master:71 says it joined); P6-R2/AC4 still specify the two-kind pin that certified the batch-5 BLOCK while the tree carries a third `fencedPin` kind.** Slot 1 (BLOCK 1). Conf. high.
6. **Phase 3 P3-R3, rows 11–12, AC5 — per-window total cost bound: no config row, no number, no provenance; pointed at the existing uncharged key it refuses paying creators.** Slot 1 (BLOCK 2). Conf. high on gap.
7. **Master:24-42 — "nothing unhomed" is false for eight ranked sub-items** (item 41 ×3, 46 ×1, 47 ×1, round-2 ×3) plus two mislabelled rows. Slot 4. Conf. high. *(Block-level because a plan that closes a register must name every obligation it declines.)*

### HIGH / CHANGE (20)
8. Phase 3 P3-R2 — ceiling must sit at the `provider.complete` chokepoint; `assertUsable` sees context, not assembly; `inference.ts:799` never passes through it; no `inference.ts`/`packages/llm` row. Slot 1.
9. Phase 3 P3-R2 / Least-confident — "compiled" is the wrong home for a REQ-G05 dial; config key with `.default()`; R-135 records headroom and key. Slot 1. *Least-confident probe: fails as written.*
10. Phase 3 P3-R4 — dunning writer/clearer population not enumerated (five sites); watermark-guarded clear; backfill's `graceDays` source; `stripe.test.ts:609` does not cover the new column (orchestrator-verified). Slot 1.
11. Phase 3 rows 13–15 — `dunning_started_at` is an uncensused column: `lifecycle-column-census.ts:58` must change in the same change; add the row and add brain tenancy to Phase 3's selection or record why not. Slot 2.
12. Phase 4 P4-R1 — the mutation scan misses raw SQL, the shape the pseudonymiser uses (`lifecycle-sql-port.ts:566-570`); `lifecycle-migration.test.ts:288,563,569` is a third mutating file; plant a raw-SQL specimen. Slot 1 (orchestrator-verified).
13. Phase 4 P4-R2 — `subscriptions` writer population is 11 modules; four unlocked (`customers.ts:105-130`, `deletion-commands.ts` in addition to the plan's two); AC3 needs an unknown-writer plant. Slot 1.
14. Phase 5 P5-R4 / AC5 — three guard sites for `blocked → cancelled`; AC5 must drive `cancelScopedDeletion` on live Postgres. Slot 2.
15. Phase 5 P5-R6 — the DB check `deletion_operations_blocked_resume_shape` is a second copy of the resume-target population; say whether `0064` is owed. Slot 2.
16. Phase 6 rows 17–18 — scoped result count homed against convention; put it in `results-ops.ts` behind `ProfileScope.mint` with a cross-profile zero witness (slot 2). **Merged with** learning L-1: only the zero branch is specified; four sites; two-branch canon entry (slot 3).
17. Phase 1 P1-R9 / AC9 — ∈-set assertion is necessary not sufficient (wildcard matcher; `:param` literals never match); handler-driven 429 per key absent. Slot 2.
18. Phase 8 P8-R3 and master table — Phase 8 edits the tenancy cage and a lint-fenced sole-minter: add brain tenancy (slot 2) **and** learning honesty (`PerformanceLearningEntitlement`, `results/actions.ts` — slot 3 L-2) to Phase 8's selection, or record why not.
19. Phase 8 P8-R1 / row 3 / AC2 — no mechanism distinguishes a render transaction; AC2 has no non-vacuity probe; `/studio`'s cost sentence must not decide insufficiency from a committed fold (slot 1); **plus** slot 4's `SET LOCAL` leak mechanism (pre-mortem).
20. Phase 8 P8-R5 / row 30 — Stripe customer key: `attempt` undefined, no test row, no concurrency statement. Slot 1.
21. Phase 8 Least-confident — the fallback must call `foldLedger` (never a second sum), emit the fold metric with `settling: true`, read rows and pauses in one snapshot; state both skipped writes. Slot 1. *Probe: holds on correctness; structural claim incomplete.*
22. Phase 2 P2-R8 (C-1, HIGH) — `[check]` population counted by named declaration (4) while the property is violated by any decision against the literal (11 sites, seven more measured). Slot 3.
23. Phase 1 P1-R2 (C-2) — the outbound-HTTP allowlist is "two ports" while the measured producer set is five `fetch`-shaped sites plus three SDK-borne; the `source_url` assertion names no mechanism. Slot 3.
24. Phase 1 P1-R1 (C-3) — `spin-state.ts:105`'s renamed carrier is invisible to the scan and is not a row; prefer a type-level closure. Slot 3. (Same rows as BLOCK 1; different defect.)
25. Phase 2 edge row 3 / Phase 8 row 12 (C-4) — the `prompt_bundle_version` claim is false for what Phase 2 changes; `bundle.ts` must be a Phase 2 row. Slot 3.
26. Phase 2 P2-R1 / AC2 (C-5) — pin the pre-fix hashes (`claims.ts 9f780df5`, `output.ts 228ab374`, `trends/actions.ts 326a490e`); the escape count cites hash, seed and denominator; the false-fire rate is labelled as over synthetic vocabulary (slot 3); **plus** slot 4's debit consequence (pre-mortem).
27. Phase 1 P1-R3 / AC5 (C-6) — at least five more tests carry their own root list; census with a ratchet; `ROOT_DIRS` lacks `ops`, `PRODUCTION_ROOTS` has it; AC5's path. Slot 3 + slot 2 NOTE + slot 4.

### MEDIUM (14)
28. Master:58 — concurrency claim without a partition; 25 shared files; no decision-number reconciliation rule. Slot 4.
29. Requirements without an AC (P1-R8, P2-R10, P2-R11, P3-R7, P5-R7, P7-R6's seven LOWs, P8-R6, P9-R11's pins). Slot 4.
30. Phase 6 file table — built rows not marked as built. Slot 4.
31. Phase 3 P3-R2 — assembled-prompt ceiling with no way forward for a large brain (pre-mortem). Slot 4.
32. Phase 6 P6-R3/R5 (C-7) — three prose rewrites unpinned (kill-test bound, `[check]` sentence, seven-modes sentence); missing Phase 6 ← Phase 2 edge for AC6. Slot 3.
33. Phase 2 P2-R9 / R-143 (L-3) — cite R-115 ¶2; pin the bar as code properties each with a witness; `repo: CLAUDE.md` rule 4 as a row. Slot 3.
34. Phase 2 P2-R10 (L-4) — two opposite remedies offered; choose one; outcome visible in proposal history. Slot 3.
35. Master ledger / Phase 6 objective (L-5) — the marketing-claims generator (measured 17/17 escape) has no owning row. Slot 3.
36. Phase 4:109 — the "replacement row" fallback is not viable on a balance-derived ledger. Slot 4.
37. Phase 5 P5-R3 — skill file `.claude/skills/respin-brain-tenancy/SKILL.md` not a row. Slot 4.
38. Phase 4 Least-confident — one trigger (`to_jsonb(OLD) - 'workspace_id'`), with a test pinning the exempt set to `SPLIT_TABLE_FIELD_SETS.credit_ledger`; migration comment re-decides the R-122 DELETE receiver. Slot 1. *Probe: holds with the pin.*
39. Phase 7 file count is 41 in 29 rows; Phase 8 34 in 32 — §11 signal understated. Slot 4.
40. Phase 3 AC8 — activation-send alert needs its own allowlist key in row 2. Slot 4.
41. Phase 2 P2-R2 vs master R-142 (L-6) — the decision row pre-decides the field population the generator is meant to choose; if enumerated, the field axis should be P2-R5's derived set. Slot 3.

### LOW (10)
42. Phase 2 P2-R11 (C-8) — type `intakePastedReference` to `TrendSourceName` so the vocabulary is consumed on the production path. Slot 3.
43. Phase 8 AC4 (C-9) — "asserted semantically" needs a vendor call; say structural or journey. Slot 3.
44. Phase 2 P2-R5 (C-10) — name the installed Zod introspection API for `line()` leaves (Golden rule 9). Slot 3.
45. `tests/changelog.test.ts:92-100` (L-7) — `some` → `every`; spelling list. Slot 3.
46. Phase 2 AC8 certifies no named requirement. Slot 4.
47. Decisions table — REG-29's copy-dependency ADR half absent. Slot 4.
48. Phase 9 P9-R10 — scheduled failure has no named notification route (pre-mortem). Slot 4.
49. Phase 3 AC9 / Phase 4 AC8 — "card quotes all four" over three items. Slot 4.
50. Phase 9 P9-R2 cites `docker-compose.yml:12`; row 3 corrects to `:15` — make the requirement match the row. Slot 4.
51. Phase 5 P5-R6 direction (slot 2 NOTE) — drop `requested` from `CANCELLABLE_STATES`; never add a journal-bypassing edge.

### NOTE (13, hold or advisory)
52. Slot 1 — settlement command lists inherited refusals; AC2 quotes the paused case.
53. Slot 1 — after `recovery_required`, say where the spend record's tokens persist for the later settlement.
54. Slot 1 — P5-R1's two money consequences (Stripe cancel; the exempted `credit_ledger` UPDATE) quoted in AC; slot 4 adds: name `stripe_subscription_reopen` in R-137.
55. Slot 1 — P6-R4 states the B6 property (`?plan=` validated against `PLAN_KEYS`; Free until Checkout).
56. Slot 1 — versions verified; `drizzle-kit` not in the bump list; AC10 catches a mismatch. *Phase 9 Least-confident probe: holds as checkable.*
57. Slot 1 — Phase 8 billing rows are 10 of 32; splitting Tasks 3–4 would let the full gate hold a slice in one round. Owner's disposition (§11 below).
58. Slot 2 — P5-R7 names the derivation source (`LIFECYCLE_REGISTRY`) and pins the derived set.
59. Slot 2 — `scripts/settle-candidate.ts` never prints candidate bytes.
60. Slot 2 — `/admin/worker-health/page.tsx` repeats `requireAdmin()` (`gate-completeness.test.ts:35,120`).
61. Slot 2 — codebase review §1 item 12 stopped one layer short of `withWorkspace`; amend.
62. Slot 3 — S1 intact; S7 untouched; `@respin/trends` zero deps (C-11); L1 sole emitter, L4 untouched, L9 config-pinned, P1-R5 correctly specified (L-8).
63. Slot 3 cross-phase — Phase 4 row 21 could select compliance; Phase 7 row 13 under zero paths edits a claim-scanned surface — say the marketing render scan covers it.
64. Slot 4 — Phase 7's numbers, page count, CSS citations and mojibake lines all reproduce; Phase 7's Least-confident fallback (worst surface per token) is viable. *Probe: holds.*

**Totals:** 7 BLOCK · 20 HIGH/CHANGE · 14 MEDIUM · 10 LOW · 13 NOTE = **64 findings** after deduplication. Before merge the slots returned: slot 1 2 BLOCK / 9 CHANGE / 6 NOTE; slot 2 1 BLOCK / 6 CHANGE / 6 NOTE; slot 3 1 HIGH + 12 MEDIUM + 5 LOW + 2 NOTE across both paths; slot 4 contributed 4 BLOCK, 3 HIGH-class (folded into 19, 26, 27), 9 MEDIUM, 6 LOW, 1 NOTE.

## §11 plan-size finding

Phases **7 (29 rows, 41 files)** and **8 (32 rows, 34 files)** exceed the 25-row authoring target of `.claude/gate-rules.md` §11; the second §11 signal also fired — this reviewer's simulation fidelity was lowest on Phase 7 Task 5 and Phase 8 Task 3 (stated above rather than bluffed). Per §11 the plan must take **one of two dispositions, recorded in the master's Plan review log**:

1. **Split** — Phase 7: Task 5 (rows 17–29, the `/settings/account`, `/trends`, mojibake and seven LOW items) into its own phase; Phase 8: Tasks 3–4 (rows 13–29, the entitlement brand and the autopsy-bounds home) into its own phase, which also lets the billing full gate review the lock/fold slice (rows 1–7, 30–32) in one round (slot 1 NOTE). Each new phase inherits its parent's gate selection and needs its own Reachability, Least-confident and ledger rows.
2. **Owner records accepted risk** of reaching the round budget on those two gates. Acceptance is a warning disposition only — it **never pre-authorises retry batch 3**; §3's explicit go-ahead is still requested at that moment if the budget is exhausted.

## Verdict

**NOT READY.**

Ordered fix list (each line closes the most findings per edit):

1. **Move the two `app/**`-side derivations into the `packages/credits` facade** — the disclosure substitution (Phase 1 Task 5) and `displayableSpin`'s unit derivation (Phase 2 Task 4) — add the facade rows and `spin-state.ts`, and make the reader-population test cover both spellings (closes BLOCK 1, 2; finding 24; and gives 22's `[check]` census the same home pattern).
2. **Re-home Phase 5's read-during-grace at `withWorkspace` as a non-writable scope grade** on the `VerifiedWorkspaceId` brand with an `as unknown as` runtime probe; add `with-workspace.ts`, `workspace-scope.ts`, `app/(product)/layout.tsx` and the brain-history reader; enumerate the three `blocked → cancelled` guard sites; decide `0064` (closes BLOCK 4, findings 14, 15).
3. **Give every money number a config home and a population**: `generation.maxBillableCostMicroUsdPerWindow` with arithmetic and a not-refused AC; the input ceiling as a config key at the `provider.complete` chokepoint with a way-forward refusal; the five dunning sites and the census row; `withRenderTransaction` with `SET LOCAL lock_timeout` and a leak test; the Stripe `attempt` definition (closes BLOCK 6, findings 8–11, 19, 20, 31).
4. **Bring Phase 6 up to the tree**: add the billing row and "four verdicts"; three pin kinds including fenced capabilities with a hedge plant; pin the three prose rewrites; two-branch no-results sentence homed in `results-ops.ts`; mark built rows `done` (closes BLOCK 5, findings 16, 30, 32).
5. **Fix the master's ledgers**: home or dismiss the eight unhomed sub-items and relabel the two rows; replace the concurrency sentence with an order or a per-pair shared-file list plus the decision-number rule; add a deferral row for the marketing-claims generator; record the §11 disposition (closes BLOCK 7, findings 28, 35, 39).
6. **Re-verify the two false recorded claims and the dead pointer** — `bundle.ts` hashing (add the row and the three probe lines), Phase 1 AC5's path, and the Phase 4 fallback sentence — in the same edit that records them (closes 25, 27, 36).
7. **Give Phase 9's local drill a provider** (MinIO service or filesystem journal) and state which assertions run in local mode (closes BLOCK 3).
8. One AC per AC-less requirement; the eleven `[check]` sites; the measured outbound-HTTP allowlist; the pre-fix hashes for the escape count; Phase 8's two added path selections; the remaining LOW/NOTE rows as listed.

Plan-shaped severity test (gate-rules §9 row 4): BLOCK 1–7 and findings 8–27 change **what will be built** and re-run their reviewer on retry batch 1; the MEDIUM/LOW items under 28–51 that change only how the plan reads may be fixed, batched and logged without re-review, except 28, 31, 36 and 39, which change what will be built or how it is dispatched.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Retry batch 1

**Readiness: Not yet · Grade: D · Every one of batch 0's 64 findings was applied, but the repairs recur the same defect one layer further in — populations enumerated one producer, one spelling or one hop short — and three repairs mandate a wrong behaviour in their own text (a rewrite refused after the draft was paid; a "no free-text" disclosure type that keeps a model-authored member; a sole-minter fence that leaves sixteen test files with no way to mint).**

**Gate:** `respin-audit-remediation-2026-09-19-plan` · **retry batch 1** (first of two permitted retries; 8 evaluations consumed on this gate after this batch) · **plan gate ran lean (consolidated)**.

**Reviewer (this section):** slot 8, `plan-reviewer` (generalist, last) — dispatched by name; frontmatter `model: fable`, `effort: xhigh` as *requested*; effective runtime model/effort unknown (not exposed). Read-only over the tree; this file is the one artefact written (this section appended; the batch-0 text above is untouched except for the one pointer line under its headline). No plan file, nothing under `respin/`, no other progress file edited; no mutation planted; only reads, `sha256sum`, `git ls-files --eol`, `git log`/`git status` and `grep`/`sed` were run.

### Slots and dispatch (batch 1)

| Slot | Reviewer | Path(s) | Dispatch (requested; runtime unexposed) | Verdict |
|---|---|---|---|---|
| 5 | `respin-billing-reviewer` | Respin billing & credits (3, 4, 5, 6, 8, 9, 11) — separate full gate | by name; frontmatter `model: fable`, `effort: xhigh` | **BLOCK** — 1 BLOCK / 6 CHANGE / 5 NOTE; all 17 batch-0 items closed |
| 6 | `respin-tenancy-reviewer` | Respin brain tenancy (1, 3, 4, 5, 6, 8, 9, 11) — separate full gate | by name; frontmatter `model: fable`, `effort: xhigh` | **BLOCK** — 1 BLOCK / 4 CHANGE / 4 NOTE; all 13 batch-0 items closed |
| 7 | merged compliance + learning (lean) | Respin spin compliance (1, 2, 6, 8, 11); Respin learning honesty (1, 2, 6, 11) | `general-purpose`, dispatch `model: fable`, "think hard" | compliance **NEEDS CHANGES** (Almost / B−: 0/4/2/3); learning **NEEDS CHANGES** (Almost / B: 0/2/2/2); L-7 not applied |
| 8 | `plan-reviewer` (this section) | plan integrity; Phases 7 and 10 zero-path coverage; §11 dispositions; §5; consolidates 5–7 | by name; frontmatter `model: fable`, `effort: xhigh` | **NOT READY** (generalist) |

Verbatim slot reports: `respin-audit-remediation-2026-09-19/plan-gate/batch-1-billing.md`, `-tenancy.md`, `-merged.md`. Every finding I cite from them was checked against the plan text and the tree; **none is unsupported** — the ones I could reach in the tree are marked *verified by slot 8* below (the rewrite re-embed at `assemble.ts:818-850`; the `llm` object default at `schema.ts:597-598`; the accessor guards at `with-workspace.ts:632-674/:786-796/:2701-2713` and `assertScoped:574-584`; `pendingDeletionsForScope:936`; the `learn` stem at `forbidden-claims.ts:45`; `promotion-ops.ts:530-536`; four of the seven unlisted root walkers; the `trustWorkspaceId` lift shape at `eslint.config.mjs:960-1000`).

### Frozen inputs — sha256 (first 8), re-measured by this reviewer before reading

| Hash | File | Match |
|---|---|---|
| `a9514d90` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` (as dispatched; table row carries pre-reservation `48a15f4c`) | ✅ |
| `1c2169da` | `…-phase-1.md` | ✅ |
| `dfa89e78` | `…-phase-2.md` | ✅ |
| `a2a5e538` | `…-phase-3.md` | ✅ |
| `64148883` | `…-phase-4.md` | ✅ |
| `8673012d` | `…-phase-5.md` | ✅ |
| `7770d985` | `…-phase-6.md` | ✅ |
| `d226ba35` | `…-phase-7.md` | ✅ |
| `88c04c6d` | `…-phase-8.md` | ✅ |
| `0689ddfb` | `…-phase-9.md` | ✅ |
| `4e9247c9` | `…-phase-10.md` | ✅ |
| `dc2f7aed` | `…-phase-11.md` | ✅ |
| `6bde50e8` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` | ✅ |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` | ✅ |

Also measured (not in the reservation table): audit register `c307e6ae`, ledger `3e13e2c2` (as read; it has grown since the reservation by the slot 5–7 entries, which is expected). No plan file changed since the freeze.

---

### Movement on batch-0 findings (64)

Locations are the plan file and section as repaired. *Closed* = applied as the finding asked; *closed → successor* = applied, and the repair exposed or introduced the next defect (the batch-1 finding number follows); *open* = not applied.

| # (batch 0) | Disposition | Location of the repair |
|---|---|---|
| 1 helper in `@respin/modes` | closed → successor **B1-3** (the `platform` member) | phase-1 P1-R1 :33–34, rows 14–25 |
| 2 `displayableSpin` import | closed | phase-2 P2-R6 :44, rows 16, 23 |
| 3 local drill provider | closed → successor **B1-22** (seeding prerequisites) | phase-9 P9-R4 :32, rows 3–5, AC3 |
| 4 read grade one fence too deep | closed as written → successor **B1-2** (tenancy BLOCK) | phase-5 P5-R3 :33–37, rows 9–17 |
| 5 Phase 6 billing row / three pin kinds | closed | phase-6 table :20, P6-R2 :35–39, AC4–AC5 |
| 6 per-window total: config row/number | closed → successor **B1-10** (derivation shape) | phase-3 P3-R3 :36–39, row 8 |
| 7 "nothing unhomed" | closed | master :43–58 |
| 8 chokepoint ceiling | closed → successor **B1-1** (rewrite refused after paid draft) | phase-3 P3-R2 :32–34 |
| 9 config key, not compiled | closed → successor **B1-6** (`llm` object default) | phase-3 :32, row 8 |
| 10 dunning population / backfill / replay | closed → successor **B1-9** (episode rule at re-open; newer `active`) | phase-3 P3-R4 :41–43, row 17 |
| 11 census row + tenancy selection | closed | phase-3 row 21, AC11, table :21 |
| 12 raw-SQL mutation shape | closed | phase-4 P4-R1 :26–27, row 3, AC2 |
| 13 mirror-writer population | closed → successor **B1-21** (`.update(schema.subscriptions)` spelling) | phase-4 P4-R2 :28–33, rows 23–25 |
| 14 three `blocked → cancelled` guards | closed | phase-5 P5-R4 :40, AC5, row 22 |
| 15 `0064` decided | closed (none owed) | phase-5 P5-R6 :45 |
| 16 scoped count in `results-ops`; two branches | closed → successors **B1-5** (site-2 renderer), **B1-14** (accessor rows), **B1-19** (wording) | phase-6 P6-R6 :43–49, rows 17–25 |
| 17 wildcard keys / handler 429 | closed | phase-1 P1-R9 :58, AC9 |
| 18 Phase 8 tenancy + learning selection | closed (moved to Phase 11 with the brand) | phase-11 table :16–23; phase-8 :26 |
| 19 `withRenderTransaction` / `SET LOCAL` / no insufficiency | closed | phase-8 P8-R1 :32–34, rows 3, 10, AC2 |
| 20 Stripe `attempt` / test / concurrency | closed | phase-8 P8-R5 :39, rows 16–17, AC6 |
| 21 fold riders | closed | phase-8 :31 (i–iv), AC8 |
| 22 eleven `[check]` sites | closed → residual **B1-26** (LOW) | phase-2 P2-R8 :46, rows 8–20 |
| 23 measured outbound allowlist | closed → residual **B1-41** (NOTE) | phase-1 P1-R2 :35–42 |
| 24 `spin-state.ts` carrier | closed → successor **B1-17** (destructure reads) | phase-1 :34, row 18 |
| 25 `bundle.ts` row | closed | phase-2 rows 6–7, edge :112 |
| 26 pre-fix hashes + debit consequence | closed | phase-2 P2-R1 :31–40, edge :111 |
| 27 root census | closed → successor **B1-16** (13 walkers, not 6) | phase-1 P1-R3(b) :43, row 3, AC10 |
| 28 concurrency / decision-number rule | closed | master :78 |
| 29 AC-less requirements | closed | every phase's requirement→AC line; P7-R6 → phase-10 AC1–AC7 |
| 30 Phase 6 built rows | closed | phase-6 table (`done (R-132, unreviewed)`) |
| 31 brain-overflow way forward | closed → successor **B1-8** (wrapper cannot name the component) | phase-3 :35, row 23 |
| 32 three prose pins / Phase 6 ← 2 edge | closed | phase-6 :3, P6-R3/R5, row 1, AC6 |
| 33 R-143 cites R-115 ¶2 | closed | phase-2 P2-R9 :47; master :145 |
| 34 P2-R10 one remedy | closed → successor **B1-20** (reopens terminal rows) | phase-2 :48 |
| 35 marketing-generator ledger row | closed | master :167 |
| 36 Phase 4 fallback struck | closed | phase-4 :124 |
| 37 skill row | closed | phase-5 row 28 |
| 38 trigger exempt-set pin | closed | phase-4 :25, AC9 |
| 39 §11 sizes | closed (split) | phases 10, 11; master :217 |
| 40 activation alert code | closed | phase-3 P3-R6 :46, row 2, AC8 |
| 41 R-142 pre-decides | closed | master :144; phase-2 P2-R2 |
| 42 P2-R11 typing | closed (alternative, justified) → residual **B1-27** | phase-2 :49(a) |
| 43 AC4 structural | closed | phase-8 AC4 |
| 44 Zod API named | closed | phase-2 P2-R5 :43 |
| 45 L-7 `.some` → `.every` | **open** — not applied (**B1-25**) | phase-6 P6-R7/AC12 |
| 46 AC8 names P2-R5 | closed | phase-2 :43, AC8 |
| 47 REG-29 in R-143 | closed | master :145 |
| 48 schedule failure route | closed | phase-9 P9-R10 :43, AC11 |
| 49 "all four over three" | partial — phase-4 AC8 fixed; phase-3 AC9 now reads "all five" over four clauses (**B1-31**) | phase-3 AC9 |
| 50 P9-R2 `:12` vs `:15` | closed | phase-9 :30 |
| 51 `requested` dropped | closed | phase-5 P5-R6 :45 |
| 52–64 NOTEs | 52, 53, 54, 55, 57, 59, 60, 61, 62, 63, 64 closed / hold; 56 closed → **B1-32** (the `peerDependencies` wording is wrong); 58 closed → successor **B1-13** (the derivation predicate does not reproduce the set) | as cited by each slot |

**Movement totals:** 62 closed (14 of them with a successor defect in batch 1), 1 open (45 / L-7), 1 partial (49). No batch-0 finding regressed to its original state; the regressions are all *successors* — the repair applied and the next layer in was wrong.

---

### Execution simulation (re-run for every task the repairs changed, plus Phases 10 and 11 in full)

Walked as `respin-engineer` with only each phase file. Every path in the eleven *Files to create / modify* tables was probed (the two new phases' 38 rows in full; every `N` row absent on disk — `presented-output.ts`, `bounded-provider.ts`, `render-transaction.ts`, `settle-candidate.ts`, `a11y-wiring.test.tsx`, `token-contrast.test.ts`, `app/(marketing)/layout.tsx`, `worker/tests/main.test.ts`, `customers.test.ts`, `sample-spin-fixture.test.ts`, `ledger-mutation-guard.docker.test.ts`, `balance-contention.docker.test.ts`, `provider-complete-sites.test.ts`, `disclosure-presenters.test.ts`, `claims-generative.test.ts`, `runbook-counts.test.ts` — as they should be).

- ❌ **Phase 1, Task 5 (rows 14–25), P1-R1** — buildable, but builds the wrong type. `PresentedDisclosure = { kind; platform: string }` with `presentedDisclosure(output)` reading `output.disclosure.platform` — a model `line()` (`output.ts:118-121`; unit `/disclosure/platform` at `:235`; rendered today as `<strong>{doc.disclosure.platform}:</strong>` at `generation-outcome.tsx:391`). R-121 (`decisions.md:1628`) says the platform is closed request data ("generation requests accept a closed `PlatformId`"); the compliant template the plan names carries **no platform at all** (`sample-spin/run.ts:158` type, `:382` value: `{ kind: "policy_check_required" }`), so the edge row's "keeps the platform … exactly as the sample-spin presenter does" (:125) is a recorded claim that fails against the file it names, and AC1's "typecheck refuses a render of a guidance string" holds while `<p>{doc.disclosure.platform}</p>` still typechecks. · Fix: `PresentedDisclosure = Readonly<{ kind: "policy_check_required" }>` (kind only, matching the template) — or, if the studio must show the platform, source it from the **request's** `context.platform` at the facade result boundary, never from `output.disclosure`; correct the edge row; AC1 plants a `platform` render too. Confidence: high on the defect; 0.7 that it is BLOCK-grade (rated HIGH below).
- ❌ **Phase 1, Task 5, row 16** — `sample-spin/run.ts:372-382` "consumes the same helper": `packages/credits/tests/sample-spin-spend.test.ts:171` pins `toEqual({ kind: "policy_check_required" })` and `run.ts:158` types the field without `platform`; both change if the helper's shape does, neither is a row. Follows from the finding above (kind-only closes it for free).
- ❌ **Phase 3, Task 2 (rows 8–16, 23, 28, 33), P3-R2/AC4** — the billing BLOCK, verified: `assembleRewritePrompt` (`assemble.ts:818-850`) re-embeds the whole first draft after `contextBlock`, and `pipeline.ts:184-192` calls it only after draft 1 returned; a `byteLength(system+prompt)` ceiling at `provider.complete` refuses the rewrite of any admitted draft prompt over roughly half the ceiling — after the vendor billed the draft. AC4 mandates it ("first pass **and** rewrite"). Also row 8 lists the `generation` object-level default (`:463`) and not the `llm` one (`schema.ts:597-598` — verified `.strict().default({ models: … })`), so `llm.maxInputTokens` is `undefined` on a stored document without `llm` and `bytes > undefined` is `false`.
- ❌ **Phase 5, Task 3 (rows 9–17), P5-R3** — the tenancy BLOCK, verified: every accessor on both scope classes is wrapped by `lifecycleGuardedMethods` (`with-workspace.ts:632-674`) whose guards (`:786-796`, `:2701-2713`) re-run `assertWorkspaceLifecycleAccess` → the `lifecycleState = 'active'` join the plan holds unchanged (`membership-lifecycle.ts:142-148`), so AC4's two 200s are unreachable from the listed rows; `pendingDeletionsForScope` calls `assertScoped` (`deletion-lifecycle.ts:936`), which admits only `profileCage || workspaceCage` (`with-workspace.ts:574-584`), and the plan says it must accept the read grade without saying how — the one-line green (widen `assertScoped`) admits the read grade to every `assertScoped`-only writer.
- ❌ **Phase 6, Task 4 (rows 17–25), P6-R6 / AC9** — site 1 (`NO_RESULTS_BASIS`) renders at `studio-panel.tsx:225` and site 3 at `first-ideas-panel.tsx:80`, as the rows say; **site 2 does not**: `claimFamilyNote`'s performance branch (`run-copy.ts:541-544`) is rendered per flagged claim at `generation-outcome.tsx:199`, whose hosts are `studio-panel.tsx:426` and `onboarding/first-ideas/first-ideas-result.tsx:78` — `generation-outcome.tsx` and `first-ideas-result.tsx` are not rows, and the branch is a pure `family → string` function with no count in reach. AC9 ("none of the four sites carries an unconditional 'none logged' claim") cannot be met for site 2 from rows 20–23. · Fix: reword site 2 count-independently, exactly as P2-R7 does for site 4 (the cheaper, truer form — a per-claim note has no business carrying a count), and say so; or add both files as rows and thread the count. Confidence: high.
- ❌ **Phase 6, Task 4, AC10** — "a planted unscoped `select count(*) from results` under the production roots is red under the existing scope scans" names no scan and I found none: `profile-scope.test.ts:1164-1236` pins accessor *names*, `profile-cage.test.ts` scans scope-typed *signatures*, `table-writers.test.ts` scans *writers*. A new function with a bare `db.select().from(results)` and no scope parameter is invisible to all three. · Fix: name the scan that would catch it (extend one) or drop the parenthetical and rest on the cross-profile witness. Golden rule 1 — a recorded claim is verified in the same action that records it.
- ❌ **Phase 11, Task 3 (rows 1–12, 21), P11-R1 / AC1** — the sole-minter fence as written ("the only file outside `with-workspace.ts` that may import `mintEntitlement`"; row 11's scan "no file outside `mode-access.ts` imports `mintEntitlement`"; AC1 "`import { mintEntitlement }` outside `mode-access.ts` fails lint") leaves every test that hands a literal to one of the three seams with **no sanctioned way to mint** — measured: `packages/db/tests/{frameworks (35 sites), trends-storage (14), promotion-ops-adversarial (22), promotion-ops, results-schema-write, promotion-concurrency.docker, pasted-reference, promotion-legacy}.test.ts`, `packages/credits/tests/{performance-learning (14), isolation}.test.ts`, `tests/{framework-ui, results-log-action, results-page-wiring, results-entry, trends-page, trends-actions}.test.*` — sixteen files, and `packages/db/tests` cannot import `@respin/credits` (cycle). The precedent the plan copies already answers this and the plan does not carry it: the `trustWorkspaceId` fence ignores `packages/*/tests/**` (`eslint.config.mjs:963`) and the lift block names them (`:992`). Also `packages/db/src/results-ops.ts:46-55` passes a `PerformanceLearningEntitlement` through to `caps.recordResult` — a production pass-through the seam list does not name. · Fix: state the test lift (tests may import the mint; the seam scan exempts `**/tests/**`), list the sixteen files as rows or provide one test-side helper, add `results-ops.ts` to the seam list; and take slot 6's two-block fence (one name per block) so the lift for `mode-access.ts` does not also grant it `trustWorkspaceId`. Confidence: high.
- ❌ **Phase 9, Task 2 (rows 2–5), P9-R4 / AC3** — the MinIO provider closes batch-0 BLOCK 3 (`restore-verify.ts:124-130` honours `RESPIN_DELETION_JOURNAL_ENDPOINT`; `deletion-journal-s3.ts:77-81` admits loopback; `docker-compose.yml:15` is the count line — all verified). The remaining gap is the **seeding step**: "the runbook's drill section seeds one local deletion request first" — a deletion request cannot be made while `RESPIN_DELETION_REQUEST_SCOPES` is unset (Phase 5 :137; `account-view.tsx:45` renders the controls closed), the *writer* side needs the same bucket/region/environment/endpoint env on the app **and** the worker (`deletion-journal-compose.ts:60-84`), and the verifier passes no `credentials` (`restore-verify.ts:124-130`; `createS3JournalClient` accepts them but is not given them), so the MinIO keys must be `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in the shell — none of the three is named. · Fix: the drill section's env block names the scopes flag, the writer-side env for both processes and the two AWS variable names; `forcePathStyle` is unnecessary while the endpoint is the IP form (say so — `localhost` would break virtual-host addressing). Confidence: high on the gap.
- ❌ **Phase 4, Task 2 (rows 8–12, 23–25), P4-R2 / AC3** — the population is right (11 writers; the four unlocked confirmed by grep: `deletion-commands`, `customers`, `tier-checkout-rollout`, `auto-topup-rollout` carry zero `takeWorkspaceLock`), but by the wrong predicate: `deletion-commands.ts:192` is `.update(schema.subscriptions)` — the same verb under a namespace — and the plan classes it as "two more write the table by other verbs". A derivation written as `.update(subscriptions)` misses it; the plan does not state its predicate. · Fix: the derivation names its predicate (builder with or without a namespace prefix, plus raw `UPDATE/INSERT/DELETE … subscriptions`) and AC3's second plant uses the namespaced spelling. Confidence: high.
- ✅ **Phase 2, Task 4 (rows 16, 21–25)** — executable; `presentedTextUnits` (Phase 1 row 14) = `outputTextUnits` minus `/disclosure/*` and `/whyThisPerforms/weakestPoint` (`run.ts:376`), `displayableSpin` reads `weakestPoint` directly (`actions.ts:46`), the exclusion list at `:30-33` is as cited, `output.ts:236` is the exempt reader.
- ✅ **Phase 2, Tasks 1–3, 5** — executable; `bundle.ts:85,111-123` as cited and neither `HARD_CLAIM_FIELD_PREFIXES` nor `CLAIM_CONTEXT_GUARDS` appears in the file; `claims.ts:656-658` carries "no result of yours has been logged"; `promotion-ops.ts:257-268` as cited; `check-marker.test.ts:4-10` records the llm/db pair; `eslint.config.mjs:317` is the `PLACEHOLDER_ABSENCE` precedent.
- ✅ **Phase 3, Tasks 1, 3–7** — executable at the row level; `generate.ts:317-320` (`post_call_debit`, `paused`), `:1343-1350` (mode gate not re-run), `:577-582`, `generation-recovery.ts:39,169`; the four `createAnthropicProvider` sites (`app-server.ts:548,593,780`, `production.ts:152`) and the four `provider.complete(` sites (`generate.ts:1197`, `inference.ts:799`, `run.ts:295`, `autopsy-vendor.ts:170`) reproduce exactly; `fixture.ts:262`, `usableCreatorRules` at `modes/index.ts:164` and `kill-test.ts:109-113`, `system-spend.ts:701-704`, `pipeline.ts:317-324`, `route.ts:118` all as cited.
- ✅ **Phase 4, Tasks 1, 3–5** — executable; `customers.ts:129,131`, `tier-checkout-rollout.ts:203-205`, `auto-topup-rollout.ts:191/207/253/475/511`, `deletion-external-commands.ts:414` as cited.
- ✅ **Phase 5, Tasks 1–2, 4–7** — executable at the row level; `layout.tsx:20-33` confirms the rail's `null` comes from the existing catch around `withWorkspace` (the layout never holds a read-grade scope — row 14 says "for a read-grade scope"; what happens is that the write-grade refusal is caught), so the three `readScopeForUser` pages are not fenced by the layout. Phase 8's later migration of `layout.tsx:33` to `getDisplayBalance` lives inside the same try, so the handoff survives.
- ✅ **Phase 7, all four tasks** — executable; `FocusOnMount` importers are exactly `brain-view`, `interview-view`, `onboarding-view`; the five `Banner` sites reproduce (`billing-view:283`, `usage-view:438-441`, `studio-view:60`, `first-ideas-view:48-51`, `account-view:71-72` with no role); `sample-spin-panel.tsx:120-126`, `controls.css:30-36`, `landing-base.css:145-150`, `MarqueeTags` at `:28`; eleven `page.tsx` under `(product)`.
- ✅ **Phase 8, Tasks 1–2, 5** — executable; the five `respinCredits.getBalance(` readers are exactly `layout:33`, `first-ideas/page:182`, `onboarding/page:259`, `studio/page:260`, `usage/page:63`; `balance.ts:32-44/:62/:70/:109-112/:259-264`, `clock.ts:67-76`, `fold.ts:255-257`, `app-server.ts:480/:637`, `run-copy.ts:137`, `studio/page.tsx:258-262` all as cited.
- ✅ **Phase 9, Tasks 1, 3–6** — unchanged since batch 0 and still executable; `todos.md` is at T-22, `decisions.md` at R-133, migrations at `0061` — the plan's `T-23/T-24`, `R-134…`, `0062/0063` are the next free ordinals.
- ✅ **Phase 10, all four tasks** — executable from the text alone; every line citation reproduces (`account-view.tsx:131,137`; `track-niche-panel.tsx:69,88,110`; `trends-view.tsx:123,332,179-185`; `trends/page.tsx:347-360`; `brain-view.tsx:518,626` both carry the `â€¦` bytes; `auth-form.tsx:131,139`; `recover-deletion/page.tsx:49`; `studio-panel.tsx:286`; `submit-button.tsx:64-71`); the five `<table`-bearing files under `app/` are exactly the five named and zero `<th>` carries `scope`; `app/(marketing)/layout.tsx` is absent.
- ✅ **Phase 11, Task 4 (rows 2, 10, 13–20)** — executable; `frameworks.ts:171/:1354-1356`, `trends-storage.ts:53/:132/:149-151/:785/:812`, `with-workspace.ts:246/:290/:509/:842/:3294-3300`, `mode-access.ts:156/:241/:294/:310`, `app-server.ts:245-249`, `index.ts:381`, `frameworks/page.tsx:214` all reproduce; the bounds and the echo check are buildable as written (their gaps are slot 5/7's, listed below).

**Simulation fidelity (§11), stated rather than bluffed.** I walked every task of all eleven files and probed every new or changed citation. Fidelity was lowest in **Phase 2 Task 3 (rows 8–20 — the eleven `[check]` sites and their four tests; I verified the four declarations, `promotion-ops.ts:790`'s neighbourhood and `landing-sections.tsx` by grep, not each of the seven decision lines individually)** and **Phase 3 Task 2 (rows 8–16, 23, 28, 33 — eleven rows across three packages; this is where every batch-1 billing defect landed)**. Phases 10 and 11 were simulated in full at the line level.

### Pre-mortem (on the repaired text; hunting the two shapes both full gates found)

The class both full gates named — *a repair that under-enumerates one layer further in* and *a repair that mandates a wrong behaviour in its own AC* — recurs across the plan. Each row is one instance, mapped or flagged:

- ❌ **"Mandates wrong behaviour in its own AC" — Phase 3 AC4** refuses the rewrite of a paid draft (slot 5 BLOCK; verified). No receiving row · Fix: bound the rewrite at `ceiling + byteLength(draft)` or a per-call allowance from the pipeline; AC4 → "the rewrite of an admitted draft is never refused (planted 12,000-token draft, zero refusals)".
- ❌ **Same shape — Phase 1 P1-R1/AC1** keeps a model-authored `platform` on the type the AC certifies as having no free-text member (mine, above).
- ❌ **Same shape — Phase 11 AC1** ("`import { mintEntitlement }` outside `mode-access.ts` fails lint") makes sixteen test files unbuildable (mine, above).
- ❌ **Same shape — Phase 6 P6-R6/AC9** writes the word the canon refuses ("numerical **learning**") into the requirement and the AC (slot 7; verified `forbidden-claims.ts:45`) · Fix: reword without the stem; AC9 runs `claimHits` over the rendered non-zero branch.
- ❌ **"One layer further in" — Phase 5 P5-R3**: the fence list stops at `with-workspace.ts:5936` and the accessor guards behind every read are missed; `/brain` lists one read of nine (slot 6 BLOCK; verified) · Fix: fences 4–5 with read siblings, `assertReadScoped`, the 13 reads enumerated or AC4 scoped, one probe per fence class.
- ❌ **Same shape — Phase 1 P1-R3(b)**: the census predicate ("declares a root array") misses the `walk(join(ROOT, "worker"))` shape — 13 files, not 6 (slot 7; four verified: `retention-pseudonymisation.test.ts:107-116` is P1-R7's exact defect in a sibling, `client-bundle-boundary.test.ts:32`, `studio-ui.test.tsx:135`, `support/no-streaming.ts:236`) · Fix: predicate = any walker over `join|resolve(<root>, "<dir>")` or a root-array literal; both shapes planted.
- ❌ **Same shape — Phase 1 P1-R1's scan**: two spellings, but `const { guidance } = doc.disclosure` and `disclosure: output.disclosure` (whole object into a third carrier) are unseen (slot 7) · Fix: the kind-only type makes the structural form complete; the scan becomes a note or covers member access + destructure.
- ❌ **Same shape — Phase 2 P2-R11(b)**: `quote_budget_exceeded` also at `pasted-reference.ts:520,:539`, `pasted-reference.test.ts:879`, `trends.test.ts:155` (slot 7) · Fix: two more rows; AC12's grep reaches zero only then.
- ❌ **Same shape — Phase 4 P4-R2**: the namespaced `.update(schema.subscriptions)` spelling (mine, above).
- ❌ **Same shape — Phase 6 P6-R6**: sites grew to four; renderers stayed at two (mine, above).
- ❌ **Same shape — Phase 11 P11-R1**: production seams enumerated; the tests that construct the values are not (mine, above).
- ❌ **Same shape — Phase 11 P11-R3**: the echo error's class decides whether it finalises or retries; `system-autopsy.ts:479` is the content-preflight catch, the real catch is `:414-428`, and a non-`FrameworkContentError` retries at `AUTOPSY_VENDOR_CALLS_PER_ATTEMPT` per retry after all four stages were bought (slots 5 and 7, independently) · Fix: the echo error extends `FrameworkContentError`; a worker row; AC3 asserts one attempt and `autopsy_refund` for a creator-paid claim.
- ❌ **Same shape — Phase 3 P3-R4**: the five writer sites are named; the *rule at the re-open site* (`webhooks.ts:2270-2277`'s new deadline gated on the marker) is not, and there is no closure on a newer `active` (slot 5) · Fix: site (2) = "an open episode never receives a new deadline"; close on `updated → active` when `eventAt > dunning_started_at`.
- ❌ **Same shape — Phase 9 P9-R4**: the verifier's env is named; the writer's env, the scopes flag and the credential variable names are not (mine, above).
- ❌ **Same shape — Phase 6 rows 17–19**: "the scope's own accessor" for a count does not exist; a new accessor edits the accessor map, the `lifecycleGuardedMethods` index (`:2667-2700`) and the name pin in `profile-scope.test.ts:1168-1236` — none rowed (slot 6; the index and the pin verified).
- ❌ **Same shape — Phase 5 rows 9, 17**: `profile-cage.test.ts:419`'s `SCOPE_TYPE_RE` cannot see `ReadGrade*Scope` (slot 6).
- ❌ **Same shape — Phase 5 P5-R7**: the stated predicate does not reproduce the 15-name Set it replaces (slot 6).
- ❌ **Same shape — Phase 11 rows 10–11**: the lift is per-file whole-list, so adding `mode-access.ts` grants it `trustWorkspaceId` too (slot 6; the shape verified at `eslint.config.mjs:982-1000`).
- ❌ **Phase 3 row 8 — `llm.maxInputTokens` fails open** on a stored document without `llm` (slot 5; verified `schema.ts:597-598`). The 2026-08-21 lesson's cousin: the plan proved the key exists, not that it binds.
- ❌ **Phase 3 P3-R2 — the refusal's `model_usage` outcome**: thrown inside `meteredCall` it stamps `parse_failed` or `vendor_failed` and counts as an uncharged attempt (slot 5) · Fix: refuse before `meteredCall` with `input_too_large` in the closed list.
- ❌ **Phase 2 P2-R10 — a terminal row re-opened**: `promotion-ops.ts:530-536` and R-115 ¶3 call `stale`/`superseded` terminal history (slot 7; verified) · Fix: a decision row amending R-115 ¶3, or the history-preserving insert.
- ✅ **Phase 8 — `lock_timeout` leaking to a money transaction** — absorbed: `SET LOCAL` stated at :32, row 3, the leak test at row 10(c), AC2.
- ✅ **Phase 8 — the fold reads two pause truths** — absorbed at :33, rows 21–22, AC10 (the deferral ledger's receiving row).
- ✅ **Phase 8 — a screen decides "insufficient" from a settling number** — absorbed at :34, edge row, AC1.
- ✅ **Phase 5 — the identity cascade cancels Stripe, then the creator cancels in grace** — absorbed at P5-R1, edge row 2, R-137 naming `stripe_subscription_reopen`.
- ✅ **Phase 5 — a pending-deletion creator's every product page is refused by the layout** — does not happen: `layout.tsx:20-33` catches the `withWorkspace` refusal and renders the shell with `credits = null`; the three read pages are reachable. (A `logRefusal("[shell] balance unavailable")` line will fire on every render during grace — noise, not a defect; NOTE.)
- ✅ **Phase 3 — a paid Sample Spin succeeds with zero usable rules and 503s** — absorbed at P3-R8 (boot refusal), rows 30–32, AC12, the second fence kept byte-identical.
- ✅ **Phase 4 — the pseudonymiser's UPDATE meets the new trigger** — absorbed at P4-R1 (column-scoped exemption), row 6, AC1/AC9.
- ✅ **Phase 9 — a scheduled audit failure reaches nobody** — absorbed at P9-R10 :43, AC11.
- ✅ **Phase 2 — a false hard refusal is a debited run** — absorbed at P2-R2 :40, edge :111, AC4's two numbers.
- ✅ **Phase 7 — `arrival="redirect"` steals focus on re-render** — absorbed at edge row 4 (default `"in-place"`).
- ✅ **Phase 10 — a second `<main>` on a marketing page** — absorbed at edge row 3 (exactly-one assertion in row 17).
- ✅ **Phase 11 — a cached analysis predates the echo check** — absorbed at edge row 7 (new analyses only, stated); but the *backfill* is a "later" with no ledger row (LOW, below).

### Mechanical consistency (re-verified against the eleven files and the tree)

- ✅ **Row counts** — master :80's `32 / 33 / 33 / 25 / 29 / 26 / 18 / 22 / 21 / 17 / 21` matches every table.
- ✅ **Depends-on ↔ master** — 2←1, 4←3, 6←1,2, 8←3, 9←1,3,4,5,8,11, 10←7, 11←8 match every header; the serial order 1→2→3→4→5→6→7→10→8→11→9 respects every edge.
- ✅ **Critical-Path columns ↔ phase tables** — billing 3,4,5,6,8,9,11; tenancy 1,3,4,5,6,8,9,11; compliance 1,2,6,8,11; learning 1,2,6,11 — each phase file's table agrees; Phase 8 reads three, Phase 11 four, as the master says.
- ✅ **R-134…R-147 ownership** — 134/135/136 → 3 (row 29); 137–140 → 5 (row 29); 141 → 1 (row 30); 142/143 → 2 (row 33); 144/146 → 8 (row 19); 145 → 11 (row 20); 147 → 9 (row 14). Next free numbers on disk: R-134, T-23, `0062` — as the plan says.
- ✅ **Requirement → AC mapping** — every phase carries the line and every requirement resolves to at least one AC (P7-R6 → Phase 10 AC1–AC7; P8-R3/R4 → Phase 11 AC1/AC2).
- ✅ **Reachability / Least confident** — present and non-empty in all eleven; Phases 10 and 11 name in-phase callers by row.
- ✅ **§10 zero-path** — Phase 7 :16 and Phase 10 :14 each state one independent generalist in a separate context, reserved before the batch; both DoDs name it; master :91 says "each owe one … not none".
- ✅ **The split lost nothing (as far as the record allows)** — the pre-split Phase 7/8 files are untracked (`git status`: `??`), so the batch-0 report is the only prior text: its Phase 7 Task 5 list (`/settings/account`, `/trends`, mojibake, `scope="col"`, landmarks, interview errors, `<span>` label, two disabled-reason links, `auth-form` busy) maps 1:1 onto P10-R1…R7; its Phase 8 ↔ {18, 19, 38, 40, 41, 39-doc} splits as 8 ↔ {18, 19, 38, 39-doc} and 11 ↔ {40, 41}; Phase 8's learning/tenancy selection (batch-0 #18) moved with the brand.
- ❌ **Estimates drift between the master's Phases table and five headers** — Phase 3 (6–8 vs 7–9 h), 5 (8–10 vs 9–11), 7 (5–6 vs 4–5), 8 (5–7 vs 4–6), 11 (3–4 vs 4–5); and master :76's "Phases 10 and 11 carry the hours moved out of 7 and 8, not new hours" is false by the headers (7+10 = 6–8 h vs 5–6; 8+11 = 8–11 h vs 5–7). LOW; number provenance.
- ❌ **Deferral ledger — two "not built here" promises with no row**: Phase 11's echo backfill of stored analyses ("an owner call", Out of scope) and Phase 3's unreconciled vendor spend after a double `recordUsage` failure ("recorded as unreconciled in the card, not built"). LOW.
- ❌ **Phase 3 AC9** reads "card quotes all five" over four clauses (batch-0 #49, half-applied). LOW.
- ❌ **Phase 1 → 2 handoff, a rationale that becomes false**: after P1-R1 no surface renders `/disclosure/guidance`, yet `HARD_CLAIM_FIELD_PREFIXES` keeps `/disclosure/` (`claims.ts:467-470`) *because* "all three are rendered verbatim on `/studio`" (`claims.ts:9`, `claims.test.ts:6`); Phase 2's per-field table should record that the field is no longer rendered and decide its enforcement on that fact. LOW-MEDIUM.
- ❌ **Phase 9 row 15's recorded claim** — installed `drizzle-kit@0.31.10` has no `peerDependencies` key at all (slot 5); the row says `peerDependencies: {}`. LOW (Golden rule 1).
- ✅ **Handoffs** — Phase 1 → 2 (`presentedTextUnits` named by symbol and row on both sides), Phase 1 → 6/9 (`claim-scan.ts`, `source-files.ts`), Phase 2 → 6 (AC8 → AC6), Phase 3 → 4 (`0062` → `0063`), Phase 3 → 8 → 11 (`app-server.ts`, `assemble.ts` in order), Phase 7 → 10 (`a11y-wiring.test.tsx`, `Banner arrival`), Phase 8 → 9 (`clock/balance/customers` before the bump) — all pinned and cited.
- ✅ **Coverage parity** — the master's register table and the sub-item table home every ranked item; the eight batch-0 unhomed sub-items each have a phase row or a ledger row with a trigger.

### Least-confident lines — probed (batch 1)

| Phase | Declared bet | Result |
|---|---|---|
| 1 | safe-log widening; root-array census | safe-log holds (one hit); census **under-counts** — 13 walkers, and the predicate cannot see 7 of them (slot 7, four verified) |
| 2 | false-fire rate on hooks, both numbers | holds as posed; the debit consequence is now in the text |
| 3 | the input-token number | **fails on what the ceiling is applied to** (slot 5): the rewrite; the key's default; the refusal's bookkeeping — the number itself is honestly labelled |
| 4 | one trigger with the exempt-set pin | holds |
| 5 | `blocked → cancelled` at three sites | holds for the edge; the *read grade* bet the file does not declare is where it fails (slot 6) |
| 6 | modes-sentence pin from `MODE_SPECS` | holds (`MODE_SPECS` has four `scriptMode(...)`, slot 7); the undeclared bet — the non-zero sentence — fails on wording and on site 2's renderer |
| 7 | deriving contrast pairs from CSS | holds; fallback viable |
| 8 | fallback always cheap and present | holds with slot 5's snapshot NOTE |
| 9 | ORM bump clean | holds as checkable; `peerDependencies` wording wrong |
| 10 | marketing `<main>` in a layout vs the header/footer pair | holds — no marketing layout exists, no page renders `<main>`, fallback stated |
| 11 | the echo bound of eight | holds as a chosen number with a measured fallback; the undeclared bet — what the worker does with the refusal — fails (slots 5 and 7) |

---

### Consolidated findings — batch 1 (slots 5–8, deduplicated)

Severity is the plan-lane normalisation (gate-rules §4 / §9 row 4): BLOCK; HIGH/CHANGE = changes what will be built and re-runs its reviewer (slot 7's CHANGEs are reviewer-rated MEDIUM but pass the what-will-be-built test, so they sit here with their rating shown); MEDIUM; LOW; NOTE. Finder and confidence given.

**BLOCK (2)**
1. **Phase 3 P3-R2 :32-34, AC4 :129** — the chokepoint ceiling refuses the rewrite of a vendor-billed draft; AC4 mandates it. Slot 5; verified by slot 8 (`assemble.ts:818-850`, `pipeline.ts:184-192`). Conf 0.9 defect / 0.75 severity.
2. **Phase 5 P5-R3 :33-37, rows 9–17, AC2/AC4** — the read grade's population is under-enumerated on both sides (accessor guards `:786-796`/`:2701-2713`; nine `/brain` reads; `assertScoped`-only writers incl. all seven Stripe actions; `pendingDeletionsForScope:936`). Slot 6; verified by slot 8. Conf high.

**HIGH / CHANGE — changes what will be built (18)**
3. **Phase 1 P1-R1 :33-34, row 14, edge :125, AC1** — `PresentedDisclosure.platform` is model-authored (`output.ts:118-121,:235`); the template carries no platform (`run.ts:158,:382`); R-121 says closed request data; the edge row's "exactly as the sample-spin presenter does" is false against the file. Slot 8. Conf high (0.7 that it should be BLOCK).
4. **Phase 11 P11-R1 rows 5, 10, 11, AC1** — sixteen test files compose entitlements with no sanctioned mint under the fence as written; `results-ops.ts:46-55` pass-through unlisted; the `trustWorkspaceId` precedent's test lift (`eslint.config.mjs:963,:992`) not carried. Slot 8. Conf high.
5. **Phase 6 P6-R6 rows 20–23, AC9** — site 2 renders at `generation-outcome.tsx:199` (hosts `studio-panel.tsx:426`, `first-ideas-result.tsx:78`), unreachable from the rows; reword count-independently (P2-R7's form) or row both files. Slot 8. Conf high.
6. **Phase 3 row 8, :32** — `llm.maxInputTokens` not in the `llm` object-level default (`schema.ts:597-598`) → `undefined` → the ceiling never binds. Slot 5; verified. Conf high.
7. **Phase 3 :33, :44, row 23** — `LlmInputTooLargeError` thrown inside `meteredCall` stamps `parse_failed`/`vendor_failed` and counts as an uncharged attempt; refuse before `meteredCall`, add `input_too_large`. Slot 5. Conf high.
8. **Phase 3 :33 vs :35, row 16** — the wrapper sees `system`/`prompt` only and cannot name the largest component; `partSizes` on `AssembledPrompt`. Slot 5. Conf high.
9. **Phase 3 P3-R4 :40-41, :117, AC6** — no episode rule at the re-open site; no closure on a newer `active` (stale marker → zero grace next episode). Slot 5. Conf 0.8.
10. **Phase 3 :38, :115, row 16** — 60,000,000 µUSD derived from max *duration*, not max *input cost*; record as owner-chosen with the per-attempt unit. Slot 5. Conf high.
11. **Phase 11 P11-R3 :31, row 18, AC3** — `verbatim_echo`'s class decides finalise-vs-retry; the real catch is `system-autopsy.ts:414-428`, not `:479`; retries spend `AUTOPSY_VENDOR_CALLS_PER_ATTEMPT` each after all four stages are bought; `system-autopsy.ts` not a row; refund consequence unstated. Slots 5 + 7 (independently). Conf 0.7.
12. **Phase 5 rows 9, 17** — `profile-cage.test.ts:419`'s regex is blind to `ReadGrade*Scope`; terminal set must admit `assertReadScoped`. Slot 6. Conf high.
13. **Phase 5 P5-R7 :46, AC9, rows 25–26** — the stated predicate admits `membership_profile_selections`, `first_billable_attempts`, `generation_attempts`, `model_usage` and three more; `creator-data-registry.test.ts:139-150` reddens. Slot 6. Conf high.
14. **Phase 6 rows 17–19, AC10** — no count accessor exists; the accessor map, the `lifecycleGuardedMethods` index (`:2667-2700`) and `profile-scope.test.ts:1168-1236` need rows (slot 6); **and** AC10's "red under the existing scope scans" names no scan and none exists (slot 8). Conf high.
15. **Phase 11 rows 10–11** — the lift is a per-file whole-list; extending it by `mintEntitlement` + `mode-access.ts` cross-grants both ways; two blocks, one name each; fixture asserts both inverses. Slot 6; shape verified by slot 8. Conf high.
16. **Phase 1 P1-R3(b) :43, row 3, AC10** *(reviewer-rated MEDIUM)* — census predicate misses the `walk(join(ROOT,"…"))` shape: 13 files, not 6. Slot 7; four verified by slot 8. Conf high.
17. **Phase 1 P1-R1 :34, row 23, AC1** *(MEDIUM)* — the two-spelling scan misses destructure and whole-object reads. Slot 7. Conf high. (Closed for free by #3's kind-only type.)
18. **Phase 2 P2-R11(b) :49, rows 26/30, AC12** *(MEDIUM)* — `quote_budget_exceeded` also in `pasted-reference.ts:520,:539`, `pasted-reference.test.ts:879`, `trends.test.ts:155`. Slot 7. Conf high.
19. **Phase 6 P6-R6 :46, AC9** *(MEDIUM)* — the specified non-zero sentence contains "learning" and the canon refuses it (`forbidden-claims.ts:45`). Slot 7; verified. Conf high.
20. **Phase 2 P2-R10 :48, rows 13/33, AC11** *(MEDIUM)* — re-asserting `proposed` on `stale`/`superseded` reopens what `promotion-ops.ts:530-536` and R-115 ¶3 call terminal; no decision row. Slot 7; verified. Conf high.

**MEDIUM (4)**
21. **Phase 4 P4-R2 :28-33, AC3** — the derivation's predicate is unstated and the plan mislabels `deletion-commands.ts:192` (`.update(schema.subscriptions)`) as "other verbs"; plant the namespaced spelling. Slot 8. Conf high.
22. **Phase 9 P9-R4 :32, row 2, AC3** — seeding a local deletion request needs `RESPIN_DELETION_REQUEST_SCOPES` open, the journal env on app **and** worker, and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (the verifier passes no credentials); none named. Slot 8. Conf high.
23. **Phase 1 row 16 / rows 24–25** — `sample-spin-spend.test.ts:171` and `run.ts:158` change with the helper's shape; not rows. Slot 8. Conf high. (Closed by #3's kind-only type.)
24. **Phase 1 → 2 handoff** — `/disclosure/` in `HARD_CLAIM_FIELD_PREFIXES` rests on "rendered verbatim on `/studio`" (`claims.ts:9`, `claims.test.ts:6`), which P1-R1 makes false; Phase 2's per-field table records it. Slot 8. Conf medium-high.

**LOW (8)**
25. **L-7 not applied** — `changelog.test.ts:92-100` still `.some(…)` in P6-R7/AC12. Slot 7.
26. **Phase 2 P2-R8 :46** — ≥7 more prose mentions of the token (`audiences.ts`, `changelog/entries.ts:41`, `billing-errors.ts:1038`, `brain/copy.ts`); say exact-token prose only or list them. Slot 7.
27. **Phase 2 P2-R11(a) :49, row 29** — six `"submitted"` literals, `"youtube"` at `:199`/`:274`; only `:199`/`:923` matter; re-count. Slot 7.
28. **Phase 2 P2-R12 :50, row 31** — the non-literal shape must match the shorthand form (`evidenceState,` at `with-workspace.ts:5189`) with one reasoned exemption. Slot 7.
29. **Master Phases table vs five headers** — estimates drift; "not new hours" false. Slot 8.
30. **Deferral ledger** — no row for the echo backfill (Phase 11) or the unreconciled spend after a double `recordUsage` failure (Phase 3). Slot 8.
31. **Phase 3 AC9** — "all five" over four clauses. Slot 8.
32. **Phase 9 row 15** — `drizzle-kit@0.31.10` has **no** `peerDependencies` key (not `{}`); correct the recorded claim. Slot 5 (NOTE) → LOW as a Golden-rule-1 miss.

**NOTE (12)**
33. Phase 8 :31(iii), :89 — isolation cannot change after the first statement; pick the single-statement snapshot. Slot 5.
34. Phase 8 :32, :34, :90 — what renders when `55P03` fires on the success path; the pre-call gate at `generate.ts:~560` also decides. Slot 5.
35. Phase 8 :39, :71, :95 — Stripe replays a key only for identical params; state the changed-email outcome. Slot 5.
36. Phase 3 :33, :81 — a static scan cannot prove a call receives a wrapped provider; the runtime witness argues for binding inside `meteredCall`. Slot 5.
37. Phase 5 P5-R3 — an identity with another active workspace cannot export the tombstoned one under "sole active membership"; say whether `ctx.workspaceId` admits it. Slot 6.
38. Phase 5 AC2 — `cancelScopedDeletion` takes a session proof, no scope; reword. Slot 6.
39. Phase 5 P5-R2 — `:942` already `or(workspaceId, userId)`; the widening is to `requesterUserId`. Slot 6; verified.
40. Phase 8 P8-R1 row 20 — `getDisplayBalance(workspaceId)` never names the brand; `getBalance` is `VerifiedWorkspaceId` (`app-server.ts:637`). Slot 6; verified.
41. Phase 1 rows 11–12 — if the two pinned-fetch copies use a `fetch(` token, AC6's six entries become eight; name the pattern. Slot 7.
42. Phase 11 row 9 — `results/actions.ts:130,:189` already mint through the facade; the row's purpose is the string→object shape change. Slot 7.
43. Holds (slot 7): S1/S2/S3 intact; Phase 4 row 21 type-change only; Phase 7 row 13 inside the marketing render population; L1 single insert; L2 distinct `generationId`s; L4 scoped count; L7/L9.
44. Phase 5 row 14 wording — the layout never holds a read-grade scope; the `null` comes from the existing catch around `withWorkspace` (`layout.tsx:29-40`), and `logRefusal("[shell] balance unavailable")` will fire on every render during grace. Slot 8.

**Totals:** 2 BLOCK · 18 HIGH/CHANGE · 4 MEDIUM · 8 LOW · 12 NOTE = **44 findings** after deduplication (slot 5 reported 1/6/5; slot 6 1/4/4; slot 7 0/6 CHANGE/4 LOW/5 NOTE across both paths; slot 8 contributed 4 HIGH, 4 MEDIUM, 4 LOW, 1 NOTE, and merged one item each into #11 and #14).

---

### §11 — plan-size dispositions

**Split 7 → 10 and 8 → 11: sound, and it worked.** Phase 10 (17 rows) and Phase 11 (21 rows) were simulated in full at the line level; every citation in both reproduces, each carries Reachability, Least-confident, a §10/gate selection inherited from the parent, and a requirement→AC line; the split lost nothing the batch-0 record can account for. Phase 11's defects (#4, #11, #15) are enumeration defects, not size defects — a 32-row Phase 8 would have carried the same three.

**Accepted risk for 1 (32), 2 (33), 3 (33), 5 (29), 6 (26): I do not contest disposition 2, and I record where the risk actually sits.** Size did not threaten faithful simulation of Phases 1, 5 or 6 — I walked every task of each and the defects found in them (#3, #2, #5) are one-layer-in enumeration defects that a split would not have prevented (2026-09-08 lesson: a smaller unit answers a size problem, not an enumeration problem). My fidelity was lowest on **Phase 2 Task 3** (the eleven `[check]` sites — verified by class, not each line) and **Phase 3 Task 2** (eleven rows across three packages, where every batch-1 billing defect landed). Neither is a case for splitting today, but Phase 3 Task 2 is the natural cut if batch 2 fails on it again (slot 5 says the same) — and that is now a live question, because **batch 2 is the last permitted retry on this gate**; acceptance never pre-authorises batch 3.

### §10 — zero-path phases

Phases 7 and 10 map zero Critical Paths. **Each owes its own independent generalist review at build**, in its own separate context, reserved before that phase's batch starts — Phase 10's inherited selection is a selection, not a shared slot with Phase 7. Both files say so (7 :16, 10 :14) and both DoDs name it; master :91 says "each owe one … not none". Confirmed.

### §5 — convergence

Both §5 triggers are met on this gate: (a) **findings recurred for the same invariant a second time** — batch 0's headline class was "population under-enumerated" (eight sub-items unhomed, three-not-six carriers, four-not-eleven `[check]` sites, two-not-six fetch sites) and batch 1 returned the same class one layer deeper in **at least fourteen places** (#2, #4, #5, #9, #11–#18, #21, #22, #24); and (b) **the fixes introduced substantial new defects** — #1, #3, #6, #7, #19 and #20 did not exist in batch 0's text. **A bounded owner/reviewer diagnostic exchange before batch 2 is warranted** and, given that batch 2 is the last retry, is the only way batch 2 is likely to converge.

**What the exchange should reconcile — the invariant.** "A population the plan enumerates is complete" has been read as "every *declaration* is listed"; the reviewers read it as "every *producer, spelling and one-hop consumer whose shape the repair changes* is listed". The plan should adopt an authoring rule for every population row: (i) the predicate written out (regex or AST rule), (ii) the roots it runs over (all of `ROOT_DIRS`, tests included where the shape changes), (iii) every alternate spelling planted (namespaced `schema.x`, destructure, whole-object, shorthand property, re-export, test-side construction), (iv) one hop outward — the guard that wraps the accessor, the test that constructs the value, the host that renders the second site — and whether the repair changes the shape that hop sees.

**The reproducer for the class** (each a plant the plan's own AC should carry; each runnable today without editing the tree): plant `const { guidance } = doc.disclosure` in an `app/**` file → P1-R1's scan stays green (#17); add `readGradeCage` to `assertScoped:580` → an `openCheckout` test must go red, and under the plan as written nothing asserts it (#2); hand `"included"` from `packages/db/tests/frameworks.test.ts` to `assertEntitled` under the brand → compile error with no sanctioned mint (#4); plant `.update(schema.subscriptions)` in a new file → the derivation as described stays green (#21); render a claim with `family: "performance"` through `generation-outcome.tsx` → the "none logged" sentence with no count in scope (#5); feed a stored config document without `llm` → `maxInputTokens: undefined` (#6). Diagnosis grants no verdict; after it, repair only under the remaining allowance.

---

### Verdict — retry batch 1

**NOT READY.**

Five plan edits that move the most findings, in order:

1. **Phase 3 Task 2 (rows 8–16, 23, 33; P3-R2/R3/R4; AC4/AC6):** the rewrite is never size-refused for an admitted draft (`ceiling + byteLength(draft)` or a per-call allowance); refuse **before** `meteredCall` with `input_too_large` in the closed list and zero `model_usage` rows; `partSizes` threaded onto the request; `llm.maxInputTokens` listed in the `llm` object default at `schema.ts:598` and `boundedProvider` refusing construction on a non-integer ceiling; the 60,000,000 recorded as owner-chosen with the per-attempt worst case as its unit; site (2) of the dunning population gets the episode rule and a newer-`active` closure. (Closes #1, #6, #7, #8, #9, #10, #36.)
2. **Phase 5 Task 3 (rows 9–17; P5-R3; AC2/AC4) + P5-R7:** `assertScoped` unchanged, `assertReadScoped` for the enumerated readers; fences 4–5 (`:786-796`, `:2701-2713`) with read siblings that keep the graph locks and epoch checks and re-read the newest op state; the thirteen page reads enumerated or AC4 scoped to `creatorProfiles` + `readBrainHistory`; row 17 probes one writer per fence class; `profile-cage.test.ts` row; P5-R7's predicate written as the one that reproduces the fifteen names. (Closes #2, #12, #13, #38, #39.)
3. **Phase 1 Task 5 + Phase 6 Task 4 (the two customer-facing sentences):** `PresentedDisclosure` = `{ kind }` only (the template's shape) with the edge row corrected — which also closes the destructure-scan gap and the two Sample Spin fixtures — or platform from the request context at the facade; P6-R6's non-zero sentence reworded without the `learn` stem and AC9 running `claimHits` over the rendered branch; site 2 reworded count-independently (P2-R7's form) with `generation-outcome.tsx` named as its renderer; the count accessor's three rows; AC10's scan named or its parenthetical struck. (Closes #3, #5, #14, #17, #19, #23, #24.)
4. **Phase 11 Task 3 + P11-R3:** two lint blocks lifting one name each; the `packages/*/tests/**` and root `tests/**` lift stated with the sixteen composing test files listed (or one test-side mint helper), `results-ops.ts` on the seam list; the echo error extends `FrameworkContentError`, `worker/system-autopsy.ts` becomes a row citing `:414-428`, AC3 asserts one attempt and `autopsy_refund` for a creator-paid claim. (Closes #4, #11, #15, #42.)
5. **The enumeration-rule sweep (the §5 outcome applied):** Phase 1's census predicate → walker shape with 13 files listed; Phase 2's two `packages/credits` rows for `quote_budget_exceeded` and a decision row (or history-preserving insert) for P2-R10; Phase 4's derivation predicate with the namespaced plant; Phase 9's drill section naming the scopes flag, the writer-side env and the AWS variable names; L-7 applied. (Closes #16, #18, #20, #21, #22, #25.)

Plan-shaped severity test (gate-rules §9 row 4): #1–#24 change **what will be built** and re-run their reviewer in **retry batch 2 — the last permitted**; #25–#32 change only how the plan reads and may be fixed, batched and logged without re-review; the NOTEs are advisory. Under §5, the diagnostic exchange precedes the batch-2 repair pass, and its product is the authoring rule above applied to every population row in all eleven files — not more phases.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Retry batch 2

**Readiness: Not yet · Grade: D · All 44 batch-1 findings were applied and the plan is much closer, but the under-enumeration class returns a third time in five rows the batch-2 repair itself rebuilt — and one of them is the batch-1 BLOCK's exact shape one call further along the same site: the kill-test scoring prompt embeds the vendor's own draft and carries no `partSizes`, so a long admitted draft is refused `input_too_large` after one or two paid calls; a second repair (P2-R10) writes an AC that makes a creator's rejection never stick.**

**Gate:** `respin-audit-remediation-2026-09-19-plan` · **retry batch 2** (the last permitted retry; 9 evaluations consumed on this gate after this batch; the owner pre-approved a third on 2026-09-21 should this one fail) · **plan gate ran lean (consolidated)** — one `plan-reviewer` run carrying all four Critical-Path checklists under the 2.0 canon (`.claude/gate-rules.md` §5, `create-plan.md` Step 6).

**Reviewer (this section):** slot 9, `plan-reviewer` (sole run, batch 2) — dispatched by name; frontmatter `model: fable`, `effort: xhigh` as *requested*; effective runtime model/effort unknown (not exposed). Read-only over the tree; this file is the one artefact written (this section appended; the batch-0 and batch-1 text above untouched except the one pointer line under the top headline). No plan file, no other progress file edited; no mutation planted. Commands run: reads, `sha256sum`, `grep`/`sed`/`awk`, `git ls-files --eol`, `node -e` against the installed `drizzle-kit` manifest, and one `npx tsx` evaluation of `claimHits` over the four new customer-facing sentences — which needed a transient probe file inside `respin/` (`__claimcheck_probe.mts`, created and deleted in the same command because `tsx` cannot import the canon by absolute Windows path from the scratchpad; `git status` clean afterwards). Stated so the method is on record.

### Per-path verdicts (batch 2)

| Path | Checklist applied | Verdict | Findings |
|---|---|---|---|
| Respin billing & credits (3, 4, 5, 6, 8, 9, 11) | B1–B7 + threshold provenance | **BLOCK** | 1 BLOCK (#1) · 3 MEDIUM (#5, #6, #7) · 2 LOW (#12, #13) · 2 NOTE (#18, #19) |
| Respin brain tenancy (1, 3, 4, 5, 6, 8, 9, 11) | T1–T6 + requirement provenance | **NEEDS CHANGES** | 2 HIGH (#3, #4) · 2 MEDIUM (#8, #9) · 1 LOW (#14) · 1 NOTE (#17) |
| Respin learning honesty (1, 2, 6, 11) | L1–L9 | **NEEDS CHANGES** | 2 HIGH (#2, #3) |
| Respin spin compliance (1, 2, 6, 8, 11) | S1–S8 | **NEEDS CHANGES** | 1 MEDIUM (#10) · 1 LOW (#11) · 2 NOTE (#15, #16) |
| Generalist (plan integrity; §10; §11; movement) | this template | **NOT READY** | consolidates the above |

### Frozen inputs — sha256 (first 8), re-measured by this reviewer before reading

| Hash | File | Match |
|---|---|---|
| `0dec22f9` | `docs/plans/respin-audit-remediation-2026-09-19-master-plan.md` (as dispatched; table row carries pre-reservation `154bb120`) | ✅ |
| `00e4c296` | `…-phase-1.md` | ✅ |
| `c93533ba` | `…-phase-2.md` | ✅ |
| `55f59c8c` | `…-phase-3.md` | ✅ |
| `3135cf5b` | `…-phase-4.md` | ✅ |
| `ead7b7eb` | `…-phase-5.md` | ✅ |
| `18989d9a` | `…-phase-6.md` | ✅ |
| `5bbeafa0` | `…-phase-7.md` | ✅ |
| `85ffe1a5` | `…-phase-8.md` | ✅ |
| `bdb258c8` | `…-phase-9.md` | ✅ |
| `3b30b6fc` | `…-phase-10.md` | ✅ |
| `f646706b` | `…-phase-11.md` | ✅ |
| `2052c45a` | `docs/progress/respin-audit-remediation-2026-09-19-codebase-review.md` | ✅ |
| `0425ee63` | `docs/progress/respin-audit-remediation-2026-09-19/phase-1-and-6-card.md` | ✅ |

Also measured (not in the reservation table): audit register `c307e6ae`, ledger `7f25eace` (grown since batch 1 by the batch-1 entries, as expected), the batch-2 repair brief `19f68090`, this file before the append `74b8318a`. No plan file changed since the freeze; no CR bytes in any plan file.

---

### Movement on batch-1 findings (44)

*Closed* = applied as asked, and where the row is a population the four parts of the authoring rule (predicate written · roots incl. tests where the shape changes · alternate spellings planted · one hop outward named) are present; *closed → successor* = applied, and the repair exposed or introduced the next defect (batch-2 number follows); *regressed* = the repair re-recorded a population that is still short.

| # (batch 1) | Disposition | Four parts | Location of the repair |
|---|---|---|---|
| 1 rewrite refused after paid draft | closed → successor **B2-1** (the *scoring* call, same site, no `partSizes`) | predicate ✓ · roots ✓ (four-site scan over `PRODUCTION_ROOTS`) · spellings ✓ (`.complete(` any receiver) · hop ✗ — the second callback `:934-946` is named but its prompt producer (`assembleKillTestPrompt`) is not | phase-3 :33–34, rows 5, 11, 34–35, AC4 |
| 2 read-grade population | closed — all four ✓ (the `assertScoped`-only list reproduces exactly: 17 sites by grep for `assertScoped(` and `isWorkspaceScope(`, 2026-09-21) | ✓ ✓ ✓ ✓ | phase-5 :35–38, rows 9–17, 30–33, AC4 |
| 3 `PresentedDisclosure.platform` | closed — kind-only, template shape verified (`run.ts:158`) | ✓ ✓ ✓ ✓ (carrier 7 is the hop) | phase-1 :36–38, rows 14–27, 33, AC1 |
| 4 sixteen test files / test lift | closed — the seventeen reproduce (grep of the five literals over `tests/**`, `packages/*/tests/**`) | ✓ ✓ ✓ · hop → successors **B2-3**, **B2-9** (the production side is still one receiver and one screen short) | phase-11 :29, rows 22–24 |
| 5 site-2 renderer | closed — `generation-outcome.tsx:199` and both hosts verified; `claimHits` = `[]` re-run by slot 9 | ✓ | phase-6 :46, row 9, AC9 |
| 6 `llm` object default | closed (`schema.ts:597-598` verified) | ✓ | phase-3 :35, row 8, AC4(c) |
| 7 refuse before `meteredCall` | closed (`:1159`/`:1194`/`:1212-1218` verified) | ✓ | phase-3 :34, row 5, AC4(a) |
| 8 `partSizes` | closed → successor **B2-6** (no completeness witness; constant parts unlisted) | | phase-3 :33, rows 34–35 |
| 9 dunning episode rule | closed — every cited site verified (`:248-265`, `:320-329`, `:1587-1644`, `:2207-2222`, `:2267-2279`) | ✓ (population and guard per site) | phase-3 :43–46, row 22, AC6 |
| 10 60,000,000 owner-chosen | closed | ✓ | phase-3 :40, row 16 |
| 11 echo error class / real catch | closed — `FrameworkContentError` dismissed on tree evidence (cycle); `AutopsyAnalysisError` and `:414-428` verified; `StageAttemptError.code` is `string` and `error_code` is a shape CHECK, so no migration | ✓ | phase-11 :31, rows 18, 26–27, AC3 |
| 12 `SCOPE_TYPE_RE` | closed (a word boundary cannot reach inside `ReadGradeWorkspaceScope` — verified) | ✓ | phase-5 row 33 |
| 13 P5-R7 predicate | closed (`profile()` `:262-268`, `:1523` verified) | ✓ (differences decided) | phase-5 :48, AC9 |
| 14 count accessor = three edits; AC10 scan | closed — rows 27–29; `feedback-readers` census named | ✓ · the *class* → **B2-4** (Phase 3's own new accessor did not take the lesson) | phase-6 :50–51, rows 27–29, AC10 |
| 15 two lint blocks | closed → successor **B2-8** (the new block's `patterns` unstated) | | phase-11 :29, row 10 |
| 16 census predicate | closed — the two regexes reproduce **19 files** exactly (slot 9 re-ran them) | ✓ ✓ ✓ ✓ (the ratchet is the hop) | phase-1 :47, row 3, AC10 |
| 17 destructure / whole-object | closed (whole-object witness + four-spelling scan) | ✓ · roots → **B2-11** (LOW) | phase-1 :38, row 23, AC1 |
| 18 `quote_budget_exceeded` rows | closed — 8 sites / 4 files reproduce | ✓ | phase-2 :52(b), rows 26, 30, 34–35, AC12 |
| 19 `learn` stem | closed — `[]` re-run by slot 9 | ✓ | phase-6 :48, AC9 |
| 20 P2-R10 reopens terminal rows | closed → successor **B2-2** (HIGH: `rejected`/`accepted` now re-propose) | | phase-2 :51, rows 13, 36–38, AC11 |
| 21 P4-R2 predicate | closed — (i)–(iii) plus the alias pass reproduce **11** writers | ✓ ✓ ✓ ✓ | phase-4 :28–33, row 8, AC3 |
| 22 P9-R4 env block | closed — every citation verified (`deletion-journal-compose.ts:56-84`, `restore-verify.ts:124-131`, `deletion-journal-s3.ts:44-52,77-82`) | ✓ | phase-9 :32, row 2, AC3 |
| 23 Sample Spin fixtures | closed as reasoned no-ops | ✓ | phase-1 :36 |
| 24 `/disclosure/` rationale | closed | ✓ | phase-2 :43, rows 4–5 |
| 25 L-7 `.every` | closed (spelling regexes) | ✓ | phase-6 :54, row 26, AC12 |
| 26 prose mentions | **regressed → B2-10** — the re-measured "twelve sites in seven files" was grepped over `app/` alone; four `packages/*/src` sites are missing | predicate ✓ · roots ✗ | phase-2 :49, row 17 |
| 27 literal recount | closed — 6 + 2 reproduce | ✓ | phase-2 :52(a), row 29 |
| 28 shorthand exemption | closed (`:5171-5172`, `:5189` verified) | ✓ | phase-2 :53, row 31, AC13 |
| 29 estimates | closed — table equals headers, sum 53–70 | | master :64–76 |
| 30 ledger rows | closed | | master :172–173 |
| 31 AC9 "all five" | closed (four over four) | | phase-3 AC9 |
| 32 `drizzle-kit` peer claim | closed — `NO peerDependencies key` re-run by slot 9 | | phase-9 row 15 |
| 33–35, 40 Phase 8 NOTEs | closed | | phase-8 :31–34, :39, row 20 |
| 36 binding site | closed (in the caller) | | phase-3 :34 |
| 37 second active workspace | closed (R-140 + ledger row) | | phase-5 :39; master :164 |
| 38 AC2 wording | closed | | phase-5 AC2 |
| 39 `requesterUserId` | closed | | phase-5 :32 |
| 41 pinned-fetch pattern | closed — six sites reproduce by the stated predicate | ✓ ✓ ✓ ✓ | phase-1 :41, rows 11–12, AC6 |
| 42 row 9 purpose | closed | | phase-11 row 9 |
| 43 holds | n/a | | |
| 44 row 14 wording | closed | | phase-5 row 14 |

**Movement totals:** 44 applied (43 closed, 1 regressed); 6 with a successor defect in batch 2 (#1, #4, #8, #15, #20, #26) and one class-level successor (#14 → Phase 3). Nothing regressed to its batch-1 state. The authoring rule was applied to most population rows and it worked where it was applied — the four populations I re-derived from their written predicates (census 19, fetch sites 6, mirror writers 11, `quote_budget_exceeded` 8) all reproduce exactly. Where it was not applied to the *production* side of a row (Phase 3's second callback, Phase 11's receivers, Phase 2's prose roots), the class returned.

---

### Execution simulation (re-run as `respin-engineer` for every task the batch-2 repairs changed)

- ❌ **Phase 3, Task 2 (rows 5, 11, 13, 14, 34–35), P3-R2 / AC4** — buildable, but builds the batch-1 BLOCK one call later. `meteredCall` (`generate.ts:1159`) serves **two** callbacks: `generate:` (`:900-931`, prompt from `assembleGenerationPrompt`/`assembleRewritePrompt`, both gaining `partSizes`) and `scoreCreatorRules:` (`:934-946`, prompt from `assembleKillTestPrompt`, `packages/modes/src/kill-test.ts:143-167` — a bare `{ system, prompt }` with **`renderDraft(output)` embedded**, called at `pipeline.ts:317-321` on the accepted draft). The plan names both callbacks as "the one statement both share" and then bounds a prompt without `partSizes` on `byteLength(system + prompt)` with no exemption — so a draft near `llm.maxOutputTokens` (12,000 tokens, roughly 40–50 KB rendered) plus the creator's rules exceeds a 40,000 ceiling and is refused `input_too_large` **after** the draft (and any rewrite) were bought: two billable `model_usage` rows, a `refused` claim, no output, and a printed remedy ("trim a brain doc, shorten the input") that cannot apply because the bulk is the vendor's reply — the 2026-07-30 shape. Those uncharged billable rows then count toward R16's uncharged-attempt bound, so a creator whose drafts run long is locked out by the abuse guard. AC4(b)'s plant ("12,000-token draft … zero refusals, **two** `model_usage` rows") never scores (two rows means no scoring call), so the AC is shaped to miss it. The compliant path already knows this: the Sample Spin gives its score call its own ceiling (`SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS`, `run.ts:68`, `:339`). · Fix: `assembleKillTestPrompt` fills `partSizes` with `draft` exempt (the rewrite's own rule: the draft is the vendor's reply) — or the scoring callback passes a per-call allowance of `ceiling + byteLength(draft)`; AC4(b)'s fixture carries usable creator rules and asserts **three** rows, zero refusals; row 13's list is keyed on prompt *producers* reaching a site, not the site alone. Confidence 0.85 on the mechanism (verified in the tree); BLOCK-grade by the rule batch 1 applied to #1.
- ❌ **Phase 3, Task 2 (rows 6, 23), P3-R2 way forward** — row 23 maps `LlmInputTooLargeError` in `app/(product)/billing-errors.ts` by `instanceof` (the `:671-677` table shape), but `app/**` may not import `@respin/llm` (`eslint.config.mjs:628`, `:797`); the class must be re-exported by the facade exactly as `LlmError` and the `@respin/modes` refusals are (`app-server.ts:155-167`, `:375`), and `facade-errors.test.ts`'s walk cannot demand it (relative imports only, per the facade's own comment). Row 6's purpose names only the settlement entry point. · Fix: row 6 adds the re-export. MEDIUM.
- ❌ **Phase 3, Task 2 (row 33), P3-R3** — `sumBillableCostMicroUsd` is a new `ProfileScope` accessor, and this plan's own Phase 6 P6-R6 (#14) records that an accessor is three edits: the map, the `lifecycleGuardedMethods` index, **and** `packages/db/tests/profile-scope.test.ts`'s name pin (`:1171-1235`; `sumUnchargedBillableCostMicroUsd` at `:1186`) with `breachValidators` (`:821`) and `accessorArgs` (`:1055`) that "all three key sets agree", plus the accessor→table map at `:2311`. Row 33 names the map, the implementation and the index; no `profile-scope.test.ts` row, so the new money read has **no cross-profile breach validator** and the P3 pin goes red. Tenancy T1. · Fix: a `profile-scope.test.ts` row; Phase 3's tenancy "why" names the accessor beside the census column. HIGH.
- ❌ **Phase 3, Task 3 (row 18), AC6** — the backfill and `RAISE` assertions ("a pre-`0062` fixture … `SELECT count(*) …` reads zero after the migration, and … `config_versions` empty makes the migration `RAISE`") have no receiving test row: row 17 is `packages/credits/tests/stripe.test.ts` (webhook unit tests, no migration runner). The existing shape is `packages/db/tests/lifecycle-migration.test.ts` (PGlite, applies the migrations before an ordinal against a fixture, `:22-30`, `:131-140`). · Fix: row it, and state the clause the conjunctive condition implies but no AC asserts — a database with zero dunning rows (every fresh test database) migrates clean. MEDIUM.
- ❌ **Phase 3, Task 2 (rows 11, 34–35), P3-R2** — `partSizes` has no completeness witness. The bounded parts are listed as "system, the mode brief, `contextBlock`'s six components, the output contract", but `assembleGenerationPrompt` (`assemble.ts:786-803`) also joins `HARD_RULE_BRIEF`, and `contextBlock` (`:549-593`) also emits `universalLaws`, the `Platform:` line and its block headers — constants today, so the bound under-counts by a constant; but Phase 8 lands its delimiter constants in this same function, and nothing asserts that the sum of `partSizes` covers the prompt. A part joined but not recorded is unbounded silently — the `partSizes` exemption shape the brief asked me to hunt. · Fix: `input-ceiling`'s test asserts sum(partSizes) + separators === byteLength(system) + byteLength(prompt) for both assemblers; a planted unrecorded part is red. MEDIUM.
- ❌ **Phase 2, Task 5 (rows 13, 36–38), P2-R10 / AC11** — the partial unique index on `status = 'proposed'` makes a **`rejected`** (and an `accepted`) row stop absorbing the insert conflict. `refreshPromotionProposals` (`promotion-ops.ts:222-268`) reconstructs the drafts from the *current* inputs on every refresh, so for unchanged evidence the same digest is inserted again after the creator rejects it, and again after every rejection — a loop the creator cannot end while the evidence stands. Today the full constraint plus the fallback read make the rejected row "the" proposal — "readable history … proposing nothing" (`:530-536`) — which AC11 now overturns by mandate ("a `rejected` row with the same digest stays `rejected` and gains a `proposed` sibling"); the `accepted` case (an applied rule re-proposed beside its own acceptance) is the same shape. Learning L7 / R-115: a rejection must stick; the edge row's "immutable history" is about not *updating* the row, not about re-asking. · Fix: uniqueness over `status NOT IN ('stale','superseded')` — live and decided rows both arbitrate; the fallback read filtered to those statuses; a decided row read back proposes nothing (the existing behaviour); AC11's `rejected` clause inverted and an `accepted` clause added; the stale/superseded fresh-row form (batch 1's #20) is kept. HIGH, confidence 0.8.
- ❌ **Phase 11, Task 3 (rows 1–4, 25), P11-R1 / AC1** — the seam list names three receivers with a value check; the tree has a **fourth**: `packages/db/src/promotion-ops.ts:98-100` `requireFull(entitlement)` (`entitlement !== "full"`), called at `:226` (`refreshPromotionProposals`) and `:758` (`decidePromotionProposal` — the accept path that writes a brain version), reached through `packages/db/src/app-server.ts:658-690`. No row, no `assertMintedEntitlement`, no per-receiver probe; under the object shape the compare is a typecheck error the implementer will meet, but the *cage* half — the whole runtime claim of P11-R1 — is absent at the receiver that gates approval writes: a `{ value: "full" }` smuggled through `as unknown as` reaches an accept. · Fix: a row, the cage check before the value check, a fourth `EntitlementForgeryError` probe; row 11's seam-scan predicate becomes "every function whose parameter is typed to one of the three entitlement types" (which finds this by construction). HIGH (tenancy T3 + learning L7).
- ❌ **Phase 11, Task 3 (rows 6–9, 28), P11-R1** — a sixth screen-side consumer: `app/(product)/studio/frameworks/copy.ts:50` takes `entitlement: PrivateFrameworkEntitlement` and compares `params.entitlement !== "included"` at `:59` — the same class row 28 was added for (`results/page.tsx:165,172`); not rowed; breaks typecheck under the object shape. MEDIUM.
- ❌ **Phase 11, Task 3 (row 10), P11-R1** — adding `packages/credits/src/mode-access.ts` to the base block's `ignores` (`eslint.config.mjs:961-965`) lifts **everything** that block applies, including `patterns: [APP_DIRECTION_DENY, CROSS_PACKAGE_DENY]` (`:979`), not only the two import names. The Stripe lift block re-applies both patterns for exactly that reason (`:993-999`); the plan's new `mode-access.ts` block names only the `trustWorkspaceId` path entry. A lift that exempts more than intended — the shape the brief asked me to hunt. · Fix: the new block carries both patterns; row 11's fixture plants a cross-package deep import at `mode-access.ts` and asserts red. MEDIUM.
- ❌ **Phase 2, Task 3 (row 17), P2-R8** — the prose-mention set was rebuilt in batch 1 as "twelve sites in seven files … by grep over `app/`, `packages/*/src/`, `worker/`, `lib/`, `scripts/`", but the measurement reached `app/` only: `packages/db/src/errors.ts:154`, `packages/db/src/with-workspace.ts:4128`, `packages/modes/src/hard-rules.ts:140` and `packages/modes/src/traceability.ts:146` each carry `[check]` inside a longer string (verified 2026-09-21), and `landing-sections.tsx:62` is a bare JSX text token. Row 17's "prose-mention set equals the twelve-site list" is red on day one and the recorded population is false (Golden rule 1) — the same row batch 1 repaired (#26). MEDIUM.
- ✅ **Phase 1, Task 5 (rows 14–27, 33)** — executable; kind-only type matches `run.ts:158`; every carrier citation reproduces (`projection.ts:76-84,141-144,229`; `generation-outcome.tsx:94-97,191-203,389-392,484`; `run-copy.ts:63-66`; `run-state.ts:184`; `spin-state.ts:105`; `kill-test.ts:446`); the four-spelling grep over `app`, `packages/*/src`, `worker`, `lib`, `scripts` finds exactly the plan's population plus `output.ts:236`; the `DISCLOSURE_LINE` sentence returns `[]` against the installed canon (`e98db76d`, re-run). One precision NOTE below (#15).
- ✅ **Phase 1, Tasks 1–3 (rows 1–3, 5–8, 11–12)** — the census's two regexes reproduce the 19-file measurement exactly; the outbound-HTTP predicate reproduces the six call sites and two SDK constructors exactly.
- ✅ **Phase 2, Task 5 (rows 26–38, mechanics)** — `promotion-schema.ts:136-141`, the digest readers `:237/:264-268/:441/:619/:668`, `uniqueIndex().where` (`indexes.d.ts:67`) and `onConflictDoNothing({ targetWhere })` (`insert.d.ts:65`) verified against the installed `drizzle-orm@0.44.7`; the trends vocabulary's 6 + 2 literals, the 8 `quote_budget_exceeded` sites, `:5171-5172`/`:5189` and the closure scanner's `:34` all reproduce. The mechanics are buildable; the semantics are #2.
- ✅ **Phase 5, Task 3 (rows 9–17, 30–33)** — executable; every fence and reader citation reproduces (`with-workspace.ts:574-584/786-796/2701-2713/2729-2739/5926-5958`; `membership-lifecycle.ts:125-208`; `profile-selection.ts:37-48`; `billing-contact.ts:56-57,94`; `stripe/actions.ts:293-296,594-602,615`; `export.ts:556,578,782,807`; `brain-ops.ts:696-703`; `credits/app-server.ts:696,737-738`; `brain/page.tsx` all eleven reads; `settings/account/page.tsx:43,57,63,66-67`; `export/route.ts:62,65`; `layout.tsx:20-40`; `profile-cage.test.ts:419,438`; `cancelScopedDeletion:2797-2802`, owner check `:2611-2623`); the `assertScoped`-only class reproduces exactly (17 sites). Two NOTEs below (#14, #17).
- ✅ **Phase 6, Task 4 (rows 9–11, 17–29)** — executable; `run-copy.ts:541-544`, `studio-panel.tsx:225,426`, `first-ideas-panel.tsx:80`, `first-ideas-result.tsx:78`, `with-workspace.ts:1791-1797`, the two `.from(results)` readers (`:1793`, `:2453`), `changelog.test.ts:92-100`, `modes.ts:21` all as cited; both new sentences and P2-R7's remedy return `[]` against the canon (re-run).
- ✅ **Phase 9, Task 2 (rows 2–7)** — executable; every prerequisite citation reproduces (`parseDeletionJournalEnv:56-73`, `composeDeletionJournal:78-84`, `:94`, `worker/deletion-lifecycle.ts:88`, `restore-verify.ts:124-131`, `createS3JournalClient` options `:44-52` and the loopback admission `:77-82`, `deletion-request-enablement.ts:15`, `account-view.tsx:45-46`). The IP-endpoint/path-style claim about the SDK is stated as fact and is proved only by AC3's run; acceptable because AC3 runs it.
- ✅ **Phase 11, Task 4 (rows 2, 10, 13–20, 26–27)** — executable; `autopsy.ts:27,129-152`, `system-autopsy.ts:414-428`, `system-spend.ts:181,1582-1588`, `autopsy-policy.ts:5`, `pasted-reference.ts:380-391`, `packages/trends/package.json` (no dependencies key) all reproduce; `StageAttemptError.code` is `string` and `system_model_usage.error_code` is a shape CHECK, so `verbatim_echo` needs no migration.
- ✅ **Phase 4, Task 2** — unchanged since batch 1 except the predicate; (i)–(iii) plus the alias pass reproduce the eleven writers; `deletion-commands.ts:192` is the namespaced spelling.
- ✅ **Phases 7, 8, 10, and the untouched tasks of 1, 2, 3, 4, 5, 6, 9, 11** — unchanged since batch 1, where they were simulated in full; re-spot-checked only where a batch-2 edit named them (Phase 8 :31–34, :39, row 20 — the four NOTEs are applied as asked).

**Simulation fidelity (§11), stated.** Lowest again on **Phase 3 Task 2** (rows 8–16, 33–37) — the BLOCK there was found only by asking what prompt the *second* callback carries, which no row or citation prompts an implementer to ask — and on **Phase 11 Task 3** (28 rows), where the two seam misses sit. Phase 2 Task 3's eleven exact-literal sites and the prose set were this time re-derived by grep in full.

### Pre-mortem (on the repaired text — the two batch-1 shapes and the five new shapes the brief named)

- ❌ **"Mandates wrong behaviour in its own AC" — Phase 3 AC4(b)** certifies "zero refusals, two `model_usage` rows" for a 12,000-token draft, a fixture that never scores; with usable creator rules the same draft is refused at the scoring call (#1).
- ❌ **Same shape — Phase 2 AC11** mandates that identical evidence re-proposes a creator-rejected rule (#2).
- ❌ **"One layer further in" — Phase 3 P3-R2**: two callbacks, one prompt producer enumerated (#1).
- ❌ **Same shape — Phase 11 P11-R1**: four receivers, three listed; six screen consumers, five listed (#3, #9).
- ❌ **Same shape — Phase 3 P3-R3**: an accessor is three edits (this plan's own #14), one file rowed (#4).
- ❌ **Same shape — Phase 3 P3-R2's way forward**: the error class needs the facade hop `app/**` can reach (#5).
- ❌ **Same shape — Phase 2 P2-R8**: roots stated as five, measured as one (#10).
- ❌ **A `partSizes` exemption that lets an unbounded part through** — not by the exempt list (unknown keys are bounded, per the text) but by *omission*: no witness that `partSizes` covers the prompt (#6).
- ✅ **A read sibling that keeps a lock but drops the epoch check** — the text keeps `assertFreshWorkspaceAuthority`/`assertFreshProfileAuthority` in both siblings (:37, fences 4–5); no probe witnesses it (NOTE #17).
- ❌ **A test lift that exempts more than tests** — the `mode-access.ts` ignore lifts the two direction/shape patterns too (#8).
- ✅ **A partial unique index that admits two `proposed` rows** — impossible by the predicate; the insert names it as its conflict target (`targetWhere`). The defect is what it *stops* refusing (#2), not what it admits.
- ✅ **A backfill `RAISE` that makes the migration unrunnable** — the condition is conjunctive in the text (live-grace dunning rows **and** no config document), so a fresh database migrates clean; but it is implied, not asserted, and the assertions have no test row (#7).
- ✅ **Phase 3 — the dunning marker with `eventAt` as its own watermark** — absorbed at :43–44, row 22, AC6; every site verified.
- ✅ **Phase 5 — the one-line green (`assertScoped:580` widened)** — absorbed at row 17(b), edge :111; the `createTierCheckoutUrl` probe is the witness.
- ✅ **Phase 5 — a scope minted in grace reads after `erasing`** — absorbed at fence 3's newest-operation re-read, row 17(c).
- ✅ **Phase 11 — an echo retried four calls at a time** — absorbed at row 27 (park on first `verbatim_echo`) and the refund at AC3.
- ✅ **Phase 9 — the drill seed cannot be made** — absorbed at :32 (a)–(c), row 2, AC3's withheld-variable cases.
- ✅ **Phase 6 — the non-zero sentence trips the canon** — absorbed; `[]` re-run.
- ✅ **Phase 1 — a scanner reads CRLF bytes** — absorbed at edge :126–127.

### Mechanical consistency (re-verified against the eleven files and the tree)

- ✅ **Row counts** — master :80's `33 / 38 / 37 / 25 / 33 / 29 / 18 / 22 / 21 / 17 / 28` equals every table (counted by script).
- ✅ **Depends-on ↔ master** — 2←1, 4←3, 6←1,2, 8←3, 9←1,3,4,5,8,11, 10←7, 11←8 match every header; the serial order respects every edge.
- ✅ **Critical-Path columns ↔ phase tables** — billing 3,4,5,6,8,9,11; tenancy 1,3,4,5,6,8,9,11; compliance 1,2,6,8,11; learning 1,2,6,11 — every phase file agrees; all five reviewer agents exist under `.claude/agents/`.
- ✅ **Estimates** — the Phases table equals every header; the sum is 53–70 h as stated.
- ✅ **R-134…R-147 ownership** — 134/135/136 → 3 (row 29); 137–140 → 5 (row 29); 141 → 1 (row 30); 142/143 → 2 (row 33); 144/146 → 8 (row 19); 145 → 11 (row 20); 147 → 9 (row 14). Next free on disk: R-134 (`decisions.md` ends at R-133), T-23 (`todos.md` at T-22), `0062` (`0061_vengeful_eternity.sql` is last).
- ✅ **`0062/0063/0064`** — intended order 3/4/2, landing order 2/3/4; the reconciliation rule (master Dependencies, Risks row 7), Phase 2's edge row and Phase 4's header agree.
- ✅ **Requirement → AC mapping** — every phase carries the table and every requirement id resolves (1: R1–R9; 2: R1–R12; 3: R1–R9; 4: R1–R7; 5: R1–R8; 6: R1–R7; 7: R1–R6; 8: R1–R6; 9: R1–R11; 10: R1–R7; 11: R1–R3).
- ✅ **Reachability / Least confident** — present and non-empty in all eleven.
- ✅ **The split lost nothing** — unchanged since batch 1's check.
- ✅ **No CR bytes** in any plan file.

### Least-confident lines — probed (batch 2)

| Phase | Declared bet | Result |
|---|---|---|
| 1 | census: 14 migratable-or-defensible; predicate reproduces 19 → 18 after blanking; carrier 7's fixture counts | holds — the regexes reproduce 19 exactly; `action-gate.test.ts:165` is the comment match |
| 2 | false-fire rate on hooks, both numbers | holds as posed; the undeclared bet — what a decided proposal does under the new uniqueness — fails (#2) |
| 3 | the input-token number | holds as a recorded choice; **fails on what the ceiling is applied to, again** — the scoring prompt (#1) |
| 4 | one trigger with the exempt-set pin | holds |
| 5 | `blocked → cancelled` at three sites | holds; the read grade is now declared and closed |
| 6 | modes-sentence pin from `MODE_SPECS` | holds |
| 7 | deriving contrast pairs from CSS | holds; fallback viable |
| 8 | fallback always cheap and present | holds |
| 9 | ORM bump clean | holds as checkable |
| 10 | marketing `<main>` in a layout | holds |
| 11 | the echo bound of eight | holds; the undeclared bet — that three receivers are all the receivers — fails (#3) |

---

### Consolidated findings — batch 2 (slot 9, all four checklists)

Severity is the plan-lane normalisation (gate-rules §4 / §9 row 4). Path and check id beside each; every location was verified in the tree by this reviewer.

**BLOCK (1)**
1. **Phase 3 P3-R2 :33–34, rows 5, 11, 13, 14, AC4(b)** — the kill-test scoring prompt (`assembleKillTestPrompt`, `kill-test.ts:143-167`, embedding `renderDraft(output)`; `scoreCreatorRules:` callback `generate.ts:934-946` → `meteredCall:1159`) carries no `partSizes`, so the ceiling bounds the vendor's own draft: a long admitted draft is refused `input_too_large` after one or two paid calls, the uncharged rows feed R16's lock-out, and the printed remedy cannot apply; AC4(b)'s two-row fixture cannot see it. Billing **B3** (a vendor-paid path that delivers nothing), **B7** (the plant is blind to the path). Conf 0.85. Fix: `draft`-exempt `partSizes` from `assembleKillTestPrompt` or a per-call allowance at the scoring callback; AC4(b) with usable rules and three rows; the four-site list keyed on prompt producers (Sample Spin's `SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS` at `run.ts:68,339` is the precedent).

**HIGH (3)**
2. **Phase 2 P2-R10 :51, rows 13, 36–38, AC11, edge :127** — under a `proposed`-only partial index a `rejected`/`accepted` digest is re-proposed on every refresh while its evidence stands; AC11 mandates it. Learning **L7** (approval semantics), R-115. Conf 0.8. Fix: uniqueness over `status NOT IN ('stale','superseded')`; fallback read over live+decided; decided rows propose nothing; AC11's `rejected` clause inverted, `accepted` clause added.
3. **Phase 11 P11-R1 :29, rows 1–4, 25, AC1** — fourth receiver `promotion-ops.ts:98-100` `requireFull` (`:226`, `:758`; via `db/app-server.ts:658-690`) has no row, no cage check, no probe; the accept path is the receiver without the runtime half. Tenancy **T3**, learning **L7**. Conf high.
4. **Phase 3 P3-R3 :41, row 33** — `sumBillableCostMicroUsd` lacks its name pin, `breachValidators` and `accessorArgs` entries (`profile-scope.test.ts:821,1055,1171-1235,2311`) — no cross-profile witness for a new scoped money read; Phase 6 #14's own rule not applied one phase over. Tenancy **T1**. Conf high.

**MEDIUM (6)**
5. **Phase 3 rows 6, 23** — `LlmInputTooLargeError` must be re-exported by the facade for `billing-errors.ts` to `instanceof` it (`app/**` may not import `@respin/llm`); row 6 names only the settlement export. Billing (the way forward is unreachable as rowed). Conf high.
6. **Phase 3 rows 11, 34–35** — no witness that the sum of `partSizes` covers the assembled prompt; `HARD_RULE_BRIEF`, `universalLaws`, the `Platform:` line and block headers are unlisted; a future part escapes silently. Billing **B3**/REQ-G05. Conf high.
7. **Phase 3 row 18, AC6** — the backfill/`RAISE` assertions have no receiving test row (`lifecycle-migration.test.ts` is the shape); the zero-dunning-rows-migrates-clean case is implied, not asserted. Billing **B7**. Conf high.
8. **Phase 11 row 10** — the `mode-access.ts` ignore lifts `APP_DIRECTION_DENY`/`CROSS_PACKAGE_DENY` unless the new block re-applies them; unstated. Tenancy **T1** (a fence widened). Conf high.
9. **Phase 11 rows 6–9, 28** — `studio/frameworks/copy.ts:50,59` is a sixth screen consumer comparing to `"included"`; not rowed. Tenancy (seam list). Conf high.
10. **Phase 2 P2-R8 :49, row 17** — the prose-mention list misses `packages/db/src/errors.ts:154`, `packages/db/src/with-workspace.ts:4128`, `packages/modes/src/hard-rules.ts:140`, `packages/modes/src/traceability.ts:146` (and `landing-sections.tsx:62`'s JSX text); the row-17 assertion is red on day one and the record is false. Compliance **S4/S5** (the `[check]` machinery's own population). Conf high.

**LOW (4)**
11. **Phase 1 P1-R1 :38 / P1-R2 :39** — the disclosure scan's roots are `app` + `packages` (no `worker`/`lib`/`scripts`) and the fetch measurement omits `scripts/`; both grep to zero there today (verified), so this is a future-producer hole. Compliance.
12. **Phase 3 row 16** — `generation-pricing.test.ts` is a package test and cannot import `app/(product)/billing-errors.ts` (`packages/credits/tsconfig.json` includes `src`/`tests` only; existing package tests only *read* app files as text); the copy assertion belongs in a root test.
13. **Phase 3 row 12** — `worker/production.ts` reads config through `getActiveConfigRequiringStored(db, ["llm.overallDeadlineMs", …])` (`:88-96`); say whether `llm.maxInputTokens` joins the required list (the worker refuses until `config:migrate` — a way forward, but a boot refusal) or takes the defaulted read.
14. **Phase 5 P5-R3 fence (3)** — the read sibling's treatment of the `users.lifecycleState = 'active'` join (`membership-lifecycle.ts:138-141`) is unstated; under an *identity* deletion in grace (P5-R1's cascade) it is the user row that tombstones, so R-140 should say whether export/history hold during identity grace.

**NOTE (5)**
15. Phase 1 :37 — "the traceability list already filters `/disclosure/*`" keeps hard findings (`generation-outcome.tsx:94-97`), unreachable in a usable state because hard traceability findings refuse (`kill-test.ts:258-270`); record the unreachability or drop them at row 19 too.
16. Phase 3 P3-R4 (5) — `inheritsGrace` is a webhook-side reader (`:1587`, `:2271`); the entitlement reader is `state.ts:318`, unchanged and still bounded because the marker prevents re-opening.
17. Phase 5 row 17 — no probe for a read sibling that keeps the lock and the newest-op re-read but drops the epoch check; a membership-version bump after mint → next read refuses would witness it.
18. Phase 3 row 37 — `run.ts:248` returns `refused("prompt_too_large")` while the shared check throws; say whether the site catches or compares.
19. Phase 3 :21 — the tenancy "why" names the census column only; the new `ProfileScope` accessor (row 33) is the second reason.

**Totals:** 1 BLOCK · 3 HIGH · 6 MEDIUM · 4 LOW · 5 NOTE = **19 findings** (batch 0: 64; batch 1: 44).

---

### §11 — plan-size dispositions (owner-confirmed accepted risk for 1, 2, 3, 5, 6, 11)

I do not contest the owner's acceptance, and I record where the risk actually sat this round: **every batch-2 finding of substance is an enumeration defect, not a size defect** — Phase 3 Task 2's BLOCK is one unasked question ("what prompt does the second callback carry?"), Phase 11's two seam misses are one grep not run over the receivers, Phase 2's prose set is one root not walked. A split would not have prevented any of them (2026-09-08 lesson). Fidelity was lowest on Phase 3 Task 2 and Phase 11 Task 3, as recorded above; Phase 3 Task 2 remains the natural cut if the owner wants one, but the cause to fix is the *predicate* — enumerate by producer and receiver (prompt producers, typed receivers, every root), not by call site.

### §10 — zero-path phases

Phases 7 (:16) and 10 (:14) each state one independent generalist review in a separate context, reserved before that phase's batch; both DoDs name it; master :91 says "each owe one … not none". Confirmed; nothing in batch 2 touched either file.

### Same-finding recurrence — the one thing the owner must know

**Yes: batch 2 returns the under-enumeration class a third time, in rows the batch-2 repair itself rebuilt.** Five instances: Phase 3 Task 2's second `meteredCall` callback (#1), Phase 11's fourth receiver and sixth screen consumer (#3, #9), Phase 3's new accessor without its pin (#4 — the lesson Phase 6 recorded as #14 in this same plan), Phase 2's prose set measured over one root (#10), and Phase 11's lint lift that widens more than one name (#8); plus one AC that mandates wrong behaviour (#2). **The rate fell sharply** — 64 → 44 → 19 findings, 7 → 2 → 1 BLOCK, all 44 applied, and every population whose predicate was written and run reproduces exactly (four re-derived by me) — so the authoring rule works where it is applied. Where it failed, it was applied to the *test* side of a row and not to the *production* side: the sixteen composing tests were listed, the four receivers were not; the site was listed, its two prompt producers were not. The residual invariant for the owner's §5 exchange, in one sentence: **a population row lists its producers and its receivers, not its call sites** — every function that builds the value reaching a bounded site, and every function whose parameter is typed to the guarded type — and the row says which grep produced each list.

---

### Verdict — retry batch 2

**NOT READY.** Billing **BLOCK**; tenancy **NEEDS CHANGES**; learning **NEEDS CHANGES**; compliance **NEEDS CHANGES**; generalist **NOT READY**. Readiness **Not yet**, grade **D** (gate-rules §4: a BLOCK).

Plan edits that move the most findings, in order:

1. **Phase 3 Task 2 (rows 5, 6, 11, 12, 13, 14, 16, 18, 33–35; AC4, AC6):** the scoring prompt carries `draft`-exempt `partSizes` (or a per-call allowance) and AC4(b) scores with usable rules — three rows, zero refusals; a `partSizes` completeness witness; row 6 re-exports `LlmInputTooLargeError`; row 16's copy assertion moves to a root test; a `profile-scope.test.ts` row for the accessor (pin, breach validator, args, table map); a migration-test row for the `0062` backfill and `RAISE` plus the zero-dunning-rows case; row 12 says which config read; the tenancy "why" names the accessor. (Closes #1, #4, #5, #6, #7, #12, #13, #18, #19.)
2. **Phase 2 P2-R10 / AC11 (rows 13, 36–38):** uniqueness over `status NOT IN ('stale','superseded')`; decided rows arbitrate the conflict and propose nothing; AC11's `rejected` clause inverted, `accepted` added. (Closes #2.)
3. **Phase 11 Task 3 (rows 1–11, 25, 28):** `promotion-ops.ts:98` on the seam list with the cage check and a fourth probe; `studio/frameworks/copy.ts` rowed; the new lint block carries both patterns with a planted cross-package import at `mode-access.ts`; the seam scan keyed on the typed parameter. (Closes #3, #8, #9.)
4. **Phase 2 row 17 and Phase 1 rows 7, 23:** the prose-mention set re-measured over every root and the count corrected; the two scans' roots widened to `ROOT_DIRS`. (Closes #10, #11.)
5. **Phase 5 (R-140, row 17):** the read sibling's user-lifecycle predicate stated; an epoch-drop probe. (Closes #14, #17.)

Plan-shaped severity test (gate-rules §9 row 4): #1–#10 change **what will be built** and re-run their reviewer; #11–#14 change what is built in location or scope and may ride the same repair; the NOTEs are advisory. Under the owner's 2026-09-21 decision (3), batch 3 is pre-approved after the §5 exchange above.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

## Retry batch 3

**Gate:** `respin-audit-remediation-2026-09-19-plan` · **retry batch 3, slot 10** — the sole evaluation of this batch under the 2.0 canon (`.claude/gate-rules.md`; `create-plan.md` Step 6), run under the owner's explicit pre-approval of 2026-09-21. **plan gate ran lean (consolidated).**
**Reviewer:** `plan-reviewer`, dispatched by name; frontmatter `model: fable`, `effort: xhigh` as *requested*; runtime model/effort unexposed. Read-only over the tree; the 2.0 agent definition forbids writing files, so this section was handed back to the orchestrator and appended verbatim (only this framing paragraph is the orchestrator's). No plan file, nothing under `respin/`, no other progress file touched; no mutation planted; no scratch file created. Every measurement below was an in-memory grep/`sed`/`tr`/`sha256sum` over the tree.

**Readiness: Almost · Grade: C · Batch 3 closes all 19 batch-2 findings and every population I re-measured equals its list; the under-enumeration class returns once, one hop further out — Phase 2 points two client-reachable modules at a `@respin/db` value import the repo's own client-bundle boundary refuses — and everything else is Low or wording.**

### Recurrence — the first sentence the owner needs

**Yes, once, smaller, and on a new axis.** Batch 3 does not return the class in any population *membership*: the fourteen lists whose predicates were re-run all reproduce exactly (below). It returns as a **hop** the authoring rule's part 4 names ("the host component that renders the second site"): Phase 2 P2-R8 rows 10 and 12 send `run-copy.ts` and `promotion-panel.tsx` to `@respin/db` for the `CHECK` constant, and both are inside a `"use client"` import graph that `tests/client-bundle-boundary.test.ts` (and Next's bundler) refuse (#1, HIGH). A second, weaker instance is a **spelling** in a predicate whose list is nonetheless complete: Phase 11's γ shape names a facade function that does not exist (#2, MEDIUM). Batches 0→1→2→3: 64 → 44 → 19 → **10** findings; BLOCKs 7 → 2 → 1 → **0**; class instances 5 → 2.

### Frozen inputs — sha256 (first 8), re-measured before reading

| Hash | File | Match |
|---|---|---|
| `4be21a1f` | master plan (as dispatched; table row `81c4836c` is the pre-reservation state) | ✅ |
| `b16ea9bc` `462c28e4` `1ad237f6` `5759ee39` `f1293266` `3e3330ea` `5bbeafa0` `69567a7d` `4d28a3c4` `485b8b0c` `77d038c0` | phases 1–11 | ✅ all eleven |
| `2052c45a` | codebase review | ✅ |
| `0425ee63` | phase-1-and-6-card.md | ✅ |

Also measured: audit register `c307e6ae`, ledger `acb8bf6e`, batch-2 repair brief `19f68090`, this file before the append `e1bbc43d`. Zero CR bytes in all twelve plan files (`tr -cd '\r' | wc -c`). Nothing changed since the freeze.

### Per-path verdicts (all four checklists applied)

| Path | Verdict | Basis |
|---|---|---|
| Respin billing & credits | **PASS** | batch-2 BLOCK #1 closed and re-measured (five producers, four sites); no Medium+; three Lows (#4, #5, #6) and two Notes carried |
| Respin brain tenancy | **NEEDS CHANGES (Medium, read-only fix, no re-review owed)** | #2 the γ predicate name; #3, #8 Low/Note |
| Respin spin compliance | **NEEDS CHANGES (High)** | #1 — the `[check]` home is unreachable from the two client-graph modules as rowed |
| Respin learning honesty | **PASS** | batch-2 #2 closed: `NOT IN ('stale','superseded')` verified against `promotion-ops.ts:222-282` and `promotion-schema.ts:136-141`; decided rows arbitrate, AC11 inverted correctly |
| Generalist (plan integrity) | **NOT READY** | two rows of one task cannot be executed from the plan text (#1) |

### Movement on batch-2's 19 — with re-measurements

| # (batch 2) | Disposition | Location | Re-measured (2026-09-21) |
|---|---|---|---|
| 1 BLOCK kill-test producer | **closed** | phase-3 :33–34, rows 38, 14; AC4(b) | **Producers = 5** — (A) `): AssembledPrompt` → `llm/assemble.ts:232`, `modes/assemble.ts:789,823`; (B1) `system: …SYSTEM` → `modes/assemble.ts:793,834`, `kill-test.ts:157`, `autopsy-vendor.ts:173`; (B2) anchored `return { system, prompt }` → `llm/assemble.ts:301` only. **Receivers:** `pipeline.ts:59,64`, `generate.ts:1163`, `run.ts:241,280`, `infer-voice.ts:208`. **`provider.complete(` production = 4**, test-side = 4. List = measurement |
| 2 HIGH P2-R10 | **closed** | phase-2 :51, rows 13, 36–37, AC11, edges :128–130 | `refreshPromotionProposalsInScope:222-282` read; two `proposed` rows for one digest impossible under the partial index; `migration-shape.test.ts:227` stays green |
| 3 HIGH `requireFull` | **closed** | phase-11 :29, row 29, AC1 | **Value-checking receivers = 4**; pass-throughs and producers as listed (33 typed hits, all accounted); literal compares = the plan's list exactly |
| 4 HIGH accessor four edits | **closed** | phase-3 :41, row 41 | `profile-scope.test.ts:1186`, `:1236-1237` verified |
| 5 MED facade re-export | **closed** | phase-3 rows 6, 23, 43; AC4(f) | `app-server.ts:110,375` precedent; `billing-ui.test.tsx:1112` |
| 6 MED `partSizes` witness | **closed** | phase-3 :33, rows 34, 39–40; AC4(e) | `contextBlock:549-593`, `HARD_RULE_BRIEF:786-803`, `:840-846` |
| 7 MED backfill test row | **closed** | phase-3 row 42, AC6 (a)–(c) | `lifecycle-migration.test.ts:22-30`; `graceDays` no default (`schema.ts:62`); `getActiveConfig` fails closed |
| 8 MED lint lift | **closed** | phase-11 :29, rows 10, 11 | `eslint.config.mjs:960-982`, `:983-1001` as cited |
| 9 MED `copy.ts` sixth consumer | **closed** | phase-11 row 30; row 8 | **Screen consumers = 7 files** by α/β/γ over `app/`; `promotion-panel.tsx` the one `.kind` exclusion (see #2) |
| 10 MED prose set | **closed** | phase-2 :49, row 17, AC9 | **Whole-literal `[check]` = 11 sites; prose = 17 sites / 11 files** over every root; `worker`/`lib`/`scripts` zero |
| 11 LOW roots | **closed** | phase-1 :38, :39, rows 7, 23 | zero in `worker`/`lib`/`scripts` |
| 12–19 | **closed** | phase-3 rows 16/43, :35 row 12, :44 (5), :34, :21; phase-5 :37 row 29, row 17(d); phase-1 :37 rows 21/27/33 | all citations verified |

**Movement totals:** 19/19 closed, 0 regressed, 0 open. Re-measurements all equal to the list: prompt producers (5), entitlement receivers (4) + screen consumers (7), subscription writers (**12 modules / 31 sites**), root census (**22 un-blanked / 21 blanked**), `[check]` whole-literal (11) + prose (17/11), disclosure carriers (**8 matches / 6 files** production incl. exempt `output.ts:236`; 3 test sites), outbound-HTTP call sites (6), Phase 5's `assertScoped`-only class (24 sites), Phase 9 Task 6's manifests (8, none with `license`).

### Execution simulation (every task batch 3 changed)

- ❌ **Phase 2, Task 3 (rows 10, 12; P2-R8 :49; AC9; row 17)** — *not executable as written.* Row 10 sends `app/(product)/studio/run-copy.ts:462` and row 12 sends `app/(product)/results/promotion-panel.tsx:40,129,135,168,255` to `@respin/db`'s `CHECK`. `promotion-panel.tsx:1` is `"use client"`; `run-copy.ts` is value-imported by `studio-panel.tsx:52` (`"use client"`), `feedback-block.tsx:21` and nine more client-graph modules. `tests/client-bundle-boundary.test.ts:41,130` walks every `"use client"` entry's value-import graph and reddens on any `@respin/*` specifier at any depth (`SERVER_ONLY = /^@respin\//`; only `@respin/auth/client` admitted) — `@respin/db` imports `pg`. Today no client-graph module value-imports `@respin/db`. The repo's precedent for a client module that needs a `@respin/db` constant is at `results/copy.ts:270-276` ("IT TAKES THE NUMBER RATHER THAN HOLDING ONE") and `feedback-block.tsx:36-37`. · Fix: `promotion-panel.tsx` takes `CHECK` as a prop from `results/page.tsx:89` (server); `run-copy.ts` stays the one client-safe `app/**` home, pinned equal to `@respin/llm`'s `CHECK` by a root test; row 17/AC9's expected set becomes the recorded **triple** (llm, db, `run-copy.ts`) with the reason written; row 15's allowlist entry still serves `brain-view.tsx` and `landing-sections.tsx` (server). Compliance **S4**; confidence high. **Changes what will be built.**
- ✅ **Phase 3, Task 2** — executable; every citation reproduces (`meteredCall:1159`, `try:1194`, `GENERATION_REFUSAL_CODES:310`, `refusalCodeFor:1604-1637`, `kill-test.ts:143-167`, `ScoreCreatorRulesFn:64`, `run.ts:66-68,81-83,241-250,280-285,333-340,435`, `schema.ts:62,545,597-598`, `production.ts:88-96,214`, `autopsy-vendor.ts:128-143`, `config.test.ts:290-312`, `profile-scope.test.ts:1186,1236-1237`, `billing-ui.test.tsx:1112`). No test constructs an `AssembledPrompt` literal, so the required member breaks no fixture.
- ✅ **Phase 3, Task 3** — executable; five writer/clearer sites verified; backfill `RAISE` conjunctive with a way forward (transactional; `config:migrate` then re-run).
- ✅ **Phase 2, Task 5** — executable; semantics now right.
- ✅ **Phase 11, Tasks 3–4** — executable; typed grep, literal compares, facade names (`app-server.ts:245-249`, `:666`), `mode-access.ts:160-168,181,228-232,294-300`, eslint blocks, `system-spend.ts:1582-1588`, `autopsy.test.ts:382-385,421`, `trends-view.tsx:179-185`, `trends-storage.ts:149-154` all reproduce. One predicate spelling (#2), one undecided fallback (#3).
- ✅ **Phase 5, Task 3** — executable; `assertScoped:574-584` byte-shape verified; 24-site class reproduces; probe (d) distinct.
- ✅ **Phase 1, Task 5** — executable; `run.ts:158,372-382`, `generation-outcome.tsx:93-96,389-392`, `projection.ts:76-84,141-144`, `kill-test.ts:258-262,336,446` verified. Note #10.
- ✅ **Phase 4, Task 2; Phase 9, Task 6** — executable; 12/31 and manifests reproduce.
- ✅ **Phases 6, 7, 8, 10 and untouched tasks** — unchanged since batch 2; the orchestrator's five [P2] edits re-spot-checked, all as recorded.

**Simulation fidelity (§11).** Lowest on **Phase 2 Task 3** — the one finding of substance came from asking "which of these eleven files can a browser reach?", a question no row prompts — and Phase 3 Task 2 (44 rows) where the three Lows sit. Both are enumeration-hop questions, not size questions.

### Pre-mortem

- ❌ One layer further out — Phase 2 P2-R8: the `app/**` hop enumerated was the eslint allowlist; the client-bundle boundary is the second fence on the same edge (#1).
- ❌ A spelling short in a predicate — Phase 11 γ (#2).
- ✅ An AC mandating wrong behaviour — none across every batch-3-changed AC; one imprecision (#5).
- ✅ `partSizes` exemption misnaming — absorbed by rows 39–40 and row 14's inverse mutation; the inverse direction (a creator part named `draft`) has no witness (#4, Low).
- ✅ `status NOT IN` index under concurrent refresh — impossible; `proposed` inside the predicate.
- ✅ Read sibling dropping the epoch check — probe (d) and its mutation.
- ✅ Test lift exempting more than tests — Phase 11 row 10 re-applies both patterns; Phase 3 row 13 / Phase 1 row 23 exclude by `tests/` segment over `PRODUCTION_ROOTS`.
- ✅ Backfill `RAISE` with no way forward — conjunctive, impossible on an app-written tree, refused-not-guessed, transactional; AC6(c) covers the zero-rows case.
- ✅ Paid-then-nothing on the scoring call; scope minted in grace reading after `erasing`; echo retried four calls at a time; scanner reading CRLF bytes — all absorbed.

### Mechanical re-verify

Row counts 36 / 39 / 44 / 25 / 34 / 29 / 18 / 23 / 22 / 17 / 31 = master :80 and every trailing line ✅ · Depends-on ↔ master ✅ · estimates = headers, sum 53–70 h ✅ · R-134…R-147 ownership ✅ (next free on disk: R-134, T-23, `0062`) · `0062/0063/0064` intended 3/4/2, landing 2/3/4 ✅ · Requirement → AC mapping complete by script ✅ · Reachability / Least confident / DoD present ✅ · Critical-Path selections = master ✅ · no CR bytes ✅.

### Least-confident lines — probed first

1 holds (22/21); 2 holds as posed — the undeclared bet (every `app/**` site can import `@respin/db`) fails (#1); 3 holds; 4–10 hold; 11 holds — the undeclared bet (the γ names are the facade's) fails for one of three (#2).

### Consolidated findings — batch 3 (slot 10)

**BLOCK (0)**

**HIGH (1)**
1. **Phase 2 P2-R8 :49, rows 10, 12, 15, 17, AC9** — `run-copy.ts` (value-imported by `studio-panel.tsx:52` and ten other `"use client"` modules) and `promotion-panel.tsx` (`"use client"` at `:1`) cannot value-import `@respin/db`: `tests/client-bundle-boundary.test.ts:41,130` reddens on any `@respin/*` specifier in a client graph, and the bundle would carry `pg`. Compliance **S4**. Conf high. Fix: prop-passing for the panel (`results/page.tsx` imports `CHECK`, hands `checkMarker`), `run-copy.ts` as the recorded client-safe third home pinned equal by a root test, AC9/row 17 over the triple. Changes what will be built.

**MEDIUM (1)**
2. **Phase 11 P11-R1 :29, row 11** — the γ predicate names `privateFrameworkEntitlementFor`, which does not exist: the facade exports `privateFrameworkEntitlement` (`credits/app-server.ts:247`), called at `frameworks/actions.ts:59` and `frameworks/page.tsx:221`. The seven-file list is right today (α catches both); a future mint-only private-framework screen is invisible. Tenancy **T1**. Fix: `privateFrameworkEntitlement\b` in γ. Read-only.

**LOW (4)**
3. **Phase 11 row 7** — `frameworks/page.tsx:214`'s literal is the fail-closed default for the `getBillingState` catch (`:207-224`); say what the page holds when the read throws: `privateFrameworkEntitlement("free")` in the catch, or `null` that `curateBlock` (row 30) treats as not included.
4. **Phase 3 P3-R2 :33, row 11** — the exempt set (`draft`, `findings`, `rewriteInstruction`) is global to every producer; a future producer naming a creator-supplied part `draft` is silently exempt. Fix: per-producer test asserts each exempt-named part is fed from a pipeline value, or the producer declares its exempt keys on `AssembledPrompt`.
5. **Phase 3 row 23 / AC4(a)** — the inference path throws without `partSizes` (row 36), so "names the largest part" cannot hold there; `billing-errors.ts` serves onboarding too. Row 23 needs a no-part branch with the onboarding remedy; AC4(a) says the inference refusal names the ceiling and the remedy.
6. **Phase 3 row 28** — `studio-panel.tsx` `maxLength` "courtesy bound": say where the number comes from; a typed literal is B5's hardcoded threshold. Precedent `feedback-block.tsx:36-37`: the page reads the config value and passes it as a prop.

**NOTE (4)**
7. Phase 3 P3-R2 :33 — the "six hits … four receivers" sentence is off by one file (the fourth `packages/credits` hit is `infer-voice.ts:208`; the typed callback parameter is `pipeline.ts:59/:64` in `packages/modes`). List complete.
8. Phase 11 P11-R1 — one `entitlementCage` for three types; three cages would make the cage refuse the cross-seam probe too.
9. Phase 3 row 34 — `contextBlock` returning named segments: say whether the joined prompt stays byte-identical or `prompt_bundle_version` moves; `pipeline.test.ts:524,539` and `spin-reference.test.ts` assert prompt content.
10. Phase 1 row 26 — `DISCLOSURE_LINE` in `run-copy.ts` (client graph): the facade import must be a whole-clause `import type` (`client-bundle-boundary.test.ts:72-84` counts a mixed clause as a value import).

**Totals:** 0 BLOCK · 1 HIGH · 1 MEDIUM · 4 LOW · 4 NOTE = **10 findings** (batch 0: 64; batch 1: 44; batch 2: 19).

### §11 / §10

Accepted risk for 1, 2, 3, 5, 6, 11 not contested — the risk sat in a hop the plan never named, not in size. Phases 7 and 10 each owe one independent generalist at build (files and DoDs say so; both unchanged since batch 2).

### Verdict — retry batch 3

**NOT READY.** Billing **PASS**; learning **PASS**; tenancy **NEEDS CHANGES** (Medium, read-only); compliance **NEEDS CHANGES** (High); generalist **NOT READY**. Readiness **Almost**, grade **C** (gate-rules §4: a High, no BLOCK). No further batch is authorised; the owner decides.

Plan edits that move the most findings: (1) Phase 2 rows 10, 12, 15, 17 + AC9 — prop-pass `CHECK` into `promotion-panel.tsx`; `run-copy.ts` the recorded client-safe third home pinned equal by a root test; P2-R8 reworded to "every server-reachable site" (closes #1; the compliance path re-runs on it under §3 only if the owner spends one). (2) Phase 11 row 11 γ → `privateFrameworkEntitlement\b` (closes #2; no re-review). (3) The six one-sentence Low/Note edits (closes #3–#10).
