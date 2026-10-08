// THE TEST FILES WHOSE COST IS PROCESS SPAWNS — a LIST, not a producer
// (CLAUDE.md Respin rule 7). `vitest.config.ts` runs them in their own group,
// after the parallel PGlite group and before the real-Postgres groups, so they
// never compete with ~20 CPU-bound workers for the machine.
//
// WHY (Phase 5 gate follow-up, 2026-10-06, measured on this Windows host).
// `tests/shell-scripts.test.ts`'s "a FAILED tombstone query" case runs
// `scripts/backup.sh` once. Traced with `PS4='+${EPOCHREALTIME} ' bash -x`:
// 131 commands, 5 of them `node`, 2.4 s wall with the machine idle, the largest
// single step a 0.26 s `node -e` — every step is a process start (MSYS fork
// emulation, node boot), none is file I/O. The same case took 2.15 s alone in
// vitest, 17.9 s inside the full unit run, and passed its 60 s limit inside the
// live run: an 8-28x multiplier that is CPU contention, not work. The work is
// fixed by the script under test (the test must run the real script), so the
// fix is to stop the contention, not to raise the limit. The whole file alone
// takes ~27 s, which is what this group adds to the wall clock.
//
// Paths are workspace-relative with forward slashes.
export const SPAWN_BOUND_SUITES = ["tests/shell-scripts.test.ts"] as const;
