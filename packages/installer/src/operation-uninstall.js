function createUninstallOperation(context) {
  const {
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
  } = context;

  function listInstalled() {
    const manifest = readManifest();
    return manifest.files || [];
  }

  function printUninstallPlan(selectedFiles, options) {
    console.log("");
    console.log(`${ICON.plan} ${bold("Uninstall Plan")}`);
    console.log(`${ICON.target} Targets: ${options.targets.map((item) => formatTargetTag(item)).join(", ")}`);
    if (options.actions && options.actions.length > 0) {
      console.log(`${ICON.action} Actions: ${options.actions.join(", ")}`);
    } else {
      console.log(`${ICON.action} Actions: all`);
    }
    console.log(`${ICON.summary} Selected files: ${selectedFiles.length}`);

    for (const file of selectedFiles) {
      console.log(`  ${ICON.file} ${formatTargetTag(file.target)} ${file.action} ${dim("->")} ${file.path}`);
    }
  }

  async function uninstallAll(baseOptions = {}) {
    printBanner("uninstall");
    const manifest = readManifest();
    const manifestFiles = manifest.files || [];

    if (manifestFiles.length === 0) {
      const emptyResult = {
        mode: baseOptions.dryRun ? "uninstall-dry-run" : "uninstall",
        selected: [],
        removed: [],
        skipped: [],
      };
      printUninstallSummary(emptyResult);
      return emptyResult;
    }

    const options = await resolveUninstallOptions(baseOptions, manifestFiles);
    const selectedFiles = selectInstalledFiles(
      manifestFiles,
      options.targets,
      options.actions && options.actions.length > 0 ? options.actions : null
    );

    printUninstallPlan(selectedFiles, options);

    const removed = [];
    const skipped = [];

    for (const file of selectedFiles) {
      if (!fileExists(file.path)) {
        skipped.push(file.path);
        continue;
      }

      if (options.dryRun) {
        removed.push(file.path);
        continue;
      }

      try {
        unlinkFile(file.path);
        maybeCleanupParentDir(file.path);
        removed.push(file.path);
      } catch (error) {
        skipped.push(file.path);
      }
    }

    if (!options.dryRun) {
      const removedSet = new Set(removed);
      const nextFiles = manifestFiles.filter((file) => !removedSet.has(file.path));
      writeManifest({
        ...manifest,
        updatedAt: nowTimestamp(),
        files: nextFiles,
      });
    }

    const result = {
      mode: options.dryRun ? "uninstall-dry-run" : "uninstall",
      selected: selectedFiles.map((item) => item.path),
      removed,
      skipped,
    };

    printUninstallSummary(result);
    return result;
  }

  return {
    listInstalled,
    uninstallAll,
  };
}

module.exports = {
  createUninstallOperation,
};
