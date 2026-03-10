#!/usr/bin/env node
const baseUrl = process.env.WEB_BASE_URL || "http://127.0.0.1:3000";

const pageChecks = [
  { path: "/", text: "Project Dashboard" },
  { path: "/auth/sign-in", text: "Company Sign In" },
  { path: "/projects", text: "Projects" },
  { path: "/platform/fixture-library", text: "Search Fixtures and Devices" },
  { path: "/projects/p-001/export", text: "JobTread Export" }
];

const apiChecks = [
  { path: "/api/auth/session", text: "signedIn" },
  { path: "/api/platform/dashboard", text: "dashboard" },
  { path: "/api/projects", text: "projects" },
  { path: "/api/projects/p-001/exports", text: "exports" }
];

async function assertResponse(path, expectedText) {
  const url = `${baseUrl}${path}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Expected ${url} to return 200, received ${response.status}.`);
      }

      const body = await response.text();
      if (!body.includes(expectedText)) {
        throw new Error(`Expected ${url} to include "${expectedText}".`);
      }

      console.log(`[PASS] ${path}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  try {
    for (const check of pageChecks) {
      await assertResponse(check.path, check.text);
    }

    for (const check of apiChecks) {
      await assertResponse(check.path, check.text);
    }

    console.log("Web smoke tests passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error(`Make sure the web app is running at ${baseUrl} before running this smoke test.`);
    process.exit(1);
  }
}

await main();
