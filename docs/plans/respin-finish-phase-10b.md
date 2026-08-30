# Slice 10b: Seats + revenue admin; retention + scoped deletion

## A creator can…
**Invite a seat that can generate but cannot touch billing; delete their own identity without deleting shared work; and, as an owner, separately delete a profile or workspace with a verifiable 30-day erasure bound.**

## Run as two slices — recommended, and ACCEPTED as R-53 (2026-08-29, delegated)

The stub's question 5 asks whether this is still one slice after answering the others. **It is not, and the answer does not depend on the others.** The split is now the plan of record (R-53). The card is written as two halves that ship independently, in this order:

| | Half | Why it is separable |
|---|---|---|
| **10b-1** | **Seats + revenue/margin admin** | Additive. Nothing is destroyed. Gates: tenancy (Full), billing (Full) |
| **10b-2** | **Retention + deletion** | **Irreversible.** A deletion executor is the one thing in this product that cannot be rolled back, and CLAUDE.md's Golden rule 3 and rule 8 both point at it. Gates: tenancy (Full), compliance, billing (Full) |

Running them together puts the largest unshipped surface in the plan into a four-gate round holding the only irreversible operation in the product — which is the shape M2b-1's eleven rounds came from, and the reason slice 10 was split from 10a in the first place. **Splitting again costs one gate round and buys the ability to ship seats without holding deletion hostage to it.**

The rest of this card is written per half, and the boundary between task 7 and task 8 is now a slice boundary.

## Open items closing here
task 41 (the role × capability instrument) · the retention receiver over **three** tables · REQ-G05 margin aggregation · REQ-A04 deletion · **T-12**'s Respin restatement · slice 2b's pseudonymisation tripwire.

**B-2 / G-13 is already CLOSED** and this card does not carry it. Slice 1 gave every user-invokable profile write a viewer refusal via `assertMayWrite`; `assertMayDecide` gates confirmation/activation. `recordModelUsage` is deliberately internal to composed settlement and therefore has no membership-role meaning—this card's matrix records that audience and proves it is unreachable as a user capability. The prerequisite "seats do not ship while a viewer can write a brain document" is satisfied.

**A correction to the register.** The open-items entry for task 41 cites `packages/db/tests/profile-scope.test.ts:1245-1252` as an "unclassified instrument over columns, not role × capability". Those lines are **not an instrument at all** — they are the middle of the A-8 Unicode normalisation test. The real column-level instruments are at `:1489-1502` (`brain_docs`) and `:1552-1564` (`creator_profiles`), and the honest statement is stronger than the register's: **there is no role × capability instrument anywhere in the repo**, and `editor` is functionally identical to `owner` for every profile and brain capability. Only `assertOwner` (billing, `stripe/actions.ts:262`) distinguishes them.

## Prerequisites
- [ ] Slice 10a shipped
- [x] **`session.ip_address` retention decided — R-56(a) (2026-08-29, delegated):** redacted when its session expires or is revoked; the receiver sweeps expired sessions on its schedule. Legal dimension noted in the entry, reversible until 10b-2 builds the receiver
- [x] **T-12 resolved in writing — R-56(b):** append-only is an in-life integrity property, not immortality; REQ-A04 erasure removes versions by cascade on the data subject's authority. The source-comment updates land with the executor and cite R-56
- [x] The background-runner decision — **R-52: pg-boss**; the receiver runs on the same worker (question 4's "yes and yes" is now recorded, and the threat-model note about an HTTP-reachable receiver does not apply: the worker reaches the database directly)

---

## The five questions, answered

### 1. The role × capability table (task 41) — what is the instrument?

**Three layers, because two of them are individually insufficient in ways this repo has already been burned by.**

- **Layer 1 — type-level exhaustiveness.** A `CAPABILITY_MATRIX` declared `satisfies Record<Capability, Record<MembershipRole, boolean>>`. A new role or a new capability fails to compile. This is the cheapest layer and it is not enough: a compile-time record proves every cell has a *value*, never that the value is *enforced*.
- **Layer 2 — enumerated behavioural cells.** For every (capability, role) pair, a test that **drives the real function** and asserts allow or refuse. The count is `capabilities × 3`, enumerated from the capability factory's own keys rather than hand-listed, so a new capability produces a missing-cell failure. `packages/db/tests/profile-scope.test.ts:519-555` already enumerates `Object.keys(writeCapabilities(scope))` against a named minimum — the pattern exists and this extends it across roles.
- **Layer 3 — the false branches specifically.** CLAUDE.md's 2026-08-29 lesson is exact here: *"a REQUIRED parameter with no default reads exactly like a guard and is not one until a test drives its false branch — deleting R8's whole `attested !== true` refusal left 158 tests green, because every call site passed `true`."* Every `false` cell in the matrix must be a test that **sees the refusal**, not a test that avoids the path.

**The unclassified-cell failure the stub asks for is Layer 1 plus Layer 2's enumeration**: a capability with no matrix row fails to compile, and a matrix row with no behavioural case fails the count. Non-vacuity: plant a sixth capability with no row and see both fail.

**And the matrix must distinguish user-invokable from internal capabilities.** `recordModelUsage` is a
settlement-tail internal function, not a capability a viewer is allowed to invoke. Give every matrix row
an audience (`user` or `internal`); enumerate owner/editor/viewer behaviour only for user rows, and prove
internal rows are unreachable from app/user façades except through their named composed operation. A
missing row still fails exhaustiveness, but `{viewer: true}` must never be used to describe internal code.

### 2. T-12 — does REQ-A04 deletion remove append-only brain versions?

**Yes, and the append-only claim is narrowed in writing to what it always actually meant.**

The tension is real: `brain_docs` versions are append-only (`with-workspace.ts` never updates content, only status and confirmation columns) and REQ-A04 requires full removal within 30 days. But the two claims are about different things:

> **Append-only is an in-life integrity property: while the account exists, no version is rewritten, replaced, or silently superseded. It is not a claim that a version is immortal.**

Erasure is a different act with a different authority — the data subject's, not the product's — and the registry already records the answer: `brain_docs` deletion behaviour is `cascade` (`creator-data-registry.ts:60-72`). What T-12 asks for is that this be **written down** rather than being an unresolved contradiction between two documents, and this is where it is written.

**The narrowing must land in the same change as the executor**, in `decisions.md` and wherever the append-only claim is stated in source, or the product ships code that contradicts its own comments.

### 3. `session.ip_address` — what retention period?

**Tie it to the session, not to a clock: redact `ip_address` when the session expires or is revoked.**

Every alternative invents a number. This one has a natural boundary, it is the shortest period that keeps the column's functional purpose intact, and it is decided *with* the deletion path rather than inherited by default — which is what `build-plan.md` M6 asks for. R-27 records that the column goes from `""` to real personal data at first deploy, the moment `RESPIN_TRUSTED_PROXIES` names a real proxy, so the period matters from day one of production and not before.

`rate_limit.key` keeps its recorded period — **24 hours after `last_request`** (R-26) — and `stripe_events.payload` keeps its **90 days after `received_at`, or until the row's final processing state is known if later** (R-25/D-AUDIT-2), including the two row classes workspace deletion misses: rows whose workspace has since been deleted, and rows with `workspace_id = NULL`.

### 4. Does the retention receiver need the runner, and is it slice 8's?

**Yes, and yes.** Retention must execute without anyone reading anything, so the lazy-derivation pattern that carried grace, downgrade and expiry cannot carry it. It is the same runner slice 8 chose — a second scheduler is a second operational surface for the same job, and R-42's connection arithmetic (26 per app process against a default `max_connections` of 100) already bounds how many processes fit.

**If slice 8 chose a runner that cannot reach the database directly** — a hosted scheduler calling an HTTP endpoint, say — the receiver becomes an authenticated route, and that route is a **destructive operation reachable over the network**, which needs its own authority and its own test. Naming that here is the point: the answer to "which runner" changes the receiver's threat model, not just its wiring.

### 5. Is this still one slice?

**No.** See the recommendation at the top.

---

## Requirements — 10b-1: Seats + admin

### Seats (REQ-A02)
- [ ] **R1:** Studio workspaces support up to 3 seats with roles owner / editor / viewer. The role enum already exists with exactly those three values (`schema.ts:15-19`); what does not exist is any invite flow, any seat count, or any seat entry in config.
- [ ] **R2:** The seat cap is **per tier, from config**, through the one tier authority — the `profileCaps` pattern, not a second one.
- [ ] **R3:** An invited seat **can generate and cannot touch billing** (M6's acceptance criterion). `assertOwner` already enforces the billing half on all seven Stripe actions; the generate half is slice 6's role gate.
- [ ] **R4:** `memberships` is **not policed by `tests/table-writers.test.ts`** today — it is absent from the `TABLES` map (`:27-34`), so an invite flow would add a membership writer with no writer-set enforcement at all. It joins the map in this slice.
- [ ] **R5:** The role × capability instrument, all three layers (question 1).
- [ ] **R6:** **R-43's trigger fires here.** R-43 recorded that an `editor` may confirm a creator's inferred brain, on the workspace-grain reading of REQ-B02, and named its cost: *"`confirmed_by` is the only record of who made the decision, and nothing in the product yet shows an owner that an editor confirmed on their behalf… seats and roles get their real treatment in slice 10b — that slice owes either a surface showing the owner who confirmed each field, or a written reason one is not needed."* Build the surface or write the reason. Not silence.
- [ ] **R6a:** The existing `memberships` table remains the sole role authority. Add custom `workspace_invites`: store a hashed single-use token and safe prefix only; bind to normalized invited email + workspace + role; expiry/revoke/accepted timestamps; resend through Resend; accept only while authenticated as the matching verified email. Enforce one active invite per workspace/email, seat cap and owner-count rules atomically. Better Auth Organizations is explicitly not used.

### Admin (REQ-J01)
- [ ] **R7:** Framework curation queue (approve / edit / reject / merge) over the `curator_status` enum that already exists and has never had a writer.
- [ ] **R8:** Trend source management, saturation flags.
- [ ] **R9:** User and subscription lookup.
- [ ] **R10:** Credit adjustments **with reason codes**. `adjustCredits` exists (`ledger.ts:152-198`) with **no app-reachable caller**; `credit_ledger` already has an `adjust_reason` CHECK. This is its first caller.
- [ ] **R11:** Add append-only `billing_revenue_events` as the authoritative non-PII revenue input. Each Stripe invoice line, pack/top-up, refund and credit note has a unique business id, currency, net amount excluding tax, service/lot period and reversal link. Subscription revenue is recognized ratably over its service period; pack/top-up revenue is deferred and recognized as credits are consumed using the existing lot allocation (remaining breakage only at expiry); refunds/credit notes reverse the original event. v1 supports USD and fail-closed rejects/segregates other currencies rather than summing them.
- [ ] **R11b:** Revenue rows store no customer email/name/address or webhook payload. Any workspace linkage is a retained financial pseudonym and is replaced with the same deletion-time random pseudonym as the cost rollup; tier/period/business ids remain for reconciliation. Webhook/reconciliation writes and reversals are idempotent and registered in finance retention/deletion policy.
- [ ] **R11a:** Define the dashboard as **contribution margin**, not model spend: recognized net revenue minus tenant model cost for the period/tier. Show `unknown_call_count / call_count` and amount separately; never treat unknown as zero. Show slice-8 system spend as product overhead separately, then a total contribution-after-system-overhead line without pretending it belongs to a tenant/tier. `/admin/model-spend` remains the earlier cost-only view.
- [ ] **R12:** Admin remains the fail-closed `ADMIN_USER_IDS` allowlist, orthogonal to `membership_role`. **A destructive or money-moving admin action needs an audit record** — there is no admin audit log today, and R10 introduces the first admin action that moves money.

## Requirements — 10b-2: Retention + deletion

### The receiver (three tables, one sweep)
- [ ] **R13:** `stripe_events.payload` redacted per R-25, **including `workspace_id = NULL` rows and rows whose workspace was deleted**, with the non-PII audit metadata still readable afterwards (M6's criterion, verbatim).
- [ ] **R14:** `rate_limit.key` swept at 24 hours after `last_request` (R-26). Better Auth's own opportunistic pruning is an internal of a pinned dependency, not a retention guarantee.
- [ ] **R15:** `session.ip_address` redacted per question 3.
- [ ] **R16:** `tests/retention.test.ts`'s no-new-reader tripwire — which today covers **only** `stripe_events.payload` — is **extended to the other two tables** or explicitly recorded as not needing to be. Its `ALLOWED` map has two entries and its scan is the model.
- [ ] **R17:** The receiver has run and is **shown to have run**: at least one payload older than 90 days redacted, including a `workspace_id = NULL` row, and both other tables swept on their own periods. M6's acceptance criterion is a measurement, not a capability.

### Deletion (REQ-A04)
- [ ] **R18:** Three distinct operations have distinct authority and scope:
  - **Delete user identity:** re-authenticated user action; revoke sessions/invites and remove the user's memberships/identity. It never deletes a shared workspace, profiles, generations or other members' content. Required audit authorship is pseudonymised/retained according to the registry.
  - **Delete creator profile:** owner-only, re-authenticated action scoped to one profile; it removes that profile's governed tree without deleting the workspace or other profiles.
  - **Delete workspace:** owner-only and re-authenticated; require typed workspace confirmation, resolve/transfer the last-owner state, cancel billing/auto-top-up, revoke all invites/sessions, tombstone scheduled/running jobs, then delete every governed workspace/profile tree.
- [ ] **R18a:** The registry-driven executor supports dry-run enumeration, is idempotent, and runs under a workspace lock/transaction boundary appropriate to each table. Request immediately tombstones access and jobs; a 7-day recovery grace precedes live-row erasure. Database backups retain deleted bytes for at most 21 further days, so every governed copy expires no later than 30 days after request. `respin/scripts/backup.sh` and restore/runbooks enforce and verify that bound.
- [ ] **R18b:** A separately authored residue verifier enumerates migration-created tables and registry classifications rather than copying the executor's list. Restore tests prove a backup older than the allowed window is unavailable and a restored in-window backup re-applies deletion tombstones before serving traffic.
- [ ] **R19:** **`workspace_spend_monthly` is pseudonymised**, discharging R-30.5 and firing slice 2b's tripwire. It is the one `retained` row in the registry and the only place a deleted workspace's identifier would survive.
- [ ] **R20:** T-12's narrowing recorded in the same change (question 2).
- [ ] **R21:** The deletion path is **exercised in test** (M6's criterion) and its verification is positive: after deletion, a named enumeration of tables is checked for residue, rather than a spot check on the three that were easy.
- [ ] **R22:** Every deletion requires recent re-authentication, explicit scope copy and typed confirmation; workspace/profile deletion is owner-only. Grace cancellation uses the same authority. No generic "delete account" button can ambiguously choose among the three operations.
- [ ] **R23:** The privacy page's deletion claims become true in this slice, and slice 10a's R11 is why they must not have been written earlier.

---

## Left to the developer

- **Invite email presentation and token lifetime**, within R6a's fixed custom-invite authority and expiry/revocation invariants.
- **The receiver's schedule**, subject to question 4.
- **The admin audit record's shape** (R12).
- **Batch size and exact receiver schedule**, within R18a's fixed 7-day live grace + ≤21-day backup-expiry contract.

## Tasks — 10b-1
1. [ ] The capability matrix, all three layers, plus the ungated row with its reason (R5)
2. [ ] Seat cap in config; hashed single-use custom invite flow through Resend; `memberships`/`workspace_invites` join writer and retention instruments (R1–R6a)
3. [ ] R-43's confirmed-by surface, or its written reason (R6)
4. [ ] Curation queue, source management, lookup (R7–R9)
5. [ ] Credit adjustments with reason codes + the admin audit record (R10, R12)
6. [ ] Revenue-event ingestion/recognition + contribution-margin dashboard over tenant cost and separate system overhead; unknown share retained (R11/R11a)
7. [ ] Walk it: invite a seat → it generates → it cannot reach billing

## Tasks — 10b-2
8. [ ] The receiver over three tables (R13–R15); extend the tripwire (R16)
9. [ ] Three scoped deletion commands, dry-run/idempotent registry executor, immediate tombstone + 7-day grace, backup/tombstone restore enforcement, independently-authored residue verifier (R18–R19)
10. [ ] T-12's narrowing in `decisions.md` and in source (R20)
11. [ ] Re-authentication, typed scope-specific confirmation/cancel UX and independent residue enumeration (R21, R22)
12. [ ] Privacy page truth pass (R23)
13. [ ] Walk all three: invited user deletes identity and shared work remains; owner deletes one profile; owner deletes workspace → access/jobs stop immediately → grace expires → live + backup-bound residue checks pass → retained rollup is pseudonymised

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/capabilities.ts` | Create | The role × capability matrix (R5) |
| `respin/packages/db/src/deletion.ts` | Create | The registry-driven executor (R18) |
| `respin/packages/db/src/retention.ts` | Create | The three-table receiver (R13–R15) |
| `respin/packages/db/src/invites-schema.ts`, migration | Create | Hashed single-use workspace invites |
| `respin/packages/db/src/revenue-schema.ts`, migration | Create | Authoritative revenue events, reversals and recognition inputs |
| `respin/packages/credits/src/seats.ts` | Create | Seat cap decision (the `createProfile` split shape) |
| `respin/app/(product)/settings/seats/**` | Create | Invite, roles, revoke |
| `respin/app/(product)/settings/account/**` | Create | Deletion, with confirmation |
| `respin/app/(admin)/admin/**` | Modify | Curation, sources, lookup, adjustments, margin |
| `respin/tests/retention.test.ts` | Modify | R16 |
| `respin/tests/table-writers.test.ts` | Modify | `memberships` (R4) and every admin writer |
| `respin/tests/capability-matrix.test.ts` | Create | R5 layers 2 and 3 |
| `docs/initial/decisions.md` | Modify | T-12, the IP period, R-43's disposition |
| `respin/scripts/backup.sh`, restore/runbook docs | Modify | ≤21-day post-grace backup expiry and tombstone replay |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **A seat invited to a Studio workspace generates but cannot touch billing** (M6's criterion), in a browser
2a. [ ] Reuse/revoke/expire an invite, accept under a different email, race the seat cap and attempt to create a second ownerless workspace state → all refuse atomically (R6a)
3. [ ] Every (capability, role) cell has a behavioural case; a planted sixth capability fails to compile **and** fails the count (R5)
4. [ ] Every `false` cell has a test that sees the refusal fire (R5 layer 3)
5. [ ] A credit adjustment writes a reason code and an audit record (R10, R12)
6. [ ] Invoice/pack consumption/refund fixtures reconcile exactly once to recognized USD revenue; contribution margin reports retained unknown share and system overhead separately (R11/R11a)
7. [ ] **User identity, profile and workspace deletion produce their three distinct scopes**, checked by the independent table enumeration (R18/R21)
8. [ ] The rollup row survives deletion **and its `workspace_id` is pseudonymised** (R19)
9. [ ] The receiver has redacted a payload older than 90 days including a `workspace_id = NULL` row, with audit metadata still readable (R17)
10. [ ] `rate_limit` and `session.ip_address` swept on their own periods (R14, R15, R17)
11. [ ] A new table added after this slice joins deletion by registration alone (R18's non-vacuity)
12. [ ] During grace, access/jobs are tombstoned and cancellation works; after day 7 live data is erased; after day 30 no eligible backup can restore it, and an in-window restore replays tombstones before traffic (R18a/R18b)
13. [ ] Last-owner, billing cancellation, auto-top-up, active job and invited-seat deletion races settle without orphan authority or post-request writes (R18)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | A capability removed from the matrix | Verification 3 |
| M2 | A `false` cell flipped to `true` | Verification 4 |
| M3 | Deletion executor iterates a hard-coded table list | Verification 11 |
| M4 | Pseudonymisation step removed | Verification 8 |
| M5 | Receiver skips `workspace_id = NULL` rows | Verification 9 |
| M6 | `unknown` share dropped from the margin figure | Verification 6 |
| M7 | Seat cap read from a second tier derivation | The tier-authority test |
| M8 | Adjustment writes no reason code | Verification 5 |
| M9 | Invited-user deletion cascades the workspace | Verification 7 |
| M10 | API accepts invite token for a different authenticated email | Verification 2a |
| M11 | Subscription tax counted as revenue or refund not reversed | Verification 6 |
| M12 | Pack revenue recognized before lot consumption/expiry | Verification 6 |
| M13 | Backup retention extends deletion beyond 30 days | Verification 12 |
| M14 | Restore serves traffic before tombstone replay | Verification 12 |

**Population note — read before reporting "N of N".** Fourteen mutations on code that will exist. **The hazards this matrix cannot reach, and this slice has the most of any in the plan:** (a) **deletion's correctness is an absence** — a table the executor never touches produces no failing test unless the independently-authored enumeration covers it. (b) **R6 is a decision, not code** — nothing fails if R-43's obligation is silently dropped. (c) audit/confirmation are new controls with no precedent. (d) time-manipulating tests prove queries, not that production schedules and backup expiry actually run; the operator walk and restore drill are required evidence. Before claiming a matrix result, state which requirements have no control, and have someone other than the executor author plant at least three deletion/restore mutations.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The seat walk and all three scoped deletion walks are completed independently
- [ ] **All four Critical-Path gates** PASS on each half — reviewers in **isolated worktrees**. This is the heaviest gate load in the plan, which is why the split at the top of this card exists
- [ ] task 41, the retention receiver, REQ-G05 margin, REQ-A04 deletion, T-12 and slice 2b's pseudonymisation tripwire all closed in the disposition register
- [ ] `decisions.md` carries: user-vs-internal capability classification, custom invite authority, revenue recognition/margin definition, three deletion scopes, 7+21-day erasure schedule/restore rule, T-12, `session.ip_address`, R-43 and receiver schedule
- [ ] `build-plan.md` M6's acceptance criteria are **measured** — including the receiver's, which is a measurement and not a capability
- [ ] **The register's task-41 citation is corrected** (see "Open items closing here")
