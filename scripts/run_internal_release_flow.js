#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const target = process.argv[2];
const extraArgs = process.argv.slice(3);
const targets = new Set(["macos", "windows", "all"]);

if (!targets.has(target)) {
  console.error("Usage: node scripts/run_internal_release_flow.js <macos|windows|all> [extra args...]");
  process.exit(2);
}

function candidatePythonExecutables() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push(process.env.PYTHON);
  }
  if (process.platform === "win32") {
    candidates.push(path.join(root, ".venv", "Scripts", "python.exe"));
    candidates.push("python");
  } else {
    candidates.push(path.join(root, ".venv", "bin", "python"));
    candidates.push("python3");
    candidates.push("python");
  }
  return candidates;
}

function findPython() {
  for (const candidate of candidatePythonExecutables()) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
      continue;
    }
    const result = spawnSync(candidate, ["--version"], {
      cwd: root,
      encoding: "utf-8"
    });
    if (result.status === 0) {
      return candidate;
    }
  }
  console.error("Could not find a Python executable for internal release build.");
  process.exit(2);
}

const python = findPython();
const script = path.join(root, "desktop", "scripts", "run_internal_release_flow.py");
const args = [script, "--target", target, "--clean", ...extraArgs];
const result = spawnSync(python, args, {
  cwd: root,
  stdio: "inherit"
});

process.exit(result.status === null ? 1 : result.status);
