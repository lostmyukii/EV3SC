$ErrorActionPreference = "Stop"

$InstallRoot = "$env:LOCALAPPDATA\Programs\VSLE\WeisileLink"
$LogRoot = "$env:LOCALAPPDATA\VSLE\WeisileLink\logs"
$StartupRoot = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$ShortcutPath = Join-Path $StartupRoot "WeisileLink.cmd"

$Env:WEISILE_LINK_HOST = "127.0.0.1"
$Env:WEISILE_LINK_PORT = "20111"
$Env:TRAINER_WS_PORT = "8766"
$Env:WEISILE_TRANSPORT = "wifi"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $StartupRoot | Out-Null

$Executable = Join-Path $InstallRoot "WeisileLink.exe"
if (-not (Test-Path $Executable)) {
    throw "Missing $Executable. Install the signed WeisileLink.exe bundle first."
}

Set-Content -Path $ShortcutPath -Encoding ASCII -Value "@echo off`r`nset WEISILE_LINK_HOST=127.0.0.1`r`nset WEISILE_LINK_PORT=20111`r`nset TRAINER_WS_PORT=8766`r`nset WEISILE_TRANSPORT=wifi`r`nstart """" ""$Executable"""

Write-Host "WeisileLink startup entry installed with localhost defaults."
