# Included-build race fix — review manifest (2026-09-02)

**This is a PRE-EXISTING defect fix, NOT part of slice 7.** Review only the 17 files below.

The working tree also carries ~100 uncommitted slice-7 files at Almost. **Those are out of scope** — they have had their own two rounds (8 reviewer agents) and their card is `respin-finish-slice-7-card.md`. If a slice-7 file appears in your reading, note it and move on; do not re-gate slice 7 here.

Base ref `b2c7539`. **Read the MAIN TREE** — nothing is committed. Verify these hashes before AND after your review.

| SHA-256 | Path |
|---|---|
| `5e4182cc00f79e62` | docs/initial/decisions.md |
| `ba39a80f55ee5261` | respin/packages/credits/src/inference.ts |
| `42b9a779d7d1cedc` | respin/packages/credits/tests/generation-pricing.test.ts |
| `394ba790220b7a4c` | respin/packages/credits/tests/inference-race.docker.test.ts |
| `14aaf29f79a5b8b6` | respin/packages/db/migrations/0024_special_diamondback.sql |
| `65b73102155d35e6` | respin/packages/db/migrations/meta/0024_snapshot.json |
| `2d720aca1132ff1e` | respin/packages/db/migrations/meta/_journal.json |
| `a91b73cf821b0ca4` | respin/packages/db/src/creator-data-registry.ts |
| `44884838bac92ca4` | respin/packages/db/src/index.ts |
| `c115192bce47c053` | respin/packages/db/src/onboarding-schema.ts |
| `88a399050c24e685` | respin/packages/db/src/spend-rollup.ts |
| `f272dd1e053f4af0` | respin/packages/db/src/with-workspace.ts |
| `bb4ef01e7ee8e11d` | respin/packages/db/tests/brain-schema.test.ts |
| `8b469ac1feb8eb31` | respin/packages/db/tests/included-build-backfill.docker.test.ts |
| `8867c828a3fc9537` | respin/packages/db/tests/migration-shape.test.ts |
| `93bc9c82ea1ddc43` | respin/packages/db/tests/profile-scope.test.ts |
| `5bf66dcfc908ae5f` | respin/tests/table-writers.test.ts |
