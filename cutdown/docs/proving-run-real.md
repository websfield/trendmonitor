# First real-footage job — `schwarzkopf-w1-showcase` (2026-08-05)

**Status: DONE.** This file previously recorded `BLOCKED-ON-D-27/D-36`; the owner supplied real campaign footage and directed its use in-session on 2026-08-05, unblocking the run. The blocker note it replaces is preserved in git history.

**Deliverable:** ContentPackage `01KZ8B40TENCWQ72F061FXK79S` — a 27.8 s vertical campaign-showcase cut of the six best-performing posts from *Schwarzkopf EXTRA CARE Partnership — Australia Wave 1*, selected by reach and engagement rate from `ai-results.json`. `releaseState: rights_approved`, `sourceClassification: real`, QA `pass_with_waivers` (0 blockers), rights manifest covering all six creator assets (weakest state `cleared`, post URLs as evidence), range validation `ran` (7 clip ranges + 3 fixture-job ranges across the two packages). A convenience copy of the master sits at `work/Schwarzkopf EXTRA CARE Partnership - Australia Wave 1/schwarzkopf-w1-showcase.mp4`.

## The cut

| # | Clip | Creator (post) | Caption |
|---|---|---|---|
| 1 | Hook | Tash Oakes (IG, 2,476 views) | quote: "nobody talking about this oil?" |
| 2 | Context | Graciemae Sinclair (TT, 3,003 views — top reach) | quote: "I've just been to Coles to stock up" |
| 3 | Routine | FIA ILARDA (TT, 33.8% ER — top resonance) | quote: "I've nailed my hair care routine" |
| 4 | Proof | FIA ILARDA (IG, 1,620 views) | quote: "my hair is looking healthy and shiny" |
| 5 | Beauty shot | Gloria Ambicki (IG, 1,818 views; music-led) | text: "Gloria Ambicki - 1,818 views" |
| 6 | Beauty shot | olly g (TT, 20.3% ER; music-led) | text: "olly g - 20% engagement" |
| 7 | Payoff | FIA ILARDA (IG) | quote: "salon quality results at home" |

Quote captions quote the ASR verbatim (subsequence-checked by the D-37 gate); no caption quotes a line containing the brand token, because Whisper renders the brand name inconsistently ("Schwatzcoffs" / "Schwartzcoft" / "Schwatzkopf"). Disclosures declare `paidPartnership: true` (partnership content). `blurred_background` normalises 576×1024, 720×1280 and one 1080×608 landscape source onto the 720×1280 canvas.

## What the machinery did on its first real footage

- **Quality gates discriminated for real:** music-led reels (Gloria, olly) had their speechless moments flagged `speech_intelligibility`-unusable and were cast as caption-stat beauty shots; voiceover reels passed clean. The Phase-6 fixture, by contrast, had flagged *everything* unusable — real footage is what the thresholds were tuned for.
- **The editorial gate passed the 7-clip multi-asset EDL first try** (0 blockers), then QA caught a real caption overflow (glyph-width wrap, not char count — 35 chars fit in one caption and overflowed in another) which was **fixed**, plus four warnings **waived by named, reasoned, plan-scoped records**: 0.2 LU loudness drift + 0.2 dB true-peak overshoot from concatenating six differently-mastered native-audio sources (not operator-correctable at Phase 0), and two proper-noun review prompts ("Coles", "Ambicki") verified against the campaign data.
- **Indexing throughput is the real cost:** ~183 s of 6-asset footage took ~3 h wall, ~95% of it PaddleOCR at ~30–120 s per shot-keyframe (fast-cut reels ≈ 1 shot/second; per-frame cost scales with on-screen text density and resolution). ASR, shots, scenes, audio events and quality flags together were minutes. Recorded for D-17/Phase-1 planning; the OCR **progress heartbeat** (`index/progress.jsonl`) was added mid-run because a 71-minute silent sub-stage is indistinguishable from a hang.
- **Zero live model spend:** all editorial stages replayed committed recorded fixtures (`skills/*/fixtures/showcase/`); embeddings and all perception models ran locally. D-21 remains owner-gated.

## Honesty notes (read before treating this as precedent)

1. **The approval is delegated.** ReviewDecision `01KZ8B0VH23CK4CCYT6MNZVC3W` and all four waivers name the owner with the delegation context on their face; the decision's own notes instruct: watch the draft and supersede via `cutdown approve --reject` or `cutdown revise` if the cut needs changes. A later rejection outranks this approval by the resolver's total order.
2. **Rights records are owner-directed, not agreement-backed.** Each asset's record cites the published partnership post as `evidenceUri` and notes that the formal creator agreements are held by the campaign, not attached. `paidAmplificationPermitted: false` throughout. Internal stakeholder showcase only.
3. **`--audio-events` was deliberately omitted:** the D-51 projection does not yet filter events by asset in a *multi-asset* EDL (single-asset jobs are unaffected). The `non_speech_cue_review` check recorded `skipped` with that reason. Follow-up: thread `assetId` through `ClipSourceSpan`.
4. The REQ-034/REQ-106 spot-checks repeat what the fixture run proved, now on real footage: per-clip rationale + quote provenance in the packaged EDL; every QA finding carries fix guidance (the name-flag waivers answer theirs by name).
