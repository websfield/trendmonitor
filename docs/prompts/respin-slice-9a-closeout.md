# Respin Slice 9a — Close-Out

## Role

You are the engineer closing out slice 9a of the respin-finish build. Slice 9a is
**"log a result, see an honest comparison."** Two full reviewer rounds are already
spent. Your job is **not** to improve this slice — it is to *finish verifying it,
report it honestly, and walk it once in a browser.*

## Context & Stakes

Round 1 of this slice's gate found a BLOCK that meant **the slice did not work at
all**: `metric.key` is `serverOwned`, `parseBrainContent` strips it before storage,
so `declaredMetricOf` returned `null` for *every* profile — `/results` showed
`no_declared_metric` to every creator and `recordResult` refused every submission.
**4,176 green tests could not see it**, because both results suites hand-built the
`brain_docs` fixture and never met the real producer. That is CLAUDE.md's slice-8c
lesson, reproduced *inside the slice whose contract exists to prevent it.*

So the failure state here is specific and has already happened once: **code that is
correct with evidence that is vacuous.** This session alone found four "housekeeping"
lint errors that were all real defects, and a mutation that survived 49 tests.

The second risk is newer. The convergence stop-rule **fired**: 8 of round 2's 11
CHANGEs were copy and comments that the *round-1 fix pass itself* introduced.
Structural cause: **copy makes claims about mechanism, and nothing binds copy to
behaviour.** The two-round cap is spent. The owner authorised **ONE FINAL FIX PASS
that ships UNREVIEWED** — so every additional edit you make is an edit no reviewer
will ever see. Treat edit count as a cost, not a virtue.

---

## Standing Orders (these outrank any instinct below)

1. **No git actions** — no add, commit, branch, stash, checkout, reset, clean —
   unless the owner asks in this session. Everything is uncommitted at HEAD
   `cc3ed43` and stays that way.
2. **Ask before spawning reviewers.** Gate intensity is `lean`, but both money and
   both tenancy paths are `Full gates? yes`. Do not spawn any reviewer agent
   without asking first.
3. **Ask before spending vendor money**, and state the expected cost when you ask.
4. **Read CLAUDE.md's Lessons section before writing any guard or test.**
5. **Verify every path before trusting it.** The state below is a handoff note, not
   a source of truth. Paths in this document are unverified — confirm each exists
   before you rely on it, and say so if one does not.

---

## Phase 0 — Read & Absorb

Read in this order. Do not edit anything during Phase 0.

| # | File | Depth | Focus question |
|---|------|-------|----------------|
| 1 | `docs/plans/respin-finish-phase-9a.md` | **Deep** | Read **THE PINNED CONTRACT first, then all SEVEN Contract amendments.** Which decisions are deliberate? Several read as drift without the amendments — list them for yourself before you touch code. |
| 2 | `CLAUDE.md` (Lessons + Non-negotiables) | **Deep** | What does the slice-8c lesson say about fixtures that never meet the real producer? What does the 2026-09-04 lesson say about line endings and vacuous harnesses? |
| 3 | `docs/progress/respin-finish/9a-review-manifest.md` | **Deep** | The 55-file surface of this slice. Note the header: its **first version was corrupted** — a timed-out `find` was still writing to it, and a reviewer caught it. Does the current version look complete and internally consistent? |
| 4 | `docs/initial/decisions.md` — R-104, R-112, R-113, R-114 | Targeted | R-104 split slice 9 into 9a + 9b on the master plan's own F-6 argument. What exactly is 9a's scope boundary vs 9b's? |
| 5 | `docs/plans/respin-finish-master-plan.md` (9a row + F-6) | Skim | What does the 9a row currently claim, and what must it say after this session? |
| 6 | `docs/progress/respin-finish-open-items.md` | Skim | Which of the residuals below are already recorded here, and which need adding? |
| 7 | Slice-7 and slice-8c cards in `docs/progress/respin-finish/` | Skim for shape | What is the precedent format for an **ALMOST** card that separates engineering completion from evidence completion? |

**Why `git diff` is useless here:** `packages/brain`, `packages/modes`, and
`packages/trends` are **untracked**, so `git diff` cannot see them — and what it
*can* see also includes slices 8 and 8c. Use the manifest as the review surface,
not git.

**Scope note for later:** 9b owns the proposal machinery, and 9b's `/usage` edit is
what fires registered finding **8c-W2**. Nothing in 9b is yours this session.

---

## Phase 1 — Verify the two in-flight edits landed

The last session paused mid-flight. **Builder C's 8 edits are DONE and verified
green — do not revisit them.** Two remain unconfirmed. For each: read the file,
determine whether the edit landed, and complete it if not.

### Builder A
- **A1** — `metricKeyFromLabel`'s docblock still says **"DERIVED, NEVER STORED"**.
  Add **one sentence** stating that its past outputs live in `results.metric_key`
  and `results.treatment_key`, so **changing this function is a DATA MIGRATION.**
- **A2** — Remove the literal Python artifacts `""" + D + """` from the comments in
  `profile-scope.test.ts`.

### Builder B
- **B1** — `tests/import-boundary.test.ts` asserts a stale count: **"EIGHT names,
  and no more."** The surface now carries **ELEVEN**. Retire the stale count.
- **B2** — Add ALLOW fixtures for `ComparisonStratumError`, `ComparisonInputError`,
  and `RESULT_NOTE_MAX`.

### The scope fence — read this before you edit anything

**This is a CLOSED SET.** A1, A2, B1, B2 is the complete list of code edits
authorised for this session. Nothing else. Specifically:

- **Do NOT fix any item in the Residual Register.** Every one is recorded and
  non-blocking, and the owner deliberately chose not to build the real fixes on an
  unreviewed pass. Fixing one here means shipping an ungated change to close a
  known, accepted gap — a strictly worse trade.
- **Do NOT refactor, rename, extract, generalise, or "tidy while I'm in here."**
- **Do NOT add abstraction for a second caller that does not exist.**
- **Do NOT rewrite copy.** Copy churn is exactly what fired the stop-rule.
- If you find a **new** defect, **stop and report it to the owner** with file:line
  and the failure it causes. Do not fix it silently. A new BLOCK-class defect
  changes the card's verdict and that is the owner's call, not yours.

### Editing discipline (these prevent the specific failures this build keeps hitting)

- **Assert anchor counts BEFORE writing.** `app-server.ts` and `errors.ts` are
  uniform **CRLF**; most other files are **LF**. An anchor with the wrong line
  ending silently matches zero times, and an edit that rewrites line endings is
  **invisible to git** under `core.autocrlf=true` while breaking every guard that
  matches a multi-line source literal.
- **Read before you write.** Never edit a file you have not read this session.
- **Match the file's existing conventions** — its comment density, naming, and
  idiom — over your own preferences.
- **B1 is a count, not a cap.** Retire the *stale number*; do not weaken what the
  guard proves. A guard that scans and finds nothing is indistinguishable from a
  guard that is broken.
- **A1 is a claim about stored data.** Verify against the schema that
  `results.metric_key` and `results.treatment_key` exist and are populated by this
  function's output *in the same action that you write the sentence.* A recorded
  claim is verified against the file it names, or it is not recorded.

**Exit condition for Phase 1:** all four edits confirmed present in the files, with
the anchor/line-ending check stated. Report each as LANDED-ALREADY, LANDED-NOW, or
BLOCKED.

---

## Phase 2 — The full CI-shape gate

```bash
docker compose -f respin/docker-compose.yml up -d
```

Then run, in order, each as its own command:

| # | Command |
|---|---------|
| 1 | `pnpm -C respin typecheck` |
| 2 | `pnpm -C respin worker:typecheck` |
| 3 | `pnpm -C respin lint` |
| 4 | `pnpm -C respin db:check` |
| 5 | `TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin pnpm -C respin test` |
| 6 | `pnpm -C respin build` |

### Exit-code discipline — this is the point of Phase 2

**CAPTURE THE EXIT CODE. Do not read the summary line.** One run this session
reported **"4176 passed" over a NON-ZERO exit** — registered as **9a-G1**.

- After each command, capture and report `$?` explicitly.
- **Never pipe a gate through `tail`** — it hides the exit code and the Errors line.
- Report the exit code as the verdict. The summary line is corroborating detail, not
  evidence.

**On a non-zero exit with all tests passing:** that is 9a-G1, and its cause is
**already diagnosed** — birpc's hard 60s `onTaskUpdate` timeout, with PGlite WASM
blocking the worker. 9a's own contribution was removed; the cause is **repo-wide**,
and the worst leakers are the money suites (45 `createTestDb` sites / 0 closes).
**Do not fix this.** Record the exit code, name it as 9a-G1, and move on.

**On any other failure:** stop and report. Do not fix beyond the closed set without
asking.

### Environment traps

- **Use the session scratchpad, never `/tmp`** — `/tmp` is shared with other
  projects' sessions on this machine, and a `head` there once returned another
  repo's vitest output.
- If `pnpm install` is unavoidable, it wants to **DELETE `node_modules`**
  (`virtualStoreDir` is `.pnpm-copy` from the slice-8 restore). Use
  `--config.virtual-store-dir=node_modules/.pnpm-copy`. **Never `CI=true`.**
- **"It imports" proves nothing in this workspace** — `hoistPattern '*'` means any
  package resolves from anywhere. Prove a dependency by the **scoped symlink** and
  the **lockfile importer entry**.

---

## Phase 3 — Deliverable: the slice card

Write **`docs/progress/respin-finish/respin-finish-slice-9a-card.md`** at verdict
**ALMOST** — engineering complete, evidence incomplete. These are **separate
claims** (the slice-7 / 8c precedent). Match those cards' structure.

The card **must** state all of the following. A card missing any one of them is not
done:

| # | Required content |
|---|---|
| 1 | **The final fix pass shipped UNREVIEWED**, labelled as such, with the owner's authorisation named |
| 2 | **The convergence observation** — 8 of round 2's 11 CHANGEs were copy/comments the round-1 fix pass introduced; structural cause: copy claims mechanism and nothing binds copy to behaviour |
| 3 | **Reviewer spend** — 8 agents over 2 rounds (round 1: 1 BLOCK / 12 CHANGE / 17 NOTE; round 2: 0 BLOCK / 11 CHANGE / 19 NOTE) |
| 4 | **The round-1 BLOCK and its closure** — what it was, why 4,176 green tests missed it, the `metricKeyFromLabel` + faithful-metric-fixture + end-to-end-test fix, that planting the old code back reddens six tests including the previously-passing hand-built ones, and that tenancy VERIFIED the closure by running the end-to-end test itself |
| 5 | **Every residual below, verbatim in substance**, each marked recorded / non-blocking |
| 6 | **The gate result with its exit code**, honestly reported |
| 7 | **The walk result** (fill in after Phase 5) |

**Voice:** plain, specific, and unflattering. State what is unproven as unproven. No
hedging on things that are done, no softening of things that are not. "Done" is a
claim the checks have to back.

---

## Phase 4 — Update the tracking docs

1. **`docs/plans/respin-finish-master-plan.md`** — update the 9a row to ALMOST with
   a pointer to the card.
2. **`docs/progress/respin-finish-open-items.md`** — add every residual not already
   there. This file is the status source; a residual recorded only on the card is
   invisible to the next session.

Consistency rule: the master plan row, the open-items entries, and the card must not
disagree with each other. If they do after your edit, one of them is wrong.

---

## Phase 5 — The walk

**Owner-approved at ~USD 0.10–0.25. Confirm before spending.**

Cost shape: **logging a result calls NO model.** The only vendor cost is **1–2
generations** to create outputs worth logging a result against.

This is the **first walk of a path that a green suite already claimed worked once
and did not.** Treat the browser as the authority and the suite as a hypothesis.

Walk it as a creator would:

| # | Step | What you are actually checking |
|---|---|---|
| 1 | Generate 1–2 outputs | The vendor path works and produces something loggable |
| 2 | Open `/results` | Does a **declared metric** appear — or `no_declared_metric`? This is the exact screen the round-1 BLOCK broke. |
| 3 | Log a result | Does `recordResult` **accept** the submission? |
| 4 | Read the comparison | Is it **honest** — does it name its own weakest point, its denominator, and its n? |
| 5 | Read the card copy against the card behaviour | The confounder paragraph and the truncated branch can still contradict each other on one card. **Look for it.** If you see it, record it — do not fix it. |

**UI/UX honesty checks while you are there** (record findings, fix nothing):
- Does any screen print a **slug** where the creator's own words should be?
  (`DeclaredMetric` carries no label — expect the slug.)
- Does every empty, refused, or below-minimum-n state say **why**, in the creator's
  language, with a way forward? A refusal with no route forward is an outage.
- Does any number appear without its denominator or its verification status?

Record the walk in the card as evidence, with what you saw — not with what you
expected to see.

---

## Residual Register — all recorded, none blocking

Carry every one into the card and open-items. **Fix none of them.**

| ID | Residual |
|---|---|
| — | The **confounder paragraph and the truncated branch** can still contradict each other on one card. Builder C closed the sentence, not the class. The real fix is a test that renders a truncated card and reads BOTH blocks — deliberately not built on an unreviewed pass. |
| **R-112** | The performance log is **UNGATED** against PRD §4G's "View only" for Free. Recorded deviation; owner decision — first tier gate on a Results capability. |
| **R-113** | **Any** strategy edit splits a creator's metric history, even when the metric declaration is byte-identical. Decide in 9b. |
| **R-114** | The slug rule is a **STORED-DATA FORMAT**, and every non-Latin label collapses to the literal `"metric"`. Not reachable today (verified). Trigger: the first cross-profile reader of `metric_key` — which must key on `(profile_id, metric_key)`. |
| **9a-G1** | Intermittent non-zero exit with all tests passing. Cause diagnosed (birpc 60s `onTaskUpdate` timeout; PGlite WASM blocking the worker). 9a's contribution removed; cause is repo-wide, worst leakers are the money suites (45 `createTestDb` sites / 0 closes). |
| — | `MIN_COMPARABLE_RESULTS` cites the phase card, not PRD **REQ-F03**'s "default 3". |
| — | The narrow-read pin's population is **one file**; **three** can reach `brainDocsByKind`. (CLAUDE.md's 2026-08-29 lesson: a population written as one path narrows silently.) |
| — | `credit_ledger` is absent from `tests/table-writers.test.ts`'s TABLES map. |
| — | `maxLength` counts **UTF-16 code units**; the server refuses at **2,001 code points**. |
| — | `DeclaredMetric` carries no label, so the screen prints the **slug**, not the creator's words. |

---

## Traps already hit this session — do not rediscover

1. **`/tmp` is shared** with other projects' sessions. Use the session scratchpad.
2. **Edit anchors must match the file's line endings.** `app-server.ts` and
   `errors.ts` are uniform CRLF; most else is LF. Assert anchor counts before writing.
3. **Never pipe a gate through `tail`** — it hides the exit code and the Errors line.
4. **"It imports" proves nothing** — `hoistPattern '*'`. Prove a dependency by the
   scoped symlink and the lockfile importer entry.
5. **`pnpm install` wants to delete `node_modules`.** Use
   `--config.virtual-store-dir=node_modules/.pnpm-copy`. Never `CI=true`.
6. **App-level tests CANNOT import `@respin/brain`**, so `respin/tests/`
   *structurally* cannot meet the real producer. Any test that must meet it belongs
   in `packages/db`. (This is what made the round-1 BLOCK invisible.)

---

## Success Criteria

Verify each before you report done:

1. The pinned contract and **all seven** amendments were read before any edit, and
   you can name which apparent drift each amendment authorises.
2. All four in-flight edits (A1, A2, B1, B2) are confirmed present, each reported as
   LANDED-ALREADY / LANDED-NOW / BLOCKED, with the anchor and line-ending check stated.
3. **Zero code edits outside the closed set.** If you made one, it is named
   explicitly at the top of your report with its justification.
4. Every gate command's **exit code** is captured and reported individually. No
   verdict rests on a summary line.
5. The card exists at ALMOST and contains all **seven** required elements from the
   Phase 3 table.
6. The master plan 9a row, open-items, and the card agree with each other.
7. The walk was cost-confirmed before spending, ran end-to-end, and its **observed**
   result — not its expected result — is recorded in the card.
8. Nothing in this report claims verification that did not happen. A skipped step is
   reported as skipped.

---

## Constraints — must NOT

- **Must NOT** run any git command that writes (add/commit/branch/stash/checkout/
  reset/clean).
- **Must NOT** edit code outside A1, A2, B1, B2 without stopping to ask.
- **Must NOT** fix any Residual Register item.
- **Must NOT** spawn a reviewer agent without asking.
- **Must NOT** spend vendor money without confirming the expected cost first.
- **Must NOT** report a green gate on the basis of a summary line.
- **Must NOT** add abstraction, generalisation, or "future-proofing" for a caller
  that does not exist — and equally, must not *weaken* a guard to make it pass.
  Neither over-engineer nor under-engineer: make the change the contract names, at
  the size the contract names it.
- **Must NOT** write a comment or a line of copy that claims behaviour no test
  asserts. That is the exact structural cause the stop-rule identified — a claim
  about mechanism with nothing binding it to behaviour. If you want to make the
  claim, assert it in a test; otherwise do not make it.

## Final self-review

Before reporting, re-read your output against the Success Criteria above. Then
answer one question in writing: **"Which claim in my report is the weakest, and what
would prove it?"** Put that answer in the report.

**Estimated session time:** ~60–90 minutes, of which the gate run is the long pole.
