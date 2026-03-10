$ErrorActionPreference = "Stop"

$blueprintLauncher = Join-Path $PSScriptRoot "open-blueprint-app.ps1"
$secondLauncher = Join-Path $PSScriptRoot "open-second-app.ps1"

if (-not (Test-Path $blueprintLauncher)) {
  throw "Blueprint launcher not found at $blueprintLauncher."
}

if (-not (Test-Path $secondLauncher)) {
  throw "Second app launcher not found at $secondLauncher."
}

Write-Host "Opening Blueprint app and second app in separate PowerShell windows..."
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $blueprintLauncher)
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $secondLauncher)
