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

function Assert-VsleSafeWindowsTargetRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetRoot
    )

    $full = [System.IO.Path]::GetFullPath($TargetRoot)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full -eq $root) {
        throw "Refusing to use a filesystem root as an install target."
    }
    if ($full.Length -lt 12) {
        throw "Refusing to use a very short install target path."
    }
}

function Test-VsleWindowsDesktopStartupCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallScriptPath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceXmlPath
    )

    $missingFiles = New-Object System.Collections.Generic.List[string]
    foreach ($path in @($InstallScriptPath, $ServiceXmlPath)) {
        if (-not (Test-Path -LiteralPath $path)) {
            $missingFiles.Add($path)
        }
    }

    if ($missingFiles.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            Summary = "Windows Desktop startup metadata is missing."
            Evidence = "Missing startup metadata: $($missingFiles -join ', ')"
            MissingTokens = @()
        }
    }

    $startupText = @(
        (Get-Content -LiteralPath $InstallScriptPath -Raw),
        (Get-Content -LiteralPath $ServiceXmlPath -Raw)
    ) -join [Environment]::NewLine

    $requiredTokens = @(
        "desktop-supervise",
        "127.0.0.1",
        "20111",
        "8766",
        "--open-scratchai"
    )
    $missingTokens = New-Object System.Collections.Generic.List[string]
    foreach ($token in $requiredTokens) {
        if ($startupText.IndexOf($token, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            $missingTokens.Add($token)
        }
    }

    if ($missingTokens.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            Summary = "Windows Desktop startup command is incomplete."
            Evidence = "Missing startup command tokens: $($missingTokens -join ', ')"
            MissingTokens = @($missingTokens)
        }
    }

    [PSCustomObject]@{
        Status = "passed"
        Blocking = $false
        Summary = "Windows Desktop startup command points to desktop-supervise localhost defaults."
        Evidence = "Startup command verified: desktop-supervise on 127.0.0.1:20111 and trainer 127.0.0.1:8766 with --open-scratchai."
        MissingTokens = @()
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

function Invoke-VsleWindowsDesktopInstallExecution {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Plan,
        [switch]$ConfirmInstall,
        [switch]$RunInstallHelper,
        [switch]$Force
    )

    if (-not $ConfirmInstall) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Manual confirmation required before installing WeisileLink Desktop."
            Evidence = "Click Confirm Install before copying files or running the Windows helper."
            Plan = $Plan
        }
    }

    $stagingResult = Test-VsleWindowsDesktopInstallStaging -Plan $Plan
    if ($stagingResult.Status -eq "blocked") {
        return $stagingResult
    }

    Assert-VsleSafeWindowsTargetRoot -TargetRoot $Plan.TargetRoot
    if ((Test-Path -LiteralPath $Plan.TargetRoot) -and $Force) {
        Remove-Item -LiteralPath $Plan.TargetRoot -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $Plan.TargetRoot)) {
        [void](New-Item -ItemType Directory -Path $Plan.TargetRoot -Force)
    }

    Copy-Item -Path (Join-Path $Plan.PackageRoot "*") -Destination $Plan.TargetRoot -Recurse -Force

    $targetExe = Join-Path $Plan.TargetRoot "WeisileLink.exe"
    $targetInstallScript = Join-Path $Plan.TargetRoot "install.ps1"
    $targetServiceXml = Join-Path $Plan.TargetRoot "weisile-link-service.xml"
    $requiredTargetFiles = @(
        $targetExe,
        $targetInstallScript,
        (Join-Path $Plan.TargetRoot "uninstall.ps1"),
        $targetServiceXml
    )

    $missingTargetFiles = New-Object System.Collections.Generic.List[string]
    foreach ($path in $requiredTargetFiles) {
        if (-not (Test-Path -LiteralPath $path)) {
            $missingTargetFiles.Add($path)
        }
    }
    if ($missingTargetFiles.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Windows Desktop install copy did not produce all required files."
            Evidence = "Missing copied files: $($missingTargetFiles -join ', ')"
            Plan = $Plan
        }
    }

    $startupResult = Test-VsleWindowsDesktopStartupCommand `
        -InstallScriptPath $targetInstallScript `
        -ServiceXmlPath $targetServiceXml
    if ($startupResult.Status -eq "blocked") {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = $startupResult.Summary
            Evidence = $startupResult.Evidence
            Plan = $Plan
        }
    }

    $helperEvidence = "CallInstallScript = $false; Windows helper not run in temp-root verification mode."
    if ($RunInstallHelper) {
        if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $true
                Summary = "Windows install helper can only run on Windows after confirmation."
                Evidence = "CallInstallScript = $true requested, but this host is not Windows."
                Plan = $Plan
            }
        }

        & $targetInstallScript
        $helperEvidence = "CallInstallScript = $true; install.ps1 ran after explicit confirmation."
    }

    $evidence = @(
        "Target root: $($Plan.TargetRoot)",
        "Executable copied: $targetExe",
        "Install helper copied: $targetInstallScript",
        "Service metadata copied: $targetServiceXml",
        "Startup command verified: desktop-supervise on 127.0.0.1:20111 and trainer 127.0.0.1:8766.",
        $helperEvidence,
        "ProductionReleaseReady: false"
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = "passed"
        Blocking = $false
        ManualConfirmationRequired = $false
        Summary = "Windows Desktop files were installed after confirmation and startup metadata was verified."
        Evidence = $evidence
        Plan = $Plan
    }
}

function Test-VsleTcpPort {
    [CmdletBinding()]
    param(
        [string]$Host = "127.0.0.1",
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [int]$TimeoutMs = 750
    )

    $client = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $null
    try {
        $asyncResult = $client.BeginConnect($Host, $Port, $null, $null)
        $connected = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $connected) {
            return $false
        }

        $client.EndConnect($asyncResult)
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $asyncResult -and $null -ne $asyncResult.AsyncWaitHandle) {
            $asyncResult.AsyncWaitHandle.Close()
        }
        $client.Close()
    }
}

function Get-VsleWindowsDesktopBridgePlan {
    [CmdletBinding()]
    param(
        [string]$TargetRoot = (Get-VsleDefaultWindowsDesktopTargetRoot),
        [string]$Host = "127.0.0.1",
        [int]$ScratchLinkPort = 20111,
        [int]$TrainerPort = 8766
    )

    $exePath = Join-Path $TargetRoot "WeisileLink.exe"
    $nativeAdapterPath = Join-Path $TargetRoot "native\WeisileEV3BluetoothAdapter.exe"
    $arguments = @(
        "desktop-supervise",
        "--host",
        $Host,
        "--port",
        [string]$ScratchLinkPort,
        "--trainer-port",
        [string]$TrainerPort
    )
    if (Test-Path -LiteralPath $nativeAdapterPath) {
        $arguments += @("--native-adapter", $nativeAdapterPath)
    }

    [PSCustomObject]@{
        TargetRoot = $TargetRoot
        ExePath = $exePath
        NativeAdapterPath = $nativeAdapterPath
        Host = $Host
        ScratchLinkPort = $ScratchLinkPort
        TrainerPort = $TrainerPort
        Arguments = @($arguments)
        ArgumentLine = ($arguments -join " ")
        ProductionReleaseReady = $false
    }
}

function Invoke-VsleWindowsDesktopBridgeVerification {
    [CmdletBinding()]
    param(
        [object]$Plan = (Get-VsleWindowsDesktopBridgePlan),
        [int]$TimeoutSeconds = 12,
        [int]$PollIntervalMs = 500,
        [switch]$SkipStart
    )

    $scratchOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.ScratchLinkPort
    $trainerOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.TrainerPort
    $startAttempted = $false
    $bridgeProcessId = $null

    if (-not ($scratchOk -and $trainerOk) -and -not $SkipStart) {
        if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $false
                Summary = "本地桥接启动检查需要 Windows。"
                Evidence = @(
                    "StartAttempted: false",
                    "Reason: WeisileLink.exe desktop-supervise can only be started on Windows.",
                    "scratch_link_endpoint_ok: $scratchOk",
                    "trainer_endpoint_ok: $trainerOk",
                    "ProductionReleaseReady: false"
                ) -join [Environment]::NewLine
                Plan = $Plan
                BridgeProcessId = $bridgeProcessId
                scratch_link_endpoint_ok = $scratchOk
                trainer_endpoint_ok = $trainerOk
            }
        }

        if (-not (Test-Path -LiteralPath $Plan.ExePath)) {
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $false
                Summary = "WeisileLink.exe 尚未安装，无法启动本地桥接。"
                Evidence = @(
                    "Missing executable: $($Plan.ExePath)",
                    "scratch_link_endpoint_ok: $scratchOk",
                    "trainer_endpoint_ok: $trainerOk",
                    "ProductionReleaseReady: false"
                ) -join [Environment]::NewLine
                Plan = $Plan
                BridgeProcessId = $bridgeProcessId
                scratch_link_endpoint_ok = $scratchOk
                trainer_endpoint_ok = $trainerOk
            }
        }

        $process = Start-Process `
            -FilePath $Plan.ExePath `
            -ArgumentList $Plan.Arguments `
            -WindowStyle Hidden `
            -PassThru
        $startAttempted = $true
        $bridgeProcessId = $process.Id
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $scratchOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.ScratchLinkPort
        $trainerOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.TrainerPort
        if ($scratchOk -and $trainerOk) {
            break
        }
        Start-Sleep -Milliseconds $PollIntervalMs
    } while ((Get-Date) -lt $deadline)

    $status = if ($scratchOk -and $trainerOk) { "passed" } else { "blocked" }
    $summary = if ($scratchOk -and $trainerOk) {
        "本地桥接已启动或已检测到运行，两个本机端口都通过。"
    } else {
        "本地桥接未通过端口检查。"
    }

    $evidence = @(
        "Executable: $($Plan.ExePath)",
        "Command: $($Plan.ExePath) $($Plan.ArgumentLine)",
        "StartAttempted: $startAttempted",
        "BridgeProcessId: $bridgeProcessId",
        "scratch_link_endpoint_ok: $scratchOk",
        "trainer_endpoint_ok: $trainerOk",
        "Scratch Link endpoint: $($Plan.Host):$($Plan.ScratchLinkPort)",
        "Trainer endpoint: $($Plan.Host):$($Plan.TrainerPort)",
        "ProductionReleaseReady: false"
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = $status
        Blocking = -not ($scratchOk -and $trainerOk)
        ManualConfirmationRequired = $false
        Summary = $summary
        Evidence = $evidence
        Plan = $Plan
        BridgeProcessId = $bridgeProcessId
        scratch_link_endpoint_ok = $scratchOk
        trainer_endpoint_ok = $trainerOk
    }
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

Export-ModuleMember -Function Get-VsleWindowsDesktopInstallPlan, Prepare-VsleWindowsDesktopInstallStaging, Test-VsleWindowsDesktopInstallStaging, New-VsleWindowsDesktopInstallConfirmation, Invoke-VsleWindowsDesktopInstallExecution, Test-VsleWindowsDesktopStartupCommand, Get-VsleWindowsDesktopBridgePlan, Test-VsleTcpPort, Invoke-VsleWindowsDesktopBridgeVerification
