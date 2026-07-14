# CLAUDE.md

*This file is the contract every agent and command in the pack obeys, and it rides in **every session's context** — keep it honest and lean (~100 lines). A stale rule misleads every downstream agent; a low-value line dilutes the rules that matter. If a line doesn't change how an agent behaves, move it to a skill or doc and point to it.*

## What you are building

**UGC Intelligence for ClientHub** — four components: a Pattern Engine (C1, produces beliefs), a Scoring & Amplification service (C2, acts on beliefs at two gates: submission approval and post-publication amplification), a Calibration Monitor (C3, referees — sole breaker + pattern-promotion authority), and a Knowledge API (C4, serves beliefs — read-only, holds no tenant data). **The product is not what is viral, but why:** C1 mines tenant-neutral `Mechanism` claims (falsifiable, no effect size, human-ratified) from the public exemplar corpus; C4 serves them. **Code has landed across three planes:** .NET/C# control plane (`src/ControlPlane/`, `src/KnowledgeApi/`) for every deterministic decision, Python intelligence plane (`src/IntelligencePlane/` — extraction/mining/stats), React/TS frontend (`src/Frontend/`); Hangfire jobs still planned. The doc set stays authoritative — start at `docs/initial/README.md` and `docs/initial/integration-contract.md`.

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

## Non-negotiable rules (this project)

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

- 2026-07-14 — A semantic schema bump (`events-v1.json` / `rubric-v1.json` / `mechanisms-v1.json`) must update the C# contract-mirror constant (e.g. `VerdictIssuedContract.Version`) **and** its assertion tests in the *same* change, then run `dotnet test` — a "docs-only" bump is not docs-only (why: R0 bumped events-v1.json to 1.3.0 and left 2 C# version-assertion tests red until R1 caught it).

## Commands

```bash
node -e "['docs/initial/schemas/rubric-v1.json','docs/initial/schemas/events-v1.json','docs/initial/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))"  # entry gate: the three contract schemas parse
dotnet build UgcIntelligence.slnx                    # control plane (C2, C3, C4 + shared libs). .NET 10 emits .slnx, not .sln
dotnet test tests/Architecture                       # the suites that test the architecture, not the model
uv run --with pytest pytest tests/Architecture       # intelligence plane (C1 + extraction). Casing matters: lowercase collects ZERO tests on Linux
uv run --with ruff ruff check src/IntelligencePlane tests/Architecture
npm --prefix src/Frontend run typecheck             # manager UI (types regenerate from schemas first)
npm --prefix src/Frontend test                      # UI honesty suite + component tests (vitest)
```

## Where things live

- **Authoritative doc set → `docs/initial/`** — PRD, tech specs (UGC / trend / knowledge), ADRs 0001–0007 in `adr/`, component specs (C1/C2/C4), eval plan, compliance notes. Layout matches the links.
- `docs/initial.backup/` is the **superseded first draft**, kept for provenance. Do not cite it, do not edit it, and do not trust its links (flat layout; links assume subfolders). Two known defects are corrected in the authoritative set: `Proxy` outcomes entering an effect-size calculation, and a `c3_ace` field name that collides with Component 3.
- Machine-readable contracts → `docs/initial/schemas/` — `rubric-v1.json` (vetoes, VPS/BAS/AWS weights), `events-v1.json` (event envelope, breaker states, Contracts B–D), `mechanisms-v1.json` (Mechanism, warrant ladder, Contract E).
- The integration spine → `docs/initial/integration-contract.md` — Contracts A–E, failure semantics. Read this before proposing any cross-component change.
- **C3's component doc** is `docs/initial/component-3-calibration-monitor.md` (added in Phase 4, closing deferral D4); its spec also lives across ADR-0005 and Contracts C/D.

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

## Definition of Done

A change is done when (the full gate machinery lives in the `using-the-pack` skill):
- **Entry gate clean first:** every command in the Commands block passes — schemas parse, `dotnet build` + `dotnet test`, `pytest`, `ruff`, frontend typecheck + tests — or, when a baseline is recorded at `docs/progress/entry-baseline.md`, no **new** failures vs it (it only ratchets down, and retires at green).
- Every applicable Critical-Path gate reports PASS — the table above decides which run — and the report card reads **Ready**.
- Cross-referenced docs stay consistent: an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together, in the same change.
- Acceptance criteria met; docs updated if behaviour or config changed (`/sync-docs` does this).
