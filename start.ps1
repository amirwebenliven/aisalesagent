# Start everything, in order, with a real check at each step.
#
#   .\start.ps1
#
# Opens two terminal windows that keep running after this script exits - the app
# and the worker. Close those windows to stop them.
#
#   .\start.ps1 -Rebuild     force a production rebuild first
#   .\start.ps1 -Dev         run the dev server instead (hot reload, no build)
#
# ASCII only, deliberately: Windows PowerShell 5.1 reads .ps1 as ANSI unless the
# file has a BOM, so a stray em dash in a comment becomes mojibake and takes the
# parser down with it.

param(
    [switch]$Rebuild,
    [switch]$Dev
)

$root = $PSScriptRoot
Set-Location $root

function Step($n) { Write-Host "`n$n" -ForegroundColor Cyan }
function Ok($n)   { Write-Host "  OK   $n" -ForegroundColor Green }
function Warn($n) { Write-Host "  !    $n" -ForegroundColor Yellow }
function Die($n)  { Write-Host "  FAIL $n" -ForegroundColor Red; exit 1 }

# ---- 1. PostgreSQL ---------------------------------------------------------
Step "1/5  PostgreSQL"
$pg = Get-Service "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) { Die "PostgreSQL is not installed as a service." }
if ($pg.Status -ne "Running") {
    Warn "starting $($pg.Name) ..."
    Start-Service $pg.Name
    Start-Sleep -Seconds 3
}
Ok "$($pg.Name) running"

# ---- 2. Docker: redis + waha ----------------------------------------------
# Redis gives the queue durability. WAHA is the WhatsApp bridge. The app runs
# without either (the queue falls back to in-process, WhatsApp is unavailable),
# so a missing Docker is a warning, never a stop.
Step "2/5  Docker (redis + WAHA)"
$engineUp = $false
try { docker version --format "{{.Server.Version}}" 2>$null | Out-Null; $engineUp = ($LASTEXITCODE -eq 0) } catch { }

if (-not $engineUp) {
    $dd = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
    if (Test-Path $dd) {
        Warn "engine down - launching Docker Desktop (can take a minute) ..."
        if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) { Start-Process $dd }
        $deadline = (Get-Date).AddSeconds(150)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 6
            try { docker version --format "{{.Server.Version}}" 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $engineUp = $true; break } } catch { }
        }
    }
}

if ($engineUp) {
    docker compose up -d 2>&1 | Out-Null
    Start-Sleep -Seconds 5
    Ok "redis + WAHA up"
} else {
    Warn "Docker engine not available."
    Warn "  The app still runs. WhatsApp will not work and the queue loses durability."
    Warn "  Open Docker Desktop, wait for 'Engine running', then re-run this script."
}

# ---- 3. Database schema ----------------------------------------------------
Step "3/5  Database"
bun x prisma migrate deploy 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Die "migrations failed - is DATABASE_URL in .env correct?" }
Ok "schema up to date"

# ---- 4. Build --------------------------------------------------------------
# `next start` serves .next, so a dev run (which overwrites it) or a fresh clone
# leaves nothing to serve. Build when missing, or on -Rebuild.
Step "4/5  Build"
if ($Dev) {
    Ok "skipped (dev mode)"
} elseif ($Rebuild -or -not (Test-Path ".next\BUILD_ID")) {
    Warn "building ... (about a minute)"
    # A running server or worker holds Prisma's engine DLL and the build dies
    # with EPERM on Windows. Stop them first.
    Get-Process node, bun -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    bun run build 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { Die "build failed" }
    Ok "built"
} else {
    Ok "existing build found (use -Rebuild to force)"
}

# ---- 5. Start --------------------------------------------------------------
Step "5/5  Starting"

# Free the port, or `next start` exits with EADDRINUSE and the window closes
# before anyone can read why.
$held = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($held) {
    Warn "port 3000 in use - stopping the old process"
    $held | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

$appCmd = "bun run start"
if ($Dev) { $appCmd = "bun run dev" }

$appInner    = "Set-Location '" + $root + "'; Write-Host 'APP' -ForegroundColor Cyan; " + $appCmd
$workerInner = "Set-Location '" + $root + "'; Write-Host 'WORKER - inbound messages appear here' -ForegroundColor Cyan; bun worker/index.ts"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $appInner
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", $workerInner

Write-Host "`nWaiting for the app ..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
$up = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { }
}

if ($up) {
    Write-Host "`n  Ready - http://localhost:3000`n" -ForegroundColor Green
    Write-Host "  Two windows opened: APP and WORKER. Leave them open." -ForegroundColor Gray
    Write-Host "  Inbound WhatsApp and Telegram messages appear in the WORKER window." -ForegroundColor Gray
    Write-Host "  Check setup any time:  bun scripts\status.ts`n" -ForegroundColor Gray
    Start-Process "http://localhost:3000"
} else {
    Write-Host "`n  The app did not answer in 90s. Look at the APP window for the error.`n" -ForegroundColor Red
}
