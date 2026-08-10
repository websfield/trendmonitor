# Tech Spec: Cutdown — Editorial Engine Runtime

**Companion to:** `PRD.md` (product requirements, editorial principles, phased roadmap, risk register). Where this document and PRD §10.3 disagree on repository mechanics, **this document supersedes**.
**Also read:** `decisions.md` (the Phase 0 decision record — every default this spec relies on, with revisit triggers) and `developer-guide.md` (environment setup, working agreements, escalation protocol).
**Scope of this document:** how Cutdown is actually built — repository layout, execution contracts, the skills system that carries it from a Claude Code–operated local tool to a standalone API platform, and the Phase 0 build sequence.
**Relationship to the rest of this repo:** Cutdown is an independent product. It shares no runtime, data store, or invariant with the UGC Intelligence system in `src/` (see [§14](#14-relationship-to-the-ugc-intelligence-system-in-this-repo)). It lives in this repo only because it is being incubated here.

---

## 1. Delivery Model — Three Stages

The PRD (§10.3) already commits to "local-first, Claude Code–assisted" for Phase 0–1. This section makes the mechanics of that explicit, because the transition path is a first-class design constraint, not an afterthought.

| Stage | What runs | Who drives it | What's authoritative |
|---|---|---|---|
| **A — Embedded (PRD Phase 0–1)** | The `cutdown/` folder in this repo: a TypeScript CLI + Python workers, executed locally | Claude Code, via slash-command skills that shell out to the CLI | Files on disk under `cutdown/project-data/` |
| **B — Hosted proving ground** (PRD Phase 1.5) | Same core packages, wrapped by a Temporal-backed API service | A thin web UI + the same CLI (now a client of the API) | PostgreSQL + object storage |
| **C — Standalone platform** (PRD Phase 2+) | `cutdown/` extracted to its own repo/deployment | External users via API; Claude Code (or any agent) becomes one API client among others | The API, backed by the same contracts |

The mechanism that makes A → B → C a refactor rather than a rewrite is: **every unit of editorial capability is a "skill" — a self-contained, file-based package with one execution contract, callable identically by a human, by Claude Code, by a Temporal activity, or by an HTTP handler.** §6 defines this precisely. Everything else in this document exists to keep that contract honest.

---

## 2. Repository Layout

Cutdown lives at the repo root, as a sibling of `src/`, `docs/`, `config/` — **not** nested inside `src/`. This is deliberate: it must be extractable (Stage C) with a directory copy or `git subtree split`, not a refactor that untangles it from the UGC Intelligence planes.

**Self-rooted workspace.** `cutdown/` carries its own `pnpm-workspace.yaml`, `package.json`, and `pyproject.toml` (uv workspace). It **references nothing above itself** — that is the load-bearing half, and it is what makes the Stage C extraction a directory copy. The converse ("nothing above references it") holds for *source dependencies* and has exactly two deliberate exceptions, both artefacts *about* Cutdown rather than depended on by it: the generated `.claude/skills/cutdown-*` mirror (D-55) and `.github/workflows/cutdown.yml` (D-57). Neither is read by anything under `cutdown/`; both are re-created rather than copied at a Stage C extraction (§14). all commands run as `pnpm -C cutdown ...` (or from inside the directory). This is what makes the Stage C extraction a directory copy. The parent repo's build systems (npm frontend, dotnet, root uv) are untouched.

```text
cutdown/
  pnpm-workspace.yaml       # workspace root is HERE, not the repo root
  package.json
  pyproject.toml            # uv workspace for workers/
  .tool-versions            # pinned toolchain (see developer-guide.md §Toolchain)
  apps/
    cli/                    # TypeScript CLI — the operator surface for Stage A
    review-web/             # Local review UI (Phase 1); becomes the hosted UI in Stage B. NOT in Phase 0 — see §7 `approve`.
  packages/
    contracts/              # JSON Schemas + generated TS/Python types (source of truth, see §3)
    editorial/              # brief, story-plan, critic, revision orchestration (PRD §10.4 stages)
    platform-registry/      # platform capabilities, safe zones, policy packs
    renderer-core/          # RendererAdapter interface + render manifest execution
    renderer-ffmpeg/        # FFmpeg + libass implementation — the Phase 0 default (see decisions.md D-16)
    renderer-remotion/      # Remotion implementation — Phase 1, after the license decision (decisions.md D-16)
    otio-bridge/            # PlatformEDL <-> OpenTimelineIO mapping (thin TS shell; the mapping itself runs in Python via workers/, where the mature OTIO implementation lives)
    qa/                     # technical, editorial, accessibility validators
    style/                  # Style Profile schema + resolution logic
    trends/                 # Trend Signal schema + curation tools (Phase 1)
  skills/                   # Canonical skill definitions — see §6. Source of truth; NOT .claude/skills/
    brief/
    ingest/
    index/                  # ONE public skill; transcript/shots/OCR/audio/quality are internal resumable sub-stages (see §6.5)
    propose/
    plan/
    validate/
    render/
    revise/
    package/
    approve/
    evaluate/
    meta-schema.json        # validates every SKILL.md frontmatter — strict, committed, versioned
    registry.json           # generated — do not hand-edit
  workers/
    indexer-python/         # ASR, shots, OCR, CV, audio analysis, Moment extraction
    evaluation-python/      # offline metrics, golden-set scoring
  workflows/
    local/                  # Stage A/B durable runner (see §8)
    temporal/               # Stage B/C workflow + activity definitions
  data/
    platform-capabilities/  # incl. safe-zone overlay JSONs (normalized rect list per device class)
    policy-packs/
    rulesets/               # incl. technical-qa-v1.yaml — the numeric QA thresholds (see §12.1)
    trend-signals/
    fonts/                  # OFL-licensed caption fonts, referenced by hash (decisions.md D-29)
    golden-sets/
  project-data/             # gitignored — real job state, see §9.1
    jobs/<job-id>/...
    index.db                # SQLite projection of run logs — rebuildable, never authoritative (§8)
```

`.claude/skills/cutdown-<name>/*` is a **generated mirror** of `cutdown/skills/*` (§6.3) — flattened and prefixed (`cutdown-propose`, `cutdown-render`, …) to avoid collisions with the pack skills already installed in this repo (`review`, `plan`, `validate` all exist there), and never edited directly, so there is exactly one source of truth for skill behaviour regardless of which execution mode picks it up.

---

## 3. Core Contracts

The PRD (§5) defines thirteen versioned objects; the primary lineage chain is `JobBrief → SourceAsset → SourceIndex → Moment → CreativeBrief → MasterStoryPlan → PlatformEDL → RenderManifest → ContentPackage → PerformanceObservation`, with `StyleProfile`, `TrendSignal`, and `PlatformCapability` as effective-dated side inputs.

Engineering rules for this layer:

- **JSON Schema is the only source of truth**, at `cutdown/packages/contracts/schemas/<object>-v<major>.json`. TypeScript types and Python Pydantic models are generated from it (`cutdown build:contracts`), never hand-written in either language. Generators: `json-schema-to-typescript` (TS types) + Ajv (TS runtime validation) + `datamodel-code-generator` targeting Pydantic v2 (Python). No Zod — one contract dialect, not two (decisions.md D-24).
- **Schemas are written to a documented style subset** so both generators stay valid: pinned draft 2020-12; closed objects (`additionalProperties: false`); tagged unions only (`oneOf` + a `const` discriminator field); no `if/then/else`, no `patternProperties`, no schema-valued `additionalProperties`, no cross-file `$ref` cycles. `build:contracts` runs **both** generators and fails on either; `validate:contracts` validates every fixture through both Ajv and the generated Pydantic model — agreement between the two validators is itself part of the contract.
- Every schema file records `$id`, `schemaVersion`, and a `changelog` array whose entries carry `changedAt`, `changeKind: breaking | compatible | editorial`, and a concise reason. A **semantic** change (new required field, changed meaning, removed field) bumps the major version and adds a new file — it never mutates a published schema in place. The contract build appends an immutable `contract-change` run-log event with old/new schema IDs and hashes; this timestamped event, joined to each package's `contractSet`, makes the “last ten outputs” criterion computable. A clarifying description or optional field is a compatible change in the same major-version file.
- Generated TypeScript and Python contract types are committed beside their generators. They are never gitignored. A schema change, its changelog entry, and regenerated types land in the same commit; `cutdown build:contracts --check` fails when regeneration would dirty either generated tree. The workspace lockfiles (`pnpm-lock.yaml`, `uv.lock`) are committed so this check and the pinned-local render proof are reproducible.
- Every generated object instance carries `schemaVersion`, `createdAt`, `createdBy` (skill name + version, not a human unless human-authored), and parent object IDs (§9.1's lineage rule). **`createdAt`/`createdBy` are envelope metadata, excluded from the content hash** that keys caching and identity — otherwise two identical re-runs hash differently and the REQ-005 cache never hits.
- **Conventions with high blast radius, fixed now** (each is a bet the "no breaking contract change in the last 10 outputs" exit criterion rides on): timecode is rational — `{num, den}` timebase plus integer frame/sample counts, never float seconds; object IDs are ULIDs; closed enums (platform, objective, hook family, narrative function) live in `packages/contracts/enums/` as single-source registries that schemas `$ref`. Anything not fixed here is developer-decidable with a changelog entry (see `developer-guide.md` §Escalation).
- `cutdown build:contracts --check` and `cutdown validate:contracts` are entry-gate commands (§12): generated outputs must be current, every schema must parse, and every fixture in `data/golden-sets/` and `skills/*/fixtures/` must validate against its declared version.

This mirrors the convention already used for `rubric-v1.json` / `events-v1.json` / `mechanisms-v1.json` in `docs/initial/schemas/` — same discipline, independent files, independent version lineage. Cutdown's schemas are **not** related to those and must not import from them.

---

## 4. Pipeline Architecture

The eight bounded stages from PRD §10.4, plus Moment extraction (which PRD §10.4 leaves implicit), map to concrete packages so no stage is ever "a big prompt over the whole index":

| Stage | Package | Input | Output | Model use |
|---|---|---|---|---|
| Brief resolver | `packages/editorial/brief` | `JobBrief` draft | Validated `JobBrief` + missing-field report | None (deterministic validation) |
| **Moment extraction** | `workers/indexer-python` (final index sub-stage) | `SourceIndex` | `Moment[]` (the Moment Graph) | **Deterministic candidate segmentation** — speaker-turn × shot-boundary intersection, 3–30 s target granularity — with optional LLM enrichment for narrative-function tags only. Segmentation is never model-driven; granularity is tuned against real footage and recorded as part of the indexer version. |
| Moment retrieval | `packages/editorial/retrieval` | `JobBrief`, `Moment[]` | Ranked `Moment[]` candidate set | Embedding search only. Stage A: local sentence-transformers model (bge-small-en-v1.5), brute-force cosine in-process — Moment counts per job are small; pgvector arrives with Stage B (§9.2). Model ID recorded per REQ-005 so the Stage B migration is a re-embed, not a redesign. |
| Angle generator | `packages/editorial/angles` | `JobBrief`, `Moment[]` | `CreativeBrief[]` | LLM, structured output |
| Story planner | `packages/editorial/story-plan` | `CreativeBrief` | `MasterStoryPlan` | LLM, structured output |
| Platform adapter | `packages/editorial/platform-adapt` | `MasterStoryPlan`, `PlatformCapability` | Platform-specific structure directives | LLM, structured output |
| EDL resolver | `packages/editorial/edl-resolve` | Platform directives, `Moment[]` | `PlatformEDL` | LLM proposes ranges; deterministic code validates against `SourceIndex` timebase |
| Critic & validators | `packages/qa/*` | `PlatformEDL` | Pass/fail + findings | LLM critic is advisory evidence only; deterministic/versioned validators own blocking decisions per D-37. The two result sets remain separate, and neither may be silently reclassified. |
| Revision engine | `packages/editorial/revise` | Note + target object | New revision of the narrowest affected object | LLM interprets note into structured constraints; deterministic code applies them |

**Structured-output contract (every "LLM, structured output" row):** the model is constrained to the skill's `output.json` (or a named subset), enforced via the provider's structured-output/tool-use mechanism where available. On a schema-parse failure: **one** repair retry, then exit non-zero with a structured error (§6.2) — never a partial `--output` write, never a silently coerced result. Provider and model ID are recorded in every produced artefact (PRD §10.6); the Phase 0 provider defaults live in decisions.md D-21.

Each stage is a skill (§6) with its own input/output schema, retry policy, and fixture set — this is the enforcement mechanism for "bounded stages," not just a diagram.

---

## 5. Data Model Notes

See PRD §9 for the full ER diagram. Engineering-specific additions:

- **Stage A** persists everything as files under `project-data/jobs/<job-id>/`. The append-only `run-log.jsonl` per job, plus the content-hashed artefacts on disk, are the **authoritative** state record. `project-data/index.db` (SQLite) is a queryable **projection** of the run logs for fast lookup and runner scheduling — on startup, or on any divergence, the runner rebuilds it by replaying the run logs (`cutdown rebuild-index`). Deleting `index.db` must never lose job state. (§8 details the runner's use of both.)
- **Stage B/C** moves the system of record to PostgreSQL + S3-compatible object storage per PRD §10.2. The migration is additive: the same immutable-revision objects are written to both places during the Stage A→B transition window so nothing is re-derived by hand.
- Immutability rule for `CreativeBrief`, `MasterStoryPlan`, `PlatformEDL`, `RenderManifest`, `ContentPackage`: a new file (or row) per revision, parent ID recorded, never an in-place edit. This is what makes review diffs and rollbacks possible without a separate audit log.

---

## 6. The Skills System

This is the mechanism that makes Stage A → B → C a single codebase instead of three.

### 6.1 Anatomy of a skill

```text
cutdown/skills/<name>/
  SKILL.md          # frontmatter (below) + human-readable description
  schema/
    input.json      # JSON Schema for the request
    output.json     # JSON Schema for the result
  src/              # the implementation (TS or Python)
  fixtures/
    <case>/input.json
    <case>/expected-output.json      # exact fixtures (deterministic skills)
    <case>/recorded-model.json       # constrained fixtures (model skills) — see §6.6
```

`SKILL.md` frontmatter (validated strictly against `skills/meta-schema.json` at sync time — unknown keys rejected, every `contractsUsed` entry must exist in `packages/contracts/schemas/`):

```yaml
name: propose
skillVersion: 1.2.0
description: Generate distinct CreativeBrief variants from a job's Moment Graph.
entrypoint: ["node", "dist/main.js"]     # argv array, cwd = skill dir — see §6.2
execution: sync                          # sync | async — async skills return an operation handle (§10)
inputSchema: ./schema/input.json
outputSchema: ./schema/output.json
contractsUsed:
  - job-brief-v1
  - moment-v1
  - creative-brief-v1
sideEffects: [writes-project-data, network]   # array of: reads-project-data | writes-project-data | network
timeoutSeconds: 300                      # both the local runner AND the Temporal activity derive their timeout from this field (async skills also declare heartbeatSeconds)
```

### 6.2 Execution contract

Every skill declares its entrypoint as an **argv array** (`["node", "dist/main.js"]`, `["uv", "run", "main.py"]`), resolved with the skill directory as working directory. Every caller — CLI, local runner, Temporal activity, HTTP shim — spawns that argv **directly, never through a shell**, appending `--input <path-to-request.json> --output <path-to-result.json>`. This is deliberately not "an executable file": bare executables need shebangs or exec bits that don't exist on Windows, and shell-free spawning removes an entire injection class.

The contract, regardless of language:

- Reads and validates the request against `schema/input.json` before doing anything else; a validation failure exits non-zero with a structured error on stderr — **never** a partial write to `--output`.
- **Structured error shape** (one JSON object on stderr): `{code, message, skill, skillVersion, details?}`. Exit code 2 = input validation failure, 3 = runtime failure. Every caller surfaces this object, not a stack trace.
- On success, writes a result conforming to `schema/output.json` and exits 0. **Output writes are atomic** (temp file + rename); the presence of an output file is only trusted alongside its `run-log.jsonl` completion entry.
- **Idempotency means safe, not identical.** Re-invocation with the same input and job state must either (a) return the previously recorded result for that input hash — a cache short-circuit keyed against `run-log.jsonl` — or (b) produce a **new immutable revision** with correct lineage. Never a partial write, an in-place mutation, or a duplicated state transition. Byte-level determinism is required only of skills with no model call, and is asserted per §12. This definition is what the local runner's resume (§8) and Temporal's at-least-once activity semantics (§6.4) both rely on.

This is the same shape as an OpenAPI operation and the same shape as a Temporal activity, on purpose — it is designed to be wrapped by either without changing the entrypoint.

### 6.3 Four callers, one contract

- **Claude Code (Stage A):** `cutdown skills sync` generates `.claude/skills/cutdown-<name>/SKILL.md`. The wrapper is not just a command line — a conversational invocation (`/cutdown-propose make 3 variants for job X`) arrives as free text, so the generated body instructs the agent to: (1) build a request object valid against the skill's `input.json` from the user's ask, asking for any missing required field; (2) write it to `project-data/jobs/<id>/requests/<ulid>.json`; (3) run `cutdown skills run <name> --input <that> --output <result path>`; (4) read the result and report — or, on non-zero exit, surface the structured stderr error. Generated frontmatter carries the prefixed unique `name`, an invocation-worthy `description`, and the tool permission for the `cutdown` CLI.
- **Local workflow runner (Stage A/B):** spawns the entrypoint argv directly as a subprocess step (§8).
- **Temporal activity (Stage B/C):** an activity wrapper (`cutdown/workflows/temporal/activities/<name>.ts`) spawns the identical argv. The wrapper is glue plus three real obligations the subprocess can't own: **staging** (materialize inputs from object storage to worker-local disk, upload outputs after — entrypoint paths are worker-local staging, not durable locations), **heartbeats + cancellation** (long renders exceed default activity timeouts; the wrapper heartbeats per `heartbeatSeconds` and kills the child on cancel), and **payload discipline** (Temporal caps payloads ~2 MB; activity inputs/outputs are references to artefacts, never media — PRD §10.5 already requires this).
- **HTTP handler (Stage C):** `cutdown skills serve` (a small Fastify shim, built once the API is real) generates one route per skill directly from `registry.json` — same input/output schemas become the request/response bodies and the OpenAPI spec is generated, not hand-maintained. Skills with `execution: async` generate the operation-handle pattern instead (§10).

### 6.4 Registry and versioning discipline

`cutdown skills sync` regenerates `skills/registry.json` by scanning every `SKILL.md`, validating its frontmatter against `skills/meta-schema.json` (strict from day one — decisions.md D-15), and failing the build if any skill's `contractsUsed` references a schema version that no longer exists. A schema bump (§3) is therefore a **compile-time-visible** event for every skill that reads or writes that object.

### 6.5 Skill granularity

`index` is **one public skill**; transcript, shot/scene, OCR, audio-event, quality-flag, and Moment-extraction passes are internal sub-stages, each an individually resumable checkpoint recorded in `run-log.jsonl`, each with its own fixture directory under `skills/index/fixtures/`. One public surface keeps the registry, the CLI, and the `.claude` mirror stable while the sub-stage list evolves.

### 6.6 Two kinds of fixtures

- **Exact** (deterministic skills — ingest, validate's deterministic half, package): compare canonicalized output against `expected-output.json`.
- **Constrained** (model skills — propose, plan, revise, the critic): run against a **recorded model response** (`recorded-model.json`) for byte-stable regression, plus schema-validity and property assertions ("N briefs returned; every referenced moment ID exists in the input") that also run against the live model via the explicit local command `cutdown test:models --live`. This command is not part of the ordinary entry gate, but its recorded output is required for Phase 3 acceptance. An exact-compare fixture for an LLM skill would be permanently red or permanently mocked without saying so — this split says so.

---

## 7. CLI Command Reference

Skill commands (one per skill) plus meta commands. **Convention:** bare verbs are skill commands operating on a job; colon-suffixed commands (`build:contracts`) are repo/meta commands operating on the codebase.

| Command | Skill(s) invoked | Notes |
|---|---|---|
| `cutdown brief <job-id> --file <brief.yaml\|json>` | `brief` | JobBrief intake: validates against `job-brief-v1` (REQ-002 required fields, incl. stable `accountId`), writes to `brief/`. Non-interactive — missing required fields fail with the field names listed |
| `cutdown ingest <file-or-directory> --job <id> [--rights-manifest <file>]` | `ingest` | Phase 0's REQ-001 path is a **non-recursive local directory** containing any supported video, audio, image, logo, subtitle, or brand-reference files; a single file is shorthand for a one-asset job. Discovery order is normalized relative-path order. Every asset is classified, hashed, and preflighted; unknown/unsupported entries fail with the relative path. Rights arrive from per-asset `<asset>.rights.yaml` sidecars or a job-level manifest keyed by relative path; absent records become `rights: unknown`. Artefacts commit to the job only after the whole inventory validates, so a mixed directory cannot land half-ingested. Option-shaped paths and special FFmpeg protocols are rejected, but ordinary directories are valid. |
| `cutdown index <job-id> [--speaker-map <yaml>]` | `index` | Runs internal sub-stages; optional speaker map applies manual names/corrections by stable turn ID while preserving inferred values and correction lineage |
| `cutdown propose <job-id> --variants N` | `propose` | Angle generator stage |
| `cutdown plan <creative-brief-id> --platform X` | `plan` | Story planner + platform adapter, one call per platform |
| `cutdown validate <platform-edl-id>` | `validate` | EDL resolver's deterministic checks + critic |
| `cutdown render <platform-edl-id> --tier draft\|final [--approval <review-decision-id>]` | `render` | Draft dispatch is direct. Final dispatch requires an approved ReviewDecision whose subject EDL/manifest matches; only the renderer's internal fixture harness may exercise final encoding without approval. This preserves the REQ-152 order across every public caller. |
| `cutdown revise <render-id> --notes "..."` | `revise` | Targets the narrowest affected object — REQ-039 / PRD §10.4 stage 8 |
| `cutdown approve <draft-render-id> --by <name> [--reject --reason "..."]` | `approve` | Writes a `ReviewDecision` whose subject is the reviewed draft render plus its EDL and RenderManifest revisions. Approval advances the runner to final rendering; rejection advances only through `revise`. A decision never references a not-yet-created package. |
| `cutdown package <final-render-id>` | `package` | After approval and passing final QA, assembles the `ContentPackage` + rights manifest + QA report and records the approval ID. Direct invocation fails if approval, final QA, or rights evidence is missing. |
| `cutdown evaluate <package-id> --analytics <file.csv>` | `evaluate` | Phase 1 CSV import path (REQ-120) |
| `cutdown skills run <name> --input <f> --output <f>` | any | Direct single-skill invocation — what the `.claude` mirror and scripts call |
| `cutdown skills sync` | — | Regenerates `registry.json` + `.claude/skills/cutdown-*` mirror |
| `cutdown skills serve` | — | Stage C HTTP shim (localhost, no auth, optional at Stage A — decisions.md D-13) |
| `cutdown build:contracts [--check]` | — | Runs both generators; `--check` fails if committed generated trees are stale (§3) |
| `cutdown validate:contracts` | — | Entry-gate: schemas parse, all fixtures re-validate through Ajv + Pydantic |
| `cutdown test:skills [name]` | — | Runs per-skill fixtures (§6.6) |
| `cutdown test:models --live` | — | Explicit local, non-entry-gating live-model property suite; recorded output is required for `PHASE_3_ACCEPTED_LIVE` |
| `cutdown rebuild-index` | — | Rebuilds `project-data/index.db` from run logs (§5) |
| `cutdown status --phase0` | — | Computes the four Phase 0 exit criteria from stable `accountId`, `sourceClassification`, package `contractSet`, approval, final-range-validation, QA, and rights evidence (D-36; §15 step 10). It reports `PIPELINE_IMPLEMENTATION_COMPLETE` separately from `PHASE_0_EXIT_EARNED` (D-38). |

---

## 8. Local Workflow Runner (Stage A/B)

A Temporal workflow at Phase 0 is premature (PRD Open Decision #6, settled as decisions.md D-11) — but the *shape* of Temporal's guarantees (resumable, idempotent, retry-aware, survives process death) is not optional, because indexing and rendering are exactly the long-running, failure-prone steps that need it.

Design:

- `workflows/local/` implements a minimal durable runner on `better-sqlite3` with a hand-rolled two-table state machine (jobs, skill invocations) — no queue library (decisions.md D-11). Each job's state machine follows REQ-152's states: `uploaded → preflight → indexing → moment-extraction → brief-generation → edl-generation → validating → draft-rendering → review → final-rendering → packaging → [publishing] → completed | blocked | failed`. `publishing` exists in the shared state model but is a **Stage B+ state** — the Phase 0 runner transitions `packaging → completed` directly; keeping the state name in the model is what lets the Temporal workflow reuse the machine verbatim.
- Every skill invocation from the runner is logged with its input hash, output location, and duration to `project-data/jobs/<job-id>/run-log.jsonl` — the **authoritative**, append-only record. The state-machine row in `index.db` is a projection of it (§5): on divergence, the run log wins and the row is rebuilt.
- Resume-on-restart: on startup, the runner scans for jobs not in a terminal state and re-derives the next pending step **from the recorded output IDs in the run log** — a completed LLM stage is never re-run (its output is already immutable state); an incomplete step re-executes safely under §6.2's idempotency definition, short-circuiting via the input-hash cache where the work already landed.
- The **same state-machine states and the same activity-boundary names** are reused verbatim by the Stage B/C Temporal workflow definition (`workflows/temporal/job-workflow.ts`) — the migration from local runner to Temporal is a runner swap behind an unchanged state model, not a redesign.

---

## 9. Storage

### 9.1 Stage A layout (filesystem)

```text
project-data/jobs/<job-id>/
  brief/            JobBrief revisions
  source/           Original assets (hash-named, immutable)
  proxy/            Proxy renders (720p-fit H.264 CRF 23 + AAC 128k, CFR — decisions.md D-25; recorded as proxyProfileVersion in the SourceIndex)
  index/            SourceIndex artefacts, keyed by content hash + indexer version (§3, REQ-005)
  moments/          Moment Graph
  creative-briefs/  Immutable revisions
  story-plans/
  edl/
  renders/          draft/ and final/ tiers, versioned
  packages/         ContentPackage output (incl. rights manifest + QA report)
  reviews/          ReviewDecision records from `cutdown approve`, ONE FILE PER DECISION,
                    named `<reviewDecisionId>.json` — and nothing else. This directory is a
                    NAMESPACE, not a folder: `resolveApprovalForManifest` treats every
                    `<ulid>.json` directly inside it as a candidate decision, and any one it
                    cannot read makes the whole approval `indeterminate` (fail closed —
                    the missing file could be the rejection that supersedes an approval).
                    Anything else a step wants to write here goes in a SUBDIRECTORY:
    reviews/gates/    `validate`'s `<edlId>-gate.json` and `<edlId>-critic.json` (§step 5)
    reviews/pending/  the review payload a draft render leaves for a reviewer (REQ-110)
  requests/         Request payloads authored by callers (the .claude mirror writes here)
  traces/           OTel spans (file exporter — §13)
  run-log.jsonl     Authoritative skill-invocation record (§5, §8)
```

`project-data/` is gitignored (large binary media, potentially rights-sensitive). Golden-set fixtures under `data/golden-sets/` are the tracked, permissioned equivalent used for regression (§12) — in-repo while small; revisit at ~200 MB (decisions.md D-14).

### 9.2 Stage B/C

PostgreSQL owns the relational/lineage data (jobs, briefs, plans, EDLs, approvals, metrics — PRD §9.1); S3-compatible storage owns binary media (originals, proxies, renders, packages), addressed by content hash. `pgvector` serves Moment/embedding retrieval (index types cap around 2000 dimensions — choose embedding models accordingly; the Stage A default, bge-small at 384 dims, is safely inside it) until scale or latency data justifies a dedicated vector store (PRD §10.2). No stage of Cutdown uses the UGC Intelligence system's Postgres instance, schema, or tenancy model — a new database, provisioned independently.

---

## 10. API Surface (Stage C)

Not built at Phase 0. Specified now so the skill contract (§6) is designed toward it rather than backfilled:

- One HTTP route per skill, generated from `registry.json`: `POST /v1/skills/<name>` with the skill's `input.json` as the request body. Skills with `execution: sync` return `output.json` as the response body; skills with `execution: async` (`index`, `render`) return **202 + an operation handle** typed by `operation-v1.json` (a contract schema like any other); the caller polls `GET /v1/operations/<id>` or receives a webhook — the same resumability semantics the local runner already has (§8), exposed over HTTP. The generated OpenAPI is honest about both shapes because the async marker lives in the registry.
- Auth, tenancy, and rate limiting are additive concerns layered in front of this surface at Stage B (workspace isolation, per PRD REQ-150) — they do not change the skill contract itself.
- The API is versioned by `schemaVersion` of the objects it accepts/returns, not by a separate API version number — a contract bump (§3) is the only thing that can be a breaking API change.

---

## 11. Renderer & Media Pipeline

- `packages/renderer-core` defines `RendererAdapter`: `plan(RenderManifest) → RenderPlan`, `execute(RenderPlan) → Render`. No editorial package calls FFmpeg or Remotion directly — only through this interface (PRD REQ-081).
- **Phase 0 default adapter is `renderer-ffmpeg` (FFmpeg + libass)** — open captions, cuts, crops, audio mix, and both proxy-draft and source-final tiers; sufficient for Phase 0 and free of the Remotion company-license question, which is owner-owned (decisions.md D-16). `renderer-remotion` lands in Phase 1 for motion graphics and animated captions, behind the same adapter, selectable per `RenderManifest.rendererProfile` without touching editorial code. Remotion remains the declared default *for motion graphics* — which Phase 0 doesn't have.
- FFmpeg invocations are centralized in one module (`packages/renderer-core/src/ffmpeg.ts`) that **spawns FFmpeg with an argv array and no shell**, applies FFmpeg's own filtergraph escaping to any user-derived text entering a filter (caption text and font paths inside `subtitles=`/`drawtext=` are where user text actually breaks out — shell escaping is the wrong frame), enforces `-protocol_whitelist file,pipe`, and rejects input paths that are option-shaped (leading `-`) or non-absolute. This is a hard rule, not a preference: source filenames and caption text are user-controlled.
- Caption fonts are OFL-licensed (Inter as the Phase 0 default), stored in `data/fonts/` and referenced by hash; brand fonts arrive with StyleProfile work and require recorded commercial rights (PRD §10.8.4).
- Draft tier uses proxy media and skips expensive passes; final tier re-renders from source-hashed originals. Both manifests record the same `editorialPlanHash`; the final links `approvedDraftManifestId` and may differ only in declared tier/media/encode fields. Both tiers record `rendererVersion`, `ffmpegVersion`, and font/asset references by immutable hash (PRD §10.6).

---

## 12. Testing & Fixtures

- **Entry gate:** `cutdown build:contracts --check` + `cutdown validate:contracts` + `cutdown skills sync --check` + `cutdown test:skills` + the workspace test suites + `ruff` run before anything else. Generated trees must be current, schemas parse, and fixtures pass through both validators. **Since D-57 the same gate is also CONFIGURED to run in CI on a clean clone**, on Linux and Windows, path-scoped to Cutdown (`.github/workflows/cutdown.yml`) — the local run stays the fast loop, and CI is what will prove the gate passes somewhere that is not the author's machine. Stated in the future tense deliberately: at the time of writing the branch is unpushed (owner authorisation, `todos.md` T-13) and **the workflow has never executed**, so nothing in this section may yet be read as proven by CI.
- **`cutdown doctor`** answers the environment question before the gate does: Node and pnpm against the declared `engines`, FFmpeg with libass, ffprobe, uv, the hash-pinned caption fonts, and generated-tree freshness. Every check runs, and exactly one fix is promoted — the first failure in blocking order — because a wall of equally-weighted failures is a report people skim.
- **Per-skill fixtures:** every skill's `fixtures/<case>/` set is run on every change to that skill or to a schema it declares in `contractsUsed` (§6.4) — `cutdown test:skills [name]`. Exact vs constrained per §6.6.
- **Golden sets** (`data/golden-sets/`, PRD §13.1): footage categories with expected editorial evaluation **ranges**, not exact outputs — the assertion for model-touched paths is "score within band."
- **Render determinism is a three-tier assertion**, replacing any single byte-identical claim (this is what PRD REQ-080's "documented determinism limits" hedge concretely means — and this section is where those limits are documented):
  1. **Byte-identical** — `renderer-ffmpeg` only, **within a single machine**: pinned FFmpeg build, fixed `threads=N`, `-fflags +bitexact -flags +bitexact -map_metadata -1`, `creation_time` stripped, pinned audio encoder. x264 is bit-exact under these constraints; the test asserts it. **Proof environment, as amended by D-57** (which supersedes D-33's "no CI exists at Phase 0"): the double-render runs on the pinned local machine, and is configured to run on each CI runner as well *once CI first executes* — each run asserting identity **against its own second render** — never against another machine's bytes, which tier 3 below explains is not a property this spec claims. CI pins the FFmpeg **major** and fails on a mismatch, since a major difference changes filtergraph and encoder behaviour and the gate would then be proving something other than what this section describes; a patch difference is tolerated and recorded, because every `RenderManifest` carries the exact build string and the only unacceptable difference is an invisible one.
  2. **Frame-identical** (hash of decoded frames) — the Remotion path on the *same* machine with pinned Chromium/Remotion versions, best-effort (Phase 1).
  3. **Perceptually identical** — cross-machine Remotion: SSIM/pHash within threshold, plus a byte-identical `RenderManifest` and full provenance record. Chromium rasterization is not pixel-deterministic across machines (GPU vs software rasterizer, font hinting, glyph fallback); the spec does not pretend otherwise.
- **Deterministic-only regression:** timecode/range validation, EDL-to-source-timebase checks, caption safe-zone/overflow checks are exact-match tests — these paths contain no model call and no excuse for flakiness. The load-bearing one: a **property test that no generated Moment or EDL range can exceed source bounds under the normalized timebase** — this is the mechanism behind the "zero invalid source ranges" Phase 0 exit criterion.
- **Renderer snapshot tests:** perceptual-diff on rendered frames for a small fixture set, run on every renderer-package change.

### 12.1 QA thresholds are data, not code

REQ-100/084's checks need numbers; the numbers are guesses until real footage calibrates them, so they live in a versioned ruleset — `data/rulesets/technical-qa-v1.yaml` — effective-dated per the PRD §11 philosophy, correctable without a code change. Shipped defaults: A/V sync drift < ±40 ms; true peak < −1 dBTP; caption ≤ 2 lines × 42 chars, cue ≥ 1 s, reading speed ≤ 17 cps; no black/frozen frame runs > 3 frames outside declared holds. Safe-zone overlays live in `data/platform-capabilities/overlays/` as normalized-rect-list JSONs per device class; Phase 0 ships one hand-measured TikTok overlay as a fixture.

---

## 13. Observability & Cost

- OpenTelemetry traces span a job across CLI → local runner → skill entrypoint → indexer/renderer subprocess, with the `job-id` and skill-invocation ULID as correlation IDs from day one. **Stage A exporter is file/console** — spans land in `project-data/jobs/<id>/traces/`; a real collector is Stage B. **Context propagation into subprocesses is explicit:** the runner passes `TRACEPARENT` (W3C) via environment to every entrypoint; entrypoints adopt it as parent context — there is no automatic propagation across `spawn`.
- Every skill invocation's `run-log.jsonl` entry (§8) records wall-clock duration and, where applicable, ASR/VLM/LLM token or minute usage and model identifier — the Stage A precursor to PRD REQ-153's cost metering. Each job carries a hard token budget; the Phase 0 spend ceiling is owner-set (decisions.md D-21).
- Cache-hit rate on content-hashed index/proxy artefacts (REQ-005) is logged per job; it is the single cheapest lever on both cost and latency and should be visible from the first real job.

---

## 14. Relationship to the UGC Intelligence System in This Repo

Cutdown and the UGC Intelligence system (C1–C4, `src/`) are **independent products** that happen to share a repository during incubation:

- No shared database, no shared event log, no shared call path. Cutdown never calls into `src/ControlPlane`, `src/IntelligencePlane`, or `src/KnowledgeApi`, and nothing in `src/` depends on `cutdown/`.
- Cutdown is **not** governed by this repo's CLAUDE.md "Non-negotiable rules (this project)" section (vetoes, breaker, mechanisms, ε-exploration) — those are UGC Intelligence–specific invariants. Cutdown is governed by the **golden rules** (read-before-write, no secrets, fail-closed posture generally, small verifiable steps) and by this doc set.
- The **UGC Intelligence** Critical-Path reviewer gates (`veto-verdict-integrity`, `component-boundaries`, `measurement-discipline`, `budget-exploration`) do not apply to Cutdown changes, and **cutdown-only changes are exempt from the UGC Intelligence entry-gate commands** (`dotnet build/test`, root `pytest`, frontend checks) — Cutdown's entry gate is §12's commands. Working agreements (branching, review-by-whom, commit cadence) live in `developer-guide.md`.
- **That exemption is from *those* gates, not from gating.** Cutdown carries **two Critical Paths of its own**, and a Cutdown change touching either must pass its gate in addition to ordinary code review:

  | Cutdown Critical Path | Triggered when the change touches… | Rule canon (skill) | Gate (agent) |
  |---|---|---|---|
  | **Measurement honesty** | counting & exit criteria, `status --phase0`, baselines/cohorts/denominators, uplift or performance claims, QA pass rates, latency/cache/accuracy rates, `packages/evaluation`, `output-counting-policy.md`, PRD §14/§15 numbers | `cd-measurement-honesty` | `cutdown-measurement-reviewer` |
  | **Tenancy & boundaries** | `packages/contracts/schemas/**`, `contract-set.ts`, generated trees, delivered-artefact immutability, `decisions.md`, artefact paths & containment, the skills registry / `cutdown-*` mirror, the boundary to `src/`, Review Studio & workspace isolation | `cd-tenancy-boundaries` | `cutdown-boundary-reviewer` |

  The root `CLAUDE.md` Critical-Path table carries the same two rows; the two documents must agree, and a change to one updates the other. The pack files deliberately take a `cd-` / `cutdown-…-reviewer` naming rather than the `cutdown-` skill prefix, which `skills sync` owns as a generated mirror (§6.4, D-55) and whose orphan check would fail on a hand-written directory.
- **Two host-level artefacts reference `cutdown/` from above it**, and both are deliberate rather than drift. §2's "nothing above `cutdown/` references it" is a rule about *source dependencies*, and neither of these is one: the generated `.claude/skills/cutdown-*` mirror (adjudicated in **D-55** — a projection into the host, which nothing under `cutdown/` reads), and `.github/workflows/cutdown.yml` (**D-57** — CI, which must live at the repository root because that is where the CI provider looks). Both are *about* Cutdown rather than *depended on by* it.
- If and when Cutdown is extracted to its own repository (Stage C), the only shared artefact that needs to survive the split is this doc set — no code coupling exists to unwind. **Two files must be re-created rather than copied**, because both sit outside the extracted directory: the skills mirror (D-55 — the new host regenerates it with `skills sync`) and the CI workflow (D-57 — the extracted repo gets its own, with the `cutdown/` path prefix and the path filters dropped).

---

## 15. Phase 0 Build Sequence

Ten steps, in order. The build has two non-interchangeable milestones (D-38): steps 1–9 plus the proving run can earn `PIPELINE_IMPLEMENTATION_COMPLETE`; only step 10's real-footage accumulation can earn `PHASE_0_EXIT_EARNED`. Exit criteria are PRD §15's Phase 0 row, all four: **at least 20 approved real outputs across 3 accounts; zero invalid source ranges in final renders; last 10 outputs require no breaking contract change; rights records and QA reports accompany every delivered package.** (`cutdown status --phase0` computes all four.) PRD §14.1's metric definitions are collected from the first job so Phase 1 baselines exist, but Phase 0 exit is judged on the four criteria only.

**The population those numbers are over (D-56).** The numerals are unchanged, but the denominator kind is not the delivered package. **The "20 approved real outputs" and the "last 10 outputs" are counted in *resolved outputs* — one approved cut per `CreativeBrief`, a second package for the same CreativeBrief superseding the earlier rather than adding** — and package count is never lower than output count, so `status --phase0` counting packages would report the gate as closer than it is. **No multiplier is asserted**: the only ratio measured on disk today is the two delivered `real` packages resolving to **one** output, and the owner's ~5-vs-~20-*jobs* estimate recorded in D-56 is an estimate of jobs per output, not of packages per output. Criteria 2 and 4 are denominated in **delivered packages** and carry no "real" qualifier, so both legitimately include the fixture package; real-class and fixture-class counts are reported separately and never summed. The rule itself, the class tabulation and the comparability axes live in one home, **`docs/video-editing/output-counting-policy.md`** — this section names the population kind and cites it rather than restating it.

**Owner-supplied live/exit prerequisites (see `developer-guide.md`):** 2–3 real Social Soup source files with rights records, stable account IDs, and a model-spend ceiling. Permissioned fixtures can complete steps 1–9 and the fixture proving run. Real inputs are required for `PHASE_3_ACCEPTED_LIVE`, the first real proving job, operational step 10, and `PHASE_0_EXIT_EARNED`.

1. **Contracts package.** `packages/contracts/` with `job-brief-v1.json`, `source-asset-v1.json`, `source-index-v1.json`, `moment-v1.json`, the enum registries, and a runnable `validate-contracts` script (plain `node` script — the `cutdown` CLI doesn't exist yet; the script is promoted into the CLI in step 2). *Done when:* both generators run clean and the script passes on the fixture set.
2. **CLI skeleton + `brief` + `ingest` skills** (JobBrief intake; multi-asset directory discovery; complete REQ-004 preflight; hash; proxy per D-25; per-asset rights records) against real or placeholder footage; `validate-contracts` becomes `cutdown validate:contracts`. *Done when:* a brief validates and lands in `brief/`, and one mixed-asset job ingests atomically — originals hash-named and untouched, video proxies play, complete preflight reports are written, and the FFmpeg capability check passes.
3. **`index` skill, sub-stage by sub-stage** (§6.5) — transcript and correctable speaker turns first (faster-whisper, D-17), then hard cuts/fades/camera changes plus longer scene grouping (PySceneDetect + versioned grouping rules, D-18), then OCR (PaddleOCR, D-19), then audio events (silero-vad + PANNs, D-20), then every REQ-014 quality flag — REQ-010 and REQ-012–015 incrementally; REQ-011 is satisfied at Phase 0 by segment-level speaker turns, an optional speaker-map correction input, and low-confidence marking; real diarisation remains deferred (D-17). *Done when:* each required field has an owning sub-stage and passing positive/negative fixtures, and every index artefact is keyed by content hash + indexer version.
4. **Moment extraction** (the deterministic segmentation stage, §4), closing REQ-018/019. *Done when:* the source-bounds property test (§12) passes over generated Moments on all fixtures — the exit-criterion mechanism, built here.
5. **Editorial skills**: `creative-brief-v1`, `master-story-plan-v1`, `platform-edl-v1`, minimal `style-profile-v1` (brand invariants only — colours, fonts, prohibitions, tone; hand-authored per client, injected into prompts and caption rendering; learned tendencies are Phase 1) + the `propose`/`plan`/`validate` skills against **one hard-coded Platform Capability fixture: TikTok organic 9:16 AU** — the PRD §11 worked example verbatim (D-3); the full registry is Phase 1 (REQ-051). The LLM critic is advisory; D-37's deterministic validators block invalid quote order/speaker identity, missing evidence, prohibited claims, rights/disclosure failures, capability violations, and invalid ranges. *Implementation-complete when:* recorded-model suites and all deterministic gates pass. *Accepted when:* with the spend ceiling set, a real indexed job yields three schema-valid distinct briefs whose references resolve and `validate` blocks the deliberately invalid cases.
6. **Render path end to end**: `renderer-core` + `renderer-ffmpeg` (D-16) + `render-manifest-v1.json`, producing a draft-tier render with open captions (Inter, D-29). *Done when:* the tier-1 byte-identical determinism test passes on the pinned local environment (D-33) and a draft render of a real EDL plays with synchronized captions.
7. **Technical QA as a hard gate** (REQ-100) reading `technical-qa-v1.yaml` (§12.1), wired so no render reaches review without a QA report. *Done when:* a deliberately broken render (silence injected, caption overflow) is blocked with an actionable report naming time range and check.
8. **`approve` + final render + `package` flow**: `review-decision-v1.json` references the reviewed draft/EDL/manifest; approval advances to final rendering and final QA; only then may `package` create `content-package-v1.json`, referencing the approval and all D-36 evidence. This is on the exit path — two of the four exit criteria (approved outputs; rights records + QA reports per package) are unmeasurable without it. *Done when:* an approval round-trips into `reviews/`, a final render passes QA, and the resulting package contains video, captions, cover frame, rights manifest, QA report, approval reference, contract set, and provenance. Packaging before approval or from a draft fails.
9. **`cutdown skills sync`** + the `.claude/skills/cutdown-*` mirror — Claude Code becomes the operator surface from this point forward. *Done when:* `/cutdown-propose` invoked conversationally produces a valid request file, runs the skill, and reports the result.
10. **Run real Social Soup jobs** across the owner-named stable account IDs, tracking exit criteria as they accumulate via `cutdown status --phase0` — not at the end. This operational accumulation follows `PIPELINE_IMPLEMENTATION_COMPLETE`. *Done when:* all four exit criteria read green on real (non-fixture) footage and `PHASE_0_EXIT_EARNED` is reported.

---

## 16. Open Technical Decisions

The fifteen decisions this section and PRD §18 used to hold open are now **closed for Phase 0** in `decisions.md` — each with a default, a rationale, and a revisit trigger; owner-owned ones carry escalation triggers instead. What genuinely remains open (Phase 1+ scope, listed there as OPEN rows): the Remotion-vs-libass economics benchmark, the music strategy, the beta platform pair, the analytics acquisition path, hosted-provider benchmarking, and `skills serve` timing. Nothing in the Phase 0 build sequence depends on any of them.
