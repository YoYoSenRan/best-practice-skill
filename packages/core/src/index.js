const { runReview } = require("./actions/review");
const { runSpec } = require("./actions/spec");

const actionMap = {
  review: runReview,
  spec: runSpec,
};

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
};

