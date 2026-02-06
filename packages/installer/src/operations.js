const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { createInstallUpdateOperation } = require("./operation-install-update");
const { createRollbackOperation } = require("./operation-rollback");
const { createUninstallOperation } = require("./operation-uninstall");

function createInstallerOperations(context) {
  const {
    ICON,
    dim,
    bold,
    buildClaudeCommandTemplate,
    buildCodexSkillTemplate,
    TEMPLATE_VERSION,
    BACKUP_ROOT,
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
    parseCsv,
    normalizeTargets,
    normalizeActions,
    formatTargetTag,
  } = context;

  function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  function sha256(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  function fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  function readUtf8(filePath) {
    return fs.readFileSync(filePath, "utf-8");
  }

  function writeFileAtomic(filePath, content) {
    ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, filePath);
  }

  function unlinkFile(filePath) {
    fs.unlinkSync(filePath);
  }

  function getTargetRoots() {
    return {
      claude: path.join(os.homedir(), ".claude", "commands"),
      codex: path.join(os.homedir(), ".codex", "skills"),
    };
  }

  function buildTargetFilePlans({ actions, targets, packageVersion }) {
    const roots = getTargetRoots();
    const plans = [];

    for (const action of actions) {
      if (targets.includes("claude")) {
        const filePath = path.join(roots.claude, `bps-${action}.md`);
        const content = buildClaudeCommandTemplate(action, { packageVersion });
        plans.push({
          target: "claude",
          action,
          filePath,
          content,
          templateId: "claude-command",
          templateVersion: TEMPLATE_VERSION,
        });
      }

      if (targets.includes("codex")) {
        const filePath = path.join(roots.codex, `bps-${action}`, "SKILL.md");
        const content = buildCodexSkillTemplate(action, { packageVersion });
        plans.push({
          target: "codex",
          action,
          filePath,
          content,
          templateId: "codex-skill",
          templateVersion: TEMPLATE_VERSION,
        });
      }
    }

    return plans;
  }

  function mapManifestFilesByPath(manifest) {
    const table = new Map();
    for (const file of manifest.files || []) {
      table.set(file.path, file);
    }
    return table;
  }

  function evaluatePlanItems(plans, manifest) {
    const existing = mapManifestFilesByPath(manifest);

    return plans.map((item) => {
      const nextHash = sha256(item.content);
      const existingFile = fileExists(item.filePath);
      const manifestFile = existing.get(item.filePath);

      if (!existingFile) {
        return {
          ...item,
          decision: "create",
          reason: "missing-file",
          nextHash,
        };
      }

      const currentContent = readUtf8(item.filePath);
      const currentHash = sha256(currentContent);

      if (currentHash === nextHash) {
        return {
          ...item,
          decision: "unchanged",
          reason: "same-content",
          nextHash,
          currentHash,
        };
      }

      if (!manifestFile) {
        return {
          ...item,
          decision: "conflict",
          reason: "unmanaged-file",
          nextHash,
          currentHash,
        };
      }

      if (manifestFile.hash !== currentHash) {
        return {
          ...item,
          decision: "conflict",
          reason: "user-modified",
          nextHash,
          currentHash,
        };
      }

      return {
        ...item,
        decision: "update",
        reason: "template-upgrade",
        nextHash,
        currentHash,
      };
    });
  }

  function backupFileIfNeeded(filePath, backupDir) {
    if (!fileExists(filePath)) {
      return null;
    }
    const relative = filePath.replace(os.homedir(), "HOME");
    const safeName = relative.replace(/[\\/]/g, "__");
    ensureDir(backupDir);
    const backupPath = path.join(backupDir, safeName);
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }

  function mergeManifestFiles(manifest, appliedItems, packageVersion) {
    const table = mapManifestFilesByPath(manifest);

    for (const item of appliedItems) {
      table.set(item.filePath, {
        path: item.filePath,
        target: item.target,
        action: item.action,
        templateId: item.templateId,
        templateVersion: item.templateVersion,
        hash: item.nextHash,
        updatedAt: nowTimestamp(),
        packageVersion,
      });
    }

    return Array.from(table.values()).sort((a, b) => a.path.localeCompare(b.path));
  }

  function summarizePlan(items) {
    const stats = {
      create: 0,
      update: 0,
      unchanged: 0,
      conflict: 0,
      skip: 0,
    };

    for (const item of items) {
      if (stats[item.decision] !== undefined) {
        stats[item.decision] += 1;
      }
    }

    return stats;
  }

  function applyPlan(items) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(BACKUP_ROOT, timestamp);
    const backups = [];
    const applied = [];

    for (const item of items) {
      if (!["create", "update"].includes(item.decision)) {
        continue;
      }

      const backupPath = backupFileIfNeeded(item.filePath, backupDir);
      if (backupPath) {
        backups.push(backupPath);
      }
      writeFileAtomic(item.filePath, item.content);
      applied.push({
        ...item,
        backupPath,
        beforeExists: Boolean(backupPath),
      });
    }

    return {
      applied,
      backups,
      backupDir: backups.length > 0 ? backupDir : null,
    };
  }

  function selectInstalledFiles(manifestFiles, targets, actions) {
    return manifestFiles.filter((file) => {
      if (!targets.includes(file.target)) {
        return false;
      }
      if (!actions || actions.length === 0) {
        return true;
      }
      return actions.includes(file.action);
    });
  }

  function maybeCleanupParentDir(filePath) {
    if (path.basename(filePath) !== "SKILL.md") {
      return;
    }
    const parent = path.dirname(filePath);
    try {
      const files = fs.readdirSync(parent);
      if (files.length === 0) {
        fs.rmdirSync(parent);
      }
    } catch (error) {
      // ignore cleanup errors
    }
  }

  const installUpdate = createInstallUpdateOperation({
    TEMPLATE_VERSION,
    nowTimestamp,
    readManifest,
    writeManifest,
    appendManifestReportHistory,
    writeOperationReport,
    resolveOptions,
    confirmAfterPreview,
    resolveConflicts,
    printBanner,
    printOptionSummary,
    printUpdatePreviewPanel,
    printPlan,
    printApplySummary,
    buildTargetFilePlans,
    evaluatePlanItems,
    summarizePlan,
    mapManifestFilesByPath,
    applyPlan,
    mergeManifestFiles,
  });

  const rollback = createRollbackOperation({
    ICON,
    bold,
    parseCsv,
    normalizeTargets,
    normalizeActions,
    nowTimestamp,
    readManifest,
    writeManifest,
    appendManifestReportHistory,
    writeOperationReport,
    readOperationReport,
    listReports,
    printBanner,
    printRollbackSummary,
    fileExists,
    ensureDir,
    readUtf8,
    sha256,
    mapManifestFilesByPath,
    maybeCleanupParentDir,
  });

  const uninstall = createUninstallOperation({
    ICON,
    bold,
    dim,
    nowTimestamp,
    readManifest,
    writeManifest,
    resolveUninstallOptions,
    printBanner,
    printUninstallSummary,
    formatTargetTag,
    fileExists,
    maybeCleanupParentDir,
    selectInstalledFiles,
    unlinkFile,
  });

  return {
    installWithOptions: installUpdate.installWithOptions,
    updateWithOptions: installUpdate.updateWithOptions,
    rollbackWithOptions: rollback.rollbackWithOptions,
    listInstalled: uninstall.listInstalled,
    uninstallAll: uninstall.uninstallAll,
  };
}

module.exports = {
  createInstallerOperations,
};
