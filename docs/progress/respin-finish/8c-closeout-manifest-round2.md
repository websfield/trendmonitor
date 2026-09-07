# Slice 8c close-out — round 2 review manifest (2026-09-04)

Fix pass for round 1's billing **BLOCK**, compliance **NEEDS CHANGES** and code-review **NEEDS CHANGES**. HEAD `cc3ed43`, nothing committed; `packages/modes` and `packages/trends` are UNTRACKED so `git diff` does not show them.

Entry gate on this tree: typecheck 0 (7 packages), worker:typecheck 0, lint 0, db:check clean, **149 files / 3856 tests / 0 failed / 0 skipped** (Docker live), next build 0.

| file | sha256 |
|---|---|
| respin/packages/modes/src/similarity.ts | 6aa31b5e5a3ebb5d |
| respin/packages/modes/src/assemble.ts | 304a2c118499d60d |
| respin/packages/modes/src/pipeline.ts | 8c7f878f13148b36 |
| respin/packages/modes/tests/similarity.test.ts | 14671f8c93d9c053 |
| respin/packages/modes/tests/spin-reference.test.ts | d529196b80329591 |
| respin/packages/trends/src/autopsy.ts | 5009d453530ee08c |
| respin/packages/config/src/schema.ts | 44f9f07ef05fb3c9 |
| respin/packages/config/src/migrate-config.ts | 233be50650e46ed4 |
| respin/packages/config/src/index.ts | d7303e4134c9cdce |
| respin/packages/config/tests/migrate-config.test.ts | 4a3060df5e35c17a |
| respin/packages/db/src/seed.ts | 53ea41f7d391d858 |
| respin/packages/db/src/with-workspace.ts | 46521a67d59e1cd4 |
| respin/packages/db/src/autopsy-policy.ts | fcaecc820227bdc1 |
| respin/packages/db/tests/profile-scope.test.ts | bc3479a1e7b6e8c0 |
| respin/packages/credits/src/generate.ts | ab336de7b32012ac |
| respin/packages/credits/src/errors.ts | a3bbde1292ddd9f6 |
| respin/packages/credits/src/index.ts | 67c699b95ea7d489 |
| respin/packages/credits/src/app-server.ts | e56b130e1b3da445 |
| respin/packages/credits/tests/generate.test.ts | e321efbca979d0a8 |
| respin/packages/credits/tests/isolation.test.ts | 5cc8b1ad0213f741 |
| respin/packages/credits/tests/inference.test.ts | 43d06f8a93ffd246 |
| respin/packages/credits/tests/generation-pricing.test.ts | 3a39dfe8ecc5b17c |
| respin/packages/credits/tests/generation-frameworks.test.ts | 43ab4c559ab18088 |
| respin/app/(product)/billing-errors.ts | e2f0657542edd0d7 |
| respin/app/(product)/studio/copy.ts | be39492b78e75784 |
| respin/tests/spin-reference-bounds.test.ts | bab8f8eb57317820 |
| respin/tests/llm-deadline-coherence.test.ts | 39e0a9c5239457e1 |
| docs/initial/decisions.md | da64afcad10cc624 |
| docs/initial/tech-spec.md | fef0794da63093b7 |
| docs/progress/respin-finish-open-items.md | ccaa3cc15f6a0efa |
