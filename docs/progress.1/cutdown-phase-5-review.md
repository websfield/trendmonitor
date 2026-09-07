# Phase 5 review — Approve, Package, Revise, Skills Sync + Mirror, Phase-0 Status

**Feature:** cutdown · **Date:** 2026-07-30 · **Verdict: Almost** — four reviewer rounds, cap lifted; every BLOCK/HIGH/CRITICAL/MEDIUM from all four fixed; 6 residuals, none silent
**Milestone:** `PHASE_5_IMPLEMENTATION_COMPLETE` earned. `PHASE_0_EXIT_EARNED` remains red and cannot be otherwise — it needs real footage (D-27).

---

## Report card

| Gate | Result |
|---|---|
| `build:contracts --check` | **PASS** — both generated trees current |
| `validate:contracts` | **PASS** — 40 fixture cases, 0 lint violations, 0 cross-validator disagreements (Phase 4: 32) |
| `skills sync --check` | **PASS** — registry + 10-skill mirror current |
| `test:skills` | **PASS** — 6/6 skill suites |
| `pnpm -r test` (TypeScript) | **PASS** — **793 tests, 0 fail, exit 0**, all 18 packages green (Phase 4 baseline 596 → **+197**) |
| `pytest` (Python) | **PASS** — 661 passed, 0 fail (untouched by this phase) |
| `code-reviewer` round 1 | **BLOCK** — 1 BLOCK + 10 CHANGE + 8 NOTE |
| `security-reviewer` round 1 | **BLOCK** — 1 HIGH + 2 MEDIUM + 4 LOW/INFO |
| `code-reviewer` round 2 (verification) | **BLOCK** — 1 NEW BLOCK + 9 CHANGE; round-1 BLOCK closed, 1 fix REGRESSED, 4 tests could no longer fail |
| `security-reviewer` round 2 (verification) | **BLOCK** — 1 NEW HIGH + 2 NEW MEDIUM + 4 LOW; round-1 HIGH closed as scoped, PARTIAL as a class |
| `security-reviewer` round 3 (verification) | **BLOCK** — 1 **CRITICAL** (a pipeline outage my round-2 fix caused) + 2 MEDIUM + 2 LOW |
| `code-reviewer` round 3 (verification) | **BLOCK** — 2 BLOCK + 5 CHANGE + 5 NOTE; 8 of 9 round-2 findings closed, 1 REGRESSED to unfixed |
| Post-round-3 fixes | Every round-3 finding fixed, plus 6 NEW unguarded sites the new lint found |
| `security-reviewer` round 4 (verification) | **NEEDS CHANGES** (up from BLOCK) — 4 of 5 round-3 fixes verified correct; 3 MEDIUM + 4 LOW |
| `code-reviewer` round 4 (verification) | **BLOCK** — 1 BLOCK + 7 CHANGE + 5 NOTE; both round-3 BLOCKs confirmed closed |
| Post-round-4 fixes | Every round-4 finding fixed; **811 TS tests / 0 fail**, whole entry gate green |

`/implement` Step 4 caps the reviewer gate at two rounds. Both round-2 BLOCKs were
fixed after the cap rather than carried, because a cross-job write and an
approval-inversion are not residuals. Phase 4 set the same precedent. The user then
lifted the cap for this phase explicitly, which is how rounds 3 and 4 came to run —
and round 3 is the reason that mattered: **it found that my round-2 fix had taken the
whole pipeline down.**

Boundary check: `git status` shows changes only under `cutdown/`, `docs/`, and
`.claude/skills/cutdown-*` — the last being exactly what Phase 1's *Out of Scope*
deferred to Phase 5.

---

## What the gates caught (the part worth reading)

Four rounds of review found four classes of defect I had shipped into the diff.
Recording them precisely, because two are repeats of lessons this project has
already written down.

**1. The Phase 2 path-traversal HIGH recurred on the TypeScript side.** `jobDir()`
built a path from a caller-supplied `jobId` with no guard, and the only check lived
in the CLI — where two documented callers bypass it: `cutdown skills run --job
<safe>` passes the request file through *unmodified* (so the request's own `jobId`
never met the assertion), and every `SKILL.md` declares a directly invocable
`entrypoint`. Verified empirically before fixing: win32 joins the jobs root with a
`..\..\..\evil` id to `C:\evil`, both separators. The fix went into the shared
chokepoint, which also closed the same hole in `ingest`, where the out-of-tree write
was *unconditional*.

**2. Then the fix routed three sibling fields around its own chokepoint.** Round 2
found `validate`'s `edlId` reaching a read *and* two `mkdir -p` writes — so
`../<other-job>/edl/<x>` wrote a gate result inside another client's job, with
directories created on the way. `validate`'s schema had gained the `jobId` pattern
in that very fix while `edlId` stayed at `minLength: 1`. Also unguarded:
`asset.storedPath` into an FFmpeg input path — **the exact field
`assertJobRelative`'s own docstring names** — plus `revise`'s `render.edlId` and
`plan`'s `creativeBriefId`. This is the Phase 4 "adjacent field" shape, and it is
worth a Lessons line.

**3. A docstring that claimed a property the code did not have.** I wrote "total
order over decisions" and implemented a **string** compare on `decidedAt`, a field
whose `format: date-time` admits UTC offsets. `2026-07-31T04:00:00+10:00` (18:00Z)
sorted *after* `2026-07-30T20:00:00Z` while being genuinely earlier — so an approval
could outrank a later rejection, and every reader (render, package, the runner gate,
`status --phase0`) would then have authorised a cut a named human rejected.

**4. And the fix for that realised the inversion round 1 warned about — wider than
before.** `ApprovalResolution` carried `rejectedFiles` on the `none` arm *only*, so
when an approval resolved, an unreadable **rejection** was invisible. Adding Ajv
validation made it worse, not better: Ajv refuses strictly more files than the
key-presence check it replaced, and a rejection carrying an RFC-3339 leap second
(`23:59:60Z`) is contract-valid and `Date.parse`-NaN, so it vanished silently. Fixed
with an `indeterminate` arm: **any** unreadable file under `reviews/` makes the answer
indeterminate *before* any decision is examined, because the set is what determines
"latest", so an incomplete set cannot determine it.

**5. And round 2's fix was worse than the bug — it was an outage.** The
`indeterminate` arm treated every `*.json` directly under `reviews/` as a candidate
decision. But `validate` is pipeline step 5 of 9, so **every** job writes
`<edlId>-gate.json` and `<edlId>-critic.json` there. The result: with a valid human
approval on disk, `render --tier final` threw, `package` threw, the runner gate
blocked, and steps 7–9 became unreachable — making two of the four Phase-0 exit
criteria permanently unmeasurable. On the happy path. No attacker involved. And the
refusal it printed told the operator to delete two files that are *required evidence*.
The lesson is the one I would not have reached from the fix alone: **a control with no
recovery path is an outage wearing a control's clothes.** `reviews/` is now a
namespace (`<ulid>.json` only — the name `approve` guarantees), validate's outputs
live in `reviews/gates/`, and tech-spec §9.1 says so, since it had specified
ReviewDecision-only all along and the code had been quietly violating it since Phase 3.

**6. A fix that was connected in name only.** Round 2's `media.source` provenance fix
declared `usedSourceOriginal`, wrote the comment explaining it, detected the
proxy-less fallback, warned on stderr — and never assigned the variable. It appeared
exactly twice in the file: the declaration and the read. Behaviour was byte-for-byte
the version it was meant to replace, so a draft rendered from the originals still
recorded `media: { source: 'proxy' }` — a false provenance claim in a committed
artefact. This is the fourth comment this phase asserting a property the code lacked,
and the only one that was itself a fix for the property it failed to implement.

**7. The same sibling-id defect, third recurrence — so it got fixed structurally.**
Guarding the field a reviewer names has now failed three times in a row. `validate`
and `render` load the EDL, story plan and CreativeBrief through `readContractJson`,
which validates the whole artefact and therefore enforces every `$ref: Ulid` on it at
once. There is no per-field guard left to forget. It immediately caught three fixture
families that had been contract-invalid all along, inventing
`modelProvenance.promptVersion` and `recordedFixture` — fields no real emitter writes.

**8. Round 4: the same defect at recurrences five and six — and this time my *fixes*
enumerated fields instead of classes.** The BLOCK was the worst of the phase in one
respect: `render` read the approved draft manifest with a bare cast, and
`assertFinalMatchesApprovedDraft` iterated the **draft's** keys only — so a draft
manifest stripped to two hashes skipped every other comparison and returned
`ok: true`. `output` geometry, `fonts`, `platformOverlayVersion`, renderer and ffmpeg
versions, `audioMix`: all unchecked. A final master nobody signed off passes tech-spec
§11's post-approval gate. And `package` read the *same file for the same purpose*
through a validating helper ninety lines away. Two defences now — `readContractJson`
on the read, and the comparison scans the **union** of both key sets so an absent key
is itself a change.

**9. And one of my security fixes broke a documented production option.** I contained
`styleProfilePath` alongside the two recorded-fixture overrides, but it is not one of
them: `cutdown validate --style-profile` is documented, the real profiles ship at
`data/style-profiles/*.yaml`, and their `prohibitedClaims` feed a **blocking** gate. So
every legitimate profile was refused, and the gate quietly ran with fewer prohibitions
than the brand declares. `validate`'s loader was also JSON-only, so the shipped YAML
had never parsed at all. This is the **second** time this project has learned that a
guard must not break the ordinary path — and the first time I caused the very failure
mode the earlier lesson describes.

**10. And then a 90-line lint found a FOURTH recurrence in minutes.**
`artefact-path-discipline.test.ts` asserts no artefact path field reaches a bare
`join`. It found six live sites three review rounds had missed:
`manifest.captions.{ass,srt,vtt}Path` in `render` and in the FFmpeg adapter — where the
ASS file is then handed to FFmpeg as a subtitles-filter input, so a traversing value in
a stored manifest wrote caption files outside the job and burned them into a master.
The root cause was structural: the guards lived in `skill-runtime`, which
`renderer-ffmpeg` does not depend on, so that package had no way to reach them. They
now live in `@cutdown/contracts` — the right home, because "this field is
job-relative" is a *contract* statement — with `skill-runtime` re-wrapping them so
exit-code semantics stay put.

Two further honesty failures, both mine, both now fixed: three comments asserted
behaviour the code did not have (golden rule 1), and `skills sync` printed "NOTHING
was written" after writing (golden rule 6).

**And a claim of mine that was simply wrong.** I reported the `/cutdown-propose`
round-trip as proven. I had run it from inside `cutdown/` with a `project-data/…`
path — not from the repo root as an agent would — so I proved the wrong thing while
the documented path double-prefixed to `cutdown/cutdown/…`. Re-verified properly:
from the repo root, following the mirror literally, `brief` committed a JobBrief and
returned its path, hash and no-CTA warning. The mirror body now names both roots
explicitly and warns about that exact ENOENT.

---

## What shipped

**Contracts (2 new + 1 enum).** `review-decision-v1` (the human act, D-9) and
`content-package-v1` (the deliverable and its evidence, REQ-088 Phase-0 subset +
D-36), plus `enums/package-release-state.json` (REQ-105).

Two states made **unrepresentable** rather than merely rejected:
`content-package-v1`'s `qa.gateStatus` has no `fail` member, `qa.blockerCount` is
`const: 0`, and `rangeValidation.status` is `const: "ran"`. `revise`'s output fixes
`reindexed` at `const: false`. REQ-088's Phase-1 items are **absent** rather than
present-and-null, so a Phase 1 addition is a compatible change.

**`packages/contracts/src/reviews.ts`** — the single latest-decision resolver, four
callers, ordered on `(decidedAt-as-instant, reviewDecisionId)`, contract-validated,
with the `indeterminate` arm above. **`contract-set.ts`** — criterion 3 computed
from the packages' own immutable `contractSet` rather than a separate mutable log.

**`packages/skill-runtime`** gained the containment layer: `assertSafeId`,
`assertContained`, `assertContainedPhysical` (symlink-resolving, for read/copy
sinks), `assertJobRelative`, `resolveJobRelative`, and a guarded `jobDir()`.

**`packages/renderer-core/src/stills.ts`** — cover + first frame, inside the one
module tech-spec §11 permits to spawn FFmpeg.

**Skills:** `approve` (20 tests), `package` (27), `revise` (7 + 15 unit),
`review-payload` (12). **`skills/meta-schema.json`** + `cutdown skills sync
[--check] [--prune]` (35 tests) + the live 10-skill `.claude` mirror. **`cutdown
status --phase0`** (21 tests). Phase 4 residuals 1, 2, 4 and 5 cleared.

---

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| tech-spec §15 steps 8–9 proven **in order** | **PASS** | `drives §15 steps 8-9 in order` asserts the exact 9-step sequence through two real gates, then replays with draft QA withheld: the job parks at `review`, `approve` is never invoked, packaging is unreachable |
| Lineage resolves both ways, no cycle | **PASS** | the package walks to its parents; the decision's JSON is asserted **not** to contain the package id (structural — `review-decision-v1` has no such field and is closed) |
| Fail-closed: pre-approval / draft / editorial divergence / failed QA / blocker waiver / expired rights / missing evidence | **PASS** | 17 refusal tests, each asserting **nothing** is left behind — no partial bundle, no staging directory |
| Revise narrowness: a caption note spawns no CreativeBrief | **PASS** | proof from **disk** — a second EDL landed; the briefs/story-plans/index/moments snapshot is byte- **and mtime**-identical |
| `status --phase0` matches the hand-computed 20-output scenario | **PASS** | 7/7/6 across three stable accounts, 3 fixtures excluded, 2 warning-waived counted separately, all four criteria green |
| `/cutdown-*` mirror round-trip | **PASS** | run from the repo root, following the generated mirror literally (see above); the ten skills are live in the agent's own skill list |

---

## Residuals (carried forward, none silent)

Rounds 3 and 4 closed the residual that mattered most (there had been no independent
verification of the round-2 fixes) — and closing it was worth it: round 3 found that
those fixes had taken the pipeline down. What remains:

1. **`render-v1`'s path fields still carry no pattern.** `outputPath` and
   `captions.*Path` are described as job-relative and constrained only by
   `minLength: 1`. Tightening the schema is a **breaking** change to a Phase 4
   contract (previously-valid instances would become invalid), so it belongs in a
   deliberate version bump, not a security fix. The guard is `resolveArtefactPath` in
   code — and as of round 3 that guard is enforced by
   `packages/skill-runtime/tests/artefact-path-discipline.test.ts`, which is what found
   six unguarded sites three review rounds had missed. **Next bump should add the
   pattern and delete the lint's reason for existing.**
2. **`skills sync` writes outside the self-rooted workspace.** `.claude/skills/` is
   above `cutdown/`, in tension with tech-spec §2's "references nothing above itself"
   — though §2 itself names that exact mirror location, so it is spec-sanctioned rather
   than drift. A Stage C extraction loses the mirror. Worth an ADR note.
3. **`counts.packagesMissingEvidence` is nearly unreachable.** After validate-on-read,
   only `weakestState` and a mismatched range-report id can trip it — both now tested,
   but the other seven checks in `evidenceGaps`/`rangeGaps` are structurally
   unreachable and should be pruned or annotated so the count is not misread as live.
4. **The `artefact-path-discipline` lint is grep-shaped.** It catches the one spelling
   that has actually gone wrong four times; it cannot prove containment, and it would
   miss a multi-line call or a path aliased through a local first. Its own two guard
   assertions (it finds files at all; every opt-out states a reason) keep it from
   passing vacuously, but it is a tripwire, not a proof.
5. **Known Phase-0 limits, deliberately unclosed:** two file-symlink tests still skip
   where Windows withholds the privilege (the security-relevant escape is now asserted
   through a directory **junction** instead, so the property is covered — round 3 found
   it had been covered nowhere); the `revise` refusal message for a `quote` caption
   states the wrong reason (the real one is D-37's subsequence guarantee);
   `mirror-prune.test.ts` still writes the real `skills/registry.json` (only the mirror
   root is injected).
6. **Four review rounds, and the last two found defects the green entry gate could not
   see.** Both round-3 BLOCKs were invisible to a passing gate because neither path had
   a test. That is the honest summary of this phase's testing: the gate proves the code
   compiles and the tests pass, not that the tests assert the right things.

## Decisions appended

- **D-50** — a timeline mixing audio-bearing and silent assets is REFUSED in `plan()`,
  never approximated by synthesising silence. Same call as D-47 for aspect treatments.

---

## Definition of Done

- ✅ Cutdown entry gate green, re-run after every round: `npx tsc --build` clean,
  **811 TS tests / 0 fail** (Phase 4 baseline 596 → 793 → 805 → 811) with 2 documented
  Windows skips, `build:contracts --check` PASS, `validate:contracts` PASS (40 cases,
  0 lint violations, 0 cross-validator disagreements), `skills sync --check` PASS
  (10 skills), `ruff` clean, Python suite clean, `pnpm audit` clean.
- ✅ `code-reviewer` and `security-reviewer` ran **four** rounds (cap lifted by the user
  for this phase). Every BLOCK, CRITICAL, HIGH, MEDIUM and CHANGE from all four rounds
  is fixed. Round 4's security verdict moved to NEEDS CHANGES with four of five
  round-3 fixes independently verified — including the ULID namespace regex checked
  character-for-character against the contract, and the ancestor walk verified live
  against a real Windows junction.
- ✅ Honest report — 6 residuals below, none silent, and the entry gate's limits stated
  rather than implied.
- ✅ Decisions appended (D-50).
- ✅ Docs consistent: tech-spec §9.1 defines `reviews/` as a namespace with `gates/` and
  `pending/` beneath it, `skills/validate/SKILL.md` matches, and both `.gitattributes`
  files now say which half each governs.
- ⬜ `PHASE_0_EXIT_EARNED` — unchanged and still red; needs real footage (D-27), rights
  records and stable account ids (D-36). Proven unreachable by fixtures: 20 fixture
  packages across three accounts leave criterion 1 red while still earning the pipeline
  milestone.

**The honest summary of this phase.** Four rounds, and *every* round found that the
previous round's fixes had introduced or missed something: round 1's chokepoint fix
routed three siblings around it; round 2's `indeterminate` arm took the whole pipeline
down; round 3's structural fix skipped the read that gates a final render, and one of
its security fixes broke a documented production option. The signature defect —
"guard the field the reviewer named, miss the sibling" — recurred **six** times, and
what finally moved the needle was not more review but three structural changes:
validating whole artefacts at the boundary, moving the guards to a package every
consumer can import, and a lint that fails when a new call site forgets. Two of the six
were found by that lint and by reviewers reading the lint itself, not by reading the
diff.

**Next:** Phase 6 depends on this phase. The first task should be the `render-v1`
pattern bump (residual 1): it converts the lint's reason for existing into a schema
constraint, which is the only version of this fix that cannot recur.
