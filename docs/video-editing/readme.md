
## Document set

Read in this order: `PRD.md` (product requirements, editorial principles, phased roadmap) → `tech-spec.md` (repository layout, execution contracts, the Claude Code–to–standalone-platform skills architecture, Phase 0 build sequence) → `decisions.md` (the Phase 0 decision record) → `developer-guide.md` (setup, working agreements, escalation protocol). This file is the research memo behind the PRD's v2 revision — kept for provenance, not read first.

> **Naming note:** two object names in this memo were revised in the final PRD — `PublicationOutcome` became `PerformanceObservation`, and the versioned contract is `Moment` (`moment-v1`); "Moment Graph" survives only as the name of the assembled set (REQ-018). Where this memo and the PRD differ, the PRD is right.

---

The PRD is implementation-ready at roughly 12,000 words and includes 113 functional requirements, updated architecture, data model, evaluation programme, phased roadmap, risk register, source register, and traceability from the original PRD.

## What the research changed

### 1. There is no durable single “algorithm hack”

YouTube describes Shorts discovery as a combination of whether viewers choose to watch, average view duration, percentage viewed, satisfaction signals, personal relevance, topic demand, and competition. It also says there is no required minimum publishing cadence. TikTok similarly describes recommendations as personalised from user interactions, video information, and viewing behaviour; completion can matter, but the weighting varies by viewer and context. ([Google Help][1])

The revised PRD therefore rejects:

* a universal “viral score”;
* a mandatory hook before exactly 1.5 seconds;
* always withholding the payoff until 70%;
* fixed cuts-per-second requirements;
* universal ideal durations, posting times, or hashtag formulas.

These have been replaced with **versioned editorial hypotheses** carrying a platform, objective, archetype, evidence source, confidence, effective date, and expiry date.

### 2. Eligibility and originality come before optimisation

Current platform guidance consistently discourages artificial engagement, duplicated content, visible recycling, spam, and low-value reposting. TikTok can make unoriginal or low-quality material ineligible for recommendation, YouTube prohibits artificial traffic and engagement, and Meta has recently strengthened its emphasis on original content while deprioritising minor modifications of existing posts. ([TikTok][2])

The PRD now explicitly defines “gaming the algorithm” as **policy-compliant distribution optimisation**, not manipulation. Fake engagement, bots, engagement pods, deceptive loops, account farming, unrelated hashtags, and policy evasion are hard non-goals.

Originality is now a release gate backed by:

* source provenance and consent records;
* watermark and near-duplicate detection;
* meaningful-transformation checks;
* music and asset rights manifests;
* commercial-disclosure requirements;
* platform eligibility validation.

### 3. Current trends favour authenticity, proof, search, and community participation

TikTok’s 2026 trend research highlights real processes and behind-the-scenes material, honest human perspectives, comments as a creative surface, curiosity-led discovery, adjacent niches, demonstrations, comparisons, and clearer evidence for why something is worth attention or purchase. These should be treated as current hypotheses rather than permanent laws. ([TikTok For Business][3])

The content archetype library now includes:

* candid process and behind-the-scenes stories;
* product proof and demonstrations;
* comparisons and before/after stories with context;
* how-to and utility content;
* objection handling;
* customer or creator evidence;
* comment-response videos;
* search-led explainers;
* niche-community stories;
* outcome-first and curiosity-first variants.

### 4. Platform-native output must be more than resizing

The original model rendered the same EDL at several aspect ratios. The revised system creates one **Master Story Plan** and then produces distinct child **Platform EDLs**.

That allows the TikTok, Instagram Reels, YouTube Shorts, LinkedIn, organic, and paid versions to vary by:

* opening treatment;
* duration and story density;
* caption treatment and safe zones;
* metadata and search wording;
* cover frame;
* call to action;
* audio-rights mode;
* disclosure requirements;
* platform UI obstruction;
* native versus embedded music;
* objective-specific ending.

TikTok’s own creative guidance, for example, recommends platform-native vertical production, safe-zone awareness, clear hook/body/close structures for ads, dynamic visual and audio treatment, and intentional use of sound. ([TikTok For Business][4])

### 5. Analytics is now part of Phase 1, not a future enhancement

Without post-publication outcomes, the engine can only reproduce generic editorial advice. The revised PRD makes account-level measurement central to the product’s defensibility.

It now preserves native platform metrics and normalises them into metric families such as:

* opening choice and hold;
* watch time and completion;
* shares or sends;
* saves;
* qualified comments;
* profile actions and follows;
* clicks, leads, or conversions;
* negative feedback.

Every job declares its objective and primary metric before editing. Performance is compared with an appropriate account/platform/content cohort rather than an arbitrary global benchmark. Learning produces **proposed** account-profile changes that require approval and can be rolled back.

## Major product-design improvements

### A four-contract editorial architecture

The central workflow is now:

```text
JobBrief
  → SourceIndex and MomentGraph
  → CreativeBrief
  → MasterStoryPlan
  → PlatformEDL
  → RenderManifest
  → ContentPackage
  → PublicationOutcome
```

This separates four concerns that were previously concentrated in a single EDL prompt:

1. **Creative strategy:** audience, objective, promise, angle, evidence, and intended response.
2. **Narrative planning:** moment selection and story structure independent of renderer details.
3. **Platform adaptation:** platform-specific timing, packaging, metadata, audio, safe zones, and CTA.
4. **Deterministic rendering:** exact source ranges, transforms, captions, audio mix, graphics, and output settings.

### A Moment Graph rather than transcript-only clipping

The index now captures:

* word-level transcript, confidence, language, and speaker diarisation;
* OCR and on-screen text;
* shot and scene boundaries;
* visual descriptions and embeddings;
* faces, subjects, products, active speaker, and crop tracks;
* motion, focus, exposure, shake, and obstruction quality;
* silence, music, speech, applause, laughter, and audio-energy events;
* semantic relationships between claims, proof, reactions, questions, answers, and outcomes;
* duplicate and near-duplicate footage;
* rights, consent, provenance, and sensitivity metadata.

This gives the editorial model evidence-linked moments instead of asking it to infer an edit from a large transcript dump.

### A Hook Lab and genuinely distinct variants

Variants must now differ by editorial hypothesis—for example, outcome-first versus problem-first, proof-first versus personality-first, or utility-first versus curiosity-first. Merely rearranging the same clips no longer satisfies the requirement.

Each proposed opening records:

* the promise made to the viewer;
* the visual and verbal device;
* what evidence supports it;
* likely viewer expectation;
* potential mismatch or clickbait risk;
* intended metric;
* the variable being tested.

### Trend Signals rather than monolithic Trend Packs

A trend is represented as effective-dated evidence with:

* platform, market, language, and niche;
* source and observation date;
* format mechanics;
* saturation and likely remaining lifespan;
* sound and asset rights;
* account and brand fit;
* confidence level;
* originality guidance;
* contraindications.

This permits the engine to select “evergreen” or account-native creative when a trend would feel forced, stale, oversaturated, or legally unsuitable.

### Full publish package

Each approved version can now produce:

* final video and preview;
* captioned and clean-master versions;
* SRT or WebVTT captions;
* cover-frame candidates;
* title and post-copy options;
* search phrases and relevant hashtags;
* alt text;
* disclosure and rights notes;
* native-audio instructions;
* recommended first comment;
* comment-response prompts;
* OTIO timeline export;
* machine-readable provenance and QA reports.

Accurate, synchronised captions are a release requirement rather than a cosmetic feature. W3C guidance also makes clear that unreviewed automatic captions are not sufficient when they remain inaccurate. ([W3C][5])

## Recommended technology stack

I removed C#/.NET as the default, although it remains a reasonable integration language where Social Soup already has relevant infrastructure.

The recommended primary architecture is:

| Layer                                 | Recommendation                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Product UI and control plane          | TypeScript, React/Next.js, and a TypeScript API                                                   |
| Canonical contracts                   | JSON Schema, with generated TypeScript and Python types                                           |
| Editorial orchestration               | TypeScript services with provider-neutral LLM/VLM adapters                                        |
| Media and ML workers                  | Python                                                                                            |
| Media execution                       | FFmpeg                                                                                            |
| Motion graphics and advanced captions | Remotion behind a renderer adapter                                                                |
| Simple caption fallback               | FFmpeg filters or ASS subtitle rendering                                                          |
| Database                              | PostgreSQL                                                                                        |
| Embeddings and similarity             | `pgvector` initially                                                                              |
| Object storage                        | S3-compatible storage                                                                             |
| Durable hosted jobs                   | Temporal                                                                                          |
| Local jobs                            | Lightweight runner using the same activity boundaries                                             |
| Timeline interchange                  | OpenTimelineIO                                                                                    |
| Observability                         | OpenTelemetry-compatible traces, logs, metrics, and cost events                                   |
| Infrastructure                        | Containerised workers, beginning with CPU and adding GPU pools only where benchmarks justify them |

This split fits the actual problem better:

* TypeScript supports the web product, shared schemas, review interface, orchestration, and Remotion ecosystem.
* Python provides flexibility for ASR, computer vision, embeddings, diarisation, scene analysis, and model evaluation.
* FFmpeg remains the deterministic media foundation.
* Temporal is designed for durable workflows that retain state and resume after failures—well suited to long-running video jobs with retries and human approval pauses. ([Temporal][6])
* OpenTimelineIO provides a recognised interchange model without forcing Cutdown’s richer narrative roles into a proprietary editing format. ([GitHub][7])
* Remotion remains useful, but it is isolated behind an adapter because licensing and automated-render economics need to be benchmarked before platform scale. ([Remotion][8])

## Recommended first implementation epic

The revised roadmap begins with the **contracts and fixtures**, not the hosted UI:

1. Define and version `JobBrief`, `SourceIndex`, `MomentGraph`, `CreativeBrief`, `MasterStoryPlan`, `PlatformEDL`, and `RenderManifest`.
2. Create representative fixture footage and golden expected outputs.
3. Build deterministic source validation and FFmpeg execution.
4. Add transcript, scene, OCR, audio, quality, and subject-track indexing incrementally.
5. Build the editorial planner and critic against the fixtures.
6. Add one caption renderer and one platform capability profile.
7. Run at least 20 real Social Soup outputs across three accounts.
8. Proceed to hosted infrastructure only after the contracts stabilise and published content is non-inferior to relevant account baselines.

That sequencing protects the most valuable asset—the editorial decision model—from being buried beneath premature platform engineering.

[1]: https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts "https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts"
[2]: https://www.tiktok.com/community-guidelines/en/integrity-authenticity/ "https://www.tiktok.com/community-guidelines/en/integrity-authenticity/"
[3]: https://ads.tiktok.com/business/en/next "https://ads.tiktok.com/business/en/next"
[4]: https://ads.tiktok.com/business/en-US/creative-codes "https://ads.tiktok.com/business/en-US/creative-codes"
[5]: https://www.w3.org/WAI/media/av/captions/ "https://www.w3.org/WAI/media/av/captions/"
[6]: https://temporal.io/ "https://temporal.io/"
[7]: https://github.com/AcademySoftwareFoundation/OpenTimelineIO "https://github.com/AcademySoftwareFoundation/OpenTimelineIO"
[8]: https://www.remotion.dev/ "https://www.remotion.dev/"
