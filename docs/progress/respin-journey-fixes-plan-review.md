# Plan review — respin-journey-fixes

Written by the generalist `plan-reviewer` (batch 2, last slot, 2026-09-15) and recorded verbatim by the orchestrator. `plan gate ran lean (consolidated)` for the compliance path; billing ran full. Merged-context posture: session model with a "think hard" instruction; each specialist's configured `effort: max` was not applied (gate-rules §7 lean trade).

**Readiness: Not yet · Grade: D · Both specialists still stand at NEEDS CHANGES on the previous text, and the current text has four tasks an implementer cannot finish as written (one of the unverified batch-2 fixes reddens an existing Studio scan; the CI job cannot run the journeys' DB shortcut or the admin bootstrap; the billing-form rewrite strands the journeys until a later phase).**

Reviewer: `plan-reviewer` (generalist, batch 2, last slot). Inputs: master plan, phases 1–3, codebase review, audit, brief, CLAUDE.md, gate-rules §11 — as revised after the batch-2 dispositions (2026-09-15). Method: every load-bearing `file:line` citation in the three phase plans was opened against the working tree at `3273f36` (+ the two uncommitted journey edits); citations not opened are listed under "Not verified" below.

**Standing specialist state (carried verbatim, not re-adjudicated):** batch 2 was the last permitted retry. On the text *before* the batch-2 fixes, `respin-billing-reviewer` returned **NEEDS CHANGES** (3 CHANGE) and `respin-compliance-reviewer` returned **NEEDS CHANGES** (3 CHANGE). All six were applied to the plan text on 2026-09-15. **Those fixes are unverified by either specialist; no specialist PASS exists for any path.** A further specialist batch needs the owner's explicit go-ahead (gate-rules §3). My opinion on whether each fix plausibly lands is given below, labelled as a generalist opinion — it is not a specialist verdict and does not move either path's status.

## Counts

| | |
|---|---|
| Findings (mine, this batch) | 24 — 4 High, 7 Medium, 13 Low |
| Tasks unexecutable from the plan text alone | 4 (P1-T3, P2-T6, P3-T3, P3-T4) + 3 with an unpinned handoff (P1-T4, P2-T7, P3-T1) |
| Pre-mortem causes with no receiving task | 4 |
| Specialist CHANGE items open (unverified fixes) | 6 (3 billing, 3 compliance) |
| Files-to-Modify rows | Phase 1: 23 · Phase 2: 22 (≈30 files once the two glob rows expand) · Phase 3: 11 |

## Scope

Three phases, one owner (`respin-engineer`, exists in `.claude/agents/`). Phase 1 = billing path (full gate, separate reviewer); Phase 2 = compliance path (lean merged run); Phase 3 = journeys + CI. Requirement set F-01–F-05, F-07–F-14, F-17–F-21 reconciles 1:1 between master plan and phase headers.

## Batch history

| Batch | Billing (full) | Compliance (lean) | Generalist |
|---|---|---|---|
| 0 | BLOCK (1 BLOCK, 7 CHANGE, 6 NOTE) | NEEDS CHANGES (8 CHANGE, 5 NOTE) | not launched |
| 1 | NEEDS CHANGES (3 new CHANGE, 8 NOTE) | NEEDS CHANGES (4 new CHANGE, 5 NOTE) | not launched |
| 2 | NEEDS CHANGES (3 new CHANGE, 7 NOTE) — on pre-fix text | NEEDS CHANGES (3 new CHANGE, 4 NOTE) — on pre-fix text | **this report** (on post-fix text) |
| Fix status | 6 CHANGE + 11 NOTE applied 2026-09-15, **unverified** — retry budget exhausted | | |

## Execution simulation (as `respin-engineer`, plan text only)

**Phase 1**
- PASS T1 runbook — every citation opened and matches (`tier-checkout-rollout.ts:47-62` union of 13 reasons; `setup.ts:84-93` seeds `TIER_AMOUNTS_CENTS`; `:150-163` prints the map and amounts; `pack-price.ts:55-57` legacy-key fence; `stripe/actions.ts:1066-1069` portal without `configuration`; `billing-view.tsx:690-710` cancel hand-off; `auto-topup-rollout.ts:224` fingerprint, `:140-143` request-time check). Long, but executable.
- PASS T2 activation script — the state machine supports the sequence: `beginAutoTopupProtocolDrain` returns the row when already `draining`/`active` (`auto-topup-rollout.ts:200-204`), so the second `cutover` from `draining` proceeds to reconcile → activate exactly as the auto-top-up runbook step 7 documents; the first `cutover`'s expected failure is the fence refusal with `remainingMs` (`auto-topup-rollout.ts:307-313` via `reconcileMissingLegacyAutoTopups:29`); tier `audit` throws outside `draining` (`:301-303`) and carries the fence wait (`:307-313`); `activate` short-circuits on `active` (`:544-547`); `HEARTBEAT_STALE_INTERVALS=3` (`worker/health.ts:37`). Minor: the plan does not say the script must guard `main()` so the unit test can import it (P-16).
- **FAIL T3** included build — all six literal lists verified at the cited lines (`billing-errors.ts:757`, `:799`, `onboarding/copy.ts:128` + fallback `:263-264`, `studio/copy.ts:92-132`, `billing-ui.test.tsx:1737`, `no-text.test.ts:439-450`), and the hook placement after `usageRaw` (`inference.ts:786`) is right. But `tests/studio-ui.test.tsx:1633-1651` scans **every** `STUDIO_ERROR_CODES` entry against `/included (build|run)\b|first run for this creator/`, and T3 (iv) gives the new code copy containing "did not use up your first run for this creator" while T3 (vii) adds it to `STUDIO_ERROR_CODES`. Following the text produces a red Studio scan with no instruction (P-01).
- PASS-with-handoff-gap T4 billing form — executable in itself; but moving `subscribe-<tier>` onto radio inputs breaks the three journey call sites that locate the password field/button *inside* `subscribe-<tier>` (`solo-creator.spec.ts:113-115`, `studio-operator.spec.ts:42`, `editor-seat.spec.ts:97`), so verification step 5 and AC1's evidence cannot be produced in Phase 1 (P-04).
- PASS T5 niche — `trackedNicheEntitlement` at `mode-access.ts:310`, `app-server.ts:649`; `trackNicheForProfile` throws untyped `Error` (`trends-storage.ts:786-812`), so the "typed refusal only if absent" branch fires — the plan anticipates it. Saved/refused testids are not pinned for Phase 3 (P-13).
- PASS T6 witness — `table-writers.test.ts:339` scans `.ts/.tsx`, `PRODUCTION_ROOTS` includes `scripts` (`:353`), `EXPECTED` rows at `:702-709`. A `.ts` script is inside the scan by construction.

**Phase 2**
- PASS T1 — `auth-form.tsx:47` `router.push("/studio")`, `:121` Google `callbackURL: "/studio"`; `e2e/support/auth.ts:28` waits `**/studio`.
- PASS T2 — `nav.tsx:9-21` has no Brain entry; AC2 order matches existing items + Brain.
- PASS T3 — with the least-confident line now answered: `BrainAssetSummary` (`with-workspace.ts:1152-1157`) has no generation count, so the scoped accessor is **required**, not conditional (P-09).
- PASS T4 — not line-verified (brain-view.tsx internals); the audit's evidence stands.
- PASS T5 — "brain active" is `[voice,strategy,killtest].some(h => h.some(v => v.status === "active"))` (`studio/page.tsx:131-140`); the notice is `brainActivated && !voiceActive`; `STATES` at `studio-ui.test.tsx:1747` confirmed.
- **FAIL T6** — the rendering facts hold (`generation-outcome.tsx:91-92` unfiltered counts, `:510`/`:543` both states render `KillTestBlock`, `run-copy.ts:558-566` heading clause, `:587-589` disclosure branch, `:1184` concealment-claim fixture, `FLAG_ONLY_FIELD_PREFIXES = ["/disclosure/"]` at `traceability.ts:297`). But removing the `/disclosure/` branch of `traceabilityFlagNote` reddens `tests/claims-vocabulary-agreement.test.ts:201-222` (asserts that branch's sentence for `/disclosure/guidance`), a file absent from Phase 2's Files table; that same test already pins `FLAG_ONLY_FIELD_PREFIXES` to `["/disclosure/"]`, which T6 (iv)'s new file duplicates (P-05).
- PASS-with-gaps T7 — `studio-panel.tsx:183-199` testids match; `first-ideas-panel.tsx:66-86` match; `lineage-view.tsx:5` and `first-ideas-result.tsx:1-13` document the `useActionState`-initial-state constraint. The Studio intro enumeration is left as a TODO in the plan; I enumerated it: exactly one paragraph, `studio-view.tsx:79-86`, no testid, and it lives in `StudioView` outside `StudioPanel` (P-12). The Results sentence is two distinct `reason` strings at `results/page.tsx:166,173` and the "results test" is unnamed among six candidates (P-15).

**Phase 3**
- PASS-with-gap T1 — `.demo-panel` exists (`landing-sections.tsx:72`); `artifacts.note()` writes `console.log` (`artifacts.ts:79`); niche saved/refused selector unpinned (P-13).
- PASS T2 — `activateBrainSection` at `solo-creator.spec.ts:265`; `waitForGenerationOutcome` at `generation.ts:18`; editor chapter at `editor-seat.spec.ts:55-79`.
- **FAIL T3** — `manage-plan` (`billing-view.tsx:376-397`) renders no subscription id; `db-shortcut.ts` has no subscription query and is not in Phase 3's Files (P-06). `AUDIENCES` exported (`audiences.ts:30`) — the `/for/*` enumeration is executable.
- **FAIL T4** — `db-shortcut.ts:52-56, 66-82` shells `docker exec respin-postgres`; the plan never says how Postgres is hosted in the CI job (the existing `gate` job uses a service container with no such name; `docker-compose.yml:11` names it `respin-postgres`) (P-02). `platform-admin.spec.ts:41-56` ends in `test.skip` whenever `_handoff/platform-admin.json` is absent, and Phase 3's own edge-case row says it is absent in CI (P-03). Snapshot storage is "artifact/secret-referenced" — not a choice an implementer can make (P-10). File-column `.mjs` vs `.ts`, and a runbook edit the phase declares out of scope (P-07).
- PASS T5 README.

## Pre-mortem (shipped and failed in production — where does each cause land?)

| Likely cause | Receiving task / spec | Status |
|---|---|---|
| Brief #1: shared dev Stripe account reports unclearable `orphaned_customer_mapping` blockers | Phase 1 "activation constraint" section; T1 sandbox section; master Non-goals | Absorbed |
| Brief #2: new error class inherits `consumesIncludedBuild` from `billable` | Phase 1 T3 explicit `false`, w1, AC3 | Absorbed |
| Brief #3: step header says "done" from data the page never read | Phase 2 T3 derivation list, AC3 `unknown` on read failure; accessor now known-required | Absorbed (P-09 makes the accessor unconditional) |
| CI journeys call `docker exec respin-postgres` against a Postgres the job hosts differently | none — Phase 3 T4 does not pin how Postgres runs; `db-shortcut.ts` not in Files | **No receiving task (P-02)** |
| Admin journey can never pass its bootstrap in CI (fresh identity per run, `_handoff/` absent, `ADMIN_USER_IDS` static) — and `test.skip` reports green, so AC6's "two green runs" is vacuous for that persona | none | **No receiving task (P-03)** |
| Journeys keep pressing inside `subscribe-<tier>` after Phase 1 moved it onto a radio input; checkout never starts; Phase 1 AC1 unobtainable | Phase 3 T1–T3 do not name it; Phase 1 verification 5 assumes it works | **No receiving task (P-04)** |
| Adding the new code to `STUDIO_ERROR_CODES` with "first run for this creator" copy reddens the Studio false-free-draft scan | none — plan silent on a `STUDIO_OVERRIDES` entry | **No receiving task (P-01)** — caught by test, not production, but blocks the phase |
| Second CI night re-audits a lineage whose Sessions the restored snapshot forgot | Phase 1 activation constraint + `activate` short-circuit (`:544-547`); Phase 3 T4 "expect short-circuit"; AC6 second run | Absorbed |
| `stripe listen` delivers `checkout.session.completed` after the 30 s billing poll | Phase 3 least-confident line; poll constant is a journey constant | Absorbed |
| Journey aborts before its closing cancel chapter; live subscriptions accumulate in the CI sandbox and renew as `refused_unknown_customer` nightly | Phase 3 T3 cancel chapter only on success path | Partially absorbed (P-21) |
| Unusable reply N times locks a Free profile for life with an operator-only remedy | Phase 1 edge-case row; batch-0 NOTE accepted as-is | Accepted risk, recorded |
| Snapshot restore fails or restored row not `active` | Phase 3 edge-case row (fail at setup, never re-create + re-activate) | Absorbed |
| Stripe hosted Checkout markup changes | Phase 3 failure-modes row | Absorbed |
| Model refuses the Profile A voice build in the operator journey | Phase 3 T2 retry-once; editor chapter asserts explicitly | Absorbed |

## Findings

Severity: High = blocks execution or produces a silent/vacuous result; Medium = wrong or unpinned on a path the phase depends on; Low = polish or unpinned detail an implementer can reasonably resolve. Confidence is mine.

| # | Sev / conf | Location | Finding | Fix |
|---|---|---|---|---|
| P-01 | High / high | Phase 1 T3 (iv)+(vii), AC6 | `tests/studio-ui.test.tsx:1633-1651` `FALSE_ON_THIS_SCREEN` scans every `STUDIO_ERROR_CODES` entry for `/included (build\|run)\b\|first run for this creator/`. The new code must be in `STUDIO_ERROR_CODES` (the derivation at `:1578-1586` unions `INSTANCE_BRANCH_CODES.LlmError`), and its base copy says "did not use up your first run for this creator". As written the plan reddens the gate. This is a regression introduced by the unverified batch-2 "six lists" fix. | Add a `STUDIO_OVERRIDES.llm_attempt_not_consuming` entry in `app/(product)/studio/copy.ts` with Studio-safe wording (precedent: `:237-241` for `llm_attempt_recorded`); add that file to Phase 1 Files; AC6 asserts the override passes the Studio scan. |
| P-02 | High / high | Phase 3 T4, Files, Edge cases | `e2e/support/db-shortcut.ts:52-56, 66-82` runs `docker exec respin-postgres psql …`. T4 says "restored into the job's Postgres" without saying how Postgres is hosted; the existing `gate` job uses a service container (no fixed name). studio-operator ch.7 (`attachAsEditor`) and platform-admin bootstrap (`lookupAuthUserId`) fail → editor-seat `test.skip`s → AC1 cannot pass. | T4 pins `docker compose -f respin/docker-compose.yml up -d` in the job (container is `respin-postgres`, `docker-compose.yml:11`) and restores into it — or `db-shortcut.ts` takes its psql target from env; add `db-shortcut.ts` to Files if changed. |
| P-03 | High / high | Phase 3 T4/T5, AC6 | `platform-admin.spec.ts:41-56`: with no handoff it signs up a fresh identity, writes `_handoff/platform-admin.json`, and `test.skip`s with "add the id to ADMIN_USER_IDS, restart, re-run". Phase 3's own edge-case row says `_handoff/` is absent in CI. So in CI the admin journey always ends at the bootstrap skip, Playwright reports it green, and AC6's "two consecutive green runs" is vacuous for that persona; the `ADMIN_USER_IDS` secret has no stable id to hold. | Bake the admin identity into the activated snapshot; T4 writes `_handoff/platform-admin.json` from secrets before Playwright (or the spec reads `E2E_ADMIN_*` env); `ADMIN_USER_IDS` = that id; add an AC that `platform-admin/admin-home.png` exists in CI artifacts. |
| P-04 | High / high | Phase 1 T4, Verification 5, AC1; Phase 3 T1–T3 | T4 moves `subscribe-<tier>` onto radio inputs. `solo-creator.spec.ts:113-115`, `studio-operator.spec.ts:42-45`, `editor-seat.spec.ts:97` locate `input[name="password"]` / the button *inside* `subscribe-<tier>`. After T4 those locators resolve to nothing; Phase 1 verification 5 ("expect webhook confirmed") and AC1's journey evidence cannot be produced until specs change, and no Phase 3 task names the subscribe-form rewrite. | Either Phase 1 T4 updates the three call sites (add the spec files to Phase 1 Files and a Handoff Contract line naming `subscribe` + radio + password), or Phase 1 verification 5/AC1 are re-pointed at a `billing-ui` render and Phase 3 T1 explicitly lists the rewrite. |
| P-05 | Medium / high | Phase 2 T6 (iii)/(iv), Files | `tests/claims-vocabulary-agreement.test.ts:201-222` asserts `traceabilityFlagNote("proper_noun","/disclosure/guidance")` matches "the product wrote rather than you" — removing the branch reddens it; the file is not in Files. Lines `:218-221` already pin `FLAG_ONLY_FIELD_PREFIXES` to `["/disclosure/"]`, which the proposed `disclosure-prefix-agreement.test.ts` duplicates. | T6 rewrites that test to the new contract (branch gone; `DISCLOSURE_FIELD_PREFIX` agreement lives there instead of a new file); add the file to Files. |
| P-06 | Medium / high | Phase 3 T3 | "subscription id read from the page's `manage-plan` block or the DB shortcut": `billing-view.tsx:376-397` renders no id; `db-shortcut.ts` has no such query and is not in Files. | Helper resolves the subscription through Stripe: `customers.list({ email })` → `subscriptions.list({ customer })`; no DB read. Pin it. |
| P-07 | Medium / high | Phase 3 T4 file column, Files, Out of Scope | File column says `respin/scripts/scan-journey-notes.mjs`; task text and Files say `.ts` (batch-2 fix half-applied). T4 also edits `docs/runbooks/tier-checkout-protocol-v1-rollout.md` while Out of Scope forbids `docs/runbooks` and Files omits it; Phase 1 T1 already writes the CI snapshot section. | Fix `.mjs` → `.ts`; give the CI snapshot section one owner (Phase 1 T1) and drop it from T4, or add it to Files and remove it from Out of Scope. |
| P-08 | Medium / high | Master plan Critical Paths; Phase 3 Agents + Completion | Master plan: billing touched "Phase 3 T4 through the activation step". Phase 3: "no Critical Path is touched: test and CI files only". T3's `cancelTestSubscription` writes to Stripe and asserts the webhook downgrade. | State in both files which gate runs on Phase 3 (billing full gate on T3/T4 at minimum) and align Completion Criteria. |
| P-09 | Medium / high | Phase 2 T3, Files, Least confident; master Critical Paths | `BrainAssetSummary` = `{brainVersions, testedRules, loggedResults, feedback}` (`with-workspace.ts:1152-1157`) — no generation count. The accessor `hasGenerationForProfile` is required, not conditional. The master plan's "brain tenancy: No" rests on the accessor being optional; a new profile-scoped query over generations is "query scoping" in the tenancy row (`Full gates: yes`). I confirm the sibling pattern (`brainAssetSummary` mints `ProfileScope` and reads via accessors, `:2780-2787`) is the right shape. | Mark the two db rows unconditional; owner decides whether the tenancy gate runs on Phase 2 T3 — I recommend yes. |
| P-10 | Medium / high | Phase 3 T4 | Snapshot "stored as a CI artifact/secret-referenced object": Actions artifacts expire (90-day default) and are per-run; a secret cannot hold a `pg_dump`. Not a choice an implementer can make. | Pin a location (e.g. the R-124 S3 bucket, keyed by an existing secret) and a refresh procedure; put it in the runbook's CI snapshot section. |
| P-11 | Medium / medium | Phase 1 Handoff Contracts vs T2 | Handoff line says the script checks "port 8000, the Stripe CLI forwarder, and the worker's heartbeat"; T2 (batch-2 fix) says the forwarder is "not checked". | Align the handoff line with T2. |
| P-12 | Low-Med / high | Phase 2 T7, AC8 | "read first; list them in the task by testid" is a plan-authoring TODO. Answer: exactly one intro paragraph, `studio-view.tsx:79-86`, no testid, rendered by `StudioView` *outside* `StudioPanel` — "fold into the same `<details>`" needs the paragraph moved into the panel or the `<details>` lifted. | Name it (`studio-intro`), pick the owning component, list it in AC8's fold set. |
| P-13 | Low / high | Phase 3 T1 ↔ Phase 1 T5 handoff | T1 waits for the niche panel's "saved/refused sentence"; Phase 1 T5 pins only `niche-disabled-tier`. | Phase 1 T5 names `niche-saved` / `niche-refused` testids in Handoff Contracts. |
| P-14 | Low / high | Phase 1 AC7 | The recover-invoice state (`recoverInvoiceAction`, reauthenticated at `actions.ts:161-166`; panel at `billing-view.tsx:360-374`) is in neither AC7 state. | Add a third state row or state the exclusion. |
| P-15 | Low / high | Phase 2 T7, Files | The Results sentence is two distinct `reason` strings (`results/page.tsx:166`, `:173`) feeding two panels; "results test" is unnamed (six `tests/results-*.test.tsx`). | Name the test and say which panel keeps the sentence. |
| P-16 | Low / medium | Phase 1 T2 | The unit test imports the script; nothing says `main()` must be guarded and the CLI runner injectable. | One sentence. |
| P-17 | Low / high | Phase 1 T3 | After the hook, `AssemblyError → inference_unusable` (`billing-errors.ts:611`) is unreachable from the voice path; no disposition for the stale mapping/copy (non-negotiable 7: a list entry no producer justifies). | Retire or annotate. |
| P-18 | Low / high | Master Requirement IDs vs phase headers | REQ-H01 (F-18) and REQ-G04 appear in the master set but in no phase checklist header. | Add to Phase 3 F-18 / Phase 1 header. |
| P-19 | Low / medium | Gate-rules §11 | Rows: P1 23, P2 22, P3 11 — under the 25-row line, but Phase 2's two glob rows expand to ≈10 files (≈30 effective). I could simulate faithfully; recording as a warning, not a split request. | Expand the globs or accept the risk explicitly. |
| P-20 | Low / medium | Master Derived Budgets | Nightly Anthropic spend is "recorded, never guessed" — correct for the figure, but no ceiling or kill-switch is named for a scheduled job. | Add "schedule disabled if the first measured run exceeds X". |
| P-21 | Low / medium | Phase 3 T3 | Cancel is a chapter, so a journey that aborts earlier leaves a live subscription that renews nightly as `refused_unknown_customer`. | Cancel in an `afterAll`/finally, or sweep at job start. |
| P-22 | Low / medium | Phase 2 T7 test mechanism | A test-only `initialState` prop on a production component is passable by any page. | Mark `@internal` and add a scan that no `app/**` call site passes it, or extract a pure body component. |
| P-23 | Low / low-med | Phase 2 T1 edge cases | An existing user pressing Google on the sign-up page lands on `/onboarding`; only the sign-in page case is tabled. | Record as accepted or branch on account age. |
| P-24 | Low / medium | Phase 3 T4 vs Phase 1 T1 | T1 says `STRIPE_WEBHOOK_SECRET` comes from `stripe listen --print-secret`; T4 lists it as a stored GitHub secret. | Export it from `--print-secret` at job start; drop the stored secret. |

## Mechanical consistency

- Coverage parity: PASS — `TierCheckoutDrainBlocker.reason` union (13 literals, `tier-checkout-rollout.ts:47-62`) is the runbook's defining set with a parsing test; the six literal lists name their defining population; `STATES` at `studio-ui.test.tsx:1747` named; `/for/*` reads `AUDIENCES`.
- Closure: **FAIL** — Phase 3 T4 `.mjs`/`.ts` (P-07); Phase 3 runbook edit not in Files and forbidden by Out of Scope (P-07); `claims-vocabulary-agreement.test.ts` touched by T6 but absent (P-05); `db-shortcut.ts` touched by T3/T4 but absent (P-02, P-06); `studio/copy.ts` needed by Phase 1 T3 but absent (P-01). Owner agents: `respin-engineer`, `respin-billing-reviewer`, `respin-compliance-reviewer`, `plan-reviewer` all exist. Every AC has an evidence pointer. Depends-on names only lower-numbered phases.
- Reachability lines: PASS — all three non-empty with in-phase callers.
- Deferral ledger: PASS — three rows, each with a receiving task or planned phase; no phase defers a completable lake. Note the CI snapshot section is double-owned (P-07).
- Handoff contracts: **FAIL** — `subscribe-<tier>` move unpinned toward the journeys (P-04); niche saved/refused testid unpinned (P-13); Phase 1 handoff line contradicts T2 (P-11); subscription-id source unpinned (P-06).
- Verifiability: PASS with a note — Phase 3 AC2 is a "code review transcript listing the pairs" (a lint would be stronger); every other AC is PASS/FAIL with a named file or transcript.
- Number provenance: PASS with P-20 — drain 300 s cited and derived; free grant/rebuild config-sourced; cap N from config; journey wall times from run logs; recurring-cost row present but unbounded.
- Invariant-ID slugs: PASS — 12 slugs across the three phases, all unique, all present in the codebase review's invariant table; none renamed relative to that table.
- Verification dry-run: Phase 1 step 5 not passable in-phase (P-04); Phase 2 step 4 consistent ("Where the specifics came from" is the heading at `generation-outcome.tsx:114`); Phase 3 step 4 blocked by P-02/P-03/P-10 until pinned.
- Boil-the-lake: PASS on scope (nothing beyond the register), with P-17 as the one leftover the fix creates.

## Least-confident probes

| Phase | Author's bet | Evidence |
|---|---|---|
| 1 | Sandbox + `stripe:setup` reproduces every object with no manual dashboard step | Fails as stated, and the plan already says so: the Customer Portal configuration is dashboard-only (`stripe/actions.ts:1066-1069` passes no `configuration`), listed in T1. Nothing else found: `setup.ts` creates product, three tier prices and the pack price and prints the map; webhook secret comes from `stripe listen`. Holds with T1's listed manual step. |
| 2 | `brainAssetSummary` exposes a per-profile generation count | **Fails** — `BrainAssetSummary` has no such field (`with-workspace.ts:1152-1157`). The accessor branch is required; sibling pattern confirmed (P-09). |
| 3 | `stripe listen` in Actions delivers within the 30 s poll | Not testable from the plan; the poll is a journey constant (`solo-creator.spec.ts:122`). Holds as a bounded risk. The larger CI risks are the two the author did not name (P-02, P-03). |

## Batch-2 fixes as written — generalist opinion (NOT a specialist verdict)

| Specialist item | Present in text? | Plausibly resolves? |
|---|---|---|
| Billing: six literal lists, `ONBOARDING_ERROR_CODES` | Yes, T3 (vii); every line cited matches source | Yes on the item itself — but it introduces P-01 (Studio scan) which the specialist could not have seen |
| Billing: AC7 scoped per state | Yes; the four active-render forms match `actions.ts:138-212` | Yes; residual gap P-14 (recover-invoice state) |
| Billing: cancel chapter targeted a portal hand-off | Yes; rewritten to a test-only Stripe API helper + handler downgrade assertion (`webhooks.ts:1713`) | Direction yes; not executable as written (P-06) |
| Compliance: AC8 named Studio testids on first-ideas | Yes; rewritten per surface/state — and first-ideas reuses `GenerationOutcome` (`first-ideas-result.tsx:31`), so `studio-*` ids there are correct | Yes |
| Compliance: fold-proof not producible under static render | Yes; injected `initialState` on both panels, whole-panel render | Plausible; residual P-22 |
| Compliance: verification step 4 wrong place | Yes; now "under 'Where the specifics came from'" = `generation-outcome.tsx:114` | Yes |

## Consolidated reviewer findings (merged, deduped, ordered)

1. **Specialist state:** billing NEEDS CHANGES, compliance NEEDS CHANGES — six CHANGE fixes applied and unverified; no PASS exists on either path. Owner's call whether to fund a further specialist batch (gate-rules §3).
2. P-01 — Studio false-free-draft scan reddens on the new code's copy (regression of an unverified fix).
3. P-02 / P-03 — the CI job as planned cannot run the DB shortcut or the admin bootstrap; AC6 would be vacuously green for the admin persona.
4. P-04 — billing-form rewrite strands the journeys; Phase 1 AC1/verification 5 unobtainable in-phase.
5. P-05 / P-06 / P-07 — closure gaps: `claims-vocabulary-agreement.test.ts`, `db-shortcut.ts`, `studio/copy.ts`, runbook, `.mjs`.
6. P-08 / P-09 — gate mapping: which gate runs on Phase 3; tenancy gate on Phase 2's now-required accessor.
7. P-10 / P-11 / P-12 / P-13 — unpinned handoffs and one plan TODO.
8. P-14 – P-24 — low.

Not verified this batch (trusted from the audit): `brain-view.tsx` and `onboarding-view.tsx` internals; `setup.ts:64-151` beyond the spot-checked ranges; the worker heartbeat table name; the exact `webhooks.ts:1713` downgrade path.

## Verdict

**NOT READY** — neither specialist has passed its path (the batch-2 fixes are unverified), and independently of that, four tasks cannot be executed from the plan text as written and four likely failure causes have no receiving task.

Ordered fix list:
1. P-01 — Studio override for `llm_attempt_not_consuming`; add `studio/copy.ts` to Phase 1 Files; extend AC6.
2. P-02 + P-03 + P-10 — Phase 3 T4: pin Postgres hosting (`docker compose`, container `respin-postgres`), the admin identity in the snapshot + handoff/env, and the snapshot's storage location.
3. P-04 — decide where the journeys' subscribe-form rewrite lives; fix Phase 1 verification 5 / AC1 accordingly.
4. P-05, P-06, P-07 — closure: add the four missing files, fix `.mjs`, single-own the CI snapshot section.
5. P-08, P-09 — state the Phase 3 gate and the tenancy decision on the required accessor in the master plan.
6. P-11 – P-13 — align the handoff lines; name the Studio intro paragraph and the niche testids.
7. P-14 – P-24 — sweep the low items in the same edit.
8. Then, with the owner's go-ahead, a specialist batch 3 on the resulting text — this report cannot substitute for it.

---

## Orchestrator addendum (2026-09-15, after the report)

The 24 generalist findings were applied to the plan text on the same day (see each phase plan's status line and the master plan's Plan Review Log). Three of them were decisions, made conservatively: P-04 → Phase 1 T4 updates the three journey call sites in the same phase; P-08 → the billing full gate runs on Phase 3 (T3 writes to Stripe and asserts the webhook downgrade); P-09 → the brain-tenancy full gate runs on Phase 2 T3 (the profile-scoped generation accessor is required). **These post-report edits are unverified by any reviewer.** The gate's state is unchanged by them: NOT READY, retry budget exhausted, a specialist batch 3 (and a fresh generalist run) needs the owner's go-ahead.
