# Phase 3 — Editorial Skills, Style Profile, Platform Fixture, Local Runner

**Feature:** cutdown · **Depends on:** 2 · **Owner agent:** general-purpose · **Two gates:** implementation-complete / accepted-live

## Project Conventions Pinned (READ FIRST)

*(Identical block to `cutdown-phase-1.md` §Project Conventions Pinned — paste verbatim into the implementing agent's prompt; normative here.)*

Phase-3 additions:
- **Spend gate:** live-model tasks run only after the owner sets the Phase 0 spend ceiling (D-21). Recorded-model fixtures can earn `PHASE_3_IMPLEMENTATION_COMPLETE`, which unblocks Phase 4 and contributes to `PIPELINE_IMPLEMENTATION_COMPLETE`. Only `cutdown test:models --live` against a real indexed job can earn the separately reported `PHASE_3_ACCEPTED_LIVE`; it remains explicitly blocked on D-21/D-27 until satisfied and is necessarily green before `PHASE_0_EXIT_EARNED`.
- Structured output: provider tool-use constrained to the skill's `output.json`; **one repair retry** then structured-error exit (D-32). Model + prompt-template versions recorded in every artefact (PRD §10.6).
- The model **proposes**; deterministic code **validates**. D-37 is authoritative: LLM critic findings are advisory; blocking status comes only from versioned deterministic rules.

## Requirements Checklist (functional)

- [ ] REQ-030, REQ-031, REQ-033, REQ-034, REQ-036; REQ-037 (deterministic quote token order, speaker identity, required context/evidence and prohibited-claim checks); REQ-038 (full critic checklist with D-37 classification); REQ-102 advisory subset; REQ-050 single-platform; REQ-060 and REQ-061 minimal
- [ ] tech-spec §15 step 5 *Done when*

## Requirements Checklist (technical)

- [ ] New schemas as v1 files with changelogs: `creative-brief-v1`, `master-story-plan-v1`, `platform-edl-v1`, `style-profile-v1` (+ regenerate both languages, same commit)
- [ ] Retrieval per D-22: bge-small-en-v1.5 local, brute-force cosine, model ID recorded
- [ ] REQ-152 *Phase-0 subset*: local state names/progress projection, `publishing` present-but-unused; hosted progress exposure deferred
- [ ] Recorded-model fixtures for every LLM skill (§6.6) + live property assertions in a separate non-gating job

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | Editorial schemas + enum additions; regen | `cutdown/packages/contracts/schemas/{creative-brief,master-story-plan,platform-edl,style-profile}-v1.json` |
| 2 | TS model gateway (Anthropic adapter, structured output, one-retry policy, token accounting into run-log) | `cutdown/packages/editorial/src/gateway.ts` |
| 3 | Brief resolver (deterministic validation + missing-field report) | `cutdown/packages/editorial/src/brief.ts` |
| 4 | Moment retrieval: brute-force cosine **over the embedding vectors already stored on Moment artefacts by Phase 2** (D-22); the **query-side** vector (JobBrief promise/audience text) is computed by invoking Phase 2's `embed.py` argv-style (same model + version, recorded) — retrieval math stays pure TS; the one Python call is the query embed | `cutdown/packages/editorial/src/retrieval.ts` |
| 5 | `propose` skill: angle generation → N CreativeBriefs; distinctness metadata (REQ-031); weak-footage refusal output variant (REQ-036) | `cutdown/skills/propose/**`, `cutdown/packages/editorial/src/angles.ts` |
| 6 | `plan` skill: story planner + platform adapter against the **TikTok organic 9:16 AU fixture** (PRD §11 example, D-3, with two offline pins: `duration: {minSeconds: 5, maxSeconds: 180}` replaces `account_capability_lookup` — a fixture, not a registry; the `safeZoneAsset` path is declared but consumed only by Phase 4's QA — Phase 3 `validate` ignores it) → `platform-edl-v1` via EDL resolver with deterministic range validation (Phase 2's `range-check.ts`) | `cutdown/skills/plan/**`, `cutdown/packages/editorial/src/{story-plan,platform-adapt,edl-resolve}.ts`, `cutdown/data/platform-capabilities/tiktok-organic-au-fixture.yaml` |
| 7 | `validate` skill with two separately persisted outputs. **Blocking deterministic rules:** range/timebase, capability, quote token order and speaker identity, required context/evidence links, JobBrief prohibited claims, rights state, and required disclosures. **Advisory critic:** coherence, first-frame legibility, redundancy, context suspicion, abrupt audio, caption overload, style fit, originality suspicion, policy risk, platform readiness. D-37 forbids advisory findings from silently becoming blockers | `cutdown/skills/validate/**`, `cutdown/packages/qa/src/{editorial-checks,editorial-gates}.ts` |
| 8 | Style profiles: schema + 2 hand-authored client profiles (placeholder values until D-26 owner inputs arrive) injected into propose/plan prompts | `cutdown/packages/style/**`, `cutdown/data/style-profiles/*.yaml` (gitignored if client-real; placeholder committed) |
| 9 | Local runner: state machine, resume-from-run-log, `rebuild-index`, `blocked` state on structured-error exits. `better-sqlite3` per D-11; if its prebuild fails on Node 22/Windows, fall back to Node's built-in `node:sqlite` and append the swap to `decisions.md` | `cutdown/workflows/local/src/**`, `cutdown/apps/cli/src/commands/run.ts` |
| 10 | Recorded-model fixtures for propose/plan/validate-critic + live property assertions (non-gating) | `cutdown/skills/{propose,plan,validate}/fixtures/**` |

## Edge Cases & Failure Paths

- Weak footage → refusal object. Schema-invalid twice → blocked. Out-of-bounds → deterministic rejection, never clamp. Reordered quote tokens, speaker mismatch, missing evidence, prohibited claim, unknown rights, or missing disclosure → non-waivable editorial block with cited object/range. Subjective critic concern → advisory finding requiring human review, never a hidden block. Too few Moments → fewer variants + note. Missing style field → declared default/question. Duplicate transitions remain idempotent.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| Anthropic API | 4xx/5xx/timeout | retry policy (transport) + one schema-repair retry (semantic); then structured error → `blocked`; token spend logged even on failure | fixture with injected failure |
| Spend ceiling unset/exceeded | — | live calls refused with escalation message; recorded-fixture path unaffected | gateway unit test |
| SQLite | corrupt/deleted `index.db` | `rebuild-index` from run logs; zero job-state loss | delete-and-rebuild test |

## Handoff Contracts (consumed by Phase 4+)

- `platform-edl-v1` artefacts in `edl/` (Phase 4 renders them); `style-profile-v1` (Phase 4 caption styling); runner states + run-log format (Phase 4/5 skills join the same machine); gateway token-accounting fields (Phase 5 `status` reads spend).

## Verification Steps

1. Phase 2 evidence on disk (indexed job with Moments).
2. `cutdown test:skills propose plan validate` → recorded-fixture suites green.
3. Recorded suites plus deterministic gate fixtures → `PHASE_3_IMPLEMENTATION_COMPLETE`; Phase 4 may begin.
4. With ceiling and real footage set: `cutdown test:models --live`, then propose → plan → validate on `<real-job>` → three schema-valid distinct briefs, all references resolve, and no unexpected blocker; record `PHASE_3_ACCEPTED_LIVE`.
5. `cutdown plan <brief-id> --platform tiktok` → EDL passes range-check.
6. Hand-break fixtures for range, quote order, speaker, evidence, prohibited claim, rights, and disclosure → each blocks with its rule ID; coherence/style fixture remains advisory.
7. Weak-footage fixture → refusal object.
8. Delete `index.db` → rebuild and resume correctly.

## Acceptance Criteria (PASS/FAIL)

- `PHASE_3_IMPLEMENTATION_COMPLETE`: recorded suites, REQ-036 refusal, D-37 deterministic blockers, advisory critic, and runner recovery pass.
- `PHASE_3_ACCEPTED_LIVE`: live command and real-job evidence pass, or the phase is reported `BLOCKED-ON-D-21/D-27` — never ambiguously “complete.”
- Every editorial artefact records model ID + prompt-template version (schema-required fields).
- Runner survives kill + `index.db` deletion with zero state loss (test names).

## Out of Scope

Rendering, captions, QA yaml (Phase 4); package/approve/revise/mirror (Phase 5); multi-platform registry (product Phase 1); learned style tendencies.

## Completion Criteria (Definition of Done)

`PHASE_3_IMPLEMENTATION_COMPLETE` green; `PHASE_3_ACCEPTED_LIVE` green or explicitly `BLOCKED-ON-D-21/D-27`; Cutdown entry gate green; `code-reviewer` PASS; honest report; decisions appended.
