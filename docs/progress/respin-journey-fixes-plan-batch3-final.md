# respin-journey-fixes plan review — batch 3, final generalist `plan-reviewer` (2026-10-04)

Frozen inputs matched before and after. Read against `3533dbf` plus the uncommitted L1 diff. `respin-launch-remediation-master-plan.md` (untracked) now hashes `3aa7cb08f592` vs its round-1 reviewed `f76950c7d96b` (L-7).

**Verdict: NOT READY · Not yet · Grade D.** Closable by text edits and owner answers, not a redesign.

## Consolidated findings

| ID | Sev | Location | Finding |
|---|---|---|---|
| H-1 | High | journey-fixes master `:3`; `creator-ready-master-plan.md:42,121`; launch-remediation `:93` | No T6-C contract in the parked text; T6-C's contract is L2 (`:97-103`) + `02_Remediation_Plan.md` §7. |
| H-2 | High | launch-remediation `:103` (also `:131`, `:186`) | The actual-app journey needs a paid tier for the script step (`mode-access.ts:86`) and the reference step (`pasted-reference.ts:111-113`); only parked F-01 produces one; L4 hits the same wall. |
| H-3 | High (decision) | `L0-card.md:292` | A-11 (billing verdict on the shipped voice re-ask) blocks L2 and is unanswered. |
| H-4 | High (parked text) | `phase-1.md:104,152,160-164` | T3 contradicts shipped code (re-ask exists; terminal consumes at `inference.ts:951`); false "fixed message of ours" copy; unsafe retirement of `inference_unusable`; witness w3 cannot redden; seventh literal list. |
| M-1 | Medium | master `:51`; phase-1 `:40,69,80,88,92` | T6-P stated as decided. |
| M-2 | Medium | launch-remediation `:101` | No usage-accounting rule for operations vs calls; draft-1 flag has no receiver; no voice-purpose fence. |
| M-3 | Medium | phase-3 `:3,39,44,86,98-103,123` | Not re-based (respin.yml job, repository key, nightly schedule; four "new" files exist). |
| M-4 | Medium | launch-remediation `:101` vs `L0-card.md:116-131` | L0 §3.3 items routed to L2 have no disposition; P3-R1/R-134 intersects L2 recovery. |
| M-5 | Medium | launch-remediation `:17,103`; L0 A-5 | Journey's real model spend unauthorised; no transport-seam fake exists. |
| M-6 | Medium | launch-remediation `:99-101` | No Free-tier state at select/confirm. |
| M-ext | Medium (live code) | `billing-errors.ts:1016,1026` | `/onboarding` "nothing you wrote" copy false; route to L5/audit. |
| L-1..L-7 | Low | — | stale citations; Subscribe-disabled assertion; P-24; T5 re-spec; `CreativeRequestError` missing from `INSTANCE_BRANCH_CODES`; Files-table caps; L-7 hash delta. |

## Edit list

E-1–E-21 park the plan honestly (T6-C pointer, superseded markers on T3/T4/T5 and phase 3, T6-P "proposal pending", Review Log rows, creator-ready routing). E-22–E-30 make L2's prerequisite satisfiable: E-22 rewrites `:93` (T6-C unparked; batch 3 + affected re-check recorded; A-11 answered; T6-C contract = L2 section, code-gated by billing + tenancy); E-25 adds §3.3 dispositions, usage accounting (one row per call, caps count calls, voice semantics fenced), refusal-code enumeration, Free-tier state; E-26–E-29 apply the H-2 decision to L2/L4/LA-2/validation; E-30 names the journey's model-spend source.

## H-2 recommendation

C (refined B): Free Playwright journey through ideation → choose (zero-cost, survives reload) → confirmation with configured script price + named plan block, no debit, no provider call; executed server-action test for operation-ID stability and **New generation**; paid confirm → script proven on real Postgres (`generate-race.docker.test.ts`, `creative-work.test.ts`, existing `setTier` fixture); paid browser walk (incl. reference-only) moves to L6 LA-2. A (test entitlement route) rejected as a second producer. D (advance F-01 T1/T2 on a Stripe sandbox) only if the owner wants paid browser proof before L3/L4.

## Can L2 money work start after the edits?

Not without one narrow re-check: one sole `respin-billing-reviewer` run on the diff of E-22/E-25/E-26 plus E-1–E-3 and E-20–E-24. Compliance re-run on `phase-1.md` recommended waived (the Highs close by removing text no L2 work reads). Owner answers first: A-11 (recommended: re-ask stays fixed-unverified, billing verdict at L5 with F-02, E-25(ii) fences L2) and H-2 (C or D). L2's non-money parts (entrances, `creative_pieces` schema and lifecycle registration, zero-cost selection) may start now.
