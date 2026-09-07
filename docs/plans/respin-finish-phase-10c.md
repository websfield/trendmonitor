# Slice 10c — Workspace-owned API, abuse closure, disclosure, and launch truth

**Codebase review:** [`../progress/respin-finish/10-codebase-review.md`](../progress/respin-finish/10-codebase-review.md)

**Decision authority:** owner-recorded R-2, owner-approved R-117–R-121, and reversible build-plan defaults R-122/R-123 in [`../initial/decisions.md`](../initial/decisions.md)

**Depends on:** 10a's real Spin/system-spend/observability contracts, 10b-1's executable lifecycle gate, and 10b-2's human capability registry plus authoritative Studio entitlement. Every new key/idempotency/audit/counter table registers lifecycle in the same change.

## A creator can…

**As a Studio owner, create a one-time-displayed workspace API key, use a clean-room example to generate through a named workspace profile with the same credits, gates, idempotency, and terminal refusal semantics as the UI, rotate/revoke it, and receive current platform disclosure guidance or an explicit stale-policy fallback.**

## A visitor can…

**Read launch pages, FAQ, privacy, pricing, API documentation, and support paths whose claims match the shipped product and whose Free/demo access cannot exceed compiled abuse and spend ceilings.**

## Least confident

Platform policies change outside this repository. The registry can make staleness and sources explicit, but it cannot guarantee policy correctness after review; the 30-day review SLA and stale fallback are therefore launch operations, not decorative metadata.

## Scope and non-goals

This slice owns the versioned Studio generation API, workspace-owned key lifecycle/machine scope, exact UI/API generation parity, Free/API abuse closure, deterministic platform disclosure, API/support/FAQ/public claim review, and final M6 launch evidence.

It does **not** add analytics connectors, API administration/billing/brain/result/deletion capabilities, auto-posting, content scraping, generic demo generation, streaming, guaranteed performance, or a silent retry after ambiguous vendor work. It does not turn `ALMOST` Phase 8/9 or pilot targets into complete evidence.

## Ownership

One `respin-engineer` owns platform registry, key/machine-scope, shared generation façade, API, abuse, lifecycle and public-copy changes in ordered stages. Full billing, tenancy, spin-compliance and learning-honesty reviewers inspect the stable slice; security, accessibility and outbound-truth reviews are added for their triggered surfaces, followed by final code review.

## Pinned contracts

### C1 — workspace-owned API key and machine-principal cage

Only a current owner with recent reauthentication and authoritative Studio entitlement may create/rotate/revoke/list keys. A key belongs to one workspace, not the issuer, and has only `generation:write`. It has a random public key id/prefix plus at least 256 bits of secret entropy; store only `HMAC-SHA256(serverPepperVersion, secret)` (or a reviewed equivalent), compare constant-time, display plaintext once, and never log/export the digest or secret. Mandatory expiry is at most 90 days; rotation can overlap for at most 24 hours and revocation is immediate.

Each request passes one verifier/mint transaction: parse key id/secret → constant-time verify digest/version/status/expiry → check workspace not tombstoned → resolve current Studio billing state → validate named profile belongs to that workspace and is active → check closed API capability → mint branded `ApiProfileGenerationScope`. The scope carries key, workspace, profile, entitlement, and auth versions but is not continuing authority. The idempotency/attempt claim transaction takes the canonical key → workspace money/membership → profile lock order, rechecks every version/status/expiry/Studio entitlement/tombstone, then admits; key revocation, downgrade, and profile/workspace deletion take the same locks, so no claim can linearise after their commit. Before each later physical rewrite/scorer claim, recheck the same active key/tombstone state; already-dispatched work may only settle/refuse/debit under its original attempt and cannot start a new sequence. No caller supplies a workspace id accepted as authority. The type is distinct from session `ProfileScope`, contains no fabricated `userId`, and cannot be passed to general brain/result/profile-write capabilities. App/API code cannot construct or cast it outside the verifier module. Revoke/profile-delete/workspace-delete/downgrade races against attempt claim and physical dispatch are mandatory mutations.

Deleting a workspace immediately revokes all keys. Profile deletion makes requests for that profile refuse. Deleting/demoting the issuing user does not revoke a workspace-owned key if the workspace still has an owner. Downgrade/pause/unknown billing refuses generation but preserves key metadata for owner review. Compromise response is revoke/rotate plus content-free audit; no plaintext recovery.

### C2 — one API operation through the exact tenant authority

Launch surface:

```text
POST /api/v1/generations
Authorization: Bearer <workspace key>
Idempotency-Key: <required opaque key>
Content-Type: application/json
```

The strict request is discriminated by closed `mode` and names `profileId`, closed `platformId`, and that mode's versioned input schema; unknown keys/oversize/invalid Unicode refuse before work. `analyseAndSpin` additionally requires exactly one opaque `spinAutopsyId`; every non-Spin mode rejects it, and every request forbids caller-supplied hook/subject/structure/mechanism/transcript/reference projections. The shared service resolves the opaque id under the minted workspace/profile generation scope through 10b-2's mandatory `resolveCurrentRights`/`spinReferenceForProfile` authority—not `rightsScope`, URL, or stale stored status—then accepts only its two trusted projections and includes the id, immutable version, and current rights-basis version in the canonical idempotency hash. For every mode, any server-selected shared framework resolves to one exact immutable framework version plus current rights-basis version; neither caller nor a stale eligibility flag may choose one. Only modes allowed by current Studio config enter. The server derives workspace, entitlement, profile, brain activation, config/pricing, reference, shared framework, and credit cost.

Extract one generation-only authority port consumed by the high-level `@respin/credits` tenant generation service: `HumanProfileGenerationScope | ApiProfileGenerationScope`. The human mint adapts a session `ProfileScope` only after the closed human registry grants `generate`; the machine mint comes only from the key verifier. The shared service records an actor discriminant `{ kind: "human", userId } | { kind: "api_key", keyId }` for audit/idempotency without pretending a machine is a user. A human actor id is a separate lifecycle field set: identity deletion immediately nulls or irreversibly pseudonymises it and presenters show “Deleted member,” while the shared workspace generation/output remains; the workspace-owned API-key actor follows key lifecycle. Neither principal can be widened or passed to ordinary DB write capabilities. UI and API call this exact service and must not call raw DB capabilities, Modes provider functions, ledger, or model directly. Therefore both inherit one attempt/idempotency claim, balance/pause/tier/concurrency checks, append-only `model_usage`, Kill Test/hard rules/traceability, Spin trusted-reference and similarity gates, one rewrite, terminal settlement/refusal, and one debit.

Idempotency identity is `(key_id, workspace_id, profile_id, idempotency_key)` plus `HMAC-SHA256(requestPepperVersion, canonicalRequestBytes)`, never an unkeyed/guessable content hash. The digest/version is excluded from export/logs. Rotation retains the prior pepper only for the same active-key + 24-hour replay tail, computes current/prior candidates constant-time, and erases the retired pepper after every covered idempotency row expires; missing/unknown versions fail closed. Identical retry returns the same terminal response without another vendor sequence/debit. Same key with a different profile/body/version refuses conflict. An outbound-started ambiguous crash is `recovery_required`; no automatic call. Failed/near-copy candidates never appear in response bodies, error details, idempotency replay, audit, logs, or telemetry.

The versioned response is a discriminated terminal union. Accepted output includes exact generation id, mode, platform id, original/reference attribution when applicable, structured content, weakest point, `[check]` markers, gate status and deterministic disclosure object. Refusal contains stable code, safe remedy and idempotency identity; no withheld candidate text. UI and API presenters consume the same settled domain result, so parity is structural rather than two copied requirement lists.

For human and API generation alike, every first-draft/rewrite/scorer physical-call claim that carries a shared framework—including Spin's reference/autopsy—locks and rechecks the current rights projection and exact framework/basis versions recorded on the attempt. Rights revocation/expiry takes the same lock; no later sequence can start after its commit. If an already-dispatched call returns after authority ended, the service withholds and erases the candidate under the rights-loss lifecycle, settles only its cost/credit outcome, and returns the safe terminal refusal. Revocation/expiry races against non-Spin and Spin initial, rewrite, and scorer dispatch are mandatory mutations. Public/marketing publication uses 10b-2's same-lock `public_distribution` commit and cache-epoch invalidation contract; no API/UI presenter may bypass it.

### C3 — Free/API abuse without a second money authority

Enumerate all vendor-call entrypoints from imports/registered adapters. Tenant UI and API enter the tenant credit/usage service; Sample Spin/autopsy enter 10a's one global system-spend service. One closed admission registry maps each call site to its authority, concurrency class, maximum input/output/deadline, and retry policy. Launch Anthropic clients use SDK `maxRetries = 0`; a planned rewrite/scorer is a separately claimed call, never a hidden retry. An unregistered call site, SDK retry, or physical HTTP dispatch without its durable cost/system-spend claim fails CI.

Free requires verified email and applies R-123's DB-atomic 10 admitted requests per account and workspace per rolling 60 minutes plus existing workspace concurrency 2 and existing per-profile 10-attempt/$1 uncharged exposure per rolling 60 minutes. API applies 60 admitted requests per key and 120 per workspace per rolling 60 minutes, at most 4 concurrent calls per key inside the existing Studio workspace concurrency 8, Studio entitlement, credits, and the provider emergency breaker. IP HMAC remains only where canonical IP is a justified public-abuse signal; raw IP is never added to API/tenant records. Counters have compiled ceilings, config can tighten, and 10b-1 receivers expire them independently of traffic.

The emergency breaker is exact: a workspace refuses new work once its unresolved/recovery-required attempt count reaches that tier's concurrency; all tenant generation refuses when 8 unresolved/recovery-required attempts exist provider-wide in the preceding 24 hours. It is a count-based admission stop, not a mutable balance or duplicate ledger. Admission records two independent states on the lifecycle-covered attempt before dispatch: `credit_hold`, equal to the server-derived operation debit from the immutable active config, and `cost_exposure_hold`, equal to the sum across every permitted physical call sequence of registry maximum input/output/cache tokens × its immutable price snapshot, using the same bigint nano-USD-to-micro-USD ceiling helper as final cost. A refusal before provider work releases both. A settled usable generation consumes the normal credit debit and replaces cost exposure with final usage-priced cost. A refusal/failure/recovery outcome that delivers no usable generation releases the tenant credit hold—no operator can invent a debit—but each outbound-started call keeps its cost exposure unknown/conservative until provider-authenticated usage or no-billable-work evidence resolves it. `recovery_required` remains terminal for execution and continues to count in the breaker while unresolved. One idempotent `reconcileGenerationCapacity` authority can only apply those evidence-driven transitions, appends content-free evidence identity/reason, never calls the provider for generation, and never silently times out an unknown cost. Unresolved cost holds, claims, and reconciliation facts join the pseudonymous financial chain and cannot expire under the generic one-year attempt-metadata clock; resolved nonfinancial control metadata may follow that clock. Every workspace/provider counter reads the separate states. Limit errors reveal no tenant/key/bucket existence and include retry timing only when safe. Review limits after 200 API attempts, any breaker trip, provider retry-policy change, or tier-concurrency change.

Under the existing workspace money lock, admission derives balance from the ledger, subtracts the sum of live `credit_hold` rows, checks the account/workspace/key velocity counters and both breakers, and atomically inserts the attempt plus both holds before any dispatch. Concurrent requests therefore cannot reserve the same credits. Successful settlement appends the normal debit and closes the credit hold in that same money transaction; refusal release also closes it atomically, while cost exposure may resolve separately. A concurrent double-reservation or debit-without-hold-close mutation must redden.

### C4 — closed platform registry and deterministic disclosure

Create one compile-closed `PlatformId` registry used by input schemas, Studio controls, API docs, stored presentation and disclosure presenter. Launch ids match the current supported UI choices; no free-form platform string is accepted for new writes. Existing stored strings map exact known legacy values; unknown legacy values remain readable with generic stale/unknown guidance and are never rewritten silently.

Each registry entry includes official source URL, jurisdiction-neutral policy summary, reviewed-at, next-review-at (≤30 days), conditions for disclosure, static conservative guidance, owner, and registry version. Initial sources are official [YouTube disclosure guidance](https://support.google.com/youtube/answer/14328491?hl=en-au), [TikTok AI-generated-content guidance](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content), and [Meta AI-label policy](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/). Model-authored disclosure is ignored/replaced; a prompt cannot alter the registry decision. The presenter always says policy can change and this is not legal advice.

If the selected policy is missing, invalid, or past `nextReviewAt`, output generation may still settle but the disclosure object is `policy_check_required`, links the official platform policy where known, and withholds a definitive yes/no instruction. It never recommends concealment, metadata stripping, enforcement evasion, or false authorship. Registry freshness is an operator health check and launch alert.

### C5 — public/API truth and lifecycle

R-2 is implemented as one pure, browser-safe `@respin/config/brand` module—not a database/runtime-config row—with a closed `ProductIdentity` union: the checked-in placeholder is exactly `{ status: "placeholder", displayName: "Respin", canonicalOrigin: null, decisionId: "R-2" }`; a final identity is exactly `{ status: "final", displayName, canonicalOrigin: "https://<host>", decisionId: "R-<recorded-owner-decision>" }`. Module-load/build assertions reject blank or surrounding-whitespace names, non-HTTPS origins, credentials/port/path/query/fragment, a missing decision id, and a final identity still equal to the placeholder tuple. `app/layout.tsx`, every end-user page/error/email/support string, OpenAPI/SEO/doc generator, and Stripe setup consume this module. Internal package/import identifiers, historical decision prose, database names, and routes may retain the repository codename; no public presenter may. A closed public-enablement assertion shared by build/start/operator preflight permits marketing/API/OpenAPI/public docs/SEO/affiliate flags only for `status = final` and the exact recorded origin.

Stripe object identity is independent of the mutable display name: `setup.ts` uses the immutable metadata key `respin_product_key=creator_content_engine_v1`, while product display name and every price nickname derive from `ProductIdentity.displayName`. Before any write, it auto-paginates products, loads every launch lookup-key price, and constructs one adoption plan. Exactly one metadata-keyed product is accepted only when every existing launch price belongs to it. If no keyed product exists, exactly one legacy product may be adopted automatically only when all existing launch prices converge on that same product id. Zero launch prices never prove absence of a legacy product and therefore cause a no-write refusal unless the operator supplies exactly one explicit mode: `--adopt-product-id=<existing-id>` (which must identify one unkeyed product) or `--create-new-product` (an attestation that no legacy product is being adopted). Split products, multiple keyed products, an unknown/already-foreign adoption id, both/neither zero-price modes, missing/expanded-product ambiguity, or any keyed/lookup conflict refuses before all writes. A create call includes the immutable key atomically; an adopt call attaches it before later display/price work, so a crash after either call is discoverable on replay. One explicit operator run may then create/adopt/update the product, update its display name and mutable existing price nicknames, and create missing prices idempotently; it never finds a product by name or creates a duplicate after partial failure. Placeholder identity is allowed only for internal provisioning, and rerunning after the owner records the final identity performs the deterministic rename. Planning authorises no Stripe write: the setup command remains an explicit operator side effect, and its selected mode, transcript/product/price ids plus a second no-op run are launch evidence.

Run a claim-by-claim review over landing, pricing, FAQ, terms/privacy, changelog, API docs/example, support/error copy, metadata, and the binding source canon `docs/initial/{PRD,build-plan,tech-spec,gtm}.md`. Bind product/pricing/allowance numbers to versioned config. Any canon/public contradiction blocks the launch ledger. Required truths:

- performance learning is verified-only and unavailable until a real connector exists;
- Sample Spin is fictional, zero visitor credits but metered/limited, and not performance proof;
- the visitor idea is sent to the configured model processor solely to produce the Sample Spin; the endpoint retains no idea/output; the dedicated versioned IP HMAC/counter is a pseudonymous abuse control erased within 24 hours; content-free per-HTTP-call system metering remains under its separately registered financial/system lifecycle clock and contains no IP HMAC or content;
- outputs are assistance with weakest points, not guarantees;
- latency/streaming targets are not claimed;
- deletion says immediate tombstone, live erasure by day 7 and capable backups gone by day 28 only after 10b-1 evidence. It distinguishes scopes: identity deletion revokes global sessions/access but preserves shared workspace/profile work under remaining owners; profile/workspace deletion is owner-only; workspace deletion does not revoke user-global sessions; cancelling a reversible request never resurrects revoked invites, keys, sessions, or jobs; deletion itself creates no automatic refund;
- governed creator content/backups are distinct from R-122's minimum pseudonymous financial/system/audit chains; privacy/terms state exact clocks, disabled financial-purge/legal-review status, and that no product legal hold can defer deletion at launch—any real duty blocks the affected deletion/public launch until a separate counsel-backed gate—without implying complete record erasure at day 28;
- subprocessors name the configured LLM, Stripe, Resend, Sentry, PostHog, and configured authentication providers including Google, with purposes/data classes/regions; the LLM's standard 30-day input/output expiry and exceptional policy/legal retention, Stripe redaction/legal retention, Resend 30-day message/log retention, provider-grant revocation/user-managed boundary, and any account-specific ZDR evidence are stated from 10b-1's reviewed external-copy registry;
- streamed downloads, user devices, screenshots/reposts, and uncontrolled public/browser/search caches are `user_controlled` and are explicitly outside the product's deletion guarantee; consent-only material is never publicly published, and a public autopsy/marketing asset requires independently verified non-personal `public_distribution` rights;
- API is Studio generation-only and uses workspace-owned expiring keys;
- platform guidance is dated and can require checking the official policy;
- unit-economics/pilot targets are not reported as achieved.

Key, audit, idempotency, capacity-reconciliation, and Free/account/workspace/key counter tables register export/deletion/revocation/retention/executor/probe with 10b-1 in the same migration. The platform policy registry and review history are checked-in versioned code/data reviewed through source control, not a database table; freshness health derives from those immutable versions and creates no retained policy-review row. The API-key row uses `exportProjector = workspace_owner`: only its safe prefix, name, status, and timestamps enter that owner export. Secret digests, request HMACs, and pepper versions are excluded from every export. Key/security audit, idempotency, capacity reconciliation, and every abuse-counter row use `exportProjector = none`; their operational status may be summarised by an authorised presenter but their retained rows are not creator export data. Under R-122, idempotency stores only keyed request HMAC + terminal object/refusal identity while the key is active and for 24 hours afterward; profile deletion immediately erases every profile-scoped idempotency row, request HMAC, and terminal link even when the workspace key remains active. Key digest erases after the same key-tail window (immediately on workspace erasure after revocation); content-free key/security audit expires 90 days after expiry/revocation/deletion. Ordinary abuse-counter expiry is 24 hours after bucket close, but identity deletion immediately erases account counters, workspace deletion erases workspace/key counters, and key revocation erases key counters; every path has an independent residue probe. Issuer, human generation actor, and other human audit ids null or irreversibly pseudonymise immediately on identity deletion without revoking a workspace-owned key or deleting shared output; presenters show “Deleted member.” Workspace deletion revokes keys first and no retained row can authorise later work.

## Derived budgets

| Bound | Derivation / authority |
|---|---|
| key expiry ≤90 days | R-118 |
| rotation overlap ≤24 hours | R-118; bounds two simultaneously valid secrets |
| idempotency/key digest tail 24 hours | R-122; terminal replay/overlap window, no output stored |
| key/security audit 90 days | R-122, content-free operational window |
| abuse counter 24 hours | R-122/R-117; traffic-independent receiver |
| platform review ≤30 days | R-121; stale fallback is mandatory after the deadline |
| Free velocity/concurrency | R-123: 10/account + 10/workspace/rolling hour; workspace concurrency 2; existing 10-attempt/$1 profile exposure |
| API velocity/concurrency | R-123: 60/key + 120/workspace/rolling hour; 4/key and 8/workspace concurrent |
| recovery breaker | R-123: tier-concurrency per workspace; 8 provider-wide unresolved attempts/24h |

## Deferral ledger

| Deferred item | Why it is not in 10c | Receiver |
|---|---|---|
| analytics connector / verified performance learning | explicitly post-pilot; no safe fixture/admin writer | post-M6 connector plan under R-115 and a fresh learning/tenancy/security gate |
| streaming / latency target | current provider path is buffered; unrelated to launch-contract integrity | future performance slice owning 8c-L1 |
| real pilot uplift, conversion, churn, CAC and margin-target evidence | requires real mature populations | post-M6 evidence phase; every public claim stays in pilot/unavailable until earned |
| policy legal opinion | deterministic registry provides operational guidance, not legal advice | M6 legal review; stale fallback remains active regardless |
| final product name and domain | R-2 still calls `Respin` a config-only placeholder and reserves the choice to the owner | implement the single-config/name-domain gate now; keep public marketing and public API/docs disabled until the owner records the replacement or explicitly confirms `Respin` plus the final domain |

### C6 — versioning and compatibility

`/api/v1` has checked-in OpenAPI generated from the authoritative strict schemas, error vocabulary and examples. Breaking response/request changes require `/v2`; additive optional fields require compatibility tests. The clean-room example pins endpoint version, content type, timeout, idempotency key and terminal-union handling. CORS is deny-by-default; browser keys are discouraged and no wildcard credentialed origin is enabled. Rate-limit/security headers and payload caps are server-owned.

## Task sequence and handoffs

1. Build closed platform registry/presenter and migrate UI platform choices; preserve legacy reads.
2. Add API key schema/verifier/machine scope and lifecycle coverage; prove no session/capability bypass.
3. Extract/reuse the one tenant generation service from both UI and API presenters; add strict v1 schema/idempotency storage and the same-lock rights-version recheck for every shared-framework physical call.
4. Add Free/API counters and closed provider-call admission inventory; add receivers and lifecycle coverage.
5. Generate OpenAPI/clean-room example and support/error documentation from authoritative types.
6. Implement R-2's pure `@respin/config/brand` identity and shared public-enablement assertion; migrate every user-facing consumer and make Stripe setup adopt/update by immutable product key before completing the claim-by-claim launch truth pass—including `docs/initial/gtm.md`, founder posts/case studies, affiliates, public autopsies, SEO and competitor pages—plus policy freshness health, budgets and operator runbooks. The unresolved placeholder may render only on internal/non-public surfaces; public marketing/API/docs flags stay off.
7. Run full current-tree checks, browser/API/abuse/deletion walks, external provisioning evidence, all specialist gates and final review.

## Expected files

- `respin/packages/db/src` API-key/idempotency/audit/counter schema/ops/scopes, next additive migration, lifecycle entries.
- `respin/packages/credits/src` shared tenant generation façade/admission registry without ledger duplication.
- `respin/packages/config/src/brand.ts`, its `./brand` package export and focused validation/public-enablement tests; `respin/app/layout.tsx` plus every public/end-user identity consumer.
- `respin/packages/credits/src/stripe/setup.ts` and focused Stripe setup tests for immutable-key discovery, legacy adoption, conflict refusal, deterministic rename/nicknames, partial-failure replay and second-run no-op.
- `respin/packages/modes/src` closed platform type/compatibility mapping if that package remains the correct pure owner; deterministic policy presenter in a server/domain package.
- `respin/app/api/v1/generations/route.ts`, settings/API-key actions/pages, Studio platform controls.
- OpenAPI, clean-room examples, FAQ/legal/privacy/changelog/support/marketing copy, health/runbooks.
- Focused API tenancy, parity, compliance, idempotency, abuse, policy, lifecycle, public-claims and browser tests.

## Verification

### Focused checks

- Key entropy/hash/constant-time path, one-time display, owner/10-minute server reauth/Studio gates, expiry/overlap/revoke/compromise, issuer deletion/demotion, workspace/profile deletion, downgrade/pause/unknown state; request-HMAC low-entropy corpus and pepper rotation/tail/erasure.
- Cross-workspace/profile ids, guessed prefix, forged/cast scope, direct raw capability imports, internal/admin capability attempts.
- UI/API same input fixture produces the same domain gate/settlement contract; duplicate/concurrent/mismatched idempotency; one provider sequence/debit; crash/recovery-required.
- Spin forced-near-copy on every output unit; subject/hook/structure changes; one rewrite then refusal; original/reference attribution; `[check]`, weakest point, no guarantees/concealment; no failed candidate in body/replay/storage/logs. Across every mode, shared-framework initial/rewrite/scorer claims recheck the exact current rights version under the transition lock; post-dispatch revocation withholds returned content.
- Every provider-call site is registered with exactly one money authority; Free/key/workspace/concurrency/unknown breaker boundaries and config-tightening tests.
- Platform wrong-id/missing/stale/future-date/source/registry-version cases; prompt attempts to override disclosure; concealment/evasion/false-authorship vocabulary; official-link fallback.
- GTM/outbound claims require per-claim shipped-surface, rights basis, official source/review date where external, evidence n/provenance where performance-related, fulfillment/config authority for offers, and explicit publish/withhold status.
- Product name/domain are read from the one pure typed brand module; invalid final tuples, hard-coded user-facing aliases, a placeholder-valued public build, origin mismatch, missing owner decision id, or public marketing/API/docs/SEO/affiliate enablement before the recorded R-2 decision fail closed. Internal identifiers and historical records are explicitly allowlisted, never silently rewritten.
- Stripe setup discovers by the immutable metadata key rather than name; multiple keyed products, split/foreign lookup-key products and ambiguous legacy state refuse before writes. The zero-price branch requires exactly one explicit create/adopt mode and validates an adoption id before writes. A legacy single-product adoption/rename preserves all price ids and lookup keys, derives every nickname from the brand module, survives failures immediately after keyed create/adopt and during later price work, and a second run performs no write.
- OpenAPI/schema/example agreement and v1 compatibility; payload/header/CORS/security limits.
- Lifecycle/export/residue/receiver coverage for every new table.
- `typecheck`, `lint`, `db:check`, focused/live Postgres suites, canonical Docker/live zero-skip entry gate, `next build`.

### Acceptance walks

1. Studio owner creates a key, copies it once, and a clean-room client settles one generation; identical retry returns the same result and balance changes once.
2. Invalid/expired/revoked keys and key/workspace/profile mismatch all return the same authentication refusal with no existence detail. Only after a valid key establishes workspace authority may non-Studio, paused, tombstoned, mode-disabled, or exhausted-credit states return their stable broad remedy codes; those codes expose no other workspace/profile/key fact. Editor/viewer status is irrelevant to a workspace-owned machine key and is covered separately by the human capability matrix.
3. API Spin forced near-copy never displays the candidate; compare its terminal result/gate evidence with the product UI contract.
4. Exhaust Free, per-key/workspace, concurrency and emergency limits; no path exceeds credits/system authority or auto-reissues ambiguous work.
5. Select each supported platform and one stale registry fixture; inspect deterministic source/date/guidance/fallback and prove the model cannot change it.
6. Delete a populated workspace and prove keys, idempotency, audit and counters follow registered lifecycle and cannot authorise later work.
7. Walk every public page/support path at 360/1440 px, keyboard-only, and run the outbound claim ledger.
8. With R-2 intentionally unresolved, prove internal preview remains reachable while public marketing/API/docs/SEO/affiliates refuse enablement; after a fixture owner decision, prove the exact configured name/origin appears consistently. Cover existing-price automatic adoption, zero-price explicit-id adoption, zero-price attested creation, ambiguous/missing/both mode refusal, and a crash immediately after keyed create/adopt before the first price; prove each replay converges on one product, the second successful setup run is a no-op, price ids/lookup keys are unchanged, and no old alias survives the public corpus.

## Mutation and non-vacuity matrix

| Mutation | Must redden |
|---|---|
| Bind key to issuer or fake session user | ownership/scope tests |
| Skip Studio/workspace/profile/deletion check | cross-boundary matrix |
| Expose/recover plaintext key or compare non-constant-time | key security tests/review |
| Let API call Modes/ledger/raw DB instead of shared service | import-closure/parity test |
| Ignore body/profile mismatch for idempotency | conflict/concurrency tests |
| Store an unkeyed request digest or lose prior-pepper replay/erasure | low-entropy/rotation lifecycle tests |
| Emit failed draft or retry recovery-required | response/storage/provider-count tests |
| Remove one API Spin gate/output unit | parity/forced-copy population |
| Let any non-Spin shared-framework call or public publication linearise after rights revocation, or serve a stale cache epoch | rights dispatch/publish race population |
| Add unregistered provider call or second spend counter | admission inventory |
| Allow config above compiled abuse ceiling | clamp tests |
| Accept free-form platform or model-authored policy | schema/presenter tests |
| Treat stale policy as definitive | stale fallback test |
| Omit lifecycle/probe for new key/counter table | 10b-1 gate |
| Retain account/workspace/key counters after their governing identity is erased/revoked | lifecycle residue tests |
| Publish “learns from your results,” founder/competitor efficacy, unfulfilled referral/price lock, unsourced external price, latency, or margin-success copy | outbound-claim ledger/forbidden claims |
| Present Sample Spin/fixture/pilot output as efficacy, success, uplift, or “mechanisms proven/that perform” | evidence-strength and performance-claim mutations |
| Hard-code `Respin`, enable a placeholder name/domain publicly, or let two config sources disagree | R-2 config-closure and public-enablement tests |
| Find a Stripe product by display name, infer creation from zero prices, remove the immutable metadata key from create/adopt, split lookup-key prices across products, or crash immediately after keyed create/adopt | Stripe setup discovery/mode/conflict/idempotent-replay tests |

**Population:** every app/API provider-call import, every key/auth state, all seven modes and each Spin output unit, every platform registry entry/legacy mapping, every public/support document plus `docs/initial/gtm.md` and each derived founder/case-study/affiliate/autopsy/SEO/comparison asset, and every new table. At least three mutations are planted by a non-author. Text quality, legal adequacy, real email/Stripe/Sentry delivery, pilot outcomes and production load remain named external evidence, not unit-test coverage.

## Rollout, rollback, budgets, and evidence

Deploy platform registry and shared façade before enabling keys. Add schema, run lifecycle audit, enable owner key management, then API for an internal workspace, then a small Studio cohort. Public marketing, public API access, OpenAPI publication, SEO, affiliates, and public docs remain disabled while R-2 is unresolved; they may enable only after an owner-recorded final name/domain is compiled through `@respin/config/brand`, the shared public-enablement assertion passes, Stripe setup's explicit operator transcript proves unique immutable-key adoption plus a second no-op run, and the stale-alias corpus scan is clean. Stripe rollback preserves the immutable key and adopted product/price ids; display-name rollback uses the prior checked-in identity and never creates another product. Key/API/Free/policy flags are independent. Revocation and lifecycle receivers remain enabled on rollback; once key/audit/idempotency rows exist, roll forward rather than dropping them. A stale policy automatically degrades guidance without disabling generation.

No new vendor purchase is authorised. API generation is tenant-credit metered; Sample Spin/autopsy use 10a's system ceiling. Sentry/PostHog/Resend remain under recorded free/product ceilings. Record exact official policy/pricing URLs and review dates, model/config/prompt/API/registry versions, call-site population, migration/fresh-install/rollback, clean-room transcript, one-debit evidence, abuse boundary results, deletion residue, accessibility/browser evidence, provisioning blocks, mutations and reviewer verdicts.

## Done when

- Workspace-owned key lifecycle and branded least-privilege machine scope pass every authority/deletion state.
- UI/API use one tenant generation authority and match terminal gate/settlement behavior for all modes, especially Spin.
- Every vendor call maps to one money authority and Free/API/demo limits fail closed without a competing ledger.
- Platform guidance is closed, deterministic, dated, source-linked and safely stale; model prose is non-authoritative.
- Every new table passes same-change lifecycle/export/retention/residue coverage.
- Public/API/support claims match current evidence and preserve all `ALMOST`, latency, pilot and margin residuals honestly.
- R-2 has one owner-recorded final name/domain in the pure typed brand module before any public marketing/API/docs/SEO/affiliate enablement; every user-facing consumer and Stripe nickname derives from it, Stripe has exactly one immutable-keyed product with unchanged price identities, and until then the fail-closed placeholder gate is proven while the implementation may still be engineering-complete internally.
- Full billing, tenancy, spin-compliance and learning-honesty gates PASS; security/accessibility/outbound-truth and final code review PASS.
- M6 is marked engineering-complete only after real browser/API/operator walks; external provisioning/legal/pilot evidence remains separately named.
