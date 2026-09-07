# Deletion journal — S3 provisioning artefacts (R-124)

Everything in this directory is **applied by an operator**. Nothing here is read
or executed by the application, and nothing here creates an AWS resource or
incurs a charge on its own.

## What the application already does without any of this

The worker composes a **refusing** journal when `RESPIN_DELETION_JOURNAL_*` is
unset: every append returns a conflict, so no deletion operation can advance
past the state its request left it in. That is the shipped default, and it is
deliberate — a journal that quietly wrote somewhere local would let an
irreversible erasure proceed on a durability promise nothing was keeping.

## Provisioning order (each step blocks the next)

1. Create a **dedicated** S3 Standard general-purpose bucket in the target
   Lightsail region, outside the database host and outside the database-backup
   replacement prefix/account workflow.
2. Enable **Versioning** and **Object Lock** *before the first object*. Object
   Lock cannot be enabled on a bucket that already has objects, and the writer
   refuses a bucket that returns no version id — so getting this wrong fails
   closed rather than silently storing overwritable objects.
3. Render `bucket-policy.template.json` (replace every `<PLACEHOLDER>`) and
   apply it with `aws s3api put-bucket-policy`. Record the **sha256 of the
   rendered policy** in `RUNBOOK.md`.
4. Create three principals from `iam-writer`, `iam-verifier` and `iam-purger`.
   They are separate on purpose: the writer cannot delete, the verifier cannot
   write, and the purger cannot create. The code mirrors this split as three
   transport interfaces, so calling the wrong verb is a type error.
5. Record `price-snapshot.<region>.json` from the current AWS S3 price list.
   Until this exists for the configured region the cost forecast is **withheld**
   and `pnpm -C respin journal:forecast` **exits 2**. That exit code is a
   *deployment-checklist* gate: nothing in the running application consults it
   (there is no public-launch flag in the product yet — see the plan's Deferral
   ledger). It never gates an in-flight deletion, append, purge, restore or
   residue verification.
6. Set `RESPIN_DELETION_JOURNAL_BUCKET`, `_REGION` and `_ENVIRONMENT` on the
   worker. All three or none: a partial set refuses startup.
7. Run the **production restore walk** (`scripts/restore-drill.sh`) and record
   its transcript. Deletion and public launch stay disabled until this exists.

## Evidence R-124 requires, recorded without credentials

Bucket ARN · AWS region · rendered policy sha256 · Versioning status · Object
Lock status and default mode · default encryption · AWS SDK version from the
lockfile · restore probe transcript · current-region price snapshot.

## What is NOT proven by anything in this repository

The bucket, its policies and the three principals exist only once an operator
creates them. The contract tests in `packages/db/tests/deletion-journal.test.ts`
prove the adapter's behaviour against an enforcing in-memory S3; they are not
evidence that a real bucket is configured correctly, and they never will be.
That is what step 7 is for.
