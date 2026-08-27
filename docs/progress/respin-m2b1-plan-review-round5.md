# Plan review — Respin M2b-1 (round 5)

**Draft reviewed:** [`../plans/respin-m2b1-brain-surface-plan.md`](../plans/respin-m2b1-brain-surface-plan.md) (round-5 revision, 2026-08-25) and the re-edited [`../plans/respin-m2b2-metered-inference-scope.md`](../plans/respin-m2b2-metered-inference-scope.md). **No code was written this round** — the two landed modules are byte-unchanged since round 4.
**Verdict: NOT READY.** All four reviewers **BLOCK**.

| Reviewer | Verdict | BLOCK | CHANGE | NOTE |
|---|---|---|---|---|
| `respin-tenancy-reviewer` | BLOCK | 3 | 6 | 5 |
| `respin-compliance-reviewer` | BLOCK | 3 | 10 | 3 |
| `respin-learning-reviewer` | BLOCK | 4 | 8 | 3 |
| `respin-billing-reviewer` | BLOCK | 1 | 9 | 5 |
| **Total** | | **11** | **33** | **16** |

## The trend reversed, and that is the finding

**20 → 12 → 9 → 7 → 11.**

Four rounds of decline, then a rise. The rise is not noise and it is not reviewer drift — **it is newly introduced defects**. At least six of the eleven blocks are in text that did not exist before this revision:

| New block | Introduced by |
|---|---|
| `C-27(a)` refuses **all four shipped schemas** — measured independently by three reviewers | C-27, this round |
| The obvious repair for that **re-admits `claim(z.any())` / `claim(z.record(...))`** — whose criterion AC-44 this revision withdrew with no replacement | C-27 + the AC-44 withdrawal, this round |
| `serverOwned(...)` is an **unguarded exemption**: a model-supplied string at such a position is stored with no evidence, no `[check]`, no confirmation | C-27, this round |
| `C-37`'s cross-version quote ceiling is a **monotone counter over an append-only table** — a first build citing 600 characters of reference R bricks every later **priced** rebuild citing R, forever | C-37, this round |
| `C-29`'s recorded corpus id set has **no column, no guard, no criterion** — and `echo.ts:296` returns early on an empty set, so a caller-supplied empty corpus **silently disables the whole R-3 brain echo bar** | C-29, this round |
| `AC-55` mandates a nested object node without forbidding `claim(z.strictObject(...))`, which **collapses per-field confirmation** — measured: two claims become one position | AC-55, this round |

**The plan predicted one of these about itself and then did it.** C-32's rationale reads: *"this hand-list has missed exactly one field in three consecutive rounds… M2b-1 adds five server-derived columns at once, so the fourth miss is the likely one."* The corpus id set is the fourth miss, introduced in the same revision, in the decision next door.

## A controlled comparison now exists

| Round | Method | BLOCK |
|---|---|---|
| 3 → 4 | **Built the two contested modules**, then revised | 9 → **7** |
| 4 → 5 | **Revised the plan only**, no code | 7 → **11** |

Round 4's recommendation — close ROOT A *in code* before revising again — was declined in favour of a full prose revision. The two approaches have now each been run once on the same surface, and the prose-only round is the one that moved the count the wrong way. That is one observation per arm and should not be over-read, but it is the only comparative evidence available and it points one way.

## The eleven blocks

**ROOT A's fix is itself broken (5 blocks).**

1. **`C-27(a)` is unimplementable as worded** *(tenancy, learning, compliance — all measured)*. `assertClosedSchema` recurses **into** a `claim()` union's options, and those options are bare `z.string()` / `z.literal` nodes. "Refuse any non-container node that is not `claim(...)`/`serverOwned(...)`" therefore throws at module load on **every registered kind**: `voice` at `/register`, `strategy` at `/audience`, `killtest` at `/rules[]`, `performance_meta` at `/baselineNote`.
2. **The natural repair regresses a property round 4 certified closed** *(compliance)*. Stopping the recursion at a `claim()` node is the obvious fix — and that recursion is the **only** reason `claim(z.any())` and `claim(z.record(...))` are refused today. Both measured REFUSED now, ACCEPTED without it. Its criterion, AC-44, is withdrawn; AC-51/52/53 do not replace it; P-34 plants a `z.record` at an *object* position, not inside a `claim()`.
3. **`serverOwned(...)` is unguarded** *(learning BLOCK, compliance CHANGE)*. Nothing says a `serverOwned` value must be server-computed or that a caller-supplied one is refused — so it becomes the escape hatch "unmarked leaf" was. It also has **no production site** in any registered kind, which is W-10 reproduced inside the fix for ROOT A.
4. **`claim(z.strictObject(...))` collapses per-field confirmation** *(learning, measured)*. `assertClosedSchema` accepts it and enumeration returns `["/t"]` — two claims become one position, so one confirmation confirms a subtree and one evidence entry satisfies C-28 for it. AC-55 mandates a nested node and gives an implementer the reason to pick that form.
5. **`AC-51`/`P-38` cannot detect the defect C-27(b) exists to close** *(learning)*. `brain-content.test.ts:63-71` **already** loops `assertClosedSchema` over the registry, so planting an unmarked leaf reddens whether or not the module-load call exists. "A guard that runs only in a test is a test, not a guard" — reproduced on its own fix.

**Coverage scoped at the instance again (3 blocks).**

6. **`C-29`'s corpus id set has no column, no guard, no export decision, no criterion** *(tenancy)*, and an empty stored set **silently disables the bar** (`echo.ts:296`).
7. **`[check]` is required for `content` and not for `reason`** *(compliance)*. C-28 binds only schema-derived claim positions; `reason` is model-written, `text NOT NULL`, exported whole, and C-30 gave it an echo check and a cap but **no invented-specifics rule**. REQ-I03 binds "any output". W-11 closed at the instance, open one level down — in the same revision that names `reason` as the uncovered sibling.
8. **`C-29` opens a new R-3 blind spot recorded nowhere** *(compliance)*. A `reference` input pasted **after** the write is checked at neither write nor activation, export only annotates, and M3's prompt-bundle read still has no corpus — so for that input the echo is caught at **no** enforcement point. C-38, the residual register added this round precisely so that "a residual left implied is a false claim of coverage", does not list it.

**Enumerated lists where a class was claimed (1 block).**

9. **`C-27(c)`/`AC-53` name four fail-open shapes; the class has at least seven** *(tenancy, learning — measured)*. The walker's fail-open is a **schema↔instance disagreement**, not an unhandled node type: object-schema/string-instance, /null, /array, and array-schema/object-instance all return `[]`. And because **nothing re-parses the stored row at activation**, an empty claim set satisfies AC-26 vacuously — silent activation over unconfirmed content.

**Honesty defects in this revision's own bookkeeping (2 blocks).**

10. **The withdrawn RED marks are re-asserted in aggregate, three times** *(learning, measured)*. The rows are honest; `:107` still reads "13 of 13 planted mutations red", `:186` says P-4 "is one of the 13 verified red", and `:387` says "Eleven of these rows are already RUN and RED" where exactly **9** carry an unqualified RED. A reader who stops at "Already built" gets the same false claim round 4 measured.
11. **`AC-44`'s cell opens "MARK WITHDRAWN" and ends "MET"** *(tenancy, compliance, learning)* — a withdrawn mark still carrying the mark, in the criterion guarding the root fix, against this revision's own completion criterion.

## What round 5 genuinely closed, with running proof

Named so they are not reopened. Every one was verified by a reviewer executing code:

- **U+00AD** — `\p{Default_Ignorable_Code_Point}` measured a strict superset of the old list; `OLD refuses=false → NEW refuses=true`, so AC-58/P-41 genuinely discriminate.
- **C-40's TOCTOU** — measured: the getter is read exactly once by parse; parse output `"deadpan"` while the caller's payload yields the invented specific. AC-67/P-50 discriminate.
- **The commit-order race** — C-29's *mechanism* (a recorded id set, not a timestamp) is correct and does close it.
- **C-28 is implementable and detectable** — claim positions are RFC-6901 pointers `readPointer` resolves; P-40 discriminates.
- **C-32** — the completeness test is a class-level instrument, not another hand-list. Round 4's `evidence_counts` identifier-space finding is fully resolved.
- **C-35, C-36, C-26** — export-never-throws; `z.strictObject({})` verified accepted; the auto-top-up bullet verified correct with no window moved.
- **AC-42's range, the `SEGMENT_SEP` misstatement, M-8's line citation, tasks 42/43/46** — all fixed and verified.
- **No new false present-tense claim about the landed modules** — tenancy re-verified thirteen separate code citations one by one and found them all accurate.

## Recommendation

**Stop revising the plan.** Two rounds of evidence now say the same thing from opposite directions: building the contested modules moved the count down (9 → 7); revising prose about them moved it up (7 → 11), and six of the eleven blocks are defects the revision itself introduced.

The mechanism is visible in the findings. Every one of the six new blocks is a rule stated in prose about **how code will behave** — a marking rule that turns out to refuse every shipped schema, an exemption with no enforcement, a counter that is monotone over an append-only table, a corpus set with nowhere to live. None of them survived contact with the installed toolchain, and all of them were found by reviewers **running** the code rather than reading the plan.

**Recommended: close ROOT A and C-29 in code**, as round 4 recommended and this round's evidence now supports comparatively — `claim()` marking enforced with the recursion rule *measured* rather than reasoned, `serverOwned` given a production site and a strip, the walker failing closed on schema/instance disagreement, the corpus set given a real column and a guard. Then let the plan cite what those runs show. The remaining findings are ordinary edits that can land in the same pass.
