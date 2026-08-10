# Stage 0B spike — what the code proved

**Date:** 2026-08-10
**Method mandated by:** `docs/plans/cutdown-product-program-master-plan.md` §7a — *"write the failing tests and the type signatures, let the compiler and `validate:contracts` answer the questions prose kept getting wrong, then write the plan from what the code proved."*
**Baseline:** commit `276176e`, working tree clean. **Nothing in this spike was committed.** Every probe file was created, measured, and removed; both contract gates were re-run afterwards and PASS.
**Status:** spike complete. This document is the evidence base for the Stage 0B plan; it is not itself a plan.

---

## Why a spike

Three plan-review rounds returned **BLOCK** three times, and essentially every finding landed on one thing: the contract migration. The defects shared a character — family-reduction ordering, a `schemaVersion`↔filename binding nobody enforces, a vacuous git pathspec, codegen ordering, a caller-authority rule living in a schema's `description`. **Every one is answered by a compiler or a test run in minutes, and every one survived three rounds of people reading prose.**

Five questions were carried into the spike as *design inputs* rather than plan defects. All five are now answered by execution. Two of them dissolved.

## Entry-gate baseline (before any probe)

| Command | Result |
|---|---|
| `pnpm build` | clean, exit 0 |
| `build:contracts --check` | PASS — trees current |
| `validate:contracts` | PASS — 42 cases, 0 lint, 0 failures, **0 cross-validator disagreements** |
| `skills sync --check` | PASS — 10 skills |
| `pnpm -r --no-bail run test` | exit 0 — **tests 906 = 901 pass + 5 skipped, 0 fail, 217 suites** (the split matters: 901 is the *pass* count, not the total, and a gate written as "total > 901" would accept a run that converted passes into skips) |
| `ruff check --config ruff.toml .` | All checks passed |
| `uv run pytest -q` | exit 0 (two independent runs; the summary line was not captured through the background wrapper this session — the exit status is the claim, the count is not) |

---

## Findings

Each is labelled by how it is known: **MEASURED** (a command was run and its output is quoted), **READ** (verified in source at `file:line`), or **DESIGN** (a recommendation this evidence supports, not a fact).

### F-A · Criterion 3 reports GREEN across the largest breaking change in the program — MEASURED

`diffContractSets` keys its maps by full `schemaId` (`contract-set.ts:99-100`), and a `$id` contains its version. Obeying tech-spec §3 (*a semantic change adds a new file*) therefore produces a **new** `schemaId`, so `previous === undefined` and the drift is `added`. Run against the exact transition Stage 0B would produce:

```
drift across the v1->v2 migration:
[ { "kind": "added",
    "schemaId": "https://cutdown.local/contracts/schemas/content-package-v2.json" } ]

criterion-3-relevant drift (breaking|removed): 0
```

`status.ts:341-342` says `added` "neither resets the ten-output clock". **Understated in every prior review:** criterion 3 does not merely stay green — `status.ts:355` prints the sentence *"no schema major version moved between consecutive packages"* verbatim, actively denying the change.

`breaking` is reachable **only** when one `schemaId` appears in both sets with different majors — i.e. the in-place mutation tech-spec §3 forbids. **The branch is unreachable under the project's own versioning policy.**

### F-B · A first-wins family reducer reproduces the bug deterministically — MEASURED

Round 3's finding F1/F3 warned that the family fix "admits a first-wins implementation that reproduces N0 exactly while passing every test 12b demands". The ordering makes this deterministic rather than accidental:

```
order currentContractSet() emits (schemaId ascending):
  1.0.0  content-package-v1.json
  2.0.0  content-package-v2.json
  ...
```

`jsonFilesIn` lexically sorts paths (`paths.ts:41-46`), `currentContractSet` re-sorts by `schemaId` (`contract-set.ts:76`), and `Map` preserves insertion order. **v1 is always seen first.** A reducer keeping the first entry per family records major 1 and reports no change.

### F-C · A family reducer can silently swallow the `removed` signal — MEASURED, new

Not raised in any prior review. Retiring v1 after the window clears:

```
drift when v1 is later RETIRED:
[ { "kind": "removed", "schemaId": ".../content-package-v1.json" } ]
```

`status.ts:328-339` treats `removed` as breaking, deliberately (*"a contract that DISAPPEARED … is at least as breaking as a major bump"*). A reducer that collapses `{v1,v2} → {v2}` into "the family still exists" **loses a signal the current code has**. Any family fix must be tested against retirement, not only against addition.

### F-D · Nothing binds a `-vN` filename to its declared version — MEASURED

A `content-package-v2.json` declaring `schemaVersion: "1.0.0"`:

```
lintAllSchemas() violations: 0
currentContractSet() records it as majorVersion=1, schemaVersion=1.0.0
```

The lint's `version-lineage` rule (`subset-lint.ts:248-255`) asserts the **shape** `^\d+\.\d+\.\d+$` and nothing else; it never reads the path. The one path-derived rule, `id-matches-path` (`subset-lint.ts:236-244`), checks the `$id` against the filename but not the version against either.

Consequence: a family reducer that trusts `majorVersion` can be defeated by a mislabelled file, and the mislabelling passes every gate.

**Home for the fix — READ:** `subset-lint.ts`, inside the existing `if (isContract)` block at `:247`. It already receives `absPath` and the parsed body together, already derives a path-based expectation, and `lintAllSchemas()` (`:294`) is the one walker that distinguishes contracts from commons/enums. Two traps: it must be **contracts-only**, and the negative test needs a temp file because `subset-lint.test.ts:38` asserts the live tree is clean.

> **Correction (2026-08-10, found by `cutdown-boundary-reviewer`).** Revision 1 sized the first trap as "`schemas/common/*-v1.json` and every `enums/*.json` carry a `-v1` filename … a blanket rule fires 4+ false positives". Measured: **0 of 20** files in `packages/contracts/enums/` carry a `-vN` suffix at all. The false positives come from exactly the **4** files in `schemas/common/`, which carry `-v1` and declare no `schemaVersion`. The trap is real and the fix is unchanged; the sizing sentence was wrong.

### F-E · The family key must come from the `$id` string, not from any declared field — MEASURED

`platform-edl-v1` is at **`schemaVersion: "1.1.0"`** — a minor bump landed in the *same file*, under the *same `$id*`, on 2026-08-06 (D-52). So:

- the key cannot be `schemaVersion` (it moves without the family moving);
- the key cannot be `majorVersion` (that is the thing being stripped);
- the key must be derived from the `$id`/filename by stripping a trailing `-v<digits>`.

And the reducer must keep that minor bump classified `compatible`.

> **Correction (2026-08-10, found by `cutdown-boundary-reviewer` in round 2).** Revision 1 named `status.test.ts:355` (*"stays GREEN when only a content hash moves under an unchanged major"*) as "the anti-vacuity control that proves it". **It is not.** That test asserts only `strictEqual(criterion('no-breaking-contract-change').met, true)` — which a reducer that dropped the `compatible` classification **entirely** would also satisfy. It is a regression guard, not a proof. The proof must be a direct assertion on `kind === 'compatible'` in `contract-set.test.ts`; the plan's B2 now says so.

### F-F · The codegen blast radius is exactly two modified files, one of them a surprise — MEASURED

With all three planned schemas present (`content-package-v2`, `render-v2`, `supersession-record-v1`), `build:contracts --check` reports:

```
  modified: generated/typescript/index.ts
  modified: generated/python/cutdown_contracts/style_profile_v1.py
  new:      generated/typescript/content-package-v2.ts
  new:      generated/typescript/render-v2.ts
  new:      generated/typescript/supersession-record-v1.ts
  new:      generated/python/cutdown_contracts/content_package_v2.py
  new:      generated/python/cutdown_contracts/render_v2.py
  new:      generated/python/cutdown_contracts/supersession_record_v1.py
```

The TypeScript side has **zero** collateral — only the generated barrel gains its `export * as` lines. The Python side changes one **unrelated** module:

```
48c48
< class Role3(StrEnum):
---
> class Role4(StrEnum):
```

`datamodel-codegen` numbers colliding class names **globally across the input directory**, so adding any schema can renumber classes in modules it has nothing to do with. Nothing outside the generated tree references `Role3` (verified), so this is safe **today** — but it is a tripwire, and any plan's "files to modify" list that omits `style_profile_v1.py` is wrong.

> Note on measuring this: a naive `diff -rq` reports **eight** Python files and `platform-edl-v1.ts` as differing. That is a CRLF artefact — `check-generated.ts:97-99` normalises line endings and `diff` does not. The numbers above are from `diff --strip-trailing-cr`, and they agree exactly with what the real gate prints. A plan sized from the naive diff would have been sized from noise.

### F-G · The Python name-collision hazard is real to ask about and benign in fact — MEASURED

This was flagged in recon as the **highest-risk unknown** in Stage 0B: `content_package_v1.py` is a re-export shim into a shared flat `_internal.py`, and `validate_fixtures.py:45-52` resolves a model by `getattr(module, title)`. If a second schema titled `ContentPackage` produced `ContentPackage1`, fixture validation would break.

It does not.

- `_internal.py` is **byte-identical** with all three schemas added; still 35 classes; no numeric-suffixed class name appears **in `_internal.py`**.

  > **Correction (2026-08-10, found by `cutdown-measurement-reviewer`).** Revision 1 of this document said "**zero** numeric-suffixed class names **anywhere in the tree**". That is **false**, and it contradicted F-F in the same document. The probe grepped `_internal.py` only, and the claim was written wider than the measurement. Measured across the whole generated tree: `moment_v1.py:129` is `class Source1`, and `style_profile_v1.py:48` is `class Role3`. Numeric suffixing is datamodel-codegen's ordinary collision behaviour, and F-F's `Role3`→`Role4` is an instance of it, not an anomaly. **The narrow conclusion below is unaffected** — it was tested directly, not inferred from the suffix count.
- `content_package_v1.py` remains the shim, with an unchanged import list.
- `content_package_v2.py` is generated as a **standalone** module that re-declares its own nested types and imports only five shared names from `_internal`.
- Both modules export a symbol literally named `ContentPackage`. `getattr(module, title)` resolves for both.

**The highest-risk unknown in the stage cost one throwaway generation run to retire.**

### F-H · The build order is a hard constraint, and the failure is loud — MEASURED + READ

Round 3's F12 ("tasks 6/7/8 cannot typecheck before task 9 regenerates the trees") is correct. The mechanism: `ContentPackageV2` exists as a symbol only once `generate.ts:84` emits its barrel line, which happens only when `build:contracts` runs, which requires `apps/cli` to already be compiled.

Derived order — **not negotiable, and not a matter of taste:**

1. Write the schema file(s). They must already pass all 18 lint rules — `generateAll` throws before generating if `lintAllSchemas()` returns anything (`generate.ts:155-161`).
2. `pnpm build` (compiles the CLI; the stale generated tree is still self-consistent, so this succeeds).
3. `build:contracts` (regenerates both trees, emits the barrel lines).
4. `pnpm build` again (now `dist/generated/.../index.d.ts` exports the new namespace).
5. Only now write consumer code importing the new types.
6. Add fixtures — **both buckets, per schema**.
7. `build:contracts --check` → `validate:contracts` → `skills sync --check`.

Skipping step 6 is loud and specific:

```
FAIL  content-package-v2: no valid fixture. Every contract needs both — an invalid fixture is the only proof the schema rejects anything.
FAIL  content-package-v2: no invalid fixture. …
FAIL  render-v2: no valid fixture. …            (×2)
FAIL  supersession-record-v1: no valid fixture. (×2)
validate:contracts — 42 fixture case(s), 0 lint violation(s), 6 failure(s), 0 cross-validator disagreement(s): FAIL
```

**0 lint violations** in that run is itself a finding: the probe shapes — a nullable `Ulid` via `oneOf`, an inline `enum`, closed nested objects — are all legal under the style subset. The v2 shape is not the risk.

### F-I · A caller-supplied `outputId` contradicts the package skill's own stated law — READ

`skills/package/schema/input.json:5`, the schema's top-level `description`, verbatim:

> "Names the FINAL render to package. Deliberately minimal: every other input — the approval, the QA report, the rights records, **the lineage**, the contract set — is read from committed artefacts rather than accepted from the caller, **because a caller-supplied evidence field is a caller-supplied claim**."

The input schema has exactly two properties (`jobId`, `finalRenderId`), `additionalProperties: false`. Round 3's F5 is confirmed verbatim. A caller-supplied discriminator would make the number criterion 1 counts an operator assertion, on the one skill whose input contract explicitly refuses caller-supplied evidence.

`storyPlan.creativeBriefId` is in scope at `main.ts:498` and written to the package at `:657` — **72 lines before the mint at `:570`**. Derivation needs no new read.

**Caveat — READ, and load-bearing:** it arrives via `readJson` (`main.ts:100-107`), a bare `JSON.parse` + cast with no Ajv and no `assertSafeId` — unlike the EDL one line above, which uses `readContract`. Today only the whole-package validation at `main.ts:750-759` catches a bad value, and that runs after staging is written. Any derivation from this field inherits that gap.

### F-J · Derived identity dissolves Q4 entirely — MEASURED on real data

Q4 asked: *what does a v2 repackage of a v1 parent write as `parentOutputId`, given a v1 package has no `outputId`?*

The question presumes identity is a **stored field**. Measured against every delivered package on disk:

```
01KZ0A62WTAXFAYS9M1WK6PRKM  fixture  creativeBriefId=01KZ094GA7JPW9G8594G3G2VNC  OK
01KZ8B40TENCWQ72F061FXK79S  real     creativeBriefId=01KZ8ARV5A260Z7D3VJAY94C3Q  OK
01KZ9YK48KBRAX85DJ1P76NYMN  real     creativeBriefId=01KZ8ARV5A260Z7D3VJAY94C3Q  OK
```

`lineage.creativeBriefId` is **required** on `content-package-v1` and is a valid ULID on all three. **A derived identity needs no schema field, no legacy-identity rule, and no v1→v2 bridge.** There is no identity gap to cross, because v1 already carries the material.

### F-K · T-1 supersession is computable from the packages alone — MEASURED on real data

```
01KZ9YK48KBRAX85DJ1P76NYMN SUPERSEDES 01KZ8B40TENCWQ72F061FXK79S (same creativeBriefId)
real packages: 2  ->  counted outputs after T-1: 1
survivor: 01KZ9YK48KBRAX85DJ1P76NYMN
```

T-1's assertion is verified against the files: both real packages carry byte-identical `creativeBriefId` `01KZ8ARV5A260Z7D3VJAY94C3Q`. The resolution needs **no new artefact, no writer, no reader, and no schema change**.

> **Correction (2026-08-10, found by `cutdown-boundary-reviewer` — this was the review's BLOCK).** Revision 1 also claimed the resolution needs "**no cross-job addressing model**". That generalises a **single-job** measurement: both packages in the sample live in job `schwarzkopf-w1-showcase`. The measurement cannot support a cross-job claim, and the opposite is closer to true — `loadAllPackages` (`status.ts:154-193`) walks **every** job under `JOBS_ROOT`, so a resolver keyed on a bare `creativeBriefId` string would group **across jobs and across accounts by default**. Nothing binds a package's `creativeBriefId` to its own job: `skills/package/src/main.ts:657` copies `storyPlan.creativeBriefId` straight through, the story plan is read by an unvalidated `readJson` (`:100-107`), and `package` never reads the CreativeBrief itself. The blast radius lands on the very criterion this work exists to make honest — criterion 1 requires `accounts.length >= 3` built from the surviving packages (`status.ts:275-284`), so a cross-account merge would silently *remove an account from the count*.
>
> **The correct statement:** supersession needs no new *artefact* and no new *addressing model to be invented* — but its grouping scope must be **stated and pinned by a test**, not left implicit. The plan settles it as a composite key `(sourceClassification, accountId, jobId, creativeBriefId)` over the evidence-complete set; see `cutdown-product-program-phase-0b.md` **task 8**.

It also matches the project's own precedent — **READ**: `skills/approve` resolves supersession by *derivation over a total order within one namespace*, never by a declared pointer. Its `supersededDecisionIds` is a computed **report**, not a stored field (`skills/approve/src/main.ts:276`), and the artefact on disk carries no `supersedes` key. `packages/contracts/src/reviews.ts` is deliberately the single implementation, and its fail-closed rule is that an unreadable file in the namespace makes the whole answer `indeterminate`.

**Q5 ("when a derived supersession and a declared record disagree, which arbitrates?") therefore dissolves too: under the existing precedent there is no declared record to disagree with.**

### F-L · Applying T-1 turns a second criterion red, and the type cannot say why — MEASURED

```
today: 3/4 met
after T-1, criterion 1 counts 1 real output(s) (was 2)
criterion 3's window is real.slice(-10) -> length 1
criterion 3 predicate is `window.length >= 2 && breaking.length === 0` -> FLIPS TO RED
```

The honest post-change report is **"2 of 4 criteria are not met"**, not 1. Every planning document to date says only criterion 1 moves. Criterion 3 going red is *correct* — stability across ten is genuinely unproven by one output — but:

**READ, `status.ts:50-58`:** `Criterion.met` is a plain `boolean`. "UNPROVEN" exists only as English inside three `detail` strings and renders as `[ ]`, identical to disproven. Machine-readably the two are the same value. Making unproven distinct is a **type change**, not a wording change.

> **Correction (2026-08-10, found by both reviewers.)** Revision 1 said `exitEarned` "is the sole consumer". **False, and the false part is the dangerous part.** Measured — `grep -n "\.met" status.ts` returns **three** production readers:
>
> ```
> 384:  const exitEarned = criteria.every((criterion) => criterion.met);
> 408:          : `${String(criteria.filter((c) => !c.met).length)} of 4 criteria are not met: …
> 422:    lines.push(`  [${criterion.met ? 'x' : ' '}] ${criterion.label}`);
> ```
>
> plus 19 assertions in `status.test.ts`. `:422` is the inversion trap: if `met` were **widened** to a tri-state rather than **replaced**, any truthy value renders `[x]`, so `unproven` would print as MET — the exact inversion this finding exists to prevent, introduced by this finding's own fix. The type must be *replaced* so `tsc` enumerates every site.

### F-M · The existing suite will not go red on its own — READ

`status.test.ts:111` mints a **fresh** `creativeBriefId` per package (`nextId('01J9CB')`). Under dedupe-by-CreativeBrief all 20 hand-computed packages stay distinct, and **every existing test stays green**. `PackageOptions` (`:54-70`) has no field to express the case T-1 settles.

The spike gets no free red tests. New tests must be written, and `PackageOptions` extended, or the change ships unproven.

### F-N · The reader must accept v2 before any writer emits it — READ

`status.ts:116` hardcodes `CONTENT_PACKAGE_SCHEMA_ID = '…/content-package-v1.json'`, and `loadAllPackages` validates every candidate against that one `$id`. A v2 package written today lands in `unreadable`; criterion 4 requires `unreadable.length === 0` (`:365`). **Reader before writer, in that order, or criterion 4 goes red the moment the first v2 package is minted.**

Also **READ**: `status.ts` prints no remedy at all for an unreadable package (`:443-446` — path and reason only). It does not tell an operator to delete evidence; it tells them nothing. The non-destructive-remedy precedent lives in `reviews.ts:338-341`, not here.

### F-O · `skills sync --check` will not catch a family bump — READ

`skills-sync.ts:250` verifies each skill's `contractsUsed` names resolve to a file under `schemas/`. Because tech-spec §3 keeps v1 on disk, `contractsUsed: [content-package-v1]` keeps resolving and the check stays green. Its own doc comment (`:214-216`) claims a major bump "has to be visible HERE, not three stages later" — under the add-a-new-file rule that claim is **false**. It detects retirement, not a bump. A second surface Stage 0B would silently pass.

### F-P · The drift classifier has no direct tests, and its one indirect test models an impossible state — READ

`packages/contracts/tests/` contains no `contract-set.test.ts`. `diffContractSets` and `currentContractSet` have **zero** direct unit tests; every assertion is indirect, through `status.ts`.

The single test exercising the `breaking` branch — `status.test.ts:343` — sets `schemaId: '…platform-edl-v1.json', majorVersion: 2` : a major bump **as an in-place mutation of a published `$id`**, precisely what tech-spec §3:94 forbids. **The only proof that criterion 3 catches a breaking change comes from a state the versioning policy declares impossible**, and no test covers the state the policy actually produces.

Also uncovered: no test exercises `window.length === 1` or `=== 2` — the exact state the repository is in right now.

### F-Q · T-1's escape clause is unrepresentable — READ

T-1 says a later package supersedes "unless both are separately approved for publication". Nothing on `content-package-v1` expresses that: `releaseState` at Phase 0 emits only `editorially_approved` / `rights_approved`, and the skill explicitly refuses `publish_ready` / `published` (`main.ts:564-567`). Both real packages are `rights_approved`, so today the exception is indistinguishable from the rule. The policy must either say the exception is out of scope at Phase 0, or name the field that will carry it.

---

## What this means for the plan — DESIGN

The evidence separates Stage 0B into three concerns that the prose plan had fused into one, and that fusion is the best explanation for three rounds of BLOCK.

**1. The counting model needs no contract change at all.** F-J and F-K show T-1 is computable from `lineage.creativeBriefId`, which every delivered package already carries and v1 already requires. That removes, from the counting work: `content-package-v2`, `outputId`, `outputLineage`, `supersession-record-v1`, its writer, its reader, the cross-job addressing model that "has none today", the version-dispatching reader, and the cross-package lineage validator. **Nine of the twelve 0B tasks exist to support a stored identity the data does not need.**

**2. The drift defect is real, latent, and independent.** F-A is a genuine defect, but it can only bite once a second major exists. Fixing it *before* any v2 lands is cheap, testable in isolation, and removes the trap. It touches no schema file. F-B, F-C, F-D and F-E are its complete specification, and F-P says it must acquire direct tests because it currently has none.

**3. The actual migration is smaller than it looked, and is now safe to sequence last.** With the identity motive removed, what remains that genuinely wants a new major is the deferred `render-v1` path-pattern fix. Whether `content-package` needs a v2 at all becomes an open question answered by scope rather than by identity.

The recommended split, and the reasoning, belong in the plan. What the spike establishes is that **the split exists in the code**, is not an organisational convenience, and that the riskiest-looking half (the migration) is largely optional while the least-discussed half (the drift classifier) is mandatory.

## Residual unknowns the spike did NOT close

Named rather than left silent.

1. **The `pytest` summary count.** Two runs exited 0; the count line was not captured through the background wrapper. The exit status is the claim; the number is not.
2. **Whether `content-package` needs a v2 at all.** The spike removed the *identity* motive. It did not survey whether anything else in Stage 1's handoff contract requires one. That is a scope question for the plan.
3. **What a family reducer should do with `{v1,v2} → {v2}`** (F-C). The spike proves the signal exists and can be lost; it does not decide whether family-level retirement should read as breaking. That is a design call the plan must state and test.
4. **The `readJson` validation gap on `creativeBriefId`** (F-I). Measured as present; not fixed. If identity derives from it, the plan must decide whether to promote that read to `readContract`.
5. **Whether `Role3`→`Role4` should be defended by a test.** The renumbering is safe today only because nothing imports it. Nothing pins that.

## Probe hygiene

Three schema files were created under `packages/contracts/schemas/`, generated into temporary directories only (`generateAll({tsOutDir, pyOutDir})`), and deleted. The committed generated trees were never written to. Verified afterwards:

```
git status --short   ->  ?? cutdown/.env.example      (pre-existing, owner-gated T-14)
git rev-parse HEAD   ->  276176e                      (unchanged)
build:contracts --check   ->  generated trees are current: PASS
validate:contracts        ->  42 cases, 0 lint, 0 failures, 0 disagreements: PASS
```
