const path = require("node:path");
const readline = require("node:readline");

let templates;
try {
  templates = require("@bps/templates");
} catch (error) {
  templates = require("../../templates/src");
}

const {
  buildClaudeCommandTemplate,
  buildCodexSkillTemplate,
  TEMPLATE_VERSION,
} = templates;

const DEFAULT_ACTIONS = ["review", "spec", "release-check", "best-practice"];
const DEFAULT_TARGETS = ["claude", "codex"];
const VALID_TARGETS = ["claude", "codex"];

const {
  MANIFEST_DIR,
  MANIFEST_PATH,
  nowTimestamp,
  readManifest,
  writeManifest,
  appendManifestReportHistory,
  writeOperationReport,
  readOperationReport,
  listReports,
  getReport,
  pruneReports,
} = require("./report-store");

const { createInstallerInteractiveHelpers } = require("./interactive");
const { createInstallerPresenter } = require("./presenter");
const { createInstallerOperations } = require("./operations");

const BACKUP_ROOT = path.join(MANIFEST_DIR, "backups");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const ICON = {
  logo: "🧩",
  install: "📦",
  update: "⬆️",
  uninstall: "🧹",
  rollback: "↩️",
  dryRun: "🧪",
  target: "🎯",
  action: "⚙️",
  plan: "🗂️",
  conflict: "⚠️",
  ok: "✅",
  skip: "⏭️",
  backup: "🛟",
  summary: "📊",
  file: "📄",
  note: "💡",
  remove: "🗑️",
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

function dim(text) {
  return colorize(text, ANSI.dim);
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

function muted(text) {
  return colorize(text, ANSI.gray);
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTargets(rawTargets) {
  const targets = rawTargets.filter((item) => VALID_TARGETS.includes(item));
  return targets.length > 0 ? targets : DEFAULT_TARGETS;
}

function normalizeActions(rawActions) {
  const set = new Set(rawActions.filter(Boolean));
  return Array.from(set);
}

function formatTargetTag(target) {
  if (target === "claude") {
    return colorize("CLAUDE", ANSI.magenta);
  }
  if (target === "codex") {
    return colorize("CODEX", ANSI.blue);
  }
  return target.toUpperCase();
}

const {
  resolveOptions,
  confirmAfterPreview,
  resolveConflicts,
  resolveUninstallOptions,
} = createInstallerInteractiveHelpers({
  readline,
  ICON,
  bold,
  accent,
  warning,
  parseCsv,
  normalizeTargets,
  normalizeActions,
  DEFAULT_ACTIONS,
  DEFAULT_TARGETS,
});

const {
  printBanner,
  printOptionSummary,
  printPlan,
  printUpdatePreviewPanel,
  printApplySummary,
  printUninstallSummary,
  printRollbackSummary,
} = createInstallerPresenter({
  ICON,
  TEMPLATE_VERSION,
  bold,
  accent,
  success,
  warning,
  muted,
  formatTargetTag,
});

const {
  listInstalled,
  installWithOptions,
  updateWithOptions,
  rollbackWithOptions,
  uninstallAll,
} = createInstallerOperations({
  ICON,
  dim,
  bold,
  buildClaudeCommandTemplate,
  buildCodexSkillTemplate,
  TEMPLATE_VERSION,
  BACKUP_ROOT,
  DEFAULT_ACTIONS,
  parseCsv,
  normalizeTargets,
  normalizeActions,
  formatTargetTag,
  nowTimestamp,
  readManifest,
  writeManifest,
  appendManifestReportHistory,
  writeOperationReport,
  readOperationReport,
  listReports,
  resolveOptions,
  confirmAfterPreview,
  resolveConflicts,
  resolveUninstallOptions,
  printBanner,
  printOptionSummary,
  printPlan,
  printUpdatePreviewPanel,
  printApplySummary,
  printUninstallSummary,
  printRollbackSummary,
});

module.exports = {
  DEFAULT_ACTIONS,
  DEFAULT_TARGETS,
  MANIFEST_PATH,
  readManifest,
  listInstalled,
  installWithOptions,
  updateWithOptions,
  rollbackWithOptions,
  listReports,
  getReport,
  pruneReports,
  uninstallAll,
};
