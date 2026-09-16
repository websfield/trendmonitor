---
description: On-demand, read-only health check for the pack's safety layer — inspects Node and hook configuration, directly probes the engines, and reports runtime dispatch as unknown without host evidence. Re-runnable any time; reports a plain-language Ready / Almost / Not yet card scoped to the checks actually performed. Do NOT use to set a project up — that's /bootstrap-claude-pack (or /go).
allowed-tools: Read, Bash, Grep, Glob
---

You are the pack's **health check**. The Node hooks fail open, so missing or broken protection may leave a session running without the expected checks. Some configured failures produce diagnostics; session-start stays silent on every problem. Inspect the available evidence and explain what was checked and what remains unknown. A silent startup is inconclusive, not a diagnosis.

It is **read-only** — it inspects and probes, it never edits, wires, or installs. When it finds something off, it names the fix and points at the command that performs it.

Run it any time you want reassurance ("am I actually protected?"), after installing or reinstalling Node, or when session-start printed nothing at the top of a session.

## Why this can't be a hook

Most of the checks below depend on Node. The installer runs the Node check **once**, at install time — but Node can be uninstalled, upgraded, or fall off `PATH` later, and when it does, `session-start.js` (the pack's only in-session voice) goes dark too, so nothing warns you. `/doctor` is driven by Claude through the available shell, not by Node, so it still runs and still reports **even when Node is gone** — which is exactly the case that most needs a voice.

## Procedure

Run these checks (parallel where independent), then render the report card. For each, capture concrete evidence — an exit code, a file's presence, a parsed value — never a guess.

1. **Node available for these probes?** Run `node --version`. Absent or erroring → **Not yet** for this health check: Node-dependent probes cannot run in this shell. Continue read-only configuration inspection where possible. Do not infer the host's executable environment or hook dispatch from this shell's result.

2. **Hook configuration present?** Inspect live `.claude/settings.json` and any `.claude/settings.pack.json` separately. Check all three event/command entries: `PreToolUse → guardrails.js`, `PostToolUse → post-edit-check.js`, `SessionStart → session-start.js`. Report each as configured, missing or unreadable, with its actual path and matcher. The sidecar is proposed configuration; it proves neither active nor dormant hooks and does not lower the grade by itself. Existing live entries can coexist with a refreshed sidecar. Missing entries → ask `/go` to inspect and propose only missing additive wiring, preserving existing entries. This check reads project configuration, not every possible host override; state that scope.

3. **Does the guardrail engine block the direct probe?** From the project root, pipe a crafted PreToolUse payload for a blocked baseline rule into the engine and record its result. This is an **engine-probed** result, not evidence that the host invokes it on edits. Use the form for the active shell:

   **Bash**
   ```bash
   echo '{"tool_name":"Write","tool_input":{"file_path":"doctor-probe.txt","content":"-----BEGIN PRIVATE KEY-----"}}' | node .claude/hooks/guardrails.js; echo "exit=$?"
   ```

   **PowerShell**
   ```powershell
   '{"tool_name":"Write","tool_input":{"file_path":"doctor-probe.txt","content":"-----BEGIN PRIVATE KEY-----"}}' | node .claude/hooks/guardrails.js
   "exit=$LASTEXITCODE"
   ```

   Expect `guardrail BLOCK [secret-private-key-literal]` on stderr and `exit=2`. **Exit 2 with that diagnostic is PASS for this direct engine probe only.** `exit=0`, an unexpected error, or a different result is **Not yet** for the expected baseline probe; inspect the captured diagnostic and rule file before assigning a cause. `ENFORCEMENT DISABLED` reports that this engine could not parse its configured rules; fix that file first. If the baseline rule was deliberately customized, report the probe mismatch and inspect that policy rather than overwriting it. (No `doctor-probe.txt` is ever written — the payload is judged, not executed.)

4. **Config parses?** Confirm `.claude/guardrails.rules.json` and `.claude/workspaces.json` each parse as JSON. In Bash, run `node -e "JSON.parse(require('fs').readFileSync('.claude/guardrails.rules.json','utf8'))" && echo ok`; in PowerShell, run the same `node -e` command, then `if ($LASTEXITCODE -eq 0) { "ok" }`. Repeat for `workspaces.json`. A parse failure is a **Not yet** — the engine fails open around a broken file.

5. **Post-edit checks configured?** Read `.claude/workspaces.json`. No check entries means this pack has no configured project checks; it says nothing about whether the host invokes the hook or whether another tool runs checks. An **Almost**: ask `/go` to offer bootstrap Phase 5 configuration from the repo's real commands. Configured entries are reported as configured, not as having executed successfully; this read-only check does not run arbitrary project commands.

6. **Session-start runs?** Invoke the liveness probe with stdin closed, using the form for the active shell, and confirm `exit=0`:

   **Bash**
   ```bash
   node .claude/hooks/session-start.js < /dev/null
   echo "exit=$?"
   ```

   **PowerShell**
   ```powershell
   $null | node .claude/hooks/session-start.js
   "exit=$LASTEXITCODE"
   ```

   The closed stdin is deliberate. Record the actual process exit. Zero is compatible with success or silent fail-open; it does not prove useful orientation, completion of every internal path, or host-triggered SessionStart dispatch. Missing output alone cannot identify the cause.

7. **Cross-model check available? (optional, non-blocking.)** Probe whether the Codex CLI is installed and authenticated (see `.claude/codex-review.md`). Absent → the cross-model second opinion in the build gates and `/audit` skips with a one-line note. Report it as a note, never a blocker.

8. **Delegation posture (informational, read-only — never a grade input.)** Inspect agent frontmatter for `model:` and `effort:`. Report only the configured requests; an absent field means no per-agent pin was found, not a resolved runtime value. Do not infer agent roles from names. The `using-the-pack` dials may request cheaper read-only sweeps and permit one stronger-model builder repair after a High/BLOCK survives retry batch 1, subject to their conditions and retained allowance. These are requested policy choices; actual model/effort remain unknown unless runtime evidence exposes them. This check writes nothing and affects no verdict.

9. **Progress memory available?** Confirm `.claude/lib/workflow-evidence.js` and `.claude/scripts/workflow-state.js` both exist and pass `node --check`. Both present and parsing → configured. One missing or unparseable → an **Almost**, with the next step: *"Run `/sync-pack <path-to-claude-pack-repo>` to install the matching pair; until then `/go` tracks progress on the manual checklist instead of resuming automatically."* Neither present → report it as not installed, which is not a failure — an older install simply predates it. This check runs the parser only; it never invokes the CLI, so it neither reads nor writes any project's progress record.

10. **Installation provenance (informational, read-only — never a grade input.)** If `.claude/pack-installation.json` exists, read it — this is separate from check 9 (which only confirms the engine pair is present and parses) and separate from any goal's workflow readiness. Use the form for the active shell:

    **Bash**
    ```bash
    node -e "console.log(JSON.stringify(require('./.claude/lib/workflow-evidence.js').loadInstallReceipt(process.cwd())))"
    ```

    **PowerShell**
    ```powershell
    node -e "console.log(JSON.stringify(require('./.claude/lib/workflow-evidence.js').loadInstallReceipt(process.cwd())))"
    ```

    Report the parsed `sourceRelease` and `at` timestamp as the last observed install/sync, and the per-file action counts (copied/skipped-existing/settings-sidecar/customized-merged/missing) if useful. **A desired `VERSION` is never proof that all files are current** — this reports only what the last install or sync actually recorded, nothing about files changed since. Absent (`status: "missing"`) → report no receipt recorded, which is normal for an install that predates this capability or one that hasn't run `/sync-pack` since; not a failure. Malformed (`status: "invalid"` or `"unsupported"`) → report it unreadable and suggest `/sync-pack` to refresh it; never invent its contents. `loadInstallReceipt` itself does not check who wrote a valid, well-formed receipt — if you need to know whether it's this pack's own (rather than some other tool's), compare the returned `receipt.generatorMarker` to `claude-jig` yourself before reporting it as the pack's — both the installers and `/sync-pack` write that same marker, so a legitimate receipt from either carries it.

11. **Stop-guard hook configured? (informational, read-only — never a grade input.)** Check `Stop → workflow-stop.js` in live `.claude/settings.json`. Configured or missing are both reported as fact; this hook is currently dormant by design — no goal in this release can register for it, so no real project ever has it doing anything — so its absence never affects the Ready/Almost/Not-yet grade or the next-step guidance. It simply predates or postdates this capability, exactly like check 9's progress-memory pair.

## The report card

Lead with **Local configuration and engine checks: Ready / Almost / Not yet**, then one plain line per check with its evidence. Label rows **configured**, **engine-probed**, **failed** or **unverified**, according to what actually ran. Always include **Runtime dispatch: unknown** — these read-only checks produce no host-dispatch receipt. Existing host evidence may be linked separately with its event, configuration and time scope; never broaden it to all hooks or future execution.

- **Ready** — all required local checks completed: Node available, three project hook entries configured, both configs parse, project checks configured, the direct guardrail probe returns its expected block, the session-start process exits 0, and the progress-memory pair (check 9) is either both-present-and-parsing or both absent. State that these local checks passed; do not claim the host protection is proven. Optional Codex availability and delegation settings are informational, not grade inputs.
- **Almost** — all other required local checks passed, but either project checks are unconfigured or the progress-memory pair is only half-installed (one of `workflow-evidence.js` / `workflow-state.js` present, the other missing or failing `node --check`). Name whichever gap applies and its next step. Sidecar presence alone does not determine this grade.
- **Not yet** — a required local check failed or could not be verified: for example Node unavailable, an entry missing/unreadable, an unexpected probe result or malformed config. Lead with the observed gap and single next check or fix; do not invent its underlying cause.

Then give the concrete next step, in plain words — not a menu:

- **Node missing** → "Install Node.js (any recent version) so the hooks can run, then run `/doctor` again."
- **Hook entry missing or unreadable** → "Run `/go` — it will inspect the live configuration and propose any missing hook entries."
- **Unexpected guardrail probe result** → "Ask `/go` to inspect the captured result and your rule configuration before changing it, then run `/doctor` again."
- **Workspaces empty** → "Run `/bootstrap-claude-pack` to wire the post-edit checks to this repo's typecheck/lint commands."
- **Config won't parse** → name the file and the fix; validate with the `node -e "JSON.parse(...)"` line above.

Keep it short. Tell the person which local checks passed, what remains unverified, and the single next action. When local checks pass, say they can continue with `/go` while runtime dispatch remains unverified; do not turn that limitation into a claim that protection is inactive.
