"""Moment extraction — Phase 2 task 9, closing REQ-018/019.

decisions.md **D-31** fixes the segmentation rule and its most important
property: *segmentation is never model-driven*. Boundaries come from the
intersection of speaker turns and shot boundaries — both deterministic detector
output — targeting 3–30 second granularity. A model may enrich
`candidateNarrativeFunctions` and nothing else; it never moves a boundary.

That constraint is not decoration. A Moment's `sourceRange` is what every later
stage cuts against, and the "zero invalid source ranges" Phase 0 exit criterion
is measured over these ranges. A boundary a model invented is a boundary nobody
can reproduce or audit, so the schema records `segmentation.method` as a `const`
and names the contributing turn and shot IDs — making the rule checkable against
a produced artefact rather than only against this code.

Every REQ-018 field is REQUIRED by `moment-v1`. Where there is genuinely nothing
to say, the field carries an explicit null plus a stated reason
(`NullableText`), so "we did not look" and "we looked and found nothing" stay
distinguishable downstream.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from harness import INDEXER_VERSION
from ids import derive_ulid

SCHEMA_VERSION = "1.0.0"

#: D-31's target granularity window, in seconds.
MIN_SECONDS = 3.0
MAX_SECONDS = 30.0

SEGMENTATION_METHOD = "speaker_turn_x_shot_boundary"


@dataclass(frozen=True)
class Timebase:
    num: int
    den: int

    def to_json(self) -> dict[str, int]:
        return {"num": self.num, "den": self.den}

    def seconds(self, ticks: int) -> float:
        return float(Fraction(ticks) * Fraction(self.num, self.den))

    def ticks_for(self, seconds: float) -> int:
        return round(seconds * self.den / self.num)


def collect_boundaries(
    speaker_turns: list[dict[str, Any]],
    shots: list[dict[str, Any]],
    duration_ticks: int,
) -> list[int]:
    """The candidate cut points: every speaker-turn edge and every shot edge.

    Deduplicated and sorted, always including 0 and the asset duration so the
    resulting segments tile the asset. Boundaries outside the asset are dropped
    rather than clamped — a detector that reported past the end is reporting a
    defect, and silently pulling it inward would hide that.
    """
    boundaries = {0, duration_ticks}
    for source in (speaker_turns or [], shots or []):
        for item in source:
            for key in ("startTicks", "endTicks"):
                tick = item.get(key)
                if isinstance(tick, int) and 0 <= tick <= duration_ticks:
                    boundaries.add(tick)
    return sorted(boundaries)


def segment_ranges(boundaries: list[int], timebase: Timebase) -> list[tuple[int, int]]:
    """Turn boundaries into 3–30 s half-open ranges.

    Two passes, both deterministic:

    * **Merge forward** while a segment is shorter than `MIN_SECONDS`. A
      one-second reaction shot is not independently selectable, so it joins its
      neighbour rather than becoming an unusable Moment.
    * **Split** any segment longer than `MAX_SECONDS`. Preference is to split at
      an interior boundary nearest the midpoint — a real detected edge is always
      a better cut than an arbitrary one. Only when no interior boundary exists
      (a long static take with no speech and no cuts) does it fall back to even
      division, which is the deterministic time-sliced fallback the phase plan
      requires for that case.
    """
    if len(boundaries) < 2:
        return []

    raw = [(boundaries[i], boundaries[i + 1]) for i in range(len(boundaries) - 1)]

    merged: list[tuple[int, int]] = []
    for start, end in raw:
        if merged and timebase.seconds(merged[-1][1] - merged[-1][0]) < MIN_SECONDS:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))

    # A trailing runt cannot merge forward (nothing follows), so it merges back.
    if len(merged) > 1 and timebase.seconds(merged[-1][1] - merged[-1][0]) < MIN_SECONDS:
        tail = merged.pop()
        merged[-1] = (merged[-1][0], tail[1])

    interior = set(boundaries)
    out: list[tuple[int, int]] = []
    for start, end in merged:
        out.extend(_split_long(start, end, interior, timebase))
    return out


def _split_long(
    start: int, end: int, boundaries: set[int], timebase: Timebase
) -> list[tuple[int, int]]:
    if timebase.seconds(end - start) <= MAX_SECONDS:
        return [(start, end)]

    candidates = sorted(b for b in boundaries if start < b < end)
    if candidates:
        midpoint = (start + end) // 2
        pivot = min(candidates, key=lambda b: (abs(b - midpoint), b))
        return _split_long(start, pivot, boundaries, timebase) + _split_long(
            pivot, end, boundaries, timebase
        )

    # No interior boundary: divide evenly into the fewest parts that all fit.
    max_ticks = timebase.ticks_for(MAX_SECONDS)
    parts = -(-(end - start) // max_ticks)  # ceiling division
    step = (end - start) // parts
    slices = [(start + i * step, start + (i + 1) * step) for i in range(parts - 1)]
    slices.append((start + (parts - 1) * step, end))
    return slices


def _overlaps(item: dict[str, Any], start: int, end: int) -> bool:
    """Half-open overlap test: any shared tick counts."""
    return item.get("startTicks", 0) < end and item.get("endTicks", 0) > start


_SEVERITY_ORDER = {"none": 0, "info": 1, "warning": 2, "severe": 3}


def build_moment(
    *,
    job_id: str,
    asset_id: str,
    source_index_id: str,
    start_ticks: int,
    end_ticks: int,
    timebase: Timebase,
    speaker_turns: list[dict[str, Any]],
    shots: list[dict[str, Any]],
    transcript: dict[str, Any] | None,
    ocr: list[dict[str, Any]],
    audio_events: list[dict[str, Any]],
    quality_flags: list[dict[str, Any]],
    visual_descriptions: list[dict[str, Any]],
    rights_state: str,
    rights_concerns: list[str],
    created_at: str,
    visual_absent_reason: str | None = None,
    embedding: dict[str, Any] | None = None,
    indexer_version: str = INDEXER_VERSION,
) -> dict[str, Any]:
    """Build one fully-populated `moment-v1` instance for a range."""
    overlapping_turns = [t for t in speaker_turns if _overlaps(t, start_ticks, end_ticks)]
    overlapping_shots = [s for s in shots if _overlaps(s, start_ticks, end_ticks)]
    overlapping_ocr = [o for o in ocr if _overlaps(o, start_ticks, end_ticks)]
    overlapping_audio = [a for a in audio_events if _overlaps(a, start_ticks, end_ticks)]
    overlapping_quality = [q for q in quality_flags if _overlaps(q, start_ticks, end_ticks)]
    overlapping_visual = [v for v in visual_descriptions if _overlaps(v, start_ticks, end_ticks)]

    segments = []
    if transcript:
        segments = [s for s in transcript.get("segments", []) if _overlaps(s, start_ticks, end_ticks)]

    moment_id = derive_ulid("moment", source_index_id, str(start_ticks), str(end_ticks))

    return {
        "momentId": moment_id,
        "envelope": {
            "schemaVersion": SCHEMA_VERSION,
            "createdAt": created_at,
            "createdBy": {"kind": "skill", "skill": "index", "skillVersion": indexer_version},
        },
        "jobId": job_id,
        "assetId": asset_id,
        "sourceIndexId": source_index_id,
        "sourceRange": {
            "assetId": asset_id,
            "startTicks": start_ticks,
            "endTicks": end_ticks,
            "timebase": timebase.to_json(),
        },
        "durationSeconds": timebase.seconds(end_ticks - start_ticks),
        "segmentation": {
            "method": SEGMENTATION_METHOD,
            "speakerTurnIds": [t["turnId"] for t in overlapping_turns],
            "shotIds": [s["shotId"] for s in overlapping_shots],
            "indexerVersion": indexer_version,
            "granularityBounds": {"minSeconds": MIN_SECONDS, "maxSeconds": MAX_SECONDS},
        },
        "transcript": _moment_transcript(segments),
        "visualSummary": _visual_summary(overlapping_visual, visual_absent_reason),
        "speakers": [
            {
                "turnId": turn["turnId"],
                # The corrected name when one exists, otherwise the inference.
                # The editorial gate treats an UNCORRECTED label as an unverified
                # speaker identity, so the two must not be conflated here.
                "label": (turn.get("correction") or {}).get("name") or turn["inferredLabel"],
                "isCorrected": turn.get("correction") is not None,
                "lowConfidence": bool(turn.get("lowConfidence", False)),
            }
            for turn in overlapping_turns
        ],
        "entities": _entities(segments, overlapping_ocr),
        "keywords": _keywords(segments),
        "energyCues": _energy_cues(overlapping_audio),
        "technicalQuality": _technical_quality(overlapping_quality),
        "rights": {"state": rights_state, "concerns": list(rights_concerns)},
        # Populated by heuristics only at Phase 0. Optional LLM enrichment is the
        # single model contribution to a Moment and never touches its boundaries.
        "candidateNarrativeFunctions": _candidate_functions(segments, start_ticks),
        # Cross-Moment dependencies need the full set to resolve, so they are
        # filled in by `link_dependencies` after every Moment exists.
        "sourceDependencies": [],
        "embedding": embedding,
    }


def _moment_transcript(segments: list[dict[str, Any]]) -> dict[str, Any]:
    """Verbatim and display text stay SEPARATE.

    The deterministic quotation gate (D-37 — quote token order and speaker
    identity) tokenises the verbatim side, so a cleaned caption must never be
    able to launder a misquote past it.
    """
    verbatim = " ".join(s.get("verbatimText", "") for s in segments).strip()
    display = " ".join(s.get("displayText", "") for s in segments).strip()
    low_confidence = sum(
        1 for s in segments for w in s.get("words", []) if w.get("lowConfidence")
    )
    return {
        "verbatimText": verbatim,
        "displayText": display,
        "wordCount": sum(len(s.get("words", [])) for s in segments),
        "segmentIds": [s["segmentId"] for s in segments],
        "lowConfidenceWordCount": low_confidence,
    }


def _visual_summary(
    descriptions: list[dict[str, Any]], absent_reason: str | None
) -> dict[str, Any]:
    """Null-with-reason when the VLM sub-stage was skipped — NEVER fabricated."""
    if descriptions:
        return {"value": " ".join(d.get("text", "") for d in descriptions).strip(), "absentReason": None}
    return {
        "value": None,
        "absentReason": absent_reason or "visual-description sub-stage produced no description for this range",
    }


def _entities(segments: list[dict[str, Any]], ocr: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Entity candidates, each tagged with the modality that asserted it.

    An on-screen price read by OCR and a spoken price are different evidence, so
    `source` is required and never merged away.
    """
    entities: list[dict[str, Any]] = []
    for segment in segments:
        for word in segment.get("words", []):
            if word.get("properNounCandidate"):
                entities.append(
                    {
                        "text": word["verbatim"],
                        "kind": "other",
                        "confidence": float(word.get("confidence", 0.0)),
                        "source": "transcript",
                    }
                )
    for observation in ocr:
        text = observation.get("text", "").strip()
        if text:
            entities.append(
                {
                    "text": text,
                    "kind": "other",
                    "confidence": float(observation.get("confidence", 0.0)),
                    "source": "ocr",
                }
            )
    # Deduplicate on (text, source) while keeping first-seen order stable.
    seen: set[tuple[str, str]] = set()
    unique = []
    for entity in entities:
        key = (entity["text"].casefold(), entity["source"])
        if key not in seen:
            seen.add(key)
            unique.append(entity)
    return unique


_STOPWORDS = frozenset(
    [
        "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those", "i",
        "you", "he", "she", "it", "we", "they", "is", "are", "was", "were", "be", "been", "being", "to", "of",
        "in", "on", "at", "for", "with", "as", "by", "from", "up", "out", "so", "no", "not", "do", "does",
        "did", "have", "has", "had", "will", "would", "can", "could", "should", "just", "really", "very"
    ]
)


def _keywords(segments: list[dict[str, Any]], limit: int = 12) -> list[str]:
    """Frequency-ranked content words. Deterministic: ties break alphabetically."""
    counts: dict[str, int] = {}
    for segment in segments:
        for raw in segment.get("verbatimText", "").split():
            token = "".join(c for c in raw.casefold() if c.isalnum() or c == "'")
            if len(token) > 2 and token not in _STOPWORDS:
                counts[token] = counts.get(token, 0) + 1
    return [word for word, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]


def _energy_cues(audio_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """REQ-015's rule rides along: volume alone is never emotional importance.

    Each cue names the classifier events that justified it (`audioEventIds`,
    minItems 1), so a cue can always be traced back to classified evidence rather
    than to loudness.
    """
    cues = []
    for event in audio_events:
        kind = event.get("kind")
        if kind in {"speech", "silence"}:
            continue  # presence of speech is not an energy cue
        cues.append(
            {
                "kind": kind,
                "intensity": min(1.0, max(0.0, float(event.get("confidence", 0.0)))),
                "audioEventIds": [event["eventId"]],
            }
        )
    return cues


def _technical_quality(flags: list[dict[str, Any]]) -> dict[str, Any]:
    """Advisory rollup. `usable` never blocks — the human decides, not the score."""
    kinds = sorted({f["kind"] for f in flags})
    worst = "none"
    for flag in flags:
        if _SEVERITY_ORDER[flag["severity"]] > _SEVERITY_ORDER[worst]:
            worst = flag["severity"]
    return {"flagKinds": kinds, "worstSeverity": worst, "usable": worst != "severe"}


def _candidate_functions(segments: list[dict[str, Any]], start_ticks: int) -> list[dict[str, Any]]:
    """Cheap, transparent heuristics — candidates, plural and non-exclusive.

    The story planner chooses; this list only says what the Moment *could* serve.
    Every entry is `source: "heuristic"` so a later model-sourced entry stays
    distinguishable and can never be promoted into a blocking signal (D-37).
    """
    text = " ".join(s.get("verbatimText", "") for s in segments).casefold()
    candidates: list[dict[str, Any]] = []

    def add(function: str, confidence: float, rationale: str) -> None:
        candidates.append(
            {"function": function, "confidence": confidence, "rationale": rationale, "source": "heuristic"}
        )

    if start_ticks == 0:
        add("promise", 0.5, "opens the asset, where a hook or promise conventionally sits")
    if any(q in text for q in ("?",)):
        add("objection", 0.3, "contains an interrogative, a common objection marker")
    if any(w in text for w in ("because", "so that", "which means")):
        add("proof", 0.3, "contains a justification connective")
    if any(w in text for w in ("buy", "sign up", "link in bio", "follow", "subscribe")):
        add("cta", 0.6, "contains an explicit call-to-action phrase")
    if not candidates:
        add("context", 0.2, "no stronger signal detected; context is the default role")
    return candidates


def link_dependencies(moments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fill `sourceDependencies` once every Moment exists.

    REQ-018's 'source dependencies' are the other Moments this one needs in order
    to make sense — a payoff meaningless without its setup. At Phase 0 the only
    relation asserted is `requires_setup` for a Moment whose text opens with a
    discourse connective that refers back ("so", "then", "which means"), because
    such a Moment cut loose reads as a non-sequitur. The deterministic
    'required context' editorial gate (D-37) consumes this.
    """
    back_reference = ("so ", "then ", "which means", "that's why", "because of that")
    for position, moment in enumerate(moments):
        if position == 0:
            continue
        text = moment["transcript"]["verbatimText"].casefold().lstrip()
        if text.startswith(back_reference):
            moment["sourceDependencies"] = [
                {"momentId": moments[position - 1]["momentId"], "relation": "requires_setup"}
            ]
    return moments
