# Phase 1 implementation — batch 1 tenancy

Independent context `/root/p1_b1_tenancy`; requested gpt-6-astra/max, fork_turns none; resolved runtime unverified. One reserved assessment completed. Read-only, no source edits.

**Tenancy readiness: Almost · Grade B · NEEDS CHANGES.** One Medium finding remains; zero High/BLOCK. Whole-phase acceptance remains Not yet separately.

## Findings and closure

- **P1-TEN-01 — RESOLVED.** `respin/packages/llm/tests/assemble-kinds.test.ts:307` covers distinct whitespace/non-whitespace extensions and canonically equal split-surrogate boundaries in both tables. All25 predicate/seam tests passed. Retained mutation evidence records strengthened w2b/w2e failures and restored passes.
- **P1-TEN-02 — PARTIAL, Medium, high confidence.** `respin/packages/llm/tests/assemble-kinds.test.ts:452,487` still accepts production mapper overrides. The actual scanner returned no findings for four held-out in-memory plants: `(voice.parseVoiceReply)({... , mapBack: replacement})`; template-literal member `voice[`parseVoiceReply`]({... , mapBack: replacement})`; `params = { ...params, mapBack: replacement };` before the approved destructure; and `params.mapBack = replacement;` before that destructure. Baseline clean across584 tracked sources; direct namespace override, replacement-local binding and removed-forwarding controls rejected. No current production override found; the promised containment proof remains incomplete.
- **P1-TEN-03 — RESOLVED.** `respin/app/(product)/onboarding/page.tsx:100` carries safe refusal copy into the unknown step; `onboarding-view.tsx:272` renders its alert. Both listed error classes passed real-page assertions at `selected-profile-pages.test.tsx:287`; unexpected TypeError still rethrows.

## Canonical checklist

1. Single scoping helper holds: `with-workspace.ts:2790` mints ProfileScope and composes generationsNewest; query retains both predicates at2473. Mine/sibling/attempt-only/foreign/P4 tests pass; registrations remain.
2. Mechanism stripping unchanged/not triggered: no library contribution or seeding change.
3. Append-only brains/provenance/approval runtime holds; containment assurance incomplete (TEN-02). Original slices stored at `assemble.ts:571`; unchanged writer validates, versions and stores proposed. PRD4B withdraws the checklist's confidence-level requirement.
4. Sensitive inference unchanged: no new fields, activation route or silent update.
5. Export/deletion unchanged/not triggered: no new creator-data table or lifecycle path.
6. Roles/admin holds: existing owner enforcement at `with-workspace.ts:4084`; no new authority.
7. PII/secrets holds: instanceof AssemblyError, static copy and content-free logging; sentinel/duck-typed tests pass, client imports type-only.
8. Requirement provenance partial: T1/T3 traceable to REQ-A03/B02 and R-8; TEN-02 leaves mapper containment incomplete.

## Validation and integrity

Reviewer ran `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/selected-profile-pages.test.tsx packages/credits/tests/voice-build-tolerance.test.ts packages/db/tests/profile-scope.test.ts tests/profile-cage.test.ts tests/onboarding-refusal-log.test.ts`: exit0,190 tests/six files, no skips.

Additional `node --input-type=module` probe executed the actual AST-extracted scanner against tracked sources and in-memory held-out plants. No on-disk mutations. AC12 transcripts inspected, not independently replanted.

Freshly read assembler/tests, onboarding page, selected-profile tests, PGlite tolerance test, refusal-log test, relevant view/DB/inference sections, repair notes and governing contract/checklists. Unchanged batch0 coverage retained; no new visual assessment of presentation-only work. All48 source hashes, contract and lock match before/after. Manifest hash `8B48EBBE22CA9C2433464433040A07A7073BE55E6EE4E5CC8536F0155B171740`; HEAD `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`.

## Bounded recurrence diagnosis

Reviewer confirmed the proposed class correction matches the reproducers and accepted restriction: unwrap harmless call expressions or reject unsupported seam references, recognize static namespace members, and permit no body use of params except its approved destructure. Retain the single direct forwarding exception and test exemption. This is diagnostic agreement, not assessment of revised code; no additional verdict was requested.

Live journeys/screenshots and Docker remain unavailable or unrun. No cross-model verification claimed.
