# Stage 7 — Harden for external users (OUTLINE)

**Governing PRD phase:** Phase 1.5. **Depends on:** Stage 2, Stage 6.
**Detail level:** Outline + gates. **Re-planning trigger:** run `/create-plan` when Stages 2 and 6 are proven complete **and** the three decision records below exist.

---

## ⚠️ This stage cannot be task-planned yet

`/create-plan` **Stop Condition 4** — *a new core dependency would be introduced with no decision record* — would fire immediately. This stage introduces **three**: PostgreSQL, object storage, and Temporal. Each needs a decision record in `decisions.md` (and, where it changes an invariant, a tech-spec update) **before** any task-level planning. Writing tasks first would be the docs-first convention inverted.

## Objective

Make the system safe for people who are not the team that built it.

## Requirement bindings

REQ-150…157 · REQ-152 remainder (hosted exposure, `publishing` state, Temporal execution) · PRD §15 Phase 1.5 row.

## Scope

Temporal (replacing the local durable runner); PostgreSQL (replacing `node:sqlite`); object storage (replacing the local `work/` tree); auth/RBAC with the PRD's four approval roles (producer, brand approver, rights approver, publisher); tenant isolation; encryption at rest and in transit; deletion and retention; observability; metering; support tooling.

## Exit gate (PASS/FAIL) — PRD §15 Phase 1.5 row

| # | Criterion |
|---|---|
| H1 | **100 consecutive jobs** complete or recover without manual state repair |
| H2 | p50/p95 latency and cost stable |
| H3 | Privacy and security review completed |
| H4 | **No cross-workspace data leakage**, enumerated across all seven REQ-150 dimensions — assets, style profiles, rules, analytics, permissions, retention, cost attribution — each with a **negative test** that fails if isolation is removed. Round-1 gate finding: as one unenumerated line, H4 passes by nobody having looked |
| H7 | Retention and deletion (REQ-155/156) are designed **before** the `work/` → object-storage migration, and D-8 ("delete nothing automatically") is explicitly superseded or upheld. **The load-bearing conflict must be resolved here and is currently nobody's task:** REQ-113 requires previously approved versions stay reproducible *forever*, while retention/deletion requires erasure — for a store holding licensed creator footage and third-party personal data, that tension *is* the design |
| H5 | Cost attribution coverage ≥ 99% of compute, model, storage, render and egress assigned to a job and tenant (PRD §14.3) |
| H6 | Unit cost visibility: known p50/p95 by source minute, final minute, variant and platform (PRD §14.3) |

## Risks that must not be discovered late

1. **Tenant isolation retrofitted through every write path.** Stage 2 ships single-user local by design; if that boundary is not named there, this stage becomes an audit of every write in the codebase. Name it in Stage 2.
2. **`work/` holds licensed creator footage and third-party personal data.** Moving it to object storage is a rights and privacy migration, not a file move. Retention and deletion must be designed before the migration, not after.
3. **Three core dependencies at once.** The largest infrastructure change in the program, planned last and therefore with the least remaining schedule. Consider decision records early even though the build is late.
4. **The local runner's proven kill-resume behaviour is an asset.** Temporal must be demonstrated to match it, not assumed to exceed it — the Phase 6 proving run killed a job mid-OCR and mid-encode and recovered fail-closed. That test must survive the migration.
