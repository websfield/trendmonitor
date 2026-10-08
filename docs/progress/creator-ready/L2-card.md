# Launch remediation L2 — entry, selection and operation identity

Phase: L2 of [launch remediation](../../plans/respin-launch-remediation-master-plan.md#l2--entry-selection-and-operation-identity). Programme ledger: [creator-ready ledger](ledger.md). Date: 2026-10-04. Depends on L0 (owner-accepted 2026-10-03) and [L1](L1-card.md) (Ready/A 2026-10-03). Prerequisites: T6-C unparked alone (A-1); journey-fixes batch 3 plus its billing re-check, with the owner's recorded acceptance; A-11 answered.

## Phase L2 — review

**Overall: Ready** — L2 is built, locally green and gated.

What it delivers:
- `/studio` offers **Find concepts** and **Develop an idea I already have**.
- Choosing a stored concept costs nothing and is stored as a `creative_pieces` record.
- Confirmation shows the configured script price, and on Free the plan block.
- One operation ID survives duplicate submit, refresh and lost response; **New generation** mints another.
- A same-ID submission reads its claim before any gate.

Gate history:
- Round 1 returned billing Almost/C (one High: the unguarded success-path spend write, audit P3-R5), tenancy Almost/B, compliance Almost/B, security Ready/A, accessibility Almost/B.
- After one fix batch, the billing re-run returned PASS/A. Every Medium and Low was fixed with a test and needs no re-review (§3).

Ready means locally ready. Nothing was released, committed or pushed. The paid browser walk is owed by L6 LA-2 (owner decision H-2, option C).

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | green | Run on `L2-rerun.sha256` (93 files, digest `285ff31cf5b4`), orchestrator: preflight, typecheck, worker:typecheck, lint, db:check and build each exit 0. `TEST_DATABASE_URL=… pnpm -C respin test` exit 0: 251 files, 6,207 passed, 18 skipped, all in `journeys-workflow-triggers.test.ts`; the Docker money suites ran live. `playwright test --config playwright.l2.config.ts` exit 0 (1 passed). |
| Respin billing & credits (`respin-billing-reviewer`, separate) | Ready A | [r1 Almost C](L2-billing.md) → [re-run PASS A](L2-billing-rerun.md); 5 fixed · 0 open |
| Respin brain tenancy (`respin-tenancy-reviewer`, separate) | Ready A (after Medium/Low batch-fix) | [r1 Almost B](L2-tenancy.md); 1 Medium + 1 Low + 2 Notes fixed · 0 open |
| Respin spin compliance (merged run) | Ready A (after Medium/Low batch-fix) | [r1 Almost B](L2-merged.md) §A; 2 Medium + 1 Low + panel-key defect fixed · 0 open |
| Security (merged run; plan: new routes / trust boundary) | Ready A | [r1 PASS A](L2-merged.md) §B; 2 Low recorded as R-151 gate residuals |
| Accessibility of changed UI (merged run; plan: changed UI) | Ready A (after Medium/Low batch-fix) | [r1 Almost B](L2-merged.md) §C; 1 Medium + 3 Low fixed · 0 open |
| Acceptance criteria | 16/16 proven | Proof lines below. The paid browser walk is out of L2 by the H-2 amendment (moved to L6 LA-2), not unproven. |
| Least-confident probe | held | Declared (orchestrator; the implementer was interrupted before declaring one): R-151 items 4/5 change settlement pricing and uncharged counting for every generation, plus the new same-ID ordering. Billing confirmed both, with non-vacuity read per test. The probe surfaced the High (the draft-1 fix made a lost usage row the only escape from both caps), now fixed. The fix's own bet (a lost acknowledgement causes a duplicate row) was judged acceptable: over-count only. |
| Reachability | reached via `/studio` (Find concepts, Develop my idea, `?piece=` confirmation, New generation, Cancel) | 6 deferred items (below) |
| Fixed without re-review | 17 | Listed below |
| Gate ran | 4 runs · 1 re-run | Announced: billing, tenancy, merged (compliance + security + accessibility); billing re-run for its High |
| Gate intensity | lean | Billing and tenancy separate (Full gates: yes); compliance, security and accessibility merged in one Opus run |

**Top things to fix (in order):**
1. `respin/packages/credits/src/generate.ts:2473-2489` (`snapshotConfigVersionOf`): a v1 `request_snapshot` claim left at `vendor_complete` is refused on resume (`recovery_required`, no debit). Only local and dev databases that ran round-1 L2 code can hold one, because `0062` is undeployed. Accept `v ∈ {1,2}` if you want those resumes to settle; otherwise nothing to do.
2. `respin/packages/credits/src/inference.ts:1004`: onboarding's success-path `recordUsage` is the same unguarded class as P3-R5. It sits inside the A-11 fence, so it belongs to L5 with F-02/T6-P.
3. `respin/packages/db/src/creative-work-ops.ts:99-165`: no per-profile cap on zero-cost piece creation (security Low). L5.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

### Acceptance proof (plan L2 Acceptance, as amended 2026-10-04)

All named tests ran inside the orchestrator's full live-DB run on `285ff31cf5b4` (`pnpm -C respin test` · exit 0 · 6,207 passed).

- **AC-1 concurrent duplicate:** `generate-race.docker.test.ts` "L2 PAID CONFIRM -> SCRIPT: two CONCURRENT commissions of one piece's operation id — one claim, one debit, one dispatch, the piece linked once" · pass (live)
- **AC-2 duplicate submit, refresh, lost response, identical new commission:** `generate.test.ts` "L2 PIECE: duplicate submit, refresh and lost response reuse ONE operation — … an intentional identical NEW GENERATION is a second, charged operation" · pass
- **AC-3 changed payload:** `generate.test.ts` "R14: the same attempt id with a DIFFERENT payload refuses, and calls nothing" · pass
- **AC-4 altered config/context:** `generate.test.ts` "L2 ALTERED CONFIG/CONTEXT: a same-id resubmission after the brain and the price moved REPLAYS…" and both "L2 CONFIRMED QUOTE" tests · pass
- **AC-5 cross-profile and source-index forgery:** `generate.test.ts` "L2 PIECE: CROSS-PROFILE and SOURCE-INDEX forgery are refused…" (now unconditional, plus foreign `pieceId` commissions); `creative-work.test.ts` cross-profile, source-index and cross-workspace cases · pass
- **AC-6 deleted parent/source:** `generate.test.ts` "L2 PIECE: a DELETED source refuses the commission before anything is claimed or called"; `creative-work.test.ts` "a DELETED source takes its piece with it (FK cascade)…" · pass
- **AC-7 insufficient funds:** `generate.test.ts` "L2 PIECE: INSUFFICIENT FUNDS refuses before the vendor and claims nothing; the same id then runs once the balance can pay" · pass
- **AC-8 crash after checkpoint:** `generate.test.ts` "L2 PIECE: a crash AFTER the checkpoint resumes under the same id — settles once, links the piece, no second call" · pass
- **AC-9 no script debit on selection or cancel; cross-mode charged as original:** `generate.test.ts` "L2 PIECE: choosing a stored concept costs NOTHING, and its script is charged as an ORIGINAL ideaToScript…" and "L2: cancelling a piece costs nothing…" · pass
- **AC-10 same-ID resume order and the 24 h predicate:** `generate.test.ts` "L2: settle to balance 0, then resubmit the same id -> REPLAY…", "L2: a vendor_complete resume SETTLES even when the uncharged cap is full…", "L2 (P3-R1): a resume PAST 24 hours is the typed terminal recovery_required…"; `generation-recovery.test.ts` "L2 (P3-R1): the settlement's 24-hour predicate and the worker's hard clear draw the SAME line"; `generate-race.docker.test.ts` "L2 on real Postgres: settle the script so the balance reaches ZERO…" · pass
- **AC-11 usage accounting:** `generate.test.ts` "L2 (usage accounting): N resubmits … add ZERO model_usage rows … the cap refuses the (cap+1)th NEW operation…" · pass
- **AC-12 draft-1 fix inside the A-11 fence:** `generate.test.ts` "L2 DRAFT-1 FIX: …" and "L2 VOICE FENCE: …". The A-11 witness files are unchanged versus the checkpoint (`git diff --stat` empty) and green · pass
- **AC-13 refusal codes:** `tests/instance-branch-codes.test.ts` (enumeration, non-vacuity, three PLANTED cases including the `??` fallback) · pass
- **AC-14 Free tier and Free journey:** `generate.test.ts` "L2 FREE TIER (E-25(iv)): …"; `e2e/l2/free-concept.spec.ts` "Free: find concepts, choose one at zero cost, see the price and the plan block — no debit, no further call; focus follows each redirect" · `playwright test --config playwright.l2.config.ts` exit 0
- **AC-15 operation-ID stability against a real DB:** `tests/studio-piece-action.docker.test.ts` "one operation id across resubmit and refresh: ONE claim, ONE debit, ONE transport call; New generation mints a new id" · pass (live)
- **AC-16 transport-seam fake (E-30):**
  - `tests/llm-transport-fake.test.ts` (sentinel served model, below the origin pin, no production root imports it);
  - `packages/db/tests/llm-transport-selection.test.ts` "the server's STARTUP preflight refuses each planted shape with a stable code" and "selected but NOT preloaded refuses…";
  - existing Phase-2 journeys and `respin-journeys.yml` unchanged;
  - all pass.

### Fixed without re-review (§3)

- **Tenancy:**
  - T-1 Medium, fixed: `respin/packages/credits/tests/generate.test.ts:3322` — the cross-profile half is now unconditional, with foreign-piece commissions.
  - T-2 Low, fixed: `generate.ts:2452` — `platformSha256` (snapshot v2).
  - Note: source immutability is pinned by test (`creative-work.test.ts` "SOURCE IMMUTABILITY…").
  - Note: `creative-work.test.ts` "linkCreativePieceScriptInScope with a FOREIGN pieceId changes nothing".
- **Compliance:**
  - A-1 Medium, fixed: `generate.ts:2975` — counts only audience, positioning and pillars; a hint needs at least 3 letter-bearing words.
  - A-2 Medium, fixed: `run-copy.ts:914` — help copy states what is checked; the button now reads "Find concepts".
  - A-3 Low, fixed: `page.tsx:355` — three-state entrance, with neutral copy on a failed read.
  - A-N3 defect, fixed: `studio-view.tsx:108` — the confirmation is keyed by piece and version.
- **Billing:**
  - B-2 Medium, fixed: `pasted-reference.ts:172`.
  - B-3 Low, fixed: `generate.ts:1086`.
  - B-4 Low, fixed: test `generate.test.ts:3133` plus R-151 item 5.
  - B-5 Low, fixed: `run-copy.ts:930`.
  - Copy, fixed: `run-copy.ts:980` (`PIECE_OPERATION_NOTE`).
- **Accessibility:**
  - C-1 Medium, fixed: `piece-confirmation.tsx:121`, `focus.tsx`, `actions.ts:463`.
  - C-2, C-3, C-4 Low, fixed: `submit-button.tsx` `ariaDescribedBy`, the hint's `aria-invalid`, and polite success announcements.
- **Re-reviewed (§5):** B-1 High, fixed: `generate.ts:1484` (`recordSpend`), re-run PASS.

### Deferred (owed elsewhere)

- Paid browser walk (confirm → script, reference-only completion) → L6 LA-2 (H-2 option C).
- Onboarding success-path `recordUsage` (P3-R5 class) → L5 (A-11 fence).
- No per-profile cap on piece creation; the transport selector relies on `NODE_ENV` plus the test-DB naming → L5 / hardening (R-151 gate residuals).
- A `vendor_complete` resume refused on balance or pause clears the paid candidate (by the plan's ordering) → L5 T6-P.
- "Exactly three" in the scaffold vs 3–5 in `assemble.ts:777-779` → L6 evidence (R-151 item 8).
- Exact retry (a per-call row id plus `ON CONFLICT DO NOTHING`) if over-count ever matters; `spendCostOf` duplicates `recordUsage`'s cost rule → optional.
