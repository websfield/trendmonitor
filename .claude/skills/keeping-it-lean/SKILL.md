---
name: keeping-it-lean
description: Use when deciding how much code to write for a change, when a diff feels over-engineered, when weighing a new dependency or abstraction, or when the user says "simplify", "is this over-engineered", "do we even need this", "leaner", "fewer lines". Documents the economy-of-means ladder (reach for existing/stdlib/native before new code) and the SHORTCUT marker convention. This is the canon the simplification-reviewer gates and the guardrail catches — it governs *means*, never *coverage*.
---

# Keeping it lean

Express the agreed scope with the **fewest new** lines, dependencies, and abstractions.
This is the canon for *economy of means* — the second axis in create-plan's Guiding
Principles. It is paired with the `simplification-reviewer` agent (the gate) and a
write-time guardrail (the catch), the same skill→reviewer→guardrail triad the pack uses
everywhere.

## The hard boundary (read first)

Economy governs **how** you build, never **how much behaviour you cover**. The two are
**orthogonal axes — maximise both.** Leanness is never a reason to ship less.

**Never apply "fewer lines" to:** validation at trust boundaries, data-loss / error
handling, security, accessibility, **edge cases, tests**, or anything explicitly requested.

When economy and completeness ever appear to conflict, **completeness wins** — full
coverage first, then the leanest means that delivers it. A small diff in the wrong place,
or one that drops a branch's test, is not lean — it's a second bug.

## The ladder

Understand the change first — read the code it touches, trace the real flow — *then* stop
at the first rung that holds:

1. **Does it need to exist at all?** Speculative need → skip it, say so in one line. (YAGNI)
2. **Already in this codebase?** A helper, util, type, or pattern that already lives here → reuse it. Re-implementing what's a few files over is the most common bloat.
3. **Standard library does it?** Use it.
4. **Native platform feature covers it?** Use it (`<input type="date">` over a picker lib, a DB constraint over app code, CSS over JS). See `resources/platform-native.md`.
5. **Already-installed dependency solves it?** Use it. Never add a new dependency for what a few lines do.
6. **Can it be one line?** One line — if one line covers it.
7. **Only then:** the minimum code that works.

Two rungs work → take the higher one. Between two equal-size options, pick the one that's
**correct on edge cases** — lean means less code, not the flimsier algorithm.

**Bug fix = root cause, not symptom.** Grep every caller of the function you're about to
touch; one guard in the shared function is both the smaller diff and the real fix.

## SHORTCUT marker convention

A deliberate simplification with a known ceiling gets an inline marker naming the ceiling
**and** the upgrade trigger, so a deferral can't silently rot into permanent:

```
// SHORTCUT: <what was simplified>. ceiling: <the limit>. upgrade: <the trigger to revisit>.
# SHORTCUT: in-memory list, fine < 1k items. ceiling: O(n) scan. upgrade: move to an index when the set grows.
```

Use `//` or `#` to match the file's comment style. The `upgrade:` clause is **required** —
a marker without it is exactly the deferral that rots, and the write-time guardrail warns
on it. Harvest every marker with `/shortcut-ledger`.

This is the **code-level** complement to create-plan's plan-level *Deferral Ledger*:
plan promises live in the ledger, code shortcuts live at the line they affect.

## Output discipline

Code first, then at most a few lines: what was skipped, when to add it. If the explanation
is longer than the code it defends, cut the explanation. (Reports, walkthroughs, and
per-phase notes the user asked for are not debt — give those in full.)

Pattern: `[code] → skipped: [X], add when [Y].`

## Boundaries

- Governs *means*, not coverage (see the hard boundary above).
- The reviewer half (`simplification-reviewer`) lists what to cut; it applies nothing and never flags a test or a guard for deletion.
- A single smoke test or `assert`-based self-check is the lean minimum, **not** bloat.
