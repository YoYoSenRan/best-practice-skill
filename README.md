# best-practice-skill

跨 Claude Code 与 Codex 的 BPS 技能工具，核心目标是：

- 检索高质量技术来源并汇总代码最佳实践
- 产出可执行的实现建议、证据链与 Prompt 草稿
- 一键安装到 Claude/Codex 并通过 `/bps-xxx` 调用

## 功能概览

- 安装器：`install / update / uninstall / rollback`（交互式 + 非交互）
- 技能引擎：内置技能 + 本地自定义技能（`~/.bps/skills/*.json`）
- 最佳实践流水线：`practice search`（多阶段可配置）
- 来源采集：`official-docs + stackoverflow + hn + reddit + github`
- 官方文档增强：支持外部索引文件 + 内置 stack 语义加权
- 稳定性：请求重试退避 + 本地缓存 + 缓存管理命令
- 证据链提炼：自动抓取正文并提取高相关证据句
- Stage Hooks：按阶段挂载自定义脚本，无需改内核
- 状态管理：manifest、冲突检测、备份、dry-run

## 目录

- `packages/core`：Action + Skill + Practice Pipeline
- `packages/templates`：Claude/Codex 模板生成
- `packages/installer`：安装/更新/卸载引擎
- `packages/cli`：CLI 入口
- `docs/ARCHITECTURE.md`：架构说明
- `docs/PRACTICE_CONFIG.md`：Practice 配置文档

## 本地调试

```bash
npm install
node packages/cli/bin/bps.js doctor
node packages/cli/bin/bps.js skill list
node packages/cli/bin/bps.js practice search --input '{"topic":"Node.js error handling","stack":"Node.js 22"}'
```

## 安装、更新与回滚

交互模式：

```bash
node packages/cli/bin/bps.js install
node packages/cli/bin/bps.js update
node packages/cli/bin/bps.js uninstall
node packages/cli/bin/bps.js rollback
```

非交互模式：

```bash
node packages/cli/bin/bps.js install --non-interactive --yes --target claude,codex --actions review,spec,release-check,best-practice
node packages/cli/bin/bps.js update --non-interactive --yes --force
node packages/cli/bin/bps.js uninstall --non-interactive --yes --target claude --actions review
node packages/cli/bin/bps.js rollback --non-interactive --yes --target codex --actions best-practice
```

> `rollback` 支持 `--target` 与 `--actions` 过滤，仅回滚指定范围。

预览计划（不落盘）：

```bash
node packages/cli/bin/bps.js install --dry-run --non-interactive --yes
```

安装清单：`~/.bps/manifest.json`

更新报告：`~/.bps/reports/*.json`（每次 install/update/rollback 自动生成）

## Report 命令

```bash
node packages/cli/bin/bps.js report list --limit 10
node packages/cli/bin/bps.js report show
node packages/cli/bin/bps.js report show --operation rollback
node packages/cli/bin/bps.js report show --id <report-id>
node packages/cli/bin/bps.js report show --report /Users/you/.bps/reports/update-xxxx.json
node packages/cli/bin/bps.js report prune --keep 20 --dry-run
```

> `report show` 在未显式指定 `--id/--report` 时，默认优先展示最新 `update` 报告。

## Skill 命令

```bash
node packages/cli/bin/bps.js skill list
node packages/cli/bin/bps.js skill search best-practice
node packages/cli/bin/bps.js skill inspect best-practice
node packages/cli/bin/bps.js skill run best-practice --input '{"topic":"API rate limit","stack":"Node.js"}'
```

## Practice 命令（核心）

```bash
node packages/cli/bin/bps.js practice search --input '{"topic":"Node.js error handling","stack":"Node.js 22","objective":"实现可观测错误处理"}'
node packages/cli/bin/bps.js practice search --input '{"topic":"React form validation"}' --json
node packages/cli/bin/bps.js practice search --input '{"topic":"TypeScript API design"}' --config ./my-practice-config.json --refresh-cache
node packages/cli/bin/bps.js practice search --input '{"topic":"TypeScript API design"}' --no-cache
node packages/cli/bin/bps.js practice config init
node packages/cli/bin/bps.js practice config show
node packages/cli/bin/bps.js practice cache stats
node packages/cli/bin/bps.js practice cache clean --dry-run
node packages/cli/bin/bps.js practice cache clean --older-than-hours 24
```

> 提示：相同 query 的第二次执行通常会命中本地缓存，速度更快；`--refresh-cache` 会绕过读取并刷新缓存内容。

## Hook 示例（按阶段自定义）

1) 在配置中挂载：

```json
{
  "hooks": {
    "afterRank": {
      "module": "./scripts/practice-hooks/after-rank-example.js"
    }
  }
}
```

2) 运行搜索，CLI 会展示 hooks 执行与失败统计。

更多见：`docs/PRACTICE_CONFIG.md`

## 自定义技能（本地）

把 JSON 文件放到：`~/.bps/skills/*.json`

```json
{
  "name": "api-audit",
  "description": "生成 API 审计提示词",
  "targetTools": ["claude", "codex"],
  "requiredFields": ["service", "focus"],
  "defaults": {
    "constraints": "不改动对外接口"
  },
  "template": "请审计服务 {{service}}，重点 {{focus}}，约束 {{constraints}}。"
}
```

## /bps-xxx 约定

安装模板后，Claude/Codex 的模板命名约定为 `bps-<action>`（如 `bps-review`、`bps-best-practice`），模板内部默认调用：

```bash
npx best-practice-skill skill run <action> --input '{...}'
```

## npx 形态

发布到 npm 后可直接：

```bash
npx best-practice-skill install
npx best-practice-skill practice search --input '{"topic":"React hooks state","stack":"React 19"}'
```
