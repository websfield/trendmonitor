# Plan review — creator-ready (umbrella + Phase 0)

Written by the generalist `plan-reviewer` (batch 0, sole reviewer — Phase 0 touches no Critical Path, gate-rules §1), 2026-09-15, recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)`: one reviewer run, session model, "think hard".

**Readiness: Not yet · Grade: D · The umbrella and Phase 0 are careful and mostly executable, but one owner ticket half has no receiving phase, Phase 0's config comparison (T3) rests on a precondition the plan never establishes, and two allowed actions (starting the worker, `cat .env.local`) would write to the dev database or leak secrets in a phase whose whole promise is "inspection only" — all closable in one author pass.**

Counts: 20 findings — 1 High, 6 Medium, 10 Low, 3 Info.

Scope: `docs/plans/creator-ready-master-plan.md` (umbrella) and `docs/plans/creator-ready-phase-0.md` (Phase 0), checked against `docs/creator-ready/brief.md`, `docs/creator-ready/02_Remediation_Plan.md`, `CLAUDE.md`, `.claude/gate-rules.md` §1/§11, and the repo at `3273f36`. Phases 1–3's own plan files were read for headers, Depends-on lines and Critical-Path selections only; their gates are separate and untouched.

## Execution simulation (Phase 0 as `respin-engineer`, plan text only)

- PASS with gaps — **T1 baseline manifest.** `git rev-parse HEAD`, `git status --short`, version probes and the lockfile hash are all executable read-only. Three gaps: (a) the `.env.local` "key names only" read has no sanctioned method — `Read(**/.env.*)` is denied in `.claude/settings.json` and the allowed `cat` would print values into the transcript (F5); (b) "the rollout-state `SELECT`s" are not named and the requirement pre-states their value as `expanded` (F13); (c) the migration/config/rollout reads are the least-confident item and correctly degrade to **blocked**.
- PASS with gaps — **T2 obligation register.** Sources exist (`respin-finish-master-plan.md` progress table; cards for 8c/9a/9b/10a; `respin-finish-open-items.md`; `respin-journey-fixes-audit.md` F-01–F-21). Row population is under-specified (§3 has five areas, each with several obligations) and the audit's dispositions use journey-fixes phase numbers with no translation to creator-ready numbering (F12); the "10b-1 card" does not exist as a card (F15).
- FAIL — **T3 configuration/offer comparison.** "Read via `/admin/config` as the allow-listed admin" requires a running dev server, an account whose id is in `ADMIN_USER_IDS`, and a login — which writes session rows, contradicting the technical checklist's "no database row is written". The only zero-write path is the `config_versions` `SELECT` that the Least-confident line says may be denied, and the Edge Cases table maps a denial only to T1. An implementer holding only the plan text cannot complete T3 without choosing a method the plan forbids or one it admits may be refused (F1).
- PASS — **T4 reference matrix.** `trend-source.ts`, `sources.ts`, `autopsy.ts` exist; the owner's §6 two options are named; AC4 is concrete. Minor: the paste-panel file is unnamed and the evidence cell does not require verified-vs-unrun (F17).
- PASS — **T5 estimate.** Four categories and the superseded 13–21 figure are unambiguous; ordering ("last deliverable") is only an Edge-Cases row, not an AC (F14).
- PASS with gaps — **T6 entry gate.** All seven scripts exist in `respin/package.json:26-44`. The plan does not say which shape runs (with or without `TEST_DATABASE_URL`); the live shape writes test rows into the same `respin` database the manifest reads (F4). Not a code change in disguise.
- Not a task, but allowed by the text: "the dev server and worker are started only if a read requires them" — no read requires the worker, and starting it runs retention/deletion sweeps and the external-command executor against the dev DB (F2). This is the one place Phase 0 could stop being inspection.

## Pre-mortem — "Phase 0 misled a later phase"

| Likely cause | Absorbed? | Where / fix |
|---|---|---|
| A register citation was stale when written | Yes | Verification step 4 (Read in-session), AC2 |
| An unprovable obligation marked closed | Yes | AC2 citation rule, `unknown-never-passed` |
| Estimate written before the register | Partly | Edge Cases row → T5; no AC checks ordering (F14) |
| Phase 0 edited product code | Yes | AC7 `git status`, `t0-inspection-only` |
| Phase 0 wrote to the dev database (login session rows, worker sweeps, live-shape tests) | **No** | AC7 cannot see DB writes; F1, F2, F4 |
| Entry gate reported green on the loud-skip shape and read as the CI shape | **No** | T6 names no shape (F4); Lesson 2026-08-02 is pinned but unenforced |
| Secret values in the transcript from reading `.env.local` | **No** | AC1 checks the manifest, not the method (F5) |
| Manifest read a different database than intended | Yes | Edge Cases row 2 → T1 |
| Phase 1 starts on a manifest whose tree has moved (workflow-hardening commits in parallel) | **No** | Handoff says "manifest exists", not "still matches" (F6) |
| Register's receiving-phase column points at journey-fixes phase numbers | **No** | No translation table (F12) |
| Rollout state copied from the plan's own `expanded` when the SELECT is blocked | **No** | Requirement pre-states the value (F13) |
| Reference matrix cites the YouTube adapter as working when T-15 live evidence was never run | Partly | "evidence date" column exists; AC4 does not require verified-vs-unrun (F17) |
| Non-money release closures recorded "open" with no phase to close them | **No** | Umbrella homing gap (F3) |

## Findings

| # | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| F1 | Medium | High | Phase 0 §Implementation Tasks T3; §Requirements Checklist (technical) b1; §Edge Cases | T3's named method (config editor as allow-listed admin) needs a dev server, an `ADMIN_USER_IDS` identity (`respin/app/(admin)/layout.tsx:1-5`) and a login that writes session rows — contradicting "no database row is written". The zero-write path is the `config_versions` SELECT the plan already fears may be denied, and the denial disposition is mapped to T1 only. | Make `select content from config_versions order by version desc limit 1` the primary T3 method; add T3 to the classifier-denial row with an AC3 "blocked" variant (owner runs the query and pastes); either drop the UI route or record the session-row write it entails as accepted. |
| F2 | Medium | High | Phase 0 §Requirements Checklist (technical) b1 | "worker started only if a read requires it" — no Phase 0 read does; a started worker runs retention/deletion sweeps and the external-command executor against the dev DB. AC7 cannot detect it. | Forbid starting the worker in Phase 0. If the dev server is started, name the read that requires it and record rows it creates. |
| F3 | **High** | High | Umbrella §Requirements row "T0 release closures → T7"; §Phase Plans; §Deferral Ledger | The non-money closures (admission enforcement, deletion-journal/restore drill, telemetry/support) are homed as "Phase 0's register" (records only) plus "Phase 3 (parked money half)". No implementing phase receives them; no ledger row; Phase 6's T7-A requires them witnessed. The owner's sequence item 2 is half-unhomed. | Name a receiving phase (extend Phase 6 or add an unplanned phase with its owner dependency) and add a Deferral Ledger row "non-money release closures — from Phase 0 register → Phase N". |
| F4 | Medium | High | Phase 0 §Verification step 2; T6; AC6 | Entry-gate line omits `TEST_DATABASE_URL`; CLAUDE.md says that is the CI shape and the two Docker suites loud-skip without it. The live shape writes test rows into the `respin` DB the manifest reads. | State the shape T6 runs; if loud-skip, record the two Docker suites NOT RUN; if live, say it writes and sequence it after T1's reads. |
| F5 | Medium | High | Phase 0 T1 "`.env.local` key names only" | `Read(**/.env.*)` denied (`settings.json`); `Bash(cat:*)` allowed but prints values into the transcript (golden rule 2). No key-only method named. | Name a key-only command (e.g. `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' respin/.env.local`), accept the prompt once or record blocked/absent. |
| F6 | Medium | Medium | Phase 0 §Handoff Contracts b2; Umbrella §Phase Plans Phase 1 | Manifest is a snapshot; workflow-hardening runs in parallel and will change/commit the uncommitted set. Phase 1's start gate is "manifest exists", not "still matches the tree". | Phase 1's first step re-runs Verification step 1 and records the diff against the manifest; manifest carries HEAD + timestamp. |
| F7 | Medium | High | Phase 0 §Files to Create / Modify vs AC1, AC7, §Completion Criteria | Transcripts ("step 1 transcript", "transcript"), the report card and the ledger line have no path and are absent from the Files table; CLAUDE.md Conventions require gate transcripts under `docs/progress/<feature>/`, one card, one ledger line. | Add rows (e.g. `docs/progress/creator-ready/entry-gate-phase-0.txt`, the card, the ledger file) and point AC1/AC6/AC7 at them. |
| F8 | Low | High | Phase 0 §Requirements Checklist (technical) b1 vs Files table / AC7 | "No file outside `docs/progress/creator-ready/` is created or modified" contradicts the listed master-plan modification. | Add the master-plan exception to the bullet. |
| F9 | Low | High | Umbrella §Phase Plans Phase 3; `respin-journey-fixes-phase-3.md:3` | Pointed file's "Depends on: 1, 2" is journey-fixes numbering (its Phase 2 is now creator-ready Phase 1); its F-18–F-21 rows overlap creator-ready Phase 2's Free-path scope. Umbrella Depends-on "0; owner un-parks" omits 1–2. | Phase 3 depends on 0, 1, 2; note that on un-park the journey-fixes phase-3 tasks are re-based on Phase 2's outcome (paid chapters only). |
| F10 | Low | Medium | Umbrella §Critical Paths row 3 | "Brain tenancy: Yes" for Phase 3, but journey-fixes master names tenancy only for its Phase 2 T3 (moved to creator-ready Phase 1). Over-selection is harmless but the table claims to mirror the phase plans. | Match the pointed plans, or say which Phase 3 task makes tenancy apply. |
| F11 | Low | High | `respin-service-quality-phase-1.md:3` (pointed by umbrella Phase 1) | Header says "Depends on: none"; line 4 and the umbrella say Phase 0. An implementer reading line 3 starts without the manifest. | Line 3 → "Depends on: creator-ready Phase 0" (reading-only fix, §9 row 4). |
| F12 | Low | High | Phase 0 T2; AC2; Umbrella §Decisions | Register row population ("one row per obligation §3 names") is a producer, not a list (Respin rule 7); the audit's F-id dispositions use journey-fixes phase numbers with no translation to creator-ready numbering. | Enumerate the obligation rows in the plan; add a phase-number translation table (journey-fixes 1→CR 3, 2→CR 1, 3 Free parts→CR 2) to the umbrella. |
| F13 | Low | High | Phase 0 T1; §Verification step 3; Requirements b1 | "the rollout-state SELECTs" unnamed; tables are `auto_topup_protocol_rollouts` and `tier_checkout_protocol_rollouts`, keyed by `protocol` so possibly >1 row; the requirement pre-states `expanded`. | Name both queries (`select protocol, state, revision from …`), record every row, delete the pre-stated value. |
| F14 | Low | Medium | Phase 0 T5; AC5; §Edge Cases row 5 | "Estimate is the last deliverable" and "uncertainty stated" are not checked by AC5. | AC5 adds: cites the register's final state (row count/date); uncertainty as a range with named unknowns. |
| F15 | Low | High | Phase 0 T2 citations | "the 8c/9a/9b/10a/10b-1 cards" — 10b-1 has no report card; its progress row labels `respin-finish-phase-10b-1.md` as "Card". | Cite actual paths. |
| F16 | Low | High | Phase 0 "Facts fixed on 2026-09-15" | Uncommitted inventory omits `.agents/skills/doctor/SKILL.md` (modified per git status). Harmless (T1 re-inventories) but the list is presented as verified. | Add it or mark the list non-exhaustive. |
| F17 | Low | Medium | Phase 0 T4; AC4 | Evidence cell should distinguish present-and-verified from present-and-unrun (T-15 live YouTube unrun, respin-finish row 8); the paste panel file is unnamed; `studio/run-copy.ts:36-37` lists "TikTok"/"Instagram Reels" as script targets, which the matrix should label as targeting, not ingestion, so T8 reads it correctly. | AC4 adds the verified/unrun cell; T4 names the paste-panel path and the run-copy note. |
| F18 | Info | High | Phase 0 §Agents | `respin-engineer` is called "read-only" but writes five documents; its agent file's stack section is stale (Vercel/Neon/Clerk/Inngest — WF-03). | Say "writes only under `docs/progress/creator-ready/`"; pin that the manifest reads the stack from the tree, not the agent file. |
| F19 | Info | Medium | Umbrella §Requirements row T1→T2 | Owner §1: "T2 prompt changes require T1 baseline evidence"; Phase 1's voice-build assembly fix precedes Phase 4's T1 baseline. It is not a prompt change, but the row does not say so. | Add "not a prompt change; the T2 ordering rule does not bind it". |
| F20 | Info | Medium | Phase 0 T2 / AC2 | Register rows carry no citation date/HEAD; a later "re-checked against P1" pass cannot tell what the citation was read against. | Add a "cited at HEAD/date" column. |

## Mechanical consistency

- Coverage parity: umbrella ticket map — T0, T1, T2, T3, T3-REF, T6-C, T6-P, T7-A (split with ledger row), T7-B/C, T8 each homed once; **T0 release closures, non-money half: no implementing home (F3)**. Phase 0 register population not enumerated (F12).
- Closure: Files table ↔ tasks consistent for the five docs and the master-plan row; **transcripts, card, ledger line missing (F7)**; technical bullet 1 contradicts the master-plan row (F8). Owner `respin-engineer` and reviewer `plan-reviewer` exist in `.claude/agents/`. AC1–AC7 each carry a concrete evidence pointer (AC1/AC7's "transcript" unpathed). Requirement IDs reconcile: Phase 0 header T0 ↔ umbrella; service-quality phase-1/2 headers carry T2/T3 and T7-A ↔ umbrella; journey-fixes phase files carry no T-labels (parked; Info). Least confident: present and non-empty. Reachability: present, names no in-phase caller, has its Deferral Ledger row (Phase 0 → Phase 1).
- Deferral ledger: all "later" promises resolve except the non-money closures (F3). "Enabling the nightly schedule trigger → owner" is a named owner, acceptable.
- Depends-on: umbrella lines name only lower-numbered phases; Phase 3's line omits 1–2 that its pointed file requires (F9); pointed Phase 1 file's own line says "none" (F11).
- Critical Paths table vs pointed plans: Phase 1 and 2 rows agree with `respin-service-quality-master-plan.md`; Phase 3 tenancy over-claims (F10); Phase 0 "generalist only" agrees with gate-rules §1.
- Handoff contracts: five artefacts named; the register's column set is described in prose, not pinned as a table header (Low, folded into F12).
- Verifiability: every AC is PASS/FAIL.
- Number provenance: 13–21 days cited (remediation plan §10); migration 62 and config v17 corroborated; recurring cost row present ("none new").
- Invariant slugs: `t0-inspection-only`, `unknown-never-passed`, `green-only-if-run` — present, unique, new.
- Factual claims: HEAD `3273f36` — true; adapters exactly `youtube`/`submitted` — true; P0/P1/P2/P3/P5/L1 absent — true; `landing-pricing.test.ts` pins pricing copy to `CONFIG_V1_SEED` — true; `respin-finish-open-items.md` exists — true; workflow-hardening READY/A, blocked on `.git/index.lock` — true.
- Gate-rules §11: Phase 0's Files table has 6 rows — no size signal. The umbrella is faithfully simulable at its size; its pointed Phase 1/2 plans carry their own recorded size signals in their own logs.

## Least-confident probe

"The permission classifier may deny the read-only SELECTs." If it does: T1 completes honestly — migration head, config version and rollout rows become **blocked** cells with the commands named, and the owner is asked to run them. But the blast radius is understated: **T3 has no independent source for the active config** (v17 lives only in `config_versions`; `CONFIG_V1_SEED` is the seed, not the active version), so a denial empties an entire deliverable, AC3 cannot pass, and the plan's only other route (admin UI) contradicts its own no-write rule (F1). Honest completion is possible for T1; T3 needs the blocked disposition and an owner-run fallback written into the plan.

## Ordered fix list

1. F3 — home the non-money release closures with a receiving phase and a Deferral Ledger row (umbrella).
2. F1 — make the `config_versions` SELECT T3's primary method; extend the denial row and AC3 to T3; drop or explicitly accept the UI route's session write.
3. F2 — forbid starting the worker in Phase 0.
4. F4 — name T6's shape and reconcile the live shape's DB writes with the no-write rule.
5. F5 — name the key-only `.env.local` method (or blocked/absent).
6. F7 + F8 — add transcript/card/ledger paths to the Files table; fix technical bullet 1.
7. F6 — Phase 1 start re-runs step 1 against the manifest.
8. F9 + F11 + F12 — Phase 3 Depends-on and re-base note; pointed Phase 1 header line; phase-number translation table and enumerated register rows.
9. F13, F14, F15, F17 — name the rollout queries and drop the pre-stated value; AC5 ordering/uncertainty; real card paths; AC4 verified-vs-unrun and paste-panel path.
10. F10, F16, F18, F19, F20 — wording and table corrections.

## Verdict

**NOT READY** — one owner ticket half has no receiving phase, and Phase 0's T3 cannot be executed from the plan text without an action the plan itself forbids or admits may be refused; every fix is a text edit and none changes the five artefacts Phase 0 produces, so one author pass should reach Ready.

---

## Orchestrator addendum (2026-09-15, after the report)

All 20 findings were applied to the umbrella and Phase 0 on the same day. F3 was a decision: the non-money release closures (admission enforcement, deletion-journal/restore drill, telemetry/support) receive a new Phase 4 with its owner dependencies, and the former Phases 4–6 shift to 5–7. Because F1–F4 change what Phase 0 will do (methods, forbidden actions, gate shape), a retry batch 1 of this same generalist gate was reserved and run on the revised text; its report follows.

---

# Plan review — creator-ready (umbrella + Phase 0) — retry batch 1

Written by the generalist `plan-reviewer` (batch 1, sole reviewer — Phase 0 touches no Critical Path, gate-rules §1), 2026-09-15, recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)`: one reviewer run, session model, "think hard". Read-only tools only; no shell commands run.

**Readiness: Almost · Grade: C · All 20 batch-0 findings are genuinely closed in the text, and Phase 0 is now executable end-to-end without writing anything — but three record-accuracy gaps remain (the entry gate's skipped-suite population is "two" when the tree has 23, the migration-head cell has no named read, and the register's translation table has no rule for four of the 21 audit rows), each a one-line edit that changes what Phase 0 records, not what it produces.**

Counts: 13 new findings — 0 High, 3 Medium, 3 Low, 7 Info. Batch-0: 20 of 20 verified resolved.

## Batch history

| Batch | Date | Verdict | Grade | Findings | Disposition |
|---|---|---|---|---|---|
| 0 | 2026-09-15 | NOT READY | D | 20 (1 High, 6 Med, 10 Low, 3 Info) | all 20 applied same day; Phase 4 added, phases renumbered to 7 |
| 1 (this) | 2026-09-15 | NOT READY (Almost) | C | 13 new (0 High, 3 Med, 3 Low, 7 Info); 20/20 batch-0 resolved | batch 2 remains unreserved at the time of this report; §9 row 4 classification per finding below |

## Batch-0 findings — resolution check

All 20 verified resolved in the revised text (F1 T3 SELECT-first method with blocked variant; F2 no dev server or worker; F3 Phase 4 with ledger row; F4 loud-skip gate shape sequenced after T1; F5 key-only env grep; F6 Phase 1 re-check against the manifest; F7/F8 transcript, card and ledger paths and the technical-bullet exception; F9 Phase 3 depends on 0, 1, 2 with the re-base note; F10 Phase 3 tenancy row; F11 pointed Phase 1 header; F12 23 enumerated obligation rows walked 1:1 against the owner's §3 table, 21 F-id rows, translation table; F13 both rollout queries with `protocol, state, revision`, no pre-stated value; F14 AC5 ordering and range; F15 real card paths; F16 inventory note; F17 verified/unrun cell, paste-panel path, `PLATFORM_OPTIONS` note; F18 agent wording; F19 T2-rule note; F20 "cited at" column).

## Execution simulation

T1 PASS with one gap (migration head has no named read — B1-2); T2 PASS with one gap (four audit rows have no translation rule — B1-3); T3 PASS (one query, one blocked variant, seed pin exists, `stripePriceMap` is the real key); T4 PASS; T5 PASS; T6 PASS with one gap (the NOT RUN population: the tree has 23 `*.docker.test.ts` suites, every one loud-skipping without `TEST_DATABASE_URL`; the text names "the two" — B1-1); T7 PASS.

## Pre-mortem

Absorbed: database writes (none possible in the loud-skip shape; verified no test/build path reaches `DATABASE_URL` without the app server); secrets in the transcript; stale manifest; pre-stated rollout state; classifier denial of T3; YouTube cited as working; estimate before register; non-money closures. Not absorbed: the NOT RUN population off by 21 suites (B1-1); `.env.local` absent rather than refused (B1-4); migration head derived differently by Phase 1 (B1-2); four audit rows unroutable (B1-3); Phase 4 and Phase 1 both editing `app/(auth)/auth-form.tsx` (B1-11, for Phase 4's own plan).

## Findings

| # | Sev | Location | Finding | Fix |
|---|---|---|---|---|
| B1-1 | Medium | Phase 0 req 6; T6; Verification 2; AC6 | "the two Docker concurrency suites" — the tree has 23 `*.docker.test.ts` suites; CLAUDE.md says two, `docker-compose.yml:15` nine, the finish master plan twelve. | Population = the glob, listed by name; AC6 checks the list against it; register row for the drift. |
| B1-2 | Medium | Phase 0 req 1; Verification 3; Least confident | No command reads the migration head; "62" has no derivation; the owner would be handed four queries that cannot produce it. | Add `select count(*), max(created_at) from drizzle.__drizzle_migrations` and the migrations file count; "five queries". |
| B1-3 | Medium | Umbrella translation table; Phase 0 req 2; AC2 | F-06 (operator note), F-15/F-16 (covered by 10b-2) and F-17's CI half have no translation value. | Three rules: operator note; outside programme; CI job → Phase 3 (or 2, stated). |
| B1-4 | Low | Phase 0 req 1 | `.env.local` may be absent (gitignored); `env.example` is the template. | Absent cell; template recorded separately. |
| B1-5 | Low | Umbrella Dependencies, Risk; Phase 0 Handoff | Three pre-renumber phase references (6 → 7; 4–6 → 4–7; 1–6 → 1–7). | Renumber. |
| B1-6 | Low | Phase 0 req 2 citations | 10a card and root `todos.md` omitted though the owner's §2 names them. | Cite both. |
| B1-7 | Info | Phase 0 Agents; technical bullet | Ledger line's home ambiguous. | State it lives in `docs/progress/creator-ready/ledger.md`. |
| B1-8 | Info | Phase 0 Files row 7 | `0-report.md` matches no convention. | `creator-ready-phase-0-card.md`. |
| B1-9 | Info | Phase 0 req 4 | `PLATFORM_OPTIONS` spans 35-39 and includes "YouTube Shorts". | Cite 35-39. |
| B1-10 | Info | Phase 0 technical bullet 2; Verification 1–3 | Every T1/T6 command will prompt (~12); an unattended run degrades to mostly-blocked. | One sentence. |
| B1-11 | Info | Umbrella Phase 4 | Depends on 0 only, but shares `auth-form.tsx` with Phase 1. | Depend on 1 or state merge order. |
| B1-12 | Info | Phase 0 technical bullet 1 | `next build`/`tsc` create gitignored outputs. | "no tracked file". |
| B1-13 | Info | Umbrella ledger row 3 | Omits "autopsy scrub residual" that the Requirements row includes. | Add it. |

## Mechanical consistency

Parity: 23 obligation rows 1:1 with the owner's §3; 21 F-id rows 1:1 with the audit; ticket map homed once each; NOT RUN set fails parity (B1-1); translation rules incomplete (B1-3). Closure: 9 Files rows ↔ T1–T7 both ways; owners and reviewer exist; AC1–AC7 have evidence pointers; Least confident and Reachability present with the ledger row. Deferral ledger closes (one scope omission, B1-13). Depends-on: lower-numbered only; pointed headers fixed; stale prose refs (B1-5). Number provenance: 13–21 days cited; config v17 derivable; migration 62 not derivable from the text (B1-2). Invariant slugs unique and unchanged. §11: 9 rows, no size signal; both documents faithfully simulable.

## Least-confident probe

If `docker exec` is denied, T1's DB cells and T3 become blocked with the queries named and the owner runs them — honest completion — but the four queries handed over cannot produce the migration head (B1-2), and a denial will likely come with denials of `pnpm`, `grep` and `node` under the same allow list (B1-10), so the realistic degraded shape is "manifest mostly blocked, entry gate NOT RUN", which the text permits and marks honestly once B1-2 is fixed.

## Verdict

**NOT READY** (Almost) — Phase 0 is executable from the text without a single write and every batch-0 finding is closed; three Medium record-accuracy edits remain (B1-1, B1-2, B1-3) plus wording, and under gate-rules §1 an unresolved Medium keeps the gate at Not yet.

---

## Orchestrator addendum (after batch 1)

All 13 batch-1 findings were applied on 2026-09-15. Because the three Mediums change what Phase 0 records, retry batch 2 (the last) was reserved and run; its report follows.

---

# Plan review — creator-ready (umbrella + Phase 0) — retry batch 2

Written by the generalist `plan-reviewer` (batch 2, the last permitted retry, sole reviewer), 2026-09-15, recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)`: one reviewer run, session model, "think hard". Read-only tools only; no file edited.

**Readiness: Almost · Grade: C · All 13 batch-1 findings are applied and Phase 0 is executable end-to-end from the text without a single write — but the umbrella's translation table, applied as written, routes the programme's headline defect (F-02, the voice-build parse failure) and F-05 to the parked money phase, while the umbrella's own Requirements row and the pointed Phase 1 plan carry them in Phase 1; the register is the programme's routing table, so that one missing precedence sentence is a Medium and keeps the gate at Not yet.**

Counts: 10 new findings — 0 High, 1 Medium, 4 Low, 5 Info. Batch-1: 13 of 13 applied; 11 fully closed, 2 closed with residuals (B1-1's stale phrase survived in two summary lines; B1-8's filename carried an invented attribution).

## Batch history

| Batch | Date | Verdict | Grade | Findings | Disposition |
|---|---|---|---|---|---|
| 0 | 2026-09-15 | NOT READY | D | 20 (1 High, 6 Med, 10 Low, 3 Info) | all applied; Phase 4 added, phases renumbered to 7 |
| 1 | 2026-09-15 | NOT READY (Almost) | C | 13 new; 20/20 batch-0 resolved | all applied; batch 2 reserved |
| 2 (last) | 2026-09-15 | NOT READY (Almost) | C | 10 new (0 High, 1 Med, 4 Low, 5 Info); 13/13 batch-1 applied | retry budget exhausted (gate-rules §3); one Medium residual (B2-1); next action in the Verdict |

## Batch-1 resolution check

All 13 verified in the text and, where a fact was claimed, against the tree: B1-1 closed in the governing lines (the glob population, 23 files matching a fresh Glob with the 14/7/1/1 split; register row 24's three sources each verified) with the stale "two" surviving in the T6 row and step 2 (B2-2); B1-2 closed (five queries plus the file count; `drizzle.__drizzle_migrations` is real; 62 derivable); B1-3 closed (three non-phase rules resolve F-06, F-15/F-16, F-17's CI half); B1-4 to B1-13 closed, with B1-8's filename attribution invented (B2-6).

## Execution simulation

T1 PASS (every cell has a named read-only command; Playwright/Stripe probes unnamed — B2-8); T2 PASS with one gap (the translation table sends F-02 and F-05 to Phase 3 while the service-quality plan's defining set and Phase 1 build them — B2-1); T3 PASS; T4 PASS; T5 PASS; T6 PASS with two gaps ("the two" residual — B2-2; no pre-check that `TEST_DATABASE_URL` is unset in the shell, which alone decides the loud-skip shape — B2-5); T7 PASS (three of five evidence states — B2-10; filename attribution — B2-6).

## Pre-mortem

Absorbed: stale citations; unprovable obligations; estimate ordering; product edits; database writes (no server, no worker, loud-skip shape) except the shell-profile seam (B2-5); secrets; stale manifest; pre-stated rollout state; classifier denial; YouTube evidence; non-money closures. Not absorbed: F-02/F-05 mis-routed to the parked phase (B2-1); the count drift with no ledger row (B2-4); a version probe that may fetch (B2-8).

## Findings

| # | Sev | Location | Finding | Fix | §9 |
|---|---|---|---|---|---|
| B2-1 | Medium | Umbrella translation paragraph; Phase 0 req 2, AC2; Handoff | The rule "journey-fixes Phase 1 → creator-ready Phase 3" routes F-02 and F-05 to the parked phase, but `respin-service-quality-master-plan.md`'s defining set claims their service halves and Phase 1 implements them; two rules, two answers, no precedence; F-18–F-21's "Free-path parts" is a judgement, not a value. | Precedence sentence: the service-quality defining set wins → Phase 1/2; the remainder → Phase 3; F-02, F-05, F-17 as split rows; cite that file in req 2. | records |
| B2-2 | Low | Phase 0 T6; Verification 2 | "the two Docker suites" survived in the task row and the step. | Glob wording in both. | reads |
| B2-3 | Low | Phase 0 AC2; req 2 | AC2 said 23 rows; req 2 enumerates 24; row 24's provenance mislabelled as the owner's §3. | AC2 "24 (23 + row 24)"; req 2 provenance clause. | records |
| B2-4 | Low | Phase 0 row 24; Umbrella ledger | Row 24's receiver is a later promise with no ledger row or Non-goal. | Ledger row; Non-goal until assigned. | reads |
| B2-5 | Low | Phase 0 Verification 2; AC6 | The loud-skip shape depends solely on the shell env; an exported `TEST_DATABASE_URL` would run all 23 suites live before AC6 could notice. | Recorded pre-check that the variable is unset; stop if set. | records |
| B2-6 | Info | Phase 0 T7; Files | "the repo's `<feature>-phase-N-card.md` convention" — no such file exists; cards are `-slice-N-card.md`. | Correct the attribution. | reads |
| B2-7 | Info | Phase 0 Least confident | The migration head's tree half survives a `docker exec` denial. | Wording. | reads |
| B2-8 | Info | Phase 0 req 1 | Playwright and Stripe CLI probes unnamed; `npx` may fetch. | Name `pnpm exec playwright --version` and `stripe --version`. | reads |
| B2-9 | Info | Phase 0 req 6 / AC6 | The loud-skip warning may not reach the transcript under the vitest config; the glob is the population, skipped counts corroborate. | Say so. | reads |
| B2-10 | Info | Phase 0 Completion Criteria | Three of the owner's five evidence states listed. | Add deployed and customer-observed. | records |

## Mechanical consistency

Parity: 23 obligation rows walked 1:1 against the owner's §3 (admission 1–6, deletion 7–11, billing 12–14, telemetry/support 15–21, truth 22–23); row 24 is drift, labelled; F-01…F-21 present with a rule each, the rule's output disagreeing with the umbrella for F-02/F-05 (B2-1); NOT RUN population equals the glob. Closure: 9 Files rows ↔ T1–T7; agents exist (`respin-engineer` has Bash, so `docker exec` is within its grant; its stack section is stale as the plan says); AC1–AC7 pointed; Least confident and Reachability present with the ledger row. Deferral ledger: rows resolve; row 24 lacked one (B2-4). Depends-on: lower-numbered only across 0–7; pointed headers fixed. Number provenance: every number cited or derivable. Invariant slugs unchanged. §11: 9 rows; simulable.

## Least-confident probe

Under a `docker exec` denial: T1's database cells and T3 become blocked with the queries named and the owner runs them; the migration head's tree half still lands; T2/T4/T5 are unaffected; T6's `pnpm` commands prompt and a refusal is NOT RUN; T7 writes documents. The degraded shape — manifest mostly blocked, gate NOT RUN, T3 owner-run — is honest and complete as written.

## Verdict

**NOT READY** (Almost) — Phase 0 is executable from the text without a single write, every batch-1 finding is applied, and the mechanical audit closes except for one Medium: the translation table mis-routes F-02 and F-05 to the parked phase while the umbrella and the pointed Phase 1 plan build them in Phase 1, and the register is the routing table every later phase reads. The retry budget for this gate is exhausted: the recommended next action is to apply fix 1, record the residual in the Plan Review Log, and ask the owner whether to approve a batch-3 evaluation scoped to the translation paragraph and T2/AC2 — risk acceptance would preserve this failing verdict and cannot create Ready.

---

## Orchestrator addendum (after batch 2)

All 10 batch-2 findings were applied on 2026-09-15, including the precedence sentence and the three split rows. **These edits are unverified: the gate's retry budget is exhausted.** The gate stands at NOT READY (Almost) on the pre-fix text with one Medium; a batch 3 scoped to the translation paragraph and Phase 0 T2/AC2 needs the owner's explicit go-ahead.

---

*Retry batch 3 — owner-approved extension (2026-09-15, owner's words in the `/go` session), scoped to the umbrella's translation paragraph and Phase 0 req 2 / AC2. Generalist `plan-reviewer`, sole slot; dispatch: model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Recorded verbatim by the orchestrator below; the tool's trailing "Ask /go…" footer is omitted.*

# Plan review — creator-ready (umbrella + Phase 0) — retry batch 3

**Readiness: Almost · Grade: C · B2-1's mis-route is closed — all 21 F-ids now reach the phase that builds them — but the register can still record a release obligation "closed" on a historical record whose witness this phase records as NOT RUN (one Medium), and the fix introduced/left five Low record-accuracy gaps in the translation text.**

Reviewer: generalist `plan-reviewer`, batch 3 (owner-approved extension), sole slot. `plan gate ran lean (consolidated)`. Read-only; no file edited. Scope: umbrella "Phase-number translation" paragraph (`creator-ready-master-plan.md:29`), Phase 0 functional req 2 (`creator-ready-phase-0.md:36`) and AC2 (`:121`). The scoped text is small enough to simulate completely (gate canon §11 — coverage is complete).

## B2-1 resolution check

- **Closed in substance.** A precedence sentence now exists; it quotes `respin-service-quality-master-plan.md:14`'s defining set accurately (one paraphrase: "UI half" for the source's "UI only"). F-02 and F-05 now route their service/UI half to Phase 1, matching where `respin-service-quality-phase-1.md` actually builds them (T1 for F-02 `:4`/`:40`; T8 for F-05 `:48`/`:112`). Phase 0 req 2 now cites the service-quality file. No F-id gets zero answers or (following the explicit sentences) a wrong phase.
- **Residuals, all Low, some introduced by the fix itself:** the F-05 Phase 3 half is labelled as work no plan contains (B3-2); "Free-path parts" was rephrased to "any paid-chapter remainder" but is still a judgement, not a value (B3-3); the F-17 split does not follow from the precedence rule it is presented as a consequence of (B3-4); the F-02 "re-ask" half has no task in either pointed Phase 3 plan (B3-5).

## Routing table (translation paragraph applied as written)

Audit "Phase N" = journey-fixes numbering (not stated in the paragraph; confirmed by every journey-fixes phase header's audit-row line, `respin-journey-fixes-phase-1.md:4`, `-phase-2.md:4`, `-phase-3.md:4`).

| F-id | Audit disposition | SQ defining set claims? | Resulting creator-ready phase | Where built | Check |
|---|---|---|---|---|---|
| F-01 | Phase 1 T1–T2 | no | **3** | JF-P1 `:39` | ✓ |
| F-02 | Phase 1 T3 | service half | **1** (assembly tolerance) **+ 3** (included-build consumption, re-ask) | P1: SQ-P1 T1 (tolerance + 16 kinds + refusal copy); P3: consumption JF-P1 `:40`; **re-ask: no JF task** | B3-5 |
| F-03 | Phase 2 T6 | yes | **1** | SQ-P1 T6 | ✓ |
| F-04 | Phase 2 T5 | yes | **1** | SQ-P1 T5 | ✓ |
| F-05 | Phase 1 T5 | UI only | **1** (UI block) **+ 3** ("allowance semantics") | P1: SQ-P1 T8; P3: JF-P1 `:42` "on any plan a refused save states its typed reason" — **no plan changes allowance semantics** | B3-2 |
| F-06 | "Not in scope — operator note only" | no | `none — operator note` | — | ✓ |
| F-07 | Phase 2 T1 | yes | **1** | SQ-P1 T2 | ✓ |
| F-08 | Phase 2 T2 | yes | **1** | SQ-P1 T2 | ✓ |
| F-09 | Phase 2 T3 | yes | **1** | SQ-P1 T3 | ✓ |
| F-10 | Phase 2 T3 | yes | **1** | SQ-P1 T3 | ✓ |
| F-11 | Phase 2 T4 | yes | **1** | SQ-P1 T4 | ✓ |
| F-12 | Phase 1 T4 | no (excluded, SQ-master `:14`) | **3** | JF-P1 `:41` | ✓ |
| F-13 | Phase 2 T7 | yes | **1** | SQ-P1 T7 | ✓ |
| F-14 | Phase 2 T7 | yes | **1** | SQ-P1 T7 | ✓ |
| F-15 | "Covered by 10b-2" | no | `outside programme: respin-finish 10b-2` | 10b-2 | ✓ |
| F-16 | "Covered by 10b-2" | no | `outside programme: respin-finish 10b-2` | 10b-2 | ✓ |
| F-17 | Phase 1 (activation) · Phase 3 T4 (CI) | **no** | **2** (Free-path CI) **+ 3** (activation, paid CI) per the explicit sentence; the general clauses yield **3 only** | SQ-P2 T4 (workflow_dispatch job, no F-17 claim); JF-P1 `:39`; JF-P3 T4 | B3-4 |
| F-18 | Phase 3 T1 | Free-path parts | **2** + "any paid-chapter remainder" → **3** | SQ-P2 `:36`; remainder: JF-P3 T1's billing waits (`manage-plan`/`action-error`) | B3-3 |
| F-19 | Phase 3 T2 | Free-path parts | **2** (no substantive paid remainder) | SQ-P2 `:35` | ✓ |
| F-20 | Phase 3 T3 | Free-path parts | **2** + remainder → **3** | SQ-P2 `:37`; remainder: JF-P3 T3's pause/resume, pack purchase, cancel-via-portal chapters | B3-3 |
| F-21 | Phase 3 T5 | Free-path parts | **2** + remainder → **3** | SQ-P2 `:38`; remainder: JF-P3 T5's step-up password and activation prerequisite | B3-3 |

Count: 21 F-id rows; 6 rows can carry two phases (F-02, F-05, F-17, F-18, F-20, F-21) where the paragraph and AC2 name 3; 3 non-phase dispositions (F-06, F-15, F-16). Every unclaimed phase-disposition row (F-01, F-12, F-17's non-Free half) lands in Phase 3, so req 2's shorthand "remainder → Phase 3" holds except for F-17's Free-path CI.

## Findings

| ID | Severity | Confidence | File + section | Finding | Fix | Changes what is built / records |
|---|---|---|---|---|---|---|
| B3-1 | **Medium** | medium | Phase 0 req 2 (`:36`); AC2 (`:121`); Risk coverage (`:130`) | **"Closed" is not bound to present-and-verified evidence.** AC2 is the only check on `unknown-never-passed` ("an unprovable obligation … marked closed"). Its cited sources are cards and progress tables — historical claims. Rows 7, 8, 10, 11 (deletion journal, restore, erasure) are witnessed by `deletion-executor.docker.test.ts` / `deletion-recovery-concurrency.docker.test.ts`, which T6 records NOT RUN; nothing stops a row reading "closed" on a card citation while the phase's own gate transcript shows its witness unrun — the phase's own pinned lesson (present-and-verified vs present-and-unrun) and the owner's "verify, then close" / "not passed" rules. Separately, AC2's "a repo citation and a cited-at HEAD/date **or** a named missing source" lets a *closed* row pass with only a missing source named. | Req 2 + AC2: "closed" requires a citation opened this phase; where that citation is only a historical record, or its witnessing suite is NOT RUN in T6, the state is `closed-by-record (witness unrun: <suite>)` or `unknown`, never plain closed; a named missing source implies `unknown`. | **changes what is built** (the register's state values) |
| B3-2 | Low | high | Umbrella `:29` F-05 split | The Phase 3 half of F-05 is labelled "allowance semantics" — no plan contains that work, and the umbrella's non-goals exclude allowance changes. What JF-P1 actually still owes for F-05 is "on any plan a refused save states its typed reason" (JF-P1 `:42`, T5, AC9) — the audit's "no reason, no remedy". The register would record a non-existent work item and omit a real creator-visible defect; routing (3) is right. | Relabel: "typed refusal reason on any plan → Phase 3 (JF-P1 T5)". | records |
| B3-3 | Low | high | Umbrella `:29`; req 2; AC2 | B2-1's second half persists: "any paid-chapter remainder" is unenumerated. Diffing the plans, the remainder is real for F-18, F-20, F-21 (listed in the table) and empty-ish for F-19; the paragraph ("So F-02, F-05 and F-17 are split rows") and AC2 name three split rows, so two implementers could record F-20 as "2" or "2 + 3" and both pass AC2 — AC2 cannot discriminate. | Enumerate the remainders (F-18 billing waits; F-20 pause/resume, packs, cancel; F-21 step-up and activation README lines → 3; F-19 none), state whether they are split rows, fix AC2's list. | records |
| B3-4 | Low | high | Umbrella `:29`; req 2 | The F-17 split is presented as a consequence ("So…") of the precedence rule, but the service-quality defining set (`:14`) and the SQ-P2 header (`:4`) do **not** claim F-17. Two clauses in the same paragraph route the whole CI half to Phase 3 — "(paid parts, and its T4 CI job) → Phase 3" and "the CI job half of F-17 → Phase 3" — and only the explicit sentence plus a parenthetical override them; "a row whose only disposition is…" also misdescribes F-17, which has two dispositions. The explicit sentence gives the right answer (SQ-P2 T4 builds the Free-path job), so no mis-route follows. | Cite SQ-P2 T4 as the source of the Free-path CI half; rewrite both general clauses to "paid CI". | records |
| B3-5 | Low | high | Umbrella `:29` F-02 split | "re-ask → Phase 3": neither pointed Phase 3 plan contains a re-ask task (grep of the journey-fixes plans for "re-ask", "second metered/vendor call" and similar finds nothing); its only homes are Deferral Ledger rows (umbrella `:70`; SQ-master `:61`, which says "parked plan, Phase 1"). Not orphaned — Phase 3 is a named parked phase with a matching non-goal — but the register would claim a home that does not build it. | Record as "Phase 3 — Deferral Ledger row; no task in the pointed plan until un-park". | records |
| B3-6 | Low | medium | Phase 0 req 2; AC2 | Obligation rows (1)–(23) have no receiving-phase rule in the scoped text: AC2's "receiving phase per the translation table" covers F-ids only. The umbrella's money/non-money split (`:21`) and the owner's §3 grouping settle most rows, but row 23 (page/help/checkout alignment) has several answers — 4 (non-money closure), 7 (T8, `:27`), or 3 (checkout). Bounded harm (Phase 7 depends on 3–4), but AC2 cannot check these rows. | Add a group→phase list to req 2 (§3 admission/entitlement 1–6 → 4; data 7–11 → 4; billing 12–14 → 3; telemetry/support 15–21 → 4; truth 22 → 4, 23 → 7 with its checkout part in 3) and state that closed rows read "n/a". | records |
| B3-7 | Info | high | req 2; AC2 | "Split row" could mean one row with a two-phase cell or two physical rows; req 2's "one row per journey finding" implies the former, AC2's "all 21 F-id rows" is ambiguous if someone writes F-02a/F-02b. | Say: one row, receiving-phase cell names each half. | records |
| B3-8 | Info | high | req 2 citations | To pick Phase 1 vs 2 for a claimed row and to write the half labels, the implementer must read the SQ and JF phase headers' audit-row lines; req 2 cites only the SQ master plan, and golden rule 1 requires opening what a recorded claim names. | Add `respin-service-quality-phase-1.md:4`, `-phase-2.md:4`, `respin-journey-fixes-phase-1.md:4`, `-phase-3.md:4`; state that audit "Phase N" is journey-fixes numbering. | records |
| B3-9 | Info | high | Umbrella `:29` | Quote says "F-05 UI half", source says "UI only"; "its 'Requirement IDs' line" is a heading (`:12`) followed by the set (`:14`). Faithful in meaning. | Optional wording. | records |
| B3-10 | Info | high | Phase 0 Least confident | Probed: none of the scoped text depends on the database SELECTs — T2 reads documents only, so a refused query does not block the register. | — | — |

## Mechanical checks

- Row counts: req 2 enumerates 24 obligation rows (23 + row 24, correctly attributed); AC2 says 24 + 21 — agree. Split-row triple consistent across paragraph, req 2 and AC2 (but see B3-3).
- Unknown rule: req 2's "no repo record → unknown, reason: only P1 §§10–11 could prove it" matches the umbrella decision (`:53`); AC2 is looser (B3-1).
- Precedence citation: the quoted set matches the source line.
- Fix-introduced regressions: B3-2, B3-4, B3-5 are introduced by the batch-2 fix; B3-3 carried over from B2-1; B3-1 and B3-6 pre-exist batch 2.

## Verdict

**NOT READY** (Almost) — **NEEDS CHANGES**. B2-1's mis-route is closed and every F-id reaches the correct phase; one Medium (B3-1) remains: the register can record an obligation closed on a historical record whose witnessing suite this very phase records as NOT RUN, which weakens the only criterion guarding `unknown-never-passed`.

Recommended fixes, in order: (1) B3-1 — define "closed" as requiring a this-phase citation and a run witness, else `closed-by-record (witness unrun)` / `unknown`; tighten AC2's "or a named missing source" clause. (2) B3-2 — relabel F-05's Phase 3 half as the typed refusal reason. (3) B3-3 — enumerate the F-18–F-21 paid remainders and fix the split-row list. (4) B3-4 — anchor F-17's split on SQ-P2 T4 and rewrite the two general clauses to "paid CI". (5) B3-5 — record re-ask as a ledger-only home. (6) B3-6 — add the obligation-row routing list. (7) B3-7–B3-9 wording.

Fix 1 changes what Phase 0 records; under the plan lane's severity test (gate-rules §9) that would normally earn a re-review, but this gate's allowance ends at batch 3 — so the owner decides whether to apply it and approve one more scoped evaluation, or accept the risk (which preserves this verdict and cannot create Ready). Fixes 2–7 change only how the plan reads and can be applied and logged without re-review.

---

*Batch 4 — second owner-approved extension (2026-09-15), scoped to the B3-1 fix (Phase 0 req 2, AC2, Risk coverage) and the umbrella translation paragraph as rewritten for B3-2–B3-9. Generalist `plan-reviewer`, sole slot; model inherit / no override requested, "think hard", read-only tools; resolved model and effort not exposed. Recorded verbatim by the orchestrator; only the trailing "Ask /go…" footer and file list are omitted.*

# Plan review — creator-ready (umbrella + Phase 0) — batch 4

**Readiness: Almost · Grade: C · The B3-1 fix closes the exact case it targeted, but the witness population is still discovered rather than listed and AC2 checks a weaker condition than req 2 states, so a row can still read plain `closed` by omitting an unrun witness or by declaring "none executable" for a claim no code can prove.**

Generalist `plan-reviewer`, sole slot, batch 4 (second owner-approved extension). `plan gate ran lean (consolidated)`. Read-only tools only; no file edited. Scope held to the owner's fix: Phase 0 req 2 (`:36`), AC2 (`:121`), Risk coverage (`:130`), umbrella `:29`. Small enough to simulate completely (gate canon §11).

**Probe (Least confident line):** the new vocabulary does not depend on the DB SELECTs except for rows (12)/(13), whose evidence is the `config_versions` read; T6 needs no DB in the loud-skip shape, so a refused SELECT cannot produce a false `closed`.

## B3-1 closure simulation

Simulated as `respin-engineer` writing `00-obligation-register.md` with T6 in the loud-skip shape (all 23 `*.docker.test.ts` NOT RUN).

| Row | Text-derived state | Why |
|---|---|---|
| (7) deletion-journal provisioning | **Ambiguous — can yield `closed`** | Listing `deletion-executor.docker.test.ts` as witness → `closed-by-record (witness unrun: deletion-executor.docker.test.ts)` ✅. But the obligation is *external* provisioning (owner §3, `02_Remediation_Plan.md:54`), which a local Docker suite does not exercise either, so an engineer may honestly write "none executable" + a current-code citation (the journal client / env names) → `closed`, which AC2's "or 'none executable' with a citation to current code" accepts. Phase 0 has no AWS/intended-environment access (Edge Cases row 2). → B4-2 |
| (4) server-side scope checks | **Implementer/reviewer divergence** | Non-Docker unit suites run green; Docker suites that plausibly witness scoping (`packages/db/tests/concurrency.docker.test.ts`, `packages/credits/tests/profiles.docker.test.ts`) are NOT RUN. Req 2 ("every executable witness … green") → `closed-by-record`; AC2 ("witness column shows **a** check that ran green") → passes `closed`. The plan names no witness population for this row. → B4-1 |
| (11) delayed-job resurrection | **Same divergence as (4)** | Real witnesses `deletion-recovery-concurrency.docker.test.ts`, `tests/pg-boss.docker.test.ts` are NOT RUN; a green unit test of the worker lifecycle satisfies AC2's singular wording. → B4-1 |
| (22) customer-document placeholders | `open` or `closed` — correct | A repo-text property; opening the current page this phase proves presence or absence of placeholders. Approval of customer copy is T8/Phase 7, not this row. ✅ |
| (1) admission on signup | `open` expected; `closed` reachable | Current `create-auth.ts` shows no pilot boundary → `open`. But the approved admission rule is an absent owner input; any gate present plus a green unit test could read `closed` against a rule nobody approved. → B4-2 |
| Historical card + named Docker suite (the batch-3 case) | `closed-by-record` | Closed: req 2 and AC2 agree, and Risk coverage `:130` names it. ✅ |

Answering the brief: a row cannot read plain `closed` on a historical record or an unrun witness **when the engineer names that witness** — but can by omission (B4-1) or by "none executable" (B4-2). Implementer and reviewer cannot apply the vocabulary identically: "every executable witness of the obligation" is a discovered population, not a list (non-negotiable 7), and AC2 tests a weaker, singular condition than req 2 states.

## B3-2–B3-9 residual check

`:29` applied mechanically to F-01…F-21: F-01, F-12 → 3; F-03, F-04, F-07–F-11, F-13, F-14 → 1; F-19 → 2; F-06 → operator note; F-15, F-16 → outside programme 10b-2; F-02 → 1 + 3 + 3 (ledger-only); F-05 → 1 + 3; F-17, F-18, F-20, F-21 → 2 + 3. 21 rows; the six split rows match req 2 and AC2; every cited task row says what the paragraph claims (SQ-P1 T1 `:105`, T8 `:112`; SQ-P2 T4 `:87`; JF-P1 T5 `:106` typed reason; JF-P3 T1 `:83` `manage-plan`/`action-error`, T3 `:85` pause/resume/pack/cancel, T4 `:86`, T5 `:87`; re-ask ledger row umbrella `:70`). B3-2 closed; B3-3 closed (minor overlap with Phase 2, B4-8); B3-4 closed in substance (wording residual B4-9); B3-5 closed; B3-6 closed (umbrella Phase 4 rows lag, B4-7); B3-7 closed; B3-8 mostly (B4-10); B3-9 closed. Nothing made worse.

## Findings

| ID | Severity | Confidence | File + section | Finding | Fix | Changes what is built / records |
|---|---|---|---|---|---|---|
| B4-1 | **Medium** | high | Phase 0 req 2 `:36`; AC2 `:121` | **Witness population is a producer, and AC2 is weaker than req 2.** Req 2: `closed` needs "every executable witness … ran green"; AC2 accepts a row whose witness column "shows a check that ran green". No row's witnesses are named, so an engineer can list one green unit test, omit the Docker suite that actually witnesses the obligation, and write `closed` — which passes AC2. Reproduced on (4) and (11) above; likely (8), (10), (14). This is the B3-1 hole re-entered by omission (non-negotiable 7). | Pin the population: either (a) name a minimum witness list per row in req 2 (at least (7)(8)(10) `deletion-executor` + `deletion-recovery-concurrency`; (11) those + `tests/pg-boss.docker.test.ts`; (4) `packages/db/tests/concurrency`, `packages/credits/tests/profiles`; (14) `packages/credits/tests/concurrency`, `auto-topup-race`) and require the engineer to grep all 23 Docker files for each row's subject and record every match; or (b) state rows (7)–(11) and (14) cannot read `closed` in Phase 0. Then AC2 → "every listed witness … ran green, and the list includes the pinned minimum". | records (register states) |
| B4-2 | **Medium** | medium | req 2 `:36` "none executable" clause; AC2 `:121` | **"No executable witness + current-code citation" can close claims no code can prove.** Obligations about external provisioning, the intended environment or owner-assigned facts — (7) external journal, (8) restore, (15) collectors, (17) visibility, (18) alert recipients, (19) recovery diagnosis, (20) support contact, (21) incident/rollback owners, and (1)–(3) against an absent admission rule — are not demonstrated by citing code that reads an env name or sends an alert. Phase 0 has no intended-environment access, and the owner's rule is "resolve absent access as unknown/blocked, not passed". | Restrict the "none executable" route to `closed` to obligations that are properties of repo text (e.g. (22)); for the rows listed the state is `unknown` ("intended environment / owner input not available in Phase 0") or `closed-by-record` if a record claims them — enumerate those rows in req 2 and add them to AC2. | records |
| B4-3 | Low | high | req 2; AC2 | **No state for a witness that ran red.** The four definitions cover green, NOT RUN/historical, gap-by-citation, no-record; a witness recorded failing in T6 fits none, so such a row cannot satisfy AC2's "obeys its definition" — plausible, since Failure Modes expects baseline failures. | Add: "a witness recorded failing in T6 → `open`, with the transcript line as citation". | records |
| B4-4 | Low | high | req 2; AC2 | **Label form breaks for historical-only rows.** AC2 requires `closed-by-record (witness unrun: <suite>)` for a row "whose only evidence is a historical record", which may have no suite to name. | Allow `(witness: none identified)` beside `(witness unrun: <suite>)`. | records |
| B4-5 | Low | high | T2 row `:84`; T6 row `:88` | **Task order unpinned.** The witness column holds "its T6 result" and AC2 checks `entry-gate-phase-0.txt`, so T2's state/witness columns can only be completed after T6; the task table lists T2 first and never says so. Not contradicted, but an engineer executing top-down writes states before any transcript exists. | T2 row: "states and witness column filled after T6's transcript exists". | records |
| B4-6 | Low | low | AC2 evidence cell | **Transcript locatability assumed.** "Each `closed` row's witness located in the transcript" assumes vitest ^3.2's default reporter lists passing files by name when output is captured to a file — unverified and unpinned (golden rule 9). A witness named at test-case level cannot be located in file-level output at all. | Name witnesses at test-file level; T6 confirms the transcript lists passing files, else no row may be `closed` via an executable witness. | records |
| B4-7 | Low | medium | umbrella `:21` (T0 closures row), `:71` (Phase 4 ledger row) vs Phase 0 routing `:36` | **Umbrella Phase 4 rows omit what Phase 0 routes to Phase 4.** Phase 0 routes (1)–(6) → Phase 4 (consistent with the Critical Paths row "admission, entitlement", `:43`), but the T0 closures row and the Phase 4 Deferral Ledger row list neither scope/plan checks nor full-script entitlement (4)–(6); the programme Non-goal "any change on the money path" (`:33`) could lead a Phase 4 planner to treat (5)/(6) as parked money work. Register routing itself is unambiguous. | Add (4)–(6) to `:21` and `:71`, and say whether entitlement verification is a money-path change. | records |
| B4-8 | Low | medium | umbrella `:29` F-18/F-21 Phase 3 halves | **Some Phase 3 halves name work Phase 2 already writes.** SQ-P2 T1 (`:84`) already writes the `manage-plan`/`subscribe` waits behind `E2E_PAID_TIERS=1`, and SQ-P2 T5 (`:88`) already names the Stripe forwarder under that gate, so the register would say Phase 3 owes lines Phase 2 writes. Phase 3 still owes their live paid-CI execution and the `action-error` wait, so nothing is mis-routed. | Relabel as "live paid execution of the gated billing waits + `action-error`" and "`stripe listen` as a required process". | records |
| B4-9 | Info | high | umbrella `:29` precedence sentence; req 2 paraphrase | "Only the remainder follows the journey-fixes rule → Phase 3" and req 2's "(the remainder → Phase 3)" are false for F-17's Free-path CI half, which no service-quality set claims yet goes to Phase 2; only the enumerated split list gets F-17 right, and no sentence says the enumeration overrides the general clauses. | Add "the enumerated split rows override the general clauses". | records |
| B4-10 | Info | high | req 2 citations | The citation list omits the task rows the half labels name (SQ-P1 T1/T8, SQ-P2 T4, JF-P1 T3/T5, JF-P3 T1/T3/T4/T5) and `respin-journey-fixes-phase-2.md:4`; golden rule 1 requires opening what a recorded label names. | Add them. | records |
| B4-11 | Info | high | req 2 column set | Rows (12)/(13) evidence is a `config_versions` read, not a `path:line`; the citation column has no format for a query result (a refused read correctly prevents closure). | Allow "query (T3) + result or blocked" in the citation column. | records |
| B4-12 | Info | medium | Verification step 2 `:112` | The `&&` chain now matters more: a baseline typecheck/lint failure stops `test` from running, so every witness reads NOT RUN and no row can close through a check — safe, but it thins the register. | Optional: run each gate command independently in T6. | records |

## Mechanical checks

Row counts: 24 obligation + 21 F-id rows in req 2 and AC2 — agree; six split rows consistent across `:29`, `:36`, `:121`; F-19 Phase 2 only in all three. Invariants: `unknown-never-passed` holds for P1-only rows but is undermined by B4-2 for environment/owner-dependent rows; `closed-means-witnessed` holds only when the engineer names the witness (B4-1); routing: no mis-route. Fix-induced regressions: none against the Edge Cases table, technical item 3, the manifest or the unknown/blocked rule; the new T6→T2 ordering is implied but not stated (B4-5).

## Verdict

**NOT READY** — **NEEDS CHANGES** (Almost, Grade C; 2 Medium, 6 Low, 4 Info). Recommended fixes in order: (1) B4-1 pin witnesses per row or bar rows (7)–(11), (14) from `closed`, AC2 → "every"; (2) B4-2 restrict "none executable" closure to repo-text properties, environment/owner rows → `unknown`/`closed-by-record`; (3) B4-3–B4-5 red-witness state, no-suite label, T2 after T6; (4) B4-6–B4-8 reporter check, umbrella Phase 4 rows, remainder labels; (5) B4-9–B4-12 wording/citations. B4-1 and B4-2 change what Phase 0 records, so under gate-rules §9 row 4 they owe a fresh evaluation — and this batch was the last the owner approved.

---

*Batch 5 — third owner-approved extension (2026-09-15), scoped to the register state vocabulary (owner decision: REDESIGN — Phase 0 never records closure), AC2 and Risk coverage. Generalist `plan-reviewer`, sole slot; model inherit / no override requested, "think hard", read-only tools (Read/Grep/Glob, no Bash); resolved model and effort not exposed. Condensed by the orchestrator from the reviewer's report; the verdict, findings and fix order are unchanged, and the full per-row walk and mechanical checks sit in the session transcript.*

# Plan review — creator-ready (Phase 0) — batch 5

**Readiness: Almost · Grade: C** — the redesign removes closure (AC2's three-value whitelist plus forbidden list reject any closing word); one precedence-vs-AC2 contradiction means implementer and reviewer can still record different states for the same row. `plan gate ran lean (consolidated)`.

B4 closure: B4-1 closed (as closure risk; reverse case B5-3); B4-2 partly (B5-1); B4-3, B4-4, B4-6, B4-7, B4-10, B4-12 closed; B4-5 partly (B5-4); B4-8 closed (log line numbers off by one, B5-8); B4-9 closed in umbrella, residual in req 2 (B5-9); B4-11 closed for format, no state for the evidence (B5-2).

| ID | Severity | Confidence | Location | Finding | Fix | Built / records |
|---|---|---|---|---|---|---|
| B5-1 | **Medium** | high | Phase 0 req 2 (c) `:36`; AC2 `:121`; umbrella log B4-2 disposition | Precedence (b) > (c) makes (c)'s environment clause redundant, yet (c) names (7), (8) as `unknown` examples and AC2 says those rows "read `unknown`" with no record exception; row (7) has a provisioning record (10b-1), so a register following the precedence fails the literal AC2 and vice versa; "e.g." leaves the population open (non-negotiable 7). No reading produces closure; routing identical. | Pick one reading in both places: (i) environment/owner rows read `unknown` unless a citation shows a gap even when a record claims them (record cited beside), or (ii) add "and no record claims it" to (c) and AC2; replace "e.g." with an exhaustive row list. | built |
| B5-2 | Low | medium | req 2 (a)–(c); AC2 | No state for (1) a record asserting a gap with no current citation (open-items restore/scrub), (2) a T3 query result that matches or reads `blocked`. | Record-of-gap → one chosen state; T3 difference → `open`; match → `recorded-claim`; `blocked` → `unknown`. | built |
| B5-3 | Low | high | Risk `red-witness-is-open`; AC2 | Omitting a red witness from every row passes AC2 (it checks only named witnesses). | Every T6 failed test file appears in a row's witness column or is listed "bears on no obligation". | built |
| B5-4 | Low | high | T2 row `:84` | T2 runs after T6, but rows (12)/(13) need T3's result. | "Runs after T6 and T3." | built |
| B5-5 | Low | medium | AC5 `:124`; T5 | Estimate can cost `recorded-claim` rows at zero or call them closed. | AC5: every `recorded-claim`/`unknown` row appears under verification/review or external dependencies; estimate and card use only the three state words. | built |
| B5-6 | Low | medium | req 2 "cited at" column | Citations into uncommitted files get labelled HEAD `3273f36`. | "cited at (HEAD, date, path dirty yes/no per T1)". | records |
| B5-7 | Low | medium | umbrella Deferral Ledger; Phase 0 Handoff | "Closure moves to the receiving phase" has no consumer side. | Ledger row "close register rows by witness" → Phases 1–4, 7 (rows (12)–(14) Phase 3, (23) Phase 7). | records |
| B5-8 | Info | high | umbrella log | SQ-P2 T1/T5 now `:85`/`:89`, not `:84`/`:88`. | Correct the log. | records |
| B5-9 | Info | high | req 2 `:36` | Paraphrase "remainder → Phase 3" omits the override sentence. | Add it. | records |
| B5-10 | Info | medium | req 2; AC2 | "re-checked against P1" value unpinned; AC2 checks a witness is "located", not that its value matches; card should note divergence from the owner's §2 "closed/open/unknown" (`02_Remediation_Plan.md:43`). | Pin "not yet (P1 absent)"; "located and value matches"; one card line. | records |

Risk mapping: `unknown-never-passed`, `no-closure-in-phase-0`, `claim-never-promoted-by-green` can fail; `red-witness-is-open` only when named (B5-3); `green-only-if-run` via AC6, weak inside the register (B5-10). Mechanical: 24 + 21 rows; six split rows consistent; no forbidden word used as a register state. Commands run: none.

**Verdict: NOT READY — NEEDS CHANGES** (Almost, Grade C; 1 Medium, 6 Low, 3 Info). Fix order: B5-1; B5-2; B5-3; B5-4; B5-5; B5-6/B5-7; B5-8–B5-10. B5-1–B5-5 change what Phase 0 records (§9 row 4) and owe a fresh evaluation. Reviewer's note: the closure class (B3-1/B4-1/B4-2) is removed; B5-1 touches the same rows but a different property (consistent application, not passing) — whether that is a §5 recurrence is the orchestrator's call.

---

*Batch 6 — fourth owner-approved extension (2026-09-15), scoped to the batch-5 fixes (Phase 0 requirement 2's state vocabulary and column set, AC2, AC5, the T2 task row, Risk coverage, Completion Criteria, and the umbrella's new consumer ledger row). Generalist `plan-reviewer`, sole slot; model inherit / no override requested, "think hard", read-only tools; resolved model and effort not exposed. Recorded verbatim by the orchestrator; only the trailing "Ask /go…" footer and file list are omitted. **Method disclosure (gate-rules §1):** the reviewer reports one accidental no-op `echo skip` through Bash against a read-only brief; it produced no output used in the report and every fact is from Read/Grep. The disclosure is the expected outcome and is not itself a finding; the report stands.*

# Plan review — creator-ready Phase 0 — batch 6

**Readiness: Almost · Grade: C · The redesign holds — no path in the scoped text can record closure, and all ten batch-5 fixes are in — but two state rules are still missing, so the admission rows (1)–(3) and the deletion rows (7)–(11)/(14) do not derive one state: the plan's own row-(7) worked example contradicts its precedence against the records actually in this repo.**

Counts: 11 findings — 0 High, 2 Medium, 6 Low, 3 Info. Batch 5: 10 of 10 applied.

## Batch-5 resolution check

| ID | State | Evidence in the current text |
|---|---|---|
| B5-1 | **Closed in substance** (reading (ii) implemented in both places) | req 2 (c) ends "and no record claims it either way" with the population enumerated; AC2 carries the same clause over the same list; the (b)-governs case and the row-(7) example are spelled out. Residuals: the list holds **eleven** rows but is called "twelve" three times (B6-3); AC2's clause is a necessary condition, so it permits `open` too and cannot discriminate (feeds B6-2) |
| B5-2 | Closed | (a) gains "a repo record itself asserts the gap" + "T3 shows a difference"; (b) "T3 matches"; (c) "T3 blocked"; AC2 states the (12)/(13) mapping |
| B5-3 | Closed | AC2's completeness check: every failing file appears in a witness column or in "T6 failures bearing on no obligation"; risk slug names omission |
| B5-4 | Closed | T2 row: "runs after T6 and after T3" |
| B5-5 | Closed, with a new contradiction | AC5 `:124` carries both clauses — but its "never `closed`" bans the card line Completion Criteria `:142` mandates (B6-4) |
| B5-6 | Closed, doesn't compose | "cited at (HEAD, date, dirty yes/no)"; no value defined for the query-cited rows (12)/(13) (B6-5) |
| B5-7 | Closed | umbrella `:76` consumer row; its routing matches req 2's group routing 1:1. Row (24) omitted (covered by `:78`) — B6-8 |
| B5-8 | Closed, verified | SQ-P2 T1 is at `respin-service-quality-phase-2.md:85`, T5 at `:89` — both correct as re-numbered |
| B5-9 | Closed | req 2: "the paragraph's enumerated split rows override both of those general clauses", with F-17 as the worked case |
| B5-10 | Closed | `not yet (P1 absent)` pinned; AC2 requires the witness **value to match**; card divergence line present (`02_Remediation_Plan.md:43` verified — it does say "closed/open/unknown") |

## Execution simulation — deriving each row's state from the text alone

| Row | State the text produces | Same answer for implementer and reviewer? |
|---|---|---|
| (1) admission on signup | `open` **or** `unknown` | **No** — `create-auth.ts` carries no pilot boundary (only a mail-quota admission comment, `:416`). (a) fires if "a citation shows the gap"; (c) enumerates (1) as environment/owner-dependent "(against the absent admission rule)". AC2's environment clause is "reads `unknown` **only when** no record claims it" — a necessary condition that permits `open`, so the AC cannot discriminate. Batch 4 of this very gate derived `open` for this row. → **B6-2** |
| (4) server-side scope checks | `recorded-claim (unverified)` | Yes — current code implements scoping; green unit witnesses are recorded beside the state and never promote it (b). The B4-1 omission hole is genuinely gone |
| (7) deletion-journal provisioning | `recorded-claim (unverified)` **or** `open` | **No** — the repo carries *both*: a met-claiming record (`respin-finish-open-items.md:405`, "closed on 2026-09-08 by the R-124 provisioning evidence … the deployed, Access-Analyzer-checked policies") **and** gap-asserting records (`respin-finish-phase-10b-1.md:172` "explicit owner provisioning approval … deletion/public launch stay disabled until then"; `respin-finish-phase-10b-1-review.md:142` "walks 4, 5 and 8 need a provisioned S3 bucket"; open-items `:433` "no restore drill, no live mail, no charge, no deploy"). Precedence (a) before (b) ⇒ `open`; the plan's worked example says `recorded-claim`. → **B6-1** |
| (11) delayed-job resurrection | `open` | Only under B6-1's fix — open-items T69-R5 ("nothing asserts the retention sweep is scheduled at all") asserts the gap ⇒ (a) ⇒ `open`; witnesses `deletion-recovery-concurrency.docker.test.ts`, `tests/pg-boss.docker.test.ts` = NOT RUN. An implementer citing the 10b-1 completion claim instead lands on `recorded-claim`. Same conflict class as (7); also (8), (9), (10), (14) |
| (12) billing configuration | `open` on a T3 difference / `recorded-claim` on a match / `unknown` if blocked | Yes, mechanically. (Realistically `open`: the pricing copy is pinned to `CONFIG_V1_SEED` while the active version is 17.) Residual judgement in "bearing on the obligation" — B6-10 |
| (22) customer-document placeholders | `open` or `recorded-claim` from opening the pages | Yes — the cleanest row; a repo-text property this phase can read directly |
| (24) Docker-suite count drift | `open`; receiving = umbrella ledger row `:78` | State yes. AC2 never checks row 24's receiving cell — B6-8 |
| F-02 (split) | state `open`; receiving "Phase 1 (assembly tolerance + refusal kinds, SQ-P1 T1) + Phase 3 (included-build consumption, JF-P1 T3 `:104`) + Phase 3 ledger-only (re-ask)" | Routing yes. **State only by inference** — no text says an audit finding is a gap record; (a)'s parenthetical names "an open-items entry, a card residual", not the audit — B6-6 |
| F-17 (the override case) | receiving "Phase 2 (Free-path CI, SQ-P2 T4) + Phase 3 (activation, paid CI — JF-P3 T4 `:86`)" | Yes — B5-9's override sentence makes the enumerated split win over both general clauses |
| F-19 | Phase 2 only | Yes — consistent across `:29`, req 2 and AC2 |

**Closure check (the redesign's purpose):** no path in the scoped text reaches closure. AC2 whitelists three values and forbids `closed`/`closed-by-record`/`passed`/`met`/`done`/`n/a` in the state column; the witness column is defined as "an observation recorded beside the state, never a closure"; a `green` witness explicitly never promotes (b); AC5 bars closure words from the estimate and card; Completion Criteria reports the owner's five evidence states as `n/a`. **No green-witness promotion path remains.**

**Population check:** every gating population in the scoped text is a list — 24 obligation rows, 21 F-ids, six split rows, eleven environment/owner rows, the forbidden-state words, the citation set, the receiving-phase groups. The one set still *discovered* is inherent to inspection: which repo records bear on a row. That cannot be enumerated in advance — which is exactly why it needs the conflict rule of B6-1 rather than a list.

**Task ordering:** T1 → T3/T4 → T6 → T2 → T5 → T7 is fully pinned (T6 "after T1's reads" + Verification step 2 "runs after step 3"; T2 "after T6 and after T3"; T5 last via AC5's row-count citation; T7 last). Nothing else is unpinned. T1's manifest gains its T6 section after T6 — implied by T6's own Files cell, harmless.

## Findings

| ID | Sev | Conf | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|---|
| **B6-1** | **Medium** | high | Phase 0 req 2 (a)/(b) `:36`; AC2 `:121` | **No rule for conflicting records — and row (7), the plan's own worked example, is a conflicting-record row in this repo.** (a) fires on "a repo record itself asserts the gap"; (b) on "a repo record claims the obligation is met". Row (7) has both (citations above). Precedence gives `open`; the worked example asserts `recorded-claim (unverified)`. Rows (8), (9), (10), (11), (14) share the shape. Nothing in the text uses recency, supersession, or "conflict ⇒ conservative" | Add one precedence clause — either "where records conflict, the row reads `open` and both records are cited" (conservative, matches "Phase 0 never closes") or "the most recent dated record governs, the superseded one cited beside it" — then restate the row-(7) example under that rule with its real citations (`open-items:405` vs `10b-1.md:172` / `10b-1-review.md:142`) | **built** |
| **B6-2** | **Medium** | high | req 2 (a) and (c) `:36`; AC2 `:121` | **No rule for an absence-shaped gap against an absent standard.** For (1), (2), (3) the standard is the approved pilot boundary — an absent owner input. Reading `create-auth.ts` and finding no gate supports (a) `open`; membership in (c)'s enumerated environment/owner population supports `unknown`. AC2's "reads `unknown` only when no record claims it either way" is a necessary condition, so both pass. Two reviewers of this gate have already produced the two answers. Separately, the citation column is `path:line` and has no form for "I read this file, the check is absent" | State which way it goes: e.g. "an obligation whose standard is an absent owner input cannot take (a); an absence of enforcement reads `unknown`, citing the file read and what was absent" — and give the citation column a documented absence form. **Not a re-litigation of reading (ii)**, which governs rows *with* a record | **built** |
| B6-3 | Low | high | `:36`, `:121`, `:130` | The environment/owner population is called "those **twelve** rows" / "the **twelve** environment/owner-dependent rows" / "the same enumerated **twelve** rows" but lists **eleven** — (1), (2), (3), (7), (8), (15), (17), (18), (19), (20), (21). The list governs (non-negotiable 7), so no state changes, but a reviewer counting must decide whether a row was dropped ((16), content minimisation, is the only telemetry row excluded) | Say eleven, or add the twelfth deliberately | records |
| B6-4 | Low | high | AC5 `:124` vs Completion Criteria `:142` | AC5 requires "the estimate and the report card use only the three state words and never `closed`, `passed`, `met` or `done`". Completion Criteria mandates a card line quoting the owner's §2 vocabulary "`closed / open / unknown`". The card literally cannot satisfy both; an implementer obeying AC5 drops the safeguard line ("a reader must not read the absence of `closed` as 'nothing is done'") | Scope AC5's ban to words used **as a register-row state**, exempting the divergence line explicitly | records |
| B6-5 | Low | high | req 2 column set `:36`; AC2 `:121` | B5-6 and B4-11 don't compose: rows (12)/(13) cite "query (T3) + its result, or `blocked`", but AC2 requires **every** row's "cited at" cell to carry "HEAD, date and the dirty yes/no flag" — a query citation has no path to be dirty | Allow `dirty: n/a (query)` for the query-cited rows | records |
| B6-6 | Low | medium | req 2 `:36`; AC2 `:121` | **No state rule for the 21 F-id rows.** Both pin their count and receiving-phase cells; neither says which state an audit finding takes. (a)'s parenthetical names "an open-items entry, a card residual" — not the audit, which req 2 cites separately. The intended answer (`open` for all 21) is reachable but unstated, and a service-quality phase plan claiming a row could be misread as a (b) claim | One sentence: "the journey audit is a record asserting the gap, so every F-id row reads `open` unless a citation opened this phase shows it fixed; a plan that schedules a fix is not a claim that the obligation is met" | built |
| B6-7 | Low | high | AC2 `:121` vs req 2's pinned column set `:36` | AC2 checks six of the eight pinned columns. It never checks the **`audit F-id`** column, and requires a citation cell only for rows (12)/(13) — the general duty appears only as "no row promoted to 'current defect' without a citation". A register that omits the F-id column, or leaves a `recorded-claim` row's citation empty, passes AC2 | AC2 adds: "the register carries the eight pinned columns, and every `open` / `recorded-claim (unverified)` row has a non-empty citation cell" | records |
| B6-8 | Low | medium | AC2 `:121`; umbrella `:76` | Row (24)'s receiving cell is unchecked: AC2 covers (1)–(23) and the F-ids only, while req 2 gives (24) a non-phase receiver and asserts "there is no `n/a`". The umbrella's new consumer ledger row enumerates (1)–(23) + F-ids and omits (24) (homed instead by the drift row `:78`) | One AC2 clause for row 24's cell; name the drift row in the consumer row so the omission reads as deliberate | records |
| B6-9 | Info | medium | Verification 2 `:112`; req 2 witness column | If the gate is blocked whole (classifier denial, or `TEST_DATABASE_URL` set), every witness value is ambiguous between `NOT RUN` and `result not locatable in transcript`. No row's **state** changes either way | Say which value a blocked gate produces | records |
| B6-10 | Info | medium | req 2 (a) `:36` (twice) | "a witness **bearing on** the obligation" / "a difference **bearing on** the obligation" is a judgement with no rule. Mitigated: AC2's completeness check forces every failing file into a row or the "bears on no obligation" list, so a mismatch is visible rather than silent | Optional wording | records |
| B6-11 | Info | high | AC5 evidence cell `:124` | AC5 constrains the report card but its Evidence cell names only `00-estimate.md` | Point it at the card too | records |

## Mechanical checks

- **Counts / parity:** 24 obligation rows (23 from §3 + row 24) enumerated in req 2 and asserted by AC2; 21 F-id rows; six split rows (F-02, F-05, F-17, F-18, F-20, F-21) identical across umbrella `:29`, req 2 and AC2, F-19 Phase 2 only in all three. Environment/owner list: eleven items, called twelve (B6-3).
- **Routing parity:** the umbrella's new consumer ledger row `:76` — (1)–(11), (15)–(22) → Phase 4; (12)–(14) → Phase 3; (23) → Phase 7/checkout 3 — matches req 2's group routing exactly.
- **Citations verified by opening the files this session:** `02_Remediation_Plan.md:43` (the "closed/open/unknown" deliverables line); `:53-57` (the five §3 areas, in the cited order); `respin-journey-fixes-phase-1.md:104` (T3 included build) and `:106` (T5 typed niche refusal reason); `respin-journey-fixes-phase-3.md:83, 85, 86, 87`; `respin-service-quality-phase-2.md:85` / `:89` — B5-8's correction is right (SQ-P2 T4 is at `:88`; no plan text cites a line for it, so nothing is stale).
- **Invariant slugs:** `t0-inspection-only`, `unknown-never-passed`, `no-closure-in-phase-0`, `claim-never-promoted-by-green`, `red-witness-is-open`, `states-applied-consistently`, `green-only-if-run` — non-empty and unique. `closed-means-witnessed` is gone, but its removal is recorded in the batch-4 disposition (dissolved by the redesign), not a silent rename.
- **Closure:** Files table 9 rows ↔ T1–T7 both ways; `respin-engineer` and `plan-reviewer` exist; Least confident non-empty and probed (a denied `SELECT` blocks T3 and rows (12)/(13) → `unknown`, explicitly; it cannot manufacture any other state); Reachability line present with its ledger row `:77`; §11 — 9 Files rows, no size signal, the scoped text simulable in full.
- **Number provenance:** no new quantitative claim in the batch-5 edits except "twelve" (wrong) and the 23-file glob (already derived); no recurring-cost implication.

## Verdict

**NOT READY** (Almost, Grade C — 2 Medium, 6 Low, 3 Info).

Plainly: the text is now safe to execute — nothing it can produce records closure, no green unit test can promote a claim, and every routing answer is derivable. It is **not yet reproducible**: for the admission block (1)–(3) and the deletion/billing block (7)–(11), (14) — 13 of the 24 obligation rows — two honest engineers reading this plan write different states, and AC2 passes both. Phase 0's only product is a record other phases route from, so a state column that is not reproducible is the defect the batch was scoped to find.

Fix order: (1) B6-1 conflict rule + restate the row-(7) example against its real citations; (2) B6-2 absence-versus-absent-standard rule + a citation form for an absence; (3) B6-3 the count word; (4) B6-4 scope AC5's word ban; (5) B6-5–B6-8; (6) B6-9–B6-11 wording. B6-1, B6-2 and B6-6 change what Phase 0 records (§9 row 4) and owe a fresh evaluation; B6-3–B6-5, B6-7–B6-11 change only how the plan reads and can be applied and logged.

**§5 note for the orchestrator (not a verdict):** B6-1 and B6-2 land on the same risk slug as B5-1 (`states-applied-consistently`), so this is the second consecutive round on that invariant — but on a different axis each time (B5-1: (b)-vs-(c) for rows *with* a record, decided by the owner; B6-1: conflicting records; B6-2: no record, absence-shaped gap). Whether that counts as a recurrence under §5 or as three distinct gaps in one vocabulary is the orchestrator's call; both fixes are single clauses in req 2's precedence, and they could be applied together.

---

*Batch 7 — fifth owner-approved extension (2026-09-15), scoped to the evidence-inventory redesign. Generalist `plan-reviewer`, sole slot; model inherit / no override requested, "think hard", read-only tools; no Bash. Recorded verbatim by the orchestrator; only the trailing footer and file list are omitted. Commands run: none.*

# Plan review — creator-ready Phase 0 — batch 7

**Readiness: Not yet · Grade: D · The status column is genuinely gone and nothing in the register can record closure — but the judgement moved into `records found` and the shape label, where it is less reproducible than the column was, and two retired-vocabulary instructions survived the rewrite.**

Counts: 19 findings — 0 High, 9 Medium, 7 Low, 3 Info. Batch 6: 8 applied (7 closed, 1 reopened), 3 claimed dissolved (2 dissolved, 1 partly).

## Batch-6 closure check

| ID | Claim | Verdict |
|---|---|---|
| B6-1 (conflicting records) | dissolved | **Dissolved as stated** — with no status there is no contradiction to resolve, and `creator-ready-phase-0.md:40` requires every record side by side with no conclusion. **But the judgement moved, not vanished**: which records count (B7-1) and what shape each carries (B7-2) are now the deliverable, and neither has a rule. Row (7) proves it |
| B6-2 (absence vs absent standard) | dissolved | **Half.** The code-absence half is closed by the `absent: <file read> — <what was looked for>` form (`:41`). The absent-*standard* half is **unowned**: the disposition (master `:174`) says rows (1)–(3) also record "that the admission rule is an absent owner input", but none of the eight pinned columns has a home for it and neither req 2 nor AC2 asks for it → B7-8 |
| B6-6 (F-id row state) | dissolved | **Dissolved** — no state to assign; and `:52`'s "a scheduled fix being a plan, not a claim that the obligation is met" is the useful residue. It is stated only for F-id rows, though → B7-2 |
| B6-3 (eleven/twelve) | applied | **Moot and clean** — the enumerated environment/owner list is gone with the column; the surviving "twelve" at `:56` is the master plan's Docker-suite count, which is correct |
| B6-4 (AC5 ban vs card line) | applied | **Reopened by the rewrite.** AC5 `:140` is now "the same nine-word scan as AC2", and the nine words include `n/a` and `unknown`, which the card's five mandated evidence states and the estimate's "unknowns" both contain → B7-5 |
| B6-5 (`n/a (query)`) | applied | **Closed** — `:43` and AC2 `:137` agree |
| B6-7 (eight columns) | applied | **Closed** for presence; no content rule for `audit F-id` → B7-12 |
| B6-8 (row 24) | applied | **Closed** — AC2 checks row (24)'s cell; master `:76` names the drift row as its home |
| B6-9 (blocked gate) | applied | **Closed** — `:42` "If the gate never ran at all … every witness cell reads `NOT RUN`" |
| B6-10 ("bearing on") | no change | **Re-rated.** Under the old design this was Info because the status column was the product; now `records found` is the product, so "bearing on the obligation" is load-bearing → B7-1 |
| B6-11 (AC5 evidence) | applied | **Closed** — `:140` names the card |

## Row simulation — would two honest engineers write the same cells?

| Row | Same cells? | Why |
|---|---|---|
| **(7) deletion-journal provisioning** — the plan's worked example | **No** | The plan names two disagreeing records. The enumerated search of *one* listed source, `docs/progress/respin-finish-open-items.md`, yields at least two more gap-asserting statements bearing on provisioning: `:349` "deferred with the rest of the provisioning work" and `:433` "no restore drill, no live mail, no charge, no deploy". Engineer A records 2 records, engineer B records 4. Also: the third citation **does not resolve** — `docs/progress/respin-finish/respin-finish-phase-10b-1-review.md:142` does not exist; the file is `docs/progress/respin-finish-phase-10b-1-review.md` (its `:142` does say "walks 4, 5 and 8 need a provisioned S3 bucket"), and **that file is not in the enumerated search list at all**. And `:405`'s own words are "**S3 templates (item 4)** — closed … by the R-124 provisioning evidence … the deployed, Access-Analyzer-checked policies" — the plan calls this "claims the deletion journal was provisioned", which is a paraphrase past the record's words; a second engineer labels it `neither` |
| **(1) admission on signup** | **No** | `records found`: which term? "admission", "pilot", "allowlist" return different sets. `current-code citation`: the plan's example reads `packages/auth/src/create-auth.ts` (verified — only a mail-quota `admission` comment at `:416`, no pilot boundary), but `packages/auth/src/allowlist.ts` and `app/(auth)/auth-form.tsx` are equally plausible reads and would produce different `absent:` entries. Nothing records that the *standard* is an absent owner input |
| **(4) server-side scope checks** | **Partly** | Shape/witness mechanics are clean and a green unit witness provably cannot promote anything. But "path:line where current code **appears to implement** the obligation" has no canonical point for a cross-cutting guard |
| **(11) delayed-job resurrection** | **Partly** | Both records recorded side by side, no conclusion — the redesign works here. Same term/relevance gap as (7); witnesses → `NOT RUN`, unambiguous |
| **(12) billing configuration** | **Yes** | `current-code citation` = T3 query + result or `blocked`; `cited at` = `n/a (query)`; witness `none identified` allowed. The one fully pinned row |
| **(16) content minimisation** | **No** | Records exist (the 10a card), but the code-read set is unpinned and the term is unpinned; (16) is also the one telemetry row the retired enumeration excluded, with nothing marking that any more |
| **(22) customer-document placeholders** | **No** | The population of customer documents is never enumerated — `/legal`, `/changelog`, `/for/*`, help, checkout copy? Non-negotiable 7 applies squarely |
| **(24) Docker-suite count drift** | **Yes on content, no on method** | Content is pre-stated and verified (glob = 23 files: 14 db, 7 credits, 1 config, 1 pg-boss). But its records live in `CLAUDE.md` and `respin/docker-compose.yml`, neither of which is in the enumerated source list |
| **F-02 (split)** | **Routing yes, records no** | Receiving cell derives exactly: Phase 1 (SQ-P1 T1) + Phase 3 (JF-P1) + Phase 3 ledger-only (re-ask). `records found` = the audit entry + the scheduling task — but the audit entry's **shape** is unruled |
| **F-06 (non-phase)** | **No** | The audit's own words are "this is dev residue, **not a product defect**" — an engineer can label that `claims-met`, `asserts-gap` or `neither` |
| F-17 (override case) | Yes | The override sentence makes Phase 2 + Phase 3 derivable against the audit's own "Phase 1 (activation), Phase 3 T4" — verified in `respin-journey-fixes-audit.md:50` |

## Findings

| ID | Sev | Conf | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|---|
| **B7-1** | **Medium** | high | `creator-ready-phase-0.md:40,48`; AC2 `:137` | **`records found` is a discovered set, not a list.** The *sources* are enumerated (good), but the **search term is engineer-chosen** and the inclusion test is "bearing on the obligation" with no rule. Proof: the plan's own worked example under-covers one enumerated source by at least two records (`open-items:349`, `:433`). The register's entire value is this cell | Do for records what AC2 already does for failing test files: pin a term per row, and require "every hit of the row's term in the enumerated sources is recorded in the row or listed in a closing 'hits bearing on no obligation' list" | **built** |
| **B7-2** | **Medium** | high | `:40`; AC2 `:137` | **The `claims-met / asserts-gap / neither` shape label has no definition** — it is the status column re-entering as a per-record label. The only rule in the text is the F-id clause, not generalised. `open-items:405` is labelled claims-met by the plan on a paraphrase; `neither` is equally defensible | Define the three shapes operationally from the record's own words, generalise the plan-is-not-a-claim rule to all rows, and require the label to be justified by the quoted words | **built** |
| **B7-3** | **Medium** | high | `:40` | **"a one-clause quotation *or summary* in the record's own words"** is self-contradictory and is the leak channel: a summary is where "this is basically handled" reappears, and the nine-word scan cannot see it | Verbatim quotation in quote marks only; no summaries | **built** |
| **B7-4** | **Medium** | high | AC2 `:137` vs req 2 `:46` | **The nine-word scan is unsatisfiable and tests the wrong property.** Every mandated citation to `respin-finish-**open**-items.md` contains `open`, and the `audit F-id` cell on rows (1)–(24) has no defined value. Wrong property: "satisfied", "no gap found", "still owed", "verified" all pass. And `:46` bans the words *as a judgement* while AC2 bans every literal occurrence | Scan **whole-cell values**, not substrings; exempt path citations; define the empty `audit F-id` value; keep the reviewer read of `records found` as the real check | **built** |
| **B7-5** | **Medium** | high | AC5 `:140` vs Completion Criteria `:158`, req `:55` | **B6-4 reopened, wider.** AC5 applies the nine-word scan to the estimate and card, but Completion Criteria mandates "implemented: **n/a** … customer-observed: n/a" on the card, and the estimate must name "the **unknown**s that widen it" | Exempt the owner's five evidence states and "unknowns" explicitly, or scope the scan to register-row-shaped cells | **built** |
| **B7-6** | **Medium** | high | T2 task row `:100` | **The retired column survives in the task the engineer executes**: the cell says "no state column and no judgement", then ends "rows (12)/(13) take their **state** from T3's comparison result, so neither transcript may be missing **when the state column is filled**" | "rows (12)/(13)'s `current-code citation` cell takes T3's query and its result, so T2 runs after T3 and after T6" | **built** |
| **B7-7** | **Medium** | high | Edge Cases `:70` (and `:71`) | **The retired vocabulary also survives as an instruction**: "A historical obligation has no repo record either way → **unknown** row with the missing source named (T2)" — the redesign's answer is `no record found`, and `unknown` is one of the nine banned words | Replace with the `no record found` form; reword `:71` | **built** |
| **B7-8** | **Medium** | high | column set `:38`; AC2; AC5 `:140`; master `:174` | **The absent-standard fact is unowned.** No column records "what would settle this row" — a run, a named owner input, or a re-read. The batch-6 disposition asserts rows (1)–(3) record the absent admission rule; nothing requires it. AC5 costs each row by exactly those three activities | Add a pinned cell "what is missing to settle this: run `<suite>` / owner input `<named>` / re-read" — an observation about the repo and environment, not a status | **built** |
| **B7-9** | **Medium** | medium | `:41,42` | **The per-row code-read set and witness set are discovered, not listed** (non-negotiable 7). An `absent:` entry naming `create-auth.ts` is not evidence the check is absent in `allowlist.ts` or `auth-form.tsx`. Same for "test-file name" | Pin the read set per row or per group; state that an absence entry is scoped to the named file | **built** |
| B7-10 | Low | high | `:40` | Broken citation in the **worked example**: `docs/progress/respin-finish/respin-finish-phase-10b-1-review.md:142` does not exist (correct path `docs/progress/respin-finish-phase-10b-1-review.md:142`; content verified) | Fix the path | records |
| B7-11 | **Medium** | high | `:48` | **The enumerated source list omits sources the plan's own rows need**: `respin-finish-phase-10b-1-review.md`, and for rows (22)/(23)/(24) product copy, `CLAUDE.md` and `docker-compose.yml` | Add the 10b-1 review; state that the list is the *documentary-record* population and give code/copy/config rows their own enumerated sets | **built** |
| B7-12 | Low | medium | AC2 `:137`; `:38` | `audit F-id` has no population rule for rows (1)–(24), and nothing says whether an obligation row and an F-id row may cover the same work | Define the no-F-id value; one sentence on overlap | records |
| B7-13 | Low | high | AC5 `:140` | The condition and its gloss disagree: "every row whose evidence is not a current-code citation **with a green witness**" vs "in practice every row". T6 *does* run the non-Docker suites | Say "every register row appears; none is costed at zero" | **built** |
| B7-14 | Low | high | master `:93`, `:3`, `:112`–`:114` | Master plan Risk Assessment still says Phase 0 writes "`recorded-claim (unverified)`" — retired vocabulary in live text. Status and Progress rows still read "pending batch 6" | Rewrite `:93`; refresh Status/Progress | records |
| B7-15 | Low | high | master `:166`/`:168` vs `:174` | **Two contradictory "Disposition of batch 6" blocks**: "8 applied, **3 held for the owner**" and "8 applied, **3 dissolved by the redesign**" | Mark the first superseded, or merge | records |
| B7-16 | Low | medium | `:41` vs `:29`, `:54` | Citation root unpinned: `respin/packages/...`, `app/(product)/...` and `packages/auth/...` in one document; the dirty flag is matched against repo-root-relative `git status --short` | Pin repo-root-relative paths | records |
| B7-17 | Low | medium | master `:176`; `:146` | Slug retirement is collective; `no-closure-in-phase-0` → `no-judgement-in-phase-0` and `red-witness-is-open` → `every-red-accounted-for` read as **renames** | List old → retired/renamed explicitly | records |
| B7-18 | Info | high | `:36`, `:146`; master `:172` | Round counts disagree: "three consecutive rounds", "five rounds of it", "five rounds". The log shows **four** batches, 3–6, carrying six findings | One number, derived from the log | records |
| B7-19 | Info | medium | `:40` | "the record's date where it carries one" — unstated whether a file-level date header counts | One clause | records |

## Mechanical checks

- **Coverage parity** — 24 obligation rows enumerated and asserted by AC2; 21 F-id rows; six split rows identical across master `:29`, req 2 `:52` and AC2; eight pinned columns asserted.
- **Deferral-ledger consumer row** — master `:76` matches req 2's grouping 1:1 and does pick up what Phase 0 puts down, *except* the absent-standard fact Phase 0 never records (B7-8).
- **Closure** — Files table 9 rows ↔ T1–T7 both ways; agents exist; handoff contracts name all five documents; Reachability present with its ledger row; Least confident probes cleanly.
- **Task ordering** — T1 → T3/T4 → T6 → T2 → T5 → T7 fully pinned.
- **Number provenance** — the 23-file glob verified by listing; 13–21 days cited; only the round counts are unsourced (B7-18).
- **Closure-class re-check** — no path in the text records closure; no green witness promotes anything; `witness observed` carries no verdict by construction. The batch-5/6 gain is preserved.
- **Populations** — three gating populations are discovered rather than listed: the per-row record set (B7-1), the per-row code-read and witness sets (B7-9), and the customer-document set for rows (22)/(23) (B7-11).

## Verdict

**NOT READY**

The redesign did the hard part — the status column is gone, and nothing Phase 0 can write records closure or lets a green unit test promote a claim. It is **not clean enough to execute**. The judgement did not disappear with the column; it moved into *which records go in the cell* and *what shape each record has*, and both are less reproducible than the three-word column was, because the column at least had precedence rules while these have none. The plan's own worked example is the proof: row (7) has a broken path, a paraphrase past its record's words, a second record outside the enumerated search list, and at least two more records in a listed source that the example silently leaves out. Alongside that, two instructions to write the retired vocabulary survived the rewrite, and both ACs that enforce the invariant are unsatisfiable as literally written.

Fix order: (1) B7-1 + B7-11; (2) B7-2 + B7-3; (3) B7-8; (4) B7-6 + B7-7; (5) B7-4 + B7-5; (6) B7-9 + B7-13; (7) B7-10, B7-12, B7-14–B7-19. B7-1–B7-9, B7-11 and B7-13 change what Phase 0 records (§9 row 4) and owe a fresh evaluation.

---

*Batch 8 — sixth owner-approved extension (2026-09-15), scoped to the batch-7 fixes. Generalist `plan-reviewer`, sole slot; model inherit, "think hard", read-only tools; no Bash. Recorded by the orchestrator; the findings table, closure check, simulation and verdict are verbatim, the mechanical section condensed. Commands run: none.*

# Plan review — creator-ready Phase 0 — batch 8

**Readiness: Not yet · Grade: C · The mechanics are genuinely repaired — every glob, citation and count I checked resolves — but the register's central cell still is not reproducible: the plan's own worked example cannot be produced by the plan's own pinned search, one row's term set returns nothing where the record demonstrably is, and one of row (7)'s own records carries both shape vocabularies with no tie-break.**

Counts: 17 findings — 0 High, **7 Medium**, 8 Low, 2 Info. Batch 7: 19 findings — **11 fully closed, 6 partly, 2 residual-only**.

## Batch-7 closure check

**Fully closed (11):** B7-3 (verbatim quotation only); B7-4 (whole-cell scans satisfiable, the "open" in `respin-finish-open-items.md` explicitly handled, `none (owner §3 obligation)` defined); B7-6 (no `state` anywhere in the T2 row); B7-7 (Edge Cases reads `no record found`); B7-10 (the worked-example path resolves and reads "walks 4, 5 and 8 need a provisioned S3 bucket, IAM roles and a real restore host"); B7-12; B7-13; B7-14; B7-15; B7-16; B7-19.

**Partly (6):** B7-1 — term sets pinned, sources enumerated, "every hit accounted for" added, but the bearing judgement survives in the closing section's name (B8-2), the worked example contradicts the pinned search both ways (B8-1), and no term set was validated against its sources (B8-4). B7-2 — keyword definitions, plan-is-not-a-claim generalised, narrower-item clause, "justified by the quoted words" all in; no rule for a record containing **both** vocabularies, and row (7) has one (B8-3). B7-8 — the ninth column exists and AC5 costs from it; its three forms cannot express what settles rows (7), (8), (15) or any F-id row (B8-6). B7-9 — six code globs pinned and **all six resolve to real file sets**; F-id rows (21 of 45) get no glob and the witness filter is ambiguous (B8-5, B8-11). B7-11 — the 10b-1 review is in, row (24) states its exception, code/copy globs added; SQ-P2 T1 and T5 still missing (B8-8), row (24)'s exception excludes the third drifting number (B8-9). B7-18 — `:3` is now correct; `:36` and master `:188` still disagree (B8-15).

**Residual-only (2):** B7-5 closed for the named collision; "whole-cell-value rule" has no referent in a prose document (B8-17). B7-17 — the five status slugs are listed retired-not-renamed, but two *other* slugs changed silently in the same edit (B8-12).

## Row simulation

| Row | Same cells? | What was verified |
|---|---|---|
| **(7) deletion-journal provisioning** — the worked example | **No** | Terms *deletion journal, provision, R-124, S3* return **five** hits in `respin-finish-open-items.md` (`:349`, `:359`, `:405`, `:421`, `:440`), **18** in `respin-finish-phase-10b-1.md`, **12** in the review. The example names `:405`, `:349`, `:433`, `10b-1:172`, `review:142`. `:433` contains **none** of the four terms yet AC2 mandates it; `:359` and `:421` **are** hits and appear nowhere. And `:359` reads "**CLOSED** by design, not **deferred**" — both shape vocabularies, no tie-break |
| **(1) admission on signup** | **No** on records, **Yes** on code | The code glob resolves to a real 12-file list (`respin/packages/auth/src/*.ts` → 7 incl. `allowlist.ts`, `create-auth.ts`; `respin/app/(auth)/**/*.tsx` → 5) — B7-9's named defect genuinely fixed here. But *invite* returns 7 hits in open-items and 16 in the 10b-1 plan, almost all auth-mail quota work, with no rule for where they land |
| **(16) content minimisation** | **No — and wrong** | Terms *minimisation, minimise, redact* return **zero** matches in the enumerated 10a card, whose title is "…**content-safe** observability" and whose `:39` records the deferred 90-day identifier scrub. The repo's word is "content-safe"; the owner's §3 word is "minimiz**ation**" (`02_Remediation_Plan.md:56`). The term set uses neither |
| **(22) customer-document placeholders** | **Partly** | The population is a real list — `respin/app/(marketing)/**/*.tsx` resolves to 7 files. But the term `` `[check]` `` is a regex character class: greped as written it matches any line containing c, h, e or k |
| **(24) Docker-suite count drift** | **Yes on content** | Glob verified: exactly **23** files — 14 `packages/db/tests`, 7 `packages/credits/tests`, 1 `packages/config/tests`, `tests/pg-boss.docker.test.ts`, as pre-stated. `docker-compose.yml:15` reads "the **nine** .docker.test.ts suites" |
| **(12) billing configuration** | **Yes** | Still the one fully pinned row |
| **F-02 (split row)** | **Routing yes · records yes · code/witness no** | Receiving cell derives exactly from master `:29`; JF-P1 T3 at `:104`, T5 at `:106`. Shapes now mechanical. But F-id rows have no code glob, their witness filter matches no test filename, and no "what is missing" form says "scheduled in SQ-P1 T1" |
| **F-06 (non-phase)** | **Yes — genuinely fixed** | `respin-journey-fixes-audit.md:29` carries no claims-met and no asserts-gap keyword → `neither`, deterministically |

The audit carries exactly **21** `| F-NN |` rows.

## Findings

| ID | Sev | Conf | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|---|
| **B8-1** | **Medium** | high | `:40,44`; AC2 `:144` | **The worked example still cannot be produced by the rule it illustrates** — third batch running. `:433` is not a hit of any of the four terms; `:359` and `:421` are hits and are absent | Derive the example from the search: add the term that yields `:433` (e.g. *restore drill*) or route it to row (8), and list the hits the search actually returns | **built** |
| **B8-2** | **Medium** | high | `:40`; AC2 `:144` | **The relevance judgement moved one level down, into the closing section's name.** No rule for a hit of row R's term that bears on row S. Proof: `open-items.md:440` ("Sentry and PostHog accounts are **not provisioned**") is a hit of row (7)'s *provision* **and** row (15)'s *collector*, and bears on (15). Three dispositions all satisfy AC2; one is false | A hit is recorded in **every** row whose term set returns it; rename the section "hits returned by no row's term set" so it needs no bearing judgement | **built** |
| **B8-3** | **Medium** | high | `:41–43`; `open-items.md:359` | **No tie-break for a record carrying both vocabularies — and row (7) owns one.** `:359` contains `closed` (⇒ claims-met) and `deferred` (⇒ asserts-gap). Separately the narrower-item clause silently overrides the keyword rule for `:405`, and "narrower" is itself unruled | Both vocabularies ⇒ `neither`; state the narrower clause as an override; define narrower as "names a sub-item identifier the row's obligation text does not" | **built** |
| **B8-4** | **Medium** | high | `:57` row (16) | **A pinned term set that returns nothing where the record is.** Nothing requires a term set to be checked against its sources before it is pinned — they are recorded as "the search that finds the records", unverified (golden rule 1) | Validate every term set against its known records and record the check; add *content-safe*, *minimization*, *scrub* to row (16) | **built** |
| **B8-5** | **Medium** | medium | `:57`, `:46`; AC2 | **B7-9 closed for rows (1)–(24) only — the 21 F-id rows have no read population**, yet `current-code citation` must be non-empty; their witness filter matches no test filename, so every F-id row deterministically writes `none identified` while `respin/e2e/journeys/*.spec.ts` is its actual witness | Give each F-id row the receiving task's file list as its glob, and the journeys specs as its witness set | **built** |
| **B8-6** | **Medium** | medium | `:47`; AC5 `:147` | **The three forms cannot express what settles the rows that most need settling.** Rows (7)/(8)/(15) are settled by a live external action (`10b-1.md:172` "provisioning approval plus production restore walk"; `open-items.md:440`), which is not `run <suite>`, not `re-read <path>`, and only awkwardly `owner input:`. F-id rows' true answer fits none. AC5 costs the estimate from this cell | Add `external action: <named action>` and `scheduled: <plan task>` | **built** |
| **B8-7** | **Medium** | medium | `:40,44`; AC2 | **The rule makes T2 a several-hundred-quotation deliverable and nothing says so.** One source alone (`10b-1.md`): row (8) *restore* **29** hits, row (10) **27**, row (7) **18**, row (1) **16**, row (14) **12**. Across 13 sources × 24 rows plausibly **600–1,200 lines**, each owing a verbatim quotation + `path:line` + date + shape. T2 is one of seven tasks, with no size statement anywhere in the phase | Bound it (quote verbatim only the hits recorded as records; list the remainder as `path:line + term`), and state the expected volume | **built** |
| B8-8 | Low | high | `:54` vs master `:29` | The source list omits SQ-P2 T1 (F-18's paid half) and SQ-P2 T5 (F-21's forwarder line) | Add both | records |
| B8-9 | Low | high | `:57` row (24) | Row (24)'s exception excludes the third drifting number: `respin-finish-master-plan.md` "twelve" at `:176`/`:188` | Add that file to row (24)'s population | records |
| B8-10 | Low | medium | `:57` row (22) | `` `[check]` `` is a regex character class, not a literal | Say it is matched literally (`rg -F`) | records |
| B8-11 | Low | medium | `:46` | The witness filter does not say filename or content; filename-filtering row (7) returns `deletion-journal-s3.test.ts` via *S3* but nothing via *deletion journal* (files are hyphenated) | One clause: filename match, terms hyphen-insensitive | **built** |
| B8-12 | Low | high | `:153` vs master `:176` | **Two invariant slugs changed silently in the batch that fixed B7-17**: `absence-is-an-observation` → `absence-is-an-observation-over-a-stated-population`, and `evidence-recorded-whole` is gone from Risk coverage with no retirement note | Extend the retired/renamed list to both | records |
| B8-13 | Low | medium | `:49` | The overlap population is discovered, not listed — no pair enumerated, though the cell exists "so the receiving phase schedules it once" | Enumerate the pairs, or say the set is pinned and empty | **built** |
| B8-14 | Low | medium | `:48` | One dirty flag per row, many citations per row, in different files with different dirty states | Dirty flag per citation | records |
| B8-15 | Info | high | `:36`; master `:188` | Round counts still disagree with the log; `:3` is the correct statement | One number, from the log | records |
| B8-16 | Info | medium | `:61` | A plan-body citation not root-relative after B7-16: `app/(product)/studio/run-copy.ts:35-39` | Prefix it | records |
| B8-17 | Low | medium | AC5 `:147` | AC5 applies "the same whole-cell-value rule as AC2" to prose documents with no cells | Scope it: "no sentence in the estimate or card asserts a status for a register row" | records |

## Mechanical consistency

Coverage parity ✅ (24 + 21 rows; the audit carries exactly 21 `| F-NN |` rows; the six split rows identical across master `:29`, req 2 `:59` and AC2 `:144`; AC2 checks all nine columns). Deferral-ledger consumer row ✅ (matches req 2's grouping 1:1; row (24)'s deliberate absence stated with its home). Files-table closure ✅ (9 rows ↔ T1–T7 both ways, no orphan either direction). Agents ✅. Task ordering ✅ (T1 → T3/T4 → T6 → T2 → T5 → T7). Citations that resolve ✅ — all opened, including `respin-finish-phase-10b-1-review.md:142`, `10b-1.md:172`, `respin-journey-fixes-phase-1.md:104,106`, `-phase-3.md:83,85–87`, `respin-service-quality-master-plan.md:14`, `02_Remediation_Plan.md:53-57`; **all six code globs return non-empty, plausible file sets**. Number provenance ✅ (23-file glob verified by listing, the 14/7/1/1 split exact; `docker-compose.yml:15` "nine" verified; 13–21 days cited to §10) — only the round counts unsourced. Scans satisfiable ✅ (B7-4 and B7-5 genuinely closed). Populations — code globs ✅, documentary sources ✅ (two omissions), term sets ✅ lists but **unvalidated**, witness candidates ambiguous, F-id read/witness sets **absent**, overlap pairs **absent**. Invariant slugs — eight named, none duplicated; two changed silently. Least confident ✅ (probes cleanly, the blocked variant carried through T1, T3, AC3 and Edge Cases). Reachability ✅ (names Phase 1, with its ledger row at master `:77`).

## Verdict

**NOT READY**

**Is this executable?** Six of the nine deliverable-shaping columns are. The baseline manifest, the config/offer comparison, the reference matrix, the entry-gate record, the routing table and the mechanical scaffolding are all executable from the plan text alone — every one resolved against the repo and they hold. **The `records found` cell is not.** Row (7), the row the plan works out in full, still cannot be produced by the plan's own pinned search; row (16)'s term set returns nothing where the record is; row (7) contains a record no shape rule can classify. Those are the same three properties batch 7 named, one layer further down.

Ordered fixes: (1) B8-2 + B8-1 — make the hit-to-row mapping mechanical, then re-derive the worked example from it; (2) B8-4; (3) B8-3; (4) B8-6 + B8-5; (5) B8-7; (6) B8-8–B8-14, B8-17; (7) B8-15, B8-16. B8-1–B8-7, B8-11 and B8-13 change what Phase 0 records (§9 row 4) and owe a fresh evaluation.

**Would another round converge?** On the mechanics, yes — it already is: 19 → 17 findings, 9 → 7 Medium, 11 of 19 fully closed, and the half I could break in batch 7 by pulling on globs and citations no longer breaks. On the register's central cell, my honest read is **no**, and this round adds a new reason rather than repeating the old one. Each redesign has made the record set more *specified* without making it more *derivable*, and the cost has risen with each: the rule now demands on the order of a thousand verbatim quotations, and its only relief valve — "hits bearing on no obligation" — is the same relevance judgement the redesign was meant to remove, now applied line by line instead of row by row. The pattern across batches 3–8 is that specifying the judgement harder relocates it; the routing table, which asks for no judgement, has verified clean for six consecutive batches. The owner has decided to continue, and that decision is theirs and is not re-opened here — but if the next round is authorised, the finding most worth fixing first is B8-2, because it is the one that decides whether the remaining six are wording or structure.

---

*Batch 10 — eighth owner-approved extension (2026-09-15), scoped to the terminal citation fix and the removal-debris sweep. Generalist `plan-reviewer`, sole slot (Phase 0 touches no Critical Path, gate-rules §1); model inherit, "think hard", **read-only as a hard precondition** — Read/Grep/Glob only, no Bash of any kind. Reviewer reports "Commands run: none." Recorded by the orchestrator; findings table, row simulation, mechanical section and verdict verbatim. **This section exists because batch 9's did not** — that report was returned in-session and never appended, so seven of its findings are unrecoverable; see the master plan's batch-9 disposition.*

# Plan review — creator-ready Phase 0 — batch 10

**Readiness: Not yet · Grade: D · The two citation columns are genuinely mechanical for the first time in five redesigns — but three enumerations were never written down, so 3 of 45 rows cannot be filled at all and 18 more leave one cell to the engineer's choice.**

This is a materially different D from batch 9's. Batch 9's finding was *the design relocates the judgement*; nothing here says that. Every finding below closes by writing a list, not by redesigning a cell.

Counts: **20 findings — 3 High, 6 Medium, 8 Low, 3 Info.**

## Findings

| ID | Sev | Conf | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|---|
| **B10-1** | **High** | high | `creator-ready-phase-0.md:42`; AC5 `:152` | **The settling form is pinned for 8 of 24 obligation rows; 18 are a free choice.** `:42` assigns `owner input:` to (1)–(3), `external action:` to (7), (8), (15), `scheduled:` to "every F-id row, **and any obligation row a plan already schedules**". Rows (4)–(6), (9)–(14), (16)–(24) choose among `run <suite>` / `re-read <path>` / `scheduled:`. Row (9) *autopsy scrub residual*: engineer A writes `run …deletion-executor.docker.test.ts`, engineer B writes `re-read …deletion-executor.ts` — both pass AC2. The relief clause is itself the judgement: "already schedules" doesn't say which plan, or whether a Deferral Ledger row counts (row (24)'s home is "an owner-assigned track", not a task). AC5 costs the estimate from this cell, so the fork propagates into T5 | Pin the form per row as a column in the group table, or state a deterministic precedence (witness suite exists ⇒ `run`; else named plan task ⇒ `scheduled`; else the enumerated `external action`/`owner input`; else `re-read <the population>`) | **built** |
| **B10-2** | **High** | high | `:61`; AC2 `:149` | **The F-id read population names an input the plan never supplies.** "the receiving task's own file list" — but a receiving *task* is named only for the six split rows. F-03, F-04, F-07–F-11, F-13, F-14 route to a phase via the defining set with no task; F-01 and F-12 via the journey-fixes rule with no task; **F-06 (`none — operator note`) and F-15/F-16 (`outside programme`) have no receiving task at all**, so their `current-code citation` cannot be written while AC2 requires eight non-empty columns. F-02 and F-17 each route a half "via JF-P1" with no task number. The one register that *does* carry a per-row task — `docs/progress/respin-journey-fixes-audit.md` (`:35` "Phase 2, T1"; `:40` "Phase 1, T4") — is cited nowhere in the phase plan | Cite the audit's disposition column as the task source; pin `none (no receiving task)` for F-06, F-15, F-16; give F-02/F-17's halves their task numbers | **built** |
| **B10-3** | **High** | high | `:41`; AC2 `:149` | **Every F-id witness cell is mislabelled by construction.** The F-id witness population is `respin/e2e/journeys/*.spec.ts`, which T6 can never report: `pnpm -C respin test` is `vitest run` (`respin/package.json:29`) and `respin/vitest.config.ts:10-14` includes only `tests/**`, `packages/**/tests/**`, `worker/tests/**`; Playwright is `test:e2e` (`:45`), which T6 does not run. The vocabulary then forces `result not locatable in transcript` ("a transcript that exists but does not name the file") for four suites whose true state is NOT RUN — the exact present-and-unrun / present-and-verified collapse this phase pins as a governing lesson at `:25`. Honest engineers split between the two values on all 21 rows | Add the fourth case: a file outside the gate's include set reads `NOT RUN (not in the entry gate)` — or give F-id rows `none identified` | **built** |
| **B10-4** | Medium | high | AC2 `:149` | **AC2 fails every register that satisfies it.** The ban is a substring test — "no cell **contains** … the words 'appears to implement' or **'absent'**" — while the same criterion mandates "every 're-checked against P1' cell reads **`not yet (P1 absent)`**" on all 45 rows. Second branch: `:59` requires row (24)'s citation to state that three sources say two / nine / twelve against a tree of 23 — a *finding about the files*, banned by the same sentence | Scope the ban to `current-code citation` and `witness observed`, exempt the pinned `not yet (P1 absent)` literal, and declare row (24)'s citation the stated exception | **built** |
| **B10-5** | Medium | high | `:58` | **B9-3's shape survived the re-derivation, in the customer-documents group.** `respin/app/(marketing)/**/*.tsx` (7) excludes the files rows (22)/(23) are about — all three sit in that same directory as `.ts`: `pricing-copy.ts` (the numbers `respin/tests/landing-pricing.test.ts:15,52,79` pins to `CONFIG_V1_SEED`), `audiences.ts` (the `/for/<slug>` content SQ-P2 T3 reads at test time), `changelog/entries.ts`. Row (23) also names **checkout**, whose copy is `respin/app/(product)/settings/billing/billing-view.tsx` — outside the population entirely, though the plan routes that half to Phase 3 | `respin/app/(marketing)/**/*.{ts,tsx}` (10) + the billing view/page for row (23), counted on the date | **built** |
| **B10-6** | Medium | high | `:56` | **The one row about the seed cannot cite the seed.** Row (13) is the owner's "seeded tier/add-on concern" (`02_Remediation_Plan.md:55`); its citation is pinned to T3's query, which reads the **active** config from `config_versions`. `CONFIG_V1_SEED` lives in `respin/packages/db/src/seed.ts`, which appears in no population in the register | Give row (13) `seed.ts` as a file population beside the query | **built** |
| **B10-7** | Medium | medium | `:49`; AC2 `:149`; Verification step 4 `:142` | **B8-7's volume returned in a new currency, still unstated.** AC2 requires each citation to carry "the file set it resolved to and its count", and populations repeat per row: deletion 5 × (30+23) = 265 path entries, telemetry 7 × 30 = 210, admission 51, billing 144, scope/plan 30, customer docs 22, row (24) 26 — ~750 before the 21 F-id rows. Step 4 then requires every citation `Read` in-session (~200 distinct files). Nothing says whether a row may cite its group population *by name* instead of re-listing it — itself a reproducibility fork | Row cites the group population by name + count; file lists appear once in a populations appendix; state the expected size | **built** |
| **B10-8** | Medium | medium | `:43` | `cited at` is "per citation rather than per row", but a citation is now a 4–40-file population with possibly mixed dirty states (the F-id witness set is four specs, two of which `:29` calls uncommitted). One flag per population, or 53 flags on each deletion row — both readings satisfy AC2 | One flag per population plus the named dirty members | **built** |
| **B10-9** | Medium | medium | AC5 `:152` | AC5 forces **every** row into *verification/review* or *external dependencies* and forbids a zero — but a `scheduled: <plan task>` row (all 21 F-id rows, plus any obligation row a plan schedules) is *existing remediation*, already costed inside Phase 1/2/3's own plans. The estimate is required to double-count them in the wrong category | Route `scheduled:` rows to *existing remediation*, cross-referenced, permitting "carried by `<plan task>`, not re-costed here" | **built** |
| B10-10 | Low | high | `:3` | The Status line contradicts itself in one paragraph: opens "pending batch 10 … Batch 9 graded the routing table D", closes "**Round history: batches 0–8** … Not executable until a **batch-9** verdict reads Ready." Plus the orphan fragment "Earlier: (owner-approved 2026-09-15)." | One round history, one pending batch; delete the fragment | reads |
| B10-11 | Low | high | master `:93` | Risk Assessment still reads "its register is an **inventory of what the repo says about each obligation**" — records-era language, one bullet below B9-10's fix. The worst of the four debris sentences | Rewrite to the routing table | reads |
| B10-12 | Low | medium | master `:218` vs phase `:57` | The disposition says the telemetry list names "**the three** authorities the old glob excluded"; the phase plan says "**The first four** are exactly the authorities the removal's glob excluded" | One number, matching the list | reads |
| B10-13 | Low | high | `:74` | Still "every **record** and code citation in it was opened during this phase", two clauses before "the register reads **no historical item at all**" | Drop "record" | reads |
| B10-14 | Low | medium | `:158` | The slug `absence-is-observed-over-a-stated-population` is glossed "(a code check is recorded as if it covered more than the files it read)"; no code check is recorded any more. **Re-word the gloss, do not rename the slug** — `:160`'s retirement list and any workflow binding match it by exact string | Re-word the gloss only | reads |
| B10-15 | Low | medium | `:29` | The fixed-facts line asserts two uncommitted journey specs (`solo-creator.spec.ts`, `studio-operator.spec.ts`); this session's opening `git status` lists only `respin/packages/db/tests/migration-shape.test.ts` as modified under `respin/`. The line hedges "illustrative, not exhaustive" but names two files as dirty the snapshot calls clean, and that flag feeds `cited at`. I could not re-run git (read-only), so verify before editing | Re-read `git status` and correct | reads |
| B10-16 | Low | medium | `:83` vs `:45`/AC2 | The P1-arrival Edge Case says the cell "gains a P1 citation", while `:45` pins it to `not yet (P1 absent)` "on every row" and AC2 requires that literal. P1 arriving mid-phase makes AC2 unpassable | State which wins | reads |
| B10-17 | Info | — | `:59` | Row (24)'s first source is "`CLAUDE.md` Commands 'two'" with no line number; every other citation in scope carries one | Add it | reads |
| B10-18 | Info | — | master `:200`/`:202`/`:212` | "Gate state after batch 9" sits above "Gate state after batch 8" and above batch 9's own verdict row. Since batch 9's report was never appended (Grep for `batch[ -]?9|B9-[0-9]` across `docs/progress/` returns no file), this log is its only record, so ordering is load-bearing | Order the blocks | reads |
| B10-19 | Info | — | `:49` vs `02_Remediation_Plan.md:38-41` | "re-derived from the owner's own authority list" is broader than the derivation: line 39's *Generation and handoff* paths (`app/(product)/studio/actions.ts`, `packages/modes/src/{modes,pipeline,output,traceability}.ts`) and line 38's `infer-voice.ts` / brain-interview schemas appear in no population | Scope the claim, or widen the populations | reads |
| B10-20 | Info | — | `:164` | *Least confident* is still the `SELECT` permission, unchanged across five redesigns of T2, while T2's cells are what failed every round | Re-point it at the register | reads |

## Row simulation — would two engineers write the same cell?

Columns: obligation · current-code citation · witness observed · what is missing · cited at · audit F-id · receiving phase · P1.

- **(7) deletion-journal provisioning** — ✅ obligation · ✅ citation: 30 files, verified exact (10 `deletion-*.ts` + 20 `worker/*.ts`) · ✅ witness: 23, verified exact (8 + 15) · ✅ missing: `external action:` pinned for this row · ⚠️ cited at (B10-8) · ✅ F-id · ✅ Phase 4 · ✅ P1.
- **(9) autopsy scrub residual** — same 30 / same 23, but ❌ **what is missing**: engineer A writes `run …deletion-executor.docker.test.ts`, engineer B writes `re-read …deletion-executor.ts`; both pass AC2. B10-1 in its sharpest form — the row shares five cells with (7) and diverges on the one cell AC5 costs from.
- **(16) content minimisation** — ✅ citation: 25, explicit list; the three authorities B9-3 named (`telemetry-sinks.ts`, `lib/telemetry.ts`, `app/(product)/safe-log.ts`) are now *inside* it — **the old glob's false-absence defect is genuinely closed** · ✅ witness: 5, all inside the vitest include set · ❌ what is missing · ⚠️ cited at · ✅ rest.
- **(12) billing configuration** — ⚠️ citation: "T3's query **and its result**" — the full config JSON, or a pointer to `00-config-offer-comparison.md`? unpinned · ✅ witness 40 · ❌ what is missing · ✅ `n/a (query)` · ✅ F-12 pair named · ✅ Phase 3 · ✅ P1.
- **(13) seeded tier/add-on** — ❌ citation (B10-6) · ✅ witness 40 · ❌ what is missing · ✅ rest.
- **(24) Docker-suite drift** — content verified exact: 23 files = 14 db / 7 credits / 1 config / `tests/pg-boss.docker.test.ts`; `respin-finish-master-plan.md:182` "all 12 concurrency suites"; `docker-compose.yml:15` "nine"; CLAUDE.md "two". But ⚠️ the cell **is a finding about the files**, which AC2 bans (B10-4) · ✅ witness `none identified` · ❌ what is missing · ✅ ledger drift row as receiving home.
- **F-02 (split)** — ❌ citation (B10-2): three halves; the included-build half routes "via JF-P1" with no task number, the re-ask half has no task at all · ❌ witness (B10-3) · ⚠️ missing: `scheduled:` — which of three tasks? · ✅ receiving phase derives exactly from master `:29`.
- **F-17 (split)** — ❌ citation (B10-2) · ❌ witness (B10-3) · ✅ receiving phase: SQ-P2 T4 at `respin-service-quality-phase-2.md:86` really does build the journeys CI job, although that plan's header `:4` does not list F-17 — **the override clause is doing real work and is correct**.
- **F-06 (non-phase)** — ❌ citation: no receiving task exists, and AC2 demands non-empty · ❌ witness · ❌ `scheduled: <plan task>` unfillable · ✅ disposition `none — operator note` derives cleanly.

**Score: 5 of 8 columns reproducible on every row; 6.5 of 8 on the 24 obligation rows; 5 of 8 on the 21 F-id rows. The two columns that broke four consecutive designs — `current-code citation` and `witness observed` — are now exact for every obligation row. That is the real result of this batch.**

## Mechanical consistency

**Population counts — all 14 re-listed with `Glob`, all exact:** admission read 7 + 5 = **12** ✅; admission witness **5** ✅; scope/plan read **4** ✅, witness **6** ✅; deletion read 10 + 20 = **30** ✅ (note `worker/*.ts` includes `vitest.config.ts`; the count is right, the gloss "the worker's own modules" is loose), witness 8 + 15 = **23** ✅; billing (14) read 22 + 2 = **24** ✅, witness **40** ✅; telemetry read 5 + 20 = **25** ✅, witness **5** ✅; customer docs read **7** ✅, witness **4** ✅; row (24) **23**, split **14 / 7 / 1 / 1** exactly as pre-stated ✅; F-id witness `e2e/journeys/*.spec.ts` → **4** ✅ (but see B10-3 — the gate never reports them).

**Citations:** `respin-finish-master-plan.md:182` ✅ — slice 7's row, reads "all 12 concurrency suites"; **B9-9 closed**, the `:176,188` citation gone from both places. `02_Remediation_Plan.md:38-41` ✅ — the four "Starting points" rows; caveat filed as B10-19. Also opened and confirmed: `docker-compose.yml:15` "nine"; `02_Remediation_Plan.md:43` and `:53-57`; `trend-source.ts:1,9-10`; `run-copy.ts:35-39`; `respin-service-quality-master-plan.md:14`; all five phase headers `:4`; `journey-fixes-phase-1.md:104,106`; `-phase-3.md:83,85-87`; CLAUDE.md's Commands line.

**Deferral Ledger renders** ✅ — the consumer row is four cells in a four-column table; every other row checked at four; its routing matches requirement 2's grouping 1:1. **Coverage parity** ✅ — 24 obligation rows (3+3+5+3+7+2+1) and 21 F-id rows; the six split rows and F-19's disposition identical across master `:29`, req 2 `:63`, AC2 `:149`; the three overlap pairs identical. **AC2's five checks all present**; the whole-cell scan is satisfiable, the *substring* ban is not (B10-4). **Closure** ✅ — Files table 9 rows ↔ T1–T7 both ways; both agents present in `.claude/agents/`; ordering T1 → T3/T4 → T6 → T2 → T5 → T7; Reachability present. **Slugs** ✅ — seven named, none duplicated, none reusing a retired string; both silent renames recorded. **Number provenance** ✅.

## Verdict

**NOT READY · Not yet · Grade D.**

The grade is driven by the rubric, not by the direction of travel: T2 still cannot be executed from the plan text alone — three rows (F-06, F-15, F-16) have a mandatory column that literally cannot be filled, and 18 obligation rows leave one cell to the engineer's choice. That is "at least one task is unexecutable", which is a D by definition.

But read the D correctly. Batch 9's D said *the design relocates the judgement*. Nothing in this batch says that. The residual judgement lives in exactly one column (`what is missing to settle this`) and in two population-definition gaps. Those are absences of a list, not a flaw in the shape.

**Debris sweep: four sentences left, not eleven** — B10-11, B10-13, B10-14, B10-10. Everything else in scope is clean: no cell vocabulary, no shape label, no term set, no search, no `absent:` form survives in requirement 2's rules.

**Would another round converge? Yes — and this is the first batch where I can say that with a reason.** Every one of the twenty findings closes by writing something down: a form per row, a task per F-id row, a fourth witness value, two globs widened, one AC clause scoped. Not one asks the plan to specify a judgement harder, which is what batches 3–9 all had in common.

**The one way batch 11 repeats itself:** if B10-1 is fixed with a *rule* for choosing the settling form rather than a *per-row pin* in the group table, the next round will find the same class one level down. That is exactly how `records found` survived three redesigns — the relief valve became the judgement. Pin the form in the table, row by row, beside the populations. It is 24 cells of typing and it ends the class.

**Fix first: B10-1**, for that reason. Then B10-2 (cite the audit's disposition column as the task source) and B10-3 (add `NOT RUN (not in the entry gate)`). Then B10-4, B10-5/B10-6, B10-7/8/9, then the Lows.

**Standing alternative, unchanged since batch 8:** T1 and T6 — the baseline manifest and the entry-gate record — are what Phase 1's start gate actually requires, and both have been executable from the plan text for eight consecutive batches. T3, T4 and T7 are executable too. **Only T2 blocks, and T5 through AC5.**

## Orchestrator addendum (2026-09-15)

**B10-15 verified and confirmed.** The reviewer could not run git under its read-only precondition and asked for the check. `git status --short -- respin/` returns exactly one line — `M respin/packages/db/tests/migration-shape.test.ts` — and `git status --short -- respin/e2e/` returns nothing. Both journey specs the fixed-facts line at `:29` calls uncommitted are clean in this tree. The finding stands and the line is wrong, which matters because that flag feeds the `cited at` column.

---

*Batch 11 — ninth owner-approved extension (2026-09-15), scoped to the batch-10 fixes. Generalist `plan-reviewer`, sole slot; read-only as a hard precondition. Reviewer reports "Commands run: none." Recorded by the orchestrator; findings, row simulation, mechanical section, verdict and the F-id analysis verbatim.*

# Plan review — creator-ready Phase 0 — batch 11

**Readiness: Not yet · Grade: D · The settling form really is a per-row pin, not a rule — batch 10's warning was honoured and that class is closed — but the fixes landed in requirement 2 and were never propagated to AC2, so 24 of the 45 rows cannot pass the criterion that checks them, and the 21 F-id rows now cite a parked plan's *prospective* file list under a column called "current-code citation".**

Counts: **17 findings — 5 High, 8 Medium, 3 Low, 1 Info.**

**Batch 10's warning, answered first:** the fix is a pin, not a rule wearing a pin's clothes. Requirement 2 is a literal 24-row table with a literal value per row; there is no precedence clause, no "witness suite exists ⇒ `run`", no relief valve. An engineer copies the cell. **That was the one way this batch could have repeated itself, and it did not.** What failed instead is different and mechanical: **the batch-10 edits were made to requirement 2 only.** AC2 — the criterion batch 10 already had to repair once for exactly this reason (B10-4) — was updated in one clause out of five.

## Findings

| ID | Sev | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|
| **B11-1** | **High** | AC2 vs req 2 | **AC2 is unsatisfiable for F-06, F-15, F-16 — the exact failure B10-2's fix was written to end.** Req 2 pins their citation, witness *and* settling cells to `none (no receiving task)`. AC2 absorbed that value in **one** clause (the judgement-word scan) and none of the other three: its citation clause requires the pinned population or the T3 query; its witness clause allows only a pinned population or `none identified`; its settling clause requires "one of exactly five forms". Three rows fail all three | Add the exemption to AC2's citation, witness and five-forms clauses | built |
| **B11-2** | **High** | AC2 vs req 2 | **AC2's witness vocabulary omits the value B10-3 added.** AC2 enumerates `green` / `red` / `NOT RUN` / `result not locatable in transcript`; req 2 pins **`NOT RUN (not in the entry gate)`** for every F-id row. All 21 F-id witness cells fail AC2 as written — and this plan's own history (B10-4) shows these enumerations are read literally | Add the fourth value | built |
| **B11-3** | **High** | the settling table vs the populations table | **The settling table breaks its own constraint 1 on 2 of the 11 `run` rows.** Rows (9) and (10) pin `autopsy-policy.test.ts` and `retention-sweep-fixtures.test.ts`; both exist, but the Deletion-and-recovery witness population is `deletion-*.test.ts` (8) + `worker/tests/*.test.ts` (15) and neither file is in it (the 8 verified by Glob). The register would tell the receiving phase to run a suite the same row's witness column does not list. The other 9 `run` rows check out — (4), (5), (6), (11), (14), (16), (17), (19) all present in their row's pinned witness set | Widen the deletion witness population by those two suites — it is the population that is too narrow, not the pins — and re-count | built |
| **B11-4** | **High** | the F-id read population | **The F-id read population is a plan's *prospective* file list, not current code.** "the file list of the task named in the Disposition column" resolves to journey-fixes task rows whose Files column lists files **to be created**. Verified absent from the tree: `respin/packages/credits/tests/inference-unusable-reply.test.ts` (JF-P1 T3 → F-02), `respin/tests/trends-niche-ui.test.tsx` (JF-P1 T5 → F-05), `docs/runbooks/tier-checkout-protocol-v1-rollout.md` (JF-P1 T1 → F-01). JF-P1 T6's Files cell is literally `none (witness transcript only)`. The column is defined as "the read population and what it returned"; there is no rule for a pinned path that resolves to nothing | Pin the F-id citation to a non-list value, or state that unresolved paths record as `not present on <date>` and drop out of the count | built |
| **B11-5** | **High** | the F-id population paragraph vs audit `:25,50` | **"F-02's and F-17's halves each carry their own task from that column" is false in both instances.** The audit gives F-02 exactly one Disposition value, `Phase 1, T3` (`:25`), while the master plan splits F-02 into three halves. F-17's Disposition is `Phase 1 (activation path), Phase 3 T4 (CI job)` (`:50`) — **the activation half carries no task number at all**, so its citation has no file list and its `scheduled:` value is a free choice between the whole string and `Phase 3 T4`. B10-2's class surviving one level down | Delete the false claim; pin F-17's two cells verbatim; state that F-02's single task covers all three halves | built |
| **B11-6** | Medium | the F-id population paragraph | The Disposition label's resolving document is never named, and it is ambiguous: "Phase 1, T3" is journey-fixes numbering, established only in the master plan's translation paragraph and only for the *receiving-phase* derivation, while `respin-service-quality-phase-1.md` also has T1–T8 and F-02's receiving-phase cell says **Phase 1** — so the read population can land on SQ-P1 T3 or JF-P1 T3, two different file lists. Same for F-05 | One sentence: a Disposition "Phase N, TK" resolves against `docs/plans/respin-journey-fixes-phase-N.md`'s Implementation Tasks table | built |
| **B11-7** | Medium | the populations appendix | The appendix does not cover the F-id rows and the stated size is wrong: "7 read populations and 7 witness populations" omits the 18 F-id read populations, the billing group's second read population (row (13)'s `seed.ts`) and row (24)'s four-source set. The by-name-and-count rule then has no **name** for an F-id population, and the "~200 distinct files" figure excludes every F-id file | Name them, count them in, restate the size | built |
| **B11-8** | Medium | AC2 vs req 2 | **B10-6 and B10-8 not propagated, and they collide on row (13).** AC2 still says rows (12)/(13) carry "the T3 query and its result or `blocked`", omitting `seed.ts`, and pins `n/a (query)` as row (13)'s `cited at` — while req 2 gives row (13) a real file population needing a real dirty flag and scopes `n/a (query)` to **row (12) only** | Propagate both | built |
| **B11-9** | Medium | AC2 vs req 2 | AC2 still requires "**every citation** carries its own HEAD, date and dirty flag", the pre-B10-8 wording; req 2 pins one flag **per population**. The readings differ by up to 53 flags on a deletion row — the exact fork B10-8 was raised to close | Propagate | built |
| **B11-10** | Medium | *Least confident* vs AC2 | **The declared safety net does not exist.** *Least confident* says the two constraints are "both checkable by AC2"; AC2 contains neither check — it verifies only that the cell takes one of five forms. **B11-3 is the proof**: a constraint violation sat in the pinned table through the edit and no criterion would have caught it | Put both checks into AC2, or stop claiming them | built |
| **B11-11** | Medium | the settling table vs the receiving-phase column | **The register's two routing columns will contradict each other on 18 rows.** The `scheduled:` value copies the audit's **journey-fixes** numbering ("Phase 2, T6") while the receiving-phase cell in the same row carries **creator-ready** numbering ("Phase 1"), unannotated. A reader cannot tell which is authoritative | Render it `scheduled: journey-fixes Phase 2, T6` | records |
| **B11-12** | Medium | AC5 | **AC5 mis-files the external work and cannot file three rows at all.** `external action:` is filed under *verification/review*, but rows (7), (8) and (15) are the owner's **external dependencies** by any reading; and `none (no receiving task)` has no category, while AC5 requires every row to appear filed by its form | `external action:` → external dependencies; give the non-form value a home or exempt those three rows | built |
| **B11-13** | Medium | row (7)'s pin vs `respin-finish-open-items.md:405` | **One pin embeds the judgement the phase forbids — the failure *Least confident* admits its constraints cannot catch, with a concrete instance.** Row (7) is pinned `external action: provision the deletion-journal S3 bucket and IAM roles`, which asserts the bucket is **not** provisioned. `open-items.md:405` reads "**S3 templates (item 4)** — **closed** on 2026-09-08 by the R-124 provisioning evidence". Whether that record settles row (7) is the receiving phase's call — the pin has already made it, against a rule that says no cell states a judgement. **Not an argument against pinning: the cost of pinning, already paid once.** Row (15)'s equivalent pin is **sound** (`:440` "Sentry and PostHog accounts are not provisioned … R-126"); row (8)'s could not be falsified either way | Re-pin row (7) to a form that asserts nothing — `re-read` the deletion population, or `owner input:` on whether the R-124 evidence closes it — and name row (7) in *Least confident* as the known instance | built |
| B11-14 | Low | req 2 | "one of exactly **five** forms" vs a table adding a sixth value (`none (no receiving task)`) | "five forms, plus the one sanctioned non-form value" | reads |
| B11-15 | Low | row (24)'s pin | Three paths packed into a `re-read <path>` (singular) form | Say the form admits a path list, or split the value | reads |
| B11-16 | Low | Status line | Still "pending batch 10 … seventh decision set"; the master plan records the eighth set and batch 11 | Refresh | reads |
| B11-17 | Low | row (12) | "T3's query **and its result**" still unpinned — the full config JSON, or a pointer to `00-config-offer-comparison.md`? Batch 10 filed this as ⚠️ and no fix was scoped to it | Pin it | records |
| B11-18 | Info | the deletion read population | The gloss "the worker's own modules" still covers `respin/worker/vitest.config.ts`; count (20) exact, gloss loose | Re-word | reads |

## Row simulation

| Row | Result | Detail |
|---|---|---|
| **(7)** journal provisioning | **8/8 reproducible** | Citation "Deletion and recovery (30)" exact; witness (23) exact; settling pinned; `cited at` → `clean` (the tree's one dirty `respin/` file is in neither population); F-id, Phase 4, P1 ✅. **Reproducible but not sound — B11-13** |
| **(9)** autopsy scrub residual | **8/8 reproducible** | **Batch 10's fork is genuinely closed** — the pin removes the `run`-vs-`re-read` choice. But the pinned suite sits outside the row's own witness population (B11-3): previously ambiguous, now internally inconsistent |
| **(13)** seeded tier/add-on | **6/8** | ❌ citation (req 2 says seed + query, AC2 says query only) · ❌ `cited at` (B11-8). `CONFIG_V1_SEED` verified at `seed.ts:45` |
| **(12)** billing configuration | **7/8** | ❌ citation — "query + its result" still unpinned (B11-17) |
| **(16)** content minimisation | **8/8** | Citation (25), witness (5) all inside the vitest include set, `run respin/tests/telemetry.test.ts` in the row's own witness population. **The cleanest row in the register** |
| **(24)** Docker-suite drift | **8/8** | `CLAUDE.md:72` verified; 23-file glob and its 14/7/1/1 split exact; AC2's declared exception covers the cell; `cited at` correctly fires `dirty: CLAUDE.md` |
| **F-02** (split) | **4/8** | ❌ citation (B11-6 ambiguity + B11-4 non-existent file) · ❌ halves claim false (B11-5) · ⚠️ `scheduled:` contradicts its own receiving-phase cell (B11-11) · ❌ witness fails AC2 (B11-2) · ✅ receiving phase derives exactly |
| **F-17** (split) | **3/8** | ❌ citation — activation half names no task · ❌ settling — two candidate strings · ❌ witness · ✅ receiving phase; the override clause does real work |
| **F-06** (no receiving task) | **8/8 reproducible, 0/3 passable** | All three cells derive deterministically from the audit ✅ — and each fails AC2 (B11-1) and AC5 (B11-12). **B10-2's fix works; the criterion that judges it was not updated** |
| **F-03** (ordinary) | **6/8** | Disposition `Phase 2, T6` real; read population resolvable only via the translation paragraph (B11-6); witness fails AC2; `scheduled:` numbering contradiction |

## Mechanical consistency

**All five named checks verified.** The widened `respin/app/(marketing)/**/*.{ts,tsx}` returns **exactly 10** including the three previously excluded `.ts` files; row (23)'s extra `billing-view.tsx` + `page.tsx` exist; its witness set (4) all exist. `CONFIG_V1_SEED` exported at `respin/packages/db/src/seed.ts:45`, consumed at `:247` — B10-6 lands. **The `NOT RUN (not in the entry gate)` mechanism is true in every part**: `package.json:29` `"test": "vitest run"`, `:45` `"test:e2e": "playwright test"`, `vitest.config.ts:10-14` includes exactly `tests/**`, `packages/**/tests/**`, `worker/tests/**`; the four journey specs sit outside all three — **the label is the honest one, AC2 just does not accept it**. The audit carries a task per F-id row (verified row by row, `:24-54`), and F-06 (`:29`), F-15/F-16 (`:43-44`) really have none; two exceptions — F-01 carries **two** (`T1–T2`), F-17's first half **none**. `CLAUDE.md:72` exact.

**All 14 populations re-listed with Glob, every count still exact.** `scheduled:` constraint 2 holds for every F-id row whose Disposition names a task, if copied verbatim; **`run` constraint 1 fails on 2 of 11** (B11-3). Coverage parity ✅ (24 + 21; six split rows and F-19 identical across master, req 2 and AC2; three overlap pairs identical). Closure ✅ (Files 9 rows ↔ T1–T7 both ways; both agents exist; ordering T1 → T3/T4 → T6 → T2 → T5 → T7; Reachability present). Slugs ✅ (seven, unique, no retired string reused, `absence-is-observed-over-a-stated-population` unchanged). Number provenance ✅ except the appendix size (B11-7). Master plan ✅ (batch-10 disposition, eighth owner decision and batch-11 reservation all present and consistent).

## Verdict

**NOT READY · Not yet · Grade D.** Earned on the rubric: F-17's citation and settling cells cannot be filled from the plan text (B11-5); F-01/F-02/F-05's read populations name files that do not exist (B11-4); AC2 cannot be passed by 24 of 45 rows (B11-1, B11-2).

**State the other half as plainly as the grade: batch 10's one named risk did not materialise.** The settling form is a table of 24 literal values with no rule attached; row (9), the row batch 10 used to demonstrate the fork, is now fully determined. Every population is still exact, the marketing widening is right, the seed citation lands, the witness mechanism is true. **Apart from rows (12)/(13)'s two AC collisions, the 24 obligation rows are executable.**

**Would another round converge?** On the 24 obligation rows — **yes**, and it is nearly there: B11-1/2/3/8/9/10 are six AC clauses and one population widened, and none asks the plan to specify a judgement harder. On the 21 F-id rows — **no, not in this design.** Three batches have each found one layer of the same thing (B8-5 → B10-2 → B11-4/5/6); a fourth will find the next.

## The F-id read population — is it salvageable under "current-code citation"?

**No. The column does not apply to those rows, and the fix chosen was the best available answer to the wrong question.**

What B10-2 got right: the audit's Disposition column **is** the missing input, it **is** in the repo, and citing it closed a real hole — F-06/F-15/F-16 now have a value where they had none. The defect is one layer up, in what the column asks for. `current-code citation` is defined as "the read population and **what it returned**" — a statement about code that exists today. An F-id row's subject is a finding whose fix has not been written; the only file list the repo holds for it is a **plan's Files column**, a list of files the task *will* touch, three verified absent and one literally `none (witness transcript only)`. **"What it returned" is undefined for a population whose members are unborn. No list fixes that, because the list is not the problem.** The tell: the F-id half has failed three batches running on three different inputs — no read population at all, a task the plan never supplied, a task supplying files that do not exist in a numbering the plan does not name. That is the signature of a column being asked for something its source cannot produce.

**What to put there instead, in order of preference.** **(1) A pinned non-list value: `none (not current code — scheduled at <the audit's Disposition value>)`.** Honest, deterministic, needs no external resolution, and reuses the exemption machinery `none (no receiving task)` already requires in AC2 (B11-1) — one clause, not two. The witness cell stays `NOT RUN (not in the entry gate)`, already correct. **This deletes B11-4, B11-5, B11-6 and B11-7 outright.** **(2) If a code pointer is wanted on those rows:** the audit's **Evidence column**, not the plan's Files column — it cites files that exist today (`respin/packages/credits/src/inference.ts:857-884`, `app/(product)/nav.tsx:9-20`, `billing-view.tsx:178-195`), written by someone who had the failure in front of them, per row, already in the repo, and **the only list in this programme that satisfies the column's own definition**. Cost: a `file:line` list rather than a population, so one sentence of accommodation. **Do not mix them.**

## Recommendation

**Not another round on the current design.** Two moves, either one small.

**A. Reduce the F-id rows to what they are.** Option 1 above for all 21 citation cells; keep F-id / receiving-phase / settling / P1; fix AC2's four clauses plus AC5's filing (B11-1, B11-2, B11-8, B11-9, B11-12). Roughly an hour of editing, and it removes four of the five Highs. What remains is B11-3 (widen the deletion witness population by two suites) and B11-13 (re-pin row (7)) — both single edits.

**B. Take the standing alternative, now nine batches old.** Ship Phase 0 as T1/T3/T4/T6/T7. The manifest and entry-gate record are what Phase 1's start gate actually requires, and both have been executable for nine consecutive batches. **The F-id routing T2 is struggling to record already exists**, per row, in `respin-journey-fixes-audit.md`'s Disposition column plus the master plan's translation paragraph — T2 is re-deriving a table the programme already has.

If a batch 12 is approved, scope it to move A plus B11-3 and B11-13, and note: **all seven of the AC findings are edits to AC2 and AC5, not to requirement 2. Requirement 2 is, for the first time in eight redesigns, close to right; the criterion that judges it is one revision behind.**

---

*Batch 12 — tenth owner-approved extension (2026-09-16), scoped to the batch-11 fixes. Generalist `plan-reviewer`, sole slot; read-only as a hard precondition — "Commands run: none" (batches 10, 11 and 12 all clean on this). Recorded by the orchestrator; findings, simulation, verified-clean list and verdict verbatim.*

# Plan review — creator-ready Phase 0 — batch 12

**Readiness: Not yet · Grade: D · The F-id design problem is genuinely dead and every batch-11 fix lands — but the propagation habit struck once more from a different direction: AC2 still demands the resolved file set inside each citation cell (the ~750-path table B10-7 removed), and `cited at` has no pinned value on any of the 21 F-id rows.**

Counts: **18 findings — 2 High, 9 Medium, 4 Low, 3 Info.** Batch-11 disposition: **13 of 13 applied verified, 4 dissolved verified.** Grade D is earned narrowly and differently from batch 11's: **there is no design defect left in this plan.** Every one of the 18 findings is a single-clause edit, and 11 of them are one sentence in requirement 2 disagreeing with one sentence in AC2.

## The question this batch was asked

**"Can a second engineer fill all eight columns on all 45 rows without one free choice, and does AC2 accept every value requirement 2 pins?"**

- **Column-by-column:** 5 of 8 fully pinned (`what is missing`, `audit F-id`, `receiving phase`, `re-checked against P1`, `witness observed` as to its vocabulary). 3 are not: `current-code citation` (form collision, 24 rows), `cited at` (unpinned, 21 rows), `obligation` (no pinning rule anywhere, all 45 rows).
- **Does AC2 accept every value batch 11 pinned? Yes, all of them** — `none (no receiving task)` in all four clauses, `NOT RUN (not in the entry gate)`, `n/a (query)` scoped to row (12), row (13)'s `seed.ts`, the five forms plus the sanctioned non-form value, the per-population dirty flag, row (24)'s path list. **B11-1, B11-2, B11-8, B11-9, B11-14, B11-15 closed.**
- **The defect the batch was told to hunt exists in four places nobody had looked at**, because previous batches only checked clauses they had just edited: the citation *form* (B12-1), row (12)'s pointer (B12-4), the `scheduled:` value shape (B12-5), the F-06/15/16 witness value (B12-7).

## Findings

| ID | Sev | Location | Finding | Fix | Changes |
|---|---|---|---|---|---|
| **B12-1** | **High** | AC2 vs `:77` | **AC2 requires the resolved file list *inside* the citation cell; requirement 2 says the lists live once in the appendix.** AC2: "the glob or list exactly as pinned in requirement 2, **with the file set it resolved to and its count**". `:77`: cites "by name and count … the file lists themselves appear exactly once, in a populations appendix". Grep confirms **AC2 never mentions the appendix or the by-name-and-count rule**. Two engineers write different cells on 24 rows × 2 columns, and the AC2 reading reinstates ~750 path entries — the deliverable B8-7 identified and B10-7 removed. **B10-7 unpropagated to AC2, never previously found** | AC2's citation and witness clauses: "the population by name and count, with its file list in the populations appendix" | **built** |
| **B12-2** | **High** | `:71`, `:77`, AC2 | **`cited at` has no pinned value on any of the 21 F-id rows, and AC2 bars the natural fallbacks.** `:71` defines one flag per population; F-id rows have no read population by construction and `:77` says they "contribute no population of their own". AC2 requires all eight columns non-empty and rules `n/a` appears only as `n/a (query)` or `none (no receiving task)` — so `n/a (no population)` fails, `none (no receiving task)` is false on the 18 rows that have one, and `HEAD + date + clean` is derivable but unpinned and contradicted by `:77` | Pin it: "F-id rows: HEAD and date, with the journey-spec witness population's one flag" — or add a fourth sanctioned value | **built** |
| **B12-3** | Medium | `:38`, `:85`, `:97`, AC2 | **Column 1, `obligation`, is the one column with no pinning rule at all.** For the 24 rows the only text is the group table's parenthetical glosses; for the 21 F-id rows nothing is said, so the cell is the audit's Finding text — bold lead sentence, whole cell, or paraphrase, engineer's choice | Pin the 24 to the group table's labels verbatim and the 21 to the audit Finding cell's bolded lead sentence, copied | records |
| **B12-4** | Medium | `:40` vs AC2 | **Row (12)'s citation: B11-17 applied to requirement 2 only.** Req 2 pins "query + a pointer to its result … never the config JSON inlined"; AC2 still reads "query **and its result**" — the exact ambiguity B11-17 was raised to kill, surviving in the criterion | Propagate | **built** |
| **B12-5** | Medium | `:70` vs AC2 | **The settling table's F-id row was not updated by the verbatim rule.** `:70` still reads `scheduled: <the task in the audit's Disposition column>`; AC2 requires the Disposition **value** verbatim, annotated. They diverge on real rows: **F-01** `Phase 1, T1–T2` (two tasks), **F-17** `Phase 1 (activation path), Phase 3 T4 (CI job)` (first half names no task — the B11-5 hole, closed for the citation cell and left open here), **F-21** `Phase 3, T5 (fixed notes already applied)` (trailing parenthetical in or out). `:70` also shows no `journey-fixes` annotation, AC2 mandates one | `:70` → "the audit's Disposition **value**, copied verbatim, rendered `scheduled: journey-fixes <value>`" | records |
| **B12-6** | Medium | `:91`, AC2 | **B11-11 fixed in one cell and reintroduced in another.** The `scheduled:` cell is annotated `journey-fixes`; the **citation** cell — `none (not current code — scheduled at Phase 2, T6)` — carries the same unannotated journey-fixes number in a row whose receiving-phase cell reads "Phase 1". F-03 is the clean demonstration | Annotate identically, or state once that every `scheduled` string is journey-fixes numbering | records |
| **B12-7** | Medium | `:95` vs AC2 | **F-06/F-15/F-16's witness cell has two admissible values.** `:95` pins the journey specs with `NOT RUN (not in the entry gate)` for all 21; AC2 admits that **or** `none (no receiving task)` on those three. A free choice on 3 rows, created by the B11-1 fix | Scope AC2's exemption to citation + settling only, or re-word `:95` | records |
| **B12-8** | Medium | `:77` vs `:85` | **The cell-format exemplar carries the pre-B11-3 count** — "witness population: Deletion and recovery (**23** files)" against `:85`'s **25**. The one sentence showing the exact cell format contradicts the table it demonstrates | `23` → `25` | records |
| **B12-9** | Medium | `:77` | **The appendix enumeration double-counts and omits.** Row (24) **is** the Documentation-drift group, already one of the seven; row (23)'s two checkout files are in no entry; row (12)'s query is counted as a read population though it has no file list; and "7 witness populations" reconciles only if the journey specs are the seventh — which the next clause denies. The number 9 may be right; the derivation that tells the engineer which lists to write is not | Re-enumerate explicitly | records |
| **B12-10** | Medium | `:29`, `:35` | **A pre-stated value, and it is now false.** Both fix "this tree is on `main` at `3273f36`"; the session's git snapshot is branch **`creator-ready-plan-review`**, HEAD **`b122ac5`**. Requirement 1's own rule is "values recorded as read, **never pre-stated**" | Replace with "as read in T1"; keep the owner's snapshot as the only fixed half | records |
| **B12-11** | Medium | Failure Modes; Verification step 4; `:77` | **The largest execution risk has no failure-mode row.** Step 4 requires ~200 distinct files opened in the same session, alongside 45 rows × 8 columns. The table absorbs Docker down, a denied read and a failing gate; nothing for "T2 could not be completed in one session". A half-filled register is the most likely way this phase ships wrong | Add a row: partial T2 → the register states which rows are unfilled and why; the phase does not claim AC2 | records |
| B12-12 | Low | AC5 | All 21 `scheduled:` rows file under existing remediation "not re-costed here" — but for **F-01, F-12, F-18, F-20, F-21** the carrying plan is the **parked** journey-fixes phase 1/3. Five obligations reported at zero cost against tasks that may never run | AC5: name whether the carrying plan is active or parked | records |
| B12-13 | Low | `:41` vs `:77` | **The per-file witness *results* have no stated home** — 40 results for billing, 25 for deletion: in the cell, in the appendix, or summarised? | Results beside the appendix list; the cell carries name, count and non-`green` exceptions | records |
| B12-14 | Low | `:52`, AC5 | Row (7)'s re-pin is sound but routes the question to the **owner** while the plan's own sentence says it is "the receiving phase's call", and AC5 then costs it as an external dependency | Make the two sentences agree | records |
| B12-15 | Low | `:83`, `:97` | Rows (1), (2), (3) are identical in **all eight columns** except the obligation label. Not a defect — a signal about what the register's row granularity buys | Note it in *Least confident* | records |
| B12-16 | Info | `:91` | The F-17 citation value nests parentheses two deep. Deterministic, unreadable | Colon or quotes | records |
| B12-17 | Info | AC5, `:101` | No settling form maps to *known enhancements*, so that category receives no register row. Correct but unstated, and AC5 requires four categories separated | One clause | records |
| B12-18 | Info | batch-11 report | Batch 11 said constraint 1 "fails on 2 of **11**" `run` rows; the table has **10**. Arithmetic in the prior report, not in the plan | None | — |

## Row simulation

| Row | Result | Detail |
|---|---|---|
| **(7)** | **5/8** | settling ✅ `owner input: whether the R-124 provisioning evidence settles this row` — asserts nothing, **B11-13 genuinely closed**; `cited at` ✅ two flags both `clean`; citation/witness ❌ form (B12-1), witness stale 23 (B12-8) |
| **(9)** | **6/8** | settling ✅ `run …autopsy-policy.test.ts` **now inside its own row's witness population — B11-3 verified closed by Glob**. Batch 10's fork and batch 11's constraint breach both gone |
| **(12)** | **7/8** | citation ❌ req 2 "pointer" vs AC2 "its result" (B12-4); `cited at` ✅ `n/a (query)` correctly scoped |
| **(13)** | **8/8** ✅ | `seed.ts` beside the query in both req 2 and AC2; one real dirty flag, `clean`; `re-read …seed.ts`. **B11-8 closed — the cleanest repair of the batch** |
| **(16)** | **6/8** | strongest obligation row again; only the form fork |
| **(24)** | **7/8** | 23-file glob re-verified with the 14/7/1/1 split; `CLAUDE.md:72` exact; `cited at` correctly fires `dirty: CLAUDE.md`; `re-read` path list ✅ **B11-15 closed** |
| **F-02** | **5/8** | citation ✅ `none (not current code — scheduled at Phase 1, T3)` derivable from audit `:25` alone, one value covering all three halves — **B11-4/5/6 dissolved and verified**; `cited at` ❌; obligation ❌ |
| **F-17** | **4/8** | citation ✅ copied whole from `:50` — **the batch-11 killer is dead**; settling ❌ (B12-5); `cited at` ❌; receiving phase ✅, the enumerated override doing real work |
| **F-06** | **5/8** | citation ✅ and settling ✅ `none (no receiving task)`, **both admitted by AC2 and filed by AC5 — B11-1 and B11-12 closed**; witness ❌ two admissible values (B12-7) |
| **F-03** | **5/8** | **journey-fixes "Phase 2" in the citation cell beside creator-ready "Phase 1" in the receiving cell — B11-11 reintroduced (B12-6)** |
| **F-21** | **5/8** | `Phase 3, T5 (fixed notes already applied)` verbatim in the citation cell ✅; in the settling cell, ambiguous (B12-5) |

## Verified clean

**Deletion witness population returns 25 and contains both pinned suites** (8 + 15 + `autopsy-policy` + `retention-sweep-fixtures`) — **B11-3 closed; the widening, not the pins, was the right fix.** **Constraint 1 holds on all 10 `run` rows**, each verified present in its own row's pinned witness population — **zero violations**. **Constraint 2 holds**: every F-id with a Disposition value has one copyable; F-06, F-15, F-16 genuinely carry none. **The F-id value is derivable for all 21 rows from the audit alone** — including F-02's single value covering three halves and F-17's task-less half — **because and only because the value is copied verbatim and never resolved. The B11-4/5/6 class is closed at its source, not patched.** **Row (7) asserts nothing about provisioning** and `respin-finish-open-items.md:405` reads exactly as the plan quotes it; row (15)'s pin re-verified sound against `:440`. **AC5's categories cover every settling value** — all six homed. **All populations re-listed and still exact** (worker 20, deletion 30, telemetry 25, marketing 10, credits tests 40, docker 23, journey specs 4). **The `NOT RUN (not in the entry gate)` mechanism is true.** Slugs seven, unique, retirement list intact.

## Verdict

**NOT READY · Not yet · Grade D.** Earned: `cited at` cannot be filled on 21 rows, `obligation` on 45, and the citation cell's *form* has two live readings on 24.

**The other half, as plainly:** the thing that killed batches 3–11 is gone. The F-id half is no longer a design problem — the verbatim-Disposition rule made all 21 rows deterministic from one document, and it **dissolved four findings rather than patching them**. The obligation half's settling table survived its second adversarial pass with **zero** constraint violations. Requirement 2 is right. **There is no judgement left anywhere in this design for a thirteenth batch to relocate.**

## Would another round converge?

**Yes — and for the first time, on both halves.** All 18 findings are clause edits. **But a thirteenth reviewer batch is the wrong instrument:**

> Three consecutive batches have found the same failure — a fix applied to requirement 2 and not to AC2 (batch 11: six clauses; batch 12: four more, plus B10-7's rule which has never been in AC2 at all). A reviewer finds these one round at a time, four or five per round, forever. **The instrument that ends it is a propagation table, not a reviewer:** one row per value requirement 2 pins, with a column for the AC2 clause that admits it and the AC5 category that files it. Forty-odd rows, written once by the author. **Every finding in this batch and eleven of seventeen in batch 11 would have been caught by that table before a reviewer saw the plan.**

## The standing alternative — the reviewer's answer

**"No, I would not take it as stated — and I would take something sharper."** Dropping T2 whole discards twelve batches at the moment the design converged.

**But an F-id row's eight cells are: four constants, two verbatim copies of `respin-journey-fixes-audit.md`, one copy of the master plan's translation paragraph, one unpinned — and the obligation text is a third copy of the audit. The 21 F-id rows carry no fact that is not already in two documents this programme has had since 2026-09-15. They are a join, re-typed by hand, that has now cost four review batches.**

Recommended, in order: **(1) cut the 21 F-id rows from T2**, replaced by one routing sentence — deletes B12-2, B12-5, B12-6, B12-7, B12-16, half of B12-3 and the whole remaining F-id surface, **seven of eighteen findings and every one that has ever recurred**; **(2) apply B12-1, B12-4, B12-8, B12-9, B12-10, B12-11**; **(3) build the propagation table** and have the author, not a reviewer, run it; **(4) ship** — T2 becomes 24 rows × 8 columns over 9 populations, a day's work, and it should read **Ready** without a fourteenth batch. If (1) is declined, a batch 13 scoped to the propagation table alone will converge, but it will be the fourth batch spent on rows that re-type a table the programme already owns.
