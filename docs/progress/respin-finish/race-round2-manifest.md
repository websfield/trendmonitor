# Included-build race fix — ROUND 2 manifest (2026-09-02)

**Scope: the round-1 FIX DIFF only** — the files below changed after round 1's verdicts. Slice 7's ~100 uncommitted files and the race fix's already-reviewed core are out of scope except where they appear here.

Base ref `b2c7539`; nothing committed. **Read the MAIN TREE.** Verify these hashes before AND after.

| SHA-256 | Path |
|---|---|
| `6af14440f0d26ee6` | docs/initial/decisions.md |
| `0f2ef518160b6bdb` | docs/plans/respin-finish-phase-6.md |
| `999cdb18298436d4` | respin/app/(admin)/admin/model-spend/page.tsx |
| `bcafe8ecea5e2914` | respin/app/(product)/onboarding/run-copy.ts |
| `1b7ccef7fd48c683` | respin/packages/credits/src/app-server.ts |
| `93ca6ff4a254b60e` | respin/packages/credits/src/inference.ts |
| `81ee0b89efefa554` | respin/packages/credits/tests/included-build-purposes.test.ts |
| `9ab8165a67e62fdb` | respin/packages/credits/tests/inference.test.ts |
| `1538a4845ee5bf63` | respin/packages/credits/tests/isolation.test.ts |
| `4d2f7b8885a5c90e` | respin/packages/db/src/app-server.ts |
| `f487328e38320a19` | respin/packages/db/src/brain-schema.ts |
| `6c8f8e41f99d34b7` | respin/packages/db/src/frameworks.ts |
| `1465316e76b92b78` | respin/packages/db/src/onboarding-schema.ts |
| `d011c33f580c5a5e` | respin/packages/db/src/spend-rollup.ts |
| `e29dd72af131443f` | respin/packages/db/tests/migration-shape.test.ts |
| `2ddecafee1329613` | respin/packages/db/tests/spend-rollup.test.ts |
| `a2e4d1d71a79a846` | respin/tests/source-citations.test.ts |
| `7dbc936b64577f34` | respin/tests/symbol-citations.test.ts |
| `5ced8d6ce0a1734f` | respin/tests/usage-burn-by-mode.test.ts |
