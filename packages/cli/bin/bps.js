#!/usr/bin/env node

const os = require("node:os");
const path = require("node:path");

let runAction;
let listActions;
let installAll;

try {
  ({ runAction, listActions } = require("@bps/core"));
} catch (error) {
  ({ runAction, listActions } = require("../../core/src"));
}

try {
  ({ installAll } = require("@bps/installer"));
} catch (error) {
  ({ installAll } = require("../../installer/src"));
}
const { parseArgs } = require("../src/index");

function printHelp() {
  const lines = [
    "bps - cross-agent toolkit",
    "",
    "Commands:",
    "  bps doctor",
    "  bps install",
    "  bps run <action> [--input '<json>']",
    "  bps list-actions",
  ];
  console.log(lines.join("\n"));
}

function runDoctor() {
  console.log("BPS doctor report");
  console.log(`- Node: ${process.version}`);
  console.log(`- Platform: ${process.platform}`);
  console.log(`- Home: ${os.homedir()}`);
  console.log(`- Claude commands path: ${path.join(os.homedir(), ".claude", "commands")}`);
  console.log(`- Codex skills path: ${path.join(os.homedir(), ".codex", "skills")}`);
}

function runInstall() {
  const outputs = installAll();
  console.log("Install completed.");
  console.log("Claude commands:");
  for (const filePath of outputs.claude) {
    console.log(`- ${filePath}`);
  }
  console.log("Codex skills:");
  for (const filePath of outputs.codex) {
    console.log(`- ${filePath}`);
  }
}

function main() {
  const { command, rest, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "doctor") {
    runDoctor();
    return;
  }

  if (command === "install") {
    runInstall();
    return;
  }

  if (command === "list-actions") {
    console.log(listActions().join("\n"));
    return;
  }

  if (command === "run") {
    const action = rest[0];
    if (!action || action.startsWith("--")) {
      throw new Error("Missing action name. Usage: bps run <action> --input '{...}'");
    }
    const result = runAction(action, options.input);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
