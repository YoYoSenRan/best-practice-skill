# Practice 配置说明

`best-practice-skill` 的最佳实践流水线支持分阶段配置，默认读取：

- `~/.bps/practice.config.json`

也可以在命令里指定：

- `--config /absolute/or/relative/path.json`

---

## 1. 快速开始

初始化默认配置：

```bash
node packages/cli/bin/bps.js practice config init
```

查看生效配置：

```bash
node packages/cli/bin/bps.js practice config show
node packages/cli/bin/bps.js practice config show --json
```

运行搜索：

```bash
node packages/cli/bin/bps.js practice search --input '{"topic":"Node.js error handling","stack":"Node.js 22"}'
node packages/cli/bin/bps.js practice search --input '{"topic":"React form validation"}' --refresh-cache
node packages/cli/bin/bps.js practice search --input '{"topic":"React form validation"}' --no-cache
```

缓存管理：

```bash
node packages/cli/bin/bps.js practice cache stats
node packages/cli/bin/bps.js practice cache clean --dry-run
node packages/cli/bin/bps.js practice cache clean --older-than-hours 24
```

---

## 2. 顶层结构

```json
{
  "version": 1,
  "stages": {
    "intent": {},
    "query": {},
    "collect": {},
    "score": {},
    "enrich": {},
    "synthesize": {}
  },
  "hooks": {
    "afterIntent": null,
    "afterQuery": null,
    "afterCollect": null,
    "afterRank": null,
    "beforeReturn": null
  },
  "sources": [],
  "domainAuthority": {}
}
```

---

## 3. 分阶段配置

### 3.1 `stages.intent`

- `requiredTopic`：是否要求 `input.topic` 必填
- `fallbackObjective`：未传 `objective` 时的默认目标

### 3.2 `stages.query`

- `maxQueries`：最多生成多少条检索 query
- `templates`：query 模板（支持 `{{topic}}` / `{{stack}}` / `{{objective}}`）
- `extraKeywords`：附加关键词
- `enableExpansion`：是否启用语义扩展 query
- `maxExpansionKeywords`：最多扩展多少个关键词
- `expansionTemplates`：扩展 query 模板（支持 `{{keyword}}`）
- `stackProfiles`：按技术栈映射扩展词（key 用 `react|next` 这种别名串）

### 3.3 `stages.collect`

- `maxRequests`：最多请求次数（`source × query`）
- `perProviderResults`：每次请求最多采集条数
- `timeoutMs`：网络超时
- `retries`：失败重试次数
- `retryDelayMs`：首次重试等待毫秒
- `retryBackoffFactor`：重试退避倍数
- `cacheEnabled`：是否启用本地缓存
- `cacheTtlMs`：缓存有效期
- `cacheVersion`：缓存版本（算法升级时可递增）
- `cacheDir`：可选，自定义缓存目录
- `providers`：允许的 provider 列表（`official-docs` / `stackoverflow` / `hn` / `reddit` / `github`）
- `officialDocs`：官方文档 provider 的额外配置：
  - `mergeDefaultIndex`：是否合并内置索引
  - `indexPath`：外部官方索引文件（支持相对配置文件路径）
  - `index`：内联索引条目数组
  - `stackBoostWeight`：技术栈标签加权（0~1）

### 3.4 `stages.score`

- `weights.authority`：权威性权重
- `weights.recency`：时效性权重
- `weights.relevance`：相关性权重
- `minimumScore`：过滤阈值
- `minimumRelevance`：最低相关度阈值（避免跑题结果）
- `minimumTopicCoverage`：主题关键词覆盖阈值（防止只沾边）
- `authorityByTier`：来源层级（official/high/medium）的默认权重

### 3.5 `stages.enrich`

- `enabled`：是否启用正文抓取与证据提炼
- `maxFetch`：最多抓取多少条已排序结果
- `timeoutMs`：抓取超时
- `maxEvidencePerResult`：每条结果最多保留证据句数
- `minCoverage`：证据句最低主题覆盖率
- `maxSentenceLength`：证据句最大长度

### 3.6 `stages.synthesize`

- `topN`：输出前 N 条结果
- `maxPerDomain`：单域名最多保留条数
- `includePromptDraft`：是否生成可直接给 Codex/Claude 的 Prompt 草稿

---

## 4. `sources` 配置

每个 source 支持字段：

- `id`：唯一标识
- `label`：展示名
- `enabled`：是否启用
- `tier`：`official` / `high` / `medium`
- `provider`：`official-docs` / `stackoverflow` / `hn` / `reddit` / `github`
- `domains`：可选，域名白名单（空数组表示不限制）
- `subreddits`：仅 `reddit` 可选，用于限制 subreddit 范围
- `queryPrefix`：给该 source 的 query 前缀
- `querySuffix`：给该 source 的 query 后缀
- `providerOptions`：透传给 provider 的参数（如 `minStars`、`minScore`）

---

## 5. 官方文档外部索引格式

`stages.collect.officialDocs.indexPath` 指向的 JSON 支持两种结构：

```json
[
  {
    "title": "React Docs - useEffect",
    "url": "https://react.dev/reference/react/useEffect",
    "snippet": "React 官方 useEffect 参考",
    "tags": ["react", "hooks", "effect"],
    "priority": 0.05
  }
]
```

或：

```json
{
  "entries": [
    {
      "title": "TypeScript Utility Types",
      "url": "https://www.typescriptlang.org/docs/handbook/utility-types.html",
      "tags": ["typescript", "types", "utility"]
    }
  ]
}
```

---

## 6. Hook 机制（关键扩展点）

你可以在每个阶段插入自定义逻辑，不改核心代码。

支持阶段：

- `afterIntent`
- `afterQuery`
- `afterCollect`
- `afterRank`
- `beforeReturn`

### Hook 定义格式

```json
{
  "hooks": {
    "afterRank": {
      "module": "./scripts/practice-hooks/after-rank-example.js"
    }
  }
}
```

也支持指定命名导出：

```json
{
  "hooks": {
    "afterCollect": {
      "module": "./my-hooks.js",
      "exportName": "afterCollect"
    }
  }
}
```

> 相对路径会以配置文件所在目录作为基准解析。

---

## 7. 缓存策略建议

- 开启缓存：`stages.collect.cacheEnabled = true`
- 默认缓存有效期：`cacheTtlMs = 24h`
- 算法升级时递增：`cacheVersion`
- 临时强制重拉：CLI 使用 `--refresh-cache`
- 完全不使用缓存：CLI 使用 `--no-cache`

---

## 8. 推荐调优顺序

1. 调整 `query.templates` + `query.stackProfiles`
2. 调整 `sources` + `officialDocs` 索引
3. 调整 `score` 过滤阈值
4. 调整 `enrich` 证据提炼质量
5. 最后再通过 `hooks` 做业务化定制
