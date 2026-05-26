$ErrorActionPreference = "Stop"

$StartupRoot = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$ShortcutPath = Join-Path $StartupRoot "WeisileLink.cmd"

if (Test-Path $ShortcutPath) {
    Remove-Item -Force $ShortcutPath
}

Write-Host "WeisileLink startup entry removed. Diagnostics and logs are preserved."
