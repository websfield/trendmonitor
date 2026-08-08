# Residual-closure review — cutdown (post-`PIPELINE_IMPLEMENTATION_COMPLETE`)

**Date:** 2026-08-06 · **Mode:** single-driver under `/go` ("continue cutdown implementation with full automation, 100% completion, best quality") · **Verdict: Ready** · **No milestone changed.**

This is not a plan phase. All six phases were Complete and `PIPELINE_IMPLEMENTATION_COMPLETE` was earned on 2026-08-02, with a named residual backlog carried in the Phase 2/4/5/6 reviews. "100% completion" was therefore read as *that backlog*, triaged into what can be closed here and what cannot.

## Entry gate (re-run from a clean build after the reviewer fixes)

| Check | Before | After |
|---|---|---|
| `tsc --build` | exit 0 | **exit 0** |
| `pnpm -r --no-bail run test` | exit 0 | **820 tests · 818 pass · 2 documented Windows skips · 0 fail · 0 `✖` · no `ERR_PNPM`** |
| `pytest -m "not slow"` | 644 passed | **671 passed · 0 fail** (18 slow deselected) |
| `ruff check .` (cutdown's own config) | clean | **clean** |
| `build:contracts --check` | PASS | **PASS** |
| `validate:contracts` | PASS | **PASS — 42 cases, 0 lint, 0 cross-validator disagreements** |
| `skills sync --check` | PASS | **PASS — 10 skills** |
| UGC `docs/initial/schemas/*.json` parse | OK | **OK** (untouched) |

Net **+27 Python and +~9 TypeScript tests**, all of them pinning behaviour that previously had none.

## Closed

| Residual | What it was | What closed it |
|---|---|---|
| **P2-3** | `iter_luma_frames` broke on a short read and discarded ffmpeg's exit status — a mid-stream decode failure produced a truncated frame series every run-length detector read as *clean footage* | Exit status checked, with the natural-EOF path waiting for ffmpeg to report its own status; stderr drained on a thread against pipe-deadlock; positive + negative tests |
| **P2-2** | "No video flags" and "no decodable video stream" were indistinguishable; the ledger said `completed, reason: null` for both | The nested `subStage` record `main.py` already honours, naming any unexamined modality. 4 tests, including the control that a fully-examined asset records **no** reason |
| **P2-4 → D-53** | `audio_events.py` synthesised a whole-asset `silence` at `confidence: 1.0` under an engine that processed zero samples; `quality.py` refused to report `silence` at all. Phase 3 now consumes `audioEvents`, so the disagreement was about to become load-bearing | Decided per developer-guide §5: an AudioEvent is a *detection*, so a stream-less asset yields an empty collection plus a ledger reason. `source-index-v1.json` already legislated this shape |
| **P2 minor** | `_SAFE_ID` accepted Windows reserved device names | Closed in **all three** mirrors of the guard. Found en route: the Python guard — the one the Phase 2 security review demanded — had **no tests at all** |
| **P4-3 → D-54** | `audio.targetLoudnessLufs` was required by the ruleset loader and read by nothing. It survived Phase 4 because the "every field is READ" test drove a hand-written list of 18 of 26 settings | Key deleted (ruleset → 1.1.0); the test now **derives** its leaves from the shipped ruleset — each must be perturbed, proven live in the measurement filtergraph, or declared not-a-threshold |
| **P4-6** | Two comments claimed properties the code lacked | `assertDeterministicArgv` now really checks `-flags:a +bitexact` (the **code** fixed, not the comment); `checks.ts`'s "no literals" claim narrowed to what is true, with all three literals named |
| **P5-3** | `counts.packagesMissingEvidence` looked live but was mostly unreachable | Per-line annotations naming the schema constraint behind each, plus a test that **pins those constraints** so a loosening fails loudly instead of leaving the comment wrong |
| **P5-5** | `revise` told operators a quote caption "carries no display text to rewrite" — false; and the mirror tests wrote the repo's real `skills/registry.json` | The two caption kinds refuse separately with the real reason (D-37's subsequence binding); `skillsSync` gained an injectable `registryPath` |
| **P5-2 → D-55** | `skills sync` writing above the workspace looked like drift against tech-spec §2 | Recorded as spec-sanctioned, with the Stage C migration stated |

## Reviewer gate — two reviewers, both NEEDS CHANGES, then fixed and verified

Both verdicts were earned, and **two of the findings were defects this session introduced**:

- **`code-reviewer` (B−).** The `finally` in my own decode guard killed ffmpeg on *every successful decode* and then judged integrity by that exit code — measured at 180/180 runs, so only a lost race kept the status at 0, while the docstring asserted a distinction the code never drew. And the `-flags:a` fix **left its identical twin live** in `proxy.ts`, a content-addressed artefact that encodes AAC under a comment already claiming tier-1 determinism.
- **`security-reviewer` (B).** The three id-guard mirrors were **not** equivalent: Python's `$` also matches before a trailing newline, so `"abc\n"` was accepted by the worker — the one mirror reachable without the CLI — and rejected by both TypeScript copies. The CLI mirror threw a bare `Error`, surfacing as `UNEXPECTED_ERROR` exit 1 **with a stack trace** onto the stream four callers parse. The new stderr drain was unbounded on untrusted media.

All fixed: `\Z` anchoring; structured `inputInvalid` refusals (exit 2, no stack) in `assertSafeJobId` **and** `jobDir`; a bounded 16 KiB rolling stderr tail; `proxy.ts` now uses `determinismArgs()` and asserts its own argv; `-protocol_whitelist file` mirrored onto all three of `quality.py`'s ffmpeg/ffprobe calls; the device check added to `assertJobRelativePath` (the artefact-path **class** boundary that was the missed sibling); `-threads` tightened to a positive integer; and a seven-vs-eight miscount, a D-53/D-54 citation and an orphaned docblock corrected.

**One finding rejected, with evidence.** security-reviewer LOW claimed `MEDIA_DECODE_FAILED` fails closed with no way forward. It does not: `main.py::_stage` catches `SubStageError` *and* every `Exception`, records the sub-stage `failed` with its reason, and continues — its docstring is "never abort the run". `code-reviewer` reached the same conclusion independently.

**My own guard comment was measurably false.** It claimed every reserved device name silently discards writes. Measured on the D-33 machine: only `nul`/`nul.` are the device; `con`, `aux`, `prn`, `com1`, `lpt1`, `nul.json` are ordinary files, and a `nul` *directory* fails child writes **loudly**. All three comments and both user-facing messages now say that, and `TestWindowsDeviceNamesReallyMisbehave` measures it with a control rather than restating it.

**The structural fix.** `packages/skill-runtime/tests/safe-id-cases.json` — one case list (14 accept, 42 reject) driven through all three mirrors. Three deliberate duplicates with three independent suites is how they drift; nothing pinned them together until now, which is why a security review found the gap instead of a test.

## Honest notes

- The first "green" full TS run was a **false green twice over**: `pnpm -r` reported every package `fail 0` while `apps/cli` also printed a failing test (a throw during suite *construction* is not counted in that package's tally), and because every package runs `node --test dist/**`, tests added after the last build did not run at all. Both caught before the gate was claimed; every number above is from a clean rebuild.
- The derived-leaf ruleset test caught a regression **I** introduced while refining it. Working as designed.

## Open, deliberately

`poor_crop` subject-clipping (needs a subject/face model). `render-v1` path patterns (a *breaking* Phase-4 contract change — belongs in a deliberate version bump). The `artefact-path-discipline` lint's grep shape (a tripwire by construction). The cutdown ruff selection (a separate deliberate call). `com0`/`lpt0` are accepted: measured as ordinary files here, though Microsoft's docs list them as reserved — the two reviewers disagreed, and the measurement decided it.

## Owner-blocked — unchanged, and not closable from this repo

- **`PHASE_0_EXIT_EARNED`** — needs real footage, rights records and account IDs (**D-27/D-36**). Still red, correctly.
- **`PHASE_3_ACCEPTED_LIVE`** — needs the spend ceiling (**D-21**).

## Definition of Done

Entry gate green (above, re-run after every round) · both reviewers run to verification, every must-fix closed · decisions D-53/D-54/D-55 appended · master plan and ledger updated · no invariant weakened, no milestone advanced.
