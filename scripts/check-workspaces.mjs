import fs from "node:fs";
import path from "node:path";

const requiredDirs = [
  "packages/core",
  "packages/templates",
  "packages/installer",
  "packages/cli",
];

const missing = requiredDirs.filter((dir) => {
  const fullPath = path.resolve(process.cwd(), dir);
  return !fs.existsSync(fullPath);
});

if (missing.length > 0) {
  console.error("Missing workspace directories:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Workspace structure looks good.");

