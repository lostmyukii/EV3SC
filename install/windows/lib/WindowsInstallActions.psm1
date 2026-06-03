Set-StrictMode -Version Latest

$Script:WindowsEvidenceEntries = @(
    "desktop/release/internal/windows/WeisileLink/WeisileLink.exe",
    "desktop/release/internal/windows/WeisileLink/install.ps1",
    "desktop/release/internal/windows/WeisileLink/uninstall.ps1",
    "desktop/release/internal/windows/WeisileLink/weisile-link-service.xml",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip"
)

function Get-VsleDefaultWindowsInstallRoot {
    [CmdletBinding()]
    param()

    return (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function Get-VsleDefaultWindowsStagingRoot {
    [CmdletBinding()]
    param()

    $base = $env:TEMP
    if ([string]::IsNullOrWhiteSpace($base)) {
        $base = [System.IO.Path]::GetTempPath()
    }

    return (Join-Path $base "VSLE\SetupWizard\windows-release-evidence")
}

function Get-VsleDefaultWindowsDesktopTargetRoot {
    [CmdletBinding()]
    param()

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        return "%LocalAppData%\Programs\VSLE\WeisileLink"
    }

    return (Join-Path $env:LOCALAPPDATA "Programs\VSLE\WeisileLink")
}

function Get-VsleWindowsDesktopInstallPlan {
    [CmdletBinding()]
    param(
        [string]$InstallRoot = (Get-VsleDefaultWindowsInstallRoot),
        [string]$StagingRoot = (Get-VsleDefaultWindowsStagingRoot),
        [string]$TargetRoot = (Get-VsleDefaultWindowsDesktopTargetRoot)
    )

    $evidenceZip = Join-Path $InstallRoot "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip"
    $packageRoot = Join-Path $StagingRoot "desktop/release/internal/windows/WeisileLink"

    [PSCustomObject]@{
        EvidenceZip = $evidenceZip
        StagingRoot = $StagingRoot
        PackageRoot = $packageRoot
        ExePath = Join-Path $packageRoot "WeisileLink.exe"
        InstallScriptPath = Join-Path $packageRoot "install.ps1"
        UninstallScriptPath = Join-Path $packageRoot "uninstall.ps1"
        ServiceXmlPath = Join-Path $packageRoot "weisile-link-service.xml"
        ManifestPath = Join-Path $StagingRoot "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json"
        ReleaseZipPath = Join-Path $StagingRoot "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip"
        TargetRoot = $TargetRoot
        ExpectedEntries = $Script:WindowsEvidenceEntries
        ManualConfirmationRequired = $true
        CopyToInstallRoot = $false
        CallInstallScript = $false
        ProductionReleaseReady = $false
    }
}

function Assert-VsleSafeWindowsStagingRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StagingRoot
    )

    $full = [System.IO.Path]::GetFullPath($StagingRoot)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full -eq $root) {
        throw "Refusing to use a filesystem root as a staging directory."
    }
    if ($full.Length -lt 12) {
        throw "Refusing to use a very short staging directory path."
    }
}

function Test-VsleWindowsDesktopInstallStaging {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Plan
    )

    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $Plan.ExpectedEntries) {
        $path = Join-Path $Plan.StagingRoot $entry
        if (-not (Test-Path -LiteralPath $path)) {
            $missing.Add($entry)
        }
    }

    if ($missing.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Windows Desktop install staging is incomplete."
            Evidence = "Missing staging entries: $($missing -join ', ')"
            Plan = $Plan
        }
    }

    return New-VsleWindowsDesktopInstallConfirmation -Plan $Plan
}

function New-VsleWindowsDesktopInstallConfirmation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Plan
    )

    $evidence = @(
        "Staging root: $($Plan.StagingRoot)",
        "Package root: $($Plan.PackageRoot)",
        "Executable: $($Plan.ExePath)",
        "Install helper: $($Plan.InstallScriptPath)",
        "Service metadata: $($Plan.ServiceXmlPath)",
        "Target root: $($Plan.TargetRoot)",
        "CopyToInstallRoot: $($Plan.CopyToInstallRoot)",
        "CallInstallScript: $($Plan.CallInstallScript)",
        "Manual confirmation required before any install action."
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Windows Desktop package is staged. Confirm before copying files or running the install helper."
        Evidence = $evidence
        Plan = $Plan
    }
}

function Prepare-VsleWindowsDesktopInstallStaging {
    [CmdletBinding()]
    param(
        [string]$InstallRoot = (Get-VsleDefaultWindowsInstallRoot),
        [string]$StagingRoot = (Get-VsleDefaultWindowsStagingRoot),
        [switch]$Force
    )

    $plan = Get-VsleWindowsDesktopInstallPlan -InstallRoot $InstallRoot -StagingRoot $StagingRoot
    if (-not (Test-Path -LiteralPath $plan.EvidenceZip)) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Windows evidence bundle is missing."
            Evidence = "Missing evidence zip: $($plan.EvidenceZip)"
            Plan = $plan
        }
    }

    Assert-VsleSafeWindowsStagingRoot -StagingRoot $plan.StagingRoot
    if ((Test-Path -LiteralPath $plan.StagingRoot) -and $Force) {
        Remove-Item -LiteralPath $plan.StagingRoot -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $plan.StagingRoot)) {
        [void](New-Item -ItemType Directory -Path $plan.StagingRoot -Force)
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($plan.EvidenceZip, $plan.StagingRoot)

    return Test-VsleWindowsDesktopInstallStaging -Plan $plan
}

Export-ModuleMember -Function Get-VsleWindowsDesktopInstallPlan, Prepare-VsleWindowsDesktopInstallStaging, Test-VsleWindowsDesktopInstallStaging, New-VsleWindowsDesktopInstallConfirmation
