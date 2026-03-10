#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function runCommand(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", shell: false });
    return {
      ok: result.status === 0,
      output: `${result.stdout || ""}${result.stderr || ""}`.trim()
    };
  } catch (error) {
    return { ok: false, output: String(error) };
  }
}

function commandExists(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return runCommand(locator, [command]).ok;
}

function resolvePopplerPdfInfoPath() {
  if (process.platform !== "win32") {
    return null;
  }

  const localAppData = process.env.LOCALAPPDATA || process.env.LocalAppData || "";
  if (!localAppData) {
    return null;
  }

  const wingetPackageRoot = `${localAppData}\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe`;
  if (!existsSync(wingetPackageRoot)) {
    return null;
  }

  return wingetPackageRoot;
}

function checkNodeVersion() {
  const version = process.versions.node;
  const major = Number(version.split(".")[0] || "0");
  const supported = major >= 20 && major <= 22;
  return {
    ok: supported,
    message: supported
      ? `Node.js ${version} detected (supported).`
      : `Node.js ${version} detected. Recommended: Node 20.x or 22.x LTS for Next.js dev stability.`
  };
}

function checkPnpm() {
  const result = commandExists("pnpm");
  return {
    ok: true,
    message: result
      ? "pnpm is available."
      : "pnpm is not available in PATH. This is optional because root scripts can run through npm."
  };
}

function checkPython() {
  const localAppData = process.env.LOCALAPPDATA || process.env.LocalAppData || "";
  const installedPython =
    process.platform === "win32" && localAppData
      ? `${localAppData}\\Programs\\Python\\Python311\\python.exe`
      : null;
  if (installedPython && existsSync(installedPython)) {
    return { ok: true, message: `Python executable found at ${installedPython}` };
  }
  const commands = [
    ["python", ["--version"]],
    ["py", ["-3", "--version"]]
  ];

  for (const [command, args] of commands) {
    const result = runCommand(command, args);
    if (result.ok) {
      return { ok: true, message: result.output };
    }
  }

  return {
    ok: false,
    message: "Python 3 not found. Scanner service cannot run until Python 3.10+ is installed."
  };
}

function checkPoppler() {
  const installedPath = resolvePopplerPdfInfoPath();
  const available = Boolean(installedPath || commandExists("pdfinfo"));
  return {
    ok: available,
    message: available
      ? `Poppler pdfinfo is available${installedPath ? ` at ${installedPath}` : " for PDF page rendering"}.`
      : "Poppler pdfinfo is not available in PATH. Real PDF scanning will fail until Poppler is installed and added to PATH."
  };
}

function checkTesseract() {
  const installedPath = process.platform === "win32" ? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe" : null;
  const available = Boolean((installedPath && existsSync(installedPath)) || commandExists("tesseract"));
  return {
    ok: available,
    message: available
      ? `Tesseract OCR is available${installedPath && existsSync(installedPath) ? ` at ${installedPath}` : ""}.`
      : "Tesseract OCR is not available in PATH. Real OCR extraction will fail until Tesseract is installed and added to PATH."
  };
}

const checks = [checkNodeVersion(), checkPnpm(), checkPython(), checkPoppler(), checkTesseract()];
let failed = 0;
for (const check of checks) {
  const tag = check.ok ? "OK" : "FAIL";
  console.log(`[${tag}] ${check.message}`);
  if (!check.ok) {
    failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
