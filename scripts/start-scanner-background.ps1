$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "scanner-runtime.log"

function Test-PortOpen {
  param([int]$Port)

  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
  } catch {
    return $false
  }
}

if (Test-PortOpen -Port 8001) {
  Write-Host "Scanner service is already running on port 8001."
  exit 0
}

$command = @(
  '$ErrorActionPreference = "Stop"'
  ('Set-Location "{0}"' -f $projectRoot.Replace('"', '""'))
  '& ".\scripts\start-scanner.ps1" *> scanner-runtime.log'
) -join '; '

Write-Host "Starting scanner service in background on http://127.0.0.1:8001 ..."
Write-Host "Log file: $logPath"

Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden
