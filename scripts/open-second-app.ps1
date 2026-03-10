$ErrorActionPreference = "Stop"

$secondAppPath = "C:\Users\tppel\codex\tpp-inventory"

if (-not (Test-Path $secondAppPath)) {
  throw "Second app folder not found at $secondAppPath."
}

Write-Host "Opening second app in VS Code..."
Start-Process code -ArgumentList $secondAppPath

Write-Host "Starting second app..."
Set-Location $secondAppPath
& npm.cmd run start
