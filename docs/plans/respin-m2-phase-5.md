# Phase 5 — The onboarding wizard

**Depends on:** Phase 2 (`packages/llm`), Phase 3 (`packages/brain`) — and transitively Phase 1.
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-B01, REQ-B02, REQ-B03, REQ-A01, REQ-I03, REQ-A03.

> This is the screen where R-8's promise is kept or broken in front of the creator. "Inspectable, confirmable context" is what the confirm step *is*.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.**
6. **Report honestly.**
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

### Non-negotiable rules (Respin) — the ones this phase touches

- **3. Brains are context, never weights, never silent.** Versioned docs, per-field provenance, **proposal-approval for every update** (R-8, REQ-B02/C05).
- **5. No leakage.** Nothing crosses profiles or workspaces (REQ-A03).
- **6. No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point (REQ-I03/I04).
- **2. The ledger is the balance.** Onboarding's token spend is metered per D-M2-2/R-30.

### Lessons that touch this ground

- **2026-08-17 audit #15** — *the product's only entry point had no test rendering it at all.* Visible `<label for>` on every field, **no placeholder-as-label**, one constant feeding both a shown rule and its enforced value.
- **2026-08-17 audit #16/#17** — an error summary needs an id, `aria-describedby`, `aria-invalid`, a focusable alert, and a focus effect keyed on the **state object** so a second failed submit re-focuses; every disabled control names its reason via a resolvable `aria-describedby`.
- **2026-07-30 — a comment claiming a property is not the property.**
- **2026-08-10 — present-and-verified is not present-and-unrun.**
- **2026-08-18 — prove a parser-dependent guard generatively against the installed parser.** This phase's allowlist is exactly such a guard: it depends on `new URL()` parsing a host the same way the check does. A list of counterexamples ("instagram, tiktok, arbitrary") is this lesson's failing form.

### Stack and boundaries

- Next.js 15 App Router; server actions for writes; `app/` imports `packages/` only via `@respin/*` package names.
- **`@respin/llm/app-server` and `@respin/brain/app-server` are the only sanctioned surfaces**; the package roots are denied to `app/**`.
- Every read/write is scoped: `withWorkspace` -> `scope.profile(id)` -> `ProfileScope`. **No route handler takes a bare `profileId` and uses it unscoped.**
- Accessibility is a first-class acceptance criterion, not a follow-up.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-tenancy-reviewer`, `respin-compliance-reviewer`, `respin-learning-reviewer`, `respin-billing-reviewer`, `code-reviewer`, `security-reviewer`.
**Do NOT request** any agent not present in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | Structured interview: goals, positioning, north-star metric, banned words/vibes, ambitions | REQ-B01 |
| F2 | **5-10** of the creator's own past posts, **pasted**. A YouTube link may be resolved for **metadata only** via exactly one endpoint, `https://www.youtube.com/oembed`; the creator's URL is never itself fetched. **No captions leg in M2** — owner decision, since `captions.download` needs OAuth ownership and cannot serve a reference post. Every other host and every failure falls back to paste (D-M2-9) | REQ-B01; `tech-spec.md:90`'s "compliance-safe default"; R-4/REQ-E01 |
| F3 | Optionally **2-3** reference posts they admire, stored with `input_class='reference'` | REQ-B01, D-M2-10 |
| F4 | Inference produces draft brain fields via `packages/llm` | REQ-B01 |
| F5 | **Review-and-confirm screen**: every inferred field shows its verbatim source evidence and derived confidence; the creator confirms or edits each **before the brain activates** | REQ-B02 |
| F6 | The system never silently infers sensitive personal traits — **enforced by a closed allowlist of inferable brain fields**; anything outside it is refused, not surfaced | REQ-B02 (a [Must] that round 1 stated and never tested) |
| F7 | North-star metric declared, from the REQ-B03 enum, changeable later | REQ-B03 |
| F8 | Per-tier profile caps enforced (Free 1 / Creator 1 / Pro 1 / Studio 5), read from config | REQ-A01, D-M2-7 |
| F9 | Onboarding is completable on **Free** (zero credit balance), with the **full** brain — not a "lite" one (D-M2-12) | R-21 + D-M2-2/R-30; `PRD.md:135`, `PRD.md:125` |
| F10 | **A paused workspace is read-only across EVERY M2 write** — profile creation, `onboarding_inputs`, draft rows, inference, and activation. Not just inference and activation | REQ-G08's read-only Must; D-M2-11 |
| F11 | **The first inference per profile is free; a rebuild is priced and debited** (D-M2-2/R-30). The control names the price, and on Free names the zero balance and offers top-up | D-M2-2; R-21 |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | Profile isolation | every action goes `withWorkspace` -> `scope.profile()`; no unscoped `profileId` |
| T2 | Nothing silent (R-8) | activation happens only on explicit confirm; partial progress is a draft, never an active brain |
| T3 | No invented specifics (REQ-I03) | a field with no evidence cannot be presented as inferred; `[check]` shown where unverified |
| T4 | Accessibility (audit #15-#17 class) | visible labels, associated errors, focus management, reasons on disabled controls |
| T5 | Metering (D-M2-2/R-30) | the once-per-profile limit refuses before any network call; a `model_usage` row is **persisted** per HTTP call |
| T6 | Compliant sources only (R-4, REQ-E01) | AC-12: the **only** URL the product may construct is the oEmbed endpoint. Round 2's criterion was **host**-scoped, so `fetch("https://www.youtube.com/watch?v=X")` and `youtube.com/api/timedtext` both passed it. The `respin-scraping-dependency` guardrail is `warn`-level, `package.json`-scoped, and its body pattern names only TikTok/Instagram/Douyin terms — it cannot see a `youtube-transcript` package or a bare `fetch()`, so it is **not** a backstop |

## Edge Cases & Failure Paths

**Inverse events.**

| Event | Inverse | Behaviour |
|---|---|---|
| Wizard started | Wizard abandoned | Draft persists **as a draft**; no brain activates. Returning resumes. Nothing partially activated exists. |
| Inference run | Inference discarded | A re-run is **priced** (D-M2-2); the discarded draft stays in history (nothing silent). |
| Field confirmed | Field un-confirmed | Editable until activation; after activation it is a new version (phase 3). |
| Profile created at cap | — | Refused **before** any work, with the cap and the tier named. |

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| Inference fails (model down, pre-response) | Creator retries, fails again | Typed unavailable state; **the creator's typed input is retained**; no brain activates from nothing; the limit is **not** consumed — no vendor response, no charge. |
| Inference returns a schema-invalid 200 | Creator retries | **The limit IS consumed** (phase 2 AC-7c): the model ran and we were billed. Grouping this with a transport failure, as round 1 did, is an unbounded spend loop at zero credits on Free. |
| Creator submits 3 posts (below the 5 minimum) | Also submits 0 references | Refused with a specific message naming the shortfall; **not** an inference on thin evidence presented as confident. |
| Confirm submitted with **any** inferred field unconfirmed | Retried unchanged | `UnconfirmedFieldError` surfaces as a field-level error with focus moved to the error summary; a second failed submit **re-focuses** (audit #16's state-object keying). |
| Profile cap reached mid-flow (another seat created one) | — | Refused at activation with the cap named; the draft is preserved rather than discarded. |
| Owner pauses mid-flow | Creator submits confirm | **Refused** (D-M2-11): a paused workspace is read-only under REQ-G08. The draft is preserved, and the reason names the pause rather than looking like a bug. |
| Link host is not allowlisted | Creator resubmits the same link | Refused **without any outbound request**, with the paste fallback offered inline. No host is probed to discover whether it is allowlisted — probing is itself the fetch R-4 forbids. |
| A `reference` quote is proposed as `voice` provenance | Retried | Refused by `packages/brain` (`ReferenceProvenanceError`, D-M2-10). The wizard never offers it, and the package refuses it anyway — guard where the path is built. |

**Degraded mode.** Model unavailable -> the wizard offers **manual entry**, stored with `authorship: "creator_authored"` explicitly — a recorded class, never an inferred field whose provenance happens to be missing. A creator-authored field is *more* trustworthy provenance than an inferred one, which is exactly why it must not be the fallback label for an ungrounded field: that would launder a model invention into the most trustworthy class the product has. Phase 3's discriminated union makes an `inferred` field with empty provenance unrepresentable, so the laundering has no route.

**Link resolution has no degraded mode that fetches.** If YouTube's oEmbed or captions API is unavailable, the wizard falls back to **paste** — never to fetching the page. There is no "best effort" HTML retrieval, because the failure mode of best-effort here is scraping a closed platform.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| **Wizard -> YouTube oEmbed / captions API** | Unavailable, 404, or non-allowlisted host | **Fall back to paste.** Never an HTML fetch, never a "best effort" retrieval | Creator pastes the text | AC-12 |
| Wizard -> `@respin/llm` | `LlmUnavailableError` | Retryable state, input retained, manual-entry offered; limit not consumed | Creator retries | AC-6 |
| Wizard -> `@respin/llm` | `LlmSchemaError` | Same as above, with a distinct message; **never** a half-filled brain | — | AC-6 |
| Wizard -> `@respin/llm` | Re-inference limit exhausted | Refused **with no network call**; the reason is named on the disabled control | Manual entry, or M3+ | AC-7 |
| Wizard -> `@respin/brain` | `UnconfirmedFieldError` | Field-level error, focus to summary, second submit re-focuses | Creator confirms | AC-5 |
| Wizard -> config | Profile cap reached | Refusal naming tier and cap; draft preserved | Upgrade or reuse | AC-8 |

## Handoff Contracts

Consumed by phase 6:

    // The activated brain is read through packages/brain; this phase adds no new
    // read surface. Every profile reachable from /brain has an ACTIVE doc for the
    // THREE WRITABLE kinds; performance_meta has none and is M5's.
    // What phase 6 consumes is the ROUTE contract:
    //   /onboarding            -> the wizard (redirects to /brain when a brain is active)
    //   /brain                 -> phase 6's editor (this phase links to it on completion)
    // and the guarantee that any profile reachable from /brain has at least one
    // ACTIVE brain doc per kind, because activation is all-or-nothing (AC-4).

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Route group + wizard shell with resumable draft state | `respin-engineer` | `respin/app/(product)/onboarding/**` |
| 2 | Step 1 — structured interview form (visible labels, associated errors) | `respin-engineer` | `respin/app/(product)/onboarding/interview/**` |
| 3 | Step 2 — own posts (5-10), paste-first, with the count rule shown **and** enforced from one constant; every input persisted to `onboarding_inputs` with its `input_class` | `respin-engineer` | `respin/app/(product)/onboarding/posts/**` |
| 3b | **The endpoint allowlist resolver** (D-M2-9), in **one named module, in code, never in `respinConfigV1`** — `/admin/config` is a paste-the-whole-document editor with no deploy, i.e. a deploy-free path to add `instagram.com`, and the compliance skill is explicit that no config flag weakens a hard rule. Exact-hostname equality over a closed set, `https` only, userinfo and punycode rejected, `redirect: "manual"`, no cross-host redirect followed | `respin-engineer` | `respin/packages/trends/src/link-resolver.ts` (the home `tech-spec.md` §4 gives `submitted`, so M4's adapter reuses it rather than building a second) |
| 4 | Step 3 — optional references (0-3) | `respin-engineer` | `respin/app/(product)/onboarding/references/**` |
| 5 | Inference action: `scope.profile()` -> `@respin/llm/app-server`, **pause-checked and limit-checked first**, `model_usage` persisted | `respin-engineer` | `respin/app/(product)/onboarding/actions.ts` |
| 5b | **Closed allowlist of inferable brain fields** (F6); anything outside it is refused, never surfaced for confirmation | `respin-engineer` | `respin/packages/brain/src/inferable-fields.ts` |
| 6 | Step 4 — **review-and-confirm**: per field, the verbatim quote, its source, derived confidence, confirm/edit | `respin-engineer` | `respin/app/(product)/onboarding/confirm/**` |
| 7 | Activation action -> `@respin/brain/app-server`, **pause-checked**, activating the three writable kinds atomically. **`performance_meta` is NOT written here** — it is M5's doc (phase 3 F10), and round 1's "all four kinds atomically" would have pre-violated the sole-emitter rule on day one | `respin-engineer` | `respin/app/(product)/onboarding/actions.ts` |
| 8 | North-star metric declaration (REQ-B03 enum) | `respin-engineer` | `respin/app/(product)/onboarding/interview/**` |
| 9 | Profile cap enforcement from config, refused before work (D-M2-7) | `respin-engineer` | `respin/app/(product)/onboarding/actions.ts` |
| 10 | Manual-entry degraded path with creator-authored provenance | `respin-engineer` | `respin/app/(product)/onboarding/confirm/**` |
| 11 | Accessibility pass to the audit #15-#17 standard + component tests | `respin-engineer` | `respin/tests/onboarding-ui.test.tsx` |
| 12 | Action-gate test: every new server action is authenticated and profile-scoped. **The profile-scoped half needs a new mechanism** — the existing `gate-completeness.test.ts` checks `ENFORCING_GATES = ["requireUser","requireAdmin"]` only, so nothing today would turn red when `scope.profile()` is replaced by a raw id. Add a derived scan over `"use server"` exports asserting each obtains a `ProfileScope`, default-deny with a named allowlist for actions that legitimately touch no profile | `respin-engineer` | `respin/tests/{action-gate,gate-completeness}.test.ts` |
| 13 | Register new routes in `respin/lib/routes.ts` (`PROTECTED_PREFIXES`) and `NAMED_PROTECTED_PAGES` | `respin-engineer` | `respin/lib/routes.ts`, `respin/tests/gate-completeness.test.ts` |
| 14 | Assert **no in-product path creates a non-owner membership** (DL-9), so "M2 assumes one owner per workspace" is tested rather than claimed | `respin-engineer` | `respin/tests/action-gate.test.ts` |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/app/(product)/onboarding/**` | New | Wizard pages, views, `actions.ts` |
| `respin/tests/onboarding-ui.test.tsx` | New | Accessibility + behaviour |
| `respin/tests/action-gate.test.ts` | Modified | New actions join the existing completeness gate |
| `respin/tests/routes.test.ts` | Modified | New routes registered |
| `respin/tests/page-wiring.test.tsx` | Modified | Wiring assertions |
| `respin/packages/config/src/schema.ts` | Modified (if not done in P1) | `profileCaps` |

## Migration Steps

None new. Draft state persists in `creator_profiles`/`brain_docs` (status `draft`) using the phase 1 schema. If a `draft` status value is missing from the enum, it is added as migration `0012_*`/`0013_*` **in this phase**, generated via `db:generate`, `db:check` clean.

## Verification Steps

1. **State: phases 2 and 3 complete and green** (ledger shows their ACs met).
2. **State: after task 7.** `pnpm -C respin test -- onboarding` with the **stub** adapter -> a full run activates the three writable kinds.
3. **State: after step 2.** Mutation check — make activation write two of three; AC-4 goes red. Plant a `performance_meta` write; AC-4 goes red.
4. **State: after task 9.** With config `profileCaps.free = 1` and one profile present, creating a second is refused naming tier and cap (AC-8); with `studio = 5`, a fifth succeeds and a sixth is refused (non-vacuity).
5. **State: after task 11.** Accessibility assertions: every input has a resolvable label; **no placeholder is the sole label**; every disabled control's `aria-describedby` resolves to a real element; a second failed submit re-focuses the error summary (AC-9).
6. **State: after task 12.** `pnpm -C respin test -- action-gate` -> every onboarding action appears and is proven authenticated and profile-scoped; the completeness assertion fails if an action is added without a case.
7. **State: after step 6.** Mutation check — replace one action's `scope.profile()` with a raw `profileId` read; the tenancy assertion must go red.
8. **State: after step 7.** Full entry gate on the CI shape.
9. **State: after task 3b.** Plant `fetch("https://instagram.com/...")` in a server action and confirm **AC-12 goes red**. Restore.
10. **State: after task 5.** Open a pause on the fixture workspace, attempt inference and activation, confirm both refuse; resume and confirm both succeed. **AC-13.**
11. **Evidence run (separate from the gate).** Real onboarding runs with realistic inputs against the live adapter, timed, recorded in `docs/progress/respin-m2/onboarding-timing.md`.

    **The harness lives outside the test tree** (`respin/scripts/evidence/onboarding-run.ts`), so it does not trip phase 2 AC-5's no-live-call scan; its live-token cost is real and is named in the master plan's budget table.

    **Each run records:** the operator **and whether they are the builder**, the date, the inputs used, what "start" and "complete" mean, and wall-clock **including thinking time**. A builder running their own wizard is a **different population** from the build-plan's accept-when ("*a new user* completes onboarding in under 20 minutes"). Until the runs are real new users the honest claim is **"not yet measured"** — never "<20 minutes". **This is evidence, not a gate** (Risk R8, and the build-plan's own M3 precedent).

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | A full wizard run with 5-10 posts activates the **three writable kinds** | test `a complete run activates the three writable brain docs`. *`performance_meta` is M5's (phase 3 F10); round 2 left "all four kinds" here, in the handoff, and in two verification steps while task 7 said three — and phase 3's `WritableBrainKind` made this criterion unimplementable, so an implementer would have resolved it by relaxing the type or adding a bypass, i.e. the two things round 1 blocked* |
| AC-2 | **Every inferred field renders its verbatim quote and its source**, and the rendered quote is a literal substring of the submitted input | test `the confirm screen shows real evidence, not paraphrase` |
| AC-3 | The rendered label is the **countable** `evidence: N of M posts` from `packages/brain`, and it is **perturbation-invariant**: vary every field of the adapter response with the grounded quotes held fixed, and the rendered label does not move | red against a screen that renders a model-supplied value. *Round 2's AC compared against a fixture, which passes whenever the fixture happens to agree — the exact shape AC-6 was rewritten to kill* |
| AC-4 | Activation is **all-or-nothing** across the three writable kinds, and **`performance_meta` is never written** | test; red when activation writes two of three, and red when a `performance_meta` write is planted |
| AC-5 | **Any** unconfirmed inferred field blocks activation, surfaces a field-level error, moves focus to the summary, and **re-focuses on a second failed submit** | test `unconfirmed blocks and the second failure re-focuses`; red when narrowed to below-threshold fields |
| AC-6 | Model unavailable/schema-error: input retained, no brain activated, manual entry offered, and manual fields stored as **creator-authored** provenance | test pair |
| AC-7 | Re-inference limit refuses with **no network call attempted**, and the reason is named on the disabled control | test with a transport spy + `aria-describedby` resolution |
| AC-8 | Profile caps enforced from config; refused before any work, naming tier and cap; the fifth Studio profile succeeds (non-vacuity) | test (step 4) |
| AC-9 | Accessibility: every field has a visible associated label, no placeholder-as-label, every disabled control's reason resolves | `respin/tests/onboarding-ui.test.tsx`, mirroring `auth-form.test.tsx` |
| AC-10 | Every new server action is authenticated **and** profile-scoped; the gate's completeness assertion covers them | `respin/tests/action-gate.test.ts`; red under a raw-`profileId` mutation (step 7) |
| AC-11 | Onboarding completes on a **Free** workspace with a zero credit balance, producing the **full** brain | test `Free can onboard` — the R-21 x D-M2-2 interaction, proven not assumed |
| AC-12 | **The only URL the product ever constructs is `https://www.youtube.com/oembed?...`.** A YouTube *watch* URL, `youtube.com/api/timedtext`, an Instagram link and an arbitrary link are all refused with the paste fallback and **no request made**. The allowlist test is **generative against the installed URL parser** — a permutation corpus over hosts, schemes, userinfo and punycode — not a list of counterexamples | network-spy test, **red against four planted mutations**: `fetch(watchUrl)`, `fetch(timedtextUrl)`, an `endsWith` host check (which accepts `notyoutube.com`), and a followed cross-host redirect |
| AC-18 | **REQ-I03, production side:** a specific the submitted inputs do not state renders as `[check]`, never as a fact | red against a planted fabricated-specific response. *Round 2's four REQ-I03 criteria all tested that `[check]` **survives** a boundary; none tested that it is **produced**, so a plausible invented specific attached to a real-but-unsupporting quote passed every one* |
| AC-19 | **REQ-B03's enum is closed**: the metric set equals PRD REQ-B03's exactly, free text and any composite "engagement" option are refused, and declaration is required before activation | red against a planted out-of-enum value. *This is the one clause of the learning path M2 actually implements, and round 2 gave it no criterion* |
| AC-20 | **The 0-3 reference cap is enforced**, so a brain cannot be built predominantly from third-party material | test |
| AC-21 | **No brain-doc content string is a verbatim substring of any `reference`-classed input** — the D-M2-4 validator run inverted (D-M2-10) | red against a planted lift |
| AC-13 | **A paused workspace can perform NO M2 write** — profile creation, input append, draft write, inference, activation — and an unpaused one can (non-vacuity). The fixture includes the **drift state** `{open pause_periods, mirror canceled}`, so an implementation using `isPausedSubscription` goes **red**. Export stays available | paired test; red under the wrong predicate and red when any write is left ungated. *Round 2's fixture opened the pause the ordinary way, which writes both records, so both predicates agreed and the test could only catch absence* |
| AC-14 | **REQ-B02's sensitive-trait clause:** a field outside the closed inferable-field allowlist is **refused**, never surfaced for confirmation | test, red against a planted out-of-allowlist inference. *Round 1 stated this [Must] in F6 and gave it no criterion* |
| AC-15 | **REQ-I03:** the confirm screen never renders a field as inferred without resolvable provenance; a `[check]` marker survives to the screen | test, red against a planted ungrounded inferred field |
| AC-16 | A `reference`-classed input can never become `voice` provenance | test (the UI half of D-M2-10; `packages/brain` refuses it independently) |
| AC-17 | A second inference for the same profile is refused with the reason named on the disabled control | test + `aria-describedby` resolution |

## Least confident (one line)

**That the interview + 5-10 posts yield enough grounded evidence for a `voice` doc that a creator will actually confirm field-by-field** — AC-2 and AC-15 force the honest outcome (fewer fields, or fields marked creator-authored) rather than a paraphrase dressed as provenance, and the round-1 gate sharpened the consequence: with D-M2-5b requiring **every** inferred field to be confirmed and only **one** inference included per profile (`PRD.md:135`), a thin first brain pushes creators straight into a limit that refuses them — so the two weakest bets in this plan compound, and if that happens the answer is to revisit the limit as config, not to weaken the confirm gate.

## Out of Scope (Surgical Changes)

Do not generate the first three ideas (REQ-B04 — M3, DL-1). Do not build the brain editor pages (phase 6). Do not build any Studio mode. Do not add a credit debit (D-M2-2 prices this at 0). Do not write `performance_meta`. Do not build a general link fetcher, a headless browser, or any HTML parser — D-M2-9's allowlist is the whole permitted surface. Do not touch `packages/credits/**` beyond reading the config and the pause predicate, `src/`, or `cutdown/`.

## Completion Criteria (Definition of Done)

- Entry gate clean on the CI shape.
- Applicable Critical-Path gates PASS: **brain tenancy** (primary), **spin compliance** (REQ-I03 via AC-15, compliant sources via AC-12, reference provenance via AC-16), **learning honesty** (north-star metric, the evidence claim's population), **billing & credits** (persisted metering, the once-per-profile limit, the pause refusal, the Free-tier interaction).
- Engineering claim and the <20-minute **evidence** claim reported separately.
- AC-1 .. AC-21 met with named evidence.
