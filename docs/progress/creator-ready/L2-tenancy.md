# L2 gate — respin-tenancy-reviewer (2026-10-04)

Frozen manifest `L2-gate.sha256` digest `6b5ba677d515`; reviewer ran `sha256sum -c` before and after, exit 0 both.

**Verdict: NEEDS CHANGES · Almost · Grade B.** 0 BLOCK · 1 Medium · 1 Low · 2 Note. No isolation defect in code.

## Findings

- **Medium** `respin/packages/credits/tests/generate.test.ts:3135-3150`. The test "L2 PIECE: CROSS-PROFILE and SOURCE-INDEX forgery are refused…" never runs its cross-profile half. It sets the `creator` tier (seeded `profileCaps.creator = 1`), so `createProfile(...).catch(() => null)` always refuses and the `if (other !== null)` branch is skipped. A tsx probe confirmed `ProfileCapError` and that the branch is skipped. No `generate`-level test commissions a foreign profile's or workspace's `pieceId`. The behaviour holds through the scoped `readCreativePiece` (`creative-work.test.ts:144,191-203`, `isolation.test.ts`), so this is a false witness, not a leak. Fix: create the second profile on `studio` (cap 5) or in a second workspace and assert unconditionally. Add commission cases with a foreign `pieceId`, and with a foreign `pieceId` plus its operation id. Each must assert `not_found`, zero claims and zero provider calls.
- **Low** `respin/packages/credits/src/generate.ts:2364`. `request_snapshot.platform` stores the caller's platform string verbatim. The server accepts any non-blank string (`packages/modes/src/assemble.ts:1131`); the closed `PLATFORM_OPTIONS` list lives only in `app/(product)/studio/run-copy.ts:35`. This contradicts R-151 item 3 (the snapshot holds no creator text). Exposure is small: the row is the creator's own, deleted at erasure and expired after a year. Fix: record `platformSha256`, or refuse a platform outside the closed set on the server before the claim.
- Note `respin/packages/db/src/generation-schema.ts:792`: source immutability ("nothing updates either column after insert") is not enforced by a test or a trigger.
- Note `respin/packages/db/src/creative-work-ops.ts:331-349`: `linkCreativePieceScriptInScope` does nothing on a foreign `pieceId`. This is safe (scope predicate plus composite FK) but no test witnesses the foreign case.

## Checks

The following checks hold: T1 scoping (same-ID lookup scoped through `both(generationAttempts)`, including `FOR UPDATE`; a foreign operation id misses the scoped re-read; `/studio?piece=` gives a foreign piece the same `not_found` as a missing one), T3, sensitive inference, T4 export and erasure (populated, census complete), T5 roles and pause, T6 (except the Low above), and rule 7 (populations are enumerated as lists). T2 is n/a. R-151 items 1, 2 and 9 are sound; item 3 holds except `platform`.

Commands run by the reviewer: `TEST_DATABASE_URL=… pnpm -C respin exec vitest run packages/db/tests/creative-work.test.ts tests/studio-piece-action.docker.test.ts packages/db/tests/export.test.ts packages/db/tests/deletion-executor.test.ts`: 4 files, 63 passed, live.
