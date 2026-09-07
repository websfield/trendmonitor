# Phase 10b-1 Task 5 review manifest

Status: built 2026-09-07. **Two full reviewer rounds: four BLOCKs in round 1, three BLOCKs in round 2.** Every finding from both rounds was actioned or explicitly deferred. The pack's two-round rule is exhausted — no round 3 was run, and the residuals below are for the owner to weigh rather than to re-review.

Tasks 3 (Grade A) and 4 (closed green) are preserved. The only Task-4 files changed are `worker/{deletion-lifecycle,production,main}.ts` at the seam Task 4 named for Task 5 — plus one Task-4 defect this task found and fixed: `main.ts` never passed `erasureScopesEnv`, so `RESPIN_DELETION_ERASURE_SCOPES` silently did nothing in production and Task 4's loud startup refusal was unreachable.

## The provisioning fork, settled by the plan

The plan's Deferral ledger already decided it: "implementation can build the exact adapter and local contract tests without external mutation", received by "explicit owner provisioning approval plus production restore walk". So Task 5 builds against an enforcing in-memory S3 and ships the exact production adapter. **No AWS resource was created, no charge incurred, no credential read.**

## Round 1 — four BLOCKs

| Gate | Verdict | Counts |
|---|---|---|
| respin-billing-reviewer | BLOCK | 2 BLOCK · 9 CHANGE · 5 NOTE |
| respin-tenancy-reviewer | BLOCK | 3 BLOCK · 7 CHANGE · 4 NOTE |
| security-reviewer | BLOCK | 3 HIGH · 8 MEDIUM |
| code-reviewer | BLOCK | 5 BLOCK · 7 CHANGE · 4 NOTE |

The entry gate was green — 4,768 tests, build clean. Not one of these defects was visible to it.

1. **Receipt encoding — a permanent wedge.** The store returned S3's wire encoding (base64) in the receipt; `appendJournalTransitionInTx` requires the domain encoding (hex). Every append would have written its object under a 28-day COMPLIANCE lock and then been refused; the retry would hit `If-None-Match` and the operation would wedge forever beside an undeletable orphan. Fixed by splitting `checksumBase64` (wire) from `checksumHex` (domain), with a test crossing the store↔lifecycle seam that no test had crossed.
2. **`GetObjectCommand` omitted `ChecksumMode: "ENABLED"`.** The installed SDK's own docs: "To retrieve the checksum, this mode must be enabled." Without it, every object on a healthy journal reads as `checksum_mismatch` — restore refuses permanently and day-28 purge never runs.
3. **A cancellation appended after erasure verified clean and planned `restore_access`** — it would un-delete a creator whose irreversible erasure had already run.
4. **Journal-only operations printed a replay step nothing could execute**, with both scripts telling the operator the worker would handle it. The worker claims work from `deletion_operations`; a row that is not there is never claimed.
5. **`-mtime +21` deletes at 22 days**, putting the last capable copy at day 29 against the day-28 bound the same file derives.
6. **The CRLF fix was working-tree-only.** The blob was already LF; `core.autocrlf=true` re-added CRLF on checkout, and `.gitattributes` covered only `*.md`/`*.json`.
7. **`db:check` is offline** and cannot observe a restored database, yet the drill printed "the schema matches".
8. **The IAM templates denied the enumerator's own listing call**, so the production restore walk would die on `AccessDenied` after the bucket was committed.
9. **The enablement gate reached no user path** while the RUNBOOK and README claimed it blocked new accounts.
10. **The `DROP DATABASE` guard was a prefix glob** with unquoted interpolation; the reviewer demonstrated the bypass.

## Round 2 — three BLOCKs, on the fixes

| Gate | Verdict | Movement |
|---|---|---|
| respin-billing-reviewer | NEEDS CHANGES | 2 BLOCK → **0 BLOCK**; both round-1 BLOCKs verified closed |
| respin-tenancy-reviewer | BLOCK | B1 fixed for the instance, still open for the class |
| security-reviewer | BLOCK | 9 of 11 closed; one regression introduced by a fix |
| code-reviewer | BLOCK | one new blocking defect introduced by a fix |

- **The B1 fix guarded the instance, not the class.** A one-version chain declaring `erasing → cancelled` slipped both new checks: at version 1 there is no previous state and no seen state. Closed by reusing the package's existing `TRANSITIONS` authority (exported as `isLegalDeletionTransition`) instead of a hand-rolled subset, plus a genesis check. Applying it immediately exposed that the suite's own fixtures described impossible histories (`requested → tombstoned` skips `journal_pending`); they now follow the real happy path.
- **`psql -c` does not interpolate `:"db"`.** The round-1 "parameterised" fix would have aborted the drill on every run. Measured against psql 17.11: `-c` errors with `syntax error at or near ":"`; stdin interpolates and quotes. Statements moved to stdin.
- **The drill printed the database password** into the transcript it tells the operator to file in `RUNBOOK.md`. Every printed URI is now password-stripped.
- **The restore verifier refused every production dump.** Any restored row with no journal chain counted as `database_ahead_of_journal`, and two states produce that legitimately: a pre-journal row (`journal_version` defaults to 0, and the request row commits before any append) and every operation past its day-28 purge. From day 28 onward the drill could never pass, and the printed remedy was impossible. Closed by enumerating the three populations explicitly, with tests.
- **The "orphan" sidecar sweep deleted the manifest and checksum of live dumps**, destroying the manifest authority the same change installed. Closed by actually checking the dump is gone; the prune now has executable tests over dated fixtures.
- **The migration-ledger comparison passed vacuously** on a non-integer or 0/0 — the comparisons sit inside `if`, so `set -e` does not fire. Closed by validating both counts; the banner now says "cardinality check, not schema identity".
- **The LIST measured proxy** made envelope and measured bases disagree 10× on the same quantity. Closed by pricing the whole measured read class at the PUT tier — the conservative direction — with witnesses.

## Two process facts worth recording

- **A fix without a witness is not a fix.** The `compareRestoredState` correction initially had none: a re-planted mutation left the suite green. The same pattern appeared in `journal-purge`'s exit code and the entire prune loop. Each now has an executed test.
- **Several edits in the fix pass were silent no-ops** — string replacements that matched nothing, caught only when later asserted on. Every subsequent edit asserted its anchor.

## Verification on the final tree

Six mutations re-planted against the round-1 fixes — receipt encoding, `ChecksumMode`, cancellation-after-erasure, state continuity, `databaseState`, `maxAttempts` — all redden; baseline green. The CRLF fix is verified through `git checkout-index` with the repo's real filters: 91 CRLF / 10 broken continuations → 0 / 0.

## Residuals — NOT fixed, for the owner

- **The journal-PUT / Postgres-COMMIT orphan window.** The two are not one transaction; a crash between them leaves a durable version and a rolled-back operation, and the retry recomputes the same key and wedges on `journal_conflict`. Closing it needs a reconciliation read (an existing object whose checksum matches the intended bytes is an idempotent replay, not a conflict), which requires the verifier principal in the worker. In the Deferral ledger and `respin-finish-open-items.md`.
- **The enablement gate is a deployment-checklist gate, not an in-app one.** `journal:forecast` exits 2; nothing in the running app consults it. Deferred deliberately — there is no public-launch flag to gate, and gating sign-up would invent a product decision.
- **No `schemaVersion → reader` registry.** The canonical serialisation is pinned by a golden, but the remedy its failure message prescribes (a version bump plus a reader that still parses v1) is not yet expressible.
- **Three refusal codes remain unwitnessed**: `foreign_object`, `operation_id_mismatch`, `unparsable_payload` through a chain; `JOURNAL_CONFLICT_SCHEMA` needs an `as unknown as` smuggle.
- **`s3:ObjectCreationOperation` used with a `Bool` operator** could not be verified offline. Close it with provisioning evidence: apply the rendered policy, attempt a non-conditional PUT, record the AccessDenied.
- **Dynamic `import()` bypasses the `scripts/**` writer deny** — `no-restricted-imports` has no `ImportExpression` handler, and the repo's git-grep scan covers `app`/`lib`/`middleware.ts` only.
- **The fake's `listVersions` does not enforce the IAM prefix grant**, so widening the enumerator back would stay green while production died on `AccessDenied`.

## What is NOT proven by anything in this repository

The bucket, its policies and the three principals exist only once an owner creates them. The contract tests prove the adapter's behaviour against an enforcing in-memory S3; they are not evidence that a real bucket is configured correctly, and they never will be. Engineering completion and evidence completion are separate claims — the production restore walk is the second one.
