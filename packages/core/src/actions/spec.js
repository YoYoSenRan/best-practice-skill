function runSpec(input) {
  const feature = input.feature || "未命名功能";
  const constraints = input.constraints || [];

  return {
    action: "spec",
    feature,
    goals: [
      `定义 ${feature} 的业务目标`,
      "明确交付范围和验收标准",
      "拆分可执行里程碑",
    ],
    constraints,
    deliverables: [
      "技术方案草案",
      "任务分解清单",
      "风险与回滚策略",
    ],
  };
}

module.exports = { runSpec };

