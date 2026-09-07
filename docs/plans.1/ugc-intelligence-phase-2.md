# Phase 2 — Extraction Service: the versioned `FeatureRecord`

**Depends on:** 0
**Primary agent:** `intelligence-plane-engineer`
**Requirement IDs:** REQ-001, REQ-018
**Critical Paths:** Measurement discipline

> `FeatureRecord` is the join point between the external corpus and the internal one. *"An exemplar post scraped from TikTok and a creator submission uploaded to ClientHub produce the same shape. That symmetry is what allows a pattern learned from public content to be applied to private content, and it is the reason extraction is a shared service rather than two pipelines."*

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. **Read before you write.** 2. **No secrets.** 3. **Never destroy what you didn't create.** 4. **Fix causes, not symptoms.** 5. **Match the codebase.** 6. **Report honestly.** 7. **Small, verifiable steps.** 8. **Scale caution to blast radius.** 9. **Current facts beat trained memory.**

### Non-negotiable rules for this phase
- **Rule 4 — Fail closed.** Extraction failure → `NEEDS_REVIEW`. Never a default score.
- **Rule 5 — Measurement discipline.** A `Proxy` value is never shown or aggregated as `Measured`. Every metric carries provenance and an `as_of` date.
- **Rule 9 — Invariants change by ADR, not by drift.**

### Stack
Python 3.12 + `uv`. `ffprobe`/`ffmpeg`, scene detection, OCR, Whisper — **all behind interfaces**, each with a deterministic fake for tests. No network in a unit test.

### Anti-patterns
- Comparing features across `extractor_version`s. *"Features from different extractor versions are never compared, and a version bump triggers a backfill or a cohort split, never a silent mix."*
- Five evenly-spaced frames across a 47-second video — that samples the hook exactly once, and the hook carries 20% of VPS weight and the entire hard gate.
- Pretending to a continuous OCR contrast measure. Score it in **three bands**; the tech spec says a precise claim will not survive.
- Running Whisper on every submission. Native captions first — a performance decision as much as a cost one.

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`. **Do NOT request** any other.

---

## Requirements Checklist (functional)

| ID | Requirement |
|---|---|
| REQ-001 | Ingest a post by URI → structured feature record: extracted frames, timestamped transcript, derived feature set — **without a human transcribing or watching it**. |
| REQ-018 | Where scoring runs from frames without audio, every audio-dependent criterion (hook strength, emotional specificity, completion likelihood) is **explicitly flagged degraded** in the stored score and any surfaced UI, and the confidence band widens. |

## The pipeline (`tech-spec-ugc-intelligence.md` §Extraction, verbatim in intent)

1. **Acquire.** Exemplars via `yt-dlp` **only from the source allowlist** (a versioned config artefact, reviewed like code). Submissions via direct blob read. No source outside the allowlist, ever.
2. **Probe** with `ffprobe`: duration, audio-track presence. `audio_present = false` sets the degraded flag REQ-018 requires.
3. **Frames.** Scene-aware where supported, else evenly spaced. **Always include the true first frame and ≥ 3 frames inside `hook_window_ms` (default 2000).**
4. **Transcript.** Native captions first, Whisper fallback. **Record which** — a Whisper transcript of a noisy handheld clip has a different error profile than platform captions, and emotional specificity reads the opening line.
5. **Scene-change detection** → `cut_timestamps_ms` → `cut_cadence_per_sec`. This is what pacing is scored from. *"Pacing scored from five static frames is not pacing."*
6. **OCR** frames → on-screen text with bbox, **contrast ratio in three coarse bands**, platform-specific safe-zone check.

Output: one `FeatureRecord`, stamped `extractor_version`.

## `FeatureRecord` (schema, from the tech spec's data model)

`id · source_kind(exemplar|submission|live_post) · extractor_version · media_duration_ms · audio_present · transcript [UNTRUSTED] · transcript_source(native_captions|whisper|none) · frames[{ts_ms, blob_uri, is_first_frame}] · hook_window_ms · onscreen_text[{ts_ms, text, bbox, contrast_band, in_safe_zone}] [UNTRUSTED] · cut_timestamps_ms[] · cut_cadence_per_sec · first_frame_features{face_present, face_scale, composition, clutter_index} · disclosure_signals{onscreen_tag[], caption_tag[], spoken_disclosure_ts_ms} · authenticity_signals{handheld_motion, ambient_audio, filler_word_rate, lighting_kind} · derived_at`

`authenticity_signals` operationalises the friction-over-polish register. **These are captured as first-class features precisely because a production-quality-biased scorer would penalise them.**

## Requirements Checklist (technical)
- `transcript` and `onscreen_text` are typed `Untrusted[str]` — a distinct type that cannot be concatenated into a prompt without passing through an explicit `fence()` call. Enforced by a test.
- The de-identification job (drop frames + transcript, keep `cut_cadence_per_sec`, `filler_word_rate`) is **scheduled, not intended** (compliance-notes, APP 11). It ships this phase.
- Source allowlist is a versioned config artefact. The allowlist review asks **two** questions — does the source's terms permit *ingestion*, and do they permit *redistribution*? Where ingestion is permitted but redistribution is not, the record is flagged `no_redistribute` and C4 (Phase 8) serves counts without the URI.

## Edge Cases & Failure Paths

| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | Extraction ↔ de-identification (frames + transcript stripped after the rights window). Both exist this phase. | `P2-T7` |
| **Double failure** | `ffprobe` fails **and** native captions absent → `FeatureRecord` is not produced; submission → `NEEDS_REVIEW`. No partial record is persisted. | test `Extraction_ProbeAndCaptionsFail_NoPartialRecord` |
| **Degraded mode** | No audio track → `audio_present=false`, the three audio-dependent criteria flagged `degraded`, band widened. **The hard gate on hook still applies** — a degraded low hook score is still a low hook score. | `P2-T3` |
| Video shorter than `hook_window_ms` | Extract every frame; `hook_window_ms` clamped to duration; recorded. | test `HookWindow_ShorterThanVideo_Clamps` |
| Scene detection unreliable on compressed vertical mobile video | **Named open question** (tech spec). `cut_cadence_per_sec` carries a `confidence` band; if low, pacing's weight is surfaced as unreliable — never silently scored from noise. | test `CutDetection_LowConfidence_IsSurfaced` |
| Source not on the allowlist | Refuse to acquire. Not a warning. | test `Acquire_SourceNotAllowlisted_Refuses` |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| `yt-dlp` / blob store | Media unreachable | No `FeatureRecord`. Caller → `NEEDS_REVIEW`. | Retry | `Acquire_Unreachable_NoRecord` |
| `ffprobe` | Unsupported codec | No `FeatureRecord`; reason recorded. **Never a default record.** | Manual review | `Probe_UnsupportedCodec_NoRecord` |
| Whisper | Unavailable | `transcript_source = none`; `audio_present` still true; audio-dependent criteria degrade. Recorded, not hidden. | Re-run | `Transcript_WhisperDown_DegradesHonestly` |
| OCR | Fails on a frame | That frame contributes no `onscreen_text`. **A missing OCR result is not "no text present"** — `onscreen_text_complete = false`, and V1 cannot pass on absence. | Re-run | `Ocr_Fails_DoesNotImplyNoDisclosure` |

**That last row is load-bearing.** A disclosure veto that passes because OCR silently failed is the exact P1 this system exists to prevent.

## Handoff Contracts
```python
# Consumed by P1 (V1/V5), P3 (VPS), P6 (miner), P8 (synthesiser prevalence).
@dataclass(frozen=True)
class FeatureRecord:
    extractor_version: str          # features comparable ONLY within a version
    audio_present: bool
    onscreen_text_complete: bool    # False => absence proves nothing
    transcript: Untrusted[str]
    ...
def extract(uri: str, source_kind: SourceKind) -> FeatureRecord: ...
def deidentify(record_id: UUID) -> None: ...   # drops frames + transcript, keeps derived scalars
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P2-T1 | `Untrusted[T]` type + `fence()`; test that it cannot reach a prompt unfenced | `intelligence-plane-engineer` | `src/IntelligencePlane/extraction/untrusted.py` |
| P2-T2 | Acquire + source allowlist (ingest vs redistribute) | `intelligence-plane-engineer` | `.../extraction/acquire.py`, `config/source-allowlist.yaml` |
| P2-T3 | Probe + `audio_present` degradation flags | `intelligence-plane-engineer` | `.../extraction/probe.py` |
| P2-T4 | Frames: true first frame + ≥3 inside hook window | `intelligence-plane-engineer` | `.../extraction/frames.py` |
| P2-T5 | Transcript: native-first, Whisper fallback, source recorded | `intelligence-plane-engineer` | `.../extraction/transcript.py` |
| P2-T6 | Scene detection → cut cadence (+ confidence); OCR → 3-band contrast, safe zone; disclosure + authenticity signals | `intelligence-plane-engineer` | `.../extraction/{cuts,ocr,signals}.py` |
| P2-T7 | De-identification scheduled job | `intelligence-plane-engineer` | `.../extraction/deidentify.py` |
| P2-T8 | Deterministic fakes for every external tool; `IMediaProbe`, `ITranscriber`, `IOcr` | `intelligence-plane-engineer` | `.../extraction/ports.py`, `tests/fakes/` |

## Files to Create / Modify
All new under `src/IntelligencePlane/extraction/**`, `config/source-allowlist.yaml`, `tests/`. Modify `CLAUDE.md` §Commands + `.claude/workspaces.json` to add `uv run pytest` / `uv run ruff check`.

## Migration Steps
None (no relational entities). `FeatureRecord` persisted as a content-addressed artefact keyed by `(sha256(media), extractor_version)`.

## Verification Steps
1. `uv run ruff check && uv run pytest src/IntelligencePlane` → green. *(requires P2-T1..T8)*
2. Extract a fixture clip **with** audio → `audio_present=true`, ≥3 frames with `ts_ms < 2000`. *(requires step 1)*
3. Extract the same clip stripped of its audio track → `audio_present=false`; the three audio-dependent criteria carry `degraded=true`. *(requires step 2)*
4. Force the OCR fake to fail one frame → `onscreen_text_complete=false`; assert V1 (Phase 1) treats absence as unevaluable, not as pass. *(requires Phase 1 shipped)*
5. Request a URI not on the allowlist → refused. *(requires P2-T2)*

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | `FeatureRecord` stamped with `extractor_version`; a comparison across versions raises | test `Features_CrossVersionComparison_Raises` |
| A2 | ≥ 3 frames inside `hook_window_ms`, plus the true first frame | test `Frames_HookWindowCoverage` |
| A3 | `audio_present=false` ⇒ hook/emotional/completion flagged `degraded`, band widened, **hard gate still applies** | test `Degradation_HardGateStillApplies` |
| A4 | `transcript_source` recorded as `native_captions` \| `whisper` \| `none` | test `Transcript_SourceRecorded` |
| A5 | OCR failure ⇒ `onscreen_text_complete=false`, and disclosure absence proves nothing | test `Ocr_Fails_DoesNotImplyNoDisclosure` |
| A6 | `Untrusted[str]` cannot be interpolated into a prompt without `fence()` | test `Untrusted_CannotReachPromptUnfenced` |
| A7 | Non-allowlisted source refused | test `Acquire_SourceNotAllowlisted_Refuses` |
| A8 | De-identification drops frames + transcript, retains `cut_cadence_per_sec` + `filler_word_rate` | test `Deidentify_RetainsDerivedDropsPersonal` |
| A9 | OCR contrast is a 3-band enum, not a float | type signature |

## Out of Scope
No scoring, no mining, no corpus assembly, no trend detection. Do not touch `docs/initial/**`.

## Completion Criteria (Definition of Done)
Entry gate clean; `uv run pytest` + `ruff` green; `measurement-reviewer` **PASS**; `CLAUDE.md` §Commands updated.
