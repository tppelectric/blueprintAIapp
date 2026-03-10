$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiPath = Join-Path $projectRoot "services\api"
$nvmHome = Join-Path $env:LOCALAPPDATA "nvm"
$requiredNodeVersion = "22.15.0"
$versionNodeDir = Join-Path $nvmHome "v$requiredNodeVersion"
$nodeExe = Join-Path $versionNodeDir "node.exe"
$npmCmd = Join-Path $versionNodeDir "npm.cmd"
$builtApiEntry = Join-Path $apiPath "dist\index.js"

if (-not (Test-Path $nodeExe)) {
  throw "Node $requiredNodeVersion is not installed at $nodeExe."
}

if (-not (Test-Path $builtApiEntry)) {
  throw "Built API server was not found at $builtApiEntry."
}

$env:PATH = "$versionNodeDir;$env:PATH"
$activeNodeVersion = & $nodeExe -v

if (-not $activeNodeVersion.StartsWith("v22.")) {
  throw "Expected Node 22, but found $activeNodeVersion."
}

Write-Host "Using Node $activeNodeVersion"
Write-Host "Starting API at http://127.0.0.1:4000 ..."
Set-Location $apiPath
& $nodeExe ".\dist\index.js"
