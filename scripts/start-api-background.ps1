$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "api-runtime.log"

function Test-PortOpen {
  param([int]$Port)

  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
  } catch {
    return $false
  }
}

if (Test-PortOpen -Port 4000) {
  Write-Host "API server is already running on port 4000."
  exit 0
}

$command = @(
  '$ErrorActionPreference = "Stop"'
  ('Set-Location "{0}"' -f $projectRoot.Replace('"', '""'))
  '& ".\scripts\start-api.ps1" *> api-runtime.log'
) -join '; '

Write-Host "Starting API server in background on http://127.0.0.1:4000 ..."
Write-Host "Log file: $logPath"

Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden
