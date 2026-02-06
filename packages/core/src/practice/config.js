const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_PRACTICE_CONFIG,
  DEFAULT_PRACTICE_CONFIG_PATH,
} = require("./defaults");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parsePracticeInput(rawInput) {
  if (!rawInput) {
    return {};
  }
  if (typeof rawInput === "object") {
    return rawInput;
  }
  try {
    return JSON.parse(rawInput);
  } catch (error) {
    throw new Error("Invalid practice --input JSON payload");
  }
}

function safeReadJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, extra) {
  if (!isObject(extra)) {
    return base;
  }

  const merged = { ...base };

  for (const [key, value] of Object.entries(extra)) {
    if (Array.isArray(value)) {
      merged[key] = [...value];
      continue;
    }

    if (isObject(value) && isObject(base[key])) {
      merged[key] = mergeConfig(base[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function normalizeSources(sources, defaultSources = []) {
  if (!Array.isArray(sources)) {
    return [];
  }

  const defaultMap = new Map(
    (Array.isArray(defaultSources) ? defaultSources : [])
      .filter((item) => isObject(item) && item.id)
      .map((item) => [String(item.id), item])
  );

  return sources
    .filter((item) => isObject(item) && item.id)
    .map((item) => {
      const base = defaultMap.get(String(item.id)) || {};
      const merged = mergeConfig(base, item);

      const domains = Array.isArray(merged.domains)
        ? merged.domains
          .map((domain) => String(domain || "").trim().toLowerCase())
          .filter(Boolean)
        : [];

      const subreddits = Array.isArray(merged.subreddits)
        ? merged.subreddits
          .map((name) => String(name || "").trim().toLowerCase())
          .filter(Boolean)
        : [];

      return {
        id: String(merged.id),
        label: String(merged.label || merged.id),
        enabled: merged.enabled !== false,
        tier: String(merged.tier || "medium"),
        provider: String(merged.provider || "hn"),
        domains,
        subreddits,
        queryPrefix: String(merged.queryPrefix || "").trim(),
        querySuffix: String(merged.querySuffix || "").trim(),
        providerOptions: isObject(merged.providerOptions) ? merged.providerOptions : {},
      };
    })
    .filter((item) => item.enabled);
}

function normalizeHookDefinition(hook) {
  if (!hook) {
    return null;
  }

  if (typeof hook === "string") {
    return {
      module: hook,
      exportName: null,
      enabled: true,
    };
  }

  if (isObject(hook) && hook.module) {
    return {
      module: String(hook.module),
      exportName: hook.exportName ? String(hook.exportName) : null,
      enabled: hook.enabled !== false,
    };
  }

  return null;
}

function normalizeHooks(hooks, defaults = {}) {
  const merged = mergeConfig(defaults || {}, isObject(hooks) ? hooks : {});
  const normalized = {};

  for (const [stage, hook] of Object.entries(merged)) {
    normalized[stage] = normalizeHookDefinition(hook);
  }

  return normalized;
}

function normalizeConfig(config) {
  const raw = isObject(config) ? config : {};
  const merged = mergeConfig(deepClone(DEFAULT_PRACTICE_CONFIG), raw);

  const rawSources = Array.isArray(raw.sources) ? raw.sources : merged.sources;
  merged.sources = normalizeSources(rawSources, DEFAULT_PRACTICE_CONFIG.sources);
  merged.hooks = normalizeHooks(raw.hooks || merged.hooks, DEFAULT_PRACTICE_CONFIG.hooks);
  return merged;
}

function loadPracticeConfig(options = {}) {
  const requestedPath = options.configPath
    ? path.resolve(options.configPath)
    : null;

  const effectivePath = requestedPath || DEFAULT_PRACTICE_CONFIG_PATH;
  const diskConfig = safeReadJson(effectivePath);

  const inlineConfig = isObject(options.inlineConfig) ? options.inlineConfig : {};
  const merged = diskConfig
    ? mergeConfig(diskConfig, inlineConfig)
    : inlineConfig;

  return {
    configPath: effectivePath,
    loadedFromDisk: Boolean(diskConfig),
    config: normalizeConfig(merged),
  };
}

function initPracticeConfig(options = {}) {
  const targetPath = options.targetPath
    ? path.resolve(options.targetPath)
    : DEFAULT_PRACTICE_CONFIG_PATH;

  if (fs.existsSync(targetPath) && !options.force) {
    throw new Error(`Config already exists: ${targetPath}. Use --force to overwrite.`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(DEFAULT_PRACTICE_CONFIG, null, 2)}\n`, "utf-8");

  return {
    targetPath,
    created: true,
  };
}

module.exports = {
  parsePracticeInput,
  loadPracticeConfig,
  initPracticeConfig,
  normalizeConfig,
  normalizeHooks,
};
