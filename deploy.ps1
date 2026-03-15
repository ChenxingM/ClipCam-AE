# deploy.ps1 — Create dev symlink for AE CEP extensions
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1

$ErrorActionPreference = "Stop"

$extensionId = "com.clipcam.ae"
$srcDir = $PSScriptRoot
$cepDir = "$env:APPDATA\Adobe\CEP\extensions"
$targetDir = "$cepDir\$extensionId"

# Ensure CEP extensions directory exists
if (-not (Test-Path $cepDir)) {
    New-Item -ItemType Directory -Path $cepDir -Force | Out-Null
    Write-Host "Created: $cepDir" -ForegroundColor Cyan
}

# Remove existing link/directory
if (Test-Path $targetDir) {
    # Check if junction
    $item = Get-Item $targetDir -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c "rmdir `"$targetDir`""
        Write-Host "Removed existing junction" -ForegroundColor Yellow
    } else {
        Remove-Item $targetDir -Recurse -Force
        Write-Host "Removed existing directory" -ForegroundColor Yellow
    }
}

# Create junction
cmd /c "mklink /J `"$targetDir`" `"$srcDir`""

if (Test-Path "$targetDir\index.html") {
    Write-Host "Deployed: $targetDir -> $srcDir" -ForegroundColor Green
} else {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

# Enable unsigned extensions (PlayerDebugMode)
$regPath = "HKCU:\Software\Adobe\CSXS.11"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -Type String

# Also set for older CSXS versions
for ($v = 8; $v -le 12; $v++) {
    $rp = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $rp)) { New-Item -Path $rp -Force | Out-Null }
    Set-ItemProperty -Path $rp -Name "PlayerDebugMode" -Value "1" -Type String
}

Write-Host "PlayerDebugMode enabled for CSXS 8-12" -ForegroundColor Green
Write-Host ""
Write-Host "Restart After Effects to load the panel." -ForegroundColor Cyan
Write-Host "Panel: Window > Extensions > ClipCamAE" -ForegroundColor Cyan
