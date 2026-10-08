# Dependency-audit exceptions — Respin

Every GHSA id in `respin/package.json` → `pnpm.auditConfig.ignoreGhsas` **must**
have a row in **Active exceptions** below, with a **Review by** date that has not
passed. An id without one is an unreviewed exception: delete the id rather than
the row. `tests/journeys-workflow-triggers.test.ts` (`exceptionProblems`) holds
both directions and the dates — an ignored id with no row, a row whose id is no
longer ignored, and a lapsed Review by date each fail the suite, and
`.github/workflows/respin.yml` runs that suite daily, so a lapsed date turns CI
red on its day rather than seven weeks later.

The CI gate (`.github/workflows/respin.yml`, "Dependency audit") fails on any
**high or critical** advisory in the production dependency tree (`--prod`) that
is *not* listed here, and `.github/workflows/respin-journeys.yml` runs the same
audit over the **dev** tree too, before any dependency code runs in the job
that holds the vendor key. This
file is the only way a high-severity finding stops blocking either, and adding
to it is a reviewed diff rather than a CI-config edit nobody reads.

**Scope reminder:** the scan covers the `respin/` workspace only. `src/` (UGC
Intelligence — Python + .NET) and `cutdown/` are **not scanned by anything**.

---

## Active exceptions

| GHSA | Package | Severity | Path | Fix available | Why deferred | Review by |
|---|---|---|---|---|---|---|
| `GHSA-gpj5-g38j-94v9` (CVE-2026-39356) | `drizzle-orm` | high | **direct dependency** of `packages/{db,config,credits}` (`^0.44.0`, installed 0.44.7) | `>=0.45.2` | A **minor bump of the ORM the money path runs on.** It deserves its own change with its own full gate run — including the real-Postgres concurrency suites that prove the ledger's money invariants — not a blind bump appended to an unrelated remediation. **This is the one that matters most.** Scheduled as audit-remediation Phase 9 (P9-R9), the last money-touching change of that programme, which removes this row. | 2026-11-05 |
| `GHSA-6g55-p6wh-862q` (CVE-2026-45623) | `postcss` | high | transitive: `next > postcss` | `>=8.5.12` | `next@15.5.24` declares `postcss` as exactly `8.4.31`, so an `overrides` entry would force a version outside the range the framework declares — not taken here. Phase 9 (P9-R9) decides between that override and a recorded acceptance. | 2026-11-05 |
| `GHSA-r28c-9q8g-f849` (CVE-2026-73646) | `postcss` | high | transitive: `next > postcss` | `>=8.5.18` | As above. | 2026-11-05 |

**Owner:** respin-engineer.
**Review trigger (re-dated 2026-10-05, R-155):** whichever comes first — audit-remediation Phase 9's `drizzle-orm` bump landing, the first production deploy, or the **Review by** date in each row. The `drizzle-orm` row is removed by that bump, not re-dated again.

**How to retire an entry:** upgrade, re-run `pnpm -C respin audit --audit-level
high --prod` (and without `--prod` for the dev tree), confirm the advisory is
gone, then delete BOTH the row here and the id from `package.json`. Deleting
only the id makes the build red; deleting only the row makes the exception
invisible — and since 2026-10-05 also makes `tests/journeys-workflow-triggers.
test.ts` red.

---

## The missed trigger, recorded as missed (2026-10-05)

The baseline below was written on 2026-08-17 with the review trigger **"before
the first production deploy, or M2 entry"**, and the sentence **"the
`drizzle-orm` row should not survive to a second review."** M2 was entered on
**2026-08-19** (`docs/initial/decisions.md` R-29, "M2 entry, 2026-08-19"). **The
trigger fired then and nothing happened:** no review, no bump, no re-date, for
seven weeks, while CI stayed green *by exception, not by remediation*. It was
found by the 2026-10-05 audit (register item 13), not by any control.

This is recorded as a miss rather than silently re-dated. What changed so it
cannot recur the same way: the trigger is now a **date per row** that a test
reads, the workflow that runs that test runs on a **daily schedule**, and the
workflow's blocking audit step runs **`if: ${{ !cancelled() }}`** (after any red step, not on a cancelled run). The `drizzle-orm` bump
itself was **not** pulled forward: it must remain the last money-touching change
of the remediation programme, so its gate re-runs nothing (master plan,
execution order). That is a decision to wait, with a date on it, not a trigger
left to lapse.

---

## Found open and fixed the same day (2026-10-05, audit-remediation Phase 9a)

Measured with `pnpm -C respin audit --audit-level high --prod --json` and the
same without `--prod` on 2026-10-05: both blocking audits were **red**, on six
advisories none of which was excepted. Under the owner's 2026-10-05 delegation
("take the most complete path") each was **fixed, not excepted** — every fix
version taken from the advisory data, and every override inside the range its
parent declares (checked against the installed parents' manifests):

| GHSA | Package | Severity | Scope | Was | Now | How |
|---|---|---|---|---|---|---|
| `GHSA-p293-qw3h-jr36` | `next` | critical | prod | 15.5.23 | 15.5.24 | exact pin in `package.json` and `packages/auth/package.json`, plus `overrides.next` so `better-auth`'s auto-installed peer resolves the same single copy |
| `GHSA-2xp9-vwfh-vxw4` | `next` | critical | prod | 15.5.23 | 15.5.24 | as above |
| `GHSA-rgj7-g3m4-5g8c` | `sharp` | high | prod | 0.34.5 | 0.35.5 | `"sharp@<0.35.4": "^0.35.4"`; `next@15.5.24` declares `^0.34.3 \|\| ^0.35.3` |
| `GHSA-2883-xcg3-v3hh` | `js-yaml` | high | dev | 4.3.1 | 4.3.2 | `"js-yaml@>=4.0.0 <4.3.2": "^4.3.2"`; `@eslint/eslintrc` declares `^4.3.0` |
| `GHSA-qhr7-859c-m2p7` | `brace-expansion` | high | dev | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | two overrides; `minimatch@3` declares `^1.1.7`, `minimatch@10` `^5.0.8` |
| `GHSA-6j4f-fj2g-mc7p` | `brace-expansion` | high | dev | as above | as above | as above |

**Retired the same day:** `GHSA-f88m-g3jw-g9cj` (`sharp`, fixed `>=0.35.0`) —
`sharp` 0.35.5 clears it. Its id was removed from `ignoreGhsas` and both audits
re-run: still exit 0, so the exception was no longer doing anything.

After the fix: `pnpm audit --audit-level high --prod` and the dev-scope
`pnpm -C respin audit --audit-level high` both exit 0, with three highs ignored
— exactly the three Active rows above — and no critical.

---

## Baseline recorded 2026-08-17 (audit remediation R3, finding #18) — history

These four were **already present** when dependency scanning was first switched
on. They were not introduced by the remediation — the remediation is what made
them visible, which is the whole point of finding #18. They were recorded as a
baseline so the gate could start catching *new* advisories immediately, instead
of the scan being deferred until an upgrade programme finishes. Three of them
are still rows in **Active exceptions** above; the fourth, `sharp`'s
`GHSA-f88m-g3jw-g9cj`, was retired on 2026-10-05 (see *Found open and fixed the
same day*).

**This baseline is a deferral, not a dismissal.** None of these is "accepted
risk" — each is an upgrade someone has to do.

Three **moderate** advisories (`esbuild` via `drizzle-kit`, and two more
`postcss`) were also outstanding on 2026-08-17. They are **not** listed above
and **not** ignored — they do not gate the build at the `high` threshold, and
the non-blocking "full report" step prints them on every run so they stay
visible.

**Original review trigger (2026-08-17):** "whichever comes first — before the
first production deploy, or M2 entry. The `drizzle-orm` row should not survive
to a second review." **Missed** — see above.
