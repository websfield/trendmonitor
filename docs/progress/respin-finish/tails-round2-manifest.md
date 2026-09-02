# Tails fix pass — ROUND 2 manifest (2026-09-02)

Base commit `f1abfa3`; these files are the **uncommitted fix pass** answering round 1's BLOCK and Highs. Verify hashes before AND after.

**Scope: this fix diff only.** Do not re-review slice 7, the race fix, or any round-1 finding already closed — cards `respin-finish-slice-7-card.md` and `respin-included-build-race-card.md`.

**Round 1 gave: tenancy BLOCK, billing High, learning High, compliance all-Medium.** Compliance is NOT re-running (its findings were Medium and are fixed and shipped). You are here because your path raised a BLOCK or a High.

| SHA-256 | Path |
|---|---|
| `9f1afc85c8f9f4d8` | docs/initial/decisions.md |
| `843b5a64f274f192` | docs/progress/respin-finish/ledger.md |
| `f25af821009469c1` | respin/app/(admin)/admin/model-spend/page.tsx |
| `b14797c1d6d6d423` | respin/app/(product)/billing-errors.ts |
| `4b1af903d8a2b6a7` | respin/app/(product)/onboarding/first-ideas/copy.ts |
| `3a633b8912b6e2a7` | respin/app/(product)/onboarding/page.tsx |
| `b11d5d9bd2c0e080` | respin/app/(product)/onboarding/run-copy.ts |
| `58b308bdfa19d970` | respin/app/(product)/onboarding/run-inference-panel.tsx |
| `05e00fdcfea89a95` | respin/app/(product)/studio/frameworks/page.tsx |
| `1689a8d1d1110555` | respin/packages/config/src/app-server.ts |
| `8114ca2344d54559` | respin/packages/config/src/index.ts |
| `14497a6abe4cea76` | respin/packages/config/tests/config.test.ts |
| `f74cc9a8ceac44f6` | respin/packages/credits/src/app-server.ts |
| `43e95aa7b0a549cf` | respin/packages/credits/src/errors.ts |
| `7852cf9af0d9e775` | respin/packages/credits/src/generate.ts |
| `be646d6cd53e394b` | respin/packages/credits/src/included-build.ts |
| `1676f3dbaebd374f` | respin/packages/credits/src/index.ts |
| `d36cae84ad68af35` | respin/packages/credits/src/inference.ts |
| `ab665167c532d594` | respin/packages/credits/tests/generate.test.ts |
| `c6429b8751931491` | respin/packages/credits/tests/included-build-purposes.test.ts |
| `52726006b187d10f` | respin/packages/credits/tests/isolation.test.ts |
| `7dcc7e2b8a32095b` | respin/packages/db/src/app-server.ts |
| `776743f171b6c834` | respin/packages/db/src/frameworks.ts |
| `d6659c13ca2ba8b5` | respin/packages/db/src/index.ts |
| `129c0c30025efb98` | respin/packages/db/src/spend-rollup.ts |
| `b1de5532d05b4d33` | respin/packages/db/tests/spend-rollup.docker.test.ts |
| `91127d35bbff400d` | respin/packages/db/tests/spend-rollup.test.ts |
| `959968eff1ab0063` | respin/packages/modes/src/assemble.ts |
| `a37063dcc5639a25` | respin/packages/modes/src/mode-checks.ts |
| `7e7c0d1c6a01a336` | respin/packages/modes/tests/mode-checks.test.ts |
| `09ad56c8047e2657` | respin/packages/modes/tests/pipeline.test.ts |
| `ff5364ba4d697408` | respin/tests/billing-ui.test.tsx |
| `8c42c4a6f56d52e3` | respin/tests/first-ideas-ui.test.tsx |
| `eeac62009f7254dc` | respin/tests/framework-content-honesty.test.ts |
| `102c5c921e5d2fe1` | respin/tests/model-spend-page.test.tsx |
| `c933bede01da0e2d` | respin/tests/onboarding-ui.test.tsx |
| `a53d3c5da5f88e86` | respin/tests/pause-authority.test.tsx |
| `01f28f3de0c26606` | respin/tests/studio-ui.test.tsx |
| `c6677c3c753664f4` | respin/tests/support/no-streaming.ts |
| `e64183c51d1ce362` | respin/tests/symbol-citations.test.ts |
| `d94ad8a5ffbb1eeb` | docs/progress/respin-finish/entry-gate-tails-close.txt |
| `f88fe99ea0079e3e` | docs/progress/respin-finish/unreviewed-tails-manifest.md |
