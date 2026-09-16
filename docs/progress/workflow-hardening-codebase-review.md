# Workflow hardening — codebase review

## Binding and alignment

This is user-requested workflow platform maintenance, not a new Respin feature. WF-01 through WF-08 are the local requirement IDs defined by the master plan and traced to the revalidation audit. They bind to AGENTS.md's ownership, exact verification, and model-routing rules and CLAUDE.md's golden rules/Definition of Done. Product REQ IDs are not invented for tooling.

Supports NORTH_STAR.md's active Respin build by making its existing implementation and verification workflow reliable. No product scope, settled R/ADR decision, or paid service changes. No prerequisite unshipped product capability.

## Shipped dependency evidence

| Dependency | Source proof |
|---|---|
| Codex hooks and focused routing | .codex/hooks.json; .codex/hooks/{lib,guardrails,post-edit-check}.js; current hook self-tests pass |
| Claude canonical hooks/workspace routes | .claude/settings.json; .claude/hooks/post-edit-check.js; .claude/workspaces.json; reproduced skip |
| Compatibility generator and diagnostics | .codex/scripts/sync-claude-compat.ps1 and doctor.ps1; current sync -Check passes |
| Active entry scripts | respin/package.json:28-44; worker/tsconfig.json; CLAUDE.md Commands |
| C4 build target | UgcIntelligence.slnx, src/KnowledgeApi; existing solution build and Architecture suite |
| Cutdown boundary checks | cutdown/apps/cli/src/main.ts:125,149-151 and commands/{contracts,skills-sync}.ts; scripts in cutdown/package.json |

No brief or applicable deferred-findings.md was found. No existing workflow-specific exit-gate document or entry-baseline.md was found; use CLAUDE.md's Definition of Done, not a product milestone exit invented for this tooling change.

## Entry-point traces and ownership

| Capability | Live caller -> implementation -> authority |
|---|---|
| Valid Claude post-edit timeout | Claude PostToolUse -> .claude/hooks/post-edit-check.js -> .claude/workspaces.json and settings.json; Claude-owned handoff |
| Windows ownership denial | Codex PreToolUse -> extractFileChanges -> codex.rules.json -> deny JSON |
| Complete focused checks | Codex PostToolUse -> selectChecks/runCheck -> .codex/workspaces.json |
| Complete offline entry profile | powershell -File .codex/scripts/run-verification.ps1 -Profile all -> declared Respin/UGC commands |
| Truthful adapter status | sync-claude-compat.ps1 [-Check] -> canonical inventory and marked targets -> nonzero on missing/stale/orphan generated adapters |
| Safe generated model defaults | sync -> shared Codex route policy -> generated role TOML; doctor independently verifies artifacts against that policy |
| Correct worker instructions | generated respin-engineer -> canonical .claude/agents/respin-engineer.md -> current stack |
| Bounded orchestration context | $start-teams -> canonical start-teams instruction -> active phase and dependency proof |

There is no service, database, event-log, public API, or product cross-module data reach. The sole cross-owner reach is reading Claude canon and writing Codex adapters. Cutdown's own mirror remains owned by its existing generator; this plan adds no writer to it.

## Critical-Path triggers

Cutdown tenancy & boundaries: yes, because sync traverses its skill mirrors (full separate gate). Security review: yes, for Windows ownership-path matching and generator target validation. All other CLAUDE.md product Critical Paths: not triggered; adding C4 check coverage does not change C4 authority, and changing agent defaults does not change billing/tenancy implementation.

The Cutdown reviewer must render its complete checklist, explicitly marking non-applicable schema/product rows; preserve all existing mirrors and contracts. No product review is discharged by this plan gate.

## Existing patterns

- Keep rule-specific flags and reject unsupported Windows forms before matching; do not lowercase source bodies or weaken unrelated rules.
- Keep extractFileChanges for patch/file tool input normalization, including both sides of moves.
- Keep post-edit map-driven commands and within-patch cwd+command dedup.
- Keep marked-wrapper generation, allowed target roots and CRLF-normalized comparison.
- Use Node built-in node:test/assert and native PowerShell assertions; no dependency/framework addition.
- Use shared route data for generator and doctor, with independently pinned expected results in tests.

## Inherited stopgaps

Inspection command: rg -n 'TODO|FIXME|placeholder|demo|process\\.env|\\$env:|single.tenant|hardcod' against .codex/hooks, .codex/scripts and the exact Claude hook/map/command/agent files.

- CLAUDE_PROJECT_DIR fallback and PATH/PATHEXT executable discovery in the Claude hook: retain; existing runtime integration, no replacement planned.
- Synthetic demo path/key-shaped test data in guardrails self-test: retain as test fixture only; no real credential.
- [check] placeholders in respin-engineer: retain; required product honesty, not missing implementation.
- No TODO/FIXME, hardcoded tenant identifier, or single-tenant shortcut found in these extended flows.
- Doctor's recursive Claude digest may encounter prohibited files: T5 replaces it with an explicit canonical-input allowlist. The same pre-open safe-path policy applies to sync source/marker/custom/native reads, not just hashing. This is required for safe verification, not a product change.

## Files and risks

The exact ownership manifest is Phase 1's Files to Create / Modify table; no other implementation files are authorized by this plan. Principal risks: edits to upstream ownership, overly broad case matching, multiplying synchronous checks past the hook deadline, false custom-adapter freshness, a policy/test agreeing on the same wrong route, and a test harness passing without launching the real script.

All are assigned same-phase tests. No caching, new service, new paid dependency, database change, mass adapter conversion, or generic rewrite.



## Review-driven corrections and changed baseline

The focused C# route must build UgcIntelligence.slnx before Architecture tests because the test project does not reference the C4 Host. The configured Node hook bootstrap uses node -e/require; testability refactors must preserve that entry point. The current start-teams adapter is a marked canonical-pointer wrapper and is a read dependency, not an additional planned write.

AGENTS.md was changed externally during review (routing lines 66-71 and context guidance). This plan does not modify or revert that work. The 2026-09-10 implementation request resolves the wider routing-migration scope: `.codex/config.toml`, `.codex/codex-overlay.md`, all three native route files, and all 30 marked generated agent projections are the exact migration surface. Baseline product implementation remains unchanged by this task.
