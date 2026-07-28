---
name: ingest
skillVersion: 1.0.0
description: Atomically ingest a non-recursive directory (or a single file) of source assets — classify, hash, rights-resolve, preflight, and proxy every one, committing only if all succeed.
entrypoint: ["node", "dist/src/main.js"]
execution: sync
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - source-asset-v1
sideEffects: [reads-project-data, writes-project-data]
timeoutSeconds: 1800
---

# ingest — atomic multi-asset intake

Implements tech-spec §7's `cutdown ingest` and §15 build-step 2, covering
PRD REQ-001 (multi-asset jobs), REQ-003 (rights and consent), REQ-004
(technical preflight), and REQ-005 (content hashing and cache).

## The atomicity guarantee

> Artefacts commit to the job only after the whole inventory validates, so a
> mixed directory cannot land half-ingested.

Every asset is classified, rights-resolved, hashed, preflighted and proxied into
a **staging directory**. Only when all of them have succeeded is the staging
content promoted into the job. Any failure removes the staging directory and
leaves the job exactly as it was.

The alternative — writing each asset into the job as it succeeds, and rolling
back on failure — is worse where it counts. A crash between two writes leaves a
half-populated job with no rollback code still running, and nothing downstream
can distinguish a partial inventory from a complete one. Staging turns that
failure into a leftover directory that is inert, obviously named, and removable.

## Rules it enforces

- **Unknown rights are flagged, never assumed cleared** (REQ-003). An asset with
  no sidecar and no manifest entry lands `rights: unknown`. A declared
  `cleared` whose own `expiryDate` has passed resolves to `expired` — the
  declared state is an input to resolution, never the output.
- **A rights manifest naming a path that does not exist is an error.** Missing
  entries are fine (they resolve to `unknown`, visibly); extra entries almost
  always mean a typo, and a typo means a real asset silently lands undocumented.
- **Unclassifiable member ⇒ the whole ingest fails**, naming the relative path
  (REQ-001, decisions.md D-40).
- **Corrupt media ⇒ the whole ingest fails.** `suspect` (recoverable decode
  errors, complete stream) is recorded and warned about; both are non-waivable
  at packaging (D-35).
- **Non-recursive.** Subdirectories are reported as skipped, never silently
  walked or silently ignored.
- **Originals are never modified.** They are copied in hash-named and untouched;
  the proxy (D-25) is a derived artefact.
- **Re-ingest is a cache hit** (REQ-005): a source whose content hash already
  has a stored original and proxy repeats neither the copy nor the encode.

## What it does not do

No indexing, no transcription, no scene detection — those are `index` (Phase 2).
HDR is *detected and recorded* but not converted; tone-mapping is REQ-089,
product Phase 1.
