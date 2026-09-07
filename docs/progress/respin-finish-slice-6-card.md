# Slice 6 — First generation · report card

**Readiness: Almost** — not Ready, and the reason is one line: **the acceptance walk has not been run.**
The card's own "A creator can…" sentence is *"Generate a set of hooks from their own coherent brain, see
them kill-tested, and see one atomically settled credit debit"*, walked in a browser **on Free, against the
real vendor**. That has not happened. Engineering completion and evidence completion are separate claims
(build-plan, REQ-I04), and this card asserts only the first.

**Date:** 2026-09-01 · **Plan:** [`respin-finish-phase-6.md`](../plans/respin-finish-phase-6.md) ·
**Ledger:** [`respin-finish/ledger.md`](respin-finish/ledger.md) (slice 6 section) ·
**Decisions:** `decisions.md` **R-63 … R-70**

**Deferred vendor-walk instructions:** [`respin-vendor-acceptance-walks.md`](../runbooks/respin-vendor-acceptance-walks.md), §5.

---

## Report card

| Row | Result |
|---|---|
| **Entry gate** | **PASS** — typecheck 0, `eslint .` 0, `db:generate` "No schema changes, nothing to migrate", `next build` compiled, **104 files / 2420 tests / 0 failed / 0 skipped, exit 0** (CI shape, Docker live). Evidence `entry-gate-slice-6-final-rerun.txt`. **One flaky failure is reported rather than hidden** — see *Gate honesty* below. |
| **Respin billing & credits** (Full) | round 1 NEEDS CHANGES (5 CHANGE) → round 2 NEEDS CHANGES (4 CHANGE, all 5 round-1 findings verified fixed on the production path) → **fixed without re-review** |
| **Respin brain tenancy** (Full) | round 1 NEEDS CHANGES (3 CHANGE) → round 2 NEEDS CHANGES (3 CHANGE, all 3 round-1 findings verified fixed) → **fixed without re-review** |
| **Respin spin compliance** | round 1 **BLOCK** → round 2 **BLOCK** (a *different* one, created by the round-1 fix; all 8 round-1 findings verified fixed) → **fixed without re-review** |
| **Respin learning honesty** | round 1 NEEDS CHANGES (5 CHANGE) → round 2 NEEDS CHANGES (4 CHANGE, 4 of 5 round-1 findings fixed) → **fixed without re-review** |
| **Acceptance** | **NOT MET.** The Free-tier browser walk against the real vendor was not run. Every requirement R1–R21 has a named witness; the walk is the one acceptance criterion with none. |
| **Least-confident probes** | 5 declared, all handed to reviewers and probed. **Two were retired by measurement** (the exactly-once property does not rest on the unproven interleaving; `nonTerminalClaim`'s reporting was judged correct by two gates independently). **Three held and became findings.** |
| **Definition of Done** | Entry gate ✅ · all four Critical-Path gates run ✅ · docs updated in the same change ✅ (R-63…R-70, register, ledger) · **acceptance walk ❌** · reachability ✅ (`/studio` reaches it) |
| **Reviewer spend** | **8 reviewer agents** (4 round 1 + 4 round 2). Build/fix: 6 build stages + 7 fix agents. **21 agents total.** |
| **Gate intensity** | `lean` is configured; **run at full instead.** Billing and tenancy are `Full gates?: yes` and keep their own reviewers regardless; compliance and learning honesty were run as **separate specialists rather than lean-merged** — see *Why full* below. |
| **Rounds** | **2, the bound.** Round 2's findings were fixed and shipped in the same change and are recorded here as residuals. **No third round was run**, on the owner's explicit call. |
| **Deferred findings** | N/A — this is a build lane; every confirmed finding was fixed here. |

---

## Gate honesty

The first final run reported **1 failed / 2419 passed**: `packages/credits/tests/setup.test.ts`'s
*"with NEITHER env var set"*, a subprocess test with a 60-second timeout, on a run whose `transform` phase
took **335s against 138s** on the previous run. In isolation that file passes 9/9 in 23s, exit 0; the full
suite re-run is **104/104 files, 2420/2420 tests, exit 0**. It is therefore recorded as a **flaky timeout
under load**, which is the slice-5 residual *"the full-suite timeout instability on this machine is
unexplained"* resurfacing — not a defect this slice introduced, and not something a green re-run makes
disappear.

**A second gate-honesty event is worth more than the first.** An earlier run reported
`Test Files 104 passed · Tests 2352 passed · **Errors 2**` and exited non-zero — **every assertion passing
while the process failed**. It was an unhandled rejection, not the reporter flake it resembled:
`generation-schema.docker.test.ts`'s `raceOneKey` held a bare `c2.query(...)` promise and did not await it
until after `await c1.query("COMMIT")` — and that COMMIT is exactly what releases the lock and lets c2's
insert conflict. The promise rejected with **no handler attached**; the later `await` caught it, so the
tests passed. Fixed by settling into a tagged value in the same expression that creates the promise.
**Reading "all tests passed" and moving on would have shipped it.**

---

## What shipped

`packages/modes` (the pure pipeline: `ScriptOutput` designed for all seven modes, four deterministic hard
kill-test rules, the traceability scan, a fifth `forbidden_claim` rule, the one-rewrite bound) ·
`generations` + `generation_attempts` with migrations **0020** and **0021** · `packages/credits/generate.ts`
(cage → gates → durable claim → metered calls → one workspace-locked settlement) · `mode-access.ts`'s
tier→mode map · the lazy Free mint · `burnByMode` · `/studio` · `/usage`'s by-mode split.

**All of R1–R21 have named witnesses**, and R14c is met **as written** rather than deviated from: the build
stopped at the missing durable candidate and escalated rather than writing it off, because without it a
crash between the vendor answering and settlement means we paid the vendor, the creator gets nothing, and
validated output we already hold is discarded.

**Scale:** 154 changed/new paths, 59 of them new files. Test count **1763 → 2420 (+657)**.

---

## What the gates actually caught — and how

Three of the four reviewers reached their findings by **executing the code**, not reading it, and that is
where every serious finding came from.

- **Round 1's BLOCK:** the `[check]` exemption was scoped to the whole **sentence**, so one marker exempted
  every specific in it. The reviewer ran the real pipeline and put **four invented specifics** — `$4,000`,
  `11`, `3`, `2019` — onto a draft returned `usable` with `hardRules: []`. The prompt *instructs* the model
  to write that token. 2,199 green tests did not see it, because the only witness covered a marker attached
  to the *sole* specific in a sentence.
- **Round 2's BLOCK:** the fifth rule added to fix round 1 was **inert on `/disclosure/`, the only field its
  concealment half will ever land on** — so *"Most people skip the label on a short like this, and nobody
  needs to know a tool helped."* shipped under the product's own **Disclosure** heading. REQ-I05 is a
  release gate. And `claims.test.ts` carried a case **titled** *"a CONCEALMENT line keeps its full strength
  wherever it lands"* whose body asserted `flag` — a test named for the property, pinning its absence.
- **R21's replacement guards:** the learning reviewer rebuilt the harness and ran a **lying screen** through
  it — **7 of 8 assertions passed** a screen with empty hooks, a label-only weakest point, an empty verdict
  and a balance-free charge line. The spin-compliance reviewer had judged the same guards "strong, not
  decorative — I could not weaken it **by inspection**." **Executed evidence beat inspection**, and that
  disagreement is the single strongest argument in this slice for not lean-merging those two paths.
- **An honest listicle was refused and debited:** *"The 5 mistakes that make batch cooking taste like
  leftovers"* → `refused, drafts: 2`. A Free creator paying 1 of 25 monthly credits for a script that was
  fine.

---

## Why full intensity, and why the card's worktree instruction was not followed

**Two deliberate deviations, both recorded before the fact.**

1. **Reviewers ran on the MAIN TREE, not in isolated worktrees** as the card's "Done when" specifies.
   Nothing in slices 1–6 is committed to this branch, so a worktree reviews `HEAD` — code that predates the
   entire slice. Slices 3 and 2b-c both hit this and took the same deviation.
2. **`Gate intensity: lean` would have merged spin compliance and learning honesty into one run.** They were
   run as separate specialists instead, which **exceeds** the lean bar rather than thinning it. The result
   vindicated it: those two produced the BLOCK and the R21 disproof respectively, **and disagreed with each
   other** about whether R21's guards were sound. A merged run renders one verdict per path and would not
   have surfaced two independent readings, one of which was wrong.

---

## Residuals — fixed without re-review, and open items

Round 2's 1 BLOCK and 14 CHANGEs were **all fixed** in a final pass and shipped in this change. **Eleven of
the fourteen were defects round 1's own fixes introduced** — the convergence stop-rule's own trigger, named
rather than absorbed, and the reason no third round was run.

**Open, with owners:**

1. **The acceptance walk on Free against the real vendor.** The one thing between Almost and Ready.
2. **M3's evidence criterion** (10 real generations logged in `docs/progress/m3-quality.md`) — a separate
   claim this slice explicitly does not assert.
3. **The stranded `vendor_complete` orphan** — unreachable, unswept, invisible to operators, and uncounted
   by R16's bound. Both billing and tenancy ruled independently that **narrowing the warrant is sufficient**
   and the orphan is not itself a finding; the sweeper needs a background runner (R-52's pg-boss) that is
   not wired. Revisit trigger in R-67.
4. **The claims vocabulary is a known-incomplete recall aid** (owner decision, R-69). "No finding" means "no
   listed string matched". Revisit trigger: a measured claim reaching a creator through an unlisted class —
   the signal to change the **mechanism**, not to add another string.
5. **The exposure derivation's call count has no witness** — the `2 ×` and `+ 1 Haiku` in the corrected
   `$1.40` figure are literals read out of `pipeline.ts`. A later slice adding a vendor call would silently
   understate it again.
6. **`.codebase-map/` holds stale `activateVoice` descriptors** — `/update-map` territory.
7. **`markdown` export carries no generation history**; its scope statement was made true instead, guarded
   by a plant-checked scan so it goes red rather than stale.

---

## Two records of mine that the gates measured false

Both are the same failure: **a claim verified in one dimension and not in the one that mattered.**

- **R-65's "provably transient"** was checked against the CHECK constraint and not against the lifecycle.
  Nothing bounds how long a row sits in `vendor_complete`. Corrected in **R-67**.
- **R-68's closing sentence** — *"a forecast built from one of those nouns is still refused"* — had its line
  citations re-read and its **behaviour never run**. It returned `flag`. Corrected in **R-69**, and it is
  true now only because that round added the shape that makes it so.

Learning from exactly that, **every behavioural claim in R-69 was run before it was written**: nine
sentences through the real `scanOutputClaims`, all nine matching what the entry asserts.

---

## The defect this slice kept re-learning

**Literal control bytes in source, four times, by four different agents** — a `\b` eaten by a heredoc,
turning a guard's regex into one that matches nothing while passing everything. Twice the author caught it,
once a lint did, once it only surfaced in a byte-level sweep. **The first version of that sweep was itself
fail-open** (`grep -P` under `LC_ALL=C`, which errors in this environment and printed nothing). It now
plants a `\x01`, asserts it detects it, and only then sweeps — final result **276 files, 1 hit**, that hit
being `safe-log.test.ts`'s deliberate NUL/ESC hostile fixtures.

---

## Verification steps from the card

| # | Step | State |
|---|---|---|
| 1 | Entry gate, Docker live, zero skips | ✅ |
| 2 | **Free browser walk against the real vendor** | ❌ **not run** |
| 3 | First balance read mints 25; second mints nothing | ✅ |
| 4 | Two concurrent first reads mint one grant (real Postgres) | ✅ by name, plus a dropped-index measurement |
| 5 | Balance read inside a Stripe webhook transaction | ✅ against the real `handleStripeEvent` |
| 6 | M3's four planted kill-test violations | ✅ both halves (caught-and-rewritten, and honestly failed) |
| 7 | Rewrite also fails → refusal stored and debited | ✅ |
| 8 | Truncated reply → usage row, no debit, bounded repeat | ✅ |
| 9 | Zero balance → refused before the vendor | ✅ provider throws if reached |
| 10 | Free attempting a paid mode | ✅ — and the card names `fullScript`, which is **not a `ModeId`**; the real tier-map case is `ideaToScript` |
| 11 | Untraceable number flagged, `[check]` offered, not deleted | ✅ |
| 12 | Export a brain after generating | ✅ |
| 13 | Concurrent + retried attempt → one vendor sequence, one debit | ✅ real Postgres |
| 14 | Crash between usage commit and settlement | ✅ both branches |
| 15 | Balance drops after vendor completion | ✅ atomic refusal |
| 16 | `/usage` by-mode, correct period, not from the rollup | ✅ M13 proven by planting |
