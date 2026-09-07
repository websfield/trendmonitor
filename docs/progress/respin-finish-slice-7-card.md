# Slice 7 — The rest of the Studio — report card

**Closed 2026-09-02 at ALMOST, not Ready.** Engineering completion and evidence completion are separate claims (build-plan, non-negotiable 6), and this card keeps them separate.

Plan: [`respin-finish-phase-7.md`](../plans/respin-finish-phase-7.md) · Ledger: [`respin-finish/ledger.md`](respin-finish/ledger.md) · Decisions: `decisions.md` **R-71 … R-79**

Vendor-walk instructions: [`respin-vendor-acceptance-walks.md`](../runbooks/respin-vendor-acceptance-walks.md), §6.

---

## Readiness

| | |
|---|---|
| **Overall** | **Almost** — every engineering criterion met and measured; the acceptance walk is **not run and not claimed** |
| **Entry gate** (final, CI shape, Docker live, all 12 concurrency suites) | **PASS** — typecheck 0 · lint 0 · `db:check` clean · **117 files / 2875 tests / 0 failed / 0 skipped, exit 0** · `next build` compiled. Artefact: `respin-finish/entry-gate-slice-7-final.txt` |
| Baseline | 2420 tests at `b2c7539`. Slice 7 adds **+455 tests** and introduces **zero** new failures |

## Gate verdicts

**Reviewer spend: 8 agents** (4 round 1 + 4 round 2). Gates ran at **FULL, escalated above the configured `Gate intensity: lean`** — billing and tenancy are `Full gates? yes` regardless; compliance and learning were escalated because slice 6's ledger records the two would-be-merged reviewers *disagreeing*, with the one that EXECUTED being right.

| Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|
| Respin spin compliance | **BLOCK** — Not yet / D | NEEDS CHANGES | **Almost / B** |
| Respin learning honesty | **BLOCK** — Not yet / D | NEEDS CHANGES | **Almost / C** |
| Respin brain tenancy (Full) | NEEDS CHANGES | NEEDS CHANGES | **Almost / B−** |
| Respin billing & credits (Full) | NEEDS CHANGES | NEEDS CHANGES | **Almost / B** |

**Both BLOCKs are closed, and each reviewer proved it by re-running its own probe rather than accepting the fix.** Round 1: 2 BLOCK · 16 CHANGE · 12 NOTE. Round 2: **0 BLOCK** · 4 High · 6 Medium · 5 Low · 8 NOTE.

**Every BLOCK and every High in this slice was found by RUNNING the code. Not one was visible to the test suite that passes over the same files.**

## What shipped

Six of seven Studio modes reachable, with the output-quality checks as **required registry data** (a mode without one is a compile error). Revision with same-tenant composite-FK lineage, the repo's first `BEFORE UPDATE` immutability trigger, and the kill test **re-run structurally** — no code path can inherit a verdict. Structured feedback capture with exactly one raw reader in the repo and `packages/brain` pre-registered as the only place a proposal may ever be constructed. The F1–F9 framework library, seeded, scanned and curated, plus Pro+ private frameworks with versioning-by-append. The tier gate re-keyed so an **unclassified mode is a compile error**, not a default-allow.

## The two BLOCKs, in plain words

1. **A `[check]` marker laundered the specific it marked.** Revising a draft put the parent's text into the corpus that decides whether a number was "traced" — so a specific the parent had honestly marked *unverified* became a token in that corpus, the marker stopped being needed, and an invented `$4,000` rendered under *"Every number, date and name in this draft was found in your brain or in what you typed in."* Fixed inside `buildCorpusIndex`, so the **class** is covered; the fixer then found a **second channel** the reviewer had not (R-68's flag-only disclosure field), and a defect in its own fix (UTF-16 vs code points — with six emoji the amount survived).
2. **The product's own library said what its own kill test refuses.** Two seeded sentences matched `hard` performance claims — a model emitting either gets the draft refused and the creator debited — and both rendered verbatim to every creator. The class: the honesty canon had **three** text sources and only two were scanned. The final sweep found **thirteen** such sentences, not the five reported.

## Scope reductions and deviations — stated, not ticked

- **`analyseAndSpin` (mode 4) is deliberately NOT reachable.** The similarity gate is a hard pre-display gate (non-negotiable 1) and does not exist until slice 8. `packages/modes` holds this as a **self-expiring rule** — "no similarity-gated mode is implemented while slice 8's gate does not exist" — and the compliance gate **verified unreachability by execution across every path**, including a crafted form post and all three route handlers. **Cost: the card's "all seven modes in a browser" becomes six.**
- **Streaming deferred** (R16's second branch), enforced as a **refusal**: a source scan over every generation screen rejects `<progress>`, `role=progressbar`, `aria-valuenow`, skeleton, shimmer and live-generation vocabulary.
- **REQ-C07's series planner deferred** with its tier note; **REQ-C08 explicitly out of scope** (`[Could]`).

## Residuals — not claimed done

1. **The acceptance walk was not run.** Verification 2 — the six reachable modes generated in a browser against the real vendor — is **unwalked**, as slices 2b and 6 reported theirs. The reason is not "no key": the implementer had no browser tool, and a vendor walk spends the owner's money at a third party, which Golden rule 8 puts behind explicit confirmation an orchestrator brief does not supply. Verifications 8, 10, 11 and 12 are discharged **by test, not by walk**, and that difference is recorded rather than blurred.
2. **THE FINAL FIX PASS IS UNREVIEWED.** The two-round cap is spent. Round 2's findings were fixed by two agents whose work no reviewer has seen — slice 3's precedent exactly. **Whether a third round runs is the owner's call.**
3. **A PRE-EXISTING revenue defect, reproduced and explained** (billing round 2, outside slice 7's manifest). `model_usage.created_at` is assigned at INSERT and visibility decided at COMMIT, and the usage row commits **before** the workspace lock — so two racing attempts can each see zero predecessors and **both take the included build, losing one debit.** Reproduced deterministically against Postgres 17. Direction is **revenue-lossy for us, never an overcharge to a creator.** Named fix: allocate the ordering key under the lock, or a durable per-profile marker decided inside the same locked transaction. **This is the one finding a re-review would not change.**
4. **The learning gate's round-2 lying screen never ran** (harness/module resolution, not a property of the code). Round 1's lying screen is what found the BLOCK, so this is a real gap in round 2's strength, stated by the reviewer itself: *"I did not prove one cannot exist."*
5. **Output-quality checks are PROXIES and are not reported as coverage.** R3 (non-summariser) and R4 (mechanic spread) are proxies with named gaps; R18's realness half is a proxy. All gaps are compile-checked entries — a gap without a driver fails the build.
6. Smaller, each with an owner and a revisit trigger in `decisions.md`: the framework `unsupported` rung now reaching the prompt is **reasoning, not a measured model response**; `corpus-batch-0/-1` name a population no artefact in the repo opens (owner: slice 8 ingest); ownership immutability exists on two tables only, **deliberately** — a swept trigger would make the R-54 deletion executor an outage.

## The pattern worth more than any single finding

**CLAUDE.md's 2026-08-29 population lesson fired SIX times inside this one slice** — the mode-access witness going vacuous, the no-streaming guard not growing with a second screen, the honesty canon's third text source, the raw-reader scan blind to drizzle's relational API, the config pin covering one key of five, and the pause exemption list. **Twice, a fix FOR that lesson was itself written one-instance-wide.** There were also **three separate vacuous tests**, each caught by a different reader, and **three fixtures standing in for an order production does not produce.**

At that rate these are not recurring mistakes; they are a missing standing check. Two Lessons entries are **offered for the owner's approval** (never appended silently) at the end of the ledger.

## Spend

6 build/fix stages + 4 fix agents + 2 final fix agents + **8 reviewer agents** = **20 agents.**
