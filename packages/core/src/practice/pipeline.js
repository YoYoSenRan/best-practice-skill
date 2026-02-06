const path = require("node:path");

const { parsePracticeInput, loadPracticeConfig } = require("./config");
const { searchByProvider } = require("./search");
const { enrichRankedResults, buildEvidenceChain } = require("./enrich");
const {
  createCacheKey,
  resolveCacheDir,
  readCacheEntry,
  writeCacheEntry,
} = require("./cache");

function normalizeTopic(input, config) {
  const topic = String(input.topic || "").trim();
  if (!topic && config.stages.intent.requiredTopic) {
    throw new Error("practice search requires input.topic");
  }
  return topic;
}

function normalizeStack(input) {
  return String(input.stack || "").trim();
}

function normalizeObjective(input, config) {
  const objective = String(input.objective || "").trim();
  if (objective) {
    return objective;
  }
  return config.stages.intent.fallbackObjective || "实现高质量代码";
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

const TOPIC_STOPWORDS = new Set([
  "best",
  "practice",
  "practices",
  "code",
  "coding",
  "api",
  "apis",
  "design",
  "architecture",
  "implementation",
  "guide",
  "guideline",
  "js",
  "ts",
]);

function filterMeaningfulTokens(tokens) {
  return tokens.filter((token) => !TOPIC_STOPWORDS.has(token));
}

function renderTemplate(template, variables) {
  return String(template || "")
    .replace(/\{\{\s*topic\s*\}\}/g, variables.topic)
    .replace(/\{\{\s*stack\s*\}\}/g, variables.stack)
    .replace(/\{\{\s*objective\s*\}\}/g, variables.objective)
    .replace(/\{\{\s*keyword\s*\}\}/g, variables.keyword || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildExpansionKeywords(context, stage) {
  if (stage.enableExpansion === false) {
    return [];
  }

  const profileMap = stage.stackProfiles && typeof stage.stackProfiles === "object"
    ? stage.stackProfiles
    : {};

  const haystack = `${context.stack} ${context.topic}`.toLowerCase();
  const tokens = [];

  for (const [matcher, values] of Object.entries(profileMap)) {
    const aliases = String(matcher)
      .split("|")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (aliases.length === 0 || !aliases.some((item) => haystack.includes(item))) {
      continue;
    }

    if (Array.isArray(values)) {
      tokens.push(...values.map((item) => String(item).trim()));
    }
  }

  const topicTokens = filterMeaningfulTokens(tokenize(context.topic));
  const all = uniqueValues([
    ...tokens,
    ...topicTokens,
  ]);

  const maxExpansionKeywords = Number(stage.maxExpansionKeywords || 0);
  if (maxExpansionKeywords <= 0) {
    return [];
  }

  return all.slice(0, maxExpansionKeywords);
}

function buildQueries(context, config) {
  const stage = config.stages.query || {};
  const templates = Array.isArray(stage.templates) ? stage.templates : [];
  const extraKeywords = Array.isArray(stage.extraKeywords)
    ? stage.extraKeywords.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const baseQueries = templates.map((template) => renderTemplate(template, context));

  if (extraKeywords.length > 0) {
    baseQueries.push(`${context.topic} ${context.stack} ${extraKeywords.join(" ")}`.trim());
  }

  const expansionKeywords = buildExpansionKeywords(context, stage);
  const expansionTemplates = Array.isArray(stage.expansionTemplates)
    ? stage.expansionTemplates
    : [];

  for (const keyword of expansionKeywords) {
    for (const template of expansionTemplates) {
      const query = renderTemplate(template, {
        ...context,
        keyword,
      });
      if (query) {
        baseQueries.push(query);
      }
    }
  }

  const deduped = uniqueValues(baseQueries);
  const maxQueries = Number(stage.maxQueries || 6);

  return deduped.slice(0, maxQueries);
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) {
    return null;
  }
  return ts;
}

function estimateRecencyScore(publishedAt) {
  const ts = parseDate(publishedAt);
  if (!ts) {
    return 0.45;
  }

  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 30) {
    return 1;
  }
  if (days <= 90) {
    return 0.85;
  }
  if (days <= 180) {
    return 0.72;
  }
  if (days <= 365) {
    return 0.58;
  }
  return 0.4;
}

function computeRelevanceScore(docText, topicKeywords) {
  const tokens = tokenize(docText);
  if (tokens.length === 0 || topicKeywords.length === 0) {
    return 0;
  }

  const tokenSet = new Set(tokens);
  const hits = topicKeywords.filter((keyword) => tokenSet.has(keyword));
  return Math.min(1, hits.length / topicKeywords.length);
}

function getAuthorityScore(domain, source, config) {
  const domainAuthority = config.domainAuthority || {};
  if (domainAuthority[domain] !== undefined) {
    return Number(domainAuthority[domain]);
  }

  const authorityByTier = (config.stages.score || {}).authorityByTier || {};
  if (authorityByTier[source.tier] !== undefined) {
    return Number(authorityByTier[source.tier]);
  }

  return 0.6;
}

function domainAllowed(domain, sourceDomains) {
  if (!Array.isArray(sourceDomains) || sourceDomains.length === 0) {
    return true;
  }
  return sourceDomains.some((allowedDomain) => {
    return domain === allowedDomain || domain.endsWith(`.${allowedDomain}`);
  });
}

function buildSearchRequests(queries, config) {
  const sources = config.sources || [];
  const collectStage = config.stages.collect || {};
  const maxRequests = Number(collectStage.maxRequests || 10);
  const providerOrder = Array.isArray(collectStage.providers)
    ? collectStage.providers.map((item) => String(item || "").trim().toLowerCase())
    : [];

  const allowedProviders = providerOrder.length > 0
    ? new Set(providerOrder)
    : null;

  const rankMap = new Map(providerOrder.map((provider, index) => [provider, index]));
  const orderedSources = [...sources].sort((left, right) => {
    const leftProvider = String(left.provider || "").toLowerCase();
    const rightProvider = String(right.provider || "").toLowerCase();
    const leftRank = rankMap.has(leftProvider) ? rankMap.get(leftProvider) : Number.MAX_SAFE_INTEGER;
    const rightRank = rankMap.has(rightProvider) ? rankMap.get(rightProvider) : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return String(left.id).localeCompare(String(right.id));
  });

  const requests = [];

  for (const source of orderedSources) {
    if (allowedProviders && !allowedProviders.has(String(source.provider || "").toLowerCase())) {
      continue;
    }

    for (const query of queries) {
      const effectiveQuery = `${source.queryPrefix || ""} ${query} ${source.querySuffix || ""}`
        .replace(/\s+/g, " ")
        .trim();

      requests.push({
        sourceId: source.id,
        sourceTier: source.tier,
        sourceLabel: source.label,
        sourceProvider: source.provider,
        sourceDomains: source.domains || [],
        sourceSubreddits: source.subreddits || [],
        sourceProviderOptions: source.providerOptions || {},
        query: effectiveQuery,
      });

      if (requests.length >= maxRequests) {
        return requests;
      }
    }
  }

  return requests;
}

function dedupeResults(results) {
  const table = new Map();
  for (const item of results) {
    const key = item.url;
    if (!table.has(key)) {
      table.set(key, item);
      continue;
    }

    const existing = table.get(key);
    if ((item.totalScore || 0) > (existing.totalScore || 0)) {
      table.set(key, item);
    }
  }
  return Array.from(table.values());
}

function limitResultsByDomain(results, maxPerDomain) {
  const domainCount = new Map();
  const output = [];

  for (const item of results) {
    const count = domainCount.get(item.domain) || 0;
    if (count >= maxPerDomain) {
      continue;
    }
    output.push(item);
    domainCount.set(item.domain, count + 1);
  }

  return output;
}

function generateHighlights(results) {
  const top = results.slice(0, 5);
  return top.map((item, index) => {
    return `${index + 1}. ${item.title}（${item.domain}，score ${item.totalScore.toFixed(2)}）`;
  });
}

function generateRecommendations(results) {
  const official = results.filter((item) => item.sourceTier === "official");
  const community = results.filter((item) => item.sourceTier !== "official");

  const recommendations = [];

  if (official.length > 0) {
    recommendations.push("优先采纳官方文档中的约束、API边界与升级建议");
  }
  if (community.length > 0) {
    recommendations.push("将社区高票经验与官方建议交叉验证后再落地");
  }
  recommendations.push("实现前先写失败场景与回归检查清单，避免只看 happy path");

  return recommendations;
}

function generatePromptDraft(context, results, evidenceChain = []) {
  const topLinks = results.slice(0, 5).map((item) => `- ${item.title} (${item.url})`);
  const evidenceLines = evidenceChain.slice(0, 3).map((item, index) => {
    return `${index + 1}. ${item.excerpt} (${item.url})`;
  });

  return [
    "你是资深全栈工程师，请基于以下高质量资料实现需求。",
    `主题：${context.topic}`,
    `技术栈：${context.stack || "未指定"}`,
    `目标：${context.objective}`,
    "",
    "参考资料（按质量排序）：",
    ...topLinks,
    "",
    "证据片段：",
    ...(evidenceLines.length > 0 ? evidenceLines : ["暂无正文证据片段，可先基于链接做初步方案"]),
    "",
    "输出要求：",
    "1) 给出最小可行实现方案（含边界）",
    "2) 列出 Do / Don't",
    "3) 给出测试与回归清单",
    "4) 明确可能的版本兼容风险",
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWithRetry(task, options = {}) {
  const retries = Number(options.retries || 0);
  const retryDelayMs = Number(options.retryDelayMs || 300);
  const retryBackoffFactor = Number(options.retryBackoffFactor || 2);

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const value = await task(attempt);
      return {
        value,
        retryUsed: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }

      const delay = Math.round(retryDelayMs * (retryBackoffFactor ** attempt));
      if (delay > 0) {
        await sleep(delay);
      }
      attempt += 1;
    }
  }

  throw lastError || new Error("Unknown retry failure");
}

function resolveHookFunction(hookDef, configPath) {
  if (!hookDef || hookDef.enabled === false || !hookDef.module) {
    return null;
  }

  const modulePath = path.isAbsolute(hookDef.module)
    ? hookDef.module
    : path.resolve(path.dirname(configPath), hookDef.module);

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const loaded = require(modulePath);
  const exportName = hookDef.exportName || "default";
  let fn;

  if (hookDef.exportName) {
    fn = loaded[hookDef.exportName];
  } else if (typeof loaded === "function") {
    fn = loaded;
  } else {
    fn = loaded.default;
  }

  if (typeof fn !== "function") {
    throw new Error(`Hook function not found: ${modulePath}#${exportName}`);
  }

  return {
    fn,
    modulePath,
    exportName,
  };
}

async function applyHook(stageName, payload, runtime) {
  const hookDef = ((runtime.config || {}).hooks || {})[stageName];
  if (!hookDef) {
    return payload;
  }

  try {
    const resolved = resolveHookFunction(hookDef, runtime.configPath);
    if (!resolved) {
      return payload;
    }

    const nextPayload = await Promise.resolve(
      resolved.fn(payload, {
        stage: stageName,
        topic: runtime.context.topic,
        stack: runtime.context.stack,
        objective: runtime.context.objective,
        config: runtime.config,
      })
    );

    runtime.hooks.executed.push({
      stage: stageName,
      modulePath: resolved.modulePath,
      exportName: resolved.exportName,
    });

    if (nextPayload && typeof nextPayload === "object") {
      return nextPayload;
    }

    return payload;
  } catch (error) {
    runtime.hooks.failed.push({
      stage: stageName,
      message: error.message,
    });
    return payload;
  }
}

async function runPracticeSearch(rawInput, options = {}) {
  const input = parsePracticeInput(rawInput);
  const loaded = loadPracticeConfig({
    configPath: options.configPath,
    inlineConfig: input.config,
  });
  const config = loaded.config;

  const runtime = {
    config,
    configPath: loaded.configPath,
    context: {
      topic: normalizeTopic(input, config),
      stack: normalizeStack(input),
      objective: normalizeObjective(input, config),
    },
    hooks: {
      executed: [],
      failed: [],
    },
  };

  let afterIntentPayload = await applyHook("afterIntent", {
    context: runtime.context,
    input,
  }, runtime);
  if (afterIntentPayload.context) {
    runtime.context = afterIntentPayload.context;
  }

  let queries = buildQueries(runtime.context, config);
  const afterQueryPayload = await applyHook("afterQuery", {
    context: runtime.context,
    queries,
  }, runtime);
  if (Array.isArray(afterQueryPayload.queries)) {
    queries = afterQueryPayload.queries;
  }

  const requests = buildSearchRequests(queries, config);
  const collectStage = config.stages.collect || {};
  const timeoutMs = Number(collectStage.timeoutMs || 5000);
  const perProviderResults = Number(collectStage.perProviderResults || 4);
  const retries = Number(collectStage.retries || 0);
  const retryDelayMs = Number(collectStage.retryDelayMs || 320);
  const retryBackoffFactor = Number(collectStage.retryBackoffFactor || 2);
  const noCache = Boolean(options.noCache || options.cache === false);
  const refreshCache = Boolean(options.refreshCache);
  const cacheEnabled = collectStage.cacheEnabled !== false && !noCache;
  const cacheReadEnabled = cacheEnabled && !refreshCache;
  const cacheTtlMs = Number(collectStage.cacheTtlMs || 1000 * 60 * 60 * 24);
  const cacheVersion = Number(collectStage.cacheVersion || 1);
  const resolvedCacheDir = resolveCacheDir(collectStage.cacheDir, loaded.configPath);
  const officialDocsConfig = collectStage.officialDocs && typeof collectStage.officialDocs === "object"
    ? collectStage.officialDocs
    : {};
  const resolvedOfficialDocsIndexPath = officialDocsConfig.indexPath
    ? (path.isAbsolute(officialDocsConfig.indexPath)
      ? officialDocsConfig.indexPath
      : path.resolve(path.dirname(loaded.configPath), officialDocsConfig.indexPath))
    : null;

  const sourceMap = new Map((config.sources || []).map((item) => [item.id, item]));
  const topicKeywords = uniqueValues(tokenize(`${runtime.context.topic} ${runtime.context.stack}`));
  const topicCoreKeywords = uniqueValues(filterMeaningfulTokens(tokenize(runtime.context.topic)));
  const coverageKeywords = topicCoreKeywords.length > 0 ? topicCoreKeywords : topicKeywords;

  let collected = [];
  let errors = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let retryUsedCount = 0;

  for (const request of requests) {
    try {
      const providerCacheOptions = request.sourceProvider === "official-docs"
        ? {
          ...(request.sourceProviderOptions || {}),
          stack: runtime.context.stack,
          topic: runtime.context.topic,
          objective: runtime.context.objective,
          indexPath: resolvedOfficialDocsIndexPath,
          stackBoostWeight: officialDocsConfig.stackBoostWeight,
        }
        : request.sourceProviderOptions;

      const cacheKey = createCacheKey({
        cacheVersion,
        provider: request.sourceProvider,
        query: request.query,
        subreddits: request.sourceSubreddits,
        options: providerCacheOptions,
        maxResults: perProviderResults,
      });

      let rows = null;
      let fetchedFromCache = false;

      if (cacheReadEnabled) {
        const cached = readCacheEntry({
          key: cacheKey,
          ttlMs: cacheTtlMs,
          cacheDir: resolvedCacheDir,
        });

        if (Array.isArray(cached)) {
          rows = cached;
          fetchedFromCache = true;
          cacheHitCount += 1;
        }
      }

      if (!rows) {
        cacheMissCount += 1;
        const fetched = await runWithRetry(
          () => searchByProvider(request.sourceProvider, request.query, {
            timeoutMs,
            maxResults: perProviderResults,
            subreddits: request.sourceSubreddits,
            officialDocs: {
              ...officialDocsConfig,
              indexPath: resolvedOfficialDocsIndexPath,
              topic: runtime.context.topic,
              stack: runtime.context.stack,
              objective: runtime.context.objective,
            },
            ...(request.sourceProviderOptions || {}),
          }),
          {
            retries,
            retryDelayMs,
            retryBackoffFactor,
          }
        );

        rows = fetched.value;
        retryUsedCount += Number(fetched.retryUsed || 0);

        if (cacheEnabled) {
          writeCacheEntry({
            key: cacheKey,
            value: rows,
            cacheDir: resolvedCacheDir,
          });
        }
      }

      for (const row of rows) {
        const source = sourceMap.get(request.sourceId) || {
          id: request.sourceId,
          tier: "medium",
          label: request.sourceLabel,
        };

        if (!domainAllowed(row.domain, request.sourceDomains)) {
          continue;
        }

        const authorityScore = getAuthorityScore(row.domain, source, config);
        const recencyScore = estimateRecencyScore(row.publishedAt);
        const docText = `${row.title} ${row.snippet}`;
        const relevanceScore = computeRelevanceScore(docText, topicKeywords);
        const topicCoverage = computeRelevanceScore(docText, coverageKeywords);

        const weights = (config.stages.score || {}).weights || {};
        const totalScore = (
          authorityScore * Number(weights.authority || 0.45)
          + recencyScore * Number(weights.recency || 0.2)
          + relevanceScore * Number(weights.relevance || 0.35)
        );

        collected.push({
          title: row.title,
          url: row.url,
          snippet: row.snippet,
          domain: row.domain,
          query: request.query,
          sourceId: source.id,
          sourceTier: source.tier,
          sourceLabel: source.label,
          provider: row.provider,
          publishedAt: row.publishedAt,
          engagement: row.engagement || {},
          score: {
            authority: authorityScore,
            recency: recencyScore,
            relevance: relevanceScore,
            topicCoverage,
          },
          totalScore,
          fetchedFromCache,
          evidence: [],
        });
      }
    } catch (error) {
      errors.push({
        query: request.query,
        sourceId: request.sourceId,
        provider: request.sourceProvider,
        message: error.message,
      });
    }
  }

  const afterCollectPayload = await applyHook("afterCollect", {
    context: runtime.context,
    queries,
    collected,
    errors,
  }, runtime);
  if (Array.isArray(afterCollectPayload.collected)) {
    collected = afterCollectPayload.collected;
  }
  if (Array.isArray(afterCollectPayload.errors)) {
    errors = afterCollectPayload.errors;
  }

  const minimumScore = Number((config.stages.score || {}).minimumScore || 0.35);
  const minimumRelevance = Number((config.stages.score || {}).minimumRelevance || 0.25);
  const minimumTopicCoverage = Number((config.stages.score || {}).minimumTopicCoverage || 0.34);
  const synthesizeStage = config.stages.synthesize || {};
  const topN = Number(input.maxResults || synthesizeStage.topN || 8);
  const maxPerDomain = Number(synthesizeStage.maxPerDomain || 2);

  let ranked = dedupeResults(collected)
    .filter((item) => item.totalScore >= minimumScore)
    .filter((item) => item.score.relevance >= minimumRelevance)
    .filter((item) => item.score.topicCoverage >= minimumTopicCoverage)
    .sort((a, b) => b.totalScore - a.totalScore);

  ranked = limitResultsByDomain(ranked, maxPerDomain).slice(0, topN);

  const afterRankPayload = await applyHook("afterRank", {
    context: runtime.context,
    ranked,
    collected,
  }, runtime);
  if (Array.isArray(afterRankPayload.ranked)) {
    ranked = afterRankPayload.ranked;
  }

  const enrichResult = await enrichRankedResults(
    ranked,
    {
      keywords: coverageKeywords,
    },
    config.stages.enrich || {}
  );
  ranked = enrichResult.results;
  errors = [
    ...errors,
    ...enrichResult.errors.map((item) => ({
      sourceId: "enrich",
      provider: "fetch",
      query: item.url,
      message: item.message,
    })),
  ];

  const evidenceChain = buildEvidenceChain(ranked, {
    maxItems: 5,
    maxEvidencePerItem: 1,
  });

  const summary = {
    highlights: generateHighlights(ranked),
    recommendations: generateRecommendations(ranked),
    evidenceChain,
  };

  let result = {
    type: "practice_report",
    topic: runtime.context.topic,
    stack: runtime.context.stack,
    objective: runtime.context.objective,
    config: {
      path: loaded.configPath,
      loadedFromDisk: loaded.loadedFromDisk,
      sourceCount: (config.sources || []).length,
      stageKeys: Object.keys(config.stages || {}),
      cacheEnabled,
      cacheReadEnabled,
      refreshCache,
      cacheTtlMs,
      cacheVersion,
      cacheDir: resolvedCacheDir,
      officialDocsIndexPath: resolvedOfficialDocsIndexPath,
    },
    execution: {
      queryCount: queries.length,
      requestCount: requests.length,
      collectedCount: collected.length,
      rankedCount: ranked.length,
      fetchedForEvidence: enrichResult.fetchedCount,
      cacheHitCount,
      cacheMissCount,
      cacheBypass: noCache,
      cacheRefresh: refreshCache,
      retryUsedCount,
      errorCount: errors.length,
      generatedAt: new Date().toISOString(),
      hooksExecuted: runtime.hooks.executed.length,
      hooksFailed: runtime.hooks.failed.length,
    },
    queries,
    results: ranked,
    summary,
    prompts: {
      codex: synthesizeStage.includePromptDraft
        ? generatePromptDraft(runtime.context, ranked, evidenceChain)
        : "",
      claude: synthesizeStage.includePromptDraft
        ? generatePromptDraft(runtime.context, ranked, evidenceChain)
        : "",
    },
    hooks: runtime.hooks,
    errors,
  };

  const beforeReturnPayload = await applyHook("beforeReturn", {
    result,
    context: runtime.context,
  }, runtime);
  if (beforeReturnPayload.result && typeof beforeReturnPayload.result === "object") {
    result = beforeReturnPayload.result;
  }

  result.hooks = runtime.hooks;
  return result;
}

module.exports = {
  runPracticeSearch,
};
