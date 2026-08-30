# Respin Finish Plans — Gap Audit and Amendment

> **Executor:** Claude Code, in this repo, with edit rights over `docs/plans/**` and `docs/progress/**` only.
> **Audience of the output:** the developer who will build slices 1–10, and the owner who has to answer the decision rows.
> **Estimated session time:** 2.5–3.5 hours. Natural split point: after Phase 3 (audit complete, nothing amended yet).

---

## Context

You are the planning lead for **Respin**, inheriting a plan set written in reaction to a failure that cost 8 days against a 1–2 session budget.

**The failure being corrected:** M2b-1 shipped 3,062 lines of source and 2,236 lines of tests through **11 gate rounds and ~80 blocks, with zero product callers and zero user-reachable routes**. Nothing built could be reached even in principle — no product code can create a `creator_profile`, and `app/**` is denied `writeCapabilities`. Adversarial review of an unconsumed substrate produced findings faster than anyone closed them, with no shipped behaviour to calibrate severity against.

**The opposite failure, equally real:** the plan document for that same milestone ran to **489 lines · 52 tasks · 39 decisions · 82 ACs · 59 mutations**, and got *reviewed* instead of *built*. `respin-finish-master-plan.md` names this as the reason phase plans are now written just-in-time.

So this audit sits between two ditches. A plan that under-specifies sends the developer back to ask what "the facade" means. A plan that over-specifies becomes another artifact to review. **Your job is to find where the current plan set falls into either ditch, and fix it — without writing a third 489-line specification.**

**The second half of the job:** open items are scattered across at least six registers, and the owner's stated goal is *finish Respin, do not leave a trail of todos behind it*. Today an item can be open in `respin-m2b1-block-register.md`, restated as owed in `decisions.md`, ignored by the master plan, and invisible to the developer building the slice that makes it reachable. **Every open item must end this session with exactly one home: a named slice, or an explicit deferral with an owner and a reason.**

**What failure looks like here:** you produce a beautiful gap report, the developer opens slice 3's card and still has to ask three questions before writing a line, and six months from now someone finds G-11 still open in a register nobody reads.

---

## Phase 1: Read & Absorb

Read in tier order. Depth directives are binding — do not deep-read a document marked *skim*, and do not skim one marked *deep*.

### Tier 1 — The plans under audit (deep read, all four)

| # | File | Depth | Focus Question |
|---|------|-------|----------------|
| 1 | `docs/plans/respin-finish-master-plan.md` | deep | What is the slice contract, what does each slice promise a creator, and which decisions does it declare owed and by when? |
| 2 | `docs/plans/respin-finish-phase-1.md` | deep | This is the **reference density** for a slice card. Could a developer execute it without asking a question? Where does it dictate implementation instead of stating an invariant? |
| 3 | `docs/plans/respin-finish-phase-2.md` | deep | Same two questions. Also: which open register items does it claim to close, and is the claim complete? |
| 4 | `docs/progress/respin-finish-codebase-review.md` | deep | What is *built* vs *missing*, in dependency order? Which "missing" rows have no slice that builds them? |

### Tier 2 — The open-item sources (deep on status, skim the prose)

| # | File | Depth | Focus Question |
|---|------|-------|----------------|
| 5 | `docs/progress/respin-m2b1-block-register.md` | deep on §A (the OPEN list) and §C; skim the closed rounds | What are the 19 open items (B-1…B-11, G-10…G-17), what does each actually claim, and which Critical Path owns it? |
| 6 | `todos.md` (repo root) | deep | **Careful — this file is Cutdown/UGC-era, last updated 2026-08-10, and predates the Respin pivot.** For each row T-2…T-12, decide: does it bind Respin, bind the parked Cutdown line, or bind neither? Do not assume, and do not silently drop a row. |
| 7 | `docs/initial/decisions.md` | skim, then deep from R-30 onward | R-30's numbered list carries owed items (downgrade semantics, REQ-B02 per-field confirmation, the R-29 seed assertion, the `reference`-substring rule…). Which are still owed, and does any slice own them? |
| 8 | `docs/plans/respin-m2b1-brain-surface-plan.md` | **do not read — 102 KB.** Extract task rows only: `grep -nE "TODO\|PART" docs/plans/respin-m2b1-brain-surface-plan.md` | The master plan says its 26 TODO tasks are "re-homed into the slices below". Verify that claim — which of them actually appear in a slice, and which vanished? |
| 9 | in-code markers: `grep -rnE "TODO\|FIXME" respin --include=*.ts --include=*.tsx --include=*.sql \| grep -v node_modules` | mechanical | Are there in-code todos that no register knows about? |

### Tier 3 — The contract the plans must satisfy (skim with intent)

| # | File | Depth | Focus Question |
|---|------|-------|----------------|
| 10 | `docs/initial/build-plan.md` | deep (73 lines) | M2–M6 scope and exit criteria. Does the slice list cover every milestone obligation, or does something in M4/M5/M6 have no slice? |
| 11 | `docs/initial/tech-spec.md` | skim | Which structural commitments do the slices contradict — `packages/brain` vs `@respin/db`, background runner due at M4 entry, the provider adapter? |
| 12 | `docs/initial/PRD.md` | skim §4A–§4I and §5 | Which REQ ids are unclaimed by any slice? Pay attention to REQ-I03, REQ-A02, REQ-F. |
| 13 | `docs/plans/respin-m2b2-metered-inference-scope.md` | skim | Does slice 2 inherit everything this scope document settled, or did something drop on the way? |
| 14 | `CLAUDE.md` — Lessons, Definition of Done, Critical Path table | deep | Which lessons must appear as an actual requirement in a slice card (mutation populations, scanners failing open, typed-vs-cast)? Which gates does each slice trigger? |

Before leaving this phase, write to `<scratchpad>`: the registers where an open item can currently live, and the total item count you are about to reconcile.

---

## Phase 2: Build the Open-Item Inventory — verify, then dispose

**Verify-first discipline.** The block register itself records that "the plan's status column is stale in BOTH directions" (B-9). Do not carry an item forward because a document says it is open. **Open the code it names.** An item you cannot settle either way is `UNVERIFIED` — not open, not closed.

Work in `<analysis>` tags before writing each row:

```
<analysis>
Item: G-11
Claim: a trailing space mints a fresh 600-character quote budget.
Code checked: respin/packages/db/src/echo.ts — [what the identity key actually is, with line]
Verdict: ...
</analysis>
```

Then produce one row per item. Every item from every Tier 2 source gets a row — including the ones you judge out of scope.

| Field | Values / Rule |
|---|---|
| **ID** | The item's existing id (`G-11`, `B-4`, `T-8`, `R-30.6`, or `SRC-n` for an in-code marker) |
| **Verdict** | `OPEN-CONFIRMED` (verified still open, cite `file:line`) · `ALREADY-CLOSED` (cite the `file:line` that closes it) · `UNVERIFIED` (say what you would need) · `NOT-RESPIN` (belongs to Cutdown/UGC — say which) |
| **Reachable when** | The user-visible event that makes it exploitable or visible ("when a creator can paste a reference post"). `never` is a legitimate answer and forces the deferral columns |
| **Home** | Slice number, or `DEFER` |
| **If DEFER** | Owner (owner / operations / legal / engineering), the reason, and the trigger that reopens it. A deferral with no trigger is not a deferral, it is an abandonment |
| **Blast radius if it ships open** | One clause. This is what makes a slice-blocking item distinguishable from record debt |

**The rule that decides `Home`:** an item is homed in the **first slice that makes it reachable**, not the slice that is topically nearest. G-10/G-11/G-12 are the worked example — unreachable today, live the moment onboarding accepts a reference post, so they close in slice 4 or slice 4 does not ship.

---

## Phase 3: Audit the Plans Against These Lenses

Produce findings with `file:line` evidence. A lens with no findings gets one line saying so — do not manufacture a finding to fill a row.

| Lens | Question |
|------|----------|
| **Reachability** | Does every slice genuinely end in a path a creator walks, or does one of them (be specific) build substrate whose only caller is a test? Is the "A creator can…" sentence a real browser walk, or a claim? |
| **Coverage** | Take the codebase review's "what is missing" table and the build plan's M2–M6 obligations. Which rows are owned by **no** slice? Check each of: free-tier credit minting (DL-2/R-21), the `frameworks` seeder, REQ-I03, the margin dashboard, the retention receiver. |
| **Under-specification** | For each slice: what would the developer have to ask before starting? Name the actual question. Slice 1 defines "the app-server facade" — is the equivalent seam defined for slices 3–10, or assumed? |
| **Over-specification** | Where does a card dictate a function body, a variable name, or an implementation the developer should choose? Where does a requirement restate what a test would prove more cheaply? |
| **Sequencing** | Are the stated dependencies real? Is anything in slice N blocked by a decision owed at slice N+1? The background-runner decision is due at **M4 entry** — does the slice order honour that? |
| **Estimates** | Slices 1–10 total 60–80 hours against a build-plan budget of 1–2 sessions per milestone. Is the estimate honest, or is the build plan now wrong? Say which, plainly. |
| **Gate load** | Each slice triggers N Critical-Path gates. Which slice triggers the most, and is that slice small enough to survive a gate round? M2b-1's lesson is that gate cost scales with the size of the unshipped surface. |
| **Decision starvation** | The master plan owes four decisions. Are there owed decisions it does not list — from `decisions.md` R-30, from `todos.md`, from the tech-spec's M4-entry obligation? |
| **Honesty** | Does any card promise a capability the slice does not build (the B-6 shape: copy promising a results surface that does not exist)? |

---

## Phase 4: Produce the Deliverables

### The altitude contract — apply to every card you write or amend

This is the balance the plan set exists to hold. A slice card **specifies the contract and leaves the construction to the developer**.

**A card MUST state:**
- The single sentence a creator can walk, testable in a browser.
- Requirements as **invariants** ("the cap check is not a check-then-act race", "no prompt text in any log line") — the property plus how it is *proved*, never the mechanism that achieves it.
- The seam: which module owns the new capability, which entrypoint the app calls, what stays denied.
- Open items closing in this slice, by id.
- Verification steps, including the browser walk and the exact commands.
- Mutations to plant, **with a population note naming what the matrix does not cover** (CLAUDE.md, 2026-08-26).
- Prerequisites, including any owner decision — marked as a precondition of a specific *step*, not of the whole slice.

**A card MUST NOT:**
- Prescribe function bodies, SQL text, control flow, or names the developer can choose.
- Restate a requirement in three places (register, plan, code comment) — one home, referenced from the others.
- Treat the `Files` table as a contract. Label it *expected surface — deviate and say why in the ledger*.
- Exceed **~150 lines** or **~12 requirements**. If it does, the slice is too big — split it and say so.

**A card MUST include a section headed `Left to the developer`** — an explicit, named list of the choices the card is deliberately not making (the form component's structure, whether the retry lives in the adapter or the caller, test file layout). This section is what makes the flexibility real rather than accidental.

Judge every card with the two-question test:
1. *Could a competent developer start this slice without asking a question?* If no → under-specified.
2. *Does anything here tell the developer something a test or a reviewer would tell them more cheaply?* If yes → over-specified.

### Deliverable 1: Open-item disposition register
**Write to:** `docs/progress/respin-finish-open-items.md`

```markdown
# Respin — open-item disposition (YYYY-MM-DD)

Every open item from every register, with exactly one home. The source registers are
corrected by appending, never by editing their history.

## Summary
- Items reconciled: N (from M sources)
- OPEN-CONFIRMED: n · ALREADY-CLOSED: n · UNVERIFIED: n · NOT-RESPIN: n
- Homed in a slice: n · Deferred with owner: n

## Slice-blocking items
| ID | Claim (one clause) | Verified at | Reachable when | Home | Blast radius |

## Deferred
| ID | Verdict | Owner | Reason | Trigger that reopens it |

## Not Respin
| ID | Belongs to | Note |
```

### Deliverable 2: Plan gap report
**Write to:** `docs/progress/respin-finish-plan-review.md`

Findings ranked most-severe first, each in this shape:

```markdown
### F-1 · [One-line claim] — `severity: blocking | major | minor`
**Lens:** Coverage
**Evidence:** `docs/plans/respin-finish-master-plan.md:24-33` — slices 1–10 contain no owner for
free-tier credit minting; `respin-finish-codebase-review.md:71` lists it as required by M3.
**Consequence if unaddressed:** a Free creator reaches the Studio with no path to credits;
slice 6's acceptance walk is unwalkable on the tier most pilots will use.
**Fix applied:** [what you changed, and where] — or **Fix proposed:** [if it needs an owner decision]
```

Close with a **What this review could not verify** section. Absence of a finding in a lens you could not exercise is not a PASS.

### Deliverable 3: Amended plans
Edit in place:
- `docs/plans/respin-finish-master-plan.md` — add an **Open items closing here** column to the slice table; correct the decisions-owed table; fix the estimate and coverage findings; state the `packages/brain` vs `@respin/db` resolution, or record it as an owner decision with a deadline slice.
- `docs/plans/respin-finish-phase-1.md` and `-phase-2.md` — apply the altitude contract, add the `Left to the developer` section, add the open-item ids each one closes.
- **Slices 3–10:** write a **slice card stub** each — not a full phase plan. Honour the just-in-time rule: a stub carries only the "A creator can…" sentence, prerequisites, open items closing there, the gates it triggers, and the questions that must be answered before its full card is written. **Target 15–25 lines each.** Put them in the master plan or in one `docs/plans/respin-finish-slice-stubs.md` — your call, and say which and why.

### Deliverable 4: Owner decision queue
**Replaces** the existing decisions-owed table in `docs/plans/respin-finish-master-plan.md`.

One row per decision engineering cannot make: the decision, who decides, **the slice it blocks**, **the default the code is built under if it goes unanswered**, and the cost of answering it late. The default column is what stops the build from stalling — every row has one, or says plainly that no default is safe and the slice stops.

---

## Phase 5: Self-Review

Before finishing, verify in `<self_review>` tags:

1. Every open item from every Tier 2 source appears exactly once in Deliverable 1 — count them and show the arithmetic.
2. Every `OPEN-CONFIRMED` verdict cites a `file:line` you actually opened this session.
3. Every finding in Deliverable 2 is either fixed in Deliverable 3 or has an owner row in Deliverable 4. No finding floats.
4. Every slice card you touched passes the two-question test, and none exceeds the density budget.
5. No plan document grew a section that a test, a reviewer, or an existing register already covers.
6. You edited no source code, no schema, and no migration.

---

## Success Criteria

1. A developer can open slice 3's card and start work without asking a clarifying question — and can name three implementation choices the card deliberately leaves to them.
2. Every one of the 19 register items, every `todos.md` row, every R-30 owed item, and every in-code marker has a verdict and exactly one home.
3. Every `OPEN-CONFIRMED` item is verified against the code with a citation — none carried on a register's word alone.
4. No slice in the amended plan builds a package with no caller in the same slice.
5. Every "missing" row in the codebase review and every M2–M6 obligation in the build plan is owned by a named slice, or sits in the deferral table with an owner and a reopening trigger.
6. The decisions-owed table has a default for every row, or states that none is safe.
7. Total plan text added is smaller than the 489-line document this process exists to avoid — state the line count you added.
8. `docs/progress/respin-finish-plan-review.md` names at least one thing you could not verify.

---

## Constraints

- **Verify before you carry.** A register saying an item is open is a lead, not evidence. Open the file. If the code contradicts the register, the code wins and the register is corrected by appending.
- **You are amending plans, not building.** Do not edit anything under `respin/` — no source, no tests, no migrations. If a fix requires code, it becomes a requirement in a slice card.
- **Do not invent status.** If you cannot tell whether a task landed, write `UNVERIFIED` and name what you would need. Guessed status is what let "all 67 closed" through.
- **Bias to removing plan text over adding it.** Every line you add is a line someone reviews instead of building. If a requirement is already proved by a test that exists, cite the test and delete the requirement.
- **Do not re-plan M4–M6 in detail.** The just-in-time rule is a decision, not an oversight. Stubs, not phase plans, for slices 3–10.
- **A deferral needs an owner and a trigger.** "Deferred" with neither is how 19 items became invisible.
- **Write for the developer who will build this, not for a reviewer.** Specifications, not justification essays. If a paragraph explains why the plan is good rather than what to build, cut it.
- **Banned from the output:** *robust, comprehensive, seamless, leverage, best-practice, holistic, world-class*. Also banned: "should work", "presumably", "likely fine" — say verified, or say unverified.
- **If a gap is genuinely absent, say so.** A lens that finds nothing is a real result; a false finding costs the same review time as a real one.
