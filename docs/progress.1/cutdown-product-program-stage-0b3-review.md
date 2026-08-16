# Stage 0B-3 review — the deliberate contract bump: `render-v2`, and nothing else

**Date:** 2026-08-11 (build began 2026-08-10)
**Plan:** `docs/plans/cutdown-product-program-phase-0b3.md` (revision 3; plan gate READY — `docs/progress/cutdown-product-program-stage-0b3-plan-review.md`)
**Baseline:** commit `0a0599e`, working tree clean (three untracked plan/review docs). Checkpoint snapshot: `claude-jig checkpoint: cutdown-product-program phase 0B-3`.
**Verdict:** **Ready (Almost — 4 residuals, all named below).** Plan gate READY; code gate two rounds — round 1 `code-reviewer` / `cutdown-boundary-reviewer` / `cutdown-measurement-reviewer` all **NEEDS CHANGES** (no BLOCK), all findings applied; round 2 boundary **PASS**, code and measurement **NEEDS CHANGES** on one shared remainder (stale line-anchors the seven-site fix had repaired as *sites* where the lesson demands the *class*) — closed by a full class sweep of every `master-plan.md:<line>` citation, verified exhaustively.
**Milestones changed:** **none.** `PIPELINE_IMPLEMENTATION_COMPLETE` stands. `PHASE_0_EXIT_EARNED` stays red, and live `status --phase0` is **byte-identical** before/after this stage — the change becomes visible only on the next minted package, by design (see *Trajectory*).

---

## What this stage did

The last engineering work in Stage 0. `render-v2.json` landed as a **new file** (tech-spec §3) carrying exactly the change Phase 5 residual 1 parked for "a deliberate version bump": a job-relative `pattern` on `outputPath` and `captions.{ass,srt,vtt}Path`, previously constrained only by `minLength: 1`. **D-62** records the scope decision: no `content-package-v2` (its stored-identity motive dissolved into D-56; Stage 1's additions are additive/minor by its own plan), and the `render-manifest-v1`/`source-asset-v1` pattern-tightening deferred **by name** to the Stage 5 bump re-plan, with the code guard and `artefact-path-discipline` lint retained (no pattern can express device names or post-symlink containment).

Reader before writer, in that order: `readVersionedContractJson` (one implementation, `packages/skill-runtime`) dispatches on the envelope's **declared** major — no cross-major retry, because a v2 instance also satisfies v1's shape, a premise now **asserted by a test** rather than claimed in a comment. Then the writer moved: the sole render-record producer (`packages/renderer-ffmpeg/src/adapter.ts`) stamps envelopes from the shared `RENDER_SCHEMA_VERSION` constant in `contracts/src/versions.ts`, drift-tested against `render-v2.json` — the D-52 mechanism, at the site the plan gate's BLOCK corrected (rev 1 had named a file that does not write the envelope, in a package that could not import the helper it was told to call).

## Entry gate (all fresh runs, this session)

| Command | Result |
|---|---|
| `pnpm build` | clean, exit 0 |
| `build:contracts --check` | PASS — trees current |
| `validate:contracts` | PASS — **50 cases** (42 + 8 new fixture files: 1 valid + 7 invalid; the plan pinned 47 and the code gate added three — captions-traversal, backslash, trailing-newline — see *Code gate*), 0 lint, 0 failures, **0 cross-validator disagreements** — the cross-validator gate (Ajv vs the generated pydantic validators) is the engine-agreement proof, now over all seven invalid classes on both `outputPath` and the `captions.*Path` siblings |
| `skills sync --check` | PASS — 10 skills (pre-existing `render` heartbeat warning unchanged) |
| `doctor` | 7/7 |
| `pnpm -r --no-bail run test` | **986 tests = 981 pass + 5 skipped + 0 fail** (baseline 974 = 969 + 5 + 0; the +12 tests are exactly this stage's: 8 dispatch — incl. the code gate's null-refusal and duplicate-major cases — 1 writer-stamp, 1 drift-constant, 1 live-tree family, 1 real-transition) |
| `uv run pytest -q` | **689 passed — delta exactly 0**, as pinned (no pytest test reads the per-contract fixture buckets; the `range-check` corpus is untouched) |
| `ruff check --config ruff.toml .` | clean |
| `status --phase0` | **byte-identical** to the before-capture (`status-before-0b3.txt` = `status-after-0b3.txt`, both fresh live runs, `diff` empty) |
| `git ls-tree … render-v1.json` → **1**, then `git diff --exit-code 0a0599e -- …render-v1.json` | exit 0 — v1 untouched, pathspec proven non-vacuous first. (The first run of this check returned **0** from `ls-tree` — a vacuous pathspec caused by running from `cutdown/` — and was re-run from the repo root. The A12 lesson fired *at* its own check, which is the check working) |

## The sole-stamper proof (B4), with its pinned key and match list

Grep key (pinned by the plan after the round-2 gate showed the read-site key cannot find a stamper): `schemaVersion:` construction sites plus `skillEnvelope(` calls, across `apps`, `skills`, `packages`, `workers`, production code only. **Match list (non-empty, contains `adapter.ts`):**

```
skills/approve/src/main.ts        schemaVersion: '1.0.0'   (review decisions)
skills/package/src/main.ts        schemaVersion: '1.0.0'   (content packages)
packages/qa/src/technical/gate.ts schemaVersion: '1.0.0'   (QA reports)
packages/renderer-core/src/manifest.ts  schemaVersion: '1.0.0'  (render MANIFESTS — a different contract)
packages/renderer-ffmpeg/src/adapter.ts schemaVersion: RENDER_SCHEMA_VERSION   ← the render-record stamper
packages/skill-runtime/src/index.ts     schemaVersion: contractVersion         (the generic helper)
(+ contract-set.ts — a `schemaVersion:` construction site that builds ContractSetEntry rows, not envelopes — and model.ts type declarations)
```

Corroboration: `renderId: ulid()` appears in production code at exactly **one** site — `adapter.ts:486`. The adapter is the sole envelope-construction site for render records.

## Read-site sweep (task 7), derived by both pinned keys

`render-v1` (contract name) ∪ `render.json` (artefact filename), production code: `package/main.ts` (the one **validating** reader — now dispatching on both majors), `approve/main.ts:90-105`, `revise/main.ts:125-140`, `apps/cli/src/commands/editorial.ts:48-67` (all three bare-parse, version-agnostic, deliberately unchanged), `render/main.ts` (writer-side path joins). Metadata: 4 SKILL.md `contractsUsed` (render-v2 added, **render-v1 kept**), 4 `registry.json` rows, mirror re-synced (10 skills). Comments updated in **four** homes: `artefact-paths.ts` header, `package/main.ts:575`, `artefact-path-discipline.test.ts` header, and `skills-sync.ts`'s doc comment **and** printed message (F-O) — plus a **fifth** home the entry gate found: `skills-sync.test.ts:116` asserted the old message's false claim verbatim (see *Deviations*).

## Trajectory — what the owner will see, stated so it cannot be misread

Live `status --phase0` today is unchanged: criterion 3 `[?] unproven` at 1/10, because drift is computed between consecutive delivered packages' recorded `contractSet`s and no package was minted here. (Precision, from the round-1 gate: `createAjv` does read the live schemas tree on the status path — `packages/contracts/src/ajv.ts:42-45` — but that registration is inert for v1 validation; "status never reads the live tree" is not a sentence to put anywhere.)

**The next minted package records the render family at `{1,2}` → D-61's family classifier reports `breaking` → criterion 3 goes `[ ] not_met`, naming `render-v2.json v1→v2`.** That is the trap 0B-1 built, springing correctly on the transition it was built for — it is the machinery working, not a regression. It stays red until the last pre-bump package leaves the ten-output span: earliest at the **11th resolved real output overall** (the 10th of T-4's 19 further outputs). Since criterion 1 needs 20 outputs anyway, the bump costs **zero schedule** against Phase 0 exit — and it landed at the cheapest point it will ever have (window held 1 at landing; the `phase-0b.md` §2 threshold is ≤3). Both tests exist: the hand-authored real-transition case (`status.test.ts`) and the live-tree family case (`contract-set.test.ts` — 15 entries, render family `{1,2}`, drift vs the pre-bump set `breaking v1→v2` with `from` = max).

## Deviations from the plan, all named

1. **CRLF regeneration artefact (task 3).** `build:contracts` (write mode) rewrote 7 Python files + `platform-edl-v1.ts` with CRLF line endings — content-identical under `--ignore-cr-at-eol`, exactly the artefact spike F-F's measurement note predicted for naive diffs. The 8 files were restored from HEAD (no content loss, verified) and the 3 genuinely new/changed files normalized to LF; `build:contracts --check` (which normalizes) passes either way. The committed diff matches the task-3 pin exactly: `index.ts` +1 line, 2 new generated files, nothing else.
2. **Two files added beyond the Files table** (same class as the plan-gate BLOCK, found at build): `packages/renderer-core/src/adapter.ts` — its `Render` type alias claimed `RenderV1.Render` for a record now stamped 2.0.0 (structurally identical; the alias was a comment claiming a property the artefact no longer has) — and `packages/renderer-ffmpeg/src/loudness.ts` (same, for the loudness union types). Both moved to `RenderV2`.
3. **`skills-sync.test.ts:116`** asserted the old dangling-contract message's "three stages later" claim — the **fourth home** of the F-O falsehood, found by the entry gate as a red test. The assertion now requires the message to name retirement and to *not* claim bump visibility.
4. **Two authoring mistakes of mine in the new status test**, both caught by 0B-2's machinery working as designed: fixture `contentHash` seeds `H('r2')` then `H('c2')` produced 128-char/non-hex hashes → the package failed whole-artefact validation → **all four criteria correctly went unproven** (the unreadable-package rule), which is why the test's first two runs failed. Fixed with a single hex char. Recorded because it is a live demonstration that an invalid package cannot silently enter criterion evidence.

## Code gate

Round 1 (2026-08-11): `code-reviewer` **NEEDS CHANGES**, `cutdown-boundary-reviewer` **NEEDS CHANGES**, `cutdown-measurement-reviewer` **NEEDS CHANGES** — no BLOCK. Every CHANGE verified against the code before acceptance, all applied:

| Finding | Fix |
|---|---|
| (code) A `render.json` containing literal `null` crashed `readVersionedContractJson` with an unnamed TypeError instead of the named fail-closed refusal — the exact failure the sibling helper's docstring names | Non-object candidates now take the "no readable envelope.schemaVersion" refusal; test added |
| (boundary + code) The three `captions.*Path` patterns had **no negative fixture** — the sibling-field shape this project's history warns about — and the backslash-rejection claim was fixture-unproven; (code, NOTE) a trailing newline is a real cross-engine `$` divergence surface no fixture pinned | Three invalid fixtures added (captions traversal, backslash, trailing newline), each single-defect; `validate:contracts` moved 47 → **50**, still 0 failures / 0 disagreements — the plan's 47 pin is superseded by the gate, recorded here |
| (measurement) **This diff minted seven line-anchored citations of `master-plan.md:162` while itself moving that sentence to line 163** — one of them into append-only D-62; the citation-drift class the canon exists to stop, committed by the stage that documents it | All seven repointed to the anchor-stable form ("the master plan §7 Stage-0 **Order-critical** clause"), D-62 corrected before ever being committed. **Round 2 then found the fix's own siblings, twice** — two *pre-existing* `:162` anchors in `phase-0b.md` (`:115`, `:256`) the diff had staled rather than minted, and then six more anchors into the same reflowed file (`:187` — the Stage-5 Risk line — in `phase-0b3.md` and the codebase review, plus the gate-history record's `:162`/`:187` spot-checks). The fix repaired named sites where the lesson demands the class; the close was a **class sweep**: every `master-plan.md:<line>` citation in the doc set enumerated and either repointed anchor-stable (live docs) or covered by a dated correction note (the gate-history record, whose verdict text is deliberately not rewritten). Remaining `master-plan.md:<line>` strings: this row's quotation, task 12's `:105` (verified accurate — the discharged render-v1 row sits at `:105` in the current tree; the ledger's new row landed *below* it), and the gate-history quotations under their dated correction note |
| (code, NOTE) Duplicate majors in a dispatch basename list resolved by `Map` last-wins | Loud refusal + test |
| (code + boundary, NOTE) Four readers still aliased `Render = RenderV1.Render` for records now stamped 2.0.0 — the exact claim `renderer-core`'s own new comment condemns | All four moved to the `RenderV1.Render \| RenderV2.Render` union (structurally identical; the union states what is read) |
| (code, NOTE) D-62's "verified under Ajv and Python `re`" conflated the planning probe (which *did* run Python `re`) with the production gate (Ajv vs generated pydantic) | D-62 wording corrected to attribute both, before commit |
| (measurement, NOTEs) Review-record imprecisions: "all owner-side" mislabelled A7 (access-blocked, not an owner call); the sole-stamper list's `contract-set.ts` parenthetical | Both corrected in this record |
| (measurement, NOTE — pre-existing, outside this diff) live status prints "T-1/D-56" where T-1 is a graduated row | Named here so it is not rediscovered; historical-alias reading; no change this stage |
| (boundary, NOTE) `revise/main.ts:130` comment half-stale for v2 records | Reworded to name both majors |

Post-fix verification: `pnpm build` clean; dispatch suite 8/8; full suite **986 = 981 pass + 5 skipped + 0 fail**; `validate:contracts` **50 / 0 / 0 disagreements**.

**Round 2** (2026-08-11, against the fixed tree): `cutdown-boundary-reviewer` **PASS** (grade A — all findings resolved with executed proof; suites re-run live; inversion hunt clean; two pre-existing NOTEs with the Stage 5 re-plan as named home: approve/revise still bare-parse render records, and D-62's "readers dispatch" sentence reads broader than its single current consumer). `code-reviewer` and `cutdown-measurement-reviewer` **NEEDS CHANGES** on the same remainder: the anchor fix had repaired the seven *named* sites, leaving two pre-existing anchors the diff staled (`phase-0b.md:115/:256`) and then six more into the same reflowed file (`:187` sites + the gate-history record's spot-checks) — the fix-the-class lesson, enforced on the fix itself. Closed by the class sweep (see the code-gate table's measurement row); measurement round 2 otherwise re-derived **every** number fresh (50/0/0 twice, full suite re-run to 986 = 981+5+0 with per-package counts byte-identical to the pinned log, status byte-identity run twice, the +12 delta enumerated test-by-test) and confirmed D-38/D-56 intact.

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| B1 | v2 differs from v1 in exactly the five stated kinds; `lintAllSchemas()` 0 violations | **Met** — schema diff reviewed; `validate:contracts` 0 lint |
| B2 | `render-v1.json` byte-identical; pathspec non-vacuous first | **Met** (after re-running the vacuous first attempt from the repo root) |
| B3 | One dispatch implementation; major-3 refused naming accepted majors non-destructively; declared-v2-with-bad-path invalid, not retried; premise test | **Met** — `versioned-read.test.ts`, 6 tests at acceptance; **8 after the code gate** added the null-refusal and duplicate-major cases |
| B4 | Envelope stamped from `RENDER_SCHEMA_VERSION`; drift test pins constant↔schema; sole stamper proven by pinned non-vacuous grep | **Met** — match list above; `versions.test.ts`; adapter test in the determinism suite (not skip-gated) |
| B5 | Live status byte-identical, both sides fresh | **Met** — `diff` empty |
| B6 | Post-bump vs pre-bump package classifies breaking, named, `not_met` | **Met** — `status.test.ts` real-transition case |
| B7 | 47 cases, 0 failures, 0 disagreements, all four invalid classes exercised | **Met** — exactly 47 at acceptance; **50 after the code gate** added the captions/backslash/trailing-newline fixtures (see *Code gate*) |
| B8 | Every pin re-derived, pass/skip/fail split, no "total > N" | **Met** — table above |
| B9 | Sweep derived by both grep keys, recorded; `contractsUsed` keeps v1 | **Met** — sweep section |
| B10 | D-62 appended (three clauses); `phase-1.md` no longer instructs building on `content-package-v2` | **Met** — grep clean |
| B11 | F-O claim gone from both `skills-sync.ts` homes | **Met — and a third code home (the test) found and fixed** |
| B12 | Trajectory stated with its unit | **Met** — above |

## Residuals

| # | Residual | Why open |
|---|---|---|
| 1 | The plan-review's nine cosmetic notes (`stage-0b3-plan-review.md`): all addressed in-build except two documentation nits — B4's "no version literal in renderer-ffmpeg" reads over-broad against test fixtures' legitimate PlatformEDL literals (the claim is scoped to render-record production code here), and invalid fixtures are single-defect by construction but not asserted single-defect by a test | cosmetic; named so they are not rediscovered |
| 2 | `skills sync` `render` heartbeat warning | pre-existing (Stage B concern), unchanged |
| 3 | D-62b deferrals (render-manifest/source-asset patterns, `Role3` pin, commons/enums criterion-3 visibility) | by design — master plan Deferral Ledger row, receiving home Stage 5's bump re-plan |
| 4 | A7 (CI green on a clean clone) | still unverifiable from this environment — no `gh`; the workflow will run on the next push |

## What Phase 0 exit still needs (unchanged)

Owner-side: T-2 (D-21 spend ceiling), T-3 (two more accounts), T-4 (**19** more approved real outputs). Access-blocked, not an owner decision: A7 (reading the CI result needs a session with `gh` or a browser on the repo's Actions page). **Accumulation is now safe to resume**: the bump this stage existed to land is landed, so the master plan's §7 Stage-0 **Order-critical** clause is discharged by landing, not by deferral.
