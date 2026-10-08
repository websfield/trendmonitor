# Launch remediation L1 — creative contract and filmability

Phase: L1 of [launch remediation](../../plans/respin-launch-remediation-master-plan.md#l1--creative-contract-and-filmability). Programme ledger: [creator-ready ledger](ledger.md). Date: 2026-10-03. Depends on L0 (owner-accepted 2026-10-03).

## Phase L1 — review

**Overall: Ready** — L1 is built, locally green and gated. Billing Ready/A and tenancy Ready/A. Compliance needed four rounds: two BLOCKs and two Highs of one class (an integrity check switched off by a model-authored field, a missing declaration or a reusable text token), each closed as a class under owner decisions R-150 and the authorised extra runs. The final run (round 4) returned Almost/B with 0 BLOCK/High; its 4 Medium and 1 Low are fixed and noted below with planted-and-red proof, so it reads Ready/A under §4. Movement: Not yet (D) → Not yet (D) → Almost (C) → Almost (B) → Ready (A). Remaining evidence (browser journey, evaluation set, live rates) is owed by L2 and L6 and named below. Ready means locally ready; nothing was released, committed or pushed.

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | green; baseline 2 → 0 (retired) | Final run on `L1-final.sha256` (42 files, digest `6c8121ab5585`): preflight, typecheck, worker:typecheck, lint, db:check, build, test all exit 0; 221 files / 5,997 tests passed, 23 files / 119 tests skipped (Docker suites, `TEST_DATABASE_URL` unset). [entry-gate-L1.txt](entry-gate-L1.txt) |
| Respin billing & credits (`respin-billing-reviewer`, separate) | Ready A | [r1 B](L1-billing-round1.md) → [r2 PASS A](L1-billing-round2.md); 2 fixed · 0 open |
| Respin brain tenancy (`respin-tenancy-reviewer`, separate) | Ready A | [r1 B](L1-tenancy-round1.md) → [r2 PASS A](L1-tenancy-round2.md); 5 fixed · 0 open |
| Respin spin compliance (`respin-compliance-reviewer`) | Ready A (after Medium/Low batch-fix) | [r1 BLOCK D](L1-compliance-round1.md) → [r2 BLOCK D](L1-compliance-round2.md) → R-150 → [r3 Almost C](L1-compliance-round3.md) → [r4 Almost B](L1-compliance-round4.md); r4 4 Medium + 1 Low fixed · 0 open |
| Acceptance criteria | 13/14 proven, 1 partial | AC-14 (evaluation set) partial → L6; UI browser evidence unverified → L2/L6 |
| Least-confident probe | broke, then repaired | Declared bet (strict v2 schema) held for money (free to creator, capped) and compliance (prompt states every field). Later bets (event-guard precision, continuation false positives) are recorded gaps measured in L6 |
| Reachability | reached via `/studio` (Ideation, Idea-to-script form control) | 4 deferred items (below) |
| Fixed without re-review | 18 | Round-4 Medium/Low batch plus earlier Lows; listed below and in the ledger |
| Gate ran | 8 runs · 5 re-runs | Two of the re-runs (compliance r3, r4) were owner-authorised beyond §5 |
| Gate intensity | lean | Billing and tenancy separate (Full gates: yes); compliance its own run |

**Top things to fix (in order):**
1. `respin/packages/modes/src/mode-checks.ts:1244` (`CONTINUATION_SHAPE`) and the event-shape register — the guard trades recall for precision in both directions ("I shot the scene, tired and annoyed" is refused; elided verbs joined by "plus"/"&"/";" pass). Both rates are unmeasured; L6 measures them per prompt bundle version, and L5's T6-P lists the charged refusals.
2. `respin/app/(product)/studio/studio-panel.tsx`, `generation-outcome.tsx` — no actual-app browser or accessibility run in L1; owed by L2's `/studio` Playwright journey and L6 LA-2.
3. `respin/app/(product)/studio/generation-outcome.tsx:527-528` — model-authored disclosure prose still renders on `/studio` (pre-existing audit R3-1 / P1-R1, CRITICAL, outside L1's contract; now scanned for events).

*Ask `/go` to explain any finding in plain words — or to just fix them.*

### Acceptance proof (plan L1 Acceptance)

All named tests ran inside the final full-suite run on freeze r4 (`pnpm -C respin test` · exit 0 · 5,965 passed).

- AC-1 legacy/new round trips: `packages/modes/tests/output.test.ts` "a stored LEGACY output (no version) still reads, as legacy, for every mode", "an UNVERSIONED output carrying v2 fields is NEVER read as v2", "a stored v2 output survives its jsonb round trip unchanged" · pass
- AC-2 all three explicit forms: `mode-checks.test.ts` "an explicit %s concept batch…" ×3; `generate.test.ts` "R-148: an explicit %s choice settles a batch in exactly that form" ×3; `pipeline.test.ts` "an explicit %s script survives the whole pipeline first draft" ×3 · pass
- AC-3 auto inside the existing call sequence: `generate.test.ts` "'Choose for me' adds NO model call and NO charge — provider and debit counts equal a legacy ideation"; `revision.test.ts` ideaToScript + auto asserts 2 calls · pass
- AC-4 custom vs approved provenance: `mode-checks.test.ts` "custom structure is labelled, never promoted" and "a custom name may not carry an approved name under ANY spelling…"; `generate.test.ts` custom-provenance test (no `framework_versions`, frameworks/proposal counts unchanged) · pass
- AC-5 hostile form values refused before the provider: `generate.test.ts` "R-148: HOSTILE input — %s — …" (16 cases, no attempt or usage row); `studio-ui.test.tsx` "a HOSTILE form choice… never reaches a log line unclamped" · pass
- AC-6 unsupported experience/result: `mode-checks.test.ts` "ROUND 2 (R-150 point 1)" B1/B1b/B2/B3 and "ROUND 3" register example; `generate.test.ts` "R-150 point 1 (B3 through the money path)"; `revision.test.ts` relabel and scaffold refusals · pass
- AC-7 undeclared equipment: `mode-checks.test.ts` "STRICT READING … with NOTHING declared, EVERY place and piece of kit is marked", "C4: undeclared specifics … REPORTED by traceability exactly as if no server decision existed", "the stamp marks shot-map kit PER FIELD" · pass
- AC-8 forced near-copy still refused: `generate.test.ts` "Spin near-copy is gated before candidate output, settlement, and the returned projection" and "…NON-HOOK field (the caption)…"; `pipeline.test.ts` "the Spin pre-display similarity gate" · pass
- AC-9 form control reaches the request: `studio-ui.test.tsx` "THE FORM CONTROL REACHES THE REQUEST…" and "no form choice on the wire means NO creative request" · pass
- AC-10 explicit-choice mismatch refuses: `generate.test.ts` "an explicit-choice MISMATCH is rewritten once, then an honest refusal" · pass
- AC-11 changing the choice changes identity: `generate.test.ts` "CHANGING THE CHOICE changes request identity…"; `revision.test.ts` "the creative half is part of request identity — every field of it, and its absence" · pass
- AC-12 no form-selection call or charge: `generate.test.ts` (AC-3 test) debits `[-3,-3]`, 2 calls; "a v2 SCRIPT settles at the full-script price…"; `revision.test.ts` "a revision of a v2 parent KEEPS v2… costs a revision, with no extra call" · pass
- AC-13 legacy records still read, and the entry baseline is cleared: `revision.test.ts` "a revision of a LEGACY parent stays legacy…"; `isolation.test.ts` ENUMERATION tests and "presented-output.ts owns no query — its NOT_DB_FACING reasons are CHECKED" · pass
- AC-14 baseline/candidate outputs retained for L6's human evaluation: stored generations carry contract version, bundle version and the creative request · **partial** — no evaluation set is built (L6 / `LR-EVAL-1`).
- UI browser evidence (`verifying-webapps`): **unverified** — owed to L2's `/studio` Playwright journey and L6 LA-2.

### Definition of Done

1. Validation gate: green on freeze r4; baseline retired (2 → 0).
2. Every acceptance criterion names its proof: 13 proven, AC-14 partial, browser evidence unverified.
3. One verdict per touched path: billing A, tenancy A, compliance A after the round-4 Medium/Low batch-fix. Met.
4. Cross-referenced docs: R-148 (owner), R-149 (implementer defaults, amended three times), R-150 (owner) plus its implementation note; PRD REQ-C01/C02/D02 amended.
5. User path: `/studio` Ideation and Idea-to-script with the form control and filming limits.

### Fixed without re-review (from the final round of each gate)

- fixed: `respin/packages/modes/src/mode-checks.ts:1261,1318,1406` — position-based `[check]` ownership with sentence cap; `CLAUSE_BOUNDARY` deleted (compliance r4 Medium 1; plants T01–T04, T15).
- fixed: `mode-checks.ts:1336,1344,1546` — revision restatements need their own mark (compliance r4 Medium 3; T05–T07).
- fixed: `mode-checks.ts:1244`, `respin/packages/modes/src/bundle.ts:173` — one subject-continuation shape; `shared-run-carries-invention` restored as open (compliance r4 Medium 2; T08–T10).
- fixed: `mode-checks.ts:1071` — disclosure platform/guidance scanned (compliance r4 Medium 4; T11).
- fixed: `mode-checks.ts:867,878` — -t/-ed past fold; register count restated 3/9 (compliance r4 Low; T12–T13).
- fixed: `respin/packages/modes/src/hard-rules.ts:173` — remedy wording (compliance r4 Note; T14).

- fixed: `respin/packages/modes/src/mode-checks.ts:1221,1229,1376` — pass (a) requires `[check]` in the match's own clause (compliance r3 Medium).
- fixed: `mode-checks.ts:1251,1267`; `respin/packages/modes/src/text.ts:60`; `respin/packages/modes/src/assemble.ts:544` — passes (b)/(c) bound to the match span; the prompt route is removed (compliance r3 Medium).
- fixed: `mode-checks.ts:1039,1049,1060` — shot-map shot/note and hook mechanic scanned; exclusion reasons accurate (compliance r3 Medium).
- fixed: `assemble.ts:544`, `mode-checks.ts` gap `honest-line-reads-as-event` — viewer-addressed past tense rule in the prompt; indicative rate recorded (compliance r3 Medium).
- fixed: `respin/packages/modes/src/output.ts:236,720`, `mode-checks.ts:1571,1647`, `respin/packages/credits/src/presented-output.ts:117` — shot-map server checks per field (compliance r3 Low).
- fixed: `respin/packages/credits/src/generate.ts:1816` — candidate envelope 5 (compliance r3 Note).
- fixed: `presented-output.ts`, `isolation.test.ts` reasons ("Studio reads them today; L4's export presenter must") (tenancy r2 Low).
- fixed: `respin/packages/credits/tests/revision.test.ts` relabel/scaffold refusals assert calls and `REVISION_COST` (billing r2 Note C).
- Earlier rounds' Medium/Low fixes are listed in the ledger lines for rounds 1–2.

### Deferred

- 2026-10-03 — Draft 1's usage row is `consumedIncludedBuild=true` when the rewrite then fails to parse, so its cost escapes both uncharged caps (bounded ≈2×) — `respin/packages/credits/src/generate.ts:1316-1328` — activates with: operation identity and recovery (launch-remediation L2).
- 2026-10-03 — Form/filming/`unsupported_experience` refusals after the rewrite are charged honest refusals — tech-spec §3 step 5 — activates with: T6-P policy decision (launch-remediation L5).
- 2026-10-03 — Event-guard false-positive and miss rates and v2 prompt-length margin are unmeasured — `mode-checks.ts` gap register — activates with: LA-4/LA-5 evidence (launch-remediation L6).
- 2026-10-03 — An explicit creative override on a revision swaps the form at the revision price (no Studio control) — `generate.ts` `effectiveCreative` — activates with: revise/select actions (launch-remediation L2/L4).

### Field metrics

| Metric | L1 |
|---|---|
| Docs per phase | 1 card + 6 gate reports (round transcripts) |
| Reviewer runs | 8 |
| Evidence lines | 16 |
| First-pass headline | Not yet (compliance BLOCK) |
| Wall-clock | one session (2026-10-03) |

### Reviewer reports

Saved verbatim-condensed beside this card: [billing r1](L1-billing-round1.md), [billing r2](L1-billing-round2.md), [tenancy r1](L1-tenancy-round1.md), [tenancy r2](L1-tenancy-round2.md), [compliance r1](L1-compliance-round1.md), [compliance r2](L1-compliance-round2.md), [compliance r3](L1-compliance-round3.md). [compliance r4](L1-compliance-round4.md). Freeze manifests: `L1-freeze.sha256`, `-r2`, `-r3`, `-r4`, `L1-final.sha256`.
