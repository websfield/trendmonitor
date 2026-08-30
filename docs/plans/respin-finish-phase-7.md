# Slice 7: The rest of the Studio

## A creator can…
**Use all seven modes, revise an output with its lineage intact, and give feedback that is captured.**

## Why this shape

Slice 6 built the pipeline and one mode. This slice is **volume on a proven pipeline plus four genuinely new mechanisms**: the framework library/private frameworks, revision lineage, feedback capture, and the full tier→mode gate. The volume is the cheap part; those mechanisms are where the findings will be, and the card is weighted accordingly.

**One deadline rides on this slice and is not about this slice.** `tech-spec.md:18` requires the background-runner decision to be recorded **before slice 8's phase plan is written**, and the end of slice 7 is that deadline. A card written against an unchosen scheduler selects the scheduler, which is how AC-66 came to choose its own implementation. **Slice 7 is not done until that decision is in `decisions.md`** — see "Done when".

## Open items closing here
R-30.7 plus REQ-C01–C08. It **opens** one feedback-learning obligation handed to slice 9 (question 1) and owns PRD B04's first-three-ideas onboarding handoff.

## Prerequisites
- [ ] Slice 6 shipped — the pipeline, the kill test, the generation store, the tier map, and free-tier credit all exist
- [ ] Nothing else. This slice adds no new authority
- [x] *(discharged early)* The background-runner decision this slice's end was the deadline for is **already recorded — R-52 (2026-08-29, delegated)**. Task 8 and the Done-when bullet are satisfied in advance; nothing here re-opens the choice

---

## The three questions the stub left open, answered

### 1. Where does captured feedback live between slice 7 and slice 9?

**In a `generation_feedback` table read through one scoped raw accessor; only `packages/brain` may aggregate it.**

R-10 and R-44 make `packages/brain` the **sole construction site for promotion proposals**, and it does not exist until slice 9. Capture and construction are different acts: storing "the creator said this was too cringe" is a fact; deriving "your voice profile should ban X" is a proposal. Slice 7 does the first and must be unable to drift into the second.

The instrument is available and has a precedent in this repo. `@respin/trends` is **pre-registered as a denied import name** in `tests/import-boundary.test.ts:862` — a guard written before the thing it guards exists. The same shape applies here: a source scan permits exactly one raw table reader in `@respin/db`. UI, export and `packages/brain` call that scoped accessor. A second raw query fails the scan; a second aggregating/proposal constructor outside `packages/brain` fails a separate scan.

**Its honest limit, stated:** a scan cannot infer semantic intent. It can enforce raw-access ownership and constructor location; tests must separately prove UI/export return raw scoped events and `packages/brain` performs aggregation. The non-vacuity cases plant a second raw query and a proposal constructor outside `packages/brain`.

### 2. Does a revision re-run the kill test, or inherit its parent's verdict?

**Re-run, always, and this is not a close call.** A revision produces new text; a kill test is a property of text. Inheriting a parent's verdict means a revision can carry a `passed` badge over content the test has never seen — which makes "every output passes the creator's KillTest before display" (REQ-C03) false while every stored verdict says it is true.

The similarity gate does not enter here: it is **spin-only** (tech-spec §3 step 4), stated in four places in the source (`echo.ts:9-10`, `onboarding-schema.ts:44-45`, `with-workspace.ts:2121-2122`, `profile-scope.test.ts:1399`), and it does not exist until slice 8.

**What a revision may legitimately inherit is work, not verdicts** — REQ-C06's "without repeating unchanged work" is about not re-assembling context and not re-deriving the thesis, and that is a prompt-assembly decision, not a gate decision.

### 3. What is the "checking" state checking, and what does a creator see if it fails after tokens were spent?

**It is checking the kill test and the REQ-I03 traceability scan on the buffered result** — both of which need the whole output and therefore cannot run on a stream (tech-spec §3's own sequence: show the stream, mark it checking, then finalise or auto-rewrite).

The failure case is where the design decision is, and it has one rule:

> **A streamed draft that fails the check must not remain on screen as though it were output.**

A creator watching text arrive has already read it. If the check then kills it, leaving it visible — greyed, collapsed, behind a warning — presents unvetted text as product output, which is the thing the kill test exists to prevent. It is replaced by the honest refusal (slice 6 R6), and the refusal says **the tokens were spent, what fired, and what to try** — because a creator who watched a script appear and then vanish will otherwise conclude the product is broken rather than that it refused.

The credit is still debited, per slice 6's question-4 table: an honest refusal is the product working.

---

## Requirements

### The six remaining modes (REQ-C01)
- [ ] **R1:** Modes 1–7 exist: footage-to-thesis, idea-to-script, source-to-reel, analyse-and-spin, hooks (slice 6), caption, ideation. Each is a **data entry in the mode registry**, not a branch — the registry is what slice 6's R18 built the tier map against. The registry reads only approved, non-retired shared frameworks plus the scoped profile's eligible private frameworks.
- [ ] **R2:** Every mode produces schema-valid `ScriptOutput` against a seeded test brain (M3's acceptance criterion, inherited verbatim).
- [ ] **R3:** **Source-to-reel never summarises its source** (REQ-C01 mode 3). It extracts insights and rebuilds them through the creator's stakes. A summariser is a different product and is the failure mode this mode has by default.
- [ ] **R4:** **Hook sets span different mechanics** (REQ-C04) — three to five hooks that differ in creative thesis, never five wordings of one. This is a property of the output, so it needs a check on the output, not an instruction in the prompt.
- [ ] **R5:** Ideation returns **hook + thesis + framework**, never a list of topics (REQ-C01 mode 7). The slice-3b onboarding handoff invokes this mode and displays the creator's first three ideas, closing PRD B04.

### Framework library and private frameworks (R-30.7 / PRD D05)
- [ ] **R5a:** Seed approved F1–F9 shared frameworks with `owner_profile_id`/`workspace_id` NULL and explicit `curator_status`. The mechanism-level content scan rejects personal names, handles, follower counts, personal-account URLs and metric values, with planted violations.
- [ ] **R5b:** The shared-library reader defaults to `approved AND retired_at IS NULL`; proposed/rejected/retired rows never enter generation. A saturated framework is labelled as such and requires fresh interpretation rather than being presented as a guaranteed tactic.
- [ ] **R5c:** Pro+ creators can create, read, edit/version and retire private frameworks scoped to their profile/workspace. The tier map refuses Free/Creator as specified by the pricing contract; viewers cannot mutate. Private rows are export/deletion governed and cannot masquerade as shared/curated rows.

### Revision and lineage (REQ-C06)
- [ ] **R6:** A revision note produces a new `generations` row with `parent_id` set through a composite FK `(parent_id, profile_id, workspace_id)` → `generations(id, profile_id, workspace_id)`. The server derives scope, selects only an earlier same-scope parent, and parent ids are immutable after insert. Those enforced properties—not prose—make cycles impossible.
- [ ] **R7:** A revision **re-runs the kill test and the traceability scan** (question 2). No verdict is inherited.
- [ ] **R8:** A revision is priced as `creditCosts.revision` (seeded at 2, no reader today), through slice 6's per-purpose price lookup — **not** at the parent mode's price.
- [ ] **R9:** The lineage is **readable by the creator**: which output came from which, and what the note said. A parent chain nothing renders is the "capability nothing can reach" shape.

### Feedback capture (REQ-C05)
- [ ] **R10:** Feedback is a **structured event**, not free prose in a column: a closed set of reaction codes plus optional creator text, on a `generation_feedback` table with composite FK `(generation_id, profile_id, workspace_id)` → `generations(id, profile_id, workspace_id)` and all scope columns NOT NULL. The closed-code discipline is `brain-reason.ts`'s, and it exists because caller prose in a governed column is what C-42 removed.
- [ ] **R11:** **Nothing in this slice derives a rule, proposal or aggregate from feedback.** One scoped raw accessor serves UI/export and later `packages/brain`; scans forbid other raw table readers and proposal constructors outside `packages/brain`.
- [ ] **R12:** The screen says what feedback does and does not do **today**: it is recorded, and slice 9 may use repeated same-target reactions or comparable results to propose—not silently apply—rules. It must not say the brain is learning — `tests/support/forbidden-claims.ts:44-54` already bans `learn`, `improv`, `train`, and this is precisely the screen where that ban earns its keep.

### Tier gating (REQ-G01 pricing table)
- [ ] **R13:** Free gets **hooks, captions, ideas only**; all seven on Creator and above. The map slice 6 built is filled in; the tier authority stays `getWorkspaceBillingState`.
- [ ] **R14:** The gate is **complete by construction** — a mode with no entry in the tier map fails a test rather than defaulting to allowed. This is the R-36 lesson (the import boundary was default-ALLOW for any package that did not yet exist) applied to modes, and it is cheap here and expensive later.
- [ ] **R15:** The refusal names what the creator can do without naming a bare upgrade as the remedy — the constraint `billing-errors.ts:696-708` already encodes for `server_at_capacity` and `:651-660` for `profile_cap`.

### Streaming
- [ ] **R16:** If streaming ships, the "checking" state is real (question 3) and a failed check **replaces** the draft. If streaming is deferred, the screen says the output is being prepared and does not imply a stream — an animated placeholder that suggests live generation is a claim.
- [ ] **R17:** A stream that dies mid-flight is a refusal with a `model_usage` row, not a half-output. R-40's overall deadline (`llm.overallDeadlineMs`, 40s against §7's 45s budget) already bounds it; this slice must not exceed §7's budget by adding six modes' worth of context to the same call.

### Honesty
- [ ] **R18:** **"Why this performs" names the weakest point on every mode** (REQ-I04), not just on the two where it was easy.
- [ ] **R19:** REQ-C08's anti-homogenisation is `[Could]` and is **explicitly out of scope**, said in the ledger rather than left as a silently-dropped requirement. REQ-C07's series planner is `[Should]` and Pro+ — build it or record the deferral with its tier note.

---

## Left to the developer

- **Whether the six modes land in one commit or six.** Six is easier to review and the slice rule is satisfied either way; the pipeline is already reachable.
- **The reaction-code set** (R10) — its invariant is that it is closed and server-validated.
- **Whether streaming ships in this slice** (R16), subject to saying so honestly either way.
- **Test file layout.**

## Tasks
1. [ ] The six modes as registry entries + their prompt templates (R1–R5)
1a. [ ] Seed/validate approved F1–F9, add the approved/non-retired reader, saturation state and Pro+ private-framework CRUD/versioning (R5a–R5c)
2. [ ] Composite same-tenant `generations.parent_id`, immutable earlier-parent operation, price and lineage view (R6–R9)
3. [ ] Composite-scoped `generation_feedback` + all instruments + sole raw accessor and reader/constructor scans (R10, R11)
4. [ ] Feedback UI and its honest copy (R12)
5. [ ] The full tier map + the completeness test + refusal copy (R13–R15)
6. [ ] Streaming and the "checking" finalisation, or its honest deferral (R16, R17)
7. [ ] Weakest-point coverage across all seven modes (R18); record C07/C08 dispositions (R19)
8. [x] **Record the background-runner decision in `decisions.md`** — done early as R-52 (2026-08-29); re-verify it still stands when this slice ends, and supersede by appending if slice 6/7 reality changed the inputs
9. [ ] Walk it: generate in each of the seven modes → revise one → read the lineage → leave feedback

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/modes/**` | Modify | Six modes, the registry, R4's mechanic-spread check |
| `respin/packages/db/src/frameworks.ts` | Create/Modify | Shared approved reader, F1–F9 seeder and private-framework operations |
| `respin/packages/llm/src/assemble.ts` | Modify | Per-mode assembly |
| `respin/packages/db/src/generation-schema.ts` | Modify | `parent_id`, `generation_feedback` |
| `respin/packages/db/migrations/0018_*.sql` | Create | Same-tenant lineage/feedback constraints and private-framework versioning if needed |
| `respin/packages/db/src/creator-data-registry.ts` | Modify | `generation_feedback`'s export and deletion decisions |
| `respin/packages/db/src/export.ts` | Modify | Feedback joins the export |
| `respin/app/(product)/studio/**` | Modify | Mode picker, revision, lineage, feedback, the checking state |
| `respin/app/(product)/billing-errors.ts` | Modify | Tier refusals and the revision refusals |
| `respin/tests/feedback-readers.test.ts` | Create | Question 1's pre-registered scan + its planted third reader |
| `respin/tests/table-writers.test.ts` | Modify | `generation_feedback`'s manual registration |
| `docs/initial/decisions.md` | Modify | The background-runner decision (task 8) |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **All seven modes generated in a browser**, against the real vendor, each producing a valid `ScriptOutput`
3. [ ] A revision → new row, `parent_id` set, kill test **re-run**, priced as a revision (R6–R8)
4. [ ] A revision of an output whose parent passed, where the revision violates a hard rule → **refused** (R7's whole point)
5. [ ] A mode added with no tier-map entry → a test fails (R14's non-vacuity)
6. [ ] Free attempting a paid mode → refused, copy does not offer a bare upgrade (R13, R15)
7. [ ] Plant a second raw `generation_feedback` query and a proposal constructor outside `packages/brain` → the respective scans fail (R11)
8. [ ] Feedback screen scanned for `learn`/`improv`/`train` → clean (R12)
9. [ ] Hook set with five wordings of one thesis → caught (R4)
10. [ ] A killed stream → the draft is gone, the refusal names the spend (R16, question 3)
11. [ ] Complete onboarding's first-three-ideas action → exactly three schema-valid Ideation outputs with hook + thesis + eligible framework (R5/B04)
12. [ ] Proposed/retired shared frameworks never appear; an approved one does; a saturated one warns; Pro+ private framework CRUD is scoped/exportable and lower tiers refuse (R5a–R5c)
13. [ ] Cross-workspace parent and feedback ids, a later/nonexistent parent, and parent mutation all refuse (R6/R10)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Revision inherits the parent's kill-test verdict | Verification 4 |
| M2 | Tier map defaults unknown modes to allowed | Verification 5 |
| M3 | Revision priced at the parent mode's cost | R8's pricing test |
| M4 | Raw feedback-reader allowance widened to a directory | Verification 7's planted reader |
| M5 | `parent_id` written as null on revision | R6's lineage test |
| M6 | Failed check leaves the streamed draft on screen | Verification 10 |
| M7 | Source-to-reel prompt turned into a summariser | R3's check |
| M8 | Mode registry reads proposed or retired frameworks | Verification 12 |
| M9 | `parent_id` FK drops profile/workspace columns | Verification 13 |

**Population note — read before reporting "N of N".** Seven mutations on code that will exist. **The hazards this matrix cannot reach are the output-quality requirements**, and they are the majority of this slice: R3 (does not summarise), R4 (mechanics genuinely differ), R5 (ideas not topics) and R18 (weakest point is real, not boilerplate) are all properties of generated text, and a check on them is necessarily weaker than the requirement. State in the ledger which of the four have a real check and which have a proxy, and **do not report a proxy as coverage**. This is also why `build-plan.md` M3's evidence criterion — 10 real generations with a logged quality verdict — is a separate claim from the engineering one, and it stays separate here.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser across all seven modes
- [ ] **Spin compliance**, **learning honesty**, **billing** (Full gates) and **brain tenancy** (Full gates) PASS — reviewers in **isolated worktrees**
- [ ] `decisions.md` carries: the feedback raw-access/construction boundary, the revision same-tenant/immutable-parent decision, framework curation/private ownership, and the C07/C08 dispositions
- [x] **The background-runner decision is recorded in `decisions.md`** — R-52, taken 2026-08-29, ahead of this deadline (`tech-spec.md:18`)
- [ ] `build-plan.md` M3's engineering criteria are measured; its evidence criterion is reported separately and honestly
