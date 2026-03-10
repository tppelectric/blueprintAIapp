$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$webAppPath = Join-Path $projectRoot "apps\web"
$logPath = Join-Path $projectRoot "web-runtime.log"
$nvmHome = Join-Path $env:LOCALAPPDATA "nvm"
$requiredNodeVersion = "22.15.0"
$versionNodePath = Join-Path (Join-Path $nvmHome "v$requiredNodeVersion") "node.exe"
$activeNodeDir = Split-Path -Parent $versionNodePath

function Test-PortOpen {
  param([int]$Port)

  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
  } catch {
    return $false
  }
}

if (Test-PortOpen -Port 3000) {
  Write-Host "Web app is already running on port 3000."
  exit 0
}

if (-not (Test-Path $versionNodePath)) {
  throw "Node $requiredNodeVersion is not installed at $versionNodePath."
}

$command = @(
  '$ErrorActionPreference = "Stop"'
  ('$env:PATH = "{0};$env:PATH"' -f $activeNodeDir.Replace('"', '""'))
  ('Set-Location "{0}"' -f $webAppPath.Replace('"', '""'))
  'npm.cmd run dev *> web-runtime.log'
) -join '; '

Write-Host "Starting web app in background on http://127.0.0.1:3000 ..."
Write-Host "Log file: $logPath"

Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden
