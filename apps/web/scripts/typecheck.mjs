#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const tsBuildInfo = resolve(webRoot, "tsconfig.tsbuildinfo");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rmSync(tsBuildInfo, { force: true });

run("node", ["./scripts/ensure-node-version.mjs"]);
run("npx", ["tsc", "--noEmit", "--incremental", "false"]);
