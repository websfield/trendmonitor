# Respin vendor acceptance walks — Slices 6, 7 and 8

**Status:** execution instructions only. No vendor walk is passed by the existence of this document.

Use this runbook to batch the deferred real-provider acceptance after all product slices are built. It may close acceptance-evidence rows, but it does not replace deterministic tests, Critical-Path review, external credential work, or any other unchecked requirement in a slice card.

Canonical acceptance state remains in the [Slice 6 card](../progress/respin-finish-slice-6-card.md), [Slice 7 card](../progress/respin-finish-slice-7-card.md), and [Slice 8 plan/card](../plans/respin-finish-phase-8.md). Use the [worker operations runbook](respin-worker-operations.md) for host operations, root [`todos.md`](../../todos.md) for T-15/T-16 provisioning, and the [M3 template](../progress/m3-quality.md) for the quality snapshot.

The current acceptance contracts are:

- Slice 6: a brand-new Free creator, with no card, creates and activates a coherent brain, generates usable Hooks against Anthropic, sees the kill-test result, and sees exactly one settled credit debit.
- Slice 7: all seven modes produce usable schema-complete output against the provider; a revision creates readable lineage and re-runs the checks; feedback is stored without claiming that it changes the brain or later drafts.
- Slice 8: a compliant source reaches the feed, its four-part autopsy is produced under the non-tenant system budget, a successful Spin is shown beside a bounded reference summary, and a near-copy is withheld before display after at most one rewrite.
- M3 evidence: ten usable real-provider outputs against the founder's own approved brain receive one human quality verdict each in `docs/progress/m3-quality.md`. This is a quality snapshot, not a release gate and not a performance study.

## Non-negotiable pass semantics

1. **Real provider means the configured Anthropic production adapter.** A stub, replay fixture, manually inserted output, or direct database seed can diagnose a screen but cannot pass a vendor walk.
2. **Browser means the real authenticated product route.** Calling a package function, server action, or database writer directly cannot pass an end-to-end row.
3. **A fixture cannot manufacture reachability.** If no production UI/job/API can create the required state, record `BLOCKED — production path absent`; do not insert the state with SQL and call it accepted.
4. **A green test is supporting evidence, not the walk.** Conversely, a browser success does not replace money, tenancy, compliance, migration, or concurrency tests.
5. **No output is a performance promise.** Do not score virality, expected reach, or sales. Quality verdicts concern usefulness, voice, completeness and compliance only.
6. **No secrets or creator content enter evidence files.** Record credential presence, provider project/account labels, timestamps, counts, opaque/redacted identifiers and safe outcome codes. Never record keys, tokens, prompts, full drafts, transcripts, private brain fields, email bodies, cookies, or provider request payloads.
7. **One observed happy path proves only that path.** It does not prove retries, races, isolation, caps, or idempotency unless the named observation actually exercises them.
8. **Any displayed near-copy is a release BLOCK.** Stop the walk, preserve content-safe evidence, and do not continue generating until the defect is fixed and the affected gates are rerun.
9. **A withheld candidate remains withheld.** Do not recover it from logs, DB JSON, browser tools, or provider consoles for the evidence pack.
10. **`ALMOST` remains the status while any required walk or review is open.** Update a card to `Ready` only after every one of that card's remaining `Done when` rows is independently satisfied.

## Known current blockers — re-check before spending anything

**Corrected 2026-09-04 — slice 8c closed this blocker.** Slice 8 now HAS a browser-reachable ingestion-to-feed path: the creator paste-transcript intake (R-96) is the compliant private submitted-reference producer the list below asks for, and it was walked against the real provider on 2026-09-04 (paste → debit → background autopsy → ready → a real four-part analysis on screen, plus R-98's refund-on-park). Two things the walk established that anyone spending here next must know: **(a)** the autopsy prices by the **served** model, and Anthropic serves `claude-haiku-4-5` as `claude-haiku-4-5-20251001` — if that id is not in the active document's `llm.prices`, every attempt fails `vendor_usage_unknown` and the claim parks; **(b)** the spin leg refused `llm_unavailable` on a server carrying a provably working key, cause unresolved, so the spin and the near-copy rows remain unproven. See [`../progress/respin-finish-slice-8c-card.md`](../progress/respin-finish-slice-8c-card.md).

The paragraph below is the pre-8c statement, kept because the surrounding checklist still depends on its other rows:

As of 2026-09-03, Slices 6 and 7 have browser-reachable generation paths. Slice 8 did not yet have a browser-reachable ingestion-to-feed path:

- `/trends` can track/untrack a niche and show its empty state.
- No production caller currently creates a trend item, persists a submitted transcript through Slice 4's reference intake, or creates the cache claim that dispatches an autopsy.
- `worker/production.ts` deliberately wires YouTube refresh to the T-15 unavailable adapter.
- A YouTube Data API key provides discovery and metadata only; it does not authorize arbitrary public caption downloads.
- No Resend adapter or weekly-delivery schedule exists while T-16 is open.
- `Analyse and spin` requires a server-resolved opaque autopsy id and is valid through `/trends`. The generic `/studio` action does not provide that id. If `/studio` still offers the mode and a press fails only because the autopsy id is absent, record a product failure; do not count that refusal as the seventh mode.
- The worker evaluates health inside its own process. A stopped/crashed worker cannot emit its own stale-heartbeat alert. An out-of-process reader must exist before the “stop worker → alert” row can pass; a manual SQL check is diagnosis, not automated alert evidence.

Slice 8 may proceed only after at least one compliant production producer exists:

- **Private submitted-reference path:** a creator-facing submit/paste path calls a production `ReferenceIntakePort` over Slice 4's reference intake, persists the transcript as `profile_private`, and creates the durable autopsy claim; or
- **Shared creator-owned-caption path:** live YouTube discovery is wired and an explicitly consented OAuth path proves the creator owns/can edit the video before its caption becomes `shared_analysis`.

A third-party YouTube id plus an API key remains metadata-only. It must stay `transcript_required` or `transcript_unavailable`, with no autopsy, feed or Spin eligibility.

## 1. Owner authorization worksheet

Complete this before a key is loaded or a paid control is pressed. This document itself authorizes no spend.

| Field | Required value |
|---|---|
| Owner approving the walk | Named person |
| Operator | Named person |
| UTC start window | Date and bounded window |
| Build identity | Immutable release/artefact id; commit id when available |
| Environment | Dedicated acceptance/staging environment; never an unidentified database |
| Anthropic project/account | Label only, never a key |
| Maximum foreground generation attempts | Positive integer |
| Maximum near-copy attempts | Positive integer; stop at this number even if no refusal is observed |
| Maximum system autopsy attempts | Positive integer; one attempt may make four provider calls |
| Maximum total provider spend | Currency and amount from the owner |
| Maximum creator credits to consume | Positive integer derived from displayed active-config prices |
| YouTube project and observed daily quota `Q` | Required only for T-15; label and number, no credential |
| Resend recipient/domain and maximum sends | Required only for T-16; controlled test recipient |
| Evidence destination | New dated file under `docs/progress/`; no secrets/content |
| Stop authority | Person who can halt the run immediately |

If any cap is absent, ambiguous, already exhausted, or cannot be observed, stop before the first vendor call.

## 2. Acceptance environment and test population

Use a non-production database or a clearly isolated acceptance workspace. Do not use a real customer's workspace, content, subscription, mailbox, YouTube channel, or transcript.

Prepare these identities:

- **F — Free owner:** brand-new email/password account, no Stripe customer/card/subscription, one selected creator profile, and a coherently activated Voice/Strategy/Kill Test built through the structured interview path.
- **P — paid owner:** Creator or above in Stripe test mode (or the approved acceptance billing environment), enough credits for all displayed prices plus the authorized retry allowance, one selected active profile, and the same quality-ready brain corpus.
- **P2 — isolation observer:** a second profile or workspace that must not see P's private trend transcript, private autopsy, generation or feedback.
- **Controlled trend source:** creator-owned or explicitly licensed material. For a third-party submission, use only the creator-paste/reference path and keep it profile-private. For shared analysis, use only creator-owned captions with explicit OAuth consent.
- **Controlled email recipient:** a mailbox owned by the acceptance operator. Never send a test digest to a customer list.

For the M3 snapshot, use the founder's own brain only with explicit owner approval. The repository evidence records no raw brain or output text.

### Content design

Prepare inputs before the timed walk so improvisation does not expand spend:

- one precise owned-footage description listing what the clips can actually prove;
- two specific ideas with different theses;
- one owner-authored or licensed source passage for Source to reel;
- two topics suitable for Hooks with materially different angles;
- one caption brief;
- one ideation brief;
- one compliant trend transcript with a distinctive subject phrase, opening hook and beat/turn sequence;
- one materially different Spin angle;
- one near-copy attempt asking to retain the distinctive subject, opening wording and beat/turn sequence.

Do not include fake engagement instructions, personal secrets, unverified performance numbers, concealment advice, or material the operator lacks rights to use.

## 3. Build and service preflight

Follow `respin/README.md` for environment provisioning. Load credentials through the approved local secret mechanism or target-host process manager. Do not paste credentials into commands, screenshots, chat, the acceptance record, or shell history.

From `respin/`, on the exact build to be walked:

```powershell
pnpm install --frozen-lockfile
docker compose up -d
$env:DATABASE_URL='postgres://respin:respin_local_dev@localhost:5435/respin'
pnpm db:migrate
pnpm db:seed
pnpm config:migrate
pnpm typecheck
pnpm lint
$env:TEST_DATABASE_URL='postgres://respin:respin_local_dev@localhost:5435/respin'
pnpm test
pnpm db:check
pnpm build
```

The database URLs above are the repository's throwaway local Docker credentials, not production secrets. For any other environment, inject its URL without recording it.

Requirements:

- All commands exit 0 and the test run has zero skips. If a command fails, stop; do not “walk around” a red build.
- `tests/action-gate.test.ts` and `packages/credits/tests/setup.test.ts` have documented 60-second load-timeout history. If either times out in the full run, report the full-run failure and run the affected file alone once to classify it; report both results. Do not loop the full suite until it happens to turn green, and do not start the paid walk while the entry gate is red.
- Record command, exit code, test file/test counts and duration. Do not paste unbounded logs into the acceptance record.
- Run the full gate once on the stable build. If a later walk causes a code fix, rerun the affected focused checks and then the full gate once more on the new stable build.
- Start the browser target from that same build. For a local production build, use `pnpm exec next start -p 8000` after `pnpm build`; use `pnpm dev` only when diagnosing, and label that evidence as development-mode evidence.
- Start `pnpm worker:start` in a separate protected process only when the system-autopsy walk begins. The worker requires `DATABASE_URL` and `ANTHROPIC_API_KEY` in its process environment.
- For the target-host walk, use `ops/systemd/respin-worker.service` and the separate `respin-worker-operations.md` runbook. Do not substitute a local foreground process for systemd evidence.

Before the first paid press, confirm:

- `/sign-up`, `/onboarding`, `/brain`, `/studio`, `/usage` and `/trends` load without an unhandled error;
- the active config has stored prices for every mode and revision;
- the displayed price is non-zero for Slice 6's debit witness;
- Free allowance is the active-config value expected for this build (seeded as 25 at the time of writing);
- the Anthropic provider account has its own external spend alert/limit;
- the worker system-autopsy daily cap is at or below the owner-approved maximum;
- the operator has a clock in UTC and the evidence record is open.

## 4. Evidence discipline

Create one dated record such as `docs/progress/respin-vendor-acceptance-YYYY-MM-DD.md`. Give every observation an evidence id (`S6-01`, `S7-01`, `S8-01`, `YT-01`, `EM-01`, `WK-01`).

For every paid press record:

- UTC timestamp;
- account label F or P, never the login address;
- route and visible mode label;
- active config version and displayed credit price;
- balance before and after;
- visible outcome: usable, honest refusal, withheld, or typed refusal;
- whether the UI says first-pass or rewritten once;
- provider dashboard delta: requests/tokens/cost, recorded only as aggregate numbers;
- a screenshot or recording reference with secrets, email addresses, profile names and creator text redacted;
- a human verdict and bounded reason; and
- whether a defect was opened.

Never attach browser request/response bodies, DB `request`, `output`, `usage_raw`, `analysis`, `content`, provider payloads, or raw transcripts. When DB evidence is needed, select metadata columns only.

Safe metadata queries may be adapted for the isolated acceptance database:

```sql
SELECT mode, outcome, rewrite_count, config_version, created_at
FROM generations
WHERE workspace_id = '<acceptance-workspace-id>'
ORDER BY created_at DESC;

SELECT delta, kind, ref_type, config_version, created_at
FROM credit_ledger
WHERE workspace_id = '<acceptance-workspace-id>'
ORDER BY created_at DESC;

SELECT purpose, model, tokens_in, tokens_out, cost_state, outcome,
       config_version, created_at
FROM model_usage
WHERE workspace_id = '<acceptance-workspace-id>'
ORDER BY created_at DESC;

SELECT business_date, cap_micro_usd, reserved_micro_usd,
       known_cost_micro_usd, call_count, unknown_call_count,
       overrun_call_count, overrun_micro_usd
FROM system_spend_daily
ORDER BY business_date DESC;

SELECT purpose, model, tokens_in, tokens_out, cost_state, outcome,
       call_count, unknown_call_count, created_at
FROM system_model_usage
ORDER BY created_at DESC;
```

Keep full identifiers out of committed evidence. If correlation is necessary, record a stable redacted suffix and retain the full mapping only in the controlled acceptance environment.

## 5. Walk S6 — Free first generation

Use identity F. This walk must begin with a brand-new Free workspace and no card.

1. Sign up through `/sign-up`. Confirm the workspace is Free and no Stripe subscription/card was created.
2. On `/onboarding`, create and select a test creator profile. Use only synthetic or owner-authored posts.
3. Complete `/onboarding/interview`, review the resulting Voice, Strategy and Kill Test on `/brain`, correct anything false, confirm it, and activate the coherent brain.
4. Visit `/usage` and record the initial balance. It must equal the active-config Free allowance and show one idempotent allowance grant, not duplicate grants. If onboarding consumed credits unexpectedly, stop and diagnose before the generation walk.
5. Visit `/studio`. Confirm only Hooks, Caption and Ideation are available on Free; paid-only modes are identified as outside the plan without a bare “upgrade” remedy.
6. Select **Hooks**, choose one of the offered platforms, enter the prepared owned topic/angle, and record the price and balance before pressing.
7. Press **Make a draft** exactly once. Observe a bounded “preparing” state with no fake streaming/progress percentage.
8. Require a usable Hooks result. An honest refusal is valid product behavior and paid evidence, but it does not satisfy the acceptance sentence “generate a set of hooks”; record it and use a new prepared input only if the authorization worksheet has room.
9. On a usable result verify:
   - 3–5 hooks are displayed;
   - the hooks use visibly different mechanics rather than paraphrasing one opening;
   - the product states whether the hard rules passed first time or after one rewrite;
   - creator-authored Kill Test criteria are either explicitly scored as advisory opinions or explicitly stated as not scored — never silently called passed;
   - the traceability section does not present an unknown number/name/date as verified; unknown specifics use `[check]` or are flagged;
   - a non-blank weakest point and platform-specific disclosure are visible; and
   - no performance guarantee, fake engagement or concealment advice appears.
10. Verify the charge sentence states the actual debit and resulting balance.
11. Visit `/usage`. Require exactly one Hooks debit for this press, in the current Free UTC calendar-month period, and a balance matching `/studio`.
12. Compare metadata-only DB rows: one terminal generation for the press, one ledger debit keyed to its attempt, and one to three metered provider calls depending on rewrite/creator-rule scoring. Do not inspect or export the draft body.

**S6 PASS:** one browser-reachable usable Hooks result on a no-card Free account, visible kill-test evidence, and exactly one matching debit. Any duplicate debit, missing debit, usable output with no debit, debit with no terminal outcome, or untraceable/invented displayed specific is a failure.

## 6. Walk S7 — all Studio modes, revision and feedback

Use identity P with a paid test tier. Read every displayed price first and confirm the authorization worksheet covers the total. A rewrite is part of one charged generation; a new manual press is a new generation and may create another debit.

Run the six non-Spin modes from `/studio`:

| Mode | Prepared input | Minimum observable output |
|---|---|---|
| Footage to thesis | Owned clip inventory and what each clip proves | Thesis, eligible framework, 3–5 hooks, beats with a named turn, shot map, on-screen text, caption, weakest point, disclosure |
| Idea to script | One specific idea and audience/stakes | The complete full-script shape above; it must develop the idea rather than replace it with a generic topic |
| Source to reel | Owner-authored/licensed source and the creator's own stakes | Complete full-script shape; it must rebuild through the creator's thesis, not merely summarize the source |
| Hooks | A distinct prepared topic | 3–5 hooks across different mechanics, weakest point and disclosure |
| Caption | One concrete post brief | Caption, weakest point and disclosure; no fabricated outcome claim |
| Ideation | One bounded niche/problem | 3–5 ideas, each with hook + thesis + framework, not a list of topics; weakest point and disclosure |

For every mode:

1. Choose the mode and platform, confirm the mode-specific price, submit once and wait for the live region to settle.
2. Confirm the output carries every required section and no section outside its mode contract.
3. Confirm the displayed kill-test state is first-pass, rewritten once, or honest refusal. There is no second automatic rewrite.
4. Confirm every usable output has a real weakest point and disclosure guidance.
5. Check voice/usefulness manually against the active brain without copying brain text into evidence.
6. Check that “Why this performs” is reasoning plus a limitation, never a forecast or guarantee.
7. Log a row in `docs/progress/m3-quality.md` only when a usable output is displayed.

### Seventh mode — Analyse and spin

Run **Analyse and spin** only through the valid `/trends` autopsy flow in Walk S8. Its successful Spin counts as the seventh mode for S7.

If the generic `/studio` picker offers Analyse and spin, test the control once before spending elsewhere:

- it must route the creator to an eligible autopsy or provide another valid server-owned selection;
- a missing-autopsy refusal from a control the product offered is a failure;
- do not attach an autopsy id manually or modify a form request; and
- even if the valid `/trends` flow later passes, keep the dead Studio control recorded until fixed.

### Revision

1. Choose one usable Studio output in **Revise an earlier draft**.
2. Verify the mode picker locks to the parent's mode and the price line changes to the configured revision price.
3. Enter a concrete change request that preserves the intended subject but changes a meaningful part of the draft.
4. Press **Revise that draft** once.
5. Require a new lineage entry naming the parent position, mode and bounded revision note.
6. Require the new output to state its own kill-test result. It must not inherit the parent's verdict.
7. Verify exactly one revision-priced debit and a matching terminal generation with a parent id.

An honest refusal on revision is acceptable behavior but does not demonstrate a usable revised draft. It must show no refused candidate, must explain what fired, must name a sharper angle, and must state the real charge.

### Feedback

1. On one terminal result, select one closed reaction and add a short non-sensitive note.
2. Press **Record what I said**.
3. Require the recorded message to identify the reaction and whether the note was kept.
4. Require the screen to state that nothing in the product changed because of this feedback and that any future change would be a creator-reviewed proposal.
5. Confirm the feedback appears in the creator export without causing a second generation or debit.

**S7 PASS:** six valid non-Spin modes from Studio plus the valid S8 Spin, a new same-mode revision with readable lineage and fresh checks, and one stored feedback record with honest no-learning copy. One mode's success cannot stand in for another. Proxies for source fidelity, hook diversity or weakest-point quality must be labelled as human observations, not formal coverage.

## 7. Walk S8 — compliant trend, autopsy and Spin

Do not begin until the production reachability blocker at the top of this runbook is closed.

### S8-A — source and rights path

Choose one path and record which:

**Private submitted reference**

1. From the authenticated product UI, submit the controlled link/transcript.
2. Verify the production path sends it through Slice 4's reference intake and records its source URL/provenance.
3. Verify the R-3 quote/containment budget is enforced. A direct call to a fake `ReferenceIntakePort` is not evidence.
4. Verify stored rights are profile-private and P2 cannot see the item, transcript, autopsy or Spin control.
5. Verify raw transcript text is never displayed in the trend feed or committed evidence.

**Shared creator-owned caption**

1. Discover the creator-owned video through the official YouTube Data API adapter.
2. Complete the explicit OAuth consent that proves authority to edit that video before downloading captions.
3. Verify the shared-analysis rights fact and its provenance are durable.
4. Verify no third-party public video can take this path with an API key alone.

For either path, the producer must create the durable cache claim consumed by the worker. A manually inserted `trend_items`, `trend_transcripts`, `autopsies` or `autopsy_cache_claims` row invalidates the end-to-end walk.

### S8-B — niche, feed and measurement honesty

1. On `/trends`, track one niche under P. Confirm the saved state and that the plan limit is enforced.
2. Record the creator balance before and after tracking and browsing. `trendBrowse` is a read entitlement, not an included build or debit; the balance and included-build state must not move.
3. Trigger the normal scheduled refresh, or a documented idempotent operator enqueue if one exists. Do not insert pg-boss rows directly. If neither can run within the authorized window, schedule the walk for the normal cadence.
4. Require the eligible item to appear through the scoped feed after its compliant transcript and completed autopsy exist.
5. If an outlier ratio is displayed, require the ratio, positive channel median baseline, baseline sample size, channel and increasing observation window together. A bare ratio fails.
6. Saturation must be a complete measured bundle (matching count, population, prevalence, window, method version) or explicitly “unmeasured because provenance is incomplete.” A curator label or naked “saturated” claim fails.
7. If a stale item is part of the acceptance population, require a production stale writer and a visible text label. A fixture-only stale state does not pass.

### S8-C — system-funded autopsy

1. Record `system_spend_daily` and `system_model_usage` metadata before dispatch.
2. Start/observe the normal worker. The pending cache claim should be dispatched without a `WorkspaceScope` and without consuming creator credits.
3. Require one terminal system attempt with the fixed order: hook mechanic → beats → ending → follow trigger.
4. A successful attempt must record `outcome = succeeded`, `call_count = 4`, `unknown_call_count = 0`, measured cost and the configured classification model.
5. Require the UI Autopsy disclosure to show all four parts and no raw transcript.
6. Reload/view the same authorized autopsy a second time. Require no additional system usage row, provider call or reservation for the cache hit.
7. Confirm the system tables have no creator/workspace/profile columns and no content fields. Creator credits and tenant `model_usage` must not move for the autopsy.
8. If an unmatched canonical mechanism is produced, require exactly one proposed-only framework row after replay/concurrency, with mechanism-level content only. It must remain unavailable to generation until a human curator approves it; do not auto-approve it as part of this walk.

Any missing/partial provider usage must be recorded as unknown and must stop further paid stages when remaining headroom cannot be proven. Do not coerce unknown to zero.

### S8-D — successful Spin

1. Expand **Autopsy** and record that all four bounded parts are visible.
2. In **Spin this reference**, enter the prepared materially different angle and choose the offered platform.
3. Record the displayed Spin price and creator balance, then press once.
4. Require either a usable result or an honest withheld outcome. A usable result is needed to pass the success branch.
5. For a usable result require:
   - the original side contains only source, title and bounded mechanism summary, never the raw transcript;
   - the Spin appears only in **Your spin result** after the gate;
   - subject matter, hook wording, and at least one beat/turn are materially changed;
   - a non-blank weakest point and disclosure guidance are present;
   - the charge and resulting `/usage` debit match the configured Spin price; and
   - no claim predicts performance.
6. Verify P2 cannot reuse or view P's private autopsy/Spin source.

The deterministic similarity control is lexical/structural. Record the human comparison as a bounded observation; do not relabel it semantic similarity or plagiarism detection.

### S8-E — forced near-copy branch

1. Use the same controlled reference with its distinctive subject phrase, opening hook and beat/turn sequence.
2. Ask for those three elements to remain substantially unchanged. Do not inject an output, intercept the provider response, lower the code floor, loosen config, or edit stored reference data.
3. Press only within the owner-approved near-copy-attempt cap.
4. **PASS observation:** the candidate is never displayed, the UI states **Spin refused**, states that one rewrite was attempted, reports the actual charge, and offers the safe remedy to change subject, hook and structure.
5. **BLOCK observation:** any candidate that fails one of the three required changes appears anywhere in the UI, response payload available to the browser, logs or evidence export.
6. If the provider independently changes enough on every authorized attempt, record `NOT OBSERVED — provider did not return a near-copy`. The deterministic fixture remains green evidence, but the browser acceptance row stays open. Do not keep spending until chance produces a refusal.

**S8 PASS:** production source → rights/provenance → scoped item → system-budget autopsy → feed → successful gated Spin is browser-reachable, the cache hit is zero additional system calls, and the near-copy refusal is observed before display. T-15, T-16 and target-host monitoring have their own rows below.

## 8. Walk T-15 — live YouTube metadata and quota

This walk proves discovery/metadata and quota admission only. It never proves arbitrary caption access.

1. Confirm `worker/production.ts` uses the real official YouTube adapter rather than `unavailableYouTubeDiscovery`. If not, stop as `BLOCKED — adapter not composed` even if a key exists.
2. Use a restricted YouTube Data API v3 project. Record the project label and the currently provisioned daily quota `Q` from Google Cloud, not a remembered/default number.
3. Record the endpoint operations used by one niche scan and their observed/documented unit total `U`, with source/date. Do not hardcode a stale quota-cost assumption into the acceptance result.
4. Verify scheduler admission is no more than `floor(Q / U)` scans and that excess work is refused/deferred rather than silently dropped or attempted.
5. Run one bounded niche refresh through the production worker.
6. Require at least one metadata observation with source id, video id, title, channel, views and publication time sufficient for the configured baseline calculation.
7. For a public third-party video with no authorized transcript, require `transcript_required` or `transcript_unavailable`; confirm no autopsy claim, system provider call, feed item or Spin control is created.
8. Confirm no scraping dependency, media download, unofficial transcript service or browser automation was introduced to make the walk pass.

**T-15 PASS:** current quota and per-scan units are evidenced, admission math is bounded by them, official metadata is stored through the production worker, and metadata-only items remain ineligible for autopsy/feed/Spin.

## 9. Walk WK — target-host worker and monitoring

Follow `docs/runbooks/respin-worker-operations.md`; this section defines the acceptance evidence to retain.

1. Install/start the committed systemd unit on the target host using externally provisioned `DATABASE_URL` and `ANTHROPIC_API_KEY`.
2. Record `systemctl status` state, unit/build identity and UTC time without environment values.
3. Require a fresh content-safe heartbeat, both pg-boss schedules (daily refresh and minute dispatch), bounded pool capacity, and no unexpected dead-letter growth.
4. Observe one real autopsy attempt or an explicit no-work state. Confirm logs contain safe event/reason codes and identifiers only—no prompt, transcript, draft, email body, creator/profile/workspace id or raw provider error.
5. Confirm total default worker DB footprint stays within four connections: two pg-boss pool sessions, one separate listener and one query-pool session.
6. Stop the worker gracefully and verify in-flight work completes or reaches its documented durable state.
7. Require an **out-of-process** monitor to emit the stale-heartbeat alert after the fixed threshold. A stopped process cannot alert on itself; a manual query proves stale state but not alert delivery.
8. Restart it, verify a fresh heartbeat, restored schedule history and cleared/accurately retained alert state.

**WK PASS:** target-host systemd lifecycle, bounded connections, safe logs, persistent schedules/health and out-of-process stopped-worker detection are observed. If the external monitor does not exist, record the stop-alert row as blocked.

## 10. Walk T-16 — controlled Resend delivery

Do not start until a production Resend adapter and worker schedule exist. Sender-independent digest construction alone is not delivery evidence.

1. Use a Resend test/sandbox domain or explicitly approved sending domain and one controlled recipient.
2. Confirm sender identity, suppression/bounce handling and recipient are acceptance-only. Never upload a customer list.
3. Trigger one scheduled digest through the production job path, not a direct SDK script.
4. Require exactly one delivery for the schedule/run identity. Replaying the same identity must not send a duplicate.
5. Verify the provider reports accepted/delivered (or the strongest status the account exposes) and record message id, UTC timestamps and status only.
6. Inspect the received message:
   - no raw transcript, private brain field, hidden identifier or other profile's item appears;
   - each displayed ratio includes baseline, sample size and window;
   - saturation is complete measured evidence or explicitly unmeasured;
   - stale state is labelled; and
   - no performance guarantee, fake urgency or misleading “learning” claim appears.
7. Record bounce/failure behavior separately if deliberately exercised; do not send repeated messages merely to obtain a success.

**T-16 PASS:** one production-scheduled, idempotent, controlled delivery is observed with honest evidence and no private-content leak.

## 11. Ten-output M3 quality snapshot

Log usable outputs in `docs/progress/m3-quality.md`. Slice 6/7/8 walk outputs may contribute, but only displayed usable outputs count. A refusal has no output to judge and must be recorded separately.

For each output, a named human records:

- mode and platform;
- whether required sections were present;
- `usable`, `not usable`, or `not assessable` as the human verdict;
- voice fit, specificity, filmability and mode-specific quality as bounded observations;
- whether the weakest point was meaningful or boilerplate;
- any `[check]` marker or unverified-specific concern;
- safe failure tags, without copying the output; and
- an external evidence reference kept outside the repository when the artefact contains private text.

Do not publish a percentage before all ten usable outputs exist. At ten, any `x/10` summary must name the denominator and remain a human quality snapshot—not accuracy, expected performance, or statistical validation.

## 12. Stop conditions and defect handling

Stop immediately when any of these occurs:

- spend/attempt/email cap reached or cannot be observed;
- provider or billing account unexpectedly leaves test/acceptance scope;
- wrong tenant/profile data becomes visible;
- a raw transcript, withheld draft, private brain field, secret or provider payload reaches UI/log/evidence;
- a near-copy is displayed;
- a usable generation has no debit when priced above zero, or one press produces more than one debit;
- a debit exists without a terminal stored outcome;
- a metadata-only video receives an autopsy or Spin path;
- system autopsy touches creator credits or tenant `model_usage`;
- unknown provider cost is shown as zero/measured;
- the worker exceeds its approved connection/concurrency bound;
- a production path is missing and the only proposed workaround is direct SQL, fixture injection or an unapproved adapter.

For a defect:

1. Stop the affected walk and preserve content-safe metadata.
2. Record expected, observed, route, UTC time, build/config version, spend delta and safe identifiers.
3. Do not paste private content into the issue; retain it in the controlled evidence store and reference it.
4. Fix the root cause and add the narrowest deterministic regression witness.
5. Run the touched Critical-Path checklist and focused tests.
6. Run the canonical full gate once the fix set is stable.
7. Repeat the failed walk from a clean, newly authorized attempt. Do not relabel the earlier failure as a pass.

## 13. Close-out

At the end, produce one table:

| Walk | Status | Evidence ids | Spend/credits | Remaining condition |
|---|---|---|---|---|
| S6 Free Hooks | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S7 six Studio modes | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S7 revision + feedback | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S8 production source/feed | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S8 system autopsy/cache | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S8 successful Spin | PASS / FAIL / BLOCKED / NOT RUN | | | |
| S8 near-copy withheld | PASS / FAIL / NOT OBSERVED / NOT RUN | | | |
| T-15 YouTube/quota | PASS / FAIL / BLOCKED / NOT RUN | | | |
| WK target-host worker | PASS / FAIL / BLOCKED / NOT RUN | | | |
| T-16 Resend delivery | PASS / FAIL / BLOCKED / NOT RUN | | | |
| M3 ten-output snapshot | COMPLETE / INCOMPLETE / NOT RUN | | | |

Then:

1. Append the result to `docs/progress/respin-finish/ledger.md`; never rewrite an earlier entry.
2. Update only the exact acceptance checkboxes evidenced by the walk.
3. Keep failed, blocked, not-observed and unrun rows visible.
4. Link the dated evidence record from each affected slice card and the master progress row.
5. Record provider spend and creator-credit consumption separately. System autopsy cost is product overhead, never creator credits.
6. Do not mark a slice `Ready` merely because its browser walk passed; re-read every remaining `Done when` row and open review finding first.
7. Do not call the final product production-ready until all release-gating walks, reviews and external acceptance items are closed.
