#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const targetScript = process.argv[2];
if (!targetScript) {
  console.error("Usage: node scripts/workspace-runner.mjs <script>");
  process.exit(1);
}

const workspaces = [
  "packages/types",
  "packages/shared",
  "services/api",
  "apps/web",
  "apps/mobile"
];

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

let failures = 0;
for (const workspace of workspaces) {
  const workspaceDir = resolve(repoRoot, workspace);
  const packageJson = resolve(workspaceDir, "package.json");
  if (!existsSync(packageJson)) {
    continue;
  }
  const parsed = JSON.parse(readFileSync(packageJson, "utf8"));
  if (!parsed.scripts || typeof parsed.scripts[targetScript] !== "string") {
    console.log(`\n==> ${workspace}: skipped (no '${targetScript}' script)`);
    continue;
  }

  console.log(`\n==> ${workspace}: npm run ${targetScript}`);
  const result = spawnSync(npmCmd, ["run", targetScript], {
    cwd: workspaceDir,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) {
    console.error(`Failed to spawn command in ${workspace}: ${result.error.message}`);
    failures += 1;
    continue;
  }
  if (result.status !== 0) {
    failures += 1;
  }
}

process.exit(failures === 0 ? 0 : 1);
