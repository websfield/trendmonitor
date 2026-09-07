# Slice 8c: Paste-transcript intake + the spin prompt — the slice-8 close-out

**Status (2026-09-03): in progress.** Owner-delegated decisions **R-96, R-97, R-98** recorded before the first edit. This card closes the reachability gap all five slice-8 reviewers named and the two owner questions the slice-8 report card surfaced.

## A creator can…
**Paste a third-party video's link and transcript, watch it get autopsied in the background, read the autopsy, and spin it into their own voice — paying once, in their own credits, for the autopsy — and be blocked when the spin comes out too close to the original.**

**Reachability:** this slice IS the reachability. Before it, `/trends` could only track a niche and show the designed empty feed. After it, the owner's pasted references are the first production producer of `trend_sources`, `trend_items`, `trend_transcripts` and `autopsy_cache_claims`, and `packages/trends`'s `submitted` adapter gets its first production caller. Live YouTube discovery (T-15) and Resend (T-16) remain deferred; this slice does not touch them.

## Least confident
That charging at paste and refunding on park (R-98) is the right money shape versus charging at completion. It is the only shape that is debit-in-transaction with a state change and refuses at zero before work, but it introduces the ledger's first compensating credit. Probe it first: the refund must be idempotent by claim id, creator-scoped, and impossible to reach twice.

## Decisions this card executes
- **R-96** — paste-transcript intake, reference-class end to end, no invented baseline, pasted items shown in their own section.
- **R-97** — the autopsy mechanism projection reaches the spin prompt; hook/subject/transcript never do; not in the traceability corpus.
- **R-98** — `creditCosts.autopsy` debited with the claim, paid tiers only, refund on park via an explicit idempotent settlement.

## Requirements

### Storage (migration 0026 — additive, expand-only)
- [ ] **R1:** `trend_items.baseline_state` enum `measured | unavailable`. `measured` keeps every existing baseline CHECK verbatim; `unavailable` requires `channel_median_recent_views`, `baseline_sample_size`, `baseline_observation_ids`, both window columns, `video_views`, `channel_id` and `outlier_ratio` all NULL **and** `rights_scope = 'profile_private'`. Existing rows are `measured`. `db:check` clean; forward/backward compatibility, expand/contract order, rollback (drop the column) and restore implications documented in the migration header; the registry's deletion cascade test still passes.
- [ ] **R2:** `trend_transcripts.reference_input_id` uuid, FK `onboarding_inputs(id)` ON DELETE CASCADE, UNIQUE, NOT NULL iff `provenance->>'kind' = 'creator_paste'`. A pasted transcript therefore cannot exist without its reference-class onboarding input, and deleting the input deletes the transcript.
- [ ] **R3:** `recordPrivateTrendItem` accepts a `baseline: "unavailable"` input (no views, no channel, no ratio) and refuses `unavailable` for shared rows; `recordPrivateTrendTranscript` takes `referenceInputId` and stamps `provenance.kind = "creator_paste"` with the source URL.
- [ ] **R4:** `intakePastedReference(db, scope, profileId, { sourceUrl, transcript, title?, niche? })` in `trends-storage.ts` runs in ONE transaction: `appendReferencePost` (slice 4's intake — `POST_CONTENT_MAX`, `REFERENCE_COUNT_MAX`, pause, role via the mint) → `createPrivateSubmittedTrendSource` (externalId = the normalised URL) → private item (`unavailable` baseline, `transcript_available` only after the transcript row exists) → transcript with `referenceInputId` → `claimPrivateAutopsyForSystem` (pending). Returns `{ referenceInputId, itemId, claimId, claimStatus, autopsyId }`. **Idempotent:** a second paste of the same URL + text by the same profile returns the existing rows and creates nothing (proven by a duplicate-submission test counting rows). A different transcript for the same URL is a second item under the same source.
- [ ] **R5:** `pastedReferencesForProfile(db, scope, profileId)` — the owner's private items with claim status (`pending` / `retrying n of 5` / `completed` + `autopsyId` / `parked`), title, source URL, `createdAt`, and — when completed — the same app-safe autopsy projection the feed returns. No transcript body, no provenance. Cross-profile attempt witnessed (sibling's pastes invisible; sibling's claim id refused).
- [ ] **R6:** `spinReferenceForProfile` additionally returns `mechanism: { hookMechanic, beats, ending, followTrigger }` (the canonical analysis fields the screen already shows); the gate fields (`hook`, `subjectTerms`, `structure`) are unchanged.
- [ ] **R7:** Export and deletion: the transcript's `referenceInputId` appears in the JSON export beside the transcript row; the registry entry for `trend_transcripts` names the FK; the cascade test covers `onboarding_inputs → trend_transcripts`.

### Money (billing — Full gates)
- [ ] **R8:** `respinCredits.submitPastedReference(scope, profileId, input)` in `@respin/credits`, in this order and no other: mint (viewer refused, `ProfileRoleError`) → tier `PAID_TIERS` only (`PastedReferenceTierError`, mapped in `billing-errors.ts` with copy that names the plan and does not sell it — the `profile_cap` precedent) → open pause refused → workspace lock → balance ≥ `creditCosts.autopsy` from the ACTIVE CONFIG DOCUMENT (refuse with the top-up code before any row is written) → `intakePastedReference` → `debitCredits({ refType: "autopsy_claim", refId: claimId, amount: creditCosts.autopsy })` unique per claim. Returns `{ …intake, creditsChargedNow, balanceAfter, configVersion }`. A paste that lands on an existing claim charges **0** (idempotency witnessed by a double submission with one debit row). `UNPROBED_CREDIT_COST_KEYS.autopsy`'s reason is rewritten: the key now has a reader (pasted references); scheduled shared autopsies remain system overhead; `autopsy` is still not an included-build purpose (R-90 partition test unchanged).
- [ ] **R9:** `respinCredits.settleParkedAutopsies(scope, profileId)` — for each of the profile's `parked` claims with an `autopsy_claim` debit and no `autopsy_refund` credit, append ONE compensating credit (`refType: "autopsy_refund"`, `refId: claimId`, unique) under the workspace lock. Idempotent (second call appends nothing); never refunds a non-parked claim; never touches another profile's claims; the balance after equals the balance before the paste. Called explicitly by the trends page (R12) and named in its docblock as the one write the page makes.
- [ ] **R10:** Every number cites its source: the price is `content.creditCosts.autopsy` (config); the attempt ceiling is `AUTOPSY_ATTEMPT_CODE_CEILING` (R-93); no literal.

### The spin prompt (compliance)
- [ ] **R11:** `GenerationContext.reference?: { mechanism: {...} }`; `generate.ts` sets it from R6 for `analyseAndSpin` only; `assemble.ts`'s `analyseAndSpin` bundle renders a block headed as another creator's mechanism to adapt and never quote (hook mechanic, beats, ending, follow trigger), keeps `inputLabel` as the creator's own material, and never renders `hook`, `subjectTerms` or any transcript. **Not in the traceability corpus:** a witness plants a number that appears only in the mechanism text and asserts the output's use of it is refused as untraced. The similarity gate is untouched (its fixtures still pass).
- [ ] **R12 (page):** `/trends` calls `settleParkedAutopsies` before reading `pastedReferencesForProfile`, and passes the pasted section to the view.

### UI (`/trends`)
- [ ] **R13:** A "Paste a reference" panel: URL (required, `http(s)` only), title (optional, ≤ 120 code points), transcript (required; the limit shown is `POST_CONTENT_MAX` and the live count is shown), niche (optional, from the profile's tracked niches). The cost line reads the config price through the facade ("Costs N credits — the autopsy runs in the background, usually within a few minutes") and the current balance; no number is typed in a screen file. Free tier: the panel renders in a disabled state whose copy names the plan and does not sell it. Viewer seat: refused by the server with the `profile_role` copy.
- [ ] **R14:** A "Your pasted references" section, owner-only, newest first, with designed states: **Queued for autopsy** · **Retrying (attempt n of 5)** · **Ready** (the existing analysed-item card with the side-by-side spin, and "No channel baseline — pasted reference" where the ratio block would be) · **Could not be completed — N credits returned** (parked). The source URL renders as a link with `rel="noopener noreferrer"`; the original is clearly the other creator's work.
- [ ] **R15:** DESIGN.md tokens only; 360 px and 1440 px; keyboard-only; visible focus; a live region announces the paste result; reduced motion; every refusal code the action can return has copy in `billing-errors.ts` (the completeness scan stays green); the claims-canon sweep covers every new rendered state; no performance claim, no guarantee, no apology for the gate working.

### Worker (verify, do not rebuild)
- [ ] **R16:** A private claim created by R4 is listed by `systemAutopsyQueueCandidates`, processed with its owner absent from every system row (existing witness), completes into a `profile_private` autopsy the owner's R5 reader returns, and — when the analysis fails the mechanism-level check five times — parks, which R9 then refunds. Docker-live end to end with a scripted vendor.

## Left to the developer
- The URL normalisation rule for `externalId` (scheme + host + path, tracking parameters stripped) — state it in the writer and test it.
- Whether the niche select is a `<select>` or radio group — DESIGN.md decides.

## Files — expected surface, not a contract
| File | Action |
|---|---|
| `respin/packages/db/migrations/0026_*.sql` + snapshot | Create (drizzle-generated; hand edits marked) |
| `respin/packages/db/src/{trends-schema,trends-storage,creator-data-registry,with-workspace,index,app-server}.ts` | Modify |
| `respin/packages/db/tests/{trends-storage,export,profile-scope,brain-schema}.test.ts` + a new `pasted-reference.test.ts` | Modify / create |
| `respin/packages/credits/src/{app-server,index,pasted-reference.ts,errors.ts,included-build.ts}` + tests | Modify / create |
| `respin/packages/modes/src/{assemble,traceability}.ts` + tests; `respin/packages/credits/src/generate.ts` | Modify |
| `respin/app/(product)/trends/{actions.ts,page.tsx,trends-view.tsx,paste-panel.tsx,paste-state.ts,pasted-references.tsx}`, `billing-errors.ts` | Modify / create |
| `respin/tests/{trends-actions,trends-page,trends-ui,billing-ui,table-writers,profile-cage}.test.*` | Modify |
| `respin/packages/trends/src/sources.ts` | The `submitted` adapter gains its production port implementation (credits side) |

## Verification
1. [ ] Entry gate, CI shape, Docker live, zero skips; `db:check` clean; 0026 applied on real Postgres
2. [ ] **Browser walk:** paste → "Queued for autopsy" with N credits debited on `/usage` → worker run → "Ready" → autopsy → spin side by side → forced near-copy blocked. The vendor call needs an Anthropic key; without one the walk stops at "Queued" and says so
3. [ ] Duplicate paste: one set of rows, one debit
4. [ ] Parked claim → exactly one refund; second settlement appends nothing
5. [ ] Free tier and viewer seat refused before any row; balance-short refused before any row
6. [ ] A number present only in the mechanism block is refused as untraced in the spin output
7. [ ] Sibling profile cannot see, spin from, or settle the owner's pastes
8. [ ] Export carries the transcript's `referenceInputId`; deleting the onboarding input cascades to the transcript

## Mutations to plant (population named)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Debit outside the intake transaction | R8 atomicity witness |
| M2 | Refund not unique per claim | V4 |
| M3 | `unavailable` baseline allowed on a shared row | R1 CHECK test |
| M4 | Reference block added to the traceability corpus | V6 |
| M5 | Prompt renders `hook` | R11 witness |
| M6 | Tier gate removed | V5 |
| M7 | Pasted items sorted into the ranked feed | R5 witness |
| M8 | Cross-profile pair dropped from the pastes reader | V7 |

## Done when
- [ ] Every requirement has a named witness; V1–V8 run (V2's vendor half stated if unrun)
- [ ] Four Critical-Path gates (compliance, tenancy Full, billing Full, learning) + consolidating code review, reviewers on the main tree with a hash manifest
- [ ] Slice 8's card and the master plan updated: the Reachability line rewritten, R4/V7/task 5 ticked with this slice as their evidence
