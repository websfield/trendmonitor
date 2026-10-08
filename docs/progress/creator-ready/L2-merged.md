# L2 gate — merged general-purpose run (Opus; spin compliance · security · accessibility) (2026-10-04)

Frozen manifest `L2-gate.sha256` digest `6b5ba677d515`. Nothing was edited or planted. The reviewer ran `vitest run tests/llm-transport-fake.test.ts packages/db/tests/llm-transport-selection.test.ts`: 17 passed. It computed contrast from the token values and read the installed Next 15.5.23 router source.

## A. Spin compliance — NEEDS CHANGES · Almost · B (0 BLOCK, 2 Medium, 1 Low, 3 Note)

- **Medium** `packages/credits/src/generate.ts:2869-2874` `conceptContextSufficient`:
  - Any non-whitespace hint passes (`"x"`), and the existing test passes `"audience: x"`.
  - The Strategy branch counts any confirmed claim, including goals, ambitions and the metric, contrary to its own docstring. A brain that confirms only "grow to 10k" therefore reaches ideation, and an invented identity ("as a former nurse") escapes the event, traceability and `[check]` checks.
  - Fix: count only audience, positioning and pillars; require real content in a hint; add both bypasses as refusal tests.
- **Medium** `app/(product)/studio/run-copy.ts:909-910` `FIND_CONCEPT_HELP`:
  - It promises "Nothing is invented about your life, your past or your results". The code's own limits contradict this (`EVENT_SCAN_EXCLUDED` at `mode-checks.ts:2141`; `TRACEABILITY_LIMIT_NOTE`).
  - Fix: state what is checked, in `TRACEABILITY_LIMIT_NOTE`'s terms.
- **Low** `app/(product)/studio/page.tsx`:
  - A failed `pastedReferenceQuote` read shows `REFERENCE_ENTRANCE_BLOCKED` ("not part of this workspace's plan"). That is an unread plan fact, and it hides the standalone entrance on a transient error.
  - Fix: track three states (available, not in plan, unknown) and show neutral copy plus the `/trends` link when the read fails.
- Note: `FIND_CONCEPT_INPUT` says "exactly three", while `assemble.ts:777-779` says "between 3 and 5"; the instructions contradict each other.
- Note: `PIECE_OPERATION_NOTE` says "returns this same script". That is true only for a settled claim.
- Note (generalist lane, medium confidence): the `studio-view.tsx` `<PieceConfirmation>` has no `key`. Next keeps client state across `?piece=A` → `?piece=B`, so B's confirmation can show A's script. Fix: `key={pieceId}`.
- Checks: the similarity gate holds; forged source text is refused; kill-test honesty is unchanged; no automation added; the standalone breakdown remains reachable.

## B. Security — PASS · Ready · A (0 critical/high/medium, 2 Low, 1 Info)

- **Low** `packages/db/src/creative-work-ops.ts:99-165`:
  - There is no per-profile cap on zero-cost piece creation, so `creative_pieces` can grow without bound inside the creator's own tenant.
  - Fix: add a count cap like `BrainDocumentLimitError`.
- **Low/Info** `packages/db/src/llm-transport-selection.ts:39,78-90`:
  - The test-database check is only a naming convention, so production safety rests on `NODE_ENV === "production"`, plus the `NODE_OPTIONS --import` preload.
  - Reaching fake output would require control of the server's environment, which is already full compromise.
  - Optional hardening.
- Info: the operation id is in the DOM for viewers. This is harmless.
- Attacks tried on paper and closed: foreign piece or operation id, replay/CSRF via the hidden field, mass assignment, role and pause, injection/XSS, secrets, the fake reaching production.

## C. Accessibility — NEEDS CHANGES · Almost · B (1 Medium, 3 Low)

- **Medium** WCAG 2.4.3 / 4.1.3:
  - Choose, New generation and Cancel each redirect, with no focus management or announcement. After choose, focus stays on the button below while the confirmation appears above it. After cancel, focus falls to `<body>`.
  - Fix: give the confirmation `<h2>` `tabIndex={-1}` and focus it on mount and when the piece id or version changes. On cancel, focus the Studio heading or a status line.
- **Low** 1.3.1: cost statements are not tied to their controls by `aria-describedby` (`piece-confirmation.tsx:231-256`, `entrances.tsx:178,219`).
- **Low** 3.3.1: on `concept_context_needed`, the hint textarea gets no `aria-invalid` or `aria-describedby` (`entrances.tsx:141-153`).
- **Low** 4.1.3: success is never announced; the polite region empties (`entrances.tsx:109-117`, `piece-confirmation.tsx:163-171`).
- Clean: contrast (computed from tokens), labels, 44px targets, heading order, colour-not-alone, focus ring.
