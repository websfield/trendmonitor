# Phase 6 proving run — job `e2e-mixed-1` (fixture placeholder path)

**Date:** 2026-08-02 · **Operator surface:** Claude Code `/cutdown-*` skills + `cutdown run` · **Footage:** synthetic golden-set fixtures only (`sourceClassification: fixture`, D-36) · **Live model spend: none** — every LLM stage replayed a committed recorded-model fixture over the injected transport (D-21 ceiling and API key remain owner-gated).

**Outcome: `PIPELINE_IMPLEMENTATION_COMPLETE` EARNED.** A complete `rights_approved` ContentPackage (`01KZ0A62WTAXFAYS9M1WK6PRKM`) was produced through the skills-only public surface with runner-owned QA gates, acyclic approval/package lineage, and `PHASE_0_EXIT_EARNED` honestly red throughout (the fixture package is excluded from every real count).

## 1. The chain, as executed

Every stage was driven the way the generated `.claude/skills/cutdown-*` mirrors document: author a request JSON against the skill's input schema, write it to `requests/<ulid>.json`, run `cutdown skills run <name> --input … --output …`, read the result. QA is not a skill — it runs inside `render` and its verdict is enforced by the runner's transition gate, exactly as tech-spec §15 documents.

| # | Stage | Request | Key result |
|---|---|---|---|
| 1 | `brief` | `01KZ07KMPQM63HJV8B83VEWMTC` | JobBrief `01KZ07MB75ZTMTCV21R42YTY9A`; honest no-CTA warning |
| 2 | `ingest` (atomic, 6 asset classes) | `01KZ07MQ0M1B8PGZAJFZRW2XDM` | 6 assets from `mixed-job-valid/`: video (unicode+space filename), audio, image, logo, subtitle, brand_reference. `hero-still.jpg` (no sidecar) landed `rights: unknown` — not assumed cleared |
| 3 | `index` (café video) | `01KZ07P26QKMX9KC48RD9JQYJ2` | `indexId DB5DNV6SAMNX9JMCRGSCGEB7PQ`, 1 moment, boundsCheck ok, VLM skipped with the D-21 reason |
| 4 | `ingest` (promo-take.mp4) | `01KZ0876B2N7HFQVQC55R9XV6J` | The 27 s speech fixture (`data/golden-sets/e2e/source/`), cleared sidecar rights |
| 5 | `index` (promo) — **kill drill 1** | `01KZ08927D5QWZ2HKNH6ST0KW9` (killed), `01KZ08C4K4ZDY1KFZMHG51BZXW` (resume) | Killed mid-OCR; resume served transcript/shots/scenes from checkpoint (`cacheHit=true`, 0/14/32 ms) and ran only OCR-onward. `indexId RPZ2S8F58Q10Y02T8E6VBBWDTB`, **7 moments**, boundsCheck 7/7 ok |
| 6 | `brief` rev 2 | `01KZ092REVISEDBRIEFREQV2AA` | durationRange floor raised 3 s → 5 s after the capability gate blocked (below) |
| 7 | `propose` (recorded) | `01KZ0940DPY54CPRHHG2XGW3C5` | 2 distinct CreativeBriefs; sharedMomentFraction 0.33/0.5 recorded as data (REQ-031) |
| 8 | `plan` (recorded) | `01KZ09QFWD9D88T9JXCEQBZCYX` | MasterStoryPlan + PlatformEDL `01KZ09QH84KC5S7P298MWCHFNG`, 3 clips range-validated |
| 9 | `validate` | `01KZ09QHGRDPV2FKK1S73MB7KY` | **gateStatus pass**, 0 blockers, 4 deterministic advisories; critic ran separately, 2 advisory findings (D-37 separation on disk: `reviews/gates/<edl>-gate.json` vs `-critic.json`) |
| 10 | `render` draft | `01KZ09R2W1VHSD865JB9B1VPSW` | QA **fail**: 1 unwaived `unexpected_silence` warning (an unwaived warning fails the gate — fix or waive by name, never silent) |
| 11 | `render` draft + waiver | `01KZ09T0GJFCM4WNGF0GD1ZNT5` | **pass_with_waivers** — waiver `01KZ09T0CFWQED598FDDXWAA37` (named, reasoned, plan-scoped) survived the re-render of the same planHash `2a2573…` |
| 12 | `approve` | `01KZ09V2DK32HT6DGM2XAPN1R1` | ReviewDecision `01KZ09V3Q9DSQD80VTYXMCVJ1J`, outcome approved, named decider, subjects the reviewed draft render + manifest + EDL + planHash |
| 13 | `render` final (unwaived) | `01KZ09W1DY5TVNDKD211FBEHY3` | Renders, then QA **fail** — the draft waiver does not leak across tiers (a waiver is plan-scoped; the final tier is a different planHash `0c43e5…`). *Final QA failure after approval blocks before package* — proven |
| 14 | `render` final + waiver — **kill drill 2** | `01KZ0A29J8BGBX2V4E8YZQRF4R` | First attempt killed mid-encode (structured `FfmpegError`, exit 3, **no result file**); orphaned dir contained captions only. Re-run: **pass_with_waivers**, waiver `01KZ0A29EEBKFYAWA3HPGQJQV8` |
| 15 | `cutdown run` (package) | — | Runner advanced exactly 1 step through the QA + approval gates; job `completed` |

Package `01KZ0A62WTAXFAYS9M1WK6PRKM` carries: `master.mp4`, SRT/WebVTT sidecars, cover + first frame (declared `moment_frame` cover), rights manifest (weakest state `cleared`, evidence URIs → `releaseState: rights_approved`), disclosures, final QA report (`pass_with_waivers`, 0 blockers), range-validation evidence (`ran`, 3 ranges), the immutable `contractSet`, the approval decision id, and `sourceClassification: fixture`.

## 2. Kill-resume drills (runner §8, job level)

**Drill 1 — during `index`.** The uv/python tree was `taskkill /F /T`-ed mid-OCR, after the transcript, shots and scenes sub-stages had checkpointed. The killed invocation never reached the run log's completion record (presence is trusted only with a run-log entry). The resume invocation's sub-stage ledger reads: `transcript cacheHit=true 0ms · shots cacheHit=true 14ms · scenes cacheHit=true 32ms · ocr cacheHit=false 150500ms …` — finished work was never redone, unfinished work restarted from its own boundary.

**Drill 2 — during the final render.** ffmpeg was killed mid-encode. The render skill surfaced a structured error (`UNEXPECTED_ERROR / FfmpegError`, exit 3), wrote **no result file**, and the run log recorded the invocation as `failed`. `cutdown run e2e-mixed-1` then resumed from the log: **advanced 0 steps** and the QA transition gate refused fail-closed — `QA_REPORT_UNREADABLE: The latest final render (01KZ0A2YC4…) has no qa-report.json. A render that exists without a report is never advanced past.` Recovery was exactly the documented one: re-run the render (a newer directory with a real report), after which `cutdown run` advanced the single remaining step (package) and completed the job.

**No LLM stage re-executed after either kill.** The run log records `propose` twice and `plan`/`validate` three times — every one a deliberate new invocation against changed inputs during authoring (see §4), none of them after a kill. Between the render kill and job completion the only invocations are the recovery `render` and `package`.

## 3. Cost report (task 5, tech-spec §13)

Wall-clock from the run log (`durationMs` per completed invocation), one full job on the pinned Windows machine (CPU-only, no GPU):

| Stage | Invocations | Wall-clock | Live model tokens | Notes |
|---|---|---|---|---|
| brief | 2 | 0.5 s + 0.4 s | 0 | rev 2 after the capability gate |
| ingest | 2 | 1.9 s + 2.2 s | 0 | atomic 6-asset directory, then 1 file |
| index (café, 5 s) | 1 | 130 s | 0 | first run incl. model loads; OCR dominates (56 s) |
| index (promo, 27 s) | 1 (killed) + 1 (resume) | 180 s resume | 0 | OCR 150 s of it; transcript/shots/scenes from checkpoint |
| propose | 2 | 15.9 s + 15.4 s | 0 live (recorded replay) | local bge-small query embedding is the cost |
| plan | 3 + 1 failed | ~0.5 s each | 0 live (recorded replay) | deterministic resolution dominates |
| validate | 3 | ~0.5–0.8 s each | 0 live (recorded replay) | |
| render draft | 2 + 1 failed | 7.6–7.9 s each | 0 | two ffmpeg passes + QA measurement |
| render final | 2 + 1 killed | 8.4–8.7 s | 0 | source-original tier |
| approve | 1 | 0.5 s | 0 | |
| package | 1 | 0.9 s | 0 | runner-driven |
| **Total** | | **~6.2 min** wall | **0 live tokens / AUD 0.00** | |

**D-21 ceiling comparison:** the spend ceiling is owner-unset; live spend was AUD 0.00 (recorded replay + local models only), nowhere near the AUD 200 unset-ceiling flag threshold. The paid stages a live run would add: propose/plan/validate/revise model calls (Sonnet-class, D-21) and the optional `--vlm` visual descriptions, which stayed fail-closed off throughout.

**CPU ASR throughput (D-17 trigger status):** a 27 s asset transcribed in well under real time even on CPU (the transcript sub-stage, model load included, completed inside the 130–180 s whole-index runs whose cost is dominated by OCR, not ASR). The D-17 revisit trigger (ASR throughput unusable on CPU) is **not** approached at Phase 0 clip lengths.

## 4. What the gates caught (all real, all mine)

1. **Capability gate:** the JobBrief's `durationRange.minSeconds: 3` was below the D-3 platform floor (5 s) → `DURATION_BELOW_MIN` blocker. Fixed by re-briefing at 5–15 s.
2. **Context-dependency gate:** the ASR heard the anaphoric "Then we cut the whole tape down…", and Moment extraction recorded a real `requires_setup` dependency from that Moment onto the overlapping bridge Moment. My EDL cut the payoff loose from its setup → `CONTEXT_DEPENDENCY_MISSING` blocker. Fixed by swapping the dependent clip for a dependency-free one.
3. **Draft QA:** two `caption_overflow` warnings (3 lines against the D-48 geometric 2-line wrap) → display texts shortened, preserving the in-order-subsequence quote-fidelity rule.
4. **QA warning semantics:** the remaining `unexpected_silence` warning (the fixture's own 1.6 s inter-utterance flite gaps) **fails the gate unless waived by name** — waived twice by named, reasoned D-35 records, once per tier, because a waiver is plan-scoped and the final tier is a different plan hash.
5. **A real cross-skill defect** (the one code change this phase): `render --audio-events` demanded an output-relative `{events}` file while the only producer in the pipeline (`index`) writes `{audioEvents}` in source ticks — REQ-104 was dead end-to-end. Fixed at the cause in `skills/render/src/audio-events.ts` (both shapes accepted; source ticks projected through the EDL clips onto the output timeline; speech/silence filtered as non-meaningful; 9 unit tests). Recorded as D-51.

## 5. Engine facts worth keeping

- Whisper transcribed the flite line "cut the whole **take** down" as "**tape**" and "are burned in" as "were burned" — quote fidelity binds captions to the **ASR verbatim**, not the script; a caption quoting the script would have been blocked.
- The silence-gap speaker heuristic assigned each utterance its own speaker (`speaker_1`…`speaker_5`), every one honestly capped at confidence ≤ 0.5 (D-17) and surfaced by the gate as `QUOTE_SPEAKER_UNVERIFIED` advisories.
- The 5 s ingest golden clips yield exactly **one** Moment each — below the REQ-036 footage-sufficiency floor (`max(3, variantCount × 2)` rankable Moments), which is why `data/golden-sets/e2e/source/promo-take.mp4` (27 s, five utterances, 7 Moments) exists.
- On the `skills run` surface a QA gate failure is reported in the result JSON (`gateStatus`) with exit 0; the `cutdown render` CLI verb is the surface that exits 4. Scripts must read the JSON, not the exit code, when driving `skills run`.

## 6. `status --phase0` — before and after (verification step 4, verbatim)

**Before the run** (2026-08-02, no packages existed):

```
cutdown status --phase0 — PRD §15 Phase 0 exit criteria (evidence: ContentPackages only, D-36)

  [ ] >= 20 approved real outputs across 3 accounts
      0/20 approved real output(s) across 0/3 account(s)
  [ ] zero invalid source ranges in final renders
      no delivered package exists yet, so there is nothing to have validated — this is UNPROVEN, not proven
  [ ] the last 10 outputs require no breaking contract change
      only 0 approved real output(s) exist, so stability across 10 is UNPROVEN (not proven by absence)
  [ ] rights records and QA reports accompany every delivered package
      no delivered package exists yet — UNPROVEN

  Counts
    packages total ............ 0
    real (counted) ........... 0
    fixture (NOT counted) .... 0
    warning-waived ........... 0   (D-35: reported separately from clean packages)
    missing evidence ......... 0

  Milestones (D-38 — never merged)
    PIPELINE_IMPLEMENTATION_COMPLETE  not earned
      no package with complete evidence exists yet, so the chain from ingest to package has not been proven end to end.
    PHASE_0_EXIT_EARNED               not earned
      4 of 4 criteria are not met: approved-real-outputs, zero-invalid-source-ranges, no-breaking-contract-change, rights-and-qa-evidence.
```

**After the run** (same day, one fixture package delivered):

```
cutdown status --phase0 — PRD §15 Phase 0 exit criteria (evidence: ContentPackages only, D-36)

  [ ] >= 20 approved real outputs across 3 accounts
      0/20 approved real output(s) across 0/3 account(s); 1 fixture package(s) EXCLUDED (D-36)
  [x] zero invalid source ranges in final renders
      1 package(s) carry range-validation evidence; 3 range(s) validated, 0 package(s) without acceptable evidence
  [ ] the last 10 outputs require no breaking contract change
      only 0 approved real output(s) exist, so stability across 10 is UNPROVEN (not proven by absence)
  [x] rights records and QA reports accompany every delivered package
      1/1 package(s) carry complete rights + QA evidence

  Counts
    packages total ............ 1
    real (counted) ........... 0
    fixture (NOT counted) .... 1
    warning-waived ........... 1   (D-35: reported separately from clean packages)
    missing evidence ......... 0

  Milestones (D-38 — never merged)
    PIPELINE_IMPLEMENTATION_COMPLETE  EARNED
      1 complete package(s) exist, so the chain from ingest to package has run end to end. This is the PIPELINE half of D-38 only: the six implementation gates and the recorded-model suites are build-time facts recorded in docs/progress/, not package evidence, and this command does not read them.
    PHASE_0_EXIT_EARNED               not earned
      2 of 4 criteria are not met: approved-real-outputs, no-breaking-contract-change. D-38: the implementation milestone must never be reported as Phase 0 exit.
```

The fixture count moved (0 → 1 excluded) while the approved-real count did not; the warning-waived package is counted separately; the two milestone names moved independently — exactly the D-36/D-38 behavior the phase plan's verification step 4 requires.

## 7. REQ-034 / REQ-106 spot-checks (phase plan, functional row 2)

- **REQ-034 (evidence-linked decisions):** the delivered package's EDL carries per-clip `rationale` and quote provenance; the CreativeBrief's proof points name `evidenceMomentIds` that the deterministic `required-evidence` gate resolved against the cut (it blocked when they didn't — §4.2). Verified on `packages/01KZ0A62WTAXFAYS9M1WK6PRKM/edl.json`.
- **REQ-106 (QA findings carry fix guidance):** every finding in the final `qa-report.json` carries checkId, location, message and a fix suggestion (the `unexpected_silence` finding's suggestion names the trim/waive options; `caption_overflow` named the wrap ceiling).
- **On real footage:** re-verification recorded as **BLOCKED-ON-D-27/D-36** — see `proving-run-real.md`.
