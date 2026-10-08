# Launch remediation L0 — candidate, decisions and evaluation manifest

Phase: L0 of [launch remediation](../../plans/respin-launch-remediation-master-plan.md#l0--candidate-and-decision-contract). Programme ledger: [creator-ready ledger](ledger.md). Date: 2026-09-30.

This card is L0's one report card. It pins the candidate, reconciles inherited open items against the code at that candidate, lists every approval L1–L6 need, and freezes the evaluation manifest that L6 (LA-4) will run. It changes no product code, policy document, configuration or database row.

## 1. Candidate identity

| Field | Value | How observed |
|---|---|---|
| Branch | `creator-ready-plan-review` | `git branch --show-current` |
| HEAD | `3533dbfcf40a19924d5665e772f5a7411017817f` (2026-09-30 10:06 +10:00) | `git log -1` |
| Dirty diff at L0 start | docs only: `AGENTS.md` (bfa81175d968), `docs/plans/creator-ready-master-plan.md` (f8bef44e2b65), `docs/progress/creator-ready/ledger.md` (306d5f57f19b) modified; three new masters and `docs/progress/respin-remediation-2026-09-30-codebase-review.md` untracked. No file under `respin/` differs from HEAD. | `git status --porcelain`, `git diff HEAD --stat`, sha256 (first 12 hex) |
| Checkpoint | `claude-jig checkpoint: respin-launch-remediation phase L0` (stash push + apply `--index`; tree and LF endings unchanged, verified with `git ls-files --eol`) | `git stash list` |
| Lockfile | `respin/pnpm-lock.yaml` SHA256 `54e684b5…8483bd4d` — identical to the Phase-0 manifest | `certutil -hashfile … SHA256` |
| Migrations | 62 SQL files, latest `0061_vengeful_eternity.sql` (count unchanged since Phase 0) | `ls respin/packages/db/migrations/*.sql` |
| Node / pnpm | see [entry-gate-L0.txt](entry-gate-L0.txt) header | `node --version`, `pnpm --version` |
| Active config | v18 per the owner-run 2026-09-17 export ([00-config-offer-comparison.md](00-config-offer-comparison.md)); not re-observed in L0 — live database reads remain owner-run | none in L0 |
| Model routing (seed = active v18 non-price fields) | generation `claude-sonnet-5`, classification `claude-haiku-4-5` | `respin/packages/db/src/seed.ts:155-156` |

**Baseline prompt bundle versions** (content digests from `promptBundleVersion()` in `respin/packages/modes/src/bundle.ts:218`, computed at this HEAD by a throw-away `tsx` probe that was deleted after the run):

| Mode | Bundle version |
|---|---|
| ideation | `modes/ideation@c4f3e9bc9506` |
| ideaToScript | `modes/ideaToScript@7c9b7d260e78` |
| footageToThesis | `modes/footageToThesis@ab52d134b5a9` |
| sourceToReel | `modes/sourceToReel@cbb957ae3630` |
| analyseAndSpin | `modes/analyseAndSpin@1d70d299f297` |
| hooks | `modes/hooks@344b9be0e52b` |
| caption | `modes/caption@7ab9e01b695c` |

**Lockfile hash definition.** `respin/pnpm-lock.yaml` is `i/lf w/crlf` with no `.gitattributes` pin. `54e684b5…` is the working-tree (CRLF) bytes, as Phase 0 recorded. The committed blob at `3533dbf` hashes to `5e10d56f6752969a22de430026de9c73331efad969fc3adad734b56e4b6d55bd`. Later identity checks compare **the committed-blob hash** (`git show HEAD:respin/pnpm-lock.yaml | sha256sum`), which does not depend on the checkout's line endings.

**Candidate delta since the Phase-0 baseline (`79de2db`).** Three commits (`4a19e04`, `80071b6`, `3533dbf`) change 166 files under `respin/` (+14,537 / −2,874). No migration was added, the lockfile is unchanged, and the 23 `*.docker.test.ts` files are the same set.

## 2. Validation on this candidate

Transcript: [entry-gate-L0.txt](entry-gate-L0.txt), started 2026-09-30T23:48:09+10:00. `TEST_DATABASE_URL` was unset, so the 23 Docker suites were skipped and did not run. This run gives no money-concurrency proof.

| Command | Exit | Result |
|---|---|---|
| `pnpm -C respin preflight` | 0 | `preflight ok` |
| `pnpm -C respin typecheck` | 0 | — |
| `pnpm -C respin worker:typecheck` | 0 | — |
| `pnpm -C respin lint` | 0 | — |
| `pnpm -C respin db:check` | 0 | — |
| `pnpm -C respin build` | 0 | — |
| `pnpm -C respin test` | **1** | 244 files: 220 passed, 1 failed, 23 skipped. 5,870 tests: 5,749 passed, 2 failed, 119 skipped. 524.6 s |

**Red at HEAD, before any L0 change.** L0 changed no file under `respin/`. Both failures are in `respin/packages/credits/tests/isolation.test.ts`:

- `:1219` — "ENUMERATION completeness": `presented-output.ts` is neither enumerated for isolation nor listed internal-with-reason.
- `:1260` — "every exported function of every public entrypoint is covered or excluded-with-reason": `presentedDisclosure`, `presentedTextUnits` and `getTierCheckoutProtocolState` are unaccounted. The export sites are `respin/packages/credits/src/app-server.ts:230` and `:91` / `:504`.

These exports came in with `3533dbf`, which carries the partial audit P1/P6 work and the tier-checkout billing read. **Routing:** L1 owns `presented-output.ts`, so L1's entry gate must clear this. It needs either an isolation case or a reasoned exclusion for each of the three exports; editing the enumeration without that reason does not count. On 2026-10-01 the owner approved recording this as the pre-existing baseline ([entry-baseline.md](../entry-baseline.md), 2 failures). The baseline only shrinks, and L1 clears it.

**Probe hygiene.** The bundle-version probe was a temporary file under `respin/packages/modes/` and was deleted within seconds. It may have been on disk while typecheck or lint ran. Both exited 0, and deleting a file nothing imports cannot add errors, so the green results stand for the tree without it. `git ls-files -o --exclude-standard respin` was empty afterwards.

## 3. Inherited open items, reconciled against this candidate

**Method.** Three read-only reconciliation passes ran at `3533dbf`, one per source family. Each pass cited the code or evidence line it opened. The main session re-opened a sample before recording. Checked and holding:

- `run-copy.ts:745`
- `create-auth.ts:391`
- `generation-outcome.tsx:389-391`
- `claims.ts:725`
- `inference.ts:951` and `inference.ts:790-796`
- `worker/main.ts:69-74`
- `pricing-copy.ts:111-112`
- `with-workspace.ts:2790`
- `app-server.ts:91,230,504`
- `sources.ts:155-160`
- `brain-content.ts:551`
- `preflight.ts:40`
- `seed.ts:52`

Rows marked "unverified — not checked" were not opened at this candidate, and no status is claimed for them.

**Status classes:**

- **fixed-verified:** the fix is in code and a test or gate proves it.
- **fixed-unverified:** the fix is in code with no independent gate.
- **open-code:** no fix yet.
- **external:** needs an environment, vendor or live run.
- **owner-decision:** waits on an owner decision.
- **parked:** held back by an explicit park.
- **trigger:** a deferral whose trigger has not fired.
- **N/A:** outside launch scope.

### 3.1 Closed with proof (not reopened)

- **Journey fixes:** F-02 service half, F-03–F-05, F-07–F-11, F-13 and F-14 closed through service-quality P1. Proof: `entry-gate-phase-1-batch4.txt`, `phase-1-batch4-*.md`, [ledger](ledger.md) line 91. F-18–F-21 Free-path engineering closed through service-quality P2 (`phase-2-batch4-*.md`); their live evidence is still owed (§3.8).
- **G-15** registry guard at module load: fixed-verified. The guard moved to preflight (`respin/packages/db/src/brain-content.ts:551`, `preflight.ts:40`), with its test at `brain-content.test.ts:173-192`. The finish register's Deferred table still lists it as open; that is stale.
- Also fixed-verified: **T69-R14** (`finance-extract.ts:359-384`), **B-2/G-13** (`with-workspace.ts:3536-3537,5260-5263`), the retention receiver, the REQ-A04 deletion executor, and deletion requests closed by default (`deletion-request-enablement.ts:15`).
- The finish register's other closed rows keep their original slice-card proofs (`respin-finish-open-items.md:165-180,221-262,272-321,334-343,394-426,457`). They were not re-checked here.
- Cutdown-only todos T-2–T-5, T-7 and T-9–T-11 do not apply to Respin.
- **The audit-remediation 2026-09-19 plan has no item with closure proof.** No code gate on it has returned PASS.

### 3.2 → L1 (creative contract)

| ID (source) | Item | Class | Evidence at candidate | Owner |
|---|---|---|---|---|
| Entry red (§2) | `isolation.test.ts` enumeration of `presented-output.ts` and three exports | open-code | `isolation.test.ts:1219,1260` | respin-engineer |
| Audit P1-R1 / R3-1 | Model-written disclosure prose rendered as "Disclosure" | open-code | `generation-outcome.tsx:389-391`, `spin-panel.tsx:139-141`; compliant presenter exists only for Sample Spin (`presented-output.ts:39,47`) | respin-engineer; compliance gate |
| Audit P2-R1 | Generative witness for `claims.ts` | open-code | no generative test in `packages/modes/tests/` | respin-engineer |
| Audit P2-R2 / R3-2 | Guarantee / "proven to" claims in caption, hook, VO or thesis | owner-decision → open-code | R-142 not in `decisions.md` | owner: R-142 field population |
| Audit P2-R3/R4 | Shared separator; scan every occurrence | open-code | `claims.ts:725` non-global `match` | respin-engineer |
| Audit P2-R5/R6 | Schema-derived output text population; derived `displayableSpin` | open-code | `presentedTextUnits` exists (`presented-output.ts:60`); other sites not re-opened | respin-engineer |
| Audit P2-R7/R8 | False "not load-bearing" comment; single `[check]` literal | open-code | `claims.ts:519-527` | respin-engineer |
| Audit P2-R11 | Phantom `quote_budget_exceeded`; saturation union vs CHECK | open-code | `trends/src/sources.ts:133,138`, `pasted-reference.ts:539`, `saturation.ts:11` | respin-engineer |
| Audit P8-R2 / REG-18 | `GENERATION_SYSTEM` lacks an untrusted-material clause | open-code | no "untrusted" in the `assemble.ts` system block | compliance gate |
| Audit P4-R7 / 8c-R15 | Spin-reference refusals thrown as bare `Error` ("Something went wrong") | open-code | `trends-storage.ts:1018,1026,1033,1036` | respin-engineer (L1 or L2, whichever edits the file first) |
| Audit P11-R1..R3 | Entitlement brand; single home for autopsy bounds; verbatim echo | unverified — not checked | R-145 absent | respin-engineer; four gates |

### 3.3 → L2 (entry, selection, operation identity) — money prerequisites apply

| ID (source) | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Journey-fixes plan gate | Plan NOT READY, budget spent, post-report edits unverified | owner-decision | `respin-journey-fixes-master-plan.md:5,122` | owner: unpark and re-review |
| F-01 | Tier checkout refused until the rollout row is `active`; no activation runbook | parked | `tier-checkout-rollout.ts:32,140` | owner: unpark and Stripe sandbox |
| F-02 money half | Terminal parse failure consumes the included build | parked | `inference.ts:951` | owner: T6-P / included-build policy |
| SQ-DL auto re-ask | A bounded second metered call exists (`inference.ts:790-796`, `4a19e04`), but the service-quality deferral ledger (`:153`) says it is parked. No billing or compliance verdict is recorded | fixed-unverified; **contradicts its park** | `inference.ts:790-796`; `voice-schema-diagnostics-gate.md:66-68` "Results: Pending" | owner: is this money-track work? It needs a billing verdict either way |
| Audit P3-R1 / REG-1, T69-R6 | Stranded `vendor_complete` hard-cleared at 24 h, no alert, no settle path | open-code + owner-decision | `generation-recovery.ts:8,111,125,142-151,169`; R-134 absent | owner: R-134 settlement owner |
| Audit P3-R2 | Input-token ceiling at `provider.complete` | owner-decision | no `maxInputTokens` in `config/src/schema.ts` | owner: R-135 number |
| Audit P3-R3 | Money cap blind to successful calls | owner-decision | `with-workspace.ts:2204` | owner: window cost bound |
| Audit P3-R5 | Success-path `recordUsage` unguarded | open-code | `generate.ts:1255` | billing gate |
| Audit P4-R5/R6 | False `generate.ts` contracts | open-code | per plan phase-4 | billing gate |
| Audit P8-R1 / REG-38 | Page render blocks on the workspace money lock | open-code | no `pg_try_advisory_xact_lock` / `lock_timeout` in `db/src`; R-144 absent | money unpark; billing and tenancy gates |
| V2 P2 T1/T2 | Task cards, execution-surface metadata, scope-keyed client state | open-code (not started) | `mode-presentation.ts`, `studio-entry.tsx` absent | respin-engineer |
| V2 P2 B-V2-02 | Reference card → `/trends` with a pre-submit Spin quote | open-code | not started | L2 entry; L5/L6 quote witness |

### 3.4 → L3 (bounded context, explicit preferences)

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Audit P1-R5 / REG-29 | `FEEDBACK_TODAY` says "Nothing reads it today", but feedback proposals exist | open-code | `run-copy.ts:745` | owner: R-143 wording; learning gate |
| Audit P2-R9 / REG-46 | R-143 feedback carve-out from rule 4 | owner-decision | R-143 absent | owner |
| Audit P2-R10 / REG-47 | Proposal digest partial index and fallback predicate | open-code | `promotion-ops.ts:263-268`; no migration after 0061 | learning gate |

### 3.5 → L4 (saved recording pack)

| ID | Item | Class | Evidence |
|---|---|---|---|
| V2 P2 T3 | Result tabs and persistent checks | open-code (not started) | `result-workspace.tsx`, `generation-checks.tsx` absent |
| V2 P2 T4 | Beat-index filming strip and cue list | open-code (not started) | `filming-plan.tsx` absent |
| V2 P2 T5 | Local Markdown export | open-code (not started) | `generation-document.tsx` absent |

### 3.6 → L5 (offer and release safety)

**Admission and auth:**

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Obligations signup/OAuth/bootstrap | Sign-up now routes to `/onboarding` and reads `?plan=`; admission rule unchanged | owner-decision | `auth-form.tsx:17,33`; `sign-up/page.tsx:33` | owner: pilot admission rule |
| Audit P5-R8 / REG-4 | Google sign-in onboards accounts that cannot pass reauth-gated billing | owner-decision | `auth-form.tsx:135-147` | owner: hide Google or ship enrolment |
| Audit P1-R9 / REG-16/17 | Rate limit keyed on the non-existent `/forget-password` | open-code | `create-auth.ts:391` | security review |
| Milestone signup / OAuth / mail, T-16 | Live sign-up, OAuth and mail delivery; last live signup 2026-08-14 | external | `create-auth.ts:426,453,473-481` | owner: Resend and OAuth client |
| T-R2-9 | No operator lift for an exhausted auth-mail month | owner-decision | `auth-mail.ts:149` | owner |
| 10a-R7 | Production trusted-proxy list | external | — | deploy owner |

**Money** (needs money unpark):

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Audit P3-R4 / REG-3, E8 dunning | Dunning grace per episode; real `payment_failed` walk | open-code + external | no `dunning_started_at` | owner: R-136 |
| Audit P4-R1..R4 | `credit_ledger` DB mutation guard; mirror writers; workspace predicate; unbounded `reconcileSpend` | open-code | only insert triggers (`0048:270`, `0049:203,315`); `auto-topup.ts:640-643`; `spend-rollup.ts:299` | billing gate |
| Audit P3-R6/R7 | Unbounded auto-top-up restart; metric via `console.warn` | open-code | `auto-topup.ts:67-70,742-743` | billing gate |
| Audit P3-R9 | `provider.complete` site list | open-code | test absent | respin-engineer |
| Audit P8-R5 / REG-19 | Stripe customer created without an idempotency key | open-code | `stripe/customers.ts:101-104` | billing gate |
| F-12 | Billing page ergonomics | parked | `billing-view.tsx:191,457` | owner: unpark |
| T-R2-4/7 | Stripe orphan customers; PaymentMethod billing details | external | vendor walk | owner |

**Offer and copy:**

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Obligations config/checkout, placeholders, page/help/checkout | Customer copy broadly rewritten since Phase 0 (seats line removed; "10 tracked niches, once a source connects"; `/sign-up?plan=` CTAs; checkout fence) | owner-decision | `pricing-copy.ts:111-112`; `settings/billing/page.tsx:82`; `billing-view.tsx:258` | owner: approved offer and copy |
| Audit P6-R1/R2/R4 | Pricing instrument (three pin kinds); unshipped capabilities; meters | fixed-unverified | `landing-pricing.test.ts:166-186`; batch-5 billing BLOCK repaired, not re-reviewed | owner: audit P1/P6 retry batch (2 remain) |
| Audit P6-R3/R5/R7 | Prose pins | open-code | card §2 | respin-engineer |
| Audit P6-R6a / REG-30 | "No results of yours have been logged" shown unconditionally | open-code | `run-copy.ts:272-273`; `first-ideas/copy.ts:110`; `forbidden-claims.ts:185` | tenancy gate plus learning gate (a false absence claim on a results surface) |
| Audit P6-R6b | "Contact support" promised but no channel exists. Literal grep finds 21 lines in 5 files; the card's 47/9 used another predicate, which L5 must pin | owner-decision | no `mailto:`/`support@` in `app/` | owner: support channel or rewording |
| 8c-M2 | Spin sells for 5 credits; cost USD 0.078–0.112 is below the PRD §5 margin | owner-decision | `seed.ts:52` | owner: pricing |
| T-18 | Whether a public-launch flag exists | owner-decision | — | owner |
| 10a-R2, 10c C6 | `/legal` placeholder; legal review | external | `legal/page.tsx:24` | owner: legal |

**Deletion and lifecycle:**

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Audit P5-R1 / REG-10 | Sole-owner identity erasure never terminal | owner-decision | `deletion-lifecycle.ts:884,888` | owner: R-137 |
| Audit P5-R2 / REG-11 | Bootstrap mints a workspace during pending deletion | owner-decision | `bootstrap.ts:65-76` | owner: R-138 |
| Audit P5-R3 / REG-12 | Export and history unavailable in the deletion grace period | owner-decision | `membership-lifecycle.ts:140-157` | owner: R-140; tenancy gate |
| Audit P5-R4/R5 | Dead-end deletion states; deadlock | unverified — not checked | R-139 absent | owner: R-139 |
| Audit P5-R6 | `requested` listed in `CANCELLABLE_STATES` | open-code | `settings/account/page.tsx:43` | respin-engineer |
| Audit P5-R7 | `isUseServerModule` misses a function-level directive | unverified — not checked | — | respin-engineer |
| Obligations journal/restore/scrub/retained/delayed-job, T-17 | S3 journal steps 1–6 appear done; real restore walk not done | external | `RUNBOOK.md:31` "Last production drill: NEVER" | ops owner |
| 10a-R10 | Autopsy 90-day identifier scrub has no receiver | unverified — not checked | — | respin-engineer |

**Operations, telemetry, security and CI:**

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Audit P1-R2/R3/R6/R7 | Outbound allowlist and `originPinnedFetch`; scanner roots; safe-log `;`; retention roots | fixed-unverified (built at `3533dbf`, **unrecorded in the audit ledger**, ungated) | `no-scraping.test.ts:81,248`; `tests/support/source-files.ts:61,72-76`; `safe-log.test.ts:176-190`; `retention.test.ts:36,87`; R-141 | compliance gate |
| Audit P1-R4 | Shared claim-scan helper | fixed-unverified | `claim-scan.test.ts:251` `PLANT_OWED = []`; batch-5 billing BLOCK repaired, not re-reviewed | owner: retry batch |
| Audit P9-R1..R3,R7 | RUNBOOK gate commands, counts test, recovery inputs | open-code | `tests/runbook-counts.test.ts` absent | ops owner |
| Audit P9-R4 | Restore drill migrate-then-verify | unverified — not checked | R-147 absent | ops owner |
| Audit P9-R5 / 8c-W3 | Worker start failure drops its reason | open-code | `worker/main.ts:69-74` | respin-engineer |
| Audit P9-R6 | `system_worker_health` reader | unverified — not checked | — | respin-engineer |
| **T-23 / T-24** | Restore drill, AWS inventory, off-host secrets, worker paging | external; **the rows do not exist** — `todos.md` ends at T-22. The launch master (`:43`) and audit master (`:157-160`) cite them as existing | — | ops owner: create the rows when audit P9 lands |
| Audit P9-R9 / REG-42 | drizzle-orm 0.44.7 → ^0.45.2 (GHSA-gpj5-g38j-94v9) | open-code | `pnpm-lock.yaml`; `packages/{db,credits,config}/package.json` `^0.44.0` | billing and tenancy gates plus a live-DB run |
| Audit P9-R10/R11 | Audit schedule; SHA pins; `ignoreCves` vs `ignoreGhsas` | open-code | `.github/workflows/respin.yml:113` | respin-engineer |
| Audit P8-R6 | tech-spec package map is wrong | open-code (doc) | `tech-spec.md:34-35` | respin-engineer |
| Audit P7-R1..R5, P10-R1..R7 | Contrast, redirect focus, marquee pause, page titles, aria-describedby, mojibake, table scope | open-code (P7-R4 half done) | `landing-base.css:150`; `brain-view.tsx:518,626` "â€¦"; zero `scope="col"` | respin-engineer; a11y review |
| 8c-G5 | Minified error class unnamed in logs | open-code | `safe-log.ts:62` | respin-engineer |
| 8c-W1 | A dated served-model id has no price row, so autopsy fails on a fresh install | open-code + owner-decision | `autopsy-vendor.ts:178-196`; `seed.ts:155-163` prices aliases only | owner: choose option |
| 8c-L1 | 53 s per script, no streaming | owner-decision | `tech-spec.md:134`; `llm/src/anthropic.ts:142` | owner: accept or fix |
| T69-R4 | Finance `workspace_key` is an unkeyed sha256 | open-code | `retention-receiver.ts:326` | respin-engineer |
| T69-R2, R9–R13, R16; T4-R5/R9; 8c-R17; 10a-R1/R3/R9/R11 | Assorted Low/Info residuals | unverified — not checked | `respin-finish-open-items.md` rows | respin-engineer |
| Obligations collectors / alert recipients / incident-rollback owners / support contact | Code gained origin pinning and class-only sink logs; the accounts and names are still missing | external + owner-decision | `telemetry-sinks.ts:256`; `metrics.ts:113` | owner: named recipients and owners |
| 10a / 10b-1 re-review | Final fixes never independently re-reviewed | owner-decision | `respin-finish-master-plan.md:187-188` | owner: round 3 |
| T-20 (R-1..R-5, R-10..R-12) | CI-scanner hardening | open-code (Low) | `scan-journey-notes.ts:158` | pre-deploy |
| Audit P1-R8 | `scan-journey-notes` interpolates an unescaped constant | open-code | `scan-journey-notes.ts:32` | respin-engineer |

**Reference intake:** at this candidate the registry is exactly `{youtube, submitted}` (`respin/packages/trends/src/sources.ts:155-160`). Instagram and TikTok retrieval are still absent, so URL analysis for them stays unavailable. [00-reference-matrix.md](00-reference-matrix.md) still holds.

### 3.7 → L6 (integrated acceptance and pilot)

| ID | Item | Class | Evidence | Owner |
|---|---|---|---|---|
| Witness files changed since Phase 0 | Phase-0 "green" citations predate the changes, so they need fresh runs: `action-gate` (regex → AST), `safe-log`, `landing-pricing`, `changelog`, `sample-spin-copy`, `profile-scope`, `infer-voice` | superseded by the §2 full run (all green except `isolation.test.ts`) | [entry-gate-L0.txt](entry-gate-L0.txt) | — |
| 23 Docker suites | Never run on this candidate | external | `TEST_DATABASE_URL` unset | owner: authorised disposable test DB |
| T69-R7/R17, 9a-G1 | Suite exit status depends on machine load | open-code | `table-writers.test.ts:1226` `timeout: 420_000` | respin-engineer |
| V2 P5 F4 | Actual-app journeys: isolated DB, fail-closed transport, debit/lineage, zero-spend navigation | open-code (not started) | `playwright.integration.config.ts`, `e2e/integration/*` absent | respin-engineer |
| Service-quality P2 AC3 | Local four-spec journey run | external | `ledger.md:99`; artifacts predate 09-19 | owner: sanction about 7 vendor calls |
| T-19 / AC6 / AC1-live | Merge, `journeys` Environment, first dispatch, spend ceiling; `4a19e04` is not on `origin/main` | external | `respin-journeys.yml:27-28` dispatch-only | owner (deferred to cloud readiness, 2026-09-19) |
| T-21 | First GitHub run of `respin-visual.yml` | external | `.github/workflows/respin-visual.yml:35-44` | owner |
| F-17 paid path, SQ-DL paid chapters | Paid-tier journeys in CI | parked | Free-path only | owner, if a paid pilot is chosen |
| Finish walks S6/S7/S8/WK, 10a-E1/E2 | Vendor acceptance walks: 0 of 8 done | external | `docs/runbooks/respin-vendor-acceptance-walks.md:459-471` blank | owner |
| E9 debit refused | Zero balance refuses before the vendor call | fixed-verified at test level; live walk NOT RUN | `generate.test.ts:1053-1066`, `inference.test.ts:299-316` | — |
| bad_shape | Voice build refused undiagnosably | fixed-unverified (issue-path logging plus one retry) | `llm/src/assemble.ts:168`, `safe-log.ts:161-171`, `tests/voice-schema-diagnostics.test.ts` | billing and compliance verdicts owed |
| Docker-suite count drift | `CLAUDE.md:73` "two", `docker-compose.yml:15` "nine", finish master `:182` "all 12", against 23 files | open (docs) | unchanged since Phase 0 | owner-assigned drift track; **L0 does not edit `CLAUDE.md`** |

### 3.8 Outside launch, or trigger not fired (kept, not scheduled)

- **Triggers not fired:**
  - 8c-C4: refund budget per spelling; one caller, `pasted-reference.ts:489`. Activates only if T6-P adds a second caller.
  - 8c-C9: whole-`/trends` refusal; `adjustCredits` has no production caller. Not picked up without authorised operator tooling.
  - T-8: analytics consent → J4.
  - T4-R8, T4-R10–R12; 8c-R14/R16; R-114, 9a-D1/D2/U1 → J4/J5.
  - Audit deferral ledger rows (`master:161-173`).
- **Outside launch:**
  - Seats and 10b-2 (F-15/F-16, task 41).
  - 10c apart from C6.
  - Sample Spin residuals 10a-R4–R6/R8/R12–R15 and audit P3-R8 (a Sample Spin rebuild is a non-goal).
  - T-15 YouTube key, unless an adapter is enabled.
  - T-22 manual screen reader (R-133; never reported as passed).
  - V2 P1 whole-programme acceptance (its batch 4 has no result) and P3/P4/F6 → J1/J2/R1.
  - F-06 dev-DB residue.
  - REQ-G05 margin dashboard → J5/R3.
  - Audit P2-R12 connector closure → J4.

### 3.9 Contradictions found (recorded here, not repaired in L0)

1. The audit P1/P6 card (`phase-1-and-6-card.md:3,81`) and the audit master's Progress row say P1-R2/R3/R6/R7 are untouched. `3533dbf` contains them built. The audit ledger's "Build — Phase 1" section is empty.
2. That card's §2 lists six plantless consumers, but the tree has `PLANT_OWED = []`.
3. R-141 was written after R-133 while R-134–R-140 are unwritten. That breaks the audit master's "next free number at landing" rule (`:78`).
4. The service-quality deferral ledger parks the automatic re-ask, but `4a19e04` built it (§3.3).
5. The finish register lists G-15 as open; it is closed (§3.1).
6. The launch master (`:43`) and audit master (`:157-160`) cite T-23/T-24 as existing; they are not in `todos.md`.
7. Commit `3533dbf` is titled "Visual v2 phases 1-3", but only P1 files exist on disk.

L0 records these contradictions and does not edit the other plans. Each belongs to its owning plan's next edit.

## 4. Approvals and named owners

Each decision is **pending** until an owner answer is recorded, with its date, in the [ledger](ledger.md). Only Q-0 has been answered so far. A pending item blocks only the work that depends on it (plan L0 pass/fail). A role label is not an appointment: each "owner" cell needs a real person's name recorded before paid research or release.

| # | Decision | Blocks | Safe default while pending | Status |
|---|---|---|---|---|
| Q-0 | Record the `isolation.test.ts` red (§2) as a pre-existing baseline? | L1's validation gate | — | **Answered 2026-10-01: record the baseline** → [entry-baseline.md](../entry-baseline.md). L1 clears it. |
| A-1 | Unpark the money track, and authorise the journey-fixes plan re-review whose review budget is exhausted | L2 monetary changes; L5 billing work | Parked contract preserved | **Answered 2026-10-04:** unpark T6-C (operation identity/recovery) only, for L2; run the journey-fixes plan re-review (batch 3) first; F-01/F-02/F-12/F-05 stay parked until L5. |
| A-2 | Creative form, taste and custom-structure amendments to REQ-C01/C02/D02 | L1 new writer and eligibility behaviour | Legacy writer stays; no "three forms" claim | pending |
| A-3 | TikTok/Instagram targeting amendment; PRD §5 / `NORTH_STAR.md` measurement amendments | New positioning; changed success definitions | Historical decisions kept | pending |
| A-4 | Launch offer and transition; optional full-workflow trial; optional T6-P settlement policy | New payable offer; changed settlement | Current terms and refusal policy | pending |
| A-5 | Research consent, provider budget, sample and threshold freeze (§5) | Live T1 evaluation; L6 LA-4 | Synthetic fixtures only; no creative-quality pass | **Answered 2026-10-03 (recommended options, [L0 Research Inputs](../../L0%20Research%20Inputs.html)):** thresholds accepted as written in §5.6; allocation plan 5 creators × 4 briefs, 10 TikTok / 10 Instagram, forms 7/7/6; development set of 10 (two per supplied account) collected separately; USD 60 per look + USD 20 setup caps approved; no development-call budget approved. **Still factual gaps (block LA-4 only):** written four-use consent scope, eligible independent roster (a fifth creator independent of the owner's own channel), restricted storage location and retention terms. |
| A-6 | Intake authorisation and provider terms for any new platform adapter | Any new adapter | `{youtube, submitted}` with stated limits | pending |
| A-7 | Pilot admission rule; operations owners; restore/alerts/support; release authorisation | L6 pilot and deploy | Candidate stays unadmitted | pending |
| A-8 | Unwritten decision records the audit plan needs: R-134 (stranded-settlement owner), R-135 (input-token ceiling), R-136 (dunning episode), R-137–R-140 (deletion), R-142 (claim field population), R-143 (feedback carve-out), R-144 (lock), R-145, R-147 | The matching §3 rows | Rows stay open-code | pending |
| A-9 | Audit P1/P6 code gate: spend one of the 2 remaining retry batches on the repaired batch-5 BLOCK? | L5 rows marked fixed-unverified from audit P1/P6 | Those rows stay unverified | pending |
| A-10 | Finish 10a/10b-1 round-3 re-review | L5 reuse of 10a/10b-1 evidence | Evidence not reused | pending |
| A-11 | Is the automatic voice re-ask (`inference.ts:790-796`, §3.3) money-track work, and does it need a billing verdict before L2? | L2 | Treated as fixed-unverified billing surface | **Answered 2026-10-04:** money-track work; stays fixed-unverified; billing verdict at L5 with F-02/T6-P; L2 fenced from voice-purpose usage accounting. |
| A-12 | Google sign-in (hide it, or ship enrolment); support channel; public-launch flag (T-18); 8c-M2 spin price; 8c-L1 latency (accept or fix); 8c-W1 model-price option | L5 | Current behaviour, described truthfully | pending |
| O-1 | Named owners: product/launch owner, research owner, independent quality rater(s), operations owner, alert recipients, incident/rollback owners, support contact | Paid research; release | None appointed | **Partly answered 2026-10-03:** Fred is product/launch owner, operations owner (infrastructure only), alert recipient and incident/rollback owner. **Unappointed (no name invented):** research owner, independent rater(s), support contact (existing recruitment conversation proposed, not verified as monitored — audit P6-R6b stays open). |

## 5. Frozen evaluation manifest — `LR-EVAL-1`

This manifest is the measurement contract for L6 LA-4. It is fixed **before** any evaluation run.

**Version and run discipline.**

- Each run gets a sequence number: `LR1-R1`, `LR1-R2`, and so on. A run is one arm over the frozen brief set.
- **Every run stays reported,** including incomplete, superseded and failed runs. None is voided, discarded or hidden.
- **Only a first candidate look on a never-exposed brief set can satisfy LA-4 or support pilot admission.** A later candidate look on LR1 (look k > 1) is reported as a **diagnostic only**. It is never an admission result, whatever it scores.
- A retest that may satisfy LA-4 uses a **fresh** brief set, `LR2`, `LR3` and so on, of fresh tasks **and** untrained participants under this same manifest (plan `:168`). An **untrained participant** has judged no earlier look on any set, and none of their per-brief rows from any set has reached an L1–L3 implementer, director or tuner. Each set is frozen before its first run, under §5.1–§5.2.
- **The rubric, thresholds, denominators, the provider-call and USD caps, the stop rule and the verbatim judge and rater instructions are immutable for every look on a given brief set.** No cap is raised mid-look. A manifest change applies only to brief sets frozen after it. It never re-scores a completed run, and it is recorded as a new manifest version with a date.

**Frozen now:** design, rules, rubric, denominators and reporting.

**Owner-supplied before the first run:** brief set, participants, consent records, research profiles, USD cap and threshold acceptance (A-5, O-1).

**Relation to the learning loop.** This is a creator-quality evaluation, not Results learning. No evaluation outcome is written to `results`, feeds `packages/brain`, creates a promotion proposal, or is shown to any creator as performance evidence. §5.3 gives the execution mechanism and the assertions that prove this. The evaluation measures preparation quality. It is not audience reach or conversion, and nothing in it is reported as either.

### 5.1 Brief population

- **Size and spread:** 20 permissioned briefs from at least 5 suitable creators. No creator contributes more than 5 briefs.
- **Participant eligibility:** no participant is, or is affiliated with, the product/launch owner, an L1–L3 implementer, director or tuner, the research owner, the operator, a rater or the deployment/database administrator. An account belonging to a business one of them owns or works for counts as affiliated. Before freeze the research owner privately verifies that each code maps to a distinct eligible person. The owner's own channel is development-only.
- **Generalisation limit:** development briefs come from the same supplied accounts, so the split is by brief, not by creator. Every report says the result generalises to new briefs from known creators, not to new creators.
- **Platforms:** each platform (TikTok, Instagram) is the primary target of at least 8 briefs.
- **Forms:** each creative form (`explain_opinion`, `demonstration_experiment`, `personal_story_observation`) is the brief's **assigned form** in at least 5 briefs. The assigned form comes from what the creator wants to make and is a frozen field of the brief.
- **Brief content:** a no-concept brief. It holds four frozen fields, and nothing else:
  - approved creator context;
  - platform;
  - assigned form;
  - optional constraints (solo/help, time, location/equipment/footage).
- **Brief identity:** each brief has a stable ID `LR1-Bnn` and a sha256 of its frozen text.
- **Consent:** each participant's written permission covers four things:
  - storing the brief and outputs in restricted research storage;
  - a named rater viewing them;
  - runs in a research-owned profile;
  - the recorded analysis.

  A brief without consent is not in the set. It is never stored first and consented later.
- **Privacy:** brief and output content, rejection reasons and S-flag details live only in restricted research storage. They never go into general analytics, telemetry, the ledger, this card or git. Records outside that storage cite brief IDs, pseudonymous creator codes (`LR1-Cn`) and hashes only. A hash stored in git is **salted** with a research-owned secret that is never committed, so a short, low-entropy brief cannot be guessed from its hash.

### 5.2 Holdout and contamination

- **All 20 briefs are held out.** No brief, text from one, or per-brief result from one is used to write or tune L1–L3 prompts, checks, fixtures or examples.
- **Development briefs,** if any, are a separate set from separate sessions. They are listed by ID before the first run of either arm. Tuning evidence comes only from them.
- **Who holds what:** see §5.7 (the sealed admitting look). Per-brief holdout content is held only by the §5.7 handler list. **It is never released to an L1–L3 implementer, director or tuner, before or after the admitting look closes.** After close they receive only arm-level totals: the C, F and S counts per arm and the per-creator, per-platform and per-form cells of §5.6, with no per-brief rows and no quoted reasons. Correction batches are built from development briefs and from first observed pilot creators outside any holdout, never from a holdout's per-brief rows.
- **Set changes:** the brief ID list and salted hashes are recorded in the ledger before the first run of either arm. After that, the set changes **only** by consent withdrawal. It is never added to or back-filled.

### 5.3 Arms, execution isolation and identity

- **Comparison type:** this is a **workflow-against-workflow** comparison. The two arms differ at once in selection path, input channels, form control and output contract. No difference between them is attributed to any single L1–L3 change.
- **Baseline arm:**
  - Build: candidate `3533dbf`, config version as observed per run (see identity), generation model as served.
  - Concepts: `modes/ideation@c4f3e9bc9506`. Its input is the brief serialised by frozen template **T-B1** into the "What they want ideas about:" box (`respin/packages/modes/src/assemble.ts:459`). The platform uses its own field.
  - Concept count: `ideation` returns 3–5 ideas (`respin/packages/modes/src/modes.ts:261`). **Only the first three, in returned order, are judged.** The returned count is recorded.
  - Script: the selected idea is developed with `modes/ideaToScript@7c9b7d260e78`. Its input is the selected idea's text plus the brief's constraints, serialised by frozen template **T-B2** into "The idea:" (`assemble.ts:408`).
  - Known limit: `ideaToScript` assumes "a person filming alone" (`assemble.ts:412`). Baseline F is therefore judged against declared resources the baseline had no structured channel for. This limit is stated in every report.
  - Templates: T-B1 and T-B2 are byte-exact texts, hashed in the ledger before the first run. Applying them is mechanical and the operator makes no judgement. Pasting under these templates is the only permitted input, which reconciles it with rule 5.4-1.
- **Candidate arm:**
  - Build: the integrated L1–L3 build.
  - `formChoice`: the brief's assigned form, sent as the explicit value. It is never `auto` and never an operator choice.
  - Selection path: the concept is developed through L2's selection path.
  - Recorded per output: requested form and resolved form.
  - Frozen identity: before its first run, the ledger records the commit, lockfile blob hash, per-mode bundle versions, output contract version, config version and model id.
- **Environments:** each arm runs on its own deployment and its own database. The baseline is at `3533dbf`'s schema; the candidate is at its migrated schema. Both run on the same tier, and every evaluation workspace is on that tier. A Studio workspace allows at most 5 profiles (`profileCaps`, `respin/packages/db/src/seed.ts:78`), so the 20 profiles per arm span at least 4 research-owned workspaces per arm.
- **Execution isolation (both arms):**
  - Each (brief, arm) pair runs in a **fresh research-owned profile**. No profile is reused across briefs or arms.
  - **Context setup uses only the product's sanctioned writers.** Four steps:
    1. The creator's frozen context inputs are appended as onboarding inputs.
    2. Strategy and Kill Test are written through `submitInterview` (`respin/packages/db/src/interview-ops.ts:516`).
    3. Voice gets its first version through the product's voice build, then is edited to the frozen reference Voice text through the brain editor. The brain editor can add list items but cannot remove them (`respin/packages/db/src/brain-ops.ts:799-800,828-834`), and the build returns 1–5 items per list (`respin/packages/credits/src/infer-voice.ts:77-88`). So **every reference Voice list holds exactly 5 items**, which any build can be edited up to. A setup that still cannot reach the reference hash is redone in a fresh profile on the setup budget, before exposure. It is never run and never counted as an isolation failure.
    4. Each document is confirmed and activated by the research operator.

    No raw SQL and no import path are used.
  - **"Identical context" means** equal sha256 of each activated brain document's content (Voice, Strategy, Kill Test) **to a per-creator reference hash recorded in the ledger before the set's first exposure**. It is asserted per (brief, arm) from the brain snapshot named by each generation's `brain_activation_id`, against that pre-recorded value and not only across arms. A mismatch found after exposure demotes the look (§5.7).
  - **Setup model calls** (voice builds) are counted under their own recorded setup budget. They are not part of the evaluation's call and USD caps (§5.6).
  - **L3 context:** the recent-work window holds no records at run start. The candidate may legitimately see its own run's concept set, since L3 ranks the current piece first (plan `:113`). The assertion is that every record ID stored with the request snapshot belongs to that same (brief, arm) run.
  - Feedback, "Remember this", proposal and Results controls are **not used**. **Structural guarantee:** a feedback proposal needs at least 3 distinct generations in one profile (`MIN_COMPARABLE_RESULTS`, `respin/packages/brain/src/proposal.ts:355`). A fresh single-run profile holds at most 2, so it cannot produce one. The row counts below are the second, independent check.
- **Proof of isolation:** the counted set is frozen **per build** before that arm's first run.
  - Baseline: `generation_feedback`, `promotion_proposals`, `results` and `brain_docs`.
  - Candidate: the same four, plus L2/L3's new tables as landed, for example `creative_pieces`.
  - A table absent from a build is recorded **n/a**, never 0. For each evaluation profile, before/after counts scoped to that profile and to these named tables only must show no change except the run's own rows. Ledger, usage and spend tables are expected to change and are not counted.
  - An isolation failure is reported as **its own category**, per arm, beside the paired 2×2. The brief still counts as not acceptable in that arm's x/20 (absent is never a pass). Any isolation failure in either arm means the comparison is reported with that brief excluded from the paired cells and named.
- **Order:** arm order is randomised with **balance within each creator**: each creator's briefs split as evenly as their count allows between baseline-first and candidate-first. The brief run order is fixed and recorded before the first run.
- **Recorded per run and per output, both arms:** config version as observed at run time, the **served dated model id**, prompt-bundle and context versions, provider-call count, failed and repair calls, total tokens and cost.
- **Model match:** the served generation model id must be identical across arms for a brief. A mismatch is reported as a named confounder on that brief's paired row.
- **Double context:** the baseline receives approved context twice (the T-B1 text box plus brain docs), while the candidate receives it once. This is part of the stated "input channels" difference.

### 5.4 Assistance rules

1. The operator enters the brief only through the fields and the frozen templates in §5.3. No prompt edits and no other text.
2. **One run per brief per arm per look.** No re-roll and no "new generation". The only retries allowed are the product's own bounded automatic rewrite and transport retries of the same operation.
3. A product clarification request is answered only from the frozen brief record. If the answer is not there, the operator answers "unknown", and the run continues or ends as the product decides.
4. The creator selects **one** of the (first) three concepts to develop, or records "none acceptable".
5. **No manual edit before rating.** The creator's own later edits are recorded as rewrite reasons (LA-5); they are not part of the rated output.
6. A refusal, timeout, error, isolation-assertion failure or abandonment is a result. It stays in the denominator as a failure, with its reason.

### 5.5 Rubric (binary, with reasons)

**Rendering and blinding.** Every output of both arms is judged on the unedited output, rendered through **one neutral template** (a fixed field order and wording). Arms are labelled to every judge only by a random code per brief. The code-to-arm key stays with the research owner until all judging closes.

**Blinding is partial.** The arms fill different fields: baseline ideas carry hook, thesis and framework; candidate concepts carry premise and filming fields. So the filled fields can reveal the arm. Each judge records an **arm guess** per output. The guess accuracy is reported beside C and F as the blinding check.

- **C — concept adoption (per brief, creator-only):** acceptable when at least one of the three judged concepts is one the creator would choose to develop without a major change of premise. Recorded with the chosen index and a one-line reason for each rejected concept. The independent rater's view is recorded as an **unscored** agreement field.
- **F — filmability (per brief, two judges):** judged on the selected concept's script and shooting plan. Acceptable when the creator could film it with the declared resources and time, with only minor changes, and without inventing anything. The creator and one independent rater named under O-1 judge it. **Disagreement scores not filmable** and is reported as a disagreement. A brief with no selected concept, or no delivered script, scores not filmable. It never leaves the denominator.
- **S — safety flag (per output, either judge):** set when **either** judge finds either of two things:
  - a material invented personal claim, meaning an event, number or experiment result not in the brief or context and not marked `[check]`;
  - (candidate only) an output that does not satisfy its resolved form.

  S is recorded per output, both arms, with a category. It is never "resolved" away after the fact: an S flag stays on the run.
- **Also recorded, never scored:** preparation effort, the creator's rewrite reasons, latency, and the ideation returned-count (baseline).

### 5.6 Thresholds and reporting

- **Proposed pass for the candidate arm** (owner acceptance required, A-5). All of the following must hold:
  1. C ≥ 16/20.
  2. F ≥ 16/20.
  3. **Every creator** has acceptable C on strictly more than half of their frozen briefs **and** acceptable F on strictly more than half of their frozen briefs: 3 of 4 at the planned allocation (also 3 of 5, 2 of 3, 2 of 2). A withdrawn brief counts as not acceptable for this floor, as it does for x/20.
  4. **Zero** S flags across all candidate evaluation outputs.
  5. It is an admitting look under the version and run discipline above.

  The run must also be complete: an incomplete run cannot pass.

  **Owner release.** Any S flag, or any creator below the per-creator floor, withholds the pass. A named owner disposition may release it for admission purposes. A released result is **always reported as "not passed — released by <owner> on <date>; S = k; creators below floor = m"**. It is never reported as a pass, and never as "resolved".
- **Denominator:**
  - C and F are each out of all 20 frozen briefs, including failures, refusals, isolation failures and abandonments.
  - A brief withdrawn because consent was revoked is reported as withdrawn, and the result is shown as x/(20 − withdrawn) and x/20.
  - The threshold is judged only on x/20, with each withdrawn brief counted as not acceptable.
- **Breakdown:** C, F and S are reported per creator code, per platform and per form, with n in every cell. Requested versus resolved form is reported for the candidate. No cell is pooled into a rate that hides a failing creator.
- **Baseline comparison:** reported side by side with n, as a **paired brief-level 2×2** for C and for F (both pass / baseline only / candidate only / neither), plus S counts per arm.
  - Wording: a workflow-against-workflow comparison on this sample and this look only. It is never a general uplift, growth or causal claim (learning-honesty L7), and it stays "in pilot".
  - Every look is reported.
- **Separation of claims:** engineering completion (L1–L4 gates) and evidence completion (this manifest) are reported as separate claims.
- **Spend ceiling (proposed):**
  - Planned commissions: 2 arms × 20 briefs × 2 commissions (concept set, then script) = 80 commissioned generations per look.
  - Provider-call cap: 320 per look. At `3533dbf` one generation makes up to three provider calls: the draft, one bounded rewrite and the creator-rule scoring call on the classification model (`respin/packages/credits/src/generate.ts:14-15,449-452,934-948`). So 80 commissions × 3 = 240, plus 80 calls of headroom for transport retries of the same operation. The candidate arm's per-generation bound is re-derived from its frozen build identity before its first run; if it exceeds three, the cap is re-derived the same way and recorded before exposure.
  - USD cap: the owner set USD 60 per look and USD 20 for setup on 2026-10-03, against a 240-call planning scenario. Before the first run the research owner re-checks USD 60 against the 320-call scenario at the calibrated per-call cost and records the result. Any change is an owner decision made before exposure, never during a look.
  - Stop rule: the run stops when either cap is reached. Briefs are run in the fixed recorded order, so which briefs fall off is not a choice. A stopped run is reported as incomplete, cannot pass, and every unrun brief scores 0.

### 5.7 The sealed admitting look (round-3 class fix)

Rounds 1–3 each closed named acts. This section defines the admitting look as one sealed object, and every earlier rule in §5 is read through it.

1. **Exposure.** A brief set is **exposed** at the first run of either arm on any of its briefs, or the first time any per-brief content leaves the handler list below, whichever is earlier. Baseline and candidate runs both expose.
2. **The admitting look.** Each brief set has exactly one admitting look: the look that contains the set's first exposure, both arms together, in the recorded run order. It **closes** when every C, F and S judgement and the arm-key reveal are recorded in restricted storage, with the close date in the ledger. Every later look on that set is a diagnostic, whatever it scores.
3. **Abort.** A run of either arm that is stopped, aborted or restarted for any reason, including an infrastructure failure, ends the admitting look as **not passed**. It is reported with its reason, and the set is spent for admission.
4. **Handler list.** Only these roles may see per-brief content, during or after the look: the research owner, the operator, the independent rater(s), each participating creator (their own briefs only), and the deployment/database administrator of the evaluation environments. **Each is a different person from every L1–L3 implementer, director or tuner and from the product/launch owner.** A handler never becomes an implementer, director or tuner for work evaluated on a set whose rows they saw. Their names are recorded under O-1 before freeze. A handler who is also an excluded person demotes the look.
5. **Per-brief content (the withheld population).** Brief text; baseline and candidate outputs; C, F and S judgements; rejection and rewrite reasons; S-flag categories and details; refusal codes, errors, timeouts and abandonments per brief; per-brief call and cost rows; arm guesses; the code-to-arm key.
6. **Identity lock.** Before exposure the ledger records each arm's frozen identity (§5.3) and the per-creator reference brain hashes. During the look nobody deploys, migrates, reconfigures, re-prompts or edits brain content in either environment. **Any output whose recorded commit, lockfile blob, bundle version, output contract version, config version, served model id or brain-document hash differs from its frozen value demotes the whole look to a diagnostic and ends it as not passed.**
7. **Demotion is reported, never hidden.** A demoted or aborted look stays in the report with its reason, under the run discipline above.

## 6. Report card

**Overall: Not yet.** L0 pins the candidate, reconciles the inherited open items and records the owner's 2026-10-03 answers to A-5 and part of O-1. The owner-authorised third learning-honesty run ([round 3](L0-learning-round3.md)) found N1's class still open: the admitting look was not a sealed object. That is the third instance of the class, so the same-finding recurrence rule applies and no further reviewer run is spent. The class fix is applied as §5.7 (exposure, one admitting look, abort, an explicit handler list kept separate from L1–L3 implementers and the launch owner, the withheld population, and an identity lock that demotes the look), with the five Medium and two Low items fixed. It is unverified. The manifest binds only L6 LA-4, which also waits on a roster, consent scope, storage and an independent rater. **Next action:** the owner decides whether to accept L0 as it stands, with the manifest re-verified by one independent run before LA-4's first exposure, so that L1 can start. Nothing was released, committed or pushed.

**Owner disposition, 2026-10-03:** L0 accepted as it stands; the headline still reads what the findings say. Condition: one independent run on §5/§5.7 before LA-4's first exposure. L1 may start.

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | red, at the recorded baseline (2) | Six commands exit 0; `pnpm -C respin test` exit 1, with 2 pre-existing failures in `isolation.test.ts`, recorded in [entry-baseline.md](../entry-baseline.md) with owner approval. Docker suites not run. [entry-gate-L0.txt](entry-gate-L0.txt) |
| Respin learning honesty (`respin-learning-reviewer`) | Not yet — Almost C, after an owner-authorised third run | Round 1: [NEEDS CHANGES C](L0-learning-round1.md), all fixed. Round 2: [NEEDS CHANGES C](L0-learning-round2.md), N1 survived. Round 3 (2026-10-03): [NEEDS CHANGES C](L0-learning-round3.md), 1 High (N1 class, third instance) / 5 Medium / 2 Low. Class fix §5.7 applied, unverified; Mediums and Lows fixed. |
| Acceptance criteria | 4/6 | See the acceptance proof lines below. AC-4 (frozen manifest) is open on N1. AC-5 (manifest reviewed against the obligation register) is unverified. |
| Least-confident probe | broke, then repaired | Round 1 probed the baseline-arm fairness bet: it held as workflow-against-workflow only (M1). Round 2 probed the isolation-design bet: it broke — a brain restore is not a product operation, and `creative_pieces` is absent at the baseline. Repaired by N2/N3 (§5.3). |
| Reachability | lands in L6 (LA-4) | The manifest is consumed by L6. The reconciliation (§3) routes 100+ items to L1–L6/J/R, and 16 are parked or have triggers that have not fired (§3.8). |
| Fixed without re-review | 18 | Listed below. |
| Gate ran | 3 runs · 2 re-runs (the third owner-authorised) | Announced before each dispatch. |
| Gate intensity | lean | Only one path was touched (learning honesty). No billing, tenancy or compliance code was touched: L0 is docs-only. |

**Top things to fix (in order):**
1. `docs/progress/creator-ready/L0-card.md` §5.7 — the sealed-look class fix (round 3 High) is unverified. Owner call: accept L0 and re-verify the manifest once before LA-4's first exposure, or stop here.
2. §4 A-5 and O-1 — the research consent, participants, USD cap, threshold acceptance and named research owner and rater. Without them the manifest has no brief set, and L6 LA-4 cannot run.
3. `respin/packages/credits/tests/isolation.test.ts:1219,1260` — the baseline red. L1 clears it before its own gate.

*Ask `/go` to explain any finding in plain words — or to just fix them.*

### Acceptance proof (plan L0 pass/fail)

- **AC-1 exact candidate:** §1, HEAD `3533dbf`, dirty docs-only diff hashed, lockfile blob hash, migrations and bundle versions. Met.
- **AC-2 every inherited applicable open item and owner:** §3.2–§3.9, from three read-only passes plus 16 spot-checked citations. Met for enumeration. Rows marked "unverified — not checked" claim no status.
- **AC-3 each approval:** §4. Q-0 is answered; A-1–A-12 and O-1 are recorded as pending. Met, as identification only.
- **AC-4 frozen evaluation manifest:** §5 `LR-EVAL-1`. Design frozen; owner inputs pending. Learning gate **Not yet** (N1 unverified). Not met.
- **AC-5 manifest reviewed against the obligation register:** not done by an independent reviewer. The round-1 reviewer did not read `00-obligation-register.md`. **Unverified.**
- **AC-6 phase proof in the existing ledger:** the [ledger](ledger.md) line dated 2026-10-01. Met.


### Gate round 1 — fix record

The round-1 learning-honesty review returned NEEDS CHANGES, Grade C: 2 High, 6 Medium, 3 Low and 4 Info findings. Each fix below closes the whole class of problem, not just the instance.

- **H1 — the holdout could be re-run until it passes.**
  - What broke: "voids that run", unlimited candidate re-runs and "new manifest version" brief edits together let an unfavourable look be discarded and the brief set change.
  - Fix: runs are sequence-numbered and every run stays reported. A rule change never voids a completed run. A retest uses fresh briefs, or is labelled look k. The brief set changes only by consent withdrawal (§5 preamble, §5.2).
  - What now catches it: rules §5 "Version and run discipline" and §5.6 "every look is reported".
- **H2 — the context and proposal isolation claims had no mechanism.**
  - What broke: the arms shared the product's context, feedback and proposal paths (`packages/brain/src/proposal.ts:338-352`, `promotion-ops.ts:263-279`, L3's recent-work window).
  - Fix: each (brief, arm) pair runs in a fresh research-owned profile with the snapshot restored, an empty recent-work window, and feedback and Results controls unused.
  - What now catches it: before/after row-count assertions on `generation_feedback`, `promotion_proposals`, `results`, `creative_pieces` and `brain_docs`. A failed assertion counts as a brief failure (§5.3).
- **Medium and Low fixes:**
  - Baseline serialisation templates T-B1/T-B2; first three of 3–5 ideas; the "filming alone" limit stated; workflow-against-workflow labelling (§5.3).
  - C is creator-only, F uses two judges, a neutral rendering template, random arm codes (§5.5).
  - Per-creator pass condition (§5.6).
  - `formChoice` equals the assigned form, with requested and resolved form recorded (§5.1, §5.3).
  - S set by either judge, reported per arm, and gating the pass (§5.5, §5.6).
  - Per-brief holdout results withheld from implementers (§5.2).
  - Balanced randomisation by creator; fixed run order (§5.3).
  - Config version and served model id recorded per run (§5.3).
  - Call cap with retry headroom; an incomplete run cannot pass (§5.6).
- **Info fixes:**
  - Paired 2×2 reporting (§5.6).
  - REG-30 routed to the learning gate as well (§3.6).
  - Salted hashes and pseudonymous creator codes (§5.1).
  - Citations re-checked: `modes.ts:261` `ideaCount {min 3, max 5}`, `assemble.ts:408,412,459`.

### Gate round 2 — fix record

The one permitted re-run returned NEEDS CHANGES, Grade C: 1 High, 5 Medium, 4 Low and 2 Note findings.

**N1 (High, a recurrence of H1's class).**

- **Diagnosis:** the round-1 fix removed "voids that run" but kept an escape. It allowed "look k on LR1" as an alternative to fresh briefs, and it released per-brief holdout rows at candidate freeze. It treated the voiding symptom, not the class, which is: *any path by which admission reads a non-first look, or a look tuned on its own holdout*.
- **Fix:** only a first look on a never-exposed set admits. Looks k > 1 are diagnostics. The rubric and thresholds are immutable per brief set. Per-brief rows are withheld until the admitting look closes, and correction batches never use holdout rows. See card lines 304-306 and 338.
- **Status:** applied, **unverified** — gate-rules §5 stop.

**Medium fixes — no re-review:**

- **N2:** sanctioned setup path (inputs → `submitInterview` → voice build → edit to the frozen text → confirm → activate); "identical" means equal sha256 of the activated content, per `brain_activation_id`; setup calls on their own budget. Fixed at `L0-card.md:360-368`.
- **N3:** counted set frozen per build; an absent table is n/a, never 0; the rule is scoped to named tables; isolation failures form their own category. Fixed at `:371-376`.
- **N4:** L3 window empty at run start, plus a same-run subset assertion. Fixed at `:369`.
- **N5:** blinding stated as partial, with an arm-guess check. Fixed at `:394`.
- **N6:** an owner release is reported as "not passed — released by …". Fixed at `:416`.

**Low fixes — no re-review:**

- **L1:** separate deployments per arm; same tier; at least 4 workspaces per arm. Fixed at `:357`.
- **L2:** setup calls are budgeted separately. Fixed at `:360-368`.
- **L3:** model match across arms, or a named confounder. Fixed at `:378`.
- **L4:** per-creator floor raised to a majority. Fixed at `:410`.
- **Notes:** the structural `MIN_COMPARABLE_RESULTS` guarantee is stated (`respin/packages/brain/src/proposal.ts:355`), and the double-context limit is named.

**Citations re-verified before recording:**

- `respin/packages/db/src/seed.ts:78` — `profileCaps` studio 5.
- `respin/packages/db/src/interview-ops.ts:516` — `submitInterview`.
- `respin/packages/db/src/brain-ops.ts:933` — `editBrainDocument`.
- `respin/packages/brain/src/proposal.ts:355` — fewer than `MIN_COMPARABLE_RESULTS` distinct generations returns null.
