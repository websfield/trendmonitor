# Slice 5: Brain editing, versions, export

## A creator can…
**Edit Voice, Strategy, Kill Test or their declared metric, see the version they replaced still readable, and export the whole brain as JSON and markdown.**

That sentence is the acceptance test and it is walked in a browser. "Still readable" is load-bearing: `brain_docs` is append-only and today **nothing reads a superseded row** — `readVoiceBrain` returns the newest `proposed` and the newest `active` only (`brain-ops.ts:156-158`). The row survives and the creator cannot see it, which `brain-view.tsx:313-321` already says out loud.

## Why this shape

Slice 3 gave a creator a brain the *product* wrote. This slice is the first time the creator writes one. Three things follow, and they are the whole slice:

1. **An edit is a write, so it goes through `writeBrainDoc`** — the same versioning, the same echo bar, the same quote budget, the same provenance rules. Any other path is a second writer of brain-document content, which R-44 names as the trigger that inverts its own argument and forces `packages/brain` early.
2. **`source_evidence` is `NOT NULL` with a non-empty CHECK** (`brain-schema.ts:288-291`), so an edit *must* cite something. A value the creator typed has no quote from a post. This is the slice's one genuinely new design problem and §"The four questions" answers it.
3. **REQ-A04's export half has nothing behind it.** Not thin — absent. `packages/db/src/export.ts` is not a file, `exportBrain` has zero hits, there is no markdown renderer anywhere in `respin/`, and there is no `/export` route. The 6–8 h estimate is that absence, not polish.

## Open items closing here
Brain-surface tasks **15, 21, 22, 23, 37, 44**. R-30.7 is owned by slice 7 with the shared-library reader.
Claims and evidence: [`../progress/respin-finish-open-items.md`](../progress/respin-finish-open-items.md) — do not restate them here.

## Prerequisites
- [ ] **Slice 3b closed.** This slice edits all three document kinds and the declared metric, so it starts from one coherently activated Creator Brain.
- [ ] The `creator_authored` writer and coherent activation snapshot built in 3b are re-read and reused; this slice must not add a parallel input or activation path.

---

## The four questions the stub left open, answered

**1. Is the export registry-driven off `CREATOR_DATA_REGISTRY`?**

**Yes, and this is the single most important decision in the slice.** `creator-data-registry.ts:45-129` already carries six entries, each with an `export: {included, reason}` decision, and `tests/creator-data-registry.test.ts:151-159` already fails when *any* table created by *any* migration is neither registered nor listed in `NOT_CREATOR_DATA`. That instrument is the population, and it is already complete and already enforced.

So the exporter **iterates `CREATOR_DATA_REGISTRY` and refuses to run against a table it cannot classify**, rather than naming its tables inline. This is CLAUDE.md's 2026-08-29 lesson applied before the defect rather than after it: a derived guard is only as wide as its population, and a population written as one path narrows silently the day a second path appears. Here the population is already a list, already tested for completeness, and already required to grow when a migration adds a table. Slices 6, 8 and 9 each add tables (`generations`, `trend_items`, `results`), and each will join the export by being registered — which is the only property that makes REQ-A04 survive four more slices.

**The non-vacuity requirement that comes with it:** a test must plant a registered-and-exported table that the exporter has no query for, and see the export **refuse**, not silently omit it. An exporter that iterates a registry it does not actually read is the fail-open shape (CLAUDE.md 2026-08-21).

**2. Markdown for whom?**

**A human reading their own brain.** JSON is the machine round-trip and the REQ-A04 artefact of record; markdown is the thing a creator opens to see what the product believes about them, with each claim under its heading and its quote beneath it. They are different documents and the slice ships both — but only the JSON is required to be complete. The markdown is allowed to be a readable projection, and it says so in its own header.

Consequence: **markdown is not a round-trip format and nothing may import it back.** State that in the file itself, because a markdown export that looks re-importable is a data-loss bug waiting for its first user.

**3. Does an edit go through `writeBrainDoc`, and what is its evidence?**

**Yes, through `writeBrainDoc`, with `reason: "creator_edit"` — a code that already exists and has no caller** (`brain-reason.ts:51`, rendered at `:116`). And the evidence problem is solved by the input class the schema already has and nothing writes:

> **An edit stores the creator's typed text as a `creator_authored` onboarding input, and the new brain version cites that input as the evidence for the field it changed.**

This is not a workaround, it is the honest answer. The warrant for "you write like this" after an edit is *"you told us so, on this date"* — and that is exactly what a `creator_authored` row records. Four properties fall out for free:

- `validateSourceEvidence`'s verbatim-at-offsets check passes by construction, because the quote **is** the stored text.
- The non-empty `source_evidence` CHECK is satisfied without inventing a citation.
- `REFERENCE_BARRED_KINDS` (widened in slice 4) is unaffected: `creator_authored` is not `reference`, so a creator's own declaration may ground an allowed edit while a barred reference still may not.
- The R-3 quote budget and the echo bar are untouched, because they key on `reference`-classed inputs.

**Its cost, stated:** `onboarding_inputs` is immutable and export-included, so every edit permanently adds a row the creator cannot delete. That is the same property their pasted posts already have, and it is the price of provenance being real. The paste-side attestation (R-47) has **no analogue here** and must not be copy-pasted: the creator is not asserting authorship of a post, they are stating a rule about themselves, and the copy says that instead.

**4. Where did framework seeding go?**

To slice 7, unconditionally. A shared-library seeder has no production reader in this slice and would
violate the master plan's reachability rule. This slice keeps only the private-framework export accessor
needed for registry-complete export; slice 7 owns R-30.7, the F1–F9 content assertion, approved/retired
library reads and Pro+ private-framework creation as one creator-reachable unit.

---

## Requirements

### The version history (the "still readable" half)
- [ ] **R1:** A read path returns **all** versions of a kind for a profile, ordered, with status and both timestamps. Today `readVoiceBrain` returns two rows; the accessor `brainDocs` (`with-workspace.ts:476`) returns everything unordered and is not exposed through the facade. Either is a fine base — what is not fine is a second query built inside the export (task 21's shape).
- [ ] **R2:** A superseded version renders **read-only, with its own quotes**, and says when it was replaced and by which version. `EvidenceUnreadableError` must not take the history page down: a version whose evidence no longer reads back **annotates** (R9 below), because history is the one surface where an old row is expected to be imperfect.
- [ ] **R3:** `brain-view.tsx:313-321`'s copy — which currently tells the creator that superseded versions are surfaced by nothing and no export exists — **is corrected in this slice**. A screen that keeps a true-then, false-now sentence is worse than one that never had it.

### The edit (REQ-B02 / REQ-C05)
- [ ] **R4:** Editing a claim position in Voice, Strategy or Kill Test produces a **new `brain_docs` version** through `writeBrainDoc`, kind unchanged, `reason: "creator_edit"`, status server-derived `proposed`. Editing the declared metric is a Strategy edit using its structured fields. The active coherent brain is untouched until the new document is confirmed and activated through 3b's existing path.
- [ ] **R5:** The edit writes a `creator_authored` `onboarding_inputs` row and cites it (question 3). **One row per edit submission**, not per field, and the evidence entries index into it — so the offsets are real offsets into a real stored string, not a per-field fiction.
- [ ] **R6:** The unchanged fields of the new version **carry their previous evidence forward**, re-validated. A version that keeps a claim but drops its warrant is a silent provenance loss, and `confirmationSha256` now covers the pair (R-45), so it would also invalidate every confirmation.
- [ ] **R7:** An edit is refused for a `viewer` (`assertMayWrite`) and under an open pause (`WorkspacePausedError`) — both already enforced inside `writeBrainDoc`; what this slice owes is that **the refusals reach the screen as copy**, per `billing-errors.ts`'s four-step pattern, not as "Something went wrong".
- [ ] **R8:** Editing a field to `[check]` is **allowed and means "I do not want the product to assert this"** — but the whole-document all-`[check]` case is refused by the non-empty `source_evidence` CHECK, and the refusal copy must say which, because "you cannot blank every rule" and "something went wrong" are different sentences.

### The export (REQ-A04, task 22)
- [ ] **R9:** **The export never throws.** `echo.ts:401` states the annotate-mode rule and nothing implements it. A row whose quote no longer reads back at its offsets is **annotated in the output** ("this quote could not be verified against the stored post") and the export completes. A data-subject right that fails closed on one bad row is the control becoming the outage (CLAUDE.md 2026-07-30).
- [ ] **R10:** **Absent is never zero** (task 44). A claim-bearing array with no entries renders "no rules recorded" and never `0`, never an empty bullet, never a silent omission. A `[check]` position renders the same named absence the confirm screen uses (`PLACEHOLDER_ABSENCE`, `copy.ts:82-83`) — one string, one source.
- [ ] **R11:** The export is **registry-driven** (question 1) and **refuses on an unclassifiable table**, with the non-vacuity test named there.
- [ ] **R12:** The export is **exempt from the pause gate** — PRD §4G's 2026-08-21 amendment says so in terms ("reading is not writing, and withholding a creator's own data during a pause would be worse than what the pause protects against"). A test drives it under an open pause.
- [ ] **R13:** Cross-profile and cross-workspace isolation is asserted on the export path specifically (task 23). It is a new read surface over the tenancy anchor and REQ-A03 is structural — this is where a `profileId` that belongs to someone else must produce `ProfileAccessError`, not a partial export.
- [ ] **R14:** JSON is complete against the registry; markdown is a human projection and says so in its own header (question 2).
- [ ] **R15:** The `frameworks` accessor (task 21) exists on `ProfileAccessors` so the export does not build its own framework query — and it returns **private rows for this profile only**. `visibility='shared'` rows are library content, excluded, per the registry's own split (`creator-data-registry.ts:115-128`). It is an export reader, not justification to seed shared rows here.
- [ ] **R15a:** Attempting an edit that echoes the stored reference corpus is refused by the hard write path with the actionable slice-4 copy. This is the first creator-reachable browser **write** refusal and closes slice 4's explicit handoff.

### Honesty
- [ ] **R16:** No screen in this slice claims the brain is more accurate because the creator edited it. An edit is a change, not an improvement, and the product has no evidence either way until slice 9.

---

## Left to the developer

- **Whether history is a tab on `/brain` or its own route.** R2's invariant is that a superseded version is readable with its quotes, not where it lives.
- **The export's delivery shape** — a Route Handler under `app/api/` is the natural fit and is the only shape that can set `Content-Disposition`; a server action returning a string that the client turns into a download is also defensible. What is *not* defensible is a shape that puts the whole brain in a URL.
- **Whether JSON and markdown are two requests or one archive.**
- **The markdown layout**, subject to R10 and R14.
- **Test file layout.**

## Tasks
1. [ ] The version-history read: one accessor or facade method (R1), ordered, all statuses
2. [ ] `/brain` history rendering, read-only, with quotes and the replacement stamp (R2, R3)
3. [ ] The edit form + action: `creator_authored` input write, evidence construction, carry-forward of unchanged fields (R4–R6)
4. [ ] Refusal copy for every class the edit path can throw, through `billing-errors.ts`'s four steps (R7, R8)
5. [ ] `export.ts`: registry-driven walk, annotate-never-throw, absent-never-zero (R9–R11, R14)
6. [ ] The `frameworks` accessor, private-only (R15)
7. [ ] The delivery route/action, pause-exempt (R12), isolation-asserted (R13)
8. [ ] First live hard-write refusal: edit a field to echo a stored reference and render slice 4's actionable refusal (R15a)
9. [ ] Walk it: edit each document kind and the metric → confirm → activate → open history and read the versions replaced → export JSON and markdown

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/export.ts` | Create | The registry-driven exporter, annotate mode, JSON + markdown builders |
| `respin/packages/db/src/with-workspace.ts` | Modify | The `frameworks` accessor (R15); the ordered all-versions read (R1) |
| `respin/packages/db/src/brain-ops.ts` | Modify | The edit composition: `creator_authored` write + `writeBrainDoc` in one transaction |
| `respin/packages/db/src/app-server.ts` | Modify | `exportBrain`, ordered history, edit-document/metric operations — `WorkspaceScope` **positionally** (AC-13 scan) |
| `respin/app/(product)/brain/**` | Modify | The edit form, the history panel, the export control, the corrected copy |
| `respin/app/api/export/route.ts` | Create | Delivery with `Content-Disposition` (if that shape is chosen) |
| `respin/app/(product)/billing-errors.ts` | Modify | Copy for every new refusal class, per the four-step pattern |
| `respin/packages/db/tests/export.test.ts` | Create | R9's annotate, R10's absence, R11's registry non-vacuity, R13's isolation |
| `respin/tests/creator-data-registry.test.ts` | Modify | The exporter now *reads* the registry — assert that, not just that it is complete |
| `respin/tests/brain-ui.test.tsx` | Modify | History rendering, edit form, R19's honesty scan |
| `respin/tests/table-writers.test.ts` | Modify | Reuse/pin 3b's `creator_authored` writer; no shared-framework writer ships here |

**No migration is expected.** Every column this slice needs exists. If one appears, it must be classified in `GUARDED_WRITE_FIELDS` or `CALLER_SUPPLIABLE_BRAIN_FIELDS` (`with-workspace.ts:935-1005`) or `packages/db/tests/profile-scope.test.ts`'s completeness instrument fails — which is the intended behaviour, not an obstacle.

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **Edit → confirm → activate → read the superseded version → export both formats, in a browser**
3. [ ] Export with a deliberately corrupted `source_evidence` offset → **completes, annotated** (R9)
4. [ ] Export a brain with an empty `signatureMoves` array → renders "no rules recorded", not `0` (R10)
5. [ ] A registered, export-included table with no exporter query → the export **refuses** (R11 non-vacuity)
6. [ ] Export under an open pause → succeeds (R12); edit under an open pause → refused with its own copy (R7)
7. [ ] Export naming another workspace's profile → `ProfileAccessError` (R13)
8. [ ] An edit that changes one field → the new version's other fields still carry their original evidence (R6)
9. [ ] A viewer reaches neither the edit form nor its action (R7)
10. [ ] An edit echoing a stored reference → hard write refused on screen with the matched reference and corrective action (R15a)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Exporter iterates a hard-coded table list instead of the registry | R11's non-vacuity test |
| M2 | Annotate mode reverted to a throw | R9's corrupted-offset test |
| M3 | Empty claim array renders `0` | R10's absence test |
| M4 | Edit writes `own_post` instead of `creator_authored` | R5's input-class test |
| M5 | Carry-forward dropped — unchanged fields lose their evidence | R6's test |
| M6 | Export gains the pause gate | R12's paused-export test |
| M7 | `frameworks` accessor returns shared rows too | R15's visibility test |
| M8 | Edit path bypasses `writeBrainDoc` and inserts directly | `tests/table-writers.test.ts` (`brain_docs::insert` set) |

**Population note — read before reporting "N of N".** Eight mutations, all perturbing code that will exist. The matrix is blind to a control nobody wrote (CLAUDE.md, 2026-08-26), and this slice's two most likely such holes are named rather than left to be found: **(a) the markdown projection has no completeness contract at all** — it is deliberately allowed to be partial, which means nothing can catch it becoming *misleadingly* partial, and R14's header sentence is the only guard; **(b) the edit's carry-forward (R6) is the kind of requirement that is satisfied by the happy-path fixture and broken by the second field.** Before claiming a matrix result, state in the ledger which requirements have no control, and have someone other than the author plant at least three mutations of their own — the 2026-08-26 record is 24 planted by the author all red, then six of ten reviewer-planted surviving.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] The "A creator can…" line walked in a browser
- [ ] **Brain tenancy** (Full gates) PASS; **spin compliance** and **learning honesty** PASS — reviewers in **isolated worktrees**
- [ ] The open items above closed and the disposition register updated
- [ ] `decisions.md` carries the registry-driven export decision, reuse of 3b's `creator_authored` evidence, and the framework-seeder handoff to slice 7
- [ ] `docs/initial/build-plan.md` M2's "export produces complete, readable JSON + markdown" criterion is **measured**, not asserted
