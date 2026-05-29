#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Python,
    [string]$SignIdentity = $env:WEISILE_WINDOWS_SIGN_IDENTITY,
    [string]$TimestampUrl = $env:WEISILE_WINDOWS_TIMESTAMP_URL,
    [string]$Version = "0.1.0",
    [string]$ExecutableOutput = "desktop/build/windows",
    [string]$ReleaseOutput = "desktop/release/windows"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Resolve-Python {
    param([string]$RequestedPython)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
        return $RequestedPython
    }

    $venvPython = Join-Path (Resolve-RepoRoot) ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    return "python"
}

function Invoke-CheckedPython {
    param(
        [string]$PythonExe,
        [string[]]$Arguments
    )

    & $PythonExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $PythonExe $($Arguments -join ' ')"
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "Windows release build must run on a Windows build host."
}

if ([string]::IsNullOrWhiteSpace($SignIdentity)) {
    throw "Set WEISILE_WINDOWS_SIGN_IDENTITY or pass -SignIdentity."
}

if ([string]::IsNullOrWhiteSpace($TimestampUrl)) {
    throw "Set WEISILE_WINDOWS_TIMESTAMP_URL or pass -TimestampUrl."
}

if (-not ($TimestampUrl.StartsWith("http://") -or $TimestampUrl.StartsWith("https://"))) {
    throw "TimestampUrl must start with http:// or https://."
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot
$pythonExe = Resolve-Python -RequestedPython $Python
$executablePath = Join-Path $ExecutableOutput "WeisileLink.exe"

Invoke-CheckedPython -PythonExe $pythonExe -Arguments @(
    "desktop/scripts/build_weisilelink_executable.py",
    "--target",
    "windows",
    "--output",
    $ExecutableOutput,
    "--clean"
)

Invoke-CheckedPython -PythonExe $pythonExe -Arguments @(
    "desktop/scripts/check_windows_release_preflight.py",
    "--executable",
    $executablePath,
    "--sign-identity",
    $SignIdentity,
    "--timestamp-url",
    $TimestampUrl,
    "--json-report",
    "docs/desktop/evidence/windows-release-preflight.json",
    "--report",
    "docs/desktop/evidence/windows-release-preflight.md"
)

Invoke-CheckedPython -PythonExe $pythonExe -Arguments @(
    "desktop/scripts/run_windows_release_flow.py",
    "--executable",
    $executablePath,
    "--sign-identity",
    $SignIdentity,
    "--timestamp-url",
    $TimestampUrl,
    "--preflight-json-report",
    "docs/desktop/evidence/windows-release-preflight.json",
    "--preflight-report",
    "docs/desktop/evidence/windows-release-preflight.md",
    "--json-report",
    "docs/desktop/evidence/windows-release-flow.json",
    "--report",
    "docs/desktop/evidence/windows-release-flow.md",
    "--output",
    $ReleaseOutput,
    "--version",
    $Version
)
