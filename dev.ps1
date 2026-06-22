<#
.SYNOPSIS  Start Insanitomeium dev environment via Docker Compose.
.PARAMETER RunE2E  After the stack is healthy, run the full Playwright e2e suite.
.EXAMPLE   .\dev.ps1
.EXAMPLE   .\dev.ps1 -RunE2E
#>

param (
  [switch]$RunE2E
)

$Root   = $PSScriptRoot
$LogDir = "$Root\logs"
$Stamp  = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── Ensure Docker Desktop is running ───────────────────────────────────────────

$dockerReady = $false
try {
  docker info 2>&1 | Out-Null
  $dockerReady = ($LASTEXITCODE -eq 0)
} catch {}

if (-not $dockerReady) {
  Write-Host "Docker Desktop is not running. Attempting to start it..." -ForegroundColor Yellow
  $desktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $desktopExe) {
    Start-Process $desktopExe
    Write-Host "Waiting for Docker daemon (up to 2 min)..." -ForegroundColor Yellow
    $attempts = 0
    do {
      Start-Sleep -Seconds 5
      $attempts++
      try { docker info 2>&1 | Out-Null } catch {}
    } while ($LASTEXITCODE -ne 0 -and $attempts -lt 24)

    if ($LASTEXITCODE -ne 0) {
      Write-Host "Docker Desktop did not become ready after 2 minutes. Aborting." -ForegroundColor Red
      exit 1
    }
    Write-Host "Docker Desktop is ready." -ForegroundColor Green
  } else {
    Write-Host "Docker Desktop not found at '$desktopExe'. Please start it manually and re-run." -ForegroundColor Red
    exit 1
  }
}

# ── Tear down any existing stack ────────────────────────────────────────────────

Write-Host "Stopping any existing dev containers..." -ForegroundColor Yellow
& docker compose --env-file .env.dev -f docker-compose.dev.yml down 2>&1 | Out-Null
Write-Host "Done." -ForegroundColor DarkGray

# ── Start the dev stack in a new window ─────────────────────────────────────────

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; Write-Host 'Starting dev containers...' -ForegroundColor Cyan; " +
    "docker compose --env-file .env.dev -f docker-compose.dev.yml up --build -V 2>&1 | " +
    "ForEach-Object { `$_ | Out-File -Append -Encoding utf8 '$LogDir\dev_$Stamp.log'; `$_ }"
)

Write-Host ""
Write-Host "Insanitomeium dev environment starting..." -ForegroundColor White
Write-Host "  App     http://localhost:5173" -ForegroundColor Green
Write-Host "  API     http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log: $LogDir\dev_$Stamp.log" -ForegroundColor DarkGray

# ── Optional e2e test run ────────────────────────────────────────────────────────

if ($RunE2E) {
  Write-Host ""
  Write-Host "Waiting for API health before running e2e tests..." -ForegroundColor Yellow
  $healthy  = $false
  $attempts = 0
  do {
    Start-Sleep -Seconds 3
    $attempts++
    try {
      $resp = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
      if ($resp.StatusCode -eq 200) { $healthy = $true }
    } catch {}
  } while (-not $healthy -and $attempts -lt 20)

  if (-not $healthy) {
    Write-Host "API did not become healthy after 60 s. Skipping e2e run." -ForegroundColor Red
  } else {
    Write-Host "API is healthy. Running Playwright e2e suite..." -ForegroundColor Cyan
    Set-Location $Root
    npm run e2e 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host ""
      Write-Host "e2e PASS" -ForegroundColor Green
    } else {
      Write-Host ""
      Write-Host "e2e FAIL (exit $LASTEXITCODE)" -ForegroundColor Red
    }
  }
}
