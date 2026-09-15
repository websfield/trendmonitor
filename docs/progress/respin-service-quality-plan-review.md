# Plan review — respin-service-quality

Written by the generalist `plan-reviewer` (batch 2, last slot, 2026-09-15) and recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Merged-context posture: session model with a "think hard" instruction; each specialist's configured `effort: max` was not applied (gate-rules §7 lean trade).

**Readiness: Not yet · Grade: D · The plan is unusually well-anchored to the code, but three specialist verdicts still stand at NEEDS CHANGES on unverified fixes, one Phase 1 task names an error class the page cannot import, and the Phase 2 CI job is missing the environment it needs to start.**

Reviewer: `plan-reviewer` (generalist, batch 2 last slot), session model, read-only. Date: 2026-09-15. Inputs: master plan, phase 1–2, codebase review, brief, audit register, `CLAUDE.md`, gate-rules §11, plus ~60 line-cites re-read in `respin/` at baseline `3273f36`.

## Counts

| | High | Medium | Low | Total |
|---|---|---|---|---|
| Generalist findings (this review) | 2 | 7 | 10 | 19 |
| Standing specialist CHANGE items (batch 2, unverified fixes) | — | 6 | — | 6 |

## Scope and standing state (carried into the verdict)

- Three specialists ran three batches each. **Batch 2 was the last permitted retry.** Its verdicts, rendered on the text *before* the batch-2 fixes: tenancy NEEDS CHANGES (3 CHANGE), billing NEEDS CHANGES (2 CHANGE), compliance NEEDS CHANGES (1 CHANGE). All six were applied to the plan text on 2026-09-15 (Plan Review Log, "Disposition of batch 2"). **Those fixes are unverified by any specialist; no specialist PASS exists for any path.** Under gate-rules §3 a batch 3 needs the owner's explicit go-ahead.
- The owner has parked all payment work. The Non-goals record Trends autopsy/Spin and Results logging as **unassessed**; this review does not treat that as a gap.
- Gate intensity `lean`; tenancy and billing keep separate reviewers; compliance is the merged run.

## Batch history

| Batch | Tenancy | Billing | Compliance | Generalist |
|---|---|---|---|---|
| 0 | BLOCK (2 BLOCK, 5 CHANGE, 4 NOTE) | NEEDS CHANGES (3 CHANGE, 5 NOTE) | NEEDS CHANGES (5 CHANGE, 6 NOTE) | not launched |
| 1 | NEEDS CHANGES (5 CHANGE, 5 NOTE) | interrupted, no verdict | NEEDS CHANGES (1 CHANGE, 7 NOTE) | not launched |
| 2 | NEEDS CHANGES (3 CHANGE, 6 NOTE) | NEEDS CHANGES (2 CHANGE, 6 NOTE) | NEEDS CHANGES (1 CHANGE, 5 NOTE) | **this report** (on the post-fix text) |

## Execution simulation (as `respin-engineer`, plan text only)

Verified while walking: all 16 `AssemblyError` throw sites at the cited lines (`assemble.ts:174,186,193,295-391`); `AssemblyError` at `:107-112`; `locateQuote` `:264-273`; `validateSourceEvidence` `:5737`; the refusal catch `actions.ts:321-331`; `logRefusal(prefix, err, context: LogContext)` with `LogContext = Readonly<Record<string, string|number>>` (`safe-log.ts:107,160-168`); `ProfileScope.mint` `:2735-2743`; `generationsNewest` `:2466-2476`; `brainAssetSummary` seam `:2780-2787` and facade `app-server.ts:598-602`, `index.ts:437`; `profile-cage.test.ts:1309-1310`; `tableOf` `:2263-2320`; the three page mocks; `isolation.test.ts:263,1030,1248`; `client-bundle-boundary.test.ts:41,205`; `import-boundary.test.ts:1027-1036`; steps 6/8b `inference.ts:677-711,869-884`; seed `:60,63,84`; `run-copy.ts:553,556-566,579-589,456-459`; `studio-ui.test.tsx:566-594,596-622,741,1184,1747,2787-2790`; `claims-vocabulary-agreement.test.ts:44,201-222`; `HARD_CLAIM_FIELD_PREFIXES` includes `/disclosure/` (`claims.ts:467-470`); `studio-panel.tsx` testids incl. `studio-selected-cost` `:282-284`; `studio-view.tsx:79-87`; `studio/page.tsx:131-140`; the only `run={null}` is the no-profile branch (`:84-91`); `trends/page.tsx:305-317,322-330`; `trends-page.test.tsx:43-49` enumerated mock; `trackedNicheEntitlement` returns `{ maxTrackedNiches }` and throws `UnknownEntitlementTierError` (`mode-access.ts:310-318`, code at `billing-errors.ts:701`); `landing-pricing.test.ts:52-59`; `nav.tsx:9-21`; `auth-form.tsx:47,121`; `results/page.tsx:166,173`; `first-ideas-panel.tsx:65-91`; `platform-admin.spec.ts:29,41-56,64,70`; `requireAdmin` → `notFound()` `server.ts:120`; `getAuth` exported `auth/index.ts:30`; no `requireEmailVerification`/`generateId` in `packages/auth/src`; `production.ts:309,340` pass `process.env`; `handoff.ts:9`; `playwright.config.ts:23`; `auth.ts:17,28`; `db-shortcut.ts:52-56,66-82`; `docker-compose.yml:11,20`; `stripe.ts:2-3`; `activateBrainSection` at `solo-creator.spec.ts:265`; `waitForGenerationOutcome` returns `timed_out`; `worker:start` is plain `tsx worker/main.ts`; vitest includes `tests/**/*.test.{ts,tsx}`; `.gitignore` covers `e2e/journeys/artifacts/` and `playwright-report/`; all four reviewer agents and `respin-engineer` exist in `.claude/agents/`.

**Phase 1**
- PASS T1 — executable. Every cited anchor holds; the re-export inventory direction, the `import type` rule, the DB-backed cross-package harness (`infer-voice.test.ts:23,29,107,131`) are all real. Two gaps, neither blocking: AC3's "log-shape test on the action" has no file named (P1-7); the generative test's alphabet is unstated (P1-3). One pre-mortem miss inside its copy edit (P1-2).
- **FAIL T3 / Failure Modes row** — the `unknown` allowlist names "the driver's `DrizzleQueryError`". `@respin/db` does not export it (`packages/db/src/index.ts:2`: app may import only `respinDb`, `WorkspaceAccessError`, `ProfileAccessError` and types), `app/**` cannot import `drizzle-orm`, and the class never sets `.name` (`safe-log.ts:89-96`: `err.name` is literally `"Error"`). An implementer cannot write the `instanceof` the task text describes from `onboarding/page.tsx`. Fix: export a predicate from `@respin/db` (`index.ts` is already in the Files table) and name it in T3, or drop the driver class and let it rethrow (then the row and AC5 change). Everything else in T3 executes: the composition over `generationsNewest`, the enumerated registration points, the `tableOf` note (verified correct), the foreign-axis rejection.
- PASS T2 — executable; `signUp` currently waits `**/studio` (`auth.ts:28`), nav ITEMS verified.
- PASS T4 — executable; section positions and testids exist.
- PASS T5 — executable; `activeKinds` from the three histories the page already reads.
- PASS T6 — executable; the batch-2 rewrite is internally consistent (see opinion table). Wording nit P1-8.
- PASS T7 — executable; the premise "no state renders the generate panel with a profile and `run === null`" **holds** (the sole `run={null}` is the `!profile` branch), so the fallback clause is moot. The `initialState` mechanism and string-span fold check are specified to the level of a test.
- PASS T8 — executable; facade signature, error class, the enumerated mock and the seed row all verified; the expected plan list derives as creator/pro/studio.

**Phase 2**
- PASS T1 — executable, but the settled-wait lint test AC2 relies on is produced by no task and listed in no file (P2-2).
- PASS T2 — executable; retry rule residual P2-8.
- **FAIL T3/T4 (mechanism)** — `MAIN_CHAPTER_SCREENSHOT` "exported from each spec" cannot be read by `scripts/scan-journey-notes.ts`: importing a Playwright spec outside the runner throws at the top-level `test()` call, and screenshots are numbered `NN-name.png` (`artifacts.ts:72`), so the presence check is a suffix match the plan never states (P2-3).
- **FAIL T4 (environment)** — the job starts `db:migrate`, `db:seed`, the identity script, `pnpm dev` and `worker:start` with no enumerated env. Required by code: `DATABASE_URL` (compose maps **5435**, not the gate job's 5432 service), `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` (`create-auth.ts:354-355`, `server.ts:69`), `ANTHROPIC_API_KEY` (`worker/main.ts:14`, `credits/app-server.ts:525`), `ADMIN_USER_IDS`. There is no `respin/.env.example` to copy from. Also no readiness wait before the first spec (P2-1, P2-6).
- PASS T5 — executable.

**§11 plan size:** Phase 1's table is 40 rows bundling **46 distinct files** (master says "≈ 32 files"). I could simulate every task faithfully at this size, so the second §11 signal does not fire; the first (>25 rows) does. The master records a *request* for the owner's acceptance, not an acceptance — §11 requires the record (P1-6).

## Pre-mortem (shipped, then failed in production)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 refusal was a kind other than `quote_not_found`; tolerance is not the fix | T1 (i)(iii) record the kind first; Least-confident says so; Verification 3 is the diagnostic | Absorbed, honestly. The brief's "reproduce against the stored reply shape" is not possible (the reply is not retained) — the plan should say that outright. |
| 2 | Free creator refused with a kind, told to "try again", re-press refused before the vendor (50 > 25) | Failure Modes row states the money fact; `inference_unusable` copy at `billing-errors.ts:1170` still says "Your run was still made, so it counted; try again" and T1 only rewrites the "most often a quote…" guess | **No receiving task** for the copy's false remedy (P1-2). |
| 3 | Position map wrong around surrogate pairs / combining marks → evidence slice verbatim but pointing at the wrong span | AC2 generative test | Absorbed only if the alphabet includes them; unstated (P1-3). |
| 4 | Step header infers "done" | T3/AC5, states read not inferred | Absorbed. |
| 5 | Scoped-read failure on the step header takes the page down or renders "done" | T3 `unknown` allowlist | Absorbed in intent; not executable as written (P1-1). |
| 6 | Journeys fold the brain edit form; `activateBrainSection` ticks checkboxes inside a closed `<details>` | T4 opens the fold when nothing is in force; testids kept; Phase 2 verification 2 | Absorbed (first activation has no in-force version). |
| 7 | Nightly run passes on skips/refusals | T4 scan + AC5/AC6 planted violations | Absorbed. |
| 8 | CI red on cold `next dev` compile (> `navigationTimeout` 30 s), no product defect | — | **No receiving task** (P2-6). |
| 9 | Dev server/worker refuse to start in CI (missing `DATABASE_URL`/`BETTER_AUTH_*`) | T5 README "env" | **Not in the workflow task** (P2-1). |
| 10 | Nightly spend runs away | `schedule` disabled until ceiling; "job refuses to start above the ceiling" | The refusal mechanism has **no task and is unimplementable** from an ephemeral CI database (P2-4). |
| 11 | Admin password in a retained failure trace | T4 states the residual | Absorbed as residual; a cheaper full closure exists (P2-9). |
| 12 | Post-vendor `LlmError` (no kind) consumes the build; harness re-presses; balance gate refuses; note misleads | T2 retry rule | Money property holds (refused pre-vendor); note quality residual (P2-8). |
| 13 | `_handoff/` uploaded with credentials | T4 delete + scan on both trees + upload exclude | Absorbed. |
| 14 | Editor persona blocked because Profile A has no brain | T2 `buildVoiceBrain` for Profile A; AC1 | Absorbed. |

## Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| P1-1 | High | High | Phase 1 T3; Failure Modes row 2; AC5 | `DrizzleQueryError` is named in an `app/**` allowlist but is not exported by `@respin/db`, cannot be imported from `app/**`, and has `.name === "Error"` — the `instanceof` cannot be written. | Export `isDriverQueryError(err)` from `@respin/db` (name it in T3 and the `index.ts` row), or remove the class and let it rethrow; update the row and AC5 accordingly. |
| P2-1 | High | High | Phase 2 T4; technical checklist "one persistent secret" | CI env for migrate/seed/identity/dev/worker not enumerated: `DATABASE_URL` (port 5435), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`, `ADMIN_USER_IDS`. No `.env.example` exists. | List the env in T4 with sources; state `BETTER_AUTH_SECRET` is minted per run (ephemeral DB) so the one-persistent-secret claim stays true. |
| P1-2 | Med | High | Phase 1 T1 (iii); `billing-errors.ts:1170` | `inference_unusable` copy tells the creator "try again"; on Free the re-press is refused before the vendor. T1 rewrites only the "most often a quote" guess. DESIGN.md: refusals name the remedy; non-negotiable 6. | T1 rewrites the whole `detail`: no "try again"; the per-kind static sentence or the panel's price line is the remedy. Add to AC3. |
| P2-2 | Med | High | Phase 2 AC2; Files table | AC2's evidence is a "lint-style test over the spec sources" that no task writes and no file lists. | Add to T1 and the table (e.g. `respin/tests/journey-settled-waits.test.ts`), with the planted violation. |
| P2-3 | Med | Med | Phase 2 T3, T4 | Scan cannot `import` a spec to read `MAIN_CHAPTER_SCREENSHOT`; screenshot names are `NN-name.png`. | Move the per-persona map to `e2e/support/main-chapters.ts` (imported by specs and scan); state the suffix-glob rule. |
| P2-4 | Med | High | Master Derived Budgets, spend row | "the job refuses to start above the ceiling" has no task and cannot read cumulative spend from a DB created fresh per run. | Replace with an owner-side vendor spend limit; keep `/admin/model-spend` as per-run evidence only. |
| P2-5 | Med | High | Master Exit Demonstration vs Phase 2 T4/AC4 | Exit demo needs "two consecutive nightly runs"; `schedule` stays commented until the owner records a ceiling; no ledger row. | Exit demo = two consecutive `workflow_dispatch` runs; ledger row "enable `schedule`" → owner, with the README ceiling. |
| P2-6 | Med | Med | Phase 2 T4 | No readiness wait after `pnpm dev` (`next dev`, cold compile) before the first spec; `navigationTimeout` 30 s. | Add a readiness loop on `http://localhost:8000/` and a warm-up hit of `/sign-up`; state how background processes survive step boundaries. |
| P1-6 | Med | High | Master "Plan size"; Phase 1 Files note | 40 rows / 46 distinct files (master says ≈32). §11 signal fired; acceptance is requested, not recorded. | Correct the numbers; record the owner's acceptance (or split). |
| P1-3 | Low | Med | Phase 1 T1 (iv), AC2 | Generative alphabet unstated (surrogate pairs, combining marks, whitespace at quote edges, quote at index 0/end, `\n\n`); whether a quote may span a paragraph break is undecided. | State the alphabet and the paragraph rule. |
| P1-8 | Low | Med | Phase 1 T6 (ii); `run-copy.ts:563`; `studio-ui.test.tsx:581` | Dropping the clause leaves "a plain number, a name, where an ordinary word can land" — the test at `:581` pins the exact phrase and must be rewritten to a stated replacement. | Give the replacement sentence. |
| P1-7 | Low | Med | Phase 1 AC3 | "a log-shape test on the action" — file unnamed. | Name it. |
| P1-4 | Low | High | Phase 1 Files table | `page-wiring.test.tsx` row says T2, T7 but T3 also edits it; `first-ideas-result.tsx` is in T7 with no stated change. | Fix the notes. |
| P1-5 | Low | High | Master Requirement IDs; brief scope | "F-07–F-14" includes F-12 (billing page ergonomics), parked by Non-goals and claimed by no phase. | F-07–F-11, F-13, F-14. |
| P1-9 | Low | High | Master Dependencies | "No owner prerequisite except one secret" — T6 (viii) needs owner-approved decision text; Phase 2 verification 4 needs the owner to configure secrets and trigger. | List them. |
| P2-7 | Low | High | Phase 2 Files table; T4; Out of Scope | `e2e/support/stripe.ts` edited by T1 but absent from the table and named in Out of Scope; `scripts/e2e-admin-identity.ts` in the table but not in T4's File(s). | Reconcile. |
| P2-8 | Low | Med | Phase 2 T2 | Retry keyed on "no kind attribute" also matches post-vendor `LlmError`s that consumed the build (`inference.ts:806-807`); re-press is refused pre-vendor (no spend) but the note records a misleading second refusal. | Key the retry on the refusal code as well (banner `data-code`), or state the note wording. |
| P2-9 | Low | Med | Phase 2 T4 residual | Trace zip may carry the per-run admin password; `playwright test --trace off` for the admin spec (CLI, no config edit) or excluding `playwright-report/data/*.zip` closes it fully. | Offer it to the tenancy reviewer. |
| P2-10 | Low | Med | Master Derived Budgets | Recurring spend has no estimate; derivable now (≈7 vendor calls per run: solo 5, operator 1, editor 1). | Add estimate × 30 and the ceiling. |

## Mechanical consistency

- **Coverage parity** — PASS: 16 kinds ↔ 16 throw sites (verified); AC4 nav order ↔ `ITEMS` + Brain; AC10 testid sets ↔ `studio-panel.tsx`/`first-ideas-panel.tsx`; F-20 routes enumerated with `/for/*` from `AUDIENCES`; `hasGenerationForProfile` registration points enumerated (only `selected-profile-pages.test.tsx` imports the onboarding page directly; the other two mock lists are enumerated objects). FAIL: T3's `unknown` list names an unreachable class (P1-1).
- **Closure** — Phase 1: every task file is in the table and vice versa; two note mismatches (P1-4). Phase 2: `stripe.ts` missing from table; `e2e-admin-identity.ts` missing from T4; AC2's test absent everywhere (P2-2, P2-7). Owner agents: all exist. Evidence pointers: every AC has one; AC2 (Phase 2) points at a test nothing produces. Requirement IDs: F-12 mismatch (P1-5). Depends-on: Phase 2 → 1 only. Least-confident lines: both non-empty (probed below). Reachability lines: both name in-phase callers.
- **Deferral ledger** — three rows resolve to the parked plan + Non-goals. Missing: enabling `schedule` (P2-5).
- **Handoff contracts** — `AssemblyError.kind` + `data-assembly-kind`, testids, `signUp` wait, `hasGenerationForProfile` pinned in Phase 1 and cited by Phase 2. PASS.
- **Verifiability** — PASS/FAIL with evidence throughout; AC6 (Phase 2) depends on an owner action, stated.
- **Number provenance** — `minOwnPostsForVoice`, 50/25, wall times cited. Failing: file counts (P1-6), ceiling mechanism (P2-4), spend estimate (P2-10).
- **Invariant slugs** — 8 (Phase 1) + 2 (Phase 2), unique, each with a named test; new plan, no renames.
- **Paper dry-run of verification steps** — Phase 1 steps 1–7 runnable as written (step 3 honestly says three builds are impossible on Free). Phase 2 step 2 needs the env from P2-1 locally too (README T5 covers it); step 3 runnable; step 4 owner-gated.
- **Boil-the-lake** — Phase 1 covers every in-scope audit row; the one uncovered lake edge is the F-02 copy (P1-2).

## Least-confident probes

- **Phase 1** — "canonicalisation is what the run-2 reply failed on." Evidence: the log carried only `errorName: 'AssemblyError'`; 13 of the 16 kinds are unrelated to quote matching. The bet is genuinely open and the plan ships the diagnostic (kind) with the tolerance rather than before it. **Holds as an honest statement**; the plan should add that reproduction against the stored reply is impossible (not retained), and close P1-2 so the creator's dead end is not restated as "try again" whichever kind fires.
- **Phase 2** — "green on first `workflow_dispatch` without a runner surprise." Probe found two concrete surprises the line does not name: unenumerated env (P2-1) and cold-compile readiness (P2-6). **Fails as stated**; both are closable in text.

## Batch-2 fixes — generalist opinion (NOT a specialist verdict)

| Specialist CHANGE (batch 2) | Where fixed in current text | Opinion |
|---|---|---|
| Tenancy 1 — T3 text said the foreign axis returns `false` | T3 task text: "rejects `ProfileAccessError` … never swallowed into `false`"; AC6; w5 | Plausibly resolved; consistent across T3/AC6/w5 and with `mint` at `:2735-2743`. |
| Tenancy 2 — password scan could not read zipped traces | T4: no scan claimed; residual stated; per-run password; `::add-mask::` | Plausibly resolved by honest restatement; a full closure without touching config exists (P2-9) — the tenancy reviewer may prefer it. |
| Tenancy 3 — `unknown` population was a producer | Failure Modes row: explicit three-class list | Partially: it is now a list, but its third member cannot be tested from `app/**` (P1-1). Expect a further CHANGE unless fixed. |
| Billing 1 — `trends-page.test.tsx` mock not listed | T8: mock at `:43-49` named, three cases | Resolved; mock verified enumerated. |
| Billing 2 — harness retry counted a refused vendor call | Phase 2 T2: retry only on kind-less pre-vendor refusal; master spend row | Resolved in substance (max one vendor call per build); P2-8 is a note-quality residual, not money. |
| Compliance 1 — flag branch asked to both carry and not carry "disclosure"; text at `:556-566` misdescribed | T6 (vi): only the zero-count branch (`:553`) rescoped; flag/hard branches drop the clause only; AC9 | Resolved; verified against `run-copy.ts:551-567`; wording nit P1-8. |

## Ordered fix list

1. P1-1 — make T3's `unknown` allowlist executable from `app/**` (predicate export or drop the driver class).
2. P2-1 — enumerate the CI env in T4 (ports, auth secret/URL minted per run, vendor key, admin ids).
3. P1-2 — T1 rewrites the whole `inference_unusable` detail; no "try again" on a path the balance gate refuses.
4. P2-2 + P2-3 — name the settled-wait test and move `MAIN_CHAPTER_SCREENSHOT` into a support module the scan can import; state the suffix match.
5. P2-4 + P2-5 — drop the unimplementable ceiling refusal; restate the exit demonstration as two `workflow_dispatch` runs; add the `schedule` ledger row.
6. P2-6 — readiness wait before the first spec.
7. P1-6 — correct the size numbers and record the owner's §11 acceptance.
8. Low items P1-3, P1-4, P1-5, P1-7, P1-8, P1-9, P2-7, P2-8, P2-9, P2-10.
9. Then, with the owner's explicit go-ahead (gate-rules §3), a batch 3 for the three paths — the six batch-2 fixes are unverified and cannot be counted as PASS.

## Verdict

**NOT READY** — two tasks cannot be executed from the plan text as written (T3's unreachable error class; T4's missing environment), two pre-mortem causes have no receiving task (the "try again" copy; cold-start readiness), the exit demonstration is unreachable within the plan, and all three Critical-Path verdicts stand at NEEDS CHANGES on text the specialists have not re-read.

---

## Orchestrator addendum (2026-09-15, after the report)

The 19 generalist findings were applied to the plan text on the same day (see the master plan's Plan Review Log). One correction to the report's own text: `respin/env.example` exists (no leading dot); the env list finding stands regardless. Three findings were decisions, made conservatively: P1-1 → drop the driver class from the `unknown` allowlist (only the two scope errors render `unknown`; everything else rethrows); P2-4 → the nightly ceiling is an owner-side vendor spend limit, not a job-side refusal; P1-6 → the owner is asked to record acceptance of the Phase 1 size (46 files) or to split. **These post-report edits are unverified by any reviewer.** The gate's state is unchanged by them: NOT READY, retry budget exhausted, a specialist batch 3 (tenancy, billing, compliance) and a fresh generalist run need the owner's go-ahead.

---

# Batch 3 (owner-approved extension, 2026-09-15) — specialist reports

*Recorded verbatim by the orchestrator (only each tool's trailing "Ask /go…" footer omitted). Dispatch for all three: model inherit / no override requested (each agent's configured pin applies), read-only tools instructed (Read/Grep/Glob, no Bash); resolved model and effort not exposed. The tenancy reviewer disclosed one Bash call (`echo skip`) made against the instruction — it read and changed nothing. Fixed inputs: master plan, phase 1–2, codebase review, brief, audit register, and the batch-2 generalist report as revised by the post-report edits of 2026-09-15 plus the owner-decision record. `plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full.*

## Tenancy plan review — respin-service-quality — batch 3

**Readiness: Almost · Grade: C · Batch-2 fixes largely hold and nothing in the plan leaks, but eight fixable defects remain — a quote-location property that cannot catch a mis-mapped evidence slice, a journeys job that would run with the vendor key on every push/PR, and a scan order that makes the plan's own verification unpassable.**

Counts: 0 ❌ BLOCK · 8 ⚠️ CHANGE · 8 💡 NOTE.

Scope read: plan text for Phase 1 T1/T3 and Phase 2 T4. UGC (`src/`) and Cutdown untouched.

### Least-confident probes

- **Phase 1 (canonicalisation is the run-2 cause): unproven, correctly stated as such.** The audit register (`respin-journey-fixes-audit.md:25`) records only `errorName: 'AssemblyError'`, which has 13 reply-side sites (`assemble.ts:295-391`); tolerance only helps `quote_not_found`. One thing supports T1 regardless: today the code stores the model's own quote (`evidence: { inputId, quote: v.quote, ...at }`, `assemble.ts:383`) at offsets computed from the NFC-normalised needle (`:268-272`), so a quote that differs only by NFC already fails later as a `ProvenanceError` (`with-workspace.ts:5737`). Storing the original slice fixes that independently. Tenancy-wise the tolerance does not weaken provenance — provided C1 is fixed.
- **Phase 2 (green first run on hosted Docker, no `stripe listen`): partly holds on this path.** Env wiring verifies (5435 at `docker-compose.yml:20`; worker reads `process.env` at `worker/main.ts:10,14`, `worker/production.ts:309,340`; `requireAdmin` reads `ADMIN_USER_IDS` at request time and compares the Better Auth session id, `packages/auth/src/server.ts:43,119` — the minted id can match). Two defects stop a green run as planned: trigger placement (C2) and the delete/scan order (C3).

### Batch-2 CHANGE resolution

| # | Batch-2 CHANGE | Status | Evidence |
|---|---|---|---|
| i | T3 said the foreign axis returns `false` | **Closed** | T3, AC6, w5 now reject `ProfileAccessError`, matching `ProfileScope.mint` (`with-workspace.ts:2735-2743`) and precedent `profile-scope.test.ts:2248-2250`. (w5's P4 claim is overstated — C6.) |
| ii | password scan cannot read zipped traces | **Partly closed** | Scan claim removed and residual stated, but T4 still says excluding `data/*.zip` "closes that residual entirely" and "Secrets never reach an artifact", while calling the residual unscanned in the same paragraph; `playwright-report/index.html` (uploaded) may carry the same value (C4). |
| iii | `unknown` population was a producer | **Closed as a list** | Two named classes in `onboarding/page.tsx`; some expected refusals sit outside it and rethrow — safe, but unstated (N1). |

### Post-report edits on this path — verified against code

- **Allowlist reduced to the two scope errors: correct and executable.** `WorkspaceAccessError` is exported at `packages/db/src/index.ts:380` (the plan cites `:2`, which is a comment); `ProfileAccessError` is exported at `index.ts:484` and allowlisted for `app/**` at `eslint.config.mjs:214` (precedent import `app/api/export/route.ts:5`). So "confirm and add it" requires no edit — and names the wrong authority: importability from `app/**` is decided by eslint `allowImportNames`, not `index.ts` (N2).
- **Job environment enumeration: correct values.** `DATABASE_URL` 5435, `BETTER_AUTH_URL` (`create-auth.ts:355`), `ANTHROPIC_API_KEY` (`worker/main.ts:14`), `BETTER_AUTH_SECRET` per run, `ADMIN_USER_IDS` exported to `$GITHUB_ENV` before start — all verified. Placement in `respin.yml` is wrong (C2).
- **Report upload excluding `data/*.zip`: correct for trace zips, incomplete for the report** (C4).

### Findings

| Sev | Severity / confidence | Plan file · section | Evidence | Fix |
|---|---|---|---|---|
| ⚠️ CHANGE C1 | Medium / High | Phase 1 T1 (iv), AC2, w2 | The property `post.slice(start,end) === evidence.quote` + round-trip is **tautological once the stored quote is the slice**: a wrong position-table map-back (end one short, start drifted into adjacent text) still yields a quote "verbatim at its offsets", passes `validateSourceEvidence` (`with-workspace.ts:5737`) and both AC2 assertions — evidence the model never cited. The two-occurrence fixture has the same blind spot. | Add `canon(evidence.quote) === canon(modelQuote)` to the generative property and the cross-package case; add witness w2b (shift the mapped end by one → red). |
| ⚠️ CHANGE C2 | Medium / High | Phase 2 T4, AC4, stack "never on push or pull_request" | `.github/workflows/respin.yml:5-14` triggers on `push` and `pull_request`; triggers are workflow-level, not job-level. A `journeys` job added to this file runs on every push/same-repo PR with `ANTHROPIC_API_KEY` and real spend unless guarded, and AC4 ("triggers are exactly `workflow_dispatch`") is unsatisfiable in this file without removing the gate job's triggers. | Put the job in a new `.github/workflows/respin-journeys.yml` with `on: workflow_dispatch` (and `schedule` later); or a job-level `if: github.event_name == 'workflow_dispatch'` with AC4 rewritten to grep that guard. |
| ⚠️ CHANGE C3 | Medium / High | Phase 2 T4 step order; Verification 3; AC5 | The enumerated order is specs → scan → upload, and "delete `_handoff/`" is pinned only "before the upload step". `studio-operator.spec.ts:137` and the identity step both write `_handoff/` (`handoff.ts:9`), so a scan run before the delete exits 1 on a green run. Verification 3 ("scan on the run from 2 → exit 0") is unpassable locally for the same reason — an invitation to weaken the scan. | Pin: specs → delete `_handoff/` (`if: always()`) → scan → upload (`if: always()`, exclusions). Verification 3 deletes `_handoff/` first, then expects exit 0, plus a planted `_handoff/` case → exit 1. |
| ⚠️ CHANGE C4 | Low / Medium (~0.65) | Phase 2 T4 "Secrets never reach an artifact", "closes that residual entirely", "Stated residual" | Installed playwright-core 1.63.0 titles fill steps `Fill "{value}"` with `renderParams: ["value"]` (`node_modules/.pnpm-copy/playwright-core@1.63.0/.../lib/coreBundle.js:4139`); the HTML reporter stores step titles for all tests in `playwright-report/index.html` (base64 zip), uploaded and not excluded. `signIn` fills the per-run admin password (`e2e/support/auth.ts:37`). Impact nil (identity dies with the runner DB), but the recorded claim is false and self-contradictory. | Remove "closes entirely"/"never reach an artifact"; state one residual covering the whole `playwright-report` (index.html + `data/`), or upload `playwright-report` only on failure, or `--trace off` for the admin spec and state step titles. |
| ⚠️ CHANGE C5 | Low-Med / High | Phase 1 AC5, T3 tests | AC5's page-level assertions (called-with minted scope + profile id; listed class → `unknown`; `TypeError` rethrow) are assigned to `onboarding-ui.test.tsx`, which has zero `vi.mock` and never imports the page. The harness that imports `onboarding/page` with an enumerated `respinDb` mock is `tests/selected-profile-pages.test.tsx:23-58`. Unnamed, the wiring test risks becoming a source-string check with no executed code. | Point AC5's wiring/rethrow cases at `selected-profile-pages.test.tsx` (already in Files); keep view-state rendering in `onboarding-ui.test.tsx`. |
| ⚠️ CHANGE C6 | Low / High | Phase 1 Verification 7 (w5), AC6 | w5 says "catch `ProfileAccessError` inside the seam and return false → … and the P4 cross-parented case red". P4 (`profile-scope.test.ts:2253`) tests the row filter on a scope that minted successfully; catching mint errors cannot redden it. | Scope that mutation to the foreign-axis assertion; give P4 its own mutation (a seam bypassing `generationsNewest` with a profile-only filter). |
| ⚠️ CHANGE C7 | Low / High | Master plan Decisions (line 50, "admin identity is supplied from secrets"); Phase 2 functional checklist (line 40, "supplied from secrets"); codebase review line 113 | Contradicts T4's per-run minted identity; a static secret can never match (Better Auth mints the id — batch 1's finding). An implementer reading the checklist rebuilds the defect. | Rewrite all three to "minted per run by the identity step". |
| ⚠️ CHANGE C8 | Low / Medium | Phase 1 T3 (posts step from `content.onboarding.minOwnPostsForVoice`) | The page's config read is caught and swallowed (`onboarding/page.tsx:223-232`), so the minimum can be unavailable without a throw; the `unknown` rule is keyed only on thrown scope errors, so a null minimum becomes `next`/`done` — an inferred state against `step-state-derived-not-assumed`. | State: posts step `unknown` when the minimum (or the post read) is unavailable; add the case to AC5. |
| 💡 NOTE N1 | Low / High | Phase 1 Failure Modes row 2 | (a) The step reads can also throw plain `Error("lifecycle_refused:*")` (`membership-lifecycle.ts:44-46`) — via `getInterviewDraft`'s in-tx check (`interview-ops.ts:321`, `with-workspace.ts:3549`) and via `mint`'s `assertFreshWorkspaceAuthority` outside its catch (`with-workspace.ts:2744`); these rethrow to `error.tsx` — fail-closed and fine, unstated. (b) `mint` converts *any* error from its access check, driver errors included, into `ProfileAccessError` (`:2741-2743`), so "a database failure rethrows" is only true post-mint. | State both in the row so the list is complete. |
| 💡 NOTE N2 | Low / High | Phase 1 Failure Modes row 2 | `index.ts:2` is a comment whose "ONLY respinDb, WorkspaceAccessError" is stale; the export is `:380`; importability is `eslint.config.mjs:37,214`. | Cite those; drop "add it to index.ts". |
| 💡 NOTE N3 | Low / High | Phase 1 Handoff Contracts (registration points) | `page-wiring.test.tsx` and `first-login-pages.test.tsx` render Usage/Billing, not onboarding — adding the mock there is harmless but unnecessary; the real registration list is otherwise complete (seam, facade `app-server.ts:55` import + `:598`, `index.ts:437`, `profile-cage.test.ts:1309-1310`). | Optional. |
| 💡 NOTE N4 | Low / Med | Phase 2 T4 env | `$GITHUB_ENV` reaches only *subsequent* steps; `BETTER_AUTH_SECRET` must be minted in a step before the identity step, and it is not masked. | Pin the mint step; `::add-mask::` it. |
| 💡 NOTE N5 | Low / Med | Phase 2 T4 | On spec failure, later steps without `if: always()` are skipped; the upload's `_handoff/**` exclusion is the only guard that runs on every path. | Keep the exclusion; mark the delete step `if: always()`. |
| 💡 NOTE N6 | Low / Med | Phase 1 T1 (ii) | No minimum quote length (pre-existing); folding widens it slightly (a one-char `-` quote now matches any dash form). A quote empty after trimming must stay `quote_not_found` (`locateQuote`'s `needle.length === 0` rule, `assemble.ts:269`). | Add an empty-after-canonicalisation fixture; consider a minimum length as a separate decision. |
| 💡 NOTE N7 | Low / High | Phase 2 T5 README | Uploaded artifacts include full-page screenshots of synthetic personas' brain docs/generations and a console log (`artifacts.ts:53-77`); synthetic, but the brain-tenancy skill's PII rule (T6) asks content capture be stated. | One README sentence. |
| 💡 NOTE N8 | Info | Phase 1 T1 | Verified, no change: `parseVoiceReply` is not wrapped between `infer-voice.ts:236` and the action (`AssemblyError → inference_unusable`, `billing-errors.ts:611`), so `err instanceof AssemblyError` at `actions.ts:321-331` is reachable; the cross-package harness is real (`createTestDb` + `writeCapabilities`, `infer-voice.test.ts:22-31,131`). | — |

### Checks run

1 Single scoping helper — holds: the seam mints via `ProfileScope.mint` and composes the breach-tested `generationsNewest` (`with-workspace.ts:2466-2476`, `profile-scope.test.ts:1047,2296`); no raw table access. 2 Library stripping — n/a. 3 Append-only brains & provenance — stored evidence obeys the verbatim rule, but the property cannot detect a mis-mapped slice (C1); no brain mutation outside proposal/approval. 4 Sensitive inference — n/a. 5 Export & deletion — n/a (no new table). 6 Roles & admin boundary — allowlist can match the minted id (`server.ts:43,119`); CI trigger placement wrong (C2). 7 PII & secrets — vendor key on push/PR (C2); fill value in the report (C4); `BETTER_AUTH_SECRET` unmasked (N4); content capture unstated (N7). 8 Requirement provenance — "closes entirely" (C4), w5 P4 claim (C6), "supplied from secrets" (C7) are unbacked recorded claims.

Absences checked and not found: a scope minted from the wrong id, a missed mint registration point, the model's quote stored, the worker started before `ADMIN_USER_IDS` is exported, a driver error class imported into `app/**`.

**Verdict: NEEDS CHANGES** — no BLOCK and no leakage in the plan, but eight fixable defects on this path; C1 (tautological provenance property), C2 (journeys job inherits push/PR triggers with the vendor key) and C3 (delete/scan order makes a green run and Verification 3 fail) should be fixed first.

## Billing plan review — respin-service-quality — batch 3

**Readiness: Almost · Grade: C · T8's niche gate and the credits re-export are sound, but the harness retry keys on an attribute the product does not render, its "pre-vendor" list includes a post-vendor code, and the spend estimate counts presses, not vendor calls.**

Counts: 0 BLOCK · 8 CHANGE · 6 NOTE. No fix requires an allowance, price, ledger, metering, Stripe or rollout change; where a finding touches parked money work I say so.

Scope: plan text named in the brief (`docs/plans/respin-service-quality-master-plan.md` incl. Plan Review Log, `respin-service-quality-phase-1.md`, `-phase-2.md`, `docs/progress/respin-service-quality-plan-review.md`); codebase review and brief grepped for money terms; every money claim verified against `respin/` at HEAD `3273f36`. Read-only tools; no Bash.

### 1. Batch-2 CHANGE resolution

| Batch-2 CHANGE | Status | Evidence |
|---|---|---|
| (i) `tests/trends-page.test.tsx` enumerated `respinCredits` mock not listed | **RESOLVED** | T8 now names the mock `:43-49` (verified: enumerates only `settleParkedAutopsies`, `pastedReferenceQuote`), adds three cases, and has a Files row. Residual in N2. |
| (ii) harness retry counted a vendor call the Free balance gate refuses after an assembly refusal | **PARTIAL** | No-retry-on-kind is correct, and the money chain is verified: included build claimed at step 8b (`inference.ts:869-884`), rebuild 50 (`packages/db/src/seed.ts:60`) vs Free 25 (`:63`), step 6 refuses pre-vendor (`inference.ts:677-711`). The replacement rule has three new defects: C1 (attribute absent), C2 (a post-vendor producer), C3 (3 pre-vendor kinds). |

### 2. Money-touching post-report edits

- **Retry code list — producers enumerated:** `run_slot_busy` / `server_at_capacity` come only from `RunSlotBusyError` (`billing-errors.ts:1997-2000`), thrown at `inference.ts:740` — pre-vendor, pre-claim, pre-debit (`generate.ts:627` is not on the voice path). **Holds.** `workspace_paused` has three voice-path producers: `inference.ts:561-562` (step 4, pre-vendor); `with-workspace.ts:4075-4076` (`writeBrainDoc`, called by `inferVoice` at `infer-voice.ts:257-258` **after** `runInference` returns, i.e. after the 8b claim); `ledger.ts:413-414` (`debitCredits`, step 9 post-vendor, on a paid rebuild). **The "all pre-vendor" claim fails** (C2).
- **`stripe-unconfigured` keyless state:** `settings/billing/page.tsx:144` passes `isStripeConfigured()`; `billing-view.tsx:258-262` renders `stripe-unconfigured`. **Holds** — but the keyless state makes the editor-seat billing assertion vacuous (C6).
- **Spend call count vs four specs:** 7 generation presses per specs — but one generation is up to 3 vendor calls (C5).

### 3. New money defects introduced

- Facade widening: none — `trackedNicheEntitlementFor` exists (`credits/src/app-server.ts:642-650`), read-only (`state.ts:228-258`, `getActiveConfig`); T1's `app-server.ts` touch is re-export lines only (`AssemblyError` already at `:385`). **Holds.**
- Second `new Date()`: plan mandates one `at`, but no test can detect two instants (C4).
- Tier-name pinning: no — T8 tests are allowance-driven; the copy test may miss a dropped tier (C8).
- Double vendor call for one included build: not reachable on Free (every post-vendor re-press is priced 50 > 25 and refused at step 6); the remaining risk is unbuildability (C1) and wrong rationale (C2/C3).

### Findings

| # | Type | Sev | Conf | Plan file + section | Evidence (`respin/`) | Fix |
|---|---|---|---|---|---|---|
| C1 | CHANGE | Medium | High | phase-2 T2; phase-1 Handoff Contracts | The retry reads "the banner's `data-code`". The onboarding refusal banner has none: `run-outcome.tsx:45-52` renders only `data-testid="run-refusal"`. Phase 1 adds only `data-assembly-kind`; Phase 2 forbids product edits ("a testid the product lacks is a finding routed to Phase 1"). An implementer must reverse-map copy or fall back to "no kind attribute" — the batch-2 shape that re-presses after a post-vendor `LlmError`. | Phase 1 T1: add `data-code="<BillingErrorCode>"` to the `run-refusal` banner (id only, beside `data-assembly-kind`); list in Handoff Contracts; AC3 assert; Phase 2 consumes it. |
| C2 | CHANGE | Low-Med | High | phase-2 T2 ("pre-vendor … still the included build at 0 credits"); phase-2 Edge Cases | `workspace_paused` also comes from `writeBrainDoc` (`with-workspace.ts:4075-4076`) after `runInference`/8b claim (`infer-voice.ts:214-258`) and from `debitCredits` (`ledger.ts:413-414`). The list was built from one producer (non-negotiable 7). No money lost on Free (re-press refused at step 4/6), but the stated rationale is false. | Drop `workspace_paused` from the retry list (Free CI never pauses; pause chapter is gated off), or keep it and list all three producers with the post-vendor caveat. Name each code's producers in T2. |
| C3 | CHANGE | Medium | High | phase-1 T1 (iii) copy rewrite; Failure Modes row 1; phase-2 T2 no-retry rationale | 3 of 16 kinds are thrown by `assembleVoicePrompt` (`assemble.ts:174,186,193`), which runs at `infer-voice.ts:207`, **before** `runInference` at `:214`: no vendor call, no claim, re-press priced 0. The plan asserts every kind refusal follows the 8b claim and forbids naming a re-press; the shared `inference_unusable` copy today says "Your run was still made, so it counted" (`billing-errors.ts:1170`) — false for these three. | T1: partition kinds pre-vendor (no call, build not used) vs post-vendor (build used, Free re-press refused) in the per-kind sentences and the rewritten detail; pin the partition in AC3 with one pre- and one post-vendor fixture. T2: restate the no-retry rationale (still right — pre-vendor kinds are deterministic). |
| C4 | CHANGE | Low-Med | High | phase-1 T8 (shared `const at`) | T8's test uses `expect.any(Date)`, which stays green if the page makes two `new Date()` calls — exactly the two-instant defect the shared `at` exists to prevent (page comment `trends/page.tsx:322-330`). Lesson 2026-07-30: assert or delete the claim. | Add `expect(trackedNicheEntitlementFor.mock.calls[0][1]).toBe(pastedReferenceQuote.mock.calls[0][1])` (same object). |
| C5 | CHANGE | Medium | High | master Derived Budgets, spend row | "≈ 7 vendor calls" counts generation presses. Each generation calls the vendor for the draft (`modes/src/pipeline.ts:160`), one rewrite on a rejected draft (`:186`), and self-criteria scoring when that document is active (`pipeline.ts:318-319`, `generate.ts:934-935`) — solo activates it (`solo-creator.spec.ts:99`). Realistic: ~9–17 calls per run, before SDK `llm.maxRetries`. "Plus at most one retry after a pre-vendor refusal" adds a call that is not incremental (the refused attempt made none). The owner sizes the vendor limit from this. | Restate as presses × up to 3 calls per generation + 1 per voice build + SDK retries; give the range; drop "+1 retry". |
| C6 | CHANGE | Medium | High | phase-2 T1 (keyless Free billing) | With no Stripe key and an empty `stripePriceMap` (`seed.ts:74`), every subscribe/pack button is disabled for every role (`billing-view.tsx:226, 410-415, 442-451`), so `editor-seat.spec.ts:97-102` passes with the owner-only gate deleted. The REQ-A02/B6 check goes vacuous exactly when T1 moves CI keyless. | Assert the owner-only reason text is rendered in editor-seat (`billing-view.tsx:219-221` checks role first) and absent owner-side. |
| C7 | CHANGE | Low-Med | Med | phase-1 T1 (iii) "never a re-press the balance gate will refuse" | Other post-build codes also tell the creator to try again, which Free refuses: `brain_pointer_divergence` (`billing-errors.ts:1175`, thrown at `infer-voice.ts:253`, after `:214`), `llm_attempt_recorded` (`:1003`), `brain_content_schema` (`:1160`), `brain_content_walk` (`:1195`), `reference_echo` (`:1130`), onboarding `workspace_paused` override (`onboarding/copy.ts:232`). Rewriting one code but not its siblings breaks non-negotiable 7. (Only the first three are verified post-vendor on the voice path.) | Enumerate these in T1; either rewrite (copy-only) or add a Deferral Ledger row routing them to the parked plan as included-build copy. |
| C8 | CHANGE | Low | Med | phase-1 T8 copy test; AC11 | The `landing-pricing` precedent the plan cites, and the paste copy test, use substring `toContain` (`trends-ui.test.tsx:968`). If the seed drops `creator`, "Pro and Studio" is still a substring of "Creator, Pro and Studio" — a seed edit may not redden. | Assert the full sentence equals one built from the derived list; add a failing check against a seed clone with one tier set to 0. |
| N1 | NOTE | Low | High | phase-1 T8 "same tier at the same instant" | A shared `at` gives the same clock instant, not the same DB snapshot — `trackedNicheEntitlementFor` and `pastedReferenceQuote` each call `getWorkspaceBillingState` (`pasted-reference.ts:226` itself calls this "the two-read shape"). | Say "same clock instant". |
| N2 | NOTE | Low | High | phase-1 T8 mock | `beforeEach` (`trends-page.test.tsx:181-211`) needs a default `mockResolvedValue({ maxTrackedNiches: n > 0 })`, else every existing case renders against `undefined`. | Name the default. |
| N3 | NOTE | Low | High | phase-1 T8 Copy paragraph | "no facade or config read is added" reads as contradicting the facade call in the same task. | "no new facade method". |
| N4 | NOTE | Low | High | phase-1 T8; master Decisions | Seed-pinned copy can go false after an admin config edit without a deploy (B5). Stated, precedented (`paste-panel.tsx:76`); a live plan list would widen parked `packages/credits`; the blocking decision reads the live allowance; schema requires exactly the four tier keys (`config/src/schema.ts:132-140`). | Accepted residual; route to the parked plan. |
| N5 | NOTE | Low | Med | phase-1 Least confident; master Exit Demonstration | Probe: if the next real refusal is a post-vendor kind other than `quote_not_found`, the Free creator stays stuck (build consumed, rebuild 50 > 25), and the "voice build succeeding in both" exit runs may be unreachable without the parked re-ask. | State that outcome routes to the parked plan, not a retry here. |
| N6 | NOTE | Low | Med | master spend row; phase-2 Least confident | Probe: the vendor limit is required before `schedule`, not before the first two `workflow_dispatch` runs; I could not verify the Anthropic limit mechanism (per workspace vs per key). | Require the limit before the first dispatch; verify the mechanism when recording it (golden rule 9). |

### Checks run

1 (B1 append-only ledger): no ledger write in either phase; T8 read-only (`state.ts:228-258`) — holds. 2 (B2 Stripe idempotency): n/a, no webhook path; CI keyless. 3 (B3 debit-in-transaction): metering unchanged; T1 tolerance leaves the 8b claim and step-9 debit untouched (`inference.ts:869-973`) — holds. 4 (B4 expiry/pause): n/a except the pause code in the retry list (C2). 5 (B5 config-not-code): T8 blocks on the live allowance (`app-server.ts:647-649`); seed-pinned copy is a stated residual (N4); spend count wrong (C5). 6 (B6 tier gates / owner-only billing): Free allowance 0 (`seed.ts:84`) matches PRD §4G; `trackNicheAction` remains the gate (`trends/actions.ts:97-108`); owner-only billing assertion vacuous in keyless CI (C6). 7 (number provenance): 50/25/0 cited correctly; call count wrong (C5). 8 (money paths tested): T8 allowance-driven, rename-proof; shared `at` untested (C4); copy test may miss a dropped tier (C8); retry rule unimplementable (C1).

**Verdict: NEEDS CHANGES** — T8, the credits re-export and the no-retry-on-kind rule hold, but the retry reads an attribute nothing renders (C1), treats a post-vendor code as pre-vendor (C2), mislabels 3 pre-vendor kinds as post-vendor (C3), the shared-instant claim is untested (C4), the spend estimate undercounts vendor calls (C5), and keyless CI makes the owner-only billing check vacuous (C6). All eight CHANGEs are plan-text fixes that stay off the parked money path.

## Compliance plan review — respin-service-quality — batch 3 (lean merged run)

**Readiness: Almost · Grade: C · My batch-2 CHANGE is closed and the disclosure filter is sound, but six fixable text gaps remain — the worst is that the approved R-68 entry text, read literally, would license hiding concealment claims.**

Counts: 0 ❌ BLOCK · 6 ⚠️ CHANGE · 7 💡 NOTE.

Scope: plan text only, at HEAD `3273f36`; Phase 1 T5, T6, T7 and T1 (iii) refusal copy. `src/`, `cutdown/`, `docs/initial.past/` untouched.

### 1. Batch-2 CHANGE — closed

(ii) is now true against code: the flag branch `run-copy.ts:561-565` loses only "or something in the disclosure guidance"; the new sentence contains no "disclosure"; post-filter the flag bucket really is plain numbers and names (`plain-number`/`proper-noun` flag at `traceability.ts:267,274`; all `/disclosure/` flag at `:303-304`). (vi) touches only the zero-count sentence (`run-copy.ts:553`); the hard branch (`:556-560`) and flag branch make no universal claim, as the plan now says. `studio-ui.test.tsx:581` pins the exact old phrase and T6 rewrites it; `:567` asserts on the zero-count sentence and AC9 rewrites it; `:580` (`/\bnames? (was|were)\b/`) still passes against "a plain number or a name, where…". (ii), (vi) and AC9 agree.

### 2. Post-report edits on this path

- **Flag-heading sentence:** verified (§1).
- **`claims-vocabulary-agreement.test.ts:201-222`:** rewritten in place (imports `FLAG_ONLY_FIELD_PREFIXES` at `:44`, pins `["/disclosure/"]` at `:218-221`); the new `toEqual([DISCLOSURE_FIELD_PREFIX])` is the right relation — if `@respin/modes` adds a second flag-only prefix, the test reddens and forces a decision.
- **`inference_unusable` detail rewrite:** closes the "try again" in `billing-errors.ts:1170`; see C2 (per-kind sentences unscanned) and N2.
- **Fold check:** `vitest.config.ts:9` confirms `environment: "node"`; the string-span method over `renderToStaticMarkup` is the only viable one; ≥1-span, no-nested-`<details`, and w6 make it non-vacuous.

### 3. R-68 amendment — plan implementation

- **The filter cannot hide concealment:** it reads only `summary.traceability`; concealment lives in `summary.claims` (`generation-outcome.tsx:177-208`), hard on `/disclosure/` (`claims.ts:467-470`).
- **Stated residual is complete for what renders:** every `/disclosure/` shape loses offer, count and per-finding note; the stored `kill_test` and revision "unvouched" handling (`traceability.ts:114-132`) are unaffected; the revisit trigger is measurable because findings stay stored.
- **The entry's wording is not scoped to traceability** — C1.

### Findings

| # | Sev | Conf | Plan file + section | Evidence | Fix |
|---|---|---|---|---|---|
| **C1 ⚠️ CHANGE** | Medium | High | Phase 1 T6 (viii); master Plan Review Log owner decision (2) | Entry text: "`/disclosure/` findings are stored at flag level and **not listed**". R-69 (`decisions.md:884`, `claims.ts:467-470`) keeps `/disclosure/` concealment *claims* hard, and the plan's own `disclosure-claims-never-filtered` depends on them being listed (`generation-outcome.tsx:177`). As worded, the canon log reads as permission to filter claims too — a later "align code to decision" edit would hide concealment advice (S5). The master "Decisions baked in" bullet is correctly scoped; (viii) is not. | "`/disclosure/` **traceability** findings…" plus one clause: claim findings (concealment, hard since R-69) are unaffected and always listed. Tightens the approved text without reopening the decision. |
| **C2 ⚠️ CHANGE** | Medium-low | High | Phase 1 T1 (iii), AC3; *Least confident* | AC3 asserts only the shared detail has no "try again"; the 16 per-kind sentences have no such assertion, and the onboarding honesty scan (`onboarding-ui.test.tsx:1441-1451`) checks only the forbidden-claims canon. Probe: if the next real refusal is `not_json`/`bad_shape`/`fields_unfilled`/`list_max`, natural copy is "run it again" — refused pre-vendor on Free (50 > 25). | Extend AC3 to every `Record<AssemblyKind,string>` value: no re-press wording (e.g. `/try again\|run (it )?again\|press again\|rebuild/i`), proven with one planted sentence. |
| **C3 ⚠️ CHANGE** | Low | High | Phase 1 T6 (v) | Provenance sentence: "its **names and terms** are not listed here **as traced** to your brain". (a) The accepted residual is every shape — numbers and dates included ("within the first 3 seconds") — so the creator-facing limit is narrower than the decision. (b) The list under "Where the specifics came from" shows specifics **not** traced (`generation-outcome.tsx:114-151`); "not listed as traced" inverts it. | "…so its names, numbers and dates are not listed here." Keep the R-69 limit sentence. |
| **C4 ⚠️ CHANGE** | Low | High | Phase 1 T6 (vi) filter clause | The plan claims `prefix && enforcement === "flag"` makes a hard disclosure finding "surface rather than vanish", but no fixture witnesses it: deleting `&& flag` leaves AC9 and w3/w3b green (lesson 2026-08-26 no-witness shape). | AC9 fixture row `{enforcement:"hard", field:"/disclosure/guidance", token:"$4,000"}` asserted rendered; witness w3c: drop `&& flag` → red. |
| **C5 ⚠️ CHANGE** | Low | Medium | Phase 1 T7 test mechanism; w7 | Studio panel props are spread: `<StudioPanel {...run} />` (`studio-view.tsx:87`), `run` built in `studio/page.tsx`. The natural `initialState` leak is an object key, not a JSX attribute; a scanner matching `initialState=` and proven by a JSX-only plant misses it. A leaked `initialState` would render a draft that never passed the kill test (S3). | Scan for the identifier `initialState` anywhere under `app/**` except its two declaring panels; plant w7 in both shapes (JSX attribute and object key). |
| **C6 ⚠️ CHANGE** | Low | High | Phase 1 T6 (vii) | "The two stale comments" undercounts what becomes false: `generation-outcome.tsx:136-140` says the note "keys on `kind` and `field`" (false once (iii) removes the field branch); `run-copy.ts:538-547` says the heading's flag bucket "holds… disclosure dates" (false once counts are filtered). T1 also adds a type import to onboarding `run-copy.ts`, whose header (`:1`) says "NO imports at all". | Enumerate them in (vii), or make (vii) "every comment naming `/disclosure/`, `traceabilityFlagNote` inputs, or the import rule". |
| 💡 N1 | Low | High | T6 tests; harness facts | `:1184` is a projection-only test (`studioStateFor`, `:1167-1305`) — it renders nothing. The render-level `disclosure-claims-never-filtered` witness is `CONCEALMENT` (`:304-310`) rendered at `:821-835`, which already reddens under a claims filter. | Cite `:821-835` and keep it. |
| 💡 N2 | Low | Medium | T1 (iii) | 3 kinds are thrown before the vendor call (`assembleVoicePrompt` at `infer-voice.ts:207` precedes `runInference` at `:214`); for them the shared title "The model's answer could not be used" and any "your run counted" copy are false. Effectively unreachable (constant field list, DB-sourced post ids), but AC3 adds them to the scan. | Their per-kind sentence says nothing was sent to the model, or the shared detail makes no model-call claim. |
| 💡 N3 | Low | High | Failure Modes row 1 vs *Least confident* | Row 1 says "T1's tolerance is the whole remedy for the observed failure"; Least confident says it may not be. | "the only remedy this goal can ship". |
| 💡 N4 | Low | Medium | T5 | On a failed history read (`studio/page.tsx:141-149`) the in-force line would state "none in force" from a failed read. | Follow the nullable "could not be read" convention (`onboarding/run-copy.ts:49-51`). |
| 💡 N5 | Low | Medium | T5 / AC10 | T5 does not name whether `studio-in-force` renders in `StudioView` or `StudioPanel`; AC10 requires it in the whole-panel render — if it lands in the view, AC10 fails (loudly). | Name the file. |
| 💡 N6 | Low | Low | T6 (iii) | Removing the field branch leaves `traceabilityFlagNote`'s `field` parameter unused — may trip lint (unverified). | Decide: drop the parameter or keep it, and say why. |
| 💡 N7 | Low | High | T7 | The fold check detects `<details>` only, not `hidden`/`display:none`; "native `<details>` only" is plan policy, not enforced. | Optional: extend the span check. |

### Checks run

1 Sources · 2 Similarity gate · 3 Minimum difference · 8 Autopsy — n/a (no ingest/spin/autopsy code; Trends/Spin recorded unassessed). 4 Kill test honesty — holds: honest-refusal branch (`generation-outcome.tsx:473-525`) unchanged; `studio-no-stream`/`studio-status` outside the fold (AC10, w6). 5 No invented specifics — holds with C3/C4; creator-material offers kept (w3/w3b); residual owner-accepted. 6 No guarantees — holds: new sentences match no pattern in `tests/support/forbidden-claims.ts`; weakest point outside fold (AC10); C2 covers refusal remedies. 7 No automation / no concealment — holds with C1/C5: claims block never filtered; provenance sentence carries no concealment advice.

**Verdict: NEEDS CHANGES** — no BLOCK; six fixable plan-text gaps, of which C1 (the R-68 entry text must be scoped to traceability so it can never be read as licensing hidden concealment claims) matters most.

---

# Plan review — respin-service-quality — batch 3 generalist (final slot)

*Recorded verbatim by the orchestrator (the tool's trailing "Ask /go…" footer and file list omitted). Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the frozen plan text the three batch-3 specialists read, plus their reports above. None of the batch-3 findings has been applied.*

**Readiness: Not yet · Grade: D · The plan is anchored to the code and most batch-2 fixes hold, but Phase 2's admin-identity script cannot pass the project's own lint, Phase 2 consumes a page attribute Phase 1 never adds, one Phase 1 verification step is broken by Phase 1's own T8, and all three specialist verdicts stand at NEEDS CHANGES.**

`plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Reviewer context: session model, "think hard", read-only tools (Read/Grep/Glob, no Bash), HEAD `3273f36`. No commands run.

## Counts

| | High | Medium | Low | Info |
|---|---|---|---|---|
| Consolidated findings (after dedupe) | 1 | 16 | 15 | 19 |
| of which new in this review | 1 (G1) | 3 (G2, G3, G4) | 6 | 1 |

Severity normalisation: specialist "Low-Med"/"Medium-low" → Medium; tenancy C8 raised Low → Medium because it lets a named material invariant's check pass on an inferred state. No unrated CHANGE.

## Standing specialist verdicts (batch 3, recorded verbatim, not applied)

| Path | Verdict | Items |
|---|---|---|
| Brain tenancy (full) | NEEDS CHANGES | 0 BLOCK, 8 CHANGE, 8 NOTE |
| Billing & credits (full, scoped T8 + money claims) | NEEDS CHANGES | 0 BLOCK, 8 CHANGE, 6 NOTE |
| Spin compliance (lean merged run) | NEEDS CHANGES | 0 BLOCK, 6 CHANGE, 7 NOTE |

No path has a PASS; the retry budget ends with this slot.

## Batch-2 P-series resolution check (current text)

| ID | Status | Evidence / residual |
|---|---|---|
| P1-1 `unknown` allowlist | Resolved, one false sentence | Two scope errors listed, everything else rethrows; "a database failure rethrows" is only true post-mint — `mint` converts any error into `ProfileAccessError` (tenancy N1b, `with-workspace.ts:2741-2743`). |
| P2-1 CI env | Resolved with an ordering gap | Values verified; `$GITHUB_ENV` reaches only later steps and the secret is unmasked (tenancy N4). |
| P1-2 "try again" copy | Partly resolved | Shared detail rewritten; per-kind sentences unscanned (compliance C2); sibling codes still say try again (billing C7); 3 pre-vendor kinds described as post-claim (billing C3). |
| P2-2 settled-wait test | Resolved | `journey-settled-waits.test.ts` in T1 and Files. |
| P2-3 main-chapter map | Resolved | `e2e/support/main-chapters.ts`, suffix match (`artifacts.ts:72`). |
| P2-4 unimplementable ceiling | Resolved | Owner-side vendor limit; mechanism unverified (billing N6). |
| P2-5 exit demo vs `schedule` | Resolved | Exit demo on `workflow_dispatch`; ledger row. |
| P2-6 cold-compile readiness | Partly resolved | Warm-up GET `/studio` has no session — middleware redirects it; no product page compiles (G5). |
| P1-6 size numbers / acceptance | Resolved | 41 rows / ~46 files; owner acceptance recorded. |
| P1-3 generative alphabet | Resolved — **introduced a regression** | The new "may not span `\n\n`" rule refuses verbatim quotes the code accepts today (G3). |
| P1-8 replacement sentence | Resolved | Verified against `run-copy.ts:561-565`. |
| P1-7 log test file | Resolved in Files only | Missing from T1's File(s) column (G8). |
| P1-4 Files notes | Mostly resolved | T7 File(s) still lists `first-ideas-result.tsx`, which the Files table calls read-only (G8). |
| P1-5 F-12 | Resolved | Brief (line 7) still says F-07–F-14; shaping text, informational. |
| P1-9 owner prerequisites | Resolved | — |
| P2-7 stripe.ts / identity script closure | Resolved in text | The identity script itself is unbuildable as described (G1). |
| P2-8 retry keyed on code | Wording resolved, unbuildable | Banner has no `data-code` (billing C1); list includes a post-vendor producer (billing C2). |
| P2-9 trace zip residual | **Fix-induced regression** | "closes that residual entirely" is false; the value can also sit in `playwright-report/index.html` (tenancy C4). |
| P2-10 spend estimate | Added, undercounts | Counts presses, not vendor calls (billing C5). |

**Result:** 19 addressed in text; 11 fully resolved; 8 partly resolved or carrying a defect, 2 of them introduced by the fix itself (P1-3 → G3, P2-9 → tenancy C4).

## Execution simulation (as `respin-engineer`, plan text only)

Cross-checked in code this session: `.github/workflows/respin.yml:5-16`; `playwright.config.ts:13-28`; `package.json` scripts (dev `-p 8000`, `worker:start`, `lint: eslint .`); `worker/main.ts:10-14`; `packages/auth/src/server.ts:1-30`; `packages/auth/src/index.ts:1-36`; `create-auth.ts:341-355`; `eslint.config.mjs:584-608, 1017-1023, 1076-1078`; all four spec files; `e2e/support/{auth,artifacts,db-shortcut}.ts`; `docker-compose.yml:11,20,27-31`; `assemble.ts:107-112, 167-196, 264-273, 284-399`; `infer-voice.ts:202-258`; `onboarding/{run-outcome.tsx, run-state.ts, actions.ts:275-332, page.tsx:104-410, copy.ts:130-244}`; `billing-errors.ts:1157-1199`; `studio/{page.tsx:84-189, studio-panel.tsx:181-293, studio-view.tsx:64-91, run-copy.ts:530-594, generation-outcome.tsx:90-179}`; `brain-view.tsx` section structure; `nav.tsx:9-21`; `auth-form.tsx:47,121`; `seed.ts:45-94`; `billing-view.tsx:200-265`; `pipeline.ts:155-194`; `WorkspacePausedError` producers; `tests/onboarding-ui.test.tsx:1242-1270, 1379-1451`; `tests/selected-profile-pages.test.tsx` mocks and page import; `assemble.test.ts:145-213`. No `initialState` anywhere under `app/`; audience routes exist.

**Phase 1**
- **PASS\* T1** — executable, but builds three defects: a provenance property that proves nothing once the stored quote is the original slice (tenancy C1); an over-tolerant matcher no test would catch (G4); a paragraph-break rule that refuses quotes `assemble.ts:270` accepts today (G3). Does not add the `data-code` Phase 2 needs (billing C1).
- **PASS T2** — `auth.ts:28` and `nav.tsx` ITEMS verified.
- **PASS\* T3** — executable; the config read supplying the post minimum is swallowed (`page.tsx:223-232`), so a failed read renders the posts step as next/done instead of `unknown` (tenancy C8); AC5 wiring cases are assigned to a file with no mocks (tenancy C5; real harness `selected-profile-pages.test.tsx:23-57`).
- **PASS T4** — the confirm card (`brain-view.tsx:813-874`) is separate from Edit (`:507`) and history (`:664`), so the journeys' `activateBrainSection` still works. Low: the declared-metric editor (`:557`) is not addressed (L15).
- **PASS T5** — compliance N4/N5 are notes.
- **PASS\* T6** — compliance C1, C3, C4, C6.
- **PASS\* T7** — `<StudioPanel {...run} />` (`studio-view.tsx:87`) makes a leak an object key, not a JSX attribute (compliance C5).
- **PASS\* T8** — billing C4, C8. **It also breaks Verification 6** (below).
- **FAIL Verification 6** — T8 removes the niche form on Free, but `solo-creator.spec.ts:180` does `page.locator("#tracked-niche").fill(...)`, which times out at the 15 s action timeout and fails the spec; Phase 1's Out of Scope forbids editing the journey beyond the `signUp` wait (G2).
- PASS Verification 1–5, 7 as written.

**Phase 2**
- **PASS\* T1** — keyless CI makes editor-seat's owner-only billing check vacuous (billing C6, `billing-view.tsx:219-226`, `seed.ts:74`).
- **FAIL T2** — the retry reads the refusal banner's `data-code`; `run-outcome.tsx:45-52` renders only `data-testid="run-refusal"`, and Phase 2 forbids product edits (billing C1).
- **PASS T3**
- **FAIL T4**, three independent blockers: (a) **G1** — `respin/scripts/**` is linted with `appRestrictedImports({ operatorScriptSurface: true })` (`eslint.config.mjs:1076-1078`); its `@respin/auth` allowlist (`:584-608`) excludes `getAuth`/`createAuth`, and its message says those "stay package-only". So `scripts/e2e-admin-identity.ts` "signing up through the sanctioned server entry point" fails `pnpm lint`, which is in the entry gate. The Least-confident line's "a `respin/scripts/` file is outside `app/**`'s default-deny" is wrong: the default-deny covers everything except `packages/**` and `tests/**` (`:1018-1019`). (b) Workflow-level `push`/`pull_request` triggers (`respin.yml:5-14`) would also run the journeys job with the vendor key (tenancy C2). (c) The scan runs before `_handoff/` is deleted, and `studio-operator.spec.ts:137` writes to it, so a green run exits 1 (tenancy C3).
- **PASS T5**
- **FAIL Verification 3** — same `_handoff/` order (tenancy C3).

**Size (gate-rules §11):** Phase 1's 41 rows exceed the 25-row signal (owner-accepted); every task could still be simulated, so the second signal does not fire. No new size finding.

## Pre-mortem (shipped, then failed)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 refusal was a non-quote kind; tolerance is not the fix | T1 (i)(iii) record kind; Least confident | Absorbed honestly |
| 2 | Tolerant matcher maps the evidence slice one character off | AC2 | **Not absorbed** — property is vacuous (tenancy C1) |
| 3 | Canonicaliser too broad (case, punctuation) accepts text the creator never wrote while provenance passes | AC2 paraphrase fixture only | **No receiving check** (G4) |
| 4 | Verbatim quote spanning a paragraph now refused — assembly fails *more* often | T1 (iv) rule | **Plan causes it** (G3) |
| 5 | Free creator with consumed build hits a post-vendor kind: stuck, no voice brain, no Studio | Failure Modes row 1; money parked | Partial — copy honest, but no ledger row for the dead end or for the exit demo's "voice build succeeds in both" (G9, billing N5) |
| 6 | Refusal copy tells a Free creator to re-press on sibling codes | T1 rewrites only `inference_unusable` | **No receiving task** (billing C7, compliance C2) |
| 7 | Step header shows posts done/next when the config read failed | T3 | **Gap** (tenancy C8) |
| 8 | Hidden concealment claims justified later by the R-68 entry wording | T6 (viii) | **Gap** (compliance C1) |
| 9 | Test-only `initialState` leaks via the `run` object spread and renders an unchecked draft | T7 w7 scanner | **Gap** (compliance C5) |
| 10 | Journeys job fires on every push/PR with real spend | T4 / AC4 | **Gap** (tenancy C2) |
| 11 | Green CI run fails the scan because `_handoff/` still exists | T4 order | **Gap** (tenancy C3) |
| 12 | Admin identity step cannot be built without breaking lint — or someone widens the auth boundary to make it pass | T4 | **No viable receiving task** (G1) |
| 13 | Harness retries after a post-vendor refusal, or cannot find the code at all | T2 | **Gap** (billing C1, C2) |
| 14 | Cold `next dev` compile of authenticated pages exceeds the 30 s navigation timeout | T4 warm-up | Partial (G5) |
| 15 | Postgres not yet healthy at `db:migrate` | T4 | Masked by install time; no explicit wait (G11) |
| 16 | Failure evidence lost because each spec invocation overwrites `playwright-report/` | T4 | **No receiving task** (G10) |
| 17 | Owner sizes the vendor limit from an undercount | Master spend row | **Gap** (billing C5) |
| 18 | Editor billing boundary silently unasserted in keyless CI | T1 | **Gap** (billing C6) |
| 19 | Editor persona blocked for lack of a brain | T2 `buildVoiceBrain`; AC1 | Absorbed |
| 20 | Nightly run passes on skips | T4 presence scan; AC5 | Absorbed (the editor-seat `test.skip` at `editor-seat.spec.ts:25` is also caught by presence) |
| 21 | Phase 1 merge breaks the solo journey | Verification 6 | **Plan causes it** (G2) |

## Consolidated findings

Abbreviations: T-Cn/T-Nn tenancy, B-Cn/B-Nn billing, C-Cn/C-Nn compliance, Gn this review. "Built" = changes what is built; "Records" = changes only how the plan reads.

| ID | Sev / conf | Source | Plan file + section | Finding | Fix | Built / records | Code cross-check |
|---|---|---|---|---|---|---|---|
| H1 | High / High | G1 | P2 T4, Files, Least confident | `scripts/e2e-admin-identity.ts` cannot import `getAuth`/`createAuth` — scripts lint allowlist omits them (`eslint.config.mjs:584-608, 1076-1078`) and `lint` is in the entry gate; `server.ts:6-7` also imports `next/headers` at module top. The "answered" Least-confident claim is false. | Drop the script. Start dev (no allowlist) → sign up via the existing UI bootstrap branch of `platform-admin.spec.ts:41-56` (UI sign-up + `lookupAuthUserId` via docker psql, handoff written) → export `ADMIN_USER_IDS` → kill dev → restart dev + start worker in a later step → readiness. Do **not** widen the auth lint allowlist. | Built | Confirmed |
| M1 | Medium / High | T-C1 | P1 T1 (iv), AC2, w2 | `post.slice === evidence.quote` is tautological once the quote *is* the slice; a one-char map-back error passes AC2 and `validateSourceEvidence`. | Add `canon(evidence.quote) === canon(modelQuote)` **and** "slice's first/last character is not whitespace unless the model quote's is"; w2b shifts end into a **non-whitespace** character. | Built | Confirmed by logic (`assemble.ts:264-273, 383`) |
| M2 | Medium / High | G4 | P1 T1 (iv), AC2, invariant `evidence-quote-still-required` | Only a one-word paraphrase guards the negative side. A canonicaliser that lowercases or strips punctuation passes AC2 and w1, and because the stored quote is the original slice, provenance passes too. The named check cannot fail on over-tolerance. | Pin the canonical map as a table-driven unit test (only the listed characters fold); add a generative negative property (canon-non-substring → `null`); witness w1b (case-fold inside canon → red). | Built | Confirmed (`assemble.ts:268-272`) |
| M3 | Medium / Med | G3 (from the P1-3 fix) | P1 T1 (iv), Edge Cases row 2 | "A quote may not span `\n\n` — `quote_not_found` by rule" refuses verbatim cross-paragraph quotes the exact `indexOf` accepts today (`assemble.ts:270`), and clashes with "whitespace runs → one space". Makes the failure T1 exists to fix more frequent. | Canonicalise `\n{2,}` to a paragraph token distinct from space: a verbatim quote across a break still locates; a quote with a space where the post has a break is `quote_not_found`. Generative draws include verbatim `\n\n` spans. | Built | Confirmed |
| M4 | Medium / High | T-C2 | P2 T4, AC4, Files | Triggers are workflow-level (`respin.yml:5-14`); a `journeys` job there runs on push/PR with the vendor key, and AC4 cannot pass in that file. | New `.github/workflows/respin-journeys.yml`, `on: workflow_dispatch`; AC4 greps that file; Files updated. | Built | Confirmed |
| M5 | Medium / High | T-C3 | P2 T4 steps, Verification 3, AC5 | Scan-before-delete fails a green run (`_handoff/` written by `studio-operator.spec.ts:137` and the identity step). | Order: specs → delete `_handoff/` (`if: always()`) → scan both trees → upload (`if: always()`, exclusions); Verification 3 deletes first; planted `_handoff/` → exit 1. | Built | Confirmed |
| M6 | Medium / High | B-C1 | P2 T2; P1 T1 (iii), Handoff Contracts, AC3 | `run-refusal` banner has no `data-code` (`run-outcome.tsx:45-52`); T2's retry key is unreadable. | P1 T1 adds `data-code="<BillingErrorCode>"` beside `data-assembly-kind`; pin in Handoff Contracts; AC3 asserts it. | Built | Confirmed |
| M7 | Medium / High | B-C3 + C-N2 | P1 T1 (iii), Failure Modes row 1; P2 T2 rationale | `no_fields_supplied`, `duplicate_post`, `duplicate_field_request` throw inside `assembleVoicePrompt` (`infer-voice.ts:207`) before `runInference` (`:214`): no vendor call, no claim. Copy and rationale assume every kind is post-claim. | Partition `ASSEMBLY_KINDS` pre/post-vendor; pre-vendor sentences say nothing was sent and nothing spent (and that it is ours to fix — deterministic); the shared detail makes no "run counted" claim; AC3 one fixture each. | Built | Confirmed (`assemble.ts:174,186,193`) |
| M8 | Medium / High | C-C1 | P1 T6 (viii); master decision (2) | Entry text "`/disclosure/` findings … not listed" reads as covering *claims* — licensing hidden concealment advice (R-69 keeps those hard). | "`/disclosure/` **traceability** findings…" + "claim findings (concealment, hard since R-69) are unaffected and always listed". Show the owner — it tightens approved text. | Built (canon decision log) | Confirmed (`generation-outcome.tsx:177`) |
| M9 | Medium / High | C-C2 + B-C7 | P1 T1 (iii), AC3 | Per-kind sentences unscanned for re-press wording; sibling voice-path codes still say try again (`brain_pointer_divergence` `billing-errors.ts:1175`, `brain_content_walk` `:1195`, `brain_content_schema` `:1160`, `reference_echo`). | AC3 regex over every per-kind sentence (`/try again\|run (it )?again\|press again/i`), proven with a planted sentence; for siblings, **onboarding-only overrides** in `ONBOARDING_OVERRIDES` (`onboarding/copy.ts:228`; add the file to Files) or a Deferral Ledger row — **not** rewriting the shared entries (see conflicts). | Built | Confirmed; codes are shared with `brain/*` |
| M10 | Medium / High | B-C5 | Master Derived Budgets | "≈7 vendor calls" counts presses; each generation up to 3 calls (draft `pipeline.ts:160`, rewrite `:186`, scoring); "+1 retry" is not incremental. | presses × up to 3 + 1 per voice build + SDK retries (≈9–17); drop "+1". | Records (sizes owner's limit) | Confirmed |
| M11 | Medium / High | B-C6 | P2 T1; editor-seat | Keyless CI + empty `stripePriceMap` disables every billing button for every role, so `editor-seat.spec.ts:97-102` passes with the owner gate deleted. | Editor-seat asserts the not-owner reason text (`billing-view.tsx:219-221`); owner run asserts it absent. | Built | Confirmed |
| M12 | Medium / High | G2 | P1 Verification 6, Out of Scope; T8 | After T8, `solo-creator.spec.ts:180` cannot fill the missing `#tracked-niche`; Verification 6 fails. | Either T8 adds a minimal branch in the solo spec (settle on `niche-disabled-tier`) and lists the file, or move Verification 6 to Phase 2 and say so. | Built | Confirmed (`track-niche-panel.tsx:37-40`) |
| M13 | Medium (↑ from Low) / Med | T-C8 | P1 T3, AC5, invariant `step-state-derived-not-assumed` | Config read giving `minOwnPostsForVoice` is swallowed (`page.tsx:223-232`); a null minimum renders next/done. | Posts step `unknown` when the minimum or the post read is unavailable; AC5 case. | Built | Confirmed |
| M14 | Medium (Low-Med) / High | T-C5 | P1 AC5, T3 tests | Page-level wiring/rethrow cases pointed at `onboarding-ui.test.tsx`, which has no `vi.mock`. | Point them at `selected-profile-pages.test.tsx:23-57` (already imports the page and mocks `readBrainHistory`/`getInterviewDraft`). | Built | Confirmed |
| M15 | Medium (Low-Med) / High | B-C2 | P2 T2, Edge Cases | `workspace_paused` also produced by `writeBrainDoc` (`with-workspace.ts:4076`, post-claim) and `debitCredits` (`ledger.ts:414`). | Drop `workspace_paused` from the retry list; name each remaining code's producer. | Built | Confirmed |
| M16 | Medium (Low-Med) / High | B-C4 | P1 T8 tests | `expect.any(Date)` cannot catch two `new Date()` calls. | Assert same Date object across both calls. | Built | Logic sound (not code-checked) |
| L1 | Low / Med | T-C4 | P2 T4 "closes entirely", "never reach an artifact" | Fill values can appear in `playwright-report/index.html`; self-contradictory text. | With H1's fix the admin uses the repo's constant throwaway password (`auth.ts:17`) — no secret; delete the absolute claims, state one residual. | Records | Not verified (Playwright internals) |
| L2 | Low / High | T-C6 | P1 Verification 7 w5 | Catching mint errors cannot redden P4. | Split: foreign-axis mutation vs a separate P4 mutation. | Built (tests) | Logic |
| L3 | Low / High | T-C7 + G6 | Master :30 and :50; P2 checklist :40; codebase review :113 | "supplied from secrets" contradicts the per-run minted identity. | "minted per run" in all four. | Records | Confirmed |
| L4 | Low / Med | B-C8 | P1 T8, AC11 | Substring check can miss a dropped tier. | Exact-sentence equality built independently from the seed; a seed clone with one tier at 0 → red. | Built (tests) | Logic |
| L5 | Low / High | C-C3 | P1 T6 (v) | "names and terms … not listed here as traced" is narrower than the accepted residual and inverts what the list shows. | "…so its names, numbers and dates are not listed here." | Built (copy) | Confirmed (`generation-outcome.tsx:114-151`) |
| L6 | Low / High | C-C4 | P1 T6 (vi), AC9 | `&& flag` unwitnessed (a hard disclosure finding cannot arise today, `traceability.ts:297,303`). | Synthetic hard `/disclosure/guidance` row asserted rendered; w3c. | Built (tests) | Confirmed |
| L7 | Low / Med | C-C5 | P1 T7, w7 | `initialState` scanner misses object-key/spread leaks. | Identifier-wide scan under `app/**` except the two panels; plant both shapes (no existing `initialState` in `app/`, so no false positives). | Built (tests) | Confirmed |
| L8 | Low / High | C-C6 | P1 T6 (vii) | More stale comments: `generation-outcome.tsx:136-140`, `run-copy.ts:538-547`, onboarding `run-copy.ts:1` "NO imports". | Enumerate. | Built (comments) | Confirmed |
| L9 | Low / Med | G5 | P2 T4 warm-up | Unauthenticated GET `/studio` is middleware-redirected; compiles no product page. | Warm up with the identity's session cookie, or state the cold-compile residual and the re-dispatch rule. | Built | Confirmed (`server.ts:1-3`) |
| L10 | Low / Med | G10 | P2 T4 | Four `playwright test` runs overwrite one `playwright-report/`. | Per-spec `PLAYWRIGHT_HTML_OUTPUT_DIR`; upload all. | Built | Inferred from config |
| L11 | Low / Med | G11 | P2 T4 | No health wait before `db:migrate`. | `docker compose … up -d --wait` (healthcheck at `docker-compose.yml:27-31`). | Built | Confirmed |
| L12 | Low / Med | G9 + B-N5 | Master Exit Demo; ledger | No rule for a demo run whose voice build fails on a model reply; the Free dead end has no ledger row. | State the re-dispatch rule; ledger row routing the stuck-Free-creator case to the parked plan. | Records | — |
| L13 | Low / High | G7 | P1 "## Depends on: none" | Contradicts the header's creator-ready Phase 0 dependency. | Fix the line. | Records | — |
| L14 | Low / High | G8 | P1 T1/T7 File(s) columns | Closure mismatches (`onboarding-refusal-log.test.ts`, `first-ideas-result.tsx`). | Reconcile. | Records | — |
| L15 | Low / Med | G15 | P1 T4 | Declared-metric editor (`brain-view.tsx:557`) not addressed by the fold rule. | State whether it folds. | Built | Confirmed |
| Info | — | T-N1–N8, B-N1–N4/N6, C-N1, C-N3–N7 | various | Carried as recorded; adopt in the same edits T-N4 (mint+mask `BETTER_AUTH_SECRET` in an earlier step), T-N6 (empty-after-canon fixture), B-N2 (`beforeEach` default mock), C-N1 (cite `studio-ui.test.tsx:821-835` as the render witness). | — | mixed | — |

## Conflicts and fix-induced risks

1. **Billing C7's "rewrite siblings" would introduce a defect.** `brain_content_schema`, `brain_content_walk`, `reference_echo`, `brain_pointer_divergence` are shared with `app/(product)/brain/{actions,copy,edit-state}.ts`, where re-submitting is free and "try again" is honest. Rewriting the shared `billing-errors.ts` entries would falsify brain-surface copy. Endorsed route: `ONBOARDING_OVERRIDES` (`onboarding/copy.ts:228`) or a ledger row.
2. **Compliance C2 vs billing C3.** A blanket no-re-press regex is compatible with billing C3 only if pre-vendor sentences also do not invite a re-press — and they should not, since those failures are deterministic (a re-press repeats them). Resolve by pre-vendor sentences saying "nothing was sent, nothing spent, this is ours". Keep price words out of kind sentences so the regex (drop `rebuild`) does not false-positive on the price line.
3. **Tenancy C1's fix is not sufficient against a mis-map.** `canon()` trims, so a slice whose start/end drifts into adjacent whitespace keeps `canon(slice) === canon(model)`, and w2b "shift end by one" stays green whenever the next character is a space. Add the boundary-character assertion and aim the witness at a non-whitespace character (M1).
4. **The batch-2 P2-9 fix produced tenancy C4** — the earlier generalist's "closes fully" suggestion was wrong. H1's fix (UI bootstrap with the constant throwaway password) makes the password non-secret and reduces C4 to wording.
5. **The batch-2 P1-3 fix produced G3** (paragraph rule).
6. **Tenancy C2 options:** a job-level `if:` still spawns a workflow run per push and keeps AC4 grep-fragile; a separate workflow file is cleaner and leaves the gate job's triggers undisturbed.
7. **Tenancy C3 order:** once deletion always runs first, the scan's `_handoff/` check only guards a failed delete — acceptable, but AC5 must keep its planted case so the check is not dead code.
8. **H1 reverses batch-1's "password generated per run"** by using the specs' own UI sign-up; the identity dies with the ephemeral DB and the password is already a committed constant (`auth.ts:17`) — the tenancy reviewer must re-evaluate this, not self-certified here.
9. No specialist pair conflicts on a Medium+ fix beyond 1–2; all billing fixes stay off the parked money path.

## Least-confident probes

- **Phase 1 — "canonicalisation is what run 2 failed on": plausible, not proven, stated honestly.** Supporting: the solo posts contain straight apostrophes ("Today's", "didn't", `solo-creator.spec.ts:40-41`); run 1 succeeded and run 2 failed on identical posts (audit F-02), which fits a nondeterministic curly apostrophe hitting `quote_not_found` at `assemble.ts:372-379`. An NFC-only mismatch would surface later as `ProvenanceError`, not `AssemblyError` (`assemble.ts:383`), so it is not the observed failure. Caveat: G3 could make the fix net-negative for multi-paragraph posts, and M2 leaves over-tolerance unguarded. **Holds as a bet; the implementation text needs M1–M3.**
- **Phase 2 — "green first `workflow_dispatch` with compose Postgres and no `stripe listen`": fails as stated.** Four concrete blockers the line does not name: H1 (lint), M4 (triggers), M5 (scan order), M6 (retry key); secondary: L9 (warm-up compiles nothing authenticated), L11 (no health wait). Docker on the hosted runner, `container_name: respin-postgres` and port 5435 check out.

## Mechanical consistency (summary)

Handoff contracts: FAIL — `data-code` consumed by Phase 2 T2, pinned nowhere (M6). Closure: L13, L14; Files needs `onboarding/copy.ts` if M9 takes the override route; owner agents all exist. Deferral ledger: missing rows for the stuck Free creator / exit-demo rule (L12) and sibling copy if not overridden (M9). Number provenance: spend row wrong (M10). Verifiability: P1 Verification 6 unpassable (M12); P2 Verification 3 unpassable (M5); AC4 unsatisfiable in `respin.yml` (M4). Invariant slugs: 10, unique, no renames; checks that can pass while the invariant fails: `evidence-quote-still-required` (M2), `step-state-derived-not-assumed` (M13), `journeys-manual-or-nightly-only` (M4), `signup-lands-on-onboarding` via Verification 6 (M12). Reachability: both lines name in-phase callers.

## Smallest closing edit sequence

| # | Edit | Closes | Built? | Needs independent evaluation (§9 row 4) |
|---|---|---|---|---|
| E1 | P1 T1 (ii)/(iv)/AC2/Verification 7: explicit canonical map with paragraph token; canon-equality + boundary assertion; negative generative property; w1b, w2b (non-whitespace); empty-after-canon fixture | M1, M2, M3, T-N6 | Yes | **Tenancy** |
| E2 | P1 T1 (iii)/Handoff/AC3/Files: `data-code` on `run-refusal`; pre/post-vendor kind partition and sentences; re-press regex over every kind sentence with a plant; onboarding-only overrides for sibling codes (add `onboarding/copy.ts`) or a ledger row | M6, M7, M9 | Yes | **Billing + compliance** |
| E3 | P1 T3/AC5/Failure Modes: posts step `unknown` on null minimum; wiring cases in `selected-profile-pages.test.tsx`; mint/driver-error sentence corrected (T-N1, N2) | M13, M14 | Yes | **Tenancy** |
| E4 | P1 T6/T7: scope (viii) to traceability — **owner sees the text**; provenance sentence wording; hard-disclosure witness w3c; enumerate stale comments; identifier-wide `initialState` scan with two plants | M8, L5–L8 | Yes | **Compliance** |
| E5 | P1 T8 tests: same-Date assertion; exact seed-derived sentence + seed clone; `beforeEach` default | M16, L4, B-N2 | Yes (missing assertions are not cosmetic, §4) | **Billing** |
| E6 | P1 T8 + Verification 6: niche branch in the solo spec, or move the step to Phase 2 | M12 | Yes | Generalist |
| E7 | P2 T4/AC4/AC5/Verification 3/Files/Least confident: `respin-journeys.yml`; UI-bootstrap admin identity + dev restart (delete the script row); step order delete → scan → upload with `if: always()`; mint+mask the auth secret in an earlier step; `up -d --wait`; per-spec report dirs; warm-up residual; remove absolute secret claims | H1, M4, M5, L1, L9–L11, T-N4 | Yes | **Tenancy + generalist** |
| E8 | P2 T2/T1: drop `workspace_paused`, name each producer; editor-seat asserts the not-owner reason | M15, M11 | Yes | **Billing** |
| E9 | Text only: "minted per run" ×4; spend-row restatement + vendor limit before the first dispatch (B-N6); exit-demo re-dispatch rule and ledger row; P1 Depends-on; column closure; w5 split wording | M10, L2 (text part), L3, L12–L15 | No (L15 is a one-line decision) | None — fix, batch, log |

**Why Phase 1 cannot start now:** E1–E8 all change what will be built, so each owes its reviewer under §9 row 4 before its phase starts; the allowance — including this owner-approved batch 3 — is consumed, so that re-evaluation needs a new explicit owner approval (§3), and the accepted size risk does not grant it (§11). Phase 1 also still depends on creator-ready Phase 0, itself NOT READY.

**Smallest set that unblocks only Phase 1:** E1+E3 (tenancy), E2+E5 (billing), E2+E4 (compliance), E6 (generalist). E7–E8 must be re-evaluated before Phase 2 starts; splitting that way is the owner's call — the gate as recorded is one plan gate.

## Verdict

**NOT READY.** Ordered fix list: E7 (H1 first) → E2 (M6, M7, M9) → E1 (M1–M3) → E4 (M8 first) → E3 → E8 → E5 → E6 → E9, then an owner-approved re-evaluation (tenancy, billing, compliance, generalist) scoped to E1–E8.

---

# Batch 4 (second owner-approved extension, 2026-09-15) — specialist reports

*Recorded verbatim by the orchestrator (trailing "Ask /go…" footers and file lists omitted). Dispatch for all three: model inherit / no override requested (agent pins apply), read-only tools (Read/Grep/Glob, no Bash; none reported a Bash call); resolved model and effort not exposed. Fixed inputs: the plan as revised by the batch-3 disposition (E1–E9) on 2026-09-15.*

## Tenancy plan review — respin-service-quality — batch 4

**Readiness: Almost · Grade: C · Most batch-3 fixes hold and the owner's admin bootstrap opens no tenancy or secret hole, but seven fixable defects remain — a new boundary assertion no witness can redden, provenance properties that pass vacuously if the tests reuse the implementation's canonicaliser, and a restart race in the bootstrap.**

Counts: 0 ❌ BLOCK · 7 ⚠️ CHANGE · 9 💡 NOTE.

Scope: plan text only; read in full the master plan (incl. Plan Review Log and batch-3 disposition), Phase 1, Phase 2, and the batch-3 section of `docs/progress/respin-service-quality-plan-review.md` (tenancy report + generalist table and conflicts); grepped the codebase review and brief for the admin/"minted per run" wording. UGC (`src/`) and Cutdown untouched. Read/Grep/Glob only — no Bash.

### Least-confident probes

- **Phase 1 (canonicalisation is the run-2 cause): still unproven, honestly stated.** The tolerance does not weaken provenance: `validateSourceEvidence` checks only schema, owner, reference-post input, offset bounds and `slice === quote` (`packages/db/src/with-workspace.ts:5685-5741`), and the schema puts no length/whitespace limit on `quote` (`:2923-2929`), so an original-slice store always passes. The remaining risk is test detection of a wrong map-back or an over-tolerant canonicaliser (CHANGE 1–3).
- **Phase 2 (two-start bootstrap, compose Postgres, unauthenticated warm-up): mostly holds.** `pnpm dev` is `next dev -p 8000` (`package.json:25`); compose container `respin-postgres`, user/db `respin` (`docker-compose.yml:11,22-24`) match `lookupAuthUserId`'s `docker exec … psql -U respin -d respin` (`e2e/support/db-shortcut.ts:64-86`); `requireAdmin` reads `ADMIN_USER_IDS` per request and fails closed (`packages/auth/src/server.ts:117-121`, `allowlist.ts:4-24`). Gap: the bootstrap server's stop has no port-release wait (CHANGE 5); the warm-up residual is stated, but step 5 itself runs cold with 30 s waits (`playwright.config.ts:27`, `e2e/support/auth.ts:28`).

### Batch-3 C1–C8 resolution

| # | Batch-3 CHANGE | Status | Evidence |
|---|---|---|---|
| C1 | tautological quote-location property | **Partly closed** | P1 T1 (iv)/AC2 now carry `canon(evidence.quote) === canon(modelQuote)` and a boundary-character assertion — but the boundary assertion has no witness and w2b misstates what reddens (CHANGE 1); `canon`'s independence from the implementation is unpinned (CHANGE 2). |
| C2 | journeys job inherits push/PR | **Closed** | New `.github/workflows/respin-journeys.yml`, `workflow_dispatch`; `respin.yml` untouched (workflow-level triggers, `respin.yml:5-14`). AC4 proof is weak (CHANGE 6). |
| C3 | delete/scan order | **Closed** | P2 T4 steps (8)→(9)→(10), all `if: always()`; Verification 3 deletes `_handoff/` first; AC5 keeps the planted `_handoff/` case. |
| C4 | password in report / "closes entirely" | **Closed** | Absolute claim removed; residual now covers `index.html` and traces, all carrying the `auth.ts:17` constant. The per-persona directories make the `data/*.zip` exclusion glob ambiguous (NOTE 1). |
| C5 | AC5 wiring in the wrong harness | **Closed** | `tests/selected-profile-pages.test.tsx` imports `onboarding/page` (`:56-58`) with an enumerated `respinDb` mock (`:23-38`) and a `getActiveConfigServer` mock (`:51-54`) — it can drive a listed-class rejection, a `TypeError` rethrow and a called-with assertion. |
| C6 | w5 cannot redden P4 | **Closed** | Split into w5a/w5b/w5c; w5c needs a P4-style case for the new seam function, and a cross-parented `generations` fixture already exists (`profile-scope.test.ts:1847-1857`). |
| C7 | "supplied from secrets" | **Closed** | Master `:30,:50,:55`, P2 checklist `:40`, codebase review `:113` now say minted/generated per run. |
| C8 | posts step inferred on null minimum | **Closed in intent, partly in text** | T3/AC5 say `unknown` on a null minimum; "unknown when the post read fails" contradicts the page's existing whole-page refusal, and an `undefined` minimum is not covered (CHANGE 4). |

### E1 / E3 / E7 against code

**E1** (canonical map, P1 T1 (ii)/(iv), Edge Cases row 2, AC2, w1b/w2b). *`validateSourceEvidence` keeps passing:* yes — stored quote is `content.slice(start, end)`, so `:5737` holds by construction for any in-bounds offsets. *Still refuses what it should:* paraphrase, case change and a space-for-paragraph-break are refused if the map is implemented as pinned; an empty-after-canon quote is refused (matches `locateQuote`'s existing empty-needle rule, `assemble.ts:269`); the existing decomposed-quote test (`packages/llm/tests/assemble.test.ts:165-170`) still guards quote-side NFC. *One-char mis-map (generalist conflict 3):* into **non-whitespace** (`"Hello"` → `"Hello w"`) — canon-equality reddens, the boundary assertion does **not** (both last chars `w`/`o` non-whitespace); into **whitespace** (`"Hello"` → `"Hello "`) — canon-equality stays green (`canon` trims), only the boundary assertion reddens. Together they cover both directions, but w2b claims "canon-equality **and boundary** red" (false), and no witness exercises the whitespace direction — the boundary assertion is an unwitnessed control (CHANGE 1). *Paragraph token:* consistent on both sides for `\n\n+`; unpinned: whether trim removes an edge token, rule order for mixed runs (` \n \n`, `\t\n\n`), and non-ASCII whitespace JS `\s`/`trim()` fold (CHANGE 3).

**E3** (P1 T3, AC5, Failure Modes row 2). Listed classes and cites correct: `WorkspaceAccessError` export `packages/db/src/index.ts:380`, `ProfileAccessError` `:484`, both allowed for `app/**` (`eslint.config.mjs:37,214`). Mint/lifecycle nuance accurate: the access check's `.catch` converts any error to `ProfileAccessError` (`with-workspace.ts:2736-2743`); `assertFreshWorkspaceAuthority` runs outside it (`:2744`). Seam composition sound: `generationsNewest` filters `both(generations)` (`:2466-2476`); precedent `brainAssetSummary` (`:2780-2787`). Swallowed config read at `page.tsx:223-232` as cited. Gap: `listOnboardingInputs` failure already returns a whole-page `AccessRefusal` (`page.tsx:265-268`), so the header cannot show `unknown` for a post-read failure unless T3 rewrites a catch it does not list (CHANGE 4).

**E7** (P2 T4). *Bootstrap branch runs and exits 0:* with no handoff it signs up, looks up the id, writes the handoff, screenshots and calls `test.skip` (`platform-admin.spec.ts:41-56`); Playwright counts a skipped test as not failed, so exit 0 is expected (high confidence, not executed). A missing handoff afterwards makes "read `authUserId` from the handoff" fail and stop the job. *Interference with the later persona run:* none — `journeyArtifacts` deletes the persona's screenshots and rewrites its `console.log` at module load (`e2e/support/artifacts.ts:31-39`), so step 7 wipes the bootstrap evidence; the handoff (`handoff.ts:9`) is exactly what step 7 needs. *Rate limits:* Better Auth's limiter is on in dev with database storage (`create-auth.ts:374-393`); 4 sign-ups per run (bootstrap, solo, operator, editor) vs 10/hour, 2 sign-ins vs 5/min — fits. *`lookupAuthUserId` in CI:* works (host `docker exec respin-postgres`; the email shape `e2e.admin.<digits>-<digits>@example.test` passes `EMAIL_PATTERN`, `db-shortcut.ts:17`). *`ADMIN_USER_IDS` in both step-6 processes:* yes (`$GITHUB_ENV` written in step 5 applies from step 6). *`BETTER_AUTH_SECRET` identical across starts:* yes via `$GITHUB_ENV` from step 4 — and immaterial: no bootstrap session is reused (step 7 signs in fresh) and password hashes do not depend on the secret. *Restart:* stop "by its recorded PID" with no port-release wait (CHANGE 5).

### Admin bootstrap re-evaluation (owner direction: UI sign-up, committed throwaway password)

**No tenancy, secret or admin-boundary hole in CI.** The identity lives only in the runner's throwaway compose database; `ADMIN_USER_IDS` exists only in that job's environment; the server binds only on the runner (no inbound). Knowing `correct horse battery staple 9` (`auth.ts:17`) grants nothing on any persistent system. The allowlist admits exactly one id and fails closed on empty/unset (`allowlist.ts:14-24`); a stale/wrong id yields `notFound()` → loud failure at the `heading "Admin"` assertion (`platform-admin.spec.ts:70`), never a skip. The auth boundary is not widened — no script imports `getAuth`/`createAuth`; the scripts lint surface is unchanged (`eslint.config.mjs:1076-1080`). Versus batch 1's generated password: it protected nothing that outlives the runner; the reversal removes a secret-handling duty (mask, scan) rather than adding risk. Residuals: an id written to `$GITHUB_ENV` without a shape check (NOTE 2); `workflow_dispatch` runs any branch's code with the vendor key (NOTE 3); locally, the same known-password identity is allowlisted against a persistent dev DB, and the README "admin identity contract" should say that is local-only (NOTE 4).

### Findings

| Sev | Severity / confidence | Plan file · section | Evidence | Fix |
|---|---|---|---|---|
| ⚠️ CHANGE 1 | Medium / High | P1 T1 (iv); Verification 7 w2b; AC12 | The boundary-character assertion exists to catch drift into whitespace, which `canon`'s trim hides from canon-equality (generalist conflict 3). w2b shifts into a **non-whitespace** character, where the boundary assertion passes (`w`/`o` both non-whitespace), so its "boundary assertions red" claim is false, and no mutation shifts into whitespace — the boundary assertion is never shown to fail (lesson 2026-08-26). | Reword w2b to "canon-equality red"; add **w2c** shift the end offset one char into whitespace and **w2d** shift the start one char back into whitespace — each must redden only the boundary assertion; list both in AC12. |
| ⚠️ CHANGE 2 | Medium / Medium-High | P1 T1 (iv); AC2; w1b; cross-package case | The plan never says where the tests' `canon` comes from. If they import the implementation's canonicaliser, the canon-equality property and the negative property ("canon non-substring → `quote_not_found`") both apply the defective function to both sides and pass — e.g. w1b (case-fold inside `canon`) leaves the negative property green, so w1b's "negative property red" holds only if `canon` is an independent test-side implementation. Only the table-driven test is independent (it calls `locateQuote` directly). | Pin that `canon` in `assemble-kinds.test.ts` and `voice-build-tolerance.test.ts` is a **test-side reference built from the Edge Cases row 2 table**, never imported from `assemble.ts`/`@respin/llm`; make the negative generator mutate a located substring by one char (case flip, punctuation drop, a non-folding Unicode quote such as `«` or `„`, an ellipsis). |
| ⚠️ CHANGE 3 | Low / Medium | P1 Edge Cases row 2; T1 (ii)/(iv) alphabet | "The pinned map and nothing else" is unenforceable as written: JS `\s` and `String.prototype.trim` also match U+00A0, U+2028/2029, U+3000, U+FEFF, and the generative alphabet contains none, so an implementation using `/\s+/` or `.trim()` silently folds more than the map. Also unpinned: whether trim removes an edge paragraph token (a `"\n\n"`-only quote locates today via `indexOf`, `assemble.ts:270`), and rule order for mixed runs (` \n \n`, `\t\n\n`; "surrounding spaces" excludes tabs). | Add those code points to the alphabet as must-not-fold (or decide they fold and list them); forbid `\s`/`.trim()` in the canonicaliser and spell the class; state rule order and whether an edge token is trimmed (recommend yes, so a whitespace-only quote is `quote_not_found`); NFC-normalise generated posts as `normaliseContent` does. |
| ⚠️ CHANGE 4 | Low / Medium | P1 T3; AC5; Failure Modes row 2 | (a) "`unknown` when … the post read fails": `listOnboardingInputs` failure already returns a whole-page `AccessRefusal` (`app/(product)/onboarding/page.tsx:265-268`), so the header never renders — implementing the sentence needs a second read or rewriting a sibling catch T3 does not list. (b) The existing config mock has no `minOwnPostsForVoice` (`tests/selected-profile-pages.test.tsx:137-143`); `n >= undefined` is `false`, so the step renders "next" — an assumed state — while AC5's rejected-config case stays green. | State: the posts step reuses `fetched` (no second read); a post-read failure keeps today's `AccessRefusal` (AC5 asserts that); treat any non-finite minimum as unavailable → `unknown`; add the missing-field case beside the rejected-config case. |
| ⚠️ CHANGE 5 | Low-Med / Medium (~0.55) | P2 T4 steps (5)–(6); Edge Cases row 1 | Step 5 stops `pnpm dev` "by its recorded PID" and step 6 immediately starts `next dev -p 8000` (`package.json:25`); nothing waits for exit or port release. Step 6's readiness curl can get 200 from the dying bootstrap server (no `ADMIN_USER_IDS`) while the new server exits on EADDRINUSE — loud, not open, but an intermittent green in the plan's own least-confident step. Step 5 also has no warm-up, yet the sign-up → `/onboarding` compile runs under 30 s waits (`auth.ts:28`, `playwright.config.ts:27`), and the re-dispatch rule covers only step 7 specs. | After the kill, loop until `curl localhost:8000` refuses (or kill the process group) before step 6; in step 6 confirm the new PIDs alive after readiness; warm `/sign-up` in step 5; extend the one-re-dispatch rule to a step-5 timeout. |
| ⚠️ CHANGE 6 | Low-Med / High | P2 AC4; technical invariant `journeys-manual-or-nightly-only`; Risk coverage | The invariant's only evidence is a one-off "grep transcript over both files" — not a repeatable test, no planted violation — so a later edit adding `push`, `pull_request_target` (fork PR code with repo secrets) or `workflow_run` to `respin-journeys.yml`, or a Playwright/`ANTHROPIC_API_KEY` job to `respin.yml` under another name, is never caught; a grep for `workflow_dispatch` cannot fail on the added-trigger case. | A vitest (e.g. `respin/tests/journeys-workflow-triggers.test.ts`) reading both files: the `on:` keys of `respin-journeys.yml` ⊆ {`workflow_dispatch`, `schedule`}; `respin.yml` contains neither `ANTHROPIC_API_KEY` nor `playwright`; proven with planted `pull_request_target` and `push` fixtures; list in Files and AC4. |
| ⚠️ CHANGE 7 | Low / Medium | P2 T4 "Job environment, enumerated" | `ANTHROPIC_API_KEY` is listed as job-level env, so it is present during `pnpm install` (dependency lifecycle scripts), `playwright install --with-deps`, the bootstrap step and third-party actions, none of which need it; the worker reads it at startup (`worker/main.ts:14`), and only step 6's processes need it. | Scope the key to step 6 via step-level `env:` (backgrounded processes inherit it); say so in T4 and the README. |
| 💡 NOTE 1 | Low / Medium | P2 T4 step (10); AC5 | Per-persona `PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/<persona>` moves traces to `playwright-report/<persona>/data/*.zip`; a pattern written `!playwright-report/data/*.zip` excludes nothing, and AC5's "workflow grep" for `data/*.zip` would still pass. Nothing secret is lost (constant passwords, runner-only session tokens), but the AC becomes vacuous. | Pin `!playwright-report/*/data/*.zip` and match that exact line in AC5; name the bootstrap report directory and keep it inside the uploaded tree so a step-5 failure has a report. |
| 💡 NOTE 2 | Low / Medium | P2 T4 step (5) | `authUserId` from the handoff JSON goes straight into `$GITHUB_ENV`; a newline would inject variables, and a jq `null` becomes the literal `"null"` (fails closed, confusingly). | Validate `^[A-Za-z0-9_-]+$` before writing; fail the step otherwise. |
| 💡 NOTE 3 | Low / Medium | P2 T4; master Dependencies | Anyone with write access can dispatch on an unreviewed branch whose specs/scripts run with the vendor key. | A protected GitHub `environment:` for the key, or `if: github.ref == 'refs/heads/main'`; or state the accepted risk in the README. |
| 💡 NOTE 4 | Low / Medium (~0.6) | P2 T5 README "admin identity contract" | Locally the same known-password identity is allowlisted via `.env.local` against the persistent `respin-pgdata` volume (`docker-compose.yml:25-26`); `next dev` binds all interfaces by default (recalled from Next.js docs, not verified here), so on a shared network `/admin/config` and `/admin/model-spend` are one sign-in away. Pre-existing, but the README now presents it as the contract. | One README sentence: the journey admin id goes only into a local or ephemeral environment, never a shared/deployed `ADMIN_USER_IDS`; remove it from `.env.local` after a local run. |
| 💡 NOTE 5 | Low / Medium | P1 T1 (ii) | Canonical-first matching changes which occurrence is cited — and the stored bytes — for quotes that match exactly today when a post holds two occurrences differing only typographically (e.g. `It's` and `It’s`). Provenance stays true, but byte-identical behaviour for today's accepted quotes is the smaller change. | Exact `indexOf` (after NFC/CRLF) first; canonical only on a miss; say so in the two-occurrence fixture. |
| 💡 NOTE 6 | Info / High | P1 T3 ("a mock missing the method") | `selected-profile-pages.test.tsx:27-28` spreads `...actual.respinDb`, so a missing mock calls the real facade (`getServerDb` → `assertScoped`'s `ScopeForgeryError`, `with-workspace.ts:574-583`), not a `TypeError` — still a loud rethrow. | Make the rethrow witness an explicit mock rejecting `TypeError`. |
| 💡 NOTE 7 | Info / Medium | P2 T3 / `main-chapters.ts` | The presence scan's suffix match `*-<name>.png` would accept the bootstrap's `01-admin-bootstrap-identity-created.png` if the admin main-chapter name were a suffix of it and step 7's admin run never loaded. | Pick a name that is not a suffix of any bootstrap screenshot name; add that case to `scan-journey-notes.test.ts`. |
| 💡 NOTE 8 | Info / High | Codebase review `:113` | "the persona run's bootstrap skip is unreachable" is a structural claim no test proves; what actually catches it is the presence scan (AC5). | "caught by the main-chapter presence scan". |
| 💡 NOTE 9 | Info / High | Master plan `:5` Status | Still says batch-3 "findings not applied", contradicting the disposition at `:125` (for the generalist). | Refresh the status line. |

### Checks run

1 Single scoping helper — holds: `hasGenerationForProfile` mints via `ProfileScope.mint` and composes breach-tested `generationsNewest` (`with-workspace.ts:2466-2476`, `:2729-2758`); registration points enumerated; no raw table access from `app/**`. 2 Mechanism-level stripping — n/a. 3 Append-only brains & provenance — stored quote is the creator's own slice; `validateSourceEvidence` untouched (`:5737`); test strength gaps CHANGE 1–3; no brain mutation outside proposal/approval. 4 Sensitive inference — n/a. 5 Export & deletion — n/a (no new table). 6 Roles & admin boundary — holds: allowlist read per request, fail-closed (`server.ts:117-121`); bootstrap cannot widen it and admits exactly one ephemeral id; restart race CHANGE 5. 7 PII & secrets — `BETTER_AUTH_SECRET` masked before `$GITHUB_ENV`; `_handoff/` deleted, scanned and excluded; remaining: vendor key job scope (CHANGE 7), exclusion glob (NOTE 1), env injection (NOTE 2), dispatch from any branch (NOTE 3), local allowlist (NOTE 4). 8 Requirement provenance — w2b "boundary red" (CHANGE 1), w1b "negative property red" (CHANGE 2), "nothing else" (CHANGE 3), "unreachable" (NOTE 8) are recorded claims no test backs yet.

Negative examples vs named checks: `evidence-quote-still-required` — table test can fail on paraphrase/case; negative property and w2b only once CHANGE 1–2 land. `generation-read-profile-scoped` — w5a/b/c each failable. `step-state-derived-not-assumed` — failable on rejected config, not yet on a missing field (CHANGE 4). `journeys-manual-or-nightly-only` — cannot fail on an added `pull_request_target` (CHANGE 6). Planted `_handoff/` → exit 1 — failable.

Absences hunted and not found: the model's quote stored anywhere; a scope minted from an untrusted id; a driver error class imported into `app/**`; worker/dev server started before `ADMIN_USER_IDS` is exported; the auth lint surface widened; a persistent credential in any uploaded tree; an interfering skipped bootstrap run.

Commands run: none (no Bash, as instructed). Nothing was executed — Playwright's exit code on a skipped test, pnpm's signal forwarding and `next dev`'s default bind address are reasoned, not observed.

**Verdict: NEEDS CHANGES** — no BLOCK, no leakage, and the owner's admin-bootstrap direction holds on tenancy and secrets; seven fixable defects on this path, with CHANGE 1–2 first, because without them the round's new provenance properties can pass while the map-back or canonicaliser is wrong.

## Billing plan review — respin-service-quality — batch 4

**Readiness: Almost · Grade: C · Five of eight batch-3 CHANGEs are closed and the harness retry is now sound, but E2's copy rule misclassifies a build-consuming code, drops the only "your run counted" disclosure, rests on a Free premise that becomes false when packs open, and rewrites a copy table two onboarding banners share.**

Counts: 0 BLOCK · 6 CHANGE · 8 NOTE. No fix needs an allowance, price, ledger, metering, Stripe or rollout change; the one policy question (a stuck Free creator) is already routed to the parked plan.

Scope: E2, E5, E8 and M10 in the master plan, `respin-service-quality-phase-1.md` and `-phase-2.md`, plus my batch-3 report and the generalist's conflicts in `docs/progress/respin-service-quality-plan-review.md`. Every citation checked against `respin/` at HEAD `3273f36` with Read, Grep and Glob only; no Bash.

### 1. Batch-3 CHANGE resolution

| # | Status | Evidence |
|---|---|---|
| C1 `data-code` absent | **RESOLVED** | T1 (iii), Handoff Contracts and AC3 add it; `Banner` spreads extra props (`app/ui/banner.tsx:7-17`), so the attribute renders. |
| C2 `workspace_paused` in retry list | **RESOLVED** | Dropped in Phase 2 T2 with producers named (`inference.ts:562`, `writeBrainDoc` `with-workspace.ts:4076`, `ledger.ts:414`). |
| C3 pre/post-vendor partition | **RESOLVED (partition only)** | The three pre-vendor kinds are at `assemble.ts:174,186,193`, called at `infer-voice.ts:207`, before `:214`. The post-vendor copy's money half is open (F2). |
| C4 two instants undetectable | **RESOLVED** | A `toBe` on the same `Date` object reddens a second `new Date()`; the called-with assertion prevents a vacuous pass when neither method is called. |
| C5 spend row counted presses | **RESOLVED** | Lines verified: draft `pipeline.ts:160`, rewrite `:186`, scoring `:318-319`; "+1 retry" removed. Lower bound loose (N5). |
| C6 owner-only check vacuous keyless | **PARTIAL** | Assertion added, but the sentence renders at least 5 times, so a bare text locator fails Playwright strict mode (F6). |
| C7 sibling codes say try again | **PARTIAL** | The population is now a list and the override route is chosen, but the claim anchor, the shared table and the money claims are wrong (F1, F3, F4, F5). |
| C8 copy substring can miss a dropped tier | **RESOLVED** | Whole-sentence equality against the seed plus a seed clone. |

Batch-3 NOTEs N1, N2, N3, N5, N6 applied; N4 (seed-pinned copy) remains an accepted residual (N7 below).

### 2. E2 / E5 / E8 / M10 against code

**`PRE_CLAIM_CODES` definable from the text?** Mostly, but not safely. All 37 entries of `ONBOARDING_ERROR_CODES` (`copy.ts:128-221`) walked:
- **`llm_attempt_recorded` — wrong under the plan's anchor.** Thrown at step 7 (before step 8b at `:857`), but the included build is already claimed at **step 8a**: `inference.ts:806-807` and `:831-846` call `recordUsage` with `consumesIncludedBuild`, and `with-workspace.ts:4048-4060` inserts the claim row. The plan's rule would exempt a code that consumed the build (F1).
- `llm_truncated` pre-claim (`consumesIncludedBuild=false`, `llm/src/errors.ts:251-256`); `llm_unavailable` pre-claim (non-billable).
- `topup_in_flight`, `insufficient_credits`, `uncharged_attempt_cap` pre-claim (`inference.ts:655-709`); the debit's own insufficient-credits error is rethrown as `debit_refused_after_call` (`:966-967`).
- `run_slot_busy`, `server_at_capacity` pre-claim (`:740`); `not_enough_posts` pre-claim (`assemble.ts:179`).
- `unknown` mixed: any unmapped post-claim throw lands there, including three codes missing from the list — `brain_content_schema`, `brain_claim_walk`, `brain_schema_shape` (fallback `run-outcome.tsx:38`).
- `onboarding_input_limit`, `post_content` and the profile codes have no voice-build producer — vacuously classified (N1).
- `brain_document_limit`, `provenance`, `reference_echo`, `brain_content_walk`, `segmenter_unavailable`, `brain_pointer_divergence` are post-claim; of these only `reference_echo`, `brain_content_walk`, `brain_pointer_divergence` match the pattern.

**Match count:** 14 shared entries match (`billing-errors.ts:983, 1003, 1008, 1013, 1063, 1130, 1165, 1170, 1175, 1195, 1258, 1263, 1281, 1925`) plus the `workspace_paused` override (`copy.ts:232`) = 15, not 13; the list has 37 entries, not 32 (N2).

**Overrides honest on paid tiers?** Only if the copy says the run counted, which the plan does not require (F2). Pause is paid-only, where a rebuild is affordable, and the plan's rewrite drops "try again" on the one surface where it works (F4).

**Pattern collides with kept copy?** Yes — the existing `workspace_paused` override, shared with profile/paste refusals (F4), and the honest "buy a pack … then run it again" in `debit_refused_after_call` (F3).

**Step-8b reference:** `:857` is the 8b comment and the claim write is `:869-884` — holds, but misses 8a (F1).

**Spend-row call count:** correct — up to 3 per generation (`pipeline.ts:160,186,318-319`), 2 and no scoring on a refused generation (`:218-241`). "A harness retry adds none" holds: `RunSlotBusyError` at `:740` precedes any usage row or claim, and each press gets a fresh `attemptId` (`actions.ts:285`).

**Not-owner assertion fails if the role gate is deleted?** Yes for the view gate (sentence derives from `isOwner`, `billing-view.tsx:219-221`, `page.tsx:125`); no for the action gate — deleting `assertOwner` (`stripe/actions.ts:907`) stays green; the screen is a courtesy (F6).

**E5:** page lines hold (`trends/page.tsx:305-317`, `:311`); facade method exists (`credits/src/app-server.ts:642-650`); mock enumerated (`trends-page.test.tsx:43-49`), `beforeEach` at `:181-211`; `trackNicheAction` remains the gate (`actions.ts:97-108`); seed allowances `seed.ts:84`.

**E8:** holds — on the voice path `RunSlotBusyError` is thrown only at `inference.ts:740` (`generate.ts:627` is the generation path).

**Probes:** Phase 1 *Least confident* — if the next real refusal is any post-vendor kind, the included build is consumed; recovery then needs a pack (F3); the exit rule routes the case correctly. Phase 2 rewritten retry line — sound as far as money is concerned.

### 3. Findings

| # | Type | Sev | Conf | Plan file + section | Evidence (`respin/`) | Fix |
|---|---|---|---|---|---|---|
| F1 | CHANGE | Medium | High | phase-1 T1 (iii) "before the included-build claim (step 8b, `inference.ts:857`)"; Failure Modes row 1 | A billable, build-consuming vendor failure is claimed at **step 8a**: the catch at `inference.ts:787-855` calls `recordUsage` with `consumesIncludedBuild` (`:806-807, :831-846`), inserting the claim row (`with-workspace.ts:4048-4060`). `LlmRefusedError` (`llm/src/errors.ts:161-168`) and `LlmSchemaInvalidError` (no text block) map to `llm_attempt_recorded` (`billing-errors.ts:1991`), whose copy says "Try again" (`:1003`). Its throw at step 7 precedes `:857`, so the literal rule classifies it pre-claim and exempts it; a Free re-press is then refused at step 6. | Define the claim as step 8a (`:831-846`, when `consumesIncludedBuild`) or 8b (`:869-884`); pin `PRE_CLAIM_CODES` in the plan as a list naming `llm_attempt_recorded` post-claim and `llm_truncated`/`llm_unavailable` pre-claim with reasons. |
| F2 | CHANGE | Medium | High | phase-1 T1 (iii) rewritten `inference_unusable` detail; AC3 | The rewrite deletes "Your run was still made, so it counted" (`billing-errors.ts:1170`); AC3 only checks a post-vendor sentence does *not* say nothing was spent. The price line deliberately never predicts the branch (`onboarding/run-copy.ts:17-27`) and still reads "Your first run for a creator is included" (`:65`). A paid creator (or a Free creator with a pack) not told the build was consumed re-presses expecting a free run and is debited 50 (`inference.ts:936-964`, `seed.ts:60`). | Require every post-vendor kind sentence and every override for a non-`PRE_CLAIM_CODES` code to say this run counted; assert presence in AC3 with a planted removal; keep it true on every tier. |
| F3 | CHANGE | Medium | Medium | phase-1 Failure Modes row 1 "on Free there is no re-press"; T1 (iii) scan rationale; master Deferral Ledger row "cannot rebuild … stuck" | Pack purchase has no tier/subscription requirement: `createPackCheckoutUrl` checks owner, re-auth and pause only (`stripe/actions.ts:900-998`), and REQ-G03 applies to all users. The premise holds only while the pack rollout gates stay closed (`:981-986`); once they open, "Buy an overage pack … then run it again" (`billing-errors.ts:1008`) is an honest remedy the scan would force out. The ledger row also understates the owner's choice — today's recovery is paying $10 for our failure, while truncation already opts out of consuming the build (`llm/src/errors.ts:242-257`). | Restate as "no re-press without buying credits (a pack)"; allow a purchase-conditional re-press invitation, or keep `debit_refused_after_call` on its shared copy as a named exception; correct the ledger row and cite the truncation precedent. The CI rationale (keyless → no pack) may stand. |
| F4 | CHANGE | Medium | High | phase-1 T1 (iii) "onboarding-only override in `ONBOARDING_OVERRIDES`"; Files row `copy.ts` | `onboardingErrorFor` feeds **two** banners: the `?e=` redirect for create-profile/paste/reference (`onboarding/page.tsx:457`) and the voice run's `refusalCopy` (`page.tsx:365-366`). The `workspace_paused` override (`copy.ts:229-233`, "…and try again") has post-claim producers (`with-workspace.ts:4076`, `ledger.ts:414`), so the scan forces a rewrite — as would a new `unknown` override — degrading paste/profile refusals where retrying is free. Pause is paid-only, so re-pressing after resume is affordable. | Put voice-run overrides in a separate map applied only where `page.tsx:365` builds `refusalCopy`, and scan that map; leave `onboardingErrorFor` and the redirect copy untouched. |
| F5 | CHANGE | Medium | Medium | phase-1 T1 (iii) scan (re-press pattern only) | `unknown` says "nothing was charged" (`billing-errors.ts:1925`). On a rebuild, step 9 commits the debit (`inference.ts:927-973`) before `parseVoiceReply`/`writeBrainDoc` (`infer-voice.ts:236-274`); unmapped errors and unlisted codes (`brain_content_schema`, `brain_claim_walk`, `brain_schema_shape`, thrown from `brain-content.ts:106-832`) fall back to `unknown` (`run-outcome.tsx:38`). The override F4 requires can carry that false clause, because the scan checks only re-press wording. | The voice-run `unknown` override must not claim nothing was charged/spent; add a money-claim pattern over non-pre-claim voice copy with a planted violation. |
| F6 | CHANGE | Low-Med | High | phase-2 T1 not-owner assertion; AC1 | The sentence renders once per blocked control — 3 subscribe tiers (`billing-view.tsx:403-416`), pack (`:442-443`), auto-top-up (`:477-478`) — so `expect(getByText(...)).toBeVisible()` violates Playwright strict mode and fails falsely. It also covers only the view's `isOwner`, not the action's `assertOwner` (`stripe/actions.ts:907`). | Scope: `getByTestId("subscribe-creator").getByText(...)` visible for the editor; `toHaveCount(0)` for owners; state the action gate is proven by the unit suite (`packages/credits/tests/actions.test.ts`). |
| N1 | NOTE | Low | High | phase-1 T1 (iii) classification rule | Codes with no voice-build producer (`profile_*`, `post_content`, `post_attestation`, `onboarding_input_limit`) are pre-claim only vacuously; their paste copy "try again" (`billing-errors.ts:1063, 1258`) is honest. | Say they are pre-claim because they have no spend-path producer. |
| N2 | NOTE | Low | Med | phase-1 T1 (iii) "13 listed codes"; orchestrator "32 codes" | The list has 37 entries; 14 shared matches + the `workspace_paused` override = 15 (line grep; a split-line match could be missed). | Replace the count with the list. |
| N3 | NOTE | Low | Med | phase-1 T1 (iii) pattern; w8 | The pattern misses "press Build again", "rebuild", "run the build again", and flags negations ("do not run it again"); w8 plants one phrase. | Plant a paraphrase too, or state the limit. |
| N4 | NOTE | Low | High | phase-1 T1 (iii) | The plan rewrites the shared `inference_unusable` entry while saying shared entries stay untouched — defensible (only onboarding lists it, `onboarding/copy.ts:151`), but unstated. | Name the exception. |
| N5 | NOTE | Low | Med | master Derived Budgets | Solo activates the kill test (`solo-creator.spec.ts:99`) before its 4 generations, each ≥ 2 calls → minimum ≈ 11, not 9; the worker's schedules (`worker/pg-boss-runtime.ts:353,357`) are unnamed system spend paths (expected zero on a fresh DB). | Derive the lower bound; name the worker paths. |
| N6 | NOTE | Low | Med | master Exit Demonstration | "two such refusals" is not stated as consecutive or cumulative, and there are two voice builds per run (solo, operator), so the dispatch count — and spend — is unbounded as written. | Pin both. |
| N7 | NOTE | Low | High | phase-1 T8 copy | Seed-pinned niche copy vs live allowance — accepted residual carried from batch 3. | Stays routed to the parked plan. |
| N8 | NOTE | Low | Med | phase-2 Edge Cases row 2 vs T2/AC1 | If the operator's voice build is refused (no retry), the editor is precondition-blocked; Edge Cases says "asserts the precondition refusal", T2/AC1 say "fails on `studio-blocked`" — contradictory. | Reconcile (generalist scope). |

### 4. Checks run

1 Stored balance (B1): no ledger write in either phase; T8 read-only — holds. 2 Webhook idempotency (B2): n/a (no webhook path; CI keyless). 3 Debit-in-transaction (B3): steps 6–9 unchanged; retry reaches no vendor — holds; F1 is copy classification, not metering. 4 Expiry/pause (B4): Free lots expire next month-start (`balance.ts:157-159`), so Free is capped at 25; pause code correctly dropped from the retry list. 5 Config-not-code (B5): T8 reads the live allowance; N7 stated residual. 6 Tier gates / owner-only billing (B6): Free niche allowance 0, action is the gate; not-owner check weakened by F6. 7 Number provenance: 50/25/0 and call lines cited correctly; lower bound loose (N5); 8b anchor misses 8a (F1). 8 Money paths tested (B7): C4 and C8 now redden on their target defects; AC3 lacks a presence check for "run counted" (F2) and a money-claim scan (F5).

Commands run: none (no Bash) — Read, Grep, Glob only.

**Verdict: NEEDS CHANGES** — retry list, Trends niche tests, `data-code` handoff and spend row are sound; E2's copy-honesty rule misclassifies a build-consuming code (F1), removes the "run counted" fact that prevents an unexpected 50-credit rebuild (F2), rests on a Free premise that becomes false when packs open (F3), rewrites a two-banner table (F4) and cannot catch a false "nothing was charged" (F5); the not-owner assertion as specified would fail every run (F6). All six are plan-text fixes that stay off the parked money path.

## Compliance plan review — respin-service-quality — batch 4 (lean merged run)

**Readiness: Almost · Grade: C · E4's disclosure edits are now true against the code and all six batch-3 CHANGEs are acted on, but E2's re-press scan catches only some of today's "run it again" wording and would strip legitimate remedies from surfaces where retrying is free.**

Counts: 0 ❌ BLOCK · 5 ⚠️ CHANGE · 7 💡 NOTE. Scope: plan text only, HEAD `3273f36`; Phase 1 T1 (iii), T5–T7, E2/E4 as far as S-rules and refusal copy go. `src/`, `cutdown/`, `docs/initial.past/` untouched. Read/Grep/Glob only; no Bash.

### 1. Batch-3 CHANGEs C1–C6

| # | Status | Evidence |
|---|---|---|
| C1 R-68 entry scoping | **Closed** | T6 (viii) now says "`/disclosure/` **traceability** findings" and that claim findings are always listed — matches R-69 (`decisions.md:884`) and `claims.ts:467-470`. AC9 names it, though no test can check a `decisions.md` entry (N5). |
| C2 re-press wording in kind sentences | **Partly closed** | Scan and plant w8 exist, but the pattern misses live re-press copy and the scan runs over a copy table the free-retry actions share (K1, K2). |
| C3 provenance sentence | **Closed** | "names, numbers and dates are not listed here" is true post-filter; the list shows specifics **not** traced (`generation-outcome.tsx:114-151`), and the sentence no longer claims they were traced. One fixture edge (N1). |
| C4 `&& flag` unwitnessed | **Closed** | Fixtures are literal `KillTestSummary` objects (`studio-ui.test.tsx:207-230, 713-735`), so a hard `/disclosure/guidance` `$4,000` row is constructible although `enforcementFor` never produces one (`traceability.ts:297,303`); deleting `&& enforcement === "flag"` drops the row → the assertion reddens. |
| C5 `initialState` spread leak | **Closed, with a gap** | Identifier-wide scan with plants w7a/w7b; no false positives today (`app/**` has no `initialState`; every `useActionState` there initialises from a named `IDLE_*` constant). Gap: nothing checks the declaring panels themselves (K4). |
| C6 stale comments | **Closed** | Enumerated sites verified: `generation-outcome.tsx:132-141` (still "keys on `kind` and `field`"), `:172-175`; `run-copy.ts:456-461`, `:538-547`, `:579-584`; onboarding `run-copy.ts:1`. The `field`-parameter decision is recorded. AC9 still says "two" comments (N5). |

### 2. E2/E4 against code

- **(v) sentence vs screen:** holds — the filter hides every flag-level `/disclosure/` row; heading, list and list-presence gate (`:118`) follow the filtered list; `TRACEABILITY_LIMIT_NOTE` ("every number, date and name … was checked") stays true because findings are still scanned and stored.
- **w3c constructible and reddens:** yes (C4).
- **`studio-in-force` "inside `StudioPanel`":** holds — `run` is null only on the no-profile branch (`studio/page.tsx:84-99`); every profile render passes `run` (`:268-301`). T7's "no state renders the panel with a profile and `run === null`" also holds. T5's file list lags (N2).
- **Could-not-be-read state:** honest — `Promise.all` over the three histories (`page.tsx:133-149`) means one failure covers all three, so "could not be read" is accurate; listed outside folds in AC10. It can sit beside `studio-blocked`'s "activate a brain first" (N3).
- **Pre-vendor sentences:** true for all three kinds — `assembleVoicePrompt` (`infer-voice.ts:207`) precedes `runInference` (`:214`), and nothing spending or reserving runs earlier (`:161-202`); the fields are a constant (`VOICE_FIELDS`) and post ids come from the DB (`assemble.ts:174,186,193`), so "the fault is the product's" holds. Nothing forbids a fix timeline and no remedy is required (K1, N6).
- **Model text in refusal sentences:** none — static `Record<AssemblyKind,string>`, `err.message` forbidden, refused state carries code + kind only.
- **Does the re-press scan remove an owed remedy:** yes (K1), and it misses live wording (K2).
- **Material checks' ability to fail:** `check-markers-kept-for-creator-fields` (w3, w3b) ✓; hard-disclosure surfacing (w3c) ✓; `disclosure-claims-never-filtered` — render witness `:821-835` uses a flag-level concealment finding, a real state because R-69's context guards demote to flag (`decisions.md:886`), and a claims filter would redden it ✓; `honesty-blocks-never-folded` (w4, w6) ✓ but lists incomplete (K5); `initialState` leak (w7a/b) ✓ except rename (K4); `assembly-kind-content-free` ✓ sentinel test; re-press wording (w8) catches its plant but leaves the class open (K2).

### 3. Findings

| # | Sev | Conf | Plan file + section | Evidence | Fix |
|---|---|---|---|---|---|
| **K1 ⚠️ CHANGE** | Medium | High | Phase 1 T1 (iii) re-press scan, `PRE_CLAIM_CODES`, AC3 | One onboarding copy table serves two channels: the voice-run panel (`onboarding/page.tsx:365-367`) and the `?e=` redirect for create-profile, add-post and add-reference (`:457`), where resubmitting is free. Any code with both a free-retry producer and a post-claim voice producer must lose its remedy under the scan — e.g. `unknown` ("Try again", `billing-errors.ts:1925`) and the `workspace_paused` override ("…and try again", `copy.ts:232`), which `writeBrainDoc` also produces post-claim. `debit_refused_after_call` ("Buy an overage pack … then run it again", `:1008`) is a real paid remedy. The plan never requires an override or pre-vendor sentence to **name** a remedy (`DESIGN.md:75` "Refusals name the remedy"). Codes with no voice-build producer at all (`post_content`, `onboarding_input_limit`) fall into "every producer runs before the claim" only vacuously. | Apply voice-run overrides only to the run panel's `refusalCopy` (a separate map at `page.tsx:365`), leaving `?e=` copy intact; list no-voice-producer codes as their own exempt category; require every scanned override and kind sentence to name a remedy (the priced rebuild shown in the panel's price line, "buy credits, then build", or "tell us") and assert its presence. |
| **K2 ⚠️ CHANGE** | Medium | High | Phase 1 T1 (iii), AC3, w8 | `/try again\|run (it )?again\|press again/i` is a list of phrasings, not a rule. Post-claim onboarding copy already evades it: `provenance` "Try the build again" (`billing-errors.ts:1028`; code listed at `copy.ts:218`; raised by `validateSourceEvidence` in `writeBrainDoc`, post-claim) and `brain_document_limit` "rebuild or submit the replacement again" (`:1053`). `provenance` is precisely the refusal a T1 offset mis-map would produce — telling a Free creator to rebuild when that rebuild is refused pre-vendor. A "try again" plant proves only that instance (lesson 2026-08-18). My count of matching listed codes is 14, not 13. | Class pattern, e.g. `/\bagain\b\|\bretry\|\bre-?run\b\|once more/i` over the scanned (post-claim, run-panel) set; plant at least two shapes ("try the build again", "retry"); add `provenance` and `brain_document_limit` to T1's classification. |
| **K3 ⚠️ CHANGE** | Medium | Medium | Phase 1 T1 (iii), AC3 | Today the `inference_unusable` detail discloses "Your run was still made, so it counted" (`billing-errors.ts:1170`) — true for every post-vendor kind (the debit/claim commits before the parse, `infer-voice.ts:231-236`). E2 strips every call/counted claim from title and detail and delegates it to the kind sentence, but AC3 only asserts a post-vendor sentence does **not** say "nothing was spent", and price words are barred — so the creator is no longer told the build counted: a spend disclosure disappears from a refusal (overlaps billing). | Require every post-vendor kind sentence (or one shared post-vendor clause) to say the run was made and counted, without price words (no regex collision); assert in AC3. |
| **K4 ⚠️ CHANGE** | Low | High | Phase 1 T7 test mechanism, w7a/w7b, AC10 | The scan exempts the two declaring panels as whole files and never checks they use the identifier. If the prop ships as `initialStudioState`, the plant still reddens the scan, real code passes, and a leak via the renamed prop is invisible — rendering a draft that never passed the kill test (S3). The whole-file exemption also hides a leaky default inside a panel. | Positive control: each panel declares exactly one `initialState` prop and passes it to `useActionState` (fixed occurrence count per panel), else the scan is red. |
| **K5 ⚠️ CHANGE** | Low | High | Phase 1 AC10, T7 | The shared `USABLE` fixture has `claims: []` (`studio-ui.test.tsx:241`), so the concealment claims block never renders in the fold check. The "outside" lists omit `studio-claims`, `studio-traceability-heading`, `studio-traceability-note` (the REQ-I03 limit) and `studio-charge`; honest refusal omits `studio-honest-refusal`, `studio-refusal-why`, `studio-sharper-angle` (`generation-outcome.tsx:481-491`) — S3's "here is why, here is a sharper angle". "Inside: exactly …" is not defined as set equality, so folding "Where the specifics came from" could pass. | `CONCEALMENT` plus one traceability row in both AC10 fixtures; add the listed testids; define inside as set equality over every `data-testid` within a `<details>` span. |
| 💡 N1 | Low | High | T6 (v) vs (vi) w3c | The w3c render shows disclosure-guidance `$4,000` in the list beside a sentence saying its "names, numbers and dates are not listed here"; production cannot reach it while `FLAG_ONLY_FIELD_PREFIXES` is pinned (agreement test). | "flagged names, numbers and dates", or record in the test why the fixture contradicts the sentence. |
| 💡 N2 | Low | High | T5 File(s) | The line renders in `StudioPanel`, a client component that must not import `studio/copy.ts` (`studio-panel.tsx:34-38`); T5 lists `copy.ts` and `studio-view.tsx` but not `studio-panel.tsx`/`run-copy.ts`. | Add both; state the sentence is a server-computed prop or lives in `run-copy.ts`. |
| 💡 N3 | Low | Med | T5 | After a failed read `brainActivated` stays false (`page.tsx:141-149`), so "could not be read" renders beside "activate a brain first". | Optional: same could-not-be-read wording in the block reason. |
| 💡 N4 | Low | High | Phase 1 *Least confident* (probe) | Kinds are 1:1 with throw sites (16/16), so kind sentences stay honest whichever kind comes next. But a tolerance map-back error surfaces as `provenance` (`ProvenanceError`, not `AssemblyError`) with no kind — "the kind on the next real refusal is the diagnostic" does not cover T1's own likeliest regression, and that path's copy evades the scan (K2). | Name that case in *Least confident*. |
| 💡 N5 | Low | High | AC9 | Still "the two stale 'only hard section' comments" while (vii) enumerates more; its evidence column cites tests for the decision-entry clause, which no test reads. | Align the count; mark the decision entry as a manual check. |
| 💡 N6 | Low | Med | T1 (iii) pre-vendor sentences | No bar on a fix timeline ("fixed soon"); no remedy named. | Add "no timeline"; name "tell us" as the remedy (the `uncharged_attempt_cap` pattern, `billing-errors.ts:1330`). |
| 💡 N7 | Info | High | T6 | Trends Spin has its own disclosure locator (`trends/spin-state.ts:79`, hard-only in the withheld state) — unaffected by T6 and still unassessed, as the master plan says. | — |

### Checks run

1 Sources · 2 Similarity gate · 3 Minimum difference · 8 Autopsy — n/a (no ingest/spin/autopsy code; Trends/Spin recorded unassessed). 4 Kill-test honesty — holds: honest-refusal branch unchanged (`generation-outcome.tsx:473-525`); pre-vendor copy true (§2); gaps K3, K5. 5 No invented specifics — holds: creator-material offers kept (w3/w3b), hard disclosure rows surface (w3c), zero-count heading rescoped; residual owner-accepted. 6 No guarantees — holds for new sentences; refusal remedies K1/K2. 7 No automation / concealment — holds: `summary.claims` never filtered, render witness failable, R-68 entry scoped to traceability.

**Verdict: NEEDS CHANGES** — no BLOCK; E4 holds against the code, but E2's re-press scan misses post-claim copy already on screen (including the refusal T1's own likeliest bug would produce) and would strip free-retry remedies from the shared onboarding copy table (K1, K2), and the post-vendor "your run counted" disclosure must survive the rewrite (K3).

---

# Plan review — respin-service-quality — batch 4 generalist (final slot)

*Recorded verbatim by the orchestrator (trailing "Ask /go…" footer and file list omitted). Dispatch: `plan-reviewer`, model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Inputs: the plan as revised by E1–E9 (frozen) plus the three batch-4 specialist reports above; no batch-4 finding applied.*

**Readiness: Not yet · Grade: D · Batch-3 fixes largely hold, but the refusal-copy work in Phase 1 T1 (iii) has not converged, all three specialist verdicts stand at NEEDS CHANGES, and Phase 2 carries one assertion that fails every run and one unresolved task contradiction.**

`plan gate ran lean (consolidated)` for the compliance path; tenancy and billing ran full. Reviewer context: session model, "think hard", Read/Grep/Glob only, no Bash, nothing executed, HEAD `3273f36`. No file edited or written; this message is the report.

## Counts

| | BLOCK/High | Medium | Low | Info |
|---|---|---|---|---|
| Consolidated findings (after dedupe) | 0 | 14 | 31 | 6 |
| of which new in this review (incl. severity raises) | 0 | 3 raised (M12, M13, M14) | 9 (L6–L12, L30, L31) | 1 |

Normalisation (batch-3 convention): specialist "Low-Med" → Medium (billing F6, tenancy CHANGE 5 and CHANGE 6); raised to Medium because they decide what is built or let a named invariant's check pass on a violation: billing N8 (M12), tenancy CHANGE 4 (M13), compliance K5 (M14).

## Standing specialist verdicts (batch 4, not applied)

| Path | Verdict | Items |
|---|---|---|
| Brain tenancy (full) | NEEDS CHANGES | 0 BLOCK, 7 CHANGE, 9 NOTE |
| Billing & credits (full) | NEEDS CHANGES | 0 BLOCK, 6 CHANGE, 8 NOTE |
| Spin compliance (lean merged) | NEEDS CHANGES | 0 BLOCK, 5 CHANGE, 7 NOTE |

No path has a PASS; this slot is the last authorised evaluation.

## Batch-3 closure table (current text)

| ID | Status | Evidence / residual |
|---|---|---|
| H1 identity script fails lint | **Closed** | UI bootstrap T4 steps (5)–(6); no script row; tenancy found no tenancy/secret/admin hole. Fix introduced a restart race (M9). |
| M1 tautological quote property | **Partly closed** | Canon-equality + boundary assertion added; boundary assertion unwitnessed and w2b misstates what reddens (M1); `canon` independence unpinned (M2). |
| M2 over-tolerance guard | **Partly closed** | Table-driven map + negative property added; negative property vacuous if tests import `canon` (M2); "nothing else" unenforceable against JS `\s`/`trim()` (L1). |
| M3 paragraph-rule regression | **Closed** | Paragraph token; verbatim `\n\n` locates. Mixed-run order and edge-token trim unpinned (L1). |
| M4 journeys job in `respin.yml` | **Closed** | New `respin-journeys.yml`, `workflow_dispatch`. Proof is a one-off grep (M10). |
| M5 delete/scan order | **Closed** | Steps (8)→(9)→(10) `if: always()`; Verification 3 deletes first. |
| M6 `data-code` absent | **Closed** | T1 (iii), Handoff, AC3; `Banner` spreads props (billing verified). |
| M7 pre/post-vendor partition | **Closed (partition); fix-induced regression** | The rewrite drops "Your run was still made, so it counted" (`billing-errors.ts:1170`) with no replacement (M4). |
| M8 R-68 entry scoping | **Closed** | T6 (viii) traceability + claims always listed. |
| M9 sibling "try again" codes | **Not closed; fix-induced defects** | 8b anchor misses 8a (M3); one shared table feeds two banners (M5); phrase-list pattern (M7); `unknown` "nothing was charged" (M6); Free premise breaks when packs open (M8). |
| M10 spend row | **Closed** | ≈9–17 calls; lower bound should be ≈11 (L19). |
| M11 not-owner assertion | **Partly closed** | Added, but the sentence renders ≥5 times → strict-mode failure (M11). |
| M12 T8 breaks Verification 6 | **Closed** | See E6. |
| M13 null minimum | **Partly closed** | Post-read failure is already a whole-page refusal; `undefined` minimum renders "next" (M13). |
| M14 AC5 harness | **Closed** | `selected-profile-pages.test.tsx` imports the page with mocks. |
| M15 `workspace_paused` retry | **Closed** | Dropped; producers named. |
| M16 same-`Date` instant | **Closed** | `toBe` same object. |
| L1 absolute secret claims | **Closed** | — |
| L2 w5 split | **Closed** | w5a/b/c. |
| L3 "minted per run" ×4 | **Closed** | Codebase review `:113` still says "unreachable" (Info). |
| L4 whole-sentence seed | **Closed** | — |
| L5 provenance wording | **Closed** | Fixture edge (L21). |
| L6 w3c hard-disclosure witness | **Closed** | — |
| L7 identifier-wide `initialState` scan | **Closed with gap** | No positive control on declaring panels (L4). |
| L8 stale comments | **Closed** | AC9 still says "two" (L25). |
| L9 warm-up residual | **Partly closed** | Stated for step 7; step-5 bootstrap runs cold with no re-dispatch rule (M9). |
| L10 per-spec report dirs | **Closed** | Makes the `data/*.zip` exclusion glob and its AC grep vacuous (L13). |
| L11 `up -d --wait` | **Closed** | — |
| L12 exit-demo rule + ledger row | **Closed in text** | Refusal count ambiguous (L20); ledger row understates the pack route (M8). |
| L13 Depends on | **Closed** | — |
| L14 column closure | **Closed** | A separate T5 closure gap (L22) predates E9. |
| L15 declared-metric fold | **Closed** | T4 + AC7. |

Tally: 21 closed, 7 partly closed, 1 not closed (M9), 1 closed with a fix-induced regression (M7). Every open residual except M11/L9 is concentrated in two places: T1 (iii) refusal copy and T1's quote-tolerance test strength.

## E6 / E9 check

**E6 (P1 T8 solo niche branch, Verification 6): closed.** The branch is in T8's text, the Files table (`solo-creator.spec.ts`, "CRLF preserved") and Out of Scope; Verification 6 references the spec. Anchor verified: chapter 12 at `solo-creator.spec.ts:175-185`, the unconditional `#tracked-niche` fill at `:180`. A non-waiting `isVisible()` on `niche-disabled-tier` immediately after `page.goto("/trends")` suffices because the block is server-rendered and `goto` waits for load. Verification 6 walked against every Phase 1 change the spec touches: T2 `signUp` wait ✓; T3 reorder — `#content` unique (`onboarding-view.tsx:378`), "Save post" (`:440`), "Build my voice brain" (`run-inference-panel.tsx:156`) unique ✓; T4 folds — `activateBrainSection` ticks checkboxes only on first activation, when no version is in force, so folds are open ✓; keyless chapter 9 — the password fill times out, is caught, writes a `BLOCKING APP BUG` note and continues → passes ✓. Residuals: CRLF preservation has no byte check (L11); the branch's screenshot name/note text is unnamed although Phase 2 T3's main-chapter map may need it (Info); Verification 6 does not state it needs the dev server, worker and vendor key, and spends ≈9–13 calls (L7).

**E9 (master-plan text edits):**

| Item | Status |
|---|---|
| Spend row | Present and correctly derived (`pipeline.ts:160,186,318-319`); lower bound ≈11, not 9 (solo activates the kill test before 4 generations of ≥2 calls) (L19). |
| Vendor limit before first dispatch | Present: master Dependencies `:55`, P2 Verification 4, Deferral Ledger `schedule` row. |
| Exit-demo re-dispatch rule | Present; "two such refusals" neither consecutive nor cumulative, two voice builds per run, and T4 step 6 adds a second re-dispatch rule → dispatch count unbounded (L20). |
| Stuck-Free-creator ledger row | Present; omits the pack route and the truncation precedent (M8). |
| P1 Depends on | Fixed (creator-ready Phase 0). |
| File-column closure | Holds for everything E9 named; new gap: T5's File(s) omits `studio-panel.tsx`/`run-copy.ts` (L22). |
| w5 split | Done (w5a/b/c). |
| Declared-metric fold | T4 + AC7. |
| Status lines | Master `:5` still says batch-3 "findings not applied" (tenancy N9); umbrella `creator-ready-master-plan.md:61` still says "batch 3 is the owner's call"; the Plan Review Log's `:136` paragraph now sits after batch 4 and reads as current (L31). |

## Execution simulation (as `respin-engineer`, plan text only)

Verified this session: `onboarding/page.tsx:86-141, 215-469` (incl. `:265-268` whole-page refusal, `:365-367` `refusalCopy`, `:457` `?e=` channel); `onboarding/copy.ts:100-259`; `run-outcome.tsx` (whole); `run-copy.ts` (whole); `run-inference-panel.tsx` testids; `inference.ts:780-889`; `infer-voice.ts:196-280`; `assemble.ts:40-69, 255-399`; `billing-errors.ts:995-1059, 1155-1199, 1918-1927`; `billing-view.tsx` `notOwner` render sites; all four spec files, `artifacts.ts`, `playwright.config.ts`; `eslint.config.mjs:1000-1081`; `schema.ts:257-268`; `tsconfig.json` include; `selected-profile-pages.test.tsx:12-57, 133-144`; `gate-rules.md` §3–§11.

**Phase 1** (start also blocked externally: creator-ready Phase 0 NOT READY)
- **PASS\* T1 (i)/(ii)/(iv)** — executable; builds four test-strength defects (M1, M2, L1, L17).
- **FAIL T1 (iii)** — executable as written, but executing it ships defects: the literal rule ("a post-claim code that fails the scan gets an `ONBOARDING_OVERRIDES` entry") forces rewrites of `unknown` and the existing `workspace_paused` override, both of which also serve the create-profile/paste banners via `?e=` (`page.tsx:457`) where retrying is free (M5); it exempts build-consuming `llm_attempt_recorded` (M3); drops the "counted" disclosure (M4); misses live post-claim wording (M7); leaves a false "nothing was charged" (M6).
- **PASS T2.**
- **PASS\* T3** — M13; the post count comes from `fetched`, clamped to `PAGE_SIZE + 1 = 26` (`page.tsx:261`), while `minOwnPostsForVoice` has no max (`schema.ts:259`) (L6). Info: the minimum would share the try block with `onboardingBrainPrices` (`page.tsx:223-228`), so a price-shape failure also makes the minimum `unknown` — fails safe, unstated; the existing test mock lacks `onboardingBrainBuild`.
- **PASS T4.**
- **PASS\* T5** — L22.
- **PASS T6** — compliance verified E4 against code; L21, L25.
- **PASS\* T7** — L4, M14.
- **PASS T8** — incl. E6.
- **Verification 3** — unreachable on a voice refusal: Free cannot rebuild, so "4 of 4 done" needs a fresh sign-up the step does not state (L7).
- **Verification 7** — w2b's "boundary assertion red" is false (M1).

**Phase 2**
- **FAIL T1** — `getByText("Only the workspace owner…")` hits multiple `notOwner` render sites (`billing-view.tsx:365, 388, 477-478, 590, 608-609, 658-659, 702`); strict mode fails every run (M11).
- **AMBIGUOUS T2** — Edge Cases row 2 says the editor chapter records a precondition refusal when the operator's build is refused; T2/AC1 say editor-seat fails on `studio-blocked`. An implementer cannot tell whether a model refusal turns the nightly red (M12).
- **PASS T3** — Info on the suffix match.
- **PASS\* T4** — M9 (restart race, step-5 cold compile), M10, L3 (vendor key at job scope), L13 (exclusion glob), L14 (unvalidated id into `$GITHUB_ENV`); step 7 runs four commands in one step — under GitHub Actions' default `bash -e` the first failing spec aborts the rest, losing later personas' evidence, unstated (L10); the scan's `BLOCKING` match is not anchored to `[note] ` lines, while `console.log` also carries page console text and URLs (`artifacts.ts:53-67`) (L9).
- **PASS T5** — L16.
- **Verification 2** (local) — does not say the admin two-start bootstrap must be done by hand; repeated local runs against the persistent DB can hit Better Auth's DB-backed 10 sign-ups/hour limit (≈4–5 per full run) (L30).

**Size (gate-rules §11):** 42 rows > 25 (owner-accepted). Every task could be simulated; the second signal does not fire. T1 is a single ≈1,700-word cell, but the recurrences stem from what T1 (iii) is asked to do, not phase size — a split would not have prevented any batch-3 or batch-4 finding (Lessons 2026-09-08).

## Pre-mortem (shipped, then failed)

| # | Likely cause | Receiving task / spec | Status |
|---|---|---|---|
| 1 | Run-2 failure was not `quote_not_found`; tolerance not the fix | T1 (i)(iii) record kind; Least confident | Absorbed honestly |
| 2 | Tolerance mis-maps; write refuses as `provenance` with no kind — the diagnostic misses T1's own likeliest regression | Least confident | **Gap** (L24, compliance N4) |
| 3 | Mis-mapped slice stored into whitespace, hidden by canon trim | AC2 boundary assertion | **Gap** — unwitnessed (M1) |
| 4 | Tests import the implementation's `canon`; properties pass while `canon` is wrong | AC2/w1b | **Gap** (M2) |
| 5 | Canonicaliser folds NBSP/U+2028 via `\s`/`trim()` | "nothing else" | **Gap** (L1) |
| 6 | Free creator re-presses after build-consuming `llm_attempt_recorded` and is refused | `PRE_CLAIM_CODES` | **Plan causes it** (M3) |
| 7 | Paid creator / pack buyer not told the run counted; re-presses into a 50-credit debit | AC3 | **Plan causes it** (M4) |
| 8 | Profile/paste banners lose an honest "try again" via the shared override table | T1 (iii) overrides | **Plan causes it** (M5) |
| 9 | `unknown` tells a debited creator "nothing was charged" | T1 scan (re-press only) | **Gap** (M6) |
| 10 | "Try the build again" on `provenance` survives the scan | re-press pattern | **Gap** (M7) |
| 11 | Pack rollout opens; honest "buy a pack, then run it again" gets stripped | Failure Modes row 1 premise | **Gap** (M8) |
| 12 | Step header shows "next" on undefined minimum / cannot render `unknown` for a post read | T3/AC5 | **Gap** (M13) |
| 13 | Minimum configured > 26; header "next" forever | T3 | **Gap** (L6) |
| 14 | Honesty block folded but absent from AC10's hand list (claims, sharper angle, heading) | AC10 | **Gap** (M14) |
| 15 | `initialState` renamed; leak scan passes | T7 scan | **Gap** (L4) |
| 16 | T8 breaks the solo journey | T8 branch | Absorbed (E6) |
| 17 | A later edit adds `pull_request_target`/`push` to the journeys workflow | AC4 grep | **Gap** (M10) |
| 18 | Bootstrap dev server not released; readiness hits the dying server | T4 step 5→6 | **Gap** (M9) |
| 19 | Cold compile >30 s during the step-5 bootstrap | none (re-dispatch rule covers step 7 only) | **Gap** (M9) |
| 20 | Every nightly red on a strict-mode violation | P2 T1 | **Plan causes it** (M11) |
| 21 | Operator's voice build model-refused; nightly red or silently green | T2 vs Edge Cases | **Unresolved** (M12) |
| 22 | Owner sizes the vendor limit from an undercount | spend row | Absorbed (L19 loose bound) |
| 23 | Exit demo never reached; dispatches unbounded | Exit Demonstration | Partial (L20) |
| 24 | `_handoff/` uploaded | T4 (8)–(10) | Absorbed |
| 25 | Nightly passes on skips | presence scan with plants | Absorbed |
| 26 | Scan fails on a console line containing "BLOCKING" | T4 scan | **Gap** (L9) |
| 27 | First spec failure aborts the step; later evidence lost | T4 step 7 | **Gap** (L10) |
| 28 | Vendor key read by an install script / third-party action | job-level env | **Gap** (L3) |
| 29 | Settled-wait lint satisfied by a nearby wait in another branch (e.g. `solo-creator.spec.ts:167-173`) | AC2 lint | **Gap** (L8) |
| 30 | R-68 entry later read as licensing hidden concealment claims | T6 (viii) | Absorbed |

## Consolidated findings

Sources: T = tenancy b4, B = billing b4, C = compliance b4, G = this review. "Built" = changes what is built; "Records" = changes only how the plan reads.

| ID | Sev / conf | Source | Plan file + section | Finding | Fix | Built / records | Code cross-check |
|---|---|---|---|---|---|---|---|
| M1 | Medium / High | T-CH1 | P1 T1 (iv); V7 w2b; AC12 | Boundary assertion catches drift into whitespace only, and no witness shifts into whitespace; w2b (non-whitespace) reddens only canon-equality. | w2b → "canon-equality red"; add w2c (end into whitespace), w2d (start into whitespace) — or see convergence redesign | Built | Confirmed by logic against Edge Cases row 2 trim rule |
| M2 | Medium / Med-High | T-CH2 | P1 T1 (iv), AC2, w1b, cross-package case | Test `canon` provenance unpinned; if imported, canon-equality and the negative property pass while `canon` is wrong. | Test-side reference `canon` from the table, never imported; negative generator mutates one char (case, punctuation, `«`, `„`, ellipsis) | Built | Plan text silent — confirmed |
| M3 | Medium / High | B-F1 | P1 T1 (iii) "step 8b, `inference.ts:857`"; Failure Modes row 1 | A vendor-failure billable claim is recorded at step 8a (`recordUsage` with `consumedIncludedBuild`), so `llm_attempt_recorded` consumes the build but the 8b anchor exempts it. | Name 8a and 8b as the claim; pin the classification as a list — or remove the scan (convergence) | Built | Confirmed `inference.ts:806-807, 831-846` |
| M4 | Medium / High | B-F2 = C-K3 | P1 T1 (iii) `inference_unusable` rewrite; AC3 | "Your run was still made, so it counted" deleted; nothing requires a replacement; AC3 only negative; price words barred. | Keep the counted clause for post-vendor kinds; assert presence | Built | Confirmed `billing-errors.ts:1170`; `run-copy.ts:20-27` never predicts the branch |
| M5 | Medium / High | B-F4 = C-K1 | P1 T1 (iii) overrides; Files `copy.ts` | `onboardingErrorFor` feeds both the voice-run `refusalCopy` and the `?e=` banner for profile/paste/reference; scan-forced overrides degrade honest free-retry copy; no rule requires a remedy be named. | Separate voice-run map applied only at `page.tsx:365` — or remove the scan (convergence) | Built | Confirmed `page.tsx:365-367, 457`; `copy.ts:229-233` |
| M6 | Medium / Medium | B-F5 | P1 T1 (iii) | `unknown` fallback says "nothing was charged" after a committed rebuild debit; unmapped `brain_*` codes fall back to it. | No money claim in voice-run `unknown` — or route to the ledger (convergence) | Built | Confirmed `billing-errors.ts:1925`, `run-outcome.tsx:38`; rebuild debit path not re-traced |
| M7 | Medium / High | C-K2 (+B-N3) | P1 T1 (iii), AC3, w8 | `/try again\|run (it )?again\|press again/i` is a phrase list: misses `provenance` "Try the build again" (the refusal a mis-map produces) and `brain_document_limit` "rebuild or submit … again"; flags negations. | Class pattern + two plants — or remove the scan (convergence) | Built | Confirmed `billing-errors.ts:1028, 1053`; codes listed at `copy.ts:137, 218` |
| M8 | Medium / Medium | B-F3 | P1 Failure Modes row 1; master Deferral Ledger row | "On Free there is no re-press" holds only while the pack rollout gates stay closed; ledger row omits the pack route and the truncation precedent. | "no re-press without buying credits"; correct the ledger row | Built (copy premise) + Records | Not re-traced (billing cites `stripe/actions.ts:900-998`); `assertOwner` at `:293` seen |
| M9 | Medium / Medium | T-CH5 (+G) | P2 T4 steps (5)–(6); Least confident | Bootstrap dev server killed by PID with no port-release wait; readiness may answer from the dying server; step 5 runs cold under 30 s waits with no re-dispatch rule. | Loop until the port refuses; confirm new PIDs alive; warm `/sign-up` in step 5; extend the re-dispatch rule | Built | Plan text confirmed; runtime reasoned (`playwright.config.ts:27`) |
| M10 | Medium / High | T-CH6 | P2 AC4; invariant `journeys-manual-or-nightly-only` | One-off grep cannot catch an added `pull_request_target`/`push`/`workflow_run`. | Vitest over both YAML files with planted triggers; add to Files | Built | Confirmed AC4 text |
| M11 | Medium / High | B-F6 | P2 T1; AC1 | Not-owner sentence renders per blocked control; a bare text locator breaks strict mode every run; action gate `assertOwner` unproven. | Scope to `subscribe-creator`; `toHaveCount(0)` for owners; cite the unit suite for the action gate | Built | Confirmed seven `notOwner` render sites in `billing-view.tsx` |
| M12 | Medium (↑ Note) / High | B-N8 + G | P2 Edge Cases row 2 vs T2/AC1 | Contradiction: on an operator voice-build refusal, does editor-seat record a precondition refusal or fail on `studio-blocked`? Decides whether model nondeterminism turns the nightly red and how `journeys-no-persona-skips` reads. | Owner/plan decision; make row, T2, AC1 agree | Built | Confirmed plan text; `editor-seat.spec.ts:61-79` records today |
| M13 | Medium (↑ Low) / Medium | T-CH4 | P1 T3; AC5; Failure Modes row 2 | "`unknown` when the post read fails" is unreachable (that failure already renders a whole-page `AccessRefusal`); an `undefined` minimum compares `n >= undefined` → false → "next", with AC5 green. | Reuse `fetched`; keep today's refusal (asserted); non-finite minimum → `unknown`; add missing-field case | Built | Confirmed `page.tsx:265-268`; `selected-profile-pages.test.tsx:137-143` lacks `minOwnPostsForVoice` |
| M14 | Medium (↑ Low) / High | C-K5 | P1 AC10, T7 | Fold-check "outside" lists omit `studio-claims`, `studio-traceability-heading`, `studio-traceability-note`, `studio-charge`, `studio-honest-refusal`, `studio-refusal-why`, `studio-sharper-angle`; fixture has `claims: []`; "inside: exactly" is not set equality. | `CONCEALMENT` + a traceability row in fixtures; set equality over every testid inside `<details>` spans | Built (tests) | AC10 text confirmed; fixture cite from compliance |
| L1 | Low / Medium | T-CH3 | P1 Edge Cases row 2; T1 alphabet | "Pinned map and nothing else" unenforceable: `\s`/`trim()` fold more; edge-token trim and mixed-run order unpinned. | Spell the class; ban `\s`/`trim()`; exhaustive code-point check | Built | JS semantics |
| L2 | — | — | — | (merged into M13) | — | — | — |
| L3 | Low / Medium | T-CH7 | P2 T4 env | `ANTHROPIC_API_KEY` at job scope, visible to install and third-party steps. | Step-level `env:` on step 6 | Built | Plan text |
| L4 | Low / High | C-K4 | P1 T7 scan | Declaring panels exempt with no positive control; a rename passes. | Fixed occurrence count per panel | Built (tests) | Plan text |
| L5 | — | — | — | (merged into M7, B-N3) | — | — | — |
| L6 | Low / Medium | G | P1 T3 | Post count uses `fetched`, clamped to 26; `minOwnPostsForVoice` has `min(1)`, no max. | Use the count accessor, or cap the minimum and state it | Built | Confirmed `page.tsx:84, 261`; `schema.ts:259` |
| L7 | Low / High | G | P1 Verification 3, 6 | V3 "4 of 4 done" unreachable after a Free voice refusal; V6 does not state its process/key/spend prerequisites. | Fresh-sign-up rule on refusal; state prerequisites | Records | Plan text |
| L8 | Low / Medium | G | P2 T1 / AC2 lint | "within five lines" proves proximity, not settledness; a wait inside an untaken branch satisfies it. | Require the wait to share a block with the screenshot, or a named settled helper | Built (tests) | `solo-creator.spec.ts:167-173` |
| L9 | Low / Medium | G | P2 T4 scan | `BLOCKING` match not anchored to `[note] ` lines; console lines may false-positive. | Match `^\[note\] ` + prefix; plant a console-line case | Built | `artifacts.ts:53-67, 80` |
| L10 | Low / Medium | G | P2 T4 step 7 | First failing spec aborts later specs (default `bash -e`); unstated. | Run each, collect exit codes, fail at end | Built | Reasoned |
| L11 | Low / Medium | G | P1 T8 / V6 | CRLF preservation has no byte check (lesson 2026-09-04). | Diff shows only branch lines; line-ending check | Records | Orchestrator verified CRLF at HEAD |
| L12 | Low / Medium | G | P2 Completion Criteria; P1 Agents line | Phase 2's gate omits billing although T1/T2 carry money assertions; Phase 1's compliance scope omits T1 (iii) copy, which compliance has reviewed twice. | Name them | Records | Plan text |
| L13 | Low / Medium | T-N1 | P2 T4 (10); AC5 | Per-persona report dirs make the `data/*.zip` exclusion and its AC grep vacuous. | `!playwright-report/*/data/*.zip`; match that line | Built | Reasoned |
| L14 | Low / Medium | T-N2 | P2 T4 (5) | `authUserId` into `$GITHUB_ENV` unvalidated. | Validate id shape | Built | — |
| L15 | Low / Medium | T-N3 | P2 T4; master Dependencies | Dispatch from any branch runs with the vendor key. | Protected environment or `refs/heads/main` guard, or a README residual | Built / Records | — |
| L16 | Low / Medium | T-N4 | P2 T5 | README should state the admin identity is local/ephemeral only. | One sentence | Records | — |
| L17 | Low / Medium | T-N5 | P1 T1 (ii) | Canonical-first changes which occurrence and bytes are cited for today's exact matches. | Exact first, canonical on miss | Built | `assemble.ts:268-272` |
| L18 | — | — | — | (merged into M7) | — | — | — |
| L19 | Low / Medium | B-N5 | Master Derived Budgets | Lower bound ≈11; worker schedule paths unnamed. | Derive bound | Records | — |
| L20 | Low / Medium | B-N6 + G | Master Exit Demo; P2 T4 (6) | Refusal count ambiguous; two re-dispatch rules; dispatch count unbounded. | Pin a cap | Records | — |
| L21 | Low / High | C-N1 | P1 T6 (v) vs w3c | w3c fixture shows `$4,000` beside "not listed here". | Wording or test comment | Built (copy) | — |
| L22 | Low / High | C-N2 | P1 T5 File(s) | Missing `studio-panel.tsx`/`run-copy.ts`; client panel cannot import `studio/copy.ts`. | Add; state where the sentence lives | Records | — |
| L23 | Low / Medium | C-N3 | P1 T5 | "could not be read" beside "activate a brain first". | Optional wording | Built | — |
| L24 | Low / High | C-N4 | P1 Least confident | Mis-map surfaces as `provenance`, no kind. | Name it — or adopt the runtime postcondition (convergence) | Records | — |
| L25 | Low / High | C-N5 | P1 AC9 | "two" comments; decision entry has no test. | Align; mark manual | Records | — |
| L26 | Low / Medium | C-N6 | P1 T1 pre-vendor sentences | No bar on a fix timeline; remedy "tell us" unnamed. | Add | Built (copy) | — |
| L27 | — | — | — | (merged into M5, B-N1) | — | — | — |
| L28 | Low / Medium | B-N2 | P1 T1 (iii) | Counts wrong (37 codes; 15 matches, not 13). | Replace counts with the list | Records | `copy.ts:128-221` 37 entries — confirmed |
| L29 | Low / High | B-N4 | P1 T1 (iii) | Shared `inference_unusable` edit contradicts "shared entries untouched"; unstated exception. | Name the exception | Records | — |
| L30 | Low / Medium | G | P2 Verification 2; T5 README | Repeated local runs can hit Better Auth's DB-backed 10 sign-ups/hour limit. | README note | Records | Limiter per tenancy report |
| L31 | Low / High | T-N9 + G | Master `:5`, `:136`; umbrella `:61` | Stale status lines. | Refresh | Records | Confirmed |
| Info | — | T-N6, T-N7, T-N8, B-N7, C-N7; G (config/price try-block coupling in T3) | various | Carried as recorded. | — | — | — |

(26 open Low items — L2, L5, L18 and L27 are merge markers.)

## Convergence diagnostic (gate-rules §5 — one bounded diagnosis, not a new verdict)

### Refusal-copy honesty (Phase 1 T1 (iii)) — batch 2 P1-2 → batch 3 billing C7/C3 + compliance C2 → batch 4 billing F1–F5 + compliance K1–K3

**Root cause: T1's scope, not the scan's mechanics.** T1 (iii) tries to make **static per-code copy guarantee a runtime money fact** — "this refusal never invites a re-press the product will refuse". Whether "try again" is true is a function of (code × producer step [pre-claim / 8a / 8b / 9] × tier × balance × pack availability × banner channel [voice run vs `?e=`]) — and of the **parked** included-build policy: if the owner decides a model-reply failure should not consume the build (as truncation already does, `llm/src/errors.ts:242-257`), today's "try again" becomes true. The design pushed that multi-factor fact through three lossy proxies — a producer classification (`PRE_CLAIM_CODES`, which got the claim step wrong), a phrase regex (a list, not a rule — lesson 2026-08-18) and a shared override table (which also serves another channel) — so every fix tightened one factor and exposed the next, and the batch-3 fix itself removed a true disclosure and forced the wrong table. The Deferral Ledger's "stuck Free creator" row is the same fact seen from the money side, and it is already routed to the parked plan.

**Smallest change that removes the class: stop making copy predict re-press economics in this goal.**
1. Delete from T1 (iii): the re-press scan, `PRE_CLAIM_CODES`, all `ONBOARDING_OVERRIDES` edits (drop `onboarding/copy.ts` from Files), w8.
2. **Kind sentences** say only which of the product's checks failed — static, product vocabulary. The 3 pre-vendor kinds (`ASSEMBLY_KINDS_PRE_VENDOR`) render their sentence *instead of* the shared detail (nothing was sent, nothing spent, the fault is the product's, "tell us", no timeline); the 13 post-vendor kinds render under it.
3. **`inference_unusable`**: title makes no claim that a model answered; detail removes only the false "most often a quote…" guess, **keeps** "Your run was still made, so it counted" (true for every post-vendor kind on every tier), and replaces "try again" with a pointer that is true on every tier and under any policy — "the price line above shows what another build costs and your balance" (`run-cost`, computed from `onboardingBrainPrices` and `getBalance`, rendered unconditionally, `run-inference-panel.tsx:89-90`). Test: counted-clause present for a post-vendor kind, absent for a pre-vendor kind; no "try again" in this one entry.
4. **Ledger row to the parked plan** (included-build policy, T6-P): list the 14 shared entries + the `workspace_paused` override whose "try again" is false for a Free creator with a consumed build (incl. `llm_attempt_recorded`, `provenance`, `brain_pointer_divergence`, `brain_content_walk`, `reference_echo`) and `unknown`'s "nothing was charged" after a rebuild debit, stating that their honesty depends on that policy decision.

**Does it leave this goal?** Only the sibling-code honesty moves, and it lands beside the ledger row that already owns the decision. **What Phase 1 still ships honestly:** the 16 closed kinds and source-parsed equality test; the tolerance; the content-free log with `assemblyKind`; the refused state carrying the kind; `data-code`/`data-assembly-kind` for Phase 2; kind sentences that are honest about exactly what they claim; `inference_unusable` without its false guess or false remedy, keeping its true spend disclosure. This dissolves M3, M4, M5, M7, M8, moves M6 to the ledger, and shrinks billing/compliance re-review to a handful of sentences and two assertions.

### Quote-provenance test strength (batch 3 M1–M3 → batch 4 T-CH1–3, T-N5, C-N4)

**Root cause:** mis-map detection was delegated to test properties that call `canon` — the thing under test — so every round found a direction (whitespace, over-tolerance, test-side vs imported) the properties could not see. **Class-removing design (stays in T1):** (1) exact `indexOf` first — today's behaviour byte-for-byte; (2) on a miss, a canonical match with a single `canon` built from an explicit code-point table (no `\s`, no `trim()`); (3) a **runtime postcondition inside `locateQuote`**: accept a canonical match only if `canon(slice) === canon(needle)` and the slice boundaries are non-whitespace unless the needle's are — otherwise return null → `quote_not_found` with a kind, so a mis-map fails closed and names its kind instead of surfacing as kindless `provenance`; (4) pin `canon` by an **exhaustive** check over every code point in `\p{White_Space}|\p{Pd}|\p{Pi}|\p{Pf}`, not a generated sample; (5) one witness (delete the postcondition, plant an off-by-one map → the stored-slice test reddens) replaces w2b/w2c/w2d. The M2 vacuity disappears because correctness no longer rests on a test's copy of `canon`.

### Other invariants with findings in both batches

- **`step-state-derived-not-assumed`** (C8 → CHANGE 4): cause — step derivation is prose against reads that fail differently. Fix — a pure `deriveOnboardingSteps({ownPosts: number|null, minOwnPosts: unknown, voiceActive: boolean|null, interviewSubmitted: boolean|null, hasGeneration: boolean|null})` where any null/non-finite → `unknown`, table-tested over the null/non-finite combinations; the page passes null only on the listed classes.
- **`honesty-blocks-never-folded`** (C5 → K4/K5): cause — hand-listed "outside" testids. Fix — set equality over testids inside `<details>` spans with a fixture rendering every honesty block, plus a positive control per panel.
- **`journeys-manual-or-nightly-only`** (C2 → CHANGE 6): cause — proven by grep. Fix — YAML-reading vitest with planted triggers.
- **Owner-only billing** (C6 → F6): cause — an assertion added without checking locator cardinality. Fix — scoped locator.

Per §5 a thinner usable slice is partial progress; the original scope stays owed unless the owner changes it.

## Least-confident probes

- **Phase 1 — "canonicalisation is what run 2 failed on": a plausible bet, honestly stated.** Supporting: solo posts use straight apostrophes (`solo-creator.spec.ts:40-41`) and run 1 succeeded where run 2 failed on the same posts, consistent with a nondeterministic curly apostrophe hitting `assemble.ts:372-379`; an NFC-only mismatch would have surfaced as `ProvenanceError` (the model's quote is stored at `:383`), not the observed `AssemblyError`. Gap: T1's own likeliest regression (a mis-map) would surface as kindless `provenance` (L24) — closed by the runtime postcondition above.
- **Phase 2 — "two-start bootstrap, compose Postgres, unauthenticated warm-up": mostly holds.** Compose container name, user, db and port match `db-shortcut.ts`; `--wait` + healthcheck exist; `ADMIN_USER_IDS` reaches both step-6 processes; the auth rate limit fits a fresh CI DB. The likeliest first failures are ones the line does not name: the restart race and step-5 cold compile (M9), then a strict-mode false failure on every run (M11). Docker availability on hosted runners and Compose `--wait` support are assumed (training knowledge, not verified).

## Owner decisions required before any Phase 1 implementation can start

1. **The T1 (iii) scope under §5:** (a) adopt the class-removing reduction above and route sibling-code remedy honesty and `unknown`'s money claim to the parked included-build policy row (recommended), or (b) keep the scan design and apply F1–F5/K1–K3, accepting that it has failed to converge twice.
2. **Authorise (or decline) one further evaluation.** Every Medium above changes what is built, so §9 row 4 and §3 require its reviewer, and both extensions are consumed. Minimum scope if (a) and the matcher redesign are adopted: tenancy (T1 matcher, T3, P2 T4), billing (the reduced T1 (iii) sentences, P2 T1/T2), compliance (T1 (iii) sentences, AC10/T7), and a generalist — or a split gate (Phase 1 now, Phase 2 later) if the owner prefers.
3. **What a model refusal does to the nightly:** should the operator's voice-build refusal fail the run or be recorded (M12)? This defines "green" for `journeys-no-persona-skips`.
4. **Exit-demonstration bound:** how many dispatches/refusals before the stuck-creator ledger row applies (L20).
5. **Accept or fix residuals:** dispatch from any branch with the vendor key (L15); the local known-password admin identity (L16); seed-pinned niche copy (B-N7); the pack-premise wording (M8) if not dissolved by (1a).
6. **Programme dependency:** creator-ready Phase 0 must reach READY and publish its baseline manifest (Phase 1's header precondition).

Nothing here reopens the R-68 text, the Phase 1 size acceptance, the UI-bootstrap direction or payment parking.

## Verdict

**NOT READY.** Ordered fix list: (1) owner decision on T1 (iii) scope → if (a), the reduction + ledger row (M3–M8, L28, L29); if (b), F1–F5 and K1–K3 as specified; (2) T1 matcher: exact-first, table `canon`, runtime postcondition, exhaustive code-point check, one witness (M1, M2, L1, L17, L24); (3) P2 T1/T2: scoped not-owner locator (M11); resolve the editor-on-refusal contradiction (M12); (4) P2 T4: port-release wait + step-5 warm-up/re-dispatch (M9), trigger vitest (M10), step-scoped key (L3), exclusion glob (L13), id validation (L14), per-spec exit collection (L10), anchored note match (L9); (5) P1 T3: pure step derivation, reuse `fetched`, non-finite minimum, count clamp (M13, L6); (6) P1 AC10/T7: set equality with full fixtures, positive control (M14, L4); (7) records-only batch L7, L11, L12, L16, L19–L22, L25, L30, L31; (8) an owner-approved re-evaluation scoped to the built edits, then creator-ready Phase 0 READY.
