# CLAUDE.md

*This file is the contract every agent and command in the pack obeys, and it rides in **every session's context** — keep it honest and lean (~200 lines). A stale rule misleads every downstream agent; a low-value line dilutes the rules that matter. If a line doesn't change how an agent behaves, move it to a skill or doc and point to it.*

Checkpoints: on

## What you are building

**Respin — Creator Content Engine** (active direction since 2026-08-13, `docs/initial/decisions.md` R-1): a subscription web service that turns a creator's idea, reference reel, or day of footage into a script in their own voice, mapped to shots they can film, built on mechanisms extracted from posts proven to perform — and that gets measurably better per creator as posted results feed back in. Three-layer IP: universal laws → curated shared framework library → per-creator brain (four versioned docs; context, never weights — R-8). Four surfaces: Studio (7 modes), Trends (autopsy + **Spin**), Results (the learning loop), marketing site + billing. Stack (tech-spec §1, R-18/R-19): Next.js 15/TS, self-hosted Postgres (Docker locally, Lightsail in prod) + Drizzle, Better Auth, Stripe, Inngest, Anthropic behind a provider adapter — no Vercel/Neon/Clerk. The build follows `docs/initial/build-plan.md` (M0 landed; **M1 complete 2026-08-17** — billing + credit ledger, both Critical-Path gates PASS (Ready, A/A), live Stripe evidence run E1-E7+E4b discharged (E8 blocked on a Stripe test-clock route this product doesn't have yet, E9 deferred to M3), report card `docs/progress/respin-m1-review.md`; M2 next), in the **`respin/` subdirectory** (self-rooted workspace like `cutdown/` — R-15).

Two earlier product lines remain in this repo: **UGC Intelligence** (`src/` — built and tested, docs frozen at `docs/initial.past/`; start at `docs/initial.past/README.md` and `docs/initial.past/integration-contract.md`) and **Cutdown** (`cutdown/` — parked as a possible future execution layer, `docs/video-editing/`).

## Golden rules (any project — keep these even if you rewrite everything else)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state. Deletion is the one mistake you can't iterate on.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back.
7. **Small, verifiable steps.** Prefer the change you can test over the big-bang you can't; if you can't verify it, say so.
8. **Scale caution to blast radius.** Reading and analyzing are free — they change nothing. Edits and test runs are cheap — they're reversible. Pushing, publishing, sending anything outside the repo, and deleting what you didn't create (rule 3) are not: those wait for explicit confirmation, and if you catch yourself reaching for reasons one is *probably* fine, that reaching is the signal to stop and ask.
9. **Current facts beat trained memory.** Library APIs, CLI flags, and config schemas are present-day facts: verify against the installed version (lockfile, type definitions, `--help`, official docs) before use — partial recognition from training is not current knowledge.

## Non-negotiable rules (Respin — the active build)

1. **Spin, never copy.** The similarity gate is a hard pre-display gate (REQ-E04/I02, R-3); ingest from compliant sources only — no scraping of closed platforms (REQ-E01, R-4).
2. **The ledger is the balance.** `credit_ledger` is append-only, balance derived; webhooks idempotent on Stripe event id; debit in the generation's transaction (REQ-G04/G06, R-6).
3. **Brains are context, never weights, never silent.** Versioned docs, per-field provenance, proposal-approval for every update (R-8, REQ-B02/C05).
4. **Learning is earned.** Proposals only from `packages/brain` at n ≥ 3 comparable verified results; unverified never learns; paid/organic never pool; reach and conversion never collapse (R-10, REQ-F).
5. **No leakage.** Nothing crosses profiles or workspaces; library contributions are mechanism-level only (REQ-A03/D04, R-9).
6. **No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point; engineering and evidence completion are separate claims (REQ-I03/I04, build-plan).

## Non-negotiable rules (UGC Intelligence codebase — `src/`)

1. **The model never decides.** Vetoes (V1–V6) and verdicts are computed in deterministic application code from extracted features and stored records; the model may raise a `suspected_veto` but may never clear one, and its output is never an input to veto/verdict computation — a model-influenced compliance decision is a silent regulatory breach (P1).
2. **No auto-approval, ever.** Every `APPROVED` requires a real human click (`human_approved_at`); REQ-021 is a won't-change constraint that keeps the system outside "substantially automated decision" scope.
3. **One-way call-graph, sole authorities.** C2 never calls C1 **and never calls C4**; C1 and C3 only consume the append-only event log; C2 is the sole OutcomeEvent writer; C3 alone trips/arms the breaker and vetoes *pattern*-library promotion; C4 writes nothing, calls nothing, reads no breaker, and its whole read grant is one artefact-store prefix — no config, admin flag, or per-campaign exemption overrides these, because an authority overridable from the component it governs is a comment.
4. **Fail closed.** Unreachable C3, stale breaker cache (>60s), version-triple mismatch, missing library, or model schema/parse failure degrades to `cold`/advisory/`NEEDS_REVIEW` — never to a default score, never to approval.
5. **Measurement discipline.** A `Proxy` value is never shown or aggregated as `Measured`, **and never enters an effect-size calculation** — pattern *proposal* reads both corpora, pattern *estimation* reads the internal corpus only. Every rate names a period-stable denominator; organic and boosted series are never summed; baselines use median/MAD, never mean/stddev; calibration uses temporal holdouts, never random splits; trend signals **and mechanisms** never enter VPS at any weight.
6. **Mechanisms are hypotheses, never numbers.** A `Mechanism` carries no effect size (schema-forbidden via `additionalProperties: false`), a required `falsifier`, and a `warrant` rung computed from corpus counts; it is mined only from the public exemplar corpus, is tenant-neutral by construction, and is human-ratified before serving. Automatic to demote, human to promote. `contrasted` is the ceiling and is **not a causal claim** — *causes/lifts/drives/predicts* are forbidden verbs.
7. **Money & exploration.** ε stays in [0.10, 0.30] with no path to zero; every allocation carries an `arm` tag that propagates to all downstream events and mining; budgets sum exactly to the stated budget; no recommendation reaches a client without human sign-off (REQ-037).
8. **Rights & tenancy.** `organic_publish` never implies `paid_amplification`; a grant without `evidence_uri` is not a grant; creators under 18 are excluded from stored records fail-closed (never inferred from content); tenant outcome data never crosses tenants — no widening override, no admin path, and **a summary statistic of outcome data is outcome data** (no pooled effect sizes, no cross-tenant confirmation counts).
9. **Invariants change by ADR, not by drift.** The doc set defines the product: a change that weakens any invariant above must update the owning ADR and `integration-contract.md`, and a semantic change to `rubric-v1.json` / `events-v1.json` / `mechanisms-v1.json` bumps the version — never mutates a published contract in place.

## Lessons — high-value mistakes (self-updating)

> Mistakes that actually happened in this project, distilled into rules so they never happen twice. When a reviewer gate, a person, or a failed run catches a mistake worth remembering, add **one line** here (agents: offer first, never append silently). Keep only high-value entries, at most ~10 — when it's full, merge or retire the weakest, or promote a proven lesson into a Non-negotiable rule above or (if a diff pattern can catch it) a guardrail in `.claude/guardrails.rules.json`.
> Format: `YYYY-MM-DD — <rule an agent can obey> (why: <the mistake, in one clause>)`

- 2026-07-21 — A dependency install is proven by **importing** each package, never by the installer's exit code — and at a uv/pnpm **workspace root**, syncing installs only the root project unless you pass `--all-packages` (why: `uv sync` exited 0 having installed nothing, then a second run reported success while three OpenCV distributions silently clobbered one `cv2/` directory and broke three engines at import).
- 2026-07-14 — A semantic schema bump (`events-v1.json` / `rubric-v1.json` / `mechanisms-v1.json`) must update the C# contract-mirror constant (e.g. `VerdictIssuedContract.Version`) **and** its assertion tests in the *same* change, then run `dotnet test` — a "docs-only" bump is not docs-only (why: R0 bumped events-v1.json to 1.3.0 and left 2 C# version-assertion tests red until R1 caught it).
- 2026-07-30 — When a review names an unguarded field, fix the **class, not the field**: guard where the path is *built* (a documented direct entrypoint makes a caller-side guard a documented bypass), validate the whole artefact at its boundary so every `$ref: Ulid` is enforced at once, put the guard in a package **every** consumer can import, and add a lint — "grep every sibling id" is the version of this rule that already failed (why: one id-to-path defect recurred **six** times in one phase across four review rounds, twice *inside* the fixes for the previous ones — a cross-job write via `validate`'s `edlId`, `asset.storedPath` into FFmpeg, `plan`'s `assetId`, a bare-cast draft manifest that made the post-approval integrity check return `ok: true` on a stripped file — and the guards lived in a package `renderer-ffmpeg` could not import, so a 90-line lint found six live sites three review rounds had missed).
- 2026-07-30 — A comment claiming a property is not the property: **assert it in a test or delete the claim**, and when a review names an inversion your fix might cause, write that inversion as a test before calling the fix done (why: a "total order" docstring sat above a *string* compare on an offset-bearing `date-time`, letting an approval outrank a later rejection; the fix then realised the exact inversion round 1 had warned about — an unreadable rejection vanished and an older approval authorised a rejected cut — and two more comments asserted behaviour the code lacked).
- 2026-07-30 — Fail closed, but **never without a way forward**: before making an unreadable or invalid file fatal, grep every *writer* into that directory, and read the refusal's own printed remedy — if it says "delete this evidence", the control is the outage (why: scoping "any bad file blocks" to `reviews/` left every job permanently unable to reach final render or packaging, on the happy path, with a real human approval on disk, because `validate` — pipeline step 5 of 9, so *every* job — wrote its gate reports there; two of the four Phase-0 exit criteria became unmeasurable, and the printed fix told the operator to delete required review evidence).
- 2026-08-02 — For a tool that resolves config by walking UP the directory tree (ruff, eslint, git attributes…), a nested self-rooted project having "no config file" means "**the enclosing repo's config**, silently" — pin the subproject's own config explicitly, and treat a green lint claim as vacuous until you know *which* config produced it; relatedly, a cross-skill option is only alive when a test drives it from its real producer's artefact (why: cutdown Python passed five phases of "ruff clean" under the UGC root's selection nobody chose, and `render --audio-events` refused the only artefact the pipeline produces because no test had ever fed it one — both found by the Phase 6 proving run, not by review).
- 2026-08-10 — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun**, and an architecture guard satisfied by *splitting* a file must be re-checked for the hole the split opens (why: `cutdown doctor` printed a green `OK` for a `uv`/`pnpm` it had just failed to execute — four probe outcomes collapsed into one empty version string, in the one command whose job is honest environment reporting, surviving because no test called either check — and moving the spawn out of `doctor.ts` to satisfy tech-spec §11 then made `toolVersion('ffmpeg')` invisible to the very detector, since the caller names the binary without importing `child_process` and the helper imports it without naming one).
- 2026-08-18 — When a guard's promise depends on a **third-party parser accepting the same values it does**, prove that property **generatively against the installed parser**, never with a list of counterexamples — and never report a thing recorded until you have re-read the file (why: a `trustedProxies` validator whose whole job was "anything we accept, Better Auth accepts" was hardened twice against named counterexamples and failed a third gate round with **nine** more over-accepts in unlisted classes — zero-padded IPv4 like `010.000.000.000/8`, which a person would plausibly type, drove the exact cross-tenant shared-bucket outage the guard existed to prevent; the test had pinned 18 hand-picked strings, so each round fixed the instances and left the class open, and in the same session a re-gate request claimed a limitation had been recorded in `decisions.md` when only a different paragraph had been edited).

## Commands

```bash
pnpm -C respin typecheck && pnpm -C respin lint && pnpm -C respin test && pnpm -C respin build   # Respin entry gate (active build — M0+)
DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin db:migrate   # Respin live migration apply (db:check below is offline)
pnpm -C respin db:check                              # Respin migration drift check (schema vs committed migrations)
TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin test   # SAME suite with the two Docker concurrency suites LIVE (they loud-skip without it; this is the CI shape and the only run that proves the ledger's money invariants under real concurrency — `docker compose -f respin/docker-compose.yml up -d` first)
node -e "['docs/initial.past/schemas/rubric-v1.json','docs/initial.past/schemas/events-v1.json','docs/initial.past/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))"  # entry gate: the three UGC contract schemas parse (frozen set — see Where things live)
dotnet build UgcIntelligence.slnx                    # control plane (C2, C3, C4 + shared libs). .NET 10 emits .slnx, not .sln
dotnet test tests/Architecture                       # the suites that test the architecture, not the model
uv run --with pytest pytest tests/Architecture       # intelligence plane (C1 + extraction). Casing matters: lowercase collects ZERO tests on Linux
uv run --with ruff ruff check src/IntelligencePlane tests/Architecture
npm --prefix src/Frontend run typecheck             # manager UI (types regenerate from schemas first)
npm --prefix src/Frontend test                      # UI honesty suite + component tests (vitest)
```

## Where things live

- **Active product doc set → `docs/initial/`** — **Respin** (Creator Content Engine): `PRD.md`, `tech-spec.md`, `build-plan.md` (M0–M6), `gtm.md`, `decisions.md` (R-1 supersedes the Cutdown program; append-only). Respin code lives in `respin/` — M0 and the R-18/R-19 auth swap have landed.
- **UGC Intelligence doc set → `docs/initial.past/`** (frozen 2026-08-13) — PRD, tech specs (UGC / trend / knowledge), ADRs 0001–0009 in `adr/`, component specs (C1/C2/C4), eval plan, compliance notes. Still authoritative *for the built UGC code in `src/`*; no longer the product direction.
- `docs/initial.backup/` is the **superseded first draft**, kept for provenance. Do not cite it, do not edit it, and do not trust its links (flat layout; links assume subfolders). Two known defects are corrected in the authoritative set: `Proxy` outcomes entering an effect-size calculation, and a `c3_ace` field name that collides with Component 3.
- Machine-readable contracts → `docs/initial.past/schemas/` — `rubric-v1.json` (vetoes, VPS/BAS/AWS weights), `events-v1.json` (event envelope, breaker states, Contracts B–D), `mechanisms-v1.json` (Mechanism, warrant ladder, Contract E). The three consumers (`src/Frontend/scripts/gen-types.mjs`, `tests/Architecture/MechanismSchemaTests.cs`, `tests/Architecture/test_synthesiser.py`) read them at this path — the post-pivot breakage recorded here is closed.
- The integration spine → `docs/initial.past/integration-contract.md` — Contracts A–E, failure semantics. Read this before proposing any cross-component change to the UGC code.
- **C3's component doc** is `docs/initial.past/component-3-calibration-monitor.md` (added in Phase 4, closing deferral D4); its spec also lives across ADR-0005 and Contracts C/D.

## Conventions

- **Docs-first**: an invariant changes in the doc set (ADR + integration contract) before any code claims it.
- Requirements are cited by ID (`REQ-xxx`), decisions by ADR number — keep citations when editing.
- Code conventions (from the tech spec): deterministic decisions in C#; stats in Python (`scipy`/`statsmodels`); content-addressed immutable artefacts (sha256); idempotency-keyed append-only events.

## Critical Paths → reviewer mapping (which gate runs when)

A change touching **N** Critical Paths must pass **N** gates. Skipping a gate because "tests pass" or "it's a small change" is drift. Catching yourself arguing a change is too small to gate is the signal to run the gate.

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) |
|---|---|---|---|
| Veto & verdict integrity | vetoes V1–V6, verdict engine, approval flow, model prompt/output handling, `rubric-v1.json` lanes, compliance notes, **mechanism-statement ratification** | `veto-verdict-integrity` | `veto-integrity-reviewer` |
| Boundaries & authority | component call-graph, event log / `events-v1.json`, breaker, library promotion, version triple, tenancy, **`mechanisms-v1.json` / Contract E / C4** | `component-boundaries` | `boundary-reviewer` |
| Measurement discipline | provenance, baselines/denominators, calibration & eval plan, trend subsystem, holdout design, **prevalence & the warrant ladder** | `measurement-discipline` | `measurement-reviewer` |
| Money & exploration | budget allocation, ε, `arm` tags, AWS weights, amplification recommendations | `budget-exploration` | `budget-exploration-reviewer` |

**Cutdown is a second product line** (`cutdown/`, `docs/video-editing/`) and is exempt from the four rows above by `docs/video-editing/tech-spec.md` §14 — it has its own two paths, and the exemption is not an absence of gates:

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) |
|---|---|---|---|
| Cutdown measurement honesty | counting & exit criteria, `status --phase0`, baselines/cohorts/denominators, uplift or performance claims, QA pass rates, latency/cache/accuracy rates, `packages/evaluation`, `output-counting-policy.md`, PRD §14/§15 numbers | `cd-measurement-honesty` | `cutdown-measurement-reviewer` |
| Cutdown tenancy & boundaries | `packages/contracts/schemas/**`, `contract-set.ts`, generated trees, delivered-artefact immutability, `decisions.md`, artefact paths & containment, skills registry / `cutdown-*` mirror, the boundary to `src/`, Review Studio & workspace isolation | `cd-tenancy-boundaries` | `cutdown-boundary-reviewer` |

**Respin is the active product line** (`docs/initial/` — PRD/tech-spec/build-plan, decisions R-1 supersedes the Cutdown program; the UGC doc set is frozen at `docs/initial.past/`). Its four paths gate the Respin build (`app/`, `packages/`) from M0; the six rows above continue to gate the earlier codebases they name:

| Critical Path | Triggered when the change touches… | Reviewer skill (`.claude/skills/`) | Reviewer agent (`.claude/agents/`) |
|---|---|---|---|
| Respin billing & credits | billing, `credit_ledger`, metering, Stripe webhooks, tiers/pricing/allowances, packs, auto-top-up, pause/resume, expiry, `packages/credits`, `packages/config`, margin dashboard, PRD §4G | `respin-billing-credits` | `respin-billing-reviewer` |
| Respin brain tenancy | workspace/profile isolation, query scoping, `brain_docs` versioning & provenance, onboarding inference, session→library contributions, export/deletion, seats/roles, admin surface, PRD §4A/§4D | `respin-brain-tenancy` | `respin-tenancy-reviewer` |
| Respin spin compliance | `packages/trends` ingest adapters, autopsy pipeline, Spin, the similarity gate, kill-test honesty, integrity guardrails REQ-I01–I05, PRD §4E/§4I | `respin-spin-compliance` | `respin-compliance-reviewer` |
| Respin learning honesty | results entry, verification flags, baselines, north-star metrics, promotion proposals, minimum-n, `packages/brain`, reach-vs-conversion, confounders, success-metric/pilot claims, PRD §4F/§5 | `respin-learning-honesty` | `respin-learning-reviewer` |

## Definition of Done

A change is done when (the full gate machinery lives in the `using-the-pack` skill):
- **Entry gate clean first:** every command in the Commands block passes — schemas parse, `dotnet build` + `dotnet test`, `pytest`, `ruff`, frontend typecheck + tests — or, when a baseline is recorded at `docs/progress/entry-baseline.md`, no **new** failures vs it (it only ratchets down, and retires at green).
- Every applicable Critical-Path gate reports PASS — the table above decides which run — and the report card reads **Ready**.
- Cross-referenced docs stay consistent: an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together, in the same change.
- Acceptance criteria met; docs updated if behaviour or config changed (`/sync-docs` does this).
