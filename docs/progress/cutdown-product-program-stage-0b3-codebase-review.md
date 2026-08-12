# Stage 0B-3 codebase review — the migration, re-scoped from evidence

**Date:** 2026-08-10
**Baseline:** commit `0a0599e` (only a docs commit past `6e178b8`), working tree clean.
**Method:** every claim below is labelled **MEASURED** (a command was run this session and its output is quoted), **READ** (verified in source at file:line this session), or **CITED** (a prior artefact's finding, named). Nothing is argued from memory — the spike's own convention.
**Probe hygiene:** one probe file (`packages/contracts/schemas/render-v2.json`) was created, measured with `build:contracts --check`, and deleted. Afterwards: `build:contracts --check` PASS, `validate:contracts` 42 cases / 0 failures / 0 disagreements PASS, `git status` clean, HEAD `0a0599e` unchanged.

---

## 1. The trigger has fired, and the constraint check passes

`phase-0b.md` §9: 0B-3 is re-planned when 0B-1 and 0B-2 are proven on disk (they are — `cutdown-product-program-stage-0b-review.md`, B1–B16 met) and its **first task** is to re-read the master plan's §7 Stage-0 **Order-critical** clause and decide whether criterion 3's window is empty enough to bump.

**MEASURED** (live `status --phase0`, this session): criterion 3's window holds **1/10 resolved real output(s)** (2 evidence-complete real packages in the span). The recorded threshold (`phase-0b.md` §2) is *before the window holds more than three resolved real outputs*. **1 ≤ 3: the bump is currently at its cheapest possible point, and every real output the owner produces before it lands raises its cost.** The constraint is discharged by landing now, not by deferring.

## 2. What the migration is still for — and what it is no longer for

The old Stage 0 task 5 (`cutdown-product-program-phase-0.md:129`) gave v2 two motives:

1. **`outputId` + `outputLineage` on `content-package-v2`** — **dead.** D-56 (0B-2): identity is *derived* from `lineage.creativeBriefId`, which every delivered package already carries as a required field (spike F-J, MEASURED on real data). No schema field is needed, and `phase-0b.md` §8 explicitly forbids Stage 1 from assuming one.
2. **`render-v2` carrying the deferred path-pattern fix** — **alive.** Its origin is cutdown Phase 5 residual 1 (`docs/progress/cutdown-phase-5-review.md:213-221`, READ): `render-v1.outputPath` and `captions.*Path` are described as job-relative but constrained only by `minLength: 1`; tightening is a breaking change to a published contract, so it was parked for "a deliberate version bump, not a residual pass".

**Stage 1 does not need a `content-package-v2` either** — READ, `cutdown-product-program-phase-1.md:87`: *"this stage's additions to `content-package-v2` must be optional/minor, or the stability clock resets a second time"*, and its task 11 threads its fields **additive/minor**. A plan-text amendment (point those references at `content-package-v1`) replaces a schema file. Stage 5 owns its own, later, bump (the master plan §7 Stage-5 **Risk** line) and is bound by risk-rule 4 either way.

**Conclusion the plan adopts: 0B-3 = `render-v2` only. No `content-package-v2`, no `render-manifest-v2`, no `source-asset-v2`.** The wider pattern-less path class is real (see §4) but its operative guard is shared code, and bumping three more families multiplies consumer-sweep risk in the program's most defect-prone area for defence-in-depth value. Deferred **by name**, not silently — receiving home: the Stage 5 bump re-plan.

## 3. Blast radius of `render-v2` alone — smaller than the spike's superset figure

**MEASURED** (probe, this session): with only `render-v2.json` added, `build:contracts --check` reports exactly:

```
  modified: generated/typescript/index.ts
  new:      generated/typescript/render-v2.ts
  new:      generated/python/cutdown_contracts/render_v2.py
```

**`style_profile_v1.py` does not change and no class renumbers.** Spike F-F's `Role3→Role4` was caused by the other two probe schemas, not by `render-v2`. Spike residual 5 (pin `Role3`?) is therefore **moot for this stage** — nothing renumbers.

The probe also proves the schema shape: the probe carried the real path patterns and **`lintAllSchemas()` returned 0 violations** (`generateAll` throws before generating on any violation — spike F-H — and it generated).

> **Correction (2026-08-10, found by `cutdown-measurement-reviewer` at the rev-1 plan gate).** This section originally said "passed all **18** lint rules", a number inherited from spike F-H. **No artefact defines an 18**: `subset-lint.ts` defines **12** distinct rule ids (measured this session). The phantom numeral was wrong at birth in the spike and propagated here and into the plan; the gate is now stated count-free everywhere, and the spike gets its own dated correction (plan task 10).

## 4. The pattern, designed and cross-validated

**MEASURED** (both engines, this session): the candidate pattern

```
^[A-Za-z0-9._-]*[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9._-]*[A-Za-z0-9_-][A-Za-z0-9._-]*)*$
```

(segments of a conservative character whitelist, each containing at least one non-dot character, joined by single `/`) was run over 13 cases in **ECMA (node) and Python `re`** with identical verdicts: accepts `renders/draft/<ulid>/output.mp4`, `source/abc.mp4`; rejects `../escape`, `/abs/path`, `C:/win`, `a//b`, backslash paths, `..`, `.`, `a/../b`, `a/./b`, empty. No lookaheads, so no engine-divergence surface — `validate:contracts`'s 0-cross-validator-disagreement gate is the enforcing check once fixtures land.

**What the pattern does NOT cover, stated so no one over-claims:** Windows reserved device names (`renders/nul.mp4` matches the pattern) and filesystem containment after symlinks. Those remain the code guard's job — `assertJobRelativePath` / `resolveArtefactPath` in `packages/contracts/src/artefact-paths.ts` (READ, `:51-84`: absolute/UNC, `..`, NUL, device names per segment). **Phase 5 residual 1's closing words — "delete the lint's reason for existing" — are an over-claim and the plan corrects them:** the `artefact-path-discipline` lint also guards `render-manifest-v1.captions.*Path` and `source-asset-v1.storedPath` (both still pattern-less, READ `artefact-paths.ts:9-11`) and the device-name/containment classes the pattern cannot express. The lint and guard stay.

## 5. Read and write sites — the dispatch surface is one validating reader

**READ**, every site this session:

| Site | Mechanism | v2 impact |
|---|---|---|
| `skills/package/src/main.ts:132,160` | `readContractJson` pinned to `contractSchemaId('render-v1')` | **The one validating reader.** Hard-refuses a v2 render (`RENDER_ARTEFACT_UNREADABLE`) — needs dispatch on the envelope's declared major **before** the writer moves (spike F-N's rule, applied to render) |
| `skills/approve/src/main.ts:90-105` | bare `JSON.parse`, no schema validation; reads `renderId`, passes record through | version-agnostic today; unchanged (pre-existing validation gap, named not widened) |
| `skills/revise/src/main.ts:125-140` | bare `JSON.parse` + `assertSafeId(render.edlId)` | version-agnostic today; unchanged (same note) |
| `apps/cli` `status` | reads ContentPackages only (D-36) | no render.json read |
| writer: **`packages/renderer-ffmpeg/src/adapter.ts:485-491`** | a **hand-built inline envelope literal** `schemaVersion: '1.0.0'` — and `renderer-ffmpeg` depends only on `@cutdown/contracts` + `@cutdown/renderer-core` (`package.json`), so it **cannot import `skillEnvelope`** | stamp from `RENDER_SCHEMA_VERSION` in `contracts/src/versions.ts` + drift test (the D-52 mechanism, precedent `PLATFORM_EDL_SCHEMA_VERSION`); output paths are templated (`renders/<tier>/<manifestId>/…`), so they satisfy the pattern by construction |
| `apps/cli/src/commands/editorial.ts:48-67` | bare `JSON.parse` walk over every job's `render.json` (`findJobForRender`), reads `renderId` only, skips unreadables | version-agnostic; unchanged (same note as approve/revise) |

> **Correction (2026-08-10, found by `cutdown-boundary-reviewer` at the rev-1 plan gate — its BLOCK).** This table's writer row originally said the envelope was stamped in `skills/render/src/main.ts:472` via `skillEnvelope`, labelled READ. **False**: `:472` is a path join; the render record arrives fully formed from `adapter.execute`, and the envelope is the inline literal above, in a package that cannot import the helper. The `editorial.ts` row was also missing — the site sweep's grep keyed on `render-v1`, which a version-agnostic reader does not contain; the sweep rule is now "grep the contract name **and** the artefact filename". Both corrected in place with the code verified this session.

The envelope (`schemas/common/envelope-v1.json`, READ) carries `schemaVersion` — required, semver-patterned. **Dispatch = parse JSON, read `envelope.schemaVersion`'s major, validate against the matching `$id` (1 → `render-v1`, 2 → `render-v2`), refuse any other major fail-closed with a non-destructive message.** Existing v1 render records on disk are never rewritten (immutability) and keep validating as v1.

Consumer *metadata* sweep (READ, grep this session): `contractsUsed` in **4** SKILL.md files (`approve`, `package`, `render`, `revise`), **4** rows in `skills/registry.json` (`:21,117,194,219`), the `.claude/skills/cutdown-*` mirror (via `skills sync`), and the `artefact-paths.ts:9-11` comment. Plus spike F-O's false comment at `skills-sync.ts:214-216` ("a major bump has to be visible HERE" — it is not, under add-a-new-file), corrected in the same change.

**Type-level impact is nil by construction:** a `pattern` does not change a generated TypeScript type (string stays string), so `RenderV2.Render` is structurally `RenderV1.Render`; consumer type unions are trivial.

## 6. What the bump does to `status --phase0` — nothing, until the next package

Criterion 3's drift is computed **between consecutive delivered packages' recorded `contractSet`s** (0B-1). No criterion compares against the live schemas directory — with one precision note (rev-1 gate): `createAjv` (`packages/contracts/src/ajv.ts:42-45`) *does* load every live schema file into its registry on the status path. That read is inert for v1 validation (an extra registered schema validates nothing by itself), and a broken `render-v2.json` would crash loudly rather than drift silently — but "status never reads the live tree" is not a sentence to put in a comment. So:

- **The day 0B-3 lands, live `status --phase0` output is byte-identical** — an acceptance criterion, captured verbatim.
- The **next minted package** records a `contractSet` containing both majors of the render family → 0B-1's family logic classifies **breaking** → criterion 3 reports `not_met` naming the render family — the trap 0B-1 built, springing correctly, on purpose. It stays `not_met`/`unproven` until the last pre-bump package leaves the span of the last 10 resolved outputs — proven earliest at the **11th resolved real output overall** (the 10th of T-4's 19 further outputs; unit per D-56). **The bump costs zero schedule against the 20-output criterion.** This trajectory must be stated in the record so the owner reads the first post-bump `not_met` as the machinery working, not as a regression.

## 7. Critical Paths touched

| Path | Why | Reviewer |
|---|---|---|
| Cutdown tenancy & boundaries | new schema file + versioning, `contract-set` families, registry/mirror, artefact paths, reader-dispatch-before-writer | `cutdown-boundary-reviewer` |
| Cutdown measurement honesty | criterion 3 trajectory claims, `validate:contracts` case count (42 → **47**; rev 1's 44 was stale against the plan and both moved when the fourth invalid fixture class was added), pytest count (**689, unchanged** — no pytest test reads the per-contract valid/invalid fixture buckets; the one pytest consumer under `fixtures/` is the `range-check` corpus, untouched here), "status unchanged" claim | `cutdown-measurement-reviewer` |
| (general) | — | `code-reviewer` |

The four UGC paths: untouched (`tech-spec.md` §14).

## 8. Inherited stopgaps in the flows this touches

- `skills-sync.ts:214-216` false doc comment **and its second home, the printed problem message at `:250-255`** (same claim, user-facing) — **both retired here** (F-O; the second home found by `cutdown-boundary-reviewer` at the rev-1 plan gate).
- `readJson` unvalidated `creativeBriefId` read in `package` (spike F-I caveat / spike residual 4) — **kept, out of scope**: 0B-2 ground, already a named residual there; this change does not widen it.
- approve/revise bare-parse render reads — **kept, named** (§5): pre-existing, version-agnostic, not widened by this change.
- 0B residual 10 (commons/enums invisible to criterion 3) — **kept, re-pointed**: receiving home Stage 5's bump re-plan (this stage changes no commons/enums file).

## 9. Risks

1. **The consumer sweep names one site and leaves a sibling** — this program's signature failure, three consecutive appearances. Mitigation: the read-site list above is *derived by grep* and re-derived at build time; the dispatch lives in **one** helper, not per call site.
2. A fixture pair that under-exercises the pattern (e.g. only the traversal case) would let an engine divergence through — the invalid bucket must cover the classes the pattern claims (absolute, drive-letter, traversal, empty-segment).
3. The build order (spike F-H) is not negotiable; task order in the plan embeds it.
4. `pnpm -r` test totals and the `validate:contracts` case count move — each expected movement is pinned to an exact number in the plan, pass/skip/fail separately (R9). **pytest does not move** (689, delta exactly 0): no pytest test reads the per-contract valid/invalid fixture buckets — the Python side of that validation is `validate_fixtures.py`, spawned by `validate:contracts`, whose 0-cross-validator-disagreements gate is the Python-side proof. The one pytest consumer under `fixtures/` is the `range-check` corpus (`workers/indexer-python/tests/test_bounds.py:24`), which this stage does not touch. (Corrected twice at the plan gate, 2026-08-10 — rev 1 asserted "pytest counts all move"; rev 2's replacement "no pytest test reads contract fixtures" was itself a categorical falsehood of the same class.)
