const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let buildClaudeCommandTemplate;
let buildCodexSkillTemplate;

try {
  ({
    buildClaudeCommandTemplate,
    buildCodexSkillTemplate,
  } = require("@bps/templates"));
} catch (error) {
  ({
    buildClaudeCommandTemplate,
    buildCodexSkillTemplate,
  } = require("../../templates/src"));
}

const DEFAULT_ACTIONS = ["review", "spec"];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf-8");
}

function installClaudeCommands(actions = DEFAULT_ACTIONS) {
  const root = path.join(os.homedir(), ".claude", "commands");
  ensureDir(root);
  const outputs = [];

  for (const action of actions) {
    const filename = `bps-${action}.md`;
    const target = path.join(root, filename);
    writeFile(target, buildClaudeCommandTemplate(action));
    outputs.push(target);
  }

  return outputs;
}

function installCodexSkills(actions = DEFAULT_ACTIONS) {
  const root = path.join(os.homedir(), ".codex", "skills");
  ensureDir(root);
  const outputs = [];

  for (const action of actions) {
    const skillDir = path.join(root, `bps-${action}`);
    ensureDir(skillDir);
    const target = path.join(skillDir, "SKILL.md");
    writeFile(target, buildCodexSkillTemplate(action));
    outputs.push(target);
  }

  return outputs;
}

function installAll(actions = DEFAULT_ACTIONS) {
  return {
    claude: installClaudeCommands(actions),
    codex: installCodexSkills(actions),
  };
}

module.exports = {
  DEFAULT_ACTIONS,
  installClaudeCommands,
  installCodexSkills,
  installAll,
};
