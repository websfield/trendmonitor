# Security review — Phase 10b-1 independent review, round 2 of 2 (2026-09-09)

*Report returned by `security-reviewer`; saved verbatim by the review lane.*

**Readiness: Almost · Grade: B · Both round-1 blockers are closed and verified by reading and by running the guards; what remains is one availability weakness in the auth-mail quota (mitigated, not closed) and two small guard gaps. 0 critical, 0 high, 1 medium, 2 low, 3 info.**

**Movement: Not yet (D) → Almost (B).**

**Scope**: uncommitted working tree vs `d5fbaf7`, `respin/` only (64 modified files, +3,053/−488, plus 31 untracked). Read in full: `scripts/backup.sh`, `scripts/restore-drill.sh`, `tests/shell-credentials.test.ts`, `app/api/deletion/recover/route.ts`, `app/(auth)/recover-deletion/page.tsx`, `app/(product)/settings/account/{actions.ts,page.tsx,refusal-code.ts}`, `app/(product)/safe-log.ts`, `packages/credits/src/stripe/billing-contact.ts`, `packages/db/src/{deletion-request-enablement.ts,auth-lifecycle.ts}`, all six `infra/s3-deletion-journal/*.template.json`, `tests/s3-journal-policy.test.ts`, migrations 0055–0057. Read as diff: `deletion-lifecycle.ts`, `deletion-executor.ts`, `auth-mail.ts`, both `app-server.ts`, `customers.ts`, `deletion-commands.ts`, `account-view.tsx`, `worker/*`, `env.example`, `eslint.config.mjs`, `journal-forecast.ts`. Targeted: the lifecycle's cancel/request/authority paths, the receiver's purge and dynamic-SQL sites, `create-auth.ts` rate limits and mail hooks.

Ran: `vitest run` on `shell-credentials`, `s3-journal-policy`, `billing-contact`, `deletion-request-enablement`, `deletion-recover-route`, `account-copy` — 6 files / 52 tests / 0 failed.

## The two least-confident lines, probed first

**Tombstone store / restore-before-traffic ordering — HELD (unchanged).** `restore-drill.sh` still fail-closes at the manifest-null check, checksum, migration-ledger cardinality, external journal verification, and ends with "THIS IS NOT PERMISSION TO SERVE". The PGPASSWORD fix did not disturb any of those points.

**Billing-contact rule keyed by user, NULL treated as unknown — HELD.** `assertBillingContactReleased` (`deletion-lifecycle.ts:849-878`) matches the binding by user regardless of membership and matches NULL by the workspaces the person is a member of; runs on all six identity request/resume sites and again inside the erasure transaction (`deletion-executor.ts:557-573`) by user only. The executor's claim that an unknown contact cannot arise during grace is sound: `customers.ts:68-125` is the sole `subscriptions` inserter and always sets the contact; `ON DELETE SET NULL` fires only on the `users` deletion this rule refuses; the `workspace_link` pseudonymisation nulls it only for a workspace being erased. The only binding writers bind `scope.userId`, so nobody can pin a victim as contact to deny their deletion.

## Round-1 findings — movement

| Round-1 finding | Status | Evidence |
|---|---|---|
| `restore-drill.sh` credentialed URI on argv (BLOCK) | **Closed** | All six invocations take `$*_SAFE`; `export PGPASSWORD="$DB_PASSWORD"` at :132 precedes the first use; `backup.sh:116` and `:168` likewise; `shell-credentials.test.ts:57-71` matches an `export PGPASSWORD=` on a non-comment line. |
| Unauthenticated month-long auth-mail exhaustion (HIGH) | **Mitigated, not closed** → MEDIUM below | Recovery reserve (`auth-mail.ts:122, :306-314`) and per-user/purpose/day bucket (:110, :317-324). The erasure right is protected. |
| Request body bound on the public recover route (HIGH) | **Closed** | `route.ts:56-96` counts bytes as they arrive; abandons rather than cancels; `deletion-recover-route.test.ts:143` drives a chunked body. |
| S3 templates asserted by nothing | **Closed for template content** | Regenerated from deployed policies; `s3-journal-policy.test.ts:130-175` allowlists every condition key with a non-vacuity floor. The live writer-credential probe remains evidence. |
| Unbounded reflection into `Location` | **Closed** | `route.ts:134-135` bounds `op` and `s`; relative `Location`, `no-referrer`/`no-store`. |
| `?ok=` content spoofing on `/recover-deletion` | **Closed** | `page.tsx:18-19` admits only `\d{1,4}`. |

## Vulnerabilities

- **[MEDIUM] `respin/packages/db/src/auth-mail.ts:80-85, :110, :306-324` with `respin/packages/auth/src/create-auth.ts:388-393, :446-471`** — global auth-mail exhaustion is still reachable by an unauthenticated attacker at low cost. Every signup sends one `email_verification` mail under a fresh `authUserId`, so the per-user bucket of 5 is per-account and accounts are free (`/sign-up/email` allows 10/hour per IP). Effective non-recovery ceiling 70/day and 2,100/month: seven throwaway accounts or 70 bare signups from one IP exhaust the day; ~210 IP-hours exhaust the month. · Impact: `password_reset` and `email_verification` refuse product-wide for the rest of the UTC day, and month once crossed; `resolveAuthMailCeilings` can only tighten, so the operator's only remedy is a DB edit. · Fix: give `password_reset` its own floor the way `identity_deletion_recovery` has one, and add a recorded-decision ceiling raise for operators (the `--owner-ceiling-cents` pattern) so a month-long outage has a sanctioned exit. Confidence: high on the mechanics.
- **[LOW] `respin/scripts/backup.sh:110-113`, `respin/scripts/restore-drill.sh:114-117, :128-131`** — the "password-less" URI strips only the userinfo password; libpq also accepts `?password=` / `sslpassword=` as query parameters, which `new URL(...).password = ""` leaves intact, so the secret would ride argv and `$DB_PASSWORD` would be empty; the test checks variable names, not values. · Fix: delete `password`/`sslpassword` from the query in the same `node -e` and lift the value, or refuse such a URI.
- **[LOW] `respin/tests/shell-credentials.test.ts:35-39`** — the argv scanner is line-based; a backslash-continued `--dbname="$TARGET_URL"` on the next line passes it. · Fix: join continued lines before scanning.
- **[INFO] `respin/infra/s3-deletion-journal/{bucket-policy.json,iam-*.json,break-glass-trust.json,evidence/,aws-evidence.zip}`** — untracked and not ignored; they carry the AWS account id, bucket name, IAM ids and ARNs, no credential (`AccessKeyCount: 0`; grepped for key shapes: none). Not a leak, an inconsistency with `s3-journal-policy.test.ts:237-262`, which refuses any 12-digit id in a template. Decide once: commit the rendered evidence and soften that rationale, or ignore the rendered files. `worker-environment.env` is ignored by the root `*.env` rule.
- **[INFO] `respin/packages/credits/src/stripe/billing-contact.ts:97-167`** — the Stripe call runs inside an open transaction holding the workspace money lock for the provider's full timeout-and-retry budget; a robustness note, not an exploit. The key embeds internal user ids and a 16-hex email digest; pseudonymous.
- **[INFO] `respin/scripts/restore-drill.sh:132`** — `PGPASSWORD` is exported, so child processes inherit it; same uid, acceptable, worth a comment so nobody "fixes" it into argv.

## New surface — what was attacked and why it fails

`acceptBillingContactAction`: identity from `requireUser()`, scope from the session, password re-proof (per-account and per-client limited, DB-stamped), email from `user.email` not the form; in the package `assertScoped`, role checked on the scope and again from the in-transaction membership re-read, the exact session bound to the scope user within ten minutes, the row selected by `scope.workspaceId` only; no client-supplied workspace id exists; replay refused by the per-call nonce and returned-object verification; Stripe errors reduced to `provider:<code>` before logging. `cancelScopedDeletionAction` with a client-supplied `operationId`: re-selected with `requesterUserId = proof.userId` after locking, active owner required. `pendingDeletionsForScope`: cage first, then the scope's workspace or user only. `RESPIN_DELETION_REQUEST_SCOPES`: asserted before the journal on all three facades; the core writers are not on the sanctioned import surface; `resume*` not exposed; the worker creates no requests; an unknown token fails closed; cancellation not gated. `?e=`/`?ok=`: closed list, `Object.hasOwn`. Dynamic SQL in the receiver: `ident()` over registry names only, ids bound. Executor: re-assert and purge inside the erasure transaction, purge before executors. Worker health: `retentionPoisoned` in the closed allowlist. Logs: user id and failure code only.

## Project security rules (CLAUDE.md)

- ✅ Golden rule 2 — no credential in the diff or the untracked infra files; the password out of argv; residue: the URI-query edge (LOW).
- ✅ Respin rule 5 — every new read/write is session-scoped.
- ✅ Respin rule 7 — `CREDENTIALED_VARS`, `VALID_S3_CONDITION_KEYS`, `ACCOUNT_ERROR_CODES`, `DELETION_SCOPES`, `CUSTOMER_PERSONAL_FIELDS_CLEARED` are explicit lists; the line-based scanner gap (LOW) is a producer-shaped hole.
- ✅ Respin rule 2 — the handover key does one job and is verified on the returned object.
- ⚠️ Non-negotiable 6 — engineering and evidence kept separate; the S3 writer-credential probe, restore drill, live mail and deploy remain unrun.

## Coverage

- Read fully: the files under Scope. Skimmed: `deletion-lifecycle.ts` (diff plus the three authority paths), `retention-receiver.ts` (purge, claim/apply, `ident`), `deletion-executor.ts` (diff), `auth-mail.ts`, `create-auth.ts`, `account-view.tsx` (diff), migrations 0055–0057, `RUNBOOK.md` (links). Not read: `finance-extract.ts`, `creator-data-registry.ts`, `retention-clocks.ts`, `activation.ts`, `lifecycle-column-census.ts`, `external-copies.ts`, `trends-schema.ts`, `billing-schema.ts` beyond the migration, `restore-verify.ts` (unchanged), the remaining tests, `docs/operator/aws.md`, `POLICY-CHANGES.md`.

## Verdict

**NEEDS CHANGES**

Both round-1 blockers are genuinely closed and their guards run red on the planted mutations the ledger describes; the new owner-only handover, the request flag and the account-page codes are scoped, proven and closed-list. The one thing to tighten before shipping is the auth-mail quota: the erasure right is now protected, but password reset is still deniable product-wide for a month by ~70 free signups a day, with no operator control that can lift it.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
