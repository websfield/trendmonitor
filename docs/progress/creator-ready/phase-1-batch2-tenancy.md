# Phase 1 implementation — batch 2 tenancy

Independent context `/root/p1_b2_tenancy`; requested gpt-6-astra/max, fork_turns none; resolved runtime unverified. One reserved assessment completed. Read-only; no source edits.

**Tenancy readiness: Almost · Grade B · NEEDS CHANGES.** One Medium finding remains; zero High/BLOCK findings. Whole-phase readiness remains Not yet separately.

## Findings

- **P1-TEN-02 — PARTIAL, Medium, high confidence.** `respin/packages/llm/tests/assemble-kinds.test.ts:746` accepts accessor properties as ordinary argument fields. The actual scanner accepts the following in-memory replacement at the real inferVoice caller:

```ts
parseVoiceReply({
  get text() {
    Object.defineProperty(this, "mapBack", {
      value: () => ({ startUtf16: 0, endUtf16: 0 }),
    });
    return run.text;
  },
  fields: VOICE_FIELDS,
  posts,
});
```

The modified credits TypeScript program reported zero diagnostics; ESLint reported zero errors/warnings. Actual assembler execution changes the canonical a–b/a-b fixture from successful evidence assembly to quote_not_found, proving the mapper ran. No corresponding production override exists. Classification: sibling of the same incomplete mapper-containment invariant, not a demonstrated production defect. Previous four bypasses now reject, but the promised containment proof remains incomplete.

- **P1-TEN-01 — RESOLVED, retained.** Distinct whitespace extensions and canonically equal split-surrogate cases remain at assemble-kinds.test.ts:322–325,359–362.
- **P1-TEN-03 — RESOLVED, retained.** Safe remedy remains at onboarding/page.tsx:100; real-page listed-error and unexpected-error rethrow tests pass.

## Canonical checklist

1. Single scoping helper: retained PASS. hasGenerationForProfile mints ProfileScope and composes generationsNewest at with-workspace.ts:2795; both query predicates retained at2473. Cross-profile/workspace tests pass.
2. Mechanism stripping: unchanged/not triggered. No contribution or seed change. REQ-D04/R-9 apply; written seed consent recorded in R-29.
3. Append-only brains/provenance/approval: runtime protections retained, containment assurance incomplete. Original evidence slices stored at assemble.ts:571; versioning, proposed status and provenance unchanged. TEN02 open; PRD REQ-B02 withdraws confidence-level wording.
4. Sensitive inference: retained PASS. No new inferred fields, silent activation or update path.
5. Export/deletion: unchanged/not triggered. No new creator-data table or lifecycle change.
6. Roles/admin: retained PASS. Owner enforcement at with-workspace.ts:4084 unchanged; no new authority.
7. PII/secrets: retained PASS. Content-free refusal logging and instanceof AssemblyError handling remain; sentinel and duck-typed logging tests pass.
8. Requirement provenance: PARTIAL. REQ-A03/B02, REQ-D04 and R-8/R-9 traceable; TEN02 containment proof incomplete.

## Validation and coverage

Executed `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/selected-profile-pages.test.tsx packages/credits/tests/voice-build-tolerance.test.ts packages/db/tests/profile-scope.test.ts tests/profile-cage.test.ts tests/onboarding-refusal-log.test.ts`: exit0,215 tests/six files, no skips.

Actual scanner baseline:584 tracked sources, no findings. Previous four bypasses reject. Current population has one production parseVoiceReply importer, existing LLM re-export, no dynamic/require LLM imports. Held-out wrapper/member/namespace-object/parameter-escape probes reject; safe wrapped calls accepted. An arguments[0] mutation evades scanner but ESLint rejects it; not counted separately. Two diagnostic harness attempts failed during inventory/module loading; corrected runs completed. No frozen files mutated.

Read scanner/controls, governing mapper contract/T1/AC2, repair history and canonical checklist; inspected relevant assembler/caller/scoping/refusal paths. Presentation-only coverage retained, not newly assessed. Parent final seven-command gate remains5246 passed/101 Docker skips; live journeys/screenshots unverified.

All48 current hashes, contract, lockfile and HEAD match before/after. Historical copying error corrected by parent, now exactly one batch1→2 file delta. Scanner SHA E15C2B5831062126101D799F54F24309BEACE12BF2B12FB48EDC1D465714311F; corrected manifest SHA A196133AE428BB0C66753369D1D4564F2E5680F2CC6E04EE0C7DF642C749C446; HEAD79de2dbb14944f2f3089c621dc8bc9d31e0c1882. No cross-model verification claimed.

## Convergence disposition

TEN02 remains incomplete after the bounded owner/reviewer diagnosis and class repair. Canon gate-rules §5 stops further revisions. Preserve the residual and original acceptance scope; finish the already-reserved final generalist/merged compliance on unchanged batch2 inputs. Unused batches3–4 do not waive the convergence stop-rule.
