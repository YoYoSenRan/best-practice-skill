const os = require("node:os");
const path = require("node:path");

const DEFAULT_PRACTICE_CONFIG_PATH = path.join(
  os.homedir(),
  ".bps",
  "practice.config.json"
);

const DEFAULT_QUERY_STACK_PROFILES = {
  "react|next": ["hooks", "state management", "performance", "rendering"],
  "vue|nuxt": ["composition api", "reactivity", "state management", "performance"],
  "node|express|nest": ["error handling", "observability", "api design", "testing"],
  "typescript|ts": ["type safety", "api design", "strict mode", "tooling"],
  "python|django|fastapi": ["dependency injection", "testing", "api design", "async"],
  "java|spring": ["transaction", "layered architecture", "testing", "exception handling"],
  "go|golang": ["concurrency", "context", "error handling", "testing"],
  "kubernetes|k8s|docker": ["deployment", "observability", "security", "scaling"],
};

const DEFAULT_PRACTICE_CONFIG = {
  version: 1,
  stages: {
    intent: {
      requiredTopic: true,
      fallbackObjective: "实现高质量、可维护、可测试的代码方案",
    },
    query: {
      maxQueries: 7,
      templates: [
        "{{topic}} {{stack}} best practices",
        "{{topic}} {{stack}} architecture",
        "{{topic}} {{stack}} error handling",
        "{{topic}} {{stack}} testing strategy",
      ],
      extraKeywords: [],
      enableExpansion: true,
      maxExpansionKeywords: 3,
      expansionTemplates: [
        "{{topic}} {{stack}} {{keyword}} best practices",
        "{{topic}} {{stack}} {{keyword}} common pitfalls",
      ],
      stackProfiles: DEFAULT_QUERY_STACK_PROFILES,
    },
    collect: {
      maxRequests: 12,
      perProviderResults: 4,
      timeoutMs: 5000,
      retries: 2,
      retryDelayMs: 320,
      retryBackoffFactor: 2,
      cacheEnabled: true,
      cacheTtlMs: 1000 * 60 * 60 * 24,
      cacheVersion: 3,
      providers: ["official-docs", "stackoverflow", "hn", "reddit", "github"],
      officialDocs: {
        mergeDefaultIndex: true,
        indexPath: null,
        index: [],
        stackBoostWeight: 0.2,
      },
    },
    score: {
      weights: {
        authority: 0.45,
        recency: 0.2,
        relevance: 0.35,
      },
      minimumScore: 0.35,
      minimumRelevance: 0.25,
      minimumTopicCoverage: 0.3,
      authorityByTier: {
        official: 0.95,
        high: 0.8,
        medium: 0.65,
      },
    },
    enrich: {
      enabled: true,
      maxFetch: 3,
      timeoutMs: 5000,
      maxEvidencePerResult: 2,
      minCoverage: 0.2,
      maxSentenceLength: 240,
    },
    synthesize: {
      topN: 8,
      maxPerDomain: 2,
      includePromptDraft: true,
    },
  },
  hooks: {
    afterIntent: null,
    afterQuery: null,
    afterCollect: null,
    afterRank: null,
    beforeReturn: null,
  },
  sources: [
    {
      id: "stackoverflow-best",
      label: "Stack Overflow",
      enabled: true,
      tier: "high",
      provider: "stackoverflow",
      domains: ["stackoverflow.com"],
      providerOptions: {
        minScore: 8,
      },
    },
    {
      id: "github-repos",
      label: "GitHub Repositories",
      enabled: true,
      tier: "high",
      provider: "github",
      domains: ["github.com"],
      providerOptions: {
        minStars: 300,
      },
      querySuffix: "in:description in:readme",
    },
    {
      id: "hn-discussions",
      label: "Hacker News Discussions",
      enabled: true,
      tier: "high",
      provider: "hn",
      domains: [],
      providerOptions: {
        minPoints: 10,
      },
    },
    {
      id: "reddit-dev",
      label: "Reddit Dev Community",
      enabled: true,
      tier: "medium",
      provider: "reddit",
      subreddits: ["programming", "webdev", "javascript", "typescript", "node"],
      domains: ["reddit.com"],
      providerOptions: {
        minUpvotes: 20,
      },
    },
    {
      id: "official-doc-links",
      label: "Official Documentation Links",
      enabled: true,
      tier: "official",
      provider: "official-docs",
      providerOptions: {
        minScore: 0.2,
      },
      domains: [
        "developer.mozilla.org",
        "nodejs.org",
        "typescriptlang.org",
        "react.dev",
        "vuejs.org",
        "kubernetes.io",
        "aws.amazon.com",
        "cloud.google.com",
      ],
    },
  ],
  domainAuthority: {
    "developer.mozilla.org": 0.98,
    "nodejs.org": 0.97,
    "typescriptlang.org": 0.97,
    "react.dev": 0.96,
    "vuejs.org": 0.96,
    "kubernetes.io": 0.95,
    "aws.amazon.com": 0.95,
    "cloud.google.com": 0.95,
    "stackoverflow.com": 0.86,
    "github.com": 0.76,
    "news.ycombinator.com": 0.78,
    "reddit.com": 0.72,
  },
};

module.exports = {
  DEFAULT_PRACTICE_CONFIG,
  DEFAULT_PRACTICE_CONFIG_PATH,
};
