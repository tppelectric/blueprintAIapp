$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiHealthUrl = "http://127.0.0.1:4000/health"
$scannerHealthUrl = "http://127.0.0.1:8001/health"
$webUrl = "http://127.0.0.1:3000"
$apiLauncher = Join-Path $projectRoot "Start API Server.cmd"
$scannerLauncher = Join-Path $projectRoot "Start Scanner Service.cmd"
$webLauncher = Join-Path $projectRoot "Start Web App.cmd"

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
  Write-Host "Starting API server..."
  Start-Process -FilePath $apiLauncher
} else {
  Write-Host "API server is already running."
}

if (-not (Wait-ForHttpOk -Url $apiHealthUrl)) {
  throw "API server did not become ready at $apiHealthUrl."
}

if (-not (Test-PortOpen -Port 8001)) {
  Write-Host "Starting scanner service..."
  Start-Process -FilePath $scannerLauncher
} else {
  Write-Host "Scanner service is already running."
}

if (-not (Wait-ForHttpOk -Url $scannerHealthUrl)) {
  throw "Scanner service did not become ready at $scannerHealthUrl."
}

if (-not (Test-PortOpen -Port 3000)) {
  Write-Host "Starting web app..."
  Start-Process -FilePath $webLauncher
} else {
  Write-Host "Web app is already running."
}

if (-not (Wait-ForPortOpen -Port 3000)) {
  throw "Web app did not start listening on port 3000."
}

Write-Host "Opening app in your browser..."
Start-Process $webUrl
