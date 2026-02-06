function buildClaudeCommandTemplate(actionName) {
  return [
    `# /bps-${actionName}`,
    "",
    "Run BPS action through local CLI:",
    "",
    "```bash",
    `npx @your-org/bps run ${actionName} --input '{"goal":"replace me"}'`,
    "```",
    "",
    "Adjust --input payload for your scenario.",
  ].join("\n");
}

function buildCodexSkillTemplate(actionName) {
  return [
    "---",
    `name: bps-${actionName}`,
    `description: Run BPS action ${actionName} from Codex`,
    "---",
    "",
    `Execute: npx @your-org/bps run ${actionName} --input '{\"goal\":\"replace me\"}'`,
  ].join("\n");
}

module.exports = {
  buildClaudeCommandTemplate,
  buildCodexSkillTemplate,
};

