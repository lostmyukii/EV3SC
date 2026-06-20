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

function Get-VsleWindowsDesktopProcessId {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Process
    )

    if ($Process.PSObject.Properties.Name -contains "ProcessId") {
        return [int]$Process.ProcessId
    }
    if ($Process.PSObject.Properties.Name -contains "Id") {
        return [int]$Process.Id
    }
    return 0
}

function Get-VsleWindowsDesktopProcessPath {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Process
    )

    foreach ($propertyName in @("ExecutablePath", "Path")) {
        if ($Process.PSObject.Properties.Name -contains $propertyName) {
            $value = [string]$Process.$propertyName
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
        }
    }
    return ""
}

function Get-VsleMatchingWindowsDesktopProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Processes,
        [Parameter(Mandatory = $true)]
        [string]$TargetExecutable
    )

    $targetFullPath = [System.IO.Path]::GetFullPath($TargetExecutable)
    $matching = New-Object System.Collections.Generic.List[object]
    foreach ($process in @($Processes)) {
        if ($null -eq $process) {
            continue
        }

        $processPath = Get-VsleWindowsDesktopProcessPath -Process $process
        if ([string]::IsNullOrWhiteSpace($processPath)) {
            continue
        }

        try {
            $processFullPath = [System.IO.Path]::GetFullPath($processPath)
        } catch {
            continue
        }
        if ([string]::Equals(
            $processFullPath,
            $targetFullPath,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            $matching.Add($process)
        }
    }
    return $matching.ToArray()
}

function Stop-VsleWindowsDesktopProcessesForUpgrade {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetRoot,
        [int]$TimeoutMs = 5000,
        [AllowNull()]
        [scriptblock]$ProcessLookup,
        [AllowNull()]
        [scriptblock]$StopProcessAction,
        [AllowNull()]
        [scriptblock]$SleepAction
    )

    $targetExecutable = [System.IO.Path]::GetFullPath(
        (Join-Path $TargetRoot "WeisileLink.exe")
    )

    if ($null -eq $ProcessLookup) {
        $ProcessLookup = {
            if (
                [System.Environment]::OSVersion.Platform -ne
                [System.PlatformID]::Win32NT
            ) {
                return @()
            }
            return @(
                Get-CimInstance `
                    -ClassName Win32_Process `
                    -Filter "Name = 'WeisileLink.exe'" `
                    -ErrorAction SilentlyContinue
            )
        }
    }
    if ($null -eq $StopProcessAction) {
        $StopProcessAction = {
            param($process)
            $processId = Get-VsleWindowsDesktopProcessId -Process $process
            if ($processId -le 0) {
                throw "WeisileLink process does not expose a valid process ID."
            }
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
    }
    if ($null -eq $SleepAction) {
        $SleepAction = {
            param($milliseconds)
            Start-Sleep -Milliseconds $milliseconds
        }
    }

    $initialProcesses = @(
        Get-VsleMatchingWindowsDesktopProcesses `
            -Processes @(& $ProcessLookup) `
            -TargetExecutable $targetExecutable
    )
    if ($initialProcesses.Count -eq 0) {
        return [PSCustomObject]@{
            Status = "passed"
            Blocking = $false
            Summary = "No running target WeisileLink process needed to be stopped."
            Evidence = "Target executable: $targetExecutable`nStopped process IDs: none"
            TargetExecutable = $targetExecutable
            StoppedProcessIds = @()
            RemainingProcessIds = @()
        }
    }

    $stoppedProcessIds = New-Object System.Collections.Generic.List[int]
    $stopErrors = New-Object System.Collections.Generic.List[string]
    foreach ($process in $initialProcesses) {
        $processId = Get-VsleWindowsDesktopProcessId -Process $process
        try {
            & $StopProcessAction $process
            if ($processId -gt 0) {
                $stoppedProcessIds.Add($processId)
            }
        } catch {
            $stopErrors.Add("PID ${processId}: $($_.Exception.Message)")
        }
    }

    $timeout = [Math]::Max(0, $TimeoutMs)
    $deadline = [DateTime]::UtcNow.AddMilliseconds($timeout)
    do {
        $remainingProcesses = @(
            Get-VsleMatchingWindowsDesktopProcesses `
                -Processes @(& $ProcessLookup) `
                -TargetExecutable $targetExecutable
        )
        if ($remainingProcesses.Count -eq 0) {
            $stoppedText = if ($stoppedProcessIds.Count -gt 0) {
                $stoppedProcessIds.ToArray() -join ", "
            } else {
                "none"
            }
            return [PSCustomObject]@{
                Status = "passed"
                Blocking = $false
                Summary = "Existing WeisileLink Desktop process stopped before upgrade."
                Evidence = "Target executable: $targetExecutable`nStopped process IDs: $stoppedText"
                TargetExecutable = $targetExecutable
                StoppedProcessIds = $stoppedProcessIds.ToArray()
                RemainingProcessIds = @()
            }
        }

        if ([DateTime]::UtcNow -ge $deadline) {
            break
        }
        & $SleepAction 100
    } while ($true)

    $remainingProcessIds = @(
        $remainingProcesses |
            ForEach-Object { Get-VsleWindowsDesktopProcessId -Process $_ } |
            Where-Object { $_ -gt 0 }
    )
    $evidenceParts = New-Object System.Collections.Generic.List[string]
    $evidenceParts.Add("Target executable: $targetExecutable")
    $evidenceParts.Add("Remaining process IDs: $($remainingProcessIds -join ', ')")
    if ($stopErrors.Count -gt 0) {
        $evidenceParts.Add("Stop errors: $($stopErrors -join '; ')")
    }
    $evidenceParts.Add(
        "Close WeisileLink Desktop in Task Manager, then click Retry."
    )

    return [PSCustomObject]@{
        Status = "blocked"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Existing WeisileLink Desktop process is still using the install files."
        Evidence = $evidenceParts.ToArray() -join [Environment]::NewLine
        TargetExecutable = $targetExecutable
        StoppedProcessIds = $stoppedProcessIds.ToArray()
        RemainingProcessIds = $remainingProcessIds
    }
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
    $processEvidence = "No existing target directory required process cleanup."
    if ((Test-Path -LiteralPath $Plan.TargetRoot) -and $Force) {
        $processResult = Stop-VsleWindowsDesktopProcessesForUpgrade `
            -TargetRoot $Plan.TargetRoot
        if ($processResult.Status -eq "blocked") {
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $true
                Summary = $processResult.Summary
                Evidence = $processResult.Evidence
                Plan = $Plan
            }
        }
        $processEvidence = $processResult.Evidence
        try {
            Remove-Item -LiteralPath $Plan.TargetRoot -Recurse -Force
        } catch {
            $targetExecutable = Join-Path $Plan.TargetRoot "WeisileLink.exe"
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $true
                Summary = "Windows still denied replacement of WeisileLink Desktop files."
                Evidence = @(
                    "Target executable: $targetExecutable",
                    "Remove error: $($_.Exception.Message)",
                    "Close WeisileLink Desktop and any antivirus scan using this file, then click Retry."
                ) -join [Environment]::NewLine
                Plan = $Plan
            }
        }
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
        $processEvidence,
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

function New-VsleScratchLinkProtocolResult {
    param(
        [bool]$ProtocolOk = $false,
        [bool]$DiscoverOk = $false,
        [string]$Implementation = "",
        [string]$PeripheralName = "",
        [string]$ErrorMessage = ""
    )

    [PSCustomObject]@{
        ProtocolOk = $ProtocolOk
        DiscoverOk = $DiscoverOk
        Implementation = $Implementation
        PeripheralName = $PeripheralName
        ErrorMessage = $ErrorMessage
    }
}

function Send-VsleScratchLinkWebSocketJson {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.WebSockets.ClientWebSocket]$Client,
        [Parameter(Mandatory = $true)]
        [string]$Json,
        [int]$TimeoutMs = 2000
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $task = $Client.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [System.Threading.CancellationToken]::None
    )
    if (-not $task.Wait($TimeoutMs)) {
        throw "Timed out sending Scratch Link WebSocket message."
    }
}

function Receive-VsleScratchLinkWebSocketJson {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.WebSockets.ClientWebSocket]$Client,
        [int]$TimeoutMs = 2000
    )

    $buffer = New-Object byte[] 8192
    $segment = [System.ArraySegment[byte]]::new($buffer)
    $stream = New-Object System.IO.MemoryStream
    try {
        do {
            $task = $Client.ReceiveAsync(
                $segment,
                [System.Threading.CancellationToken]::None
            )
            if (-not $task.Wait($TimeoutMs)) {
                throw "Timed out waiting for Scratch Link WebSocket message."
            }
            $result = $task.Result
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw "Scratch Link WebSocket closed before protocol probe completed."
            }
            if ($result.Count -gt 0) {
                $stream.Write($buffer, 0, $result.Count)
            }
        } while (-not $result.EndOfMessage)

        $text = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
        if ([string]::IsNullOrWhiteSpace($text)) {
            throw "Scratch Link WebSocket returned an empty message."
        }
        return ($text | ConvertFrom-Json)
    } finally {
        $stream.Dispose()
    }
}

function Test-VsleScratchLinkProtocol {
    [CmdletBinding()]
    param(
        [string]$Host = "127.0.0.1",
        [int]$Port = 20111,
        [int]$TimeoutMs = 2500
    )

    # Default Scratch Link WebSocket: ws://127.0.0.1:20111/scratch/bt
    $url = "ws://${Host}:${Port}/scratch/bt"
    $client = New-Object System.Net.WebSockets.ClientWebSocket
    try {
        $connectTask = $client.ConnectAsync(
            [System.Uri]$url,
            [System.Threading.CancellationToken]::None
        )
        if (-not $connectTask.Wait($TimeoutMs)) {
            return New-VsleScratchLinkProtocolResult `
                -ErrorMessage "Link 未启动 / 20111 不可达。"
        }

        Send-VsleScratchLinkWebSocketJson `
            -Client $client `
            -Json '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' `
            -TimeoutMs $TimeoutMs

        $implementation = ""
        $protocolOk = $false
        $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
        do {
            $message = Receive-VsleScratchLinkWebSocketJson `
                -Client $client `
                -TimeoutMs $TimeoutMs
            if (
                $message.PSObject.Properties.Name -contains "id" -and
                [string]$message.id -eq "1"
            ) {
                if (
                    $message.PSObject.Properties.Name -contains "result" -and
                    $message.result.PSObject.Properties.Name -contains "implementation"
                ) {
                    $implementation = [string]$message.result.implementation
                }
                $protocolOk = ($implementation -eq "WeisileLink")
                break
            }
        } while ((Get-Date) -lt $deadline)

        if (-not $protocolOk) {
            return New-VsleScratchLinkProtocolResult `
                -Implementation $implementation `
                -ErrorMessage "端口被其他程序占用，或不是当前 VSLE WeisileLink runtime。"
        }

        Send-VsleScratchLinkWebSocketJson `
            -Client $client `
            -Json '{"jsonrpc":"2.0","id":2,"method":"discover"}' `
            -TimeoutMs $TimeoutMs

        $peripheralName = ""
        $discoverOk = $false
        $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
        do {
            $message = Receive-VsleScratchLinkWebSocketJson `
                -Client $client `
                -TimeoutMs $TimeoutMs
            if (
                $message.PSObject.Properties.Name -contains "method" -and
                [string]$message.method -eq "didDiscoverPeripheral"
            ) {
                $discoverOk = $true
                if (
                    $message.PSObject.Properties.Name -contains "params" -and
                    $message.params.PSObject.Properties.Name -contains "name"
                ) {
                    $peripheralName = [string]$message.params.name
                }
                break
            }
        } while ((Get-Date) -lt $deadline)

        if (-not $discoverOk) {
            return New-VsleScratchLinkProtocolResult `
                -ProtocolOk $true `
                -Implementation $implementation `
                -ErrorMessage "Link 可用，但未发现 EV3 主机。"
        }

        return New-VsleScratchLinkProtocolResult `
            -ProtocolOk $true `
            -DiscoverOk $true `
            -Implementation $implementation `
            -PeripheralName $peripheralName
    } catch {
        return New-VsleScratchLinkProtocolResult `
            -ErrorMessage ([string]$_.Exception.Message)
    } finally {
        if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            try {
                $closeTask = $client.CloseAsync(
                    [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                    "VSLE probe completed",
                    [System.Threading.CancellationToken]::None
                )
                [void]$closeTask.Wait(500)
            } catch {
            }
        }
        $client.Dispose()
    }
}

function Get-VsleWindowsDesktopBridgePlan {
    [CmdletBinding()]
    param(
        [string]$TargetRoot = (Get-VsleDefaultWindowsDesktopTargetRoot),
        [string]$Host = "127.0.0.1",
        [int]$ScratchLinkPort = 20111,
        [int]$TrainerPort = 8766,
        [AllowNull()]
        [object]$Ev3SetupInput = $null
    )

    $exePath = Join-Path $TargetRoot "WeisileLink.exe"
    $nativeAdapterPath = Join-Path $TargetRoot "native\WeisileEV3BluetoothAdapter.exe"
    $launchMode = "desktop-supervise"
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
    $environment = [ordered]@{
        WEISILE_LINK_HOST = $Host
        WEISILE_LINK_PORT = [string]$ScratchLinkPort
        TRAINER_WS_PORT = [string]$TrainerPort
        LOG_LEVEL = "INFO"
    }
    if (
        $null -ne $Ev3SetupInput -and
        $Ev3SetupInput.PSObject.Properties.Name -contains "Transport" -and
        $Ev3SetupInput.Transport -in @("wifi-full-vsle", "bluetooth-full-vsle")
    ) {
        $ev3Host = ""
        if ($Ev3SetupInput.PSObject.Properties.Name -contains "Host") {
            $ev3Host = ([string]$Ev3SetupInput.Host).Trim()
        }
        if ([string]::IsNullOrWhiteSpace($ev3Host)) {
            $ev3Host = "ev3dev.local"
        }
        $launchMode = "direct-runtime"
        $arguments = @()
        $environment["EV3_IP"] = $ev3Host
        $environment["EV3_WS_PORT"] = "8765"
        if ($Ev3SetupInput.Transport -eq "bluetooth-full-vsle") {
            $ev3Bt = ""
            if ($Ev3SetupInput.PSObject.Properties.Name -contains "BluetoothAddress") {
                $ev3Bt = ([string]$Ev3SetupInput.BluetoothAddress).Trim()
            }
            $environment["WEISILE_TRANSPORT"] = "vsle-bluetooth"
            $environment["EV3_BT"] = $ev3Bt
            if (Test-Path -LiteralPath $nativeAdapterPath) {
                $environment["WEISILE_VSLE_BT_ADAPTER"] = $nativeAdapterPath
            }
        } else {
            $environment["WEISILE_TRANSPORT"] = "wifi"
        }
    }

    [PSCustomObject]@{
        TargetRoot = $TargetRoot
        ExePath = $exePath
        NativeAdapterPath = $nativeAdapterPath
        LaunchMode = $launchMode
        Host = $Host
        ScratchLinkPort = $ScratchLinkPort
        TrainerPort = $TrainerPort
        Arguments = @($arguments)
        ArgumentLine = ($arguments -join " ")
        Environment = $environment
        ProductionReleaseReady = $false
    }
}

function Set-VsleProcessEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Environment
    )

    $previous = @{}
    if ($null -eq $Environment) {
        return $previous
    }

    foreach ($key in $Environment.Keys) {
        $previous[$key] = [System.Environment]::GetEnvironmentVariable($key, "Process")
        [System.Environment]::SetEnvironmentVariable(
            $key,
            [string]$Environment[$key],
            "Process"
        )
    }

    return $previous
}

function Restore-VsleProcessEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$PreviousEnvironment
    )

    foreach ($key in $PreviousEnvironment.Keys) {
        [System.Environment]::SetEnvironmentVariable(
            $key,
            $PreviousEnvironment[$key],
            "Process"
        )
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

        $startParams = @{
            FilePath = $Plan.ExePath
            WindowStyle = "Hidden"
            PassThru = $true
        }
        if ($Plan.Arguments.Count -gt 0) {
            $startParams.ArgumentList = $Plan.Arguments
        }

        $previousEnvironment = Set-VsleProcessEnvironment -Environment $Plan.Environment
        try {
            $process = Start-Process @startParams
            $startAttempted = $true
            $bridgeProcessId = $process.Id
        } finally {
            Restore-VsleProcessEnvironment -PreviousEnvironment $previousEnvironment
        }
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $scratchProtocol = New-VsleScratchLinkProtocolResult
    do {
        $scratchOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.ScratchLinkPort
        $trainerOk = Test-VsleTcpPort -Host $Plan.Host -Port $Plan.TrainerPort
        if ($scratchOk) {
            $scratchProtocol = Test-VsleScratchLinkProtocol `
                -Host $Plan.Host `
                -Port $Plan.ScratchLinkPort
        }
        if ($scratchOk -and $trainerOk -and $scratchProtocol.ProtocolOk -and $scratchProtocol.DiscoverOk) {
            break
        }
        Start-Sleep -Milliseconds $PollIntervalMs
    } while ((Get-Date) -lt $deadline)

    $bridgeOk = $scratchOk -and $trainerOk -and $scratchProtocol.ProtocolOk -and $scratchProtocol.DiscoverOk
    $status = if ($bridgeOk) { "passed" } else { "blocked" }
    $summary = if ($bridgeOk) {
        "本地桥接已启动或已检测到运行，端口和 Scratch Link 协议都通过。"
    } elseif ($scratchOk -and -not $scratchProtocol.ProtocolOk) {
        "本地桥接端口打开，但 Scratch Link 协议不是 WeisileLink。"
    } elseif ($scratchProtocol.ProtocolOk -and -not $scratchProtocol.DiscoverOk) {
        "Link 可用，但未发现 EV3 主机。"
    } else {
        "本地桥接未通过端口检查。"
    }

    $evidence = @(
        "Executable: $($Plan.ExePath)",
        "Command: $($Plan.ExePath) $($Plan.ArgumentLine)",
        "LaunchMode: $($Plan.LaunchMode)",
        "WEISILE_TRANSPORT: $($Plan.Environment["WEISILE_TRANSPORT"])",
        "EV3_IP: $($Plan.Environment["EV3_IP"])",
        "StartAttempted: $startAttempted",
        "BridgeProcessId: $bridgeProcessId",
        "scratch_link_endpoint_ok: $scratchOk",
        "scratch_link_protocol_ok: $($scratchProtocol.ProtocolOk)",
        "scratch_link_discover_ok: $($scratchProtocol.DiscoverOk)",
        "scratch_link_protocol_implementation: $($scratchProtocol.Implementation)",
        "scratch_link_protocol_peripheral: $($scratchProtocol.PeripheralName)",
        "scratch_link_protocol_error: $($scratchProtocol.ErrorMessage)",
        "trainer_endpoint_ok: $trainerOk",
        "Scratch Link endpoint: $($Plan.Host):$($Plan.ScratchLinkPort)",
        "Scratch Link WebSocket: ws://$($Plan.Host):$($Plan.ScratchLinkPort)/scratch/bt",
        "Note: 这是内部 WebSocket 地址，不能直接在浏览器地址栏打开。",
        "Trainer endpoint: $($Plan.Host):$($Plan.TrainerPort)",
        "ProductionReleaseReady: false"
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = $status
        Blocking = -not $bridgeOk
        ManualConfirmationRequired = $false
        Summary = $summary
        Evidence = $evidence
        Plan = $Plan
        BridgeProcessId = $bridgeProcessId
        scratch_link_endpoint_ok = $scratchOk
        scratch_link_protocol_ok = $scratchProtocol.ProtocolOk
        scratch_link_discover_ok = $scratchProtocol.DiscoverOk
        scratch_link_protocol_error = $scratchProtocol.ErrorMessage
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

Export-ModuleMember -Function Get-VsleWindowsDesktopInstallPlan, Prepare-VsleWindowsDesktopInstallStaging, Test-VsleWindowsDesktopInstallStaging, New-VsleWindowsDesktopInstallConfirmation, Stop-VsleWindowsDesktopProcessesForUpgrade, Invoke-VsleWindowsDesktopInstallExecution, Test-VsleWindowsDesktopStartupCommand, Get-VsleWindowsDesktopBridgePlan, Test-VsleTcpPort, Test-VsleScratchLinkProtocol, Invoke-VsleWindowsDesktopBridgeVerification
