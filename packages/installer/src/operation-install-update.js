function createInstallUpdateOperation(context) {
  const {
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
  } = context;

  async function installWithOptions(baseOptions = {}, operation = "install") {
    printBanner(operation);
    const options = await resolveOptions(baseOptions, operation);
    printOptionSummary(options);

    const manifest = readManifest();
    const plans = buildTargetFilePlans({
      actions: options.actions,
      targets: options.targets,
      packageVersion: options.packageVersion,
    });

    const evaluated = evaluatePlanItems(plans, manifest);
    if (operation === "update") {
      printUpdatePreviewPanel(evaluated, options, manifest);
    }
    const resolved = await resolveConflicts(evaluated, options);
    const stats = summarizePlan(resolved);
    printPlan(resolved, stats, operation);
    await confirmAfterPreview(options, operation);

    const reportPlan = resolved.map((item) => ({
      target: item.target,
      action: item.action,
      filePath: item.filePath,
      decision: item.decision,
      reason: item.reason,
    }));

    if (options.dryRun) {
      const reportWritten = writeOperationReport(operation, {
        mode: `${operation}-dry-run`,
        dryRun: true,
        packageVersion: options.packageVersion,
        previousPackageVersion: manifest.packageVersion || null,
        options: {
          targets: options.targets,
          actions: options.actions,
          force: options.force,
          nonInteractive: options.nonInteractive,
          yes: options.yes,
        },
        stats,
        plan: reportPlan,
        applied: [],
        backups: [],
      });

      const dryResult = {
        mode: `${operation}-dry-run`,
        stats,
        applied: [],
        backups: [],
        reportId: reportWritten.reportId,
        reportPath: reportWritten.reportPath,
      };
      printApplySummary(dryResult, operation);
      return dryResult;
    }

    const previousManifestMap = mapManifestFilesByPath(manifest);
    const { applied, backups, backupDir } = applyPlan(resolved);
    const appliedDetails = applied.map((item) => ({
      target: item.target,
      action: item.action,
      filePath: item.filePath,
      decision: item.decision,
      reason: item.reason,
      beforeExists: item.beforeExists,
      currentHash: item.currentHash || null,
      nextHash: item.nextHash || null,
      backupPath: item.backupPath || null,
      previousManifestEntry: previousManifestMap.get(item.filePath) || null,
    }));

    const reportWritten = writeOperationReport(operation, {
      mode: operation,
      dryRun: false,
      packageVersion: options.packageVersion,
      previousPackageVersion: manifest.packageVersion || null,
      options: {
        targets: options.targets,
        actions: options.actions,
        force: options.force,
        nonInteractive: options.nonInteractive,
        yes: options.yes,
      },
      stats,
      plan: reportPlan,
      applied: appliedDetails,
      backups,
      backupDir,
    });

    const nextManifest = {
      ...manifest,
      managedBy: "bps",
      packageVersion: options.packageVersion,
      templatesVersion: TEMPLATE_VERSION,
      installedAt: manifest.installedAt || nowTimestamp(),
      updatedAt: nowTimestamp(),
      files: mergeManifestFiles(manifest, applied, options.packageVersion),
      lastOperationReport: {
        operation,
        reportId: reportWritten.reportId,
        reportPath: reportWritten.reportPath,
        generatedAt: nowTimestamp(),
      },
      reportHistory: appendManifestReportHistory(manifest, {
        operation,
        reportId: reportWritten.reportId,
        reportPath: reportWritten.reportPath,
        generatedAt: nowTimestamp(),
        appliedCount: applied.length,
      }),
    };

    if (operation === "update") {
      nextManifest.lastUpdateReportPath = reportWritten.reportPath;
    }

    writeManifest(nextManifest);

    const result = {
      mode: operation,
      stats,
      applied: applied.map((item) => item.filePath),
      backups,
      reportId: reportWritten.reportId,
      reportPath: reportWritten.reportPath,
    };
    printApplySummary(result, operation);
    return result;
  }

  async function updateWithOptions(baseOptions = {}) {
    return installWithOptions(baseOptions, "update");
  }

  return {
    installWithOptions,
    updateWithOptions,
  };
}

module.exports = {
  createInstallUpdateOperation,
};
