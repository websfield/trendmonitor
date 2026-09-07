# The two UNREVIEWED TAILS — narrow review manifest (2026-09-02)

Base commit: `f1abfa3` (everything is now committed).

## What this is, and what it is NOT

Slice 7 and the included-build race fix each had **two full reviewer rounds** (8 and 3 agents). In each case the two-round cap was spent, and the **final fix pass then shipped UNREVIEWED**. This manifest is those two tails, and nothing else.

**Do NOT re-review** slice 7's build, the race fix's core, or any finding already closed in rounds 1-2 of either. Their cards are `respin-finish-slice-7-card.md` and `respin-included-build-race-card.md`. You are looking at the work that closed round-2 findings — the changes no reviewer has yet seen.

**The specific risk this round exists for:** in slice 6's round 2, **eleven of fourteen** new findings were defects the previous round's own fixes introduced. These tails are exactly that population, unreviewed. Ask what each fix BROKE, not only whether it worked.

Verify these hashes before AND after your review.

| SHA-256 | Path |
|---|---|
| `11e5025a0ee84ea3` | respin/packages/modes/src/mode-checks.ts |
| `0c33eb02034fadc9` | respin/packages/modes/src/assemble.ts |
| `0989aa8f579b74f0` | respin/packages/modes/tests/mode-checks.test.ts |
| `8e0d7bb0f6ae22d9` | respin/packages/modes/tests/pipeline.test.ts |
| `4d2b97bb919bdcd5` | respin/packages/modes/tests/support/mode-fixtures.ts |
| `6c8f8e41f99d34b7` | respin/packages/db/src/frameworks.ts |
| `f272dd1e053f4af0` | respin/packages/db/src/with-workspace.ts |
| `a91b73cf821b0ca4` | respin/packages/db/src/creator-data-registry.ts |
| `1465316e76b92b78` | respin/packages/db/src/onboarding-schema.ts |
| `9219815cdacb61ad` | respin/packages/db/src/spend-rollup.ts |
| `f487328e38320a19` | respin/packages/db/src/brain-schema.ts |
| `b0e67c796d42afd9` | respin/packages/db/migrations/0023_frameworks_ownership_immutable.sql |
| `14aaf29f79a5b8b6` | respin/packages/db/migrations/0024_special_diamondback.sql |
| `d35ad65b3c9c9984` | respin/packages/db/tests/frameworks.test.ts |
| `102080a0deb989e9` | respin/packages/db/tests/migration-shape.test.ts |
| `8b469ac1feb8eb31` | respin/packages/db/tests/included-build-backfill.docker.test.ts |
| `e09133f2e7c73a1f` | respin/packages/credits/src/included-build.ts |
| `406d95ff21a0d73d` | respin/packages/credits/src/inference.ts |
| `fe0ab30e17bed198` | respin/packages/credits/src/app-server.ts |
| `399693c8327b9a34` | respin/packages/credits/src/index.ts |
| `aa0edb151882a7f9` | respin/packages/credits/src/errors.ts |
| `fdcdcbe39e3e3bee` | respin/packages/credits/tests/included-build-purposes.test.ts |
| `394ba790220b7a4c` | respin/packages/credits/tests/inference-race.docker.test.ts |
| `89c1e71b2deec004` | respin/packages/credits/tests/isolation.test.ts |
| `fc3bb9f9590f68fb` | respin/packages/config/tests/config.test.ts |
| `1c81fde4f539621c` | respin/packages/llm/src/errors.ts |
| `6baf8fe044bd8d89` | respin/packages/llm/tests/no-text.test.ts |
| `d4dace9adf7afde8` | respin/packages/llm/tests/boundary.test.ts |
| `6539ed037e0c53da` | respin/app/(admin)/admin/model-spend/page.tsx |
| `bcafe8ecea5e2914` | respin/app/(product)/onboarding/run-copy.ts |
| `6081b65fffdcbb32` | respin/app/(product)/studio/frameworks/page.tsx |
| `6d98f815131c161b` | respin/app/(product)/studio/frameworks/copy.ts |
| `b9ddb16023b3aedf` | respin/app/(product)/onboarding/first-ideas/copy.ts |
| `63ace850d1901fd1` | respin/app/(product)/onboarding/first-ideas/first-ideas-result.tsx |
| `c52b07b8e2864e21` | respin/tests/pause-authority.test.tsx |
| `decae37c83a53178` | respin/tests/model-spend-page.test.tsx |
| `80c0db823de14505` | respin/tests/framework-content-honesty.test.ts |
| `522bf24405fae18f` | respin/tests/feedback-readers.test.ts |
| `3e3b2a1abae6e9b5` | respin/tests/source-citations.test.ts |
| `159838911957ac2a` | respin/tests/symbol-citations.test.ts |
| `bfe72cac4b5425bc` | respin/tests/support/no-streaming.ts |
| `860d7eb184e41bee` | respin/tests/first-ideas-ui.test.tsx |
