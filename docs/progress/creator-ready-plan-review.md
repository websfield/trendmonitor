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
