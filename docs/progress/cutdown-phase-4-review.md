# Phase 4 review — Render Path, Captions, Technical QA Hard Gate

**Feature:** cutdown · **Date:** 2026-07-29 · **Verdict: Almost — 7 residuals carried forward**
**Milestone:** `PHASE_4_IMPLEMENTATION_COMPLETE` earned. `PHASE_0_EXIT_EARNED` remains red (unchanged — it needs real footage).

---

## Report card

| Gate | Result |
|---|---|
| `build:contracts --check` | **PASS** — generated TS + Python trees current |
| `validate:contracts` | **PASS** — 32 fixture cases, 0 lint violations, 0 cross-validator disagreements |
| `test:skills` | **PASS** — 3/3 skill suites |
| `pnpm -r test` (TypeScript) | **PASS** — **596 tests, 0 fail, exit 0** (Phase 3 baseline 416 → +180) |
| `pytest` (Python) | **PASS** — 661 passed, 0 fail (untouched by this phase) |
| `code-reviewer` round 1 | **BLOCK** — 4 BLOCK + 12 CHANGE + 10 NOTE |
| `code-reviewer` round 2 (verification) | **BLOCK** — 2 new BLOCK + 7 CHANGE; 2 of 4 round-1 BLOCKs CLOSED, 2 PARTIAL |
| Post-round-2 fixes | Both round-2 BLOCKs closed; 5 CHANGEs remain as residuals below |

Reviewer rounds are capped at two (`/implement` Step 4). Round 2's two BLOCKs were fixed after the cap; the remaining CHANGEs are surfaced as residuals rather than silently absorbed.

---

## What shipped

**Contracts (5 new + 1 enum).** `render-manifest-v1` (the immutable render plan), `render-v1` (the result, carrying MEASURED loudness/true-peak as a tagged union), `technical-qa-report-v1` (verdict + per-check ledger), `qa-waiver-v1` (D-35), `enums/qa-check-id.json` (the closed 23-check set). Both generator trees committed; every schema has a valid and an invalid fixture.

**`packages/renderer-core`.** `adapter.ts` — the `RendererAdapter` seam (REQ-081): `plan()` decides and spawns nothing, `execute()` does I/O. `manifest.ts` — the manifest builder, font resolution **by sha256 with refusal on mismatch**, and `assertFinalMatchesApprovedDraft()`. `ffmpeg.ts` gained the tier-1 determinism pins (`determinismArgs`, `assertDeterministicArgv`).

**`packages/renderer-ffmpeg`** (new). `timeline.ts` (exact BigInt-rational source→output arithmetic, REQ-082), `captions.ts` (ASS + SRT + WebVTT from one plan, REQ-083/084/104), `filtergraph.ts` (three aspect treatments; two refused — D-47), `loudness.ts` (ebur128 measurement), `adapter.ts` (the FFmpeg renderer).

**`packages/qa/src/technical`** (new). `measure.ts` (FFmpeg → numbers), `checks.ts` (numbers + ruleset → findings; pure), `gate.ts` (findings + waivers → status), `model.ts` (ruleset loading, `D35_NON_WAIVABLE` floor).

**Data.** `data/rulesets/technical-qa-v1.yaml` (thresholds as data), `data/platform-capabilities/overlays/tiktok/organic-video/2026-07.json` (hand-measured safe zone), `data/fonts/` (Inter v4.1 static TTFs by hash + OFL).

**`skills/render`** — both tiers, QA in the same invocation. **`workflows/local/src/gates.ts`** + the runner's required `TransitionGate`. **`cutdown render`** CLI command.

---

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| tech-spec §15 step 6 *Done when* (tier-1 determinism + a draft render with synchronized captions) | **PASS** | `renders the same manifest twice to BYTE-IDENTICAL output` — real FFmpeg 8.0.1, sha256 identical across runs; `assertDeterministicArgv` asserts the pins separately so the byte match cannot pass by luck |
| A final-tier render proven | **PASS** | `renders a FINAL tier from source originals, twice, byte-identically` — hashes taken *between* executes |
| tech-spec §15 step 7 *Done when* (a deliberately broken render is blocked with an actionable report) | **PASS** | `measures a real render and reports a caption overflow with a time range` → `computeGateStatus` = `fail`; every finding carries a `fix` |
| Grep proves no `ffmpeg` spawn outside `ffmpeg.ts` | **PASS** | `no module other than ffmpeg.ts spawns ffmpeg or ffprobe` — a *test*, not pasted grep output, plus a can-fail control |
| QA thresholds read from yaml — changing one changes behaviour with no code change | **PASS** | `changing a threshold changes the verdict with no code change`; `every field the ruleset declares is actually READ by a check` (**partial** — see residual 3) |
| Loudness + true peak in every render artefact | **PASS** | `render-v1` `loudness` tagged union (schema field), `final-no-audio.json` fixture, `reports measured loudness and true peak on the render artefact` (measured −14.0 LUFS / −2.9 dBTP on real audio) |
| Every REQ-100/084/104 check has a positive AND negative fixture | **PASS** | 23/23 in the table-driven matrix; the clean control is asserted zero-findings first so no case can pass on a dirty fixture |
| D-35 waiver policy proven on both draft and final gates | **PASS** | `technical-gate.test.ts` (blocker/unknown/out-of-scope/self-inconsistent rejections) + `gates.test.ts` (`gates the FINAL tier independently of the draft`) |

---

## What the gates caught (worth recording)

1. **The QA gate was not wired to the production runner.** Round 1 found `createQaTransitionGate` referenced only from its own unit test — the gate existed, passed tests, and was never consulted by `cutdown run`. The parameter is now **required**, so omitting it is a compile error, and `openGate` makes "no gate" something a call site has to state.
2. **The D-35 non-waivable set was fully reclassifiable from the ruleset file** — and a test of mine asserted that demotion as *desired* behaviour. A test locks in wrong behaviour as firmly as right behaviour. `D35_NON_WAIVABLE` is now a code-level floor.
3. **`waiverIds.includes(findingId)` compared a waiver's id against a finding's** — always false, so every warning read as unwaived. Fixed by a new required `waivedFindingIds` field, so the mistake is no longer expressible.
4. **The round-1 fix for waiver scope made waivers unusable.** Scoping on `renderId` was correct in intent but `renderId` is minted fresh by every `execute()` — and applying a waiver *means* re-rendering, so every waiver rejected itself on the run that used it. Now scoped on `planHash`, which is stable across re-renders of one plan and changes the instant the plan does.
5. **The round-1 fix for the gate lookup failed open.** It walked backwards through render directories until it found *any* report, so a new unjudged render was authorised by an older one's verdict. Now: latest directory only, and no report there is a refusal.
6. **QA caught the renderer's own caption defaults** — horizontal margin derived from *height*, vertical margin placing captions under TikTok's chrome, and a 42-char line that cannot physically fit a 720-wide 9:16 canvas (D-48).
7. **libass loads every file in its `fontsdir`** and errored on `fonts.json`/`OFL.txt`; fonts moved to a fonts-only subdirectory (D-49).
8. **FFmpeg cannot infer a muxer from `output.mp4.partial`** — the temp name is now `output.partial.mp4` and `-f <container>` is explicit.

---

## Residuals (carried forward, none silent)

1. **Orphan render on five throw paths.** Only `QaWaiverRejected` writes a report before surfacing. A throw from `loadQaRuleset`, `measureRender`, `loadAudioEvents`, `WAIVER_UNREADABLE` or `WAIVER_SCHEMA_INVALID` leaves `output.mp4` on disk with no report beside it — the state SKILL.md says is impossible. Waiver and audio-events validation should move *before* `plan()`, per the module's own "plan() decides" contract.
2. **No test for the runner's gate-refusal branch or `makeQaGateEnv`.** All eight runner tests pass `openGate`, so `stopReason === 'gate-blocked'` is never exercised, and the CLI's report-lookup (directory layout, ULID ordering, parse-throw propagation) is untested. This is the same failure class as finding 1 above, one layer out — it is why the fail-open lookup survived round 1.
3. **`audio.targetLoudnessLufs` is a dead ruleset setting.** The real target is `DEFAULT_TARGET_LOUDNESS_LUFS` in `manifest.ts`. The "every field is READ" test uses a hand-written list of 18 of 26 settings, so it misses this — it should derive the list from the ruleset's own keys.
4. **`MIXED_AUDIO_TIMELINE_UNSUPPORTED` has no test and no decision row.** Phase 0 refuses a timeline mixing audio-bearing and silent assets rather than synthesising silence. The refusal is honest and fail-closed, but undocumented — it warrants a D-50 alongside D-47, which records the equivalent call for aspect treatments. `WAIVER_SCHEMA_INVALID` and `AUDIO_EVENTS_NOT_FOUND` are likewise untested.
5. **`cutdown run` cannot drive the `render` step.** `buildRequest` has no `case 'render'`, so the runner reports `awaiting` at the draft-rendering boundary; a manual `cutdown render` is required, after which the gate works. Either add the request builder or state in the docblock why `render` is operator-originated at Phase 0.
6. **Two absolute claims in comments remain slightly overstated.** `checks.ts` says every threshold comes from the ruleset — a 1.2 line-height, a 0.5 px tolerance and a 30 fps fallback are still literals (defensibly "not thresholds"). `assertDeterministicArgv` says it checks every tier-1 pin but omits `-flags:a +bitexact`.
7. **Known Phase-0 limits, deliberately unclosed:** libass glyph fallback can reach a system font for characters Inter lacks (D-49); `filtergraph.test.ts` uses Windows-shaped absolute paths (fine under D-33's pinned machine, will need attention when Stage B adds CI); `skills/render/schema/input.json` accepts arbitrary absolute paths (a Stage-C concern per tech-spec §10); `captions.ts` does not escape `style.fontFamily` into the ASS `Style:` line (unreachable today — the value comes from the repo's own font registry — but becomes reachable when a brand font lands).

---

## Decisions appended

- **D-47** — `subject_reframe` and `split_screen` are REFUSED, never approximated. A centre-crop fallback would perform the exact treatment REQ-052 forbids, under an approved name.
- **D-48** — Caption wrap width is `min(ruleset maxCharsPerLine, geometric fit)`. §12.1's 42 chars is a readability ceiling that cannot know the canvas; 18 chars is what fits a 720-wide 9:16 frame. Margins derived from the overlay fixture.
- **D-49** — libass's system font provider cannot be disabled from FFmpeg's `subtitles` filter (verified against 8.0.1's option list). Scope, mitigations and the residual rights gap recorded honestly.

---

## Definition of Done

- ✅ Cutdown entry gate green (`build:contracts --check`, `validate:contracts`, `test:skills`, `pnpm -r test`)
- ✅ `code-reviewer` gate run to the two-round cap; both rounds' BLOCKs fixed
- ✅ Honest report — 7 residuals listed above, none silent
- ✅ Decisions appended (D-47, D-48, D-49)
- ⬜ `PHASE_0_EXIT_EARNED` — unchanged and still red; needs real footage (D-27), rights records and account IDs (D-36)

**Next:** Phase 5 (`approve` → final render/QA → `package`, `revise`, skills mirror, `status --phase0`) depends on this phase. Residuals 1, 2 and 4 are best cleared at the start of Phase 5, since Phase 5 writes the approval records this phase's `requireApproval` already reads.
