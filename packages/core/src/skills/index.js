const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { BUILTIN_SKILLS } = require("./builtin");

const CUSTOM_SKILLS_DIR = path.join(os.homedir(), ".bps", "skills");

function parseInput(rawInput) {
  if (!rawInput) {
    return {};
  }
  if (typeof rawInput === "object") {
    return rawInput;
  }
  try {
    return JSON.parse(rawInput);
  } catch (error) {
    throw new Error("Invalid --input JSON payload");
  }
}

function safeReadJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function normalizeSkill(raw, source, filePath = null) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!raw.name || !raw.template) {
    return null;
  }

  const requiredFields = Array.isArray(raw.requiredFields)
    ? raw.requiredFields.filter((item) => typeof item === "string" && item.trim())
    : [];

  const targetTools = Array.isArray(raw.targetTools)
    ? raw.targetTools.filter((item) => typeof item === "string" && item.trim())
    : ["claude", "codex"];

  const defaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {};

  return {
    name: String(raw.name).trim(),
    description: String(raw.description || "").trim(),
    template: String(raw.template),
    requiredFields,
    targetTools,
    defaults,
    source,
    filePath,
  };
}

function loadBuiltinSkills() {
  return BUILTIN_SKILLS
    .map((item) => normalizeSkill(item, "builtin"))
    .filter(Boolean);
}

function loadCustomSkills() {
  if (!fs.existsSync(CUSTOM_SKILLS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(CUSTOM_SKILLS_DIR)
    .filter((item) => item.toLowerCase().endsWith(".json"));

  const skills = [];
  for (const file of files) {
    const fullPath = path.join(CUSTOM_SKILLS_DIR, file);
    const parsed = safeReadJson(fullPath);
    const normalized = normalizeSkill(parsed, "custom", fullPath);
    if (normalized) {
      skills.push(normalized);
    }
  }

  return skills;
}

function getSkillMap() {
  const map = new Map();
  for (const skill of loadBuiltinSkills()) {
    map.set(skill.name, skill);
  }
  for (const skill of loadCustomSkills()) {
    map.set(skill.name, skill);
  }
  return map;
}

function listSkills() {
  return Array.from(getSkillMap().values()).sort((a, b) => a.name.localeCompare(b.name));
}

function listSkillNames() {
  return listSkills().map((item) => item.name);
}

function getSkill(name) {
  if (!name) {
    return null;
  }
  return getSkillMap().get(name) || null;
}

function searchSkills(query) {
  const keyword = String(query || "").toLowerCase().trim();
  if (!keyword) {
    return listSkills();
  }

  return listSkills().filter((item) => {
    return (
      item.name.toLowerCase().includes(keyword)
      || item.description.toLowerCase().includes(keyword)
      || item.targetTools.join(" ").toLowerCase().includes(keyword)
    );
  });
}

function resolveVariables(skill, input) {
  const defaults = skill.defaults || {};
  return {
    ...defaults,
    ...input,
  };
}

function findMissingFields(skill, variables) {
  const missing = [];
  for (const field of skill.requiredFields || []) {
    const value = variables[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
  }
  return missing;
}

function renderTemplate(template, variables) {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) {
      return "";
    }
    if (Array.isArray(variables[key])) {
      return variables[key].join(", ");
    }
    if (typeof variables[key] === "object") {
      return JSON.stringify(variables[key]);
    }
    return String(variables[key]);
  });
}

function runSkill(name, rawInput) {
  const skill = getSkill(name);
  if (!skill) {
    const valid = listSkillNames().join(", ");
    throw new Error(`Unknown skill: ${name}. Available skills: ${valid}`);
  }

  const input = parseInput(rawInput);
  const variables = resolveVariables(skill, input);
  const missingFields = findMissingFields(skill, variables);

  if (missingFields.length > 0) {
    throw new Error(`Missing required skill fields: ${missingFields.join(", ")}`);
  }

  const prompt = renderTemplate(skill.template, variables);

  return {
    type: "skill_result",
    skill: skill.name,
    source: skill.source,
    targetTools: skill.targetTools,
    prompt,
    variables,
  };
}

module.exports = {
  CUSTOM_SKILLS_DIR,
  parseInput,
  listSkills,
  listSkillNames,
  getSkill,
  searchSkills,
  runSkill,
};
