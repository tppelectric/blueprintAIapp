$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiHealthUrl = "http://127.0.0.1:4000/health"
$scannerHealthUrl = "http://127.0.0.1:8001/health"
$webUrl = "http://127.0.0.1:3000"
$apiLauncher = Join-Path $PSScriptRoot "start-api-background.ps1"
$scannerLauncher = Join-Path $PSScriptRoot "start-scanner-background.ps1"
$webLauncher = Join-Path $PSScriptRoot "start-web-background.ps1"

function Test-PortOpen {
  param([int]$Port)

  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
  } catch {
    return $false
  }
}

function Wait-ForPortOpen {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-PortOpen -Port $Port) {
      return $true
    }

    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Wait-ForHttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
      continue
    }

    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  return $false
}

if (-not (Test-PortOpen -Port 4000)) {
  & $apiLauncher
}

if (-not (Wait-ForHttpOk -Url $apiHealthUrl)) {
  throw "API server did not become ready at $apiHealthUrl."
}

if (-not (Test-PortOpen -Port 8001)) {
  & $scannerLauncher
}

if (-not (Wait-ForHttpOk -Url $scannerHealthUrl)) {
  throw "Scanner service did not become ready at $scannerHealthUrl."
}

if (-not (Test-PortOpen -Port 3000)) {
  & $webLauncher
}

if (-not (Wait-ForPortOpen -Port 3000)) {
  throw "Web app did not start listening on port 3000."
}

Write-Host "Opening app in your browser..."
Start-Process $webUrl
