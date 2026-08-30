"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  compileRegex,
  emitJson,
  extractFileChanges,
  findProjectRoot,
  parseApplyPatch,
  readExistingFile,
  readStdinJson,
} = require("./lib");

function ruleMatches(rule, change, projectRoot) {
  const flags = rule.flags || "";
  const filePattern = compileRegex(rule.filePattern, flags);
  const notFilePattern = compileRegex(rule.notFilePattern, flags);
  const bodyPattern = compileRegex(rule.bodyPattern, flags);
  const absentPattern = compileRegex(rule.absentPattern, flags);

  if (filePattern && !filePattern.test(change.path)) return false;
  if (notFilePattern && notFilePattern.test(change.path)) return false;
  if (bodyPattern && !bodyPattern.test(change.body || "")) return false;

  if (absentPattern) {
    const combined = `${readExistingFile(projectRoot, change.path)}\n${change.body || ""}`;
    if (absentPattern.test(combined)) return false;
  }
  return Boolean(filePattern || bodyPattern || absentPattern);
}

function evaluate(rules, changes, projectRoot) {
  const findings = [];
  for (const change of changes) {
    for (const rule of rules) {
      if (ruleMatches(rule, change, projectRoot)) {
        findings.push({ ...rule, path: change.path });
      }
    }
  }
  return findings;
}

function selfTest() {
  const root = findProjectRoot();
  const changes = parseApplyPatch(
    "*** Begin Patch\n*** Add File: respin/demo.ts\n+const token = 'sk-ant-api03-test';\n*** Update File: respin/other.ts\n+// safe\n*** End Patch",
    root,
  );
  assert.strictEqual(changes.length, 2);
  assert.strictEqual(changes[0].path, "respin/demo.ts");
  assert.match(changes[0].body, /sk-ant/);
  const planted = evaluate(
    [{ id: "planted", severity: "block", bodyPattern: "sk-ant-" }],
    changes,
    root,
  );
  assert.strictEqual(planted.length, 1);
  process.stdout.write("guardrails self-test passed\n");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  let input;
  try {
    input = readStdinJson();
  } catch (error) {
    emitJson({ systemMessage: `Codex guardrails could not parse hook input: ${error.message}` });
    return;
  }

  const projectRoot = findProjectRoot(input.cwd || process.cwd());
  const changes = extractFileChanges(input, projectRoot);
  if (!changes.length) return;

  let rules;
  try {
    const configPath = path.join(projectRoot, ".claude", "guardrails.rules.json");
    rules = JSON.parse(fs.readFileSync(configPath, "utf8")).rules || [];
  } catch (error) {
    emitJson({ systemMessage: `Codex guardrails failed open because the shared rule file could not be loaded: ${error.message}` });
    return;
  }

  let findings;
  try {
    findings = evaluate(rules, changes, projectRoot);
  } catch (error) {
    emitJson({ systemMessage: `Codex guardrails failed open because a shared regex is invalid: ${error.message}` });
    return;
  }

  const blocks = findings.filter((item) => item.severity === "block");
  const warnings = findings.filter((item) => item.severity !== "block");
  const format = (item) => `[${item.id}] ${item.path}: ${item.message}`;

  if (blocks.length) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: blocks.map(format).join("\n"),
      },
    });
    return;
  }

  if (warnings.length) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `Shared project guardrails:\n${warnings.map(format).join("\n")}`,
      },
    });
  }
}

main();

