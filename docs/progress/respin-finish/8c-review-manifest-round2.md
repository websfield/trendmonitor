# Slice 8c — review manifest, ROUND 2 (2026-09-04, after the round-1 fix pass)

Base ref: `cc3ed43` (HEAD). **Nothing is committed** — every path below is uncommitted working-tree state. Reviewers read the **MAIN TREE**, never a worktree: a worktree reviews HEAD, which is slice 7's commit and contains none of this work.

Reviewers: **verify these hashes before AND after your review.** If any in-scope file changes while you are reading, that result is discarded and the round is re-run.

Supersedes [`8c-review-manifest.md`](8c-review-manifest.md) (round 1).

## What changed since round 1

**39 files are the round-1 FIX PASS** — 7 new, 32 changed since the round-1 manifest. That is your primary scope: four builder agents worked on disjoint file sets (`packages/modes`, `packages/db`, `packages/credits`, `app` + `tests`), and the orchestrator closed two gaps they left. The other 134 files are unchanged since round 1 and were reviewed then.

**Read this with slice 6's round 2 in mind: eleven of its fourteen new findings were defects the previous round's own fixes introduced.** This population is exactly that shape.

## Entry gate on this exact tree

`docs/progress/respin-finish/entry-gate-slice-8c-fixpass.txt` — typecheck 0 (7 packages), `worker:typecheck` 0, lint 0, `db:check` clean, migrations 0026 + 0027 + **0028** applied on real Postgres, **147 files / 3780 tests / 0 failed / 0 skipped, exit 0** (CI shape, Docker live), `next build` exit 0. Round 1 was 147 / 3505, so the fix pass added **275 tests and zero failures**.

## SHA-256 (first 16 hex chars) — THE ROUND-1 FIX PASS (39 files)

| SHA-256 | Status | Path |
|---|---|---|
| `a6840be47088d484` | changed | docs/initial/decisions.md |
| `1573da5c9ac3133a` | new | respin/.gitignore |
| `c36808ef3334e42d` | changed | respin/app/(product)/trends/actions.ts |
| `ea1ecab962d0520b` | changed | respin/app/(product)/trends/page.tsx |
| `c300e8e5803f196f` | changed | respin/app/(product)/trends/paste-panel.tsx |
| `8ef665831e2a7de7` | changed | respin/app/(product)/trends/paste-state.ts |
| `5dc629813af53c98` | changed | respin/app/(product)/trends/pasted-references.tsx |
| `fdc57ce44729b5e2` | changed | respin/eslint.config.mjs |
| `4c1e73f74827b72e` | changed | respin/packages/credits/src/ledger.ts |
| `f8f2b922f014df3e` | changed | respin/packages/credits/src/pasted-reference.ts |
| `30a238fee5c13e3a` | changed | respin/packages/credits/tests/isolation.test.ts |
| `b6b987da2793382a` | new | respin/packages/credits/tests/ledger.test.ts |
| `95efaac7545c1521` | changed | respin/packages/credits/tests/pasted-reference.docker.test.ts |
| `f7b09ca8f1c0b7ed` | changed | respin/packages/credits/tests/pasted-reference.test.ts |
| `7fb1701e3169ec2a` | new | respin/packages/db/migrations/0028_light_mulholland_black.sql |
| `5ca066499e1c32d8` | new | respin/packages/db/migrations/meta/0028_snapshot.json |
| `799113f90240b944` | changed | respin/packages/db/migrations/meta/_journal.json |
| `d19022ab1eca4779` | changed | respin/packages/db/src/frameworks.ts |
| `67b378ecbe25b2e5` | changed | respin/packages/db/src/index.ts |
| `aac96c31308d0ef6` | changed | respin/packages/db/src/system-spend.ts |
| `64057c7ea879d399` | changed | respin/packages/db/src/trends-schema.ts |
| `9bbed78f10b80922` | changed | respin/packages/db/src/trends-storage.ts |
| `8dc72679bd239d04` | changed | respin/packages/db/tests/brain-schema.test.ts |
| `ab8ad84870e91a8a` | changed | respin/packages/db/tests/export.test.ts |
| `e94b9d9d8a50312e` | changed | respin/packages/db/tests/migration-shape.test.ts |
| `40045b856971dffe` | changed | respin/packages/db/tests/pasted-reference.test.ts |
| `d31065a47499a1f2` | changed | respin/packages/db/tests/system-spend.test.ts |
| `0469559795c4658f` | changed | respin/packages/modes/src/traceability.ts |
| `25e9dc04a5cf7b5e` | changed | respin/packages/modes/tests/bundle.test.ts |
| `dddbc5c25a90e38f` | changed | respin/packages/modes/tests/spin-reference.test.ts |
| `0763da994f2e72f2` | new | respin/packages/modes/tests/traceability.test.ts |
| `8c91b64e08039042` | changed | respin/tests/billing-ui.test.tsx |
| `1c4d5b82cf01187a` | new | respin/tests/probe-artifacts.test.ts |
| `dcbeebe3273437e0` | changed | respin/tests/profile-cage.test.ts |
| `f9a4458d4ffe3971` | new | respin/tests/support/probe-artifacts.ts |
| `9847ec182cf125d5` | changed | respin/tests/symbol-citations.test.ts |
| `842c8fda0864bda2` | changed | respin/tests/trends-actions.test.ts |
| `fe495160885c59c0` | changed | respin/tests/trends-page.test.tsx |
| `bf48ba221b3fe5f1` | changed | respin/tests/trends-ui.test.tsx |

## SHA-256 — unchanged since the round-1 manifest (134 files)

| SHA-256 | Path |
|---|---|
| `ff46fed3feb68168` | docs/initial/tech-spec.md |
| `a5575df1c4875f9f` | docs/plans/respin-finish-master-plan.md |
| `4e9a04006015baee` | docs/plans/respin-finish-phase-6.md |
| `b61094524039c5aa` | docs/plans/respin-finish-phase-7.md |
| `047cf2a425bd688f` | docs/plans/respin-finish-phase-8.md |
| `b3bc471d2c065a25` | docs/plans/respin-finish-phase-8c.md |
| `a1294feef453f5fa` | docs/runbooks/respin-vendor-acceptance-walks.md |
| `184000c33076c426` | docs/runbooks/respin-worker-operations.md |
| `c27384f768fe09f8` | respin/README.md |
| `ca7c43bc92ff2ee1` | respin/app/(product)/billing-errors.ts |
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
| `c25d7fb4a6b72bed` | respin/app/(product)/trends/trends-view.tsx |
| `e7ed288df3c2a5ee` | respin/env.example |
| `7e8503c8f486d79d` | respin/lib/routes.ts |
| `13ebb0e214c1757e` | respin/middleware.ts |
| `351dcb1bebb52b89` | respin/ops/systemd/respin-worker.service |
| `c9d36397da68983e` | respin/package.json |
| `791d3126affd0b95` | respin/packages/config/src/schema.ts |
| `00f2f8943a4063a2` | respin/packages/config/tests/config.test.ts |
| `d9b5adffd123674e` | respin/packages/config/tests/migrate-config.test.ts |
| `47d5fffcd7afe1d1` | respin/packages/credits/package.json |
| `a6f16d724375bfc6` | respin/packages/credits/src/app-server.ts |
| `43716aaaa74da13e` | respin/packages/credits/src/errors.ts |
| `c966cb8729f9775c` | respin/packages/credits/src/generate.ts |
| `21d18ce3729f4230` | respin/packages/credits/src/included-build.ts |
| `3232fe38bdc67aee` | respin/packages/credits/src/index.ts |
| `0cc7e6e7733518f2` | respin/packages/credits/src/mode-access.ts |
| `8ee286de9fcedae0` | respin/packages/credits/tests/facade-errors.test.ts |
| `f1e81e0732f1dcf0` | respin/packages/credits/tests/generate.test.ts |
| `eee57c4cdaf7a4ff` | respin/packages/credits/tests/generation-frameworks.test.ts |
| `0330a93c5e6649a5` | respin/packages/credits/tests/included-build-purposes.test.ts |
| `59303f9cd97ef7b1` | respin/packages/credits/tests/mode-access.test.ts |
| `f70cfeb0f08d4f86` | respin/packages/credits/tests/revision.test.ts |
| `5a5065fdd2c50c5c` | respin/packages/db/drizzle.config.ts |
| `c8653e97d75bf7b3` | respin/packages/db/migrations/0025_closed_star_brand.sql |
| `faf6d45d8a459513` | respin/packages/db/migrations/0026_lazy_vector.sql |
| `742dd7ff62729abc` | respin/packages/db/migrations/0027_curious_paper_doll.sql |
| `8efc05ac1c620d0b` | respin/packages/db/migrations/meta/0025_snapshot.json |
| `d5951d4fb10574fa` | respin/packages/db/migrations/meta/0026_snapshot.json |
| `0cdc2377a3295bbf` | respin/packages/db/migrations/meta/0027_snapshot.json |
| `7c69330ed622a938` | respin/packages/db/src/app-server.ts |
| `43e362bdd261e5eb` | respin/packages/db/src/autopsy-policy.ts |
| `3b6bf9392a57b9ca` | respin/packages/db/src/billing-schema.ts |
| `32a4c28d34aca1f2` | respin/packages/db/src/client.ts |
| `ad407fd3f9894e6f` | respin/packages/db/src/creator-data-registry.ts |
| `4699a04226506aa7` | respin/packages/db/src/export.ts |
| `841eb5319340a87e` | respin/packages/db/src/schema.ts |
| `97f66ea0d4ca869a` | respin/packages/db/src/seed.ts |
| `71dad8105b388007` | respin/packages/db/src/system-spend-schema.ts |
| `3e325843373a8b03` | respin/packages/db/src/with-workspace.ts |
| `cec7d8b93fa2ae1b` | respin/packages/db/tests/autopsy-policy.test.ts |
| `e1df92f4605de6ca` | respin/packages/db/tests/frameworks-concurrency.docker.test.ts |
| `653e066e12c21914` | respin/packages/db/tests/frameworks.test.ts |
| `8592deadca1c092b` | respin/packages/db/tests/profile-scope.test.ts |
| `65c87c033fa19519` | respin/packages/db/tests/trends-storage.test.ts |
| `7018ca61c8f13a9e` | respin/packages/modes/src/assemble.ts |
| `a104f40e52d3db0e` | respin/packages/modes/src/bundle.ts |
| `8bd760848fa0d3c3` | respin/packages/modes/src/hard-rules.ts |
| `bd0caa36a85daf10` | respin/packages/modes/src/index.ts |
| `2d99867f009fe25a` | respin/packages/modes/src/kill-test.ts |
| `dcf7a2c43aadd6dc` | respin/packages/modes/src/modes.ts |
| `77507c0d43f1722b` | respin/packages/modes/src/pipeline.ts |
| `ab8d540c914c1542` | respin/packages/modes/src/similarity.ts |
| `61472b32a617952a` | respin/packages/modes/tests/hard-rules.test.ts |
| `26ba1c272de25257` | respin/packages/modes/tests/mode-checks.test.ts |
| `995a04b327764e7a` | respin/packages/modes/tests/output.test.ts |
| `747806a924a1d807` | respin/packages/modes/tests/pipeline.test.ts |
| `173f8708196f7a3a` | respin/packages/modes/tests/similarity.test.ts |
| `23bd5c9dd7b41051` | respin/packages/modes/tests/support/mode-fixtures.ts |
| `268b119d186d05d6` | respin/packages/trends/README.md |
| `871cd50daa3f03e0` | respin/packages/trends/package.json |
| `af5d7837b03a73e2` | respin/packages/trends/src/access.ts |
| `321372b15b5c3002` | respin/packages/trends/src/autopsy.ts |
| `7d74f324d4ba465c` | respin/packages/trends/src/index.ts |
| `06a09c2ba1c19fe7` | respin/packages/trends/src/outlier.ts |
| `e5a24ef02f440c95` | respin/packages/trends/src/saturation.ts |
| `4a3c2dbe82de4f36` | respin/packages/trends/src/sources.ts |
| `b4636ffbe8c76695` | respin/packages/trends/src/trend-source.ts |
| `7e2233570fd90011` | respin/packages/trends/tests/trends.test.ts |
| `ee5bf3a2fcd97fc7` | respin/packages/trends/tsconfig.json |
| `f87c0e5e1d56f76d` | respin/pnpm-lock.yaml |
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
