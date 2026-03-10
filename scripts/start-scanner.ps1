$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolDirs = @()
$tesseractDir = "C:\Program Files\Tesseract-OCR"
$popplerPackageRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe"

if (Test-Path $tesseractDir) {
  $toolDirs += $tesseractDir
}

if (Test-Path $popplerPackageRoot) {
  $popplerBinDir = Get-ChildItem -Path $popplerPackageRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "poppler-*" } |
    Sort-Object Name -Descending |
    Select-Object -First 1 |
    ForEach-Object { Join-Path $_.FullName "Library\bin" }

  if ($popplerBinDir -and (Test-Path $popplerBinDir)) {
    $toolDirs += $popplerBinDir
  }
}

if ($toolDirs.Count -gt 0) {
  $env:PATH = (($toolDirs + @($env:PATH)) -join ";")
}

$pythonCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
  "python",
  "py"
)

$pythonCommand = $null
$pythonArgs = @()

foreach ($candidate in $pythonCandidates) {
  if ($candidate -like "*.exe" -and -not (Test-Path $candidate)) {
    continue
  }

  try {
    if ($candidate -eq "py") {
      & $candidate -3 --version *> $null
      if ($LASTEXITCODE -eq 0) {
        $pythonCommand = $candidate
        $pythonArgs = @("-3", "-m", "uvicorn", "services.scanner.app.main:app", "--reload", "--port", "8001")
        break
      }
    } else {
      & $candidate --version *> $null
      if ($LASTEXITCODE -eq 0) {
        $pythonCommand = $candidate
        $pythonArgs = @("-m", "uvicorn", "services.scanner.app.main:app", "--reload", "--port", "8001")
        break
      }
    }
  } catch {
    continue
  }
}

if (-not $pythonCommand) {
  throw "Python 3.11+ is required to start the scanner service."
}

Write-Host "Using Python command: $pythonCommand"
Write-Host "Starting scanner at http://127.0.0.1:8001 ..."
Set-Location $projectRoot
& $pythonCommand @pythonArgs
