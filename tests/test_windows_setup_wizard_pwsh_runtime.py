import shutil
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_windows_setup_modules_run_under_powershell_core():
    pwsh = shutil.which("pwsh")
    assert pwsh, "PowerShell Core must be installed for this runtime smoke"

    script = textwrap.dedent(
        """
        $ErrorActionPreference = "Stop"
        Import-Module ./install/windows/lib/InstallFileChecks.psm1 -Force
        Import-Module ./install/windows/lib/WindowsInstallActions.psm1 -Force
        Import-Module ./install/windows/lib/Ev3ConnectionChecks.psm1 -Force

        $installRoot = (Resolve-Path ./install).Path

        $fileChecks = Invoke-VsleInstallFileChecks -InstallRoot $installRoot
        if ($fileChecks.Status -ne "passed") {
            throw "file checks status was $($fileChecks.Status)"
        }
        if ($fileChecks.Results.Count -lt 1) {
            throw "file checks did not return result rows"
        }

        $ev3Input = New-VsleEv3SetupInput `
            -Transport "wifi-full-vsle" `
            -Host "ev3dev.local" `
            -User "robot"
        $ev3Plan = New-VsleEv3ServerInstallPlan `
            -SetupInput $ev3Input `
            -InstallRoot $installRoot
        if ($ev3Plan.Status -ne "needs_manual_action") {
            throw "EV3 plan status was $($ev3Plan.Status)"
        }
        if ($ev3Plan.CommandSteps.Count -ne 4) {
            throw "EV3 plan command count was $($ev3Plan.CommandSteps.Count)"
        }
        $fastPathStep = $ev3Plan.CommandSteps |
            Where-Object { $_.Name -eq "check-existing-install" } |
            Select-Object -First 1
        if ($null -eq $fastPathStep) {
            throw "EV3 plan did not include check-existing-install"
        }
        if (-not [bool]$fastPathStep.FastPathProbe) {
            throw "EV3 fast path step was not marked as FastPathProbe"
        }
        if ($fastPathStep.Arguments[1] -notmatch "VSLE_FAST_PATH_READY") {
            throw "EV3 fast path command did not include ready marker"
        }
        if ($fastPathStep.Arguments[1] -notmatch [regex]::Escape(".vsle-install-manifest")) {
            throw "EV3 fast path command did not check the remote install manifest"
        }
        if (
            $null -eq $ev3Plan.InstallManifest -or
            [string]::IsNullOrWhiteSpace([string]$ev3Plan.InstallManifest.PackageHash) -or
            [string]$ev3Plan.InstallManifest.PackageHash -notmatch "^[0-9a-f]{64}$"
        ) {
            throw "EV3 plan did not include a stable install package hash"
        }
        $installStep = $ev3Plan.CommandSteps |
            Where-Object { $_.Name -eq "install-and-check-service" } |
            Select-Object -First 1
        if ($null -eq $installStep) {
            throw "EV3 plan did not include install-and-check-service"
        }
        if ($installStep.Arguments[0] -ne "-tt") {
            throw "EV3 install SSH step must allocate a tty for sudo"
        }
        if ($installStep.Arguments[2] -notmatch "bash ./scripts/windows_install_and_check.sh") {
            throw "EV3 install remote command must execute the copied remote install script"
        }
        if ($installStep.Arguments[2] -notmatch "VSLE_INSTALL_PACKAGE_HASH=") {
            throw "EV3 install remote command must pass the install package hash"
        }
        if ($installStep.Arguments[2] -match "bash -s") {
            throw "EV3 install remote command must not stream a complex script through stdin"
        }
        if ($installStep.PSObject.Properties.Name -contains "SudoPasswordArgumentIndex") {
            throw "EV3 install SSH step must not inject sudo password through native stdin"
        }
        if ($installStep.Arguments[2] -match "SKIP_PIP_INSTALL=1 bash ./scripts/install.sh && systemctl") {
            throw "EV3 install remote command must not hide systemd checks behind the install script"
        }
        if ($installStep.Arguments -join " " -match "maker") {
            throw "EV3 install remote command must not hard-code the default password"
        }

        $quote = [char]34
        $childCommand = "Write-Error ${quote}remote permission denied from EV3${quote}; exit 44"
        $ev3FailureStep = [pscustomobject]@{
            Name = "simulate-native-stderr"
            Executable = "pwsh"
            Arguments = @("-NoLogo", "-NoProfile", "-Command", $childCommand)
        }
        $ev3FailurePlan = [pscustomobject]@{
            Status = "needs_manual_action"
            CommandSteps = @($ev3FailureStep)
        }
        $ev3Failure = Invoke-VsleEv3ServerInstall `
            -Plan $ev3FailurePlan `
            -ConfirmEv3Install `
            -RunSshCommands
        if ($ev3Failure.Status -ne "blocked") {
            throw "EV3 simulated failure status was $($ev3Failure.Status)"
        }
        if ($ev3Failure.Evidence -notmatch "remote permission denied from EV3") {
            throw "EV3 simulated failure evidence did not include native stderr: $($ev3Failure.Evidence)"
        }
        if ($ev3Failure.Evidence.Trim() -eq "System.Management.Automation.RemoteException") {
            throw "EV3 simulated failure evidence collapsed to RemoteException"
        }

        $fastPathPlan = [pscustomobject]@{
            Status = "needs_manual_action"
            CommandSteps = @(
                [pscustomobject]@{
                    Name = "check-existing-install"
                    Executable = "pwsh"
                    Arguments = @("-NoLogo", "-NoProfile", "-Command", "Write-Output VSLE_FAST_PATH_READY; exit 0")
                    Preview = "check existing EV3 install manifest"
                    FastPathProbe = $true
                },
                [pscustomobject]@{
                    Name = "slow-step-should-not-run"
                    Executable = "pwsh"
                    Arguments = @("-NoLogo", "-NoProfile", "-Command", "throw 'slow step ran'")
                    Preview = "slow step"
                }
            )
        }
        $fastPathResult = Invoke-VsleEv3ServerInstall `
            -Plan $fastPathPlan `
            -ConfirmEv3Install `
            -RunSshCommands
        if ($fastPathResult.Status -ne "passed") {
            throw "EV3 fast path status was $($fastPathResult.Status): $($fastPathResult.Evidence)"
        }
        if ($fastPathResult.Results.Count -ne 1) {
            throw "EV3 fast path should stop after one command, but ran $($fastPathResult.Results.Count)"
        }
        if ($fastPathResult.Evidence -notmatch "fast-path: matched") {
            throw "EV3 fast path evidence did not record the matched fast path: $($fastPathResult.Evidence)"
        }

        $statusEvents = New-Object System.Collections.Generic.List[object]
        $statusCallback = {
            param($event)
            $statusEvents.Add($event)
        }
        $statusPlan = [pscustomobject]@{
            Status = "needs_manual_action"
            CommandSteps = @(
                [pscustomobject]@{
                    Name = "status-step-one"
                    Executable = "pwsh"
                    Arguments = @("-NoLogo", "-NoProfile", "-Command", "exit 0")
                    Preview = "status step one"
                },
                [pscustomobject]@{
                    Name = "status-step-two"
                    Executable = "pwsh"
                    Arguments = @("-NoLogo", "-NoProfile", "-Command", "exit 0")
                    Preview = "status step two"
                }
            )
        }
        $statusResult = Invoke-VsleEv3ServerInstall `
            -Plan $statusPlan `
            -ConfirmEv3Install `
            -RunSshCommands `
            -StatusUpdateScript $statusCallback
        if ($statusResult.Status -ne "passed") {
            throw "EV3 status callback plan failed: $($statusResult.Evidence)"
        }
        if ($statusEvents.Count -ne 2) {
            throw "EV3 status callback count was $($statusEvents.Count)"
        }
        if (
            $statusEvents[0].Name -ne "status-step-one" -or
            $statusEvents[0].StepIndex -ne 1 -or
            $statusEvents[0].StepCount -ne 2 -or
            $statusEvents[0].Preview -ne "status step one" -or
            [string]::IsNullOrWhiteSpace([string]$statusEvents[0].StartedAt)
        ) {
            throw "first EV3 status callback payload was wrong: $($statusEvents[0] | ConvertTo-Json -Depth 8)"
        }
        if (
            $statusEvents[1].Name -ne "status-step-two" -or
            $statusEvents[1].StepIndex -ne 2 -or
            $statusEvents[1].StepCount -ne 2
        ) {
            throw "second EV3 status callback payload was wrong: $($statusEvents[1] | ConvertTo-Json -Depth 8)"
        }

        $stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
            "VSLE/pwsh-runtime/windows-release-evidence"
        $desktopStage = Prepare-VsleWindowsDesktopInstallStaging `
            -InstallRoot $installRoot `
            -StagingRoot $stagingRoot `
            -Force
        if ($desktopStage.Status -ne "needs_manual_action") {
            throw "desktop staging status was $($desktopStage.Status)"
        }

        $desktopInstallTarget = Join-Path `
            ([System.IO.Path]::GetTempPath()) `
            "VSLE/pwsh-runtime/installed/WeisileLink"
        if (Test-Path -LiteralPath $desktopInstallTarget) {
            Remove-Item -LiteralPath $desktopInstallTarget -Recurse -Force
        }
        [void](New-Item -ItemType Directory -Path $desktopInstallTarget -Force)
        Set-Content `
            -Path (Join-Path $desktopInstallTarget "WeisileLink.exe") `
            -Value "old-executable" `
            -Encoding ASCII
        $desktopStage.Plan.TargetRoot = $desktopInstallTarget
        $desktopInstall = Invoke-VsleWindowsDesktopInstallExecution `
            -Plan $desktopStage.Plan `
            -ConfirmInstall `
            -Force
        if ($desktopInstall.Status -ne "passed") {
            throw "desktop forced replacement status was $($desktopInstall.Status): $($desktopInstall.Evidence)"
        }
        if (-not (Test-Path -LiteralPath (Join-Path $desktopInstallTarget "install.ps1"))) {
            throw "desktop forced replacement did not copy install.ps1"
        }

        $targetRoot = Join-Path `
            ([System.IO.Path]::GetTempPath()) `
            "VSLE/pwsh-runtime/Programs/VSLE/WeisileLink"
        $targetExe = Join-Path $targetRoot "WeisileLink.exe"
        $otherExe = Join-Path `
            ([System.IO.Path]::GetTempPath()) `
            "VSLE/other/WeisileLink.exe"
        $global:vsleUpgradeProcesses = @(
            [pscustomobject]@{
                ProcessId = 4101
                ExecutablePath = $targetExe
            },
            [pscustomobject]@{
                ProcessId = 4102
                ExecutablePath = $otherExe
            }
        )
        $global:vsleStoppedUpgradeProcessIds = @()
        $lookupUpgradeProcesses = {
            return @($global:vsleUpgradeProcesses)
        }
        $stopUpgradeProcess = {
            param($process)
            $global:vsleStoppedUpgradeProcessIds += [int]$process.ProcessId
            $global:vsleUpgradeProcesses = @(
                $global:vsleUpgradeProcesses |
                    Where-Object {
                        [int]$_.ProcessId -ne [int]$process.ProcessId
                    }
            )
        }
        $noSleep = { param($milliseconds) }
        $upgradeStop = Stop-VsleWindowsDesktopProcessesForUpgrade `
            -TargetRoot $targetRoot `
            -TimeoutMs 50 `
            -ProcessLookup $lookupUpgradeProcesses `
            -StopProcessAction $stopUpgradeProcess `
            -SleepAction $noSleep
        if ($upgradeStop.Status -ne "passed") {
            throw "desktop upgrade process stop status was $($upgradeStop.Status): $($upgradeStop.Evidence)"
        }
        if (
            $global:vsleStoppedUpgradeProcessIds.Count -ne 1 -or
            $global:vsleStoppedUpgradeProcessIds[0] -ne 4101
        ) {
            throw "desktop upgrade stopped the wrong process IDs: $($global:vsleStoppedUpgradeProcessIds -join ',')"
        }
        if ($upgradeStop.Evidence -notmatch "4101") {
            throw "desktop upgrade stop evidence did not include stopped PID"
        }

        $global:vsleUpgradeProcesses = @(
            [pscustomobject]@{
                ProcessId = 4201
                ExecutablePath = $targetExe
            }
        )
        $neverStops = { param($process) }
        $upgradeBlocked = Stop-VsleWindowsDesktopProcessesForUpgrade `
            -TargetRoot $targetRoot `
            -TimeoutMs 0 `
            -ProcessLookup $lookupUpgradeProcesses `
            -StopProcessAction $neverStops `
            -SleepAction $noSleep
        if ($upgradeBlocked.Status -ne "blocked") {
            throw "desktop upgrade locked process status was $($upgradeBlocked.Status)"
        }
        if (
            $upgradeBlocked.Evidence -notmatch "4201" -or
            $upgradeBlocked.Evidence -notmatch [regex]::Escape($targetExe)
        ) {
            throw "desktop upgrade locked evidence omitted PID or target path: $($upgradeBlocked.Evidence)"
        }

        $wifiBridgePlan = Get-VsleWindowsDesktopBridgePlan -Ev3SetupInput $ev3Input
        if ($wifiBridgePlan.LaunchMode -ne "direct-runtime") {
            throw "WiFi bridge plan launch mode was $($wifiBridgePlan.LaunchMode)"
        }
        if ($wifiBridgePlan.Arguments.Count -ne 0) {
            throw "WiFi bridge plan should not use desktop-supervise arguments: $($wifiBridgePlan.ArgumentLine)"
        }
        if ($wifiBridgePlan.Environment.WEISILE_TRANSPORT -ne "wifi") {
            throw "WiFi bridge plan did not set WEISILE_TRANSPORT=wifi"
        }
        if ($wifiBridgePlan.Environment.EV3_IP -ne "ev3dev.local") {
            throw "WiFi bridge plan did not preserve EV3_IP"
        }
        if ($wifiBridgePlan.Environment.EV3_WS_PORT -ne "8765") {
            throw "WiFi bridge plan did not set EV3_WS_PORT"
        }

        $bluetoothInput = New-VsleEv3SetupInput `
            -Transport "bluetooth-full-vsle" `
            -Host "ev3dev.local" `
            -User "robot" `
            -BluetoothAddress "00:16:53:AA:BB:CC"
        $bluetoothBridgePlan = Get-VsleWindowsDesktopBridgePlan -Ev3SetupInput $bluetoothInput
        if ($bluetoothBridgePlan.LaunchMode -ne "direct-runtime") {
            throw "Bluetooth bridge plan launch mode was $($bluetoothBridgePlan.LaunchMode)"
        }
        if ($bluetoothBridgePlan.Arguments.Count -ne 0) {
            throw "Bluetooth bridge plan should not use desktop-supervise arguments: $($bluetoothBridgePlan.ArgumentLine)"
        }
        if ($bluetoothBridgePlan.Environment.WEISILE_TRANSPORT -ne "vsle-bluetooth") {
            throw "Bluetooth bridge plan did not set WEISILE_TRANSPORT=vsle-bluetooth"
        }
        if ($bluetoothBridgePlan.Environment.EV3_BT -ne "00:16:53:AA:BB:CC") {
            throw "Bluetooth bridge plan did not preserve EV3_BT"
        }
        if ($bluetoothBridgePlan.Environment.EV3_IP -ne "ev3dev.local") {
            throw "Bluetooth bridge plan did not keep EV3_IP for fallback"
        }

        "pwsh-runtime-ok"
        """
    )

    result = subprocess.run(
        [pwsh, "-NoLogo", "-NoProfile", "-Command", script],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "pwsh-runtime-ok" in result.stdout
