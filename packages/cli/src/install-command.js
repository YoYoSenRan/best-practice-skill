const https = require("node:https");

function createInstallCommandRunner(context) {
  const {
    ICON,
    printHeader,
    success,
    warning,
    muted,
    packageName,
    packageVersion,
    installWithOptions,
    updateWithOptions,
    listInstalled,
    uninstallAll,
    rollbackWithOptions,
    getInstallerOptions,
    getRollbackOptions,
  } = context;

  function parseSemver(value) {
    if (!value) {
      return [0, 0, 0];
    }
    const plain = String(value).trim().replace(/^v/i, "");
    const numbers = plain.split(".").map((item) => Number(item.replace(/[^0-9].*$/, "")) || 0);
    return [numbers[0] || 0, numbers[1] || 0, numbers[2] || 0];
  }

  function compareSemver(a, b) {
    const left = parseSemver(a);
    const right = parseSemver(b);
    for (let i = 0; i < 3; i += 1) {
      if (left[i] > right[i]) {
        return 1;
      }
      if (left[i] < right[i]) {
        return -1;
      }
    }
    return 0;
  }

  function fetchLatestVersionFromNpm(targetPackageName) {
    return new Promise((resolve) => {
      const url = `https://registry.npmjs.org/${encodeURIComponent(targetPackageName)}/latest`;
      const request = https.get(url, { timeout: 3500 }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(null);
          return;
        }

        let raw = "";
        response.setEncoding("utf-8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(raw);
            const latest = payload && typeof payload.version === "string"
              ? payload.version.trim()
              : null;
            resolve(latest || null);
          } catch (error) {
            resolve(null);
          }
        });
      });

      request.on("timeout", () => {
        request.destroy();
        resolve(null);
      });
      request.on("error", () => {
        resolve(null);
      });
    });
  }

  async function printVersionHintIfNeeded() {
    const latest = await fetchLatestVersionFromNpm(packageName);
    if (!latest) {
      console.log(`${ICON.note} ${muted("Skip remote version check (npm unavailable or package not published yet)")}`);
      return;
    }

    const cmp = compareSemver(latest, packageVersion);
    if (cmp > 0) {
      console.log(`${ICON.update} ${warning(`Found newer package: ${latest} (current ${packageVersion})`)}`);
      console.log(`${ICON.note} ${muted(`Tip: npx ${packageName}@latest update`)}`);
      return;
    }

    console.log(`${ICON.ok} ${success(`You are on latest version (${packageVersion})`)}`);
  }

  async function runInstall(options) {
    const result = await installWithOptions(getInstallerOptions(options));
    console.log(`${ICON.ok} ${success("Install workflow completed")}: ${result.mode}`);
    if (result.reportPath) {
      console.log(`${ICON.note} report: ${result.reportPath}`);
    }
  }

  async function runUpdate(options) {
    printHeader("Update", ICON.update);
    await printVersionHintIfNeeded();
    const result = await updateWithOptions(getInstallerOptions(options));
    console.log(`${ICON.ok} ${success("Update workflow completed")}: ${result.mode}`);
    if (result.reportPath) {
      console.log(`${ICON.note} update report: ${result.reportPath}`);
    }
  }

  function runListInstalled() {
    printHeader("Installed Files", ICON.list);
    const files = listInstalled();
    if (files.length === 0) {
      console.log(`${ICON.warn} ${warning("No installed files tracked in manifest")}`);
      return;
    }
    for (const file of files) {
      console.log(`${ICON.ok} ${file.target}:${file.action} -> ${file.path}`);
    }
  }

  async function runUninstall(options) {
    printHeader("Uninstall", ICON.uninstall);
    const result = await uninstallAll(getInstallerOptions(options));
    console.log(`${ICON.warn} Mode: ${result.mode}`);
    if (result.removed.length === 0 && result.selected.length === 0) {
      console.log(`${ICON.note} ${warning("No installed files matched uninstall filters")}`);
    }
  }

  async function runRollback(options) {
    printHeader("Rollback", ICON.rollback);
    const result = await rollbackWithOptions(getRollbackOptions(options));
    console.log(`${ICON.ok} ${success("Rollback workflow completed")}: ${result.mode}`);
    if (result.reportPath) {
      console.log(`${ICON.note} rollback report: ${result.reportPath}`);
    }
  }

  return {
    runInstall,
    runUpdate,
    runListInstalled,
    runUninstall,
    runRollback,
  };
}

module.exports = {
  createInstallCommandRunner,
};
