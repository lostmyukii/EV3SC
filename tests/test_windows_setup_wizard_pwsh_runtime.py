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

        $stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
            "VSLE/pwsh-runtime/windows-release-evidence"
        $desktopStage = Prepare-VsleWindowsDesktopInstallStaging `
            -InstallRoot $installRoot `
            -StagingRoot $stagingRoot `
            -Force
        if ($desktopStage.Status -ne "needs_manual_action") {
            throw "desktop staging status was $($desktopStage.Status)"
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
