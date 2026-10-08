# L3 gate — `respin-tenancy-reviewer` (brain tenancy, full) (2026-10-04)

Frozen manifest `L3-gate.sha256` digest `d96685b4f2c6`: 37/37 OK before and after. The reviewer ran `TEST_DATABASE_URL=… vitest run packages/credits/tests/recent-context.test.ts packages/db/tests/brain-edit.test.ts packages/db/tests/profile-scope.test.ts packages/db/tests/lifecycle-registry.test.ts` (4 files, 122 passed). It also grepped for delete, update or raw SQL on `generations`, `generation_feedback` and `creative_pieces`. Nothing was edited or planted. `studio-page-entrances.test.tsx` differs from its pre-L3 version only by one added `rememberForFutureDraftsAction: vi.fn()` mock.

**Verdict: PASS · Ready · A.** 0 BLOCK, 0 High, 0 Medium, 3 Low, 3 Notes.

## Findings

- **Low** `with-workspace.ts:2651` and `profile-scope.test.ts:2540-2601`: the `creative_pieces` part of `recentContextCandidates` has no witness that would fail if its scope filter were lost (medium confidence, not planted).
  - The cross-parented test moves only `generations` and `generation_feedback`.
  - The fixture piece points at no draft.
  - Case 2 seeds no foreign pieces.
  - Real risk is low, because the composite FKs `creative_pieces_{source,selected}_generation_fk` hold.
  - The comment at `profile-scope.test.ts:2440` claims every table has its own cross-parented witness.
  - Fix: give each profile a piece pointing at its draft, and add `creative_pieces` to `moves` (expect `pieces` to reach 0).
- **Low** `with-workspace.ts:1833` and `tests/feedback-readers.test.ts:776-829`: the docblock says `feedbackPage` is "THE ONLY QUERY IN THIS REPO THAT READS `generation_feedback` (R11)". That was already false before L3 (`promotionFeedbackInputs` `:2706`). L3 adds three more readers: `:2616`, `:2638` and `:2684`.
  - `scanFeedbackAggregation` scans only `feedbackPage`'s subtree. A later `count()` in a new reader would stay green. This is Respin rule 7.
  - None of the new readers aggregates today.
  - Fix: scan every `.from(generationFeedback)` and `innerJoin(generationFeedback …)` in the permitted file, or list the readers by name. Correct the docblock.
- **Low** `studio-panel.tsx:688`: `RememberBlock` renders for any seat role. The server refuses non-owners (`assertOwner`, `with-workspace.ts:4358`; test 4b), but an editor is offered a press that can only be refused. Fix: hide or disable the block for non-owners.
- **Note** (least-confident): every route that removes a `generations` or `generation_feedback` row also removes the claim.
  - No `.delete`, `.update` or raw SQL touches either table.
  - The registry marks both tables `profile_lifetime`/cascade.
  - The one-year sweep runs only on terminal claims.
  - Profile erasure cascades the claim, which gives `moved: undefined`.
  - The check is existence-by-id, so it covers any future per-item delete. It would not catch in-place redaction ("clear this note"); whoever builds that must extend the check.
  - `settle` is the sole settlement site, and both new and resumed settlements run the check.
- **Note:** the snapshot ids are covered by export and deletion.
  - They live on `generation_attempts` (`excluded_system` for export per L2), with FK cascade and the one-year clock.
  - The three new paths are registered as governed, with live checks.
  - The reaction labels are copies of exported `generation_feedback` reactions.
- **Note:** for compliance, `basisCorpusFor` has no direct test showing it ignores `recentWork`.

## Checks

| Check | Result | Detail |
|---|---|---|
| T1 single scoping helper | holds | `both()` on every table, `with-workspace.ts:2569-2689`. The app goes through `respinDb.rememberForFutureDrafts`, and the eslint allowlist denies the raw function. The arity and AC-13 lists are updated. |
| T2 library stripping | n/a | |
| T3 append-only brain, provenance, approval | holds | Changes are server-built, a `proposed` version carries `creator_authored` evidence, cast smuggling is refused, and cases 4–6 pass. |
| Sensitive inference | holds | Labels come from a closed enum. |
| T4 export and deletion | holds | |
| T5 roles | holds on the server | Remember is owner-only and refused under pause. |
| T6 PII and secrets | holds | Logs carry ids, version and pointer only. |
| Requirement provenance | mostly holds | Except the two comment-as-claim Lows. |
