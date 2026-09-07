# Plan review — Respin M2b-1 (round 6)

**Reviewed:** the two modules built after round 5 (`respin/packages/db/src/brain-content.ts`, `echo.ts`) and their suites — **code, not prose, was the primary artifact**. Plus the plan, the M2b-2 scope note, and the ledger.
**Verdict: NOT READY.** All four reviewers **BLOCK**.

| Reviewer | Verdict | BLOCK | CHANGE | NOTE |
|---|---|---|---|---|
| `respin-tenancy-reviewer` | BLOCK | 2 | 9 | 4 |
| `respin-compliance-reviewer` | BLOCK | 2 | 5 | 3 |
| `respin-learning-reviewer` | BLOCK | 3 | 9 | 5 |
| `respin-billing-reviewer` | BLOCK | 1 | 9 | 2 |
| **Total** | | **8** | **32** | **14** |

**Trend: 20 → 12 → 9 → 7 → 11 → 8.** The reversal at round 5 was the prose-only round; building resumed the decline.

## The method comparison now has two observations per arm

| Rounds | Method | BLOCK |
|---|---|---|
| 3 → 4 | Built the contested modules | 9 → **7** |
| 4 → 5 | Revised prose only | 7 → **11** |
| 5 → 6 | Built ROOT A | 11 → **8** |

## First independent confirmations this milestone has had

Round 6 is the first round where reviewers reproduced the author's claims rather than only refuting them:

- **The split rule works.** Three reviewers verified `assertShapePosition` / `assertClaimInner` holds both properties — all four kinds load, and `claim(z.any())`, `claim(z.record())`, `claim(z.strictObject())`, bare leaves, loose objects and non-claim unions all refuse. Tenancy: *"the first round where the contested rule survived contact with the toolchain."*
- **The entry gate is exact.** Billing ran the CI shape and got 717/717, 38 files, zero skips — matching the claim.
- **P-38c is a real equivalent mutant.** Tenancy built a canary-free copy and measured both shipped assertions unchanged; billing reproduced it independently.
- **The U+00AD fix holds** across a 4174-code-point generative sweep (tenancy).
- **Six of round 5's nine blocks are closed with running proof** (compliance), and three of learning's four.
- **The non-claims are honest.** Billing verified C-37 is genuinely unimplemented and the plan is not softened; compliance verified `reason` is honestly declared open.

## The eight blocking findings

**Three reviewers converged on one defect.**

1. **`serverOwned` was a marker with no enforcement** *(tenancy, compliance, learning — all measured)*. `parseBrainContent` returned `{"schemaVersion":999}` verbatim: a model-supplied value at a server-owned position stored as fact, needing no evidence, unconfirmable, unable to hold `[check]`, vacuous at the activation gate — the unmarked-leaf defect wearing a label. **And the source comment claimed the strip existed.** `serverOwnedFields` had zero production callers; `writeBrainDoc` stores `content` raw.

**The class that was still a list.**

2. **Absence was never a disagreement** *(tenancy, measured)*. `if (value === undefined) return;` ran at every position, so `enumerateClaimFields("strategy", {})` → `[]`, and after a schema widening every stored row enumerated the **old** claim set — a newly-required claim never shown to the creator while the activation gate passed.
3. **`\p{Default_Ignorable_Code_Point}` excludes 32 `\p{Cf}` characters** *(compliance, measured; independently verified by the author)*. Every one defeats an otherwise-refusing span, exactly as U+00AD did. A bigger list, not a class.

**Coverage claims that overstated.**

4. **"10 of 11 RED" is false as a coverage claim** *(learning)*. A reviewer ran **21 mutations of its own: 17 RED, 4 GREEN** — the array branch (a shape AC-53 names by hand), the loose-object rule, and the ICU probe both weakened and deleted. The number was true about the eleven run and worth nothing without the population.
5. **The aggregate contradicted the document** *(learning)* — `:9` quoted an aggregate that `:107` forbids, and cited `P-56`, which exists nowhere.
6. **The canary had no detector** *(learning)*. The equivalent-mutant label was defensible but a detector was available via the seam pattern already used twice.

**Still open, honestly non-claimed.**

7. **C-37's monotone counter** *(billing)* — unchanged from round 5, verified unimplemented, plan not softened. AC-66 still *selects* the defect: it is only satisfiable by a counter spanning all retained versions, which is the implementation that bricks every priced rebuild.
8. **`[check]` required for `content`, not for `reason`** *(compliance)* — verified honestly declared open.

## What was fixed in response, and measured

Every round-6 BLOCK against the code is closed, with the mutation that proves it:

| Fix | Mutation | Result |
|---|---|---|
| Strip server-owned positions inside `parseBrainContent` | N1 remove the strip | **RED** |
| Absence of a required claim is a `ClaimWalkError` | N2 restore skip-on-undefined | **RED** |
| Fold is `Cf` ∪ `DI` | N5 drop `Cf` | **RED** |
| `serverOwned` clones (kills WeakSet aliasing) | N3 mark caller's instance | **RED** |
| Marking exemption is not a closure exemption | N4 skip `assertClaimInner` | **RED** |
| Export twin never throws on a null corpus | N6 remove the guard | **RED** |
| Canary: one per rule, coverage set asserted | N7 drop a rule-2 canary | **RED** |
| Array-branch disagreement refuses | M8 | **RED** |
| Loose-object rule has a discriminating fixture | M15 | **RED** |
| ICU probe extracted and testable | M18 / M19 | **RED** |

**Entry gate: typecheck 0 · eslint 0 · `db:check` clean · 734 passed / 734, 38 files, zero skips. Mutation matrix 11 of 11 RED**, every restoration re-read from disk.

## Recommendation

Continue in code. The remaining open items are C-37's aggregation window, `[check]` for `reason`, the C-29 schema column (needs migration 0012), and wiring `brain-content.ts` into a path that actually imports it — plus the plan's own staleness, which round 6 caught in three places and which is now corrected for the lines it named.
