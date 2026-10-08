# L3 gate — merged general-purpose run (Opus; spin compliance · learning honesty · security · accessibility) (2026-10-04)

Frozen manifest `L3-gate.sha256` digest `d96685b4f2c6`: 37/37 OK. The reviewer ran `TEST_DATABASE_URL=… vitest run packages/credits/tests/recent-context.test.ts tests/studio-ui.test.tsx` (2 files, 227 passed). Nothing was written.

**Confirmed in code:**
- History is outside both corpora (`assemble.ts:318-350`, `:370-382`).
- `[check]` passages, traceability-token passages and the results table are never sent.
- Labels come from a closed server enum.
- `sequel` is strictly the checkbox `"1"` (`actions.ts:119`) and switches no check.
- Both scope columns appear on every read.
- The erased check is inside the lock and before the debit.
- "Remember this" writes only a proposed version; activation needs per-version confirmation with a matching content hash.
- The logs carry ids only.

**Weakest bets:**
- The erased-history branch is a defensive fail-closed check with no product trigger (Note).
- Notes are budgeted first and kept or dropped whole. A note is at most 2,000 characters, so the most relevant note always fits the 4,000 default. Drafts can be squeezed out, and every exclusion is recorded (Note).

## A. Spin compliance — NEEDS CHANGES · Almost · B (1 Medium, 2 Low, 1 Note)

S1, S2 and S6 are untouched: only `ideation`/`ideaToScript` read history. S3 is unchanged. S4 is consistent. S5 has nothing new.

- **Medium:** nothing tests that history stays out of the basis corpus.
  - Location: `assemble.ts:197-201`, which claims both corpora ignore `recentWork`. Only traceability has a test (cases 7 and 7b). Case 7 is a legacy generation, whose basis corpus is `[]`.
  - Scenario: a later edit adds `recentWork` to `basisCorpusFor`, and the suite stays green. A v2 premise then quotes a "Their words: …" history line as a `material` basis and passes the invented-event check. This is the Lesson 2026-10-03 class.
  - Fix:
    - Add a v2/creative case with a history note.
    - Assert `basisCorpusFor(context)` and `creativeCheckContextFor(context).basisCorpus` exclude the note.
    - Assert a v2 reply quoting the note as a basis excerpt is refused.
    - Add a control: the same excerpt in `creatorNote` passes.
- **Low:** passages flagged for performance, certainty or concealment claims are still sent.
  - Location: `recent-context.ts:148-156`. `finalAttempt.claims` tokens are ignored.
  - Fix: drop any passage that contains a `claims[*].token`.
- **Low:** traced specifics from old drafts are sent as history.
  - Case 7 asserts `$4,000` is shown as history. Reusing it in a new output is untraced, which forces a rewrite or a charged refusal. This fails closed, but it costs the creator.
  - Fix: mask number, date and proper-noun tokens, or omit passages with hard-enforced shapes.
- **Note:** the erased-history terminal has no product trigger.

## B. Learning honesty — PASS · Ready · A (2 Low, 2 Note)

- L1: "Remember this" is a creator-typed brain edit, not a promotion proposal. `packages/brain` remains the sole emitter.
- L2/L6: reactions are per-row labels only, and no feedback changes a brain.
- L3, L4, L5 and L7 are untouched. No new learn/improve/train copy.

Findings:
- **Low:** `run-copy.ts:845-846` `FEEDBACK_TODAY` says "Up to three … reactions … are shown". Every reaction on up to five history drafts is sent as a label (`recent-context.ts:253-257`); only notes are capped at three. Fix: reword.
- **Low:** the `feedback-block.tsx:66-72` comment still says the sentence states "that nothing reads it today". Fix: rewrite the comment.
- **Note:** numbers a creator types into a reaction note reach the prompt verbatim. R-152(d)'s "result numbers are never sent" holds only for the results table.
- **Note:** a remembered rule cannot be withdrawn before activation, only overwritten. Activation still needs per-version confirmation.

## C. Security — PASS · Ready · A (1 Low, 1 Note)

Checked and holding:
- `requireUser`, then `scopeForUser`, then `ProfileScope.mint`.
- Owner-only and pause gates (test 4b).
- Only `preference` is read; cast smuggling is refused.
- 2,000-character server bound.
- CSRF via Next's origin check; React escaping; entries flattened to one line.

Findings:
- **Low:** `rememberForFutureDraftsAction` has no idempotency (`actions.ts:634-668`, `feedback-ops.ts:135`). A replay or double submit appends the same rule twice and writes two `onboarding_inputs` rows. Fix: return the base version when the trimmed, NFC-normalised text already equals a rule.
- **Note:** a creator's note can imitate a label inside its own line. This is self-injection only: nothing consumes labels as a check.

## D. Accessibility — PASS · Ready · A (3 Low)

Checked and holding:
- The checkbox has a label, `aria-describedby` and a 44px target.
- The textarea has a label and `aria-describedby`.
- The pending status region is persistent.
- `SubmitButton` keeps focus.
- Refusals use `role="alert"`.
- Existing tokens and primitives are used.

Findings:
- **Low:** the success `role="status"` mounts together with its text (`feedback-block.tsx:241`), so it may not be announced. The same pattern exists at `:158`. Fix: render the success text inside the persistent region (`:210`).
- **Low:** the 2,000-character limit is never stated (`feedback-block.tsx:227`; WCAG 3.3.2). Fix: state it in the help text.
- **Low:** a refused submit wipes the typed rule (React 19 resets the form; close to WCAG 3.3.7), and the alert is not tied to the field. Fix: return the text as `defaultValue` in a keyed form, and link the alert with `aria-invalid`/`aria-describedby`.

**Overall: Almost · B.** One Medium (A); everything else is Low or Note.
