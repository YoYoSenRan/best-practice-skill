function createInstallerPresenter(context) {
  const {
    ICON,
    TEMPLATE_VERSION,
    bold,
    accent,
    success,
    warning,
    muted,
    formatTargetTag,
  } = context;

  function printBanner(operation) {
    let modeText = `${ICON.install} INSTALL`;
    if (operation === "update") {
      modeText = `${ICON.update} UPDATE`;
    }
    if (operation === "uninstall") {
      modeText = `${ICON.uninstall} UNINSTALL`;
    }
    if (operation === "rollback") {
      modeText = `${ICON.rollback} ROLLBACK`;
    }

    console.log("");
    console.log(`${ICON.logo} ${bold("BPS Installer")} ${muted("for Claude + Codex")}`);
    console.log(accent("────────────────────────────────────────"));
    console.log(`${accent(modeText)} ${muted(`template v${TEMPLATE_VERSION}`)}`);
  }

  function formatDecision(item) {
    if (item.decision === "create") {
      return success("[create]");
    }
    if (item.decision === "update") {
      return accent("[update]");
    }
    if (item.decision === "unchanged") {
      return muted("[unchanged]");
    }
    if (item.decision === "conflict") {
      return warning("[conflict]");
    }
    return muted("[skip]");
  }

  function printOptionSummary(options) {
    const targetText = options.targets.map((item) => formatTargetTag(item)).join(", ");
    const actionText = options.actions.map((item) => `${ICON.action} ${item}`).join("  ");
    const modeText = options.dryRun ? `${ICON.dryRun} dry-run` : `${ICON.ok} apply`;

    console.log(`${ICON.target} Targets: ${targetText}`);
    console.log(`${ICON.action} Actions: ${actionText}`);
    console.log(`${ICON.note} Mode: ${modeText}`);
    if (options.force) {
      console.log(warning(`${ICON.conflict} Force mode enabled`));
    }
  }

  function printPlan(items, stats, operation) {
    const planTitle = operation === "update" ? "Update Plan" : "Install Plan";
    console.log("");
    console.log(`${ICON.plan} ${bold(planTitle)}`);
    console.log(
      `${ICON.summary} create ${stats.create} · update ${stats.update} · unchanged ${stats.unchanged} · conflict ${stats.conflict} · skip ${stats.skip}`
    );

    for (const item of items) {
      const tag = formatDecision(item);
      const targetTag = formatTargetTag(item.target);
      const reason = muted(item.reason);
      console.log(`  ${tag} ${targetTag} ${ICON.file} ${item.filePath} ${reason}`);
    }
  }

  function printUpdatePreviewPanel(items, options, manifest) {
    const changed = items.filter((item) => ["create", "update", "conflict"].includes(item.decision));
    const grouped = new Map();

    for (const item of changed) {
      const key = `${item.target}:${item.action}`;
      const row = grouped.get(key) || {
        target: item.target,
        action: item.action,
        create: 0,
        update: 0,
        conflict: 0,
      };
      if (item.decision === "create") {
        row.create += 1;
      } else if (item.decision === "update") {
        row.update += 1;
      } else if (item.decision === "conflict") {
        row.conflict += 1;
      }
      grouped.set(key, row);
    }

    console.log("");
    console.log(`${ICON.plan} ${bold("Update Preview")}`);
    console.log(`${ICON.note} package: ${manifest.packageVersion || "unknown"} -> ${options.packageVersion}`);
    console.log(`${ICON.target} targets: ${options.targets.join(", ")}`);
    console.log(`${ICON.action} actions: ${options.actions.join(", ")}`);

    if (changed.length === 0) {
      console.log(`${ICON.ok} ${muted("No file changes detected for this update scope.")}`);
      return;
    }

    for (const row of grouped.values()) {
      const targetTag = formatTargetTag(row.target);
      console.log(
        `  ${targetTag} ${row.action} -> create ${row.create}, update ${row.update}, conflict ${row.conflict}`
      );
    }
  }

  function printApplySummary(result, operation) {
    const title = operation === "update" ? `${ICON.update} Update Completed` : `${ICON.install} Install Completed`;
    console.log("");
    console.log(success(title));
    console.log(`${ICON.summary} ${bold("Stats")}: ${JSON.stringify(result.stats)}`);

    const isDryRun = String(result.mode || "").includes("dry-run");
    const plannedChanges = (result.stats.create || 0) + (result.stats.update || 0);

    if (result.applied.length > 0) {
      console.log(`${ICON.ok} Applied files:`);
      for (const filePath of result.applied) {
        console.log(`  - ${filePath}`);
      }
    } else if (isDryRun && plannedChanges > 0) {
      console.log(`${ICON.note} ${muted(`Dry-run only: ${plannedChanges} file(s) would be changed.`)}`);
    } else {
      console.log(`${ICON.note} No file changes were required.`);
    }

    if (result.reportPath) {
      console.log(`${ICON.note} Report: ${result.reportPath}`);
    }

    if (result.backups.length > 0) {
      console.log(`${ICON.backup} Backups:`);
      for (const backupPath of result.backups) {
        console.log(`  - ${backupPath}`);
      }
    }
  }

  function printUninstallSummary(result) {
    const isDryRun = String(result.mode || "").includes("dry-run");

    console.log("");
    console.log(success(`${ICON.uninstall} Uninstall Completed`));
    console.log(`${ICON.summary} ${bold("Selected")}: ${result.selected.length}`);
    if (isDryRun) {
      console.log(`${ICON.summary} ${bold("Would Remove")}: ${result.removed.length}`);
    } else {
      console.log(`${ICON.summary} ${bold("Removed")}: ${result.removed.length}`);
    }
    console.log(`${ICON.summary} ${bold("Skipped")}: ${result.skipped.length}`);

    if (result.removed.length > 0) {
      if (isDryRun) {
        console.log(`${ICON.remove} Would remove files:`);
      } else {
        console.log(`${ICON.remove} Removed files:`);
      }
      for (const filePath of result.removed) {
        console.log(`  - ${filePath}`);
      }
    }

    if (result.skipped.length > 0) {
      console.log(`${ICON.skip} Skipped files:`);
      for (const filePath of result.skipped) {
        console.log(`  - ${filePath}`);
      }
    }
  }

  function printRollbackSummary(result) {
    const isDryRun = String(result.mode || "").includes("dry-run");
    console.log("");
    console.log(success(`${ICON.rollback} Rollback Completed`));
    if (result.sourceReportPath) {
      console.log(`${ICON.note} source report: ${result.sourceReportPath}`);
    }
    if (result.filters) {
      const targetText = Array.isArray(result.filters.targets) && result.filters.targets.length > 0
        ? result.filters.targets.join(",")
        : "all";
      const actionText = Array.isArray(result.filters.actions) && result.filters.actions.length > 0
        ? result.filters.actions.join(",")
        : "all";
      console.log(`${ICON.target} targets: ${targetText}`);
      console.log(`${ICON.action} actions: ${actionText}`);
    }
    if (typeof result.selectedCount === "number") {
      console.log(`${ICON.summary} selected: ${result.selectedCount}`);
    }
    console.log(`${ICON.summary} restored: ${result.restored.length}`);
    console.log(`${ICON.summary} removed: ${result.removed.length}`);
    console.log(`${ICON.summary} skipped: ${result.skipped.length}`);
    if (isDryRun) {
      console.log(`${ICON.dryRun} dry-run enabled, no file changes were applied`);
    }
    if (result.reportPath) {
      console.log(`${ICON.note} rollback report: ${result.reportPath}`);
    }
  }

  return {
    printBanner,
    printOptionSummary,
    printPlan,
    printUpdatePreviewPanel,
    printApplySummary,
    printUninstallSummary,
    printRollbackSummary,
  };
}

module.exports = {
  createInstallerPresenter,
};
