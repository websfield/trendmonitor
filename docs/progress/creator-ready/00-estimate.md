# Phase 0 bounded change list and estimate

Refreshed after the other four deliverables on 2026-09-17, following incorporation of the owner-run database export. Source: the **24-row** register's original file-population observation dated **2026-09-16**, with T3 pointers refreshed **2026-09-17**, at HEAD `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`. The historical **13–21 engineering days is superseded**, not a baseline or current commitment.

These are planning allowances, not measured durations or findings of missing implementation. A person-day means 8 engineering hours. Owner/vendor waiting has no finite calendar upper bound. The register deliberately makes no obligation-status determination, so remediation effort cannot be derived from a green or missing witness.

## Known enhancements

No register row belongs here. Conditional first planning ranges: permissioned baseline and a bounded quality-improvement experiment (T1/T2, Phase 5), 16–40 hours after material arrives; saved-result handoff/reference-limit work (T3/T3-REF, Phase 6), 8–24 hours within existing submitted-text/YouTube mechanisms; acceptance/observed-creator/truth-copy integration (T7/T8, Phase 7), 16–40 hours after approved routes and copy exist. Total **40–104 hours (5–13 days)**. These allowances exclude new platform adapters, money policy changes, recruitment and approval lead time. Phase 1 overlap must be removed when Phase 5–7 contracts are written; these are not additional authorizations.

## Existing remediation

No register row belongs here. Allow **24–64 hours (3–8 days)** provisionally for already planned service-quality implementation and its focused validation (Phases 1–2); this is an author planning range, not verified task effort. Their gate remains closed at Almost/Grade C with unverified applied fixes. Do not infer fresh defects from historical findings or from failed command startup. Phase 3 money/recovery work remains parked and **unestimated, not zero**. Any newly confirmed repair needs its receiving phase to define and estimate it; no blanket repair contingency is presented as a known defect.

## Verification/review

| Row | Obligation | Pinned settling work | Engineering hours |
|---|---|---|---|
| (4) | scope | run respin/packages/db/tests/with-workspace.test.ts | 0.5–2 |
| (5) | plan | run respin/packages/db/tests/profile-scope.test.ts | 0.5–2 |
| (6) | full-script entitlement | run respin/tests/action-gate.test.ts | 0.5–2 |
| (9) | autopsy scrub residual | run respin/packages/db/tests/autopsy-policy.test.ts | 0.5–2 |
| (10) | retained fields/records | run respin/packages/db/tests/retention-sweep-fixtures.test.ts | 0.5–2 |
| (11) | delayed-job resurrection | run respin/worker/tests/deletion-lifecycle.test.ts | 0.5–2 |
| (13) | seeded tier/add-on | re-read respin/packages/db/src/seed.ts | 0.5–2 |
| (14) | grant/invoice/cancellation/failure | run respin/packages/credits/tests/stripe.test.ts | 2–6 |
| (16) | content minimisation | run respin/tests/telemetry.test.ts | 0.5–2 |
| (17) | spend/error visibility | run respin/tests/probe-artifacts.test.ts | 0.5–2 |
| (19) | recovery diagnosis | run respin/worker/tests/retention-alerts.test.ts | 0.5–2 |
| (24) | Docker-suite count | re-read CLAUDE.md, respin/docker-compose.yml and docs/plans/respin-finish-master-plan.md | 0.5–1 |

Subtotal: **7.5–27 hours**. Includes running and inspecting the named suites/files, not repairing failures or replacing independent gates.

## External dependencies

| Row | Obligation | Pinned settling work | Engineering hours |
|---|---|---|---|
| (1) | signup | owner input: the approved pilot admission rule | 0.5–1 |
| (2) | OAuth | owner input: the approved pilot admission rule | 0.5–1 |
| (3) | workspace/bootstrap | owner input: the approved pilot admission rule | 0.5–1 |
| (7) | journal provisioning | owner input: whether the R-124 provisioning evidence settles this row | 1–3 |
| (8) | restore | external action: the production restore walk | 4–12 |
| (12) | configuration vs checkout/entitlements/costs | owner input: the approved offer/configuration record | 1–3 |
| (15) | collectors | external action: create the telemetry collector accounts | 2–6 |
| (18) | alert recipients | owner input: the named alert recipients | 0.5–1 |
| (20) | support contact | owner input: the approved support contact | 0.5–1 |
| (21) | incident/rollback owners | owner input: the named incident and rollback owners | 0.5–1 |
| (22) | placeholders | owner input: the approved customer-document copy | 2–6 |
| (23) | page/help/checkout alignment | owner input: the approved offer, data and support copy | 2–6 |

Subtotal: **15–42 hours**. Hours cover engineering preparation, integration or witnessing after access/input is supplied; they do not estimate owner approval or external elapsed time. Each admission surface retains a separate nonzero allowance; one shared owner decision may remove overlap later.

## Bounds and next refinement

The conditional scoped envelope is **86.5–237 engineering hours (10.8–29.6 days)** across the allowances above. It is **not a full-programme completion estimate**: parked money work, any new ingestion adapter, newly confirmed repairs, independent-review scheduling and external waiting remain outside a defensible finite bound.

Unknowns widening the range: all live Docker suites were skipped; Stripe checkout amount/currency/interval parity and the intended acceptance environment remain unverified; admission rule, owner materials and telemetry/restore access are not supplied; later phases remain unplanned. Owner-run SELECT output now records config v18, both rollouts at v1/expanded/revision 0 and 62 migration rows matching 62 files. All seven local check commands pass. These observations do not settle register rows or reduce their pinned nonzero receiving-phase allowances. The three batch-13 findings remain unresolved; no further independent review was authorized. No repairs, policy changes, provisioning, deployment or service spending are authorized by this document. All 24 register rows occur exactly once in the two form-derived tables, each with a nonzero range.
