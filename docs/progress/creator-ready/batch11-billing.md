# Batch 11 billing plan review

Independent reviewer `/root/batch11_billing`; requested default context, gpt-6-astra/max, fork_turns none; resolved runtime unknown. Returned 2026-09-18. **Almost / Grade B / NEEDS CHANGES.** One Medium, no High/BLOCK.

## B11-C1 — Medium, high confidence

Rejected consumption records remain eligible for the main artifact upload. Phase2:76 puts raw files under `e2e/journeys/artifacts/consumption/`; :78 rejects extra fields, symlinks and malformed records for the separate manifest. T4:99 and AC5:143 upload the entire artifacts tree with only `_handoff/` excluded, gated on cleanup and behavioral scan rather than consumption validation. A behaviorally clean run with a planted extra-field record fails consumption validation but still uploads that raw file in the main report. Planned negative tests do not cover this alternate upload population.

This is an artifact-boundary defect: counting still requires the separate validated/downloaded manifest; rejected raw records do not authorize another dispatch.

## Prior findings

| Finding | Disposition |
|---|---|
| B10-C1 | RESOLVED for original reproducer: P2:76-80 separates retention from behavioral failure, preserves initial unknown, stops on cleanup/validation/upload/download failure. |
| B10-C2 | RESOLVED: P2:80 uses persisted `succeeded`, distinct from action `ok` and refusal; checked onboarding-schema:83, inference:877, infer-voice:236, actions:309,324. |
| B9-C1 | RESOLVED at plan level: scoped claim/usage snapshots, attempt deduplication, nonconsuming outcomes, unknown-stop, durable reconciliation P2:72-80,139,144; master:387. |
| B9-C2 | RESOLVED retained: w8b at P1:181,189,198. |
| B9-C3 | RESOLVED retained: maxima without positive floor master:145/P1:180. |
| B9-C4 | RESOLVED as accounting: 33 present, one no-change, one unrecoverable report. |
| B9-N1 | RESOLVED retained: unconditional buy-pack presence P2:139. |

## Complete billing checklist

1. Append-only ledger/derived balance holds for plan: evidence reads only, no new writer; unchanged batch10 coverage retained.
2. Webhook idempotency unchanged; inspected historical M1 coverage retained, not rerun.
3. Transactional debit/metering holds in scope: settlement unchanged, claims/usage determine consumption, persist-before-parse inspected.
4. Expiry/pause unchanged; pre/post-claim pause cases separately required, no code-only retry.
5. Versioned config holds: T8 existing entitlement facade, no invented allowance/cost/tier constant.
6. Tier/owner gates hold as specified: allowance block, unconditional editor assertion, action authority separately tested.
7. Threshold provenance holds: owner three-dispatch/two-refusal caps; 17/51 conditional maxima before SDK retries.
8. Falsifiable tests NEEDS CHANGES B11-C1: other classifier, duplicate, unknown, cleanup and behavioral-failure cases/mutations specified; rejected-file case misses an upload caller.

## Bounded diagnostic

Original retention-loss case covered. New reproducer: malformed consumption file, successful cleanup and behavioral checks. Cause: one validated destination while the same source reaches another. Population: consumption writer/validator, both uploads, P2 tests/ACs. No settlement-policy change.

## Coverage and limits

Fully read billing canon/checklist/skill, both phases, brief, codebase review, batch10 reports. Read reservation/current master contracts/exit criteria, repair disposition, Creator Ready dependencies and Phase0 batch15 evidence. Retired master history not fully reread in bounded reassessment. Relevant schema, inference/action ordering, artifact/handoff helpers and creator-spec callers inspected; solo press exists, T2 adds operator and routes both through shared helper.

Read/search commands only: Get-Content, Get-Item, rg, rg --files. No edits, tests, mutations, Docker, dispatch or external actions. Parent document checks and historical 5067 passed/101 skipped/23 Docker files NOT RUN are not current implementation acceptance. Nested cross-model unavailable. Verdict NEEDS CHANGES, shared artifact boundary only; Phase0 accepted, settlement parked.
