# Corrections made to the supplied R-124 templates

The supplied files were rendered for `respin-deletion-journal-prod-770371751912`, `ap-southeast-2`, environment `prod`. The original attachments were left unchanged.

1. Removed the top-level `_comment` field from documents submitted to AWS.
2. Replaced `s3:x-amz-object-lock-mode` with `s3:object-lock-mode` in the bucket and writer policies. AWS Access Analyzer reported `INVALID_SERVICE_CONDITION_KEY` for the supplied key in both policies. The corrected policies passed without findings.
3. Added a separate writer permission for `s3:PutObjectRetention`, scoped to `prod/deletion-journal/*`, COMPLIANCE mode, and at least 28 remaining retention days. AWS requires this permission when an upload supplies Object Lock retention settings. See [required S3 permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html).
4. Removed the blanket non-break-glass denial of `s3:PutObjectRetention`; it would also deny the retention authorization required by the writer's valid uploads. The bucket still denies retention shorter than 28 days and non-COMPLIANCE retention, including through the separate retention API.
5. Added `s3:PutBucketObjectLockConfiguration` and `s3:PutEncryptionConfiguration` to the bucket-protection tampering denial. These protect the actual default-retention and encryption settings, which the supplied tampering statement omitted.
6. Preserved the verifier and purger permissions and journal-prefix restrictions. The bucket policy still has the original six statement IDs.

## Operational consequences

- The writer has no read, list, or delete permission. Its required retention permission can extend a COMPLIANCE lock. S3 prevents shortening an existing COMPLIANCE lock or deleting its protected version. Therefore the supplied claim that the writer can never change retention is too strong; the durable promise is that it cannot shorten the protection or delete/rewrite the locked version.
- A live upload without explicit Object Lock headers inherited the bucket's 28-day COMPLIANCE default. The probe initially expected a denial, then verified the resulting object's actual retention. This fallback is protected; it is not evidence of an unlocked write.
- The bucket-owner root principal can still manage the bucket policy despite a bucket-policy denial. This is an explicit [S3 recovery exception](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketPolicy.html). Existing COMPLIANCE-locked versions remain protected until their retention dates. Blocking root policy changes would require additional Organizations/VPC controls outside this task.
- The created break-glass role is restricted to this bucket's protection settings. Its trust policy requires an IAM user in this account and MFA. The operator must also have permission to assume the role. A root console session cannot prove that operator flow.
- The two successful four-byte probe objects must remain until their retention dates. They were placed as top-level probe keys under the journal prefix, matching the guide's probe pattern; they were not inserted into a deletion operation's chain.

## Applied bucket policy hash

SHA-256 of the exact rendered file:

`91a820fe27c11209197bc96f1da2e33c3df0d9a26c7c94d87e953e443ff22c08`
