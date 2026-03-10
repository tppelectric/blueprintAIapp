param(
  [string]$ApiUrl = "http://127.0.0.1:4000",
  [string]$ScannerUrl = "http://127.0.0.1:8001",
  [string]$WebUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-CommandRuns {
  param(
    [string]$FilePath,
    [string]$Arguments
  )
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -NoNewWindow -PassThru -Wait -ErrorAction Stop
    return $process.ExitCode -eq 0
  } catch {
    return $false
  }
}

function Test-HttpOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Write-Check {
  param(
    [string]$Label,
    [bool]$Passed,
    [string]$Detail
  )

  if ($Passed) {
    Write-Host "[PASS] $Label - $Detail" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $Label - $Detail" -ForegroundColor Red
  }
}

$checks = @()

$nodeOk = Test-CommandExists "node"
$checks += $nodeOk
Write-Check "Node.js" $nodeOk "Required for web/API services."

$pythonOk = $false
$installedPython = Join-Path $env:LocalAppData "Programs\Python\Python311\python.exe"
if (Test-Path $installedPython) {
  $pythonOk = Test-CommandRuns $installedPython "--version"
}
if (-not $pythonOk -and (Test-CommandExists "python")) {
  $pythonOk = Test-CommandRuns "python" "--version"
}
if (-not $pythonOk -and (Test-CommandExists "py")) {
  $pythonOk = Test-CommandRuns "py" "-3 --version"
}
$checks += $pythonOk
Write-Check "Python runtime" $pythonOk "Required for scanner service (FastAPI/OCR)."

$envOk = Test-Path ".env"
$checks += $envOk
Write-Check ".env file" $envOk "Project root should contain .env."

$webOk = Test-HttpOk $WebUrl
$checks += $webOk
Write-Check "Web app health" $webOk "$WebUrl must return HTTP 2xx."

$apiOk = Test-HttpOk "$ApiUrl/health"
$checks += $apiOk
Write-Check "API health" $apiOk "$ApiUrl/health must return HTTP 2xx."

$schemaOk = Test-HttpOk "$ApiUrl/health/schema"
$checks += $schemaOk
Write-Check "API schema check endpoint" $schemaOk "$ApiUrl/health/schema must return HTTP 2xx."

$scannerOk = Test-HttpOk "$ScannerUrl/health"
$checks += $scannerOk
Write-Check "Scanner health" $scannerOk "$ScannerUrl/health must return HTTP 2xx for real plan processing."

$allPassed = ($checks -notcontains $false)
if ($allPassed) {
  Write-Host ""
  Write-Host "Field-test preflight complete: READY" -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Field-test preflight complete: NOT READY" -ForegroundColor Yellow
Write-Host "Fix FAIL items first, then run this script again."
exit 1
