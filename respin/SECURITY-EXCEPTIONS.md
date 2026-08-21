# Dependency-audit exceptions — Respin

Every GHSA id in `respin/package.json` → `pnpm.auditConfig.ignoreGhsas` **must**
have an entry here. An id without one is an unreviewed exception: delete the id
rather than the entry.

The CI gate (`.github/workflows/respin.yml`, "Dependency audit") fails on any
**high or critical** advisory that is *not* listed here — so this file is the
only way a high-severity finding stops blocking the build, and adding to it is a
reviewed diff rather than a CI-config edit nobody reads.

**Scope reminder:** the scan covers the `respin/` workspace only. `src/` (UGC
Intelligence — Python + .NET) and `cutdown/` are **not scanned by anything**.

---

## Baseline recorded 2026-08-17 (audit remediation R3, finding #18)

These four were **already present** when dependency scanning was first switched
on. They were not introduced by the remediation — the remediation is what made
them visible, which is the whole point of finding #18. They are recorded as a
baseline so the gate can start catching *new* advisories immediately, instead of
the scan being deferred until an upgrade programme finishes.

**This baseline is a deferral, not a dismissal.** None of these is "accepted
risk" — each is an upgrade someone has to do.

| GHSA | Package | Severity | Path | Fix available | Why deferred |
|---|---|---|---|---|---|
| `GHSA-gpj5-g38j-94v9` (CVE-2026-39356) | `drizzle-orm` | high | **direct dependency** of `packages/{db,config,credits}` (`^0.44.0`, installed 0.44.7) | `>=0.45.2` | A **minor bump of the ORM the money path runs on.** It deserves its own change with its own full gate run — including the real-Postgres concurrency suites that prove the ledger's money invariants — not a blind bump appended to an unrelated remediation. **This is the one that matters most and the one to do first.** |
| `GHSA-f88m-g3jw-g9cj` | `sharp` | high | transitive: `next > sharp` | `>=0.35.0` | Not a direct dependency; resolved by `next`. Fixing it means either a `next` bump or a pnpm `overrides` entry forcing a version `next` was not tested against. |
| `GHSA-6g55-p6wh-862q` (CVE-2026-45623) | `postcss` | high | transitive: `next > postcss` | `>=8.5.12` | As above — `postcss` is pulled in by `next`'s build pipeline. |
| `GHSA-r28c-9q8g-f849` (CVE-2026-73646) | `postcss` | high | transitive: `next > postcss` | `>=8.5.18` | As above. |

Three **moderate** advisories (`esbuild` via `drizzle-kit`, and two more
`postcss`) are also outstanding. They are **not** listed above and **not**
ignored — they do not gate the build at the `high` threshold, and the
non-blocking "full report" step prints them on every run so they stay visible.

**Owner:** respin-engineer.
**Review trigger:** whichever comes first — before the first production deploy,
or M2 entry. The `drizzle-orm` row should not survive to a second review.

**How to retire an entry:** upgrade, re-run `pnpm -C respin audit --audit-level
high --prod`, confirm the advisory is gone, then delete BOTH the row here and
the id from `package.json`. Deleting only the id makes the build red; deleting
only the row makes the exception invisible.
