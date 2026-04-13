# fetch-extractor.ps1 — Download and verify the clipcam-extractor binary
#
# The extractor binary is a closed-source Rust tool that reads .clip files
# and emits .clipcam format. It is distributed via GitHub Releases, not
# committed to this repository.
#
# This script reads bin/extractor.lock.json, downloads the pinned version
# if missing, and verifies the SHA-256 hash. Safe to re-run — it's a no-op
# once the binary is present and valid.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File bin/fetch-extractor.ps1
#   powershell -ExecutionPolicy Bypass -File bin/fetch-extractor.ps1 -Force
#
# Exit codes:
#   0 — binary present and valid
#   1 — download failed
#   2 — hash mismatch (binary deleted, re-run to retry)
#   3 — lock file missing or malformed

param(
    [switch]$Force  # Force re-download even if binary already exists
)

$ErrorActionPreference = "Stop"

$binDir    = $PSScriptRoot
$lockPath  = Join-Path $binDir "extractor.lock.json"

if (-not (Test-Path $lockPath)) {
    Write-Host "[fetch-extractor] bin/extractor.lock.json not found" -ForegroundColor Red
    exit 3
}

try {
    $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "[fetch-extractor] failed to parse extractor.lock.json: $_" -ForegroundColor Red
    exit 3
}

$targetPath = Join-Path $binDir $lock.filename
$expectedHash = $lock.sha256.ToUpper()

# Short-circuit if already valid

if ((Test-Path $targetPath) -and -not $Force) {
    $actualHash = (Get-FileHash $targetPath -Algorithm SHA256).Hash.ToUpper()
    if ($actualHash -eq $expectedHash) {
        Write-Host ("[fetch-extractor] {0} v{1} present and valid ({2} bytes)" -f $lock.filename, $lock.version, (Get-Item $targetPath).Length) -ForegroundColor DarkGray
        exit 0
    }
    Write-Host "[fetch-extractor] existing binary has wrong hash, re-downloading" -ForegroundColor Yellow
    Write-Host ("  expected: {0}" -f $expectedHash) -ForegroundColor DarkYellow
    Write-Host ("  actual:   {0}" -f $actualHash)  -ForegroundColor DarkYellow
    Remove-Item $targetPath -Force
}

# Download

Write-Host ""
Write-Host ("[fetch-extractor] downloading {0} v{1}" -f $lock.name, $lock.version) -ForegroundColor Cyan
Write-Host ("  from: {0}" -f $lock.url) -ForegroundColor DarkGray
Write-Host ("  to:   {0}" -f $targetPath) -ForegroundColor DarkGray

$tmpPath = "$targetPath.downloading"
if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force }

# Force TLS 1.2 — old PowerShell defaults to SSL3/TLS 1.0 and GitHub rejects both
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    # Invoke-WebRequest with a UserAgent — GitHub Releases sometimes rejects default .NET UA
    Invoke-WebRequest -Uri $lock.url -OutFile $tmpPath -UseBasicParsing `
        -UserAgent "ClipCam-AE-fetch-extractor/1.0" -ErrorAction Stop
} catch {
    Write-Host ""
    Write-Host "[fetch-extractor] download failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "If you cannot reach GitHub, you can place the binary manually:" -ForegroundColor Yellow
    Write-Host ("  1. Download: {0}" -f $lock.url) -ForegroundColor Yellow
    Write-Host ("  2. Save as:  {0}" -f $targetPath) -ForegroundColor Yellow
    Write-Host ("  3. Verify SHA-256 matches: {0}" -f $expectedHash) -ForegroundColor Yellow
    if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force }
    exit 1
}

# Verify hash

$actualHash = (Get-FileHash $tmpPath -Algorithm SHA256).Hash.ToUpper()
if ($actualHash -ne $expectedHash) {
    Write-Host ""
    Write-Host "[fetch-extractor] SHA-256 MISMATCH — refusing to use this file" -ForegroundColor Red
    Write-Host ("  expected: {0}" -f $expectedHash) -ForegroundColor Red
    Write-Host ("  actual:   {0}" -f $actualHash)  -ForegroundColor Red
    Remove-Item $tmpPath -Force
    exit 2
}

# Atomic rename into place

Move-Item $tmpPath $targetPath -Force

$size = (Get-Item $targetPath).Length
Write-Host ("[fetch-extractor] ok — {0} v{1} ({2} bytes, sha256 verified)" -f $lock.filename, $lock.version, $size) -ForegroundColor Green
exit 0
