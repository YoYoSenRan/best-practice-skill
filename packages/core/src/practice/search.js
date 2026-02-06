const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

function stripTags(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function extractDomain(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch (error) {
    return "unknown";
  }
}

function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const headers = {
    "User-Agent": "best-practice-skill/0.1",
    Accept: "application/json,*/*",
    ...(options.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.get(url, { timeout: timeoutMs, headers }, (response) => {
      const statusCode = response.statusCode || 500;
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode} when requesting ${url}`));
        return;
      }

      let raw = "";
      response.setEncoding("utf-8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error(`Invalid JSON response from ${url}`));
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`Request timeout: ${url}`));
    });
    request.on("error", reject);
  });
}

async function searchStackOverflow(query, options = {}) {
  const maxResults = options.maxResults || 4;
  const minScore = Number(options.minScore || 5);
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&site=stackoverflow&pagesize=${maxResults}&q=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url, options);

  return (payload.items || [])
    .filter((item) => Number(item.score || 0) >= minScore)
    .map((item) => ({
      title: stripTags(item.title),
      url: item.link,
      snippet: "StackOverflow question",
      provider: "stackoverflow",
      publishedAt: item.creation_date
        ? new Date(Number(item.creation_date) * 1000).toISOString()
        : null,
      engagement: {
        score: Number(item.score || 0),
        answers: Number(item.answer_count || 0),
      },
    }));
}

async function searchHackerNews(query, options = {}) {
  const maxResults = options.maxResults || 4;
  const minPoints = Number(options.minPoints || 5);
  const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=${maxResults}&query=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url, options);

  return (payload.hits || [])
    .filter((item) => (item.url || item.story_url) && Number(item.points || 0) >= minPoints)
    .map((item) => ({
      title: stripTags(item.title || item.story_title || "HN Story"),
      url: item.url || item.story_url,
      snippet: "Hacker News discussion",
      provider: "hn",
      publishedAt: item.created_at || null,
      engagement: {
        points: Number(item.points || 0),
        comments: Number(item.num_comments || 0),
      },
    }));
}

async function searchReddit(query, options = {}) {
  const maxResults = options.maxResults || 4;
  const minUpvotes = Number(options.minUpvotes || 10);
  const subreddits = Array.isArray(options.subreddits) ? options.subreddits : [];

  const subredditPrefix = subreddits.length > 0
    ? `(${subreddits.map((name) => `subreddit:${name}`).join(" OR ")}) `
    : "";

  const mergedQuery = `${subredditPrefix}${query}`.trim();
  const url = `https://www.reddit.com/search.json?sort=top&t=year&limit=${maxResults}&q=${encodeURIComponent(mergedQuery)}`;
  const payload = await fetchJson(url, options);

  const posts = (((payload || {}).data || {}).children || []).map((child) => child.data || {});

  return posts
    .filter((post) => post.title && Number(post.ups || 0) >= minUpvotes)
    .map((post) => {
      const permalink = post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : `https://www.reddit.com/r/${post.subreddit || "all"}`;

      return {
        title: stripTags(post.title),
        url: permalink,
        snippet: post.selftext ? stripTags(post.selftext).slice(0, 220) : `r/${post.subreddit || "unknown"}`,
        provider: "reddit",
        publishedAt: post.created_utc
          ? new Date(Number(post.created_utc) * 1000).toISOString()
          : null,
        engagement: {
          upvotes: Number(post.ups || 0),
          comments: Number(post.num_comments || 0),
        },
      };
    });
}

async function searchGitHub(query, options = {}) {
  const maxResults = options.maxResults || 4;
  const minStars = Number(options.minStars || 300);
  const normalizedQuery = /stars:\s*>/.test(query)
    ? query
    : `${query} stars:>${minStars}`;

  const url = `https://api.github.com/search/repositories?per_page=${maxResults}&sort=stars&order=desc&q=${encodeURIComponent(normalizedQuery)}`;
  const payload = await fetchJson(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  return (payload.items || [])
    .filter((item) => Number(item.stargazers_count || 0) >= minStars)
    .map((item) => ({
      title: stripTags(item.full_name || item.name || "GitHub Repository"),
      url: item.html_url,
      snippet: stripTags(item.description || ""),
      provider: "github",
      publishedAt: item.updated_at || null,
      engagement: {
        stars: Number(item.stargazers_count || 0),
        forks: Number(item.forks_count || 0),
      },
    }));
}

const OFFICIAL_DOC_INDEX = [
  {
    title: "Node.js - Errors",
    url: "https://nodejs.org/api/errors.html",
    tags: ["node", "node.js", "error", "exception", "handling"],
    snippet: "Node.js official API reference for errors and exception handling.",
  },
  {
    title: "Node.js - Diagnostics Channel",
    url: "https://nodejs.org/api/diagnostics_channel.html",
    tags: ["node", "observability", "tracing", "diagnostics"],
    snippet: "Node.js diagnostics_channel for observability and instrumentation.",
  },
  {
    title: "TypeScript Handbook",
    url: "https://www.typescriptlang.org/docs/",
    tags: ["typescript", "ts", "types", "api", "design"],
    snippet: "TypeScript official handbook and language guides.",
  },
  {
    title: "TypeScript TSConfig Reference",
    url: "https://www.typescriptlang.org/tsconfig",
    tags: ["typescript", "strict", "compiler", "tsconfig"],
    snippet: "TypeScript compiler options and strictness best practices.",
  },
  {
    title: "MDN JavaScript Guide",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    tags: ["javascript", "js", "best", "practice", "guide"],
    snippet: "MDN JavaScript guide with language and runtime best practices.",
  },
  {
    title: "React Docs - Learn",
    url: "https://react.dev/learn",
    tags: ["react", "component", "hooks", "state", "forms"],
    snippet: "React official learning materials and recommended patterns.",
  },
  {
    title: "Next.js Docs - App Router",
    url: "https://nextjs.org/docs/app",
    tags: ["next", "react", "routing", "server", "app-router"],
    snippet: "Next.js app router architecture and production best practices.",
  },
  {
    title: "Vue Docs - Guide",
    url: "https://vuejs.org/guide/introduction.html",
    tags: ["vue", "composition", "api", "component", "forms"],
    snippet: "Vue official guide and composition API best practices.",
  },
  {
    title: "Nuxt Docs",
    url: "https://nuxt.com/docs",
    tags: ["nuxt", "vue", "routing", "ssr", "performance"],
    snippet: "Nuxt documentation for architecture and deployment best practices.",
  },
  {
    title: "NestJS Documentation",
    url: "https://docs.nestjs.com/",
    tags: ["nest", "node", "architecture", "testing", "api"],
    snippet: "NestJS official documentation for modular backend architecture.",
  },
  {
    title: "Python Docs",
    url: "https://docs.python.org/3/",
    tags: ["python", "standard-library", "typing", "async"],
    snippet: "Python official documentation and standard library references.",
  },
  {
    title: "FastAPI Documentation",
    url: "https://fastapi.tiangolo.com/",
    tags: ["fastapi", "python", "api", "validation", "async"],
    snippet: "FastAPI official documentation for API design and validation.",
  },
  {
    title: "Django Documentation",
    url: "https://docs.djangoproject.com/",
    tags: ["django", "python", "orm", "security", "testing"],
    snippet: "Django official docs with patterns for security and maintainability.",
  },
  {
    title: "Go Documentation",
    url: "https://go.dev/doc/",
    tags: ["go", "golang", "concurrency", "context", "testing"],
    snippet: "Go official docs and effective Go best practices.",
  },
  {
    title: "Rust Book",
    url: "https://doc.rust-lang.org/book/",
    tags: ["rust", "ownership", "error", "design", "testing"],
    snippet: "The Rust Programming Language book and idiomatic patterns.",
  },
  {
    title: "Spring Framework Reference",
    url: "https://docs.spring.io/spring-framework/reference/",
    tags: ["spring", "java", "dependency injection", "transaction", "testing"],
    snippet: "Spring framework reference for enterprise Java best practices.",
  },
  {
    title: "PostgreSQL Documentation",
    url: "https://www.postgresql.org/docs/",
    tags: ["postgres", "sql", "index", "performance", "transaction"],
    snippet: "PostgreSQL official docs for query and schema best practices.",
  },
  {
    title: "Redis Documentation",
    url: "https://redis.io/docs/latest/",
    tags: ["redis", "cache", "data", "performance", "persistence"],
    snippet: "Redis official docs for caching patterns and reliability.",
  },
  {
    title: "Docker Documentation",
    url: "https://docs.docker.com/",
    tags: ["docker", "container", "security", "build", "deployment"],
    snippet: "Docker documentation for image build and runtime best practices.",
  },
  {
    title: "Kubernetes Documentation",
    url: "https://kubernetes.io/docs/home/",
    tags: ["kubernetes", "k8s", "cluster", "deployment", "reliability"],
    snippet: "Kubernetes official documentation and production guides.",
  },
  {
    title: "AWS Well-Architected Framework",
    url: "https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html",
    tags: ["aws", "cloud", "architecture", "reliability", "security"],
    snippet: "AWS official architecture framework for reliability and operations.",
  },
  {
    title: "Google Cloud Architecture Framework",
    url: "https://cloud.google.com/architecture/framework",
    tags: ["gcp", "google", "cloud", "architecture", "operations"],
    snippet: "Google Cloud architecture best practices and recommendations.",
  },
  {
    title: "Azure Architecture Center",
    url: "https://learn.microsoft.com/en-us/azure/architecture/",
    tags: ["azure", "cloud", "architecture", "operations", "security"],
    snippet: "Azure architecture guidance for scalable and reliable systems.",
  },
];

const DEFAULT_STACK_TAGS = {
  "react|next": ["react", "hooks", "state", "component", "next"],
  "vue|nuxt": ["vue", "nuxt", "composition", "reactivity"],
  "node|express|nest": ["node", "api", "backend", "error", "observability"],
  "typescript|ts": ["typescript", "types", "strict", "compiler"],
  "python|django|fastapi": ["python", "django", "fastapi", "async", "validation"],
  "java|spring": ["java", "spring", "transaction", "dependency"],
  "go|golang": ["go", "golang", "concurrency", "context"],
  "kubernetes|k8s|docker": ["kubernetes", "k8s", "docker", "container", "deployment"],
  "aws|gcp|azure|cloud": ["cloud", "aws", "gcp", "azure", "architecture"],
};

const OFFICIAL_INDEX_FILE_CACHE = new Map();

function normalizeOfficialEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!raw.title || !raw.url) {
    return null;
  }

  return {
    title: String(raw.title).trim(),
    url: String(raw.url).trim(),
    snippet: String(raw.snippet || "").trim(),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [],
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : null,
    priority: Number(raw.priority || 0),
  };
}

function dedupeOfficialEntries(entries) {
  const table = new Map();
  for (const entry of entries) {
    if (!entry || !entry.url) {
      continue;
    }
    if (!table.has(entry.url)) {
      table.set(entry.url, entry);
      continue;
    }

    const existing = table.get(entry.url);
    if ((entry.priority || 0) >= (existing.priority || 0)) {
      table.set(entry.url, entry);
    }
  }
  return Array.from(table.values());
}

function parseOfficialIndexPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.entries)) {
    return payload.entries;
  }
  return [];
}

function loadOfficialIndexFromPath(indexPath) {
  const absolutePath = path.resolve(indexPath);
  const stat = fs.statSync(absolutePath);
  const cache = OFFICIAL_INDEX_FILE_CACHE.get(absolutePath);
  if (cache && cache.mtimeMs === stat.mtimeMs) {
    return cache.entries;
  }

  const text = fs.readFileSync(absolutePath, "utf-8");
  const payload = JSON.parse(text);
  const entries = parseOfficialIndexPayload(payload)
    .map((item) => normalizeOfficialEntry(item))
    .filter(Boolean);

  OFFICIAL_INDEX_FILE_CACHE.set(absolutePath, {
    mtimeMs: stat.mtimeMs,
    entries,
  });

  return entries;
}

function inferStackTokens(stack, profiles) {
  const stackText = String(stack || "").toLowerCase();
  if (!stackText) {
    return [];
  }

  const resolvedProfiles = profiles && typeof profiles === "object"
    ? profiles
    : DEFAULT_STACK_TAGS;

  const tokens = [];
  for (const [matcher, values] of Object.entries(resolvedProfiles)) {
    const aliases = String(matcher)
      .split("|")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (aliases.some((alias) => stackText.includes(alias))) {
      if (Array.isArray(values)) {
        tokens.push(...values.map((item) => String(item).trim().toLowerCase()));
      }
    }
  }

  return Array.from(new Set(tokens.filter(Boolean)));
}

function resolveOfficialOptions(options = {}) {
  const nested = options.officialDocs && typeof options.officialDocs === "object"
    ? options.officialDocs
    : {};
  return {
    ...nested,
    ...options,
  };
}

function scoreOfficialEntry(entry, queryTokens, stackTokens, stackBoostWeight = 0.2) {
  const tagSet = new Set([
    ...(entry.tags || []).map((item) => item.toLowerCase()),
    ...tokenize(entry.title),
    ...tokenize(entry.snippet),
  ]);

  const queryHits = queryTokens.filter((token) => tagSet.has(token));
  const queryScore = queryTokens.length > 0
    ? queryHits.length / queryTokens.length
    : 0;

  const stackHits = stackTokens.filter((token) => tagSet.has(token));
  const stackScore = stackTokens.length > 0
    ? stackHits.length / stackTokens.length
    : 0;

  const priorityBoost = Math.max(0, Number(entry.priority || 0));
  return queryScore * (1 - stackBoostWeight) + stackScore * stackBoostWeight + priorityBoost;
}

function getOfficialDocIndex(options = {}) {
  const merged = resolveOfficialOptions(options);
  const mergeDefaultIndex = merged.mergeDefaultIndex !== false;
  const inlineIndex = Array.isArray(merged.index) ? merged.index : [];

  let fileEntries = [];
  if (merged.indexPath) {
    try {
      fileEntries = loadOfficialIndexFromPath(String(merged.indexPath));
    } catch (error) {
      fileEntries = [];
    }
  }

  const mergedEntries = [
    ...(mergeDefaultIndex ? OFFICIAL_DOC_INDEX : []),
    ...fileEntries,
    ...inlineIndex,
  ]
    .map((item) => normalizeOfficialEntry(item))
    .filter(Boolean);

  return dedupeOfficialEntries(mergedEntries);
}

async function searchOfficialDocs(query, options = {}) {
  const officialOptions = resolveOfficialOptions(options);
  const maxResults = Number(officialOptions.maxResults || 4);
  const minScore = Number(officialOptions.minScore || 0.2);
  const stackBoostWeight = Number(officialOptions.stackBoostWeight || 0.2);

  const queryTokens = tokenize([
    query,
    officialOptions.topic || "",
    officialOptions.objective || "",
  ].join(" ")).filter((token) => !token.startsWith("site"));

  const stackTokens = inferStackTokens(
    officialOptions.stack,
    officialOptions.stackProfiles
  );

  return getOfficialDocIndex(officialOptions)
    .map((entry) => ({
      ...entry,
      matchScore: scoreOfficialEntry(entry, queryTokens, stackTokens, stackBoostWeight),
    }))
    .filter((entry) => entry.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults)
    .map((entry) => ({
      title: entry.title,
      url: entry.url,
      snippet: `${entry.snippet} Tags: ${(entry.tags || []).join(", ")}`,
      provider: "official-docs",
      publishedAt: entry.publishedAt || null,
      engagement: {
        score: entry.matchScore,
      },
    }));
}

const PROVIDERS = {
  "official-docs": searchOfficialDocs,
  stackoverflow: searchStackOverflow,
  hn: searchHackerNews,
  reddit: searchReddit,
  github: searchGitHub,
};

async function searchByProvider(provider, query, options = {}) {
  const handler = PROVIDERS[provider];
  if (!handler) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const rows = await handler(query, options);
  return rows.map((item) => ({
    ...item,
    domain: extractDomain(item.url),
  }));
}

module.exports = {
  searchByProvider,
  extractDomain,
};
