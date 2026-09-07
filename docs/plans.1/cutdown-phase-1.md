# Phase 1 — Workspace, Contracts, CLI Skeleton, Ingest

**Feature:** cutdown · **Depends on:** none · **Owner agent:** general-purpose

## Project Conventions Pinned (READ FIRST)

**Golden rules (CLAUDE.md, verbatim — they bind this work):**
1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state.
4. **Fix causes, not symptoms.**
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that.
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.** Verify library APIs against the installed version before use.

**Cutdown-specific rules (tech-spec §14 / developer-guide §4):**
- Cutdown is **independent** of the UGC Intelligence system: never import from, call into, or modify `src/`, `tests/`, `config/`, `docs/initial/`. The four UGC Critical-Path gates do not apply; the UGC entry gate (`dotnet`/root `pytest`/frontend) does not apply to cutdown-only changes.
- Contract docs are law: `docs/video-editing/tech-spec.md` (layout §2, contracts §3, skills §6, CLI §7), `decisions.md` (D-numbers are settled — do not re-litigate), `developer-guide.md` (toolchain §1, escalation §5). A new decision → append a `decisions.md` row, keep moving; money/license/client-data/external decisions → stop and escalate.
- Stack: Node 22 LTS + pnpm 9 self-rooted at `cutdown/` (never the repo root); TypeScript 5; Python 3.12 via uv (own workspace); FFmpeg 7 full build (libass required). Windows is the primary dev machine — argv-array spawning only, no shells, no shebang reliance (tech-spec §6.2).
- Schemas: JSON Schema draft 2020-12, closed objects, tagged unions, two-generator subset; semantic change = new major file + changelog + regenerated, **committed** types in the same commit. Generated types and both workspace lockfiles are never gitignored (tech-spec §3).
- Available agents: owner **general-purpose**; gate **code-reviewer**. Do NOT request `control-plane-engineer`, `intelligence-plane-engineer`, `frontend-engineer`, `eval-harness-engineer` (UGC-specific).

## Requirements Checklist (functional)

- [ ] REQ-001 (one non-recursive local directory per multi-asset job; video/audio/image/logo/subtitle/brand-reference classification), REQ-002 (explicit JobBrief — all required fields incl. stable `accountId`), REQ-004 (every named preflight field), REQ-005 (content hashing + cache keying), REQ-003 (per-asset sidecar or job-level `--rights-manifest`; absent record ⇒ `rights: unknown`)
- [ ] tech-spec §15 steps 1–2 with their *Done when* criteria

## Requirements Checklist (technical)

- [ ] tech-spec §3 contract rules (envelope metadata excluded from content hash; ULIDs; rational timecode; enum registries)
- [ ] tech-spec §6.1/6.2 skill anatomy + execution contract for `ingest` (argv entrypoint, atomic output, structured error `{code,message,skill,skillVersion,details?}`, exit 2/3)
- [ ] developer-guide §1 toolchain pinned in `.tool-versions` + `engines`

## Implementation Tasks

| # | Task | File(s) |
|---|---|---|
| 1 | Workspace scaffold: pnpm + uv workspaces, `.tool-versions`, committed `pnpm-lock.yaml`/`uv.lock`, and `cutdown/.gitignore` that ignores only runtime/sensitive outputs (`project-data/`, `.env`, caches) — **not generated contract types** | `cutdown/pnpm-workspace.yaml`, `cutdown/package.json`, `cutdown/pnpm-lock.yaml`, `cutdown/pyproject.toml`, `cutdown/uv.lock`, `cutdown/.tool-versions`, `cutdown/.gitignore` |
| 2 | Contracts package: `job-brief-v1` with stable `accountId` + optional display name; `source-asset-v1` with asset kind, rights record, and `sourceClassification` set to `real` or `fixture`; `source-index-v1`, `moment-v1`; enums and changelogs. Package/status evidence fields introduced later must reuse these identities | `cutdown/packages/contracts/schemas/*.json`, `cutdown/packages/contracts/enums/*.json` |
| 3 | Codegen pipeline: `json-schema-to-typescript` + Ajv (TS), `datamodel-code-generator` → Pydantic v2 (Python); generated trees committed; `build:contracts --check` regenerates to temp and fails on diff; subset lint rejects unsupported schema constructs | `cutdown/packages/contracts/src/{generate,subset-lint,check-generated}.ts`, `cutdown/packages/contracts/generated/{typescript,python}/**` |
| 4 | `validate-contracts` runnable script (plain node; promoted into CLI in task 6): schemas parse, fixtures validate through **both** Ajv and Pydantic | `cutdown/packages/contracts/src/validate.ts` |
| 5 | Seed fixtures: one valid + one invalid instance per schema | `cutdown/packages/contracts/fixtures/**` |
| 6 | CLI skeleton (`cutdown` bin via pnpm): command router, `skills run` plumbing (argv spawn, no shell, `--input/--output`, TRACEPARENT env pass-through stub), `validate:contracts`, `build:contracts` | `cutdown/apps/cli/src/**` |
| 7 | `brief` skill (TS): JobBrief intake — validate a supplied YAML/JSON against `job-brief-v1` (Ajv), write to `brief/`; missing required fields fail listing the field names (non-interactive) | `cutdown/skills/brief/**` |
| 8 | Atomic multi-asset `ingest` skill: accept one file or a non-recursive directory; normalize discovery order; classify video/audio/image/logo/subtitle/brand-reference; reject unknown entries by relative path; associate per-asset sidecars or a job-level rights manifest; run complete REQ-004 preflight (container, codec, fps/VFR, timebase, rotation, colour, HDR, audio tracks/sample rate, corruption, duration); hash originals, proxy supported video/audio, and commit the job inventory only after every asset validates. Re-ingest short-circuits by content/config hash | `cutdown/skills/ingest/**`, `cutdown/packages/renderer-core/src/ffmpeg.ts` |
| 9 | OTel bootstrap: file/console exporter writing spans under `project-data/jobs/<id>/traces/` | `cutdown/apps/cli/src/otel.ts` |
| 10 | Permissioned ingest fixtures: the three short video clips (`test-1` clean, `test-2` VFR/rotation/HDR-metadata edge, `test-3` silent b-roll); `mixed-job-valid/` with every supported asset class and completed sidecars; and `mixed-job-unsupported/`, the same corpus plus one unsupported member, for atomic rollback. All valid assets declare `sourceClassification: fixture` | `cutdown/data/golden-sets/ingest/**` |

## Edge Cases & Failure Paths

- Corrupt/truncated or unsupported member in a directory → structured error naming the relative path; **no job inventory or partial source set is committed**. Rights manifests with missing/extra/duplicate relative paths fail explicitly. VFR is normalized with mapping recorded; rotation is display-correct; HDR is detected and recorded even though conversion is Phase 1. Unicode/spaces are valid; option-shaped paths and special protocols are rejected. Re-ingest is a cache hit. Missing libass/FFmpeg fails fast. Mid-write failure leaves only removable staging data.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Proof |
|---|---|---|---|
| ffprobe/ffmpeg subprocess | non-zero exit / hang | structured error, exit 3; timeout from `timeoutSeconds`; no partial output | fixture test with corrupt clip |
| Filesystem | mid-write crash | temp+rename atomicity; presence trusted only with run-log entry | kill-during-write test |
| Codegen toolchain | generator disagreement | `build:contracts` fails the build; no silent single-language types | local `cutdown build:contracts` run (no CI at Phase 0 — D-33) |

## Handoff Contracts (consumed by Phase 2+)

- The four v1 schemas + enums (Phase 2 reads `source-index-v1`, `moment-v1`; Phase 3 reads `job-brief-v1`).
- `cutdown skills run` invocation plumbing + structured-error shape.
- `ffmpeg.ts` argv-spawn module.
- Hash-named `source/` + `proxy/` layout per tech-spec §9.1.

## Verification Steps

1. `pnpm -C cutdown install` (fresh clone state) → clean.
2. `pnpm -C cutdown build` and `cutdown build:contracts --check` → both generators green, committed outputs clean, both lockfiles present (requires step 1).
3. `cutdown validate:contracts` → green incl. invalid-fixture rejection (requires step 2).
4. `cutdown brief test-1 --file <sample brief>` → validates and lands in `brief/`; a brief missing `accountId` fails naming the field (requires step 2).
5. `cutdown ingest data/golden-sets/ingest/mixed-job-valid --job test-mixed --rights-manifest ...` → one atomic job inventory with every supported asset kind, complete preflight records, hash-named originals, playable proxies, and fixture classification (requires step 2).
6. Ingest `mixed-job-unsupported` → whole operation fails and no partial job inventory lands; ingest a valid asset without rights → it lands `rights: unknown`.
7. Ingest `clean.mp4`, `ugly.mp4`, and `broll-silent.mp4` as `test-1/2/3`; re-run → cache hits, no re-render.

## Acceptance Criteria (PASS/FAIL)

- Both generators emit **committed** types; `build:contracts --check` detects stale generated output; lockfiles are committed; subset lint rejects a deliberately unsupported schema.
- `validate:contracts` green; invalid fixtures rejected by **both** validators (test names).
- Brief intake + atomic mixed-directory ingest meet tech-spec §15 step 2; every REQ-004 field appears in fixture assertions; unsupported-member rollback and no-sidecar behavior are proven.
- No file outside `cutdown/` and `docs/` created or modified (`docs/` only for `decisions.md` appends and plan progress notes — evidence: `git status`).

## Out of Scope (do not touch)

`src/**`, `tests/**`, root configs, `.claude/**` (mirror comes in Phase 5), `docs/initial/**`. No `index`/editorial/render work.

## Completion Criteria (Definition of Done)

Cutdown entry gate green (`build:contracts --check`, `validate:contracts`, `test:skills` for brief/ingest fixtures); `code-reviewer` PASS; honest status report; any new decision appended to `decisions.md`.
