# bps-monorepo

跨 Claude Code 与 Codex 的 BPS 工具脚手架。

## 目标

- 提供统一能力内核（`run action`）
- 提供双端安装器（Claude + Codex）
- 支持 `npx ... install` 一键写入命令/技能模板

## 目录

- `packages/core`：动作执行内核（review/spec）
- `packages/templates`：Claude/Codex 模板生成器
- `packages/installer`：安装器（写入 `~/.claude` 与 `~/.codex`）
- `packages/cli`：CLI 入口（`bps`）

## 本地调试

```bash
npm install
node packages/cli/bin/bps.js doctor
node packages/cli/bin/bps.js run review --input '{"goal":"审查改动"}'
```

## 计划的安装形态

发布到 npm 后：

```bash
npx @your-org/bps install
```

