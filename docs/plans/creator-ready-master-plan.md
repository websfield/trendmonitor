# Creator-ready — programme master plan

Status: **NOT READY (Almost)** — umbrella created 2026-09-15 at the owner's request; Phase 0's plan review ran batches 0, 1, 2 (20 → 13 → 10 findings, each round narrower, every finding applied); the owner approved scoped batches 3 and 4 (2026-09-15): the mis-route closed, but "closed" in the register still is not bound to run evidence (B3-1 → B4-1/B4-2) — §5 convergence stop, allowance consumed, Phase 0 not executed; Phases 1–2 ran owner-approved batches 3 and 4 and stand NOT READY (batch 4: 14 Medium consolidated, §5 convergence stop on T1 (iii) refusal copy), allowance consumed; Phase 3 is parked by the owner. Date: 2026-09-15. Baseline: `3273f36` plus the uncommitted work Phase 0 will inventory.
Owner's programme documents: [`../creator-ready/brief.md`](../creator-ready/brief.md), [`../creator-ready/02_Remediation_Plan.md`](../creator-ready/02_Remediation_Plan.md) (10 September 2026). **Not** in this repo: the sources they cite (P0 `00_START_HERE.md`, P1 `01_CURRENT_SYSTEM_2026-09-09.md`, P2, P3, P5, L1) — Phase 0 records that absence rather than reconstructing them.

## Objective

Make the existing credit-based preparation journey — idea, owned source, or reference → approved creator context → script and filming plan → checks, priced revision, saved result, export — safe, dependable and ready for observed creator testing, in small reviewed slices, without rebuilding the product or executing the launch roadmap.

## What this plan is, and is not

- It is the **single product programme** for Respin. The owner's T0–T8 ticket map is the requirement set; every Respin plan written in September 2026 is a phase of it, re-homed below with its review history intact.
- It is **not** the tooling track: [`workflow-hardening-master-plan.md`](workflow-hardening-master-plan.md) stays separate (pack hooks, checks, agent routing; security and Cutdown gates; plan READY/A; blocked on a Git `index.lock` filesystem error, not on scope). It is a precondition for the checks that gate every phase here, so it runs first or in parallel on its own ledger.
- It does **not** select a price, approve the no-debit policy (T6-P), authorise processors, spending, deployment or customer admission. Those are the owner's decisions, recorded at the affected phase.

## Requirements — the owner's ticket map, homed

| Ticket (creator-ready) | Required result (from the remediation plan) | Home in this programme | State on 2026-09-15 |
|---|---|---|---|
| **T0 — baseline** | Reproducible starting revision; obligation, configuration and input-support records; revised estimate | **Phase 0** (new) | open — the 2026-09-15 journey run and findings register are partial T0 evidence; manifest, obligation register and reference matrix missing |
| **T0 release closures → T7** | Admission, access, data, payment, telemetry, operating obligations closed | Money half → **Phase 3** (parked); **non-money half → Phase 4** (admission enforcement on signup/OAuth/bootstrap, deletion-journal provisioning and restore drill, autopsy scrub residual, telemetry/support/alert owners, customer-document placeholders) — Phase 0's register routes each row | Phase 3 parked by owner; Phase 4 unplanned, owner-dependent (admission rule, ops environment access) |
| **T1 → T2 — evaluate and improve** | Permissioned baseline and holdouts; targeted quality changes through the existing bounded repair path | **Phase 1** carries the one demonstrated defect (voice-build assembly — a parser/tolerance change, **not a prompt change**, so the owner's "T2 prompt changes require T1 evidence" rule does not bind it); **Phase 5** carries T1's permissioned baseline (owner supplies creators) | Phase 1 planned; Phase 5 unplanned, owner-dependent |
| **T3 — handoff; T3-REF — reference** | Three clear entry routes, saved-result handoff, explicit costs; evidence-bounded reference analysis incl. Instagram/TikTok verification | **Phase 1** (entry, first session, Studio handoff on the reachable surfaces); **Phase 6** (T3-REF matrix — needs a paid tier) | Phase 1 planned; Phase 6 unassessed (adapters are exactly `youtube` and `submitted`, `packages/trends/src/trend-source.ts:1`; no Instagram/TikTok adapter exists — the missing-adapter rule applies) |
| **T6-C — correctness; T6-P — policy** | Operation identity/recovery; separately approved refusal-policy change | **Phase 3** | parked; T6-P is exactly the included-build question the journeys surfaced (audit F-02) and is the owner's policy decision |
| **T7-A — release acceptance** | Candidate and real-service evidence | **Phase 2** (journeys as the Free-path acceptance harness) now; full T7-A with paid routes in **Phase 7** | Phase 2 planned |
| **T7-B/C — observe, fix, retest** | First observed creators; bounded feedback batch; fresh retest | **Phase 7** | unplanned; needs owner recruitment and consent |
| **T8 — truth-only minimum** | Published/help/checkout claims agree with accepted capability | **Phase 7**, with an outbound-truth review; the `landing-pricing` seed pin already guards numbers | unplanned |

**Phase-number translation** (the audit register and the two Respin plans use their own numbering; an audit row's "Phase N" is **journey-fixes** numbering, as each journey-fixes phase header's audit-row line confirms — `respin-journey-fixes-phase-1.md:4`, `-phase-2.md:4`, `-phase-3.md:4`): journey-fixes Phase 1 → creator-ready Phase 3; journey-fixes Phase 2 → creator-ready Phase 1; journey-fixes Phase 3 (Free-path parts) → creator-ready Phase 2, (paid parts, including its paid CI) → Phase 3; service-quality Phase 1 → creator-ready Phase 1; service-quality Phase 2 → creator-ready Phase 2. **Non-phase dispositions:** an audit row marked "Not in scope — operator note only" (F-06) → `none — operator note`; a row marked "Covered by `respin-finish-phase-10b-2.md`" (F-15, F-16) → `outside programme: respin-finish 10b-2`. **Precedence:** where `respin-service-quality-master-plan.md`'s defining set (its "Requirement IDs" section, `:14`: F-02 service half, F-03, F-04, F-05 UI only, F-07–F-11, F-13, F-14, F-18–F-21 Free-path parts) or a service-quality phase header (`respin-service-quality-phase-1.md:4`, `-phase-2.md:4`) claims a row or half-row, that claim wins → creator-ready Phase 1 or 2; only the remainder follows the journey-fixes rule → Phase 3. **Split rows — enumerated, one register row each, whose receiving-phase cell names every half:** F-02 (assembly tolerance and refusal kinds → Phase 1 via SQ-P1 T1; included-build consumption → Phase 3 via JF-P1; automatic re-ask → Phase 3 **as a Deferral Ledger row only** — no task in any pointed plan until un-park); F-05 (tier block → Phase 1 via SQ-P1 T8; typed refusal reason on any plan → Phase 3 via JF-P1 T5); F-17 (Free-path CI job → Phase 2 via SQ-P2 T4, which builds it although its header does not list F-17; activation and paid CI → Phase 3 via JF-P1 and JF-P3 T4); F-18 (Free-path settled waits → Phase 2; paid billing waits `manage-plan`/`action-error` → Phase 3 via JF-P3 T1); F-20 (Free-path route chapters → Phase 2; pause/resume with step-up, pack purchase and the cancel-subscription chapter → Phase 3 via JF-P3 T3); F-21 (Free-path README → Phase 2; `stripe listen`, step-up password and activation-prerequisite README lines → Phase 3 via JF-P3 T5). F-19 has no paid remainder → Phase 2 only.

## Non-goals (programme-wide, from the owner's brief)

Recording-pack billing, A$149 pricing, bundled revisions, a full script editor, rendering, audio/video upload, scheduling/publishing, new analytics dashboards, broad discovery, provider migration, orchestration frameworks, affiliate integration. Plus, until the owner un-parks it: any change on the money path.

## Critical Paths touched (per phase — the phase plans carry the reviewer selection)

| Phase | Respin billing | Brain tenancy | Spin compliance | Learning honesty | Other |
|---|---|---|---|---|---|
| 0 | No (read-only inspection; the obligation register cites, never edits) | No | No | No | generalist only |
| 1 | Yes, narrowly (T8 niche block reads an allowance) | Yes (T1 provenance, T3 accessor) | Yes (T5–T7) | No | — |
| 2 | No (Free path, no Stripe) | Yes (T4 admin identity, secrets) | No | No | — |
| 3 (parked) | Yes | No (the tenancy-touching accessor moved to Phase 1; the parked phases name billing only) | No | No | — |
| 4 (unplanned) | Yes (admission, entitlement) | Yes (deletion/restore, admin) | No | No | security (admission routes) |
| 5–7 (unplanned) | to be classified when planned | | | | outbound-truth (T8) |

Gate intensity `lean`; `Full gates?` paths keep separate reviewers per phase; `plan-reviewer` last on every phase gate.

## Decisions baked in (programme level)

- **Phases, not a rewrite:** the T-ticket map is honoured as phases; existing plan files become phase plans by pointer, keeping their Plan Review Logs. Nothing is renumbered inside them.
- **Payment parked (owner, 2026-09-15):** Phase 3 holds every money-path item with its history; no phase re-opens it without the owner's word.
- **Evidence states are the owner's five** — implemented / locally tested / real-service accepted / deployed / customer-observed — recorded on each phase's report card beside the pack's Ready/Almost/Not-yet; unexecuted checks are marked NOT RUN.
- **Missing sources stay missing:** P1's obligations (§§10–11) cannot be re-read; Phase 0 builds the obligation register from this repo's own records (master-plan progress table, slice cards, [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md)) and marks anything only P1 could prove as **unknown**.
- **Reference breakdown is retained, not rebuilt:** the T3-REF matrix records what the two adapters do; Instagram/TikTok are escalated as a bounded decision, never silently dropped and never described as visual inspection.

## Dependencies

| Dependency | Proof / owner |
|---|---|
| Workflow-hardening (checks and routing the gates rely on) | plan READY/A; blocked on Git `index.lock`; separate track |
| Phase 1 and 2 contracts | `respin-service-quality-phase-1.md`, `-phase-2.md` (reviewed five rounds; NOT READY; allowance consumed after owner-approved batches 3–4) |
| Phase 3 contracts | `respin-journey-fixes-phase-1.md`, `-phase-3.md` (parked) |
| Owner inputs | admission rule and research access (T1, T6, T7-B); R-68 amendment text (Phase 1); Phase 1 size acceptance; Stripe sandbox per lineage (Phase 3, when un-parked); operations environment access (Phase 4); recruitment and consent (Phase 7) |

## Deferral Ledger

| Deferred item | From | Receiving phase | Note |
|---|---|---|---|
| Money-path remediation (rollout activation, sandbox, included-build consumption, billing page, paid CI) | Phases 1–2 | Phase 3 | parked by owner; history in `respin-journey-fixes-master-plan.md` |
| Automatic re-ask on assembly failure (second metered call) | Phase 1 | Phase 3 | money path |
| Non-money release closures (admission enforcement, deletion-journal/restore drill, autopsy scrub residual, telemetry/support, customer-document placeholders) | Phase 0 register | Phase 4 | owner supplies the admission rule and operations environment access |
| T1 permissioned creator baseline and holdouts | Phase 1 | Phase 5 | owner supplies creators |
| T3-REF reference matrix, Instagram/TikTok decision | Phase 0 (records the gap) | Phase 6 | needs a paid tier or a dev-tier fixture the owner sanctions |
| Full T7-A (paid routes), T7-B/C observed creators, T8 truth | Phase 2 | Phase 7 | owner recruitment, consent, admission rule |
| Enabling the nightly `schedule` trigger | Phase 2 | owner | after the first measured spend and a vendor-side limit |
| Phase 0's user-visible effect | Phase 0 | Phase 1 (its start is gated on Phase 0's manifest) | Phase 0 wires nothing user-facing by design |
| Docker-suite count drift (`CLAUDE.md` Commands "two", `respin/docker-compose.yml:15` "nine", `respin-finish-master-plan.md` "twelve"; tree 23) | Phase 0 register row 24 | owner-assigned track (workflow-hardening or a `/sync-docs` pass); until assigned, a Non-goal of this programme | records only; no phase here edits `CLAUDE.md` |

## Derived Budgets

| Number | Source |
|---|---|
| Prior estimate 13–21 engineering days | the owner's remediation plan §10 — explicitly **not** a commitment; Phase 0 re-estimates |
| Journey wall time, nightly spend count, drain window, Free grant/rebuild | inherited from the phase plans, each cited there |
| Recurring cost | none new in Phases 0–2; Phase 2's vendor spend is a measured count with an owner-side limit |

## Risk Assessment

- The programme's biggest unknown is not code: the owner-supplied inputs (creators, admission rule, policy decisions, operations access) gate Phases 4–7, and no engineering can substitute for them.
- Phase 0 can drift into "fixing" — it is inspection only; a defect it finds becomes a register row with a receiving phase, never an edit.
- Phases 1–2 carry an exhausted review budget; implementing them without a batch 3 would mean building on verdicts rendered against earlier text.

## Phase Plans

| Phase | Ticket(s) | Description | Depends on | Primary agent | Plan file |
|---|---|---|---|---|---|
| 0 | T0 | Baseline manifest, obligation register, reference-support matrix, re-estimate | none (workflow-hardening in parallel) | `respin-engineer` (inspection only) | [`creator-ready-phase-0.md`](creator-ready-phase-0.md) |
| 1 | T2 (one defect), T3 | First-session service | 0 | `respin-engineer` | [`respin-service-quality-phase-1.md`](respin-service-quality-phase-1.md) |
| 2 | T7-A (Free path) | Journeys as a nightly regression | 0, 1 | `respin-engineer` | [`respin-service-quality-phase-2.md`](respin-service-quality-phase-2.md) |
| 3 | T0 closures (money), T6-C, T6-P | Money path — **parked** | 0, 1, 2; owner un-parks (on un-park, the pointed journey-fixes phase-3 tasks are re-based on Phase 2's outcome and keep only the paid chapters — its own "Depends on: 1, 2" line is journey-fixes numbering) | `respin-engineer` | [`respin-journey-fixes-phase-1.md`](respin-journey-fixes-phase-1.md), [`-phase-3.md`](respin-journey-fixes-phase-3.md) |
| 4 | T0 closures (non-money) | Admission enforcement, deletion-journal/restore drill, autopsy scrub residual, telemetry/support, customer documents | 0, 1 (both edit `app/(auth)/auth-form.tsx`; Phase 1's sign-up landing lands first); owner admission rule and ops access | to plan | — |
| 5 | T1 | Permissioned quality baseline | 0; owner recruits | to plan | — |
| 6 | T3-REF | Reference matrix, Instagram/TikTok decision | 0; a tier or sanctioned fixture | to plan | — |
| 7 | T7-A/B/C, T8 | Acceptance, observed creators, truth | 1–6; owner admission rule | to plan | — |

## Progress Tracking

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 0 | planned (gate pending) | | | |
| 1 | planned — NOT READY, review budget exhausted | | | see its master plan's log |
| 2 | planned — NOT READY, review budget exhausted | | | same |
| 3 | parked | | | owner decision 2026-09-15 |
| 4–7 | unplanned | | | owner inputs first |

## Plan Review Log (this umbrella and Phase 0)

Gate: plan review for `creator-ready` Phase 0, created this session (2026-09-15); no evaluation dispatched before this reservation. Phase 0 touches no Critical Path (inspection and documents only), so under gate-rules §1 the gate owes one independent generalist review.

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 0 | generalist | `plan-reviewer` (agent ae42e04b7263a00e9) | this master plan, `creator-ready-phase-0.md`, the two owner documents, as first written 2026-09-15 | evaluated | **NOT READY** — Grade D; 20 findings (1 High: the non-money release closures had no receiving phase; 6 Medium: T3 needed a login that writes session rows, the worker could be started in an inspection phase, the entry-gate shape was unnamed, `.env.local` had no key-only read method, the manifest could go stale before Phase 1, transcripts/card/ledger had no paths; 10 Low; 3 Info); report at [`../progress/creator-ready-plan-review.md`](../progress/creator-ready-plan-review.md) |
| 1 | generalist | `plan-reviewer` (agent a091d5d62cccb1cb1) | this master plan and `creator-ready-phase-0.md` as revised after batch 0, the two owner documents | evaluated | **NOT READY (Almost)** — Grade C; 20 of 20 batch-0 findings verified resolved; 13 new (3 Medium: the skipped-suite population is 23 `*.docker.test.ts` files, not "two"; the migration head had no named read; the translation table had no rule for four audit dispositions; 3 Low; 7 Info) |
| 2 | generalist | `plan-reviewer` (agent ac8b9a55f3a1791df) | this master plan and `creator-ready-phase-0.md` as revised after batch 1, the two owner documents | evaluated | **NOT READY (Almost)** — Grade C; 13 of 13 batch-1 findings applied (11 fully closed, 2 with wording residuals); 10 new (1 Medium: the translation table routed F-02 and F-05 to the parked phase while Phase 1 builds them — no precedence rule; 4 Low: "the two" survived in T6 and step 2, AC2 said 23 not 24, no Deferral row for the count drift, no `TEST_DATABASE_URL` pre-check; 5 Info) |

**Owner decisions, 2026-09-15 (recorded from the owner's own words in this session, via `/go`):** (1) **batch 3 for this gate — APPROVED**, scoped to the umbrella's Phase-number translation paragraph and Phase 0 T2 (the obligation-register requirement) and AC2, **generalist only**; (2) batch 3 for `respin-service-quality` — approved (recorded in that plan's log); (3) R-68 amendment text — **APPROVED** (recorded in that plan's log; Phase 1 T6 (viii)); (4) Phase 1 size — **risk ACCEPTED**, one phase (recorded in that plan's log; gate-rules §11 — acceptance is a warning disposition and grants no further retry). The approval extends this gate's allowance to batch 3 only (gate-rules §3); batches 0–2 remain consumed as recorded above.

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 3 (owner-approved extension) | generalist (sole) | `plan-reviewer`; dispatch settings: model inherit / no override requested, "think hard" instruction, read-only tools (Read/Grep/Glob; no Bash, to avoid the permission-prompt interruption seen on service-quality batch 1) | scope: this file's "Phase-number translation" paragraph (Requirements section) and `creator-ready-phase-0.md` Requirements Checklist item 2 (obligation register) and AC2, as they stand after the batch-2 dispositions on 2026-09-15 (the owner-decision record above is not in scope); read for context: `respin-service-quality-master-plan.md` "Requirement IDs" line, `../progress/respin-journey-fixes-audit.md` F-01…F-21 dispositions, `../progress/creator-ready-plan-review.md` batch-2 finding B2-1 | evaluated (completed, read-only tools only) | **NOT READY (Almost)** — Grade C; B2-1 closed in substance (all 21 F-ids route to the phase that builds them); 10 new: **1 Medium (B3-1: "closed" in the register is not bound to present-and-verified evidence — a row can read closed on a historical card while its witnessing `*.docker.test.ts` suite is NOT RUN in T6; AC2's "or a named missing source" lets a closed row pass)**, 5 Low (B3-2 F-05's Phase 3 half mislabelled "allowance semantics"; B3-3 paid remainders of F-18/F-20/F-21 unenumerated; B3-4 F-17 split not derived from the precedence rule; B3-5 re-ask has a ledger home only; B3-6 obligation rows 1–23 have no routing rule), 4 Info; report appended to [`../progress/creator-ready-plan-review.md`](../progress/creator-ready-plan-review.md) |

**Gate state after batch 3: NOT READY (Almost).** The owner-approved extension is consumed; no further evaluation is authorised. B3-1 changes what Phase 0 records, so under gate-rules §9 row 4 its fix needs a fresh evaluation, which needs a new owner approval; risk acceptance would preserve this verdict and cannot create Ready. **Phase 0 is therefore not executed** (the owner's instruction was to execute only if it reached Ready). Batch-3 fixes: none applied yet (see the `/go` report of 2026-09-15 for the owner's options).

**Owner decisions, 2026-09-15, second set (owner's own words in the same `/go` session, answering the post-batch-3 report):** (1) **B3-1 — apply the fix and APPROVE one further generalist-only evaluation scoped to it** (batch 4); (2) service-quality — apply E1–E9 and re-evaluate (recorded in that plan's log); (3) R-68 entry text scoped to **traceability** findings — APPROVED (that plan's log); (4) Phase 2 admin identity via the specs' existing UI sign-up with the committed throwaway password — APPROVED as direction, tenancy to re-evaluate (that plan's log).

Disposition of batch 3 (10 findings, 2026-09-15; §16 accounting — 9 applied, 1 no change): **B3-1** (Medium, changes what is built) → `creator-ready-phase-0.md:36` state vocabulary pinned (`closed` / `closed-by-record (witness unrun: <suite>)` / `open` / `unknown`) and a witness column; `:121` AC2 enforces it against `entry-gate-phase-0.txt`; `:130` risk `closed-means-witnessed` added. **B3-2** → umbrella `:29` F-05's Phase 3 half is the typed refusal reason (JF-P1 T5). **B3-3** → `:29` paid remainders of F-18/F-20/F-21 enumerated (JF-P3 T1/T3/T5), F-19 Phase 2 only; Phase 0 `:36` and AC2 list six split rows. **B3-4** → `:29` F-17's Free-path half anchored on SQ-P2 T4; the general clause now reads "paid CI"; the "only disposition" rule removed. **B3-5** → `:29` re-ask recorded as a Deferral Ledger home only. **B3-6** → Phase 0 `:36` receiving phase for rows (1)–(23) by the owner's §3 areas (`02_Remediation_Plan.md:53-57`), `n/a` when closed. **B3-7** → `:36`/AC2 one register row per F-id. **B3-8** → `:36` cites the four phase headers' audit-row lines; `:29` states audit "Phase N" is journey-fixes numbering. **B3-9** → `:29` "UI only", "Requirement IDs section, `:14`". **B3-10** (Info, probe) → no change. B3-1 changes what Phase 0 records, so its fix is **unverified until batch 4**; B3-2–B3-9 change only how the plan reads (§9 row 4).

| Batch | Slot | Reviewer | Inputs (frozen) | Status | Verdict |
|---|---|---|---|---|---|
| 4 (owner-approved extension, second) | generalist (sole) | `plan-reviewer`; model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash) | scope: the B3-1 fix — `creator-ready-phase-0.md` Requirements Checklist item 2 (state vocabulary, witness column, rows (1)–(23) routing), AC2 and Risk coverage — plus the umbrella's translation paragraph as rewritten for B3-2–B3-9, because AC2 now cites its split-row list; all as they stand after the batch-3 disposition above on 2026-09-15. Context: `creator-ready-plan-review.md` batch 3, `02_Remediation_Plan.md` §3, the four phase headers, `respin-journey-fixes-audit.md`, Phase 0 T6 | evaluated (completed, read-only tools) | **NOT READY (Almost)** — Grade C; B3-1's named case closed and B3-2–B3-9 closed; 12 new: **2 Medium** (B4-1: the witness population is discovered, not listed, and AC2 checks "a" green witness where req 2 says "every" — a row can read `closed` by omitting its unrun Docker witness; B4-2: "none executable + current-code citation" can close environment- or owner-dependent obligations, rows (1)–(3), (7), (8), (15), (17)–(21)), 6 Low (B4-3 no state for a red witness; B4-4 no-suite label; B4-5 T2 must follow T6; B4-6 transcript locatability unverified; B4-7 umbrella Phase 4 rows omit (4)–(6); B4-8 some Phase 3 halves name lines Phase 2 writes), 4 Info; report appended to [`../progress/creator-ready-plan-review.md`](../progress/creator-ready-plan-review.md) |

**Gate state after batch 4: NOT READY (Almost).** The second owner-approved extension is consumed. **Convergence stop (gate-rules §5):** B4-1 and B4-2 are the second consecutive round of findings on the same invariant (`closed-means-witnessed` / `unknown-never-passed` — B3-1, then B4-1/B4-2), so editing of this text is paused rather than patched a third time; no batch-4 finding has been applied. Orchestrator diagnosis for the owner (not a reviewer verdict): the recurring defect is structural — an inspection-only phase that runs no Docker suite and has no intended-environment access is being asked to decide `closed`, which needs run evidence it cannot produce; the smallest change that removes the whole class is for Phase 0 never to record `closed` at all (states `open` / `recorded-claim (unverified)` / `unknown`, closure left to the receiving phase that can run the witness), which also dissolves B4-3–B4-6. Applying it needs the owner's decision and a further approved evaluation. **Phase 0 is not executed.**

Disposition of batch 2 (all 10 applied 2026-09-15): B2-1 precedence sentence and three split rows (F-02, F-05, F-17) in the translation paragraph, the service-quality master plan cited in Phase 0 req 2; B2-2 T6 row and step 2 to the glob wording; B2-3 AC2 "24" with row 24's provenance; B2-4 ledger row above; B2-5 `TEST_DATABASE_URL` pre-check before the gate; B2-6 card-name attribution corrected; B2-7 least-confident wording; B2-8 version probe commands named; B2-9 glob-listed population with vitest's skipped counts as corroboration; B2-10 five evidence states. **These fixes are unverified: the retry budget for this gate (batches 1 and 2) is exhausted.** The last verdict stands at NOT READY (Almost, one Medium) on the pre-fix text. Under gate-rules §3 a batch 3 — scoped to the translation paragraph and Phase 0 T2/AC2, as the reviewer recommends — needs the owner's explicit go-ahead; risk acceptance would preserve the failing verdict and cannot create Ready.

Disposition of batch 1 (all 13 applied 2026-09-15): B1-1 glob-defined NOT RUN population + register row 24 on the count drift; B1-2 migration head read two ways (`drizzle.__drizzle_migrations` count and the migrations file count); B1-3 three non-phase translation rules; B1-4 absent-file case; B1-5 phase numbers 7/4–7/1–7; B1-6 10a card and `todos.md` cited; B1-7/B1-12 wording; B1-8 card filename per convention; B1-9 `PLATFORM_OPTIONS` 35-39; B1-10 prompt-count note; B1-11 Phase 4 depends on 0, 1; B1-13 ledger row. The three Mediums change what Phase 0 records (§9 row 4), so retry batch 2 — the last — is reserved.

Disposition of batch 0 (all 20 applied 2026-09-15): F3 → new Phase 4 for the non-money closures, later phases renumbered 5–7, ledger row and translation table added; F1/F2/F4/F5 → Phase 0 methods fixed (SELECT-first config read with an owner-run fallback, no dev server or worker in Phase 0, loud-skip entry-gate shape with the two Docker suites NOT RUN, key-only env read); F6/F7/F8 → handoff re-check, transcript/card/ledger paths, technical bullet exception; F9/F10/F11 → Phase 3 dependencies and re-base note, Critical Paths row, the pointed Phase 1 header line; F12–F20 → enumerated register rows with a "cited at" column, named rollout queries, AC4/AC5 tightened, real card paths, inventory note, agent wording, T2-rule note. F1–F4 change what Phase 0 does, so retry batch 1 is reserved; batch 2 remains unreserved. Phases 1–3 keep their own logs in their own master plans; nothing here re-reserves or re-counts them.

## Exit Demonstration

Per phase, the pack's Definition of Done plus the owner's completion definition: a reproducible candidate with executed risk-matched tests; independent review of consequential money/data/recovery changes; accepted intended-environment journeys; truthful supported-input and charge disclosures; demonstrated deletion/restore and rollback; every unexecuted check marked NOT RUN; implementation, local verification, real-service acceptance, deployment and customer evidence reported as separate claims.
