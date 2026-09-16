# TrendMonitor Codex instructions

Always respond in English.

## Shared project canon

Before doing project work, read `CLAUDE.md` completely. Treat it as the binding, shared source of truth for architecture, product invariants, commands, critical-path mappings, and Definition of Done. Do not duplicate or weaken those rules here.

Also read `.codebase-map/SUMMARY.md` before broad codebase exploration, then open the exact source files you need before editing them.

Claude owns `CLAUDE.md` and `.claude/**`. Codex may read those files as shared canon and compatibility input, but must never modify them. Codex-specific policy, hooks, workflow overlays, and generated adapters belong only in `AGENTS.md`, `.codex/**`, and `.agents/**`. If a requested change genuinely requires altering the Claude workflow, stop and ask for an explicit boundary change instead of editing it indirectly.

## Codex workflow

For non-trivial work, maintain a short execution plan before editing. Work in small, verifiable steps, fix root causes, and preserve unrelated user changes in the worktree.

Run the checks attached to every touched critical path in `CLAUDE.md`, plus the narrowest relevant tests. A green unrelated command is not evidence that the changed path works. Never claim a check passed unless you ran it and observed the result.

Keep long-running orchestration bounded and visible. Delegate only when the user, an applicable workflow, or the Spark routing policy below explicitly calls for sub-agents. Dispatch sub-agents with only the task contract they need (`fork_turns: "none"` by default); do not inherit the full conversation merely for convenience. A complete pinned contract replaces broad session-history inheritance and repeated full-plan reads. Wait for at most 50 seconds at a time, and give the user a concise progress update at least once per minute while work is active. A status request is a request for an update, not permission to abandon or restart sound worker state.

On Windows, before accepting a browser skill's `NEEDS_SETUP` result, resolve both the extensionless binary and `browse.exe` under the project and user skill roots. An existing `.exe` means the runner is already built; do not stop for installation permission.

Do not read or expose `.env`, `.env.*`, `secrets/`, PEM files, credentials, or tokens. Do not perform destructive commands, force pushes, deploys, purchases, or other external side effects without explicit user authorization.

## Spark subagent routing

Automatically delegate an independent implementation subtask to `spark_worker` only when the current runtime exposes that custom role and all of the following are true:

- The requirement, assigned files, acceptance criteria, and expected result are clear.
- The change is small, locally contained, and independent of other active work.
- It requires no architecture, product, public API, or data-model decision.
- It does not touch authentication, authorization, security, privacy, billing, credits, money, tenancy, migrations, destructive operations, or another path reserved below for Sol or a specialized agent.
- It does not require image input, screenshot interpretation, or visual-design judgment.
- The affected code paths are already known or can be identified with narrow inspection.
- The result can be checked with focused tests, type-checking, linting, formatting, or browser verification.

Good Spark tasks include:

- Small React or CSS changes that preserve the existing design system
- Targeted component implementation with specified states and behavior
- Routine CRUD code within an established pattern
- Adding focused tests, fixtures, or schema/type generation
- Mechanical renaming or conversion in a bounded file set
- Fixing a diagnosed lint, type, build, formatting, or local logic error
- Implementing a clearly specified helper function

Do not delegate to Spark for:

- Architecture or system design
- Authentication, authorization, security-sensitive, privacy, or trust-boundary changes
- Billing, credits, money, tenancy, database migrations, or destructive operations
- Ambiguous or cross-system debugging
- Repository-wide refactoring
- Public API or data-model decisions
- Changes requiring specialized Critical-Path judgment
- Final security, correctness, measurement, release, or production-readiness review

The parent must provide a pinned task contract containing the owned files, required behavior, constraints, acceptance criteria, and exact focused checks. The parent must tell Spark that other work may be present and that unrelated changes must be preserved. After Spark finishes, the parent must inspect the diff and perform the appropriate validation; Spark's report is not final evidence by itself.

Do not run multiple write-capable agents against overlapping files. Do not delegate a trivial change when coordination would take longer than completing it directly. If `spark_worker` is unavailable or Spark reports that the task exceeds its boundary, handle the work in the parent or route it to the appropriate supported stronger or specialized agent; never claim Spark was used when it was not, and do not ask Spark to push through the boundary.

## Token-efficient orchestration

Keep the strongest reasoning where a miss could ship silently, and use cheaper models only where outputs are re-verified:

- Main orchestration and ambiguous cross-module decisions: `gpt-6-astra` at `xhigh`.
- Critical-Path reviewers, security reviewers, and final plan/release gates: `gpt-6-astra` at `max`.
- Money, tenancy, migration, or external-write implementation: explicitly dispatch `gpt-5.6-sol` at `high`.
- Small, independent implementation matching the Spark routing policy: `gpt-5.3-codex-spark` at `medium`, with parent diff inspection and validation.
- Ordinary implementation: `gpt-5.6-terra` at `xhigh`.
- Read-heavy exploration, inventory, and summarization: `gpt-5.6-terra` at `high`.
- Deterministic verification and narrow repeatable checks: `gpt-5.6-luna` at `high`.

Do not use Ultra or proactive delegation automatically. Keep at most four sub-agents active, delegate only independent work, and prefer one owner per write surface. A reviewer may never run below the model tier used for the code it judges; any uncertainty or second-round High/BLOCK finding escalates to Sol.

Read only the active phase plan plus its dependency proof, acceptance criteria, touched Critical-Path checklists, and exact source files. Only load phase plans with master level of information. A sub-agent with a complete pinned task contract does not reread the full conversation or every project document. Return conclusions, file references, commands, and verdicts instead of raw logs.

Use focused checks during implementation. Run the canonical full entry gate once the change is stable and once more after batched gate fixes if code changed. Every touched Critical Path still gets its complete checklist and verdict; token economy changes who performs bounded work and when checks run, never what must pass before Ready.

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
