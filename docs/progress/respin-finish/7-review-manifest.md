# Slice 7 — review manifest (2026-09-01)

Base ref: `b2c7539` (HEAD). **Nothing in slice 7 is committed** — every path below is uncommitted working-tree state, which is why reviewers must read the MAIN TREE and not an isolated worktree: a worktree reviews HEAD, which is slice 6. Slice 3's ledger records that exact trap, and the card's "reviewers in isolated worktrees" line is therefore overridden here, deliberately and on the record.

Reviewers: verify these hashes before AND after your review. If any in-scope file changes while you are reading, that result is discarded and the review restarts (and the restart counts as a round).

87 in-scope files.

## SHA-256 (first 16 hex chars)

| SHA-256 | Path |
|---|---|
| `f0cce1a3e1794f4c` | CLAUDE.md |
| `da5bcc6facf6168b` | docs/initial/decisions.md |
| `a50b21fbe10412ae` | respin/app/(product)/billing-errors.ts |
| `55dd483b3b4f6273` | respin/app/(product)/onboarding/interview/interview-view.tsx |
| `7538d469a06e8713` | respin/app/(product)/onboarding/onboarding-view.tsx |
| `4e6ed52c6370831c` | respin/app/(product)/studio/actions.ts |
| `929d703b5a3ddc09` | respin/app/(product)/studio/copy.ts |
| `01af8948c0d0a2e9` | respin/app/(product)/studio/generation-outcome.tsx |
| `26f7be03d99f346d` | respin/app/(product)/studio/page.tsx |
| `c3cdcdbfe1358508` | respin/app/(product)/studio/projection.ts |
| `6cf3965a050e44c6` | respin/app/(product)/studio/run-copy.ts |
| `a2408bf5c608247b` | respin/app/(product)/studio/run-state.ts |
| `39cdd17d69d049bd` | respin/app/(product)/studio/studio-panel.tsx |
| `bdfa819b1d32d916` | respin/app/(product)/studio/studio-view.tsx |
| `901f1a8504e8fbdc` | respin/eslint.config.mjs |
| `b750045e642ee49a` | respin/packages/credits/src/app-server.ts |
| `ac87ad758c4dd2c0` | respin/packages/credits/src/errors.ts |
| `f84a59429339cdc9` | respin/packages/credits/src/generate.ts |
| `9f09822bed3163ee` | respin/packages/credits/src/index.ts |
| `e9a81b51365dc7aa` | respin/packages/credits/src/mode-access.ts |
| `6396cb88892d6c32` | respin/packages/credits/tests/generate.test.ts |
| `e9bd58993fe97e51` | respin/packages/credits/tests/generation-pricing.test.ts |
| `1b91f3cf231c29a0` | respin/packages/credits/tests/isolation.test.ts |
| `df8f319c975442ff` | respin/packages/credits/tests/mode-access.test.ts |
| `7bb950acc864e80a` | respin/packages/db/migrations/meta/_journal.json |
| `f35407bcd1cfc2cc` | respin/packages/db/src/app-server.ts |
| `0bd0c4c6e8fcb14c` | respin/packages/db/src/brain-schema.ts |
| `9b489ee702b14eaa` | respin/packages/db/src/creator-data-registry.ts |
| `d4edcca07da84aa7` | respin/packages/db/src/errors.ts |
| `3f9989949ce19aa8` | respin/packages/db/src/generation-schema.ts |
| `5f455b0e3c8d2c1e` | respin/packages/db/src/index.ts |
| `6b5951e0fb5c0f70` | respin/packages/db/src/schema.ts |
| `0567adb7b09c099f` | respin/packages/db/src/seed.ts |
| `9a86ce73fde0c52d` | respin/packages/db/src/storage-limits.ts |
| `c38e05803f073b5e` | respin/packages/db/src/with-workspace.ts |
| `e153b40cfbee385f` | respin/packages/db/tests/brain-concurrency.docker.test.ts |
| `cee8c427b48277e6` | respin/packages/db/tests/brain-schema.test.ts |
| `366c86f7dccb0a06` | respin/packages/db/tests/export.test.ts |
| `1db1970d2a19a23d` | respin/packages/db/tests/migration-shape.test.ts |
| `7ce7e0d19b6224a6` | respin/packages/db/tests/profile-scope.test.ts |
| `762b1db1c53750c2` | respin/packages/modes/src/assemble.ts |
| `45d17c9d5db6d0f0` | respin/packages/modes/src/bundle.ts |
| `5828d9810378e9c6` | respin/packages/modes/src/hard-rules.ts |
| `fbbaa8173a55226f` | respin/packages/modes/src/index.ts |
| `4dc8e66be941d472` | respin/packages/modes/src/kill-test.ts |
| `41b0796f7f8227a9` | respin/packages/modes/src/modes.ts |
| `5501ab9679f679dd` | respin/packages/modes/src/pipeline.ts |
| `330785c87a0c4177` | respin/packages/modes/tests/bundle.test.ts |
| `7ae03a53adf903f6` | respin/packages/modes/tests/hard-rules.test.ts |
| `a20983d05056983c` | respin/packages/modes/tests/kill-test.test.ts |
| `b378660b36503384` | respin/packages/modes/tests/output.test.ts |
| `901a0ef7bc012fad` | respin/packages/modes/tests/pipeline.test.ts |
| `8cba6d9a4918a303` | respin/packages/modes/tests/purity.test.ts |
| `4f4429f582d520fd` | respin/tests/gate-completeness.test.ts |
| `86efa6d14bd449b1` | respin/tests/onboarding-interview-ui.test.tsx |
| `4f37bb973e11f22a` | respin/tests/profile-cage.test.ts |
| `1952e2c0269d5654` | respin/tests/studio-ui.test.tsx |
| `73ba012f14969503` | respin/tests/table-writers.test.ts |
| `d35a3d34ab45756b` | respin/app/(product)/onboarding/first-ideas/actions.ts |
| `b9ddb16023b3aedf` | respin/app/(product)/onboarding/first-ideas/copy.ts |
| `01b8acf0e3ae43a3` | respin/app/(product)/onboarding/first-ideas/first-ideas-panel.tsx |
| `8b7cd685004fca33` | respin/app/(product)/onboarding/first-ideas/first-ideas-view.tsx |
| `20633e8866795be6` | respin/app/(product)/onboarding/first-ideas/page.tsx |
| `89106a45fe15bd29` | respin/app/(product)/studio/feedback-block.tsx |
| `485a82b72a3c56ac` | respin/app/(product)/studio/frameworks/actions.ts |
| `a2b752fa059eb0e2` | respin/app/(product)/studio/frameworks/copy.ts |
| `b7367722d3f73f30` | respin/app/(product)/studio/frameworks/form-copy.ts |
| `67835831d4af8375` | respin/app/(product)/studio/frameworks/form-state.ts |
| `ac1ea82d08b7e9ba` | respin/app/(product)/studio/frameworks/framework-panel.tsx |
| `b2396ecab55177d7` | respin/app/(product)/studio/frameworks/frameworks-view.tsx |
| `5ba8e13304330463` | respin/app/(product)/studio/frameworks/page.tsx |
| `41e889775b772c3c` | respin/app/(product)/studio/frameworks/view-state.ts |
| `ac5322537bd3a580` | respin/app/(product)/studio/lineage-view.tsx |
| `197ad12276562b85` | respin/packages/credits/tests/generation-frameworks.test.ts |
| `f22888ff78c40d06` | respin/packages/credits/tests/revision.test.ts |
| `c309545f0dd5d373` | respin/packages/db/migrations/0022_foamy_doctor_octopus.sql |
| `5fe1adcfd10d30f0` | respin/packages/db/migrations/meta/0022_snapshot.json |
| `91c5e60701bc2d8b` | respin/packages/db/src/feedback-ops.ts |
| `9e481c2f737a75c0` | respin/packages/db/src/frameworks.ts |
| `841447e67951845e` | respin/packages/db/tests/frameworks.test.ts |
| `b73fc250df13534d` | respin/packages/db/tests/lineage-feedback.test.ts |
| `4b17d61afc466b75` | respin/packages/modes/src/mode-checks.ts |
| `b1d755cb09a25ddf` | respin/packages/modes/tests/mode-checks.test.ts |
| `b1ca7689a1c7ab20` | respin/packages/modes/tests/support/mode-fixtures.ts |
| `de01392ed1a7ea56` | respin/tests/feedback-readers.test.ts |
| `f8b4314b45d00f98` | respin/tests/first-ideas-ui.test.tsx |
| `c59ba45b24af3e17` | respin/tests/framework-ui.test.tsx |
