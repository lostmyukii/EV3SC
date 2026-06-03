$ErrorActionPreference = "Stop"

$InstallRoot = "$env:LOCALAPPDATA\Programs\VSLE\WeisileLink"
$ConfigRoot = "$env:LOCALAPPDATA\VSLE\WeisileLink"
$LogRoot = "$env:LOCALAPPDATA\VSLE\WeisileLink\logs"
$DiagnosticsRoot = "$env:LOCALAPPDATA\VSLE\WeisileLink\diagnostics"
$StartupRoot = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$ShortcutPath = Join-Path $StartupRoot "WeisileLink.cmd"

$Env:WEISILE_LINK_HOST = "127.0.0.1"
$Env:WEISILE_LINK_PORT = "20111"
$Env:TRAINER_WS_PORT = "8766"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $DiagnosticsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $StartupRoot | Out-Null

$Executable = Join-Path $InstallRoot "WeisileLink.exe"
$NativeAdapter = Join-Path $InstallRoot "native\WeisileEV3BluetoothAdapter.exe"
if (-not (Test-Path $Executable)) {
    throw "Missing $Executable. Install the signed WeisileLink.exe bundle first."
}

$Shortcut = @"
@echo off
setlocal
set WEISILE_LINK_HOST=127.0.0.1
set WEISILE_LINK_PORT=20111
set TRAINER_WS_PORT=8766
set VSLE_NATIVE_ARGS=
if exist "$NativeAdapter" set VSLE_NATIVE_ARGS=--native-adapter "$NativeAdapter"
start "" "$Executable" desktop-supervise --host 127.0.0.1 --port 20111 --trainer-port 8766 %VSLE_NATIVE_ARGS% --open-scratchai
"@

Set-Content -Path $ShortcutPath -Encoding ASCII -Value $Shortcut

Write-Host "WeisileLink startup entry installed with desktop-supervise localhost defaults."
