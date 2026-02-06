const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

function createRollbackOperation(context) {
  const {
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
  } = context;

  function createPromptInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  function ask(rl, question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  async function rollbackWithOptions(baseOptions = {}) {
    printBanner("rollback");

    const rawTargets = typeof baseOptions.target === "string"
      ? parseCsv(baseOptions.target)
      : null;
    const rawActions = typeof baseOptions.actions === "string"
      ? parseCsv(baseOptions.actions)
      : null;

    const options = {
      nonInteractive: Boolean(baseOptions.nonInteractive),
      yes: Boolean(baseOptions.yes),
      dryRun: Boolean(baseOptions.dryRun),
      reportPath: baseOptions.reportPath ? path.resolve(baseOptions.reportPath) : null,
      targets: rawTargets && rawTargets.length > 0 ? normalizeTargets(rawTargets) : null,
      actions: rawActions && rawActions.length > 0 ? normalizeActions(rawActions) : null,
    };

    const manifest = readManifest();
    const latestUpdateReport = listReports({
      limit: 1,
      operation: "update",
    })[0];
    const sourceReportPath = options.reportPath
      || manifest.lastUpdateReportPath
      || (latestUpdateReport ? latestUpdateReport.reportPath : null)
      || ((manifest.lastOperationReport || {}).reportPath || null);

    if (!sourceReportPath) {
      const emptyResult = {
        mode: options.dryRun ? "rollback-dry-run" : "rollback",
        sourceReportPath: null,
        filters: {
          targets: options.targets,
          actions: options.actions,
        },
        selectedCount: 0,
        restored: [],
        removed: [],
        skipped: ["missing-report"],
        reportPath: null,
      };
      printRollbackSummary(emptyResult);
      return emptyResult;
    }

    const sourceReport = readOperationReport(sourceReportPath);
    if (!sourceReport || !Array.isArray(sourceReport.applied)) {
      const invalidResult = {
        mode: options.dryRun ? "rollback-dry-run" : "rollback",
        sourceReportPath,
        filters: {
          targets: options.targets,
          actions: options.actions,
        },
        selectedCount: 0,
        restored: [],
        removed: [],
        skipped: ["invalid-report"],
        reportPath: null,
      };
      printRollbackSummary(invalidResult);
      return invalidResult;
    }

    const candidates = sourceReport.applied
      .filter((item) => ["create", "update"].includes(item.decision))
      .filter((item) => {
        if (options.targets && options.targets.length > 0) {
          if (!item.target || !options.targets.includes(item.target)) {
            return false;
          }
        }
        if (options.actions && options.actions.length > 0) {
          if (!item.action || !options.actions.includes(item.action)) {
            return false;
          }
        }
        return true;
      });

    if (!options.nonInteractive && !options.yes && !options.dryRun) {
      const rl = createPromptInterface();
      try {
        console.log("");
        console.log(`${ICON.rollback} ${bold("Rollback Preview")}`);
        console.log(`${ICON.note} source report: ${sourceReportPath}`);
        console.log(`${ICON.target} targets: ${(options.targets || ["all"]).join(",")}`);
        console.log(`${ICON.action} actions: ${(options.actions || ["all"]).join(",")}`);
        console.log(`${ICON.summary} affected files: ${candidates.length}`);
        const answer = await ask(rl, `${ICON.note} 执行回滚? [Y/n]: `);
        if (answer.toLowerCase() === "n") {
          throw new Error("Rollback canceled by user");
        }
      } finally {
        rl.close();
      }
    }

    const restored = [];
    const removed = [];
    const skipped = [];

    for (const item of [...candidates].reverse()) {
      const filePath = item.filePath;
      if (!filePath) {
        skipped.push("unknown-file");
        continue;
      }

      if (item.backupPath && fileExists(item.backupPath)) {
        if (!options.dryRun) {
          ensureDir(path.dirname(filePath));
          fs.copyFileSync(item.backupPath, filePath);
        }
        restored.push(filePath);
        continue;
      }

      if (item.decision === "create") {
        if (fileExists(filePath)) {
          if (!options.dryRun) {
            fs.unlinkSync(filePath);
            maybeCleanupParentDir(filePath);
          }
          removed.push(filePath);
        } else {
          skipped.push(filePath);
        }
        continue;
      }

      skipped.push(filePath);
    }

    if (candidates.length === 0) {
      skipped.push("no-matching-items");
    }

    const rollbackReport = writeOperationReport("rollback", {
      mode: options.dryRun ? "rollback-dry-run" : "rollback",
      dryRun: options.dryRun,
      sourceReportPath,
      sourceReportId: sourceReport.reportId || null,
      filters: {
        targets: options.targets,
        actions: options.actions,
      },
      selectedCount: candidates.length,
      restored,
      removed,
      skipped,
    });

    if (!options.dryRun) {
      const latestManifest = readManifest();
      const table = mapManifestFilesByPath(latestManifest);

      for (const item of candidates) {
        if (item.decision === "create") {
          table.delete(item.filePath);
          continue;
        }

        if (item.previousManifestEntry && restored.includes(item.filePath)) {
          const hash = fileExists(item.filePath)
            ? sha256(readUtf8(item.filePath))
            : item.previousManifestEntry.hash;
          table.set(item.filePath, {
            ...item.previousManifestEntry,
            hash,
            updatedAt: nowTimestamp(),
          });
          continue;
        }

        if (table.has(item.filePath) && fileExists(item.filePath)) {
          const current = table.get(item.filePath);
          table.set(item.filePath, {
            ...current,
            hash: sha256(readUtf8(item.filePath)),
            updatedAt: nowTimestamp(),
          });
        }
      }

      const nextManifest = {
        ...latestManifest,
        updatedAt: nowTimestamp(),
        files: Array.from(table.values()).sort((a, b) => a.path.localeCompare(b.path)),
        lastOperationReport: {
          operation: "rollback",
          reportId: rollbackReport.reportId,
          reportPath: rollbackReport.reportPath,
          generatedAt: nowTimestamp(),
        },
        reportHistory: appendManifestReportHistory(latestManifest, {
          operation: "rollback",
          reportId: rollbackReport.reportId,
          reportPath: rollbackReport.reportPath,
          generatedAt: nowTimestamp(),
          sourceReportPath,
          selectedCount: candidates.length,
        }),
        lastRollbackReportPath: rollbackReport.reportPath,
      };
      writeManifest(nextManifest);
    }

    const result = {
      mode: options.dryRun ? "rollback-dry-run" : "rollback",
      sourceReportPath,
      filters: {
        targets: options.targets,
        actions: options.actions,
      },
      selectedCount: candidates.length,
      restored,
      removed,
      skipped,
      reportId: rollbackReport.reportId,
      reportPath: rollbackReport.reportPath,
    };
    printRollbackSummary(result);
    return result;
  }

  return {
    rollbackWithOptions,
  };
}

module.exports = {
  createRollbackOperation,
};
