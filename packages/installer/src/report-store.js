const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const MANIFEST_DIR = path.join(os.homedir(), ".bps");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.json");
const REPORT_ROOT = path.join(MANIFEST_DIR, "reports");
const REPORT_HISTORY_LIMIT = 20;

function nowTimestamp() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

function createDefaultManifest() {
  return {
    managedBy: "bps",
    packageVersion: "0.1.0",
    templatesVersion: null,
    installedAt: null,
    updatedAt: null,
    files: [],
  };
}

function readManifest() {
  if (!fileExists(MANIFEST_PATH)) {
    return createDefaultManifest();
  }

  try {
    return JSON.parse(readUtf8(MANIFEST_PATH));
  } catch (error) {
    return createDefaultManifest();
  }
}

function writeManifest(manifest) {
  ensureDir(MANIFEST_DIR);
  writeFileAtomic(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function buildReportId(operation) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const random = crypto.randomBytes(4).toString("hex");
  return `${operation}-${ts}-${random}`;
}

function writeOperationReport(operation, payload) {
  ensureDir(REPORT_ROOT);
  const reportId = buildReportId(operation);
  const reportPath = path.join(REPORT_ROOT, `${reportId}.json`);
  const report = {
    reportId,
    operation,
    generatedAt: nowTimestamp(),
    ...payload,
  };
  writeFileAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    reportId,
    reportPath,
    report,
  };
}

function readOperationReport(reportPath) {
  if (!reportPath || !fileExists(reportPath)) {
    return null;
  }
  try {
    return JSON.parse(readUtf8(reportPath));
  } catch (error) {
    return null;
  }
}

function trimReportHistory(history) {
  const rows = Array.isArray(history) ? history : [];
  if (rows.length <= REPORT_HISTORY_LIMIT) {
    return rows;
  }
  return rows.slice(rows.length - REPORT_HISTORY_LIMIT);
}

function appendManifestReportHistory(manifest, entry) {
  const history = Array.isArray(manifest.reportHistory)
    ? [...manifest.reportHistory, entry]
    : [entry];
  return trimReportHistory(history);
}

function listReportFiles() {
  if (!fileExists(REPORT_ROOT)) {
    return [];
  }

  return fs.readdirSync(REPORT_ROOT)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(REPORT_ROOT, name));
}

function inferReportOperation(reportPath) {
  const name = path.basename(reportPath, ".json").toLowerCase();
  if (name.startsWith("update-")) {
    return "update";
  }
  if (name.startsWith("install-")) {
    return "install";
  }
  if (name.startsWith("rollback-")) {
    return "rollback";
  }
  if (name.startsWith("uninstall-")) {
    return "uninstall";
  }
  return "unknown";
}

function buildReportListItem(reportPath) {
  const stat = fs.statSync(reportPath);
  const report = readOperationReport(reportPath);
  const generatedAt = (report && report.generatedAt)
    ? report.generatedAt
    : new Date(stat.mtimeMs).toISOString();
  const operation = (report && report.operation)
    ? report.operation
    : inferReportOperation(reportPath);

  return {
    reportId: (report && report.reportId)
      ? report.reportId
      : path.basename(reportPath, ".json"),
    reportPath,
    operation,
    generatedAt,
    mode: report ? report.mode || null : null,
    dryRun: Boolean(report && report.dryRun),
    stats: report ? report.stats || null : null,
    appliedCount: report && Array.isArray(report.applied) ? report.applied.length : null,
    restoredCount: report && Array.isArray(report.restored) ? report.restored.length : null,
    removedCount: report && Array.isArray(report.removed) ? report.removed.length : null,
    skippedCount: report && Array.isArray(report.skipped) ? report.skipped.length : null,
  };
}

function listReports(options = {}) {
  const limit = Math.max(1, Number(options.limit || 20));
  const operation = options.operation ? String(options.operation).trim().toLowerCase() : "";

  const rows = listReportFiles()
    .map((reportPath) => buildReportListItem(reportPath))
    .filter((item) => !operation || item.operation === operation)
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));

  return rows.slice(0, limit);
}

function getReport(options = {}) {
  const requestedOperation = options.operation
    ? String(options.operation).trim().toLowerCase()
    : "";

  if (options.reportPath) {
    const resolvedPath = path.resolve(String(options.reportPath));
    const report = readOperationReport(resolvedPath);
    if (!report) {
      return null;
    }
    return {
      reportPath: resolvedPath,
      resolvedBy: "report-path",
      report,
    };
  }

  if (options.reportId) {
    const reportPath = path.join(REPORT_ROOT, `${String(options.reportId).trim()}.json`);
    const report = readOperationReport(reportPath);
    if (!report) {
      return null;
    }
    return {
      reportPath,
      resolvedBy: "report-id",
      report,
    };
  }

  const manifest = readManifest();
  if (manifest.lastOperationReport && manifest.lastOperationReport.reportPath) {
    const report = readOperationReport(manifest.lastOperationReport.reportPath);
    if (report) {
      const operationMatches = !requestedOperation
        || String(report.operation || "").toLowerCase() === requestedOperation;
      if (operationMatches) {
        return {
          reportPath: manifest.lastOperationReport.reportPath,
          resolvedBy: "manifest-last-operation",
          report,
        };
      }
    }
  }

  const latest = listReports({
    limit: 1,
    operation: requestedOperation,
  })[0];
  if (!latest) {
    return null;
  }

  const report = readOperationReport(latest.reportPath);
  if (!report) {
    return null;
  }

  return {
    reportPath: latest.reportPath,
    resolvedBy: requestedOperation ? "latest-by-operation" : "latest",
    report,
  };
}

function pruneReports(options = {}) {
  const keep = Math.max(0, Number(options.keep ?? REPORT_HISTORY_LIMIT));
  const dryRun = Boolean(options.dryRun);
  const operation = options.operation ? String(options.operation).trim().toLowerCase() : "";

  const allRows = listReports({ limit: 100000, operation });
  const rowsToDelete = allRows.slice(keep);

  if (!dryRun) {
    for (const row of rowsToDelete) {
      if (fileExists(row.reportPath)) {
        fs.unlinkSync(row.reportPath);
      }
    }
  }

  const removedPaths = rowsToDelete.map((row) => row.reportPath);

  if (!dryRun && removedPaths.length > 0 && fileExists(MANIFEST_PATH)) {
    const manifest = readManifest();
    const removedSet = new Set(removedPaths);
    const nextHistory = (manifest.reportHistory || []).filter((item) => !removedSet.has(item.reportPath));

    const nextManifest = {
      ...manifest,
      updatedAt: nowTimestamp(),
      reportHistory: trimReportHistory(nextHistory),
    };

    if (manifest.lastOperationReport && removedSet.has(manifest.lastOperationReport.reportPath)) {
      nextManifest.lastOperationReport = null;
    }
    if (manifest.lastUpdateReportPath && removedSet.has(manifest.lastUpdateReportPath)) {
      nextManifest.lastUpdateReportPath = null;
    }
    if (manifest.lastRollbackReportPath && removedSet.has(manifest.lastRollbackReportPath)) {
      nextManifest.lastRollbackReportPath = null;
    }

    writeManifest(nextManifest);
  }

  return {
    scannedCount: allRows.length,
    matchedCount: allRows.length,
    removedCount: rowsToDelete.length,
    keptCount: Math.min(keep, allRows.length),
    dryRun,
    operation: operation || null,
    removedPaths,
  };
}

module.exports = {
  MANIFEST_DIR,
  MANIFEST_PATH,
  REPORT_ROOT,
  REPORT_HISTORY_LIMIT,
  nowTimestamp,
  readManifest,
  writeManifest,
  appendManifestReportHistory,
  writeOperationReport,
  readOperationReport,
  listReports,
  getReport,
  pruneReports,
};
