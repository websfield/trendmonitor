# Respin brain tenancy review — Phase 10b-1 independent review, round 2 of 2 (2026-09-09)

*Report returned by `respin-tenancy-reviewer`; saved verbatim by the review lane.*

**Readiness: Almost · Grade: B · Every round-1 tenancy finding is closed by code and a witness I ran, no cross-profile or cross-workspace read and no silent brain mutation is reachable from the two fix rounds, but the new dynamic-writer population guard misses half the shapes it claims to cover, and the public billing-contact copy understates who the new refusal holds.**

Counts: 0 BLOCK, 2 CHANGE, 3 NOTE. Round 1 (2026-09-08) was NEEDS CHANGES (B−).

**Scope**: the whole uncommitted working tree against `d5fbaf7` — 64 modified files (+3,053/−488) plus the untracked new files. Only Respin code is touched.

## Movement on round-1 findings

| Round 1 | Movement | Evidence |
|---|---|---|
| H1 — registration API blind to a new column | **Closed.** | `LIFECYCLE_COLUMN_CENSUS` (52 tables) and the census loop in `validateLifecycleClosure` (`creator-data-registry.ts:1223-1240`, `:1255-1260`); planted `ADD COLUMN` reddens naming the table (`lifecycle-registration.test.ts:39-46`) — ran, green. |
| H2 — second dynamic destructive writer | **Closed as a list; the population scan it grew is CHANGE 1.** | `DYNAMIC_LIFECYCLE_WRITERS` with two entries; `retention-receiver.ts` in `stripe_events`' `physicalWriters`. |
| H3 — export projectors declared and unbuilt | **Closed honestly.** | `BUILT_EXPORT_PROJECTORS = ["profile_creator"]`; closure refuses `included` under an unbuilt projector; five entries downgraded. REQ-A04's export promise (brain plus generation history) is carried by `profile_creator`. |
| Two dead `recovery_secret` specs | **Closed, twice over.** | Effects redact digest + prefix only; `request_session_digest` removed; the identity measure measures from `requested_at`; the post-gate fix runs the real UPDATE on real rows and asserts the identity stamp is refused (`retention-sweep-fixtures.test.ts:411-457`) — ran, green, non-vacuous. |
| 17 of 29 unpopulated specs; RESTRICT graph never exercised | **Closed, and it found the wedge.** | Bijection asserted (25 producible, 4 `unproducible` with asserted reasons); one tick, `failures: []`, `poisoned: 0`; T-R2-1 found and fixed by `orderChildrenFirst` over `LIFECYCLE_FOREIGN_KEY_EDGES` (derived from `FINAL_SCHEMA_FOREIGN_KEYS`, itself held equal to the migrations' keys both ways); cycle refusal planted; key-order non-vacuity asserted. |
| T69-R5 — sweep registration unasserted | **Closed.** | `retention-alerts.test.ts:130-136`. |
| `pendingDeletions` raw read | **Closed.** | `pendingDeletionsForScope`, cage first; cage entry green. |
| No CHECK tying autopsy `rights_scope` to its item | **Closed beyond what was asked.** | Composite scope (0056) and profile (0057) keys on all three tables; refused-insert witnesses by constraint name; the two mis-parent tests converted with reader assertions kept; the four `update(trendItems)` sites touch no keyed column. |
| Stale comments | **All three corrected.** | |

**The build lane's three post-gate fixes, checked.** (1) Mis-parent tests: converted correctly, refused with `23503` on the profile key — both suites run. (2) Dead measures' effect and witness: verified. (3) T-R2-5 remedy: the accept action is primary; a raw UPDATE confined to a workspace with no active owner after the Stripe personal-field class is cleared — the BLOCK is no longer re-opened as a runbook line.

**Least-confident lines.** The billing-contact rule holds (keyed by user; NULL refused for every member; on all six sites; re-asserted at erasure before anything is erased; the recovery-expired branch transitions to `cancelled`, so no bypass). Its public description does not (CHANGE 2). The tombstone-store/restore-ordering line: untouched except the PGPASSWORD swap; still held.

## Findings

- ⚠️ CHANGE `respin/packages/db/tests/lifecycle-registry.test.ts:141-163` — The new "EVERY module that renders a dynamic table name is declared" scan has no planted-violation witness, and its own predicate against six planted shapes catches three: it misses `sql.raw(\`DELETE FROM "${name}"\`)`, `sql.raw(\`UPDATE "${table}" SET\`)` and `TRUNCATE ${sql.identifier(t)}` — the regex requires `${` immediately after `FROM`/`UPDATE` whitespace, so a quoted interpolation evades. It reads `packages/db/src/*.ts` only, never `packages/credits/src/**`. Nothing is currently absorbed (grep of credits for `sql.raw|sql.identifier` is empty) — the 2026-08-26 class. · Fix: plant one fixture per shape and assert each is caught; widen to `(DELETE FROM|UPDATE|TRUNCATE)\s+"?\$\{`; walk `packages/*/src/**`.
- ⚠️ CHANGE `respin/app/(product)/settings/account/copy.ts:57-58` and `:18` — `BILLING_CONTACT_UNKNOWN_COPY` says "no owner of this workspace can delete their account", and `IDENTITY_DELETE_COPY` names only "while you are the billing contact". The shipped rule holds every MEMBER of a pre-C3 workspace in any role; the post-refusal copy already says "a workspace you belong to". The register was corrected for exactly this; the page was not. Criterion 7, REQ-A04. · Fix: "no member of this workspace" in both sentences, pinned in the copy test.
- 💡 NOTE `respin/packages/db/src/retention-receiver.ts:349-386` — `purgeSubjectStripePayloadsInTx` for an identity redacts the payloads of every workspace the subject ever belonged to, any role — the 90-day outcome brought forward, acceptable. But the purge extracts in one statement while the sweep isolates per row: one unextractable co-tenant row fails the whole erasure transaction and blocks a deletion the subject cannot influence. Say so, or isolate per row here too.
- 💡 NOTE `respin/packages/db/src/retention-receiver.ts:366-373` — unattributed events (the orphan/insert-race class T-R2-4 defers) are outside every purge population and keep a person's email until the 90-day sweep. Record the in-database half on T-R2-4.
- 💡 NOTE `respin/packages/db/tests/retention-sweep-fixtures.test.ts:431-434` — the witness re-types the redaction SQL rather than using the receiver's renderer; the one-tick sweep covers the gap indirectly. Export `redactionAssignments` and use it, or say the tick is the rendering witness.

## Checks run

- T1 — holds (five new scope-taking entries pinned and reaching `assertScoped`; one-row reads/writes by the scope's workspace; A-vs-B isolation case green; profile keys make the trends readers' isolation structural). T2 — n/a for session→library; rights-class fixtures seed every class, identity erasure removes only the subject's consent rows. T3/T4 — n/a. T5 — holds (`billing_contact_user_id` nulled at workspace erasure, witnessed; SET NULL for identity; `amount_including_tax_cents` censused; export downgrade honest per REQ-A04). T6 — holds (accept owner-only at scope and in-transaction; cancellation never gated). T7 — holds (session email; pseudonymous key; content-free error; safe log). Provenance — partly violated (CHANGE 2); every other behavioural claim checked has a red-on-defect witness.

## Coverage

- read fully: the new modules, migrations 0055–0057, `retention-sweep-fixtures.test.ts`, `trend-rights-keys.test.ts`, `billing-contact.test.ts`; full diffs of the registry, lifecycle, executor, clocks, receiver, trends schema, billing schema, customers, deletion commands, both app-servers, the account surface, `billing-errors.ts`, the recover route, the worker, and the touched tests; `deletion-lifecycle.ts:985-1077,1195-1249`; the register; both build-lane tenancy reports; the ledger · skimmed: `restore-drill.sh` diff, `trends-storage.ts` update sites, `safe-log.ts`, `retention-alerts.test.ts` · not read: `activation.ts`, `auth-mail.ts`, `finance-extract.ts`, `journal-forecast.ts`, `backup.sh`, the S3 files, the Docker suites, `retention-receiver.test.ts`, `account-copy.test.ts` (grepped), `deletion-recover-route.test.ts`, `journal-forecast-cli.test.ts`, `s3-journal-policy.test.ts`, `shell-credentials.test.ts`, `env.example`, `README.md`, `REGISTERING-A-TABLE.md`.
- commands run: `git diff HEAD --stat -- respin/`, `git status --short`; `vitest run` over eight suites → 217 passed; five suites → 84 passed, 1 loud-skipped; two suites → 11 passed; `deletion-lifecycle -t "Plan C3|UNKNOWN contact|by USER|…"` → 5/5; `deletion-executor.test -t "C3 at the LAST|rights class|…"` → 6/6; a scratchpad `node` probe applying the dynamic-writer scanner's exact predicate to six planted shapes → `CAUGHT 3 / MISSED 3`; greps for `stripe_events.payload` readers (none beyond extractor/sweep), `update(trendItems)` sites (4), `sql.raw|sql.identifier` in credits (none), `REQ-A04`.

## Verdict

NEEDS CHANGES
No tenancy leak, no silent brain mutation and no unscoped query path is reachable from the two fix rounds, and every round-1 item is closed by a witness I executed; what remains is a population guard that has never been made to fail and a public sentence narrower than the rule it describes — both one-pass fixes.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
