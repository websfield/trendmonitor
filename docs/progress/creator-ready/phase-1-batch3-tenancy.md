# Phase 1 implementation — batch 3 tenancy

Independent context `/root/p1_b3_tenancy`; requested gpt-6-astra/max, fork_turns none; resolved runtime unknown. Eighth implementation evaluation overall. Read-only; no files edited.

**Tenancy readiness: Almost · Grade B · NEEDS CHANGES.** One Medium assurance gap remains; zero High/BLOCK findings.

Scope: batch3 TEN02 repair, retained T1/T3 coverage, and the eight tenancy checks.

## Findings

- **P1-TEN-02 — PARTIAL, Medium, high confidence.** The original getter bypass and accessor/prototype siblings now reject. However, `respin/packages/llm/tests/assemble-kinds.test.ts:599` skips function declarations when collecting mapper bindings. A block-local function can therefore shadow the parameter-derived mapper while the forwarding check at line735 still accepts it.

  Exact in-memory reproducer in `assemble.ts`: append `void mapBack;` after the existing parameter destructure, then replace the forwarding statement with:

  ```ts
  function mapBack() {
    return { startUtf16: 0, endUtf16: 0 };
  }
  const at = locateQuote(content, v.quote, mapBack);
  ```

  The actual scanner returned **no findings across 584 tracked sources**. The installed LLM TypeScript program reported **zero diagnostics**; ESLint reported **zero errors/warnings**. Actual assembler execution changed the valid `a–b`/`a-b` fixture from successful evidence assembly to `quote_not_found`. This remains a containment-test gap; no production override exists.

- **P1-TEN-01 — RESOLVED, retained.** Distinct whitespace-edge and split-surrogate cases remain and pass.
- **P1-TEN-03 — RESOLVED, retained.** Listed scope errors retain safe remedies; unexpected errors rethrow.

## Eight checklist dispositions

1. **Single scoping helper — retained PASS.** `hasGenerationForProfile` still mints `ProfileScope` and composes `generationsNewest` at `with-workspace.ts:2795`; cross-profile/workspace tests pass.
2. **Mechanism stripping — unchanged/not triggered.** No contribution or seed changes.
3. **Append-only brains, provenance, approval — PARTIAL assurance.** Runtime protections remain unchanged; TEN02 leaves the promised unchanged-mapper forwarding proof incomplete.
4. **Sensitive inference — retained PASS.** No new inference or silent update path.
5. **Export/deletion — unchanged/not triggered.** No new creator-data table or lifecycle change.
6. **Roles/admin — retained PASS.** Owner enforcement at `with-workspace.ts:4084` remains unchanged.
7. **PII/secrets — retained PASS.** Content-free refusal logging tests pass; no logging changes.
8. **Requirement provenance — PARTIAL.** T1/T3 and AC1/2/3/5/6 remain traceable; AC2's mapper-containment obligation remains incomplete.

## Checks and probes

Executed `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/selected-profile-pages.test.tsx packages/credits/tests/voice-build-tolerance.test.ts packages/db/tests/profile-scope.test.ts tests/profile-cage.test.ts tests/onboarding-refusal-log.test.ts`.

**Exit0: 221 tests, six files, no skips; 129.49 seconds.**

Read-only Node probes extracted the actual scanner and substituted source only in memory:
- Original getter, computed getter, quoted setter, async/generator methods, escaped/computed prototype keys, and computed mapper keys rejected.
- Plain, quoted, and static-computed data-property controls accepted.
- Block-function forwarding shadow accepted; compiler, lint, and actual assembler results recorded above.
- Arbitrary global-mutation probing was excluded from findings as outside the bounded source restriction.

## Coverage and stability

Read the scanner and controls, relevant assembler/caller/scoping/refusal sections, accepted mapper contract and acceptance criteria, batch2 report, repair notes, owner pass, reservation, and canonical checklist. Unchanged runtime coverage is retained; presentation-only work awaits the final generalist.

All **48 file hashes, contract, lockfile, and manifest matched before and after**. Only `assemble-kinds.test.ts` and `studio-ui.test.tsx` differ from batch2. Final HEAD matches the manifest base.

No live/Docker rerun or independent cross-model verification claimed. The separate `bad_shape` observation remains unresolved.

**Verdict: NEEDS CHANGES.** TEN02's argument guard is repaired, but its unchanged-forwarding assurance still admits the demonstrated shadowing form.
