# build.ps1 — Package ClipCam-AE for release
#
# Produces:
#   dist/ClipCam-AE-v<version>.zip   (portable, always built)
#   dist/ClipCam-AE-v<version>.zxp   (signed, only if ZXPSignCmd is available)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File build.ps1
#
# ZXP signing (optional):
#   Install Adobe ZXPSignCmd from:
#     https://partners.adobe.com/exchangeprogram/creativecloud/support/exchange-developer-tools.html
#   Place ZXPSignCmd.exe somewhere on PATH (or next to build.ps1).
#   On first run, a self-signed certificate is generated at: dist/.cert/selfsign.p12
#   The cert is reused for subsequent builds — do NOT delete it between releases
#   or existing installs will see signature mismatches.

$ErrorActionPreference = "Stop"

$root       = $PSScriptRoot
$manifest   = Join-Path $root "CSXS\manifest.xml"
$distDir    = Join-Path $root "dist"
$stageDir   = Join-Path $distDir ".stage"
$certDir    = Join-Path $distDir ".cert"
$certPath   = Join-Path $certDir "selfsign.p12"
$certPwd    = "clipcam-selfsign"  # local self-signed cert, not a secret
$bundleId   = "com.clipcam.ae"

# Read version from manifest

[xml]$xml = Get-Content $manifest -Raw
$version  = $xml.ExtensionManifest.ExtensionBundleVersion
if (-not $version) { throw "Failed to read ExtensionBundleVersion from manifest.xml" }

Write-Host ""
Write-Host "ClipCam-AE release builder" -ForegroundColor Cyan
Write-Host ("  version: v{0}" -f $version) -ForegroundColor Cyan
Write-Host ""

# Ensure extractor binary is present (fetched from Releases)

$extractor = Join-Path $root "bin\clipcam-extractor.exe"
if (-not (Test-Path $extractor)) {
    Write-Host "[build] extractor binary missing — fetching..." -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "bin\fetch-extractor.ps1")
    if ($LASTEXITCODE -ne 0) { throw "fetch-extractor.ps1 failed" }
}

# Clean + create dist dirs

if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir -Force | Out-Null }

# Stage files
#
# Everything needed at runtime. Dev-only / meta files are excluded.

$include = @(
    "CSXS",
    "css",
    "fonts",
    "img",
    "js",
    "jsx",
    "index.html",
    "LICENSE",
    "README.md",
    "README.en.md",
    "THIRD_PARTY_NOTICES",
    "CHANGELOG.md"
)

foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) {
        Write-Host ("  skip (missing): {0}" -f $item) -ForegroundColor DarkYellow
        continue
    }
    $dst = Join-Path $stageDir $item
    if ((Get-Item $src).PSIsContainer) {
        Copy-Item $src $dst -Recurse -Force
    } else {
        Copy-Item $src $dst -Force
    }
}

# bin/ — only ship the binary itself, not the fetch tooling
$stageBin = Join-Path $stageDir "bin"
New-Item -ItemType Directory -Path $stageBin -Force | Out-Null
Copy-Item $extractor (Join-Path $stageBin "clipcam-extractor.exe") -Force

Write-Host ("  staged -> {0}" -f $stageDir) -ForegroundColor DarkGray

# Build zip

$zipPath = Join-Path $distDir ("ClipCam-AE-v{0}.zip" -f $version)
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Wrap the contents in a top-level "ClipCam-AE" folder so extract-to-CEP works cleanly
$wrapDir = Join-Path $stageDir "ClipCam-AE"
New-Item -ItemType Directory -Path $wrapDir -Force | Out-Null
Get-ChildItem $stageDir -Force | Where-Object { $_.Name -ne "ClipCam-AE" } | ForEach-Object {
    Move-Item $_.FullName (Join-Path $wrapDir $_.Name) -Force
}

Compress-Archive -Path $wrapDir -DestinationPath $zipPath -Force -CompressionLevel Optimal

$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ("[ok] zip:  {0} ({1} MB)" -f $zipPath, $zipSize) -ForegroundColor Green

# Try to build .zxp

$zxpSignPath = $null
$cmd = Get-Command ZXPSignCmd -ErrorAction SilentlyContinue
if ($cmd) {
    $zxpSignPath = $cmd.Source
} else {
    $localZxp = Join-Path $root "ZXPSignCmd.exe"
    if (Test-Path $localZxp) { $zxpSignPath = (Resolve-Path $localZxp).Path }
}

if (-not $zxpSignPath) {
    Write-Host ""
    Write-Host "[skip] .zxp not built — ZXPSignCmd.exe not found." -ForegroundColor Yellow
    Write-Host "       Download from Adobe Exchange Developer Tools:" -ForegroundColor Yellow
    Write-Host "         https://partners.adobe.com/exchangeprogram/creativecloud/support/exchange-developer-tools.html" -ForegroundColor Yellow
    Write-Host "       Place ZXPSignCmd.exe on PATH (or next to build.ps1) and re-run." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Release artifacts:" -ForegroundColor Cyan
    Write-Host ("  {0}" -f $zipPath)
    exit 0
}

# Re-flatten the stage directory back (ZXPSignCmd signs a folder, not the wrapper)
$signInput = Join-Path $distDir ".signroot"
if (Test-Path $signInput) { Remove-Item $signInput -Recurse -Force }
Copy-Item $wrapDir $signInput -Recurse -Force

# Generate self-signed cert on first run
if (-not (Test-Path $certPath)) {
    Write-Host ""
    Write-Host "[cert] generating self-signed certificate (first run only)..." -ForegroundColor Cyan
    & $zxpSignPath -selfSignedCert US CA "ClipCam-AE" "ChenxingM" $certPwd $certPath
    if ($LASTEXITCODE -ne 0) { throw "ZXPSignCmd -selfSignedCert failed ($LASTEXITCODE)" }
    Write-Host ("[cert] saved to {0}" -f $certPath) -ForegroundColor Green
    Write-Host "[cert] KEEP THIS FILE — reuse it for every future release." -ForegroundColor Yellow
}

$zxpPath = Join-Path $distDir ("ClipCam-AE-v{0}.zxp" -f $version)
if (Test-Path $zxpPath) { Remove-Item $zxpPath -Force }

& $zxpSignPath -sign $signInput $zxpPath $certPath $certPwd
if ($LASTEXITCODE -ne 0) { throw "ZXPSignCmd -sign failed ($LASTEXITCODE)" }

Remove-Item $signInput -Recurse -Force

$zxpSize = [math]::Round((Get-Item $zxpPath).Length / 1MB, 2)
Write-Host ("[ok] zxp:  {0} ({1} MB)" -f $zxpPath, $zxpSize) -ForegroundColor Green

# Cleanup stage, keep artifacts

Remove-Item $stageDir -Recurse -Force

Write-Host ""
Write-Host "Release artifacts:" -ForegroundColor Cyan
Write-Host ("  {0}" -f $zipPath)
Write-Host ("  {0}" -f $zxpPath)
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Test-install the .zxp via aescripts ZXP Installer on a clean machine"
Write-Host ("  2. Create a GitHub release: gh release create v{0} {1} {2}" -f $version, $zipPath, $zxpPath)
