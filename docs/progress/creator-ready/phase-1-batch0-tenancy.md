# Phase 1 implementation — batch 0 tenancy

Independent reviewer: /root/phase1_batch0_tenancy. Requested gpt-6-astra/max, no history fork; resolved runtime unverified.

**Tenancy readiness: Almost · Grade B. Verdict: NEEDS CHANGES.** Three Medium findings; zero High/BLOCK. Whole Phase1 remains Not yet because live journeys/screenshots are unrun. One reserved batch-0 evaluation completed.

## Findings

1. **P1-TEN-01 — Medium, high confidence.** `respin/packages/llm/tests/assemble-kinds.test.ts:320`: both end-extension cases use [3,7), selecting the same `a-b ` slice, so no non-whitespace extension is tested. The injected table at line330 omits both edge extensions and split-surrogate cases required by T1/AC2. The pure split-surrogate case also fails canonical equality, so it does not isolate that guard. Add distinct literal predicate/seam cases, including canonically equal split-surrogate slices, and rerun relevant w2b/w2e witnesses.
2. **P1-TEN-02 — Medium, high confidence.** `assemble-kinds.test.ts:387,429`: containment checks names rather than complete bindings. Held-out probes accept a namespace-import override (`voice.parseVoiceReply` with mapper) and a locally constructed mapper replacing the parameter-derived binding while retaining the named forwarding call. Baseline clean; direct override and removed forwarding controls correctly rejected. No current production override found. Cover namespace calls and verify unchanged parameter-derived binding; add both plants.
3. **P1-TEN-03 — Medium, high confidence.** `respin/app/(product)/onboarding/page.tsx:99` returns only known:false for listed scoped errors; `onboarding-view.tsx:270` renders Voice: unknown without explanation/remedy. Real-component rendering confirmed neither refusal banner appears. This misses the accepted phase plan edge contract at line72. Preserve unknown while showing existing safe refusal copy; assert through the page's listed-error path.

## Full checklist

1. Single scoping helper holds: helper mints ProfileScope and composes doubly scoped accessor at with-workspace.ts:2790. All mine/sibling/attempt/foreign/P4 tests pass; enumerated registrations present.
2. Mechanism stripping unchanged/not triggered: no shared-library transformation or seed change.
3. Append-only brains/provenance/approval runtime holds; verification needs changes. Original slices reach unchanged validator/proposed-version writer; no alternate direct write. TEN-01/02 prevent complete AC2 assurance. Checklist confidence wording superseded by PRD.md:67 withdrawal.
4. Sensitive inference boundaries unchanged: no new fields/activation; voice remains proposal requiring confirmation.
5. Export/deletion unchanged/not triggered: no new table/schema/deletion path.
6. Roles/admin unchanged: owner enforcement retained in inference/writeBrainDoc; no new authority.
7. PII posture holds: only instanceof AssemblyError kind propagated. Sentinel and duck-typed tests pass; client imports type-only.
8. Requirement provenance partial: T1/T3 traceable; offset, containment and failure-presentation obligations incomplete above.

## Validation and coverage

- Ran `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts packages/credits/tests/voice-build-tolerance.test.ts packages/db/tests/profile-scope.test.ts tests/profile-cage.test.ts tests/selected-profile-pages.test.tsx tests/onboarding-refusal-log.test.ts`: exit0, 180 tests in 6 files, no skips.
- Actual-module `node --import tsx --input-type=module` probe: 216 astral/edge-whitespace combinations passed, including stored slices.
- Four additional predicate/parser probes (non-whitespace extension, whitespace extension, split start/end) correctly refused with quote_not_found. Runtime evidence does not replace missing committed regression tests.
- Actual containment scanner extracted from AST executed against tracked inputs and in-memory plants: two missed forms and two rejected controls above.
- Real OnboardingView render confirmed unexplained unknown state.
- All48 source hashes, contract and lock matched before/after. Changed/new source inventory exactly matched manifest.
- Initial literal-Unicode probe corrupted to code point63 by PowerShell native pipe; discarded, replaced with successful escaped-code-point probe.
- Parent transcript: seven commands exit0, 5,203 passed/101 skipped across23 Docker files. Read twelve-plant core mutation record; no independent frozen-source mutations.
- Fully read assembler/new tests, composed inference, PGlite test, refusal-log test, logger, onboarding page, selected-profile tests and outcome component. Inspected affected diffs, DB scoping/write/validation, registrations, relevant UI assertions, accepted T1/T3 contract and all eight checklist items. Presentation-only changes received no independent visual assessment.

Missing Docker/live acceptance is a separate evidence gap, not a demonstrated product defect. No edits, subagents or recursive Codex review.
