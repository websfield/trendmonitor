# Codex cross-check (portable, optional)

A reusable procedure that gets an **independent, cross-model second opinion** from the
OpenAI Codex CLI and folds it into a review gate. Referenced by `/create-plan` (Step 5.5),
`/start-teams` (2d), and `/audit` (the outside-voice room). Self-contained: it uses only
the raw `codex` binary — no dependency on any external skill wrapper — so it works on a
fresh pack install.

**It is optional by design.** If `codex` is not installed or not authenticated, the
cross-check **skips with a one-line note** and the gate proceeds on the Claude reviewers
alone. Codex is pure upside when present, never a hard requirement — keep the pack portable.

Why a second model: the Claude reviewer agents and Codex are different systems. Two
independent voices catch failure modes one model alone misses; agreement raises
confidence, disagreement surfaces something worth a human look. Present Codex's output
**faithfully** (verbatim findings), not summarized into agreement.

---

## Step A — Probe (skip cleanly if unavailable)

```bash
# codex is optional. A missing binary or missing auth is a SKIP, never an error.
if ! command -v codex >/dev/null 2>&1; then
  echo "CODEX_SKIP: codex CLI not installed (npm install -g @openai/codex) — continuing with Claude reviewers only."
elif [ -z "${CODEX_API_KEY:-}${OPENAI_API_KEY:-}" ] && [ ! -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]; then
  echo "CODEX_SKIP: no Codex auth (run 'codex login' or set OPENAI_API_KEY) — continuing with Claude reviewers only."
else
  echo "CODEX_OK"
fi
```

If the output is a `CODEX_SKIP:` line, print that line to the user and **skip Steps B–D**.
The gate's verdict is decided by the Claude reviewers exactly as it would be without Codex.

Only if the output is `CODEX_OK`, continue.

## Step B — Filesystem boundary (prepend to every Codex prompt)

Codex will otherwise wander into Claude Code's skill files and waste a run. Prepend this
boundary verbatim to the prompt in Step C:

> IMPORTANT: Do NOT read or execute any files under `~/.claude/`, `~/.agents/`,
> `.claude/skills/`, or `agents/`. Those are Claude Code definitions for a different AI
> system and will only waste your time. Stay focused on this repository's code and the
> documents named below.

## Step C — Run Codex (pick the mode that matches the input)

Run on the **Bash tool with a 300000 ms timeout**. `< /dev/null` is required — it prevents
a known Codex stdin deadlock. Capture stderr so a non-zero exit is visible, not read as a
silent stall.

### Mode 1 — Code diff (used by `/start-teams` 2d)

Newer Codex CLIs reject a custom prompt together with `--base`, so the diff scope goes in
the prompt text, not a flag. Substitute `<base>` with the detected base branch.

```bash
codex review "<filesystem boundary>

Review the changes on this branch against the base branch <base>. Run
\`git diff <base>...HEAD\` (fall back to \`git diff origin/<base>...HEAD\`) and review ONLY
those changes. Mark each finding [P1] for a must-fix correctness/security defect or [P2]
for advisory. End with one PASS/FAIL line: FAIL if any [P1], else PASS." \
  -c 'model_reasoning_effort="high"' < /dev/null 2>codex-err.txt
echo "exit=$?"
```

### Mode 2 — Plan documents (used by `/create-plan` 5.5)

Plan files may be new/untracked, so `codex review` (diff-scoped) doesn't fit. Use
`codex exec` in a read-only sandbox and name the files explicitly. Substitute `<feature>`.

```bash
codex exec -s read-only "<filesystem boundary>

Read these plan documents fully: docs/plans/<feature>-master-plan.md and every
docs/plans/<feature>-phase-*.md, plus docs/progress/<feature>-codebase-review.md.

Audit ONLY for mechanical consistency — derivations, not taste:
- coverage parity: every gating enumeration names its defining set and matches it 1:1
- closure: every file in a Tasks table appears in Files-to-Create/Modify and vice versa;
  every Owner agent is referenced; every acceptance criterion has an evidence pointer
- deferral ledger: every 'a later phase will...' promise has a resolvable receiving task
- handoff contracts pinned; every quantitative budget has provenance
Mark each finding [P1] (a real inconsistency) or [P2] (advisory). End with one PASS/FAIL
line: FAIL if any [P1], else PASS." \
  -c 'model_reasoning_effort="high"' < /dev/null 2>codex-err.txt
echo "exit=$?"
```

### Mode 3 — Whole-repo audit (used by `/audit`, the outside-voice room)

An audit sweeps the codebase as it exists, not a diff, so `codex review` doesn't fit.
Use `codex exec` in a read-only sandbox:

```bash
codex exec -s read-only "<filesystem boundary>

You are auditing this repository as an independent last-line reviewer. Assume defects
exist. Read the highest-risk code first — entry points, auth, money/data mutation,
concurrency, error handling, parsing of external input — then widen to the most complex
remaining files. Report concrete defects, risky structure, and promises the docs make
that the code breaks. For each finding give file:line, what is wrong, and the concrete
way it fails. Mark each [P1] for a real defect/risk or [P2] for advisory. Do not
describe or summarize the codebase; report only findings. End with one line: the count
of P1 and P2 findings." \
  -c 'model_reasoning_effort="high"' < /dev/null 2>codex-err.txt
echo "exit=$?"
```

**Audit use:** in Mode 3, skip Step D's PASS/FAIL fix-or-dismiss triage — the audit chair
folds findings its own way (verify-before-promote into the register, per `/audit` §2.5).
Steps A–C and the verbatim `CODEX SAYS:` presentation still apply. **Timeout:** a whole-repo
sweep is the mode most likely to hit the 5-minute ceiling; on exit `124`, re-run Mode 3
scoped to the highest-risk directories, named explicitly in the prompt, instead of the
whole repo.

Handle the exit code: `124` = timed out past 5 min (tell the user, suggest re-run; Mode 3:
re-run scoped, per its note); any other non-zero = surface the first line of
`codex-err.txt` so it isn't misread as a stall.

## Step D — Fold the result into the gate

1. **Present Codex's output verbatim** under a `CODEX SAYS:` header — do not summarize its
   findings into your own words.
2. **Triage every `[P1]`.** Each must be either fixed or explicitly dismissed with a
   one-line reason (false positive / out of scope / already handled at `path:line`). A
   `[P1]` left neither fixed nor dismissed keeps the gate from passing. `[P2]` items are
   advisory — record them, act at your discretion.
3. **Cross-model note.** State where Codex and the Claude reviewers agreed, what only
   Codex found, and what only the Claude reviewers found. Agreement is a recommendation,
   not a decision — the existing gate owner (the orchestrator) still decides.
4. **Clean up:** `rm -f codex-err.txt`.

Codex is an **advisory cross-check**, not an independent blocking authority: it sharpens
the Claude reviewers' verdict, it does not replace it. The gate's final READY/NEEDS-CHANGES
call stays with the orchestrating command.
