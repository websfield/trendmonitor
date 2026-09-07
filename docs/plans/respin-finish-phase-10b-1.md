# Slice 10b-1 — Executable lifecycle, scoped deletion, and recoverable restores

**Codebase review:** [`../progress/respin-finish/10-codebase-review.md`](../progress/respin-finish/10-codebase-review.md)

**Decision authority:** R-25/R-26/R-56, owner-approved R-117–R-121, and reversible build-plan defaults R-122/R-124 in [`../initial/decisions.md`](../initial/decisions.md)

**Depends on:** the inspected current schema/writer inventory recorded in the Phase 10 codebase review. This is the first Phase 10 implementation slice. No Sample Spin limiter, seats, invites, revenue, adjustment audit, API key, API idempotency, or API abuse table may land before this slice's same-change registration gate is executable.

## A creator can…

**Delete their identity without destroying shared workspace work, while an owner can separately schedule/cancel profile or workspace deletion and see exactly what is disabled now, erased after seven days, retained for a stated legal/financial reason, and absent from every capable backup by day 28.**

## An operator can…

**Run the retention receiver, inspect deletion progress without content, restore a backup in isolation, replay external tombstones before traffic, and prove with an independently generated residue scan that erased data did not return.**

## Least confident

The independent tombstone store and restore-before-traffic ordering are not present in current code. Prototype and red-drive that ordering first; no public deletion promise changes until the restore drill passes.

## Scope and non-goals

This slice owns REQ-A04 deletion, T-12's in-life append-only restatement, the executable creator-data registry, deletion state machines, backup/tombstone policy, and the existing Stripe/rate-limit/session/generation-attempt retention receivers. It establishes the mandatory registration contract for 10a/10b-2/10c.

It does **not** create seats/invites, revenue, credit-adjustment audit, curation history, API keys, API idempotency, or API abuse tables. It does not claim legal compliance beyond the implemented, walked behavior and an explicit legal-review residual.

## Ownership

One `respin-engineer` owns registry, deletion, receiver, backup/restore, UI, and integration changes in ordered stages; no second write agent overlaps lifecycle files. Full `respin-tenancy-reviewer` and `respin-billing-reviewer` gates are mandatory; compliance reviews shared/private survival and content-safe external boundaries; learning reviews result/proposal erasure and retained-claim honesty. Final code review runs only on the stable manifest.

## Pinned contracts

### C1 — one compile-closed lifecycle registry

Replace the descriptive table list with a typed registry generated/checked against every application-owned migration table. Each row states:

```ts
type DataScope = "identity" | "profile" | "workspace" | "system";
type LifecycleAction =
  | "cascade"
  | "delete_explicit"
  | "pseudonymise"
  | "retain_financial"
  | "external_delete"
  | "not_applicable";

type DataRowClass = /* closed table-specific row-class union */;
type LifecycleFieldSet = /* exhaustive disjoint named column/JSON-path set */;

type LifecycleClassEntry = {
  table: AppTable;
  rowClass: DataRowClass;
  fieldSet: LifecycleFieldSet;
  scope: DataScope;
  writerOwner: string;
  export: "included" | "excluded_secret" | "excluded_system";
  exportProjector: "identity_self" | "profile_creator" | "workspace_owner" | "none";
  action: LifecycleAction;
  retention: RetentionRule;
  executor: ExecutorId;
  residueProbe: ProbeId;
};
```

The registry key is `(table, rowClass, fieldSet)`, not table alone. Entries for one row class form an exhaustive, disjoint column/JSON-path partition. This lets `stripe_events.payload` redact at 90 days while content-free event metadata survives, or an invite digest erase while outcome metadata follows a different clock. A table with private and shared rows (including frameworks, trend sources/items, transcripts, autopsies, and caches) has separate closed row classes with separate scope behavior. A table-level or whole-row default may exist only when metadata/source assertions prove one row class and one lifecycle field set. Schema enumeration comes from migrations/database metadata, not a handwritten subset. Static source assertions enumerate every row-class discriminator and JSON identifier path used by writers. pg-boss, Better Auth, config, shared caches/frameworks, system spend, and financial retention are explicitly classified; none disappear by being called “supporting.” Build fails if a table, discovered row class, column, or governed JSON path is absent; if field sets overlap; if a key is duplicated; or if its writer, executor, or independent probe is absent. Export and deletion derive from the same registry but remain different operations.

Export is scope-typed: identity-self, profile-creator, and workspace-owner projectors are separate server authorities with field allowlists; `included` never means “available through every export.” Cross-member personal fields are excluded unless the current owner is authorised for that active workspace record, and secrets/system operational metadata always use `none`.

The independent residue verifier derives expected probes from schema foreign keys, scoped columns, JSON identifier paths, and registry entries; it does not call the executor or reuse the executor's target list. An executor/probe disagreement fails closed.

### C2 — three separate deletion authorities

All destructive requests require a recent reauthentication and a stable idempotency key. Profile/workspace operations additionally require the current owner and typed-name confirmation. Server state, never the form, chooses ids and role. One `lockIdentityMembershipGraph(userId)` primitive plus `lockWorkspaceMembershipGraph(workspaceId)` define the sole global serialisation protocol. Identity deletion first locks and marks the identity deletion state, then obtains affected workspace locks in sorted workspace-id order and re-reads owner counts, membership versions, deletion state, and seat state in the same transaction. Every membership-creation path—including invite acceptance, first-workspace bootstrap, and later workspace creation—locks/checks the identity first, refuses a tombstoned/deleting identity, and then takes workspace locks in the same order. Role change, member remove/leave, ownership transfer, and workspace/identity deletion checks use these authorities; no caller may pre-check and mutate outside the protocol.

| Operation | Immediate state | Seven-day grace | Irreversible execution |
|---|---|---|---|
| Identity | disable ordinary login; revoke all global sessions; move memberships to a non-authorising `deletion_suspended` state with exact role + membership version retained; independently revoke issued/received invites; block new writes | a single-use, 7-day, separately hashed recovery credential may mint only `cancel_identity_deletion` after fresh credential/MFA verification; under sorted membership locks, restore only unchanged suspended memberships whose workspaces still exist and whose role/seat constraints still pass; later independent role/removal changes win and are listed rather than overwritten; revoked invites/sessions never return and normal login must create a fresh session | erase/pseudonymise identity-scoped rows; shared workspace/profile content remains under remaining owners |
| Profile | owner-only tombstone; block reads/writes/generation; cancel/park scoped jobs and API attempts | same reauthenticated owner may cancel if the external journal is still reversible; access is restored, but cancelled/failed jobs never silently restart and require a new explicit action | delete profile tree by registry; retained financial facts become pseudonymous |
| Workspace | owner-only tombstone; block memberships/access/writes; revoke workspace API keys/invites permanently; park jobs; disable auto-top-up and set Stripe cancellation at period end under one command id | same reauthenticated owner may cancel only while erasure has not begun; clear a still-pending period-end cancellation before reopening; revoked keys/invites and cancelled jobs never reactivate and must be recreated explicitly; if Stripe already ended service, reopen as Free and require explicit checkout rather than reconstructing a subscription | immediately cancel any still-live subscription with `prorate=false`, `invoice_now=false`, and no implicit refund/credit; delete workspace/profile trees; retain only registry-approved pseudonymous financial/system facts |

This slice establishes one closed Resend auth-delivery authority reused by 10b-2/10c. Its purpose union is `email_verification | password_reset | identity_deletion_recovery | local_factor_enrollment | workspace_invite`; no caller sends directly. One DB-atomic admission/outbox authority enforces the compiled product total 80/day and 2,400/month. Workspace invites have their own 60/day and 1,800/month ceiling, leaving at least 20/day and 600/month for account/security mail; security mail may use otherwise unused invite capacity but invites cannot consume the reserve. Every purpose stores only a prefix/digest of a high-entropy single-use secret, one active challenge per identity/purpose, and exact expiry: email verification 24 hours; password reset and local-factor enrollment 15 minutes; identity-deletion recovery and workspace invite 7 days. Resend rotates the secret/digest on the same logical request without extending its original expiry; plaintext is passed once to Resend, never reconstructed. Use/rotation/expiry/identity deletion erases the digest; traffic-independent receiver/probe and content-free 90-day delivery outcome apply. Mail contains only purpose, safe action URL and expiry—no workspace/creator content. Quota admission is fail-closed and no dropped send is reported delivered.

For identity deletion, create the recovery digest and durable delivery outbox before the first journal tombstone. The request cannot acknowledge the recoverable tombstone, disable login, or revoke sessions until Resend delivery is confirmed; a failed/unknown delivery leaves deletion unacknowledged and retriable under the same request/expiry. After delivery, tombstone/session revocation linearise. Cancellation later requires the exact single-use recovery secret plus fresh password/MFA proof and can mint only the named request's cancel transition. The acceptance walk begins with request, proves delivery, loses every session, then uses that credential and fresh factor to cancel; link possession alone refuses.

Identity deletion refuses if the person is the last owner of any workspace; the remedy is transfer ownership or delete each workspace. Workspace deletion never revokes user-global sessions because sessions have no workspace key. Global revocation belongs only to identity deletion. Shared analyses/frameworks remain only when an independently verified non-personal licence basis survives the related deletion; consent-only shared payload becomes non-authorising and enters 10b-2's seven-day rights-loss erasure. Private rows do not remain.

State is durable and versioned: internal `requested → journal_pending → tombstoned → external_actions_pending → grace → erasing → verifying → complete | blocked`, with `cancelled` terminal only before `erasing`. A request is not acknowledged as tombstoned and no success response is returned until a conditional-create external journal record for that request is durable. Every later state transition, including authoritative cancellation, conditionally creates a new immutable signed object at `{requestId}/{zeroPaddedVersion}` before the database transition is acknowledged; existing version objects are never overwritten. Latest state is derived only from the highest contiguous verified version, and any gap/conflict blocks. Object-store versioning/object lock prevents deletion or replacement through the covering day-28 horizon; a mutable “latest” pointer may be a cache but never authority. Duplicate requests return the same operation; conflicting scope/target/payload hashes refuse. Retries resume the last durable transition. A lease/heartbeat prevents two executors, and a stale lease is recoverable without replaying completed external commands.

Before/during grace, external commands are limited to reversible access fences, job parking, auto-top-up disable, workspace period-end subscription cancellation, and permanent credential/invite revocation whose non-restoration is disclosed. LLM/provider content deletion, Stripe customer redaction, capable-copy destruction, and every other irreversible external delete may dispatch only after the journal durably enters `erasing`. Cancellation appends `cancelled` first, reverses only the listed reversible controls, and never races an irreversible delete. Unknown pre-grace command outcomes block cancellation/erasure until reconciled.

Subscription cancellation, auto-top-up disable, job cancellation, and external deletes use an outbox/command identity stored before dispatch. Unknown outcomes block progression and reconcile; they are never guessed successful. Immediate workspace erasure uses Stripe `prorate=false`/`invoice_now=false`; paid subscription revenue continues on its original service-period schedule unless a separately authorised, original-linked Stripe refund or credit note arrives, which 10b-2 projects as a reversal. The UI states that deletion itself creates no automatic refund; legal/finance review remains a launch gate. Duplicate/timeout/out-of-order cancellation and later reversal events are exercised explicitly. The eraser runs only in pg-boss/worker context, never inside the HTTP request.

### C3 — live erasure and retained data

Live governed content is erased by day 7. `brain_docs` immutability is an in-life property; authorised deletion is the T-12 exception. Financial/audit rows retain only the minimum approved pseudonymous workspace key, immutable provider/business ids, amounts, currency, dates, states and reason codes; no email, name, address, prompt, completion, brain/reference text, raw webhook payload, IP, or free-form admin note survives. `workspace_spend_monthly` uses the existing pseudonymisation authority.

Stripe customer identity is workspace-scoped but may contain the creating owner's personal data. A workspace with a live Stripe customer has one explicit verified `billing_contact_user_id` who is an active owner; identity deletion refuses until another active owner accepts that contact when the target is current contact. The external-copy registry defines an exhaustive Stripe customer personal-field class—email, name, phone, address, shipping, tax/contact fields, description and metadata values attributable to a person. The identity-erasure outbox replaces/clears every field attributable to the deleting contact, writes only the accepted replacement contact fields where required, preserves workspace customer/subscription/economic objects, journals/reconciles the command, and proves the old email/name/phone/address/metadata values absent. The Stripe adapter and independent probe enumerate both DB-mapped customers and metadata-linked/orphan customers created by an insert race; a populated lost-mapping fixture must reconcile, and any unknown orphan result blocks deletion completion.

The fixture population must include: structured interview and own/reference inputs; submitted URL/transcript; private, consent-only shared, and independently licensed shared analysis/cache row classes; brain versions/activations; generation attempt/generation/feedback/result/proposal; model usage/ledger/spend rollup; a private creator-pasted autopsy plus its system-spend claim/usage/correction links; pending/running/dead worker job; an auth session with token/user id/IP/user agent, an expired session, a Better Auth verification row, a Better Auth limiter row; and a Stripe event with null/deleted workspace. System-spend lifecycle partitions cost/outcome facts from linkable `jobId/trendItemId/autopsyCacheClaimId`: when the private source/profile/workspace erases or the attempt becomes terminal, those link fields null or irreversibly pseudonymise while cost/outcome/price/version facts follow their financial clock. Sample Spin does not exist yet; 10a must add a populated HMAC-bucket fixture to this executable population in the same change that creates the table. Tests prove private scope and linkable system identifiers disappear, retained cost facts cannot re-link, consent-only shared residue erases after related deletion, independently licensed non-personal shared cache survives, expired/revoked session token/user-agent/IP rows and expired/matching verification rows disappear on schedule, jobs cannot recreate deleted rows, global sessions survive workspace deletion, and only identity deletion revokes the target user's sessions.

### C4 — backup and tombstone guarantee

Backup creation records immutable creation/expiry metadata and refuses any configured retention above 21 days. Before acknowledging the immediate tombstone, write the first encrypted append-only request-version object through `DeletionJournalStore` to the independently configured backup object store, outside the restorable database and under a prefix excluded from database-backup replacement. Every immutable version contains deletion request id, opaque target ids/scope, requested/effective time, state (`active_tombstone | cancelled | erasing | complete`), monotonic version, prior-version digest, integrity fields, and no creator content. Conditional create of each new version plus contiguous digest verification prevents split authority. Successful durable version 1 is a precondition to `tombstoned`; every cancellation/irreversible transition must durably append the next version before acknowledgement. Local-only production storage, mutable in-place CAS as history, and a manifest inside the database are invalid implementations.

R-124 pins the production adapter without coupling the domain port: a dedicated Amazon S3 Standard general-purpose bucket in the target Lightsail AWS region, outside database backup replacement, using the S3 REST API `PutObject` through lockfile-pinned AWS SDK v3. Versioning and Object Lock are enabled before first use. Each `{environment}/deletion-journal/{requestId}/{zeroPaddedVersion}.json` create carries SigV4/TLS, `If-None-Match: *`, `ObjectLockMode: COMPLIANCE`, the request's fixed day-28 retain-until timestamp, `ServerSideEncryption: AES256`, and `ChecksumSHA256`. Bucket policy enforces conditional create/encryption and blocks public/non-TLS access. The create-only writer cannot delete, copy-over, change retention, suspend versioning, or bypass; a separate restore/verifier principal is read-only; a separate purge principal deletes exact versions only after retention expires. Restore enumerates every object version and rejects duplicate logical keys, delete markers, gaps, digest/checksum conflicts, wrong retention, or unreadable objects. This is the reversible build default; local S3-compatible tests may prove the port, but production deletion remains disabled until the exact AWS region/bucket/IAM/policy digest and a real restore are evidenced.

Restore order is fixed and fail-closed:

1. create an isolated restore target;
2. restore backup with app/workers/network serving disabled;
3. load and verify every non-expired external journal record and its latest monotonic state;
4. run migrations compatible with the backup;
5. reproduce the latest authoritative state: reapply every active tombstone/write fence and replay erasing/complete deletion executors idempotently; only a verified latest `cancelled` record may restore access;
6. run the independent residue verifier;
7. enable workers/traffic only on a clean report.

Missing/unreadable journal storage, a database state ahead of the durable journal, version mismatch, residue, or unknown external action refuses serving. A pre-request backup therefore still reacquires the later journal and cannot restore access/jobs for an active tombstone; an authoritative cancellation is also reproduced rather than guessed. Failed drill targets are destroyed through the existing recoverable operator procedure and logged content-free.

An executable external-copy registry enumerates database backups, local copies, replicas, exports, logs, the configured LLM processor, Stripe customer/billing objects, Resend message/log copies, Sentry, PostHog, each configured authentication provider including Google, and the deletion journal. Local Better Auth account rows erase provider/account ids plus OAuth access/refresh/id tokens during identity erasure. Where the provider exposes grant revocation, a journalled idempotent outbox command revokes and reconciles it; otherwise the registry names the exact user-managed or contractual retention boundary and public copy does not claim provider erasure. Every entry names transferred field classes, purpose, region/subprocessor disclosure, adapter owner, `delete_api | contractual_expiry | legal_retention | content_incapable | user_controlled`, current official/contract source URL and review date, finite maximum where applicable, and an outbox/reconciliation action when the product controls one. Creator exports stream without a server-staged copy; once downloaded they are `user_controlled`, as are provider/user-device copies the product cannot revoke. Deletion copy explicitly excludes user devices, screenshots, reposts, and uncontrolled public caches from its erasure promise. Unknown outcomes for a promised controlled deletion/expiry block completion; user-controlled or documented provider legal-retention copies are disclosed rather than guessed deleted.

Launch defaults are pinned to current official terms and must be revalidated against the provisioned account: standard Anthropic API inputs/outputs expire within 30 days, with disclosed policy/law exceptions (flagged inputs/outputs up to two years and safety classifications up to seven years); zero-data-retention may be claimed only with account-specific agreement evidence, and prompt caching, batch, Files, web-search, and other persistent tools are disabled for creator/Sample calls. Sources: [Anthropic commercial retention](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) and [ZDR scope](https://privacy.anthropic.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to). Stripe uses its documented customer deletion/redaction jobs when objects become eligible, while transaction/legal records are disclosed as provider-retained rather than promised erased; open/risk objects reconcile before redaction ([Stripe deletion requests](https://docs.stripe.com/privacy/deletion-requests?locale=en-GB)). Resend Free/Pro/Scale message/log data expires after 30 days and the product sends no creator content in invite mail ([Resend retention](https://resend.com/security/gdpr)). Sentry/PostHog are content/identity-incapable by the 10a allowlist. Public launch blocks if the configured processor, product mode, contract, retention, or deletion capability differs from this reviewed registry.

Deployment identity sets are governed external copies too. `ADMIN_USER_IDS` and `ACTIVATION_EXCLUDED_USER_IDS` use `operator_remove_before_erasure`. The identity request/tombstone may proceed so the activation authority can snapshot exclusion while the configured id is still visible, but irreversible `erasing` cannot begin until the runbook removes the exact id from both sets, reloads every serving/worker process, an immutable content-free operator audit records any change, and an independent resolved-config probe proves the id absent everywhere. The app never edits deployment config and erasure never completes while either set remains a re-linkable copy. A deletion request whose snapshot found either membership exposes `operator_config_removal_required` as a pending erasure action, not as a reason to discard or recompute the captured exclusion.

At day 7 live data is gone. A backup created immediately before erasure has at most 21 days remaining, so it and the covering manifest are gone by day 28 after request. Tombstone manifests are retained until every backup they govern has expired, then purged no later than day 28. Monitoring alerts at day 6 live-pending and day 27 backup/manifest-pending.

### C5 — retention receiver

Before any already-due Stripe payload is redacted, a same-transaction pre-redaction extractor writes the minimum content-free finance facts needed by 10b-2 into a lifecycle-covered staging row: source Stripe event id, object type/id, invoice-line or PaymentIntent/refund/credit-note/dispute relation ids, charge/PaymentIntent original link, USD currency, amount excluding tax or disputed amount, service-period bounds, dispute status/effective timestamps, extraction version, and `complete | incomplete(reason)` status. No email/name/address or raw payload is copied. A complete row expires 30 days after verified projector ingestion. An unparseable or historically absent field—including a legacy dispute link/status—becomes an `incomplete` row in the linked pseudonymous financial chain because it is the permanent authority for withholding that period; it never delays the 90-day PII redaction deadline or becomes zero. 10b-2 consumes these rows idempotently and can use a source-linked Stripe API backfill only under separately provisioned operator evidence.

One scheduled, idempotent receiver covers:

- `stripe_events.payload`: redact after 90 days or later final processing state, including `workspace_id IS NULL` and deleted workspaces; retain content-free audit metadata.
- Better Auth `rate_limit.key`: delete no later than 24 hours after `last_request`.
- Better Auth `session`: a traffic-independent receiver deletes the complete row—including token, user id, IP address, and user agent—no later than 24 hours after expiry or revocation; identity deletion revokes and deletes every target-user session immediately. No bounded audit projection is retained from the session row.
- Better Auth `verification`: delete the complete secret-bearing row no later than 24 hours after `expires_at`. Before identity removal, the auth authority derives the exact supported verification identifiers for that identity from the normalised account record and deletes every matching row in the same erasure transaction; no identifier/value survives as audit data.
- Sample Spin HMAC buckets: not present in this slice; 10a must add their row class, receiver action, independent probe, populated fixture, and 24-hour clock in the same creating migration.
- `generation_attempts`: a one-minute receiver marks `claimed` older than 15 minutes `refused/abandoned_before_vendor`; marks `vendor_started` older than `overallDeadlineMs + 5 minutes` `recovery_required` without a new provider call; and attempts idempotent settlement of `vendor_complete` older than 5 minutes using only its stored candidate/original attempt identity. Settlement may retry without provider work, but at 24 hours after `vendor_completed_at` any still-unsettled candidate is cleared atomically by transition to `recovery_required` and alerts. Settled/debited rows follow their linked financial chain; other content-free terminal attempt metadata expires one year after terminal time. No candidate survives 24 hours and no ambiguous outbound call is retried.
- identity recovery digest erases on use/cancel, erasure start, or seven-day expiry. Deletion request/outbox/external-command rows remain only while active/unreconciled; at completion target/payload/personal links erase, and an opaque content-free receipt/version/outcome/contribution state expires one year later.
- `activation_cohort_daily` system counts expire two years after cohort maturity.
- backup creation/expiry/drill metadata expires one year after the backup expires; capable backups and external journal versions still expire by day 28.

The worker exports heartbeat, last start/success, rows scanned/redacted/deleted by table, oldest overdue age, blocked deletion count, dead-letter count, and tombstone/backup-expiry alerts. Metrics/logs contain codes/counts/opaque request ids only.

This slice owns one pure database `classifyActivation(userId, asOf, membershipSnapshot, exclusionSnapshot)` authority implementing R-121 and one `queryActivation(userId, asOf)` live-account wrapper that reads the membership plus resolved `ADMIN_USER_IDS`/`ACTIVATION_EXCLUDED_USER_IDS` snapshot under the shared membership lock before calling it; 10a must consume that wrapper and the same classifier/query seam for mature reporting rather than build a second query. In the identity-request transaction—before either deployment set is changed and before memberships become `deletion_suspended`—capture the exact immutable contribution `(excluded, denominator, already_earned_numerator)`, the closed exclusion-source code, membership/profile reachability versions, metric/config-snapshot version, and a pre-erasure keyed payload hash on the deletion operation. Membership in either audited set yields exactly `(true, 0, 0)` even if the operator later removes the id; an ordinary account yields `(false, 1, 0|1)` under the mature-cohort rules. A deleting user cannot earn later events, so this pre-removal/pre-suspension capture is final; changing config or membership state cannot reclassify an excluded signup or erase an earned numerator. Immediately before erasure—and only after the resolved-config absence probe passes—atomically apply that captured contribution to `activation_cohort_daily`, including its exclusion count. Exactly-once identity lives on the already lifecycle-covered operation row: unique random request id, keyed payload hash, `pending | applied`, and applied time are locked in the same transaction as the aggregate increment. The aggregate stores only cohort date/counts/metric-code version and no request/user/workspace/profile/email/content id. At erasure, erase the identifier-bearing hash/key material with the target and reachability links; replace it with a receipt digest computed only from the random operation identity, non-identifying aggregate contribution, metric version, outcome, and timestamps. The opaque receipt/contribution state follows the one-year receipt clock and no second contribution table is created. Restore replay uses the external journal plus operation state. The public metric combines this aggregate with the same classifier over remaining live accounts without double counting. Replay and concurrent erasure contribute once; a missing/hash-mismatched/unknown contribution blocks identity erasure until reconciled. A known-id dictionary/relink mutation must fail to associate the retained receipt with the deleted identity.

R-122 supplies the non-empty retention clock for every registry action. Financial facts are dependency-aware connected chains retained while the workspace is open and eligible only seven years after the later of workspace closure or the chain's latest completed transaction; no component row purges alone. The destructive financial receiver remains disabled until jurisdiction and ledger-chain review approves it. Other clocks are 90 days for content-free invite/delivery metadata; one year for membership/ownership security audit; active-key + 24 hours for API idempotency; 90 days for key/security audit; 24 hours for abuse buckets; one year for an irreversibly pseudonymised deletion receipt; and library-life for ownerless mechanism-only curation history. Legal-entity/jurisdiction review is a launch gate and may replace the schedule only through a new decision and migration/receiver update.

## Derived budgets

| Bound | Derivation / authority |
|---|---|
| 7-day grace | R-119; live erase deadline, not a legal-retention period |
| 21-day backup maximum | R-119 compiled maximum from backup creation |
| day-28 final capable-copy deadline | 7-day live grace + at most 21 remaining backup days; 2-day margin under REQ-A04's 30 days |
| Stripe payload 90 days | R-25 receiver contract; later only while processing is not terminal |
| IP/HMAC buckets 24 hours | R-26/R-117 |
| in-flight generation candidate | settle from stored candidate after 5 minutes; hard clear/`recovery_required` at 24 hours; no provider retry |
| financial connected chain | `max(workspace_closed_at, latest_linked_transaction_completed_at) + 7 years`; whole-chain eligibility only; destructive receiver disabled until jurisdiction/ledger review |
| S3 deletion journal | no Free Tier assumed; forecast envelope 1,000 deletion requests/month × at most 10 versions × 8 KiB plus 100,000 verification reads and no public egress; USD 0.50 forecast alert / USD 1 monthly budget alert from R-124; alerts never interrupt active deletion/restore |

One pure operator projection, `forecastDeletionJournalCost`, is the sole budget authority. Before provisioning it evaluates the compiled R-124 launch envelope against an immutable, reviewed regional S3 price snapshot; after provisioning it uses the same snapshot/formula with rolling measured object bytes and API-operation counts, while showing its source URL, AWS region, currency, effective/review time, and forecast inputs. Unknown/stale/cross-region pricing withholds the forecast and blocks new-account/public enablement. A forecast of USD 0.50 or more alerts; a forecast greater than USD 1 blocks new-account/public enablement until a recorded owner cost decision replaces the ceiling. Neither state may refuse, pause, abandon, or disable an active deletion, journal append, purge, restore, or residue verification, and neither can create an AWS resource or charge.

## Deferral ledger

| Deferred item | Why it is not in 10b-1 | Receiver |
|---|---|---|
| invite/revenue/adjustment/curation tables | this slice must establish lifecycle before they exist | 10b-2 C2–C7, with same-change registration |
| API-key/idempotency/abuse tables | machine authority depends on 10b-2 capability/Studio source | 10c C1–C5, with same-change registration |
| jurisdiction-specific replacement of the 7-year schedule | legal entity is not recorded in code and implementation may not infer it | public-launch legal checklist; a replacement decision + migration/receiver is mandatory before enablement if assumption differs |
| production proof that every provider snapshot is covered | requires target provider access | M6 operator evidence; deletion feature flag stays off without it |
| live S3 bucket/IAM/policy and charge approval | implementation can build the exact adapter and local contract tests without external mutation | explicit owner provisioning approval plus production restore walk; deletion/public launch stay disabled until then |
| in-app enforcement of the new-account/public enablement gate | the forecast authority and its decision are built and tested, but the product has no public-launch flag to gate and nothing is deployed; gating `sign-up` today would invent a product decision. `pnpm journal:forecast` exits 2 when the forecast is withheld or over ceiling, which is what a release checklist gates on | Task 8's owner surface, or the public-launch checklist — whichever first introduces a real enablement flag. Recorded 2026-09-07 after the Task 5 round-1 gate found the RUNBOOK and infra README claiming enforcement the app does not perform |
| restore replay execution and a standalone post-replay residue sweep | `restore-verify.ts` verifies the journal, refuses on any conflict, and now refuses outright when a planned step names an operation absent from the restored database (which the worker could never claim). Executing the replay is the worker's erasure transaction, which already rolls back on non-zero residue | the production restore walk, which must record one real replay-then-residue cycle; the drill's closing text says explicitly that it is not permission to serve |
| the journal-PUT / Postgres-COMMIT orphan window | the two are not one transaction; closing it needs a reconciliation read (an existing object whose checksum equals the intended bytes is an idempotent replay, not a conflict), which requires the verifier principal in the worker | owner provisioning, with the reconciliation read added in the same change; recorded in `docs/progress/respin-finish-open-items.md` |

## Task sequence and handoffs

1. Generate the complete table/writer inventory and red-drive the unregistered-table gate.
2. Define registry, executor/probe interfaces, and independent probe generation; migrate current registry consumers.
3. Implement the shared membership-lock primitive plus identity/profile/workspace request/tombstone/cancel/recovery state machines, write fences, and recovery-delivery linearisation.
4. Implement the closed Resend auth-delivery authority/budgets/receivers, external-command outbox/reconciliation, worker executor, populated fixtures, and cross-scope tests.
5. Implement R-124's S3 adapter/policies, `forecastDeletionJournalCost`, and local contract harness; enforce backup maximum, independent tombstone manifests, restore-before-traffic replay, residue verification, version purge, cleanup, and the forecast-only account/public enablement gate.
6. Add the pre-redaction Stripe finance extractor, all retention receivers, and worker health/alerts.
7. Implement the sole R-121 activation classifier, identifier-free cohort contribution, and live+aggregate query seam before identity erasure can enable; 10a imports this authority.
8. Add owner-facing preview/status/cancel pages and truthful privacy/export copy only after the end-to-end drill passes.
9. Publish the registration checklist/API that 10a, 10b-2, and 10c must consume.

## Expected files

- `respin/packages/db/src/creator-data-registry.ts`, deletion/recovery/activation-aggregate/finance-extract schemas and ops, shared membership lock/scoped capabilities, next additive migration.
- `respin/worker/**` deletion/retention jobs, schedules, health and tests.
- `respin/packages/db/src/deletion-journal*.ts`, cost-forecast/price-snapshot authority, lockfile-pinned AWS SDK v3 dependency, S3 policy/config template, `respin/scripts/{backup,restore}*`, and runbook changes for manifest replay/residue gate.
- Shared auth-mail authority/outbox, verification/reset/recovery adapters, owner identity/profile/workspace deletion actions and UI; privacy/export copy.
- Schema/table-writer/lifecycle/residue/restore integration tests and populated fixtures.

## Verification

### Focused checks

- Fresh DB and every historical migration to head; registry/table/writer/probe bijection; new fake table/writer mutations fail.
- Cross-workspace/profile/role attempts; stale session; last-owner transfer/demotion/deletion races; duplicate/conflicting idempotency.
- Reauthentication: server-only password/passkey/MFA event, 10-minute boundary, missing/stale/wrong-session/concurrent-session refusal, and runtime-tighten-only clamp for every R-118 high-risk operation.
- Closed auth-mail purpose population; atomic total/invite reserve; exact token TTL/use/rotation/digest erasure; delivery-before-identity-tombstone; verification/reset/recovery real-adapter fixtures and no-content logs.
- Write/read/job fences at tombstone; grace cancel before cutoff; refusal at/after `erasing`; executor lease/crash/retry.
- Stripe/auto-top-up outbox success, duplicate, timeout, out-of-order and reconciliation; no erasure on unknown.
- Populated deletion matrix per scope, including shared-survival/private-erasure and job non-resurrection.
- Backup at every boundary; S3 `If-None-Match`/conditional-policy enforcement, Versioning/Object-Lock/SSE/checksum assertions, duplicate version/delete-marker/gap/wrong-retention cases, split writer/verifier/purge permissions; external manifest missing/corrupt/stale; pre-request backup; restore replay before traffic; independent residue detection; day-28 expiry and all-version purge.
- Journal cost forecast proves USD 0.50 alert, `> USD 1` new-account/public enablement block, stale/unknown/wrong-region price withholding, source/version display, no implicit provisioning/charge, and uninterrupted active deletion/restore at every threshold.
- Receiver null/deleted-workspace rows, no-traffic expiry, large batches, partial failure/resume, health/alert thresholds.
- Generation-attempt 5m/15m/deadline+5m/24h/one-year boundaries, stored-candidate settlement without provider work, terminal clear, and financial-chain linkage.
- Stripe pre-redaction extraction complete/incomplete paths; 90-day redaction never loses or invents invoice-line/period/amount/relation facts.
- Activation preservation: denominator-only deletion before maturity, already-earned numerator, excluded-id snapshot before config removal contributes exclusion-only, resolved-config absence before erasure, replay/concurrency exactly once, live+aggregate no double count, and missing/unknown contribution blocks erasure.
- Activation capture occurs before membership suspension; mutating active membership to `deletion_suspended` cannot change a captured earned numerator or denominator.
- `typecheck`, `lint`, `db:check`, focused/live Postgres suites, canonical Docker/live zero-skip entry gate, `next build`.

### Acceptance walks

1. User with shared workspace work transfers ownership, requests identity deletion, receives the single-use recovery mail before the tombstone is acknowledged, loses sessions/access, then uses only that credential plus a fresh factor to cancel once; eligible suspended memberships return at unchanged roles, independently revoked state does not, invites/sessions do not resurrect, and shared work remains for the other owner.
2. Owner schedules then cancels profile deletion inside grace; schedules again, crosses erasure, and sees a terminal content-free receipt.
3. Owner deletes a workspace; another workspace belonging to the same signed-in user remains usable and the global session is not revoked.
4. Operator restores a pre-erasure backup into isolation; tombstones replay before traffic and residue verifier proves deleted content absent.
5. Operator advances retention clocks and sees governed payload/IP/bucket rows swept, including null/deleted-workspace Stripe rows.
6. Operator deletes one denominator-only and one already-activated account, then derives the mature cohort from remaining live rows plus the identifier-free aggregate with no loss or double count.
7. Email/password signup receives verification, verifies once, requests password reset, rotates/replays safely, and establishes a fresh password session through the real auth-mail adapter.
8. Operator evaluates one below-alert, one alert, and one over-budget S3 forecast: only new-account/public enablement changes, while an already-active deletion and isolated restore continue through completion.

## Mutation and non-vacuity matrix

| Mutation | Must redden |
|---|---|
| Add an unregistered app table or writer | registry bijection |
| Omit/overlap one governed field set or merge private/shared row classes | field-partition and row-class closure |
| Make verifier reuse executor target list | independence/source boundary test |
| Revoke global sessions on workspace deletion | session-scope test |
| Permit last-owner identity deletion/demotion race | locked authority test |
| Let invite/role/leave/transfer bypass the shared membership lock | cross-operation race matrix |
| Permit writes or worker completion after tombstone | fence/non-resurrection test |
| Retry an unknown external cancellation as new | outbox identity test |
| Erase before durable external manifest | transition test |
| Acknowledge tombstone/cancel before the journal version or resurrect invite/session/key on cancel | journal/recovery tests |
| Enable traffic before replay/verifier | restore ordering test |
| Keep a capable backup or manifest after day 28 | time-bound test |
| Overwrite a journal key, create a second object version/delete marker, weaken Object Lock/encryption, or let the writer delete | S3 contract/policy and restore-conflict tests |
| Make the USD 0.50 forecast silent, let `> USD 1` enable new accounts/public traffic, or stop active lifecycle work at either threshold | journal-cost authority and continuity tests |
| Delete shared analysis or retain private transcript | populated scope matrix |
| Retain a private autopsy's job/trend/cache ids in long-lived system-spend facts | field-set residue/re-linkability test |
| Ignore null/deleted-workspace retention rows | receiver population test |
| Redact Stripe payload before finance extraction or purge one ledger-chain row | finance extraction/connected-chain tests |
| Drop or double-count a deleted account's activation contribution | live+aggregate cohort tests |
| Reclassify an earned activation after membership suspension | pre-suspension snapshot test |
| Remove an excluded id before snapshot, or recompute it as eligible after operator config removal | pre-removal exclusion-ordering and replay tests |

**Population:** all app and supporting tables from live DB metadata; all state-changing writers from the writer registry; every deletion scope; every backup/snapshot/export location in the operator inventory; every receiver table. At least three mutations are planted by a non-author. Legal sufficiency is not test coverage and stays a named external review item.

## Rollout, rollback, budgets, and evidence

Deploy additively with deletion request creation disabled. Run the inventory/registry audit and retention receiver in dry-run, purge/backfill every already-overdue non-financial row and expired backup, and only report eligible financial chains while their destructive receiver remains disabled pending legal/ledger review; then run destructive non-financial receivers on controlled fixtures and an isolated restore drill. Record the current legal entity/jurisdiction or block public enablement. New-account/public enablement additionally requires a current regional S3 forecast at or below USD 1 plus explicit provisioning/charge approval; a higher or withheld forecast blocks only those enablement flags, never an active lifecycle operation. Enable identity deletion, then profile deletion, then workspace deletion under separate flags. Once a request reaches `erasing`, rollback may disable new requests but must retain compatible workers until every active operation/manifest completes; dropping lifecycle tables is forbidden.

Record table inventory, dry-run counts, populated fixture ids, migration/fresh-install/rollback results, worker health, S3 region/bucket ARN/policy digest/Versioning/Object-Lock/SSE/SDK-version proof without credentials, current-region pricing forecast, restore transcript, residue report, backup/manifest all-version expiry evidence, browser walks, gate outputs, and legal-review status. No production bucket/IAM creation or charge is authorised by this card; explicit owner approval is required.

## Done when

- Registry/table/row-class/field-set/writer/executor/probe closure is mechanical and all current governed data is classified.
- Each scope's state machine, authority, session behavior, populated erasure, cancellation, and non-resurrection proofs pass.
- A real isolated restore cannot serve before tombstone replay/residue success, and day-28 expiry is evidenced.
- The authoritative current-region journal forecast alerts at USD 0.50, blocks new-account/public enablement above USD 1 or when unavailable, never interrupts active lifecycle work, and cannot provision or spend.
- Retention receivers operate independently of traffic and expose content-safe health.
- Stripe finance facts survive payload redaction as complete or explicitly incomplete, and identity erasure preserves activation contributions exactly once without retaining identity.
- Public privacy/delete copy describes only shipped behavior.
- Full tenancy and billing gates PASS; spin/compliance runs for shared/private survival and content-log boundaries; final code review PASS.
- 10a/10b-2/10c receive a tested same-change lifecycle registration API and cannot add an uncovered table, row class, or field set.
