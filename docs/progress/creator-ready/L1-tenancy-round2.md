# L1 gate — respin-tenancy-reviewer, round 2 (the one permitted re-run, 2026-10-03)

Frozen tree: `L1-freeze-r2.sha256`, 41 files, `sha256sum -c` 41/41 OK before and after. Sorted digest `3a85025daeb4` (reproduces after `tr -d '\r' | sort`; raw-file digest `6f0b6ad0b0da`).

**Verdict: PASS · Ready · Grade A.** 0 BLOCK, 0 High, 0 Medium, 1 Low, 3 Note.

## Round-1 findings

- Medium (scaffold quotable as the creator's words): **closed** — `basisCorpusFor` builds from `creative.creatorNote` (`respin/packages/modes/src/assemble.ts:305-317`), set from `params.input` (`generate.ts:856`); assembly refuses a note not inside `input` (`assemble.ts:1097-1104`); witnesses `revision.test.ts:1389-1435` (all three scaffold sentences), `mode-checks.test.ts:1335`, `pipeline.test.ts:1249,1253`.
- Low (prompt-name comment): **closed** — finding names only the model's own custom name (`mode-checks.ts:1398`); `approvedFrameworkNames` read only at `assemble.ts:336,1108`.
- Low (`getTierCheckoutProtocolState` exclusion untested): **closed** — `isolation.test.ts:1193-1206` with non-vacuity on `subscriptions`.
- Low (no library-write assertion): **closed** — `generate.test.ts:2427-2447`.
- Notes: recorded (R-149 item 8, `decisions.md:1911`) / unchanged.

## Findings

- **LOW** `respin/packages/credits/tests/isolation.test.ts:652` and `respin/packages/credits/src/presented-output.ts:43-46` (also `isolation.test.ts:1058`, comment above `app-server.ts:279`): the reason still says "two PURE functions" (now three), and the docstrings say Studio and "the export (L4)" both read `presentedFilming` "so the two cannot disagree" — the export does not import it today. Fix: reword to "Studio reads it today; L4's export presenter must"; "two" → "three".
- **NOTE** `mode-checks.ts:99` docstring says `carriedUnconfirmed` arrives "marker removed"; `generate.ts:2476` passes it with the marker, stripped later at `mode-checks.ts:983`. Reword.
- **NOTE** `generate.test.ts:2341-2343` smuggle cases do not name `carriedUnconfirmed`/`creatorNote`; no channel exists (`creative.ts:319-322` refuses other keys; `generate.ts:853-860` builds field by field). No action.
- **NOTE (§6, not graded)** `decisions.md:1903` R-149 item 1 says the export reads `presentedFilming`; it does not yet.

## New code judged for tenancy

`carriedUnconfirmed`/`carriedBasis` come only from the scoped parent read (`resolveRevisionParent` → `readGenerationForAttempt`, `with-workspace.ts:4911-4918`, two-axis `both()`); forged/foreign ids refused before any passage is read (`revision.test.ts:407,446`, R5c). Stored server `[check]` marks only append a literal; `generations.output` stays `creator_content_no_internal_link` (`creator-data-registry.ts:708`); census accurate; export whole-row; deletion by profile cascade. `presentedFilming` enumerated in `INTERNAL_MODULES`, `NOT_DB_FACING`, `FACADE_REEXPORTED` with a checked import scan. `EVENT_SHAPES` precision/recall: no tenancy relevance.

Checks 1–8 hold (8 with the Low). Reviewer ran `vitest` filtered on revision/isolation/mode-checks (13 tests passed); no mutations.
