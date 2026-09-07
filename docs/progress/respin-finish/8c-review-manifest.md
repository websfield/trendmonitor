# Slice 8c — review manifest (2026-09-03)

Base ref: `cc3ed43` (HEAD). **Nothing in slice 8 or slice 8c is committed** — every path below is uncommitted working-tree state. Reviewers read the **MAIN TREE**, never a worktree: a worktree reviews HEAD, which is slice 7's commit and contains none of this work.

Reviewers: **verify these hashes before AND after your review.** If any in-scope file changes while you are reading, that result is discarded and the round is re-run.

**Scope.** 64 files are slice 8c's diff — 27 that did not exist in the slice-8 final manifest and 37 changed since it. The remaining 102 files are **slice-8 state, unchanged since `8-review-manifest-final.md`**; they are listed so a reviewer can tell "unchanged" from "not looked at", and so a file moving under a review is detectable. They were reviewed to zero BLOCKs at slice 8 round 2 and are **context, not this round's scope**.

Excluded: `.agents/`, `.codex/`, `.claude/`, `.codex-tmp/`, `.pnpm-store/`, `node_modules/`, `respin/.next/`, `respin/.tmp/`, `docs/progress/**`, and the owner's three unrelated working files (`debug.log`, `new_codex/`, `paypal.cs`).

## Entry gate on this exact tree

`docs/progress/respin-finish/entry-gate-slice-8c.txt` — typecheck 0 (7 packages), `worker:typecheck` 0, lint 0, `db:check` clean, migrations 0026 + 0027 applied on real Postgres, **147 files / 3505 tests / 0 failed / 0 skipped, exit 0** (CI shape, Docker live), `next build` exit 0. Baseline at slice-8 close was 143 files / 3290 tests.

## SHA-256 (first 16 hex chars) — SLICE 8c SCOPE (64 files)

| SHA-256 | Status | Path |
|---|---|---|
| `34d6f2382bdc420a` | changed in 8c | docs/initial/decisions.md |
| `a5575df1c4875f9f` | changed in 8c | docs/plans/respin-finish-master-plan.md |
| `4e9a04006015baee` | new in 8c | docs/plans/respin-finish-phase-6.md |
| `b61094524039c5aa` | new in 8c | docs/plans/respin-finish-phase-7.md |
| `047cf2a425bd688f` | changed in 8c | docs/plans/respin-finish-phase-8.md |
| `b3bc471d2c065a25` | new in 8c | docs/plans/respin-finish-phase-8c.md |
| `184000c33076c426` | changed in 8c | docs/runbooks/respin-worker-operations.md |
| `ca7c43bc92ff2ee1` | changed in 8c | respin/app/(product)/billing-errors.ts |
| `629f5aef7a34a76c` | changed in 8c | respin/app/(product)/trends/actions.ts |
| `a125ff82fe869144` | changed in 8c | respin/app/(product)/trends/page.tsx |
| `093e3bf1a93e9a96` | new in 8c | respin/app/(product)/trends/paste-panel.tsx |
| `8fadd3273dee2dc1` | new in 8c | respin/app/(product)/trends/paste-state.ts |
| `22c47968cfc11b5d` | new in 8c | respin/app/(product)/trends/pasted-references.tsx |
| `c25d7fb4a6b72bed` | changed in 8c | respin/app/(product)/trends/trends-view.tsx |
| `c9328f7b07f32dbe` | changed in 8c | respin/eslint.config.mjs |
| `47d5fffcd7afe1d1` | new in 8c | respin/packages/credits/package.json |
| `a6f16d724375bfc6` | changed in 8c | respin/packages/credits/src/app-server.ts |
| `43716aaaa74da13e` | new in 8c | respin/packages/credits/src/errors.ts |
| `c966cb8729f9775c` | changed in 8c | respin/packages/credits/src/generate.ts |
| `21d18ce3729f4230` | changed in 8c | respin/packages/credits/src/included-build.ts |
| `3232fe38bdc67aee` | changed in 8c | respin/packages/credits/src/index.ts |
| `f39265b0ef59258e` | new in 8c | respin/packages/credits/src/ledger.ts |
| `bc3bf7666063053f` | new in 8c | respin/packages/credits/src/pasted-reference.ts |
| `8ee286de9fcedae0` | new in 8c | respin/packages/credits/tests/facade-errors.test.ts |
| `f1e81e0732f1dcf0` | changed in 8c | respin/packages/credits/tests/generate.test.ts |
| `0330a93c5e6649a5` | changed in 8c | respin/packages/credits/tests/included-build-purposes.test.ts |
| `c7499b19df36871d` | changed in 8c | respin/packages/credits/tests/isolation.test.ts |
| `17cf13c4f9d2b6da` | new in 8c | respin/packages/credits/tests/pasted-reference.docker.test.ts |
| `149b1e8f2c1c8e1f` | new in 8c | respin/packages/credits/tests/pasted-reference.test.ts |
| `faf6d45d8a459513` | new in 8c | respin/packages/db/migrations/0026_lazy_vector.sql |
| `742dd7ff62729abc` | new in 8c | respin/packages/db/migrations/0027_curious_paper_doll.sql |
| `d5951d4fb10574fa` | new in 8c | respin/packages/db/migrations/meta/0026_snapshot.json |
| `0cdc2377a3295bbf` | new in 8c | respin/packages/db/migrations/meta/0027_snapshot.json |
| `fb061e6b83752d52` | changed in 8c | respin/packages/db/migrations/meta/_journal.json |
| `7c69330ed622a938` | changed in 8c | respin/packages/db/src/app-server.ts |
| `3b6bf9392a57b9ca` | new in 8c | respin/packages/db/src/billing-schema.ts |
| `ad407fd3f9894e6f` | changed in 8c | respin/packages/db/src/creator-data-registry.ts |
| `45d15ee6d86a6e2d` | changed in 8c | respin/packages/db/src/index.ts |
| `1c2eec4dd95a7aaa` | changed in 8c | respin/packages/db/src/trends-schema.ts |
| `cb5b7cb66e9ec845` | changed in 8c | respin/packages/db/src/trends-storage.ts |
| `3e325843373a8b03` | changed in 8c | respin/packages/db/src/with-workspace.ts |
| `5db4474df8b5bb02` | changed in 8c | respin/packages/db/tests/brain-schema.test.ts |
| `6b1871dc5e3f6e21` | changed in 8c | respin/packages/db/tests/export.test.ts |
| `e00f02a79a277910` | new in 8c | respin/packages/db/tests/migration-shape.test.ts |
| `9e6a915190089356` | new in 8c | respin/packages/db/tests/pasted-reference.test.ts |
| `900fce1f4057856b` | changed in 8c | respin/packages/db/tests/system-spend.test.ts |
| `65c87c033fa19519` | changed in 8c | respin/packages/db/tests/trends-storage.test.ts |
| `7018ca61c8f13a9e` | new in 8c | respin/packages/modes/src/assemble.ts |
| `a104f40e52d3db0e` | new in 8c | respin/packages/modes/src/bundle.ts |
| `bd0caa36a85daf10` | changed in 8c | respin/packages/modes/src/index.ts |
| `77507c0d43f1722b` | changed in 8c | respin/packages/modes/src/pipeline.ts |
| `cf67fc11e7dfbc9b` | new in 8c | respin/packages/modes/src/traceability.ts |
| `28b61f277d184289` | new in 8c | respin/packages/modes/tests/bundle.test.ts |
| `747806a924a1d807` | changed in 8c | respin/packages/modes/tests/pipeline.test.ts |
| `9fb644c56ae5edf5` | new in 8c | respin/packages/modes/tests/spin-reference.test.ts |
| `23bd5c9dd7b41051` | new in 8c | respin/packages/modes/tests/support/mode-fixtures.ts |
| `4a3c2dbe82de4f36` | changed in 8c | respin/packages/trends/src/sources.ts |
| `7e2233570fd90011` | changed in 8c | respin/packages/trends/tests/trends.test.ts |
| `f87c0e5e1d56f76d` | changed in 8c | respin/pnpm-lock.yaml |
| `0f24ac88c26962cf` | new in 8c | respin/tests/billing-ui.test.tsx |
| `640358442e81e0e8` | changed in 8c | respin/tests/profile-cage.test.ts |
| `46e27c840c151d64` | changed in 8c | respin/tests/trends-actions.test.ts |
| `b0fe447d58092d63` | changed in 8c | respin/tests/trends-page.test.tsx |
| `80d9c94064471a15` | changed in 8c | respin/tests/trends-ui.test.tsx |

## SHA-256 — SLICE-8 CONTEXT, unchanged since `8-review-manifest-final.md` (102 files)

| SHA-256 | Path |
|---|---|
| `ff46fed3feb68168` | docs/initial/tech-spec.md |
| `a1294feef453f5fa` | docs/runbooks/respin-vendor-acceptance-walks.md |
| `c27384f768fe09f8` | respin/README.md |
| `edf993472d1ee60d` | respin/app/(product)/nav.tsx |
| `b4b2d0ec6f2e3f9d` | respin/app/(product)/onboarding/first-ideas/copy.ts |
| `d84c42fb9ac31a3d` | respin/app/(product)/onboarding/first-ideas/page.tsx |
| `a2b6aeee3174294a` | respin/app/(product)/studio/copy.ts |
| `a8d86fb1e1509d44` | respin/app/(product)/studio/frameworks/copy.ts |
| `1c60255da685b703` | respin/app/(product)/studio/frameworks/form-copy.ts |
| `d1f7db4123111ce6` | respin/app/(product)/studio/frameworks/frameworks-view.tsx |
| `adb9b4605c419203` | respin/app/(product)/studio/frameworks/view-state.ts |
| `2fdb1b0293fbc0ba` | respin/app/(product)/studio/run-copy.ts |
| `3f5a096bec12183b` | respin/app/(product)/trends/spin-panel.tsx |
| `efb088eaa96cf63c` | respin/app/(product)/trends/spin-state.ts |
| `c8a48759702b0422` | respin/app/(product)/trends/track-niche-panel.tsx |
| `eb1d6a671d5efb83` | respin/app/(product)/trends/track-state.ts |
| `e7ed288df3c2a5ee` | respin/env.example |
| `7e8503c8f486d79d` | respin/lib/routes.ts |
| `13ebb0e214c1757e` | respin/middleware.ts |
| `351dcb1bebb52b89` | respin/ops/systemd/respin-worker.service |
| `c9d36397da68983e` | respin/package.json |
| `791d3126affd0b95` | respin/packages/config/src/schema.ts |
| `00f2f8943a4063a2` | respin/packages/config/tests/config.test.ts |
| `d9b5adffd123674e` | respin/packages/config/tests/migrate-config.test.ts |
| `0cc7e6e7733518f2` | respin/packages/credits/src/mode-access.ts |
| `eee57c4cdaf7a4ff` | respin/packages/credits/tests/generation-frameworks.test.ts |
| `59303f9cd97ef7b1` | respin/packages/credits/tests/mode-access.test.ts |
| `f70cfeb0f08d4f86` | respin/packages/credits/tests/revision.test.ts |
| `5a5065fdd2c50c5c` | respin/packages/db/drizzle.config.ts |
| `c8653e97d75bf7b3` | respin/packages/db/migrations/0025_closed_star_brand.sql |
| `8efc05ac1c620d0b` | respin/packages/db/migrations/meta/0025_snapshot.json |
| `43e362bdd261e5eb` | respin/packages/db/src/autopsy-policy.ts |
| `32a4c28d34aca1f2` | respin/packages/db/src/client.ts |
| `4699a04226506aa7` | respin/packages/db/src/export.ts |
| `63f796dfeea07821` | respin/packages/db/src/frameworks.ts |
| `841eb5319340a87e` | respin/packages/db/src/schema.ts |
| `97f66ea0d4ca869a` | respin/packages/db/src/seed.ts |
| `71dad8105b388007` | respin/packages/db/src/system-spend-schema.ts |
| `f31e2a847355d02b` | respin/packages/db/src/system-spend.ts |
| `cec7d8b93fa2ae1b` | respin/packages/db/tests/autopsy-policy.test.ts |
| `e1df92f4605de6ca` | respin/packages/db/tests/frameworks-concurrency.docker.test.ts |
| `653e066e12c21914` | respin/packages/db/tests/frameworks.test.ts |
| `8592deadca1c092b` | respin/packages/db/tests/profile-scope.test.ts |
| `8bd760848fa0d3c3` | respin/packages/modes/src/hard-rules.ts |
| `2d99867f009fe25a` | respin/packages/modes/src/kill-test.ts |
| `dcf7a2c43aadd6dc` | respin/packages/modes/src/modes.ts |
| `ab8d540c914c1542` | respin/packages/modes/src/similarity.ts |
| `61472b32a617952a` | respin/packages/modes/tests/hard-rules.test.ts |
| `26ba1c272de25257` | respin/packages/modes/tests/mode-checks.test.ts |
| `995a04b327764e7a` | respin/packages/modes/tests/output.test.ts |
| `173f8708196f7a3a` | respin/packages/modes/tests/similarity.test.ts |
| `268b119d186d05d6` | respin/packages/trends/README.md |
| `871cd50daa3f03e0` | respin/packages/trends/package.json |
| `af5d7837b03a73e2` | respin/packages/trends/src/access.ts |
| `321372b15b5c3002` | respin/packages/trends/src/autopsy.ts |
| `7d74f324d4ba465c` | respin/packages/trends/src/index.ts |
| `06a09c2ba1c19fe7` | respin/packages/trends/src/outlier.ts |
| `e5a24ef02f440c95` | respin/packages/trends/src/saturation.ts |
| `b4636ffbe8c76695` | respin/packages/trends/src/trend-source.ts |
| `ee5bf3a2fcd97fc7` | respin/packages/trends/tsconfig.json |
| `be049746947e4827` | respin/tests/feedback-readers.test.ts |
| `727fda814a7e9382` | respin/tests/first-ideas-ui.test.tsx |
| `369211d8e76f9238` | respin/tests/framework-ui.test.tsx |
| `0a63a259ce554f82` | respin/tests/gate-completeness.test.ts |
| `54a98973efc7ffd4` | respin/tests/import-boundary.test.ts |
| `de373420af1c9218` | respin/tests/no-scraping.test.ts |
| `6e05810be3688343` | respin/tests/pg-boss.docker.test.ts |
| `528a35974bee86aa` | respin/tests/routes.test.ts |
| `5694c5d7eceb9180` | respin/tests/studio-ui.test.tsx |
| `d13a9ff446d4a6c5` | respin/tests/support/no-streaming.ts |
| `be1c7e04c3e1a645` | respin/tests/symbol-citations.test.ts |
| `ecfe8b4b0bda5334` | respin/tests/table-writers.test.ts |
| `0eb0d52e3c04b698` | respin/vitest.config.ts |
| `a14f520a985bcdca` | respin/worker/autopsy-vendor.ts |
| `715d20906b94af44` | respin/worker/calendar-date.ts |
| `c50283b1fd691e13` | respin/worker/env.ts |
| `7f043ead4dd9f7b4` | respin/worker/handlers.ts |
| `5dd8fe538791f4fd` | respin/worker/health.ts |
| `3d8098687035f3ee` | respin/worker/index.ts |
| `309cbff078da1624` | respin/worker/main.ts |
| `4f5a7ce8836d401c` | respin/worker/pg-boss-runtime.ts |
| `30ce0da07844e235` | respin/worker/pool.ts |
| `d3c71c8fb3a57e7b` | respin/worker/production.ts |
| `5016209fbfba1816` | respin/worker/refresh.ts |
| `34e3e3e6d77aef19` | respin/worker/retry.ts |
| `5cecca7d1146cdc5` | respin/worker/run-once.ts |
| `3a9bb2c1ac0e21c9` | respin/worker/system-autopsy.ts |
| `db4dd939efa23be2` | respin/worker/system-usage.ts |
| `cdbaac38315160cb` | respin/worker/tests/autopsy-vendor.test.ts |
| `f382ee6562d3b9e6` | respin/worker/tests/autopsy.test.ts |
| `1afc47b732bbde68` | respin/worker/tests/env.test.ts |
| `92de670a6909375f` | respin/worker/tests/handlers.test.ts |
| `750b503ca6c701d9` | respin/worker/tests/health.test.ts |
| `f1a654874a235dfd` | respin/worker/tests/pg-boss-runtime.test.ts |
| `bedb5c50b1a9a87d` | respin/worker/tests/pool.test.ts |
| `5d56541f587b839e` | respin/worker/tests/production.test.ts |
| `b3fe5cfeb4c472ec` | respin/worker/tests/retry.test.ts |
| `5348804000803e40` | respin/worker/tests/run-once.test.ts |
| `c02edbe16e374f2a` | respin/worker/tests/schedules.test.ts |
| `3fb3a2737698d067` | respin/worker/tsconfig.json |
| `98a27901e9287887` | respin/worker/vitest.config.ts |
| `ccd954e1d6ff49d4` | respin/worker/weekly-digest.ts |
