---
description: On-demand health check for the pack's safety layer — confirms Node is present, the guardrail / post-edit / session-start hooks are wired and live, and the write-time guardrail actually fires. Re-runnable any time; the counterpart to the install-time Node check for when things change later. Reports a plain-language Ready / Almost / Not yet card. Do NOT use to set a project up — that's /bootstrap-claude-pack (or /go).
allowed-tools: Read, Bash, Grep, Glob
---

You are the pack's **health check**. The pack's protection — write-time guardrails, post-edit checks, and the session-start orientation — is a layer of Node hooks that **fails open**: if any of it is missing or dark, nothing errors, it just silently does nothing. That silence is the whole risk. `/doctor` breaks it: it runs the checks a person can't see and reports, in plain words, whether the safety net is actually up.

It is **read-only** — it inspects and probes, it never edits, wires, or installs. When it finds something off, it names the fix and points at the command that performs it.

Run it any time you want reassurance ("am I actually protected?"), after installing or reinstalling Node, or when session-start printed nothing at the top of a session.

## Why this can't be a hook

Most of the checks below depend on Node. The installer runs the Node check **once**, at install time — but Node can be uninstalled, upgraded, or fall off `PATH` later, and when it does, `session-start.js` (the pack's only in-session voice) goes dark too, so nothing warns you. `/doctor` is driven by Claude over Bash, not by Node, so it still runs and still reports **even when Node is gone** — which is exactly the case that most needs a voice.

## Procedure

Run these checks (parallel where independent), then render the report card. For each, capture concrete evidence — an exit code, a file's presence, a parsed value — never a guess.

1. **Node present?** Run `node --version`. Absent or erroring → this is the headline **Not yet**: the entire hook layer is dark and no other check can pass. Say so first and plainly.

2. **Hooks wired and live?** Read `.claude/settings.json`. Confirm all three hooks are present: `PreToolUse → guardrails.js`, `PostToolUse → post-edit-check.js`, `SessionStart → session-start.js`. Then check for a `.claude/settings.pack.json` — if it exists, the installer left the live `settings.json` untouched and the pack's hooks are **dormant, not merged** (an *Almost*, with the fix being "run /go or /bootstrap-claude-pack to merge them").

3. **Does the guardrail actually fire?** The load-bearing check — a wired hook that doesn't block is no protection. Pipe a crafted PreToolUse payload for a blocked baseline rule into the engine and confirm it exits **2** (a block) and loads its rules. Use the form for the active shell:

   **Bash**
   ```bash
   echo '{"tool_name":"Write","tool_input":{"file_path":"doctor-probe.txt","content":"-----BEGIN PRIVATE KEY-----"}}' | node .claude/hooks/guardrails.js; echo "exit=$?"
   ```

   **PowerShell**
   ```powershell
   '{"tool_name":"Write","tool_input":{"file_path":"doctor-probe.txt","content":"-----BEGIN PRIVATE KEY-----"}}' | node .claude/hooks/guardrails.js
   "exit=$LASTEXITCODE"
   ```

   Expect `guardrail BLOCK [secret-private-key-literal]` on stderr and `exit=2`. **Exit 2 is the PASS here** — it means the write-time block works. `exit=0` means the guardrail did **not** fire (rules didn't load, or the baseline rule is gone) — a **Not yet**. If stderr instead says `ENFORCEMENT DISABLED`, the rule file doesn't parse and *all* write-time protection is off — a **Not yet**, fix `guardrails.rules.json` first. (No `doctor-probe.txt` is ever written — the payload is judged, not executed.)

4. **Config parses?** Confirm `.claude/guardrails.rules.json` and `.claude/workspaces.json` each parse as JSON. In Bash, run `node -e "JSON.parse(require('fs').readFileSync('.claude/guardrails.rules.json','utf8'))" && echo ok`; in PowerShell, run the same `node -e` command, then `if ($LASTEXITCODE -eq 0) { "ok" }`. Repeat for `workspaces.json`. A parse failure is a **Not yet** — the engine fails open around a broken file.

5. **Post-edit checks configured?** Read `.claude/workspaces.json`. If it has no check entries, the post-edit hook runs but checks nothing — typecheck/lint never fire on your edits. An **Almost**: fix is `/bootstrap-claude-pack` (Phase 5) to fill it from the repo's real commands.

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

   This proves only that Node **executes the script without crashing** — session-start is read-only and exits 0 on both success and fail-open, so it's a liveness check, not proof the orientation text was useful.

7. **Cross-model check available? (optional, non-blocking.)** Probe whether the Codex CLI is installed and authenticated (see `.claude/codex-review.md`). Absent → the cross-model second opinion in the build gates and `/audit` skips silently. Report as a note, never a blocker.

8. **Delegation posture (informational, read-only — never a grade input.)** Grep the frontmatter of `.claude/agents/*.md` for `model:` and `effort:` lines. Report exactly what the grep shows, in plain words: *"these agents run a pinned model: `<name>` → `<model>`; everything else inherits your session model"* — or, with no hits, *"no pinned models — every agent inherits your session model"*. Classify nothing; do not guess which agents are builders or gates. Add one line naming the two automatic behaviors that need no configuration: read-only sweeps may run a tier cheaper, and a failed review round escalates the builder to the strongest model (canon: the `using-the-pack` skill's token-economy dials). This check writes nothing and affects no verdict.

9. **Installation provenance (informational, read-only — never a grade input.)** If `.claude/pack-installation.json` exists, read it and report the recorded `sourceRelease` and `at` timestamp as the last observed install/sync, plus the per-file action counts if useful. **A desired `VERSION` is never proof that all files are current** — this reports only what the last install or sync actually recorded, nothing about files changed since. Absent → report no receipt recorded, which is normal for an install that predates this capability or one that hasn't run `/sync-pack` since; not a failure. Malformed → report it unreadable and suggest `/sync-pack` to refresh it; never invent its contents.

## The report card

Lead with the one-line verdict, in the pack's shared vocabulary, then one plain line per check with its evidence. Label each row **configured**, **engine-probed**, **failed**, or **unverified**, according to what actually ran. Always include **Runtime dispatch: unknown** — these read-only checks produce no host-dispatch receipt; existing host evidence may be linked separately with its own event, configuration, and time scope, but never broadened to all hooks or future execution.

- **Ready** — Node present, all three hooks wired and live, and the guardrail smoke test blocks (exit 2). The safety net is up. A missing **Codex** cross-model check does **not** lower this to Almost — Codex is optional; note its absence as a one-line footnote on an otherwise-Ready card, never a downgrade. The **delegation posture** (check 8) is the same kind of row: one informational footnote line, never an input to the verdict.
- **Almost** — the net is up but something is dormant or unconfigured: `settings.pack.json` un-merged, or `workspaces.json` empty. Name each and its one-command fix.
- **Not yet** — Node missing, a hook unwired, the guardrail not firing, or a config that won't parse. The protection is not real right now. Lead with the single most important fix.

Then give the concrete next step, in plain words — not a menu:

- **Node missing** → "Install Node.js (any recent version) so the hooks can run, then run `/doctor` again."
- **Hooks dormant** (`settings.pack.json` present) → "Run `/go` or `/bootstrap-claude-pack` — it'll merge the pack's hooks into your `settings.json`."
- **Guardrail not firing** (smoke test exits 0 instead of 2) → "The baseline guardrail rules didn't load — run `/bootstrap-claude-pack` (or reinstall the pack) to restore `.claude/guardrails.rules.json`, then run `/doctor` again."
- **Workspaces empty** → "Run `/bootstrap-claude-pack` to wire the post-edit checks to this repo's typecheck/lint commands."
- **Config won't parse** → name the file and the fix; validate with the `node -e "JSON.parse(...)"` line above.

Keep it short. A person runs `/doctor` to hear "you're protected" or "here's the one thing to fix" — give them exactly that.
