---
name: authoring-project-skills
description: Use when creating a project-specific Critical-Path skill or its matching reviewer agent — by hand or via /bootstrap-claude-pack. Explains the shape of a rule-canon skill and a read-only reviewer agent so they pair correctly (the skill documents the rule, the reviewer gates it, the guardrail catches the obvious violation at write time).
---

# Authoring Project Skills & Reviewer Agents

A Critical Path in this pack is enforced by a **triple**:
1. a **skill** (`.claude/skills/<path>/SKILL.md`) — the rule canon, invoked before writing code on that path;
2. a **reviewer agent** (`.claude/agents/<path>-reviewer.md`) — a read-only gate that verifies a diff against the rule;
3. (optionally) a **guardrail rule** in `.claude/guardrails.rules.json` — a write-time catch for the common violation.

This skill explains how to write (1) and (2) so they pair.

## The skill (rule canon)

Frontmatter:
```yaml
---
name: <kebab-case>            # must match the directory name
description: Use whenever the prompt names <triggers>. <The one hard rule, stated>. <When it's mandatory>.
---
```
The `description` is the trigger — pack the keywords that should activate it (entity names, file paths, verbs like "charge/refund/accrue", route prefixes). Body contains: the rule stated as an invariant, *why* it exists, the concrete mechanism that enforces it in this repo (the table, the helper, the constraint), the anti-patterns to avoid, and a worked example. Keep it to what an implementer needs to obey the rule — not a textbook.

## The reviewer agent (the gate)

Frontmatter:
```yaml
---
name: <path>-reviewer
description: Read-only reviewer for any diff touching <the exact files/routes/tables>. Verifies <the rule>. Reports findings with file:line evidence and a PASS / NEEDS CHANGES / BLOCK verdict; does not edit code.
tools: Read, Grep, Glob, Bash
---
```
Body contains **numbered checks** specific to this project (name the real files, tables, routes the rule governs), an **output shape** with `path:line` evidence per finding, and a **verdict** section. Model it on the pack's `code-reviewer.md` / `security-reviewer.md`. The reviewer is read-only — it reports, it never edits.

## Pairing rules

- The reviewer's checks must **enforce exactly what the skill documents** — same rule, same mechanism. If they drift, the gate stops matching the canon.
- The guardrail rule (if any) is the **cheapest** catch (a regex at write time); the reviewer is the **thorough** catch (reads the whole diff with context); the skill is the **teaching** that prevents the violation in the first place. Defense in depth — none replaces the others.
- Name the reviewer so it's selectable from `CLAUDE.md`'s Critical-Path → reviewer table. The orchestration commands pick reviewers by that table.

## Checklist before shipping a triple
- [ ] Skill `name` matches its directory; `description` triggers on the right keywords.
- [ ] Skill states the rule as an invariant + names the enforcing mechanism in this repo.
- [ ] Reviewer is read-only (`tools: Read, Grep, Glob, Bash`), checks map 1:1 to the skill's rule, output cites `path:line`, verdict is PASS/NEEDS CHANGES/BLOCK.
- [ ] `CLAUDE.md`'s Critical-Path table has a row mapping this path → this skill + this reviewer.
- [ ] If a write-time pattern exists, a guardrail rule is added (see the `authoring-guardrail-rules` skill).
