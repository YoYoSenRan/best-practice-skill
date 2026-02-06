const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".bps", "cache", "practice");

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createCacheKey(payload) {
  const digest = crypto
    .createHash("sha256")
    .update(stableStringify(payload))
    .digest("hex");

  return digest;
}

function resolveCacheDir(cacheDir, configPath) {
  if (!cacheDir) {
    return DEFAULT_CACHE_DIR;
  }

  if (path.isAbsolute(cacheDir)) {
    return cacheDir;
  }

  if (configPath) {
    return path.resolve(path.dirname(configPath), cacheDir);
  }

  return path.resolve(cacheDir);
}

function getCachePath(cacheDir, key) {
  return path.join(cacheDir, `${key}.json`);
}

function safeReadJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function readCacheEntry(options = {}) {
  const cacheDir = resolveCacheDir(options.cacheDir, options.configPath);
  const key = options.key;
  const ttlMs = Number(options.ttlMs || 0);
  if (!key) {
    return null;
  }

  const filePath = getCachePath(cacheDir, key);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const payload = safeReadJson(filePath);
  if (!payload || !payload.createdAt) {
    return null;
  }

  const ageMs = Date.now() - new Date(payload.createdAt).getTime();
  if (ttlMs > 0 && ageMs > ttlMs) {
    return null;
  }

  return payload.value;
}

function writeCacheEntry(options = {}) {
  const cacheDir = resolveCacheDir(options.cacheDir, options.configPath);
  const key = options.key;
  const value = options.value;
  if (!key) {
    return;
  }

  ensureDir(cacheDir);
  const filePath = getCachePath(cacheDir, key);
  const payload = {
    key,
    createdAt: new Date().toISOString(),
    value,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function listCacheEntries(options = {}) {
  const cacheDir = resolveCacheDir(options.cacheDir, options.configPath);
  if (!fs.existsSync(cacheDir)) {
    return {
      cacheDir,
      exists: false,
      entries: [],
    };
  }

  const names = fs.readdirSync(cacheDir).filter((name) => name.endsWith(".json"));
  const entries = [];

  for (const name of names) {
    const filePath = path.join(cacheDir, name);
    const stat = fs.statSync(filePath);
    const payload = safeReadJson(filePath) || {};
    const createdAt = payload.createdAt || null;

    entries.push({
      fileName: name,
      key: payload.key || name.replace(/\.json$/i, ""),
      path: filePath,
      sizeBytes: stat.size,
      createdAt,
      ageMs: createdAt ? Math.max(0, Date.now() - new Date(createdAt).getTime()) : null,
    });
  }

  entries.sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));

  return {
    cacheDir,
    exists: true,
    entries,
  };
}

function getCacheStats(options = {}) {
  const listed = listCacheEntries(options);
  const totalSizeBytes = listed.entries.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);

  return {
    cacheDir: listed.cacheDir,
    exists: listed.exists,
    fileCount: listed.entries.length,
    totalSizeBytes,
    oldestCreatedAt: listed.entries.length > 0
      ? listed.entries[listed.entries.length - 1].createdAt
      : null,
    newestCreatedAt: listed.entries.length > 0
      ? listed.entries[0].createdAt
      : null,
  };
}

function clearCacheEntries(options = {}) {
  const listed = listCacheEntries(options);
  const dryRun = Boolean(options.dryRun);
  const olderThanMs = Number(options.olderThanMs || 0);

  if (!listed.exists) {
    return {
      cacheDir: listed.cacheDir,
      scannedCount: 0,
      removedCount: 0,
      keptCount: 0,
      freedBytes: 0,
      dryRun,
    };
  }

  let removedCount = 0;
  let keptCount = 0;
  let freedBytes = 0;

  for (const entry of listed.entries) {
    const shouldKeepByAge = olderThanMs > 0
      && (entry.ageMs === null || entry.ageMs < olderThanMs);

    if (shouldKeepByAge) {
      keptCount += 1;
      continue;
    }

    if (!dryRun) {
      fs.unlinkSync(entry.path);
    }

    removedCount += 1;
    freedBytes += Number(entry.sizeBytes || 0);
  }

  return {
    cacheDir: listed.cacheDir,
    scannedCount: listed.entries.length,
    removedCount,
    keptCount,
    freedBytes,
    dryRun,
  };
}

module.exports = {
  DEFAULT_CACHE_DIR,
  createCacheKey,
  resolveCacheDir,
  readCacheEntry,
  writeCacheEntry,
  listCacheEntries,
  getCacheStats,
  clearCacheEntries,
};
