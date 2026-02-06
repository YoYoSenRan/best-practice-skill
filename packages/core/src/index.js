const { runReview } = require("./actions/review");
const { runSpec } = require("./actions/spec");
const { runReleaseCheck } = require("./actions/release-check");
const {
  parseInput,
  listSkills,
  listSkillNames,
  getSkill,
  searchSkills,
  runSkill,
} = require("./skills");
const {
  parsePracticeInput,
  loadPracticeConfig,
  initPracticeConfig,
  normalizeConfig,
  normalizeHooks,
  runPracticeSearch,
  DEFAULT_PRACTICE_CONFIG,
  DEFAULT_PRACTICE_CONFIG_PATH,
  getCacheStats,
  clearCacheEntries,
} = require("./practice");

const actionMap = {
  review: runReview,
  spec: runSpec,
  "release-check": runReleaseCheck,
};

function runAction(action, rawInput) {
  const handler = actionMap[action];
  if (!handler) {
    const valid = Object.keys(actionMap).join(", ");
    throw new Error(`Unknown action: ${action}. Valid actions: ${valid}`);
  }
  const input = parseInput(rawInput);
  return handler(input);
}

function listActions() {
  return Object.keys(actionMap);
}

module.exports = {
  runAction,
  listActions,
  parseInput,
  listSkills,
  listSkillNames,
  getSkill,
  searchSkills,
  runSkill,
  parsePracticeInput,
  loadPracticeConfig,
  initPracticeConfig,
  normalizeConfig,
  normalizeHooks,
  runPracticeSearch,
  DEFAULT_PRACTICE_CONFIG,
  DEFAULT_PRACTICE_CONFIG_PATH,
  getPracticeCacheStats: getCacheStats,
  clearPracticeCache: clearCacheEntries,
};
