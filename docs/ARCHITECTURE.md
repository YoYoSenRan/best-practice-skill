# best-practice-skill 架构说明

本文档描述当前项目在 2026-02-06 的架构状态。

---

## 1. 项目定位

`best-practice-skill` 是一个面向 Claude/Codex 的最佳实践工具链，核心链路：

1. 输入需求（topic/stack/objective）
2. 从高质量技术社区与资料源采集信息
3. 按可配置规则评分、抓取正文并提炼证据链
4. 输出可执行建议 + Prompt 草稿

同时保留安装器能力，把技能模板写入 Claude/Codex。

---

## 2. 目录结构

```txt
best-practice-skill/
├─ package.json
├─ README.md
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ PRACTICE_CONFIG.md
├─ scripts/
│  ├─ check-workspaces.mjs
│  └─ practice-hooks/
│     └─ after-rank-example.js
└─ packages/
   ├─ cli/
   │  ├─ bin/bps.js
   │  └─ src/index.js
   ├─ core/
   │  └─ src/
   │     ├─ index.js
   │     ├─ actions/
   │     │  ├─ review.js
   │     │  ├─ spec.js
   │     │  └─ release-check.js
   │     ├─ skills/
   │     │  ├─ builtin.js
   │     │  └─ index.js
   │     └─ practice/
   │        ├─ defaults.js
   │        ├─ config.js
   │        ├─ cache.js
   │        ├─ search.js
   │        ├─ enrich.js
   │        ├─ pipeline.js
   │        └─ index.js
   ├─ installer/
   │  └─ src/index.js
   └─ templates/
      └─ src/index.js
```

---

## 3. 分层职责

### 3.1 CLI（`packages/cli`）

负责命令路由、展示层和参数透传。

主要命令：

- `doctor`
- `install/update/uninstall/rollback/list-installed`（rollback 支持 target/action 过滤）
- `report list/show/prune`
- `skill list/search/inspect/run`
- `practice search`
- `practice config init/show`
- `practice cache stats/clean`

关键文件：

- `packages/cli/bin/bps.js`
- `packages/cli/src/install-command.js`
- `packages/cli/src/skill-command.js`
- `packages/cli/src/report-command.js`
- `packages/cli/src/practice-command.js`

### 3.2 Core（`packages/core`）

拆成三块：

1. **Action 引擎**：`review/spec/release-check`
2. **Skill 引擎**：内置技能 + `~/.bps/skills/*.json`
3. **Practice 引擎**：可配置流水线 + stage hooks + cache 管理 API

关键文件：

- `packages/core/src/index.js`
- `packages/core/src/skills/index.js`
- `packages/core/src/practice/pipeline.js`

### 3.3 Templates（`packages/templates`）

负责生成 Claude/Codex 模板，当前模板版本 `v2`。

模板命名：`bps-<action>`

模板内执行：

- `npx best-practice-skill skill run <action> --input '{...}'`

### 3.4 Installer（`packages/installer`）

支持交互式/非交互式安装更新卸载回滚，包含：

- 计划生成（create/update/unchanged/conflict/skip）
- 冲突策略（interactive 逐个/批量、force 全覆盖、non-interactive skip）
- 写前备份（`~/.bps/backups`）
- 清单追踪（`~/.bps/manifest.json`）
- 操作报告（`~/.bps/reports/*.json`，`report show` 默认优先 latest update）

关键文件：

- `packages/installer/src/index.js`
- `packages/installer/src/report-store.js`
- `packages/installer/src/interactive.js`
- `packages/installer/src/presenter.js`
- `packages/installer/src/operations.js`
- `packages/installer/src/operation-install-update.js`
- `packages/installer/src/operation-rollback.js`
- `packages/installer/src/operation-uninstall.js`

---

## 4. Practice 核心流水线

### 4.1 Stage: Intent

输入归一化：

- `topic`（必填，可配置）
- `stack`
- `objective`（可配置默认值）

支持 hook：`afterIntent`

### 4.2 Stage: Query

用模板生成多条 query，支持变量：

- `{{topic}}`
- `{{stack}}`
- `{{objective}}`
- `{{keyword}}`（扩展 query 模式）

支持 stack profile 语义扩展（例如 react/node/k8s 自动补关键词）。

支持 hook：`afterQuery`

### 4.3 Stage: Collect

通过 provider 采集：

- `official-docs`
- `stackoverflow`
- `hn`
- `reddit`
- `github`

可按 source 配置 provider/domain/subreddit/providerOptions。

采集层内置：

- 请求重试退避（`retries/retryDelayMs/retryBackoffFactor`）
- 本地缓存（`cacheEnabled/cacheTtlMs/cacheVersion/cacheDir`）
- CLI 缓存开关（`--no-cache/--refresh-cache`）
- 官方文档索引扩展（`officialDocs.indexPath/index/stackBoostWeight`）

支持 hook：`afterCollect`

### 4.4 Stage: Score / Rank

评分维度：

- `authority`（域名或 tier 权威分）
- `recency`（发布时间衰减）
- `relevance`（关键词匹配）
- `topicCoverage`（主题覆盖率）

最终分 = 加权和，支持 `minimumScore` / `minimumRelevance` / `minimumTopicCoverage` 过滤。

支持 hook：`afterRank`

### 4.5 Stage: Enrich（正文证据提炼）

对前 N 条结果抓取正文并提取证据句：

- `maxFetch`
- `maxEvidencePerResult`
- `minCoverage`
- `timeoutMs`

输出：`result.evidence[]` 与 `summary.evidenceChain[]`

### 4.6 Stage: Synthesize

- 结果去重
- 单域名限流（`maxPerDomain`）
- 输出 TopN
- 生成 Prompt Draft（可关闭）

最终返回前支持 hook：`beforeReturn`

---

## 5. 配置体系

默认路径：`~/.bps/practice.config.json`

- 若存在则自动加载
- 也可用 `--config` 指定
- `input.config` 可做 inline 覆盖（用于实验）
- `hooks` 支持按阶段挂载 JS 模块

配置文档见：`docs/PRACTICE_CONFIG.md`

---

## 6. 当前内置技能

- `review`
- `spec`
- `release-check`
- `best-practice`

其中 `best-practice` 用于驱动“先 research 再实施”的流程。

---

## 7. 已知边界

1. 当前采集以公开 API 与索引源为主，不是全网爬虫。
2. 官方文档索引虽可扩展，但质量仍依赖索引维护与 query 命中。
3. 部分站点正文抓取可能遇到反爬限制（如 403），已降级为部分失败。

---

## 8. 常用命令

```bash
node packages/cli/bin/bps.js --help
node packages/cli/bin/bps.js skill list
node packages/cli/bin/bps.js practice search --input '{"topic":"Node.js error handling","stack":"Node.js 22"}'
node packages/cli/bin/bps.js practice search --input '{"topic":"React hooks state"}' --refresh-cache
node packages/cli/bin/bps.js practice cache stats
node packages/cli/bin/bps.js practice cache clean --older-than-hours 24
node packages/cli/bin/bps.js install --dry-run --non-interactive --yes
node packages/cli/bin/bps.js report list --limit 10
node packages/cli/bin/bps.js report show
node packages/cli/bin/bps.js report show --operation rollback
node packages/cli/bin/bps.js report show --id <report-id>
node packages/cli/bin/bps.js report prune --keep 20 --dry-run
node packages/cli/bin/bps.js rollback --dry-run
node packages/cli/bin/bps.js rollback --non-interactive --yes --target codex --actions best-practice
```
