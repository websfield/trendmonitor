# Workflow hardening — revalidation audit

Date: 2026-09-10. Inspected baseline: 3273f36d6f1b7b8bd0f5cbd83aaac3944b2fa0d8.
Scope: the nine findings from the preceding workflow review. This is planning evidence, not implementation completion.

## Findings and disposition

| ID | Verdict / priority | Verified gap and evidence | Receiving requirement |
|---|---|---|---|
| F1 | Confirmed / High | Claude post-edit rejects timeoutMs above 165000 (.claude/hooks/post-edit-check.js:212,280), while .claude/workspaces.json supplies 240000/300000 and .claude/settings.json:50 allows only 180 seconds. Actual hook-input probes for Respin TS/schema, C# and Python returned exit 0 plus SKIPPED invalid timeout; checks did not run. | WF-01 |
| F2 | Confirmed / High | .codex/codex.rules.json:6 matches Claude-owned paths case-sensitively on Windows; .codex/hooks/lib.js normalization preserves case. Actual PreToolUse probes denied CLAUDE.md/.claude but accepted cLaUdE.md/.CLAUDE variants with no deny decision. No protected file was edited. | WF-02 |
| F3 | Confirmed / High | .claude/agents/respin-engineer.md:3,20-22 still prescribes Inngest and Vercel/Neon/Clerk. CLAUDE.md:9 prescribes pg-boss, self-hosted Postgres/Lightsail, Better Auth. Generated agents read this source directly. | WF-03 |
| F4 | Confirmed / Medium | .codex/scripts/run-verification.ps1:21-27 omits preflight and worker:typecheck, both in CLAUDE.md:70-71 and respin/package.json:39,44. Root tsc includes worker files through **/*.ts, so the defect is missing worker-config verification, not zero worker coverage. | WF-04 |
| F5 | Narrowed / Medium | .codex/hooks/post-edit-check.js:26 chooses only the first command per path. Schema TS selects db:check but not typecheck; .codex/workspaces.json:9 excludes src/KnowledgeApi C#. Selection probes against the actual module confirmed both. These are dispatch-contract probes, not successful product checks. General Cutdown post-edit coverage is not established as a requirement and is excluded. | WF-05 |
| F6 | Rejected as a correctness fix | Separate edits legitimately invalidate previous results. Deduplication already exists within one patch. No measured avoidable rerun or stale-result bug was established. Do not add persistent caching, debounce, background queues, or a scheduler. | None |
| F7 | Narrowed / Medium | Thirteen non-generated custom skill implementations are intentionally preserved by sync; all thirteen currently match their Claude sources ignoring line endings. No current stale custom implementation was found. Source removal leaves marked generated orphans unchecked; a missing target with a surviving source IS detected. Custom preservation is counted as current coverage without separate verification status. | WF-06 |
| F8 | Narrowed / Low | .claude/commands/start-teams.md:26 requests every phase plan; AGENTS.md:76 requests active phase plus dependency evidence. Codex precedence already resolves this, so this is contradictory guidance, not proof of actual unnecessary loading. | WF-07 |
| F9 | Narrowed / Medium | AGENTS.md:68 requires Sol/high for money, tenancy, migrations and external writes. Generated respin-engineer defaults to Terra/high; doctor.ps1:127-129 requires all writable generated roles to do so. Explicit per-dispatch overrides mitigate this, but the generated defaults and diagnostic cannot detect the unsafe default. No past wrong-tier execution is claimed. | WF-08 |

## Observed checks

- Both Codex hook self-tests: exit 0.
- Compatibility sync normal and -Check: exit 0; created=0, updated=0, existing=93. This output does not certify custom-copy freshness.
- Inventory: 30 source agents and 30 marked generated agents; 13 custom skills examined, no present content drift after CRLF normalization.
- Real hook stdin probes demonstrated F1/F2 without editing protected files.
- Post-edit command interception demonstrated F5 selection only; it did not execute the selected product commands.
- Product entry gates and full doctor were not run for this planning-only audit. Existing self-tests passing does not contradict the planted failures.
- Git worktree was clean before these plan documents. Git emitted an inaccessible user ignore-file warning; no claim about that file's contents is made.

## Scope correction

Eight findings retain some actionable scope; F6 does not. F5/F7/F8/F9 are explicitly narrower than the original allegations. No login/authentication defect was established by this workflow audit.

The plan also closes aggregate-timeout exhaustion when F5 makes multiple commands reachable: this is a necessary failure path of the chosen fix, not a claim that an existing multi-command hang was measured. No performance or token-saving percentage is claimed.



## Subsequent planning evidence and limits

- The plan gate narrowed the Windows-form concern: lexical probes leave trailing-dot/space spellings unmatched even with case-insensitive matching, but real Node stat calls return ENOENT for those spellings. This is not evidence of a successful live alias write. The plan explicitly rejects unsupported forms rather than claiming a demonstrated exploit.
- The C4 test project references the library, not the C4 Host. The planned focused route therefore needs a solution build as well as architecture tests.
- The existing generated start-teams adapter dynamically reads the canonical command. A body-only source edit with unchanged frontmatter does not require a target rewrite; that review allegation was withdrawn.
- Installed uv help confirms offline/no-sync/frozen controls. pnpm --help fails EPERM in this environment; no dependency installation or product gate was attempted.
- AGENTS.md changed externally after the initial audit: Astra orchestration/reviews, Terra ordinary xhigh/exploration high, Luna verification high. Those changes are preserved; wider migration ownership remains an open user question. The original F9 evidence describes the earlier baseline, not permission to restore its obsolete routes.
