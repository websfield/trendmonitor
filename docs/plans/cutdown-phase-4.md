# Phase 4 — Render Path, Captions, Technical QA Hard Gate

**Feature:** cutdown · **Depends on:** Phase 3 `PHASE_3_IMPLEMENTATION_COMPLETE` · **Owner agent:** general-purpose

## Project Conventions Pinned (READ FIRST)

*(Identical block to `cutdown-phase-1.md` §Project Conventions Pinned — paste verbatim into the implementing agent's prompt; normative here.)*

Phase-4 additions:
- **Renderer is FFmpeg + libass only** (D-16). Installing Remotion in any form is an owner escalation, full stop.
- All FFmpeg invocations go through `packages/renderer-core/src/ffmpeg.ts`: argv array, no shell, filtergraph escaping for user-derived text, `-protocol_whitelist file,pipe`, absolute non-option-shaped paths (tech-spec §11). No ad-hoc ffmpeg calls anywhere else — this is the phase where that module is hardened and the rule becomes testable.
- Determinism is **tier 1 only** (tech-spec §12): pinned build, fixed threads, bitexact flags, stripped `creation_time`, pinned audio encoder. Do not write a cross-machine byte-identity test; that claim is spec-forbidden.
- QA waiver semantics are D-35: warnings only, immutable named waiver; source/timebase, corrupt/missing media, rights, required captions/disclosures, and invalid output blockers are non-waivable.

## Requirements Checklist (functional)

- [ ] REQ-080 (deterministic assembly within documented limits — tier 1, on the D-33 pinned local environment), REQ-081 (RendererAdapter; no editorial package calls FFmpeg directly), REQ-082 (frame-accurate edits; timebase conversions recorded), REQ-083 (open captions + SRT + WebVTT; verbatim vs display text kept separate), REQ-084 (caption readability rules from the QA ruleset), REQ-085 (dialogue-first mix: normalize, no clipping, loudness + true-peak reported), REQ-086 *minimal* (static per-shot crop from EDL; smoothing/anchors deferred — subject tracks are REQ-016, product Phase 1), REQ-087 (**both tiers per D-34**: draft with visible version identifier from proxy media; final from source-hashed originals — delivered packages carry final, exit criterion 2 measures final), REQ-100 (technical QA suite), REQ-104 *Phase 0 subset* (caption file always emitted alongside burn-in; readability from the ruleset; meaningful non-speech cues flagged from Phase 2 audio events into the caption review payload), REQ-105 (release states on Render: `draft`/`editorially approved` groundwork), REQ-106 (actionable failure reports: time range + object + severity + fix)
- [ ] tech-spec §15 steps 6–7 *Done when*

## Requirements Checklist (technical)

- [ ] `render-manifest-v1.json` schema (+ regen, same commit); manifests record rendererVersion, ffmpegVersion, font hashes, encoder settings (PRD §10.6)
- [ ] QA thresholds live in `data/rulesets/technical-qa-v1.yaml` (tech-spec §12.1 defaults) — data, not constants
- [ ] Safe-zone overlay JSON shape + one hand-measured TikTok overlay fixture
- [ ] `render` is an async-marked skill (`execution: async`) even though the local runner just waits — the registry marker is Stage C truth (tech-spec §10)

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | `render-manifest-v1` schema + manifest builder from (EDL, StyleProfile, capability fixture, fonts) | `cutdown/packages/contracts/schemas/render-manifest-v1.json`, `cutdown/packages/renderer-core/src/manifest.ts` |
| 2 | `RendererAdapter` interface: `plan(RenderManifest) → RenderPlan`, `execute(RenderPlan) → Render` | `cutdown/packages/renderer-core/src/adapter.ts` |
| 3 | Harden `ffmpeg.ts`: filtergraph escaping, protocol whitelist, path policing, bitexact/threads/creation_time pinning, capability probe reuse | `cutdown/packages/renderer-core/src/ffmpeg.ts` + unit tests incl. injection fixtures (`'; rm -rf`, `-i`, `concat:`, quote/newline caption text) |
| 4 | `renderer-ffmpeg` adapter: frame-accurate cuts with handles/time-remap recorded, overlap/transition and audio-continuity validation, static per-shot crops, conservative dialogue cleanup/normalization, short boundary fades, ambient preservation, true-peak/loudness reporting, and libass open captions. Music ducking remains n/a because D-2 forbids added music | `cutdown/packages/renderer-ffmpeg/src/**` |
| 5 | Caption pipeline: EDL + transcript → ASS (burn-in) + SRT + WebVTT; verbatim preserved; D-28 low-confidence + proper-noun flags carried into the review payload | `cutdown/packages/renderer-ffmpeg/src/captions.ts` |
| 6 | Fonts: Inter (OFL) into `data/fonts/` by hash + licence note | `cutdown/data/fonts/**` |
| 7 | `render` skill, both tiers (D-34): draft = proxy + DRAFT badge/version; final = source originals/full-quality/no badge. Both manifests carry the same `editorialPlanHash`; the final manifest links `approvedDraftManifestId` and may differ only in declared tier/media/encode fields. Public final invocation requires a matching approval; Phase 4 exercises it only through the fixture harness. QA runs on both; criterion-2 validation binds to final | `cutdown/skills/render/**` |
| 8 | QA package with an explicit REQ-100/084/104 matrix: missing media, black/frozen/duplicate frames, unexpected silence, clipping, A/V sync, corruption, dimensions/duration, codec/profile/bitrate, caption overflow/readability/timing/safe-zone/spelling/name flags, crop failure, caption-file presence, and meaningful non-speech review flags. Emit time-ranged findings and `gateStatus` as `pass`, `pass_with_waivers`, or `fail`. **The runner invokes it deterministically after every render** | `cutdown/packages/qa/src/technical/**`, `cutdown/data/rulesets/technical-qa-v1.yaml`, `cutdown/data/platform-capabilities/overlays/tiktok/organic-video/2026-07.json` |
| 9 | Wire runner gates: draft QA `pass` or `pass_with_waivers` → review; final QA `pass` or `pass_with_waivers` → packaging. Implement D-35 waiver objects with named approver/reason/finding IDs/timestamp; reject attempts to waive blockers. Missing/malformed QA fails closed | `cutdown/workflows/local/src/gates.ts`, `cutdown/packages/contracts/schemas/qa-waiver-v1.json` |
| 10 | Tier-1 determinism test: double-render byte compare on the **pinned local environment** (D-33 — recorded FFmpeg build, fixed threads, bitexact flags; no CI exists at Phase 0) + renderer perceptual snapshot fixtures | `cutdown/packages/renderer-ffmpeg/tests/**` |

## Edge Cases & Failure Paths

- Caption metacharacters/RTL/emoji → escaping and glyph tests. Proxy/source timebase mismatch, zero/overlapping ranges, invalid handles, transition overlap, or discontinuous audio mapping → build errors. Audio-less source is explicit. Render kill is atomic/resumable. QA config missing/malformed fails closed. Missing safe-zone overlay is a warning and may be waived; an invalid range, corrupt render, missing captions, or invalid codec remains non-waivable.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| FFmpeg encode | non-zero / hang | timeout via `timeoutSeconds`; structured error; job `blocked` | corrupt-EDL fixture |
| Fonts | missing file/hash mismatch | render refuses (rights integrity) rather than substituting silently | hash-mismatch test |
| QA ruleset | unparseable | fail closed; gate blocks | malformed-yaml test |

## Handoff Contracts (consumed by Phase 5)

- `renders/draft/**` + `renders/final/**` layouts + `qa-report` JSON shape (Phase 5 `package` bundles the **final** tier; drafts feed review); release-state field on Render; caption file triplet (ASS/SRT/WebVTT) naming; QA gate waiver format (Phase 5 `approve` surfaces it); the runner's `review → final-rendering → packaging` transitions are wired by Phase 5 on top of this phase's tier support.

## Verification Steps

1. Phase 3 evidence on disk (valid EDL for test job).
2. `cutdown render <edl-id> --tier draft` → draft with burned captions + DRAFT badge plays; SRT/WebVTT emitted. Public `--tier final` without approval fails.
3. Renderer fixture harness produces the full-quality final master from originals twice → byte-identical on the pinned local environment (tier 1, D-33); Phase 5 supplies the first public approved final render.
4. Injection fixtures (malicious caption text, option-shaped path, `concat:` input) → all rejected (unit tests).
5. Deliberately broken render (silence injected, caption overflow fixture) → QA blocks with time-ranged actionable report (requires step 2).
6. Table-driven QA suite triggers every REQ-100 check once and proves a clean control does not trigger it.
7. Runner refuses `→ review`/`→ packaging` without QA; warning waiver yields `pass_with_waivers`; blocker-waiver attempt is rejected.

## Acceptance Criteria (PASS/FAIL)

- tech-spec §15 steps 6–7 *Done when* verbatim, plus a final-tier render proven (evidence: playable draft + final, pinned-env determinism test name, QA block demonstration).
- Grep proves no `ffmpeg` spawn outside `ffmpeg.ts` (evidence: grep output in review).
- QA thresholds read from yaml — changing a threshold changes behavior with no code change (test name).
- Loudness + true-peak reported in every render artefact (schema field + fixture).
- Every promised REQ-100/084/104 field has a positive and negative fixture; D-35 waiver policy is proven on both draft and final gates.

## Out of Scope

Remotion (owner escalation), final-tier rendering economics, beat alignment (REQ-090), HDR handling (REQ-089), subject-aware tracking crops (REQ-016), overlay preview UI (REQ-101).

## Completion Criteria (Definition of Done)

Cutdown entry gate green; `code-reviewer` PASS; honest report; decisions appended.
