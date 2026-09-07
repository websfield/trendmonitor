# Phase 10b-1 Task 5 — implementation contract (2026-09-07)

Task-sequence item 5 of `docs/plans/respin-finish-phase-10b-1.md`: "Implement R-124's S3
adapter/policies, `forecastDeletionJournalCost`, and local contract harness; enforce backup
maximum, independent tombstone manifests, restore-before-traffic replay, residue verification,
version purge, cleanup, and the forecast-only account/public enablement gate."

Tasks 3 (Grade A) and 4 (closed green, `10b1-task4-review-manifest.md`) are preserved. The only
Task-4 file this task changes is `worker/production.ts` + `worker/deletion-lifecycle.ts` at the
seam Task 4 named for Task 5 (`unavailableDeletionJournal` → the real store when configured).

## The provisioning fork, settled by the plan

The plan's own Deferral ledger already decided this: "implementation can build the exact adapter
and local contract tests without external mutation", received by "explicit owner provisioning
approval plus production restore walk; deletion/public launch stay disabled until then". C4 repeats
it: "local S3-compatible tests may prove the port, but production deletion remains disabled until
the exact AWS region/bucket/IAM/policy digest and a real restore are evidenced."

So this task builds against an **enforcing in-memory S3** and ships the exact production adapter.
No AWS resource is created, no charge is incurred, no credential is read. Engineering completion
and evidence completion are separate claims (CLAUDE.md Respin non-negotiable 6).

**Out of scope, blocked on owner provisioning:** the real bucket/region/IAM/Object-Lock/policy
application, the production restore walk transcript, the bucket ARN + policy digest evidence.

## Deliverables

5.1 `packages/db/src/deletion-journal.ts` — the store: key derivation, canonical bytes (reusing
    Task 3's `canonicalJournalPayload`), conditional-create append mapped onto `DeletionJournalPort`,
    and the narrow `S3JournalTransport` seam the SDK adapter and the fake both satisfy.
5.2 `packages/db/src/deletion-journal-s3.ts` — the only file importing `@aws-sdk/client-s3`
    (lockfile-pinned, R-124). Three separate transports: writer (create-only), verifier (read-only),
    purger (delete-version-only). The principal split is structural in code, mirroring the IAM policy.
5.3 `packages/db/src/deletion-journal-restore.ts` — version enumeration and the fail-closed chain
    verifier: exactly one object version per logical key, no delete markers, no gaps, contiguous
    prior-receipt digests, payload digest + S3 checksum agreement, correct retain-until.
5.4 `packages/db/src/deletion-journal-cost.ts` — `forecastDeletionJournalCost`, the immutable
    reviewed regional price snapshot, the USD 0.50 alert and USD 1 enablement ceiling, and the
    withholding rules. Pure: it cannot provision, charge, or touch a lifecycle operation.
5.5 The enablement decision derived from the forecast alone. It lives in
    `deletion-journal-cost.ts` beside the forecast rather than in its own file, and it is
    reachable through `pnpm journal:forecast`, whose **exit code 2** is what a deployment
    checklist gates on. It is NOT wired into the sign-up route: the product has no
    public-launch flag to gate, nothing is deployed, and gating sign-up today would invent a
    product decision. Recorded in the plan's Deferral ledger after the round-1 gate found this
    contract line, the infra README and the RUNBOOK all claiming enforcement the app does not
    perform.
5.6 `packages/db/src/testing-s3.ts` — the enforcing fake: conditional create, versioning, Object
    Lock retention, delete markers, encryption/checksum requirements, and per-principal permissions
    are *enforced*, not recorded. A fake that only records makes every test vacuous.
5.7 `infra/s3-deletion-journal/*.json` — bucket policy and the three IAM policy templates, as
    reviewable artefacts with a recorded digest. Applied by the operator, never by the app.
5.8 `scripts/backup.sh` — immutable creation/expiry manifest per backup; refuse `RETENTION_DAYS`
    above 21 (R-119). `scripts/restore-drill.sh` — the fixed 7-step fail-closed restore order with
    journal replay and residue verification before traffic. `scripts/journal-purge.ts` — expired
    version purge through the purge principal only.
5.9 Wiring: `worker/deletion-lifecycle.ts` + `worker/production.ts` compose the real store when
    configured and keep refusing when not; `env.example`; `RUNBOOK.md` manifest-replay/residue gate.

## Reviewers must block for

- A journal append that overwrites a key, omits `If-None-Match: *`, `ObjectLockMode: COMPLIANCE`,
  the day-28 retain-until, `ServerSideEncryption: AES256`, or `ChecksumSHA256`.
- A writer principal that can delete, add a delete marker, copy over, or change retention.
- A restore that serves before replay + residue success, or that accepts a duplicate logical key,
  a delete marker, a gap, a digest conflict, a wrong retention, or an unreadable object.
- A forecast that provisions, charges, or refuses/pauses/abandons an active deletion, append,
  purge, restore, or residue verification at any threshold.
- A forecast that stays silent at USD 0.50, or lets a `> USD 1` / withheld forecast enable new
  accounts or public traffic.
- A backup retention above 21 days, or a capable backup/manifest surviving day 28.
- Any invented price, region, or retention number presented as reviewed fact.
