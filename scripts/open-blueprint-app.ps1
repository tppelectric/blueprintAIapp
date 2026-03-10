$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$fullAppLauncher = Join-Path $PSScriptRoot "open-full-app.ps1"

if (-not (Test-Path $fullAppLauncher)) {
  throw "Blueprint launcher not found at $fullAppLauncher."
}

Write-Host "Opening AI Blueprint Scan App in VS Code..."
Start-Process code -ArgumentList $projectRoot

Write-Host "Starting AI Blueprint Scan App services..."
& $fullAppLauncher
