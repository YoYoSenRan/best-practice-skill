function runReleaseCheck(input) {
  const version = input.version || "0.0.0";
  const scope = input.scope || "best-practice-skill";

  return {
    action: "release-check",
    version,
    scope,
    checklist: [
      "确认 CHANGELOG 与版本号一致",
      "运行安装/更新/卸载关键路径验证",
      "确认回滚步骤可执行",
      "确认发布后监控与告警项",
    ],
  };
}

module.exports = { runReleaseCheck };
