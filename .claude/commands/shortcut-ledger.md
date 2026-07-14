---
description: Harvest every `SHORTCUT:` marker in the codebase into a debt ledger, so deliberate shortcuts and their upgrade triggers get tracked instead of rotting into "later means never". Read-only by default.
allowed-tools: Read, Grep, Glob, Bash
---

# Shortcut Ledger

Collect the deliberate code-level simplifications marked with `SHORTCUT:` into one ledger,
so a deferral can't quietly become permanent. This is the **code-level** complement to the
plan-level *Deferral Ledger* in `/create-plan`: plan promises live in the ledger, code
shortcuts live at the line they affect. Convention is defined in the `keeping-it-lean` skill.

## Usage
```
/shortcut-ledger          # print the ledger
/shortcut-ledger --write  # also write it to SHORTCUTS.md
```

## Process

### 1. Scan
Grep the repo for markers, skipping `node_modules`, `.git`, and build output:

```bash
grep -rnE '(#|//) ?SHORTCUT:' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build 2>/dev/null
```

Each hit is one ledger row. The comment prefix keeps prose that merely *describes* the
convention out of the ledger.

### 2. Build rows
The convention is `SHORTCUT: <what>. ceiling: <limit>. upgrade: <trigger>.` — pull the
ceiling and the trigger straight from the comment. One row per marker, grouped by file:

```
<file>:<line> — <what was simplified>. ceiling: <limit>. upgrade: <trigger>.
```

### 3. Flag the rot risk
Any `SHORTCUT:` marker that names **no `upgrade:` trigger** gets a `⚠ no-trigger` tag —
those are the ones that silently rot (and the write-time guardrail already warns on them).
Want an owner per row? add `git blame -L<line>,<line>`.

### 4. Summarise
End with: `<N> markers, <M> no-trigger.` Nothing found: `No SHORTCUT: debt. Clean ledger.`

### 5. Persist (only with `--write`)
Write the grouped ledger to `SHORTCUTS.md` at the repo root. Without `--write`, change nothing.

## Boundaries
- Read-only by default; `--write` only writes `SHORTCUTS.md`, nothing else.
- Reports shortcuts; it does not fix them and does not judge whether a shortcut was wise —
  that's the `simplification-reviewer`'s job on the diff, not this harvest's.
