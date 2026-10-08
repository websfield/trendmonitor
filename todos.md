# todos.md — non-coding decisions

Decisions that engineering cannot make for itself: owner inputs, product definitions, legal/consent questions, and spend authority. Each row says **what it blocks**, **who decides**, and — where work would otherwise stop — **the default the code is being built under** so nothing waits on an unanswered question.

Convention: a decision that is settled here graduates to `docs/video-editing/decisions.md` as a numbered D-row. This file holds only what is *open*.

Last updated: 2026-10-05 (T-23 and T-24 added by audit-remediation Phase 9a, decisions.md R-155 — the production restore walk and the account/restore-critical-secret inventory; paging and the forward-only rollback policy). Previously 2026-09-21 (T-22 added — manual screen-reader verification, demoted to lowest priority and made permanently non-blocking by decisions.md R-133).

---

## 1. Blocking a Stage 0 task — proceeding under a stated default

*Nothing open.* **T-1 ("what counts as one output?") is settled and has graduated** to `decisions.md` **D-56**; the rule, its class tabulation and the comparability axes have exactly one home, `docs/video-editing/output-counting-policy.md` — do not restate them here.

---

## 2. Owner inputs — long outstanding, blocking real progress

### T-2 · Set the D-21 spend ceiling
**Blocks:** `PHASE_3_ACCEPTED_LIVE` (open since Phase 3); Stage 1 live provider benchmarks; **all** of Stage 3's live model execution.
**Decider:** owner. **Needs:** a number in AUD, and where it is configured.
Every editorial stage to date has run on recorded fixtures at AUD 0.00. Recorded replies got the pipeline built; they cannot demonstrate editorial quality, because a recorded reply is not a decision. **Stage 3 cannot meaningfully start without this.**

### T-3 · Supply two more accounts, with rights records (D-36)
**Blocks:** `PHASE_0_EXIT_EARNED` (needs 3 accounts, has 1).
**Decider:** owner. **Needs:** stable `accountId`s, source classification, and a rights record per asset with an `evidence_uri`.

### T-4 · Accumulate the remaining real outputs
**Blocks:** `PHASE_0_EXIT_EARNED` (needs 20 resolved real outputs; has **1** — D-56 settled the unit, so this is no longer "1 or 2").
**Decider:** operations. Not an engineering task — it is real production work through the pipeline.

### T-5 · Upgrade the rights basis beyond owner-directed
**Blocks:** any use beyond internal stakeholder showcase.
**Decider:** owner / legal.
The real proving run's rights records cite published partnership posts as `evidenceUri` and note that formal creator agreements are **held by the campaign, not attached**; `paidAmplificationPermitted: false` throughout. Current approval is delegated, not agreement-backed.

---

## 3. Product and strategy

### T-6 · Does cutdown get its own North Star?
**Blocks:** nothing immediately; weakens every alignment check until answered.
**Decider:** product owner.
`NORTH_STAR.md` describes **UGC Intelligence for ClientHub** — compliance gate, amplification scorer, Knowledge API. Cutdown is a second product line with its own PRD and roadmap and is **not in it**. Options: (a) give cutdown its own North Star document; (b) extend the root one to name both lines; (c) accept the PRD as cutdown's governing contract and say so explicitly. I have deliberately not invented one.

### T-7 · Assign the unowned PRD Phase 1 exit obligations
**Blocks:** claiming PRD Phase 1 complete.
**Decider:** product owner + operations.
Five stages are governed by PRD Phase 1, and **none** of them owns these: **≥60 published outputs**, **unit cost known**, **≥3 repeat internal users** (§15), and **cost attribution coverage ≥99%** plus p50/p95 unit cost by source minute / final minute / variant / platform (§14.3). These are operations and instrumentation obligations, not engineering deliverables.

### T-8 · Analytics access and consent
**Blocks:** Stage 6 entirely.
**Decider:** owner / legal.
Needs: whose analytics, under what permission, retained how long. Note the precedent from T-5 — if creator agreements are held by the campaign rather than attached, performance data likely carries the same question. **Resolve before building a connector, not after.**

### T-9 · Are the Social Soup accounts one tenant or many?
**Blocks:** Stage 6's pooled uplift statistic **and** Stage 7's isolation model — and the two answers must agree.
**Decider:** product owner.
PRD §14.2 targets uplift "across multiple accounts" — a pooled statistic. Stage 7 turns accounts into isolated workspaces. The repo already holds the resolved form of this exact question one product line over: *a summary statistic of outcome data is outcome data*. Decide before building the pooled statistic.

---

## 4. Legal / licensing gates

### T-10 · Remotion licence (D-16)
**Blocks:** Stage 4's Remotion adapter.
**Decider:** owner / legal. D-16 carries an explicit instruction: **escalate before `npm install remotion`** — the company licence is an owner/legal commitment. Engineering must escalate, not install.

### T-11 · Golden-set asset permissions
**Blocks:** Stage 1 task 12.
**Decider:** owner. PRD §13.1 requires golden sets be **versioned and permissioned**; each asset needs a written permission record.

### T-12 · Retention vs reproducibility
**Blocks:** Stage 7's storage migration design.
**Decider:** owner / legal.
A genuine conflict, currently nobody's task: **REQ-113 requires previously approved versions stay reproducible forever**, while retention/deletion (REQ-155/156) requires erasure — for a store holding licensed creator footage and third-party personal data. D-8 currently says "delete nothing automatically". For this store, that tension *is* the design.

---

## 5. Permissions needed from the user (small, but blocking)

### T-13 · Authorise `git push` ✅ **SETTLED 2026-08-10 — authorised and done**

**Owner decision:** push authorised. `origin/main` is now at **`06c5073`**; the five previously-unpushed commits (through Stage 0A) are on the remote.

**What this unblocked, and what it did not.** The CI workflow added by **D-57** fires on `push` to `main` for the Cutdown paths, so this push is its **first execution ever** — which is the whole point of A7. Two things in that workflow were written but unverifiable from the authoring session and are verified by that run, not by inspection: the **Linux FFmpeg download URL** (`FFMPEG_LINUX_URL`) and **`setup-node`'s `.tool-versions` support**. Both fail loudly with a named remedy rather than degrading, so a red first run is expected-if-anything and cheap to fix.

**A7 is therefore still open** — it is "CI green on a clean clone", not "CI configured". Close it when the run is green; if it is red, the failing step names the line to change.

*Context retained below.*

**Blocks:** Stage 0 task 17 acceptance criterion **A7** (CI green on a clean clone).
The branch was **3 commits ahead of `origin/main`** (5 by the time it was pushed). CI runs on push, so "CI is green" was unverifiable until the branch was pushed. Per `CLAUDE.md` golden rule 8, pushing waited for explicit confirmation. Everything else in Stage 0 was built and verified locally first.

### T-14 · Add `cutdown/.env.example` by hand ✅ **SETTLED 2026-08-10 — committed in `310832c`**

**Outcome:** the file is **tracked**. `git ls-files cutdown/.env.example` resolves and `git show --stat 310832c` lists it as a 32-line addition. It is no longer untracked, and nothing here is outstanding.

**Golden rule 2 was satisfied by a second pair of eyes, not by waiving it.** The session that raised this row had its tooling denied read access to `.env*` paths and therefore declined to commit a file whose secret-freedom it could not verify. A Stage 0B reviewer — without that denial — read the committed content and confirmed **no secret leaked**: `ANTHROPIC_API_KEY=` and `CUTDOWN_SPEND_CEILING_AUD=` are **empty placeholders**.

**Blocks:** nothing, and never did — no code reads it (verified; code reads `.env`, which is git-ignored).

> The `docs/progress/cutdown/ledger.md` entry written in `310832c` still says this file is "deliberately NOT committed and still the only untracked file", which the commit it was written in contradicts. That ledger is **append-only** and is corrected by appending, not by editing this row or that one.

---

## 6. Settled during this work — recorded here, pending graduation to `decisions.md`

| # | Decision | Where it lands |
|---|---|---|
| — | `work/` is never tracked — licensed creator footage + third-party personal data + ~200 MB/campaign | committed in `.gitignore` |
| — | Phase 4–6 committed as three coherent commits, not four invented per-phase ones (the worktree was a cumulative snapshot; splitting it would produce commits that never existed and don't build) | commits `c21c7aa`, `7404a65`, `501f212` |
| — | The program is expressed in the PRD's roadmap vocabulary; stage numbers are filenames, PRD phases are authority | master plan §0 |
| — | Planning detail decays with distance; Stages 2–7 carry re-planning triggers rather than invented task tables | master plan §7 |

---

## 7. Respin deferred external evidence

### T-15 · Provision YouTube Data API credentials and run the live metadata/quota walk
**Blocks:** Slice 8 live YouTube discovery, metadata and quota acceptance evidence only. It does not block creator-pasted third-party transcripts, the metadata adapter's deterministic tests, or unrelated Slice 8 construction.
**Decider / owner:** owner. **Deferred by owner:** 2026-09-02.
**Needs:** a YouTube Data API v3 key restricted to the API and deployment origin where practical, plus the actual project quota shown in Google Cloud. Keep the credential outside the repository and do not paste it into a work log. The key does not authorize arbitrary public caption download; third-party transcripts remain creator-paste in v1, while creator-owned captions require separately consented OAuth permission to edit the video.
**Walk:** [`respin-vendor-acceptance-walks.md`](docs/runbooks/respin-vendor-acceptance-walks.md), §8.

### T-16 · Provision Resend and run one controlled digest-delivery walk
**Blocks:** REQ-E05's live email-delivery evidence only. Sender-independent digest composition and worker scheduling remain buildable; delivery stays cut to slice 10a until this row closes.
**Decider / owner:** owner. **Deferred by owner:** 2026-09-02.
**Needs:** a verified sending domain/subdomain, a sending-only Resend API key held outside the repository, a non-secret sender address, and explicit authorization for one controlled acceptance message to an owner-selected recipient.
**Walk:** [`respin-vendor-acceptance-walks.md`](docs/runbooks/respin-vendor-acceptance-walks.md), §10.

### T-17 · Provision the R-124 S3 deletion journal and run the production restore walk
**Blocks:** deletion request creation and public launch — both stay disabled until this closes. It does **not** block any further Phase 10b-1 construction: the worker composes a *refusing* journal when unconfigured, so every append returns a conflict and no operation can advance, which is the shipped and safe default.
**Decider / owner:** owner (this is vendor provisioning and a charge). **Raised:** 2026-09-08, after Phase 10b-1 Task 5 shipped the adapter, verifier, forecast, policies and operator CLIs against an enforcing in-memory S3.
**Needs, in this order** — each step blocks the next:
1. A dedicated S3 Standard bucket in the target Lightsail region, outside the database host and outside the database-backup replacement workflow.
2. **Versioning and Object Lock enabled BEFORE the first object.** Object Lock cannot be turned on afterwards, and the writer refuses a bucket that returns no version id.
3. The rendered bucket policy applied, with the **sha256 of the rendered policy** recorded.
4. Three principals from the templates: create-only writer, read-only verifier, delete-exact-version purger.
5. `price-snapshot.<region>.json` recorded from the current AWS S3 price list. **No price is compiled into the code** — until this exists the forecast is withheld and `pnpm -C respin journal:forecast` exits 2.
6. `RESPIN_DELETION_JOURNAL_BUCKET`, `_REGION`, `_ENVIRONMENT` set on the worker (all three or none — a partial set refuses startup).
7. One real restore walk, transcript recorded.
**Also closable only here:** whether `s3:ObjectCreationOperation` with a `Bool` operator actually denies a non-conditional PUT. Two reviewers flagged it as unverifiable offline; close it by applying the policy, attempting a PUT without `If-None-Match`, and recording the AccessDenied.
**Templates and the ordered checklist:** [`respin/infra/s3-deletion-journal/README.md`](respin/infra/s3-deletion-journal/README.md). **Evidence owed:** bucket ARN, region, policy digest, Versioning/Object-Lock/encryption status, SDK lockfile version, price snapshot, restore transcript — none obtainable from this repository.

### T-18 · Decide whether a public-launch flag exists to gate
**Blocks:** nothing today; it decides where the R-124 cost ceiling is *enforced*.
**Decider / owner:** owner (product definition). **Raised:** 2026-09-08.
Task 5 built the enablement decision and it is reachable through `pnpm -C respin journal:forecast`, whose **exit 2** a release checklist can gate on. It is deliberately **not** wired into `app/(auth)/sign-up`: the product has no public-launch or new-account flag to gate, nothing is deployed, and gating sign-up would have invented a product decision. Three reviewers checked that reasoning and accepted it; the deferral is recorded in the plan's Deferral ledger. If a real enablement flag is introduced later, it must consult `journalEnablementDecision` in the same change — otherwise the ceiling is enforced by a checklist a person can skip.

### T-19 · Phase 2 deploy-side acceptance: GitHub `journeys` Environment, first dispatch, spend ceiling
**Blocks:** creator-ready Phase 2's *evidence* completion only (AC6 first `workflow_dispatch`, the downloaded `consumption-<run>-<attempt>` manifest, the first run's spend; AC1 live branches). Engineering completion is recorded complete on the [Phase 2 card](docs/progress/creator-ready-phase-2-review.md) (gate closed 2026-09-19, 10 evaluations). Nothing local is blocked.
**Decider / owner:** owner. **Deferred by owner: 2026-09-19** — "still developing on local computer; deploy and security when the features are completed and ready to deploy to cloud".
**Needs, in this order:** (1) merge and wait for `respin.yml` green on `main` (runs the cwd witness on ubuntu — closes card residual R-6); (2) GitHub Environment `journeys` with deployment-branch policy `main` only; `ANTHROPIC_API_KEY` stored there; **delete** any repository secret of that name (the `no-repository-secret` canary fails the run while one exists); (3) owner-side vendor spend limit written into `respin/e2e/journeys/README.md` *Spend ceiling*; (4) one dispatch of `respin-journeys`; download the consumption manifest and reconcile before any second dispatch (three-dispatch cap, master plan). A defect surfacing there needs a new owner decision — the Phase 2 gate has no review round left.

### T-20 · Phase 2 CI-scanner hardening residuals (security, deferred with T-19)
**Blocks:** nothing. The vendor key's control is the GitHub Environment branch policy (T-19), never the scanner; the scanner is PR-time drift detection. Five review rounds found the live controls intact every time.
**Decider / owner:** owner. **Deferred by owner: 2026-09-19** (same instruction as T-19).
**Items** (card residual register, all Low/Info, none applied): R-1 escape-balanced quoted fold / explicit `? run` key evade the block opener; R-2 non-plain keys (`"uses":`, `uses :`, `"environment":`) absent to the readers B3-TEN-1 did not touch — the class fix is one set-wide refusal of non-plain keys on YAML lines; R-3 deeper `outputs`-read spellings; R-4 per-token `pnpm -C respin` check; R-5 `scan-journey-notes.ts` tolerates an absent `artifactsDir` (refuse instead); R-10/11/12 one-token regex widenings. Recommended handling when T-19 is picked up: one batch, ~1.5 h, plants for each, one lean tenancy re-check + billing affected re-check for R-5. Alternative on record: amend the plan to allow a `yaml` dev-dependency and rewrite `checkWorkflowSet` on a parsed AST — only if a further reach finding appears.

### T-21 · First GitHub run of `respin-visual.yml` (deferred with T-19/T-20)
**Blocks:** nothing local. The workflow is proven on this machine — the three-engine matrix is 348 passed, and the client-rendered shell duplicate it exists to catch was planted in `app/(product)/nav.tsx` and produced 18 Chromium failures while the whole vitest suite stayed green. What is unproven is the RUNNER, not the guard.
**Decider / owner:** owner. **Deferred by owner: 2026-09-20** — "delay github, we need to sort out the main features before we worry about deploy or github".
**Unverified until a push or pull request touching `respin/**` runs it:** (1) `pnpm exec playwright install --with-deps chromium firefox webkit` on ubuntu-latest — WebKit's system libraries are the likely first failure, and the step has never executed outside Windows; (2) the `actions/upload-artifact` failure-trace path, including that `.tmp/respin-v2-results/**` resolves from the workspace root while the job's `run` steps default to `respin/` (deliberate: `outputDir` is `../.tmp/...` relative to the config); (3) wall-clock against the 30-minute ceiling on a cold runner. None of the three can be checked locally. Nothing about the workflow's secret-free property waits on this: `tests/journeys-workflow-triggers.test.ts`'s `checkVisualWorkflow` proves it from the file text on every local run.

### T-22 · Manual screen-reader verification (lowest priority, never a blocker)
**Blocks:** nothing, permanently. Ruled by the owner on 2026-09-21 and recorded as **decisions.md R-133**: this is the programme's lowest-priority item, and its absence never makes a phase, an acceptance criterion or a gate verdict Not yet. It is not deferred pending a trigger — it is demoted.
**Decider / owner:** owner. **Ruled 2026-09-21** — "move nvda to lowest priority, and don't make it a blocker ever".
**Rationale on record:** solo-founder micro-enterprise, so the EU European Accessibility Act's service exemption applies; no accessibility claim appears in any marketing copy, and the claims canon prevents one being added silently.
**Already covered without it, on Chromium/Firefox/WebKit:** keyboard order, accessibility-tree order, 200% text enlargement, 320-CSS-pixel reflow, contrast, forced colors, reduced motion, and the 799/800/801 navigation bracket. None of that is demoted by R-133.
**What stays unverified, named rather than hidden:** live-region behaviour for pending/result/refusal states (an `aria-live` region that reads correctly in the DOM can speak twice or not at all), and how a screen reader maps `<summary>`'s implicit expanded state and its virtual buffer on Enter. Reports say **not obtained**, never that it passed, and **no accessibility conformance is claimed on any surface**.
**Related:** A11Y-1 (mobile product nav reading order vs visual order, WCAG 1.3.2) is **accepted as a known defect** by the same ruling — not fixed, not closed; the two-sided assertion in `respin/e2e/visual/visual.spec.ts` stays so a future shell change must re-rule on it.
**Revisit trigger:** a procurement, enterprise or public-sector customer asking for an accessibility statement; staff reaching 10 or turnover €2M; or any marketing copy that claims accessibility.

### T-23 · The production restore walk, and the account and restore-critical-secret inventory
**Blocks:** deletion request creation and public launch (with T-17), and the *evidence* half of the restore drill. Nothing local: audit-remediation Phase 9a (decisions.md R-155) made the drill runnable end to end as a script, including a local mode with no cloud account; this row is what only a real deployment and the owner can close. Raised 2026-09-21 by the audit-remediation plan (P9-R8) and written here 2026-10-05 by Phase 9a (register 2026-10-05 item 32: the row was routed here and did not exist).
**Decider / owner:** owner (accounts, credentials and a real backup are owner-held). **Deferred by owner: 2026-09-19** under the same instruction as T-19 ("deploy and security when the features are completed and ready to deploy to cloud").
**Needs, in this order:**
1. **The production restore walk:** `respin/scripts/restore-drill.sh` executed end to end as a script against a real production backup, with the command in `RUNBOOK.md` (Respin → *Restore drill — the commands*). **Closure proof:** a `RESTORE DRILL PASSED` transcript under `docs/progress/audit/evidence/`, and `RUNBOOK.md`'s "Last production drill: NEVER" updated. **A transcript carrying the `EMPTY-MONEY-ALLOWED (local drill)` line is refused as closure** — that flag exists only for a fresh local database and is accepted only against the loopback journal. **A transcript carrying `JOURNAL-EMPTY` comes from a legacy manifest that recorded no journal, and proves only that some journal is reachable and lists nothing**: it does not close this row. Take the production backup with the journal named in its shell (RUNBOOK backup command), so the drill is tied to that journal (decisions.md R-155 §8).
2. **The account inventory:** the AWS account `770371751912` row in `RUNBOOK.md`'s Accounts table — where the credential lives, MFA, and who owns break-glass — plus the Anthropic and Google OAuth account rows. Closure proof: those rows with a bumped *Last reviewed*.
3. **Restore-critical secrets, by location (never value):** where `BACKUP_PASSPHRASE_FILE` and `RESPIN_AUTO_TOPUP_AUTHORITY_KEY` are stored OFF the database host; without the first no backup can be decrypted, and paid Stripe events may need the second after a point-in-time restore (`respin/env.example`). Closure proof: a "Restore-critical secrets" section in `RUNBOOK.md` naming stores.
4. **The deletion-journal credential mechanism:** the S3 client resolves an instance role (`createS3JournalClient` passes no credentials in production), while the provisioned principals are IAM users with zero access keys (`respin/infra/s3-deletion-journal/RUNBOOK.md`), and the worker unit's `ProtectHome=true` (`respin/ops/systemd/respin-worker.service`) hides `~/.aws/credentials`. One of the three has to change, and which is a deployment decision.
5. **Three documents disagree on whether the R-124 journal is provisioned:** `RUNBOOK.md`'s Deletion journal section ("Nothing is provisioned") and T-17 above say it is not; `respin/infra/s3-deletion-journal/RUNBOOK.md` records a created bucket `respin-deletion-journal-prod-770371751912` with Object Lock COMPLIANCE. Only the owner knows which is current; reconcile the two that are wrong to the one that is right. Not guessed here.
6. **The trusted-proxy chain:** `RESPIN_TRUSTED_PROXIES` set from the recorded deploy topology, with the `trustedProxies` generative test re-run against the recorded value (master plan deferral ledger, register item 47).

### T-24 · Paging: worker health, scheduled-audit failures, and the forward-only rollback policy
**Blocks:** nothing local. The local halves are built (the worker writes `system_worker_health`; `.github/workflows/respin.yml` runs the dependency audit daily), and a person can read both. What is unbuilt is anyone being *told*. Raised 2026-09-21 (P9-R8, P9-R10); written here 2026-10-05 by Phase 9a.
**Decider / owner:** owner (an alert route is a deployment and a person). **Deferred by owner: 2026-09-19** (same instruction as T-19).
**Needs:**
1. **Worker-health paging above 90 s** — the heartbeat's own staleness threshold (`respin/worker/health.ts`: 3 × the 30 s default write interval). Today a dead worker is visible only to whoever runs the query in `docs/runbooks/respin-worker-operations.md`.
2. **Scheduled-audit failure paging beyond GitHub's own notification.** A `schedule:` run has no pull-request author, so GitHub notifies the user who last committed `.github/workflows/respin.yml` — the route named in that file. Anything past that (a channel, a second person) is this row.
3. **The forward-only migration rollback policy:** an expand/contract rule that makes "redeploy the previous build" meaningful after a migration the previous build does not understand (`docs/plans/respin-finish-master-plan.md`'s compatibility/rollback row is still unchecked).
**Closure proof:** an alert route recorded in `RUNBOOK.md` Observability covering both the worker heartbeat and a failed scheduled audit, and the rollback policy written beside it.

> **Not in this file:** Task 5 also left seven *engineering* residuals — the journal-PUT/Postgres-COMMIT orphan window, the absent `schemaVersion → reader` registry, four unwitnessed refusal codes, the dynamic-`import()` bypass of the `scripts/**` writer deny, and the fake not enforcing the IAM prefix grant. Those are code, not decisions, and live in [`10b1-task5-review-manifest.md`](docs/progress/respin-finish/10b1-task5-review-manifest.md) and `docs/progress/respin-finish-open-items.md`. This file holds only what engineering cannot settle for itself.
