# Rebuild web assets, sync to Android, build the debug APK and install it on the device.
# Usage: powershell -File tools/rebuild.ps1 [-Wasm] [-NoInstall]
param([switch]$Wasm, [switch]$NoInstall)
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Wasm) { npm.cmd run wasm; if ($LASTEXITCODE) { exit 1 } }
npx.cmd tsc --noEmit; if ($LASTEXITCODE) { exit 1 }
npx.cmd vite build --logLevel warn; if ($LASTEXITCODE) { exit 1 }
npx.cmd cap sync android | Out-Null
Push-Location android
.\gradlew.bat assembleDebug -q 2>&1 | Where-Object { $_ -notmatch 'unchecked|Xlint' }
Pop-Location
if (-not $NoInstall) { node tools/device.mjs install | Select-Object -First 2 }
