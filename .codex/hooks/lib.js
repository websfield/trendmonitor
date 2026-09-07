"use strict";

const fs = require("fs");
const path = require("path");

function readStdinJson() {
  const raw = fs.readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function findProjectRoot(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(__dirname, "..", "..");
}

function normalizeRepoPath(projectRoot, candidate) {
  if (!candidate) return "";
  const cleaned = String(candidate).trim().replace(/^['"]|['"]$/g, "");
  const absolute = path.isAbsolute(cleaned)
    ? path.normalize(cleaned)
    : path.resolve(projectRoot, cleaned);
  return path.relative(projectRoot, absolute).split(path.sep).join("/");
}

function parseApplyPatch(command, projectRoot) {
  if (typeof command !== "string" || !command.includes("*** Begin Patch")) return [];

  const changes = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    current.body = current.additions.join("\n");
    delete current.additions;
    changes.push(current);
    current = null;
  };

  for (const line of command.split(/\r?\n/)) {
    const header = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (header) {
      flush();
      current = {
        operation: header[1].toLowerCase(),
        path: normalizeRepoPath(projectRoot, header[2]),
        additions: [],
      };
      continue;
    }

    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move && current) {
      const prior = { ...current, additions: [...current.additions] };
      prior.body = prior.additions.join("\n");
      delete prior.additions;
      changes.push(prior);
      current.path = normalizeRepoPath(projectRoot, move[1]);
      current.operation = "move";
      continue;
    }

    if (line === "*** End Patch") {
      flush();
      continue;
    }

    if (current && line.startsWith("+") && !line.startsWith("+++")) {
      current.additions.push(line.slice(1));
    }
  }
  flush();
  return changes;
}

function extractFileChanges(input, projectRoot) {
  const toolInput = input.tool_input || {};
  const patchChanges = parseApplyPatch(toolInput.command, projectRoot);
  if (patchChanges.length) return patchChanges;

  const filePath = toolInput.file_path || toolInput.path;
  if (!filePath) return [];

  const bodies = [];
  for (const value of [toolInput.content, toolInput.new_string, toolInput.text]) {
    if (typeof value === "string") bodies.push(value);
  }
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (typeof edit.new_string === "string") bodies.push(edit.new_string);
    }
  }

  return [{
    operation: "write",
    path: normalizeRepoPath(projectRoot, filePath),
    body: bodies.join("\n"),
  }];
}

function compileRegex(pattern, flags = "") {
  return pattern ? new RegExp(pattern, flags) : null;
}

function isSensitivePath(repoPath) {
  return /(^|\/)(secrets)(\/|$)|(^|\/)\.env(?:\.|$)|\.pem$|secret/i.test(repoPath);
}

function readExistingFile(projectRoot, repoPath) {
  if (!repoPath || isSensitivePath(repoPath)) return "";
  const target = path.resolve(projectRoot, ...repoPath.split("/"));
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  try {
    return fs.readFileSync(target, "utf8");
  } catch {
    return "";
  }
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

module.exports = {
  compileRegex,
  emitJson,
  extractFileChanges,
  findProjectRoot,
  normalizeRepoPath,
  parseApplyPatch,
  readExistingFile,
  readStdinJson,
};

