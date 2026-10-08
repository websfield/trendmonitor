# L4 gate — merged general-purpose run (Opus; spin compliance · security · accessibility) (2026-10-04)

Frozen manifest `L4-gate.sha256` digest `4bceef9ce49a`: 40/40 OK. Read-only: greps, diffs and `tar -xO` of the checkpoint. Nothing was written.

## A. Spin compliance — NEEDS CHANGES · Almost · B (3 Medium, 3 Low, 1 Note)

These hold:
- No regeneration: the read takes no provider (`saved-generation.ts:355`).
- Only stored usable rows display, and a refused near-copy never reaches the page.
- `[check]` marks and the confirmation item survive into the page, the copy and the Markdown (`recording-pack.ts:72-104`).
- The weakest point, or a withheld sentence, is always present.
- The model disclosure is replaced, and findings inside it are dropped.
- The presets are a closed list, and a three-word note sits below the four-word basis threshold (test `A PRESET NOTE CANNOT VOUCH`).
- No copy makes a guarantee.

Findings:
- **A1 Medium — the scoring model's notes can quote the model disclosure.**
  - Path: `saved-generation.ts:228-235, :283` pass through `creatorRuleVerdicts[].note`. It is rendered in KillTestBlock and exported at `recording-pack.ts:95-96`.
  - Why it can quote the disclosure: the note is written by the scoring model, which sees `renderDraft(output)` including `/disclosure/*` (`modes.ts:53-64`, `output.ts:464-465`).
  - Scenario: a rule note quotes "no need to tag this as an ad" on the page and in the export.
  - The header claim at `:21-26` and the test name at `saved-generation.test.ts:301` overclaim.
  - Fix: show pass/fail plus the creator's rule text and drop the model note, or withhold any note sharing a 4+-word run with the stored model disclosure (decided by content only). Plant a test with a note quoting `MODEL_GUIDANCE`.
- **A2 Medium — a reopened Spin loses its original-vs-spin context.**
  - `analyseAndSpin`/`sourceToReel` drafts render `ORIGINAL_NOTE` "This is an original draft, not a revision." (`saved-copy.ts:167`, `saved-view.tsx:144-146`).
  - There is no reference and no side-by-side (S2; `/trends` `spin-panel.tsx:124-128` renders one), and the export carries no attribution. Every mode is reachable from the `/studio` recent list.
  - Fix: carry the stored `spinAutopsyId` reference summary into the DTO, render it side by side with a "passed the similarity check before it was saved" line, and reword `ORIGINAL_NOTE` to "Not a revision of another version".
- **A3 Medium — paid Revise presses on a saved Spin can never run, and the refusal copy misdirects.**
  - `reviseSaved` (`:556-569`) passes no `spinAutopsyId`, so `requireSpinAutopsyId` throws `GenerationAssemblyError`. Its copy is "Fill in the box, pick a platform…" (`billing-errors.ts:1592-1596`).
  - Fix: pass the parent's stored `spinAutopsyId` so the revision re-runs the similarity gate against the same reference, or block the presses with honest copy. Test either way.
- **A4 Low:** the "exactly as it was saved" claims (`saved-copy.ts:153`, `saved-view.tsx:287`, `recording-pack.ts:235`) are false. The disclosure is replaced, `[check]` marks are added, and `md()` collapses whitespace. Fix: reword.
- **A5 Low:** "Each revision costs N" is quoted at render time but priced at the press. This is the same as billing M1. Fix: "currently costs", plus the quote-version check.
- **A6 Low:** an honest refusal whose only hard-rule findings were in the disclosure shows no reason (`:288`). Fix: add a product sentence saying disclosure advice broke a rule and is not shown.
- **Note (unverified, pre-L4, newly reachable):** a `sourceToReel` revision feeds `revisionInput` as `args.input` to `checkSourceFidelity` (`mode-checks.ts:272-275`, 8-word runs). A preset could therefore end in a charged honest refusal. Worth one test.

## B. Security — NEEDS CHANGES · Almost · B (1 Medium, 2 Low, 1 Note)

These hold:
- Session scope.
- IDOR on the attempt, version and piece ids.
- Server-side membership walk with a uniform `not_found`.
- Role and pause gates.
- Closed preset enum.
- Only `version` and `preset` are read from the form.
- Logs carry metering only.
- React escaping, `encodeURIComponent`, and a download filename limited to `[A-Za-z0-9-]` and 64 characters.

Findings:
- **B1 Medium — the Markdown escaping is inline-only.**
  - `md()` (`recording-pack.ts:42-50`) escapes `<>`, backticks, `![` and `](`. The comment at `:22-24` claims no value starts a line, but values do start lines or list items at `:177, :181, :186, :208, :209, :228`.
  - Scenario 1: a value `[check]: https://attacker.example "Confirm"` becomes a link reference definition. Every `[check]` then links to the attacker, which is phishing in the export and an S4 regression.
  - Scenario 2: `~~~` swallows the Checks and Disclosure sections into a code block.
  - Scenario 3: a leading `#` or `>` forges headings.
  - Tests cover only `![x](…)` and `<img`.
  - Fix: escape `]:` and `[^`, and escape the line-start markers (`#`, `>`, `-`, `+`, `*`, `=`, `|`, `~~~`, `1.`, `1)`). Correct the comment and add planted tests for each shape.
- **B2 Low:** `page.tsx:284` `selectedStatus={search.selected === "1"}` shows false success on a crafted or stale link. Fix: `&& view.piece?.isSelected === true`.
- **B3 Low/Note:** bare URLs become live GFM autolinks in the export. Optional fix: break the scheme or `www.`.
- **Note:** the bound action args `profileId`, `attemptId` and `pieceId` are caller-alterable. This is safe because each is re-scoped on the server.

## C. Accessibility — PASS · Ready · A (5 Low)

These hold:
- Heading structure and `aria-labelledby` sections.
- Persistent status regions (`pack-actions.tsx:341`, `revise-panel.tsx:107`).
- `aria-describedby` on the cost and select help.
- `aria-disabled` and `aria-busy` on pending presses.
- Focus after select (`FocusedStatus`).
- `aria-current` on the current version.
- Text badges, so colour is never the only signal.
- 44px targets and 320px reflow.
- Unique `SequelControl` ids.

Findings:
- **C1:** when the clipboard is refused, the status says "Select the text in the box below", but that box holds the Markdown, not the script (`pack-actions.tsx:285-295`, `saved-copy.ts:275-276`).
- **C2:** pressing the same control twice sets identical status text, so the second press is not announced (`pack-actions.tsx:281-308`).
- **C3:** version links are named by a minute-resolution timestamp only (`saved-view.tsx:198-200`). Add an ordinal.
- **C4:** `RecentPacks` is a `div` rather than a labelled `section`, and refusal entries repeat the mode label as their link text.
- **C5:** the new files use raw spacing values instead of `var(--sp-*)` tokens.
- **Note:** the `run-copy.ts:435-436` docstring is misplaced. This is the same as tenancy L3.
