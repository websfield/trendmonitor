# L1 gate — respin-tenancy-reviewer, round 1 (2026-10-03)

Frozen tree: working tree over `3533dbf`, `L1-freeze.sha256` digest `0b6f478fe312` (reviewer: `sha256sum -c` 40/40 OK).

**Verdict: NEEDS CHANGES · Almost · Grade B** (Ready/A once the Medium is fixed and noted; no re-review). 0 BLOCK, 0 High, 1 CHANGE Medium, 3 LOW, 2 NOTE. No cross-profile, cross-workspace or library leak.

## Findings

- **CHANGE Medium** `respin/packages/modes/src/assemble.ts:291-300` (docblock `:273-289`), fed by `respin/packages/credits/src/generate.ts:2562-2569`. On a revision `basisCorpusFor` removes only `revisedDraft` from `context.input`; `revisionInput` also contributes two product scaffold sentences, which stay quotable. Probe against the frozen code: "the creator asked to change" and "a draft you produced earlier" → `inMaterial true`; the parent-draft quote → `false`. A v2 story revision can invent an event with a scaffold excerpt as its "material" basis and settle usable, shown as "From your own words". Fix: pass the creator's own note as a server-derived basis input on `CreativeContext` and build the corpus from it; revision test quoting a scaffold sentence expects `unsupported_experience`.
- **LOW** `generate.ts:845`, `assemble.ts:201` claim approved framework names "never reach the prompt"; the `custom-carries-approved-name` finding excerpt reaches the rewrite prompt via `findingLine` (`assemble.ts:1168`). No tenancy impact (own eligible set). Fix: reword, or drop the name from the finding text.
- **LOW** `respin/packages/credits/tests/isolation.test.ts:253` — the `getTierCheckoutProtocolState` exclusion reason is true by reading (`tier-checkout-rollout.ts:109-133`; `billing-schema.ts:495-512` has no workspace/profile column) but untested. Fix: a schema assertion, or record on the card.
- **LOW** `respin/packages/credits/tests/generate.test.ts:2413-2437` — the custom-provenance test does not assert that no `frameworks` row or curation proposal was created (no writer exists today). Fix: assert counts unchanged.
- **NOTE** `generate.ts:2455-2461,853` — `carriedBasis` keeps a parent's verified excerpt after the brain version it was quoted from is replaced; same profile, not a leak; worth a line in R-149's revisit list.
- **NOTE** `respin/packages/credits/tests/revision.test.ts:414-476` — no v2-specific cross-tenant revision test; covered because a forged id fails at `resolveRevisionParent` (`generate.ts:2399-2401`) before `parentV2Of` runs.

## Checks

Single scoping helper holds (no new query; parent read via `readGenerationForAttempt` with two-axis `both()`); library/mechanism stripping holds (`frameworkVersionsUsed` resolves only `offered` under v2); append-only brains hold; sensitive inference n/a; export and deletion hold (whole-row JSON export; row/cascade deletion; JSON census still accurate); roles hold (creative parse after the viewer gate, before claim); PII/logs hold (`wireLabel`, constraints never logged, errors name the field not the value). Isolation exclusions: `CreativeRequestError`, `presentedDisclosure`, `presentedTextUnits` reasons true and tested; `getTierCheckoutProtocolState` true, untested (Low). Author's least-confident line: nothing tenancy-relevant; failure direction is "no output", never "wrong profile's data".
