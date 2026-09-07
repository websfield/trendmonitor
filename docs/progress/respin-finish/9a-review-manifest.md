# Slice 9a — review manifest

**CORRECTED 2026-09-04T10:49Z. The first version of this file was CORRUPTED**
— a timed-out `find` was still writing to this path when the real content was written, so two
outputs interleaved, one sentence was truncated mid-word, and **migration 0031 was missing entirely**.
It was caught by the spin-compliance reviewer, which reviewed 0031 anyway and said plainly that a
reviewer trusting the manifest would not have. If you read the earlier version, **re-read this list**.

All paths are relative to `respin/`.

## Why `git diff` is not the scope

1. **Everything is uncommitted at `cc3ed43`**, so a diff against HEAD also contains slices 8 and 8c.
2. **`packages/brain` is untracked** — it is a new package — so a diff cannot see the most important
   part of this slice at all.

An mtime-based list was tried and silently under-reported (the 9a card was amended during the slice,
so files written earlier fell outside it). This list is the union of the three builders' own reported
file lists plus the orchestrator's, and **every path below was verified to exist**.

## Read first

`docs/plans/respin-finish-phase-9a.md` — **THE PINNED CONTRACT** section, then **Contract amendments**.
The contract was wrong **seven** times; each amendment records what was wrong and why. Amendment 5 is
the one migration 0031 exists for.

## Files (56; 57 including the lockfile below)

```
app/(product)/billing-errors.ts
app/(product)/nav.tsx
app/(product)/results/actions.ts
app/(product)/results/comparison-view.tsx
app/(product)/results/copy.ts
app/(product)/results/log-outcome.tsx
app/(product)/results/log-panel.tsx
app/(product)/results/log-state.ts
app/(product)/results/page.tsx
app/(product)/results/projection.ts
app/(product)/results/results-view.tsx
app/ui/meter.tsx
lib/routes.ts
middleware.ts
eslint.config.mjs
packages/brain/package.json
packages/brain/tsconfig.json
packages/brain/src/comparison.ts
packages/brain/src/index.ts
packages/brain/src/vocabulary.ts
packages/brain/tests/comparison.test.ts
packages/brain/tests/vocabulary-mirror.test.ts
packages/db/package.json
packages/db/migrations/0029_minor_shaman.sql
packages/db/migrations/0030_youthful_paper_doll.sql
packages/db/migrations/0031_good_stark_industries.sql
packages/db/migrations/0032_bouncy_hellcat.sql
packages/db/src/app-server.ts
packages/db/src/brain-schema.ts
packages/db/src/creator-data-registry.ts
packages/db/src/errors.ts
packages/db/src/export.ts
packages/db/src/index.ts
packages/db/src/results-comparison-ops.ts
packages/db/src/results-ops.ts
packages/db/src/results-schema.ts
packages/db/src/schema.ts
packages/db/src/storage-limits.ts
packages/db/src/with-workspace.ts
packages/db/tests/brain-schema.test.ts
packages/db/tests/export.test.ts
packages/db/tests/profile-scope.test.ts
packages/db/tests/results-schema-write.test.ts
packages/db/tests/results-schema.test.ts
tests/gate-completeness.test.ts
tests/import-boundary.test.ts
tests/no-scraping.test.ts
tests/profile-cage.test.ts
tests/results-comparison-contract.test.ts
tests/results-comparison.test.tsx
tests/results-entry.test.tsx
tests/results-honesty.test.tsx
tests/results-log-action.test.tsx
tests/results-page-wiring.test.tsx
tests/routes.test.ts
tests/table-writers.test.ts
```

Also changed: `pnpm-lock.yaml` (the `@respin/brain` workspace edge).

## Migrations — FOUR (0032 added in the round-1 fix pass)

- **0029** — the `results` table, its enums, six CHECK constraints, same-tenant composite FKs, and an
  added `UNIQUE (id, profile_id, workspace_id)` on `brain_docs` so the metric-version pointer carries
  a real composite FK rather than a bare one.
- **0030** — an index only; no column, table, constraint or data change. Its header records a
  measurement that was **corrected**: the index was first justified by a probe that built it inside
  the loading transaction, which does not reproduce.
- **0031** — `results_lever_figures_are_numbers`, additive, covering all four lever columns.
  **This is contract amendment 5.** A stated invariant was false: C2 lists its invariants under
  *"Invariants the database enforces, not the application"*, and `denominator > 0` does **not** reject
  NaN, because `'NaN'::numeric > 0` is TRUE in Postgres. A NaN denominator passed. Note the trap if
  you check it: Postgres `numeric` NaN **equals itself**, unlike float, so `x = x` detects nothing.

- **0032_bouncy_hellcat.sql** — adds `platform` to `results_generation_metric_window_uq`. **This closes a spin-compliance
  CHANGE with a real creator consequence**: without `platform` in the key, a creator logging one draft to
  TikTok and to Reels over the same window was refused as a duplicate, and the printed remedy told them to
  *"change the observation window and log it again"* — which on an append-only table with no delete path
  writes a permanently false window into their own baseline. The new key is a superset, so it cannot fail
  on existing rows.

## Round 2 note

Round 1 returned **1 BLOCK, 12 CHANGE, 17 NOTE**. Every finding has been addressed; the entry gate on the
fixed tree is **159 files / 4,206 tests / 0 failed, exit 0**, lint clean, `db:check` clean, `next build`
compiled. Files changed by the fix pass are in the list above (the set did not grow except for 0032).
