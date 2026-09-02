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

function loadRules(configPath, requireUsableRules = false) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config || typeof config !== "object" || !Array.isArray(config.rules)) {
    throw new Error("policy must contain a rules array");
  }

  if (!requireUsableRules) return config.rules;
  if (!config.rules.length) throw new Error("policy must contain at least one rule");

  for (const rule of config.rules) {
    if (!rule || typeof rule !== "object") throw new Error("policy contains an invalid rule");
    if (typeof rule.id !== "string" || !rule.id) throw new Error("policy rule is missing an id");
    if (rule.severity !== "block" && rule.severity !== "warn") {
      throw new Error(`policy rule ${rule.id} has an invalid severity`);
    }
    if (typeof rule.message !== "string" || !rule.message) {
      throw new Error(`policy rule ${rule.id} is missing a message`);
    }
    if (rule.flags !== undefined && typeof rule.flags !== "string") {
      throw new Error(`policy rule ${rule.id} has invalid regex flags`);
    }

    for (const field of ["filePattern", "notFilePattern", "bodyPattern", "absentPattern"]) {
      if (rule[field] === undefined) continue;
      if (typeof rule[field] !== "string") {
        throw new Error(`policy rule ${rule.id} has an invalid ${field}`);
      }
      compileRegex(rule[field], rule.flags || "");
    }
  }

  return config.rules;
}

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

function formatFinding(item) {
  return `[${item.id}] ${item.path}: ${item.message}`;
}

function deny(reason) {
  const permissionDecisionReason = Array.isArray(reason)
    ? reason.map(formatFinding).join("\n")
    : reason;
  emitJson({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason,
    },
  });
}

function selfTest() {
  const root = findProjectRoot();
  const changes = parseApplyPatch(
    "*** Begin Patch\n*** Add File: respin/demo.ts\n+const token = 'sk-ant-0000000000000000';\n*** Add File: .claude/settings.json\n+{}\n*** End Patch",
    root,
  );
  assert.strictEqual(changes.length, 2);
  assert.strictEqual(changes[0].path, "respin/demo.ts");
  assert.match(changes[0].body, /sk-ant/);
  assert.strictEqual(changes[1].path, ".claude/settings.json");

  const codexFindings = evaluate(
    loadRules(path.join(root, ".codex", "codex.rules.json"), true),
    changes,
    root,
  );
  assert.deepStrictEqual(
    codexFindings.filter((item) => item.severity === "block").map((item) => item.id),
    ["claude-ownership"],
  );

  const sharedFindings = evaluate(
    loadRules(path.join(root, ".claude", "guardrails.rules.json")),
    changes,
    root,
  );
  assert.deepStrictEqual(
    sharedFindings.filter((item) => item.severity === "block").map((item) => item.id),
    ["secret-anthropic-api-key"],
  );
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

  let codexFindings;
  try {
    const codexRules = loadRules(path.join(projectRoot, ".codex", "codex.rules.json"), true);
    codexFindings = evaluate(codexRules, changes, projectRoot);
  } catch (error) {
    deny(`Codex guardrails failed closed because the Codex policy could not be enforced: ${error.message}`);
    return;
  }

  const codexBlocks = codexFindings.filter((item) => item.severity === "block");
  if (codexBlocks.length) {
    deny(codexBlocks);
    return;
  }

  let sharedRules;
  try {
    sharedRules = loadRules(path.join(projectRoot, ".claude", "guardrails.rules.json"));
  } catch (error) {
    emitJson({ systemMessage: `Codex guardrails failed open because the shared rule file could not be loaded: ${error.message}` });
    return;
  }

  let sharedFindings;
  try {
    sharedFindings = evaluate(sharedRules, changes, projectRoot);
  } catch (error) {
    emitJson({ systemMessage: `Codex guardrails failed open because a shared regex is invalid: ${error.message}` });
    return;
  }

  const sharedBlocks = sharedFindings.filter((item) => item.severity === "block");
  if (sharedBlocks.length) {
    deny(sharedBlocks);
    return;
  }

  const contexts = [];
  const codexWarnings = codexFindings.filter((item) => item.severity !== "block");
  if (codexWarnings.length) {
    contexts.push(`Codex project guardrails:\n${codexWarnings.map(formatFinding).join("\n")}`);
  }
  const sharedWarnings = sharedFindings.filter((item) => item.severity !== "block");
  if (sharedWarnings.length) {
    contexts.push(`Shared project guardrails:\n${sharedWarnings.map(formatFinding).join("\n")}`);
  }
  if (contexts.length) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: contexts.join("\n\n"),
      },
    });
  }
}

main();
