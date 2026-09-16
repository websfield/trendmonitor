# Workflow hardening — Phase 1

Status: PLAN READY — security PASS/A, Cutdown PASS/A, generalist READY/A after the hard-link correction. User accepted the 53-file single-phase size risk. Implementation is paused before its first edit: the configured checkpoint failed with permission denied on `.git/index.lock`. This current status supersedes historical pending-approval statements below. Requirements: WF-01..WF-08.
Depends on: none.
Execution: parent via $implement for Codex-owned work; Claude/the upstream owner for T1. No write-capable subagent dispatch is required or authorized by this document alone.

## Project Conventions Pinned (READ FIRST)

The following golden rules are verbatim from CLAUDE.md:

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code — and a claim you *record* (in a comment, a doc, a decision log) is verified against the file it names **in the same action that records it**. A structural claim ("this can never happen") is proven by running it (a test or the command), not by an argument.
2. **No secrets in code, commits, or logs.** Credentials live in env/config; a leaked secret is a rotate-everything incident.
3. **Never destroy what you didn't create without explicit confirmation** — files, data, branches, running state. Deletion is the one mistake you can't iterate on.
4. **Fix causes, not symptoms.** A change that silences an error without explaining it hides the bug instead of fixing it.
5. **Match the codebase.** Existing conventions beat your preferences; a new dependency needs a reason the standard library can't answer.
6. **Report honestly.** Failing tests, skipped steps, and half-done work are reported as exactly that — "done" is a claim the checks have to back. A result counts only if the *method* was sanctioned too: output from a command this file's rules forbid, or from a run pointed at a copy instead of the real target, is discarded and re-obtained — and you name the command you actually ran, rather than waiting for someone to object.
7. **Small, verifiable steps.** Prefer the change you can test over the big-bang you can't; if you can't verify it, say so.
8. **Scale caution to blast radius.** Reading and analyzing are free — they change nothing. Edits and test runs are cheap — they're reversible. Pushing, publishing, sending anything outside the repo, and deleting what you didn't create (rule 3) are not: those wait for explicit confirmation, and if you catch yourself reaching for reasons one is *probably* fine, that reaching is the signal to stop and ask.
9. **Current facts beat trained memory.** Library APIs, CLI flags, and config schemas are present-day facts: verify against the installed version (lockfile, type definitions, `--help`, official docs) before use — partial recognition from training is not current knowledge.

Relevant lessons, verbatim:

- 2026-08-02 — **A tool's exit code tells you it ran, never WHAT it ran on**: an install is proven by **importing** each package (and a uv/pnpm **workspace root** syncs only the root project without `--all-packages`), and a linter that resolves config by walking UP the tree (ruff, eslint, git attributes…) treats a nested self-rooted project's "no config file" as **the enclosing repo's config, silently** — pin the subproject's own config and treat a green claim as vacuous until you know which config or package produced it (why: `uv sync` exited 0 having installed nothing, then reported success while three OpenCV distributions clobbered one `cv2/` directory and broke three engines at import; and cutdown Python passed five phases of "ruff clean" under the UGC root's selection nobody chose — merged 2026-09-09, both from the parked Python lines).
- 2026-08-10 — A diagnostic that reports "present" must distinguish **present-and-verified** from **present-and-unrun**, and an architecture guard satisfied by *splitting* a file must be re-checked for the hole the split opens (why: `cutdown doctor` printed a green `OK` for a `uv`/`pnpm` it had just failed to execute — four probe outcomes collapsed into one empty version string, in the one command whose job is honest environment reporting, surviving because no test called either check — and moving the spawn out of `doctor.ts` to satisfy tech-spec §11 then made `toolVersion('ffmpeg')` invisible to the very detector, since the caller names the binary without importing `child_process` and the helper imports it without naming one).
- 2026-08-26 — **A verifier that reports success is not verified until something OUTSIDE it tries to break it**: a scanner built from a string-assembled regex fails OPEN silently (one lost backslash turns `\s` into `s`), and a mutation matrix is blind to a control that was never written — so every scanner must assert it catches a PLANTED violation of each shape it claims to cover, and a mutation report needs someone else planting the mutations before "N of N red" is trusted (why: two M2a scanners' emitted-SQL check matched zero FKs and would have reported "no unqualified foreign keys" because it found no foreign keys at all, caught by an esbuild parse error rather than a red test; separately, 24 self-planted mutations all reddened and the conclusion "every survivor is wiring, never module logic" held right up until four reviewers planted ten more and SIX survived, two of them module logic in code written that hour, with every one of their worst findings an ABSENCE no mutation could reach — a missing role gate, a trusted `input_class` label, an un-run advisory lock whose deletion left 789 tests green, and a hash that was simply the wrong equivalence relation; a REQUIRED parameter with no default gave the same blind spot its sharpest form — deleting R8's whole `attested !== true` refusal left **158 tests green** because every call site passed `true` and the refusal had no witness).
- 2026-09-08 — **Never answer your own error rate with more structure.** When a review round finds regressions in the previous round's fixes, check each one against the proposed remedy before proposing it: if a smaller unit would not have prevented it, the unit size was not the cause and splitting only adds contracts, manifests and gates. `/create-plan` already says "the minimum number of phases" and "boil the lake" — a split proposed after a bad round contradicts the plan's own authoring rule (why: after round 2 of Task 5 returned three regressions I had introduced — a `psql -c` that never interpolates, an absent-chain check that made the restore drill unpassable, a sidecar sweep that deleted live manifests — I proposed cutting Task 6 into three; all four regressions came from not verifying a tool's behaviour, not enumerating a population, and not reusing an authority the package already exported, and **not one** would have been prevented by a smaller task).
- 2026-09-04 — **Verify the bytes your edit changed, and the harness that says they are fine**: an edit that rewrites line endings is invisible to `git` under `core.autocrlf=true` yet silently breaks every guard matching a multi-line source literal, and a check that greps a tool's *formatted* output is worthless until you have watched it FAIL a known-bad case (why: Python text-mode writes converted LF→CRLF across two dozen edited files — git showed a clean 95-line diff while `with-workspace.test.ts`'s pause-gate anchor probe went red — and in the same session a mutation matrix greped vitest's ANSI-coloured summary for a failure count, so it reported "SURVIVED" for all nine mutations unconditionally, caught only because the numbers were implausibly good; the reviewers had handed me that exact vacuous-harness finding an hour earlier).

Additional binding rules:

- AGENTS.md: Claude owns CLAUDE.md and .claude/**. Codex never modifies them, including through scripts, regeneration or a delegated agent. T1 is an upstream handoff. Do not weaken the ownership rule to unblock this phase.
- No .env/.env.*, PEM, secrets-named file or secrets directory reads; never print credentials. Every sync/doctor content read needs the pre-open policy in T5; excluded paths are uninspected, never verified.
- Active stack: Next.js 15/TypeScript; self-hosted Postgres/Drizzle, Better Auth, pg-boss, Stripe, Anthropic through the provider adapter; Docker locally/Lightsail production, no Vercel/Neon/Clerk. Respin is self-rooted under respin/. UGC/Cutdown remain separate. pnpm@10.28.2 for Respin/Cutdown; npm for src/Frontend. This phase changes no product code or dependencies.
- Cutdown's canonical skill registry and .claude/skills/cutdown-* mirror remain owned by Cutdown's existing sync. Codex adapters are projections, never a second source or writer to that mirror. No schema, decision, delivered artifact or generated contract tree is modified.
- Current AGENTS.md routing, changed externally during this review: parent Astra/xhigh; reviewers Astra/max; sensitive implementation Sol/high; ordinary implementation Terra/xhigh; exploration Terra/high; deterministic checks Luna/high. Preserve that user edit. This phase includes the corresponding wider configuration, native-route and all-generated-role migration listed in the exact file manifest. A reviewer is not cheaper than what it judges. Do not automatically delegate; max four subagents, wait <=50 seconds, update at least once/minute.
- Review roles used here exist: security-reviewer, cutdown-boundary-reviewer, plan-reviewer. Other available implementation roles are control-plane-engineer, intelligence-plane-engineer, eval-harness-engineer, frontend-engineer and respin-engineer; none owns Codex tooling. Do NOT request workflow-manager, workflow-engineer, spark_worker or general-purpose as if it were a repository specialist. Parent execution is the supported $implement fallback.
- Evidence is per phase: one report card, transcripts and one master ledger row. No per-task report documents. Use apply_patch for local edits. Preserve unrelated changes and line endings.

## Requirements Checklist (functional)

- [ ] WF-01 configured Claude checks launch under valid bounded budgets.
- [ ] WF-02 supported Windows case/path variants deny correctly; noncanonical forms have an explicit pre-match rejection contract.
- [ ] WF-03 active Respin stack replaces obsolete role instructions.
- [ ] WF-04 preflight and worker:typecheck run in the offline Respin/all profiles.
- [ ] WF-05 schema checks include drift and typecheck; C4 receives C# coverage; batches dedup and remain bounded.
- [ ] WF-06 missing/stale/orphan generated adapters fail check; custom implementations remain untouched and separately reported.
- [ ] WF-07 start-teams loads active phase plus dependency evidence; dependency gates survive.
- [ ] WF-08 generated sensitive defaults are Sol/high; all generated, native and project-default routes follow current AGENTS.md; doctor agrees with the exact manifest.

## Requirements Checklist (technical)

- [ ] INV-OWN (invariant-id: wf-claude-readonly): mechanisms are rule-specific case-insensitive matching, pre-match noncanonical-path rejection and generator containment; migration none; tests G1-G5/S1-S5.
- [ ] INV-CHECK (invariant-id: wf-check-evidence): mechanisms are full declared command lists, bounded deadlines, owned-child cleanup and distinct pass/fail/not-run outcomes; migration none; tests H1-H7/V1-V4.
- [ ] INV-MIRROR (invariant-id: wf-adapter-authority): expected inventory is derived from current canonical sources; marked generated status is separate from custom preservation; migration is regeneration of eligible Codex targets only; tests S1-S5.
- [ ] INV-ROUTE (invariant-id: wf-sensitive-defaults): one Codex route-policy helper feeds generator and doctor; migration uses the exact T6 manifest once scope is resolved; independent expected-model tests R1-R4.
- [ ] No product invariant/schema/database/public API changes, new dependency, background worker or persistent cache.
- [ ] Tests distinguish fixture/dispatch evidence from actual real-target command success. No green from an unrelated package/config.

## Reachability

A repository contributor can get protected edits refused, receive the intended focused checks, verify the complete offline command profile and inspect truthful adapter/model status — through the existing PreToolUse/PostToolUse hooks, $start-teams, sync-claude-compat.ps1 and doctor.ps1 entry points updated in this phase.

## Ownership and handoff contracts

T0 creates the Codex regression harness. T1's upstream owner can run its Claude-hook cases against the real checkout without writing Codex files. Before T1, provide the owner only T1's exact file set, the pinned rules, timeout/stack/context contract and H1/H2/D1 tests. Those Node tests use titles beginning H1:, H2: or D1: and run via: node --test '--test-name-pattern=^(H1|H2|D1):' .codex/tests/workflow-hooks.test.cjs.

The upstream handoff returns a commit/diff limited to P01-P04, exact changed-file hashes and H1/H2/D1 test results. Codex re-reads the supplied changes, verifies them and runs sync; the report records upstream pending until that happens. Do not spawn a Claude agent from Codex to evade the boundary.

No cross-phase artifact exists. Same-phase artifacts are:
- shared Get-CodexAgentRoute helper: name + readOnly input; object with Model and Effort strings; the five current writers are explicitly classified, unknown writers throw before generation, and exact model values follow the current policy listed in T6. The complete regeneration manifest is P14/P15/P26-P53;
- generated inventory entries: canonical source path, kind, target path, expected text and marker classification; in-memory only, no new ownership registry;
- phase report: command, real cwd/config, exit, pass/fail/not-run, evidence path and any missing authority.

## Implementation Tasks

File IDs expand exactly to the manifest below; no implicit write surfaces.

| # | Task | Owner | Files |
|---|---|---|---|
| T0 | Add failing regression cases and narrowly testable script entry functions without new public root/command override flags | Codex parent | P05, P07, P09, P10, P13, P17, P18 |
| T1 | Obtain Claude-owned timeout, current-stack and active-phase guidance corrections | Claude/upstream owner, external handoff | P01, P02, P03, P04 |
| T2 | Fix case denial and reject unsupported Windows forms, preserving body/unrelated-rule semantics | Codex parent | P06, P17, P20, P21 |
| T3 | Close focused-check gaps and batch deadline exhaustion, preserve first-match routing and dedup | Codex parent | P07, P08, P17 |
| T4 | Add the two missing Respin entry commands and truthful per-command failure behavior | Codex parent | P09, P18 |
| T5 | Derive/check generated inventory, preserve custom files, safely validate target containment and diagnostic read scope | Codex parent | P05, P10, P18 |
| T6 | Share/verify safe model defaults; migrate project/native routes; regenerate every eligible marked role adapter; document override limits | Codex parent | P05, P10-P15, P18, P22-P53 |
| T7 | Complete real-target verification, required code gates and phase evidence | Codex parent; existing read-only security-reviewer/cutdown-boundary-reviewer | P16, P19 |

### T0: Test entry and evidence contract

Use Node built-in node:test/assert in P17 and native PowerShell assertions in P18. Invoke real hook entry files with actual supported JSON (apply_patch uses tool_input.command; file tools use file_path/path and content/new_string/text/edits). Assert JSON denial or exit/status, not formatted success strings alone.

For PowerShell scripts only, move execution into functions in their existing files and guard CLI invocation when dot-sourced. Dot-sourcing performs no filesystem reads/writes or external command execution beyond defining functions. Node hooks must keep their actual hooks.json bootstrap reachable: that bootstrap uses node -e followed by require(...), so do not add a require.main === module guard that disables it. H7 launches the configured bootstrap with test-scoped interception of only the selected child checks, proving dispatch without pretending those intercepted product commands ran. Internal fixture parameters may supply repo root or command runner; production CLI still resolves its own repository and launches the declared commands. No user-facing arbitrary-root or command-execution mode is added. Tests must prove the CLI path and function path share the same production logic.

Temporary fixtures are created below a newly allocated, resolved temporary directory and contain synthetic inputs only. A fixture is a unit/integration test, not evidence that the real adapters are current. Never modify or poison actual Claude sources, real product files, PATH globally or installed tools. Cleanup deletes only test-created, resolved descendants of that temp directory; no broad/glob deletion. Do not suppress cleanup failures.

### T1: Upstream corrections

P01/P02: retain existing 150000 default and every existing workspace command budget. Set maximum accepted timeout to 300000 ms, outer PostToolUse timeout to 330 seconds. Keep existing one-command-per-edit behavior, launch detection, Windows .cmd/.bat handling, timeout exit 2, and missing-tool/config SKIPPED semantics. H2 includes a real synthetic hanging child/grandchild witness: the hook must terminate and reap only its owned process tree before completion. If the present runner leaks descendants, replace its timeout lifecycle using an owned-PID, platform-native termination path; do not introduce a process supervisor service. Cleanup failure reports nonzero with remaining owned PIDs, never a completed/green claim. The 30-second outer headroom bounds termination and diagnostics. Tests derive all command-bearing rows from the real .claude/workspaces.json and reject any budget beyond maximum/outer headroom.

P03: replace obsolete deployment/database/auth/job prose and description with current CLAUDE.md:9/tech-spec §1 and decisions R-18/R-19/R-52. Retain provider abstraction, security/product invariants and self-rooted module boundary; no broad role rewrite.

P04: only change the start-teams Step 1 body to master overview + active phase + prior dependency acceptance/evidence. Keep its frontmatter unchanged. The existing marked .agents/skills/start-teams/SKILL.md wrapper reads this canonical command dynamically; D1 asserts that pointer and unchanged generated bytes. It is a read dependency, not another write target. Do not preload every phase, bypass unfinished prerequisites, alter final plan review's full-plan reading, change the round budget, or weaken Critical-Path gates.

### T2: Ownership guard

Make only the claude-ownership rule case-insensitive; leave body matching and unrelated rule flags untouched. In P20, define the supported Windows input language before normalization: ordinary repo-relative paths and fully qualified drive-absolute paths, slash/backslash separators, optional paired outer quotes, and normal dot segments. Reject non-string/NUL/control-character input, unpaired quotes and Windows-forbidden filename characters (internal quotes, <, >, |, ? or *); reject device/extended/UNC/root-relative or drive-relative forms; ADS colon outside the drive prefix; non-dot path components ending in dot/space; reserved DOS device basenames; and short-name-shaped components containing ~ followed by a digit. Reject escaped/outside-root results. Do not silently normalize an unsupported input into an empty change list. P21 catches these errors and emits an explicit deny before shared-rule/file-content reads; P07 reports unsupported post-edit input as not verified/nonzero. Symlink-mediated and hostile concurrent workspace mutation are outside this lexical file-tool guard's guarantee; existing ownership prohibition and sandbox remain binding.

G1: Add/Update/Delete protected paths across canonical, uppercase and mixed-case spellings all deny.
G2: Move from protected and move into protected paths both deny; file tools and MultiEdit variants match.
G3: absolute/relative paths, backslash/slash, quote-wrapped paths and dot segments resolve to the same denial; nested-cwd inputs are covered.
G4: ordinary AGENTS.md/.codex files, CLAUDE.md.bak, .claude-other and an unrelated source path are not denied by the ownership rule; unrelated content rules retain their original case semantics.
G5: plant every rejected path-form class above through supported tool payloads and both move positions; assert deny occurs before content reads. Include safe internal-space/dot-segment/paired-quote controls. These are rejection-contract tests, not claims that every spelling aliases a live file on this filesystem: real Node stat probes returned ENOENT for the trailing-dot/space examples.

Scope is supported file-write tools named by hooks.json. This is not an OS-level sandbox guarantee for arbitrary shell writes, symlinks or unsupported tools; existing prohibition and sandbox still apply.

### T3: Focused checks and aggregate deadline

Retain first command-bearing match per path. Change the schema route to db:check && typecheck; include src/KnowledgeApi/**/*.cs in the C# route and pin that route's command to: dotnet build UgcIntelligence.slnx -v q --nologo && dotnet test tests/Architecture --nologo -v q. Tests alone do not compile the C4 Host; its project is absent from the Architecture test project's references. Keep migrations-only behavior, general TypeScript behavior and notes intact. Use 240000 ms for the combined schema route (existing Claude route's budget); do not add a broad Cutdown route.

Retain dedup by cwd + command within a single patch; do not cache across edits. Normalize duplicate paths in evidence; repeated notes appear once. A schema-plus-general-TS patch may still have a composite command and a separate typecheck: semantic shell-command dedup is not promised; do not build a shell parser to optimize it.

Compute one aggregate execution deadline when the Codex hook begins: outer timeout from .codex/hooks.json, less 15000 ms reserve. Use a monotonic elapsed-time clock. Each command receives min(its configured timeout, remaining aggregate work budget). An invalid/absent outer configuration or nonpositive remaining time prints NOT RUN/INCOMPLETE, exits nonzero, and never claims all selected checks passed. A started timeout/nonzero child exits 2; don't launch later commands. List pending checks so the user can run them manually. Before reporting completion, terminate/reap the owned command tree, including Windows shell descendants, within the 15-second reserve; use only PIDs from processes this hook launched. Cleanup failure reports outstanding owned PIDs and nonzero. A synthetic child/grandchild timeout witness must verify actual termination, not just mocked status. Preserve existing diagnostic buffer limit. Validate timeout values as positive integers; no silent default on malformed values.

H3-H5 test mixed-workspace batches, dedup, successful completion, command failure, invalid timeout, exhausted budget before first/next command and near-deadline clamping using a controlled clock/runner. Assert child execution is never given more than remaining budget. Existing shared-map load failure behavior remains a visible not-verified message, never a pass.

H6 checks that the real solution lists the C4 Host and the selected route invokes its solution build. A minimal isolated healthy/broken-host fixture must first build successfully, then fail with a compiler diagnostic naming the planted Host source when the same selected build command runs. Use installed SDK/reference packs and an empty local restore source only; no downloaded test packages, no real product mutation. A restore/tool failure is NOT RUN, not the required compile-failure witness. Real Step 8 remains the product proof.
H7 executes the configured node -e/require hook bootstrap with controlled child-check interception, verifies input reaches the real hook and its intended dispatch, and proves a silent no-op entrypoint cannot pass. It is dispatch evidence only.

### T4: Verification profile

Respin ordered defining set:
1. pnpm -C respin preflight
2. pnpm -C respin typecheck
3. pnpm -C respin worker:typecheck
4. pnpm -C respin lint
5. pnpm -C respin test
6. pnpm -C respin build
7. pnpm -C respin db:check

Retain the seven existing UGC commands unchanged. Profile all is their concatenation: 14 distinct declared steps, no duplicated additions. Keep per-step logs and aggregate failure. Missing executable/nonzero command is FAIL, not present/green; later steps still run. Initialize exit state per step so stale LASTEXITCODE cannot mark a failed launch successful. Neither profile adds Docker startup, db:migrate, external writes or test credentials.

V1 asserts exact per-profile command/argument order and count from an independent expected list. V2 injects missing-tool/nonzero outcomes including both added commands and verifies final nonzero plus remaining-step execution. V3 asserts log paths, exits and working root correctly reflect each command. V4 runs real preflight and worker:typecheck via the real profile in final verification; fixture routes are not final evidence.

### T5: Adapter inventory, status and diagnostics

Before any writes, inventory canonical skills with SKILL.md, top-level command .md files, commands/watch/SKILL.md, and agent .md files excluding _critic-template.md. Resolve names with the existing metadata/fallback rules. Validate source folder/file stems and resolved metadata names using the portable lowercase grammar ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$. Reject DOS reserved basenames con/prn/aux/nul/com1..com9/lpt1..lpt9, separators, dot traversal, trailing dot/space, ADS colons and control characters. Compare canonical destination keys case-insensitively on Windows; reject duplicate skill+command destinations and source-name aliases before any write. Compare all targets with the defining inventory; compare text ignoring CRLF only.

Generated ownership is structural, never substring-based. An agent target is marked generated only when its first physical line equals the agent marker. A skill target is marked generated only when the exact marker occupies its own canonical marker line after the validated minimal frontmatter and `# <expected-name>` heading. Embedded, quoted, indented, duplicated, misplaced or otherwise ambiguous marker text does not grant generated ownership. Such content is preserved and classified as custom/unmanaged or a collision; it is never overwritten. Marked generated target outcomes are current, missing, stale, orphan. Unmarked custom skills with expected source are preserved-custom / freshness-unverified; never counted as verified generated. Unmarked native agents are outside generated inventory and preserved. Unexpected unmarked files are not auto-adopted or deleted; report as unmanaged, not orphan-generated. Expected generated agents colliding with unmarked content remain errors.

Before each explicit inventory/config/marker/digest data read, sync and doctor both use one pre-open safe-path check, defined in the side-effect-free sync script and reused by doctor. This is not a claim to intercept every implicit module-load read in launched toolchains. Permitted content inputs are canonical skill SKILL.md files under one validated skill directory, top-level command .md files, commands/watch/SKILL.md, canonical agent .md files, candidate target SKILL.md/TOML paths under validated target names, and specifically named configuration .claude/guardrails.rules.json. The target-candidate population is exact and includes source-less orphan candidates: immediate `.codex/agents/<validated-name>.toml` files and `.agents/skills/<validated-name>/SKILL.md` files at that fixed depth. Enumeration reads metadata only; before opening any candidate for structural marker classification, validate its name, root containment, ancestor/entry reparse state and prohibited-name policy. An unsafe, unreadable or reparse candidate fails inventory before writes without reading its content; a safe unmarked candidate is preserved and reported custom/unmanaged. Doctor's additional explicit Codex data-read allowlist is .codex/codex.rules.json, .codex/workspaces.json, .codex/hooks.json, .codex/config.toml, .codex/rules/safety.rules, .codex/scripts/sync-claude-compat.ps1 and .codex/hooks/post-edit-check.js; module entry files are executed only from their pinned repository paths. Inspect entry/ancestor metadata without following reparse links, check root containment and permitted path shape, and reject prohibited names (.env forms, PEM/secrets names, credential/token/private-key file names) before opening. Apply this to source frontmatter, every target-candidate marker scan, custom/native targets and digest inputs, not only writes. Required prohibited/reparse/unreadable input fails before writes; paths outside the exact candidate population remain uninspected with a diagnostic. No directory-wide content scan is permitted.

-Check makes no writes and exits nonzero on missing/stale/orphan generated, structurally ambiguous marker placement, invalid source names, collision or unreadable required/candidate input. Normal sync creates/updates only allowed structurally marked or missing targets; validation/orphan/collision errors are discovered before writes. It never deletes a generated orphan. First inventory every repository-owned writer into .agents/skills and .codex/agents: inspect the existing sync Write-GeneratedFile call sites plus any matches from rg -n 'sync-claude-compat|\.agents[/\\]skills|\.codex[/\\]agents' over AGENTS.md/.codex/.agents with prohibited files excluded. Classify references separately from actual writers; do not assert a single writer from a count alone. The expected generator writer is sync-claude-compat.ps1; user-owned custom files are not auto-adopted. The printed remedy names the source/target and offers a non-destructive path first: ask the upstream owner to restore the intended canonical source, then rerun sync/-Check. If removal was intentional, ask the owner for an explicit decision on that exact marked generated projection; cleanup remains optional and separately authorized. Never tell Codex to create a protected source, delete evidence, or clean up a custom file. No restore/delete of user files is implied.

Validate lexical/physical containment and reparse status during inventory and immediately before every write. Refuse symlink/junction/reparse sources, ancestors or targets rather than traversing them; test this where platform supports it, report unsupported fixture creation honestly. For every existing file subject to a content read or write, also obtain the filesystem link count through metadata-only inspection and require exactly one link. On Windows use native file metadata (GetFileInformationByHandle with an attribute-only handle, or Node fs.lstatSync().nlink); do not open content to detect an alias. Missing/unsupported metadata or a count other than one fails closed before content reads or writes. This covers canonical sources, custom/native/generated candidates and digest inputs, and is repeated immediately before writes. S3/S5 plant two synthetic paths linked to the same file: an allowed source/target alias and a protected or prohibited-name alias. Both sync and doctor must refuse the allowed alias before a content-read spy or any writer fires; alias bytes remain unchanged. No real protected file is linked or mutated. Execution assumes no concurrent hostile process mutates the workspace between checks; this is not a sandbox against such an actor. Use one writer for these surfaces and stop on detected concurrent changes; no stronger atomic-race guarantee is claimed. Failure after some file writes returns nonzero and lists changed paths; retry is idempotent, not an automatic destructive rollback.

Doctor uses the same inventory/status vocabulary and independently checks generated roles against route policy. Replace its recursive Claude-tree digest with hashing only the explicit canonical sync input list plus .claude/guardrails.rules.json, using the same pre-open policy. It reports only those named inputs unchanged during -Check; all other Claude paths are uninspected. It must not read arbitrary files to decide whether they might be credentials. Tests spy on every source/custom/native/marker/hash open in both sync and doctor, including forbidden/reparse entries; do not recurse through excluded directories.

S1: real source inventory categories plus missing/stale/current/rename/removal fixture cases.
S2: orphan structurally marked skill/agent fails -Check; source-less candidates are safely classified; all existing custom skills/native agents are preserved byte-for-byte; a custom SKILL.md and TOML that quote, indent or misplace the marker remain custom and cannot be overwritten; no hardcoded custom count as a future gate.
S3: invalid grammar, Windows-reserved/ADS/control/trailing-dot/space names, case-only collisions, unmarked or structurally ambiguous collisions and out-of-root/reparse entries refuse with zero prevalidation writes; required or candidate unreadable input fails before a content read.
S4: -Check no writes; normal idempotent sync; write failure reports partial work and retry converges without deleting files; just-before-write revalidation catches a planted reparse swap; orphan diagnostic names both source and target and offers source restoration first, never deletion of custom/evidence files.
S5: open-spy tests prove both sync and doctor exclude/refuse prohibited, non-allowlisted and reparse paths before any read; doctor hashes only named canonical inputs; status separates generated verified, custom unverified and unmanaged/uninspected.
All mutation witnesses live in fixtures; final real sync -Check remains mandatory.

### T6: Model route policy

The 2026-09-10 request to implement the complete plan resolves the routing scope: include the full migration from the externally edited AGENTS.md policy. AGENTS.md remains user-owned input and is not rewritten by Codex. The exact output population is `.codex/config.toml`, `.codex/codex-overlay.md`, the three native route files, and all 30 marked generated role projections listed in P14/P15/P26-P53. No other generated or native target is authorized.

The helper is still one small Get-CodexAgentRoute function, not a fuzzy classifier or runtime dispatcher. Classify the complete current writer population explicitly:

- Sensitive mixed-risk writers: respin-engineer and control-plane-engineer -> Sol/high.
- Ordinary writers: eval-harness-engineer, frontend-engineer and intelligence-plane-engineer -> Terra/xhigh under the current policy.
- Unknown writer -> throw before generator writes; doctor fails. Writer-policy names and canonical writable-role names must have exact set parity, including removals.
- Read-only roles -> Astra/max under the current policy.

Current native policy is explorer Terra/high, verifier Luna/high, merged reviewer Astra/max, orchestration Astra/xhigh, and the project default subagent is ordinary Terra/xhigh. The baseline generated/native/config files still carry older routes. The complete exact output set is listed below; sync must produce no unlisted target change. Preserve the user's AGENTS.md changes.

The five current writer identities are proven by canonical agent tools metadata. P11/P12 must preserve mandatory explicit Sol/high dispatch for every sensitive task regardless of role, not treat an ordinary default as permission for sensitive work. Regenerate eligible TOML through sync only. If a model is unavailable, stop/report; no downgrade.

R1 independently pins the classified writer population, expected policy values and exact source/target parity; adding an unclassified writer or leaving a removed writer in policy fails both generator/doctor before writes. R2 rejects a planted ordinary-model sensitive target even when counts match. R3 parses the approved P14/P15/P26-P53 target set independently of generator policy and compares it to the complete create/update write set computed after current/stale/missing status comparison, before the real sync. Existing current skill/command projections are not writes. Fixture cases add an otherwise-valid read-only agent, skill and command one at a time; each must widen that proposed write set, fail before the first write and name the unexpected target. R4 pins the approved native/config routes, proves helper loading has no side effect and confirms docs disclose that defaults do not prevent an explicit bad runtime override.

### T7: Closure

Run verification below against the real target. Review the final diff and all touched Critical-Path checklists, with separate security and Cutdown reviewer contexts at the tier required by the current AGENTS.md. If a fixed custom role cannot supply that tier, use an eligible independent context with its complete canonical checklist; otherwise report missing assurance and stop. A read-only reviewer returns findings; parent writes the one phase card. Full CLAUDE.md entry gate once stable and once more after batched code fixes, with focused checks during development.

Upstream pending, missing tools, failed commands or missing required live evidence cannot be presented as Ready. Do not fix unrelated baseline failures in this phase; record exact failures and ask for scope if necessary.

## Files to Create / Modify

Defining set: the 53 exact rows below; tasks reference these IDs exactly. No implicit glob writes. The >25-row plan-size signal remains pending explicit user acceptance. The proposed disposition is one phase because a single generator invocation computes and may update the complete marked projection population; splitting plan documents would not shrink that write surface. The user's request authorizes complete WF-08 scope, not weaker review or an extra review round. Generated output changes outside P14/P15/P26-P53 are not authorized by this manifest.

| ID | Path | New/modified | Owner / tasks |
|---|---|---|---|
| P01 | .claude/hooks/post-edit-check.js | Modified | Claude; T1 |
| P02 | .claude/settings.json | Modified | Claude; T1 |
| P03 | .claude/agents/respin-engineer.md | Modified | Claude; T1 |
| P04 | .claude/commands/start-teams.md | Modified | Claude; T1 |
| P05 | .codex/scripts/doctor.ps1 | Modified | Codex; T0/T5/T6 |
| P06 | .codex/codex.rules.json | Modified | Codex; T2 |
| P07 | .codex/hooks/post-edit-check.js | Modified | Codex; T0/T3 |
| P08 | .codex/workspaces.json | Modified | Codex; T3 |
| P09 | .codex/scripts/run-verification.ps1 | Modified | Codex; T0/T4 |
| P10 | .codex/scripts/sync-claude-compat.ps1 | Modified | Codex; T0/T5/T6 |
| P11 | AGENTS.md | Externally modified policy input; preserve | User-owned; T6 reads/tests only |
| P12 | .codex/codex-overlay.md | Modified | Codex; T6 |
| P13 | .codex/scripts/agent-policy.ps1 | New | Codex; T0/T6 |
| P14 | .codex/agents/respin-engineer.toml | Generated update | Codex sync; T6 |
| P15 | .codex/agents/control-plane-engineer.toml | Generated update | Codex sync; T6 |
| P16 | docs/plans/workflow-hardening-master-plan.md | Progress update only | Codex; T7 |
| P17 | .codex/tests/workflow-hooks.test.cjs | New | Codex; T0/T2/T3 |
| P18 | .codex/tests/workflow-scripts.test.ps1 | New | Codex; T0/T4/T5/T6 |
| P19 | docs/progress/workflow-hardening/1-report.md | New phase report | Codex; T7 |
| P20 | .codex/hooks/lib.js | Modified | Codex; T2 |
| P21 | .codex/hooks/guardrails.js | Modified | Codex; T2 |
| P22 | .codex/config.toml | Modified | Codex; T6 |
| P23 | .codex/agents/economy-explorer.toml | Modified native route | Codex; T6 |
| P24 | .codex/agents/verification-runner.toml | Modified native route | Codex; T6 |
| P25 | .codex/agents/lean-gate-reviewer.toml | Modified native route | Codex; T6 |
| P26 | .codex/agents/accessibility-critic.toml | Generated update | Codex sync; T6 |
| P27 | .codex/agents/architecture-critic.toml | Generated update | Codex sync; T6 |
| P28 | .codex/agents/boundary-reviewer.toml | Generated update | Codex sync; T6 |
| P29 | .codex/agents/budget-exploration-reviewer.toml | Generated update | Codex sync; T6 |
| P30 | .codex/agents/code-reviewer.toml | Generated update | Codex sync; T6 |
| P31 | .codex/agents/correctness-critic.toml | Generated update | Codex sync; T6 |
| P32 | .codex/agents/cutdown-boundary-reviewer.toml | Generated update | Codex sync; T6 |
| P33 | .codex/agents/cutdown-measurement-reviewer.toml | Generated update | Codex sync; T6 |
| P34 | .codex/agents/eval-harness-engineer.toml | Generated update | Codex sync; T6 |
| P35 | .codex/agents/frontend-engineer.toml | Generated update | Codex sync; T6 |
| P36 | .codex/agents/intelligence-plane-engineer.toml | Generated update | Codex sync; T6 |
| P37 | .codex/agents/invariant-drift-critic.toml | Generated update | Codex sync; T6 |
| P38 | .codex/agents/measurement-reviewer.toml | Generated update | Codex sync; T6 |
| P39 | .codex/agents/operability-critic.toml | Generated update | Codex sync; T6 |
| P40 | .codex/agents/outbound-truth-critic.toml | Generated update | Codex sync; T6 |
| P41 | .codex/agents/plan-reviewer.toml | Generated update | Codex sync; T6 |
| P42 | .codex/agents/production-reviewer.toml | Generated update | Codex sync; T6 |
| P43 | .codex/agents/respin-billing-reviewer.toml | Generated update | Codex sync; T6 |
| P44 | .codex/agents/respin-compliance-reviewer.toml | Generated update | Codex sync; T6 |
| P45 | .codex/agents/respin-learning-reviewer.toml | Generated update | Codex sync; T6 |
| P46 | .codex/agents/respin-money-critic.toml | Generated update | Codex sync; T6 |
| P47 | .codex/agents/respin-tenancy-critic.toml | Generated update | Codex sync; T6 |
| P48 | .codex/agents/respin-tenancy-reviewer.toml | Generated update | Codex sync; T6 |
| P49 | .codex/agents/security-critic.toml | Generated update | Codex sync; T6 |
| P50 | .codex/agents/security-reviewer.toml | Generated update | Codex sync; T6 |
| P51 | .codex/agents/simplification-reviewer.toml | Generated update | Codex sync; T6 |
| P52 | .codex/agents/supply-chain-critic.toml | Generated update | Codex sync; T6 |
| P53 | .codex/agents/veto-integrity-reviewer.toml | Generated update | Codex sync; T6 |

## Edge Cases & Failure Paths

| Derivation question | Required branch | Task/test |
|---|---|---|
| Inverse events | Add/remove/rename sources and targets; moves into/out of protected paths and rejected path classes | T2 G1-G5; T5 S1-S4 |
| Double failure | A child check fails and diagnostics/cleanup also fail; report nonzero and both failures, no green | T0/T3 H5; T5 S4 |
| Double failure | Sync write fails after an earlier write; truthful partial list, safe retry, no destructive rollback | T5 S4 |
| Degraded dependency | Missing tool/config/model or insufficient budget leaves explicit missing evidence | T1 H2; T3 H5; T4 V2; T6 R4 |
| New producer | New source role/command participates in defining inventory; names cannot collide or escape roots | T5 S1/S3; T6 R1 |
| Permission boundary | Upstream owner absent; Codex stops T1 and phase stays incomplete | T1 handoff / D1 |
| Changed policy | Routing scope changes during planning; no stale default/unknown output regeneration | T6 exact manifest / R1-R4 |
| Probe limitations | Reparse fixture unsupported or live DB not authorized | T5/T7; report NOT RUN, not PASS |

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Proof |
|---|---|---|---|---|
| Claude owner -> Codex | No upstream patch | T1 pending; no protected write | Obtain named owner patch | D1 handoff plus source-diff review |
| Hook -> process | Missing executable/config | Preserve edit; explicit not verified under current Claude semantics; Codex required-check failure nonzero | Correct tool/config and rerun | H2/H5 |
| Hook -> process | Timeout/failure | No blanket success; pending commands named | Run manual check, then retry | H2/H5 |
| Sync -> filesystem | Invalid input/orphan/unreadable source | Nonzero before writes for prevalidation failures | Owner reconciles source/target without automatic deletion | S1-S4 |
| Sync -> filesystem | Write/cleanup error | Nonzero, exact changed paths, both errors if needed | Safe idempotent retry | S4 |
| Sync/doctor -> filesystem | Forbidden, unlisted or reparse input | No content read; required input refuses before writes, other entries uninspected | Owner fixes layout/source without exposing credentials | S3/S5 |
| Dispatch config -> runtime | Requested model unavailable | Stop/report; no lower-model fallback | User/runtime supplies supported authorized model | R4 |
| Entry runner -> tools/live DB | Missing tool/authorization | Offline failure or live evidence NOT RUN | Authorized environment supplied separately | V2 and final report |

## Verification Steps

Commands are PowerShell-compatible. Run from the actual repository root. Preconditions are gates, never instructions to expose credentials.

| Step | Exact command / action | Required state and producing step |
|---|---|---|
| 1 | git status --short; git diff --name-only; node --version; powershell -NoProfile -Command '$PSVersionTable.PSVersion'; pnpm --version; npm --version; dotnet --version; uv --version | Existing checkout. Run each command separately; record missing tools, do not auto-install or read secret files. Confirm authorized local development environment, not production. |
| 2 | node --test .codex/tests/workflow-hooks.test.cjs | T0 supplies P17; Step 1 Node and .NET SDK available. H1/H2 are expected red until owner supplies T1; H6 requires an installed SDK/reference pack and a healthy isolated compile control, with no package download. |
| 3 | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/tests/workflow-scripts.test.ps1 | T0 supplies P18; Step 1 PowerShell available. Fixtures only; no real tool substitution. |
| 4 | node .codex/hooks/guardrails.js --self-test; node .codex/hooks/post-edit-check.js --self-test | T1-T6 complete, Steps 2-3 green. Run commands separately and observe each exit. |
| 5 | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/scripts/sync-claude-compat.ps1 | T1 supplied, T5/T6 tested by Steps 2-3. Review generated diff against manifest; upstream unchanged by Codex. |
| 6 | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/scripts/sync-claude-compat.ps1 -Check | Step 5 has generated real target; require no missing/stale/orphan generated status. |
| 7 | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/scripts/doctor.ps1 -Deep | Step 6 clean; T5 safe-read filtering implemented; installed Codex available. Missing CLI is missing evidence, never a pass. |
| 8 | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .codex/scripts/run-verification.ps1 -Profile all -LogDirectory docs/progress/workflow-hardening/entry | Steps 1-7, stable code, existing installed project dependencies, authorized local environment. Runs the 14 offline entry commands. No DB credentials set/read by orchestration. |
| 9 | In the child-only no-install environment specified below, run uv run --offline --no-sync --frozen --project cutdown --group dev python -c "import pydantic, datamodel_code_generator"; uv run --offline --no-sync --frozen --project cutdown --group dev datamodel-codegen --help; pnpm -C cutdown build | Step 1 tools plus an already-prepared Cutdown dev-group environment. Each command is separate and must pass; absent Python/generator/validator deps mean Step 10 NOT RUN. Build produces its CLI/tests. |
| 10 | pnpm -C cutdown cutdown build:contracts --check; pnpm -C cutdown cutdown validate:contracts; pnpm -C cutdown cutdown skills sync --check; pnpm -C cutdown --filter @cutdown/skill-runtime test | Step 9 proves CLI/tests and exact Python generator+validator dependencies. Run separately in the same child-only offline/no-sync/frozen environment. A missing dependency is NOT RUN, never silently installed. No committed generated product files are rewritten. |
| 11 | Live migration + live concurrency commands from CLAUDE.md Commands | Only after user explicitly authorizes a disposable/local DB and supplies configured environment without exposing values. Start required local Docker service only with that authority; run pnpm -C respin db:migrate and pnpm -C respin test in that environment. Otherwise record NOT RUN and do not claim full Definition of Done. |
| 12 | git diff --check; git status --short; git diff --name-only | Steps 2-11 observed. Review diff, source/target hashes and scope; do not revert unrelated changes. |
| 13 | Required security and Cutdown code-review gates; record P19 and update P16 | Stable diff plus all evidence from Steps 1-12; each checklist has its own verdict, no invented PASS. |

For Steps 9-10, launch each process with a child-only environment containing UV_OFFLINE=1, UV_NO_SYNC=1, UV_FROZEN=1, UV_PYTHON_DOWNLOADS=never and CI=1; use System.Diagnostics.ProcessStartInfo.EnvironmentVariables on Windows PowerShell so the parent environment is never changed. Use the already-resolved pnpm launcher (a .cmd/.bat launcher needs the normal cmd.exe /d /s /c command wrapper), wait for completion and propagate its exit. Do not enumerate or print inherited environment values. Verify the named flags/env variables against installed uv help; all four uv controls were confirmed during planning. This environment must be inherited by the nested uv processes that the two Cutdown contract commands spawn. If the controls cannot be established, record NOT RUN. Do not substitute a cached/generated-only check for actual dual-validator evidence.

H1 additionally derives every real Claude map timeout, proves each <=300000 and at least 30000 below the 330000 outer timeout, and uses child-process interception to prove dispatch without running full suites repeatedly.
H2 covers missing/invalid/zero/negative/fractional/excessive budgets, launch failure, started timeout, actual owned child/grandchild cleanup and a successful command; assertions preserve distinct SKIPPED/FAILED semantics.
D1 statically checks current stack guidance, active-phase loading, unchanged start-teams frontmatter and its existing canonical-pointer wrapper, paired with owner diff review; it is document consistency evidence, not proof a model obeyed the instructions.

No installation, deployment or database side effect is implicit. If dependencies are unavailable, stop that gate with the exact prerequisite, not a substitute fake green. Baseline failures require explicit evidence; no entry-baseline.md currently exists.

## Acceptance Criteria (PASS/FAIL)

Defining set: one row per WF requirement plus common closure.

| Requirement | PASS evidence |
|---|---|
| WF-01 | H1/H2 green against owner-supplied real P01/P02 and actual map; no valid configured timeout skipped |
| WF-02 | G1-G5 green from actual configured PreToolUse entry, including moves, unsupported-path rejection before reads and negative controls |
| WF-03 | D1 plus owner source diff; obsolete active-stack prescriptions absent, current stack present |
| WF-04 | V1-V4, 14-step real all-profile transcript including preflight/worker config; both added commands independently fail aggregate profile when planted |
| WF-05 | H3-H7 prove schema/C4 Host coverage, actual configured bootstrap, dedup, clamping, owned-tree cleanup and pending-check reporting; real product commands green in Step 8 |
| WF-06 | S1-S5 and real Steps 5-7; no custom/upstream mutation, planted orphan red, real generated inventory current |
| WF-07 | D1 and P04 owner diff preserve dependency gate and full-plan review while restricting implementation preload |
| WF-08 | Exact output manifest, R1-R4 and doctor -Deep; classified-writer/source/target parity and current AGENTS policy, no downgrade or unlisted generated/native/config change |
| Closure | All applicable code reviewers PASS, no unresolved findings, full applicable entry evidence or explicit not-Ready state, clean scoped diff, P19 report and P16 ledger |

## Migration Steps

No entity/data migration. Adapter migration is T6's real sync (Step 5), confined to validated Codex targets. Never run product migrations as part of adapter generation.

## Least confident

The 30-file generated projection migration is a coherent single-inventory operation but can partially write before a later filesystem failure; tests must prove truthful partial reporting and idempotent retry. A newly valid source can widen the proposed diff, so the exact-manifest assertion must fail before writes. Model defaults also cannot enforce explicit runtime overrides.

## Out of Scope (Surgical Changes)

No CLAUDE.md edits; no Codex writes under .claude/**; no product implementation, lockfile or schema changes; no dispatcher service, persistent check cache, universal parked-product hooks, generated-orphan deletion, custom-skill conversion or unrelated documentation cleanup.

## Completion Criteria (Definition of Done)

Verbatim from CLAUDE.md:

A change is done when (the full gate machinery lives in the `using-the-pack` skill):
- **Entry gate clean first:** every command in the Commands block passes — schemas parse, `dotnet build` + `dotnet test`, `pytest`, `ruff`, frontend typecheck + tests — or, when a baseline is recorded at `docs/progress/entry-baseline.md`, no **new** failures vs it (it only ratchets down, and retires at green).
- Every applicable Critical-Path gate reports PASS — the table above decides which run — and the report card reads **Ready**.
- Cross-referenced docs stay consistent: an edit that touches an invariant updates its ADR, `integration-contract.md`, and the schema JSONs together, in the same change.
- Acceptance criteria met; docs updated if behaviour or config changed (`/sync-docs` does this).
- **Reachability:** a user path reaches this change — or the plan names the slice that makes it live. A capability nothing can reach is not done, it is inventory.

The current request authorizes implementation after Plan Ready. Implementation Ready additionally requires T1 owner completion, every test and applicable code gate, and honest disposition of live-environment evidence.
