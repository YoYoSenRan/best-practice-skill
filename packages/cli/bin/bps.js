#!/usr/bin/env node

const os = require("node:os");
const path = require("node:path");

let runtimePackage;
try {
  runtimePackage = require("../../../package.json");
} catch (error) {
  runtimePackage = require("../package.json");
}

const PACKAGE_NAME = runtimePackage.name || "best-practice-skill";
const PACKAGE_VERSION = runtimePackage.version || "0.1.0";

let runAction;
let listActions;
let listSkills;
let searchSkills;
let getSkill;
let runSkill;
let loadPracticeConfig;
let initPracticeConfig;
let runPracticeSearch;
let getPracticeCacheStats;
let clearPracticeCache;
let installWithOptions;
let updateWithOptions;
let listInstalled;
let uninstallAll;
let rollbackWithOptions;
let listReports;
let getReport;
let pruneReports;

try {
  ({
    runAction,
    listActions,
    listSkills,
    searchSkills,
    getSkill,
    runSkill,
    loadPracticeConfig,
    initPracticeConfig,
    runPracticeSearch,
    getPracticeCacheStats,
    clearPracticeCache,
  } = require("@bps/core"));
} catch (error) {
  ({
    runAction,
    listActions,
    listSkills,
    searchSkills,
    getSkill,
    runSkill,
    loadPracticeConfig,
    initPracticeConfig,
    runPracticeSearch,
    getPracticeCacheStats,
    clearPracticeCache,
  } = require("../../core/src"));
}

try {
  ({
    installWithOptions,
    updateWithOptions,
    listInstalled,
    uninstallAll,
    rollbackWithOptions,
    listReports,
    getReport,
    pruneReports,
  } = require("@bps/installer"));
} catch (error) {
  ({
    installWithOptions,
    updateWithOptions,
    listInstalled,
    uninstallAll,
    rollbackWithOptions,
    listReports,
    getReport,
    pruneReports,
  } = require("../../installer/src"));
}
const { parseArgs } = require("../src/index");
const { createReportCommandRunner } = require("../src/report-command");
const { createPracticeCommandRunner } = require("../src/practice-command");
const { createSkillCommandRunner } = require("../src/skill-command");
const { createInstallCommandRunner } = require("../src/install-command");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const ICON = {
  logo: "🚀",
  doctor: "🩺",
  list: "📚",
  run: "⚡",
  skill: "🧠",
  practice: "🧭",
  config: "⚙️",
  path: "📂",
  ok: "✅",
  warn: "⚠️",
  note: "💡",
  update: "⬆️",
  uninstall: "🧹",
  rollback: "↩️",
  prompt: "📝",
  summary: "📊",
};

function supportsColor() {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

const USE_COLOR = supportsColor();

function colorize(text, colorCode) {
  if (!USE_COLOR) {
    return text;
  }
  return `${colorCode}${text}${ANSI.reset}`;
}

function bold(text) {
  return colorize(text, ANSI.bold);
}

function accent(text) {
  return colorize(text, ANSI.cyan);
}

function success(text) {
  return colorize(text, ANSI.green);
}

function warning(text) {
  return colorize(text, ANSI.yellow);
}

function danger(text) {
  return colorize(text, ANSI.red);
}

function dim(text) {
  return colorize(text, ANSI.dim);
}

function muted(text) {
  return colorize(text, ANSI.gray);
}

function printHeader(title, icon = ICON.logo) {
  console.log("");
  console.log(`${icon} ${bold(title)}`);
  console.log(accent("────────────────────────────────────────"));
}

function printHelp() {
  printHeader("BPS CLI", ICON.logo);
  const lines = [
    `${ICON.logo} bps - cross-agent toolkit ${muted(`v${PACKAGE_VERSION}`)}`,
    "",
    bold("Core Commands:"),
    `  ${ICON.doctor} bps doctor`,
    `  ${ICON.ok} bps install [--target claude,codex] [--actions review,spec,release-check,best-practice] [--yes] [--non-interactive] [--force] [--dry-run]`,
    `  ${ICON.update} bps update [--target ...] [--actions ...] [--yes] [--non-interactive] [--force] [--dry-run]`,
    `  ${ICON.uninstall} bps uninstall [--target ...] [--actions ...] [--yes] [--non-interactive] [--dry-run]`,
    `  ${ICON.rollback} bps rollback [--target claude,codex] [--actions ...] [--dry-run] [--yes] [--non-interactive] [--report /path/to/report.json]`,
    `  ${ICON.list} bps list-installed`,
    `  ${ICON.list} bps report <list|show|prune> [...options]`,
    `  ${ICON.run} bps run <action> [--input '{...}']`,
    `  ${ICON.list} bps list-actions`,
    "",
    bold("Report Commands:"),
    `  ${ICON.list} bps report list [--limit 20] [--operation ...] [--json]`,
    `  ${ICON.list} bps report show [--id <report-id>] [--report /path/report.json] [--operation update|install|rollback|uninstall] [--json]`,
    `  ${ICON.uninstall} bps report prune [--keep 20] [--operation ...] [--dry-run] [--json]`,
    "",
    bold("Skill Commands:"),
    `  ${ICON.skill} bps skill list`,
    `  ${ICON.skill} bps skill search <query>`,
    `  ${ICON.skill} bps skill inspect <name>`,
    `  ${ICON.skill} bps skill run <name> [--input '{...}']`,
    "",
    bold("Practice Commands:"),
    `  ${ICON.practice} bps practice search --input '{"topic":"..."}' [--config /path/to/config.json] [--json] [--no-cache] [--refresh-cache]`,
    `  ${ICON.config} bps practice config init [--path /path/to/config.json] [--force]`,
    `  ${ICON.config} bps practice config show [--path /path/to/config.json]`,
    `  ${ICON.list} bps practice cache stats [--config /path/to/config.json] [--json]`,
    `  ${ICON.uninstall} bps practice cache clean [--config /path/to/config.json] [--dry-run] [--older-than-hours 24]`,
  ];
  console.log(lines.join("\n"));
}

function runDoctor() {
  printHeader("Doctor Report", ICON.doctor);
  console.log(`${ICON.ok} Node: ${process.version}`);
  console.log(`${ICON.ok} Platform: ${process.platform}`);
  console.log(`${ICON.path} Home: ${os.homedir()}`);
  console.log(`${ICON.path} Claude commands: ${path.join(os.homedir(), ".claude", "commands")}`);
  console.log(`${ICON.path} Codex skills: ${path.join(os.homedir(), ".codex", "skills")}`);
  console.log(`${ICON.ok} Package: ${PACKAGE_NAME}@${PACKAGE_VERSION}`);
}

function getInstallerOptions(options) {
  return {
    target: options.target,
    actions: options.actions,
    force: Boolean(options.force),
    yes: Boolean(options.yes),
    nonInteractive: Boolean(options["non-interactive"]),
    dryRun: Boolean(options["dry-run"]),
    packageVersion: PACKAGE_VERSION,
  };
}

function getRollbackOptions(options) {
  return {
    target: options.target,
    actions: options.actions,
    yes: Boolean(options.yes),
    nonInteractive: Boolean(options["non-interactive"]),
    dryRun: Boolean(options["dry-run"]),
    reportPath: options.report,
  };
}

const { runInstall, runUpdate, runListInstalled, runUninstall, runRollback } = createInstallCommandRunner({
  ICON,
  printHeader,
  success,
  warning,
  muted,
  packageName: PACKAGE_NAME,
  packageVersion: PACKAGE_VERSION,
  installWithOptions,
  updateWithOptions,
  listInstalled,
  uninstallAll,
  rollbackWithOptions,
  getInstallerOptions,
  getRollbackOptions,
});

const { runReportCommand } = createReportCommandRunner({
  ICON,
  printHeader,
  warning,
  bold,
  dim,
  listReports,
  getReport,
  pruneReports,
});

const { runSkillCommand } = createSkillCommandRunner({
  ICON,
  printHeader,
  bold,
  dim,
  warning,
  listSkills,
  searchSkills,
  getSkill,
  runSkill,
});

const { runPracticeCommand } = createPracticeCommandRunner({
  ICON,
  printHeader,
  bold,
  dim,
  warning,
  loadPracticeConfig,
  initPracticeConfig,
  runPracticeSearch,
  getPracticeCacheStats,
  clearPracticeCache,
});

async function main() {
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
    await runInstall(options);
    return;
  }

  if (command === "update") {
    await runUpdate(options);
    return;
  }

  if (command === "list-installed") {
    runListInstalled();
    return;
  }

  if (command === "uninstall") {
    await runUninstall(options);
    return;
  }

  if (command === "rollback") {
    await runRollback(options);
    return;
  }

  if (command === "list-actions") {
    printHeader("Available Actions", ICON.list);
    for (const action of listActions()) {
      console.log(`${ICON.run} ${action}`);
    }
    return;
  }

  if (command === "report") {
    runReportCommand(rest, options);
    return;
  }

  if (command === "skill") {
    runSkillCommand(rest, options);
    return;
  }

  if (command === "practice") {
    await runPracticeCommand(rest, options);
    return;
  }

  if (command === "run") {
    const action = rest[0];
    if (!action || action.startsWith("--")) {
      throw new Error("Missing action name. Usage: bps run <action> --input '{...}'");
    }
    const result = runAction(action, options.input);
    printHeader(`Run Action: ${action}`, ICON.run);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`${ICON.warn} ${danger(`Error: ${error.message}`)}`);
  process.exit(1);
});
