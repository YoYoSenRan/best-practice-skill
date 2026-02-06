function createInstallerInteractiveHelpers(context) {
  const {
    readline,
    ICON,
    bold,
    accent,
    warning,
    parseCsv,
    normalizeTargets,
    normalizeActions,
    DEFAULT_ACTIONS,
    DEFAULT_TARGETS,
  } = context;

  function createPromptInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  function ask(rl, question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  async function selectTargetsInteractively(rl, presetTargets, operation) {
    if (presetTargets && presetTargets.length > 0) {
      return normalizeTargets(presetTargets);
    }

    console.log("");
    console.log(`${ICON.target} ${bold(`选择${operation === "uninstall" ? "卸载" : "安装"}目标`)}`);
    console.log(`  ${accent("1")}. all (claude + codex)`);
    console.log(`  ${accent("2")}. claude`);
    console.log(`  ${accent("3")}. codex`);

    const answer = await ask(rl, `${ICON.note} 输入选项 [1/2/3] (默认 1): `);
    if (!answer || answer === "1") {
      return DEFAULT_TARGETS;
    }
    if (answer === "2") {
      return ["claude"];
    }
    if (answer === "3") {
      return ["codex"];
    }

    return normalizeTargets(parseCsv(answer));
  }

  async function selectActionsInteractively(rl, presetActions, fallbackActions) {
    if (presetActions && presetActions.length > 0) {
      return normalizeActions(presetActions);
    }

    console.log("");
    console.log(`${ICON.action} ${bold("选择 actions")}`);
    if (fallbackActions.length > 0) {
      for (let i = 0; i < fallbackActions.length; i += 1) {
        console.log(`  ${accent(String(i + 1))}. ${fallbackActions[i]}`);
      }
    }
    console.log(`  ${accent("a")}. all`);

    const answer = await ask(
      rl,
      `${ICON.note} 输入选项（数字/逗号/all）(默认 all): `
    );

    if (!answer || answer.toLowerCase() === "a" || answer.toLowerCase() === "all") {
      return fallbackActions;
    }

    const numeric = answer
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0 && item <= fallbackActions.length)
      .map((index) => fallbackActions[index - 1]);

    if (numeric.length > 0) {
      return normalizeActions(numeric);
    }

    return normalizeActions(parseCsv(answer));
  }

  async function resolveOptions(baseOptions = {}, operation = "install") {
    const options = {
      packageVersion: baseOptions.packageVersion || "0.1.0",
      nonInteractive: Boolean(baseOptions.nonInteractive),
      yes: Boolean(baseOptions.yes),
      force: Boolean(baseOptions.force),
      dryRun: Boolean(baseOptions.dryRun),
      actions: baseOptions.actions ? parseCsv(baseOptions.actions) : null,
      targets: baseOptions.target ? parseCsv(baseOptions.target) : null,
    };

    if (options.nonInteractive || options.yes) {
      return {
        ...options,
        actions: normalizeActions(
          options.actions && options.actions.length > 0 ? options.actions : DEFAULT_ACTIONS
        ),
        targets: normalizeTargets(options.targets || DEFAULT_TARGETS),
      };
    }

    const rl = createPromptInterface();
    try {
      const targets = await selectTargetsInteractively(rl, options.targets, operation);
      const actions = await selectActionsInteractively(rl, options.actions, DEFAULT_ACTIONS);

      console.log("");
      console.log(`${ICON.note} ${bold("确认配置")}`);
      console.log(`  - targets: ${targets.join(", ")}`);
      console.log(`  - actions: ${actions.join(", ")}`);
      console.log(`  - dryRun: ${options.dryRun ? "yes" : "no"}`);
      if (options.force) {
        console.log("  - force: yes");
      }

      const confirmation = await ask(rl, `${ICON.note} 继续? [Y/n]: `);
      if (confirmation.toLowerCase() === "n") {
        throw new Error("Operation canceled by user");
      }

      return {
        ...options,
        actions,
        targets,
      };
    } finally {
      rl.close();
    }
  }

  async function confirmAfterPreview(options, operation) {
    if (operation !== "update") {
      return;
    }
    if (options.nonInteractive || options.yes || options.dryRun) {
      return;
    }

    const rl = createPromptInterface();
    try {
      const answer = await ask(rl, `${ICON.note} 预览完成，执行更新写入? [Y/n]: `);
      if (answer.toLowerCase() === "n") {
        throw new Error("Update canceled after preview");
      }
    } finally {
      rl.close();
    }
  }

  async function resolveConflicts(planItems, options) {
    const result = [];

    const conflictItems = planItems.filter((item) => item.decision === "conflict");
    if (conflictItems.length === 0) {
      return [...planItems];
    }

    if (options.force) {
      for (const item of planItems) {
        if (item.decision !== "conflict") {
          result.push(item);
          continue;
        }
        result.push({ ...item, decision: "update", reason: `${item.reason}-forced` });
      }
      return result;
    }

    if (options.nonInteractive || options.yes) {
      for (const item of planItems) {
        if (item.decision !== "conflict") {
          result.push(item);
          continue;
        }
        result.push({ ...item, decision: "skip", reason: `${item.reason}-skipped` });
      }
      return result;
    }

    const rl = createPromptInterface();
    try {
      let bulkDecision = "per-item";

      if (conflictItems.length > 1) {
        console.log("");
        console.log(`${ICON.conflict} ${bold("冲突处理策略")}`);
        console.log(`  ${accent("1")}. 全部覆盖`);
        console.log(`  ${accent("2")}. 全部跳过`);
        console.log(`  ${accent("3")}. 逐个确认`);

        const modeAnswer = await ask(rl, `${ICON.note} 选择 [1/2/3] (默认 3): `);
        const normalized = modeAnswer.toLowerCase();
        if (modeAnswer === "1" || normalized === "o" || normalized === "overwrite") {
          bulkDecision = "overwrite-all";
        } else if (modeAnswer === "2" || normalized === "s" || normalized === "skip") {
          bulkDecision = "skip-all";
        }
      }

      for (const item of planItems) {
        if (item.decision !== "conflict") {
          result.push(item);
          continue;
        }

        if (bulkDecision === "overwrite-all") {
          result.push({
            ...item,
            decision: "update",
            reason: `${item.reason}-interactive-overwrite-all`,
          });
          continue;
        }

        if (bulkDecision === "skip-all") {
          result.push({
            ...item,
            decision: "skip",
            reason: `${item.reason}-interactive-skip-all`,
          });
          continue;
        }

        console.log("");
        console.log(warning(`${ICON.conflict} 检测到冲突`));
        console.log(`  - file: ${item.filePath}`);
        console.log(`  - reason: ${item.reason}`);
        const answer = await ask(
          rl,
          `${ICON.note} 选择 [o] 覆盖 / [s] 跳过 (默认 s): `
        );

        if (answer.toLowerCase() === "o") {
          result.push({
            ...item,
            decision: "update",
            reason: `${item.reason}-interactive-overwrite`,
          });
        } else {
          result.push({
            ...item,
            decision: "skip",
            reason: `${item.reason}-interactive-skip`,
          });
        }
      }

      return result;
    } finally {
      rl.close();
    }
  }

  async function resolveUninstallOptions(baseOptions = {}, manifestFiles = []) {
    const options = {
      nonInteractive: Boolean(baseOptions.nonInteractive),
      yes: Boolean(baseOptions.yes),
      dryRun: Boolean(baseOptions.dryRun),
      targets: baseOptions.target ? parseCsv(baseOptions.target) : null,
      actions: baseOptions.actions ? parseCsv(baseOptions.actions) : null,
    };

    const installedActions = Array.from(new Set((manifestFiles || []).map((item) => item.action)));

    if (options.nonInteractive || options.yes) {
      return {
        ...options,
        targets: normalizeTargets(options.targets || DEFAULT_TARGETS),
        actions: options.actions && options.actions.length > 0
          ? normalizeActions(options.actions)
          : null,
      };
    }

    const rl = createPromptInterface();
    try {
      const targets = await selectTargetsInteractively(rl, options.targets, "uninstall");
      const fallbackActions = installedActions.length > 0 ? installedActions : DEFAULT_ACTIONS;
      const actions = await selectActionsInteractively(rl, options.actions, fallbackActions);

      console.log("");
      console.log(`${ICON.note} ${bold("确认卸载配置")}`);
      console.log(`  - targets: ${targets.join(", ")}`);
      console.log(`  - actions: ${actions.join(", ")}`);
      console.log(`  - dryRun: ${options.dryRun ? "yes" : "no"}`);

      const confirmation = await ask(rl, `${ICON.note} 继续卸载? [y/N]: `);
      if (!["y", "yes"].includes(confirmation.toLowerCase())) {
        throw new Error("Uninstall canceled by user");
      }

      return {
        ...options,
        targets,
        actions,
      };
    } finally {
      rl.close();
    }
  }

  return {
    resolveOptions,
    confirmAfterPreview,
    resolveConflicts,
    resolveUninstallOptions,
  };
}

module.exports = {
  createInstallerInteractiveHelpers,
};
