# todos.md — non-coding decisions

Decisions that engineering cannot make for itself: owner inputs, product definitions, legal/consent questions, and spend authority. Each row says **what it blocks**, **who decides**, and — where work would otherwise stop — **the default the code is being built under** so nothing waits on an unanswered question.

Convention: a decision that is settled here graduates to `docs/video-editing/decisions.md` as a numbered D-row. This file holds only what is *open*.

Last updated: 2026-08-10.

---

## 1. Blocking a Stage 0 task — proceeding under a stated default

*Nothing open.* **T-1 ("what counts as one output?") is settled and has graduated** to `decisions.md` **D-56**; the rule, its class tabulation and the comparability axes have exactly one home, `docs/video-editing/output-counting-policy.md` — do not restate them here.

---

## 2. Owner inputs — long outstanding, blocking real progress

### T-2 · Set the D-21 spend ceiling
**Blocks:** `PHASE_3_ACCEPTED_LIVE` (open since Phase 3); Stage 1 live provider benchmarks; **all** of Stage 3's live model execution.
**Decider:** owner. **Needs:** a number in AUD, and where it is configured.
Every editorial stage to date has run on recorded fixtures at AUD 0.00. Recorded replies got the pipeline built; they cannot demonstrate editorial quality, because a recorded reply is not a decision. **Stage 3 cannot meaningfully start without this.**

### T-3 · Supply two more accounts, with rights records (D-36)
**Blocks:** `PHASE_0_EXIT_EARNED` (needs 3 accounts, has 1).
**Decider:** owner. **Needs:** stable `accountId`s, source classification, and a rights record per asset with an `evidence_uri`.

### T-4 · Accumulate the remaining real outputs
**Blocks:** `PHASE_0_EXIT_EARNED` (needs 20 resolved real outputs; has **1** — D-56 settled the unit, so this is no longer "1 or 2").
**Decider:** operations. Not an engineering task — it is real production work through the pipeline.

### T-5 · Upgrade the rights basis beyond owner-directed
**Blocks:** any use beyond internal stakeholder showcase.
**Decider:** owner / legal.
The real proving run's rights records cite published partnership posts as `evidenceUri` and note that formal creator agreements are **held by the campaign, not attached**; `paidAmplificationPermitted: false` throughout. Current approval is delegated, not agreement-backed.

---

## 3. Product and strategy

### T-6 · Does cutdown get its own North Star?
**Blocks:** nothing immediately; weakens every alignment check until answered.
**Decider:** product owner.
`NORTH_STAR.md` describes **UGC Intelligence for ClientHub** — compliance gate, amplification scorer, Knowledge API. Cutdown is a second product line with its own PRD and roadmap and is **not in it**. Options: (a) give cutdown its own North Star document; (b) extend the root one to name both lines; (c) accept the PRD as cutdown's governing contract and say so explicitly. I have deliberately not invented one.

### T-7 · Assign the unowned PRD Phase 1 exit obligations
**Blocks:** claiming PRD Phase 1 complete.
**Decider:** product owner + operations.
Five stages are governed by PRD Phase 1, and **none** of them owns these: **≥60 published outputs**, **unit cost known**, **≥3 repeat internal users** (§15), and **cost attribution coverage ≥99%** plus p50/p95 unit cost by source minute / final minute / variant / platform (§14.3). These are operations and instrumentation obligations, not engineering deliverables.

### T-8 · Analytics access and consent
**Blocks:** Stage 6 entirely.
**Decider:** owner / legal.
Needs: whose analytics, under what permission, retained how long. Note the precedent from T-5 — if creator agreements are held by the campaign rather than attached, performance data likely carries the same question. **Resolve before building a connector, not after.**

### T-9 · Are the Social Soup accounts one tenant or many?
**Blocks:** Stage 6's pooled uplift statistic **and** Stage 7's isolation model — and the two answers must agree.
**Decider:** product owner.
PRD §14.2 targets uplift "across multiple accounts" — a pooled statistic. Stage 7 turns accounts into isolated workspaces. The repo already holds the resolved form of this exact question one product line over: *a summary statistic of outcome data is outcome data*. Decide before building the pooled statistic.

---

## 4. Legal / licensing gates

### T-10 · Remotion licence (D-16)
**Blocks:** Stage 4's Remotion adapter.
**Decider:** owner / legal. D-16 carries an explicit instruction: **escalate before `npm install remotion`** — the company licence is an owner/legal commitment. Engineering must escalate, not install.

### T-11 · Golden-set asset permissions
**Blocks:** Stage 1 task 12.
**Decider:** owner. PRD §13.1 requires golden sets be **versioned and permissioned**; each asset needs a written permission record.

### T-12 · Retention vs reproducibility
**Blocks:** Stage 7's storage migration design.
**Decider:** owner / legal.
A genuine conflict, currently nobody's task: **REQ-113 requires previously approved versions stay reproducible forever**, while retention/deletion (REQ-155/156) requires erasure — for a store holding licensed creator footage and third-party personal data. D-8 currently says "delete nothing automatically". For this store, that tension *is* the design.

---

## 5. Permissions needed from the user (small, but blocking)

### T-13 · Authorise `git push` ✅ **SETTLED 2026-08-10 — authorised and done**

**Owner decision:** push authorised. `origin/main` is now at **`06c5073`**; the five previously-unpushed commits (through Stage 0A) are on the remote.

**What this unblocked, and what it did not.** The CI workflow added by **D-57** fires on `push` to `main` for the Cutdown paths, so this push is its **first execution ever** — which is the whole point of A7. Two things in that workflow were written but unverifiable from the authoring session and are verified by that run, not by inspection: the **Linux FFmpeg download URL** (`FFMPEG_LINUX_URL`) and **`setup-node`'s `.tool-versions` support**. Both fail loudly with a named remedy rather than degrading, so a red first run is expected-if-anything and cheap to fix.

**A7 is therefore still open** — it is "CI green on a clean clone", not "CI configured". Close it when the run is green; if it is red, the failing step names the line to change.

*Context retained below.*

**Blocks:** Stage 0 task 17 acceptance criterion **A7** (CI green on a clean clone).
The branch was **3 commits ahead of `origin/main`** (5 by the time it was pushed). CI runs on push, so "CI is green" was unverifiable until the branch was pushed. Per `CLAUDE.md` golden rule 8, pushing waited for explicit confirmation. Everything else in Stage 0 was built and verified locally first.

### T-14 · Add `cutdown/.env.example` by hand ✅ **SETTLED 2026-08-10 — committed in `310832c`**

**Outcome:** the file is **tracked**. `git ls-files cutdown/.env.example` resolves and `git show --stat 310832c` lists it as a 32-line addition. It is no longer untracked, and nothing here is outstanding.

**Golden rule 2 was satisfied by a second pair of eyes, not by waiving it.** The session that raised this row had its tooling denied read access to `.env*` paths and therefore declined to commit a file whose secret-freedom it could not verify. A Stage 0B reviewer — without that denial — read the committed content and confirmed **no secret leaked**: `ANTHROPIC_API_KEY=` and `CUTDOWN_SPEND_CEILING_AUD=` are **empty placeholders**.

**Blocks:** nothing, and never did — no code reads it (verified; code reads `.env`, which is git-ignored).

> The `docs/progress/cutdown/ledger.md` entry written in `310832c` still says this file is "deliberately NOT committed and still the only untracked file", which the commit it was written in contradicts. That ledger is **append-only** and is corrected by appending, not by editing this row or that one.

---

## 6. Settled during this work — recorded here, pending graduation to `decisions.md`

| # | Decision | Where it lands |
|---|---|---|
| — | `work/` is never tracked — licensed creator footage + third-party personal data + ~200 MB/campaign | committed in `.gitignore` |
| — | Phase 4–6 committed as three coherent commits, not four invented per-phase ones (the worktree was a cumulative snapshot; splitting it would produce commits that never existed and don't build) | commits `c21c7aa`, `7404a65`, `501f212` |
| — | The program is expressed in the PRD's roadmap vocabulary; stage numbers are filenames, PRD phases are authority | master plan §0 |
| — | Planning detail decays with distance; Stages 2–7 carry re-planning triggers rather than invented task tables | master plan §7 |
