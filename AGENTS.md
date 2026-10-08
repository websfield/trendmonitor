# TrendMonitor Codex instructions

Always respond in English.

## Shared project canon

Before doing project work, read `CLAUDE.md` completely. Treat it as the binding, shared source of truth for architecture, product invariants, commands, critical-path mappings, and Definition of Done. Do not duplicate or weaken those rules here.

Find code through targeted search and package barrels, then open the exact source files you need before editing them. The `.codebase-map/` mirror is retired; do not use it as evidence about the current tree.

Claude owns `CLAUDE.md` and `.claude/**`. Codex may read those files as shared canon and compatibility input, but must never modify them. Codex-specific policy, hooks, workflow overlays, and generated adapters belong only in `AGENTS.md`, `.codex/**`, and `.agents/**`. If a requested change genuinely requires altering the Claude workflow, stop and ask for an explicit boundary change instead of editing it indirectly.

## Codex workflow

For non-trivial work, maintain a short execution plan before editing. Work in small, verifiable steps, fix root causes, and preserve unrelated user changes in the worktree.

Run the checks attached to every touched critical path in `CLAUDE.md`, plus the narrowest relevant tests. A green unrelated command is not evidence that the changed path works. Never claim a check passed unless you ran it and observed the result.

Keep long-running orchestration bounded and visible. Delegate only when the user or an applicable workflow explicitly calls for sub-agents. Dispatch sub-agents with only the task contract they need (`fork_turns: "none"` by default); do not inherit the full conversation merely for convenience. A complete pinned contract replaces broad session-history inheritance and repeated full-plan reads. Wait for at most 50 seconds at a time, and give the user a concise progress update at least once per minute while work is active. A status request is a request for an update, not permission to abandon or restart sound worker state.

On Windows, before accepting a browser skill's `NEEDS_SETUP` result, resolve both the extensionless binary and `browse.exe` under the project and user skill roots. An existing `.exe` means the runner is already built; do not stop for installation permission.

Do not read or expose `.env`, `.env.*`, `secrets/`, PEM files, credentials, or tokens. Do not perform destructive commands, force pushes, deploys, purchases, or other external side effects without explicit user authorization.

## Agent routing

Mirror the current `.claude/agents/` owner policy with Codex equivalents. These are dispatch requests, not proof of the model or effort the runtime used:

- Main orchestration and ambiguous cross-module decisions: `gpt-6-astra` at `xhigh`.
- Every reviewer and critic, including merged and fallback gates: `gpt-6-astra` at `max`.
- Every specialist implementer: `gpt-6-astra` at `high`.
- Bounded read-only exploration whose conclusions the main session verifies: `gpt-5.6-terra` at `high`.
- Deterministic verification with an exact command manifest: `gpt-5.6-luna` at `low`; its output is checked by the main session before it becomes gate evidence.

Do not use Ultra or proactive delegation automatically. Keep at most four sub-agents active, delegate only independent work, and prefer one owner per write surface. Never run parallel writers against one checkout. A reviewer may never run below the model tier used for the code it judges. A same-class finding on re-review goes to the person for diagnosis under `.claude/gate-rules.md`.

Before dispatching a generated `.codex/agents/` role, check its model request against this routing. If the adapter requests an older tier, use an equivalent generic agent with the canonical role instructions and the required model request; do not treat the stale adapter as a valid gate run. The adapter generator and doctor must be updated together before those generated routes can be relied on again.

Read only the active phase plan plus its dependency proof, acceptance criteria, touched Critical-Path checklists, and exact source files. Only load phase plans with master level of information. A sub-agent with a complete pinned task contract does not reread the full conversation or every project document. Return conclusions, file references, commands, and verdicts instead of raw logs.

Use focused checks during implementation. Before a reviewer gate, run the canonical validation gate on the current tree, then freeze the reviewed target as `.claude/gate-rules.md` requires. Re-run affected validation after batched gate fixes. Every touched Critical Path still gets its complete checklist and verdict. The current `.claude` workflow keeps one progress record per goal and checks plan readiness with `.claude/scripts/plan-ready.js`; follow those sources rather than older per-task artifacts.

## Claude-to-Codex compatibility

The `.claude/` directory remains the canonical, read-only workflow pack. Codex discovery adapters are generated by `.codex/scripts/sync-claude-compat.ps1`, whose write targets are restricted to `.agents/skills/**` and `.codex/agents/**`.

- A Claude `/name` command maps to the Codex `$name` repository skill in `.agents/skills/name/`.
- A Claude skill in `.claude/skills/name/` maps to the corresponding Codex skill in `.agents/skills/name/`.
- A Claude agent in `.claude/agents/name.md` maps to `.codex/agents/name.toml`. Use it when the user or an invoked workflow explicitly requests delegation or that reviewer role.
- `TodoWrite` maps to Codex plan updates; `Read`, `Grep`, and `Glob` map to repository inspection; `Write`, `Edit`, and `MultiEdit` map to `apply_patch`; `Bash` maps to the shell; `Agent`/`Task` maps to a Codex sub-agent; `AskUserQuestion` maps to a concise direct question only when a material choice cannot be inferred safely.
- For `Agent`/`Task`, a canonical phase or reviewer brief is the sub-agent's complete contract. Prefer a minimal-history fork plus exact file paths, acceptance criteria, and a stable review manifest; full-history forks are exceptional and must be justified by an unrecorded conversation decision the task genuinely needs.
- Treat `allowed-tools` or `tools` metadata in canonical Claude files as a behavioral allowlist. Do not use a broader Codex capability merely because it is available.
- Resolve relative resources from the canonical `.claude` skill, command, or agent directory—not from its generated wrapper.
- If a Claude workflow requests a nested Codex self-review (for example `.claude/codex-review.md`), do not recursively invoke Codex as though it were an independent reviewer. Perform the review directly and disclose that the independent cross-model check was unavailable.

After adding, removing, or renaming Claude skills, commands, or agents, run:

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/scripts/sync-claude-compat.ps1
```
