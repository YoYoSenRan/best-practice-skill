function createReportCommandRunner(context) {
  const {
    ICON,
    printHeader,
    warning,
    bold,
    dim,
    listReports,
    getReport,
    pruneReports,
  } = context;

  function formatReportStatsSummary(row) {
    if (row.stats && typeof row.stats === "object") {
      const keys = ["create", "update", "conflict", "skip", "restored", "removed"];
      const parts = keys
        .filter((key) => Number.isFinite(row.stats[key]))
        .map((key) => `${key.slice(0, 1)}:${row.stats[key]}`);
      if (parts.length > 0) {
        return parts.join(" ");
      }
    }

    if (Number.isFinite(row.appliedCount)) {
      return `a:${row.appliedCount}`;
    }
    if (Number.isFinite(row.restoredCount)) {
      return `r:${row.restoredCount}`;
    }
    if (Number.isFinite(row.removedCount)) {
      return `d:${row.removedCount}`;
    }

    return "-";
  }

  function shortReportId(reportId) {
    const id = String(reportId || "unknown");
    if (id.length <= 30) {
      return id;
    }
    return `${id.slice(0, 14)}…${id.slice(-12)}`;
  }

  function runReportList(options) {
    const limit = Math.max(1, Number(options.limit || 20));
    const operation = options.operation ? String(options.operation).trim().toLowerCase() : undefined;
    const reports = listReports({
      limit,
      operation,
    });

    if (options.json) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }

    printHeader("Reports", ICON.list);
    if (reports.length === 0) {
      console.log(`${ICON.warn} ${warning("No reports found")}`);
      return;
    }

    const rows = reports.map((row) => ({
      id: shortReportId(row.reportId),
      operation: row.operation || "unknown",
      mode: row.mode || "-",
      generated: row.generatedAt || "-",
      stats: formatReportStatsSummary(row),
      path: row.reportPath,
    }));

    const widths = {
      id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
      operation: Math.max("Operation".length, ...rows.map((row) => row.operation.length)),
      mode: Math.max("Mode".length, ...rows.map((row) => row.mode.length)),
      generated: Math.max("Generated".length, ...rows.map((row) => row.generated.length)),
      stats: Math.max("Stats".length, ...rows.map((row) => row.stats.length)),
    };

    const headerLine = [
      "ID".padEnd(widths.id),
      "Operation".padEnd(widths.operation),
      "Mode".padEnd(widths.mode),
      "Generated".padEnd(widths.generated),
      "Stats".padEnd(widths.stats),
    ].join("  ");

    console.log(`${ICON.summary} count: ${rows.length}${operation ? ` (operation=${operation})` : ""}`);
    console.log(bold(headerLine));
    console.log(dim("-".repeat(headerLine.length)));

    for (const row of rows) {
      console.log([
        row.id.padEnd(widths.id),
        row.operation.padEnd(widths.operation),
        row.mode.padEnd(widths.mode),
        row.generated.padEnd(widths.generated),
        row.stats.padEnd(widths.stats),
      ].join("  "));
      console.log(`  ${dim(row.path)}`);
    }
  }

  function runReportShow(options) {
    const hasExplicitSelector = Boolean(options.report || options.id);
    const requestedOperation = options.operation
      ? String(options.operation).trim().toLowerCase()
      : (hasExplicitSelector ? undefined : "update");

    let payload = getReport({
      reportPath: options.report,
      reportId: options.id,
      operation: requestedOperation,
    });

    if (!payload && !hasExplicitSelector && requestedOperation === "update") {
      payload = getReport({
        operation: undefined,
      });
    }

    if (!payload) {
      throw new Error("Report not found. Use `bps report list` first.");
    }

    if (options.json) {
      console.log(JSON.stringify({
        reportPath: payload.reportPath,
        resolvedBy: payload.resolvedBy || null,
        report: payload.report,
      }, null, 2));
      return;
    }

    printHeader("Report Detail", ICON.list);
    if (!hasExplicitSelector) {
      console.log(`${ICON.note} default operation: ${requestedOperation || "latest"}`);
    }
    if (payload.resolvedBy) {
      console.log(`${ICON.note} resolved by: ${payload.resolvedBy}`);
    }
    console.log(`${ICON.note} id: ${payload.report.reportId || "unknown"}`);
    console.log(`${ICON.note} operation: ${payload.report.operation || "unknown"}`);
    console.log(`${ICON.note} generated: ${payload.report.generatedAt || "unknown"}`);
    console.log(`${ICON.note} mode: ${payload.report.mode || "unknown"}`);
    console.log(`${ICON.path} path: ${payload.reportPath}`);

    if (payload.report.stats) {
      console.log(`${ICON.summary} stats: ${JSON.stringify(payload.report.stats)}`);
    }
    if (Array.isArray(payload.report.plan)) {
      console.log(`${ICON.summary} plan items: ${payload.report.plan.length}`);
    }
    if (Array.isArray(payload.report.applied)) {
      console.log(`${ICON.summary} applied items: ${payload.report.applied.length}`);
    }
    if (Array.isArray(payload.report.restored)) {
      console.log(`${ICON.summary} restored: ${payload.report.restored.length}`);
    }
    if (Array.isArray(payload.report.removed)) {
      console.log(`${ICON.summary} removed: ${payload.report.removed.length}`);
    }
    if (Array.isArray(payload.report.skipped)) {
      console.log(`${ICON.summary} skipped: ${payload.report.skipped.length}`);
    }
  }

  function runReportPrune(options) {
    const keep = Math.max(0, Number(options.keep || 20));
    const operation = options.operation ? String(options.operation).trim().toLowerCase() : undefined;
    const result = pruneReports({
      keep,
      operation,
      dryRun: Boolean(options["dry-run"]),
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printHeader("Report Prune", ICON.uninstall);
    console.log(`${ICON.note} scanned: ${result.scannedCount}`);
    console.log(`${ICON.note} kept: ${result.keptCount}`);
    console.log(`${ICON.ok} removed: ${result.removedCount}`);
    if (result.operation) {
      console.log(`${ICON.note} operation filter: ${result.operation}`);
    }
    if (result.dryRun) {
      console.log(`${ICON.warn} dry-run enabled, no reports were deleted`);
    }
  }

  function runReportCommand(rest, options) {
    const sub = rest[0] || "list";

    if (sub === "help") {
      printHeader("Report Commands", ICON.list);
      console.log(`${ICON.list} bps report list [--limit 20] [--operation update|install|rollback|uninstall] [--json]`);
      console.log(`${ICON.list} bps report show [--id report-id] [--report /path/to/report.json] [--operation update|install|rollback|uninstall] [--json]`);
      console.log(`${ICON.uninstall} bps report prune [--keep 20] [--operation ...] [--dry-run] [--json]`);
      return;
    }

    if (sub === "list") {
      runReportList(options);
      return;
    }
    if (sub === "show") {
      runReportShow(options);
      return;
    }
    if (sub === "prune") {
      runReportPrune(options);
      return;
    }

    throw new Error(`Unknown report subcommand: ${sub}`);
  }

  return {
    runReportCommand,
  };
}

module.exports = {
  createReportCommandRunner,
};
