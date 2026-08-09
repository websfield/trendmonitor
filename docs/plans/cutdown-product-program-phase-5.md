# Stage 5 — Complete the social package (OUTLINE)

**Governing PRD phase:** Phase 1. **Depends on:** Stage 4.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` when Stage 4 is proven complete on disk.

---

## Objective

Deliver a package a producer can actually publish from — for each requested platform — instead of a master file plus a manual checklist.

## Requirement bindings

REQ-051 (full effective-dated Platform Capability Registry) · REQ-062…067 (package deliverables) · OTIO export · REQ-107 (overlay simulation, shared with Stage 2).

## What is deliberately missing today

`content-package-v1` documents its own Phase 0 subset. Absent, and in scope here: platform derivatives; post copy and title; hashtags and keywords; alt text; first-comment suggestions; clean/dialogue audio stems; native-audio instructions; OTIO export.

And the platform layer is one hard-coded fixture — `data/platform-capabilities/tiktok-organic-au-fixture.yaml` plus one dated overlay set — not a registry. Reels and Shorts do not exist.

## Exit gate (PASS/FAIL)

| # | Criterion |
|---|---|
| F1 | Each requested platform receives a complete, validated, independently reviewable package |
| F2 | The capability registry is **effective-dated** — a package records which dated capability set it was built against, and a capability change does not retroactively invalidate a delivered package |
| F3 | One master story plan produces genuinely different child EDLs per platform, not one crop of one master |
| F4 | Overlay simulation is driven by registry data, and matches Stage 2's studio preview exactly |
| F5 | OTIO export round-trips into at least one third-party NLE |

## Risks that must not be discovered late

1. **The stability clock resets twice.** `content-package-v1` grows substantially here. Sequence its bump deliberately against Stage 0's counting policy — if PRD §15 criterion 3's ten-output window is mid-accumulation, this bump invalidates it. Decide the timing before the schema work starts, not after.
2. **Effective-dating is easy to get wrong in the direction that silently rewrites history.** A delivered package must remain valid against the capability set it was built against.
3. **Platform rules change without notice.** The registry needs an update path and a staleness signal, or it becomes confidently wrong.
