---
name: respin-brain-tenancy
description: Use whenever a Respin change touches workspace or creator-profile isolation, query scoping (`withWorkspace`), brain documents (`brain_docs` versioning, provenance, confidence), onboarding inference, shared-library contributions from creator sessions, brain export or account deletion, seats/roles, or the admin surface. The hard rules — no voice, strategy, performance, or generation data ever crosses profiles or workspaces; library contributions are mechanism-level only; brain docs are append-only versions with per-field provenance; nothing about a creator is inferred silently. Mandatory before writing any query, brain mutation, onboarding inference, or library-contribution path, and before editing PRD §4A/§4D or tech-spec §6.
---

# Respin Brain Tenancy & Isolation

This is the rule canon for the **Respin brain tenancy** Critical Path. Its gate is
`.claude/agents/respin-tenancy-reviewer.md`. Sources: `docs/initial/PRD.md` §4A
(REQ-A01–A04), §4B (REQ-B01–B03), §4D (REQ-D04/D05), `docs/initial/tech-spec.md` §2, §6,
`docs/initial/decisions.md` R-8, R-9, `docs/initial/build-plan.md` M2. Scope is Respin
(`app/`, `packages/`).

Authored from the doc set before M0 — where a rule names a file that does not exist yet,
the rule governs the file when it lands.

## Why this path exists

The per-creator brain is the product's moat and its most sensitive surface: it holds a
creator's voice, ambitions "they will say out loud", and performance numbers. The Studio
tier puts multiple creator brains inside one workspace, and the shared framework library
is deliberately fed *from* creator sessions — so the leak paths are designed-in features,
one stripping step away from a breach. R-9 additionally binds the founding creator's
assets: her voice, log, and personal specifics never enter the product.

## The rules

### T1 — Isolation is structural, not disciplinary (REQ-A03, tech-spec §6)

Every query is workspace-scoped through the single `withWorkspace(ctx)` helper; **no raw
table access from route handlers**. Profile isolation is additionally enforced by a test
suite that *attempts* cross-profile reads. A new query path that bypasses the helper is
a finding even if it happens to filter correctly — the class, not the instance (repo
lesson 2026-07-30: guard where the path is built).

### T2 — Library contributions are mechanism-level only (REQ-D04, R-9)

Anything flowing from a creator's session into the shared framework library carries
beats, mechanics, and evidence summaries **only** — never personal details, voice rules,
numbers, or performance data. This applies to autopsy-proposed frameworks (REQ-D03) and
to the founding seed set (F1–F9 generalised; written confirmation before M2 seeding, PRD
open decision 3). The stripping is a tested transformation, not a review-time promise.

### T3 — Brain docs are append-only versions with provenance (REQ-B02, REQ-C05, R-8)

Editing a brain field creates a new `brain_docs` version; old versions stay readable.
Every inferred field shows its source evidence and a confidence level, and the creator
confirms or edits before the brain activates. **Nothing updates silently**: feedback
becomes a *proposal* requiring approval. The system never silently infers sensitive
personal traits. Brains are context, not weights (R-8) — no per-creator fine-tuning path.

### T4 — Export is complete, deletion is real (REQ-A04)

A creator can export the full brain (all four documents + generation history) as
JSON/markdown at any time, and delete the account with full data removal within 30 days.
A new table holding creator-derived data must join both flows in the same change — an
export that silently omits a table is a finding.

### T5 — Roles and the admin boundary (REQ-A02, REQ-J01, tech-spec §6)

Studio seats: owner (billing + all), editor (generate + log results), viewer. Admin
routes gated by an allowlist role; admin credit adjustments carry reason codes. A viewer
who can generate, or a seat that can touch billing, fails M6's acceptance test.

### T6 — Secrets and PII posture (tech-spec §6)

No LLM keys client-side, ever. Stripe webhook signatures verified. Brain docs and
generations are the named PII surface — treat any new logging or analytics of their
content as a change on this path.

## Checklist before shipping a change on this path

- [ ] Every new query goes through `withWorkspace`; the cross-profile read suite covers it.
- [ ] Any session→library flow strips to mechanism level, with a test on the stripping.
- [ ] Brain edits create versions; inferred fields carry evidence + confidence; no silent updates.
- [ ] New creator-data tables are in export AND deletion in the same change.
- [ ] Role checks match REQ-A02; admin stays behind the allowlist.
