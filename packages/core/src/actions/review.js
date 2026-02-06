function runReview(input) {
  const goal = input.goal || "审查当前改动并给出风险建议";
  const scope = input.scope || "未指定";
  const output = {
    action: "review",
    summary: `BPS review 已执行：${goal}`,
    scope,
    checklist: [
      "检查需求覆盖与边界",
      "检查异常处理与容错",
      "检查测试与回归风险",
    ],
  };
  return output;
}

module.exports = { runReview };

