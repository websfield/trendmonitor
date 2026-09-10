# Respin spin & source compliance review — Phase 10b-1 independent review, round 2 (2026-09-09)

*Report returned by `respin-compliance-reviewer`; saved verbatim by the review lane.*

**Readiness: Almost · Grade: B- · The round-1 BLOCK is genuinely closed by code and witnessed by execution; what remains is four copy-versus-code gaps on the "what survives erasure" page, none of them a compliance breach.**

Counts: 0 BLOCK · 4 CHANGE · 2 NOTE.

**Scope**: whole uncommitted working tree vs `d5fbaf7`. Compliance path touched: the Stripe-payload purge in the erasure transaction, the external-copies registry and `/settings/account` copy, plan C3, the composite rights-scope/profile keys (0056/0057), the shared-class executor fixtures. `respin/packages/trends` untouched; no adapter, prompt template, similarity gate, or kill-test file changed.

## Movement on round-1 findings

| Round-1 finding | Now | Evidence |
|---|---|---|
| Completed identity erasure retained email/name/billing address in `stripe_events.payload` | **Closed** | `deletion-executor.ts:626-633` purges inside the erasure transaction before the executors; `deletion-executor.test.ts:721` asserts `payload` is `{}` at `complete`; ran, green. |
| `RETAINED_COPY` omitted holders and implied provider erasure | **Closed** | `external-copies.ts:50-81` explicit list; `copy.ts:28` renders every holder; `:31` day 28 via `lastCapableCopyDay`; `account-copy.test.ts:42-62` green. |
| Shared row classes had zero fixtures | **Closed** | `deletion-executor.test.ts:289-307` seeds every rights class with consent for BOTH people; per-scope cases at `:675, :800, :903`; `:813-817` asserts per subject. |
| `billing_contact_user_id` zero occurrences | **Closed** | Migration 0056; `deletion-lifecycle.ts:848-876`; executor re-check `deletion-executor.ts:570`, witness `:820-844`. |
| Two dead non-identity `recovery_secret` specs | Reported fixed (T-R2-8), verified by the tenancy gate round 2. | |

**Least-confident lines.** Tombstone-store/restore ordering: untouched this round; held. Billing-contact rule keyed by user with NULL refused: confirmed at `deletion-lifecycle.ts:860-875`; its consequence produces CHANGE 4.

## Findings

- ⚠️ CHANGE `respin/packages/db/src/external-copies.ts:45-48` — `BACKUP_MAX_RETENTION_DAYS = 21` is a hand-typed twin of `scripts/backup.sh:39`; the comment "Mirrors … in scripts/backup.sh" is asserted by nothing (`shell-scripts.test.ts:123-139` pins the shell with literals; `account-copy.test.ts:60` pins the page to the TS constant; the two never meet). · Fix: assert in `shell-scripts.test.ts` that `backup.sh` carries `BACKUP_MAX_RETENTION_DAYS=<the TS constant>` on a non-comment line.
- ⚠️ CHANGE `respin/app/(product)/settings/account/copy.ts:24` — "financial records … for seven years" states a bounded retention the code does not enforce (`financial_chain_seven_years` is `kind: "financial_chain"`, destructive receiver disabled by R-122; the pin asserts only the enum name and the words). Register T69-R11, carried unchanged. · Fix: "for at least seven years" and re-pin to `kind: "financial_chain"` so enabling the receiver forces the copy edit.
- ⚠️ CHANGE `respin/packages/db/src/retention-receiver.ts:341-342, 354-355` — the purge's comment claims "every workspace the subject ever belonged to"; the query is `memberships ∪ deletion_membership_snapshots` for this user. A former contact who handed over, was removed, then deletes is in neither set. **Unreachable today** (no leave/remove/role-change surface; only `deletion-lifecycle.ts` deletes memberships); 10b-2 seats will open it. · Fix: correct the comment, and put the constraint in the 10b-2 handoff with a fixture that removes the member before deleting.
- ⚠️ CHANGE `respin/app/(product)/settings/account/copy.ts:58-59` — `BILLING_CONTACT_UNKNOWN_COPY` says "no owner of this workspace can delete their account"; the code refuses every MEMBER in any role. The post-refusal sentence is honest; the pre-request sentence an editor reads is not. · Fix: "no member of this workspace", pinned by asserting the sentence does not contain "no owner".
- 💡 NOTE `respin/app/(product)/settings/account/page.tsx:35` — `NOTICE_COPY.billing_contact_accepted` is user-facing copy outside `copy.ts`, so the forbidden-claims scan never sees it. True today. · Move into `copy.ts`.
- 💡 NOTE `respin/app/(product)/settings/account/refusal-code.ts:67` — `last_owner`: "Transfer ownership or delete that workspace first" — no ownership-transfer or invite-as-owner surface under `app/` was found (medium confidence; pre-existing wording). · Reword to name the path that exists or state that seats arrive later.

## Checks run

1. Sources allowlist — ✅ no manifest change, `packages/trends` clean, no scraping dependency. 2–5 — n/a (spin, gate, kill test, `[check]` untouched). 6. No guarantees — ✅ zero guarantee language in strings across the account surface. 7. No automation/concealment — ✅ the only new provider write is `customers.update` on the workspace's own customer behind owner role + password reauth; the request flag never gates cancellation. 8. Autopsy caching and honesty — ✅ composite scope and profile keys on all three tables with refused-insert witnesses (`trend-rights-keys.test.ts` 3/3); the two `trend_items` UPDATE sites cannot fire `ON UPDATE` on a changed key; caching, order and stale handling unchanged.

## Coverage

- read fully: `external-copies.ts`, account `copy/grace/refusal-code.ts`, `account-view.tsx` and `page.tsx` diffs, `deletion-executor.ts` diff, `trends-schema.ts` diff, migrations 0055–0057, `retention-receiver.ts:300-460`, `deletion-lifecycle.ts:822-918, 1005-1036`, `deletion-executor.test.ts:691-845` plus fixture, `trend-rights-keys.test.ts`, `account-copy.test.ts`, `billing-contact.ts:1-60`, `shell-scripts.test.ts:98-139`, round-1 review, lean lens 1, ledger, register · skimmed: `retention-receiver.test.ts` diff, `retention-clocks.ts:60-119`, `trends-storage.ts:290-392`, `deletion-journal.ts:170-205` · not read: `deletion-commands.ts`, `lifecycle-executors.ts`, `lifecycle-probes.ts`, `creator-data-registry.ts` diff, `deletion-request-enablement.ts`, `worker/retention.ts`, the S3 infra files, `retention-sweep-fixtures.test.ts`.
- commands run: `git diff HEAD --stat -- respin/` → 64 files, +3053/−488; `vitest run trend-rights-keys account-copy lifecycle-registry` → 30/30; `vitest run deletion-executor retention-receiver` → 49/49; greps for guarantee language (none in strings), manifests (none), destructive `memberships` writers (only `deletion-lifecycle.ts`), `BACKUP_MAX_RETENTION_DAYS` (TS and shell hard-code 21 independently), `T69-R11` (open).

## Verdict

NEEDS CHANGES
The round-1 BLOCK is closed in code and proven by running it; the four CHANGEs are all "page says X, code does Y" gaps on the same page that round 1 blocked on, and none is a scraping, similarity-gate, automation, or guarantee breach.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
