---
name: brief
skillVersion: 1.0.0
description: Validate a supplied JobBrief against job-brief-v1 and commit it to the job, listing every missing required field by name.
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
sideEffects: [writes-project-data]
timeoutSeconds: 30
---

# brief — JobBrief intake

Implements tech-spec §7's `cutdown brief <job-id> --file <brief.yaml|json>` and
the brief-resolver stage of §4 (deterministic validation, no model call).

## What it does

1. Validates the supplied document against `job-brief-v1`.
2. Fills the envelope (`schemaVersion`, `createdAt`, `createdBy`) and mints a
   `briefId` when the document does not carry one.
3. Applies the cross-field checks JSON Schema cannot express — the style subset
   forbids `if/then/else`, so `maxSeconds >= minSeconds` and "Phase 0 resolves
   capabilities for `tiktok` only" are enforced here in code.
4. Writes the accepted brief to `project-data/jobs/<job-id>/brief/<briefId>.json`.

## What it deliberately does NOT do

**It is non-interactive.** A missing required field fails with exit code 2 and a
structured error naming every missing field at once — it never prompts, and it
never infers a value. PRD REQ-002 requires an *explicit* brief: an inferred
audience or objective silently changes what the entire downstream pipeline
optimises for, and it would do so invisibly, since every later stage would treat
the guess as a stated requirement.

Reporting every missing field in one pass (rather than failing on the first) is
what makes the non-interactive contract usable: a caller — human or agent — can
fix the whole brief in one edit instead of discovering the requirements one
error at a time.
