---
name: authoring-guardrail-rules
description: Use when adding or editing rules in .claude/guardrails.rules.json, when the guardrail hook is firing incorrectly (false positive/negative), or when /bootstrap-claude-pack is generating project-specific write-time guards. Explains the rule schema consumed by .claude/hooks/guardrails.js and how to write block vs warn rules that catch real violations without noise.
---

# Authoring Guardrail Rules

`.claude/hooks/guardrails.js` is a generic, config-driven PreToolUse engine. It contains no rules of its own — it evaluates the rules in `.claude/guardrails.rules.json` against every Edit/Write/MultiEdit before the write lands.

## Rule schema

```jsonc
{
  "id": "kebab-case-id",            // required — shown in the hook message, for diagnostics
  "severity": "block" | "warn",     // required — block exits 2 (Claude must change course); warn exits 0 + message
  "tools": ["Edit","Write","MultiEdit"], // optional — defaults to all three
  "filePattern": "regex",           // optional — path (forward-slash normalized) must match for the rule to fire
  "notFilePattern": "regex",        // optional — a path matching this is exempt (use for .env.example, tests, fixtures)
  "bodyPattern": "regex",           // optional — the written content must match
  "absentPattern": "regex",         // optional — rule fires ONLY when this is NOT in the body
  "flags": "i",                     // optional — regex flags applied to file/body patterns
  "message": "guidance shown to Claude" // required — say what's wrong AND what to do instead
}
```

A rule fires when **all present conditions** hold: tool matches AND `filePattern` matches AND `notFilePattern` does not match AND `bodyPattern` matches AND (`absentPattern` is absent from the body). A rule with no `bodyPattern`/`absentPattern` is a **pure path rule** — fires on any write to a matching path (e.g. "never edit this generated directory").

## Patterns by intent

- **Forbid a literal** (secret, regulated data) → `severity: block`, `bodyPattern` for the literal shape, `notFilePattern` to exempt `.env.example`/samples. Example: a Stripe `sk_live_…` key.
- **Forbid a place** (don't edit vendored core) → pure path rule, `severity: warn` or `block`, `filePattern` for the directory.
- **Require something is present** (a mutation must carry an idempotency key) → `severity: warn`, `filePattern` scoping to the mutation files, `bodyPattern` matching the mutation call, `absentPattern` matching the required token. Fires only when the call is made without the token.
- **Forbid a client-trust pattern** (tenant id from request body on a privileged route) → `severity: block`, `filePattern` for the route dir, `bodyPattern` for `req.body.tenant_id`.
- **Heuristic smell** (float math near money, provider type leaking past an adapter) → `severity: warn` — accept false positives because the cost of missing it is high and a warning doesn't block.

## Choosing block vs warn

- **block** only when the violation is unambiguous and expensive to land: secret leakage, regulated-data storage, a clear isolation/PCI breach. A false-positive block wedges the agent — reserve it for patterns that are almost never legitimate.
- **warn** for everything heuristic. The agent sees the message and proceeds; a reviewer agent catches what the warning missed. Most project rules should start as `warn` and graduate to `block` only after they prove low-noise.

## Testing a rule

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"src/x.ts","content":"const k = \"sk_live_abc...\""}}' \
  | node .claude/hooks/guardrails.js ; echo "exit=$?"
```
Exit 2 = blocked, exit 0 = allowed (warnings print to stderr). Always confirm the JSON parses after editing:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/guardrails.rules.json','utf8')); console.log('ok')"
```

## Absolute paths — anchor with `(^|/)`, never bare `^`

Claude Code passes an **absolute** `file_path` to the hook (e.g. `C:/projects/app/src/x.ts` or `/home/me/app/src/x.ts`), back-slashes normalized to `/`. A `filePattern` of `^src/` therefore **never matches** — there is always a prefix before `src/`. Use `(^|/)src/` instead. Likewise, unanchored `notFilePattern` substrings over-exempt: `test` matches `.../latest-app/...` and `.../greatest/...`. Anchor exemptions to a path segment (`(^|/)tests?/`) or basename (`(^|/)[^/]*\.test\.`). Trailing `$` (e.g. `\.lock$`) is fine.

## Discipline

- Keep `filePattern`/`bodyPattern` specific — a broad `bodyPattern` produces noise that trains the agent to ignore the hook.
- One rule = one violation class. Don't OR unrelated concerns into one regex.
- The engine **fails open** on a malformed config or invalid regex — so a broken rule file silently disables enforcement. Validate after every edit.
- Never disable the engine to get past a rule; fix the rule.
