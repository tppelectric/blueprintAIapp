import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { ensureRequiredDbSchema } from "./db/schema-guard.js";
import { startMaterialPriceScheduler } from "./jobs/material-price-scheduler.js";

function loadRepoEnvFile(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(currentDir, "../../../.env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function start() {
  try {
    loadRepoEnvFile();
    await ensureRequiredDbSchema();
    const app = await buildApp();
    const port = Number(process.env.API_PORT ?? 4000);
    await app.listen({ port, host: "0.0.0.0" });

    startMaterialPriceScheduler({
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
      error: (msg) => app.log.error(msg)
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void start();
