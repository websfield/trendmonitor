---
name: cd-tenancy-boundaries
description: Use whenever a Cutdown change touches contract authority or versioning (`packages/contracts/schemas/**`, `contract-set.ts`, generated trees), delivered-artefact immutability, `decisions.md`, artefact paths and job containment, the skills registry or the `.claude/skills/cutdown-*` mirror, the workspace boundary to `src/` (UGC Intelligence), or — from Stage 2 — the Review Studio, workspace/tenant isolation, or any second writer of an artefact the skills already own. The hard rules — a semantic schema change adds a new file and never mutates a published one; a delivered package is never rewritten and never becomes unreadable; every id that builds a path is validated by whole-artefact validation at the boundary; and no surface becomes a second source of truth. Mandatory before any schema bump, path construction, registry edit, or new write path.
---

# Cutdown Tenancy & Boundaries

This is the rule canon for the **Cutdown tenancy & boundaries** Critical Path. Its gate is
`.claude/agents/cutdown-boundary-reviewer.md`. Scope is Cutdown only — `cutdown/`,
`docs/video-editing/`, and the generated `.claude/skills/cutdown-*` mirror. The UGC
Intelligence `component-boundaries` skill governs a different product (`tech-spec.md`
§14) and does not apply here.

## Why this path exists

Cutdown's authority model is unusual and easy to break by accident: **contracts are the
product**. The artefacts are content-addressed and immutable, the decisions log is
append-only settled law, generated type trees are committed, and the skills mirror is a
projection into a host repo the workspace is otherwise forbidden to depend on. Every one
of those is a rule about *who may write what* — and the project's own history says this is
where it fails. The 2026-07-30 lesson exists because **one id-to-path defect recurred six
times in one phase**, twice inside the fixes for the previous ones.

Three plan-review rounds on Stage 0 returned BLOCK, and essentially every finding landed
on this path: a contract bump that would have made the delivered evidence base permanently
unreadable; a drift classifier that would have called the largest breaking change in the
program `added`; a caller-supplied field standing in for an authority.

## The rules

### B1 — A semantic schema change adds a NEW FILE (`tech-spec.md` §3)

> A **semantic** change (new required field, changed meaning, removed field) bumps the
> major version and **adds a new file** — it never mutates a published schema in place.

Consequences that are part of the rule, not optional follow-ups:

- The old file stays **published and valid**. Both are registered; both validate.
- Every reader must become **version-dispatching** *before* the writer moves. An artefact
  written under an older major is **legacy, not invalid**.
- A new `$id` carries its version, so anything keying by full `$id` sees a new major as a
  *new object*. Drift classification must key by **schema family** (`$id` minus version),
  or a breaking bump silently classifies as `added` — see `contract-set.ts` `diffContractSets`.
- A compatible addition is a minor bump **in place** with a changelog entry (D-52 is the
  worked example) — that is the other branch, not an exception to this one.

### B2 — Delivered artefacts are immutable, and are never made unreadable

A delivered `ContentPackage` is evidence. Never rewrite one (it would falsify its content
hashes), and never ship a change that turns an existing one `unreadable` — `status.ts`
requires `unreadable.length === 0` for criterion 4, so an unreadable delivered package
turns a Phase 0 criterion red **forever**.

**Fail closed, but never without a way forward** (CLAUDE.md Lesson, 2026-07-30). Before
making any file fatal: grep every *writer* into that directory, and read the refusal's own
printed remedy. If the remedy says "delete this evidence", the control is the outage.

### B3 — `decisions.md` is append-only settled law

Superseding D-13, D-33, D-47 or any other row means **appending** a new numbered decision
that says so, with reasoning and a revisit trigger. Never edit a settled row in place;
never reverse one by prose in a plan file. A revisit trigger is part of the row — changing
one is itself a decision.

### B4 — Every id that builds a path is validated at the artefact boundary

Not a field-level guard at the call site — that is the version of this rule that already
failed six times. Validate the **whole artefact** at its boundary (`readContractJson` /
the contracts validators) so every `$ref: Ulid` is enforced at once, keep the guard in
`@cutdown/contracts` so every consumer including `renderer-ffmpeg` can import it, and let
`packages/skill-runtime/tests/artefact-path-discipline.test.ts` catch new sites.

Containment is `artefact-paths.ts`: `assertJobRelativePath`, `assertContainedLexical`,
`assertContainedPhysicalPath`, `resolveArtefactPath`. A new write path uses them; it does
not re-implement them.

### B5 — Workspace containment, and the one sanctioned exception

`cutdown/` is self-rooted (`tech-spec.md` §2, §14): it never calls into, imports from, or
writes to `src/`, `tests/`, `config/`, or `docs/initial.past/`, and nothing there depends on
it. Every write stays inside `cutdown/` **except** the `skills sync` mirror into
`<repo>/.claude/skills/cutdown-*`, which D-55 records as spec-sanctioned — a generated
projection *into* the host, never a source dependency *on* it. Nothing under `cutdown/`
reads the mirror. Mirror root and registry path are injectable so no test writes into the
real ones.

Corollary with teeth: `orphanMirrors` treats any `cutdown-*` directory with no source
skill as an orphan and fails `skills sync --check`. Hand-written pack files therefore never
take the `cutdown-` prefix — this skill and its sibling use `cd-`.

### B6 — One writer per artefact; no second source of truth

Each artefact kind has exactly one producer, and a second producer is a decision, not an
implementation detail. When one lands, both stamp the version from a **shared constant**
whose drift test pins it to the schema file — the D-52 mechanism, added after `revise`
turned out to be the second `PlatformEDL` producer and stamped a stale version.

From Stage 2 this is the Review Studio rule in its strongest form: **the studio's only
writes are artefacts the skills already define**, through the skills. A studio-local store,
a mutable projection, or a "just for the UI" field is a second source of truth.

### B7 — Isolation is by construction, not by filter

Job artefacts live under `project-data/jobs/<jobId>/`; cross-job addressing has no model
today and inventing one implicitly is a finding. From Stage 7, workspace isolation is the
same rule one level up: a query that *could* return another workspace's data and is
prevented by a `where` clause is not isolated. And per the sibling path's R6, a **summary
statistic of another workspace's outcome data is that data**.

### B8 — Generated trees are committed and current (D-24)

Types are generated, never hand-written. A schema change regenerates and commits both
trees in the **same** change, `build:contracts --check` PASS. A schema bump also updates
every dependent `contractsUsed`, `skills/registry.json`, and the mirror, in that same
change — `skills sync --check` is the proof.

## Anti-patterns

| Anti-pattern | Why it is a finding |
|---|---|
| Editing `content-package-v1.json` to add a field | B1 — mutates a published contract |
| Repointing the *reader*'s schema id to v2 | B2 — the delivered packages become unreadable |
| Drift keyed by full `$id` | B1 — a major bump classifies as `added` |
| A guard on the one id a review named | B4 — fix the class; the siblings are the recurrence |
| A contract with no writer, no location and no reader | B6 — that is a schema, not a mechanism |
| A caller-supplied field standing in for an authority | B6 — `skills/package/schema/input.json` says it: a caller-supplied evidence field is a caller-supplied claim |
| A new `.claude/skills/cutdown-<hand-written>/` | B5 — fails `skills sync --check` as an orphan |
| Reversing a decision in a plan file | B3 — supersede by appending |

## Checklist before shipping a change on this path

- [ ] Semantic change ⇒ new file; v1 byte-identical to its committed version (assert it).
- [ ] Every reader dispatches on major *before* any writer moves; legacy stays countable.
- [ ] Drift classification keys by schema family, with a test for both branches.
- [ ] No delivered artefact rewritten; no new path to `unreadable`; no remedy that deletes evidence.
- [ ] Path-building ids validated by whole-artefact validation; `artefact-path-discipline` clean.
- [ ] Every write inside `cutdown/` except the sanctioned mirror; no hand-written `cutdown-*` mirror dir.
- [ ] New producer of an existing artefact ⇒ shared version constant + drift test.
- [ ] Decisions superseded by appending, with reasoning and a revisit trigger.
- [ ] Generated trees regenerated and committed; `build:contracts --check` and `skills sync --check` PASS.
