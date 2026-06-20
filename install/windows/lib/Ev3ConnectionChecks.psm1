Set-StrictMode -Version Latest

$Script:AllowedTransports = @(
    "wifi-full-vsle",
    "bluetooth-full-vsle",
    "usb-assisted"
)

function Get-VsleDefaultEv3InstallRoot {
    [CmdletBinding()]
    param()

    return (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function New-VsleEv3SetupInput {
    [CmdletBinding()]
    param(
        [ValidateSet("wifi-full-vsle", "bluetooth-full-vsle", "usb-assisted")]
        [string]$Transport = "wifi-full-vsle",
        [string]$Host = "",
        [string]$User = "",
        [string]$BluetoothAddress = "",
        [string]$ClassroomLabel = ""
    )

    [PSCustomObject]@{
        Transport = $Transport
        Host = $Host.Trim()
        User = if ([string]::IsNullOrWhiteSpace($User)) { "robot" } else { $User.Trim() }
        BluetoothAddress = $BluetoothAddress.Trim()
        ClassroomLabel = $ClassroomLabel.Trim()
        OfficialFirmwareCompatibility = $false
        RedactedBluetoothAddress = if ([string]::IsNullOrWhiteSpace($BluetoothAddress)) { "" } else { "redacted" }
    }
}

function Test-VsleEv3SetupInput {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$SetupInput
    )

    $issues = New-Object System.Collections.Generic.List[string]
    if ($Script:AllowedTransports -notcontains $SetupInput.Transport) {
        $issues.Add("Unsupported transport. Official firmware Bluetooth is not a Full VSLE transport.")
    }
    if ([string]::IsNullOrWhiteSpace($SetupInput.Host)) {
        $issues.Add("EV3 SSH host or address is required.")
    } elseif ($SetupInput.Host -notmatch '^[A-Za-z0-9.\-_%:\[\]]+$') {
        $issues.Add("EV3 SSH host contains unsupported characters.")
    }
    if ([string]::IsNullOrWhiteSpace($SetupInput.User)) {
        $issues.Add("EV3 SSH user is required.")
    } elseif ($SetupInput.User -notmatch '^[A-Za-z0-9._-]+$') {
        $issues.Add("EV3 SSH user contains unsupported characters.")
    }
    if ($SetupInput.Transport -eq "bluetooth-full-vsle") {
        if ([string]::IsNullOrWhiteSpace($SetupInput.BluetoothAddress)) {
            $issues.Add("Bluetooth address is required for Bluetooth Full VSLE.")
        } elseif ($SetupInput.BluetoothAddress -notmatch '^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$') {
            $issues.Add("Bluetooth address must look like 00:16:53:AA:BB:CC.")
        }
    }

    if ($issues.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "needs_input"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "EV3 setup input is incomplete."
            Evidence = ($issues -join [Environment]::NewLine)
            Input = $SetupInput
        }
    }

    $evidence = @(
        "Transport: $($SetupInput.Transport)",
        "SSH target: $($SetupInput.User)@$($SetupInput.Host)",
        "Bluetooth address: $($SetupInput.RedactedBluetoothAddress)",
        "OfficialFirmwareCompatibility: false"
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = "passed"
        Blocking = $false
        ManualConfirmationRequired = $true
        Summary = "EV3 setup input is valid. Confirm before running SSH or SCP commands."
        Evidence = $evidence
        Input = $SetupInput
    }
}

function Get-VsleEv3ServerInstallSources {
    [CmdletBinding()]
    param(
        [string]$InstallRoot = (Get-VsleDefaultEv3InstallRoot)
    )

    $firmwareRoot = Join-Path $InstallRoot "shared/02-ev3-server/ev3-firmware"
    [PSCustomObject]@{
        FirmwareRoot = $firmwareRoot
        ServerPath = Join-Path $firmwareRoot "vsle_ev3_server.py"
        ScriptsPath = Join-Path $firmwareRoot "scripts"
        SystemdPath = Join-Path $firmwareRoot "systemd"
        WebsocketsPath = Join-Path $InstallRoot "shared/02-ev3-server/websockets-7.0.tar.gz"
    }
}

function Test-VsleEv3ServerInstallSources {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Sources
    )

    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($path in @(
        $Sources.ServerPath,
        $Sources.ScriptsPath,
        $Sources.SystemdPath,
        $Sources.WebsocketsPath
    )) {
        if (-not (Test-Path -LiteralPath $path)) {
            $missing.Add($path)
        }
    }

    if ($missing.Count -gt 0) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "EV3 server install sources are missing."
            Evidence = "Missing EV3 install source paths: $($missing -join ', ')"
        }
    }

    [PSCustomObject]@{
        Status = "passed"
        Blocking = $false
        ManualConfirmationRequired = $true
        Summary = "EV3 server install sources are present."
        Evidence = "EV3 firmware, scripts, systemd unit, and offline websockets tarball are present."
    }
}

function Get-VsleEv3InstallRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $trimChars = [char[]]@(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd($trimChars)
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if ($fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $fullPath.Substring($rootPath.Length).TrimStart($trimChars)
    } else {
        $relative = [System.IO.Path]::GetFileName($fullPath)
    }
    return ($relative -replace "\\", "/")
}

function New-VsleSha256TextHash {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha256.ComputeHash($bytes) | ForEach-Object {
            $_.ToString("x2")
        }) -join "")
    } finally {
        $sha256.Dispose()
    }
}

function New-VsleEv3InstallManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Sources
    )

    $firmwareRoot = [System.IO.Path]::GetFullPath($Sources.FirmwareRoot)
    $manifestRows = New-Object System.Collections.Generic.List[object]
    $sourceFiles = New-Object System.Collections.Generic.List[object]
    [void]$sourceFiles.Add((Get-Item -LiteralPath $Sources.ServerPath))
    foreach ($sourceRoot in @($Sources.ScriptsPath, $Sources.SystemdPath)) {
        foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse) {
            [void]$sourceFiles.Add($file)
        }
    }
    [void]$sourceFiles.Add((Get-Item -LiteralPath $Sources.WebsocketsPath))

    $websocketsFullPath = [System.IO.Path]::GetFullPath($Sources.WebsocketsPath)
    foreach ($file in $sourceFiles) {
        if ($file.FullName -eq $websocketsFullPath) {
            $relativePath = "websockets-7.0.tar.gz"
        } else {
            $relativePath = Get-VsleEv3InstallRelativePath `
                -Root $firmwareRoot `
                -Path $file.FullName
        }
        [void]$manifestRows.Add([PSCustomObject]@{
            RelativePath = $relativePath
            Sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    }

    $entryLines = @($manifestRows |
        Sort-Object RelativePath |
        ForEach-Object { "$($_.RelativePath)=$($_.Sha256)" })
    $manifestText = ($entryLines -join "`n")
    [PSCustomObject]@{
        PackageHash = New-VsleSha256TextHash -Text $manifestText
        Entries = $entryLines
        Text = $manifestText
    }
}

function New-VsleEv3RemoteInstallCommand {
    [CmdletBinding()]
    param(
        [string]$RemoteRoot = "~/vsle-ev3-firmware",
        [string]$InstallPackageHash = ""
    )

    $hashPrefix = ""
    if (-not [string]::IsNullOrWhiteSpace($InstallPackageHash)) {
        $hashPrefix = "VSLE_INSTALL_PACKAGE_HASH='$InstallPackageHash' "
    }
    return "cd $RemoteRoot && ${hashPrefix}bash ./scripts/windows_install_and_check.sh"
}

function New-VsleEv3FastPathProbeCommand {
    [CmdletBinding()]
    param(
        [string]$RemoteRoot = "~/vsle-ev3-firmware",
        [Parameter(Mandatory = $true)]
        [string]$InstallPackageHash
    )

    $manifestPath = "$RemoteRoot/.vsle-install-manifest"
    return @(
        "if [ -f $manifestPath ]",
        "&& grep -qx 'package_hash=$InstallPackageHash' $manifestPath",
        "&& systemctl is-active vsle-ev3-server.service >/dev/null 2>&1;",
        "then echo VSLE_FAST_PATH_READY;",
        "else echo VSLE_FAST_PATH_MISS;",
        "fi"
    ) -join " "
}

function New-VsleEv3ServerInstallPlan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$SetupInput,
        [string]$InstallRoot = (Get-VsleDefaultEv3InstallRoot),
        [string]$RemoteRoot = "~/vsle-ev3-firmware"
    )

    $inputResult = Test-VsleEv3SetupInput -SetupInput $SetupInput
    if ($inputResult.Status -ne "passed") {
        return $inputResult
    }

    $sources = Get-VsleEv3ServerInstallSources -InstallRoot $InstallRoot
    $sourceResult = Test-VsleEv3ServerInstallSources -Sources $sources
    if ($sourceResult.Status -ne "passed") {
        return $sourceResult
    }

    $sshTarget = "$($SetupInput.User)@$($SetupInput.Host)"
    $installManifest = New-VsleEv3InstallManifest -Sources $sources
    $remoteInstall = New-VsleEv3RemoteInstallCommand `
        -RemoteRoot $RemoteRoot `
        -InstallPackageHash $installManifest.PackageHash
    $fastPathProbe = New-VsleEv3FastPathProbeCommand `
        -RemoteRoot $RemoteRoot `
        -InstallPackageHash $installManifest.PackageHash

    $commandSteps = @(
        [PSCustomObject]@{
            Name = "check-existing-install"
            Executable = "ssh"
            Arguments = @($sshTarget, $fastPathProbe)
            Preview = "ssh $sshTarget 'check .vsle-install-manifest and vsle-ev3-server.service'"
            FastPathProbe = $true
        },
        [PSCustomObject]@{
            Name = "prepare-remote-root"
            Executable = "ssh"
            Arguments = @($sshTarget, "rm -rf $RemoteRoot && mkdir -p $RemoteRoot")
            Preview = "ssh $sshTarget 'rm -rf $RemoteRoot && mkdir -p $RemoteRoot'"
        },
        [PSCustomObject]@{
            Name = "copy-ev3-server-files"
            Executable = "scp"
            Arguments = @(
                "-r",
                $sources.ServerPath,
                $sources.ScriptsPath,
                $sources.SystemdPath,
                $sources.WebsocketsPath,
                "${sshTarget}:$RemoteRoot/"
            )
            Preview = "scp -r <ev3-firmware files> ${sshTarget}:$RemoteRoot/"
        },
        [PSCustomObject]@{
            Name = "install-and-check-service"
            Executable = "ssh"
            Arguments = @("-tt", $sshTarget, $remoteInstall)
            Preview = "ssh -tt $sshTarget '$remoteInstall'"
        }
    )

    $evidence = @(
        "Transport: $($SetupInput.Transport)",
        "SSH target: $sshTarget",
        "Bluetooth address: $($SetupInput.RedactedBluetoothAddress)",
        "Remote root: $RemoteRoot",
        "Install package hash: $($installManifest.PackageHash)",
        "Command count: $($commandSteps.Count)",
        "Fast path: existing matching manifest and active service skip full copy/install.",
        "Manual confirmation required before SSH or SCP commands run.",
        "OfficialFirmwareCompatibility: false"
    ) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "EV3 server install command plan is ready. Confirm before running SSH or SCP."
        Evidence = $evidence
        Input = $SetupInput
        Sources = $sources
        RemoteRoot = $RemoteRoot
        InstallManifest = $installManifest
        CommandSteps = $commandSteps
    }
}

function Convert-VsleNativeCommandOutputText {
    param(
        [AllowNull()]
        [object[]]$OutputObjects
    )

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($OutputObjects)) {
        if ($null -eq $item) {
            continue
        }

        if ($item -is [System.Management.Automation.ErrorRecord]) {
            if ($null -ne $item.Exception) {
                $message = [string]$item.Exception.Message
                if (-not [string]::IsNullOrWhiteSpace($message)) {
                    $lines.Add($message.Trim())
                }

                $errorType = [string]$item.Exception.GetType().FullName
                if (-not [string]::IsNullOrWhiteSpace($errorType)) {
                    $lines.Add("PowerShell error type: $errorType")
                }
            }

            $errorDetails = [string]$item.ErrorDetails
            if (-not [string]::IsNullOrWhiteSpace($errorDetails)) {
                $lines.Add($errorDetails.Trim())
            }

            $targetText = [string]$item.TargetObject
            if (-not [string]::IsNullOrWhiteSpace($targetText)) {
                $lines.Add($targetText.Trim())
            }

            $recordText = [string]$item
            if (-not [string]::IsNullOrWhiteSpace($recordText)) {
                $lines.Add($recordText.Trim())
            }

            $errorId = [string]$item.FullyQualifiedErrorId
            if (-not [string]::IsNullOrWhiteSpace($errorId)) {
                $lines.Add("FullyQualifiedErrorId: $errorId")
            }

            $category = [string]$item.CategoryInfo
            if (-not [string]::IsNullOrWhiteSpace($category)) {
                $lines.Add("CategoryInfo: $category")
            }

            if ($null -ne $item.InvocationInfo) {
                $position = [string]$item.InvocationInfo.PositionMessage
                if (-not [string]::IsNullOrWhiteSpace($position)) {
                    $lines.Add("Position: $position")
                }
            }
            continue
        }

        $text = [string]$item
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            $lines.Add($text.Trim())
        }
    }

    return (($lines | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_)
    } | Select-Object -Unique) -join [Environment]::NewLine).Trim()
}

function Invoke-VsleEv3NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $rawOutput = @(& $Executable @Arguments 2>&1)
        $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $output = Convert-VsleNativeCommandOutputText -OutputObjects $rawOutput
    [PSCustomObject]@{
        Executable = $Executable
        ExitCode = $exitCode
        Output = $output
    }
}

function Get-VsleEv3CommandExecutionRequest {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Step
    )

    $arguments = @($Step.Arguments)

    [PSCustomObject]@{
        Executable = [string]$Step.Executable
        Arguments = [string[]]$arguments
    }
}

function New-VsleUnicodeString {
    param(
        [Parameter(Mandatory = $true)]
        [int[]]$CodePoints
    )

    $builder = New-Object System.Text.StringBuilder
    foreach ($codePoint in $CodePoints) {
        [void]$builder.Append([char]$codePoint)
    }
    return $builder.ToString()
}

function Get-VsleEv3CommandFailureHint {
    param(
        [AllowNull()]
        [string]$Output
    )

    if ([string]::IsNullOrWhiteSpace($Output)) {
        return ""
    }

    if ($Output -match 'sudo:\s*3 incorrect password attempts') {
        $wrongEntry = New-VsleUnicodeString -CodePoints @(
            0x5bc6, 0x7801, 0x8f93, 0x5165, 0x9519, 0x8bef, 0x3002
        )
        $retryInstall = New-VsleUnicodeString -CodePoints @(
            0x8bf7, 0x91cd, 0x65b0, 0x70b9, 0x51fb, 0x786e,
            0x8ba4, 0x5b89, 0x88c5, 0xff1b, 0x51fa, 0x73b0
        )
        $typeAtPrompt = New-VsleUnicodeString -CodePoints @(
            0x65f6, 0x8f93, 0x5165
        )
        $userSecret = New-VsleUnicodeString -CodePoints @(
            0x7528, 0x6237, 0x5bc6, 0x7801, 0x3002
        )
        $hiddenEntry = New-VsleUnicodeString -CodePoints @(
            0x5bc6, 0x7801, 0x8f93, 0x5165, 0x65f6, 0x7a97,
            0x53e3, 0x4e0d, 0x4f1a, 0x663e, 0x793a, 0x5b57,
            0x7b26, 0xff0c, 0x8f93, 0x5165, 0x5b8c, 0x6210,
            0x540e, 0x6309
        )
        $sentenceStop = New-VsleUnicodeString -CodePoints @(0x3002)

        return @(
            ("EV3 sudo " + $wrongEntry),
            ($retryInstall + " [sudo] password for robot: " +
                $typeAtPrompt + " EV3 robot " + $userSecret),
            ($hiddenEntry + " Enter" + $sentenceStop)
        ) -join [Environment]::NewLine
    }

    return ""
}

function Format-VsleEv3CommandFailureEvidence {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Step,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $output = [string]$Result.Output
    if ([string]::IsNullOrWhiteSpace($output)) {
        $output = "No command output captured."
    }

    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add("Step $($Step.Name) failed with exit code $($Result.ExitCode).")
    $parts.Add("Executable: $($Step.Executable)")

    $hint = Get-VsleEv3CommandFailureHint -Output $output
    if (-not [string]::IsNullOrWhiteSpace($hint)) {
        $parts.Add((New-VsleUnicodeString -CodePoints @(
            0x53ef, 0x80fd, 0x539f, 0x56e0, 0x548c,
            0x5904, 0x7406, 0x65b9, 0x5f0f, 0x003a
        )))
        $parts.Add($hint)
    }

    $parts.Add("Command output:")
    $parts.Add($output)

    return ($parts.ToArray() -join [Environment]::NewLine)
}

function Invoke-VsleEv3ServerInstall {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Plan,
        [switch]$ConfirmEv3Install,
        [switch]$RunSshCommands,
        [AllowNull()]
        [scriptblock]$StatusUpdateScript
    )

    if (-not $ConfirmEv3Install) {
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Manual confirmation required before installing the EV3 server."
            Evidence = "Click Confirm EV3 Install before SSH or SCP commands run."
            Plan = $Plan
        }
    }

    if ($Plan.Status -ne "needs_manual_action") {
        $evidence = [string]$Plan.Evidence
        if ([string]::IsNullOrWhiteSpace($evidence)) {
            $evidence = "EV3 install did not provide diagnostic detail."
        }
        return [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "EV3 server install plan is not ready."
            Evidence = $evidence
            Plan = $Plan
        }
    }

    if (-not $RunSshCommands) {
        return [PSCustomObject]@{
            Status = "needs_manual_action"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "EV3 server install plan is confirmed; command execution was not requested."
            Evidence = "No SSH or SCP commands ran. Use the Windows wizard confirmation path to execute on a teacher machine with EV3 access."
            Plan = $Plan
        }
    }

    $results = New-Object System.Collections.Generic.List[object]
    $commandSteps = @($Plan.CommandSteps)
    $stepCount = $commandSteps.Count
    for ($stepOffset = 0; $stepOffset -lt $stepCount; $stepOffset++) {
        $step = $commandSteps[$stepOffset]
        $preview = ""
        if ($step.PSObject.Properties.Name -contains "Preview") {
            $preview = [string]$step.Preview
        }
        if ($null -ne $StatusUpdateScript) {
            & $StatusUpdateScript ([PSCustomObject]@{
                Name = [string]$step.Name
                StepIndex = $stepOffset + 1
                StepCount = $stepCount
                Executable = [string]$step.Executable
                Preview = $preview
                StartedAt = (Get-Date).ToString("o")
            })
        }
        $request = Get-VsleEv3CommandExecutionRequest `
            -Step $step
        $result = Invoke-VsleEv3NativeCommand `
            -Executable $request.Executable `
            -Arguments $request.Arguments
        $results.Add([PSCustomObject]@{
            Name = $step.Name
            Executable = $step.Executable
            ExitCode = $result.ExitCode
            Output = $result.Output
        })
        $isFastPathProbe = $false
        if ($step.PSObject.Properties.Name -contains "FastPathProbe") {
            $isFastPathProbe = [bool]$step.FastPathProbe
        }
        if (
            $isFastPathProbe -and
            $result.ExitCode -eq 0 -and
            $result.Output -match "VSLE_FAST_PATH_READY"
        ) {
            return [PSCustomObject]@{
                Status = "passed"
                Blocking = $false
                ManualConfirmationRequired = $false
                Summary = "EV3 server already matches this install package and service is active."
                Evidence = @(
                    "fast-path: matched",
                    "Remote .vsle-install-manifest matched the current package hash.",
                    "EV3 service check command completed: systemctl is-active vsle-ev3-server.service."
                ) -join [Environment]::NewLine
                Results = $results.ToArray()
                Plan = $Plan
            }
        }
        if ($result.ExitCode -ne 0) {
            $evidence = Format-VsleEv3CommandFailureEvidence -Step $step -Result $result
            return [PSCustomObject]@{
                Status = "blocked"
                Blocking = $true
                ManualConfirmationRequired = $true
                Summary = "EV3 server install command failed."
                Evidence = $evidence
                Results = $results.ToArray()
                Plan = $Plan
            }
        }
    }

    [PSCustomObject]@{
        Status = "passed"
        Blocking = $false
        ManualConfirmationRequired = $false
        Summary = "EV3 server install runner completed and service status check passed."
        Evidence = "EV3 service check command completed: systemctl is-active vsle-ev3-server.service."
        Results = $results.ToArray()
        Plan = $Plan
    }
}

function New-VsleBluetoothFullVslePairingGuide {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$SetupInput
    )

    if ($SetupInput.Transport -ne "bluetooth-full-vsle") {
        return [PSCustomObject]@{
            Status = "skipped"
            Blocking = $false
            ManualConfirmationRequired = $true
            Summary = "Bluetooth Full VSLE pairing guide is skipped for this transport."
            Evidence = "Selected transport: $($SetupInput.Transport)"
            Input = $SetupInput
        }
    }

    $validation = Test-VsleEv3SetupInput -SetupInput $SetupInput
    if ($validation.Status -ne "passed") {
        return $validation
    }

    [PSCustomObject]@{
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Bluetooth Full VSLE requires Windows Bluetooth pairing confirmation."
        Evidence = "Pair EV3 in Windows Bluetooth settings, confirm the EV3 is paired or connected, then continue. Bluetooth address: $($SetupInput.RedactedBluetoothAddress)."
        Input = $SetupInput
    }
}

Export-ModuleMember -Function New-VsleEv3SetupInput, Test-VsleEv3SetupInput, New-VsleEv3ServerInstallPlan, Invoke-VsleEv3ServerInstall, New-VsleBluetoothFullVslePairingGuide
