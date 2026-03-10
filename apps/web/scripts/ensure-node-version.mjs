#!/usr/bin/env node
const version = process.versions.node;
const major = Number(version.split(".")[0] || "0");

if (major < 20 || major > 22) {
  console.error(
    `Unsupported Node.js version ${version} for stable Next.js dev in this project. Use Node 20.x or 22.x LTS.`
  );
  process.exit(1);
}

