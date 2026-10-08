# AWS provisioning — the deletion journal (R-124)

**Audience:** whoever holds the AWS account. **Time:** ~45 minutes, plus one restore drill.
**You do not need a developer for any of this.** Nothing here is applied by the application.

> ## Status: steps 1–4 are DONE (2026-09-08)
>
> The bucket, policy, three principals and price evidence exist in account
> `770371751912`, region `ap-southeast-2`. The record is
> [`respin/infra/s3-deletion-journal/RUNBOOK.md`](../../respin/infra/s3-deletion-journal/RUNBOOK.md),
> which carries the rendered-policy sha256, the ARNs, seven live bucket probes
> with AWS request ids, and 54 IAM simulation decisions.
>
> **Still pending, and deletion stays disabled until they are done:** workload
> credentials issued and installed (the three users currently have zero access
> keys, deliberately), the worker deployed with step 5's env vars, and step 6's
> restore drill. No Lightsail host exists in that region yet.
>
> Two corrections came out of that provisioning and are folded into the
> templates below — see *What live provisioning corrected*.

## What you are building and why

Respin promises a creator that deleting their account is irreversible and provable. "Provable" needs a record of every deletion transition that lives **outside the database being deleted from** and that **nobody — including us — can rewrite**. That is this bucket.

It is deliberately not a backup. It stores opaque ids and state transitions, never a person's content.

**Until this exists, deletion does not run.** The worker composes a *refusing* journal, so a deletion request stops at `journal_pending` and nothing is erased. That is the shipped default and it is intentional: a journal that quietly wrote somewhere local would let an irreversible erasure proceed on a durability promise nothing was keeping.

## Before you start

- An AWS account you control, with permission to create buckets, IAM policies and roles.
- The AWS CLI, signed in: `aws sts get-caller-identity` should print your account.
- Decide two values and keep them consistent everywhere below:

| Placeholder | Meaning | Example |
|---|---|---|
| `<BUCKET>` | A **dedicated** bucket, used for nothing else | `respin-deletion-journal-prod` |
| `<ENVIRONMENT>` | The deployment this journal serves | `prod` |
| `<REGION>` | Same region as the database host | `eu-west-2` |
| `<BREAK_GLASS_ADMIN_ROLE_ARN>` | The **only** role allowed to change this bucket's protections | `arn:aws:iam::111122223333:role/BreakGlass` |

The policy files live in [`respin/infra/s3-deletion-journal/`](../../respin/infra/s3-deletion-journal/). Copy them, replace every `<PLACEHOLDER>`, and apply the copies. Do not commit a rendered file — it carries your real bucket name and role ARN.

---

## Step 1 — Create the bucket

```bash
aws s3api create-bucket \
  --bucket <BUCKET> \
  --region <REGION> \
  --create-bucket-configuration LocationConstraint=<REGION> \
  --object-lock-enabled-for-bucket
```

> **`--object-lock-enabled-for-bucket` cannot be added later.** Object Lock can only be enabled on a bucket that has never held an object. If you forget it, delete the bucket and start again — that is much cheaper than discovering it after the first real deletion.

Enabling Object Lock enables Versioning automatically and **permanently**. Confirm both:

```bash
aws s3api get-object-lock-configuration --bucket <BUCKET>
aws s3api get-bucket-versioning --bucket <BUCKET>   # expect: "Status": "Enabled"
```

Block all public access:

```bash
aws s3api put-public-access-block --bucket <BUCKET> \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## Step 2 — Apply the bucket policy

Render [`bucket-policy.template.json`](../../respin/infra/s3-deletion-journal/bucket-policy.template.json), replacing `<BUCKET>` and `<BREAK_GLASS_ADMIN_ROLE_ARN>`, then:

```bash
aws s3api put-bucket-policy --bucket <BUCKET> --policy file://bucket-policy.json
sha256sum bucket-policy.json    # RECORD THIS — see the evidence list below
```

Six `Deny` statements, all of them load-bearing:

| Sid | Stops |
|---|---|
| `DenyInsecureTransport` | Anything over plain HTTP |
| `DenyNonConditionalCreate` | A write that could overwrite an existing journal entry |
| `DenyUnencryptedUpload` | An object stored without AES256 |
| `DenyWeakOrAbsentObjectLock` | An object stored without a COMPLIANCE lock |
| `DenyRetentionShorterThanDay28` | A lock shorter than the 28-day window we promise |
| `DenyRetentionAndVersioningTampering` | Anyone but break-glass turning the above off |

Two things about this policy that will otherwise surprise you:

- **`CopyObject` will not work on this bucket.** AWS documents this: a policy enforcing conditional writes makes copies fail (403 without the header, 501 with it). Nothing in Respin copies journal objects, so this is an accepted cost — but do not try to reorganise the bucket with `aws s3 cp`.
- **`DenyRetentionShorterThanDay28` is new.** Before it, the 28-day window was enforced *only* by application code, which meant anyone holding the writer credential could store an entry under a one-second lock and let the purge job remove it. The append-only store would have lost its clock. Both this and `DenyNonConditionalCreate` use condition keys verified against AWS's own published examples on 2026-09-08.

## What live provisioning corrected

Three defects in this repo's templates that **only a real AWS account could find**. All are fixed, and the templates here were regenerated from the policies actually applied.

1. **`s3:x-amz-object-lock-mode` is not a condition key AWS defines.** The correct name is `s3:object-lock-mode` — the `x-amz-` prefix belongs to the encryption and ACL keys, not to Object Lock. Access Analyzer rejected it with `INVALID_SERVICE_CONDITION_KEY`. It appeared in **two** templates, which means `DenyWeakOrAbsentObjectLock` had never evaluated as intended and the writer's condition had never matched. An invalid key is inert, not loud: the statement simply never fires.
2. **The writer template could not write.** It granted `s3:PutObject` alone, and AWS refuses Object Lock parameters on an upload unless the caller also holds `s3:PutObjectRetention` — so every journal append would have been denied. It now has a second, **fenced** statement: retention may be set only in COMPLIANCE mode and only for ≥ 28 days. The cost, stated plainly: the writer can **extend** a lock. It cannot shorten one or delete a protected version, because COMPLIANCE forbids that to every principal including account root. So "the writer can never change retention" was too strong; the durable promise is that it cannot shorten protection or destroy a locked version.
3. **The tampering denial was both too wide and too narrow.** Too wide: denying `s3:PutObjectRetention` to everyone but break-glass also denied the authorization every valid upload needs. Too narrow: it omitted `s3:PutBucketObjectLockConfiguration` and `s3:PutEncryptionConfiguration`, so the bucket's *actual* default retention and default encryption were unprotected while the statement's name implied otherwise.

Two behaviours to expect rather than debug:

- **A `PutObject` with no `x-amz-object-lock-mode` header SUCCEEDS**, and that is correct. The bucket's own default (COMPLIANCE, 28 days) supplies the mode, and the live probe confirmed the resulting object's retention with `HeadObject` and `GetObjectRetention`. It is a protected write, not an unlocked one.
- **`CopyObject` will not work on this bucket** (403 without a conditional header, 501 with one) — a documented consequence of enforcing conditional writes. Nothing in Respin copies journal objects.

One limitation neither the policy nor this guide can remove: **AWS's bucket-owner root exception lets account root replace the bucket policy.** Existing COMPLIANCE locks survive that — they run to their dates regardless — but the policy itself is not root-proof. Closing it needs Organizations-level controls. Protect the root credential accordingly.

## Step 3 — Create the three principals

They are separate **on purpose**: the writer cannot delete, the verifier cannot write, and the purger cannot create. Application code mirrors the split as three transport interfaces, so calling the wrong verb is a type error — but that only constrains *our* code. This step is what constrains a leaked key.

```bash
for role in writer verifier purger; do
  aws iam create-policy \
    --policy-name respin-journal-$role \
    --policy-document file://iam-$role.json
done
```

Attach each to its own role or user. **Do not attach two of them to the same identity** — that silently collapses the split this step exists to create.

> The one placement that quietly breaks it: putting the day-28 purge cron on the worker host. The worker holds the *writer* credential; give the purge job its own identity.

## Step 4 — Record the price snapshot

The cost forecast refuses to guess. Copy [`price-snapshot.EXAMPLE.json`](../../respin/infra/s3-deletion-journal/price-snapshot.EXAMPLE.json) to `price-snapshot.<REGION>.json`, open <https://aws.amazon.com/s3/pricing/>, and fill in the S3 Standard prices **for your region** as plain decimal strings. Set `effectiveAt` to the date AWS says the prices took effect and `reviewedAt` to the date you read them.

Until that file exists for your configured region, `pnpm -C respin journal:forecast` **exits 2** and withholds the number rather than inventing one. A snapshot older than 90 days is treated as stale for the same reason. That exit code gates a deployment checklist — it never gates an in-flight deletion, append, purge, restore or residue verification.

## Step 5 — Point the worker at it

Set all three on the worker (a partial set refuses startup by design — "bucket set, region missing" is an operator halfway through provisioning, and a deployment that silently got the refusing journal would look identical to one never configured):

```
RESPIN_DELETION_JOURNAL_BUCKET=<BUCKET>
RESPIN_DELETION_JOURNAL_REGION=<REGION>
RESPIN_DELETION_JOURNAL_ENVIRONMENT=<ENVIRONMENT>
```

Credentials come from the ambient AWS chain (instance role or profile) — never put keys in this config.

## Step 6 — Run the restore drill, then decide

```bash
RESTORE_SERVING_DISABLED=confirmed \
BACKUP_FILE=/mnt/backups/respin/respin-<stamp>.dump.gz.gpg \
BACKUP_PASSPHRASE_FILE=/etc/respin/backup.pass \
MAINTENANCE_URL='postgres://<user>:<password>@<host>:5432/postgres' \
RESPIN_DELETION_JOURNAL_BUCKET=<BUCKET> \
RESPIN_DELETION_JOURNAL_REGION=<REGION> \
RESPIN_DELETION_JOURNAL_ENVIRONMENT=<ENVIRONMENT> \
  bash respin/scripts/restore-drill.sh
```

Every input is an environment variable — the script takes no positional argument and refuses one. `RESTORE_SERVING_DISABLED` must be exactly `confirmed` (stop the app and every worker pointed at the target first). The three journal names are the ones from Step 5; the drill's verifier reads them from **its own** shell, and its credentials come from the same ambient chain. Host tools: `pg_restore`, `psql`, `gpg`, `gunzip`, `sha256sum`, `node`, `pnpm`. Never pass `--allow-empty-money` here: it is refused unless the journal is the loopback MinIO, and a transcript carrying its marker closes nothing (decisions.md R-155). The command above is pinned against the script's own required inputs by `respin/tests/shell-scripts.test.ts`.

It refuses on: a missing, expired or null-tombstone manifest; a checksum mismatch; an empty `config_versions` or money table; a negative ledger; a dump newer than the checkout; a failed `db:migrate` (a dump older than the checkout is **migrated in place** — restore → migrate → verify); and any journal conflict, or a verifier that exits without its success marker. On success it prints in terms that **this is not permission to serve**. Read the three manual steps it names. Keep the transcript.

**Deletion and public launch stay disabled until this transcript exists.**

---

## Verify it actually works

Everything above is configuration you have applied. These are the checks that it does what it claims — worth more than the steps themselves.

```bash
# 1. A write with no conditional header must be DENIED.
echo test > /tmp/probe.txt
aws s3api put-object --bucket <BUCKET> --key <ENVIRONMENT>/deletion-journal/probe \
  --body /tmp/probe.txt --server-side-encryption AES256 \
  --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$(date -u -d '+29 days' +%Y-%m-%dT%H:%M:%SZ)"
# EXPECT: AccessDenied.  If this SUCCEEDS, DenyNonConditionalCreate is not working.

# 2. The same write WITH the conditional header must succeed.
aws s3api put-object --bucket <BUCKET> --key <ENVIRONMENT>/deletion-journal/probe \
  --body /tmp/probe.txt --if-none-match "*" --server-side-encryption AES256 \
  --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$(date -u -d '+29 days' +%Y-%m-%dT%H:%M:%SZ)" \
  --checksum-algorithm SHA256

# 3. A SHORT lock must be denied.
aws s3api put-object --bucket <BUCKET> --key <ENVIRONMENT>/deletion-journal/probe2 \
  --body /tmp/probe.txt --if-none-match "*" --server-side-encryption AES256 \
  --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ)"
# EXPECT: AccessDenied.  This is DenyRetentionShorterThanDay28.

# 4. The writer must NOT be able to delete what it just wrote.
aws s3api delete-object --bucket <BUCKET> --key <ENVIRONMENT>/deletion-journal/probe \
  --version-id <the version id from step 2> --profile <writer-profile>
# EXPECT: AccessDenied.
```

> **Object Lock requires a checksum on upload.** AWS rejects a `PutObject` carrying a retention period unless it also carries `Content-MD5` or `x-amz-sdk-checksum-algorithm`. That is why step 2 passes `--checksum-algorithm SHA256`, and it is a real failure mode if you script your own probe without it.

Then simulate the policies rather than trusting them:

```bash
aws iam simulate-custom-policy \
  --policy-input-list file://iam-writer.json \
  --action-names s3:DeleteObject s3:PutObject \
  --resource-arns "arn:aws:s3:::<BUCKET>/<ENVIRONMENT>/deletion-journal/x"
# EXPECT: s3:PutObject allowed (with the conditions), s3:DeleteObject denied.
```

**This simulation is the one thing the repository genuinely cannot do for you.** `respin/tests/s3-journal-policy.test.ts` parses the four templates, pins their statement inventory, and asserts the writer/verifier/purger verb split — but no test can prove how AWS *evaluates* a policy against a real account. That is what step 4 and the simulation above are for, and it is the reason this file exists rather than a script.

## Evidence to record in `RUNBOOK.md`

R-124 asks for these, and none of them is a credential:

- Bucket ARN and region
- sha256 of the **rendered** bucket policy
- Versioning status · Object Lock status and default mode · default encryption
- The three principal ARNs — **confirm they are three different identities**
- AWS SDK version from the lockfile
- The restore-drill transcript
- The current-region price snapshot, with its `reviewedAt` date
- The output of the four probes and the policy simulation above

## What this does not give you

Stated plainly so nobody infers otherwise:

- It is **not** a database backup. See `respin/scripts/backup.sh`.
- It does **not** make Stripe, the model provider or the mail provider erase their copies. Those are listed on the account page as surviving erasure, because they do.
- The contract tests prove the *adapter's* behaviour against an enforcing in-memory S3. They are not evidence that your bucket is configured correctly, and they never will be. Step 6 is.

---

*Related: [`respin/infra/s3-deletion-journal/README.md`](../../respin/infra/s3-deletion-journal/README.md) (the same provisioning order, from the developer's side) · `docs/initial/decisions.md` R-124.*
