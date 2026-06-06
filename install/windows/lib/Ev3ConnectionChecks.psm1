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
    $remoteInstall = "cd $RemoteRoot && SITE=`"`$(python3 -c 'import site; print(site.USER_SITE)')`" && mkdir -p `"`$SITE`" && rm -rf /tmp/websockets-7.0 && tar -xzf websockets-7.0.tar.gz -C /tmp && rm -rf `"`$SITE/websockets`" && cp -r /tmp/websockets-7.0/src/websockets `"`$SITE/websockets`" && python3 -m py_compile vsle_ev3_server.py && SKIP_PIP_INSTALL=1 bash ./scripts/install.sh && systemctl is-active vsle-ev3-server.service"

    $commandSteps = @(
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
            Arguments = @($sshTarget, $remoteInstall)
            Preview = "ssh $sshTarget '$remoteInstall'"
        }
    )

    $evidence = @(
        "Transport: $($SetupInput.Transport)",
        "SSH target: $sshTarget",
        "Bluetooth address: $($SetupInput.RedactedBluetoothAddress)",
        "Remote root: $RemoteRoot",
        "Command count: $($commandSteps.Count)",
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
    }) -join [Environment]::NewLine).Trim()
}

function Invoke-VsleEv3NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $rawOutput = @(& $Executable @Arguments 2>&1)
    $output = Convert-VsleNativeCommandOutputText -OutputObjects $rawOutput
    $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
    [PSCustomObject]@{
        Executable = $Executable
        ExitCode = $exitCode
        Output = $output
    }
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

    return @(
        "Step $($Step.Name) failed with exit code $($Result.ExitCode).",
        "Executable: $($Step.Executable)",
        "Command output:",
        $output
    ) -join [Environment]::NewLine
}

function Invoke-VsleEv3ServerInstall {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$Plan,
        [switch]$ConfirmEv3Install,
        [switch]$RunSshCommands
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
    foreach ($step in $Plan.CommandSteps) {
        $result = Invoke-VsleEv3NativeCommand -Executable $step.Executable -Arguments $step.Arguments
        $results.Add([PSCustomObject]@{
            Name = $step.Name
            Executable = $step.Executable
            ExitCode = $result.ExitCode
            Output = $result.Output
        })
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
