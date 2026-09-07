# Slice 8 — Respin learning honesty gate, round 2 (2026-09-03, after the fix pass)

Reviewer: `respin-learning-reviewer`. Manifest: `8-review-manifest-round2.md` — all 140 hashes matched before and after; `framework-proposal.ts` confirmed absent. Saved verbatim by the orchestrator.

---

# Respin learning honesty review — Slice 8, round 2

**Readiness: Almost → Almost · Grade: C → B · The seven round-1 gaps are closed or honestly recorded, the numbers this slice shows are still honest, but the fix pass left the baseline's selection rule half-stated, one stale expiry number in the runbook, and a "current-tree" test count that is no longer the current tree.**

0 BLOCK · 3 CHANGE · 5 NOTE (round 1: 0 / 7 / 4).

## Movement (round-1 findings)

| # | Round 1 | Movement | Evidence re-run |
|---|---|---|---|
| C1 | Trends surface not swept by the claims canon | **RESOLVED** | `trends-ui.test.tsx:12-14` imports the canon; `:124-154` 17 rendered states; `:414-419` sweeps every state; `:425-432` per-pattern specimen loop; `:434-443` a planted forecast is caught. 63/63. |
| C2 | Sole-emitter reconciliation unrecorded | **RESOLVED** | `feedback-readers.test.ts:123-125` one exact path, `includes` compare, `proposal` rule only; `:1095-1119` AST positive test — sole write target `["frameworks"]`, every `curatorStatus` via `.values` and `"proposed"`; `:1121-1153` four doctored copies each seen; `:1082` refuses a re-created `framework-proposal.ts`; `:1089` every allowed path must exist. Ledger:1805 records the rename. 40/40. |
| C3 | Window not derived; "recent" undefined | **PARTIAL** | `outlier.ts:38-41` `BASELINE_RECENT_OBSERVATIONS`, `:90-108` window computed, `:113-119` start = earliest admitted, end = current publish. "Strictly before" is sound (refuses a same-instant observation, which would collapse the window). Empty baseline → ratio `null`, unstorable by writer and CHECK. DB `published ≤ window_end` consistent with derived `end == published`. 31/31. Still open: writer refusal of window ≠ derived (residual, stated), and finding 1 below. |
| C4 | Ticks describing fixture-only reachability | **RESOLVED** (one NOTE) | Card `:10` Reachability; R5/R6/R7/R18/R22/R24 annotated; R4 and V7 un-ticked; V5 split with 5b un-ticked. Zero non-test callers of the scorers/producers. |
| C5 | Saturation "measured" fixture-shaped | **RESOLVED** as recorded residual | `saturation.ts:31-39`; README:24-31; card `:86`. Honest and complete. |
| C6 | `stale_at` has no writer | **RESOLVED** as recorded residual | README:33-38; card `:86,:113`. NOTE 3. |
| C7 | Unnamed decay and alert thresholds | **RESOLVED** | `trends-storage.ts:36-49` `FEED_RECENCY_DECAY_DAYS = 7` cited; formula and sort unchanged, so the rename did not change the ranking. `health.ts:29-57` four constants with reasons; `main.ts:21` wires `productionAlertPolicy`; runbook says code-fixed. health 10/10. |
| N1 | Runbook "3/3" | **UNRESOLVED, now stale** — suite is 8 tests. |
| N2 | Dead port | **RESOLVED.** N3 README sentence **RESOLVED.** N4 weakest point **RESOLVED** (compliance lane). |

## Findings

- [CHANGE] `respin/packages/trends/src/outlier.ts:38-41,85` — `BASELINE_RECENT_OBSERVATIONS` is a **cap, not a selection rule**: "at most 10 prior videos within 90 days" but not *which* 10 when a channel has more. Probed: for one channel with 30 admissible priors, the 10 most recent scored ratio **1.82**, the 10 highest-view priors **0.39** — both accepted, both storable. Membership is caller-chosen, the half of L4/L5 a producer can bias. The docblock's "a median over more than a handful" is not enforced — n=1 is accepted and displayed as "from 1 recent items". Not reachable until a producer exists. · Fix: state the selection ("the ten most recently published admissible prior videos") and have `scoreOutlier` select from the full admissible population itself, or add the rule to the producer's contract test; state the minimum-n position.
- [CHANGE] `docs/runbooks/respin-worker-operations.md:5` — "Not proven … that `expireInSeconds` fails a stuck job at 300 s" is a fix-introduced stale number: the seam wiring replaced 300 s with `AUTOPSY_JOB_EXPIRE_SECONDS` = 600 s and the docker test asserts the derived value. · Fix: name the derived constant and 600 s.
- [CHANGE] `docs/plans/respin-finish-phase-8.md:3`, `docs/runbooks/respin-worker-operations.md:3`, `docs/plans/respin-finish-master-plan.md:183` (and the slice-8 card `:15,85`) — each says the **current-tree** gate is "141 files / 3185 tests"; the current tree is **143 / 3280** (`entry-gate-slice-8-fixpass-final.txt:1131-1132`). · Fix: update the pins or cite the artefact and date.
- [NOTE] `tests/feedback-readers.test.ts:97-98` — duplicated, garbled parenthetical. Cosmetic.
- [NOTE] `runbook:84` — "none is read from env or config" is too strong: the stale threshold is `HEARTBEAT_STALE_INTERVALS × RESPIN_WORKER_HEARTBEAT_MS`; the multiplier is code-fixed, the 90 s is not.
- [NOTE] `packages/trends/README.md:36` — "the page renders `stale: false` from data": `page.tsx:105` is a literal, correct only because the reader filters stale rows out first; shown-with-label vs excluded is recorded, not decided.
- [NOTE] card `:89,99,161` — R8/R16/V6 ticked without the per-tick "no production producer" phrase (the Reachability paragraph covers them globally); `:102` R17 still says "through slice 6's tier map" after R-95 moved the allowance to config.
- [NOTE] `runbook:26` — round-1 NOTE 1, now with a stale count (8 tests, not 3).

**Residuals judged, not re-found:** saturation query and stale writer stated as not built — honest and complete. The outlier WRITER still accepts any window satisfying `start < end ∧ published ≤ end`; the derived rule is strictly narrower, so a producer wired later can persist a window the scorer would not derive — stated open.

## Checks run
1 holds (0 `promotion_proposals` hits; positive curation test) · 2 n/a (baseline n displayed, no floor stated, membership caller-chosen → finding 1) · 3 n/a (analogue holds: metadata-only items refused) · 4 n/a (feed score ordering-only, formula unchanged) · 5 holds at `outlier.ts:96-101,113-119`; membership → finding 1 · 6 n/a (no engagement score) · 7 holds (no brain write on trends/worker/system-spend paths) · 8 holds with a stale pin (runbook `:5` checked claim by claim against `pg-boss.docker.test.ts` — cron, retry, concurrency/max/LISTEN equality, stately, `send({id})`, graceful stop, runtime started twice, 30 s polling fact, `findJobs`/`getQueueStats({force})` — all match; the one mismatch is 300 s) · 9 holds for the named constants; violated by the runbook's 300 s and the four "current-tree" counts.

## Coverage
- read fully: `outlier.ts`, `saturation.ts`, `packages/trends/README.md`, `tests/feedback-readers.test.ts`, the phase-8 card, the runbook, round-1 report, ledger:1802-1814, round-2 manifest, R-87 amendment + R-95 closure · in part: `health.ts`, `trends-ui.test.tsx`, `trends.test.ts`, `pg-boss.docker.test.ts`, `trends-schema.ts`, `trends-storage.ts`, `main.ts`, `generate.test.ts` (345-375), `access.ts` · by grep: `trends-view.tsx`, `page.tsx`, `respin/README.md`, master plan, vendor-walks doc, `m3-quality.md`, `todos.md`, the slice-8 card, `autopsy-policy.ts`, `pg-boss-runtime.ts`, the final gate log.
- commands: SHA-256 of all 140 files before and after → 0 mismatches; `ls packages/trends/src`; Docker `trends, trends-ui, feedback-readers, trends-storage, trends-page` → **5 files / 147 passed**; worker `health/production/schedules` → **3 files / 21 passed**; `pg-boss.docker.test.ts` → **7/7, 20.71 s**; scratch outlier probe (30 admissible priors: most-recent-10 / lowest-10 / highest-10 → 1.82 / 1.82 / 0.39, all accepted; empty baseline → `null`; later-published prior refused); greps under checks 1, 6, 7; reachability grep (0 non-test callers; `staleAt` written nowhere).
- hunted for and did not find: a second promotion-proposal constructor or table; a `brain_docs` mutation on the trends/worker/system-spend paths; a paid/organic sum or reach/conversion composite; a ranking change hidden in the rename; an inverted or empty derived window reaching storage; a forecast word on any of the 17 rendered states; an engagement score; a pilot or success claim computed from fixtures; a README overstatement of what "measured" saturation would need.

## Verdict
NEEDS CHANGES
No hard rule of this path is broken and round 1's seven gaps moved (6 resolved, 1 partial); what keeps it at Almost is a baseline rule that fixes n and span but not membership, plus two stale numbers the fix pass itself left behind.

*Ask `/go` to explain any finding in plain words — or to just fix them.*
