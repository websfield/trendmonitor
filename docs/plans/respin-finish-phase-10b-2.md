# Slice 10b-2 — Owners, seats, contained admin money, revenue, and curation

**Codebase review:** [`../progress/respin-finish/10-codebase-review.md`](../progress/respin-finish/10-codebase-review.md)

**Decision authority:** owner-approved R-118–R-120 plus reversible build-plan default R-122 in [`../initial/decisions.md`](../initial/decisions.md)

**Depends on:** 10b-1's executable lifecycle registry/state machines/same-change table gate/residue verifier and 10a's stable system-spend/observability interfaces. If any new table cannot register there, this slice blocks rather than deferring deletion/export/retention.

## A creator can…

**As an owner, invite a matching verified email, change roles without orphaning the workspace, and see who confirmed a brain update; as an editor, accept the invite and generate/log results but never administer billing, seats, deletion, or API keys; as a viewer, read only.**

## An operator can…

**Curate a mechanism-only shared framework through one review authority, issue a bounded idempotent credit adjustment/refund, and read recognised revenue and known cost—with margin withheld whenever the aligned population is incomplete.**

## Least confident

Pack/top-up revenue recognition through consumed credit lots is the most intricate accounting seam because consumption may span lots and later refunds/expiry. Build and review the immutable allocation projection before wiring the dashboard or any margin label.

## Scope and non-goals

This slice owns REQ-A02, REQ-J01, task 41/R-43 confirmation authorship, Studio seat caps/invites/roles/ownership transfer, a compile-closed human capability registry, the first safe admin callers for adjustment/refund, Stripe revenue/reversal authority, complete-or-withheld margin, and final shared-framework curation.

It does **not** add API keys, change tenant generation settlement, let workspace owners perform platform operations, create Better Auth Organisations, use free-form invite/admin reason text, treat self-reported results as learning, or claim finance/audit/legal certification.

## Ownership

One `respin-engineer` integrates the capability/seat, money/revenue, and curation stages sequentially so shared tenancy/lifecycle files have one writer. Full billing, tenancy, spin-compliance, and learning-honesty reviewers inspect the stable slice; finance/legal conclusions remain external evidence, and final code review runs after specialist fixes.

## Pinned contracts

### C1 — one closed human capability registry

Replace scattered/stale capability enumeration with one typed registry consumed by every session-minted WorkspaceScope/ProfileScope factory and every action:

```ts
type Capability = /* closed union generated from every real factory/action */;
type PrincipalRule =
  | { kind: "tenant_role"; minimumRole: "viewer" | "editor" | "owner" }
  | { kind: "authenticated_self"; target: "session_user" }
  | { kind: "identity_recovery"; action: "cancel_identity_deletion" }
  | { kind: "platform_admin_allowlist"; action: PlatformAdminAction }
  | { kind: "internal"; mintAuthority: InternalAuthorityId };
type CapabilityRule = {
  grain: "identity" | "workspace" | "profile" | "platform";
  principal: PrincipalRule;
  pause: "read" | "creator_input" | "settlement_tail" | "gated";
  deletion: "allowed_status_only" | "blocked_when_tombstoned";
};
```

The registry includes every existing read/write capability, not a selected list. Factories and route/server-action exports are mechanically enumerated; missing/extra rules fail compile/test. The pinned population includes identity/workspace/profile creation/read/settings, onboarding input, brain write/confirm/activate, feedback, proposal refresh/accept/reject, generation, result entry, membership/invite/role/transfer, billing, API-key lifecycle, deletion/status/cancel, and every current admin/worker/Stripe action. R-118 supersedes R-43 for durable profile/brain work: owners alone create/edit profiles, submit onboarding inputs, write/confirm/activate brains, and refresh/decide proposals; editors may generate, submit structured feedback, and enter results against an active profile. Tenant roles are ordered only inside `tenant_role`; `authenticated_self`, `identity_recovery`, `platform_admin_allowlist`, and `internal` are incomparable branches. `authenticated_self` derives both ids server-side and requires `session.userId === targetUserId`; it cannot target another identity through any tenant or platform role. `identity_recovery` is minted only by 10b-1's single-use credential and can cancel only the exact live deletion named by that credential. `ADMIN_USER_IDS` platform capabilities cannot be reached by owner/editor/viewer/self role, and internal worker/Stripe capabilities cannot be minted by a session.

Seeded matrix:

| Capability class | Owner | Editor | Viewer | Platform admin |
|---|---:|---:|---:|---:|
| ordinary profile read | yes | yes | yes | no tenant bypass |
| generate / result input | yes | yes | no | no tenant bypass |
| profile settings/content edit; onboarding/brain confirm/activate; proposal decision | yes | no | no | no tenant bypass |
| seats, roles, ownership transfer, billing, profile/workspace deletion, API-key lifecycle | yes | no | no | no tenant bypass |
| curation, subscription/user lookup, credit adjustment/manual refund, revenue diagnostics | no by role | no | no | allowlist only |

Every capability use independently respects pause/deletion policy. The minted scope carries membership version, but it is not continuing authority: each read joins/re-reads active membership, matching monotonic version, required current role, and workspace/profile tombstone at the authoritative query; each write repeats that check inside its mutation transaction. Invite acceptance, role change, remove/leave, transfer, deletion, billing, and API-key lifecycle take 10b-1's identity/workspace membership-graph locks; ordinary profile/brain/result/generation writes perform the same in-transaction version check. No stale owner/editor/viewer scope survives concurrent demotion, removal, or tombstone, including roster/billing/key/status/content reads. Multiple owners are permitted. Last owner cannot leave, be removed/demoted, or delete identity. If the affected owner is `billing_contact_user_id`, leave/remove/demote/transfer refuses until another active owner explicitly accepts contact; the same membership-lock transaction installs that replacement and a journalled Stripe outbox clears/replaces every old-contact personal field before the transition completes. Unknown external outcome blocks, and the race matrix covers identity/workspace deletion and concurrent Stripe updates. R-118's server-only 10-minute reauthentication proof is mandatory for owner promotion/transfer/removal, billing mutation, deletion request/cancel, API-key lifecycle, and every platform-admin money action; missing/stale/wrong-session/concurrently refreshed client state refuses. Ownership transfer is atomic; self-transfer/no-op and concurrent transfer/removal are idempotent or refused. The matrix includes authenticated-self versus other-identity attempts, recovery-cancel confinement, Google-only enrollment/reauth, former-billing-contact residue, and demotion/removal/tombstone races against content/admin reads, profile/brain writes, billing, deletion, invites, and key lifecycle.

Before high-risk actions enable, the auth authority gives Google-only users a bounded local-factor enrollment. It creates one high-entropy single-use challenge, stores only its digest/prefix, binds it to the exact verified identity/current session, expires it within 15 minutes, and delivers plaintext once to the already verified account email through the registered Resend adapter. One outstanding challenge exists per identity; resend atomically rotates the secret without extending the original expiry. The link reaches a dedicated `enrollFirstLocalPassword` authority that uses Better Auth's credential account/password hashing substrate, refuses any identity that already has a password credential, and preserves the bound session; it must not reuse the ordinary reset path or weaken `revokeSessionsOnPasswordReset = true`. The link does not write `reauthenticated_at`. The user then proves the new password in that still-bound session, and only that proof starts the ten-minute clock. Challenge rows/delivery metadata register with 10b-1 in the same change; use/rotation/expiry/identity deletion erases the digest, a traffic-independent receiver and independent probe enforce the clock, and replay/wrong-session/wrong-identity/link-only attempts refuse. Tests prove enrollment session continuity and that ordinary password reset still revokes sessions.

REQ-J01 user/subscription lookup is one least-privilege platform projection, not raw table access. An allowlisted platform admin supplies exactly one exact-match key: normalised email, auth user id, workspace id, Stripe customer id, or Stripe subscription id; prefix/fuzzy/bulk listing is unavailable. The server may return user id, safe display name, verified email/status, account creation/deletion state; workspace id, resolved tier/subscription/pause/grace/deletion state, period end, billing-contact safe label, member/profile counts; and the exact Stripe customer/subscription/price ids needed for support. It excludes brain/onboarding/reference/transcript/prompt/output/result/proposal/private-profile content, member rosters, payment method data, addresses, OAuth/API/invite/session secrets, raw webhook payloads, and ledger free-form data. Every lookup requires a closed support reason and appends a content-free audit with actor, query-kind, opaque target, time, and outcome, `exportProjector = none`, expiring after 90 days; target/actor human ids pseudonymise immediately on identity deletion and presenters show “Deleted member.” Cross-role, cross-tenant content, broad-search, secret-field, and deleted-identity probes plus an operator acceptance walk are required.

### C2 — custom invite and seat authority

Do not adopt Better Auth Organisations. Store only a non-secret token prefix and HMAC/slow-hash digest of a high-entropy single-use token; show/send plaintext once. Normalise email with the same auth authority. An invite has workspace, target role (`editor|viewer`; owner promotion happens only after membership), inviter, created/expires/revoked/accepted timestamps, and lifecycle metadata. The normalised target email and personal inviter id exist only while active and erase/null on accept, revoke, expiry, target identity deletion, or inviter identity deletion; acceptance uses them before that transition. Afterwards only an opaque invite id, pseudonymous workspace/business link, role-at-invite, non-identifying outcome code and timestamps may remain for 90 days. It expires after 7 days. Exactly one active invite per `(workspace, normalised_email)`; active invites reserve a seat.

Invitation creation and acceptance lock the workspace and count active memberships + unexpired invites against compiled launch maxima Free/Creator/Pro `1`, Studio `3`. Seat caps are not admin-editable config at launch; changing or raising them requires code, a recorded product decision, spend/tenancy review, and deploy. Do not trust a caller tier. Acceptance requires an authenticated, verified account whose normalised email matches, consumes the invite once, and creates the membership atomically. An account that is already a member is refused without changing its role; role changes use only the reauthenticated locked role-transition authority. Replaying the exact already-accepted invite is a read-only idempotent return of the membership created by that invite, never an update or demotion. Mismatch, expiry, revocation, tombstone, pause, downgrade/cap race, and concurrent acceptance fail closed without revealing another email.

A lower-tier Stripe event that puts a workspace over cap applies the new billing tier and, under the same event-id plus membership-version lock, revokes every active invite and enters `seat_reconciliation_required`; it never silently removes, demotes, or deletes a member. Owners retain read/status and the minimal seat-resolution actions; editors/viewers and ordinary workspace writes are suspended. An owner explicitly removes members until active membership count is within cap, and the transition refuses any result with no owner. A later upgrade may atomically clear the state and restore unchanged memberships; revoked invites never return. Concurrent downgrade/upgrade, acceptance, removal, webhook replay/rollback, and last-owner races have fixed expected states and mutation tests.

Invites use 10b-1's sole Resend auth-delivery authority, never a parallel adapter or budget. Email content contains the single-use link and expiry, no workspace private content. Under the [official free launch allowance](https://resend.com/pricing) (3,000/month, 100/day), the shared product ceiling is 2,400/month and 80/day; invites may consume at most 1,800/month and 60/day so account/security mail retains its reserve. Runtime may tighten. A failure after token creation leaves the same resendable invite row and original expiry, never a second active invite. A resend command atomically rotates a fresh high-entropy secret/prefix/digest on that row, increments a token-generation counter, invalidates every earlier link, and passes the new plaintext to the shared outbox once; it never reconstructs plaintext from the stored digest. The stable invite id plus a caller idempotency key makes concurrent/replayed resend commands return one generation. Delivery events are content-free. If provisioning/live delivery is unavailable, engineering may finish but launch evidence remains blocked.

Confirmation history renders the decision user's current safe display label or “Deleted member,” plus immutable role-at-decision and time already recorded by 9b; it never infers ownership from current membership.

### C3 — contained adjustment and refund callers

Before exposing admin actions:

1. Add dedicated `original_debit_id` to refund rows and compute refundable capacity across **all** prior refunds for that debit, regardless of legacy `ref_type/ref_id` spelling. Give ledger rows unique `(id, workspace_id, kind)` identity; refund rows carry `original_debit_kind` constrained to the literal `debit` and a composite FK `(original_debit_id, workspace_id, original_debit_kind)` to that identity. Backfill/audit legacy rows and refuse ambiguous, cross-workspace, or non-debit links.
2. Give `adjustCredits` a closed reason enum, required business idempotency key/ref, mandatory explicit expiry no later than 12 months after issue for every positive lot, signed bounded amount, authoritative platform-admin actor, and same-transaction content-free audit row. One operation and the workspace's rolling 30-day net positive total cannot exceed the active config version's Studio monthly allowance; a negative operation cannot exceed derived balance. Runtime may tighten the expiry/amount ceiling. No never-expiring launch adjustment exists.
3. Refuse arbitrary adjustment on paused, cancelled, tombstoned, deleting, unmapped-price, or unknown-state workspaces. A source-linked compensating refund uses `refundCredits`, not `adjustCredits`, and remains a settlement-tail operation during pause/tombstone/deletion under its original-debit/refundable-capacity contract. It restores the exact source-lot units and effective expiry/pause state, never grants access or resumes generation, and after workspace erasure survives only inside the pseudonymous financial chain. Identity/profile deletion does not change workspace refund capacity; a missing/closed financial chain refuses rather than inventing credits.

Duplicate/concurrent business ids yield one ledger/audit effect. The audit records ids, actor, reason, amount, expiry, before/after derived balance, and operation outcome—never a free-form note or creator content. UI preview is informational; the transaction re-derives every value. Limits live in code/config where runtime can tighten, never widen.

The sole `refundCredits` authority accepts a discriminated caller. `{ kind: "platform_admin_manual" }` requires current allowlist, recent reauth, closed reason and business id for the bounded manual partial-refund surface. `{ kind: "internal_settlement", source: "pasted_reference", claimId }` preserves 8c's existing deterministic parked-autopsy settlement tail: the branded internal mint derives original debit, refundable amount and exactly-once claim id server-side and exposes none to a tenant. Both branches use the same composite original-debit/refundable-capacity constraints and ledger/projector transaction. Owner/editor/viewer callers can neither choose a refund nor supply amount/source, and no repair may delete or widen the existing 8c path. Caller enumeration and a tenant-arbitrary-mint mutation are mandatory.

### C4 — authoritative revenue events and recognition

The signature-verified Stripe webhook transaction owns immutable receipt/reversal facts and finalises `stripe_events` atomically; each fact carries `stripe_event_id` **and** its business identity. 10b-1's pre-redaction finance extract is the legacy backfill source. No webhook callback claims it can recognise future debit/expiry events:

| Revenue class | Business identity | Recognition |
|---|---|---|
| subscription invoice line | Stripe invoice-line id | `amount_excluding_tax`, USD, ratable by UTC day over Stripe line `period`; deterministic integer remainder allocation |
| pack/top-up receipt | PaymentIntent id (checkout and PI deliveries converge) | deferred; allocate to the exact credit lot, recognise proportionally as that lot is consumed; remaining recognised only on actual expiry |
| refund | Refund id linked by charge/PaymentIntent | reverse the linked receipt/recognition once, including partial refund |
| credit note | Credit-note id linked to invoice/line | reverse the linked line once; relation rules prevent the same economic reversal being counted again as a charge refund |
| dispute/chargeback | Stripe dispute id linked through charge/PaymentIntent to the original receipt | open/unknown/out-of-order disputes quarantine and withhold every affected grain; terminal `won` clears quarantine without revenue change; terminal `lost` appends one original-linked reversal for the exact lost amount. Reopen/partial/multiple disputes remain keyed by dispute id and cannot exceed original net receipt |

Unique delivery id prevents replay; unique business identity prevents two distinct event types/deliveries minting the same receipt/reversal. Out-of-order events enter a named unresolved state and reconcile when the original arrives; they do not guess. Missing link, service period, amount-excluding-tax, currency, or mapping quarantines the event and alerts. Webhook rollback rolls back the immutable receipt/reversal fact and `stripe_events` completion together, so redelivery is safe.

Cash reversal timing is deterministic and never rewrites a prior weekly fact. The signed Stripe refund/credit-note created time or terminal lost-dispute effective time is the reversal UTC date; missing/conflicting time quarantines. Under one original-receipt lock, divide the current reversal amount by the current unreversed basis, then allocate exactly that amount in integer micro-USD pro rata across the receipt's recognised and still-deferred unreversed components at the effective instant, assigning remainder to the final component under total order `(effective_or_recognition_utc, source_allocation_id)`. Append the recognised share as original-row-linked negative revenue on the effective date; append a basis reduction against the exact future subscription schedule or unconsumed pack-lot portions so it can never recognise later. If multiple recognised days/tiers exist, the same pro-rata/remainder rule names each source row and the reversal inherits its tier. The locked capacity fold aggregates every refund, credit note, and terminal lost dispute across event classes; repeated/concurrent cumulative reversal cannot exceed original net basis. An internal compensating-credit refund is different: on its ledger event date it reverses the exact prior debit's recognised pack units and re-defers those source-basis portions onto the refund lot for one later re-consumption/expiry. Weekly reports are append-only versions keyed by `(utc_week, tier, as_of_version)`: a late projector input emits a new version for its effective week, labels it `revised_at/as_of`, and preserves the former version for audit. An open dispute marks every latest week/tier version containing its linked receipt/recognition allocations `withheld_open_dispute` until a terminal win/loss appends replacement versions. Prior-week revision, same-time tie, repeated partial recognised+deferred, multi-tier, multi-lot, replay, out-of-order, and concurrent cross-class reversal mutations must redden.

Stripe cash refunds, credit notes, and lost disputes do not mutate `credit_ledger`, claw back a pack lot, or change subscription entitlement at launch. Any still-spendable credits remain as an explicit customer-favouring policy; the revenue reversal and later model cost can make model-spend gross margin negative, and the dashboard reports that result when otherwise complete. A platform admin may use only the separately authorised adjustment action, never an implicit projector clawback. Tests cover a cash-refunded unconsumed pack that remains spendable, no hidden ledger row, and exact negative/withheld margin behavior.

Recognition is one append-only, idempotent projection with deterministic as-of derivation, not mutable totals. Every balance-affecting credit-ledger transaction in the closed disposition below, plus every Stripe receipt/reversal transaction, appends a uniquely keyed projector input; a leased worker claims them with a durable cursor, records per-input completion, and resumes after crashes without duplicating allocation. Lazy credit expiry must first materialise one uniquely identified expiry event in the same balance transaction; the projector never infers expiry merely from wall-clock reads. Allocation keys name source Stripe event/business identity, credit lot, ledger event, amount, UTC recognition date, and resolved tier. Subscription invoice-line revenue uses the server price-to-tier mapping effective for that service period. Pack/top-up consumed revenue uses the debit/generation's immutable tier-at-call; remaining breakage uses the tier recorded on the lot at purchase. A reversal inherits the original recognised row's tier. Missing or conflicting tier mappings quarantine the allocation and withhold affected grains. Multi-lot allocation follows the ledger's authoritative lot fold; integer micro-USD rounding assigns remainder deterministically to the last eligible unit/day. Pause-shifted expiry delays breakage. Refunds after recognition append reversals against the exact recognised rows; they never rewrite history. USD-only launch rows can enter the launch metric; other currencies are retained/quarantined separately and never summed.

The recognition projector consumes a compile-closed disposition for every `credit_ledger` kind/sign; no balance-affecting row is invisible:

| Ledger event | Recognition disposition |
|---|---|
| subscription `grant` | create a zero-pack-basis lot; subscription cash revenue remains on its invoice-line service-period schedule |
| purchased `pack` | attach the exact deferred Stripe PaymentIntent basis and purchase-tier mapping to the lot; missing/duplicate basis quarantines |
| `debit` | replay the authoritative lot allocation; recognise only pack-basis units at immutable generation tier-at-call |
| compensating credit `refund` | require original debit identity; append reversals of that debit's exact recognised pack allocations for restored units and attach those source-basis portions to the refund lot so later debit/expiry recognises them once; grant/adjust-funded units retain zero basis |
| positive `adjust` | create a zero-revenue-basis lot with mandatory bounded admin reason/identity |
| negative `adjust` | replay the lot fold for balance only; any touched pack basis becomes `finance_review_required` and withholds the affected grain because administrative clawback is not assumed to satisfy a paid performance obligation. Zero-basis units remain zero. Recognition requires a later owner/finance-approved closed reason-to-disposition decision and gated change |
| `expiry` | recognise only the remaining pack basis at the source lot's recorded purchase tier; zero-basis remainder produces no revenue |

Stripe cash refunds/credit notes remain C4 webhook reversals and are distinct from ledger compensating-credit refunds. Multi-lot, partial refund, refund-then-reconsume/expire, repeated/concurrent input, adjustment, and cash-reversal interaction tests prove every original basis unit is deferred, recognised, or reversed exactly once.

### C5 — complete-or-withheld dashboard

The only launch margin is **model-spend gross margin** at UTC week × resolved tier, with optional workspace drill-down under platform-admin authority. Revenue comes only from C4 recognised USD rows. Before every tenant provider HTTP attempt, append an immutable `tenant_model_cost_claim` keyed by attempt id + HTTP sequence, with workspace pseudonym, UTC day, tier-at-call, exact model/service class, price-snapshot version, and `unresolved` cost sentinel; it commits before network bytes leave. The first sequence creates the claim in the transaction that moves the generation attempt to `vendor_started`; every rewrite, scorer, or later sequence creates its own durable claim under the already-started attempt without repeating that state transition. A sole `finalizeTenantModelCost` authority appends the resolution from the authenticated provider response's complete input/output/cache usage counters plus the server-selected model/service class and immutable effective price snapshot. It reuses/extends the existing bigint nano-USD-to-micro-USD ceiling helper for every input/output/cache/service category; nearest/truncate is forbidden, and any nonzero unpriced category remains `unknown`, never estimated. A retained daily projection folds every claim and at most one resolution before detail deletion. This is final actual-usage × recorded-price cost, not a claim of invoice reconciliation; launch evidence cross-checks aggregate provider billing and disables margin on unexplained variance. A process crash between claim/network or before `model_usage` therefore leaves a conservative unresolved population member and withholds the week until the sole reconciliation authority proves the outcome. Historic weeks that cannot be reconstructed from surviving monthly rollups are permanently `withheld_incomplete`, never apportioned. System spend, Stripe fees, discounts not already reflected in `amount_excluding_tax`, affiliate/referral cost, support, tax, and other overhead are not allocated; therefore “contribution margin” and “after-overhead margin” are `not_defined_for_launch` and never displayed as values.

The Anthropic SDK is configured with `maxRetries = 0` for every launch path. First draft, planned rewrite, and scorer are distinct explicit call sequences, each with its own claim/finalisation; transport/status failures do not trigger a hidden retry. Any future retry loop must be explicit, deadline-bounded, claim every physical HTTP sequence before dispatch, and re-pass the billing/spend gate. A mutation that restores SDK retry or moves claim after dispatch must redden.

For each grain show:

- recognised complete USD revenue and its row count;
- final-actual tenant model cost and call count;
- unknown/unresolved cost call count and revenue event/amount count;
- system overhead known/unknown separately;
- a named completeness state.

The closed finance-source registry is exactly the five C4 Stripe receipt/reversal/dispute classes, every uniquely keyed C4 credit-ledger projector input due by the report `as_of`/cursor (grant, pack, debit, compensating refund, positive/negative adjust, expiry), and every tenant provider-HTTP cost claim in the grain; `model_usage` is evidence for cost resolution, not the population boundary. Adding a writer/type without registry coverage fails CI. A grain is `complete` only when the projector watermark covers every due ledger input; each has exactly one recorded completion disposition (`allocation | zero_basis | re_deferred | finance_review_required | quarantine`) and every non-complete disposition withholds; every Stripe population member is resolved in USD; every cost claim has one final actual-usage × recorded-price resolution; the retained daily projection covers the whole week; every revenue allocation has the exact tier rule above; and there is no unmatched/open-dispute/out-of-order/quarantined/stuck input. Then `model_spend_gross_margin_usd = recognised_revenue_usd - final_actual_tenant_model_cost_usd`; if revenue is positive, `model_spend_gross_margin_pct = margin_usd / recognised_revenue_usd × 100`, otherwise the percentage is `unavailable_nonpositive_revenue` with exact `zero_revenue` or `negative_revenue` reason. Any missing condition yields `withheld_incomplete` with exact missing counts/types. No partial number, estimate, range, or dash interpreted as zero is labelled margin. Contribution and after-overhead values remain unavailable by definition. Omitted/stuck/refund/adjust projector-input mutations must redden. The PRD target is a target; fixtures cannot prove it.

### C6 — source management and sole shared-framework curation transition

Trend-source administration may enable/disable or configure only the compile-closed `youtube | submitted` adapter registry already owned by `@respin/trends`; platform admin cannot register arbitrary URLs, scrapers, or runtime adapter names. A third adapter requires code, an official/licensed-surface and retention decision, source-rights/provenance mapping, security/compliance tests, and a fresh full compliance gate.

One platform-admin server transition owns approve/edit/reject/merge. Candidate evidence must be readable, originate only from the shared-analysis path, and resolve server-side to an active rights-basis record with issuer, consent/license evidence identity, issued/verified time, optional expiry, revocation state, permitted use, and source attribution. A public URL or `rightsScope` enum alone is never authority. The migration binds every shared trend item, transcript, autopsy, framework source link, and public-autopsy projection to a versioned rights-basis id. It backfills only existing rows whose `consentEvidenceId` and source record verify; every other legacy row becomes `rights_review_required` and inactive. One `resolveCurrentRights` authority is mandatory for feed/autopsy reads, `spinReferenceForProfile`, curation, generation, and marketing/public-autopsy use. Before every terminal transition, rebuild the final candidate server-side and run the full mechanism-level content validator over name, beats, explanation, applicability, sources/evidence and merged fields. Any creator/profile/workspace id, voice rule, personal detail, transcript text, performance number/result/proposal, private framework, unapproved source, or inactive/undereferenceable rights basis blocks.

Approved shared frameworks preserve `workspace_id = owner_profile_id = NULL`, append an immutable version, name curator/time/source/right-basis versions, and never update an existing version. Merge appends a new target version plus immutable source links; reject preserves history. The rights-basis registry partitions personal issuer/subject/consent-evidence links from non-personal licence/source/status fields. Revocation, expiry, or related identity/profile/workspace deletion erases/pseudonymises the personal field set immediately and deactivates consent-derived authority; only a separately verified non-personal licence basis may remain active. The sole rights transition writer appends an immutable rights-status event and updates a rebuildable current-authorization projection; it never updates a framework version. That projection change immediately makes every mandatory reader withhold the item and remove readable links; no stale `rightsScope`, URL, feed, autopsy, or Spin reader remains authorising. New generation/marketing resolves `framework_version + current rights projection`, removes readable source links, and withholds any `rights_review_required` version until a curator attaches a new valid basis in a new version or retires it. Immutable history keeps only opaque basis version/status/source classification and remains mechanism-only/non-authorising. Curator/transition human ids and display fields null or irreversibly pseudonymise on identity deletion while non-identifying version/review facts remain. No curation action calls Performance Meta/promotion acceptance or changes a creator brain. Saturation changes use the same transition/validator. Cross-workspace private candidates are unreadable even to an allowlisted platform admin unless the shared-analysis record itself is the approved source.

Rights are a dispatch/commit authority, not a preliminary lookup. Every human/API physical generation call—first draft, rewrite, or scorer—that carries any shared framework takes the current-rights projection lock inside its durable provider-call claim transaction, re-resolves the exact framework and rights-basis versions, and refuses unless the required use is still active. The rights transition writer takes the same lock. If a call already in flight returns after revocation/expiry commits, settlement retains only cost/credit/gate facts and withholds/erases the candidate before any terminal presenter, replay, or cache can expose it. Every public-autopsy, marketing, SEO, or other product-controlled publication commit likewise takes that lock, requires an active non-personal `public_distribution` basis, and records the framework/rights versions plus cache epoch. Revocation/expiry atomically deauthorises the projection and advances that epoch; product-controlled cache/CDN invalidation is a journalled command whose unknown outcome withholds the route until reconciled, while every uncached read still resolves current rights. Initial/rewrite/scorer/publish races and a stale-cache mutation must redden.

When no active basis remains—whether consent or a non-personal licence expires, is revoked, or loses its related identity/profile/workspace—the rights transition immediately tombstones the underlying shared source payload and every linked Spin presentation. It immediately nulls/erases generation and idempotency source/autopsy ids plus readable title/URL/attribution links; historical presenters resolve current rights and return `source_no_longer_available`, never stale attribution or replay. The lifecycle receiver deletes raw transcript, source URL/identifier, public-autopsy payload, linkable derived autopsy/analysis/shared caches, and linked Spin output/idempotent terminal content no later than seven days; only content-free cost, debit, gate, outcome, and audit facts remain. It reconciles product-controlled external copies through 10b-1 and the independent residue probe scans every field class. A separately recorded legal/contractual retention disposition may block erasure only through the non-launch legal gate in R-122; the implementer cannot invent one. Consent-only material is internal and may never enter marketing, public-autopsy, SEO, or other publicly cacheable output. Public publication requires a separately verified active non-personal licence with explicit `public_distribution` use; uncontrolled downstream copies are disclosed as outside product erasure. Another currently active basis may keep the shared payload/output active. Ownerless framework history may retain only source-unreadable mechanism facts. Populated fixtures cover completed shared Spins followed by consent loss, sole-licence expiry/revocation, and related deletion, alongside survival under a separate active licence; mutations that preserve stale history/replay, merely hide readers without deleting residue, or publish consent-only material must redden.

### C7 — lifecycle in the same change

The append-only weekly `(utc_week, tier, as_of_version)` report rows are stored financial-chain projections, not an unregistered view: they use `exportProjector = none`, immediately pseudonymise any workspace drill-down link on workspace erasure, and follow the same whole-component seven-year eligibility/destructive-disabled rule as their revenue and cost inputs.

Invite/token, role/ownership/confirmation audit, adjustment audit, receipt/reversal/projector/allocation/provider-call-claim/daily-cost, rights-basis/status-event/current-projection/curation history, email-delivery and any idempotency table must pass 10b-1's row-class/field-set registry at creation. Secret hashes are excluded from every export with a reason. The exact export projectors are: `identity_self` includes the requester's own active memberships and active invites received at their matched email, but never a third party's sent-invite target; `workspace_owner` includes the current member roster and each active invite's target, role, and expiry, and a sent invite appears only while the requester still has current owner authority; `profile_creator` includes confirmation history with a safe actor presentation but no invite, seat, ownership, key, or administration audit. Only the received-identity and current-owner projectors may reveal the relevant active invite email. Terminal invite and membership outcomes appear only to the relevant identity or current workspace owner until their clock expires. Platform/internal audit, money idempotency, delivery metadata, and cross-member identifiers are excluded from user exports. Identity deletion immediately nulls or irreversibly pseudonymises every human actor/subject field set—including confirmation, membership/invite, key, adjustment, deletion, curation, generation/idempotency, and config-version actors—while preserving only role/action/time/outcome/business facts for the row's clock; product/migration author tokens remain and presenters render “Deleted member,” never a recoverable identity. Tenant provider-call claims, resolutions, and daily cost projections join the same pseudonymous whole financial component as their ledger/model-usage facts; human/profile/job links pseudonymise immediately, and connected-chain eligibility is the later of workspace closure/latest transaction plus seven years with destructive purge disabled pending legal/ledger review. Under R-122, invite digests and target email erase on accept/revoke/expiry/deletion, genuinely non-identifying invite/delivery outcome metadata expires at 90 days, and membership/ownership audit at one year. Ownerless mechanism-only curation history survives rights revocation but becomes non-authorising and source-unreadable. Populated deletion/export tests cover every table and field-set clock, config/curation/generation actors, and demoted/removed former-inviter access before merge.

## Derived budgets

| Bound | Derivation / authority |
|---|---|
| seat caps 1/1/1/3 | compiled launch maxima under REQ-A02/R-118; not editable config, change requires code + product/spend/tenancy gate |
| invite expiry 7 days | R-118 |
| shared Resend 80/day and 2,400/month; invites 60/day and 1,800/month | 80% total of cited free allowance, with security/account reserve established in 10b-1; code ceilings, runtime may tighten |
| adjustment expiry ≤12 months | R-120, aligned with the longest launch credit-lot lifetime |
| one/rolling-30d positive adjustment ≤ active Studio allowance | R-120; derived from the active config version rather than hardcoded credits |
| weekly model-spend gross-margin grain | REQ-G05 weekly operator review; exact source registry/formulas and daily retained cost projection fixed in C5 |
| financial connected-chain eligibility | R-122: later of workspace closure or latest linked transaction + 7 years; destructive purge disabled pending legal/ledger review |
| support-lookup audit 90 days | R-122; content-free, `exportProjector = none`, actor/target pseudonymise immediately on identity deletion |

## Deferral ledger

| Deferred item | Why it is not in 10b-2 | Receiver |
|---|---|---|
| workspace API keys and machine scope | requires the closed human capability and Studio entitlement produced here | 10c C1–C2 |
| Free/API abuse and deterministic disclosure | API/platform boundary does not exist yet | 10c C3–C5 |
| measured unit economics / PRD margin targets | fixtures prove arithmetic, not real economics | post-M6 evidence phase; dashboard remains complete-or-withheld |
| live Resend/Stripe and finance/legal sign-off | external accounts and professional judgement | M6 launch checklist; engineering may be complete while launch evidence remains blocked |

## Task sequence and handoffs

1. Build the closed capability registry, Google-only local-factor enrollment, exact platform support-lookup projection/audit/page, and full current-factory/action population; role/pause/deletion/last-owner tests first.
2. Add invite/seat authority by reusing 10b-1's auth-mail authority/budgets, plus confirmation authorship; register lifecycle in the same migration.
3. Fix original-debit refund identity and adjustment policy; expose platform-admin actions only after money tests pass.
4. Add webhook-owned receipt/reversal facts plus the separately claimed debit/expiry recognition projector and retained daily-cost projection; register lifecycle.
5. Add exact model-spend-gross-margin/withheld dashboard from the server projection; keep contribution/after-overhead undefined and prohibit client arithmetic.
6. Add closed source management, rights-basis authority, and the sole curation transition/validator/history; register lifecycle.
7. Run acceptance walks, current-tree gates and populate evidence; hand human capability registry and Studio entitlement authority to 10c.

## Expected files

- `respin/packages/db/src/with-workspace.ts`, profile/workspace capability files, membership/invite/curation schema/ops, next additive migration.
- `respin/packages/credits/src` refund/adjustment/receipt/recognition/model-cost/margin modules and Stripe webhook handlers.
- Auth local-factor enrollment action/UI, settings/team, exact-match platform-admin support/credit/revenue/curation pages/actions, confirmation-history presenter.
- Shared email-purpose adapters/config/receivers and lifecycle registry entries.
- Focused role, tenancy, money, webhook, recognition, curation, deletion/export and browser tests.

## Verification

### Focused checks

- Every real capability factory/action maps exactly once across discriminated tenant/platform/internal principals; all role × pause × deletion cells; no ordinal owner→platform-admin or platform-admin→tenant bypass; 10-minute server reauth boundary for every high-risk operation; Google-only 15-minute challenge/digest/rotation/link-only refusal then same-session password proof.
- Platform support lookup exact-key-only projection, closed fields/reason, forbidden content/secrets, 90-day audit and immediate actor/target pseudonymisation; tenant roles and broad/fuzzy searches refuse.
- Seat cap with active invites, downgrade, expiry/revoke, matching verified email, duplicate/concurrent acceptance, role/last-owner/transfer races.
- Resend ceilings/config clamp, idempotent resend, no token/content logs; receiver expiry.
- Refund capacity across legacy ref spellings and partial/concurrent refunds; adjustment reason/expiry/pause/deletion/idempotency/audit atomicity.
- Stripe same/different event ids for one object, checkout/PI convergence, out-of-order original/reversal, webhook rollback/redelivery, partial refund/credit note double-reversal prevention.
- Recognition claim/cursor/crash replay, materialised lazy expiry, service periods, daily remainder, multi-lot consumption, pause-shifted expiry, breakage, already-recognised reversal, currency quarantine.
- Closed finance-source and every-provider-HTTP-claim population; first/rewrite/scorer sequences, claim-before-network crashes, retained daily actual-cost projection, legacy-monthly weeks withheld, exact formula/nonpositive-revenue behavior (including cash reversals that make recognised revenue negative), estimated/unknown never final, contribution/after-overhead never rendered, and no client formula.
- Closed `youtube|submitted` administration; rights-basis resolve/expiry/revocation across every mandatory reader; same-lock current-rights recheck at every shared-framework first/rewrite/scorer claim and every public publication commit; post-dispatch revocation withholding and cache-epoch invalidation; revoked-consent raw/linkable payload erasure by day 7 versus independently licensed survival; cross-tenant/private/performance/personal-content injections; edit/merge revalidation, null ownership, immutable source-unreadable non-authorising history, non-promotion.
- Lifecycle/export/residue coverage for every new table.
- `typecheck`, `lint`, `db:check`, focused/live Postgres suites, canonical Docker/live zero-skip entry gate, `next build`.

### Acceptance walks

1. Studio owner invites a verified matching email; editor accepts, generates and logs a result, and is refused on billing/seat/deletion/API-key routes; viewer is read-only.
2. Two owners transfer/demote safely; last-owner removal/identity deletion refuses with remedy.
3. Google-only owner receives the bounded local-factor challenge, sets a password, proves it in the same session, then completes one high-risk owner action; replay/link-only/wrong-session attempts refuse.
4. Platform admin exact-matches one user/subscription for a closed support reason, sees only the pinned projection, and tenant/broad/private-content lookups refuse.
5. Platform admin performs one adjustment and one partial refund, retries both, and observes one ledger/audit effect each.
6. Replay/out-of-order Stripe fixtures produce one recognised economic event/reversal; a forced unknown cost or missing revenue link withholds margin.
7. Platform admin edits/merges a shared-analysis candidate; personal/performance injection refuses, accepted version stays ownerless, and no brain promotion occurs.
8. Delete populated profile/workspace fixtures and prove all new tables follow their registered lifecycle.

## Mutation and non-vacuity matrix

| Mutation | Must redden |
|---|---|
| Remove/new capability without registry rule | capability population |
| Let editor administer seats/billing/keys or owner curate | authority matrix |
| Permit last-owner demotion race | locked membership test |
| Stop counting active invite against seat cap | concurrent cap test |
| Accept mismatched/unverified email or reuse token | invite tests |
| Aggregate refunds by ref spelling instead of original debit | refund capacity test |
| Allow positive adjustment with no expiry or during deletion/pause | money policy tests |
| Write a receipt/reversal outside Stripe event transaction or future consumption inside it | rollback/redelivery and projector-boundary tests |
| Deduplicate only delivery id or only business id | dual-identity tests |
| Treat unknown cost/revenue as zero/show partial margin | withheld-state tests |
| Omit a first/rewrite/scorer provider-call claim, crash before usage insert, or treat estimated/unknown cost as final actual | closed finance-source/population tests |
| Apportion a legacy monthly rollup into a week | historical incomplete-grain test |
| Render contribution/after-overhead as a value | launch-metric vocabulary/presenter test |
| Add dynamic/scraper source adapter or trust a rights enum/public URL without active basis | source-registry/rights-authority tests |
| Dispatch any shared-framework call or publish/cache public material after its rights-version transition | initial/rewrite/scorer/publish race and stale-cache tests |
| Hide a revoked-consent source in readers but retain its transcript/autopsy/cache payload after day 7 | rights-loss lifecycle/residue tests |
| Skip final curation validation or assign shared owner | injection/constraint tests |
| Omit lifecycle entry/probe for a new table | 10b-1 gate |

**Population:** capabilities/actions are generated from real factories/routes; Stripe event/business cases enumerate every registered webhook type; recognition cases cover every ledger kind/sign, receipt, allocation, materialised expiry, compensating-credit refund, cash reversal, cursor and failure state; the finance-source registry enumerates every tenant provider-HTTP claim plus its zero-or-one resolution and every retained daily-cost projection member in each grain; curation scans every final field, source adapter, rights-basis state, and mandatory reader; lifecycle scans every new table/row class/field set. At least three mutations are planted by a non-author. Finance/legal correctness and email deliverability require named external evidence and are not inferred from unit tests.

## Rollout, rollback, budgets, and evidence

Use expand → backfill/audit → dual-compatible readers → enable invite/admin/revenue writers → enable dashboard. Run the legacy refund-link audit before constraints/callers. If ambiguous historical refunds or revenue objects exist, block the relevant action/report and remediate explicitly. Feature-flag invites, adjustments/refunds, revenue recognition, margin, and curation independently. Once append-only revenue/allocation rows exist, roll forward; do not delete/rewrite them on rollback.

Budgets: Resend free allowance 3,000/month and 100/day, product ceiling 2,400/month and 80/day; runtime may tighten. Stripe/Sentry/PostHog costs stay under existing agreements/10a ceilings; this slice authorises no purchase or tier upgrade. Record official source URLs/review date, formulas, migration/fresh-install/rollback results, population/mutation results, browser/operator walks, deletion coverage and reviewer verdicts.

## Done when

- Closed capability matrix, last-owner/transfer rules, invite/seat flow, and confirmation authorship pass.
- Adjustment/refund first callers are safe, idempotent, audited, and lifecycle-covered.
- Revenue dual identity, replay-safe recognition/reversals, retained daily actual-cost population, and exact model-spend-margin/withheld states pass adversarial live-DB tests; contribution/after-overhead stay undefined.
- Source management remains on the compiled compliant adapters; curation is mechanism-only, ownerless, versioned, actively rights-gated, non-authorising after revocation, and cannot promote creator learning.
- Every new table passes 10b-1 registration/export/deletion/retention/residue tests.
- Full billing and tenancy gates PASS; full spin-compliance gate PASS for curation; learning-honesty gate PASS for curation non-promotion/margin claims; final code review PASS.
- 10c receives the closed capability registry, Studio entitlement source, and lifecycle registration contract.
