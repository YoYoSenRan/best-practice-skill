function createSkillCommandRunner(context) {
  const {
    ICON,
    printHeader,
    bold,
    dim,
    warning,
    listSkills,
    searchSkills,
    getSkill,
    runSkill,
  } = context;

  function runSkillList() {
    printHeader("Available Skills", ICON.skill);
    const skills = listSkills();
    for (const skill of skills) {
      console.log(`${ICON.ok} ${bold(skill.name)} ${dim(`(${skill.source})`)}`);
      console.log(`   ${skill.description || "No description"}`);
      console.log(`   targets: ${skill.targetTools.join(", ")}`);
    }
  }

  function runSkillSearch(query) {
    printHeader(`Skill Search: ${query}`, ICON.skill);
    const matched = searchSkills(query);
    if (matched.length === 0) {
      console.log(`${ICON.warn} ${warning("No skills matched your query")}`);
      return;
    }
    for (const skill of matched) {
      console.log(`${ICON.ok} ${skill.name} ${dim(`(${skill.source})`)}`);
      console.log(`   ${skill.description || "No description"}`);
    }
  }

  function runSkillInspect(name) {
    const skill = getSkill(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    printHeader(`Skill: ${name}`, ICON.skill);
    console.log(`${ICON.note} source: ${skill.source}`);
    console.log(`${ICON.note} targets: ${skill.targetTools.join(", ")}`);
    console.log(`${ICON.note} required: ${(skill.requiredFields || []).join(", ") || "none"}`);
    console.log(`${ICON.prompt} template:`);
    console.log(skill.template);
  }

  function runSkillExecute(name, options) {
    const result = runSkill(name, options.input);
    printHeader(`Skill Run: ${name}`, ICON.skill);
    console.log(`${ICON.prompt} ${bold("Generated Prompt")}`);
    console.log(result.prompt);
    console.log("");
    console.log(`${ICON.note} source: ${result.source}`);
    console.log(`${ICON.note} targets: ${result.targetTools.join(", ")}`);
  }

  function runSkillCommand(rest, options) {
    const sub = rest[0];

    if (!sub || sub === "help") {
      printHeader("Skill Commands", ICON.skill);
      console.log(`${ICON.skill} bps skill list`);
      console.log(`${ICON.skill} bps skill search <query>`);
      console.log(`${ICON.skill} bps skill inspect <name>`);
      console.log(`${ICON.skill} bps skill run <name> --input '{...}'`);
      return;
    }

    if (sub === "list") {
      runSkillList();
      return;
    }

    if (sub === "search") {
      const query = rest.slice(1).join(" ").trim();
      if (!query) {
        throw new Error("Usage: bps skill search <query>");
      }
      runSkillSearch(query);
      return;
    }

    if (sub === "inspect") {
      const name = rest[1];
      if (!name) {
        throw new Error("Usage: bps skill inspect <name>");
      }
      runSkillInspect(name);
      return;
    }

    if (sub === "run") {
      const name = rest[1];
      if (!name) {
        throw new Error("Usage: bps skill run <name> --input '{...}'");
      }
      runSkillExecute(name, options);
      return;
    }

    throw new Error(`Unknown skill subcommand: ${sub}`);
  }

  return {
    runSkillCommand,
  };
}

module.exports = {
  createSkillCommandRunner,
};
