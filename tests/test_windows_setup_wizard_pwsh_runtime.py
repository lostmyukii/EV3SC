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
        if ($ev3Plan.CommandSteps.Count -ne 3) {
            throw "EV3 plan command count was $($ev3Plan.CommandSteps.Count)"
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
        if ($installStep.Arguments[2] -notmatch "sudo -v") {
            throw "EV3 install remote command must validate sudo before systemd install"
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

        $stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
            "VSLE/pwsh-runtime/windows-release-evidence"
        $desktopStage = Prepare-VsleWindowsDesktopInstallStaging `
            -InstallRoot $installRoot `
            -StagingRoot $stagingRoot `
            -Force
        if ($desktopStage.Status -ne "needs_manual_action") {
            throw "desktop staging status was $($desktopStage.Status)"
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
