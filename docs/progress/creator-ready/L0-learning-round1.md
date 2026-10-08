# L0 gate — respin-learning-reviewer, round 1 (verbatim)

Reviewed 2026-10-01. Frozen inputs: `L0-card.md` d9ce54c118fd4933, `entry-baseline.md` bd0c383efd64b06e, plan f9de8600e28e910b. HEAD 3533dbf. Dispatched with model opus, read-only.

---

# Respin learning honesty review — launch-remediation L0 (docs-only)

**Readiness: Almost · Grade: C · Within a single run the manifest's denominators can't be gamed, but across runs and across arms they can: the 20-brief holdout can be re-run until it passes, and in-product runs can leak one arm's context and feedback into the other.**

Counts: 0 BLOCK · 2 High · 6 Medium · 3 Low · 4 Info.

**Scope**: `docs/progress/creator-ready/L0-card.md` (all 366 lines, with §5 `LR-EVAL-1` as the measurement contract) and `docs/progress/entry-baseline.md`. I checked them against the plan's L0 section (`respin-launch-remediation-master-plan.md:59-71`), LA-4 (`:164`), T7-B/C (`:168`), Risks (`:191-201`), the owner source `docs/creator-ready/02_Remediation_Plan.md` §4 and §9, PRD §4F and §5, and the skill canon.

**How I treated the card under gate-rules §6.** §6 bars findings against cards. Here the manifest is the phase's deliverable: plan L0's pass/fail is "a frozen evaluation manifest". So I review its rules as a specification. I filed no bookkeeping findings (the §6 `EVIDENCE_PLACEHOLDER`, the missing L0 ledger line).

## Your least-confident bet, answered first

- **Pasting the selected concept into `ideaToScript`** is the only honest route while the baseline has no selection path. It is acceptable if two conditions hold:
  - the paste is a byte-exact frozen template, not operator judgement (see M1);
  - the comparison is labelled workflow against workflow. The two arms differ at once in selection path, input channels, form control and output contract, so no difference can be attributed to any single L1–L3 change.
- **The baseline is less like-for-like than the card claims.** `ideation` returns 3–5 ideas, not three. The no-concept brief has no topic to type into "What they want ideas about:". The constraints have no baseline field at all.
- **Denominators within one run hold.** x/20 with withdrawn counted as a fail, "none acceptable" scoring as not filmable, and "no delivered script" scoring as not filmable all agree with LA-4 (`:164`: "Missing selected output cannot vanish from the denominator"; failures stay visible). An unrun brief also scores 0 under x/20. None of these rules can raise the candidate's score.
- **Where it is exploitable:**
  - across runs (H1);
  - across arms through shared product context (H2);
  - across creators, because the pass rule is pooled (M3).
- **Creator-as-judge with the "disagreement fails" rule** is conservative for the absolute threshold: a veto can only lower a score. It is not neutral for the comparison, because the unblinded creator holds a unilateral veto (M2).

## Findings

- ⚠️ CHANGE **High** `docs/progress/creator-ready/L0-card.md:298,327,332,358` — **The holdout can be re-run until it passes.**
  - Changing a rule after a candidate run "voids that run" (`:298`). That clause is a mechanism for discarding an unfavourable run.
  - A candidate change starts "a new candidate run over all 20 briefs" (`:332`). The number of such runs is unlimited, and superseded runs have no reporting rule.
  - Adding or removing briefs after the baseline run is allowed as "a new manifest version" (`:327`). That contradicts "never back-filled after the freeze" (`:358`).
  - All of this contradicts the plan and the owner's source: "fresh tasks/untrained participants for retest, unchanged holdouts" (`respin-launch-remediation-master-plan.md:168`; `02_Remediation_Plan.md:160`).
  - The result is that 16/20 becomes a best-of-k.
  - Fix:
    - every run gets a sequence number and stays reported, including voided and superseded runs;
    - a rule change never voids an already-run result;
    - a retest after a candidate change uses fresh briefs, or is reported as "look k on this holdout";
    - once the ID list is recorded, the brief set changes only by consent withdrawal.

- ⚠️ CHANGE **High** `L0-card.md:304-309,333` — **"Same creator-context snapshot" and "no outcome feeds `packages/brain` / creates a promotion proposal" are claims with no execution mechanism.** The product both arms run in has live or planned paths that break them:
  - (a) Studio generation feedback already produces Voice/Kill Test proposals: `respin/packages/brain/src/proposal.ts:338-352` (`buildFeedbackProposalDraft`), refreshed from `respin/app/(product)/results/actions.ts:208`, inserted at `respin/packages/db/src/promotion-ops.ts:263-279`. Rejection reasons recorded (`:350`) through the product's feedback controls enter that path.
  - (b) L3 (plan `:113`) puts up to 5 recent concept/draft records and 3 selection/rejection notes into generation context, ranked same platform and newest first. If both arms share a profile and the coin runs the baseline first, the candidate for brief k sees the baseline's concepts and the creator's rejections for that same brief. It also sees every earlier brief's outputs. This can inflate the candidate's absolute pass directly.
  - (c) A creator approving a proposal mid-evaluation changes the brain between briefs.
  - (d) Results can be logged against evaluation generations.
  - Fix:
    - freeze the execution design: each (brief, arm) runs in a research-owned profile restored to the recorded brain-doc versions;
    - the recent-work window is empty or pinned, and identical across arms;
    - feedback and results controls are not used;
    - each run records before/after counts of `generation_feedback`, `promotion_proposals`, `results` and `creative_pieces` for those profiles, and asserts no change other than the run's own generations.
  - The structural isolation half of this belongs to `respin-tenancy-reviewer`.

- ⚠️ CHANGE **Medium** `L0-card.md:331,333,339,350` — **The baseline arm's input/output mapping is undefined, so "same inputs" (`:333`) cannot be checked.**
  - (a) `ideation` returns 3–5 ideas (`respin/packages/modes/src/modes.ts:261`, `ideaCount: { min: 3, max: 5 }`), while C is defined over "the three concepts". A 5-idea baseline gets more draws.
  - (b) The baseline's only content input is free text: "What they want ideas about:" (`respin/packages/modes/src/assemble.ts:459`) and "The idea:" (`:408`). Only platform has a field (`respin/app/(product)/studio/studio-panel.tsx:362-366`). Solo/help, time and location/equipment/footage have no channel.
  - (c) `ideaToScript` hard-codes "a person filming alone" (`assemble.ts:412`), whatever the brief declares.
  - (d) "Pasting the chosen idea" does not say which fields go in, or whether the constraints go in too. Rule 1's "no extra instructions" (`:339`) conflicts with the paste itself.
  - Fix:
    - freeze a byte-exact serialisation template for each baseline input box, hashed in the ledger;
    - judge all returned ideas and report the count, or truncate deterministically to the first three;
    - state that baseline F is judged against resources it had no structured channel for, so the comparison is workflow against workflow.

- ⚠️ CHANGE **Medium** `L0-card.md:348-350` — **Judge roles and blinding.**
  - C is defined as a concept "the creator would choose to develop", which an independent rater cannot judge. Disagreement-fails therefore lets the rater veto the creator on a question only the creator can answer.
  - The creator is unblinded, since they select in both arms, and holds a unilateral veto that can depress either arm in the side-by-side.
  - The rater's blinding is nominal. The candidate output carries premise, typed filming fields and `resolvedForm`; the baseline carries hook, thesis and framework. The rater can tell the arms apart unless both are rendered through one neutral template.
  - Fix:
    - make C creator-only, with rater agreement recorded as an unscored field;
    - keep two-judge scoring for F;
    - render both arms through one neutral template before any judging;
    - label arms to the creator only by a random code.

- ⚠️ CHANGE **Medium** `L0-card.md:357` vs `:359` — **The pass rule pools across creators, which the reporting rule forbids.**
  - C ≥ 16/20 and F ≥ 16/20 can pass with one creator at 0/4 (at most 5 briefs per creator, `:315`). That is exactly "a rate that hides a failing creator".
  - Fix: add a per-creator condition (for example, every creator has ≥1 acceptable C and F), or make a creator at 0 a named failure that withholds the pass pending an owner decision. Put it inside A-5's threshold acceptance.

- ⚠️ CHANGE **Medium** `L0-card.md:317-318,332,339` — **Where the candidate's `formChoice` comes from is unspecified.**
  - The form is "recorded before any run" but is not a brief field: the brief holds "nothing else". The operator therefore picks explicit or `auto`.
  - That choice changes S's "passed as a form it does not satisfy" judgement and the per-form cells.
  - Fix: freeze the choice (the assigned form, or `auto`) and record requested versus resolved form per output.

- ⚠️ CHANGE **Medium** `L0-card.md:352,357,359-360` — **S flags do not gate the evaluation sample and are never reported.**
  - "Blocks release fixtures" and "zero unresolved S flags in release fixtures" let a run with invented personal claims in 5 of 20 candidate outputs pass on C and F, as long as those outputs are not used as fixtures.
  - "Unresolved" has no definition and no one who resolves it.
  - S is absent from the reporting rules.
  - How the disagreement rule applies to a flag, as opposed to an acceptability score, is not stated.
  - Fix: report S per arm and per output with n; S is set if either judge flags it; any S flag on a candidate evaluation output fails the pass or requires a named owner disposition.

- ⚠️ CHANGE **Medium** `L0-card.md:324-327` — **The holdout protects brief *text*, not baseline *results*.**
  - T1→T2 intends baseline evidence to drive tuning (`02_Remediation_Plan.md:23,69,73`: "T2 prompt changes require T1 baseline evidence").
  - §5.2 lets the baseline run on all 20 held-out briefs, with no rule on who sees per-brief scores, the one-line rejection reasons (`:350`, which can quote brief content) or S flags before the candidate is frozen.
  - With no development set ("if any", `:325`), tuning evidence can only come from the holdout.
  - Fix: per-brief holdout baseline results stay with the research owner until the candidate freezes. Tuning uses only the declared development set, or aggregates released under a stated rule.

- 💡 **Low** `L0-card.md:334` — A coin per brief can leave a creator's briefs heavily unbalanced by arm order. Use balanced randomisation stratified by creator.
- 💡 **Low** `L0-card.md:335` (with `:18`, `:332`) — The per-run record omits config version, although the candidate's pre-run record includes it. The baseline's "v18" is taken from a 2026-09-17 export and not re-observed, and the seed prices model aliases only (§3.6 8c-W1). Fix: record config version and the served dated model ID per run, for both arms.
- 💡 **Low** `L0-card.md:362` with `:340` — The 160-call cap leaves no headroom for the transport retries rule 2 permits, and brief run order is unspecified, so which briefs fall off at the cap is a free choice. Under x/20 this can only hurt the candidate. Fix: fix the order before the first run, and state that an incomplete run cannot pass.
- 💡 **Info** `L0-card.md:360` — Report the comparison as a paired brief-level 2×2 (both pass, baseline only, candidate only, neither); two marginal totals hide discordance. The "this sample only, never uplift" wording is correct.
- 💡 **Info** `L0-card.md:181` — REG-30 (`respin/app/(product)/studio/run-copy.ts:272-273`, verified as an unconditional constant) is a false absence claim on a results surface. It is routed to the tenancy gate only; add the learning gate.
- 💡 **Info** `L0-card.md:137-139` — Citations verified at HEAD:
  - `FEEDBACK_TODAY` (`run-copy.ts:745`, "Nothing reads it today") is false against `proposal.ts:345`;
  - `promotion-ops.ts:263-268` exists;
  - R-143 is absent from `decisions.md` (the last is R-141);
  - no migration after `0061`.
- 💡 **Info** `L0-card.md:318,320` — Brief sha256s and per-creator breakdowns are recorded in git. Pseudonymity and the risk of guessing low-entropy briefs from their hashes belong to the tenancy reviewer.

## Checks run
1. **Sole emitter** — n/a: L0 changed no code. The manifest forbids proposals (`:308`), but has no mechanism (H2). I re-grepped proposal construction: drafts come from `packages/brain/src/proposal.ts`, and rows are persisted in `packages/db/src/promotion-ops.ts:263` from brain-built drafts. I did not re-run the sole-emitter test; the entry-gate suite passed apart from `isolation.test.ts`.
2. **Minimum n** — n/a: no proposal logic. The evaluation declares itself outside the proposal path (`:304-311`).
3. **Unverified never learns** — holds as policy at `:306-309`; the route by which outcomes could leak in is H2(a)/(d).
4. **No pooling / no collapsing** — reach and conversion are explicitly not measured or reported (`:311`), which holds. Paid/organic is n/a. Pooling across creators is violated (M3).
5. **Own baseline / exclusions** — n/a for Results. Arm comparability fails (M1, H2).
6. **Declared metric** — holds at `:311`: nothing is presented as a north-star or engagement score.
7. **Approval writes** — H2(c): a brain can change mid-evaluation. Structural isolation is deferred to `respin-tenancy-reviewer`.
8. **Two claims** — holds:
   - engineering and evidence completion are separate at `:361`;
   - the A-5 safe default at `:286` is "Synthetic fixtures only; no creative-quality pass", which matches plan `:69`;
   - "in pilot" at `:360`;
   - the card makes no success or evidence claim, and §6 is a placeholder.
   No outward-facing claim, so the outbound-truth canon is not triggered.
9. **Number provenance** — holds:
   - 16/20 cites LA-4 `:164` and A-5;
   - the 8 per platform, 5 per form, 5 per creator minimum and 5 per creator maximum are declared design parameters, and are mutually feasible (5×4=20, 8+8≤20, 3×5≤20);
   - 80/160 is derived at `:362`.
   The rates name denominators, with x/20 and x/(20−withdrawn) both reported.

## Coverage
- **Read fully:** `L0-card.md`, `entry-baseline.md`, `respin-launch-remediation-master-plan.md`, the skill canon, `.claude/gate-rules.md`.
- **Read in part:** PRD §4F–§5 (`:100-179`), `02_Remediation_Plan.md` §4 and §9, `modes.ts:120-311`, `assemble.ts:380-469`, `promotion-ops.ts:250-279`, `run-copy.ts:268-275,735-745`, and the ledger diff (one 2026-09-30 planning line, no L0 line, no evidence claim).
- **Grepped:** `proposal.ts`, `feedback-ops.ts`, the `refreshPromotionProposals` callers, `generate.ts` (no recent/feedback context at HEAD), studio platform fields, `decisions.md` R-14x.
- **Not read:** `00-obligation-register.md` (plan L0 evidence says "review of the manifest against the obligation register", which I did not do), NORTH_STAR.md, `entry-gate-L0.txt` beyond its exit lines.
- **Commands run:**
  - sha256 of the 3 frozen files, before and after the review: all unchanged (`d9ce54c118fd4933`, `bd0c383efd64b06e`, `f9de8600e28e910b`);
  - `git status --porcelain respin`: empty;
  - `git diff HEAD -- ledger.md`;
  - migrations listing: latest `0061_vengeful_eternity.sql`;
  - grep of the transcript: every step exited 0 except test (exit 1, "1 failed | 220 passed | 23 skipped (244)"), which matches the card.

## Verdict
**NEEDS CHANGES** — Grade C (Almost): 2 High, 0 BLOCK. The H1 and H2 fixes touch only `L0-card.md` §5, so re-run this reviewer alone, once.
