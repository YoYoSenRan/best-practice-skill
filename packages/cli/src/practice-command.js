function createPracticeCommandRunner(context) {
  const {
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
  } = context;

  function formatPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function truncate(text, maxLength = 140) {
    const raw = String(text || "").trim();
    if (raw.length <= maxLength) {
      return raw;
    }
    return `${raw.slice(0, maxLength - 1)}…`;
  }

  function formatBytes(size) {
    const bytes = Number(size || 0);
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function printPracticeSearchResult(result) {
    printHeader(`Practice Search: ${result.topic}`, ICON.practice);
    if (result.stack) {
      console.log(`${ICON.note} stack: ${result.stack}`);
    }
    console.log(`${ICON.note} objective: ${result.objective}`);
    console.log(`${ICON.note} config: ${result.config.path} ${dim(result.config.loadedFromDisk ? "(custom)" : "(default)")}`);
    if (result.config.officialDocsIndexPath) {
      console.log(`${ICON.note} official-index: ${result.config.officialDocsIndexPath}`);
    }

    console.log("");
    console.log(`${ICON.list} ${bold("Execution")}`);
    console.log(`  - queries: ${result.execution.queryCount}`);
    console.log(`  - requests: ${result.execution.requestCount}`);
    console.log(`  - collected: ${result.execution.collectedCount}`);
    console.log(`  - ranked: ${result.execution.rankedCount}`);
    console.log(`  - cache: ${result.execution.cacheHitCount || 0} hit / ${result.execution.cacheMissCount || 0} miss`);
    console.log(`  - cache-mode: ${result.execution.cacheBypass ? "disabled" : (result.execution.cacheRefresh ? "refresh" : "normal")}`);
    console.log(`  - retries-used: ${result.execution.retryUsedCount || 0}`);
    console.log(`  - evidence-fetch: ${result.execution.fetchedForEvidence || 0}`);
    console.log(`  - hooks: ${result.execution.hooksExecuted || 0} executed / ${result.execution.hooksFailed || 0} failed`);
    console.log(`  - errors: ${result.execution.errorCount}`);

    console.log("");
    console.log(`${ICON.ok} ${bold("Top Sources")}`);
    if (!Array.isArray(result.results) || result.results.length === 0) {
      console.log(`  ${ICON.warn} ${warning("No ranked results. Try adjusting topic/stack or config stages.")}`);
    } else {
      for (let index = 0; index < result.results.length; index += 1) {
        const item = result.results[index];
        console.log(`  ${index + 1}. ${item.title}`);
        console.log(`     ${dim(item.url)}`);
        console.log(
          `     score ${formatPercent(item.totalScore)} | authority ${formatPercent(item.score.authority)} | recency ${formatPercent(item.score.recency)} | relevance ${formatPercent(item.score.relevance)} | coverage ${formatPercent(item.score.topicCoverage)} | cache ${item.fetchedFromCache ? "hit" : "miss"}`
        );
        if (item.snippet) {
          console.log(`     ${truncate(item.snippet)}`);
        }

        if (Array.isArray(item.evidence) && item.evidence.length > 0) {
          for (const evidence of item.evidence.slice(0, 2)) {
            console.log(`     evidence: ${truncate(evidence.text, 180)}`);
          }
        }
      }
    }

    if (Array.isArray(result.summary.highlights) && result.summary.highlights.length > 0) {
      console.log("");
      console.log(`${ICON.prompt} ${bold("Highlights")}`);
      for (const line of result.summary.highlights) {
        console.log(`  - ${line}`);
      }
    }

    if (Array.isArray(result.summary.recommendations) && result.summary.recommendations.length > 0) {
      console.log("");
      console.log(`${ICON.note} ${bold("Recommendations")}`);
      for (const line of result.summary.recommendations) {
        console.log(`  - ${line}`);
      }
    }

    if (Array.isArray(result.summary.evidenceChain) && result.summary.evidenceChain.length > 0) {
      console.log("");
      console.log(`${ICON.prompt} ${bold("Evidence Chain")}`);
      for (const item of result.summary.evidenceChain.slice(0, 5)) {
        console.log(`  - ${item.excerpt}`);
        console.log(`    ${dim(item.url)}`);
      }
    }

    if (result.prompts && result.prompts.codex) {
      console.log("");
      console.log(`${ICON.prompt} ${bold("Prompt Draft (Codex/Claude)")}`);
      console.log(result.prompts.codex);
    }

    if (result.hooks && Array.isArray(result.hooks.failed) && result.hooks.failed.length > 0) {
      console.log("");
      console.log(`${ICON.warn} ${warning("Hook failures")}`);
      for (const failed of result.hooks.failed.slice(0, 5)) {
        console.log(`  - ${failed.stage}: ${failed.message}`);
      }
    }

    if (Array.isArray(result.errors) && result.errors.length > 0) {
      console.log("");
      console.log(`${ICON.warn} ${warning("Partial failures")}`);
      for (const error of result.errors.slice(0, 5)) {
        console.log(`  - [${error.sourceId}] ${error.query}`);
        console.log(`    ${dim(error.message)}`);
      }
    }
  }

  async function runPracticeSearchCommand(rest, options) {
    const rawTopic = rest.slice(1).join(" ").trim();
    let inputPayload = options.input;

    if (!inputPayload && rawTopic) {
      inputPayload = JSON.stringify({
        topic: rawTopic,
      });
    }

    if (!inputPayload) {
      throw new Error("Usage: bps practice search --input '{\"topic\":\"...\"}' [--config /path/config.json] [--no-cache] [--refresh-cache]");
    }

    const configPath = options.config || options.path;
    const result = await runPracticeSearch(inputPayload, {
      configPath,
      noCache: Boolean(options["no-cache"]),
      refreshCache: Boolean(options["refresh-cache"]),
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printPracticeSearchResult(result);
  }

  function runPracticeConfigInit(options) {
    const targetPath = options.path;
    const created = initPracticeConfig({
      targetPath,
      force: Boolean(options.force),
    });

    printHeader("Practice Config Init", ICON.config);
    console.log(`${ICON.ok} created: ${created.targetPath}`);
    console.log(`${ICON.note} use --force to overwrite existing file`);
  }

  function runPracticeConfigShow(options) {
    const configPath = options.path || options.config;
    const loaded = loadPracticeConfig({ configPath });

    if (options.json) {
      console.log(JSON.stringify({
        path: loaded.configPath,
        loadedFromDisk: loaded.loadedFromDisk,
        config: loaded.config,
      }, null, 2));
      return;
    }

    printHeader("Practice Config", ICON.config);
    console.log(`${ICON.note} path: ${loaded.configPath}`);
    console.log(`${ICON.note} source: ${loaded.loadedFromDisk ? "disk" : "default"}`);
    console.log(JSON.stringify(loaded.config, null, 2));
  }

  function runPracticeCacheStats(options) {
    const configPath = options.path || options.config;
    const loaded = loadPracticeConfig({ configPath });
    const stats = getPracticeCacheStats({
      cacheDir: loaded.config.stages.collect.cacheDir,
      configPath: loaded.configPath,
    });

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    printHeader("Practice Cache Stats", ICON.list);
    console.log(`${ICON.path} dir: ${stats.cacheDir}`);
    console.log(`${ICON.note} exists: ${stats.exists ? "yes" : "no"}`);
    console.log(`${ICON.note} files: ${stats.fileCount}`);
    console.log(`${ICON.note} size: ${formatBytes(stats.totalSizeBytes)}`);
    if (stats.newestCreatedAt) {
      console.log(`${ICON.note} newest: ${stats.newestCreatedAt}`);
    }
    if (stats.oldestCreatedAt) {
      console.log(`${ICON.note} oldest: ${stats.oldestCreatedAt}`);
    }
  }

  function runPracticeCacheClean(options) {
    const configPath = options.path || options.config;
    const olderThanHours = Number(options["older-than-hours"] || 0);
    const olderThanMs = olderThanHours > 0
      ? olderThanHours * 60 * 60 * 1000
      : 0;

    const loaded = loadPracticeConfig({ configPath });
    const cleaned = clearPracticeCache({
      cacheDir: loaded.config.stages.collect.cacheDir,
      configPath: loaded.configPath,
      olderThanMs,
      dryRun: Boolean(options["dry-run"]),
    });

    printHeader("Practice Cache Clean", ICON.uninstall);
    console.log(`${ICON.path} dir: ${cleaned.cacheDir}`);
    console.log(`${ICON.note} scanned: ${cleaned.scannedCount}`);
    console.log(`${ICON.ok} removed: ${cleaned.removedCount}`);
    console.log(`${ICON.note} kept: ${cleaned.keptCount}`);
    console.log(`${ICON.note} freed: ${formatBytes(cleaned.freedBytes)}`);
    if (cleaned.dryRun) {
      console.log(`${ICON.warn} dry-run enabled, no files were deleted`);
    }
  }

  function runPracticeCacheCommand(rest, options) {
    const action = rest[1] || "stats";
    if (action === "stats") {
      runPracticeCacheStats(options);
      return;
    }
    if (action === "clean") {
      runPracticeCacheClean(options);
      return;
    }
    throw new Error(`Unknown practice cache subcommand: ${action}`);
  }

  async function runPracticeCommand(rest, options) {
    const sub = rest[0];

    if (!sub || sub === "help") {
      printHeader("Practice Commands", ICON.practice);
      console.log(`${ICON.practice} bps practice search --input '{\"topic\":\"...\"}' [--config /path/to/config.json] [--json] [--no-cache] [--refresh-cache]`);
      console.log(`${ICON.config} bps practice config init [--path /path/to/config.json] [--force]`);
      console.log(`${ICON.config} bps practice config show [--path /path/to/config.json]`);
      console.log(`${ICON.list} bps practice cache stats [--config /path/to/config.json] [--json]`);
      console.log(`${ICON.uninstall} bps practice cache clean [--config /path/to/config.json] [--dry-run] [--older-than-hours 24]`);
      return;
    }

    if (sub === "search") {
      await runPracticeSearchCommand(rest, options);
      return;
    }

    if (sub === "cache") {
      runPracticeCacheCommand(rest, options);
      return;
    }

    if (sub === "config") {
      const action = rest[1] || "show";
      if (action === "init") {
        runPracticeConfigInit(options);
        return;
      }
      if (action === "show") {
        runPracticeConfigShow(options);
        return;
      }
      throw new Error(`Unknown practice config subcommand: ${action}`);
    }

    throw new Error(`Unknown practice subcommand: ${sub}`);
  }

  return {
    runPracticeCommand,
  };
}

module.exports = {
  createPracticeCommandRunner,
};
