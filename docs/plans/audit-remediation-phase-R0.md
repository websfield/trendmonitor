# Phase R0 — Docs-first: contracts, schema bump, ADRs

**Depends on:** none. **Primary agent:** `control-plane-engineer`. **Gates:** `boundary-reviewer` (Contract B, ADR-0007, transport ADR), `measurement-reviewer` (#16 retention/durability).

> **Why this phase is first.** CLAUDE.md convention: *"an invariant changes in the doc set (ADR + integration contract) before any code claims it."* R1's #1 fix adds a field to a published event; R2's #2 fix claims a wire-format the contract never stated; R4's #3 build claims a host-separation property ADR-0007 only half-states. Those doc/schema changes land **here**, before the code in later phases relies on them.

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Golden rule 1:** Read before you write. Never edit a file you haven't read; never state a "fact" about the code you haven't verified.
- **Non-negotiable rule 9:** Invariants change by ADR, not by drift. A change that weakens any invariant must update the owning ADR and `integration-contract.md`; **a semantic change to `rubric-v1.json` / `events-v1.json` / `mechanisms-v1.json` bumps the version — never mutates a published contract in place.**
- **Non-negotiable rule 3:** One-way call-graph, sole authorities. C2 never calls C1 and never calls C4; C4 writes nothing, calls nothing, reads no breaker, read grant is one artefact-store prefix.
- **Non-negotiable rule 6:** Mechanisms are hypotheses, never numbers. `contrasted` is the ceiling and is **not** a causal claim.
- **Convention:** Requirements cited by ID (`REQ-xxx`), decisions by ADR number — keep citations when editing.
- **Available agents:** `control-plane-engineer`, `boundary-reviewer`, `measurement-reviewer`, `plan-reviewer`. Do **NOT** request agents that don't exist in `.claude/agents/`.

## Requirements Checklist (functional)

1. **#2 (doc):** `integration-contract.md` Contract B states the wire-format/serialization convention explicitly (snake_case keys, string `event_type`/enums), matching Contract A/E which ship worked examples.
2. **#16 (doc):** `integration-contract.md` Contract B carries a one-paragraph retention/durability note; an ADR records the durable-store step with stated exit criteria and the data-subject-erasure tension against the immutable-by-construction log. **The note must record erasure as an unresolved *tension* (per DR1) — it must NOT prescribe erasure-by-mutation of the append-only log, which would break replay reproducibility, `corpus_snapshot_sha256` provenance, and `as_of` semantics.** No pooled or cross-tenant statistic is introduced.
3. **#1 (schema):** `events-v1.json` bumped to **1.3.0** (from 1.2.0) with a changelog entry adding an optional `human_approved_at` to the `VerdictOverridden` event payload. 1.2.0 is **not** mutated.
4. **#3 (ADR):** ADR-0007 revised to state **host-project** (not merely reference-graph) separation as the actual safety property for C2/C3/C4; a new or revised ADR records the cross-process artefact/breaker transport as a **tracked, dated** integration gap (not silent).
5. **#18 (doc):** the Gate-A sequence diagram in `integration-contract.md` gains an explicit "resolve `active_version` pointer" step before the breaker query.

## Requirements Checklist (technical / non-negotiables)

- The schema bump follows the `1.0.0 → 1.1.0 → 1.2.0` precedent: a new version block/changelog, published 1.2.0 untouched, `additionalProperties: false` discipline preserved.
- Every invariant edit updates ADR **and** `integration-contract.md` **and** (where relevant) the schema JSON **together, in this one phase** (DoD cross-reference rule).
- No causal verb enters any doc edit (rule 6 forbidden-verb lexicon: causes/lifts/drives/predicts).

## Edge Cases & Failure Paths

- **Inverse:** adding `human_approved_at` to `VerdictOverridden` must not imply it is *required* for non-APPROVED overrides — it is optional, populated only when `override_verdict == APPROVED`. State this in the schema description.
- **Double-failure:** if the schema bump breaks the entry-gate parse, the whole gate fails — R0's own verification step (schemas parse) catches it before handoff.
- **Degraded mode:** the transport ADR must state the *current* degraded reality (fixture-only transport, no host) as the dated gap, not a rosy future — this is the honesty the audit demands (#3/#6).

## Handoff Contracts (consumed by later phases)

- **→ R1:** `events-v1.json` 1.3.0 `VerdictOverridden.human_approved_at` shape (name, type `string`/date-time, optional). R1 adds the matching C# field + payload key + guard.
- **→ R2:** the Contract-B wire-format sentence — R2's code makes `ToReplayExportNdjson` satisfy it.
- **→ R4a/R4b:** ADR-0007's host-separation property + the transport ADR's stated gap — R4a/R4b build to close it.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R0-T1 | Add explicit wire-format convention line to Contract B (snake_case keys, string event_type/enums) with a one-line worked example | control-plane-engineer | `docs/initial/integration-contract.md` |
| R0-T2 | Add retention/durability + erasure-tension paragraph to Contract B | control-plane-engineer | `docs/initial/integration-contract.md` |
| R0-T3 | Add "resolve active_version pointer" step to the Gate-A sequence diagram | control-plane-engineer | `docs/initial/integration-contract.md` |
| R0-T4 | Bump `events-v1.json` → 1.3.0; add `human_approved_at` (optional, string date-time) to `VerdictOverridden`; add changelog block; leave 1.2.0 semantics intact | control-plane-engineer | `docs/initial/schemas/events-v1.json` |
| R0-T5 | Revise ADR-0007 §5 to state host-project separation as the safety property; add the transport-gap record (this ADR or a new numbered ADR) with a date | control-plane-engineer | `docs/initial/adr/0007-*.md` (+ new ADR if opened) |
| R0-T6 | Open ADR for the durable event-log/artefact store with exit criteria (DR1) | control-plane-engineer | `docs/initial/adr/00NN-durable-store.md` (new) |

## Files to Create / Modify

| Path | New/Mod | Owner | Notes |
|---|---|---|---|
| `docs/initial/integration-contract.md` | Mod | control-plane-engineer | Contract B wire-format + retention; Gate-A diagram step |
| `docs/initial/schemas/events-v1.json` | Mod | control-plane-engineer | → 1.3.0, `VerdictOverridden.human_approved_at`, 1.2.0 untouched |
| `docs/initial/adr/0007-*.md` | Mod | control-plane-engineer | host-project separation + transport gap |
| `docs/initial/adr/00NN-durable-store.md` | New | control-plane-engineer | #16 durable store, exit criteria |

## Verification Steps

1. **Schemas parse** — `node -e "['docs/initial/schemas/rubric-v1.json','docs/initial/schemas/events-v1.json','docs/initial/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))"` exits 0. (State required: R0-T4 done.)
2. **1.2.0 preserved** — grep `events-v1.json` for the prior version string; the 1.2.0 block/changelog is present unchanged and a 1.3.0 block is added. (State: R0-T4.)
3. **Cross-reference closure** — each invariant edit appears in both the ADR and `integration-contract.md`; grep the transport ADR for a date and the word "gap"/"seam". (State: R0-T1..T6.)
4. **No causal verbs introduced** — grep the diff for `causes|lifts|drives|predicts` → none in the new prose.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R0-1:** `events-v1.json` parses and contains a `1.3.0` version marker + a `VerdictOverridden` payload property `human_approved_at`; the `1.2.0` marker still present. (evidence: schema file + parse command exit 0)
- **A-R0-2:** Contract B section of `integration-contract.md` contains a sentence naming snake_case + string enums as the wire format, with a worked JSON snippet. (evidence: file:line)
- **A-R0-3:** Contract B contains a retention/durability paragraph mentioning erasure tension. (evidence: file:line)
- **A-R0-4:** ADR-0007 states host-project separation as the safety property; a dated transport-gap record exists. (evidence: file:line)
- **A-R0-5:** A durable-store ADR exists with exit criteria. (evidence: new file)
- **A-R0-6:** Gate-A sequence diagram has an explicit active_version-resolve step before the breaker query. (evidence: file:line)

## Out of Scope (Surgical Changes)

No code files. No changes to `rubric-v1.json` or `mechanisms-v1.json`. Do not touch published `1.2.0` semantics.

## Completion Criteria (Definition of Done)

Entry gate clean (schemas parse); `boundary-reviewer` PASS on the Contract-B/ADR-0007/transport-ADR edits; `measurement-reviewer` PASS on the #16 retention note; docs cross-referenced consistently in this one change.
