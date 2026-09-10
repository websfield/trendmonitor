# R-124 deletion journal — provisioning runbook

Reviewed: 2026-09-08. AWS account: `770371751912`.

**Status: bucket and IAM identities provisioned and verified. Workload credential setup, worker deployment, and the restore drill remain pending. This work has not enabled deletion or public launch.**

## Completed

- Created dedicated bucket `respin-deletion-journal-prod-770371751912` in the user-confirmed Sydney region, `ap-southeast-2`.
- Bucket ARN: `arn:aws:s3:::respin-deletion-journal-prod-770371751912`.
- Environment: `prod` (announced default).
- Versioning: **Enabled**.
- Object Lock: **Enabled**, default mode **COMPLIANCE**, default retention **28 days**.
- Default encryption: **AES256 / SSE-S3**. AWS also reported SSE-C blocked.
- All four public-access-block settings: **true**.
- Object ownership: **BucketOwnerEnforced** (ACLs disabled).
- Applied [bucket-policy.json](bucket-policy.json) and verified the policy read back from S3 equals the rendered document.
- Exact rendered bucket-policy SHA-256: `91a820fe27c11209197bc96f1da2e33c3df0d9a26c7c94d87e953e443ff22c08`.
- Created four IAM managed policies and assigned each to exactly one matching identity: three separate workload users and the break-glass role.
- AWS Access Analyzer returned no findings for the four corrected policies, the break-glass permission policy, or its MFA trust policy.
- Completed real S3 bucket probes and 27 custom IAM simulation decisions with the actual bucket policy and no missing simulation context.
- After creating the users and attaching their policies, completed another 27 `SimulatePrincipalPolicy` decisions against their actual effective permissions. Every result matched the expected writer/verifier/purger separation, with no missing context.
- Recorded current Sydney S3 pricing, its AWS effective date, and review date.

## IAM policies and verified identities

| Policy | ARN | Attachments at verification |
|---|---|---|
| writer | `arn:aws:iam::770371751912:policy/respin-journal-writer-prod` | 1 |
| verifier | `arn:aws:iam::770371751912:policy/respin-journal-verifier-prod` | 1 |
| purger | `arn:aws:iam::770371751912:policy/respin-journal-purger-prod` | 1 |
| break-glass | `arn:aws:iam::770371751912:policy/respin-journal-break-glass-prod` | 1 |

Created and read back all three workload users. Each has exactly its matching managed policy, no group memberships, and no inline policies. The three principal ARNs are distinct:

| Principal | Verified ARN | Sole assigned policy |
|---|---|---|
| writer | `arn:aws:iam::770371751912:user/respin-journal-writer-prod` | `arn:aws:iam::770371751912:policy/respin-journal-writer-prod` |
| verifier | `arn:aws:iam::770371751912:user/respin-journal-verifier-prod` | `arn:aws:iam::770371751912:policy/respin-journal-verifier-prod` |
| purger | `arn:aws:iam::770371751912:user/respin-journal-purger-prod` | `arn:aws:iam::770371751912:policy/respin-journal-purger-prod` |

Created role `arn:aws:iam::770371751912:role/respin-journal-break-glass-prod` and verified its trust and sole policy attachment by reading them back from AWS. Its [trust policy](break-glass-trust.json) requires a same-account IAM user with MFA. Its [permission policy](iam-break-glass.json) manages only this bucket's protections. Maximum session duration is 3,600 seconds. An operator also needs permission to assume it; a real operator's MFA/assumption flow remains untested.

Creation and assignment are complete. No access keys or login passwords were created; the workload users have zero keys and no console login profiles. Credential provisioning and secure installation on the intended workloads remain pending.

## Live bucket evidence

The following calls used the authenticated CloudShell caller `arn:aws:iam::770371751912:root`. These demonstrate bucket-policy enforcement; they are not live tests of a deployed writer credential.

| Probe | AWS result | Request ID |
|---|---|---|
| MissingConditionalHeader | AccessDenied / HTTP 403 | `YZCZGWXMFDK66B25` |
| ValidConditionalComplianceUpload | Success / HTTP 200 | `YZCY02G0X1ZAJSR0` |
| DuplicateConditionalCreate | PreconditionFailed / HTTP 412 | `YZCX3194XJ9V2ZD0` |
| TwoDayRetention | AccessDenied / HTTP 403 | `YZCMM03WHDW8PNF3` |
| MissingAES256Header | AccessDenied / HTTP 403 | `YZCJMKEGXZH6WXKW` |
| GovernanceMode | AccessDenied / HTTP 403 | `YZCK03VPKBCSRCE9` |
| MissingObjectLockMode | Success / HTTP 200 | `YZCQPWSJD17JWN6F` |

The missing-mode upload succeeded because S3 applied the bucket's default 28-day COMPLIANCE retention. A subsequent `HeadObject` and `GetObjectRetention` verified protection. The initial expectation of a denial was incorrect; this is documented in the raw evidence.

Both successful objects were verified as AES256-encrypted four-byte test payloads with SHA-256 checksum `n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=`:

- `prod/deletion-journal/r124-probe-3cc4b00a8b034c18b06b0f13d0b8b017` — version `EES95hWh99CFmZFfVxLK4MgT14AvBmDT`, 4 bytes, AES256, COMPLIANCE until `2026-10-07 12:13:37+00:00`.
- `prod/deletion-journal/r124-probe-3cc4b00a8b034c18b06b0f13d0b8b017-no-mode` — version `1VUZzJlyGC0ySNWCxyl4wdf6zcV6.spL`, 4 bytes, AES256, COMPLIANCE until `2026-10-06 12:13:37.347000+00:00`.

The objects were left in place under their enforced locks. The live writer-credential delete probe from the guide remains pending because no workload credential has been configured.

## IAM simulation evidence

Initially, `SimulateCustomPolicy` evaluated each proposed policy together with the applied bucket policy, account resource-owner ARN, caller ARN, and the relevant encryption, Object Lock, conditional-write, retention-day, TLS, and prefix context. After the approved creation and attachments, `SimulatePrincipalPolicy` evaluated the actual IAM user ARNs with the same bucket policy and context. Both sets of 27 decisions produced the results below. These AWS simulations are not live S3 calls using deployed workload credentials.

| Policy | Allowed | Denied |
|---|---|---|
| writer | PutObject, PutObjectRetention | GetObject, GetObjectVersion, GetObjectRetention, DeleteObject, DeleteObjectVersion, ListBucket, ListBucketVersions |
| verifier | GetObject, GetObjectVersion, GetObjectRetention, ListBucket, ListBucketVersions | PutObject, PutObjectRetention, DeleteObject, DeleteObjectVersion |
| purger | GetObject, GetObjectVersion, GetObjectRetention, DeleteObjectVersion, ListBucket, ListBucketVersions | PutObject, PutObjectRetention, DeleteObject |

The purger's simulated delete permission does not bypass live COMPLIANCE retention. Object Lock supplies the time restriction.

## Sydney price evidence

AWS offer version `20260831092225`, published `2026-08-31T09:22:25Z`; relevant terms effective **2026-08-01**, reviewed **2026-09-08**. Currency: USD.

| S3 Standard item | Price |
|---|---|
| Storage, first 50 TB/month tier | $0.025 per GB-month |
| PUT/COPY/POST/LIST | $0.0055 per 1,000 requests |
| GET and other tier-2 requests | $0.00044 per 1,000 requests |

[Price evidence and AWS term/SKU details](price-evidence.ap-southeast-2.json) came from the [official AWS regional price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json). The repository's `price-snapshot.EXAMPLE.json` and forecast code were not supplied, so this has **not** been claimed as a schema-compatible application price snapshot or a successful forecast run.

## Worker and restore status

The user identified AWS Lightsail as the hosting platform. AWS `GetInstances` and `GetContainerServices` returned empty lists in `ap-southeast-2` for this account. No Lightsail host was created or modified.

[worker-environment.env](worker-environment.env) contains the three required values, without credentials. It has **not** been installed on a worker. The purger must use a separate identity and must not share the writer host's credential.

The application repository, application SDK lockfile, backup file, restore script, and isolated restore target were not supplied. Therefore the restore drill, its manual follow-up steps, application SDK-version evidence, deployment configuration, and final launch gate remain incomplete. Do not enable deletion/public launch based only on this infrastructure record.

## Policy corrections and limitations

Read [POLICY-CHANGES.md](POLICY-CHANGES.md) before updating repository templates. The original bucket and writer templates used an invalid condition key and lacked a workable retention-permission path for valid uploads. Corrections preserve the separate writer/verifier/purger purposes, but the necessary writer retention permission can extend an existing COMPLIANCE lock. It cannot shorten that lock or delete the protected version.

AWS's bucket-owner root exception still permits root to replace the bucket policy. A bucket policy alone cannot remove that AWS recovery mechanism. Existing COMPLIANCE locks remain effective until their dates.

## Raw evidence

- [AWS evidence archive](aws-evidence.zip)
- [Bucket configuration](evidence/bucket-configuration.json)
- [Bucket probe responses and verified retention](evidence/bucket-probes.json)
- [All custom IAM simulation results](evidence/policy-simulation.json)
- [Actual-principal IAM simulation results](evidence/principal-policy-simulation.json)
- [Verified IAM users, role, trust, and credential absence](evidence/iam-identities.json)
- [Final policy attachment counts and entities](evidence/managed-policies-final.json)
- [Original-template validation errors](evidence/validation-original.json)
- [Corrected-policy validation](evidence/validation-corrected.json)
- [Break-glass validation](evidence/validation-admin.json)
- [CloudShell execution-tool versions](evidence/execution-environment.json) — these are not the application's lockfile versions.
