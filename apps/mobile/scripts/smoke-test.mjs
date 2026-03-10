#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = process.cwd();
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:4000";

const requiredFiles = [
  { path: "app/_layout.tsx", text: "Stack.Screen name=\"index\"" },
  { path: "app/index.tsx", text: "Open Takeoff Snapshot" },
  { path: "app/takeoff.tsx", text: "Room Takeoff Snapshot" },
  { path: "features/api.ts", text: "EXPO_PUBLIC_API_BASE_URL" },
  { path: "features/mockData.ts", text: "mobileSummary" }
];

const apiChecks = [
  { path: "/api/projects/p-001/dashboard", key: "dashboard" },
  { path: "/api/projects/p-001/takeoff", key: "takeoffs" }
];

function assertFileContains(relativePath, expectedText) {
  const fullPath = resolve(mobileRoot, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required mobile file: ${relativePath}`);
  }

  const content = readFileSync(fullPath, "utf8");
  if (!content.includes(expectedText)) {
    throw new Error(`Expected ${relativePath} to include "${expectedText}".`);
  }

  console.log(`[PASS] ${relativePath}`);
}

async function assertApi(path, key) {
  const url = `${apiBaseUrl}${path}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Expected ${url} to return 200, received ${response.status}.`);
  }

  const payload = await response.json();
  if (!(key in payload)) {
    throw new Error(`Expected ${url} response to include "${key}".`);
  }

  console.log(`[PASS] ${path}`);
}

async function main() {
  try {
    for (const file of requiredFiles) {
      assertFileContains(file.path, file.text);
    }

    for (const check of apiChecks) {
      await assertApi(check.path, check.key);
    }

    console.log("Mobile smoke tests passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("Make sure the API is running before running this mobile smoke test.");
    process.exit(1);
  }
}

await main();
