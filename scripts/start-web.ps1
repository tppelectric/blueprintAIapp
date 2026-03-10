$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$webAppPath = Join-Path $projectRoot "apps\web"
$nvmHome = Join-Path $env:LOCALAPPDATA "nvm"
$requiredNodeVersion = "22.15.0"
$versionNodePath = Join-Path (Join-Path $nvmHome "v$requiredNodeVersion") "node.exe"
$activeNodeDir = Split-Path -Parent $versionNodePath

if (-not (Test-Path $versionNodePath)) {
  throw "Node $requiredNodeVersion is not installed at $versionNodePath."
}

$env:PATH = "$activeNodeDir;$env:PATH"
$activeNodeVersion = & node -v

if (-not $activeNodeVersion.StartsWith("v22.")) {
  throw "Expected Node 22 after switching versions, but found $activeNodeVersion."
}

Write-Host "Using Node $activeNodeVersion"
Write-Host "Starting web app at http://127.0.0.1:3000 ..."
Set-Location $webAppPath
& npm.cmd run dev
