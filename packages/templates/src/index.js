const TEMPLATE_VERSION = "2";

function getInputTemplateByAction(actionName) {
  if (actionName === "review") {
    return '{"goal":"审查当前改动","scope":"PR #123"}';
  }
  if (actionName === "spec") {
    return '{"feature":"示例功能","goal":"提升效率","constraints":["不改数据库"]}';
  }
  if (actionName === "release-check") {
    return '{"version":"0.2.0","scope":"best-practice-skill"}';
  }
  if (actionName === "best-practice") {
    return '{"topic":"Node.js error handling","stack":"Node.js 22 + TypeScript","objective":"实现可观测、可测试的错误处理链路"}';
  }
  return '{"goal":"replace me"}';
}

function buildClaudeCommandTemplate(actionName, options = {}) {
  const packageVersion = options.packageVersion || "0.1.0";
  const inputTemplate = getInputTemplateByAction(actionName);

  return [
    "<!-- managed-by: bps -->",
    "<!-- template-id: claude-command -->",
    `<!-- template-version: ${TEMPLATE_VERSION} -->`,
    `<!-- bps-version: ${packageVersion} -->`,
    `<!-- action: ${actionName} -->`,
    "",
    `# /bps-${actionName}`,
    "",
    "Run BPS skill through local CLI:",
    "",
    "```bash",
    `npx best-practice-skill skill run ${actionName} --input '${inputTemplate}'`,
    "```",
    "",
    "Adjust --input payload for your scenario.",
  ].join("\n");
}

function buildCodexSkillTemplate(actionName, options = {}) {
  const packageVersion = options.packageVersion || "0.1.0";
  const inputTemplate = getInputTemplateByAction(actionName);

  return [
    "---",
    `name: bps-${actionName}`,
    `description: Run BPS skill ${actionName} from Codex`,
    "bps_managed: true",
    "bps_template_id: codex-skill",
    `bps_template_version: \"${TEMPLATE_VERSION}\"`,
    `bps_package_version: \"${packageVersion}\"`,
    `bps_action: \"${actionName}\"`,
    "---",
    "",
    `Execute: npx best-practice-skill skill run ${actionName} --input '${inputTemplate}'`,
  ].join("\n");
}

module.exports = {
  TEMPLATE_VERSION,
  getInputTemplateByAction,
  buildClaudeCommandTemplate,
  buildCodexSkillTemplate,
};
