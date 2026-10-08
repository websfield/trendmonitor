# L0 gate — respin-learning-reviewer, round 2 re-run (verbatim)

Reviewed 2026-10-01. This is the one permitted re-run. Frozen inputs: `L0-card.md` 6deccd4b026ffea9, `entry-baseline.md` bd0c383efd64b06e, plan f9de8600e28e910b. HEAD 3533dbf. Dispatched with model opus, read-only.

The card line numbers cited below refer to the card at hash 6deccd4b026ffea9. §5 was rewritten after this review.

---

# Respin learning honesty review: L0 round 2 (the one permitted re-run)

**Readiness: Almost · Grade: C · The learning-contamination half of H2 is fixed, but the holdout can still be re-used until it passes (H1's class, now labelled instead of voided), and the new isolation design assumes things the product cannot do.**

Counts: 0 BLOCK, 1 CHANGE rated High, 5 CHANGE Medium, 4 LOW, 2 NOTE.

**Two consequences for you (gate-rules):**
- **§5:** this was the one re-run, and a High survived it. The card should read **Not yet**, list what is still open, and the next step goes to the person. No further reviewer run happens without their say-so.
- **"Same-finding recurrence":** N1 is H1's class again. Isolation findings N2 and N4 are next to H2's class, though H2's actual harm (evaluation leaking into learning) is now closed. Take the diagnosis to the person before spending anything more.

**Scope**: `docs/progress/creator-ready/L0-card.md` (all 442 lines, §5 in depth), checked against plan L0 (`:59-71`), LA-4 (`:164`) and T7-B/C (`:168`). Product claims in §5.3 were checked against `respin/` at 3533dbf. Hashes were the same before and after: card `6deccd4b026ffea9`, baseline `bd0c383efd64b06e`, plan `f9de8600e28e910b`. HEAD is 3533dbf, and nothing under `respin/` is dirty.

## Round-1 closure table

| R1 | Status | Evidence (card line) |
|---|---|---|
| H1 holdout re-runnable until pass | **Partially closed; class still open → N1** | Voiding is removed (`:303-304`) and brief-set changes are limited to consent withdrawal (`:339`). But `:305` still lets a changed candidate re-run on LR1, `:338` hands per-brief holdout rows to implementers, and nothing caps k or pins thresholds across looks. |
| H2 no isolation mechanism | **Learning half closed; context half open → N2, N3, N4** | Fresh profile per (brief, arm), controls unused, row counts on `generation_feedback`/`promotion_proposals`/`results` (`:358-362`). Checked in code: a feedback proposal needs ≥3 distinct generations in one profile (`proposal.ts:355`), which a fresh single-run profile cannot reach. This is structural, and stronger than the card claims. |
| M1 baseline input/output mapping | Closed | T-B1/T-B2, first 3 of 3–5, "filming alone" limit (`:346-350`). Re-verified `modes.ts:261`, `assemble.ts:408,412,459`. |
| M2 judge roles/blinding | Roles closed; blinding overclaimed → N5 | `:377-380` |
| M3 pass rule pools across creators | Closed, weak floor → L4 | `:393`, `:401` |
| M4 formChoice source | Closed | `:318`, `:353-354` |
| M5 S flags not gating/reported | Closed, with an unlabelled override → N6 | `:381-385`, `:394-396` |
| M6 holdout protects text, not results | Closed only up to the candidate freeze → N1 | `:338` |
| L coin-flip imbalance | Closed | `:363` |
| L config/served model per run | Closed; same-model rule missing → L3 | `:364` |
| L call cap headroom/order | Closed | `:406-410` |
| I paired 2×2, REG-30, salted hashes | Closed | `:402`, `:181`, `:332` |

## Findings

**N1 — CHANGE, rated High (confidence about 75%). The holdout is still re-usable until it passes; this is H1's class.** Card `:305-306`, `:338`, `:304`; plan `:168`.
- `:305` offers a choice: fresh briefs, **or** "look k on holdout LR1". Plan T7-B/C (`:168`) *requires* "fresh tasks/untrained participants for retest, unchanged holdouts".
- `:338` releases the holdout text and per-brief results to implementers once the candidate identity is recorded. T7-B/C correction batches are built from exactly those failures. So look k > 1 on LR1 is tuned on the holdout by construction, despite `:336`'s rule.
- Nothing caps k.
- Nothing says whether a look-k pass satisfies LA-4 or pilot admission. `:306` only governs how it is labelled.
- `:304` lets a manifest change (including threshold or rubric) apply to later looks on the same LR1.
- Net effect: the pass can still be reached by re-looking. It is now labelled honestly, but it still decides admission. This is the R-10 failure mode.
- **Fix:** only a first look on a never-exposed brief set can satisfy LA-4. Looks k > 1 on LR1 are reported as diagnostics, never as admission. Rubric and thresholds are immutable for every look on LR1. The per-brief release in `:338` is limited to after the admitting look.

**N2 — CHANGE, Medium. "Restored to the recorded brain-doc versions" is not a product operation.** Card `:358`, `:364`.
- `brain_docs.version` is server-derived as max+1 per (profile, kind) (`respin/packages/db/src/brain-schema.ts:195-200`). A fresh profile can never hold "the recorded versions".
- Every version needs non-empty `source_evidence` whose `inputId`s validate against `onboarding_inputs` in the same profile (`:202-217`, `:362-365`).
- An active version needs a human confirmation stamp (`:346-349`).
- Generation refuses without an activation snapshot (`respin/packages/credits/src/generate.ts:632-637`).
- There is no import, clone or restore path. The only writers of a first version are `infer-voice.ts:299` (a priced, non-deterministic model call) and `interview-ops.ts:589,596`. `editBrainDocument` needs an existing base (`brain-ops.ts:933-939`).
- That leaves three ways to "restore":
  - (a) 40 inference runs. Context then differs by arm, which breaks "identical across arms", and those calls sit outside the spend cap.
  - (b) A raw-SQL insert. That bypasses the sole brain writer; defer to `respin-tenancy-reviewer`.
  - (c) The arms cannot run as written.
- Nothing in the proof checks that context was identical. The row counts only show that nothing changed during a run.
- **Fix:** name the sanctioned restore path (copy inputs → interview/edit writer → confirm → activate). Define "identical" as equal sha256 of each activated doc's content, and assert it per (brief, arm) from `generations.brain_activation_id`. Put setup calls under their own recorded budget.

**N3 — CHANGE, Medium. The isolation assertion's table set does not match the builds, and "isolation failure = brief failure" can bias one arm.** Card `:362`, `:373`, `:398`.
- `creative_pieces` does not exist at baseline 3533dbf. I grepped all of `respin/`: zero hits. The table list under `packages/db/src` has no such table.
- A literal before/after count therefore errors in every baseline profile. Under `:362`/`:373` that fails every baseline brief, which inflates the "candidate only" cells of the paired 2×2 (`:402`). Reading it as 0 instead breaks "absent is never zero".
- "No change other than…" (`:362`) is unscoped. Each run legitimately writes `credit_ledger`, `model_usage` and `workspace_spend_monthly`. If the rule covers the whole database, every brief in both arms fails.
- The allowed-change list is frozen before L2/L3 design their writers. For example, L3 "selection/rejection notes" via `feedback-ops.ts` might land in `generation_feedback` (low confidence).
- **Fix:** freeze the counted set per build, marking an absent table "n/a" rather than 0. Scope the rule to the named tables. Report isolation failures as their own category in the 2×2, not as that arm's quality failure.

**N4 — CHANGE, Medium. "The recent-work window is empty, identical across arms" contradicts L3.** Card `:359`; plan `:113`.
- L3's relevance order is "the current piece first". The candidate's script commission therefore sees its own concept set.
- The baseline has no such channel at all.
- As written, the claim is false for the integrated build, or it requires switching L3 off, which means the candidate is no longer the integrated build.
- **Fix:** "empty at run start". Then assert that the record IDs L3 stores with the request snapshot (plan `:113`) are a subset of the run's own records.

**N5 — CHANGE, Medium. Blinding is overclaimed.** Card `:377` vs `:343`.
- `:377` says the neutral template means "an arm cannot be told apart by format".
- `:343` says the arms differ in output contract: baseline ideas are hook + thesis + framework (`modes.ts:247-250`); candidate concepts carry premise and filming fields (plan `:79`). The fields that are filled in reveal the arm.
- The creator, as sole C judge, may favour the newer shape.
- **Fix:** state that blinding is partial, and record each judge's arm guess as a blinding check reported next to C and F.

**N6 — CHANGE, Medium. The owner release of a withheld pass has no reporting label.** Card `:396` vs `:385`; plan LA-4 `:164`.
- `:385` says an S flag is "never resolved away". `:396` lets a named owner disposition "release" a pass withheld for an S flag or a zero-C/F creator.
- Nothing says how a released result is reported. Plan LA-4 says "no **unresolved** … claims", which invites reading the release as a resolution.
- **Fix:** a released result is always reported as "not passed — released by <owner> on <date>, S = k, creators at zero = m", never as a pass.

**L1 — LOW. Profiles, tier and environment per arm are unstated.** Card `:358`, `:345`.
- `profileCaps` allows at most 5 profiles per workspace (studio) (`respin/packages/config/src/schema.ts:115-123`; `seed.ts:78`). 40 fresh profiles need ≥8 workspaces or archiving, and `:358` says "a research-owned workspace".
- The baseline (3533dbf) and candidate (migrated schema) need separate deployments and databases. Tier should be identical across arms.

**L2 — LOW.** Setup model calls (brain restore, clarification re-submissions under `:370`) sit outside the 240-call cap and the USD cap (`:406-410`).

**L3 — LOW.** `:364` records the served model id but does not require it to match across arms. A model change is not "workflow" (`:343`). Require a match, or report it as a named confounder.

**L4 — LOW.** The per-creator floor (`:393`) is only ≥1 acceptable. A 5-brief creator at 1/5 still passes. The per-creator report (`:401`) keeps this visible; consider a majority floor.

**NOTE.** State the structural guarantee in `:312`: a fresh single-run profile cannot reach `MIN_COMPARABLE_RESULTS` for feedback proposals (`proposal.ts:355`). It is a stronger proof than the row counts.

**NOTE.** Baseline gets approved creator context twice (T-B1 text box plus brain docs); candidate gets it once. This is covered by "input channels" (`:343`), but should be named in the known limits.

## Checks run

- **#1 sole emitter:** n/a to the code (no `respin/` diff). The manifest bars proposals (`:312`, `:360`); the structural guarantee is confirmed (see NOTE).
- **#2 minimum n:** n/a (no proposal path touched).
- **#3 unverified never learns:** holds at `:312`; no evaluation data goes to `results`.
- **#4 no pooling / no collapsing:** holds.
  - `:312` says reach and conversion are not reported.
  - C and F are kept separate throughout (`:379-385`, `:391-393`).
  - The per-cell n rule is at `:401`.
- **#5 own baseline:**
  - Holds for per-brief pairing (`:402`).
  - Context identity across arms is violated → N2, N4.
  - The isolation proof is biased → N3.
- **#6 declared metric:** n/a. Preparation quality is explicitly not a performance metric (`:312`).
- **#7 approval writes:** holds, with a raw-restore risk deferred to tenancy (N2).
- **#8 two claims:**
  - Holds at `:403-405`: "in pilot", engineering and evidence kept separate.
  - Violated at `:305` and `:396`: admission is reachable by re-looking or by an unlabelled release → N1, N6.
- **#9 number provenance:**
  - 16/20 is cited to LA-4 (`:390`).
  - The cap arithmetic `:407-408` checks out (80×2 + 80 = 240).
  - The `:305` citation of plan `:168` is accurate, but the card contradicts the text it cites.

## Coverage

- **Read fully:** the L0 card (442 lines); plan `:50-184`; the skill canon; `gate-rules.md`.
- **Read in part:**
  - `brain-schema.ts:100-367`
  - `generate.ts:610-669`
  - `proposal.ts:320-364`
  - `brain-ops.ts:880-950`
  - `assemble.ts:395-471`
  - `modes.ts:245-264`
  - `config/src/schema.ts:110-129`
- **Commands run:**
  - sha256 of the three frozen files before and after: identical.
  - `git rev-parse` gave 3533dbf; `git status respin` showed 0 dirty files.
  - Grep of the table list gave 60+ tables, none of them `creative_pieces`.
  - Grep for `creative_pieces|creativePieces` across `respin/`: 0 files.
  - Grep for `writeBrainDoc` call sites: `infer-voice.ts:299`, `brain-ops.ts:1101`, `interview-ops.ts:589,596`, `promotion-ops.ts:801`.
  - Grep for an import/restore/clone path for brains or profiles: none.
  - Grep of `profileCaps` in the seed: `{free:1, creator:1, pro:1, studio:5}`.
- **Not read:** `interview-ops.ts` internals (whether it makes a model call); `feedback-ops.ts` (L3's future writer).
- **Gate-rules §6 caveat:** this phase is docs-only, and the manifest is the deliverable under review, as it was in round 1. `EVIDENCE_PLACEHOLDER` and the missing ledger line were not filed.

## Verdict

**NEEDS CHANGES.** The one High (N1: the holdout can be re-used until it passes, H1's class) survived the permitted re-run, and five Mediums show the isolation design asserting context identity and table state the product cannot provide at 3533dbf.
